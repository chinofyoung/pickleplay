-- ===== 0001_core_schema =====

-- profiles
create type user_role as enum ('player','owner','admin');
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'player',
  full_name text,
  contact_number text,
  created_at timestamptz default now()
);

create type club_status as enum ('pending','approved','rejected');
create table clubs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  city text,
  area text,
  address text,
  amenities text[] default '{}',
  status club_status not null default 'pending',
  created_at timestamptz default now()
);

create table club_payment_qrs (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  label text not null,
  image_path text not null
);

create table courts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  name text not null,
  hourly_rate numeric(10,2) not null check (hourly_rate >= 0),
  open_hour int not null check (open_hour between 0 and 23),
  close_hour int not null check (close_hour between 1 and 24),
  check (close_hour > open_hour),
  created_at timestamptz default now()
);

create type booking_status as enum
  ('pending_payment','proof_submitted','confirmed','rejected','cancelled');
create table bookings (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references courts(id) on delete cascade,
  player_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  start_hour int not null check (start_hour between 0 and 23),
  end_hour int not null check (end_hour between 1 and 24),
  total_price numeric(10,2) not null,
  status booking_status not null default 'pending_payment',
  payment_proof_path text,
  rejection_reason text,
  expires_at timestamptz,
  created_at timestamptz default now(),
  check (end_hour > start_hour)
);
create index on bookings (court_id, date);

-- ===== 0002_profile_trigger =====

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ===== 0003_rls =====

alter table profiles enable row level security;
alter table clubs enable row level security;
alter table courts enable row level security;
alter table club_payment_qrs enable row level security;
alter table bookings enable row level security;

create function is_admin() returns boolean language sql stable security definer
set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- profiles
create policy profiles_self_read on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update using (id = auth.uid());

-- clubs
create policy clubs_public_read on clubs for select using (status = 'approved' or owner_id = auth.uid() or is_admin());
create policy clubs_owner_write on clubs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy clubs_admin_write on clubs for update using (is_admin());

-- courts
create policy courts_public_read on courts for select using (
  exists(select 1 from clubs c where c.id = club_id and (c.status='approved' or c.owner_id=auth.uid() or is_admin()))
);
create policy courts_owner_write on courts for all using (
  exists(select 1 from clubs c where c.id = club_id and c.owner_id = auth.uid())
) with check (
  exists(select 1 from clubs c where c.id = club_id and c.owner_id = auth.uid())
);

-- qrs
create policy qrs_public_read on club_payment_qrs for select using (
  exists(select 1 from clubs c where c.id = club_id and (c.status='approved' or c.owner_id=auth.uid() or is_admin()))
);
create policy qrs_owner_write on club_payment_qrs for all using (
  exists(select 1 from clubs c where c.id = club_id and c.owner_id = auth.uid())
) with check (
  exists(select 1 from clubs c where c.id = club_id and c.owner_id = auth.uid())
);

-- bookings
create policy bookings_player_rw on bookings for all using (player_id = auth.uid()) with check (player_id = auth.uid());
create policy bookings_owner_read on bookings for select using (
  exists(select 1 from courts ct join clubs c on c.id=ct.club_id where ct.id=court_id and c.owner_id=auth.uid())
);
create policy bookings_owner_update on bookings for update using (
  exists(select 1 from courts ct join clubs c on c.id=ct.club_id where ct.id=court_id and c.owner_id=auth.uid())
);
create policy bookings_admin_all on bookings for all using (is_admin());

-- ===== 0004_storage =====

insert into storage.buckets (id, name, public) values
  ('payment-qrs','payment-qrs', true),
  ('payment-proofs','payment-proofs', false)
on conflict do nothing;

create policy proofs_read on storage.objects for select using (
  bucket_id = 'payment-proofs' and (
    is_admin() or owner = auth.uid() or exists(
      select 1 from bookings b join courts ct on ct.id=b.court_id join clubs c on c.id=ct.club_id
      where b.payment_proof_path = storage.objects.name and (b.player_id=auth.uid() or c.owner_id=auth.uid())
    )
  )
);
create policy proofs_write on storage.objects for insert with check (
  bucket_id = 'payment-proofs' and auth.uid() is not null
);
create policy qrs_write on storage.objects for insert with check (
  bucket_id = 'payment-qrs' and auth.uid() is not null
);

-- ===== 0005_expire_cron =====

create or replace function expire_pending_bookings()
returns void language sql as $$
  update bookings set status = 'cancelled'
  where status = 'pending_payment' and expires_at is not null and expires_at < now();
$$;

-- requires pg_cron extension (enable in Supabase dashboard)
select cron.schedule('expire-pending-bookings', '* * * * *', $$select expire_pending_bookings();$$);

-- ===== 0006_profile_name_fix =====

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end; $$;

-- ===== 0007_booking_overlap_constraint =====

create extension if not exists btree_gist;

alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    court_id with =,
    date with =,
    int4range(start_hour, end_hour) with &&
  )
  where (status in ('pending_payment','proof_submitted','confirmed'));

-- ===== 0008_security_hardening =====

-- C1: prevent role self-escalation — freeze role on self-update
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from profiles p where p.id = auth.uid()));

-- bookings_owner_update: add missing with check
drop policy if exists bookings_owner_update on bookings;
create policy bookings_owner_update on bookings for update using (
  exists(select 1 from courts ct join clubs c on c.id=ct.club_id where ct.id=court_id and c.owner_id=auth.uid())
) with check (
  exists(select 1 from courts ct join clubs c on c.id=ct.club_id where ct.id=court_id and c.owner_id=auth.uid())
);

-- H4: tighten storage write policies to enforce path ownership at the DB layer
drop policy if exists proofs_write on storage.objects;
create policy proofs_write on storage.objects for insert with check (
  bucket_id = 'payment-proofs' and auth.uid() is not null and
  exists(select 1 from bookings b where b.id::text = split_part(name,'/',1) and b.player_id = auth.uid())
);
drop policy if exists proofs_update on storage.objects;
create policy proofs_update on storage.objects for update using (
  bucket_id = 'payment-proofs' and
  exists(select 1 from bookings b where b.id::text = split_part(name,'/',1) and b.player_id = auth.uid())
) with check (
  bucket_id = 'payment-proofs' and
  exists(select 1 from bookings b where b.id::text = split_part(name,'/',1) and b.player_id = auth.uid())
);

drop policy if exists qrs_write on storage.objects;
create policy qrs_write on storage.objects for insert with check (
  bucket_id = 'payment-qrs' and auth.uid() is not null and
  exists(select 1 from clubs c where c.id::text = split_part(name,'/',1) and c.owner_id = auth.uid())
);
drop policy if exists qrs_update on storage.objects;
create policy qrs_update on storage.objects for update using (
  bucket_id = 'payment-qrs' and
  exists(select 1 from clubs c where c.id::text = split_part(name,'/',1) and c.owner_id = auth.uid())
) with check (
  bucket_id = 'payment-qrs' and
  exists(select 1 from clubs c where c.id::text = split_part(name,'/',1) and c.owner_id = auth.uid())
);

-- M3: run the expiry function with definer rights and a fixed search_path
create or replace function expire_pending_bookings()
returns void language sql security definer set search_path = public as $$
  update bookings set status = 'cancelled'
  where status = 'pending_payment' and expires_at is not null and expires_at < now();
$$;

-- ===== 0009_owner_role_via_trigger =====

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  desired_role user_role;
begin
  desired_role := case when new.raw_user_meta_data->>'role' = 'owner' then 'owner'::user_role else 'player'::user_role end;
  insert into profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(new.email, '@', 1)
    ),
    desired_role
  );
  return new;
end; $$;

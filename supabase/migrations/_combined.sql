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

create type pickleball_court_status as enum ('pending','approved','rejected');
create table pickleball_courts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  city text,
  area text,
  address text,
  amenities text[] default '{}',
  status pickleball_court_status not null default 'pending',
  created_at timestamptz default now()
);

create table pickleball_court_payment_qrs (
  id uuid primary key default gen_random_uuid(),
  pickleball_court_id uuid not null references pickleball_courts(id) on delete cascade,
  label text not null,
  image_path text not null
);

create table courts (
  id uuid primary key default gen_random_uuid(),
  pickleball_court_id uuid not null references pickleball_courts(id) on delete cascade,
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
alter table pickleball_courts enable row level security;
alter table courts enable row level security;
alter table pickleball_court_payment_qrs enable row level security;
alter table bookings enable row level security;

create function is_admin() returns boolean language sql stable security definer
set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- profiles
create policy profiles_self_read on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update using (id = auth.uid());

-- pickleball_courts
create policy pickleball_courts_public_read on pickleball_courts for select using (status = 'approved' or owner_id = auth.uid() or is_admin());
create policy pickleball_courts_owner_write on pickleball_courts for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy pickleball_courts_admin_write on pickleball_courts for update using (is_admin());

-- courts
create policy courts_public_read on courts for select using (
  exists(select 1 from pickleball_courts pc where pc.id = pickleball_court_id and (pc.status='approved' or pc.owner_id=auth.uid() or is_admin()))
);
create policy courts_owner_write on courts for all using (
  exists(select 1 from pickleball_courts pc where pc.id = pickleball_court_id and pc.owner_id = auth.uid())
) with check (
  exists(select 1 from pickleball_courts pc where pc.id = pickleball_court_id and pc.owner_id = auth.uid())
);

-- qrs
create policy qrs_public_read on pickleball_court_payment_qrs for select using (
  exists(select 1 from pickleball_courts pc where pc.id = pickleball_court_id and (pc.status='approved' or pc.owner_id=auth.uid() or is_admin()))
);
create policy qrs_owner_write on pickleball_court_payment_qrs for all using (
  exists(select 1 from pickleball_courts pc where pc.id = pickleball_court_id and pc.owner_id = auth.uid())
) with check (
  exists(select 1 from pickleball_courts pc where pc.id = pickleball_court_id and pc.owner_id = auth.uid())
);

-- bookings
create policy bookings_player_rw on bookings for all using (player_id = auth.uid()) with check (player_id = auth.uid());
create policy bookings_owner_read on bookings for select using (
  exists(select 1 from courts ct join pickleball_courts pc on pc.id=ct.pickleball_court_id where ct.id=court_id and pc.owner_id=auth.uid())
);
create policy bookings_owner_update on bookings for update using (
  exists(select 1 from courts ct join pickleball_courts pc on pc.id=ct.pickleball_court_id where ct.id=court_id and pc.owner_id=auth.uid())
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
      select 1 from bookings b join courts ct on ct.id=b.court_id join pickleball_courts pc on pc.id=ct.pickleball_court_id
      where b.payment_proof_path = storage.objects.name and (b.player_id=auth.uid() or pc.owner_id=auth.uid())
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
  exists(select 1 from courts ct join pickleball_courts pc on pc.id=ct.pickleball_court_id where ct.id=court_id and pc.owner_id=auth.uid())
) with check (
  exists(select 1 from courts ct join pickleball_courts pc on pc.id=ct.pickleball_court_id where ct.id=court_id and pc.owner_id=auth.uid())
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
  exists(select 1 from pickleball_courts pc where pc.id::text = split_part(name,'/',1) and pc.owner_id = auth.uid())
);
drop policy if exists qrs_update on storage.objects;
create policy qrs_update on storage.objects for update using (
  bucket_id = 'payment-qrs' and
  exists(select 1 from pickleball_courts pc where pc.id::text = split_part(name,'/',1) and pc.owner_id = auth.uid())
) with check (
  bucket_id = 'payment-qrs' and
  exists(select 1 from pickleball_courts pc where pc.id::text = split_part(name,'/',1) and pc.owner_id = auth.uid())
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

-- ===== 0010_owner_applications =====

create type application_status as enum ('pending','approved','rejected');

create table owner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  business_name text not null,
  contact_number text not null,
  city text not null,
  area text,
  message text,
  status application_status not null default 'pending',
  rejection_reason text,
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

create unique index owner_applications_one_pending
  on owner_applications (user_id) where status = 'pending';

alter table owner_applications enable row level security;

create policy applications_self_insert on owner_applications
  for insert with check (user_id = auth.uid());
create policy applications_self_read on owner_applications
  for select using (user_id = auth.uid() or is_admin());

create or replace function approve_owner_application(app_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare applicant uuid;
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  update owner_applications set status='approved', reviewed_at=now()
    where id = app_id and status='pending'
    returning user_id into applicant;
  if applicant is null then raise exception 'application not found or not pending'; end if;
  update profiles set role='owner' where id = applicant;
end; $$;

create or replace function reject_owner_application(app_id uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  update owner_applications set status='rejected', rejection_reason=reason, reviewed_at=now()
    where id = app_id and status='pending';
end; $$;

grant execute on function approve_owner_application(uuid) to authenticated;
grant execute on function reject_owner_application(uuid, text) to authenticated;

-- ===== 0011_pickleball_courts_default_approved =====

alter table pickleball_courts alter column status set default 'approved';

-- ===== 0012_signup_role_revert =====

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

-- ===== 0013_court_image =====

-- ===== 0014_court_location_and_contact =====

alter table pickleball_courts add column if not exists lat double precision;

alter table pickleball_courts add column if not exists lng double precision;

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, contact_number)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(new.email, '@', 1)
    ),
    nullif(new.raw_user_meta_data->>'contact_number', '')
  );
  return new;
end; $$;

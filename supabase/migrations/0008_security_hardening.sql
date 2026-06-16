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

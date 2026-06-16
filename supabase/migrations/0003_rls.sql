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

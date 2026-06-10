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

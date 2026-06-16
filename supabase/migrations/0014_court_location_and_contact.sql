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

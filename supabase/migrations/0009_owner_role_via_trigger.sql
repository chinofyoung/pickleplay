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

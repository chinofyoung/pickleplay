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

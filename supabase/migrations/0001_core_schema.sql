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

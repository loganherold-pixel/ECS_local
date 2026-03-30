create extension if not exists pgcrypto;

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text,
  status text default 'draft',
  start_at timestamptz,
  end_at timestamptz,
  origin text,
  destination text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.waypoints (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade,
  user_id uuid,
  title text,
  description text,
  latitude double precision,
  longitude double precision,
  sequence integer default 0,
  eta timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.load_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  vehicle_id uuid,
  trip_id uuid references public.trips(id) on delete cascade,
  name text not null,
  category text,
  quantity numeric default 1,
  weight numeric default 0,
  unit text,
  container text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.load_map_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  vehicle_id uuid,
  trip_id uuid references public.trips(id) on delete cascade,
  slot_key text not null,
  slot_label text,
  item_id uuid references public.load_items(id) on delete set null,
  quantity numeric default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  trip_id uuid references public.trips(id) on delete cascade,
  log_type text not null,
  amount numeric default 0,
  unit text,
  notes text,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.risk_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  trip_id uuid references public.trips(id) on delete cascade,
  score numeric default 0,
  risk_level text,
  factors jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trips_user_id on public.trips(user_id);
create index if not exists idx_waypoints_trip_id on public.waypoints(trip_id);
create index if not exists idx_load_items_trip_id on public.load_items(trip_id);
create index if not exists idx_load_map_slots_trip_id on public.load_map_slots(trip_id);
create index if not exists idx_fuel_water_logs_trip_id on public.fuel_water_logs(trip_id);
create index if not exists idx_risk_scores_trip_id on public.risk_scores(trip_id);
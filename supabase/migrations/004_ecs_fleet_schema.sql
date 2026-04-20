create extension if not exists pgcrypto;

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'vehicle',
  make text,
  model text,
  year integer,
  notes text,
  fuel_tank_capacity_gal double precision,
  avg_mpg double precision,
  current_fuel_percent double precision default 100,
  water_capacity_gal double precision,
  current_water_gal double precision default 0,
  water_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loadouts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  name text not null,
  description text,
  mode text not null default 'trip',
  operating_profile text,
  people_count integer default 1,
  trip_length_days integer,
  total_weight_lbs double precision,
  item_count integer not null default 0,
  loadout_view_mode text not null default 'basic',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loadout_items (
  id uuid primary key default gen_random_uuid(),
  loadout_id uuid not null references public.loadouts(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'general',
  quantity integer not null default 1,
  is_critical boolean not null default false,
  is_packed boolean not null default false,
  storage_location text,
  notes text,
  weight_lbs double precision,
  weight_source text not null default 'estimate',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vehicles add column if not exists id uuid default gen_random_uuid();
alter table public.vehicles add column if not exists owner_user_id uuid;
alter table public.vehicles add column if not exists name text;
alter table public.vehicles add column if not exists type text default 'vehicle';
alter table public.vehicles add column if not exists make text;
alter table public.vehicles add column if not exists model text;
alter table public.vehicles add column if not exists year integer;
alter table public.vehicles add column if not exists notes text;
alter table public.vehicles add column if not exists fuel_tank_capacity_gal double precision;
alter table public.vehicles add column if not exists avg_mpg double precision;
alter table public.vehicles add column if not exists current_fuel_percent double precision default 100;
alter table public.vehicles add column if not exists water_capacity_gal double precision;
alter table public.vehicles add column if not exists current_water_gal double precision default 0;
alter table public.vehicles add column if not exists water_updated_at timestamptz;
alter table public.vehicles add column if not exists created_at timestamptz not null default now();
alter table public.vehicles add column if not exists updated_at timestamptz not null default now();
alter table public.vehicles alter column id set default gen_random_uuid();
alter table public.vehicles alter column created_at set default now();
alter table public.vehicles alter column updated_at set default now();

alter table public.loadouts add column if not exists id uuid default gen_random_uuid();
alter table public.loadouts add column if not exists owner_user_id uuid;
alter table public.loadouts add column if not exists vehicle_id uuid;
alter table public.loadouts add column if not exists name text;
alter table public.loadouts add column if not exists description text;
alter table public.loadouts add column if not exists mode text default 'trip';
alter table public.loadouts add column if not exists operating_profile text;
alter table public.loadouts add column if not exists people_count integer default 1;
alter table public.loadouts add column if not exists trip_length_days integer;
alter table public.loadouts add column if not exists total_weight_lbs double precision;
alter table public.loadouts add column if not exists item_count integer not null default 0;
alter table public.loadouts add column if not exists loadout_view_mode text default 'basic';
alter table public.loadouts add column if not exists created_at timestamptz not null default now();
alter table public.loadouts add column if not exists updated_at timestamptz not null default now();
alter table public.loadouts alter column id set default gen_random_uuid();
alter table public.loadouts alter column created_at set default now();
alter table public.loadouts alter column updated_at set default now();

alter table public.loadout_items add column if not exists id uuid default gen_random_uuid();
alter table public.loadout_items add column if not exists loadout_id uuid;
alter table public.loadout_items add column if not exists owner_user_id uuid;
alter table public.loadout_items add column if not exists name text;
alter table public.loadout_items add column if not exists category text default 'general';
alter table public.loadout_items add column if not exists quantity integer not null default 1;
alter table public.loadout_items add column if not exists is_critical boolean not null default false;
alter table public.loadout_items add column if not exists is_packed boolean not null default false;
alter table public.loadout_items add column if not exists storage_location text;
alter table public.loadout_items add column if not exists notes text;
alter table public.loadout_items add column if not exists weight_lbs double precision;
alter table public.loadout_items add column if not exists weight_source text default 'estimate';
alter table public.loadout_items add column if not exists sort_order integer not null default 0;
alter table public.loadout_items add column if not exists created_at timestamptz not null default now();
alter table public.loadout_items add column if not exists updated_at timestamptz not null default now();
alter table public.loadout_items alter column id set default gen_random_uuid();
alter table public.loadout_items alter column created_at set default now();
alter table public.loadout_items alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicles_pkey'
  ) then
    alter table public.vehicles
      add constraint vehicles_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'loadouts_pkey'
  ) then
    alter table public.loadouts
      add constraint loadouts_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'loadout_items_pkey'
  ) then
    alter table public.loadout_items
      add constraint loadout_items_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicles_owner_user_id_fkey'
  ) then
    alter table public.vehicles
      add constraint vehicles_owner_user_id_fkey
      foreign key (owner_user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'loadouts_owner_user_id_fkey'
  ) then
    alter table public.loadouts
      add constraint loadouts_owner_user_id_fkey
      foreign key (owner_user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'loadouts_vehicle_id_fkey'
  ) then
    alter table public.loadouts
      add constraint loadouts_vehicle_id_fkey
      foreign key (vehicle_id) references public.vehicles(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'loadout_items_owner_user_id_fkey'
  ) then
    alter table public.loadout_items
      add constraint loadout_items_owner_user_id_fkey
      foreign key (owner_user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'loadout_items_loadout_id_fkey'
  ) then
    alter table public.loadout_items
      add constraint loadout_items_loadout_id_fkey
      foreign key (loadout_id) references public.loadouts(id) on delete cascade;
  end if;
end $$;

create index if not exists idx_vehicles_owner_user_id on public.vehicles(owner_user_id);
create index if not exists idx_vehicles_owner_user_name on public.vehicles(owner_user_id, name);
create index if not exists idx_loadouts_owner_user_updated_at on public.loadouts(owner_user_id, updated_at desc);
create index if not exists idx_loadouts_vehicle_id on public.loadouts(vehicle_id);
create index if not exists idx_loadout_items_owner_user_id on public.loadout_items(owner_user_id);
create index if not exists idx_loadout_items_loadout_sort_order on public.loadout_items(loadout_id, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vehicles_set_updated_at on public.vehicles;
create trigger vehicles_set_updated_at
before update on public.vehicles
for each row
execute function public.set_updated_at();

drop trigger if exists loadouts_set_updated_at on public.loadouts;
create trigger loadouts_set_updated_at
before update on public.loadouts
for each row
execute function public.set_updated_at();

drop trigger if exists loadout_items_set_updated_at on public.loadout_items;
create trigger loadout_items_set_updated_at
before update on public.loadout_items
for each row
execute function public.set_updated_at();

alter table public.vehicles enable row level security;
alter table public.loadouts enable row level security;
alter table public.loadout_items enable row level security;

drop policy if exists vehicles_select_own on public.vehicles;
create policy vehicles_select_own
on public.vehicles
for select
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists vehicles_insert_own on public.vehicles;
create policy vehicles_insert_own
on public.vehicles
for insert
to authenticated
with check (auth.uid() = owner_user_id);

drop policy if exists vehicles_update_own on public.vehicles;
create policy vehicles_update_own
on public.vehicles
for update
to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

drop policy if exists vehicles_delete_own on public.vehicles;
create policy vehicles_delete_own
on public.vehicles
for delete
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists loadouts_select_own on public.loadouts;
create policy loadouts_select_own
on public.loadouts
for select
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists loadouts_insert_own on public.loadouts;
create policy loadouts_insert_own
on public.loadouts
for insert
to authenticated
with check (
  auth.uid() = owner_user_id
  and (
    vehicle_id is null
    or exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and v.owner_user_id = auth.uid()
    )
  )
);

drop policy if exists loadouts_update_own on public.loadouts;
create policy loadouts_update_own
on public.loadouts
for update
to authenticated
using (auth.uid() = owner_user_id)
with check (
  auth.uid() = owner_user_id
  and (
    vehicle_id is null
    or exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_id
        and v.owner_user_id = auth.uid()
    )
  )
);

drop policy if exists loadouts_delete_own on public.loadouts;
create policy loadouts_delete_own
on public.loadouts
for delete
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists loadout_items_select_own on public.loadout_items;
create policy loadout_items_select_own
on public.loadout_items
for select
to authenticated
using (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.loadouts l
    where l.id = loadout_id
      and l.owner_user_id = auth.uid()
  )
);

drop policy if exists loadout_items_insert_own on public.loadout_items;
create policy loadout_items_insert_own
on public.loadout_items
for insert
to authenticated
with check (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.loadouts l
    where l.id = loadout_id
      and l.owner_user_id = auth.uid()
  )
);

drop policy if exists loadout_items_update_own on public.loadout_items;
create policy loadout_items_update_own
on public.loadout_items
for update
to authenticated
using (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.loadouts l
    where l.id = loadout_id
      and l.owner_user_id = auth.uid()
  )
)
with check (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.loadouts l
    where l.id = loadout_id
      and l.owner_user_id = auth.uid()
  )
);

drop policy if exists loadout_items_delete_own on public.loadout_items;
create policy loadout_items_delete_own
on public.loadout_items
for delete
to authenticated
using (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.loadouts l
    where l.id = loadout_id
      and l.owner_user_id = auth.uid()
  )
);

-- Established Campgrounds provider cache.
-- Provider API keys stay in Supabase Edge Function environment variables.
-- This migration stores only non-secret provider metadata, canonical map records,
-- provider source records, availability snapshots, and sanitized sync history.

create extension if not exists pgcrypto;
create extension if not exists postgis;

create table if not exists public.campground_provider_configs (
  id uuid primary key default gen_random_uuid(),
  provider_id text unique not null,
  display_name text not null,
  enabled boolean not null default true,
  base_url text,
  priority integer not null default 100,
  cache_ttl_seconds integer,
  sync_interval_minutes integer,
  attribution_text text,
  secret_ref text,
  health_status text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campgrounds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  geog geography(Point, 4326) generated always as (
    st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
  ) stored,
  facility_type text not null default 'campground',
  managing_agency text,
  managing_org text,
  reservation_url text,
  detail_url text,
  status text not null default 'unknown',
  availability_status text not null default 'unknown',
  site_count integer,
  site_types text[],
  amenities text[],
  source_confidence numeric not null default 0,
  primary_provider text,
  attribution text,
  last_synced_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campground_source_records (
  id uuid primary key default gen_random_uuid(),
  campground_id uuid references public.campgrounds(id) on delete cascade,
  provider_id text not null,
  provider_record_id text not null,
  source_url text,
  raw_json jsonb,
  payload_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(provider_id, provider_record_id)
);

create table if not exists public.campground_availability (
  id uuid primary key default gen_random_uuid(),
  campground_id uuid references public.campgrounds(id) on delete cascade,
  provider_id text not null,
  date date,
  availability_status text not null default 'unknown',
  available_site_count integer,
  reservable boolean,
  first_come_first_served boolean,
  last_checked_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.campground_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  records_read integer not null default 0,
  records_upserted integer not null default 0,
  records_failed integer not null default 0,
  error_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campground_provider_configs_provider_id_check') then
    alter table public.campground_provider_configs
      add constraint campground_provider_configs_provider_id_check
      check (provider_id <> '' and provider_id = lower(provider_id));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campground_provider_configs_priority_check') then
    alter table public.campground_provider_configs
      add constraint campground_provider_configs_priority_check
      check (priority >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campground_provider_configs_cache_ttl_check') then
    alter table public.campground_provider_configs
      add constraint campground_provider_configs_cache_ttl_check
      check (cache_ttl_seconds is null or cache_ttl_seconds > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campground_provider_configs_sync_interval_check') then
    alter table public.campground_provider_configs
      add constraint campground_provider_configs_sync_interval_check
      check (sync_interval_minutes is null or sync_interval_minutes > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campground_provider_configs_health_status_check') then
    alter table public.campground_provider_configs
      add constraint campground_provider_configs_health_status_check
      check (health_status is null or health_status in ('unknown', 'healthy', 'degraded', 'offline', 'disabled'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campground_provider_configs_secret_ref_check') then
    alter table public.campground_provider_configs
      add constraint campground_provider_configs_secret_ref_check
      check (secret_ref is null or secret_ref ~ '^[A-Z0-9_,]+$');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campgrounds_latitude_check') then
    alter table public.campgrounds
      add constraint campgrounds_latitude_check check (latitude between -90 and 90);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campgrounds_longitude_check') then
    alter table public.campgrounds
      add constraint campgrounds_longitude_check check (longitude between -180 and 180);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campgrounds_status_check') then
    alter table public.campgrounds
      add constraint campgrounds_status_check
      check (status in ('unknown', 'open', 'closed', 'seasonal', 'temporarily_closed', 'removed', 'verify'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campgrounds_availability_status_check') then
    alter table public.campgrounds
      add constraint campgrounds_availability_status_check
      check (availability_status in ('unknown', 'available', 'limited', 'unavailable', 'closed', 'stale'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campgrounds_site_count_check') then
    alter table public.campgrounds
      add constraint campgrounds_site_count_check
      check (site_count is null or site_count >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campgrounds_source_confidence_check') then
    alter table public.campgrounds
      add constraint campgrounds_source_confidence_check
      check (source_confidence >= 0 and source_confidence <= 100);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campground_source_records_provider_id_check') then
    alter table public.campground_source_records
      add constraint campground_source_records_provider_id_check
      check (provider_id <> '' and provider_id = lower(provider_id));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campground_source_records_record_id_check') then
    alter table public.campground_source_records
      add constraint campground_source_records_record_id_check
      check (provider_record_id <> '');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campground_availability_provider_id_check') then
    alter table public.campground_availability
      add constraint campground_availability_provider_id_check
      check (provider_id <> '' and provider_id = lower(provider_id));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campground_availability_status_check') then
    alter table public.campground_availability
      add constraint campground_availability_status_check
      check (availability_status in ('unknown', 'available', 'limited', 'unavailable', 'closed', 'stale'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campground_availability_site_count_check') then
    alter table public.campground_availability
      add constraint campground_availability_site_count_check
      check (available_site_count is null or available_site_count >= 0);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campground_sync_runs_provider_id_check') then
    alter table public.campground_sync_runs
      add constraint campground_sync_runs_provider_id_check
      check (provider_id <> '' and provider_id = lower(provider_id));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campground_sync_runs_status_check') then
    alter table public.campground_sync_runs
      add constraint campground_sync_runs_status_check
      check (status in ('queued', 'running', 'succeeded', 'partial', 'failed', 'skipped'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'campground_sync_runs_counts_check') then
    alter table public.campground_sync_runs
      add constraint campground_sync_runs_counts_check
      check (
        records_read >= 0
        and records_upserted >= 0
        and records_failed >= 0
        and error_count >= 0
      );
  end if;
end $$;

create index if not exists idx_campground_provider_configs_enabled_priority
  on public.campground_provider_configs(enabled, priority, provider_id);

create index if not exists idx_campgrounds_geog
  on public.campgrounds using gist (geog);

create index if not exists idx_campgrounds_latitude_longitude
  on public.campgrounds(latitude, longitude);

create index if not exists idx_campgrounds_status_availability
  on public.campgrounds(status, availability_status);

create index if not exists idx_campgrounds_primary_provider
  on public.campgrounds(primary_provider);

create index if not exists idx_campgrounds_last_synced_at
  on public.campgrounds(last_synced_at desc);

create index if not exists idx_campground_source_records_campground_provider
  on public.campground_source_records(campground_id, provider_id);

create index if not exists idx_campground_source_records_payload_hash
  on public.campground_source_records(payload_hash)
  where payload_hash is not null;

create index if not exists idx_campground_source_records_raw_json
  on public.campground_source_records using gin (raw_json)
  where raw_json is not null;

create index if not exists idx_campground_availability_campground_date
  on public.campground_availability(campground_id, date);

create index if not exists idx_campground_availability_provider_status
  on public.campground_availability(provider_id, availability_status);

create index if not exists idx_campground_availability_expires_at
  on public.campground_availability(expires_at)
  where expires_at is not null;

create index if not exists idx_campground_sync_runs_provider_started
  on public.campground_sync_runs(provider_id, started_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campground_provider_configs_set_updated_at on public.campground_provider_configs;
create trigger campground_provider_configs_set_updated_at
before update on public.campground_provider_configs
for each row
execute function public.set_updated_at();

drop trigger if exists campgrounds_set_updated_at on public.campgrounds;
create trigger campgrounds_set_updated_at
before update on public.campgrounds
for each row
execute function public.set_updated_at();

create or replace function public.search_established_campgrounds_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  limit_count integer default 250
)
returns table (
  id uuid,
  name text,
  latitude double precision,
  longitude double precision,
  facility_type text,
  managing_agency text,
  managing_org text,
  reservation_url text,
  detail_url text,
  status text,
  availability_status text,
  site_count integer,
  site_types text[],
  amenities text[],
  source_confidence numeric,
  primary_provider text,
  attribution text,
  last_synced_at timestamptz,
  last_verified_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.latitude,
    c.longitude,
    c.facility_type,
    c.managing_agency,
    c.managing_org,
    c.reservation_url,
    c.detail_url,
    c.status,
    c.availability_status,
    c.site_count,
    c.site_types,
    c.amenities,
    c.source_confidence,
    c.primary_provider,
    c.attribution,
    c.last_synced_at,
    c.last_verified_at
  from public.campgrounds c
  where c.status <> 'removed'
    and c.longitude between least(min_lng, max_lng) and greatest(min_lng, max_lng)
    and c.latitude between least(min_lat, max_lat) and greatest(min_lat, max_lat)
  order by c.source_confidence desc, c.name asc
  limit greatest(1, least(coalesce(limit_count, 250), 1000));
$$;

alter table public.campground_provider_configs enable row level security;
alter table public.campgrounds enable row level security;
alter table public.campground_source_records enable row level security;
alter table public.campground_availability enable row level security;
alter table public.campground_sync_runs enable row level security;

drop policy if exists campground_provider_configs_select_public on public.campground_provider_configs;
drop policy if exists campground_provider_configs_select_admin on public.campground_provider_configs;
create policy campground_provider_configs_select_admin
on public.campground_provider_configs
for select
to authenticated
using (public.is_ecs_super_admin());

drop policy if exists campground_provider_configs_admin_write on public.campground_provider_configs;
create policy campground_provider_configs_admin_write
on public.campground_provider_configs
for all
to authenticated
using (public.is_ecs_super_admin())
with check (public.is_ecs_super_admin());

drop policy if exists campgrounds_select_public on public.campgrounds;
create policy campgrounds_select_public
on public.campgrounds
for select
to anon, authenticated
using (status <> 'removed');

drop policy if exists campgrounds_admin_write on public.campgrounds;
create policy campgrounds_admin_write
on public.campgrounds
for all
to authenticated
using (public.is_ecs_super_admin())
with check (public.is_ecs_super_admin());

drop policy if exists campground_source_records_select_admin on public.campground_source_records;
create policy campground_source_records_select_admin
on public.campground_source_records
for select
to authenticated
using (public.is_ecs_super_admin());

drop policy if exists campground_source_records_admin_write on public.campground_source_records;
create policy campground_source_records_admin_write
on public.campground_source_records
for all
to authenticated
using (public.is_ecs_super_admin())
with check (public.is_ecs_super_admin());

drop policy if exists campground_availability_select_public on public.campground_availability;
create policy campground_availability_select_public
on public.campground_availability
for select
to anon, authenticated
using (true);

drop policy if exists campground_availability_admin_write on public.campground_availability;
create policy campground_availability_admin_write
on public.campground_availability
for all
to authenticated
using (public.is_ecs_super_admin())
with check (public.is_ecs_super_admin());

drop policy if exists campground_sync_runs_select_admin on public.campground_sync_runs;
create policy campground_sync_runs_select_admin
on public.campground_sync_runs
for select
to authenticated
using (public.is_ecs_super_admin());

drop policy if exists campground_sync_runs_admin_write on public.campground_sync_runs;
create policy campground_sync_runs_admin_write
on public.campground_sync_runs
for all
to authenticated
using (public.is_ecs_super_admin())
with check (public.is_ecs_super_admin());

grant execute on function public.search_established_campgrounds_bbox(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) to anon, authenticated;

insert into public.campground_provider_configs (
  provider_id,
  display_name,
  base_url,
  priority,
  cache_ttl_seconds,
  sync_interval_minutes,
  attribution_text,
  secret_ref,
  health_status
)
values
  ('ridb', 'RIDB / Recreation.gov', 'https://ridb.recreation.gov', 10, 86400, 1440, 'RIDB / Recreation.gov', 'RIDB_API_KEY', 'unknown'),
  ('nps', 'National Park Service', 'https://developer.nps.gov', 20, 86400, 1440, 'National Park Service', 'NPS_API_KEY', 'unknown'),
  ('campflare', 'Campflare', null, 30, 1800, 30, 'Campflare', 'CAMPFLARE_API_KEY', 'unknown'),
  ('active', 'ACTIVE', null, 40, 1800, 30, 'ACTIVE', 'ACTIVE_API_KEY,ACTIVE_API_SECRET', 'unknown'),
  ('reserveamerica', 'ReserveAmerica', null, 50, 1800, 30, 'ReserveAmerica', 'RESERVEAMERICA_API_KEY', 'unknown'),
  ('aspira', 'Aspira', null, 60, 1800, 30, 'Aspira', 'ASPIRA_API_KEY', 'unknown'),
  ('osm', 'OpenStreetMap', 'https://www.openstreetmap.org', 100, 604800, 10080, 'OpenStreetMap contributors', 'OSM_USER_AGENT,OSM_ATTRIBUTION', 'unknown')
on conflict (provider_id) do update
set
  display_name = excluded.display_name,
  base_url = excluded.base_url,
  priority = excluded.priority,
  cache_ttl_seconds = excluded.cache_ttl_seconds,
  sync_interval_minutes = excluded.sync_interval_minutes,
  attribution_text = excluded.attribution_text,
  secret_ref = excluded.secret_ref,
  health_status = coalesce(public.campground_provider_configs.health_status, excluded.health_status),
  updated_at = now();

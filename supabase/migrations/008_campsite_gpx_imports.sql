-- Private GPX import foundation for campsite candidates.
-- Imports and candidates are owner-scoped; raw GPX is not retained by default.

create extension if not exists pgcrypto;

create table if not exists public.gpx_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_filename text,
  file_size_bytes integer not null,
  parser_version text not null,
  waypoint_count integer not null default 0,
  route_count integer not null default 0,
  track_count integer not null default 0,
  status text not null default 'parsed',
  raw_file_retention text not null default 'delete_after_parse',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gpx_import_candidates (
  id uuid primary key default gen_random_uuid(),
  gpx_import_id uuid not null references public.gpx_imports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_type text not null default 'waypoint',
  name text,
  description text,
  latitude double precision not null,
  longitude double precision not null,
  elevation_m double precision,
  recorded_at timestamptz,
  selected_for_save boolean not null default false,
  selected_for_community_submission boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gpx_imports_file_size_check') then
    alter table public.gpx_imports
      add constraint gpx_imports_file_size_check check (file_size_bytes >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'gpx_imports_counts_check') then
    alter table public.gpx_imports
      add constraint gpx_imports_counts_check
      check (waypoint_count >= 0 and route_count >= 0 and track_count >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'gpx_imports_status_check') then
    alter table public.gpx_imports
      add constraint gpx_imports_status_check check (status in ('parsed', 'rejected', 'deleted'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'gpx_imports_raw_file_retention_check') then
    alter table public.gpx_imports
      add constraint gpx_imports_raw_file_retention_check
      check (raw_file_retention in ('delete_after_parse', 'retained'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'gpx_import_candidates_candidate_type_check') then
    alter table public.gpx_import_candidates
      add constraint gpx_import_candidates_candidate_type_check check (candidate_type in ('waypoint'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'gpx_import_candidates_latitude_check') then
    alter table public.gpx_import_candidates
      add constraint gpx_import_candidates_latitude_check check (latitude between -90 and 90);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'gpx_import_candidates_longitude_check') then
    alter table public.gpx_import_candidates
      add constraint gpx_import_candidates_longitude_check check (longitude between -180 and 180);
  end if;
end $$;

create index if not exists idx_gpx_imports_user_id
  on public.gpx_imports(user_id);
create index if not exists idx_gpx_imports_user_status
  on public.gpx_imports(user_id, status);
create index if not exists idx_gpx_import_candidates_import_id
  on public.gpx_import_candidates(gpx_import_id);
create index if not exists idx_gpx_import_candidates_user_id
  on public.gpx_import_candidates(user_id);

drop trigger if exists gpx_imports_set_updated_at on public.gpx_imports;
create trigger gpx_imports_set_updated_at
before update on public.gpx_imports
for each row
execute function public.set_updated_at();

drop trigger if exists gpx_import_candidates_set_updated_at on public.gpx_import_candidates;
create trigger gpx_import_candidates_set_updated_at
before update on public.gpx_import_candidates
for each row
execute function public.set_updated_at();

alter table public.gpx_imports enable row level security;
alter table public.gpx_import_candidates enable row level security;

drop policy if exists gpx_imports_select_own on public.gpx_imports;
create policy gpx_imports_select_own
on public.gpx_imports
for select
to authenticated
using (auth.uid() = user_id or public.is_ecs_super_admin());

drop policy if exists gpx_imports_insert_own on public.gpx_imports;
create policy gpx_imports_insert_own
on public.gpx_imports
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists gpx_imports_update_own on public.gpx_imports;
create policy gpx_imports_update_own
on public.gpx_imports
for update
to authenticated
using (auth.uid() = user_id or public.is_ecs_super_admin())
with check (auth.uid() = user_id or public.is_ecs_super_admin());

drop policy if exists gpx_import_candidates_select_own on public.gpx_import_candidates;
create policy gpx_import_candidates_select_own
on public.gpx_import_candidates
for select
to authenticated
using (auth.uid() = user_id or public.is_ecs_super_admin());

drop policy if exists gpx_import_candidates_insert_own on public.gpx_import_candidates;
create policy gpx_import_candidates_insert_own
on public.gpx_import_candidates
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.gpx_imports
    where gpx_imports.id = gpx_import_candidates.gpx_import_id
      and gpx_imports.user_id = auth.uid()
  )
);

drop policy if exists gpx_import_candidates_update_own on public.gpx_import_candidates;
create policy gpx_import_candidates_update_own
on public.gpx_import_candidates
for update
to authenticated
using (auth.uid() = user_id or public.is_ecs_super_admin())
with check (auth.uid() = user_id or public.is_ecs_super_admin());

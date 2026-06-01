-- Campsite recommendation persistence for local-first Map Tools submissions.
-- Community-visible camp_sites are canonical approved records; reports preserve
-- every user submission/check-in/import candidate for moderation and merge.

create extension if not exists pgcrypto;

create table if not exists public.camp_sites (
  id uuid primary key default gen_random_uuid(),
  canonical_name text,
  latitude double precision not null,
  longitude double precision not null,
  status text not null default 'approved',
  visibility text not null default 'community',
  site_type text not null default 'unknown',
  access_difficulty text not null default 'easy_2wd',
  vehicle_fit jsonb not null default '[]'::jsonb,
  trailer_friendly boolean,
  max_rig_length_ft double precision,
  max_group_size integer,
  amenities jsonb not null default '{}'::jsonb,
  conditions jsonb not null default '{}'::jsonb,
  trust_score double precision not null default 0,
  legal_confidence text not null default 'unknown',
  last_confirmed_at timestamptz,
  confirmation_count integer not null default 0,
  flag_count integer not null default 0,
  owner_user_id uuid references auth.users(id) on delete set null,
  authorized_user_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.camp_site_reports (
  id uuid primary key default gen_random_uuid(),
  camp_site_id uuid references public.camp_sites(id) on delete set null,
  submitted_by_user_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  source_type text not null default 'manual',
  location_accuracy_m double precision,
  user_stayed_here boolean not null default false,
  verified_in_person boolean not null default false,
  visited_at timestamptz,
  site_type text not null default 'unknown',
  access_difficulty text not null default 'easy_2wd',
  vehicle_fit jsonb not null default '[]'::jsonb,
  amenities jsonb not null default '{}'::jsonb,
  conditions jsonb not null default '{}'::jsonb,
  notes text,
  visibility_requested text not null default 'private',
  moderation_status text not null default 'draft',
  stewardship_acknowledged boolean not null default false,
  sensitive_area_acknowledged boolean not null default false,
  client_submission_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.camp_site_flags (
  id uuid primary key default gen_random_uuid(),
  camp_site_id uuid not null references public.camp_sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text,
  created_at timestamptz not null default now()
);

create table if not exists public.camp_site_photos (
  id uuid primary key default gen_random_uuid(),
  camp_site_report_id uuid not null references public.camp_site_reports(id) on delete cascade,
  camp_site_id uuid references public.camp_sites(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_url text not null,
  thumbnail_url text,
  exif_stripped boolean not null default false,
  moderation_status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.camp_sites add column if not exists canonical_name text;
alter table public.camp_sites add column if not exists latitude double precision;
alter table public.camp_sites add column if not exists longitude double precision;
alter table public.camp_sites add column if not exists status text not null default 'approved';
alter table public.camp_sites add column if not exists visibility text not null default 'community';
alter table public.camp_sites add column if not exists site_type text not null default 'unknown';
alter table public.camp_sites add column if not exists access_difficulty text not null default 'easy_2wd';
alter table public.camp_sites add column if not exists vehicle_fit jsonb not null default '[]'::jsonb;
alter table public.camp_sites add column if not exists trailer_friendly boolean;
alter table public.camp_sites add column if not exists max_rig_length_ft double precision;
alter table public.camp_sites add column if not exists max_group_size integer;
alter table public.camp_sites add column if not exists amenities jsonb not null default '{}'::jsonb;
alter table public.camp_sites add column if not exists conditions jsonb not null default '{}'::jsonb;
alter table public.camp_sites add column if not exists trust_score double precision not null default 0;
alter table public.camp_sites add column if not exists legal_confidence text not null default 'unknown';
alter table public.camp_sites add column if not exists last_confirmed_at timestamptz;
alter table public.camp_sites add column if not exists confirmation_count integer not null default 0;
alter table public.camp_sites add column if not exists flag_count integer not null default 0;
alter table public.camp_sites add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table public.camp_sites add column if not exists authorized_user_ids uuid[] not null default '{}'::uuid[];
alter table public.camp_sites add column if not exists created_at timestamptz not null default now();
alter table public.camp_sites add column if not exists updated_at timestamptz not null default now();

alter table public.camp_site_reports add column if not exists client_submission_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'camp_sites_latitude_check') then
    alter table public.camp_sites
      add constraint camp_sites_latitude_check check (latitude between -90 and 90);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_sites_longitude_check') then
    alter table public.camp_sites
      add constraint camp_sites_longitude_check check (longitude between -180 and 180);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_sites_status_check') then
    alter table public.camp_sites
      add constraint camp_sites_status_check check (status in ('approved', 'hidden', 'archived'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_sites_visibility_check') then
    alter table public.camp_sites
      add constraint camp_sites_visibility_check check (visibility in ('community', 'group', 'private'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_sites_site_type_check') then
    alter table public.camp_sites
      add constraint camp_sites_site_type_check
      check (site_type in ('established_dispersed', 'developed', 'paid', 'trailhead', 'unknown'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_sites_access_difficulty_check') then
    alter table public.camp_sites
      add constraint camp_sites_access_difficulty_check
      check (access_difficulty in ('easy_2wd', 'awd', 'high_clearance', 'four_by_four', 'technical'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_sites_legal_confidence_check') then
    alter table public.camp_sites
      add constraint camp_sites_legal_confidence_check
      check (legal_confidence in ('unknown', 'low', 'medium', 'high'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'camp_site_reports_latitude_check') then
    alter table public.camp_site_reports
      add constraint camp_site_reports_latitude_check check (latitude between -90 and 90);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_reports_longitude_check') then
    alter table public.camp_site_reports
      add constraint camp_site_reports_longitude_check check (longitude between -180 and 180);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_reports_source_type_check') then
    alter table public.camp_site_reports
      add constraint camp_site_reports_source_type_check
      check (source_type in ('current_location', 'pin_drop', 'gpx_waypoint', 'gpx_route', 'manual'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_reports_site_type_check') then
    alter table public.camp_site_reports
      add constraint camp_site_reports_site_type_check
      check (site_type in ('established_dispersed', 'developed', 'paid', 'trailhead', 'unknown'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_reports_access_difficulty_check') then
    alter table public.camp_site_reports
      add constraint camp_site_reports_access_difficulty_check
      check (access_difficulty in ('easy_2wd', 'awd', 'high_clearance', 'four_by_four', 'technical'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_reports_visibility_requested_check') then
    alter table public.camp_site_reports
      add constraint camp_site_reports_visibility_requested_check
      check (visibility_requested in ('private', 'group', 'community'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_reports_moderation_status_check') then
    alter table public.camp_site_reports
      add constraint camp_site_reports_moderation_status_check
      check (moderation_status in ('draft', 'private_saved', 'pending', 'approved', 'rejected', 'needs_info', 'merged'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_reports_client_submission_id_length_check') then
    alter table public.camp_site_reports
      add constraint camp_site_reports_client_submission_id_length_check
      check (client_submission_id is null or length(client_submission_id) <= 128);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'camp_site_flags_reason_check') then
    alter table public.camp_site_flags
      add constraint camp_site_flags_reason_check
      check (reason in ('private_land', 'closed_to_camping', 'sensitive_area', 'duplicate', 'unsafe', 'trash_or_damage', 'bad_coordinates', 'other'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'camp_site_photos_moderation_status_check') then
    alter table public.camp_site_photos
      add constraint camp_site_photos_moderation_status_check
      check (moderation_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists idx_camp_sites_latitude_longitude
  on public.camp_sites(latitude, longitude);
create index if not exists idx_camp_sites_status_visibility
  on public.camp_sites(status, visibility);
create index if not exists idx_camp_sites_authorized_user_ids
  on public.camp_sites using gin (authorized_user_ids);
create index if not exists idx_camp_site_reports_submitted_by_user_id
  on public.camp_site_reports(submitted_by_user_id);
create index if not exists idx_camp_site_reports_moderation_status
  on public.camp_site_reports(moderation_status);
create unique index if not exists idx_camp_site_reports_client_submission_id_user
  on public.camp_site_reports(submitted_by_user_id, client_submission_id)
  where client_submission_id is not null;
create index if not exists idx_camp_site_flags_camp_site_id
  on public.camp_site_flags(camp_site_id);
create index if not exists idx_camp_site_photos_report_id
  on public.camp_site_photos(camp_site_report_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_ecs_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.operators
    where user_id = auth.uid()
      and status = 'active'
      and role = 'super_admin'
  );
$$;

drop trigger if exists camp_sites_set_updated_at on public.camp_sites;
create trigger camp_sites_set_updated_at
before update on public.camp_sites
for each row
execute function public.set_updated_at();

drop trigger if exists camp_site_reports_set_updated_at on public.camp_site_reports;
create trigger camp_site_reports_set_updated_at
before update on public.camp_site_reports
for each row
execute function public.set_updated_at();

alter table public.camp_sites enable row level security;
alter table public.camp_site_reports enable row level security;
alter table public.camp_site_flags enable row level security;
alter table public.camp_site_photos enable row level security;

drop policy if exists camp_sites_select_visible on public.camp_sites;
create policy camp_sites_select_visible
on public.camp_sites
for select
to authenticated
using (
  (visibility = 'community' and status = 'approved')
  or auth.uid() = owner_user_id
  or auth.uid() = any(authorized_user_ids)
  or public.is_ecs_super_admin()
);

drop policy if exists camp_sites_insert_own on public.camp_sites;
create policy camp_sites_insert_own
on public.camp_sites
for insert
to authenticated
with check (
  auth.uid() = owner_user_id
  or auth.uid() = any(authorized_user_ids)
  or public.is_ecs_super_admin()
);

drop policy if exists camp_sites_update_own on public.camp_sites;
create policy camp_sites_update_own
on public.camp_sites
for update
to authenticated
using (
  auth.uid() = owner_user_id
  or auth.uid() = any(authorized_user_ids)
  or public.is_ecs_super_admin()
)
with check (
  auth.uid() = owner_user_id
  or auth.uid() = any(authorized_user_ids)
  or public.is_ecs_super_admin()
);

drop policy if exists camp_site_reports_select_own on public.camp_site_reports;
create policy camp_site_reports_select_own
on public.camp_site_reports
for select
to authenticated
using (auth.uid() = submitted_by_user_id or public.is_ecs_super_admin());

drop policy if exists camp_site_reports_insert_own on public.camp_site_reports;
create policy camp_site_reports_insert_own
on public.camp_site_reports
for insert
to authenticated
with check (auth.uid() = submitted_by_user_id);

drop policy if exists camp_site_reports_update_own_unmoderated on public.camp_site_reports;
create policy camp_site_reports_update_own_unmoderated
on public.camp_site_reports
for update
to authenticated
using (
  (auth.uid() = submitted_by_user_id and moderation_status in ('draft', 'private_saved', 'needs_info'))
  or public.is_ecs_super_admin()
)
with check (auth.uid() = submitted_by_user_id or public.is_ecs_super_admin());

drop policy if exists camp_site_flags_select_own on public.camp_site_flags;
create policy camp_site_flags_select_own
on public.camp_site_flags
for select
to authenticated
using (auth.uid() = user_id or public.is_ecs_super_admin());

drop policy if exists camp_site_flags_insert_own on public.camp_site_flags;
create policy camp_site_flags_insert_own
on public.camp_site_flags
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists camp_site_photos_select_own on public.camp_site_photos;
create policy camp_site_photos_select_own
on public.camp_site_photos
for select
to authenticated
using (auth.uid() = user_id or public.is_ecs_super_admin());

drop policy if exists camp_site_photos_select_approved_public on public.camp_site_photos;
create policy camp_site_photos_select_approved_public
on public.camp_site_photos
for select
to anon, authenticated
using (
  moderation_status = 'approved'
  and camp_site_id is not null
  and exists (
    select 1
    from public.camp_sites
    where camp_sites.id = camp_site_photos.camp_site_id
      and camp_sites.status = 'approved'
      and camp_sites.visibility = 'community'
  )
);

drop policy if exists camp_site_photos_update_admin on public.camp_site_photos;
create policy camp_site_photos_update_admin
on public.camp_site_photos
for update
to authenticated
using (public.is_ecs_super_admin())
with check (public.is_ecs_super_admin());

drop policy if exists camp_site_photos_insert_own on public.camp_site_photos;
create policy camp_site_photos_insert_own
on public.camp_site_photos
for insert
to authenticated
with check (auth.uid() = user_id);

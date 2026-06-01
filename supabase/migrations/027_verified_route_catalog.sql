-- Verified CONUS route catalog.
-- Canonical source-backed route records for Explore. No demo, fixture, scraped,
-- or partner-restricted GPX records are inserted here.

create extension if not exists pgcrypto;
create extension if not exists postgis;

create table if not exists public.route_sources (
  id uuid primary key default gen_random_uuid(),
  provider_id text unique not null,
  name text not null,
  source_type text not null,
  authority text not null default 'unknown',
  source_uri text,
  attribution text,
  license text,
  refresh_frequency text,
  status text not null default 'active',
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_sources_provider_id_check check (provider_id <> ''),
  constraint route_sources_source_type_check check (
    source_type in (
      'official',
      'federal_agency',
      'state_agency',
      'county_agency',
      'community',
      'osm_supplemental',
      'partner_restricted',
      'supplemental'
    )
  ),
  constraint route_sources_status_check check (status in ('active', 'disabled', 'needs_review'))
);

create table if not exists public.route_source_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  route_source_id uuid not null references public.route_sources(id) on delete cascade,
  status text not null default 'pending',
  source_uri text,
  source_version text,
  payload_hash text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  raw_feature_count integer not null default 0,
  normalized_feature_count integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  constraint route_source_ingest_runs_status_check check (status in ('pending', 'running', 'succeeded', 'failed')),
  constraint route_source_ingest_runs_counts_check check (raw_feature_count >= 0 and normalized_feature_count >= 0)
);

create table if not exists public.route_raw_source_features (
  id uuid primary key default gen_random_uuid(),
  route_source_id uuid not null references public.route_sources(id) on delete cascade,
  ingest_run_id uuid references public.route_source_ingest_runs(id) on delete set null,
  provider_feature_id text not null,
  source_layer text,
  source_uri text,
  payload_hash text,
  geometry geometry(Geometry, 4326),
  properties jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint route_raw_source_features_provider_feature_id_check check (provider_feature_id <> ''),
  unique (route_source_id, provider_feature_id, source_layer)
);

create table if not exists public.route_segments (
  id uuid primary key default gen_random_uuid(),
  canonical_name text,
  route_number text,
  segment_type text not null default 'unknown',
  surface text not null default 'unknown',
  legality_status text not null default 'geometry_only',
  public_access_status text not null default 'unknown',
  land_manager text,
  managing_unit text,
  confidence_score numeric not null default 0,
  source_priority integer not null default 0,
  primary_source_id uuid references public.route_sources(id),
  primary_source_feature_id text,
  geometry geometry(MultiLineString, 4326) not null,
  length_meters numeric,
  source_last_updated timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_segments_segment_type_check check (segment_type in ('road', 'trail', 'track', 'connector', 'ferry', 'unknown')),
  constraint route_segments_surface_check check (surface in ('paved', 'gravel', 'dirt', 'sand', 'rock', 'snow', 'mixed', 'unknown')),
  constraint route_segments_legality_status_check check (
    legality_status in ('legal_verified', 'limited_verified', 'geometry_only', 'community_unverified', 'closed_or_prohibited')
  ),
  constraint route_segments_public_access_status_check check (public_access_status in ('open', 'limited', 'closed', 'unknown')),
  constraint route_segments_confidence_score_check check (confidence_score >= 0 and confidence_score <= 100)
);

create table if not exists public.route_segment_sources (
  id uuid primary key default gen_random_uuid(),
  route_segment_id uuid not null references public.route_segments(id) on delete cascade,
  route_source_id uuid not null references public.route_sources(id) on delete cascade,
  raw_source_feature_id uuid references public.route_raw_source_features(id) on delete set null,
  provider_feature_id text,
  source_role text not null default 'supplemental',
  match_confidence numeric not null default 0,
  properties jsonb not null default '{}'::jsonb,
  constraint route_segment_sources_source_role_check check (source_role in ('primary', 'corroborating', 'conflicting', 'supplemental')),
  constraint route_segment_sources_match_confidence_check check (match_confidence >= 0 and match_confidence <= 100),
  unique (route_segment_id, route_source_id, provider_feature_id)
);

create table if not exists public.route_access_rules (
  id uuid primary key default gen_random_uuid(),
  route_segment_id uuid not null references public.route_segments(id) on delete cascade,
  vehicle_class text not null default 'unknown',
  allowed boolean not null default false,
  season_start_month integer,
  season_start_day integer,
  season_end_month integer,
  season_end_day integer,
  permit_required boolean not null default false,
  width_limit_inches numeric,
  source_text text,
  confidence_score numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_access_rules_vehicle_class_check check (
    vehicle_class in ('highway_legal_4x4', 'full_size_4x4', 'atv', 'utv', 'motorcycle', 'snowmobile', 'bicycle', 'pedestrian', 'unknown')
  ),
  constraint route_access_rules_month_check check (
    (season_start_month is null or season_start_month between 1 and 12) and
    (season_end_month is null or season_end_month between 1 and 12)
  ),
  constraint route_access_rules_day_check check (
    (season_start_day is null or season_start_day between 1 and 31) and
    (season_end_day is null or season_end_day between 1 and 31)
  ),
  constraint route_access_rules_confidence_score_check check (confidence_score >= 0 and confidence_score <= 100)
);

create table if not exists public.route_closures (
  id uuid primary key default gen_random_uuid(),
  route_source_id uuid references public.route_sources(id) on delete set null,
  route_segment_id uuid references public.route_segments(id) on delete cascade,
  closure_type text not null default 'unknown',
  status text not null default 'unknown',
  title text not null,
  description text,
  source_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  geometry geometry(Geometry, 4326),
  confidence_score numeric not null default 0,
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_closures_type_check check (closure_type in ('seasonal', 'emergency', 'fire', 'flood', 'maintenance', 'land_manager', 'permanent', 'unknown')),
  constraint route_closures_status_check check (status in ('active', 'scheduled', 'expired', 'unknown')),
  constraint route_closures_confidence_score_check check (confidence_score >= 0 and confidence_score <= 100)
);

create table if not exists public.verified_routes (
  id uuid primary key default gen_random_uuid(),
  public_id text unique not null,
  name text not null,
  description text,
  route_type text not null default 'unknown',
  center_latitude double precision not null,
  center_longitude double precision not null,
  geog geography(Point, 4326) generated always as (
    st_setsrid(st_makepoint(center_longitude, center_latitude), 4326)::geography
  ) stored,
  route_geometry jsonb,
  distance_miles numeric,
  estimated_duration_minutes integer,
  difficulty text not null default 'unknown',
  vehicle_fit text[],
  official_access_coverage_pct numeric not null default 0,
  unknown_access_coverage_pct numeric not null default 100,
  restricted_access_coverage_pct numeric not null default 0,
  active_closure_count integer not null default 0,
  seasonal_restriction_count integer not null default 0,
  vehicle_mismatch boolean not null default false,
  geometry_quality text not null default 'missing',
  verification_status text not null default 'not_recommended',
  recommendation_status text not null default 'not_recommended',
  review_status text not null default 'pending_review',
  confidence_score numeric not null default 0,
  confidence_reasons text[] not null default '{}',
  warning_reasons text[] not null default '{}',
  blocker_reasons text[] not null default '{}',
  closure_summaries text[] not null default '{}',
  community_signal jsonb not null default '{}'::jsonb,
  tags text[],
  last_verified_at timestamptz,
  stale_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verified_routes_public_id_check check (public_id <> ''),
  constraint verified_routes_route_type_check check (route_type in ('loop', 'out_and_back', 'point_to_point', 'area_pack', 'unknown')),
  constraint verified_routes_latitude_check check (center_latitude between -90 and 90),
  constraint verified_routes_longitude_check check (center_longitude between -180 and 180),
  constraint verified_routes_route_geometry_check check (
    route_geometry is null or
    (
      route_geometry ? 'type' and
      route_geometry ? 'coordinates' and
      route_geometry->>'type' in ('LineString', 'MultiLineString')
    )
  ),
  constraint verified_routes_distance_check check (distance_miles is null or distance_miles >= 0),
  constraint verified_routes_duration_check check (estimated_duration_minutes is null or estimated_duration_minutes >= 0),
  constraint verified_routes_difficulty_check check (difficulty in ('easy', 'moderate', 'technical', 'extreme', 'unknown')),
  constraint verified_routes_coverage_check check (
    official_access_coverage_pct >= 0 and official_access_coverage_pct <= 100 and
    unknown_access_coverage_pct >= 0 and unknown_access_coverage_pct <= 100 and
    restricted_access_coverage_pct >= 0 and restricted_access_coverage_pct <= 100
  ),
  constraint verified_routes_count_check check (active_closure_count >= 0 and seasonal_restriction_count >= 0),
  constraint verified_routes_geometry_quality_check check (geometry_quality in ('good', 'partial', 'poor', 'missing')),
  constraint verified_routes_verification_status_check check (
    verification_status in ('official_verified', 'partially_verified', 'geometry_only', 'stale', 'not_recommended')
  ),
  constraint verified_routes_recommendation_status_check check (recommendation_status in ('recommendable', 'not_recommended', 'needs_review')),
  constraint verified_routes_review_status_check check (review_status in ('draft', 'pending_review', 'approved', 'rejected', 'needs_more_data')),
  constraint verified_routes_confidence_score_check check (confidence_score >= 0 and confidence_score <= 100)
);

create table if not exists public.verified_route_sources (
  id uuid primary key default gen_random_uuid(),
  verified_route_id uuid not null references public.verified_routes(id) on delete cascade,
  route_source_id uuid not null references public.route_sources(id) on delete cascade,
  source_role text not null default 'primary',
  coverage_pct numeric,
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint verified_route_sources_role_check check (source_role in ('primary', 'corroborating', 'conflicting', 'supplemental')),
  constraint verified_route_sources_coverage_check check (coverage_pct is null or (coverage_pct >= 0 and coverage_pct <= 100)),
  unique (verified_route_id, route_source_id, source_role)
);

create table if not exists public.verified_route_segments (
  id uuid primary key default gen_random_uuid(),
  verified_route_id uuid not null references public.verified_routes(id) on delete cascade,
  route_segment_id uuid not null references public.route_segments(id) on delete cascade,
  segment_order integer not null default 0,
  direction text not null default 'either',
  length_meters numeric,
  official_access_coverage_pct numeric,
  metadata jsonb not null default '{}'::jsonb,
  constraint verified_route_segments_order_check check (segment_order >= 0),
  constraint verified_route_segments_direction_check check (direction in ('forward', 'reverse', 'either')),
  constraint verified_route_segments_coverage_check check (official_access_coverage_pct is null or (official_access_coverage_pct >= 0 and official_access_coverage_pct <= 100)),
  unique (verified_route_id, route_segment_id, segment_order)
);

create table if not exists public.route_community_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  public_id text unique,
  name text not null,
  description text,
  route_geometry jsonb not null,
  center_latitude double precision,
  center_longitude double precision,
  distance_miles numeric,
  vehicle_fit text[],
  certifies_right_to_share boolean not null default false,
  acknowledges_private_land_and_closure_review boolean not null default false,
  privacy_sanitized boolean not null default false,
  source_label text not null default 'Community GPX submission',
  review_status text not null default 'pending_review',
  verification_status text not null default 'not_started',
  reviewer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_community_submissions_name_check check (name <> ''),
  constraint route_community_submissions_route_geometry_check check (
    route_geometry ? 'type' and
    route_geometry ? 'coordinates' and
    route_geometry->>'type' in ('LineString', 'MultiLineString')
  ),
  constraint route_community_submissions_latitude_check check (center_latitude is null or center_latitude between -90 and 90),
  constraint route_community_submissions_longitude_check check (center_longitude is null or center_longitude between -180 and 180),
  constraint route_community_submissions_distance_check check (distance_miles is null or distance_miles >= 0),
  constraint route_community_submissions_review_status_check check (review_status in ('pending_review', 'needs_more_data', 'approved', 'rejected')),
  constraint route_community_submissions_verification_status_check check (verification_status in ('not_started', 'matched', 'partial', 'conflict', 'rejected'))
);

create index if not exists route_sources_provider_id_idx
  on public.route_sources (provider_id);

create index if not exists route_raw_source_features_geometry_idx
  on public.route_raw_source_features using gist (geometry);

create index if not exists route_segments_geometry_idx
  on public.route_segments using gist (geometry);

create index if not exists route_segments_access_idx
  on public.route_segments (legality_status, public_access_status);

create index if not exists route_closures_geometry_idx
  on public.route_closures using gist (geometry);

create index if not exists route_closures_status_idx
  on public.route_closures (status, starts_at, ends_at);

create index if not exists verified_routes_geog_idx
  on public.verified_routes using gist (geog);

create index if not exists verified_routes_public_catalog_idx
  on public.verified_routes (review_status, recommendation_status, updated_at desc);

create index if not exists route_community_submissions_owner_idx
  on public.route_community_submissions (submitted_by, created_at desc);

insert into public.route_sources (
  provider_id,
  name,
  source_type,
  authority,
  source_uri,
  attribution,
  license,
  refresh_frequency,
  status
) values
  ('usfs_mvum', 'USFS Motor Vehicle Use Maps', 'federal_agency', 'official_access', 'https://www.fs.usda.gov/maps/', 'USDA Forest Service', 'public domain / agency published terms', 'agency published schedule', 'active'),
  ('usfs_mvum_tahoe_nf', 'USFS MVUM - Tahoe National Forest', 'federal_agency', 'official_access', 'https://www.fs.usda.gov/detail/tahoe/maps-pubs/?cid=fseprd638275', 'USDA Forest Service Motor Vehicle Use Maps', 'agency published terms', 'agency published schedule', 'active'),
  ('usfs_mvum_mendocino_nf', 'USFS MVUM - Mendocino National Forest', 'federal_agency', 'official_access', 'https://www.fs.usda.gov/detail/mendocino/maps-pubs/?cid=stelprdb5142646', 'USDA Forest Service Motor Vehicle Use Maps', 'agency published terms', 'agency published schedule', 'active'),
  ('blm_gtlf', 'BLM National Ground Transportation Linear Features', 'federal_agency', 'official_access', 'https://gis.blm.gov/arcgis/rest/services/transportation/BLM_Natl_GTLF_Public_Display/MapServer/0', 'Bureau of Land Management', 'agency published terms', 'agency published schedule', 'active'),
  ('usgs_digital_trails', 'USGS National Digital Trails', 'federal_agency', 'supplemental_geometry', 'https://www.usgs.gov/national-digital-trails/how-access-or-view-usgs-trails-dataset', 'U.S. Geological Survey', 'public domain / agency published terms', 'agency published schedule', 'active'),
  ('nps_gis', 'National Park Service GIS', 'federal_agency', 'agency_context', 'https://www.nps.gov/im/imd-gis.htm', 'National Park Service', 'agency published terms', 'agency published schedule', 'active'),
  ('michigan_dnr_orv', 'Michigan DNR ORV Routes', 'state_agency', 'official_access', 'https://www.michigan.gov/dnr/things-to-do/orv-riding/maps-list', 'Michigan Department of Natural Resources', 'agency published terms', 'agency published schedule', 'active'),
  ('minnesota_ohv', 'Minnesota OHV Trails', 'state_agency', 'official_access', 'https://geo.btaa.org/catalog/ab340e5d-da66-474e-9098-20b75d4d744e', 'Minnesota Department of Natural Resources', 'agency published terms', 'agency published schedule', 'active'),
  ('openstreetmap', 'OpenStreetMap Supplemental Geometry', 'osm_supplemental', 'supplemental_geometry', 'https://www.openstreetmap.org/copyright', 'OpenStreetMap contributors', 'ODbL', 'supplemental cache refresh', 'needs_review'),
  ('bdr_partner_restricted', 'Backcountry Discovery Routes Partner Restricted', 'partner_restricted', 'partner_restricted', 'https://ridebdr.com/download-tracks/', 'Backcountry Discovery Routes', 'restricted partner terms', 'license required before publishing', 'disabled')
on conflict (provider_id) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  authority = excluded.authority,
  source_uri = excluded.source_uri,
  attribution = excluded.attribution,
  license = excluded.license,
  refresh_frequency = excluded.refresh_frequency,
  status = excluded.status,
  updated_at = now();

create or replace view public.route_catalog_public
with (security_invoker = true) as
select
  vr.id,
  vr.public_id,
  vr.name,
  vr.description,
  vr.route_type,
  vr.center_latitude,
  vr.center_longitude,
  vr.route_geometry,
  vr.distance_miles,
  vr.estimated_duration_minutes,
  vr.difficulty,
  vr.vehicle_fit,
  vr.official_access_coverage_pct,
  vr.unknown_access_coverage_pct,
  vr.restricted_access_coverage_pct,
  vr.active_closure_count,
  vr.seasonal_restriction_count,
  vr.vehicle_mismatch,
  vr.geometry_quality,
  vr.verification_status,
  vr.recommendation_status,
  vr.review_status,
  vr.confidence_score,
  vr.confidence_reasons,
  vr.warning_reasons,
  vr.blocker_reasons,
  vr.closure_summaries,
  vr.community_signal,
  vr.tags,
  vr.last_verified_at,
  vr.stale_at,
  vr.created_at,
  vr.updated_at,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'providerId', rs.provider_id,
        'provider_id', rs.provider_id,
        'sourceType', rs.source_type,
        'source_type', rs.source_type,
        'label', rs.name,
        'authority', rs.authority,
        'sourceUrl', rs.source_uri,
        'source_url', rs.source_uri,
        'attribution', rs.attribution,
        'license', rs.license,
        'lastVerifiedAt', coalesce(vrs.last_verified_at, vr.last_verified_at),
        'last_verified_at', coalesce(vrs.last_verified_at, vr.last_verified_at),
        'usePermission', case when rs.source_type = 'partner_restricted' then 'not_granted' else 'granted' end,
        'use_permission', case when rs.source_type = 'partner_restricted' then 'not_granted' else 'granted' end
      )
      order by
        case vrs.source_role
          when 'primary' then 0
          when 'corroborating' then 1
          when 'supplemental' then 2
          else 3
        end,
        rs.provider_id
    ) filter (where rs.id is not null),
    '[]'::jsonb
  ) as source_records
from public.verified_routes vr
left join public.verified_route_sources vrs on vrs.verified_route_id = vr.id
left join public.route_sources rs on rs.id = vrs.route_source_id
where vr.review_status = 'approved'
  and vr.recommendation_status = 'recommendable'
group by vr.id;

alter table public.route_sources enable row level security;
alter table public.route_source_ingest_runs enable row level security;
alter table public.route_raw_source_features enable row level security;
alter table public.route_segments enable row level security;
alter table public.route_segment_sources enable row level security;
alter table public.route_access_rules enable row level security;
alter table public.route_closures enable row level security;
alter table public.verified_routes enable row level security;
alter table public.verified_route_sources enable row level security;
alter table public.verified_route_segments enable row level security;
alter table public.route_community_submissions enable row level security;

drop policy if exists route_sources_select_active on public.route_sources;
create policy route_sources_select_active
  on public.route_sources
  for select
  using (status = 'active');

drop policy if exists verified_routes_select_public_catalog on public.verified_routes;
create policy verified_routes_select_public_catalog
  on public.verified_routes
  for select
  using (review_status = 'approved' and recommendation_status = 'recommendable');

drop policy if exists verified_route_sources_select_public_catalog on public.verified_route_sources;
create policy verified_route_sources_select_public_catalog
  on public.verified_route_sources
  for select
  using (
    exists (
      select 1
      from public.verified_routes route
      where route.id = verified_route_sources.verified_route_id
        and route.review_status = 'approved'
        and route.recommendation_status = 'recommendable'
    )
  );

drop policy if exists route_community_submissions_select_own on public.route_community_submissions;
create policy route_community_submissions_select_own
  on public.route_community_submissions
  for select
  using (submitted_by = auth.uid());

drop policy if exists route_community_submissions_insert_own on public.route_community_submissions;
create policy route_community_submissions_insert_own
  on public.route_community_submissions
  for insert
  with check (
    submitted_by = auth.uid()
    and review_status = 'pending_review'
    and certifies_right_to_share = true
    and acknowledges_private_land_and_closure_review = true
  );

grant select on public.route_catalog_public to anon, authenticated;
grant select on public.route_sources to anon, authenticated;
grant select on public.verified_routes to anon, authenticated;
grant select on public.verified_route_sources to anon, authenticated;
grant select, insert on public.route_community_submissions to authenticated;

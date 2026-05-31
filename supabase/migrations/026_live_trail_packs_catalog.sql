-- Live Trail Packs catalog.
-- This stores reviewed route-pack records only. No demo, fixture, or mock rows are inserted here.

create extension if not exists pgcrypto;
create extension if not exists postgis;

create table if not exists public.trail_packs (
  id uuid primary key default gen_random_uuid(),
  public_id text unique not null,
  name text not null,
  description text,
  source text not null default 'needs_review',
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
  confidence_score numeric not null default 0,
  confidence_reasons text[] not null default '{}',
  last_verified_at timestamptz,
  positive_feedback_count integer not null default 0,
  negative_feedback_count integer not null default 0,
  completion_count integer not null default 0,
  review_status text not null default 'pending_review',
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trail_packs_public_id_check') then
    alter table public.trail_packs
      add constraint trail_packs_public_id_check check (public_id <> '');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trail_packs_source_check') then
    alter table public.trail_packs
      add constraint trail_packs_source_check
      check (source in (
        'ecs_submitted',
        'community_reviewed',
        'ecs_validated',
        'imported_gpx',
        'imported_kml',
        'partner_source',
        'needs_review'
      ));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trail_packs_route_type_check') then
    alter table public.trail_packs
      add constraint trail_packs_route_type_check
      check (route_type in ('loop', 'out_and_back', 'point_to_point', 'area_pack', 'unknown'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trail_packs_latitude_check') then
    alter table public.trail_packs
      add constraint trail_packs_latitude_check check (center_latitude between -90 and 90);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trail_packs_longitude_check') then
    alter table public.trail_packs
      add constraint trail_packs_longitude_check check (center_longitude between -180 and 180);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trail_packs_route_geometry_check') then
    alter table public.trail_packs
      add constraint trail_packs_route_geometry_check
      check (
        route_geometry is null or
        (
          route_geometry ? 'type' and
          route_geometry ? 'coordinates' and
          route_geometry->>'type' in ('LineString', 'MultiLineString')
        )
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trail_packs_distance_check') then
    alter table public.trail_packs
      add constraint trail_packs_distance_check check (distance_miles is null or distance_miles >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trail_packs_duration_check') then
    alter table public.trail_packs
      add constraint trail_packs_duration_check
      check (estimated_duration_minutes is null or estimated_duration_minutes >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trail_packs_difficulty_check') then
    alter table public.trail_packs
      add constraint trail_packs_difficulty_check
      check (difficulty in ('easy', 'moderate', 'technical', 'extreme', 'unknown'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trail_packs_confidence_score_check') then
    alter table public.trail_packs
      add constraint trail_packs_confidence_score_check check (confidence_score >= 0 and confidence_score <= 100);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trail_packs_feedback_counts_check') then
    alter table public.trail_packs
      add constraint trail_packs_feedback_counts_check
      check (
        positive_feedback_count >= 0 and
        negative_feedback_count >= 0 and
        completion_count >= 0
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trail_packs_review_status_check') then
    alter table public.trail_packs
      add constraint trail_packs_review_status_check
      check (review_status in ('draft', 'pending_review', 'approved', 'rejected', 'needs_more_data'));
  end if;
end $$;

create index if not exists trail_packs_review_status_idx
  on public.trail_packs (review_status, updated_at desc);

create index if not exists trail_packs_geog_idx
  on public.trail_packs using gist (geog);

alter table public.trail_packs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trail_packs'
      and policyname = 'trail_packs_select_approved'
  ) then
    create policy trail_packs_select_approved
      on public.trail_packs
      for select
      using (review_status = 'approved');
  end if;
end $$;

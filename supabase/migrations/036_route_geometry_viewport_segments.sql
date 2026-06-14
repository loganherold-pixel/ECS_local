-- Route geometry viewport search.
-- Keeps dense ECS route_segments behind a service-role RPC so mobile clients
-- can request only the current map viewport instead of loading national data.

create extension if not exists postgis;

create index if not exists route_segments_viewport_access_idx
  on public.route_segments (legality_status, public_access_status, confidence_score desc, updated_at desc);

create index if not exists route_access_rules_segment_vehicle_idx
  on public.route_access_rules (route_segment_id, vehicle_class, allowed);

create or replace function public.search_route_geometry_segments_for_viewport(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_zoom double precision default 10,
  p_limit integer default 240,
  p_include_reference_geometry boolean default true,
  p_vehicle_class text default null
)
returns table (
  id uuid,
  canonical_name text,
  route_number text,
  segment_type text,
  surface text,
  legality_status text,
  public_access_status text,
  land_manager text,
  managing_unit text,
  confidence_score numeric,
  source_last_updated timestamptz,
  length_meters numeric,
  geometry jsonb,
  source_records jsonb,
  metadata jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      ST_MakeEnvelope(
        least(p_min_lng, p_max_lng),
        least(p_min_lat, p_max_lat),
        greatest(p_min_lng, p_max_lng),
        greatest(p_min_lat, p_max_lat),
        4326
      ) as geom,
      greatest(1, least(coalesce(p_limit, 240), 500)) as row_limit,
      coalesce(p_include_reference_geometry, true) as include_reference_geometry,
      nullif(btrim(coalesce(p_vehicle_class, '')), '') as vehicle_class
  ),
  matched_segments as (
    select seg.*
    from public.route_segments seg
    cross join bounds b
    where coalesce(p_zoom, 0) >= 10
      and seg.geometry is not null
      and ST_Intersects(seg.geometry, b.geom)
      and seg.legality_status <> 'closed_or_prohibited'
      and seg.public_access_status <> 'closed'
      and (
        b.include_reference_geometry
        or seg.legality_status in ('legal_verified', 'limited_verified')
      )
      and (
        b.vehicle_class is null
        or exists (
          select 1
          from public.route_access_rules rar
          where rar.route_segment_id = seg.id
            and rar.vehicle_class = b.vehicle_class
            and rar.allowed = true
        )
        or not exists (
          select 1
          from public.route_access_rules rar_any
          where rar_any.route_segment_id = seg.id
            and rar_any.vehicle_class = b.vehicle_class
        )
      )
    order by seg.confidence_score desc, seg.updated_at desc
    limit (select row_limit + 1 from bounds)
  ),
  dumped_lines as (
    select
      seg.*,
      (ST_Dump(ST_LineMerge(seg.geometry))).geom as line_geometry
    from matched_segments seg
  )
  select
    dl.id,
    dl.canonical_name,
    dl.route_number,
    dl.segment_type,
    dl.surface,
    dl.legality_status,
    dl.public_access_status,
    dl.land_manager,
    dl.managing_unit,
    dl.confidence_score,
    dl.source_last_updated,
    coalesce(ST_Length(dl.line_geometry::geography), dl.length_meters) as length_meters,
    ST_AsGeoJSON(dl.line_geometry)::jsonb as geometry,
    coalesce(src.source_records, '[]'::jsonb) as source_records,
    dl.metadata
  from dumped_lines dl
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'providerId', rs.provider_id,
        'provider_id', rs.provider_id,
        'label', rs.name,
        'sourceType', rs.source_type,
        'source_type', rs.source_type,
        'authority', rs.authority,
        'sourceRole', rss.source_role,
        'source_role', rss.source_role,
        'attribution', rs.attribution,
        'license', rs.license,
        'lastVerifiedAt', coalesce(rss.last_verified_at, dl.source_last_updated),
        'last_verified_at', coalesce(rss.last_verified_at, dl.source_last_updated)
      )
      order by
        case rss.source_role
          when 'primary' then 0
          when 'corroborating' then 1
          when 'supplemental' then 2
          else 3
        end,
        rs.provider_id
    ) as source_records
    from public.route_segment_sources rss
    join public.route_sources rs on rs.id = rss.route_source_id
    where rss.route_segment_id = dl.id
  ) src on true
  where geometrytype(dl.line_geometry) in ('LINESTRING', 'MULTILINESTRING')
  order by dl.confidence_score desc, dl.updated_at desc;
$$;

revoke all on function public.search_route_geometry_segments_for_viewport(
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  boolean,
  text
) from public;

grant execute on function public.search_route_geometry_segments_for_viewport(
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  boolean,
  text
) to service_role;

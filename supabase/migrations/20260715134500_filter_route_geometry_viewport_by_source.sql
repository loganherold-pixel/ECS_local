-- Keep source-specific viewport reads source-specific before ranking and
-- limiting. The existing RPC remains available for deployed v1 callers.

create or replace function public.search_route_geometry_segments_for_viewport_v2(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_zoom double precision default 10,
  p_limit integer default 240,
  p_include_reference_geometry boolean default true,
  p_vehicle_class text default null,
  p_source_provider_prefix text default null
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
set search_path = public, pg_temp
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
      nullif(btrim(coalesce(p_vehicle_class, '')), '') as vehicle_class,
      nullif(lower(btrim(coalesce(p_source_provider_prefix, ''))), '') as source_provider_prefix
  ),
  route_segment_candidates as (
    select
      seg.id,
      seg.canonical_name,
      seg.route_number,
      seg.segment_type,
      seg.surface,
      seg.legality_status,
      seg.public_access_status,
      seg.land_manager,
      seg.managing_unit,
      seg.confidence_score,
      seg.source_last_updated,
      seg.length_meters,
      seg.geometry as catalog_geometry,
      seg.metadata,
      seg.updated_at,
      'route_segments'::text as catalog_origin
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
      and (
        b.source_provider_prefix is null
        or exists (
          select 1
          from public.route_segment_sources rss
          join public.route_sources rs on rs.id = rss.route_source_id
          where rss.route_segment_id = seg.id
            and left(lower(rs.provider_id), char_length(b.source_provider_prefix)) = b.source_provider_prefix
        )
      )
  ),
  verified_route_candidates as (
    select
      vr.id,
      vr.name as canonical_name,
      null::text as route_number,
      case
        when vr.public_id like '%-trail-%' then 'trail'
        when vr.public_id like '%-road-%' then 'road'
        else 'unknown'
      end as segment_type,
      'unknown'::text as surface,
      case
        when vr.verification_status = 'geometry_only' then 'geometry_only'
        when vr.verification_status = 'partially_verified' then 'limited_verified'
        when vr.seasonal_restriction_count > 0 or vr.restricted_access_coverage_pct > 0 then 'limited_verified'
        else 'legal_verified'
      end as legality_status,
      case
        when vr.seasonal_restriction_count > 0 or vr.restricted_access_coverage_pct > 0 then 'limited'
        when vr.official_access_coverage_pct > 0 then 'open'
        else 'unknown'
      end as public_access_status,
      null::text as land_manager,
      null::text as managing_unit,
      vr.confidence_score,
      vr.last_verified_at as source_last_updated,
      vr.distance_miles * 1609.344 as length_meters,
      ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(vr.route_geometry::text), 4326)) as catalog_geometry,
      jsonb_build_object(
        'catalogOrigin', 'verified_routes',
        'publicId', vr.public_id,
        'routeType', vr.route_type,
        'geometryQuality', vr.geometry_quality,
        'verificationStatus', vr.verification_status,
        'recommendationStatus', vr.recommendation_status,
        'reviewStatus', vr.review_status,
        'officialAccessCoveragePct', vr.official_access_coverage_pct,
        'unknownAccessCoveragePct', vr.unknown_access_coverage_pct,
        'restrictedAccessCoveragePct', vr.restricted_access_coverage_pct,
        'activeClosureCount', vr.active_closure_count,
        'seasonalRestrictionCount', vr.seasonal_restriction_count,
        'vehicleFit', coalesce(to_jsonb(vr.vehicle_fit), '[]'::jsonb)
      ) as metadata,
      vr.updated_at,
      'verified_routes'::text as catalog_origin
    from public.verified_routes vr
    cross join bounds b
    where coalesce(p_zoom, 0) >= 10
      and vr.route_geometry is not null
      and vr.review_status = 'approved'
      and vr.geometry_quality <> 'missing'
      and vr.active_closure_count = 0
      and ST_Intersects(
        ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(vr.route_geometry::text), 4326)),
        b.geom
      )
      and (
        b.include_reference_geometry
        or (
          vr.verification_status in ('official_verified', 'partially_verified')
          and vr.recommendation_status = 'recommendable'
          and vr.official_access_coverage_pct > 0
        )
      )
      and (
        b.vehicle_class is null
        or coalesce(cardinality(vr.vehicle_fit), 0) = 0
        or b.vehicle_class = any(vr.vehicle_fit)
      )
      and (
        b.source_provider_prefix is null
        or exists (
          select 1
          from public.verified_route_sources vrs
          join public.route_sources rs on rs.id = vrs.route_source_id
          where vrs.verified_route_id = vr.id
            and left(lower(rs.provider_id), char_length(b.source_provider_prefix)) = b.source_provider_prefix
        )
      )
  ),
  ranked_candidates as (
    select candidates.*
    from (
      select * from route_segment_candidates
      union all
      select * from verified_route_candidates
    ) candidates
    order by candidates.confidence_score desc, candidates.updated_at desc
    limit (select row_limit + 1 from bounds)
  ),
  dumped_lines as (
    select
      candidate.*,
      (ST_Dump(ST_LineMerge(ST_CollectionExtract(candidate.catalog_geometry, 2)))).geom as line_geometry
    from ranked_candidates candidate
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
        'providerId', source_rows.provider_id,
        'provider_id', source_rows.provider_id,
        'label', source_rows.name,
        'sourceType', source_rows.source_type,
        'source_type', source_rows.source_type,
        'authority', source_rows.authority,
        'sourceRole', source_rows.source_role,
        'source_role', source_rows.source_role,
        'attribution', source_rows.attribution,
        'license', source_rows.license,
        'lastVerifiedAt', source_rows.last_verified_at,
        'last_verified_at', source_rows.last_verified_at
      )
      order by source_rows.role_order, source_rows.provider_id
    ) as source_records
    from (
      select
        rs.provider_id,
        rs.name,
        rs.source_type,
        rs.authority,
        rss.source_role,
        rs.attribution,
        rs.license,
        coalesce(rss.last_verified_at, dl.source_last_updated) as last_verified_at,
        case rss.source_role
          when 'primary' then 0
          when 'corroborating' then 1
          when 'supplemental' then 2
          else 3
        end as role_order
      from public.route_segment_sources rss
      join public.route_sources rs on rs.id = rss.route_source_id
      where dl.catalog_origin = 'route_segments'
        and rss.route_segment_id = dl.id

      union all

      select
        rs.provider_id,
        rs.name,
        rs.source_type,
        rs.authority,
        vrs.source_role,
        rs.attribution,
        rs.license,
        coalesce(vrs.last_verified_at, dl.source_last_updated) as last_verified_at,
        case vrs.source_role
          when 'primary' then 0
          when 'corroborating' then 1
          when 'supplemental' then 2
          else 3
        end as role_order
      from public.verified_route_sources vrs
      join public.route_sources rs on rs.id = vrs.route_source_id
      where dl.catalog_origin = 'verified_routes'
        and vrs.verified_route_id = dl.id
    ) source_rows
  ) src on true
  where GeometryType(dl.line_geometry) = 'LINESTRING'
    and not ST_IsEmpty(dl.line_geometry)
  order by dl.confidence_score desc, dl.updated_at desc;
$$;

revoke all on function public.search_route_geometry_segments_for_viewport_v2(
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  boolean,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.search_route_geometry_segments_for_viewport_v2(
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  boolean,
  text,
  text
) to service_role;

notify pgrst, 'reload schema';

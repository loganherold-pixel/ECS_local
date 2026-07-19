-- Restore the bounded GiST KNN plan for stable Explorer route pages.
-- Applied remotely as migration version 20260718233128.
--
-- The page RPC added in 20260718231818 placed ST_DWithin and the
-- restricted-source anti-join on the full eligible relation and ordered by a
-- value supplied through a cross-joined request CTE. PostgreSQL consequently
-- chose a bitmap radius scan plus a full top-N sort, which exceeds the
-- PostgREST statement timeout even for page one in production.
--
-- This forward-only replacement keeps a single deterministic order while it:
--
--   * reads only offset + limit public candidates through the geography GiST
--     KNN index;
--   * applies approval, recommendation, vehicle, operational, source-adapter,
--     and restricted-source gates before pagination slots are assigned;
--   * uses the same spherical geography metric for KNN order, radius
--     membership, and returned distance so no boundary result can fall after
--     an out-of-radius candidate; and
--   * applies offset/limit only after the bounded exact-radius check.

create or replace function public.route_catalog_nearby_public_route_page(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_miles double precision,
  p_offset integer default 0,
  p_limit integer default 51,
  p_recommendation_filter text default 'recommendable',
  p_vehicle_class text default null,
  p_min_distance_miles double precision default null,
  p_max_distance_miles double precision default null,
  p_min_duration_minutes integer default null,
  p_max_duration_minutes integer default null,
  p_min_confidence_score double precision default null,
  p_min_remoteness_score double precision default null,
  p_max_remoteness_score double precision default null,
  p_min_campability_score double precision default null,
  p_available_fuel_range_miles double precision default null,
  p_available_water_capacity_gallons double precision default null,
  p_route_type text default null,
  p_difficulty text default null,
  p_source_adapter text default null
)
returns table (
  route_id uuid,
  center_distance_miles double precision
)
language plpgsql
stable
parallel unsafe
security invoker
set search_path = ''
as $function$
begin
  return query execute $query$
  with request as (
    select
      public.ST_SetSRID(public.ST_MakePoint($2, $1), 4326)::public.geography as search_center,
      $3 * 1609.344::double precision as radius_meters,
      greatest(0, least(coalesce($4, 0), 2000)) as row_offset,
      greatest(1, least(coalesce($5, 51), 501)) as row_limit,
      greatest(1, least(coalesce($4, 0), 2000))
        + greatest(1, least(coalesce($5, 51), 501)) as candidate_limit,
      lower(btrim(coalesce($6, 'recommendable'))) as recommendation_filter,
      nullif(btrim($7), '') as vehicle_class,
      nullif(lower(btrim($18)), '') as route_type,
      nullif(lower(btrim($19)), '') as difficulty,
      nullif(lower(btrim($20)), '') as source_adapter
    where $1 between -90 and 90
      and $2 between -180 and 180
      and $3 > 0
      and $3 <= 500
      and $4 >= 0
      and $5 > 0
      and $4 + $5 <= 2001
      and lower(btrim(coalesce($6, 'recommendable'))) in (
        'recommendable',
        'non_recommendable',
        'all'
      )
  ),
  nearest_public_candidates as materialized (
    select
      vr.id as route_id,
      vr.geog,
      vr.confidence_score,
      vr.updated_at,
      vr.geog operator(public.<->)
        public.ST_SetSRID(public.ST_MakePoint($2, $1), 4326)::public.geography
        as knn_distance
    from public.verified_routes vr
    cross join request
    where vr.review_status = 'approved'
      and (
        request.recommendation_filter = 'all'
        or (
          request.recommendation_filter = 'recommendable'
          and vr.recommendation_status = 'recommendable'
        )
        or (
          request.recommendation_filter = 'non_recommendable'
          and vr.recommendation_status <> 'recommendable'
        )
      )
      and (
        request.vehicle_class is null
        or vr.vehicle_fit @> array[request.vehicle_class]::text[]
      )
      and ($8 is null or vr.distance_miles >= $8)
      and ($9 is null or vr.distance_miles <= $9)
      and ($10 is null or vr.estimated_duration_minutes >= $10)
      and ($11 is null or vr.estimated_duration_minutes <= $11)
      and ($12 is null or vr.confidence_score >= $12)
      and ($13 is null or vr.remoteness_score >= $13)
      and ($14 is null or vr.remoteness_score <= $14)
      and ($15 is null or vr.campability_score >= $15)
      and (
        $16 is null
        or $16 <= 0
        or vr.minimum_fuel_range_miles <= $16
      )
      and (
        $17 is null
        or $17 <= 0
        or vr.minimum_water_capacity_gallons <= $17
      )
      and (request.route_type is null or vr.route_type = request.route_type)
      and (request.difficulty is null or vr.difficulty = request.difficulty)
      and not exists (
        select 1
        from public.verified_route_sources restricted_vrs
        join public.route_sources restricted_rs
          on restricted_rs.id = restricted_vrs.route_source_id
        where restricted_vrs.verified_route_id = vr.id
          and (
            lower(btrim(coalesce(restricted_rs.source_type, ''))) = 'partner_restricted'
            or lower(btrim(coalesce(restricted_rs.authority, ''))) = 'partner_restricted'
          )
      )
      and (
        request.source_adapter is null
        or exists (
          select 1
          from public.verified_route_sources vrs
          join public.route_sources rs on rs.id = vrs.route_source_id
          where vrs.verified_route_id = vr.id
            and (
              rs.provider_id = request.source_adapter
              or left(rs.provider_id, length(request.source_adapter) + 1) = request.source_adapter || '_'
            )
        )
      )
    order by
      vr.geog operator(public.<->)
        public.ST_SetSRID(public.ST_MakePoint($2, $1), 4326)::public.geography asc,
      vr.confidence_score desc,
      vr.updated_at desc,
      vr.id asc
    limit (select request.candidate_limit from request)
  ),
  radius_qualified as (
    select
      nearest_public_candidates.route_id,
      public.ST_Distance(
        nearest_public_candidates.geog,
        request.search_center,
        false
      ) / 1609.344::double precision as center_distance_miles,
      nearest_public_candidates.knn_distance,
      nearest_public_candidates.confidence_score,
      nearest_public_candidates.updated_at
    from nearest_public_candidates
    cross join request
    where public.ST_DWithin(
      nearest_public_candidates.geog,
      request.search_center,
      request.radius_meters,
      false
    )
  )
  select
    radius_qualified.route_id,
    radius_qualified.center_distance_miles
  from radius_qualified
  order by
    radius_qualified.knn_distance asc,
    radius_qualified.confidence_score desc,
    radius_qualified.updated_at desc,
    radius_qualified.route_id asc
  offset (select request.row_offset from request)
  limit (select request.row_limit from request);
  $query$
  using
    p_latitude,
    p_longitude,
    p_radius_miles,
    p_offset,
    p_limit,
    p_recommendation_filter,
    p_vehicle_class,
    p_min_distance_miles,
    p_max_distance_miles,
    p_min_duration_minutes,
    p_max_duration_minutes,
    p_min_confidence_score,
    p_min_remoteness_score,
    p_max_remoteness_score,
    p_min_campability_score,
    p_available_fuel_range_miles,
    p_available_water_capacity_gallons,
    p_route_type,
    p_difficulty,
    p_source_adapter;
end;
$function$;

comment on function public.route_catalog_nearby_public_route_page(
  double precision,
  double precision,
  double precision,
  integer,
  integer,
  text,
  text,
  double precision,
  double precision,
  integer,
  integer,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  text,
  text,
  text
) is 'Stable, bounded GiST KNN page of revealable nearby routes; spherical radius and source restrictions are enforced before offset/limit slots.';

revoke all on function public.route_catalog_nearby_public_route_page(
  double precision,
  double precision,
  double precision,
  integer,
  integer,
  text,
  text,
  double precision,
  double precision,
  integer,
  integer,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.route_catalog_nearby_public_route_page(
  double precision,
  double precision,
  double precision,
  integer,
  integer,
  text,
  text,
  double precision,
  double precision,
  integer,
  integer,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  text,
  text,
  text
) to service_role;

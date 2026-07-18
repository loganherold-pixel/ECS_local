-- Keep the radius-first catalog lookup inside the PostgREST statement budget.
--
-- The initial RPC used ST_DWithin before LIMIT, but then sorted every route in
-- a 500-mile match set by exact spheroid distance. At production catalog size
-- that plan exceeded the service-role/PostgREST statement timeout. This
-- forward-only replacement uses the existing geography GiST index for a KNN
-- candidate pool, overfetches that pool fourfold, applies the exact radius and
-- distance calculation to the bounded candidates, and preserves the existing
-- function signature, return contract, filters, and grants.

create or replace function public.route_catalog_nearby_route_ids(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_miles double precision,
  p_limit integer default 600,
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
      greatest(1, least(coalesce($4, 600), 2000)) as row_limit,
      least(
        8000,
        greatest(1, least(coalesce($4, 600), 2000)) * 4
      ) as candidate_limit,
      lower(btrim(coalesce($5, 'recommendable'))) as recommendation_filter,
      nullif(btrim($6), '') as vehicle_class,
      nullif(lower(btrim($17)), '') as route_type,
      nullif(lower(btrim($18)), '') as difficulty,
      nullif(lower(btrim($19)), '') as source_adapter
    where $1 between -90 and 90
      and $2 between -180 and 180
      and $3 > 0
      and $3 <= 500
      and lower(btrim(coalesce($5, 'recommendable'))) in (
        'recommendable',
        'non_recommendable',
        'all'
      )
  ),
  nearest_candidates as materialized (
    select
      vr.id as route_id,
      vr.geog,
      vr.confidence_score,
      vr.updated_at
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
      and ($7 is null or vr.distance_miles >= $7)
      and ($8 is null or vr.distance_miles <= $8)
      and ($9 is null or vr.estimated_duration_minutes >= $9)
      and ($10 is null or vr.estimated_duration_minutes <= $10)
      and ($11 is null or vr.confidence_score >= $11)
      and ($12 is null or vr.remoteness_score >= $12)
      and ($13 is null or vr.remoteness_score <= $13)
      and ($14 is null or vr.campability_score >= $14)
      and (
        $15 is null
        or $15 <= 0
        or vr.minimum_fuel_range_miles <= $15
      )
      and (
        $16 is null
        or $16 <= 0
        or vr.minimum_water_capacity_gallons <= $16
      )
      and (request.route_type is null or vr.route_type = request.route_type)
      and (request.difficulty is null or vr.difficulty = request.difficulty)
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
        public.ST_SetSRID(public.ST_MakePoint($2, $1), 4326)::public.geography
    limit (select request.candidate_limit from request)
  ),
  radius_qualified as (
    select
      nearest_candidates.route_id,
      public.ST_Distance(nearest_candidates.geog, request.search_center) / 1609.344::double precision
        as center_distance_miles,
      nearest_candidates.confidence_score,
      nearest_candidates.updated_at
    from nearest_candidates
    cross join request
    where public.ST_DWithin(
      nearest_candidates.geog,
      request.search_center,
      request.radius_meters
    )
  )
  select
    radius_qualified.route_id,
    radius_qualified.center_distance_miles
  from radius_qualified
  order by
    radius_qualified.center_distance_miles asc,
    radius_qualified.confidence_score desc,
    radius_qualified.updated_at desc,
    radius_qualified.route_id asc
  limit (select request.row_limit from request);
  $query$
  using
    p_latitude,
    p_longitude,
    p_radius_miles,
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

comment on function public.route_catalog_nearby_route_ids(
  double precision,
  double precision,
  double precision,
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
) is 'Service-side bounded route catalog candidate lookup; uses GiST KNN overfetch before exact radius qualification to remain within the API statement budget.';

revoke all on function public.route_catalog_nearby_route_ids(
  double precision,
  double precision,
  double precision,
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

grant execute on function public.route_catalog_nearby_route_ids(
  double precision,
  double precision,
  double precision,
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

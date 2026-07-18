-- Bounded spatial candidate lookup for the server-side route catalog search.
-- Radius and lightweight criteria are applied before LIMIT so newer records
-- outside the requested area cannot crowd valid nearby routes out of the
-- candidate window. The Edge Function remains responsible for returning only
-- the approved public presentation contract.

create extension if not exists postgis;

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
language sql
stable
security invoker
set search_path = ''
as $$
  with request as (
    select
      public.ST_SetSRID(public.ST_MakePoint(p_longitude, p_latitude), 4326)::public.geography as search_center,
      p_radius_miles * 1609.344::double precision as radius_meters,
      greatest(1, least(coalesce(p_limit, 600), 2000)) as row_limit,
      lower(btrim(coalesce(p_recommendation_filter, 'recommendable'))) as recommendation_filter,
      nullif(btrim(p_vehicle_class), '') as vehicle_class,
      nullif(lower(btrim(p_route_type)), '') as route_type,
      nullif(lower(btrim(p_difficulty)), '') as difficulty,
      nullif(lower(btrim(p_source_adapter)), '') as source_adapter
    where p_latitude between -90 and 90
      and p_longitude between -180 and 180
      and p_radius_miles > 0
      and p_radius_miles <= 500
      and lower(btrim(coalesce(p_recommendation_filter, 'recommendable'))) in (
        'recommendable',
        'non_recommendable',
        'all'
      )
  ),
  eligible as (
    select
      vr.id as route_id,
      public.ST_Distance(vr.geog, request.search_center) / 1609.344::double precision as center_distance_miles,
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
      and public.ST_DWithin(vr.geog, request.search_center, request.radius_meters)
      and (
        request.vehicle_class is null
        or vr.vehicle_fit @> array[request.vehicle_class]::text[]
      )
      and (p_min_distance_miles is null or vr.distance_miles >= p_min_distance_miles)
      and (p_max_distance_miles is null or vr.distance_miles <= p_max_distance_miles)
      and (p_min_duration_minutes is null or vr.estimated_duration_minutes >= p_min_duration_minutes)
      and (p_max_duration_minutes is null or vr.estimated_duration_minutes <= p_max_duration_minutes)
      and (p_min_confidence_score is null or vr.confidence_score >= p_min_confidence_score)
      and (p_min_remoteness_score is null or vr.remoteness_score >= p_min_remoteness_score)
      and (p_max_remoteness_score is null or vr.remoteness_score <= p_max_remoteness_score)
      and (p_min_campability_score is null or vr.campability_score >= p_min_campability_score)
      and (
        p_available_fuel_range_miles is null
        or p_available_fuel_range_miles <= 0
        or vr.minimum_fuel_range_miles <= p_available_fuel_range_miles
      )
      and (
        p_available_water_capacity_gallons is null
        or p_available_water_capacity_gallons <= 0
        or vr.minimum_water_capacity_gallons <= p_available_water_capacity_gallons
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
  )
  select
    eligible.route_id,
    eligible.center_distance_miles
  from eligible
  order by
    eligible.center_distance_miles asc,
    eligible.confidence_score desc,
    eligible.updated_at desc,
    eligible.route_id asc
  limit (select request.row_limit from request);
$$;

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
) is 'Service-side bounded route catalog candidate lookup; applies spatial, source, and lightweight eligibility criteria before LIMIT.';

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

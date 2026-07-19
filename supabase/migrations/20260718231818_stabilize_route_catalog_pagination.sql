-- Provide a stable, index-backed public route page for Explorer.
-- Applied remotely as migration version 20260718231818.
--
-- The prefix RPC introduced in 20260718192605 grows its KNN candidate pool
-- with p_limit and then reorders that pool by exact spheroid distance. That
-- makes offset page boundaries shift as the prefix grows. It also requires
-- later pages to reload every earlier row. This forward-only companion RPC:
--
--   * uses the GiST KNN distance as the authoritative stable order;
--   * applies the exact ST_DWithin radius gate;
--   * accepts an explicit offset and returns only one page plus lookahead;
--   * excludes restricted partner sources before pagination slots are assigned;
--   * keeps exact ST_Distance as the returned display distance; and
--   * remains callable only by the Edge Function service role.
--
-- The original prefix RPC remains available for backward-compatible coverage
-- diagnostics. route-catalog-search uses this page RPC for revealable records.

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
  )
  select
    vr.id as route_id,
    public.ST_Distance(vr.geog, request.search_center) / 1609.344::double precision
      as center_distance_miles
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
    and public.ST_DWithin(vr.geog, request.search_center, request.radius_meters)
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
    vr.geog operator(public.<->) request.search_center asc,
    vr.confidence_score desc,
    vr.updated_at desc,
    vr.id asc
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
) is 'Stable GiST KNN page of revealable nearby routes; exact radius and source restrictions are enforced before offset/limit slots.';

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

-- Add stable, unbounded keyset pagination for public Explorer route summaries.
--
-- Offset pagination over geography KNN remains O(offset): production probes
-- crossed the 12-second mobile budget before the 2,000-record window and page
-- 40 still had a continuation. This companion RPC uses a deterministic
-- latitude/longitude/ID keyset over the already-curated public catalog. It
-- scans bounded index batches, applies every existing public eligibility gate,
-- and returns only exact spherical-radius matches. The Edge Function keeps the
-- cursor opaque and binds it to the normalized search criteria.

create index if not exists verified_routes_public_recommendation_cursor_idx
  on public.verified_routes (
    center_latitude,
    center_longitude,
    id
  )
  where review_status = 'approved'
    and recommendation_status = 'recommendable';

create or replace function public.route_catalog_nearby_public_route_cursor_page(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_miles double precision,
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
  p_source_adapter text default null,
  p_cursor_route_id uuid default null
)
returns table (
  route_id uuid,
  center_distance_miles double precision,
  cursor_route_id uuid
)
language plpgsql
stable
parallel unsafe
security invoker
set search_path = ''
as $function$
declare
  -- Keep the prefilter conservatively wider than PostGIS sphere distance so
  -- an exact ST_DWithin boundary result cannot be removed by the bbox.
  earth_radius_meters constant double precision := 6371000;
  batch_limit constant integer := 512;
  row_limit integer;
  search_center public.geography;
  radius_meters double precision;
  angular_radius double precision;
  latitude_delta double precision;
  longitude_delta double precision;
  min_latitude double precision;
  max_latitude double precision;
  raw_min_longitude double precision;
  raw_max_longitude double precision;
  min_longitude double precision;
  max_longitude double precision;
  longitude_wraps boolean;
  normalized_vehicle_class text;
  normalized_route_type text;
  normalized_difficulty text;
  normalized_source_adapter text;
  scan_cursor_latitude double precision := -91;
  scan_cursor_longitude double precision := -181;
  scan_cursor_route_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  emitted_count integer := 0;
  batch_count integer;
  candidate record;
begin
  if p_latitude is null
    or p_longitude is null
    or p_radius_miles is null
    or p_latitude not between -90 and 90
    or p_longitude not between -180 and 180
    or p_radius_miles <= 0
    or p_radius_miles > 500
    or p_limit is null
    or p_limit <= 0
    or lower(btrim(coalesce(p_recommendation_filter, 'recommendable'))) <> 'recommendable'
  then
    return;
  end if;

  if p_cursor_route_id is not null then
    select
      vr.center_latitude,
      vr.center_longitude,
      vr.id
    into
      scan_cursor_latitude,
      scan_cursor_longitude,
      scan_cursor_route_id
    from public.verified_routes vr
    where vr.id = p_cursor_route_id;
    if not found then
      return;
    end if;
  end if;

  row_limit := greatest(1, least(p_limit, 501));
  radius_meters := p_radius_miles * 1609.344::double precision;
  search_center := public.ST_SetSRID(
    public.ST_MakePoint(p_longitude, p_latitude),
    4326
  )::public.geography;
  angular_radius := radius_meters / earth_radius_meters;
  latitude_delta := degrees(angular_radius);
  min_latitude := greatest(-90::double precision, p_latitude - latitude_delta);
  max_latitude := least(90::double precision, p_latitude + latitude_delta);
  longitude_delta := case
    when min_latitude <= -90 or max_latitude >= 90 then 180::double precision
    else degrees(asin(least(
      1::double precision,
      sin(angular_radius) / greatest(
        abs(cos(radians(p_latitude))),
        0.000000000001::double precision
      )
    )))
  end;
  raw_min_longitude := p_longitude - longitude_delta;
  raw_max_longitude := p_longitude + longitude_delta;
  longitude_wraps := longitude_delta < 180
    and (raw_min_longitude < -180 or raw_max_longitude > 180);
  min_longitude := case
    when raw_min_longitude < -180 then raw_min_longitude + 360
    else raw_min_longitude
  end;
  max_longitude := case
    when raw_max_longitude > 180 then raw_max_longitude - 360
    else raw_max_longitude
  end;
  normalized_vehicle_class := nullif(btrim(p_vehicle_class), '');
  normalized_route_type := nullif(lower(btrim(p_route_type)), '');
  normalized_difficulty := nullif(lower(btrim(p_difficulty)), '');
  normalized_source_adapter := nullif(lower(btrim(p_source_adapter)), '');

  loop
    batch_count := 0;
    for candidate in
      select
        vr.id as candidate_route_id,
        vr.center_latitude as candidate_latitude,
        vr.center_longitude as candidate_longitude,
        public.ST_DWithin(
          vr.geog,
          search_center,
          radius_meters,
          false
        ) as within_radius,
        public.ST_Distance(
          vr.geog,
          search_center,
          false
        ) / 1609.344::double precision as candidate_distance_miles
      from public.verified_routes vr
      where vr.review_status = 'approved'
        and vr.recommendation_status = 'recommendable'
        and (
          normalized_vehicle_class is null
          or vr.vehicle_fit @> array[normalized_vehicle_class]::text[]
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
        and (normalized_route_type is null or vr.route_type = normalized_route_type)
        and (normalized_difficulty is null or vr.difficulty = normalized_difficulty)
        and vr.center_latitude between min_latitude and max_latitude
        and (
          longitude_delta >= 180
          or (
            not longitude_wraps
            and vr.center_longitude between min_longitude and max_longitude
          )
          or (
            longitude_wraps
            and (
              vr.center_longitude >= min_longitude
              or vr.center_longitude <= max_longitude
            )
          )
        )
        and (vr.center_latitude, vr.center_longitude, vr.id) >
          (scan_cursor_latitude, scan_cursor_longitude, scan_cursor_route_id)
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
          normalized_source_adapter is null
          or exists (
            select 1
            from public.verified_route_sources vrs
            join public.route_sources rs on rs.id = vrs.route_source_id
            where vrs.verified_route_id = vr.id
              and (
                rs.provider_id = normalized_source_adapter
                or left(rs.provider_id, length(normalized_source_adapter) + 1) =
                  normalized_source_adapter || '_'
              )
          )
        )
      order by
        vr.center_latitude asc,
        vr.center_longitude asc,
        vr.id asc
      limit batch_limit
    loop
      batch_count := batch_count + 1;
      scan_cursor_latitude := candidate.candidate_latitude;
      scan_cursor_longitude := candidate.candidate_longitude;
      scan_cursor_route_id := candidate.candidate_route_id;

      if candidate.within_radius then
        route_id := candidate.candidate_route_id;
        center_distance_miles := candidate.candidate_distance_miles;
        cursor_route_id := candidate.candidate_route_id;
        return next;
        emitted_count := emitted_count + 1;
        if emitted_count >= row_limit then
          return;
        end if;
      end if;
    end loop;

    exit when batch_count < batch_limit;
  end loop;

  return;
end;
$function$;

comment on function public.route_catalog_nearby_public_route_cursor_page(
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
  text,
  uuid
) is 'Service-role public Explorer route page using an opaque criteria-bound route ID resolved to a latitude/longitude/ID keyset and exact spherical radius membership.';

revoke all on function public.route_catalog_nearby_public_route_cursor_page(
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
  text,
  uuid
) from public, anon, authenticated;

grant execute on function public.route_catalog_nearby_public_route_cursor_page(
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
  text,
  uuid
) to service_role;

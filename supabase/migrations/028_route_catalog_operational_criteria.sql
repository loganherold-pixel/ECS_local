-- Route catalog operational criteria.
-- Adds explicit, queryable fields for criteria filtering. Unknown values stay
-- null; ECS must not infer campability or resource suitability from missing data.

alter table public.verified_routes
  add column if not exists remoteness_score numeric,
  add column if not exists campability_score numeric,
  add column if not exists minimum_fuel_range_miles numeric,
  add column if not exists minimum_water_capacity_gallons numeric,
  add column if not exists route_intelligence jsonb not null default '{}'::jsonb;

do $$
begin
  alter table public.verified_routes
    add constraint verified_routes_remoteness_score_check
    check (remoteness_score is null or (remoteness_score >= 0 and remoteness_score <= 10));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.verified_routes
    add constraint verified_routes_campability_score_check
    check (campability_score is null or (campability_score >= 0 and campability_score <= 100));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.verified_routes
    add constraint verified_routes_minimum_fuel_range_check
    check (minimum_fuel_range_miles is null or minimum_fuel_range_miles >= 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.verified_routes
    add constraint verified_routes_minimum_water_capacity_check
    check (minimum_water_capacity_gallons is null or minimum_water_capacity_gallons >= 0);
exception
  when duplicate_object then null;
end $$;

create index if not exists verified_routes_operational_criteria_idx
  on public.verified_routes (
    remoteness_score,
    campability_score,
    minimum_fuel_range_miles,
    minimum_water_capacity_gallons
  )
  where review_status = 'approved'
    and recommendation_status = 'recommendable';

drop view if exists public.route_catalog_public;

create view public.route_catalog_public
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
  ) as source_records,
  vr.remoteness_score,
  vr.campability_score,
  vr.minimum_fuel_range_miles,
  vr.minimum_water_capacity_gallons,
  vr.route_intelligence
from public.verified_routes vr
left join public.verified_route_sources vrs on vrs.verified_route_id = vr.id
left join public.route_sources rs on rs.id = vrs.route_source_id
where vr.review_status = 'approved'
  and vr.recommendation_status = 'recommendable'
group by vr.id;

grant select on public.route_catalog_public to anon, authenticated;

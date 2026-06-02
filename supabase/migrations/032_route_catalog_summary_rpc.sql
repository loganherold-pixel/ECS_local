-- Route catalog summary RPC.
-- Keep large-catalog reporting inside Postgres so the Edge Function performs a
-- single bounded aggregate call instead of paging broad tables through REST.

create index if not exists route_source_ingest_runs_started_idx
  on public.route_source_ingest_runs (started_at desc);

create index if not exists route_source_ingest_runs_source_started_idx
  on public.route_source_ingest_runs (
    route_source_id,
    started_at desc
  );

create or replace function public.route_catalog_summary_report(
  p_max_route_rows integer default 1000,
  p_max_link_rows integer default 5000,
  p_max_ingest_run_rows integer default 500
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with limits as (
  select
    least(greatest(coalesce(p_max_route_rows, 1000), 1), 100000)::integer as max_route_rows,
    least(greatest(coalesce(p_max_link_rows, 5000), 1), 200000)::integer as max_link_rows,
    least(greatest(coalesce(p_max_ingest_run_rows, 500), 1), 20000)::integer as max_ingest_run_rows
),
source_rows as (
  select
    rs.id,
    rs.provider_id,
    rs.name,
    rs.source_type,
    rs.authority,
    rs.status,
    rs.source_uri,
    rs.attribution,
    rs.license,
    rs.last_checked_at
  from public.route_sources rs
  order by rs.provider_id
  limit 1000
),
source_meta as (
  select count(*)::integer as source_count from public.route_sources
),
raw_feature_meta as (
  select greatest(0, coalesce(c.reltuples, 0))::bigint as raw_feature_count
  from pg_class c
  where c.oid = 'public.route_raw_source_features'::regclass
),
route_window as (
  select
    vr.id,
    vr.recommendation_status,
    vr.verification_status,
    vr.review_status,
    vr.active_closure_count,
    vr.stale_at,
    vr.last_verified_at
  from public.verified_routes vr
  order by vr.id desc
  limit (select max_route_rows + 1 from limits)
),
sampled_routes as (
  select *
  from route_window
  order by id desc
  limit (select max_route_rows from limits)
),
route_meta as (
  select
    count(*)::integer as window_count,
    (count(*) > (select max_route_rows from limits)) as truncated
  from route_window
),
route_status_counts as (
  select
    coalesce(
      jsonb_object_agg(recommendation_status, recommendation_count),
      '{}'::jsonb
    ) as recommendation_status_counts,
    coalesce(
      jsonb_object_agg(verification_status, verification_count),
      '{}'::jsonb
    ) as verification_status_counts,
    coalesce(
      jsonb_object_agg(review_status, review_count),
      '{}'::jsonb
    ) as review_status_counts
  from (
    select
      coalesce(nullif(sr.recommendation_status, ''), 'unknown') as recommendation_status,
      count(*)::integer as recommendation_count,
      coalesce(nullif(sr.verification_status, ''), 'unknown') as verification_status,
      count(*)::integer as verification_count,
      coalesce(nullif(sr.review_status, ''), 'unknown') as review_status,
      count(*)::integer as review_count
    from sampled_routes sr
    group by
      coalesce(nullif(sr.recommendation_status, ''), 'unknown'),
      coalesce(nullif(sr.verification_status, ''), 'unknown'),
      coalesce(nullif(sr.review_status, ''), 'unknown')
  ) counts
),
recommendation_status_counts as (
  select coalesce(jsonb_object_agg(status, route_count), '{}'::jsonb) as counts
  from (
    select
      coalesce(nullif(recommendation_status, ''), 'unknown') as status,
      count(*)::integer as route_count
    from sampled_routes
    group by coalesce(nullif(recommendation_status, ''), 'unknown')
  ) grouped
),
verification_status_counts as (
  select coalesce(jsonb_object_agg(status, route_count), '{}'::jsonb) as counts
  from (
    select
      coalesce(nullif(verification_status, ''), 'unknown') as status,
      count(*)::integer as route_count
    from sampled_routes
    group by coalesce(nullif(verification_status, ''), 'unknown')
  ) grouped
),
review_status_counts as (
  select coalesce(jsonb_object_agg(status, route_count), '{}'::jsonb) as counts
  from (
    select
      coalesce(nullif(review_status, ''), 'unknown') as status,
      count(*)::integer as route_count
    from sampled_routes
    group by coalesce(nullif(review_status, ''), 'unknown')
  ) grouped
),
route_totals as (
  select
    count(*)::integer as route_count,
    count(*) filter (
      where review_status = 'approved'
        and recommendation_status = 'recommendable'
    )::integer as public_recommendation_count,
    count(*) filter (
      where recommendation_status = 'needs_review'
        or review_status in ('draft', 'pending_review', 'needs_more_data')
    )::integer as needs_review_count,
    count(*) filter (
      where recommendation_status = 'not_recommended'
        or review_status = 'rejected'
        or coalesce(active_closure_count, 0) > 0
    )::integer as blocked_route_count,
    count(*) filter (where stale_at is not null and stale_at <= now())::integer as stale_route_count,
    count(*) filter (where coalesce(active_closure_count, 0) > 0)::integer as active_closure_route_count
  from sampled_routes
),
link_window as (
  select
    l.verified_route_id,
    l.route_source_id,
    l.source_role,
    l.coverage_pct,
    l.last_verified_at
  from public.verified_route_sources l
  inner join sampled_routes r on l.verified_route_id = r.id
  order by l.verified_route_id desc
  limit (select max_link_rows + 1 from limits)
),
limited_route_links as (
  select *
  from link_window
  order by verified_route_id desc
  limit (select max_link_rows from limits)
),
link_meta as (
  select
    count(*)::integer as window_count,
    (count(*) > (select max_link_rows from limits)) as truncated
  from link_window
),
ingest_window as (
  select
    ir.id,
    ir.route_source_id,
    ir.status,
    ir.source_version,
    ir.started_at,
    ir.finished_at,
    ir.raw_feature_count,
    ir.normalized_feature_count,
    ir.error_message
  from public.route_source_ingest_runs ir
  order by ir.started_at desc
  limit (select max_ingest_run_rows + 1 from limits)
),
limited_ingest_runs as (
  select *
  from ingest_window
  order by started_at desc
  limit (select max_ingest_run_rows from limits)
),
ingest_meta as (
  select
    count(*)::integer as window_count,
    (count(*) > (select max_ingest_run_rows from limits)) as truncated
  from ingest_window
),
latest_ingest_by_source as (
  select distinct on (lir.route_source_id)
    lir.*
  from limited_ingest_runs lir
  order by
    lir.route_source_id,
    greatest(
      coalesce(lir.finished_at, '-infinity'::timestamptz),
      coalesce(lir.started_at, '-infinity'::timestamptz)
    ) desc
),
source_route_stats as (
  select
    sr.id as source_id,
    sr.provider_id,
    sr.name,
    sr.source_type,
    sr.authority,
    sr.status,
    sr.source_uri,
    sr.attribution,
    sr.license,
    sr.last_checked_at,
    count(distinct r.id)::integer as route_count,
    count(distinct r.id) filter (
      where r.review_status = 'approved'
        and r.recommendation_status = 'recommendable'
    )::integer as public_recommendation_count,
    count(distinct r.id) filter (
      where r.recommendation_status = 'needs_review'
        or r.review_status in ('draft', 'pending_review', 'needs_more_data')
    )::integer as needs_review_count,
    count(distinct r.id) filter (
      where r.recommendation_status = 'not_recommended'
        or r.review_status = 'rejected'
        or coalesce(r.active_closure_count, 0) > 0
    )::integer as blocked_route_count,
    count(distinct r.id) filter (where r.stale_at is not null and r.stale_at <= now())::integer as stale_route_count,
    count(distinct r.id) filter (where coalesce(r.active_closure_count, 0) > 0)::integer as active_closure_route_count
  from source_rows sr
  left join limited_route_links l on l.route_source_id = sr.id
  left join sampled_routes r on r.id = l.verified_route_id
  group by
    sr.id,
    sr.provider_id,
    sr.name,
    sr.source_type,
    sr.authority,
    sr.status,
    sr.source_uri,
    sr.attribution,
    sr.license,
    sr.last_checked_at
),
source_summary_rows as (
  select
    srs.*,
    li.id as latest_ingest_id,
    li.status as latest_ingest_status,
    li.started_at as latest_ingest_started_at,
    li.finished_at as latest_ingest_finished_at,
    li.source_version as latest_ingest_source_version,
    li.raw_feature_count as latest_ingest_raw_feature_count,
    li.normalized_feature_count as latest_ingest_normalized_feature_count,
    li.error_message as latest_ingest_error_message
  from source_route_stats srs
  left join latest_ingest_by_source li on li.route_source_id = srs.source_id
),
source_summaries as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', source_id,
        'providerId', provider_id,
        'name', name,
        'sourceType', source_type,
        'authority', authority,
        'status', status,
        'sourceUri', source_uri,
        'attribution', attribution,
        'license', license,
        'lastCheckedAt', last_checked_at,
        'routeCount', route_count,
        'publicRecommendationCount', public_recommendation_count,
        'curationOnlyCount', greatest(0, route_count - public_recommendation_count),
        'needsReviewCount', needs_review_count,
        'blockedRouteCount', blocked_route_count,
        'staleRouteCount', stale_route_count,
        'activeClosureRouteCount', active_closure_route_count,
        'rawFeatureCount', coalesce(latest_ingest_raw_feature_count, 0),
        'normalizedFeatureCount', coalesce(latest_ingest_normalized_feature_count, 0),
        'latestIngestRun',
          case
            when latest_ingest_id is null then null
            else jsonb_build_object(
              'id', latest_ingest_id,
              'status', coalesce(latest_ingest_status, 'unknown'),
              'startedAt', latest_ingest_started_at,
              'finishedAt', latest_ingest_finished_at,
              'sourceVersion', latest_ingest_source_version,
              'rawFeatureCount', coalesce(latest_ingest_raw_feature_count, 0),
              'normalizedFeatureCount', coalesce(latest_ingest_normalized_feature_count, 0),
              'errorMessage', latest_ingest_error_message
            )
          end
      )
      order by route_count desc, provider_id
    ),
    '[]'::jsonb
  ) as value
  from source_summary_rows
)
select jsonb_build_object(
  'ok', true,
  'generatedAt', now(),
  'maxRouteRows', (select max_route_rows from limits),
  'limits', jsonb_build_object(
    'maxRouteRows', (select max_route_rows from limits),
    'maxLinkRows', (select max_link_rows from limits),
    'maxIngestRunRows', (select max_ingest_run_rows from limits)
  ),
  'totals', jsonb_build_object(
    'sourceCount', (select source_count from source_meta),
    'routeCount', (select route_count from route_totals),
    'publicRecommendationCount', (select public_recommendation_count from route_totals),
    'curationOnlyCount', greatest(0, (select route_count from route_totals) - (select public_recommendation_count from route_totals)),
    'needsReviewCount', (select needs_review_count from route_totals),
    'blockedRouteCount', (select blocked_route_count from route_totals),
    'staleRouteCount', (select stale_route_count from route_totals),
    'activeClosureRouteCount', (select active_closure_route_count from route_totals),
    'rawFeatureCount', (select raw_feature_count from raw_feature_meta),
    'latestIngestRunCount', (select least(window_count, (select max_ingest_run_rows from limits)) from ingest_meta)
  ),
  'recommendationStatusCounts', (select counts from recommendation_status_counts),
  'verificationStatusCounts', (select counts from verification_status_counts),
  'reviewStatusCounts', (select counts from review_status_counts),
  'sourceSummaries', (select value from source_summaries),
  'truncated', jsonb_build_object(
    'routeSources', (select source_count > 1000 from source_meta),
    'verifiedRoutes', (select truncated from route_meta),
    'verifiedRouteSources', ((select truncated from link_meta) or (select truncated from route_meta)),
    'ingestRuns', (select truncated from ingest_meta)
  )
);
$$;

revoke all on function public.route_catalog_summary_report(integer, integer, integer) from public;
grant execute on function public.route_catalog_summary_report(integer, integer, integer) to service_role;

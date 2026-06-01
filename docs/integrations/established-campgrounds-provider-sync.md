# Established Campgrounds Provider Sync Runbook

This runbook defines repeatable acquisition for the ECS Established Campgrounds layer. ECS does not currently have a repo-level GitHub Actions, Supabase scheduled-function, or checked-in cron pattern for backend provider jobs, so production scheduling should be configured in the deployment environment against the existing Supabase Edge Functions.

Mobile clients must never call provider APIs directly. The mobile map calls ECS-owned endpoints (`campgrounds-search`, `campground-detail`) and receives canonical campground records only.

`campgrounds-search` is a cached canonical database endpoint. It must not call RIDB, NPS, Campflare, ACTIVE, ReserveAmerica, Aspira, OSM Overpass, or any other provider during a mobile map request. Provider acquisition belongs to the sync functions and deployment scheduler so mobile performance, attribution, freshness, and rate-limit behavior remain predictable.

## Provider Sync Schedule

Use `campground_provider_configs.sync_interval_minutes` as the backend schedule contract and keep scheduler cadence aligned with those rows.

| Provider | Function | Schedule | Notes |
| --- | --- | --- | --- |
| RIDB / Recreation.gov | `campgrounds-sync-ridb` | Nightly, or weekly for low-change environments | Catalog identity and federal recreation metadata. Paginate with bounded `limit`/`maxPages`. |
| NPS | `campgrounds-sync-nps` | Nightly, or weekly for low-change environments | Enriches federal records and creates NPS-only canonical campgrounds when needed. |
| ACTIVE | `campgrounds-sync-active` | Nightly, or weekly for low-change environments | Reservation/catalog metadata. Dedupe with RIDB/NPS/ReserveAmerica/Aspira. |
| ReserveAmerica | `campgrounds-sync-reserveamerica` | Nightly, or weekly for low-change environments | Reservation/catalog metadata. Dedupe before creating canonical rows. |
| Aspira | `campgrounds-sync-aspira` | Nightly, or weekly for low-change environments | Reservation/catalog metadata. Dedupe before creating canonical rows. |
| OSM | `campgrounds-sync-osm` | Weekly per configured regional bbox | Supplemental POI discovery only. Never run an unbounded national/global OSM sync. |
| Campflare | `campgrounds-sync-campflare` | Frequent targeted sync, 15-60 minutes where needed | Availability/status signal. Keep TTL short and let stale availability degrade to `unknown`. |

After catalog providers complete, run `campgrounds-dedupe` on the affected region/provider set. For OSM, use only regional bboxes small enough for the selected Overpass endpoint and provider policy.

## Required Secrets

Set secrets only in Supabase Edge Function environment variables or the production secret manager that injects those environment variables. Do not place values in app config, source files, migrations, logs, mobile bundles, or database rows.

- `ECS_SUPABASE_URL`
- `ECS_SERVICE_ROLE_KEY`
- `RIDB_API_KEY`
- `NPS_API_KEY`
- `CAMPFLARE_API_KEY`
- `ACTIVE_API_KEY`
- `ACTIVE_API_SECRET`
- `RESERVEAMERICA_API_KEY`
- `ASPIRA_API_KEY`
- `OSM_USER_AGENT`
- `OSM_ATTRIBUTION`
- Optional: `OSM_OVERPASS_URL`

Run `campground-provider-health` after deployment to confirm required secret references are configured. The health endpoint must report only booleans and missing secret names, never actual secret values.

## Provider Config Rows

Migration `supabase/migrations/020_established_campgrounds_provider_layer.sql` seeds:

- `ridb`
- `nps`
- `campflare`
- `active`
- `reserveamerica`
- `aspira`
- `osm`

These rows store non-secret metadata only: display name, base URL, priority, TTL, sync interval, attribution, and `secret_ref` names. Do not put secret values in `campground_provider_configs.secret_ref`.

Useful inspection query:

```sql
select
  provider_id,
  enabled,
  priority,
  cache_ttl_seconds,
  sync_interval_minutes,
  attribution_text,
  secret_ref,
  health_status,
  last_synced_at
from public.campground_provider_configs
order by priority, provider_id;
```

## Production Scheduling Options

Because no checked-in scheduler convention exists yet, use one of these deployment-managed options:

1. Supabase scheduled functions, if enabled for the project.
2. A trusted backend cron runner that invokes Supabase Edge Functions.
3. GitHub Actions scheduled workflow, if ECS later adds `.github/workflows`.

Each scheduled request must include an authenticated admin/operator token accepted by the sync functions. Do not use provider secrets as scheduler request headers.

Suggested cadence:

```text
02:00 UTC daily     campgrounds-sync-ridb
02:30 UTC daily     campgrounds-sync-nps
03:00 UTC daily     campgrounds-sync-active
03:20 UTC daily     campgrounds-sync-reserveamerica
03:40 UTC daily     campgrounds-sync-aspira
04:15 UTC daily     campgrounds-dedupe
Every 15-60 min     campgrounds-sync-campflare for active regions/states only
Weekly per region   campgrounds-sync-osm with explicit bbox payloads
```

For low-change or rate-limited deployments, catalog functions can run weekly. Campflare should stay more frequent only for active route regions, user-interest regions, or known campground sets where availability freshness matters.

## Manual Sync Invocation

Use manual invocation for local QA, backfills, and one-off regional refreshes. Examples use placeholder environment variables only.

RIDB catalog:

```bash
supabase functions invoke campgrounds-sync-ridb \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --body '{"limit":100,"maxPages":3,"query":"campground"}'
```

NPS catalog/enrichment:

```bash
supabase functions invoke campgrounds-sync-nps \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --body '{"limit":100,"maxPages":3}'
```

Campflare targeted availability:

```bash
supabase functions invoke campgrounds-sync-campflare \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --body '{"limit":100,"maxPages":2,"ttlSeconds":900}'
```

OSM regional bbox only:

```bash
supabase functions invoke campgrounds-sync-osm \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --body '{"minLat":37.60,"minLng":-119.90,"maxLat":37.95,"maxLng":-119.35,"limit":100}'
```

Reservation providers:

```bash
supabase functions invoke campgrounds-sync-active --project-ref "$SUPABASE_PROJECT_REF" --body '{"limit":100,"maxPages":2}'
supabase functions invoke campgrounds-sync-reserveamerica --project-ref "$SUPABASE_PROJECT_REF" --body '{"limit":100,"maxPages":2}'
supabase functions invoke campgrounds-sync-aspira --project-ref "$SUPABASE_PROJECT_REF" --body '{"limit":100,"maxPages":2}'
```

Dedupe:

```bash
supabase functions invoke campgrounds-dedupe \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --body '{"dryRun":false,"limit":500}'
```

## Local Development With Mock Fixtures

Use existing adapter fixture tests before live-provider testing:

```bash
npm run test:campgrounds-sync-ridb
npm run test:campgrounds-sync-nps
npm run test:campgrounds-sync-campflare
npm run test:campgrounds-sync-reservation-providers
npm run test:campgrounds-sync-osm
npm run test:campgrounds-dedupe
npm run test:campground-endpoints
```

Local mocks and fixtures should exercise valid records, missing coordinates, duplicate provider IDs, provider errors, pagination, expired availability, and OSM invalid geometry. Do not use real provider secrets in tests.

## Observability

Every sync function must write `campground_sync_runs`. Inspect recent runs:

```sql
select
  provider_id,
  status,
  started_at,
  finished_at,
  records_read,
  records_upserted,
  records_failed,
  error_count,
  notes
from public.campground_sync_runs
order by started_at desc
limit 50;
```

Provider-level freshness:

```sql
select
  provider_id,
  health_status,
  last_synced_at,
  sync_interval_minutes
from public.campground_provider_configs
order by provider_id;
```

Fresh availability:

```sql
select
  provider_id,
  availability_status,
  count(*) as rows,
  min(expires_at) as earliest_expiry,
  max(last_checked_at) as latest_check
from public.campground_availability
group by provider_id, availability_status
order by provider_id, availability_status;
```

Availability rows must include `expires_at` or recent `last_checked_at`. When rows expire, `campgrounds-search` must return `availabilityStatus: unknown` rather than stale availability labels.

## Troubleshooting Missing Campgrounds

1. Confirm the provider is enabled in `campground_provider_configs`.
2. Confirm the provider health endpoint reports required secrets present.
3. Check `campground_sync_runs` for errors, rate limits, and records read/upserted.
4. Query `campground_source_records` for the provider ID and provider record ID.
5. Query canonical `campgrounds` by bbox/name and confirm the record was not deduped into another canonical row.
6. Check `source_confidence`, `status`, and coordinates. Removed or invalid-coordinate records will not render on the map.
7. For OSM, confirm the bbox was explicit and small enough; global/unbounded requests are intentionally unsupported.
8. For availability, confirm `campground_availability.expires_at` is in the future or `last_checked_at` is within TTL.
9. Confirm mobile uses `campgrounds-search` and not provider APIs.

Provider enabled/configured:

```sql
select
  provider_id,
  enabled,
  health_status,
  last_synced_at,
  sync_interval_minutes,
  attribution_text,
  secret_ref
from public.campground_provider_configs
where provider_id = '<provider_id>';
```

Recent sync result:

```sql
select
  provider_id,
  status,
  started_at,
  finished_at,
  records_read,
  records_upserted,
  records_failed,
  error_count,
  notes
from public.campground_sync_runs
where provider_id = '<provider_id>'
order by started_at desc
limit 20;
```

Source provenance:

```sql
select
  campground_id,
  provider_id,
  provider_record_id,
  source_url,
  payload_hash,
  first_seen_at,
  last_seen_at
from public.campground_source_records
where provider_id = '<provider_id>'
  and provider_record_id = '<provider_record_id>';
```

Canonical lookup by bbox/name:

```sql
select
  id,
  name,
  latitude,
  longitude,
  status,
  availability_status,
  source_confidence,
  primary_provider,
  attribution,
  last_synced_at,
  last_availability_checked_at
from public.campgrounds
where longitude between <min_lng> and <max_lng>
  and latitude between <min_lat> and <max_lat>
  and name ilike '%' || <name_fragment> || '%'
order by source_confidence desc, name;
```

Availability freshness:

```sql
select
  campground_id,
  provider_id,
  availability_status,
  available_site_count,
  reservable,
  first_come_first_served,
  last_checked_at,
  expires_at
from public.campground_availability
where campground_id = '<canonical_campground_id>'
order by last_checked_at desc nulls last;
```

## Attribution Requirements

Preserve provider attribution on canonical rows and detail responses. The map/detail UI should display attribution when available. OSM attribution must remain visible where OSM-only or OSM-enriched records are shown.

## Known Limitations

- The repo does not currently include a checked-in production scheduler. Scheduling is a deployment environment responsibility until ECS adopts a standard cron/workflow pattern.
- OSM is supplemental and lower confidence. It does not establish legal status, open status, or live availability.
- Campflare availability is freshness-sensitive. Expired availability must degrade to `unknown`.
- Catalog providers may have overlapping records; `campgrounds-dedupe` should run after catalog sync batches.
- `campgrounds-search` uses cached canonical database records and should not fetch providers on every mobile map request.

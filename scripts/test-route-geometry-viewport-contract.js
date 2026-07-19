/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const migrationPath = path.join('supabase', 'migrations', '038_route_geometry_viewport_segments.sql');
const verifiedRoutesFixMigrationPath = path.join(
  'supabase',
  'migrations',
  '20260712095835_fix_route_geometry_viewport_verified_routes.sql',
);
const permissionsMigrationPath = path.join(
  'supabase',
  'migrations',
  '20260712100348_harden_route_geometry_viewport_rpc_permissions.sql',
);
const sourceFilterMigrationPath = path.join(
  'supabase',
  'migrations',
  '20260715134500_filter_route_geometry_viewport_by_source.sql',
);
const functionPath = path.join('supabase', 'functions', 'route-geometry-segments', 'index.ts');
const resultPolicyPath = path.join('supabase', 'functions', 'route-geometry-segments', 'resultPolicy.ts');
const clientPath = path.join('lib', 'routeGeometryViewportClient.ts');
const supabasePath = path.join('lib', 'supabase.ts');
const supabaseConfigPath = path.join('supabase', 'config.toml');
const deployWorkflowPath = path.join('.github', 'workflows', 'route-catalog-edge-functions-deploy.yml');
const envExamplePath = '.env.example';
const easConfigPath = 'eas.json';

assert(fs.existsSync(path.join(root, migrationPath)), 'Route geometry viewport migration should exist.');
assert(
  fs.existsSync(path.join(root, verifiedRoutesFixMigrationPath)),
  'Verified-route viewport compatibility migration should exist.',
);
assert(
  fs.existsSync(path.join(root, permissionsMigrationPath)),
  'Route geometry viewport RPC permission hardening migration should exist.',
);
assert(
  fs.existsSync(path.join(root, sourceFilterMigrationPath)),
  'Source-filtered route geometry viewport migration should exist.',
);
assert(fs.existsSync(path.join(root, functionPath)), 'route-geometry-segments Edge Function should exist.');
assert(fs.existsSync(path.join(root, resultPolicyPath)), 'Route geometry result policy should exist.');

const initialMigration = read(migrationPath);
const verifiedRoutesFixMigration = read(verifiedRoutesFixMigrationPath);
const permissionsMigration = read(permissionsMigrationPath);
const sourceFilterMigration = read(sourceFilterMigrationPath);
const migration = `${initialMigration}\n${verifiedRoutesFixMigration}\n${permissionsMigration}\n${sourceFilterMigration}`;
const edgeFunction = read(functionPath);
const resultPolicy = read(resultPolicyPath);
const viewportClient = read(clientPath);
const supabaseClient = read(supabasePath);
const supabaseConfig = read(supabaseConfigPath);
const deployWorkflow = read(deployWorkflowPath);
const envExample = read(envExamplePath);
const easConfig = JSON.parse(read(easConfigPath));

assert(
  migration.includes('search_route_geometry_segments_for_viewport') &&
    migration.includes('ST_MakeEnvelope') &&
    migration.includes('ST_Intersects') &&
    migration.includes('ST_AsGeoJSON') &&
    migration.includes('route_segments') &&
    migration.includes("legality_status <> 'closed_or_prohibited'") &&
    migration.includes("public_access_status <> 'closed'"),
  'Migration should expose a bounded PostGIS viewport RPC that excludes closed/prohibited segments.',
);
assert(
  migration.includes('alter table public.route_segment_sources') &&
    migration.includes('add column if not exists last_verified_at timestamptz') &&
    migration.indexOf('add column if not exists last_verified_at timestamptz') <
      migration.indexOf('create or replace function public.search_route_geometry_segments_for_viewport') &&
    migration.includes('coalesce(rss.last_verified_at, dl.source_last_updated)'),
  'Viewport migration should add route_segment_sources.last_verified_at before the RPC reads it.',
);
assert(
  verifiedRoutesFixMigration.includes('public.verified_routes') &&
    verifiedRoutesFixMigration.includes('verified_routes_route_geometry_viewport_idx') &&
    verifiedRoutesFixMigration.includes('ST_GeomFromGeoJSON(vr.route_geometry::text)') &&
    verifiedRoutesFixMigration.includes("vr.review_status = 'approved'") &&
    verifiedRoutesFixMigration.includes('vr.active_closure_count = 0') &&
    verifiedRoutesFixMigration.includes("'verified_routes'::text as catalog_origin") &&
    verifiedRoutesFixMigration.includes('public.verified_route_sources') &&
    verifiedRoutesFixMigration.includes('join public.route_sources') &&
    verifiedRoutesFixMigration.includes('union all') &&
    verifiedRoutesFixMigration.includes('select * from route_segment_candidates') &&
    verifiedRoutesFixMigration.includes('select * from verified_route_candidates'),
  'Viewport RPC should merge the populated verified-route catalog with route_segments, source labels, and safety filters.',
);
assert(
  migration.includes('grant execute on function public.search_route_geometry_segments_for_viewport') &&
    migration.includes('to service_role') &&
    permissionsMigration.includes('from public, anon, authenticated') &&
    !migration.includes('to anon') &&
    !migration.includes('to authenticated'),
  'Viewport RPC should be callable by service_role only.',
);
const sourceFilterRankIndex = sourceFilterMigration.indexOf('ranked_candidates as');
assert(
  sourceFilterMigration.includes('search_route_geometry_segments_for_viewport_v2') &&
    sourceFilterMigration.includes('p_source_provider_prefix text default null') &&
    sourceFilterMigration.includes('from public.route_segment_sources rss') &&
    sourceFilterMigration.includes('from public.verified_route_sources vrs') &&
    sourceFilterMigration.includes('left(lower(rs.provider_id), char_length(b.source_provider_prefix))') &&
    sourceFilterMigration.indexOf('from public.route_segment_sources rss') < sourceFilterRankIndex &&
    sourceFilterMigration.indexOf('from public.verified_route_sources vrs') < sourceFilterRankIndex,
  'Source-specific candidates must be filtered in both catalogs before ranking and limiting.',
);
assert(
  sourceFilterMigration.includes('revoke all on function public.search_route_geometry_segments_for_viewport_v2') &&
    sourceFilterMigration.includes('from public, anon, authenticated') &&
    sourceFilterMigration.includes('grant execute on function public.search_route_geometry_segments_for_viewport_v2') &&
    sourceFilterMigration.includes('to service_role') &&
    sourceFilterMigration.includes("notify pgrst, 'reload schema'"),
  'The source-filtered RPC must remain service-role only and refresh the PostgREST schema cache.',
);

for (const required of [
  'ECS_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'verified_routes',
  'routeGeometryUnavailableResponse',
  'degraded: true',
  'unavailableReason',
  'userMessage',
  "rpc('search_route_geometry_segments_for_viewport'",
  "rpc('search_route_geometry_segments_for_viewport_v2'",
  'cleanBbox',
  'cleanZoom',
  'includeReferenceGeometry',
  'resultLimit',
  'cappedCount',
  'skippedMissingGeometryCount',
  'source_records',
  'sourceProviderPrefix',
  'rowMatchesSourceProviderPrefix',
  'invalidFeatureCount',
  'isMissingSourceFilteredRpc',
  'sourceFilterMode',
  'source_filter_migration_unavailable',
  'ROUTE_GEOMETRY_CANDIDATE_INSPECTION_LIMIT',
  'selectRouteGeometrySearchResults',
  'qualifyingUniqueCount',
  'additionalMatchesAvailable',
]) {
  assert(edgeFunction.includes(required), `route-geometry-segments should include ${required}.`);
}
assert(
  edgeFunction.indexOf('const rankedCandidates =') < edgeFunction.indexOf('const selection =') &&
    !edgeFunction.includes('.slice(0, maxLimit)') &&
    resultPolicy.includes('ROUTE_GEOMETRY_SEARCH_RESULT_LIMIT = 20') &&
    resultPolicy.includes('uniqueRecords.slice(0, resultLimit)'),
  'Edge geometry must filter and shape the wider inspection window before deterministic dedupe and the final top-20 slice.',
);
assert(
  !edgeFunction.includes('}, 503)') &&
    !edgeFunction.includes('status, 503') &&
    edgeFunction.includes("return routeGeometryUnavailableResponse('backend_unavailable', sourceProviderPrefix);"),
  'Route geometry viewport function should degrade with a 200 JSON payload instead of surfacing Supabase non-2XX errors.',
);

assert(
  viewportClient.includes('getRouteGeometryViewportProviderAvailability') &&
    viewportClient.includes('normalizeRouteGeometryViewportLimit') &&
    viewportClient.includes('normalizeRouteGeometryViewportResponse(data, sourceProviderPrefix)') &&
    viewportClient.includes('sourceProviderPrefix,'),
  'Viewport client should preflight provider availability, clamp the request, and normalize source filtering before the cap.',
);
assert(
  /\[functions\.route-geometry-segments\][\s\S]*?verify_jwt = false[\s\S]*?entrypoint = "\.\/functions\/route-geometry-segments\/index\.ts"/.test(supabaseConfig),
  'Public route geometry reads must be explicitly configured in Supabase.',
);
assert(
  deployWorkflow.includes("'supabase/functions/route-geometry-segments/**'") &&
    deployWorkflow.includes('supabase functions deploy "route-geometry-segments"') &&
    deployWorkflow.includes('| route-geometry-segments | Public source-filtered viewport geometry |'),
  'Route catalog deployment must watch, deploy, and summarize route-geometry-segments.',
);
assert(
  !edgeFunction.includes('RIDB_API_KEY') &&
    !edgeFunction.includes('NPS_API_KEY') &&
    !edgeFunction.includes('CAMPFLARE_API_KEY') &&
    !edgeFunction.includes('ACTIVE_API_KEY') &&
    !edgeFunction.includes('RESERVEAMERICA_API_KEY'),
  'Route geometry viewport function must not expose campground/provider secrets.',
);

assert(
  supabaseClient.includes('"route-geometry-segments"'),
  'Supabase client allowlist should include the route-geometry-segments Edge Function.',
);
assert(
  envExample.includes('EXPO_PUBLIC_ECS_ROUTE_GEOMETRY_VIEWPORT_OVERLAY=true') &&
    envExample.includes('emergency rollout kill switch'),
  '.env.example should enable the deployed route geometry viewport service while preserving an emergency kill switch.',
);
for (const profile of ['preview', 'fieldtest', 'campops-preview', 'production']) {
  assert.strictEqual(
    easConfig.build?.[profile]?.env?.EXPO_PUBLIC_ECS_ROUTE_GEOMETRY_VIEWPORT_OVERLAY,
    'true',
    `${profile} EAS builds should explicitly enable the deployed route geometry viewport service.`,
  );
}

console.log('Route geometry viewport server contract checks passed.');

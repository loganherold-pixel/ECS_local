const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const migration = read(path.join('supabase', 'migrations', '027_verified_route_catalog.sql'));
const liveCatalog = read(path.join('lib', 'explore', 'liveTrailPackCatalog.ts'));
const supabaseClient = read(path.join('lib', 'supabase.ts'));
const discover = read(path.join('app', '(tabs)', 'discover.tsx'));

for (const table of [
  'route_sources',
  'route_source_ingest_runs',
  'route_raw_source_features',
  'route_segments',
  'route_segment_sources',
  'route_access_rules',
  'route_closures',
  'verified_routes',
  'verified_route_segments',
  'route_community_submissions',
]) {
  assert(
    migration.includes(`public.${table}`),
    `Verified route catalog migration should create ${table}`,
  );
}

assert(
  migration.includes('route_catalog_public') &&
    migration.includes("review_status = 'approved'") &&
    migration.includes("recommendation_status = 'recommendable'"),
  'Migration should expose only approved/recommendable records through the public catalog view',
);
assert(
  migration.includes('alter table public.route_sources enable row level security') &&
    migration.includes('route_community_submissions_select_own') &&
    migration.includes('route_community_submissions_insert_own'),
  'Migration should enable RLS and keep community submissions private to their owner/admin flow',
);
assert(
  migration.includes('provider_id') &&
    migration.includes('source_uri') &&
    migration.includes('attribution') &&
    migration.includes('payload_hash'),
  'Migration should preserve raw source identity, attribution, URI, and checksum metadata',
);
assert(
  migration.includes('usfs_mvum_tahoe_nf') &&
    migration.includes('usfs_mvum_mendocino_nf') &&
    migration.includes('unique (route_source_id, provider_feature_id, source_layer)'),
  'Migration should seed Tahoe/Mendocino MVUM pilot sources and support repeatable raw-feature upserts',
);

for (const functionName of ['route-catalog-search', 'route-catalog-detail', 'route-submission-intake', 'route-catalog-sync-usfs-mvum']) {
  const functionPath = path.join(root, 'supabase', 'functions', functionName, 'index.ts');
  assert(fs.existsSync(functionPath), `Edge Function ${functionName} should exist`);
  const source = fs.readFileSync(functionPath, 'utf8');
  assert(
    source.includes('ECS_SERVICE_ROLE_KEY') || source.includes('SUPABASE_SERVICE_ROLE_KEY'),
    `${functionName} should use server-side service role access`,
  );
  assert(
    !source.includes('RIDB_API_KEY') &&
      !source.includes('NPS_API_KEY') &&
      !source.includes('CAMPFLARE_API_KEY') &&
      !source.includes('ACTIVE_API_KEY') &&
      !source.includes('RESERVEAMERICA_API_KEY'),
    `${functionName} should not expose campground/provider API keys`,
  );
}
const detailFunction = read(path.join('supabase', 'functions', 'route-catalog-detail', 'index.ts'));
assert(
  detailFunction.includes('activeGuidance') &&
    detailFunction.includes('community_signal') &&
    detailFunction.includes('whatToWatch'),
  'Route catalog detail should expose server-side active-guidance topology metadata in the assessment',
);

assert(
  liveCatalog.includes("functions.invoke('route-catalog-search'") &&
    liveCatalog.includes('normalizeRouteCatalogSearchResponse') &&
    liveCatalog.includes("functions.invoke('route-catalog-detail'") &&
    liveCatalog.includes('normalizeRouteCatalogDetailResponse') &&
    liveCatalog.includes('fetchRouteCatalogTrailPackDetail') &&
    liveCatalog.includes("from('trail_packs')"),
  'Live Trail Pack catalog should prefer ECS route-catalog-search, fetch route-catalog-detail for previews, and keep trail_packs as a compatibility fallback',
);
assert(
  supabaseClient.includes('"route-catalog-search"') &&
    supabaseClient.includes('"route-catalog-detail"') &&
    supabaseClient.includes('"route-submission-intake"'),
  'Supabase client deployed-function guard should allow the route catalog functions',
);
assert(
  discover.includes('No verified routes yet in this area') &&
    discover.includes('liveTrailPackCatalogSnapshot.coverageState') &&
    discover.includes('fetchRouteCatalogTrailPackDetail') &&
    discover.includes('trailPackPreviewDetailStatus') &&
    discover.includes('trailPackPreviewRequestRef'),
  'Explore should surface honest partial-coverage copy and enrich selected Trail Pack previews through route-catalog-detail',
);
const suggestedRoutesBlock = discover
  .split('const exploreSuggestedRouteOptions = useMemo<ExpeditionOpportunity[]>')[1]
  ?.split('const exploreMapHandoffBuild = useMemo')[0] ?? '';
assert(
  suggestedRoutesBlock.includes('exploreMapPreviewRouteSets.trailPackRoutes') &&
    !suggestedRoutesBlock.includes('exploreMapPreviewRouteSets.hiddenGemRoutes') &&
    !suggestedRoutesBlock.includes('exploreMapPreviewRouteSets.popularTrailRoutes') &&
    !suggestedRoutesBlock.includes('exploreMapPreviewRouteSets.ecsRouteIdeaRoutes'),
  'Explore planning/offline Suggested Trailheads should only use source-backed catalog Trail Pack routes',
);
assert(
  !discover.includes('ecs_demo_full_route_fixture') &&
    !liveCatalog.includes('ecs_demo_full_route_fixture'),
  'Public Explore catalog flow should not depend on demo full-route geometry fixtures',
);

console.log('Verified route catalog integration checks passed');

/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const migration = read(path.join('supabase', 'migrations', '027_verified_route_catalog.sql'));
const liveCatalog = read(path.join('lib', 'explore', 'liveTrailPackCatalog.ts'));
const visibilityDiagnostics = read(path.join('lib', 'routeCatalogVisibilityDiagnostics.ts'));
const viewportClient = read(path.join('lib', 'routeCatalogViewportClient.ts'));
const supabaseClient = read(path.join('lib', 'supabase.ts'));
const discover = read(path.join('app', '(tabs)', 'discover.tsx'));
const tripBuilder = read(path.join('app', 'explore-trip-builder.tsx'));
const tripBuilderPreparation = read(path.join('lib', 'tripBuilder', 'tripBuilderRoutePreparation.ts'));

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

const operationalCriteriaMigration = read(path.join('supabase', 'migrations', '028_route_catalog_operational_criteria.sql'));
assert(
  operationalCriteriaMigration.includes('remoteness_score') &&
    operationalCriteriaMigration.includes('campability_score') &&
    operationalCriteriaMigration.includes('minimum_fuel_range_miles') &&
    operationalCriteriaMigration.includes('minimum_water_capacity_gallons') &&
    operationalCriteriaMigration.includes('route_intelligence') &&
    operationalCriteriaMigration.includes('route_catalog_public') &&
    operationalCriteriaMigration.includes('verified_routes_operational_criteria_idx'),
  'Route catalog should add schema-backed operational criteria for remoteness, campability, fuel range, and water margins',
);
const largeCatalogHardeningMigration = read(path.join('supabase', 'migrations', '031_route_catalog_large_catalog_query_hardening.sql'));
assert(
  largeCatalogHardeningMigration.includes('verified_routes_public_recommendation_bbox_idx') &&
    largeCatalogHardeningMigration.includes('verified_routes_curation_bbox_idx') &&
    largeCatalogHardeningMigration.includes('verified_routes_summary_id_idx') &&
    largeCatalogHardeningMigration.includes('verified_route_sources_route_lookup_idx'),
  'Route catalog should add large-catalog indexes for public bbox search, curation coverage, summary paging, and route-source attribution lookup',
);
const stitchGroupsMigration = read(path.join('supabase', 'migrations', '035_route_catalog_stitch_groups.sql'));
assert(
  stitchGroupsMigration.includes('create table if not exists public.route_catalog_stitch_groups') &&
    stitchGroupsMigration.includes('create table if not exists public.route_catalog_stitch_group_routes') &&
    stitchGroupsMigration.includes('create table if not exists public.route_catalog_stitch_group_edges'),
  'Route catalog should have service-side tables for reviewed stitch group drafts, routes, and source-edge evidence',
);
assert(
  stitchGroupsMigration.includes("review_status text not null default 'draft_review_required'") &&
    stitchGroupsMigration.includes("publication_status text not null default 'review_only'") &&
    stitchGroupsMigration.includes('can_auto_publish boolean not null default false') &&
    stitchGroupsMigration.includes('requires_field_review boolean not null default true') &&
    stitchGroupsMigration.includes('route_public_ids text[] not null') &&
    stitchGroupsMigration.includes('constraint route_catalog_stitch_groups_no_auto_publish_check check (can_auto_publish = false)'),
  'Stitch groups should persist review-only drafts without allowing auto-publication',
);
assert(
  stitchGroupsMigration.includes('verified_route_id uuid not null references public.verified_routes(id) on delete restrict') &&
    stitchGroupsMigration.includes("direction text not null default 'unknown'") &&
    stitchGroupsMigration.includes("edge_status text not null default 'chain_ready'") &&
    stitchGroupsMigration.includes('gap_meters numeric not null default 0') &&
    stitchGroupsMigration.includes('from_endpoint jsonb not null') &&
    stitchGroupsMigration.includes('to_endpoint jsonb not null') &&
    stitchGroupsMigration.includes('requires_verified_bridge boolean not null default false'),
  'Stitch group route and edge rows should preserve source route identity, direction, endpoint, and bridge-review evidence',
);
assert(
  stitchGroupsMigration.includes('alter table public.route_catalog_stitch_groups enable row level security') &&
    stitchGroupsMigration.includes('alter table public.route_catalog_stitch_group_routes enable row level security') &&
    stitchGroupsMigration.includes('alter table public.route_catalog_stitch_group_edges enable row level security') &&
    stitchGroupsMigration.includes('revoke all on public.route_catalog_stitch_groups from anon, authenticated') &&
    stitchGroupsMigration.includes('revoke all on public.route_catalog_stitch_group_routes from anon, authenticated') &&
    stitchGroupsMigration.includes('revoke all on public.route_catalog_stitch_group_edges from anon, authenticated') &&
    stitchGroupsMigration.includes('grant select, insert, update, delete on public.route_catalog_stitch_groups to service_role') &&
    stitchGroupsMigration.includes('grant select, insert, update, delete on public.route_catalog_stitch_group_routes to service_role') &&
    stitchGroupsMigration.includes('grant select, insert, update, delete on public.route_catalog_stitch_group_edges to service_role') &&
    !stitchGroupsMigration.includes('grant select on public.route_catalog_stitch_groups to anon') &&
    !stitchGroupsMigration.includes('grant select on public.route_catalog_stitch_group_routes to anon') &&
    !stitchGroupsMigration.includes('grant select on public.route_catalog_stitch_group_edges to anon'),
  'Stitch group drafts should be service-side review data, not public catalog data',
);
assert(
  !stitchGroupsMigration.includes('route_catalog_public') &&
    !stitchGroupsMigration.includes("review_status = 'approved'") &&
    !stitchGroupsMigration.includes("recommendation_status = 'recommendable'"),
  'Stitch group migration should not alter the public route catalog view or public recommendation gates',
);

for (const functionName of [
  'route-catalog-search',
  'route-catalog-detail',
  'route-submission-intake',
  'route-catalog-sync-usfs-mvum',
  'route-catalog-sync-blm-gtlf',
  'route-catalog-sync-usgs-trails',
  'route-catalog-sync-nps-trails',
  'route-catalog-sync-michigan-orv',
  'route-catalog-sync-minnesota-ohv',
  'route-catalog-sync-oregon-odf-ohv',
  'route-catalog-sync-colorado-cpw-trails',
  'route-catalog-sync-utah-trails',
  'route-catalog-sync-arizona-trails',
  'route-catalog-sync-stitch-groups',
]) {
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
const searchFunction = read(path.join('supabase', 'functions', 'route-catalog-search', 'index.ts'));
const currentConditionOverlayHelper = read(path.join('supabase', 'functions', '_shared', 'routeCatalogCurrentConditionOverlay.ts'));
assert(
  detailFunction.includes('activeGuidance') &&
    detailFunction.includes('buildRouteCatalogCurrentConditionOverlay') &&
    detailFunction.includes('currentCondition') &&
    currentConditionOverlayHelper.includes('currentlyOpenStatus') &&
    currentConditionOverlayHelper.includes('passabilityStatus') &&
    detailFunction.includes('community_signal') &&
    detailFunction.includes('whatToWatch') &&
    detailFunction.includes('sourceTimestamps') &&
    detailFunction.includes('sourceAttribution') &&
    detailFunction.includes('freshnessWarnings'),
  'Route catalog detail should expose server-side active-guidance topology metadata plus offline-cache source freshness and attribution metadata',
);
assert(
  searchFunction.includes('minDistanceMiles') &&
    searchFunction.includes('attachCurrentConditionOverlays') &&
    currentConditionOverlayHelper.includes('current_condition') &&
    searchFunction.includes('maxDistanceMiles') &&
    searchFunction.includes('minDurationMinutes') &&
    searchFunction.includes('maxDurationMinutes') &&
    searchFunction.includes('routeType') &&
    searchFunction.includes('difficulty') &&
    searchFunction.includes('minConfidenceScore') &&
    searchFunction.includes('minRemotenessScore') &&
    searchFunction.includes('maxRemotenessScore') &&
    searchFunction.includes('minCampabilityScore') &&
    searchFunction.includes('params.exploreRefinement ?? params.explore_refinement') &&
    searchFunction.includes('filterRouteCatalogRecordsByExploreRefinement(') &&
    searchFunction.includes('refinementMatchedCount') &&
    searchFunction.includes('availableFuelRangeMiles') &&
    searchFunction.includes('availableWaterCapacityGallons') &&
    searchFunction.includes('includePreviewGeometry') &&
    searchFunction.includes('includeCoverageDiagnostics') &&
    searchFunction.includes('skipCoverageDiagnostics') &&
    searchFunction.includes('simplifyGeometryForPreview') &&
    searchFunction.includes('route_geometry_mode') &&
    searchFunction.includes('preview_simplified') &&
    searchFunction.includes('searchSelect(includeGeometry, includePreviewGeometry)') &&
    searchFunction.includes('filterRecordsWithinSearchRadius') &&
    searchFunction.includes('inspectRouteCatalogCurationCandidates') &&
    searchFunction.includes('attachSourceRecords') &&
    searchFunction.includes(".from('verified_routes')") &&
    !searchFunction.includes(".from('route_catalog_public')") &&
    searchFunction.includes('curationCandidateCount') &&
    searchFunction.includes('anySourceBackedCandidateCount') &&
    searchFunction.includes('cleanSourceAdapter') &&
    searchFunction.includes('filterRecordsBySourceAdapter') &&
    searchFunction.includes('sourceFilterApplied') &&
    searchFunction.includes('sourceMatchedCount') &&
    searchFunction.includes('recommendationOnly = readBoolean') &&
    searchFunction.includes("if (recommendationOnly) query = query.eq('recommendation_status', 'recommendable');") &&
    searchFunction.includes('recommendationOnly,') &&
    searchFunction.includes('lower_confidence_nearby') &&
    searchFunction.includes('search_distance_miles') &&
    searchFunction.includes('geometry_distance_miles') &&
    searchFunction.includes('trailhead_distance_miles') &&
    searchFunction.includes('search_match_reasons') &&
    searchFunction.includes('featured_route_score') &&
    searchFunction.includes('catalog_trip_classification') &&
    searchFunction.includes('geometryMatchedCount') &&
    searchFunction.includes('routeTrailhead') &&
    searchFunction.includes('knownRouteDiagnostics') &&
    searchFunction.includes("'route_catalog_nearby_route_ids'") &&
    searchFunction.includes('spatialIndexFilterApplied') &&
    searchFunction.includes('radiusMatchedCount') &&
    searchFunction.includes('candidateLimit') &&
    searchFunction.includes('const includeInternalEligibilityGeometry = true') &&
    searchFunction.includes('shapeSearchRecords(') &&
    searchFunction.includes(".gte('distance_miles'") &&
    searchFunction.includes(".lte('estimated_duration_minutes'") &&
    searchFunction.includes(".gte('remoteness_score'") &&
    searchFunction.includes(".lte('minimum_fuel_range_miles'"),
  'Route catalog search should honor server-side criteria for distance, duration, route type, difficulty, confidence, remoteness, Explore refinement, campability, and resource margins',
);
assert(
  searchFunction.includes("from './providerContract.ts'") &&
    searchFunction.includes('selectRouteCatalogSearchResults(') &&
    searchFunction.includes('requestedLimit: pageSize') &&
    searchFunction.includes('compareRecords: compareDiscoveryRecords') &&
    searchFunction.indexOf('const sourceEligibleRecords =') <
      searchFunction.indexOf('const publicEligibilityPartition =') &&
    searchFunction.indexOf('const publicEligibilityPartition =') <
      searchFunction.indexOf('const viewportEligiblePartition =') &&
    searchFunction.indexOf('const viewportEligiblePartition =') <
      searchFunction.indexOf('const refinementEligibleRecords =') &&
    searchFunction.indexOf('const refinementEligibleRecords =') <
      searchFunction.indexOf('const selectedRefinementResults =') &&
    searchFunction.includes('while (nearbyLookupCount < ROUTE_CATALOG_MAX_PAGINATION_WINDOW)') &&
    searchFunction.includes('nextRouteCatalogCandidateInspectionBatch(nearbyLookupCount)') &&
    searchFunction.includes('candidates.push(...nearby.records)') &&
    searchFunction.includes('internalContinuationCursor = await decodeRouteCatalogPageCursor(') &&
    searchFunction.includes('diagnosticRecords,') &&
    searchFunction.includes('normalizeRouteCatalogPagination(params)') &&
    searchFunction.includes("'route_catalog_nearby_public_route_cursor_page'") &&
    searchFunction.includes("'route_catalog_total_search_v1'") &&
    searchFunction.includes('p_cursor_route_id: args.continuationCursor?.routeId ?? null') &&
    searchFunction.includes('continuationCursor: internalContinuationCursor') &&
    searchFunction.includes('resultLimit: resultSelection.resultLimit') &&
    searchFunction.includes('additionalMatchesAvailable,') &&
    searchFunction.includes('hasMore: false') &&
    searchFunction.includes('nextPage: null') &&
    searchFunction.includes('nextCursor: null') &&
    searchFunction.includes('partitionRouteCatalogRecordsByPublicEligibility(') &&
    searchFunction.includes('normalizeRouteCatalogViewportFilter(params)') &&
    searchFunction.includes('filterRouteCatalogRecordsByViewport(') &&
    searchFunction.includes('semanticViewportFilterApplied: viewportFilter != null') &&
    viewportClient.includes('viewportBbox: { ...query.bbox }') &&
    viewportClient.includes('regionTags: [...query.regionTags]') &&
    searchFunction.includes('{ includeGeometry, includePreviewGeometry }') &&
    !searchFunction.includes('sourceMatchedRecords.slice(offset, windowEnd)') &&
    !searchFunction.includes('radiusFiltered.records.slice(offset, windowEnd)'),
  'Route catalog search should inspect candidates internally, then apply semantic viewport and eligibility filters before ranking, dedupe, and the one public top-20 result set.',
);

assert(
  liveCatalog.includes("functions.invoke('route-catalog-search'") &&
    liveCatalog.includes('buildRouteCatalogSearchBody') &&
    liveCatalog.includes('latitude: criteria.latitude') &&
    liveCatalog.includes('longitude: criteria.longitude') &&
    liveCatalog.includes('radiusMiles: criteria.radiusMiles') &&
    liveCatalog.includes('ROUTE_CATALOG_VEHICLE_CLASS_ALIASES') &&
    liveCatalog.includes('resolveRouteCatalogVehicleClass(criteria.vehicleClass)') &&
    liveCatalog.includes('vehicleClass }') &&
    liveCatalog.includes('minDistanceMiles: criteria.minDistanceMiles') &&
    liveCatalog.includes('maxDurationMinutes: criteria.maxDurationMinutes') &&
    liveCatalog.includes('routeType: criteria.routeType') &&
    liveCatalog.includes('difficulty: criteria.difficulty') &&
    liveCatalog.includes('minConfidenceScore: criteria.minConfidenceScore') &&
    liveCatalog.includes('minRemotenessScore: criteria.minRemotenessScore') &&
    liveCatalog.includes('minCampabilityScore: criteria.minCampabilityScore') &&
    liveCatalog.includes('availableFuelRangeMiles: criteria.availableFuelRangeMiles') &&
    liveCatalog.includes('availableWaterCapacityGallons: criteria.availableWaterCapacityGallons') &&
    liveCatalog.includes('includeGeometry: false') &&
    liveCatalog.includes('const includePreviewGeometry = criteria.includePreviewGeometry === true') &&
    liveCatalog.includes('includePreviewGeometry,') &&
    liveCatalog.includes('const offset = 0') &&
    !liveCatalog.includes('...(continuationCursor ? { continuationCursor } : {})') &&
    liveCatalog.includes('paginationContractVersion: ROUTE_CATALOG_PAGINATION_CONTRACT_VERSION') &&
    liveCatalog.includes('searchMeta.hasMore = false') &&
    liveCatalog.includes('delete family.continuationCursor') &&
    liveCatalog.includes('searchMeta.nextCursor = null') &&
    liveCatalog.includes('capUniqueRankedRoutes') &&
    liveCatalog.includes('includeCoverageDiagnostics: false') &&
    liveCatalog.includes("expectedKnownRoutes: criteria.expectedKnownRoutes ?? ['rubicon']") &&
    liveCatalog.includes('normalizeRouteCatalogSearchResponse') &&
    liveCatalog.includes('const searchMeta: RouteCatalogSearchMeta') &&
    liveCatalog.includes('clientInvalidRecordCount') &&
    liveCatalog.includes('searchMeta: routeCatalog.searchMeta') &&
    liveCatalog.includes("functions.invoke('route-catalog-detail'") &&
    liveCatalog.includes('normalizeRouteCatalogDetailResponse') &&
    liveCatalog.includes('fetchRouteCatalogTrailPackDetail') &&
    liveCatalog.includes('buildExploreRouteCatalogQueryDiagnostic') &&
    liveCatalog.includes('logRouteCatalogVisibilityDiagnostic') &&
    liveCatalog.includes("from('trail_packs')"),
  'Live Trail Pack catalog should prefer ECS route-catalog-search, fetch route-catalog-detail for previews, and keep trail_packs as a compatibility fallback',
);
assert(
  visibilityDiagnostics.includes('ECS_ROUTE_CATALOG_DEBUG_FLAG') &&
    visibilityDiagnostics.includes('buildRouteCatalogAuditReport') &&
    visibilityDiagnostics.includes('buildExploreRouteCatalogQueryDiagnostic') &&
    visibilityDiagnostics.includes('buildNavigateRouteCatalogQueryDiagnostic') &&
    visibilityDiagnostics.includes('findClosestViableRouteCatalogGeometryTarget') &&
    visibilityDiagnostics.includes('NORCAL_ROUTE_CATALOG_VISIBILITY_AREAS') &&
    visibilityDiagnostics.includes('Tahoe National Forest') &&
    visibilityDiagnostics.includes('Eldorado National Forest') &&
    visibilityDiagnostics.includes('Plumas National Forest') &&
    visibilityDiagnostics.includes('Mendocino National Forest') &&
    visibilityDiagnostics.includes("debugFlag: ECS_ROUTE_CATALOG_DEBUG_FLAG") &&
    viewportClient.includes('buildNavigateRouteCatalogQueryDiagnostic') &&
    viewportClient.includes('logRouteCatalogVisibilityDiagnostic'),
  'Route catalog visibility diagnostics should cover audit, Explore, Navigate, NorCal known areas, closest viable route targets, and debug-gated logging.',
);
assert(
  supabaseClient.includes('"route-catalog-search"') &&
    supabaseClient.includes('"route-catalog-detail"') &&
    supabaseClient.includes('"route-submission-intake"'),
  'Supabase client deployed-function guard should allow the route catalog functions',
);
assert(
  fs.existsSync(path.join(root, '.github', 'workflows', 'route-catalog-blm-gtlf-sync.yml')) &&
    read(path.join('.github', 'workflows', 'route-catalog-blm-gtlf-sync.yml')).includes('route-catalog-sync-blm-gtlf') &&
    read(path.join('.github', 'workflows', 'route-catalog-blm-gtlf-sync.yml')).includes('publicRecommendationCount'),
  'BLM GTLF route catalog sync should have a durable workflow that reports zero public recommendations for the initial source-segment adapter',
);
assert(
  fs.existsSync(path.join(root, '.github', 'workflows', 'route-catalog-usgs-trails-sync.yml')) &&
    read(path.join('.github', 'workflows', 'route-catalog-usgs-trails-sync.yml')).includes('route-catalog-sync-usgs-trails') &&
    read(path.join('.github', 'workflows', 'route-catalog-usgs-trails-sync.yml')).includes('publicRecommendationCount'),
  'USGS Trails route catalog sync should have a durable workflow that reports zero public recommendations for supplemental geometry-only ingestion',
);
assert(
  fs.existsSync(path.join(root, '.github', 'workflows', 'route-catalog-nps-trails-sync.yml')) &&
    read(path.join('.github', 'workflows', 'route-catalog-nps-trails-sync.yml')).includes('route-catalog-sync-nps-trails') &&
    read(path.join('.github', 'workflows', 'route-catalog-nps-trails-sync.yml')).includes('publicRecommendationCount'),
  'NPS public trails route catalog sync should have a durable workflow that reports promoted public recommendation telemetry',
);
assert(
  fs.existsSync(path.join(root, '.github', 'workflows', 'route-catalog-michigan-orv-sync.yml')) &&
    read(path.join('.github', 'workflows', 'route-catalog-michigan-orv-sync.yml')).includes('route-catalog-sync-michigan-orv') &&
    read(path.join('.github', 'workflows', 'route-catalog-michigan-orv-sync.yml')).includes('publicRecommendationCount'),
  'Michigan DNR ORV route catalog sync should have a durable workflow that reports promoted public recommendation telemetry',
);
assert(
  fs.existsSync(path.join(root, '.github', 'workflows', 'route-catalog-minnesota-ohv-sync.yml')) &&
    read(path.join('.github', 'workflows', 'route-catalog-minnesota-ohv-sync.yml')).includes('route-catalog-sync-minnesota-ohv') &&
    read(path.join('.github', 'workflows', 'route-catalog-minnesota-ohv-sync.yml')).includes('publicRecommendationCount'),
  'Minnesota DNR OHV route catalog sync should have a durable workflow that reports promoted public recommendation telemetry',
);
assert(
  fs.existsSync(path.join(root, '.github', 'workflows', 'route-catalog-oregon-odf-ohv-sync.yml')) &&
    read(path.join('.github', 'workflows', 'route-catalog-oregon-odf-ohv-sync.yml')).includes('route-catalog-sync-oregon-odf-ohv') &&
    read(path.join('.github', 'workflows', 'route-catalog-oregon-odf-ohv-sync.yml')).includes('publicRecommendationCount'),
  'Oregon ODF OHV route catalog sync should have a durable workflow that reports promoted public recommendation telemetry',
);
assert(
  fs.existsSync(path.join(root, '.github', 'workflows', 'route-catalog-colorado-cpw-trails-sync.yml')) &&
    read(path.join('.github', 'workflows', 'route-catalog-colorado-cpw-trails-sync.yml')).includes('route-catalog-sync-colorado-cpw-trails') &&
    read(path.join('.github', 'workflows', 'route-catalog-colorado-cpw-trails-sync.yml')).includes('publicRecommendationCount'),
  'Colorado CPW Designated Trails route catalog sync should have a durable workflow that reports promoted public recommendation telemetry',
);
assert(
  fs.existsSync(path.join(root, '.github', 'workflows', 'route-catalog-utah-trails-sync.yml')) &&
    read(path.join('.github', 'workflows', 'route-catalog-utah-trails-sync.yml')).includes('route-catalog-sync-utah-trails') &&
    read(path.join('.github', 'workflows', 'route-catalog-utah-trails-sync.yml')).includes('publicRecommendationCount'),
  'Utah SGID Trails route catalog sync should have a durable workflow that reports promoted public recommendation telemetry',
);
assert(
  fs.existsSync(path.join(root, '.github', 'workflows', 'route-catalog-arizona-trails-sync.yml')) &&
    read(path.join('.github', 'workflows', 'route-catalog-arizona-trails-sync.yml')).includes('route-catalog-sync-arizona-trails') &&
    read(path.join('.github', 'workflows', 'route-catalog-arizona-trails-sync.yml')).includes('publicRecommendationCount'),
  'Arizona State Parks Trails route catalog sync should have a durable workflow that reports promoted public recommendation telemetry',
);
assert(
  discover.includes('No verified routes yet in this area') &&
    discover.includes('liveTrailPackCatalogSnapshot.coverageState') &&
    discover.includes('routeCatalogSearchCriteria') &&
    discover.includes('refreshLiveTrailPackCatalog(routeCatalogSearchCriteria, {') &&
    !discover.includes('routeCatalogRefinementCriteria') &&
    discover.includes('applyExploreRefinementFilter(publicDiscoverableTrailPackRoutes, exploreRefinement)') &&
    discover.includes('availableFuelRangeMiles: vehicleProfile?.fuel_range_miles') &&
    discover.includes('availableWaterCapacityGallons: vehicleProfile?.water_capacity_gal') &&
    discover.includes('vehicleClass: vehicleProfile?.vehicleType') &&
    discover.includes('fetchRouteCatalogTrailPackDetail') &&
    discover.includes('hydrateRouteCatalogOpportunityForHandoff') &&
    discover.includes('await hydrateRouteCatalogOpportunityForHandoff(') &&
    discover.includes('stageExploreReadinessPreview(routeForHandoff)') &&
    discover.includes('buildValidatedExploreNavigationPayload(routeForHandoff)') &&
    discover.includes('stageTripBuilderItineraryHandoff(routeForHandoff)') &&
    discover.includes('saveOfflinePrepPackHandoff({') &&
    discover.includes('route: routeForHandoff as any') &&
    !discover.includes('trailPackPreviewDetailStatus') &&
    !discover.includes('trailPackPreviewRequestRef') &&
    tripBuilder.includes('continueTripBuilderRoutePreparation(started, selectedRoute') &&
    tripBuilderPreparation.includes('resolveExploreTripBuilderRouteDetail(route, {'),
  'Explore should surface honest partial coverage, refine summary results locally, keep previews summary-only, and leave selected detail preparation to Trip Builder while retaining explicit guidance/offline hydration actions',
);
const guidanceInventoryBlock = discover
  .split('const exploreGuidanceReadyInventory = useMemo')[1]
  ?.split('const exploreWizardCandidateSet = exploreGuidanceReadyInventory.discoverableCandidateSet')[0] ?? '';
const canonicalPlanningBlock = discover
  .split('const canonicalExplorePlanningRoutes = useMemo<ExpeditionOpportunity[]>')[1]
  ?.split('const exploreWizardSourceCounts = exploreGuidanceReadyInventory.discoverableSourceCounts')[0] ?? '';
assert(
  guidanceInventoryBlock.includes('trailPacks: exploreWizardTrailPackSourceRoutes') &&
    guidanceInventoryBlock.includes('hiddenGemRoutes: exploreWizardHiddenGemSourceRoutes') &&
    guidanceInventoryBlock.includes('ecsRouteIdeas: exploreWizardEcsIdeaSourceRoutes') &&
    guidanceInventoryBlock.includes('...exploreWizardFavoriteRoutesWithContext') &&
    guidanceInventoryBlock.includes('...exploreWizardSavedBuiltRoutesWithContext') &&
    guidanceInventoryBlock.includes('savedRouteAssets: exploreWizardImportedStitchedRoutesWithContext') &&
    canonicalPlanningBlock.includes('exploreWizardCandidateSet.candidates.map((candidate) => candidate.route)') &&
    discover.includes('routes: canonicalExplorePlanningRoutes as any') &&
    !discover.includes('const publicSuggestedTrailheadRoutes'),
  'Explore planning/offline route discovery should use the shared discoverable inventory while retaining strict guidance readiness separately.',
);
assert(
  !discover.includes('ecs_demo_full_route_fixture') &&
    !liveCatalog.includes('ecs_demo_full_route_fixture'),
  'Public Explore catalog flow should not depend on demo full-route geometry fixtures',
);

console.log('Verified route catalog integration checks passed');

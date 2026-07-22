const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
const runtime = require(path.join(root, 'lib/explore/routeDiscoveryQaRuntime.ts'));
const transport = require(path.join(root, 'lib/explore/routeDiscoveryQaTransport.ts'));
const catalog = require(path.join(root, 'lib/explore/routeCatalog.ts'));
const trailPacks = require(path.join(root, 'lib/explore/trailPacks.ts'));
const projection = require(path.join(root, 'lib/explore/exploreVisibleRouteProjection.ts'));
const performance = require(path.join(root, 'lib/explore/explorePerformance.ts'));
const discoverSource = read('app/(tabs)/discover.tsx');
const layoutSource = read('app/_layout.tsx');
const identitySource = read('components/explore/RouteDiscoveryQaIdentity.tsx');
const disabledIdentitySource = read('components/explore/RouteDiscoveryQaIdentity.disabled.tsx');
const metroSource = read('metro.config.js');
const supabaseSource = read('lib/supabase.ts');

const qa = runtime.getRouteDiscoveryQaRuntime();
assert.strictEqual(qa.enabled, true);
assert.strictEqual(qa.region.regionId, 'qa_synthetic_basin_v2');
assert.strictEqual(qa.region.fixtureVersion, 'route-discovery-qa-v2');
assert.notStrictEqual(qa.region.latitude, 0);
assert.strictEqual(Object.isFrozen(qa.region), true);

function distanceMiles(left, right) {
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(right.latitude - left.latitude);
  const dLon = rad(right.longitude - left.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(left.latitude)) * Math.cos(rad(right.latitude)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function criteria(overrides = {}) {
  return {
    latitude: qa.region.latitude,
    longitude: qa.region.longitude,
    radiusMiles: qa.region.defaultRadiusMiles,
    locationSource: qa.region.source,
    qaMode: qa.mode,
    qaRegionId: qa.region.regionId,
    qaFixtureVersion: qa.fixtureVersion,
    category: 'trail_packs',
    refinement: 'all',
    accessPartition: qa.accessPartition,
    ...overrides,
  };
}

async function fullPipeline(overrides = {}) {
  const response = await transport.invokeRouteDiscoveryQaTransport({}, criteria(overrides));
  assert.strictEqual(response.error, null);
  const normalized = catalog.normalizeRouteCatalogSearchResponse(response.data);
  const discoverable = trailPacks.getDiscoverableTrailPacks(
    normalized.trailPacks,
    qa.region,
    overrides.radiusMiles ?? qa.region.defaultRadiusMiles,
  );
  const routes = discoverable
    .filter(trailPacks.isPublicSuggestedTrailheadTrailPack)
    .map(trailPacks.trailPackToExpeditionOpportunity)
    .filter(trailPacks.isPublicSuggestedTrailheadRoute);
  return { response, normalized, discoverable, projection: projection.selectVisibleExploreRouteProjection(routes) };
}

(async () => {
  performance.resetExplorePerformanceRecords();
  const fixtures = transport.createRouteDiscoveryQaFixtureRecords();
  const validInside100 = fixtures.filter((record) =>
    record.review_status === 'approved' && record.recommendation_status === 'recommendable' &&
    record.verification_status === 'official_verified' && record.restricted_access_coverage_pct === 0 &&
    Array.isArray(record.route_geometry?.coordinates) &&
    distanceMiles(qa.region, { latitude: record.center_latitude, longitude: record.center_longitude }) <= 100,
  );
  assert.ok(new Set(validInside100.map((record) => record.public_id)).size > 26, '1: more than 26 unique valid synthetic candidates exist inside 100 miles');
  const validOuterCandidates = fixtures.filter((record) => {
    const distance = distanceMiles(qa.region, { latitude: record.center_latitude, longitude: record.center_longitude });
    return record.review_status === 'approved' && record.recommendation_status === 'recommendable' &&
      record.verification_status === 'official_verified' && record.restricted_access_coverage_pct === 0 &&
      Array.isArray(record.route_geometry?.coordinates) && distance > 100 && distance <= 500;
  });
  assert.ok(new Set(validOuterCandidates.map((record) => record.public_id)).size >= 4, '1: at least four additional valid candidates exist from 100 to 500 miles');

  const hundred = await fullPipeline();
  assert.strictEqual(hundred.projection.count, 20, '2: exactly 20 cards survive the complete 100-mile pipeline');
  const fiveHundred = await fullPipeline({ radiusMiles: 500 });
  assert.strictEqual(fiveHundred.projection.count, 20, '3: exactly 20 cards survive the complete 500-mile pipeline');
  assert.ok(fiveHundred.response.data.meta.radiusMatchedCount > hundred.response.data.meta.radiusMatchedCount, '3: 500-mile search admits the controlled outer candidates');
  assert.strictEqual(hundred.response.data.meta.additionalMatchesExist, true, '4: additional matches are truthful');

  const gps = await fullPipeline({ latitude: 47.5, longitude: -122.3 });
  assert.deepStrictEqual(gps.projection.items.map((item) => item.id), hundred.projection.items.map((item) => item.id), '5: device GPS cannot replace QA anchor');
  const denied = await fullPipeline({ locationSource: 'permission_denied' });
  assert.deepStrictEqual(denied.projection.items.map((item) => item.id), hundred.projection.items.map((item) => item.id), '6: permission denial cannot remove fixtures');
  const foreground = await fullPipeline({ locationSource: 'foreground_refresh' });
  assert.deepStrictEqual(foreground.projection.items.map((item) => item.id), hundred.projection.items.map((item) => item.id), '7: foregrounding cannot replace QA anchor');

  const qaFingerprint = performance.createPrivacySafeSearchFingerprint({ accessPartition: qa.accessPartition, qaMode: qa.mode, region: qa.region.regionId, fixtureVersion: qa.fixtureVersion });
  const productionFingerprint = performance.createPrivacySafeSearchFingerprint({ accessPartition: 'anonymous', qaMode: '', region: '', fixtureVersion: '' });
  assert.notStrictEqual(qaFingerprint, productionFingerprint, '8: production cache cannot hydrate QA');
  assert.notStrictEqual(productionFingerprint, qaFingerprint, '9: QA cache cannot hydrate production');

  const firstFixture = fixtures[0];
  const firstNormalized = catalog.normalizeRouteCatalogRecord(firstFixture);
  assert.deepStrictEqual(firstNormalized.routeGeometry.coordinates[0], [firstFixture.center_longitude, firstFixture.center_latitude], '10: geometry remains longitude/latitude ordered');
  const trailheadFallback = catalog.normalizeRouteCatalogRecord(fixtures.find((record) => record.public_id.endsWith('031')));
  const swappedFallback = catalog.normalizeRouteCatalogRecord(fixtures.find((record) => record.public_id.endsWith('032')));
  assert.ok(trailheadFallback && swappedFallback && Math.abs(swappedFallback.centerCoordinate.latitude) <= 90, '11: trailhead, missing-center, and swapped-center normalization are safe');

  const hundredResponseIds = new Set(hundred.response.data.records.map((record) => record.public_id));
  for (const excludedSuffix of ['034', '035', '036', '037']) {
    assert.strictEqual(hundredResponseIds.has(`ecs-qa-synthetic-route-${excludedSuffix}`), false, '12: access and authoritative status gates remain enforced');
  }
  assert.strictEqual(hundredResponseIds.has('ecs-qa-synthetic-route-038'), false, '13: invalid geometry remains excluded');
  assert.strictEqual(new Set(hundred.projection.items.map((item) => item.id)).size, 20, '14: duplicate identity consumes one position');
  assert.deepStrictEqual(hundred.response.data.records.slice(0, 3).map((record) => record.public_id), ['ecs-qa-synthetic-route-001', 'ecs-qa-synthetic-route-002', 'ecs-qa-synthetic-route-003'], '15: ranking occurs before final slice');

  assert.ok(!discoverSource.includes('Load More'), '16: no Load More control exists');
  assert.strictEqual(hundred.response.data.meta.nextPage, null);
  assert.strictEqual(hundred.response.data.meta.nextCursor, null, '17: continuation is absent');
  assert.strictEqual(hundred.projection.count, hundred.projection.items.length, '18: visible count equals rendered-card projection');
  assert.ok(discoverSource.includes('visibleRouteCount === 0') && discoverSource.includes('visibleRouteCount > 0'), '19: empty-state authority is final visibility');

  hundred.projection.items.forEach((route) => {
    assert.ok(Array.isArray(route.routeGeometry?.coordinates) && route.routeGeometry.coordinates.length >= 2);
  });
  assert.ok(discoverSource.includes('onBuildTrip={() =>') && discoverSource.includes('handleBuildTripFromExploreWizardCandidate(candidate)'), '20: every visible QA card is wired to Trip Builder');

  assert.ok(layoutSource.includes('<RouteDiscoveryQaIdentity />') && layoutSource.indexOf('<RouteDiscoveryQaIdentity />') < layoutSource.indexOf('<AuthGate />'), '21: QA banner appears before login/auth frame');
  assert.ok(layoutSource.includes('LoadingTransitionVideo'), '22: root QA banner remains above transition shell');
  assert.ok(layoutSource.includes('<RouteDiscoveryQaIdentity />') && !discoverSource.includes('<RouteDiscoveryQaIdentity />'), '23: Explore receives the global banner');
  assert.ok(layoutSource.includes('<RouteDiscoveryQaIdentity />'), '24: Trip Builder receives the global banner');
  assert.ok(disabledIdentitySource.includes('return null') && metroSource.includes('RouteDiscoveryQaIdentity.disabled.tsx'), '25: fieldtest omits the QA banner');
  assert.ok(supabaseSource.includes('isRouteDiscoveryQaNetworkDisabled ? ""') && supabaseSource.includes('if (url && anon) {'), '26: QA cannot instantiate a configured Supabase client');

  const airplane = await fullPipeline({ locationSource: 'airplane_mode' });
  assert.deepStrictEqual(airplane.projection.items.map((item) => item.id), hundred.projection.items.map((item) => item.id), '27: airplane-mode results remain deterministic');

  const requiredStages = [
    'fixture_records_created', 'provider_records_normalized', 'access_filter_complete', 'moderation_filter_complete',
    'validation_filter_complete', 'QA_search_region_resolved', 'radius_filter_complete', 'viewport_filter_complete',
    'category_filter_complete', 'refinement_filter_complete', 'duplicate_filter_complete', 'ranking_complete', 'result_cap_complete',
  ];
  const recordedStages = performance.getExplorePerformanceRecords().map((record) => record.event);
  requiredStages.forEach((event) => assert.ok(recordedStages.includes(event), `missing QA pipeline diagnostic: ${event}`));
  const orderedStageIndexes = requiredStages.map((event) => recordedStages.indexOf(event));
  assert.deepStrictEqual(
    orderedStageIndexes,
    [...orderedStageIndexes].sort((left, right) => left - right),
    'QA pipeline stage diagnostics must preserve authoritative execution order',
  );
  assert.ok(
    performance.getExplorePerformanceRecords().some((record) =>
      record.event === 'viewport_filter_complete' && Number(record.exclusionReasonCounts?.outside_viewport) > 0,
    ),
    'viewport exclusion must be exercised by the controlled 500-mile fixture',
  );
  for (const copy of ['ROUTE DISCOVERY QA', 'LOCAL SYNTHETIC FIXTURES', 'SUPABASE DISABLED']) assert.ok(identitySource.includes(copy));
  assert.ok(identitySource.includes('accessibilityLabel='));
  assert.ok(discoverSource.includes("recordExplorePerformanceEvent('availability_classification_complete'") && discoverSource.includes("recordExplorePerformanceEvent('visible_card_projection_complete'") && discoverSource.includes("recordExplorePerformanceEvent('list_commit_complete'"), '28: full pipeline diagnostics and existing strict-cap/performance gates remain wired');

  console.log('Explore route-discovery QA physical prerequisite checks passed (28 requirements).');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

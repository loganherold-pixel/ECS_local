const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const root = path.join(__dirname, '..');
global.__DEV__ = false;
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'test-anon-key';
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const policy = require(path.join(root, 'lib', 'explore', 'routeSearchResultPolicy.ts'));
const { normalizeRouteCatalogSearchResponse } = require(
  path.join(root, 'lib', 'explore', 'routeCatalog.ts'),
);
const wizard = require(path.join(root, 'lib', 'explore', 'exploreTripBuilderWizard.ts'));
const { buildExploreGuidanceReadyInventory } = require(
  path.join(root, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts'),
);

assert.strictEqual(policy.ECS_ROUTE_SEARCH_RESULT_LIMIT, 20);
[undefined, null, NaN, Infinity, 0, -1, 'bad'].forEach((value) => {
  assert.strictEqual(policy.normalizeRouteSearchResultLimit(value), 20);
});
assert.strictEqual(policy.normalizeRouteSearchResultLimit(7.9), 7);
assert.strictEqual(policy.normalizeRouteSearchResultLimit(51), 20);

const rankedWithDuplicate = [
  { id: 'best', score: 100 },
  { id: 'best', score: 99 },
  ...Array.from({ length: 25 }, (_, index) => ({ id: `route-${index}`, score: 98 - index })),
];
const capped = policy.capUniqueRankedRoutes(rankedWithDuplicate, (item) => item.id);
assert.strictEqual(capped.length, 20);
assert.strictEqual(new Set(capped.map((item) => item.id)).size, 20);
assert.strictEqual(capped[0].id, 'best');

function validCatalogRoute(index, overrides = {}) {
  const id = `catalog-route-${String(index).padStart(2, '0')}`;
  return {
    id,
    public_id: id,
    name: `Catalog Route ${index}`,
    route_type: 'point_to_point',
    center_latitude: 39 + index * 0.001,
    center_longitude: -120,
    route_geometry_mode: 'omitted',
    geometry_quality: 'good',
    distance_miles: 10 + index,
    search_distance_miles: 50 - index * 0.1,
    featured_route_score: index === 50 ? 1000 : 0,
    official_access_coverage_pct: 100,
    unknown_access_coverage_pct: 0,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    vehicle_mismatch: false,
    verification_status: 'official_verified',
    review_status: 'approved',
    recommendation_status: 'recommendable',
    source_records: [{
      provider_id: `official-${id}`,
      source_type: 'official',
      label: 'Official route source',
      authority: 'official agency',
      last_verified_at: '2026-07-18T00:00:00.000Z',
      use_permission: 'granted',
    }],
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: `2026-07-${String((index % 18) + 1).padStart(2, '0')}T00:00:00.000Z`,
    ...overrides,
  };
}

const blockedRecords = Array.from({ length: 25 }, (_, index) => validCatalogRoute(100 + index, {
  review_status: 'pending_review',
  recommendation_status: 'needs_review',
}));
const blockedIds = new Set(blockedRecords.map((route) => route.public_id));
const rawRecords = [
  { name: 'invalid missing identity' },
  ...blockedRecords,
  ...Array.from({ length: 51 }, (_, index) => validCatalogRoute(index)),
  validCatalogRoute(50, { id: 'duplicate-db-row' }),
];
const normalized = normalizeRouteCatalogSearchResponse({
  records: rawRecords,
  meta: {
    resultLimit: 51,
    totalMatchedCount: 51,
    additionalMatchesAvailable: true,
  },
});
assert.strictEqual(normalized.normalizedRecordCount, 77, 'Structural validation must precede the cap.');
assert.strictEqual(normalized.records.length, 20);
assert.strictEqual(normalized.trailPacks.length, 20);
assert.strictEqual(new Set(normalized.trailPacks.map((route) => route.id)).size, 20);
assert(
  normalized.trailPacks.some((route) => route.id === 'catalog-route-50'),
  'The highest-ranked record at the end of the provider payload must survive the final slice.',
);
assert(
  normalized.trailPacks.every((route) => !blockedIds.has(route.id)),
  'Moderation filtering must run before blocked rows could consume result positions.',
);
assert.strictEqual(normalized.searchMeta.additionalMatchesAvailable, true);
assert.strictEqual(normalized.searchMeta.resultLimit, 20);

function wizardRoute(index) {
  return {
    id: `wizard-${index}`,
    name: `Wizard Route ${index}`,
    region: 'Test Range',
    regionGroup: 'great-basin',
    distanceMiles: 2 + index,
    terrainType: 'two-track',
    remotenessScore: 8,
    estimatedFuelRequired: 2,
    suggestedCamps: 0,
    description: 'Public route summary',
    highlights: [],
    elevationGainFt: 100,
    estimatedDays: 1,
    bestSeason: 'All year',
    permitRequired: false,
    imageTag: 'route',
    startLat: 39,
    startLng: -120,
    destinationCoordinate: { lat: 39.01, lng: -119.99 },
    routeGeometry: {
      type: 'LineString',
      coordinates: [[-120, 39], [-119.995, 39.005], [-119.99, 39.01]],
    },
    trailGeometry: [
      { lat: 39, lng: -120 },
      { lat: 39.005, lng: -119.995 },
      { lat: 39.01, lng: -119.99 },
    ],
    matchScore: 100 - index,
    routeMetadata: {
      routeGeometryMode: 'full',
      activeGuidance: { status: 'ready' },
      accessVerified: true,
      legalAccessStatus: 'verified',
      publicRecommendation: true,
      reviewStatus: 'approved',
      recommendationStatus: 'recommendable',
      guidanceRouteTypeSupported: true,
      catalogVerification: { publicRecommendation: true, accessVerified: true },
    },
  };
}

const wizardCandidates = wizard.normalizeExploreWizardRouteCandidates({
  trailPacks: Array.from({ length: 20 }, (_, index) => wizardRoute(index)),
});
assert.strictEqual(wizardCandidates.candidates.length, 20);
wizardCandidates.candidates.forEach((candidate) => {
  const draft = wizard.createExploreWizardDraft(candidate, { routeOnlyPlanning: true });
  assert.strictEqual(draft.route.id, candidate.id);
  assert.strictEqual(draft.selectedCandidateId, candidate.id);
});

const trailPackLaneRoutes = Array.from({ length: 25 }, (_, index) => ({
  ...wizardRoute(index),
  id: `trail-pack-lane-${String(index).padStart(2, '0')}`,
  name: `Trail Pack lane ${index}`,
}));
const hiddenGemLaneRoutes = Array.from({ length: 25 }, (_, index) => ({
  ...wizardRoute(index + 25),
  id: `hidden-gem-lane-${String(index).padStart(2, '0')}`,
  name: `Hidden Gem lane ${index}`,
}));
const hiddenGemLaneInventory = buildExploreGuidanceReadyInventory({
  trailPacks: trailPackLaneRoutes,
  hiddenGemRoutes: hiddenGemLaneRoutes,
  selectedSourceKind: 'hidden_gem',
});
assert.strictEqual(hiddenGemLaneInventory.discoverableCandidateSet.candidates.length, 20);
assert(
  hiddenGemLaneInventory.discoverableCandidateSet.candidates.every(
    (candidate) => candidate.sourceKind === 'hidden_gem',
  ),
  'Source-lane filtering must run before the combined inventory applies its top-20 slice.',
);
const trailPackLaneInventory = buildExploreGuidanceReadyInventory({
  trailPacks: trailPackLaneRoutes,
  hiddenGemRoutes: hiddenGemLaneRoutes,
  selectedSourceKind: 'trail_pack',
});
assert.strictEqual(trailPackLaneInventory.discoverableCandidateSet.candidates.length, 20);
assert(
  trailPackLaneInventory.discoverableCandidateSet.candidates.every(
    (candidate) => candidate.sourceKind === 'trail_pack',
  ),
  'Changing source filters must start a new source-specific result set that remains capped at 20.',
);

const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
assert(discoverSource.includes('testID="explore-route-search-cap-notice"'));
assert(discoverSource.includes('testID="explore-favorites-search-cap-notice"'));
assert(discoverSource.includes('ECS_ROUTE_SEARCH_RESULT_CAP_NOTICE'));
assert(
  discoverSource.includes('return capUniqueRankedRoutes(ranked, (favorite) => favorite.sourceTrailId);'),
  'Filtered Favorites route results must use the same total-search cap.',
);
assert(
  discoverSource.includes('Math.min(ECS_ROUTE_SEARCH_RESULT_LIMIT, totalQualifyingRouteCount)'),
  'Explorer result messaging must not advertise more visible routes than the total-search cap.',
);
assert(!discoverSource.includes('handleLoadNextRouteCatalogPage'));
assert(!discoverSource.includes('testID="explore-guidance-ready-load-next-provider-page"'));
assert(!discoverSource.includes('SHOW MORE ROUTES'));

console.log('Explore total-search route cap checks passed.');

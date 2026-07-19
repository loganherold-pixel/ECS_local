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

assert.strictEqual(policy.ECS_ROUTE_SEARCH_RENDER_WINDOW_SIZE, 20);
assert.strictEqual(policy.ECS_ROUTE_SEARCH_DEFAULT_PAGE_SIZE, 50);
assert.strictEqual(policy.ECS_ROUTE_SEARCH_MAX_PAGE_SIZE, 50);
[undefined, null, NaN, Infinity, 0, -1, 'bad'].forEach((value) => {
  assert.strictEqual(policy.normalizeRouteSearchPageSize(value), 50);
});
assert.strictEqual(policy.normalizeRouteSearchPageSize(7.9), 7);
assert.strictEqual(policy.normalizeRouteSearchPageSize(51), 50);

const rankedWithDuplicate = [
  { id: 'best', score: 100 },
  { id: 'best', score: 99 },
  ...Array.from({ length: 25 }, (_, index) => ({ id: `route-${index}`, score: 98 - index })),
];
const deduped = policy.dedupeUniqueRankedRoutes(rankedWithDuplicate, (item) => item.id);
assert.strictEqual(deduped.length, 26);
assert.strictEqual(new Set(deduped.map((item) => item.id)).size, 26);
assert.strictEqual(deduped[0].id, 'best');

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
const pageOneRawRecords = [
  { name: 'invalid missing identity' },
  ...blockedRecords,
  ...Array.from({ length: 50 }, (_, index) => validCatalogRoute(index)),
  validCatalogRoute(49, { id: 'duplicate-db-row' }),
];
const normalizedPageOne = normalizeRouteCatalogSearchResponse({
  records: pageOneRawRecords,
  meta: {
    paginationContractVersion: 'route_catalog_ranked_page_v1',
    page: 1,
    pageSize: 50,
    offset: 0,
    resultLimit: 50,
    totalMatchedCount: 51,
    hasMore: true,
    nextPage: 2,
    additionalMatchesAvailable: true,
  },
});
assert.strictEqual(normalizedPageOne.normalizedRecordCount, 76, 'Structural validation must precede page materialization.');
assert.strictEqual(normalizedPageOne.records.length, 50);
assert.strictEqual(normalizedPageOne.trailPacks.length, 50);
assert.strictEqual(new Set(normalizedPageOne.trailPacks.map((route) => route.id)).size, 50);
assert(
  normalizedPageOne.trailPacks.every((route) => !blockedIds.has(route.id)),
  'Moderation filtering must run before blocked rows could consume page positions.',
);
assert.strictEqual(normalizedPageOne.searchMeta.hasMore, true);
assert.strictEqual(normalizedPageOne.searchMeta.nextPage, 2);
assert.strictEqual(normalizedPageOne.searchMeta.resultLimit, 50);

const normalizedPageTwo = normalizeRouteCatalogSearchResponse({
  records: [validCatalogRoute(50)],
  meta: {
    paginationContractVersion: 'route_catalog_ranked_page_v1',
    page: 2,
    pageSize: 50,
    offset: 50,
    resultLimit: 50,
    totalMatchedCount: 51,
    hasMore: false,
    nextPage: null,
  },
});
assert.strictEqual(normalizedPageTwo.trailPacks.length, 1);
assert.strictEqual(normalizedPageTwo.trailPacks[0].id, 'catalog-route-50');

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
  trailPacks: Array.from({ length: 51 }, (_, index) => wizardRoute(index)),
});
assert.strictEqual(wizardCandidates.candidates.length, 51);
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
assert.strictEqual(hiddenGemLaneInventory.discoverableCandidateSet.candidates.length, 25);
assert(
  hiddenGemLaneInventory.discoverableCandidateSet.candidates.every(
    (candidate) => candidate.sourceKind === 'hidden_gem',
  ),
  'Source-lane filtering must preserve every eligible candidate in the selected lane.',
);
const trailPackLaneInventory = buildExploreGuidanceReadyInventory({
  trailPacks: trailPackLaneRoutes,
  hiddenGemRoutes: hiddenGemLaneRoutes,
  selectedSourceKind: 'trail_pack',
});
assert.strictEqual(trailPackLaneInventory.discoverableCandidateSet.candidates.length, 25);
assert(
  trailPackLaneInventory.discoverableCandidateSet.candidates.every(
    (candidate) => candidate.sourceKind === 'trail_pack',
  ),
  'Changing source filters must start a new source-specific result set without inheriting the prior lane.',
);

const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
assert(discoverSource.includes('testID="explore-favorites-search-cap-notice"'));
assert(
  discoverSource.includes('return capUniqueRankedRoutes(ranked, (favorite) => favorite.sourceTrailId);'),
  'The unrelated Favorites render guard must remain unchanged.',
);
assert(
  discoverSource.includes('const totalRouteCount = totalQualifyingRouteCount;'),
  'Explorer result messaging must not truncate the loaded route count to a render window.',
);
assert(discoverSource.includes('handleLoadNextRouteCatalogPage'));
assert(discoverSource.includes('testID="explore-guidance-ready-load-next-provider-page"'));
assert(discoverSource.includes('testID="explore-guidance-ready-show-more-loaded"'));
assert(discoverSource.includes('LOAD MORE VERIFIED ROUTES'));

console.log('Explore ranked-page continuation and render-window checks passed.');

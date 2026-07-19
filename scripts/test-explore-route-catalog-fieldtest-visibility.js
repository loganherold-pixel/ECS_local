const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
global.__DEV__ = false;

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'web', select: (choices) => choices?.web ?? choices?.default },
    };
  }
  if (
    (request === '../supabase' || request === './supabase') &&
    parent?.filename.includes(`${path.sep}lib${path.sep}`)
  ) {
    return { supabase: {} };
  }
  return originalLoad.apply(this, [request, parent, isMain]);
};

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const discover = read(path.join('app', '(tabs)', 'discover.tsx'));
const {
  buildRouteCatalogPaginationProgress,
  buildRouteCatalogSearchBody,
  resolveRouteCatalogVehicleClass,
} = require(path.join(root, 'lib', 'explore', 'liveTrailPackCatalog.ts'));
const {
  nextRouteCatalogCandidateInspectionBatch,
} = require(path.join(
  root,
  'supabase',
  'functions',
  'route-catalog-search',
  'providerContract.ts',
));
const { deriveExploreRouteSurfaceState } = require(
  path.join(root, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts'),
);

function currentRouteEvaluation(overrides = {}) {
  return {
    status: 'ready',
    providerStatus: 'active',
    catalogSource: 'route_catalog',
    sourceTruth: 'live',
    freshness: 'live',
    snapshotRefreshKey: 'fieldtest-current-request',
    currentRefreshKey: 'fieldtest-current-request',
    visibleCandidateCount: 0,
    candidateCount: 0,
    discoverableCount: 0,
    readyCount: 0,
    evaluatedCount: 0,
    hasRangeData: false,
    isSourceFilterAll: true,
    isLoading: false,
    validEmpty: false,
    ...overrides,
  };
}

assert.deepStrictEqual(
  ['truck', 'suv', 'jeep', 'motorcycle'].map(resolveRouteCatalogVehicleClass),
  ['full_size_4x4', 'highway_legal_4x4', 'highway_legal_4x4', 'motorcycle'],
  'Route catalog search should normalize Fleet vehicle types into catalog vehicle_fit classes.',
);
assert.strictEqual(
  buildRouteCatalogSearchBody({ vehicleClass: 'truck' }).vehicleClass,
  'full_size_4x4',
  'The observable request body should carry the normalized vehicle class.',
);

assert(
  discover.includes('routeCatalogLocationCriteria') &&
    discover.includes('routeCatalogHasSearchArea') &&
    discover.includes('stableRouteCatalogSearchCoordinate') &&
    discover.includes('latitude: stableRouteCatalogSearchCoordinate.latitude') &&
    discover.includes('longitude: stableRouteCatalogSearchCoordinate.longitude') &&
    discover.includes("locationSource: routeCatalogEffectiveSearchArea?.source ?? 'search_area_required'"),
  'Explore should only send radius-bounded route-catalog searches from a stable live GPS/search-area bucket, never around the Kansas fallback or raw GPS jitter.',
);

assert(
  discover.includes('routeCatalogHasSearchArea') &&
    discover.includes('routeCatalogSearchAreaKey') &&
    discover.includes('ROUTE_CATALOG_PRESET_SEARCH_AREAS') &&
    !discover.includes('routeCatalogManualSearchArea') &&
    discover.includes('if (!routeCatalogHasSearchArea)') &&
    discover.includes('Search Area Needed'),
  'Suggested Trailheads should require GPS or an internal search area without exposing the old manual route catalog selector.',
);

assert(
  !discover.includes('testID="route-catalog-search-area-control"') &&
    !discover.includes('Suggested Trailheads only show verified catalog routes within the selected radius.') &&
    !discover.includes('ROUTE CATALOG AREA') &&
    discover.includes('Showing verified routes within'),
  'Selected search areas should remain internally radius-filtered without exposing route catalog controls on the Explorer surface.',
);

const freshSuccessfulCards = deriveExploreRouteSurfaceState(currentRouteEvaluation({
  visibleCandidateCount: 3,
  candidateCount: 3,
  discoverableCount: 3,
  evaluatedCount: 3,
  hasRangeData: true,
}));
assert.deepStrictEqual(freshSuccessfulCards, {
  kind: 'cards',
  currentSuccessfulEvaluation: true,
  showBlockedNotice: false,
});

const loadedCardsDespitePaginationMetadata = deriveExploreRouteSurfaceState(currentRouteEvaluation({
  visibleCandidateCount: 3,
  candidateCount: 0,
  discoverableCount: 0,
  evaluatedCount: 0,
  hasRangeData: true,
  validEmpty: true,
  hasMore: true,
  nextPage: 2,
}));
assert.strictEqual(loadedCardsDespitePaginationMetadata.kind, 'cards');
assert.strictEqual(loadedCardsDespitePaginationMetadata.currentSuccessfulEvaluation, true);
assert.strictEqual(loadedCardsDespitePaginationMetadata.showBlockedNotice, false);

const mismatchedDiagnosticSnapshot = deriveExploreRouteSurfaceState(currentRouteEvaluation({
  snapshotRefreshKey: 'fieldtest-obsolete-request',
  evaluatedCount: 23,
  hasRangeData: true,
}));
assert.notStrictEqual(mismatchedDiagnosticSnapshot.kind, 'blocked');
assert.strictEqual(mismatchedDiagnosticSnapshot.currentSuccessfulEvaluation, false);
assert.strictEqual(mismatchedDiagnosticSnapshot.showBlockedNotice, false);

const staleDiagnosticSnapshot = deriveExploreRouteSurfaceState(currentRouteEvaluation({
  status: 'stale',
  sourceTruth: 'cached',
  freshness: 'stale',
  evaluatedCount: 23,
  hasRangeData: true,
}));
assert.strictEqual(staleDiagnosticSnapshot.kind, 'stale');
assert.strictEqual(staleDiagnosticSnapshot.currentSuccessfulEvaluation, false);
assert.strictEqual(staleDiagnosticSnapshot.showBlockedNotice, false);

const currentDiagnosticOnlySnapshot = deriveExploreRouteSurfaceState(currentRouteEvaluation({
  evaluatedCount: 1,
  hasRangeData: true,
}));
assert.strictEqual(currentDiagnosticOnlySnapshot.kind, 'blocked');
assert.strictEqual(currentDiagnosticOnlySnapshot.currentSuccessfulEvaluation, true);
assert.strictEqual(currentDiagnosticOnlySnapshot.showBlockedNotice, true);

const providerFailure = deriveExploreRouteSurfaceState(currentRouteEvaluation({
  status: 'error',
  providerStatus: 'unavailable',
  catalogSource: 'unavailable',
  sourceTruth: 'unavailable',
  freshness: 'unknown',
  evaluatedCount: 23,
  hasRangeData: true,
}));
assert.deepStrictEqual(providerFailure, {
  kind: 'provider_unavailable',
  currentSuccessfulEvaluation: false,
  showBlockedNotice: false,
});

const providerPage = { hasMore: true, inspectedCount: 500 };
const internalContinuationBatch = providerPage.hasMore
  ? nextRouteCatalogCandidateInspectionBatch(providerPage.inspectedCount)
  : null;
assert.deepStrictEqual(
  internalContinuationBatch,
  { pageSize: 500, queryLimit: 501 },
  'Provider hasMore metadata should leave the next internal candidate-inspection batch available.',
);

const oversizedSearchProgress = buildRouteCatalogPaginationProgress({
  loadedCatalogCount: 20,
  totalMatchedCount: 51,
  totalMatchedCountBounded: false,
  visibleCatalogCardCount: 20,
  visibleCandidateCount: 20,
});
assert.deepStrictEqual(
  {
    loadedCatalogCount: oversizedSearchProgress.loadedCatalogCount,
    matchedCatalogCount: oversizedSearchProgress.matchedCatalogCount,
    visibleCatalogCardCount: oversizedSearchProgress.visibleCatalogCardCount,
    label: oversizedSearchProgress.label,
  },
  {
    loadedCatalogCount: 20,
    matchedCatalogCount: 51,
    visibleCatalogCardCount: 20,
    label: '20 OF 51 CATALOG ROUTES LOADED',
  },
  'Consumer pagination should keep loaded cards visible while truthfully reporting reachable additional matches.',
);

console.log('Explore route catalog field-test visibility checks passed');

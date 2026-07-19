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
const liveCatalog = read(path.join('lib', 'explore', 'liveTrailPackCatalog.ts'));
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

assert(
  liveCatalog.includes('ROUTE_CATALOG_VEHICLE_CLASS_ALIASES') &&
    liveCatalog.includes('export function resolveRouteCatalogVehicleClass') &&
    liveCatalog.includes('resolveRouteCatalogVehicleClass(criteria.vehicleClass)') &&
    liveCatalog.includes('truck:') &&
    liveCatalog.includes('suv:') &&
    liveCatalog.includes('jeep:') &&
    liveCatalog.includes('motorcycle:') &&
    liveCatalog.includes('vehicleClass }'),
  'Route catalog search should normalize Fleet vehicle types into catalog vehicle_fit classes instead of forwarding raw app labels that can filter every route out.',
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

const freshPaginatedCards = deriveExploreRouteSurfaceState(currentRouteEvaluation({
  visibleCandidateCount: 50,
  candidateCount: 50,
  discoverableCount: 50,
  evaluatedCount: 50,
  hasRangeData: true,
}));
assert.strictEqual(freshPaginatedCards.kind, 'cards');
assert.strictEqual(freshPaginatedCards.currentSuccessfulEvaluation, true);
assert.strictEqual(freshPaginatedCards.showBlockedNotice, false);

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

assert(
  discover.includes('liveTrailPackCatalogSnapshot.searchMeta?.hasMore &&') &&
    discover.includes('liveTrailPackCatalogSnapshot.searchMeta.nextPage != null') &&
    discover.includes('onPress={handleLoadNextRouteCatalogPage}') &&
    discover.includes("'Load more verified Explore routes'") &&
    discover.includes('testID="explore-guidance-ready-load-next-provider-page"'),
  'A successful first page with a continuation should keep its cards visible and expose an accessible next-page control.',
);

console.log('Explore route catalog field-test visibility checks passed');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const root = path.join(__dirname, '..');
require.extensions['.ts'] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const performance = require(path.join(root, 'lib', 'explore', 'explorePerformance.ts'));
const summaryNavigation = require(path.join(root, 'lib', 'explore', 'routeSummaryNavigation.ts'));
let now = 0;
performance.setExplorePerformanceClockForTests(() => now);
performance.resetExplorePerformanceRecords();
performance.recordExplorePerformanceEvent('explore_control_tap_received');
now = 12;
performance.recordExplorePerformanceEvent('explore_control_visual_acknowledged', { durationMs: 12 });
const records = performance.getExplorePerformanceRecords();
assert.deepStrictEqual(records.map((record) => record.event), [
  'explore_control_tap_received',
  'explore_control_visual_acknowledged',
]);
assert.strictEqual(records[1].atMs, 12);
assert(!JSON.stringify(records).includes('latitude'));

const fingerprintA = performance.createPrivacySafeSearchFingerprint({ latitude: 1, radiusMiles: 50 });
const fingerprintARepeat = performance.createPrivacySafeSearchFingerprint({ radiusMiles: 50, latitude: 1 });
const fingerprintB = performance.createPrivacySafeSearchFingerprint({ latitude: 2, radiusMiles: 50 });
assert.strictEqual(fingerprintA, fingerprintARepeat);
assert.notStrictEqual(fingerprintA, fingerprintB);
assert(!fingerprintA.includes('1') && !fingerprintA.includes('50'), 'fingerprints must not expose criteria');

const discover = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'lib', 'explore', 'liveTrailPackCatalog.ts'), 'utf8');
const capPolicy = fs.readFileSync(path.join(root, 'lib', 'explore', 'routeSearchResultPolicy.ts'), 'utf8');

assert(catalog.includes('const activeRequests = new Map'));
assert(catalog.includes('if (existingRequest) return existingRequest'), 'identical active searches must share one request');
assert(catalog.includes('const responseCache = new Map'));
assert(catalog.includes("recordExplorePerformanceEvent('explore_cache_result_available'"));
assert(catalog.indexOf("recordExplorePerformanceEvent('explore_cache_result_available'") < catalog.indexOf("recordExplorePerformanceEvent('explore_search_request_dispatched'"));
assert(catalog.includes("recordExplorePerformanceEvent('explore_stale_result_rejected'"));
assert(catalog.includes('isAuthoritativeRequest'));
assert(discover.includes("recordExplorePerformanceEvent('explore_control_tap_received')"));
assert(discover.includes("recordExplorePerformanceEvent('explore_control_visual_acknowledged')"));
assert(discover.includes('runAfterShellInteractions(() => aiRouteStore.clearAll())'));
assert(!discover.includes('runAfterShellInteractions(() => {\n    void refreshLiveTrailPackCatalog'));
const navigationOrder = [];
summaryNavigation.dispatchSummaryFirstTripBuilderNavigation({
  route: { id: 'acceptance-summary' },
  stageReadiness: () => navigationOrder.push('readiness'),
  stageItinerary: () => navigationOrder.push('itinerary'),
  clearTransientUi: () => navigationOrder.push('clear'),
  navigate: () => navigationOrder.push('navigate'),
});
assert.deepStrictEqual(navigationOrder, ['readiness', 'itinerary', 'clear', 'navigate']);
assert(!discover.slice(discover.indexOf('const handleBuildTripFromRoute'), discover.indexOf('const handlePrepareOfflineFromRoute')).includes('hydrateRouteCatalogOpportunityForHandoff'));
assert(catalog.includes('includeGeometry: false'));
assert(!catalog.slice(catalog.indexOf('async function fetchRouteCatalogTrailPacks'), catalog.indexOf('export async function fetchRouteCatalogTrailPackDetail')).includes("invoke('route-catalog-detail'"));
assert(capPolicy.includes('ECS_ROUTE_SEARCH_RESULT_LIMIT = 20'));
assert(!discover.includes('Load More Verified Routes'));
assert(!discover.includes('Retry More Verified Routes'));

const pendingProviderCalls = [];
let providerRequestCount = 0;
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../supabase' && parent?.filename.endsWith(`${path.sep}liveTrailPackCatalog.ts`)) {
    return {
      supabase: {
        functions: {
          invoke() {
            providerRequestCount += 1;
            return new Promise((resolve) => pendingProviderCalls.push(resolve));
          },
        },
        from() {
          throw new Error('Legacy fallback should not run in the successful provider fixture');
        },
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

async function runCoordinatorChecks() {
  const live = require(path.join(root, 'lib', 'explore', 'liveTrailPackCatalog.ts'));
  const criteria = { latitude: 39, longitude: -120, radiusMiles: 50 };
  const first = live.refreshLiveTrailPackCatalog(criteria);
  const duplicate = live.refreshLiveTrailPackCatalog(criteria);
  assert.strictEqual(providerRequestCount, 1, 'identical active searches should issue one provider request');
  pendingProviderCalls.shift()({ data: { records: [], meta: {} }, error: null });
  await Promise.all([first, duplicate]);

  const warm = live.refreshLiveTrailPackCatalog(criteria);
  assert.strictEqual(live.liveTrailPackCatalogStore.getSnapshot().cacheHit, true, 'warm cache should publish before revalidation');
  assert.strictEqual(providerRequestCount, 2, 'warm cache should still revalidate exactly once');
  pendingProviderCalls.shift()({ data: { records: [], meta: {} }, error: null });
  await warm;

  const searchA = live.refreshLiveTrailPackCatalog({ ...criteria, radiusMiles: 60 });
  const searchB = live.refreshLiveTrailPackCatalog({ ...criteria, radiusMiles: 70 });
  assert.strictEqual(providerRequestCount, 4, 'two distinct fingerprints should each dispatch once');
  const resolveA = pendingProviderCalls.shift();
  const resolveB = pendingProviderCalls.shift();
  resolveB({ data: { records: [], meta: {} }, error: null });
  await searchB;
  resolveA({ data: { records: [], meta: {} }, error: null });
  await searchA;
  assert(
    performance.getExplorePerformanceRecords().some((record) => record.event === 'explore_stale_result_rejected'),
    'superseded search A must be rejected after search B becomes active',
  );
  console.log('Explore interaction performance checks passed');
}

runCoordinatorChecks().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

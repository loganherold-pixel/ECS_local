const assert = require('assert');
require('./campops-react-native-test-shim');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const lifecyclePath = path.join(root, 'lib', 'campops', 'campOpsLifecycle.ts');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');

require.extensions['.ts'] = function compileTs(module, filename) {
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
};

const {
  CAMPOPS_NO_ROUTE_CANDIDATES_MESSAGE,
  buildCampOpsLifecycleKey,
  campOpsLifecycleStateFromResult,
  createCampOpsLifecycleCache,
} = require(lifecyclePath);

assert.strictEqual(
  buildCampOpsLifecycleKey('route', 'route-a::hash-1'),
  'route:route-a::hash-1',
  'Lifecycle keys should be deterministic and scoped by route/search type.',
);
assert.strictEqual(buildCampOpsLifecycleKey('route', '   '), null, 'Blank route signatures should not trigger CampOps.');

const cache = createCampOpsLifecycleCache(2);
cache.set('route:a', { id: 'a' });
cache.set('route:b', { id: 'b' });
assert.deepStrictEqual(cache.keys(), ['route:a', 'route:b']);
assert.deepStrictEqual(cache.get('route:a'), { id: 'a' }, 'Cache reads should return the stored result.');
cache.set('route:c', { id: 'c' });
assert.deepStrictEqual(
  cache.keys(),
  ['route:a', 'route:c'],
  'Cache should retain recently used route results and evict the oldest unused entry.',
);
assert.strictEqual(cache.get('route:b'), null, 'Evicted route results should not be reused.');

const readyState = campOpsLifecycleStateFromResult('route', 'route:ready', {
  campOps: {
    enabled: true,
    recommendationSet: {
      rankedCandidates: [{ id: 'camp-1' }],
    },
  },
});
assert.strictEqual(readyState.status, 'ready');
assert.strictEqual(readyState.message, null);

const emptyState = campOpsLifecycleStateFromResult('route', 'route:empty', {
  campOps: {
    enabled: true,
    recommendationSet: {
      rankedCandidates: [],
    },
  },
});
assert.strictEqual(emptyState.status, 'empty');
assert.strictEqual(emptyState.message, CAMPOPS_NO_ROUTE_CANDIDATES_MESSAGE);

const navigateSource = fs.readFileSync(navigatePath, 'utf8');
assert(
  navigateSource.includes('campOpsRouteResultCacheRef') &&
    navigateSource.includes('createCampOpsLifecycleCache<CampsiteCandidateResult>'),
  'Navigate should keep a bounded CampOps result cache keyed by stable route signature.',
);
assert(
  navigateSource.includes('campOpsRouteRequestRef') &&
    navigateSource.includes('campOpsRouteRequestRef.current.requestToken !== requestToken'),
  'Navigate should ignore stale CampOps route scan requests.',
);
assert(
  navigateSource.includes('clearRoute: true') &&
    navigateSource.includes("clearOwnedCampsiteCandidates('route_context_changed'"),
  'Route changes should clear old route-owned CampOps candidates before new pins render.',
);
assert(
  navigateSource.includes('lastCampsiteInputRef.current === routeOverviewCampsiteSignature') &&
    navigateSource.includes('buildRouteCampsiteLocatorSignature(routeOverviewCampsiteContext)'),
  'CampOps route scans should be gated by stable route signatures, not render/GPS/map-pan churn.',
);
assert(
  navigateSource.includes('campopsRecommendationsEnabled: CAMPOPS_ROUTE_PINS_ENABLED') &&
    navigateSource.includes('locateCampsiteResultForPolygon'),
  'Explicit polygon scans should opt into CampOps only behind the rollout flag.',
);
assert(
  navigateSource.includes('CAMPOPS_ROUTE_SCAN_ERROR_MESSAGE') &&
    navigateSource.includes('CAMPOPS_ROUTE_SCAN_LOADING_MESSAGE'),
  'CampOps route lifecycle should expose non-blocking loading and error states.',
);

console.log('CampOps lifecycle checks passed.');

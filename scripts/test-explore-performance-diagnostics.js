const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
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
}

require.extensions['.ts'] = compileTypescript;
require.extensions['.tsx'] = compileTypescript;

const diagnosticsModulePath = path.join(root, 'lib', 'explore', 'explorePerformanceDiagnostics.ts');
assert(fs.existsSync(diagnosticsModulePath), 'Explore performance diagnostics utility should exist.');
const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const liveCatalogSource = fs.readFileSync(path.join(root, 'lib', 'explore', 'liveTrailPackCatalog.ts'), 'utf8');

const {
  ECS_EXPLORE_PERF_DEBUG_FLAG,
  buildExplorePerformanceSummary,
  createExplorePerformanceRun,
  isExplorePerformanceDebugEnabled,
  logExplorePerformanceDiagnostic,
  markExplorePerformanceEvent,
  recordExplorePerformanceCount,
  recordExplorePerformancePhase,
} = require(diagnosticsModulePath);

assert.strictEqual(ECS_EXPLORE_PERF_DEBUG_FLAG, 'EXPO_PUBLIC_ECS_EXPLORE_PERF_DEBUG');
assert.strictEqual(isExplorePerformanceDebugEnabled({ EXPO_PUBLIC_ECS_EXPLORE_PERF_DEBUG: 'true' }), true);
assert.strictEqual(isExplorePerformanceDebugEnabled({ EXPO_PUBLIC_ECS_EXPLORE_PERF_DEBUG: '1' }), true);
assert.strictEqual(isExplorePerformanceDebugEnabled({ ECS_EXPLORE_PERF_DEBUG: 'true' }), true);
assert.strictEqual(isExplorePerformanceDebugEnabled({ EXPO_PUBLIC_ECS_EXPLORE_PERF_DEBUG: 'false' }), false);

const run = createExplorePerformanceRun({
  flow: 'nearby_route_discovery',
  searchKey: 'gps:38.92,-120.78:100',
  startedAtMs: 1000,
  metadata: {
    radiusMiles: 100,
    locationSource: 'live_gps',
  },
});

recordExplorePerformancePhase(run, 'route_catalog_query', {
  startedAtMs: 1000,
  endedAtMs: 1450,
  metadata: { source: 'route_catalog', cacheStatus: 'fresh_network' },
});
recordExplorePerformancePhase(run, 'filter_sort', {
  startedAtMs: 1450,
  endedAtMs: 1535,
});
recordExplorePerformancePhase(run, 'geometry_normalization', {
  startedAtMs: 1535,
  endedAtMs: 1575,
});
recordExplorePerformancePhase(run, 'image_fetch_cache', {
  startedAtMs: 1580,
  endedAtMs: 1710,
  metadata: { requested: 12 },
});
recordExplorePerformancePhase(run, 'card_render', {
  startedAtMs: 1575,
  endedAtMs: 1625,
  metadata: { rendered: 12 },
});
recordExplorePerformancePhase(run, 'map_render', {
  startedAtMs: 1625,
  endedAtMs: 1660,
});
markExplorePerformanceEvent(run, 'first_visible_result', 1640, { visibleRoutes: 12 });
markExplorePerformanceEvent(run, 'full_nearby_result_list', 1800, { resultCount: 44 });
recordExplorePerformanceCount(run, {
  routesEvaluated: 160,
  routesRendered: 44,
  imagesRequested: 12,
  mapFeaturesRendered: 44,
});

const summary = buildExplorePerformanceSummary(run, { completedAtMs: 1800 });
assert.strictEqual(summary.flow, 'nearby_route_discovery');
assert.strictEqual(summary.searchKey, 'gps:38.92,-120.78:100');
assert.strictEqual(summary.timeToFirstVisibleResultMs, 640);
assert.strictEqual(summary.timeToFullNearbyResultListMs, 800);
assert.strictEqual(summary.counts.routesEvaluated, 160);
assert.strictEqual(summary.counts.routesRendered, 44);
assert.strictEqual(summary.counts.imagesRequested, 12);
assert.strictEqual(summary.counts.mapFeaturesRendered, 44);
assert.strictEqual(summary.phases.route_catalog_query.durationMs, 450);
assert.strictEqual(summary.phases.filter_sort.durationMs, 85);
assert.strictEqual(summary.phases.geometry_normalization.durationMs, 40);
assert.strictEqual(summary.phases.image_fetch_cache.durationMs, 130);
assert.strictEqual(summary.phases.card_render.durationMs, 50);
assert.strictEqual(summary.phases.map_render.durationMs, 35);
assert.strictEqual(summary.slowestPhase.phase, 'route_catalog_query');
assert.strictEqual(summary.slowestPhase.durationMs, 450);
assert(summary.targets.cachedFirstVisibleResultMs <= 500, 'Cached first visible target should be explicit.');
assert(summary.bottleneckHints.some((hint) => hint.includes('route catalog query')), 'Slow query hint should identify the query path.');

const logged = [];
const logger = {
  debug(scope, message, payload) {
    logged.push({ scope, message, payload });
  },
};

assert.strictEqual(
  logExplorePerformanceDiagnostic(summary, {
    env: { EXPO_PUBLIC_ECS_EXPLORE_PERF_DEBUG: 'false' },
    logger,
  }),
  false,
);
assert.strictEqual(logged.length, 0, 'Logger should stay quiet when performance debug flag is disabled.');

assert.strictEqual(
  logExplorePerformanceDiagnostic(summary, {
    env: { EXPO_PUBLIC_ECS_EXPLORE_PERF_DEBUG: 'true' },
    logger,
  }),
  true,
);
assert.strictEqual(logged.length, 1);
assert.strictEqual(logged[0].scope, 'DISCOVERY');
assert(logged[0].message.includes('[EXPLORE PERF] nearby_route_discovery'));
assert.strictEqual(logged[0].payload.slowestPhase.phase, 'route_catalog_query');

[
  'createExplorePerformanceRun',
  'recordExplorePerformancePhase',
  'recordExplorePerformanceCount',
  'markExplorePerformanceEvent',
  'buildExplorePerformanceSummary',
  'logExplorePerformanceDiagnostic',
  'getExplorePerformanceNow',
  'route_catalog_query',
  'filter_sort',
  'geometry_normalization',
  'image_fetch_cache',
  'card_render',
  'map_render',
  'first_visible_result',
  'full_nearby_result_list',
].forEach((needle) => {
  assert(discoverSource.includes(needle), `Explore tab should wire performance diagnostic ${needle}.`);
});

[
  'createExplorePerformanceRun',
  'recordExplorePerformancePhase',
  'buildExplorePerformanceSummary',
  'logExplorePerformanceDiagnostic',
  'route_catalog_query',
  'createLiveTrailPackCatalogRefreshKey',
  'pendingRefreshesByKey',
  'pendingRefreshesByKey.get(refreshKey)',
  'pendingRefreshesByKey.delete(refreshKey)',
].forEach((needle) => {
  assert(liveCatalogSource.includes(needle), `Live route catalog refresh should wire performance diagnostic ${needle}.`);
});

console.log('Explore performance diagnostics checks passed.');

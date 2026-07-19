const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const originalLoad = Module._load;
const localValues = new Map();

global.localStorage = {
  getItem(key) {
    return localValues.has(key) ? localValues.get(key) : null;
  },
  setItem(key, value) {
    localValues.set(key, String(value));
  },
  removeItem(key) {
    localValues.delete(key);
  },
};

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const {
  EXPLORE_CATALOG_SUMMARY_CACHE_KEY,
  createRouteCatalogSummaryCache,
  exploreCatalogRegionCacheKey,
  paginateRouteCatalogSummaries,
} = require(path.join(root, 'lib', 'explore', 'routeCatalogSummaryCache.ts'));
const {
  clearExplorePlanningRouteContext,
  loadExplorePlanningRouteContext,
  saveExplorePlanningRouteContext,
} = require(path.join(root, 'lib', 'explore', 'explorePlanningRouteContextStore.ts'));

const PLANNING_CONTEXT_KEY = 'ecs_explore_planning_route_context';

function summary(routeId, popularityScore) {
  return {
    routeId,
    title: `Route ${routeId}`,
    region: null,
    forestName: null,
    distanceMeters: 1_000,
    estimatedDurationSeconds: 600,
    difficulty: 'moderate',
    popularityScore,
    communityRating: null,
    sourceType: 'official',
    bbox: null,
    trailheadCoordinate: null,
    thumbnailUrl: null,
    thumbnailAssetKey: null,
    updatedAt: '2026-07-18T00:00:00.000Z',
    tags: [],
  };
}

const rankedSummaries = Array.from({ length: 51 }, (_, index) =>
  summary(`route-${String(index).padStart(2, '0')}`, 100 - index),
);
rankedSummaries.splice(5, 0, summary('route-02', 0));
const expectedTopRouteIds = Array.from(
  { length: 20 },
  (_, index) => `route-${String(index).padStart(2, '0')}`,
);

async function run() {
  assert.equal(EXPLORE_CATALOG_SUMMARY_CACHE_KEY, 'explore.catalog.summary.v3');
  assert.equal(
    exploreCatalogRegionCacheKey('Privacy Safe Region'),
    'explore.catalog.region.privacy-safe-region.v3',
  );

  const cache = createRouteCatalogSummaryCache({ ttlMs: 1_000, staleMs: 1_000 });
  cache.set(EXPLORE_CATALOG_SUMMARY_CACHE_KEY, rankedSummaries, 1_000);
  assert.deepEqual(
    cache.entries.get(EXPLORE_CATALOG_SUMMARY_CACHE_KEY).summaries.map((item) => item.routeId),
    expectedTopRouteIds,
    'Cache writes must retain the supplied ranking while deduplicating and capping at 20.',
  );

  cache.entries.set(EXPLORE_CATALOG_SUMMARY_CACHE_KEY, {
    summaries: rankedSummaries,
    storedAtMs: 1_000,
  });
  const defensiveRead = cache.get(EXPLORE_CATALOG_SUMMARY_CACHE_KEY, 1_100);
  assert.equal(defensiveRead.status, 'hit');
  assert.deepEqual(
    defensiveRead.summaries.map((item) => item.routeId),
    expectedTopRouteIds,
    'Cache reads must normalize an oversized pre-contract entry before exposing it.',
  );
  assert.equal(
    cache.entries.get(EXPLORE_CATALOG_SUMMARY_CACHE_KEY).summaries.length,
    20,
    'A defensive read must replace an oversized in-memory entry with its bounded form.',
  );

  const defaultPage = paginateRouteCatalogSummaries(rankedSummaries);
  assert.equal(defaultPage.pageSize, 20);
  assert.equal(defaultPage.totalItems, 20);
  assert.equal(defaultPage.totalPages, 1);
  assert.deepEqual(defaultPage.items.map((item) => item.routeId), expectedTopRouteIds);

  const oversizedPage = paginateRouteCatalogSummaries(rankedSummaries, {
    pageIndex: 0,
    pageSize: 500,
  });
  assert.equal(oversizedPage.pageSize, 20, 'Oversized summary page limits must clamp to 20.');
  assert.equal(oversizedPage.items.length, 20);

  const planningRoutes = rankedSummaries.map((item) => ({
    id: item.routeId,
    name: item.title,
  }));
  const saved = saveExplorePlanningRouteContext({
    routes: planningRoutes,
    radiusMiles: 500,
    refinementLabel: 'Privacy-safe search',
  });
  assert.equal(saved.schemaVersion, 3);
  assert.deepEqual(saved.routes.map((route) => route.id), expectedTopRouteIds);

  const persisted = JSON.parse(localStorage.getItem(PLANNING_CONTEXT_KEY));
  assert.equal(persisted.schemaVersion, 3);
  assert.deepEqual(
    persisted.routes.map((route) => route.id),
    expectedTopRouteIds,
    'Persisted offline planning snapshots must never store more than 20 unique routes.',
  );

  await clearExplorePlanningRouteContext();
  localStorage.setItem(PLANNING_CONTEXT_KEY, JSON.stringify({
    ...persisted,
    routes: planningRoutes,
  }));
  assert.deepEqual(
    loadExplorePlanningRouteContext().routes.map((route) => route.id),
    expectedTopRouteIds,
    'Planning-context reads must cap an oversized current-contract snapshot.',
  );

  await clearExplorePlanningRouteContext();
  localStorage.setItem(PLANNING_CONTEXT_KEY, JSON.stringify({
    ...persisted,
    schemaVersion: 2,
    routes: planningRoutes,
  }));
  assert.equal(
    loadExplorePlanningRouteContext(),
    null,
    'The v3 contract must reject pre-cap planning snapshots so 50/51 routes cannot reappear.',
  );
  await clearExplorePlanningRouteContext();

  console.log('Explore route-result persistence cap checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

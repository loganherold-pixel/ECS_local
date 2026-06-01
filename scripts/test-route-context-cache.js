const assert = require('assert');
const path = require('path');
const fs = require('fs');
const ts = require('typescript');

const root = path.join(__dirname, '..');

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
  RouteContextOrchestrator,
  createRouteContextProviderRegistry,
} = require(path.join(root, 'lib', 'routeContext', 'index.ts'));

const enabledPrefetchFlags = {
  'ecs.routeContextEngine.enabled': true,
  'ecs.routeContextEngine.prefetchOnTrailSelect': true,
};

function defer() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function trail(id = 'cache-trail', origin = { lat: 38, lng: -110 }) {
  return {
    id,
    origin,
    explicitTrailhead: { lat: 38, lng: -110 },
    endpointCoordinate: { lat: 38.02, lng: -109.98 },
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-110, 38],
        [-109.99, 38.01],
        [-109.98, 38.02],
      ],
    },
  };
}

async function main() {
  let now = '2026-05-29T12:00:00.000Z';
  let computeCalls = 0;
  let failRouting = false;
  const routingAdapter = {
    id: 'cache-routing',
    isAvailable: () => true,
    async computeRoute() {
      computeCalls += 1;
      if (failRouting) throw new Error('route provider unavailable');
      return {
        coordinates: [
          { lat: 38, lng: -110 },
          { lat: 38.02, lng: -109.98 },
        ],
        distanceMeters: 3100,
        durationSeconds: 420,
      };
    },
    async computeRouteMatrix() {
      return { cells: [] };
    },
  };
  const orchestrator = new RouteContextOrchestrator({
    featureFlags: enabledPrefetchFlags,
    providerRegistry: createRouteContextProviderRegistry({ routing: routingAdapter }),
    now: () => now,
  });

  const ready = await orchestrator.prefetchForTrailSelection({
    trail: trail('fresh-hit'),
    selectedSupplyMode: 'none',
  });
  assert.strictEqual(ready.status, 'ready');
  assert.strictEqual(computeCalls, 1);

  const freshAgain = await orchestrator.prefetchForTrailSelection({
    trail: trail('fresh-hit'),
    selectedSupplyMode: 'none',
  });
  assert.strictEqual(freshAgain.status, 'ready');
  assert.strictEqual(computeCalls, 1, 'fresh cache hit should not call providers again');

  const deferred = defer();
  let slowCalls = 0;
  const slowRoutingAdapter = {
    id: 'slow-cache-routing',
    isAvailable: () => true,
    async computeRoute() {
      slowCalls += 1;
      await deferred.promise;
      return {
        coordinates: [
          { lat: 38, lng: -110 },
          { lat: 38.02, lng: -109.98 },
        ],
        distanceMeters: 3200,
        durationSeconds: 450,
      };
    },
    async computeRouteMatrix() {
      return { cells: [] };
    },
  };
  let swrNow = '2026-05-29T12:00:00.000Z';
  const staleOrchestrator = new RouteContextOrchestrator({
    featureFlags: enabledPrefetchFlags,
    providerRegistry: createRouteContextProviderRegistry({ routing: slowRoutingAdapter }),
    ttlMs: 5,
    now: () => swrNow,
  });
  deferred.resolve();
  await staleOrchestrator.prefetchForTrailSelection({
    trail: trail('stale-refresh'),
    selectedSupplyMode: 'none',
  });
  assert.strictEqual(slowCalls, 1);
  const secondDeferred = defer();
  slowRoutingAdapter.computeRoute = async function computeRouteRefresh() {
    slowCalls += 1;
    await secondDeferred.promise;
    return {
      coordinates: [
        { lat: 38, lng: -110 },
        { lat: 38.03, lng: -109.97 },
      ],
      distanceMeters: 4500,
      durationSeconds: 600,
    };
  };
  swrNow = '2026-05-29T12:00:01.000Z';
  const stale = staleOrchestrator.getContext({
    trailId: 'stale-refresh',
    trail: trail('stale-refresh'),
    selectedSupplyMode: 'none',
  });
  assert.strictEqual(stale.status, 'stale');
  assert.ok(stale.warnings.some((warning) => warning.code === 'stale_cached_context'));
  assert.strictEqual(stale.routeGeometry.durationSeconds, 450);
  const staleSnapshot = staleOrchestrator.getJobSnapshot({ trailId: 'stale-refresh', selectedSupplyMode: 'none' });
  assert.strictEqual(staleSnapshot.inFlight, true);
  assert.strictEqual(slowCalls, 2, 'stale read should start a background refresh');
  secondDeferred.resolve();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const snapshot = staleOrchestrator.getJobSnapshot({ trailId: 'stale-refresh', selectedSupplyMode: 'none' });
    if (snapshot && !snapshot.inFlight) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const refreshed = staleOrchestrator.getContext({ trailId: 'stale-refresh', selectedSupplyMode: 'none' });
  assert.strictEqual(refreshed.routeGeometry.durationSeconds, 600);

  now = '2026-05-29T12:31:00.000Z';
  failRouting = true;
  const fallback = await orchestrator.refreshContext({
    trailId: 'fresh-hit',
    trail: trail('fresh-hit'),
    selectedSupplyMode: 'none',
  });
  assert.strictEqual(fallback.status, 'stale');
  assert.strictEqual(fallback.routeGeometry.durationSeconds, 420);
  assert.ok(fallback.warnings.some((warning) => warning.code === 'provider_unavailable'));
  assert.strictEqual(fallback.providerMetadata.cacheFallbackUsed, true);

  const duplicateDeferred = defer();
  let duplicateCalls = 0;
  const duplicateRouting = {
    id: 'duplicate-routing',
    isAvailable: () => true,
    async computeRoute() {
      duplicateCalls += 1;
      await duplicateDeferred.promise;
      return {
        coordinates: [
          { lat: 38, lng: -110 },
          { lat: 38.02, lng: -109.98 },
        ],
        distanceMeters: 3100,
        durationSeconds: 420,
      };
    },
    async computeRouteMatrix() {
      return { cells: [] };
    },
  };
  const duplicateOrchestrator = new RouteContextOrchestrator({
    featureFlags: enabledPrefetchFlags,
    providerRegistry: createRouteContextProviderRegistry({ routing: duplicateRouting }),
  });
  const firstJob = duplicateOrchestrator.prefetchForTrailSelection({
    trail: trail('duplicate-job'),
    selectedSupplyMode: 'none',
  });
  const secondJob = duplicateOrchestrator.prefetchForTrailSelection({
    trail: trail('duplicate-job'),
    selectedSupplyMode: 'none',
  });
  assert.strictEqual(firstJob, secondJob);
  duplicateDeferred.resolve();
  await firstJob;
  assert.strictEqual(duplicateCalls, 1);

  const keyOrchestrator = new RouteContextOrchestrator({
    featureFlags: enabledPrefetchFlags,
    appVersion: 'app-v1',
    providerVersion: 'provider-v1',
  });
  const gasKey = keyOrchestrator.buildContextKey({
    trail: trail('key-trail'),
    selectedSupplyMode: 'gas',
  });
  const groceryKey = keyOrchestrator.buildContextKey({
    trail: trail('key-trail'),
    selectedSupplyMode: 'grocery',
  });
  assert.notStrictEqual(gasKey, groceryKey, 'supply mode should be part of context key');
  const originA = keyOrchestrator.buildContextKey({
    trail: trail('key-trail', { lat: 38, lng: -110 }),
    selectedSupplyMode: 'none',
  });
  const originB = keyOrchestrator.buildContextKey({
    trail: trail('key-trail', { lat: 38.25, lng: -110.25 }),
    selectedSupplyMode: 'none',
  });
  assert.notStrictEqual(originA, originB, 'origin bucket should be part of context key');
  const providerA = keyOrchestrator.buildContextKey({
    trail: trail('key-trail'),
    selectedSupplyMode: 'none',
    providerVersion: 'provider-v1',
  });
  const providerB = keyOrchestrator.buildContextKey({
    trail: trail('key-trail'),
    selectedSupplyMode: 'none',
    providerVersion: 'provider-v2',
  });
  assert.notStrictEqual(providerA, providerB, 'provider version should be part of context key');

  let disabledCalls = 0;
  const disabled = new RouteContextOrchestrator({
    featureFlags: { 'ecs.routeContextEngine.enabled': false },
    providerRegistry: createRouteContextProviderRegistry({
      routing: {
        id: 'disabled-routing',
        isAvailable: () => true,
        async computeRoute() {
          disabledCalls += 1;
          return { coordinates: [], distanceMeters: 0 };
        },
        async computeRouteMatrix() {
          return { cells: [] };
        },
      },
    }),
  });
  const disabledContext = await disabled.prefetchForTrailSelection({
    trail: trail('disabled-cache'),
    selectedSupplyMode: 'none',
  });
  assert.strictEqual(disabledContext.status, 'idle');
  assert.strictEqual(disabled.getJobSnapshot({ trailId: 'disabled-cache', selectedSupplyMode: 'none' }), null);
  assert.strictEqual(disabledCalls, 0);
}

main()
  .then(() => {
    console.log('Route Context cache and freshness checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

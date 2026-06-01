const assert = require('assert');
const fs = require('fs');
const path = require('path');
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

const enabledNoPrefetchFlags = {
  'ecs.routeContextEngine.enabled': true,
  'ecs.routeContextEngine.prefetchOnTrailSelect': false,
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

function route(id = 'orchestrator-trail') {
  return {
    id,
    origin: { lat: 38, lng: -110 },
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
  const disabled = new RouteContextOrchestrator({ featureFlags: { 'ecs.routeContextEngine.enabled': false } });
  const disabledContext = await disabled.prefetchForTrailSelection({
    trail: route('disabled-trail'),
    selectedSupplyMode: 'gas',
  });
  assert.strictEqual(disabledContext.status, 'idle');
  assert.strictEqual(disabled.getContext({ trailId: 'disabled-trail' }).status, 'idle');

  const noPrefetch = new RouteContextOrchestrator({ featureFlags: enabledNoPrefetchFlags });
  const noPrefetchContext = await noPrefetch.prefetchForTrailSelection({
    trail: route('no-prefetch-trail'),
    selectedSupplyMode: 'gas',
  });
  assert.strictEqual(noPrefetchContext.status, 'idle');
  assert.strictEqual(noPrefetch.getJobSnapshot({ trailId: 'no-prefetch-trail', selectedSupplyMode: 'gas' }), null);

  const routeDeferred = defer();
  const routingAdapter = {
    id: 'slow-routing',
    isAvailable: () => true,
    async computeRoute() {
      await routeDeferred.promise;
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
  const placesAdapter = {
    id: 'mock-places',
    isAvailable: () => true,
    async searchNearby() {
      return [{
        id: 'gas-1',
        providerPlaceId: 'place-gas-1',
        category: 'gas',
        name: 'Trailhead Fuel',
        coordinate: { lat: 38.001, lng: -110.001 },
        score: 0.91,
        confidence: 0.8,
      }];
    },
    async searchText() {
      return [];
    },
  };
  let orchestratorNow = '2026-05-29T12:00:00.000Z';
  const orchestrator = new RouteContextOrchestrator({
    featureFlags: enabledPrefetchFlags,
    providerRegistry: createRouteContextProviderRegistry({
      routing: routingAdapter,
      places: placesAdapter,
    }),
    ttlMs: 5,
    now: () => orchestratorNow,
  });

  const startedAt = Date.now();
  const job = orchestrator.prefetchForTrailSelection({
    trail: route('start-job'),
    selectedSupplyMode: 'gas',
  });
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 50, 'prefetch should return immediately without blocking navigation');
  const early = orchestrator.getContext({ trailId: 'start-job', selectedSupplyMode: 'gas' });
  assert.ok(['queued', 'resolving_trailhead', 'finding_supplies', 'building_geometry'].includes(early.status));
  const snapshot = orchestrator.getJobSnapshot({ trailId: 'start-job', selectedSupplyMode: 'gas' });
  assert.ok(snapshot);
  assert.strictEqual(snapshot.inFlight, true);

  routeDeferred.resolve();
  const ready = await job;
  assert.strictEqual(ready.status, 'ready');
  assert.strictEqual(ready.trailheadAnchor.source, 'explicit_trailhead');
  assert.strictEqual(ready.supplyCandidates.length, 1);
  assert.strictEqual(ready.routeGeometry.durationSeconds, 420);
  assert.strictEqual(orchestrator.getContext({ trailId: 'start-job', selectedSupplyMode: 'gas' }).status, 'ready');

  orchestratorNow = '2026-05-29T12:00:00.010Z';
  const stale = orchestrator.getContext({ trailId: 'start-job', selectedSupplyMode: 'gas' });
  assert.strictEqual(stale.status, 'stale');
  assert.ok(stale.warnings.some((warning) => warning.code === 'stale_cached_context'));

  const missingOrigin = new RouteContextOrchestrator({ featureFlags: enabledPrefetchFlags });
  const missingOriginContext = await missingOrigin.prefetchForTrailSelection({
    trail: {
      id: 'missing-origin',
      explicitTrailhead: { lat: 38, lng: -110 },
      routeGeometry: {
        type: 'LineString',
        coordinates: [
          [-110, 38],
          [-109.99, 38.01],
        ],
      },
    },
    selectedSupplyMode: 'none',
  });
  assert.strictEqual(missingOriginContext.status, 'partial');
  assert.ok(missingOriginContext.warnings.some((warning) => warning.code === 'missing_origin'));

  const missingProvider = new RouteContextOrchestrator({ featureFlags: enabledPrefetchFlags });
  const missingProviderContext = await missingProvider.prefetchForTrailSelection({
    trail: route('missing-provider'),
    selectedSupplyMode: 'gas',
  });
  assert.strictEqual(missingProviderContext.status, 'partial');
  assert.ok(missingProviderContext.warnings.some((warning) => warning.code === 'provider_unavailable'));

  const manualSelectionPlaces = {
    id: 'manual-selection-places',
    isAvailable: () => true,
    async searchNearby() {
      return [
        {
          id: 'gas-recommended',
          providerPlaceId: 'place-gas-recommended',
          category: 'gas',
          name: 'Recommended Fuel',
          coordinate: { lat: 38.001, lng: -110.001 },
          score: 0.99,
          confidence: 0.9,
        },
        {
          id: 'gas-operator',
          providerPlaceId: 'place-gas-operator',
          category: 'gas',
          name: 'Operator Fuel',
          coordinate: { lat: 38.002, lng: -110.002 },
          score: 0.65,
          confidence: 0.8,
        },
      ];
    },
    async searchText() {
      return [];
    },
  };
  const manualSelectionOrchestrator = new RouteContextOrchestrator({
    featureFlags: enabledPrefetchFlags,
    providerRegistry: createRouteContextProviderRegistry({ places: manualSelectionPlaces }),
  });
  const manualSelectionContext = await manualSelectionOrchestrator.prefetchForTrailSelection({
    trail: route('manual-selection'),
    selectedSupplyMode: 'gas',
    selectedRefuelCandidateId: 'gas-operator',
    selectedSupplyCandidateIds: ['gas-operator'],
  });
  assert.strictEqual(manualSelectionContext.selectedSupplyPlan.gasCandidate.id, 'gas-operator');
  assert.strictEqual(
    manualSelectionOrchestrator.getContext({
      trailId: 'manual-selection',
      selectedSupplyMode: 'gas',
      selectedRefuelCandidateId: 'gas-operator',
      selectedSupplyCandidateIds: ['gas-operator'],
    }).selectedSupplyPlan.gasCandidate.id,
    'gas-operator',
  );
  assert.notStrictEqual(
    manualSelectionOrchestrator.buildContextKey({
      trailId: 'manual-selection',
      selectedSupplyMode: 'gas',
    }),
    manualSelectionOrchestrator.buildContextKey({
      trailId: 'manual-selection',
      selectedSupplyMode: 'gas',
      selectedRefuelCandidateId: 'gas-operator',
      selectedSupplyCandidateIds: ['gas-operator'],
    }),
    'Manual supply candidate selections should create a distinct route-context cache key.',
  );

  const cancelDeferred = defer();
  const cancelOrchestrator = new RouteContextOrchestrator({
    featureFlags: enabledPrefetchFlags,
    providerRegistry: createRouteContextProviderRegistry({
      routing: {
        id: 'cancel-routing',
        isAvailable: () => true,
        async computeRoute() {
          await cancelDeferred.promise;
          return {
            coordinates: [
              { lat: 38, lng: -110 },
              { lat: 38.02, lng: -109.98 },
            ],
            distanceMeters: 3000,
            durationSeconds: 400,
          };
        },
        async computeRouteMatrix() {
          return { cells: [] };
        },
      },
    }),
  });
  const cancelledJob = cancelOrchestrator.prefetchForTrailSelection({
    trail: route('cancel-me'),
    selectedSupplyMode: 'none',
  });
  cancelOrchestrator.cancelContextJob({ trailId: 'cancel-me' });
  cancelDeferred.resolve();
  await cancelledJob;
  const cancelledSnapshot = cancelOrchestrator.getJobSnapshot({ trailId: 'cancel-me', selectedSupplyMode: 'none' });
  assert.strictEqual(cancelledSnapshot.inFlight, false);
  assert.ok(['building_geometry', 'resolving_trailhead', 'queued'].includes(cancelledSnapshot.status));

  const refreshed = await orchestrator.refreshContext({
    trailId: 'start-job',
    trail: route('start-job'),
    selectedSupplyMode: 'none',
  });
  assert.ok(['ready', 'partial'].includes(refreshed.status));
}

main()
  .then(() => {
    console.log('Route Context orchestrator checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(process.cwd());

require.extensions['.ts'] = function compileTypescript(module, filename) {
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

let invokeImplementation = async () => ({
  data: { segments: [], meta: { degraded: false } },
  error: null,
});
let lastInvoke = null;
let supabaseConfigured = true;
let routeGeometryFunctionDeployed = true;
const originalLoad = Module._load;
Module._load = function loadWithSupabaseStub(request, parent, isMain) {
  if (request === './supabase' && parent?.filename?.endsWith('routeGeometryViewportClient.ts')) {
    return {
      EDGE_FUNCTION_UNAVAILABLE_CODE: 'EDGE_FUNCTION_UNAVAILABLE',
      SUPABASE_CONFIG_UNAVAILABLE_CODE: 'SUPABASE_CONFIG_UNAVAILABLE',
      get isSupabaseConfigured() {
        return supabaseConfigured;
      },
      isDeployedEdgeFunction(name) {
        return routeGeometryFunctionDeployed && name === 'route-geometry-segments';
      },
      supabase: {
        functions: {
          invoke(name, options) {
            lastInvoke = { name, options };
            return invokeImplementation(name, options);
          },
        },
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

const client = require(path.join(root, 'lib', 'routeGeometryViewportClient.ts'));
const mvum = require(path.join(root, 'src', 'features', 'navigate', 'mvum', 'index.ts'));
const { NavigateMapLayerCoordinator } = require(
  path.join(root, 'lib', 'map', 'navigateMapLayerCoordinator.ts'),
);

const bbox = {
  minLng: -120.9,
  minLat: 38.8,
  maxLng: -120.5,
  maxLat: 39.1,
};

async function testProviderLifecycle() {
  supabaseConfigured = false;
  assert.deepStrictEqual(client.getRouteGeometryViewportProviderAvailability(), {
    available: false,
    safeErrorCode: 'SUPABASE_CONFIG_UNAVAILABLE',
    reason: 'supabase_not_configured',
  });
  supabaseConfigured = true;
  routeGeometryFunctionDeployed = false;
  assert.strictEqual(
    client.getRouteGeometryViewportProviderAvailability().safeErrorCode,
    'EDGE_FUNCTION_UNAVAILABLE',
  );
  routeGeometryFunctionDeployed = true;

  invokeImplementation = async () => ({
    data: { segments: [], meta: { degraded: false, candidateCount: 0 } },
    error: null,
  });
  const empty = await client.fetchRouteGeometryViewportSegments({ bbox, zoom: 12, timeoutMs: 100 });
  assert.strictEqual(empty.segments.length, 0);
  assert.strictEqual(lastInvoke.name, 'route-geometry-segments');
  assert.strictEqual(lastInvoke.options.body.limit, 20, 'Missing client limits must resolve to the safe default.');
  assert(lastInvoke.options.signal instanceof AbortSignal, 'Supabase invoke must receive a transport AbortSignal.');

  invokeImplementation = async () => ({
    data: {
      segments: Array.from({ length: 51 }, (_, index) => ({
        id: `route-${String(index).padStart(2, '0')}`,
        name: `Route ${String(index).padStart(2, '0')}`,
        confidenceScore: index,
        lastVerifiedAt: '2026-07-19T00:00:00.000Z',
        geometry: { type: 'LineString', coordinates: [[-120.8, 38.9], [-120.7, 39]] },
      })),
      meta: { degraded: false, candidateCount: 51 },
    },
    error: null,
  });
  const bounded = await client.fetchRouteGeometryViewportSegments({
    bbox,
    zoom: 12,
    limit: 500,
    timeoutMs: 100,
  });
  assert.strictEqual(lastInvoke.options.body.limit, 20, 'Oversized client limits must clamp to 20.');
  assert.strictEqual(bounded.segments.length, 20);
  assert.strictEqual(bounded.segments[0].id, 'route-50', 'Client defense must rank before slicing.');
  assert.strictEqual(bounded.additionalMatchesAvailable, true);
  const memoryCoordinator = new NavigateMapLayerCoordinator();
  memoryCoordinator.writeCache({
    layer: 'mvum',
    key: 'bounded-live-result',
    value: bounded,
    ttlMs: 1_000,
  });
  assert.strictEqual(
    memoryCoordinator.readCache('mvum', 'bounded-live-result').value.segments.length,
    20,
    'The live result written to the Navigate memory cache must already be bounded.',
  );

  invokeImplementation = async () => ({
    data: {
      segments: [
        {
          id: 'mvum-segment',
          geometry: { type: 'LineString', coordinates: [[-120.8, 38.9], [-120.7, 39]] },
          source_records: [{ providerId: 'usfs_mvum_california' }],
        },
        {
          id: 'usgs-segment',
          geometry: { type: 'LineString', coordinates: [[-120.7, 38.9], [-120.6, 39]] },
          source_records: [{ providerId: 'usgs_trails' }],
        },
      ],
      meta: { degraded: false, candidateCount: 2 },
    },
    error: null,
  });
  const mvumOnly = await client.fetchRouteGeometryViewportSegments({
    bbox,
    zoom: 12,
    sourceProviderPrefix: 'usfs_mvum',
    timeoutMs: 100,
  });
  assert.strictEqual(lastInvoke.options.body.sourceProviderPrefix, 'usfs_mvum');
  assert.deepStrictEqual(mvumOnly.segments.map((segment) => segment.id), ['mvum-segment']);
  assert.strictEqual(mvumOnly.sourceFilterApplied, true);

  invokeImplementation = () => new Promise(() => {});
  await assert.rejects(
    client.fetchRouteGeometryViewportSegments({ bbox, zoom: 12, timeoutMs: 15 }),
    (error) => error?.name === 'RouteGeometryViewportTimeoutError' && /timed out/i.test(error.message),
  );
  assert.strictEqual(lastInvoke.options.signal.aborted, true, 'Timeout must abort the provider transport.');

  const caller = new AbortController();
  const cancelled = client.fetchRouteGeometryViewportSegments({
    bbox,
    zoom: 12,
    timeoutMs: 500,
    signal: caller.signal,
  });
  caller.abort();
  await assert.rejects(cancelled, (error) => error?.name === 'AbortError');
  assert.strictEqual(lastInvoke.options.signal.aborted, true, 'Caller cancellation must abort provider transport.');
}

function testPlanningAndRequestIdentity() {
  const belowZoom = mvum.planNavigateMvumViewportFetch({
    enabled: true,
    bbox,
    zoom: 8,
    online: true,
    vectorTileUrl: 'https://tiles.example.test/mvum/{z}/{x}/{y}.pbf',
  });
  assert.strictEqual(belowZoom.status, 'zoom_deferred', 'Vector configuration must not bypass min zoom.');

  const offline = mvum.planNavigateMvumViewportFetch({
    enabled: true,
    bbox,
    zoom: 12,
    online: false,
  });
  assert.strictEqual(offline.status, 'offline');
  assert(offline.cacheKey?.startsWith('navigate.mvum.viewport:'), 'Offline MVUM planning needs a cache key.');

  const coordinator = new NavigateMapLayerCoordinator();
  const firstPlan = coordinator.plan({
    layer: 'route_geometry',
    enabled: true,
    zoomEligible: true,
    online: true,
    viewportFingerprint: 'first',
    bounds: { west: -121, south: 38, east: -120, north: 39 },
    now: 1,
  });
  assert.strictEqual(firstPlan.kind, 'scheduled');
  const first = coordinator.consumeDue('route_geometry', 1);
  assert(first);
  coordinator.plan({
    layer: 'route_geometry',
    enabled: true,
    zoomEligible: true,
    online: true,
    viewportFingerprint: 'second',
    bounds: { west: -120, south: 38, east: -119, north: 39 },
    now: 2,
  });
  assert.strictEqual(first.signal.aborted, true, 'A newer viewport must cancel the older request.');
  assert.strictEqual(
    coordinator.complete(first, { itemCount: 99 }),
    false,
    'A stale provider response must not overwrite the newer viewport.',
  );
}

function testMountedIntegrationContract() {
  const navigate = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'components', 'navigate', 'MapRenderer.tsx'), 'utf8');

  assert(
    renderer.includes("send('mapReady', { ok: true });\n          sendBounds();") &&
      !renderer.includes('hasHandledInitialBoundsTriggerRef'),
    'Definitive map load must send bounds and the first requested handshake must not be discarded.',
  );
  assert(
    navigate.includes('NAVIGATE_VIEWPORT_BOUNDS_TIMEOUT_MS = 5_000') &&
      navigate.includes("safeErrorCode: 'MAP_BOUNDS_TIMEOUT'") &&
      navigate.includes('accessibilityLabel="Retry ECS route geometry"') &&
      navigate.includes('accessibilityLabel="Retry MVUM segments"'),
    'Mounted Navigate overlays need a bounded missing-bounds terminal state and explicit retries.',
  );
  assert(
    navigate.includes('limit: ECS_ROUTE_SEARCH_RESULT_LIMIT') &&
      navigate.includes('...capRouteGeometryViewportResult(result)') &&
      navigate.includes('ECS_ROUTE_SEARCH_RESULT_CAP_NOTICE'),
    'Mounted Navigate must request, cache, and truthfully describe only the 20 best MVUM matches.',
  );
  assert(
    navigate.includes('createECSAsyncSurfaceState') &&
      navigate.includes('beginECSAsyncSurfaceRequest') &&
      navigate.includes('settleECSAsyncSurfaceRequest'),
    'Mounted Navigate state must reuse the shared ECS async surface state model.',
  );
  assert(
    /if \(!resultForCache\.degraded\) \{\s*navigateMapLayerCoordinatorRef\.current\.writeCache\(\{\s*layer: 'mvum'/.test(navigate),
    'Degraded MVUM route geometry responses must never be cached as successful empty data.',
  );
}

async function main() {
  try {
    await testProviderLifecycle();
    testPlanningAndRequestIdentity();
    testMountedIntegrationContract();
    console.log('Navigate viewport async hardening checks passed.');
  } finally {
    Module._load = originalLoad;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

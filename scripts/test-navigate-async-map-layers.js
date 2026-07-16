const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

global.__DEV__ = false;

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
};

const root = path.resolve(__dirname, '..');
const load = (relativePath) => require(path.join(root, relativePath));

const {
  beginECSAsyncSurfaceRequest,
  cancelECSAsyncSurfaceRequest,
  createECSAsyncSurfaceDiagnostic,
  createECSAsyncSurfaceState,
  disableECSAsyncSurface,
  settleECSAsyncSurfaceRequest,
} = load('lib/state/asyncSurfaceState.ts');
const {
  NavigateMapLayerCoordinator,
} = load('lib/map/navigateMapLayerCoordinator.ts');
const {
  createNavigateAsyncLayerDiagnostic,
} = load('lib/map/navigateAsyncLayerDiagnostic.ts');
const {
  MVUM_OVERLAY_MIN_ZOOM,
  MVUM_OVERLAY_SOURCE_ID,
  MVUM_OVERLAY_LAYER_ID,
  MVUM_OVERLAY_SELECTED_LAYER_ID,
  buildNavigateMvumViewportCacheKey,
  planNavigateMvumViewportFetch,
} = load('src/features/navigate/mvum/index.ts');
const {
  normalizeRouteGeometryViewportBbox,
  normalizeRouteGeometryViewportResponse,
} = load('lib/routeGeometryViewport.ts');

const viewportA = {
  minLng: -120.72,
  minLat: 39.18,
  maxLng: -120.28,
  maxLat: 39.42,
};
const viewportB = {
  minLng: -120.20,
  minLat: 39.10,
  maxLng: -119.90,
  maxLat: 39.35,
};

function makeRawSegment(id = 'segment-a') {
  return {
    id,
    name: `Segment ${id}`,
    sourceKind: 'route_catalog',
    sourceId: id,
    sourceLabel: 'USFS MVUM',
    dataState: 'live',
    confidence: 'high',
    legalityStatus: 'legal_verified',
    publicAccessStatus: 'open',
    warnings: [],
    geometry: {
      type: 'LineString',
      coordinates: [
        [-120.60, 39.20],
        [-120.50, 39.30],
      ],
    },
  };
}

function resultFromSegments(segments, meta = {}) {
  return normalizeRouteGeometryViewportResponse({
    ok: true,
    segments,
    meta: {
      candidateCount: segments.length,
      cappedCount: 0,
      skippedMissingGeometryCount: 0,
      skippedClosedCount: 0,
      bboxFilterApplied: true,
      ...meta,
    },
  });
}

function createSurface(surfaceId) {
  return createECSAsyncSurfaceState({
    surfaceId,
    provider: 'route-geometry-segments',
    now: 0,
  });
}

function beginSurface(state, fingerprint, now) {
  return beginECSAsyncSurfaceRequest(state, {
    requestFingerprint: fingerprint,
    provider: 'route-geometry-segments',
    now,
  });
}

function settleSurface(state, status, options = {}) {
  return settleECSAsyncSurfaceRequest(state, {
    requestId: state.requestId,
    generation: state.generation,
    requestFingerprint: state.requestFingerprint,
    status,
    data: options.data,
    lastGoodData: options.lastGoodData,
    resultCount: options.resultCount,
    source: options.source ?? (status === 'ready' || status === 'empty' ? 'live' : 'unavailable'),
    freshness: options.freshness ?? (status === 'ready' || status === 'empty' ? 'live' : 'unavailable'),
    safeErrorCode: options.safeErrorCode,
    retryEligible: options.retryEligible,
    providerStatus: options.providerStatus,
    cancellationReason: options.cancellationReason,
    now: options.now ?? (state.startedAt ?? 0) + 10,
  });
}

function scheduleLayer(coordinator, layer, fingerprint, bounds, now = 0) {
  const plan = coordinator.plan({
    layer,
    enabled: true,
    zoomEligible: true,
    online: true,
    viewportFingerprint: fingerprint,
    bounds: {
      west: bounds.minLng,
      south: bounds.minLat,
      east: bounds.maxLng,
      north: bounds.maxLat,
    },
    debounceMs: 0,
    now,
  });
  assert.strictEqual(plan.kind, 'scheduled');
  const request = coordinator.consumeDue(layer, now);
  assert(request, `${layer} should produce a due request`);
  return request;
}

function testMvumTerminalStates() {
  const plan = planNavigateMvumViewportFetch({
    enabled: true,
    bbox: viewportA,
    zoom: 12,
    online: true,
  });
  assert.strictEqual(plan.status, 'fetch_viewport');

  const successResult = resultFromSegments([makeRawSegment('mvum-success')]);
  const successCoordinator = new NavigateMapLayerCoordinator();
  const successRequest = scheduleLayer(successCoordinator, 'mvum', plan.cacheKey, plan.bbox, 10);
  let successState = beginSurface(createSurface('navigate_mvum_segments'), plan.cacheKey, 10);
  assert.strictEqual(successState.status, 'loading');
  assert.strictEqual(successCoordinator.complete(successRequest, {
    itemCount: successResult.segments.length,
    sourceState: 'live',
  }), true);
  successState = settleSurface(successState, 'ready', {
    data: successResult,
    resultCount: successResult.segments.length,
    now: 20,
  }).state;
  assert.strictEqual(successState.status, 'ready', 'MVUM success must leave loading');
  assert.strictEqual(successState.resultCount, 1);

  const emptyResult = resultFromSegments([]);
  const emptyState = settleSurface(
    beginSurface(createSurface('navigate_mvum_segments'), 'mvum-empty', 30),
    'empty',
    { data: emptyResult, resultCount: 0, now: 40 },
  ).state;
  assert.strictEqual(emptyState.status, 'empty', 'A valid empty MVUM response is terminal empty');
  assert.strictEqual(emptyState.resultCount, 0);
  assert.strictEqual(emptyState.safeErrorCode, null);

  const failureCoordinator = new NavigateMapLayerCoordinator();
  const failureRequest = scheduleLayer(failureCoordinator, 'mvum', 'mvum-provider-failure', viewportA, 50);
  assert.strictEqual(failureCoordinator.fail(failureRequest, new Error('provider failed')), true);
  const failedState = settleSurface(
    beginSurface(createSurface('navigate_mvum_segments'), 'mvum-provider-failure', 50),
    'error',
    {
      safeErrorCode: 'PROVIDER_UNAVAILABLE',
      retryEligible: true,
      providerStatus: 'unavailable',
      now: 60,
    },
  ).state;
  assert.strictEqual(failedState.status, 'error', 'MVUM provider failure must not remain loading');
  assert.strictEqual(failedState.retryEligible, true);

  const zoomDeferred = planNavigateMvumViewportFetch({
    enabled: true,
    bbox: viewportA,
    zoom: MVUM_OVERLAY_MIN_ZOOM - 0.1,
    online: true,
  });
  assert.strictEqual(zoomDeferred.status, 'zoom_deferred');
  const zoomCoordinator = new NavigateMapLayerCoordinator();
  const zoomPlan = zoomCoordinator.plan({
    layer: 'mvum',
    enabled: true,
    zoomEligible: false,
    online: true,
    viewportFingerprint: 'zoom-deferred',
    bounds: { west: -1, south: -1, east: 1, north: 1 },
  });
  assert.strictEqual(zoomPlan.kind, 'skip');
  assert.strictEqual(zoomPlan.reason, 'zoom_ineligible');
  assert.strictEqual(zoomCoordinator.getState('mvum').loading, false, 'Zoom-deferred is not loading');
}

function testRouteGeometryTerminalStatesAndMalformedFeatures() {
  const successResult = resultFromSegments([makeRawSegment('route-success')]);
  let success = beginSurface(createSurface('navigate_route_geometry'), 'route-success', 100);
  success = settleSurface(success, 'ready', {
    data: successResult,
    resultCount: successResult.segments.length,
    now: 110,
  }).state;
  assert.strictEqual(success.status, 'ready');
  assert.strictEqual(success.resultCount, 1);

  const emptyResult = resultFromSegments([]);
  let empty = beginSurface(createSurface('navigate_route_geometry'), 'route-empty', 120);
  empty = settleSurface(empty, 'empty', { data: emptyResult, resultCount: 0, now: 130 }).state;
  assert.strictEqual(empty.status, 'empty');
  assert.strictEqual(empty.resultCount, 0);

  const malformedMixed = resultFromSegments([
    makeRawSegment('valid-among-malformed'),
    {
      id: 'malformed',
      geometry: { type: 'LineString', coordinates: [['bad', 'geometry']] },
    },
  ]);
  assert.strictEqual(malformedMixed.segments.length, 1, 'Valid geometry must survive a malformed neighbor');
  assert.strictEqual(
    malformedMixed.skippedMissingGeometryCount,
    1,
    'Malformed features must be counted and excluded',
  );
}

function testStaleAndRapidViewports() {
  const coordinator = new NavigateMapLayerCoordinator();
  const first = scheduleLayer(coordinator, 'mvum', 'viewport-a', viewportA, 200);
  const secondPlan = coordinator.plan({
    layer: 'mvum',
    enabled: true,
    zoomEligible: true,
    online: true,
    viewportFingerprint: 'viewport-b',
    bounds: {
      west: viewportB.minLng,
      south: viewportB.minLat,
      east: viewportB.maxLng,
      north: viewportB.maxLat,
    },
    debounceMs: 0,
    now: 201,
  });
  assert.strictEqual(secondPlan.kind, 'scheduled');
  assert.strictEqual(first.signal.aborted, true, 'A newer MVUM viewport must abort the old request');
  assert.strictEqual(coordinator.complete(first, { itemCount: 99 }), false, 'A stale result cannot apply');
  const second = coordinator.consumeDue('mvum', 201);
  assert(second);
  assert.strictEqual(coordinator.complete(second, { itemCount: 1 }), true);
  assert.strictEqual(coordinator.getState('mvum').viewportFingerprint, 'viewport-b');

  const rapid = new NavigateMapLayerCoordinator();
  const requests = [];
  for (let index = 0; index < 12; index += 1) {
    const request = scheduleLayer(
      rapid,
      'route_geometry',
      `rapid-${index}`,
      {
        minLng: viewportA.minLng + index * 0.02,
        minLat: viewportA.minLat,
        maxLng: viewportA.maxLng + index * 0.02,
        maxLat: viewportA.maxLat,
      },
      300 + index,
    );
    requests.push(request);
    assert(rapid.activeRequestCount <= 1, 'Rapid pan/zoom must keep one active request per layer');
  }
  requests.slice(0, -1).forEach((request) => {
    assert.strictEqual(request.signal.aborted, true);
    assert.strictEqual(rapid.complete(request, { itemCount: 1 }), false);
  });
  assert.strictEqual(rapid.complete(requests[requests.length - 1], { itemCount: 2 }), true);
  const diagnostics = rapid.getDiagnostics();
  assert.strictEqual(diagnostics.requestCount, 12, 'Request count should remain bounded by viewport generations');
  assert.strictEqual(diagnostics.outstandingRequestCount, 0);
}

function testToggleOffAndCancellation() {
  const coordinator = new NavigateMapLayerCoordinator();
  const request = scheduleLayer(coordinator, 'mvum', 'toggle-off', viewportA, 400);
  const disabledPlan = coordinator.plan({
    layer: 'mvum',
    enabled: false,
    zoomEligible: true,
    online: true,
    viewportFingerprint: 'toggle-off',
    bounds: {
      west: viewportA.minLng,
      south: viewportA.minLat,
      east: viewportA.maxLng,
      north: viewportA.maxLat,
    },
    now: 401,
  });
  assert.strictEqual(disabledPlan.kind, 'skip');
  assert.strictEqual(disabledPlan.reason, 'disabled');
  assert.strictEqual(request.signal.aborted, true);
  assert.strictEqual(coordinator.getState('mvum').loading, false);

  const loading = beginSurface(createSurface('navigate_mvum_segments'), 'toggle-off', 400);
  const disabled = disableECSAsyncSurface(loading, {
    reason: 'feature_disabled',
    safeErrorCode: 'FEATURE_DISABLED',
    now: 401,
  });
  assert.strictEqual(disabled.status, 'disabled');
  assert.strictEqual(disabled.retryEligible, false);

  const cancelLoading = beginSurface(createSurface('navigate_route_geometry'), 'cancel', 410);
  const cancelled = cancelECSAsyncSurfaceRequest(cancelLoading, {
    requestId: cancelLoading.requestId,
    generation: cancelLoading.generation,
    requestFingerprint: cancelLoading.requestFingerprint,
    reason: 'consumer_cancelled',
    now: 411,
  });
  assert.strictEqual(cancelled.applied, true);
  assert.strictEqual(cancelled.state.status, 'cancelled');
}

function testOfflineCacheAndLayerIsolation() {
  const coordinator = new NavigateMapLayerCoordinator();
  const bbox = normalizeRouteGeometryViewportBbox(viewportA);
  assert(bbox);
  const mvumKey = buildNavigateMvumViewportCacheKey(bbox, 12, null);
  const sharedKey = 'same-provider-fingerprint';
  const mvumResult = resultFromSegments([makeRawSegment('cached-mvum')]);
  const routeResult = resultFromSegments([makeRawSegment('cached-route')]);

  coordinator.writeCache({ layer: 'mvum', key: mvumKey, value: mvumResult, ttlMs: 5_000, now: 500 });
  coordinator.writeCache({ layer: 'route_geometry', key: sharedKey, value: routeResult, ttlMs: 5_000, now: 500 });

  const hit = coordinator.readCache('mvum', mvumKey, { now: 501 });
  assert(hit, 'Offline MVUM cache hit should return local data');
  assert.strictEqual(hit.value.segments[0].id, 'cached-mvum');
  assert.strictEqual(coordinator.readCache('mvum', 'missing', { now: 501 }), null, 'Offline cache miss is explicit');
  assert.strictEqual(
    coordinator.readCache('route_geometry', sharedKey, { now: 501 }).value.segments[0].id,
    'cached-route',
  );
  assert.strictEqual(
    coordinator.readCache('route_geometry', mvumKey, { now: 501 }),
    null,
    'MVUM cache entries cannot contaminate Route Geometry',
  );
}

function testRetryBypassesCacheAndIssuesNewRequest() {
  const coordinator = new NavigateMapLayerCoordinator();
  const key = 'retry-fingerprint';
  const cached = resultFromSegments([makeRawSegment('cached-before-retry')]);
  coordinator.writeCache({ layer: 'mvum', key, value: cached, ttlMs: 10_000, now: 600 });
  coordinator.writeCache({ layer: 'route_geometry', key, value: cached, ttlMs: 10_000, now: 600 });

  assert.strictEqual(
    typeof coordinator.invalidateCache,
    'function',
    'Retry needs a coordinator cache invalidation operation before replanning',
  );
  assert.strictEqual(coordinator.invalidateCache('mvum', key), 1, 'Retry should invalidate the exact MVUM key');
  assert.strictEqual(coordinator.readCache('mvum', key, { now: 601 }), null);
  assert(coordinator.readCache('route_geometry', key, { now: 601 }), 'MVUM retry must not invalidate Route Geometry');

  const first = scheduleLayer(coordinator, 'mvum', key, viewportA, 602);
  assert.strictEqual(coordinator.fail(first, new Error('first request failed')), true);
  const firstRequestId = first.requestId;

  coordinator.invalidateCache('mvum', key);
  const retry = scheduleLayer(coordinator, 'mvum', key, viewportA, 603);
  assert.notStrictEqual(retry.requestId, firstRequestId, 'Retry must create a new request identity');
  assert.strictEqual(coordinator.complete(retry, { itemCount: 1, sourceState: 'live' }), true);
  assert.strictEqual(coordinator.getDiagnostics().requestCount, 2, 'Retry must execute the provider path again');
}

function testBothLayersAndNoLoadingContamination() {
  const coordinator = new NavigateMapLayerCoordinator();
  const mvum = scheduleLayer(coordinator, 'mvum', 'both:mvum', viewportA, 700);
  const route = scheduleLayer(coordinator, 'route_geometry', 'both:route', viewportA, 700);
  assert.strictEqual(coordinator.activeRequestCount, 2, 'Both independently enabled layers may load together');

  assert.strictEqual(coordinator.complete(mvum, { itemCount: 0, sourceState: 'live' }), true);
  assert.strictEqual(coordinator.getState('mvum').loading, false);
  assert.strictEqual(coordinator.getState('mvum').itemCount, 0);
  assert.strictEqual(
    coordinator.getState('route_geometry').loading,
    true,
    'MVUM completion must not terminate Route Geometry loading',
  );

  assert.strictEqual(coordinator.fail(route, new Error('route failed')), true);
  assert.strictEqual(coordinator.getState('route_geometry').loading, false);
  assert.strictEqual(coordinator.getState('route_geometry').sourceState, 'unavailable');
  assert.strictEqual(coordinator.getState('mvum').sourceState, 'live');
}

function testDiagnosticSafety() {
  const rawFingerprint = {
    bbox: viewportA,
    zoom: 12,
    provider: 'route-geometry-segments',
  };
  const loading = beginSurface(createSurface('navigate_mvum_segments'), rawFingerprint, 800);
  const terminal = settleSurface(loading, 'error', {
    safeErrorCode: 'PROVIDER_UNAVAILABLE',
    retryEligible: true,
    providerStatus: 'unavailable',
    now: 825,
  }).state;
  const diagnostic = createECSAsyncSurfaceDiagnostic(terminal, 825);
  const serialized = JSON.stringify(diagnostic);
  assert.strictEqual(diagnostic.surfaceId, 'navigate_mvum_segments');
  assert.strictEqual(diagnostic.status, 'error');
  assert.strictEqual(diagnostic.safeErrorCode, 'PROVIDER_UNAVAILABLE');
  assert.strictEqual(diagnostic.elapsedMs, 25);
  Object.values(viewportA).forEach((coordinate) => {
    assert(!serialized.includes(String(coordinate)), 'Diagnostics must not expose raw viewport coordinates');
  });

  const layerDiagnostic = createNavigateAsyncLayerDiagnostic({
    state: terminal,
    enabled: true,
    eligibility: 'eligible',
    zoom: 12,
    featureCount: 1,
    invalidFeatureCount: 2,
    cacheHit: false,
    render: {
      status: 'ready',
      requestFingerprint: terminal.requestFingerprint,
      requestGeneration: terminal.generation,
      featureCount: 1,
      invalidFeatureCount: 3,
      safeErrorCode: null,
      completedAt: 824,
    },
  });
  assert.deepStrictEqual(
    {
      enabled: layerDiagnostic.enabled,
      eligibility: layerDiagnostic.eligibility,
      zoom: layerDiagnostic.zoom,
      requestStatus: layerDiagnostic.requestStatus,
      source: layerDiagnostic.source,
      featureCount: layerDiagnostic.featureCount,
      invalidFeatureCount: layerDiagnostic.invalidFeatureCount,
      cacheHit: layerDiagnostic.cacheHit,
      lastErrorSafeCode: layerDiagnostic.lastErrorSafeCode,
      lastCompletedTime: layerDiagnostic.lastCompletedTime,
      renderStatus: layerDiagnostic.renderStatus,
    },
    {
      enabled: true,
      eligibility: 'eligible',
      zoom: 12,
      requestStatus: 'error',
      source: 'unavailable',
      featureCount: 1,
      invalidFeatureCount: 3,
      cacheHit: false,
      lastErrorSafeCode: 'PROVIDER_UNAVAILABLE',
      lastCompletedTime: 825,
      renderStatus: 'ready',
    },
    'Layer diagnostics must expose the complete safe request and render contract',
  );
  Object.values(viewportA).forEach((coordinate) => {
    assert(
      !JSON.stringify(layerDiagnostic).includes(String(coordinate)),
      'Layer diagnostics must not expose raw viewport coordinates',
    );
  });

  const staleRenderDiagnostic = createNavigateAsyncLayerDiagnostic({
    state: terminal,
    enabled: true,
    eligibility: 'eligible',
    zoom: 12,
    featureCount: 1,
    invalidFeatureCount: 0,
    render: {
      status: 'ready',
      requestFingerprint: terminal.requestFingerprint,
      requestGeneration: terminal.generation - 1,
      featureCount: 99,
      invalidFeatureCount: 99,
      safeErrorCode: null,
      completedAt: 826,
    },
  });
  assert.strictEqual(
    staleRenderDiagnostic.renderStatus,
    null,
    'An older render generation must not acknowledge a newer request with the same fingerprint',
  );
  assert.strictEqual(staleRenderDiagnostic.renderedFeatureCount, null);
  assert.strictEqual(
    staleRenderDiagnostic.invalidFeatureCount,
    0,
    'Invalid counts from a stale render acknowledgement must not overwrite current diagnostics',
  );
}

function testMountedPathContract() {
  const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
  const rendererPath = path.join(root, 'components', 'navigate', 'MapRenderer.tsx');
  const coordinatorPath = path.join(root, 'lib', 'map', 'navigateMapLayerCoordinator.ts');
  const diagnosticPath = path.join(root, 'lib', 'map', 'navigateAsyncLayerDiagnostic.ts');
  const navigate = fs.readFileSync(navigatePath, 'utf8').replace(/\r\n/g, '\n');
  const renderer = fs.readFileSync(rendererPath, 'utf8').replace(/\r\n/g, '\n');
  const coordinator = fs.readFileSync(coordinatorPath, 'utf8').replace(/\r\n/g, '\n');
  const diagnosticModel = fs.readFileSync(diagnosticPath, 'utf8').replace(/\r\n/g, '\n');

  assert(
    /createRouteGeometryViewportUiState\(\s*false,\s*['"]navigate_route_geometry['"]/.test(navigate) &&
      /createRouteGeometryViewportUiState\(\s*false,\s*['"]navigate_mvum_segments['"]/.test(navigate),
    'Mounted MVUM and Route Geometry must own independent async surfaces',
  );
  assert(
    navigate.includes('mvumOverlay={navigateMvumMapOverlay}') &&
      renderer.includes('updateMvumOverlay(payload.mvumOverlay || null)'),
    'The test must continue to target the mounted Navigate -> MapRenderer MVUM path',
  );
  assert(
    /createNavigateAsyncLayerDiagnostic\(\{/.test(navigate) &&
      navigate.includes('onLayerRenderState=') &&
      renderer.includes("send('layerRenderState'"),
    'Mounted Navigate must consume MapRenderer acknowledgements and build layer diagnostics',
  );
  assert(
    navigate.includes('routeGeometryRequestGeneration={routeGeometryViewportUiState.generation}') &&
      navigate.includes('requestGeneration: mvumViewportUiState.generation') &&
      renderer.includes('requestGeneration: safeLayerRequestGeneration') &&
      diagnosticModel.includes('args.render.requestGeneration === args.state.generation'),
    'Mounted render acknowledgements must match both request fingerprint and generation',
  );
  assert(
    renderer.includes('scheduleLayerRenderVerification') &&
      renderer.includes('map.isSourceLoaded(sourceId)') &&
      renderer.includes('LAYER_RENDER_VERIFICATION_TIMEOUT_MS'),
    'Map layers must acknowledge ready or empty only after bounded source-load verification',
  );
  assert(
    renderer.includes('routeGeometryOverlayAppliedSignature') &&
      renderer.includes('mvumOverlayAppliedSignature') &&
      renderer.includes('appliedSignature === routeGeometryOverlayAppliedSignature') &&
      renderer.includes('appliedSignature === mvumOverlayAppliedSignature'),
    'Unchanged route-family patches must not restart either layer render verification',
  );
  assert(
    renderer.includes("map.on('sourcedata', verification.sourceDataListener)") &&
      renderer.includes('verification.sourceCycleObserved') &&
      renderer.includes('event.isSourceLoaded !== true') &&
      renderer.includes('verification.idleCycleObserved') &&
      renderer.includes('MAP_VECTOR_SOURCE_UNVERIFIED'),
    'Vector MVUM empty must require a request-scoped source or idle cycle',
  );
  assert(
    (navigate.match(/void readRouteGeometryViewportOfflineCache\(/g) ?? []).length >= 2 &&
      (navigate.match(/writeRouteGeometryViewportOfflineCache\(\{/g) ?? []).length >= 2,
    'Mounted MVUM and Route Geometry must independently read and write persistent viewport caches',
  );
  assert(
    navigate.includes('getRouteGeometryViewportProviderAvailability()') &&
      navigate.includes("providerStatus: 'unavailable'"),
    'Mounted layers must terminate explicitly when provider configuration is unavailable',
  );
  assert(
    new Set([MVUM_OVERLAY_SOURCE_ID, MVUM_OVERLAY_LAYER_ID, MVUM_OVERLAY_SELECTED_LAYER_ID]).size === 3,
    'MVUM Mapbox source and layer IDs must remain stable and unique',
  );

  const mvumRetryStart = navigate.indexOf('const retryMvumViewport = useCallback');
  const routeRetryStart = navigate.indexOf('const retryRouteGeometryViewport = useCallback');
  const retryEnd = navigate.indexOf('const toggleExploreRoutesOverlay', routeRetryStart);
  const mvumRetry = navigate.slice(mvumRetryStart, routeRetryStart);
  const routeRetry = navigate.slice(routeRetryStart, retryEnd);
  assert(/invalidateCache\(\s*['"]mvum['"]/.test(mvumRetry), 'Mounted MVUM Retry must bypass its cached result');
  assert(
    /invalidateCache\(\s*['"]route_geometry['"]/.test(routeRetry),
    'Mounted Route Geometry Retry must bypass its cached result',
  );

  const routeLegendStart = navigate.indexOf('const routeGeometryViewportLegendMessage = useMemo');
  const mvumLegendStart = navigate.indexOf('const mvumViewportLegendMessage = useMemo', routeLegendStart);
  const routeLegend = navigate.slice(routeLegendStart, mvumLegendStart);
  assert(
    !/segments\.length === 0\)\s*\{\s*return ['"]Loading ECS catalog routes/.test(routeLegend),
    'A terminal Route Geometry state with zero drawable features must not fall back to Loading',
  );
  assert(
    routeLegend.includes('Showing stale cached route geometry until live data completes.'),
    'A stale-cache refresh must stay explicitly labeled while loading live geometry',
  );
  assert(
    (navigate.match(/preserveData: false/g) ?? []).length >= 3 &&
      navigate.includes('preserveData: Boolean(cached?.stale)') &&
      navigate.includes('data: activeResult'),
    'Cleared mounted geometry must not remain active in async state; only explicit stale data may be preserved',
  );

  const diagnosticContract = `${navigate}\n${renderer}\n${coordinator}\n${diagnosticModel}`;
  for (const required of ['eligibility', 'invalidFeatureCount', 'cacheHit']) {
    assert(diagnosticContract.includes(required), `Development layer diagnostics must expose ${required}`);
  }
  assert(
    diagnosticContract.includes('lastCompletedAt') || diagnosticContract.includes('lastCompletedTime'),
    'Development layer diagnostics must expose the last completed time',
  );
  assert(
    navigate.includes('routeGeometryOverlayEnabled && routeGeometryViewportOverlayEnabled'),
    'The Route Geometry rollout flag must gate the mounted renderer as well as the loader',
  );
}

function main() {
  testMvumTerminalStates();
  testRouteGeometryTerminalStatesAndMalformedFeatures();
  testStaleAndRapidViewports();
  testToggleOffAndCancellation();
  testOfflineCacheAndLayerIsolation();
  testRetryBypassesCacheAndIssuesNewRequest();
  testBothLayersAndNoLoadingContamination();
  testDiagnosticSafety();
  testMountedPathContract();
  console.log('Navigate MVUM and Route Geometry async-layer regression checks passed');
}

main();

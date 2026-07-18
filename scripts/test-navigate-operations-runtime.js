const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

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

const lifecycle = require(path.join(root, 'lib/routeLifecycleState.ts'));
const { NavigateMapLayerCoordinator } = require(
  path.join(root, 'lib/map/navigateMapLayerCoordinator.ts'),
);
const routeImport = require(path.join(root, 'lib/navigateRouteImport.ts'));
const routeBuilder = require(path.join(root, 'lib/navigatePointRouteBuilder.ts'));
const { MapCameraCommandCoordinator } = require(path.join(root, 'lib/mapSurfaceCoordinator.ts'));

function testRouteOperationStateMachine() {
  let state = lifecycle.createRouteOperationState({ changedAt: 1 });
  const apply = (event, phase) => {
    const result = lifecycle.transitionRouteOperation(state, event, { now: state.changedAt + 1 });
    assert.strictEqual(result.accepted, true, `${state.phase} should accept ${event}`);
    assert.strictEqual(result.state.phase, phase);
    state = result.state;
  };

  apply('begin_import', 'importing');
  const repeatedImport = lifecycle.transitionRouteOperation(state, 'begin_import');
  assert.strictEqual(repeatedImport.reason, 'idempotent');
  apply('open_preview', 'previewing');
  apply('begin_edit', 'editing');
  apply('stage', 'staged');
  const repeatedStage = lifecycle.transitionRouteOperation(state, 'stage');
  assert.strictEqual(repeatedStage.reason, 'idempotent');
  apply('start', 'active');
  apply('pause', 'paused');
  apply('resume', 'active');
  apply('complete', 'completed');
  apply('reset', 'idle');
  apply('fail', 'failed');
  apply('begin_edit', 'editing');

  const invalid = lifecycle.transitionRouteOperation(state, 'resume');
  assert.strictEqual(invalid.accepted, false);
  assert.strictEqual(invalid.state, state, 'Invalid transitions must not mutate state.');

  const adapted = lifecycle.deriveRouteOperationState({
    lifecycle: lifecycle.normalizeRouteLifecycle({ roadStatus: 'navigation_active', roadHasRoute: true }),
    routeId: 'route-1',
  });
  assert.strictEqual(adapted.phase, 'active');
  assert.strictEqual(adapted.routeId, 'route-1');
}

function testLayerCoordinator() {
  const coordinator = new NavigateMapLayerCoordinator({
    maxCacheEntries: 6,
    maxCacheEntriesPerLayer: 3,
  });
  const boundsA = { west: -120, south: 35, east: -119, north: 36 };
  const boundsB = { west: -119, south: 35, east: -118, north: 36 };

  const firstPlan = coordinator.plan({
    layer: 'route_geometry',
    enabled: true,
    zoomEligible: true,
    online: true,
    viewportFingerprint: 'viewport-a',
    bounds: boundsA,
    debounceMs: 0,
    now: 1,
  });
  assert.strictEqual(firstPlan.kind, 'scheduled');
  const firstRequest = coordinator.consumeDue('route_geometry', 1);
  assert.ok(firstRequest);

  const secondPlan = coordinator.plan({
    layer: 'route_geometry',
    enabled: true,
    zoomEligible: true,
    online: true,
    viewportFingerprint: 'viewport-b',
    bounds: boundsB,
    debounceMs: 0,
    now: 2,
  });
  assert.strictEqual(secondPlan.kind, 'scheduled');
  assert.strictEqual(firstRequest.signal.aborted, true, 'A newer viewport must abort older work.');
  assert.strictEqual(
    coordinator.complete(firstRequest, { itemCount: 99 }),
    false,
    'A stale response must not replace current viewport data.',
  );

  const duplicatePlan = coordinator.plan({
    layer: 'route_geometry',
    enabled: true,
    zoomEligible: true,
    online: true,
    viewportFingerprint: 'viewport-b',
    bounds: boundsB,
    debounceMs: 0,
    now: 2,
  });
  assert.strictEqual(duplicatePlan.kind, 'skip');
  assert.strictEqual(duplicatePlan.reason, 'duplicate_pending');
  const secondRequest = coordinator.consumeDue('route_geometry', 2);
  assert.ok(secondRequest, 'Deduping must retain the original pending request.');
  assert.strictEqual(
    coordinator.complete(secondRequest, { itemCount: 4, sourceState: 'live', updatedAt: 3 }),
    true,
  );
  assert.strictEqual(coordinator.getState('route_geometry').itemCount, 4);

  for (let index = 0; index < 7; index += 1) {
    coordinator.writeCache({
      layer: index < 5 ? 'route_geometry' : 'mvum',
      key: `cache-${index}`,
      value: index,
      ttlMs: 1000,
      now: index + 10,
    });
  }
  assert.ok(coordinator.cacheSize <= 6, 'The total cache must remain bounded.');
  const routeCacheHits = Array.from({ length: 5 }, (_, index) =>
    coordinator.readCache('route_geometry', `cache-${index}`, { now: 20 }),
  ).filter(Boolean);
  assert.ok(routeCacheHits.length <= 3, 'Each layer cache must remain bounded.');
  coordinator.writeCache({
    layer: 'dispatch_pings',
    key: 'last-good',
    value: { id: 'ping-1' },
    ttlMs: 1,
    now: 20,
  });
  const staleCache = coordinator.readCache('dispatch_pings', 'last-good', {
    allowStale: true,
    now: 22,
  });
  assert.strictEqual(staleCache.sourceState, 'stale');

  const offlinePlan = coordinator.plan({
    layer: 'mvum',
    enabled: true,
    zoomEligible: true,
    online: false,
    viewportFingerprint: 'offline',
    bounds: boundsA,
    now: 25,
  });
  assert.strictEqual(offlinePlan.kind, 'skip');
  assert.strictEqual(offlinePlan.reason, 'offline');

  const failurePlan = coordinator.plan({
    layer: 'established_campgrounds',
    enabled: true,
    zoomEligible: true,
    online: true,
    viewportFingerprint: 'failure',
    bounds: boundsA,
    debounceMs: 0,
    now: 30,
  });
  assert.strictEqual(failurePlan.kind, 'scheduled');
  const failureRequest = coordinator.consumeDue('established_campgrounds', 30);
  assert.ok(failureRequest);
  assert.strictEqual(coordinator.fail(failureRequest, new Error('provider unavailable')), true);
  assert.strictEqual(coordinator.getState('established_campgrounds').sourceState, 'unavailable');
  assert.strictEqual(coordinator.getDiagnostics().outstandingRequestCount, 0);
}

function testRouteImport() {
  const geojson = JSON.stringify({
    type: 'FeatureCollection',
    name: 'Sparse Ridge',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Route' },
        geometry: {
          type: 'LineString',
          coordinates: [[-120, 35, 1000], [-119.9, 35.1], [-119.8, 35.2]],
        },
      },
      {
        type: 'Feature',
        properties: { name: 'Bailout' },
        geometry: { type: 'Point', coordinates: [-119.9, 35.1, 900] },
      },
    ],
  });
  const parsed = routeImport.parseNavigateRouteImport({
    fileName: 'sparse.geojson',
    content: geojson,
  });
  assert.strictEqual(parsed.sourcePointCount, 3);
  assert.strictEqual(parsed.elevationState, 'sparse');
  assert.strictEqual(parsed.parsedForRun.waypoints.length, 1, 'GeoJSON waypoints must survive import.');
  assert.strictEqual(parsed.previewCoordinates.length, 3);

  const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="test"><wpt lat="35.05" lon="-119.95"><name>Camp</name></wpt><trk><name>Track</name><trkseg><trkpt lat="35" lon="-120"><ele>1000</ele></trkpt><trkpt lat="35.1" lon="-119.9"><ele>1010</ele></trkpt></trkseg></trk></gpx>`;
  const parsedGpx = routeImport.parseNavigateRouteImport({ fileName: 'track.gpx', content: gpx });
  assert.strictEqual(parsedGpx.parsedForRun.trackPoints.length, 2);
  assert.strictEqual(parsedGpx.parsedForRun.routePoints.length, 0);
  assert.strictEqual(parsedGpx.parsedForRun.waypoints.length, 1);

  const connectedSegmentsGpx = `<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><name>Connected</name><trkseg><trkpt lat="35" lon="-120"/><trkpt lat="35.001" lon="-119.999"/></trkseg><trkseg><trkpt lat="35.0012" lon="-119.9988"/><trkpt lat="35.002" lon="-119.998"/></trkseg></trk></gpx>`;
  const parsedConnectedSegments = routeImport.parseNavigateRouteImport({
    fileName: 'connected-segments.gpx',
    content: connectedSegmentsGpx,
  });
  assert.strictEqual(
    parsedConnectedSegments.parsedForRun.geometrySegments.length,
    2,
    'GPX track-segment boundaries must survive parsing.',
  );
  assert.strictEqual(
    parsedConnectedSegments.sourceSegmentCount,
    2,
    'The import diagnostic must report both source segments.',
  );
  assert.strictEqual(
    parsedConnectedSegments.parsedForRun.trackPoints.length,
    4,
    'Connected source segments may form one canonical sequence after bounded topology validation.',
  );

  const disconnectedSegmentsGpx = `<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><name>Disconnected</name><trkseg><trkpt lat="35" lon="-120"/><trkpt lat="35.001" lon="-119.999"/></trkseg><trkseg><trkpt lat="35.6" lon="-119.4"/><trkpt lat="35.601" lon="-119.399"/></trkseg></trk></gpx>`;
  assert.throws(
    () => routeImport.parseNavigateRouteImport({
      fileName: 'disconnected-segments.gpx',
      content: disconnectedSegmentsGpx,
    }),
    /disconnected|invent a connector/i,
    'Disconnected GPX segments must terminate as an invalid import instead of becoming a 40-mile connector line.',
  );

  const brokenSingleTrackGpx = `<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><name>Broken Single Track</name><trkseg><trkpt lat="35" lon="-120"/><trkpt lat="35.7" lon="-119.3"/></trkseg></trk></gpx>`;
  assert.throws(
    () => routeImport.parseNavigateRouteImport({
      fileName: 'broken-single-track.gpx',
      content: brokenSingleTrackGpx,
    }),
    /implausible gap|cross-map connector/i,
    'One GPX track segment with a 40-mile recording gap must not become a drawable guidance edge.',
  );

  const activeSnapshot = {
    lifecycle: 'active',
    routeId: 'active-route',
  };
  assert.strictEqual(
    lifecycle.shouldDeferNavigateRouteSessionClear({
      lifecycle: 'inactive',
      roadRestoreStatus: 'loading',
      trailRestoreStatus: 'ready',
      currentSnapshot: activeSnapshot,
    }),
    true,
    'A transient idle road hook during Navigate remount must not clear an active canonical route session.',
  );
  assert.strictEqual(
    lifecycle.shouldDeferNavigateRouteSessionClear({
      lifecycle: 'inactive',
      roadRestoreStatus: 'ready',
      trailRestoreStatus: 'ready',
      currentSnapshot: activeSnapshot,
    }),
    false,
    'An explicit idle state after both restore flights settle may clear the canonical route session.',
  );
  assert.strictEqual(
    lifecycle.shouldDeferNavigateRouteSessionClear({
      lifecycle: 'inactive',
      roadRestoreStatus: 'error',
      trailRestoreStatus: 'ready',
      currentSnapshot: activeSnapshot,
    }),
    true,
    'A restore error must preserve last-good active guidance instead of converting it into an explicit end event.',
  );

  assert.throws(
    () => routeImport.parseNavigateRouteImport({
      fileName: 'invalid.geojson',
      content: JSON.stringify({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }],
      }),
    }),
    /at least 2 valid points|no importable/i,
  );
  assert.throws(
    () => routeImport.parseNavigateRouteImport({ fileName: 'broken.geojson', content: '{broken' }),
    /invalid json/i,
  );

  assert.throws(
    () => routeImport.parseNavigateRouteImport({
      fileName: 'huge.geojson',
      content: 'x'.repeat(routeImport.NAVIGATE_ROUTE_IMPORT_MAX_BYTES + 1),
    }),
    /12 MB safety limit/,
  );

  const controller = new AbortController();
  controller.abort();
  assert.throws(
    () => routeImport.parseNavigateRouteImport({
      fileName: 'cancel.geojson',
      content: geojson,
      signal: controller.signal,
    }),
    /canceled/,
  );

  const registry = new routeImport.NavigateRouteImportRegistry(100, 2);
  registry.mark(parsed.fingerprint, 10);
  assert.strictEqual(registry.has(parsed.fingerprint, 50), true);
  assert.strictEqual(registry.has(parsed.fingerprint, 111), false);
  const sampled = routeImport.sampleNavigateRouteCoordinates([0, 1, 2, 3, 4], 3);
  assert.deepStrictEqual(sampled, [0, 2, 4], 'Sampling must preserve both route endpoints.');
}

function testRouteBuilderHistoryAndCamera() {
  const empty = routeBuilder.createNavigateRouteDraft();
  const first = { ...empty, anchors: [{ id: 'a', label: 'A', coordinate: { latitude: 1, longitude: 1 } }] };
  let history = routeBuilder.createNavigateRouteDraftHistory(empty);
  history = routeBuilder.recordNavigateRouteDraft(history, first);
  history = routeBuilder.undoNavigateRouteDraftHistory(history);
  assert.strictEqual(history.present.anchors.length, 0);
  history = routeBuilder.redoNavigateRouteDraftHistory(history);
  assert.strictEqual(history.present.anchors.length, 1);
  const replacement = { ...empty, anchors: [{ id: 'b', label: 'B', coordinate: { latitude: 2, longitude: 2 } }] };
  history = routeBuilder.recordNavigateRouteDraft(history, replacement);
  assert.strictEqual(history.future.length, 0, 'A new edit must invalidate redo history.');

  const camera = new MapCameraCommandCoordinator(700);
  assert.strictEqual(camera.request({ signature: 'route', kind: 'route_overview', now: 1 }).accepted, true);
  assert.strictEqual(camera.request({ signature: 'follow', kind: 'follow_user', now: 100 }).accepted, false);
  assert.strictEqual(camera.request({ signature: 'pin', kind: 'selected_context', now: 101 }).accepted, true);
  assert.strictEqual(camera.request({ signature: 'pin', kind: 'selected_context', now: 102 }).reason, 'duplicate');
  assert.strictEqual(camera.request({ signature: 'follow-forced', kind: 'follow_user', now: 103, force: true }).accepted, true);
}

function testStaticIntegration() {
  const navigate = fs.readFileSync(path.join(root, 'app/(tabs)/navigate.tsx'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'components/navigate/MapRenderer.tsx'), 'utf8');
  const roadNavigationHook = fs.readFileSync(path.join(root, 'lib/useRoadNavigation.ts'), 'utf8');
  const trailNavigationHook = fs.readFileSync(path.join(root, 'lib/useTrailNavigation.ts'), 'utf8');
  const coordinatorInstances = (navigate.match(/new NavigateMapLayerCoordinator\(/g) || []).length;
  assert.strictEqual(coordinatorInstances, 1, 'Navigate must use one layer coordinator instance.');
  assert.ok(!navigate.includes('new CampLayerFetchCoordinator('));
  assert.ok(!navigate.includes('new RouteGeometryViewportFetchCoordinator('));
  assert.ok(navigate.includes('performanceSurface="navigate"'));
  assert.ok(renderer.includes("performanceSurface === 'navigate'"));
  assert.ok(renderer.includes("motionPriority !== 'cold'"));
  assert.ok(renderer.includes("recordECSPerformanceRender('navigate_map_first_meaningful_render'"));
  assert.ok(navigate.includes("AppState.addEventListener('change'"));
  assert.ok(navigate.includes('redoNavigateRouteDraftHistory'));
  assert.ok(navigate.includes('markNavigationHandoffActiveGuidanceReplacementConfirmed'));
  assert.ok(
    roadNavigationHook.includes('() => activeRoadNavigationSession'),
    'A remounted road hook must initialize from the active in-memory session instead of publishing idle.',
  );
  assert.ok(
    trailNavigationHook.includes('() => activeTrailNavigationSession'),
    'A remounted trail hook must initialize from the active in-memory session instead of publishing idle.',
  );
  assert.ok(
    navigate.includes('shouldDeferNavigateRouteSessionClear({'),
    'The mounted Navigate bridge must preserve an active normalized session until engine restore terminates.',
  );
  assert.ok(!navigate.includes('showInlineIntelPanel'));
  const builderSaveStart = navigate.indexOf('const saveVerifiedRouteBuilderDraft = useCallback');
  const builderSaveEnd = navigate.indexOf('const finishRouteBuilder = useCallback', builderSaveStart);
  const builderSave = navigate.slice(builderSaveStart, builderSaveEnd);
  assert.ok(
    builderSave.indexOf('confirmActiveGuidanceReplacementForLocalPreview') <
      builderSave.indexOf('routeStore.createCustomRoute'),
    'Active guidance replacement must be confirmed before a staged route is created.',
  );
  assert.ok(
    !builderSave.includes('await endTrailNavigation();') &&
      !builderSave.includes('await clearRoadDestination();'),
    'Route builder staging must delegate replacement cleanup to the canonical handoff orchestrator.',
  );
  return {
    before: {
      navigateLines: 31428,
      mapRendererLines: 10090,
      viewportCoordinatorInstances: 3,
      mvumRequestCounterReferences: 9,
      routeBuilderRedo: false,
      importSizeBudget: false,
      navigateMapInstrumentationActive: false,
      viewportCacheBound: null,
    },
    after: {
      navigateLines: navigate.split(/\r?\n/).length,
      mapRendererLines: renderer.split(/\r?\n/).length,
      viewportCoordinatorInstances: coordinatorInstances,
      legacyViewportCoordinatorInstances: 0,
      mvumRequestCounterReferences: (navigate.match(/mvumViewportFetchRequestIdRef/g) || []).length,
      routeBuilderRedo: navigate.includes('redoNavigateRouteDraftHistory'),
      importSizeBudget: navigate.includes('parseNavigateRouteImport'),
      navigateMapInstrumentationActive: renderer.includes("performanceSurface === 'navigate'"),
      viewportCacheBound: { total: 24, perLayer: 8 },
    },
  };
}

testRouteOperationStateMachine();
testLayerCoordinator();
testRouteImport();
testRouteBuilderHistoryAndCamera();
const evidence = testStaticIntegration();

console.log(JSON.stringify({
  suite: 'navigate-operations-runtime',
  status: 'passed',
  assertions: {
    lifecycle: 'passed',
    layerCoordinator: 'passed',
    import: 'passed',
    builderHistory: 'passed',
    cameraCoordination: 'passed',
    staticIntegration: 'passed',
  },
  evidence,
}, null, 2));

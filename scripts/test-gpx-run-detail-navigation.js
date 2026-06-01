const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const navigateRunSource = fs.readFileSync(path.join(root, 'app', 'navigate-run.tsx'), 'utf8');
const navigateSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
const mapRendererSource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'MapRenderer.tsx'),
  'utf8',
);
const gpsSource = fs.readFileSync(path.join(root, 'lib', 'useGPSLocation.ts'), 'utf8');
const throttledGpsSource = fs.readFileSync(path.join(root, 'lib', 'useThrottledGPS.ts'), 'utf8');
const trailNavigationSource = fs.readFileSync(path.join(root, 'lib', 'useTrailNavigation.ts'), 'utf8');

function assertIncludes(source, fragment, message) {
  assert.ok(source.replace(/\r\n/g, '\n').includes(fragment.replace(/\r\n/g, '\n')), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.replace(/\r\n/g, '\n').includes(fragment.replace(/\r\n/g, '\n')), message);
}

function blockBetween(source, startFragment, endFragment) {
  const normalizedSource = source.replace(/\r\n/g, '\n');
  const normalizedStart = startFragment.replace(/\r\n/g, '\n');
  const normalizedEnd = endFragment.replace(/\r\n/g, '\n');
  const start = normalizedSource.indexOf(normalizedStart);
  assert.notStrictEqual(start, -1, `Expected source to include ${startFragment}`);
  const end = normalizedSource.indexOf(normalizedEnd, start);
  assert.notStrictEqual(end, -1, `Expected source to include ${endFragment}`);
  return normalizedSource.slice(start, end);
}

function styleBlock(source, styleName) {
  const normalizedSource = source.replace(/\r\n/g, '\n');
  const start = normalizedSource.indexOf(`${styleName}: {`);
  assert.notStrictEqual(start, -1, `Expected style block ${styleName} to exist.`);
  const end = normalizedSource.indexOf('\n},', start);
  assert.notStrictEqual(end, -1, `Expected style block ${styleName} to close.`);
  return normalizedSource.slice(start, end);
}

function cssBlock(source, selector) {
  const normalizedSource = source.replace(/\r\n/g, '\n');
  const start = normalizedSource.indexOf(selector);
  assert.notStrictEqual(start, -1, `Expected CSS selector ${selector} to exist.`);
  const end = normalizedSource.indexOf('}', start);
  assert.notStrictEqual(end, -1, `Expected CSS selector ${selector} to close.`);
  return normalizedSource.slice(start, end);
}

function setupRuntimeMocks() {
  const storage = new Map();
  global.localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    },
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'react-native') {
      return { Platform: { OS: 'web' } };
    }
    if (request === 'expo-file-system/legacy') {
      return {
        documentDirectory: 'file:///test-documents/',
        getInfoAsync: async () => ({ exists: false, isDirectory: false, size: 0 }),
        makeDirectoryAsync: async () => {},
        readAsStringAsync: async () => '',
        writeAsStringAsync: async () => {},
      };
    }
    if (request === 'expo-file-system') {
      return {
        Paths: { document: { uri: 'file:///test-documents/' } },
        File: class MockFile {
          constructor(uri) {
            this.uri = uri;
            this.exists = false;
            this.size = 0;
          }
          text() {
            return '';
          }
          write() {}
        },
        Directory: class MockDirectory {
          constructor(uri) {
            this.uri = uri;
            this.exists = false;
            this.size = 0;
          }
          create() {}
          list() {
            return [];
          }
        },
      };
    }
    return originalLoad(request, parent, isMain);
  };
}

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

function makeRun(overrides = {}) {
  return {
    id: overrides.id ?? 'gpx-run-alpha',
    user_id: null,
    title: overrides.title ?? 'Dropped GPX Route',
    source: 'gpx',
    created_at: '2026-04-25T08:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-04-25T08:15:00.000Z',
    vehicle_id: 'veh-1',
    build_snapshot: {
      vehicle_name: 'Test Rig',
      vehicle_id: 'veh-1',
      estimated_range_miles: 280,
      total_weight_lb: 5200,
      roof_weight_lb: 90,
      hitch_weight_lb: 0,
      limits: {
        roof_limit_lb: 180,
        hitch_limit_lb: 500,
      },
      captured_at: '2026-04-25T08:00:00.000Z',
    },
    stats: {
      distance_m: 3218,
      distance_miles: 2,
      distance_km: 3.218,
      point_count: 3,
      start_lat: 38.78,
      start_lng: -121.2,
      end_lat: 38.8,
      end_lng: -121.23,
      elevation_gain_ft: 120,
      elevation_loss_ft: 80,
      min_ele_ft: 300,
      max_ele_ft: 420,
    },
    points: [
      { idx: 0, lat: 38.78, lng: -121.2, ele_m: 92, time: '2026-04-25T08:00:00.000Z', type: 'route' },
      { idx: 1, lat: 38.79, lng: -121.215, ele_m: 104, time: '2026-04-25T08:05:00.000Z', type: 'route' },
      { idx: 2, lat: 38.8, lng: -121.23, ele_m: 128, time: '2026-04-25T08:10:00.000Z', type: 'route' },
    ],
    waypoints: [
      {
        id: 'wp-1',
        name: 'Trailhead',
        lat: 38.78,
        lon: -121.2,
        lng: -121.2,
        ele: 92,
        time: '2026-04-25T08:00:00.000Z',
        type: 'start',
      },
    ],
    is_active: false,
    ...overrides,
  };
}

const segmentRisk = {
  route_id: 'gpx-run-alpha',
  overall_risk: 'moderate',
  segments: [
    {
      seg_index: 0,
      risk_score: 38,
      remoteness_score: 21,
      reasons: ['Limited bailouts', 'Moderate grade'],
    },
  ],
  max_risk_segment: {
    seg_index: 0,
    risk_score: 38,
    remoteness_score: 21,
    reasons: ['Limited bailouts', 'Moderate grade'],
  },
};

async function runOfflineCacheTests() {
  setupRuntimeMocks();
  const {
    cacheOfflineRoute,
    getOfflineCachedRouteBySourceRouteId,
    listOfflineCachedRoutes,
    offlineCachedRouteToRun,
    offlineCachedRouteToRunCacheManifest,
  } = require(path.join(root, 'lib', 'offlineRouteCacheService.ts'));

  const firstRun = makeRun();
  const cached = await cacheOfflineRoute({
    run: firstRun,
    segmentRiskAnalysis: segmentRisk,
    tileCacheStatus: 'unavailable',
  });

  assert.strictEqual(cached.routeGeometry.length, 3, 'GPX route cache must save route geometry.');
  assert.deepStrictEqual(
    cached.routeGeometry.map((point) => [point.latitude, point.longitude]),
    firstRun.points.map((point) => [point.lat, point.lng]),
    'Cached route geometry must preserve GPX coordinates.',
  );
  assert.strictEqual(cached.originalGpxMetadata.title, 'Dropped GPX Route', 'GPX route cache must save route metadata.');
  assert.strictEqual(cached.originalGpxMetadata.pointCount, 3, 'GPX metadata must include point count.');
  assert.deepStrictEqual(cached.segmentRiskAnalysis, segmentRisk, 'Segment risk data must be saved when available.');
  assert.strictEqual(cached.tileCacheAvailable, false, 'Route-only cache must not claim map tiles are cached.');

  const updatedRun = makeRun({
    title: 'Dropped GPX Route Updated',
    updated_at: '2026-04-25T09:00:00.000Z',
  });
  const recached = await cacheOfflineRoute({
    run: updatedRun,
    segmentRiskAnalysis: segmentRisk,
    tileCacheStatus: 'complete',
    offlineTileRegionId: 'tile-region-gpx-run-alpha',
  });

  const allRoutes = await listOfflineCachedRoutes();
  assert.strictEqual(allRoutes.length, 1, 'Re-caching the same GPX route must update existing cache instead of duplicating.');
  assert.strictEqual(recached.id, cached.id, 'Re-caching must keep the stable offline route id.');
  assert.strictEqual(recached.name, 'Dropped GPX Route Updated', 'Re-caching must refresh cached route metadata.');
  assert.strictEqual(recached.offlineTileRegionId, 'tile-region-gpx-run-alpha', 'Re-caching should update tile cache metadata.');

  const resolved = await getOfflineCachedRouteBySourceRouteId(firstRun.id);
  assert.ok(resolved, 'Cached route must resolve by GPX/map route id while offline.');
  const hydratedRun = offlineCachedRouteToRun(resolved);
  assert.strictEqual(hydratedRun.title, 'Dropped GPX Route Updated', 'Cached route must hydrate Run Detail route name.');
  assert.strictEqual(hydratedRun.points.length, 3, 'Cached Run Detail must hydrate route geometry.');
  assert.deepStrictEqual(
    hydratedRun.offline_cache.segment_risk,
    segmentRisk,
    'Cached Run Detail must hydrate segment risk analysis.',
  );
  assert.strictEqual(hydratedRun.offline_cache.cache_status, 'cached', 'Cached Run Detail must expose cached status.');
  assert.strictEqual(
    hydratedRun.offline_cache.tile_region_id,
    'tile-region-gpx-run-alpha',
    'Cached Run Detail must preserve offline tile region when available.',
  );

  const manifest = offlineCachedRouteToRunCacheManifest(resolved, updatedRun);
  assert.strictEqual(manifest.route_geometry.length, 3, 'Central cache service should build run-store route manifests.');
  assert.deepStrictEqual(
    manifest.segment_risk,
    segmentRisk,
    'Central cache service should preserve segment risk in the run-store manifest.',
  );
  assert.strictEqual(
    manifest.tile_region_id,
    'tile-region-gpx-run-alpha',
    'Central cache service should preserve tile-region ids in the run-store manifest.',
  );
}

// Offline Run Detail loading.
assertIncludes(
  navigateRunSource,
  'Promise.all([getOfflineCachedRoute(runId), getOfflineCachedRouteBySourceRouteId(runId)])',
  'Run Detail should fall back to cached offline routes by GPX route id.',
);
assertIncludes(
  navigateRunSource,
  'offlineCachedRouteToRun(resolvedRoute)',
  'Run Detail should hydrate from cached offline route data.',
);
assertIncludes(
  navigateRunSource,
  'offlineCachedRouteToRunCacheManifest(cachedRoute, run)',
  'Run Detail should redirect run-store offline manifest creation to the centralized cache service.',
);
assertIncludes(
  navigateRunSource,
  'Loaded from offline route cache.',
  'Run Detail should show that cached data was used while offline.',
);
assertIncludes(
  navigateRunSource,
  'Offline cache unavailable for this route.',
  'Run Detail should show a clear unavailable state when no cached data exists.',
);
assertIncludes(
  navigateRunSource,
  'Route cached; map tiles unavailable offline.',
  'Run Detail cache messaging should distinguish route-only cache from tile cache.',
);
assertIncludes(
  navigateRunSource,
  'Route and map area cached.',
  'Run Detail cache messaging should distinguish full map-area cache.',
);

// Segment Risk full-screen modal.
assertIncludes(
  navigateRunSource,
  'accessibilityLabel="Open segment risk analysis"',
  'Clicking Segment Risk Analysis should expose the risk modal trigger.',
);
assertIncludes(
  navigateRunSource,
  'setSegDetailVisible(true);',
  'Opening Segment Risk Analysis should toggle full-screen modal state.',
);
const segmentRiskModal = blockBetween(navigateRunSource, '<Modal', '</Modal>');
assertIncludes(segmentRiskModal, 'visible={segDetailVisible}', 'Segment Risk modal should be controlled by segment detail state.');
assertIncludes(segmentRiskModal, 'presentationStyle="fullScreen"', 'Segment Risk Analysis must open full-screen.');
assertIncludes(segmentRiskModal, 'transparent={false}', 'Segment Risk modal should not be a clipped transparent child overlay.');
assertIncludes(segmentRiskModal, 'style={styles.segFullScreen}', 'Segment Risk modal should render in its own full-screen container.');
assertIncludes(segmentRiskModal, 'accessibilityLabel="Close segment risk analysis"', 'Segment Risk modal must include an X close button.');
assertIncludes(segmentRiskModal, 'onPress={() => setSegDetailVisible(false)}', 'Segment Risk close button should return to Run Detail.');
assertIncludes(segmentRiskModal, '<ScrollView', 'Segment Risk modal content must be scrollable.');
assertIncludes(segmentRiskModal, 'style={styles.segFullScreenScroll}', 'Segment Risk modal should use a scrollable content area.');
assertIncludes(segmentRiskModal, 'riskProfile.segments.map((segment) =>', 'Segment Risk modal should render all segment rows/cards.');
assertNotIncludes(segmentRiskModal, 'styles.scrollContent', 'Segment Risk modal should not render inside the Run Detail scroll container.');

// Route Staged indicator layout.
assertIncludes(
  navigateSource,
  'const routeIndicatorAnchoredToTopToolbox = topToolboxStackHeight > 0;',
  'Route Staged indicator should detect active top menu/toolbox height.',
);
assertIncludes(
  navigateSource,
  '? MAP_TOP_CONTROL_ROW + topToolboxStackHeight + OVERLAY_GAP',
  'Route Staged indicator should render below active GPX/toolbox controls.',
);
assertIncludes(
  navigateSource,
  ': TOP_STATUS_STACK_START',
  'Route Staged indicator should fall below the GPX top menu row by default.',
);
assertIncludes(
  navigateSource,
  'const campsiteAreaTopHeight = 0;',
  'Route Staged indicator should keep bottom campsite draw controls out of top toolbox height.',
);
assertNotIncludes(
  navigateSource,
  "handleTopToolboxLayout('campsiteArea', event.nativeEvent.layout.height)",
  'Bottom campsite draw controls should not anchor route staged indicator to top toolbox measurements.',
);
assertIncludes(
  navigateSource,
  "handleTopToolboxLayout('routeBuilder', event.nativeEvent.layout.height)",
  'Route Staged indicator should account for route design toolbox height.',
);
assertIncludes(
  navigateSource,
  'const expandedTopOffset = insets.top + 10;',
  'Route Staged top positioning should respect safe area/top offset inputs.',
);
const routeIndicatorRender = blockBetween(navigateSource, '{routeIndicatorVisible && mapRouteIndicator ? (', ') : null}');
assertIncludes(routeIndicatorRender, 'top: routeIndicatorTopOffset', 'Route Staged badge must use computed stacked top offset.');
assertNotIncludes(
  routeIndicatorRender,
  'MAP_TOP_CONTROL_ROW',
  'Route Staged badge render should not hardcode the top menu position inline.',
);
assert.ok(
  navigateRunSource.indexOf('<Modal') > navigateRunSource.indexOf('<ScrollView'),
  'Full-screen Segment Risk modal should render after Run Detail content so map overlays remain underneath it.',
);

// Navigate Route behavior.
const navigateRouteHandler = blockBetween(
  navigateRunSource,
  'const handleNavigateRun = useCallback(async () => {',
  'const openSegmentRiskAnalysis = useCallback',
);
assertIncludes(
  navigateRouteHandler,
  'await requestImmediateGpsPosition()',
  'Navigate Route should request an immediate GPS fix when the current fix is stale.',
);
assertIncludes(
  navigateRunSource,
  'const [runDetailGpsPosition, setRunDetailGpsPosition] = useState<GPSPosition | null>(null);',
  'Run Detail should use one-shot GPS state instead of mounting a duplicate continuous watcher.',
);
assertNotIncludes(
  navigateRunSource,
  'useGPSLocation({',
  'Run Detail should not start a second continuous GPS watcher.',
);
assertIncludes(
  navigateRouteHandler,
  "showToast('WAITING FOR GPS FIX TO START NAVIGATION')",
  'Navigate Route should show waiting-for-GPS state when no fix is available.',
);
assertIncludes(navigateRouteHandler, 'runStore.upsert(run);', 'Navigate Route should persist/upsert the GPX route for navigation.');
assertIncludes(navigateRouteHandler, 'runStore.setActive(storedRun.id);', 'Navigate Route should make the GPX route active.');
assertIncludes(
  navigateRouteHandler,
  "lifecycle: 'active'",
  'Navigate Route should start active navigation instead of only staging the route.',
);
assertIncludes(
  navigateRouteHandler,
  'routePoints,',
  'Navigate Route should set the active route from GPX geometry.',
);
assertIncludes(
  navigateRouteHandler,
  'currentLocation: {',
  'Navigate Route should start from the user GPS coordinate.',
);
assertIncludes(
  navigateRouteHandler,
  'router.back();',
  'Navigate Route should return to the map after starting navigation.',
);

// GPX and cached GPX routes must use stored geometry, not online routing.
const payloadBuilder = blockBetween(
  navigateSource,
  'function buildNavigationPayloadFromRun(',
  'function buildStitchedRunImport',
);
assertIncludes(payloadBuilder, "? 'cached_gpx'", 'Cached GPX routes should be source-aware.');
assertIncludes(payloadBuilder, "? 'gpx'", 'Imported GPX routes should be source-aware.');
assertIncludes(payloadBuilder, 'const usesStoredRouteGeometry = routeSource ===', 'GPX routes should be marked as stored geometry.');
assertIncludes(
  payloadBuilder,
  'requiresOnlineRouting: usesStoredRouteGeometry ? false : isCustomRoute',
  'GPX route navigation payloads must not require online routing.',
);
assertIncludes(payloadBuilder, 'trailGeometry,', 'Navigation payload should carry stored GPX geometry.');
assertIncludes(payloadBuilder, "geometrySource: usesStoredRouteGeometry ? 'stored_gpx_geometry'", 'GPX payload metadata should identify stored geometry.');

const applyPayload = blockBetween(
  navigateSource,
  'const applyExploreNavigationPayload = useCallback(',
  '  useEffect(() => {\n    const snapshot = navigateRouteSessionStore.getSnapshot();',
);
assertIncludes(applyPayload, 'stampedPayload.requiresOnlineRouting === false', 'Offline GPX navigation should branch on stored geometry.');
assertIncludes(applyPayload, 'await clearRoadDestination();', 'Stored GPX navigation should avoid road-route preview state.');
assertIncludes(applyPayload, 'usesStoredRouteGeometry || !roadDestination || tripMode ===', 'Stored GPX navigation should skip online road routing.');
assertIncludes(applyPayload, 'fitMapToCoordinatePreview', 'Stored GPX navigation should display the route line from local geometry.');
const trailPreviewEffect = blockBetween(
  navigateSource,
  'const trailOnlyPreviewActive =',
  '  useEffect(() => {\n    if (!exploreNavigationPayload || explorePreviewMode !== \'hybrid\') return;',
);
assertIncludes(
  trailPreviewEffect,
  'void loadTrailPayload(',
  'Stored GPX geometry should load directly into trail navigation.',
);
assertIncludes(
  navigateSource,
  'coordinates: exploreNavigationPayload.trailGeometry.map((point) => [',
  'Route line should be displayed from cached/imported GPX geometry.',
);

assertNotIncludes(
  trailNavigationSource,
  'fetch(',
  'Cached GPX navigation must not call an online routing API in trail navigation.',
);
assertNotIncludes(
  trailNavigationSource,
  'previewDestination',
  'Cached GPX trail navigation should not request an online road preview.',
);
assertIncludes(
  trailNavigationSource,
  'geometry: prev.payload.trailGeometry',
  'Cached GPX navigation should track progress against stored GPX geometry.',
);
assertIncludes(
  navigateSource,
  'pendingAutoStartRouteIdRef.current = payload.id;',
  'Run Detail Navigate Route should auto-start the active GPX route when Navigate opens.',
);
assertIncludes(
  navigateSource,
  'void startTrailNavigation();',
  'Run Detail Navigate Route should begin active trail navigation, not only stage preview.',
);

// GPS watcher and user-dot rendering.
assertIncludes(
  gpsSource,
  'Location.requestForegroundPermissionsAsync()',
  'GPS permission flow should request foreground permission.',
);
assertIncludes(
  gpsSource,
  'Location.watchPositionAsync',
  'GPS permission granted should start a location watcher.',
);
assertIncludes(
  gpsSource,
  'setPositionIfChanged(nextPosition)',
  'GPS watcher should update location state.',
);
assertIncludes(
  throttledGpsSource,
  'gpsUIState.feedRaw(rawGPS);',
  'Raw GPS updates should feed the shared GPS UI state.',
);
assertIncludes(
  navigateSource,
  'const latestGpsMapLocation = useMemo(() => {',
  'Navigate should derive a map-safe latest GPS location.',
);
assertIncludes(
  navigateSource,
  'const freshestLocation = latestGpsMapLocation ?? userLocation;',
  'User dot should prefer live GPS but preserve an existing map location when appropriate.',
);
assertIncludes(
  navigateSource,
  'showUserLocation={!!safeUserLocation}',
  'MapRenderer should receive user-dot visibility when location is available.',
);
assertIncludes(
  navigateSource,
  'userLocation={safeUserLocation}',
  'MapRenderer should receive user location during passive and active navigation.',
);
assertIncludes(
  mapRendererSource,
  'showUserLocation: !!props.showUserLocation && isValidCoord(userLat, userLng)',
  'MapRenderer should only show user dot for valid coordinates.',
);
assertIncludes(
  mapRendererSource,
  "userMarker = mkMarker('marker-user', loc.longitude, loc.latitude",
  'MapRenderer should create the user marker from current GPS coordinates.',
);
assertIncludes(
  mapRendererSource,
  'userMarker.setLngLat([loc.longitude, loc.latitude]);',
  'Mapbox must receive user location in [longitude, latitude] order.',
);
assertIncludes(
  mapRendererSource,
  'setUserLocation(payload.userLocation || null, !!payload.showUserLocation',
  'Dynamic map payload should keep user dot visible during active navigation updates.',
);
assertIncludes(cssBlock(mapRendererSource, '.marker-user {'), 'z-index: 1000', 'User dot should render above map layers.');

runOfflineCacheTests()
  .then(() => {
    console.log('GPX Run Detail navigation regression checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

/* global __dirname */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const moduleCache = new Map();

function loadTsModule(relPath) {
  const filename = path.join(__dirname, '..', relPath);
  if (moduleCache.has(filename)) return moduleCache.get(filename).exports;

  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(filename, module);

  function localRequire(request) {
    if (request.startsWith('.')) {
      const resolved = path.join(path.dirname(filename), `${request}.ts`);
      const rel = path.relative(path.join(__dirname, '..'), resolved);
      return loadTsModule(rel);
    }
    return require(request);
  }

  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(module.exports, localRequire, module, filename, path.dirname(filename));
  return module.exports;
}

const { deriveOfflineReadiness } = loadTsModule('lib/offlineReadinessPresentation.ts');
const { buildRouteGuidanceReadinessViewModel } = loadTsModule('lib/routeGuidanceReadinessPresentation.ts');

const cacheSnapshotReady = {
  offline_cache_ready: true,
  cached_region_available: true,
  cached_route_available: true,
  cached_region_count: 1,
  cached_tile_count: 1200,
  cached_size_mb: 84,
  evaluated_at: new Date().toISOString(),
  expedition_data_cached: true,
  expedition_data_covers_position: true,
  expedition_data_covers_route: true,
  expedition_data_regions: 1,
  expedition_data_entries: 12,
};

const expeditionReady = {
  has_offline_data: true,
  downloaded_regions: 1,
  total_entries: 24,
  storage_mb: 12,
  covers_current_position: true,
  covers_active_route: true,
  available_categories: ['campsites', 'fuel_stations', 'water_sources', 'recovery_points', 'hazard_zones'],
  evaluated_at: new Date().toISOString(),
  all_regions_valid: true,
  stale_regions: 0,
};

const offlineRouteReady = {
  routeGeometry: [
    { latitude: 38.1, longitude: -109.2 },
    { latitude: 38.2, longitude: -109.3 },
  ],
  cacheStatus: 'cached',
  tileCacheAvailable: true,
  tileCacheStatus: 'complete',
  cacheGroups: ['ecs-remote-v1'],
  remoteCache: {
    cacheGroupId: 'ecs-remote-v1',
    enabled: true,
    lastUpdated: new Date().toISOString(),
    estimatedBytes: 120000,
    tileCoverage: {
      routeBounds: { minLat: 38.1, maxLat: 38.2, minLng: -109.3, maxLng: -109.2 },
      routePointCount: 2,
      segmentCount: 1,
      estimatedTileCount: 1,
    },
    connectivitySummary: {
      avgRemoteScore: 42,
      maxRemoteScore: 42,
      expectedSignalState: 'weak',
      summary: 'Cached remoteness forecast indicates weak signal likely.',
    },
  },
  turnCues: [{ id: 'cue-1', instruction: 'Continue', distanceMiles: 1 }],
  segmentRiskAnalysis: { level: 'moderate' },
};

const ready = deriveOfflineReadiness({
  cacheSnapshot: cacheSnapshotReady,
  offlineRoute: offlineRouteReady,
  expeditionReadiness: expeditionReady,
  weatherSnapshot: {
    source: 'cache_fresh',
    cachedAt: Date.now() - 10 * 60 * 1000,
    hasWeatherData: true,
  },
  closureAccessSnapshot: { available: true, freshness: 'fresh' },
});

assert(ready.level === 'ready', 'All required assets cached should resolve to Ready.');
assert(ready.reason === 'Route, map, guidance, and key intel are cached.', 'Ready copy should match user-facing copy.');
assert(ready.readyAssets.includes('route geometry'), 'Ready assets should include route geometry.');
assert(ready.readyAssets.includes('base map / routable map'), 'Ready assets should include base map/routable map.');
assert(ready.readyAssets.includes('guidance instructions'), 'Ready assets should include guidance instructions.');
assert(
  ready.readyAssets.includes('remoteness / connectivity forecast'),
  'Ready assets should include remoteness/connectivity forecast.',
);

const partial = deriveOfflineReadiness({
  cacheSnapshot: cacheSnapshotReady,
  offlineRoute: {
    ...offlineRouteReady,
    segmentRiskAnalysis: null,
  },
  expeditionReadiness: {
    ...expeditionReady,
    available_categories: ['campsites'],
  },
  closureAccessSnapshot: { available: true, freshness: 'fresh' },
});

assert(partial.level === 'partial', 'Route cached but alternates/hazards missing should resolve to Partial.');
assert(partial.missingAssets.includes('hazards / warnings'), 'Partial readiness should list missing hazards/warnings.');
assert(partial.missingAssets.includes('alternate exits / bailout route data'), 'Partial readiness should list missing bailout data.');
assert(partial.recommendedAction === 'prepare_offline', 'Partial readiness should point at the existing Prepare Offline flow.');

const notReady = deriveOfflineReadiness({
  cacheSnapshot: {
    ...cacheSnapshotReady,
    offline_cache_ready: false,
    cached_region_available: false,
    cached_route_available: false,
    cached_tile_count: 0,
  },
  offlineRoute: {
    ...offlineRouteReady,
    routeGeometry: [],
    tileCacheAvailable: false,
    tileCacheStatus: 'not_requested',
    turnCues: [],
  },
});

assert(notReady.level === 'not_ready', 'Missing required route/map/guidance should resolve to Not Ready.');
assert(notReady.recommendedAction === 'prepare_offline', 'Not Ready should recommend the existing offline prep action.');

const unknown = deriveOfflineReadiness();

assert(unknown.level === 'unknown', 'No cache status should resolve to Unknown.');
assert(unknown.reason === 'Offline status unavailable.', 'Unknown should use concise unavailable copy.');

const stale = deriveOfflineReadiness({
  cacheSnapshot: cacheSnapshotReady,
  offlineRoute: offlineRouteReady,
  expeditionReadiness: {
    ...expeditionReady,
    stale_regions: 1,
  },
  weatherSnapshot: {
    source: 'cache',
    cachedAt: Date.now() - 5 * 60 * 60 * 1000,
    hasWeatherData: true,
  },
  closureAccessSnapshot: { available: true, stale: true },
});

assert(stale.level === 'partial', 'Stale weather/closure snapshots should reduce readiness to Partial.');
assert(stale.staleAssets.includes('weather snapshot'), 'Stale weather should be listed when timestamps show stale weather.');
assert(stale.staleAssets.includes('closure/access snapshot'), 'Explicit stale closure/access snapshot should be listed.');
assert(stale.staleAssets.includes('offline expedition datasets'), 'Stale expedition datasets should be listed.');

const currentRouteContext = {
  routeId: 'road-preview-1',
  destination: { lat: 38.2, lng: -109.3, label: 'M1 Ridge Road' },
  geometry: [
    { lat: 38.1, lng: -109.2 },
    { lat: 38.2, lng: -109.3 },
  ],
  mapStyle: 'tac',
  requiredLayers: ['route-corridor', 'road-preview'],
};

const routePreparedSync = {
  id: 'offline-route-road-preview-1',
  sourceRouteId: 'road-preview-1',
  routeIdAliases: ['road-preview-1'],
  stableRouteKey: 'stable-road-preview-1',
  name: 'M1 Ridge Road',
  routeGeometry: offlineRouteReady.routeGeometry,
  finalDestination: {
    latitude: 38.2,
    longitude: -109.3,
    label: 'M1 Ridge Road',
    source: 'route_geometry',
  },
  routeIntent: {
    syncType: 'route',
    destination: {
      latitude: 38.2,
      longitude: -109.3,
      label: 'M1 Ridge Road',
      source: 'route_geometry',
    },
    mapContext: {
      styleKey: 'tac',
      layerContext: ['route-corridor', 'road-preview'],
    },
  },
  offlineTileRegionId: 'region-route-1',
  cacheStatus: 'cached',
  tileCacheAvailable: true,
  tileCacheStatus: 'complete',
};

const routeRegionComplete = {
  id: 'region-route-1',
  name: 'Route: M1 Ridge Road',
  status: 'complete',
  sourceType: 'route-corridor',
  syncType: 'route',
  routeId: 'road-preview-1',
  styleKey: 'tac',
  downloadedTiles: 100,
  tileCount: 100,
  routeIntent: routePreparedSync.routeIntent,
};

const routeReady = deriveOfflineReadiness({
  currentRouteContext,
  downloadedRoutes: [routePreparedSync],
  tileRegions: [routeRegionComplete],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});

assert(routeReady.level === 'ready', 'Completed matching route sync should make road preview offline readiness Ready.');
assert(routeReady.reason.includes('Route corridor'), 'Ready route sync should explain that the route corridor is cached.');

const readyGuidance = buildRouteGuidanceReadinessViewModel({
  routeId: currentRouteContext.routeId,
  routeType: 'road',
  vehicleFit: { label: 'Good' },
  routeConfidence: { level: 'high', reasons: ['Route geometry present'], concerns: [] },
  offlineReadiness: routeReady,
});

assert(
  readyGuidance.primaryConcern !== 'Offline data incomplete',
  'Completed matching route sync should not produce generic incomplete-data primary concern.',
);

const manifestReady = deriveOfflineReadiness({
  currentRouteContext,
  downloadedRoutes: [],
  runCacheManifest: {
    tile_region_id: 'region-route-1',
    route_geometry: [
      { lat: 38.1, lng: -109.2 },
      { lat: 38.2, lng: -109.3 },
    ],
    tile_cache_status: 'complete',
    gpx_metadata: {
      route_intent: routePreparedSync.routeIntent,
      final_destination: routePreparedSync.finalDestination,
    },
  },
  tileRegions: [routeRegionComplete],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});

assert(manifestReady.level === 'ready', 'Active run offline manifest should satisfy route-specific readiness.');

const notPreparedRoute = deriveOfflineReadiness({
  currentRouteContext,
  downloadedRoutes: [],
  tileRegions: [],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});

assert(notPreparedRoute.level === 'not_ready', 'No matching route sync should resolve to Not Prepared.');
assert(notPreparedRoute.label === 'Not Prepared', 'No matching route sync should use a specific Not Prepared label.');
assert(
  notPreparedRoute.reason === 'Prepare offline to cache this route.',
  'No matching route sync should not use generic incomplete-data copy.',
);
assert(
  !notPreparedRoute.reason.includes('incomplete'),
  'No offline sync should not claim cached route data is incomplete.',
);

const otherRouteSync = {
  ...routePreparedSync,
  id: 'offline-route-other',
  sourceRouteId: 'road-preview-other',
  routeIdAliases: ['road-preview-other'],
  stableRouteKey: 'stable-road-preview-other',
  finalDestination: {
    latitude: 39.2,
    longitude: -110.3,
    label: 'Different Route',
    source: 'route_geometry',
  },
  routeIntent: {
    ...routePreparedSync.routeIntent,
    destination: {
      latitude: 39.2,
      longitude: -110.3,
      label: 'Different Route',
      source: 'route_geometry',
    },
  },
  offlineTileRegionId: 'region-route-other',
};

const differentRoute = deriveOfflineReadiness({
  currentRouteContext,
  downloadedRoutes: [otherRouteSync],
  tileRegions: [{
    ...routeRegionComplete,
    id: 'region-route-other',
    routeId: 'road-preview-other',
    routeIntent: otherRouteSync.routeIntent,
  }],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});

assert(differentRoute.level === 'not_ready', 'Different completed route sync should not satisfy current route readiness.');
assert(differentRoute.label === 'Route Not Cached', 'Different completed route sync should identify route/cache mismatch.');
assert(
  differentRoute.reason.includes('different route or destination'),
  'Different completed route sync should explain the route/cache mismatch.',
);

const partialRoute = deriveOfflineReadiness({
  currentRouteContext,
  downloadedRoutes: [{ ...routePreparedSync, tileCacheStatus: 'downloading' }],
  tileRegions: [{ ...routeRegionComplete, status: 'downloading', downloadedTiles: 40, tileCount: 100 }],
  tileSyncJobs: [{
    regionId: 'region-route-1',
    source: 'route-corridor',
    syncType: 'route',
    status: 'running',
    progress: { percent: 40, downloadedTiles: 40, totalTiles: 100, status: 'downloading' },
    routeIntent: routePreparedSync.routeIntent,
  }],
  routeSyncHydrated: true,
});

assert(partialRoute.level === 'partial', 'Active route sync should resolve to Partial.');
assert(partialRoute.label === '40% Cached', 'Active route sync should show progress when available.');
assert(partialRoute.reason.includes('40%'), 'Active route sync should include percent in the reason.');

const wrongStyleRoute = deriveOfflineReadiness({
  currentRouteContext: { ...currentRouteContext, mapStyle: 'sat' },
  downloadedRoutes: [routePreparedSync],
  tileRegions: [routeRegionComplete],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});

assert(wrongStyleRoute.level === 'partial', 'Wrong cached map style should be a specific partial readiness state.');
assert(wrongStyleRoute.label === 'Style Not Cached', 'Wrong cached map style should not use generic incomplete-data copy.');
assert(wrongStyleRoute.reason.includes('SAT'), 'Wrong cached map style should name the active map style.');

const missingLayerRoute = deriveOfflineReadiness({
  currentRouteContext: { ...currentRouteContext, requiredLayers: ['route-corridor', 'road-preview', 'campsite-layer'] },
  downloadedRoutes: [routePreparedSync],
  tileRegions: [routeRegionComplete],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});

assert(missingLayerRoute.level === 'partial', 'Missing required layer should be a specific partial readiness state.');
assert(missingLayerRoute.label === 'Layer Not Cached', 'Missing required layer should not use generic incomplete-data copy.');
assert(missingLayerRoute.reason.includes('campsite-layer'), 'Missing required layer should name the layer coverage gap.');

const offlineLibraryOpenContext = {
  routeId: 'offline-sync-open-runtime-route',
  destination: { lat: 38.2, lng: -109.3, label: 'M1 Ridge Road' },
  geometry: [
    { lat: 38.08, lng: -109.18 },
    { lat: 38.2, lng: -109.3 },
  ],
  mapStyle: 'tac',
  requiredLayers: ['route-corridor', 'road-preview'],
};

const offlineLibraryOpenReady = deriveOfflineReadiness({
  currentRouteContext: offlineLibraryOpenContext,
  downloadedRoutes: [routePreparedSync],
  tileRegions: [routeRegionComplete],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});

assert(
  offlineLibraryOpenReady.level === 'ready',
  'Downloaded sync Open should evaluate rebuilt current-location-to-destination preview against the downloaded sync.',
);

const helperSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'offlineReadinessPresentation.ts'), 'utf8');
const navigateSource = fs.readFileSync(path.join(__dirname, '..', 'app', '(tabs)', 'navigate.tsx'), 'utf8');
assert(
  helperSource.includes("import type { CacheReadinessSnapshot }") &&
    helperSource.includes("import type { OfflineCachedRoute }") &&
    helperSource.includes("import type { RunOfflineCacheManifest }") &&
    helperSource.includes("import { getWeatherFreshness"),
  'Offline Readiness should reuse existing cache, route manifest, and weather freshness infrastructure.',
);
assert(!helperSource.includes('Route Pack'), 'Offline Readiness should not introduce a Route Pack domain model.');
assert(
  (navigateSource.includes("roadNavigation.previewDestination(destination, 'offline_sync_open')") ||
    navigateSource.includes("previewRoadDestination(destination, 'offline_sync_open')")) &&
    navigateSource.includes('currentRouteContext: route') &&
    navigateSource.includes('downloadedRoutes: offlineRouteReadinessState.routes'),
  'Downloaded sync Open should rebuild road preview and feed downloaded syncs into readiness evaluation.',
);

console.log('offline readiness presentation checks passed');

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

const {
  buildNavigationOfflineReadinessContext,
  deriveOfflineReadiness,
  selectNavigationOfflineReadinessPayload,
} = loadTsModule('lib/offlineReadinessPresentation.ts');
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

const missingSingleRegion = deriveOfflineReadiness({
  currentRouteContext,
  downloadedRoutes: [routePreparedSync],
  tileRegions: [],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  missingSingleRegion.level !== 'ready',
  'Persisted complete status must not claim Ready after its single physical tile region is missing.',
);
assert(missingSingleRegion.missingAssets.includes('route corridor tiles'));

const multiRegionIncomplete = deriveOfflineReadiness({
  currentRouteContext,
  downloadedRoutes: [{
    ...routePreparedSync,
    offlineTileRegionIds: ['region-route-1', 'region-route-2'],
    offlineTileRegionStatuses: {
      'region-route-1': 'complete',
      'region-route-2': 'failed',
    },
    tileCacheStatus: 'failed',
  }],
  tileRegions: [
    routeRegionComplete,
    {
      ...routeRegionComplete,
      id: 'region-route-2',
      status: 'error',
      downloadedTiles: 75,
    },
  ],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  multiRegionIncomplete.level !== 'ready',
  'One complete region must not promote a multi-region package when another required region failed.',
);
assert(
  multiRegionIncomplete.missingAssets.includes('route corridor tiles'),
  'Incomplete multi-region packages should keep route corridor tiles in the missing list.',
);

const multiRegionWrongStyle = deriveOfflineReadiness({
  currentRouteContext,
  downloadedRoutes: [{
    ...routePreparedSync,
    offlineTileRegionIds: ['region-route-1', 'region-route-2'],
    offlineTileRegionStatuses: {
      'region-route-1': 'complete',
      'region-route-2': 'complete',
    },
    tileCacheStatus: 'complete',
  }],
  tileRegions: [
    routeRegionComplete,
    {
      ...routeRegionComplete,
      id: 'region-route-2',
      styleKey: 'satellite',
      status: 'complete',
      downloadedTiles: 100,
      tileCount: 100,
    },
  ],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  multiRegionWrongStyle.label === 'Style Not Cached',
  'One matching region must not hide a different physical style in another required region.',
);
assert(
  multiRegionWrongStyle.recommendedAction === 'prepare_offline',
  'A mixed-style physical package should retain the Prepare Offline recovery action.',
);

const sourceWarningRouteIntent = {
  ...routePreparedSync.routeIntent,
  readinessSnapshot: {
    routeCatalogSourceTimestamps: ['2026-05-20T00:00:00.000Z'],
    routeCatalogAttribution: [
      {
        providerId: 'usfs_mvum',
        label: 'USFS MVUM',
        attribution: 'USDA Forest Service',
      },
    ],
    routeCatalogFreshnessWarnings: ['Source stale. Refresh official source checks before offline use.'],
    routeCatalogOfflineCache: {
      cacheable: true,
      lastVerifiedAt: '2026-05-20T00:00:00.000Z',
      staleAt: '2026-05-21T00:00:00.000Z',
    },
  },
};

const sourceWarningRoute = deriveOfflineReadiness({
  currentRouteContext,
  downloadedRoutes: [
    {
      ...routePreparedSync,
      routeIntent: sourceWarningRouteIntent,
    },
  ],
  tileRegions: [
    {
      ...routeRegionComplete,
      routeIntent: sourceWarningRouteIntent,
    },
  ],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});

assert(
  sourceWarningRoute.level === 'partial',
  'Cached route sync with stale route catalog source metadata should downgrade offline readiness to Partial.',
);
assert(
  sourceWarningRoute.label === 'Source Warning',
  'Cached route sync with stale route catalog source metadata should use a specific Source Warning label.',
);
assert(
  sourceWarningRoute.readyAssets.includes('route catalog source metadata'),
  'Route catalog source timestamps and attribution should remain visible as ready metadata after caching.',
);
assert(
  sourceWarningRoute.staleAssets.includes('route catalog source freshness'),
  'Route catalog freshness warnings should be visible as stale offline readiness assets.',
);
assert(
  sourceWarningRoute.reason.includes('Refresh official source checks'),
  'Route catalog freshness warning should remain the primary offline readiness reason.',
);
assert(
  sourceWarningRoute.recommendedAction == null,
  'A fully cached route with only a source-freshness warning must not recommend downloading the same offline pack again.',
);
const sourceWarningGuidance = buildRouteGuidanceReadinessViewModel({
  routeId: currentRouteContext.routeId,
  routeType: 'road',
  vehicleFit: { label: 'Good' },
  routeConfidence: { level: 'high', reasons: ['Route geometry present'], concerns: [] },
  offlineReadiness: sourceWarningRoute,
});
assert(
  !sourceWarningGuidance.recommendedActions.some((action) => action.id === 'prepare_offline'),
  'Route Guidance must preserve the source warning without sending the user back through Offline Prep.',
);

const duplicateCancelAfterReady = deriveOfflineReadiness({
  currentRouteContext,
  downloadedRoutes: [routePreparedSync],
  tileRegions: [routeRegionComplete],
  tileSyncJobs: [{
    regionId: 'region-route-duplicate-cancelled',
    source: 'route-corridor',
    syncType: 'route',
    status: 'cancelled',
    progress: { percent: 4, downloadedTiles: 4, totalTiles: 100, status: 'cancelled' },
    routeIntent: routePreparedSync.routeIntent,
  }],
  routeSyncHydrated: true,
});

assert(
  duplicateCancelAfterReady.level === 'ready',
  'Cancelling a duplicate Prepare Offline job must not downgrade an already cached route sync.',
);
assert(
  duplicateCancelAfterReady.label !== 'Cancelled',
  'Existing cached route sync should win over a newer cancelled duplicate job.',
);

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
  runCacheManifestOwnerMatches: true,
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

const unownedManifestRejected = deriveOfflineReadiness({
  currentRouteContext,
  downloadedRoutes: [],
  runCacheManifestOwnerMatches: false,
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
assert(
  unownedManifestRejected.level === 'not_ready',
  'A same-endpoint active-run manifest must not satisfy a displayed route unless ownership is proven.',
);

const missingManifestRegion = deriveOfflineReadiness({
  currentRouteContext,
  downloadedRoutes: [],
  runCacheManifestOwnerMatches: true,
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
  tileRegions: [],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(missingManifestRegion.level !== 'ready', 'A restored run manifest cannot replace missing physical map tiles.');

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
assert(
  partialRoute.readyAssets.includes('active map style'),
  'Active route sync should show the current map style is included in the route package being downloaded.',
);
assert(
  partialRoute.reason.includes('active map style'),
  'Active route sync copy should distinguish a style-aware route package from a generic map-area download.',
);

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

const offlineLibraryOpenContext = buildNavigationOfflineReadinessContext({
  roadRoute: {
    id: 'offline-sync-open-runtime-route',
    canonicalRouteId: 'road-preview-1',
    destination: {
      coordinate: { lat: 38.2, lng: -109.3 },
      title: 'M1 Ridge Road',
    },
    geometry: [
      { lat: 38.08, lng: -109.18 },
      { lat: 38.2, lng: -109.3 },
    ],
  },
  mapStyle: 'tac',
}).currentRouteContext;

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

// Trip Builder persists the full itinerary spine under a synthetic offline-cache
// ID. Active road guidance can use the provider approach ID and stop at the
// selected trailhead instead. The canonical route alias, rather than either
// synthetic ID or endpoint proximity, must join those two runtime views.
const canonicalTripBuilderRouteId = 'provider-route-mendocino-23';
const tripBuilderOfflineIntent = {
  ...routePreparedSync.routeIntent,
  destination: {
    latitude: 39.458,
    longitude: -122.936,
    label: 'Canonical trail end',
    source: 'route_geometry',
  },
  mapContext: {
    styleKey: 'day',
    layerContext: [
      'offline_prep_pack',
      'trip_builder_itinerary',
      'route-corridor',
      'road-preview',
    ],
  },
  readinessSnapshot: {
    offlinePrepManifest: {
      routeId: canonicalTripBuilderRouteId,
      routeAssetId: 'route-asset-mendocino-23',
    },
  },
};
const tripBuilderOfflineRoute = {
  ...routePreparedSync,
  id: 'offline-route-route-synthetic-cache-key',
  sourceRouteId: 'offline-prep-provider-route-mendocino-23',
  routeIdAliases: [
    'offline-prep-provider-route-mendocino-23',
  ],
  stableRouteKey: 'route-synthetic-cache-key',
  finalDestination: tripBuilderOfflineIntent.destination,
  routeIntent: tripBuilderOfflineIntent,
  offlineTileRegionId: 'region-trip-builder-full-pack',
  offlineTileRegionIds: ['region-trip-builder-full-pack'],
  offlineTileRegionStatuses: {
    'region-trip-builder-full-pack': 'complete',
  },
  tileCacheStatus: 'complete',
};
const tripBuilderFullPackRegion = {
  ...routeRegionComplete,
  id: 'region-trip-builder-full-pack',
  routeId: 'offline-prep-provider-route-mendocino-23',
  styleKey: 'day',
  routeIntent: tripBuilderOfflineIntent,
  status: 'complete',
  downloadedTiles: 240,
  tileCount: 240,
};
const activeProviderApproachContext = {
  routeId: canonicalTripBuilderRouteId,
  destination: {
    lat: 39.302,
    lng: -122.721,
    label: 'Selected trailhead',
  },
  geometry: [
    { lat: 38.7, lng: -121.3 },
    { lat: 39.302, lng: -122.721 },
  ],
  mapStyle: 'ecs',
  requiredLayers: ['route-corridor', 'road-preview'],
};

const completedTripBuilderPack = deriveOfflineReadiness({
  currentRouteContext: activeProviderApproachContext,
  downloadedRoutes: [tripBuilderOfflineRoute],
  tileRegions: [tripBuilderFullPackRegion],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  completedTripBuilderPack.level === 'ready',
  'A complete Trip Builder pack must satisfy active provider guidance when canonical route identity matches.',
);
assert(
  completedTripBuilderPack.label === 'Ready',
  'A legacy DAY cache key should satisfy the canonical ECS day style.',
);

const hybridRoadContextResult = buildNavigationOfflineReadinessContext({
  roadRoute: {
    id: 'provider-transient-road-leg',
    destination: {
      coordinate: activeProviderApproachContext.destination,
      title: activeProviderApproachContext.destination.label,
    },
    geometry: activeProviderApproachContext.geometry,
  },
  navigationPayload: {
    id: canonicalTripBuilderRouteId,
    title: 'Canonical Trip Builder route',
    trailGeometry: [],
  },
  mapStyle: 'ecs',
});
assert(
  hybridRoadContextResult.currentRouteContext?.routeId === canonicalTripBuilderRouteId,
  'A transient provider road ID must not replace the canonical Trip Builder route identity.',
);
const hybridRoadReady = deriveOfflineReadiness({
  currentRouteContext: hybridRoadContextResult.currentRouteContext,
  downloadedRoutes: [tripBuilderOfflineRoute],
  tileRegions: [tripBuilderFullPackRegion],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  hybridRoadReady.level === 'ready' && hybridRoadReady.recommendedAction == null,
  'Canonical Trip Builder identity should make a completed pack Ready across a transient provider approach.',
);

const importedTrailOnlyContextResult = buildNavigationOfflineReadinessContext({
  navigationPayload: {
    id: canonicalTripBuilderRouteId,
    title: 'Imported Mendocino route',
    trailGeometry: [
      { lat: 39.302, lng: -122.721 },
      { lat: 39.458, lng: -122.936 },
    ],
  },
  mapStyle: 'ecs',
});
assert(
  importedTrailOnlyContextResult.currentRouteContext?.destination?.lat === 39.458,
  'The roadless imported-route context should use its continuous canonical trail end.',
);
const importedTrailOnlyReady = deriveOfflineReadiness({
  currentRouteContext: importedTrailOnlyContextResult.currentRouteContext,
  downloadedRoutes: [tripBuilderOfflineRoute],
  tileRegions: [tripBuilderFullPackRegion],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  importedTrailOnlyReady.level === 'ready',
  'A continuous imported trail without a provider road leg should use canonical identity and become Ready.',
);

const disconnectedSegmentEndpoint = {
  latitude: 39.199,
  longitude: -122.611,
  label: 'Non-canonical preview segment endpoint',
  source: 'route_geometry',
};
const disconnectedEndpointRoute = {
  ...tripBuilderOfflineRoute,
  id: 'offline-route-disconnected-endpoint',
  sourceRouteId: 'offline-prep-disconnected-endpoint',
  routeIdAliases: ['different-canonical-route'],
  finalDestination: disconnectedSegmentEndpoint,
  routeIntent: {
    ...tripBuilderOfflineIntent,
    destination: disconnectedSegmentEndpoint,
    readinessSnapshot: {
      offlinePrepManifest: { routeId: 'different-canonical-route' },
    },
  },
  offlineTileRegionId: 'region-disconnected-endpoint',
  offlineTileRegionIds: ['region-disconnected-endpoint'],
  offlineTileRegionStatuses: { 'region-disconnected-endpoint': 'complete' },
};
const disconnectedContextResult = buildNavigationOfflineReadinessContext({
  navigationPayload: {
    id: 'preview-only-disconnected-route',
    title: 'Disconnected preview route',
    trailGeometry: [],
    trailGeometrySegments: [[
      { lat: 39.15, lng: -122.55 },
      { lat: disconnectedSegmentEndpoint.latitude, lng: disconnectedSegmentEndpoint.longitude },
    ]],
  },
  mapStyle: 'ecs',
});
assert(
  disconnectedContextResult.currentRouteContext?.destination == null,
  'Disconnected preview-only segments must omit destination-proximity fallback.',
);
const disconnectedSegmentOnlyReadiness = deriveOfflineReadiness({
  currentRouteContext: disconnectedContextResult.currentRouteContext,
  downloadedRoutes: [disconnectedEndpointRoute],
  tileRegions: [{
    ...tripBuilderFullPackRegion,
    id: 'region-disconnected-endpoint',
    routeId: 'offline-prep-disconnected-endpoint',
    routeIntent: disconnectedEndpointRoute.routeIntent,
  }],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  disconnectedSegmentOnlyReadiness.label === 'Route Not Cached',
  'A disconnected preview segment endpoint must not be treated as a canonical destination match.',
);

const restoredTrailPayload = {
  id: canonicalTripBuilderRouteId,
  title: 'Restored trail session',
  trailGeometry: [],
};
const staleExplorePayload = {
  id: 'stale-explore-preview',
  title: 'Stale Explore preview',
  trailGeometry: [
    { lat: 38.1, lng: -121.9 },
    { lat: 38.2, lng: -122.0 },
  ],
};
const selectedRestoredPayload = selectNavigationOfflineReadinessPayload(
  restoredTrailPayload,
  staleExplorePayload,
);
assert(
  selectedRestoredPayload?.id === canonicalTripBuilderRouteId,
  'A restored active trail-session payload should take precedence over stale Explore state.',
);
const restoredTrailContext = buildNavigationOfflineReadinessContext({
  navigationPayload: selectedRestoredPayload,
  activeRun: {
    id: 'restored-import-run',
    title: 'Restored imported run',
    sourceRouteId: canonicalTripBuilderRouteId,
    geometry: [
      { lat: 39.302, lng: -122.721 },
      { lat: 39.458, lng: -122.936 },
    ],
  },
  mapStyle: 'ecs',
});
assert(
  restoredTrailContext.currentRouteContext?.routeId === canonicalTripBuilderRouteId &&
    restoredTrailContext.activeRunMatchesContext,
  'A restored trail-session payload should retain canonical identity and accept its linked active-run manifest.',
);

const unrelatedRunRoadContext = buildNavigationOfflineReadinessContext({
  roadRoute: {
    id: 'provider-road-leg-a',
    destination: {
      coordinate: { lat: 39.302, lng: -122.721 },
      title: 'Selected trailhead',
    },
    geometry: [
      { lat: 38.7, lng: -121.3 },
      { lat: 39.302, lng: -122.721 },
    ],
  },
  navigationPayload: {
    id: canonicalTripBuilderRouteId,
    title: 'Canonical route A',
    trailGeometry: [],
  },
  activeRun: {
    id: 'unrelated-run-b',
    title: 'Unrelated route B',
    sourceRouteId: 'unrelated-route-b',
    geometry: [
      { lat: 39.1, lng: -122.5 },
      { lat: 39.302, lng: -122.721 },
    ],
  },
  mapStyle: 'ecs',
});
assert(
  unrelatedRunRoadContext.activeRunMatchesContext === false,
  'A stale active run must not supply its offline manifest to a different displayed route.',
);

const noGeometryContext = buildNavigationOfflineReadinessContext({
  navigationPayload: {
    id: 'no-geometry-route',
    title: 'No geometry',
    trailGeometry: [],
    trailGeometrySegments: [],
  },
  mapStyle: 'ecs',
});
assert(
  noGeometryContext.currentRouteContext == null,
  'A roadless route without usable geometry should not fabricate route-specific offline context.',
);

const completedTripBuilderGuidance = buildRouteGuidanceReadinessViewModel({
  routeId: canonicalTripBuilderRouteId,
  routeType: 'road',
  vehicleFit: { label: 'Good' },
  routeConfidence: {
    level: 'high',
    reasons: ['Canonical route identity is present'],
    concerns: [],
  },
  offlineReadiness: completedTripBuilderPack,
});
assert(
  !completedTripBuilderGuidance.recommendedActions.some((action) => action.id === 'prepare_offline'),
  'Completed Trip Builder preparation must remove the redundant Prepare Offline guidance action.',
);
assert(
  !String(completedTripBuilderGuidance.primaryConcern ?? '').toLowerCase().includes('not cached'),
  'Completed Trip Builder preparation must not retain a primary map-style cache warning.',
);

const legacyOfflinePrepIntent = {
  ...tripBuilderOfflineIntent,
  mapContext: {
    styleKey: 'tactical',
    layerContext: ['offline_prep_pack', 'trip_builder_itinerary'],
  },
};
const legacyOfflinePrepReady = deriveOfflineReadiness({
  currentRouteContext: activeProviderApproachContext,
  downloadedRoutes: [{
    ...tripBuilderOfflineRoute,
    routeIntent: legacyOfflinePrepIntent,
  }],
  tileRegions: [{
    ...tripBuilderFullPackRegion,
    styleKey: 'tactical',
    routeIntent: legacyOfflinePrepIntent,
  }],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  legacyOfflinePrepReady.level === 'ready',
  'A completed legacy Offline Prep pack should reconcile its hardcoded tactical metadata to ECS Day.',
);
assert(
  legacyOfflinePrepReady.recommendedAction == null,
  'A map-ready legacy Offline Prep pack must not send the user through Offline Prep again.',
);

const explicitTacticalIntent = {
  ...tripBuilderOfflineIntent,
  mapContext: {
    ...tripBuilderOfflineIntent.mapContext,
    styleKey: 'tactical',
  },
};
const explicitTacticalMismatch = deriveOfflineReadiness({
  currentRouteContext: activeProviderApproachContext,
  downloadedRoutes: [{
    ...tripBuilderOfflineRoute,
    routeIntent: explicitTacticalIntent,
  }],
  tileRegions: [{
    ...tripBuilderFullPackRegion,
    styleKey: 'tactical',
    routeIntent: explicitTacticalIntent,
  }],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  explicitTacticalMismatch.label === 'Style Not Cached',
  'A new explicitly prepared Tactical pack must remain distinct from ECS Day.',
);
assert(
  explicitTacticalMismatch.recommendedAction === 'prepare_offline',
  'A genuine Tactical versus ECS Day mismatch should retain the Prepare Offline recovery action.',
);

const nearbyDifferentIntent = {
  ...tripBuilderOfflineIntent,
  destination: {
    latitude: activeProviderApproachContext.destination.lat,
    longitude: activeProviderApproachContext.destination.lng,
    label: 'Shared trailhead for another route',
    source: 'route_geometry',
  },
  mapContext: {
    ...tripBuilderOfflineIntent.mapContext,
    styleKey: 'satellite',
  },
  readinessSnapshot: {
    offlinePrepManifest: {
      routeId: 'provider-route-shared-trailhead',
    },
  },
};
const nearbyDifferentRoute = {
  ...tripBuilderOfflineRoute,
  id: 'offline-route-shared-trailhead',
  sourceRouteId: 'offline-prep-shared-trailhead',
  routeIdAliases: ['provider-route-shared-trailhead'],
  routeIntent: nearbyDifferentIntent,
  finalDestination: nearbyDifferentIntent.destination,
  offlineTileRegionId: 'region-shared-trailhead',
  offlineTileRegionIds: ['region-shared-trailhead'],
  offlineTileRegionStatuses: { 'region-shared-trailhead': 'complete' },
};
const nearbyDifferentRegion = {
  ...tripBuilderFullPackRegion,
  id: 'region-shared-trailhead',
  routeId: 'offline-prep-shared-trailhead',
  styleKey: 'satellite',
  routeIntent: nearbyDifferentIntent,
};
const nearbyRouteOnly = deriveOfflineReadiness({
  currentRouteContext: activeProviderApproachContext,
  downloadedRoutes: [nearbyDifferentRoute],
  tileRegions: [nearbyDifferentRegion],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  nearbyRouteOnly.label === 'Route Not Cached',
  'A different canonical route must not satisfy readiness merely because it shares the same trailhead.',
);
const exactRoutePreferred = deriveOfflineReadiness({
  currentRouteContext: activeProviderApproachContext,
  downloadedRoutes: [nearbyDifferentRoute, tripBuilderOfflineRoute],
  tileRegions: [nearbyDifferentRegion, tripBuilderFullPackRegion],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  exactRoutePreferred.level === 'ready',
  'Canonical route identity must win over an earlier downloaded route that merely shares a nearby trailhead.',
);

const exactFailedRoute = {
  ...tripBuilderOfflineRoute,
  tileCacheStatus: 'failed',
  tileCacheError: 'EXACT_ROUTE_SYNC_FAILED',
  offlineTileRegionStatuses: { 'region-trip-builder-full-pack': 'failed' },
};
const exactFailedRegion = {
  ...tripBuilderFullPackRegion,
  status: 'error',
  downloadedTiles: 120,
};
const exactFailurePreferred = deriveOfflineReadiness({
  currentRouteContext: activeProviderApproachContext,
  downloadedRoutes: [nearbyDifferentRoute, exactFailedRoute],
  tileRegions: [nearbyDifferentRegion, exactFailedRegion],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  exactFailurePreferred.label === 'Sync Failed',
  'A nearby completed route must not conceal a failed cache for the exact canonical route.',
);

const criticalFallbackIntent = {
  ...tripBuilderOfflineIntent,
  mapContext: {
    ...tripBuilderOfflineIntent.mapContext,
    layerContext: [
      ...tripBuilderOfflineIntent.mapContext.layerContext,
      'critical_offline_segments',
    ],
  },
  readinessSnapshot: {
    ...tripBuilderOfflineIntent.readinessSnapshot,
    offlinePrepFallbackFor: 'full_route_map_limit',
    offlinePrepCriticalSegmentIndex: 1,
  },
};
const criticalFallbackRoute = {
  ...tripBuilderOfflineRoute,
  routeIntent: criticalFallbackIntent,
  offlineTileRegionId: 'region-critical-segment-1',
  offlineTileRegionIds: ['region-critical-segment-1', 'region-critical-segment-2'],
  offlineTileRegionStatuses: {
    'region-critical-segment-1': 'complete',
    'region-critical-segment-2': 'complete',
  },
};
const criticalFallbackRegions = [1, 2].map((index) => ({
  ...tripBuilderFullPackRegion,
  id: `region-critical-segment-${index}`,
  routeId: 'offline-prep-provider-route-mendocino-23',
  routeIntent: {
    ...criticalFallbackIntent,
    readinessSnapshot: {
      ...criticalFallbackIntent.readinessSnapshot,
      offlinePrepCriticalSegmentIndex: index,
    },
  },
  downloadedTiles: 80,
  tileCount: 80,
}));
const criticalFallbackReadiness = deriveOfflineReadiness({
  currentRouteContext: activeProviderApproachContext,
  downloadedRoutes: [criticalFallbackRoute],
  tileRegions: criticalFallbackRegions,
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  criticalFallbackReadiness.level === 'partial' && criticalFallbackReadiness.label === 'Partial Map Coverage',
  'Completed low-signal fallback segments must not claim full-route offline map readiness.',
);
assert(
  criticalFallbackReadiness.readyAssets.includes('low-signal map segments'),
  'Critical-segment fallback should identify the map coverage that is actually cached.',
);
assert(
  criticalFallbackReadiness.missingAssets.includes('full route corridor tiles'),
  'Critical-segment fallback should retain the full-route corridor coverage gap.',
);
assert(
  criticalFallbackReadiness.recommendedAction == null,
  'A completed bounded fallback should not send the user through the same Offline Prep action again.',
);
const criticalFallbackGuidance = buildRouteGuidanceReadinessViewModel({
  routeId: canonicalTripBuilderRouteId,
  routeType: 'road',
  vehicleFit: { label: 'Good' },
  routeConfidence: {
    level: 'high',
    reasons: ['Canonical route identity is present'],
    concerns: [],
  },
  offlineReadiness: criticalFallbackReadiness,
});
assert(
  !criticalFallbackGuidance.recommendedActions.some((action) => action.id === 'prepare_offline'),
  'A completed critical-segment fallback should expose its limitation without a redundant Prepare Offline action.',
);

const satelliteOnlyTripBuilderIntent = {
  ...tripBuilderOfflineIntent,
  mapContext: {
    ...tripBuilderOfflineIntent.mapContext,
    styleKey: 'satellite',
  },
};
const satelliteOnlyTripBuilderRoute = {
  ...tripBuilderOfflineRoute,
  routeIntent: satelliteOnlyTripBuilderIntent,
};
const satelliteOnlyTripBuilderRegion = {
  ...tripBuilderFullPackRegion,
  styleKey: 'satellite',
  routeIntent: satelliteOnlyTripBuilderIntent,
};
const satelliteStyleMismatch = deriveOfflineReadiness({
  currentRouteContext: activeProviderApproachContext,
  downloadedRoutes: [satelliteOnlyTripBuilderRoute],
  tileRegions: [satelliteOnlyTripBuilderRegion],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  satelliteStyleMismatch.label === 'Style Not Cached',
  'A downloaded satellite style must not satisfy active ECS day-style readiness.',
);
assert(
  satelliteStyleMismatch.recommendedAction === 'prepare_offline',
  'A genuine style mismatch should retain the Prepare Offline recovery action.',
);

const unrelatedTripBuilderRoute = {
  ...tripBuilderOfflineRoute,
  id: 'offline-route-unrelated',
  sourceRouteId: 'offline-prep-unrelated',
  routeIdAliases: ['offline-prep-unrelated', 'provider-route-unrelated'],
  routeIntent: {
    ...tripBuilderOfflineIntent,
    readinessSnapshot: {
      offlinePrepManifest: {
        routeId: 'provider-route-unrelated',
      },
    },
  },
  offlineTileRegionId: 'region-trip-builder-unrelated',
  offlineTileRegionIds: ['region-trip-builder-unrelated'],
  offlineTileRegionStatuses: {
    'region-trip-builder-unrelated': 'complete',
  },
};
const unrelatedTripBuilderRegion = {
  ...tripBuilderFullPackRegion,
  id: 'region-trip-builder-unrelated',
  routeId: 'offline-prep-unrelated',
  routeIntent: unrelatedTripBuilderRoute.routeIntent,
};
const unrelatedTripBuilderPack = deriveOfflineReadiness({
  currentRouteContext: activeProviderApproachContext,
  downloadedRoutes: [unrelatedTripBuilderRoute],
  tileRegions: [unrelatedTripBuilderRegion],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  unrelatedTripBuilderPack.label === 'Route Not Cached',
  'A completed pack for an unrelated route must not satisfy the active route.',
);
assert(
  unrelatedTripBuilderPack.recommendedAction === 'prepare_offline',
  'An unrelated route pack should retain the Prepare Offline recovery action.',
);

const incompleteTripBuilderPack = deriveOfflineReadiness({
  currentRouteContext: activeProviderApproachContext,
  downloadedRoutes: [tripBuilderOfflineRoute],
  tileRegions: [{
    ...tripBuilderFullPackRegion,
    status: 'downloading',
    downloadedTiles: 239,
    tileCount: 240,
  }],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  incompleteTripBuilderPack.level !== 'ready',
  'A logical pack marked complete must not hide an incomplete physical tile region.',
);
assert(
  incompleteTripBuilderPack.recommendedAction === 'prepare_offline',
  'An incomplete physical tile region should retain the Prepare Offline recovery action.',
);

const failedTripBuilderPack = deriveOfflineReadiness({
  currentRouteContext: activeProviderApproachContext,
  downloadedRoutes: [{
    ...tripBuilderOfflineRoute,
    tileCacheStatus: 'failed',
    tileCacheError: 'OFFLINE_TILE_REGION_FAILED',
    offlineTileRegionStatuses: {
      'region-trip-builder-full-pack': 'failed',
    },
  }],
  tileRegions: [{
    ...tripBuilderFullPackRegion,
    status: 'error',
    downloadedTiles: 120,
    tileCount: 240,
  }],
  tileSyncJobs: [],
  routeSyncHydrated: true,
});
assert(
  failedTripBuilderPack.label === 'Sync Failed',
  'A failed physical tile region must remain an explicit terminal warning.',
);
assert(
  failedTripBuilderPack.recommendedAction === 'prepare_offline',
  'A failed physical tile region should retain the Prepare Offline recovery action.',
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
    navigateSource.includes('buildNavigationOfflineReadinessContext({') &&
    navigateSource.includes('navigationOfflineContext.activeRunMatchesContext') &&
    navigateSource.includes('downloadedRoutes: offlineRouteReadinessState.routes'),
  'Downloaded sync Open should rebuild road preview and feed downloaded syncs into readiness evaluation.',
);

console.log('offline readiness presentation checks passed');

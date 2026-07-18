const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const storage = new Map();
global.__DEV__ = false;
global.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  if (request === 'expo-constants') return { __esModule: true, default: { expoConfig: {} } };
  if (
    request === '../keyValuePersistence' &&
    parent?.filename.endsWith(path.join('lib', 'offlinePrepPack', 'offlinePrepPackHandoffStore.ts'))
  ) {
    return {
      createPersistedKeyValueCache: () => ({
        waitForHydration: async () => {},
        get: () => null,
        set: () => {},
        delete: () => {},
        flush: async () => {},
      }),
    };
  }
  if (parent?.filename.endsWith(path.join('lib', 'offlineRouteCacheService.ts'))) {
    if (request === './fsCompat') {
      return {
        getDocumentDirectory: async () => '',
        fsEnsureDir: async () => {},
        fsReadString: async () => '[]',
        fsWriteString: async () => {},
      };
    }
    if (request === './remote/offlineRemoteCache') {
      return {
        REMOTE_CACHE_GROUP_ID: 'ecs-remote-v1',
        buildOfflineRemoteCacheManifest: () => null,
      };
    }
    if (request === './runStore') {
      return {
        computeRunHealth: () => ({
          overall: 'green',
          range: null,
          roof: null,
          hitch: null,
          warnings: [],
        }),
        generateRunGPX: () => '<gpx />',
      };
    }
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

const routeCachePath = path.join(root, 'lib', 'offlineRouteCacheService.ts');
const offlinePrepService = require(path.join(
  root,
  'lib',
  'offlinePrepPack',
  'offlinePrepPackService.ts',
));
const handoffStore = require(path.join(
  root,
  'lib',
  'offlinePrepPack',
  'offlinePrepPackHandoffStore.ts',
));
const { deriveOfflineReadiness } = require(path.join(
  root,
  'lib',
  'offlineReadinessPresentation.ts',
));

const origin = { lat: 38.7, lng: -121.3 };
const fuel = { lat: 38.8, lng: -121.2 };
const trailhead = { lat: 38.9, lng: -121.1 };
const createdAt = '2026-07-17T18:00:00.000Z';

function guidanceStep(id, instruction, location, globalStepIndex) {
  return {
    id,
    legIndex: globalStepIndex,
    stepIndex: 0,
    globalStepIndex,
    instruction,
    shortInstruction: instruction,
    maneuverType: 'arrive',
    displayRoadName: instruction,
    isUnnamedRoad: false,
    distanceMeters: 5000,
    durationSeconds: 450,
    maneuverLocation: [location.lng, location.lat],
    geometry: [location],
  };
}

const providerGuidanceSteps = [
  guidanceStep('fuel-guidance-step', 'Arrive at fuel', fuel, 0),
  guidanceStep('trailhead-guidance-step', 'Arrive at trailhead', trailhead, 1),
];
const preparedRoadRoute = {
  id: 'trip-builder-road-route',
  routeVersion: 'trip-builder-road-route:v1',
  routeIndex: 0,
  mapboxRouteUuid: 'fixture-route-uuid',
  selectedRouteIndex: 0,
  providerMetadata: {
    provider: 'mapbox_directions',
    profile: 'driving-traffic',
  },
  guidance: {
    id: 'trip-builder-road-guidance',
    routeVersion: 'trip-builder-road-route:v1',
    routeIndex: 0,
    source: 'mapbox_directions',
    routeUuid: 'fixture-route-uuid',
    geometry: [origin, fuel, trailhead],
    distanceMeters: 10000,
    durationSeconds: 900,
    legs: [
      { legIndex: 0, distanceMeters: 5000, durationSeconds: 450, steps: [providerGuidanceSteps[0]] },
      { legIndex: 1, distanceMeters: 5000, durationSeconds: 450, steps: [providerGuidanceSteps[1]] },
    ],
    steps: providerGuidanceSteps,
    createdAt,
    rerouteGeneration: 0,
    guidanceMode: 'turn_by_turn',
    guidanceSourceLabel: 'Mapbox turn-by-turn',
  },
  origin,
  destination: {
    id: 'selected-trailhead',
    title: 'Selected trailhead',
    subtitle: 'via fuel',
    coordinate: trailhead,
    sourceType: 'explore_handoff',
  },
  geometry: [origin, fuel, trailhead],
  distanceM: 10000,
  durationS: 900,
  steps: [
    {
      id: 'fuel-step',
      instruction: 'Arrive at fuel',
      distanceM: 5000,
      durationS: 450,
      startDistanceM: 0,
      endDistanceM: 5000,
      startDurationS: 0,
      endDurationS: 450,
      maneuverType: 'arrive',
      modifier: null,
      roadName: 'Fuel stop',
      location: fuel,
      geometry: [origin, fuel],
      bannerInstructions: [],
      voiceInstructions: [],
    },
    {
      id: 'trailhead-step',
      instruction: 'Arrive at trailhead',
      distanceM: 5000,
      durationS: 450,
      startDistanceM: 5000,
      endDistanceM: 10000,
      startDurationS: 450,
      endDurationS: 900,
      maneuverType: 'arrive',
      modifier: null,
      roadName: 'Trailhead road',
      location: trailhead,
      geometry: [fuel, trailhead],
      bannerInstructions: [],
      voiceInstructions: [],
    },
  ],
  legs: [
    { id: 'origin-fuel', summary: 'Origin to fuel', distanceM: 5000, durationS: 450, stepStartIndex: 0, stepEndIndex: 1, stepCount: 1 },
    { id: 'fuel-trailhead', summary: 'Fuel to trailhead', distanceM: 5000, durationS: 450, stepStartIndex: 1, stepEndIndex: 2, stepCount: 1 },
  ],
  guidanceMode: 'turn_by_turn',
  bounds: { north: 38.9, south: 38.7, east: -121.1, west: -121.3 },
  createdAt,
};

const tripBuilderRoute = {
  id: 'trip-builder-offline-route',
  name: 'Trip Builder Offline Route',
  source: 'trip_builder',
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [origin.lng, origin.lat],
      [fuel.lng, fuel.lat],
      [trailhead.lng, trailhead.lat],
    ],
  },
};

function manifestItem(manifest, type) {
  const result = manifest.items.find((item) => item.type === type);
  assert.ok(result, `Missing manifest item: ${type}`);
  return result;
}

const fixtureMapAdapter = {
  prepareRouteRegion() {
    return {
      supported: true,
      status: 'ready',
      availability: 'already_cached',
      summary: 'Fixture map region already cached.',
    };
  },
};

const readyInput = {
  route: tripBuilderRoute,
  preparedRoadRoute,
};
const readyManifest = offlinePrepService.buildOfflinePrepPackManifest(readyInput, {
  offlineMapAdapter: fixtureMapAdapter,
});
const readyGuidance = manifestItem(readyManifest, 'road_turn_guidance');
assert.strictEqual(readyGuidance.status, 'ready');
assert.strictEqual(readyGuidance.required, true);
assert.strictEqual(readyGuidance.metadata.guidanceMode, 'turn_by_turn');
assert.strictEqual(readyGuidance.metadata.stepCount, 2);
assert.strictEqual(readyGuidance.metadata.legCount, 2);

const unavailableManifest = offlinePrepService.buildOfflinePrepPackManifest(
  {
    route: tripBuilderRoute,
    preparedRoadRoute: null,
    preparedRoadRouteUnavailableReason: 'Provider turn detail was unavailable.',
  },
  { offlineMapAdapter: fixtureMapAdapter },
);
const unavailableGuidance = manifestItem(unavailableManifest, 'road_turn_guidance');
assert.strictEqual(unavailableGuidance.status, 'unavailable');
assert.strictEqual(unavailableGuidance.required, true);
assert.match(unavailableGuidance.summary, /Provider turn detail was unavailable/);
assert.doesNotMatch(unavailableGuidance.summary, /turn-by-turn.+ready/i);

const geometryOnlyManifest = offlinePrepService.buildOfflinePrepPackManifest(
  {
    route: tripBuilderRoute,
    preparedRoadRoute: {
      ...preparedRoadRoute,
      guidanceMode: 'summary_only',
      steps: [],
      legs: [],
      guidance: {
        ...preparedRoadRoute.guidance,
        guidanceMode: 'summary_only',
        steps: [],
        legs: [],
      },
    },
  },
  { offlineMapAdapter: fixtureMapAdapter },
);
assert.strictEqual(
  manifestItem(geometryOnlyManifest, 'road_turn_guidance').status,
  'unavailable',
  'Geometry without provider maneuvers must not be described as offline turn-by-turn ready.',
);

const handoff = handoffStore.saveOfflinePrepPackHandoff(readyInput, 'trip_builder');
assert.deepStrictEqual(
  handoffStore.loadOfflinePrepPackHandoff().input.preparedRoadRoute.legs,
  preparedRoadRoute.legs,
  'Trip Builder handoff must retain the normalized ordered road legs.',
);
assert.strictEqual(handoff.source, 'trip_builder');

const run = {
  id: 'offline-prep-trip-builder-route',
  user_id: null,
  title: 'Trip Builder Offline Route',
  source: 'offline_prep_pack',
  created_at: createdAt,
  updated_at: createdAt,
  vehicle_id: null,
  build_snapshot: {
    vehicle_name: 'Fixture vehicle',
    vehicle_id: null,
    estimated_range_miles: 300,
    total_weight_lb: 0,
    roof_weight_lb: 0,
    hitch_weight_lb: 0,
    limits: { roof_limit_lb: 0, hitch_limit_lb: 0 },
    captured_at: createdAt,
  },
  stats: {
    distance_m: 10000,
    distance_miles: 6.2,
    distance_km: 10,
    point_count: 3,
    start_lat: 38.7,
    start_lng: -121.3,
    end_lat: 38.9,
    end_lng: -121.1,
    elevation_gain_ft: null,
    elevation_loss_ft: null,
    min_ele_ft: null,
    max_ele_ft: null,
  },
  points: [origin, fuel, trailhead].map((point, idx) => ({
    idx,
    lat: point.lat,
    lng: point.lng,
    ele_m: null,
    time: null,
    type: 'route',
  })),
  waypoints: [],
  is_active: false,
};

const offlineRouteIntent = {
  syncType: 'route',
  origin: {
    mode: 'saved_route_start',
    latitude: origin.lat,
    longitude: origin.lng,
    label: 'Trip origin',
  },
  destination: {
    latitude: trailhead.lat,
    longitude: trailhead.lng,
    label: 'Trip finish',
    source: 'route_geometry',
  },
  routeGeometryPointCount: run.points.length,
  routeSummary: {
    distanceMeters: run.stats.distance_m,
    distanceMiles: run.stats.distance_miles,
    durationSeconds: preparedRoadRoute.durationS,
    primaryName: run.title,
  },
  mapContext: {
    styleKey: 'ecs',
    layerContext: ['route-corridor', 'road-preview', 'offline_prep_pack'],
  },
  readinessSnapshot: {
    offlinePrepManifest: {
      routeId: tripBuilderRoute.id,
    },
  },
  preparedAt: createdAt,
};

(async () => {
  const routeCache = require(routeCachePath);
  const cached = await routeCache.cacheOfflineRoute({
    run,
    routeIdAliases: [tripBuilderRoute.id, preparedRoadRoute.id],
    routeIntent: offlineRouteIntent,
    offlineTileRegionId: 'trip-builder-offline-region',
    offlineTileRegionIds: ['trip-builder-offline-region'],
    tileCacheStatus: 'complete',
    preparedRoadRoute,
    includeRemoteConnectivityCache: false,
  });
  assert.ok(cached.routeIdAliases.includes(tripBuilderRoute.id));
  assert.ok(cached.routeIdAliases.includes(preparedRoadRoute.id));
  assert.strictEqual(cached.roadGuidanceStatus, 'cached_turn_by_turn');
  assert.deepStrictEqual(cached.preparedRoadRoute.geometry, preparedRoadRoute.geometry);
  assert.deepStrictEqual(cached.preparedRoadRoute.steps, preparedRoadRoute.steps);
  assert.deepStrictEqual(cached.preparedRoadRoute.legs, preparedRoadRoute.legs);
  assert.strictEqual(cached.turnCues.length, 2);
  const cachedRunManifest = routeCache.offlineCachedRouteToRunCacheManifest(cached, run);
  assert.strictEqual(cachedRunManifest.road_guidance_status, 'cached_turn_by_turn');
  assert.deepStrictEqual(cachedRunManifest.prepared_road_route.legs, preparedRoadRoute.legs);
  assert.ok(
    deriveOfflineReadiness({ offlineRoute: cached }).readyAssets.includes('guidance instructions'),
    'Validated cached steps and legs should satisfy offline guidance readiness.',
  );
  assert.ok(
    deriveOfflineReadiness({ runCacheManifest: cachedRunManifest }).readyAssets.includes('guidance instructions'),
    'The authoritative run cache projection should retain offline guidance readiness.',
  );
  const routeSpecificReadiness = deriveOfflineReadiness({
    currentRouteContext: {
      routeId: tripBuilderRoute.id,
      destination: trailhead,
      geometry: preparedRoadRoute.geometry,
      mapStyle: 'ecs',
      requiredLayers: ['route-corridor', 'road-preview'],
    },
    downloadedRoutes: [cached],
    tileRegions: [{
      id: 'trip-builder-offline-region',
      status: 'complete',
      sourceType: 'route-corridor',
      syncType: 'route',
      routeId: run.id,
      styleKey: 'ecs',
      downloadedTiles: 40,
      tileCount: 40,
      routeIntent: offlineRouteIntent,
    }],
    tileSyncJobs: [],
    routeSyncHydrated: true,
  });
  assert.strictEqual(routeSpecificReadiness.level, 'ready');
  assert.strictEqual(routeSpecificReadiness.recommendedAction, undefined);

  const cleared = await routeCache.cacheOfflineRoute({
    run,
    preparedRoadRoute: null,
    includeRemoteConnectivityCache: false,
  });
  assert.strictEqual(cleared.roadGuidanceStatus, 'unavailable');
  assert.strictEqual(cleared.preparedRoadRoute, null);
  assert.deepStrictEqual(
    cleared.turnCues,
    [],
    'Explicitly unavailable guidance must not retain stale turn cues.',
  );
  const clearedRunManifest = routeCache.offlineCachedRouteToRunCacheManifest(cleared, run);
  assert.strictEqual(clearedRunManifest.road_guidance_status, 'unavailable');
  assert.strictEqual(clearedRunManifest.prepared_road_route, null);
  assert.ok(
    deriveOfflineReadiness({ offlineRoute: cleared }).missingAssets.includes('guidance instructions'),
    'Geometry-only cache state must report missing guidance instructions.',
  );
  assert.ok(
    deriveOfflineReadiness({ runCacheManifest: clearedRunManifest }).missingAssets.includes('guidance instructions'),
    'Geometry-only run cache state must not claim full offline guidance.',
  );

  await routeCache.cacheOfflineRoute({
    run,
    preparedRoadRoute,
    includeRemoteConnectivityCache: false,
  });

  const serialized = JSON.parse(storage.get('ecs_offline_cached_routes_v1'));
  assert.deepStrictEqual(serialized[0].preparedRoadRoute.legs, preparedRoadRoute.legs);

  delete require.cache[require.resolve(routeCachePath)];
  const restoredCache = require(routeCachePath);
  const restored = (await restoredCache.listOfflineCachedRoutes())[0];
  const restoredPrepared = restoredCache.getOfflineCachedPreparedRoadRoute(restored);
  assert.ok(restoredPrepared, 'A persisted prepared road route should restore from the canonical offline cache.');
  assert.deepStrictEqual(restoredPrepared.geometry, preparedRoadRoute.geometry);
  assert.deepStrictEqual(restoredPrepared.steps, preparedRoadRoute.steps);
  assert.deepStrictEqual(restoredPrepared.legs, preparedRoadRoute.legs);

  serialized[0].preparedRoadRoute.guidanceMode = 'summary_only';
  serialized[0].preparedRoadRoute.steps = [];
  serialized[0].preparedRoadRoute.legs = [];
  storage.set('ecs_offline_cached_routes_v1', JSON.stringify(serialized));
  delete require.cache[require.resolve(routeCachePath)];
  const degradedCache = require(routeCachePath);
  const degraded = (await degradedCache.listOfflineCachedRoutes())[0];
  assert.strictEqual(degraded.preparedRoadRoute, null);
  assert.strictEqual(degraded.roadGuidanceStatus, 'unavailable');

  const navigateSource = fs.readFileSync(
    path.join(root, 'app', '(tabs)', 'navigate.tsx'),
    'utf8',
  );
  assert.ok(
    navigateSource.includes('const preparedRoadRoute = getOfflineCachedPreparedRoadRoute(route);'),
    'Navigate offline restore must consume the canonical cached prepared route.',
  );
  assert.ok(
    navigateSource.includes('OFFLINE ROUTE LINE LOADED - TURN-BY-TURN WAS NOT CACHED'),
    'Navigate must explain geometry-only offline restoration truthfully.',
  );

  console.log('Trip Builder offline prepared-guidance regression passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'node' } };
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

const { buildTripPlan } = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderService.ts'));
const {
  buildOfflinePrepPack,
  buildOfflinePrepPackManifest,
  buildOfflinePrepRouteBounds,
  getOfflinePrepRouteCoordinates,
} = require(path.join(root, 'lib', 'offlinePrepPack', 'offlinePrepPackService.ts'));
const {
  mergeExplorePlanningRoute,
  upsertExplorePlanningRoute,
} = require(path.join(root, 'lib', 'explore', 'explorePlanningRouteContextStore.ts'));

const route = {
  id: 'offline-prep-route',
  name: 'Offline Prep Route',
  region: 'Test Range',
  source: 'suggested_routes',
  distanceMiles: 44,
  estimatedTravelHours: 4.5,
  remotenessScore: 6,
  startLat: 38,
  startLng: -110,
  destinationCoordinate: { latitude: 38.42, longitude: -109.72 },
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-110, 38],
      [-109.94, 38.12],
      [-109.86, 38.28],
      [-109.72, 38.42],
    ],
  },
  waypoints: [
    { id: 'fuel-start', name: 'Known fuel', waypointType: 'fuel', lat: 38.02, lon: -109.98, routeMileMarker: 2 },
    { id: 'viewpoint', name: 'Overlook', waypointType: 'scenic', lat: 38.22, lon: -109.88, routeMileMarker: 18 },
  ],
};

const unsupportedMapAdapter = {
  prepareRouteRegion() {
    return {
      supported: false,
      status: 'unavailable',
      availability: 'unavailable',
      summary: 'Offline map adapter is not installed in this runtime.',
      error: 'Offline map support unavailable.',
    };
  },
};

const cachedMapAdapter = {
  prepareRouteRegion({ bounds }) {
    return {
      supported: true,
      status: 'ready',
      availability: 'already_cached',
      summary: 'Offline map region is already cached.',
      estimatedSizeMB: 18,
      cacheKey: 'region-offline-prep-route',
      metadata: { bounds },
    };
  },
};

const pendingMapAdapter = {
  prepareRouteRegion({ bounds }) {
    return {
      supported: true,
      status: 'not_started',
      availability: 'pending_download',
      summary: 'Offline map download is available but has not been started.',
      estimatedSizeMB: 18,
      metadata: { bounds },
    };
  },
};

function itemByType(manifest, type) {
  const found = manifest.items.find((entry) => entry.type === type);
  assert.ok(found, `Expected manifest item ${type}.`);
  return found;
}

const routeOnlyManifest = buildOfflinePrepPackManifest(
  { route, capturedAt: '2026-05-18T12:00:00.000Z' },
  { offlineMapAdapter: unsupportedMapAdapter },
);

assert.strictEqual(routeOnlyManifest.routeId, route.id);
assert.strictEqual(itemByType(routeOnlyManifest, 'route_line').status, 'ready');
assert.strictEqual(itemByType(routeOnlyManifest, 'waypoints').count, 2);
assert.strictEqual(itemByType(routeOnlyManifest, 'gpx_export').status, 'ready');
assert.strictEqual(itemByType(routeOnlyManifest, 'trip_itinerary').status, 'unavailable');
assert.strictEqual(itemByType(routeOnlyManifest, 'offline_map').status, 'unavailable');
assert.strictEqual(itemByType(routeOnlyManifest, 'campsites').label, 'Campsites and Emergency Points');
assert.strictEqual(itemByType(routeOnlyManifest, 'campsites').status, 'ready');
assert.strictEqual(itemByType(routeOnlyManifest, 'campsites').availability, 'not_set');
assert.ok(!routeOnlyManifest.items.some((entry) => entry.type === 'emergency_points'), 'Emergency support points should be merged into campsites instead of rendered as a separate requirement.');
assert.strictEqual(routeOnlyManifest.progress.status, 'partially_ready');
assert.ok(routeOnlyManifest.errors.some((error) => error.itemType === 'offline_map'));

const bounds = buildOfflinePrepRouteBounds(route);
assert.ok(bounds, 'Route bounds should be generated for a route with geometry.');
assert.ok(bounds.minLat < 38 && bounds.maxLat > 38.42, 'Bounds should include a corridor around latitude.');
assert.ok(bounds.minLng < -110 && bounds.maxLng > -109.72, 'Bounds should include a corridor around longitude.');
assert.ok(bounds.corridorMiles > 0, 'Bounds should record the route corridor.');

const wideBoundsRoute = {
  id: 'wide-route',
  name: 'Wide Route',
  routeGeometry: {
    type: 'LineString',
    coordinates: [
      [-116, 36],
      [-112, 40],
      [-108, 44],
    ],
  },
  routeMetadata: {
    offlinePrepPrepared: true,
    offlinePrepGeometrySource: 'trip_builder_selected_route_preview',
  },
};
const wideBoundsManifest = buildOfflinePrepPackManifest({ route: wideBoundsRoute });
const wideOfflineMap = itemByType(wideBoundsManifest, 'offline_map');
assert.strictEqual(
  wideOfflineMap.status,
  'failed',
  'Large selected-route corridors should mark the full-route map as failed with a recoverable segment fallback.',
);
assert.strictEqual(
  wideOfflineMap.availability,
  'failed',
  'Large selected-route corridors should not pretend the full route map can fit automatic prep.',
);
assert.ok(
  wideBoundsManifest.errors.some((error) => /too large for automatic offline prep/i.test(error.message)),
  'Large selected-route corridors should explain the full-route map limit.',
);
const wideCriticalSegments = itemByType(wideBoundsManifest, 'critical_offline_segments');
assert.strictEqual(
  wideCriticalSegments.availability,
  'pending_download',
  'Large selected-route corridors should offer low-signal segment downloads as the fallback.',
);
assert.ok(
  wideCriticalSegments.count > 0 && wideCriticalSegments.count <= 5,
  'Low-signal segment fallback should expose a bounded number of critical map segments.',
);
assert.ok(
  wideCriticalSegments.estimatedSizeMB > 0,
  'Low-signal segment fallback should estimate a smaller download size.',
);

const geometryOnlyRoute = {
  id: 'geometry-field-route',
  name: 'Geometry Field Route',
  geometry: {
    type: 'LineString',
    coordinates: [
      [-110.2, 38.1],
      [-110.1, 38.2],
      [-110.0, 38.3],
    ],
  },
};
assert.strictEqual(
  getOfflinePrepRouteCoordinates(geometryOnlyRoute).length,
  3,
  'Offline Prep should read route geometry from the common geometry field.',
);

const metadataGeometryRoute = {
  id: 'metadata-geometry-route',
  name: 'Metadata Geometry Route',
  routeMetadata: {
    route_geometry: [
      { lat: 38.1, lng: -110.2 },
      { lat: 38.2, lng: -110.1 },
    ],
  },
};
assert.strictEqual(
  getOfflinePrepRouteCoordinates(metadataGeometryRoute).length,
  2,
  'Offline Prep should recover route geometry from routeMetadata/route_metadata payloads.',
);

const metadataEndpointRoute = {
  id: 'metadata-endpoint-route',
  name: 'Metadata Endpoint Route',
  startLat: 38.1,
  startLng: -110.2,
  routeMetadata: {
    destinationCoordinate: { lat: 38.6, lng: -109.7 },
  },
};
assert.strictEqual(
  getOfflinePrepRouteCoordinates(metadataEndpointRoute).length,
  2,
  'Offline Prep should recover a prep-ready route line from route metadata endpoints.',
);

const navigationPayloadRoute = {
  id: 'navigation-payload-route',
  name: 'Navigation Payload Route',
  navigationPayload: {
    trailGeometry: [
      { lat: 38.1, lng: -110.2 },
      { lat: 38.2, lng: -110.1 },
      { lat: 38.3, lng: -110.0 },
    ],
  },
};
assert.strictEqual(
  getOfflinePrepRouteCoordinates(navigationPayloadRoute).length,
  3,
  'Offline Prep should read route geometry from Explore/Navigate navigation payloads.',
);

const richHandoffRoute = {
  id: 'preserve-route',
  name: 'Preserve Route',
  routeGeometry: [
    { latitude: 38.1, longitude: -110.2 },
    { latitude: 38.2, longitude: -110.1 },
    { latitude: 38.3, longitude: -110.0 },
  ],
  routeMetadata: { source: 'handoff' },
};
const lightContextRoute = {
  id: 'preserve-route',
  name: 'Preserve Route',
  region: 'Context Region',
  routeMetadata: { refinement: 'context' },
};
const mergedRoute = mergeExplorePlanningRoute(richHandoffRoute, lightContextRoute);
assert.strictEqual(
  getOfflinePrepRouteCoordinates(mergedRoute).length,
  3,
  'Explore planning route merges should preserve richer handoff geometry.',
);
assert.strictEqual(mergedRoute.region, 'Context Region');
assert.strictEqual(mergedRoute.routeMetadata.source, 'handoff');
assert.strictEqual(mergedRoute.routeMetadata.refinement, 'context');

const routeMap = new Map();
upsertExplorePlanningRoute(routeMap, richHandoffRoute);
upsertExplorePlanningRoute(routeMap, lightContextRoute);
assert.strictEqual(
  getOfflinePrepRouteCoordinates(routeMap.get('preserve-route')).length,
  3,
  'Route context upsert should not replace a geometry-ready route with a metadata-only route.',
);

const campsiteCandidates = [
  {
    id: 'camp-1',
    name: 'Bench Camp',
    location: { latitude: 38.31, longitude: -109.84 },
    routeMileMarker: 31,
    score: 76,
    legalConfidence: 'medium',
    accessConfidence: 'medium',
    source: 'campops_candidate',
  },
];

const exitPoints = [
  {
    id: 'exit-1',
    name: 'Paved bailout',
    type: 'pavement',
    location: { latitude: 38.35, longitude: -109.78 },
    routeMileMarker: 36,
    distanceFromRouteMiles: 3.5,
    priority: 10,
    source: 'route_exit_store',
  },
];

const vehicleProfile = {
  id: 'vehicle-1',
  label: 'Test Vehicle',
  vehicleType: 'pickup',
  rangeMiles: 260,
  payloadRemainingLbs: 900,
  confidence: 'medium',
};

const tripPlan = buildTripPlan({
  route,
  input: {
    tripType: 'overnight_camping',
    timeWindow: 'overnight',
    groupType: 'two_vehicle',
    priorities: ['camping', 'low_risk'],
  },
  vehicleProfile,
  campsiteCandidates,
  exitPoints,
  capturedAt: '2026-05-18T12:00:00.000Z',
});

const tripManifest = buildOfflinePrepPackManifest(
  { route, tripPlan, vehicleProfile, campsiteCandidates, exitPoints, capturedAt: '2026-05-18T12:00:00.000Z' },
  { offlineMapAdapter: pendingMapAdapter },
);

assert.strictEqual(itemByType(tripManifest, 'offline_map').availability, 'pending_download');
assert.notStrictEqual(itemByType(tripManifest, 'offline_map').status, 'ready', 'Pending map downloads must not be marked ready.');
assert.strictEqual(itemByType(tripManifest, 'trip_itinerary').status, 'ready');
assert.strictEqual(itemByType(tripManifest, 'trip_sheet').status, 'ready');
assert.ok(itemByType(tripManifest, 'campsites').count >= 1, 'Trip manifest should include camp candidates from TripPlan/input.');
assert.ok(itemByType(tripManifest, 'exit_points').count >= 1, 'Trip manifest should include bailout points from TripPlan/input.');

const tripPlanOnlyRouteManifest = buildOfflinePrepPackManifest(
  {
    route: { id: 'plan-only-route', name: 'Plan Only Route' },
    tripPlan,
    capturedAt: '2026-05-18T12:00:00.000Z',
  },
  { offlineMapAdapter: pendingMapAdapter },
);

assert.strictEqual(
  itemByType(tripPlanOnlyRouteManifest, 'route_line').status,
  'ready',
  'Offline Prep route line should be ready when Trip Builder itinerary coordinates can draw the route preview.',
);

const smartManifest = buildOfflinePrepPackManifest(
  { route, tripPlan, smartResupplyPlan: tripPlan.smartResupplyPlan, vehicleProfile, campsiteCandidates, exitPoints },
  { offlineMapAdapter: cachedMapAdapter },
);

assert.strictEqual(itemByType(smartManifest, 'offline_map').status, 'ready');
assert.strictEqual(itemByType(smartManifest, 'offline_map').availability, 'already_cached');
assert.strictEqual(itemByType(smartManifest, 'smart_resupply_summary').status, 'ready');
assert.ok(itemByType(smartManifest, 'resupply_points').count >= 1, 'Smart Resupply points should flow into the pack manifest.');

const weatherManifest = buildOfflinePrepPackManifest(
  {
    route,
    tripPlan,
    smartResupplyPlan: tripPlan.smartResupplyPlan,
    vehicleProfile,
    weatherSnapshot: {
      source: 'ecs_route_weather',
      coordinateCount: 3,
      snapshots: [{ label: 'Route start', current: { temp: 72, condition: 'Clear' } }],
    },
  },
  { offlineMapAdapter: cachedMapAdapter },
);

assert.strictEqual(itemByType(weatherManifest, 'weather_snapshot').status, 'ready');
assert.strictEqual(itemByType(weatherManifest, 'weather_snapshot').availability, 'available');

const pack = buildOfflinePrepPack(
  { route, tripPlan, smartResupplyPlan: tripPlan.smartResupplyPlan, vehicleProfile },
  { offlineMapAdapter: cachedMapAdapter },
);
assert.strictEqual(pack.id, smartManifest.id);
assert.strictEqual(pack.status, pack.manifest.progress.status);

const missingGeometryManifest = buildOfflinePrepPackManifest(
  { route: { id: 'missing-geometry', name: 'Missing Geometry' } },
  { offlineMapAdapter: unsupportedMapAdapter },
);

assert.strictEqual(itemByType(missingGeometryManifest, 'route_line').status, 'unavailable');
assert.strictEqual(itemByType(missingGeometryManifest, 'gpx_export').status, 'unavailable');
assert.ok(missingGeometryManifest.errors.some((error) => error.itemType === 'route_line'));
assert.ok(missingGeometryManifest.errors.some((error) => error.itemType === 'gpx_export'));

console.log('Offline Prep Pack core tests passed.');

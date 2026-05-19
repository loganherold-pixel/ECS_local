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

const { buildTripPlan } = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderService.ts'));
const {
  buildOfflinePrepPack,
  buildOfflinePrepPackManifest,
  buildOfflinePrepRouteBounds,
} = require(path.join(root, 'lib', 'offlinePrepPack', 'offlinePrepPackService.ts'));

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
assert.strictEqual(routeOnlyManifest.progress.status, 'partially_ready');
assert.ok(routeOnlyManifest.errors.some((error) => error.itemType === 'offline_map'));

const bounds = buildOfflinePrepRouteBounds(route);
assert.ok(bounds, 'Route bounds should be generated for a route with geometry.');
assert.ok(bounds.minLat < 38 && bounds.maxLat > 38.42, 'Bounds should include a corridor around latitude.');
assert.ok(bounds.minLng < -110 && bounds.maxLng > -109.72, 'Bounds should include a corridor around longitude.');
assert.ok(bounds.corridorMiles > 0, 'Bounds should record the route corridor.');

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

const smartManifest = buildOfflinePrepPackManifest(
  { route, tripPlan, smartResupplyPlan: tripPlan.smartResupplyPlan, vehicleProfile, campsiteCandidates, exitPoints },
  { offlineMapAdapter: cachedMapAdapter },
);

assert.strictEqual(itemByType(smartManifest, 'offline_map').status, 'ready');
assert.strictEqual(itemByType(smartManifest, 'offline_map').availability, 'already_cached');
assert.strictEqual(itemByType(smartManifest, 'smart_resupply_summary').status, 'ready');
assert.ok(itemByType(smartManifest, 'resupply_points').count >= 1, 'Smart Resupply points should flow into the pack manifest.');

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

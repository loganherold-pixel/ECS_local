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

const {
  buildOfflinePrepPackManifest,
  generateOfflinePrepPackFromItinerary,
  getOfflinePrepPackRouteCoordinates,
} = require(path.join(root, 'lib', 'offlinePrepPack', 'offlinePrepPackService.ts'));

function source(label, state = 'live') {
  return { label, state, source: label };
}

function route(id, phase, geometry) {
  return {
    id,
    phase,
    title: id,
    geometry,
    segments: [],
    source: source(`${id}_source`),
    confidence: 'high',
    distanceMiles: geometry.length,
  };
}

function waypoint(id, type, coordinate, extra = {}) {
  return {
    id,
    type,
    phase: type === 'trailhead_start' ? 'trailhead' : type === 'exit' ? 'trail_exit' : 'trail_navigation',
    title: id,
    description: `${id} description`,
    coordinate,
    sequence: extra.sequence ?? 1,
    source: source(extra.source ?? 'fixture_waypoint'),
    confidence: extra.confidence ?? 'medium',
    confidenceScore: extra.confidenceScore ?? 0.7,
    isUserAdded: extra.isUserAdded ?? false,
    isEcsSuggested: extra.isEcsSuggested ?? true,
    metadata: extra.metadata ?? { fixture: true },
  };
}

function itemByType(manifest, type) {
  const found = manifest.items.find((entry) => entry.type === type);
  assert.ok(found, `Expected manifest item ${type}.`);
  return found;
}

const trailhead = waypoint('trailhead-1', 'trailhead_start', { latitude: 38.1, longitude: -110.1 }, {
  confidence: 'high',
  confidenceScore: 0.92,
});
const trailEnd = waypoint('trail-end-1', 'trail_end', { latitude: 38.35, longitude: -109.88 }, {
  confidence: 'high',
  confidenceScore: 0.9,
});
const bailout = waypoint('bailout-1', 'bailout', { latitude: 38.22, longitude: -109.95 }, {
  confidence: 'medium',
  confidenceScore: 0.66,
  metadata: { bailoutRouteConfidence: { status: 'likely', score: 0.62 } },
});
const scenic = waypoint('scenic-1', 'scenic_stop', { latitude: 38.24, longitude: -109.93 }, {
  confidence: 'medium',
  confidenceScore: 0.7,
});
const fuelStop = {
  ...waypoint('fuel-stop-1', 'fuel', { latitude: 38.05, longitude: -110.2 }, {
    source: 'provider_fuel_candidate',
    confidence: 'medium',
    confidenceScore: 0.74,
  }),
  phase: 'pre_trail_resupply',
  sequence: 1,
  plannedDay: 1,
  stopRole: 'pre_trail_resupply',
};

const fullItinerary = {
  id: 'itinerary-full',
  sourceRouteId: 'route-full',
  title: 'Full Offline Itinerary',
  status: 'ready',
  createdAt: '2026-05-30T12:00:00.000Z',
  updatedAt: '2026-05-30T12:05:00.000Z',
  userStart: { latitude: 38, longitude: -110.3 },
  approachRoute: route('approach-route', 'approach', [
    { latitude: 38, longitude: -110.3 },
    { latitude: 38.05, longitude: -110.2 },
    { latitude: 38.1, longitude: -110.1 },
  ]),
  preTrailStops: {
    fuel: [fuelStop],
    grocery: [],
    water: [],
    generalSupply: [],
  },
  preTrailStopStatus: [],
  trailheadStart: trailhead,
  trailheadStartCandidate: {
    coordinate: trailhead.coordinate,
    name: 'Fixture Trailhead',
    confidenceScore: 0.92,
    confidence: 'high',
    source: source('fixture_trailhead'),
    warnings: [],
    isConfirmedTrailhead: true,
    status: 'confirmed',
  },
  trailRoute: route('trail-route', 'trail_navigation', [
    { latitude: 38.1, longitude: -110.1 },
    { latitude: 38.2, longitude: -110 },
    { latitude: 38.35, longitude: -109.88 },
  ]),
  routeGeometryStatus: 'trail_available',
  trailEnd,
  exitRoute: route('exit-route', 'trail_exit', [
    { latitude: 38.35, longitude: -109.88 },
    { latitude: 38.43, longitude: -109.8 },
  ]),
  exitEnd: { latitude: 38.43, longitude: -109.8 },
  trailWaypoints: [bailout, scenic],
  phases: ['approach', 'pre_trail_resupply', 'trailhead', 'trail_navigation', 'trail_exit'],
  phaseSummaries: [],
  stops: [fuelStop],
  waypoints: [trailhead, bailout, scenic, trailEnd],
  segments: [],
  confidence: {
    overall: 'high',
    routeGeometry: 'high',
    routeGeometryStatus: 'trail_available',
    trailhead: 'high',
    trailWaypoints: 'medium',
    missingData: [],
  },
  dataUsed: [source('fixture_itinerary')],
  warnings: [],
  notes: [],
  metadata: { fixture: true },
};

const cachedMapAdapter = {
  prepareRouteRegion({ bounds, routePointCount }) {
    return {
      supported: true,
      status: 'ready',
      availability: 'already_cached',
      summary: 'Offline map region is already cached.',
      estimatedSizeMB: 22,
      cacheKey: 'cached-itinerary-region',
      metadata: { bounds, routePointCount },
    };
  },
};

const weatherSnapshot = {
  source: 'ecs_route_weather',
  generatedAt: '2026-05-30T12:10:00.000Z',
  snapshots: [{ label: 'Trailhead', current: { temp: 70, condition: 'Clear' } }],
};
const remotenessSnapshot = { source: 'remoteness_route_forecast', peakScore: 72 };
const sunlightWindow = { source: 'sunlight_provider', sunrise: '2026-05-30T12:00:00.000Z', sunset: '2026-05-31T03:00:00.000Z' };
const elevationSnapshot = { source: 'mapbox_terrain', minFeet: 4200, maxFeet: 6100 };

const fullPack = generateOfflinePrepPackFromItinerary(
  {
    itinerary: fullItinerary,
    weatherSnapshot,
    remotenessSnapshot,
    sunlightWindow,
    elevationSnapshot,
    emergencyNotes: ['Call county sheriff if overdue by 8 hours.'],
    capturedAt: '2026-05-30T12:15:00.000Z',
  },
  { offlineMapAdapter: cachedMapAdapter },
);
const fullManifest = fullPack.manifest;

assert.strictEqual(fullPack.status, fullManifest.progress.status);
assert.strictEqual(itemByType(fullManifest, 'offline_map').availability, 'already_cached');
assert.strictEqual(itemByType(fullManifest, 'approach_route').status, 'ready');
assert.strictEqual(itemByType(fullManifest, 'trailhead').status, 'ready');
assert.strictEqual(itemByType(fullManifest, 'trail_route').status, 'ready');
assert.strictEqual(itemByType(fullManifest, 'trail_waypoints').count, 2);
assert.strictEqual(itemByType(fullManifest, 'bailout_points').count, 1);
assert.strictEqual(itemByType(fullManifest, 'pre_trail_stops').count, 1);
assert.strictEqual(itemByType(fullManifest, 'trail_end').status, 'ready');
assert.strictEqual(itemByType(fullManifest, 'exit_route').status, 'ready');
assert.strictEqual(itemByType(fullManifest, 'weather_snapshot').status, 'ready');
assert.strictEqual(itemByType(fullManifest, 'remoteness_snapshot').status, 'ready');
assert.strictEqual(itemByType(fullManifest, 'sunlight_window').status, 'ready');
assert.strictEqual(itemByType(fullManifest, 'elevation_snapshot').status, 'ready');
assert.strictEqual(itemByType(fullManifest, 'emergency_notes').count, 1);
assert.strictEqual(itemByType(fullManifest, 'missing_data_warnings').count, 0);
assert.strictEqual(itemByType(fullManifest, 'gpx_export').status, 'ready');
assert.strictEqual(
  getOfflinePrepPackRouteCoordinates({ route: { id: 'approach-only' }, itinerary: fullItinerary }).length,
  6,
  'Offline Prep route cache helpers should prefer completed TripItinerary geometry when it is provided.',
);

const missingTrailPack = generateOfflinePrepPackFromItinerary({
  itinerary: {
    ...fullItinerary,
    id: 'itinerary-missing-trail',
    title: 'Missing Trail Geometry',
    trailRoute: null,
    routeGeometryStatus: 'trail_missing',
    trailWaypoints: [],
    waypoints: [trailhead, trailEnd],
    confidence: {
      ...fullItinerary.confidence,
      routeGeometry: 'low',
      routeGeometryStatus: 'trail_missing',
      trailWaypoints: 'unknown',
      missingData: ['Trail route intelligence is incomplete.'],
    },
  },
  weatherSnapshot,
  remotenessSnapshot,
  sunlightWindow,
  elevationSnapshot,
}, { offlineMapAdapter: cachedMapAdapter });
const missingTrailManifest = missingTrailPack.manifest;
assert.strictEqual(itemByType(missingTrailManifest, 'trail_route').status, 'unavailable');
assert.strictEqual(itemByType(missingTrailManifest, 'trail_route').availability, 'unavailable');
assert.ok(
  missingTrailManifest.errors.some((error) => error.id === 'itinerary-trail-route-missing'),
  'Missing trail geometry should be a preserved manifest error.',
);
assert.strictEqual(itemByType(missingTrailManifest, 'offline_map').metadata.trailGeometryIncluded, false);
assert.ok(
  itemByType(missingTrailManifest, 'missing_data_warnings').metadata.warnings.some((warning) => /trail route geometry/i.test(warning)),
  'Missing trail geometry should be visible in warnings.',
);

const missingWeatherPack = generateOfflinePrepPackFromItinerary({
  itinerary: fullItinerary,
  remotenessSnapshot,
  sunlightWindow,
  elevationSnapshot,
}, { offlineMapAdapter: cachedMapAdapter });
assert.strictEqual(itemByType(missingWeatherPack.manifest, 'weather_snapshot').status, 'unavailable');
assert.ok(
  itemByType(missingWeatherPack.manifest, 'missing_data_warnings').metadata.warnings.some((warning) => /weather snapshot/i.test(warning)),
  'Missing weather should be explicit.',
);

const missingWaypointPack = generateOfflinePrepPackFromItinerary({
  itinerary: {
    ...fullItinerary,
    id: 'itinerary-no-waypoints',
    trailWaypoints: [],
    waypoints: [trailhead, trailEnd],
  },
  weatherSnapshot,
  remotenessSnapshot,
  sunlightWindow,
  elevationSnapshot,
}, { offlineMapAdapter: cachedMapAdapter });
assert.strictEqual(itemByType(missingWaypointPack.manifest, 'trail_waypoints').status, 'unavailable');
assert.strictEqual(itemByType(missingWaypointPack.manifest, 'trail_waypoints').metadata.waypoints.length, 0);
assert.strictEqual(itemByType(missingWaypointPack.manifest, 'bailout_points').status, 'unavailable');

const manifestFromLegacyEntryPoint = buildOfflinePrepPackManifest(
  {
    route: { id: 'legacy-route', name: 'Legacy Route' },
    itinerary: fullItinerary,
    weatherSnapshot,
    remotenessSnapshot,
    sunlightWindow,
    elevationSnapshot,
  },
  { offlineMapAdapter: cachedMapAdapter },
);
assert.strictEqual(itemByType(manifestFromLegacyEntryPoint, 'approach_route').status, 'ready');
assert.strictEqual(
  manifestFromLegacyEntryPoint.routeId,
  fullItinerary.sourceRouteId,
  'Offline Prep manifest should be generated from TripItinerary when provided.',
);

console.log('Offline Prep Pack itinerary tests passed.');

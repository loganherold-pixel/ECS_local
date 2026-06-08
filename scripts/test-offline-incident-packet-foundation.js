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

const {
  buildActiveTripModeSnapshot,
  createActiveTripModeStore,
} = require(path.join(root, 'lib', 'activeTripMode.ts'));
const {
  OFFLINE_INCIDENT_PACKET_STORAGE_KEY,
  buildOfflineIncidentPacketFromActiveTrip,
  createOfflineIncidentPacketStore,
} = require(path.join(root, 'lib', 'offlineIncidentPacket.ts'));
const { evaluateRouteConfidence } = require(path.join(root, 'lib', 'routeConfidenceEngine.ts'));
const {
  getPrimaryTabForPath,
  getRestorableShellRouteForPath,
} = require(path.join(root, 'lib', 'routeManifest.ts'));

const pointA = { latitude: 39.81619, longitude: -121.24855 };
const pointB = { latitude: 39.91, longitude: -121.31 };
const source = { label: 'fixture', state: 'cached' };

function waypoint(id, type, coordinate = pointA) {
  return {
    id,
    type,
    phase: type === 'trailhead_start' ? 'trailhead' : 'trail_navigation',
    title: id,
    coordinate,
    source,
    confidence: 'high',
  };
}

function routeSegment(id, phase, geometry = [pointA, pointB]) {
  return {
    id,
    phase,
    sequence: 1,
    title: id,
    geometry,
    segments: [],
    source,
    confidence: 'high',
    distanceMiles: 24.7,
  };
}

function stop(id, type, coordinate = pointA) {
  return {
    ...waypoint(id, type, coordinate),
    phase: 'pre_trail_resupply',
    sequence: 1,
    plannedDay: 1,
    stopRole: 'pre_trail_resupply',
  };
}

function itinerary(overrides = {}) {
  const fuel = Object.prototype.hasOwnProperty.call(overrides, 'fuelStops')
    ? overrides.fuelStops
    : [stop('fuel-near-trailhead', 'fuel')];

  return {
    id: 'trip-itinerary-fixture',
    sourceRouteId: 'route-coldwater',
    routeId: 'route-coldwater',
    suggestedRouteId: 'route-coldwater',
    title: 'FR 23N18 Coldwater',
    status: 'draft',
    createdAt: '2026-06-08T12:00:00.000Z',
    updatedAt: '2026-06-08T12:00:00.000Z',
    userStart: pointA,
    approachRoute: routeSegment('approach-route', 'approach'),
    preTrailStops: {
      fuel,
      grocery: [],
      water: [],
      generalSupply: [],
    },
    preTrailStopStatus: [
      { bucket: 'fuel', status: fuel.length ? 'selected' : 'not_requested', anchorCoordinate: pointA, stopCount: fuel.length },
      { bucket: 'grocery', status: 'not_requested', anchorCoordinate: pointA, stopCount: 0 },
      { bucket: 'water', status: 'not_requested', anchorCoordinate: pointA, stopCount: 0 },
      { bucket: 'generalSupply', status: 'not_requested', anchorCoordinate: pointA, stopCount: 0 },
    ],
    fuelRangeConfidence: {
      estimatedTotalDistance: 142,
      estimatedTrailDistance: 24.7,
      knownFuelRange: 260,
      estimatedFuelRemaining: 220,
      fuelStatus: 'sufficient',
      confidenceScore: 0.8,
      warnings: [],
      preTrailFuelStopCount: fuel.length,
    },
    trailheadStart: waypoint('trailhead', 'trailhead_start'),
    trailRoute: null,
    routeGeometryStatus: 'approach_only',
    trailEnd: waypoint('trail-end', 'trail_end', pointB),
    exitRoute: null,
    exitEnd: null,
    trailWaypoints: [waypoint('bailout', 'bailout')],
    phases: ['approach', 'pre_trail_resupply', 'trailhead', 'trail_navigation', 'trail_exit'],
    phaseSummaries: [],
    stops: [],
    waypoints: [],
    segments: [],
    confidence: {
      overall: 'medium',
      routeGeometry: 'unknown',
      routeGeometryStatus: 'approach_only',
      trailhead: 'high',
      resupply: 'unknown',
      trailWaypoints: 'medium',
      exitRoute: 'unknown',
      reasons: [],
      missingData: [],
    },
    dataUsed: [],
    warnings: [],
    metadata: {},
    ...overrides,
  };
}

const selectedRoute = {
  id: 'route-coldwater',
  name: 'FR 23N18 Coldwater',
  distanceMiles: 24.742,
  startLat: pointA.latitude,
  startLng: pointA.longitude,
  routeMetadata: {
    routeTypeStatus: 'unknown',
    routeAuthorityLabel: 'Unknown Route Authority',
    geometrySource: 'approach_guidance',
  },
};

const vehicleProfile = {
  id: 'rig-overlander',
  label: 'Overlander',
  vehicleType: 'truck',
  rangeMiles: 260,
  rangeSource: 'manual',
  fuelTankCapacityGal: 31,
  avgMpg: 13,
  confidence: 'medium',
  source: 'fleet_profile',
};

function baseInput(overrides = {}) {
  return {
    itinerary: overrides.itinerary ?? itinerary(),
    selectedRoute: overrides.selectedRoute ?? selectedRoute,
    vehicleProfile: Object.prototype.hasOwnProperty.call(overrides, 'vehicleProfile')
      ? overrides.vehicleProfile
      : vehicleProfile,
    plan: overrides.plan ?? {
      primaryCampCandidate: null,
      primaryExitPoint: { id: 'route-derived-bailout', name: 'Route-derived bailout', source: 'route_derived' },
    },
    environment: overrides.environment ?? {
      weather: { status: 'unknown', label: 'Weather unavailable' },
      daylight: { status: 'unknown', label: 'Daylight unknown' },
      remoteness: { status: 'unknown', label: 'Remoteness unknown' },
    },
    telemetry: overrides.telemetry ?? { status: 'unavailable', label: 'Telemetry unavailable' },
  };
}

function createMemoryStorage(seed = {}) {
  const state = { ...seed };
  return {
    get(key) {
      return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : null;
    },
    set(key, value) {
      state[key] = value;
    },
    delete(key) {
      delete state[key];
    },
    clear() {
      Object.keys(state).forEach((key) => delete state[key]);
    },
    flush() {
      return Promise.resolve();
    },
    waitForHydration() {
      return Promise.resolve();
    },
    isHydrated() {
      return true;
    },
    dump() {
      return { ...state };
    },
  };
}

const routeConfidence = evaluateRouteConfidence(baseInput());
const activeTrip = buildActiveTripModeSnapshot({
  ...baseInput(),
  routeConfidence,
  lastKnownLocation: { latitude: 39.82, longitude: -121.25 },
  now: '2026-06-08T17:00:00.000Z',
});

const packet = buildOfflineIncidentPacketFromActiveTrip(activeTrip, '2026-06-08T17:01:00.000Z');
assert.strictEqual(packet.status, 'active');
assert.strictEqual(packet.activeTripId, activeTrip.activeTripId);
assert.strictEqual(packet.sourceItineraryId, 'trip-itinerary-fixture');
assert.strictEqual(packet.route.id, 'route-coldwater');
assert.strictEqual(packet.route.name, 'FR 23N18 Coldwater');
assert.strictEqual(packet.route.authorityStatus, activeTrip.route.authorityStatus);
assert.strictEqual(packet.route.geometryStatus, activeTrip.route.geometryStatus);
assert.deepStrictEqual(packet.route.trailheadCoordinate, pointA);
assert.strictEqual(packet.vehicle.label, 'Overlander');
assert.strictEqual(packet.confidence.category, routeConfidence.category);
assert.strictEqual(packet.confidence.score, routeConfidence.score);
assert.ok(packet.keyWarnings.includes('Weather unavailable'), 'Key warnings should remain visible.');
assert.strictEqual(packet.logistics.refuel.status, 'selected');
assert.strictEqual(packet.logistics.resupply.status, 'not_requested');
assert.strictEqual(packet.logistics.camp.status, 'unknown');
assert.strictEqual(packet.logistics.bailout.status, 'available');
assert.strictEqual(packet.lastKnownLocation.status, 'available');
assert.strictEqual(packet.packetCreatedAt, '2026-06-08T17:01:00.000Z');
assert.strictEqual(packet.packetUpdatedAt, '2026-06-08T17:01:00.000Z');
assert.strictEqual(packet.localOnly, true);
assert.strictEqual(packet.externalSharing, 'disabled');
assert.ok(/local-only/i.test(packet.safetyCopy), 'Packet copy must say local-only.');

const serializedPacket = JSON.stringify(packet).toLowerCase();
for (const forbidden of ['token', 'secret', 'apikey', 'api_key', 'authorization', 'bearer']) {
  assert.ok(!serializedPacket.includes(forbidden), `Packet must not include secret-like field "${forbidden}".`);
}
assert.ok(!/safe to proceed|verified live|live location/.test(serializedPacket), 'Packet must not overstate stale, unknown, or live state.');

const packetStorage = createMemoryStorage();
const packetStore = createOfflineIncidentPacketStore({ storage: packetStorage });
assert.strictEqual(packetStore.get(), null, 'No packet should exist before Active Trip activation.');
const storedPacket = packetStore.createOrUpdateFromActiveTrip(activeTrip, '2026-06-08T17:02:00.000Z');
assert.strictEqual(storedPacket.packetId, packet.packetId);
assert.ok(packetStorage.dump()[OFFLINE_INCIDENT_PACKET_STORAGE_KEY], 'Packet should persist to local storage.');
assert.strictEqual(
  JSON.parse(packetStorage.dump()[OFFLINE_INCIDENT_PACKET_STORAGE_KEY]).route.name,
  'FR 23N18 Coldwater',
);

const recoveredPacketStore = createOfflineIncidentPacketStore({ storage: packetStorage });
const recoveredPacket = recoveredPacketStore.getRecovered('2026-06-08T18:30:00.000Z');
assert.ok(recoveredPacket, 'Packet should survive simulated restart.');
assert.strictEqual(recoveredPacket.dataFreshness.state, 'stale');
assert.ok(/recovered from local incident packet/i.test(recoveredPacket.dataFreshness.label));
assert.strictEqual(recoveredPacket.externalSharing, 'disabled');

const integrationStorage = createMemoryStorage();
const integrationPacketStorage = createMemoryStorage();
const integrationPacketStore = createOfflineIncidentPacketStore({ storage: integrationPacketStorage });
const activeTripStore = createActiveTripModeStore({
  storage: integrationStorage,
  incidentPacketStore: integrationPacketStore,
});
const beforeItinerary = JSON.stringify(baseInput().itinerary);
const beforeVehicle = JSON.stringify(vehicleProfile);

activeTripStore.activate({
  ...baseInput(),
  routeConfidence,
  now: '2026-06-08T17:05:00.000Z',
});
assert.ok(integrationPacketStore.get(), 'Active Trip activation should create or update the incident packet.');

const recoveredActiveTrip = activeTripStore.getRecovered('2026-06-08T18:00:00.000Z');
assert.ok(recoveredActiveTrip, 'Active Trip should recover after restart.');
assert.strictEqual(integrationPacketStore.get()?.dataFreshness.state, 'stale', 'Recovered Active Trip should refresh packet stale state.');

activeTripStore.stop('2026-06-08T19:00:00.000Z');
assert.strictEqual(activeTripStore.get(), null, 'Stopping clears Active Trip state.');
assert.strictEqual(integrationPacketStore.get(), null, 'Stopping Active Trip clears the active incident packet.');
assert.strictEqual(JSON.stringify(baseInput().itinerary), beforeItinerary, 'Packet lifecycle must not mutate itinerary data.');
assert.strictEqual(JSON.stringify(vehicleProfile), beforeVehicle, 'Packet lifecycle must not mutate Fleet data.');
assert.deepStrictEqual(integrationPacketStorage.dump(), {}, 'Stop should clear only the packet storage key.');

assert.strictEqual(getPrimaryTabForPath('/offline-incident-packet')?.id, 'explore');
assert.strictEqual(getRestorableShellRouteForPath('/offline-incident-packet'), '/discover');

const activeTripScreenSource = fs.readFileSync(path.join(root, 'app', 'active-trip.tsx'), 'utf8');
assert.ok(activeTripScreenSource.includes('/offline-incident-packet'), 'Active Trip should provide packet access.');
assert.ok(activeTripScreenSource.includes('testID="active-trip-open-incident-packet"'), 'Packet access needs a stable test id.');

const packetScreenSource = fs.readFileSync(path.join(root, 'app', 'offline-incident-packet.tsx'), 'utf8');
assert.ok(packetScreenSource.includes('offlineIncidentPacketStore.getRecovered'), 'Packet screen should recover stale packet state.');
assert.ok(packetScreenSource.includes('LOCAL ONLY'), 'Packet screen should make local-only posture visible.');
assert.ok(packetScreenSource.includes('testID="offline-incident-packet-screen"'), 'Packet screen needs a stable test id.');
assert.ok(packetScreenSource.includes('testID="offline-incident-packet-clear"'), 'Packet screen needs clear action test id.');
assert.ok(!packetScreenSource.includes('SMS'), 'Packet foundation must not add SMS sharing.');
assert.ok(!packetScreenSource.includes('satellite'), 'Packet foundation must not add satellite sharing.');
assert.ok(!packetScreenSource.includes('email'), 'Packet foundation must not add email sharing.');

console.log('Offline Incident Packet foundation tests passed.');

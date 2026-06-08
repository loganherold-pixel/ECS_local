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

const { evaluateRouteConfidence } = require(path.join(root, 'lib', 'routeConfidenceEngine.ts'));
const {
  getPrimaryTabForPath,
  getRestorableShellRouteForPath,
} = require(path.join(root, 'lib', 'routeManifest.ts'));

const pointA = { latitude: 38, longitude: -110 };
const pointB = { latitude: 38.1, longitude: -110.1 };
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
    distanceMiles: 12,
  };
}

function stop(id, type, coordinate = pointA, metadata = {}) {
  return {
    ...waypoint(id, type, coordinate),
    phase: 'pre_trail_resupply',
    sequence: 1,
    plannedDay: 1,
    stopRole: 'pre_trail_resupply',
    metadata,
  };
}

function itinerary(overrides = {}) {
  const fuel = Object.prototype.hasOwnProperty.call(overrides, 'fuelStops')
    ? overrides.fuelStops
    : [stop('fuel-near-trailhead', 'fuel')];
  const grocery = Object.prototype.hasOwnProperty.call(overrides, 'groceryStops')
    ? overrides.groceryStops
    : [stop('grocery-near-refuel', 'grocery', pointB, { resupplyAnchorStopId: fuel[0]?.id ?? null })];

  return {
    id: 'trip-itinerary-fixture',
    sourceRouteId: 'route-1',
    routeId: 'route-1',
    suggestedRouteId: 'route-1',
    title: 'Fixture itinerary',
    status: 'draft',
    createdAt: '2026-06-08T12:00:00.000Z',
    updatedAt: '2026-06-08T12:00:00.000Z',
    userStart: pointA,
    approachRoute: routeSegment('approach-route', 'approach'),
    preTrailStops: {
      fuel,
      grocery,
      water: overrides.waterStops ?? [],
      generalSupply: overrides.generalSupplyStops ?? [],
    },
    preTrailStopStatus: overrides.preTrailStopStatus ?? [
      { bucket: 'fuel', status: fuel.length ? 'selected' : 'no_results', anchorCoordinate: pointA, stopCount: fuel.length },
      { bucket: 'grocery', status: grocery.length ? 'selected' : 'no_results', anchorCoordinate: pointA, stopCount: grocery.length },
      { bucket: 'water', status: 'not_requested', anchorCoordinate: pointA, stopCount: 0 },
      { bucket: 'generalSupply', status: 'not_requested', anchorCoordinate: pointA, stopCount: 0 },
    ],
    fuelRangeConfidence: overrides.fuelRangeConfidence ?? {
      estimatedTotalDistance: 42,
      estimatedTrailDistance: 20,
      knownFuelRange: 260,
      estimatedFuelRemaining: 220,
      fuelStatus: 'sufficient',
      confidenceScore: 0.8,
      warnings: [],
      preTrailFuelStopCount: fuel.length,
    },
    trailheadStart: overrides.trailheadStart === undefined ? waypoint('trailhead', 'trailhead_start') : overrides.trailheadStart,
    trailRoute: overrides.trailRoute === undefined ? routeSegment('trail-route', 'trail_navigation') : overrides.trailRoute,
    routeGeometryStatus: overrides.routeGeometryStatus ?? 'trail_available',
    trailEnd: overrides.trailEnd === undefined ? waypoint('trail-end', 'trail_end', pointB) : overrides.trailEnd,
    exitRoute: overrides.exitRoute ?? null,
    exitEnd: null,
    trailWaypoints: overrides.trailWaypoints ?? [waypoint('camp', 'camp_potential'), waypoint('bailout', 'bailout')],
    phases: ['approach', 'pre_trail_resupply', 'trailhead', 'trail_navigation', 'trail_exit'],
    phaseSummaries: [],
    stops: [],
    waypoints: [],
    segments: [],
    confidence: {
      overall: 'high',
      routeGeometry: 'high',
      routeGeometryStatus: overrides.routeGeometryStatus ?? 'trail_available',
      trailhead: 'high',
      resupply: fuel.length || grocery.length ? 'medium' : 'unknown',
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
  id: 'route-1',
  name: 'FR 23N18 Coldwater',
  distanceMiles: 42,
  startLat: 38,
  startLng: -110,
  routeMetadata: {
    routeTypeStatus: 'live_verified_geometry',
    routeAuthorityLabel: 'ECS Validated',
    geometrySource: 'ecs_validated_route_catalog',
  },
};

const vehicleProfile = {
  id: 'rig-1',
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
      primaryCampCandidate: { id: 'camp-1', name: 'Camp 1' },
      primaryExitPoint: { id: 'exit-1', name: 'Exit 1' },
    },
    environment: overrides.environment ?? {
      weather: { status: 'unknown', label: 'Trip Builder weather unavailable' },
      daylight: { status: 'unknown', label: 'Trip Builder daylight unavailable' },
      remoteness: { status: 'available' },
    },
    telemetry: overrides.telemetry ?? { status: 'unavailable', label: 'Telemetry unavailable for Trip Builder MVP' },
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

const engineResult = evaluateRouteConfidence(baseInput());
const snapshot = buildActiveTripModeSnapshot({
  ...baseInput(),
  routeConfidence: engineResult,
  now: '2026-06-08T14:00:00.000Z',
});

assert.strictEqual(snapshot.status, 'active');
assert.strictEqual(snapshot.sourceItineraryId, 'trip-itinerary-fixture');
assert.strictEqual(snapshot.route.id, 'route-1');
assert.strictEqual(snapshot.route.name, 'FR 23N18 Coldwater');
assert.strictEqual(snapshot.route.authorityStatus, 'live_verified_geometry');
assert.strictEqual(snapshot.route.geometryStatus, 'trail_available');
assert.deepStrictEqual(snapshot.route.trailheadCoordinate, pointA);
assert.strictEqual(snapshot.vehicle.id, 'rig-1');
assert.strictEqual(snapshot.vehicle.label, 'Overlander');
assert.strictEqual(snapshot.routeConfidence.category, engineResult.category);
assert.strictEqual(snapshot.routeConfidence.score, engineResult.score);
assert.strictEqual(snapshot.routeConfidence.recommendedAction.id, engineResult.recommendedAction.id);
assert.strictEqual(snapshot.logistics.refuel.status, 'selected');
assert.strictEqual(snapshot.logistics.resupply.status, 'selected');
assert.strictEqual(snapshot.logistics.camp.status, 'available');
assert.strictEqual(snapshot.logistics.bailout.status, 'available');
assert.strictEqual(snapshot.lastLocation.status, 'unknown');
assert.strictEqual(snapshot.freshness.state, 'fresh');
assert.ok(snapshot.warnings.length >= engineResult.keyWarnings.length);

const skippedPoi = buildActiveTripModeSnapshot({
  ...baseInput({
    itinerary: itinerary({
      fuelStops: [],
      groceryStops: [],
      preTrailStopStatus: [
        { bucket: 'fuel', status: 'not_requested', anchorCoordinate: pointA, stopCount: 0 },
        { bucket: 'grocery', status: 'not_requested', anchorCoordinate: pointA, stopCount: 0 },
        { bucket: 'water', status: 'not_requested', anchorCoordinate: pointA, stopCount: 0 },
        { bucket: 'generalSupply', status: 'not_requested', anchorCoordinate: pointA, stopCount: 0 },
      ],
    }),
  }),
  now: '2026-06-08T14:00:00.000Z',
});
assert.strictEqual(skippedPoi.logistics.refuel.status, 'not_requested');
assert.strictEqual(skippedPoi.logistics.resupply.status, 'not_requested');
assert.ok(!skippedPoi.warnings.some((warning) => /provider unavailable/i.test(warning)), 'Skipped planning must not become provider failure.');

const storage = createMemoryStorage();
const store = createActiveTripModeStore({ storage });
const stored = store.activate({
  ...baseInput(),
  routeConfidence: engineResult,
  now: '2026-06-08T14:00:00.000Z',
});
assert.strictEqual(stored.activeTripId, snapshot.activeTripId);
assert.ok(storage.dump().active_trip_mode_snapshot, 'Active trip snapshot should be persisted.');

const recoveredStore = createActiveTripModeStore({ storage });
const recovered = recoveredStore.getRecovered('2026-06-08T18:30:00.000Z');
assert.ok(recovered, 'Active trip should recover after simulated restart.');
assert.strictEqual(recovered.freshness.state, 'stale');
assert.strictEqual(recovered.lastLocation.status, 'unknown');
assert.ok(recovered.warnings.some((warning) => /local snapshot/i.test(warning)));
assert.notStrictEqual(recovered.routeConfidence.dataConfidence.state, 'live');
assert.notStrictEqual(recovered.routeConfidence.dataConfidence.state, 'verified');

const beforeStopItinerary = JSON.stringify(baseInput().itinerary);
const beforeStopVehicle = JSON.stringify(vehicleProfile);
const stopped = recoveredStore.stop('2026-06-08T19:00:00.000Z');
assert.strictEqual(stopped.status, 'stopped');
assert.strictEqual(recoveredStore.get(), null);
assert.deepStrictEqual(storage.dump(), {}, 'Stopping an active trip clears only the active trip storage key.');
assert.strictEqual(JSON.stringify(baseInput().itinerary), beforeStopItinerary, 'Stopping must not mutate itinerary data.');
assert.strictEqual(JSON.stringify(vehicleProfile), beforeStopVehicle, 'Stopping must not mutate Fleet vehicle data.');

const explorerSource = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');
assert.ok(explorerSource.includes("from '../lib/activeTripMode'"), 'Trip Builder should import the Active Trip activation store.');
assert.ok(explorerSource.includes('activeTripModeStore.activate'), 'Trip Builder should activate through the Active Trip store.');
assert.ok(explorerSource.includes("'/active-trip'"), 'Trip Builder should route to the Active Trip screen after activation.');
assert.ok(explorerSource.includes('testID="trip-builder-activate-trip"'), 'Trip Builder needs a stable Activate Trip test id.');
assert.ok(explorerSource.includes('testID="trip-builder-results-close"'), 'Existing results close control must remain.');
assert.ok(explorerSource.includes('onEditPress={itineraryEditMode ? undefined : handleStartItineraryEdit}'), 'Existing itinerary edit control must remain.');
assert.ok(explorerSource.includes("openPlanMap('itinerary')"), 'Existing itinerary map control must remain.');
assert.ok(explorerSource.includes('testID="trip-builder-prepare-offline-pack"'), 'Existing offline pack action must remain.');

assert.strictEqual(getPrimaryTabForPath('/active-trip')?.id, 'explore', 'Active Trip should keep Explore dock context.');
assert.strictEqual(getRestorableShellRouteForPath('/active-trip'), '/discover', 'Active Trip should restore through Explore.');

const activeTripScreenSource = fs.readFileSync(path.join(root, 'app', 'active-trip.tsx'), 'utf8');
assert.ok(activeTripScreenSource.includes('activeTripModeStore.getRecovered'), 'Active Trip screen should recover stale local snapshots on load.');
assert.ok(activeTripScreenSource.includes('activeTripModeStore.stop'), 'Active Trip screen should stop by clearing active state through the store.');
assert.ok(activeTripScreenSource.includes('testID="active-trip-screen"'), 'Active Trip screen needs a stable test id.');
assert.ok(activeTripScreenSource.includes('testID="active-trip-stop"'), 'Active Trip stop action needs a stable test id.');

console.log('Active Trip Mode foundation tests passed.');

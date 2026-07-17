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
  providerResupplyPlaceIdentity,
  resupplyPlaceIdentityFromMetadata,
} = require(path.join(root, 'lib', 'tripBuilder', 'resupplyPlaceIdentity.ts'));

assert.strictEqual(
  providerResupplyPlaceIdentity('AbC:123', 'mapbox'),
  providerResupplyPlaceIdentity('AbC:123', 'mapbox'),
  'The same opaque provider place ID must produce one stable physical identity.',
);
assert.notStrictEqual(
  providerResupplyPlaceIdentity('AbC', 'mapbox'),
  providerResupplyPlaceIdentity('abc', 'mapbox'),
  'Opaque provider IDs must not be lowercased into a false identity collision.',
);
assert.notStrictEqual(
  providerResupplyPlaceIdentity('a:b', 'mapbox'),
  providerResupplyPlaceIdentity('a-b', 'mapbox'),
  'Punctuation in opaque provider IDs must remain lossless.',
);
assert.notStrictEqual(
  resupplyPlaceIdentityFromMetadata({ providerPlaceId: '123', provider: 'alpha' }),
  resupplyPlaceIdentityFromMetadata({ providerPlaceId: '123', provider: 'beta' }),
  'Equal local IDs from different providers must not collapse into one stop.',
);

const route = {
  id: 'smart-resupply-route',
  name: 'Smart Resupply Route',
  region: 'Test Range',
  distanceMiles: 120,
  estimatedTravelHours: 8,
  estimatedDays: 2,
  remotenessScore: 8,
  terrainType: 'remote desert',
  startLat: 38,
  startLng: -110,
  destinationCoordinate: { latitude: 38.7, longitude: -109.6 },
  waypoints: [
    { id: 'fuel-start', name: 'Known fuel before start', waypointType: 'fuel', routeMileMarker: 0, distanceFromStartMiles: 3, reliability: 'medium' },
    { id: 'water-mid', name: 'Known water cache', kind: 'water', routeMileMarker: 48, distanceFromRouteMiles: 1.2, reliability: 'low' },
    { id: 'repair-end', name: 'Known tire support', type: 'repair', routeMileMarker: 122, distanceFromEndMiles: 8, reliability: 'medium' },
  ],
};

const baseInput = {
  tripType: 'weekend_overland',
  timeWindow: 'weekend',
  groupType: 'small_group',
  priorities: ['low_risk'],
};

const exitPoints = [
  {
    id: 'exit-1',
    name: 'Known paved exit',
    type: 'paved',
    distanceFromRouteMiles: 4,
    priority: 10,
    source: 'bailout_store',
  },
];

const vehicleProfile = {
  id: 'vehicle-1',
  label: 'Test Vehicle',
  vehicleType: 'pickup',
  rangeMiles: 220,
  confidence: 'medium',
};

const plan = buildTripPlan({
  route,
  input: baseInput,
  vehicleProfile,
  exitPoints,
  capturedAt: '2026-05-18T12:00:00.000Z',
});

assert.ok(plan.smartResupplyPlan, 'Trip Builder result should include Smart Resupply Plan.');
assert.strictEqual(plan.smartResupplyPlan.fuel.status, 'good', 'Vehicle range plus known fuel should produce good fuel status.');
assert.strictEqual(plan.smartResupplyPlan.fuel.nearestFuelBeforeStart.id, 'fuel-start');
assert.strictEqual(plan.smartResupplyPlan.water.status, 'good', 'Known near-route water point should produce good water status.');
assert.strictEqual(plan.smartResupplyPlan.repair.nearestPavedExit.id, 'exit-1', 'Repair plan should reference nearest paved exit when available.');
assert.strictEqual(plan.smartResupplyPlan.exitAccess.knownExitCount, 1, 'Known exit points should be counted.');
assert.strictEqual(plan.smartResupplyPlan.exitAccess.status, 'good', 'Nearby exit should produce good exit-access status.');
assert.strictEqual(plan.smartResupplyPlan.medical.status, 'unknown', 'Missing medical POI data should stay unknown.');
assert.ok(
  plan.smartResupplyPlan.medical.warnings.some((warning) => warning.id === 'medical-unknown'),
  'Unknown medical data should be surfaced as a warning.',
);

const noVehiclePlan = buildTripPlan({
  route,
  input: baseInput,
  vehicleProfile: null,
  exitPoints,
  capturedAt: '2026-05-18T12:00:00.000Z',
});
assert.strictEqual(noVehiclePlan.smartResupplyPlan.fuel.status, 'unknown', 'Missing vehicle profile should make fuel status unknown.');
assert.ok(
  noVehiclePlan.smartResupplyPlan.fuel.warnings.some((warning) => warning.id === 'fuel-range-unknown'),
  'Missing vehicle fuel range should produce an honest warning.',
);

const lowFuelPlan = buildTripPlan({
  route,
  input: baseInput,
  vehicleProfile: { ...vehicleProfile, rangeMiles: 130 },
  exitPoints,
  capturedAt: '2026-05-18T12:00:00.000Z',
});
assert.strictEqual(lowFuelPlan.smartResupplyPlan.fuel.status, 'low', 'Low fuel range margin should produce low fuel status.');
assert.ok(
  lowFuelPlan.smartResupplyPlan.fuel.warnings.some((warning) => warning.id === 'fuel-range-tight' || warning.id === 'fuel-range-deficit'),
  'Low fuel confidence should produce a range warning.',
);

const missingPoiPlan = buildTripPlan({
  route: { ...route, waypoints: [] },
  input: baseInput,
  vehicleProfile,
  exitPoints: [],
  capturedAt: '2026-05-18T12:00:00.000Z',
});
assert.strictEqual(missingPoiPlan.smartResupplyPlan.water.status, 'unknown', 'Missing water POI data should remain unknown.');
assert.strictEqual(missingPoiPlan.smartResupplyPlan.supplies.status, 'unknown', 'Missing supplies POI data should remain unknown.');
assert.notStrictEqual(missingPoiPlan.smartResupplyPlan.exitAccess.status, 'unknown', 'Route start/finish fallback should prevent exit access from being blank.');
assert.strictEqual(missingPoiPlan.smartResupplyPlan.exitAccess.knownExitCount >= 1, true, 'Route-derived exit references should be counted when dedicated bailouts are missing.');

const selectedCombinedStop = {
  id: 'operator-resupply-last-practical',
  name: 'Last Practical Fuel and Market',
  category: 'fuel',
  categoryCoverage: ['fuel', 'food_supplies'],
  placeIdentity: 'provider:last-practical',
  selectionState: 'operator_selected',
  distanceFromRouteMiles: 1.2,
  reliability: 'high',
  source: 'operator_selected_pre_route_resupply',
  approachEvidence: {
    rank: 1,
    score: 0.94,
    progressRatio: 0.82,
    distanceFromOriginMiles: 82,
    distanceBeforeTrailheadMiles: 18,
    distanceBeforeRemoteEntryMiles: 2,
    corridorOffsetMiles: 0.2,
    detourDistanceMiles: 1.2,
    detourDurationMinutes: 4,
    detourSource: 'provider_route',
    routeAwareConfidence: 'high',
    beforeTrailhead: true,
    beforeRemoteEntry: true,
    remoteEntrySource: 'known_service_boundary',
    remoteEntryEstimated: false,
    operatingStatus: 'unknown',
  },
};
const closeButWrongBackgroundPoi = {
  id: 'background-near-origin',
  name: 'Near Origin Fuel',
  category: 'fuel',
  placeIdentity: 'provider:near-origin',
  selectionState: 'candidate',
  distanceFromRouteMiles: 0.1,
  distanceFromStartMiles: 0.5,
  reliability: 'high',
  source: 'route_context_engine',
};
const routeAwarePlan = buildTripPlan({
  route: { ...route, waypoints: [] },
  input: baseInput,
  vehicleProfile,
  resupplyPoints: [selectedCombinedStop],
  availablePoiData: [closeButWrongBackgroundPoi],
  exitPoints,
  capturedAt: '2026-05-18T12:00:00.000Z',
});
assert.strictEqual(
  routeAwarePlan.smartResupplyPlan.fuel.keyPoint.id,
  selectedCombinedStop.id,
  'The final Smart Resupply summary must preserve the operator-selected route-aware last fuel stop.',
);
assert.strictEqual(
  routeAwarePlan.smartResupplyPlan.supplies.keyPoint.id,
  selectedCombinedStop.id,
  'One combined physical stop should satisfy both fuel and grocery/supply plans.',
);
assert.strictEqual(
  routeAwarePlan.smartResupplyPlan.fuel.keyPoint.placeIdentity,
  routeAwarePlan.smartResupplyPlan.supplies.keyPoint.placeIdentity,
  'Combined category coverage must not create two divergent physical stops.',
);

const approachOrderedPlan = buildTripPlan({
  route: { ...route, waypoints: [] },
  input: baseInput,
  vehicleProfile,
  resupplyPoints: [
    {
      ...selectedCombinedStop,
      id: 'later-approach-fuel',
      name: 'Later Approach Fuel',
      categoryCoverage: ['fuel'],
      placeIdentity: 'provider:later-approach-fuel',
      approachEvidence: {
        ...selectedCombinedStop.approachEvidence,
        progressRatio: 0.9,
        distanceFromOriginMiles: 90,
      },
    },
    {
      ...selectedCombinedStop,
      id: 'earlier-approach-supply',
      name: 'Earlier Approach Supply',
      category: 'food_supplies',
      categoryCoverage: ['food_supplies'],
      placeIdentity: 'provider:earlier-approach-supply',
      approachEvidence: {
        ...selectedCombinedStop.approachEvidence,
        progressRatio: 0.7,
        distanceFromOriginMiles: 70,
      },
    },
  ],
  exitPoints,
  capturedAt: '2026-05-18T12:00:00.000Z',
});
assert.deepStrictEqual(
  approachOrderedPlan.suggestedStops
    .filter((stop) => stop.title.includes('Approach Fuel') || stop.title.includes('Approach Supply'))
    .map((stop) => stop.type),
  ['supply', 'fuel'],
  'The generated itinerary must preserve canonical approach progress instead of forcing fuel before supplies.',
);

const conservativeDetourPlan = buildTripPlan({
  route: { ...route, waypoints: [] },
  input: baseInput,
  vehicleProfile,
  resupplyPoints: [selectedCombinedStop],
  availablePoiData: [{
    ...selectedCombinedStop,
    id: 'same-place-conservative-detour',
    selectionState: 'candidate',
    source: 'route_context_engine',
    approachEvidence: {
      ...selectedCombinedStop.approachEvidence,
      detourDistanceMiles: 12,
      detourDurationMinutes: 25,
      detourSource: 'corridor_offset_estimate',
      routeAwareConfidence: 'low',
    },
  }],
  exitPoints,
  capturedAt: '2026-05-18T12:00:00.000Z',
});
assert.deepStrictEqual(
  {
    detourDistanceMiles: conservativeDetourPlan.smartResupplyPlan.fuel.keyPoint.approachEvidence.detourDistanceMiles,
    detourDurationMinutes: conservativeDetourPlan.smartResupplyPlan.fuel.keyPoint.approachEvidence.detourDurationMinutes,
    detourSource: conservativeDetourPlan.smartResupplyPlan.fuel.keyPoint.approachEvidence.detourSource,
    routeAwareConfidence: conservativeDetourPlan.smartResupplyPlan.fuel.keyPoint.approachEvidence.routeAwareConfidence,
  },
  {
    detourDistanceMiles: 12,
    detourDurationMinutes: 25,
    detourSource: 'corridor_offset_estimate',
    routeAwareConfidence: 'low',
  },
  'Conservative same-place detour evidence must preserve the matching source, duration, and confidence provenance.',
);

const nonviableApproachPlan = buildTripPlan({
  route: {
    ...route,
    waypoints: [
      { id: 'trail-fuel', name: 'Trail Fuel Waypoint', category: 'fuel', routeMileMarker: 60 },
      { id: 'trail-market', name: 'Trail Market Waypoint', category: 'food_supplies', routeMileMarker: 62 },
    ],
  },
  input: baseInput,
  vehicleProfile,
  resupplyPoints: [
    {
      ...selectedCombinedStop,
      id: 'after-remote-fuel',
      name: 'Fuel After Service Loss',
      categoryCoverage: ['fuel'],
      placeIdentity: 'provider:after-remote',
      approachEvidence: {
        ...selectedCombinedStop.approachEvidence,
        beforeRemoteEntry: false,
      },
    },
    {
      ...selectedCombinedStop,
      id: 'after-trailhead-fuel',
      name: 'Fuel After Trailhead',
      categoryCoverage: ['fuel'],
      placeIdentity: 'provider:after-trailhead',
      approachEvidence: {
        ...selectedCombinedStop.approachEvidence,
        beforeTrailhead: false,
      },
    },
    {
      ...selectedCombinedStop,
      id: 'known-closed-fuel',
      name: 'Known Closed Fuel',
      categoryCoverage: ['fuel'],
      placeIdentity: 'provider:known-closed',
      approachEvidence: {
        ...selectedCombinedStop.approachEvidence,
        operatingStatus: 'closed',
      },
    },
    {
      ...selectedCombinedStop,
      id: 'excessive-detour-fuel',
      name: 'Excessive Detour Fuel',
      categoryCoverage: ['fuel'],
      placeIdentity: 'provider:excessive-detour',
      approachEvidence: {
        ...selectedCombinedStop.approachEvidence,
        detourDistanceMiles: 35,
      },
    },
    {
      ...selectedCombinedStop,
      id: 'after-remote-supply',
      name: 'Supplies After Service Loss',
      category: 'food_supplies',
      categoryCoverage: ['food_supplies'],
      placeIdentity: 'provider:after-remote-supply',
      approachEvidence: {
        ...selectedCombinedStop.approachEvidence,
        beforeRemoteEntry: false,
      },
    },
  ],
  exitPoints,
  capturedAt: '2026-05-18T12:00:00.000Z',
});
assert.strictEqual(
  nonviableApproachPlan.smartResupplyPlan.fuel.keyPoint,
  null,
  'Known after-boundary, after-trailhead, and closed candidates must not become the final fuel recommendation.',
);
assert.ok(
  nonviableApproachPlan.smartResupplyPlan.fuel.warnings.some((warning) => warning.id === 'fuel-no-viable-approach-stop'),
  'The final plan must explain when no viable route-aware fuel stop remains.',
);
assert.strictEqual(
  nonviableApproachPlan.smartResupplyPlan.supplies.keyPoint,
  null,
  'A trail waypoint must not replace a rejected approach-aware grocery/supply stop.',
);

const conflictingSamePlacePlan = buildTripPlan({
  route: { ...route, waypoints: [] },
  input: baseInput,
  vehicleProfile,
  resupplyPoints: [selectedCombinedStop],
  availablePoiData: [{
    ...selectedCombinedStop,
    id: 'provider-closed-copy',
    selectionState: 'candidate',
    source: 'route_context_engine',
    approachEvidence: {
      ...selectedCombinedStop.approachEvidence,
      operatingStatus: 'closed',
    },
  }],
  exitPoints,
  capturedAt: '2026-05-18T12:00:00.000Z',
});
assert.strictEqual(
  conflictingSamePlacePlan.smartResupplyPlan.fuel.keyPoint,
  null,
  'Known-closed evidence for the same physical place must not be discarded in favor of an operator-selected unknown status.',
);

console.log('Smart Resupply Planner checks passed.');

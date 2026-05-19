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
assert.strictEqual(missingPoiPlan.smartResupplyPlan.exitAccess.status, 'unknown', 'Missing exits should remain unknown.');

console.log('Smart Resupply Planner checks passed.');

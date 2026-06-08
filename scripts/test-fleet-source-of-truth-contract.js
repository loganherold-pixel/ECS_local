const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), `${message} missing expected source: ${needle}`);
}

function assertNotIncludes(source, needle, message) {
  assert.ok(!source.includes(needle), `${message} still contains stale source: ${needle}`);
}

const contractPath = path.join(root, 'docs', 'fleet-source-of-truth-contract.md');
assert.ok(fs.existsSync(contractPath), 'Fleet source-of-truth contract doc should exist.');

const contract = read('docs/fleet-source-of-truth-contract.md');
const vehicleStore = read('lib/vehicleStore.ts');
const vehicleSpecStore = read('lib/vehicleSpecStore.ts');
const activeVehicleContext = read('lib/activeVehicleContext.ts');
const activeVehicleState = read('lib/fleet/activeVehicleState.ts');
const fleetSelectors = read('lib/fleet/fleetVehicleStateSelectors.ts');
const commandSelectors = read('lib/fleet/fleetCommandSelectors.ts');

[
  'vehicleStore',
  'vehicleSpecStore',
  'vehicleSetupStore',
  'activeVehicleContext',
  'activeVehicleState',
  'fleetVehicleStateSelectors',
  'fleetCommandSelectors',
  'fleetFabricService',
  'weightEngine',
  'vehicleWeightEngine',
  'weightDashboardStore',
  'oemVehicleSpecs',
  'vehicleAttitudeAssets',
].forEach((term) => {
  assertIncludes(contract, term, `Fleet source-of-truth contract should document ${term}`);
});

[
  'Do not use directly from UI screens',
  'User-created vehicle profile source of truth',
  'Normalized/spec/reference source of truth',
  'Derived calculations',
  'Duplicate or adapter systems',
].forEach((heading) => {
  assertIncludes(contract, heading, `Fleet contract should include ${heading}`);
});

assertNotIncludes(vehicleStore, 'memory (native)', 'vehicleStore persistence comment');
assertNotIncludes(vehicleStore, 'memory-only', 'vehicleStore persistence comment');
assertNotIncludes(vehicleSpecStore, 'memory (native)', 'vehicleSpecStore persistence comment');
assertNotIncludes(vehicleSpecStore, 'memory-only', 'vehicleSpecStore persistence comment');

assertIncludes(activeVehicleContext, 'export function getActiveVehicleContext', 'Active vehicle context selector');
assertIncludes(activeVehicleContext, 'export function getActiveVehicle', 'Active vehicle profile selector');
assertIncludes(activeVehicleContext, 'export function getActiveVehicleSpec', 'Active vehicle spec selector');
assertIncludes(activeVehicleContext, 'export function getActiveVehicleTripBuilderProfile', 'Trip/confidence vehicle input selector');
assertIncludes(activeVehicleState, 'export function getVehicleWeightSnapshot', 'Vehicle weight summary selector');
assertIncludes(activeVehicleState, 'export function getVehicleCapabilitySnapshot', 'Vehicle capability selector');
assertIncludes(fleetSelectors, 'export function selectFleetVehicleState', 'Canonical Fleet state selector');
assertIncludes(commandSelectors, 'export function resolveFleetCommandProfile', 'Fleet command profile widget selector');

console.log('Fleet source-of-truth contract checks passed.');

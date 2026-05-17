const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const activeVehicleStatePath = path.join(root, 'lib', 'fleet', 'activeVehicleState.ts');
const buildLoadoutPath = path.join(root, 'lib', 'fleet', 'fleetBuildLoadout.ts');
const selectorPath = path.join(root, 'lib', 'fleet', 'fleetVehicleStateSelectors.ts');
const activeContextPath = path.join(root, 'lib', 'activeVehicleContext.ts');

process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const activeVehicleState = require(activeVehicleStatePath);
const buildLoadout = require(buildLoadoutPath);
const selectors = require(selectorPath);
const activeContext = require(activeContextPath);

function vehicle(id, overrides = {}) {
  return {
    id,
    owner_user_id: 'user-1',
    name: overrides.name || 'Fleet Vehicle',
    type: overrides.type || 'truck',
    make: overrides.make === undefined ? 'Toyota' : overrides.make,
    model: overrides.model === undefined ? 'Tacoma' : overrides.model,
    year: overrides.year === undefined ? 2024 : overrides.year,
    notes: null,
    fuel_tank_capacity_gal: null,
    avg_mpg: null,
    current_fuel_percent: null,
    water_capacity_gal: null,
    current_water_gal: null,
    water_updated_at: null,
    created_at: '2026-05-05T00:00:00.000Z',
    updated_at: '2026-05-05T00:00:00.000Z',
    ...overrides,
  };
}

function spec(overrides = {}) {
  return {
    base_weight_lb: 5000,
    gvwr_lb: 6500,
    front_base_weight_lb: 2600,
    rear_base_weight_lb: 2400,
    fuel_tank_capacity_gal: 21,
    fuel_type: 'gas',
    ...overrides,
  };
}

function loadoutItem(id, loadoutId, weightLbs, quantity = 1, storageLocation = 'rearLow') {
  return {
    id,
    loadout_id: loadoutId,
    owner_user_id: 'user-1',
    device_id: 'device-1',
    sync_status: 'local',
    name: id,
    category: 'recovery',
    quantity,
    is_critical: false,
    is_packed: true,
    storage_location: storageLocation,
    notes: null,
    weight_lbs: weightLbs,
    weight_source: 'measured',
    sort_order: 0,
    created_at: '2026-05-05T00:00:00.000Z',
    updated_at: '2026-05-05T00:00:00.000Z',
  };
}

function canonical(input = {}) {
  return selectors.selectFleetVehicleStateFromRecord({
    vehicle: input.vehicle || vehicle('vehicle-1'),
    spec: input.spec === undefined ? spec() : input.spec,
    consumables: input.consumables || null,
    tiresLift: input.tiresLift || null,
    activeLoadout: input.activeLoadout || null,
    legacyLoadoutItems: input.legacyLoadoutItems || [],
    buildLoadoutState: input.buildLoadoutState || buildLoadout.createEmptyFleetBuildLoadoutState(),
    frameworkContainerZones: input.frameworkContainerZones || [],
  });
}

function toActive(input = {}) {
  const fleetState = canonical(input);
  return activeVehicleState.buildActiveVehicleStateFromFleetState(fleetState, fleetState.vehicle.id);
}

const noVehicle = activeVehicleState.getActiveVehicleState(null);
assert.strictEqual(noVehicle.status, 'no_active_vehicle');
assert.strictEqual(noVehicle.vehicle, null);
assert.strictEqual(noVehicle.weight.estimatedOperatingWeightLbs, null);
assert.strictEqual(noVehicle.capability.hasVehicle, false);
assert.strictEqual(activeVehicleState.getVehicleWeightSnapshot(null).payloadUsedPct, null);

const incomplete = toActive({
  vehicle: vehicle('vehicle-incomplete', {
    name: 'Incomplete Profile',
    make: null,
    model: null,
    year: null,
    base_weight_lb: null,
    gvwr_lb: null,
  }),
  spec: null,
});
assert.strictEqual(incomplete.schemaVersion, 'ecs.vehicle-state.v1');
assert.ok(['incomplete', 'ready'].includes(incomplete.status), 'Incomplete data should stay non-crashing and explicit.');
assert.ok(
  incomplete.weight.confidenceLevel === 'class_estimate' ||
    incomplete.weight.confidenceLevel === 'incomplete' ||
    incomplete.weight.confidenceLevel === 'unknown',
  'Incomplete profile should expose class/incomplete/unknown confidence metadata.',
);
assert.ok(
  incomplete.weight.isEstimate || incomplete.weight.isPartial,
  'Incomplete profile should be marked as estimated or partial, not verified.',
);

const ram = toActive({
  vehicle: vehicle('ram-2500', {
    name: 'Tow Rig',
    make: 'Ram',
    model: '2500',
    year: 2023,
  }),
  spec: spec({ base_weight_lb: 7742, gvwr_lb: 10190, fuel_tank_capacity_gal: 31, fuel_type: 'diesel' }),
});
assert.strictEqual(ram.identity.make, 'Ram');
assert.strictEqual(ram.identity.model, '2500');
assert.strictEqual(ram.weight.baseWeightLbs, 7742);
assert.strictEqual(ram.weight.gvwrLbs, 10190);
assert.ok(ram.weight.payloadUsedPct > 0);
assert.strictEqual(ram.capability.fuelTankCapacityGal, 31);

const nonRam = toActive({
  vehicle: vehicle('not-ram', { name: 'Trail Wagon', make: 'Subaru', model: 'Outback', year: 2022, type: 'suv' }),
  spec: spec({ base_weight_lb: 3900, gvwr_lb: 5000, fuel_tank_capacity_gal: 18 }),
});
assert.strictEqual(nonRam.identity.make, 'Subaru');
assert.strictEqual(nonRam.identity.model, 'Outback');
assert.strictEqual(nonRam.weight.baseWeightLbs, 3900);
assert.strictEqual(nonRam.weight.gvwrLbs, 5000);

let accessoryState = buildLoadout.createEmptyFleetBuildLoadoutState();
accessoryState = buildLoadout.upsertFleetAccessoryInstall(
  accessoryState,
  buildLoadout.buildFleetAccessoryInstall({
    accessoryId: 'roof_rack_platform',
    vehicleId: 'accessory-only',
    knowledgeMode: 'manual_weight',
    manualWeightLb: 110,
  }),
);
const accessoryOnly = toActive({
  vehicle: vehicle('accessory-only'),
  spec: spec(),
  buildLoadoutState: accessoryState,
});
assert.strictEqual(accessoryOnly.modifications.accessoryWeightLbs, 110);
assert.strictEqual(accessoryOnly.weight.accessoryWeightLbs, 110);
assert.strictEqual(accessoryOnly.weight.cargoLoadoutWeightLbs, 0);
assert.ok(accessoryOnly.weight.estimatedOperatingWeightLbs >= 5110);

const cargoOnly = toActive({
  vehicle: vehicle('cargo-only'),
  spec: spec(),
  activeLoadout: {
    id: 'loadout-cargo',
    owner_user_id: 'user-1',
    vehicle_id: 'cargo-only',
    name: 'Weekend Kit',
    description: null,
    mode: 'trip',
    operating_profile: null,
    people_count: null,
    trip_length_days: null,
    total_weight_lbs: null,
    item_count: 1,
    loadout_view_mode: 'simple',
    created_at: '2026-05-05T00:00:00.000Z',
    updated_at: '2026-05-05T00:00:00.000Z',
  },
  legacyLoadoutItems: [loadoutItem('tool-roll', 'loadout-cargo', 45, 2)],
});
assert.strictEqual(cargoOnly.loadout.activeLoadoutId, 'loadout-cargo');
assert.strictEqual(cargoOnly.loadout.itemCount, 1);
assert.strictEqual(cargoOnly.weight.accessoryWeightLbs, 0);
assert.strictEqual(cargoOnly.weight.cargoLoadoutWeightLbs, 90);

const mixed = toActive({
  vehicle: vehicle('mixed-load'),
  spec: spec(),
  buildLoadoutState: accessoryState,
  legacyLoadoutItems: [loadoutItem('recovery-board', 'loadout-mixed', 25, 1, 'roof')],
});
assert.strictEqual(mixed.weight.accessoryWeightLbs, 110);
assert.strictEqual(mixed.weight.cargoLoadoutWeightLbs, 25);
assert.ok(mixed.weight.estimatedOperatingWeightLbs >= 5135);
assert.ok(['clear', 'watch', 'caution', 'critical'].includes(mixed.centerOfGravity.riskLevel));

const bridged = activeContext.getVehicleContext(null);
assert.strictEqual(bridged.vehicleState.status, 'no_active_vehicle');
assert.strictEqual(bridged.weightSnapshot.estimatedOperatingWeightLbs, null);
assert.strictEqual(bridged.capabilitySnapshot.hasVehicle, false);

assert.strictEqual(typeof activeContext.getActiveVehicleState, 'function');
assert.strictEqual(typeof activeContext.getVehicleWeightSnapshot, 'function');
assert.strictEqual(typeof activeContext.getVehicleCapabilitySnapshot, 'function');

console.log('Fleet active vehicle state checks passed.');

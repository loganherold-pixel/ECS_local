const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const root = path.join(__dirname, '..');
const fleetDomainPath = path.join(root, 'lib', 'fleet', 'fleetPremiumDomain.ts');
const buildLoadoutPath = path.join(root, 'lib', 'fleet', 'fleetBuildLoadout.ts');
const operatingWeightPath = path.join(root, 'lib', 'fleet', 'fleetOperatingWeight.ts');
const vehicleStateSelectorsPath = path.join(root, 'lib', 'fleet', 'fleetVehicleStateSelectors.ts');

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

const fleet = require(fleetDomainPath);
const buildLoadout = require(buildLoadoutPath);
const operatingWeight = require(operatingWeightPath);
const vehicleStateSelectors = require(vehicleStateSelectorsPath);

const vehicle = fleet.adaptLegacyVehicleToFleetVehicle({
  vehicle: {
    id: 'vehicle-weight-1',
    owner_user_id: 'user-1',
    name: 'Trail Rig',
    type: 'truck',
    make: 'Toyota',
    model: 'Tacoma',
    year: 2024,
  },
  specs: {
    base_weight_lb: 5000,
    gvwr_lb: 6000,
    front_base_weight_lb: 2600,
    rear_base_weight_lb: 2400,
  },
});

let buildState = buildLoadout.createEmptyFleetBuildLoadoutState();
const roofRack = buildLoadout.buildFleetAccessoryInstall({
  accessoryId: 'roof_rack_platform',
  vehicleId: vehicle.id,
  knowledgeMode: 'manual_weight',
  manualWeightLb: 100,
});
buildState = buildLoadout.upsertFleetAccessoryInstall(buildState, roofRack);
const roofCompartment = buildState.compartments.find((item) => item.loadZone === 'roof');
assert.ok(roofCompartment, 'Roof rack should create a roof compartment.');
buildState = buildLoadout.upsertFleetCompartmentLoadoutItem(buildState, buildLoadout.buildFleetCompartmentLoadoutItem({
  vehicleId: vehicle.id,
  name: 'Camp chairs',
  category: 'camp',
  typicalWeightLb: 50,
  quantity: 2,
  compartment: roofCompartment,
  source: 'user_estimate',
  confidence: 62,
}));

const result = operatingWeight.calculateVehicleOperatingWeight({
  vehicle,
  buildState,
  legacyLoadoutItems: [{
    id: 'legacy-tool-roll',
    loadout_id: 'loadout-1',
    name: 'Tool roll',
    category: 'tools',
    quantity: 1,
    weight_lbs: 20,
    weight_source: 'measured',
    storage_location: 'bed drawer',
  }],
});

assert.strictEqual(result.weightResult.baseNetWeight.lbs, 5000);
assert.strictEqual(result.weightResult.installedAccessoryWeight.lbs, 100);
assert.strictEqual(result.weightResult.activeLoadoutWeight.lbs, 120);
assert.strictEqual(result.weightResult.operatingWeight.lbs, 5220);
assert.strictEqual(result.weightResult.payloadRemaining.lbs, 780);
assert.strictEqual(result.dashboardData.baseVehicleWeight, 5000);
assert.strictEqual(result.dashboardData.hardwareWeight, 100);
assert.strictEqual(result.dashboardData.loadoutWeight, 120);
assert.strictEqual(result.dashboardData.totalVehicleWeight, 5220);
assert.strictEqual(result.dashboardData.operatingWeightMeta.payloadRemainingLb, 780);
assert.ok(result.dashboardData.cgResult.totalMass >= 5220, 'CG mass should be based on real operating weight.');
assert.ok(result.dashboardData.cgResult.modules.some((module) => module.id === 'fleet_roof'), 'Build/loadout zones should feed CG modules.');
assert.ok(result.centerOfGravity.z > 0.25, 'Roof load should raise the live COG calculation.');
assert.strictEqual(result.dashboardData.cgResult.yCG, result.centerOfGravity.y, 'Dashboard COG should use the live lateral COG result.');

const canonicalState = vehicleStateSelectors.selectFleetVehicleStateFromRecord({
  vehicle: {
    id: 'vehicle-weight-1',
    owner_user_id: 'user-1',
    name: 'Trail Rig',
    type: 'truck',
    make: 'Toyota',
    model: 'Tacoma',
    year: 2024,
    notes: null,
    fuel_tank_capacity_gal: 20,
    avg_mpg: null,
    current_fuel_percent: 50,
    water_capacity_gal: null,
    current_water_gal: 0,
    water_updated_at: null,
    created_at: '2026-04-27T00:00:00.000Z',
    updated_at: '2026-04-27T00:00:00.000Z',
  },
  spec: {
    base_weight_lb: 5000,
    gvwr_lb: 6000,
    front_base_weight_lb: 2600,
    rear_base_weight_lb: 2400,
    fuel_tank_capacity_gal: 20,
    fuel_type: 'gas',
  },
  consumables: {
    fuel_percent_current: 50,
    fuel_gal_current: 8,
    water_gal_current: 4,
  },
  tiresLift: {
    tireSizeInches: 35,
    suspensionLiftInches: 2,
    isLeveled: true,
    frontLevelInches: 2,
    updatedAt: '2026-04-27T00:00:00.000Z',
  },
  buildLoadoutState: buildState,
  legacyLoadoutItems: [{
    id: 'legacy-tool-roll',
    loadout_id: 'loadout-1',
    name: 'Tool roll',
    category: 'tools',
    quantity: 1,
    weight_lbs: 20,
    weight_source: 'measured',
    storage_location: 'bed drawer',
  }],
});
assert.strictEqual(
  canonicalState.weightSummary.operatingWeightLb,
  canonicalState.operatingWeight.weightResult.operatingWeight.lbs,
  'Canonical Fleet state should expose one operating weight for cards, Weight Summary, and readiness.',
);
assert.strictEqual(canonicalState.resourceProfile.currentFuelGallons, 8);
assert.strictEqual(canonicalState.resourceProfile.currentWaterGallons, 4);
assert.strictEqual(canonicalState.fleetVehicle.buildProfile.tireSizeInches, 35);
assert.strictEqual(canonicalState.fleetVehicle.buildProfile.suspensionLiftInches, 2);
assert.strictEqual(canonicalState.scoringResult.readinessScore, canonicalState.weightSummary.readinessScore);

const unknownItemResult = operatingWeight.calculateVehicleOperatingWeight({
  vehicle,
  buildState: {
    ...buildState,
    loadoutItems: [
      ...(buildState.loadoutItems ?? []),
      {
        id: 'missing-weight',
        name: 'Mystery crate',
        category: 'unknown',
        typicalWeightLb: 0,
        quantity: 1,
        compartmentId: roofCompartment.id,
        loadZone: roofCompartment.loadZone,
        permanence: 'trip',
        source: 'unknown',
        confidence: 0,
        presetId: 'custom',
      },
    ],
  },
});
assert.ok(
  unknownItemResult.partialDataReasons.some((reason) => reason.includes('loadout item weight')),
  'Missing loadout weights should be reported as partial data.',
);
assert.strictEqual(
  unknownItemResult.centerOfGravity.dataQuality,
  'missing_item_weights',
  'Missing item weights should degrade COG data quality.',
);

const driverSideItem = {
  id: 'driver-side-crate',
  vehicleId: vehicle.id,
  name: 'Driver side crate',
  category: 'tools',
  quantity: 1,
  weight: fleet.createFleetWeightValue(300, 'user_estimate', { sourceLabel: 'Driver side crate' }),
  loadZone: 'bedLow',
  compartmentId: 'driver-side-bed-bin',
  isCritical: false,
  isPacked: true,
  display: fleet.buildFleetDisplayMetadata({ title: 'Driver side crate', vehicleType: 'driver bed bin' }),
};
const passengerSideItem = {
  ...driverSideItem,
  id: 'passenger-side-crate',
  name: 'Passenger side crate',
  compartmentId: 'passenger-side-bed-bin',
  display: fleet.buildFleetDisplayMetadata({ title: 'Passenger side crate', vehicleType: 'passenger bed bin' }),
};
const driverCg = operatingWeight.calculateVehicleOperatingWeight({ vehicle, loadoutItems: [driverSideItem] });
const passengerCg = operatingWeight.calculateVehicleOperatingWeight({ vehicle, loadoutItems: [passengerSideItem] });
assert.ok(driverCg.centerOfGravity.y < 0.5, 'Driver-side placement should move COG toward driver side.');
assert.ok(passengerCg.centerOfGravity.y > 0.5, 'Passenger-side placement should move COG toward passenger side.');

const frameworkAccessoryResult = operatingWeight.calculateVehicleOperatingWeight({
  vehicle,
  frameworkContainerZones: [{
    id: 'roof_rack',
    label: 'Roof Rack',
    accessoryKey: 'roofRackCrossbars',
    status: 'installed',
    icon: 'resize-outline',
    color: '#C48A2C',
    sortOrder: 1,
    verticalBias: 'high',
    longitudinalBias: 'mid',
    lateralBias: 'center',
  }],
});
assert.ok(
  frameworkAccessoryResult.weightResult.installedAccessoryWeight.lbs >= 75,
  'Saved accessory framework selections should feed Weight Summary accessory weight.',
);
assert.ok(
  frameworkAccessoryResult.centerOfGravity.z > operatingWeight.calculateVehicleOperatingWeight({ vehicle }).centerOfGravity.z,
  'Framework roof placement should affect COG height.',
);

let moveState = buildLoadout.createEmptyFleetBuildLoadoutState();
const cap = buildLoadout.buildFleetAccessoryInstall({
  accessoryId: 'truck_cap_smartcap',
  vehicleId: vehicle.id,
  knowledgeMode: 'estimate',
});
moveState = buildLoadout.upsertFleetAccessoryInstall(moveState, cap);
const driverBin = moveState.compartments.find((item) => item.name.toLowerCase().includes('driver'));
const passengerBin = moveState.compartments.find((item) => item.name.toLowerCase().includes('passenger'));
assert.ok(driverBin && passengerBin, 'SmartCap should expose driver and passenger compartments.');
const movableItem = buildLoadout.buildFleetCompartmentLoadoutItem({
  vehicleId: vehicle.id,
  name: 'Tool kit',
  category: 'tools',
  typicalWeightLb: 250,
  quantity: 1,
  compartment: driverBin,
});
const movedItem = buildLoadout.buildFleetCompartmentLoadoutItem({
  vehicleId: vehicle.id,
  name: 'Tool kit',
  category: 'tools',
  typicalWeightLb: 250,
  quantity: 1,
  compartment: passengerBin,
});
const driverPlacement = operatingWeight.calculateVehicleOperatingWeight({
  vehicle,
  buildState: buildLoadout.upsertFleetCompartmentLoadoutItem(moveState, movableItem),
});
const passengerPlacement = operatingWeight.calculateVehicleOperatingWeight({
  vehicle,
  buildState: buildLoadout.upsertFleetCompartmentLoadoutItem(moveState, { ...movedItem, id: movableItem.id }),
});
assert.ok(
  driverPlacement.centerOfGravity.y < passengerPlacement.centerOfGravity.y,
  'Moving an item between compartments should recalculate lateral COG.',
);

const heavyAccessory = {
  ...roofRack,
  id: `${vehicle.id}:heavy-test`,
  installedWeightLb: 1200,
};
const heavyState = buildLoadout.upsertFleetAccessoryInstall(buildLoadout.createEmptyFleetBuildLoadoutState(), heavyAccessory);
const overweight = operatingWeight.calculateVehicleOperatingWeight({ vehicle, buildState: heavyState });
assert.ok(overweight.weightResult.payloadRemaining.lbs < 0, 'Known over-capacity operating weight should produce negative payload margin.');
assert.ok(
  overweight.dashboardData.operatingWeightMeta.partialDataReasons.some((reason) => reason.includes('exceeds GVWR')),
  'Overweight warning should be preserved in dashboard metadata.',
);

console.log('Fleet operating weight assertions passed.');

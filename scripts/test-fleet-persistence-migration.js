const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const vehicleStorePath = path.join(root, 'lib', 'vehicleStore.ts');
const vehicleSpecStorePath = path.join(root, 'lib', 'vehicleSpecStore.ts');
const consumablesStorePath = path.join(root, 'lib', 'consumablesStore.ts');
const tiresLiftStorePath = path.join(root, 'lib', 'tiresLiftStore.ts');
const buildLoadoutPath = path.join(root, 'lib', 'fleet', 'fleetBuildLoadout.ts');
const selectorsPath = path.join(root, 'lib', 'fleet', 'fleetVehicleStateSelectors.ts');
const fleetDomainPath = path.join(root, 'lib', 'fleet', 'fleetPremiumDomain.ts');

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

const { normalizeVehicleRecord } = require(vehicleStorePath);
const { migrateSpec, vehicleSpecStore } = require(vehicleSpecStorePath);
const { consumablesStore } = require(consumablesStorePath);
const { normalizeTiresLiftConfig, tiresLiftStore } = require(tiresLiftStorePath);
const buildLoadout = require(buildLoadoutPath);
const selectors = require(selectorsPath);
const fleet = require(fleetDomainPath);

function almostEqual(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 0.001, `${message}: expected ${expected}, received ${actual}`);
}

const vehicleId = 'legacy-missing-advanced-specs-regression';
const sparseVehicle = normalizeVehicleRecord({
  id: vehicleId,
  owner_user_id: 'local',
  name: 'Old Saved Rig',
  type: 'truck',
  make: 'Toyota',
  model: 'Tacoma',
  year: 2020,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
});

assert.strictEqual(sparseVehicle.suspension_lift_inches, 0, 'Old vehicles should default suspension height to stock/0.');
assert.strictEqual(sparseVehicle.is_leveled, false, 'Old vehicles should default Level to disabled.');
assert.strictEqual(sparseVehicle.front_level_inches, null, 'Old vehicles should default front level to null.');
assert.strictEqual(sparseVehicle.tire_size_inches, null, 'Old vehicles should leave unknown tire size null.');
assert.strictEqual(sparseVehicle.current_water_gal, 0, 'Old vehicles should default water gallons to 0.');

const defaultConsumables = consumablesStore.get(`${vehicleId}-missing-consumables`);
assert.strictEqual(defaultConsumables.water_gal_current, 0, 'Missing consumables should default water gallons to 0.');
assert.strictEqual(defaultConsumables.fuel_gal_current, 0, 'Missing consumables should default fuel gallons to 0.');
assert.strictEqual(defaultConsumables.fuel_percent_current, 0, 'Missing consumables should not imply a full fuel tank.');

const defaultTiresLift = tiresLiftStore.get(`${vehicleId}-missing-tires-lift`);
assert.strictEqual(defaultTiresLift, null, 'Missing tires/lift records may remain absent at rest.');
const normalizedTiresLift = normalizeTiresLiftConfig({
  tireSizeInches: undefined,
  suspensionLiftInches: undefined,
  isLeveled: undefined,
  frontLevelInches: undefined,
  updatedAt: undefined,
});
assert.strictEqual(normalizedTiresLift.tireSizeInches, 0, 'Malformed tires/lift records should default tire size to unknown/0.');
assert.strictEqual(normalizedTiresLift.suspensionLiftInches, 0, 'Malformed tires/lift records should default suspension height to 0.');
assert.strictEqual(normalizedTiresLift.isLeveled, false, 'Malformed tires/lift records should default Level to disabled.');
assert.strictEqual(normalizedTiresLift.frontLevelInches, null, 'Malformed tires/lift records should default front level to null.');

const migratedSpec = migrateSpec({
  base_weight_lb: 5000,
  gvwr_lb: 6200,
  fuel_tank_capacity_gal: 21,
  fuel_type: 'gas',
});
assert.strictEqual(migratedSpec.suspension_lift_inches, 0, 'Migrated specs should default suspension height to 0.');
assert.strictEqual(migratedSpec.is_leveled, false, 'Migrated specs should default Level to disabled.');
assert.strictEqual(migratedSpec.front_level_inches, null, 'Migrated specs should default front level to null.');

const rawBuildLoadout = {
  accessories: [{
    id: `${vehicleId}:custom_accessory`,
    accessoryId: 'custom_accessory',
  }],
  loadoutItems: [{
    id: 'legacy-recovery-box',
    name: 'Recovery Box',
    typicalWeightLb: 40,
    quantity: 1,
    compartmentId: `${vehicleId}:custom_accessory:custom_compartment`,
  }],
};
const normalizedBuildLoadout = buildLoadout.normalizeFleetBuildLoadoutState(rawBuildLoadout);
const customAccessory = normalizedBuildLoadout.accessories.find((item) => item.accessoryId === 'custom_accessory');
const customCompartment = normalizedBuildLoadout.compartments.find((item) => item.accessoryId === 'custom_accessory');
const customItem = normalizedBuildLoadout.loadoutItems.find((item) => item.id === 'legacy-recovery-box');
assert.ok(customAccessory, 'Existing custom accessory install should be preserved.');
assert.strictEqual(customAccessory.installedWeightLb, 50, 'Custom accessory with missing weight should use catalog default weight.');
assert.deepStrictEqual(customAccessory.scoringEffects, ['payload'], 'Custom accessory should backfill scoring effects.');
assert.ok(customCompartment, 'Custom accessory should backfill its compartment on read.');
assert.strictEqual(customCompartment.loadZone, 'rearLow', 'Backfilled custom compartment should use the accessory location.');
assert.ok(customItem, 'Custom loadout items should survive normalization.');
assert.strictEqual(customItem.loadZone, 'rearLow', 'Custom item with missing location should inherit its compartment location.');
assert.deepStrictEqual(
  customItem.placement,
  { x: 0.78, y: 0.5, z: 0.22, source: 'fleet_load_zone', status: 'assigned' },
  'Custom item with missing placement should receive COG-safe compartment placement.',
);

const fleetVehicle = fleet.adaptLegacyVehicleToFleetVehicle({
  vehicle: sparseVehicle,
  specs: {
    base_weight_lb: 5000,
    gvwr_lb: 6200,
    fuel_tank_capacity_gal: 21,
    fuel_type: 'gas',
  },
});
const loadoutSummary = buildLoadout.calculateFleetBuildLoadoutSummary(fleetVehicle, normalizedBuildLoadout);
assert.strictEqual(loadoutSummary.accessoryWeightLb, 50);
assert.strictEqual(loadoutSummary.loadoutWeightLb, 40);
assert.strictEqual(loadoutSummary.weightResult.activeLoadoutWeight.lbs, 40);
assert.strictEqual(loadoutSummary.weightResult.zoneWeights.rearLow.loadoutWeight.lbs, 40);

const canonical = selectors.selectFleetVehicleStateFromRecord({
  vehicle: {
    ...sparseVehicle,
    wizard_config: {
      fleet_build_loadout: rawBuildLoadout,
    },
  },
  spec: {
    base_weight_lb: 5000,
    gvwr_lb: 6200,
    fuel_tank_capacity_gal: 21,
    fuel_type: 'gas',
  },
  buildLoadoutState: normalizedBuildLoadout,
  legacyLoadoutItems: [],
  frameworkContainerZones: [],
});

assert.strictEqual(canonical.resourceProfile.suspensionLiftInches, 0);
assert.strictEqual(canonical.resourceProfile.isLeveled, false);
assert.strictEqual(canonical.resourceProfile.frontLevelInches, null);
assert.strictEqual(canonical.resourceProfile.tireSizeInches, null);
assert.strictEqual(canonical.resourceProfile.currentWaterGallons, 0);
assert.strictEqual(canonical.resourceProfile.currentFuelGallons, 0);
assert.strictEqual(canonical.operatingWeight.weightResult.consumablesWeight.lbs, 0);
almostEqual(
  canonical.weightSummary.operatingWeightLb,
  5000 + 50 + 40,
  'Derived operating weight should stay consistent after read-time defaulting.',
);
assert.strictEqual(canonical.operatingWeight.weightResult.zoneWeights.rearLow.loadoutWeight.lbs, 40);

console.log('Fleet persistence/default migration checks passed.');

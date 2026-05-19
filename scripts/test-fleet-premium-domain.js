const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const domainPath = path.join(root, 'lib', 'fleet', 'fleetPremiumDomain.ts');
const profilePath = path.join(root, 'lib', 'fleet', 'fleetVehicleProfile.ts');
const buildLoadoutPath = path.join(root, 'lib', 'fleet', 'fleetBuildLoadout.ts');
const weightSummaryPath = path.join(root, 'lib', 'fleet', 'fleetWeightSummary.ts');
const checklistPath = path.join(root, 'lib', 'fleet', 'fleetChecklist.ts');
const fabricPath = path.join(root, 'lib', 'fleet', 'fleetFabricService.ts');
const telemetryEventsPath = path.join(root, 'lib', 'fleet', 'fleetTelemetryEvents.ts');
const migrationPath = path.join(root, 'lib', 'fleet', 'fleetMigration.ts');
const releaseConfigPath = path.join(root, 'lib', 'fleet', 'fleetPremiumReleaseConfig.ts');
const resourceForecastPath = path.join(root, 'lib', 'resourceForecastEngine.ts');
const advancedSpecsPath = path.join(root, 'lib', 'fleet', 'fleetAdvancedSpecs.ts');
const vehicleResourceProfilePath = path.join(root, 'lib', 'vehicleResourceProfile.ts');
const consumablesStorePath = path.join(root, 'lib', 'consumablesStore.ts');
const vehicleSpecStorePath = path.join(root, 'lib', 'vehicleSpecStore.ts');
const weightEnginePath = path.join(root, 'lib', 'weightEngine.ts');

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

const originalModuleLoad = Module._load;
Module._load = function patchedModuleLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};

const domainSource = fs.readFileSync(domainPath, 'utf8');
const fleet = require(domainPath);
const profile = require(profilePath);
const buildLoadout = require(buildLoadoutPath);
const weightSummary = require(weightSummaryPath);
const fleetChecklist = require(checklistPath);
const fabric = require(fabricPath);
const fleetTelemetryEvents = require(telemetryEventsPath);
const migration = require(migrationPath);
const releaseConfig = require(releaseConfigPath);
const resourceForecast = require(resourceForecastPath);
const advancedSpecs = require(advancedSpecsPath);
const vehicleResourceProfile = require(vehicleResourceProfilePath);
const consumables = require(consumablesStorePath);
const vehicleSpecs = require(vehicleSpecStorePath);
const weightEngine = require(weightEnginePath);

function walkKeys(value, visit) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    visit(key);
    walkKeys(child, visit);
  }
}

assert.deepStrictEqual(fleet.FLEET_LOAD_ZONES, [
  'frontLow',
  'rearLow',
  'bedLow',
  'bedHigh',
  'roof',
  'cab',
  'underbody',
  'hitch',
  'trailer',
]);

assert.deepStrictEqual(fleet.FLEET_BUILD_USE_CASES, [
  'daily',
  'work',
  'towing',
  'overland',
  'emergency',
  'winter',
  'family',
  'custom',
]);

assert.strictEqual(fleet.toFleetLoadZone('roof rack'), 'roof');
assert.strictEqual(fleet.toFleetLoadZone('rear drawer'), 'rearLow');
assert.strictEqual(fleet.toFleetLoadZone('bed upper shelf'), 'bedHigh');
assert.strictEqual(fleet.toFleetLoadZone('unknown', 'cab'), 'cab');
assert.deepStrictEqual(fleet.normalizeFleetBuildUseCases(['daily', 'daily', 'winter', 'bad']), ['daily', 'winter']);
assert.deepStrictEqual(fleet.normalizeFleetBuildUseCases([]), ['daily']);

const scaleWeight = fleet.createFleetWeightValue(6200.04, 'scale_ticket');
assert.strictEqual(scaleWeight.lbs, 6200);
assert.strictEqual(scaleWeight.confidence, 98);
assert.strictEqual(fleet.createFleetWeightValue(-5, 'user_estimate').lbs, 0);
assert.strictEqual(fleet.createFleetWeightValue(-5, 'calculated', { allowNegative: true }).lbs, -5);
assert.strictEqual(fleet.mapLegacyWeightSource('manufacturer'), 'manufacturer_spec');
assert.strictEqual(fleet.mapLegacyWeightSource('measured'), 'scale_ticket');
assert.strictEqual(fleet.mapLegacyWeightSource('estimate'), 'user_estimate');
assert.deepStrictEqual(fleet.FLEET_CONFIDENCE_TIERS.scale_ticket, { min: 98, max: 98, default: 98 });
assert.deepStrictEqual(fleet.FLEET_CONFIDENCE_TIERS.vin_oem_match, { min: 90, max: 95, default: 93 });
assert.deepStrictEqual(fleet.FLEET_CONFIDENCE_TIERS.manufacturer_spec, { min: 88, max: 95, default: 91 });
assert.deepStrictEqual(fleet.FLEET_CONFIDENCE_TIERS.exact_build_match, { min: 80, max: 88, default: 84 });
assert.deepStrictEqual(fleet.FLEET_CONFIDENCE_TIERS.vehicle_type_default, { min: 60, max: 72, default: 66 });
assert.deepStrictEqual(fleet.FLEET_CONFIDENCE_TIERS.user_estimate, { min: 55, max: 70, default: 62 });

function advancedDraft(overrides = {}) {
  return {
    suspensionLiftInches: 0,
    isLeveled: false,
    frontLevelInches: null,
    tireSizeInches: 33,
    waterGallons: '0',
    fuelGallons: '0',
    ...overrides,
  };
}

assert.deepStrictEqual(advancedSpecs.FLEET_ADVANCED_SUSPENSION_HEIGHT_OPTIONS, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.deepStrictEqual(advancedSpecs.FLEET_ADVANCED_FRONT_LEVEL_OPTIONS, [1, 2, 3, 4]);
assert.deepStrictEqual(
  [advancedSpecs.FLEET_ADVANCED_TIRE_SIZE_OPTIONS[0], advancedSpecs.FLEET_ADVANCED_TIRE_SIZE_OPTIONS.at(-1)],
  [26, 60],
);

for (let suspensionLiftInches = 0; suspensionLiftInches <= 10; suspensionLiftInches += 1) {
  assert.deepStrictEqual(
    advancedSpecs.validateFleetAdvancedSpecsDraft(advancedDraft({ suspensionLiftInches })),
    [],
    `Suspension ${suspensionLiftInches}" should be valid.`,
  );
}
assert.strictEqual(
  advancedSpecs.normalizeFleetAdvancedSpecsDraftForSave(advancedDraft({ suspensionLiftInches: 0 })).suspensionLiftInches,
  0,
  'Suspension 0 should persist as stock.',
);
assert.ok(
  advancedSpecs.validateFleetAdvancedSpecsDraft(advancedDraft({ suspensionLiftInches: -1 })).some((error) => error.includes('0-10')),
  'Suspension below range should be rejected.',
);
assert.ok(
  advancedSpecs.validateFleetAdvancedSpecsDraft(advancedDraft({ suspensionLiftInches: 11 })).some((error) => error.includes('0-10')),
  'Suspension above range should be rejected.',
);

for (const frontLevelInches of [1, 2, 3, 4]) {
  assert.deepStrictEqual(
    advancedSpecs.validateFleetAdvancedSpecsDraft(advancedDraft({ isLeveled: true, frontLevelInches })),
    [],
    `Front level ${frontLevelInches}" should be valid when Level is enabled.`,
  );
}
for (const frontLevelInches of [null, 0, 5]) {
  assert.ok(
    advancedSpecs.validateFleetAdvancedSpecsDraft(advancedDraft({ isLeveled: true, frontLevelInches })).some((error) => error.includes('1-4')),
    `Front level ${frontLevelInches} should be rejected when Level is enabled.`,
  );
}
assert.strictEqual(
  advancedSpecs.normalizeFleetAdvancedSpecsDraftForSave(advancedDraft({ isLeveled: false, frontLevelInches: 3 })).frontLevelInches,
  null,
  'Disabled Level should clear front level before save.',
);

for (const tireSizeInches of [26, 33, 60]) {
  assert.deepStrictEqual(
    advancedSpecs.validateFleetAdvancedSpecsDraft(advancedDraft({ tireSizeInches })),
    [],
    `Tire size ${tireSizeInches}" should be valid.`,
  );
}
assert.strictEqual(
  advancedSpecs.normalizeFleetAdvancedSpecsDraftForSave(advancedDraft({ tireSizeInches: 37 })).tireSizeInches,
  37,
  'Selected tire size should normalize for persistence.',
);
for (const tireSizeInches of [25, 61, null]) {
  assert.ok(
    advancedSpecs.validateFleetAdvancedSpecsDraft(advancedDraft({ tireSizeInches })).some((error) => error.includes('26-60')),
    `Tire size ${tireSizeInches} should be rejected.`,
  );
}

for (const waterGallons of ['0', '3.5', '1,200']) {
  assert.deepStrictEqual(
    advancedSpecs.validateFleetAdvancedSpecsDraft(advancedDraft({ waterGallons })),
    [],
    `Water gallons ${waterGallons} should be valid.`,
  );
}
assert.ok(
  advancedSpecs.validateFleetAdvancedSpecsDraft(advancedDraft({ waterGallons: '-1' })).some((error) => error.includes('Water gallons')),
  'Negative water gallons should be rejected.',
);
for (const fuelGallons of ['0', '4.25', '1,200']) {
  assert.deepStrictEqual(
    advancedSpecs.validateFleetAdvancedSpecsDraft(advancedDraft({ fuelGallons })),
    [],
    `Fuel gallons ${fuelGallons} should be valid.`,
  );
}
assert.ok(
  advancedSpecs.validateFleetAdvancedSpecsDraft(advancedDraft({ fuelGallons: '-1' })).some((error) => error.includes('Fuel gallons')),
  'Negative fuel gallons should be rejected.',
);
assert.strictEqual(
  advancedSpecs.parseFleetAdvancedNonNegativeDecimal('1,200.5'),
  1200.5,
  'Advanced gallons parser should accept comma-formatted non-negative decimals.',
);

const unknownRamDefault = fleet.resolveVehicleWeightDefault({
  make: 'RAM',
  model: '2500',
});
assert.strictEqual(unknownRamDefault.id, 'ram-2500-unknown-config');
assert.strictEqual(unknownRamDefault.netEmptyWeight.lbs, 7400);
assert.strictEqual(unknownRamDefault.netEmptyWeight.source, 'ecs_default');

const ramShortBedDefault = fleet.resolveVehicleWeightDefault({
  make: 'Ram',
  model: '2500',
  engine: '6.7L Cummins',
  drivetrain: '4x4',
  cab: 'Crew Cab',
  bedLength: 'Short Bed',
});
assert.strictEqual(ramShortBedDefault.id, 'ram-2500-cummins-crew-4x4-short-bed');
assert.ok(
  Math.abs(ramShortBedDefault.netEmptyWeight.lbs - 7742) <= 5,
  'RAM 2500 Cummins Crew 4x4 short bed should resolve to about 7,742 lb net weight.',
);
assert.strictEqual(ramShortBedDefault.netEmptyWeight.source, 'exact_build_match');
assert.ok(
  ramShortBedDefault.netEmptyWeight.confidence >= 80 && ramShortBedDefault.netEmptyWeight.confidence <= 88,
  'Configuration-aware RAM 2500 default should use the exact build match confidence tier.',
);
assert.ok(
  Math.abs(ramShortBedDefault.gvwr.lbs - 10190) <= 5,
  'RAM 2500 Cummins Crew 4x4 short bed should resolve to about 10,190 lb GVWR.',
);
assert.notStrictEqual(
  ramShortBedDefault.gvwr.lbs,
  ramShortBedDefault.netEmptyWeight.lbs,
  'RAM 2500 GVWR should remain separate from base net weight.',
);

assert.strictEqual(
  fleet.resolveVehicleWeightDefault({
    make: 'Ram',
    model: '2500',
    engine: 'gas Hemi',
    drivetrain: '4WD',
    cab: 'crew cab',
  }).netEmptyWeight.lbs,
  6680,
);
assert.strictEqual(
  fleet.resolveVehicleWeightDefault({
    make: 'Ram',
    model: '2500',
    engine: 'Cummins',
    drivetrain: '4WD',
    cab: 'crew',
    bedLength: 'long',
  }).netEmptyWeight.lbs,
  7888,
);
assert.strictEqual(
  fleet.resolveVehicleWeightDefault({
    make: 'Ram',
    model: '2500',
    engine: 'Cummins',
    drivetrain: '4WD',
    cab: 'Mega Cab',
  }).netEmptyWeight.lbs,
  8137,
);

const sum = fleet.sumFleetWeightValues(
  [
    fleet.createFleetWeightValue(100, 'scale_ticket'),
    fleet.createFleetWeightValue(50, 'user_estimate'),
  ],
  'test sum',
);
assert.strictEqual(sum.lbs, 150);
assert.ok(sum.confidence > 80 && sum.confidence < 90, 'Weighted confidence should reflect component weights.');

const legacy = fleet.adaptLegacyFleetData({
  now: '2026-04-27T00:00:00.000Z',
  useCases: ['overland', 'towing'],
  vehicle: {
    id: 'veh-1',
    owner_user_id: 'user-1',
    name: 'Trail Lead',
    type: 'truck',
    make: 'Toyota',
    model: 'Tacoma',
    year: 2022,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
  },
  specs: {
    base_weight_lb: 4500,
    gvwr_lb: 6100,
    trim: 'TRD',
    engine: 'V6',
    drivetrain: '4WD',
  },
  compartments: [
    { id: 'zone-1', vehicle_id: 'veh-1', name: 'Roof rack', zone_type: 'rack', sort_order: 1 },
    { id: 'zone-2', vehicle_id: 'veh-1', name: 'Hitch box', zone_type: 'hitch', sort_order: 2 },
  ],
  loadoutItems: [
    {
      id: 'item-1',
      loadout_id: 'loadout-1',
      name: 'Water',
      category: 'water',
      quantity: 2,
      weight_lbs: 40,
      weight_source: 'manufacturer',
      storage_location: 'roof rack',
      is_critical: true,
      is_packed: true,
    },
    {
      id: 'item-2',
      loadout_id: 'loadout-1',
      name: 'Recovery kit',
      category: 'recovery',
      quantity: 1,
      weight_lbs: 65,
      weight_source: 'measured',
      storage_location: 'rear drawer',
      is_critical: true,
      is_packed: false,
    },
  ],
});

assert.strictEqual(legacy.vehicle.buildProfile.baseNetWeight.lbs, 4500);
assert.strictEqual(legacy.vehicle.buildProfile.gvwr.lbs, 6100);
assert.deepStrictEqual(legacy.vehicle.buildProfile.useCases, ['overland', 'towing']);
assert.strictEqual(legacy.compartments[0].loadZone, 'roof');
assert.strictEqual(legacy.compartments[1].loadZone, 'hitch');
assert.strictEqual(legacy.loadoutItems[0].loadZone, 'roof');
assert.strictEqual(legacy.loadoutItems[0].weight.source, 'manufacturer_spec');
assert.strictEqual(legacy.weightResult.baseNetWeight.lbs, 4500);
assert.strictEqual(legacy.weightResult.installedAccessoryWeight.lbs, 0);
assert.strictEqual(legacy.weightResult.activeLoadoutWeight.lbs, 145);
assert.strictEqual(legacy.weightResult.operatingWeight.lbs, 4645);
assert.strictEqual(legacy.weightResult.payloadRemaining.lbs, 1455);
assert.strictEqual(
  legacy.weightResult.payloadRemaining.lbs,
  legacy.vehicle.buildProfile.gvwr.lbs - legacy.weightResult.operatingWeight.lbs,
  'payloadRemaining should equal GVWR minus operatingWeight.',
);
assert.strictEqual(legacy.weightResult.zoneWeights.roof.loadoutWeight.lbs, 80);
assert.ok(legacy.scoringResult.overallScore > 0, 'Scoring should produce a positive score.');

const rack = {
  id: 'acc-1',
  vehicleId: legacy.vehicle.id,
  catalogItemId: 'rack',
  name: 'Bed rack',
  installedWeight: fleet.createFleetWeightValue(170, 'manufacturer_spec'),
  loadZone: 'bedHigh',
  display: fleet.buildFleetDisplayMetadata({ title: 'Bed rack', vehicleType: 'rack', useCases: ['overland'] }),
};
const tent = {
  id: 'acc-2',
  vehicleId: legacy.vehicle.id,
  catalogItemId: 'tent',
  name: 'Roof tent',
  installedWeight: fleet.createFleetWeightValue(190, 'user_estimate'),
  loadZone: 'roof',
  display: fleet.buildFleetDisplayMetadata({ title: 'Roof tent', vehicleType: 'rack', useCases: ['overland'] }),
};
const weightResult = fleet.calculateFleetWeightResult(legacy.vehicle, [rack, tent], legacy.loadoutItems);
assert.strictEqual(weightResult.installedAccessoryWeight.lbs, 360);
assert.strictEqual(weightResult.activeLoadoutWeight.lbs, 145);
assert.strictEqual(weightResult.operatingWeight.lbs, 5005);
assert.strictEqual(
  weightResult.payloadRemaining.lbs,
  legacy.weightResult.payloadRemaining.lbs - weightResult.installedAccessoryWeight.lbs,
  'Accessory and loadout weights should reduce payload remaining.',
);
assert.strictEqual(weightResult.gvwrUsagePct, 82);
assert.ok(['watch', 'caution', 'critical'].includes(weightResult.topHeavyRisk), 'High zones should affect top-heavy risk.');

const ramFleetVehicle = fleet.adaptLegacyVehicleToFleetVehicle({
  vehicle: {
    id: 'ram-1',
    owner_user_id: 'user-1',
    name: 'Tow Pig',
    type: 'truck',
    make: 'RAM',
    model: '2500',
    year: 2024,
  },
  specs: {
    engine: 'Cummins',
    drivetrain: '4x4',
    cab: 'Crew Cab',
    bed_length: 'Short Bed',
  },
});
assert.strictEqual(ramFleetVehicle.buildProfile.baseNetWeight.lbs, 7742);
assert.strictEqual(ramFleetVehicle.buildProfile.baseNetWeight.source, 'exact_build_match');
assert.strictEqual(ramFleetVehicle.buildProfile.gvwr.lbs, 10190);
assert.notStrictEqual(ramFleetVehicle.buildProfile.gvwr.lbs, ramFleetVehicle.buildProfile.baseNetWeight.lbs);
assert.ok(ramFleetVehicle.display.iconKey, 'Fleet display metadata should provide an icon key for card rendering.');
assert.ok(ramFleetVehicle.display.chips.length > 0, 'Fleet display metadata should provide chips for card rendering.');

const consumableFleetVehicle = fleet.adaptLegacyVehicleToFleetVehicle({
  vehicle: {
    id: 'resource-1',
    owner_user_id: 'user-1',
    name: 'Resource Rig',
    type: 'truck',
    make: 'Toyota',
    model: 'Tacoma',
    fuel_tank_capacity_gal: 20,
    water_capacity_gal: 12,
  },
  specs: {
    base_weight_lb: 4500,
    gvwr_lb: 6100,
    fuel_tank_capacity_gal: 20,
    fuel_type: 'gas',
  },
  consumables: {
    fuel_percent_current: 50,
    fuel_gal_current: 12,
    water_gal_current: 10,
  },
  tiresLift: {
    tireSizeInches: 33,
    suspensionLiftInches: 2,
    isLeveled: true,
    frontLevelInches: 2,
  },
});
const consumableWeightResult = fleet.calculateFleetWeightResult(consumableFleetVehicle, [], []);
assert.strictEqual(consumableFleetVehicle.buildProfile.tireSizeInches, 33);
assert.strictEqual(consumableFleetVehicle.buildProfile.suspensionLiftInches, 2);
assert.strictEqual(consumableFleetVehicle.buildProfile.isLeveled, true);
assert.strictEqual(consumableFleetVehicle.buildProfile.frontLevelInches, 2);
assert.strictEqual(consumableFleetVehicle.buildProfile.resourceProfile.currentFuelGallons, 12);
assert.strictEqual(consumableFleetVehicle.buildProfile.resourceProfile.currentFuelWeight.sourceLabel, 'Current fuel gallons');
assert.strictEqual(consumableFleetVehicle.buildProfile.resourceProfile.currentWaterGallons, 10);
assert.strictEqual(consumableWeightResult.consumablesWeight.lbs, 155.4);
assert.strictEqual(consumableWeightResult.operatingWeight.lbs, 4655.4);
assert.strictEqual(
  consumableWeightResult.payloadRemaining.lbs,
  1444.6,
  'Fleet operating weight should include fuel and water once when resource data is available.',
);

const advancedSpecsVehicle = fleet.adaptLegacyVehicleToFleetVehicle({
  vehicle: {
    id: 'advanced-pipeline-1',
    owner_user_id: 'user-1',
    name: 'Advanced Pipeline Rig',
    type: 'truck',
    make: 'Toyota',
    model: 'Tacoma',
    fuel_tank_capacity_gal: 20,
    water_capacity_gal: 10,
  },
  specs: {
    base_weight_lb: 1000,
    gvwr_lb: 2000,
    fuel_tank_capacity_gal: 20,
    fuel_type: 'gas',
  },
  consumables: {
    fuel_percent_current: 25,
    fuel_gal_current: 4,
    water_gal_current: 10,
  },
  tiresLift: {
    tireSizeInches: 37,
    suspensionLiftInches: 0,
    isLeveled: true,
    frontLevelInches: 3,
  },
});
const advancedSpecsWeightResult = fleet.calculateFleetWeightResult(advancedSpecsVehicle, [], []);
assert.strictEqual(advancedSpecsVehicle.buildProfile.suspensionLiftInches, 0);
assert.strictEqual(advancedSpecsVehicle.buildProfile.isLeveled, true);
assert.strictEqual(advancedSpecsVehicle.buildProfile.frontLevelInches, 3);
assert.strictEqual(advancedSpecsVehicle.buildProfile.tireSizeInches, 37);
assert.strictEqual(advancedSpecsVehicle.buildProfile.resourceProfile.currentFuelWeight.lbs, 4 * vehicleSpecs.FUEL_WEIGHT_PER_GAL.gas);
assert.strictEqual(advancedSpecsVehicle.buildProfile.resourceProfile.currentWaterWeight.lbs, 10 * consumables.WATER_DENSITY_LB_PER_GAL);
assert.strictEqual(
  advancedSpecsWeightResult.consumablesWeight.lbs,
  (4 * vehicleSpecs.FUEL_WEIGHT_PER_GAL.gas) + (10 * consumables.WATER_DENSITY_LB_PER_GAL),
  'Weight pipeline should include Advanced Specs fuel and water pounds.',
);
assert.strictEqual(
  advancedSpecsWeightResult.operatingWeight.lbs,
  1000 + advancedSpecsWeightResult.consumablesWeight.lbs,
  'Operating weight should update when Advanced Specs fuel/water gallons are saved.',
);
const advancedSpecsWeightSummary = weightSummary.buildFleetWeightSummary(
  advancedSpecsVehicle,
  advancedSpecsWeightResult,
);
assert.strictEqual(
  advancedSpecsWeightSummary.operatingWeightLb,
  advancedSpecsWeightResult.operatingWeight.lbs,
  'Weight Summary should reflect Advanced Specs consumables weight.',
);

const advancedOperationalProfile = vehicleResourceProfile.getVehicleResourceProfile(
  {
    id: 'advanced-pipeline-1',
    fuel_tank_capacity_gal: 20,
    water_capacity_gal: 10,
  },
  {
    spec: { fuel_tank_capacity_gal: 20, fuel_type: 'gas' },
    consumables: { fuel_percent_current: 25, fuel_gal_current: 4, water_gal_current: 10 },
    tiresLift: { tireSizeInches: 37, suspensionLiftInches: 0, isLeveled: true, frontLevelInches: 3 },
  },
);
assert.strictEqual(advancedOperationalProfile.currentFuelGallons, 4);
assert.strictEqual(advancedOperationalProfile.currentFuelWeightLb, 24);
assert.strictEqual(advancedOperationalProfile.currentWaterGallons, 10);
assert.strictEqual(advancedOperationalProfile.currentWaterWeightLb, 83.4);
assert.strictEqual(advancedOperationalProfile.tireSizeInches, 37);
assert.strictEqual(advancedOperationalProfile.suspensionLiftInches, 0);
assert.strictEqual(advancedOperationalProfile.isLeveled, true);
assert.strictEqual(advancedOperationalProfile.frontLevelInches, 3);
const forecast = resourceForecast.computeResourceForecast(
  {
    id: 'route-resource-test',
    totalDistanceMiles: 24,
    estimatedDriveTimeHours: 2,
    overallDifficulty: 'easy',
  },
  {
    fuelCapacityGallons: 20,
    currentFuelPercent: 50,
    currentFuelGallons: 12,
    fuelWeightLbs: consumableFleetVehicle.buildProfile.resourceProfile.currentFuelWeight.lbs,
    waterCapacityGallons: 12,
    currentWaterGallons: 10,
    waterWeightLbs: consumableFleetVehicle.buildProfile.resourceProfile.currentWaterWeight.lbs,
    avgMpg: 12,
    totalWeightLbs: consumableWeightResult.operatingWeight.lbs,
    tireSizeInches: 33,
    suspensionLiftInches: 2,
    isLeveled: true,
    frontLevelInches: 2,
  },
  null,
  null,
  { difficulty: 'easy', isOffRoad: false },
);
assert.strictEqual(forecast.fuel.availableGallons, 12);
assert.ok(
  forecast.fuel.notes.some((note) => note.includes('Current fuel: 12.0 gal')),
  'Resource forecast should prefer saved current fuel gallons over percent-derived fuel.',
);
assert.strictEqual(forecast.water.availableGallons, 10);
assert.ok(
  forecast.water.notes.some((note) => note.includes('Current water: 10.0 gal')),
  'Resource forecast should consume saved water gallons when no loadout water override exists.',
);

const ramProfileDraft = profile.applyFleetProfilePreset(
  profile.createEmptyFleetVehicleProfileDraft(),
  'ram-2500-cummins-crew-4x4-short-bed',
);
ramProfileDraft.year = '2024';
const ramProfileSuggestion = profile.resolveFleetVehicleProfileSuggestion(ramProfileDraft);
assert.ok(Math.abs(ramProfileSuggestion.baseNetWeight.lbs - 7742) <= 5);
assert.ok(Math.abs(ramProfileSuggestion.gvwr.lbs - 10190) <= 5);
assert.ok(
  ramProfileSuggestion.confidenceExplanation.includes('ECS estimated this from vehicle configuration.'),
  'Profile flow should explain ECS configuration confidence.',
);
assert.strictEqual(profile.validateFleetVehicleProfileDraft(ramProfileDraft).length, 0);
assert.ok(
  profile.validateFleetVehicleProfileDraft({ ...ramProfileDraft, year: '' }).includes('Year is required.'),
  'Fleet profile validation should make year visibly required before confirming specs.',
);
assert.strictEqual(profile.calculateConfirmedPayloadRemaining(ramProfileDraft), 2448);
assert.ok(
  profile.validateFleetVehicleProfileDraft({
    ...ramProfileDraft,
    baseNetWeight: '12000',
    gvwr: '10000',
  }).some((error) => error.includes('below GVWR')),
  'Profile validation should reject impossible base/GVWR values.',
);

const checklist = [
  {
    id: 'check-1',
    vehicleId: legacy.vehicle.id,
    label: 'Verify tire pressure',
    category: 'required_setup',
    isRequired: true,
    isComplete: false,
    sortOrder: 1,
  },
];
const score = fleet.scoreFleetVehicle(legacy.vehicle, weightResult, checklist);
assert.ok(score.blockingIssues.some((issue) => issue.includes('Verify tire pressure')));

const payload = fleet.generateFleetFabricPayload({
  vehicle: legacy.vehicle,
  accessories: [rack, tent],
  compartments: legacy.compartments,
  loadoutItems: legacy.loadoutItems,
  checklistItems: checklist,
  weightResult,
  generatedAt: '2026-04-27T00:00:00.000Z',
});
assert.strictEqual(payload.schemaVersion, 'fleet.fabric.v1');
assert.strictEqual(payload.vehicle.nickname, 'Trail Lead');
assert.strictEqual(payload.weight.operatingWeight.lbs, 5005);
assert.strictEqual(payload.scoring.vehicleId, 'veh-1');

let buildState = buildLoadout.createEmptyFleetBuildLoadoutState();
const smartCap = buildLoadout.buildFleetAccessoryInstall({
  accessoryId: 'truck_cap_smartcap',
  vehicleId: legacy.vehicle.id,
  knowledgeMode: 'estimate',
});
buildState = buildLoadout.upsertFleetAccessoryInstall(buildState, smartCap);
buildState = {
  ...buildState,
  activePreset: 'daily',
  loadoutItems: [{
    id: 'existing-loadout-before-accessory-upsert',
    name: 'Existing kit',
    category: 'daily',
    typicalWeightLb: 12,
    quantity: 1,
    compartmentId: buildState.compartments[0].id,
    loadZone: buildState.compartments[0].loadZone,
    permanence: 'daily',
    source: 'user_estimate',
    confidence: 62,
    presetId: 'daily',
  }],
};
assert.strictEqual(buildState.accessories[0].installedWeightLb, 213);
assert.deepStrictEqual(
  buildState.compartments.map((item) => item.name),
  ['Driver Side Bin', 'Passenger Side Bin', 'Cap Roof Zone', 'Enclosed Bed'],
  'SmartCap should create side-bin, roof, and enclosed-bed compartments.',
);

const drawers = buildLoadout.buildFleetAccessoryInstall({
  accessoryId: 'bed_drawers_storage',
  vehicleId: legacy.vehicle.id,
  knowledgeMode: 'known_brand_model',
  brandModel: 'Decked',
});
buildState = buildLoadout.upsertFleetAccessoryInstall(buildState, drawers);
assert.strictEqual(
  buildState.activePreset,
  'daily',
  'Accessory upsert should preserve active loadout preset state.',
);
assert.ok(
  buildState.loadoutItems.some((item) => item.id === 'existing-loadout-before-accessory-upsert'),
  'Accessory upsert should preserve existing loadout items.',
);
assert.ok(
  ['Driver Drawer', 'Passenger Drawer', 'Deck Surface'].every((name) =>
    buildState.compartments.some((item) => item.name === name && item.status === 'active'),
  ),
  'Bed drawers should create driver drawer, passenger drawer, and deck surface compartments.',
);

const buildSummary = buildLoadout.calculateFleetBuildLoadoutSummary(legacy.vehicle, buildState);
assert.strictEqual(buildSummary.accessoryWeightLb, 393);
assert.strictEqual(buildSummary.activeCompartmentCount, 7);
assert.strictEqual(buildSummary.scoringEffects.payload, 2);
assert.ok(buildSummary.weightResult.payloadRemaining.lbs < legacy.weightResult.payloadRemaining.lbs);

const cabRackState = buildLoadout.upsertFleetAccessoryInstall(
  buildLoadout.createEmptyFleetBuildLoadoutState(),
  buildLoadout.buildFleetAccessoryInstall({
    accessoryId: 'cab_rack',
    vehicleId: legacy.vehicle.id,
    knowledgeMode: 'estimate',
  }),
);
const cabRackSummary = buildLoadout.calculateFleetBuildLoadoutSummary(legacy.vehicle, cabRackState);
const emptyVehicleWeightResult = fleet.calculateFleetWeightResult(legacy.vehicle);
assert.strictEqual(cabRackSummary.accessoryWeightLb, 85);
assert.strictEqual(cabRackSummary.scoringEffects.payload, 0);
assert.strictEqual(
  cabRackSummary.weightResult.payloadRemaining.lbs,
  emptyVehicleWeightResult.payloadRemaining.lbs,
  'Cab rack fit hardware should not reduce displayed payload remaining.',
);
assert.strictEqual(
  cabRackSummary.weightResult.zoneWeights.cab.accessoryWeight.lbs,
  85,
  'Cab rack should remain available to the balance/CG model even when excluded from payload remaining.',
);

let customAccessoryState = buildLoadout.createEmptyFleetBuildLoadoutState();
const customAccessory = buildLoadout.buildFleetAccessoryInstall({
  accessoryId: 'custom_accessory',
  vehicleId: legacy.vehicle.id,
  knowledgeMode: 'manual_weight',
  manualWeightLb: 40,
});
const roofMountedCustomAccessory = buildLoadout.buildFleetAccessoryInstall({
  accessoryId: 'custom_accessory',
  vehicleId: legacy.vehicle.id,
  knowledgeMode: 'manual_weight',
  manualWeightLb: 40,
  mountZone: 'roof',
});
assert.strictEqual(
  buildLoadout.generateFleetAccessoryCompartments(roofMountedCustomAccessory)[0].loadZone,
  'roof',
  'Custom Accessory compartment location should follow the selected accessory mount zone.',
);
assert.ok(
  buildLoadout.normalizeFleetBuildLoadoutState({ accessories: [customAccessory], compartments: [], loadoutItems: [] }).compartments
    .some((item) => item.accessoryId === 'custom_accessory' && item.name === 'Custom Compartment'),
  'Existing saved Custom Accessory installs should backfill the custom compartment on read.',
);
customAccessoryState = buildLoadout.upsertFleetAccessoryInstall(customAccessoryState, customAccessory);
const customCompartment = customAccessoryState.compartments.find((item) => item.accessoryId === 'custom_accessory');
assert.ok(customCompartment, 'Custom Accessory should create a compartment-scoped loadout container.');
assert.strictEqual(customCompartment.name, 'Custom Compartment');
assert.strictEqual(
  buildLoadout.groupFleetCompartmentsByZone(customAccessoryState.compartments).find((group) => group.id === 'custom').compartments[0].id,
  customCompartment.id,
  'Custom Accessory compartments should render in the Custom loadout group.',
);
assert.deepStrictEqual(
  buildLoadout.validateFleetCompartmentLoadoutDraft({
    name: 'Custom camp module',
    typicalWeightLb: '25',
    quantity: '1',
    compartmentId: customCompartment.id,
    loadZone: 'rearLow',
    activeCompartments: customAccessoryState.compartments,
  }),
  [],
  'Valid custom item form values should pass validation.',
);
assert.ok(
  buildLoadout.validateFleetCompartmentLoadoutDraft({
    name: '',
    typicalWeightLb: '25',
    quantity: '1',
    compartmentId: customCompartment.id,
    loadZone: 'rearLow',
    activeCompartments: customAccessoryState.compartments,
  }).includes('Item name is required'),
  'Custom item form should require a name.',
);
assert.ok(
  buildLoadout.validateFleetCompartmentLoadoutDraft({
    name: 'Bad weight',
    typicalWeightLb: '-1',
    quantity: '1',
    compartmentId: customCompartment.id,
    loadZone: 'rearLow',
    activeCompartments: customAccessoryState.compartments,
  }).includes('Item weight must be numeric and non-negative'),
  'Custom item form should reject negative weight.',
);
assert.ok(
  buildLoadout.validateFleetCompartmentLoadoutDraft({
    name: 'Bad quantity',
    typicalWeightLb: '25',
    quantity: '0',
    compartmentId: customCompartment.id,
    loadZone: 'rearLow',
    activeCompartments: customAccessoryState.compartments,
  }).includes('Quantity must be positive'),
  'Custom item form should reject zero quantity.',
);
assert.ok(
  buildLoadout.validateFleetCompartmentLoadoutDraft({
    name: 'Bad location',
    typicalWeightLb: '25',
    quantity: '1',
    compartmentId: customCompartment.id,
    loadZone: 'not-a-zone',
    activeCompartments: customAccessoryState.compartments,
  }).includes('Choose a valid vehicle location'),
  'Custom item form should reject invalid vehicle locations.',
);
const customLoadoutItem = buildLoadout.buildFleetCompartmentLoadoutItem({
  vehicleId: legacy.vehicle.id,
  name: 'Custom camp module',
  category: 'custom',
  typicalWeightLb: 22.5,
  quantity: 2,
  compartment: customCompartment,
  permanence: 'trip',
  source: 'user_estimate',
  confidence: 62,
  presetId: 'custom',
});
customAccessoryState = buildLoadout.upsertFleetCompartmentLoadoutItem(customAccessoryState, customLoadoutItem);
const customAccessorySummary = buildLoadout.calculateFleetBuildLoadoutSummary(legacy.vehicle, customAccessoryState);
assert.strictEqual(customAccessorySummary.accessoryWeightLb, 40);
assert.strictEqual(customAccessorySummary.loadoutWeightLb, 45);
assert.strictEqual(customAccessorySummary.weightResult.activeLoadoutWeight.lbs, 45);
assert.strictEqual(customAccessorySummary.weightResult.zoneWeights[customCompartment.loadZone].loadoutWeight.lbs, 45);
assert.deepStrictEqual(
  buildLoadout.toFleetCompartmentLoadoutItems(customAccessoryState, legacy.vehicle.id)[0].placement,
  customCompartment.placement,
  'Custom loadout items should keep compartment placement for center-of-gravity math.',
);
const rearCustomItemState = buildLoadout.upsertFleetCompartmentLoadoutItem({
  ...buildLoadout.createEmptyFleetBuildLoadoutState(),
  accessories: [customAccessory],
  compartments: customAccessoryState.compartments,
}, {
  ...buildLoadout.buildFleetCompartmentLoadoutItem({
    vehicleId: legacy.vehicle.id,
    name: 'Rear custom item',
    category: 'custom',
    typicalWeightLb: 25,
    quantity: 1,
    compartment: customCompartment,
    loadZone: 'rearLow',
    permanence: 'trip',
    source: 'user_estimate',
    confidence: 62,
    presetId: 'custom',
  }),
  id: 'rear-custom-25',
});
const roofCustomItemState = buildLoadout.upsertFleetCompartmentLoadoutItem({
  ...buildLoadout.createEmptyFleetBuildLoadoutState(),
  accessories: [customAccessory],
  compartments: customAccessoryState.compartments,
}, {
  ...buildLoadout.buildFleetCompartmentLoadoutItem({
    vehicleId: legacy.vehicle.id,
    name: 'Roof custom item',
    category: 'custom',
    typicalWeightLb: 25,
    quantity: 1,
    compartment: customCompartment,
    loadZone: 'roof',
    permanence: 'trip',
    source: 'user_estimate',
    confidence: 62,
    presetId: 'custom',
  }),
  id: 'roof-custom-25',
});
const rearCustomSummary = buildLoadout.calculateFleetBuildLoadoutSummary(legacy.vehicle, rearCustomItemState);
const roofCustomSummaryForCg = buildLoadout.calculateFleetBuildLoadoutSummary(legacy.vehicle, roofCustomItemState);
assert.strictEqual(rearCustomSummary.loadoutWeightLb, 25);
assert.strictEqual(rearCustomSummary.weightResult.activeLoadoutWeight.lbs, 25);
assert.strictEqual(rearCustomSummary.weightResult.zoneWeights.rearLow.loadoutWeight.lbs, 25);
assert.strictEqual(roofCustomSummaryForCg.weightResult.zoneWeights.roof.loadoutWeight.lbs, 25);
assert.strictEqual(roofCustomSummaryForCg.weightResult.zoneWeights.rearLow.loadoutWeight.lbs, 0);
assert.deepStrictEqual(
  buildLoadout.toFleetLoadoutZoneWeights(rearCustomItemState),
  [{ zoneId: 'rear-custom-25', zoneName: 'Rear custom item', weightLbs: 25, posX: 0.78, posY: 0.5, posZ: 0.22 }],
  'Custom loadout items should map into the same zone-weight input consumed by CG.',
);
const rearCustomCg = weightEngine.calculateCG({}, buildLoadout.toFleetLoadoutZoneWeights(rearCustomItemState));
const roofCustomCg = weightEngine.calculateCG({}, buildLoadout.toFleetLoadoutZoneWeights(roofCustomItemState));
assert.notStrictEqual(rearCustomCg.xCG, roofCustomCg.xCG, 'Moving a 25 lb custom item should change longitudinal CG.');
assert.ok(roofCustomCg.zCG > rearCustomCg.zCG, 'Moving a 25 lb custom item to roof should raise vertical CG.');
const negativeCustomItem = buildLoadout.buildFleetCompartmentLoadoutItem({
  vehicleId: legacy.vehicle.id,
  name: 'Invalid negative custom item',
  category: 'custom',
  typicalWeightLb: -25,
  quantity: 2,
  compartment: customCompartment,
  loadZone: 'rearLow',
});
assert.strictEqual(negativeCustomItem.typicalWeightLb, 0, 'Custom item weights should not persist as negative values.');

const riskTestState = {
  accessories: [],
  compartments: [
    {
      id: 'risk-bed-low',
      vehicleId: legacy.vehicle.id,
      name: 'Driver Drawer',
      loadZone: 'bedLow',
      accessoryId: 'custom_accessory',
      sortOrder: 0,
      status: 'active',
      display: { iconKey: 'cube-outline', title: 'Driver Drawer', chips: ['bedLow'] },
    },
    {
      id: 'risk-roof',
      vehicleId: legacy.vehicle.id,
      name: 'Roof Zone',
      loadZone: 'roof',
      accessoryId: 'custom_accessory',
      sortOrder: 1,
      status: 'active',
      display: { iconKey: 'cube-outline', title: 'Roof Zone', chips: ['roof'] },
    },
  ],
  loadoutItems: [],
  activePreset: 'custom',
};
const drawerCompartment = riskTestState.compartments.find((item) => item.name === 'Driver Drawer');
const roofCompartment = riskTestState.compartments.find((item) => item.name === 'Roof Zone');
assert.ok(drawerCompartment && roofCompartment, 'Drawer and roof compartments should exist for zone risk checks.');
const emptyRiskSummary = buildLoadout.calculateFleetBuildLoadoutSummary(legacy.vehicle, riskTestState);
let bedLowItemState = buildLoadout.upsertFleetCompartmentLoadoutItem(riskTestState, {
  ...buildLoadout.buildFleetCompartmentLoadoutItem({
    vehicleId: legacy.vehicle.id,
    name: 'Spare parts',
    category: 'work',
    typicalWeightLb: 100,
    compartment: drawerCompartment,
    permanence: 'work_day',
    source: 'user_estimate',
    confidence: 62,
  }),
  id: 'move-risk-item',
});
let bedLowSummary = buildLoadout.calculateFleetBuildLoadoutSummary(legacy.vehicle, bedLowItemState);
let roofItemState = buildLoadout.removeFleetCompartmentLoadoutItem(bedLowItemState, 'move-risk-item');
roofItemState = buildLoadout.upsertFleetCompartmentLoadoutItem(roofItemState, {
  ...buildLoadout.buildFleetCompartmentLoadoutItem({
    vehicleId: legacy.vehicle.id,
    name: 'Spare parts',
    category: 'work',
    typicalWeightLb: 100,
    compartment: roofCompartment,
    permanence: 'work_day',
    source: 'user_estimate',
    confidence: 62,
  }),
  id: 'move-risk-item',
});
const roofSummary = buildLoadout.calculateFleetBuildLoadoutSummary(legacy.vehicle, roofItemState);
const emptyRiskWeightSummary = weightSummary.buildFleetWeightSummary(
  legacy.vehicle,
  emptyRiskSummary.weightResult,
  emptyRiskSummary.scoringResult,
);
const roofWeightSummary = weightSummary.buildFleetWeightSummary(
  legacy.vehicle,
  roofSummary.weightResult,
  roofSummary.scoringResult,
);
const riskRank = { clear: 0, watch: 1, caution: 2, critical: 3 };
assert.ok(
  riskRank[roofSummary.weightResult.topHeavyRisk] > riskRank[bedLowSummary.weightResult.topHeavyRisk],
  'Moving a 100 lb item from bedLow to roof should increase high-mounted load risk.',
);
assert.ok(
  roofSummary.weightResult.payloadRemaining.lbs < emptyRiskSummary.weightResult.payloadRemaining.lbs,
  'Loadout math should update operating weight and payload remaining.',
);
assert.strictEqual(
  roofWeightSummary.operatingWeightLb,
  emptyRiskWeightSummary.operatingWeightLb + 100,
  'Accessory and loadout changes should update operating weight.',
);
assert.strictEqual(
  roofWeightSummary.payloadRemainingLb,
  emptyRiskWeightSummary.payloadRemainingLb - 100,
  'Accessory and loadout changes should update payload remaining.',
);
assert.ok(
  roofWeightSummary.riskFlags.some((flag) => flag.id === 'high-mounted'),
  'Risk flags should appear at expected high-mounted thresholds.',
);

const verifiedVehicle = weightSummary.applyFleetWeightVerification(legacy.vehicle, {
  id: 'verification-scale-1',
  vehicleId: legacy.vehicle.id,
  target: 'baseNetWeight',
  weight: fleet.createFleetWeightValue(7800, 'scale_ticket'),
  method: 'scale_ticket',
  sourceLabel: 'Scale ticket',
  recordedAt: '2026-04-27T12:00:00.000Z',
});
const verifiedWeightResult = fleet.calculateFleetWeightResult(verifiedVehicle, [], []);
const verifiedWeightSummary = weightSummary.buildFleetWeightSummary(verifiedVehicle, verifiedWeightResult);
assert.ok(
  verifiedWeightSummary.confidenceScore > emptyRiskWeightSummary.confidenceScore,
  'Confidence should increase after weight verification.',
);
assert.strictEqual(weightSummary.fleetRiskTone('critical'), 'unavailable');
assert.strictEqual(weightSummary.fleetRiskTone('caution'), 'warning');

const towingRecommendations = fleetChecklist.buildFleetChecklistRecommendations({
  vehicle: legacy.vehicle,
  useCases: ['towing'],
  accessoryLabels: [],
  loadoutItems: [],
  state: fleetChecklist.normalizeFleetChecklistState(null),
});
assert.ok(
  towingRecommendations.some((item) => item.category === 'towing'),
  'Towing profile should recommend towing-related checklist items.',
);
const towingItem = towingRecommendations.find((item) => item.category === 'towing');
assert.ok(towingItem, 'Towing recommendation should be available for checklist behavior tests.');
const needItState = fleetChecklist.updateFleetChecklistItemStatus(
  fleetChecklist.normalizeFleetChecklistState(null),
  towingItem.id,
  'need_it',
  { now: '2026-04-27T12:00:00.000Z' },
);
assert.ok(needItState.prepList.includes(towingItem.id), '"Need it" should add the checklist item to prep list.');
const needItBuildSummary = buildLoadout.calculateFleetBuildLoadoutSummary(legacy.vehicle, riskTestState);
assert.strictEqual(
  needItBuildSummary.weightResult.operatingWeight.lbs,
  emptyRiskSummary.weightResult.operatingWeight.lbs,
  '"Need it" should not affect Fleet loadout weight.',
);
const linkedChecklistLoadoutItem = fleetChecklist.createChecklistLinkedLoadoutItem({
  vehicleId: legacy.vehicle.id,
  recommendation: towingItem,
  compartment: drawerCompartment,
});
const haveItBuildState = fleetChecklist.addChecklistItemToLoadoutState(riskTestState, linkedChecklistLoadoutItem);
const haveItChecklistState = fleetChecklist.updateFleetChecklistItemStatus(
  fleetChecklist.normalizeFleetChecklistState(null),
  towingItem.id,
  'have_it',
  {
    storageCompartmentId: drawerCompartment.id,
    linkedLoadoutItemId: linkedChecklistLoadoutItem.id,
    now: '2026-04-27T12:05:00.000Z',
  },
);
assert.ok(
  haveItBuildState.loadoutItems.some((item) => item.id === linkedChecklistLoadoutItem.id),
  '"Have it" should be able to create a linked loadout item.',
);
assert.strictEqual(haveItChecklistState.itemStates[towingItem.id].linkedLoadoutItemId, linkedChecklistLoadoutItem.id);
const notNeededState = fleetChecklist.updateFleetChecklistItemStatus(
  fleetChecklist.normalizeFleetChecklistState(null),
  towingItem.id,
  'not_needed',
  { now: '2026-04-27T12:10:00.000Z' },
);
const suppressedRecommendations = fleetChecklist.buildFleetChecklistRecommendations({
  vehicle: legacy.vehicle,
  useCases: ['towing'],
  accessoryLabels: [],
  loadoutItems: [],
  state: notNeededState,
});
assert.ok(
  !suppressedRecommendations.some((item) => item.id === towingItem.id),
  '"Not needed" should suppress repeated checklist recommendations.',
);

const emptyFabricPayload = fabric.generatePremiumFleetFabricPayload({
  vehicle: legacy.vehicle,
  generatedAt: '2026-04-27T12:00:00.000Z',
});
const loadedFabricPayload = fabric.generatePremiumFleetFabricPayload({
  vehicle: legacy.vehicle,
  accessories: buildLoadout.toFleetAccessoryInstalls(buildState, legacy.vehicle.id),
  compartments: buildState.compartments,
  loadoutItems: buildLoadout.toFleetCompartmentLoadoutItems(haveItBuildState, legacy.vehicle.id),
  activeLoadout: { id: 'active-loadout', name: 'Checklist linked loadout', presetId: 'custom' },
  checklistState: needItState,
  checklistRecommendations: towingRecommendations,
  generatedAt: '2026-04-27T12:05:00.000Z',
});
assert.strictEqual(loadedFabricPayload.schemaVersion, 'fleet.fabric.v2');
assert.ok(
  loadedFabricPayload.weight.payloadRemaining.lbs < emptyFabricPayload.weight.payloadRemaining.lbs,
  'Fleet fabric payload should reflect payload score changes from accessories and loadout.',
);
assert.ok(
  loadedFabricPayload.scoring.overallScore < emptyFabricPayload.scoring.overallScore,
  'Fleet fabric scoring should change when checklist prep items are still needed.',
);
assert.ok(loadedFabricPayload.riskFlags.length >= 0, 'Fleet fabric payload should expose risk flags.');
assert.ok(loadedFabricPayload.confidenceBreakdown.overall === loadedFabricPayload.weight.confidence);
const fabricJson = JSON.stringify(loadedFabricPayload).toLowerCase();
for (const forbidden of ['imageurl', 'image_url', 'photo', 'manifest', 'resolver', 'remoteimage']) {
  assert.ok(!fabricJson.includes(forbidden), `Fleet fabric payload must not include media metadata: ${forbidden}`);
}
assert.ok(fabric.isFleetFabricPayload(loadedFabricPayload), 'Fleet fabric payload should be type-detectable.');
assert.strictEqual(
  fabric.extractFleetFabricPayload({ fleetFabric: loadedFabricPayload }).vehicle.id,
  legacy.vehicle.id,
  'Fleet fabric extraction should support service wrapper objects.',
);
let observedFleetEvent = null;
const unsubscribeFleetEvent = fleetTelemetryEvents.subscribeFleetTelemetry((event) => {
  observedFleetEvent = event;
});
fleetTelemetryEvents.emitFleetTelemetryEvent('fleet_weight_verified', {
  vehicleId: legacy.vehicle.id,
  timestamp: '2026-04-27T12:15:00.000Z',
  meta: { target: 'baseNetWeight' },
});
unsubscribeFleetEvent();
assert.strictEqual(observedFleetEvent.name, 'fleet_weight_verified');

const migrationResult = migration.migrateLegacyVehicleToFleetPremium({
  now: '2026-04-27T12:30:00.000Z',
  vehicle: {
    id: 'migration-ram-1',
    owner_user_id: 'user-1',
    name: 'Migration RAM',
    type: 'truck',
    make: 'RAM',
    model: '2500',
    year: 2024,
    wizard_config: {
      existing_key: 'preserved',
      fleet_build_loadout: buildState,
    },
  },
  specs: {
    engine: 'Cummins',
    drivetrain: '4x4',
    cab: 'Crew Cab',
    bed_length: 'Short Bed',
  },
});
assert.strictEqual(migrationResult.migrationVersion, migration.FLEET_PREMIUM_MIGRATION_VERSION);
assert.strictEqual(migrationResult.vehicle.buildProfile.baseNetWeight.lbs, 7742);
assert.strictEqual(migrationResult.vehiclePatch.wizard_config.existing_key, 'preserved');
assert.strictEqual(
  migrationResult.vehiclePatch.wizard_config.fleet_premium_migration_version,
  migration.FLEET_PREMIUM_MIGRATION_VERSION,
);
assert.ok(migrationResult.vehiclePatch.wizard_config.fleet_build_profile);
assert.ok(migrationResult.fabricPayload.schemaVersion === 'fleet.fabric.v2');
const migrationJson = JSON.stringify(migrationResult).toLowerCase();
for (const forbidden of ['imageurl', 'image_url', 'photo', 'manifest', 'resolver', 'remoteimage', 'upload']) {
  assert.ok(!migrationJson.includes(forbidden), `Fleet migration output must not include media metadata: ${forbidden}`);
}

const defaultFleetRollout = releaseConfig.resolveFleetPremiumReleaseConfig();
assert.strictEqual(defaultFleetRollout.premiumFleetEnabled, true);
assert.strictEqual(defaultFleetRollout.fabricSyncEnabled, true);
assert.strictEqual(
  releaseConfig.resolveFleetPremiumReleaseConfig({ premiumFleetEnabled: false }).premiumFleetEnabled,
  false,
);
assert.strictEqual(
  releaseConfig.isFleetPremiumFeatureEnabled(defaultFleetRollout, 'buildLoadoutEnabled'),
  true,
);
assert.ok(
  releaseConfig.getFleetPremiumRolloutDisabledCopy('premiumFleetEnabled').includes('paused'),
  'Fleet premium release config should expose polished disabled copy.',
);

const dailyState = buildLoadout.applyFleetLoadoutPreset(buildState, legacy.vehicle.id, 'daily');
const workState = buildLoadout.applyFleetLoadoutPreset(dailyState, legacy.vehicle.id, 'work');
assert.ok(workState.loadoutItems.length > dailyState.loadoutItems.length, 'Work preset should add load without deleting Daily preset.');
assert.ok(
  dailyState.loadoutItems.every((dailyItem) => workState.loadoutItems.some((workItem) => workItem.id === dailyItem.id)),
  'Work preset should preserve Daily preset items.',
);

buildState = buildLoadout.removeFleetAccessoryInstall(buildState, smartCap.id);
assert.ok(!buildState.accessories.some((item) => item.id === smartCap.id));
assert.ok(
  !buildState.compartments.some((item) => item.accessoryInstallId === smartCap.id && item.status === 'active'),
  'Removing SmartCap should remove or mark associated empty compartments inactive.',
);

const forbiddenKeyFragments = ['photo', 'image', 'url', 'manifest', 'resolver'];
walkKeys(payload, (key) => {
  const lowered = key.toLowerCase();
  assert.ok(
    !forbiddenKeyFragments.some((fragment) => lowered.includes(fragment)),
    `Fleet fabric payload should not include media key: ${key}`,
  );
});

for (const forbiddenSourceFragment of [
  'VehiclePhotoAsset',
  'photoManifest',
  'photoResolver',
  'imageUrl',
  'remoteImage',
  'vehicleImage',
]) {
  assert.ok(
    !domainSource.includes(forbiddenSourceFragment),
    `Fleet premium domain should not define media field/function ${forbiddenSourceFragment}.`,
  );
}

console.log('Fleet premium domain checks passed.');

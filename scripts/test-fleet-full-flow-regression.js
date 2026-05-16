const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const fleetTabPath = path.join(root, 'app', '(tabs)', 'fleet.tsx');
const profileModalPath = path.join(root, 'components', 'fleet', 'FleetVehicleProfileModal.tsx');
const buildLoadoutModalPath = path.join(root, 'components', 'fleet', 'FleetBuildLoadoutModal.tsx');
const cgVisualizationPath = path.join(root, 'components', 'weight-dashboard', 'CGVisualization.tsx');
const weightDashboardPath = path.join(root, 'components', 'weight-dashboard', 'WeightDashboardPanel.tsx');
const vehicleTwinPath = path.join(root, 'lib', 'useVehicleTwinData.ts');
const advancedSpecsPath = path.join(root, 'lib', 'fleet', 'fleetAdvancedSpecs.ts');
const buildLoadoutPath = path.join(root, 'lib', 'fleet', 'fleetBuildLoadout.ts');
const selectorsPath = path.join(root, 'lib', 'fleet', 'fleetVehicleStateSelectors.ts');
const vehicleSpecStorePath = path.join(root, 'lib', 'vehicleSpecStore.ts');
const consumablesStorePath = path.join(root, 'lib', 'consumablesStore.ts');
const vehicleIconsPath = path.join(root, 'lib', 'vehicleIcons.ts');

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

function source(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function includes(haystack, needle, message) {
  assert.ok(haystack.includes(needle), message);
}

function notIncludes(haystack, needle, message) {
  assert.ok(!haystack.includes(needle), message);
}

function almostEqual(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 0.001, `${message}: expected ${expected}, received ${actual}`);
}

const fleetTab = source(fleetTabPath);
const profileModal = source(profileModalPath);
const buildLoadoutModal = source(buildLoadoutModalPath);
const cgVisualization = source(cgVisualizationPath);
const weightDashboard = source(weightDashboardPath);
const vehicleTwin = source(vehicleTwinPath);

includes(fleetTab, '<FleetVehicleProfileModal', 'Fleet tab should mount the vehicle profile modal.');
includes(fleetTab, '<FleetBuildLoadoutModal', 'Fleet tab should mount the Build & Loadout modal.');
includes(fleetTab, '<WeightDashboardPanel', 'Fleet tab should mount Weight Summary from the vehicle card.');
includes(fleetTab, "import { FleetIcon } from '../../components/DockIcons';", 'Fleet vehicle card should use the ECS truck/off-road FleetIcon.');
includes(fleetTab, '<FleetVehicleCardIcon active={isActive} />', 'Fleet vehicle card should render the ECS truck/off-road icon wrapper.');
notIncludes(fleetTab, 'name={model.iconName as any}', 'Fleet vehicle card should not render the generic car icon resolver.');
for (const cardAction of ['Vehicle Profile', 'Build & Loadout', 'Weight Summary']) {
  includes(fleetTab, `label="${cardAction}"`, `Vehicle card should expose ${cardAction}.`);
}
notIncludes(fleetTab, 'ECS Fabric Debug', 'Fleet tab should not render user-facing fabric debug UI.');
notIncludes(fleetTab, 'fabricDebugPanel', 'Fleet tab should not retain fabric debug panel styles.');
notIncludes(fleetTab, 'showFabricDebugPanel', 'Fleet tab should not pass a fabric debug render flag into vehicle cards.');
includes(fleetTab, 'showHelper = true', 'Fleet metric tiles should default to showing helper text outside compact card summaries.');
for (const compactMetricLabel of ['Operating', 'Payload Left', 'Readiness', 'Confidence']) {
  includes(
    fleetTab,
    `<FleetMetricTile label="${compactMetricLabel}"`,
    `Fleet vehicle card should keep the ${compactMetricLabel} metric tile.`,
  );
}
for (const hiddenMetricHelper of [
  'helper="base + build + load" showHelper={false}',
  'helper="GVWR margin" showHelper={false}',
  'helper={scoringResult.riskLevel} showHelper={false}',
  'helper={weightResult.baseNetWeight.source} showHelper={false}',
]) {
  includes(
    fleetTab,
    hiddenMetricHelper,
    'Fleet vehicle card metric helper text should not render as visible subtext.',
  );
}

includes(profileModal, 'title="Advanced Specs"', 'Vehicle profile should expose Advanced Specs.');
includes(profileModal, 'setAdvancedDraft(buildAdvancedSetupDraft(vehicle))', 'Reopening Advanced Specs should hydrate from saved values.');
includes(profileModal, 'onClose={closeAdvancedWithoutSaving}', 'Advanced Specs X should close through the no-save handler.');
includes(profileModal, 'saveVehicleProfileDraft', 'Advanced Specs Done should save or create the vehicle profile before advanced values.');
includes(profileModal, 'const targetVehicle = profileResult.vehicle', 'Advanced Specs Done should persist against the saved vehicle record.');
includes(profileModal, 'tiresLiftStore.set(targetVehicle.id', 'Advanced Specs Done should persist tires/lift.');
includes(profileModal, 'consumablesStore.setWaterGal(targetVehicle.id, waterGallons', 'Advanced Specs Done should persist water gallons.');
includes(profileModal, 'consumablesStore.setFuelGal(targetVehicle.id, fuelGallons', 'Advanced Specs Done should persist fuel gallons.');
includes(profileModal, 'vehicleSpecStore.update(targetVehicle.id', 'Advanced Specs Done should update canonical spec fields.');
includes(profileModal, 'if (profileResult.created)', 'First-vehicle Advanced Specs Done should advance out of the profile flow after saving.');
includes(profileModal, 'handleClose();', 'First-vehicle Advanced Specs Done should close the setup modal after a successful save.');

includes(buildLoadoutModal, "accessoryId === 'custom_accessory'", 'Build & Loadout should recognize custom compartments.');
includes(buildLoadoutModal, 'label="Add Item"', 'Custom compartment should expose Add Item.');
includes(buildLoadoutModal, 'styles.compartmentAction', 'Add Item should be in the compartment action slot.');
includes(buildLoadoutModal, "flexWrap: 'wrap'", 'Compartment rows should wrap instead of overflowing narrow Fleet modals.');
includes(buildLoadoutModal, "alignSelf: 'flex-start'", 'Compartment action slot should remain visible when rows wrap.');
includes(buildLoadoutModal, 'buildFleetCompartmentLoadoutItem', 'Add Item should create a real loadout item.');
includes(buildLoadoutModal, 'upsertFleetCompartmentLoadoutItem', 'Add Item should save through the loadout state.');
includes(buildLoadoutModal, 'removeFleetCompartmentLoadoutItem', 'Custom items should support removal through the same state path.');
notIncludes(buildLoadoutModal, "router.push('/(tabs)/fleet')", 'Add Item should not navigate out of the flow.');
notIncludes(buildLoadoutModal, 'FLEET_LOADOUT_PRESETS.map', 'Compartment Loadout should not show category preset chips.');
notIncludes(buildLoadoutModal, 'styles.presetRow', 'Removed category preset chips should not leave a visible row container.');
notIncludes(buildLoadoutModal, 'Show ${preset.label} compartment load context', 'Removed category preset chips should not leave dead click handlers.');
notIncludes(
  buildLoadoutModal,
  '<Text style={styles.tileMeta}>{compartment.loadZone}</Text>',
  'Compartment rows should not show redundant visible load-zone labels.',
);
notIncludes(
  fleetTab,
  '<Text style={s.metricHelper}>{compartment.loadZone}</Text>',
  'Fleet checklist compartment chips should keep zone metadata accessible but not render it as visible subtext.',
);
includes(
  buildLoadoutModal,
  'item?.loadZone ?? compartment.loadZone',
  'Compartment load-zone metadata should remain available when editing loadout items.',
);

includes(weightDashboard, 'selectFleetVehicleState', 'Weight Summary should read canonical Fleet state.');
includes(weightDashboard, 'fleetState.operatingWeight.dashboardData', 'Weight Summary should render canonical operating weight data.');
includes(vehicleTwin, 'selectFleetVehicleState', 'Live vehicle data should read canonical Fleet state.');
includes(cgVisualization, 'TopDownVehicleFallbackProfile', 'COG visualization should use the ECS drawn top-down vehicle profile boundary.');
includes(cgVisualization, 'vehicleProfileSilhouette', 'COG visualization should render a top-down vehicle silhouette.');
notIncludes(cgVisualization, "require('../../assets/images/Attitude_Truck_Silhouette.png')", 'COG visualization should not depend on the old generic vehicle image asset.');

const advancedSpecs = require(advancedSpecsPath);
const buildLoadout = require(buildLoadoutPath);
const selectors = require(selectorsPath);
const vehicleSpecs = require(vehicleSpecStorePath);
const consumables = require(consumablesStorePath);
const vehicleIcons = require(vehicleIconsPath);

const accessoryIcons = Object.fromEntries(
  buildLoadout.FLEET_ACCESSORY_CATALOG.map((item) => [item.id, item.icon]),
);
assert.strictEqual(
  accessoryIcons.winch,
  'link-outline',
  'Build & Loadout Winch should use a recovery/cable-style icon, not communications.',
);
assert.notStrictEqual(
  accessoryIcons.winch,
  'radio-outline',
  'Winch must not render with a radio or signal icon.',
);
assert.strictEqual(accessoryIcons.roof_rack_platform, 'grid-outline', 'Roof rack should use a platform/grid icon.');
assert.strictEqual(accessoryIcons.cab_rack, 'file-tray-stacked-outline', 'Cab rack should use a cargo/rack icon.');
assert.strictEqual(accessoryIcons.toolbox, 'hammer-outline', 'Toolbox should use a tool icon.');
assert.strictEqual(accessoryIcons.custom_accessory, 'cube-outline', 'Custom accessory should use a package/container icon.');
assert.deepStrictEqual(
  buildLoadout.FLEET_ACCESSORY_CATALOG
    .filter((item) => item.icon.includes('radio') || item.icon.includes('cellular') || item.icon.includes('wifi'))
    .map((item) => item.id),
  [],
  'Build & Loadout accessory icons should not use communications glyphs for non-comms gear.',
);
assert.strictEqual(
  vehicleIcons.getVehicleIcon({ wizard_config: {} }),
  'car-sport-outline',
  'Generic Fleet vehicle card icon should use the more rugged vehicle silhouette fallback.',
);

const advancedDraft = {
  suspensionLiftInches: 3,
  isLeveled: true,
  frontLevelInches: 2,
  tireSizeInches: 37,
  waterGallons: '10',
  fuelGallons: '20',
};
assert.deepStrictEqual(
  advancedSpecs.validateFleetAdvancedSpecsDraft(advancedDraft),
  [],
  'Full-flow Advanced Specs values should validate.',
);
const savedAdvancedSpecs = advancedSpecs.normalizeFleetAdvancedSpecsDraftForSave(advancedDraft);
assert.deepStrictEqual(
  savedAdvancedSpecs,
  {
    suspensionLiftInches: 3,
    isLeveled: true,
    frontLevelInches: 2,
    tireSizeInches: 37,
    waterGallons: 10,
    fuelGallons: 20,
  },
  'Advanced Specs Done should normalize the values used by the Fleet flow.',
);

const vehicleId = 'fleet-full-flow-regression-vehicle';
const savedVehicle = {
  id: vehicleId,
  owner_user_id: 'local',
  name: 'QA Trail Rig',
  type: 'truck',
  make: 'Toyota',
  model: 'Tacoma',
  year: 2024,
  notes: null,
  fuel_tank_capacity_gal: 21,
  avg_mpg: null,
  current_fuel_percent: 95,
  water_capacity_gal: 15,
  current_water_gal: savedAdvancedSpecs.waterGallons,
  tire_size_inches: savedAdvancedSpecs.tireSizeInches,
  suspension_lift_inches: savedAdvancedSpecs.suspensionLiftInches,
  is_leveled: savedAdvancedSpecs.isLeveled,
  front_level_inches: savedAdvancedSpecs.frontLevelInches,
  created_at: '2026-05-02T00:00:00.000Z',
  updated_at: '2026-05-02T00:00:00.000Z',
};
const spec = {
  base_weight_lb: 5000,
  gvwr_lb: 6200,
  front_base_weight_lb: 2600,
  rear_base_weight_lb: 2400,
  fuel_tank_capacity_gal: 21,
  fuel_type: 'gas',
  tire_size_inches: savedAdvancedSpecs.tireSizeInches,
  suspension_lift_inches: savedAdvancedSpecs.suspensionLiftInches,
  is_leveled: savedAdvancedSpecs.isLeveled,
  front_level_inches: savedAdvancedSpecs.frontLevelInches,
};
const savedConsumables = {
  fuel_percent_current: 95,
  fuel_gal_current: savedAdvancedSpecs.fuelGallons,
  fuel_source: 'manual',
  fuel_gal_updated_at: 1,
  water_gal_current: savedAdvancedSpecs.waterGallons,
  water_source: 'manual',
  water_updated_at: 1,
};
const savedTiresLift = {
  tireSizeInches: savedAdvancedSpecs.tireSizeInches,
  suspensionLiftInches: savedAdvancedSpecs.suspensionLiftInches,
  isLeveled: savedAdvancedSpecs.isLeveled,
  frontLevelInches: savedAdvancedSpecs.frontLevelInches,
  updatedAt: '2026-05-02T00:00:00.000Z',
};

let buildState = buildLoadout.createEmptyFleetBuildLoadoutState();
buildState = buildLoadout.upsertFleetAccessoryInstall(
  buildState,
  buildLoadout.buildFleetAccessoryInstall({
    accessoryId: 'custom_accessory',
    vehicleId,
    knowledgeMode: 'estimate',
    mountZone: 'rearLow',
    permanence: 'seasonal',
  }),
);
const customCompartment = buildState.compartments.find((item) => item.accessoryId === 'custom_accessory');
assert.ok(customCompartment, 'Enabling Custom Accessory should create a custom compartment.');
assert.strictEqual(customCompartment.loadZone, 'rearLow', 'Custom Accessory should default to a rear location.');

const customItemDraftErrors = buildLoadout.validateFleetCompartmentLoadoutDraft({
  name: 'Recovery Box',
  typicalWeightLb: '40',
  quantity: '1',
  compartmentId: customCompartment.id,
  loadZone: 'rearLow',
  activeCompartments: buildState.compartments,
});
assert.deepStrictEqual(customItemDraftErrors, [], 'Recovery Box custom item form values should be saveable.');

const recoveryBox = buildLoadout.buildFleetCompartmentLoadoutItem({
  vehicleId,
  name: 'Recovery Box',
  category: 'custom',
  typicalWeightLb: 40,
  quantity: 1,
  compartment: customCompartment,
  loadZone: 'rearLow',
  permanence: 'trip',
  source: 'user_estimate',
  confidence: 62,
  presetId: 'custom',
});
buildState = buildLoadout.upsertFleetCompartmentLoadoutItem(buildState, recoveryBox);
const persistedVehicle = {
  ...savedVehicle,
  wizard_config: {
    fleet_build_loadout: buildState,
  },
};

const scenarioWarnings = [];
const originalWarn = console.warn;
const originalError = console.error;
console.warn = (...args) => scenarioWarnings.push(['warn', args.map(String).join(' ')]);
console.error = (...args) => scenarioWarnings.push(['error', args.map(String).join(' ')]);
let canonical;
let withoutCustomItem;
try {
  canonical = selectors.selectFleetVehicleStateFromRecord({
    vehicle: persistedVehicle,
    spec,
    consumables: savedConsumables,
    tiresLift: savedTiresLift,
    buildLoadoutState: buildState,
    legacyLoadoutItems: [],
    frameworkContainerZones: [],
  });
  withoutCustomItem = selectors.selectFleetVehicleStateFromRecord({
    vehicle: {
      ...savedVehicle,
      wizard_config: {
        fleet_build_loadout: {
          ...buildState,
          loadoutItems: [],
        },
      },
    },
    spec,
    consumables: savedConsumables,
    tiresLift: savedTiresLift,
    buildLoadoutState: {
      ...buildState,
      loadoutItems: [],
    },
    legacyLoadoutItems: [],
    frameworkContainerZones: [],
  });
} finally {
  console.warn = originalWarn;
  console.error = originalError;
}

assert.deepStrictEqual(
  scenarioWarnings,
  [],
  'Full Fleet flow selector path should not emit console warnings/errors for undefined vehicle fields.',
);

assert.strictEqual(canonical.fleetVehicle.buildProfile.suspensionLiftInches, 3);
assert.strictEqual(canonical.fleetVehicle.buildProfile.isLeveled, true);
assert.strictEqual(canonical.fleetVehicle.buildProfile.frontLevelInches, 2);
assert.strictEqual(canonical.fleetVehicle.buildProfile.tireSizeInches, 37);
assert.strictEqual(canonical.resourceProfile.currentWaterGallons, 10);
assert.strictEqual(canonical.resourceProfile.currentFuelGallons, 20);
almostEqual(canonical.resourceProfile.currentWaterWeightLb, 10 * consumables.WATER_DENSITY_LB_PER_GAL, 'Water weight should use the ECS water constant.');
almostEqual(canonical.resourceProfile.currentFuelWeightLb, 20 * vehicleSpecs.FUEL_WEIGHT_PER_GAL.gas, 'Fuel weight should use the ECS fuel constant.');

const expectedWaterWeight = 83.4;
const expectedFuelWeight = 120;
const expectedConsumablesWeight = expectedWaterWeight + expectedFuelWeight;
const expectedAccessoryWeight = 50;
const expectedCustomItemWeight = 40;
const expectedOperatingWeight = 5000 + expectedConsumablesWeight + expectedAccessoryWeight + expectedCustomItemWeight;

almostEqual(canonical.operatingWeight.weightResult.consumablesWeight.lbs, expectedConsumablesWeight, 'Weight Summary should include water and fuel weight.');
almostEqual(canonical.weightSummary.consumablesWeightLb, expectedConsumablesWeight, 'Fleet card/summary should agree on consumables weight.');
almostEqual(canonical.operatingWeight.weightResult.installedAccessoryWeight.lbs, expectedAccessoryWeight, 'Custom Accessory installed weight should be included.');
almostEqual(canonical.operatingWeight.weightResult.activeLoadoutWeight.lbs, expectedCustomItemWeight, 'Recovery Box should count as active loadout weight.');
almostEqual(canonical.weightSummary.currentLoadoutWeightLb, expectedCustomItemWeight, 'Weight Summary should expose Recovery Box loadout weight.');
almostEqual(canonical.weightSummary.operatingWeightLb, expectedOperatingWeight, 'Total operational vehicle weight should reflect Advanced Specs plus custom item additions.');
almostEqual(canonical.operatingWeight.dashboardData.totalVehicleWeight, expectedOperatingWeight, 'Weight dashboard should use the canonical total operating weight.');
almostEqual(canonical.operatingWeight.dashboardData.loadoutWeight, expectedCustomItemWeight, 'Weight dashboard should include the custom item weight.');
almostEqual(canonical.operatingWeight.weightResult.zoneWeights.rearLow.loadoutWeight.lbs, expectedCustomItemWeight, 'Rear compartment loadout should include Recovery Box.');
almostEqual(canonical.operatingWeight.weightResult.zoneWeights.rearLow.totalWeight.lbs, expectedAccessoryWeight + expectedCustomItemWeight, 'Rear compartment total should include custom accessory and Recovery Box.');
assert.ok(
  canonical.operatingWeight.centerOfGravity.x > withoutCustomItem.operatingWeight.centerOfGravity.x,
  'Adding Recovery Box to a rear compartment should move COG rearward.',
);
assert.strictEqual(
  canonical.scoringResult.readinessScore,
  canonical.weightSummary.readinessScore,
  'Readiness should consume the same canonical vehicle state as Weight Summary.',
);
assert.strictEqual(
  canonical.operatingWeight.dashboardData.cgResult.totalMass,
  canonical.operatingWeight.centerOfGravity.totalKnownWeightLb,
  'Dashboard COG and live COG outputs should agree on total known mass.',
);
assert.ok(
  canonical.loadoutItems.some((item) => item.name === 'Recovery Box' && item.quantity === 1 && item.weight.lbs === 40),
  'Saved custom item should render through the same loadout item adapter as standard items.',
);

console.log('Fleet full-flow integration regression checks passed.');

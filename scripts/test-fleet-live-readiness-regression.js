const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'web', select: (values) => values?.web ?? values?.default },
      AppState: { addEventListener: () => ({ remove() {} }), currentState: 'active' },
      NativeModules: {},
    };
  }
  if (request.startsWith('expo-location')) {
    return {};
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

const activeVehicleState = require(path.join(root, 'lib', 'fleet', 'activeVehicleState.ts'));
const buildLoadout = require(path.join(root, 'lib', 'fleet', 'fleetBuildLoadout.ts'));
const selectors = require(path.join(root, 'lib', 'fleet', 'fleetVehicleStateSelectors.ts'));
const vehicleEcs = require(path.join(root, 'lib', 'vehicleEcsIntegration.ts'));
const routeConfidence = require(path.join(root, 'lib', 'routeConfidencePresentation.ts'));

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(root, ...segments), 'utf8');
}

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

function loadout(id, vehicleId, overrides = {}) {
  return {
    id,
    owner_user_id: 'user-1',
    vehicle_id: vehicleId,
    name: overrides.name || 'Field Kit',
    description: null,
    mode: 'trip',
    operating_profile: null,
    people_count: null,
    trip_length_days: null,
    total_weight_lbs: null,
    item_count: overrides.item_count ?? 1,
    loadout_view_mode: 'simple',
    created_at: '2026-05-05T00:00:00.000Z',
    updated_at: '2026-05-05T00:00:00.000Z',
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

function accessoryState(vehicleId, accessoryId, weightLb) {
  return buildLoadout.upsertFleetAccessoryInstall(
    buildLoadout.createEmptyFleetBuildLoadoutState(),
    buildLoadout.buildFleetAccessoryInstall({
      accessoryId,
      vehicleId,
      knowledgeMode: 'manual_weight',
      manualWeightLb: weightLb,
    }),
  );
}

function activeFrom(input = {}) {
  const fleetState = selectors.selectFleetVehicleStateFromRecord({
    vehicle: input.vehicle || vehicle('vehicle-1'),
    spec: input.spec === undefined ? spec() : input.spec,
    consumables: input.consumables || null,
    tiresLift: input.tiresLift || null,
    activeLoadout: input.activeLoadout || null,
    legacyLoadoutItems: input.legacyLoadoutItems || [],
    buildLoadoutState: input.buildLoadoutState || buildLoadout.createEmptyFleetBuildLoadoutState(),
    frameworkContainerZones: input.frameworkContainerZones || [],
    useCaseChips: input.useCaseChips || ['trail'],
  });
  return activeVehicleState.buildActiveVehicleStateFromFleetState(fleetState, fleetState.vehicle.id);
}

function assertClass(state, expectedClassId, label) {
  assert.strictEqual(
    state.intelligence.classification.classId,
    expectedClassId,
    `${label} should classify as ${expectedClassId}.`,
  );
}

const noVehicle = activeVehicleState.getActiveVehicleState(null);
assert.strictEqual(noVehicle.status, 'no_active_vehicle');
assert.strictEqual(noVehicle.identity.hasVehicle, false);
assert.strictEqual(noVehicle.weight.estimatedOperatingWeightLbs, null);
assert.strictEqual(noVehicle.capability.hasVehicle, false);

const incomplete = activeFrom({
  vehicle: vehicle('unknown-custom', {
    name: 'Unknown Field Rig',
    make: null,
    model: null,
    year: null,
    type: 'custom',
  }),
  spec: null,
});
assert.ok(['incomplete', 'ready'].includes(incomplete.status), 'Incomplete vehicles should remain renderable.');
assert.ok(
  ['unknown_custom', 'full_size_suv', 'mid_size_suv', 'full_size_half_ton_truck'].includes(
    incomplete.intelligence.classification.classId,
  ),
  'Unknown/custom vehicles should classify conservatively without crashing.',
);
assert.ok(incomplete.confidence.label !== 'verified', 'Incomplete vehicles must not be marked verified.');

const ram = activeFrom({
  vehicle: vehicle('ram-2500', { name: 'Tow Rig', make: 'Ram', model: '2500', year: 2023, type: 'truck' }),
  spec: spec({ base_weight_lb: 7742, gvwr_lb: 10190, fuel_tank_capacity_gal: 31, fuel_type: 'diesel' }),
});
assertClass(ram, 'full_size_hd_truck', 'Ram 2500');
assert.strictEqual(ram.weight.baseWeightLbs, 7742);
assert.strictEqual(ram.weight.gvwrLbs, 10190);
assert.ok(ram.weight.payloadUsedPct > 0);

const tacoma = activeFrom({
  vehicle: vehicle('tacoma', { make: 'Toyota', model: 'Tacoma', year: 2022, type: 'truck' }),
  spec: spec({ base_weight_lb: 4450, gvwr_lb: 5600 }),
});
const jeep = activeFrom({
  vehicle: vehicle('wrangler', { make: 'Jeep', model: 'Wrangler', year: 2021, type: 'suv' }),
  spec: spec({ base_weight_lb: 4300, gvwr_lb: 5700 }),
});
const outback = activeFrom({
  vehicle: vehicle('outback', { make: 'Subaru', model: 'Outback', year: 2022, type: 'suv' }),
  spec: spec({ base_weight_lb: 3900, gvwr_lb: 5000 }),
});
assertClass(tacoma, 'mid_size_truck', 'Toyota Tacoma');
assertClass(jeep, 'short_wheelbase_4x4', 'Jeep Wrangler');
assertClass(outback, 'compact_suv_crossover', 'Subaru Outback');
assert.notStrictEqual(tacoma.weight.baseWeightLbs, ram.weight.baseWeightLbs, 'Tacoma should not inherit Ram weight.');
assert.notStrictEqual(jeep.weight.baseWeightLbs, ram.weight.baseWeightLbs, 'Wrangler should not inherit Ram weight.');
assert.notStrictEqual(outback.weight.gvwrLbs, ram.weight.gvwrLbs, 'Outback should not inherit Ram GVWR.');

const activeLoadout = loadout('loadout-accessory-cargo', 'loaded-rig', { item_count: 2 });
const loaded = activeFrom({
  vehicle: vehicle('loaded-rig', { make: 'Ford', model: 'F-150', year: 2024, type: 'truck' }),
  spec: spec({ base_weight_lb: 5000, gvwr_lb: 7050 }),
  activeLoadout,
  legacyLoadoutItems: [
    loadoutItem('tool-roll', activeLoadout.id, 45, 2, 'rearLow'),
    loadoutItem('water-box', activeLoadout.id, 60, 1, 'bedLow'),
  ],
  buildLoadoutState: accessoryState('loaded-rig', 'drawer_system', 180),
});
assert.strictEqual(loaded.weight.accessoryWeightLbs, 180);
assert.strictEqual(loaded.weight.cargoLoadoutWeightLbs, 150);
assert.strictEqual(loaded.loadout.itemCount, 2);
assert.ok(loaded.weight.estimatedOperatingWeightLbs >= 5330);
assert.ok(typeof loaded.weight.payloadUsedPct === 'number');
assert.ok(loaded.weight.remainingPayloadLbs !== null);

const overloaded = activeFrom({
  vehicle: vehicle('overloaded', { make: 'Toyota', model: '4Runner', year: 2020, type: 'suv' }),
  spec: spec({ base_weight_lb: 4700, gvwr_lb: 5600 }),
  activeLoadout: loadout('heavy-loadout', 'overloaded'),
  legacyLoadoutItems: [
    loadoutItem('kitchen', 'heavy-loadout', 520, 1, 'rearLow'),
    loadoutItem('water', 'heavy-loadout', 480, 1, 'roof'),
    loadoutItem('recovery', 'heavy-loadout', 420, 1, 'hitch'),
  ],
  buildLoadoutState: accessoryState('overloaded', 'bumper_winches', 620),
});
assert.ok((overloaded.weight.payloadUsedPct ?? 0) >= 100, 'Overloaded fixture should exceed payload/GVWR.');

const suitability = vehicleEcs.scoreVehicleSuitabilityForEcs({
  activeVehicleState: overloaded,
  accessDemand: 'technical',
});
assert.ok(['unknown', 'limited', 'caution'].includes(suitability.level));
assert.ok(suitability.score < 70);
assert.ok(suitability.concerns.some((item) => /GVWR|Payload|Center|weight/i.test(item)));

vehicleEcs.resetVehicleSystemAdvisoriesForTests();
const firstAdvisories = vehicleEcs.publishVehicleSystemAdvisories({ state: overloaded, now: 1000 });
const duplicateAdvisories = vehicleEcs.publishVehicleSystemAdvisories({ state: overloaded, now: 2000 });
assert.ok(firstAdvisories.some((item) => item.kind === 'payload_over_gvwr'));
assert.strictEqual(duplicateAdvisories.length, 0, 'Duplicate vehicle advisories should be suppressed.');

const routeWithVehicle = routeConfidence.deriveRouteConfidence({
  routeLabel: 'ECS-curated',
  isCurated: true,
  hasCompleteGeometry: true,
  accessStatus: 'technical',
  vehicleState: overloaded,
});
assert.ok(routeWithVehicle.concerns?.some((item) => /GVWR|Vehicle fit|Payload|Center|weight/i.test(item)));
assert.notStrictEqual(routeWithVehicle.level, 'high');

const aiContextBuilder = readRepoFile('lib', 'aiContextBuilder.ts');
assert.ok(aiContextBuilder.includes('getActiveVehicleState'), 'ECS AI context should use the shared active vehicle selector.');
assert.ok(aiContextBuilder.includes('vehicleIntelligence'), 'ECS AI context should include vehicle intelligence.');
assert.ok(aiContextBuilder.includes('vehicleClass'), 'ECS AI context should include vehicle class.');
assert.ok(aiContextBuilder.includes('vehicleWeightConfidence'), 'ECS AI context should include weight confidence.');

const routePresentation = readRepoFile('lib', 'routeConfidencePresentation.ts');
assert.ok(routePresentation.includes('scoreVehicleSuitabilityForEcs'), 'Navigate route confidence should consume vehicle suitability.');

const exploreAdapter = readRepoFile('lib', 'explore', 'exploreOrchestratorAdapter.ts');
assert.ok(exploreAdapter.includes('getActiveVehicleSnapshotForEcs'), 'Explore scoring should consume the active vehicle snapshot.');
assert.ok(exploreAdapter.includes('vehicleSuitabilityAdjustment'), 'Explore scoring should apply vehicle suitability adjustment.');

const campOpsScoring = readRepoFile('lib', 'campops', 'campOpsScoring.ts');
assert.ok(campOpsScoring.includes('scoreVehicleSuitabilityForEcs'), 'CampOps access scoring should consume vehicle suitability.');
assert.ok(campOpsScoring.includes('activeVehicleFit'), 'CampOps output should preserve vehicle fit context.');

const dispatchContext = readRepoFile('lib', 'ai', 'expeditionIntelligenceContextBuilder.ts');
assert.ok(dispatchContext.includes('getActiveVehicleSnapshotForEcs'), 'Dispatch/ECS intelligence context should include active vehicle state.');

const dashboardReadiness = readRepoFile('components', 'dashboard', 'widgetReadiness.ts');
assert.ok(dashboardReadiness.includes('getActiveVehicleContext'), 'Dashboard vehicle readiness should read shared vehicle context.');
assert.ok(dashboardReadiness.includes('vehicle-systems'), 'Dashboard readiness should cover Vehicle Systems.');
assert.ok(dashboardReadiness.includes('resource-forecast'), 'Dashboard readiness should cover resource forecast vehicle dependency.');

console.log('Fleet live-readiness regression checks passed.');

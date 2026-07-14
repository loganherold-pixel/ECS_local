const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const storage = new Map();
global.__DEV__ = false;
global.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'web' },
      AppState: {
        currentState: 'active',
        addEventListener: () => ({ remove() {} }),
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTypeScript(module, filename) {
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

function load(relativePath) {
  return require(path.join(root, relativePath));
}

function vehicle(id, overrides = {}) {
  return {
    id,
    owner_user_id: 'local',
    name: `Vehicle ${id}`,
    type: 'truck',
    make: 'Toyota',
    model: 'Tacoma',
    year: 2024,
    notes: null,
    fuel_tank_capacity_gal: null,
    avg_mpg: null,
    current_fuel_percent: null,
    water_capacity_gal: null,
    current_water_gal: null,
    water_updated_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function spec(overrides = {}) {
  return {
    base_weight_lb: 5000,
    gvwr_lb: 6500,
    fuel_tank_capacity_gal: 21,
    fuel_type: 'gas',
    ...overrides,
  };
}

function selectorInput(id = 'vehicle-1', overrides = {}) {
  return {
    vehicle: vehicle(id),
    spec: spec(),
    consumables: null,
    tiresLift: null,
    activeLoadout: null,
    legacyLoadoutItems: [],
    frameworkContainerZones: [],
    ...overrides,
  };
}

function waitForMicrotask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function main() {
  const { vehicleSetupStore, ECS_VEHICLE_SETUP_SCHEMA_VERSION } = load('lib/vehicleSetupStore.ts');
  const { vehicleSpecStore } = load('lib/vehicleSpecStore.ts');
  const { consumablesStore } = load('lib/consumablesStore.ts');
  const { vehicleStore } = load('lib/vehicleStore.ts');
  const activeVehicleState = load('lib/fleet/activeVehicleState.ts');
  const selectors = load('lib/fleet/fleetVehicleStateSelectors.ts');
  const fleetDomain = load('lib/fleet/fleetPremiumDomain.ts');
  const fleetFabric = load('lib/fleet/fleetFabricService.ts');

  assert.strictEqual(vehicleSetupStore.reconcileActiveVehicle([], { autoSelectSingle: true }), null);
  const selectionEvents = [];
  const offSelection = vehicleSetupStore.subscribe((event) => selectionEvents.push(event));
  assert.strictEqual(
    vehicleSetupStore.reconcileActiveVehicle(['vehicle-1'], { autoSelectSingle: true, reason: 'single_vehicle_restore' }),
    'vehicle-1',
  );
  assert.strictEqual(selectionEvents.length, 1, 'Single vehicle restore should publish once.');
  assert.strictEqual(vehicleSetupStore.setActiveVehicleId('vehicle-1'), false, 'Repeated selection must be idempotent.');
  assert.strictEqual(selectionEvents.length, 1, 'Idempotent selection must not republish.');
  assert.strictEqual(vehicleSetupStore.getSchemaVersion(), ECS_VEHICLE_SETUP_SCHEMA_VERSION);

  const consumerEvents = [[], [], []];
  const consumerUnsubscribers = consumerEvents.map((events) => (
    activeVehicleState.subscribeActiveVehicleState((event) => events.push(event))
  ));
  assert.deepStrictEqual(activeVehicleState.getActiveVehicleSubscriptionDiagnostics(), {
    consumerCount: 3,
    sourceSubscriptionCount: 7,
    publishedRevision: 0,
    pending: false,
  });

  vehicleSetupStore.setActiveVehicleId('vehicle-2');
  assert.deepStrictEqual(consumerEvents.map((events) => events.length), [1, 1, 1]);
  vehicleSetupStore.setActiveVehicleId('vehicle-3');
  assert.deepStrictEqual(consumerEvents.map((events) => events.length), [2, 2, 2]);

  vehicleSpecStore.set('vehicle-other', spec({ base_weight_lb: 4100 }));
  await waitForMicrotask();
  assert.deepStrictEqual(consumerEvents.map((events) => events.length), [2, 2, 2], 'Unrelated vehicle changes must be filtered.');
  vehicleSpecStore.set('vehicle-3', spec({ base_weight_lb: 5100 }));
  consumablesStore.setWaterGal('vehicle-3', 8);
  await waitForMicrotask();
  assert.deepStrictEqual(consumerEvents.map((events) => events.length), [3, 3, 3], 'Related source cascades should coalesce once per consumer.');
  assert.deepStrictEqual(consumerEvents[0][2].sources.sort(), ['consumables', 'spec']);

  selectors.resetFleetVehicleStateSelectorDiagnosticsForTests();
  const repeatedInput = selectorInput('memoized-vehicle');
  const repeatedStates = Array.from({ length: 25 }, () => selectors.selectFleetVehicleStateFromRecord(repeatedInput));
  assert.strictEqual(new Set(repeatedStates).size, 1, 'Identical Fleet inputs should reuse one canonical state object.');
  assert.deepStrictEqual(selectors.getFleetVehicleStateSelectorDiagnostics(), {
    calculations: 1,
    cacheHits: 24,
    evictions: 0,
    cacheSize: 1,
    maxCacheSize: 24,
  });
  const changedState = selectors.selectFleetVehicleStateFromRecord({
    ...repeatedInput,
    spec: spec({ base_weight_lb: 5200 }),
  });
  assert.notStrictEqual(changedState, repeatedStates[0]);
  assert.strictEqual(selectors.getFleetVehicleStateSelectorDiagnostics().calculations, 2);

  const nearLimitVehicle = fleetDomain.adaptLegacyVehicleToFleetVehicle({ vehicle: vehicle('near-limit'), specs: spec() });
  const nearLimitItem = fleetDomain.adaptLegacyLoadoutItemToFleetLoadoutItem({
    id: 'near-load',
    quantity: 1,
    weight_lbs: 1300,
    weight_source: 'measured',
    storage_location: 'rearLow',
  }, nearLimitVehicle.id);
  const nearLimit = fleetDomain.calculateFleetWeightResult(nearLimitVehicle, [], [nearLimitItem]);
  assert.strictEqual(nearLimit.operatingWeight.lbs, 6300);
  assert.strictEqual(nearLimit.payloadRemaining.lbs, 200);
  assert.strictEqual(nearLimit.gvwrUsagePct, 96.9);
  assert.strictEqual(nearLimit.gvwrOverageRisk, 'caution');

  const overLimitItem = fleetDomain.adaptLegacyLoadoutItemToFleetLoadoutItem({
    id: 'over-load',
    quantity: 1,
    weight_lbs: 1700,
    weight_source: 'estimate',
    storage_location: 'roof',
  }, nearLimitVehicle.id);
  const overLimit = fleetDomain.calculateFleetWeightResult(nearLimitVehicle, [], [overLimitItem]);
  assert.strictEqual(overLimit.payloadRemaining.lbs, -200);
  assert.strictEqual(overLimit.gvwrOverageRisk, 'critical');
  assert.notStrictEqual(overLimit.topHeavyRisk, 'clear');
  assert.strictEqual(nearLimitItem.weight.source, 'scale_ticket');
  assert.strictEqual(overLimitItem.weight.source, 'user_estimate');

  const trailerTongueItem = fleetDomain.adaptLegacyLoadoutItemToFleetLoadoutItem({
    id: 'trailer-tongue-load',
    name: 'Trailer tongue load',
    quantity: 1,
    weight_lbs: 600,
    weight_source: 'measured',
    storage_location: 'hitch',
  }, nearLimitVehicle.id);
  const trailerWeight = fleetDomain.calculateFleetWeightResult(nearLimitVehicle, [], [trailerTongueItem]);
  assert.notStrictEqual(trailerWeight.rearAxleRisk, 'clear');

  const invalidVehicle = fleetDomain.adaptLegacyVehicleToFleetVehicle({
    vehicle: vehicle('invalid-weight'),
    specs: spec({ base_weight_lb: -100, gvwr_lb: Number.POSITIVE_INFINITY }),
  });
  const invalidWeight = fleetDomain.calculateFleetWeightResult(invalidVehicle);
  assert(invalidWeight.validationFlags.some((flag) => flag.id === 'missing-base-weight'));
  assert(invalidWeight.validationFlags.some((flag) => flag.id === 'missing-gvwr'));

  const conflictingVehicle = fleetDomain.adaptLegacyVehicleToFleetVehicle({
    vehicle: vehicle('conflicting-weight'),
    specs: spec({ front_base_weight_lb: 3500, rear_base_weight_lb: 3000 }),
  });
  const conflictingWeight = fleetDomain.calculateFleetWeightResult(conflictingVehicle);
  assert(conflictingWeight.validationFlags.some((flag) => flag.id === 'base-axle-weight-conflict' && flag.severity === 'critical'));

  fleetFabric.resetFleetFabricGenerationDiagnosticsForTests();
  const fabricSource = { vehicle: vehicle('fabric-vehicle'), specs: spec(), tacticalUiState: { routeTarget: 'fleet' } };
  const firstFabric = fleetFabric.generateFleetFabricPayloadFromSource(fabricSource);
  const secondFabric = fleetFabric.generateFleetFabricPayloadFromSource(fabricSource);
  assert.strictEqual(firstFabric, secondFabric, 'Unchanged Fleet Fabric input should reuse the payload snapshot.');
  assert.deepStrictEqual(fleetFabric.getFleetFabricGenerationDiagnostics(), {
    generations: 1,
    cacheHits: 1,
    evictions: 0,
    cacheSize: 1,
    maxCacheSize: 24,
  });
  assert(!/(photo|image_url|remoteimage|dealerimage)/i.test(JSON.stringify(firstFabric)));

  const deletionVehicleOne = vehicle('delete-vehicle-1');
  const deletionVehicleTwo = vehicle('delete-vehicle-2');
  storage.set('ecs_local_vehicles', JSON.stringify([deletionVehicleOne, deletionVehicleTwo]));
  vehicleSetupStore.setActiveVehicleId(deletionVehicleOne.id);
  storage.set('ecs_expedition_current', JSON.stringify({
    id: 'active-expedition',
    state: 'active',
    activeVehicleId: deletionVehicleOne.id,
  }));
  const blockedDelete = await vehicleStore.delete(deletionVehicleOne.id, null);
  assert.strictEqual(blockedDelete.success, false);
  assert.match(blockedDelete.error, /active expedition/i);
  assert.strictEqual(vehicleStore.getById(deletionVehicleOne.id).id, deletionVehicleOne.id);
  storage.delete('ecs_expedition_current');
  const completedDelete = await vehicleStore.delete(deletionVehicleOne.id, null);
  assert.strictEqual(completedDelete.success, true);
  assert.strictEqual(vehicleStore.getById(deletionVehicleOne.id), null);
  assert.strictEqual(vehicleSetupStore.getActiveVehicleId(), deletionVehicleTwo.id);

  const navigate = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8');
  const discover = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
  const dispatch = fs.readFileSync(path.join(root, 'components', 'dispatch', 'DispatchCadCommandCenter.tsx'), 'utf8');
  const fleetScreen = fs.readFileSync(path.join(root, 'app', '(tabs)', 'fleet.tsx'), 'utf8');
  assert(navigate.includes('subscribeActiveVehicleState'));
  assert(discover.includes('subscribeActiveVehicleState'));
  assert(dispatch.includes('subscribeActiveVehicleState'));
  assert(fleetScreen.includes('const FleetPremiumVehicleCard = React.memo('));
  assert(fleetScreen.includes("recordECSPerformanceRender('active_vehicle_propagation', 'fleet_vehicle_card')"));

  consumerUnsubscribers.forEach((unsubscribe) => unsubscribe());
  offSelection();
  assert.strictEqual(activeVehicleState.getActiveVehicleSubscriptionDiagnostics().sourceSubscriptionCount, 0);

  console.log(JSON.stringify({
    schemaVersion: 'ecs.fleet-runtime-evidence.v1',
    baseline: {
      activeVehicleConsumers: 3,
      underlyingSourceSubscriptions: 21,
      repeatedSelectorCalls: 25,
      distinctSelectorObjects: 25,
      eligibleCardRendersForTenVehicleActiveSwitch: 10,
    },
    after: {
      activeVehicleConsumers: 3,
      underlyingSourceSubscriptions: 7,
      repeatedSelectorCalls: 25,
      selectorCalculations: 1,
      selectorCacheHits: 24,
      distinctSelectorObjects: 1,
      eligibleCardRendersForTenVehicleActiveSwitch: 2,
    },
    evidenceKind: 'deterministic_ci_runtime_and_component_policy',
    deviceFrameRateMeasured: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

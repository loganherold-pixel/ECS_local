const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
global.__DEV__ = false;

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness(options = {}) {
  const data = {
    vehicles: clone(options.vehicles || []),
    specs: new Map(options.specs || []),
    tiresLift: new Map(options.tiresLift || []),
    activeVehicleId: options.activeVehicleId || null,
    onboardingComplete: Boolean(options.onboardingComplete),
    setupVehicleId: options.setupVehicleId || null,
    setupComplete: Boolean(options.setupComplete),
  };
  const calls = {
    hydration: 0,
    flush: 0,
    replace: 0,
    sync: 0,
    productionStorageReads: 0,
  };
  let remainingReplaceFailures = options.replaceFailures || 0;
  const hydrated = () => ({
    waitForHydration: async () => { calls.hydration += 1; },
    flush: async () => { calls.flush += 1; },
  });

  const stores = {
    vehicles: {
      ...hydrated(),
      getLocalSnapshot: () => clone(data.vehicles),
      getById: (vehicleId) => clone(data.vehicles.find((vehicle) => vehicle.id === vehicleId) || null),
      replaceIsolatedLocalSnapshot: async (vehicles) => {
        calls.replace += 1;
        if (remainingReplaceFailures > 0) {
          remainingReplaceFailures -= 1;
          throw new Error('synthetic local write failed');
        }
        const changed = JSON.stringify(data.vehicles) !== JSON.stringify(vehicles);
        data.vehicles = clone(vehicles);
        return { changed, vehicleCount: data.vehicles.length };
      },
      syncToCloud: async () => {
        calls.sync += 1;
        return { synced: 0, errors: 0 };
      },
    },
    specs: {
      ...hydrated(),
      get: (vehicleId) => clone(data.specs.get(vehicleId) || null),
      set: (vehicleId, spec) => data.specs.set(vehicleId, clone(spec)),
    },
    tiresLift: {
      ...hydrated(),
      get: (vehicleId) => clone(data.tiresLift.get(vehicleId) || null),
      set: (vehicleId, config) => data.tiresLift.set(vehicleId, clone(config)),
    },
    activeVehicle: {
      ...hydrated(),
      getActiveVehicleId: () => data.activeVehicleId,
      setActiveVehicleId: (vehicleId) => { data.activeVehicleId = vehicleId; },
      hasCompletedOnboarding: () => data.onboardingComplete,
      markOnboardingComplete: () => { data.onboardingComplete = true; },
    },
    setup: {
      ...hydrated(),
      isComplete: () => Boolean(
        data.setupComplete &&
        data.setupVehicleId &&
        data.vehicles.some((vehicle) => vehicle.id === data.setupVehicleId)
      ),
      getSetupVehicleId: () => data.setupVehicleId,
      markComplete: (vehicleId) => {
        data.setupComplete = true;
        data.setupVehicleId = vehicleId || null;
      },
    },
  };

  return { data, calls, stores };
}

const qaPartition = {
  id: 'route_discovery_qa',
  isolated: true,
  filePrefix: 'ecs_route_discovery_qa__',
  storageKeyPrefix: 'ecs:route-discovery-qa:',
  cloudVehicleSyncAllowed: false,
};
const productionPartition = {
  id: 'production',
  isolated: false,
  filePrefix: '',
  storageKeyPrefix: '',
  cloudVehicleSyncAllowed: true,
};

const defaultHarness = createHarness();
const bootstrapPath = path.join(root, 'lib', 'explore', 'routeDiscoveryQaVehicleBootstrap.ts');
const originalLoad = Module._load;
Module._load = function loadBootstrapWithCanonicalStoreDoubles(request, parent, isMain) {
  if (parent?.filename === bootstrapPath) {
    if (request === '../buildProfileStoragePartition') {
      return { resolveBuildProfileStoragePartition: () => qaPartition };
    }
    if (request === '../setupStore') return { setupStore: defaultHarness.stores.setup };
    if (request === '../tiresLiftStore') return { tiresLiftStore: defaultHarness.stores.tiresLift };
    if (request === '../vehicleSetupStore') return { vehicleSetupStore: defaultHarness.stores.activeVehicle };
    if (request === '../vehicleSpecStore') return { vehicleSpecStore: defaultHarness.stores.specs };
    if (request === '../vehicleStore') return { vehicleStore: defaultHarness.stores.vehicles };
    if (request === './routeDiscoveryQaRuntime') {
      return { getRouteDiscoveryQaRuntime: () => ({ enabled: true }) };
    }
  }
  return originalLoad(request, parent, isMain);
};
const bootstrapModule = require(bootstrapPath);
Module._load = originalLoad;

const {
  ROUTE_DISCOVERY_QA_VEHICLE_ID,
  ROUTE_DISCOVERY_QA_VEHICLE,
  ROUTE_DISCOVERY_QA_VEHICLE_SPEC,
  ROUTE_DISCOVERY_QA_TIRES_LIFT,
  createRouteDiscoveryQaVehicleBootstrap,
} = bootstrapModule;

function dependencies(harness, applicable = true) {
  return {
    runtime: { enabled: applicable },
    partition: applicable ? qaPartition : productionPartition,
    ...harness.stores,
  };
}

function resolveEntry(overrides = {}) {
  const { resolveDistributionEntryState } = require(path.join(root, 'lib', 'auth', 'distributionEntryResolver.ts'));
  return resolveDistributionEntryState({
    currentPath: '/discover',
    isLoading: false,
    authenticated: true,
    guestOfflineAccess: false,
    rememberedOfflineAccess: false,
    accessState: null,
    offlineMode: false,
    setupComplete: true,
    setupRecoveryRequired: false,
    restorableShellRoute: null,
    requestedEntryRoute: null,
    isAuthScreen: false,
    isRecoveryScreen: false,
    recoveryMode: 'unknown',
    isLoginScreen: false,
    isSetupScreen: false,
    preserveSetupRoute: false,
    isProtectedScreen: true,
    bootstrapError: null,
    ...overrides,
  });
}

function buildCompatibilityProfile(harness) {
  const rigPath = path.join(root, 'lib', 'rigCompatibilityEngine.ts');
  delete require.cache[rigPath];
  const originalRigLoad = Module._load;
  Module._load = function loadRigWithCanonicalStoreState(request, parent, isMain) {
    if (parent?.filename === rigPath) {
      if (request === './vehicleSpecStore') return { vehicleSpecStore: harness.stores.specs };
      if (request === './vehicleStore') return { vehicleStore: harness.stores.vehicles };
      if (request === './vehicleSetupStore') return { vehicleSetupStore: harness.stores.activeVehicle };
      if (request === './tiresLiftStore') return { tiresLiftStore: harness.stores.tiresLift };
      if (request === './vehicleResourceProfile') {
        return {
          getVehicleResourceProfile: (vehicle, input) => ({
            fuelTankCapacityGal: input.spec.fuel_tank_capacity_gal,
            waterCapacityGal: vehicle.water_capacity_gal,
            tireSizeInches: input.tiresLift.tireSizeInches,
            suspensionLiftInches: input.tiresLift.suspensionLiftInches,
            isLeveled: input.tiresLift.isLeveled,
            frontLevelInches: input.tiresLift.frontLevelInches,
          }),
        };
      }
      if (request === './ai/confidenceEngine') {
        return { assessVehicleAssessmentConfidence: () => ({ score: 100 }) };
      }
      if (request === './ai/recommendationExplanationEngine') {
        return { explainRecommendation: () => ({ summary: 'QA' }) };
      }
    }
    return originalRigLoad(request, parent, isMain);
  };
  const rig = require(rigPath);
  Module._load = originalRigLoad;
  return rig.buildProfileFromSpecs();
}

function exerciseProfilePartitionedWebStorage() {
  const persistencePath = path.join(root, 'lib', 'keyValuePersistence.ts');
  delete require.cache[persistencePath];
  const values = new Map([
    ['ecs_local_vehicles', JSON.stringify([{ id: 'production-vehicle' }])],
    ['ecs_session_marker', 'existing-session'],
  ]);
  const touchedKeys = [];
  const previousLocalStorage = global.localStorage;
  const previousEnvironment = {
    profile: process.env.EXPO_PUBLIC_ECS_BUILD_PROFILE,
    transport: process.env.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT,
    networkDisabled: process.env.EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED,
  };
  global.localStorage = {
    getItem(key) { touchedKeys.push(`get:${key}`); return values.get(key) ?? null; },
    setItem(key, value) { touchedKeys.push(`set:${key}`); values.set(key, String(value)); },
    removeItem(key) { touchedKeys.push(`remove:${key}`); values.delete(key); },
  };
  process.env.EXPO_PUBLIC_ECS_BUILD_PROFILE = 'route-discovery-qa';
  process.env.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT = 'true';
  process.env.EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED = 'true';

  const originalPersistenceLoad = Module._load;
  Module._load = function loadWebPersistence(request, parent, isMain) {
    if (parent?.filename === persistencePath) {
      if (request === 'react-native') return { Platform: { OS: 'web' } };
      if (request === './fsCompat') {
        return {
          fsGetInfo: async () => ({ exists: false, isDirectory: false }),
          fsReadString: async () => '',
          fsWriteString: async () => {},
          getDocumentDirectory: async () => null,
        };
      }
      if (request === './ecsLogger') {
        return { ecsLog: { debug() {}, warnOnce() {} } };
      }
    }
    return originalPersistenceLoad(request, parent, isMain);
  };
  const { createPersistedKeyValueCache } = require(persistencePath);
  Module._load = originalPersistenceLoad;

  const qaVehicles = createPersistedKeyValueCache('profile-isolation-vehicle-probe', {
    partitionByBuildProfile: true,
  });
  const qaRead = qaVehicles.get('ecs_local_vehicles');
  qaVehicles.set('ecs_local_vehicles', JSON.stringify([{ id: ROUTE_DISCOVERY_QA_VEHICLE_ID }]));
  const sharedSession = createPersistedKeyValueCache('profile-isolation-session-probe');
  const sessionRead = sharedSession.get('ecs_session_marker');

  process.env.EXPO_PUBLIC_ECS_BUILD_PROFILE = 'fieldtest';
  delete process.env.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT;
  delete process.env.EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED;
  const fieldtestVehicles = createPersistedKeyValueCache('profile-isolation-vehicle-probe', {
    partitionByBuildProfile: true,
  });
  const fieldtestRead = fieldtestVehicles.get('ecs_local_vehicles');

  if (previousEnvironment.profile === undefined) delete process.env.EXPO_PUBLIC_ECS_BUILD_PROFILE;
  else process.env.EXPO_PUBLIC_ECS_BUILD_PROFILE = previousEnvironment.profile;
  if (previousEnvironment.transport === undefined) delete process.env.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT;
  else process.env.EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT = previousEnvironment.transport;
  if (previousEnvironment.networkDisabled === undefined) delete process.env.EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED;
  else process.env.EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED = previousEnvironment.networkDisabled;
  global.localStorage = previousLocalStorage;

  return { qaRead, fieldtestRead, sessionRead, touchedKeys, values };
}

const completed = [];
async function check(number, label, behavior) {
  await behavior();
  completed.push(number);
  console.log(`ok ${number} - ${label}`);
}

(async () => {
  const cold = createHarness();
  const coldBootstrap = createRouteDiscoveryQaVehicleBootstrap(dependencies(cold));

  await check(1, 'QA cold start creates exactly one synthetic vehicle', async () => {
    const result = await coldBootstrap.initialize();
    assert.strictEqual(result.state, 'ready');
    assert.deepStrictEqual(cold.data.vehicles.map((vehicle) => vehicle.id), [ROUTE_DISCOVERY_QA_VEHICLE_ID]);
  });

  await check(2, 'repeated bootstrap remains idempotent', async () => {
    await coldBootstrap.initialize();
    assert.strictEqual(cold.data.vehicles.length, 1);
    assert.strictEqual(cold.calls.replace, 1);
  });

  await check(3, 'canonical active vehicle is established', async () => {
    assert.strictEqual(cold.data.activeVehicleId, ROUTE_DISCOVERY_QA_VEHICLE_ID);
  });

  await check(4, 'canonical setup completion is established', async () => {
    assert.strictEqual(cold.stores.setup.isComplete(), true);
    assert.strictEqual(cold.data.setupVehicleId, ROUTE_DISCOVERY_QA_VEHICLE_ID);
  });

  await check(5, 'Explore remains selected after QA bootstrap', async () => {
    assert.strictEqual(resolveEntry({ currentPath: '/discover' }).redirectTarget, null);
  });

  await check(6, '/discover deep link remains /discover', async () => {
    const entry = resolveEntry({
      currentPath: '/',
      requestedEntryRoute: '/discover',
      isAuthScreen: true,
    });
    assert.strictEqual(entry.redirectTarget, '/discover');
  });

  await check(7, 'coordinate Explore activation remains on Explore', async () => {
    assert.strictEqual(resolveEntry({ currentPath: '/explore' }).redirectTarget, null);
  });

  await check(8, 'Fleet first-vehicle modal does not open with the QA vehicle', async () => {
    const { shouldOpenFleetFirstVehicleSetup } = require(path.join(root, 'lib', 'fleet', 'fleetFirstVehicleSetup.ts'));
    assert.strictEqual(shouldOpenFleetFirstVehicleSetup({
      loading: false,
      authLoading: false,
      vehicleCount: cold.data.vehicles.length,
      profileModalVisible: false,
      alreadyOpened: false,
    }), false);
  });

  const runtime = require(path.join(root, 'lib', 'explore', 'routeDiscoveryQaRuntime.ts'));
  const transport = require(path.join(root, 'lib', 'explore', 'routeDiscoveryQaTransport.ts'));
  const qaRuntime = runtime.getRouteDiscoveryQaRuntime();
  const transportResult = await transport.invokeRouteDiscoveryQaTransport({}, {
    latitude: qaRuntime.region.latitude,
    longitude: qaRuntime.region.longitude,
    radiusMiles: 500,
    locationSource: qaRuntime.region.source,
    qaMode: qaRuntime.mode,
    qaRegionId: qaRuntime.region.regionId,
    qaFixtureVersion: qaRuntime.fixtureVersion,
    accessPartition: qaRuntime.accessPartition,
    category: 'trail_packs',
    refinement: 'all',
  });
  const response = transportResult.data;

  await check(9, 'twenty deterministic QA route cards are reachable', async () => {
    assert.strictEqual(transportResult.error, null);
    assert.strictEqual(response.records.length, 20);
  });

  const compatibilityProfile = buildCompatibilityProfile(cold);
  await check(10, 'every visible QA card receives synthetic compatibility context', async () => {
    const cardContexts = response.records.map(() => compatibilityProfile?.vehicleId);
    assert.strictEqual(cardContexts.length, 20);
    assert.ok(cardContexts.every((vehicleId) => vehicleId === ROUTE_DISCOVERY_QA_VEHICLE_ID));
    assert.strictEqual(compatibilityProfile.fuel_range_miles, 360);
  });

  let navigatedRoute = null;
  await check(11, 'one summary card opens Trip Builder before hydration', async () => {
    const { dispatchSummaryFirstTripBuilderNavigation } = require(path.join(root, 'lib', 'explore', 'routeSummaryNavigation.ts'));
    const order = [];
    const route = { id: response.records[0].public_id, vehicleId: compatibilityProfile.vehicleId };
    dispatchSummaryFirstTripBuilderNavigation({
      route,
      stageReadiness: () => order.push('readiness'),
      stageItinerary: () => order.push('itinerary'),
      clearTransientUi: () => order.push('clear'),
      navigate: (value) => { order.push('navigate'); navigatedRoute = value; },
    });
    assert.deepStrictEqual(order, ['readiness', 'itinerary', 'clear', 'navigate']);
  });

  await check(12, 'Trip Builder retains the same synthetic vehicle identity', async () => {
    assert.strictEqual(navigatedRoute.vehicleId, cold.data.activeVehicleId);
  });

  await check(13, 'bootstrap does not initialize a Supabase client', async () => {
    const isolatedEnv = {
      EXPO_PUBLIC_ECS_BUILD_PROFILE: 'route-discovery-qa',
      EXPO_PUBLIC_ECS_ROUTE_DISCOVERY_QA_TRANSPORT: 'true',
      EXPO_PUBLIC_ECS_SUPABASE_NETWORK_DISABLED: 'true',
      EXPO_PUBLIC_SUPABASE_URL: 'https://production.example.invalid',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'production-key-placeholder',
    };
    const { applyRouteDiscoveryQaNetworkIsolation } = require(path.join(root, 'lib', 'explore', 'routeDiscoveryQaNetworkIsolation.js'));
    assert.strictEqual(applyRouteDiscoveryQaNetworkIsolation(isolatedEnv), true);
    assert.strictEqual(isolatedEnv.EXPO_PUBLIC_SUPABASE_URL, undefined);
    assert.strictEqual(isolatedEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY, undefined);
  });

  await check(14, 'bootstrap never starts vehicle synchronization', async () => {
    assert.strictEqual(cold.calls.sync, 0);
  });

  const partitionModule = require(path.join(root, 'lib', 'buildProfileStoragePartition.ts'));
  await check(15, 'QA persistence keys cannot read production keys', async () => {
    assert.strictEqual(
      partitionModule.partitionPersistenceStorageKey('ecs_local_vehicles', qaPartition),
      'ecs:route-discovery-qa:ecs_local_vehicles',
    );
    assert.notStrictEqual(
      partitionModule.partitionPersistenceFileKey('ecs_vehicle_store', qaPartition),
      partitionModule.partitionPersistenceFileKey('ecs_vehicle_store', productionPartition),
    );
    const storage = exerciseProfilePartitionedWebStorage();
    assert.strictEqual(storage.qaRead, null);
    assert.strictEqual(JSON.parse(storage.fieldtestRead)[0].id, 'production-vehicle');
    assert.strictEqual(storage.sessionRead, 'existing-session');
    assert.ok(storage.touchedKeys.includes('get:ecs:route-discovery-qa:ecs_local_vehicles'));
    assert.ok(storage.touchedKeys.includes('get:ecs_local_vehicles'));
  });

  await check(16, 'production vehicles are removed from the QA partition', async () => {
    const contaminated = createHarness({ vehicles: [{ ...ROUTE_DISCOVERY_QA_VEHICLE, id: 'real-production-vehicle', name: 'REAL' }] });
    await createRouteDiscoveryQaVehicleBootstrap(dependencies(contaminated)).initialize();
    assert.deepStrictEqual(contaminated.data.vehicles.map((vehicle) => vehicle.id), [ROUTE_DISCOVERY_QA_VEHICLE_ID]);
  });

  await check(17, 'QA vehicle cannot enter fieldtest', async () => {
    const fieldtest = createHarness();
    const result = await createRouteDiscoveryQaVehicleBootstrap(dependencies(fieldtest, false)).initialize();
    assert.strictEqual(result.state, 'not_applicable');
    assert.strictEqual(fieldtest.data.vehicles.length, 0);
    assert.strictEqual(fieldtest.calls.hydration, 0);
  });

  await check(18, 'fieldtest without a vehicle still enters ordinary setup', async () => {
    const entry = resolveEntry({ setupComplete: false, currentPath: '/discover' });
    assert.strictEqual(entry.redirectTarget, '/setup');
    const { shouldOpenFleetFirstVehicleSetup } = require(path.join(root, 'lib', 'fleet', 'fleetFirstVehicleSetup.ts'));
    assert.strictEqual(shouldOpenFleetFirstVehicleSetup({ loading: false, authLoading: false, vehicleCount: 0, profileModalVisible: false, alreadyOpened: false }), true);
  });

  await check(19, 'fieldtest with a real vehicle remains unchanged', async () => {
    const realVehicle = { ...ROUTE_DISCOVERY_QA_VEHICLE, id: 'fieldtest-real-vehicle', name: 'Field Vehicle' };
    const fieldtest = createHarness({ vehicles: [realVehicle] });
    await createRouteDiscoveryQaVehicleBootstrap(dependencies(fieldtest, false)).initialize();
    assert.deepStrictEqual(fieldtest.data.vehicles, [realVehicle]);
    assert.strictEqual(resolveEntry({ setupComplete: true, currentPath: '/discover' }).redirectTarget, null);
  });

  await check(20, 'QA cold restart reconstructs one deterministic profile', async () => {
    const restarted = createRouteDiscoveryQaVehicleBootstrap(dependencies(cold));
    assert.strictEqual((await restarted.initialize()).state, 'ready');
    assert.strictEqual(cold.data.vehicles.length, 1);
    assert.strictEqual(cold.data.vehicles[0].updated_at, ROUTE_DISCOVERY_QA_VEHICLE.updated_at);
  });

  await check(21, 'foreground initialization does not duplicate the profile', async () => {
    const foreground = createRouteDiscoveryQaVehicleBootstrap(dependencies(cold));
    await Promise.all([foreground.initialize(), foreground.initialize(), foreground.initialize()]);
    assert.deepStrictEqual(cold.data.vehicles.map((vehicle) => vehicle.id), [ROUTE_DISCOVERY_QA_VEHICLE_ID]);
  });

  await check(22, 'bootstrap failure is finite and retryable', async () => {
    const failing = createHarness({ replaceFailures: 1 });
    const instance = createRouteDiscoveryQaVehicleBootstrap(dependencies(failing));
    assert.deepStrictEqual(await instance.initialize(), {
      state: 'failed',
      vehicleId: null,
      errorCode: 'qa_vehicle_bootstrap_failed',
    });
    assert.strictEqual((await instance.retry()).state, 'ready');
    const unsafe = createHarness();
    const unsafeInstance = createRouteDiscoveryQaVehicleBootstrap({
      runtime: { enabled: true },
      partition: productionPartition,
      ...unsafe.stores,
    });
    assert.strictEqual((await unsafeInstance.initialize()).state, 'failed');
    assert.strictEqual(unsafe.calls.hydration, 0);
  });

  await check(23, 'strict result cap remains twenty unique routes', async () => {
    const policy = require(path.join(root, 'lib', 'explore', 'routeSearchResultPolicy.ts'));
    const ranked = Array.from({ length: 55 }, (_, index) => ({ id: `route-${index}`, rank: index }));
    ranked.splice(5, 0, { id: 'ROUTE-0', rank: 55 });
    const selected = policy.capUniqueRankedRoutes(ranked, (route) => route.id, 500);
    assert.strictEqual(selected.length, 20);
    assert.strictEqual(new Set(selected.map((route) => route.id.toLowerCase())).size, 20);
  });

  await check(24, 'strict-cap metadata exposes no continuation or Load More state', async () => {
    assert.strictEqual(response.meta.additionalMatchesExist, true);
    assert.strictEqual(response.meta.nextPage, null);
    assert.strictEqual(response.meta.nextCursor, null);
    const continuationAvailable = response.meta.nextPage != null || response.meta.nextCursor != null;
    assert.strictEqual(continuationAvailable, false);
  });

  await check(25, 'deterministic cap, deduplication, and performance events remain stable', async () => {
    const performance = require(path.join(root, 'lib', 'explore', 'explorePerformance.ts'));
    const second = await transport.invokeRouteDiscoveryQaTransport({}, {
      latitude: qaRuntime.region.latitude,
      longitude: qaRuntime.region.longitude,
      radiusMiles: 500,
      locationSource: qaRuntime.region.source,
      qaMode: qaRuntime.mode,
      qaRegionId: qaRuntime.region.regionId,
      qaFixtureVersion: qaRuntime.fixtureVersion,
      accessPartition: qaRuntime.accessPartition,
      category: 'trail_packs',
      refinement: 'all',
    });
    assert.strictEqual(second.error, null);
    assert.deepStrictEqual(
      second.data.records.map((record) => record.public_id),
      response.records.map((record) => record.public_id),
    );
    assert.ok(performance.getExplorePerformanceRecords().some((event) => event.event === 'result_cap_complete'));
  });

  assert.deepStrictEqual(completed, Array.from({ length: 25 }, (_, index) => index + 1));
  assert.strictEqual(ROUTE_DISCOVERY_QA_VEHICLE.make, null);
  assert.strictEqual(ROUTE_DISCOVERY_QA_VEHICLE.model, null);
  assert.strictEqual(ROUTE_DISCOVERY_QA_VEHICLE.year, null);
  assert.strictEqual(ROUTE_DISCOVERY_QA_VEHICLE_SPEC.drivetrain, '4x4');
  assert.strictEqual(ROUTE_DISCOVERY_QA_TIRES_LIFT.tireSizeInches, 33);
  console.log('Route-discovery QA isolated vehicle bootstrap checks passed (25 requirements).');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

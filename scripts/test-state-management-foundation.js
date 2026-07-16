const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const values = new Map();

global.__DEV__ = true;
global.localStorage = {
  get length() {
    return values.size;
  },
  key: (index) => Array.from(values.keys())[index] ?? null,
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  if (request.endsWith('ecsPerformanceDiagnostics')) {
    return {
      startECSPerformanceSpan: () => ({ end: () => {} }),
      getECSPerformanceSnapshot: () => ({ activeSubscriptionCount: 0, outstandingAsyncJobs: 0 }),
    };
  }
  if (request === './fsCompat' && parent?.filename.endsWith('keyValuePersistence.ts')) {
    return {
      fsGetInfo: async () => ({ exists: false, isDirectory: false, size: 0 }),
      fsReadString: async () => '',
      fsWriteString: async () => {},
      getDocumentDirectory: async () => null,
    };
  }
  if (request === './ecsLogger') {
    return { ecsLog: { debug: () => {}, warnOnce: () => {} } };
  }
  if (request === './vehicleStore' && parent?.filename.endsWith('setupStore.ts')) {
    return {
      vehicleStore: {
        getById: () => null,
        getLocalSnapshot: () => [],
      },
    };
  }
  if (request === './vehicleSpecStore' && parent?.filename.endsWith('setupStore.ts')) {
    return { vehicleSpecStore: { getFirst: () => null } };
  }
  if (request === './ecsSyncTypes') return { ECS_CHANNEL_PRIORITY: {} };
  if (request === './sourceTruth' && parent?.filename.endsWith('ecsBus.ts')) {
    return {
      assessEcsSummarySourceTruth: () => ({ freshness: 'unavailable' }),
      mapSourceTruthFreshnessToEcsFreshness: () => 'unavailable',
    };
  }
  return originalLoad.call(this, request, parent, isMain);
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function testOwnershipRegistry() {
  const ownership = require(path.join(root, 'lib', 'state', 'stateOwnershipRegistry.ts'));
  const validation = ownership.validateECSStateOwnershipRegistry();
  assert.deepStrictEqual(validation.errors, []);
  assert.strictEqual(validation.valid, true);
  assert.ok(ownership.ECS_STATE_OWNERSHIP_REGISTRY.length >= 15);
  assert.strictEqual(ownership.getECSStateOwnership('active_vehicle_selection').owner, 'vehicleSetupStore');
  assert.strictEqual(ownership.getECSStateOwnership('sync_outbox').sensitivity, 'private');
  assert.strictEqual(ownership.getECSStateOwnership('runtime_event_bus').persistence, 'memory_only');
  assert.strictEqual(ownership.getECSStateOwnership('dispatch_runtime').schemaVersion, 7);
  assert.ok(
    ownership.getECSStateOwnership('dispatch_runtime').adapters.includes('dispatchMissionCommandRuntime'),
  );
}

async function testHydrationCoordinator() {
  const {
    ECSStoreHydrationCoordinator,
  } = require(path.join(root, 'lib', 'state', 'storeHydrationCoordinator.ts'));

  const coordinator = new ECSStoreHydrationCoordinator({ defaultTimeoutMs: 200 });
  const order = [];
  let releaseStorage;
  let storageRuns = 0;
  const storageReady = new Promise((resolve) => {
    releaseStorage = resolve;
  });
  const plan = {
    id: 'cold_start',
    tasks: [
      {
        id: 'storage',
        hydrate: async () => {
          storageRuns += 1;
          await storageReady;
          order.push('storage');
        },
      },
      {
        id: 'dependent',
        dependencies: ['storage'],
        hydrate: () => order.push('dependent'),
      },
    ],
  };
  const first = coordinator.runPlan(plan);
  const joined = coordinator.runPlan(plan);
  assert.strictEqual(first, joined, 'Concurrent cold hydration calls should join one plan flight.');
  releaseStorage();
  const result = await first;
  assert.strictEqual(result.status, 'ready');
  assert.strictEqual(storageRuns, 1);
  assert.deepStrictEqual(order, ['storage', 'dependent']);

  const optionalFailure = await coordinator.runPlan({
    id: 'optional_failure',
    tasks: [{ id: 'optional_corrupt_store', required: false, hydrate: () => { throw new Error('corrupt'); } }],
  });
  assert.strictEqual(optionalFailure.status, 'ready');
  assert.deepStrictEqual(optionalFailure.failedTaskIds, ['optional_corrupt_store']);

  const timeoutCoordinator = new ECSStoreHydrationCoordinator({ defaultTimeoutMs: 50 });
  let releaseSlowStore;
  let slowStoreRuns = 0;
  const slowStoreReady = new Promise((resolve) => {
    releaseSlowStore = resolve;
  });
  const timeoutPlan = {
    id: 'timeout_safe',
    tasks: [{
      id: 'slow_store',
      timeoutMs: 50,
      hydrate: async () => {
        slowStoreRuns += 1;
        await slowStoreReady;
      },
    }],
  };
  const timedOut = await timeoutCoordinator.runPlan(timeoutPlan);
  assert.strictEqual(timedOut.status, 'degraded');
  assert.deepStrictEqual(timedOut.timedOutTaskIds, ['slow_store']);
  const joinedAfterTimeout = await timeoutCoordinator.runPlan(timeoutPlan);
  assert.deepStrictEqual(joinedAfterTimeout.timedOutTaskIds, ['slow_store']);
  assert.strictEqual(
    slowStoreRuns,
    1,
    'A timed-out hydration must retain its task flight until the underlying execution settles.',
  );
  assert.strictEqual(
    timeoutCoordinator.getDiagnostics().tasks.find((task) => task.id === 'slow_store').joinedCalls,
    1,
  );
  releaseSlowStore();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  const lateDiagnostic = timeoutCoordinator.getDiagnostics().tasks.find((task) => task.id === 'slow_store');
  assert.strictEqual(lateDiagnostic.status, 'ready');
  assert.strictEqual(lateDiagnostic.completedAfterTimeout, true);

  const generationCoordinator = new ECSStoreHydrationCoordinator({ defaultTimeoutMs: 50 });
  let releaseOldGeneration;
  const oldGenerationReady = new Promise((resolve) => {
    releaseOldGeneration = resolve;
  });
  const oldGenerationResult = await generationCoordinator.runPlan({
    id: 'old_generation',
    tasks: [{ id: 'generation_store', timeoutMs: 50, hydrate: () => oldGenerationReady }],
  });
  assert.deepStrictEqual(oldGenerationResult.timedOutTaskIds, ['generation_store']);

  generationCoordinator.resetForTests();
  let releaseNewGeneration;
  let newGenerationRuns = 0;
  const newGenerationReady = new Promise((resolve) => {
    releaseNewGeneration = resolve;
  });
  const newGenerationPlan = generationCoordinator.runPlan({
    id: 'new_generation',
    tasks: [{
      id: 'generation_store',
      timeoutMs: 50,
      hydrate: async () => {
        newGenerationRuns += 1;
        await newGenerationReady;
      },
    }],
  });
  await Promise.resolve();
  assert.strictEqual(newGenerationRuns, 1);

  releaseOldGeneration();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  const diagnosticWhileNewGenerationRuns = generationCoordinator
    .getDiagnostics()
    .tasks.find((task) => task.id === 'generation_store');
  assert.strictEqual(
    diagnosticWhileNewGenerationRuns.status,
    'running',
    'A late completion from an invalidated generation must not settle the current generation.',
  );
  assert.strictEqual(diagnosticWhileNewGenerationRuns.completedAfterTimeout, false);

  releaseNewGeneration();
  const newGenerationResult = await newGenerationPlan;
  assert.strictEqual(newGenerationResult.status, 'ready');
  const currentGenerationDiagnostic = generationCoordinator
    .getDiagnostics()
    .tasks.find((task) => task.id === 'generation_store');
  assert.strictEqual(currentGenerationDiagnostic.status, 'ready');
  assert.strictEqual(currentGenerationDiagnostic.completedAfterTimeout, false);

  const cycleCoordinator = new ECSStoreHydrationCoordinator();
  const cycle = await cycleCoordinator.runPlan({
    id: 'cycle',
    tasks: [
      { id: 'a', dependencies: ['b'], hydrate: () => {} },
      { id: 'b', dependencies: ['a'], hydrate: () => {} },
    ],
  });
  assert.strictEqual(cycle.status, 'degraded');
  assert.deepStrictEqual(new Set(cycle.failedTaskIds), new Set(['a', 'b']));
  assert.strictEqual(cycleCoordinator.getDiagnostics().cyclePreventionCount, 1);
}

async function testTransactionsAndConflicts() {
  const {
    ECSStateTransactionCoordinator,
  } = require(path.join(root, 'lib', 'state', 'stateTransactionCoordinator.ts'));
  const {
    decideECSIncomingUpdate,
    isIncomingRecordStale,
  } = require(path.join(root, 'lib', 'state', 'domainConflictPolicy.ts'));

  const transactions = new ECSStateTransactionCoordinator();
  let release;
  let executeCount = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = transactions.run({
    action: 'route_activation',
    idempotencyKey: 'route-sensitive-id',
    execute: async () => {
      executeCount += 1;
      await gate;
      return 'committed';
    },
  });
  const joined = transactions.run({
    action: 'route_activation',
    idempotencyKey: 'route-sensitive-id',
    execute: async () => 'duplicate',
  });
  assert.strictEqual(first, joined);
  release();
  assert.strictEqual(await first, 'committed');
  assert.strictEqual(executeCount, 1);
  assert.strictEqual(transactions.getDiagnostics().joinedCount, 1);
  assert.ok(!transactions.getDiagnostics().history[0].key.includes('route-sensitive-id'));

  let rolledBackTo = null;
  await assert.rejects(() => transactions.run({
    action: 'active_vehicle_switch',
    idempotencyKey: 'vehicle-1',
    captureSnapshot: () => ({ activeId: 'vehicle-old' }),
    execute: () => { throw new Error('write unavailable'); },
    rollback: (snapshot) => { rolledBackTo = snapshot.activeId; },
  }));
  assert.strictEqual(rolledBackTo, 'vehicle-old');
  assert.strictEqual(transactions.getDiagnostics().history.at(-1).status, 'rolled_back');

  const newerLocal = { id: 'one', updated_at: '2026-07-13T12:05:00.000Z', dirty: false };
  const olderIncoming = { id: 'one', updated_at: '2026-07-13T12:00:00.000Z' };
  assert.strictEqual(isIncomingRecordStale(newerLocal, olderIncoming), true);
  assert.strictEqual(
    decideECSIncomingUpdate({ policy: 'reject_older', local: newerLocal, incoming: olderIncoming }).reason,
    'incoming_stale',
  );
  const dirtyDecision = decideECSIncomingUpdate({
    policy: 'preserve_local_dirty',
    local: { id: 'one', updated_at: '2026-07-13T12:00:00.000Z', dirty: true, name: 'local' },
    incoming: { id: 'one', updated_at: '2026-07-13T12:00:00.000Z', name: 'cloud' },
    localDirty: true,
  });
  assert.deepStrictEqual({ accept: dirtyDecision.accept, conflict: dirtyDecision.conflict }, { accept: false, conflict: true });
  assert.strictEqual(
    decideECSIncomingUpdate({
      policy: 'source_priority',
      local: { id: 'one', updated_at: '2026-07-13T12:00:00.000Z', value: 1 },
      incoming: { id: 'one', updated_at: '2026-07-13T12:00:00.000Z', value: 2 },
      localSourcePriority: 5,
      incomingSourcePriority: 2,
    }).reason,
    'lower_priority_source',
  );
}

async function testMigrationsAndPersistenceDiagnostics() {
  values.set('ecs_last_user_id', 'raw-account-id');
  values.set('ecs_last_user_email', 'private@example.com');
  values.set('ecs_keep_signed_in', 'true');
  values.set('ecs_auth_expiry', 'not-a-timestamp');
  values.set('ecs_setup_complete', 'true');

  const { sessionStore } = require(path.join(root, 'lib', 'sessionStore.ts'));
  const { setupStore } = require(path.join(root, 'lib', 'setupStore.ts'));
  await Promise.all([sessionStore.waitForHydration(), setupStore.waitForHydration()]);

  assert.strictEqual(values.has('ecs_last_user_id'), false);
  assert.strictEqual(values.has('ecs_last_user_email'), false);
  assert.match(values.get('ecs_last_user_fingerprint'), /^user_[a-f0-9]{8}$/);
  assert.strictEqual(values.get('ecs_session_store_schema_version'), '2');
  assert.strictEqual(sessionStore.getPreferences().lastUserEmail, null);
  assert.strictEqual(sessionStore.getPreferences().authExpiry, null);
  assert.strictEqual(values.get('ecs_setup_store_schema_version'), '1');
  assert.strictEqual(setupStore.getCompletionFlag(), true);

  const {
    createPersistedKeyValueCache,
    getPersistedKeyValueDiagnostics,
  } = require(path.join(root, 'lib', 'keyValuePersistence.ts'));
  const originalSetItem = global.localStorage.setItem;
  global.localStorage.setItem = () => { throw new Error('storage unavailable'); };
  createPersistedKeyValueCache('ecs_unavailable_test').set('key', 'sensitive-value');
  global.localStorage.setItem = originalSetItem;
  const diagnostic = getPersistedKeyValueDiagnostics().find((item) => item.namespace === 'ecs_unavailable_test');
  assert.match(diagnostic.lastError, /storage unavailable/i);
  assert.ok(!diagnostic.lastError.includes('sensitive-value'));
}

async function testEventBus() {
  const { ecsBus } = require(path.join(root, 'lib', 'ecsBus.ts'));
  ecsBus.reset();
  let notifications = 0;
  ecsBus.subscribe('route', () => { notifications += 1; });
  const newest = {
    updated_at: new Date(Date.now() + 1_000).toISOString(),
    freshness: 'live',
    available: true,
  };
  ecsBus.publish('route', 'route_owner', newest);
  await wait(240);
  assert.strictEqual(notifications, 1, 'A valid debounced summary must reach subscribers.');
  ecsBus.publishImmediate('route', 'stale_adapter', {
    ...newest,
    updated_at: new Date(Date.now() - 1_000).toISOString(),
  });
  assert.strictEqual(ecsBus.getSummary('route').updated_at, newest.updated_at);
  assert.strictEqual(ecsBus.getMetrics().stale_rejection_count, 1);

  ecsBus.reset();
  ecsBus.subscribe('route', () => ecsBus.publishImmediate('risk', 'derived_risk'));
  ecsBus.subscribe('risk', () => ecsBus.publishImmediate('route', 'route_owner'));
  ecsBus.publishImmediate('route', 'route_owner');
  assert.strictEqual(ecsBus.getMetrics().circular_prevention_count, 1);

  const duplicate = () => {};
  ecsBus.subscribe('power', duplicate);
  ecsBus.subscribe('power', duplicate);
  assert.strictEqual(ecsBus.getMetrics().duplicate_subscription_count, 1);
  ecsBus.reset();
}

function testIntegrationContracts() {
  const appContext = fs.readFileSync(path.join(root, 'context', 'AppContext.tsx'), 'utf8');
  const rootLayout = fs.readFileSync(path.join(root, 'app', '_layout.tsx'), 'utf8');
  const storage = fs.readFileSync(path.join(root, 'lib', 'storage.ts'), 'utf8');
  const persistence = fs.readFileSync(path.join(root, 'lib', 'keyValuePersistence.ts'), 'utf8');
  assert.ok(appContext.includes('hydrateECSRequiredStartupState'));
  assert.ok(appContext.includes('syncActionQueue.bindActor(user.id)'));
  assert.ok(appContext.includes("action: 'logout'"));
  assert.ok(rootLayout.includes('hydrateECSRequiredStartupState'));
  assert.ok(storage.includes('isIncomingRecordStale(existing, item)'));
  assert.ok(!persistence.includes('rawPreview'));
  assert.ok(!persistence.includes("debugLog('set key', { key, value"));
}

async function main() {
  await testOwnershipRegistry();
  await testHydrationCoordinator();
  await testTransactionsAndConflicts();
  await testMigrationsAndPersistenceDiagnostics();
  await testEventBus();
  testIntegrationContracts();
  console.log('State management foundation tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

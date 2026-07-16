/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const offlineTileModulePath = path.join(root, 'lib', 'offlineTileSyncCoordinator.ts');
const startupModulePath = path.join(root, 'lib', 'state', 'ecsStartupHydration.ts');

global.__DEV__ = true;

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function deferredPersistence(raw) {
  const gate = deferred();
  let hydrated = false;
  let value = raw;
  return {
    get: () => hydrated ? value : null,
    set: (_key, next) => {
      value = String(next);
    },
    flush: async () => undefined,
    waitForHydration: () => gate.promise,
    isHydrated: () => hydrated,
    resolveHydration() {
      hydrated = true;
      gate.resolve();
    },
  };
}

const tileCacheStore = {
  cancelDownload: () => undefined,
  getRegion: () => null,
  startDownloadWithQuota: async () => ({ success: false, cleanupResult: null }),
};

let activeTilePersistence = null;
let startupStubs = null;
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('ecsPerformanceDiagnostics')) {
    return { startECSPerformanceSpan: () => ({ end: () => {} }) };
  }
  if (request === './keyValuePersistence' && parent?.filename.endsWith('offlineTileSyncCoordinator.ts')) {
    return { createPersistedKeyValueCache: () => activeTilePersistence };
  }
  if (request === './tileCacheStore' && parent?.filename.endsWith('offlineTileSyncCoordinator.ts')) {
    return { tileCacheStore };
  }
  if (startupStubs && parent?.filename.endsWith('ecsStartupHydration.ts')) {
    if (Object.prototype.hasOwnProperty.call(startupStubs, request)) {
      return startupStubs[request];
    }
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

function loadOfflineTileCoordinator(persistence) {
  activeTilePersistence = persistence;
  delete require.cache[require.resolve(offlineTileModulePath)];
  return require(offlineTileModulePath).offlineTileSyncCoordinator;
}

async function testOfflineTileHydrationVisibility() {
  const storedJob = {
    jobId: 'cached-job',
    regionId: 'cached-region',
    regionName: 'Cached Route',
    source: 'route-corridor',
    syncType: 'route',
    status: 'running',
    progress: { percent: 42, status: 'downloading', message: 'Downloading' },
    createdAt: '2026-07-13T12:00:00.000Z',
    updatedAt: '2026-07-13T12:01:00.000Z',
    appProcessBackgroundOnly: true,
  };
  const cachedPersistence = deferredPersistence(JSON.stringify([storedJob]));
  const coordinator = loadOfflineTileCoordinator(cachedPersistence);
  const cold = coordinator.getSnapshot();
  assert.strictEqual(cold.hydrationStatus, 'restoring');
  assert.strictEqual(cold.sourceState, 'restoring');
  assert.deepStrictEqual(cold.jobs, []);

  let updates = 0;
  coordinator.subscribe(() => {
    updates += 1;
  });
  assert.strictEqual(coordinator.getDiagnostics().subscriberCount, 1);
  const wait = coordinator.waitForHydration();
  assert.strictEqual(wait, coordinator.waitForHydration(), 'Tile-sync consumers must join one hydration promise.');
  cachedPersistence.resolveHydration();
  await wait;

  const restored = coordinator.getSnapshot();
  assert.strictEqual(restored.hydrationStatus, 'ready');
  assert.strictEqual(restored.sourceState, 'cached');
  assert.strictEqual(restored.jobs.length, 1);
  assert.strictEqual(restored.jobs[0].status, 'pending');
  assert.ok(updates >= 1, 'Late hydration must notify mounted tile-sync consumers.');
  assert.deepStrictEqual(
    {
      hydrationStatus: coordinator.getDiagnostics().hydrationStatus,
      sourceState: coordinator.getDiagnostics().sourceState,
      jobCount: coordinator.getDiagnostics().jobCount,
      activeJobCount: coordinator.getDiagnostics().activeJobCount,
      safeErrorCode: coordinator.getDiagnostics().safeErrorCode,
    },
    {
      hydrationStatus: 'ready',
      sourceState: 'cached',
      jobCount: 1,
      activeJobCount: 1,
      safeErrorCode: null,
    },
  );

  const lateConsumer = coordinator.getSnapshot();
  assert.strictEqual(lateConsumer.hydrationStatus, 'ready');
  assert.strictEqual(lateConsumer.jobs[0].jobId, 'cached-job');

  const emptyPersistence = deferredPersistence(null);
  const emptyCoordinator = loadOfflineTileCoordinator(emptyPersistence);
  assert.strictEqual(emptyCoordinator.getSnapshot().hydrationStatus, 'restoring');
  emptyPersistence.resolveHydration();
  await emptyCoordinator.waitForHydration();
  const empty = emptyCoordinator.getSnapshot();
  assert.strictEqual(empty.hydrationStatus, 'ready');
  assert.strictEqual(empty.sourceState, 'empty');
  assert.deepStrictEqual(empty.jobs, []);
}

async function testStartupHydrationJoinsOfflineTasks() {
  const readinessGate = deferred();
  const tileGate = deferred();
  let readinessRuns = 0;
  let tileRuns = 0;
  const hydratedStore = { waitForHydration: async () => undefined };
  const persistence = {
    waitForHydration: async () => undefined,
    get: () => null,
    set: () => undefined,
    delete: () => undefined,
    clear: () => undefined,
    flush: async () => undefined,
    isHydrated: () => true,
  };

  startupStubs = {
    '../dashboardStore': {
      hydrateCustomPresets: async () => undefined,
      hydrateDashboardState: async () => undefined,
    },
    '../expeditionStateStore': { waitForExpeditionStateHydration: async () => undefined },
    '../dispatchPersistenceAdapter': { dispatchPersistenceAdapter: hydratedStore },
    '../fleet/legacyVehicleFrameworkStateMigration': { sanitizeLegacyVehicleFrameworkState: async () => undefined },
    '../keyValuePersistence': { createPersistedKeyValueCache: () => persistence },
    '../loadoutStore': { loadoutStore: hydratedStore },
    '../navigation/ecsShellRouteState': { waitForECSShellRouteStateHydration: async () => undefined },
    '../powerSetupStore': { powerSetupStore: hydratedStore },
    '../sessionStore': { sessionStore: hydratedStore },
    '../setupStore': { setupStore: hydratedStore },
    '../tiresLiftStore': { tiresLiftStore: hydratedStore },
    '../consumablesStore': { consumablesStore: hydratedStore },
    '../vehicleSetupStore': { vehicleSetupStore: hydratedStore },
    '../vehicleSpecStore': { vehicleSpecStore: hydratedStore },
    '../vehicleStore': { vehicleStore: hydratedStore },
    '../offlinePrepPack/offlineReadinessCoordinator': {
      offlineReadinessCoordinator: {
        waitForHydration: () => {
          readinessRuns += 1;
          return readinessGate.promise;
        },
      },
    },
    '../offlineTileSyncCoordinator': {
      offlineTileSyncCoordinator: {
        waitForHydration: () => {
          tileRuns += 1;
          return tileGate.promise;
        },
      },
    },
  };

  delete require.cache[require.resolve(startupModulePath)];
  const startup = require(startupModulePath);
  const { ecsStoreHydrationCoordinator } = require(path.join(root, 'lib', 'state', 'storeHydrationCoordinator.ts'));
  ecsStoreHydrationCoordinator.resetForTests();

  const first = startup.hydrateECSOptionalStartupState(200);
  const joined = startup.hydrateECSOptionalStartupState(200);
  assert.strictEqual(first, joined, 'Concurrent startup callers must join the same optional hydration plan.');
  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(readinessRuns, 1);
  assert.strictEqual(tileRuns, 1);

  readinessGate.resolve();
  tileGate.resolve();
  const result = await first;
  assert.strictEqual(result.status, 'ready');
  assert.ok(result.tasks.some((task) => task.id === 'offline_readiness_manifest'));
  assert.ok(result.tasks.some((task) => task.id === 'offline_tile_sync'));

  const warm = await startup.hydrateECSOptionalStartupState(200);
  assert.strictEqual(warm.status, 'ready');
  assert.strictEqual(readinessRuns, 1, 'Warm startup must reuse the completed readiness task.');
  assert.strictEqual(tileRuns, 1, 'Warm startup must reuse the completed tile-sync task.');
}

async function main() {
  await testOfflineTileHydrationVisibility();
  await testStartupHydrationJoinsOfflineTasks();
  console.log('Offline hydration propagation tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

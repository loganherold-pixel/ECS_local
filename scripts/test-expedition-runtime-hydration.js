/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const storedRecord = {
  id: 'restored-expedition',
  state: 'active',
  activeVehicleId: 'restored-vehicle',
  vehicleName: 'Restored vehicle',
  startTime: '2026-07-16T12:00:00.000Z',
  endTime: null,
  pausedAt: null,
  totalPausedMs: 0,
  duration: null,
  distance: 4200,
  startFuelLevel: null,
  endFuelLevel: null,
  fuelDelta: null,
  startWaterLevel: null,
  endWaterLevel: null,
  waterDelta: null,
  peakRemoteness: null,
  homeLatitude: null,
  homeLongitude: null,
  cloudSessionId: null,
};
const persistedValues = new Map([
  ['ecs_expedition_current', JSON.stringify(storedRecord)],
]);
let hydrated = false;
let releaseHydration;
const hydrationPromise = new Promise((resolve) => {
  releaseHydration = () => {
    hydrated = true;
    resolve();
  };
});
const delayedPersistence = {
  get(key) {
    return hydrated ? persistedValues.get(key) ?? null : null;
  },
  readResult(key) {
    return {
      ok: hydrated,
      value: hydrated ? persistedValues.get(key) ?? null : null,
      hydrationStatus: hydrated ? 'ready' : 'hydrating',
      error: hydrated ? null : 'Persistence hydration is still pending.',
    };
  },
  set(key, value) {
    persistedValues.set(key, value);
  },
  delete(key) {
    persistedValues.delete(key);
  },
  clear() {
    persistedValues.clear();
  },
  flush() {
    return Promise.resolve();
  },
  waitForHydration() {
    return hydrationPromise;
  },
  isHydrated() {
    return hydrated;
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'android' } };
  }
  if (request === './keyValuePersistence' && parent?.filename?.endsWith('expeditionStateStore.ts')) {
    return { createPersistedKeyValueCache: () => delayedPersistence };
  }
  if (request === './supabase' && parent?.filename?.endsWith('expeditionStateStore.ts')) {
    return { supabase: {}, isSupabaseConfigured: false };
  }
  return originalLoad(request, parent, isMain);
};

const originalTypeScriptExtension = require.extensions['.ts'];
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

async function run() {
  const {
    expeditionStateStore,
    getExpeditionRuntimeSnapshot,
    waitForExpeditionStateHydration,
  } = require(path.join(root, 'lib', 'expeditionStateStore.ts'));

  assert.deepStrictEqual(
    {
      hydrationStatus: getExpeditionRuntimeSnapshot().hydrationStatus,
      source: getExpeditionRuntimeSnapshot().source,
      freshness: getExpeditionRuntimeSnapshot().freshness,
      activeRecord: getExpeditionRuntimeSnapshot().activeRecord,
    },
    {
      hydrationStatus: 'restoring',
      source: 'none',
      freshness: 'missing',
      activeRecord: null,
    },
    'A native consumer mounted before persistence resolves must receive an explicit restoring snapshot.',
  );

  const consumerSnapshots = [];
  const unsubscribe = expeditionStateStore.subscribe(() => {
    consumerSnapshots.push(getExpeditionRuntimeSnapshot());
  });
  releaseHydration();
  await waitForExpeditionStateHydration();

  const restored = getExpeditionRuntimeSnapshot();
  assert.strictEqual(consumerSnapshots.length, 1, 'Hydration should publish the restored identity once.');
  assert.strictEqual(restored.hydrationStatus, 'ready');
  assert.strictEqual(restored.source, 'restored');
  assert.strictEqual(restored.freshness, 'cached');
  assert.strictEqual(restored.activeRecord?.id, 'restored-expedition');
  assert.strictEqual(restored.activeRecord?.activeVehicleId, 'restored-vehicle');
  assert.strictEqual(restored.safeErrorCode, null);

  expeditionStateStore.reset();
  expeditionStateStore.beginExpedition({
    expeditionId: 'live-replacement-expedition',
    activeVehicleId: 'live-replacement-vehicle',
    vehicleName: 'Live replacement vehicle',
  });
  const liveReplacement = getExpeditionRuntimeSnapshot();
  assert.strictEqual(liveReplacement.hydrationStatus, 'ready');
  assert.strictEqual(liveReplacement.source, 'live');
  assert.strictEqual(liveReplacement.freshness, 'current');
  assert.strictEqual(liveReplacement.activeRecord?.id, 'live-replacement-expedition');
  assert.strictEqual(liveReplacement.activeRecord?.activeVehicleId, 'live-replacement-vehicle');

  const countBeforeCleanup = consumerSnapshots.length;
  unsubscribe();
  expeditionStateStore.updateTracking({ distance: 9000 });
  await Promise.resolve();
  assert.strictEqual(
    consumerSnapshots.length,
    countBeforeCleanup,
    'A released native consumer must not receive later live producer updates.',
  );

  console.log('[expedition-runtime-hydration] restoring, restored/cached, live replacement, and cleanup passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
  require.extensions['.ts'] = originalTypeScriptExtension;
});

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const values = new Map();
global.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

values.set('ecs_sync_action_queue', JSON.stringify([{
  id: 'legacy-action',
  type: 'generic_sync',
  priority: 'normal',
  payload: { label: 'legacy-a' },
  description: 'Legacy account action',
  createdAt: '2026-07-13T12:00:00.000Z',
  status: 'pending',
  retryCount: 0,
  maxRetries: 3,
  appliedLocally: true,
}]));

let online = false;
const connectivityListeners = new Set();
const connectivity = {
  isOnline: () => online,
  onStatusChange: (listener) => {
    connectivityListeners.add(listener);
    return () => connectivityListeners.delete(listener);
  },
};
const idbStores = new Map();
const idbQueue = {
  ready: Promise.resolve(),
  isUsingIDB: false,
  loadAll: async (store) => idbStores.get(store) ?? [],
  saveAll: async (store, entries) => idbStores.set(store, JSON.parse(JSON.stringify(entries))),
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  if (request === './connectivity' && parent?.filename.endsWith('syncActionQueue.ts')) return { connectivity };
  if (request === './idbQueue' && parent?.filename.endsWith('syncActionQueue.ts')) return { idbQueue };
  if (request === './retryClassifier' && parent?.filename.endsWith('syncActionQueue.ts')) {
    return {
      classifyError: () => ({
        category: 'unknown',
        strategy: { maxRetries: 3, suggestedDelayMs: 1, description: 'test' },
        suggestedDelayMs: 1,
        isPermanent: false,
      }),
      attemptAuthRefresh: async () => false,
      extractRetryAfter: () => null,
      ERROR_CATEGORY_LABELS: { unknown: 'Unknown' },
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

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function main() {
  const {
    buildSyncActorFingerprint,
    syncActionQueue,
  } = require(path.join(root, 'lib', 'syncActionQueue.ts'));
  const { conflictResolver } = require(path.join(root, 'lib', 'conflictResolver.ts'));
  await tick();
  await tick();

  const accountA = 'account-alpha-raw-id';
  const accountB = 'account-bravo-raw-id';
  const fingerprintA = buildSyncActorFingerprint(accountA);
  const fingerprintB = buildSyncActorFingerprint(accountB);
  assert.notStrictEqual(fingerprintA, fingerprintB);

  syncActionQueue.bindActor(accountA);
  assert.strictEqual(syncActionQueue.queue.length, 1, 'The first restored account should claim legacy unscoped actions once.');
  assert.strictEqual(syncActionQueue.queue[0].actorFingerprint, fingerprintA);
  const persistedAfterClaim = values.get('ecs_sync_action_queue');
  assert.ok(persistedAfterClaim.includes(fingerprintA));
  assert.ok(!persistedAfterClaim.includes(accountA));

  online = false;
  syncActionQueue.enqueue('generic_sync', { label: 'account-a' }, 'Account A action');
  syncActionQueue.bindActor(accountB);
  assert.strictEqual(syncActionQueue.queue.length, 0);
  assert.strictEqual(syncActionQueue.stats.heldForOtherAccounts, 2);

  syncActionQueue.enqueue('generic_sync', { label: 'account-b' }, 'Account B action');
  const processed = [];
  syncActionQueue.registerProcessor('generic_sync', async (action) => {
    processed.push(action.payload.label);
    return true;
  });
  online = true;
  await syncActionQueue.processQueue();
  assert.deepStrictEqual(processed, ['account-b']);

  syncActionQueue.clearAll();
  assert.strictEqual(syncActionQueue.queue.length, 0);
  assert.strictEqual(syncActionQueue.getActorIsolationDiagnostics().totalActions, 2, 'Account B maintenance must preserve Account A actions.');

  syncActionQueue.bindActor(accountA);
  assert.deepStrictEqual(syncActionQueue.queue.map((action) => action.payload.label), ['legacy-a', 'account-a']);
  await syncActionQueue.processQueue();
  assert.deepStrictEqual(processed, ['account-b', 'legacy-a', 'account-a']);

  online = false;
  let releaseSlow;
  const slowGate = new Promise((resolve) => { releaseSlow = resolve; });
  syncActionQueue.registerProcessor('generic_sync', async (action) => {
    if (action.payload.label === 'slow-a') {
      await slowGate;
    }
    processed.push(action.payload.label);
    return true;
  });
  syncActionQueue.enqueue('generic_sync', { label: 'slow-a' }, 'Slow account A action');
  online = true;
  const inFlight = syncActionQueue.processQueue();
  await tick();
  syncActionQueue.bindActor(accountB);
  releaseSlow();
  await inFlight;
  assert.strictEqual(syncActionQueue.queue.length, 0);
  syncActionQueue.bindActor(accountA);
  assert.strictEqual(syncActionQueue.queue[0].status, 'pending', 'An account switch must return an in-flight action to pending.');
  await syncActionQueue.processQueue();
  assert.strictEqual(syncActionQueue.pendingCount, 0);

  online = false;
  syncActionQueue.enqueue(
    'expedition_update',
    { expeditionId: 'expedition-a', changes: { destination: 'North' } },
    'First Account A edit',
  );
  syncActionQueue.enqueue(
    'expedition_update',
    { expeditionId: 'expedition-a', changes: { destination: 'South' } },
    'Second Account A edit',
  );
  online = true;
  await syncActionQueue.processQueue();
  assert.strictEqual(conflictResolver.pendingCount, 1);
  const accountAConflictId = conflictResolver.pendingConflicts[0].id;
  syncActionQueue.bindActor(accountB);
  assert.strictEqual(conflictResolver.pendingCount, 0, 'Another account must not see persisted conflict details.');
  conflictResolver.discardConflict(accountAConflictId);
  syncActionQueue.bindActor(accountA);
  assert.strictEqual(conflictResolver.pendingCount, 1, 'Another account must not resolve a hidden conflict.');

  syncActionQueue.clearAll();
  conflictResolver.clearAll();
  syncActionQueue.unbindActor();
  const beforeBlockedEnqueue = syncActionQueue.getActorIsolationDiagnostics().totalActions;
  syncActionQueue.enqueue('generic_sync', { label: 'unbound' }, 'Unbound action');
  assert.strictEqual(syncActionQueue.getActorIsolationDiagnostics().totalActions, beforeBlockedEnqueue);
  assert.strictEqual(syncActionQueue.startAutoProcess(), false);
  syncActionQueue.stopAutoProcess();

  const appContext = fs.readFileSync(path.join(root, 'context', 'AppContext.tsx'), 'utf8');
  assert.ok(appContext.includes('syncActionQueue.unbindActor()'));
  assert.ok(appContext.includes('syncActionQueue.bindActor(user.id)'));
  console.log('Sync action account isolation tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

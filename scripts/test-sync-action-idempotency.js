const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const values = new Map();
global.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};

values.set('ecs_sync_action_queue', JSON.stringify([{
  id: 'legacy-action',
  type: 'generic_sync',
  priority: 'normal',
  payload: { entityId: 'legacy-1' },
  description: 'Legacy action',
  createdAt: '2026-07-13T12:00:00.000Z',
  status: 'processing',
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

async function main() {
  const modulePath = path.join(root, 'lib', 'syncActionQueue.ts');
  const { buildSyncOperationFingerprint, syncActionQueue } = require(modulePath);
  const { conflictResolver } = require(path.join(root, 'lib', 'conflictResolver.ts'));
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const restored = syncActionQueue.queue.find((action) => action.id === 'legacy-action');
  assert.ok(restored, 'Legacy persisted actions should restore.');
  assert.strictEqual(restored.status, 'pending', 'Interrupted processing should restore as pending.');
  assert.strictEqual(restored.idempotencyKey, 'ecs-sync:legacy-action');
  assert.ok(restored.operationFingerprint.startsWith('sync-fingerprint:generic_sync:'));
  assert.ok(Number.isFinite(restored.sequence));

  assert.strictEqual(
    buildSyncOperationFingerprint('generic_sync', { b: 2, a: 1 }),
    buildSyncOperationFingerprint('generic_sync', { a: 1, b: 2 }),
    'Fingerprinting should be stable across object key order.',
  );

  syncActionQueue.clearAll();
  const first = syncActionQueue.enqueue('generic_sync', { entityId: 'same' }, 'First');
  const duplicate = syncActionQueue.enqueue('generic_sync', { entityId: 'same' }, 'Duplicate tap');
  assert.strictEqual(duplicate, first, 'Equivalent outstanding operations should collapse to one action.');
  assert.strictEqual(syncActionQueue.queue.length, 1);

  const changed = syncActionQueue.enqueue('generic_sync', { entityId: 'changed' }, 'Changed operation');
  assert.notStrictEqual(changed, first);
  assert.ok(syncActionQueue.queue[1].sequence > syncActionQueue.queue[0].sequence);

  const explicit = syncActionQueue.enqueue(
    'generic_sync',
    { entityId: 'explicit' },
    'Explicit operation',
    'normal',
    { idempotencyKey: 'offline-operation:explicit-1' },
  );
  const explicitDuplicate = syncActionQueue.enqueue(
    'generic_sync',
    { entityId: 'explicit', attempt: 2 },
    'Explicit retry',
    'normal',
    { idempotencyKey: 'offline-operation:explicit-1' },
  );
  assert.strictEqual(explicitDuplicate, explicit, 'Caller-supplied idempotency keys should win across retry payload changes.');

  syncActionQueue.clearAll();
  const processed = [];
  syncActionQueue.registerProcessor('generic_sync', async (action) => {
    processed.push(action.payload.label);
    return true;
  });
  syncActionQueue.enqueue('generic_sync', { label: 'normal-1' }, 'Normal 1', 'normal');
  syncActionQueue.enqueue('generic_sync', { label: 'normal-2' }, 'Normal 2', 'normal');
  syncActionQueue.enqueue('generic_sync', { label: 'critical-1' }, 'Critical 1', 'critical');
  online = true;
  await syncActionQueue.processQueue();
  assert.deepStrictEqual(processed, ['critical-1', 'normal-1', 'normal-2'], 'Replay should preserve priority and monotonic FIFO order.');

  online = false;
  const durableId = syncActionQueue.enqueue(
    'generic_sync',
    { label: 'durable' },
    'Durable operation',
    'normal',
    { idempotencyKey: 'offline-operation:durable-1' },
  );
  online = true;
  await syncActionQueue.processQueue();
  online = false;
  const replayedId = syncActionQueue.enqueue(
    'generic_sync',
    { label: 'durable', replay: true },
    'Duplicate restored replay',
    'normal',
    { idempotencyKey: 'offline-operation:durable-1' },
  );
  assert.strictEqual(replayedId, durableId, 'Completed explicit operations should not be enqueued a second time.');
  assert.strictEqual(syncActionQueue.pendingCount, 0);

  syncActionQueue.clearAll();
  conflictResolver.clearAll();
  online = false;
  syncActionQueue.enqueue(
    'expedition_update',
    { expeditionId: 'expedition-conflict', changes: { destination: 'North' } },
    'Offline destination edit',
  );
  syncActionQueue.enqueue(
    'expedition_update',
    { expeditionId: 'expedition-conflict', changes: { destination: 'South' } },
    'Remote destination edit after reconnect',
  );
  online = true;
  const conflictReplay = await syncActionQueue.processQueue();
  assert.strictEqual(conflictReplay.processed, 0, 'Conflicting local changes should be held instead of silently overwritten.');
  assert.strictEqual(syncActionQueue.pendingCount, 2);
  assert.strictEqual(conflictResolver.pendingConflicts.length, 1);
  syncActionQueue.clearAll();
  conflictResolver.clearAll();

  const syncProcessorSource = fs.readFileSync(path.join(root, 'lib', 'syncProcessors.ts'), 'utf8');
  assert.ok(syncProcessorSource.includes('idempotencyKey: action.idempotencyKey'));
  assert.ok(syncProcessorSource.includes('sequence: action.sequence'));

  syncActionQueue.stopAutoProcess();
  console.log('Sync action idempotency tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

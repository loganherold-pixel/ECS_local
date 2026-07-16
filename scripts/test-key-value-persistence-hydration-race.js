const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const documentDirectory = 'file:///ecs-test-documents/';
const files = new Map();
const readGates = new Map();
const writes = [];

global.__DEV__ = true;

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'ios' } };
  if (request.endsWith('ecsPerformanceDiagnostics')) {
    return { startECSPerformanceSpan: () => ({ end: () => {} }) };
  }
  if (request === './fsCompat' && parent?.filename.endsWith('keyValuePersistence.ts')) {
    return {
      fsGetInfo: async (filePath) => ({
        exists: files.has(filePath),
        isDirectory: false,
        size: files.get(filePath)?.length ?? 0,
      }),
      fsReadString: async (filePath) => {
        const gate = readGates.get(filePath);
        if (gate) await gate.promise;
        return files.get(filePath) ?? '';
      },
      fsWriteString: async (filePath, value) => {
        const serialized = String(value);
        writes.push({ filePath, value: serialized });
        files.set(filePath, serialized);
      },
      getDocumentDirectory: async () => documentDirectory,
    };
  }
  if (request === './ecsLogger') {
    return { ecsLog: { debug: () => {}, warnOnce: () => {} } };
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

async function allowQueuedWork() {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

async function testSetAndDeleteReplayOverDisk() {
  const { createPersistedKeyValueCache } = require(path.join(root, 'lib', 'keyValuePersistence.ts'));
  const namespace = 'ecs_pre_hydration_mutation_replay';
  const filePath = `${documentDirectory}${namespace}.json`;
  const readGate = deferred();
  files.set(filePath, JSON.stringify({
    diskOnly: 'disk',
    overwritten: 'disk',
    deleted: 'disk',
  }));
  readGates.set(filePath, readGate);

  const cache = createPersistedKeyValueCache(namespace);
  cache.set('localOnly', 'local');
  cache.set('overwritten', 'local');
  cache.delete('deleted');

  const flush = cache.flush();
  await allowQueuedWork();
  assert.strictEqual(
    writes.filter((entry) => entry.filePath === filePath).length,
    0,
    'A pre-hydration flush must not overwrite the disk snapshot before it is restored.',
  );

  readGate.resolve();
  await cache.waitForHydration();
  await flush;

  assert.strictEqual(cache.get('diskOnly'), 'disk');
  assert.strictEqual(cache.get('localOnly'), 'local');
  assert.strictEqual(cache.get('overwritten'), 'local');
  assert.strictEqual(cache.get('deleted'), null);
  assert.deepStrictEqual(JSON.parse(files.get(filePath)), {
    diskOnly: 'disk',
    overwritten: 'local',
    localOnly: 'local',
  });
}

async function testClearReplayPreservesOperationOrder() {
  const { createPersistedKeyValueCache } = require(path.join(root, 'lib', 'keyValuePersistence.ts'));
  const namespace = 'ecs_pre_hydration_clear_replay';
  const filePath = `${documentDirectory}${namespace}.json`;
  const readGate = deferred();
  files.set(filePath, JSON.stringify({
    diskOnly: 'disk',
    deleteAfterClear: 'disk',
  }));
  readGates.set(filePath, readGate);

  const cache = createPersistedKeyValueCache(namespace);
  cache.clear();
  cache.set('afterClear', 'retained');
  cache.set('deleteAfterClear', 'temporary');
  cache.delete('deleteAfterClear');

  const flush = cache.flush();
  await allowQueuedWork();
  assert.strictEqual(
    writes.filter((entry) => entry.filePath === filePath).length,
    0,
    'Clear and later mutations must wait for native hydration before persistence commits.',
  );

  readGate.resolve();
  await cache.waitForHydration();
  await flush;

  assert.strictEqual(cache.get('diskOnly'), null);
  assert.strictEqual(cache.get('afterClear'), 'retained');
  assert.strictEqual(cache.get('deleteAfterClear'), null);
  assert.deepStrictEqual(JSON.parse(files.get(filePath)), { afterClear: 'retained' });
}

async function main() {
  await testSetAndDeleteReplayOverDisk();
  await testClearReplayPreservesOperationOrder();
  console.log('Key-value persistence hydration race tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

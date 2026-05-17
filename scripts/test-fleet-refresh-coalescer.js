const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const { createFleetRefreshCoalescer } = require(path.join(
  __dirname,
  '..',
  'lib',
  'fleet',
  'fleetRefreshCoalescer.ts',
));

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeEvent(type, vehicleId, revision) {
  return { type, vehicleId, revision };
}

async function main() {
  let lastFetchedRevision = 0;
  const refreshes = [];
  const logs = [];
  const coalescer = createFleetRefreshCoalescer({
    delayMs: 20,
    getLastFetchedRevision: () => lastFetchedRevision,
    refresh: (batch) => {
      refreshes.push(batch);
      lastFetchedRevision = batch.highestRev;
    },
    log: (event, payload) => logs.push({ event, payload }),
  });

  for (let revision = 1; revision <= 11; revision += 1) {
    coalescer.schedule(makeEvent('update', revision % 2 === 0 ? 'vehicle-a' : 'vehicle-b', revision));
  }
  await wait(45);

  assert.strictEqual(refreshes.length, 1, 'Rapid vehicleStore revisions should execute one Fleet refresh.');
  assert.strictEqual(refreshes[0].highestRev, 11, 'Coalesced refresh should retain the highest revision.');
  assert.deepStrictEqual(
    refreshes[0].changedVehicleIds.sort(),
    ['vehicle-a', 'vehicle-b'],
    'Coalesced refresh should retain all changed vehicle IDs.',
  );
  assert.ok(
    logs.some((entry) => entry.event === 'fleet_refresh_scheduled'),
    'First event should log fleet_refresh_scheduled.',
  );
  assert.ok(
    logs.some((entry) => entry.event === 'fleet_refresh_coalesced' && entry.payload.highestRev === 11),
    'Later burst events should log fleet_refresh_coalesced with the highest revision.',
  );
  assert.ok(
    logs.some((entry) => entry.event === 'fleet_refresh_executed' && entry.payload.highestRev === 11),
    'Batch execution should log fleet_refresh_executed.',
  );

  coalescer.schedule(makeEvent('update', 'vehicle-a', 11));
  await wait(30);
  assert.strictEqual(refreshes.length, 1, 'Duplicate already-fetched revision should not refresh again.');

  const cancelledRefreshes = [];
  const cancelled = createFleetRefreshCoalescer({
    delayMs: 20,
    getLastFetchedRevision: () => 0,
    refresh: (batch) => cancelledRefreshes.push(batch),
  });
  cancelled.schedule(makeEvent('update', 'vehicle-c', 1));
  cancelled.cancel();
  await wait(35);
  assert.strictEqual(cancelledRefreshes.length, 0, 'Cancel should clear pending Fleet refresh timers.');

  const immediateRefreshes = [];
  const immediate = createFleetRefreshCoalescer({
    delayMs: 50,
    getLastFetchedRevision: () => 0,
    refresh: (batch) => immediateRefreshes.push(batch),
  });
  immediate.schedule(makeEvent('update', 'vehicle-d', 1));
  immediate.schedule(makeEvent('delete', 'vehicle-d', 2));
  assert.strictEqual(immediateRefreshes.length, 1, 'Delete events should bypass debounce and refresh immediately.');
  assert.strictEqual(immediateRefreshes[0].highestRev, 2, 'Immediate delete refresh should include latest revision.');
  immediate.cancel();

  console.log('Fleet refresh coalescer checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

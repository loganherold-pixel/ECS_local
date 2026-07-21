const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
global.__DEV__ = false;
const values = new Map();
global.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  return originalLoad(request, parent, isMain);
};
require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const store = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderPlanStore.ts'));
const storageKey = 'ecs_trip_builder_plan_v1';
const plan = {
  id: 'plan-safe-id',
  generatedAt: '2026-07-20T00:00:00.000Z',
  route: { routeId: 'route-safe-id', distanceMiles: 2 },
  suggestedStops: [
    { id: 'origin', type: 'start', sequence: 0 },
    { id: 'fuel', type: 'resupply', sequence: 1 },
    { id: 'trailhead', type: 'waypoint', sequence: 2 },
    { id: 'destination', type: 'finish', sequence: 3 },
  ],
};
const selectedStop = { id: 'selected-safe-id', name: 'Selected stop', category: 'fuel', selectionState: 'operator_selected' };
const base = {
  selectedRouteId: 'route-safe-id',
  plan,
  selectedResupplyStop: selectedStop,
  visible: true,
  itinerarySaved: false,
  itineraryEditSession: null,
};

(async () => {
  const diagnostics = [];
  store.setTripBuilderPersistenceDiagnosticListener((event) => diagnostics.push(event));
  const saved = await store.saveTripBuilderPlanState(base);
  assert.strictEqual(saved.schemaVersion, 2);
  assert.strictEqual(saved.revision, 1);
  assert.strictEqual(JSON.parse(values.get(storageKey)).revision, 1);
  assert.ok(diagnostics.some((item) => item.event === 'persistence_write_succeeded'));

  const durableBeforeFailure = values.get(storageKey);
  const originalSetItem = global.localStorage.setItem;
  let failNextWrite = true;
  global.localStorage.setItem = (key, value) => {
    if (failNextWrite) {
      failNextWrite = false;
      throw new Error('synthetic storage failure');
    }
    originalSetItem(key, value);
  };
  await assert.rejects(() => store.saveTripBuilderPlanState({ ...base, itinerarySaved: true }));
  assert.strictEqual(values.get(storageKey), durableBeforeFailure, 'A failed write must retain the last durable snapshot.');
  assert.ok(diagnostics.some((item) => item.event === 'persistence_write_failed'));
  global.localStorage.setItem = originalSetItem;

  const newer = store.createTripBuilderPlanSnapshot({ ...base, itinerarySaved: true });
  const older = { ...saved };
  await store.saveTripBuilderPlanSnapshot(newer);
  await store.saveTripBuilderPlanSnapshot(older);
  assert.strictEqual(JSON.parse(values.get(storageKey)).revision, newer.revision, 'An older snapshot must not replace the durable revision.');
  assert.ok(diagnostics.some((item) => item.event === 'persistence_snapshot_superseded'));

  store.__resetTripBuilderPlanStoreForTests();
  const restored = await store.hydrateTripBuilderPlanState();
  assert.strictEqual(restored.status, 'restored');
  assert.strictEqual(restored.state.plan.id, plan.id);
  assert.strictEqual(restored.state.selectedResupplyStop.id, selectedStop.id);
  assert.deepStrictEqual(restored.state.plan.suggestedStops.map((item) => item.id), ['origin', 'fuel', 'trailhead', 'destination']);

  values.set(storageKey, JSON.stringify({ ...base, schemaVersion: 1, updatedAt: '2026-07-19T00:00:00.000Z' }));
  store.__resetTripBuilderPlanStoreForTests();
  const migrated = await store.hydrateTripBuilderPlanState();
  assert.strictEqual(migrated.status, 'restored');
  assert.strictEqual(migrated.state.schemaVersion, 2);
  assert.strictEqual(migrated.state.revision, 1);
  assert.strictEqual(migrated.state.selectedResupplyStop, null);

  const incompatibleRaw = JSON.stringify({ ...base, schemaVersion: 99, revision: 99 });
  values.set(storageKey, incompatibleRaw);
  store.__resetTripBuilderPlanStoreForTests();
  const incompatible = await store.hydrateTripBuilderPlanState();
  assert.strictEqual(incompatible.status, 'incompatible');
  assert.strictEqual(values.get(storageKey), incompatibleRaw, 'Incompatible state must remain recoverable and must not be overwritten.');

  values.set(storageKey, '{broken');
  store.__resetTripBuilderPlanStoreForTests();
  const corrupt = await store.hydrateTripBuilderPlanState();
  assert.strictEqual(corrupt.status, 'incompatible');
  assert.strictEqual(corrupt.errorCategory, 'corrupt_json');
  assert.strictEqual(values.get(storageKey), '{broken');

  values.delete(storageKey);
  store.__resetTripBuilderPlanStoreForTests();
  const empty = await store.hydrateTripBuilderPlanState();
  assert.strictEqual(empty.status, 'empty');
  assert.strictEqual(values.has(storageKey), false, 'Hydration of an empty store must not persist default state.');

  await store.saveTripBuilderPlanState(base);
  await store.clearTripBuilderPlanState();
  store.__resetTripBuilderPlanStoreForTests();
  const cleared = await store.hydrateTripBuilderPlanState();
  assert.strictEqual(cleared.status, 'empty');

  const screen = fs.readFileSync(path.join(root, 'app', 'explore-trip-builder.tsx'), 'utf8');
  assert.ok(screen.includes('await updateLastTripBuilderPlanState({'));
  assert.ok(screen.includes('flushTripBuilderPlanState'));
  assert.ok(screen.includes('setPersistenceError'));
  assert.ok(!JSON.stringify(diagnostics).match(/latitude|longitude|geometry|provider|token|credential|userId/i));

  console.log('Trip Builder durable persistence regression tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

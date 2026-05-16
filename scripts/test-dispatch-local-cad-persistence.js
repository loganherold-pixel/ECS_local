const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const localStorageData = new Map();
global.localStorage = {
  getItem(key) {
    return localStorageData.has(key) ? localStorageData.get(key) : null;
  },
  setItem(key, value) {
    localStorageData.set(key, String(value));
  },
  removeItem(key) {
    localStorageData.delete(key);
  },
};

const originalLoad = Module._load;
Module._load = function loadWithReactNativeStub(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const originalTypeScriptExtension = Module._extensions['.ts'];
Module._extensions['.ts'] = function compileTypeScript(module, filename) {
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

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  delete require.cache[fullPath];
  return require(fullPath);
}

const commandCenterSource = fs.readFileSync(
  path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx'),
  'utf8',
);
const liveEventsSource = fs.readFileSync(path.join(process.cwd(), 'lib/dispatchLiveEvents.ts'), 'utf8');
const persistenceSource = fs.readFileSync(path.join(process.cwd(), 'lib/dispatchPersistenceAdapter.ts'), 'utf8');

const { normalizeDispatchEvent } = loadTypeScriptModule('lib/dispatchLiveEvents.ts');
const { dispatchPersistenceAdapter } = loadTypeScriptModule('lib/dispatchPersistenceAdapter.ts');

const defaults = {
  pings: [],
  queueItems: [],
  assignments: [],
  timelineEvents: [],
  cadEvents: [],
};

function createLocalCadEvent(overrides = {}) {
  const event = normalizeDispatchEvent({
    id: 'local-cad-1',
    timestamp: '2026-05-04T19:00:00Z',
    type: 'recovery',
    severity: 'warning',
    title: 'Recovery Assist',
    message: 'Recovery report created.',
    source: 'user_report',
    status: 'active',
    priority: 'High',
    category: 'recovery_assist',
    hazardType: 'recovery',
    note: 'Short local note.',
    locationStatus: 'GPS captured: 37.10000, -112.10000',
    dedupeKey: 'hazard-recovery:operator:recovery:high:short-local-note:37.10000,-112.10000',
    createdBy: {
      displayName: 'Command',
      callsign: 'CMD',
    },
    rig: {
      vehicleId: 'vehicle-1',
      label: 'Trail Rig',
    },
    location: {
      latitude: 37.1,
      longitude: -112.1,
      accuracyMeters: 12,
      timestamp: '2026-05-04T18:59:55Z',
      source: 'current_gps',
    },
    ...overrides,
  });
  assert.ok(event, 'Fixture event should normalize.');
  return event;
}

const expeditionId = `local-persistence-${Date.now()}`;
const firstEvent = createLocalCadEvent();
dispatchPersistenceAdapter.upsertCadEvent(expeditionId, defaults, firstEvent);
let snapshot = dispatchPersistenceAdapter.load(expeditionId, defaults);
assert.strictEqual(snapshot.cadEvents.length, 1, 'Local CAD event should persist.');
assert.strictEqual(snapshot.cadEvents[0].id, firstEvent.id, 'Persisted event should preserve id.');
assert.strictEqual(snapshot.cadEvents[0].createdAt, '2026-05-04T19:00:00.000Z', 'Persisted event should preserve createdAt.');
assert.strictEqual(snapshot.cadEvents[0].category, 'recovery_assist', 'Persisted event should preserve category.');
assert.strictEqual(snapshot.cadEvents[0].severity, 'warning', 'Persisted event should preserve severity.');
assert.strictEqual(snapshot.cadEvents[0].note, 'Short local note.', 'Persisted event should preserve note.');
assert.strictEqual(
  snapshot.cadEvents[0].locationStatus,
  'GPS captured: 37.10000, -112.10000',
  'Persisted event should preserve locationStatus.',
);
assert.strictEqual(snapshot.cadEvents[0].source, 'user_report', 'Persisted event should preserve source.');
assert.strictEqual(snapshot.cadEvents[0].status, 'active', 'Persisted event should preserve status.');
assert.strictEqual(snapshot.cadEvents[0].createdBy?.callsign, 'CMD', 'Persisted event should preserve minimal profile reference.');
assert.strictEqual(snapshot.cadEvents[0].rig?.vehicleId, 'vehicle-1', 'Persisted event should preserve vehicle reference.');
assert.strictEqual(snapshot.cadEvents[0].location?.latitude, 37.1, 'Persisted event should preserve location.');

dispatchPersistenceAdapter.upsertCadEvent(expeditionId, defaults, firstEvent);
snapshot = dispatchPersistenceAdapter.load(expeditionId, defaults);
assert.strictEqual(snapshot.cadEvents.length, 1, 'Hydration/upsert should not duplicate the same event.');

const duplicateByStableIdentity = createLocalCadEvent({
  id: 'local-cad-duplicate-id',
  timestamp: '2026-05-04T19:01:00Z',
});
dispatchPersistenceAdapter.upsertCadEvent(expeditionId, defaults, duplicateByStableIdentity);
snapshot = dispatchPersistenceAdapter.load(expeditionId, defaults);
assert.strictEqual(snapshot.cadEvents.length, 1, 'Stable dedupe key should collapse duplicate local CAD events.');
assert.strictEqual(snapshot.cadEvents[0].id, duplicateByStableIdentity.id, 'Latest duplicate event should replace the older stored copy.');

const malformedExpeditionId = `${expeditionId}-malformed`;
localStorage.setItem(`dispatch_state_${malformedExpeditionId}`, '{bad json');
snapshot = dispatchPersistenceAdapter.load(malformedExpeditionId, defaults);
assert.deepStrictEqual(snapshot.cadEvents, [], 'Malformed local CAD storage should fall back to safe defaults.');

const boundedExpeditionId = `${expeditionId}-bounded`;
for (let index = 0; index < 305; index += 1) {
  dispatchPersistenceAdapter.upsertCadEvent(boundedExpeditionId, defaults, createLocalCadEvent({
    id: `bounded-local-cad-${index}`,
    timestamp: new Date(Date.parse('2026-05-04T19:00:00Z') + index * 1000).toISOString(),
    dedupeKey: `bounded-local-cad-${index}`,
  }));
}
snapshot = dispatchPersistenceAdapter.load(boundedExpeditionId, defaults);
assert.strictEqual(snapshot.cadEvents.length, 300, 'Persisted local CAD events should be bounded for pruning readiness.');

for (const requiredSource of [
  'note?: string',
  'locationStatus?: string',
]) {
  assert.ok(liveEventsSource.includes(requiredSource), `Dispatch event contract should include ${requiredSource}.`);
}

for (const requiredSource of [
  'function isPersistableLocalDispatchEvent',
  "event.source === 'user_report' || event.source === 'team_member'",
  'getLocalDispatchPersistenceId(currentExpedition)',
  'dispatchPersistenceAdapter.load',
  '.filter(isPersistableLocalDispatchEvent)',
  'dispatchEventStore.upsertEvent(event)',
  'persistDispatchCadEventLocally(storedEvent)',
  'note: noteText',
  'locationStatus',
]) {
  assert.ok(commandCenterSource.includes(requiredSource), `Dispatch command center should hydrate/persist local CAD source: ${requiredSource}`);
}

assert.ok(
  persistenceSource.includes('DISPATCH_CAD_EVENT_PERSISTENCE_LIMIT') &&
    persistenceSource.includes('.slice(0, DISPATCH_CAD_EVENT_PERSISTENCE_LIMIT)'),
  'Dispatch CAD persistence should keep a bounded local event list.',
);

if (originalTypeScriptExtension) {
  Module._extensions['.ts'] = originalTypeScriptExtension;
}
Module._load = originalLoad;

console.log('Dispatch local CAD persistence checks passed.');

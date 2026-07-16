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
const persistenceProjectionSource = fs.readFileSync(
  path.join(process.cwd(), 'lib/dispatchPersistenceEventProjection.ts'),
  'utf8',
);
const backendSource = fs.readFileSync(path.join(process.cwd(), 'lib/dispatchCadEventBackendAdapter.ts'), 'utf8');

const { normalizeDispatchEvent } = loadTypeScriptModule('lib/dispatchLiveEvents.ts');
const { dispatchPersistenceAdapter } = loadTypeScriptModule('lib/dispatchPersistenceAdapter.ts');
const { dispatchEventStore } = loadTypeScriptModule('lib/dispatchEventStore.ts');
const {
  getDispatchPersistenceProjectionDiagnostics,
  resolveDispatchLocalPersistenceId,
  subscribeDispatchPersistenceCadEvents,
} = loadTypeScriptModule('lib/dispatchPersistenceEventProjection.ts');

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

const freshnessExpeditionId = `${expeditionId}-freshness`;
const newestEvent = createLocalCadEvent({
  id: 'freshness-event',
  message: 'Newest accepted state.',
  timestamp: '2026-05-04T19:05:00Z',
  updatedAt: '2026-05-04T19:05:00Z',
  dedupeKey: 'freshness-event',
});
const staleEvent = createLocalCadEvent({
  id: 'freshness-event',
  message: 'Stale response that arrived last.',
  timestamp: '2026-05-04T19:04:00Z',
  updatedAt: '2026-05-04T19:04:00Z',
  dedupeKey: 'freshness-event',
});
dispatchPersistenceAdapter.upsertCadEvent(freshnessExpeditionId, defaults, newestEvent);
dispatchPersistenceAdapter.upsertCadEvent(freshnessExpeditionId, defaults, staleEvent);
snapshot = dispatchPersistenceAdapter.load(freshnessExpeditionId, defaults);
assert.strictEqual(snapshot.cadEvents[0].message, 'Newest accepted state.', 'A late stale response must not rewind persisted CAD state.');

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

const accountAFallbackId = resolveDispatchLocalPersistenceId({ accountId: 'account-a' });
const accountBFallbackId = resolveDispatchLocalPersistenceId({ accountId: 'account-b' });
assert.notStrictEqual(
  accountAFallbackId,
  accountBFallbackId,
  'Fallback Dispatch persistence must be scoped by account.',
);
assert.strictEqual(
  resolveDispatchLocalPersistenceId({
    currentExpedition: { cloudSessionId: 'live-expedition-cloud', id: 'live-expedition-local' },
    activeConvoyId: 'secondary-convoy',
    accountId: 'account-a',
  }),
  'live-expedition-cloud',
  'The live current-expedition identity must win over convoy or account fallback identities.',
);

const projectionExpeditionId = `${expeditionId}-projection`;
const retainedLiveEvent = createLocalCadEvent({
  id: 'live-system-projection-event',
  timestamp: '2026-05-04T20:00:00Z',
  updatedAt: '2026-05-04T20:00:00Z',
  type: 'system',
  severity: 'info',
  title: 'Live system state',
  message: 'This non-persisted event must remain visible.',
  source: 'sync_state',
  status: 'active',
  priority: 'Normal',
  category: undefined,
  hazardType: undefined,
  dedupeKey: 'live-system-projection-event',
});
dispatchEventStore.clear();
dispatchEventStore.replaceEvents([retainedLiveEvent]);
const projectionLease = subscribeDispatchPersistenceCadEvents({
  expeditionId: projectionExpeditionId,
  defaults,
});
assert.strictEqual(getDispatchPersistenceProjectionDiagnostics().activeLeaseCount, 1);
let visibleProjectionUpdates = 0;
const unsubscribeVisibleProjection = dispatchEventStore.subscribe(() => {
  visibleProjectionUpdates += 1;
});
visibleProjectionUpdates = 0;

const latePersistedEvent = createLocalCadEvent({
  id: 'late-persisted-projection-event',
  timestamp: '2026-05-04T20:01:00Z',
  updatedAt: '2026-05-04T20:01:00Z',
  dedupeKey: 'late-persisted-projection-event',
  message: 'A late authoritative persistence update.',
});
const projectionRevisionBefore = dispatchPersistenceAdapter.getRevision(projectionExpeditionId);
dispatchPersistenceAdapter.upsertCadEvent(
  projectionExpeditionId,
  defaults,
  latePersistedEvent,
);
assert.strictEqual(
  dispatchPersistenceAdapter.getRevision(projectionExpeditionId),
  projectionRevisionBefore + 1,
  'Projection must not write back into persistence or create a circular revision.',
);
assert(
  dispatchEventStore.getSnapshot().some((event) => event.id === latePersistedEvent.id),
  'A persistence update after initial hydration must reach the visible Dispatch event store.',
);
assert(
  dispatchEventStore.getSnapshot().some((event) => event.id === retainedLiveEvent.id),
  'Projecting persisted events must preserve unrelated live events.',
);
assert.strictEqual(visibleProjectionUpdates, 1, 'One persistence mutation must produce one visible update.');

dispatchPersistenceAdapter.upsertCadEvent(
  projectionExpeditionId,
  defaults,
  latePersistedEvent,
);
assert.strictEqual(
  visibleProjectionUpdates,
  1,
  'An equivalent persisted snapshot must not produce a duplicate visible update.',
);

const wrongExpeditionEvent = createLocalCadEvent({
  id: 'wrong-expedition-projection-event',
  timestamp: '2026-05-04T20:02:00Z',
  updatedAt: '2026-05-04T20:02:00Z',
  dedupeKey: 'wrong-expedition-projection-event',
});
dispatchPersistenceAdapter.upsertCadEvent(
  `${projectionExpeditionId}-other`,
  defaults,
  wrongExpeditionEvent,
);
assert(
  !dispatchEventStore.getSnapshot().some((event) => event.id === wrongExpeditionEvent.id),
  'A different expedition persistence update must not contaminate the mounted context.',
);
assert.strictEqual(visibleProjectionUpdates, 1);

const duplicateProjectionLease = subscribeDispatchPersistenceCadEvents({
  expeditionId: projectionExpeditionId,
  defaults,
});
assert.strictEqual(getDispatchPersistenceProjectionDiagnostics().activeLeaseCount, 2);
visibleProjectionUpdates = 0;
const updatedLatePersistedEvent = createLocalCadEvent({
  ...latePersistedEvent,
  message: 'The authoritative persistence update changed once.',
  timestamp: '2026-05-04T20:03:00Z',
  updatedAt: '2026-05-04T20:03:00Z',
});
dispatchPersistenceAdapter.upsertCadEvent(
  projectionExpeditionId,
  defaults,
  updatedLatePersistedEvent,
);
assert.strictEqual(
  visibleProjectionUpdates,
  1,
  'Duplicate projection consumers must not duplicate a semantic visible update.',
);
assert.strictEqual(
  dispatchEventStore.getSnapshot().find((event) => event.id === latePersistedEvent.id)?.message,
  'The authoritative persistence update changed once.',
);
duplicateProjectionLease.unsubscribe();
assert.strictEqual(getDispatchPersistenceProjectionDiagnostics().activeLeaseCount, 1);

const accountAEvent = createLocalCadEvent({
  id: 'account-a-only-dispatch-event',
  timestamp: '2026-05-04T20:04:00Z',
  updatedAt: '2026-05-04T20:04:00Z',
  dedupeKey: 'account-a-only-dispatch-event',
});
dispatchPersistenceAdapter.upsertCadEvent(accountAFallbackId, defaults, accountAEvent);
dispatchEventStore.clear();
const accountBProjectionLease = subscribeDispatchPersistenceCadEvents({
  expeditionId: accountBFallbackId,
  defaults,
});
assert(
  !dispatchEventStore.getSnapshot().some((event) => event.id === accountAEvent.id),
  'A fallback snapshot from another account must not be projected.',
);
accountBProjectionLease.unsubscribe();
assert.strictEqual(getDispatchPersistenceProjectionDiagnostics().activeLeaseCount, 1);

projectionLease.unsubscribe();
assert.strictEqual(getDispatchPersistenceProjectionDiagnostics().activeLeaseCount, 0);
unsubscribeVisibleProjection();
dispatchEventStore.clear();
const postCleanupEvent = createLocalCadEvent({
  id: 'post-cleanup-projection-event',
  timestamp: '2026-05-04T20:05:00Z',
  updatedAt: '2026-05-04T20:05:00Z',
  dedupeKey: 'post-cleanup-projection-event',
});
dispatchPersistenceAdapter.upsertCadEvent(projectionExpeditionId, defaults, postCleanupEvent);
assert(
  !dispatchEventStore.getSnapshot().some((event) => event.id === postCleanupEvent.id),
  'Unsubscribed projection leases must stop receiving persistence updates.',
);

for (const requiredSource of [
  'note?: string',
  'locationStatus?: string',
]) {
  assert.ok(liveEventsSource.includes(requiredSource), `Dispatch event contract should include ${requiredSource}.`);
}

for (const requiredSource of [
  'resolveDispatchLocalPersistenceId',
  'subscribeDispatchPersistenceCadEvents',
  'liveCurrentExpeditionDispatchId',
  'dispatchPersistenceAdapter.hydrateResult',
  'beginECSAsyncSurfaceRequest',
  'settleECSAsyncSurfaceRequest',
  'Retry Restore',
  '.filter(isPersistableLocalDispatchEvent)',
  'const acceptedEvent = dispatchEventStore.upsertEvent',
  'persistDispatchCadEventLocally(storedEvent)',
  'note: noteText',
  'locationStatus',
]) {
  assert.ok(commandCenterSource.includes(requiredSource), `Dispatch command center should hydrate/persist local CAD source: ${requiredSource}`);
}

for (const requiredSource of [
  'function isPersistableLocalDispatchEvent',
  "event.source === 'user_report' || event.source === 'team_member'",
  'changedExpeditionId === expeditionId',
  'lastProjectedRevision === revision',
]) {
  assert.ok(
    persistenceProjectionSource.includes(requiredSource),
    `Dispatch persistence projection should include ${requiredSource}`,
  );
}

assert.ok(
  persistenceSource.includes('DISPATCH_CAD_EVENT_PERSISTENCE_LIMIT') &&
    persistenceSource.includes('.slice(0, DISPATCH_CAD_EVENT_PERSISTENCE_LIMIT)'),
  'Dispatch CAD persistence should keep a bounded local event list.',
);

assert.ok(
  backendSource.includes('.abortSignal(controller.signal)') &&
    commandCenterSource.includes('let inFlight = false') &&
    commandCenterSource.includes('generation !== requestGeneration'),
  'Durable CAD polling should be bounded, single-flight, abortable, and stale-request guarded.',
);

async function runAsyncHydrationChecks() {
  const originalGetItem = global.localStorage.getItem;
  global.localStorage.getItem = () => { throw new Error('storage unavailable'); };
  const failed = await dispatchPersistenceAdapter.hydrateResult(
    `${expeditionId}-provider-failed`,
    defaults,
    { timeoutMs: 250 },
  );
  global.localStorage.getItem = originalGetItem;
  assert.strictEqual(failed.status, 'error', 'A storage-provider read failure must not become ready-empty.');
  assert.strictEqual(failed.snapshot, null);
  assert.strictEqual(failed.safeCode, 'dispatch_persistence_provider_failed');

  let equivalentReadCount = 0;
  global.localStorage.getItem = (key) => {
    equivalentReadCount += 1;
    return originalGetItem.call(global.localStorage, key);
  };
  await Promise.all([
    dispatchPersistenceAdapter.hydrateResult(`${expeditionId}-single-flight`, defaults, { timeoutMs: 250 }),
    dispatchPersistenceAdapter.hydrateResult(`${expeditionId}-single-flight`, defaults, { timeoutMs: 250 }),
  ]);
  global.localStorage.getItem = originalGetItem;
  assert.strictEqual(equivalentReadCount, 1, 'Equivalent hydration requests must share one provider read.');

  const controller = new AbortController();
  controller.abort();
  const cancelled = await dispatchPersistenceAdapter.hydrateResult(
    `${expeditionId}-cancelled`,
    defaults,
    { signal: controller.signal, timeoutMs: 250 },
  );
  assert.strictEqual(cancelled.status, 'cancelled');
  assert.strictEqual(cancelled.snapshot, null);
}

runAsyncHydrationChecks().then(() => {
  if (originalTypeScriptExtension) {
    Module._extensions['.ts'] = originalTypeScriptExtension;
  }
  Module._load = originalLoad;
  console.log('Dispatch local CAD persistence checks passed.');
}).catch((error) => {
  if (originalTypeScriptExtension) {
    Module._extensions['.ts'] = originalTypeScriptExtension;
  }
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});

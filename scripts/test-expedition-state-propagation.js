/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const memoryStorage = new Map();

global.localStorage = {
  getItem(key) { return memoryStorage.has(key) ? memoryStorage.get(key) : null; },
  setItem(key, value) { memoryStorage.set(key, String(value)); },
  removeItem(key) { memoryStorage.delete(key); },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'web' },
      AppState: { currentState: 'active', addEventListener() { return { remove() {} }; } },
    };
  }
  return originalLoad(request, parent, isMain);
};

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

const {
  expeditionStateStore,
  getExpeditionRuntimeSnapshot,
  getExpeditionStateSubscriptionDiagnostics,
} = require(path.join(root, 'lib/expeditionStateStore.ts'));
const {
  resolveDispatchLocalPersistenceId,
  subscribeDispatchPersistenceCadEvents,
} = require(path.join(root, 'lib/dispatchPersistenceEventProjection.ts'));

function createProjectionSource(initialEvent) {
  let revision = 1;
  let cadEvents = [initialEvent];
  const listeners = new Set();
  return {
    getRevision() { return revision; },
    load() { return { cadEvents }; },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(expeditionId, event) {
      revision += 1;
      cadEvents = [event];
      listeners.forEach((listener) => listener(expeditionId));
    },
    get listenerCount() { return listeners.size; },
  };
}

function createProjectionTarget() {
  let events = [];
  return {
    getSnapshot() { return events; },
    replaceEvents(nextEvents) {
      const currentSignature = JSON.stringify(events);
      const nextSignature = JSON.stringify(nextEvents);
      if (currentSignature !== nextSignature) events = nextEvents;
    },
  };
}

function localDispatchEvent(id, message) {
  return {
    id,
    source: 'user_report',
    message,
  };
}

async function run() {
  assert.deepStrictEqual(
    {
      hydrationStatus: getExpeditionRuntimeSnapshot().hydrationStatus,
      source: getExpeditionRuntimeSnapshot().source,
      freshness: getExpeditionRuntimeSnapshot().freshness,
      activeRecord: getExpeditionRuntimeSnapshot().activeRecord,
    },
    {
      hydrationStatus: 'ready',
      source: 'none',
      freshness: 'missing',
      activeRecord: null,
    },
    'A web consumer should receive an explicit ready/missing runtime snapshot before any live mutation.',
  );
  expeditionStateStore.reset();
  expeditionStateStore.clearTimeline();

  const firstConsumerEvents = [];
  const stopFirstConsumer = expeditionStateStore.subscribe((state, record) => {
    firstConsumerEvents.push({ state, distance: record?.distance ?? null });
  });

  expeditionStateStore.beginExpedition({
    expeditionId: 'propagation-expedition',
    activeVehicleId: 'vehicle-propagation',
    vehicleName: 'Propagation vehicle',
  });
  assert.strictEqual(firstConsumerEvents.at(-1)?.state, 'active');
  assert.strictEqual(getExpeditionRuntimeSnapshot().activeRecord?.id, 'propagation-expedition');
  assert.strictEqual(getExpeditionRuntimeSnapshot().source, 'live');
  assert.strictEqual(getExpeditionRuntimeSnapshot().freshness, 'current');

  // ECS consumers use getSnapshot + subscribe. A late-mounted consumer must
  // read the already-restored identity before waiting for its next event.
  assert.strictEqual(expeditionStateStore.getCurrentExpedition()?.id, 'propagation-expedition');
  const lateConsumerEvents = [];
  const stopLateConsumer = expeditionStateStore.subscribe((state, record) => {
    lateConsumerEvents.push({ state, distance: record?.distance ?? null });
  });

  const firstCountBeforeTracking = firstConsumerEvents.length;
  expeditionStateStore.updateTracking({ distance: 100 });
  expeditionStateStore.updateTracking({ distance: 200 });
  expeditionStateStore.updateTracking({ distance: 200 });
  await Promise.resolve();

  assert.strictEqual(
    firstConsumerEvents.length,
    firstCountBeforeTracking + 1,
    'Rapid GPS tracking writes should coalesce into one consumer invalidation.',
  );
  assert.deepStrictEqual(lateConsumerEvents, [{ state: 'active', distance: 200 }]);

  const diagnostic = getExpeditionStateSubscriptionDiagnostics();
  assert.strictEqual(diagnostic.consumerCount, 2);
  assert.strictEqual(diagnostic.latestProducerEvent.source, 'tracking');
  assert.strictEqual(diagnostic.latestProducerEvent.hasRecord, true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(diagnostic.latestProducerEvent, 'id'), false);

  stopFirstConsumer();
  const lateCountBeforeCleanupCheck = lateConsumerEvents.length;
  expeditionStateStore.updateTracking({ peakRemoteness: 37 });
  await Promise.resolve();
  assert.strictEqual(firstConsumerEvents.length, firstCountBeforeTracking + 1);
  assert.strictEqual(lateConsumerEvents.length, lateCountBeforeCleanupCheck + 1);
  assert.strictEqual(getExpeditionStateSubscriptionDiagnostics().consumerCount, 1);

  const firstDispatchId = resolveDispatchLocalPersistenceId({
    currentExpedition: getExpeditionRuntimeSnapshot().activeRecord,
    accountId: 'operator-account',
  });
  assert.strictEqual(firstDispatchId, 'propagation-expedition');
  const firstProjectionSource = createProjectionSource(
    localDispatchEvent('expedition-a-event', 'First expedition event.'),
  );
  const projectionTarget = createProjectionTarget();
  const firstProjectionLease = subscribeDispatchPersistenceCadEvents({
    expeditionId: firstDispatchId,
    defaults: { pings: [], queueItems: [], assignments: [], timelineEvents: [], cadEvents: [] },
    source: firstProjectionSource,
    target: projectionTarget,
  });
  assert.strictEqual(projectionTarget.getSnapshot()[0].id, 'expedition-a-event');

  const lateCountBeforeSwitch = lateConsumerEvents.length;
  expeditionStateStore.reset();
  expeditionStateStore.beginExpedition({
    expeditionId: 'replacement-expedition',
    activeVehicleId: 'replacement-vehicle',
    vehicleName: 'Replacement vehicle',
  });
  assert.strictEqual(
    lateConsumerEvents.length,
    lateCountBeforeSwitch + 2,
    'The subscribed Navigate runtime should observe both the explicit standby transition and replacement expedition.',
  );
  const replacementRuntime = getExpeditionRuntimeSnapshot();
  assert.strictEqual(replacementRuntime.activeRecord?.id, 'replacement-expedition');
  assert.strictEqual(replacementRuntime.activeRecord?.activeVehicleId, 'replacement-vehicle');
  assert.strictEqual(replacementRuntime.source, 'live');
  assert.strictEqual(replacementRuntime.freshness, 'current');

  firstProjectionLease.unsubscribe();
  const replacementDispatchId = resolveDispatchLocalPersistenceId({
    currentExpedition: replacementRuntime.activeRecord,
    accountId: 'operator-account',
  });
  assert.strictEqual(replacementDispatchId, 'replacement-expedition');
  const replacementProjectionSource = createProjectionSource(
    localDispatchEvent('expedition-b-event', 'Replacement expedition event.'),
  );
  const replacementProjectionLease = subscribeDispatchPersistenceCadEvents({
    expeditionId: replacementDispatchId,
    defaults: { pings: [], queueItems: [], assignments: [], timelineEvents: [], cadEvents: [] },
    source: replacementProjectionSource,
    target: projectionTarget,
  });
  assert.strictEqual(
    projectionTarget.getSnapshot()[0].id,
    'expedition-b-event',
    'Dispatch must replace the old expedition projection when canonical expedition identity switches.',
  );
  firstProjectionSource.update(
    firstDispatchId,
    localDispatchEvent('stale-expedition-a-event', 'Stale prior expedition event.'),
  );
  assert.strictEqual(
    projectionTarget.getSnapshot()[0].id,
    'expedition-b-event',
    'The released Dispatch projection must reject late updates from the prior expedition.',
  );
  replacementProjectionSource.update(
    replacementDispatchId,
    localDispatchEvent('expedition-b-updated', 'Current expedition update.'),
  );
  assert.strictEqual(projectionTarget.getSnapshot()[0].id, 'expedition-b-updated');
  assert.strictEqual(firstProjectionSource.listenerCount, 0);
  assert.strictEqual(replacementProjectionSource.listenerCount, 1);
  replacementProjectionLease.unsubscribe();
  assert.strictEqual(replacementProjectionSource.listenerCount, 0);

  stopLateConsumer();
  assert.strictEqual(getExpeditionStateSubscriptionDiagnostics().consumerCount, 0);
  expeditionStateStore.reset();

  const navigateSource = fs.readFileSync(
    path.join(root, 'app', '(tabs)', 'navigate.tsx'),
    'utf8',
  );
  assert.ok(
    navigateSource.includes('useState(getExpeditionRuntimeSnapshot)') &&
      navigateSource.includes('setExpeditionRuntime(getExpeditionRuntimeSnapshot())') &&
      navigateSource.includes('expeditionRuntime.activeRecord'),
    'Navigate must read and subscribe to the canonical source-aware expedition runtime snapshot.',
  );
  assert.ok(
    !navigateSource.includes('useMemo(() => missionExpeditionStore.getActive(), [])'),
    'Navigate must not freeze a legacy expedition lookup for the lifetime of the mounted screen.',
  );

  console.log('[expedition-state-propagation] late consumer, coalesced tracking, diagnostics, and cleanup passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

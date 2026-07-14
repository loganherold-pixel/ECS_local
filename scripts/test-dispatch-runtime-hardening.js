const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { performance } = require('perf_hooks');
const ts = require('typescript');

global.__DEV__ = false;

const storage = new Map();
global.localStorage = {
  clear: () => storage.clear(),
  getItem: (key) => storage.get(key) ?? null,
  key: (index) => Array.from(storage.keys())[index] ?? null,
  removeItem: (key) => storage.delete(key),
  setItem: (key, value) => storage.set(key, String(value)),
  get length() {
    return storage.size;
  },
};

const originalLoad = Module._load;
Module._load = function loadWithReactNativeStub(request, parent, isMain) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
};

function load(relPath) {
  return require(path.join(process.cwd(), relPath));
}

function timestamp(index = 0) {
  return new Date(Date.UTC(2026, 6, 12, 12, 0, index)).toISOString();
}

function context(id = 'route-1') {
  return { id, type: 'route', title: `Route ${id}` };
}

function ping(overrides = {}) {
  return {
    id: 'ping-1',
    idempotencyKey: 'dispatch:ping:one',
    version: 1,
    type: 'check_in',
    priority: 'normal',
    status: 'queued',
    operationalState: 'awaiting_acknowledgment',
    message: 'Confirm status.',
    createdAt: timestamp(0),
    updatedAt: timestamp(0),
    createdByMemberId: 'lead-1',
    targetMemberIds: ['member-1'],
    linkedContext: context(),
    escalationState: 'none',
    requiresAcknowledgment: true,
    reliabilityState: 'queued',
    ...overrides,
  };
}

function timeline(index, overrides = {}) {
  return {
    id: `timeline-${index}`,
    idempotencyKey: `dispatch:timeline:${index}`,
    version: 1,
    type: 'log',
    title: `Timeline ${index}`,
    detail: `Detail ${index}`,
    occurredAt: timestamp(index % 60),
    priority: 'normal',
    memberIds: ['member-1'],
    deliveryState: 'local',
    escalationState: 'none',
    ...overrides,
  };
}

function defaults() {
  return {
    pings: [],
    queueItems: [],
    assignments: [],
    assistRequests: [],
    acknowledgments: [],
    timelineEvents: [],
    offlineActions: [],
    cadEvents: [],
  };
}

async function main() {
  const lifecycle = load('lib/dispatchLifecycle.ts');
  const integrity = load('lib/dispatchIntegrity.ts');
  const permissions = load('lib/dispatchPermissionAdapter.ts');
  const { dispatchPersistenceAdapter } = load('lib/dispatchPersistenceAdapter.ts');
  const { replayQueuedDispatchActions } = load('lib/dispatchOfflineReplayAdapter.ts');
  const { dispatchEventStore, DISPATCH_EVENT_STORE_LIMIT } = load('lib/dispatchEventStore.ts');

  assert.deepStrictEqual(
    lifecycle.transitionDispatchQueueItemStatus('new', 'assigned'),
    { ok: true, state: 'assigned' },
  );
  assert.strictEqual(
    lifecycle.transitionDispatchQueueItemStatus('resolved', 'in_progress').ok,
    false,
    'Resolved queue items must not reopen through an incidental update.',
  );
  assert.strictEqual(
    lifecycle.transitionDispatchOfflineActionStatus('replayed', 'queued').ok,
    false,
    'Replayed outbox actions must be terminal.',
  );
  assert.strictEqual(
    lifecycle.deriveDispatchPingOperationalState({
      deliveryState: 'queued',
      requiresAcknowledgment: true,
    }),
    'awaiting_acknowledgment',
  );

  const keyA = integrity.createDispatchIdempotencyKey({
    expeditionId: 'exp-1',
    entityType: 'ping',
    actionType: 'check-in',
    actorMemberId: 'lead-1',
    targetMemberIds: ['member-2', 'member-1'],
    message: 'Confirm status',
  });
  const keyB = integrity.createDispatchIdempotencyKey({
    expeditionId: 'exp-1',
    entityType: 'ping',
    actionType: 'check-in',
    actorMemberId: 'lead-1',
    targetMemberIds: ['member-1', 'member-2'],
    message: '  confirm   status ',
  });
  assert.strictEqual(keyA, keyB, 'Stable IDs must ignore target ordering and incidental whitespace.');

  const currentPing = ping({
    version: 3,
    status: 'escalated',
    operationalState: 'escalated',
    priority: 'critical',
    updatedAt: timestamp(20),
    escalationState: 'escalated',
  });
  const lateAcknowledgment = ping({
    version: 2,
    status: 'acknowledged',
    operationalState: 'acknowledged',
    updatedAt: timestamp(10),
    acknowledgedByMemberIds: ['member-1'],
  });
  const mergedLateAcknowledgment = integrity.mergeDispatchPing(currentPing ? [currentPing] : [], lateAcknowledgment)[0];
  assert.strictEqual(mergedLateAcknowledgment.status, 'escalated');
  assert.deepStrictEqual(mergedLateAcknowledgment.acknowledgedByMemberIds, ['member-1']);
  assert.ok(mergedLateAcknowledgment.conflictState, 'Late acknowledgment must remain visible as a sync conflict.');

  const outOfOrder = integrity.mergeDispatchPingBatch([
    ping({ version: 4, status: 'sent', updatedAt: timestamp(30) }),
    ping({ version: 2, status: 'queued', updatedAt: timestamp(5) }),
  ]);
  assert.strictEqual(outOfOrder.length, 1);
  assert.strictEqual(outOfOrder[0].version, 4, 'Older incoming state must not replace a newer record.');

  const teamDenied = permissions.resolveDispatchPermissions({
    activeExpeditionStatus: 'active',
    currentMember: null,
    soloMode: false,
    authenticated: false,
  });
  assert.strictEqual(teamDenied.can('send_team_wide_ping').allowed, false);
  const localSolo = permissions.resolveDispatchPermissions({
    activeExpeditionStatus: 'active',
    currentMember: null,
    soloMode: true,
    authenticated: false,
  });
  assert.strictEqual(localSolo.can('create_assist_request').allowed, true);
  assert.strictEqual(localSolo.can('view_member_location').allowed, false);
  assert.strictEqual(
    permissions.resolveCurrentDispatchMember([
      { id: 'owner-1', displayName: 'Lead', callSign: 'LEAD', role: 'owner', status: 'connected', lastSeenAt: timestamp(), syncState: 'sent' },
    ], 'unknown-user'),
    null,
    'Unknown users must not inherit the owner or first roster member.',
  );

  const migrationExpeditionId = 'migration-expedition';
  localStorage.setItem(`dispatch_state_${migrationExpeditionId}`, JSON.stringify({
    version: 1,
    expeditionId: migrationExpeditionId,
    pings: [ping()],
    queueItems: [],
    assignments: [],
    timelineEvents: Array.from({ length: 900 }, (_, index) => timeline(index)),
    cadEvents: [],
    updatedAt: timestamp(),
  }));
  const migrated = dispatchPersistenceAdapter.load(migrationExpeditionId, defaults());
  assert.strictEqual(migrated.version, 7);
  assert.strictEqual(migrated.timelineEvents.length, integrity.DISPATCH_RETENTION_LIMITS.timelineEvents);
  assert.strictEqual(migrated.offlineActions.length, 1, 'Queued legacy records must acquire one durable outbox action.');

  const replayExpeditionId = 'replay-success';
  dispatchPersistenceAdapter.upsertPing(replayExpeditionId, defaults(), ping());
  let publishCount = 0;
  const replayResult = await replayQueuedDispatchActions({
    expeditionId: replayExpeditionId,
    defaults: defaults(),
    publish: async () => {
      publishCount += 1;
      return true;
    },
    now: () => Date.parse(timestamp(40)),
  });
  assert.strictEqual(replayResult.attempted, 1);
  assert.strictEqual(replayResult.replayed, 1);
  assert.strictEqual(publishCount, 1);
  assert.strictEqual(replayResult.snapshot.pings[0].status, 'sent');
  assert.strictEqual(replayResult.snapshot.offlineActions[0].status, 'replayed');

  const failureExpeditionId = 'replay-failure';
  dispatchPersistenceAdapter.upsertPing(failureExpeditionId, defaults(), ping({ id: 'ping-failure', idempotencyKey: 'dispatch:ping:failure' }));
  let nowMs = Date.parse(timestamp(40));
  const failedReplay = await replayQueuedDispatchActions({
    expeditionId: failureExpeditionId,
    defaults: defaults(),
    publish: async () => false,
    now: () => nowMs,
  });
  assert.strictEqual(failedReplay.failed, 1);
  assert.strictEqual(failedReplay.snapshot.offlineActions[0].status, 'failed');
  const earlyRetry = await replayQueuedDispatchActions({
    expeditionId: failureExpeditionId,
    defaults: defaults(),
    publish: async () => true,
    now: () => nowMs,
  });
  assert.strictEqual(earlyRetry.attempted, 0, 'Backoff must prevent a tight replay loop.');
  nowMs += 10_000;
  const successfulRetry = await replayQueuedDispatchActions({
    expeditionId: failureExpeditionId,
    defaults: defaults(),
    publish: async () => true,
    now: () => nowMs,
  });
  assert.strictEqual(successfulRetry.replayed, 1);

  const manualRetryExpeditionId = 'manual-retry-convergence';
  const manualRetryPing = ping({ id: 'ping-manual-retry', idempotencyKey: 'dispatch:ping:manual-retry' });
  dispatchPersistenceAdapter.upsertPing(manualRetryExpeditionId, defaults(), manualRetryPing);
  dispatchPersistenceAdapter.upsertPing(manualRetryExpeditionId, defaults(), {
    ...manualRetryPing,
    version: 2,
    status: 'sent',
    reliabilityState: 'recovered',
    updatedAt: timestamp(45),
  });
  assert.strictEqual(
    dispatchPersistenceAdapter.load(manualRetryExpeditionId, defaults()).offlineActions[0].status,
    'replayed',
    'A successful manual retry must retire the matching outbox action.',
  );

  const singleFlightExpeditionId = 'replay-single-flight';
  dispatchPersistenceAdapter.upsertPing(singleFlightExpeditionId, defaults(), ping({ id: 'ping-flight', idempotencyKey: 'dispatch:ping:flight' }));
  let releasePublish;
  const publishGate = new Promise((resolve) => {
    releasePublish = resolve;
  });
  const replayInput = {
    expeditionId: singleFlightExpeditionId,
    defaults: defaults(),
    publish: async () => {
      await publishGate;
      return true;
    },
    now: () => Date.parse(timestamp(50)),
  };
  const firstFlight = replayQueuedDispatchActions(replayInput);
  const secondFlight = replayQueuedDispatchActions(replayInput);
  assert.strictEqual(firstFlight, secondFlight, 'Concurrent replay requests must share one flight.');
  releasePublish();
  await firstFlight;

  const cancelledCadExpeditionId = 'cad-cancelled-replay';
  const cadController = new AbortController();
  const queuedCadEvents = Array.from({ length: 3 }, (_, index) => ({
    id: `queued-cad-${index}`,
    type: 'team_ping',
    severity: 'watch',
    title: `Queued CAD ${index}`,
    message: 'Queued for team delivery.',
    source: 'team_member',
    createdAt: timestamp(index),
    syncState: 'queued',
  }));
  dispatchPersistenceAdapter.save({
    version: 2,
    expeditionId: cancelledCadExpeditionId,
    ...defaults(),
    cadEvents: queuedCadEvents,
    updatedAt: timestamp(),
  });
  const cancelledCadReplay = await replayQueuedDispatchActions({
    expeditionId: cancelledCadExpeditionId,
    defaults: defaults(),
    signal: cadController.signal,
    publish: async () => {
      cadController.abort();
      return true;
    },
  });
  assert.strictEqual(cancelledCadReplay.attempted, 1);
  assert.strictEqual(cancelledCadReplay.cancelled, 2);
  assert.strictEqual(cancelledCadReplay.snapshot.cadEvents.length, 3, 'Cancellation must not drop untouched CAD outbox records.');

  const highVolumeTimeline = Array.from({ length: 10_000 }, (_, index) => timeline(index, {
    occurredAt: new Date(Date.UTC(2026, 6, 12, 12, 0, 0) + index).toISOString(),
  }));
  const timelineStart = performance.now();
  const boundedTimeline = integrity.mergeDispatchTimelineEventBatch(highVolumeTimeline);
  const timelineMergeMs = performance.now() - timelineStart;
  assert.strictEqual(boundedTimeline.length, integrity.DISPATCH_RETENTION_LIMITS.timelineEvents);
  assert.ok(timelineMergeMs < 750, `10k timeline merge exceeded CI budget: ${timelineMergeMs.toFixed(2)}ms`);

  const persistenceExpeditionId = 'performance-expedition';
  const saveStart = performance.now();
  dispatchPersistenceAdapter.save({
    version: 2,
    expeditionId: persistenceExpeditionId,
    ...defaults(),
    timelineEvents: highVolumeTimeline,
    updatedAt: timestamp(),
  });
  const persistenceSaveMs = performance.now() - saveStart;
  const loadStart = performance.now();
  const boundedSnapshot = dispatchPersistenceAdapter.load(persistenceExpeditionId, defaults());
  const persistenceLoadMs = performance.now() - loadStart;
  assert.strictEqual(boundedSnapshot.timelineEvents.length, integrity.DISPATCH_RETENTION_LIMITS.timelineEvents);
  assert.ok(persistenceSaveMs < 1_000, `Bounded Dispatch save exceeded CI budget: ${persistenceSaveMs.toFixed(2)}ms`);
  assert.ok(persistenceLoadMs < 500, `Bounded Dispatch load exceeded CI budget: ${persistenceLoadMs.toFixed(2)}ms`);

  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  dispatchEventStore.clear();
  const highVolumeEvents = Array.from({ length: 5_000 }, (_, index) => ({
    id: `cad-${index}`,
    timestamp: new Date(Date.UTC(2026, 6, 12, 12, 0, 0) + index).toISOString(),
    type: 'team_ping',
    severity: 'watch',
    title: `CAD ${index}`,
    message: `Unique CAD event ${index}`,
    source: 'team_member',
    dedupeKey: `cad:${index}`,
  }));
  const cadStart = performance.now();
  dispatchEventStore.replaceEvents(highVolumeEvents);
  const cadMergeMs = performance.now() - cadStart;
  console.log = originalLog;
  console.warn = originalWarn;
  assert.strictEqual(dispatchEventStore.getSnapshot().length, DISPATCH_EVENT_STORE_LIMIT);
  assert.ok(cadMergeMs < 2_000, `5k CAD merge exceeded CI budget: ${cadMergeMs.toFixed(2)}ms`);
  dispatchEventStore.clear();

  const cadSource = fs.readFileSync(
    path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx'),
    'utf8',
  );
  const commandCenterSource = fs.readFileSync(
    path.join(process.cwd(), 'components/dispatch/DispatchCommandCenter.tsx'),
    'utf8',
  );
  const permissionIndex = cadSource.indexOf('const permission = dispatchPermissionSnapshot.can(getEventActionPermission(actionId));');
  const mutationIndex = cadSource.indexOf('submittedEventActionKeysRef.current.add(actionKey);', permissionIndex);
  assert.ok(permissionIndex >= 0 && mutationIndex > permissionIndex, 'CAD actions must authorize before mutating dedupe or UI state.');
  assert.ok(cadSource.includes('ECS team coordination only. This does not contact emergency services.'));
  assert.ok(cadSource.includes("automatedSosTransmissionEnabled"));
  assert.ok(commandCenterSource.includes("activeExpedition.source === 'local'"));
  assert.ok(commandCenterSource.includes("? 'local'"));
  assert.ok(!/const reportDenied[\s\S]{0,500}dispatchPersistenceAdapter\./.test(commandCenterSource));

  const result = {
    schemaVersion: 1,
    suite: 'dispatch-runtime-hardening',
    status: 'passed',
    retention: {
      timelineEvents: integrity.DISPATCH_RETENTION_LIMITS.timelineEvents,
      cadEvents: DISPATCH_EVENT_STORE_LIMIT,
    },
    performance: {
      timelineMerge10kMs: Number(timelineMergeMs.toFixed(3)),
      boundedPersistenceSave10kMs: Number(persistenceSaveMs.toFixed(3)),
      boundedPersistenceLoadMs: Number(persistenceLoadMs.toFixed(3)),
      cadMerge5kMs: Number(cadMergeMs.toFixed(3)),
    },
  };
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
});

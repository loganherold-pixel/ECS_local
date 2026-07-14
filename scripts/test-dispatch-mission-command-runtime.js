const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const { performance } = require('perf_hooks');

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
Module._load = function loadWithRuntimeStubs(request, parent, isMain) {
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

const CREATED_AT = '2026-07-14T12:00:00.000Z';

function sourceTruth(id = 'runtime-source') {
  return {
    id,
    origin: 'manual',
    role: 'primary',
    policyKey: 'manual_user_state',
    authority: 'ECS member input',
    authorityKind: 'user',
    observedAt: CREATED_AT,
    confidence: 'high',
    coverage: 'complete',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: [],
  };
}

function command(overrides = {}) {
  return {
    schemaVersion: 1,
    version: 1,
    id: 'mission-command-runtime-1',
    expeditionId: 'expedition-runtime-1',
    creator: { id: 'lead-1', label: 'Lead', role: 'owner' },
    type: 'check_in',
    priority: 'normal',
    title: 'Confirm team status',
    instructions: 'Confirm status at the next safe stop.',
    target: { kind: 'team', memberIds: ['member-1', 'member-2'], label: 'Expedition team' },
    acknowledgmentPolicy: { mode: 'all', targetMemberIds: ['member-1', 'member-2'] },
    deadlineAt: '2026-07-14T13:00:00.000Z',
    sourceTruth: [sourceTruth()],
    operationalState: 'active',
    deliveryState: 'queued',
    acknowledgmentState: 'pending',
    acknowledgments: [],
    idempotencyKey: 'dispatch:mission_command:runtime-one',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    audit: {
      schemaVersion: 1,
      sourceKind: 'native',
      safetyScope: 'ecs_team_coordination_only',
    },
    ...overrides,
  };
}

function eventFor(value, overrides = {}) {
  return {
    schemaVersion: 1,
    id: `mission-command-event-${value.id}`,
    idempotencyKey: `dispatch:mission_command_event:${value.id}`,
    commandId: value.id,
    expeditionId: value.expeditionId,
    type: 'created',
    actor: value.creator,
    occurredAt: value.createdAt,
    summary: 'Command created.',
    operationalState: value.operationalState,
    deliveryState: value.deliveryState,
    acknowledgmentState: value.acknowledgmentState,
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
    missionCommands: [],
    missionCommandEvents: [],
    guardianCheckIns: [],
    operationalPlaybooks: [],
  };
}

async function main() {
  const domain = load('lib/dispatchMissionCommandDomain.ts');
  const integrity = load('lib/dispatchIntegrity.ts');
  const { dispatchPersistenceAdapter } = load('lib/dispatchPersistenceAdapter.ts');
  const replay = load('lib/dispatchOfflineReplayAdapter.ts');
  const runtime = load('lib/dispatchMissionCommandRuntime.ts');
  const runtimeHook = load('lib/useDispatchMissionCommandRuntime.ts');

  const localCommand = command();
  const localEvent = eventFor(localCommand);
  let snapshot = dispatchPersistenceAdapter.applyMissionCommandMutation(
    localCommand.expeditionId,
    defaults(),
    localCommand,
    localEvent,
  );
  const missionActions = snapshot.offlineActions.filter((item) => (
    item.entityType === 'mission_command' || item.entityType === 'mission_command_event'
  ));
  assert.strictEqual(missionActions.length, 2, 'A team command and its event must be queued exactly once.');
  const commandAction = missionActions.find((item) => item.entityType === 'mission_command');
  const eventAction = missionActions.find((item) => item.entityType === 'mission_command_event');
  assert.ok(commandAction?.id);
  assert.deepStrictEqual(
    eventAction?.dependsOnOperationIds,
    [commandAction.id],
    'The event operation must wait for the command aggregate.',
  );

  snapshot = dispatchPersistenceAdapter.applyMissionCommandMutation(
    localCommand.expeditionId,
    defaults(),
    localCommand,
    localEvent,
  );
  assert.strictEqual(
    snapshot.offlineActions.filter((item) => item.entityType.startsWith('mission_command')).length,
    2,
    'Repeated taps must not duplicate outbox operations.',
  );
  assert.strictEqual(snapshot.version, runtime.MISSION_COMMAND_RUNTIME_SCHEMA_VERSION);

  const published = [];
  let replayResult = await replay.replayQueuedDispatchActions({
    expeditionId: localCommand.expeditionId,
    defaults: defaults(),
    publish: async (draft) => {
      published.push(draft.type);
      return { ok: true };
    },
    entityTypes: ['mission_command', 'mission_command_event'],
    now: () => Date.parse('2026-07-14T12:10:00.000Z'),
  });
  assert.deepStrictEqual(published, ['mission_command_upsert', 'mission_command_event_added']);
  assert.strictEqual(replayResult.replayed, 2);
  replayResult = await replay.replayQueuedDispatchActions({
    expeditionId: localCommand.expeditionId,
    defaults: defaults(),
    publish: async (draft) => {
      published.push(draft.type);
      return { ok: true };
    },
    entityTypes: ['mission_command', 'mission_command_event'],
  });
  assert.strictEqual(replayResult.attempted, 0, 'A replayed operation must never publish twice.');

  const collapsedExpeditionId = 'expedition-runtime-collapsed';
  const collapsedInitial = command({
    id: 'mission-command-collapsed',
    expeditionId: collapsedExpeditionId,
    idempotencyKey: 'dispatch:mission_command:collapsed',
  });
  const collapsedInitialEvent = eventFor(collapsedInitial, {
    id: 'mission-command-event-collapsed-created',
    idempotencyKey: 'dispatch:mission_command_event:collapsed-created',
  });
  dispatchPersistenceAdapter.applyMissionCommandMutation(
    collapsedExpeditionId,
    defaults(),
    collapsedInitial,
    collapsedInitialEvent,
  );
  const collapsedLatest = {
    ...collapsedInitial,
    version: collapsedInitial.version + 1,
    operationalState: 'blocked',
    updatedAt: '2026-07-14T12:02:00.000Z',
  };
  const collapsedLatestEvent = eventFor(collapsedLatest, {
    id: 'mission-command-event-collapsed-blocked',
    idempotencyKey: 'dispatch:mission_command_event:collapsed-blocked',
    type: 'blocked',
    occurredAt: collapsedLatest.updatedAt,
    summary: 'Command blocked.',
  });
  snapshot = dispatchPersistenceAdapter.applyMissionCommandMutation(
    collapsedExpeditionId,
    defaults(),
    collapsedLatest,
    collapsedLatestEvent,
  );
  const activeCollapsedCommandActions = snapshot.offlineActions.filter((item) => (
    item.entityType === 'mission_command' &&
    item.sourceEntityId === collapsedLatest.id &&
    item.status !== 'replayed' &&
    item.status !== 'cancelled'
  ));
  assert.strictEqual(
    activeCollapsedCommandActions.length,
    1,
    'Offline command mutations must collapse to one latest aggregate operation.',
  );
  const collapsedEventActions = snapshot.offlineActions.filter((item) => (
    item.entityType === 'mission_command_event' && item.status === 'queued'
  ));
  assert.strictEqual(collapsedEventActions.length, 2, 'Append-only events must not be collapsed.');
  collapsedEventActions.forEach((item) => assert.deepStrictEqual(
    item.dependsOnOperationIds,
    [activeCollapsedCommandActions[0].id],
    'Every pending event must wait for the latest aggregate operation.',
  ));
  const collapsedPublished = [];
  replayResult = await replay.replayQueuedDispatchActions({
    expeditionId: collapsedExpeditionId,
    defaults: defaults(),
    publish: async (draft) => {
      collapsedPublished.push(draft.type);
      return { ok: true };
    },
    entityTypes: ['mission_command', 'mission_command_event'],
    now: () => Date.parse('2026-07-14T12:10:00.000Z'),
  });
  assert.strictEqual(
    collapsedPublished.filter((type) => type === 'mission_command_upsert').length,
    1,
    'Only the latest offline aggregate may be published.',
  );
  assert.strictEqual(
    collapsedPublished.filter((type) => type === 'mission_command_event_added').length,
    2,
    'All append-only events must replay after their aggregate dependency.',
  );
  assert.strictEqual(replayResult.deferred, 0);

  const concurrentExpeditionId = 'expedition-runtime-concurrent';
  const concurrentInitial = command({
    id: 'mission-command-concurrent',
    expeditionId: concurrentExpeditionId,
    idempotencyKey: 'dispatch:mission_command:concurrent',
  });
  dispatchPersistenceAdapter.applyMissionCommandMutation(
    concurrentExpeditionId,
    defaults(),
    concurrentInitial,
    eventFor(concurrentInitial, {
      id: 'mission-command-event-concurrent-created',
      idempotencyKey: 'dispatch:mission_command_event:concurrent-created',
    }),
  );
  let concurrentMutationApplied = false;
  let concurrentNow = Date.parse('2026-07-14T14:00:00.000Z');
  const concurrentPublished = [];
  replayResult = await replay.replayQueuedDispatchActions({
    expeditionId: concurrentExpeditionId,
    defaults: defaults(),
    publish: async (draft) => {
      concurrentPublished.push(draft.type);
      if (!concurrentMutationApplied && draft.type === 'mission_command_upsert') {
        concurrentMutationApplied = true;
        const blockedAt = '2026-07-14T14:00:01.000Z';
        const concurrentBlocked = {
          ...concurrentInitial,
          version: concurrentInitial.version + 1,
          operationalState: 'blocked',
          deliveryState: 'queued',
          updatedAt: blockedAt,
        };
        dispatchPersistenceAdapter.applyMissionCommandMutation(
          concurrentExpeditionId,
          defaults(),
          concurrentBlocked,
          eventFor(concurrentBlocked, {
            id: 'mission-command-event-concurrent-blocked',
            idempotencyKey: 'dispatch:mission_command_event:concurrent-blocked',
            type: 'blocked',
            occurredAt: blockedAt,
            summary: 'Command blocked while replay was active.',
          }),
        );
        concurrentNow = Date.parse('2026-07-14T14:00:02.000Z');
      }
      return { ok: true };
    },
    entityTypes: ['mission_command', 'mission_command_event'],
    now: () => concurrentNow,
  });
  const concurrentAfterFirstReplay = dispatchPersistenceAdapter.load(concurrentExpeditionId, defaults());
  assert.strictEqual(
    concurrentAfterFirstReplay.missionCommands[0].operationalState,
    'blocked',
    'An in-flight transport result must not overwrite a concurrent local command mutation.',
  );
  assert.strictEqual(
    concurrentAfterFirstReplay.missionCommands[0].deliveryState,
    'queued',
    'A newer unsent command version must remain queued after the older version sends.',
  );
  assert.strictEqual(
    concurrentPublished.filter((type) => type === 'mission_command_event_added').length,
    0,
    'Events whose dependency changed during replay must remain deferred.',
  );
  assert.ok(replayResult.deferred > 0);
  concurrentNow = Date.parse('2026-07-14T14:01:00.000Z');
  await replay.replayQueuedDispatchActions({
    expeditionId: concurrentExpeditionId,
    defaults: defaults(),
    publish: async (draft) => {
      concurrentPublished.push(draft.type);
      return { ok: true };
    },
    entityTypes: ['mission_command', 'mission_command_event'],
    now: () => concurrentNow,
  });
  assert.strictEqual(
    concurrentPublished.filter((type) => type === 'mission_command_upsert').length,
    2,
    'The concurrent command version must publish once on the next replay.',
  );
  assert.strictEqual(
    concurrentPublished.filter((type) => type === 'mission_command_event_added').length,
    2,
    'Both append-only events must publish after the replacement aggregate.',
  );

  const current = command({
    version: 8,
    operationalState: 'in_progress',
    deliveryState: 'delivered',
    updatedAt: '2026-07-14T12:20:00.000Z',
    assignment: {
      id: 'assignment-current',
      target: { kind: 'member', memberId: 'member-1' },
      status: 'in_progress',
      assignedAt: '2026-07-14T12:05:00.000Z',
      updatedAt: '2026-07-14T12:18:00.000Z',
    },
  });
  const lateAcknowledgment = command({
    version: 4,
    updatedAt: '2026-07-14T12:12:00.000Z',
    acknowledgments: [{
      id: 'ack-member-2',
      idempotencyKey: 'ack:member-2',
      memberId: 'member-2',
      response: 'acknowledged',
      respondedAt: '2026-07-14T12:12:00.000Z',
    }],
    acknowledgmentState: 'partial',
  });
  const reconciled = domain.mergeMissionCommand([current], lateAcknowledgment)[0];
  assert.strictEqual(reconciled.operationalState, 'in_progress', 'A stale core update must not rewind work.');
  assert.strictEqual(reconciled.deliveryState, 'delivered', 'Delivery must not regress.');
  assert.strictEqual(reconciled.acknowledgments.length, 1, 'A valid late acknowledgment must survive.');
  const newerAckAgainstSent = domain.mergeMissionCommand([
    current,
  ], lateAcknowledgment.version > current.version
    ? lateAcknowledgment
    : {
        ...lateAcknowledgment,
        version: current.version + 1,
        updatedAt: '2026-07-14T12:23:00.000Z',
      })[0];
  assert.strictEqual(
    newerAckAgainstSent.deliveryState,
    'delivered',
    'An acknowledgment update must not rewind an already delivered command.',
  );
  const noOperationalRewind = domain.mergeMissionCommand([
    current,
  ], command({
    version: current.version + 1,
    operationalState: 'active',
    deliveryState: 'delivered',
    updatedAt: '2026-07-14T12:24:00.000Z',
  }))[0];
  assert.strictEqual(noOperationalRewind.operationalState, 'in_progress');
  const deliveredConflict = command({ deliveryState: 'delivered', version: 5 });
  const cancelledDeliveryConflict = command({
    deliveryState: 'cancelled',
    version: 6,
    updatedAt: '2026-07-14T12:24:30.000Z',
  });
  assert.strictEqual(
    domain.mergeMissionCommand([deliveredConflict], cancelledDeliveryConflict)[0].deliveryState,
    domain.mergeMissionCommand([cancelledDeliveryConflict], deliveredConflict)[0].deliveryState,
  );
  assert.strictEqual(
    domain.mergeMissionCommand([cancelledDeliveryConflict], deliveredConflict)[0].deliveryState,
    'delivered',
    'A confirmed receipt must not be erased by a concurrent delivery cancellation.',
  );

  const assignmentA = command({
    version: 6,
    updatedAt: '2026-07-14T12:22:00.000Z',
    assignment: {
      id: 'assignment-a',
      target: { kind: 'member', memberId: 'member-1' },
      assigneeMemberId: 'member-1',
      status: 'offered',
      assignedAt: '2026-07-14T12:21:00.000Z',
      updatedAt: '2026-07-14T12:22:00.000Z',
    },
  });
  const assignmentB = command({
    version: 6,
    updatedAt: '2026-07-14T12:22:00.000Z',
    assignment: {
      id: 'assignment-b',
      target: { kind: 'member', memberId: 'member-2' },
      assigneeMemberId: 'member-2',
      status: 'offered',
      assignedAt: '2026-07-14T12:21:00.000Z',
      updatedAt: '2026-07-14T12:22:00.000Z',
    },
  });
  assert.strictEqual(
    domain.mergeMissionCommand([assignmentA], assignmentB)[0].assignment.id,
    domain.mergeMissionCommand([assignmentB], assignmentA)[0].assignment.id,
    'Simultaneous assignment merges must converge regardless of arrival order.',
  );

  const resolved = command({
    version: 10,
    operationalState: 'resolved',
    updatedAt: '2026-07-14T12:25:00.000Z',
    resolution: {
      kind: 'resolved',
      summary: 'Resolved safely.',
      occurredAt: '2026-07-14T12:25:00.000Z',
      actorId: 'lead-1',
    },
  });
  assert.strictEqual(
    domain.mergeMissionCommand([resolved], command({ version: 11, updatedAt: '2026-07-14T12:26:00.000Z' }))[0].operationalState,
    'resolved',
    'Terminal state must not reopen through realtime ordering.',
  );
  const cancelledConflict = command({
    version: 10,
    operationalState: 'cancelled',
    updatedAt: '2026-07-14T12:25:30.000Z',
    resolution: {
      kind: 'cancelled',
      summary: 'Cancelled by operator.',
      occurredAt: '2026-07-14T12:24:00.000Z',
      actorId: 'lead-2',
    },
  });
  const resolutionAB = domain.mergeMissionCommand([resolved], cancelledConflict)[0];
  const resolutionBA = domain.mergeMissionCommand([cancelledConflict], resolved)[0];
  assert.strictEqual(resolutionAB.resolution.kind, resolutionBA.resolution.kind);
  assert.strictEqual(resolutionAB.resolution.kind, 'cancelled', 'The earliest accepted terminal decision wins deterministically.');

  const solo = command({
    id: 'mission-command-solo-runtime',
    idempotencyKey: 'dispatch:mission_command:solo-runtime',
    target: { kind: 'solo', memberId: 'lead-1' },
    deliveryState: 'local',
  });
  const soloSnapshot = dispatchPersistenceAdapter.applyMissionCommandMutation(
    solo.expeditionId,
    defaults(),
    solo,
    eventFor(solo, { id: 'mission-command-event-solo-runtime' }),
  );
  assert.strictEqual(
    soloSnapshot.offlineActions.some((item) => item.sourceEntityId === solo.id),
    false,
    'Solo reminders must remain local and must not fabricate delivery.',
  );

  const migrationExpedition = 'expedition-runtime-v5';
  const legacyLocalTeamCommand = command({
    expeditionId: migrationExpedition,
    id: 'mission-command-v5',
    idempotencyKey: 'dispatch:mission_command:v5',
    deliveryState: 'local',
  });
  const partiallyCorruptAction = {
    ...integrity.createDispatchOfflineAction({
      expeditionId: migrationExpedition,
      entityType: 'mission_command',
      sourceEntityId: legacyLocalTeamCommand.id,
      sourceIdempotencyKey: legacyLocalTeamCommand.idempotencyKey,
      createdAt: CREATED_AT,
    }),
    version: -4,
    attemptCount: 'invalid',
    maxAttempts: 'invalid',
    dependsOnOperationIds: { malformed: true },
  };
  storage.set(`dispatch_state_${migrationExpedition}`, JSON.stringify({
    version: 5,
    expeditionId: migrationExpedition,
    missionCommands: [legacyLocalTeamCommand, null],
    missionCommandEvents: [],
    offlineActions: [partiallyCorruptAction, null],
    updatedAt: CREATED_AT,
  }));
  const migrated = dispatchPersistenceAdapter.loadResult(migrationExpedition, defaults());
  assert.strictEqual(migrated.status, 'recovered', 'Partial corruption must be reported without losing valid records.');
  assert.strictEqual(migrated.snapshot.version, runtime.MISSION_COMMAND_RUNTIME_SCHEMA_VERSION);
  assert.strictEqual(migrated.snapshot.missionCommands.length, 1);
  assert.strictEqual(migrated.snapshot.missionCommands[0].deliveryState, 'queued');
  const recoveredAction = migrated.snapshot.offlineActions.find((item) => (
    item.id === partiallyCorruptAction.id
  ));
  assert.ok(recoveredAction, 'A malformed optional field must not discard an otherwise valid outbox record.');
  assert.strictEqual(recoveredAction.version, 1);
  assert.strictEqual(recoveredAction.attemptCount, 0);
  assert.strictEqual(recoveredAction.maxAttempts, 5);
  assert.deepStrictEqual(recoveredAction.dependsOnOperationIds, []);
  assert.ok(
    migrated.snapshot.offlineActions.some((item) => item.entityType === 'mission_command'),
    'Version 5 team-local commands must migrate to the durable outbox.',
  );

  const currentCorruptExpedition = 'expedition-runtime-v7-corrupt-outbox';
  const currentQueuedCommand = command({
    expeditionId: currentCorruptExpedition,
    id: 'mission-command-v7-corrupt-outbox',
    idempotencyKey: 'dispatch:mission_command:v7-corrupt-outbox',
    deliveryState: 'queued',
  });
  storage.set(`dispatch_state_${currentCorruptExpedition}`, JSON.stringify({
    version: runtime.MISSION_COMMAND_RUNTIME_SCHEMA_VERSION,
    expeditionId: currentCorruptExpedition,
    missionCommands: [currentQueuedCommand],
    missionCommandEvents: [],
    offlineActions: [null],
    updatedAt: CREATED_AT,
  }));
  const currentRecovered = dispatchPersistenceAdapter.loadResult(
    currentCorruptExpedition,
    defaults(),
  );
  assert.strictEqual(currentRecovered.status, 'recovered');
  assert.ok(
    currentRecovered.snapshot.offlineActions.some((item) => (
      item.entityType === 'mission_command'
      && item.sourceEntityId === currentQueuedCommand.id
    )),
    'Current-schema outbox corruption must conservatively rebuild a queued Mission write.',
  );

  const boundedCommands = domain.mergeMissionCommandBatch(Array.from({ length: 270 }, (_, index) => {
    const timestamp = new Date(Date.parse(CREATED_AT) + index * 1000).toISOString();
    return command({
      id: `mission-command-bound-${index}`,
      idempotencyKey: `dispatch:mission_command:bound-${index}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }));
  assert.strictEqual(boundedCommands.length, 250, 'Mission Command retention must remain bounded.');
  const boundedEvents = domain.mergeMissionCommandEventBatch(Array.from({ length: 800 }, (_, index) => {
    const item = command({
      id: `mission-command-event-source-${index}`,
      idempotencyKey: `dispatch:mission_command:event-source-${index}`,
    });
    return eventFor(item, {
      id: `mission-event-bound-${index}`,
      idempotencyKey: `dispatch:mission_event:bound-${index}`,
      occurredAt: new Date(Date.parse(CREATED_AT) + index * 1000).toISOString(),
    });
  }));
  assert.strictEqual(boundedEvents.length, 750, 'Mission event retention must remain bounded.');
  const boundedRetainedBytes = Buffer.byteLength(JSON.stringify({
    commands: boundedCommands,
    events: boundedEvents,
  }));
  const boundedActions = integrity.mergeDispatchOfflineActionBatch(Array.from({ length: 310 }, (_, index) => (
    integrity.createDispatchOfflineAction({
      expeditionId: 'expedition-bound-actions',
      entityType: 'mission_command',
      actionType: `upsert:mission_command:v${index}`,
      sourceEntityId: `mission-command-bound-action-${index}`,
      sourceIdempotencyKey: `dispatch:mission_command:bound-action-${index}`,
      createdAt: new Date(Date.parse(CREATED_AT) + index * 1000).toISOString(),
    })
  )));
  assert.strictEqual(boundedActions.length, 300, 'Outbox and retry history must remain bounded.');
  const terminalAction = integrity.createDispatchOfflineAction({
    expeditionId: 'expedition-terminal-action',
    entityType: 'mission_command',
    sourceEntityId: 'mission-command-terminal-action',
    createdAt: CREATED_AT,
  });
  const replayedAction = {
    ...terminalAction,
    version: 3,
    status: 'replayed',
    replayedAt: '2026-07-14T12:30:00.000Z',
    updatedAt: '2026-07-14T12:30:00.000Z',
  };
  const staleFailedAction = {
    ...terminalAction,
    version: 4,
    status: 'failed',
    attemptCount: 4,
    updatedAt: '2026-07-14T12:31:00.000Z',
  };
  assert.strictEqual(
    integrity.mergeDispatchOfflineAction([replayedAction], staleFailedAction)[0].status,
    integrity.mergeDispatchOfflineAction([staleFailedAction], replayedAction)[0].status,
  );
  assert.strictEqual(
    integrity.mergeDispatchOfflineAction([staleFailedAction], replayedAction)[0].status,
    'replayed',
    'Out-of-order failures must not reopen a replayed operation.',
  );

  let appStateListener = null;
  let appStateRemoveCount = 0;
  let foregroundCount = 0;
  let backgroundCount = 0;
  const releaseAppState = runtimeHook.bindDispatchMissionCommandAppLifecycle({
    appState: {
      addEventListener: (_type, listener) => {
        appStateListener = listener;
        return { remove: () => { appStateRemoveCount += 1; } };
      },
    },
    onForeground: () => { foregroundCount += 1; },
    onBackground: () => { backgroundCount += 1; },
  });
  appStateListener('background');
  appStateListener('active');
  assert.strictEqual(backgroundCount, 1, 'Background transitions must flush through one lifecycle binding.');
  assert.strictEqual(foregroundCount, 1, 'Foreground transitions must restore through one lifecycle binding.');
  releaseAppState();
  appStateListener('active');
  assert.strictEqual(appStateRemoveCount, 1, 'Lifecycle cleanup must remove its AppState listener exactly once.');
  assert.strictEqual(foregroundCount, 1, 'Released lifecycle bindings must ignore late callbacks.');

  const emptyAllowlistCoordinator = runtime.createDispatchMissionCommandRuntimeCoordinator();
  emptyAllowlistCoordinator.activate({
    accountId: 'account-without-membership',
    expeditionId: localCommand.expeditionId,
    defaults: defaults(),
    authorizedActorIds: [],
  });
  assert.strictEqual(emptyAllowlistCoordinator.applyIncoming({
    id: 'realtime-empty-allowlist',
    expeditionId: localCommand.expeditionId,
    originClientId: 'client-b',
    occurredAt: '2026-07-14T12:18:00.000Z',
    type: 'mission_command_upsert',
    missionCommand: command({ version: 7 }),
  }).safeCode, 'mission_runtime_permission_denied', 'An empty actor allowlist must fail closed.');
  emptyAllowlistCoordinator.deactivate();

  const coordinator = runtime.createDispatchMissionCommandRuntimeCoordinator();
  coordinator.activate({
    accountId: 'account-a',
    expeditionId: localCommand.expeditionId,
    defaults: defaults(),
    clientId: 'client-a',
    authorizedActorIds: ['lead-1'],
  });
  const coldHydration = coordinator.hydrate();
  const warmHydration = coordinator.hydrate();
  assert.strictEqual(coldHydration, warmHydration, 'Hydration must be single-flight.');
  await coldHydration;
  coordinator.setRealtimeStatus('connected', 1);
  const diagnostics = coordinator.getDiagnostics();
  assert.strictEqual(diagnostics.schemaVersion, runtime.MISSION_COMMAND_RUNTIME_SCHEMA_VERSION);
  assert.strictEqual(diagnostics.subscriptionCount, 1);
  assert.ok(!JSON.stringify(diagnostics).includes('account-a'), 'Diagnostics must not expose account identity.');
  assert.ok(!JSON.stringify(diagnostics).includes(localCommand.expeditionId), 'Diagnostics must not expose expedition identity.');

  const ownEcho = coordinator.applyIncoming({
    id: 'realtime-own-echo',
    expeditionId: localCommand.expeditionId,
    originClientId: 'client-a',
    occurredAt: '2026-07-14T12:19:00.000Z',
    type: 'mission_command_upsert',
    missionCommand: localCommand,
  });
  assert.strictEqual(ownEcho.safeCode, 'mission_runtime_own_echo');
  const unauthorizedIncoming = coordinator.applyIncoming({
    id: 'realtime-unauthorized',
    expeditionId: localCommand.expeditionId,
    originClientId: 'client-c',
    occurredAt: '2026-07-14T12:19:30.000Z',
    type: 'mission_command_upsert',
    missionCommand: command({ creator: { id: 'intruder', label: 'Unknown' } }),
  });
  assert.strictEqual(unauthorizedIncoming.safeCode, 'mission_runtime_permission_denied');

  const runtimeIncomingCommand = command({
    version: 8,
    operationalState: 'in_progress',
    deliveryState: 'sent',
    updatedAt: '2026-07-14T12:20:00.000Z',
  });
  const firstIncoming = coordinator.applyIncoming({
    id: 'realtime-runtime-command-v8',
    expeditionId: localCommand.expeditionId,
    originClientId: 'client-b',
    occurredAt: '2026-07-14T12:20:00.000Z',
    type: 'mission_command_upsert',
    missionCommand: runtimeIncomingCommand,
  });
  assert.strictEqual(firstIncoming.applied, true);
  const duplicateIncoming = coordinator.applyIncoming({
    id: 'realtime-runtime-command-v8-duplicate',
    expeditionId: localCommand.expeditionId,
    originClientId: 'client-b',
    occurredAt: '2026-07-14T12:20:01.000Z',
    type: 'mission_command_upsert',
    missionCommand: runtimeIncomingCommand,
  });
  assert.strictEqual(duplicateIncoming.applied, false, 'Duplicate realtime aggregates must be ignored.');
  const lateAckIncoming = coordinator.applyIncoming({
    id: 'realtime-runtime-late-ack',
    expeditionId: localCommand.expeditionId,
    originClientId: 'client-b',
    occurredAt: '2026-07-14T12:21:00.000Z',
    type: 'mission_command_upsert',
    missionCommand: lateAcknowledgment,
  });
  assert.strictEqual(lateAckIncoming.applied, true, 'A stale aggregate containing a new acknowledgment must merge.');
  assert.strictEqual(
    dispatchPersistenceAdapter.load(localCommand.expeditionId, defaults()).missionCommands[0].acknowledgments.length,
    1,
  );

  const incomingEvent = eventFor(runtimeIncomingCommand, {
    id: 'mission-command-event-realtime-runtime',
    idempotencyKey: 'dispatch:mission-command-event:realtime-runtime',
  });
  assert.strictEqual(coordinator.applyIncoming({
    id: 'realtime-runtime-event',
    expeditionId: localCommand.expeditionId,
    originClientId: 'client-b',
    occurredAt: incomingEvent.occurredAt,
    type: 'mission_command_event_added',
    missionCommandEvent: incomingEvent,
  }).applied, true);
  assert.strictEqual(coordinator.applyIncoming({
    id: 'realtime-runtime-event-duplicate',
    expeditionId: localCommand.expeditionId,
    originClientId: 'client-b',
    occurredAt: incomingEvent.occurredAt,
    type: 'mission_command_event_added',
    missionCommandEvent: incomingEvent,
  }).applied, false, 'Duplicate realtime events must remain append-once.');

  let diagnosticNotifications = 0;
  const releaseDiagnostics = coordinator.subscribe(() => {
    diagnosticNotifications += 1;
  });
  coordinator.setRealtimeStatus('error', 0);
  assert.ok(diagnosticNotifications > 0);
  releaseDiagnostics();
  const notificationCountAfterRelease = diagnosticNotifications;
  coordinator.setRealtimeStatus('connected', 1);
  assert.strictEqual(
    diagnosticNotifications,
    notificationCountAfterRelease,
    'Released runtime subscriptions must not receive updates.',
  );

  coordinator.activate({
    accountId: 'account-b',
    expeditionId: 'expedition-runtime-2',
    defaults: defaults(),
  });
  assert.strictEqual(
    coordinator.getDiagnostics().subscriptionCount,
    0,
    'Account or expedition replacement must clear the previous realtime subscription state.',
  );
  const staleIncoming = coordinator.applyIncoming({
    id: 'realtime-old-expedition',
    expeditionId: localCommand.expeditionId,
    originClientId: 'client-b',
    occurredAt: '2026-07-14T12:30:00.000Z',
    type: 'mission_command_upsert',
    missionCommand: localCommand,
  });
  assert.strictEqual(staleIncoming.applied, false, 'Old expedition events must be rejected after a switch.');
  assert.strictEqual(staleIncoming.safeCode, 'mission_runtime_expedition_mismatch');

  coordinator.deactivate();
  assert.strictEqual(coordinator.getDiagnostics().subscriptionCount, 0, 'Logout/unmount must clear runtime subscription state.');
  assert.strictEqual(coordinator.applyIncoming({
    id: 'realtime-after-logout',
    expeditionId: 'expedition-runtime-2',
    originClientId: 'client-b',
    occurredAt: '2026-07-14T12:31:00.000Z',
    type: 'mission_command_upsert',
    missionCommand: command({ expeditionId: 'expedition-runtime-2' }),
  }).safeCode, 'mission_runtime_inactive');

  const mergePerformanceExpedition = 'expedition-runtime-merge-performance';
  const performanceCoordinator = runtime.createDispatchMissionCommandRuntimeCoordinator();
  performanceCoordinator.activate({
    accountId: 'performance-account',
    expeditionId: mergePerformanceExpedition,
    defaults: defaults(),
    clientId: 'performance-client-a',
    authorizedActorIds: ['lead-1'],
  });
  const mergeWarmup = command({
    id: 'mission-command-merge-warmup',
    expeditionId: mergePerformanceExpedition,
    idempotencyKey: 'dispatch:mission_command:merge-warmup',
  });
  assert.strictEqual(performanceCoordinator.applyIncoming({
    id: 'realtime-merge-warmup',
    expeditionId: mergePerformanceExpedition,
    originClientId: 'performance-client-b',
    occurredAt: mergeWarmup.updatedAt,
    type: 'mission_command_upsert',
    missionCommand: mergeWarmup,
  }).applied, true);
  const realtimeMergeStartedAt = performance.now();
  for (let index = 0; index < 100; index += 1) {
    const incoming = command({
      id: `mission-command-merge-${index}`,
      expeditionId: mergePerformanceExpedition,
      idempotencyKey: `dispatch:mission_command:merge-${index}`,
      updatedAt: new Date(Date.parse(CREATED_AT) + index * 1000).toISOString(),
    });
    const result = performanceCoordinator.applyIncoming({
      id: `realtime-merge-${index}`,
      expeditionId: mergePerformanceExpedition,
      originClientId: 'performance-client-b',
      occurredAt: incoming.updatedAt,
      type: 'mission_command_upsert',
      missionCommand: incoming,
    });
    assert.strictEqual(result.applied, true);
  }
  const realtimeMergeMs = performance.now() - realtimeMergeStartedAt;
  performanceCoordinator.deactivate();
  assert.ok(realtimeMergeMs < 2_500, `100 realtime merges took ${realtimeMergeMs.toFixed(1)}ms.`);

  const duplicateLoadExpedition = 'expedition-runtime-merge-duplicate-load';
  const duplicateLoadCoordinator = runtime.createDispatchMissionCommandRuntimeCoordinator();
  duplicateLoadCoordinator.activate({
    accountId: 'performance-account',
    expeditionId: duplicateLoadExpedition,
    defaults: defaults(),
    clientId: 'performance-client-a',
    authorizedActorIds: ['lead-1'],
  });
  const duplicateLoadWarmup = command({
    id: 'mission-command-duplicate-load-warmup',
    expeditionId: duplicateLoadExpedition,
    idempotencyKey: 'dispatch:mission_command:duplicate-load-warmup',
  });
  assert.strictEqual(duplicateLoadCoordinator.applyIncoming({
    id: 'realtime-duplicate-load-warmup',
    expeditionId: duplicateLoadExpedition,
    originClientId: 'performance-client-b',
    occurredAt: duplicateLoadWarmup.updatedAt,
    type: 'mission_command_upsert',
    missionCommand: duplicateLoadWarmup,
  }).applied, true);
  duplicateLoadCoordinator.refreshDiagnostics();
  const duplicateLoadStartedAt = performance.now();
  for (let index = 0; index < 100; index += 1) {
    const incoming = command({
      id: `mission-command-duplicate-load-${index}`,
      expeditionId: duplicateLoadExpedition,
      idempotencyKey: `dispatch:mission_command:duplicate-load-${index}`,
      updatedAt: new Date(Date.parse(CREATED_AT) + index * 1000).toISOString(),
    });
    assert.strictEqual(duplicateLoadCoordinator.applyIncoming({
      id: `realtime-duplicate-load-${index}`,
      expeditionId: duplicateLoadExpedition,
      originClientId: 'performance-client-b',
      occurredAt: incoming.updatedAt,
      type: 'mission_command_upsert',
      missionCommand: incoming,
    }).applied, true);
    duplicateLoadCoordinator.refreshDiagnostics();
  }
  const duplicateLoadMergeMs = performance.now() - duplicateLoadStartedAt;
  duplicateLoadCoordinator.deactivate();

  const replayPerformanceExpedition = 'expedition-runtime-replay-performance';
  for (let index = 0; index < 30; index += 1) {
    const queuedCommand = command({
      id: `mission-command-replay-${index}`,
      expeditionId: replayPerformanceExpedition,
      idempotencyKey: `dispatch:mission_command:replay-${index}`,
    });
    dispatchPersistenceAdapter.applyMissionCommandMutation(
      replayPerformanceExpedition,
      defaults(),
      queuedCommand,
      eventFor(queuedCommand, {
        id: `mission-command-event-replay-${index}`,
        idempotencyKey: `dispatch:mission_command_event:replay-${index}`,
      }),
    );
  }
  const replayPerformanceStartedAt = performance.now();
  const replayPerformanceResult = await replay.replayQueuedDispatchActions({
    expeditionId: replayPerformanceExpedition,
    defaults: defaults(),
    publish: async () => ({ ok: true }),
    entityTypes: ['mission_command', 'mission_command_event'],
    now: () => Date.parse('2026-07-14T12:30:00.000Z'),
  });
  const offlineReplayMs = performance.now() - replayPerformanceStartedAt;
  assert.ok(replayPerformanceResult.attempted > 0);
  assert.ok(offlineReplayMs < 5_000, `Mission Command offline replay took ${offlineReplayMs.toFixed(1)}ms.`);

  const retryExpedition = 'expedition-runtime-retry';
  const retryCommand = command({ expeditionId: retryExpedition, id: 'mission-command-retry' });
  dispatchPersistenceAdapter.applyMissionCommandMutation(
    retryExpedition,
    defaults(),
    retryCommand,
    eventFor(retryCommand),
  );
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await replay.replayQueuedDispatchActions({
      expeditionId: retryExpedition,
      defaults: defaults(),
      publish: async () => ({ ok: false, retryable: true, safeCode: 'network_unavailable' }),
      entityTypes: ['mission_command'],
      now: () => Date.parse(`2026-07-14T1${3 + attempt}:00:00.000Z`),
    });
  }
  const exhausted = dispatchPersistenceAdapter.load(retryExpedition, defaults()).offlineActions
    .find((item) => item.entityType === 'mission_command');
  assert.strictEqual(
    dispatchPersistenceAdapter.load(retryExpedition, defaults()).offlineActions
      .filter((item) => item.entityType === 'mission_command').length,
    1,
    'Retries must reuse the original stable command operation ID.',
  );
  assert.strictEqual(exhausted.retryability, 'non_retryable');
  assert.strictEqual(exhausted.nextAttemptAt, undefined);
  const retried = replay.retryDispatchOfflineOperation(retryExpedition, defaults(), exhausted.id);
  assert.strictEqual(retried.status, 'queued');
  assert.strictEqual(retried.attemptCount, 0);
  const persistedRetry = dispatchPersistenceAdapter.load(retryExpedition, defaults()).offlineActions
    .find((item) => item.id === exhausted.id);
  assert.strictEqual(persistedRetry.retryability, 'retryable');
  assert.strictEqual(persistedRetry.attemptCount, 0);
  const cancelled = replay.cancelDispatchOfflineOperation(retryExpedition, defaults(), exhausted.id);
  assert.strictEqual(cancelled.status, 'cancelled');

  console.log(JSON.stringify({
    suite: 'dispatch-mission-command-runtime',
    status: 'passed',
    performance: {
      realtimeMerge100Ms: Number(realtimeMergeMs.toFixed(2)),
      duplicateLoadComparison100Ms: Number(duplicateLoadMergeMs.toFixed(2)),
      duplicateLoadSavingsPct: Number((Math.max(0, 1 - (realtimeMergeMs / duplicateLoadMergeMs)) * 100).toFixed(1)),
      offlineReplayMs: Number(offlineReplayMs.toFixed(2)),
      replayAttempted: replayPerformanceResult.attempted,
      replayDeferred: replayPerformanceResult.deferred,
      retainedCommandEventBytes: boundedRetainedBytes,
    },
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

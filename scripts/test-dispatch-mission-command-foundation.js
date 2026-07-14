const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
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

const CREATED_AT = '2026-07-14T12:00:00.000Z';
const UPDATED_AT = '2026-07-14T12:05:00.000Z';

function sourceTruth(id = 'mission-source') {
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
    id: 'mission-command-1',
    expeditionId: 'expedition-1',
    creator: { id: 'lead-1', label: 'Lead', role: 'owner' },
    type: 'check_in',
    priority: 'normal',
    title: 'Confirm team status',
    instructions: 'Confirm status at the next safe stop.',
    target: { kind: 'team', memberIds: ['member-1', 'member-2'], label: 'Expedition team' },
    acknowledgmentPolicy: {
      mode: 'all',
      targetMemberIds: ['member-1', 'member-2'],
    },
    deadlineAt: '2026-07-14T13:00:00.000Z',
    sourceTruth: [sourceTruth()],
    operationalState: 'proposed',
    deliveryState: 'local',
    acknowledgmentState: 'pending',
    acknowledgments: [],
    idempotencyKey: 'dispatch:mission_command:stable-one',
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
    operationalPlaybooks: [],
  };
}

const domain = load('lib/dispatchMissionCommandDomain.ts');
const adapters = load('lib/dispatchMissionCommandAdapters.ts');
const { dispatchPersistenceAdapter } = load('lib/dispatchPersistenceAdapter.ts');
const rollout = load('lib/dispatchRolloutConfig.ts');
const featureRegistry = load('lib/features/featureVisibilityRegistry.ts');

const expectedOperationalTransitions = {
  proposed: ['ready', 'cancelled', 'expired'],
  ready: ['active', 'cancelled', 'expired'],
  active: ['in_progress', 'blocked', 'resolved', 'cancelled', 'expired'],
  in_progress: ['blocked', 'resolved', 'cancelled', 'expired'],
  blocked: ['active', 'in_progress', 'resolved', 'cancelled', 'expired'],
  resolved: [],
  cancelled: [],
  expired: [],
};

for (const [current, nextStates] of Object.entries(expectedOperationalTransitions)) {
  for (const next of nextStates) {
    const result = domain.transitionMissionCommandOperationalState(
      command({ operationalState: current }),
      next,
      { actor: { id: 'lead-1', label: 'Lead', role: 'owner' }, occurredAt: UPDATED_AT },
    );
    assert.strictEqual(result.ok, true, `${current} -> ${next} should be allowed.`);
    assert.strictEqual(result.command.operationalState, next);
    assert.strictEqual(result.changed, true);
    assert.ok(result.event, `${current} -> ${next} should append an event.`);
  }
}

const invalidTransition = domain.transitionMissionCommandOperationalState(
  command({ operationalState: 'resolved' }),
  'active',
  { actor: { id: 'lead-1', label: 'Lead' }, occurredAt: UPDATED_AT },
);
assert.strictEqual(invalidTransition.ok, false, 'Resolved commands must not reopen through an incidental transition.');
assert.strictEqual(invalidTransition.command.operationalState, 'resolved');

const deliveryOnly = domain.transitionMissionCommandDeliveryState(
  command({ operationalState: 'active', deliveryState: 'local' }),
  'queued',
  { actor: { id: 'lead-1', label: 'Lead' }, occurredAt: UPDATED_AT },
);
assert.strictEqual(deliveryOnly.ok, true);
assert.strictEqual(deliveryOnly.command.deliveryState, 'queued');
assert.strictEqual(deliveryOnly.command.operationalState, 'active', 'Delivery must not mutate operational state.');
assert.strictEqual(deliveryOnly.command.acknowledgmentState, 'pending', 'Delivery must not mutate acknowledgment state.');

const partialAck = domain.recordMissionCommandAcknowledgment(command(), {
  id: 'ack-1',
  idempotencyKey: 'ack:member-1',
  memberId: 'member-1',
  response: 'acknowledged',
  respondedAt: UPDATED_AT,
});
assert.strictEqual(partialAck.ok, true);
assert.strictEqual(partialAck.command.acknowledgmentState, 'partial');
assert.strictEqual(partialAck.command.operationalState, 'proposed', 'Acknowledgment must not advance operational state.');

const completeAck = domain.recordMissionCommandAcknowledgment(partialAck.command, {
  id: 'ack-2',
  idempotencyKey: 'ack:member-2',
  memberId: 'member-2',
  response: 'acknowledged',
  respondedAt: '2026-07-14T12:06:00.000Z',
});
assert.strictEqual(completeAck.command.acknowledgmentState, 'complete');

const duplicateCommands = domain.mergeMissionCommandBatch([
  command(),
  command({ id: 'mission-command-duplicate', version: 2, title: 'Updated title', updatedAt: UPDATED_AT }),
]);
assert.strictEqual(duplicateCommands.length, 1, 'A duplicate idempotency key must not create a second command.');
assert.strictEqual(duplicateCommands[0].id, 'mission-command-1', 'The first stable command identity must be preserved.');
assert.strictEqual(duplicateCommands[0].title, 'Updated title', 'The newer duplicate may update the aggregate.');

const terminalCommand = {
  ...command({ operationalState: 'resolved', version: 3, updatedAt: UPDATED_AT }),
  resolution: {
    kind: 'resolved',
    summary: 'Resolved safely.',
    occurredAt: UPDATED_AT,
    actorId: 'lead-1',
  },
};
const rejectedReopen = domain.mergeMissionCommandBatch([
  terminalCommand,
  command({ operationalState: 'active', version: 4, updatedAt: '2026-07-14T12:06:00.000Z' }),
]);
assert.strictEqual(rejectedReopen[0].operationalState, 'resolved', 'A newer persisted record cannot reopen a terminal command.');

const allowlistedRecord = domain.normalizePersistedMissionCommand({
  ...command(),
  rawProviderResponse: { token: 'must-not-persist' },
});
assert.ok(allowlistedRecord);
assert.strictEqual(allowlistedRecord.rawProviderResponse, undefined, 'Unknown persistence fields must be omitted.');

const resolvedOnce = domain.transitionMissionCommandOperationalState(
  command({ operationalState: 'active' }),
  'resolved',
  { actor: { id: 'lead-1', label: 'Lead' }, occurredAt: UPDATED_AT, resolutionSummary: 'Team confirmed safe.' },
);
const resolvedTwice = domain.transitionMissionCommandOperationalState(
  resolvedOnce.command,
  'resolved',
  { actor: { id: 'lead-1', label: 'Lead' }, occurredAt: UPDATED_AT, resolutionSummary: 'Duplicate tap.' },
);
assert.strictEqual(resolvedOnce.ok, true);
assert.strictEqual(resolvedTwice.ok, true);
assert.strictEqual(resolvedTwice.changed, false, 'Repeated resolve must be idempotent.');
assert.strictEqual(resolvedTwice.event, null, 'Repeated resolve must not append a duplicate event.');

const cancelled = domain.transitionMissionCommandOperationalState(
  command({ operationalState: 'ready' }),
  'cancelled',
  { actor: { id: 'lead-1', label: 'Lead' }, occurredAt: UPDATED_AT, reasonCode: 'user_cancelled' },
);
assert.strictEqual(cancelled.command.operationalState, 'cancelled');
assert.strictEqual(cancelled.command.resolution.kind, 'cancelled');

const expired = domain.expireMissionCommand(
  command({ operationalState: 'active', deadlineAt: '2026-07-14T12:01:00.000Z' }),
  { actor: { id: 'system', label: 'ECS' }, now: '2026-07-14T12:10:00.000Z' },
);
assert.strictEqual(expired.ok, true);
assert.strictEqual(expired.command.operationalState, 'expired');
assert.strictEqual(expired.command.acknowledgmentState, 'expired');

const restrictedPing = {
  id: 'legacy-ping-1',
  idempotencyKey: 'dispatch:ping:legacy-one',
  version: 2,
  type: 'emergency',
  priority: 'critical',
  status: 'queued',
  operationalState: 'awaiting_acknowledgment',
  message: 'Stop at the next safe location and confirm status.',
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  createdByMemberId: 'lead-1',
  targetMemberIds: ['member-1'],
  linkedContext: {
    id: 'restricted-context-1',
    type: 'member',
    title: 'Restricted member position',
    coordinates: { latitude: 39.123456, longitude: -104.123456 },
    metadata: { rawTrace: [[39.1, -104.1]] },
    restricted: true,
  },
  escalationState: 'none',
  responseDueAt: '2026-07-14T13:00:00.000Z',
  acknowledgedByMemberIds: [],
  requiresAcknowledgment: true,
};
const adaptedPing = adapters.adaptDispatchPingToMissionCommand(restrictedPing, {
  expeditionId: 'expedition-1',
  creatorLabel: 'Lead',
});
assert.strictEqual(adaptedPing.type, 'emergency', 'Existing ping types must remain supported.');
assert.strictEqual(adaptedPing.deliveryState, 'queued');
assert.strictEqual(adaptedPing.sourceTruth[0].origin, 'manual', 'A recent local record must not be relabeled live.');
assert.strictEqual(adaptedPing.linkedContext.restricted, true);
assert.strictEqual(adaptedPing.linkedContext.coordinates, undefined, 'Restricted coordinates must not enter the command aggregate.');
assert.strictEqual(adaptedPing.linkedContext.metadata, undefined, 'Restricted raw context must not enter the command aggregate.');

const soloCommand = adapters.adaptDispatchPingToMissionCommand({
  ...restrictedPing,
  id: 'solo-ping',
  idempotencyKey: 'dispatch:ping:solo',
  type: 'general',
  targetMemberIds: [],
  linkedContext: undefined,
}, {
  expeditionId: 'solo-expedition',
  creatorLabel: 'Solo operator',
  soloMode: true,
});
assert.deepStrictEqual(soloCommand.target, {
  kind: 'solo',
  memberId: 'lead-1',
  label: 'Current user',
});

const legacyQueue = {
  id: 'legacy-queue-1',
  idempotencyKey: 'dispatch:queue:legacy-one',
  version: 1,
  title: 'Inspect blocked route',
  detail: 'Review the obstruction before proceeding.',
  status: 'in_progress',
  priority: 'high',
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  createdByMemberId: 'lead-1',
  assignedMemberIds: ['member-2'],
  linkedContext: { id: 'route-1', type: 'route', title: 'Route 1' },
  escalationState: 'none',
  deliveryState: 'sent',
  dueAt: '2026-07-14T13:30:00.000Z',
  tags: ['route'],
};
const adaptedQueue = adapters.adaptDispatchQueueItemToMissionCommand(legacyQueue, {
  expeditionId: 'expedition-1',
  creatorLabel: 'Lead',
});
assert.strictEqual(adaptedQueue.type, 'route');
assert.strictEqual(adaptedQueue.operationalState, 'in_progress');
assert.strictEqual(adaptedQueue.target.kind, 'member');
assert.strictEqual(adaptedQueue.assignment.assigneeMemberId, 'member-2');

const assignmentApplied = adapters.applyDispatchAssignmentToMissionCommand(adaptedQueue, {
  id: 'assignment-1',
  queueItemId: legacyQueue.id,
  assigneeMemberId: 'member-2',
  status: 'blocked',
  assignedAt: CREATED_AT,
  updatedAt: UPDATED_AT,
});
assert.strictEqual(assignmentApplied.assignment.status, 'blocked');
assert.strictEqual(assignmentApplied.operationalState, 'blocked');

const ackApplied = adapters.applyDispatchAcknowledgmentToMissionCommand(adaptedPing, {
  id: 'legacy-ack-1',
  pingId: restrictedPing.id,
  memberId: 'member-1',
  status: 'acknowledged',
  acknowledgedAt: UPDATED_AT,
});
assert.strictEqual(ackApplied.acknowledgmentState, 'complete');

const timelineEvent = adapters.adaptDispatchTimelineEventToMissionCommandEvent({
  id: 'timeline-1',
  idempotencyKey: 'dispatch:timeline:one',
  type: 'ping_acknowledged',
  title: 'Member acknowledged',
  detail: 'Acknowledged.',
  occurredAt: UPDATED_AT,
  priority: 'normal',
  memberIds: ['member-1'],
  pingId: restrictedPing.id,
}, adaptedPing);
assert.strictEqual(timelineEvent.type, 'acknowledged');
assert.strictEqual(timelineEvent.commandId, adaptedPing.id);

const board = domain.selectMissionCommandBoard([
  command({ id: 'needs', idempotencyKey: 'needs', operationalState: 'proposed' }),
  command({ id: 'awaiting', idempotencyKey: 'awaiting', operationalState: 'active' }),
  command({
    id: 'progress',
    idempotencyKey: 'progress',
    operationalState: 'in_progress',
    acknowledgmentPolicy: { mode: 'none', targetMemberIds: [] },
    acknowledgmentState: 'not_required',
  }),
  command({
    id: 'resolved',
    idempotencyKey: 'resolved',
    operationalState: 'resolved',
    acknowledgmentPolicy: { mode: 'none', targetMemberIds: [] },
    acknowledgmentState: 'not_required',
  }),
]);
assert.deepStrictEqual(board.needsDecision.map((item) => item.id), ['needs']);
assert.deepStrictEqual(board.awaitingAcknowledgment.map((item) => item.id), ['awaiting']);
assert.deepStrictEqual(board.inProgress.map((item) => item.id), ['progress']);
assert.deepStrictEqual(board.resolved.map((item) => item.id), ['resolved']);

const migrationExpeditionId = 'mission-command-migration';
localStorage.setItem(`dispatch_state_${migrationExpeditionId}`, JSON.stringify({
  version: 2,
  expeditionId: migrationExpeditionId,
  pings: [restrictedPing],
  queueItems: [],
  assignments: [],
  assistRequests: [],
  acknowledgments: [],
  timelineEvents: [],
  offlineActions: [],
  cadEvents: [],
  missionCommands: [{ broken: true }],
  missionCommandEvents: [{ broken: true }],
  updatedAt: CREATED_AT,
}));
const migrated = dispatchPersistenceAdapter.load(migrationExpeditionId, defaults());
assert.strictEqual(migrated.version, 4);
assert.strictEqual(migrated.pings.length, 1, 'Legacy Dispatch records must survive the schema migration.');
assert.deepStrictEqual(migrated.missionCommands, [], 'Invalid canonical records must fail closed without deleting legacy data.');
assert.deepStrictEqual(migrated.missionCommandEvents, []);

const persisted = dispatchPersistenceAdapter.upsertMissionCommand(
  migrationExpeditionId,
  defaults(),
  command({ expeditionId: migrationExpeditionId }),
);
assert.strictEqual(persisted.missionCommands.length, 1);
const eventPersisted = dispatchPersistenceAdapter.appendMissionCommandEvent(
  migrationExpeditionId,
  defaults(),
  {
    ...resolvedOnce.event,
    id: 'mission-event-migration',
    idempotencyKey: 'mission-event-migration',
    commandId: persisted.missionCommands[0].id,
    expeditionId: migrationExpeditionId,
  },
);
assert.strictEqual(eventPersisted.missionCommandEvents.length, 1);

const corruptExpeditionId = 'mission-command-corrupt';
localStorage.setItem(`dispatch_state_${corruptExpeditionId}`, '{not-json');
const corruptFallback = dispatchPersistenceAdapter.load(corruptExpeditionId, defaults());
assert.strictEqual(corruptFallback.version, 4);
assert.deepStrictEqual(corruptFallback.missionCommands, []);
assert.deepStrictEqual(corruptFallback.pings, []);

assert.strictEqual(
  rollout.DEFAULT_DISPATCH_ROLLOUT_CONFIG.missionCommand,
  false,
  'Mission Command must remain default-off.',
);
const missionFeature = featureRegistry.getECSFeatureDefinition('dispatch_mission_command');
assert.ok(missionFeature);
assert.strictEqual(missionFeature.maturity, 'internal');
assert.strictEqual(missionFeature.defaultEnabled, false);
assert.deepStrictEqual(missionFeature.environment.allowed, ['development', 'test', 'internal']);
assert.strictEqual(missionFeature.routePolicy, undefined, 'The foundation must not register a new route.');

const enabledInternal = rollout.resolveDispatchRolloutConfig(
  { missionCommand: true },
  featureRegistry.createRuntimeFeatureVisibilityContext({
    environment: 'internal',
    env: { EXPO_PUBLIC_ECS_MISSION_COMMAND: 'true' },
    authenticated: true,
  }),
);
assert.strictEqual(enabledInternal.missionCommand, true, 'Explicit internal rollout should be possible.');

const disabledProduction = rollout.resolveDispatchRolloutConfig(
  { missionCommand: true },
  featureRegistry.createRuntimeFeatureVisibilityContext({
    environment: 'production',
    env: { EXPO_PUBLIC_ECS_MISSION_COMMAND: 'true' },
    authenticated: true,
  }),
);
assert.strictEqual(disabledProduction.missionCommand, false, 'Mission Command must fail closed in production.');

console.log('Dispatch Mission Command foundation checks passed.');

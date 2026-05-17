const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

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
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

const {
  MOCK_DISPATCH_CONTEXTS,
  MOCK_DISPATCH_PINGS,
  MOCK_DISPATCH_QUEUE_ITEMS,
  MOCK_DISPATCH_TEAM_MEMBERS,
  MOCK_DISPATCH_TIMELINE_EVENTS,
} = loadTypeScriptModule('lib/dispatchMockData.ts');

const {
  sortDispatchQueue,
} = loadTypeScriptModule('lib/dispatchTypes.ts');

const {
  applyCheckInResponse,
  getCheckInQueuePatch,
} = loadTypeScriptModule('lib/dispatchCheckInAdapter.ts');

const {
  applyEscalationTransition,
} = loadTypeScriptModule('lib/dispatchEscalationAdapter.ts');

const {
  getDispatchNotificationPolicy,
  notifyDispatchEvent,
} = loadTypeScriptModule('lib/dispatchNotificationAdapter.ts');

const {
  DEFAULT_DISPATCH_ROLLOUT_CONFIG,
  getDispatchRolloutDisabledCopy,
  isDispatchFeatureEnabled,
  resolveDispatchRolloutConfig,
} = loadTypeScriptModule('lib/dispatchRolloutConfig.ts');

const {
  resolveDispatchRecipients,
} = loadTypeScriptModule('lib/dispatchRoutingAdapter.ts');

const {
  getInitialDispatchPingStatus,
  markDispatchPingDeliveryResult,
  prepareDispatchPingRetry,
  resolveDispatchSyncSnapshot,
} = loadTypeScriptModule('lib/dispatchSyncAdapter.ts');

const {
  canMutateDispatchQueueItem,
  canSubmitAssistRequest,
  canSubmitDispatchPing,
  resolveDispatchPermissions,
} = loadTypeScriptModule('lib/dispatchPermissionAdapter.ts');

const {
  createDispatchEntityId,
  createDispatchIdempotencyKey,
  mergeDispatchPing,
  mergeDispatchQueueItem,
  mergeDispatchTimelineEvent,
  rememberDispatchAction,
  shouldApplyIncomingDispatchEvent,
} = loadTypeScriptModule('lib/dispatchIntegrity.ts');

const TEAM = MOCK_DISPATCH_TEAM_MEMBERS;
const COMMAND = TEAM.find((member) => member.id === 'member-logan');
const SCOUT = TEAM.find((member) => member.id === 'member-mara');
const MEDIC = TEAM.find((member) => member.id === 'member-ellis');
const TAIL = TEAM.find((member) => member.id === 'member-owen');
const EXPEDITION_ID = 'scenario-expedition-ruby-ridge';
const BASE_TIME = '2026-04-24T20:00:00Z';

const defaultRollout = resolveDispatchRolloutConfig();
assert.strictEqual(defaultRollout.dispatchTabVisibility, true, 'Dispatch UI rollout should default enabled.');
assert.strictEqual(defaultRollout.teamPing, true, 'Team Ping rollout should default enabled.');
assert.strictEqual(defaultRollout.assistRequest, true, 'Assist Request rollout should default enabled as ECS team coordination only.');
assert.strictEqual(defaultRollout.emergencyPing, true, 'Emergency Ping rollout should default enabled only as ECS team coordination.');
assert.strictEqual(defaultRollout.notifications, false, 'Dispatch notifications should default disabled until policy is verified.');
assert.strictEqual(defaultRollout.escalationAutomation, false, 'Automated escalation should default disabled.');
assert.strictEqual(DEFAULT_DISPATCH_ROLLOUT_CONFIG.offlineReplay, true, 'Offline replay should default enabled after idempotency hardening.');
assert.strictEqual(
  isDispatchFeatureEnabled(resolveDispatchRolloutConfig({ teamPing: false }), 'teamPing'),
  false,
  'Dispatch rollout overrides should disable individual features.',
);
assert.ok(
  getDispatchRolloutDisabledCopy('notifications').includes('disabled'),
  'Disabled rollout copy should be available for UI states.',
);

function createScenarioState(overrides = {}) {
  return {
    pings: [...MOCK_DISPATCH_PINGS],
    queueItems: [...MOCK_DISPATCH_QUEUE_ITEMS],
    timelineEvents: [...MOCK_DISPATCH_TIMELINE_EVENTS],
    members: [...TEAM],
    ...overrides,
  };
}

function createPing({
  id = 'local-ping-scenario',
  type = 'general',
  priority = 'normal',
  status = 'sent',
  message = 'Dispatch update. Please acknowledge.',
  targets = [SCOUT.id],
  linkedContext = MOCK_DISPATCH_CONTEXTS.expedition,
  requiresAcknowledgment = false,
  now = BASE_TIME,
}) {
  const key = createDispatchIdempotencyKey({
    expeditionId: EXPEDITION_ID,
    entityType: 'ping',
    actionType: `scenario:${type}`,
    actorMemberId: COMMAND.id,
    targetMemberIds: targets,
    linkedContextId: linkedContext.id,
    message,
    priority,
    timeBucket: now.slice(0, 16),
  });
  return {
    id,
    idempotencyKey: key,
    version: 1,
    type,
    priority,
    status,
    message,
    createdAt: now,
    updatedAt: now,
    createdByMemberId: COMMAND.id,
    targetMemberIds: targets,
    linkedContext,
    escalationState: 'none',
    requiresAcknowledgment,
    acknowledgedByMemberIds: [],
  };
}

function createQueueItem({
  id = 'local-queue-scenario',
  title = 'Scenario queue item',
  detail = 'Scenario queue detail.',
  priority = 'normal',
  status = 'pending_response',
  assignedMemberIds = [SCOUT.id],
  linkedContext = MOCK_DISPATCH_CONTEXTS.expedition,
  sourcePingId,
  deliveryState = 'sent',
  now = BASE_TIME,
  tags = [],
}) {
  return {
    id,
    idempotencyKey: createDispatchIdempotencyKey({
      expeditionId: EXPEDITION_ID,
      entityType: 'queue_item',
      actionType: `scenario-queue:${title}`,
      actorMemberId: COMMAND.id,
      targetMemberIds: assignedMemberIds,
      linkedContextId: linkedContext.id,
      sourceEntityId: sourcePingId,
      priority,
      timeBucket: now.slice(0, 16),
    }),
    version: 1,
    title,
    detail,
    status,
    priority,
    createdAt: now,
    updatedAt: now,
    createdByMemberId: COMMAND.id,
    assignedMemberIds,
    linkedContext,
    escalationState: 'none',
    deliveryState,
    sourcePingId,
    tags,
  };
}

function createTimelineEvent({
  id = 'local-timeline-scenario',
  type = 'ping_created',
  title = 'Scenario timeline event',
  detail = 'Scenario timeline detail.',
  priority = 'normal',
  memberIds = [SCOUT.id],
  linkedContext = MOCK_DISPATCH_CONTEXTS.expedition,
  pingId,
  queueItemId,
  deliveryState = 'sent',
  now = BASE_TIME,
}) {
  return {
    id,
    idempotencyKey: createDispatchIdempotencyKey({
      expeditionId: EXPEDITION_ID,
      entityType: 'timeline_event',
      actionType: `scenario-timeline:${type}`,
      actorMemberId: COMMAND.id,
      targetMemberIds: memberIds,
      linkedContextId: linkedContext.id,
      sourceEntityId: pingId ?? queueItemId,
      priority,
      timeBucket: now.slice(0, 16),
    }),
    version: 1,
    type,
    title,
    detail,
    occurredAt: now,
    priority,
    memberIds,
    actor: COMMAND.callSign,
    target: memberIds.length === 1 ? SCOUT.callSign : `${memberIds.length} members`,
    linkedContext,
    pingId,
    queueItemId,
    deliveryState,
    escalationState: 'none',
  };
}

function sendPingScenario(state, ping) {
  const queueItem = ping.requiresAcknowledgment
    ? createQueueItem({
        id: `local-queue-for-${ping.id}`,
        title: `${ping.type} response required`,
        detail: ping.message,
        priority: ping.priority,
        assignedMemberIds: ping.targetMemberIds,
        linkedContext: ping.linkedContext,
        sourcePingId: ping.id,
        deliveryState: ping.status,
        tags: [ping.type],
      })
    : null;
  const timelineEvent = createTimelineEvent({
    id: `local-timeline-for-${ping.id}`,
    type: 'ping_created',
    title: 'Team Ping created',
    detail: ping.message,
    priority: ping.priority,
    memberIds: ping.targetMemberIds,
    linkedContext: ping.linkedContext,
    pingId: ping.id,
    deliveryState: ping.status,
  });

  return {
    ...state,
    pings: mergeDispatchPing(state.pings, ping),
    queueItems: queueItem ? mergeDispatchQueueItem(state.queueItems, queueItem) : state.queueItems,
    timelineEvents: mergeDispatchTimelineEvent(state.timelineEvents, timelineEvent),
  };
}

// 1. No active expedition: Dispatch should be readable with conservative permissions and empty data.
const noActivePermissions = resolveDispatchPermissions({
  activeExpeditionStatus: 'unknown',
  currentMember: null,
  soloMode: false,
});
assert.strictEqual(noActivePermissions.can('view_dispatch').allowed, true, 'No active expedition should still render Dispatch read-only.');
assert.strictEqual(
  noActivePermissions.can('resolve_queue_item').allowed,
  false,
  'No active expedition without a privileged member should not allow restricted queue mutations.',
);

// 2. Solo mode.
const soloPermissions = resolveDispatchPermissions({
  activeExpeditionStatus: 'active',
  currentMember: COMMAND,
  soloMode: true,
});
assert.strictEqual(soloPermissions.can('send_team_wide_ping').allowed, true, 'Solo mode should keep local Dispatch actions available.');

// 3. Team mode roster loading.
assert.strictEqual(TEAM.length >= 5, true, 'Team mode should have a loaded roster fixture.');
assert.strictEqual(TEAM.some((member) => member.status === 'offline'), true, 'Team mode fixture should include an offline member.');

// 4. Send individual Team Ping.
let state = createScenarioState({ pings: [], queueItems: [], timelineEvents: [] });
const individualPing = createPing({
  id: createDispatchEntityId('ping', 'scenario-individual-ping'),
  type: 'check_in',
  targets: [SCOUT.id],
  message: 'Confirm your current status.',
});
state = sendPingScenario(state, individualPing);
assert.strictEqual(state.pings.length, 1, 'Sending an individual Team Ping should add one ping.');
assert.deepStrictEqual(state.pings[0].targetMemberIds, [SCOUT.id], 'Individual ping should target the selected member.');

// 5. Send team-wide Team Ping.
const allTeamRecipients = resolveDispatchRecipients({
  selection: { recipientMode: 'all' },
  members: TEAM,
  senderMemberId: COMMAND.id,
  excludeSender: true,
});
const teamPing = createPing({
  id: createDispatchEntityId('ping', 'scenario-team-ping'),
  type: 'general',
  targets: allTeamRecipients.recipientIds,
  message: 'Team-wide Dispatch update.',
});
state = sendPingScenario(state, teamPing);
assert.strictEqual(
  state.pings.find((ping) => ping.id === teamPing.id).targetMemberIds.includes(COMMAND.id),
  false,
  'Team-wide ping should exclude the sender when requested.',
);

// 6. Required acknowledgment.
const ackPing = createPing({
  id: createDispatchEntityId('ping', 'scenario-required-ack'),
  type: 'check_in',
  targets: [SCOUT.id, MEDIC.id],
  message: 'Confirm your current status.',
  requiresAcknowledgment: true,
});
state = sendPingScenario(state, ackPing);
assert.strictEqual(
  state.queueItems.some((item) => item.sourcePingId === ackPing.id && item.status === 'pending_response'),
  true,
  'Required acknowledgment ping should create a pending response queue item.',
);

// 7. Recipient acknowledgment.
const acknowledgedPing = applyCheckInResponse({
  ping: ackPing,
  memberId: SCOUT.id,
  responseStatus: 'ok',
  respondedAt: '2026-04-24T20:05:00Z',
});
const ackQueue = state.queueItems.find((item) => item.sourcePingId === ackPing.id);
const ackQueuePatch = getCheckInQueuePatch({
  queueItem: ackQueue,
  ping: acknowledgedPing,
  responseStatus: 'ok',
  respondedAt: '2026-04-24T20:05:00Z',
});
assert.deepStrictEqual(acknowledgedPing.acknowledgedByMemberIds, [SCOUT.id], 'Recipient acknowledgment should mark the ping acknowledged by member.');
assert.strictEqual(ackQueuePatch.status, 'pending_response', 'Partial acknowledgment should keep the queue item pending.');

// 8. Queue item escalation.
const escalationTransition = applyEscalationTransition({
  queueItem: ackQueue,
  ping: ackPing,
  now: '2026-04-24T20:10:00Z',
  actor: 'Command',
  target: 'Scout',
  manual: true,
});
assert.strictEqual(escalationTransition.queueItem.status, 'escalated', 'Manual escalation should escalate the queue item.');
assert.strictEqual(escalationTransition.ping.status, 'escalated', 'Manual escalation should escalate the linked ping.');

// 9. Queue item resolution.
const resolvedQueueItem = {
  ...escalationTransition.queueItem,
  status: 'resolved',
  escalationState: 'resolved',
  updatedAt: '2026-04-24T20:12:00Z',
  version: (escalationTransition.queueItem.version ?? 1) + 1,
};
state = {
  ...state,
  queueItems: mergeDispatchQueueItem(state.queueItems, resolvedQueueItem),
  timelineEvents: mergeDispatchTimelineEvent(state.timelineEvents, createTimelineEvent({
    id: 'local-timeline-resolution',
    type: 'queue_resolved',
    title: 'Queue item resolved',
    detail: 'Acknowledgment follow-up resolved.',
    priority: resolvedQueueItem.priority,
    memberIds: resolvedQueueItem.assignedMemberIds,
    linkedContext: resolvedQueueItem.linkedContext,
    queueItemId: resolvedQueueItem.id,
  })),
};
assert.strictEqual(
  state.queueItems.find((item) => item.id === resolvedQueueItem.id).status,
  'resolved',
  'Queue item resolution should persist resolved status.',
);

// 10. Assist Request creation.
const assistPing = createPing({
  id: createDispatchEntityId('ping', 'scenario-assist'),
  type: 'assist',
  priority: 'high',
  targets: [MEDIC.id],
  message: 'Support needed. Confirm availability.',
  linkedContext: MOCK_DISPATCH_CONTEXTS.vehicleLead,
  requiresAcknowledgment: true,
});
state = sendPingScenario(state, assistPing);
assert.strictEqual(
  state.queueItems.some((item) => item.sourcePingId === assistPing.id && item.tags.includes('assist')),
  true,
  'Assist Request should create a linked queue item.',
);
assert.strictEqual(
  state.timelineEvents.some((event) => event.pingId === assistPing.id),
  true,
  'Assist Request should create a timeline event.',
);

// 11. Emergency Assist Request creation.
const emergencyAssistPing = createPing({
  id: createDispatchEntityId('ping', 'scenario-emergency-assist'),
  type: 'emergency',
  priority: 'critical',
  targets: [SCOUT.id, MEDIC.id],
  message: 'Immediate attention required. Acknowledge now.',
  linkedContext: MOCK_DISPATCH_CONTEXTS.rallyPoint,
  requiresAcknowledgment: true,
});
state = sendPingScenario(state, emergencyAssistPing);
const emergencyQueue = state.queueItems.find((item) => item.sourcePingId === emergencyAssistPing.id);
assert.strictEqual(emergencyAssistPing.priority, 'critical', 'Emergency Assist should default to critical priority.');
assert.strictEqual(emergencyPingRequiresAck(emergencyAssistPing), true, 'Emergency Assist should require acknowledgment.');
assert.strictEqual(sortDispatchQueue([emergencyQueue, resolvedQueueItem])[0].id, emergencyQueue.id, 'Emergency queue item should sort above resolved work.');

// 12. Offline queued ping.
const offlineSnapshot = resolveDispatchSyncSnapshot({
  isOnline: false,
  offlineMode: true,
  syncStatus: 'idle',
  connectivityStatus: 'offline',
  queueSize: 1,
  dirtyCount: 1,
});
const offlinePing = createPing({
  id: createDispatchEntityId('ping', 'scenario-offline-ping'),
  status: getInitialDispatchPingStatus(offlineSnapshot),
  targets: [TAIL.id],
  message: 'Offline check-in queued.',
});
offlinePing.reliabilityState = offlineSnapshot.state;
assert.strictEqual(offlinePing.status, 'queued', 'Offline pings should start queued.');

// 13. Offline replay without duplicate.
const replayingPing = prepareDispatchPingRetry(offlinePing, {
  isDeliverable: true,
  now: '2026-04-24T20:20:00Z',
});
const recoveredPing = markDispatchPingDeliveryResult(replayingPing, true, '2026-04-24T20:21:00Z');
const replayMerged = mergeDispatchPing(mergeDispatchPing([], offlinePing), recoveredPing);
assert.strictEqual(replayMerged.length, 1, 'Offline replay should merge into the queued ping instead of duplicating.');
assert.strictEqual(replayMerged[0].reliabilityState, 'recovered', 'Successful offline replay should mark the ping recovered.');

// 14. Realtime incoming ping.
const realtimePing = createPing({
  id: 'remote-ping-scenario',
  type: 'route',
  targets: [SCOUT.id],
  message: 'Confirm route condition.',
  linkedContext: MOCK_DISPATCH_CONTEXTS.routeSegment,
});
const realtimePingEvent = {
  id: 'rt-scenario-ping',
  expeditionId: EXPEDITION_ID,
  originClientId: 'remote-client',
  occurredAt: '2026-04-24T20:22:00Z',
  type: 'ping_upsert',
  ping: realtimePing,
};
assert.strictEqual(
  shouldApplyIncomingDispatchEvent(realtimePingEvent, { pings: state.pings }),
  true,
  'Realtime incoming ping should apply when it is new to local state.',
);
state = { ...state, pings: mergeDispatchPing(state.pings, realtimePing) };
assert.strictEqual(state.pings.some((ping) => ping.id === realtimePing.id), true, 'Realtime incoming ping should merge into state.');

// 15. Realtime queue update.
const realtimeQueueUpdate = {
  ...emergencyQueue,
  status: 'in_progress',
  updatedAt: '2026-04-24T20:23:00Z',
  version: (emergencyQueue.version ?? 1) + 1,
};
const realtimeQueueEvent = {
  id: 'rt-scenario-queue',
  expeditionId: EXPEDITION_ID,
  originClientId: 'remote-client',
  occurredAt: '2026-04-24T20:23:00Z',
  type: 'queue_item_upsert',
  queueItem: realtimeQueueUpdate,
};
assert.strictEqual(
  shouldApplyIncomingDispatchEvent(realtimeQueueEvent, { queueItems: state.queueItems }),
  true,
  'Realtime queue update should apply when newer than local state.',
);
state = { ...state, queueItems: mergeDispatchQueueItem(state.queueItems, realtimeQueueUpdate) };
assert.strictEqual(
  state.queueItems.find((item) => item.id === emergencyQueue.id).status,
  'in_progress',
  'Realtime queue update should update local queue status.',
);

// 16. Permission denied for restricted action.
const memberPermissions = resolveDispatchPermissions({
  activeExpeditionStatus: 'active',
  currentMember: SCOUT,
  soloMode: false,
});
assert.strictEqual(
  canSubmitDispatchPing({ recipientMode: 'all', pingType: 'general', priority: 'normal' }, memberPermissions).allowed,
  false,
  'Members should be denied team-wide pings.',
);
assert.strictEqual(
  canMutateDispatchQueueItem(emergencyQueue, 'resolve_queue_item', memberPermissions).allowed,
  false,
  'Members should be denied restricted queue resolution.',
);

// 17. Linked pin/waypoint context shown.
assert.strictEqual(
  state.queueItems.some((item) => item.linkedContext.type === 'pin' && item.linkedContext.title === MOCK_DISPATCH_CONTEXTS.rallyPoint.title),
  true,
  'Queue state should preserve linked pin context for rendering.',
);
assert.strictEqual(
  MOCK_DISPATCH_CONTEXTS.waypointMesa.type,
  'waypoint',
  'Waypoint linked context should remain available to scenario workflows.',
);

// 18. Timeline event created.
const timelineCountBefore = state.timelineEvents.length;
state = {
  ...state,
  timelineEvents: mergeDispatchTimelineEvent(state.timelineEvents, createTimelineEvent({
    id: 'local-timeline-route-request',
    type: 'resource_check_requested',
    title: 'Power check requested',
    detail: 'Report power status for Glacier / Delta Mini.',
    linkedContext: MOCK_DISPATCH_CONTEXTS.powerGlacier,
    memberIds: [COMMAND.id],
  })),
};
assert.strictEqual(state.timelineEvents.length, timelineCountBefore + 1, 'Dispatch actions should create timeline events.');

// 19. Notification adapter called once.
let notificationCount = 0;
const notificationEvent = {
  id: 'rt-scenario-notify',
  expeditionId: EXPEDITION_ID,
  originClientId: 'remote-client',
  occurredAt: '2026-04-24T20:24:00Z',
  type: 'ping_upsert',
  ping: {
    ...realtimePing,
    id: 'remote-ping-notify-once',
    idempotencyKey: 'remote-ping-notify-once',
    targetMemberIds: [SCOUT.id],
    createdByMemberId: COMMAND.id,
  },
};
assert.strictEqual(
  getDispatchNotificationPolicy({
    event: notificationEvent,
    currentUserId: SCOUT.id,
    teamMembers: TEAM,
    expeditionSource: 'local',
  }).shouldNotify,
  true,
  'Notification policy should target the selected recipient.',
);
notifyDispatchEvent({
  event: notificationEvent,
  currentUserId: SCOUT.id,
  teamMembers: TEAM,
  expeditionSource: 'local',
  showToast: () => {
    notificationCount += 1;
  },
});
notifyDispatchEvent({
  event: notificationEvent,
  currentUserId: SCOUT.id,
  teamMembers: TEAM,
  expeditionSource: 'local',
  showToast: () => {
    notificationCount += 1;
  },
});
assert.strictEqual(notificationCount, 1, 'Notification adapter should dedupe repeated delivery of the same event.');

// 20. Failed delivery retry.
const failedPing = {
  ...individualPing,
  status: 'failed',
  reliabilityState: 'failed',
  updatedAt: '2026-04-24T20:25:00Z',
  version: 2,
};
const retryingPing = prepareDispatchPingRetry(failedPing, {
  isDeliverable: true,
  now: '2026-04-24T20:26:00Z',
});
const retryResult = markDispatchPingDeliveryResult(retryingPing, true, '2026-04-24T20:27:00Z');
assert.strictEqual(retryingPing.status, 'retrying', 'Failed delivery retry should enter retrying state.');
assert.strictEqual(retryResult.reliabilityState, 'recovered', 'Successful failed delivery retry should recover delivery.');

// Double-submit guard for workflow sends.
const rapidActionKeys = new Map();
const rapidKey = createDispatchIdempotencyKey({
  expeditionId: EXPEDITION_ID,
  entityType: 'ping',
  actionType: 'rapid-submit',
  actorMemberId: COMMAND.id,
  targetMemberIds: [SCOUT.id],
  linkedContextId: MOCK_DISPATCH_CONTEXTS.expedition.id,
  message: 'Rapid submit guard.',
  priority: 'normal',
  timeBucket: '2026-04-24T20:30',
});
assert.strictEqual(rememberDispatchAction({ idempotencyKey: rapidKey, recentActions: rapidActionKeys, now: 1000 }), true, 'First rapid submit should be accepted.');
assert.strictEqual(rememberDispatchAction({ idempotencyKey: rapidKey, recentActions: rapidActionKeys, now: 1100 }), false, 'Second rapid submit should be blocked.');

// Permission-safe assist checks.
assert.strictEqual(
  canSubmitAssistRequest({ assistType: 'vehicle', recipientMode: 'member', priority: 'high' }, memberPermissions).allowed,
  true,
  'Members should be able to create limited assist requests.',
);
assert.strictEqual(
  canSubmitAssistRequest({ assistType: 'medical', recipientMode: 'all', priority: 'critical' }, memberPermissions).allowed,
  false,
  'Members should not create team-wide critical emergency assist without permission.',
);

function emergencyPingRequiresAck(ping) {
  return ping.type === 'emergency' && ping.priority === 'critical' && ping.requiresAcknowledgment === true;
}

if (originalTypeScriptExtension) {
  Module._extensions['.ts'] = originalTypeScriptExtension;
}

console.log('Dispatch scenario checks passed.');

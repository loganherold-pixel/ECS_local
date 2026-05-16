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
  filterAvailableTeamMembers,
  createCadEventFromAiAdvisory,
  createCadEventFromAssist,
  createCadEventFromCheckIn,
  createCadEventFromPing,
  getCadEventTypeLabel,
  getCadPriorityLabel,
  getCadStatusLabel,
  getEscalationRecommendation,
  getDeliveryStateLabel,
  getDispatchReliabilityLabel,
  getPingStatusLabel,
  getPriorityWeight,
  getCheckInResponseLabel,
  getCheckInScheduleLabel,
  sortCadEvents,
  sortDispatchQueue,
} = loadTypeScriptModule('lib/dispatchTypes.ts');

const {
  MOCK_DISPATCH_CAD_EVENTS,
  MOCK_DISPATCH_CAD_CONTEXTS,
  MOCK_DISPATCH_ADVISORIES,
  MOCK_DISPATCH_ADVISORY_CONTEXT,
  MOCK_TOP_DISPATCH_ADVISORY,
  MOCK_DISPATCH_PINGS: CAD_SOURCE_PINGS,
} = loadTypeScriptModule('lib/dispatchMockData.ts');

const {
  createCadEventFromAdvisory,
  explainDispatchAdvisory,
  generateDispatchAdvisories,
  getAdvisorySuggestedActions,
  getTopDispatchAdvisory,
  scoreDispatchAdvisory,
} = loadTypeScriptModule('lib/dispatchAdvisoryEngine.ts');

const dispatchTabSource = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/alert.tsx'), 'utf8');
const cadCommandCenterSource = fs.readFileSync(path.join(process.cwd(), 'components/dispatch/DispatchCadCommandCenter.tsx'), 'utf8');
const dispatchAdvisoryEngineSource = fs.readFileSync(path.join(process.cwd(), 'lib/dispatchAdvisoryEngine.ts'), 'utf8');
const dispatchChannelStateSource = fs.readFileSync(path.join(process.cwd(), 'lib/dispatchChannelState.ts'), 'utf8');

const {
  applyCheckInResponse,
  getCheckInQueuePatch,
  getCheckInResponseProgress,
  getStaleCheckInTargets,
  getTeamMemberStatusForCheckInResponse,
  inferCheckInType,
  shouldEscalateCheckInResponse,
} = loadTypeScriptModule('lib/dispatchCheckInAdapter.ts');

const {
  cancelQueuedDispatchPing,
  cancelQueuedDispatchQueueItem,
  isCancellableQueuedDispatchPing,
  isRetryableDispatchPing,
  isRetryableDispatchQueueItem,
  markDispatchPingDeliveryResult,
  markDispatchQueueItemDeliveryResult,
  markDispatchTimelineEventDeliveryResult,
  prepareDispatchPingRetry,
  prepareDispatchQueueItemRetry,
  prepareDispatchTimelineEventRetry,
  resolvePingDispatchReliability,
  resolveQueueDispatchReliability,
} = loadTypeScriptModule('lib/dispatchSyncAdapter.ts');

const {
  buildDispatchAuditEvent,
  createDispatchAuditLogPayload,
} = loadTypeScriptModule('lib/dispatchAuditAdapter.ts');

const {
  getDispatchNotificationPolicy,
} = loadTypeScriptModule('lib/dispatchNotificationAdapter.ts');

const {
  applyEscalationTransition,
  canAutoEscalate,
  getNextEscalationState,
  shouldSuggestEscalation,
} = loadTypeScriptModule('lib/dispatchEscalationAdapter.ts');

const {
  excludeSender,
  filterRecipientsByAvailability,
  filterRecipientsByRole,
  getDispatchRoutingOptions,
  resolveDispatchRecipients,
  validateDispatchTarget,
} = loadTypeScriptModule('lib/dispatchRoutingAdapter.ts');

const {
  getAssignmentLoadScore,
  getResponseReliabilityScore,
  getSuggestedDispatchAction,
  getSuggestedEscalationTarget,
  rankDispatchCandidates,
  scoreDispatchCandidate,
} = loadTypeScriptModule('lib/dispatchSuggestionAdapter.ts');

const {
  calculateCommunicationHealth,
  calculateDispatchMetrics,
  calculateEscalationPressure,
  calculateOfflineRisk,
  calculateTeamReadiness,
  getDispatchReadinessSummary,
} = loadTypeScriptModule('lib/dispatchMetricsAdapter.ts');

const {
  countActivePingsByMember,
  createDispatchRecordMap,
  getRecentDispatchTimelineEvents,
  groupDispatchQueueByAssignee,
} = loadTypeScriptModule('lib/dispatchPerformanceAdapter.ts');

const {
  canSubmitDispatchPing,
  getActionPermissionSet,
  getComposerPermissionSet,
  getQueuePermissionSet,
  getRosterPermissionSet,
  getTimelinePermissionSet,
  resolveDispatchPermissions,
} = loadTypeScriptModule('lib/dispatchPermissionAdapter.ts');

const {
  createDispatchEntityId,
  createDispatchIdempotencyKey,
  getIncomingDispatchConflictNotice,
  mergeDispatchAssignment,
  isDuplicateDispatchAction,
  mergeDispatchPing,
  mergeDispatchQueueItem,
  mergeDispatchTimelineEvent,
  rememberDispatchAction,
  shouldApplyIncomingDispatchEvent,
} = loadTypeScriptModule('lib/dispatchIntegrity.ts');

assert.deepStrictEqual(
  ['low', 'normal', 'high', 'critical'].map(getPriorityWeight),
  [1, 2, 3, 4],
  'Dispatch priority weights should remain ordered low to critical.',
);

assert.strictEqual(getCadEventTypeLabel('ai_advisory'), 'ECS Advisory');
assert.strictEqual(getCadPriorityLabel('critical'), 'Critical');
assert.strictEqual(getCadStatusLabel('queued'), 'Queued');
assert.strictEqual(
  MOCK_DISPATCH_CAD_EVENTS.length >= 6,
  true,
  'Deterministic mock CAD feed should include enough events for the compact feed.',
);
assert.strictEqual(
  MOCK_DISPATCH_CAD_EVENTS.some((event) => event.linkedContext?.type === 'resource' && /Delta|Glacier|battery-brand/i.test(`${event.title} ${event.summary}`)),
  false,
  'Mock CAD feed should avoid battery-brand-specific Dispatch entries.',
);
assert.strictEqual(
  MOCK_DISPATCH_CAD_EVENTS.every((event) => Array.isArray(event.metadata) === false && event.expeditionId && event.timestamp),
  true,
  'Mock CAD events should carry the required CAD payload fields.',
);
assert.strictEqual(
  MOCK_DISPATCH_CAD_EVENTS.every((event) => (
    !event.metadata?.targetMemberIds &&
    !event.metadata?.assignedMemberIds &&
    !event.metadata?.assigneeMemberId &&
    !event.metadata?.offlineMemberIds &&
    !event.metadata?.responseMemberId
  )),
  true,
  'Rendered mock CAD feed should not require roster, assignment, or individual-position metadata.',
);
const generatedAdvisoryKinds = generateDispatchAdvisories(MOCK_DISPATCH_ADVISORY_CONTEXT).map((advisory) => advisory.kind);
for (const advisoryKind of [
  'severe_weather',
  'high_wind',
  'low_water_refill',
  'fuel_remote_segment',
  'vehicle_telemetry',
  'hazard_terrain',
  'recovery_traction',
  'route_exposure',
]) {
  assert.strictEqual(
    generatedAdvisoryKinds.includes(advisoryKind),
    true,
    `Dispatch advisory engine should deterministically generate ${advisoryKind}.`,
  );
}
assert.strictEqual(
  MOCK_TOP_DISPATCH_ADVISORY?.id,
  getTopDispatchAdvisory(MOCK_DISPATCH_ADVISORIES)?.id,
  'Mock top advisory should come from the advisory scoring helper.',
);
assert.strictEqual(
  scoreDispatchAdvisory(MOCK_TOP_DISPATCH_ADVISORY) >= scoreDispatchAdvisory(MOCK_DISPATCH_ADVISORIES[MOCK_DISPATCH_ADVISORIES.length - 1]),
  true,
  'Dispatch advisories should sort by deterministic priority score.',
);
const advisoryCadEvent = createCadEventFromAdvisory(MOCK_TOP_DISPATCH_ADVISORY, MOCK_DISPATCH_ADVISORY_CONTEXT.now);
assert.strictEqual(advisoryCadEvent.type, 'ai_advisory', 'Advisory conversion should create CAD ECS advisory events.');
assert.strictEqual(advisoryCadEvent.expeditionId, MOCK_DISPATCH_ADVISORY_CONTEXT.expeditionId, 'Advisory CAD events should preserve expedition scope.');
assert.strictEqual(
  MOCK_DISPATCH_CAD_EVENTS.some((event) => event.type === 'ai_advisory' && event.metadata?.advisoryKind),
  true,
  'Critical generated advisories should be present in the CAD feed.',
);
assert.deepStrictEqual(
  getAdvisorySuggestedActions('vehicle_telemetry'),
  ['accept_suggestion', 'dismiss', 'create_ping', 'create_assist_request'],
  'Vehicle telemetry advisories should convert into team coordination actions without auto-sending.',
);
assert.strictEqual(
  explainDispatchAdvisory('route_exposure', { exposure: 'high', segmentName: 'North Spur Connector' }).includes('North Spur Connector'),
  true,
  'Advisory explanations should be deterministic and context-specific.',
);
assert.strictEqual(
  /nearest team member|assign person|team roster|role-based assignment|power station|Delta|Glacier/i.test(dispatchAdvisoryEngineSource),
  false,
  'Dispatch advisory engine should not use team-position, assignment, or brand-specific power logic.',
);
assert.strictEqual(
  /auto-send|auto-create emergency|external emergency/i.test(dispatchAdvisoryEngineSource),
  false,
  'Dispatch advisory engine should not auto-send pings or create external emergency actions.',
);
assert.strictEqual(
  dispatchTabSource.includes('DispatchCadCommandCenter') && !dispatchTabSource.includes('DispatchCommandCenter'),
  true,
  'Dispatch tab should render the CAD-first command center.',
);
assert.strictEqual(
  /DispatchTeamRosterSection|DispatchQueueSection|DispatchTeamPingComposer/.test(cadCommandCenterSource),
  false,
  'CAD command center should not require roster, assignment queue, or team ping render dependencies.',
);
assert.strictEqual(
  /targetMemberIds|assignedMemberIds|assigneeMemberId|selectedMember|memberSelector|roleSelector|availabilityBoard/i.test(cadCommandCenterSource),
  false,
  'CAD command center should not target individual members, assignments, roles, or availability boards.',
);
assert.strictEqual(
  cadCommandCenterSource.includes('Ping Team') &&
    cadCommandCenterSource.includes("sourceFromCommand(command: DispatchCommandType): DispatchEventSource") &&
    cadCommandCenterSource.includes("'team_member'"),
  true,
  'Ping Team should remain an Expedition Channel CAD ping without recipient selection.',
);
assert.strictEqual(
  cadCommandCenterSource.includes('FlatList') && !cadCommandCenterSource.includes('<ScrollView'),
  true,
  'CAD command center should use an internal feed list without page-level ScrollView rendering.',
);
for (const requiredLabel of ['Weather', 'Route', 'Terrain', 'Resources', 'Vehicle', 'Sync']) {
  assert.strictEqual(
    cadCommandCenterSource.includes(requiredLabel) || dispatchChannelStateSource.includes(requiredLabel),
    true,
    `Live data strip should include ${requiredLabel}.`,
  );
}
for (const requiredAction of ['Check In', 'Ping', 'Assist', 'Rally', 'More', 'Hazard', 'Resource', 'Recovery Assist']) {
  assert.strictEqual(
    cadCommandCenterSource.includes(requiredAction),
    true,
    `Command rail or More menu should include ${requiredAction}.`,
  );
}
for (const commandField of [
  'OK',
  'Delayed',
  'Need Assistance',
  'At Rally',
  'Returning',
  'Emergency',
  'Ping Team',
  'Check-In',
  'Require Acknowledgment',
  'Recovery',
  'Medical',
  'Navigation',
  'Fuel',
  'Water',
  'Mechanical',
  'Comms',
  'ECS team coordination only. This does not contact emergency services.',
  'Trail Blockage',
  'Water Crossing',
  'Visibility',
  'Recovery Gear',
  'General Supplies',
]) {
  assert.strictEqual(
    cadCommandCenterSource.includes(commandField),
    true,
    `Dispatch command modals should include ${commandField}.`,
  );
}
assert.strictEqual(
    cadCommandCenterSource.includes('createEventFromCommand') &&
    cadCommandCenterSource.includes('validateCommandForm') &&
    cadCommandCenterSource.includes('commandSubmittingRef') &&
    cadCommandCenterSource.includes("state: queued ? 'queued' : 'active'") &&
    cadCommandCenterSource.includes('normalizeDispatchEvent'),
  true,
  'Dispatch command modals should validate, prevent double submit, and create queued CAD events offline.',
);
assert.strictEqual(
  /createAssignment|assignedMemberIds|DispatchTeamRosterSection|DispatchQueueSection|TeamRoster|member position/i.test(cadCommandCenterSource),
  false,
  'Dispatch command modals should not create assignments, roster selectors, or team position UI.',
);
for (const detailAction of [
  'Acknowledge',
  'Add Note',
  'Add Update',
  'Send Follow-Up',
  'Mark Resolved',
  'Broadcast Hazard',
  'Dismiss',
  'Request Assist',
]) {
  assert.strictEqual(
    cadCommandCenterSource.includes(detailAction),
    true,
    `CAD detail modal should expose ${detailAction}.`,
  );
}
assert.strictEqual(
  cadCommandCenterSource.includes('handleEventAction') &&
    cadCommandCenterSource.includes('applyEventAction') &&
    cadCommandCenterSource.includes('setUiMetaById'),
  true,
  'CAD detail actions should update local CAD event state.',
);
assert.strictEqual(
  cadCommandCenterSource.includes('Comments / Notes') &&
    cadCommandCenterSource.includes('No local notes yet.'),
  true,
  'CAD detail modal should render comments or local notes.',
);
assert.strictEqual(
  /DispatchTeamRosterSection|Assignment selector|Assignment panel|member location|team position/i.test(cadCommandCenterSource),
  false,
  'CAD detail modal should not bring back roster, assignment, or team-position UI.',
);

const cadSortedIds = sortCadEvents([
  { id: 'resolved-critical-new', priority: 'critical', status: 'resolved', timestamp: '2026-04-24T19:10:00Z' },
  { id: 'normal-newer', priority: 'normal', status: 'new', timestamp: '2026-04-24T19:05:00Z' },
  { id: 'high-older', priority: 'high', status: 'active', timestamp: '2026-04-24T19:00:00Z' },
  { id: 'critical-oldest', priority: 'critical', status: 'queued', timestamp: '2026-04-24T18:55:00Z' },
]).map((event) => event.id);
assert.deepStrictEqual(
  cadSortedIds,
  ['critical-oldest', 'high-older', 'normal-newer', 'resolved-critical-new'],
  'CAD feed sorting should prioritize active critical events before timestamp and terminal events last.',
);

const cadPing = createCadEventFromPing(CAD_SOURCE_PINGS[1], {
  expeditionId: 'expedition-test',
  createdBy: 'Command',
});
assert.strictEqual(cadPing.type, 'hazard', 'Hazard pings should become hazard CAD events.');
assert.strictEqual(cadPing.priority, 'critical', 'Critical ping priority should survive CAD normalization.');
assert.strictEqual(cadPing.source, 'team_ping', 'Ping-derived CAD events should expose team_ping source.');

const cadCheckIn = createCadEventFromCheckIn({
  ping: { ...CAD_SOURCE_PINGS[0], type: 'check_in' },
  response: { memberId: 'member-scout', status: 'ok', respondedAt: '2026-04-24T19:01:00Z' },
  expeditionId: 'expedition-test',
});
assert.strictEqual(cadCheckIn.type, 'check_in', 'Check-in helper should create check-in CAD events.');
assert.strictEqual(cadCheckIn.status, 'acknowledged', 'Check-in responses should map to acknowledged CAD status.');

const cadAssist = createCadEventFromAssist({
  id: 'assist-test',
  assistType: 'comms',
  priority: 'critical',
  status: 'blocked',
  createdAt: '2026-04-24T19:02:00Z',
  createdByMemberId: 'member-command',
  targetMemberIds: ['member-tail'],
  linkedContext: MOCK_DISPATCH_CAD_CONTEXTS.rallyPoint,
  message: 'Relay tail status.',
  requireAcknowledgment: true,
  escalationState: 'recommended',
}, { expeditionId: 'expedition-test' });
assert.strictEqual(cadAssist.type, 'assist', 'Assist helper should create assist CAD events.');
assert.strictEqual(cadAssist.status, 'active', 'Open assist requests should remain active in CAD.');

const cadAdvisory = createCadEventFromAiAdvisory({
  id: 'ai-test',
  expeditionId: 'expedition-test',
  timestamp: '2026-04-24T19:03:00Z',
  title: 'Watch route',
  summary: 'Hold route until hazard clears.',
  linkedContext: MOCK_DISPATCH_CAD_CONTEXTS.routeSegment,
});
assert.strictEqual(cadAdvisory.type, 'ai_advisory', 'ECS helper should create advisory CAD events.');
assert.strictEqual(cadAdvisory.source, 'ai', 'ECS helper should preserve advisory source.');

assert.strictEqual(getPingStatusLabel('queued'), 'Queued for delivery');
assert.strictEqual(getPingStatusLabel('acknowledged'), 'Acknowledged');
assert.strictEqual(getPingStatusLabel('no_response'), 'No Response');
assert.strictEqual(getPingStatusLabel('recovered'), 'Recovered after reconnect');
assert.strictEqual(getDeliveryStateLabel('queued'), 'Queued for delivery');
assert.strictEqual(getDeliveryStateLabel('failed'), 'Delivery failed');
assert.strictEqual(getDispatchReliabilityLabel('retrying'), 'Retrying');
assert.strictEqual(getCheckInResponseLabel('need_assistance'), 'Need Assistance');
assert.strictEqual(getCheckInScheduleLabel('every_60'), 'Every 60 min');

const sortedIds = sortDispatchQueue([
  {
    id: 'resolved-critical',
    priority: 'critical',
    status: 'resolved',
    createdAt: '2026-04-24T18:00:00Z',
    updatedAt: '2026-04-24T19:00:00Z',
  },
  {
    id: 'normal-newest',
    priority: 'normal',
    status: 'new',
    createdAt: '2026-04-24T18:30:00Z',
    updatedAt: '2026-04-24T18:45:00Z',
  },
  {
    id: 'high-pending',
    priority: 'high',
    status: 'pending_response',
    deliveryState: 'sent',
    createdAt: '2026-04-24T18:20:00Z',
    updatedAt: '2026-04-24T18:35:00Z',
  },
  {
    id: 'normal-escalated',
    priority: 'normal',
    status: 'assigned',
    escalationState: 'broadcast_to_team',
    createdAt: '2026-04-24T18:25:00Z',
    updatedAt: '2026-04-24T18:34:00Z',
  },
  {
    id: 'critical-active',
    priority: 'critical',
    status: 'new',
    createdAt: '2026-04-24T18:10:00Z',
    updatedAt: '2026-04-24T18:31:00Z',
  },
]).map((item) => item.id);

assert.deepStrictEqual(
  sortedIds,
  ['critical-active', 'normal-escalated', 'high-pending', 'normal-newest', 'resolved-critical'],
  'Dispatch queue sorting should prioritize active critical, escalated, awaiting response, then resolved last.',
);

assert.ok(
  getEscalationRecommendation({
    priority: 'critical',
    status: 'pending_response',
    escalationState: 'none',
  }).includes('Escalate now'),
  'Critical queue items should recommend escalation.',
);

assert.ok(
  getEscalationRecommendation({
    priority: 'high',
    status: 'pending_response',
    escalationState: 'follow_up',
  }).includes('Follow-up required'),
  'Follow-up ladder state should produce follow-up guidance.',
);

assert.ok(
  getEscalationRecommendation({
    priority: 'critical',
    status: 'escalated',
    escalationState: 'emergency_unresolved',
  }).includes('Emergency coordination unresolved'),
  'Emergency unresolved ladder state should produce clear coordination guidance.',
);

assert.strictEqual(
  getNextEscalationState('follow_up', 'manual'),
  'escalate_to_lead',
  'Manual escalation should advance through the escalation ladder.',
);

const expiredAckPing = {
  id: 'ping-expired-check-in',
  type: 'check_in',
  priority: 'normal',
  status: 'sent',
  message: 'Confirm your current status.',
  createdAt: '2026-04-24T18:00:00Z',
  updatedAt: '2026-04-24T18:00:00Z',
  createdByMemberId: 'lead',
  targetMemberIds: ['scout'],
  acknowledgedByMemberIds: [],
  responseDueAt: '2026-04-24T18:05:00Z',
  escalationState: 'none',
};
const expiredAckDecision = shouldSuggestEscalation({
  ping: expiredAckPing,
  now: '2026-04-24T18:06:00Z',
});
assert.strictEqual(
  expiredAckDecision.shouldSuggest,
  true,
  'Expired acknowledgment timers should suggest escalation.',
);
assert.strictEqual(
  expiredAckDecision.canAutoEscalate,
  false,
  'Escalation suggestions should not auto-run without a safe scheduler.',
);
assert.strictEqual(
  canAutoEscalate({ decision: expiredAckDecision, safeTimerAvailable: false }),
  false,
  'Auto escalation should stay disabled when no safe timer is available.',
);

const blockedEscalationQueue = {
  id: 'queue-blocked-escalation',
  idempotencyKey: 'queue-blocked-escalation',
  version: 1,
  title: 'Assist blocked route',
  detail: 'Route support is blocked and needs lead review.',
  status: 'blocked',
  priority: 'high',
  createdAt: '2026-04-24T18:00:00Z',
  updatedAt: '2026-04-24T18:00:00Z',
  createdByMemberId: 'lead',
  assignedMemberIds: ['scout'],
  linkedContext: { id: 'route-1', type: 'route_segment', title: 'North Spur' },
  escalationState: 'none',
  deliveryState: 'sent',
  sourcePingId: expiredAckPing.id,
};
const blockedTransition = applyEscalationTransition({
  queueItem: blockedEscalationQueue,
  ping: expiredAckPing,
  now: '2026-04-24T18:07:00Z',
  actor: 'Dispatch',
  target: 'Scout',
  manual: true,
});
assert.strictEqual(blockedTransition.queueItem.status, 'escalated', 'Escalation transition should update queue status.');
assert.strictEqual(blockedTransition.ping.status, 'escalated', 'Escalation transition should update linked ping status.');
assert.strictEqual(
  blockedTransition.timelineEvent.detail.includes('ECS team coordination only.'),
  true,
  'Escalation timeline copy should include ECS safety scope.',
);

const availableIds = filterAvailableTeamMembers([
  { id: 'lead', status: 'connected' },
  { id: 'scout', status: 'on_route' },
  { id: 'tail', status: 'offline' },
  { id: 'muted', status: 'unavailable' },
  { id: 'emergency', status: 'emergency' },
]).map((member) => member.id);

assert.deepStrictEqual(
  availableIds,
  ['lead', 'scout'],
  'Available team filtering should exclude offline, unavailable, no-response, and emergency members.',
);

const memberPermissions = resolveDispatchPermissions({
  activeExpeditionStatus: 'active',
  currentMember: { id: 'member-1', role: 'member', status: 'connected' },
  soloMode: false,
});
assert.strictEqual(
  memberPermissions.can('create_assist_request').allowed,
  true,
  'Members should be allowed to create limited assist requests.',
);
assert.strictEqual(
  memberPermissions.can('send_individual_ping').allowed,
  true,
  'Members should be allowed to send individual Dispatch pings.',
);
assert.strictEqual(
  memberPermissions.can('resolve_queue_item').allowed,
  false,
  'Members should not be allowed to resolve Dispatch queue items.',
);
assert.strictEqual(
  canSubmitDispatchPing({
    recipientMode: 'all',
    pingType: 'general',
    priority: 'normal',
  }, memberPermissions).allowed,
  false,
  'Members should not be allowed to send team-wide Dispatch pings.',
);
assert.strictEqual(
  getComposerPermissionSet(memberPermissions).canTargetRoles,
  false,
  'Members should not be allowed to target role/group pings.',
);
assert.strictEqual(
  getRosterPermissionSet(memberPermissions).canViewMemberLocation,
  false,
  'Members should not see member location unless granted by role.',
);
assert.strictEqual(
  getRosterPermissionSet(memberPermissions).contactRestrictedReason,
  'Contact details are restricted.',
  'Roster permission set should expose contact privacy copy.',
);
assert.strictEqual(
  getTimelinePermissionSet(memberPermissions).canViewAuditHistory,
  false,
  'Members should not view Dispatch audit history by default.',
);

const viewerPermissions = resolveDispatchPermissions({
  activeExpeditionStatus: 'active',
  currentMember: { id: 'viewer-1', role: 'viewer', status: 'connected' },
  soloMode: false,
});
assert.strictEqual(
  getActionPermissionSet(viewerPermissions).canViewDispatch,
  true,
  'Viewers should be allowed to open Dispatch in read-only mode.',
);
assert.strictEqual(
  getActionPermissionSet(viewerPermissions).canOpenTeamPing,
  false,
  'Viewers should not see enabled Dispatch write actions.',
);
assert.strictEqual(
  viewerPermissions.can('view_member_location').reason,
  'Member location is restricted.',
  'Viewer location denial should use privacy-specific copy.',
);

const soloPermissions = resolveDispatchPermissions({
  activeExpeditionStatus: 'active',
  currentMember: { id: 'solo-1', role: 'owner', status: 'connected' },
  soloMode: true,
});
assert.strictEqual(
  soloPermissions.can('escalate_queue_item').allowed,
  true,
  'Solo Dispatch should keep local-only queue controls functional.',
);
assert.strictEqual(
  getQueuePermissionSet(soloPermissions).canCancel,
  true,
  'Solo Dispatch should allow local queue cancellation.',
);

const adminPermissions = resolveDispatchPermissions({
  activeExpeditionStatus: 'active',
  currentMember: { id: 'viewer-admin', role: 'viewer', status: 'connected' },
  operatorInfo: { role: 'admin', is_admin: true },
  soloMode: false,
});
assert.strictEqual(
  adminPermissions.can('send_emergency_ping').allowed,
  true,
  'Operator admins should retain full Dispatch control.',
);
assert.strictEqual(
  getTimelinePermissionSet(adminPermissions).canViewAuditHistory,
  true,
  'Operator admins should be allowed to view Dispatch audit history.',
);

const pingKey = createDispatchIdempotencyKey({
  expeditionId: 'expedition-alpha',
  entityType: 'ping',
  actionType: 'ping:check_in',
  actorMemberId: 'lead',
  targetMemberIds: ['scout', 'tail'],
  linkedContextId: 'waypoint-1',
  message: 'Confirm status.',
  priority: 'normal',
  timeBucket: '2026-04-24T18:30',
});
const pingKeyReordered = createDispatchIdempotencyKey({
  expeditionId: 'expedition-alpha',
  entityType: 'ping',
  actionType: 'ping:check_in',
  actorMemberId: 'lead',
  targetMemberIds: ['tail', 'scout'],
  linkedContextId: 'waypoint-1',
  message: '  Confirm   status. ',
  priority: 'normal',
  timeBucket: '2026-04-24T18:30',
});
assert.strictEqual(
  pingKey,
  pingKeyReordered,
  'Idempotency keys should be stable across target ordering and whitespace differences.',
);
assert.ok(
  createDispatchEntityId('ping', pingKey).startsWith('local-ping-'),
  'Stable Dispatch entity IDs should use the expected local prefix.',
);

const recentActions = new Map();
assert.strictEqual(
  rememberDispatchAction({ idempotencyKey: pingKey, recentActions, now: 1000 }),
  true,
  'The first local action should be accepted.',
);
assert.strictEqual(
  isDuplicateDispatchAction({ idempotencyKey: pingKey, recentActions, now: 1200 }),
  true,
  'A rapid duplicate action should be detected.',
);
assert.strictEqual(
  rememberDispatchAction({ idempotencyKey: pingKey, recentActions, now: 1200 }),
  false,
  'A rapid duplicate action should not be remembered as new.',
);

const mergedPings = mergeDispatchPing([
  {
    id: 'ping-1',
    idempotencyKey: pingKey,
    version: 1,
    type: 'check_in',
    priority: 'normal',
    status: 'sent',
    message: 'Confirm status.',
    createdAt: '2026-04-24T18:30:00Z',
    updatedAt: '2026-04-24T18:30:00Z',
    createdByMemberId: 'lead',
    targetMemberIds: ['scout', 'tail'],
    escalationState: 'none',
    acknowledgedByMemberIds: ['scout'],
  },
], {
  id: 'ping-duplicate',
  idempotencyKey: pingKey,
  version: 2,
  type: 'check_in',
  priority: 'normal',
  status: 'acknowledged',
  message: 'Confirm status.',
  createdAt: '2026-04-24T18:30:00Z',
  updatedAt: '2026-04-24T18:31:00Z',
  createdByMemberId: 'lead',
  targetMemberIds: ['scout', 'tail'],
  escalationState: 'none',
  acknowledgedByMemberIds: ['tail'],
});
assert.strictEqual(mergedPings.length, 1, 'Duplicate pings should merge by idempotency key.');
assert.deepStrictEqual(
  mergedPings[0].acknowledgedByMemberIds,
  ['scout', 'tail'],
  'Merged pings should preserve acknowledged member IDs.',
);

const checkInPing = {
  id: 'ping-check-in-response',
  idempotencyKey: 'ping-check-in-response',
  version: 1,
  type: 'check_in',
  priority: 'normal',
  status: 'sent',
  message: 'Confirm your current status.',
  createdAt: '2026-04-24T18:30:00Z',
  updatedAt: '2026-04-24T18:30:00Z',
  createdByMemberId: 'lead',
  targetMemberIds: ['scout', 'tail'],
  escalationState: 'none',
  requiresAcknowledgment: true,
  checkInType: 'manual',
  checkInResponses: [],
};
const scoutCheckInResponse = applyCheckInResponse({
  ping: checkInPing,
  memberId: 'scout',
  responseStatus: 'ok',
  respondedAt: '2026-04-24T18:35:00Z',
});
assert.deepStrictEqual(
  scoutCheckInResponse.acknowledgedByMemberIds,
  ['scout'],
  'Check-in responses should acknowledge the responding member.',
);
assert.strictEqual(
  getCheckInResponseProgress(scoutCheckInResponse).complete,
  false,
  'Partial check-in responses should keep the ping awaiting the rest of the team.',
);
const tailEmergencyResponse = applyCheckInResponse({
  ping: scoutCheckInResponse,
  memberId: 'tail',
  responseStatus: 'emergency',
  respondedAt: '2026-04-24T18:36:00Z',
});
assert.strictEqual(tailEmergencyResponse.status, 'escalated', 'Emergency check-in responses should escalate the ping.');
assert.strictEqual(tailEmergencyResponse.priority, 'critical', 'Emergency check-in responses should become critical.');
assert.strictEqual(
  shouldEscalateCheckInResponse('need_assistance'),
  true,
  'Need-assistance check-in responses should enter the escalation path.',
);
assert.strictEqual(
  getTeamMemberStatusForCheckInResponse('at_waypoint'),
  'at_waypoint',
  'Waypoint check-in responses should update member status toward waypoint state.',
);
assert.strictEqual(
  inferCheckInType({ linkedContext: { id: 'waypoint-1', type: 'waypoint', title: 'Waypoint 1' } }),
  'waypoint',
  'Waypoint-linked check-ins should be classified as waypoint check-ins.',
);
assert.deepStrictEqual(
  getStaleCheckInTargets([
    { id: 'fresh', status: 'connected' },
    { id: 'offline', status: 'offline' },
    { id: 'missing', status: 'no_response' },
  ]).map((member) => member.id),
  ['offline', 'missing'],
  'Stale check-in targeting should include offline and no-response members.',
);
const checkInQueuePatch = getCheckInQueuePatch({
  queueItem: {
    id: 'queue-check-in',
    title: 'Team check-in follow-up',
    detail: 'Confirm your current status.',
    status: 'pending_response',
    priority: 'normal',
    createdAt: '2026-04-24T18:30:00Z',
    updatedAt: '2026-04-24T18:30:00Z',
    createdByMemberId: 'lead',
    assignedMemberIds: ['scout', 'tail'],
    linkedContext: { id: 'expedition-alpha', type: 'expedition', title: 'Alpha' },
    escalationState: 'none',
    deliveryState: 'sent',
    sourcePingId: checkInPing.id,
  },
  ping: tailEmergencyResponse,
  responseStatus: 'emergency',
  respondedAt: '2026-04-24T18:36:00Z',
});
assert.strictEqual(checkInQueuePatch.status, 'escalated', 'Emergency check-in queue patch should escalate the queue item.');
assert.strictEqual(checkInQueuePatch.priority, 'critical', 'Emergency check-in queue patch should promote priority.');

const queueKey = createDispatchIdempotencyKey({
  expeditionId: 'expedition-alpha',
  entityType: 'queue_item',
  actionType: 'queue-for-ping:check_in',
  sourceEntityId: 'ping-1',
});
const mergedQueue = mergeDispatchQueueItem([
  {
    id: 'queue-1',
    idempotencyKey: queueKey,
    version: 1,
    title: 'Check-In',
    detail: 'Confirm status.',
    status: 'pending_response',
    priority: 'normal',
    createdAt: '2026-04-24T18:30:00Z',
    updatedAt: '2026-04-24T18:30:00Z',
    createdByMemberId: 'lead',
    assignedMemberIds: ['scout'],
    linkedContext: { id: 'expedition-alpha', type: 'expedition', title: 'Alpha' },
    escalationState: 'none',
    deliveryState: 'queued',
  },
], {
  id: 'queue-duplicate',
  idempotencyKey: queueKey,
  version: 2,
  title: 'Check-In',
  detail: 'Confirm status.',
  status: 'assigned',
  priority: 'normal',
  createdAt: '2026-04-24T18:30:00Z',
  updatedAt: '2026-04-24T18:32:00Z',
  createdByMemberId: 'lead',
  assignedMemberIds: ['scout'],
  linkedContext: { id: 'expedition-alpha', type: 'expedition', title: 'Alpha' },
  escalationState: 'none',
  deliveryState: 'recovered',
});
assert.strictEqual(mergedQueue.length, 1, 'Duplicate queue items should merge by idempotency key.');
assert.strictEqual(mergedQueue[0].status, 'assigned');

const timelineKey = createDispatchIdempotencyKey({
  expeditionId: 'expedition-alpha',
  entityType: 'timeline_event',
  actionType: 'ping_created',
  sourceEntityId: 'ping-1',
});
const mergedTimeline = mergeDispatchTimelineEvent([
  {
    id: 'timeline-1',
    idempotencyKey: timelineKey,
    version: 1,
    type: 'ping_created',
    title: 'Check-In ping sent',
    detail: 'Confirm status.',
    occurredAt: '2026-04-24T18:30:00Z',
    priority: 'normal',
    memberIds: ['scout'],
    pingId: 'ping-1',
  },
], {
  id: 'timeline-echo',
  idempotencyKey: timelineKey,
  version: 1,
  type: 'ping_created',
  title: 'Check-In ping sent',
  detail: 'Confirm status.',
  occurredAt: '2026-04-24T18:30:00Z',
  priority: 'normal',
  memberIds: ['scout'],
  pingId: 'ping-1',
});
assert.strictEqual(mergedTimeline.length, 1, 'Realtime echo timeline events should not duplicate.');
const auditEvent = buildDispatchAuditEvent({
  expeditionId: 'expedition-alpha',
  actor: {
    memberId: 'member-secret-123',
    displayName: 'Lead Operator',
    role: 'owner',
  },
  timelineEvent: {
    ...mergedTimeline[0],
    linkedContext: {
      id: 'pin-raw-sensitive',
      type: 'pin',
      title: 'Ridge Rally 38.123456 -119.987654',
    },
  },
});
assert.strictEqual(auditEvent.expeditionId, 'expedition-alpha', 'Audit events should include expedition scope.');
assert.strictEqual(auditEvent.eventType, 'team_ping_created', 'Ping timeline events should build Team Ping audit events.');
assert.ok(
  auditEvent.actor.memberId.startsWith('ref_') && auditEvent.actor.memberId !== 'member-secret-123',
  'Audit actor member IDs should be privacy-safe references.',
);
assert.ok(
  auditEvent.linkedContext?.reference.startsWith('ref_') && auditEvent.linkedContext.reference !== 'pin:pin-raw-sensitive',
  'Linked context audit references should not expose raw IDs.',
);
assert.ok(
  !auditEvent.linkedContext?.label.includes('38.123456'),
  'Audit linked context labels should redact coordinate-like precision.',
);
const auditPayload = createDispatchAuditLogPayload(auditEvent);
assert.strictEqual(auditPayload.source, 'dispatch', 'Audit log payloads should be source-scoped.');
assert.strictEqual(auditPayload.safetyScope, 'ecs_team_coordination_only', 'Dispatch audit scope should be explicit.');
const failedTimelineEvent = {
  ...mergedTimeline[0],
  deliveryState: 'failed',
  version: 2,
};
const retryingTimelineEvent = prepareDispatchTimelineEventRetry(failedTimelineEvent, { isDeliverable: true });
assert.strictEqual(
  retryingTimelineEvent.deliveryState,
  'retrying',
  'Failed timeline events should enter retrying before replay.',
);
assert.strictEqual(
  markDispatchTimelineEventDeliveryResult(retryingTimelineEvent, true).deliveryState,
  'recovered',
  'Successful timeline retry should mark recovered.',
);

assert.strictEqual(
  shouldApplyIncomingDispatchEvent({
    id: 'rt-1',
    expeditionId: 'expedition-alpha',
    originClientId: 'other-client',
    occurredAt: '2026-04-24T18:32:00Z',
    type: 'queue_item_upsert',
    queueItem: mergedQueue[0],
  }, { queueItems: mergedQueue }),
  false,
  'Incoming realtime queue events should be ignored when they are not newer.',
);

const escalatedQueue = {
  id: 'queue-conflict',
  idempotencyKey: 'queue-conflict-key',
  version: 3,
  title: 'Hazard confirmation',
  detail: 'Confirm washout status.',
  status: 'escalated',
  priority: 'critical',
  createdAt: '2026-04-24T18:00:00Z',
  updatedAt: '2026-04-24T18:40:00Z',
  createdByMemberId: 'lead',
  assignedMemberIds: ['scout'],
  linkedContext: { id: 'pin-hazard', type: 'pin', title: 'Washout Pin' },
  escalationState: 'broadcast_to_team',
  deliveryState: 'escalated',
};
const staleOfflineResolution = {
  ...escalatedQueue,
  version: 2,
  status: 'resolved',
  priority: 'normal',
  updatedAt: '2026-04-24T18:35:00Z',
  escalationState: 'recovered',
  deliveryState: 'sent',
};
const protectedEscalation = mergeDispatchQueueItem([escalatedQueue], staleOfflineResolution)[0];
assert.strictEqual(
  protectedEscalation.status,
  'escalated',
  'Older offline resolution should not overwrite a newer critical escalation.',
);
assert.strictEqual(
  protectedEscalation.priority,
  'critical',
  'Critical priority should be preserved across conflicting queue merges.',
);
assert.strictEqual(
  protectedEscalation.conflictState,
  'needs_review',
  'Escalation/resolution conflicts should be marked for review.',
);

const resolvedQueue = {
  ...escalatedQueue,
  version: 4,
  status: 'resolved',
  updatedAt: '2026-04-24T18:50:00Z',
  escalationState: 'recovered',
  deliveryState: 'sent',
};
const olderInProgress = {
  ...escalatedQueue,
  version: 3,
  status: 'in_progress',
  updatedAt: '2026-04-24T18:45:00Z',
  escalationState: 'none',
  deliveryState: 'sent',
};
assert.strictEqual(
  mergeDispatchQueueItem([resolvedQueue], olderInProgress)[0].status,
  'resolved',
  'Resolved queue state should win over older in-progress updates.',
);

const priorityOnlyUpdate = {
  ...mergedQueue[0],
  version: 3,
  status: 'assigned',
  priority: 'critical',
  updatedAt: '2026-04-24T18:33:00Z',
};
assert.strictEqual(
  mergeDispatchQueueItem([mergedQueue[0]], priorityOnlyUpdate)[0].priority,
  'critical',
  'Concurrent priority updates should preserve the stronger Dispatch priority.',
);

const failedQueueItem = {
  ...mergedQueue[0],
  deliveryState: 'failed',
  reliabilityState: 'failed',
};
assert.strictEqual(isRetryableDispatchQueueItem(failedQueueItem), true, 'Failed queue updates should be retryable.');
const retryingQueueItem = prepareDispatchQueueItemRetry(failedQueueItem, {
  isDeliverable: true,
  now: '2026-04-24T18:45:00Z',
});
assert.strictEqual(retryingQueueItem.deliveryState, 'retrying', 'Deliverable queue retry should enter retrying state.');
assert.strictEqual(retryingQueueItem.id, failedQueueItem.id, 'Queue retry should preserve queue item ID.');
assert.strictEqual(
  markDispatchQueueItemDeliveryResult(retryingQueueItem, false, '2026-04-24T18:46:00Z').deliveryState,
  'failed',
  'Failed queue retry should remain visibly failed.',
);
assert.strictEqual(
  cancelQueuedDispatchQueueItem({ ...failedQueueItem, deliveryState: 'queued' }, '2026-04-24T18:47:00Z').deliveryState,
  'cancelled',
  'Queued queue update cancellation should mark cancelled before delivery.',
);

const escalatedPing = {
  ...mergedPings[0],
  status: 'escalated',
  escalationState: 'broadcast_to_team',
  priority: 'critical',
  version: 3,
  updatedAt: '2026-04-24T18:40:00Z',
};
const lateAck = {
  ...mergedPings[0],
  status: 'acknowledged',
  escalationState: 'none',
  priority: 'normal',
  version: 2,
  updatedAt: '2026-04-24T18:39:00Z',
  acknowledgedByMemberIds: ['tail'],
};
const acknowledgedEscalation = mergeDispatchPing([escalatedPing], lateAck)[0];
assert.strictEqual(
  acknowledgedEscalation.status,
  'escalated',
  'Acknowledging an already escalated ping should not clear escalation state.',
);
assert.deepStrictEqual(
  acknowledgedEscalation.acknowledgedByMemberIds,
  ['scout', 'tail'],
  'Late acknowledgments should remain valid even after escalation.',
);

const failedPing = {
  ...mergedPings[0],
  status: 'failed',
  reliabilityState: 'failed',
  version: 3,
  updatedAt: '2026-04-24T18:41:00Z',
};
assert.strictEqual(isRetryableDispatchPing(failedPing), true, 'Failed pings should be retryable.');
const retryingPing = prepareDispatchPingRetry(failedPing, {
  isDeliverable: true,
  now: '2026-04-24T18:42:00Z',
});
assert.strictEqual(retryingPing.status, 'retrying', 'Deliverable retry should enter retrying state.');
assert.strictEqual(retryingPing.id, failedPing.id, 'Retry should preserve ping ID.');
assert.strictEqual(retryingPing.idempotencyKey, failedPing.idempotencyKey, 'Retry should preserve ping idempotency key.');
assert.strictEqual(
  markDispatchPingDeliveryResult(retryingPing, true, '2026-04-24T18:43:00Z').reliabilityState,
  'recovered',
  'Successful retry should recover ping delivery.',
);
const queuedPing = {
  ...mergedPings[0],
  status: 'queued',
  reliabilityState: 'queued',
};
assert.strictEqual(isCancellableQueuedDispatchPing(queuedPing), true, 'Queued pings should be cancellable.');
assert.strictEqual(
  cancelQueuedDispatchPing(queuedPing, '2026-04-24T18:44:00Z').status,
  'cancelled',
  'Queued ping cancellation should mark cancelled before delivery.',
);
assert.strictEqual(
  resolvePingDispatchReliability(failedPing, { state: 'live', label: 'Live', detail: '', isDeliverable: true, queuedCount: 0, dirtyCount: 0 }, []),
  'failed',
  'Failed ping reliability should stay failed until retry succeeds.',
);
assert.strictEqual(
  resolveQueueDispatchReliability(retryingQueueItem, undefined, { state: 'live', label: 'Live', detail: '', isDeliverable: true, queuedCount: 0, dirtyCount: 0 }, []),
  'retrying',
  'Retrying queue reliability should be visible to the UI.',
);

const assignmentConflict = mergeDispatchAssignment([
  {
    id: 'assignment-1',
    idempotencyKey: 'assignment-1',
    queueItemId: 'queue-conflict',
    assigneeMemberId: 'scout',
    status: 'offered',
    assignedAt: '2026-04-24T18:30:00Z',
    updatedAt: '2026-04-24T18:30:00Z',
  },
], {
  id: 'assignment-1',
  idempotencyKey: 'assignment-1',
  queueItemId: 'queue-conflict',
  assigneeMemberId: 'tail',
  status: 'offered',
  assignedAt: '2026-04-24T18:30:00Z',
  updatedAt: '2026-04-24T18:45:00Z',
});
assert.strictEqual(
  assignmentConflict[0].assigneeMemberId,
  'tail',
  'Assignment conflict resolution should keep the latest valid assignee.',
);
assert.strictEqual(
  assignmentConflict[0].conflictState,
  'updated_during_sync',
  'Assignment target changes should be visible as sync updates.',
);

assert.strictEqual(
  getIncomingDispatchConflictNotice({
    id: 'rt-conflict',
    expeditionId: 'expedition-alpha',
    originClientId: 'other-client',
    occurredAt: '2026-04-24T18:41:00Z',
    type: 'queue_item_upsert',
    queueItem: staleOfflineResolution,
  }, { queueItems: [escalatedQueue] }),
  'Dispatch item updated during sync.',
  'Realtime conflict notices should be available for non-blocking UI feedback.',
);

const notificationMembers = [
  { id: 'lead', displayName: 'Lead', callSign: 'Lead', role: 'owner', status: 'connected' },
  { id: 'scout', displayName: 'Scout', callSign: 'Scout', role: 'member', status: 'on_route' },
  { id: 'tail', displayName: 'Tail', callSign: 'Tail', role: 'member', status: 'unavailable' },
];
const routedScout = resolveDispatchRecipients({
  selection: { recipientMode: 'role', role: 'scout' },
  members: notificationMembers,
  senderMemberId: 'lead',
  excludeSender: true,
});
assert.deepStrictEqual(
  routedScout.recipientIds,
  ['scout'],
  'Dispatch role routing should resolve scout targets from existing call sign/member data.',
);
assert.deepStrictEqual(
  excludeSender(notificationMembers, 'lead').map((member) => member.id),
  ['scout', 'tail'],
  'Dispatch routing should support sender exclusion.',
);
assert.deepStrictEqual(
  filterRecipientsByAvailability(notificationMembers).map((member) => member.id),
  ['lead', 'scout'],
  'Availability filtering should avoid unavailable recipients for normal routing.',
);
assert.deepStrictEqual(
  filterRecipientsByRole(notificationMembers, 'commander_owner').map((member) => member.id),
  ['lead'],
  'Commander/owner routing should map to expedition owners.',
);
assert.strictEqual(
  getDispatchRoutingOptions(notificationMembers).some((option) => option.id === 'scout' && option.count === 1),
  true,
  'Routing options should expose role/group counts for composer warnings.',
);
assert.strictEqual(
  validateDispatchTarget({
    selection: { recipientMode: 'role', role: 'mechanic' },
    recipientIds: [],
  }).valid,
  false,
  'Empty role groups should validate with a warning instead of silently sending.',
);
const suggestionQueue = {
  id: 'queue-suggestion-route',
  title: 'Scout route hazard',
  detail: 'Verify route hazard and report passability.',
  status: 'new',
  priority: 'high',
  createdAt: '2026-04-24T19:10:00Z',
  updatedAt: '2026-04-24T19:10:00Z',
  createdByMemberId: 'lead',
  assignedMemberIds: [],
  linkedContext: { id: 'route-1', type: 'route_segment', title: 'North Spur' },
  escalationState: 'none',
  deliveryState: 'draft',
  tags: ['route', 'hazard'],
};
const suggestionPings = [
  {
    id: 'ping-scout-ack',
    type: 'route',
    priority: 'normal',
    status: 'acknowledged',
    message: 'Route check.',
    createdAt: '2026-04-24T19:00:00Z',
    updatedAt: '2026-04-24T19:00:00Z',
    createdByMemberId: 'lead',
    targetMemberIds: ['scout'],
    acknowledgedByMemberIds: ['scout'],
    escalationState: 'none',
  },
];
assert.strictEqual(
  getAssignmentLoadScore(notificationMembers[1], suggestionQueue) > 0,
  true,
  'Assignment load score should favor an unassigned available member.',
);
assert.strictEqual(
  getResponseReliabilityScore(notificationMembers[1], suggestionPings) > 0,
  true,
  'Response reliability score should reward acknowledged pings.',
);
const scoutScore = scoreDispatchCandidate({
  member: notificationMembers[1],
  queueItem: suggestionQueue,
  pings: suggestionPings,
  canViewLocation: false,
});
assert.strictEqual(
  scoutScore.reasons.some((reason) => reason.includes('matching scout role')),
  true,
  'Candidate scoring should explain role matching.',
);
assert.strictEqual(
  rankDispatchCandidates({
    queueItem: suggestionQueue,
    members: notificationMembers,
    pings: suggestionPings,
    canViewLocation: false,
  })[0].member.id,
  'scout',
  'Candidate ranking should deterministically place the best matching member first.',
);
const smartSuggestions = getSuggestedDispatchAction({
  queueItem: suggestionQueue,
  members: notificationMembers,
  pings: suggestionPings,
  canViewLocation: false,
});
assert.strictEqual(
  smartSuggestions.some((suggestion) => suggestion.type === 'best_member' && suggestion.memberId === 'scout'),
  true,
  'Smart suggestions should include best member assignment advice.',
);
assert.strictEqual(
  smartSuggestions.some((suggestion) => suggestion.type === 'route_check'),
  true,
  'Smart suggestions should include route checks for route-linked items.',
);
assert.strictEqual(
  getSuggestedEscalationTarget({
    queueItem: { ...suggestionQueue, priority: 'critical', escalationState: 'follow_up' },
    members: notificationMembers,
    pings: suggestionPings,
  })?.memberId,
  'lead',
  'Escalation suggestions should target commander/owner members.',
);
const metrics = calculateDispatchMetrics({
  pings: [
    {
      id: 'ping-metrics-check-in',
      type: 'check_in',
      priority: 'normal',
      status: 'acknowledged',
      message: 'Confirm status.',
      createdAt: '2026-04-24T19:00:00Z',
      updatedAt: '2026-04-24T19:05:00Z',
      createdByMemberId: 'lead',
      targetMemberIds: ['scout'],
      acknowledgedByMemberIds: ['scout'],
      escalationState: 'none',
      checkInResponses: [
        { memberId: 'scout', status: 'ok', respondedAt: '2026-04-24T19:05:00Z' },
      ],
    },
    {
      id: 'ping-metrics-awaiting',
      type: 'assist',
      priority: 'critical',
      status: 'sent',
      message: 'Assist request.',
      createdAt: '2026-04-24T19:01:00Z',
      updatedAt: '2026-04-24T19:01:00Z',
      createdByMemberId: 'lead',
      targetMemberIds: ['scout'],
      escalationState: 'recommended',
    },
  ],
  queueItems: [
    {
      ...suggestionQueue,
      id: 'queue-metrics-route',
      status: 'pending_response',
      deliveryState: 'queued',
    },
    {
      id: 'queue-metrics-assist',
      title: 'Assist tail',
      detail: 'Assist request unresolved.',
      status: 'blocked',
      priority: 'critical',
      createdAt: '2026-04-24T19:05:00Z',
      updatedAt: '2026-04-24T19:06:00Z',
      createdByMemberId: 'lead',
      assignedMemberIds: ['scout'],
      linkedContext: { id: 'pin-1', type: 'pin', title: 'Rally' },
      escalationState: 'recommended',
      deliveryState: 'failed',
      tags: ['assist'],
    },
    {
      id: 'queue-metrics-resolved',
      title: 'Power check',
      detail: 'Resolved power check.',
      status: 'resolved',
      priority: 'normal',
      createdAt: '2026-04-24T18:00:00Z',
      updatedAt: '2026-04-24T18:05:00Z',
      createdByMemberId: 'lead',
      assignedMemberIds: ['lead'],
      linkedContext: { id: 'power-1', type: 'power', title: 'Power' },
      escalationState: 'recovered',
      deliveryState: 'delivered',
      tags: ['resource', 'power'],
    },
  ],
  teamMembers: [
    ...notificationMembers,
    { id: 'missing', displayName: 'Missing', callSign: 'Missing', role: 'member', status: 'no_response' },
  ],
  timelineEvents: [
    { id: 'timeline-failed', type: 'sync', title: 'Failed', detail: 'Failed delivery.', occurredAt: '2026-04-24T19:06:00Z', priority: 'high', memberIds: ['scout'], deliveryState: 'failed' },
  ],
});
assert.strictEqual(metrics.activeQueueItems, 2, 'Dispatch metrics should count active queue items.');
assert.strictEqual(metrics.awaitingResponses, 3, 'Dispatch metrics should count awaiting ping and queue responses.');
assert.strictEqual(metrics.averageAcknowledgmentMinutes, 5, 'Dispatch metrics should calculate average acknowledgment minutes from response data.');
assert.strictEqual(metrics.unresolvedAssistRequests, 1, 'Dispatch metrics should count unresolved assist requests.');
assert.strictEqual(metrics.resourceCheckRequests, 1, 'Dispatch metrics should count resource/power check requests.');
assert.strictEqual(metrics.routeCheckRequests, 1, 'Dispatch metrics should count route check requests.');
assert.strictEqual(metrics.resolvedQueueItems, 1, 'Dispatch metrics should count resolved queue items.');
assert.strictEqual(metrics.criticalOpenItems, 1, 'Dispatch metrics should count critical open items.');
assert.strictEqual(
  calculateTeamReadiness({ availableMembers: 2, totalMembers: 4, offlineStaleMembers: 1 }) > 0,
  true,
  'Team readiness should produce a bounded readiness score.',
);
assert.strictEqual(
  calculateCommunicationHealth({ awaitingResponses: 1, failedQueuedDeliveries: 0, averageAcknowledgmentMinutes: 5 }) < 100,
  true,
  'Communication health should account for awaiting responses and ack time.',
);
assert.strictEqual(
  calculateOfflineRisk({ offlineStaleMembers: 2, totalMembers: 4, failedQueuedDeliveries: 1 }) > 0,
  true,
  'Offline risk should increase with stale members and failed delivery.',
);
assert.strictEqual(
  calculateEscalationPressure({ escalations: 1, criticalOpenItems: 1, activeQueueItems: 2 }) > 0,
  true,
  'Escalation pressure should increase with active escalation and critical work.',
);
assert.ok(
  getDispatchReadinessSummary(metrics).communicationHealthLabel.length > 0,
  'Readiness summary should provide compact labels for UI display.',
);
const performanceQueueItems = [
  {
    id: 'queue-performance-1',
    title: 'Scout north spur',
    detail: 'Confirm route segment.',
    status: 'assigned',
    priority: 'high',
    createdAt: '2026-04-24T19:00:00Z',
    updatedAt: '2026-04-24T19:00:00Z',
    createdByMemberId: 'lead',
    assignedMemberIds: ['scout', 'tail'],
    linkedContext: { id: 'route-1', type: 'route_segment', title: 'North Spur' },
    escalationState: 'none',
    deliveryState: 'sent',
  },
  {
    id: 'queue-performance-2',
    title: 'Fuel check',
    detail: 'Confirm fuel reserve.',
    status: 'new',
    priority: 'normal',
    createdAt: '2026-04-24T19:05:00Z',
    updatedAt: '2026-04-24T19:05:00Z',
    createdByMemberId: 'lead',
    assignedMemberIds: ['tail'],
    linkedContext: { id: 'resource-1', type: 'resource', title: 'Fuel' },
    escalationState: 'none',
    deliveryState: 'draft',
  },
];
assert.strictEqual(
  createDispatchRecordMap(performanceQueueItems).get('queue-performance-2')?.title,
  'Fuel check',
  'Dispatch performance maps should provide stable O(1) record lookup by ID.',
);
assert.deepStrictEqual(
  groupDispatchQueueByAssignee(performanceQueueItems).get('tail')?.map((item) => item.id),
  ['queue-performance-1', 'queue-performance-2'],
  'Dispatch queue grouping should preserve all items assigned to a member.',
);
assert.strictEqual(
  countActivePingsByMember([
    {
      id: 'ping-performance-active',
      type: 'check_in',
      priority: 'normal',
      status: 'sent',
      message: 'Confirm status.',
      createdAt: '2026-04-24T19:00:00Z',
      updatedAt: '2026-04-24T19:00:00Z',
      createdByMemberId: 'lead',
      targetMemberIds: ['scout', 'tail'],
      escalationState: 'none',
    },
    {
      id: 'ping-performance-done',
      type: 'general',
      priority: 'normal',
      status: 'acknowledged',
      message: 'Copy.',
      createdAt: '2026-04-24T19:01:00Z',
      updatedAt: '2026-04-24T19:02:00Z',
      createdByMemberId: 'lead',
      targetMemberIds: ['tail'],
      escalationState: 'none',
    },
  ]).get('tail'),
  1,
  'Active ping counting should avoid full per-member scans and ignore completed pings.',
);
assert.deepStrictEqual(
  getRecentDispatchTimelineEvents([
    { id: 'timeline-old', type: 'ping', title: 'Old', detail: 'Old event.', occurredAt: '2026-04-24T19:00:00Z', priority: 'normal', memberIds: [] },
    { id: 'timeline-new', type: 'queue', title: 'New', detail: 'New event.', occurredAt: '2026-04-24T19:10:00Z', priority: 'high', memberIds: [] },
    { id: 'timeline-mid', type: 'sync', title: 'Mid', detail: 'Mid event.', occurredAt: '2026-04-24T19:05:00Z', priority: 'normal', memberIds: [] },
  ], 2).map((event) => event.id),
  ['timeline-new', 'timeline-mid'],
  'Recent timeline helper should return the newest bounded event window without requiring callers to sort the full log.',
);
const routePingNotificationEvent = {
  id: 'rt-notify-1',
  expeditionId: 'expedition-alpha',
  originClientId: 'client-lead',
  occurredAt: '2026-04-24T19:00:00Z',
  type: 'ping_upsert',
  ping: {
    id: 'ping-notify-1',
    idempotencyKey: 'ping-notify-1',
    type: 'route',
    priority: 'normal',
    status: 'sent',
    message: 'Confirm route condition.',
    createdAt: '2026-04-24T19:00:00Z',
    updatedAt: '2026-04-24T19:00:00Z',
    createdByMemberId: 'lead',
    targetMemberIds: ['scout'],
    escalationState: 'none',
  },
};
const pingNotificationPolicy = getDispatchNotificationPolicy({
  event: routePingNotificationEvent,
  currentUserId: 'scout',
  teamMembers: notificationMembers,
  expeditionSource: 'local',
});
assert.strictEqual(pingNotificationPolicy.shouldNotify, true, 'Route pings should notify the selected active recipient.');
assert.ok(
  pingNotificationPolicy.message.includes('Route check request'),
  'Route ping notifications should use route-check copy.',
);
assert.strictEqual(
  getDispatchNotificationPolicy({
    event: routePingNotificationEvent,
    currentUserId: 'lead',
    teamMembers: notificationMembers,
    expeditionSource: 'local',
  }).shouldNotify,
  false,
  'Dispatch notifications should not notify the sender.',
);
assert.strictEqual(
  getDispatchNotificationPolicy({
    event: {
      id: 'rt-notify-2',
      expeditionId: 'expedition-alpha',
      originClientId: 'client-lead',
      occurredAt: '2026-04-24T19:01:00Z',
      type: 'ping_upsert',
      ping: {
        id: 'ping-notify-2',
        idempotencyKey: 'ping-notify-2',
        type: 'general',
        priority: 'normal',
        status: 'sent',
        message: 'Dispatch update.',
        createdAt: '2026-04-24T19:01:00Z',
        updatedAt: '2026-04-24T19:01:00Z',
        createdByMemberId: 'lead',
        targetMemberIds: ['tail'],
        escalationState: 'none',
      },
    },
    currentUserId: 'tail',
    teamMembers: notificationMembers,
    expeditionSource: 'local',
  }).shouldNotify,
  false,
  'Unavailable recipients should not receive Dispatch notifications.',
);
assert.strictEqual(
  getDispatchNotificationPolicy({
    event: {
      id: 'rt-notify-3',
      expeditionId: 'expedition-alpha',
      originClientId: 'client-lead',
      occurredAt: '2026-04-24T19:02:00Z',
      type: 'ping_upsert',
      ping: {
        id: 'ping-notify-3',
        idempotencyKey: 'ping-notify-3',
        type: 'emergency',
        priority: 'critical',
        status: 'sent',
        message: 'Immediate attention required.',
        createdAt: '2026-04-24T19:02:00Z',
        updatedAt: '2026-04-24T19:02:00Z',
        createdByMemberId: 'lead',
        targetMemberIds: ['scout'],
        escalationState: 'recommended',
      },
    },
    currentUserId: 'scout',
    teamMembers: notificationMembers,
    expeditionSource: 'local',
  }).message.includes('ECS team coordination only.'),
  true,
  'Emergency notification copy should include ECS team coordination safety language.',
);
assert.strictEqual(
  getDispatchNotificationPolicy({
    event: {
      id: 'rt-notify-4',
      expeditionId: 'expedition-alpha',
      originClientId: 'client-lead',
      occurredAt: '2026-04-24T19:03:00Z',
      type: 'ping_upsert',
      ping: {
        id: 'ping-notify-4',
        idempotencyKey: 'ping-notify-4',
        type: 'general',
        priority: 'normal',
        status: 'recovered',
        reliabilityState: 'recovered',
        message: 'Recovered replay.',
        createdAt: '2026-04-24T19:03:00Z',
        updatedAt: '2026-04-24T19:03:00Z',
        createdByMemberId: 'lead',
        targetMemberIds: ['scout'],
        escalationState: 'none',
      },
    },
    currentUserId: 'scout',
    teamMembers: notificationMembers,
    expeditionSource: 'local',
  }).shouldNotify,
  false,
  'Offline replay/recovered pings should not resend notifications.',
);
assert.strictEqual(
  getDispatchNotificationPolicy({
    event: {
      id: 'rt-notify-5',
      expeditionId: 'expedition-alpha',
      originClientId: 'client-scout',
      occurredAt: '2026-04-24T19:04:00Z',
      type: 'queue_item_upsert',
      queueItem: {
        id: 'queue-escalation-notify',
        idempotencyKey: 'queue-escalation-notify',
        title: 'Hazard escalation',
        detail: 'Washout still unresolved.',
        status: 'escalated',
        priority: 'critical',
        createdAt: '2026-04-24T19:04:00Z',
        updatedAt: '2026-04-24T19:04:00Z',
        createdByMemberId: 'scout',
        assignedMemberIds: ['scout'],
        linkedContext: { id: 'pin-hazard', type: 'pin', title: 'Hazard Pin' },
        escalationState: 'broadcast_to_team',
        deliveryState: 'escalated',
      },
    },
    currentUserId: 'lead',
    teamMembers: notificationMembers,
    expeditionSource: 'local',
  }).shouldNotify,
  true,
  'Escalations should notify expedition leads.',
);

if (originalTypeScriptExtension) {
  Module._extensions['.ts'] = originalTypeScriptExtension;
}

console.log('Dispatch helper checks passed.');

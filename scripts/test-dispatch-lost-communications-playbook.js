const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

global.__DEV__ = false;
const storage = new Map();
global.localStorage = {
  clear: () => storage.clear(),
  getItem: (key) => storage.get(key) ?? null,
  key: (index) => Array.from(storage.keys())[index] ?? null,
  removeItem: (key) => storage.delete(key),
  setItem: (key, value) => storage.set(key, String(value)),
  get length() { return storage.size; },
};

const originalLoad = Module._load;
Module._load = function loadWithNativeStub(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(outputText, filename);
};

const root = process.cwd();
const lost = require(path.join(root, 'lib', 'dispatchLostCommunicationsPlaybook.ts'));
const runtimeAdapter = require(path.join(root, 'lib', 'dispatchLostCommunicationsRuntimeAdapter.ts'));
const playbooks = require(path.join(root, 'lib', 'dispatchOperationalPlaybookDomain.ts'));
const composer = require(path.join(root, 'lib', 'dispatchMissionCommandComposer.ts'));
const commands = require(path.join(root, 'lib', 'dispatchMissionCommandDomain.ts'));
const { dispatchPersistenceAdapter } = require(path.join(root, 'lib', 'dispatchPersistenceAdapter.ts'));

const BASE_TIME = '2026-07-14T12:00:00.000Z';
const ACTOR = { id: 'lead-operator', label: 'Expedition Lead', role: 'owner' };
const MEMBER = { id: 'member-unreachable', label: 'Tail 2', roleId: 'member' };
const CAPABILITIES = new Set([
  'mission_command',
  'mission_clock',
  'linked_context',
  'assignment',
  'acknowledgment',
  'offline_operation',
]);

function at(minutes, milliseconds = 0) {
  return new Date(Date.parse(BASE_TIME) + minutes * 60_000 + milliseconds).toISOString();
}

function source(id = 'test-source') {
  return {
    id,
    origin: 'cached',
    role: 'primary',
    policyKey: 'manual_user_state',
    authority: 'ECS test fixture',
    authorityKind: 'ecs',
    observedAt: BASE_TIME,
    confidence: 'high',
    coverage: 'complete',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: [],
  };
}

function runtime(denied = []) {
  return {
    availableCapabilities: CAPABILITIES,
    online: true,
    permissions: {
      can: (action) => denied.includes(action)
        ? { allowed: false, reason: 'Denied by test policy.' }
        : { allowed: true },
    },
  };
}

function permissionSnapshot() {
  return {
    roleLabel: 'Expedition Lead',
    disabledReason: 'Denied by test policy.',
    can: () => ({ allowed: true }),
  };
}

function create(overrides = {}) {
  return lost.createLostCommunicationsPlaybook({
    expeditionId: 'expedition-lost-comms',
    actor: ACTOR,
    member: MEMBER,
    soloMode: false,
    online: true,
    locationPermissionAllowed: true,
    positionSharingEnabled: true,
    position: {
      latitude: 39.7392,
      longitude: -104.9903,
      capturedAt: at(-2),
      accuracyMeters: 18,
      sourceLabel: 'Member GPS device',
    },
    routeContext: {
      id: 'route-active',
      type: 'route',
      title: 'North Ridge Route',
      sourceTruthPolicyKey: 'manual_user_state',
      sourceTruth: source('route-source'),
    },
    lastCheckInAt: at(-20),
    lastAcknowledgmentAt: at(-25),
    lastCommandReceiptAt: at(-30),
    leadMemberId: ACTOR.id,
    sweepMemberId: 'sweep-operator',
    expeditionCommsPlan: 'Use the expedition radio plan. External emergency procedures remain manual.',
    reviewMinutes: 15,
    now: BASE_TIME,
    idempotencyKey: 'lost-comms:create:member-unreachable',
    ...overrides,
  });
}

function expectChanged(result) {
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.changed, true);
  return result.instance;
}

function transition(instance, next, minute) {
  return expectChanged(playbooks.transitionOperationalPlaybookState(
    lost.LOST_COMMUNICATIONS_PLAYBOOK_DEFINITION,
    instance,
    next,
    {
      actor: ACTOR,
      runtime: runtime(),
      occurredAt: at(minute),
      idempotencyKey: `lost-comms:state:${next}:${minute}`,
    },
  ));
}

function execute(instance, action, minute, key) {
  const result = playbooks.executeOperationalPlaybookStep(
    lost.LOST_COMMUNICATIONS_PLAYBOOK_DEFINITION,
    instance,
    { actor: ACTOR, action, occurredAt: at(minute), idempotencyKey: `lost-comms:${key}` },
    runtime(),
  );
  return result;
}

function startDirectProposal(instance) {
  let current = transition(transition(instance, 'ready', 0.1), 'active', 0.2);
  current = expectChanged(execute(current, { kind: 'complete_review' }, 1, 'review'));
  current = expectChanged(execute(current, {
    kind: 'confirm_action',
    confirmed: true,
    summary: 'Freshness reviewed; no movement inferred.',
  }, 2, 'freshness'));
  const prepared = execute(current, { kind: 'prepare_command_proposal' }, 3, 'prepare-direct');
  current = expectChanged(prepared);
  const proposal = current.commandProposals.find((item) => item.stepId === lost.LOST_COMMUNICATIONS_STEP_IDS.directCheckIn);
  assert.ok(proposal);
  assert.deepEqual(proposal.target, { kind: 'member', memberId: MEMBER.id, label: 'Unreachable member' });
  assert.deepEqual(proposal.acknowledgmentPolicy, { mode: 'all', targetMemberIds: [MEMBER.id] });
  const confirmed = execute(current, {
    kind: 'confirm_command_proposal',
    proposalId: proposal.id,
    confirmed: true,
  }, 4, 'confirm-direct');
  assert.equal(confirmed.effect.kind, 'command_proposal_confirmed');
  return { instance: expectChanged(confirmed), proposal: confirmed.effect.proposal };
}

assert.equal(playbooks.validateOperationalPlaybookDefinition(
  lost.LOST_COMMUNICATIONS_PLAYBOOK_DEFINITION,
).valid, true, 'Lost Communications definition must satisfy the tested framework schema.');

const fresh = create();
assert.equal(fresh.ok, true);
let review = lost.selectLostCommunicationsContextReview({ instance: fresh.instance, now: BASE_TIME });
assert.equal(review.positionState, 'live');
assert.equal(review.positionText, '39.73920, -104.99030');
assert.equal(review.accuracyMeters, 18);
assert.equal(review.movementStatement, 'Movement is not inferred from the last verified position.');

const stale = create({
  position: {
    latitude: 39.7392,
    longitude: -104.9903,
    capturedAt: at(-12),
    accuracyMeters: 35,
    sourceLabel: 'Member GPS device',
  },
  idempotencyKey: 'lost-comms:create:stale',
});
assert.equal(stale.ok, true);
review = lost.selectLostCommunicationsContextReview({ instance: stale.instance, now: BASE_TIME });
assert.equal(review.positionState, 'stale');
assert.match(review.lastVerifiedStatus, /Stale/);
assert.doesNotMatch(review.lastVerifiedStatus, /^Live/);

const restricted = create({
  locationPermissionAllowed: false,
  idempotencyKey: 'lost-comms:create:restricted',
});
assert.equal(restricted.ok, true);
review = lost.selectLostCommunicationsContextReview({ instance: restricted.instance, now: BASE_TIME });
assert.equal(review.positionState, 'restricted');
assert.equal(review.positionText, 'Restricted by member-location permission');
const restrictedSerialized = JSON.stringify(restricted.instance);
assert.equal(restrictedSerialized.includes('39.7392'), false, 'Restricted latitude must not persist.');
assert.equal(restrictedSerialized.includes('-104.9903'), false, 'Restricted longitude must not persist.');

const sharingUnavailable = create({
  positionSharingEnabled: false,
  idempotencyKey: 'lost-comms:create:sharing-unavailable',
});
assert.equal(sharingUnavailable.ok, true);
review = lost.selectLostCommunicationsContextReview({ instance: sharingUnavailable.instance, now: BASE_TIME });
assert.equal(review.positionState, 'restricted');
assert.match(review.positionText, /member GPS sharing is unavailable/);
assert.equal(JSON.stringify(sharingUnavailable.instance).includes('39.7392'), false);

const noLocation = create({ position: null, idempotencyKey: 'lost-comms:create:no-location' });
assert.equal(noLocation.ok, true);
review = lost.selectLostCommunicationsContextReview({ instance: noLocation.instance, now: BASE_TIME });
assert.equal(review.positionState, 'missing');
assert.ok(review.missingFields.includes('last verified position'));

const solo = create({ soloMode: true, idempotencyKey: 'lost-comms:create:solo' });
assert.equal(solo.ok, false);
assert.equal(solo.safeCode, 'lost_comms_solo_not_applicable');

let permissionDeniedFlow = transition(transition(fresh.instance, 'ready', 0.01), 'active', 0.02);
permissionDeniedFlow = expectChanged(execute(permissionDeniedFlow, { kind: 'complete_review' }, 0.03, 'permission-review'));
permissionDeniedFlow = expectChanged(execute(permissionDeniedFlow, {
  kind: 'confirm_action',
  confirmed: true,
  summary: 'Freshness reviewed without inferring movement.',
}, 0.04, 'permission-freshness'));
const permissionDeniedProposal = playbooks.executeOperationalPlaybookStep(
  lost.LOST_COMMUNICATIONS_PLAYBOOK_DEFINITION,
  permissionDeniedFlow,
  {
    actor: ACTOR,
    action: { kind: 'prepare_command_proposal' },
    occurredAt: at(0.05),
    idempotencyKey: 'lost-comms:permission-denied-proposal',
  },
  runtime(['send_individual_ping']),
);
assert.equal(permissionDeniedProposal.ok, false);
assert.equal(permissionDeniedProposal.safeCode, 'playbook_permission_denied');
assert.equal(permissionDeniedFlow.commandProposals.length, 0, 'Denied action must not mutate proposals.');

let direct = startDirectProposal(fresh.instance);
const draft = composer.createMissionCommandComposerFormFromPlaybookProposal({
  proposal: direct.proposal,
  actorId: ACTOR.id,
  soloMode: false,
  members: [{ id: MEMBER.id, label: MEMBER.label, roleId: MEMBER.roleId }],
});
assert.equal(draft.ok, true);
const catalog = {
  members: [{ id: MEMBER.id, label: MEMBER.label, roleId: MEMBER.roleId }],
  roles: [],
  vehicles: [],
  teamUnits: [],
  linkedContexts: draft.extraContext ? [draft.extraContext] : [],
  milestones: [],
};
const built = composer.buildMissionCommandFromComposer({
  form: draft.form,
  expeditionId: direct.instance.expeditionId,
  actor: ACTOR,
  soloMode: false,
  catalog,
  permissions: permissionSnapshot(),
  queueDelivery: true,
  sourceTruth: draft.sourceTruth,
  now: at(5),
});
assert.equal(built.ok, true, built.issues?.[0]?.message);
assert.equal(built.command.deliveryState, 'queued');
assert.equal(built.command.acknowledgmentState, 'pending');

const linked = playbooks.linkOperationalPlaybookCommand(direct.instance, {
  proposalId: direct.proposal.id,
  command: built.command,
  actor: ACTOR,
  idempotencyKey: 'lost-comms:link-direct-command',
  occurredAt: at(5),
});
assert.equal(linked.ok, true);
assert.equal(linked.changed, true);
direct.instance = linked.instance;
const repeatedLink = playbooks.linkOperationalPlaybookCommand(direct.instance, {
  proposalId: direct.proposal.id,
  command: built.command,
  actor: ACTOR,
  idempotencyKey: 'lost-comms:link-direct-command',
  occurredAt: at(5),
});
assert.equal(repeatedLink.ok, true);
assert.equal(repeatedLink.changed, false, 'Repeated command linking must be idempotent.');
let directStatus = lost.selectLostCommunicationsDirectCheckIn(direct.instance, [built.command]);
assert.equal(directStatus.queuedOffline, true);
assert.equal(directStatus.acknowledged, false);

let delivered = commands.transitionMissionCommandDeliveryState(built.command, 'sending', { actor: ACTOR, occurredAt: at(6) });
assert.equal(delivered.ok, true);
delivered = commands.transitionMissionCommandDeliveryState(delivered.command, 'sent', { actor: ACTOR, occurredAt: at(7) });
assert.equal(delivered.ok, true);
delivered = commands.transitionMissionCommandDeliveryState(delivered.command, 'delivered', { actor: ACTOR, occurredAt: at(8) });
assert.equal(delivered.ok, true);
const acknowledged = commands.recordMissionCommandAcknowledgment(delivered.command, {
  id: 'ack-lost-comms-direct',
  idempotencyKey: 'ack-lost-comms-direct',
  memberId: MEMBER.id,
  response: 'acknowledged',
  respondedAt: at(9),
});
assert.equal(acknowledged.ok, true);
directStatus = lost.selectLostCommunicationsDirectCheckIn(direct.instance, [acknowledged.command]);
assert.equal(directStatus.acknowledged, true);
assert.equal(directStatus.acknowledgmentState, 'complete');
assert.equal(lost.selectLostCommunicationsSuggestedOutcome(direct.instance, [acknowledged.command]), 'member_responded');

const noRoles = create({
  leadMemberId: null,
  sweepMemberId: null,
  idempotencyKey: 'lost-comms:create:no-roles',
});
assert.equal(noRoles.ok, true);
let noRoleFlow = startDirectProposal(noRoles.instance).instance;
const missingRoleProposal = execute(noRoleFlow, { kind: 'prepare_command_proposal' }, 5, 'prepare-lead-sweep-missing');
assert.equal(missingRoleProposal.ok, false);
assert.equal(missingRoleProposal.safeCode, 'playbook_proposal_target_unavailable');
noRoleFlow = expectChanged(execute(noRoleFlow, { kind: 'skip', reason: 'Lead and sweep are unavailable.' }, 5, 'skip-lead-sweep'));
assert.equal(noRoleFlow.currentStepId, lost.LOST_COMMUNICATIONS_STEP_IDS.reviewRally);

let deadlineFlow = direct.instance;
deadlineFlow = expectChanged(execute(deadlineFlow, { kind: 'skip', reason: 'Lead and sweep notification deferred.' }, 5, 'skip-notify'));
deadlineFlow = expectChanged(execute(deadlineFlow, { kind: 'skip', reason: 'No verified rally or bailout is available.' }, 6, 'skip-rally'));
const dueAt = deadlineFlow.inputSnapshot[lost.LOST_COMMUNICATIONS_INPUT_KEYS.noResponseDeadline].scalarValue;
deadlineFlow = expectChanged(execute(deadlineFlow, {
  kind: 'start_deadline',
  dueAt,
  title: 'No-response operator review',
  reason: 'Request an operator decision if no verified response is recorded.',
}, 7, 'start-deadline'));
assert.equal(deadlineFlow.deadlines.length, 1, JSON.stringify(deadlineFlow.deadlines));
assert.equal(deadlineFlow.deadlines[0].source, 'no_response_review');
assert.equal(deadlineFlow.deadlines[0].completionState, 'active');
assert.equal(lost.selectNoResponseDeadlineStatus(deadlineFlow, dueAt), 'due');
assert.equal(lost.selectNoResponseDeadlineStatus(deadlineFlow, new Date(Date.parse(dueAt) + 1).toISOString()), 'overdue');

const attempt = lost.createLostCommunicationsCommunicationAttemptInput({
  summary: 'Radio channel 1 attempted at 12:08; no verified response.',
  actor: ACTOR,
  occurredAt: at(8),
});
assert.ok(attempt);
deadlineFlow = expectChanged(execute(deadlineFlow, { kind: 'provide_input', input: attempt }, 8, 'record-attempt'));

const prematureIncident = lost.buildLostCommunicationsIncidentHandoff({
  instance: deadlineFlow,
  outcome: 'escalate_for_operator_review',
  explicitOperatorChoice: true,
  now: at(10),
});
assert.equal(prematureIncident.ok, false);
assert.equal(prematureIncident.safeCode, 'lost_comms_review_deadline_pending');
const noChoiceIncident = lost.buildLostCommunicationsIncidentHandoff({
  instance: deadlineFlow,
  outcome: 'escalate_for_operator_review',
  explicitOperatorChoice: false,
  now: at(16),
});
assert.equal(noChoiceIncident.ok, false);
assert.equal(noChoiceIncident.safeCode, 'lost_comms_operator_confirmation_required');
const unrecordedIncident = lost.buildLostCommunicationsIncidentHandoff({
  instance: deadlineFlow,
  outcome: 'escalate_for_operator_review',
  explicitOperatorChoice: true,
  now: at(16),
});
assert.equal(unrecordedIncident.ok, false);
assert.equal(unrecordedIncident.safeCode, 'lost_comms_outcome_not_recorded');
deadlineFlow = expectChanged(execute(deadlineFlow, {
  kind: 'record_decision',
  decision: 'escalate_for_operator_review',
  reasonCode: 'operator_selected_lost_communications_outcome',
}, 16, 'record-escalation-outcome'));
const incident = lost.buildLostCommunicationsIncidentHandoff({
  instance: deadlineFlow,
  outcome: 'escalate_for_operator_review',
  explicitOperatorChoice: true,
  now: at(16),
});
assert.equal(incident.ok, true);
assert.equal(incident.prefill.type, 'communication_failure');
assert.equal(incident.prefill.safety.anyoneMissing, null, 'Unreachable must not become confirmed missing.');
assert.match(incident.prefill.notes, /does not declare an emergency/);

const restrictedDeadline = startDirectProposal(restricted.instance).instance;
let restrictedIncidentFlow = expectChanged(execute(restrictedDeadline, { kind: 'skip', reason: 'Roles unavailable.' }, 5, 'restricted-skip-notify'));
restrictedIncidentFlow = expectChanged(execute(restrictedIncidentFlow, { kind: 'skip', reason: 'No context available.' }, 6, 'restricted-skip-rally'));
const restrictedDueAt = restrictedIncidentFlow.inputSnapshot[lost.LOST_COMMUNICATIONS_INPUT_KEYS.noResponseDeadline].scalarValue;
restrictedIncidentFlow = expectChanged(execute(restrictedIncidentFlow, { kind: 'start_deadline', dueAt: restrictedDueAt }, 7, 'restricted-deadline'));
const restrictedAttempt = lost.createLostCommunicationsCommunicationAttemptInput({
  summary: 'Radio attempt recorded; no verified response.',
  actor: ACTOR,
  occurredAt: at(8),
});
assert.ok(restrictedAttempt);
restrictedIncidentFlow = expectChanged(execute(
  restrictedIncidentFlow,
  { kind: 'provide_input', input: restrictedAttempt },
  8,
  'restricted-attempt',
));
restrictedIncidentFlow = expectChanged(execute(restrictedIncidentFlow, {
  kind: 'record_decision',
  decision: 'escalate_for_operator_review',
  reasonCode: 'operator_selected_lost_communications_outcome',
}, 16, 'restricted-outcome'));
const restrictedHandoff = lost.buildLostCommunicationsIncidentHandoff({
  instance: restrictedIncidentFlow,
  outcome: 'escalate_for_operator_review',
  explicitOperatorChoice: true,
  now: at(16),
});
assert.equal(restrictedHandoff.ok, true);
assert.equal(restrictedHandoff.prefill.location, null, 'Restricted coordinates must not enter incident prefill.');

const smartRally = lost.selectLostCommunicationsSmartRallyContext({
  status: 'proposal',
  posture: 'watch',
  generatedAt: BASE_TIME,
  routeId: 'route-active',
  spreadMeters: 1000,
  spreadSeconds: 500,
  members: [],
  excludedMembers: [],
  excludedSummary: { total: 0, restricted: 0, staleOrAging: 0, inaccurateOrUnknown: 0, unavailable: 0 },
  candidateEvaluations: [],
  proposal: {
    fingerprint: 'smart-rally-fixture',
    candidate: {
      candidate: {
        id: 'rally-candidate',
        title: 'North Ridge Pullout',
        type: 'rally',
        coordinate: { lat: 39.75, lng: -104.98 },
        access: 'unknown',
        stoppingSuitability: 'conditional',
        sourceTruth: source('rally-source'),
        sourceTruthPolicyKey: 'manual_user_state',
      },
      posture: 'conditional',
      score: 50,
      routeDistanceMeters: 1000,
      distanceFromRouteMeters: 10,
      etaWindow: null,
      reasons: [],
      missingInputs: ['current access'],
      warningCodes: ['access_unknown'],
      sourceTruth: source('rally-evaluation-source'),
    },
    rationale: ['Candidate requires operator review.'],
    recommendedVerification: ['Verify current access.'],
    confidence: 'medium',
    sourceTruth: source('rally-proposal-source'),
    operatorActionRequired: true,
    previewOnly: true,
  },
  sourceTruth: [source('planner-source')],
  missingInputs: [],
  warningCodes: [],
  operatorActionRequired: true,
  previewOnly: true,
  automaticActions: [],
});
assert.equal(smartRally.status, 'available');
assert.equal(smartRally.context.metadata.previewOnly, true);
assert.match(smartRally.context.subtitle, /No route or guidance change has been accepted/);

const defaults = {
  pings: [],
  queueItems: [],
  assignments: [],
  timelineEvents: [],
  missionCommands: [],
  missionCommandEvents: [],
  operationalPlaybooks: [],
};
dispatchPersistenceAdapter.upsertOperationalPlaybook(deadlineFlow.expeditionId, defaults, deadlineFlow);
const restored = dispatchPersistenceAdapter.load(deadlineFlow.expeditionId, defaults);
assert.equal(restored.operationalPlaybooks.length, 1);
assert.equal(restored.operationalPlaybooks[0].id, deadlineFlow.id);

const convoyFixture = {
  convoyId: 'convoy-runtime-fixture',
  rawMembers: [
    { id: 'row-unreachable', convoy_id: 'convoy-runtime-fixture', user_id: MEMBER.id, callsign: 'TAIL 2', role: 'member' },
    { id: 'row-lead', convoy_id: 'convoy-runtime-fixture', user_id: ACTOR.id, callsign: 'LEAD', role: 'lead' },
    { id: 'row-sweep', convoy_id: 'convoy-runtime-fixture', user_id: 'sweep-operator', callsign: 'SWEEP', role: 'sweep' },
  ],
  rawLocations: [{
    id: 'location-unreachable',
    convoy_id: 'convoy-runtime-fixture',
    member_id: 'row-unreachable',
    latitude: 39.7392,
    longitude: -104.9903,
    accuracy_meters: 18,
    captured_at: at(-2),
  }],
  members: [{
    memberId: 'row-unreachable',
    callsign: 'TAIL 2',
    role: 'member',
    latitude: 39.7392,
    longitude: -104.9903,
    accuracyMeters: 18,
    headingDegrees: null,
    speedMps: null,
    movementStatus: 'unknown',
    capturedAt: at(-2),
    updatedAt: at(-2),
    isStale: false,
    staleness: 'live',
    staleReason: null,
  }],
  activeCount: 1,
  staleCount: 0,
  assistanceCount: 0,
  lead: null,
  sweep: null,
  lastUpdated: at(-2),
  connectionStatus: 'connected',
  loading: false,
  error: null,
};
const runtimeInput = runtimeAdapter.buildLostCommunicationsRuntimeInput({
  expeditionId: 'expedition-lost-comms',
  actor: ACTOR,
  member: MEMBER,
  members: [MEMBER, { id: ACTOR.id, label: ACTOR.label }, { id: 'sweep-operator', label: 'Sweep' }],
  soloMode: false,
  online: true,
  locationPermissionAllowed: true,
  positionSharingEnabled: true,
  convoy: convoyFixture,
  commands: [acknowledged.command],
  events: [delivered.event].filter(Boolean),
  now: BASE_TIME,
});
assert.equal(runtimeInput.position.latitude, 39.7392);
assert.equal(runtimeInput.leadMemberId, ACTOR.id);
assert.equal(runtimeInput.sweepMemberId, 'sweep-operator');
assert.equal(runtimeInput.lastAcknowledgmentAt, at(9));

const restrictedRuntimeInput = runtimeAdapter.buildLostCommunicationsRuntimeInput({
  ...runtimeInput,
  member: MEMBER,
  members: [MEMBER, { id: ACTOR.id, label: ACTOR.label }, { id: 'sweep-operator', label: 'Sweep' }],
  locationPermissionAllowed: false,
  convoy: convoyFixture,
  commands: [],
  events: [],
});
assert.equal(restrictedRuntimeInput.position, null, 'Permission denial must omit the raw convoy position.');
const restrictedFromRuntime = lost.createLostCommunicationsPlaybook({
  ...restrictedRuntimeInput,
  idempotencyKey: 'lost-comms:runtime-restricted',
});
assert.equal(restrictedFromRuntime.ok, true);
assert.equal(JSON.stringify(restrictedFromRuntime.instance).includes('39.7392'), false);

console.log('Dispatch Lost Communications Operational Playbook checks passed.');

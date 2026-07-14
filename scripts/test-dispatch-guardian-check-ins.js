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
const guardian = require(path.join(root, 'lib', 'dispatchGuardianCheckInDomain.ts'));
const adapter = require(path.join(root, 'lib', 'dispatchGuardianCheckInAdapter.ts'));
const { dispatchPersistenceAdapter } = require(path.join(root, 'lib', 'dispatchPersistenceAdapter.ts'));

const BASE = '2026-07-14T18:00:00.000Z';
const ACTOR = { id: 'lead-one', label: 'Lead', role: 'owner' };
const MEMBER = { id: 'sweep-one', label: 'Sweep' };
const TEAM_TARGET = { kind: 'member', memberId: MEMBER.id, label: MEMBER.label };
const SOURCE = {
  id: 'guardian-fixture',
  origin: 'manual',
  role: 'primary',
  policyKey: 'manual_user_state',
  authority: ACTOR.label,
  authorityKind: 'user',
  observedAt: BASE,
  confidence: 'high',
  coverage: 'complete',
  availability: 'usable',
  conflictState: 'none',
  warningCodes: ['manual_source'],
};

function at(minutes, milliseconds = 0) {
  return new Date(Date.parse(BASE) + minutes * 60_000 + milliseconds).toISOString();
}

function planInput(overrides = {}) {
  return {
    expeditionId: 'expedition-guardian',
    actor: ACTOR,
    title: 'Guardian Check-In',
    target: TEAM_TARGET,
    triggerType: 'manual_one_time',
    dueAt: null,
    intervalMinutes: null,
    linkedContext: null,
    includeExactLocation: false,
    locationPermissionAllowed: false,
    acknowledgmentRequirement: { mode: 'all', targetMemberIds: [MEMBER.id] },
    gracePeriodMinutes: 10,
    sourceTruth: [SOURCE],
    soloMode: false,
    now: BASE,
    idempotencyKey: 'guardian:create:fixture',
    ...overrides,
  };
}

function command(plan, overrides = {}) {
  return {
    schemaVersion: 1,
    version: 1,
    id: `command-${plan.id}-${overrides.idSuffix ?? 'one'}`,
    expeditionId: plan.expeditionId,
    creator: ACTOR,
    type: 'check_in',
    priority: 'normal',
    title: plan.title,
    instructions: 'Confirm status.',
    target: plan.target,
    acknowledgmentPolicy: plan.acknowledgmentRequirement,
    deadlineAt: overrides.deadlineAt ?? at(10),
    linkedContext: plan.trigger.linkedContext,
    sourceTruth: plan.sourceTruth,
    operationalState: overrides.operationalState ?? 'active',
    deliveryState: overrides.deliveryState ?? 'local',
    acknowledgmentState: overrides.acknowledgmentState ?? 'pending',
    acknowledgments: overrides.acknowledgments ?? [],
    idempotencyKey: `command-key-${plan.id}-${overrides.idSuffix ?? 'one'}`,
    createdAt: overrides.createdAt ?? BASE,
    updatedAt: overrides.updatedAt ?? BASE,
    audit: { schemaVersion: 1, sourceKind: 'native', safetyScope: 'ecs_team_coordination_only' },
  };
}

const triggerTypes = [
  'fixed_time', 'recurring_interval', 'route_checkpoint', 'rally_arrival', 'camp_arrival',
  'remote_segment_entry', 'operator_requested', 'post_incident_follow_up', 'manual_one_time',
];
assert.deepEqual(Object.keys(guardian.GUARDIAN_CHECK_IN_TRIGGER_SUPPORT).sort(), triggerTypes.sort());

const recurringResult = guardian.createGuardianCheckInPlan(planInput({
  triggerType: 'recurring_interval',
  intervalMinutes: 30,
  idempotencyKey: 'guardian:create:recurring',
}));
assert.equal(recurringResult.ok, true, recurringResult.reason);
let recurring = recurringResult.plan;
assert.equal(recurring.nextReviewAt, at(30));
assert.equal(guardian.getGuardianCheckInDeadlineStatus(recurring, BASE), 'scheduled');

const routeContext = {
  id: 'waypoint-one',
  type: 'waypoint',
  title: 'Remote Pass Checkpoint',
  coordinates: { latitude: 39.7, longitude: -105.2 },
  accuracyMeters: 18,
  observedAt: BASE,
  sourceTruthPolicyKey: 'manual_user_state',
  sourceTruth: SOURCE,
};
const routeResult = guardian.createGuardianCheckInPlan(planInput({
  triggerType: 'route_checkpoint',
  linkedContext: routeContext,
  idempotencyKey: 'guardian:create:checkpoint',
}));
assert.equal(routeResult.ok, true, routeResult.reason);
let routePlan = routeResult.plan;
assert.equal(routePlan.nextReviewAt, null);
assert.equal(routePlan.trigger.linkedContext.coordinates, undefined, 'Exact location must be omitted unless explicitly selected and permitted.');
assert.equal(routePlan.trigger.linkedContext.accuracyMeters, 18, 'Accuracy remains visible without exposing coordinates.');
const routePresentation = adapter.selectGuardianCheckInPresentation({
  plan: routePlan,
  commands: [],
  now: at(5),
});
assert.equal(routePresentation.sourceAgeLabel, 'Observed 5 minutes ago');
assert.equal(routePresentation.accuracyLabel, '18 m');
assert.equal(adapter.buildGuardianCheckInComposerRequest({ plan: routePlan, actor: ACTOR, members: [MEMBER], now: BASE }).ok, false);
const triggered = guardian.markGuardianCheckInTrigger({
  plan: routePlan,
  actor: ACTOR,
  occurredAt: at(1),
  triggerIdempotencyKey: 'guardian:checkpoint:waypoint-one:cycle-1',
});
assert.equal(triggered.ok, true);
assert.equal(triggered.changed, true);
routePlan = triggered.plan;
const duplicateTrigger = guardian.markGuardianCheckInTrigger({
  plan: routePlan,
  actor: ACTOR,
  occurredAt: at(2),
  triggerIdempotencyKey: 'guardian:checkpoint:waypoint-one:cycle-1',
});
assert.equal(duplicateTrigger.ok, true);
assert.equal(duplicateTrigger.changed, false, 'Repeated trigger delivery must be idempotent.');
assert.equal(adapter.buildGuardianCheckInComposerRequest({ plan: routePlan, actor: ACTOR, members: [MEMBER], now: at(1) }).ok, true);

const permittedResult = guardian.createGuardianCheckInPlan(planInput({
  triggerType: 'route_checkpoint',
  linkedContext: routeContext,
  includeExactLocation: true,
  locationPermissionAllowed: true,
  idempotencyKey: 'guardian:create:permitted-location',
}));
assert.equal(permittedResult.ok, true);
assert.deepEqual(permittedResult.plan.trigger.linkedContext.coordinates, routeContext.coordinates);

const restrictedResult = guardian.createGuardianCheckInPlan(planInput({
  triggerType: 'route_checkpoint',
  linkedContext: { ...routeContext, restricted: true },
  includeExactLocation: true,
  locationPermissionAllowed: true,
  idempotencyKey: 'guardian:create:restricted-location',
}));
assert.equal(restrictedResult.ok, true);
assert.equal(restrictedResult.plan.trigger.linkedContext.coordinates, undefined);
assert.equal(restrictedResult.plan.trigger.linkedContext.accuracyMeters, 18);

const manualResult = guardian.createGuardianCheckInPlan(planInput());
assert.equal(manualResult.ok, true, manualResult.reason);
let manual = manualResult.plan;
const offlineCommand = command(manual, { deliveryState: 'queued' });
const offlineLink = guardian.linkGuardianCheckInCommand({ plan: manual, command: offlineCommand, actor: ACTOR, occurredAt: BASE });
assert.equal(offlineLink.ok, true);
manual = offlineLink.plan;
assert.equal(manual.responseState, 'queued');
assert.equal(manual.nextReviewAt, at(10));
assert.equal(guardian.getGuardianCheckInDeadlineStatus(manual, at(10)), 'due');
assert.equal(guardian.getGuardianCheckInDeadlineStatus(manual, at(10, 1)), 'overdue');
const fakeOfflineAck = guardian.recordGuardianCheckInResponse({
  plan: manual,
  response: 'acknowledged',
  actor: ACTOR,
  command: { ...offlineCommand, acknowledgmentState: 'complete' },
  occurredAt: at(2),
  explicitOperatorChoice: true,
});
assert.equal(fakeOfflineAck.ok, false);
assert.equal(fakeOfflineAck.safeCode, 'guardian_offline_acknowledgment_forbidden');

const earlyNoResponse = guardian.recordGuardianCheckInNoResponse({
  plan: manual,
  actor: ACTOR,
  command: offlineCommand,
  now: at(9),
  explicitOperatorChoice: true,
});
assert.equal(earlyNoResponse.ok, false);
assert.equal(earlyNoResponse.safeCode, 'guardian_grace_period_active');
const noResponse = guardian.recordGuardianCheckInNoResponse({
  plan: manual,
  actor: ACTOR,
  command: offlineCommand,
  now: at(11),
  explicitOperatorChoice: true,
});
assert.equal(noResponse.ok, true, noResponse.reason);
assert.equal(noResponse.plan.responseState, 'no_response');
assert.equal(noResponse.decisionCommand.operationalState, 'proposed');
assert.equal(noResponse.decisionCommand.deliveryState, 'local');
assert.equal(noResponse.decisionCommand.acknowledgmentState, 'not_required');
assert.match(noResponse.decisionCommand.instructions, /do not infer an emergency/i);
const duplicateNoResponse = guardian.recordGuardianCheckInNoResponse({
  plan: noResponse.plan,
  actor: ACTOR,
  command: offlineCommand,
  now: at(12),
  explicitOperatorChoice: true,
});
assert.equal(duplicateNoResponse.ok, true);
assert.equal(duplicateNoResponse.changed, false);

const deliveredCommand = command(recurring, {
  idSuffix: 'ack',
  deliveryState: 'delivered',
  acknowledgmentState: 'complete',
  acknowledgments: [{
    id: 'ack-one',
    idempotencyKey: 'ack-key-one',
    memberId: MEMBER.id,
    response: 'acknowledged',
    respondedAt: at(2),
  }],
});
recurring = guardian.linkGuardianCheckInCommand({ plan: recurring, command: deliveredCommand, actor: ACTOR, occurredAt: at(1) }).plan;
const acknowledged = guardian.recordGuardianCheckInResponse({
  plan: recurring,
  response: 'acknowledged',
  actor: ACTOR,
  command: deliveredCommand,
  occurredAt: at(2),
  explicitOperatorChoice: true,
});
assert.equal(acknowledged.ok, true, acknowledged.reason);
assert.equal(acknowledged.plan.responseState, 'acknowledged');
const nextCycle = guardian.resolveGuardianCheckInCycle({
  plan: acknowledged.plan,
  actor: ACTOR,
  occurredAt: at(3),
  explicitOperatorChoice: true,
});
assert.equal(nextCycle.ok, true);
assert.equal(nextCycle.plan.cycle, 2);
assert.equal(nextCycle.plan.responseState, 'scheduled');
assert.equal(nextCycle.plan.nextReviewAt, at(33));

const fixedResult = guardian.createGuardianCheckInPlan(planInput({
  triggerType: 'fixed_time',
  dueAt: at(30),
  idempotencyKey: 'guardian:create:fixed',
}));
let fixed = fixedResult.plan;
const paused = guardian.transitionGuardianCheckInLifecycle({ plan: fixed, actor: ACTOR, next: 'paused', occurredAt: at(10) });
assert.equal(paused.ok, true);
assert.equal(paused.plan.pauseRemainingMs, 20 * 60_000);
const resumed = guardian.transitionGuardianCheckInLifecycle({ plan: paused.plan, actor: ACTOR, next: 'active', occurredAt: at(20) });
assert.equal(resumed.ok, true);
assert.equal(resumed.plan.nextReviewAt, at(40));
fixed = resumed.plan;

const soloResult = guardian.createGuardianCheckInPlan(planInput({
  target: { kind: 'solo', memberId: ACTOR.id, label: ACTOR.label },
  soloMode: true,
  acknowledgmentRequirement: { mode: 'all', targetMemberIds: [ACTOR.id] },
  idempotencyKey: 'guardian:create:solo',
}));
assert.equal(soloResult.ok, true);
let solo = soloResult.plan;
assert.equal(solo.acknowledgmentRequirement.mode, 'none');
const soloDraft = adapter.buildGuardianCheckInComposerRequest({ plan: solo, actor: ACTOR, members: [], now: BASE });
assert.equal(soloDraft.ok, true);
assert.equal(soloDraft.request.form.acknowledgmentMode, 'none');
assert.match(soloDraft.request.form.instructions, /no recipient delivery is claimed/i);
const soloCommand = command(solo, { idSuffix: 'solo', deliveryState: 'local', acknowledgmentState: 'not_required' });
solo = guardian.linkGuardianCheckInCommand({ plan: solo, command: soloCommand, actor: ACTOR, occurredAt: BASE }).plan;
const selfCheck = guardian.recordGuardianCheckInResponse({
  plan: solo,
  response: 'acknowledged',
  actor: ACTOR,
  command: soloCommand,
  occurredAt: at(1),
  explicitOperatorChoice: true,
});
assert.equal(selfCheck.ok, true);
assert.match(selfCheck.event.summary, /local self check-in/i);

const defaults = {
  pings: [], queueItems: [], assignments: [], assistRequests: [], acknowledgments: [],
  timelineEvents: [], offlineActions: [], cadEvents: [], missionCommands: [],
  missionCommandEvents: [], operationalPlaybooks: [], guardianCheckIns: [],
};
dispatchPersistenceAdapter.upsertGuardianCheckIn('expedition-guardian', defaults, fixed);
dispatchPersistenceAdapter.upsertGuardianCheckIn('expedition-guardian', defaults, fixed);
const restored = dispatchPersistenceAdapter.load('expedition-guardian', defaults);
assert.equal(restored.version, 5);
assert.equal(restored.guardianCheckIns.length, 1);
assert.equal(restored.guardianCheckIns[0].id, fixed.id);

const legacyExpeditionId = 'expedition-guardian-schema-four';
localStorage.setItem(`dispatch_state_${legacyExpeditionId}`, JSON.stringify({
  version: 4,
  expeditionId: legacyExpeditionId,
  pings: [], queueItems: [], assignments: [], assistRequests: [], acknowledgments: [],
  timelineEvents: [], offlineActions: [], cadEvents: [], missionCommands: [],
  missionCommandEvents: [], operationalPlaybooks: [], updatedAt: BASE,
}));
const migrated = dispatchPersistenceAdapter.loadResult(legacyExpeditionId, defaults);
assert.equal(migrated.snapshot.version, 5);
assert.deepEqual(migrated.snapshot.guardianCheckIns, []);
assert.equal(migrated.status, 'ready');

const corruptExpeditionId = 'expedition-guardian-corrupt';
localStorage.setItem(`dispatch_state_${corruptExpeditionId}`, JSON.stringify({
  ...restored,
  expeditionId: corruptExpeditionId,
  guardianCheckIns: [{ schemaVersion: 99, id: 'invalid-guardian-record' }],
}));
const recovered = dispatchPersistenceAdapter.loadResult(corruptExpeditionId, defaults);
assert.equal(recovered.status, 'recovered');
assert.equal(recovered.safeCode, 'dispatch_persistence_partial');
assert.deepEqual(recovered.snapshot.guardianCheckIns, []);

const legacy = adapter.adaptLegacyCheckInPingToGuardianPlanInput({
  expeditionId: 'expedition-guardian',
  actor: ACTOR,
  soloMode: false,
  ping: {
    id: 'legacy-ping', idempotencyKey: 'legacy-ping-key', version: 1, type: 'check_in',
    priority: 'normal', message: 'Legacy check-in', targetMemberIds: [MEMBER.id],
    status: 'sent', createdAt: BASE, updatedAt: BASE, createdByMemberId: ACTOR.id,
    escalationState: 'none', requiresAcknowledgment: true, checkInSchedule: 'every_30',
  },
});
assert.equal(legacy.triggerType, 'recurring_interval');
assert.equal(legacy.intervalMinutes, 30);
assert.equal(legacy.includeExactLocation, false);

const domainSource = fs.readFileSync(path.join(root, 'lib', 'dispatchGuardianCheckInDomain.ts'), 'utf8');
assert.doesNotMatch(domainSource, /setInterval|startLocationUpdates|declareEmergency|contactEmergencyServices|sendSms|placePhoneCall/);
assert.match(noResponse.decisionEvent.summary, /no escalation was sent/i);

console.log('Dispatch Guardian Check-In domain checks passed.');

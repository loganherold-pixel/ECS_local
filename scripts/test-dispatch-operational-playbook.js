const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
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
const domain = require(path.join(root, 'lib', 'dispatchOperationalPlaybookDomain.ts'));
const presentation = require(path.join(root, 'lib', 'dispatchOperationalPlaybookPresentation.ts'));
const { dispatchPersistenceAdapter } = require(path.join(root, 'lib', 'dispatchPersistenceAdapter.ts'));

const BASE_TIME = '2026-07-14T12:00:00.000Z';
const ACTOR = { id: 'lead-1', label: 'Expedition Lead', role: 'owner' };
const ALL_CAPABILITIES = new Set([
  'mission_command',
  'mission_clock',
  'linked_context',
  'assignment',
  'acknowledgment',
  'offline_operation',
]);

function at(minutes) {
  return new Date(Date.parse(BASE_TIME) + (minutes * 60_000)).toISOString();
}

function sourceTruth(id = 'playbook-source', overrides = {}) {
  return {
    id,
    origin: 'manual',
    role: 'primary',
    policyKey: 'manual_user_state',
    authority: 'ECS operator',
    authorityKind: 'user',
    observedAt: BASE_TIME,
    fetchedAt: null,
    expiresAt: null,
    confidence: 'high',
    coverage: 'complete',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: ['manual_source'],
    ...overrides,
  };
}

function inputValue(key, kind, value, overrides = {}) {
  return {
    schemaVersion: 1,
    key,
    kind,
    state: 'available',
    scalarValue: kind === 'linked_context' ? undefined : value,
    linkedContext: kind === 'linked_context' ? value : undefined,
    sourceTruth: [sourceTruth(`source-${key}`)],
    observedAt: BASE_TIME,
    capturedAt: BASE_TIME,
    capturedBy: ACTOR,
    manual: true,
    ...overrides,
  };
}

function stepBase(id, type, overrides = {}) {
  return {
    id,
    type,
    title: id.replace(/-/g, ' '),
    instructions: `Complete the deterministic ${type} step.`,
    requiredInputKeys: [],
    requiredPermissions: ['view_dispatch'],
    dependsOnStepIds: [],
    skippable: false,
    ...overrides,
  };
}

function definition() {
  const steps = [
    stepBase('review-context', 'review_context', {
      contextInputKey: 'route_context',
      requiredInputKeys: ['route_context'],
    }),
    stepBase('request-status', 'request_input', {
      inputKey: 'status_note',
      dependsOnStepIds: ['review-context'],
    }),
    stepBase('propose-command', 'create_command_proposal', {
      requiredInputKeys: ['route_context'],
      requiredPermissions: ['send_team_ping'],
      dependsOnStepIds: ['request-status'],
      proposal: {
        type: 'check_in',
        priority: 'high',
        title: 'Confirm route status',
        instructions: 'Confirm route status at the next safe stop.',
        target: { kind: 'team', memberIds: ['member-1', 'member-2'], label: 'Expedition team' },
        acknowledgmentPolicy: { mode: 'all', targetMemberIds: ['member-1', 'member-2'] },
        linkedContextInputKey: 'route_context',
        deadlineInputKey: 'command_deadline',
      },
    }),
    stepBase('assign-role', 'assign_role', {
      allowedRoleIds: ['lead', 'tail'],
      requiredPermissions: ['assign_member'],
      dependsOnStepIds: ['propose-command'],
    }),
    stepBase('request-ack', 'request_acknowledgment', {
      mode: 'all',
      dependsOnStepIds: ['assign-role'],
    }),
    stepBase('open-context', 'open_context', {
      contextInputKey: 'route_context',
      requiredInputKeys: ['route_context'],
      dependsOnStepIds: ['request-ack'],
    }),
    stepBase('start-deadline', 'start_deadline', {
      deadlineSource: 'scheduled_check_in',
      warningWindowMs: 15 * 60_000,
      criticalWindowMs: 2 * 60_000,
      dependsOnStepIds: ['open-context'],
    }),
    stepBase('record-decision', 'record_decision', {
      decisionKey: 'route_status_decision',
      dependsOnStepIds: ['start-deadline'],
    }),
    stepBase('confirm-action', 'confirm_action', {
      confirmationLabel: 'Confirm operator-reviewed action',
      dependsOnStepIds: ['record-decision'],
    }),
    stepBase('resolve', 'resolve', {
      dependsOnStepIds: ['confirm-action'],
    }),
  ];
  return {
    schemaVersion: 1,
    id: 'framework-characterization',
    version: 1,
    title: 'Framework Characterization',
    description: 'A test-only definition that exercises the bounded framework step types.',
    supportedScenario: 'framework_test_only',
    requiredCapabilities: [...ALL_CAPABILITIES],
    requiredPermissions: ['view_dispatch'],
    requiredInputs: [{
      key: 'route_context',
      label: 'Route context',
      description: 'Synthetic route context for framework verification.',
      kind: 'linked_context',
      sourceTruthPolicyKey: 'manual_user_state',
      allowManual: true,
      allowStale: false,
      sensitive: true,
    }],
    optionalInputs: [
      {
        key: 'status_note',
        label: 'Status note',
        description: 'Operator-recorded status.',
        kind: 'text',
        sourceTruthPolicyKey: 'manual_user_state',
        allowManual: true,
        allowStale: true,
        sensitive: false,
      },
      {
        key: 'command_deadline',
        label: 'Command deadline',
        description: 'Absolute command deadline.',
        kind: 'timestamp',
        sourceTruthPolicyKey: 'manual_user_state',
        allowManual: true,
        allowStale: true,
        sensitive: false,
      },
    ],
    steps,
    completionRules: { mode: 'all_required_steps', requiredStepIds: steps.map((step) => step.id) },
    cancellationRules: {
      allowedStates: ['draft', 'ready', 'active', 'paused', 'blocked'],
      requireReason: true,
    },
    safetyScope: 'ecs_team_coordination_only',
  };
}

function routeContext(overrides = {}) {
  return {
    id: 'route-context-1',
    type: 'route',
    title: 'Synthetic test route',
    coordinates: { latitude: 39.1, longitude: -104.1 },
    observedAt: BASE_TIME,
    stale: false,
    restricted: false,
    ...overrides,
  };
}

function runtime(overrides = {}) {
  const denied = new Set(overrides.denied ?? []);
  return {
    permissions: {
      can: (action) => denied.has(action)
        ? { allowed: false, reason: `Denied ${action}.` }
        : { allowed: true },
    },
    availableCapabilities: overrides.availableCapabilities ?? ALL_CAPABILITIES,
    online: overrides.online ?? true,
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

function createInstance(options = {}) {
  return domain.createOperationalPlaybookInstance(definition(), {
    expeditionId: options.expeditionId ?? 'expedition-playbook',
    actor: ACTOR,
    inputs: options.inputs ?? [
      inputValue('route_context', 'linked_context', routeContext()),
      inputValue('command_deadline', 'timestamp', at(120)),
    ],
    sourceTruth: [sourceTruth()],
    idempotencyKey: options.idempotencyKey ?? 'playbook:create:one',
    createdAt: BASE_TIME,
    online: options.online ?? true,
  });
}

function transition(instance, next, minute, runtimeValue = runtime(), overrides = {}) {
  return domain.transitionOperationalPlaybookState(definition(), instance, next, {
    actor: ACTOR,
    runtime: runtimeValue,
    occurredAt: at(minute),
    idempotencyKey: `transition:${next}:${minute}`,
    ...overrides,
  });
}

const playbookDefinition = definition();
assert.equal(domain.validateOperationalPlaybookDefinition(playbookDefinition).valid, true);
assert.deepEqual(playbookDefinition.steps.map((step) => step.type), [
  'review_context',
  'request_input',
  'create_command_proposal',
  'assign_role',
  'request_acknowledgment',
  'open_context',
  'start_deadline',
  'record_decision',
  'confirm_action',
  'resolve',
]);

let instance = createInstance();
assert.equal(instance.state, 'draft');
assert.equal(domain.evaluateOperationalPlaybookReadiness(playbookDefinition, instance, runtime(), BASE_TIME).ready, true);

const invalidTransition = transition(instance, 'completed', 1);
assert.equal(invalidTransition.ok, false);
assert.equal(invalidTransition.safeCode, 'playbook_transition_invalid');
assert.strictEqual(invalidTransition.instance, instance, 'Rejected transitions must not mutate state.');

let mutation = transition(instance, 'ready', 1);
assert.equal(mutation.ok, true);
instance = mutation.instance;
mutation = transition(instance, 'active', 2);
assert.equal(mutation.ok, true);
instance = mutation.instance;

let blockable = createInstance({ idempotencyKey: 'playbook:create:block-transition' });
blockable = transition(blockable, 'ready', 1, runtime(), {
  idempotencyKey: 'transition:blockable:ready',
}).instance;
blockable = transition(blockable, 'active', 2, runtime(), {
  idempotencyKey: 'transition:blockable:active',
}).instance;
const blockWithoutReason = transition(blockable, 'blocked', 3, runtime(), {
  idempotencyKey: 'transition:blockable:missing-reason',
});
assert.equal(blockWithoutReason.ok, false);
assert.equal(blockWithoutReason.safeCode, 'playbook_block_reason_required');
assert.strictEqual(blockWithoutReason.instance, blockable);
const blockedTransition = transition(blockable, 'blocked', 3, runtime(), {
  idempotencyKey: 'transition:blockable:blocked',
  reason: 'Waiting for operator-verified route context.',
  reasonCode: 'route_context_pending',
});
assert.equal(blockedTransition.ok, true);
assert.equal(blockedTransition.instance.blockedStep.reason, 'Waiting for operator-verified route context.');
assert.equal(blockedTransition.instance.blockedStep.reasonCode, 'route_context_pending');
const resumedTransition = transition(blockedTransition.instance, 'active', 4, runtime(), {
  idempotencyKey: 'transition:blockable:resumed',
});
assert.equal(resumedTransition.ok, true);
assert.equal(resumedTransition.instance.blockedStep, undefined);

const denied = domain.executeOperationalPlaybookStep(playbookDefinition, instance, {
  actor: ACTOR,
  action: { kind: 'complete_review' },
  idempotencyKey: 'step:denied',
  occurredAt: at(3),
}, runtime({ denied: ['view_dispatch'] }));
assert.equal(denied.ok, false);
assert.equal(denied.safeCode, 'playbook_permission_denied');
assert.strictEqual(denied.instance, instance, 'Denied step actions must not mutate playbook state.');

mutation = domain.executeOperationalPlaybookStep(playbookDefinition, instance, {
  actor: ACTOR,
  action: { kind: 'complete_review' },
  idempotencyKey: 'step:review',
  occurredAt: at(3),
}, runtime());
assert.equal(mutation.ok, true);
instance = mutation.instance;

mutation = domain.executeOperationalPlaybookStep(playbookDefinition, instance, {
  actor: ACTOR,
  action: {
    kind: 'provide_input',
    input: inputValue('status_note', 'text', 'Team status reviewed.', { capturedAt: at(4) }),
  },
  idempotencyKey: 'step:status',
  occurredAt: at(4),
}, runtime());
assert.equal(mutation.ok, true);
instance = mutation.instance;

const prepared = domain.executeOperationalPlaybookStep(playbookDefinition, instance, {
  actor: ACTOR,
  action: { kind: 'prepare_command_proposal' },
  idempotencyKey: 'step:proposal:prepare',
  occurredAt: at(5),
}, runtime());
assert.equal(prepared.ok, true);
assert.equal(prepared.effect, null);
assert.equal(prepared.instance.currentStepId, 'propose-command');
assert.equal(prepared.instance.commandProposals[0].status, 'proposed');
assert.equal(prepared.instance.commandProposals[0].linkedContext.restricted, false);
instance = prepared.instance;

const confirmed = domain.executeOperationalPlaybookStep(playbookDefinition, instance, {
  actor: ACTOR,
  action: { kind: 'confirm_command_proposal', proposalId: instance.commandProposals[0].id, confirmed: true },
  idempotencyKey: 'step:proposal:confirm',
  occurredAt: at(6),
}, runtime());
assert.equal(confirmed.ok, true);
assert.equal(confirmed.effect.kind, 'command_proposal_confirmed');
assert.equal(confirmed.effect.proposal.status, 'confirmed');
assert.equal(confirmed.instance.commandProposals[0].status, 'confirmed');
assert.equal(confirmed.instance.commandProposals[0].commandId, undefined);
assert.equal('deliveryState' in confirmed.effect.proposal, false, 'A playbook proposal must not masquerade as a sent command.');
instance = confirmed.instance;

const duplicateConfirmation = domain.executeOperationalPlaybookStep(playbookDefinition, instance, {
  actor: ACTOR,
  action: { kind: 'confirm_command_proposal', proposalId: instance.commandProposals[0].id, confirmed: true },
  idempotencyKey: 'step:proposal:confirm',
  occurredAt: at(6),
}, runtime());
assert.equal(duplicateConfirmation.ok, true);
assert.equal(duplicateConfirmation.changed, false);
assert.strictEqual(duplicateConfirmation.instance, instance);

const remainingActions = [
  { action: { kind: 'assign_role', roleId: 'tail', assigneeId: 'member-2', label: 'Tail vehicle' }, key: 'step:assign' },
  { action: { kind: 'request_acknowledgment', targetIds: ['member-1', 'member-2'] }, key: 'step:ack' },
  { action: { kind: 'open_context' }, key: 'step:open' },
  { action: { kind: 'start_deadline', dueAt: at(90), title: 'Check-in review', reason: 'Review team check-in.' }, key: 'step:deadline' },
  { action: { kind: 'record_decision', decision: 'Continue only after the team confirms status.', reasonCode: 'operator_reviewed' }, key: 'step:decision' },
  { action: { kind: 'confirm_action', confirmed: true, summary: 'Operator reviewed the proposed action.' }, key: 'step:confirm' },
  { action: { kind: 'resolve', summary: 'Framework workflow completed without automatic transmission.' }, key: 'step:resolve' },
];

let instanceWithActiveDeadline = null;
remainingActions.forEach((entry, index) => {
  const result = domain.executeOperationalPlaybookStep(playbookDefinition, instance, {
    actor: ACTOR,
    action: entry.action,
    idempotencyKey: entry.key,
    occurredAt: at(7 + index),
  }, runtime());
  assert.equal(result.ok, true, `${entry.action.kind} should complete deterministically.`);
  if (entry.action.kind === 'open_context') assert.equal(result.effect.kind, 'open_context');
  if (entry.action.kind === 'start_deadline') assert.equal(result.effect.kind, 'deadline_started');
  instance = result.instance;
  if (entry.action.kind === 'start_deadline') instanceWithActiveDeadline = instance;
});

assert.equal(instance.state, 'completed');
assert.equal(instance.currentStepId, null);
assert.equal(instance.completedStepIds.length, playbookDefinition.steps.length);
assert.equal(instance.deadlines[0].completionState, 'completed');
assert.equal(instance.deadlines[0].completedAt, at(13));
assert.ok(instance.eventHistory.some((event) => event.type === 'completed'));

const deadlineInputs = domain.collectOperationalPlaybookDeadlines(instance);
assert.equal(deadlineInputs[0].completionState, 'completed');
assert.equal(deadlineInputs[0].completedAt, at(13));

const cancelledWithDeadline = domain.transitionOperationalPlaybookState(
  playbookDefinition,
  instanceWithActiveDeadline,
  'cancelled',
  {
    actor: ACTOR,
    runtime: runtime(),
    occurredAt: at(14),
    reason: 'Operator stopped before the next decision step.',
    idempotencyKey: 'transition:cancel-with-deadline',
  },
);
assert.equal(cancelledWithDeadline.ok, true);
assert.equal(cancelledWithDeadline.instance.deadlines[0].completionState, 'cancelled');
assert.equal(cancelledWithDeadline.instance.deadlines[0].cancelledAt, at(14));

const runnerModel = presentation.buildOperationalPlaybookRunnerModel({
  definition: playbookDefinition,
  instance,
  readiness: domain.evaluateOperationalPlaybookReadiness(playbookDefinition, instance, runtime(), at(13)),
  now: at(13),
});
assert.equal(runnerModel.progressPercent, 100);
assert.equal(runnerModel.stateLabel, 'Completed');
assert.match(runnerModel.safetyCopy, /do not send commands/i);
assert.equal(runnerModel.primaryAction, null);

const missing = createInstance({ inputs: [] });
const missingReadiness = domain.evaluateOperationalPlaybookReadiness(playbookDefinition, missing, runtime(), BASE_TIME);
assert.equal(missingReadiness.ready, false);
assert.deepEqual(missingReadiness.missingInputKeys, ['route_context']);
const missingReadyTransition = transition(missing, 'ready', 1);
assert.equal(missingReadyTransition.ok, false);
assert.equal(missingReadyTransition.safeCode, 'playbook_not_ready');

const deniedInput = domain.recordOperationalPlaybookInput(playbookDefinition, missing, inputValue(
  'route_context',
  'linked_context',
  routeContext(),
), {
  actor: ACTOR,
  runtime: runtime({ denied: ['view_dispatch'] }),
  idempotencyKey: 'input:route:denied',
  occurredAt: at(1),
});
assert.equal(deniedInput.ok, false);
assert.strictEqual(deniedInput.instance, missing);
const recordedInput = domain.recordOperationalPlaybookInput(playbookDefinition, missing, inputValue(
  'route_context',
  'linked_context',
  routeContext(),
), {
  actor: ACTOR,
  runtime: runtime(),
  idempotencyKey: 'input:route:allowed',
  occurredAt: at(1),
});
assert.equal(recordedInput.ok, true);
const duplicateInput = domain.recordOperationalPlaybookInput(
  playbookDefinition,
  recordedInput.instance,
  inputValue('route_context', 'linked_context', routeContext()),
  {
    actor: ACTOR,
    runtime: runtime(),
    idempotencyKey: 'input:route:allowed',
    occurredAt: at(1),
  },
);
assert.equal(duplicateInput.ok, true);
assert.equal(duplicateInput.changed, false);

const restrictedInput = inputValue('route_context', 'linked_context', routeContext({
  type: 'member',
  title: 'Restricted member location',
  restricted: true,
  coordinates: { latitude: 39.123456, longitude: -104.123456 },
  metadata: { rawTrace: [[39.1, -104.1]], token: 'must-not-persist' },
}), { state: 'available' });
const restricted = createInstance({ inputs: [restrictedInput] });
assert.equal(restricted.inputSnapshot.route_context.state, 'restricted');
assert.equal(restricted.inputSnapshot.route_context.linkedContext.coordinates, undefined);
assert.equal(restricted.inputSnapshot.route_context.linkedContext.metadata, undefined);
assert.deepEqual(
  domain.evaluateOperationalPlaybookReadiness(playbookDefinition, restricted, runtime(), BASE_TIME).restrictedInputKeys,
  ['route_context'],
);

let offline = createInstance({ online: false, idempotencyKey: 'playbook:create:offline' });
let offlineMutation = transition(offline, 'ready', 1, runtime({ online: false }));
assert.equal(offlineMutation.ok, true);
offline = offlineMutation.instance;
offlineMutation = transition(offline, 'active', 2, runtime({ online: false }));
assert.equal(offlineMutation.ok, true);
assert.equal(offlineMutation.instance.lastKnownConnectivity, 'offline');
assert.equal(offlineMutation.event.metadata.offline, true);

let cancellable = createInstance({ idempotencyKey: 'playbook:create:cancel' });
cancellable = transition(cancellable, 'ready', 1).instance;
const deniedCancellation = domain.transitionOperationalPlaybookState(playbookDefinition, cancellable, 'cancelled', {
  actor: ACTOR,
  runtime: runtime({ denied: ['view_dispatch'] }),
  occurredAt: at(2),
  reason: 'This denied action must not be recorded.',
  idempotencyKey: 'transition:cancelled:denied',
});
assert.equal(deniedCancellation.ok, false);
assert.equal(deniedCancellation.safeCode, 'playbook_permission_denied');
assert.strictEqual(deniedCancellation.instance, cancellable);
const cancelled = domain.transitionOperationalPlaybookState(playbookDefinition, cancellable, 'cancelled', {
  actor: ACTOR,
  runtime: runtime(),
  occurredAt: at(2),
  reason: 'Operator stopped the test playbook.',
  idempotencyKey: 'transition:cancelled',
});
assert.equal(cancelled.ok, true);
assert.equal(cancelled.instance.state, 'cancelled');
assert.equal(cancelled.instance.cancellationReason, 'Operator stopped the test playbook.');

const skippableDefinition = {
  ...playbookDefinition,
  id: 'skip-characterization',
  steps: [stepBase('optional-review', 'review_context', {
    contextInputKey: 'route_context',
    requiredInputKeys: ['route_context'],
    skippable: true,
  })],
  completionRules: { mode: 'all_required_steps', requiredStepIds: ['optional-review'] },
};
let skipped = domain.createOperationalPlaybookInstance(skippableDefinition, {
  expeditionId: 'expedition-skip',
  actor: ACTOR,
  inputs: [inputValue('route_context', 'linked_context', routeContext())],
  sourceTruth: [sourceTruth()],
  idempotencyKey: 'playbook:create:skip',
  createdAt: BASE_TIME,
  online: true,
});
skipped = domain.transitionOperationalPlaybookState(skippableDefinition, skipped, 'ready', {
  actor: ACTOR, runtime: runtime(), occurredAt: at(1), idempotencyKey: 'skip:ready',
}).instance;
skipped = domain.transitionOperationalPlaybookState(skippableDefinition, skipped, 'active', {
  actor: ACTOR, runtime: runtime(), occurredAt: at(2), idempotencyKey: 'skip:active',
}).instance;
const skipResult = domain.executeOperationalPlaybookStep(skippableDefinition, skipped, {
  actor: ACTOR,
  action: { kind: 'skip', reason: 'Operator documented why this optional review was skipped.' },
  idempotencyKey: 'skip:step',
  occurredAt: at(3),
}, runtime());
assert.equal(skipResult.ok, true);
assert.deepEqual(skipResult.instance.completedStepIds, [], 'Skipped steps must remain distinct from completed steps.');
assert.deepEqual(skipResult.instance.skippedSteps.map((step) => step.stepId), ['optional-review']);
assert.equal(skipResult.instance.state, 'completed');

function migrationDefinition(version, stepId) {
  return {
    schemaVersion: 1,
    id: 'migration-characterization',
    version,
    title: 'Migration Characterization',
    description: 'Test-only playbook definition migration.',
    supportedScenario: 'framework_test_only',
    requiredCapabilities: ['linked_context', 'offline_operation'],
    requiredPermissions: ['view_dispatch'],
    requiredInputs: playbookDefinition.requiredInputs,
    optionalInputs: [],
    steps: [stepBase(stepId, 'review_context', {
      contextInputKey: 'route_context',
      requiredInputKeys: ['route_context'],
    })],
    completionRules: { mode: 'all_required_steps', requiredStepIds: [stepId] },
    cancellationRules: playbookDefinition.cancellationRules,
    safetyScope: 'ecs_team_coordination_only',
  };
}

const definitionV1 = migrationDefinition(1, 'review-v1');
const definitionV2 = migrationDefinition(2, 'review-v2');
const legacyInstance = domain.createOperationalPlaybookInstance(definitionV1, {
  expeditionId: 'expedition-migration',
  actor: ACTOR,
  inputs: [inputValue('route_context', 'linked_context', routeContext())],
  sourceTruth: [sourceTruth()],
  idempotencyKey: 'playbook:create:migration',
  createdAt: BASE_TIME,
  online: true,
});
const migratedDefinition = domain.migrateOperationalPlaybookInstance(legacyInstance, definitionV2, [{
  definitionId: 'migration-characterization',
  fromVersion: 1,
  toVersion: 2,
  stepIdMap: { 'review-v1': 'review-v2' },
}], ACTOR, at(1));
assert.equal(migratedDefinition.ok, true);
assert.equal(migratedDefinition.instance.definitionVersion, 2);
assert.equal(migratedDefinition.instance.currentStepId, 'review-v2');
assert.equal(migratedDefinition.event.type, 'migrated');
const incompleteMigration = domain.migrateOperationalPlaybookInstance(legacyInstance, definitionV2, [{
  definitionId: 'migration-characterization',
  fromVersion: 1,
  toVersion: 2,
}], ACTOR, at(1));
assert.equal(incompleteMigration.ok, false);
assert.equal(incompleteMigration.safeCode, 'playbook_migration_incomplete');
assert.strictEqual(incompleteMigration.instance, legacyInstance);

const persisted = dispatchPersistenceAdapter.upsertOperationalPlaybook(
  instance.expeditionId,
  defaults(),
  instance,
);
assert.equal(persisted.version, 7);
assert.equal(persisted.operationalPlaybooks.length, 1);
const restarted = dispatchPersistenceAdapter.load(instance.expeditionId, defaults());
assert.deepEqual(restarted.operationalPlaybooks, persisted.operationalPlaybooks, 'Restart must restore the durable instance exactly.');

const legacyExpeditionId = 'expedition-schema-three';
localStorage.setItem(`dispatch_state_${legacyExpeditionId}`, JSON.stringify({
  version: 3,
  expeditionId: legacyExpeditionId,
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
  updatedAt: BASE_TIME,
}));
const migratedSnapshot = dispatchPersistenceAdapter.load(legacyExpeditionId, defaults());
assert.equal(migratedSnapshot.version, 7);
assert.deepEqual(migratedSnapshot.operationalPlaybooks, []);

const corruptExpeditionId = 'expedition-corrupt-playbook';
localStorage.setItem(`dispatch_state_${corruptExpeditionId}`, JSON.stringify({
  ...persisted,
  expeditionId: corruptExpeditionId,
  operationalPlaybooks: [{
    ...instance,
    expeditionId: corruptExpeditionId,
    stepResults: [{
      stepId: 'resolve',
      stepType: 'resolve',
      completedAt: at(13),
      actorId: ACTOR.id,
      summary: 'Malformed persisted result.',
      data: {
        kind: 'raw_provider_response',
        geometry: { coordinates: [[39.1, -104.1]] },
        token: 'must-not-survive',
      },
    }],
  }],
}));
const corruptResult = dispatchPersistenceAdapter.loadResult(corruptExpeditionId, defaults());
assert.equal(corruptResult.status, 'recovered');
assert.equal(corruptResult.safeCode, 'dispatch_persistence_partial');
assert.deepEqual(corruptResult.snapshot.operationalPlaybooks, []);
assert.doesNotMatch(JSON.stringify(corruptResult.snapshot), /must-not-survive|coordinates/);

const componentSource = fs.readFileSync(
  path.join(root, 'components', 'dispatch', 'DispatchOperationalPlaybookRunner.tsx'),
  'utf8',
);
assert.match(componentSource, /enabled: boolean/);
assert.match(componentSource, /accessibilityRole="progressbar"/);
assert.match(componentSource, /SourceTruthInspectorTrigger/);
assert.match(componentSource, /A confirmed proposal is still not a sent command/);
assert.doesNotMatch(componentSource, /useDispatch|dispatchPersistenceAdapter|supabase|openai|aiOrchestration/i);

const start = performance.now();
for (let index = 0; index < 2_000; index += 1) {
  domain.evaluateOperationalPlaybookReadiness(playbookDefinition, instance, runtime(), at(13));
  presentation.buildOperationalPlaybookRunnerModel({
    definition: playbookDefinition,
    instance,
    readiness: { ready: true, missingInputKeys: [], staleInputKeys: [], restrictedInputKeys: [], unavailableInputKeys: [], missingCapabilities: [], deniedPermissions: [], issueCodes: [] },
    now: at(13),
  });
}
const durationMs = performance.now() - start;
assert.ok(durationMs < 2_500, `Pure playbook selectors should remain bounded; measured ${durationMs.toFixed(1)}ms.`);

console.log(`Operational Playbook framework tests passed (${durationMs.toFixed(1)}ms for 2,000 readiness/presentation cycles).`);

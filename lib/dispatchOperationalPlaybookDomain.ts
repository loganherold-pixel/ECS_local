import { createDispatchEntityId, createDispatchIdempotencyKey } from './dispatchIntegrity';
import {
  MISSION_CLOCK_DEADLINE_WINDOWS,
  createMissionClockDeadline,
  type MissionClockDeadlineInput,
} from './dispatchMissionClock';
import { sanitizeMissionCommandLinkedContext } from './dispatchMissionCommandDomain';
import type { DispatchPermissionAction } from './dispatchPermissionAdapter';
import {
  OPERATIONAL_PLAYBOOK_SCHEMA_VERSION,
  type ExecuteOperationalPlaybookStepInput,
  type OperationalPlaybookBlockedStep,
  type OperationalPlaybookCapability,
  type OperationalPlaybookCommandProposal,
  type OperationalPlaybookDefinition,
  type OperationalPlaybookEffect,
  type OperationalPlaybookEvent,
  type OperationalPlaybookEventMetadata,
  type OperationalPlaybookEventType,
  type OperationalPlaybookInputRequirement,
  type OperationalPlaybookInputState,
  type OperationalPlaybookInputValue,
  type OperationalPlaybookInstance,
  type OperationalPlaybookMigration,
  type OperationalPlaybookMutationResult,
  type OperationalPlaybookReadiness,
  type OperationalPlaybookRuntimeContext,
  type OperationalPlaybookState,
  type OperationalPlaybookStepDefinition,
  type OperationalPlaybookStepResult,
  type OperationalPlaybookStepResultData,
} from './dispatchOperationalPlaybookTypes';
import type {
  MissionCommand,
  MissionCommandAcknowledgmentPolicy,
  MissionCommandActor,
  MissionCommandTarget,
  MissionCommandType,
} from './dispatchMissionCommandTypes';
import type { DispatchPriority } from './dispatchTypes';
import {
  assessSourceTruth,
  sanitizeSourceTruthDisplayText,
  sanitizeSourceTruthRef,
  type SourceTruthRef,
} from './sourceTruth';

export const OPERATIONAL_PLAYBOOK_RETENTION_LIMITS = {
  instances: 100,
  eventsPerInstance: 250,
  resultsPerInstance: 160,
  proposalsPerInstance: 40,
  deadlinesPerInstance: 40,
} as const;

export const OPERATIONAL_PLAYBOOK_TRANSITIONS: Record<
  OperationalPlaybookState,
  ReadonlySet<OperationalPlaybookState>
> = {
  draft: states('ready', 'cancelled'),
  ready: states('active', 'cancelled'),
  active: states('paused', 'blocked', 'completed', 'cancelled'),
  paused: states('active', 'blocked', 'cancelled'),
  blocked: states('active', 'paused', 'cancelled'),
  completed: states(),
  cancelled: states(),
};

const PLAYBOOK_STATES: OperationalPlaybookState[] = [
  'draft', 'ready', 'active', 'paused', 'blocked', 'completed', 'cancelled',
];
const PLAYBOOK_CAPABILITIES: OperationalPlaybookCapability[] = [
  'mission_command', 'mission_clock', 'linked_context', 'assignment', 'acknowledgment', 'offline_operation',
];
const STEP_TYPES = [
  'review_context', 'request_input', 'create_command_proposal', 'assign_role',
  'request_acknowledgment', 'open_context', 'start_deadline', 'record_decision',
  'confirm_action', 'resolve',
] as const;
const INPUT_STATES: OperationalPlaybookInputState[] = [
  'available', 'stale', 'missing', 'restricted', 'unavailable', 'conflicting',
];
const EVENT_TYPES: OperationalPlaybookEventType[] = [
  'created', 'ready', 'started', 'paused', 'resumed', 'blocked', 'input_recorded',
  'context_reviewed', 'command_proposed', 'command_confirmed', 'role_assigned',
  'command_created',
  'acknowledgment_requested', 'context_opened', 'deadline_started', 'decision_recorded',
  'action_confirmed', 'step_completed', 'step_skipped', 'completed', 'cancelled', 'migrated',
];
const MISSION_COMMAND_TYPES = [
  'check_in', 'rally', 'assist', 'hazard', 'resource', 'route', 'recovery', 'general', 'emergency',
] as const;
const DISPATCH_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
const MISSION_CLOCK_SOURCES = Object.keys(MISSION_CLOCK_DEADLINE_WINDOWS) as Array<
  keyof typeof MISSION_CLOCK_DEADLINE_WINDOWS
>;
const DISPATCH_PERMISSION_ACTIONS: DispatchPermissionAction[] = [
  'view_dispatch', 'view_team_roster', 'view_audit_history', 'send_individual_ping',
  'send_team_ping', 'send_team_wide_ping', 'send_role_group_ping', 'send_emergency_ping',
  'respond_check_in', 'create_assist_request', 'assign_member', 'reassign_queue_item',
  'resolve_queue_item', 'escalate_queue_item', 'cancel_queue_item', 'view_member_location',
  'view_member_contact', 'plan_convoy_regroup', 'broadcast_hazard', 'modify_timeline',
  'manage_role_group_targeting',
];

export interface OperationalPlaybookDefinitionValidation {
  valid: boolean;
  issues: { code: string; message: string; field?: string }[];
}

export interface CreateOperationalPlaybookInstanceInput {
  expeditionId: string;
  actor: MissionCommandActor;
  relatedCommandId?: string;
  relatedIncidentId?: string;
  inputs?: OperationalPlaybookInputValue[];
  sourceTruth?: SourceTruthRef[];
  idempotencyKey?: string;
  createdAt?: string;
  online?: boolean;
}

export interface TransitionOperationalPlaybookInput {
  actor: MissionCommandActor;
  runtime: OperationalPlaybookRuntimeContext;
  occurredAt?: string;
  reason?: string;
  reasonCode?: string;
  idempotencyKey?: string;
}

export function validateOperationalPlaybookDefinition(
  definition: OperationalPlaybookDefinition,
): OperationalPlaybookDefinitionValidation {
  const issues: OperationalPlaybookDefinitionValidation['issues'] = [];
  const issue = (code: string, message: string, field?: string) => issues.push({ code, message, field });
  if (!definition || typeof definition !== 'object') {
    return { valid: false, issues: [{ code: 'playbook_definition_invalid', message: 'Playbook definition is invalid.' }] };
  }
  if (definition.schemaVersion !== OPERATIONAL_PLAYBOOK_SCHEMA_VERSION) {
    issue('playbook_schema_unsupported', 'Playbook definition schema is unsupported.', 'schemaVersion');
  }
  if (!safeId(definition.id)) issue('playbook_id_invalid', 'Playbook ID is invalid.', 'id');
  if (!isPositiveInteger(definition.version)) issue('playbook_version_invalid', 'Playbook version is invalid.', 'version');
  if (!boundedText(definition.title, 160)) issue('playbook_title_missing', 'Playbook title is required.', 'title');
  if (!boundedText(definition.description, 500)) issue('playbook_description_missing', 'Playbook description is required.', 'description');
  if (!safeId(definition.supportedScenario)) {
    issue('playbook_scenario_invalid', 'Supported scenario is invalid.', 'supportedScenario');
  }
  if (definition.safetyScope !== 'ecs_team_coordination_only') {
    issue('playbook_safety_scope_invalid', 'Playbook must remain ECS team coordination only.', 'safetyScope');
  }

  const requiredCapabilities = Array.isArray(definition.requiredCapabilities)
    ? definition.requiredCapabilities
    : [];
  if (requiredCapabilities.some((capability) => !PLAYBOOK_CAPABILITIES.includes(capability))) {
    issue('playbook_capability_invalid', 'Playbook includes an unsupported capability.', 'requiredCapabilities');
  }
  if (!Array.isArray(definition.requiredPermissions)) {
    issue('playbook_permissions_invalid', 'Required permissions must be declared.', 'requiredPermissions');
  } else if (definition.requiredPermissions.some((permission) => !DISPATCH_PERMISSION_ACTIONS.includes(permission))) {
    issue('playbook_permissions_invalid', 'Playbook includes an unsupported permission.', 'requiredPermissions');
  }

  const requiredInputs = Array.isArray(definition.requiredInputs) ? definition.requiredInputs : [];
  const optionalInputs = Array.isArray(definition.optionalInputs) ? definition.optionalInputs : [];
  const inputRequirements = [...requiredInputs, ...optionalInputs];
  const inputKeys = new Set<string>();
  const inputRequirementsByKey = new Map<string, OperationalPlaybookInputRequirement>();
  inputRequirements.forEach((input, index) => {
    const field = `inputs.${index}`;
    if (!isValidInputRequirement(input)) issue('playbook_input_invalid', 'Playbook input requirement is invalid.', field);
    const key = safeId(input?.key);
    if (key && inputKeys.has(key)) issue('playbook_input_duplicate', `Duplicate input key: ${key}.`, field);
    if (key) {
      inputKeys.add(key);
      inputRequirementsByKey.set(key, input);
    }
  });

  const steps = Array.isArray(definition.steps) ? definition.steps : [];
  if (steps.length === 0) issue('playbook_steps_missing', 'Playbook requires at least one step.', 'steps');
  if (steps.length > 80) issue('playbook_steps_excessive', 'Playbook exceeds the supported step limit.', 'steps');
  const stepIds = new Set<string>();
  steps.forEach((step, index) => {
    const field = `steps.${index}`;
    if (!isValidStepBase(step)) issue('playbook_step_invalid', 'Playbook step is invalid.', field);
    const stepId = safeId(step?.id);
    if (stepId && stepIds.has(stepId)) issue('playbook_step_duplicate', `Duplicate step ID: ${stepId}.`, field);
    if (stepId) stepIds.add(stepId);
    for (const inputKey of step?.requiredInputKeys ?? []) {
      if (!inputKeys.has(inputKey)) issue('playbook_step_input_unknown', `Unknown step input: ${inputKey}.`, field);
    }
    for (const dependency of step?.dependsOnStepIds ?? []) {
      const dependencyIndex = steps.findIndex((candidate) => candidate.id === dependency);
      if (dependencyIndex < 0 || dependencyIndex >= index) {
        issue('playbook_step_dependency_invalid', `Step dependency must reference an earlier step: ${dependency}.`, field);
      }
    }
    validateSpecializedStep(step, inputKeys, inputRequirementsByKey, issue, field);
  });

  const completion = definition.completionRules;
  if (!completion || !['all_required_steps', 'explicit_resolve'].includes(completion.mode)) {
    issue('playbook_completion_invalid', 'Playbook completion rules are invalid.', 'completionRules');
  } else if (completion.mode === 'all_required_steps') {
    if (!Array.isArray(completion.requiredStepIds) || completion.requiredStepIds.some((id) => !stepIds.has(id))) {
      issue('playbook_completion_step_unknown', 'Completion references an unknown step.', 'completionRules');
    }
  } else {
    const resolveStep = steps.find((step) => step.id === completion.resolveStepId);
    if (!resolveStep || resolveStep.type !== 'resolve') {
      issue('playbook_resolve_step_invalid', 'Explicit completion requires a valid resolve step.', 'completionRules');
    }
    if (completion.prerequisiteStepIds.some((id) => !stepIds.has(id))) {
      issue('playbook_completion_step_unknown', 'Completion references an unknown prerequisite.', 'completionRules');
    }
  }

  const cancellation = definition.cancellationRules;
  if (!cancellation || !Array.isArray(cancellation.allowedStates) ||
      cancellation.allowedStates.some((state) => !PLAYBOOK_STATES.includes(state))) {
    issue('playbook_cancellation_invalid', 'Playbook cancellation rules are invalid.', 'cancellationRules');
  }

  return { valid: issues.length === 0, issues };
}

export function createOperationalPlaybookInstance(
  definition: OperationalPlaybookDefinition,
  input: CreateOperationalPlaybookInstanceInput,
): OperationalPlaybookInstance {
  const validation = validateOperationalPlaybookDefinition(definition);
  if (!validation.valid) throw new Error(validation.issues[0]?.message ?? 'Playbook definition is invalid.');
  const expeditionId = requireSafeId(input.expeditionId, 'Expedition ID is invalid.');
  const actor = normalizeActor(input.actor);
  const createdAt = normalizeIso(input.createdAt) ?? new Date().toISOString();
  const idempotencyKey = safeKey(input.idempotencyKey) ?? createDispatchIdempotencyKey({
    expeditionId,
    entityType: 'operational_playbook',
    actionType: 'create',
    actorMemberId: actor.id,
    sourceEntityId: `${definition.id}:${definition.version}`,
    timeBucket: createdAt,
  });
  const instanceId = createDispatchEntityId('operational_playbook', idempotencyKey);
  const requirements = inputRequirementMap(definition);
  const inputSnapshot: Record<string, OperationalPlaybookInputValue> = {};
  for (const candidate of input.inputs ?? []) {
    if (!candidate || typeof candidate !== 'object') continue;
    const requirement = requirements.get(candidate.key);
    if (!requirement) continue;
    const normalized = normalizeInputValue(candidate, requirement, createdAt);
    if (normalized) inputSnapshot[normalized.key] = normalized;
  }
  const sourceTruth = normalizeSourceTruth([
    ...(input.sourceTruth ?? []),
    ...Object.values(inputSnapshot).flatMap((value) => value.sourceTruth),
  ]);
  const instance: OperationalPlaybookInstance = {
    schemaVersion: OPERATIONAL_PLAYBOOK_SCHEMA_VERSION,
    version: 1,
    id: instanceId,
    idempotencyKey,
    definitionId: definition.id,
    definitionVersion: definition.version,
    expeditionId,
    relatedCommandId: safeId(input.relatedCommandId) ?? undefined,
    relatedIncidentId: safeId(input.relatedIncidentId) ?? undefined,
    state: 'draft',
    currentStepId: definition.steps[0]?.id ?? null,
    completedStepIds: [],
    skippedSteps: [],
    inputSnapshot,
    sourceTruth,
    actor,
    stepResults: [],
    commandProposals: [],
    deadlines: [],
    eventHistory: [],
    lastKnownConnectivity: input.online == null ? 'unknown' : input.online ? 'online' : 'offline',
    createdAt,
    updatedAt: createdAt,
  };
  return appendEvent(instance, createPlaybookEvent(instance, {
    type: 'created',
    actor,
    occurredAt: createdAt,
    summary: `${definition.title} playbook created.`,
    idempotencyKey: `${idempotencyKey}:created`,
    metadata: { offline: input.online === false },
  }));
}

export function evaluateOperationalPlaybookReadiness(
  definition: OperationalPlaybookDefinition,
  instance: OperationalPlaybookInstance,
  runtime: OperationalPlaybookRuntimeContext,
  now: string | number | Date = Date.now(),
): OperationalPlaybookReadiness {
  const missingInputKeys: string[] = [];
  const staleInputKeys: string[] = [];
  const restrictedInputKeys: string[] = [];
  const unavailableInputKeys: string[] = [];
  const issueCodes = new Set<string>();
  for (const requirement of definition.requiredInputs) {
    const value = instance.inputSnapshot[requirement.key];
    if (!value || value.state === 'missing') {
      missingInputKeys.push(requirement.key);
      issueCodes.add('playbook_required_input_missing');
      continue;
    }
    const state = resolveOperationalPlaybookInputState(value, requirement, now);
    if (state === 'restricted') {
      restrictedInputKeys.push(requirement.key);
      issueCodes.add('playbook_input_restricted');
    } else if (state === 'unavailable' || state === 'conflicting') {
      unavailableInputKeys.push(requirement.key);
      issueCodes.add(state === 'conflicting' ? 'playbook_input_conflicting' : 'playbook_input_unavailable');
    } else if (state === 'stale' && !requirement.allowStale) {
      staleInputKeys.push(requirement.key);
      issueCodes.add('playbook_input_stale');
    }
    if (value.manual && !requirement.allowManual) {
      unavailableInputKeys.push(requirement.key);
      issueCodes.add('playbook_manual_input_not_allowed');
    }
  }
  const missingCapabilities = unique(definition.requiredCapabilities)
    .filter((capability) => !runtime.availableCapabilities.has(capability));
  if (missingCapabilities.length > 0) issueCodes.add('playbook_capability_unavailable');
  if (!runtime.online && !runtime.availableCapabilities.has('offline_operation')) {
    missingCapabilities.push('offline_operation');
    issueCodes.add('playbook_offline_unsupported');
  }
  const deniedPermissions = unique(definition.requiredPermissions)
    .filter((permission) => !runtime.permissions.can(permission).allowed);
  if (deniedPermissions.length > 0) issueCodes.add('playbook_permission_denied');

  return {
    ready:
      missingInputKeys.length === 0 &&
      staleInputKeys.length === 0 &&
      restrictedInputKeys.length === 0 &&
      unavailableInputKeys.length === 0 &&
      missingCapabilities.length === 0 &&
      deniedPermissions.length === 0,
    missingInputKeys: unique(missingInputKeys),
    staleInputKeys: unique(staleInputKeys),
    restrictedInputKeys: unique(restrictedInputKeys),
    unavailableInputKeys: unique(unavailableInputKeys),
    missingCapabilities: unique(missingCapabilities),
    deniedPermissions: unique(deniedPermissions),
    issueCodes: [...issueCodes].sort(),
  };
}

export function transitionOperationalPlaybookState(
  definition: OperationalPlaybookDefinition,
  instance: OperationalPlaybookInstance,
  next: OperationalPlaybookState,
  input: TransitionOperationalPlaybookInput,
): OperationalPlaybookMutationResult {
  if (instance.state === next) return unchanged(instance);
  if (!OPERATIONAL_PLAYBOOK_TRANSITIONS[instance.state]?.has(next)) {
    return invalid(instance, 'Invalid Operational Playbook transition.', 'playbook_transition_invalid');
  }
  const occurredAt = normalizeIso(input.occurredAt) ?? new Date().toISOString();
  const actor = normalizeActor(input.actor);
  const idempotencyKey = safeKey(input.idempotencyKey) ?? actionKey(instance, `state:${next}`, actor.id, occurredAt);
  if (hasEvent(instance, idempotencyKey)) return unchanged(instance);
  const permission = checkDefinitionPermissions(definition, input.runtime);
  if (!permission.allowed) return invalid(instance, permission.reason, 'playbook_permission_denied');

  if (next === 'ready' || next === 'active') {
    const readiness = evaluateOperationalPlaybookReadiness(definition, instance, input.runtime, occurredAt);
    if (!readiness.ready) {
      return invalid(
        instance,
        readinessMessage(readiness),
        readiness.deniedPermissions.length > 0 ? 'playbook_permission_denied' : 'playbook_not_ready',
      );
    }
  }
  if (next === 'completed' && !canCompletePlaybook(definition, instance)) {
    return invalid(instance, 'Playbook completion rules are not satisfied.', 'playbook_completion_blocked');
  }
  if (next === 'blocked' && (!instance.currentStepId || !boundedText(input.reason, 500))) {
    return invalid(instance, 'A blocked playbook requires a current step and recorded reason.', 'playbook_block_reason_required');
  }
  if (next === 'cancelled') {
    if (!definition.cancellationRules.allowedStates.includes(instance.state)) {
      return invalid(instance, 'Playbook cannot be cancelled from its current state.', 'playbook_cancellation_denied');
    }
    if (definition.cancellationRules.requireReason && !boundedText(input.reason, 500)) {
      return invalid(instance, 'A cancellation reason is required.', 'playbook_cancellation_reason_required');
    }
  }

  const type = transitionEventType(instance.state, next);
  let updated: OperationalPlaybookInstance = {
    ...instance,
    version: instance.version + 1,
    state: next,
    actor,
    updatedAt: occurredAt,
    lastKnownConnectivity: input.runtime.online ? 'online' : 'offline',
    blockedStep: next === 'blocked'
      ? {
          stepId: instance.currentStepId!,
          reason: boundedText(input.reason, 500),
          reasonCode: safeCode(input.reasonCode) ?? 'playbook_step_blocked',
          blockedAt: occurredAt,
        }
      : next === 'active' ? undefined : instance.blockedStep,
    startedAt: next === 'active' ? instance.startedAt ?? occurredAt : instance.startedAt,
    completedAt: next === 'completed' ? occurredAt : instance.completedAt,
    cancelledAt: next === 'cancelled' ? occurredAt : instance.cancelledAt,
    cancellationReason: next === 'cancelled' ? boundedText(input.reason, 500) : instance.cancellationReason,
    deadlines: next === 'completed'
      ? closeActiveDeadlines(instance.deadlines, 'completed', occurredAt)
      : next === 'cancelled'
        ? closeActiveDeadlines(instance.deadlines, 'cancelled', occurredAt)
        : instance.deadlines,
  };
  const event = createPlaybookEvent(updated, {
    type,
    actor,
    occurredAt,
    summary: transitionSummary(definition.title, next, input.reason),
    idempotencyKey,
    metadata: {
      reasonCode: safeCode(input.reasonCode),
      offline: !input.runtime.online,
    },
  });
  updated = appendEvent(updated, event);
  return changed(updated, event);
}

export function recordOperationalPlaybookInput(
  definition: OperationalPlaybookDefinition,
  instance: OperationalPlaybookInstance,
  candidate: OperationalPlaybookInputValue,
  input: {
    actor: MissionCommandActor;
    runtime: OperationalPlaybookRuntimeContext;
    idempotencyKey: string;
    occurredAt?: string;
  },
): OperationalPlaybookMutationResult {
  if (instance.state === 'completed' || instance.state === 'cancelled') {
    return invalid(instance, 'Completed or cancelled playbooks cannot accept inputs.', 'playbook_terminal');
  }
  const idempotencyKey = safeKey(input.idempotencyKey);
  if (!idempotencyKey) return invalid(instance, 'Input idempotency key is invalid.', 'playbook_idempotency_invalid');
  if (hasEvent(instance, idempotencyKey)) return unchanged(instance);
  const permission = checkDefinitionPermissions(definition, input.runtime);
  if (!permission.allowed) return invalid(instance, permission.reason, 'playbook_permission_denied');
  const requirement = inputRequirementMap(definition).get(candidate.key);
  if (!requirement) return invalid(instance, 'Playbook input is not declared.', 'playbook_input_unknown');
  const occurredAt = normalizeIso(input.occurredAt) ?? new Date().toISOString();
  const normalized = normalizeInputValue(candidate, requirement, occurredAt);
  if (!normalized) return invalid(instance, 'Playbook input is invalid.', 'playbook_input_invalid');
  const actor = normalizeActor(input.actor);
  let updated: OperationalPlaybookInstance = {
    ...instance,
    version: instance.version + 1,
    inputSnapshot: { ...instance.inputSnapshot, [normalized.key]: normalized },
    sourceTruth: normalizeSourceTruth([...instance.sourceTruth, ...normalized.sourceTruth]),
    actor,
    updatedAt: occurredAt,
    lastKnownConnectivity: input.runtime.online ? 'online' : 'offline',
  };
  const event = createPlaybookEvent(updated, {
    type: 'input_recorded',
    actor,
    occurredAt,
    summary: `${requirement.label} recorded.`,
    idempotencyKey,
    metadata: { inputKey: requirement.key },
  });
  updated = appendEvent(updated, event);
  return changed(updated, event);
}

export function executeOperationalPlaybookStep(
  definition: OperationalPlaybookDefinition,
  instance: OperationalPlaybookInstance,
  input: ExecuteOperationalPlaybookStepInput,
  runtime: OperationalPlaybookRuntimeContext,
): OperationalPlaybookMutationResult {
  const idempotencyKey = safeKey(input.idempotencyKey);
  if (!idempotencyKey) return invalid(instance, 'Step idempotency key is invalid.', 'playbook_idempotency_invalid');
  if (hasEvent(instance, idempotencyKey)) return unchanged(instance);
  if (instance.state !== 'active') {
    return invalid(instance, 'Playbook must be active before a step can run.', 'playbook_not_active');
  }
  const step = definition.steps.find((candidate) => candidate.id === instance.currentStepId);
  if (!step) return invalid(instance, 'Current playbook step is unavailable.', 'playbook_step_missing');
  const actor = normalizeActor(input.actor);
  const occurredAt = normalizeIso(input.occurredAt) ?? new Date().toISOString();

  const permission = checkStepPermissions(definition, step, runtime);
  if (!permission.allowed) {
    return invalid(instance, permission.reason, 'playbook_permission_denied');
  }
  const missingCapability = definition.requiredCapabilities.find((capability) => !runtime.availableCapabilities.has(capability));
  if (missingCapability) {
    return invalid(instance, `Required capability is unavailable: ${missingCapability}.`, 'playbook_capability_unavailable');
  }

  if (input.action.kind === 'block') {
    return blockStep(definition, instance, step, actor, occurredAt, idempotencyKey, input.action.reason, input.action.reasonCode);
  }
  if (input.action.kind === 'skip') {
    if (!step.skippable) return invalid(instance, 'This playbook step cannot be skipped.', 'playbook_step_not_skippable');
    const reason = boundedText(input.action.reason, 500);
    if (!reason) return invalid(instance, 'A skip reason is required.', 'playbook_skip_reason_required');
    const skipped = {
      stepId: step.id,
      reason,
      actorId: actor.id,
      skippedAt: occurredAt,
    };
    return completeStep(definition, {
      ...instance,
      skippedSteps: mergeSkippedSteps(instance.skippedSteps, skipped),
    }, step, actor, occurredAt, idempotencyKey, {
      type: 'step_skipped',
      summary: `${step.title} skipped: ${reason}`,
      result: null,
      markCompleted: false,
    });
  }

  const inputIssue = stepInputIssue(definition, instance, step, input.action.kind, occurredAt);
  if (inputIssue) {
    return blockStep(definition, instance, step, actor, occurredAt, idempotencyKey, inputIssue.message, inputIssue.code);
  }

  switch (step.type) {
    case 'review_context': {
      if (input.action.kind !== 'complete_review') return wrongAction(instance, step);
      const value = instance.inputSnapshot[step.contextInputKey];
      const context = value?.linkedContext;
      if (!context) return invalid(instance, 'Review context is unavailable.', 'playbook_context_unavailable');
      const result: OperationalPlaybookStepResultData = {
        kind: 'context_reviewed',
        contextId: context.id,
        stale: value.state === 'stale',
      };
      return completeStep(definition, instance, step, actor, occurredAt, idempotencyKey, {
        type: 'context_reviewed', summary: `${step.title} reviewed.`, result,
      });
    }
    case 'request_input': {
      if (input.action.kind !== 'provide_input' || input.action.input.key !== step.inputKey) {
        return wrongAction(instance, step);
      }
      const requirement = inputRequirementMap(definition).get(step.inputKey);
      if (!requirement) return invalid(instance, 'Requested input is not declared.', 'playbook_input_unknown');
      const normalized = normalizeInputValue(input.action.input, requirement, occurredAt);
      if (!normalized) return invalid(instance, 'Requested input is invalid.', 'playbook_input_invalid');
      const withInput: OperationalPlaybookInstance = {
        ...instance,
        inputSnapshot: { ...instance.inputSnapshot, [step.inputKey]: normalized },
        sourceTruth: normalizeSourceTruth([...instance.sourceTruth, ...normalized.sourceTruth]),
      };
      const result: OperationalPlaybookStepResultData = {
        kind: 'input_recorded', inputKey: step.inputKey, inputState: normalized.state,
      };
      return completeStep(definition, withInput, step, actor, occurredAt, idempotencyKey, {
        type: 'input_recorded', summary: `${requirement.label} recorded.`, result,
        metadata: { inputKey: step.inputKey },
      });
    }
    case 'create_command_proposal':
      return executeCommandProposalStep(definition, instance, step, actor, occurredAt, idempotencyKey, input.action);
    case 'assign_role': {
      if (input.action.kind !== 'assign_role') return wrongAction(instance, step);
      const roleId = safeId(input.action.roleId);
      if (!roleId || (step.allowedRoleIds.length > 0 && !step.allowedRoleIds.includes(roleId))) {
        return invalid(instance, 'Selected role is not allowed for this step.', 'playbook_role_invalid');
      }
      const result: OperationalPlaybookStepResultData = {
        kind: 'role_assigned',
        roleId,
        assigneeId: safeId(input.action.assigneeId) ?? undefined,
        label: boundedText(input.action.label, 160) || undefined,
      };
      return completeStep(definition, instance, step, actor, occurredAt, idempotencyKey, {
        type: 'role_assigned', summary: `${step.title} assigned to ${result.label ?? roleId}.`, result,
      });
    }
    case 'request_acknowledgment': {
      if (input.action.kind !== 'request_acknowledgment') return wrongAction(instance, step);
      const targetIds = unique(input.action.targetIds.map((id) => safeId(id)).filter(isString));
      if (targetIds.length === 0) {
        return invalid(instance, 'At least one acknowledgment target is required.', 'playbook_ack_target_missing');
      }
      const requiredCount = step.mode === 'all'
        ? targetIds.length
        : step.mode === 'any'
          ? 1
          : Math.max(1, Math.min(targetIds.length, Math.floor(input.action.requiredCount ?? 1)));
      const result: OperationalPlaybookStepResultData = {
        kind: 'acknowledgment_requested', targetIds, requiredCount,
      };
      return completeStep(definition, instance, step, actor, occurredAt, idempotencyKey, {
        type: 'acknowledgment_requested',
        summary: `Acknowledgment requested from ${targetIds.length} target${targetIds.length === 1 ? '' : 's'}.`,
        result,
      });
    }
    case 'open_context': {
      if (input.action.kind !== 'open_context') return wrongAction(instance, step);
      const value = instance.inputSnapshot[step.contextInputKey];
      const context = value?.linkedContext;
      if (!context || context.restricted) {
        return invalid(instance, 'Linked context is unavailable or restricted.', 'playbook_context_restricted');
      }
      const result: OperationalPlaybookStepResultData = { kind: 'context_opened', contextId: context.id };
      return completeStep(definition, instance, step, actor, occurredAt, idempotencyKey, {
        type: 'context_opened', summary: `${step.title} opened.`, result,
        effect: { kind: 'open_context', context },
      });
    }
    case 'start_deadline': {
      if (input.action.kind !== 'start_deadline') return wrongAction(instance, step);
      const dueAt = normalizeIso(input.action.dueAt);
      if (!dueAt) return invalid(instance, 'Deadline must use a valid absolute timestamp.', 'playbook_deadline_invalid');
      if (Date.parse(dueAt) <= Date.parse(occurredAt)) {
        return invalid(instance, 'Deadline must be later than the recorded action time.', 'playbook_deadline_not_future');
      }
      const windows = MISSION_CLOCK_DEADLINE_WINDOWS[step.deadlineSource];
      const deadlineId = createDispatchEntityId('operational_playbook_event', `${idempotencyKey}:deadline`);
      const deadline = {
        schemaVersion: OPERATIONAL_PLAYBOOK_SCHEMA_VERSION,
        id: deadlineId,
        stepId: step.id,
        expeditionId: instance.expeditionId,
        source: step.deadlineSource,
        title: boundedText(input.action.title, 180) || step.title,
        reason: boundedText(input.action.reason, 500) || step.instructions,
        dueAt,
        warningWindowMs: normalizeWindow(step.warningWindowMs, windows.warningWindowMs),
        criticalWindowMs: normalizeWindow(step.criticalWindowMs, windows.criticalWindowMs),
        priority: 'normal' as const,
        sourceTruth: instance.sourceTruth,
        completionState: 'active' as const,
        createdAt: occurredAt,
      };
      const withDeadline: OperationalPlaybookInstance = {
        ...instance,
        deadlines: boundDeadlines([...instance.deadlines, deadline]),
      };
      const result: OperationalPlaybookStepResultData = {
        kind: 'deadline_started', deadlineId, dueAt,
      };
      return completeStep(definition, withDeadline, step, actor, occurredAt, idempotencyKey, {
        type: 'deadline_started', summary: `${deadline.title} deadline recorded.`, result,
        metadata: { deadlineId }, effect: { kind: 'deadline_started', deadline },
      });
    }
    case 'record_decision': {
      if (input.action.kind !== 'record_decision') return wrongAction(instance, step);
      const decision = boundedText(input.action.decision, 1_000);
      if (!decision) return invalid(instance, 'A decision is required.', 'playbook_decision_missing');
      const result: OperationalPlaybookStepResultData = {
        kind: 'decision_recorded', decisionKey: step.decisionKey, decision,
      };
      return completeStep(definition, instance, step, actor, occurredAt, idempotencyKey, {
        type: 'decision_recorded', summary: `${step.title}: ${decision}`, result,
        metadata: { reasonCode: safeCode(input.action.reasonCode) },
      });
    }
    case 'confirm_action': {
      if (input.action.kind !== 'confirm_action' || input.action.confirmed !== true) return wrongAction(instance, step);
      const summary = boundedText(input.action.summary, 500);
      if (!summary) return invalid(instance, 'Confirmation summary is required.', 'playbook_confirmation_missing');
      const result: OperationalPlaybookStepResultData = { kind: 'action_confirmed', summary };
      return completeStep(definition, instance, step, actor, occurredAt, idempotencyKey, {
        type: 'action_confirmed', summary: `${step.confirmationLabel}: ${summary}`, result,
      });
    }
    case 'resolve': {
      if (input.action.kind !== 'resolve') return wrongAction(instance, step);
      const summary = boundedText(input.action.summary, 1_000);
      if (!summary) return invalid(instance, 'Resolution summary is required.', 'playbook_resolution_missing');
      const result: OperationalPlaybookStepResultData = { kind: 'resolved', summary };
      return completeStep(definition, instance, step, actor, occurredAt, idempotencyKey, {
        type: 'completed', summary, result,
      });
    }
  }
}

export function migrateOperationalPlaybookInstance(
  instance: OperationalPlaybookInstance,
  definition: OperationalPlaybookDefinition,
  migrations: OperationalPlaybookMigration[],
  actor: MissionCommandActor = { id: 'ecs-system', label: 'ECS System', role: 'system' },
  occurredAt = new Date().toISOString(),
): OperationalPlaybookMutationResult {
  const definitionValidation = validateOperationalPlaybookDefinition(definition);
  if (!definitionValidation.valid) {
    return invalid(instance, 'Target playbook definition is invalid.', 'playbook_definition_invalid');
  }
  if (instance.definitionId !== definition.id) {
    return invalid(instance, 'Playbook definition does not match the persisted instance.', 'playbook_definition_mismatch');
  }
  if (instance.definitionVersion === definition.version) return unchanged(instance);
  if (instance.definitionVersion > definition.version) {
    return invalid(instance, 'Persisted playbook uses a newer definition.', 'playbook_definition_future');
  }
  let updated = instance;
  let fromVersion = instance.definitionVersion;
  while (fromVersion < definition.version) {
    const migration = migrations.find((candidate) => (
      candidate.definitionId === definition.id &&
      candidate.fromVersion === fromVersion &&
      candidate.toVersion === fromVersion + 1
    ));
    if (!migration) {
      return invalid(instance, 'Required playbook migration is unavailable.', 'playbook_migration_missing');
    }
    updated = applyMigrationMap(updated, migration);
    fromVersion = migration.toVersion;
  }
  if (!instanceMatchesDefinition(updated, definition)) {
    return invalid(instance, 'Playbook migration leaves unmapped steps or inputs.', 'playbook_migration_incomplete');
  }
  const validStepIds = new Set(definition.steps.map((step) => step.id));
  const currentStepId = updated.currentStepId && validStepIds.has(updated.currentStepId)
    ? updated.currentStepId
    : nextIncompleteStepId(definition, updated.completedStepIds, updated.skippedSteps);
  const normalizedActor = normalizeActor(actor);
  const migrationKey = actionKey(updated, `migrate:${instance.definitionVersion}:${definition.version}`, normalizedActor.id, occurredAt);
  updated = {
    ...updated,
    version: updated.version + 1,
    definitionVersion: definition.version,
    currentStepId,
    actor: normalizedActor,
    updatedAt: normalizeIso(occurredAt) ?? new Date().toISOString(),
  };
  const event = createPlaybookEvent(updated, {
    type: 'migrated',
    actor: normalizedActor,
    occurredAt: updated.updatedAt,
    summary: `Playbook migrated from version ${instance.definitionVersion} to ${definition.version}.`,
    idempotencyKey: migrationKey,
    metadata: {
      fromDefinitionVersion: instance.definitionVersion,
      toDefinitionVersion: definition.version,
    },
  });
  updated = appendEvent(updated, event);
  return changed(updated, event);
}

export function collectOperationalPlaybookDeadlines(
  instance: OperationalPlaybookInstance,
): MissionClockDeadlineInput[] {
  return instance.deadlines.map((deadline) => createMissionClockDeadline({
    id: deadline.id,
    expeditionId: deadline.expeditionId,
    source: deadline.source,
    title: deadline.title,
    reason: deadline.reason,
    dueAt: deadline.dueAt,
    warningWindowMs: deadline.warningWindowMs,
    criticalWindowMs: deadline.criticalWindowMs,
    priority: deadline.priority,
    linkedContext: {
      id: instance.id,
      type: 'command',
      label: 'Operational Playbook',
      restricted: false,
    },
    sourceTruth: deadline.sourceTruth,
    completionState: deadline.completionState,
    completedAt: deadline.completedAt,
    cancelledAt: deadline.cancelledAt,
    updatedAt: instance.updatedAt,
    suggestedAction: {
      code: 'open_operational_playbook',
      label: 'Open the playbook and decide the next explicit action.',
    },
  }));
}

export function linkOperationalPlaybookCommand(
  instance: OperationalPlaybookInstance,
  input: {
    proposalId: string;
    command: MissionCommand;
    actor: MissionCommandActor;
    idempotencyKey: string;
    occurredAt?: string;
  },
): OperationalPlaybookMutationResult {
  const proposalId = safeId(input.proposalId);
  const idempotencyKey = safeKey(input.idempotencyKey);
  if (!proposalId || !idempotencyKey) {
    return invalid(instance, 'Playbook command link identifiers are invalid.', 'playbook_command_link_invalid');
  }
  if (hasEvent(instance, idempotencyKey)) return unchanged(instance);
  const proposal = instance.commandProposals.find((candidate) => candidate.id === proposalId);
  if (!proposal) return invalid(instance, 'Command proposal is unavailable.', 'playbook_proposal_missing');
  if (proposal.status === 'command_created') {
    return proposal.commandId === input.command.id
      ? unchanged(instance)
      : invalid(instance, 'Command proposal is already linked to another command.', 'playbook_command_link_conflict');
  }
  if (proposal.status !== 'confirmed') {
    return invalid(instance, 'Only an explicitly confirmed proposal can be linked.', 'playbook_proposal_unconfirmed');
  }
  if (
    !safeId(input.command.id) ||
    input.command.expeditionId !== instance.expeditionId ||
    input.command.type !== proposal.type ||
    targetFingerprint(input.command.target) !== targetFingerprint(proposal.target) ||
    acknowledgmentFingerprint(input.command.acknowledgmentPolicy) !== acknowledgmentFingerprint(proposal.acknowledgmentPolicy) ||
    (normalizeIso(input.command.deadlineAt) ?? '') !== (normalizeIso(proposal.deadlineAt) ?? '') ||
    (safeId(input.command.linkedContext?.id) ?? '') !== (safeId(proposal.linkedContext?.id) ?? '')
  ) {
    return invalid(instance, 'Created command does not match the confirmed proposal.', 'playbook_command_mismatch');
  }
  const occurredAt = normalizeIso(input.occurredAt) ?? new Date().toISOString();
  const actor = normalizeActor(input.actor);
  const linkedProposal: OperationalPlaybookCommandProposal = {
    ...proposal,
    status: 'command_created',
    commandId: input.command.id,
  };
  let updated: OperationalPlaybookInstance = {
    ...instance,
    version: instance.version + 1,
    commandProposals: instance.commandProposals.map((candidate) => (
      candidate.id === proposal.id ? linkedProposal : candidate
    )),
    relatedCommandId: instance.relatedCommandId ?? input.command.id,
    actor,
    updatedAt: occurredAt,
  };
  const event = createPlaybookEvent(updated, {
    type: 'command_created',
    actor,
    occurredAt,
    summary: `Confirmed proposal linked to Mission Command: ${input.command.title}. Delivery and acknowledgment remain independent.`,
    idempotencyKey,
    stepId: proposal.stepId,
    metadata: { proposalId: proposal.id, commandId: input.command.id },
  });
  updated = appendEvent(updated, event);
  return changed(updated, event);
}

export function mergeOperationalPlaybookInstance(
  instances: OperationalPlaybookInstance[],
  incoming: OperationalPlaybookInstance,
): OperationalPlaybookInstance[] {
  const normalized = normalizePersistedOperationalPlaybookInstance(incoming);
  if (!normalized) return mergeOperationalPlaybookInstanceBatch(instances);
  const index = instances.findIndex((item) => (
    item.id === normalized.id || item.idempotencyKey === normalized.idempotencyKey
  ));
  if (index < 0) return boundInstances([...instances, normalized]);
  const current = instances[index];
  if (!isIncomingInstanceNewer(current, normalized)) return boundInstances(instances);
  if (isTerminalState(current.state) && normalized.state !== current.state) return boundInstances(instances);
  const allowed = current.state === normalized.state || OPERATIONAL_PLAYBOOK_TRANSITIONS[current.state].has(normalized.state);
  if (!allowed) return boundInstances(instances);
  return boundInstances(instances.map((item, itemIndex) => (
    itemIndex === index
      ? { ...normalized, id: current.id, idempotencyKey: current.idempotencyKey }
      : item
  )));
}

export function mergeOperationalPlaybookInstanceBatch(rawInstances: unknown[]): OperationalPlaybookInstance[] {
  return rawInstances.reduce<OperationalPlaybookInstance[]>((instances, raw) => {
    const normalized = normalizePersistedOperationalPlaybookInstance(raw);
    return normalized ? mergeOperationalPlaybookInstance(instances, normalized) : instances;
  }, []);
}

export function normalizePersistedOperationalPlaybookInstance(raw: unknown): OperationalPlaybookInstance | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<OperationalPlaybookInstance>;
  if (
    candidate.schemaVersion !== OPERATIONAL_PLAYBOOK_SCHEMA_VERSION ||
    !isPositiveInteger(candidate.version) ||
    !safeId(candidate.id) ||
    !safeKey(candidate.idempotencyKey) ||
    !safeId(candidate.definitionId) ||
    !isPositiveInteger(candidate.definitionVersion) ||
    !safeId(candidate.expeditionId) ||
    !PLAYBOOK_STATES.includes(candidate.state as OperationalPlaybookState) ||
    !isActor(candidate.actor) ||
    !Array.isArray(candidate.completedStepIds) ||
    !Array.isArray(candidate.skippedSteps) ||
    !Array.isArray(candidate.sourceTruth) ||
    !Array.isArray(candidate.stepResults) ||
    !Array.isArray(candidate.commandProposals) ||
    !Array.isArray(candidate.deadlines) ||
    !Array.isArray(candidate.eventHistory) ||
    !isRecord(candidate.inputSnapshot) ||
    !normalizeIso(candidate.createdAt) ||
    !normalizeIso(candidate.updatedAt)
  ) return null;

  const inputSnapshot: Record<string, OperationalPlaybookInputValue> = {};
  for (const [key, value] of Object.entries(candidate.inputSnapshot)) {
    const normalized = normalizePersistedInputValue(value);
    if (!normalized || normalized.key !== key) return null;
    inputSnapshot[key] = normalized;
  }
  const completedStepIds = candidate.completedStepIds.map(safeId);
  const skippedSteps = candidate.skippedSteps.map(normalizeSkippedStep);
  const stepResults = candidate.stepResults.map(normalizeStepResult);
  const commandProposals = candidate.commandProposals.map(normalizeProposal);
  const deadlines = candidate.deadlines.map(normalizeDeadline);
  const events = candidate.eventHistory.map(normalizeEvent);
  if (completedStepIds.some((value) => !value) || skippedSteps.some((value) => !value) ||
      stepResults.some((value) => !value) || commandProposals.some((value) => !value) ||
      deadlines.some((value) => !value) || events.some((value) => !value) ||
      candidate.sourceTruth.some((value) => !value || typeof value !== 'object' || !safeId(value.id)) ||
      deadlines.filter(isDefined).some((value) => value.expeditionId !== candidate.expeditionId) ||
      events.filter(isDefined).some((value) => (
        value.instanceId !== candidate.id || value.expeditionId !== candidate.expeditionId
      )) ||
      completedStepIds.filter(isString).some((stepId) => skippedSteps.filter(isDefined).some((step) => step.stepId === stepId)) ||
      (candidate.currentStepId != null && !safeId(candidate.currentStepId)) ||
      (candidate.relatedCommandId != null && !safeId(candidate.relatedCommandId)) ||
      (candidate.relatedIncidentId != null && !safeId(candidate.relatedIncidentId)) ||
      (candidate.blockedStep != null && !normalizeBlockedStep(candidate.blockedStep))) return null;
  const state = candidate.state as OperationalPlaybookState;
  const completedAt = normalizeIso(candidate.completedAt);
  const cancelledAt = normalizeIso(candidate.cancelledAt);
  if (state === 'completed' && !completedAt) return null;
  if (state === 'cancelled' && !cancelledAt) return null;

  return {
    schemaVersion: OPERATIONAL_PLAYBOOK_SCHEMA_VERSION,
    version: Math.floor(Number(candidate.version)),
    id: safeId(candidate.id)!,
    idempotencyKey: safeKey(candidate.idempotencyKey)!,
    definitionId: safeId(candidate.definitionId)!,
    definitionVersion: Math.floor(Number(candidate.definitionVersion)),
    expeditionId: safeId(candidate.expeditionId)!,
    relatedCommandId: safeId(candidate.relatedCommandId) ?? undefined,
    relatedIncidentId: safeId(candidate.relatedIncidentId) ?? undefined,
    state,
    currentStepId: candidate.currentStepId == null ? null : safeId(candidate.currentStepId),
    completedStepIds: unique(completedStepIds.filter(isString)),
    skippedSteps: skippedSteps.filter(isDefined),
    blockedStep: normalizeBlockedStep(candidate.blockedStep),
    inputSnapshot,
    sourceTruth: normalizeSourceTruth(candidate.sourceTruth),
    actor: normalizeActor(candidate.actor),
    stepResults: stepResults.filter(isDefined)
      .slice(-OPERATIONAL_PLAYBOOK_RETENTION_LIMITS.resultsPerInstance),
    commandProposals: commandProposals.filter(isDefined)
      .slice(-OPERATIONAL_PLAYBOOK_RETENTION_LIMITS.proposalsPerInstance),
    deadlines: deadlines.filter(isDefined)
      .slice(-OPERATIONAL_PLAYBOOK_RETENTION_LIMITS.deadlinesPerInstance),
    eventHistory: normalizeEvents(events.filter(isDefined)),
    lastKnownConnectivity: ['online', 'offline', 'unknown'].includes(String(candidate.lastKnownConnectivity))
      ? candidate.lastKnownConnectivity as OperationalPlaybookInstance['lastKnownConnectivity']
      : 'unknown',
    createdAt: normalizeIso(candidate.createdAt)!,
    updatedAt: normalizeIso(candidate.updatedAt)!,
    startedAt: normalizeIso(candidate.startedAt),
    completedAt,
    cancelledAt,
    cancellationReason: boundedText(candidate.cancellationReason, 500) || undefined,
  };
}

function executeCommandProposalStep(
  definition: OperationalPlaybookDefinition,
  instance: OperationalPlaybookInstance,
  step: Extract<OperationalPlaybookStepDefinition, { type: 'create_command_proposal' }>,
  actor: MissionCommandActor,
  occurredAt: string,
  idempotencyKey: string,
  action: ExecuteOperationalPlaybookStepInput['action'],
): OperationalPlaybookMutationResult {
  if (action.kind === 'prepare_command_proposal') {
    const existing = instance.commandProposals.find((proposal) => proposal.stepId === step.id && proposal.status !== 'cancelled');
    if (existing) return unchanged(instance);
    const linkedValue = step.proposal.linkedContextInputKey
      ? instance.inputSnapshot[step.proposal.linkedContextInputKey]
      : undefined;
    if (linkedValue?.state === 'restricted' || linkedValue?.linkedContext?.restricted) {
      return invalid(instance, 'Restricted context cannot be attached to a command proposal.', 'playbook_context_restricted');
    }
    const deadlineValue = step.proposal.deadlineInputKey
      ? instance.inputSnapshot[step.proposal.deadlineInputKey]
      : undefined;
    const deadlineAt = deadlineValue?.kind === 'timestamp' && typeof deadlineValue.scalarValue === 'string'
      ? normalizeIso(deadlineValue.scalarValue)
      : undefined;
    const target = resolveProposalTarget(step.proposal, instance);
    if (!target) {
      return invalid(instance, 'Command proposal target is unavailable.', 'playbook_proposal_target_unavailable');
    }
    const acknowledgmentPolicy = resolveProposalAcknowledgmentPolicy(step.proposal, target);
    if (!acknowledgmentPolicy) {
      return invalid(instance, 'Command proposal acknowledgment policy is unavailable.', 'playbook_proposal_acknowledgment_invalid');
    }
    const proposalId = createDispatchEntityId('operational_playbook_event', `${idempotencyKey}:proposal`);
    const proposal: OperationalPlaybookCommandProposal = {
      schemaVersion: OPERATIONAL_PLAYBOOK_SCHEMA_VERSION,
      id: proposalId,
      stepId: step.id,
      type: step.proposal.type,
      priority: step.proposal.priority,
      title: boundedText(step.proposal.title, 180),
      instructions: boundedText(step.proposal.instructions, 2_000),
      target,
      acknowledgmentPolicy,
      deadlineAt,
      linkedContext: linkedValue?.linkedContext,
      sourceTruth: normalizeSourceTruth([
        ...instance.sourceTruth,
        ...(linkedValue?.sourceTruth ?? []),
        ...(deadlineValue?.sourceTruth ?? []),
      ]),
      status: 'proposed',
      proposedAt: occurredAt,
      proposedBy: actor,
    };
    let updated: OperationalPlaybookInstance = {
      ...instance,
      version: instance.version + 1,
      commandProposals: boundProposals([...instance.commandProposals, proposal]),
      actor,
      updatedAt: occurredAt,
    };
    const event = createPlaybookEvent(updated, {
      type: 'command_proposed', actor, occurredAt,
      summary: `Command proposal prepared: ${proposal.title}.`,
      idempotencyKey,
      stepId: step.id,
      metadata: { proposalId },
    });
    updated = appendEvent(updated, event);
    return changed(updated, event);
  }
  if (action.kind !== 'confirm_command_proposal' || action.confirmed !== true) return wrongAction(instance, step);
  const proposal = instance.commandProposals.find((candidate) => candidate.id === action.proposalId && candidate.stepId === step.id);
  if (!proposal) return invalid(instance, 'Command proposal is unavailable.', 'playbook_proposal_missing');
  if (proposal.status === 'confirmed' || proposal.status === 'command_created') return unchanged(instance);
  if (proposal.status !== 'proposed') return invalid(instance, 'Command proposal cannot be confirmed.', 'playbook_proposal_invalid');
  const confirmed: OperationalPlaybookCommandProposal = {
    ...proposal,
    status: 'confirmed',
    confirmedAt: occurredAt,
    confirmedBy: actor,
  };
  const withConfirmation: OperationalPlaybookInstance = {
    ...instance,
    commandProposals: instance.commandProposals.map((candidate) => candidate.id === confirmed.id ? confirmed : candidate),
  };
  const result: OperationalPlaybookStepResultData = {
    kind: 'command_proposal', proposalId: confirmed.id, status: 'confirmed',
  };
  return completeStep(definition, withConfirmation, step, actor, occurredAt, idempotencyKey, {
    type: 'command_confirmed',
    summary: `Command proposal confirmed: ${confirmed.title}. No command was sent.`,
    result,
    metadata: { proposalId: confirmed.id },
    effect: { kind: 'command_proposal_confirmed', proposal: confirmed },
  });
}

function resolveProposalTarget(
  template: Extract<OperationalPlaybookStepDefinition, { type: 'create_command_proposal' }>['proposal'],
  instance: OperationalPlaybookInstance,
): MissionCommandTarget | null {
  if (template.target) return normalizeMissionCommandTarget(template.target);
  const resolver = template.targetFromInputs;
  if (!resolver) return null;
  const memberIds = unique(resolver.inputKeys.flatMap((key) => {
    const value = instance.inputSnapshot[key];
    if (!value || !['available', 'stale'].includes(value.state) || value.kind !== 'member_id') return [];
    const memberId = safeId(value.scalarValue);
    return memberId ? [memberId] : [];
  }));
  if (memberIds.length < (resolver.minimumTargets ?? 1)) return null;
  const label = boundedText(resolver.label, 160) || undefined;
  return resolver.kind === 'member'
    ? { kind: 'member', memberId: memberIds[0], label }
    : { kind: 'team', memberIds, label };
}

function resolveProposalAcknowledgmentPolicy(
  template: Extract<OperationalPlaybookStepDefinition, { type: 'create_command_proposal' }>['proposal'],
  target: MissionCommandTarget,
): MissionCommandAcknowledgmentPolicy | null {
  if (template.acknowledgmentPolicy) return normalizeAcknowledgmentPolicy(template.acknowledgmentPolicy);
  const memberIds = targetMemberIds(target);
  const derived = template.acknowledgmentFromTarget;
  if (!derived || derived.mode === 'none') return { mode: 'none', targetMemberIds: [] };
  if (memberIds.length === 0) return null;
  if (derived.mode === 'count') {
    const requiredCount = Number(derived.requiredCount);
    if (!Number.isInteger(requiredCount) || requiredCount < 1 || requiredCount > memberIds.length) return null;
    return { mode: 'count', targetMemberIds: memberIds, requiredCount };
  }
  return { mode: derived.mode, targetMemberIds: memberIds };
}

function targetMemberIds(target: MissionCommandTarget): string[] {
  if (target.kind === 'member' || target.kind === 'solo') return [target.memberId];
  if (target.kind === 'team') return unique(target.memberIds.map(safeId).filter(isString));
  return [];
}

function targetFingerprint(target: MissionCommandTarget | undefined): string {
  if (!target) return '';
  if (target.kind === 'member' || target.kind === 'solo') return `${target.kind}:${target.memberId}`;
  if (target.kind === 'role') return `role:${target.roleId}`;
  if (target.kind === 'vehicle') return `vehicle:${target.vehicleId}`;
  return `team:${[...target.memberIds].sort().join(',')}`;
}

function acknowledgmentFingerprint(policy: MissionCommandAcknowledgmentPolicy | undefined): string {
  if (!policy) return '';
  return [
    policy.mode,
    [...policy.targetMemberIds].sort().join(','),
    policy.requiredCount ?? '',
    policy.roleId ?? '',
  ].join(':');
}

function completeStep(
  definition: OperationalPlaybookDefinition,
  instance: OperationalPlaybookInstance,
  step: OperationalPlaybookStepDefinition,
  actor: MissionCommandActor,
  occurredAt: string,
  idempotencyKey: string,
  input: {
    type: OperationalPlaybookEventType;
    summary: string;
    result: OperationalPlaybookStepResultData | null;
    metadata?: OperationalPlaybookEventMetadata;
    effect?: OperationalPlaybookEffect;
    markCompleted?: boolean;
  },
): OperationalPlaybookMutationResult {
  if (instance.completedStepIds.includes(step.id)) return unchanged(instance);
  const completedStepIds = input.markCompleted === false
    ? instance.completedStepIds
    : unique([...instance.completedStepIds, step.id]);
  const result: OperationalPlaybookStepResult | null = input.result ? {
    stepId: step.id,
    stepType: step.type,
    completedAt: occurredAt,
    actorId: actor.id,
    summary: boundedText(input.summary, 500),
    data: input.result,
  } : null;
  const nextStepId = nextIncompleteStepId(definition, completedStepIds, instance.skippedSteps);
  let nextState: OperationalPlaybookState = instance.state;
  const completionCandidate: OperationalPlaybookInstance = {
    ...instance,
    completedStepIds,
    currentStepId: nextStepId,
  };
  if (canCompletePlaybook(definition, completionCandidate)) nextState = 'completed';
  let updated: OperationalPlaybookInstance = {
    ...completionCandidate,
    version: instance.version + 1,
    state: nextState,
    blockedStep: undefined,
    actor,
    updatedAt: occurredAt,
    completedAt: nextState === 'completed' ? occurredAt : instance.completedAt,
    deadlines: nextState === 'completed'
      ? closeActiveDeadlines(instance.deadlines, 'completed', occurredAt)
      : instance.deadlines,
    stepResults: result
      ? [...instance.stepResults, result].slice(-OPERATIONAL_PLAYBOOK_RETENTION_LIMITS.resultsPerInstance)
      : instance.stepResults,
  };
  let event = createPlaybookEvent(updated, {
    type: input.type,
    actor,
    occurredAt,
    summary: input.summary,
    idempotencyKey,
    stepId: step.id,
    metadata: input.metadata,
  });
  updated = appendEvent(updated, event);
  if (nextState === 'completed' && input.type !== 'completed') {
    event = createPlaybookEvent(updated, {
      type: 'completed', actor, occurredAt,
      summary: `${definition.title} completed.`,
      idempotencyKey: `${idempotencyKey}:completed`,
      stepId: step.id,
    });
    updated = appendEvent(updated, event);
  }
  return changed(updated, event, input.effect ?? null);
}

function blockStep(
  definition: OperationalPlaybookDefinition,
  instance: OperationalPlaybookInstance,
  step: OperationalPlaybookStepDefinition,
  actor: MissionCommandActor,
  occurredAt: string,
  idempotencyKey: string,
  reasonInput: string,
  reasonCodeInput?: string,
): OperationalPlaybookMutationResult {
  const reason = boundedText(reasonInput, 500) || 'Required playbook data is unavailable.';
  const reasonCode = safeCode(reasonCodeInput) ?? 'playbook_step_blocked';
  const blockedStep: OperationalPlaybookBlockedStep = { stepId: step.id, reason, reasonCode, blockedAt: occurredAt };
  let updated: OperationalPlaybookInstance = {
    ...instance,
    version: instance.version + 1,
    state: 'blocked',
    blockedStep,
    actor,
    updatedAt: occurredAt,
  };
  const event = createPlaybookEvent(updated, {
    type: 'blocked', actor, occurredAt,
    summary: `${definition.title} blocked at ${step.title}: ${reason}`,
    idempotencyKey,
    stepId: step.id,
    metadata: { reasonCode },
  });
  updated = appendEvent(updated, event);
  return changed(updated, event);
}

function stepInputIssue(
  definition: OperationalPlaybookDefinition,
  instance: OperationalPlaybookInstance,
  step: OperationalPlaybookStepDefinition,
  actionKind: ExecuteOperationalPlaybookStepInput['action']['kind'],
  now: string,
): { code: string; message: string } | null {
  if (step.type === 'request_input' && actionKind === 'provide_input') return null;
  const requirements = inputRequirementMap(definition);
  for (const key of step.requiredInputKeys) {
    const requirement = requirements.get(key);
    const value = instance.inputSnapshot[key];
    if (!requirement || !value || value.state === 'missing') {
      return { code: 'playbook_required_input_missing', message: `Required input is missing: ${key}.` };
    }
    const state = resolveOperationalPlaybookInputState(value, requirement, now);
    if (state === 'restricted') return { code: 'playbook_input_restricted', message: `${requirement.label} is restricted.` };
    if (state === 'unavailable') return { code: 'playbook_input_unavailable', message: `${requirement.label} is unavailable.` };
    if (state === 'conflicting') return { code: 'playbook_input_conflicting', message: `${requirement.label} has conflicting sources.` };
    if (state === 'stale' && !requirement.allowStale) {
      return { code: 'playbook_input_stale', message: `${requirement.label} is stale and requires review.` };
    }
    if (value.manual && !requirement.allowManual) {
      return { code: 'playbook_manual_input_not_allowed', message: `${requirement.label} does not allow manual data.` };
    }
  }
  return null;
}

function checkStepPermissions(
  definition: OperationalPlaybookDefinition,
  step: OperationalPlaybookStepDefinition,
  runtime: OperationalPlaybookRuntimeContext,
): { allowed: boolean; reason: string } {
  for (const permission of unique([...definition.requiredPermissions, ...step.requiredPermissions])) {
    const result = runtime.permissions.can(permission);
    if (!result.allowed) return { allowed: false, reason: result.reason ?? 'Playbook permission denied.' };
  }
  return { allowed: true, reason: '' };
}

function checkDefinitionPermissions(
  definition: OperationalPlaybookDefinition,
  runtime: OperationalPlaybookRuntimeContext,
): { allowed: boolean; reason: string } {
  for (const permission of unique(definition.requiredPermissions)) {
    const result = runtime.permissions.can(permission);
    if (!result.allowed) return { allowed: false, reason: result.reason ?? 'Playbook permission denied.' };
  }
  return { allowed: true, reason: '' };
}

function createPlaybookEvent(
  instance: OperationalPlaybookInstance,
  input: {
    type: OperationalPlaybookEventType;
    actor: MissionCommandActor;
    occurredAt: string;
    summary: string;
    idempotencyKey: string;
    stepId?: string;
    metadata?: OperationalPlaybookEventMetadata;
  },
): OperationalPlaybookEvent {
  const idempotencyKey = safeKey(input.idempotencyKey) ?? actionKey(instance, input.type, input.actor.id, input.occurredAt);
  return {
    schemaVersion: OPERATIONAL_PLAYBOOK_SCHEMA_VERSION,
    id: createDispatchEntityId('operational_playbook_event', idempotencyKey),
    idempotencyKey,
    instanceId: instance.id,
    expeditionId: instance.expeditionId,
    type: input.type,
    state: instance.state,
    stepId: safeId(input.stepId) ?? undefined,
    actor: normalizeActor(input.actor),
    occurredAt: normalizeIso(input.occurredAt) ?? instance.updatedAt,
    summary: boundedText(input.summary, 500) || 'Operational Playbook updated.',
    metadata: normalizeEventMetadata(input.metadata),
  };
}

function appendEvent(instance: OperationalPlaybookInstance, event: OperationalPlaybookEvent): OperationalPlaybookInstance {
  if (instance.eventHistory.some((candidate) => (
    candidate.id === event.id || candidate.idempotencyKey === event.idempotencyKey
  ))) return instance;
  return {
    ...instance,
    eventHistory: normalizeEvents([...instance.eventHistory, event]),
  };
}

export function resolveOperationalPlaybookInputState(
  value: OperationalPlaybookInputValue,
  requirement: OperationalPlaybookInputRequirement,
  now: string | number | Date,
): OperationalPlaybookInputState {
  if (value.state === 'restricted' || value.linkedContext?.restricted) return 'restricted';
  if (value.state === 'missing') return 'missing';
  if (value.state === 'conflicting') return 'conflicting';
  const assessment = assessSourceTruth(value.sourceTruth, {
    policyKey: requirement.sourceTruthPolicyKey,
    now,
  });
  if (assessment.conflict) return 'conflicting';
  if (assessment.availability === 'unavailable' || assessment.freshness === 'unavailable') return 'unavailable';
  if (assessment.freshness === 'stale' || assessment.freshness === 'expired') return 'stale';
  return value.state === 'stale' ? 'stale' : 'available';
}

function normalizeInputValue(
  candidate: OperationalPlaybookInputValue,
  requirement: OperationalPlaybookInputRequirement,
  fallbackCapturedAt: string,
): OperationalPlaybookInputValue | null {
  if (!candidate || candidate.schemaVersion !== OPERATIONAL_PLAYBOOK_SCHEMA_VERSION || candidate.key !== requirement.key ||
      candidate.kind !== requirement.kind || !INPUT_STATES.includes(candidate.state) || !isActor(candidate.capturedBy)) {
    return null;
  }
  const capturedAt = normalizeIso(candidate.capturedAt) ?? fallbackCapturedAt;
  let linkedContext = candidate.linkedContext ? sanitizeMissionCommandLinkedContext(candidate.linkedContext) : undefined;
  let state = candidate.state;
  let scalarValue = normalizeScalarValue(candidate.scalarValue, requirement.kind);
  if (requirement.kind === 'linked_context') {
    scalarValue = undefined;
    if (!linkedContext && state !== 'missing' && state !== 'unavailable') state = 'unavailable';
    if (linkedContext?.restricted) state = 'restricted';
  } else if (scalarValue == null && state !== 'missing' && state !== 'unavailable') {
    state = 'unavailable';
  }
  const candidateSourceTruth = Array.isArray(candidate.sourceTruth) ? candidate.sourceTruth : [];
  const sourceTruth = normalizeSourceTruth(candidateSourceTruth.length > 0
    ? candidateSourceTruth
    : [fallbackSourceTruth(requirement, candidate.manual, capturedAt)]);
  const value: OperationalPlaybookInputValue = {
    schemaVersion: OPERATIONAL_PLAYBOOK_SCHEMA_VERSION,
    key: requirement.key,
    kind: requirement.kind,
    state,
    scalarValue,
    linkedContext,
    sourceTruth,
    observedAt: normalizeIso(candidate.observedAt),
    capturedAt,
    capturedBy: normalizeActor(candidate.capturedBy),
    manual: candidate.manual === true,
  };
  return value;
}

function normalizePersistedInputValue(raw: unknown): OperationalPlaybookInputValue | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<OperationalPlaybookInputValue>;
  if (
    candidate.schemaVersion !== OPERATIONAL_PLAYBOOK_SCHEMA_VERSION ||
    !safeId(candidate.key) ||
    !['text', 'number', 'boolean', 'timestamp', 'member_id', 'role_id', 'vehicle_id', 'linked_context'].includes(String(candidate.kind)) ||
    !INPUT_STATES.includes(candidate.state as OperationalPlaybookInputState) ||
    !Array.isArray(candidate.sourceTruth) ||
    !isActor(candidate.capturedBy) ||
    !normalizeIso(candidate.capturedAt)
  ) return null;
  const requirement: OperationalPlaybookInputRequirement = {
    key: candidate.key!, label: candidate.key!, description: candidate.key!, kind: candidate.kind!,
    allowManual: true, allowStale: true, sensitive: candidate.kind === 'linked_context',
  };
  return normalizeInputValue(candidate as OperationalPlaybookInputValue, requirement, candidate.capturedAt!);
}

function fallbackSourceTruth(
  requirement: OperationalPlaybookInputRequirement,
  manual: boolean,
  observedAt: string,
): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id: `playbook-input-${requirement.key}`,
    origin: manual ? 'manual' : 'unavailable',
    role: 'primary',
    policyKey: requirement.sourceTruthPolicyKey ?? 'manual_user_state',
    authority: manual ? 'ECS operator' : 'Unavailable',
    authorityKind: manual ? 'user' : 'unknown',
    observedAt,
    fetchedAt: null,
    expiresAt: null,
    confidence: manual ? 'medium' : 'unknown',
    coverage: 'unknown',
    availability: manual ? 'usable' : 'unavailable',
    conflictState: 'none',
    warningCodes: [manual ? 'manual_source' : 'missing_source_truth'],
  });
}

function validateSpecializedStep(
  step: OperationalPlaybookStepDefinition,
  inputKeys: Set<string>,
  inputRequirementsByKey: Map<string, OperationalPlaybookInputRequirement>,
  issue: (code: string, message: string, field?: string) => void,
  field: string,
) {
  if (!step || !STEP_TYPES.includes(step.type)) return;
  if ((step.type === 'review_context' || step.type === 'open_context') && !inputKeys.has(step.contextInputKey)) {
    issue('playbook_context_input_unknown', 'Context step references an unknown input.', field);
  }
  if (step.type === 'request_input' && !inputKeys.has(step.inputKey)) {
    issue('playbook_request_input_unknown', 'Input step references an unknown input.', field);
  }
  if (step.type === 'create_command_proposal') {
    if (!step.proposal || !boundedText(step.proposal.title, 180) || !boundedText(step.proposal.instructions, 2_000)) {
      issue('playbook_proposal_invalid', 'Command proposal template is invalid.', field);
    } else if (!isMissionCommandType(step.proposal.type) || !isDispatchPriority(step.proposal.priority) ||
        (step.proposal.target != null && !normalizeMissionCommandTarget(step.proposal.target)) ||
        (step.proposal.acknowledgmentPolicy != null && !normalizeAcknowledgmentPolicy(step.proposal.acknowledgmentPolicy))) {
      issue('playbook_proposal_invalid', 'Command proposal fields are invalid.', field);
    }
    if (step.proposal.target != null && step.proposal.targetFromInputs != null) {
      issue('playbook_proposal_target_conflict', 'Proposal must use either a static or input-derived target.', field);
    }
    if (step.proposal.acknowledgmentPolicy != null && step.proposal.acknowledgmentFromTarget != null) {
      issue('playbook_proposal_acknowledgment_conflict', 'Proposal must use one acknowledgment policy source.', field);
    }
    if (step.proposal.target == null && step.proposal.targetFromInputs == null) {
      issue('playbook_proposal_target_missing', 'Proposal requires a static or input-derived target.', field);
    }
    const targetFromInputs = step.proposal.targetFromInputs;
    if (targetFromInputs) {
      const minimumTargets = targetFromInputs.minimumTargets ?? 1;
      if (!['member', 'team'].includes(targetFromInputs.kind) ||
          !Array.isArray(targetFromInputs.inputKeys) || targetFromInputs.inputKeys.length === 0 ||
          !Number.isInteger(minimumTargets) || minimumTargets < 1 || minimumTargets > targetFromInputs.inputKeys.length) {
        issue('playbook_proposal_target_resolver_invalid', 'Input-derived target configuration is invalid.', field);
      }
      for (const key of targetFromInputs.inputKeys ?? []) {
        if (!inputKeys.has(key) || inputRequirementsByKey.get(key)?.kind !== 'member_id') {
          issue('playbook_proposal_target_input_invalid', `Proposal target input must be a declared member ID: ${key}.`, field);
        }
      }
      if (targetFromInputs.kind === 'member' && targetFromInputs.inputKeys.length !== 1) {
        issue('playbook_proposal_member_target_invalid', 'Member target resolution requires exactly one input.', field);
      }
    }
    const acknowledgmentFromTarget = step.proposal.acknowledgmentFromTarget;
    if (acknowledgmentFromTarget) {
      if (!['none', 'any', 'all', 'count'].includes(acknowledgmentFromTarget.mode) ||
          (acknowledgmentFromTarget.mode === 'count' &&
            (!Number.isInteger(acknowledgmentFromTarget.requiredCount) || Number(acknowledgmentFromTarget.requiredCount) < 1))) {
        issue('playbook_proposal_acknowledgment_invalid', 'Target-derived acknowledgment policy is invalid.', field);
      }
    }
    for (const key of [step.proposal.linkedContextInputKey, step.proposal.deadlineInputKey].filter(isString)) {
      if (!inputKeys.has(key)) issue('playbook_proposal_input_unknown', `Proposal references unknown input: ${key}.`, field);
    }
  }
  if (step.type === 'assign_role' && !Array.isArray(step.allowedRoleIds)) {
    issue('playbook_roles_invalid', 'Role assignment step must declare allowed roles.', field);
  }
  if (step.type === 'request_acknowledgment' && !['any', 'all', 'count'].includes(String(step.mode))) {
    issue('playbook_acknowledgment_mode_invalid', 'Acknowledgment mode is invalid.', field);
  }
  if (step.type === 'start_deadline' && !MISSION_CLOCK_SOURCES.includes(step.deadlineSource)) {
    issue('playbook_deadline_source_invalid', 'Deadline source is invalid.', field);
  }
  if (step.type === 'record_decision' && !safeId(step.decisionKey)) {
    issue('playbook_decision_key_invalid', 'Decision key is invalid.', field);
  }
  if (step.type === 'confirm_action' && !boundedText(step.confirmationLabel, 180)) {
    issue('playbook_confirmation_invalid', 'Confirmation label is required.', field);
  }
}

function isValidInputRequirement(value: OperationalPlaybookInputRequirement): boolean {
  return Boolean(value && safeId(value.key) && boundedText(value.label, 160) && boundedText(value.description, 500) &&
    ['text', 'number', 'boolean', 'timestamp', 'member_id', 'role_id', 'vehicle_id', 'linked_context'].includes(value.kind) &&
    typeof value.allowManual === 'boolean' && typeof value.allowStale === 'boolean' && typeof value.sensitive === 'boolean' &&
    (value.kind !== 'linked_context' || value.sensitive === true));
}

function isValidStepBase(step: OperationalPlaybookStepDefinition): boolean {
  return Boolean(step && safeId(step.id) && STEP_TYPES.includes(step.type) && boundedText(step.title, 180) &&
    boundedText(step.instructions, 1_000) && Array.isArray(step.requiredInputKeys) &&
    step.requiredInputKeys.every((key) => Boolean(safeId(key))) && Array.isArray(step.requiredPermissions) &&
    step.requiredPermissions.every((permission) => DISPATCH_PERMISSION_ACTIONS.includes(permission)) &&
    Array.isArray(step.dependsOnStepIds) && step.dependsOnStepIds.every((id) => Boolean(safeId(id))) &&
    typeof step.skippable === 'boolean');
}

function canCompletePlaybook(definition: OperationalPlaybookDefinition, instance: OperationalPlaybookInstance): boolean {
  const done = new Set([
    ...instance.completedStepIds,
    ...instance.skippedSteps.map((step) => step.stepId),
  ]);
  if (definition.completionRules.mode === 'all_required_steps') {
    return definition.completionRules.requiredStepIds.every((id) => done.has(id));
  }
  return done.has(definition.completionRules.resolveStepId) &&
    definition.completionRules.prerequisiteStepIds.every((id) => done.has(id));
}

function nextIncompleteStepId(
  definition: OperationalPlaybookDefinition,
  completedStepIds: string[],
  skippedSteps: { stepId: string }[],
): string | null {
  const done = new Set([...completedStepIds, ...skippedSteps.map((item) => item.stepId)]);
  return definition.steps.find((step) => !done.has(step.id) && step.dependsOnStepIds.every((id) => done.has(id)))?.id ?? null;
}

function applyMigrationMap(
  instance: OperationalPlaybookInstance,
  migration: OperationalPlaybookMigration,
): OperationalPlaybookInstance {
  const mapStep = (id: string | null | undefined) => id ? migration.stepIdMap?.[id] ?? id : id;
  const mapInput = (key: string) => migration.inputKeyMap?.[key] ?? key;
  const inputSnapshot = Object.fromEntries(Object.entries(instance.inputSnapshot).map(([key, value]) => {
    const nextKey = mapInput(key);
    return [nextKey, { ...value, key: nextKey }];
  }));
  return {
    ...instance,
    definitionVersion: migration.toVersion,
    currentStepId: mapStep(instance.currentStepId) ?? null,
    completedStepIds: unique(instance.completedStepIds.map((id) => mapStep(id)).filter(isString)),
    skippedSteps: instance.skippedSteps.map((item) => ({ ...item, stepId: mapStep(item.stepId) ?? item.stepId })),
    blockedStep: instance.blockedStep
      ? { ...instance.blockedStep, stepId: mapStep(instance.blockedStep.stepId) ?? instance.blockedStep.stepId }
      : undefined,
    stepResults: instance.stepResults.map((result) => ({ ...result, stepId: mapStep(result.stepId) ?? result.stepId })),
    commandProposals: instance.commandProposals.map((proposal) => ({ ...proposal, stepId: mapStep(proposal.stepId) ?? proposal.stepId })),
    deadlines: instance.deadlines.map((deadline) => ({ ...deadline, stepId: mapStep(deadline.stepId) ?? deadline.stepId })),
    eventHistory: instance.eventHistory.map((event) => ({ ...event, stepId: mapStep(event.stepId) ?? undefined })),
    inputSnapshot,
  };
}

function instanceMatchesDefinition(
  instance: OperationalPlaybookInstance,
  definition: OperationalPlaybookDefinition,
): boolean {
  const stepIds = new Set(definition.steps.map((step) => step.id));
  const inputKeys = new Set([
    ...definition.requiredInputs.map((input) => input.key),
    ...definition.optionalInputs.map((input) => input.key),
  ]);
  const referencedStepIds = [
    instance.currentStepId,
    ...instance.completedStepIds,
    ...instance.skippedSteps.map((step) => step.stepId),
    instance.blockedStep?.stepId,
    ...instance.stepResults.map((result) => result.stepId),
    ...instance.commandProposals.map((proposal) => proposal.stepId),
    ...instance.deadlines.map((deadline) => deadline.stepId),
    ...instance.eventHistory.map((event) => event.stepId),
  ].filter(isString);
  return referencedStepIds.every((stepId) => stepIds.has(stepId)) &&
    Object.keys(instance.inputSnapshot).every((key) => inputKeys.has(key));
}

function normalizeProposal(raw: unknown): OperationalPlaybookCommandProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<OperationalPlaybookCommandProposal>;
  if (value.schemaVersion !== 1 || !safeId(value.id) || !safeId(value.stepId) ||
      !['proposed', 'confirmed', 'cancelled', 'command_created'].includes(String(value.status)) ||
      !normalizeIso(value.proposedAt) || !isActor(value.proposedBy) || !Array.isArray(value.sourceTruth) ||
      !isMissionCommandType(value.type) || !isDispatchPriority(value.priority) ||
      !boundedText(value.title, 180) || !boundedText(value.instructions, 2_000)) return null;
  const normalizedTarget = value.target == null ? undefined : normalizeMissionCommandTarget(value.target);
  if (value.target != null && !normalizedTarget) return null;
  const target = normalizedTarget ?? undefined;
  const normalizedAcknowledgmentPolicy = value.acknowledgmentPolicy == null
    ? undefined
    : normalizeAcknowledgmentPolicy(value.acknowledgmentPolicy);
  if (value.acknowledgmentPolicy != null && !normalizedAcknowledgmentPolicy) return null;
  const acknowledgmentPolicy = normalizedAcknowledgmentPolicy ?? undefined;
  const linkedContext = value.linkedContext ? sanitizeMissionCommandLinkedContext(value.linkedContext) : undefined;
  if (linkedContext?.restricted) return null;
  const confirmedAt = normalizeIso(value.confirmedAt);
  const confirmedBy = value.confirmedBy && isActor(value.confirmedBy) ? normalizeActor(value.confirmedBy) : undefined;
  if ((value.status === 'confirmed' || value.status === 'command_created') && (!confirmedAt || !confirmedBy)) return null;
  if (value.status === 'command_created' && !safeId(value.commandId)) return null;
  return {
    schemaVersion: 1,
    id: safeId(value.id)!,
    stepId: safeId(value.stepId)!,
    type: value.type!,
    priority: value.priority!,
    title: boundedText(value.title, 180),
    instructions: boundedText(value.instructions, 2_000),
    target,
    acknowledgmentPolicy,
    deadlineAt: normalizeIso(value.deadlineAt),
    linkedContext,
    sourceTruth: normalizeSourceTruth(value.sourceTruth),
    status: value.status!,
    proposedAt: normalizeIso(value.proposedAt)!,
    proposedBy: normalizeActor(value.proposedBy),
    confirmedAt,
    confirmedBy,
    commandId: safeId(value.commandId) ?? undefined,
  };
}

function normalizeDeadline(raw: unknown): OperationalPlaybookInstance['deadlines'][number] | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<OperationalPlaybookInstance['deadlines'][number]>;
  if (value.schemaVersion !== 1 || !safeId(value.id) || !safeId(value.stepId) || !safeId(value.expeditionId) ||
      !normalizeIso(value.dueAt) || !normalizeIso(value.createdAt) || !Array.isArray(value.sourceTruth) ||
      !MISSION_CLOCK_SOURCES.includes(value.source as typeof MISSION_CLOCK_SOURCES[number]) ||
      !isDispatchPriority(value.priority) || !boundedText(value.title, 180) || !boundedText(value.reason, 500) ||
      !['active', 'completed', 'cancelled'].includes(String(value.completionState))) return null;
  const completedAt = normalizeIso(value.completedAt);
  const cancelledAt = normalizeIso(value.cancelledAt);
  if (value.completionState === 'completed' && !completedAt) return null;
  if (value.completionState === 'cancelled' && !cancelledAt) return null;
  if (value.completionState === 'active' && (completedAt || cancelledAt)) return null;
  if (value.completionState === 'completed' && cancelledAt) return null;
  if (value.completionState === 'cancelled' && completedAt) return null;
  return {
    schemaVersion: 1,
    id: safeId(value.id)!,
    stepId: safeId(value.stepId)!,
    expeditionId: safeId(value.expeditionId)!,
    source: value.source!,
    title: boundedText(value.title, 180),
    reason: boundedText(value.reason, 500),
    dueAt: normalizeIso(value.dueAt)!,
    warningWindowMs: normalizeWindow(value.warningWindowMs, 30 * 60_000),
    criticalWindowMs: normalizeWindow(value.criticalWindowMs, 5 * 60_000),
    priority: value.priority!,
    sourceTruth: normalizeSourceTruth(value.sourceTruth),
    completionState: value.completionState!,
    createdAt: normalizeIso(value.createdAt)!,
    completedAt,
    cancelledAt,
  };
}

function normalizeStepResult(raw: unknown): OperationalPlaybookStepResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<OperationalPlaybookStepResult>;
  if (!safeId(value.stepId) || !STEP_TYPES.includes(value.stepType as typeof STEP_TYPES[number]) ||
      !normalizeIso(value.completedAt) || !safeId(value.actorId) || !boundedText(value.summary, 500) ||
      !value.data || typeof value.data !== 'object') return null;
  const data = normalizeStepResultData(value.data, value.stepType!);
  if (!data) return null;
  return {
    stepId: safeId(value.stepId)!,
    stepType: value.stepType!,
    completedAt: normalizeIso(value.completedAt)!,
    actorId: safeId(value.actorId)!,
    summary: boundedText(value.summary, 500),
    data,
  };
}

function normalizeStepResultData(
  raw: unknown,
  stepType: OperationalPlaybookStepDefinition['type'],
): OperationalPlaybookStepResultData | null {
  if (!isRecord(raw)) return null;
  switch (stepType) {
    case 'review_context': {
      if (raw.kind !== 'context_reviewed' || !safeId(raw.contextId) || typeof raw.stale !== 'boolean') return null;
      return { kind: 'context_reviewed', contextId: safeId(raw.contextId)!, stale: raw.stale };
    }
    case 'request_input': {
      if (raw.kind !== 'input_recorded' || !safeId(raw.inputKey) ||
          !INPUT_STATES.includes(raw.inputState as OperationalPlaybookInputState)) return null;
      return {
        kind: 'input_recorded',
        inputKey: safeId(raw.inputKey)!,
        inputState: raw.inputState as OperationalPlaybookInputState,
      };
    }
    case 'create_command_proposal': {
      if (raw.kind !== 'command_proposal' || !safeId(raw.proposalId) ||
          !['proposed', 'confirmed'].includes(String(raw.status))) return null;
      return {
        kind: 'command_proposal',
        proposalId: safeId(raw.proposalId)!,
        status: raw.status as 'proposed' | 'confirmed',
      };
    }
    case 'assign_role': {
      if (raw.kind !== 'role_assigned' || !safeId(raw.roleId)) return null;
      return {
        kind: 'role_assigned',
        roleId: safeId(raw.roleId)!,
        assigneeId: safeId(raw.assigneeId) ?? undefined,
        label: boundedText(raw.label, 160) || undefined,
      };
    }
    case 'request_acknowledgment': {
      const targetIds = Array.isArray(raw.targetIds)
        ? unique(raw.targetIds.map(safeId).filter(isString))
        : [];
      const requiredCount = Number(raw.requiredCount);
      if (raw.kind !== 'acknowledgment_requested' || targetIds.length === 0 ||
          !Number.isInteger(requiredCount) || requiredCount < 1 || requiredCount > targetIds.length) return null;
      return { kind: 'acknowledgment_requested', targetIds, requiredCount };
    }
    case 'open_context': {
      if (raw.kind !== 'context_opened' || !safeId(raw.contextId)) return null;
      return { kind: 'context_opened', contextId: safeId(raw.contextId)! };
    }
    case 'start_deadline': {
      const dueAt = normalizeIso(raw.dueAt);
      if (raw.kind !== 'deadline_started' || !safeId(raw.deadlineId) || !dueAt) return null;
      return { kind: 'deadline_started', deadlineId: safeId(raw.deadlineId)!, dueAt };
    }
    case 'record_decision': {
      const decision = boundedText(raw.decision, 1_000);
      if (raw.kind !== 'decision_recorded' || !safeId(raw.decisionKey) || !decision) return null;
      return { kind: 'decision_recorded', decisionKey: safeId(raw.decisionKey)!, decision };
    }
    case 'confirm_action': {
      const summary = boundedText(raw.summary, 500);
      return raw.kind === 'action_confirmed' && summary
        ? { kind: 'action_confirmed', summary }
        : null;
    }
    case 'resolve': {
      const summary = boundedText(raw.summary, 1_000);
      return raw.kind === 'resolved' && summary ? { kind: 'resolved', summary } : null;
    }
  }
}

function normalizeSkippedStep(raw: unknown): OperationalPlaybookInstance['skippedSteps'][number] | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<OperationalPlaybookInstance['skippedSteps'][number]>;
  if (!safeId(value.stepId) || !safeId(value.actorId) || !normalizeIso(value.skippedAt) || !boundedText(value.reason, 500)) return null;
  return { stepId: safeId(value.stepId)!, actorId: safeId(value.actorId)!, skippedAt: normalizeIso(value.skippedAt)!, reason: boundedText(value.reason, 500) };
}

function normalizeBlockedStep(raw: unknown): OperationalPlaybookBlockedStep | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<OperationalPlaybookBlockedStep>;
  if (!safeId(value.stepId) || !safeCode(value.reasonCode) || !normalizeIso(value.blockedAt) || !boundedText(value.reason, 500)) return undefined;
  return { stepId: safeId(value.stepId)!, reason: boundedText(value.reason, 500), reasonCode: safeCode(value.reasonCode)!, blockedAt: normalizeIso(value.blockedAt)! };
}

function normalizeEvents(rawEvents: unknown[]): OperationalPlaybookEvent[] {
  const byKey = new Map<string, OperationalPlaybookEvent>();
  for (const raw of rawEvents) {
    const event = normalizeEvent(raw);
    if (event && !byKey.has(event.idempotencyKey)) byKey.set(event.idempotencyKey, event);
  }
  return [...byKey.values()]
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt))
    .slice(-OPERATIONAL_PLAYBOOK_RETENTION_LIMITS.eventsPerInstance);
}

function normalizeEvent(raw: unknown): OperationalPlaybookEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<OperationalPlaybookEvent>;
  if (value.schemaVersion !== 1 || !safeId(value.id) || !safeKey(value.idempotencyKey) ||
      !safeId(value.instanceId) || !safeId(value.expeditionId) || !PLAYBOOK_STATES.includes(value.state as OperationalPlaybookState) ||
      !EVENT_TYPES.includes(value.type as OperationalPlaybookEventType) ||
      !isActor(value.actor) || !normalizeIso(value.occurredAt) || !boundedText(value.summary, 500)) return null;
  return {
    schemaVersion: 1,
    id: safeId(value.id)!,
    idempotencyKey: safeKey(value.idempotencyKey)!,
    instanceId: safeId(value.instanceId)!,
    expeditionId: safeId(value.expeditionId)!,
    type: value.type!,
    state: value.state!,
    stepId: safeId(value.stepId) ?? undefined,
    actor: normalizeActor(value.actor),
    occurredAt: normalizeIso(value.occurredAt)!,
    summary: boundedText(value.summary, 500),
    metadata: normalizeEventMetadata(value.metadata),
  };
}

function normalizeEventMetadata(value: OperationalPlaybookEventMetadata | undefined): OperationalPlaybookEventMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const result: OperationalPlaybookEventMetadata = {};
  const reasonCode = safeCode(value.reasonCode);
  if (reasonCode) result.reasonCode = reasonCode;
  const inputKey = safeId(value.inputKey);
  if (inputKey) result.inputKey = inputKey;
  const proposalId = safeId(value.proposalId);
  if (proposalId) result.proposalId = proposalId;
  const commandId = safeId(value.commandId);
  if (commandId) result.commandId = commandId;
  const deadlineId = safeId(value.deadlineId);
  if (deadlineId) result.deadlineId = deadlineId;
  if (isPositiveInteger(value.fromDefinitionVersion)) result.fromDefinitionVersion = value.fromDefinitionVersion;
  if (isPositiveInteger(value.toDefinitionVersion)) result.toDefinitionVersion = value.toDefinitionVersion;
  if (typeof value.offline === 'boolean') result.offline = value.offline;
  return Object.keys(result).length > 0 ? result : undefined;
}

function inputRequirementMap(definition: OperationalPlaybookDefinition): Map<string, OperationalPlaybookInputRequirement> {
  return new Map([...definition.requiredInputs, ...definition.optionalInputs].map((requirement) => [requirement.key, requirement]));
}

function readinessMessage(readiness: OperationalPlaybookReadiness): string {
  if (readiness.deniedPermissions.length > 0) return 'Playbook permission requirements are not satisfied.';
  if (readiness.restrictedInputKeys.length > 0) return 'Required playbook context is restricted.';
  if (readiness.missingInputKeys.length > 0) return 'Required playbook inputs are missing.';
  if (readiness.staleInputKeys.length > 0) return 'Required playbook inputs are stale.';
  if (readiness.unavailableInputKeys.length > 0) return 'Required playbook inputs are unavailable.';
  return 'Required playbook capabilities are unavailable.';
}

function transitionEventType(from: OperationalPlaybookState, next: OperationalPlaybookState): OperationalPlaybookEventType {
  if (next === 'ready') return 'ready';
  if (next === 'active') return from === 'paused' || from === 'blocked' ? 'resumed' : 'started';
  if (next === 'paused') return 'paused';
  if (next === 'blocked') return 'blocked';
  if (next === 'completed') return 'completed';
  return 'cancelled';
}

function transitionSummary(title: string, state: OperationalPlaybookState, reason?: string): string {
  if (state === 'cancelled') return `${title} cancelled: ${boundedText(reason, 500) || 'No reason recorded.'}`;
  if (state === 'blocked') return `${title} blocked: ${boundedText(reason, 500) || 'Reason unavailable.'}`;
  return `${title} ${state.replace(/_/g, ' ')}.`;
}

function actionKey(instance: OperationalPlaybookInstance, action: string, actorId: string, occurredAt: string): string {
  return createDispatchIdempotencyKey({
    expeditionId: instance.expeditionId,
    entityType: 'operational_playbook_event',
    actionType: action,
    actorMemberId: actorId,
    sourceEntityId: instance.id,
    timeBucket: occurredAt,
  });
}

function hasEvent(instance: OperationalPlaybookInstance, idempotencyKey: string): boolean {
  return instance.eventHistory.some((event) => event.idempotencyKey === idempotencyKey);
}

function changed(
  instance: OperationalPlaybookInstance,
  event: OperationalPlaybookEvent,
  effect: OperationalPlaybookEffect | null = null,
): OperationalPlaybookMutationResult {
  return { ok: true, changed: true, instance, event, effect };
}

function unchanged(instance: OperationalPlaybookInstance): OperationalPlaybookMutationResult {
  return { ok: true, changed: false, instance, event: null, effect: null };
}

function invalid(instance: OperationalPlaybookInstance, reason: string, safeCodeValue: string): OperationalPlaybookMutationResult {
  return { ok: false, changed: false, instance, event: null, effect: null, reason, safeCode: safeCodeValue };
}

function wrongAction(instance: OperationalPlaybookInstance, step: OperationalPlaybookStepDefinition): OperationalPlaybookMutationResult {
  return invalid(instance, `Action does not match the ${step.type} step.`, 'playbook_step_action_invalid');
}

function isIncomingInstanceNewer(current: OperationalPlaybookInstance, incoming: OperationalPlaybookInstance): boolean {
  if (incoming.version !== current.version) return incoming.version > current.version;
  return Date.parse(incoming.updatedAt) > Date.parse(current.updatedAt);
}

function isTerminalState(state: OperationalPlaybookState): boolean {
  return state === 'completed' || state === 'cancelled';
}

function boundInstances(instances: OperationalPlaybookInstance[]): OperationalPlaybookInstance[] {
  const active = instances.filter((instance) => !isTerminalState(instance.state))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const terminal = instances.filter((instance) => isTerminalState(instance.state))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return [...active, ...terminal].slice(0, OPERATIONAL_PLAYBOOK_RETENTION_LIMITS.instances);
}

function boundProposals(proposals: OperationalPlaybookCommandProposal[]): OperationalPlaybookCommandProposal[] {
  return proposals.slice(-OPERATIONAL_PLAYBOOK_RETENTION_LIMITS.proposalsPerInstance);
}

function boundDeadlines(deadlines: OperationalPlaybookInstance['deadlines']): OperationalPlaybookInstance['deadlines'] {
  return deadlines.slice(-OPERATIONAL_PLAYBOOK_RETENTION_LIMITS.deadlinesPerInstance);
}

function closeActiveDeadlines(
  deadlines: OperationalPlaybookInstance['deadlines'],
  completionState: 'completed' | 'cancelled',
  occurredAt: string,
): OperationalPlaybookInstance['deadlines'] {
  return deadlines.map((deadline) => deadline.completionState === 'active'
    ? {
        ...deadline,
        completionState,
        completedAt: completionState === 'completed' ? occurredAt : undefined,
        cancelledAt: completionState === 'cancelled' ? occurredAt : undefined,
      }
    : deadline);
}

function mergeSkippedSteps(
  current: OperationalPlaybookInstance['skippedSteps'],
  incoming: OperationalPlaybookInstance['skippedSteps'][number],
): OperationalPlaybookInstance['skippedSteps'] {
  return [...current.filter((item) => item.stepId !== incoming.stepId), incoming];
}

function normalizeSourceTruth(refs: readonly SourceTruthRef[]): SourceTruthRef[] {
  const byId = new Map<string, SourceTruthRef>();
  for (const ref of refs) {
    if (!ref || typeof ref !== 'object' || !safeId(ref.id)) continue;
    const sanitized = sanitizeSourceTruthRef(ref);
    byId.set(sanitized.id, sanitized);
  }
  return [...byId.values()].slice(0, 30);
}

function normalizeActor(actor: MissionCommandActor): MissionCommandActor {
  const role = actor.role && ['owner', 'member', 'viewer', 'system'].includes(actor.role)
    ? actor.role
    : undefined;
  return {
    id: requireSafeId(actor.id, 'Actor ID is invalid.'),
    label: boundedText(actor.label, 160) || 'ECS operator',
    role,
  };
}

function normalizeMissionCommandTarget(value: unknown): MissionCommandTarget | null {
  if (!isRecord(value)) return null;
  const label = boundedText(value.label, 160) || undefined;
  if (value.kind === 'member' || value.kind === 'solo') {
    const memberId = safeId(value.memberId);
    return memberId ? { kind: value.kind, memberId, label } : null;
  }
  if (value.kind === 'role') {
    const roleId = safeId(value.roleId);
    return roleId ? { kind: 'role', roleId, label } : null;
  }
  if (value.kind === 'vehicle') {
    const vehicleId = safeId(value.vehicleId);
    return vehicleId ? { kind: 'vehicle', vehicleId, label } : null;
  }
  if (value.kind === 'team' && Array.isArray(value.memberIds)) {
    const memberIds = unique(value.memberIds.map(safeId).filter(isString));
    return memberIds.length > 0 ? { kind: 'team', memberIds, label } : null;
  }
  return null;
}

function normalizeAcknowledgmentPolicy(value: unknown): MissionCommandAcknowledgmentPolicy | null {
  if (!isRecord(value) || !['none', 'any', 'all', 'count'].includes(String(value.mode)) ||
      !Array.isArray(value.targetMemberIds)) return null;
  const targetMemberIds = unique(value.targetMemberIds.map(safeId).filter(isString));
  if (targetMemberIds.length !== value.targetMemberIds.length) return null;
  const requiredCount = value.requiredCount == null ? undefined : Number(value.requiredCount);
  if (requiredCount != null && (!Number.isInteger(requiredCount) || requiredCount < 1)) return null;
  const roleId = value.roleId == null ? undefined : safeId(value.roleId) ?? undefined;
  if (value.roleId != null && !roleId) return null;
  return {
    mode: value.mode as MissionCommandAcknowledgmentPolicy['mode'],
    targetMemberIds,
    requiredCount,
    roleId,
  };
}

function isMissionCommandType(value: unknown): value is MissionCommandType {
  return MISSION_COMMAND_TYPES.includes(value as typeof MISSION_COMMAND_TYPES[number]);
}

function isDispatchPriority(value: unknown): value is DispatchPriority {
  return DISPATCH_PRIORITIES.includes(value as typeof DISPATCH_PRIORITIES[number]);
}

function isActor(value: unknown): value is MissionCommandActor {
  if (!value || typeof value !== 'object') return false;
  const actor = value as Partial<MissionCommandActor>;
  return Boolean(safeId(actor.id) && boundedText(actor.label, 160) &&
    (actor.role == null || ['owner', 'member', 'viewer', 'system'].includes(actor.role)));
}

function normalizeScalarValue(
  value: unknown,
  kind: OperationalPlaybookInputRequirement['kind'],
): string | number | boolean | undefined {
  if (kind === 'linked_context') return undefined;
  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  if (kind === 'boolean') return typeof value === 'boolean' ? value : undefined;
  if (kind === 'timestamp') return normalizeIso(value);
  const text = boundedText(value, kind === 'text' ? 1_000 : 180);
  return text || undefined;
}

function normalizeWindow(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(7 * 24 * 60 * 60_000, Number(value))) : fallback;
}

function safeId(value: unknown): string | null {
  const normalized = String(value ?? '').trim().slice(0, 180);
  return normalized && /^[A-Za-z0-9._:-]+$/.test(normalized) ? normalized : null;
}

function requireSafeId(value: unknown, message: string): string {
  const normalized = safeId(value);
  if (!normalized) throw new Error(message);
  return normalized;
}

function safeKey(value: unknown): string | null {
  const normalized = String(value ?? '').trim().slice(0, 280);
  return normalized && /^[A-Za-z0-9._:-]+$/.test(normalized) ? normalized : null;
}

function safeCode(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(normalized) ? normalized : undefined;
}

function boundedText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return (sanitizeSourceTruthDisplayText(value, maxLength) ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeIso(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value != null;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function states<T extends string>(...values: T[]): ReadonlySet<T> {
  return new Set(values);
}

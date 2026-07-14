import { createDispatchEntityId, createDispatchIdempotencyKey } from './dispatchIntegrity';
import {
  createMissionClockDeadline,
  evaluateMissionClockDeadline,
  type MissionClockDeadlineInput,
  type MissionClockDeadlineStatus,
} from './dispatchMissionClock';
import {
  createMissionCommandEvent,
  sanitizeMissionCommandLinkedContext,
} from './dispatchMissionCommandDomain';
import {
  MISSION_COMMAND_SCHEMA_VERSION,
  type MissionCommand,
  type MissionCommandAcknowledgmentPolicy,
  type MissionCommandActor,
  type MissionCommandTarget,
} from './dispatchMissionCommandTypes';
import {
  GUARDIAN_CHECK_IN_SCHEMA_VERSION,
  type CreateGuardianCheckInPlanInput,
  type CreateGuardianCheckInPlanResult,
  type GuardianCheckInEvent,
  type GuardianCheckInEventType,
  type GuardianCheckInLifecycleState,
  type GuardianCheckInMutationResult,
  type GuardianCheckInNoResponseResult,
  type GuardianCheckInPlan,
  type GuardianCheckInResponseState,
  type GuardianCheckInTrigger,
  type GuardianCheckInTriggerSupport,
  type GuardianCheckInTriggerType,
} from './dispatchGuardianCheckInTypes';
import { sanitizeSourceTruthRef, type SourceTruthRef } from './sourceTruth';

const MINUTE_MS = 60_000;
const MAX_GRACE_MINUTES = 240;
const MAX_INTERVAL_MINUTES = 24 * 60;
const GUARDIAN_EVENT_LIMIT = 100;
export const GUARDIAN_CHECK_IN_PLAN_LIMIT = 100;

export const GUARDIAN_CHECK_IN_TRIGGER_SUPPORT: Record<
  GuardianCheckInTriggerType,
  GuardianCheckInTriggerSupport
> = {
  fixed_time: 'mission_clock',
  recurring_interval: 'mission_clock',
  route_checkpoint: 'operator_confirmation',
  rally_arrival: 'operator_confirmation',
  camp_arrival: 'operator_confirmation',
  remote_segment_entry: 'operator_confirmation',
  operator_requested: 'operator_request',
  post_incident_follow_up: 'operator_confirmation',
  manual_one_time: 'operator_request',
};

const EVENT_TRIGGER_TYPES = new Set<GuardianCheckInTriggerType>([
  'route_checkpoint',
  'rally_arrival',
  'camp_arrival',
  'remote_segment_entry',
  'post_incident_follow_up',
]);

const RESPONSE_TRANSITIONS: Record<GuardianCheckInResponseState, ReadonlySet<GuardianCheckInResponseState>> = {
  scheduled: states('requested', 'queued', 'cancelled'),
  requested: states('queued', 'delivered', 'acknowledged', 'delayed', 'declined', 'no_response', 'resolved', 'cancelled'),
  queued: states('requested', 'delivered', 'acknowledged', 'delayed', 'declined', 'no_response', 'resolved', 'cancelled'),
  delivered: states('acknowledged', 'delayed', 'declined', 'no_response', 'resolved', 'cancelled'),
  acknowledged: states('resolved', 'scheduled'),
  delayed: states('requested', 'queued', 'delivered', 'acknowledged', 'no_response', 'resolved', 'cancelled'),
  declined: states('resolved', 'cancelled'),
  no_response: states('resolved', 'cancelled'),
  resolved: states('scheduled'),
  cancelled: states(),
};

const TERMINAL_RESPONSE_STATES = new Set<GuardianCheckInResponseState>([
  'acknowledged',
  'declined',
  'no_response',
  'resolved',
  'cancelled',
]);

export function createGuardianCheckInPlan(
  input: CreateGuardianCheckInPlanInput,
): CreateGuardianCheckInPlanResult {
  const expeditionId = safeId(input.expeditionId);
  const actorId = safeId(input.actor.id);
  const now = normalizeIso(input.now) ?? new Date().toISOString();
  if (!expeditionId || !actorId) {
    return failure('guardian_context_invalid', 'Expedition and actor identity are required.');
  }
  if (!(input.triggerType in GUARDIAN_CHECK_IN_TRIGGER_SUPPORT)) {
    return failure('guardian_trigger_invalid', 'Guardian Check-In trigger is unsupported.');
  }

  const target = normalizeTarget(input.target);
  if (!target) return failure('guardian_target_invalid', 'Select a valid Guardian Check-In target.');
  if (input.soloMode && (target.kind !== 'solo' || target.memberId !== actorId)) {
    return failure('guardian_solo_target_invalid', 'Solo Guardian Check-Ins must target the current user.');
  }

  const gracePeriodMinutes = boundedMinutes(input.gracePeriodMinutes, 1, MAX_GRACE_MINUTES);
  if (gracePeriodMinutes == null) {
    return failure('guardian_grace_invalid', `Grace period must be between 1 and ${MAX_GRACE_MINUTES} minutes.`);
  }

  const triggerResult = buildTrigger(input, now);
  if (!triggerResult.ok) return triggerResult;
  const sourceTruth = normalizeSources(input.sourceTruth?.length
    ? input.sourceTruth
    : [manualSource(`guardian-plan:${expeditionId}:${actorId}`, input.actor, now)]);
  const acknowledgmentRequirement = normalizeAcknowledgmentRequirement(
    input.acknowledgmentRequirement,
    target,
    input.soloMode,
  );
  const idempotencyKey = safeKey(input.idempotencyKey) ?? createDispatchIdempotencyKey({
    expeditionId,
    entityType: 'guardian_check_in',
    actionType: 'create_plan',
    actorMemberId: actorId,
    targetMemberIds: targetMemberIds(target),
    linkedContextId: triggerResult.trigger.linkedContext?.id,
    sourceEntityId: triggerResult.trigger.type,
    timeBucket: triggerResult.trigger.dueAt ?? now,
  });
  const id = createDispatchEntityId('guardian_check_in', idempotencyKey);
  const plan: GuardianCheckInPlan = {
    schemaVersion: GUARDIAN_CHECK_IN_SCHEMA_VERSION,
    version: 1,
    id,
    expeditionId,
    title: safeText(input.title, 160) || defaultTitle(input.triggerType, input.soloMode),
    creator: normalizeActor(input.actor),
    target,
    trigger: triggerResult.trigger,
    acknowledgmentRequirement,
    gracePeriodMinutes,
    nextReviewAt: initialReviewAt(triggerResult.trigger, now),
    sourceTruth,
    lifecycleState: 'active',
    responseState: 'scheduled',
    soloMode: input.soloMode,
    cycle: 1,
    createdAt: now,
    updatedAt: now,
    idempotencyKey,
    events: [],
  };
  const event = createGuardianEvent(plan, 'created', input.actor, now, 'Guardian Check-In plan created.', `${idempotencyKey}:created`);
  return { ok: true, plan: { ...plan, events: [event] } };
}

export function markGuardianCheckInTrigger(input: {
  plan: GuardianCheckInPlan;
  actor: MissionCommandActor;
  occurredAt?: string | number | Date;
  triggerIdempotencyKey: string;
}): GuardianCheckInMutationResult {
  const { plan } = input;
  if (plan.lifecycleState !== 'active') {
    return invalid(plan, 'guardian_plan_not_active', 'Only an active Guardian Check-In plan can record a trigger.');
  }
  if (GUARDIAN_CHECK_IN_TRIGGER_SUPPORT[plan.trigger.type] !== 'operator_confirmation') {
    return invalid(plan, 'guardian_trigger_confirmation_not_required', 'This trigger is driven by Mission Clock or an operator request.');
  }
  const key = safeKey(input.triggerIdempotencyKey);
  if (!key) return invalid(plan, 'guardian_trigger_key_invalid', 'Trigger identity is required.');
  if (plan.events.some((event) => event.idempotencyKey === key)) {
    return { ok: true, changed: false, plan, event: null };
  }
  const occurredAt = normalizeIso(input.occurredAt) ?? new Date().toISOString();
  const next = mutatePlan(plan, {
    trigger: { ...plan.trigger, lastTriggeredAt: occurredAt },
    nextReviewAt: occurredAt,
    updatedAt: occurredAt,
  });
  return appendMutationEvent(next, 'trigger_confirmed', input.actor, occurredAt, 'Guardian Check-In trigger confirmed by the operator.', key);
}

export function transitionGuardianCheckInLifecycle(input: {
  plan: GuardianCheckInPlan;
  actor: MissionCommandActor;
  next: GuardianCheckInLifecycleState;
  occurredAt?: string | number | Date;
  reason?: string;
}): GuardianCheckInMutationResult {
  const { plan, next } = input;
  if (plan.lifecycleState === next) return { ok: true, changed: false, plan, event: null };
  const allowed = lifecycleTransitions(plan.lifecycleState);
  if (!allowed.has(next)) {
    return invalid(plan, 'guardian_lifecycle_transition_invalid', `Guardian Check-In cannot transition from ${plan.lifecycleState} to ${next}.`);
  }
  const occurredAt = normalizeIso(input.occurredAt) ?? new Date().toISOString();
  if (next === 'paused') {
    const remaining = plan.nextReviewAt == null
      ? undefined
      : Math.max(0, Date.parse(plan.nextReviewAt) - Date.parse(occurredAt));
    const paused = mutatePlan(plan, {
      lifecycleState: 'paused',
      pausedAt: occurredAt,
      pauseRemainingMs: Number.isFinite(remaining) ? remaining : undefined,
      updatedAt: occurredAt,
    });
    return appendMutationEvent(paused, 'paused', input.actor, occurredAt, safeText(input.reason, 240) || 'Guardian Check-In paused.');
  }
  if (next === 'active') {
    const nextReviewAt = plan.pauseRemainingMs == null
      ? plan.nextReviewAt
      : new Date(Date.parse(occurredAt) + plan.pauseRemainingMs).toISOString();
    const resumed = mutatePlan(plan, {
      lifecycleState: 'active',
      nextReviewAt,
      pausedAt: undefined,
      pauseRemainingMs: undefined,
      updatedAt: occurredAt,
    });
    return appendMutationEvent(resumed, 'resumed', input.actor, occurredAt, safeText(input.reason, 240) || 'Guardian Check-In resumed.');
  }
  const cancelled = mutatePlan(plan, {
    lifecycleState: next,
    responseState: next === 'cancelled' ? 'cancelled' : plan.responseState,
    nextReviewAt: null,
    updatedAt: occurredAt,
  });
  return appendMutationEvent(
    cancelled,
    next === 'cancelled' ? 'cancelled' : 'cycle_resolved',
    input.actor,
    occurredAt,
    safeText(input.reason, 240) || `Guardian Check-In ${next}.`,
  );
}

export function linkGuardianCheckInCommand(input: {
  plan: GuardianCheckInPlan;
  command: MissionCommand;
  actor: MissionCommandActor;
  occurredAt?: string | number | Date;
}): GuardianCheckInMutationResult {
  const { plan, command } = input;
  if (plan.lifecycleState !== 'active') {
    return invalid(plan, 'guardian_plan_not_active', 'Paused or completed Guardian Check-Ins cannot create requests.');
  }
  if (command.expeditionId !== plan.expeditionId || command.type !== 'check_in') {
    return invalid(plan, 'guardian_command_invalid', 'Only a Check-In Mission Command from this expedition can be linked.');
  }
  if (plan.currentCommandId === command.id) {
    const reconciled = deriveGuardianResponseState(plan, command);
    if (reconciled === plan.responseState) return { ok: true, changed: false, plan, event: null };
  }
  const occurredAt = normalizeIso(input.occurredAt) ?? command.createdAt;
  const responseState = deriveGuardianResponseState(
    { ...plan, currentCommandId: command.id },
    command,
  );
  const deadlineAt = normalizeIso(command.deadlineAt)
    ?? new Date(Date.parse(occurredAt) + plan.gracePeriodMinutes * MINUTE_MS).toISOString();
  const next = mutatePlan(plan, {
    currentCommandId: command.id,
    responseState,
    nextReviewAt: deadlineAt,
    updatedAt: occurredAt,
  });
  return appendMutationEvent(
    next,
    'request_linked',
    input.actor,
    occurredAt,
    responseState === 'queued'
      ? 'Guardian Check-In request queued for delivery.'
      : plan.soloMode
        ? 'Local self check-in reminder created; no recipient delivery is claimed.'
        : 'Guardian Check-In request created; delivery is not yet confirmed.',
    `${plan.id}:cycle:${plan.cycle}:command:${command.id}`,
    command.id,
  );
}

export function recordGuardianCheckInResponse(input: {
  plan: GuardianCheckInPlan;
  response: Exclude<GuardianCheckInResponseState, 'scheduled' | 'requested' | 'queued' | 'no_response' | 'cancelled'>;
  actor: MissionCommandActor;
  command?: MissionCommand | null;
  occurredAt?: string | number | Date;
  explicitOperatorChoice: boolean;
}): GuardianCheckInMutationResult {
  const { plan, response, command } = input;
  if (!input.explicitOperatorChoice) {
    return invalid(plan, 'guardian_response_confirmation_required', 'An explicit operator choice is required.');
  }
  if (plan.responseState === response) {
    return { ok: true, changed: false, plan, event: null };
  }
  if (!RESPONSE_TRANSITIONS[plan.responseState].has(response)) {
    return invalid(plan, 'guardian_response_transition_invalid', `Guardian Check-In cannot transition from ${plan.responseState} to ${response}.`);
  }
  if (response === 'delivered' && command?.deliveryState !== 'delivered') {
    return invalid(plan, 'guardian_delivery_unverified', 'Delivered requires a verified Mission Command delivery state.');
  }
  if (response === 'acknowledged' && !plan.soloMode && command?.acknowledgmentState !== 'complete') {
    return invalid(plan, 'guardian_acknowledgment_unverified', 'Team acknowledgment requires a verified completed Mission Command acknowledgment.');
  }
  if (response === 'acknowledged' && command?.deliveryState === 'queued') {
    return invalid(plan, 'guardian_offline_acknowledgment_forbidden', 'A queued offline request cannot be marked acknowledged.');
  }
  const occurredAt = normalizeIso(input.occurredAt) ?? new Date().toISOString();
  const nextReviewAt = response === 'delayed'
    ? new Date(Date.parse(occurredAt) + plan.gracePeriodMinutes * MINUTE_MS).toISOString()
    : plan.nextReviewAt;
  const next = mutatePlan(plan, {
    responseState: response,
    nextReviewAt,
    updatedAt: occurredAt,
  });
  return appendMutationEvent(
    next,
    'response_recorded',
    input.actor,
    occurredAt,
    plan.soloMode && response === 'acknowledged'
      ? 'Local self check-in recorded. No external receipt is claimed.'
      : `Guardian Check-In response recorded: ${humanize(response)}.`,
    `${plan.id}:cycle:${plan.cycle}:response:${response}:${occurredAt}`,
    command?.id,
  );
}

export function recordGuardianCheckInNoResponse(input: {
  plan: GuardianCheckInPlan;
  actor: MissionCommandActor;
  command?: MissionCommand | null;
  now?: string | number | Date;
  explicitOperatorChoice: boolean;
}): GuardianCheckInNoResponseResult {
  const { plan, command } = input;
  if (!input.explicitOperatorChoice) {
    return noResponseInvalid(plan, 'guardian_no_response_confirmation_required', 'No-response review requires explicit operator action.');
  }
  if (plan.noResponseDecisionCommandId) {
    return { ok: true, changed: false, plan, planEvent: null, decisionCommand: null, decisionEvent: null };
  }
  if (plan.responseState === 'acknowledged' || command?.acknowledgmentState === 'complete') {
    return noResponseInvalid(plan, 'guardian_already_acknowledged', 'An acknowledged check-in cannot be marked no response.');
  }
  const now = normalizeIso(input.now) ?? new Date().toISOString();
  const deadline = createGuardianCheckInDeadline(plan);
  const status = deadline ? evaluateMissionClockDeadline(deadline, now).status : 'unavailable';
  if (status !== 'overdue') {
    return noResponseInvalid(plan, 'guardian_grace_period_active', 'No-response review is available only after the grace deadline is overdue.');
  }
  if (!RESPONSE_TRANSITIONS[plan.responseState].has('no_response')) {
    return noResponseInvalid(plan, 'guardian_no_response_transition_invalid', `Guardian Check-In cannot record no response from ${plan.responseState}.`);
  }

  const commandIdempotencyKey = createDispatchIdempotencyKey({
    expeditionId: plan.expeditionId,
    entityType: 'mission_command',
    actionType: 'guardian_no_response_decision',
    actorMemberId: input.actor.id,
    sourceEntityId: plan.id,
    timeBucket: String(plan.cycle),
  });
  const decisionCommandId = createDispatchEntityId('mission_command', commandIdempotencyKey);
  const decisionCommand: MissionCommand = {
    schemaVersion: MISSION_COMMAND_SCHEMA_VERSION,
    version: 1,
    id: decisionCommandId,
    expeditionId: plan.expeditionId,
    creator: normalizeActor(input.actor),
    type: 'check_in',
    priority: 'high',
    title: `Decision Required: ${plan.title}`,
    instructions: plan.soloMode
      ? 'Review the missed personal check-in, comms plan, and whether to create a local incident record. No external contact occurs automatically.'
      : `Review the missed check-in for ${formatGuardianTarget(plan.target)} and choose the next ECS coordination action. Do not infer an emergency.`,
    target: { kind: 'solo', memberId: input.actor.id, label: input.actor.label },
    acknowledgmentPolicy: { mode: 'none', targetMemberIds: [] },
    linkedContext: plan.trigger.linkedContext,
    sourceTruth: plan.sourceTruth,
    operationalState: 'proposed',
    deliveryState: 'local',
    acknowledgmentState: 'not_required',
    acknowledgments: [],
    idempotencyKey: commandIdempotencyKey,
    createdAt: now,
    updatedAt: now,
    audit: {
      schemaVersion: 1,
      sourceKind: 'native',
      sourceRecordId: plan.id,
      correlationId: `${plan.id}:cycle:${plan.cycle}`,
      safetyScope: 'ecs_team_coordination_only',
    },
  };
  const decisionEvent = createMissionCommandEvent({
    command: decisionCommand,
    type: 'created',
    actor: input.actor,
    occurredAt: now,
    summary: 'Guardian Check-In no-response decision created for operator review. No escalation was sent.',
    metadata: { reasonCode: 'guardian_no_response_operator_review' },
  });
  const next = mutatePlan(plan, {
    responseState: 'no_response',
    noResponseDecisionCommandId: decisionCommandId,
    updatedAt: now,
  });
  const mutation = appendMutationEvent(
    next,
    'no_response_recorded',
    input.actor,
    now,
    'No response recorded after the grace period. Operator review is required; no escalation was sent.',
    `${plan.id}:cycle:${plan.cycle}:no-response`,
    command?.id,
  );
  if (!mutation.ok) return noResponseInvalid(plan, mutation.safeCode, mutation.reason);
  const planEvent = mutation.event;
  const withDecisionEvent = appendEventOnly(
    mutation.plan,
    createGuardianEvent(
      mutation.plan,
      'decision_created',
      input.actor,
      now,
      'Command Board decision item created locally.',
      `${plan.id}:cycle:${plan.cycle}:decision`,
      decisionCommandId,
    ),
  );
  return {
    ok: true,
    changed: true,
    plan: withDecisionEvent,
    planEvent,
    decisionCommand,
    decisionEvent,
  };
}

export function resolveGuardianCheckInCycle(input: {
  plan: GuardianCheckInPlan;
  actor: MissionCommandActor;
  occurredAt?: string | number | Date;
  explicitOperatorChoice: boolean;
}): GuardianCheckInMutationResult {
  const { plan } = input;
  if (!input.explicitOperatorChoice) {
    return invalid(plan, 'guardian_resolution_confirmation_required', 'Cycle resolution requires explicit operator action.');
  }
  if (!TERMINAL_RESPONSE_STATES.has(plan.responseState) && plan.responseState !== 'delayed') {
    return invalid(plan, 'guardian_cycle_not_resolvable', 'Record a response or no-response outcome before resolving the cycle.');
  }
  const occurredAt = normalizeIso(input.occurredAt) ?? new Date().toISOString();
  if (plan.trigger.type === 'recurring_interval' && plan.lifecycleState === 'active') {
    const interval = plan.trigger.intervalMinutes ?? 60;
    const nextReviewAt = new Date(Date.parse(occurredAt) + interval * MINUTE_MS).toISOString();
    const next = mutatePlan(plan, {
      cycle: plan.cycle + 1,
      responseState: 'scheduled',
      currentCommandId: undefined,
      noResponseDecisionCommandId: undefined,
      nextReviewAt,
      trigger: { ...plan.trigger, dueAt: nextReviewAt, lastTriggeredAt: undefined },
      updatedAt: occurredAt,
    });
    return appendMutationEvent(next, 'cycle_resolved', input.actor, occurredAt, 'Guardian Check-In cycle resolved; the next recurring review is scheduled.');
  }
  const next = mutatePlan(plan, {
    lifecycleState: 'completed',
    responseState: 'resolved',
    nextReviewAt: null,
    updatedAt: occurredAt,
  });
  return appendMutationEvent(next, 'cycle_resolved', input.actor, occurredAt, 'Guardian Check-In resolved.');
}

export function createGuardianCheckInDeadline(plan: GuardianCheckInPlan): MissionClockDeadlineInput | null {
  if (plan.lifecycleState !== 'active' || !plan.nextReviewAt) return null;
  if (plan.responseState === 'acknowledged' || plan.responseState === 'resolved' || plan.responseState === 'cancelled') return null;
  const source = plan.responseState === 'scheduled' ? 'scheduled_check_in' : 'no_response_review';
  return createMissionClockDeadline({
    id: `mission-clock:guardian:${plan.id}`,
    expeditionId: plan.expeditionId,
    source,
    title: plan.title,
    reason: plan.responseState === 'scheduled'
      ? `Guardian Check-In due for ${formatGuardianTarget(plan.target)}.`
      : `Guardian Check-In grace period review for ${formatGuardianTarget(plan.target)}.`,
    dueAt: plan.nextReviewAt,
    priority: plan.responseState === 'scheduled' ? 'normal' : 'high',
    linkedCommandId: plan.currentCommandId,
    linkedContext: plan.trigger.linkedContext
      ? {
          id: plan.trigger.linkedContext.id,
          type: plan.trigger.linkedContext.type,
          label: plan.trigger.linkedContext.title,
          restricted: plan.trigger.linkedContext.restricted === true,
        }
      : undefined,
    sourceTruth: plan.sourceTruth,
    completionState: 'active',
    suggestedAction: {
      code: plan.responseState === 'scheduled' ? 'open_guardian_check_in' : 'review_guardian_no_response',
      label: plan.responseState === 'scheduled' ? 'Open Guardian Check-In' : 'Review Check-In Response',
    },
  });
}

export function getGuardianCheckInDeadlineStatus(
  plan: GuardianCheckInPlan,
  now?: string | number | Date,
): MissionClockDeadlineStatus | 'not_scheduled' {
  const deadline = createGuardianCheckInDeadline(plan);
  return deadline ? evaluateMissionClockDeadline(deadline, now ?? Date.now()).status : 'not_scheduled';
}

export function deriveGuardianResponseState(
  plan: GuardianCheckInPlan,
  command: MissionCommand | null | undefined,
): GuardianCheckInResponseState {
  if (!command || command.id !== plan.currentCommandId) return plan.responseState;
  if (TERMINAL_RESPONSE_STATES.has(plan.responseState)) return plan.responseState;
  if (command.acknowledgmentState === 'complete') return 'acknowledged';
  if (command.acknowledgmentState === 'declined') return 'declined';
  if (command.operationalState === 'resolved') return 'resolved';
  if (command.operationalState === 'cancelled') return 'cancelled';
  if (command.deliveryState === 'delivered') return 'delivered';
  if (command.deliveryState === 'queued' || command.deliveryState === 'retrying') return 'queued';
  return 'requested';
}

export function normalizePersistedGuardianCheckInPlan(value: unknown): GuardianCheckInPlan | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<GuardianCheckInPlan>;
  if (candidate.schemaVersion !== GUARDIAN_CHECK_IN_SCHEMA_VERSION || !safeId(candidate.id) ||
      !safeId(candidate.expeditionId) || !safeKey(candidate.idempotencyKey)) return null;
  const creator = normalizeActor(candidate.creator);
  const target = normalizeTarget(candidate.target);
  const trigger = normalizeTrigger(candidate.trigger);
  const createdAt = normalizeIso(candidate.createdAt);
  const updatedAt = normalizeIso(candidate.updatedAt);
  if (!creator.id || !target || !trigger || !createdAt || !updatedAt) return null;
  if (!isLifecycleState(candidate.lifecycleState) || !isResponseState(candidate.responseState)) return null;
  const grace = boundedMinutes(candidate.gracePeriodMinutes, 1, MAX_GRACE_MINUTES);
  if (grace == null) return null;
  return {
    schemaVersion: GUARDIAN_CHECK_IN_SCHEMA_VERSION,
    version: positiveInteger(candidate.version, 1),
    id: candidate.id!,
    expeditionId: candidate.expeditionId!,
    title: safeText(candidate.title, 160) || 'Guardian Check-In',
    creator,
    target,
    trigger,
    acknowledgmentRequirement: normalizeAcknowledgmentRequirement(
      candidate.acknowledgmentRequirement ?? { mode: 'none', targetMemberIds: [] },
      target,
      candidate.soloMode === true,
    ),
    gracePeriodMinutes: grace,
    nextReviewAt: normalizeIso(candidate.nextReviewAt) ?? null,
    sourceTruth: normalizeSources(candidate.sourceTruth ?? []),
    lifecycleState: candidate.lifecycleState!,
    responseState: candidate.responseState!,
    soloMode: candidate.soloMode === true,
    cycle: positiveInteger(candidate.cycle, 1),
    currentCommandId: safeId(candidate.currentCommandId) ?? undefined,
    noResponseDecisionCommandId: safeId(candidate.noResponseDecisionCommandId) ?? undefined,
    pausedAt: normalizeIso(candidate.pausedAt),
    pauseRemainingMs: finiteNonNegative(candidate.pauseRemainingMs),
    createdAt,
    updatedAt,
    idempotencyKey: candidate.idempotencyKey!,
    events: normalizeEvents(candidate.events, candidate.id!, candidate.expeditionId!),
  };
}

export function mergeGuardianCheckInPlan(
  plans: GuardianCheckInPlan[],
  incoming: GuardianCheckInPlan,
): GuardianCheckInPlan[] {
  const normalized = normalizePersistedGuardianCheckInPlan(incoming);
  if (!normalized) return mergeGuardianCheckInPlanBatch(plans);
  const index = plans.findIndex((plan) => plan.id === normalized.id || plan.idempotencyKey === normalized.idempotencyKey);
  if (index < 0) return boundPlans([...plans, normalized]);
  const current = normalizePersistedGuardianCheckInPlan(plans[index]);
  if (!current) return boundPlans([...plans.slice(0, index), normalized, ...plans.slice(index + 1)]);
  const selected = normalized.version > current.version ||
    (normalized.version === current.version && Date.parse(normalized.updatedAt) > Date.parse(current.updatedAt))
    ? { ...normalized, id: current.id, idempotencyKey: current.idempotencyKey }
    : current;
  return boundPlans([...plans.slice(0, index), selected, ...plans.slice(index + 1)]);
}

export function mergeGuardianCheckInPlanBatch(values: readonly unknown[]): GuardianCheckInPlan[] {
  let result: GuardianCheckInPlan[] = [];
  for (const value of values) {
    const normalized = normalizePersistedGuardianCheckInPlan(value);
    if (normalized) result = mergeGuardianCheckInPlan(result, normalized);
  }
  return boundPlans(result);
}

export function formatGuardianTarget(target: MissionCommandTarget): string {
  if (target.label?.trim()) return target.label.trim();
  if (target.kind === 'member' || target.kind === 'solo') return target.memberId;
  if (target.kind === 'role') return target.roleId;
  if (target.kind === 'vehicle') return target.vehicleId;
  return `${target.memberIds.length} expedition members`;
}

export function guardianTriggerRequiresOperatorConfirmation(type: GuardianCheckInTriggerType): boolean {
  return GUARDIAN_CHECK_IN_TRIGGER_SUPPORT[type] === 'operator_confirmation';
}

function buildTrigger(
  input: CreateGuardianCheckInPlanInput,
  now: string,
): { ok: true; trigger: GuardianCheckInTrigger } | { ok: false; safeCode: string; reason: string } {
  const support = GUARDIAN_CHECK_IN_TRIGGER_SUPPORT[input.triggerType];
  const intervalMinutes = input.triggerType === 'recurring_interval'
    ? boundedMinutes(input.intervalMinutes, 5, MAX_INTERVAL_MINUTES)
    : undefined;
  if (input.triggerType === 'recurring_interval' && intervalMinutes == null) {
    return failure('guardian_interval_invalid', `Recurring interval must be between 5 and ${MAX_INTERVAL_MINUTES} minutes.`);
  }
  let dueAt = normalizeIso(input.dueAt);
  if (input.triggerType === 'fixed_time' && !dueAt) {
    return failure('guardian_due_at_invalid', 'Fixed-time Guardian Check-Ins require an absolute time.');
  }
  if (input.triggerType === 'recurring_interval' && !dueAt) {
    dueAt = new Date(Date.parse(now) + (intervalMinutes ?? 60) * MINUTE_MS).toISOString();
  }
  if (EVENT_TRIGGER_TYPES.has(input.triggerType) && !input.linkedContext) {
    return failure('guardian_linked_context_required', 'This Guardian Check-In trigger requires linked route, rally, camp, segment, or incident context.');
  }
  const linkedContext = sanitizeGuardianContext(
    input.linkedContext,
    input.includeExactLocation,
    input.locationPermissionAllowed,
  );
  if (input.linkedContext && !linkedContext) {
    return failure('guardian_linked_context_invalid', 'Guardian Check-In linked context is invalid.');
  }
  return {
    ok: true,
    trigger: {
      type: input.triggerType,
      support,
      dueAt,
      intervalMinutes: intervalMinutes ?? undefined,
      linkedContext,
      includeExactLocation: Boolean(
        input.includeExactLocation &&
        input.locationPermissionAllowed &&
        linkedContext?.coordinates &&
        !linkedContext.restricted
      ),
    },
  };
}

function sanitizeGuardianContext(
  context: CreateGuardianCheckInPlanInput['linkedContext'],
  includeExactLocation: boolean,
  locationPermissionAllowed: boolean,
) {
  const safe = sanitizeMissionCommandLinkedContext(context ?? undefined);
  if (!safe) return undefined;
  if (includeExactLocation && locationPermissionAllowed && !safe.restricted) return safe;
  return {
    ...safe,
    coordinates: undefined,
    metadata: {
      ...(safe.metadata ?? {}),
      exactLocationOmitted: true,
      locationPermissionDenied: !locationPermissionAllowed,
    },
  };
}

function initialReviewAt(trigger: GuardianCheckInTrigger, now: string): string | null {
  if (trigger.dueAt) return trigger.dueAt;
  if (trigger.support === 'operator_request') return now;
  return null;
}

function normalizeTrigger(value: unknown): GuardianCheckInTrigger | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<GuardianCheckInTrigger>;
  if (!candidate.type || !(candidate.type in GUARDIAN_CHECK_IN_TRIGGER_SUPPORT)) return null;
  const support = GUARDIAN_CHECK_IN_TRIGGER_SUPPORT[candidate.type];
  const linkedContext = sanitizeMissionCommandLinkedContext(candidate.linkedContext);
  const intervalMinutes = candidate.type === 'recurring_interval'
    ? boundedMinutes(candidate.intervalMinutes, 5, MAX_INTERVAL_MINUTES)
    : undefined;
  if (candidate.type === 'recurring_interval' && intervalMinutes == null) return null;
  return {
    type: candidate.type,
    support,
    dueAt: normalizeIso(candidate.dueAt),
    intervalMinutes: intervalMinutes ?? undefined,
    linkedContext,
    includeExactLocation: candidate.includeExactLocation === true && Boolean(linkedContext?.coordinates) && !linkedContext?.restricted,
    lastTriggeredAt: normalizeIso(candidate.lastTriggeredAt),
  };
}

function normalizeAcknowledgmentRequirement(
  value: MissionCommandAcknowledgmentPolicy,
  target: MissionCommandTarget,
  soloMode: boolean,
): MissionCommandAcknowledgmentPolicy {
  if (soloMode) return { mode: 'none', targetMemberIds: [] };
  const targets = uniqueStrings(value.targetMemberIds.length > 0 ? value.targetMemberIds : targetMemberIds(target));
  if (value.mode === 'none') return { mode: 'none', targetMemberIds: [] };
  if (value.mode === 'count') {
    const requiredCount = Math.max(1, Math.min(targets.length || 1, positiveInteger(value.requiredCount, 1)));
    return { mode: 'count', targetMemberIds: targets, requiredCount, roleId: safeId(value.roleId) ?? undefined };
  }
  return {
    mode: value.mode === 'any' || value.mode === 'all' ? value.mode : 'all',
    targetMemberIds: targets,
    roleId: safeId(value.roleId) ?? undefined,
  };
}

function mutatePlan(plan: GuardianCheckInPlan, patch: Partial<GuardianCheckInPlan>): GuardianCheckInPlan {
  return { ...plan, ...patch, version: plan.version + 1 };
}

function appendMutationEvent(
  plan: GuardianCheckInPlan,
  type: GuardianCheckInEventType,
  actor: MissionCommandActor,
  occurredAt: string,
  summary: string,
  idempotencyKey?: string,
  commandId?: string,
): GuardianCheckInMutationResult {
  const key = safeKey(idempotencyKey) ?? `${plan.id}:${type}:${plan.version}`;
  if (plan.events.some((event) => event.idempotencyKey === key)) {
    return { ok: true, changed: false, plan, event: null };
  }
  const event = createGuardianEvent(plan, type, actor, occurredAt, summary, key, commandId);
  return { ok: true, changed: true, plan: appendEventOnly(plan, event), event };
}

function appendEventOnly(plan: GuardianCheckInPlan, event: GuardianCheckInEvent): GuardianCheckInPlan {
  return {
    ...plan,
    events: [...plan.events.filter((candidate) => candidate.id !== event.id), event]
      .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt))
      .slice(-GUARDIAN_EVENT_LIMIT),
  };
}

function createGuardianEvent(
  plan: GuardianCheckInPlan,
  type: GuardianCheckInEventType,
  actor: MissionCommandActor,
  occurredAt: string,
  summary: string,
  idempotencyKey: string,
  commandId?: string,
): GuardianCheckInEvent {
  return {
    schemaVersion: GUARDIAN_CHECK_IN_SCHEMA_VERSION,
    id: createDispatchEntityId('guardian_check_in_event', idempotencyKey),
    idempotencyKey,
    planId: plan.id,
    expeditionId: plan.expeditionId,
    type,
    actor: normalizeActor(actor),
    occurredAt,
    summary: safeText(summary, 500) || humanize(type),
    responseState: plan.responseState,
    commandId: safeId(commandId) ?? undefined,
  };
}

function normalizeEvents(value: unknown, planId: string, expeditionId: string): GuardianCheckInEvent[] {
  if (!Array.isArray(value)) return [];
  const events: GuardianCheckInEvent[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const event = raw as Partial<GuardianCheckInEvent>;
    const actor = normalizeActor(event.actor);
    const occurredAt = normalizeIso(event.occurredAt);
    if (event.schemaVersion !== 1 || event.planId !== planId || event.expeditionId !== expeditionId ||
        !safeId(event.id) || !safeKey(event.idempotencyKey) || !occurredAt || !actor.id ||
        !isEventType(event.type) || !isResponseState(event.responseState)) continue;
    events.push({
      schemaVersion: 1,
      id: event.id!,
      idempotencyKey: event.idempotencyKey!,
      planId,
      expeditionId,
      type: event.type!,
      actor,
      occurredAt,
      summary: safeText(event.summary, 500) || humanize(event.type!),
      responseState: event.responseState!,
      commandId: safeId(event.commandId) ?? undefined,
      safeCode: safeKey(event.safeCode) ?? undefined,
    });
  }
  const byKey = new Map(events.map((event) => [event.idempotencyKey, event]));
  return [...byKey.values()].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)).slice(-GUARDIAN_EVENT_LIMIT);
}

function boundPlans(plans: GuardianCheckInPlan[]): GuardianCheckInPlan[] {
  return [...plans]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, GUARDIAN_CHECK_IN_PLAN_LIMIT);
}

function lifecycleTransitions(state: GuardianCheckInLifecycleState): ReadonlySet<GuardianCheckInLifecycleState> {
  if (state === 'active') return new Set(['paused', 'completed', 'cancelled']);
  if (state === 'paused') return new Set(['active', 'cancelled']);
  return new Set();
}

function targetMemberIds(target: MissionCommandTarget): string[] {
  if (target.kind === 'member' || target.kind === 'solo') return [target.memberId];
  if (target.kind === 'team') return uniqueStrings(target.memberIds);
  return [];
}

function normalizeTarget(value: unknown): MissionCommandTarget | null {
  if (!value || typeof value !== 'object') return null;
  const target = value as Partial<MissionCommandTarget> & Record<string, unknown>;
  const label = safeText(target.label, 160) || undefined;
  if (target.kind === 'member' || target.kind === 'solo') {
    const memberId = safeId(target.memberId);
    return memberId ? { kind: target.kind, memberId, label } : null;
  }
  if (target.kind === 'role') {
    const roleId = safeId(target.roleId);
    return roleId ? { kind: 'role', roleId, label } : null;
  }
  if (target.kind === 'vehicle') {
    const vehicleId = safeId(target.vehicleId);
    return vehicleId ? { kind: 'vehicle', vehicleId, label } : null;
  }
  if (target.kind === 'team') {
    const memberIds = uniqueStrings(target.memberIds);
    return memberIds.length > 0 ? { kind: 'team', memberIds, label } : null;
  }
  return null;
}

function normalizeActor(value: unknown): MissionCommandActor {
  if (!value || typeof value !== 'object') return { id: '', label: '' };
  const actor = value as Partial<MissionCommandActor>;
  return {
    id: safeId(actor.id) ?? '',
    label: safeText(actor.label, 160) || safeId(actor.id) || '',
    role: actor.role,
  };
}

function manualSource(id: string, actor: MissionCommandActor, observedAt: string): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id,
    origin: 'manual',
    role: 'primary',
    policyKey: 'manual_user_state',
    authority: safeText(actor.label, 160) || 'ECS operator',
    authorityKind: 'user',
    observedAt,
    confidence: 'high',
    coverage: 'complete',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: ['manual_source'],
  });
}

function normalizeSources(values: readonly SourceTruthRef[]): SourceTruthRef[] {
  const byId = new Map<string, SourceTruthRef>();
  values.forEach((value) => {
    const sanitized = sanitizeSourceTruthRef(value);
    if (sanitized.id) byId.set(sanitized.id, sanitized);
  });
  return [...byId.values()].slice(0, 12);
}

function defaultTitle(type: GuardianCheckInTriggerType, soloMode: boolean): string {
  if (soloMode) return type === 'recurring_interval' ? 'Recurring Self Check-In' : 'Personal Guardian Check-In';
  return type === 'recurring_interval' ? 'Recurring Team Check-In' : 'Guardian Check-In';
}

function states(...values: GuardianCheckInResponseState[]): ReadonlySet<GuardianCheckInResponseState> {
  return new Set(values);
}

function failure(safeCode: string, reason: string): { ok: false; safeCode: string; reason: string } {
  return { ok: false, safeCode, reason };
}

function invalid(plan: GuardianCheckInPlan, safeCode: string, reason: string): GuardianCheckInMutationResult {
  return { ok: false, changed: false, plan, event: null, safeCode, reason };
}

function noResponseInvalid(plan: GuardianCheckInPlan, safeCode: string, reason: string): GuardianCheckInNoResponseResult {
  return {
    ok: false,
    changed: false,
    plan,
    planEvent: null,
    decisionCommand: null,
    decisionEvent: null,
    safeCode,
    reason,
  };
}

function isLifecycleState(value: unknown): value is GuardianCheckInLifecycleState {
  return value === 'active' || value === 'paused' || value === 'completed' || value === 'cancelled';
}

function isResponseState(value: unknown): value is GuardianCheckInResponseState {
  return [
    'scheduled', 'requested', 'queued', 'delivered', 'acknowledged', 'delayed',
    'declined', 'no_response', 'resolved', 'cancelled',
  ].includes(String(value));
}

function isEventType(value: unknown): value is GuardianCheckInEventType {
  return [
    'created', 'trigger_confirmed', 'request_linked', 'delivery_updated', 'response_recorded',
    'no_response_recorded', 'decision_created', 'paused', 'resumed', 'cycle_resolved', 'cancelled',
  ].includes(String(value));
}

function boundedMinutes(value: unknown, minimum: number, maximum: number): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  const rounded = Math.floor(number);
  return rounded >= minimum && rounded <= maximum ? rounded : null;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map(safeId).filter((item): item is string => Boolean(item)))].sort().slice(0, 100)
    : [];
}

function normalizeIso(value: unknown): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function safeText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}

function safeId(value: unknown): string | null {
  const normalized = safeText(value, 200);
  return normalized && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(normalized) ? normalized : null;
}

function safeKey(value: unknown): string | undefined {
  const normalized = safeText(value, 300);
  return normalized && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(normalized) ? normalized : undefined;
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

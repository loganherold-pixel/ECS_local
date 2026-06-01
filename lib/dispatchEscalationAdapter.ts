import type {
  DispatchDeliveryState,
  DispatchEscalationState,
  DispatchPing,
  DispatchPriority,
  DispatchQueueItem,
  DispatchTeamMember,
  DispatchTimelineEvent,
} from './dispatchTypes';
import { getEscalationRecommendation as getBaseEscalationRecommendation } from './dispatchTypes';

export type DispatchEscalationTrigger =
  | 'ack_timer_expired'
  | 'critical_pending'
  | 'emergency_unacknowledged'
  | 'assist_unaccepted'
  | 'member_stale'
  | 'failed_after_retry'
  | 'queue_blocked'
  | 'manual';

export interface DispatchEscalationDecision {
  shouldEscalate: boolean;
  shouldSuggest: boolean;
  canAutoEscalate: boolean;
  trigger?: DispatchEscalationTrigger;
  nextState: DispatchEscalationState;
  priority: DispatchPriority;
  reason: string;
  safetyCopy?: string;
}

export interface DispatchEscalationTransition {
  queueItem: DispatchQueueItem;
  ping?: DispatchPing;
  timelineEvent: Omit<DispatchTimelineEvent, 'id' | 'occurredAt'>;
  decision: DispatchEscalationDecision;
}

const ESCALATION_SAFETY_COPY = 'ECS team coordination only.';
const ESCALATION_TERMINAL_STATES = new Set<DispatchEscalationState>([
  'emergency_unresolved',
  'resolved',
  'recovered',
]);

export function getEscalationRecommendation(input: {
  priority: DispatchPriority;
  status?: DispatchQueueItem['status'] | DispatchPing['status'];
  escalationState?: DispatchEscalationState;
}): string {
  return getBaseEscalationRecommendation(input);
}

export function shouldSuggestEscalation(input: {
  queueItem?: DispatchQueueItem;
  ping?: DispatchPing;
  member?: DispatchTeamMember;
  now?: string;
  retryFailed?: boolean;
}): DispatchEscalationDecision {
  const nowMs = Date.parse(input.now ?? new Date().toISOString());
  const queueItem = input.queueItem;
  const ping = input.ping;
  const currentState = queueItem?.escalationState ?? ping?.escalationState ?? 'none';

  if (queueItem?.status === 'resolved' || queueItem?.status === 'cancelled' || currentState === 'resolved' || currentState === 'recovered') {
    return createDecision(false, 'manual', currentState, queueItem?.priority ?? ping?.priority ?? 'normal', 'Escalation is already closed.');
  }

  if (queueItem && isTerminalEscalationState(queueItem.escalationState)) {
    return createDecision(false, 'manual', queueItem.escalationState, queueItem.priority, 'Escalation is already at the final ladder state.', true);
  }

  if (ping?.responseDueAt && Date.parse(ping.responseDueAt) <= nowMs && !hasAllTargetsAcknowledged(ping)) {
    return createDecision(true, 'ack_timer_expired', currentState, strongestPriority(queueItem?.priority, ping.priority), 'Acknowledgment timer elapsed with unresolved responses.', true);
  }

  if (queueItem?.dueAt && Date.parse(queueItem.dueAt) <= nowMs && queueItem.status === 'pending_response') {
    return createDecision(true, 'ack_timer_expired', currentState, queueItem.priority, 'Queue timer elapsed while awaiting response.', true);
  }

  if (ping?.type === 'emergency' && !hasAllTargetsAcknowledged(ping)) {
    return createDecision(true, 'emergency_unacknowledged', currentState, 'critical', 'Emergency ping has not been acknowledged.', true);
  }

  if (queueItem?.priority === 'critical' && ['new', 'pending_response', 'assigned', 'blocked'].includes(queueItem.status)) {
    return createDecision(true, 'critical_pending', currentState, 'critical', 'Critical Dispatch item remains unresolved.', true);
  }

  if (ping?.type === 'assist' && ping.status !== 'accepted' && ping.status !== 'acknowledged') {
    return createDecision(true, 'assist_unaccepted', currentState, strongestPriority(queueItem?.priority, ping.priority), 'Assist request has not been accepted.', true);
  }

  if (input.member && ['offline', 'needs_check_in', 'no_response'].includes(input.member.status)) {
    return createDecision(true, 'member_stale', currentState, queueItem?.priority ?? 'high', `${input.member.callSign} is stale or has not responded.`);
  }

  if (input.retryFailed || queueItem?.deliveryState === 'failed' || ping?.status === 'failed') {
    return createDecision(true, 'failed_after_retry', currentState, strongestPriority(queueItem?.priority, ping?.priority), 'Delivery failed after retry or remains failed.');
  }

  if (queueItem?.status === 'blocked') {
    return createDecision(true, 'queue_blocked', currentState, strongestPriority(queueItem.priority, ping?.priority), 'Dispatch queue item is blocked.');
  }

  return createDecision(false, 'manual', currentState, queueItem?.priority ?? ping?.priority ?? 'normal', 'No escalation suggested.');
}

export function canAutoEscalate(input: {
  decision: DispatchEscalationDecision;
  safeTimerAvailable?: boolean;
}): boolean {
  return Boolean(input.safeTimerAvailable && input.decision.shouldEscalate);
}

export function applyEscalationTransition(input: {
  queueItem: DispatchQueueItem;
  ping?: DispatchPing;
  now: string;
  actor: string;
  target: string;
  manual?: boolean;
}): DispatchEscalationTransition {
  const decision = input.manual
    ? createDecision(
      true,
      'manual',
      input.queueItem.escalationState,
      input.queueItem.priority === 'critical' ? 'critical' : 'high',
      'Manual escalation by permitted Dispatch user.',
      true,
    )
    : shouldSuggestEscalation({
      queueItem: input.queueItem,
      ping: input.ping,
      now: input.now,
    });
  const nextState = getNextEscalationState(input.queueItem.escalationState, decision.trigger);
  const nextPriority = shouldForceCritical(decision.trigger)
    ? 'critical'
    : strongestPriority(input.queueItem.priority, decision.priority);
  const nextDeliveryState: DispatchDeliveryState = 'escalated';

  const queueItem: DispatchQueueItem = {
    ...input.queueItem,
    version: (input.queueItem.version ?? 1) + 1,
    status: 'escalated',
    priority: nextPriority,
    escalationState: nextState,
    deliveryState: nextDeliveryState,
    reliabilityState: input.queueItem.reliabilityState === 'failed' ? 'failed' : input.queueItem.reliabilityState,
    updatedAt: input.now,
  };
  const ping = input.ping
    ? {
      ...input.ping,
      version: (input.ping.version ?? 1) + 1,
      status: 'escalated' as const,
      priority: strongestPriority(input.ping.priority, nextPriority),
      escalationState: nextState,
      updatedAt: input.now,
    }
    : undefined;

  return {
    queueItem,
    ping,
    decision: {
      ...decision,
      nextState,
      priority: nextPriority,
    },
    timelineEvent: createEscalationTimelineEvent({
      queueItem,
      ping,
      decision: {
        ...decision,
        nextState,
        priority: nextPriority,
      },
      actor: input.actor,
      target: input.target,
    }),
  };
}

export function getNextEscalationState(
  current: DispatchEscalationState,
  trigger: DispatchEscalationTrigger = 'manual',
): DispatchEscalationState {
  if (trigger === 'emergency_unacknowledged' || trigger === 'failed_after_retry') {
    return 'emergency_unresolved';
  }

  switch (current) {
    case 'none':
    case 'monitor':
    case 'recommended':
      return 'follow_up';
    case 'follow_up':
      return 'escalate_to_lead';
    case 'escalate_to_lead':
      return 'broadcast_to_team';
    case 'broadcast_to_team':
    case 'escalated':
      return 'emergency_unresolved';
    default:
      return current;
  }
}

export function createEscalationTimelineEvent(input: {
  queueItem: DispatchQueueItem;
  ping?: DispatchPing;
  decision: DispatchEscalationDecision;
  actor: string;
  target: string;
}): Omit<DispatchTimelineEvent, 'id' | 'occurredAt'> {
  return {
    type: 'queue_escalated',
    title: `${input.queueItem.title} escalated`,
    detail: `${getEscalationStateLabel(input.decision.nextState)}. ${input.decision.reason} ${ESCALATION_SAFETY_COPY}`,
    priority: input.decision.priority,
    memberIds: input.queueItem.assignedMemberIds,
    actor: input.actor,
    target: input.target,
    linkedContext: input.queueItem.linkedContext,
    queueItemId: input.queueItem.id,
    pingId: input.ping?.id ?? input.queueItem.sourcePingId,
    deliveryState: 'escalated',
    escalationState: input.decision.nextState,
  };
}

export function getEscalationStateLabel(state: DispatchEscalationState): string {
  switch (state) {
    case 'monitor':
      return 'Monitor escalation watch';
    case 'follow_up':
      return 'Follow-up escalation staged';
    case 'escalate_to_lead':
      return 'Escalated to expedition lead';
    case 'broadcast_to_team':
      return 'Broadcast to team escalation';
    case 'emergency_unresolved':
      return 'Emergency coordination unresolved';
    case 'escalated':
      return 'Escalation active';
    case 'resolved':
      return 'Escalation resolved';
    case 'recovered':
      return 'Escalation recovered';
    default:
      return 'Escalation cleared';
  }
}

export function isTerminalEscalationState(state: DispatchEscalationState): boolean {
  return ESCALATION_TERMINAL_STATES.has(state);
}

function createDecision(
  shouldEscalate: boolean,
  trigger: DispatchEscalationTrigger,
  currentState: DispatchEscalationState,
  priority: DispatchPriority,
  reason: string,
  includeSafetyCopy = false,
): DispatchEscalationDecision {
  const nextState = shouldEscalate ? getNextEscalationState(currentState, trigger) : currentState;

  return {
    shouldEscalate,
    shouldSuggest: shouldEscalate,
    canAutoEscalate: false,
    trigger,
    nextState,
    priority,
    reason,
    safetyCopy: includeSafetyCopy ? ESCALATION_SAFETY_COPY : undefined,
  };
}

function hasAllTargetsAcknowledged(ping: DispatchPing): boolean {
  if (ping.targetMemberIds.length === 0) return false;
  const acknowledged = new Set(ping.acknowledgedByMemberIds ?? []);
  return ping.targetMemberIds.every((memberId) => acknowledged.has(memberId));
}

function shouldForceCritical(trigger?: DispatchEscalationTrigger): boolean {
  return (
    trigger === 'critical_pending' ||
    trigger === 'emergency_unacknowledged' ||
    trigger === 'failed_after_retry'
  );
}

function strongestPriority(
  left: DispatchPriority | undefined,
  right: DispatchPriority | undefined,
): DispatchPriority {
  const order: Record<DispatchPriority, number> = {
    low: 1,
    normal: 2,
    high: 3,
    critical: 4,
  };
  const resolvedLeft = left ?? 'normal';
  const resolvedRight = right ?? 'normal';
  return order[resolvedRight] > order[resolvedLeft] ? resolvedRight : resolvedLeft;
}

import type {
  DispatchAssignmentStatus,
  DispatchDeliveryState,
  DispatchPingOperationalState,
  DispatchQueueItemStatus,
  DispatchQueuedOfflineAction,
} from './dispatchTypes';

export type DispatchLifecycleEntity =
  | 'ping'
  | 'queue_item'
  | 'assignment'
  | 'acknowledgment'
  | 'assist_request'
  | 'timeline_event'
  | 'offline_action';

export type DispatchLifecycleTransitionResult<T extends string> =
  | { ok: true; state: T }
  | { ok: false; state: T; reason: string };

const DELIVERY_TRANSITIONS: Record<DispatchDeliveryState, ReadonlySet<DispatchDeliveryState>> = {
  draft: states('queued', 'sending', 'cancelled'),
  local: states('queued', 'sending', 'cancelled'),
  queued: states('sending', 'retrying', 'failed', 'cancelled'),
  sending: states('queued', 'sent', 'delivered', 'failed', 'retrying', 'cancelled'),
  sent: states('delivered', 'seen', 'acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered', 'failed'),
  delivered: states('seen', 'acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered', 'failed'),
  seen: states('acknowledged', 'accepted', 'declined', 'no_response', 'escalated', 'recovered'),
  acknowledged: states('recovered'),
  accepted: states('recovered'),
  declined: states('escalated', 'recovered'),
  no_response: states('retrying', 'escalated', 'recovered', 'cancelled'),
  escalated: states('acknowledged', 'accepted', 'declined', 'recovered', 'cancelled'),
  recovered: states(),
  failed: states('queued', 'retrying', 'cancelled'),
  retrying: states('queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled'),
  cancelled: states(),
};

const PING_OPERATIONAL_TRANSITIONS: Record<DispatchPingOperationalState, ReadonlySet<DispatchPingOperationalState>> = {
  draft: states('open', 'awaiting_acknowledgment', 'cancelled'),
  open: states('awaiting_acknowledgment', 'acknowledged', 'declined', 'escalated', 'resolved', 'cancelled'),
  awaiting_acknowledgment: states('acknowledged', 'declined', 'escalated', 'resolved', 'cancelled'),
  acknowledged: states('resolved'),
  declined: states('escalated', 'resolved'),
  escalated: states('acknowledged', 'declined', 'resolved', 'cancelled'),
  resolved: states(),
  cancelled: states(),
};

const QUEUE_TRANSITIONS: Record<DispatchQueueItemStatus, ReadonlySet<DispatchQueueItemStatus>> = {
  new: states('pending_response', 'assigned', 'in_progress', 'blocked', 'escalated', 'needs_review', 'resolved', 'cancelled'),
  pending_response: states('assigned', 'in_progress', 'blocked', 'escalated', 'needs_review', 'resolved', 'cancelled'),
  assigned: states('in_progress', 'blocked', 'escalated', 'needs_review', 'resolved', 'cancelled'),
  in_progress: states('blocked', 'escalated', 'needs_review', 'resolved', 'cancelled'),
  blocked: states('assigned', 'in_progress', 'escalated', 'needs_review', 'resolved', 'cancelled'),
  escalated: states('assigned', 'in_progress', 'blocked', 'needs_review', 'resolved', 'cancelled'),
  needs_review: states('assigned', 'in_progress', 'blocked', 'escalated', 'resolved', 'cancelled'),
  resolved: states(),
  cancelled: states(),
};

const ASSIGNMENT_TRANSITIONS: Record<DispatchAssignmentStatus, ReadonlySet<DispatchAssignmentStatus>> = {
  unassigned: states('offered'),
  offered: states('accepted', 'declined'),
  accepted: states('in_progress', 'blocked', 'completed', 'declined'),
  in_progress: states('blocked', 'completed'),
  blocked: states('in_progress', 'completed', 'declined'),
  completed: states(),
  declined: states(),
};

const OFFLINE_ACTION_TRANSITIONS: Record<DispatchQueuedOfflineAction['status'], ReadonlySet<DispatchQueuedOfflineAction['status']>> = {
  queued: states('replaying', 'cancelled'),
  replaying: states('queued', 'replayed', 'failed', 'cancelled'),
  failed: states('queued', 'replaying', 'cancelled'),
  replayed: states(),
  cancelled: states(),
};

export function transitionDispatchDeliveryState(
  current: DispatchDeliveryState,
  next: DispatchDeliveryState,
): DispatchLifecycleTransitionResult<DispatchDeliveryState> {
  return resolveTransition('delivery', current, next, DELIVERY_TRANSITIONS);
}

export function transitionDispatchPingOperationalState(
  current: DispatchPingOperationalState,
  next: DispatchPingOperationalState,
): DispatchLifecycleTransitionResult<DispatchPingOperationalState> {
  return resolveTransition('ping', current, next, PING_OPERATIONAL_TRANSITIONS);
}

export function transitionDispatchQueueItemStatus(
  current: DispatchQueueItemStatus,
  next: DispatchQueueItemStatus,
): DispatchLifecycleTransitionResult<DispatchQueueItemStatus> {
  return resolveTransition('queue item', current, next, QUEUE_TRANSITIONS);
}

export function transitionDispatchAssistRequestStatus(
  current: DispatchQueueItemStatus,
  next: DispatchQueueItemStatus,
): DispatchLifecycleTransitionResult<DispatchQueueItemStatus> {
  return resolveTransition('assist request', current, next, QUEUE_TRANSITIONS);
}

export function transitionDispatchAssignmentStatus(
  current: DispatchAssignmentStatus,
  next: DispatchAssignmentStatus,
): DispatchLifecycleTransitionResult<DispatchAssignmentStatus> {
  return resolveTransition('assignment', current, next, ASSIGNMENT_TRANSITIONS);
}

export function transitionDispatchOfflineActionStatus(
  current: DispatchQueuedOfflineAction['status'],
  next: DispatchQueuedOfflineAction['status'],
): DispatchLifecycleTransitionResult<DispatchQueuedOfflineAction['status']> {
  return resolveTransition('offline action', current, next, OFFLINE_ACTION_TRANSITIONS);
}

export function deriveDispatchPingOperationalState(input: {
  deliveryState: DispatchDeliveryState;
  requiresAcknowledgment?: boolean;
  acknowledgedCount?: number;
  targetCount?: number;
}): DispatchPingOperationalState {
  if (input.deliveryState === 'cancelled') return 'cancelled';
  if (input.deliveryState === 'escalated' || input.deliveryState === 'no_response') return 'escalated';
  if (input.deliveryState === 'declined') return 'declined';
  if (input.deliveryState === 'recovered') return 'resolved';
  if (
    input.deliveryState === 'acknowledged' ||
    input.deliveryState === 'accepted' ||
    ((input.targetCount ?? 0) > 0 && (input.acknowledgedCount ?? 0) >= (input.targetCount ?? 0))
  ) {
    return 'acknowledged';
  }
  if (input.requiresAcknowledgment) return 'awaiting_acknowledgment';
  if (input.deliveryState === 'draft') return 'draft';
  return 'open';
}

function states<T extends string>(...values: T[]): ReadonlySet<T> {
  return new Set(values);
}

function resolveTransition<T extends string>(
  label: string,
  current: T,
  next: T,
  transitions: Record<T, ReadonlySet<T>>,
): DispatchLifecycleTransitionResult<T> {
  if (current === next) return { ok: true, state: current };
  if (transitions[current]?.has(next)) return { ok: true, state: next };
  return {
    ok: false,
    state: current,
    reason: `Invalid Dispatch ${label} transition: ${current} -> ${next}.`,
  };
}

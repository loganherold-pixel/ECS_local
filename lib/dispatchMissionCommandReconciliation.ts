import type {
  MissionCommand,
  MissionCommandAcknowledgment,
  MissionCommandAcknowledgmentState,
  MissionCommandAssignment,
  MissionCommandDeliveryState,
  MissionCommandOperationalState,
  MissionCommandResolution,
} from './dispatchMissionCommandTypes';

const OPERATIONAL_TRANSITIONS: Record<
  MissionCommandOperationalState,
  readonly MissionCommandOperationalState[]
> = {
  proposed: ['ready', 'cancelled', 'expired'],
  ready: ['active', 'cancelled', 'expired'],
  active: ['in_progress', 'blocked', 'resolved', 'cancelled', 'expired'],
  in_progress: ['blocked', 'resolved', 'cancelled', 'expired'],
  blocked: ['active', 'in_progress', 'resolved', 'cancelled', 'expired'],
  resolved: [],
  cancelled: [],
  expired: [],
};

const DELIVERY_TRANSITIONS: Record<
  MissionCommandDeliveryState,
  readonly MissionCommandDeliveryState[]
> = {
  local: ['queued', 'sending', 'cancelled'],
  queued: ['sending', 'retrying', 'failed', 'cancelled'],
  sending: ['queued', 'sent', 'delivered', 'failed', 'retrying', 'cancelled'],
  sent: ['delivered', 'failed', 'retrying', 'cancelled'],
  delivered: [],
  failed: ['queued', 'retrying', 'cancelled'],
  retrying: ['queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled'],
  cancelled: [],
};

const OPERATIONAL_STAGE: Record<MissionCommandOperationalState, number> = {
  proposed: 0,
  ready: 1,
  active: 2,
  in_progress: 3,
  blocked: 3,
  resolved: 4,
  cancelled: 4,
  expired: 4,
};

const DELIVERY_STAGE: Record<MissionCommandDeliveryState, number> = {
  local: 0,
  queued: 1,
  failed: 1,
  retrying: 2,
  sending: 3,
  sent: 4,
  delivered: 5,
  cancelled: 5,
};

export interface MissionCommandReconciliationResult {
  command: MissionCommand;
  changed: boolean;
  acceptedCore: 'current' | 'incoming';
  acceptedLateAcknowledgment: boolean;
}

/**
 * Reconciles independent Mission Command dimensions. The caller must normalize
 * both records first; this function deliberately does not read stores or time.
 */
export function reconcileMissionCommandRecords(
  current: MissionCommand,
  incoming: MissionCommand,
): MissionCommandReconciliationResult {
  if (
    current.expeditionId !== incoming.expeditionId ||
    (current.id !== incoming.id && current.idempotencyKey !== incoming.idempotencyKey)
  ) {
    return {
      command: current,
      changed: false,
      acceptedCore: 'current',
      acceptedLateAcknowledgment: false,
    };
  }

  const incomingCoreNewer = compareRecordOrder(incoming, current) > 0;
  const core = incomingCoreNewer ? incoming : current;
  const acknowledgments = mergeAcknowledgments(current.acknowledgments, incoming.acknowledgments);
  const acceptedLateAcknowledgment = acknowledgments.some((item) => (
    !current.acknowledgments.some((currentItem) => (
      currentItem.id === item.id && currentItem.respondedAt === item.respondedAt
    ))
  ));
  const operational = reconcileOperationalState(current, incoming, incomingCoreNewer);
  const deliveryState = reconcileDeliveryState(current, incoming, incomingCoreNewer);
  const assignment = reconcileAssignment(current.assignment, incoming.assignment);
  const sourceTruth = mergeSourceTruth(current.sourceTruth, incoming.sourceTruth);
  const resolution = reconcileResolution(current.resolution, incoming.resolution, operational);
  const acknowledgmentState = operational === 'expired' && core.acknowledgmentPolicy.mode !== 'none'
    ? 'expired'
    : deriveAcknowledgmentState(core, acknowledgments);
  const merged: MissionCommand = {
    ...core,
    id: current.id,
    idempotencyKey: current.idempotencyKey,
    version: Math.max(current.version, incoming.version),
    operationalState: operational,
    deliveryState,
    assignment,
    acknowledgments,
    acknowledgmentState,
    sourceTruth,
    resolution,
    createdAt: minIso(current.createdAt, incoming.createdAt),
    updatedAt: maxIso(
      current.updatedAt,
      incoming.updatedAt,
      assignment?.updatedAt,
      ...acknowledgments.map((item) => item.respondedAt),
      resolution?.occurredAt,
    ),
  };

  return {
    command: merged,
    changed: stableSerialize(merged) !== stableSerialize(current),
    acceptedCore: incomingCoreNewer ? 'incoming' : 'current',
    acceptedLateAcknowledgment,
  };
}

function reconcileOperationalState(
  current: MissionCommand,
  incoming: MissionCommand,
  incomingCoreNewer: boolean,
): MissionCommandOperationalState {
  if (current.operationalState === incoming.operationalState) return current.operationalState;
  const currentTerminal = isTerminal(current.operationalState);
  const incomingTerminal = isTerminal(incoming.operationalState);
  if (currentTerminal && incomingTerminal) {
    return chooseResolution(current.resolution, incoming.resolution)?.kind ?? current.operationalState;
  }
  if (currentTerminal) return current.operationalState;
  if (incomingTerminal) return incoming.operationalState;
  if (!incomingCoreNewer) return current.operationalState;
  const directTransition = OPERATIONAL_TRANSITIONS[current.operationalState].includes(incoming.operationalState);
  const skippedForwardTransition = OPERATIONAL_STAGE[incoming.operationalState] >
    OPERATIONAL_STAGE[current.operationalState] &&
    canReach(OPERATIONAL_TRANSITIONS, current.operationalState, incoming.operationalState);
  return directTransition || skippedForwardTransition
    ? incoming.operationalState
    : current.operationalState;
}

function reconcileDeliveryState(
  current: MissionCommand,
  incoming: MissionCommand,
  incomingCoreNewer: boolean,
): MissionCommandDeliveryState {
  const currentState = current.deliveryState;
  const incomingState = incoming.deliveryState;
  if (currentState === incomingState) return currentState;
  if (currentState === 'delivered' || incomingState === 'delivered') return 'delivered';
  if (currentState === 'cancelled') return currentState;
  if (!incomingCoreNewer) return currentState;
  const directTransition = DELIVERY_TRANSITIONS[currentState].includes(incomingState);
  const skippedForwardTransition = DELIVERY_STAGE[incomingState] > DELIVERY_STAGE[currentState] &&
    canReach(DELIVERY_TRANSITIONS, currentState, incomingState);
  return directTransition || skippedForwardTransition ? incomingState : currentState;
}

function reconcileAssignment(
  current: MissionCommandAssignment | undefined,
  incoming: MissionCommandAssignment | undefined,
): MissionCommandAssignment | undefined {
  if (!current) return incoming;
  if (!incoming) return current;
  const timeComparison = compareIso(incoming.updatedAt, current.updatedAt);
  if (timeComparison > 0) return incoming;
  if (timeComparison < 0) return current;
  return assignmentIdentity(incoming) < assignmentIdentity(current) ? incoming : current;
}

function reconcileResolution(
  current: MissionCommandResolution | undefined,
  incoming: MissionCommandResolution | undefined,
  operationalState: MissionCommandOperationalState,
): MissionCommandResolution | undefined {
  if (!isTerminal(operationalState)) return undefined;
  return chooseResolution(current, incoming);
}

function chooseResolution(
  current: MissionCommandResolution | undefined,
  incoming: MissionCommandResolution | undefined,
): MissionCommandResolution | undefined {
  if (!current) return incoming;
  if (!incoming) return current;
  const timeComparison = compareIso(incoming.occurredAt, current.occurredAt);
  if (timeComparison < 0) return incoming;
  if (timeComparison > 0) return current;
  return resolutionIdentity(incoming) < resolutionIdentity(current) ? incoming : current;
}

function mergeAcknowledgments(
  current: MissionCommandAcknowledgment[],
  incoming: MissionCommandAcknowledgment[],
): MissionCommandAcknowledgment[] {
  const byMember = new Map<string, MissionCommandAcknowledgment>();
  for (const acknowledgment of [...current, ...incoming]) {
    const existing = byMember.get(acknowledgment.memberId);
    if (!existing) {
      byMember.set(acknowledgment.memberId, acknowledgment);
      continue;
    }
    const timeComparison = compareIso(acknowledgment.respondedAt, existing.respondedAt);
    if (
      timeComparison > 0 ||
      (timeComparison === 0 && acknowledgmentIdentity(acknowledgment) < acknowledgmentIdentity(existing))
    ) {
      byMember.set(acknowledgment.memberId, acknowledgment);
    }
  }
  return [...byMember.values()].sort((left, right) => (
    left.memberId.localeCompare(right.memberId) || compareIso(left.respondedAt, right.respondedAt)
  ));
}

function deriveAcknowledgmentState(
  command: MissionCommand,
  acknowledgments: MissionCommandAcknowledgment[],
): MissionCommandAcknowledgmentState {
  const policy = command.acknowledgmentPolicy;
  if (policy.mode === 'none') return 'not_required';
  const latest = acknowledgments.filter((item) => policy.targetMemberIds.includes(item.memberId));
  const accepted = latest.filter((item) => item.response === 'acknowledged').length;
  const declined = latest.filter((item) => item.response === 'declined').length;
  const targetCount = Math.max(1, policy.targetMemberIds.length);
  const required = policy.mode === 'any'
    ? 1
    : policy.mode === 'all'
      ? targetCount
      : Math.max(1, Math.min(targetCount, Math.floor(policy.requiredCount ?? 1)));
  if (accepted >= required) return 'complete';
  if (policy.targetMemberIds.length > 0) {
    const remaining = Math.max(0, policy.targetMemberIds.length - accepted - declined);
    if (accepted + remaining < required) return 'declined';
  } else if (declined > 0 && accepted === 0) {
    return 'declined';
  }
  return latest.length > 0 ? 'partial' : 'pending';
}

function mergeSourceTruth(
  current: MissionCommand['sourceTruth'],
  incoming: MissionCommand['sourceTruth'],
): MissionCommand['sourceTruth'] {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    const existing = byId.get(item.id);
    if (!existing || sourceObservedAt(item) > sourceObservedAt(existing)) byId.set(item.id, item);
  });
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function sourceObservedAt(source: MissionCommand['sourceTruth'][number]): number {
  const candidate = source.observedAt ?? source.fetchedAt;
  const parsed = candidate ? Date.parse(candidate) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function canReach<T extends string>(
  graph: Record<T, readonly T[]>,
  from: T,
  to: T,
): boolean {
  if (from === to) return true;
  const seen = new Set<T>([from]);
  const queue = [...graph[from]];
  while (queue.length > 0) {
    const next = queue.shift() as T;
    if (next === to) return true;
    if (seen.has(next)) continue;
    seen.add(next);
    queue.push(...graph[next]);
  }
  return false;
}

function compareRecordOrder(left: MissionCommand, right: MissionCommand): number {
  if (left.version !== right.version) return left.version - right.version;
  const time = compareIso(left.updatedAt, right.updatedAt);
  if (time !== 0) return time;
  return recordIdentity(left).localeCompare(recordIdentity(right));
}

function recordIdentity(command: MissionCommand): string {
  return [command.operationalState, command.deliveryState, command.title, command.id].join(':');
}

function assignmentIdentity(assignment: MissionCommandAssignment): string {
  return [assignment.id, assignment.assigneeMemberId ?? '', assignment.status].join(':');
}

function resolutionIdentity(resolution: MissionCommandResolution): string {
  return [resolution.kind, resolution.actorId, resolution.summary].join(':');
}

function acknowledgmentIdentity(acknowledgment: MissionCommandAcknowledgment): string {
  return [acknowledgment.idempotencyKey, acknowledgment.id, acknowledgment.response].join(':');
}

function isTerminal(
  state: MissionCommandOperationalState,
): state is MissionCommandResolution['kind'] {
  return state === 'resolved' || state === 'cancelled' || state === 'expired';
}

function compareIso(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

function minIso(left: string, right: string): string {
  return compareIso(left, right) <= 0 ? left : right;
}

function maxIso(...values: Array<string | undefined>): string {
  return values.reduce<string>((latest, value) => (
    value && compareIso(value, latest) > 0 ? value : latest
  ), values.find((value): value is string => Boolean(value)) ?? new Date(0).toISOString());
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(value, (_key, candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate;
    return Object.fromEntries(
      Object.entries(candidate as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)),
    );
  });
}

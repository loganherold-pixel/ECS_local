import type {
  DispatchCheckInResponse,
  DispatchCheckInResponseStatus,
  DispatchCheckInSchedule,
  DispatchCheckInType,
  DispatchDeliveryState,
  DispatchLinkedContext,
  DispatchPing,
  DispatchPriority,
  DispatchQueueItem,
  DispatchTeamMember,
  DispatchTeamMemberStatus,
  DispatchTimelineEvent,
} from './dispatchTypes';

export const DISPATCH_CHECK_IN_RESPONSE_OPTIONS: {
  value: DispatchCheckInResponseStatus;
  label: string;
  priority: DispatchPriority;
}[] = [
  { value: 'ok', label: 'OK', priority: 'normal' },
  { value: 'delayed', label: 'Delayed', priority: 'normal' },
  { value: 'need_assistance', label: 'Need assistance', priority: 'high' },
  { value: 'at_waypoint', label: 'At waypoint', priority: 'normal' },
  { value: 'returning', label: 'Returning', priority: 'normal' },
  { value: 'unavailable', label: 'Unavailable', priority: 'high' },
  { value: 'emergency', label: 'Emergency', priority: 'critical' },
];

export const DISPATCH_CHECK_IN_SCHEDULE_OPTIONS: {
  value: DispatchCheckInSchedule;
  label: string;
}[] = [
  { value: 'off', label: 'Off' },
  { value: 'every_30', label: 'Every 30 min' },
  { value: 'every_60', label: 'Every 60 min' },
  { value: 'every_120', label: 'Every 120 min' },
  { value: 'waypoints_only', label: 'At waypoints only' },
];

const STALE_CHECK_IN_STATUSES = new Set<DispatchTeamMemberStatus>([
  'offline',
  'needs_check_in',
  'no_response',
]);

export function inferCheckInType(input: {
  linkedContext?: DispatchLinkedContext;
  schedule?: DispatchCheckInSchedule;
  hasStaleTargets?: boolean;
}): DispatchCheckInType {
  if (input.hasStaleTargets) return 'safety_stale';
  if (input.linkedContext?.type === 'waypoint') return 'waypoint';
  if (input.schedule && input.schedule !== 'off') return 'scheduled';
  return 'manual';
}

export function getStaleCheckInTargets(members: DispatchTeamMember[]): DispatchTeamMember[] {
  return members.filter((member) => STALE_CHECK_IN_STATUSES.has(member.status));
}

export function getCheckInSuggestionLabel(members: DispatchTeamMember[]): string | null {
  const staleTargets = getStaleCheckInTargets(members);
  if (staleTargets.length === 0) return null;
  if (staleTargets.length === 1) {
    return `Safety check-in suggested for ${staleTargets[0].callSign}.`;
  }
  return `Safety check-in suggested for ${staleTargets.length} stale members.`;
}

export function applyCheckInResponse(input: {
  ping: DispatchPing;
  memberId: string;
  responseStatus: DispatchCheckInResponseStatus;
  respondedAt: string;
  message?: string;
}): DispatchPing {
  const response: DispatchCheckInResponse = {
    memberId: input.memberId,
    status: input.responseStatus,
    respondedAt: input.respondedAt,
    message: input.message,
  };
  const responses = mergeCheckInResponses(input.ping.checkInResponses ?? [], response);
  const acknowledgedByMemberIds = uniqueStrings([
    ...(input.ping.acknowledgedByMemberIds ?? []),
    input.memberId,
  ]);
  const responseEscalates = shouldEscalateCheckInResponse(input.responseStatus);

  return {
    ...input.ping,
    version: (input.ping.version ?? 1) + 1,
    status: responseEscalates ? 'escalated' : getCheckInPingStatus(input.ping, acknowledgedByMemberIds),
    priority: responseEscalates ? 'critical' : input.ping.priority,
    updatedAt: input.respondedAt,
    acknowledgedByMemberIds,
    checkInResponses: responses,
    escalationState: responseEscalates ? 'emergency_unresolved' : input.ping.escalationState,
    reliabilityState: responseEscalates ? 'offline_risk' : input.ping.reliabilityState,
  };
}

export function getCheckInQueuePatch(input: {
  queueItem: DispatchQueueItem;
  ping: DispatchPing;
  responseStatus: DispatchCheckInResponseStatus;
  respondedAt: string;
}): Partial<DispatchQueueItem> {
  const responseEscalates = shouldEscalateCheckInResponse(input.responseStatus);
  const allTargetsResponded =
    input.ping.targetMemberIds.length > 0 &&
    input.ping.targetMemberIds.every((memberId) =>
      (input.ping.acknowledgedByMemberIds ?? []).includes(memberId),
    );

  return {
    status: responseEscalates ? 'escalated' : allTargetsResponded ? 'resolved' : 'pending_response',
    priority: responseEscalates ? 'critical' : input.queueItem.priority,
    updatedAt: input.respondedAt,
    deliveryState: responseEscalates ? 'escalated' : input.queueItem.deliveryState,
    escalationState: responseEscalates ? 'emergency_unresolved' : allTargetsResponded ? 'recovered' : input.queueItem.escalationState,
    reliabilityState: responseEscalates ? 'offline_risk' : input.queueItem.reliabilityState,
  };
}

export function getTeamMemberStatusForCheckInResponse(
  status: DispatchCheckInResponseStatus,
): DispatchTeamMemberStatus {
  switch (status) {
    case 'ok':
      return 'connected';
    case 'delayed':
      return 'needs_check_in';
    case 'need_assistance':
      return 'needs_check_in';
    case 'at_waypoint':
      return 'at_waypoint';
    case 'returning':
      return 'on_route';
    case 'unavailable':
      return 'unavailable';
    case 'emergency':
      return 'emergency';
    default:
      return 'connected';
  }
}

export function shouldEscalateCheckInResponse(status: DispatchCheckInResponseStatus): boolean {
  return status === 'emergency' || status === 'need_assistance';
}

export function buildCheckInResponseTimelineEvent(input: {
  ping: DispatchPing;
  queueItem?: DispatchQueueItem;
  member: DispatchTeamMember;
  responseStatus: DispatchCheckInResponseStatus;
  occurredAt: string;
  deliveryState: DispatchDeliveryState;
}): Omit<DispatchTimelineEvent, 'id' | 'occurredAt'> {
  const escalates = shouldEscalateCheckInResponse(input.responseStatus);

  return {
    type: escalates ? 'queue_escalated' : 'ping_acknowledged',
    title: escalates ? 'Check-in response escalated' : 'Check-in response received',
    detail: `${input.member.callSign} responded ${formatCheckInResponseForDetail(input.responseStatus)}.`,
    priority: escalates ? 'critical' : input.ping.priority,
    memberIds: [input.member.id],
    actor: input.member.callSign,
    target: 'Dispatch',
    linkedContext: input.ping.linkedContext,
    queueItemId: input.queueItem?.id,
    pingId: input.ping.id,
    deliveryState: input.deliveryState,
    escalationState: escalates ? 'emergency_unresolved' : input.ping.escalationState,
  };
}

export function getCheckInResponseProgress(ping: DispatchPing): {
  acknowledged: number;
  total: number;
  complete: boolean;
} {
  const acknowledged = new Set(ping.acknowledgedByMemberIds ?? []).size;
  const total = ping.targetMemberIds.length;
  return {
    acknowledged,
    total,
    complete: total > 0 && acknowledged >= total,
  };
}

function getCheckInPingStatus(
  ping: DispatchPing,
  acknowledgedByMemberIds: string[],
): DispatchPing['status'] {
  if (ping.targetMemberIds.length > 0 && ping.targetMemberIds.every((id) => acknowledgedByMemberIds.includes(id))) {
    return 'acknowledged';
  }
  return ping.status === 'queued' ? 'queued' : 'delivered';
}

function mergeCheckInResponses(
  current: DispatchCheckInResponse[],
  next: DispatchCheckInResponse,
): DispatchCheckInResponse[] {
  const withoutMember = current.filter((response) => response.memberId !== next.memberId);
  return [...withoutMember, next].sort((a, b) => a.memberId.localeCompare(b.memberId));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function formatCheckInResponseForDetail(status: DispatchCheckInResponseStatus): string {
  switch (status) {
    case 'ok':
      return 'OK';
    case 'delayed':
      return 'delayed';
    case 'need_assistance':
      return 'need assistance';
    case 'at_waypoint':
      return 'at waypoint';
    case 'returning':
      return 'returning';
    case 'unavailable':
      return 'unavailable';
    case 'emergency':
      return 'emergency. ECS team coordination only';
    default:
      return 'check-in received';
  }
}

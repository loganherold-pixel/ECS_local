import type { DispatchRealtimeEnvelope } from './dispatchRealtimeAdapter';
import type {
  DispatchAdapterSource,
} from './dispatchServiceAdapters';
import type {
  DispatchPing,
  DispatchQueueItem,
  DispatchTeamMember,
  DispatchTimelineEvent,
} from './dispatchTypes';
import {
  filterRecipientsByAvailability,
} from './dispatchRoutingAdapter';

export interface DispatchNotificationInput {
  event: DispatchRealtimeEnvelope;
  currentUserId?: string | null;
  teamMembers: DispatchTeamMember[];
  expeditionSource: DispatchAdapterSource;
  showToast: (message: string) => void;
}

const recentNotificationKeys = new Map<string, number>();
const DEDUPE_WINDOW_MS = 5 * 60_000;
const SUPPRESSED_PING_STATUSES = new Set([
  'draft',
  'queued',
  'sending',
  'retrying',
  'recovered',
  'cancelled',
  'failed',
]);
const ACTIVE_RECIPIENT_STATUSES = new Set<DispatchTeamMember['status']>([
  'connected',
  'on_route',
  'at_waypoint',
  'at_camp',
  'needs_check_in',
]);

function shouldSuppressMock(expeditionSource: DispatchAdapterSource): boolean {
  return expeditionSource === 'mock';
}

function shouldNotifyKey(key: string): boolean {
  const now = Date.now();
  const previous = recentNotificationKeys.get(key);
  if (previous && now - previous < DEDUPE_WINDOW_MS) return false;

  recentNotificationKeys.set(key, now);
  for (const [storedKey, timestamp] of recentNotificationKeys) {
    if (now - timestamp > DEDUPE_WINDOW_MS) {
      recentNotificationKeys.delete(storedKey);
    }
  }

  return true;
}

function isTargetedToCurrentUser(memberIds: string[], currentUserId?: string | null): boolean {
  if (memberIds.length === 0) return true;
  if (!currentUserId) return false;
  return memberIds.includes(currentUserId);
}

function isCurrentUserActiveRecipient(
  memberIds: string[],
  currentUserId: string | null | undefined,
  teamMembers: DispatchTeamMember[],
  options: { includeUnavailable?: boolean } = {},
): boolean {
  if (!currentUserId) return false;
  if (!isTargetedToCurrentUser(memberIds, currentUserId)) return false;

  const member = teamMembers.find((candidate) => candidate.id === currentUserId);
  if (!member) return true;
  if (options.includeUnavailable) return true;
  return filterRecipientsByAvailability([member]).length > 0 && ACTIVE_RECIPIENT_STATUSES.has(member.status);
}

function isCurrentUserSender(ping: Pick<DispatchPing, 'createdByMemberId'>, currentUserId?: string | null): boolean {
  return Boolean(currentUserId && ping.createdByMemberId === currentUserId);
}

function isCurrentUserQueueSender(
  queueItem: Pick<DispatchQueueItem, 'createdByMemberId'>,
  currentUserId?: string | null,
): boolean {
  return Boolean(currentUserId && queueItem.createdByMemberId === currentUserId);
}

function isLeadRecipient(currentUserId: string | null | undefined, teamMembers: DispatchTeamMember[]): boolean {
  if (!currentUserId) return false;
  const member = teamMembers.find((candidate) => candidate.id === currentUserId);
  return member?.role === 'owner';
}

function baseRecordKey(record: {
  id: string;
  idempotencyKey?: string;
}): string {
  return record.idempotencyKey ?? record.id;
}

function isReplayOrRetryPing(ping: DispatchPing): boolean {
  return ping.status === 'retrying' || ping.status === 'recovered' || ping.reliabilityState === 'retrying' || ping.reliabilityState === 'recovered';
}

function isReplayOrRetryQueueItem(queueItem: DispatchQueueItem): boolean {
  return (
    queueItem.deliveryState === 'retrying' ||
    queueItem.deliveryState === 'recovered' ||
    queueItem.reliabilityState === 'retrying' ||
    queueItem.reliabilityState === 'recovered'
  );
}

export function getDispatchNotificationPolicy(input: {
  event: DispatchRealtimeEnvelope;
  currentUserId?: string | null;
  teamMembers: DispatchTeamMember[];
  expeditionSource: DispatchAdapterSource;
}): { shouldNotify: boolean; key?: string; message?: string } {
  const { event, currentUserId, teamMembers, expeditionSource } = input;
  if (shouldSuppressMock(expeditionSource)) return { shouldNotify: false };

  switch (event.type) {
    case 'ping_upsert':
      return getPingNotificationPolicy(event.ping, currentUserId, teamMembers);
    case 'queue_item_upsert':
      return getQueueNotificationPolicy(event.queueItem, currentUserId, teamMembers);
    case 'assignment_upsert':
      return getAssignmentNotificationPolicy(event.assignment, currentUserId, teamMembers);
    case 'team_member_upsert':
      return getTeamMemberNotificationPolicy(event.teamMember, currentUserId);
    case 'timeline_event_added':
      return getTimelineNotificationPolicy(event.timelineEvent, currentUserId, teamMembers);
    default:
      return { shouldNotify: false };
  }
}

function getPingNotificationPolicy(
  ping: DispatchPing,
  currentUserId: string | null | undefined,
  teamMembers: DispatchTeamMember[],
): { shouldNotify: boolean; key?: string; message?: string } {
  if (isCurrentUserSender(ping, currentUserId)) return { shouldNotify: false };
  const isCriticalPing = ping.type === 'emergency' || ping.priority === 'critical';
  if (!isCurrentUserActiveRecipient(ping.targetMemberIds, currentUserId, teamMembers, { includeUnavailable: isCriticalPing })) return { shouldNotify: false };
  if (SUPPRESSED_PING_STATUSES.has(ping.status) || isReplayOrRetryPing(ping)) return { shouldNotify: false };

  const baseKey = baseRecordKey(ping);
  if (ping.type === 'emergency' || ping.priority === 'critical') {
    return {
      shouldNotify: true,
      key: `ping-emergency:${baseKey}`,
      message: `Emergency Team Ping: ${ping.message}. ECS team coordination only.`,
    };
  }
  if (ping.type === 'assist') {
    return {
      shouldNotify: true,
      key: `ping-assist:${baseKey}`,
      message: `Assist request: ${ping.message}. ECS team coordination only.`,
    };
  }
  if (ping.type === 'check_in' && ping.status === 'no_response') {
    return {
      shouldNotify: true,
      key: `ping-unresolved-check-in:${baseKey}`,
      message: 'Unresolved check-in in Dispatch.',
    };
  }
  if (ping.type === 'hazard') {
    return {
      shouldNotify: true,
      key: `ping-hazard:${baseKey}`,
      message: `Hazard broadcast: ${ping.message}`,
    };
  }
  if (ping.type === 'resource') {
    return {
      shouldNotify: true,
      key: `ping-resource:${baseKey}`,
      message: `Resource check request: ${ping.message}`,
    };
  }
  if (ping.type === 'route') {
    return {
      shouldNotify: true,
      key: `ping-route:${baseKey}`,
      message: `Route check request: ${ping.message}`,
    };
  }

  return {
    shouldNotify: true,
    key: `ping:${baseKey}`,
    message: `Team Ping: ${ping.message}`,
  };
}

function getQueueNotificationPolicy(
  queueItem: DispatchQueueItem,
  currentUserId: string | null | undefined,
  teamMembers: DispatchTeamMember[],
): { shouldNotify: boolean; key?: string; message?: string } {
  if (isReplayOrRetryQueueItem(queueItem)) return { shouldNotify: false };
  const baseKey = baseRecordKey(queueItem);

  if (queueItem.escalationState !== 'none' && queueItem.status === 'escalated') {
    if (!isLeadRecipient(currentUserId, teamMembers)) return { shouldNotify: false };
    return {
      shouldNotify: true,
      key: `queue-escalation:${baseKey}`,
      message: `Dispatch escalation: ${queueItem.title}. ECS team coordination only.`,
    };
  }

  if (isCurrentUserQueueSender(queueItem, currentUserId)) return { shouldNotify: false };
  if (!isCurrentUserActiveRecipient(queueItem.assignedMemberIds, currentUserId, teamMembers, { includeUnavailable: queueItem.priority === 'critical' })) return { shouldNotify: false };

  if (queueItem.status === 'assigned' || queueItem.assignedMemberIds.length > 0) {
    return {
      shouldNotify: true,
      key: `queue-assigned:${baseKey}:${queueItem.assignedMemberIds.join(',')}`,
      message: `Dispatch assignment: ${queueItem.title}`,
    };
  }

  return { shouldNotify: false };
}

function getAssignmentNotificationPolicy(
  assignment: { id: string; idempotencyKey?: string; assigneeMemberId: string; status: string },
  currentUserId: string | null | undefined,
  teamMembers: DispatchTeamMember[],
): { shouldNotify: boolean; key?: string; message?: string } {
  if (!isCurrentUserActiveRecipient([assignment.assigneeMemberId], currentUserId, teamMembers)) {
    return { shouldNotify: false };
  }
  if (assignment.status !== 'offered' && assignment.status !== 'accepted' && assignment.status !== 'in_progress') {
    return { shouldNotify: false };
  }
  return {
    shouldNotify: true,
    key: `assignment:${baseRecordKey(assignment)}:${assignment.status}`,
    message: 'Dispatch assignment updated.',
  };
}

function getTeamMemberNotificationPolicy(
  teamMember: DispatchTeamMember,
  currentUserId?: string | null,
): { shouldNotify: boolean; key?: string; message?: string } {
  if (teamMember.id === currentUserId) return { shouldNotify: false };
  if (teamMember.status === 'offline' || teamMember.status === 'no_response') {
    return {
      shouldNotify: true,
      key: `member-risk:${teamMember.id}:${teamMember.status}`,
      message: `${teamMember.callSign || teamMember.displayName} is showing Offline Risk.`,
    };
  }
  return { shouldNotify: false };
}

function getTimelineNotificationPolicy(
  timelineEvent: DispatchTimelineEvent,
  currentUserId: string | null | undefined,
  teamMembers: DispatchTeamMember[],
): { shouldNotify: boolean; key?: string; message?: string } {
  if (timelineEvent.pingId || timelineEvent.queueItemId) return { shouldNotify: false };
  if (!isCurrentUserActiveRecipient(timelineEvent.memberIds, currentUserId, teamMembers, { includeUnavailable: timelineEvent.priority === 'critical' })) return { shouldNotify: false };
  if (timelineEvent.deliveryState === 'retrying' || timelineEvent.deliveryState === 'recovered') return { shouldNotify: false };

  const baseKey = baseRecordKey(timelineEvent);
  if (timelineEvent.type === 'assist_request_created') {
    return {
      shouldNotify: true,
      key: `timeline-assist:${baseKey}`,
      message: `${timelineEvent.title}. ECS team coordination only.`,
    };
  }
  if (timelineEvent.type === 'queue_escalated') {
    if (!isLeadRecipient(currentUserId, teamMembers)) return { shouldNotify: false };
    return {
      shouldNotify: true,
      key: `timeline-escalation:${baseKey}`,
      message: `${timelineEvent.title}. ECS team coordination only.`,
    };
  }
  if (timelineEvent.type === 'assignment_created') {
    return {
      shouldNotify: true,
      key: `timeline-assignment:${baseKey}`,
      message: `Dispatch assignment for ${memberLabel(timelineEvent.memberIds, teamMembers)}.`,
    };
  }
  return { shouldNotify: false };
}

function memberLabel(memberIds: string[], teamMembers: DispatchTeamMember[]): string {
  if (memberIds.length === 0) return 'Team';
  if (memberIds.length === 1) {
    const member = teamMembers.find((candidate) => candidate.id === memberIds[0]);
    return member?.callSign ?? member?.displayName ?? '1 member';
  }
  return `${memberIds.length} members`;
}

function toastOnce(key: string, message: string, showToast: (message: string) => void): void {
  if (!shouldNotifyKey(key)) return;
  showToast(message);
}

export function notifyDispatchEvent({
  event,
  currentUserId,
  teamMembers,
  expeditionSource,
  showToast,
}: DispatchNotificationInput): void {
  const policy = getDispatchNotificationPolicy({
    event,
    currentUserId,
    teamMembers,
    expeditionSource,
  });
  if (!policy.shouldNotify || !policy.key || !policy.message) return;
  toastOnce(policy.key, policy.message, showToast);
}

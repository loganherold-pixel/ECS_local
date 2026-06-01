import type { ConnectivityStatus } from './connectivity';
import type {
  DispatchDeliveryState,
  DispatchPing,
  DispatchPingDeliveryStatus,
  DispatchQueueItem,
  DispatchReliabilityState,
  DispatchTeamMember,
  DispatchTimelineEvent,
} from './dispatchTypes';
import type { SyncStatus } from './types';

export interface DispatchSyncAdapterInput {
  isOnline: boolean;
  offlineMode: boolean;
  syncStatus: SyncStatus;
  connectivityStatus: ConnectivityStatus;
  queueSize: number;
  dirtyCount: number;
}

export interface DispatchSyncSnapshot {
  state: DispatchReliabilityState;
  label: string;
  detail: string;
  isDeliverable: boolean;
  queuedCount: number;
  dirtyCount: number;
}

export type DispatchRetryableEntityType = 'ping' | 'queue_item' | 'timeline_event';

export interface DispatchDeliveryMutationInput {
  now?: string;
  isDeliverable?: boolean;
}

const STALE_MEMBER_STATUSES = new Set<DispatchTeamMember['status']>([
  'offline',
  'needs_check_in',
  'no_response',
  'unavailable',
]);

export function resolveDispatchSyncSnapshot(input: DispatchSyncAdapterInput): DispatchSyncSnapshot {
  if (input.syncStatus === 'error') {
    return {
      state: 'failed',
      label: 'Failed',
      detail: 'Sync error. Dispatch pings remain local until recovery.',
      isDeliverable: false,
      queuedCount: input.queueSize,
      dirtyCount: input.dirtyCount,
    };
  }

  if (input.offlineMode || !input.isOnline || input.connectivityStatus === 'offline') {
    return {
      state: 'queued',
      label: 'Queued',
      detail: 'Offline mode. Dispatch delivery is staged locally.',
      isDeliverable: false,
      queuedCount: input.queueSize,
      dirtyCount: input.dirtyCount,
    };
  }

  if (input.connectivityStatus === 'reconnecting' || input.syncStatus === 'syncing') {
    return {
      state: 'stale',
      label: 'Stale',
      detail: 'Sync is reconnecting. Dispatch state may lag.',
      isDeliverable: false,
      queuedCount: input.queueSize,
      dirtyCount: input.dirtyCount,
    };
  }

  if (input.syncStatus === 'synced') {
    return {
      state: input.queueSize > 0 || input.dirtyCount > 0 ? 'recovered' : 'live',
      label: input.queueSize > 0 || input.dirtyCount > 0 ? 'Recovered' : 'Live',
      detail:
        input.queueSize > 0 || input.dirtyCount > 0
          ? 'Connectivity recovered. Queued Dispatch work is ready to reconcile.'
          : 'Dispatch delivery path is live.',
      isDeliverable: true,
      queuedCount: input.queueSize,
      dirtyCount: input.dirtyCount,
    };
  }

  // TODO(dispatch-sync): Replace this conservative fallback with a direct dispatch
  // delivery channel once the global sync coordinator exposes per-feature health.
  return {
    state: 'unknown',
    label: 'Unknown',
    detail: 'Sync state is not confirmed. New Dispatch pings will queue locally.',
    isDeliverable: false,
    queuedCount: input.queueSize,
    dirtyCount: input.dirtyCount,
  };
}

export function getInitialDispatchPingStatus(snapshot: DispatchSyncSnapshot): DispatchPingDeliveryStatus {
  return snapshot.state === 'live' || snapshot.state === 'recovered' ? 'sent' : 'queued';
}

export function isRetryableDispatchPing(ping: DispatchPing): boolean {
  return ping.status === 'failed' || ping.reliabilityState === 'failed';
}

export function isCancellableQueuedDispatchPing(ping: DispatchPing): boolean {
  return ping.status === 'queued' || ping.status === 'retrying' || ping.reliabilityState === 'queued';
}

export function isRetryableDispatchQueueItem(item: DispatchQueueItem): boolean {
  return item.deliveryState === 'failed' || item.reliabilityState === 'failed';
}

export function isCancellableQueuedDispatchQueueItem(item: DispatchQueueItem): boolean {
  return item.deliveryState === 'queued' || item.deliveryState === 'retrying' || item.reliabilityState === 'queued';
}

export function isRetryableDispatchTimelineEvent(event: DispatchTimelineEvent): boolean {
  return event.deliveryState === 'failed';
}

export function isCancellableQueuedDispatchTimelineEvent(event: DispatchTimelineEvent): boolean {
  return event.deliveryState === 'queued' || event.deliveryState === 'retrying';
}

export function prepareDispatchPingRetry(
  ping: DispatchPing,
  input: DispatchDeliveryMutationInput = {},
): DispatchPing {
  const now = input.now ?? new Date().toISOString();
  return {
    ...ping,
    status: input.isDeliverable ? 'retrying' : 'queued',
    reliabilityState: input.isDeliverable ? 'retrying' : 'queued',
    updatedAt: now,
    version: (ping.version ?? 1) + 1,
  };
}

export function prepareDispatchQueueItemRetry(
  item: DispatchQueueItem,
  input: DispatchDeliveryMutationInput = {},
): DispatchQueueItem {
  const now = input.now ?? new Date().toISOString();
  return {
    ...item,
    deliveryState: input.isDeliverable ? 'retrying' : 'queued',
    reliabilityState: input.isDeliverable ? 'retrying' : 'queued',
    updatedAt: now,
    version: (item.version ?? 1) + 1,
  };
}

export function prepareDispatchTimelineEventRetry(
  event: DispatchTimelineEvent,
  input: DispatchDeliveryMutationInput = {},
): DispatchTimelineEvent {
  return {
    ...event,
    deliveryState: input.isDeliverable ? 'retrying' : 'queued',
    version: (event.version ?? 1) + 1,
  };
}

export function markDispatchPingDeliveryResult(
  ping: DispatchPing,
  ok: boolean,
  now = new Date().toISOString(),
): DispatchPing {
  return {
    ...ping,
    status: ok ? 'sent' : 'failed',
    reliabilityState: ok ? 'recovered' : 'failed',
    updatedAt: now,
    version: (ping.version ?? 1) + 1,
  };
}

export function markDispatchQueueItemDeliveryResult(
  item: DispatchQueueItem,
  ok: boolean,
  now = new Date().toISOString(),
): DispatchQueueItem {
  return {
    ...item,
    deliveryState: ok ? 'recovered' : 'failed',
    reliabilityState: ok ? 'recovered' : 'failed',
    updatedAt: now,
    version: (item.version ?? 1) + 1,
  };
}

export function markDispatchTimelineEventDeliveryResult(
  event: DispatchTimelineEvent,
  ok: boolean,
): DispatchTimelineEvent {
  return {
    ...event,
    deliveryState: ok ? 'recovered' : 'failed',
    version: (event.version ?? 1) + 1,
  };
}

export function cancelQueuedDispatchPing(
  ping: DispatchPing,
  now = new Date().toISOString(),
): DispatchPing {
  return {
    ...ping,
    status: 'cancelled',
    reliabilityState: 'cancelled',
    updatedAt: now,
    version: (ping.version ?? 1) + 1,
  };
}

export function cancelQueuedDispatchQueueItem(
  item: DispatchQueueItem,
  now = new Date().toISOString(),
): DispatchQueueItem {
  return {
    ...item,
    status: item.status === 'cancelled' ? item.status : 'cancelled',
    deliveryState: 'cancelled',
    reliabilityState: 'cancelled',
    updatedAt: now,
    version: (item.version ?? 1) + 1,
  };
}

export function cancelQueuedDispatchTimelineEvent(event: DispatchTimelineEvent): DispatchTimelineEvent {
  return {
    ...event,
    deliveryState: 'cancelled',
    version: (event.version ?? 1) + 1,
  };
}

export function resolveMemberDispatchReliability(
  member: DispatchTeamMember,
  snapshot: DispatchSyncSnapshot,
): DispatchReliabilityState {
  if (member.status === 'emergency') return 'failed';
  if (member.status === 'offline' || member.status === 'no_response') return 'offline_risk';
  if (STALE_MEMBER_STATUSES.has(member.status)) return 'stale';
  if (member.syncState === 'queued' && snapshot.isDeliverable) return 'recovered';
  if (member.syncState === 'queued') return 'queued';
  return snapshot.state === 'live' ? 'live' : snapshot.state;
}

export function resolvePingDispatchReliability(
  ping: DispatchPing,
  snapshot: DispatchSyncSnapshot,
  members: DispatchTeamMember[],
): DispatchReliabilityState {
  if (ping.reliabilityState === 'retrying' || ping.status === 'retrying') return 'retrying';
  if (ping.reliabilityState === 'sending' || ping.status === 'sending') return 'sending';
  if (ping.reliabilityState === 'cancelled' || ping.status === 'cancelled') return 'cancelled';
  if (ping.reliabilityState === 'failed' || ping.status === 'failed') return 'failed';
  if (ping.reliabilityState === 'queued' && snapshot.isDeliverable) return 'recovered';
  if (ping.reliabilityState && ping.reliabilityState !== 'queued') return ping.reliabilityState;
  if (ping.status === 'queued' && snapshot.isDeliverable) return 'recovered';
  if (ping.status === 'queued') return 'queued';
  if (ping.status === 'no_response') return 'offline_risk';
  if (ping.status === 'escalated') return 'failed';

  const hasRiskTarget = ping.targetMemberIds.some((memberId) => {
    const member = members.find((candidate) => candidate.id === memberId);
    return member ? resolveMemberDispatchReliability(member, snapshot) === 'offline_risk' : false;
  });

  if (hasRiskTarget) return 'offline_risk';
  return snapshot.state === 'queued' || snapshot.state === 'unknown' ? snapshot.state : 'live';
}

export function resolveQueueDispatchReliability(
  item: DispatchQueueItem,
  ping: DispatchPing | undefined,
  snapshot: DispatchSyncSnapshot,
  members: DispatchTeamMember[],
): DispatchReliabilityState {
  if (item.reliabilityState === 'retrying' || item.deliveryState === 'retrying') return 'retrying';
  if (item.reliabilityState === 'sending' || item.deliveryState === 'sending') return 'sending';
  if (item.reliabilityState === 'cancelled' || item.deliveryState === 'cancelled') return 'cancelled';
  if (item.reliabilityState === 'failed' || item.deliveryState === 'failed') return 'failed';
  if (item.reliabilityState === 'queued' && snapshot.isDeliverable) return 'recovered';
  if (item.reliabilityState && item.reliabilityState !== 'queued') return item.reliabilityState;
  if (item.deliveryState === 'queued' && snapshot.isDeliverable) return 'recovered';
  if (item.deliveryState === 'queued') return 'queued';
  if (item.deliveryState === 'no_response') return 'offline_risk';
  if (item.status === 'resolved' && snapshot.isDeliverable) return 'recovered';
  if (ping) return resolvePingDispatchReliability(ping, snapshot, members);

  const hasRiskAssignee = item.assignedMemberIds.some((memberId) => {
    const member = members.find((candidate) => candidate.id === memberId);
    return member ? resolveMemberDispatchReliability(member, snapshot) === 'offline_risk' : false;
  });

  if (hasRiskAssignee) return 'offline_risk';
  return snapshot.state;
}

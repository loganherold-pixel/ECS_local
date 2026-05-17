import {
  dispatchPersistenceAdapter,
  type DispatchPersistenceDefaults,
  type DispatchPersistenceSnapshot,
} from './dispatchPersistenceAdapter';
import type { DispatchRealtimeEventDraft } from './dispatchRealtimeAdapter';
import type {
  DispatchAssignment,
  DispatchPing,
  DispatchQueueItem,
  DispatchTimelineEvent,
} from './dispatchTypes';
import {
  markDispatchPingDeliveryResult,
  markDispatchQueueItemDeliveryResult,
  markDispatchTimelineEventDeliveryResult,
} from './dispatchSyncAdapter';
import type { DispatchEvent } from './dispatchLiveEvents';

export interface DispatchReplayResult {
  snapshot: DispatchPersistenceSnapshot;
  attempted: number;
  replayed: number;
  failed: number;
}

export interface DispatchReplayInput {
  expeditionId: string;
  defaults: DispatchPersistenceDefaults;
  publish: (event: DispatchRealtimeEventDraft) => Promise<boolean>;
  persistCadEvent?: (event: DispatchEvent) => Promise<boolean>;
}

function isLocalDispatchRecord(id: string): boolean {
  return id.startsWith('local-');
}

function shouldReplayPing(ping: DispatchPing): boolean {
  if (!isLocalDispatchRecord(ping.id)) return false;
  return (
    ping.status === 'queued' ||
    ping.status === 'retrying' ||
    ping.reliabilityState === 'queued' ||
    ping.reliabilityState === 'failed' ||
    ping.reliabilityState === 'retrying'
  );
}

function shouldReplayQueueItem(item: DispatchQueueItem): boolean {
  if (!isLocalDispatchRecord(item.id)) return false;
  return (
    item.deliveryState === 'queued' ||
    item.deliveryState === 'retrying' ||
    item.reliabilityState === 'queued' ||
    item.reliabilityState === 'failed' ||
    item.reliabilityState === 'retrying'
  );
}

function shouldReplayAssignment(assignment: DispatchAssignment, replayedQueueItemIds: Set<string>): boolean {
  return isLocalDispatchRecord(assignment.id) && replayedQueueItemIds.has(assignment.queueItemId);
}

function shouldReplayTimelineEvent(event: DispatchTimelineEvent): boolean {
  if (!isLocalDispatchRecord(event.id)) return false;
  return event.deliveryState === 'queued' || event.deliveryState === 'failed' || event.deliveryState === 'retrying';
}

function shouldReplayCadEvent(event: DispatchEvent): boolean {
  return event.syncState === 'queued' || event.syncState === 'failed' || event.syncState === 'sending';
}

async function publishPing(ping: DispatchPing, publish: DispatchReplayInput['publish']): Promise<boolean> {
  return publish({ type: 'ping_upsert', ping });
}

async function publishQueueItem(
  queueItem: DispatchQueueItem,
  publish: DispatchReplayInput['publish'],
): Promise<boolean> {
  return publish({ type: 'queue_item_upsert', queueItem });
}

async function publishAssignment(
  assignment: DispatchAssignment,
  publish: DispatchReplayInput['publish'],
): Promise<boolean> {
  return publish({ type: 'assignment_upsert', assignment });
}

async function publishTimelineEvent(
  timelineEvent: DispatchTimelineEvent,
  publish: DispatchReplayInput['publish'],
): Promise<boolean> {
  return publish({ type: 'timeline_event_added', timelineEvent });
}

async function publishCadEvent(
  cadEvent: DispatchEvent,
  publish: DispatchReplayInput['publish'],
  persistCadEvent?: DispatchReplayInput['persistCadEvent'],
): Promise<boolean> {
  const durable = persistCadEvent ? await persistCadEvent(cadEvent) : true;
  const realtime = await publish({
    type: 'cad_event_upsert',
    cadEvent: {
      ...cadEvent,
      syncState: 'received',
    },
  });
  return durable && realtime;
}

export async function replayQueuedDispatchActions({
  expeditionId,
  defaults,
  publish,
  persistCadEvent,
}: DispatchReplayInput): Promise<DispatchReplayResult> {
  const snapshot = dispatchPersistenceAdapter.load(expeditionId, defaults);
  let attempted = 0;
  let replayed = 0;
  let failed = 0;

  const nextPings: DispatchPing[] = [];
  for (const ping of snapshot.pings) {
    if (!shouldReplayPing(ping)) {
      nextPings.push(ping);
      continue;
    }

    attempted += 1;
    const retryingPing: DispatchPing = {
      ...ping,
      status: 'retrying',
      reliabilityState: 'retrying',
    };
    const ok = await publishPing(retryingPing, publish);
    if (ok) {
      replayed += 1;
      nextPings.push(markDispatchPingDeliveryResult(retryingPing, true));
    } else {
      failed += 1;
      nextPings.push(markDispatchPingDeliveryResult(retryingPing, false));
    }
  }

  const nextQueueItems: DispatchQueueItem[] = [];
  const replayedQueueItemIds = new Set<string>();
  for (const item of snapshot.queueItems) {
    if (!shouldReplayQueueItem(item)) {
      nextQueueItems.push(item);
      continue;
    }

    attempted += 1;
    const retryingItem: DispatchQueueItem = {
      ...item,
      deliveryState: 'retrying',
      reliabilityState: 'retrying',
    };
    const ok = await publishQueueItem(retryingItem, publish);
    if (ok) {
      replayed += 1;
      replayedQueueItemIds.add(item.id);
      nextQueueItems.push(markDispatchQueueItemDeliveryResult(retryingItem, true));
    } else {
      failed += 1;
      nextQueueItems.push(markDispatchQueueItemDeliveryResult(retryingItem, false));
    }
  }

  const nextAssignments: DispatchAssignment[] = [];
  for (const assignment of snapshot.assignments) {
    if (!shouldReplayAssignment(assignment, replayedQueueItemIds)) {
      nextAssignments.push(assignment);
      continue;
    }

    attempted += 1;
    const ok = await publishAssignment(assignment, publish);
    if (ok) {
      replayed += 1;
    } else {
      failed += 1;
    }
    nextAssignments.push(assignment);
  }

  const nextTimelineEvents: DispatchTimelineEvent[] = [];
  for (const event of snapshot.timelineEvents) {
    if (!shouldReplayTimelineEvent(event)) {
      nextTimelineEvents.push(event);
      continue;
    }

    attempted += 1;
    const relatedQueueItem = event.queueItemId
      ? nextQueueItems.find((item) => item.id === event.queueItemId)
      : undefined;
    const retryingEvent: DispatchTimelineEvent = {
      ...event,
      deliveryState: 'retrying',
      conflictState:
        relatedQueueItem?.status === 'resolved' && event.type !== 'queue_resolved'
          ? 'updated_during_sync'
          : event.conflictState,
      conflictReason:
        relatedQueueItem?.status === 'resolved' && event.type !== 'queue_resolved'
          ? 'Timeline event replayed after the related queue item was already resolved.'
          : event.conflictReason,
      lastConflictAt:
        relatedQueueItem?.status === 'resolved' && event.type !== 'queue_resolved'
          ? new Date().toISOString()
          : event.lastConflictAt,
    };
    const ok = await publishTimelineEvent(retryingEvent, publish);
    if (ok) {
      replayed += 1;
      nextTimelineEvents.push(markDispatchTimelineEventDeliveryResult(retryingEvent, true));
    } else {
      failed += 1;
      nextTimelineEvents.push(markDispatchTimelineEventDeliveryResult(retryingEvent, false));
    }
  }

  const nextCadEvents: DispatchEvent[] = [];
  for (const event of snapshot.cadEvents) {
    if (!shouldReplayCadEvent(event)) {
      nextCadEvents.push(event);
      continue;
    }

    attempted += 1;
    const retryingEvent: DispatchEvent = {
      ...event,
      syncState: 'sending',
    };
    const ok = await publishCadEvent(retryingEvent, publish, persistCadEvent);
    if (ok) {
      replayed += 1;
      nextCadEvents.push({
        ...retryingEvent,
        syncState: 'sent',
      });
    } else {
      failed += 1;
      nextCadEvents.push({
        ...retryingEvent,
        syncState: 'failed',
      });
    }
  }

  const nextSnapshot = dispatchPersistenceAdapter.save({
    ...snapshot,
    pings: nextPings,
    queueItems: nextQueueItems,
    assignments: nextAssignments,
    timelineEvents: nextTimelineEvents,
    cadEvents: nextCadEvents,
  });

  return {
    snapshot: nextSnapshot,
    attempted,
    replayed,
    failed,
  };
}

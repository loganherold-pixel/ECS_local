import type {
  DispatchPing,
  DispatchQueueItem,
  DispatchTimelineEvent,
} from './dispatchTypes';

const ACTIVE_PING_STATUSES = new Set<DispatchPing['status']>([
  'queued',
  'sent',
  'delivered',
  'seen',
  'no_response',
  'escalated',
  'retrying',
]);

export function createDispatchRecordMap<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  items.forEach((item) => {
    map.set(item.id, item);
  });
  return map;
}

export function groupDispatchQueueByAssignee(
  items: readonly DispatchQueueItem[],
): Map<string, DispatchQueueItem[]> {
  const grouped = new Map<string, DispatchQueueItem[]>();

  items.forEach((item) => {
    item.assignedMemberIds.forEach((memberId) => {
      const existing = grouped.get(memberId);
      if (existing) {
        existing.push(item);
      } else {
        grouped.set(memberId, [item]);
      }
    });
  });

  return grouped;
}

export function countActivePingsByMember(pings: readonly DispatchPing[]): Map<string, number> {
  const counts = new Map<string, number>();

  pings.forEach((ping) => {
    if (!ACTIVE_PING_STATUSES.has(ping.status)) return;

    ping.targetMemberIds.forEach((memberId) => {
      counts.set(memberId, (counts.get(memberId) ?? 0) + 1);
    });
  });

  return counts;
}

export function getRecentDispatchTimelineEvents(
  events: readonly DispatchTimelineEvent[],
  limit = 8,
): DispatchTimelineEvent[] {
  if (limit <= 0 || events.length === 0) return [];

  const recent: DispatchTimelineEvent[] = [];

  events.forEach((event) => {
    const eventTime = Date.parse(event.occurredAt);
    let insertAt = recent.length;

    for (let index = 0; index < recent.length; index += 1) {
      if (eventTime > Date.parse(recent[index].occurredAt)) {
        insertAt = index;
        break;
      }
    }

    if (insertAt < limit) {
      recent.splice(insertAt, 0, event);
      if (recent.length > limit) recent.pop();
    }
  });

  return recent;
}

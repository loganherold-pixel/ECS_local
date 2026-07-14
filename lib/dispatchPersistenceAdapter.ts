import { createPersistedKeyValueCache } from './keyValuePersistence';
import {
  createDispatchOfflineAction,
  mergeDispatchAcknowledgment,
  mergeDispatchAcknowledgmentBatch,
  mergeDispatchAssignment,
  mergeDispatchAssignmentBatch,
  mergeDispatchAssistRequest,
  mergeDispatchAssistRequestBatch,
  mergeDispatchOfflineAction,
  mergeDispatchOfflineActionBatch,
  mergeDispatchPing,
  mergeDispatchPingBatch,
  mergeDispatchQueueItem,
  mergeDispatchQueueItemBatch,
  mergeDispatchTimelineEvent,
  mergeDispatchTimelineEventBatch,
} from './dispatchIntegrity';
import { deriveDispatchPingOperationalState } from './dispatchLifecycle';
import {
  normalizeDispatchEvent,
  sortDispatchEvents,
  type DispatchEvent,
} from './dispatchLiveEvents';
import type {
  DispatchAcknowledgment,
  DispatchAssignment,
  DispatchAssistRequest,
  DispatchPing,
  DispatchQueueItem,
  DispatchQueuedOfflineAction,
  DispatchTimelineEvent,
} from './dispatchTypes';

const STORAGE_FILE = 'ecs_dispatch_persistence';
const STORAGE_VERSION = 2;
const DISPATCH_CAD_EVENT_PERSISTENCE_LIMIT = 300;
const persistence = createPersistedKeyValueCache(STORAGE_FILE);

// This remains the authoritative local store. The guarded canonical backend
// coordinator mirrors its durable outbox only when the default-off rollout is
// explicitly placed in shadow or dual-read mode.

export interface DispatchPersistenceSnapshot {
  version: number;
  expeditionId: string;
  pings: DispatchPing[];
  queueItems: DispatchQueueItem[];
  assignments: DispatchAssignment[];
  assistRequests: DispatchAssistRequest[];
  acknowledgments: DispatchAcknowledgment[];
  timelineEvents: DispatchTimelineEvent[];
  offlineActions: DispatchQueuedOfflineAction[];
  cadEvents: DispatchEvent[];
  updatedAt: string;
}

export interface DispatchPersistenceDefaults {
  pings: DispatchPing[];
  queueItems: DispatchQueueItem[];
  assignments: DispatchAssignment[];
  assistRequests?: DispatchAssistRequest[];
  acknowledgments?: DispatchAcknowledgment[];
  timelineEvents: DispatchTimelineEvent[];
  offlineActions?: DispatchQueuedOfflineAction[];
  cadEvents?: DispatchEvent[];
}

function getStorageKey(expeditionId: string): string {
  return `dispatch_state_${expeditionId}`;
}

function createSnapshot(
  expeditionId: string,
  defaults: DispatchPersistenceDefaults,
): DispatchPersistenceSnapshot {
  return {
    version: STORAGE_VERSION,
    expeditionId,
    pings: [...defaults.pings],
    queueItems: [...defaults.queueItems],
    assignments: [...defaults.assignments],
    assistRequests: [...(defaults.assistRequests ?? [])],
    acknowledgments: [...(defaults.acknowledgments ?? [])],
    timelineEvents: [...defaults.timelineEvents],
    offlineActions: [...(defaults.offlineActions ?? [])],
    cadEvents: [...(defaults.cadEvents ?? [])],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSnapshot(
  expeditionId: string,
  raw: unknown,
  defaults: DispatchPersistenceDefaults,
): DispatchPersistenceSnapshot {
  if (!raw || typeof raw !== 'object') {
    return createSnapshot(expeditionId, defaults);
  }

  const candidate = raw as Partial<DispatchPersistenceSnapshot>;
  return dedupeSnapshot({
    version: STORAGE_VERSION,
    expeditionId,
    pings: Array.isArray(candidate.pings) ? candidate.pings : [...defaults.pings],
    queueItems: Array.isArray(candidate.queueItems) ? candidate.queueItems : [...defaults.queueItems],
    assignments: Array.isArray(candidate.assignments) ? candidate.assignments : [...defaults.assignments],
    assistRequests: Array.isArray(candidate.assistRequests)
      ? candidate.assistRequests
      : [...(defaults.assistRequests ?? [])],
    acknowledgments: Array.isArray(candidate.acknowledgments)
      ? candidate.acknowledgments
      : [...(defaults.acknowledgments ?? [])],
    timelineEvents: Array.isArray(candidate.timelineEvents)
      ? candidate.timelineEvents
      : [...defaults.timelineEvents],
    offlineActions: Array.isArray(candidate.offlineActions)
      ? candidate.offlineActions.map(normalizeOfflineAction)
      : [...(defaults.offlineActions ?? [])],
    cadEvents: Array.isArray(candidate.cadEvents)
      ? candidate.cadEvents
      : [...(defaults.cadEvents ?? [])],
    updatedAt: typeof candidate.updatedAt === 'string'
      ? candidate.updatedAt
      : new Date().toISOString(),
  });
}

function loadSnapshot(
  expeditionId: string,
  defaults: DispatchPersistenceDefaults,
): DispatchPersistenceSnapshot {
  try {
    const raw = persistence.get(getStorageKey(expeditionId));
    if (!raw) return createSnapshot(expeditionId, defaults);
    return normalizeSnapshot(expeditionId, JSON.parse(raw), defaults);
  } catch {
    return createSnapshot(expeditionId, defaults);
  }
}

function saveSnapshot(snapshot: DispatchPersistenceSnapshot): DispatchPersistenceSnapshot {
  const next: DispatchPersistenceSnapshot = dedupeSnapshot({
    ...snapshot,
    version: STORAGE_VERSION,
    updatedAt: new Date().toISOString(),
  });
  persistence.set(getStorageKey(next.expeditionId), JSON.stringify(next));
  return next;
}

function updateSnapshot(
  expeditionId: string,
  defaults: DispatchPersistenceDefaults,
  updater: (snapshot: DispatchPersistenceSnapshot) => DispatchPersistenceSnapshot,
): DispatchPersistenceSnapshot {
  return saveSnapshot(updater(loadSnapshot(expeditionId, defaults)));
}

function dedupeSnapshot(snapshot: DispatchPersistenceSnapshot): DispatchPersistenceSnapshot {
  const normalized = {
    ...snapshot,
    pings: mergeDispatchPingBatch(snapshot.pings.map(normalizePersistedPing)),
    queueItems: mergeDispatchQueueItemBatch(snapshot.queueItems),
    assignments: mergeDispatchAssignmentBatch(snapshot.assignments),
    assistRequests: mergeDispatchAssistRequestBatch(snapshot.assistRequests),
    acknowledgments: mergeDispatchAcknowledgmentBatch(snapshot.acknowledgments),
    timelineEvents: mergeDispatchTimelineEventBatch(snapshot.timelineEvents),
    cadEvents: mergeDispatchCadEvents(snapshot.cadEvents),
  };
  const mergedOfflineActions = mergeDispatchOfflineActionBatch([
    ...snapshot.offlineActions.map(normalizeOfflineAction),
    ...deriveOfflineActions(normalized),
  ]);
  return {
    ...normalized,
    offlineActions: reconcileOfflineActions(normalized, mergedOfflineActions),
  };
}

function normalizePersistedPing(ping: DispatchPing): DispatchPing {
  return {
    ...ping,
    operationalState: ping.operationalState ?? deriveDispatchPingOperationalState({
      deliveryState: ping.status,
      requiresAcknowledgment: ping.requiresAcknowledgment,
      acknowledgedCount: ping.acknowledgedByMemberIds?.length ?? 0,
      targetCount: ping.targetMemberIds.length,
    }),
  };
}

function normalizeOfflineAction(action: DispatchQueuedOfflineAction): DispatchQueuedOfflineAction {
  return {
    ...action,
    version: action.version ?? 1,
    status: action.status === 'replaying' ? 'queued' : action.status,
    updatedAt: action.updatedAt ?? action.createdAt,
    attemptCount: Math.max(0, action.attemptCount ?? 0),
    maxAttempts: Math.max(1, Math.min(10, action.maxAttempts ?? 5)),
  };
}

function deriveOfflineActions(snapshot: Omit<DispatchPersistenceSnapshot, 'offlineActions'>): DispatchQueuedOfflineAction[] {
  const actions: DispatchQueuedOfflineAction[] = [];
  const add = (
    entityType: DispatchQueuedOfflineAction['entityType'],
    entity: { id: string; idempotencyKey?: string; createdAt?: string; updatedAt?: string; occurredAt?: string; assignedAt?: string; acknowledgedAt?: string },
  ) => {
    actions.push(createDispatchOfflineAction({
      expeditionId: snapshot.expeditionId,
      entityType,
      sourceEntityId: entity.id,
      sourceIdempotencyKey: entity.idempotencyKey,
      createdAt: entity.createdAt ?? entity.occurredAt ?? entity.assignedAt ?? entity.acknowledgedAt ?? entity.updatedAt,
    }));
  };
  const replayable = (state: string | null | undefined) => (
    state === 'queued' || state === 'failed' || state === 'retrying'
  );

  snapshot.pings.filter((item) => replayable(item.status) || replayable(item.reliabilityState)).forEach((item) => add('ping', item));
  snapshot.queueItems.filter((item) => replayable(item.deliveryState) || replayable(item.reliabilityState)).forEach((item) => add('queue_item', item));
  snapshot.assignments.filter((item) => replayable(item.deliveryState)).forEach((item) => add('assignment', item));
  snapshot.assistRequests.filter((item) => replayable(item.deliveryState)).forEach((item) => add('assist_request', item));
  snapshot.acknowledgments.filter((item) => replayable(item.deliveryState)).forEach((item) => add('acknowledgment', item));
  snapshot.timelineEvents.filter((item) => replayable(item.deliveryState)).forEach((item) => add('timeline_event', item));
  return actions;
}

function reconcileOfflineActions(
  snapshot: Omit<DispatchPersistenceSnapshot, 'offlineActions'>,
  actions: DispatchQueuedOfflineAction[],
): DispatchQueuedOfflineAction[] {
  return actions.map((action) => {
    if (action.status === 'replayed' || action.status === 'cancelled') return action;
    const source = getOfflineActionSource(snapshot, action);
    if (!source) return action;
    if (
      source.deliveryState === 'cancelled' ||
      source.deliveryState === 'local' ||
      source.deliveryState === 'draft'
    ) {
      return {
        ...action,
        status: 'cancelled',
        version: (action.version ?? 1) + 1,
        updatedAt: source.updatedAt,
        nextAttemptAt: undefined,
      };
    }
    if (!isReplayableDeliveryState(source.deliveryState)) {
      return {
        ...action,
        status: 'replayed',
        version: (action.version ?? 1) + 1,
        updatedAt: source.updatedAt,
        replayedAt: source.updatedAt,
        nextAttemptAt: undefined,
        lastError: undefined,
      };
    }
    return action;
  });
}

function getOfflineActionSource(
  snapshot: Omit<DispatchPersistenceSnapshot, 'offlineActions'>,
  action: DispatchQueuedOfflineAction,
): { deliveryState: string; updatedAt: string } | null {
  const find = <T extends { id: string }>(items: T[]) => items.find((item) => item.id === action.sourceEntityId);
  switch (action.entityType) {
    case 'ping': {
      const source = find(snapshot.pings);
      return source ? { deliveryState: source.status, updatedAt: source.updatedAt ?? source.createdAt } : null;
    }
    case 'queue_item': {
      const source = find(snapshot.queueItems);
      return source ? { deliveryState: source.deliveryState, updatedAt: source.updatedAt } : null;
    }
    case 'assignment': {
      const source = find(snapshot.assignments);
      return source ? { deliveryState: source.deliveryState ?? 'local', updatedAt: source.updatedAt ?? source.assignedAt } : null;
    }
    case 'assist_request': {
      const source = find(snapshot.assistRequests);
      return source ? { deliveryState: source.deliveryState ?? 'local', updatedAt: source.updatedAt ?? source.createdAt } : null;
    }
    case 'acknowledgment': {
      const source = find(snapshot.acknowledgments);
      return source ? { deliveryState: source.deliveryState ?? 'local', updatedAt: source.updatedAt ?? source.acknowledgedAt } : null;
    }
    case 'timeline_event': {
      const source = find(snapshot.timelineEvents);
      return source ? { deliveryState: source.deliveryState ?? 'local', updatedAt: source.occurredAt } : null;
    }
    default:
      return null;
  }
}

function isReplayableDeliveryState(state: string): boolean {
  return state === 'queued' || state === 'sending' || state === 'failed' || state === 'retrying';
}

function mergeDispatchCadEvents(events: unknown[]): DispatchEvent[] {
  const byId = new Map<string, DispatchEvent>();
  const byDedupeKey = new Map<string, string>();

  for (const rawEvent of events) {
    const event = normalizeDispatchEvent(rawEvent);
    if (!event) continue;

    const existingIdForDedupe = event.dedupeKey ? byDedupeKey.get(event.dedupeKey) : undefined;
    if (existingIdForDedupe && existingIdForDedupe !== event.id) {
      byId.delete(existingIdForDedupe);
    }

    byId.set(event.id, event);
    if (event.dedupeKey) {
      byDedupeKey.set(event.dedupeKey, event.id);
    }
  }

  return sortDispatchEvents([...byId.values()]).slice(0, DISPATCH_CAD_EVENT_PERSISTENCE_LIMIT);
}

export const dispatchPersistenceAdapter = {
  waitForHydration(): Promise<void> {
    return persistence.waitForHydration();
  },

  load(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
  ): DispatchPersistenceSnapshot {
    return loadSnapshot(expeditionId, defaults);
  },

  save(snapshot: DispatchPersistenceSnapshot): DispatchPersistenceSnapshot {
    return saveSnapshot(snapshot);
  },

  upsertPing(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    ping: DispatchPing,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      pings: mergeDispatchPing(snapshot.pings, ping),
    }));
  },

  upsertQueueItem(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    item: DispatchQueueItem,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      queueItems: mergeDispatchQueueItem(snapshot.queueItems, item),
    }));
  },

  upsertAssignment(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    assignment: DispatchAssignment,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      assignments: mergeDispatchAssignment(snapshot.assignments, assignment),
    }));
  },

  upsertAssistRequest(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    request: DispatchAssistRequest,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      assistRequests: mergeDispatchAssistRequest(snapshot.assistRequests, request),
    }));
  },

  upsertAcknowledgment(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    acknowledgment: DispatchAcknowledgment,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      acknowledgments: mergeDispatchAcknowledgment(snapshot.acknowledgments, acknowledgment),
    }));
  },

  upsertOfflineAction(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    action: DispatchQueuedOfflineAction,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      offlineActions: mergeDispatchOfflineAction(snapshot.offlineActions, action),
    }));
  },

  appendTimelineEvent(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    event: DispatchTimelineEvent,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      timelineEvents: mergeDispatchTimelineEvent(snapshot.timelineEvents, event),
    }));
  },

  upsertCadEvent(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    event: DispatchEvent,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      cadEvents: mergeDispatchCadEvents([...snapshot.cadEvents, event]),
    }));
  },

  updateCadEvent(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    eventId: string,
    updater: (event: DispatchEvent) => DispatchEvent,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      cadEvents: mergeDispatchCadEvents(snapshot.cadEvents.map((event) => (
        event.id === eventId ? updater(event) : event
      ))),
    }));
  },

  updateQueueItem(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    itemId: string,
    updater: (item: DispatchQueueItem) => DispatchQueueItem,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      queueItems: snapshot.queueItems.map((item) => (item.id === itemId ? updater(item) : item)),
    }));
  },

  updatePing(
    expeditionId: string,
    defaults: DispatchPersistenceDefaults,
    pingId: string,
    updater: (ping: DispatchPing) => DispatchPing,
  ): DispatchPersistenceSnapshot {
    return updateSnapshot(expeditionId, defaults, (snapshot) => ({
      ...snapshot,
      pings: snapshot.pings.map((ping) => (ping.id === pingId ? updater(ping) : ping)),
    }));
  },
};

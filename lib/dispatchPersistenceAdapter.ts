import { createPersistedKeyValueCache } from './keyValuePersistence';
import {
  mergeDispatchAssignment,
  mergeDispatchPing,
  mergeDispatchQueueItem,
  mergeDispatchTimelineEvent,
} from './dispatchIntegrity';
import {
  normalizeDispatchEvent,
  sortDispatchEvents,
  type DispatchEvent,
} from './dispatchLiveEvents';
import type {
  DispatchAssignment,
  DispatchPing,
  DispatchQueueItem,
  DispatchTimelineEvent,
} from './dispatchTypes';

const STORAGE_FILE = 'ecs_dispatch_persistence';
const STORAGE_VERSION = 1;
const DISPATCH_CAD_EVENT_PERSISTENCE_LIMIT = 300;
const persistence = createPersistedKeyValueCache(STORAGE_FILE);

// TODO(dispatch-live): Mirror these records to dedicated Dispatch backend tables
// once the schema exists. The repo currently has no Dispatch migration/table set
// for pings, queue items, assignments, or timeline events, so this adapter keeps
// the feature local-first and durable without unsafe Supabase writes.

export interface DispatchPersistenceSnapshot {
  version: number;
  expeditionId: string;
  pings: DispatchPing[];
  queueItems: DispatchQueueItem[];
  assignments: DispatchAssignment[];
  timelineEvents: DispatchTimelineEvent[];
  cadEvents: DispatchEvent[];
  updatedAt: string;
}

export interface DispatchPersistenceDefaults {
  pings: DispatchPing[];
  queueItems: DispatchQueueItem[];
  assignments: DispatchAssignment[];
  timelineEvents: DispatchTimelineEvent[];
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
    timelineEvents: [...defaults.timelineEvents],
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
    timelineEvents: Array.isArray(candidate.timelineEvents)
      ? candidate.timelineEvents
      : [...defaults.timelineEvents],
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
  return {
    ...snapshot,
    pings: snapshot.pings.reduce<DispatchPing[]>(
      (acc, ping) => mergeDispatchPing(acc, ping),
      [],
    ),
    queueItems: snapshot.queueItems.reduce<DispatchQueueItem[]>(
      (acc, item) => mergeDispatchQueueItem(acc, item),
      [],
    ),
    assignments: snapshot.assignments.reduce<DispatchAssignment[]>(
      (acc, assignment) => mergeDispatchAssignment(acc, assignment),
      [],
    ),
    timelineEvents: snapshot.timelineEvents.reduce<DispatchTimelineEvent[]>(
      (acc, event) => mergeDispatchTimelineEvent(acc, event),
      [],
    ),
    cadEvents: mergeDispatchCadEvents(snapshot.cadEvents),
  };
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

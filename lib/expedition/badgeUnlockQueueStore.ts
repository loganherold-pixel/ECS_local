import { ecsLog } from '../ecsLogger';
import { createMigratingNonSecureStorage } from '../nonSecureStorage';
import { getBadgeDefinition } from './expeditionBadgeRegistry';
import {
  BADGE_UNLOCK_PRESENTATION_SCHEMA_VERSION,
  getBadgeUnlockItemEventIds,
  normalizeBadgeUnlockEvent,
  planBadgeUnlockPresentations,
  type BadgeUnlockEvent,
  type BadgeUnlockPresentationItem,
  type BadgeUnlockPresentationMode,
} from './badgeUnlockPresentation';

const STORAGE_KEY = 'ecs_badge_unlock_presentations_v1';
const STORAGE_VERSION = 1 as const;
const MAX_PENDING_ITEMS = 256;
const MAX_TRACKED_EVENT_IDS = 4096;

export type BadgeUnlockDeferredBanner = {
  id: string;
  batchId: string;
  badgeId: string | null;
  achievementCount: number;
};

export type BadgeUnlockQueueSnapshot = {
  hydrated: boolean;
  queue: BadgeUnlockPresentationItem[];
  active: {
    item: BadgeUnlockPresentationItem;
    presented: boolean;
  } | null;
  deferredBanner: BadgeUnlockDeferredBanner | null;
  presentedEventIds: string[];
  banneredEventIds: string[];
};

type PersistedBadgeUnlockQueue = {
  schemaVersion: typeof STORAGE_VERSION;
  pending: BadgeUnlockPresentationItem[];
  presentedEventIds: string[];
  banneredEventIds: string[];
};

export type BadgeUnlockQueueStorage = {
  read(key: string): Promise<string | null>;
  write(key: string, value: string | null): Promise<void>;
  remove(key: string): Promise<void>;
};

type BadgeUnlockQueueStoreOptions = {
  storage: BadgeUnlockQueueStorage;
};

function initialSnapshot(): BadgeUnlockQueueSnapshot {
  return {
    hydrated: false,
    queue: [],
    active: null,
    deferredBanner: null,
    presentedEventIds: [],
    banneredEventIds: [],
  };
}

function boundedUnique(values: readonly string[]): string[] {
  return Array.from(new Set(values)).slice(-MAX_TRACKED_EVENT_IDS);
}

function normalizeMode(value: unknown): BadgeUnlockPresentationMode | null {
  return value === 'full' || value === 'short' || value === 'record' ? value : null;
}

function safeString(value: unknown, maxLength = 240): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\r\n\0]/.test(normalized)) return null;
  return normalized;
}

function boundedInteger(value: unknown, min: number, max: number): number | null {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return null;
  return number;
}

export function normalizeBadgeUnlockPresentationItem(
  raw: unknown,
): BadgeUnlockPresentationItem | null {
  const input = raw as Partial<BadgeUnlockPresentationItem> | null | undefined;
  const id = safeString(input?.id);
  const batchId = safeString(input?.batchId);
  const sequenceIndex = boundedInteger(input?.sequenceIndex, 0, MAX_PENDING_ITEMS);
  const sequenceCount = boundedInteger(input?.sequenceCount, 1, MAX_PENDING_ITEMS);
  const events = Array.isArray(input?.events)
    ? input.events.map(normalizeBadgeUnlockEvent).filter((event): event is BadgeUnlockEvent => !!event)
    : [];
  if (
    input?.schemaVersion !== BADGE_UNLOCK_PRESENTATION_SCHEMA_VERSION ||
    !id ||
    !batchId ||
    sequenceIndex == null ||
    sequenceCount == null ||
    events.length === 0 ||
    events.length !== input?.events?.length
  ) {
    return null;
  }

  if (input.kind === 'badge') {
    const badgeId = safeString(input.badgeId);
    const mode = normalizeMode(input.mode);
    if (!badgeId || !mode || events.length !== 1 || events[0].badgeId !== badgeId || !getBadgeDefinition(badgeId)) {
      return null;
    }
    return {
      schemaVersion: BADGE_UNLOCK_PRESENTATION_SCHEMA_VERSION,
      id,
      batchId,
      kind: 'badge',
      events,
      badgeId,
      mode,
      sequenceIndex,
      sequenceCount,
    };
  }

  if (input.kind === 'summary') {
    const additionalCount = boundedInteger(input.additionalCount, 1, MAX_PENDING_ITEMS);
    if (additionalCount == null || additionalCount !== events.length) return null;
    return {
      schemaVersion: BADGE_UNLOCK_PRESENTATION_SCHEMA_VERSION,
      id,
      batchId,
      kind: 'summary',
      events,
      additionalCount,
      sequenceIndex,
      sequenceCount,
    };
  }
  return null;
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return boundedUnique(value.map((item) => safeString(item)).filter((item): item is string => !!item));
}

function parsePersistedQueue(raw: string | null): PersistedBadgeUnlockQueue {
  if (!raw) {
    return { schemaVersion: STORAGE_VERSION, pending: [], presentedEventIds: [], banneredEventIds: [] };
  }
  const parsed = JSON.parse(raw) as Partial<PersistedBadgeUnlockQueue>;
  if (parsed.schemaVersion !== STORAGE_VERSION || !Array.isArray(parsed.pending)) {
    throw new Error('Badge unlock queue schema is unavailable.');
  }
  const presentedEventIds = normalizeIdList(parsed.presentedEventIds);
  const presented = new Set(presentedEventIds);
  const pending = parsed.pending
    .map(normalizeBadgeUnlockPresentationItem)
    .filter((item): item is BadgeUnlockPresentationItem => !!item)
    .filter((item) => getBadgeUnlockItemEventIds(item).some((eventId) => !presented.has(eventId)))
    .slice(0, MAX_PENDING_ITEMS);
  return {
    schemaVersion: STORAGE_VERSION,
    pending,
    presentedEventIds,
    banneredEventIds: normalizeIdList(parsed.banneredEventIds),
  };
}

export function createBadgeUnlockQueueStore({ storage }: BadgeUnlockQueueStoreOptions) {
  let snapshot = initialSnapshot();
  let hydrationPromise: Promise<void> | null = null;
  let writeChain: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();

  function emit() {
    listeners.forEach((listener) => listener());
  }

  function pendingForPersistence(next: BadgeUnlockQueueSnapshot): BadgeUnlockPresentationItem[] {
    const activePending = next.active && !next.active.presented ? [next.active.item] : [];
    return [...activePending, ...next.queue].slice(0, MAX_PENDING_ITEMS);
  }

  function queuePersistence(next: BadgeUnlockQueueSnapshot) {
    const persisted: PersistedBadgeUnlockQueue = {
      schemaVersion: STORAGE_VERSION,
      pending: pendingForPersistence(next),
      presentedEventIds: boundedUnique(next.presentedEventIds),
      banneredEventIds: boundedUnique(next.banneredEventIds),
    };
    const payload = JSON.stringify(persisted);
    writeChain = writeChain
      .catch(() => undefined)
      .then(() => storage.write(STORAGE_KEY, payload))
      .catch((error) => {
        ecsLog.warn('SYSTEM', '[BadgeUnlockQueue] Presentation state persistence failed', {
          error: error instanceof Error ? error.message : 'persistence_failed',
        });
      });
  }

  function commit(next: BadgeUnlockQueueSnapshot, persist = true) {
    snapshot = next;
    emit();
    if (persist) queuePersistence(next);
  }

  async function initialize(): Promise<void> {
    if (snapshot.hydrated) return;
    if (hydrationPromise) return hydrationPromise;
    hydrationPromise = (async () => {
      try {
        const persisted = parsePersistedQueue(await storage.read(STORAGE_KEY));
        snapshot = {
          ...initialSnapshot(),
          hydrated: true,
          queue: persisted.pending,
          presentedEventIds: persisted.presentedEventIds,
          banneredEventIds: persisted.banneredEventIds,
        };
      } catch (error) {
        snapshot = { ...initialSnapshot(), hydrated: true };
        ecsLog.warn('SYSTEM', '[BadgeUnlockQueue] Invalid presentation state ignored', {
          error: error instanceof Error ? error.message : 'invalid_state',
        });
        queuePersistence(snapshot);
      }
      emit();
    })().finally(() => {
      hydrationPromise = null;
    });
    return hydrationPromise;
  }

  async function enqueue(rawEvents: readonly BadgeUnlockEvent[]): Promise<number> {
    await initialize();
    const knownIds = new Set(snapshot.presentedEventIds);
    snapshot.queue.forEach((item) => getBadgeUnlockItemEventIds(item).forEach((id) => knownIds.add(id)));
    if (snapshot.active) getBadgeUnlockItemEventIds(snapshot.active.item).forEach((id) => knownIds.add(id));

    const events = rawEvents
      .map(normalizeBadgeUnlockEvent)
      .filter((event): event is BadgeUnlockEvent => !!event && !knownIds.has(event.achievementEventId));
    const planned = planBadgeUnlockPresentations(events);
    if (planned.length === 0) return 0;
    commit({
      ...snapshot,
      queue: [...snapshot.queue, ...planned].slice(0, MAX_PENDING_ITEMS),
    });
    return planned.length;
  }

  function beginNext(): BadgeUnlockPresentationItem | null {
    if (!snapshot.hydrated || snapshot.active || snapshot.queue.length === 0) return null;
    const [item, ...queue] = snapshot.queue;
    commit({
      ...snapshot,
      queue,
      active: { item, presented: false },
      deferredBanner: null,
    });
    return item;
  }

  function markActivePresented(itemId: string): boolean {
    if (!snapshot.active || snapshot.active.item.id !== itemId || snapshot.active.presented) return false;
    const presentedEventIds = boundedUnique([
      ...snapshot.presentedEventIds,
      ...getBadgeUnlockItemEventIds(snapshot.active.item),
    ]);
    commit({
      ...snapshot,
      active: { ...snapshot.active, presented: true },
      presentedEventIds,
    });
    return true;
  }

  function completeActive(itemId: string): boolean {
    if (!snapshot.active || snapshot.active.item.id !== itemId) return false;
    const presentedEventIds = snapshot.active.presented
      ? snapshot.presentedEventIds
      : boundedUnique([...snapshot.presentedEventIds, ...getBadgeUnlockItemEventIds(snapshot.active.item)]);
    commit({ ...snapshot, active: null, presentedEventIds });
    return true;
  }

  function deferActive(): boolean {
    if (!snapshot.active) return false;
    const active = snapshot.active;
    commit({
      ...snapshot,
      active: null,
      queue: active.presented ? snapshot.queue : [active.item, ...snapshot.queue],
    });
    return true;
  }

  function failActivePresentation(itemId: string): boolean {
    return completeActive(itemId);
  }

  function claimDeferredBanner(): BadgeUnlockDeferredBanner | null {
    if (!snapshot.hydrated || snapshot.queue.length === 0 || snapshot.deferredBanner) {
      return snapshot.deferredBanner;
    }
    const batchId = snapshot.queue[0].batchId;
    const batchItems = snapshot.queue.filter((item) => item.batchId === batchId);
    const eventIds = boundedUnique(batchItems.flatMap(getBadgeUnlockItemEventIds));
    const bannered = new Set(snapshot.banneredEventIds);
    if (eventIds.every((eventId) => bannered.has(eventId))) return null;
    const primary = batchItems.find((item) => item.kind === 'badge');
    const deferredBanner: BadgeUnlockDeferredBanner = {
      id: `deferred:${batchId}`,
      batchId,
      badgeId: primary?.kind === 'badge' ? primary.badgeId : null,
      achievementCount: eventIds.length,
    };
    commit({
      ...snapshot,
      deferredBanner,
      banneredEventIds: boundedUnique([...snapshot.banneredEventIds, ...eventIds]),
    });
    return deferredBanner;
  }

  function dismissDeferredBanner(): void {
    if (!snapshot.deferredBanner) return;
    commit({ ...snapshot, deferredBanner: null }, false);
  }

  async function clearForTests(): Promise<void> {
    snapshot = { ...initialSnapshot(), hydrated: true };
    emit();
    await storage.remove(STORAGE_KEY);
  }

  return {
    getSnapshot(): BadgeUnlockQueueSnapshot {
      return snapshot;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    initialize,
    enqueue,
    beginNext,
    markActivePresented,
    completeActive,
    deferActive,
    failActivePresentation,
    claimDeferredBanner,
    dismissDeferredBanner,
    clearForTests,
    flushPersistence(): Promise<void> {
      return writeChain;
    },
  };
}

const productionStorage = createMigratingNonSecureStorage('ecs_badge_unlock_presentations', {
  logTag: 'BadgeUnlockQueue',
});

export const badgeUnlockQueueStore = createBadgeUnlockQueueStore({ storage: productionStorage });

export async function enqueueBadgeUnlockEvents(events: readonly BadgeUnlockEvent[]): Promise<number> {
  return badgeUnlockQueueStore.enqueue(events);
}

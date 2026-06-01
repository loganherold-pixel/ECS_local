import {
  sortDispatchEvents,
  validateDispatchEvent,
  type DispatchEvent,
} from './dispatchLiveEvents';
import { createDispatchEventDedupeKey, isDuplicateDispatchEvent } from './dispatchEventDedupe';

type DispatchEventListener = (events: DispatchEvent[]) => void;

export const DISPATCH_EVENT_STORE_LIMIT = 300;

let dispatchEvents: DispatchEvent[] = [];
const dispatchEventListeners = new Set<DispatchEventListener>();
let lastLiveRawEventsRef: unknown[] | null = null;
let lastLiveRawEventsSignature: string | null = null;
const dismissedEventIds = new Set<string>();

function isLiveStoreEvent(event: DispatchEvent): boolean {
  return event.id.startsWith('live-');
}

function getSnapshot(): DispatchEvent[] {
  return dispatchEvents;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeRawForSignature(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeRawForSignature);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const next = (value as Record<string, unknown>)[key];
        if (typeof next !== 'function' && next !== undefined) {
          acc[key] = normalizeRawForSignature(next);
        }
        return acc;
      }, {});
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Number(value.toFixed(5)) : null;
  }
  return value ?? null;
}

function rawEventListSignature(rawEvents: unknown[]): string {
  return JSON.stringify(normalizeRawForSignature(rawEvents));
}

function eventSemanticSignature(event: DispatchEvent): string {
  return JSON.stringify({
    id: event.id,
    type: event.type,
    severity: event.severity,
    title: normalizeText(event.title),
    message: normalizeText(event.message),
    details: normalizeText(event.details),
    source: event.source,
    status: normalizeText(event.status),
    priority: normalizeText(event.priority),
    note: normalizeText(event.note),
    locationStatus: normalizeText(event.locationStatus),
    category: normalizeText(event.category),
    hazardType: normalizeText(event.hazardType),
    cadReferenceId: normalizeText(event.cadReferenceId),
    dedupeKey: normalizeText(event.dedupeKey),
    targetEventId: normalizeText(event.targetEventId),
    targetItemId: normalizeText(event.targetItemId),
    location: event.location
      ? {
          latitude: Number(event.location.latitude).toFixed(5),
          longitude: Number(event.location.longitude).toFixed(5),
          accuracyMeters: event.location.accuracyMeters == null
            ? null
            : Number(event.location.accuracyMeters).toFixed(1),
          altitude: event.location.altitude == null
            ? null
            : Number(event.location.altitude).toFixed(1),
          heading: event.location.heading == null
            ? null
            : Number(event.location.heading).toFixed(1),
          timestamp: normalizeText(event.location.timestamp),
          source: normalizeText(event.location.source),
        }
      : null,
    teamId: normalizeText(event.teamId),
    sessionId: normalizeText(event.sessionId),
    channelId: normalizeText(event.channelId),
    syncState: normalizeText(event.syncState),
    routeSegmentId: normalizeText(event.routeSegmentId),
    requiresMapDrilldown: event.requiresMapDrilldown ?? null,
  });
}

function sameSemanticEvent(left: DispatchEvent, right: DispatchEvent): boolean {
  return eventSemanticSignature(left) === eventSemanticSignature(right);
}

function sameEventList(left: DispatchEvent[], right: DispatchEvent[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((event, index) => {
    const other = right[index];
    return !!other && event.id === other.id && sameSemanticEvent(event, other);
  });
}

function emit(): void {
  const snapshot = getSnapshot();
  dispatchEventListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.warn('[DISPATCH_LIVE] listener_error', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

function logValidatedEvent(event: DispatchEvent): void {
  console.log('[DISPATCH] event_received');
  console.log('[DISPATCH] event_validated', {
    id: event.id,
    type: event.type,
    severity: event.severity,
    source: event.source,
  });

  if (event.type === 'team_ping') {
    console.log('[DISPATCH] ping_created', { id: event.id });
  }

  if (event.type === 'recovery') {
    console.log('[DISPATCH] recovery_created', { id: event.id });
  }
}

function validateStoreEvent(rawEvent: unknown, options?: { log?: boolean }): DispatchEvent | null {
  const validation = validateDispatchEvent(rawEvent);
  if (!validation.ok) {
    console.warn(`[DISPATCH] event_rejected reason=${validation.reason}`);
    return null;
  }

  if (options?.log !== false) {
    logValidatedEvent(validation.event);
  }

  return validation.event;
}

function dedupeDispatchEvents(events: DispatchEvent[]): DispatchEvent[] {
  const accepted: DispatchEvent[] = [];
  for (const event of sortDispatchEvents(events)) {
    if (accepted.some((currentEvent) => isDuplicateDispatchEvent(currentEvent, event))) {
      console.log('[DISPATCH] duplicate_event_suppressed', {
        id: event.id,
        dedupeKey: createDispatchEventDedupeKey(event),
      });
      continue;
    }
    accepted.push(event);
  }
  return accepted;
}

function boundDispatchEvents(events: DispatchEvent[]): DispatchEvent[] {
  return sortDispatchEvents(events).slice(0, DISPATCH_EVENT_STORE_LIMIT);
}

function isDismissedEvent(event: DispatchEvent): boolean {
  return dismissedEventIds.has(event.id);
}

function filterDismissedEvents(events: DispatchEvent[]): DispatchEvent[] {
  return events.filter((event) => !isDismissedEvent(event));
}

export const dispatchEventStore = {
  getSnapshot,

  subscribe(listener: DispatchEventListener): () => void {
    dispatchEventListeners.add(listener);
    listener(getSnapshot());
    return () => {
      dispatchEventListeners.delete(listener);
    };
  },

  replaceEvents(rawEvents: unknown[]): DispatchEvent[] {
    const nextEvents = boundDispatchEvents(filterDismissedEvents(dedupeDispatchEvents(
      rawEvents
        .map((rawEvent) => validateStoreEvent(rawEvent))
        .filter((event): event is DispatchEvent => !!event),
    )));
    if (sameEventList(dispatchEvents, nextEvents)) {
      return getSnapshot();
    }
    dispatchEvents = nextEvents;
    emit();
    return getSnapshot();
  },

  replaceLiveDispatchEvents(rawEvents: unknown[]): DispatchEvent[] {
    if (rawEvents === lastLiveRawEventsRef) {
      return getSnapshot();
    }
    const rawEventsSignature = rawEventListSignature(rawEvents);
    if (rawEventsSignature === lastLiveRawEventsSignature) {
      lastLiveRawEventsRef = rawEvents;
      return getSnapshot();
    }
    lastLiveRawEventsRef = rawEvents;
    lastLiveRawEventsSignature = rawEventsSignature;

    const previousById = new Map(dispatchEvents.map((event) => [event.id, event]));
    const liveEvents = rawEvents.reduce<DispatchEvent[]>((accepted, rawEvent) => {
      const event = validateStoreEvent(rawEvent, { log: false });
      if (!event) return accepted;
      if (isDismissedEvent(event)) return accepted;

      const previous = previousById.get(event.id);
      if (previous && isLiveStoreEvent(previous) && sameSemanticEvent(previous, event)) {
        accepted.push(previous);
        return accepted;
      }

      logValidatedEvent(event);
      accepted.push(event);
      return accepted;
    }, []);
    const manualEvents = dispatchEvents.filter((event) => !isLiveStoreEvent(event));

    const nextEvents = boundDispatchEvents(dedupeDispatchEvents([
      ...liveEvents,
      ...manualEvents,
    ]));
    if (sameEventList(dispatchEvents, nextEvents)) {
      return getSnapshot();
    }
    dispatchEvents = nextEvents;
    emit();
    return getSnapshot();
  },

  appendEvent(rawEvent: unknown): DispatchEvent | null {
    const event = validateStoreEvent(rawEvent);
    if (!event) {
      return null;
    }
    if (isDismissedEvent(event)) {
      return null;
    }

    const duplicateEvent = dispatchEvents.find((currentEvent) => (
      isDuplicateDispatchEvent(currentEvent, event)
    ));
    if (duplicateEvent) {
      console.log('[DISPATCH] duplicate_event_suppressed', {
        id: event.id,
        duplicateOf: duplicateEvent.id,
        dedupeKey: createDispatchEventDedupeKey(event),
      });
      return null;
    }

    dispatchEvents = boundDispatchEvents([
      event,
      ...dispatchEvents.filter((currentEvent) => currentEvent.id !== event.id),
    ]);
    emit();
    return event;
  },

  upsertEvent(rawEvent: unknown): DispatchEvent | null {
    const event = validateStoreEvent(rawEvent);
    if (!event) {
      return null;
    }
    if (isDismissedEvent(event)) {
      return null;
    }

    const existingIndex = dispatchEvents.findIndex((currentEvent) => currentEvent.id === event.id);
    if (existingIndex >= 0) {
      const existingEvent = dispatchEvents[existingIndex];
      if (sameSemanticEvent(existingEvent, event)) {
        return existingEvent;
      }

      dispatchEvents = boundDispatchEvents(
        dispatchEvents.map((currentEvent) => (currentEvent.id === event.id ? event : currentEvent)),
      );
      emit();
      return event;
    }

    const duplicateEvent = dispatchEvents.find((currentEvent) => (
      isDuplicateDispatchEvent(currentEvent, event)
    ));
    if (duplicateEvent) {
      console.log('[DISPATCH] duplicate_event_suppressed', {
        id: event.id,
        duplicateOf: duplicateEvent.id,
        dedupeKey: createDispatchEventDedupeKey(event),
      });
      return null;
    }

    dispatchEvents = boundDispatchEvents([event, ...dispatchEvents]);
    emit();
    return event;
  },

  clearEvent(eventId: string | null | undefined): boolean {
    const normalizedId = typeof eventId === 'string' ? eventId.trim() : '';
    if (!normalizedId) return false;

    dismissedEventIds.add(normalizedId);
    const beforeCount = dispatchEvents.length;
    dispatchEvents = dispatchEvents.filter((event) => event.id !== normalizedId);
    const changed = dispatchEvents.length !== beforeCount;
    if (changed) emit();
    return changed;
  },

  clear(): void {
    lastLiveRawEventsRef = null;
    lastLiveRawEventsSignature = null;
    dismissedEventIds.clear();
    dispatchEvents = [];
    emit();
  },
};

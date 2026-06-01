import type { DispatchEvent } from './dispatchLiveEvents';

export const DISPATCH_ACTION_DEDUPE_WINDOW_MS = 10_000;

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function eventTimeMs(event: Pick<DispatchEvent, 'createdAt'>): number {
  const parsed = Date.parse(event.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function createDispatchCoordinateFingerprint(
  coordinate: { latitude?: number | null; longitude?: number | null } | null | undefined,
): string {
  const latitude = Number(coordinate?.latitude);
  const longitude = Number(coordinate?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return 'no-coordinates';
  }

  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

export function createDispatchEventDedupeKey(event: DispatchEvent): string {
  if (event.dedupeKey) {
    return `explicit:${normalizeText(event.dedupeKey)}`;
  }

  const actor =
    event.createdBy?.userId ??
    event.createdBy?.callsign ??
    event.createdBy?.email ??
    event.createdBy?.displayName ??
    'anonymous';
  const target =
    event.targetEventId ??
    event.targetItemId ??
    event.routeSegmentId ??
    createDispatchCoordinateFingerprint(event.location);
  const payload = [
    event.type,
    event.source,
    event.title,
    event.message,
    actor,
    target,
  ].map(normalizeText).join('|');

  return `fallback:${payload}`;
}

export function isDuplicateDispatchEvent(
  existingEvent: DispatchEvent,
  nextEvent: DispatchEvent,
  windowMs: number = DISPATCH_ACTION_DEDUPE_WINDOW_MS,
): boolean {
  const existingKey = createDispatchEventDedupeKey(existingEvent);
  const nextKey = createDispatchEventDedupeKey(nextEvent);
  if (existingKey !== nextKey) {
    return false;
  }

  if (existingKey.startsWith('explicit:')) {
    return true;
  }

  const deltaMs = Math.abs(eventTimeMs(existingEvent) - eventTimeMs(nextEvent));
  return deltaMs <= windowMs;
}

import {
  getDispatchEventTypeLabel,
  getDispatchSeverityLabel,
  getDispatchSourceLabel,
  type DispatchEvent,
} from './dispatchLiveEvents';

export type DispatchEventDetailCoordinate = {
  latitude: number;
  longitude: number;
};

export type DispatchEventDetailPresentation = {
  title: string;
  typeLabel: string;
  severityLabel: string;
  priorityLabel: string;
  statusLabel: string;
  sourceLabel: string;
  body: string;
  coordinates: DispatchEventDetailCoordinate | null;
  coordinatesText: string | null;
  createdTimeText: string;
  updatedTimeText: string | null;
  referenceId: string | null;
  recoveryNotes: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

function normalizeCoordinatePair(latitude: unknown, longitude: unknown): DispatchEventDetailCoordinate | null {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { latitude: lat, longitude: lon };
}

export function normalizeDispatchEventCoordinates(value: unknown): DispatchEventDetailCoordinate | null {
  if (Array.isArray(value) && value.length >= 2) {
    return normalizeCoordinatePair(value[0], value[1]) ?? normalizeCoordinatePair(value[1], value[0]);
  }

  if (!isRecord(value)) return null;

  const direct = normalizeCoordinatePair(
    value.latitude ?? value.lat,
    value.longitude ?? value.lng ?? value.lon,
  );
  if (direct) return direct;

  for (const key of ['location', 'coordinate', 'coordinates', 'gps', 'gpsFix', 'position', 'center', 'marker']) {
    const nested = normalizeDispatchEventCoordinates(value[key]);
    if (nested) return nested;
  }

  if (isRecord(value.geometry)) {
    const geometryCoordinates = normalizeDispatchEventCoordinates(value.geometry.coordinates);
    if (geometryCoordinates) return geometryCoordinates;
  }

  return null;
}

export function formatDispatchCoordinates(coordinates: DispatchEventDetailCoordinate | null): string | null {
  if (!coordinates) return null;
  return `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`;
}

function formatEventDateTime(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeRecoveryNotes(event: DispatchEvent): string[] {
  const raw = (event as unknown as Record<string, unknown>).recoveryNotes;
  if (Array.isArray(raw)) {
    return raw
      .map((note) => cleanText(note))
      .filter((note): note is string => !!note);
  }

  const single = firstText(raw, (event as unknown as Record<string, unknown>).recoveryNote);
  return single ? [single] : [];
}

export function getDispatchEventBody(event: DispatchEvent): string {
  const raw = event as unknown as Record<string, unknown>;
  return firstText(
    raw.body,
    raw.description,
    raw.explanation,
    raw.details,
    event.message,
  ) ?? event.title;
}

export function getDispatchEventReferenceId(event: DispatchEvent): string | null {
  const raw = event as unknown as Record<string, unknown>;
  return firstText(
    raw.cadReferenceId,
    raw.cadId,
    raw.referenceId,
    raw.refId,
    raw.externalId,
    event.id,
  );
}

export function createDispatchEventDetailPresentation(
  event: DispatchEvent,
  fallbackStatus?: string | null,
): DispatchEventDetailPresentation {
  const raw = event as unknown as Record<string, unknown>;
  const coordinates = normalizeDispatchEventCoordinates(event);
  const status = firstText(raw.status, fallbackStatus) ?? 'active';
  const priority = firstText(raw.priority) ?? getDispatchSeverityLabel(event.severity);

  return {
    title: event.title,
    typeLabel: getDispatchEventTypeLabel(event.type),
    severityLabel: getDispatchSeverityLabel(event.severity),
    priorityLabel: priority,
    statusLabel: status,
    sourceLabel: getDispatchSourceLabel(event.source),
    body: getDispatchEventBody(event),
    coordinates,
    coordinatesText: formatDispatchCoordinates(coordinates),
    createdTimeText: formatEventDateTime(event.createdAt) ?? event.createdAt,
    updatedTimeText: formatEventDateTime(raw.updatedAt),
    referenceId: getDispatchEventReferenceId(event),
    recoveryNotes: normalizeRecoveryNotes(event),
  };
}

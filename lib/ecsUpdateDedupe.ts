import { ecsLog } from './ecsLogger';

export const ECS_ALERT_DEDUPE_WINDOW_MS = 15 * 60 * 1000;

export type ECSUpdateDedupeEvent = {
  id?: string | number | null;
  type?: string | null;
  category?: string | null;
  title?: string | null;
  message?: string | null;
  body?: string | null;
  severity?: string | number | null;
  source?: string | null;
  affectedArea?: string | null;
  routeSegmentId?: string | null;
  location?: {
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  coordinates?: {
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  timestamp?: number | string | Date | null;
  status?: string | null;
  userCreated?: boolean | null;
};

export type ECSUpdateDedupeDecisionInput<T extends ECSUpdateDedupeEvent = ECSUpdateDedupeEvent> = {
  lastEvent?: T | null;
  nextEvent: T;
  windowMs?: number;
};

export type ECSUpdateDedupeRegistryDecisionInput<T extends ECSUpdateDedupeEvent = ECSUpdateDedupeEvent> = {
  nextEvent: T;
  windowMs?: number;
  registry?: string;
};

type ECSUpdateDedupeRegistryState = {
  events: Map<string, ECSUpdateDedupeEvent>;
  hydrated: boolean;
  reuseLogged: boolean;
  hydrationLogged: boolean;
};

const ECS_DEDUPE_GLOBAL_KEY = '__ECS_UPDATE_DEDUPE_REGISTRY_V2__';

function logDedupe(message: string, details: Record<string, unknown>): void {
  const event = message.replace(/^\[ECS_DEDUPE\]\s*/, '').replace(/[=\s]+$/, '');
  ecsLog.dev('DEDUPE', event, details, {
    tag: '[ECS_DEDUPE]',
    debugFlag: 'ECS_DEBUG_DEDUPE',
    fingerprint: `${event}:${JSON.stringify(details)}`,
    throttleMs: 2500,
    aggregateWindowMs: 10_000,
  });
}

function getDedupeRegistryState(): ECSUpdateDedupeRegistryState {
  const globalStore = globalThis as unknown as Record<string, ECSUpdateDedupeRegistryState | undefined>;
  const existing = globalStore[ECS_DEDUPE_GLOBAL_KEY];
  if (existing) {
    if (!existing.reuseLogged) {
      existing.reuseLogged = true;
      logDedupe('[ECS_DEDUPE] dedupe_registry_reused', { size: existing.events.size });
    }
    return existing;
  }

  const state: ECSUpdateDedupeRegistryState = {
    events: new Map<string, ECSUpdateDedupeEvent>(),
    hydrated: true,
    reuseLogged: false,
    hydrationLogged: false,
  };
  globalStore[ECS_DEDUPE_GLOBAL_KEY] = state;
  if (!state.hydrationLogged) {
    state.hydrationLogged = true;
    logDedupe('[ECS_DEDUPE] dedupe_hydrated', { source: 'memory_singleton', size: 0 });
  }
  return state;
}

function getDedupeRegistry(): Map<string, ECSUpdateDedupeEvent> {
  return getDedupeRegistryState().events;
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm)?\b/gi, '')
    .replace(/\b\d{4}-\d{2}-\d{2}(?:t|\s)\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?z?)?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeValue(value: unknown): string {
  return normalizeText(value);
}

function eventTimeMs(event: ECSUpdateDedupeEvent): number | null {
  const value = event.timestamp;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' || value instanceof Date) {
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function locationHash(location: ECSUpdateDedupeEvent['location'] | ECSUpdateDedupeEvent['coordinates']): string {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'no_location';
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

function eventLocationHash(event: ECSUpdateDedupeEvent): string {
  const primary = locationHash(event.location);
  return primary === 'no_location' ? locationHash(event.coordinates) : primary;
}

function eventMessageText(event: ECSUpdateDedupeEvent): string {
  return normalizeText(event.message ?? event.body);
}

export function createECSUpdateFingerprint(event: ECSUpdateDedupeEvent): string {
  const stableId = normalizeValue(event.id);
  if (stableId) {
    return `id:${stableId}`;
  }

  return createECSUpdateSemanticFingerprint(event);
}

export function createECSUpdateSemanticFingerprint(event: ECSUpdateDedupeEvent): string {
  return [
    normalizeValue(event.type),
    normalizeValue(event.category),
    normalizeValue(event.severity),
    normalizeValue(event.source),
    normalizeText(event.title),
    eventMessageText(event),
    normalizeValue(event.affectedArea),
    normalizeValue(event.routeSegmentId),
    eventLocationHash(event),
  ].join('|');
}

function isTerminalStatus(value: unknown): boolean {
  const normalized = normalizeValue(value);
  return normalized === 'acknowledged' || normalized === 'resolved' || normalized === 'dismissed';
}

function hasMeaningfulUpdate(lastEvent: ECSUpdateDedupeEvent, nextEvent: ECSUpdateDedupeEvent): boolean {
  if (nextEvent.userCreated) return true;
  if (normalizeValue(lastEvent.type) !== normalizeValue(nextEvent.type)) return true;
  if (normalizeValue(lastEvent.category) !== normalizeValue(nextEvent.category)) return true;
  if (normalizeValue(lastEvent.severity) !== normalizeValue(nextEvent.severity)) return true;
  if (normalizeValue(lastEvent.source) !== normalizeValue(nextEvent.source)) return true;
  if (normalizeText(lastEvent.title) !== normalizeText(nextEvent.title)) return true;
  if (normalizeValue(lastEvent.affectedArea) !== normalizeValue(nextEvent.affectedArea)) return true;
  if (normalizeValue(lastEvent.routeSegmentId) !== normalizeValue(nextEvent.routeSegmentId)) return true;
  if (eventLocationHash(lastEvent) !== eventLocationHash(nextEvent)) return true;
  if (eventMessageText(lastEvent) !== eventMessageText(nextEvent)) return true;
  if (normalizeValue(lastEvent.status) !== normalizeValue(nextEvent.status)) return true;
  if (isTerminalStatus(lastEvent.status) && !isTerminalStatus(nextEvent.status)) return true;
  return false;
}

export function shouldSuppressECSUpdate({
  lastEvent,
  nextEvent,
  windowMs = ECS_ALERT_DEDUPE_WINDOW_MS,
}: ECSUpdateDedupeDecisionInput): boolean {
  const fingerprint = createECSUpdateFingerprint(nextEvent);
  const semanticFingerprint = createECSUpdateSemanticFingerprint(nextEvent);

  if (!lastEvent) {
    logDedupe('[ECS_DEDUPE] accepted fingerprint=', { fingerprint, reason: 'first_event' });
    return false;
  }

  const lastFingerprint = createECSUpdateFingerprint(lastEvent);
  const lastSemanticFingerprint = createECSUpdateSemanticFingerprint(lastEvent);
  const lastTime = eventTimeMs(lastEvent);
  const nextTime = eventTimeMs(nextEvent) ?? Date.now();
  const insideWindow = lastTime != null && nextTime - lastTime <= windowMs;
  const sameFingerprint = lastFingerprint === fingerprint;
  const sameSemanticFingerprint = lastSemanticFingerprint === semanticFingerprint;
  const meaningful = hasMeaningfulUpdate(lastEvent, nextEvent);

  if (insideWindow && (sameFingerprint || sameSemanticFingerprint) && !meaningful) {
    logDedupe('[ECS_DEDUPE] meaningful_update_rejected_identical', {
      fingerprint,
      semanticFingerprint,
    });
    logDedupe('[ECS_DEDUPE] duplicate_suppressed', {
      fingerprint,
      semanticFingerprint,
      reason: 'duplicate_window',
    });
    return true;
  }

  if (meaningful) {
    logDedupe('[ECS_DEDUPE] accepted reason=meaningful_update', { fingerprint });
    return false;
  }

  if (lastTime == null || nextTime - lastTime > windowMs) {
    logDedupe('[ECS_DEDUPE] accepted fingerprint=', { fingerprint, reason: 'outside_window' });
    return false;
  }

  logDedupe('[ECS_DEDUPE] duplicate_suppressed', {
    fingerprint,
    semanticFingerprint,
    reason: 'duplicate_window',
  });
  return true;
}

function registryKeyFor(kind: 'id' | 'semantic', fingerprint: string, registry = 'global'): string {
  return `${normalizeValue(registry) || 'global'}:${kind}:${fingerprint}`;
}

function registryKeysFor(event: ECSUpdateDedupeEvent, registry = 'global'): string[] {
  const fingerprint = createECSUpdateFingerprint(event);
  const semanticFingerprint = createECSUpdateSemanticFingerprint(event);
  const keys = [
    registryKeyFor('id', fingerprint, registry),
    registryKeyFor('semantic', semanticFingerprint, registry),
  ];
  return Array.from(new Set(keys));
}

export function shouldSuppressECSUpdateInRegistry({
  nextEvent,
  windowMs = ECS_ALERT_DEDUPE_WINDOW_MS,
  registry = 'global',
}: ECSUpdateDedupeRegistryDecisionInput): boolean {
  const dedupeRegistry = getDedupeRegistry();
  const keys = registryKeysFor(nextEvent, registry);
  const lastEvent = keys.map(key => dedupeRegistry.get(key)).find(Boolean) ?? null;
  const shouldSuppress = shouldSuppressECSUpdate({
    lastEvent,
    nextEvent,
    windowMs,
  });

  if (!shouldSuppress) {
    for (const key of keys) {
      dedupeRegistry.set(key, nextEvent);
    }
  }

  return shouldSuppress;
}

export function rememberECSUpdateInRegistry(
  event: ECSUpdateDedupeEvent,
  registry = 'global',
): string {
  const fingerprint = createECSUpdateFingerprint(event);
  const dedupeRegistry = getDedupeRegistry();
  for (const key of registryKeysFor(event, registry)) {
    dedupeRegistry.set(key, event);
  }
  return fingerprint;
}

export function clearECSUpdateDedupeRegistry(registry?: string): void {
  const dedupeRegistry = getDedupeRegistry();
  if (!registry) {
    dedupeRegistry.clear();
    return;
  }

  const prefix = `${normalizeValue(registry) || 'global'}:`;
  for (const key of dedupeRegistry.keys()) {
    if (key.startsWith(prefix)) {
      dedupeRegistry.delete(key);
    }
  }
}

export const ecsUpdateDedupeTestHooks = {
  clearRegistry: clearECSUpdateDedupeRegistry,
  registrySize(): number {
    return getDedupeRegistry().size;
  },
  createSemanticFingerprint: createECSUpdateSemanticFingerprint,
};

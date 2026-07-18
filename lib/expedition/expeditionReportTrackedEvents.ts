import type { ExpeditionTripRecord } from './expeditionTripRecordTypes';
import type {
  ExpeditionReportStoryCategory,
  ExpeditionReportStorySignificance,
  ExpeditionReportTrackedEventInput,
} from './expeditionReportStory';

export type { ExpeditionReportTrackedEventInput } from './expeditionReportStory';

export type ExpeditionReportTrackedEventSyncState =
  | 'unknown'
  | 'draft'
  | 'local'
  | 'pending'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'synced'
  | 'delivered'
  | 'received'
  | 'seen'
  | 'acknowledged'
  | 'accepted'
  | 'declined'
  | 'no_response'
  | 'escalated'
  | 'recovered'
  | 'failed'
  | 'retrying'
  | 'cancelled';

interface TripCollectionWindow {
  expeditionId: string;
  userId: string;
  startedAtMs: number;
  completedAtMs: number;
}

const SAFE_SYNC_STATES = new Set<ExpeditionReportTrackedEventSyncState>([
  'unknown',
  'draft',
  'local',
  'pending',
  'queued',
  'sending',
  'sent',
  'synced',
  'delivered',
  'received',
  'seen',
  'acknowledged',
  'accepted',
  'declined',
  'no_response',
  'escalated',
  'recovered',
  'failed',
  'retrying',
  'cancelled',
]);

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .replace(EMAIL_PATTERN, '[redacted email]')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function safeTitle(value: unknown, fallback: string): string {
  return safeText(value, 160) ?? fallback;
}

function safeDetail(value: unknown): string | null {
  return safeText(value, 2_000);
}

function safeCoordinate(
  latValue: unknown,
  lngValue: unknown,
): ExpeditionReportTrackedEventInput['coordinate'] {
  if (latValue == null || lngValue == null || latValue === '' || lngValue === '') return null;
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function safeSyncState(
  value: unknown,
  fallback: ExpeditionReportTrackedEventSyncState = 'unknown',
): ExpeditionReportTrackedEventSyncState {
  return typeof value === 'string' && SAFE_SYNC_STATES.has(value as ExpeditionReportTrackedEventSyncState)
    ? value as ExpeditionReportTrackedEventSyncState
    : fallback;
}

function tripCollectionWindow(trip: ExpeditionTripRecord): TripCollectionWindow | null {
  if (trip.status !== 'completed' || !trip.completedAt) return null;
  if (!trip.expeditionId || !trip.userId) return null;

  const startedAtMs = Date.parse(trip.startedAt);
  const completedAtMs = Date.parse(trip.completedAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(completedAtMs)) return null;
  if (completedAtMs < startedAtMs) return null;

  return {
    expeditionId: trip.expeditionId,
    userId: trip.userId,
    startedAtMs,
    completedAtMs,
  };
}

function capturedAtInWindow(
  capturedAt: unknown,
  window: TripCollectionWindow,
): string | null {
  if (typeof capturedAt !== 'string') return null;
  const capturedAtMs = Date.parse(capturedAt);
  if (!Number.isFinite(capturedAtMs)) return null;
  if (capturedAtMs < window.startedAtMs || capturedAtMs > window.completedAtMs) return null;
  return new Date(capturedAtMs).toISOString();
}

function liveLogCategory(type: string): ExpeditionReportStoryCategory {
  switch (type) {
    case 'MECH':
      return 'mechanical';
    case 'MED':
      return 'medical';
    case 'NAV':
    case 'CHECKPOINT':
      return 'route';
    case 'SUPPLY':
      return 'supply';
    case 'COMMS':
      return 'convoy';
    case 'RISK':
      return 'terrain';
    case 'STOP':
    case 'NOTE':
    default:
      return 'highlight';
  }
}

function liveLogSignificance(severity: string): ExpeditionReportStorySignificance {
  switch (severity) {
    case 'CRITICAL':
      return 'critical';
    case 'HIGH':
      return 'caution';
    case 'MED':
      return 'watch';
    case 'LOW':
    default:
      return 'info';
  }
}

function fieldLogCategory(type: string): ExpeditionReportStoryCategory {
  switch (type) {
    case 'incident':
      return 'recovery';
    case 'resource':
      return 'supply';
    case 'maintenance':
      return 'mechanical';
    case 'comms':
      return 'convoy';
    case 'medical':
      return 'medical';
    case 'marker':
    case 'note':
    default:
      return 'highlight';
  }
}

function fieldLogSignificance(type: string): ExpeditionReportStorySignificance {
  switch (type) {
    case 'incident':
    case 'medical':
      return 'caution';
    case 'maintenance':
    case 'comms':
      return 'watch';
    default:
      return 'info';
  }
}

function dispatchTimelineCategory(type: string): ExpeditionReportStoryCategory {
  switch (type) {
    case 'resource_check_requested':
      return 'supply';
    case 'assist_request_created':
      return 'recovery';
    case 'hazard_broadcast_sent':
    case 'log':
      return 'highlight';
    default:
      return 'convoy';
  }
}

function prioritySignificance(priority: string): ExpeditionReportStorySignificance {
  switch (priority) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'caution';
    case 'normal':
    case 'low':
    default:
      return 'info';
  }
}

function dispatchCadCategory(type: string): ExpeditionReportStoryCategory {
  switch (type) {
    case 'weather':
      return 'weather';
    case 'route':
      return 'route';
    case 'terrain':
      return 'terrain';
    case 'resources':
      return 'supply';
    case 'assistance':
    case 'recovery':
      return 'recovery';
    case 'team_ping':
    case 'sync':
      return 'convoy';
    case 'vehicle':
      return 'mechanical';
    case 'system':
    default:
      return 'highlight';
  }
}

function dispatchCadSignificance(severity: string): ExpeditionReportStorySignificance {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'caution';
    case 'watch':
      return 'watch';
    case 'info':
    default:
      return 'info';
  }
}

function missionCommandSignificance(type: string): ExpeditionReportStorySignificance {
  switch (type) {
    case 'failed':
    case 'blocked':
    case 'declined':
      return 'caution';
    case 'expired':
    case 'cancelled':
    case 'retrying':
      return 'watch';
    default:
      return 'info';
  }
}

async function collectLiveLogEvents(
  window: TripCollectionWindow,
): Promise<ExpeditionReportTrackedEventInput[]> {
  try {
    const { expeditionEventStore } = await import('../expeditionEventStore');
    const events = await expeditionEventStore.loadEvents(window.expeditionId, {
      event_type: 'ALL',
      limit: 500,
    });

    return events.flatMap((event) => {
      if (event.expedition_id !== window.expeditionId) return [];
      const capturedAt = capturedAtInWindow(event.created_at, window);
      if (!capturedAt || !event.id) return [];

      const syncState: ExpeditionReportTrackedEventSyncState = event._failed
        ? 'failed'
        : event._optimistic
          ? 'pending'
          : 'synced';
      return [{
        id: `expedition-live-log:${event.id}`,
        capturedAt,
        title: safeTitle(event.title, `${event.event_type} expedition log`),
        detail: safeDetail(event.details),
        category: liveLogCategory(event.event_type),
        significance: liveLogSignificance(event.severity),
        sourceLabel: `Expedition Live Log - ${event.event_type}`,
        sourceQuality: 'manual' as const,
        syncState,
        coordinate: safeCoordinate(event.lat, event.lon),
      }];
    });
  } catch {
    return [];
  }
}

async function collectFieldLogEvents(
  window: TripCollectionWindow,
): Promise<ExpeditionReportTrackedEventInput[]> {
  try {
    const { fieldLogStore } = await import('../expeditionCommandStore');
    const fieldLogs = await fieldLogStore.list(window.expeditionId, window.userId);

    return fieldLogs.flatMap((fieldLog) => {
      if (fieldLog.expedition_id !== window.expeditionId) return [];
      if (fieldLog.user_id !== window.userId || fieldLog.deleted_at !== null) return [];
      const capturedAt = capturedAtInWindow(fieldLog.occurred_at, window);
      if (!capturedAt || !fieldLog.id) return [];

      return [{
        id: `field-log:${fieldLog.id}`,
        capturedAt,
        title: safeTitle(fieldLog.title, `${fieldLog.type} field log`),
        detail: safeDetail(fieldLog.body),
        category: fieldLogCategory(fieldLog.type),
        significance: fieldLogSignificance(fieldLog.type),
        sourceLabel: `Expedition Field Log - ${fieldLog.type}`,
        sourceQuality: 'manual' as const,
        syncState: 'unknown' as const,
        coordinate: safeCoordinate(fieldLog.lat, fieldLog.lng),
      }];
    });
  } catch {
    return [];
  }
}

async function collectDispatchEvents(
  window: TripCollectionWindow,
): Promise<ExpeditionReportTrackedEventInput[]> {
  try {
    const { dispatchPersistenceAdapter } = await import('../dispatchPersistenceAdapter');
    const defaults = {
      pings: [],
      queueItems: [],
      assignments: [],
      assistRequests: [],
      acknowledgments: [],
      timelineEvents: [],
      offlineActions: [],
      cadEvents: [],
      missionCommands: [],
      missionCommandEvents: [],
      guardianCheckIns: [],
      operationalPlaybooks: [],
    };
    const hydration = await dispatchPersistenceAdapter.hydrateResult(
      window.expeditionId,
      defaults,
      { timeoutMs: 4_000 },
    );
    const snapshot = hydration.snapshot;
    if (!snapshot || snapshot.expeditionId !== window.expeditionId) return [];

    const timelineEvents = snapshot.timelineEvents.flatMap((event) => {
      const capturedAt = capturedAtInWindow(event.occurredAt, window);
      if (!capturedAt || !event.id) return [];
      return [{
        id: `dispatch-timeline:${event.id}`,
        capturedAt,
        title: safeTitle(event.title, 'Dispatch timeline event'),
        detail: safeDetail(event.detail),
        category: dispatchTimelineCategory(event.type),
        significance: prioritySignificance(event.priority),
        sourceLabel: `Dispatch Timeline - ${event.type}`,
        sourceQuality: 'cached' as const,
        syncState: safeSyncState(event.deliveryState),
        coordinate: safeCoordinate(
          event.linkedContext?.coordinates?.latitude,
          event.linkedContext?.coordinates?.longitude,
        ),
      }];
    });

    const cadEvents = snapshot.cadEvents.flatMap((event) => {
      const capturedAt = capturedAtInWindow(event.createdAt, window);
      if (!capturedAt || !event.id) return [];
      return [{
        id: `dispatch-cad:${event.id}`,
        capturedAt,
        title: safeTitle(event.title, 'Dispatch event'),
        detail: safeDetail(event.details ?? event.message),
        category: dispatchCadCategory(event.type),
        significance: dispatchCadSignificance(event.severity),
        sourceLabel: `Dispatch CAD - ${event.type}`,
        sourceQuality: 'cached' as const,
        syncState: safeSyncState(event.syncState),
        coordinate: safeCoordinate(event.location?.latitude, event.location?.longitude),
      }];
    });

    const missionCommandEvents = snapshot.missionCommandEvents.flatMap((event) => {
      if (event.expeditionId !== window.expeditionId) return [];
      const capturedAt = capturedAtInWindow(event.occurredAt, window);
      if (!capturedAt || !event.id) return [];
      return [{
        id: `mission-command:${event.id}`,
        capturedAt,
        title: safeTitle(event.summary, 'Mission Command event'),
        detail: null,
        category: 'convoy' as const,
        significance: missionCommandSignificance(event.type),
        sourceLabel: `Mission Command - ${event.type}`,
        sourceQuality: 'cached' as const,
        syncState: safeSyncState(event.deliveryState),
        coordinate: null,
      }];
    });

    return [...timelineEvents, ...cadEvents, ...missionCommandEvents];
  } catch {
    return [];
  }
}

function dedupeAndSort(
  events: ExpeditionReportTrackedEventInput[],
): ExpeditionReportTrackedEventInput[] {
  const byId = new Map<string, ExpeditionReportTrackedEventInput>();
  events.forEach((event) => {
    if (!byId.has(event.id)) byId.set(event.id, event);
  });
  return [...byId.values()].sort((left, right) => (
    Date.parse(left.capturedAt) - Date.parse(right.capturedAt)
    || left.id.localeCompare(right.id)
  ));
}

async function boundedSource<T>(promise: Promise<T>, fallback: T, timeoutMs = 4_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Collects historical, identity-matched inputs for a completed expedition report.
 * Each source is isolated so unavailable providers or corrupt local state yield a
 * truthful partial report instead of blocking the canonical trip export.
 */
export async function collectExpeditionReportTrackedEvents(
  trip: ExpeditionTripRecord,
): Promise<ExpeditionReportTrackedEventInput[]> {
  const window = tripCollectionWindow(trip);
  if (!window) return [];

  const sources = await Promise.all([
    boundedSource(collectLiveLogEvents(window), []),
    boundedSource(collectFieldLogEvents(window), []),
    boundedSource(collectDispatchEvents(window), []),
  ]);
  return dedupeAndSort(sources.flat());
}

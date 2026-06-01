export type DispatchLiveSourceState = 'live_systems' | 'cached_last_known' | 'unavailable';

export type DispatchEventType =
  | 'weather'
  | 'route'
  | 'terrain'
  | 'vehicle'
  | 'resources'
  | 'sync'
  | 'system'
  | 'team_ping'
  | 'assistance'
  | 'recovery';

export type DispatchEventSeverity = 'info' | 'watch' | 'warning' | 'critical';

export type DispatchEventSource =
  | 'weather_engine'
  | 'route_engine'
  | 'terrain_engine'
  | 'vehicle_telemetry'
  | 'resource_store'
  | 'sync_state'
  | 'user_report'
  | 'team_member'
  | 'cache';

export type DispatchEventCategory = 'recovery_assist' | 'hazard_recovery';

export type DispatchEventHazardType =
  | 'weather'
  | 'terrain'
  | 'trail_blockage'
  | 'water_crossing'
  | 'recovery'
  | 'visibility'
  | 'other';

export type DispatchEventLocationSource = 'current_gps' | 'last_known_gps';

export type DispatchEventSyncState =
  | 'local'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'received';

export type DispatchActorIdentity = {
  userId?: string;
  displayName: string;
  email?: string;
  callsign?: string;
};

export type DispatchRigIdentity = {
  vehicleId?: string;
  label: string;
};

export type DispatchEvent = {
  id: string;
  type: DispatchEventType;
  severity: DispatchEventSeverity;
  title: string;
  message: string;
  details?: string;
  source: DispatchEventSource;
  createdAt: string;
  updatedAt?: string;
  status?: string;
  priority?: string;
  note?: string;
  locationStatus?: string;
  category?: DispatchEventCategory;
  hazardType?: DispatchEventHazardType;
  cadReferenceId?: string;
  recoveryNotes?: string[];
  dedupeKey?: string;
  targetEventId?: string;
  targetItemId?: string;
  createdBy?: DispatchActorIdentity;
  rig?: DispatchRigIdentity;
  location?: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
    altitude?: number | null;
    heading?: number | null;
    timestamp?: string;
    source?: DispatchEventLocationSource;
  };
  teamId?: string;
  sessionId?: string;
  channelId?: string;
  syncState?: DispatchEventSyncState;
  routeSegmentId?: string;
  requiresMapDrilldown?: boolean;
};

type DispatchEventValidationResult =
  | { ok: true; event: DispatchEvent }
  | { ok: false; reason: string };

const EVENT_TYPES: DispatchEventType[] = [
  'weather',
  'route',
  'terrain',
  'vehicle',
  'resources',
  'sync',
  'system',
  'team_ping',
  'assistance',
  'recovery',
];

const EVENT_SEVERITIES: DispatchEventSeverity[] = ['info', 'watch', 'warning', 'critical'];

const EVENT_SOURCES: DispatchEventSource[] = [
  'weather_engine',
  'route_engine',
  'terrain_engine',
  'vehicle_telemetry',
  'resource_store',
  'sync_state',
  'user_report',
  'team_member',
  'cache',
];

const EVENT_CATEGORIES: DispatchEventCategory[] = ['recovery_assist', 'hazard_recovery'];

const EVENT_HAZARD_TYPES: DispatchEventHazardType[] = [
  'weather',
  'terrain',
  'trail_blockage',
  'water_crossing',
  'recovery',
  'visibility',
  'other',
];

const LOCATION_SOURCES: DispatchEventLocationSource[] = ['current_gps', 'last_known_gps'];
const SYNC_STATES: DispatchEventSyncState[] = ['local', 'queued', 'sending', 'sent', 'failed', 'received'];

const SEVERITY_WEIGHT: Record<DispatchEventSeverity, number> = {
  info: 1,
  watch: 2,
  warning: 3,
  critical: 4,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDispatchEventType(value: unknown): value is DispatchEventType {
  return typeof value === 'string' && EVENT_TYPES.includes(value as DispatchEventType);
}

function isDispatchEventSeverity(value: unknown): value is DispatchEventSeverity {
  return typeof value === 'string' && EVENT_SEVERITIES.includes(value as DispatchEventSeverity);
}

function isDispatchEventSource(value: unknown): value is DispatchEventSource {
  return typeof value === 'string' && EVENT_SOURCES.includes(value as DispatchEventSource);
}

function normalizeTimestamp(raw: Record<string, unknown>): string | null {
  const value = raw.timestamp ?? raw.createdAt;
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function normalizeOptionalTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function normalizeLocation(value: unknown): DispatchEvent['location'] {
  if (Array.isArray(value) && value.length >= 2) {
    const direct = normalizeLocation({ latitude: value[0], longitude: value[1] });
    return direct ?? normalizeLocation({ latitude: value[1], longitude: value[0] });
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const latitude = Number(value.latitude ?? value.lat);
  const longitude = Number(value.longitude ?? value.lng ?? value.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return undefined;
  }

  const accuracyValue = value.accuracyMeters ?? value.accuracyM ?? value.accuracy;
  const accuracyMeters = accuracyValue == null ? null : Number(accuracyValue);
  const altitudeValue = value.altitude ?? value.altitudeMeters;
  const altitude = altitudeValue == null ? null : Number(altitudeValue);
  const headingValue = value.heading ?? value.headingDeg;
  const heading = headingValue == null ? null : Number(headingValue);
  const timestampValue = normalizeFirstString(value.timestamp, value.createdAt, value.updatedAt);
  const parsedTimestamp = timestampValue ? Date.parse(timestampValue) : NaN;
  const source = typeof value.source === 'string' && LOCATION_SOURCES.includes(value.source as DispatchEventLocationSource)
    ? value.source as DispatchEventLocationSource
    : undefined;

  return {
    latitude,
    longitude,
    accuracyMeters: Number.isFinite(accuracyMeters) ? accuracyMeters : null,
    altitude: Number.isFinite(altitude) ? altitude : null,
    heading: Number.isFinite(heading) ? heading : null,
    timestamp: Number.isFinite(parsedTimestamp) ? new Date(parsedTimestamp).toISOString() : undefined,
    source,
  };
}

function normalizeEventLocation(raw: Record<string, unknown>): DispatchEvent['location'] {
  for (const key of ['location', 'coordinate', 'coordinates', 'gps', 'gpsFix', 'position']) {
    const location = normalizeLocation(raw[key]);
    if (location) return location;
  }

  if (isRecord(raw.geometry)) {
    const location = normalizeLocation(raw.geometry.coordinates);
    if (location) return location;
  }

  return undefined;
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeEventCategory(value: unknown): DispatchEventCategory | undefined {
  return typeof value === 'string' && EVENT_CATEGORIES.includes(value as DispatchEventCategory)
    ? value as DispatchEventCategory
    : undefined;
}

function normalizeEventHazardType(value: unknown): DispatchEventHazardType | undefined {
  return typeof value === 'string' && EVENT_HAZARD_TYPES.includes(value as DispatchEventHazardType)
    ? value as DispatchEventHazardType
    : undefined;
}

function normalizeEventSyncState(value: unknown): DispatchEventSyncState | undefined {
  return typeof value === 'string' && SYNC_STATES.includes(value as DispatchEventSyncState)
    ? value as DispatchEventSyncState
    : undefined;
}

function normalizeFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = normalizeString(value);
    if (text) return text;
  }
  return undefined;
}

function normalizeRecoveryNotes(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const notes = value
      .map((note) => normalizeString(note))
      .filter((note): note is string => !!note);
    return notes.length > 0 ? notes : undefined;
  }

  const note = normalizeString(value);
  return note ? [note] : undefined;
}

function normalizeActorIdentity(value: unknown): DispatchActorIdentity | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const displayName = typeof value.displayName === 'string' ? value.displayName.trim() : '';
  if (!displayName) {
    return undefined;
  }

  const userId = typeof value.userId === 'string' && value.userId.trim()
    ? value.userId.trim()
    : undefined;
  const email = typeof value.email === 'string' && value.email.trim()
    ? value.email.trim()
    : undefined;
  const callsign = typeof value.callsign === 'string' && value.callsign.trim()
    ? value.callsign.trim()
    : undefined;

  return { userId, displayName, email, callsign };
}

function normalizeRigIdentity(value: unknown): DispatchRigIdentity | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const label = typeof value.label === 'string' ? value.label.trim() : '';
  if (!label) {
    return undefined;
  }

  const vehicleId = typeof value.vehicleId === 'string' && value.vehicleId.trim()
    ? value.vehicleId.trim()
    : undefined;

  return { vehicleId, label };
}

export function validateDispatchEvent(raw: unknown): DispatchEventValidationResult {
  if (!isRecord(raw)) {
    return { ok: false, reason: 'raw source was not an object' };
  }

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) {
    return { ok: false, reason: 'missing id' };
  }

  if (!isDispatchEventType(raw.type)) {
    return { ok: false, reason: `invalid type for ${id}` };
  }

  if (!isDispatchEventSeverity(raw.severity)) {
    return { ok: false, reason: `invalid severity for ${id}` };
  }

  const createdAt = normalizeTimestamp(raw);
  if (!createdAt) {
    return { ok: false, reason: `missing timestamp for ${id}` };
  }

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) {
    return { ok: false, reason: `missing title for ${id}` };
  }

  const details = normalizeFirstString(raw.body, raw.description, raw.explanation, raw.details);
  const message = normalizeFirstString(raw.message, details) ?? '';
  if (!message) {
    return { ok: false, reason: `missing message for ${id}` };
  }

  if (!isDispatchEventSource(raw.source)) {
    return { ok: false, reason: `invalid source for ${id}` };
  }

  const routeSegmentId = typeof raw.routeSegmentId === 'string' && raw.routeSegmentId.trim()
    ? raw.routeSegmentId.trim()
    : undefined;
  const status = normalizeString(raw.status);
  const priority = normalizeString(raw.priority);
  const note = normalizeFirstString(raw.note, raw.notes);
  const locationStatus = normalizeFirstString(raw.locationStatus, raw.location_status);
  const category = normalizeEventCategory(raw.category ?? raw.typeCategory);
  const hazardType = normalizeEventHazardType(raw.hazardType ?? raw.hazard_type);
  const cadReferenceId = normalizeFirstString(raw.cadReferenceId, raw.cadId, raw.referenceId, raw.refId, raw.externalId);
  const recoveryNotes = normalizeRecoveryNotes(raw.recoveryNotes ?? raw.recoveryNote);
  const dedupeKey = normalizeString(raw.dedupeKey);
  const targetEventId = normalizeString(raw.targetEventId);
  const targetItemId = normalizeString(raw.targetItemId);
  const teamId = normalizeFirstString(raw.teamId, raw.team_id);
  const sessionId = normalizeFirstString(raw.sessionId, raw.session_id, raw.expeditionId, raw.expedition_id);
  const channelId = normalizeFirstString(raw.channelId, raw.channel_id);
  const syncState = normalizeEventSyncState(raw.syncState ?? raw.deliveryState);

  return {
    ok: true,
    event: {
      id,
      type: raw.type,
      severity: raw.severity,
      title,
      message,
      details,
      source: raw.source,
      createdAt,
      updatedAt: normalizeOptionalTimestamp(raw.updatedAt),
      status,
      priority,
      note,
      locationStatus,
      category,
      hazardType,
      cadReferenceId,
      recoveryNotes,
      dedupeKey,
      targetEventId,
      targetItemId,
      createdBy: normalizeActorIdentity(raw.createdBy),
      rig: normalizeRigIdentity(raw.rig),
      location: normalizeEventLocation(raw),
      teamId,
      sessionId,
      channelId,
      syncState,
      routeSegmentId,
      requiresMapDrilldown: typeof raw.requiresMapDrilldown === 'boolean'
        ? raw.requiresMapDrilldown
        : undefined,
    },
  };
}

export function normalizeDispatchEvent(raw: unknown): DispatchEvent | null {
  const validation = validateDispatchEvent(raw);
  if (!validation.ok) {
    console.warn('[DISPATCH_LIVE] drop_invalid_event', { reason: validation.reason });
    return null;
  }

  return validation.event;
}

export function normalizeDispatchEvents(rawEvents: unknown[]): DispatchEvent[] {
  return rawEvents.reduce<DispatchEvent[]>((validEvents, rawEvent) => {
    const event = normalizeDispatchEvent(rawEvent);
    if (event) {
      validEvents.push(event);
    }

    return validEvents;
  }, []);
}

export function sortDispatchEvents<T extends Pick<DispatchEvent, 'createdAt' | 'severity'>>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const severityDiff = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }

    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

export function getDispatchEventTypeLabel(type: DispatchEventType): string {
  switch (type) {
    case 'weather':
      return 'Weather';
    case 'route':
      return 'Route';
    case 'terrain':
      return 'Terrain';
    case 'vehicle':
      return 'Vehicle';
    case 'resources':
      return 'Resources';
    case 'sync':
      return 'Sync';
    case 'system':
      return 'System';
    case 'team_ping':
      return 'Team Ping';
    case 'assistance':
      return 'Assistance';
    case 'recovery':
      return 'Recovery';
    default:
      return 'Dispatch Event';
  }
}

export function getDispatchSeverityLabel(severity: DispatchEventSeverity): string {
  switch (severity) {
    case 'critical':
      return 'Critical';
    case 'warning':
      return 'Warning';
    case 'watch':
      return 'Watch';
    case 'info':
    default:
      return 'Info';
  }
}

export function getDispatchSourceLabel(source: DispatchEventSource): string {
  switch (source) {
    case 'weather_engine':
      return 'Weather Engine';
    case 'route_engine':
      return 'Route Engine';
    case 'terrain_engine':
      return 'Terrain Engine';
    case 'vehicle_telemetry':
      return 'Vehicle Telemetry';
    case 'resource_store':
      return 'Resource Store';
    case 'sync_state':
      return 'Sync State';
    case 'user_report':
      return 'User Report';
    case 'team_member':
      return 'Team Member';
    case 'cache':
      return 'Last Known';
    default:
      return 'Unavailable';
  }
}

export function getTopDispatchAdvisory(events: DispatchEvent[]): DispatchEvent | null {
  return sortDispatchEvents(events)
    .find((event) => event.severity === 'critical' || event.severity === 'warning') ?? null;
}

import {
  normalizeGarminInreachEventToDispatch,
  stableHashGarminIdentifier,
  maskGarminDeviceIdentifier,
} from './garminInreachAdapter';
import {
  resolveGarminInreachConfig,
  supportsGarminInboundData,
  type GarminInreachIntegrationConfig,
} from './garminInreachConfig';
import type {
  GarminInreachInboundEvent,
  GarminInreachNormalizedDispatch,
} from './garminInreachTypes';

export type GarminIpcNormalizedMessageType =
  | 'position_report'
  | 'locate_response'
  | 'free_text_message'
  | 'sos_declared_incident_signal'
  | 'sos_confirmed_signal'
  | 'sos_cancel_signal_review'
  | 'reference_point'
  | 'tracking_started'
  | 'tracking_interval_changed'
  | 'tracking_stopped'
  | 'puck_check_in_message'
  | 'mapshare_message'
  | 'mail_check'
  | 'alive_check'
  | 'predefined_message'
  | 'binary_media_payload'
  | 'pingback_response'
  | 'garmin_unknown_event';

export interface GarminIpcNormalizedEvent {
  idempotencyKey: string;
  sourcePayloadVersion: string;
  messageCode: number | null;
  normalizedType: GarminIpcNormalizedMessageType;
  inboundEvent: GarminInreachInboundEvent;
  dispatch: GarminInreachNormalizedDispatch;
  deviceRef: {
    maskedIdentifier: string;
    identifierHash: string;
  };
  lowBattery: boolean;
  requiresHumanReview: boolean;
}

export interface GarminIpcOutboundQueueRecord {
  idempotencyKey: string;
  receivedAt: string;
  source: 'garmin_ipc_outbound';
  payloadVersion: string;
  normalizedEvent: GarminIpcNormalizedEvent;
}

export interface GarminIpcOutboundWebhookStore {
  has(idempotencyKey: string): boolean;
  enqueue(record: GarminIpcOutboundQueueRecord): void | Promise<void>;
}

export interface GarminIpcOutboundWebhookResult {
  ok: boolean;
  accepted: boolean;
  disabled?: boolean;
  duplicateCount: number;
  enqueuedCount: number;
  eventCount: number;
  reason?: string;
}

export interface GarminIpcOutboundWebhookOptions {
  config?: GarminInreachIntegrationConfig;
  store?: GarminIpcOutboundWebhookStore;
  now?: () => Date;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

const MAX_TEXT_LENGTH = 500;

export function createMemoryGarminInreachOutboundWebhookStore(): GarminIpcOutboundWebhookStore & {
  list(): GarminIpcOutboundQueueRecord[];
  clear(): void;
} {
  const records = new Map<string, GarminIpcOutboundQueueRecord>();

  return {
    has(idempotencyKey: string): boolean {
      return records.has(idempotencyKey);
    },
    enqueue(record: GarminIpcOutboundQueueRecord): void {
      records.set(record.idempotencyKey, record);
    },
    list(): GarminIpcOutboundQueueRecord[] {
      return [...records.values()];
    },
    clear(): void {
      records.clear();
    },
  };
}

export const garminInreachOutboundWebhookMemoryStore = createMemoryGarminInreachOutboundWebhookStore();

export async function handleGarminInreachOutboundWebhook(
  request: Request,
  options: GarminIpcOutboundWebhookOptions = {},
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true }, 200);
  }
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const config = options.config ?? resolveGarminInreachConfig();
  if (!supportsGarminInboundData(config)) {
    return jsonResponse({
      ok: true,
      accepted: false,
      disabled: true,
      reason: 'garmin_inreach_disabled',
    }, 200);
  }

  if (!authenticateStaticToken(request, config)) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonResponse({ ok: false, error: body.reason }, 400);
  }

  const parsed = parseGarminIpcOutboundPayload(body.value, options.now?.() ?? new Date());
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: parsed.reason }, 400);
  }

  const store = options.store ?? garminInreachOutboundWebhookMemoryStore;
  let duplicateCount = 0;
  let enqueuedCount = 0;

  for (const normalizedEvent of parsed.events) {
    if (store.has(normalizedEvent.idempotencyKey)) {
      duplicateCount += 1;
      continue;
    }

    await store.enqueue({
      idempotencyKey: normalizedEvent.idempotencyKey,
      receivedAt: parsed.receivedAt,
      source: 'garmin_ipc_outbound',
      payloadVersion: parsed.version,
      normalizedEvent,
    });
    enqueuedCount += 1;
  }

  const response: GarminIpcOutboundWebhookResult = {
    ok: true,
    accepted: true,
    duplicateCount,
    enqueuedCount,
    eventCount: parsed.events.length,
  };

  return jsonResponse(response, 200);
}

export function parseGarminIpcOutboundPayload(
  payload: unknown,
  receivedAtDate = new Date(),
): { ok: true; version: string; receivedAt: string; events: GarminIpcNormalizedEvent[] } | { ok: false; reason: string } {
  if (!isRecord(payload)) {
    return { ok: false, reason: 'payload_must_be_object' };
  }

  const version = normalizeVersion(payload.Version ?? payload.version);
  const rawEvents = payload.Events ?? payload.events;
  if (!version) {
    return { ok: false, reason: 'missing_version' };
  }
  if (!Array.isArray(rawEvents)) {
    return { ok: false, reason: 'events_must_be_array' };
  }

  const receivedAt = receivedAtDate.toISOString();
  const events = rawEvents.map((event, index) => normalizeGarminIpcEvent(event, {
    index,
    receivedAt,
    version,
  }));

  return { ok: true, version, receivedAt, events };
}

export function getGarminIpcMessageType(messageCode: number | null): GarminIpcNormalizedMessageType {
  if (messageCode === 0) return 'position_report';
  if (messageCode === 2) return 'locate_response';
  if (messageCode === 3) return 'free_text_message';
  if (messageCode === 4) return 'sos_declared_incident_signal';
  if (messageCode === 6) return 'sos_confirmed_signal';
  if (messageCode === 7) return 'sos_cancel_signal_review';
  if (messageCode === 8) return 'reference_point';
  if (messageCode === 10) return 'tracking_started';
  if (messageCode === 11) return 'tracking_interval_changed';
  if (messageCode === 12) return 'tracking_stopped';
  if (messageCode === 14 || messageCode === 15 || messageCode === 16) return 'puck_check_in_message';
  if (messageCode === 17) return 'mapshare_message';
  if (messageCode === 20) return 'mail_check';
  if (messageCode === 21) return 'alive_check';
  if (messageCode != null && messageCode >= 24 && messageCode <= 63) return 'predefined_message';
  if (messageCode === 64 || messageCode === 66 || messageCode === 67) return 'binary_media_payload';
  if (messageCode === 65) return 'pingback_response';
  return 'garmin_unknown_event';
}

export function createSafeGarminIpcLogPayload(
  value: unknown,
  options: { logPii?: boolean } = {},
): unknown {
  if (options.logPii === true) return value;
  if (Array.isArray(value)) return value.map((item) => createSafeGarminIpcLogPayload(item, options));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (/imei|device.*id|unit.*id/i.test(key) && (typeof entry === 'string' || typeof entry === 'number')) {
        return [key, maskGarminDeviceIdentifier(String(entry))];
      }
      return [key, createSafeGarminIpcLogPayload(entry, options)];
    }),
  );
}

function normalizeGarminIpcEvent(
  rawEvent: unknown,
  context: { index: number; receivedAt: string; version: string },
): GarminIpcNormalizedEvent {
  const event = isRecord(rawEvent) ? rawEvent : {};
  const messageCode = normalizeMessageCode(event);
  const normalizedType = getGarminIpcMessageType(messageCode);
  const deviceIdentifier = normalizeFirstString(
    event.IMEI,
    event.Imei,
    event.imei,
    event.DeviceId,
    event.deviceId,
    event.UnitId,
    event.unitId,
  );
  const occurredAt = normalizeTimestamp(
    event.Timestamp ??
    event.timestamp ??
    event.EventTime ??
    event.eventTime ??
    event.GpsFixTime ??
    event.gpsFixTime,
  ) ?? context.receivedAt;
  const id = normalizeFirstString(
    event.EventId,
    event.eventId,
    event.Id,
    event.ID,
    event.MessageId,
    event.messageId,
    event.Guid,
    event.guid,
  ) ?? `${context.version}:${context.index}:${deviceIdentifier ?? 'unknown'}:${messageCode ?? 'unknown'}:${occurredAt}`;
  const messageText = normalizeFirstString(
    event.Message,
    event.message,
    event.Text,
    event.text,
    event.FreeText,
    event.freeText,
    event.Payload,
    event.payload,
  );
  const coordinates = normalizeCoordinates(event);
  const batteryPercent = normalizeBatteryPercent(event);
  const lowBattery = isLowBatteryEvent(event, batteryPercent);
  const inboundEvent: GarminInreachInboundEvent = {
    id,
    type: inboundTypeFromMessageType(normalizedType, lowBattery),
    receivedAt: context.receivedAt,
    occurredAt,
    device: {
      imei: deviceIdentifier,
      deviceIdentifier,
      displayName: normalizeFirstString(event.DeviceName, event.deviceName, event.Name, event.name),
    },
    sender: {
      displayName: normalizeFirstString(event.SenderName, event.senderName, event.Sender, event.sender),
      callsign: normalizeFirstString(event.Callsign, event.callsign),
    },
    messageText: messageText ? sanitizeText(messageText, MAX_TEXT_LENGTH) : messageFromMessageType(normalizedType, messageCode),
    coordinates,
    locationAccuracyM: normalizeNumber(event.Accuracy ?? event.accuracy ?? event.LocationAccuracy ?? event.locationAccuracy),
    batteryPercent,
    sosStatus: sosStatusFromMessageType(normalizedType),
    trackingEnabled: trackingEnabledFromMessageType(normalizedType),
    rawEventType: String(messageCode ?? 'unknown'),
  };
  const dispatch = normalizeGarminInreachEventToDispatch(inboundEvent);
  const identifierHash = stableHashGarminIdentifier(deviceIdentifier);
  const idempotencyKey = `garmin-ipc:${stableHashGarminIdentifier(`${context.version}:${id}:${deviceIdentifier ?? 'unknown'}:${messageCode ?? 'unknown'}:${occurredAt}`)}`;

  return {
    idempotencyKey,
    sourcePayloadVersion: context.version,
    messageCode,
    normalizedType,
    inboundEvent,
    dispatch,
    deviceRef: {
      maskedIdentifier: maskGarminDeviceIdentifier(deviceIdentifier),
      identifierHash,
    },
    lowBattery,
    requiresHumanReview: inboundEvent.type === 'sos' || normalizedType === 'sos_cancel_signal_review',
  };
}

function authenticateStaticToken(request: Request, config: GarminInreachIntegrationConfig): boolean {
  const expected = config.secrets.webhookStaticToken?.trim();
  if (!expected) return false;

  const token = firstNonEmptyString(
    request.headers.get('x-garmin-inreach-token'),
    request.headers.get('x-ecs-garmin-token'),
    parseBearerToken(request.headers.get('authorization')),
  );

  return token === expected;
}

async function readJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; reason: string }> {
  try {
    const value = await request.json();
    return { ok: true, value };
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBearerToken(value: string | null): string | null {
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1]?.trim() || null;
}

function firstNonEmptyString(...values: Array<string | null>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function normalizeVersion(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return `V${value}`;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 32) : null;
}

function normalizeMessageCode(event: Record<string, unknown>): number | null {
  const raw = event.messageCode ?? event.MessageCode ?? event.Code ?? event.code;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function normalizeCoordinates(event: Record<string, unknown>): GarminInreachInboundEvent['coordinates'] {
  const latitude = normalizeNumber(event.Latitude ?? event.latitude ?? event.lat);
  const longitude = normalizeNumber(event.Longitude ?? event.longitude ?? event.lon ?? event.lng);
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function normalizeBatteryPercent(event: Record<string, unknown>): number | null {
  const value = normalizeNumber(
    event.BatteryPercent ??
    event.batteryPercent ??
    event.BatteryLevel ??
    event.batteryLevel ??
    event.Battery ??
    event.battery,
  );
  if (value == null) return null;
  return Math.max(0, Math.min(100, value));
}

function isLowBatteryEvent(event: Record<string, unknown>, batteryPercent: number | null): boolean {
  if (batteryPercent != null && batteryPercent <= 20) return true;
  const status = normalizeFirstString(event.BatteryStatus, event.batteryStatus, event.Status, event.status);
  return !!status && /low|critical/i.test(status);
}

function normalizeNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function normalizeFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function sanitizeText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').replace(/[<>]/g, '').trim();
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength).trim();
}

function inboundTypeFromMessageType(
  normalizedType: GarminIpcNormalizedMessageType,
  lowBattery: boolean,
): GarminInreachInboundEvent['type'] {
  if (normalizedType === 'sos_declared_incident_signal' ||
    normalizedType === 'sos_confirmed_signal' ||
    normalizedType === 'sos_cancel_signal_review') {
    return 'sos';
  }
  if (normalizedType === 'tracking_started' ||
    normalizedType === 'tracking_interval_changed' ||
    normalizedType === 'tracking_stopped') {
    return 'tracking';
  }
  if (normalizedType === 'position_report' ||
    normalizedType === 'locate_response' ||
    normalizedType === 'reference_point' ||
    normalizedType === 'pingback_response') {
    return lowBattery ? 'device_status' : 'location';
  }
  if (normalizedType === 'mail_check' || normalizedType === 'alive_check') {
    return 'device_status';
  }
  return 'message';
}

function messageFromMessageType(
  normalizedType: GarminIpcNormalizedMessageType,
  messageCode: number | null,
): string {
  switch (normalizedType) {
    case 'position_report':
      return 'Garmin inReach position report received.';
    case 'locate_response':
      return 'Garmin inReach locate response received.';
    case 'sos_declared_incident_signal':
      return 'Garmin inReach SOS declared signal received.';
    case 'sos_confirmed_signal':
      return 'Garmin inReach SOS confirmed signal received.';
    case 'sos_cancel_signal_review':
      return 'Garmin inReach SOS cancel signal received. Operator review is required.';
    case 'tracking_started':
      return 'Garmin inReach tracking started.';
    case 'tracking_interval_changed':
      return 'Garmin inReach tracking interval changed.';
    case 'tracking_stopped':
      return 'Garmin inReach tracking stopped.';
    case 'mail_check':
      return 'Garmin inReach mail check received.';
    case 'alive_check':
      return 'Garmin inReach alive check received.';
    case 'predefined_message':
      return `Garmin inReach predefined message ${messageCode ?? ''} received.`.trim();
    case 'binary_media_payload':
      return 'Garmin inReach binary/media payload received.';
    case 'garmin_unknown_event':
      return 'Garmin inReach event received with an unknown message code.';
    default:
      return 'Garmin inReach event received.';
  }
}

function sosStatusFromMessageType(normalizedType: GarminIpcNormalizedMessageType): GarminInreachInboundEvent['sosStatus'] {
  if (normalizedType === 'sos_declared_incident_signal') return 'triggered';
  if (normalizedType === 'sos_confirmed_signal') return 'active';
  if (normalizedType === 'sos_cancel_signal_review') return 'cancelled';
  return null;
}

function trackingEnabledFromMessageType(normalizedType: GarminIpcNormalizedMessageType): boolean | null {
  if (normalizedType === 'tracking_started' || normalizedType === 'tracking_interval_changed') return true;
  if (normalizedType === 'tracking_stopped') return false;
  return null;
}

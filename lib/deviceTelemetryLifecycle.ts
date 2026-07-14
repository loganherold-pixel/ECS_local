export const DEVICE_CONNECTION_LIFECYCLE_STATES = [
  'unknown',
  'discovered',
  'eligible',
  'connecting',
  'authenticating',
  'connected',
  'streaming',
  'degraded',
  'reconnecting',
  'disconnecting',
  'disconnected',
  'failed',
  'unsupported',
] as const;

export type DeviceConnectionLifecycleState = typeof DEVICE_CONNECTION_LIFECYCLE_STATES[number];

export const DEVICE_TELEMETRY_SOURCE_STATES = [
  'live',
  'recent',
  'stale',
  'last-known',
  'no-data',
  'unsupported',
] as const;

export type DeviceTelemetrySourceState = typeof DEVICE_TELEMETRY_SOURCE_STATES[number];

export type DeviceTransport = 'ble' | 'classic_bluetooth' | 'cloud' | 'hybrid' | 'wifi' | 'gateway' | 'stored' | 'unknown';

export type DeviceIdentityConfidence = 'exact' | 'linked' | 'heuristic' | 'temporary';

export type CanonicalDeviceIdentityInput = {
  providerId?: string | null;
  category?: string | null;
  displayName?: string | null;
  model?: string | null;
  serial?: string | null;
  storedProfileId?: string | null;
  telemetryDeviceId?: string | null;
  sourceIds?: Partial<Record<string, string | null | undefined>> | null;
};

export type CanonicalDeviceIdentity = {
  canonicalId: string;
  providerId: string;
  category: string;
  displayName: string;
  model: string | null;
  confidence: DeviceIdentityConfidence;
  aliases: Array<{ source: string; fingerprint: string }>;
};

export type DeviceAdapterErrorCode =
  | 'permission_denied'
  | 'scan_timeout'
  | 'connection_timeout'
  | 'authentication_required'
  | 'provider_unavailable'
  | 'transport_unavailable'
  | 'device_unavailable'
  | 'bad_frame'
  | 'cancelled'
  | 'unsupported'
  | 'unknown';

export type DeviceAdapterError = {
  code: DeviceAdapterErrorCode;
  message: string;
  retryable: boolean;
  phase: DeviceConnectionLifecycleState;
  providerId: string | null;
  transport: DeviceTransport;
};

export type DeviceAdapterTelemetryPayload<T> = {
  identity: CanonicalDeviceIdentity;
  transport: DeviceTransport;
  observedAt: number;
  receivedAt: number;
  decodedFields: readonly string[];
  sourceState: DeviceTelemetrySourceState;
  data: T;
};

export type DeviceTelemetrySourceStateInput = {
  lifecycle: DeviceConnectionLifecycleState;
  transport: DeviceTransport;
  telemetryTransport?: DeviceTransport | null;
  hasDecodedData: boolean;
  lastSampleAt?: number | null;
  now?: number;
  cached?: boolean;
  unsupported?: boolean;
  liveMaxAgeMs?: number;
  recentMaxAgeMs?: number;
  staleMaxAgeMs?: number;
  lastKnownMaxAgeMs?: number;
};

export type DeviceTelemetrySourceStateResult = {
  state: DeviceTelemetrySourceState;
  ageMs: number | null;
  reason:
    | 'fresh_stream'
    | 'recent_sample'
    | 'stale_sample'
    | 'retained_last_known'
    | 'missing_sample'
    | 'unsupported_device'
    | 'transport_mismatch'
    | 'invalid_timestamp';
};

export type DeviceReconnectPolicy = {
  delaysMs: readonly number[];
  maxAttempts: number;
};

export type DeviceTelemetryReplaySample = {
  observedAt: number;
  receivedAt: number;
  lifecycle: DeviceConnectionLifecycleState;
  decodedFields: string[];
  data: Record<string, unknown>;
};

export type DeviceTelemetryReplayFixture = {
  schema: 'ecs.device_telemetry.replay';
  version: 1;
  identity: CanonicalDeviceIdentityInput;
  transport: DeviceTransport;
  safety: {
    providerSecretsIncluded: false;
    rawPayloadIncluded: false;
    preciseLocationIncluded: false;
  };
  samples: DeviceTelemetryReplaySample[];
};

export type DeviceTelemetryReplayValidation = {
  valid: boolean;
  errors: string[];
};

export const DEFAULT_DEVICE_RECONNECT_POLICY: DeviceReconnectPolicy = {
  delaysMs: [1_000, 3_000, 8_000, 15_000, 30_000],
  maxAttempts: 5,
};

const LIVE_MAX_AGE_MS = 30_000;
const RECENT_MAX_AGE_MS = 60_000;
const STALE_MAX_AGE_MS = 5 * 60_000;
const LAST_KNOWN_MAX_AGE_MS = 24 * 60 * 60_000;

const ALLOWED_TRANSITIONS: Record<DeviceConnectionLifecycleState, ReadonlySet<DeviceConnectionLifecycleState>> = {
  unknown: new Set(['discovered', 'disconnected', 'failed', 'unsupported']),
  discovered: new Set(['eligible', 'connecting', 'disconnected', 'failed', 'unsupported']),
  eligible: new Set(['connecting', 'disconnected', 'failed', 'unsupported']),
  connecting: new Set(['authenticating', 'connected', 'streaming', 'reconnecting', 'disconnecting', 'failed', 'unsupported']),
  authenticating: new Set(['connected', 'streaming', 'reconnecting', 'disconnecting', 'failed', 'unsupported']),
  connected: new Set(['streaming', 'degraded', 'reconnecting', 'disconnecting', 'disconnected', 'failed', 'unsupported']),
  streaming: new Set(['degraded', 'reconnecting', 'disconnecting', 'disconnected', 'failed']),
  degraded: new Set(['streaming', 'reconnecting', 'disconnecting', 'disconnected', 'failed', 'unsupported']),
  reconnecting: new Set(['authenticating', 'connected', 'streaming', 'degraded', 'disconnecting', 'disconnected', 'failed', 'unsupported']),
  disconnecting: new Set(['disconnected', 'failed']),
  disconnected: new Set(['discovered', 'eligible', 'connecting', 'reconnecting', 'unsupported']),
  failed: new Set(['discovered', 'eligible', 'connecting', 'reconnecting', 'disconnecting', 'disconnected', 'unsupported']),
  unsupported: new Set(['discovered', 'disconnected']),
};

function cleanToken(value: unknown, fallback: string): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function createCanonicalDeviceIdentity(input: CanonicalDeviceIdentityInput): CanonicalDeviceIdentity {
  const providerId = cleanToken(input.providerId, 'unknown');
  const category = cleanToken(input.category, 'unknown');
  const displayName = String(input.displayName ?? input.model ?? 'Unknown device').trim() || 'Unknown device';
  const model = String(input.model ?? '').trim() || null;
  const serial = String(input.serial ?? '').trim();
  const storedProfileId = String(input.storedProfileId ?? '').trim();
  const telemetryDeviceId = String(input.telemetryDeviceId ?? '').trim();
  const sourceEntries = Object.entries(input.sourceIds ?? {})
    .map(([source, id]) => [cleanToken(source, 'unknown'), String(id ?? '').trim()] as const)
    .filter((entry) => entry[1].length > 0)
    .sort(([left], [right]) => left.localeCompare(right));

  const aliases = sourceEntries.map(([source, id]) => ({
    source,
    fingerprint: fingerprint(`${source}:${id}`),
  }));
  if (telemetryDeviceId) aliases.push({ source: 'telemetry', fingerprint: fingerprint(telemetryDeviceId) });
  if (storedProfileId) aliases.push({ source: 'stored-profile', fingerprint: fingerprint(storedProfileId) });

  let identityMaterial: string;
  let confidence: DeviceIdentityConfidence;
  if (serial) {
    identityMaterial = `serial:${serial}`;
    confidence = 'exact';
  } else if (storedProfileId) {
    identityMaterial = `profile:${storedProfileId}`;
    confidence = 'linked';
  } else if (model || !/^unknown device$/i.test(displayName)) {
    identityMaterial = `descriptor:${cleanToken(model, 'unknown')}:${cleanToken(displayName, 'unknown')}`;
    confidence = 'heuristic';
  } else if (telemetryDeviceId || sourceEntries.length > 0) {
    identityMaterial = `transport:${telemetryDeviceId || sourceEntries[0][1]}`;
    confidence = 'linked';
  } else {
    identityMaterial = `temporary:${providerId}:${category}:${displayName}`;
    confidence = 'temporary';
  }

  return {
    canonicalId: `ecs-device:${providerId}:${fingerprint(identityMaterial).slice(6)}`,
    providerId,
    category,
    displayName,
    model,
    confidence,
    aliases,
  };
}

export function canTransitionDeviceConnection(
  from: DeviceConnectionLifecycleState,
  to: DeviceConnectionLifecycleState,
): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].has(to);
}

export function assertDeviceConnectionTransition(
  from: DeviceConnectionLifecycleState,
  to: DeviceConnectionLifecycleState,
): void {
  if (!canTransitionDeviceConnection(from, to)) {
    throw new Error(`Invalid device connection transition: ${from} -> ${to}`);
  }
}

function transportsMatch(connection: DeviceTransport, telemetry: DeviceTransport): boolean {
  if (connection === 'unknown' || telemetry === 'unknown') return true;
  if (connection === telemetry) return true;
  if (connection === 'hybrid') return telemetry === 'ble' || telemetry === 'cloud';
  return connection === 'gateway' && telemetry === 'wifi';
}

export function resolveDeviceTelemetrySourceState(
  input: DeviceTelemetrySourceStateInput,
): DeviceTelemetrySourceStateResult {
  if (input.unsupported || input.lifecycle === 'unsupported') {
    return { state: 'unsupported', ageMs: null, reason: 'unsupported_device' };
  }
  if (
    input.telemetryTransport &&
    !transportsMatch(input.transport, input.telemetryTransport)
  ) {
    return { state: 'no-data', ageMs: null, reason: 'transport_mismatch' };
  }
  if (!input.hasDecodedData || input.lastSampleAt == null) {
    return { state: 'no-data', ageMs: null, reason: 'missing_sample' };
  }

  const now = input.now ?? Date.now();
  const ageMs = now - input.lastSampleAt;
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return { state: 'no-data', ageMs: null, reason: 'invalid_timestamp' };
  }
  if (
    input.lifecycle === 'streaming' &&
    ageMs <= (input.liveMaxAgeMs ?? LIVE_MAX_AGE_MS)
  ) {
    return { state: 'live', ageMs, reason: 'fresh_stream' };
  }
  if (ageMs <= (input.recentMaxAgeMs ?? RECENT_MAX_AGE_MS)) {
    return { state: 'recent', ageMs, reason: 'recent_sample' };
  }
  if (ageMs <= (input.staleMaxAgeMs ?? STALE_MAX_AGE_MS)) {
    return { state: 'stale', ageMs, reason: 'stale_sample' };
  }
  if (ageMs <= (input.lastKnownMaxAgeMs ?? LAST_KNOWN_MAX_AGE_MS)) {
    return { state: 'last-known', ageMs, reason: 'retained_last_known' };
  }
  return { state: 'no-data', ageMs, reason: 'missing_sample' };
}

export function getDeviceReconnectDelayMs(
  attempt: number,
  policy: DeviceReconnectPolicy = DEFAULT_DEVICE_RECONNECT_POLICY,
): number | null {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > policy.maxAttempts) return null;
  if (policy.delaysMs.length === 0) return null;
  return policy.delaysMs[Math.min(attempt - 1, policy.delaysMs.length - 1)] ?? null;
}

export function normalizeDeviceAdapterError(
  error: unknown,
  context: {
    phase: DeviceConnectionLifecycleState;
    providerId?: string | null;
    transport?: DeviceTransport;
  },
): DeviceAdapterError {
  const rawMessage = error instanceof Error ? error.message : String(error ?? 'Device operation failed.');
  const message = redactDeviceDiagnosticValue(rawMessage);
  const text = message.toLowerCase();
  let code: DeviceAdapterErrorCode = 'unknown';
  if (/permission|not granted|denied/.test(text)) code = 'permission_denied';
  else if (/cancelled|canceled|abort/.test(text)) code = 'cancelled';
  else if (/unsupported|not supported/.test(text)) code = 'unsupported';
  else if (/bad frame|invalid frame|decode|parser/.test(text)) code = 'bad_frame';
  else if (/auth|unauthorized|forbidden|credential/.test(text)) code = 'authentication_required';
  else if (/scan.*timeout|timeout.*scan/.test(text)) code = 'scan_timeout';
  else if (/timeout/.test(text)) code = 'connection_timeout';
  else if (/provider|cloud|service unavailable/.test(text)) code = 'provider_unavailable';
  else if (/bluetooth|ble|transport|radio/.test(text)) code = 'transport_unavailable';
  else if (/device.*offline|device.*unavailable|not found/.test(text)) code = 'device_unavailable';

  return {
    code,
    message,
    retryable: !['permission_denied', 'authentication_required', 'cancelled', 'unsupported', 'bad_frame'].includes(code),
    phase: context.phase,
    providerId: context.providerId ?? null,
    transport: context.transport ?? 'unknown',
  };
}

export function redactDeviceDiagnosticValue(value: unknown): string {
  return String(value ?? '')
    .replace(/\b(?:api[_-]?key|secret|token|password|authorization|bearer|service[_-]?role)\b\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\b(?:sk-[a-z0-9_-]{8,}|eyj[a-z0-9_-]{12,})\b/gi, '[REDACTED]')
    .replace(/\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi, '[DEVICE_ID]');
}

export function createDeviceAdapterTelemetryPayload<T>(input: {
  identity: CanonicalDeviceIdentity;
  transport: DeviceTransport;
  observedAt: number;
  receivedAt?: number;
  decodedFields: readonly string[];
  lifecycle: DeviceConnectionLifecycleState;
  cached?: boolean;
  unsupported?: boolean;
  data: T;
}): DeviceAdapterTelemetryPayload<T> {
  const receivedAt = input.receivedAt ?? Date.now();
  const source = resolveDeviceTelemetrySourceState({
    lifecycle: input.lifecycle,
    transport: input.transport,
    telemetryTransport: input.transport,
    hasDecodedData: input.decodedFields.length > 0,
    lastSampleAt: input.observedAt,
    now: receivedAt,
    cached: input.cached,
    unsupported: input.unsupported,
  });
  return {
    identity: input.identity,
    transport: input.transport,
    observedAt: input.observedAt,
    receivedAt,
    decodedFields: [...input.decodedFields],
    sourceState: source.state,
    data: input.data,
  };
}

export function validateDeviceTelemetryReplayFixture(value: unknown): DeviceTelemetryReplayValidation {
  const fixture = value && typeof value === 'object'
    ? value as Partial<DeviceTelemetryReplayFixture>
    : null;
  const errors: string[] = [];
  if (!fixture || fixture.schema !== 'ecs.device_telemetry.replay') errors.push('invalid_schema');
  if (fixture?.version !== 1) errors.push('unsupported_version');
  if (!fixture?.identity || typeof fixture.identity !== 'object') errors.push('missing_identity');
  if (!fixture?.transport || !['ble', 'classic_bluetooth', 'cloud', 'hybrid', 'wifi', 'gateway', 'stored', 'unknown'].includes(fixture.transport)) {
    errors.push('invalid_transport');
  }
  if (
    !fixture?.safety ||
    fixture.safety.providerSecretsIncluded !== false ||
    fixture.safety.rawPayloadIncluded !== false ||
    fixture.safety.preciseLocationIncluded !== false
  ) {
    errors.push('unsafe_fixture');
  }
  if (!Array.isArray(fixture?.samples) || fixture.samples.length === 0) {
    errors.push('missing_samples');
  } else if (fixture.samples.length > 500) {
    errors.push('sample_limit_exceeded');
  } else {
    fixture.samples.forEach((sample, index) => {
      if (!Number.isFinite(sample?.observedAt) || !Number.isFinite(sample?.receivedAt)) {
        errors.push(`invalid_timestamp:${index}`);
      }
      if (!DEVICE_CONNECTION_LIFECYCLE_STATES.includes(sample?.lifecycle)) {
        errors.push(`invalid_lifecycle:${index}`);
      }
      if (!Array.isArray(sample?.decodedFields) || !sample?.data || typeof sample.data !== 'object') {
        errors.push(`invalid_sample:${index}`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

export function replayDeviceTelemetryFixture(
  fixture: DeviceTelemetryReplayFixture,
): Array<DeviceAdapterTelemetryPayload<Record<string, unknown>>> {
  const validation = validateDeviceTelemetryReplayFixture(fixture);
  if (!validation.valid) {
    throw new Error(`Invalid device telemetry replay fixture: ${validation.errors.join(', ')}`);
  }
  const identity = createCanonicalDeviceIdentity(fixture.identity);
  return fixture.samples.map((sample) => createDeviceAdapterTelemetryPayload({
    identity,
    transport: fixture.transport,
    observedAt: sample.observedAt,
    receivedAt: sample.receivedAt,
    decodedFields: sample.decodedFields,
    lifecycle: sample.lifecycle,
    data: sample.data,
  }));
}

import { sanitizeAuthLogPayload } from './auth/authLogRedaction';

export type ClosedBetaDiagnosticsBuildInfo = {
  appName: string;
  packageId: string;
  versionName: string;
  versionCode: number | string;
  runtimeVersion?: string | null;
  buildProfile?: string | null;
  channel?: string | null;
  environment?: string | null;
};

export type ClosedBetaDiagnosticsBackendInfo = {
  supabaseProjectRef?: string | null;
  supabaseConfigured: boolean;
  mapboxConfigured: boolean;
};

export type ClosedBetaDiagnosticsDeviceInfo = {
  platform: string;
  osVersion?: string | null;
  model?: string | null;
};

export type ClosedBetaDiagnosticsReport = {
  generatedAt: string;
  featureArea: string;
  issueSummary: string | null;
  build: ClosedBetaDiagnosticsBuildInfo;
  backend: ClosedBetaDiagnosticsBackendInfo;
  device: ClosedBetaDiagnosticsDeviceInfo;
  state: Record<string, unknown>;
  recentEvents: Array<Record<string, unknown>>;
};

type ClosedBetaDiagnosticsInput = {
  generatedAt?: string;
  featureArea?: string | null;
  issueSummary?: string | null;
  build: ClosedBetaDiagnosticsBuildInfo;
  backend: ClosedBetaDiagnosticsBackendInfo;
  device?: Record<string, unknown> | null;
  state?: Record<string, unknown> | null;
  recentEvents?: Array<Record<string, unknown>> | null;
};

const REDACTED = '[redacted]';
const REDACTED_LOCATION = '[redacted_location]';
const REDACTED_CONVOY_HISTORY = '[redacted_convoy_location_history]';
const REDACTED_TELEMETRY_PAYLOAD = '[redacted_telemetry_payload]';
const COORDINATE_NUMBER_PATTERN = /\b-?\d{1,3}\.\d{4,}\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const MAPBOX_TOKEN_PATTERN = /\b(?:pk|sk)\.[A-Za-z0-9._-]{8,}\b/g;
const LONG_HEX_PATTERN = /\b[0-9a-f]{24,}\b/gi;

function normalizeKey(key: string): string {
  return key.replace(/[_\-\s]/g, '').toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    normalized.includes('token')
    || normalized.includes('secret')
    || normalized.includes('password')
    || normalized.includes('authorization')
    || normalized.includes('jwt')
    || normalized.includes('apikey')
    || normalized.includes('servicerole')
    || normalized.includes('credential')
    || normalized === 'auth'
    || normalized === 'authstate'
    || normalized === 'session'
    || normalized === 'rawauth'
    || normalized === 'rawauthjson'
    || normalized === 'deviceid'
    || normalized === 'serial'
    || normalized === 'serialnumber'
    || normalized.endsWith('serial')
  );
}

function isConvoyHistoryKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return normalized.includes('convoylocationhistory') || normalized.includes('locationhistory');
}

function isTelemetryPayloadKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    normalized.includes('rawble')
    || normalized.includes('blepayload')
    || normalized.includes('rawpayload')
    || normalized.includes('advertisementpayload')
    || normalized.includes('manufacturerdata')
  );
}

function hasCoordinateKeys(value: Record<string, unknown>): boolean {
  const keys = new Set(Object.keys(value).map(normalizeKey));
  return (
    (keys.has('latitude') && keys.has('longitude'))
    || (keys.has('lat') && (keys.has('lon') || keys.has('lng')))
    || (keys.has('coords') && (keys.has('timestamp') || keys.has('accuracy')))
  );
}

function sanitizeString(value: string): string {
  const authRedacted = sanitizeAuthLogPayload(value) as string;
  return authRedacted
    .replace(JWT_PATTERN, REDACTED)
    .replace(MAPBOX_TOKEN_PATTERN, REDACTED)
    .replace(COORDINATE_NUMBER_PATTERN, REDACTED_LOCATION)
    .replace(LONG_HEX_PATTERN, REDACTED);
}

function sanitizeObject(value: Record<string, unknown>, depth: number): Record<string, unknown> | string {
  if (hasCoordinateKeys(value)) return REDACTED_LOCATION;

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = item == null ? item : REDACTED;
    } else if (isConvoyHistoryKey(key)) {
      sanitized[key] = item == null ? item : REDACTED_CONVOY_HISTORY;
    } else if (isTelemetryPayloadKey(key)) {
      sanitized[key] = item == null ? item : REDACTED_TELEMETRY_PAYLOAD;
    } else {
      sanitized[key] = sanitizeClosedBetaDiagnosticsPayload(item, depth + 1);
    }
  }
  return sanitized;
}

export function sanitizeClosedBetaDiagnosticsPayload<T = unknown>(payload: T, depth = 0): T {
  if (payload == null || depth > 8) return payload;
  if (typeof payload === 'string') return sanitizeString(payload) as T;
  if (typeof payload === 'number' || typeof payload === 'boolean') return payload;
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeClosedBetaDiagnosticsPayload(item, depth + 1)) as T;
  }
  if (typeof payload === 'object') {
    return sanitizeObject(payload as Record<string, unknown>, depth) as T;
  }
  return String(payload) as T;
}

function cleanString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? sanitizeString(trimmed) : fallback;
}

function cleanOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? sanitizeString(trimmed) : null;
}

function cleanBoolean(value: unknown): boolean {
  return value === true;
}

export function buildClosedBetaDiagnosticsReport(input: ClosedBetaDiagnosticsInput): ClosedBetaDiagnosticsReport {
  const deviceInput = input.device ?? {};
  return {
    generatedAt: cleanString(input.generatedAt, new Date().toISOString()),
    featureArea: cleanString(input.featureArea, 'Unknown'),
    issueSummary: cleanOptionalString(input.issueSummary),
    build: {
      appName: cleanString(input.build.appName, 'Expedition Command System'),
      packageId: cleanString(input.build.packageId, 'unknown'),
      versionName: cleanString(input.build.versionName, 'unknown'),
      versionCode: input.build.versionCode,
      runtimeVersion: cleanOptionalString(input.build.runtimeVersion),
      buildProfile: cleanOptionalString(input.build.buildProfile),
      channel: cleanOptionalString(input.build.channel),
      environment: cleanOptionalString(input.build.environment),
    },
    backend: {
      supabaseProjectRef: cleanOptionalString(input.backend.supabaseProjectRef),
      supabaseConfigured: cleanBoolean(input.backend.supabaseConfigured),
      mapboxConfigured: cleanBoolean(input.backend.mapboxConfigured),
    },
    device: {
      platform: cleanString(deviceInput.platform, 'unknown'),
      osVersion: cleanOptionalString(deviceInput.osVersion),
      model: cleanOptionalString(deviceInput.model),
    },
    state: sanitizeClosedBetaDiagnosticsPayload(input.state ?? {}),
    recentEvents: (input.recentEvents ?? [])
      .slice(-20)
      .map((event) => sanitizeClosedBetaDiagnosticsPayload(event)),
  };
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}

function valueOrUnknown(value: unknown): string {
  if (value == null || value === '') return 'unknown';
  return String(value);
}

export function formatClosedBetaDiagnosticsReport(report: ClosedBetaDiagnosticsReport): string {
  const lines = [
    'ECS Closed Beta Diagnostics',
    `generatedAt: ${report.generatedAt}`,
    `featureArea: ${report.featureArea}`,
    `issueSummary: ${valueOrUnknown(report.issueSummary)}`,
    '',
    'Build',
    `appName: ${report.build.appName}`,
    `packageId: ${report.build.packageId}`,
    `versionName: ${report.build.versionName}`,
    `versionCode: ${report.build.versionCode}`,
    `runtimeVersion: ${valueOrUnknown(report.build.runtimeVersion)}`,
    `buildProfile: ${valueOrUnknown(report.build.buildProfile)}`,
    `channel: ${valueOrUnknown(report.build.channel)}`,
    `environment: ${valueOrUnknown(report.build.environment)}`,
    '',
    'Backend',
    `backendProject: ${valueOrUnknown(report.backend.supabaseProjectRef)}`,
    `supabaseConfigured: ${yesNo(report.backend.supabaseConfigured)}`,
    `mapboxConfigured: ${yesNo(report.backend.mapboxConfigured)}`,
    '',
    'Device',
    `platform: ${report.device.platform}`,
    `osVersion: ${valueOrUnknown(report.device.osVersion)}`,
    `model: ${valueOrUnknown(report.device.model)}`,
    '',
    'State',
    ...Object.entries(report.state).map(([key, value]) => `${key}: ${valueOrUnknown(value)}`),
    '',
    'Recent Events',
    ...(report.recentEvents.length
      ? report.recentEvents.map((event, index) => `${index + 1}. ${JSON.stringify(event)}`)
      : ['none']),
  ];

  return lines.join('\n');
}

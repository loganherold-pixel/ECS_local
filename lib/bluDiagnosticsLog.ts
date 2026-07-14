import { BLU_DEBUG_LOG_THROTTLE_MS } from './bluPerformanceConfig';
import { ecsLog } from './ecsLogger';
import {
  sanitizeECSDiagnosticValue,
  type ECSDiagnosticValue,
} from './observability/ecsDiagnosticRedaction';

export type BluLogPrefix =
  | '[BLU_SCAN]'
  | '[BLU_CLASSIFY]'
  | '[BLU_CONNECT]'
  | '[BLU_HANDSHAKE]'
  | '[BLU_STREAM]'
  | '[BLU_TELEMETRY]'
  | '[BLU_TIMEOUT]'
  | '[BLU_RECONNECT]'
  | '[BLU_DISCONNECT]'
  | '[BLU_VENDOR]'
  | '[BLU_ECOFLOW]'
  | '[BLU_BLUETTI]'
  | '[BLU_ANKER]'
  | '[BLU_GOALZERO]'
  | '[BLU_OBD2]';

type Jsonish = ECSDiagnosticValue;

export interface BluDiscoveryLogInput {
  id?: string | null;
  name?: string | null;
  localName?: string | null;
  manufacturerData?: unknown;
  manufacturerDataPresent?: boolean | null;
  serviceUUIDs?: unknown;
  serviceUuids?: unknown;
  advertisedServiceUuids?: unknown;
  rssi?: number | null;
  classifiedVendor?: string | null;
  classifiedType?: string | null;
  confidence?: number | string | null;
}

export interface BluConnectionAttemptLogInput {
  deviceId?: string | null;
  vendor?: string | null;
  deviceType?: string | null;
  connectionMode?: string | null;
  startedAt?: number | string | null;
  timeoutMs?: number | null;
  attempt?: number | null;
  [key: string]: unknown;
}

export interface BluTimeoutLogInput {
  deviceId?: string | null;
  vendor?: string | null;
  phase?: string | null;
  timeoutMs?: number | null;
  lastSuccessfulPhase?: string | null;
  lastPacketAt?: number | string | null;
  errorCode?: string | null;
  message?: string | null;
  [key: string]: unknown;
}

export interface BluTelemetryLogInput {
  deviceId?: string | null;
  vendor?: string | null;
  telemetry?: unknown;
  telemetryKeys?: string[] | null;
  packetAt?: number | string | null;
  lastPacketAt?: number | string | null;
  now?: number;
  streamMode?: string | null;
  [key: string]: unknown;
}

const SENSITIVE_KEY_PATTERN =
  /token|secret|api[_-]?key|access[_-]?key|refresh|authorization|auth[_-]?header|password|email|signature|headers?/i;
const DEFAULT_THROTTLE_MS = BLU_DEBUG_LOG_THROTTLE_MS;

const throttleState = new Map<string, {
  lastEmittedAt: number;
  suppressedCount: number;
  lastDetails?: unknown;
}>();

function readProcessEnvValue(key: string): string | undefined {
  try {
    return (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
  } catch {
    return undefined;
  }
}

function readGlobalValue(key: string): unknown {
  try {
    return (globalThis as unknown as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function isTruthyDebugValue(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isDevRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

export const BLU_DEBUG =
  isDevRuntime() ||
  isTruthyDebugValue(readGlobalValue('__ECS_BLU_DEBUG__')) ||
  isTruthyDebugValue(readProcessEnvValue('ECS_BLU_DEBUG')) ||
  isTruthyDebugValue(readProcessEnvValue('EXPO_PUBLIC_ECS_BLU_DEBUG')) ||
  isTruthyDebugValue(readProcessEnvValue('EXPO_PUBLIC_ECS_DEBUG_BLU_SCAN'));

export function isBluDebugEnabled(): boolean {
  return BLU_DEBUG ||
    isTruthyDebugValue(readGlobalValue('__ECS_BLU_DEBUG__')) ||
    isTruthyDebugValue(readProcessEnvValue('ECS_BLU_DEBUG')) ||
    isTruthyDebugValue(readProcessEnvValue('EXPO_PUBLIC_ECS_BLU_DEBUG')) ||
    isTruthyDebugValue(readProcessEnvValue('EXPO_PUBLIC_ECS_DEBUG_BLU_SCAN'));
}

export function sanitizeBluLogValue(value: unknown, keyHint?: string, depth = 0): Jsonish {
  const wrapped = keyHint ? { [keyHint]: value } : value;
  const sanitized = sanitizeECSDiagnosticValue(wrapped, {
    maxDepth: Math.max(1, 5 - depth),
    maxArrayLength: 50,
    maxObjectKeys: 80,
    maxStringLength: 500,
  }) as Jsonish;
  if (!keyHint || !sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return sanitized;
  }
  return (sanitized as Record<string, Jsonish>)[keyHint] ?? null;
}

function normalizeDetails(details?: Record<string, unknown> | null): Record<string, Jsonish> | undefined {
  if (!details) return undefined;
  const sanitized = sanitizeBluLogValue(details);
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ? sanitized as Record<string, Jsonish>
    : undefined;
}

function safeConsoleLog(prefix: BluLogPrefix, message: string, details?: Record<string, unknown> | null): void {
  const sanitized = normalizeDetails(details);
  const lifecyclePrefix = /\[BLU_(CONNECT|HANDSHAKE|TIMEOUT|RECONNECT|DISCONNECT)\]/.test(prefix);
  const lifecycleMessage = /(connect|disconnect|handshake|stream|timeout|failed|success|ready|no_telemetry)/i.test(message);
  if (lifecyclePrefix && lifecycleMessage) {
    const failed = prefix === '[BLU_TIMEOUT]' || /(failed|timeout|error|no_telemetry)/i.test(message);
    ecsLog.breadcrumb({
      domain: 'device',
      operation: prefix.slice(5, -1).toLowerCase(),
      code: `DEVICE_${prefix.slice(5, -1)}_${message}`,
      status: failed ? 'degraded' : /(disconnect)/i.test(message) ? 'cancelled' : 'completed',
      sourceState: failed || /(disconnect)/i.test(message) ? 'unavailable' : 'live',
      context: sanitized,
    });
    if (prefix === '[BLU_TIMEOUT]') {
      ecsLog.captureFailure({
        kind: 'native_hardware',
        domain: 'device',
        operation: 'connection_timeout',
        code: 'DEVICE_CONNECTION_TIMEOUT',
        sourceState: 'unavailable',
        context: sanitized,
      }, undefined, {
        category: 'DEVICE',
        fingerprint: `${prefix}:${message}`,
      });
    }
  }
  ecsLog.dev('DEVICE', message, sanitized, {
    tag: prefix,
    debugFlag: 'ECS_BLU_DEBUG',
    fingerprint: `${prefix}:${message}`,
    throttleMs: DEFAULT_THROTTLE_MS,
    aggregateWindowMs: 10_000,
  });
}

export function bluLog(
  prefix: BluLogPrefix,
  message: string,
  details?: Record<string, unknown> | null,
): void {
  if (!isBluDebugEnabled()) return;
  safeConsoleLog(prefix, message, details);
}

export function bluLogThrottled(
  prefix: BluLogPrefix,
  key: string,
  message: string,
  details?: Record<string, unknown> | null,
  throttleMs: number = DEFAULT_THROTTLE_MS,
): void {
  if (!isBluDebugEnabled()) return;
  const now = Date.now();
  const stateKey = `${prefix}:${key}:${message}`;
  const state = throttleState.get(stateKey);
  if (state && now - state.lastEmittedAt < throttleMs) {
    state.suppressedCount += 1;
    state.lastDetails = details;
    return;
  }

  if (state?.suppressedCount) {
    safeConsoleLog(prefix, `${message} repeated ${state.suppressedCount}x`, state.lastDetails as Record<string, unknown> | undefined);
  }

  safeConsoleLog(prefix, message, details);
  throttleState.set(stateKey, {
    lastEmittedAt: now,
    suppressedCount: 0,
    lastDetails: details,
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((entry) => typeof entry === 'string' ? entry.trim() : '')
      .filter(Boolean),
  ));
}

function normalizeLogText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeLogNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

export function buildBluDiscoveryLogDetails(input: BluDiscoveryLogInput): Record<string, unknown> {
  const serviceUUIDs = normalizeStringArray(
    input.serviceUUIDs ?? input.serviceUuids ?? input.advertisedServiceUuids,
  );
  const manufacturerDataPresent =
    input.manufacturerDataPresent === true ||
    (typeof input.manufacturerData === 'string' && input.manufacturerData.length > 0) ||
    (input.manufacturerData != null && typeof input.manufacturerData === 'object');

  return {
    id: normalizeLogText(input.id) ?? 'unknown',
    name: normalizeLogText(input.name),
    localName: normalizeLogText(input.localName),
    manufacturerDataPresent,
    serviceUUIDs,
    rssi: normalizeLogNumber(input.rssi),
    classifiedVendor: normalizeLogText(input.classifiedVendor) ?? 'unknown',
    classifiedType: normalizeLogText(input.classifiedType) ?? 'unknown',
    confidence: typeof input.confidence === 'number' && Number.isFinite(input.confidence)
      ? input.confidence
      : normalizeLogText(input.confidence) ?? 0,
  };
}

export function buildBluConnectionAttemptLogDetails(
  input: BluConnectionAttemptLogInput,
): Record<string, unknown> {
  return {
    ...input,
    deviceId: normalizeLogText(input.deviceId) ?? 'unknown',
    vendor: normalizeLogText(input.vendor) ?? 'unknown',
    deviceType: normalizeLogText(input.deviceType) ?? 'unknown',
    connectionMode: normalizeLogText(input.connectionMode) ?? 'unknown',
    startedAt: input.startedAt ?? Date.now(),
    timeoutMs: normalizeLogNumber(input.timeoutMs),
    attempt: normalizeLogNumber(input.attempt) ?? 1,
  };
}

export function buildBluTimeoutLogDetails(input: BluTimeoutLogInput): Record<string, unknown> {
  return {
    ...input,
    deviceId: normalizeLogText(input.deviceId) ?? 'unknown',
    vendor: normalizeLogText(input.vendor) ?? 'unknown',
    phase: normalizeLogText(input.phase) ?? 'unknown',
    timeoutMs: normalizeLogNumber(input.timeoutMs),
    lastSuccessfulPhase: normalizeLogText(input.lastSuccessfulPhase),
    lastPacketAt: input.lastPacketAt ?? null,
    errorCode: normalizeLogText(input.errorCode),
    message: normalizeLogText(input.message),
  };
}

function collectTelemetryKeys(value: unknown, prefix = '', keys: string[] = [], depth = 0): string[] {
  if (keys.length >= 60) return keys;
  if (!value || typeof value !== 'object' || depth > 3) return keys;
  const source = value as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    if (keys.length >= 60) break;
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (key === 'raw' && depth >= 1) continue;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const entry = source[key];
    if (entry == null) continue;
    if (Array.isArray(entry)) {
      if (entry.length > 0) keys.push(fullKey);
      continue;
    }
    if (typeof entry === 'object') {
      collectTelemetryKeys(entry, fullKey, keys, depth + 1);
      continue;
    }
    keys.push(fullKey);
  }

  return keys;
}

function hasKeyMatch(keys: string[], pattern: RegExp): boolean {
  return keys.some((key) => pattern.test(key));
}

function resolvePacketAgeMs(packetAt: unknown, now: number): number | null {
  if (typeof packetAt === 'number' && Number.isFinite(packetAt)) {
    return Math.max(0, now - packetAt);
  }
  if (typeof packetAt === 'string' && packetAt.trim()) {
    const parsed = Date.parse(packetAt);
    if (Number.isFinite(parsed)) return Math.max(0, now - parsed);
  }
  return null;
}

export function buildBluTelemetryLogDetails(input: BluTelemetryLogInput): Record<string, unknown> {
  const now = input.now ?? Date.now();
  const telemetryKeys = Array.from(new Set(
    (input.telemetryKeys && input.telemetryKeys.length > 0
      ? input.telemetryKeys
      : collectTelemetryKeys(input.telemetry))
      .filter((key) => typeof key === 'string' && key.length > 0)
      .slice(0, 60),
  ));
  const measuredTelemetryKeys = telemetryKeys.filter((key) => !key.startsWith('capabilities.'));
  const packetAt = input.packetAt ?? input.lastPacketAt ?? (
    input.telemetry && typeof input.telemetry === 'object'
      ? (input.telemetry as Record<string, unknown>).timestamp ??
        (input.telemetry as Record<string, unknown>).updatedAt ??
        (input.telemetry as Record<string, unknown>).lastUpdated ??
        null
      : null
  );

  return {
    ...input,
    telemetry: undefined,
    deviceId: normalizeLogText(input.deviceId) ?? 'unknown',
    vendor: normalizeLogText(input.vendor) ?? 'unknown',
    telemetryKeys,
    hasVoltage: hasKeyMatch(measuredTelemetryKeys, /volt|voltage|battery_voltage/i),
    hasWatts: hasKeyMatch(measuredTelemetryKeys, /watt|watts|power|wattsIn|wattsOut/i),
    hasBatteryPercent: hasKeyMatch(measuredTelemetryKeys, /battery.*percent|battery_percent|soc|socPct|stateOfCharge/i),
    hasTemperature: hasKeyMatch(measuredTelemetryKeys, /temp|temperature|coolant|intake/i),
    hasObdPid: hasKeyMatch(measuredTelemetryKeys, /obd2_values|pid|engine_rpm|vehicle_speed|coolant_temp|fuel_level|battery_voltage/i),
    packetAgeMs: resolvePacketAgeMs(packetAt, now),
    streamMode: normalizeLogText(input.streamMode) ?? 'unknown',
  };
}

export function getBluVendorPrefix(vendor: unknown): BluLogPrefix {
  const normalized = String(vendor ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized.includes('ecoflow')) return '[BLU_ECOFLOW]';
  if (normalized.includes('bluetti')) return '[BLU_BLUETTI]';
  if (normalized.includes('anker') || normalized.includes('solix')) return '[BLU_ANKER]';
  if (normalized.includes('goal_zero') || normalized.includes('goalzero')) return '[BLU_GOALZERO]';
  if (normalized.includes('obd') || normalized.includes('elm') || normalized.includes('veepeak')) return '[BLU_OBD2]';
  return '[BLU_VENDOR]';
}

export function inferBluClassificationConfidence(input: {
  supportLevel?: string | null;
  isLikelyOBD?: boolean | null;
  connectionType?: string | null;
  source?: string | null;
  providerId?: string | null;
}): number {
  if (input.isLikelyOBD) return 0.95;
  if (input.supportLevel === 'verified' || input.supportLevel === 'telemetry') return 0.9;
  if (input.supportLevel === 'implemented_unverified') return 0.7;
  if (input.supportLevel === 'partial') return 0.55;
  if (input.providerId && input.providerId !== 'unknown_power') return 0.5;
  if (input.connectionType === 'api' || input.source === 'api') return 0.75;
  return 0.25;
}

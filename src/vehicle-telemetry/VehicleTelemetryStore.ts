/**
 * ═══════════════════════════════════════════════════════════
 * ECS VEHICLE TELEMETRY STATE STORE — Live Connection Pass
 * ═══════════════════════════════════════════════════════════
 *
 * Central state store for vehicle telemetry data.
 *
 * Responsibilities:
 *   - Stores the latest normalized telemetry reading
 *   - Computes and caches the telemetry summary for widgets
 *   - Persists last known telemetry for offline/restart recovery
 *   - Provides subscription-based reactivity for UI updates
 *   - Derives engine status from telemetry signals
 *   - Reacts cleanly to live telemetry service lifecycle changes
 *
 * Live connection pass adds:
 *   - Service attach / detach lifecycle
 *   - Explicit connection transition handlers
 *   - Reconnect-aware freshness state transitions
 *   - Last-known retention during reconnect / drop conditions
 *   - ECS bridge helper for Navigate / HUD / Mission Brief consumers
 *   - Defensive compatibility with varied VehicleTelemetryService shapes
 */

import { Platform } from 'react-native';
import type {
  NormalizedVehicleTelemetry,
  VehicleTelemetrySummary,
  VehicleTelemetryConnectionState,
  VehicleTelemetrySnapshot,
  VehicleTelemetrySource,
  EngineStatus,
  TelemetryFreshnessLabel,
} from './VehicleTelemetryTypes';
import { EMPTY_TELEMETRY, EMPTY_SUMMARY, EMPTY_VEHICLE_TELEMETRY_SNAPSHOT, VT_STORAGE_KEYS } from './VehicleTelemetryTypes';
import { vehicleTelemetryDeviceRegistry } from './VehicleTelemetryDeviceRegistry';
import { ecsLog } from '../../lib/ecsLogger';
import { ecsTelemetryStore } from '../telemetry/ECSTelemetryStore';
import { vehicleTelemetryToEcsTelemetryEvents } from '../telemetry/telemetryAdapters';

// ── Phase 15: Stability Guards ──────────────────────────────
import {
  calculateBackoff,
  MAX_TELEMETRY_RETRIES,
  RETRY_COOLDOWN_MS,
  stabilityLog,
} from '../../lib/ecsStabilityGuards';

const TAG = '[VT-Store]';

// ── Retry state tracking ────────────────────────────────────
let _retryCount = 0;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _lastRetryAt = 0;

// ── Grace window constants ──────────────────────────────────
const FRESH_WINDOW_MS = 30_000;     // 30 seconds
const GRACE_WINDOW_MS = 90_000;     // 90 seconds
const LAST_KNOWN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

type StoreListener = () => void;

type MaybeDisposer = undefined | null | (() => void) | { remove?: () => void; unsubscribe?: () => void };

type TelemetryServiceLike = {
  connect?: () => void | Promise<void>;
  reconnect?: () => void | Promise<void>;
  disconnect?: () => void | Promise<void>;
  getConnectionState?: () => VehicleTelemetryConnectionState | string | null | undefined;
  subscribe?: (
    event: string,
    cb: (...args: any[]) => void
  ) => MaybeDisposer;
  on?: (
    event: string,
    cb: (...args: any[]) => void
  ) => MaybeDisposer;
  addListener?: (
    event: string,
    cb: (...args: any[]) => void
  ) => MaybeDisposer;
  removeListener?: (event: string, cb: (...args: any[]) => void) => void;
  off?: (event: string, cb: (...args: any[]) => void) => void;
};

type ECSVehicleTelemetryState = {
  connectionState: VehicleTelemetryConnectionState | 'reconnecting';
  freshnessLabel: TelemetryFreshnessLabel;
  isFresh: boolean;
  isStale: boolean;
  isWithinGraceWindow: boolean;
  isShowingLastKnown: boolean;
  isConnected: boolean;
  isReconnecting: boolean;
  hasData: boolean;
  lastUpdated: string | null;
  freshnessText: string;
  telemetry: NormalizedVehicleTelemetry;
  summary: VehicleTelemetrySummary;
  snapshot: VehicleTelemetrySnapshot;
};

const VEHICLE_TELEMETRY_UNSUPPORTED_REASON = 'Connected — telemetry not yet decoded';

function toEcsFreshness(
  label: TelemetryFreshnessLabel,
  hasDecodedData: boolean,
): VehicleTelemetrySnapshot['freshness'] {
  if (!hasDecodedData) {
    return label === 'disconnected' ? 'offline' : 'unknown';
  }
  if (label === 'live') return 'live';
  if (label === 'last_known' || label === 'reconnecting') return 'recent';
  if (label === 'stale') return 'stale';
  if (label === 'disconnected') return 'offline';
  return 'unknown';
}

function sourceLabelFor(sourceType: VehicleTelemetrySnapshot['sourceType']): string {
  switch (sourceType) {
    case 'obd_live':
      return 'Live OBD';
    case 'ble_live':
      return 'Live Bluetooth';
    case 'device_sensor':
      return 'Device sensor';
    case 'blu_power_live':
      return 'Live BLU power';
    case 'manual':
      return 'Manual';
    case 'cached':
      return 'Last known';
    case 'simulated':
      return 'Simulated';
    case 'unavailable':
    default:
      return 'Unavailable';
  }
}

function confidenceFor(
  sourceType: VehicleTelemetrySnapshot['sourceType'],
  freshness: VehicleTelemetrySnapshot['freshness'],
): VehicleTelemetrySnapshot['confidence'] {
  if (sourceType === 'unavailable') return 'unverified';
  if (sourceType === 'simulated') return 'unverified';
  if (sourceType === 'manual') return 'low';
  if (freshness === 'stale') return 'low';
  if (freshness === 'recent') return 'medium';
  if (freshness === 'live') return 'high';
  return 'unverified';
}

function isFiniteMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeTireTelemetryValues(value: unknown): [number | null, number | null, number | null, number | null] | null {
  if (!Array.isArray(value)) return null;
  const values = [0, 1, 2, 3].map((index) => {
    const numeric = Number(value[index]);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }) as [number | null, number | null, number | null, number | null];
  return values.some((entry) => entry != null) ? values : null;
}

function readEnvFlag(name: string): string | null {
  try {
    const value = typeof process !== 'undefined' ? process.env?.[name] : undefined;
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

function isDevMockTelemetryAllowed(): boolean {
  const envValue = readEnvFlag('EXPO_PUBLIC_ECS_ENABLE_MOCK_BLUETOOTH');
  if (envValue) return /^(1|true|yes|on)$/i.test(envValue.trim());
  try {
    return (globalThis as { __ECS_ENABLE_MOCK_BLUETOOTH__?: boolean }).__ECS_ENABLE_MOCK_BLUETOOTH__ === true;
  } catch {
    return false;
  }
}

function inferTelemetryInputSource(telemetry: NormalizedVehicleTelemetry): VehicleTelemetrySource | null {
  const rawSource = (telemetry as NormalizedVehicleTelemetry & { source?: unknown; raw?: Record<string, unknown> | null }).source;
  if (
    rawSource === 'bluetooth_obd_live' ||
    rawSource === 'native_vehicle_live' ||
    rawSource === 'manual' ||
    rawSource === 'cache' ||
    rawSource === 'unavailable' ||
    rawSource === 'mock_dev'
  ) {
    return rawSource;
  }

  const raw = (telemetry as NormalizedVehicleTelemetry & { raw?: Record<string, unknown> | null }).raw ?? null;
  const deviceId = String(telemetry.device_id ?? '').toLowerCase();
  if (deviceId.includes('sim') || raw?.mock === true || raw?.demo === true || raw?.simulated === true) {
    return 'mock_dev';
  }

  return null;
}

function getDecodedTelemetryFields(telemetry: NormalizedVehicleTelemetry): string[] {
  const fields: [keyof NormalizedVehicleTelemetry, string][] = [
    ['vehicle_speed', 'speedMph'],
    ['engine_rpm', 'rpm'],
    ['coolant_temp', 'coolantTempF'],
    ['battery_voltage', 'batteryVoltage'],
    ['fuel_level', 'fuelPercent'],
    ['engine_load', 'engineLoadPercent'],
    ['intake_temp', 'intakeTempF'],
    ['throttle_position', 'throttlePercent'],
  ];

  const decoded = fields
    .filter(([key]) => isFiniteMetric(telemetry[key]))
    .map(([, label]) => label);
  if (normalizeTireTelemetryValues(telemetry.tire_pressures)) decoded.push('tirePressuresPsi');
  return decoded;
}

function buildVehicleTelemetrySnapshotSignature(snapshot: VehicleTelemetrySnapshot): string {
  const warningsSignature = snapshot.warnings
    .map((warning) => `${warning.id}:${warning.severity}:${warning.message}`)
    .join(',');
  return [
    snapshot.sourceType,
    snapshot.sourceLabel,
    snapshot.freshness,
    snapshot.confidence,
    snapshot.updatedAt ?? '',
    snapshot.source,
    snapshot.isLive ? '1' : '0',
    snapshot.deviceId ?? '',
    snapshot.speedMph ?? '',
    snapshot.rpm ?? '',
    snapshot.coolantTempF ?? '',
    snapshot.intakeTempF ?? '',
    snapshot.engineLoadPct ?? '',
    snapshot.throttlePct ?? '',
    snapshot.batteryVoltage ?? '',
    snapshot.fuelLevelPct ?? '',
    snapshot.rangeMiles ?? '',
    snapshot.oilTempF ?? '',
    snapshot.transmissionTempF ?? '',
    snapshot.tirePressuresPsi?.join(',') ?? '',
    snapshot.tireTempsF?.join(',') ?? '',
    snapshot.pitchDeg ?? '',
    snapshot.rollDeg ?? '',
    snapshot.headingDeg ?? '',
    snapshot.unsupportedReason ?? '',
    warningsSignature,
  ].join('|');
}

function scheduleRetry(connectFn: () => void): void {
  if (_retryCount >= MAX_TELEMETRY_RETRIES) {
    stabilityLog('Telemetry', 'warn', `Max retries (${MAX_TELEMETRY_RETRIES}) reached — stopping reconnect`);
    _retryCount = 0;
    return;
  }

  const now = Date.now();
  if (now - _lastRetryAt < RETRY_COOLDOWN_MS) {
    stabilityLog('Telemetry', 'info', 'Retry cooldown active — skipping');
    return;
  }

  const delay = calculateBackoff(_retryCount);
  stabilityLog('Telemetry', 'info', `Scheduling retry ${_retryCount + 1}/${MAX_TELEMETRY_RETRIES} in ${delay}ms`);

  if (_retryTimer) clearTimeout(_retryTimer);

  _retryTimer = setTimeout(() => {
    _lastRetryAt = Date.now();
    _retryCount += 1;

    try {
      connectFn();
    } catch (error) {
      stabilityLog('Telemetry', 'error', 'Retry connection failed', error);
      scheduleRetry(connectFn);
    }
  }, delay);
}

function resetRetryState(): void {
  _retryCount = 0;
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
  _lastRetryAt = 0;
}

function cancelRetries(): void {
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
  stabilityLog('Telemetry', 'info', 'Pending retries cancelled');
}

// ── Storage helpers ─────────────────────────────────────────
const mem: Record<string, string> = {};

function sGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return mem[key] || null;
  } catch {
    return mem[key] || null;
  }
}

function sSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    mem[key] = value;
  } catch {
    mem[key] = value;
  }
}

function sRemove(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    delete mem[key];
  } catch {
    delete mem[key];
  }
}

// ═══════════════════════════════════════════════════════════
// ENGINE STATUS DERIVATION
// ═══════════════════════════════════════════════════════════

function deriveEngineStatus(telemetry: NormalizedVehicleTelemetry): EngineStatus {
  if (telemetry.engine_rpm != null) {
    if (telemetry.engine_rpm === 0) return 'off';
    if (telemetry.engine_rpm < 900) return 'idle';
    return 'running';
  }

  if (telemetry.vehicle_speed != null) {
    if (telemetry.vehicle_speed > 2) return 'running';
  }

  if (telemetry.engine_load != null) {
    if (telemetry.engine_load > 0) return 'running';
    return 'idle';
  }

  if (telemetry.battery_voltage != null) {
    if (telemetry.battery_voltage > 13.5) return 'running';
    if (telemetry.battery_voltage > 11.5) return 'off';
    return 'off';
  }

  return 'unknown';
}

// ═══════════════════════════════════════════════════════════
// VEHICLE TELEMETRY STORE
// ═══════════════════════════════════════════════════════════

class VehicleTelemetryStore {
  private latestTelemetry: NormalizedVehicleTelemetry = { ...EMPTY_TELEMETRY };
  private summary: VehicleTelemetrySummary = { ...EMPTY_SUMMARY };
  private snapshot: VehicleTelemetrySnapshot = { ...EMPTY_VEHICLE_TELEMETRY_SNAPSHOT };
  private snapshotSignature = buildVehicleTelemetrySnapshotSignature(this.snapshot);
  private listeners: StoreListener[] = [];
  private initialized = false;

  private isReconnecting = false;
  private staleTransitionTimer: ReturnType<typeof setTimeout> | null = null;

  private attachedService: TelemetryServiceLike | null = null;
  private serviceUnsubscribers: (() => void)[] = [];
  private lastConnectionState: VehicleTelemetryConnectionState = 'disconnected';
  private restoredFromPersistence = false;
  private lastLoggedSnapshotSource: VehicleTelemetrySource | null = null;

  constructor() {
    this.restoreLastKnown();
  }

  // ── Persistence ─────────────────────────────────────────

  private restoreLastKnown(): void {
    try {
      const raw = sGet(VT_STORAGE_KEYS.LAST_TELEMETRY);
      if (raw) {
        const parsed = JSON.parse(raw) as NormalizedVehicleTelemetry;
        if (inferTelemetryInputSource(parsed) === 'mock_dev' && !isDevMockTelemetryAllowed()) {
          ecsLog.warn('TELEMETRY', '[VEHICLE_TELEMETRY] mock_blocked', {
            deviceId: parsed?.device_id ?? null,
            provider: parsed?.provider ?? null,
            source: 'persisted_cache',
          });
          sRemove(VT_STORAGE_KEYS.LAST_TELEMETRY);
          this.initialized = true;
          return;
        }
        const timestamp = Number(parsed?.timestamp ?? 0);
        const age = Date.now() - timestamp;

        if (timestamp > 0 && age < LAST_KNOWN_MAX_AGE_MS) {
          this.latestTelemetry = parsed;
          this.restoredFromPersistence = true;
          this.recomputeSummary();
          this.scheduleStaleTransition();
          ecsLog.debug('TELEMETRY', `${TAG} Restored last known telemetry`);
          ecsLog.debug('TELEMETRY', '[VEHICLE_TELEMETRY] cache_used', {
            updatedAt: new Date(timestamp).toISOString(),
          });
        } else {
          ecsLog.debug('TELEMETRY', `${TAG} Last known telemetry too old — discarded`);
          sRemove(VT_STORAGE_KEYS.LAST_TELEMETRY);
        }
      }
    } catch (error) {
      ecsLog.warn('TELEMETRY', `${TAG} Failed to restore telemetry`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.initialized = true;
  }

  private persistLatest(): void {
    try {
      if (Number(this.latestTelemetry?.timestamp ?? 0) > 0) {
        sSet(VT_STORAGE_KEYS.LAST_TELEMETRY, JSON.stringify(this.latestTelemetry));
      }
    } catch (error) {
      ecsLog.warn('TELEMETRY', `${TAG} Failed to persist telemetry`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ── Summary Computation ─────────────────────────────────

  private resolveConnectionState(): VehicleTelemetryConnectionState {
    const serviceState = this.safeGetServiceConnectionState();
    if (serviceState) return serviceState;

    const primary = vehicleTelemetryDeviceRegistry.getPrimary();
    if (primary?.connection_state) return primary.connection_state;

    return this.lastConnectionState || 'disconnected';
  }

  private recomputeSummary(): void {
    const t = this.latestTelemetry;
    const primary = vehicleTelemetryDeviceRegistry.getPrimary();
    const connectionState = this.resolveConnectionState();

    const hasAnyData =
      Number(t?.timestamp ?? 0) > 0 &&
      (
        t.vehicle_speed != null ||
        t.engine_rpm != null ||
        t.battery_voltage != null ||
        t.fuel_level != null ||
        t.coolant_temp != null ||
        t.engine_load != null
      );

    this.summary = {
      connection_state: connectionState,
      engine_status: hasAnyData ? deriveEngineStatus(t) : 'unknown',
      battery_voltage: t.battery_voltage ?? null,
      fuel_level: t.fuel_level ?? null,
      vehicle_speed: t.vehicle_speed ?? null,
      engine_rpm: t.engine_rpm ?? null,
      coolant_temp: t.coolant_temp ?? null,
      last_updated: hasAnyData ? new Date(Number(t.timestamp)).toISOString() : null,
      has_data: hasAnyData,
      device_name: primary?.device_name || null,
      provider: primary?.provider || null,
    };
    this.snapshot = this.commitSnapshot(this.buildSnapshot());
    this.logSnapshotSource(this.snapshot);
  }

  private commitSnapshot(next: VehicleTelemetrySnapshot): VehicleTelemetrySnapshot {
    const nextSignature = buildVehicleTelemetrySnapshotSignature(next);
    if (this.snapshotSignature === nextSignature) {
      return this.snapshot;
    }
    this.snapshotSignature = nextSignature;
    this.snapshot = next;
    return this.snapshot;
  }

  private buildSnapshot(): VehicleTelemetrySnapshot {
    const t = this.latestTelemetry;
    const summary = this.summary;
    const primary = vehicleTelemetryDeviceRegistry.getPrimary();
    const connectionState = this.resolveConnectionState();
    const freshnessLabel = this.getFreshnessLabel();
    const decodedFields = getDecodedTelemetryFields(t);
    const hasDecodedData = summary.has_data && decodedFields.length > 0;
    const updatedAt = summary.last_updated ?? null;
    const deviceId = t.device_id || primary?.device_id || null;
    const connected = connectionState === 'connected' || connectionState === 'reading' || connectionState === 'unsupported';
    const explicitSource = inferTelemetryInputSource(t);
    const fuelLevelPct = isFiniteMetric(t.fuel_level) ? t.fuel_level : null;
    const engineLoadPct = isFiniteMetric(t.engine_load) ? t.engine_load : null;
    const throttlePct = isFiniteMetric(t.throttle_position) ? t.throttle_position : null;
    const tirePressuresPsi = normalizeTireTelemetryValues(t.tire_pressures);
    const tireTempsF = normalizeTireTelemetryValues(t.tire_temps);
    const warnings = Array.isArray((t as NormalizedVehicleTelemetry & { diagnosticCodes?: unknown }).diagnosticCodes)
      ? (t as NormalizedVehicleTelemetry & { diagnosticCodes?: string[] }).diagnosticCodes?.map((code) => ({
          id: `dtc:${code}`,
          message: `Diagnostic code ${code}`,
          severity: 'watch' as const,
          source: 'vehicle_telemetry',
        })) ?? []
      : [];

    const base = {
      updatedAt,
      deviceId,
      speedMph: isFiniteMetric(t.vehicle_speed) ? t.vehicle_speed : null,
      rpm: isFiniteMetric(t.engine_rpm) ? t.engine_rpm : null,
      coolantTempF: isFiniteMetric(t.coolant_temp) ? t.coolant_temp : null,
      intakeTempF: isFiniteMetric(t.intake_temp) ? t.intake_temp : null,
      engineLoadPct,
      throttlePct,
      batteryVoltage: isFiniteMetric(t.battery_voltage) ? t.battery_voltage : null,
      fuelLevelPct,
      rangeMiles: null,
      oilTempF: isFiniteMetric(t.oil_temp) ? t.oil_temp : null,
      transmissionTempF: isFiniteMetric(t.transmission_temp) ? t.transmission_temp : null,
      tirePressuresPsi,
      tireTempsF,
      pitchDeg: null,
      rollDeg: null,
      headingDeg: null,
      warnings,
      fuelPercent: fuelLevelPct,
      engineLoadPercent: engineLoadPct,
      throttlePercent: throttlePct,
      diagnosticCodes: Array.isArray((t as NormalizedVehicleTelemetry & { diagnosticCodes?: unknown }).diagnosticCodes)
        ? (t as NormalizedVehicleTelemetry & { diagnosticCodes?: string[] }).diagnosticCodes
        : undefined,
    };

    if (hasDecodedData && freshnessLabel === 'live' && connected) {
      const source: VehicleTelemetrySource = t.provider === 'vehicle_internal'
        ? 'native_vehicle_live'
        : 'bluetooth_obd_live';
      const sourceType: VehicleTelemetrySnapshot['sourceType'] = source === 'native_vehicle_live' ? 'device_sensor' : 'obd_live';
      const freshness = toEcsFreshness(freshnessLabel, hasDecodedData);
      return {
        ...base,
        sourceType,
        sourceLabel: sourceLabelFor(sourceType),
        freshness,
        confidence: confidenceFor(sourceType, freshness),
        source,
        isLive: freshness === 'live',
      };
    }

    if (hasDecodedData && explicitSource === 'manual') {
      const sourceType = 'manual';
      const freshness = toEcsFreshness(freshnessLabel, hasDecodedData);
      return {
        ...base,
        sourceType,
        sourceLabel: sourceLabelFor(sourceType),
        freshness: freshness === 'live' ? 'recent' : freshness,
        confidence: confidenceFor(sourceType, freshness),
        source: 'manual',
        isLive: false,
      };
    }

    if (hasDecodedData && explicitSource === 'mock_dev') {
      const sourceType = 'simulated';
      const freshness = toEcsFreshness(freshnessLabel, hasDecodedData);
      return {
        ...base,
        sourceType,
        sourceLabel: sourceLabelFor(sourceType),
        freshness: freshness === 'offline' ? 'unknown' : freshness,
        confidence: confidenceFor(sourceType, freshness),
        source: 'mock_dev',
        isLive: false,
      };
    }

    if (hasDecodedData && updatedAt) {
      const sourceType = 'cached';
      const freshness = toEcsFreshness(freshnessLabel, hasDecodedData);
      return {
        ...base,
        sourceType,
        sourceLabel: sourceLabelFor(sourceType),
        freshness: freshness === 'live' ? 'recent' : freshness,
        confidence: confidenceFor(sourceType, freshness === 'live' ? 'recent' : freshness),
        source: 'cache',
        isLive: false,
      };
    }

    if (connected || primary?.connection_state === 'connected' || primary?.connection_state === 'unsupported') {
      const warning = {
        id: 'vehicle-telemetry:not-decoded',
        message: VEHICLE_TELEMETRY_UNSUPPORTED_REASON,
        severity: 'watch' as const,
        source: 'vehicle_telemetry',
      };
      return {
        ...base,
        sourceType: 'unavailable',
        sourceLabel: sourceLabelFor('unavailable'),
        freshness: 'unknown',
        confidence: 'unverified',
        warnings: [...warnings, warning],
        source: 'unavailable',
        isLive: false,
        unsupportedReason: VEHICLE_TELEMETRY_UNSUPPORTED_REASON,
      };
    }

    return {
      ...EMPTY_VEHICLE_TELEMETRY_SNAPSHOT,
      sourceType: 'unavailable',
      sourceLabel: sourceLabelFor('unavailable'),
      freshness: 'offline',
      confidence: 'unverified',
      updatedAt: null,
      source: 'unavailable',
      isLive: false,
      unsupportedReason: 'No vehicle telemetry source is connected.',
    };
  }

  private logSnapshotSource(snapshot: VehicleTelemetrySnapshot): void {
    if (this.lastLoggedSnapshotSource === snapshot.source) return;
    this.lastLoggedSnapshotSource = snapshot.source;
    ecsLog.debug('TELEMETRY', '[VEHICLE_TELEMETRY] source_selected', {
      source: snapshot.source,
      isLive: snapshot.isLive,
      deviceId: snapshot.deviceId ?? null,
    });
    if (snapshot.source === 'cache') {
      ecsLog.debug('TELEMETRY', '[VEHICLE_TELEMETRY] cache_used', {
        updatedAt: snapshot.updatedAt ?? null,
      });
    }
    if (snapshot.source === 'unavailable') {
      ecsLog.debug('TELEMETRY', '[VEHICLE_TELEMETRY] unavailable', {
        reason: snapshot.unsupportedReason ?? 'no_decoded_vehicle_telemetry',
      });
    }
  }

  // ── Service helpers ─────────────────────────────────────

  private normalizeConnectionState(value: unknown): VehicleTelemetryConnectionState | null {
    if (
      value === 'connected' ||
      value === 'connecting' ||
      value === 'disconnected' ||
      value === 'discovering_services' ||
      value === 'reading' ||
      value === 'unsupported' ||
      value === 'failed' ||
      value === 'error'
    ) {
      return value;
    }
    return null;
  }

  private safeGetServiceConnectionState(): VehicleTelemetryConnectionState | null {
    try {
      if (!this.attachedService?.getConnectionState) return null;
      return this.normalizeConnectionState(this.attachedService.getConnectionState());
    } catch {
      return null;
    }
  }

  private callServiceReconnect(): void {
    const service = this.attachedService;
    if (!service) return;

    const reconnectFn = service.reconnect || service.connect;
    if (!reconnectFn) return;

    scheduleRetry(() => {
      void reconnectFn.call(service);
    });
  }

  private normalizeDisposer(
    event: string,
    cb: (...args: any[]) => void,
    value: MaybeDisposer,
  ): (() => void) | null {
    if (typeof value === 'function') return value;
    if (value && typeof value.remove === 'function') return () => value.remove?.();
    if (value && typeof value.unsubscribe === 'function') return () => value.unsubscribe?.();

    if (this.attachedService?.off) {
      return () => {
        try { this.attachedService?.off?.(event, cb); } catch {}
      };
    }

    if (this.attachedService?.removeListener) {
      return () => {
        try { this.attachedService?.removeListener?.(event, cb); } catch {}
      };
    }

    return null;
  }

  private addServiceListener(event: string, cb: (...args: any[]) => void): void {
    if (!this.attachedService) return;

    try {
      let disposer: MaybeDisposer = null;

      if (this.attachedService.subscribe) {
        disposer = this.attachedService.subscribe(event, cb);
      } else if (this.attachedService.on) {
        disposer = this.attachedService.on(event, cb);
      } else if (this.attachedService.addListener) {
        disposer = this.attachedService.addListener(event, cb);
      }

      const normalized = this.normalizeDisposer(event, cb, disposer);
      if (normalized) {
        this.serviceUnsubscribers.push(normalized);
      }
    } catch (error) {
      ecsLog.warn('TELEMETRY', `${TAG} Failed to register telemetry service listener for ${event}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ── Notifications ───────────────────────────────────────

  private notify(): void {
    this.listeners.forEach(fn => {
      try {
        fn();
      } catch {}
    });
  }

  // ── Stale Transition Timer ──────────────────────────────

  private scheduleStaleTransition(): void {
    this.cancelStaleTransition();

    if (!this.summary.has_data || !this.summary.last_updated) return;

    const age = Date.now() - new Date(this.summary.last_updated).getTime();
    const timeUntilStale = GRACE_WINDOW_MS - age;

    if (timeUntilStale <= 0) return;

    this.staleTransitionTimer = setTimeout(() => {
      ecsLog.warn('TELEMETRY', `${TAG} Telemetry grace window expired — marking as stale`);
      this.notify();
    }, timeUntilStale + 500);
  }

  private cancelStaleTransition(): void {
    if (this.staleTransitionTimer) {
      clearTimeout(this.staleTransitionTimer);
      this.staleTransitionTimer = null;
    }
  }

  // ── Public subscriptions ────────────────────────────────

  subscribe(fn: StoreListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  // ── Service lifecycle ───────────────────────────────────

  attachToService(service: TelemetryServiceLike | null | undefined): () => void {
    this.detachFromService();

    if (!service) {
      this.handleServiceDisconnected();
      return () => {};
    }

    this.attachedService = service;

    this.addServiceListener('telemetry', (payload: NormalizedVehicleTelemetry) => {
      this.ingest(payload);
    });

    this.addServiceListener('data', (payload: NormalizedVehicleTelemetry) => {
      this.ingest(payload);
    });

    this.addServiceListener('connected', () => {
      this.handleServiceConnected();
    });

    this.addServiceListener('connect', () => {
      this.handleServiceConnected();
    });

    this.addServiceListener('disconnected', () => {
      this.handleServiceDisconnected();
    });

    this.addServiceListener('disconnect', () => {
      this.handleServiceDisconnected();
    });

    this.addServiceListener('reconnecting', () => {
      this.handleReconnectStarted();
    });

    this.addServiceListener('reconnect_start', () => {
      this.handleReconnectStarted();
    });

    this.addServiceListener('reconnect_success', () => {
      this.handleReconnectSucceeded();
    });

    this.addServiceListener('reconnected', () => {
      this.handleReconnectSucceeded();
    });

    this.addServiceListener('reconnect_failed', () => {
      this.handleReconnectFailed();
    });

    const currentState = this.safeGetServiceConnectionState();
    if (currentState === 'connected') {
      this.handleServiceConnected();
    } else if (currentState === 'connecting') {
      this.handleReconnectStarted();
    } else {
      this.handleServiceDisconnected(false);
    }

    return () => this.detachFromService();
  }

  detachFromService(): void {
    this.serviceUnsubscribers.forEach(dispose => {
      try {
        dispose();
      } catch {}
    });
    this.serviceUnsubscribers = [];
    this.attachedService = null;
    cancelRetries();
  }

  handleServiceConnected(): void {
    resetRetryState();
    this.isReconnecting = false;
    this.lastConnectionState = 'connected';
    this.restoredFromPersistence = false;
    this.recomputeSummary();
    this.scheduleStaleTransition();
    ecsLog.debug('TELEMETRY', `${TAG} Telemetry service connected`);
    this.notify();
  }

  handleServiceDisconnected(allowRetry = true): void {
    this.lastConnectionState = 'disconnected';
    this.isReconnecting = false;
    this.recomputeSummary();
    this.scheduleStaleTransition();

    if (allowRetry && this.summary.has_data) {
      this.callServiceReconnect();
    }

    if (allowRetry && this.summary.has_data) {
      ecsLog.warn('TELEMETRY', `${TAG} Telemetry service disconnected — retaining last known data while reconnecting`);
    } else {
      ecsLog.debug('TELEMETRY', `${TAG} Telemetry service disconnected`);
    }
    this.notify();
  }

  handleReconnectStarted(): void {
    this.lastConnectionState = 'connecting';
    this.isReconnecting = true;
    this.recomputeSummary();
    this.scheduleStaleTransition();
    ecsLog.debug('TELEMETRY', `${TAG} Telemetry service reconnecting`);
    this.notify();
  }

  handleReconnectSucceeded(): void {
    resetRetryState();
    this.isReconnecting = false;
    this.lastConnectionState = 'connected';
    this.recomputeSummary();
    this.scheduleStaleTransition();
    ecsLog.debug('TELEMETRY', `${TAG} Telemetry service reconnected`);
    this.notify();
  }

  handleReconnectFailed(): void {
    this.lastConnectionState = 'disconnected';
    this.isReconnecting = true;
    this.recomputeSummary();
    this.scheduleStaleTransition();
    this.callServiceReconnect();
    ecsLog.warn('TELEMETRY', `${TAG} Telemetry service reconnect failed`);
    this.notify();
  }

  setConnectionState(state: VehicleTelemetryConnectionState): void {
    this.lastConnectionState = state;
    this.recomputeSummary();
    this.notify();
  }

  // ── Data ingestion ──────────────────────────────────────

  ingest(telemetry: NormalizedVehicleTelemetry): void {
    const inputSource = inferTelemetryInputSource(telemetry);
    if (inputSource === 'mock_dev' && !isDevMockTelemetryAllowed()) {
      ecsLog.warn('TELEMETRY', '[VEHICLE_TELEMETRY] mock_blocked', {
        deviceId: telemetry.device_id ?? null,
        provider: telemetry.provider ?? null,
      });
      return;
    }

    const primary = vehicleTelemetryDeviceRegistry.getPrimary();

    if (primary && telemetry.device_id !== primary.device_id) {
      vehicleTelemetryDeviceRegistry.touchDevice(telemetry.device_id);
      return;
    }

    this.latestTelemetry = telemetry;
    ecsTelemetryStore.ingestEvents(vehicleTelemetryToEcsTelemetryEvents(telemetry));
    this.lastConnectionState = 'connected';
    this.isReconnecting = false;
    this.restoredFromPersistence = false;

    this.recomputeSummary();
    this.persistLatest();
    this.scheduleStaleTransition();

    if (telemetry.device_id) {
      vehicleTelemetryDeviceRegistry.touchDevice(telemetry.device_id);
    }

    ecsLog.debug('TELEMETRY', '[VEHICLE_TELEMETRY] live_update', {
      deviceId: telemetry.device_id || null,
      fields: getDecodedTelemetryFields(telemetry),
    });
    if (telemetry.provider === 'obd2' || inferTelemetryInputSource(telemetry) === 'bluetooth_obd_live') {
      ecsLog.debug('TELEMETRY', '[OBD2] telemetry_store_updated', {
        deviceId: telemetry.device_id || null,
        fields: getDecodedTelemetryFields(telemetry),
        source: inferTelemetryInputSource(telemetry) ?? 'bluetooth_obd_live',
      });
    }

    resetRetryState();
    this.notify();
  }

  // ── Data access ─────────────────────────────────────────

  getSummary(): VehicleTelemetrySummary {
    return { ...this.summary };
  }

  getLatestTelemetry(): NormalizedVehicleTelemetry {
    return { ...this.latestTelemetry };
  }

  getTelemetrySnapshot(): VehicleTelemetrySnapshot {
    this.snapshot = this.commitSnapshot(this.buildSnapshot());
    this.logSnapshotSource(this.snapshot);
    return this.snapshot;
  }

  hasData(): boolean {
    return this.summary.has_data;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  isFresh(): boolean {
    if (!this.summary.has_data || !this.summary.last_updated) return false;
    const age = Date.now() - new Date(this.summary.last_updated).getTime();
    return age < FRESH_WINDOW_MS;
  }

  isStale(): boolean {
    if (!this.summary.has_data || !this.summary.last_updated) return false;
    const age = Date.now() - new Date(this.summary.last_updated).getTime();
    return age > GRACE_WINDOW_MS;
  }

  getGraceState(): 'fresh' | 'grace' | 'stale' | 'none' {
    if (!this.summary.has_data || !this.summary.last_updated) return 'none';
    const age = Date.now() - new Date(this.summary.last_updated).getTime();
    if (age < FRESH_WINDOW_MS) return 'fresh';
    if (age <= GRACE_WINDOW_MS) return 'grace';
    return 'stale';
  }

  isWithinGraceWindow(): boolean {
    const state = this.getGraceState();
    return state === 'fresh' || state === 'grace';
  }

  getFreshnessText(): string {
    if (!this.summary.last_updated) return '';
    const age = Date.now() - new Date(this.summary.last_updated).getTime();
    if (age < 10_000) return 'just now';
    if (age < 60_000) return `${Math.floor(age / 1000)}s ago`;
    if (age < 3_600_000) return `${Math.floor(age / 60_000)}m ago`;
    return `${Math.floor(age / 3_600_000)}h ago`;
  }

  setReconnecting(reconnecting: boolean): void {
    if (this.isReconnecting === reconnecting) return;
    this.isReconnecting = reconnecting;
    if (reconnecting) {
      this.lastConnectionState = 'connecting';
    }
    ecsLog.debug('TELEMETRY', `${TAG} Reconnecting state: ${reconnecting}`);
    this.recomputeSummary();
    this.notify();
  }

  getIsReconnecting(): boolean {
    return this.isReconnecting;
  }

  getConnectionState(): VehicleTelemetryConnectionState | 'reconnecting' {
    if (this.isReconnecting) return 'reconnecting';
    return this.resolveConnectionState();
  }

  getFreshnessLabel(): TelemetryFreshnessLabel {
    const primary = vehicleTelemetryDeviceRegistry.getPrimary();
    const connectionState = this.resolveConnectionState();

    if (!primary && !this.summary.has_data) {
      return 'disconnected';
    }

    if (this.isReconnecting) {
      if (this.summary.has_data && this.isWithinGraceWindow()) return 'reconnecting';
      return 'reconnecting';
    }

    if (!this.summary.has_data || !this.summary.last_updated) {
      if (this.restoredFromPersistence) return 'last_known';
      return connectionState === 'connected' ? 'live' : 'disconnected';
    }

    const age = Date.now() - new Date(this.summary.last_updated).getTime();

    if (age < FRESH_WINDOW_MS && connectionState === 'connected') {
      return 'live';
    }

    if (age <= GRACE_WINDOW_MS) {
      if (connectionState === 'connected') return 'live';
      return 'last_known';
    }

    if (connectionState === 'connected') {
      return 'stale';
    }

    if (age < LAST_KNOWN_MAX_AGE_MS) {
      return 'last_known';
    }

    return 'disconnected';
  }

  isShowingLastKnown(): boolean {
    const label = this.getFreshnessLabel();
    return label === 'last_known' || (label === 'reconnecting' && this.summary.has_data);
  }

  getECSVehicleTelemetryState(): ECSVehicleTelemetryState {
    const freshnessLabel = this.getFreshnessLabel();
    const summary = this.getSummary();

    return {
      connectionState: this.getConnectionState(),
      freshnessLabel,
      isFresh: this.isFresh(),
      isStale: this.isStale(),
      isWithinGraceWindow: this.isWithinGraceWindow(),
      isShowingLastKnown: this.isShowingLastKnown(),
      isConnected: this.resolveConnectionState() === 'connected',
      isReconnecting: this.isReconnecting,
      hasData: summary.has_data,
      lastUpdated: summary.last_updated,
      freshnessText: this.getFreshnessText(),
      telemetry: this.getLatestTelemetry(),
      summary,
      snapshot: this.getTelemetrySnapshot(),
    };
  }

  recompute(): void {
    this.recomputeSummary();
    this.notify();
  }

  clear(): void {
    if (this.latestTelemetry.device_id) {
      ecsTelemetryStore.markDeviceUnavailable(this.latestTelemetry.device_id, 'obd2', 'OBD2 telemetry disconnected.');
    }
    this.latestTelemetry = { ...EMPTY_TELEMETRY };
    this.summary = { ...EMPTY_SUMMARY };
    this.snapshot = { ...EMPTY_VEHICLE_TELEMETRY_SNAPSHOT };
    this.snapshotSignature = buildVehicleTelemetrySnapshotSignature(this.snapshot);
    this.isReconnecting = false;
    this.restoredFromPersistence = false;
    this.lastConnectionState = 'disconnected';
    this.lastLoggedSnapshotSource = null;
    this.cancelStaleTransition();
    cancelRetries();
    sRemove(VT_STORAGE_KEYS.LAST_TELEMETRY);
    ecsLog.debug('TELEMETRY', `${TAG} Store cleared`);
    this.notify();
  }
}

export const vehicleTelemetryStore = new VehicleTelemetryStore();

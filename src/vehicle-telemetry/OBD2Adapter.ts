/**
 * ═══════════════════════════════════════════════════════════
 * ECS OBD-II BLUETOOTH ADAPTER — Phase 2D
 * ═══════════════════════════════════════════════════════════
 *
 * Handles Bluetooth scanning, device filtering, connection,
 * registration, auto-reconnect, and live PID polling for
 * OBD-II adapters.
 *
 * Phase 2D adds:
 *   - Stale session detection for BLE connections
 *   - Quiet automatic reconnection on unexpected drops
 *   - Reconnect signaling to VT service
 *   - Enhanced error recovery (no crashes)
 *   - Connection health monitoring
 *   - Reconnect on app resume with validation
 *   - Graceful degradation when BLE unavailable
 *   - Session-aware reconnect (validates device still exists in registry)
 *
 * Connection flow:
 *   scan → filter → select → pair → register → init ELM327
 *   → discover PIDs → start polling → ingest telemetry
 */

import { Platform, AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { Buffer } from 'buffer';
import {
  ensureBleScanReadiness,
  getBleRuntimeDiagnostics,
  getBleRuntimeUnsupportedMessage,
  isBleNativeModuleUnavailableError,
  isBleRuntimeUnsupported,
  waitForBlePoweredOn,
  type BleRuntimeDiagnostics,
} from '../power/ble/BleScanReadiness';
import { createBackoff } from '../power/ble/backoff';
import type { Backoff } from '../power/ble/backoff';
import type {
  VehicleTelemetryDevice,
  VehicleTelemetryConnectionState,
} from './VehicleTelemetryTypes';
import { VT_STORAGE_KEYS } from './VehicleTelemetryTypes';
import { vehicleTelemetryDeviceRegistry } from './VehicleTelemetryDeviceRegistry';
import { vehicleTelemetryService } from './VehicleTelemetryService';
import { vehicleTelemetryStore } from './VehicleTelemetryStore';
import { OBD2PIDPoller } from './OBD2PIDPoller';
import {
  isTelemetryScanThrottleActive,
  mapObdStateToTelemetrySourceStatus,
  normalizeTelemetryScanDurationMs,
  TELEMETRY_SCAN_THROTTLE_MS,
  type TelemetryScanTrigger,
  type TelemetrySourceStatus,
} from './TelemetryDiscoveryControl';
import { ecsLog } from '../../lib/ecsLogger';
import {
  classifyBluetoothDiagnosticSource,
  recordBluetoothDiagnosticEvent,
} from '../../lib/bluetoothDiagnostics';

const TAG = '[OBD2-Adapter]';
const BT_SCAN_TAG = '[BT_SCAN]';
const BT_BLOCKER_TAG = '[BT_BLOCKER]';
const TELEMETRY_SCAN_DEBUG_FLAG = 'ECS_DEBUG_TELEMETRY_SCAN';
const TELEMETRY_SCAN_LOG_THROTTLE_MS = 2500;
const TELEMETRY_SCAN_LOG_AGGREGATE_MS = 10_000;

const HIGH_FREQUENCY_SCAN_WARNINGS = new Set([
  'accepted_device',
  'device_added',
  'device_filtered_out',
  'device_normalized',
  'filtered_device',
  'normalized_count',
  'raw_device',
  'render_count',
  'scan_stopped',
]);

function scanLogFingerprint(message: string, details?: Record<string, unknown>): string {
  const detailKey = [
    details?.reason,
    details?.deviceId,
    details?.readinessCode,
    details?.bluetoothState,
    details?.phase,
  ].filter(Boolean).join(':');
  return detailKey ? `${message}:${detailKey}` : message;
}

function logTelemetryDebug(message: string, details?: Record<string, unknown>): void {
  ecsLog.debug('TELEMETRY', `${TAG} ${message}`, details);
}

function logTelemetryWarn(message: string, details?: Record<string, unknown>): void {
  ecsLog.warn('TELEMETRY', `${TAG} ${message}`, details);
}

function logTelemetryScanWarnOnce(message: string, details?: Record<string, unknown>): void {
  ecsLog.warnOnce(
    'TELEMETRY',
    `obd2-scan:${scanLogFingerprint(message, details)}`,
    `${TAG} ${message}`,
    details,
  );
}

function logBtScanDebug(message: string, details?: Record<string, unknown>): void {
  ecsLog.dev('TELEMETRY', message, details, {
    tag: BT_SCAN_TAG,
    debugFlag: TELEMETRY_SCAN_DEBUG_FLAG,
    fingerprint: scanLogFingerprint(message, details),
    throttleMs: TELEMETRY_SCAN_LOG_THROTTLE_MS,
    aggregateWindowMs: TELEMETRY_SCAN_LOG_AGGREGATE_MS,
  });
}

function logBtScanWarn(message: string, details?: Record<string, unknown>): void {
  if (HIGH_FREQUENCY_SCAN_WARNINGS.has(message)) {
    logBtScanDebug(message, details);
    return;
  }
  ecsLog.warnOnce(
    'TELEMETRY',
    `bt-scan:${scanLogFingerprint(message, details)}`,
    `${BT_SCAN_TAG} ${message}`,
    details,
  );
}

function logBtBlockerDebug(message: string, details?: Record<string, unknown>): void {
  ecsLog.dev('TELEMETRY', message, details, {
    tag: BT_BLOCKER_TAG,
    debugFlag: TELEMETRY_SCAN_DEBUG_FLAG,
    fingerprint: scanLogFingerprint(message, details),
    throttleMs: TELEMETRY_SCAN_LOG_THROTTLE_MS,
    aggregateWindowMs: TELEMETRY_SCAN_LOG_AGGREGATE_MS,
  });
}

function logBtBlockerWarn(message: string, details?: Record<string, unknown>): void {
  if (HIGH_FREQUENCY_SCAN_WARNINGS.has(message)) {
    logBtBlockerDebug(message, details);
    return;
  }
  ecsLog.warnOnce(
    'TELEMETRY',
    `bt-blocker:${scanLogFingerprint(message, details)}`,
    `${BT_BLOCKER_TAG} ${message}`,
    details,
  );
}

function logObdScanDebug(message: string, details?: Record<string, unknown>): void {
  ecsLog.dev('TELEMETRY', message, details, {
    tag: '[OBD_SCAN]',
    debugFlag: TELEMETRY_SCAN_DEBUG_FLAG,
    fingerprint: scanLogFingerprint(message, details),
    throttleMs: TELEMETRY_SCAN_LOG_THROTTLE_MS,
    aggregateWindowMs: TELEMETRY_SCAN_LOG_AGGREGATE_MS,
  });
}

function logObdConnectDebug(message: string, details?: Record<string, unknown>): void {
  ecsLog.debug('TELEMETRY', `[OBD_CONNECT] ${message}`, details);
}

function logObdConnectWarn(message: string, details?: Record<string, unknown>): void {
  ecsLog.warn('TELEMETRY', `[OBD_CONNECT] ${message}`, details);
}

function logObd2Debug(message: string, details?: Record<string, unknown>): void {
  ecsLog.debug('TELEMETRY', `[OBD2] ${message}`, details);
}

function logObd2Warn(message: string, details?: Record<string, unknown>): void {
  ecsLog.warn('TELEMETRY', `[OBD2] ${message}`, details);
}

// ═══════════════════════════════════════════════════════════
// OBD-II DEVICE NAME PATTERNS
// ═══════════════════════════════════════════════════════════

const OBD2_NAME_PATTERNS: RegExp[] = [
  /obd/i, /elm\s*327/i, /elm327/i, /v[\-\s]*link/i, /vee\s*peak/i, /veepeak/i, /v\s*peak/i,
  /bafx/i, /scan\s*tool/i, /carista/i, /obd\s*link/i, /vgate/i,
  /konnwei/i, /fixd/i, /blue\s*driver/i, /torque/i, /le\s*link/i,
  /viecar/i, /thinkcar/i, /autel/i, /icar/i, /launch/i,
  /ancel/i, /foxwell/i, /innova/i, /autophix/i, /xtool/i,
];

const OBD2_SERVICE_UUIDS = [
  '00001101-0000-1000-8000-00805f9b34fb',
  '1101',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

const OBD2_CHARACTERISTIC_UUIDS = [
  'ffe1',
  'fff1',
  '0000ffe1-0000-1000-8000-00805f9b34fb',
  '0000fff1-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

type OBD2LifecycleEvent =
  | 'telemetry'
  | 'data'
  | 'connected'
  | 'connect'
  | 'disconnected'
  | 'disconnect'
  | 'reconnecting'
  | 'reconnect_start'
  | 'reconnected'
  | 'reconnect_success'
  | 'reconnect_failed'
  | 'error';

type ElmTransport = {
  serviceUuid: string;
  txCharacteristicUuid: string;
  rxCharacteristicUuid: string;
  monitorSubscription: { remove?: () => void } | null;
};

type PendingElmCommand = {
  buffer: string;
  resolve: (response: string) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

// ═══════════════════════════════════════════════════════════
// DISCOVERED DEVICE TYPE
// ═══════════════════════════════════════════════════════════

export interface OBD2DiscoveredDevice {
  id: string;
  name: string;
  rssi: number;
  isLikelyOBD: boolean;
  lastSeenAt: number;
  serviceUUIDs?: string[];
  manufacturerData?: string | null;
}

// ═══════════════════════════════════════════════════════════
// ADAPTER STATE
// ═══════════════════════════════════════════════════════════

export type OBD2AdapterState =
  | 'idle'
  | 'requesting_permissions'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'reconnecting';

export interface OBD2AdapterStatus {
  state: OBD2AdapterState;
  sourceStatus: TelemetrySourceStatus;
  discoveredDevices: OBD2DiscoveredDevice[];
  connectedDeviceId: string | null;
  connectedDeviceName: string | null;
  error: string | null;
  scanProgress: number;
  reconnectAttempt: number;
  scanDiagnostics: OBD2ScanDiagnostics;
  scanStartedAt: number | null;
  lastScanFinishedAt: number | null;
  lastScanTrigger: TelemetryScanTrigger | null;
}

export interface OBD2ScanDiagnostics extends BleRuntimeDiagnostics {
  scanState: OBD2AdapterState;
  rawDevicesSeenCount: number;
  rawDeviceCallbacksCount: number;
  acceptedDevicesCount: number;
  likelyObdDevicesCount: number;
  lastScanError: string | null;
  lastUpdatedAt: number | null;
}

// ═══════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════

const OBD2_STORAGE_KEYS = {
  LAST_DEVICE_ID: 'ecs_obd2_last_device_id',
  LAST_DEVICE_NAME: 'ecs_obd2_last_device_name',
  AUTO_RECONNECT: 'ecs_obd2_auto_reconnect',
} as const;

const mem: Record<string, string> = {};

function sGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return mem[key] || null;
  } catch { return mem[key] || null; }
}

function sSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    mem[key] = value;
  } catch { mem[key] = value; }
}

function sRemove(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    delete mem[key];
  } catch { delete mem[key]; }
}

// ═══════════════════════════════════════════════════════════
// LAZY BLE MANAGER
// ═══════════════════════════════════════════════════════════

let _bleManager: any | null = null;

function getBleManager(): any {
  if (_bleManager) return _bleManager;

  if (Platform.OS === 'web') {
    throw new Error(`${TAG} BLE is not supported on web.`);
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BleManager } = require('react-native-ble-plx');
    _bleManager = new BleManager();
    return _bleManager;
  } catch (err) {
    if (isBleNativeModuleUnavailableError(err)) {
      throw new Error(getBleRuntimeUnsupportedMessage());
    }
    const message = String((err as any)?.message ?? err ?? 'unknown error');
    throw new Error(`${TAG} Failed to initialize Bluetooth manager: ${message}`);
  }
}

// ═══════════════════════════════════════════════════════════
// OBD-II ADAPTER CLASS
// ═══════════════════════════════════════════════════════════

class OBD2Adapter {
  private state: OBD2AdapterState = 'idle';
  private discovered: Map<string, OBD2DiscoveredDevice> = new Map();
  private connectedDeviceId: string | null = null;
  private connectedDeviceName: string | null = null;
  private connectedDeviceRef: any | null = null;
  private error: string | null = null;
  private scanProgress = 0;
  private reconnectAttempt = 0;
  private latestTelemetry: any | null = null;
  private pidPoller: OBD2PIDPoller | null = null;
  private elmTransport: ElmTransport | null = null;
  private pendingElmCommand: PendingElmCommand | null = null;
  private disconnectSubscription: { remove?: () => void } | null = null;

  private listeners: (() => void)[] = [];
  private lifecycleListeners: Map<OBD2LifecycleEvent, Set<(payload?: any) => void>> = new Map();
  private scanTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private scanProgressTimer: ReturnType<typeof setInterval> | null = null;
  private scanSessionId = 0;
  private scanStartedAt: number | null = null;
  private lastScanFinishedAt: number | null = null;
  private lastScanTrigger: TelemetryScanTrigger | null = null;
  private runtimeUnsupportedLogged = false;
  private rawScanLogAtByDeviceId: Map<string, number> = new Map();
  private rawScanDeviceIds: Set<string> = new Set();
  private diagnosedFirstTelemetryDeviceIds: Set<string> = new Set();
  private rawDeviceCallbacksCount = 0;
  private unidentifiedRawDeviceCallbacksCount = 0;
  private scanDiagnostics: OBD2ScanDiagnostics = this.createDefaultScanDiagnostics();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private resumeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff: Backoff = createBackoff({ initialDelayMs: 1000, maxDelayMs: 30000 });
  private appStateSubscription: any = null;
  private autoReconnectEnabled = false;
  private isDestroyed = false;

  /** Phase 2D: Connection health check timer */
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  /** Phase 2D: Max reconnect attempts before giving up */
  private static readonly MAX_RECONNECT_ATTEMPTS = 8;

  constructor() {
    this.restoreAutoReconnectState();
    this.setupAppStateListener();
  }

  // ── Status ─────────────────────────────────────────────

  getStatus(): OBD2AdapterStatus {
    return {
      state: this.state,
      sourceStatus: this.getSourceStatus(),
      discoveredDevices: this.getDiscoveredDevices(),
      connectedDeviceId: this.connectedDeviceId,
      connectedDeviceName: this.connectedDeviceName,
      error: this.error,
      scanProgress: this.scanProgress,
      reconnectAttempt: this.reconnectAttempt,
      scanDiagnostics: this.getScanDiagnostics(),
      scanStartedAt: this.scanStartedAt,
      lastScanFinishedAt: this.lastScanFinishedAt,
      lastScanTrigger: this.lastScanTrigger,
    };
  }

  getSourceStatus(): TelemetrySourceStatus {
    return mapObdStateToTelemetrySourceStatus(this.state, {
      autoReconnectEnabled: this.autoReconnectEnabled,
      hasLastDevice: this.getLastDeviceInfo() !== null,
      diagnostics: this.getScanDiagnostics(),
      error: this.error,
    });
  }

  getState(): OBD2AdapterState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected' && this.connectedDeviceId !== null;
  }

  isScanning(): boolean {
    return this.state === 'scanning';
  }

  private createDefaultScanDiagnostics(): OBD2ScanDiagnostics {
    return {
      platform: Platform.OS,
      isExpoGo: false,
      nativeBridgeStatus: Platform.OS === 'web' ? 'web_unsupported' : 'not_checked',
      permissionStatus: 'unknown',
      missingPermissions: [],
      bluetoothState: null,
      initialBluetoothState: null,
      readinessCode: Platform.OS === 'web' ? 'platform_unsupported' : 'ready',
      message: null,
      scanState: this.state,
      rawDevicesSeenCount: 0,
      rawDeviceCallbacksCount: 0,
      acceptedDevicesCount: 0,
      likelyObdDevicesCount: 0,
      lastScanError: null,
      lastUpdatedAt: null,
    };
  }

  private getScanDiagnostics(): OBD2ScanDiagnostics {
    const acceptedDevices = this.getDiscoveredDevices();
    return {
      ...this.scanDiagnostics,
      scanState: this.state,
      rawDevicesSeenCount: Math.max(
        this.scanDiagnostics.rawDevicesSeenCount,
        this.rawScanDeviceIds.size + this.unidentifiedRawDeviceCallbacksCount,
        acceptedDevices.length,
      ),
      rawDeviceCallbacksCount: this.rawDeviceCallbacksCount,
      acceptedDevicesCount: acceptedDevices.length,
      likelyObdDevicesCount: acceptedDevices.filter((device) => device.isLikelyOBD).length,
      lastScanError: this.error,
      lastUpdatedAt: this.scanDiagnostics.lastUpdatedAt,
    };
  }

  private updateScanDiagnostics(next: Partial<OBD2ScanDiagnostics>): void {
    this.scanDiagnostics = {
      ...this.scanDiagnostics,
      ...next,
      scanState: next.scanState ?? this.state,
      rawDevicesSeenCount: Math.max(
        next.rawDevicesSeenCount ?? this.scanDiagnostics.rawDevicesSeenCount,
        this.rawScanDeviceIds.size + this.unidentifiedRawDeviceCallbacksCount,
      ),
      rawDeviceCallbacksCount: next.rawDeviceCallbacksCount ?? this.rawDeviceCallbacksCount,
      acceptedDevicesCount: next.acceptedDevicesCount ?? this.discovered.size,
      likelyObdDevicesCount: next.likelyObdDevicesCount ?? Array.from(this.discovered.values()).filter((device) => device.isLikelyOBD).length,
      lastUpdatedAt: Date.now(),
    };
  }

  clearError(): void {
    const hadError = this.error !== null || this.state === 'error';
    this.error = null;

    if (this.state === 'error') {
      this.setState(this.connectedDeviceId && this.connectedDeviceRef ? 'connected' : 'idle');
      return;
    }

    if (hadError) {
      this.notify();
    }
  }

  // ── Subscriptions ──────────────────────────────────────

  subscribe(fn: () => void): () => void;
  subscribe(event: OBD2LifecycleEvent, fn: (payload?: any) => void): () => void;
  subscribe(
    eventOrFn: OBD2LifecycleEvent | (() => void),
    fn?: (payload?: any) => void,
  ): () => void {
    if (typeof eventOrFn === 'function') {
      this.listeners.push(eventOrFn);
      return () => {
        this.listeners = this.listeners.filter(l => l !== eventOrFn);
      };
    }

    const listener = fn ?? (() => {});
    const listeners = this.lifecycleListeners.get(eventOrFn) ?? new Set();
    listeners.add(listener);
    this.lifecycleListeners.set(eventOrFn, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.lifecycleListeners.delete(eventOrFn);
      }
    };
  }

  private notify(): void {
    this.listeners.forEach(fn => { try { fn(); } catch {} });
  }

  private emitEvent(event: OBD2LifecycleEvent, payload?: any): void {
    const listeners = this.lifecycleListeners.get(event);
    if (!listeners?.size) return;
    listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch {}
    });
  }

  private setState(next: OBD2AdapterState): void {
    if (this.state === next) return;
    const wasReconnecting = this.state === 'reconnecting';
    const prev = this.state;
    this.state = next;
    logTelemetryDebug(`State: ${prev} -> ${next}`);

    // Phase 2D: Signal reconnecting state to VT service
    try {
      if (next === 'reconnecting') {
        vehicleTelemetryService.signalReconnecting(true);
      } else if (wasReconnecting) {
        vehicleTelemetryService.signalReconnecting(false);
      }
    } catch {
      // VT service may not be ready
    }

    this.notify();
  }

  getLatestReading(): any | null {
    return this.latestTelemetry ? { ...this.latestTelemetry } : null;
  }

  async connect(): Promise<void> {
    if (this.isConnected()) return;
    const restored = await this.attemptReconnect();
    if (!restored) {
      throw new Error('No remembered OBD-II adapter is available to reconnect.');
    }
  }

  async reconnect(): Promise<void> {
    await this.connect();
  }

  // ═══════════════════════════════════════════════════════
  // SCANNING
  // ═══════════════════════════════════════════════════════

  async startScan(
    durationMs: number = 15000,
    trigger: TelemetryScanTrigger = 'user_open_tools',
  ): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    const normalizedDurationMs = normalizeTelemetryScanDurationMs(durationMs);
    const now = Date.now();

    if (this.state === 'scanning' || this.state === 'requesting_permissions') {
      logTelemetryDebug('Already scanning — ignoring duplicate request');
      logBtScanDebug('scan_button_pressed', {
        skipped: true,
        reason: 'already_scanning',
        trigger,
        discoveredDeviceCount: this.discovered.size,
      });
      logBtBlockerDebug('scan_start', {
        skipped: true,
        reason: 'already_scanning',
        trigger,
        discoveredDeviceCount: this.discovered.size,
      });
      return;
    }

    if (
      trigger !== 'controlled_retry' &&
      isTelemetryScanThrottleActive(now, this.lastScanFinishedAt, TELEMETRY_SCAN_THROTTLE_MS)
    ) {
      logBtScanDebug('scan_button_pressed', {
        skipped: true,
        reason: 'scan_throttled',
        trigger,
        throttleMs: TELEMETRY_SCAN_THROTTLE_MS,
        lastScanFinishedAt: this.lastScanFinishedAt,
      });
      this.updateScanDiagnostics({
        message: 'Telemetry scan throttled to prevent repeated source searches.',
        scanState: this.state,
      });
      this.notify();
      return;
    }

    this.clearScanTimers();
    this.stopNativeDeviceScan('pre_scan_cleanup', false);

    this.scanSessionId += 1;
    const scanSessionId = this.scanSessionId;
    this.scanStartedAt = now;
    this.lastScanTrigger = trigger;

    this.error = null;
    this.discovered.clear();
    this.rawScanLogAtByDeviceId.clear();
    this.rawScanDeviceIds.clear();
    this.rawDeviceCallbacksCount = 0;
    this.unidentifiedRawDeviceCallbacksCount = 0;
    this.scanProgress = 0;
    this.updateScanDiagnostics({
      platform: Platform.OS,
      nativeBridgeStatus: Platform.OS === 'web' ? 'web_unsupported' : 'not_checked',
      permissionStatus: 'unknown',
      missingPermissions: [],
      bluetoothState: null,
      initialBluetoothState: null,
      readinessCode: Platform.OS === 'web' ? 'platform_unsupported' : 'ready',
      message: null,
      scanState: 'requesting_permissions',
      rawDevicesSeenCount: 0,
      rawDeviceCallbacksCount: 0,
      acceptedDevicesCount: 0,
      likelyObdDevicesCount: 0,
      lastScanError: null,
    });
    recordBluetoothDiagnosticEvent({
      type: 'scanner_start',
      source: 'native_ble',
      providerId: 'obd2',
      message: 'OBD2 BLE scanner start requested.',
      details: {
        scanId: `obd2:${scanSessionId}`,
        trigger,
        durationMs: normalizedDurationMs,
      },
    });

    if (isBleRuntimeUnsupported()) {
      const msg = getBleRuntimeUnsupportedMessage();
      this.error = msg;
      this.updateScanDiagnostics({
        platform: Platform.OS,
        isExpoGo: Platform.OS !== 'web',
        nativeBridgeStatus: Platform.OS === 'web' ? 'web_unsupported' : 'expo_go_unsupported',
        permissionStatus: 'denied',
        missingPermissions: Platform.OS === 'web' ? ['platform'] : ['runtime.expo_go'],
        bluetoothState: null,
        initialBluetoothState: null,
        readinessCode: Platform.OS === 'web' ? 'platform_unsupported' : 'runtime_unsupported',
        message: msg,
        scanState: 'error',
        lastScanError: msg,
      });
      this.setState('error');
      if (!this.runtimeUnsupportedLogged) {
        this.runtimeUnsupportedLogged = true;
        logTelemetryScanWarnOnce('Scan readiness blocked', {
          reason: Platform.OS === 'web' ? 'platform_unsupported' : 'runtime_unsupported',
          missing: Platform.OS === 'web' ? ['platform'] : ['runtime.expo_go'],
        });
        logBtBlockerWarn('scan_stop', {
          reason: Platform.OS === 'web' ? 'platform_unsupported' : 'runtime_unsupported',
          missing: Platform.OS === 'web' ? ['platform'] : ['runtime.expo_go'],
        });
      }
      recordBluetoothDiagnosticEvent({
        type: 'bluetooth_power_state',
        source: 'unsupported_runtime',
        providerId: 'obd2',
        error: msg,
        message: 'OBD2 BLE scanner is unavailable in this runtime.',
        details: {
          scanId: `obd2:${scanSessionId}`,
          runtime: Platform.OS === 'web' ? 'platform_unsupported' : 'runtime_unsupported',
        },
      });
      this.finishScanLifecycle(scanSessionId, 'runtime_unsupported');
      return;
    }

    this.setState('requesting_permissions');
    recordBluetoothDiagnosticEvent({
      type: 'permission_request',
      source: 'permission',
      providerId: 'obd2',
      message: 'OBD2 BLE permission/readiness check started.',
      details: {
        scanId: `obd2:${scanSessionId}`,
        platform: Platform.OS,
      },
    });
    logTelemetryDebug('Requesting BLE permissions...');
    logBtScanDebug('start', { durationMs: normalizedDurationMs, platform: Platform.OS, trigger });
    logBtScanDebug('permissions_status', {
      state: 'requesting',
      platform: Platform.OS,
    });
    logBtBlockerDebug('permissions', {
      state: 'requesting',
      platform: Platform.OS,
    });

    const readiness = await ensureBleScanReadiness({
      createManager: getBleManager,
    });
    if (this.scanSessionId !== scanSessionId) {
      logBtBlockerDebug('scan_stop', {
        reason: 'stale_readiness_result',
        scanSessionId,
      });
      this.finishScanLifecycle(scanSessionId, 'stale_readiness_result');
      return;
    }

    logBtBlockerDebug('permissions', {
      ok: readiness.permissions.ok,
      missing: readiness.permissions.missing,
      platform: Platform.OS,
      readinessCode: readiness.code,
    });
    logBtScanDebug('permissions_status', {
      ok: readiness.permissions.ok,
      missing: readiness.permissions.missing,
      platform: Platform.OS,
      readinessCode: readiness.code,
    });
    logBtScanDebug('adapter_state', {
      bluetoothState: readiness.bluetoothState,
      initialBluetoothState: readiness.initialBluetoothState,
      readinessCode: readiness.code,
      runtime: readiness.runtime,
    });
    recordBluetoothDiagnosticEvent({
      type: 'permission_result',
      source: 'permission',
      providerId: 'obd2',
      message: readiness.permissions.ok
        ? 'OBD2 BLE permissions granted.'
        : 'OBD2 BLE permissions/readiness blocked scan.',
      error: readiness.ok ? undefined : readiness.message ?? readiness.code,
      details: {
        scanId: `obd2:${scanSessionId}`,
        ok: readiness.permissions.ok,
        readinessCode: readiness.code,
        missing: readiness.permissions.missing,
      },
    });
    recordBluetoothDiagnosticEvent({
      type: 'bluetooth_power_state',
      source: readiness.ok ? 'native_ble' : classifyBluetoothDiagnosticSource(readiness.message ?? readiness.code, 'native_ble'),
      providerId: 'obd2',
      message: `OBD2 BLE adapter state: ${readiness.bluetoothState ?? readiness.initialBluetoothState ?? 'unknown'}.`,
      error: readiness.ok ? undefined : readiness.message ?? readiness.code,
      details: {
        scanId: `obd2:${scanSessionId}`,
        bluetoothState: readiness.bluetoothState,
        initialBluetoothState: readiness.initialBluetoothState,
        readinessCode: readiness.code,
      },
    });
    logBtBlockerDebug('adapter_state', {
      bluetoothState: readiness.bluetoothState,
      initialBluetoothState: readiness.initialBluetoothState,
      readinessCode: readiness.code,
    });
    this.updateScanDiagnostics({
      ...getBleRuntimeDiagnostics(readiness),
      scanState: this.state,
      lastScanError: readiness.ok ? null : readiness.message ?? readiness.code,
    });

    if (!readiness.ok) {
      const msg = readiness.message ?? 'Bluetooth scanner is not ready.';
      this.error = msg;
      this.updateScanDiagnostics({
        lastScanError: msg,
        scanState: 'error',
      });
      this.setState('error');
      if (readiness.code === 'runtime_unsupported') {
        if (!this.runtimeUnsupportedLogged) {
          this.runtimeUnsupportedLogged = true;
          logTelemetryScanWarnOnce('Scan readiness blocked', {
            reason: readiness.code,
            missing: readiness.permissions.missing,
            bluetoothState: readiness.bluetoothState,
          });
          logBtBlockerWarn('scan_stop', {
            reason: readiness.code,
            missing: readiness.permissions.missing,
            bluetoothState: readiness.bluetoothState,
          });
        }
        this.finishScanLifecycle(scanSessionId, readiness.code);
        return;
      }
      logTelemetryScanWarnOnce('Scan readiness blocked', {
        reason: readiness.code,
        missing: readiness.permissions.missing,
        bluetoothState: readiness.bluetoothState,
      });
      logBtScanWarn(readiness.code === 'permission_denied' ? 'permission_denied' : 'adapter_unavailable', {
        reason: readiness.code,
        missing: readiness.permissions.missing,
        bluetoothState: readiness.bluetoothState,
      });
      logBtScanWarn('device_filtered_out', {
        reason: readiness.code,
        missing: readiness.permissions.missing,
        bluetoothState: readiness.bluetoothState,
      });
      logBtScanWarn('scan_stopped', {
        reason: readiness.code,
        bluetoothState: readiness.bluetoothState,
        discoveredDeviceCount: this.discovered.size,
      });
      logBtBlockerWarn('scan_stop', {
        reason: readiness.code,
        missing: readiness.permissions.missing,
        bluetoothState: readiness.bluetoothState,
      });
      this.finishScanLifecycle(scanSessionId, readiness.code);
      return;
    }

    logTelemetryDebug('BLE permissions granted');
    logBtScanDebug('permission_state', { ok: true, missing: [] });

    try {
      const mgr = readiness.manager;
      if (!mgr) {
        throw new Error('Bluetooth scanner could not be initialized.');
      }
      logBtBlockerDebug('manager_ready', {
        ready: true,
        platform: Platform.OS,
      });

      this.setState('scanning');
      logTelemetryDebug('Starting BLE scan', { durationMs: normalizedDurationMs, trigger });
      logBtScanDebug('scan_started', {
        durationMs: normalizedDurationMs,
        trigger,
        serviceFilter: null,
        allowDuplicates: true,
      });
      logBtBlockerDebug('scan_start', {
        durationMs: normalizedDurationMs,
        trigger,
        serviceFilter: null,
        allowDuplicates: true,
      });

      mgr.startDeviceScan(
        null,
        { allowDuplicates: true },
        (error: any, device: any) => {
          if (this.isDestroyed) {
            logBtScanDebug('device_filtered_out', {
              reason: 'adapter_destroyed',
              scanSessionId,
              activeScanSessionId: this.scanSessionId,
            });
            logBtBlockerDebug('filtered_device', {
              reason: 'adapter_destroyed',
              scanSessionId,
              activeScanSessionId: this.scanSessionId,
            });
            return;
          }

          if (this.scanSessionId !== scanSessionId || this.state !== 'scanning') {
            logBtScanDebug('device_filtered_out', {
              reason: 'stale_scan_session',
              scanSessionId,
              activeScanSessionId: this.scanSessionId,
            });
            logBtBlockerDebug('filtered_device', {
              reason: 'stale_scan_session',
              scanSessionId,
              activeScanSessionId: this.scanSessionId,
            });
            return;
          }

          if (error) {
            logTelemetryScanWarnOnce('Scan callback error', {
              error: error?.message ?? String(error),
            });
            logBtScanWarn('callback_error', {
              error: error?.message ?? String(error),
            });
            logBtScanWarn('scan_error', {
              error: error?.message ?? String(error),
              phase: 'device_callback',
            });
            logBtScanWarn('device_filtered_out', {
              reason: 'scan_callback_error',
              error: error?.message ?? String(error),
            });
            logBtBlockerWarn('filtered_device', {
              reason: 'scan_callback_error',
              error: error?.message ?? String(error),
            });
            return;
          }

          const now = Date.now();
          this.rawDeviceCallbacksCount += 1;
          const rawDeviceId = typeof device?.id === 'string' && device.id.trim().length > 0
            ? device.id.trim()
            : null;
          const advertisedName = this.normalizeScanName(device?.name);
          const localName = this.normalizeScanName(device?.localName);
          const incomingManufacturerData = typeof device?.manufacturerData === 'string' && device.manufacturerData.length > 0
            ? device.manufacturerData
            : null;
          const deviceId = rawDeviceId ?? this.buildTemporaryDiscoveryId({
            advertisedName,
            localName,
            manufacturerData: incomingManufacturerData,
            rssi: typeof device?.rssi === 'number' ? device.rssi : null,
            now,
          });

          if (!deviceId) {
            this.unidentifiedRawDeviceCallbacksCount += 1;
            this.updateScanDiagnostics({
              rawDeviceCallbacksCount: this.rawDeviceCallbacksCount,
              rawDevicesSeenCount: this.rawScanDeviceIds.size + this.unidentifiedRawDeviceCallbacksCount,
            });
            logBtScanWarn('filtered_device', {
              reason: 'missing_stable_identifier',
            });
            logBtScanWarn('device_filtered_out', {
              reason: 'missing_stable_identifier',
            });
            logBtBlockerWarn('filtered_device', {
              reason: 'missing_stable_identifier',
            });
            return;
          }
          this.rawScanDeviceIds.add(deviceId);

          const existing = this.discovered.get(deviceId);
          const serviceUUIDs = this.mergeServiceUUIDs(existing?.serviceUUIDs, device.serviceUUIDs);
          const manufacturerData = incomingManufacturerData ?? existing?.manufacturerData ?? null;
          const isLikelyOBD = this.isLikelyOBDDevice(
            advertisedName ??
              localName ??
              (existing && !this.isFallbackScanName(existing.name) ? existing.name : ''),
            serviceUUIDs,
          );
          const derivedName = this.deriveScanDisplayName({
            deviceId,
            advertisedName,
            localName,
            existingName: existing?.name,
            isLikelyOBD,
          });
          if (isLikelyOBD && this.shouldLogRawScanSighting(`obd2:${deviceId}`)) {
            logObd2Debug('device_discovered', {
              deviceId,
              displayName: derivedName.name,
              advertisedName: advertisedName ?? null,
              localName: localName ?? null,
              rssi: typeof device.rssi === 'number' ? device.rssi : null,
              serviceUuidCount: serviceUUIDs?.length ?? 0,
              manufacturerDataPresent: !!manufacturerData,
              transport: 'ble',
            });
          }
          if (!existing) {
            recordBluetoothDiagnosticEvent({
              type: 'device_discovered',
              source: 'native_ble',
              deviceId,
              deviceName: derivedName.name,
              providerId: 'obd2',
              message: 'OBD2 scan saw a nearby BLE advertisement.',
              details: {
                rssi: typeof device.rssi === 'number' ? device.rssi : null,
                serviceUUIDs,
                manufacturerDataPresent: !!manufacturerData,
              },
            });
            recordBluetoothDiagnosticEvent({
              type: 'device_classified',
              source: 'native_ble',
              deviceId,
              deviceName: derivedName.name,
              providerId: 'obd2',
              message: isLikelyOBD
                ? 'Nearby BLE advertisement classified as likely OBD2.'
                : 'Nearby BLE advertisement is not confidently classified as OBD2.',
              details: {
                category: isLikelyOBD ? 'obd2' : 'unknown',
                confidence: isLikelyOBD ? 0.9 : 0.15,
              },
            });
          }
          logObdScanDebug('classified', {
            deviceId,
            confidence: isLikelyOBD ? 0.9 : 0.15,
            category: isLikelyOBD ? 'obd' : 'unknown',
          });

          if (!existing || advertisedName || localName) {
            logBtScanDebug('raw_device', {
              deviceId,
              advertisedName: advertisedName ?? null,
              localName: localName ?? null,
              rssi: typeof device.rssi === 'number' ? device.rssi : null,
              serviceUuidCount: serviceUUIDs?.length ?? 0,
              manufacturerDataPresent: typeof device.manufacturerData === 'string' && device.manufacturerData.length > 0,
            });
            logBtBlockerDebug('raw_device', {
              deviceId,
              advertisedName: advertisedName ?? null,
              localName: localName ?? null,
              rssi: typeof device.rssi === 'number' ? device.rssi : null,
              serviceUuidCount: serviceUUIDs?.length ?? 0,
              manufacturerDataPresent: typeof device.manufacturerData === 'string' && device.manufacturerData.length > 0,
            });
          }
          if (this.shouldLogRawScanSighting(deviceId)) {
            logBtScanDebug('device_raw_seen', {
              deviceId,
              advertisedName: advertisedName ?? null,
              localName: localName ?? null,
              rssi: typeof device.rssi === 'number' ? device.rssi : null,
              serviceUuidCount: serviceUUIDs?.length ?? 0,
              manufacturerDataPresent: typeof device.manufacturerData === 'string' && device.manufacturerData.length > 0,
            });
          }

          const entry: OBD2DiscoveredDevice = {
            id: deviceId,
            name: derivedName.name,
            rssi: typeof device.rssi === 'number' ? device.rssi : existing?.rssi ?? -100,
            isLikelyOBD,
            lastSeenAt: now,
            serviceUUIDs,
            manufacturerData,
          };

          const isNew = !existing;
          this.discovered.set(deviceId, entry);
          this.updateScanDiagnostics({
            rawDeviceCallbacksCount: this.rawDeviceCallbacksCount,
            rawDevicesSeenCount: this.rawScanDeviceIds.size + this.unidentifiedRawDeviceCallbacksCount,
            acceptedDevicesCount: this.discovered.size,
            likelyObdDevicesCount: Array.from(this.discovered.values()).filter((candidate) => candidate.isLikelyOBD).length,
            lastScanError: null,
          });

          if (this.shouldNotifyForScanEntry(existing, entry)) {
            logTelemetryDebug('Discovered device', {
              deviceId,
              name: entry.name,
              isLikelyOBD,
              rssi: entry.rssi,
            });
            logBtScanDebug('accepted_device', {
              deviceId: entry.id,
              displayName: entry.name,
              nameSource: derivedName.source,
              isLikelyOBD: entry.isLikelyOBD,
              rssi: entry.rssi,
              serviceUuidCount: entry.serviceUUIDs?.length ?? 0,
              isNew,
            });
            logBtScanDebug('device_normalized', {
              deviceId: entry.id,
              displayName: entry.name,
              nameSource: derivedName.source,
              isLikelyOBD: entry.isLikelyOBD,
              rssi: entry.rssi,
              serviceUuidCount: entry.serviceUUIDs?.length ?? 0,
              manufacturerDataPresent: !!entry.manufacturerData,
            });
            if (isNew) {
              logBtScanDebug('device_added', {
                deviceId: entry.id,
                displayName: entry.name,
                isLikelyOBD: entry.isLikelyOBD,
                discoveredDeviceCount: this.discovered.size,
              });
            }
            logBtBlockerDebug('accepted_device', {
              deviceId: entry.id,
              displayName: entry.name,
              nameSource: derivedName.source,
              isLikelyOBD: entry.isLikelyOBD,
              rssi: entry.rssi,
              serviceUuidCount: entry.serviceUUIDs?.length ?? 0,
              isNew,
            });
            logBtScanDebug('render_count', {
              discoveredDeviceCount: this.discovered.size,
              likelyObdCount: Array.from(this.discovered.values()).filter((candidate) => candidate.isLikelyOBD).length,
            });
            logBtScanDebug('normalized_count', {
              normalizedDeviceCount: this.discovered.size,
              acceptedDeviceCount: this.discovered.size,
              latestDeviceId: entry.id,
            });
            logBtBlockerDebug('normalized_count', {
              normalizedDeviceCount: this.discovered.size,
              acceptedDeviceCount: this.discovered.size,
              latestDeviceId: entry.id,
            });
            this.notify();
          }
        },
      );

      const startTime = Date.now();
      this.scanProgressTimer = setInterval(() => {
        if (this.isDestroyed || this.scanSessionId !== scanSessionId) {
          this.clearScanTimers();
          return;
        }
        const elapsed = Date.now() - startTime;
        this.scanProgress = Math.min(elapsed / normalizedDurationMs, 1);
        this.notify();
      }, 500);

      this.scanTimeoutTimer = setTimeout(() => {
        if (this.isDestroyed || this.scanSessionId !== scanSessionId) return;
        this.stopScan('timeout');
      }, normalizedDurationMs);

    } catch (err: any) {
      const msg = err?.message ?? 'Failed to start Bluetooth scan';
      logTelemetryScanWarnOnce('Scan start failed', { error: msg });
      logBtScanWarn('start_failed', { error: msg });
      logBtScanWarn('scan_error', { error: msg, phase: 'start_scan' });
      logBtScanWarn('scan_stopped', {
        reason: 'start_failed',
        error: msg,
        discoveredDeviceCount: this.discovered.size,
      });
      logBtBlockerWarn('scan_stop', {
        reason: 'start_failed',
        error: msg,
      });
      recordBluetoothDiagnosticEvent({
        type: 'scanner_stop',
        source: classifyBluetoothDiagnosticSource(msg, 'native_ble'),
        providerId: 'obd2',
        message: 'OBD2 BLE scanner failed to start.',
        error: msg,
        details: {
          scanId: `obd2:${scanSessionId}`,
          reason: 'start_failed',
        },
      });
      this.error = msg;
      this.updateScanDiagnostics({
        lastScanError: msg,
        scanState: 'error',
      });
      this.setState('error');
      this.finishScanLifecycle(scanSessionId, 'start_failed');
    }
  }

  async stopScan(reason: string = 'manual'): Promise<void> {
    this.scanSessionId += 1;
    this.scanStartedAt = null;
    this.lastScanFinishedAt = Date.now();
    this.clearScanTimers();
    ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] scan_stop', { reason });
    this.stopNativeDeviceScan(reason, true);
    recordBluetoothDiagnosticEvent({
      type: 'scanner_stop',
      source: 'native_ble',
      providerId: 'obd2',
      message: `OBD2 BLE scanner stopped: ${reason}.`,
      details: {
        reason,
        rawDeviceCallbacksCount: this.rawDeviceCallbacksCount,
        acceptedDevicesCount: this.discovered.size,
      },
    });

    this.scanProgress = 1;
    this.updateScanDiagnostics({ scanState: 'idle' });
    if (this.state === 'scanning' || this.state === 'requesting_permissions') {
      this.setState('idle');
    }
  }

  private finishScanLifecycle(scanSessionId: number, reason: string): void {
    if (this.scanSessionId !== scanSessionId) return;
    this.scanStartedAt = null;
    this.lastScanFinishedAt = Date.now();
    this.clearScanTimers();
    logBtScanDebug('scan_finished', {
      reason,
      scanSessionId,
      discoveredDeviceCount: this.discovered.size,
    });
  }

  private clearScanTimers(): void {
    if (this.scanTimeoutTimer) {
      clearTimeout(this.scanTimeoutTimer);
      this.scanTimeoutTimer = null;
    }
    if (this.scanProgressTimer) {
      clearInterval(this.scanProgressTimer);
      this.scanProgressTimer = null;
    }
  }

  private stopNativeDeviceScan(reason: string, shouldLog: boolean): void {
    try {
      const mgr = getBleManager();
      mgr.stopDeviceScan();
      if (shouldLog) {
        logTelemetryDebug('Scan stopped', { discoveredDeviceCount: this.discovered.size });
        logBtScanDebug('stop', { discoveredDeviceCount: this.discovered.size });
        logBtScanDebug('scan_stopped', {
          reason,
          discoveredDeviceCount: this.discovered.size,
        });
        logBtBlockerDebug('scan_stop', {
          reason,
          discoveredDeviceCount: this.discovered.size,
        });
      }
    } catch {
      if (shouldLog) {
        logBtScanDebug('scan_stopped', {
          reason,
          managerReady: false,
          discoveredDeviceCount: this.discovered.size,
        });
        logBtBlockerDebug('scan_stop', {
          reason,
          managerReady: false,
          discoveredDeviceCount: this.discovered.size,
        });
      }
    }
  }

  private async waitForPoweredOn(
    manager: any,
    initialState: string | null,
    timeoutMs: number = 2500,
  ): Promise<string | null> {
    return await waitForBlePoweredOn(manager, initialState, timeoutMs);
  }

  getDiscoveredDevices(): OBD2DiscoveredDevice[] {
    const devices = Array.from(this.discovered.values());
    return devices.sort((a, b) => {
      if (a.isLikelyOBD && !b.isLikelyOBD) return -1;
      if (!a.isLikelyOBD && b.isLikelyOBD) return 1;
      return (b.rssi ?? -100) - (a.rssi ?? -100);
    });
  }

  private isLikelyOBDDevice(name: string, serviceUUIDs?: string[]): boolean {
    const hasObdName = OBD2_NAME_PATTERNS.some((pattern) => pattern.test(name));
    if (hasObdName) return true;

    if (serviceUUIDs && serviceUUIDs.length > 0) {
      for (const uuid of serviceUUIDs) {
        const lower = uuid.toLowerCase();
        if (OBD2_SERVICE_UUIDS.some(obd => lower.includes(obd.toLowerCase()))) {
          return true;
        }
      }
    }

    return false;
  }

  private normalizeScanName(name: unknown): string | null {
    if (typeof name !== 'string') return null;
    const trimmed = name.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private buildFallbackScanName(deviceId: string, isLikelyOBD: boolean): string {
    const suffix = deviceId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
    return `${isLikelyOBD ? 'OBD2 Adapter' : 'Unknown device'} ${suffix}`;
  }

  private buildTemporaryDiscoveryId({
    advertisedName,
    localName,
    manufacturerData,
    rssi,
    now,
  }: {
    advertisedName: string | null;
    localName: string | null;
    manufacturerData: string | null;
    rssi: number | null;
    now: number;
  }): string | null {
    const label = advertisedName ?? localName;
    if (!label && !manufacturerData) return null;
    const normalizedLabel = (label ?? 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const normalizedManufacturer = (manufacturerData ?? 'no-manufacturer').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const rssiBucket = typeof rssi === 'number' && Number.isFinite(rssi)
      ? Math.round(rssi / 10) * 10
      : 'unknown';
    const timestampBucket = Math.floor(now / 30_000);
    return [
      'temporary',
      'ble',
      normalizedLabel || 'unknown',
      normalizedManufacturer || 'no-manufacturer',
      rssiBucket,
      timestampBucket,
    ].join(':');
  }

  private isFallbackScanName(name: string | null | undefined): boolean {
    if (!name) return false;
    return /^(OBD2 Adapter|Bluetooth Device|Unknown device)( [A-Z0-9]{4})?$/.test(name);
  }

  private deriveScanDisplayName({
    deviceId,
    advertisedName,
    localName,
    existingName,
    isLikelyOBD,
  }: {
    deviceId: string;
    advertisedName: string | null;
    localName: string | null;
    existingName?: string;
    isLikelyOBD: boolean;
  }): { name: string; source: 'advertised' | 'local' | 'existing' | 'fallback' } {
    if (advertisedName) {
      return { name: advertisedName, source: 'advertised' };
    }
    if (localName) {
      return { name: localName, source: 'local' };
    }
    if (existingName && !this.isFallbackScanName(existingName)) {
      return { name: existingName, source: 'existing' };
    }
    return {
      name: this.buildFallbackScanName(deviceId, isLikelyOBD),
      source: 'fallback',
    };
  }

  private mergeServiceUUIDs(
    existing: string[] | undefined,
    incoming: string[] | undefined,
  ): string[] | undefined {
    const next = [...(existing ?? []), ...(incoming ?? [])]
      .map((uuid) => (typeof uuid === 'string' ? uuid.trim() : ''))
      .filter((uuid) => uuid.length > 0);

    if (next.length === 0) {
      return undefined;
    }

    return Array.from(new Set(next));
  }

  private getSignalBucket(rssi: number): number {
    if (rssi >= -60) return 4;
    if (rssi >= -72) return 3;
    if (rssi >= -84) return 2;
    if (rssi >= -96) return 1;
    return 0;
  }

  private shouldLogRawScanSighting(deviceId: string): boolean {
    const now = Date.now();
    const previous = this.rawScanLogAtByDeviceId.get(deviceId) ?? 0;
    if (now - previous < 2500) return false;
    this.rawScanLogAtByDeviceId.set(deviceId, now);
    return true;
  }

  private shouldNotifyForScanEntry(
    previous: OBD2DiscoveredDevice | undefined,
    next: OBD2DiscoveredDevice,
  ): boolean {
    if (!previous) return true;
    if (previous.name !== next.name) return true;
    if (previous.isLikelyOBD !== next.isLikelyOBD) return true;
    if ((previous.serviceUUIDs?.length ?? 0) !== (next.serviceUUIDs?.length ?? 0)) return true;
    if ((previous.manufacturerData ?? null) !== (next.manufacturerData ?? null)) return true;
    if (this.getSignalBucket(previous.rssi) !== this.getSignalBucket(next.rssi)) return true;
    return false;
  }

  // ═══════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════

  async connectToDevice(deviceId: string, deviceName?: string): Promise<boolean> {
    await this.stopScan('connect_attempt');

    const name = deviceName || this.discovered.get(deviceId)?.name || `OBD-II (${deviceId.slice(-6)})`;

    this.error = null;
    this.setState('connecting');
    logTelemetryDebug('Connecting to device', { deviceId, name });
    logObdConnectDebug('start', { deviceId });
    logObd2Debug('connect_start', {
      deviceId,
      name,
      transport: 'ble',
    });
    recordBluetoothDiagnosticEvent({
      type: 'connect_start',
      source: 'native_ble',
      deviceId,
      deviceName: name,
      providerId: 'obd2',
      message: 'OBD2 native BLE connection started.',
      details: {
        transport: 'ble',
      },
    });

    const existingDevice = vehicleTelemetryDeviceRegistry.getById(deviceId);
    if (existingDevice) {
      vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'connecting');
    }

    try {
      const mgr = getBleManager();

      logTelemetryDebug('Initiating BLE pairing...');
      const device = await mgr.connectToDevice(deviceId, {
        requestMTU: 512,
        timeout: 15000,
      });

      logTelemetryDebug('Discovering services and characteristics...');
      vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'discovering_services');
      await device.discoverAllServicesAndCharacteristics();
      const discoveredServices = await device.services().catch(() => []);
      logObdConnectDebug('services_discovered', {
        deviceId,
        count: Array.isArray(discoveredServices) ? discoveredServices.length : 0,
      });
      recordBluetoothDiagnosticEvent({
        type: 'service_discovery_success',
        source: 'native_ble',
        deviceId,
        deviceName: name,
        providerId: 'obd2',
        message: 'OBD2 BLE service discovery completed.',
        details: {
          serviceCount: Array.isArray(discoveredServices) ? discoveredServices.length : 0,
        },
      });

      this.connectedDeviceId = deviceId;
      this.connectedDeviceName = name;
      this.connectedDeviceRef = device;
      this.reconnectAttempt = 0;
      this.backoff.reset();

      logTelemetryDebug('Connected successfully', { name, deviceId });

      vehicleTelemetryService.registerDevice(
        'obd2', deviceId, name,
        {
          hasSpeed: false, hasRpm: false, hasEngineLoad: false,
          hasCoolantTemp: false, hasIntakeTemp: false, hasBatteryVoltage: true,
          hasFuelLevel: false, hasFuelRate: false, hasEngineRuntime: false,
          hasTirePressure: false, hasDTCs: false,
        },
        { protocol: 'OBD-II' },
      );
      vehicleTelemetryService.changePrimaryDevice(deviceId);
      vehicleTelemetryService.setActiveProvider('obd2');

      try {
        vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'reading');
        await this.startPidTelemetry(deviceId);
      } catch (telemetryError: any) {
        const unsupportedReason = telemetryError?.message ?? 'Connected device telemetry is not yet decoded.';
        this.error = unsupportedReason;
        logObd2Warn('connect_error', {
          deviceId,
          phase: 'telemetry_init',
          reason: unsupportedReason,
        });
        logObdConnectWarn('unsupported', {
          deviceId,
          reason: unsupportedReason,
        });
        recordBluetoothDiagnosticEvent({
          type: /transport|characteristic|service|unsupported/i.test(unsupportedReason)
            ? 'service_discovery_failure'
            : 'obd2_handshake',
          source: classifyBluetoothDiagnosticSource(unsupportedReason, 'obd2_pid'),
          deviceId,
          deviceName: name,
          providerId: 'obd2',
          message: 'OBD2 connected transport could not start live PID telemetry.',
          error: unsupportedReason,
          details: {
            phase: 'telemetry_init',
          },
        });
        this.stopPidTelemetry();
        try {
          await mgr.cancelDeviceConnection(deviceId);
        } catch {}
        this.connectedDeviceId = null;
        this.connectedDeviceName = null;
        this.connectedDeviceRef = null;
        const failedState = /transport|characteristic|service|unsupported/i.test(unsupportedReason)
          ? 'unsupported'
          : 'failed';
        vehicleTelemetryService.updateDeviceConnectionState(deviceId, failedState);
        vehicleTelemetryService.clearActiveProvider();
        this.setState('error');
        this.emitEvent('error', { at: Date.now(), message: unsupportedReason });
        return false;
      }

      vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'connected');
      vehicleTelemetryService.setActiveProvider('obd2');
      recordBluetoothDiagnosticEvent({
        type: 'connect_success',
        source: 'native_ble',
        deviceId,
        deviceName: name,
        providerId: 'obd2',
        message: 'OBD2 native BLE connection and handshake succeeded.',
        details: {
          transport: 'ble',
        },
      });

      this.persistLastDevice(deviceId, name);
      this.autoReconnectEnabled = true;
      sSet(OBD2_STORAGE_KEYS.AUTO_RECONNECT, 'true');
      this.monitorDisconnection(device);
      this.startHealthCheck();

      this.setState('connected');
      this.emitEvent('connected', { at: Date.now(), deviceId, deviceName: name });
      this.emitEvent('connect', { at: Date.now(), deviceId, deviceName: name });
      return true;

    } catch (err: any) {
      const msg = err?.message ?? 'Connection failed';
      logTelemetryWarn('Connection failed', { error: msg, deviceId, name });
      logObdConnectWarn('failure', { deviceId, reason: msg });
      logObd2Warn('connect_error', {
        deviceId,
        phase: 'connect',
        reason: msg,
      });
      recordBluetoothDiagnosticEvent({
        type: 'connect_failure',
        source: classifyBluetoothDiagnosticSource(msg, 'native_ble'),
        deviceId,
        deviceName: name,
        providerId: 'obd2',
        message: 'OBD2 native BLE connection failed.',
        error: msg,
        details: {
          phase: 'connect',
        },
      });
      this.error = msg;
      this.stopPidTelemetry();
      this.connectedDeviceId = null;
      this.connectedDeviceName = null;
      this.connectedDeviceRef = null;
      vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'failed');
      vehicleTelemetryService.clearActiveProvider();

      this.setState('error');
      this.emitEvent('error', { at: Date.now(), message: msg });
      return false;
    }
  }

  async disconnect(): Promise<void> {
    const disconnectingDeviceId = this.connectedDeviceId;
    const disconnectingDeviceName = this.connectedDeviceName;
    recordBluetoothDiagnosticEvent({
      type: 'disconnect_start',
      source: 'native_ble',
      deviceId: disconnectingDeviceId ?? undefined,
      deviceName: disconnectingDeviceName ?? undefined,
      providerId: 'obd2',
      message: 'OBD2 disconnect requested.',
    });
    this.cancelReconnect();
    this.stopHealthCheck();
    this.stopPidTelemetry();
    this.removeDisconnectionMonitor();
    this.autoReconnectEnabled = false;
    sSet(OBD2_STORAGE_KEYS.AUTO_RECONNECT, 'false');

    // Stop polling first
    try {
      vehicleTelemetryService.stopPolling();
    } catch {}

    if (this.connectedDeviceRef && this.connectedDeviceId) {
      const deviceId = this.connectedDeviceId;
      const name = this.connectedDeviceName;

      try {
        const mgr = getBleManager();
        await mgr.cancelDeviceConnection(deviceId);
        logTelemetryDebug('Disconnected', { name, deviceId });
        recordBluetoothDiagnosticEvent({
          type: 'disconnect_success',
          source: 'native_ble',
          deviceId,
          deviceName: name ?? undefined,
          providerId: 'obd2',
          message: 'OBD2 native BLE device disconnected.',
        });
      } catch {
        // Device may already be disconnected
        recordBluetoothDiagnosticEvent({
          type: 'disconnect_failure',
          source: 'native_ble',
          deviceId,
          deviceName: name ?? undefined,
          providerId: 'obd2',
          message: 'OBD2 native disconnect reported an error or already disconnected.',
        });
      }

      vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'disconnected');
    }

    this.connectedDeviceId = null;
    this.connectedDeviceName = null;
    this.connectedDeviceRef = null;
    this.reconnectAttempt = 0;
    this.error = null;
    vehicleTelemetryService.clearActiveProvider();
    vehicleTelemetryStore.clear();

    this.setState('idle');
    this.emitEvent('disconnected', { at: Date.now(), reason: 'user_disconnect', requested: true });
    this.emitEvent('disconnect', { at: Date.now(), reason: 'user_disconnect', requested: true });
  }

  // ═══════════════════════════════════════════════════════
  // AUTO-RECONNECT (Phase 2D Enhanced)
  // ═══════════════════════════════════════════════════════

  async attemptReconnect(): Promise<boolean> {
    if (this.state === 'connected' || this.state === 'connecting' || this.state === 'reconnecting') {
      return false;
    }

    const lastDeviceId = sGet(OBD2_STORAGE_KEYS.LAST_DEVICE_ID);
    const lastDeviceName = sGet(OBD2_STORAGE_KEYS.LAST_DEVICE_NAME);

    if (!lastDeviceId) {
      logTelemetryDebug('No previous device to reconnect to');
      return false;
    }

    // Phase 2D: Validate device still exists in registry
    const registeredDevice = vehicleTelemetryDeviceRegistry.getById(lastDeviceId);
    if (!registeredDevice) {
      logTelemetryDebug('Previous device not in registry — skipping reconnect', {
        deviceId: lastDeviceId,
      });
      return false;
    }

    this.reconnectAttempt++;
    this.setState('reconnecting');
    logTelemetryDebug('Reconnect attempt', {
      attempt: this.reconnectAttempt,
      maxAttempts: OBD2Adapter.MAX_RECONNECT_ATTEMPTS,
      deviceId: lastDeviceId,
      deviceName: lastDeviceName,
    });
    this.emitEvent('reconnecting', {
      at: Date.now(),
      attempt: this.reconnectAttempt,
      deviceId: lastDeviceId,
      deviceName: lastDeviceName ?? undefined,
    });
    this.emitEvent('reconnect_start', {
      at: Date.now(),
      attempt: this.reconnectAttempt,
      deviceId: lastDeviceId,
      deviceName: lastDeviceName ?? undefined,
    });

    try {
      const mgr = getBleManager();

      const device = await mgr.connectToDevice(lastDeviceId, {
        requestMTU: 512,
        timeout: 10000,
      });

      await device.discoverAllServicesAndCharacteristics();

      this.connectedDeviceId = lastDeviceId;
      this.connectedDeviceName = lastDeviceName || `OBD-II (${lastDeviceId.slice(-6)})`;
      this.connectedDeviceRef = device;
      this.reconnectAttempt = 0;
      this.backoff.reset();

      logTelemetryDebug('Reconnected successfully', {
        deviceName: this.connectedDeviceName,
      });

      vehicleTelemetryService.updateDeviceConnectionState(lastDeviceId, 'reading');
      await this.startPidTelemetry(lastDeviceId);
      vehicleTelemetryService.signalReconnected(lastDeviceId);
      this.monitorDisconnection(device);
      this.startHealthCheck();

      this.setState('connected');
      this.emitEvent('reconnected', {
        at: Date.now(),
        attempt: this.reconnectAttempt,
        deviceId: lastDeviceId,
        deviceName: this.connectedDeviceName ?? undefined,
      });
      this.emitEvent('reconnect_success', {
        at: Date.now(),
        attempt: this.reconnectAttempt,
        deviceId: lastDeviceId,
        deviceName: this.connectedDeviceName ?? undefined,
      });
      return true;

    } catch (err: any) {
      logTelemetryWarn('Reconnect attempt failed', {
        attempt: this.reconnectAttempt,
        error: err?.message ?? 'unknown',
      });
      this.stopPidTelemetry();

      // Phase 2D: Signal reconnect failure to VT service
      if (this.reconnectAttempt >= OBD2Adapter.MAX_RECONNECT_ATTEMPTS) {
        vehicleTelemetryService.signalReconnectFailed(lastDeviceId);
        logTelemetryWarn('Max reconnect attempts reached — giving up', {
          maxAttempts: OBD2Adapter.MAX_RECONNECT_ATTEMPTS,
        });
        this.reconnectAttempt = 0;
        this.setState('idle');
      } else if (this.autoReconnectEnabled && !this.isDestroyed) {
        const delay = this.backoff.next();
        logTelemetryDebug('Scheduling next reconnect', { delayMs: delay });
        this.reconnectTimer = setTimeout(() => {
          if (this.autoReconnectEnabled && !this.isDestroyed) {
            this.attemptReconnect();
          }
        }, delay);
        // Stay in reconnecting state
      } else {
        vehicleTelemetryService.signalReconnectFailed(lastDeviceId);
        this.setState('idle');
      }

      this.emitEvent('reconnect_failed', {
        at: Date.now(),
        attempt: this.reconnectAttempt,
        deviceId: lastDeviceId,
        deviceName: lastDeviceName ?? undefined,
        reason: err?.message ?? 'Reconnect failed',
      });
      this.emitEvent('error', {
        at: Date.now(),
        message: err?.message ?? 'Reconnect failed',
      });

      return false;
    }
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.resumeReconnectTimer) {
      clearTimeout(this.resumeReconnectTimer);
      this.resumeReconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    this.backoff.reset();
  }

  // ═══════════════════════════════════════════════════════
  // DISCONNECTION MONITORING
  // ═══════════════════════════════════════════════════════

  private monitorDisconnection(device: any): void {
    try {
      const mgr = getBleManager();
      this.removeDisconnectionMonitor();
      this.disconnectSubscription = mgr.onDeviceDisconnected(
        device.id,
        (error: any, _disconnectedDevice: any) => {
          this.disconnectSubscription = null;
          if (this.connectedDeviceId === device.id) {
            logTelemetryWarn('Device disconnected', {
              deviceId: device.id,
              reason: error?.message ?? 'clean disconnect',
            });

            const deviceId = this.connectedDeviceId;
            this.connectedDeviceRef = null;
            this.stopHealthCheck();
            this.stopPidTelemetry();

            // Stop polling on disconnect
            try {
              vehicleTelemetryService.stopPolling();
            } catch {}

            if (deviceId) {
              vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'disconnected');
            }

            // Phase 2D: Attempt auto-reconnect with VT service signaling
            if (this.autoReconnectEnabled && !this.isDestroyed) {
              logTelemetryDebug('Auto-reconnect enabled — will attempt quiet reconnection');
              this.setState('reconnecting');
              this.emitEvent('reconnecting', {
                at: Date.now(),
                attempt: this.reconnectAttempt + 1,
                deviceId,
                deviceName: this.connectedDeviceName ?? undefined,
                reason: error?.message ?? 'connection_dropped',
              });
              this.emitEvent('reconnect_start', {
                at: Date.now(),
                attempt: this.reconnectAttempt + 1,
                deviceId,
                deviceName: this.connectedDeviceName ?? undefined,
                reason: error?.message ?? 'connection_dropped',
              });
              const delay = this.backoff.next();
              this.reconnectTimer = setTimeout(() => {
                if (this.autoReconnectEnabled && !this.isDestroyed) {
                  this.attemptReconnect();
                }
              }, delay);
            } else {
              this.connectedDeviceId = null;
              this.connectedDeviceName = null;
              this.setState('idle');
              this.emitEvent('disconnected', {
                at: Date.now(),
                deviceId,
                reason: error?.message ?? 'connection_dropped',
              });
              this.emitEvent('disconnect', {
                at: Date.now(),
                deviceId,
                reason: error?.message ?? 'connection_dropped',
              });
            }
          }
        },
      );
    } catch (err) {
      logTelemetryWarn('Failed to set up disconnection monitor', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private removeDisconnectionMonitor(): void {
    if (!this.disconnectSubscription) return;
    try {
      this.disconnectSubscription.remove?.();
    } catch {}
    this.disconnectSubscription = null;
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 2D: CONNECTION HEALTH CHECK
  // ═══════════════════════════════════════════════════════

  /**
   * Start periodic health checks on the BLE connection.
   * Detects stale/invalid sessions that the BLE stack
   * might not report via disconnection callbacks.
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.healthCheckTimer = setInterval(async () => {
      if (!this.connectedDeviceRef || !this.connectedDeviceId || this.isDestroyed) {
        this.stopHealthCheck();
        return;
      }

      try {
        const mgr = getBleManager();
        const isConnected = await mgr.isDeviceConnected(this.connectedDeviceId);

        if (!isConnected) {
          logTelemetryWarn('Health check detected stale session', {
            deviceId: this.connectedDeviceId,
          });
          this.connectedDeviceRef = null;
          this.stopHealthCheck();
          this.stopPidTelemetry();

          const deviceId = this.connectedDeviceId;

          // Stop polling
          try {
            vehicleTelemetryService.stopPolling();
          } catch {}

          if (deviceId) {
            vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'disconnected');
          }

          // Attempt reconnect
          if (this.autoReconnectEnabled && !this.isDestroyed) {
            logTelemetryDebug('Stale session — attempting reconnect');
            this.setState('reconnecting');
            this.emitEvent('reconnecting', {
              at: Date.now(),
              attempt: this.reconnectAttempt + 1,
              deviceId,
              deviceName: this.connectedDeviceName ?? undefined,
              reason: 'stale_session',
            });
            this.emitEvent('reconnect_start', {
              at: Date.now(),
              attempt: this.reconnectAttempt + 1,
              deviceId,
              deviceName: this.connectedDeviceName ?? undefined,
              reason: 'stale_session',
            });
            const delay = this.backoff.next();
            this.reconnectTimer = setTimeout(() => {
              if (this.autoReconnectEnabled && !this.isDestroyed) {
                this.attemptReconnect();
              }
            }, delay);
          } else {
            this.connectedDeviceId = null;
            this.connectedDeviceName = null;
            this.setState('idle');
            this.emitEvent('disconnected', {
              at: Date.now(),
              deviceId,
              reason: 'stale_session',
            });
            this.emitEvent('disconnect', {
              at: Date.now(),
              deviceId,
              reason: 'stale_session',
            });
          }
        }
      } catch (err: any) {
        // Health check failure is not critical — just log
        logTelemetryDebug('Health check error', {
          error: err?.message ?? 'unknown',
        });
      }
    }, 30_000); // Check every 30 seconds
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════════
  // APP STATE LISTENER (auto-reconnect on resume)
  // ═══════════════════════════════════════════════════════

  private setupAppStateListener(): void {
    try {
      this.appStateSubscription = AppState.addEventListener(
        'change',
        (nextState: AppStateStatus) => {
          if (nextState === 'active' && this.autoReconnectEnabled && !this.isDestroyed) {
            if (this.state !== 'connected' && this.state !== 'connecting' && this.state !== 'reconnecting') {
              logTelemetryDebug('App resumed — checking connection...');

              // Phase 2D: Validate connection before reconnecting
              if (this.resumeReconnectTimer) {
                clearTimeout(this.resumeReconnectTimer);
              }
              this.resumeReconnectTimer = setTimeout(async () => {
                this.resumeReconnectTimer = null;
                if (this.isDestroyed || !this.autoReconnectEnabled) {
                  return;
                }
                if (this.state === 'connected' || this.state === 'connecting' || this.state === 'reconnecting') {
                  return; // Already handling it
                }

                // Check if the device is still connected (stale session detection)
                if (this.connectedDeviceId && this.connectedDeviceRef) {
                  try {
                    const mgr = getBleManager();
                    const isConnected = await mgr.isDeviceConnected(this.connectedDeviceId);
                    if (isConnected) {
                      logTelemetryDebug('App resumed — connection still valid');
                      return;
                    }
                  } catch {
                    // Fall through to reconnect
                  }
                }

                if (this.autoReconnectEnabled && !this.isDestroyed) {
                  logTelemetryDebug('App resumed — connection invalid, attempting reconnect');
                  this.attemptReconnect();
                }
              }, 1500);
            }
          }
        },
      );
    } catch {
      // AppState may not be available in all environments
    }
  }

  // ═══════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════

  private persistLastDevice(deviceId: string, deviceName: string): void {
    sSet(OBD2_STORAGE_KEYS.LAST_DEVICE_ID, deviceId);
    sSet(OBD2_STORAGE_KEYS.LAST_DEVICE_NAME, deviceName);
  }

  private restoreAutoReconnectState(): void {
    const autoReconnect = sGet(OBD2_STORAGE_KEYS.AUTO_RECONNECT);
    this.autoReconnectEnabled = autoReconnect === 'true';
    if (this.autoReconnectEnabled) {
      logTelemetryDebug('Auto-reconnect enabled from previous session');
    }
  }

  getLastDeviceInfo(): { id: string; name: string } | null {
    const id = sGet(OBD2_STORAGE_KEYS.LAST_DEVICE_ID);
    const name = sGet(OBD2_STORAGE_KEYS.LAST_DEVICE_NAME);
    if (id && name) return { id, name };
    return null;
  }

  isAutoReconnectEnabled(): boolean {
    return this.autoReconnectEnabled;
  }

  /**
   * Phase 2D: Get the connected BLE device reference.
   * Used by VT service for PID polling.
   */
  getConnectedDeviceRef(): any | null {
    return this.connectedDeviceRef;
  }

  private async startPidTelemetry(deviceId: string): Promise<void> {
    if (!this.connectedDeviceRef) {
      throw new Error('OBD-II native transport is not connected.');
    }

    this.stopPidTelemetry();
    logObd2Debug('init_start', {
      deviceId,
      transport: 'ble',
    });
    await this.ensureElmTransport(this.connectedDeviceRef);

    this.pidPoller = new OBD2PIDPoller(
      deviceId,
      {
        onTelemetry: (telemetry) => {
          this.latestTelemetry = telemetry;
          const telemetryRecord = telemetry as unknown as Record<string, unknown>;
          if (!this.diagnosedFirstTelemetryDeviceIds.has(deviceId)) {
            this.diagnosedFirstTelemetryDeviceIds.add(deviceId);
            recordBluetoothDiagnosticEvent({
              type: 'telemetry_first_packet',
              source: 'obd2_pid',
              deviceId,
              providerId: 'obd2',
              message: 'OBD2 live telemetry packet received.',
              details: {
                fields: Object.keys(telemetry).filter((key) => (
                  !['timestamp', 'provider', 'device_id', 'source'].includes(key) &&
                  (telemetry as unknown as Record<string, unknown>)[key] != null
                )),
              },
            });
          }
          logBtScanDebug('telemetry_received', {
            deviceId,
            source: 'obd2',
            hasSpeed: telemetryRecord.speed_kph != null || telemetryRecord.speed_mph != null || telemetryRecord.speed != null,
            hasVoltage: telemetryRecord.battery_voltage != null || telemetryRecord.voltage != null,
          });
          logObd2Debug('telemetry_received', {
            deviceId,
            source: 'bluetooth_obd_live',
            fields: Object.keys(telemetry).filter((key) => (
              !['timestamp', 'provider', 'device_id', 'source'].includes(key) &&
              (telemetry as unknown as Record<string, unknown>)[key] != null
            )),
          });
          logObdConnectDebug('telemetry_decoded', {
            deviceId,
            fields: Object.keys(telemetry).filter((key) => (
              !['timestamp', 'provider', 'device_id'].includes(key) &&
              (telemetry as unknown as Record<string, unknown>)[key] != null
            )),
          });
          this.emitEvent('telemetry', telemetry);
          this.emitEvent('data', telemetry);
        },
        sendCommand: (command) => this.sendElmCommand(command),
        onError: (message) => {
          this.error = message;
          recordBluetoothDiagnosticEvent({
            type: /parse|decode|format/i.test(message) ? 'obd2_parser' : 'obd2_pid',
            source: classifyBluetoothDiagnosticSource(message, /parse|decode|format/i.test(message) ? 'obd2_parser' : 'obd2_pid'),
            deviceId,
            providerId: 'obd2',
            message: 'OBD2 PID polling or parser error.',
            error: message,
          });
          this.emitEvent('error', { at: Date.now(), message });
        },
        onCapabilitiesDiscovered: (supported) => {
          recordBluetoothDiagnosticEvent({
            type: 'obd2_pid',
            source: 'obd2_pid',
            deviceId,
            providerId: 'obd2',
            message: 'OBD2 PID capabilities discovered.',
            details: {
              supported,
            },
          });
          const existing = vehicleTelemetryDeviceRegistry.getById(deviceId);
          if (!existing) return;

          vehicleTelemetryDeviceRegistry.registerDevice({
            provider: existing.provider,
            device_id: existing.device_id,
            device_name: existing.device_name,
            connection_state: existing.connection_state,
            last_seen: existing.last_seen,
            firmware_version: existing.firmware_version,
            protocol: existing.protocol,
            capabilities: {
              ...existing.capabilities,
              hasSpeed: supported.includes('0D'),
              hasRpm: supported.includes('0C'),
              hasEngineLoad: supported.includes('04'),
              hasCoolantTemp: supported.includes('05'),
              hasIntakeTemp: supported.includes('0F'),
              hasBatteryVoltage: true,
              hasFuelLevel: supported.includes('2F'),
              hasFuelRate: supported.includes('5E'),
              hasEngineRuntime: supported.includes('1F'),
            },
          });
        },
      },
      2500,
    );

    const started = await this.pidPoller.start();
    if (!started) {
      recordBluetoothDiagnosticEvent({
        type: 'provider_handshake_failure',
        source: 'obd2_pid',
        deviceId,
        providerId: 'obd2',
        message: 'OBD2 PID poller did not start.',
        error: 'Connected, but ECS could not start live telemetry polling.',
      });
      throw new Error('Connected, but ECS could not start live telemetry polling.');
    }
    recordBluetoothDiagnosticEvent({
      type: 'obd2_handshake',
      source: 'obd2_pid',
      deviceId,
      providerId: 'obd2',
      message: 'OBD2 adapter handshake and PID polling started.',
      details: {
        transport: 'ble',
      },
    });
    recordBluetoothDiagnosticEvent({
      type: 'telemetry_subscription_start',
      source: 'obd2_pid',
      deviceId,
      providerId: 'obd2',
      message: 'OBD2 live PID telemetry subscription started.',
    });
    logObd2Debug('init_success', {
      deviceId,
      transport: 'ble',
    });
    logObdConnectDebug('notifications_subscribed', { deviceId });
  }

  private stopPidTelemetry(): void {
    const stoppedDeviceId = this.connectedDeviceId;
    this.latestTelemetry = null;

    if (this.pidPoller) {
      this.pidPoller.destroy();
      this.pidPoller = null;
      recordBluetoothDiagnosticEvent({
        type: 'telemetry_subscription_stop',
        source: 'obd2_pid',
        deviceId: stoppedDeviceId ?? undefined,
        providerId: 'obd2',
        message: 'OBD2 live PID telemetry subscription stopped.',
      });
    }

    this.clearPendingElmCommand(new Error('OBD-II telemetry stopped.'));

    if (this.elmTransport?.monitorSubscription) {
      try {
        this.elmTransport.monitorSubscription.remove?.();
      } catch {}
    }

    this.elmTransport = null;
    if (stoppedDeviceId) {
      this.diagnosedFirstTelemetryDeviceIds.delete(stoppedDeviceId);
    }
  }

  private async ensureElmTransport(device: any): Promise<void> {
    if (this.elmTransport) return;

    const services = await device.services();
    for (const service of services ?? []) {
      const characteristics = await device.characteristicsForService(service.uuid);
      const txCandidate = this.selectWritableCharacteristic(characteristics ?? []);
      const rxCandidate = this.selectReadableCharacteristic(characteristics ?? [], txCandidate?.uuid ?? null);
      const serviceUuid = this.normalizeUuid(service?.uuid);

      const serviceLooksSupported = OBD2_SERVICE_UUIDS.some((uuid) => serviceUuid.includes(this.normalizeUuid(uuid)));
      if ((!serviceLooksSupported && !txCandidate) || !txCandidate || !rxCandidate) {
        continue;
      }

      const monitorSubscription = device.monitorCharacteristicForService(
        service.uuid,
        rxCandidate.uuid,
        (error: any, characteristic: any) => {
          if (error) {
            recordBluetoothDiagnosticEvent({
              type: 'obd2_parser',
              source: 'obd2_parser',
              deviceId: this.connectedDeviceId ?? device.id,
              providerId: 'obd2',
              message: 'OBD2 ELM327 response monitor failed.',
              error: error?.message ?? 'ELM327 response monitor failed',
            });
            this.emitEvent('error', {
              at: Date.now(),
              message: error?.message ?? 'ELM327 response monitor failed',
            });
            return;
          }

          if (typeof characteristic?.value !== 'string') return;
          const chunk = Buffer.from(characteristic.value, 'base64').toString('utf8');
          this.handleElmResponseChunk(chunk);
        },
      );

      this.elmTransport = {
        serviceUuid: service.uuid,
        txCharacteristicUuid: txCandidate.uuid,
        rxCharacteristicUuid: rxCandidate.uuid,
        monitorSubscription,
      };
      logObdConnectDebug('notifications_subscribed', {
        serviceUuid: service.uuid,
        characteristicUuid: rxCandidate.uuid,
      });
      recordBluetoothDiagnosticEvent({
        type: 'service_discovery_success',
        source: 'native_ble',
        deviceId: this.connectedDeviceId ?? device.id,
        deviceName: this.connectedDeviceName ?? undefined,
        providerId: 'obd2',
        message: 'OBD2 ELM327 transport characteristics selected.',
        details: {
          serviceUuid: service.uuid,
          txCharacteristicUuid: txCandidate.uuid,
          rxCharacteristicUuid: rxCandidate.uuid,
        },
      });
      return;
    }

    recordBluetoothDiagnosticEvent({
      type: 'service_discovery_failure',
      source: 'native_ble',
      deviceId: this.connectedDeviceId ?? device.id,
      deviceName: this.connectedDeviceName ?? undefined,
      providerId: 'obd2',
      message: 'OBD2 BLE device did not expose a supported transport.',
      error: 'Connected device does not expose a supported OBD-II Bluetooth transport.',
    });
    throw new Error('Connected device does not expose a supported OBD-II Bluetooth transport.');
  }

  private selectWritableCharacteristic(characteristics: any[]): any | null {
    const preferred = characteristics.find((characteristic) => {
      const uuid = this.normalizeUuid(characteristic?.uuid);
      return (
        this.isWritableCharacteristic(characteristic) &&
        OBD2_CHARACTERISTIC_UUIDS.some((candidate) => uuid.includes(this.normalizeUuid(candidate)))
      );
    });
    if (preferred) return preferred;
    return characteristics.find((characteristic) => this.isWritableCharacteristic(characteristic)) ?? null;
  }

  private selectReadableCharacteristic(characteristics: any[], txUuid: string | null): any | null {
    const preferred = characteristics.find((characteristic) => {
      const uuid = this.normalizeUuid(characteristic?.uuid);
      return (
        this.isReadableCharacteristic(characteristic) &&
        OBD2_CHARACTERISTIC_UUIDS.some((candidate) => uuid.includes(this.normalizeUuid(candidate)))
      );
    });
    if (preferred) return preferred;
    const txCharacteristic = characteristics.find((characteristic) => characteristic?.uuid === txUuid);
    if (txCharacteristic && this.isReadableCharacteristic(txCharacteristic)) {
      return txCharacteristic;
    }
    return characteristics.find((characteristic) => this.isReadableCharacteristic(characteristic)) ?? null;
  }

  private isWritableCharacteristic(characteristic: any): boolean {
    return (
      characteristic?.isWritableWithResponse === true ||
      characteristic?.isWritableWithoutResponse === true ||
      characteristic?.properties?.Write === 'Write' ||
      characteristic?.properties?.write === true ||
      characteristic?.properties?.WriteWithoutResponse === 'WriteWithoutResponse' ||
      characteristic?.properties?.writeWithoutResponse === true
    );
  }

  private isReadableCharacteristic(characteristic: any): boolean {
    return (
      characteristic?.isNotifiable === true ||
      characteristic?.isIndicatable === true ||
      characteristic?.isReadable === true ||
      characteristic?.properties?.Notify === 'Notify' ||
      characteristic?.properties?.notify === true ||
      characteristic?.properties?.Indicate === 'Indicate' ||
      characteristic?.properties?.indicate === true ||
      characteristic?.properties?.Read === 'Read' ||
      characteristic?.properties?.read === true
    );
  }

  private normalizeUuid(uuid: string | null | undefined): string {
    return String(uuid ?? '').toLowerCase();
  }

  private async sendElmCommand(command: string): Promise<string> {
    if (!this.connectedDeviceRef || !this.elmTransport) {
      throw new Error('OBD-II command transport is unavailable.');
    }

    this.clearPendingElmCommand(new Error('OBD-II command canceled by a newer request.'));

    return await new Promise<string>(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        this.clearPendingElmCommand(new Error('OBD-II adapter timed out waiting for a response.'));
        reject(new Error('OBD-II adapter timed out waiting for a response.'));
      }, 5000);

      this.pendingElmCommand = {
        buffer: '',
        resolve: (response) => {
          clearTimeout(timeout);
          this.pendingElmCommand = null;
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          this.pendingElmCommand = null;
          reject(error);
        },
        timeout,
      };

      try {
        const transport = this.elmTransport;
        if (!transport) {
          throw new Error('OBD-II command transport is unavailable.');
        }
        const encoded = Buffer.from(command, 'utf8').toString('base64');
        try {
          await this.connectedDeviceRef.writeCharacteristicWithResponseForService(
            transport.serviceUuid,
            transport.txCharacteristicUuid,
            encoded,
          );
        } catch {
          await this.connectedDeviceRef.writeCharacteristicWithoutResponseForService(
            transport.serviceUuid,
            transport.txCharacteristicUuid,
            encoded,
          );
        }
      } catch (error: any) {
        this.clearPendingElmCommand(new Error(error?.message ?? 'Failed to send OBD-II command.'));
        reject(new Error(error?.message ?? 'Failed to send OBD-II command.'));
      }
    });
  }

  private handleElmResponseChunk(chunk: string): void {
    if (!this.pendingElmCommand) return;

    this.pendingElmCommand.buffer += chunk;
    if (!this.pendingElmCommand.buffer.includes('>')) {
      return;
    }

    const response = this.pendingElmCommand.buffer.replace(/>/g, '').trim();
    this.pendingElmCommand.resolve(response);
  }

  private clearPendingElmCommand(error?: Error): void {
    if (!this.pendingElmCommand) return;
    clearTimeout(this.pendingElmCommand.timeout);
    if (error) {
      try {
        this.pendingElmCommand.reject(error);
      } catch {}
    }
    this.pendingElmCommand = null;
  }

  // ═══════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════

  destroy(): void {
    this.isDestroyed = true;
    this.cancelReconnect();
    this.stopScan('destroy');
    this.stopHealthCheck();
    this.stopPidTelemetry();
    this.removeDisconnectionMonitor();

    if (this.appStateSubscription) {
      try { this.appStateSubscription.remove(); } catch {}
      this.appStateSubscription = null;
    }

    if (this.connectedDeviceRef) {
      try {
        const mgr = getBleManager();
        mgr.cancelDeviceConnection(this.connectedDeviceId!).catch(() => {});
      } catch {}
    }

    this.listeners = [];
    this.discovered.clear();
    this.connectedDeviceId = null;
    this.connectedDeviceName = null;
    this.connectedDeviceRef = null;
  }
}

// ── Singleton export ─────────────────────────────────────
export const obd2Adapter = new OBD2Adapter();
vehicleTelemetryService.attachAdapter(obd2Adapter as any);


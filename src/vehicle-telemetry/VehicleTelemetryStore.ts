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
  EngineStatus,
  TelemetryFreshnessLabel,
} from './VehicleTelemetryTypes';
import { EMPTY_TELEMETRY, EMPTY_SUMMARY, VT_STORAGE_KEYS } from './VehicleTelemetryTypes';
import { vehicleTelemetryDeviceRegistry } from './VehicleTelemetryDeviceRegistry';

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
};

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
  private listeners: StoreListener[] = [];
  private initialized = false;

  private isReconnecting = false;
  private staleTransitionTimer: ReturnType<typeof setTimeout> | null = null;

  private attachedService: TelemetryServiceLike | null = null;
  private serviceUnsubscribers: (() => void)[] = [];
  private lastConnectionState: VehicleTelemetryConnectionState = 'disconnected';
  private restoredFromPersistence = false;

  constructor() {
    this.restoreLastKnown();
  }

  // ── Persistence ─────────────────────────────────────────

  private restoreLastKnown(): void {
    try {
      const raw = sGet(VT_STORAGE_KEYS.LAST_TELEMETRY);
      if (raw) {
        const parsed = JSON.parse(raw) as NormalizedVehicleTelemetry;
        const timestamp = Number(parsed?.timestamp ?? 0);
        const age = Date.now() - timestamp;

        if (timestamp > 0 && age < LAST_KNOWN_MAX_AGE_MS) {
          this.latestTelemetry = parsed;
          this.restoredFromPersistence = true;
          this.recomputeSummary();
          this.scheduleStaleTransition();
          console.log(TAG, 'Restored last known telemetry');
        } else {
          console.log(TAG, 'Last known telemetry too old — discarded');
          sRemove(VT_STORAGE_KEYS.LAST_TELEMETRY);
        }
      }
    } catch (error) {
      console.warn(TAG, 'Failed to restore telemetry:', error);
    }

    this.initialized = true;
  }

  private persistLatest(): void {
    try {
      if (Number(this.latestTelemetry?.timestamp ?? 0) > 0) {
        sSet(VT_STORAGE_KEYS.LAST_TELEMETRY, JSON.stringify(this.latestTelemetry));
      }
    } catch (error) {
      console.warn(TAG, 'Failed to persist telemetry:', error);
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
  }

  // ── Service helpers ─────────────────────────────────────

  private normalizeConnectionState(value: unknown): VehicleTelemetryConnectionState | null {
    if (value === 'connected' || value === 'connecting' || value === 'disconnected') {
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
      console.warn(TAG, `Failed to register telemetry service listener for ${event}:`, error);
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
      console.log(TAG, 'Telemetry grace window expired — marking as stale');
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
    console.log(TAG, 'Telemetry service connected');
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

    console.log(TAG, 'Telemetry service disconnected');
    this.notify();
  }

  handleReconnectStarted(): void {
    this.lastConnectionState = 'connecting';
    this.isReconnecting = true;
    this.recomputeSummary();
    this.scheduleStaleTransition();
    console.log(TAG, 'Telemetry service reconnecting');
    this.notify();
  }

  handleReconnectSucceeded(): void {
    resetRetryState();
    this.isReconnecting = false;
    this.lastConnectionState = 'connected';
    this.recomputeSummary();
    this.scheduleStaleTransition();
    console.log(TAG, 'Telemetry service reconnected');
    this.notify();
  }

  handleReconnectFailed(): void {
    this.lastConnectionState = 'disconnected';
    this.isReconnecting = true;
    this.recomputeSummary();
    this.scheduleStaleTransition();
    this.callServiceReconnect();
    console.log(TAG, 'Telemetry service reconnect failed');
    this.notify();
  }

  setConnectionState(state: VehicleTelemetryConnectionState): void {
    this.lastConnectionState = state;
    this.recomputeSummary();
    this.notify();
  }

  // ── Data ingestion ──────────────────────────────────────

  ingest(telemetry: NormalizedVehicleTelemetry): void {
    const primary = vehicleTelemetryDeviceRegistry.getPrimary();

    if (primary && telemetry.device_id !== primary.device_id) {
      vehicleTelemetryDeviceRegistry.touchDevice(telemetry.device_id);
      return;
    }

    this.latestTelemetry = telemetry;
    this.lastConnectionState = 'connected';
    this.isReconnecting = false;
    this.restoredFromPersistence = false;

    this.recomputeSummary();
    this.persistLatest();
    this.scheduleStaleTransition();

    if (telemetry.device_id) {
      vehicleTelemetryDeviceRegistry.touchDevice(telemetry.device_id);
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
    console.log(TAG, `Reconnecting state: ${reconnecting}`);
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
    };
  }

  recompute(): void {
    this.recomputeSummary();
    this.notify();
  }

  clear(): void {
    this.latestTelemetry = { ...EMPTY_TELEMETRY };
    this.summary = { ...EMPTY_SUMMARY };
    this.isReconnecting = false;
    this.restoredFromPersistence = false;
    this.lastConnectionState = 'disconnected';
    this.cancelStaleTransition();
    cancelRetries();
    sRemove(VT_STORAGE_KEYS.LAST_TELEMETRY);
    console.log(TAG, 'Store cleared');
    this.notify();
  }
}

export const vehicleTelemetryStore = new VehicleTelemetryStore();

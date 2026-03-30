/**
 * ═══════════════════════════════════════════════════════════
 * ECS VEHICLE TELEMETRY STATE STORE — Phase 2D
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
 *
 * Phase 2D adds:
 *   - TelemetryFreshnessLabel computation (live/reconnecting/stale/disconnected/last_known)
 *   - Last known snapshot preservation during reconnect
 *   - Stale marking after grace window expires
 *   - Reconnect-aware grace window logic
 *   - isShowingLastKnown flag for UI
 *   - Automatic stale transition timer
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

// ── Phase 15: Retry state tracking ──────────────────────────
let _retryCount = 0;
let _retryTimer: any = null;
let _lastRetryAt = 0;

/** Phase 15: Attempt reconnection with exponential backoff */
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
    _retryCount++;
    try {
      connectFn();
    } catch (e) {
      stabilityLog('Telemetry', 'error', 'Retry connection failed', e);
      scheduleRetry(connectFn);
    }
  }, delay);
}

/** Phase 15: Reset retry state on successful connection */
function resetRetryState(): void {
  _retryCount = 0;
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  _lastRetryAt = 0;
}

/** Phase 15: Cancel pending retries */
function cancelRetries(): void {
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  stabilityLog('Telemetry', 'info', 'Pending retries cancelled');
}


// ── Grace window constants ───────────────────────────────
const FRESH_WINDOW_MS = 30_000;     // 30 seconds
const GRACE_WINDOW_MS = 90_000;     // 90 seconds
const LAST_KNOWN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Storage helpers ──────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════
// ENGINE STATUS DERIVATION
// ═══════════════════════════════════════════════════════════

function deriveEngineStatus(telemetry: NormalizedVehicleTelemetry): EngineStatus {
  // If we have RPM data, use it as the primary signal
  if (telemetry.engine_rpm != null) {
    if (telemetry.engine_rpm === 0) return 'off';
    if (telemetry.engine_rpm < 900) return 'idle';
    return 'running';
  }

  // If we have speed data, infer from that
  if (telemetry.vehicle_speed != null) {
    if (telemetry.vehicle_speed > 2) return 'running';
  }

  // If we have engine load, infer from that
  if (telemetry.engine_load != null) {
    if (telemetry.engine_load > 0) return 'running';
    return 'idle';
  }

  // If we have battery voltage, make a rough guess
  if (telemetry.battery_voltage != null) {
    if (telemetry.battery_voltage > 13.5) return 'running'; // alternator charging
    if (telemetry.battery_voltage > 11.5) return 'off'; // battery resting
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
  private listeners: Array<() => void> = [];
  private initialized = false;

  /** Phase 2D: Whether the connection is in a reconnecting state */
  private isReconnecting = false;

  /** Phase 2D: Timer for automatic stale transition */
  private staleTransitionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.restoreLastKnown();
  }

  // ── Persistence ────────────────────────────────────────

  private restoreLastKnown(): void {
    try {
      const raw = sGet(VT_STORAGE_KEYS.LAST_TELEMETRY);
      if (raw) {
        const parsed = JSON.parse(raw) as NormalizedVehicleTelemetry;
        // Only restore if data is less than 24 hours old
        const age = Date.now() - parsed.timestamp;
        if (age < LAST_KNOWN_MAX_AGE_MS) {
          this.latestTelemetry = parsed;
          this.recomputeSummary();
          console.log(TAG, 'Restored last known telemetry');
        } else {
          console.log(TAG, 'Last known telemetry too old — discarded');
        }
      }
    } catch (e) {
      console.warn(TAG, 'Failed to restore telemetry:', e);
    }
    this.initialized = true;
  }

  private persistLatest(): void {
    try {
      if (this.latestTelemetry.timestamp > 0) {
        sSet(VT_STORAGE_KEYS.LAST_TELEMETRY, JSON.stringify(this.latestTelemetry));
      }
    } catch (e) {
      console.warn(TAG, 'Failed to persist telemetry:', e);
    }
  }

  // ── Summary Computation ────────────────────────────────

  private recomputeSummary(): void {
    const t = this.latestTelemetry;
    const primary = vehicleTelemetryDeviceRegistry.getPrimary();

    const hasAnyData = t.timestamp > 0 && (
      t.vehicle_speed != null ||
      t.engine_rpm != null ||
      t.battery_voltage != null ||
      t.fuel_level != null ||
      t.coolant_temp != null ||
      t.engine_load != null
    );

    this.summary = {
      connection_state: primary?.connection_state || 'disconnected',
      engine_status: hasAnyData ? deriveEngineStatus(t) : 'unknown',
      battery_voltage: t.battery_voltage ?? null,
      fuel_level: t.fuel_level ?? null,
      vehicle_speed: t.vehicle_speed ?? null,
      engine_rpm: t.engine_rpm ?? null,
      coolant_temp: t.coolant_temp ?? null,
      last_updated: hasAnyData ? new Date(t.timestamp).toISOString() : null,
      has_data: hasAnyData,
      device_name: primary?.device_name || null,
      provider: primary?.provider || null,
    };
  }

  // ── Notifications ──────────────────────────────────────

  private notify(): void {
    this.listeners.forEach(fn => { try { fn(); } catch {} });
  }

  // ── Stale Transition Timer (Phase 2D) ──────────────────

  private scheduleStaleTransition(): void {
    this.cancelStaleTransition();

    if (!this.summary.has_data || !this.summary.last_updated) return;

    const age = Date.now() - new Date(this.summary.last_updated).getTime();
    const timeUntilStale = GRACE_WINDOW_MS - age;

    if (timeUntilStale <= 0) {
      // Already stale — notify immediately
      return;
    }

    this.staleTransitionTimer = setTimeout(() => {
      console.log(TAG, 'Telemetry grace window expired — marking as stale');
      this.notify(); // Trigger UI update so freshness label changes
    }, timeUntilStale + 500); // Small buffer
  }

  private cancelStaleTransition(): void {
    if (this.staleTransitionTimer) {
      clearTimeout(this.staleTransitionTimer);
      this.staleTransitionTimer = null;
    }
  }

  // ── Public API ─────────────────────────────────────────

  /**
   * Subscribe to store changes.
   */
  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  /**
   * Ingest a new telemetry reading.
   * Called by the Vehicle Telemetry Service when data arrives.
   */
  ingest(telemetry: NormalizedVehicleTelemetry): void {
    // Only accept data from the primary device
    const primary = vehicleTelemetryDeviceRegistry.getPrimary();
    if (primary && telemetry.device_id !== primary.device_id) {
      // Data from non-primary device — ignore for summary
      // but still update the device's last_seen
      vehicleTelemetryDeviceRegistry.touchDevice(telemetry.device_id);
      return;
    }

    this.latestTelemetry = telemetry;
    this.isReconnecting = false; // Fresh data means we're connected
    this.recomputeSummary();
    this.persistLatest();

    // Schedule stale transition for grace window
    this.scheduleStaleTransition();

    // Update device last_seen
    vehicleTelemetryDeviceRegistry.touchDevice(telemetry.device_id);

    this.notify();
  }

  /**
   * Get the current telemetry summary for widget consumption.
   */
  getSummary(): VehicleTelemetrySummary {
    return { ...this.summary };
  }

  /**
   * Get the latest raw telemetry reading.
   */
  getLatestTelemetry(): NormalizedVehicleTelemetry {
    return { ...this.latestTelemetry };
  }

  /**
   * Check if the store has any telemetry data.
   */
  hasData(): boolean {
    return this.summary.has_data;
  }

  /**
   * Check if the store has been initialized (restored from persistence).
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if telemetry data is fresh (less than 30 seconds old).
   */
  isFresh(): boolean {
    if (!this.summary.has_data || !this.summary.last_updated) return false;
    const age = Date.now() - new Date(this.summary.last_updated).getTime();
    return age < FRESH_WINDOW_MS;
  }

  /**
   * Check if telemetry data is stale (more than 90 seconds old).
   */
  isStale(): boolean {
    if (!this.summary.has_data || !this.summary.last_updated) return false;
    const age = Date.now() - new Date(this.summary.last_updated).getTime();
    return age > GRACE_WINDOW_MS;
  }

  /**
   * Grace window state for widgets.
   *
   * States:
   *   - 'fresh'   — Data < 30s old, actively updating
   *   - 'grace'   — Data 30–90s old, show last known values
   *   - 'stale'   — Data > 90s old, revert to placeholder
   *   - 'none'    — No data ever received
   */
  getGraceState(): 'fresh' | 'grace' | 'stale' | 'none' {
    if (!this.summary.has_data || !this.summary.last_updated) return 'none';
    const age = Date.now() - new Date(this.summary.last_updated).getTime();
    if (age < FRESH_WINDOW_MS) return 'fresh';
    if (age <= GRACE_WINDOW_MS) return 'grace';
    return 'stale';
  }

  /**
   * Check if data is within the grace window
   * (fresh or grace — widget should show last known values).
   */
  isWithinGraceWindow(): boolean {
    const state = this.getGraceState();
    return state === 'fresh' || state === 'grace';
  }

  /**
   * Get a human-readable freshness string.
   */
  getFreshnessText(): string {
    if (!this.summary.last_updated) return '';
    const age = Date.now() - new Date(this.summary.last_updated).getTime();
    if (age < 10_000) return 'just now';
    if (age < 60_000) return `${Math.floor(age / 1000)}s ago`;
    if (age < 3600_000) return `${Math.floor(age / 60_000)}m ago`;
    return `${Math.floor(age / 3600_000)}h ago`;
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 2D: FRESHNESS LABEL
  // ═══════════════════════════════════════════════════════

  /**
   * Set the reconnecting state.
   * Called by the VT service when the adapter is reconnecting.
   */
  setReconnecting(reconnecting: boolean): void {
    if (this.isReconnecting === reconnecting) return;
    this.isReconnecting = reconnecting;
    console.log(TAG, `Reconnecting state: ${reconnecting}`);
    this.notify();
  }

  /**
   * Get whether the store is in reconnecting state.
   */
  getIsReconnecting(): boolean {
    return this.isReconnecting;
  }

  /**
   * Phase 2D: Compute the telemetry freshness label.
   *
   * This label is the primary UI indicator for telemetry state:
   *   - 'live'          — Fresh data, actively updating
   *   - 'reconnecting'  — Connection dropped, attempting recovery
   *   - 'stale'         — Data too old, widget should show placeholder
   *   - 'disconnected'  — No connection at all
   *   - 'last_known'    — Showing restored data from previous session
   */
  getFreshnessLabel(): TelemetryFreshnessLabel {
    const primary = vehicleTelemetryDeviceRegistry.getPrimary();

    // No primary device → disconnected
    if (!primary) return 'disconnected';

    // Reconnecting state takes priority
    if (this.isReconnecting) return 'reconnecting';

    // Check connection state
    if (primary.connection_state === 'disconnected' && !this.summary.has_data) {
      return 'disconnected';
    }

    // No data at all
    if (!this.summary.has_data || !this.summary.last_updated) {
      return primary.connection_state === 'connected' ? 'live' : 'disconnected';
    }

    const age = Date.now() - new Date(this.summary.last_updated).getTime();

    // Fresh data from active connection
    if (age < FRESH_WINDOW_MS && primary.connection_state === 'connected') {
      return 'live';
    }

    // Within grace window — show last known
    if (age <= GRACE_WINDOW_MS) {
      if (primary.connection_state === 'connected') return 'live';
      if (this.isReconnecting) return 'reconnecting';
      return 'last_known';
    }

    // Beyond grace window
    if (primary.connection_state === 'connected') {
      // Connected but no fresh data — something is wrong
      return 'stale';
    }

    // Disconnected with old data
    if (age < LAST_KNOWN_MAX_AGE_MS) {
      return 'last_known';
    }

    return 'stale';
  }

  /**
   * Phase 2D: Check if the store is showing last known data
   * (not live — restored from a previous session or from grace window).
   */
  isShowingLastKnown(): boolean {
    const label = this.getFreshnessLabel();
    return label === 'last_known' || label === 'stale';
  }

  /**
   * Force a summary recompute (e.g., after primary device change).
   */
  recompute(): void {
    this.recomputeSummary();
    this.notify();
  }

  /**
   * Clear all telemetry data and reset to empty state.
   */
  clear(): void {
    this.latestTelemetry = { ...EMPTY_TELEMETRY };
    this.summary = { ...EMPTY_SUMMARY };
    this.isReconnecting = false;
    this.cancelStaleTransition();
    this.persistLatest();
    console.log(TAG, 'Store cleared');
    this.notify();
  }
}

// ── Singleton export ─────────────────────────────────────
export const vehicleTelemetryStore = new VehicleTelemetryStore();



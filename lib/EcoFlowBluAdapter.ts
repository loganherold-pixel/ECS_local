/**
 * EcoFlowBluAdapter — BLU provider adapter for EcoFlow.
 *
 * Isolated adapter that bridges the EcoFlow cloud API (via the `ecoflow`
 * Supabase edge function) into the BLU universal telemetry layer.
 *
 * Responsibilities:
 *   - Connect to EcoFlow using existing configured credentials
 *   - Discover available EcoFlow devices
 *   - Normalize EcoFlow devices into BluDevice format
 *   - Register discovered devices in BluDeviceRegistry
 *   - Poll telemetry and feed it into BluStateStore
 *   - Manage connection state transitions
 *   - App lifecycle awareness (pause/resume polling)
 *   - Session persistence and auto-reconnect (Phase 1D)
 *
 * This adapter never exposes secrets or raw API errors to the UI.
 * All EcoFlow-specific logic is contained here so future providers
 * can follow the same pattern.
 *
 * Phase 1B — first active provider integration.
 * Phase 1C — app lifecycle, grace window, failure isolation, improved logging.
 * Phase 1D — session persistence, auto-reconnect, stale session detection,
 *            quiet reconnection flow, offline safety.
 */

import { AppState, type AppStateStatus } from 'react-native';
import type {
  BluDevice,
  BluTelemetry,
  BluConnectionState,
  BluDeviceCapabilities,
} from './BluTypes';
import { DEFAULT_BLU_CAPABILITIES } from './BluTypes';
import { bluDeviceRegistry } from './BluDeviceRegistry';
import { bluStateStore } from './BluStateStore';
import { bluSessionStore } from './BluSessionStore';
import { getSelectedEcoFlowDevice } from './ecoFlowSelectionStore';
import {
  ECOFLOW_UNAUTHORIZED_DEVICE_REASON,
  isEcoFlowUnauthorizedDeviceError,
} from './ecoflowUnauthorizedDevice';
import {
  describeEcoFlowBluEligibility,
  normalizeEcoFlowBluCandidate,
} from './ecoflowBluTelemetryEligibility';

// ── Types ───────────────────────────────────────────────────────────────

/** Raw device shape returned by the ecoflow edge function (action: 'devices'). */
interface EcoFlowRawDevice {
  id?: string;
  deviceId?: string;
  name?: string;
  deviceName?: string;
  online?: boolean;
  model?: string;
  productType?: string;
}

/** Raw telemetry shape returned by the ecoflow edge function (action: 'telemetry'). */
interface EcoFlowRawTelemetry {
  ok: boolean;
  deviceId: string;
  batteryPercent: number | null;
  solarWatts: number | null;
  outputWatts: number | null;
  inputWatts: number | null;
  volts: number | null;
  tempC: number | null;
  remainTimeMin: number | null;
  timestamp: number;
}

/** Connection result from the adapter. */
export interface EcoFlowConnectResult {
  success: boolean;
  devices: BluDevice[];
  error: string | null;
  errorCode: string | null;
}

/** Telemetry poll result from the adapter. */
export interface EcoFlowPollResult {
  success: boolean;
  telemetry: BluTelemetry | null;
  error: string | null;
}

/** Adapter state snapshot for UI consumption. */
export interface EcoFlowAdapterState {
  connectionState: BluConnectionState;
  discoveredDevices: BluDevice[];
  lastError: string | null;
  lastErrorCode: string | null;
  pollCount: number;
  lastPollAt: number | null;
  /** Phase 1C: Whether polling is paused due to app backgrounding */
  isPaused: boolean;
  /** Phase 1C: Consecutive poll failures */
  consecutiveFailures: number;
  /** Phase 1D: Whether a quiet reconnect is in progress */
  isReconnecting: boolean;
  /** Phase 1D: Number of reconnect attempts */
  reconnectAttempts: number;
}

// ── Configuration ───────────────────────────────────────────────────────

/** Default polling interval: 15 seconds (responsive but not excessive). */
const DEFAULT_POLL_INTERVAL_MS = 15_000;

/** Reduced polling interval when app is in background: 60 seconds. */
const BACKGROUND_POLL_INTERVAL_MS = 60_000;

/** Maximum consecutive failures before reducing poll frequency. */
const MAX_CONSECUTIVE_FAILURES = 5;

/** Backoff polling interval after max consecutive failures: 30 seconds. */
const BACKOFF_POLL_INTERVAL_MS = 30_000;

/** Phase 1D: Max consecutive failures before triggering reconnect. */
const RECONNECT_THRESHOLD = 3;

/** Phase 1D: Max reconnect attempts before giving up. */
const MAX_RECONNECT_ATTEMPTS = 3;

const ECOFLOW_NO_ELIGIBLE_TELEMETRY_DEVICE_REASON = 'no_eligible_ecoflow_telemetry_device';

/** Phase 1D: Delay between reconnect attempts: 10 seconds. */
const RECONNECT_DELAY_MS = 10_000;

// ── Supabase import (lazy) ──────────────────────────────────────────────

let _supabase: any = null;

async function getSupabase(): Promise<any> {
  if (_supabase) return _supabase;
  try {
    const mod = await import('./supabase');
    _supabase = mod.supabase;
    return _supabase;
  } catch {
    return null;
  }
}

// ── EcoFlow Device Capabilities ─────────────────────────────────────────

/** Default capabilities for EcoFlow devices (most models support all core fields). */
const ECOFLOW_CAPABILITIES: BluDeviceCapabilities = {
  hasBatteryPercent: true,
  hasInputWatts: true,
  hasOutputWatts: true,
  hasSolarInput: true,
  hasAcOutput: false, // EcoFlow API doesn't split AC/DC in the quota endpoint
  hasDcOutput: false,
  hasTemperature: true,
  hasRuntimeEstimate: true,
  controllable: false,
};

// ── Subscriber type ─────────────────────────────────────────────────────

type AdapterSubscriber = (state: EcoFlowAdapterState) => void;

export type EcoFlowAdapterEventName =
  | 'connect'
  | 'connected'
  | 'disconnect'
  | 'disconnected'
  | 'reconnecting'
  | 'reconnect_start'
  | 'reconnect_success'
  | 'reconnected'
  | 'reconnect_failed'
  | 'telemetry'
  | 'data'
  | 'error'
  | 'status';

type EcoFlowAdapterEventListener = (...args: any[]) => void;

export interface EcoFlowECSBridgeState {
  provider: 'ecoflow';
  connectionState: BluConnectionState;
  isConnected: boolean;
  isPolling: boolean;
  isPaused: boolean;
  isReconnecting: boolean;
  reconnectAttempts: number;
  consecutiveFailures: number;
  pollCount: number;
  lastPollAt: number | null;
  primaryDeviceId: string | null;
  primaryDeviceName: string | null;
  deviceCount: number;
  lastError: string | null;
  lastErrorCode: string | null;
  telemetry: BluTelemetry | null;
}

// ── Adapter Class ───────────────────────────────────────────────────────

class EcoFlowBluAdapter {
  private connectionState: BluConnectionState = 'disconnected';
  private discoveredDevices: BluDevice[] = [];
  private lastError: string | null = null;
  private lastErrorCode: string | null = null;
  private pollCount = 0;
  private lastPollAt: number | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private subscribers = new Set<AdapterSubscriber>();
  private isPolling = false;
  private isPaused = false;
  private consecutiveFailures = 0;
  private currentPollInterval = DEFAULT_POLL_INTERVAL_MS;
  private appStateSubscription: any = null;

  /** Phase 1D: Reconnect state */
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnectRequested = false;
  private eventListeners = new Map<EcoFlowAdapterEventName, Set<EcoFlowAdapterEventListener>>();
  private lastTelemetry: BluTelemetry | null = null;
  private unauthorizedDeviceIds = new Set<string>();
  private unauthorizedWarningDeviceIds = new Set<string>();
  private ineligibleDeviceIds = new Set<string>();
  private pollingTargetDeviceId: string | null = null;

  // ── Lifecycle/Event API ────────────────────────────────────────────

  on(event: EcoFlowAdapterEventName, listener: EcoFlowAdapterEventListener): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  subscribeEvent(event: EcoFlowAdapterEventName, listener: EcoFlowAdapterEventListener): () => void {
    return this.on(event, listener);
  }

  addListener(event: EcoFlowAdapterEventName, listener: EcoFlowAdapterEventListener): () => void {
    return this.on(event, listener);
  }

  off(event: EcoFlowAdapterEventName, listener: EcoFlowAdapterEventListener): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  removeListener(event: EcoFlowAdapterEventName, listener: EcoFlowAdapterEventListener): void {
    this.off(event, listener);
  }

  private emit(event: EcoFlowAdapterEventName, ...args: any[]): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners?.size) return;
    for (const listener of listeners) {
      try {
        listener(...args);
      } catch {
        /* event listener errors must never crash the adapter */
      }
    }
  }

  private emitStatus(): void {
    this.emit('status', this.getECSBridgeState());
  }

  // ── Subscriptions ──────────────────────────────────────────────────

  subscribe(cb: AdapterSubscriber): () => void {
    this.subscribers.add(cb);
    cb(this.getState());
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notify(): void {
    const state = this.getState();
    for (const cb of this.subscribers) {
      try {
        cb(state);
      } catch {
        /* subscriber errors must never crash the adapter */
      }
    }
    this.emitStatus();
  }

  // ── State Snapshot ─────────────────────────────────────────────────

  getState(): EcoFlowAdapterState {
    return {
      connectionState: this.connectionState,
      discoveredDevices: [...this.discoveredDevices],
      lastError: this.lastError,
      lastErrorCode: this.lastErrorCode,
      pollCount: this.pollCount,
      lastPollAt: this.lastPollAt,
      isPaused: this.isPaused,
      consecutiveFailures: this.consecutiveFailures,
      isReconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  getLastTelemetry(): BluTelemetry | null {
    return this.lastTelemetry ? { ...this.lastTelemetry } : null;
  }

  getECSBridgeState(): EcoFlowECSBridgeState {
    const primary = bluDeviceRegistry.getPrimary();
    const primaryDeviceId = primary?.provider === 'ecoflow' && this.isBluTelemetryDevice(primary)
      ? primary.device_id
      : this.getPrimaryDeviceId();
    const primaryDevice = primaryDeviceId
      ? this.discoveredDevices.find((device) => device.device_id === primaryDeviceId) ?? null
      : null;

    return {
      provider: 'ecoflow',
      connectionState: this.connectionState,
      isConnected: this.connectionState === 'connected',
      isPolling: Boolean(this.pollTimer),
      isPaused: this.isPaused,
      isReconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts,
      consecutiveFailures: this.consecutiveFailures,
      pollCount: this.pollCount,
      lastPollAt: this.lastPollAt,
      primaryDeviceId,
      primaryDeviceName: primaryDevice?.display_name ?? null,
      deviceCount: this.discoveredDevices.length,
      lastError: this.lastError,
      lastErrorCode: this.lastErrorCode,
      telemetry: this.getLastTelemetry(),
    };
  }

  // ── Connect ────────────────────────────────────────────────────────

  /**
   * Connect to EcoFlow: discover devices and register them in BLU.
   *
   * Flow:
   *   1. Set state to 'connecting'
   *   2. Call ecoflow edge function (action: 'devices')
   *   3. Normalize returned devices into BluDevice format
   *   4. Register each device in BluDeviceRegistry (with dedup/merge)
   *   5. If only one device, auto-set as primary
   *   6. Set state to 'connected' on success, 'error' on failure
   *   7. Phase 1D: Persist session state
   *
   * Never exposes raw API errors — returns user-friendly messages.
   */
  async connect(): Promise<EcoFlowConnectResult> {
    console.log('[EcoFlowBluAdapter] Starting connection...');

    this.manualDisconnectRequested = false;
    this.connectionState = 'connecting';
    this.emit('connect', this.getECSBridgeState());
    this.lastError = null;
    this.lastErrorCode = null;
    this.consecutiveFailures = 0;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.unauthorizedDeviceIds.clear();
    this.unauthorizedWarningDeviceIds.clear();
    this.ineligibleDeviceIds.clear();
    bluStateStore.setReconnecting(false);
    this.notify();

    try {
      const supabase = await getSupabase();
      if (!supabase) {
        return this.handleConnectError(
          'ECS services unavailable. Please try again.',
          'SUPABASE_UNAVAILABLE',
        );
      }

      // ── Fetch device list ──────────────────────────────────────
      console.log('[EcoFlowBluAdapter] Fetching EcoFlow device list...');

      const { data, error } = await supabase.functions.invoke('ecoflow', {
        body: { action: 'devices' },
      });

      if (error || !data?.ok) {
        const code = data?.code || 'UNKNOWN';
        const message = this.mapErrorToUserMessage(code, data?.message);
        return this.handleConnectError(message, code);
      }

      // ── Normalize devices ──────────────────────────────────────
      const rawDevices: EcoFlowRawDevice[] = data.devices || [];
      console.log(`[EcoFlowBluAdapter] listedDevices: discovered ${rawDevices.length} EcoFlow device(s)`);

      if (rawDevices.length === 0) {
        await this.enterNoEligibleEcoFlowState('No EcoFlow devices are available for BLU telemetry.');
        this.emit('connected', this.getECSBridgeState());

        return {
          success: true,
          devices: [],
          error: this.lastError,
          errorCode: this.lastErrorCode,
        };
      }

      const selectableRawDevices = this.getSelectableTelemetryRawDevices(rawDevices);
      console.log(
        `[EcoFlowBluAdapter] selectableDevices: ${selectableRawDevices.length} EcoFlow BLU telemetry-capable device(s)`,
      );

      // Clear prior EcoFlow BLU registry entries so stale non-power devices cannot remain primary.
      await bluDeviceRegistry.clearProvider('ecoflow');

      if (selectableRawDevices.length === 0) {
        await this.enterNoEligibleEcoFlowState('No EcoFlow power station is eligible for BLU telemetry.');
        this.emit('connected', this.getECSBridgeState());
        console.warn('[EcoFlowBluAdapter] no eligible telemetry device available; BLU will remain disconnected.');

        return {
          success: true,
          devices: [],
          error: this.lastError,
          errorCode: this.lastErrorCode,
        };
      }

      const bluDevices = selectableRawDevices.map((raw) => {
        const device = this.normalizeDevice(raw);
        if (this.unauthorizedDeviceIds.has(device.device_id)) {
          return { ...device, connection_state: 'unsupported' as BluConnectionState };
        }
        return device;
      });

      // ── Register in BLU Device Registry (with Phase 1D dedup) ──
      for (const device of bluDevices) {
        await bluDeviceRegistry.registerDevice({
          provider: device.provider,
          device_id: device.device_id,
          display_name: device.display_name,
          model: device.model,
          product_type: device.product_type,
          telemetry_capable: device.telemetry_capable,
          connection_state: device.connection_state,
          last_seen: device.last_seen,
          capabilities: device.capabilities,
        });
      }

      // Phase 1D/Production: ensure the preferred EcoFlow primary device is restored
      await this.syncPreferredPrimaryDevice();

      // ── Update adapter state ───────────────────────────────────
      this.connectionState = 'connected';
      this.discoveredDevices = bluDeviceRegistry.getByProvider('ecoflow');
      this.lastError = null;
      this.lastErrorCode = null;

      // Update connection state for each device in the registry
      for (const device of bluDevices) {
        await bluDeviceRegistry.updateConnectionState(
          'ecoflow',
          device.device_id,
          device.connection_state,
        );
      }

      this.notify();
      this.emit('connected', this.getECSBridgeState());

      console.log(
        `[EcoFlowBluAdapter] Connected successfully. ${bluDevices.length} device(s) registered.`,
      );

      return {
        success: true,
        devices: this.discoveredDevices,
        error: null,
        errorCode: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      console.error('[EcoFlowBluAdapter] Connect error:', msg);
      return this.handleConnectError(
        'Connection failed. Please check your network and try again.',
        'UNEXPECTED',
      );
    }
  }

  // ── Disconnect ─────────────────────────────────────────────────────
  /**
   * Disconnect from EcoFlow: stop polling and update device states.
   * Phase 1D: Persists disconnection state.
   * Phase 1E: Clears provider devices from registry on disconnect.
   */
  async disconnect(): Promise<void> {
    console.log('[EcoFlowBluAdapter] Disconnecting...');

    this.manualDisconnectRequested = true;
    this.stopPolling();
    this.cancelReconnect();
    this.removeAppStateListener();

    // Phase 1E: Clear all EcoFlow devices from the BLU registry
    // This ensures the Sustainability widget reverts to placeholder
    await bluDeviceRegistry.clearProvider('ecoflow');
    console.log('[EcoFlowBluAdapter] Cleared EcoFlow devices from registry.');

    this.connectionState = 'disconnected';
    this.discoveredDevices = [];
    this.lastError = null;
    this.lastErrorCode = null;
    this.pollCount = 0;
    this.lastPollAt = null;
    this.pollingTargetDeviceId = null;
    this.consecutiveFailures = 0;
    this.isPaused = false;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.unauthorizedDeviceIds.clear();
    this.unauthorizedWarningDeviceIds.clear();
    this.ineligibleDeviceIds.clear();

    // Reset only reconnecting state here. Do not hard-reset the global BLU store,
    // because other providers may still be active in the unified power system.
    bluStateStore.setReconnecting(false);
    bluStateStore.clearProviderTelemetry('ecoflow');

    // Phase 1D: Persist disconnection
    bluSessionStore.recordDisconnection();

    this.notify();
    this.emit('disconnect', this.getECSBridgeState());
    this.emit('disconnected', this.getECSBridgeState());
    console.log('[EcoFlowBluAdapter] Disconnected.');
  }


  // ── Phase 1D: Session Restore ──────────────────────────────────────

  /**
   * Attempt to restore a previous session on app launch.
   *
   * Flow:
   *   1. Check if a previous session exists
   *   2. If yes, attempt to reconnect
   *   3. Restore the previous primary device
   *   4. Resume polling if it was active
   *
   * Returns true if session was successfully restored.
   */
  async restoreSession(): Promise<boolean> {
    if (!bluSessionStore.hasPreviousSession()) {
      console.log('[EcoFlowBluAdapter] No previous session to restore.');
      return false;
    }

    const session = bluSessionStore.getSession();
    if (session.provider !== 'ecoflow') {
      console.log('[EcoFlowBluAdapter] Previous session is not EcoFlow.');
      return false;
    }

    console.log(
      `[EcoFlowBluAdapter] Restoring session: provider=${session.provider}` +
      ` | primary=${session.primaryDeviceId}` +
      ` | polling=${session.wasPolling}`,
    );

    // Attempt reconnect
    const result = await this.connect();
    if (!result.success) {
      console.log('[EcoFlowBluAdapter] Session restore failed — connection error.');
      return false;
    }

    // Restore preferred primary device
    if (session.primaryDeviceId) {
      const restoredId = await bluDeviceRegistry.restorePrimary(
        'ecoflow',
        session.primaryDeviceId,
      );

      if (restoredId) {
        this.discoveredDevices = bluDeviceRegistry.getByProvider('ecoflow');
      }
    }

    await this.syncPreferredPrimaryDevice();
    this.discoveredDevices = bluDeviceRegistry.getByProvider('ecoflow');
    this.notify();

    // Resume polling if it was active
    if (session.wasPolling) {
      this.startPolling(DEFAULT_POLL_INTERVAL_MS);
      console.log('[EcoFlowBluAdapter] Polling resumed from previous session.');
    }

    console.log('[EcoFlowBluAdapter] Session restored successfully.');
    return true;
  }

  // ── Phase 1D: Quiet Reconnect ──────────────────────────────────────

  /**
   * Attempt a quiet reconnection when the session drops unexpectedly.
   *
   * Called automatically when consecutive poll failures exceed the threshold.
   * Does not disturb the UI — operates in the background.
   */
  private async attemptQuietReconnect(): Promise<void> {
    if (this.manualDisconnectRequested) return;
    if (this.isReconnecting) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log(
        `[EcoFlowBluAdapter] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`,
      );
      this.isReconnecting = false;
      bluStateStore.setReconnecting(false);
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    this.emit('reconnecting', this.getECSBridgeState());
    this.emit('reconnect_start', this.getECSBridgeState());
    bluStateStore.setReconnecting(true);
    this.notify();

    console.log(
      `[EcoFlowBluAdapter] Quiet reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`,
    );

    try {
      const supabase = await getSupabase();
      if (!supabase) {
        console.log('[EcoFlowBluAdapter] Reconnect failed — services unavailable.');
        this.scheduleReconnect();
        return;
      }

      // Try a lightweight device list call to verify session
      const { data, error } = await supabase.functions.invoke('ecoflow', {
        body: { action: 'devices' },
      });

      if (error || !data?.ok) {
        console.log('[EcoFlowBluAdapter] Reconnect failed — provider error.');
        this.scheduleReconnect();
        return;
      }
      if (this.manualDisconnectRequested) {
        this.isReconnecting = false;
        bluStateStore.setReconnecting(false);
        return;
      }

      // Reconnect succeeded
      console.log('[EcoFlowBluAdapter] Reconnect succeeded.');
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;
      this.connectionState = 'connected';
      bluStateStore.setReconnecting(false);

      // Re-register devices (with dedup/merge)
      const rawDevices: EcoFlowRawDevice[] = data.devices || [];
      const selectableRawDevices = this.getSelectableTelemetryRawDevices(rawDevices);
      await bluDeviceRegistry.clearProvider('ecoflow');
      for (const raw of selectableRawDevices) {
        const normalized = this.normalizeDevice(raw);
        const device = this.unauthorizedDeviceIds.has(normalized.device_id)
          ? { ...normalized, connection_state: 'unsupported' as BluConnectionState }
          : normalized;
        await bluDeviceRegistry.registerDevice({
          provider: device.provider,
          device_id: device.device_id,
          display_name: device.display_name,
          model: device.model,
          product_type: device.product_type,
          telemetry_capable: device.telemetry_capable,
          connection_state: device.connection_state,
          last_seen: device.last_seen,
          capabilities: device.capabilities,
        });
      }
      if (selectableRawDevices.length === 0) {
        await this.enterNoEligibleEcoFlowState('No EcoFlow power station is eligible for BLU telemetry.');
        console.warn('[EcoFlowBluAdapter] reconnect found no eligible EcoFlow BLU telemetry device.');
        this.emit('reconnect_success', this.getECSBridgeState());
        this.emit('reconnected', this.getECSBridgeState());
        return;
      }

      this.discoveredDevices = bluDeviceRegistry.getByProvider('ecoflow');

      // Ensure the preferred primary device is restored if still available
      await this.syncPreferredPrimaryDevice();

      this.notify();
      this.emit('reconnect_success', this.getECSBridgeState());
      this.emit('reconnected', this.getECSBridgeState());

      // Resume polling immediately
      if (!this.pollTimer) {
        this.startPolling(DEFAULT_POLL_INTERVAL_MS);
      }
    } catch (err) {
      console.error('[EcoFlowBluAdapter] Reconnect error (isolated):', err);
      this.emit('reconnect_failed', { error: err, state: this.getECSBridgeState() });
      this.emit('error', err);
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule the next reconnect attempt after a delay.
   */
  private scheduleReconnect(): void {
    if (this.manualDisconnectRequested) {
      this.cancelReconnect();
      return;
    }
    this.isReconnecting = false;
    this.notify();

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[EcoFlowBluAdapter] Max reconnect attempts reached.');
      bluStateStore.setReconnecting(false);
      return;
    }

    const delay = RECONNECT_DELAY_MS * this.reconnectAttempts; // Progressive backoff
    console.log(`[EcoFlowBluAdapter] Next reconnect in ${delay / 1000}s...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manualDisconnectRequested) {
        this.cancelReconnect();
        return;
      }
      this.attemptQuietReconnect();
    }, delay);
  }

  /**
   * Cancel any pending reconnect attempts.
   */
  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    bluStateStore.setReconnecting(false);
  }

  // ── Poll Telemetry ─────────────────────────────────────────────────

  /**
   * Poll telemetry for the primary BLU device (or a specific device).
   * Normalizes EcoFlow telemetry into BluTelemetry and feeds it to BluStateStore.
   *
   * Phase 1C: Failure isolation — poll failures never crash the dashboard.
   * Phase 1D: Triggers quiet reconnect after threshold failures.
   */
  async pollTelemetry(deviceId?: string): Promise<EcoFlowPollResult> {
    if (this.isPolling) {
      return { success: false, telemetry: null, error: 'Poll already in progress' };
    }

    this.isPolling = true;

    try {
      // Determine which device to poll. Telemetry is stored per device, so
      // non-primary EcoFlow devices can update their own cache entry without
      // overwriting the dashboard's primary summary.
      const activePrimaryDeviceId = this.getPrimaryDeviceId();
      const targetDeviceId = deviceId || this.pollingTargetDeviceId || activePrimaryDeviceId;
      if (!targetDeviceId) {
        await this.enterNoEligibleEcoFlowState('No eligible EcoFlow power station available for BLU telemetry');
        return {
          success: false,
          telemetry: null,
          error: 'No eligible EcoFlow power station available for BLU telemetry',
        };
      }
      const targetDevice = bluDeviceRegistry.getDevice('ecoflow', targetDeviceId);
      if (!this.isBluTelemetryDevice(targetDevice)) {
        this.ineligibleDeviceIds.add(targetDeviceId);
        await this.enterNoEligibleEcoFlowState(`Refused unsupported EcoFlow telemetry device ${targetDeviceId}.`);
        return {
          success: false,
          telemetry: null,
          error: 'Selected EcoFlow device is not eligible for BLU telemetry',
        };
      }

      const pollStartedAt = Date.now();
      const supabase = await getSupabase();
      if (!supabase) {
        this.handlePollFailure('ECS services unavailable');
        return {
          success: false,
          telemetry: null,
          error: 'ECS services unavailable',
        };
      }

      let { data, error } = await supabase.functions.invoke('ecoflow', {
        body: { action: 'telemetry', deviceId: targetDeviceId },
      });

      if (error || !data?.ok) {
        if (isEcoFlowUnauthorizedDeviceError(data ?? error)) {
          await this.markDeviceUnauthorized(targetDeviceId);
          await this.enterNoEligibleEcoFlowState(ECOFLOW_UNAUTHORIZED_DEVICE_REASON);
          return {
            success: false,
            telemetry: null,
            error: ECOFLOW_UNAUTHORIZED_DEVICE_REASON,
          };
        } else {
          const code = data?.code || 'UNKNOWN';
          const userMsg = this.mapErrorToUserMessage(code, data?.message);
          this.handlePollFailure(userMsg);
          console.log(`[EcoFlowBluAdapter] Telemetry poll failed: ${code}`);
          return {
            success: false,
            telemetry: null,
            error: userMsg,
          };
        }
      }

      // ── Normalize telemetry ────────────────────────────────────
      const telemetry: BluTelemetry = {
        ...this.normalizeTelemetry(targetDeviceId, data as EcoFlowRawTelemetry),
        pollToken: `${targetDeviceId}:${pollStartedAt}`,
        sessionPrimaryDeviceId: targetDeviceId,
        pollStartedAt,
      };

      // ── Feed into BLU state store ──────────────────────────────
      this.lastTelemetry = telemetry;
      bluStateStore.ingestTelemetry(telemetry);

      // ── Update device connection state ─────────────────────────
      await bluDeviceRegistry.updateConnectionState(
        'ecoflow',
        targetDeviceId,
        'connected',
      );

      this.pollCount++;
      this.lastPollAt = Date.now();
      this.consecutiveFailures = 0;

      // Phase 1D: Clear reconnect state on successful poll
      if (this.reconnectAttempts > 0) {
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        bluStateStore.setReconnecting(false);
      }

      // Reset poll interval to normal after successful poll
      if (this.currentPollInterval !== DEFAULT_POLL_INTERVAL_MS && !this.isPaused) {
        this.currentPollInterval = DEFAULT_POLL_INTERVAL_MS;
      }

      this.notify();
      this.emit('telemetry', telemetry);
      this.emit('data', telemetry);

      console.log(
        `[EcoFlowBluAdapter] Poll #${this.pollCount} success` +
        ` | SOC=${telemetry.battery_percent ?? '?'}%` +
        ` | IN=${telemetry.input_watts ?? '?'}W` +
        ` | OUT=${telemetry.output_watts ?? '?'}W` +
        ` | SOLAR=${telemetry.solar_input_watts ?? '?'}W`,
      );

      return {
        success: true,
        telemetry,
        error: null,
      };
    } catch (err) {
      // Phase 1C: Failure isolation — never crash the dashboard
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      console.error('[EcoFlowBluAdapter] Poll error (isolated):', msg);
      this.handlePollFailure('Telemetry fetch failed');
      return {
        success: false,
        telemetry: null,
        error: 'Telemetry fetch failed',
      };
    } finally {
      this.isPolling = false;
    }
  }

  // ── Auto-Polling ───────────────────────────────────────────────────

  /**
   * Start automatic polling at the given interval (ms).
   * Default: 15 seconds.
   *
   * Phase 1C: Registers app state listener for lifecycle awareness.
   * Phase 1D: Persists polling state.
   */
  startPolling(intervalMs: number = DEFAULT_POLL_INTERVAL_MS): void {
    this.stopPolling();
    const targetDeviceId = this.getPrimaryDeviceId();
    if (!targetDeviceId) {
      console.warn('[EcoFlowBluAdapter] Polling not started: no eligible EcoFlow telemetry primary.');
      void this.enterNoEligibleEcoFlowState('No eligible EcoFlow telemetry primary for polling.');
      return;
    }
    this.pollingTargetDeviceId = targetDeviceId;
    this.currentPollInterval = intervalMs;
    this.isPaused = false;

    // Register app state listener for lifecycle awareness
    this.registerAppStateListener();

    // Phase 1D: Persist polling state
    bluSessionStore.saveSession({
      provider: 'ecoflow',
      connectionState: 'connected',
      primaryDeviceId: targetDeviceId,
      timestamp: Date.now(),
      wasPolling: true,
      version: 1,
    });

    const tick = async () => {
      if (this.connectionState !== 'connected' && !this.isReconnecting) return;
      if (this.isPaused) {
        // In background: use reduced interval
        this.pollTimer = setTimeout(tick, BACKGROUND_POLL_INTERVAL_MS);
        return;
      }

      await this.pollTelemetry(this.pollingTargetDeviceId ?? undefined);

      // Determine next interval based on failure count
      const nextInterval = this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
        ? BACKOFF_POLL_INTERVAL_MS
        : this.currentPollInterval;

      this.pollTimer = setTimeout(tick, nextInterval);
    };

    // Initial poll
    tick();
    this.emitStatus();
    console.log(`[EcoFlowBluAdapter] Auto-polling started (${intervalMs}ms interval)`);
  }

  /**
   * Stop automatic polling.
   * Phase 1D: Persists polling state.
   */
  stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    bluSessionStore.recordPollingStopped();
    this.emitStatus();
  }

  // ── App Lifecycle Awareness (Phase 1C) ─────────────────────────────

  /**
   * Register listener for app state changes (foreground/background).
   * Pauses polling when app is backgrounded, resumes when foregrounded.
   */
  private registerAppStateListener(): void {
    if (this.appStateSubscription) return;

    try {
      this.appStateSubscription = AppState.addEventListener(
        'change',
        this.handleAppStateChange,
      );
      console.log('[EcoFlowBluAdapter] App state listener registered');
    } catch {
      // AppState may not be available in all environments
      console.log('[EcoFlowBluAdapter] AppState not available — lifecycle awareness disabled');
    }
  }

  /**
   * Remove the app state listener.
   */
  private removeAppStateListener(): void {
    if (this.appStateSubscription) {
      try {
        this.appStateSubscription.remove();
      } catch {
        /* swallow */
      }
      this.appStateSubscription = null;
    }
  }

  /**
   * Handle app state changes.
   */
  private handleAppStateChange = (nextState: AppStateStatus): void => {
    if (nextState === 'active') {
      // App returned to foreground — resume normal polling
      if (this.isPaused) {
        console.log('[EcoFlowBluAdapter] App foregrounded — resuming normal polling');
        this.isPaused = false;
        this.currentPollInterval = DEFAULT_POLL_INTERVAL_MS;
        this.notify();

        // Immediate poll on resume
        if (this.connectionState === 'connected') {
          this.pollTelemetry();
        }
      }
    } else if (nextState === 'background' || nextState === 'inactive') {
      // App backgrounded — reduce polling frequency
      if (!this.isPaused) {
        console.log('[EcoFlowBluAdapter] App backgrounded — reducing poll frequency');
        this.isPaused = true;
        this.notify();
      }
    }
  };

  // ── Set Primary Device ─────────────────────────────────────────────

  /**
   * Set a device as the primary BLU power source.
   * Phase 1D: Persists primary device change and immediately reroutes telemetry.
   */
  async setPrimaryDevice(deviceId: string): Promise<void> {
    console.log(`[EcoFlowBluAdapter] Setting primary device: ${deviceId}`);

    if (this.unauthorizedDeviceIds.has(deviceId)) {
      await this.enterNoEligibleEcoFlowState(ECOFLOW_UNAUTHORIZED_DEVICE_REASON);
      return;
    }

    const requestedDevice = bluDeviceRegistry.getDevice('ecoflow', deviceId);
    if (!this.isBluTelemetryDevice(requestedDevice)) {
      this.ineligibleDeviceIds.add(deviceId);
      console.warn(
        `[EcoFlowBluAdapter] Refused BLU primary selection for unsupported EcoFlow device: ${deviceId}.`,
      );
      await this.enterNoEligibleEcoFlowState(`EcoFlow device ${deviceId} is not eligible for BLU telemetry.`);
      return;
    }

    await this.commitEcoFlowPrimary(deviceId);

    // Poll the new primary device immediately to reroute telemetry
    console.log(`[EcoFlowBluAdapter] Rerouting telemetry to new primary: ${deviceId}`);
    await this.pollTelemetry(deviceId);
  }

  // ── Refresh Devices ────────────────────────────────────────────────

  /**
   * Re-fetch the device list from EcoFlow without full reconnect.
   */
  async refreshDevices(): Promise<EcoFlowConnectResult> {
    console.log('[EcoFlowBluAdapter] Refreshing device list...');
    const wasPolling = Boolean(this.pollTimer);
    const result = await this.connect();

    if (result.success) {
      await this.syncPreferredPrimaryDevice();
      this.discoveredDevices = bluDeviceRegistry.getByProvider('ecoflow');
      this.notify();

      if (wasPolling && !this.pollTimer) {
        this.startPolling(DEFAULT_POLL_INTERVAL_MS);
      }
    }

    return result;
  }

  // ── Private Helpers ────────────────────────────────────────────────

  /**
   * Handle a poll failure: increment counters, record in store.
   * Phase 1C: Never crashes the dashboard.
   * Phase 1D: Triggers quiet reconnect after threshold failures.
   */
  private handlePollFailure(error: string): void {
    this.consecutiveFailures++;
    bluStateStore.recordPollFailure(error);

    if (this.lastErrorCode === 'NO_ELIGIBLE_TELEMETRY_DEVICE') {
      this.notify();
      this.emit('error', { message: error, state: this.getECSBridgeState() });
      return;
    }

    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log(
        `[EcoFlowBluAdapter] ${this.consecutiveFailures} consecutive failures — backing off to ${BACKOFF_POLL_INTERVAL_MS / 1000}s interval`,
      );
    }

    // Phase 1D: Trigger quiet reconnect after threshold
    if (
      this.consecutiveFailures >= RECONNECT_THRESHOLD &&
      !this.isReconnecting &&
      this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS
    ) {
      console.log(
        `[EcoFlowBluAdapter] ${this.consecutiveFailures} failures — initiating quiet reconnect...`,
      );
      this.attemptQuietReconnect();
    }

    this.notify();
    this.emit('error', { message: error, state: this.getECSBridgeState() });
  }

  private getSelectableTelemetryRawDevices(rawDevices: EcoFlowRawDevice[]): EcoFlowRawDevice[] {
    const selectable: EcoFlowRawDevice[] = [];
    const seen = new Set<string>();

    for (const raw of rawDevices) {
      const eligibility = describeEcoFlowBluEligibility(raw);
      if (!eligibility.deviceId || seen.has(eligibility.deviceId)) continue;
      seen.add(eligibility.deviceId);

      console.log(
        `[EcoFlowBluAdapter] listed device | id=${eligibility.deviceId} | name=${eligibility.deviceName} | model=${eligibility.model} | productType=${eligibility.productType}`,
      );

      if (!eligibility.telemetryCapable) {
        this.ineligibleDeviceIds.add(eligibility.deviceId);
        console.log(
          `[EcoFlowBluAdapter] filtered out EcoFlow device | id=${eligibility.deviceId} | productType=${eligibility.productType} | reason=unsupported_productType_for_blu_telemetry`,
        );
        continue;
      }

      if (this.unauthorizedDeviceIds.has(eligibility.deviceId)) {
        console.warn(
          `[EcoFlowBluAdapter] filtered out EcoFlow device | id=${eligibility.deviceId} | reason=unauthorized_for_cloud_telemetry`,
        );
        continue;
      }

      if (this.ineligibleDeviceIds.has(eligibility.deviceId)) {
        console.warn(
          `[EcoFlowBluAdapter] filtered out EcoFlow device | id=${eligibility.deviceId} | reason=session_ineligible_for_blu_telemetry`,
        );
        continue;
      }

      selectable.push(raw);
    }

    return selectable;
  }

  private isBluTelemetryDevice(device: BluDevice | null | undefined): boolean {
    if (!device || device.provider !== 'ecoflow') return false;
    if (this.unauthorizedDeviceIds.has(device.device_id)) return false;
    if (this.ineligibleDeviceIds.has(device.device_id)) return false;
    if (device.connection_state === 'unsupported') return false;
    if (device.telemetry_capable === false) return false;
    return normalizeEcoFlowBluCandidate({
      deviceId: device.device_id,
      deviceName: device.display_name,
      model: device.model,
      productType: device.product_type,
    }).telemetryCapable;
  }

  private async clearEcoFlowTelemetryPrimary(reason: string): Promise<void> {
    await this.enterNoEligibleEcoFlowState(reason);
  }

  private async enterNoEligibleEcoFlowState(reason: string): Promise<void> {
    this.stopPollingWithoutSessionWrite();
    this.cancelReconnect();
    await bluDeviceRegistry.clearPrimary('ecoflow');
    bluStateStore.clearProviderTelemetry('ecoflow');
    bluStateStore.setReconnecting(false);
    this.connectionState = 'disconnected';
    this.pollingTargetDeviceId = null;
    this.lastTelemetry = null;
    this.lastError = reason;
    this.lastErrorCode = 'NO_ELIGIBLE_TELEMETRY_DEVICE';
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.consecutiveFailures = 0;
    this.discoveredDevices = bluDeviceRegistry.getByProvider('ecoflow');
    bluSessionStore.recordProviderDegraded(
      'ecoflow',
      ECOFLOW_NO_ELIGIBLE_TELEMETRY_DEVICE_REASON,
    );
    this.notify();
    this.emitStatus();
    console.warn(`[EcoFlowBluAdapter] no eligible telemetry device available: ${reason}`);
  }

  private stopPollingWithoutSessionWrite(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async commitEcoFlowPrimary(deviceId: string): Promise<boolean> {
    const device = bluDeviceRegistry.getDevice('ecoflow', deviceId);
    if (!this.isBluTelemetryDevice(device)) {
      this.ineligibleDeviceIds.add(deviceId);
      console.warn(`[EcoFlowBluAdapter] refused ineligible EcoFlow primary transaction: ${deviceId}`);
      return false;
    }

    await bluDeviceRegistry.setPrimary('ecoflow', deviceId);
    this.pollingTargetDeviceId = deviceId;
    this.connectionState = 'connected';
    this.lastError = null;
    this.lastErrorCode = null;
    this.discoveredDevices = bluDeviceRegistry.getByProvider('ecoflow');
    bluSessionStore.saveSession({
      provider: 'ecoflow',
      connectionState: 'connected',
      primaryDeviceId: deviceId,
      timestamp: Date.now(),
      wasPolling: Boolean(this.pollTimer),
      version: 1,
    });
    console.log(`[EcoFlowBluAdapter] selected telemetry primary: ${deviceId}`);
    this.notify();
    this.emitStatus();
    return true;
  }

  private async markDeviceUnauthorized(deviceId: string): Promise<void> {
    if (!this.unauthorizedDeviceIds.has(deviceId)) {
      this.unauthorizedDeviceIds.add(deviceId);
    }
    this.ineligibleDeviceIds.add(deviceId);

    if (!this.unauthorizedWarningDeviceIds.has(deviceId)) {
      this.unauthorizedWarningDeviceIds.add(deviceId);
      console.warn(
        `[EcoFlowBluAdapter] EcoFlow device ${deviceId} is unauthorized for cloud telemetry; excluding it for this session.`,
      );
    }

    await bluDeviceRegistry.updateConnectionState('ecoflow', deviceId, 'unsupported');
    bluStateStore.clearProviderTelemetry('ecoflow');
    if (this.pollingTargetDeviceId === deviceId) {
      this.pollingTargetDeviceId = null;
    }
    this.discoveredDevices = bluDeviceRegistry.getByProvider('ecoflow');
    this.notify();
    this.emitStatus();
  }

  /**
   * Normalize a raw EcoFlow device into a BluDevice.
   */
  private normalizeDevice(raw: EcoFlowRawDevice): BluDevice {
    const eligibility = normalizeEcoFlowBluCandidate(raw);
    return {
      provider: 'ecoflow',
      device_id: eligibility.deviceId,
      display_name: eligibility.deviceName,
      model: eligibility.model,
      product_type: eligibility.productType,
      telemetry_capable: eligibility.telemetryCapable,
      connection_state: raw.online ? 'connected' : 'disconnected',
      last_seen: Date.now(),
      capabilities: { ...ECOFLOW_CAPABILITIES },
      is_primary: false, // Registry handles primary assignment
    };
  }

  /**
   * Normalize raw EcoFlow telemetry into a BluTelemetry reading.
   * Only populates fields when EcoFlow actually provides them.
   */
  private normalizeTelemetry(
    deviceId: string,
    raw: EcoFlowRawTelemetry,
  ): BluTelemetry {
    const inputW = typeof raw.inputWatts === 'number' ? raw.inputWatts : undefined;
    const outputW = typeof raw.outputWatts === 'number' ? raw.outputWatts : undefined;
    const solarW = typeof raw.solarWatts === 'number' ? raw.solarWatts : undefined;
    const hasDecodedTelemetry = [
      raw.batteryPercent,
      inputW,
      outputW,
      solarW,
      raw.volts,
      raw.tempC,
      raw.remainTimeMin,
    ].some((value) => typeof value === 'number' && Number.isFinite(value));

    return {
      timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
      provider: 'ecoflow',
      device_id: deviceId,
      source: 'provider_cloud',
      isLive: hasDecodedTelemetry,
      telemetrySourceLabel: 'Provider Cloud',

      // Core fields
      battery_percent:
        typeof raw.batteryPercent === 'number'
          ? Math.max(0, Math.min(100, Math.round(raw.batteryPercent)))
          : undefined,
      input_watts: inputW,
      output_watts: outputW,
      battery_watts:
        inputW !== undefined || outputW !== undefined || solarW !== undefined
          ? (inputW ?? 0) + (solarW ?? 0) - (outputW ?? 0)
          : undefined,
      estimated_runtime_minutes:
        typeof raw.remainTimeMin === 'number' ? raw.remainTimeMin : undefined,

      // Source-specific
      solar_input_watts:
        solarW,

      // Environmental — only when provider actually provides it
      temperature_celsius:
        typeof raw.tempC === 'number' ? raw.tempC : undefined,

      // Extended
      battery_volts:
        typeof raw.volts === 'number' ? raw.volts : undefined,
    };
  }

  /**
   * Get the primary device ID from the BLU registry.
   */
  private getPrimaryDeviceId(): string | null {
    const primary = bluDeviceRegistry.getPrimary();
    if (
      primary &&
      primary.provider === 'ecoflow' &&
      this.isBluTelemetryDevice(primary)
    ) {
      return primary.device_id;
    }
    // Fallback: first eligible EcoFlow power station
    const ecoDevices = bluDeviceRegistry
      .getByProvider('ecoflow')
      .filter((device) => this.isBluTelemetryDevice(device));
    return ecoDevices.length > 0 ? ecoDevices[0].device_id : null;
  }

  /**
   * Resolve the preferred EcoFlow primary device ID.
   *
   * Priority:
   *   1. Explicitly selected EcoFlow device from the picker
   *   2. Previously persisted EcoFlow session primary
   *   3. Current registry primary if it is EcoFlow
   *   4. First discovered EcoFlow device
   */
  private getPreferredPrimaryDeviceId(): string | null {
    const selected = getSelectedEcoFlowDevice();
    if (selected && this.isBluTelemetryDevice(bluDeviceRegistry.getDevice('ecoflow', selected))) return selected;

    const session = bluSessionStore.getSession();
    if (
      session.provider === 'ecoflow' &&
      session.primaryDeviceId &&
      this.isBluTelemetryDevice(bluDeviceRegistry.getDevice('ecoflow', session.primaryDeviceId))
    ) {
      return session.primaryDeviceId;
    }

    const primary = bluDeviceRegistry.getPrimary();
    if (
      primary?.provider === 'ecoflow' &&
      this.isBluTelemetryDevice(primary)
    ) {
      return primary.device_id;
    }

    return this.getPrimaryDeviceId();
  }

  /**
   * Ensure the preferred EcoFlow primary device is restored when available.
   */
  private async syncPreferredPrimaryDevice(): Promise<void> {
    const preferredId = this.getPreferredPrimaryDeviceId();
    if (!preferredId) {
      const fallback = this.getPrimaryDeviceId();
      if (fallback) {
        await this.commitEcoFlowPrimary(fallback);
      } else {
        await this.enterNoEligibleEcoFlowState('No eligible EcoFlow telemetry primary.');
        console.warn('[EcoFlowBluAdapter] no eligible telemetry device available for primary selection.');
      }
      return;
    }

    const devices = bluDeviceRegistry.getByProvider('ecoflow');
    const exists = devices.some((device) =>
      device.device_id === preferredId &&
      this.isBluTelemetryDevice(device),
    );

    if (exists) {
      await this.commitEcoFlowPrimary(preferredId);
    } else {
      const fallback = this.getPrimaryDeviceId();
      if (fallback) {
        await this.commitEcoFlowPrimary(fallback);
      } else {
        await this.enterNoEligibleEcoFlowState('No eligible EcoFlow telemetry primary.');
        console.warn('[EcoFlowBluAdapter] no eligible telemetry device available for primary selection.');
      }
    }
  }

  /**
   * Map an error code to a user-friendly message.
   * Never exposes raw API errors.
   */
  private mapErrorToUserMessage(code: string, rawMessage?: string): string {
    switch (code) {
      case 'NOT_CONFIGURED':
        return 'EcoFlow integration is not configured. Please add your EcoFlow API credentials in ECS settings.';
      case 'UNAUTHORIZED':
        return 'EcoFlow credentials are invalid or expired. Please check your API keys.';
      case 'RATE_LIMIT':
        return 'EcoFlow API rate limit reached. Please wait a moment and try again.';
      case 'UPSTREAM':
        return 'Unable to reach EcoFlow servers. Please check your network connection.';
      case 'BAD_REQUEST':
        return 'Invalid request. Please try again.';
      default:
        return 'Connection failed. Please try again.';
    }
  }

  /**
   * Handle a connection error: update state and return result.
   */
  private handleConnectError(
    message: string,
    code: string,
  ): EcoFlowConnectResult {
    this.connectionState = 'error';
    this.lastError = message;
    this.lastErrorCode = code;
    this.notify();
    this.emit('error', { message, code, state: this.getECSBridgeState() });

    return {
      success: false,
      devices: [],
      error: message,
      errorCode: code,
    };
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

export const ecoFlowBluAdapter = new EcoFlowBluAdapter();

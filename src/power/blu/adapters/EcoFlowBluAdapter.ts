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
} from '../BluTypes';
import { DEFAULT_BLU_CAPABILITIES } from '../BluTypes';
import { bluDeviceRegistry } from '../BluDeviceRegistry';
import { bluStateStore } from '../BluStateStore';
import { bluSessionStore } from '../BluSessionStore';

// ── Types ───────────────────────────────────────────────────────────────

/** Raw device shape returned by the ecoflow edge function (action: 'devices'). */
interface EcoFlowRawDevice {
  id: string;
  name: string;
  online: boolean;
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

/** Phase 1D: Delay between reconnect attempts: 10 seconds. */
const RECONNECT_DELAY_MS = 10_000;

// ── Supabase import (lazy) ──────────────────────────────────────────────

let _supabase: any = null;

async function getSupabase(): Promise<any> {
  if (_supabase) return _supabase;
  try {
    const mod = await import('../../../../app/lib/supabase');
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

    this.connectionState = 'connecting';
    this.lastError = null;
    this.lastErrorCode = null;
    this.consecutiveFailures = 0;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
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
      console.log(`[EcoFlowBluAdapter] Discovered ${rawDevices.length} device(s)`);

      if (rawDevices.length === 0) {
        // Not an error — just no devices found
        this.connectionState = 'connected';
        this.discoveredDevices = [];

        // Phase 1D: Persist session even with no devices
        bluSessionStore.recordConnection('ecoflow', null);

        this.notify();

        return {
          success: true,
          devices: [],
          error: null,
          errorCode: null,
        };
      }

      const bluDevices = rawDevices.map((raw) => this.normalizeDevice(raw));

      // ── Register in BLU Device Registry (with Phase 1D dedup) ──
      for (const device of bluDevices) {
        await bluDeviceRegistry.registerDevice({
          provider: device.provider,
          device_id: device.device_id,
          display_name: device.display_name,
          model: device.model,
          connection_state: device.connection_state,
          last_seen: device.last_seen,
          capabilities: device.capabilities,
        });
      }

      // Phase 1D: Ensure a primary device is set
      await bluDeviceRegistry.ensurePrimary('ecoflow');

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

      // Phase 1D: Persist session
      const primary = bluDeviceRegistry.getPrimary();
      bluSessionStore.recordConnection(
        'ecoflow',
        primary?.device_id ?? null,
      );

      this.notify();

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
    this.consecutiveFailures = 0;
    this.isPaused = false;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;

    // Reset BLU state store
    bluStateStore.setReconnecting(false);
    bluStateStore.reset();

    // Phase 1D: Persist disconnection
    bluSessionStore.recordDisconnection();

    this.notify();
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

    // Restore primary device
    if (session.primaryDeviceId) {
      const restoredId = await bluDeviceRegistry.restorePrimary(
        'ecoflow',
        session.primaryDeviceId,
      );

      if (restoredId) {
        // Update local discovered devices
        this.discoveredDevices = bluDeviceRegistry.getByProvider('ecoflow');
        this.notify();
      }
    }

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

      // Reconnect succeeded
      console.log('[EcoFlowBluAdapter] Reconnect succeeded.');
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;
      this.connectionState = 'connected';
      bluStateStore.setReconnecting(false);

      // Re-register devices (with dedup/merge)
      const rawDevices: EcoFlowRawDevice[] = data.devices || [];
      for (const raw of rawDevices) {
        const device = this.normalizeDevice(raw);
        await bluDeviceRegistry.registerDevice({
          provider: device.provider,
          device_id: device.device_id,
          display_name: device.display_name,
          model: device.model,
          connection_state: device.connection_state,
          last_seen: device.last_seen,
          capabilities: device.capabilities,
        });
      }

      this.discoveredDevices = bluDeviceRegistry.getByProvider('ecoflow');

      // Ensure primary is still valid
      await bluDeviceRegistry.ensurePrimary('ecoflow');

      // Update session
      const primary = bluDeviceRegistry.getPrimary();
      bluSessionStore.recordConnection('ecoflow', primary?.device_id ?? null);

      this.notify();

      // Resume polling immediately
      if (!this.pollTimer) {
        this.startPolling(DEFAULT_POLL_INTERVAL_MS);
      }
    } catch (err) {
      console.error('[EcoFlowBluAdapter] Reconnect error (isolated):', err);
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule the next reconnect attempt after a delay.
   */
  private scheduleReconnect(): void {
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
      // Determine which device to poll
      const targetDeviceId = deviceId || this.getPrimaryDeviceId();
      if (!targetDeviceId) {
        return {
          success: false,
          telemetry: null,
          error: 'No device available to poll',
        };
      }

      const supabase = await getSupabase();
      if (!supabase) {
        this.handlePollFailure('ECS services unavailable');
        return {
          success: false,
          telemetry: null,
          error: 'ECS services unavailable',
        };
      }

      const { data, error } = await supabase.functions.invoke('ecoflow', {
        body: { action: 'telemetry', deviceId: targetDeviceId },
      });

      if (error || !data?.ok) {
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

      // ── Normalize telemetry ────────────────────────────────────
      const telemetry = this.normalizeTelemetry(targetDeviceId, data as EcoFlowRawTelemetry);

      // ── Feed into BLU state store ──────────────────────────────
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
    this.currentPollInterval = intervalMs;
    this.isPaused = false;

    // Register app state listener for lifecycle awareness
    this.registerAppStateListener();

    // Phase 1D: Persist polling state
    bluSessionStore.recordPollingStarted();

    const tick = async () => {
      if (this.connectionState !== 'connected' && !this.isReconnecting) return;
      if (this.isPaused) {
        // In background: use reduced interval
        this.pollTimer = setTimeout(tick, BACKGROUND_POLL_INTERVAL_MS);
        return;
      }

      await this.pollTelemetry();

      // Determine next interval based on failure count
      const nextInterval = this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
        ? BACKOFF_POLL_INTERVAL_MS
        : this.currentPollInterval;

      this.pollTimer = setTimeout(tick, nextInterval);
    };

    // Initial poll
    tick();
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
    await bluDeviceRegistry.setPrimary('ecoflow', deviceId);

    // Update local discovered devices
    this.discoveredDevices = bluDeviceRegistry.getByProvider('ecoflow');

    // Phase 1D: Persist primary device change
    bluSessionStore.recordPrimaryDeviceChange(deviceId);

    this.notify();

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
    return this.connect();
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
  }

  /**
   * Normalize a raw EcoFlow device into a BluDevice.
   */
  private normalizeDevice(raw: EcoFlowRawDevice): BluDevice {
    return {
      provider: 'ecoflow',
      device_id: raw.id,
      display_name: raw.name || raw.id || 'Unknown Device',
      model: raw.model || raw.productType || 'EcoFlow Device',
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

    return {
      timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
      provider: 'ecoflow',
      device_id: deviceId,

      // Core fields
      battery_percent:
        typeof raw.batteryPercent === 'number'
          ? Math.max(0, Math.min(100, Math.round(raw.batteryPercent)))
          : undefined,
      input_watts: inputW,
      output_watts: outputW,
      battery_watts:
        inputW !== undefined && outputW !== undefined
          ? inputW - outputW
          : undefined,
      estimated_runtime_minutes:
        typeof raw.remainTimeMin === 'number' ? raw.remainTimeMin : undefined,

      // Source-specific
      solar_input_watts:
        typeof raw.solarWatts === 'number' ? raw.solarWatts : undefined,

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
    if (primary && primary.provider === 'ecoflow') {
      return primary.device_id;
    }
    // Fallback: first EcoFlow device
    const ecoDevices = bluDeviceRegistry.getByProvider('ecoflow');
    return ecoDevices.length > 0 ? ecoDevices[0].device_id : null;
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


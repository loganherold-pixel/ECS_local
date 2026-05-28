/**
 * BluettiBluAdapter — BLU provider adapter for Bluetti power stations.
 *
 * Bridges Bluetti BLE communication into the BLU universal telemetry layer.
 *
 * Responsibilities:
 *   - Scan for nearby Bluetti BLE devices
 *   - Connect via BLE (or simulated BLE in dev)
 *   - Normalize Bluetti telemetry into BluTelemetry format
 *   - Register discovered devices in BluDeviceRegistry
 *   - Poll telemetry and feed it into BluStateStore
 *   - Manage connection state transitions
 *   - App lifecycle awareness (pause/resume polling)
 *   - Session persistence and auto-reconnect
 *
 * BLE Architecture:
 *   Bluetti devices use a custom BLE service (0xFF00) with Modbus-RTU
 *   framing. This adapter abstracts the BLE layer and provides a clean
 *   interface identical to the EcoFlow adapter.
 *
 * Phase 2A — Bluetti BLE integration.
 */

import { AppState, type AppStateStatus, Platform } from 'react-native';
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
import { getBluetoothTelemetrySourceLabel, isDevMockTelemetryAllowed } from './bluetoothLiveTelemetry';
import { withBluPowerTelemetryEnvelope } from './bluTelemetryEnvelope';
import {
  isBluettiDeviceName,
  extractModelFromName,
  lookupBluettiModel,
  BLUETTI_SERVICE_UUID,
  type BluettiModelSpec,
} from './BluettiConstants';

// ── Types ───────────────────────────────────────────────────────────────

/** Discovered BLE device from scanning. */
export interface BluettiDiscoveredDevice {
  id: string;           // BLE peripheral ID (MAC or UUID)
  name: string;         // Advertised device name
  rssi: number;         // Signal strength
  model?: string;       // Extracted model name
  modelSpec?: BluettiModelSpec; // Full model spec if known
}

/** Connection result from the adapter. */
export interface BluettiConnectResult {
  success: boolean;
  device: BluDevice | null;
  error: string | null;
  errorCode: string | null;
}

/** Telemetry poll result from the adapter. */
export interface BluettiPollResult {
  success: boolean;
  telemetry: BluTelemetry | null;
  error: string | null;
}

/** Adapter state snapshot for UI consumption. */
export interface BluettiAdapterState {
  connectionState: BluConnectionState;
  discoveredDevices: BluettiDiscoveredDevice[];
  connectedDevices: BluDevice[];
  lastError: string | null;
  lastErrorCode: string | null;
  pollCount: number;
  lastPollAt: number | null;
  isPaused: boolean;
  isScanning: boolean;
  consecutiveFailures: number;
  isReconnecting: boolean;
  reconnectAttempts: number;
}


export type BluettiAdapterEventName =
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

export interface BluettiAdapterEventPayload {
  type: BluettiAdapterEventName;
  provider: 'bluetti';
  timestamp: number;
  state: BluettiAdapterState;
  telemetry?: BluTelemetry | null;
  device?: BluDevice | null;
  devices?: BluDevice[];
  error?: string | null;
  errorCode?: string | null;
  meta?: Record<string, unknown>;
}

type BluettiAdapterEventListener = (payload: BluettiAdapterEventPayload) => void;

// ── Simulated Telemetry (for dev/demo when BLE is unavailable) ──────────

interface SimulatedBluettiState {
  batteryPercent: number;
  inputWatts: number;
  outputWatts: number;
  solarWatts: number;
  acOutputWatts: number;
  dcOutputWatts: number;
  temperatureC: number;
  acOutputOn: boolean;
  dcOutputOn: boolean;
  batteryVolts: number;
}

function createSimulatedState(): SimulatedBluettiState {
  return {
    batteryPercent: 65 + Math.random() * 20,
    inputWatts: Math.random() > 0.3 ? 100 + Math.random() * 400 : 0,
    outputWatts: 50 + Math.random() * 200,
    solarWatts: Math.random() > 0.4 ? 50 + Math.random() * 300 : 0,
    acOutputWatts: 30 + Math.random() * 150,
    dcOutputWatts: 10 + Math.random() * 50,
    temperatureC: 22 + Math.random() * 15,
    acOutputOn: Math.random() > 0.3,
    dcOutputOn: Math.random() > 0.2,
    batteryVolts: 48 + Math.random() * 8,
  };
}

function driftSimulatedState(prev: SimulatedBluettiState): SimulatedBluettiState {
  const drift = (val: number, range: number, min: number, max: number) =>
    Math.max(min, Math.min(max, val + (Math.random() - 0.5) * range));

  return {
    batteryPercent: drift(prev.batteryPercent, 2, 0, 100),
    inputWatts: drift(prev.inputWatts, 30, 0, 2000),
    outputWatts: drift(prev.outputWatts, 20, 0, 2000),
    solarWatts: drift(prev.solarWatts, 25, 0, 900),
    acOutputWatts: drift(prev.acOutputWatts, 15, 0, 1500),
    dcOutputWatts: drift(prev.dcOutputWatts, 8, 0, 500),
    temperatureC: drift(prev.temperatureC, 1, 10, 50),
    acOutputOn: prev.acOutputOn,
    dcOutputOn: prev.dcOutputOn,
    batteryVolts: drift(prev.batteryVolts, 0.5, 40, 60),
  };
}

// ── Configuration ───────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const BACKGROUND_POLL_INTERVAL_MS = 60_000;
const MAX_CONSECUTIVE_FAILURES = 5;
const BACKOFF_POLL_INTERVAL_MS = 30_000;
const RECONNECT_THRESHOLD = 3;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 10_000;
const BLE_SCAN_DURATION_MS = 10_000;

// ── Bluetti Device Capabilities ─────────────────────────────────────────

const BLUETTI_CAPABILITIES: BluDeviceCapabilities = {
  hasBatteryPercent: true,
  hasInputWatts: true,
  hasOutputWatts: true,
  hasSolarInput: true,
  hasAcOutput: true,
  hasDcOutput: true,
  hasTemperature: true,
  hasRuntimeEstimate: false, // Calculated from SOC + output
  controllable: false,
};

// ── Subscriber type ─────────────────────────────────────────────────────

type AdapterSubscriber = (state: BluettiAdapterState) => void;

// ── Adapter Class ───────────────────────────────────────────────────────

class BluettiBluAdapter {
  private connectionState: BluConnectionState = 'disconnected';
  private discoveredDevices: BluettiDiscoveredDevice[] = [];
  private connectedDevices: BluDevice[] = [];
  private lastError: string | null = null;
  private lastErrorCode: string | null = null;
  private pollCount = 0;
  private lastPollAt: number | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private subscribers = new Set<AdapterSubscriber>();
  private isPolling = false;
  private isPaused = false;
  private isScanning = false;
  private consecutiveFailures = 0;
  private currentPollInterval = DEFAULT_POLL_INTERVAL_MS;
  private appStateSubscription: any = null;

  // Reconnect state
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnectRequested = false;

  // Simulated state for dev/demo
  private simulatedStates = new Map<string, SimulatedBluettiState>();
  private lastTelemetry: BluTelemetry | null = null;
  private eventSubscribers = new Map<BluettiAdapterEventName, Set<BluettiAdapterEventListener>>();

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

  on(event: BluettiAdapterEventName, listener: BluettiAdapterEventListener): () => void {
    const listeners = this.eventSubscribers.get(event) ?? new Set<BluettiAdapterEventListener>();
    listeners.add(listener);
    this.eventSubscribers.set(event, listeners);
    return () => this.off(event, listener);
  }

  off(event: BluettiAdapterEventName, listener: BluettiAdapterEventListener): void {
    const listeners = this.eventSubscribers.get(event);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) {
      this.eventSubscribers.delete(event);
    }
  }

  addListener(event: BluettiAdapterEventName, listener: BluettiAdapterEventListener): () => void {
    return this.on(event, listener);
  }

  removeListener(event: BluettiAdapterEventName, listener: BluettiAdapterEventListener): void {
    this.off(event, listener);
  }

  subscribeEvent(event: BluettiAdapterEventName, listener: BluettiAdapterEventListener): () => void {
    return this.on(event, listener);
  }

  private emitEvent(
    type: BluettiAdapterEventName,
    extras: Omit<Partial<BluettiAdapterEventPayload>, 'type' | 'provider' | 'timestamp' | 'state'> = {},
  ): void {
    const listeners = this.eventSubscribers.get(type);
    if (!listeners || listeners.size === 0) return;

    const payload: BluettiAdapterEventPayload = {
      type,
      provider: 'bluetti',
      timestamp: Date.now(),
      state: this.getState(),
      telemetry: extras.telemetry ?? undefined,
      device: extras.device ?? undefined,
      devices: extras.devices ?? undefined,
      error: extras.error ?? undefined,
      errorCode: extras.errorCode ?? undefined,
      meta: extras.meta ?? undefined,
    };

    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        /* event subscriber errors must never crash the adapter */
      }
    }
  }

  private emitStatus(meta?: Record<string, unknown>): void {
    this.emitEvent('status', { meta });
  }

  // ── State Snapshot ─────────────────────────────────────────────────

  getState(): BluettiAdapterState {
    return {
      connectionState: this.connectionState,
      discoveredDevices: [...this.discoveredDevices],
      connectedDevices: [...this.connectedDevices],
      lastError: this.lastError,
      lastErrorCode: this.lastErrorCode,
      pollCount: this.pollCount,
      lastPollAt: this.lastPollAt,
      isPaused: this.isPaused,
      isScanning: this.isScanning,
      consecutiveFailures: this.consecutiveFailures,
      isReconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  getLastTelemetry(): BluTelemetry | null {
    return this.lastTelemetry ? { ...this.lastTelemetry } : null;
  }

  getECSBridgeState(): {
    provider: 'bluetti';
    connectionState: BluConnectionState;
    isConnected: boolean;
    isReconnecting: boolean;
    isPaused: boolean;
    isScanning: boolean;
    lastError: string | null;
    lastErrorCode: string | null;
    pollCount: number;
    lastPollAt: number | null;
    primaryDeviceId: string | null;
    primaryDevice: BluDevice | null;
    connectedDevices: BluDevice[];
    discoveredDevices: BluettiDiscoveredDevice[];
    telemetry: BluTelemetry | null;
  } {
    const primaryDeviceId = this.getPrimaryDeviceId();
    const primaryDevice = primaryDeviceId
      ? bluDeviceRegistry.getDevice('bluetti', primaryDeviceId) ?? null
      : null;

    return {
      provider: 'bluetti',
      connectionState: this.connectionState,
      isConnected: this.connectionState === 'connected',
      isReconnecting: this.isReconnecting,
      isPaused: this.isPaused,
      isScanning: this.isScanning,
      lastError: this.lastError,
      lastErrorCode: this.lastErrorCode,
      pollCount: this.pollCount,
      lastPollAt: this.lastPollAt,
      primaryDeviceId,
      primaryDevice,
      connectedDevices: [...this.connectedDevices],
      discoveredDevices: [...this.discoveredDevices],
      telemetry: this.getLastTelemetry(),
    };
  }

  // ── BLE Scan ──────────────────────────────────────────────────────

  /**
   * Scan for nearby Bluetti BLE devices.
   *
   * On native platforms, this uses the BLE scanner to discover devices
   * advertising the Bluetti service UUID. On web/dev, returns simulated
   * devices for testing.
   *
   * Returns discovered devices after the scan window expires.
   */
  async scanForDevices(): Promise<BluettiDiscoveredDevice[]> {
    if (this.isScanning) {
      console.log('[BluettiBluAdapter] Scan already in progress.');
      return this.discoveredDevices;
    }

    this.isScanning = true;
    this.lastError = null;
    this.lastErrorCode = null;
    this.notify();

    console.log('[BluettiBluAdapter] Starting BLE scan for Bluetti devices...');

    try {
      // On web or when BLE is unavailable, return simulated devices
      if (Platform.OS === 'web' || !this.isBleAvailable()) {
        if (!isDevMockTelemetryAllowed()) {
          console.log('[BT_LIVE] mock_disabled', { provider: 'bluetti', phase: 'scan' });
          this.discoveredDevices = [];
          this.lastError = 'Live Bluetooth scan unavailable; mock discovery is disabled.';
          this.lastErrorCode = 'MOCK_DISABLED';
          return [];
        }
        console.log('[BluettiBluAdapter] BLE unavailable — using simulated discovery.');
        await this.simulateDelay(1500);

        this.discoveredDevices = [
          {
            id: 'bluetti-sim-ac200max',
            name: 'AC200MAX',
            rssi: -55,
            model: 'AC200MAX',
            modelSpec: lookupBluettiModel('AC200MAX'),
          },
          {
            id: 'bluetti-sim-eb3a',
            name: 'EB3A',
            rssi: -68,
            model: 'EB3A',
            modelSpec: lookupBluettiModel('EB3A'),
          },
        ];

        console.log(`[BluettiBluAdapter] Simulated ${this.discoveredDevices.length} device(s).`);
      } else {
        // Native BLE scanning
        await this.performBleScan();
      }

      this.isScanning = false;
      this.notify();
      this.emitStatus({ phase: 'scan_complete', discoveredCount: this.discoveredDevices.length });
      return this.discoveredDevices;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed';
      console.error('[BluettiBluAdapter] Scan error:', msg);
      this.lastError = 'Failed to scan for Bluetti devices.';
      this.lastErrorCode = 'SCAN_FAILED';
      this.isScanning = false;
      this.notify();
      this.emitEvent('error', { error: this.lastError, errorCode: this.lastErrorCode, meta: { phase: 'scan' } });
      this.emitStatus({ phase: 'scan_failed' });
      return [];
    }
  }

  /**
   * Perform native BLE scan (placeholder — requires react-native-ble-plx).
   * In production, this would use the BLE manager to scan for devices
   * advertising BLUETTI_SERVICE_UUID.
   */
  private async performBleScan(): Promise<void> {
    // BLE scanning requires react-native-ble-plx or similar library.
    // For now, we use simulated discovery on all platforms.
    // When BLE library is available, this will be replaced with real scanning.
    console.log('[BluettiBluAdapter] Native BLE scan — using simulated fallback.');
    await this.simulateDelay(2000);

    this.discoveredDevices = [
      {
        id: 'bluetti-sim-ac200max',
        name: 'AC200MAX',
        rssi: -55,
        model: 'AC200MAX',
        modelSpec: lookupBluettiModel('AC200MAX'),
      },
    ];
  }

  // ── Connect ────────────────────────────────────────────────────────

  /**
   * Connect to a specific Bluetti device by its BLE peripheral ID.
   *
   * Flow:
   *   1. Set state to 'connecting'
   *   2. Establish BLE connection (or simulate)
   *   3. Normalize device into BluDevice format
   *   4. Register in BluDeviceRegistry
   *   5. Set state to 'connected'
   *   6. Persist session
   */
  async connect(deviceId?: string): Promise<BluettiConnectResult> {
    console.log(`[BluettiBluAdapter] Connecting to device: ${deviceId || 'first available'}...`);

    this.manualDisconnectRequested = false;
    this.connectionState = 'connecting';
    this.lastError = null;
    this.lastErrorCode = null;
    this.consecutiveFailures = 0;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    bluStateStore.setReconnecting(false);
    this.notify();
    this.emitEvent('connect', { meta: { deviceId: deviceId ?? null } });
    this.emitStatus({ phase: 'connecting', deviceId: deviceId ?? null });

    try {
      // If no specific device, scan first
      if (!deviceId && this.discoveredDevices.length === 0) {
        await this.scanForDevices();
      }

      // Find the target device
      const target = deviceId
        ? this.discoveredDevices.find((d) => d.id === deviceId)
        : this.discoveredDevices[0];

      if (!target) {
        return this.handleConnectError(
          'No Bluetti device found. Make sure your device is powered on and Bluetooth is enabled.',
          'NO_DEVICE',
        );
      }

      // Simulate BLE connection delay
      await this.simulateDelay(1200);

      // Initialize simulated state for this device
      if (!this.simulatedStates.has(target.id)) {
        this.simulatedStates.set(target.id, createSimulatedState());
      }

      // Normalize to BluDevice
      const bluDevice = this.normalizeDevice(target);

      // Register in BLU Device Registry
      await bluDeviceRegistry.registerDevice({
        provider: bluDevice.provider,
        device_id: bluDevice.device_id,
        display_name: bluDevice.display_name,
        model: bluDevice.model,
        connection_state: 'connected',
        last_seen: Date.now(),
        capabilities: bluDevice.capabilities,
      });

      // Ensure primary
      await bluDeviceRegistry.ensurePrimary('bluetti');

      // Update adapter state
      this.connectionState = 'connected';
      this.connectedDevices = bluDeviceRegistry.getByProvider('bluetti');
      this.lastError = null;
      this.lastErrorCode = null;

      // Persist session
      const primary = bluDeviceRegistry.getPrimary();
      bluSessionStore.recordConnection('bluetti', primary?.device_id ?? null);

      this.notify();
      this.emitEvent('connected', { device: bluDevice, devices: [...this.connectedDevices], meta: { deviceId: target.id, deviceName: target.name } });
      this.emitStatus({ phase: 'connected', deviceId: target.id });

      console.log(
        `[BluettiBluAdapter] Connected to ${target.name} (${target.id}). ` +
        `${this.connectedDevices.length} device(s) registered.`,
      );

      return {
        success: true,
        device: bluDevice,
        error: null,
        errorCode: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      console.error('[BluettiBluAdapter] Connect error:', msg);
      return this.handleConnectError(
        'Connection failed. Please check Bluetooth is enabled and try again.',
        'UNEXPECTED',
      );
    }
  }

  // ── Connect All Discovered ─────────────────────────────────────────

  /**
   * Connect to all discovered Bluetti devices.
   * Useful for multi-battery setups.
   */
  async connectAll(): Promise<BluettiConnectResult[]> {
    if (this.discoveredDevices.length === 0) {
      await this.scanForDevices();
    }

    const results: BluettiConnectResult[] = [];
    for (const device of this.discoveredDevices) {
      const result = await this.connect(device.id);
      results.push(result);
    }

    return results;
  }

  // ── Disconnect ─────────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    console.log('[BluettiBluAdapter] Disconnecting...');

    this.manualDisconnectRequested = true;
    this.stopPolling();
    this.cancelReconnect();
    this.removeAppStateListener();

    // Clear Bluetti devices from registry
    await bluDeviceRegistry.clearProvider('bluetti');

    this.connectionState = 'disconnected';
    this.connectedDevices = [];
    this.discoveredDevices = [];
    this.simulatedStates.clear();
    this.lastError = null;
    this.lastErrorCode = null;
    this.pollCount = 0;
    this.lastPollAt = null;
    this.consecutiveFailures = 0;
    this.isPaused = false;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;

    bluStateStore.setReconnecting(false);
    bluStateStore.clearProviderTelemetry('bluetti');
    bluSessionStore.recordDisconnection();

    this.notify();
    this.emitEvent('disconnect', { meta: { requested: true } });
    this.emitEvent('disconnected', { meta: { requested: true } });
    this.emitStatus({ phase: 'disconnected', requested: true });
    console.log('[BluettiBluAdapter] Disconnected.');
  }

  // ── Poll Telemetry ─────────────────────────────────────────────────

  /**
   * Poll telemetry for a specific device (or the primary Bluetti device).
   *
   * On native: reads Modbus registers via BLE.
   * On web/dev: returns simulated telemetry.
   */
  async pollTelemetry(deviceId?: string): Promise<BluettiPollResult> {
    if (this.isPolling) {
      return { success: false, telemetry: null, error: 'Poll already in progress' };
    }

    this.isPolling = true;

    try {
      const targetDeviceId = deviceId || this.getPrimaryDeviceId();
      if (!targetDeviceId) {
        return {
          success: false,
          telemetry: null,
          error: 'No Bluetti device available to poll',
        };
      }

      // Get or create simulated state
      let simState = this.simulatedStates.get(targetDeviceId);
      if (!simState) {
        simState = createSimulatedState();
        this.simulatedStates.set(targetDeviceId, simState);
      }

      // Drift the simulated state
      const newState = driftSimulatedState(simState);
      this.simulatedStates.set(targetDeviceId, newState);

      // Look up model for capacity info
      const device = bluDeviceRegistry.getDevice('bluetti', targetDeviceId);
      const modelSpec = device ? lookupBluettiModel(device.model) : undefined;

      // Normalize to BluTelemetry
      const telemetry = this.normalizeTelemetry(targetDeviceId, newState, modelSpec);

      // Feed into BLU state store
      bluStateStore.ingestTelemetry(telemetry);
      this.lastTelemetry = telemetry;

      // Update device connection state
      await bluDeviceRegistry.updateConnectionState('bluetti', targetDeviceId, 'connected');

      this.pollCount++;
      this.lastPollAt = Date.now();
      this.consecutiveFailures = 0;

      if (this.reconnectAttempts > 0) {
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        bluStateStore.setReconnecting(false);
      }

      if (this.currentPollInterval !== DEFAULT_POLL_INTERVAL_MS && !this.isPaused) {
        this.currentPollInterval = DEFAULT_POLL_INTERVAL_MS;
      }

      this.notify();
      this.emitEvent('telemetry', { telemetry, meta: { deviceId: targetDeviceId, pollCount: this.pollCount } });
      this.emitEvent('data', { telemetry, meta: { deviceId: targetDeviceId, pollCount: this.pollCount } });
      this.emitStatus({ phase: 'poll_success', deviceId: targetDeviceId, pollCount: this.pollCount });

      console.log(
        `[BluettiBluAdapter] Poll #${this.pollCount} success` +
        ` | SOC=${telemetry.battery_percent ?? '?'}%` +
        ` | IN=${telemetry.input_watts ?? '?'}W` +
        ` | OUT=${telemetry.output_watts ?? '?'}W` +
        ` | SOLAR=${telemetry.solar_input_watts ?? '?'}W` +
        ` | TEMP=${telemetry.temperature_celsius ?? '?'}°C`,
      );

      return {
        success: true,
        telemetry,
        error: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      console.error('[BluettiBluAdapter] Poll error (isolated):', msg);
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

  startPolling(intervalMs: number = DEFAULT_POLL_INTERVAL_MS): void {
    this.stopPolling();
    this.currentPollInterval = intervalMs;
    this.isPaused = false;

    this.registerAppStateListener();
    bluSessionStore.recordPollingStarted();

    const tick = async () => {
      if (this.connectionState !== 'connected' && !this.isReconnecting) return;
      if (this.isPaused) {
        this.pollTimer = setTimeout(tick, BACKGROUND_POLL_INTERVAL_MS);
        return;
      }

      await this.pollTelemetry();

      const nextInterval = this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
        ? BACKOFF_POLL_INTERVAL_MS
        : this.currentPollInterval;

      this.pollTimer = setTimeout(tick, nextInterval);
    };

    tick();
    console.log(`[BluettiBluAdapter] Auto-polling started (${intervalMs}ms interval)`);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    bluSessionStore.recordPollingStopped();
  }

  // ── Session Restore ────────────────────────────────────────────────

  async restoreSession(): Promise<boolean> {
    if (!bluSessionStore.hasPreviousSession()) {
      console.log('[BluettiBluAdapter] No previous session to restore.');
      return false;
    }

    const session = bluSessionStore.getSession();
    if (session.provider !== 'bluetti') {
      console.log('[BluettiBluAdapter] Previous session is not Bluetti.');
      return false;
    }

    console.log(
      `[BluettiBluAdapter] Restoring session: primary=${session.primaryDeviceId}` +
      ` | polling=${session.wasPolling}`,
    );

    // Scan and connect
    await this.scanForDevices();
    const result = await this.connect(
      session.primaryDeviceId || undefined,
    );

    if (!result.success) {
      console.log('[BluettiBluAdapter] Session restore failed.');
      return false;
    }

    // Restore primary
    if (session.primaryDeviceId) {
      await bluDeviceRegistry.restorePrimary('bluetti', session.primaryDeviceId);
      this.connectedDevices = bluDeviceRegistry.getByProvider('bluetti');
      this.notify();
    }

    // Resume polling
    if (session.wasPolling) {
      this.startPolling(DEFAULT_POLL_INTERVAL_MS);
    }

    console.log('[BluettiBluAdapter] Session restored successfully.');
    return true;
  }

  // ── Set Primary Device ─────────────────────────────────────────────

  async setPrimaryDevice(deviceId: string): Promise<void> {
    console.log(`[BluettiBluAdapter] Setting primary device: ${deviceId}`);
    await bluDeviceRegistry.setPrimary('bluetti', deviceId);
    this.connectedDevices = bluDeviceRegistry.getByProvider('bluetti');
    bluSessionStore.recordPrimaryDeviceChange(deviceId);
    this.notify();

    // Poll the new primary immediately
    await this.pollTelemetry(deviceId);
  }

  // ── Refresh Devices ────────────────────────────────────────────────

  async refreshDevices(): Promise<BluettiDiscoveredDevice[]> {
    console.log('[BluettiBluAdapter] Refreshing device list...');
    return this.scanForDevices();
  }

  // ── Rename Device ──────────────────────────────────────────────────

  async renameDevice(deviceId: string, newName: string): Promise<void> {
    const devices = bluDeviceRegistry.getAll();
    const device = devices.find(
      (d) => d.provider === 'bluetti' && d.device_id === deviceId,
    );
    if (!device) return;

    // Re-register with new name (merge logic handles update)
    await bluDeviceRegistry.registerDevice({
      provider: 'bluetti',
      device_id: deviceId,
      display_name: newName,
      model: device.model,
      connection_state: device.connection_state,
      last_seen: Date.now(),
      capabilities: device.capabilities,
    });

    this.connectedDevices = bluDeviceRegistry.getByProvider('bluetti');
    this.notify();
    console.log(`[BluettiBluAdapter] Device ${deviceId} renamed to "${newName}".`);
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private isBleAvailable(): boolean {
    // Check if BLE library is available
    // In production, this would check for react-native-ble-plx
    return false; // Default to simulated mode
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeDevice(discovered: BluettiDiscoveredDevice): BluDevice {
    const modelName = discovered.model || extractModelFromName(discovered.name) || 'Bluetti Device';
    const spec = discovered.modelSpec || lookupBluettiModel(modelName);

    return {
      provider: 'bluetti',
      device_id: discovered.id,
      display_name: spec?.displayName || discovered.name || discovered.id,
      model: modelName,
      connection_state: 'connected',
      last_seen: Date.now(),
      capabilities: { ...BLUETTI_CAPABILITIES },
      is_primary: false,
    };
  }

  private normalizeTelemetry(
    deviceId: string,
    state: SimulatedBluettiState,
    modelSpec?: BluettiModelSpec,
  ): BluTelemetry {
    const inputW = Math.round(state.inputWatts);
    const outputW = Math.round(state.outputWatts);
    const now = Date.now();

    return withBluPowerTelemetryEnvelope({
      timestamp: now,
      provider: 'bluetti',
      device_id: deviceId,
      source: 'mock_dev',
      updatedAt: now,
      telemetrySourceLabel: getBluetoothTelemetrySourceLabel('mock_dev'),
      isLive: false,

      // Core telemetry
      battery_percent: Math.round(state.batteryPercent * 10) / 10,
      input_watts: inputW,
      output_watts: outputW,
      battery_watts: inputW - outputW,

      // Source-specific
      solar_input_watts: Math.round(state.solarWatts),
      ac_output_watts: Math.round(state.acOutputWatts),
      dc_output_watts: Math.round(state.dcOutputWatts),

      // Environmental
      temperature_celsius: Math.round(state.temperatureC * 10) / 10,

      // Extended
      battery_volts: Math.round(state.batteryVolts * 10) / 10,
      inverter_on: state.acOutputOn,
      capacity_wh: modelSpec?.capacityWh,
      raw: {
        simulated: true,
        mock: true,
      },
    });
  }

  private getPrimaryDeviceId(): string | null {
    const primary = bluDeviceRegistry.getPrimary();
    if (primary && primary.provider === 'bluetti') {
      return primary.device_id;
    }
    const devices = bluDeviceRegistry.getByProvider('bluetti');
    return devices.length > 0 ? devices[0].device_id : null;
  }

  private handlePollFailure(error: string): void {
    this.consecutiveFailures++;
    bluStateStore.recordPollFailure(error);
    this.emitEvent('error', {
      error,
      errorCode: 'POLL_FAILED',
      telemetry: this.lastTelemetry,
      meta: { consecutiveFailures: this.consecutiveFailures },
    });

    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log(
        `[BluettiBluAdapter] ${this.consecutiveFailures} consecutive failures — backing off`,
      );
    }

    if (
      this.consecutiveFailures >= RECONNECT_THRESHOLD &&
      !this.isReconnecting &&
      this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS
    ) {
      this.attemptQuietReconnect();
    }

    this.notify();
    this.emitStatus({ phase: 'poll_failed', consecutiveFailures: this.consecutiveFailures });
  }

  private async attemptQuietReconnect(): Promise<void> {
    if (this.manualDisconnectRequested) return;
    if (this.isReconnecting) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.isReconnecting = false;
      bluStateStore.setReconnecting(false);
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    bluStateStore.setReconnecting(true);
    this.notify();
    this.emitEvent('reconnecting', { telemetry: this.lastTelemetry, meta: { attempt: this.reconnectAttempts } });
    this.emitEvent('reconnect_start', { telemetry: this.lastTelemetry, meta: { attempt: this.reconnectAttempts } });
    this.emitStatus({ phase: 'reconnecting', attempt: this.reconnectAttempts });

    console.log(
      `[BluettiBluAdapter] Quiet reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`,
    );

    try {
      await this.simulateDelay(2000);
      if (this.manualDisconnectRequested) {
        this.isReconnecting = false;
        bluStateStore.setReconnecting(false);
        return;
      }

      // Reconnect succeeded (simulated)
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;
      this.connectionState = 'connected';
      bluStateStore.setReconnecting(false);

      this.connectedDevices = bluDeviceRegistry.getByProvider('bluetti');
      await bluDeviceRegistry.ensurePrimary('bluetti');

      const primary = bluDeviceRegistry.getPrimary();
      bluSessionStore.recordConnection('bluetti', primary?.device_id ?? null);

      this.notify();
      this.emitEvent('reconnect_success', {
        telemetry: this.lastTelemetry,
        devices: [...this.connectedDevices],
        meta: { provider: 'bluetti' },
      });
      this.emitEvent('reconnected', {
        telemetry: this.lastTelemetry,
        devices: [...this.connectedDevices],
        meta: { provider: 'bluetti' },
      });
      this.emitStatus({ phase: 'reconnect_success' });

      if (!this.pollTimer) {
        this.startPolling(DEFAULT_POLL_INTERVAL_MS);
      }
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.manualDisconnectRequested) {
      this.cancelReconnect();
      return;
    }
    this.isReconnecting = false;
    this.notify();

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      bluStateStore.setReconnecting(false);
      this.emitEvent('reconnect_failed', {
        error: 'Reconnect attempts exhausted',
        errorCode: 'RECONNECT_EXHAUSTED',
        telemetry: this.lastTelemetry,
        meta: { attempts: this.reconnectAttempts },
      });
      this.emitStatus({ phase: 'reconnect_failed', attempts: this.reconnectAttempts });
      return;
    }

    const delay = RECONNECT_DELAY_MS * this.reconnectAttempts;
    this.emitStatus({ phase: 'reconnect_scheduled', delay, attempt: this.reconnectAttempts });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manualDisconnectRequested) {
        this.cancelReconnect();
        return;
      }
      this.attemptQuietReconnect();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    bluStateStore.setReconnecting(false);
  }

  private handleConnectError(
    message: string,
    code: string,
  ): BluettiConnectResult {
    this.connectionState = 'error';
    this.lastError = message;
    this.lastErrorCode = code;
    this.notify();
    this.emitEvent('error', {
      error: message,
      errorCode: code,
      telemetry: this.lastTelemetry,
      meta: { phase: 'connect' },
    });
    this.emitStatus({ phase: 'connect_error', code });

    return {
      success: false,
      device: null,
      error: message,
      errorCode: code,
    };
  }

  // ── App Lifecycle ──────────────────────────────────────────────────

  private registerAppStateListener(): void {
    if (this.appStateSubscription) return;
    try {
      this.appStateSubscription = AppState.addEventListener(
        'change',
        this.handleAppStateChange,
      );
    } catch {
      /* AppState may not be available */
    }
  }

  private removeAppStateListener(): void {
    if (this.appStateSubscription) {
      try {
        this.appStateSubscription.remove();
      } catch { /* swallow */ }
      this.appStateSubscription = null;
    }
  }

  private handleAppStateChange = (nextState: AppStateStatus): void => {
    if (nextState === 'active') {
      if (this.isPaused) {
        this.isPaused = false;
        this.currentPollInterval = DEFAULT_POLL_INTERVAL_MS;
        this.notify();
        this.emitStatus({ phase: 'app_active' });
        if (this.connectionState === 'connected') {
          this.pollTelemetry();
        }
      }
    } else if (nextState === 'background' || nextState === 'inactive') {
      if (!this.isPaused) {
        this.isPaused = true;
        this.notify();
        this.emitStatus({ phase: 'app_backgrounded' });
      }
    }
  };
}

// ── Singleton ───────────────────────────────────────────────────────────

export const bluettiBluAdapter = new BluettiBluAdapter();

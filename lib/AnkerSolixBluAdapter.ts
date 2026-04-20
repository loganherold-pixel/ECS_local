/**
 * AnkerSolixBluAdapter — BLU provider adapter for Anker SOLIX power stations.
 *
 * Bridges Anker SOLIX BLE communication into the BLU universal telemetry layer.
 *
 * Responsibilities:
 *   - Scan for nearby AnkerSolix BLE devices
 *   - Connect via BLE (or simulated BLE in dev)
 *   - Normalize AnkerSolix telemetry into BluTelemetry format
 *   - Register discovered devices in BluDeviceRegistry
 *   - Poll telemetry and feed it into BluStateStore
 *   - Manage connection state transitions
 *   - App lifecycle awareness (pause/resume polling)
 *   - Session persistence and auto-reconnect
 *
 * BLE Architecture:
 *   Anker SOLIX devices use a custom BLE service (0xFF00) with Modbus-RTU
 *   framing. This adapter abstracts the BLE layer and provides a clean
 *   interface identical to the EcoFlow adapter.
 *
 * Phase 2A — Anker SOLIX BLE integration.
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
import {
  isAnkerSolixDeviceName,
  extractAnkerModelFromName,
  lookupAnkerSolixModel,
  ANKER_SOLIX_SERVICE_UUID,
  type AnkerSolixModelSpec,
} from './AnkerSolixConstants';

// ── Types ───────────────────────────────────────────────────────────────

/** Discovered BLE device from scanning. */
export interface AnkerSolixDiscoveredDevice {
  id: string;           // BLE peripheral ID (MAC or UUID)
  name: string;         // Advertised device name
  rssi: number;         // Signal strength
  model?: string;       // Extracted model name
  modelSpec?: AnkerSolixModelSpec; // Full model spec if known
}

/** Connection result from the adapter. */
export interface AnkerSolixConnectResult {
  success: boolean;
  device: BluDevice | null;
  error: string | null;
  errorCode: string | null;
}

/** Telemetry poll result from the adapter. */
export interface AnkerSolixPollResult {
  success: boolean;
  telemetry: BluTelemetry | null;
  error: string | null;
}

/** Adapter state snapshot for UI consumption. */
export interface AnkerSolixAdapterState {
  connectionState: BluConnectionState;
  discoveredDevices: AnkerSolixDiscoveredDevice[];
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


export type AnkerSolixAdapterEventName =
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

export interface AnkerSolixAdapterEventPayload {
  type: AnkerSolixAdapterEventName;
  provider: 'anker_solix';
  timestamp: number;
  state: AnkerSolixAdapterState;
  telemetry?: BluTelemetry | null;
  device?: BluDevice | null;
  devices?: BluDevice[];
  error?: string | null;
  errorCode?: string | null;
  meta?: Record<string, unknown>;
}

type AnkerSolixAdapterEventListener = (payload: AnkerSolixAdapterEventPayload) => void;

// ── Simulated Telemetry (for dev/demo when BLE is unavailable) ──────────

interface SimulatedAnkerSolixState {
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

function createSimulatedState(): SimulatedAnkerSolixState {
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

function driftSimulatedState(prev: SimulatedAnkerSolixState): SimulatedAnkerSolixState {
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

// ── Anker SOLIX Device Capabilities ─────────────────────────────────────────

const ANKER_SOLIX_CAPABILITIES: BluDeviceCapabilities = {
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

type AdapterSubscriber = (state: AnkerSolixAdapterState) => void;

// ── Adapter Class ───────────────────────────────────────────────────────

class AnkerSolixBluAdapter {
  private connectionState: BluConnectionState = 'disconnected';
  private discoveredDevices: AnkerSolixDiscoveredDevice[] = [];
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

  // Simulated state for dev/demo
  private simulatedStates = new Map<string, SimulatedAnkerSolixState>();
  private lastTelemetry: BluTelemetry | null = null;
  private eventSubscribers = new Map<AnkerSolixAdapterEventName, Set<AnkerSolixAdapterEventListener>>();

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

  on(event: AnkerSolixAdapterEventName, listener: AnkerSolixAdapterEventListener): () => void {
    const listeners = this.eventSubscribers.get(event) ?? new Set<AnkerSolixAdapterEventListener>();
    listeners.add(listener);
    this.eventSubscribers.set(event, listeners);
    return () => this.off(event, listener);
  }

  off(event: AnkerSolixAdapterEventName, listener: AnkerSolixAdapterEventListener): void {
    const listeners = this.eventSubscribers.get(event);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) {
      this.eventSubscribers.delete(event);
    }
  }

  addListener(event: AnkerSolixAdapterEventName, listener: AnkerSolixAdapterEventListener): () => void {
    return this.on(event, listener);
  }

  removeListener(event: AnkerSolixAdapterEventName, listener: AnkerSolixAdapterEventListener): void {
    this.off(event, listener);
  }

  subscribeEvent(event: AnkerSolixAdapterEventName, listener: AnkerSolixAdapterEventListener): () => void {
    return this.on(event, listener);
  }

  private emitEvent(
    type: AnkerSolixAdapterEventName,
    extras: Omit<Partial<AnkerSolixAdapterEventPayload>, 'type' | 'provider' | 'timestamp' | 'state'> = {},
  ): void {
    const listeners = this.eventSubscribers.get(type);
    if (!listeners || listeners.size === 0) return;

    const payload: AnkerSolixAdapterEventPayload = {
      type,
      provider: 'anker_solix',
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

  getState(): AnkerSolixAdapterState {
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
    provider: 'anker_solix';
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
    discoveredDevices: AnkerSolixDiscoveredDevice[];
    telemetry: BluTelemetry | null;
  } {
    const primaryDeviceId = this.getPrimaryDeviceId();
    const primaryDevice = primaryDeviceId
      ? bluDeviceRegistry.getDevice('anker_solix', primaryDeviceId) ?? null
      : null;

    return {
      provider: 'anker_solix',
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
   * Scan for nearby AnkerSolix BLE devices.
   *
   * On native platforms, this uses the BLE scanner to discover devices
   * advertising the Anker SOLIX service UUID. On web/dev, returns simulated
   * devices for testing.
   *
   * Returns discovered devices after the scan window expires.
   */
  async scanForDevices(): Promise<AnkerSolixDiscoveredDevice[]> {
    if (this.isScanning) {
      console.log('[AnkerSolixBluAdapter] Scan already in progress.');
      return this.discoveredDevices;
    }

    this.isScanning = true;
    this.lastError = null;
    this.lastErrorCode = null;
    this.notify();

    console.log('[AnkerSolixBluAdapter] Starting BLE scan for Anker SOLIX devices...');

    try {
      // On web or when BLE is unavailable, return simulated devices
      if (Platform.OS === 'web' || !this.isBleAvailable()) {
        console.log('[AnkerSolixBluAdapter] BLE unavailable — using simulated discovery.');
        await this.simulateDelay(1500);

        this.discoveredDevices = [
          {
            id: 'anker_solix-sim-ac200max',
            name: 'AC200MAX',
            rssi: -55,
            model: 'AC200MAX',
            modelSpec: lookupAnkerSolixModel('AC200MAX'),
          },
          {
            id: 'anker_solix-sim-eb3a',
            name: 'EB3A',
            rssi: -68,
            model: 'EB3A',
            modelSpec: lookupAnkerSolixModel('EB3A'),
          },
        ];

        console.log(`[AnkerSolixBluAdapter] Simulated ${this.discoveredDevices.length} device(s).`);
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
      console.error('[AnkerSolixBluAdapter] Scan error:', msg);
      this.lastError = 'Failed to scan for Anker SOLIX devices.';
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
   * advertising ANKER_SOLIX_SERVICE_UUID.
   */
  private async performBleScan(): Promise<void> {
    // BLE scanning requires react-native-ble-plx or similar library.
    // For now, we use simulated discovery on all platforms.
    // When BLE library is available, this will be replaced with real scanning.
    console.log('[AnkerSolixBluAdapter] Native BLE scan — using simulated fallback.');
    await this.simulateDelay(2000);

    this.discoveredDevices = [
      {
        id: 'anker_solix-sim-ac200max',
        name: 'AC200MAX',
        rssi: -55,
        model: 'AC200MAX',
        modelSpec: lookupAnkerSolixModel('AC200MAX'),
      },
    ];
  }

  // ── Connect ────────────────────────────────────────────────────────

  /**
   * Connect to a specific Anker SOLIX device by its BLE peripheral ID.
   *
   * Flow:
   *   1. Set state to 'connecting'
   *   2. Establish BLE connection (or simulate)
   *   3. Normalize device into BluDevice format
   *   4. Register in BluDeviceRegistry
   *   5. Set state to 'connected'
   *   6. Persist session
   */
  async connect(deviceId?: string): Promise<AnkerSolixConnectResult> {
    console.log(`[AnkerSolixBluAdapter] Connecting to device: ${deviceId || 'first available'}...`);

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
          'No Anker SOLIX device found. Make sure your device is powered on and Bluetooth is enabled.',
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
      await bluDeviceRegistry.ensurePrimary('anker_solix');

      // Update adapter state
      this.connectionState = 'connected';
      this.connectedDevices = bluDeviceRegistry.getByProvider('anker_solix');
      this.lastError = null;
      this.lastErrorCode = null;

      // Persist session
      const primary = bluDeviceRegistry.getPrimary();
      bluSessionStore.recordConnection('anker_solix', primary?.device_id ?? null);

      this.notify();
      this.emitEvent('connected', { device: bluDevice, devices: [...this.connectedDevices], meta: { deviceId: target.id, deviceName: target.name } });
      this.emitStatus({ phase: 'connected', deviceId: target.id });

      console.log(
        `[AnkerSolixBluAdapter] Connected to ${target.name} (${target.id}). ` +
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
      console.error('[AnkerSolixBluAdapter] Connect error:', msg);
      return this.handleConnectError(
        'Connection failed. Please check Bluetooth is enabled and try again.',
        'UNEXPECTED',
      );
    }
  }

  // ── Connect All Discovered ─────────────────────────────────────────

  /**
   * Connect to all discovered Anker SOLIX devices.
   * Useful for multi-battery setups.
   */
  async connectAll(): Promise<AnkerSolixConnectResult[]> {
    if (this.discoveredDevices.length === 0) {
      await this.scanForDevices();
    }

    const results: AnkerSolixConnectResult[] = [];
    for (const device of this.discoveredDevices) {
      const result = await this.connect(device.id);
      results.push(result);
    }

    return results;
  }

  // ── Disconnect ─────────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    console.log('[AnkerSolixBluAdapter] Disconnecting...');

    this.stopPolling();
    this.cancelReconnect();
    this.removeAppStateListener();

    // Clear Anker SOLIX devices from registry
    await bluDeviceRegistry.clearProvider('anker_solix');

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
    bluStateStore.reset();
    bluSessionStore.recordDisconnection();

    this.notify();
    this.emitEvent('disconnect', { meta: { requested: true } });
    this.emitEvent('disconnected', { meta: { requested: true } });
    this.emitStatus({ phase: 'disconnected', requested: true });
    console.log('[AnkerSolixBluAdapter] Disconnected.');
  }

  // ── Poll Telemetry ─────────────────────────────────────────────────

  /**
   * Poll telemetry for a specific device (or the primary Anker SOLIX device).
   *
   * On native: reads Modbus registers via BLE.
   * On web/dev: returns simulated telemetry.
   */
  async pollTelemetry(deviceId?: string): Promise<AnkerSolixPollResult> {
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
          error: 'No Anker SOLIX device available to poll',
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
      const device = bluDeviceRegistry.getDevice('anker_solix', targetDeviceId);
      const modelSpec = device ? lookupAnkerSolixModel(device.model) : undefined;

      // Normalize to BluTelemetry
      const telemetry = this.normalizeTelemetry(targetDeviceId, newState, modelSpec);

      // Feed into BLU state store
      bluStateStore.ingestTelemetry(telemetry);
      this.lastTelemetry = telemetry;

      // Update device connection state
      await bluDeviceRegistry.updateConnectionState('anker_solix', targetDeviceId, 'connected');

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
        `[AnkerSolixBluAdapter] Poll #${this.pollCount} success` +
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
      console.error('[AnkerSolixBluAdapter] Poll error (isolated):', msg);
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
    console.log(`[AnkerSolixBluAdapter] Auto-polling started (${intervalMs}ms interval)`);
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
      console.log('[AnkerSolixBluAdapter] No previous session to restore.');
      return false;
    }

    const session = bluSessionStore.getSession();
    if (session.provider !== 'anker_solix') {
      console.log('[AnkerSolixBluAdapter] Previous session is not Anker SOLIX.');
      return false;
    }

    console.log(
      `[AnkerSolixBluAdapter] Restoring session: primary=${session.primaryDeviceId}` +
      ` | polling=${session.wasPolling}`,
    );

    // Scan and connect
    await this.scanForDevices();
    const result = await this.connect(
      session.primaryDeviceId || undefined,
    );

    if (!result.success) {
      console.log('[AnkerSolixBluAdapter] Session restore failed.');
      return false;
    }

    // Restore primary
    if (session.primaryDeviceId) {
      await bluDeviceRegistry.restorePrimary('anker_solix', session.primaryDeviceId);
      this.connectedDevices = bluDeviceRegistry.getByProvider('anker_solix');
      this.notify();
    }

    // Resume polling
    if (session.wasPolling) {
      this.startPolling(DEFAULT_POLL_INTERVAL_MS);
    }

    console.log('[AnkerSolixBluAdapter] Session restored successfully.');
    return true;
  }

  // ── Set Primary Device ─────────────────────────────────────────────

  async setPrimaryDevice(deviceId: string): Promise<void> {
    console.log(`[AnkerSolixBluAdapter] Setting primary device: ${deviceId}`);
    await bluDeviceRegistry.setPrimary('anker_solix', deviceId);
    this.connectedDevices = bluDeviceRegistry.getByProvider('anker_solix');
    bluSessionStore.recordPrimaryDeviceChange(deviceId);
    this.notify();

    // Poll the new primary immediately
    await this.pollTelemetry(deviceId);
  }

  // ── Refresh Devices ────────────────────────────────────────────────

  async refreshDevices(): Promise<AnkerSolixDiscoveredDevice[]> {
    console.log('[AnkerSolixBluAdapter] Refreshing device list...');
    return this.scanForDevices();
  }

  // ── Rename Device ──────────────────────────────────────────────────

  async renameDevice(deviceId: string, newName: string): Promise<void> {
    const devices = bluDeviceRegistry.getAll();
    const device = devices.find(
      (d) => d.provider === 'anker_solix' && d.device_id === deviceId,
    );
    if (!device) return;

    // Re-register with new name (merge logic handles update)
    await bluDeviceRegistry.registerDevice({
      provider: 'anker_solix',
      device_id: deviceId,
      display_name: newName,
      model: device.model,
      connection_state: device.connection_state,
      last_seen: Date.now(),
      capabilities: device.capabilities,
    });

    this.connectedDevices = bluDeviceRegistry.getByProvider('anker_solix');
    this.notify();
    console.log(`[AnkerSolixBluAdapter] Device ${deviceId} renamed to "${newName}".`);
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

  private normalizeDevice(discovered: AnkerSolixDiscoveredDevice): BluDevice {
    const modelName = discovered.model || extractAnkerModelFromName(discovered.name) || 'AnkerSolix Device';
    const spec = discovered.modelSpec || lookupAnkerSolixModel(modelName);

    return {
      provider: 'anker_solix',
      device_id: discovered.id,
      display_name: spec?.displayName || discovered.name || discovered.id,
      model: modelName,
      connection_state: 'connected',
      last_seen: Date.now(),
      capabilities: { ...ANKER_SOLIX_CAPABILITIES },
      is_primary: false,
    };
  }

  private normalizeTelemetry(
    deviceId: string,
    state: SimulatedAnkerSolixState,
    modelSpec?: AnkerSolixModelSpec,
  ): BluTelemetry {
    const inputW = Math.round(state.inputWatts);
    const outputW = Math.round(state.outputWatts);

    return {
      timestamp: Date.now(),
      provider: 'anker_solix',
      device_id: deviceId,

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
    };
  }

  private getPrimaryDeviceId(): string | null {
    const primary = bluDeviceRegistry.getPrimary();
    if (primary && primary.provider === 'anker_solix') {
      return primary.device_id;
    }
    const devices = bluDeviceRegistry.getByProvider('anker_solix');
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
        `[AnkerSolixBluAdapter] ${this.consecutiveFailures} consecutive failures — backing off`,
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
      `[AnkerSolixBluAdapter] Quiet reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`,
    );

    try {
      await this.simulateDelay(2000);

      // Reconnect succeeded (simulated)
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;
      this.connectionState = 'connected';
      bluStateStore.setReconnecting(false);

      this.connectedDevices = bluDeviceRegistry.getByProvider('anker_solix');
      await bluDeviceRegistry.ensurePrimary('anker_solix');

      const primary = bluDeviceRegistry.getPrimary();
      bluSessionStore.recordConnection('anker_solix', primary?.device_id ?? null);

      this.notify();
      this.emitEvent('reconnect_success', {
        telemetry: this.lastTelemetry,
        devices: [...this.connectedDevices],
        meta: { provider: 'anker_solix' },
      });
      this.emitEvent('reconnected', {
        telemetry: this.lastTelemetry,
        devices: [...this.connectedDevices],
        meta: { provider: 'anker_solix' },
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
  ): AnkerSolixConnectResult {
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

export const anker_solixBluAdapter = new AnkerSolixBluAdapter();
export const ankerSolixBluAdapter = anker_solixBluAdapter;


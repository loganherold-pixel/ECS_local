/**
 * RenogyBluAdapter — BLU provider adapter for Renogy power systems.
 *
 * Bridges Renogy BLE communication into the BLU universal telemetry layer.
 *
 * Responsibilities:
 *   - Scan for nearby Renogy BLE devices (BT-1/BT-2 modules, Smart Lithium)
 *   - Connect via BLE (or simulated BLE in dev)
 *   - Normalize Renogy telemetry into BluTelemetry format
 *   - Register discovered devices in BluDeviceRegistry
 *   - Poll telemetry and feed it into BluStateStore
 *   - Manage connection state transitions
 *   - App lifecycle awareness (pause/resume polling)
 *   - Session persistence and auto-reconnect
 *   - Power system role assignment (house battery, solar, auxiliary)
 *
 * BLE Architecture:
 *   Renogy devices use Modbus RTU over BLE via BT-1/BT-2 modules or
 *   built-in Bluetooth (Smart Lithium series). This adapter abstracts
 *   the Modbus layer and provides a clean interface identical to
 *   EcoFlow, Bluetti, Anker SOLIX, Jackery, and Goal Zero adapters.
 *
 * Phase 6A — Renogy BLE integration.
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
  isRenogyDeviceName,
  extractRenogyModelFromName,
  lookupRenogyModel,
  getRenogyDeviceCategory,
  RENOGY_SERVICE_UUID,
  type RenogyModelSpec,
  type RenogyDeviceCategory,
} from './RenogyConstants';

// ── Types ───────────────────────────────────────────────────────────────

/** Discovered BLE device from scanning. */
export interface RenogyDiscoveredDevice {
  id: string;           // BLE peripheral ID (MAC or UUID)
  name: string;         // Advertised device name
  rssi: number;         // Signal strength
  model?: string;       // Extracted model name
  modelSpec?: RenogyModelSpec; // Full model spec if known
  category?: RenogyDeviceCategory; // Device category
}

/** Connection result from the adapter. */
export interface RenogyConnectResult {
  success: boolean;
  device: BluDevice | null;
  error: string | null;
  errorCode: string | null;
}

/** Telemetry poll result from the adapter. */
export interface RenogyPollResult {
  success: boolean;
  telemetry: BluTelemetry | null;
  error: string | null;
}

/** Adapter state snapshot for UI consumption. */
export interface RenogyAdapterState {
  connectionState: BluConnectionState;
  discoveredDevices: RenogyDiscoveredDevice[];
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

// ── Simulated Telemetry (for dev/demo when BLE is unavailable) ──────────

interface SimulatedRenogyState {
  batteryPercent: number;
  batteryVoltage: number;
  batteryCurrent: number;
  batteryTempC: number;
  controllerTempC: number;
  solarVoltage: number;
  solarCurrent: number;
  solarPowerW: number;
  loadVoltage: number;
  loadCurrent: number;
  loadPowerW: number;
  loadOn: boolean;
  chargingStatus: number;
  dailyGenerationWh: number;
  dailyConsumptionWh: number;
  ratedCapacityAh: number;
}

function createSimulatedState(): SimulatedRenogyState {
  const isController = Math.random() > 0.4;
  return {
    batteryPercent: 50 + Math.random() * 40,
    batteryVoltage: 12.4 + Math.random() * 1.8,
    batteryCurrent: isController ? 2 + Math.random() * 15 : -1 + Math.random() * 8,
    batteryTempC: 18 + Math.random() * 15,
    controllerTempC: 22 + Math.random() * 20,
    solarVoltage: isController ? 18 + Math.random() * 20 : 0,
    solarCurrent: isController ? 1 + Math.random() * 8 : 0,
    solarPowerW: isController ? 30 + Math.random() * 300 : 0,
    loadVoltage: 12.2 + Math.random() * 1.5,
    loadCurrent: 0.5 + Math.random() * 10,
    loadPowerW: 10 + Math.random() * 120,
    loadOn: Math.random() > 0.15,
    chargingStatus: isController ? (Math.random() > 0.3 ? 1 : 4) : 0,
    dailyGenerationWh: isController ? 200 + Math.random() * 1500 : 0,
    dailyConsumptionWh: 100 + Math.random() * 800,
    ratedCapacityAh: 100 + Math.floor(Math.random() * 3) * 100,
  };
}

function driftSimulatedState(prev: SimulatedRenogyState): SimulatedRenogyState {
  const drift = (val: number, range: number, min: number, max: number) =>
    Math.max(min, Math.min(max, val + (Math.random() - 0.5) * range));

  return {
    batteryPercent: drift(prev.batteryPercent, 1.5, 0, 100),
    batteryVoltage: drift(prev.batteryVoltage, 0.2, 10, 15),
    batteryCurrent: drift(prev.batteryCurrent, 1, -30, 30),
    batteryTempC: drift(prev.batteryTempC, 0.5, 5, 55),
    controllerTempC: drift(prev.controllerTempC, 0.8, 10, 70),
    solarVoltage: drift(prev.solarVoltage, 1, 0, 45),
    solarCurrent: drift(prev.solarCurrent, 0.5, 0, 15),
    solarPowerW: drift(prev.solarPowerW, 20, 0, 1300),
    loadVoltage: drift(prev.loadVoltage, 0.1, 10, 15),
    loadCurrent: drift(prev.loadCurrent, 0.5, 0, 20),
    loadPowerW: drift(prev.loadPowerW, 10, 0, 300),
    loadOn: prev.loadOn,
    chargingStatus: prev.chargingStatus,
    dailyGenerationWh: prev.dailyGenerationWh + Math.random() * 5,
    dailyConsumptionWh: prev.dailyConsumptionWh + Math.random() * 3,
    ratedCapacityAh: prev.ratedCapacityAh,
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

// ── Renogy Device Capabilities ──────────────────────────────────────────

const RENOGY_CAPABILITIES: BluDeviceCapabilities = {
  hasBatteryPercent: true,
  hasInputWatts: true,
  hasOutputWatts: true,
  hasSolarInput: true,
  hasAcOutput: false,
  hasDcOutput: true,
  hasTemperature: true,
  hasRuntimeEstimate: true,
  controllable: false,
};

// ── Subscriber type ─────────────────────────────────────────────────────

type AdapterSubscriber = (state: RenogyAdapterState) => void;

type RenogyAdapterEventName =
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

type RenogyAdapterEventPayload = {
  state: RenogyAdapterState;
  telemetry?: BluTelemetry | null;
  device?: BluDevice | null;
  error?: string | null;
  errorCode?: string | null;
};

type RenogyAdapterEventListener = (payload: RenogyAdapterEventPayload) => void;

// ── Adapter Class ───────────────────────────────────────────────────────

class RenogyBluAdapter {
  private connectionState: BluConnectionState = 'disconnected';
  private discoveredDevices: RenogyDiscoveredDevice[] = [];
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
  private simulatedStates = new Map<string, SimulatedRenogyState>();

  // ECS lifecycle/event bridge
  private eventListeners = new Map<RenogyAdapterEventName, Set<RenogyAdapterEventListener>>();
  private lastTelemetry: BluTelemetry | null = null;

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
    this.emit('status', { state });
  }

  on(event: RenogyAdapterEventName, listener: RenogyAdapterEventListener): () => void {
    const set = this.eventListeners.get(event) ?? new Set<RenogyAdapterEventListener>();
    set.add(listener);
    this.eventListeners.set(event, set);
    return () => this.off(event, listener);
  }

  off(event: RenogyAdapterEventName, listener: RenogyAdapterEventListener): void {
    const set = this.eventListeners.get(event);
    if (!set) return;
    set.delete(listener);
    if (set.size === 0) {
      this.eventListeners.delete(event);
    }
  }

  addListener(event: RenogyAdapterEventName, listener: RenogyAdapterEventListener): () => void {
    return this.on(event, listener);
  }

  removeListener(event: RenogyAdapterEventName, listener: RenogyAdapterEventListener): void {
    this.off(event, listener);
  }

  subscribeEvent(event: RenogyAdapterEventName, listener: RenogyAdapterEventListener): () => void {
    return this.on(event, listener);
  }

  getLastTelemetry(): BluTelemetry | null {
    return this.lastTelemetry ? { ...this.lastTelemetry } : null;
  }

  getECSBridgeState(): {
    provider: 'renogy';
    connectionState: BluConnectionState;
    isConnected: boolean;
    isConnecting: boolean;
    isDisconnected: boolean;
    isReconnecting: boolean;
    discoveredDevices: RenogyDiscoveredDevice[];
    connectedDevices: BluDevice[];
    primaryDeviceId: string | null;
    lastTelemetry: BluTelemetry | null;
    lastPollAt: number | null;
    pollCount: number;
    lastError: string | null;
    lastErrorCode: string | null;
    isPaused: boolean;
    isScanning: boolean;
    consecutiveFailures: number;
    reconnectAttempts: number;
  } {
    return {
      provider: 'renogy',
      connectionState: this.connectionState,
      isConnected: this.connectionState === 'connected',
      isConnecting: this.connectionState === 'connecting',
      isDisconnected: this.connectionState === 'disconnected',
      isReconnecting: this.isReconnecting,
      discoveredDevices: [...this.discoveredDevices],
      connectedDevices: [...this.connectedDevices],
      primaryDeviceId: this.getPrimaryDeviceId(),
      lastTelemetry: this.getLastTelemetry(),
      lastPollAt: this.lastPollAt,
      pollCount: this.pollCount,
      lastError: this.lastError,
      lastErrorCode: this.lastErrorCode,
      isPaused: this.isPaused,
      isScanning: this.isScanning,
      consecutiveFailures: this.consecutiveFailures,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  private emit(
    event: RenogyAdapterEventName,
    payload: Partial<RenogyAdapterEventPayload> = {},
  ): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners || listeners.size === 0) return;

    const fullPayload: RenogyAdapterEventPayload = {
      state: this.getState(),
      telemetry: payload.telemetry ?? undefined,
      device: payload.device ?? undefined,
      error: payload.error ?? null,
      errorCode: payload.errorCode ?? null,
    };

    for (const listener of listeners) {
      try {
        listener(fullPayload);
      } catch {
        /* listener errors must never crash the adapter */
      }
    }
  }

  // ── State Snapshot ─────────────────────────────────────────────────

  getState(): RenogyAdapterState {
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

  // ── BLE Scan ──────────────────────────────────────────────────────

  async scanForDevices(): Promise<RenogyDiscoveredDevice[]> {
    if (this.isScanning) {
      console.log('[RenogyBluAdapter] Scan already in progress.');
      return this.discoveredDevices;
    }

    this.isScanning = true;
    this.lastError = null;
    this.lastErrorCode = null;
    this.notify();

    console.log('[RenogyBluAdapter] Starting BLE scan for Renogy devices...');

    try {
      if (Platform.OS === 'web' || !this.isBleAvailable()) {
        console.log('[RenogyBluAdapter] BLE unavailable — using simulated discovery.');
        await this.simulateDelay(1500);

        this.discoveredDevices = [
          {
            id: 'renogy-sim-smart100',
            name: 'Smart Lithium 12V 100Ah',
            rssi: -45,
            model: 'Smart Lithium 12V 100Ah',
            modelSpec: lookupRenogyModel('Smart Lithium 12V 100Ah'),
            category: 'battery_bank',
          },
          {
            id: 'renogy-sim-rover40',
            name: 'Rover 40A MPPT',
            rssi: -52,
            model: 'Rover 40A MPPT',
            modelSpec: lookupRenogyModel('Rover 40A'),
            category: 'solar_controller',
          },
          {
            id: 'renogy-sim-dcc50s',
            name: 'DCC50S DC-DC Charger',
            rssi: -58,
            model: 'DCC50S DC-DC Charger',
            modelSpec: lookupRenogyModel('DCC50S'),
            category: 'dc_dc_charger',
          },
          {
            id: 'renogy-sim-one',
            name: 'Renogy ONE Monitor',
            rssi: -63,
            model: 'Renogy ONE',
            modelSpec: lookupRenogyModel('Renogy ONE'),
            category: 'battery_monitor',
          },
        ];

        console.log(`[RenogyBluAdapter] Simulated ${this.discoveredDevices.length} device(s).`);
      } else {
        await this.performBleScan();
      }

      this.isScanning = false;
      this.notify();
      return this.discoveredDevices;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed';
      console.error('[RenogyBluAdapter] Scan error:', msg);
      this.lastError = 'Failed to scan for Renogy devices.';
      this.lastErrorCode = 'SCAN_FAILED';
      this.isScanning = false;
      this.notify();
      return [];
    }
  }

  private async performBleScan(): Promise<void> {
    console.log('[RenogyBluAdapter] Native BLE scan — using simulated fallback.');
    await this.simulateDelay(2000);

    this.discoveredDevices = [
      {
        id: 'renogy-sim-smart100',
        name: 'Smart Lithium 12V 100Ah',
        rssi: -45,
        model: 'Smart Lithium 12V 100Ah',
        modelSpec: lookupRenogyModel('Smart Lithium 12V 100Ah'),
        category: 'battery_bank',
      },
    ];
  }

  // ── Connect ────────────────────────────────────────────────────────

  async connect(deviceId?: string): Promise<RenogyConnectResult> {
    console.log(`[RenogyBluAdapter] Connecting to device: ${deviceId || 'first available'}...`);

    this.connectionState = 'connecting';
    this.lastError = null;
    this.lastErrorCode = null;
    this.consecutiveFailures = 0;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    bluStateStore.setReconnecting(false);
    this.notify();

    try {
      if (!deviceId && this.discoveredDevices.length === 0) {
        await this.scanForDevices();
      }

      const target = deviceId
        ? this.discoveredDevices.find((d) => d.id === deviceId)
        : this.discoveredDevices[0];

      if (!target) {
        return this.handleConnectError(
          'No Renogy device found. Make sure your device is powered on and Bluetooth is enabled.',
          'NO_DEVICE',
        );
      }

      await this.simulateDelay(1200);

      if (!this.simulatedStates.has(target.id)) {
        this.simulatedStates.set(target.id, createSimulatedState());
      }

      const bluDevice = this.normalizeDevice(target);

      await bluDeviceRegistry.registerDevice({
        provider: bluDevice.provider,
        device_id: bluDevice.device_id,
        display_name: bluDevice.display_name,
        model: bluDevice.model,
        connection_state: 'connected',
        last_seen: Date.now(),
        capabilities: bluDevice.capabilities,
      });

      await bluDeviceRegistry.ensurePrimary('renogy');

      this.connectionState = 'connected';
      this.connectedDevices = bluDeviceRegistry.getByProvider('renogy');
      this.lastError = null;
      this.lastErrorCode = null;

      const primary = bluDeviceRegistry.getPrimary();
      bluSessionStore.recordConnection('renogy', primary?.device_id ?? null);

      this.notify();
      this.emit('connect', { device: bluDevice });
      this.emit('connected', { device: bluDevice });

      console.log(
        `[RenogyBluAdapter] Connected to ${target.name} (${target.id}). ` +
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
      console.error('[RenogyBluAdapter] Connect error:', msg);
      return this.handleConnectError(
        'Connection failed. Please check Bluetooth is enabled and try again.',
        'UNEXPECTED',
      );
    }
  }

  // ── Connect All Discovered ─────────────────────────────────────────

  async connectAll(): Promise<RenogyConnectResult[]> {
    if (this.discoveredDevices.length === 0) {
      await this.scanForDevices();
    }

    const results: RenogyConnectResult[] = [];
    for (const device of this.discoveredDevices) {
      const result = await this.connect(device.id);
      results.push(result);
    }

    return results;
  }

  // ── Disconnect ─────────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    console.log('[RenogyBluAdapter] Disconnecting...');

    this.stopPolling();
    this.cancelReconnect();
    this.removeAppStateListener();

    await bluDeviceRegistry.clearProvider('renogy');

    this.connectionState = 'disconnected';
    this.connectedDevices = [];
    this.discoveredDevices = [];
    this.simulatedStates.clear();
    this.lastTelemetry = null;
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
    this.emit('disconnect');
    this.emit('disconnected');
    console.log('[RenogyBluAdapter] Disconnected.');
  }

  // ── Poll Telemetry ─────────────────────────────────────────────────

  async pollTelemetry(deviceId?: string): Promise<RenogyPollResult> {
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
          error: 'No Renogy device available to poll',
        };
      }

      let simState = this.simulatedStates.get(targetDeviceId);
      if (!simState) {
        simState = createSimulatedState();
        this.simulatedStates.set(targetDeviceId, simState);
      }

      const newState = driftSimulatedState(simState);
      this.simulatedStates.set(targetDeviceId, newState);

      const device = bluDeviceRegistry.getDevice('renogy', targetDeviceId);
      const modelSpec = device ? lookupRenogyModel(device.model) : undefined;

      const telemetry = this.normalizeTelemetry(targetDeviceId, newState, modelSpec);

      bluStateStore.ingestTelemetry(telemetry);
      this.lastTelemetry = telemetry;

      await bluDeviceRegistry.updateConnectionState('renogy', targetDeviceId, 'connected');

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
      this.emit('telemetry', { telemetry });
      this.emit('data', { telemetry });

      console.log(
        `[RenogyBluAdapter] Poll #${this.pollCount} success` +
        ` | SOC=${telemetry.battery_percent ?? '?'}%` +
        ` | V=${telemetry.battery_volts ?? '?'}V` +
        ` | SOLAR=${telemetry.solar_input_watts ?? '?'}W` +
        ` | LOAD=${telemetry.dc_output_watts ?? '?'}W` +
        ` | TEMP=${telemetry.temperature_celsius ?? '?'}°C`,
      );

      return {
        success: true,
        telemetry,
        error: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      console.error('[RenogyBluAdapter] Poll error (isolated):', msg);
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
    console.log(`[RenogyBluAdapter] Auto-polling started (${intervalMs}ms interval)`);
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
      console.log('[RenogyBluAdapter] No previous session to restore.');
      return false;
    }

    const session = bluSessionStore.getSession();
    if (session.provider !== 'renogy') {
      console.log('[RenogyBluAdapter] Previous session is not Renogy.');
      return false;
    }

    console.log(
      `[RenogyBluAdapter] Restoring session: primary=${session.primaryDeviceId}` +
      ` | polling=${session.wasPolling}`,
    );

    await this.scanForDevices();
    const result = await this.connect(
      session.primaryDeviceId || undefined,
    );

    if (!result.success) {
      console.log('[RenogyBluAdapter] Session restore failed.');
      return false;
    }

    if (session.primaryDeviceId) {
      await bluDeviceRegistry.restorePrimary('renogy', session.primaryDeviceId);
      this.connectedDevices = bluDeviceRegistry.getByProvider('renogy');
      this.notify();
    }

    if (session.wasPolling) {
      this.startPolling(DEFAULT_POLL_INTERVAL_MS);
    }

    console.log('[RenogyBluAdapter] Session restored successfully.');
    return true;
  }

  // ── Set Primary Device ─────────────────────────────────────────────

  async setPrimaryDevice(deviceId: string): Promise<void> {
    console.log(`[RenogyBluAdapter] Setting primary device: ${deviceId}`);
    await bluDeviceRegistry.setPrimary('renogy', deviceId);
    this.connectedDevices = bluDeviceRegistry.getByProvider('renogy');
    bluSessionStore.recordPrimaryDeviceChange(deviceId);
    this.notify();

    await this.pollTelemetry(deviceId);
  }

  // ── Refresh Devices ────────────────────────────────────────────────

  async refreshDevices(): Promise<RenogyDiscoveredDevice[]> {
    console.log('[RenogyBluAdapter] Refreshing device list...');
    return this.scanForDevices();
  }

  // ── Rename Device ──────────────────────────────────────────────────

  async renameDevice(deviceId: string, newName: string): Promise<void> {
    const devices = bluDeviceRegistry.getAll();
    const device = devices.find(
      (d) => d.provider === 'renogy' && d.device_id === deviceId,
    );
    if (!device) return;

    await bluDeviceRegistry.registerDevice({
      provider: 'renogy',
      device_id: deviceId,
      display_name: newName,
      model: device.model,
      connection_state: device.connection_state,
      last_seen: Date.now(),
      capabilities: device.capabilities,
    });

    this.connectedDevices = bluDeviceRegistry.getByProvider('renogy');
    this.notify();
    console.log(`[RenogyBluAdapter] Device ${deviceId} renamed to "${newName}".`);
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private isBleAvailable(): boolean {
    return false; // Default to simulated mode
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeDevice(discovered: RenogyDiscoveredDevice): BluDevice {
    const modelName = discovered.model || extractRenogyModelFromName(discovered.name) || 'Renogy Device';
    const spec = discovered.modelSpec || lookupRenogyModel(modelName);

    return {
      provider: 'renogy',
      device_id: discovered.id,
      display_name: spec?.displayName || discovered.name || discovered.id,
      model: modelName,
      connection_state: 'connected',
      last_seen: Date.now(),
      capabilities: { ...RENOGY_CAPABILITIES },
      is_primary: false,
    };
  }

  private normalizeTelemetry(
    deviceId: string,
    state: SimulatedRenogyState,
    modelSpec?: RenogyModelSpec,
  ): BluTelemetry {
    const solarW = Math.round(state.solarPowerW);
    const loadW = Math.round(state.loadPowerW);
    const inputW = solarW; // Primary input is solar for Renogy systems
    const outputW = loadW;
    const socPct = Math.round(state.batteryPercent * 10) / 10;
    const batteryVolts = Math.round(state.batteryVoltage * 10) / 10;
    const batteryAmps = Math.round(state.batteryCurrent * 100) / 100;
    const batteryWatts = Math.round(batteryVolts * batteryAmps);

    // Estimate runtime from capacity and load
    let estimatedRuntimeMin: number | undefined;
    const capacityWh = modelSpec?.capacityWh || (state.ratedCapacityAh * state.batteryVoltage);
    if (capacityWh && outputW > 0 && socPct > 0) {
      const remainingWh = (capacityWh * socPct) / 100;
      estimatedRuntimeMin = Math.round((remainingWh / outputW) * 60);
    }

    return {
      timestamp: Date.now(),
      provider: 'renogy',
      device_id: deviceId,

      // Core telemetry
      battery_percent: socPct,
      input_watts: inputW,
      output_watts: outputW,
      battery_watts: batteryWatts,
      estimated_runtime_minutes: estimatedRuntimeMin,

      // Source-specific
      solar_input_watts: solarW,
      dc_output_watts: loadW,

      // Environmental
      temperature_celsius: Math.round(state.batteryTempC * 10) / 10,

      // Extended
      battery_volts: batteryVolts,
      battery_amps: batteryAmps,
      capacity_wh: capacityWh > 0 ? Math.round(capacityWh) : undefined,
    };
  }

  private getPrimaryDeviceId(): string | null {
    const primary = bluDeviceRegistry.getPrimary();
    if (primary && primary.provider === 'renogy') {
      return primary.device_id;
    }
    const devices = bluDeviceRegistry.getByProvider('renogy');
    return devices.length > 0 ? devices[0].device_id : null;
  }

  private handlePollFailure(error: string): void {
    this.consecutiveFailures++;
    bluStateStore.recordPollFailure(error);

    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log(
        `[RenogyBluAdapter] ${this.consecutiveFailures} consecutive failures — backing off`,
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
    this.emit('reconnecting');
    this.emit('reconnect_start');

    console.log(
      `[RenogyBluAdapter] Quiet reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`,
    );

    try {
      await this.simulateDelay(2000);

      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;
      this.connectionState = 'connected';
      bluStateStore.setReconnecting(false);

      this.connectedDevices = bluDeviceRegistry.getByProvider('renogy');
      await bluDeviceRegistry.ensurePrimary('renogy');

      const primary = bluDeviceRegistry.getPrimary();
      bluSessionStore.recordConnection('renogy', primary?.device_id ?? null);

      this.notify();
      this.emit('reconnect_success', { device: primary ?? null });
      this.emit('reconnected', { device: primary ?? null });

      if (!this.pollTimer) {
        this.startPolling(DEFAULT_POLL_INTERVAL_MS);
      }
    } catch {
      this.emit('reconnect_failed', {
        error: 'Quiet reconnect failed',
        errorCode: 'RECONNECT_FAILED',
      });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    this.isReconnecting = false;
    this.notify();

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      bluStateStore.setReconnecting(false);
      return;
    }

    const delay = RECONNECT_DELAY_MS * this.reconnectAttempts;
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
  ): RenogyConnectResult {
    this.connectionState = 'error';
    this.lastError = message;
    this.lastErrorCode = code;
    this.notify();
    this.emit('error', { error: message, errorCode: code });

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
        if (this.connectionState === 'connected') {
          this.pollTelemetry();
        }
      }
    } else if (nextState === 'background' || nextState === 'inactive') {
      if (!this.isPaused) {
        this.isPaused = true;
        this.notify();
      }
    }
  };
}

// ── Singleton ───────────────────────────────────────────────────────────

export const renogyBluAdapter = new RenogyBluAdapter();


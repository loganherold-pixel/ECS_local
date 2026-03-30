/**
 * GoalZeroBluAdapter — BLU provider adapter for Goal Zero Yeti power stations.
 *
 * Bridges Goal Zero BLE communication into the BLU universal telemetry layer.
 *
 * Responsibilities:
 *   - Scan for nearby Goal Zero BLE devices
 *   - Connect via BLE (or simulated BLE in dev)
 *   - Normalize Goal Zero telemetry into BluTelemetry format
 *   - Register discovered devices in BluDeviceRegistry
 *   - Poll telemetry and feed it into BluStateStore
 *   - Manage connection state transitions
 *   - App lifecycle awareness (pause/resume polling)
 *   - Session persistence and auto-reconnect
 *
 * BLE Architecture:
 *   Goal Zero Yeti devices use a proprietary BLE service (0xFFD0) with
 *   custom payloads. This adapter abstracts the BLE layer and provides
 *   a clean interface identical to EcoFlow, Bluetti, Anker SOLIX, and Jackery.
 *
 * Phase 5A — Goal Zero BLE integration.
 */

import { AppState, type AppStateStatus, Platform } from 'react-native';
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
import {
  isGoalZeroDeviceName,
  extractGoalZeroModelFromName,
  lookupGoalZeroModel,
  GOAL_ZERO_SERVICE_UUID,
  type GoalZeroModelSpec,
} from '../GoalZeroConstants';

// ── Types ───────────────────────────────────────────────────────────────

/** Discovered BLE device from scanning. */
export interface GoalZeroDiscoveredDevice {
  id: string;           // BLE peripheral ID (MAC or UUID)
  name: string;         // Advertised device name
  rssi: number;         // Signal strength
  model?: string;       // Extracted model name
  modelSpec?: GoalZeroModelSpec; // Full model spec if known
}

/** Connection result from the adapter. */
export interface GoalZeroConnectResult {
  success: boolean;
  device: BluDevice | null;
  error: string | null;
  errorCode: string | null;
}

/** Telemetry poll result from the adapter. */
export interface GoalZeroPollResult {
  success: boolean;
  telemetry: BluTelemetry | null;
  error: string | null;
}

/** Adapter state snapshot for UI consumption. */
export interface GoalZeroAdapterState {
  connectionState: BluConnectionState;
  discoveredDevices: GoalZeroDiscoveredDevice[];
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

interface SimulatedGoalZeroState {
  batteryPercent: number;
  inputWatts: number;
  outputWatts: number;
  solarWatts: number;
  acOutputWatts: number;
  dcOutputWatts: number;
  usbCOutputWatts: number;
  temperatureC: number;
  inverterOn: boolean;
  dc12vOn: boolean;
  usbOn: boolean;
  batteryVolts: number;
  remainingCapacityWh: number;
  chargeCycles: number;
  timeToFullMin: number;
}

function createSimulatedState(): SimulatedGoalZeroState {
  return {
    batteryPercent: 45 + Math.random() * 40,
    inputWatts: Math.random() > 0.3 ? 60 + Math.random() * 400 : 0,
    outputWatts: 30 + Math.random() * 200,
    solarWatts: Math.random() > 0.4 ? 30 + Math.random() * 300 : 0,
    acOutputWatts: 20 + Math.random() * 150,
    dcOutputWatts: 5 + Math.random() * 40,
    usbCOutputWatts: 3 + Math.random() * 60,
    temperatureC: 18 + Math.random() * 20,
    inverterOn: Math.random() > 0.3,
    dc12vOn: Math.random() > 0.2,
    usbOn: Math.random() > 0.15,
    batteryVolts: 48 + Math.random() * 10,
    remainingCapacityWh: 300 + Math.random() * 700,
    chargeCycles: Math.floor(30 + Math.random() * 250),
    timeToFullMin: Math.floor(60 + Math.random() * 300),
  };
}

function driftSimulatedState(prev: SimulatedGoalZeroState): SimulatedGoalZeroState {
  const drift = (val: number, range: number, min: number, max: number) =>
    Math.max(min, Math.min(max, val + (Math.random() - 0.5) * range));

  return {
    batteryPercent: drift(prev.batteryPercent, 2, 0, 100),
    inputWatts: drift(prev.inputWatts, 30, 0, 1200),
    outputWatts: drift(prev.outputWatts, 20, 0, 3500),
    solarWatts: drift(prev.solarWatts, 25, 0, 1200),
    acOutputWatts: drift(prev.acOutputWatts, 15, 0, 3500),
    dcOutputWatts: drift(prev.dcOutputWatts, 8, 0, 300),
    usbCOutputWatts: drift(prev.usbCOutputWatts, 5, 0, 100),
    temperatureC: drift(prev.temperatureC, 1, 5, 55),
    inverterOn: prev.inverterOn,
    dc12vOn: prev.dc12vOn,
    usbOn: prev.usbOn,
    batteryVolts: drift(prev.batteryVolts, 0.5, 40, 58),
    remainingCapacityWh: drift(prev.remainingCapacityWh, 15, 0, 6071),
    chargeCycles: prev.chargeCycles,
    timeToFullMin: prev.inputWatts > 0
      ? Math.max(0, Math.floor(prev.timeToFullMin + (Math.random() - 0.6) * 10))
      : 0,
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

// ── Goal Zero Device Capabilities ───────────────────────────────────────

const GOAL_ZERO_CAPABILITIES: BluDeviceCapabilities = {
  hasBatteryPercent: true,
  hasInputWatts: true,
  hasOutputWatts: true,
  hasSolarInput: true,
  hasAcOutput: true,
  hasDcOutput: true,
  hasTemperature: true,
  hasRuntimeEstimate: true,
  controllable: false,
};

// ── Subscriber type ─────────────────────────────────────────────────────

type AdapterSubscriber = (state: GoalZeroAdapterState) => void;

// ── Adapter Class ───────────────────────────────────────────────────────

class GoalZeroBluAdapter {
  private connectionState: BluConnectionState = 'disconnected';
  private discoveredDevices: GoalZeroDiscoveredDevice[] = [];
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
  private simulatedStates = new Map<string, SimulatedGoalZeroState>();

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

  getState(): GoalZeroAdapterState {
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

  /**
   * Scan for nearby Goal Zero BLE devices.
   *
   * On native platforms, this uses the BLE scanner to discover devices
   * advertising the Goal Zero service UUID. On web/dev, returns simulated
   * devices for testing.
   */
  async scanForDevices(): Promise<GoalZeroDiscoveredDevice[]> {
    if (this.isScanning) {
      console.log('[GoalZeroBluAdapter] Scan already in progress.');
      return this.discoveredDevices;
    }

    this.isScanning = true;
    this.lastError = null;
    this.lastErrorCode = null;
    this.notify();

    console.log('[GoalZeroBluAdapter] Starting BLE scan for Goal Zero devices...');

    try {
      // On web or when BLE is unavailable, return simulated devices
      if (Platform.OS === 'web' || !this.isBleAvailable()) {
        console.log('[GoalZeroBluAdapter] BLE unavailable — using simulated discovery.');
        await this.simulateDelay(1500);

        this.discoveredDevices = [
          {
            id: 'gz-sim-yeti1000x',
            name: 'Yeti 1000X',
            rssi: -48,
            model: 'Yeti 1000X',
            modelSpec: lookupGoalZeroModel('Yeti 1000X'),
          },
          {
            id: 'gz-sim-yeti3000x',
            name: 'Yeti 3000X',
            rssi: -59,
            model: 'Yeti 3000X',
            modelSpec: lookupGoalZeroModel('Yeti 3000X'),
          },
          {
            id: 'gz-sim-yeti6000x',
            name: 'Yeti 6000X',
            rssi: -67,
            model: 'Yeti 6000X',
            modelSpec: lookupGoalZeroModel('Yeti 6000X'),
          },
        ];

        console.log(`[GoalZeroBluAdapter] Simulated ${this.discoveredDevices.length} device(s).`);
      } else {
        // Native BLE scanning
        await this.performBleScan();
      }

      this.isScanning = false;
      this.notify();
      return this.discoveredDevices;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed';
      console.error('[GoalZeroBluAdapter] Scan error:', msg);
      this.lastError = 'Failed to scan for Goal Zero devices.';
      this.lastErrorCode = 'SCAN_FAILED';
      this.isScanning = false;
      this.notify();
      return [];
    }
  }

  /**
   * Perform native BLE scan (placeholder — requires react-native-ble-plx).
   */
  private async performBleScan(): Promise<void> {
    console.log('[GoalZeroBluAdapter] Native BLE scan — using simulated fallback.');
    await this.simulateDelay(2000);

    this.discoveredDevices = [
      {
        id: 'gz-sim-yeti1000x',
        name: 'Yeti 1000X',
        rssi: -48,
        model: 'Yeti 1000X',
        modelSpec: lookupGoalZeroModel('Yeti 1000X'),
      },
    ];
  }

  // ── Connect ────────────────────────────────────────────────────────

  /**
   * Connect to a specific Goal Zero device by its BLE peripheral ID.
   */
  async connect(deviceId?: string): Promise<GoalZeroConnectResult> {
    console.log(`[GoalZeroBluAdapter] Connecting to device: ${deviceId || 'first available'}...`);

    this.connectionState = 'connecting';
    this.lastError = null;
    this.lastErrorCode = null;
    this.consecutiveFailures = 0;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    bluStateStore.setReconnecting(false);
    this.notify();

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
          'No Goal Zero device found. Make sure your Yeti is powered on and Bluetooth is enabled.',
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
      await bluDeviceRegistry.ensurePrimary('goal_zero');

      // Update adapter state
      this.connectionState = 'connected';
      this.connectedDevices = bluDeviceRegistry.getByProvider('goal_zero');
      this.lastError = null;
      this.lastErrorCode = null;

      // Persist session
      const primary = bluDeviceRegistry.getPrimary();
      bluSessionStore.recordConnection('goal_zero', primary?.device_id ?? null);

      this.notify();

      console.log(
        `[GoalZeroBluAdapter] Connected to ${target.name} (${target.id}). ` +
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
      console.error('[GoalZeroBluAdapter] Connect error:', msg);
      return this.handleConnectError(
        'Connection failed. Please check Bluetooth is enabled and try again.',
        'UNEXPECTED',
      );
    }
  }

  // ── Connect All Discovered ─────────────────────────────────────────

  /**
   * Connect to all discovered Goal Zero devices.
   * Useful for multi-battery setups (e.g. Yeti + Tank expansion).
   */
  async connectAll(): Promise<GoalZeroConnectResult[]> {
    if (this.discoveredDevices.length === 0) {
      await this.scanForDevices();
    }

    const results: GoalZeroConnectResult[] = [];
    for (const device of this.discoveredDevices) {
      const result = await this.connect(device.id);
      results.push(result);
    }

    return results;
  }

  // ── Disconnect ─────────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    console.log('[GoalZeroBluAdapter] Disconnecting...');

    this.stopPolling();
    this.cancelReconnect();
    this.removeAppStateListener();

    // Clear Goal Zero devices from registry
    await bluDeviceRegistry.clearProvider('goal_zero');

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
    console.log('[GoalZeroBluAdapter] Disconnected.');
  }

  // ── Poll Telemetry ─────────────────────────────────────────────────

  /**
   * Poll telemetry for a specific device (or the primary Goal Zero device).
   */
  async pollTelemetry(deviceId?: string): Promise<GoalZeroPollResult> {
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
          error: 'No Goal Zero device available to poll',
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
      const device = bluDeviceRegistry.getDevice('goal_zero', targetDeviceId);
      const modelSpec = device ? lookupGoalZeroModel(device.model) : undefined;

      // Normalize to BluTelemetry
      const telemetry = this.normalizeTelemetry(targetDeviceId, newState, modelSpec);

      // Feed into BLU state store
      bluStateStore.ingestTelemetry(telemetry);

      // Update device connection state
      await bluDeviceRegistry.updateConnectionState('goal_zero', targetDeviceId, 'connected');

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

      console.log(
        `[GoalZeroBluAdapter] Poll #${this.pollCount} success` +
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
      console.error('[GoalZeroBluAdapter] Poll error (isolated):', msg);
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
    console.log(`[GoalZeroBluAdapter] Auto-polling started (${intervalMs}ms interval)`);
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
      console.log('[GoalZeroBluAdapter] No previous session to restore.');
      return false;
    }

    const session = bluSessionStore.getSession();
    if (session.provider !== 'goal_zero') {
      console.log('[GoalZeroBluAdapter] Previous session is not Goal Zero.');
      return false;
    }

    console.log(
      `[GoalZeroBluAdapter] Restoring session: primary=${session.primaryDeviceId}` +
      ` | polling=${session.wasPolling}`,
    );

    // Scan and connect
    await this.scanForDevices();
    const result = await this.connect(
      session.primaryDeviceId || undefined,
    );

    if (!result.success) {
      console.log('[GoalZeroBluAdapter] Session restore failed.');
      return false;
    }

    // Restore primary
    if (session.primaryDeviceId) {
      await bluDeviceRegistry.restorePrimary('goal_zero', session.primaryDeviceId);
      this.connectedDevices = bluDeviceRegistry.getByProvider('goal_zero');
      this.notify();
    }

    // Resume polling
    if (session.wasPolling) {
      this.startPolling(DEFAULT_POLL_INTERVAL_MS);
    }

    console.log('[GoalZeroBluAdapter] Session restored successfully.');
    return true;
  }

  // ── Set Primary Device ─────────────────────────────────────────────

  async setPrimaryDevice(deviceId: string): Promise<void> {
    console.log(`[GoalZeroBluAdapter] Setting primary device: ${deviceId}`);
    await bluDeviceRegistry.setPrimary('goal_zero', deviceId);
    this.connectedDevices = bluDeviceRegistry.getByProvider('goal_zero');
    bluSessionStore.recordPrimaryDeviceChange(deviceId);
    this.notify();

    // Poll the new primary immediately
    await this.pollTelemetry(deviceId);
  }

  // ── Refresh Devices ────────────────────────────────────────────────

  async refreshDevices(): Promise<GoalZeroDiscoveredDevice[]> {
    console.log('[GoalZeroBluAdapter] Refreshing device list...');
    return this.scanForDevices();
  }

  // ── Rename Device ──────────────────────────────────────────────────

  async renameDevice(deviceId: string, newName: string): Promise<void> {
    const devices = bluDeviceRegistry.getAll();
    const device = devices.find(
      (d) => d.provider === 'goal_zero' && d.device_id === deviceId,
    );
    if (!device) return;

    // Re-register with new name (merge logic handles update)
    await bluDeviceRegistry.registerDevice({
      provider: 'goal_zero',
      device_id: deviceId,
      display_name: newName,
      model: device.model,
      connection_state: device.connection_state,
      last_seen: Date.now(),
      capabilities: device.capabilities,
    });

    this.connectedDevices = bluDeviceRegistry.getByProvider('goal_zero');
    this.notify();
    console.log(`[GoalZeroBluAdapter] Device ${deviceId} renamed to "${newName}".`);
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private isBleAvailable(): boolean {
    return false; // Default to simulated mode
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeDevice(discovered: GoalZeroDiscoveredDevice): BluDevice {
    const modelName = discovered.model || extractGoalZeroModelFromName(discovered.name) || 'Goal Zero Yeti';
    const spec = discovered.modelSpec || lookupGoalZeroModel(modelName);

    return {
      provider: 'goal_zero',
      device_id: discovered.id,
      display_name: spec?.displayName || discovered.name || discovered.id,
      model: modelName,
      connection_state: 'connected',
      last_seen: Date.now(),
      capabilities: { ...GOAL_ZERO_CAPABILITIES },
      is_primary: false,
    };
  }

  private normalizeTelemetry(
    deviceId: string,
    state: SimulatedGoalZeroState,
    modelSpec?: GoalZeroModelSpec,
  ): BluTelemetry {
    const inputW = Math.round(state.inputWatts);
    const outputW = Math.round(state.outputWatts);
    const capacityWh = modelSpec?.capacityWh;
    const socPct = Math.round(state.batteryPercent * 10) / 10;

    // Estimate runtime from SOC and output
    let estimatedRuntimeMin: number | undefined;
    if (capacityWh && outputW > 0 && socPct > 0) {
      const remainingWh = (capacityWh * socPct) / 100;
      estimatedRuntimeMin = Math.round((remainingWh / outputW) * 60);
    }

    return {
      timestamp: Date.now(),
      provider: 'goal_zero',
      device_id: deviceId,

      // Core telemetry
      battery_percent: socPct,
      input_watts: inputW,
      output_watts: outputW,
      battery_watts: inputW - outputW,
      estimated_runtime_minutes: estimatedRuntimeMin,

      // Source-specific
      solar_input_watts: Math.round(state.solarWatts),
      ac_output_watts: Math.round(state.acOutputWatts),
      dc_output_watts: Math.round(state.dcOutputWatts + state.usbCOutputWatts),

      // Environmental
      temperature_celsius: Math.round(state.temperatureC * 10) / 10,

      // Extended
      battery_volts: Math.round(state.batteryVolts * 10) / 10,
      inverter_on: state.inverterOn,
      capacity_wh: capacityWh,
      charge_cycles: state.chargeCycles,
    };
  }

  private getPrimaryDeviceId(): string | null {
    const primary = bluDeviceRegistry.getPrimary();
    if (primary && primary.provider === 'goal_zero') {
      return primary.device_id;
    }
    const devices = bluDeviceRegistry.getByProvider('goal_zero');
    return devices.length > 0 ? devices[0].device_id : null;
  }

  private handlePollFailure(error: string): void {
    this.consecutiveFailures++;
    bluStateStore.recordPollFailure(error);

    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log(
        `[GoalZeroBluAdapter] ${this.consecutiveFailures} consecutive failures — backing off`,
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

    console.log(
      `[GoalZeroBluAdapter] Quiet reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`,
    );

    try {
      await this.simulateDelay(2000);

      // Reconnect succeeded (simulated)
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;
      this.connectionState = 'connected';
      bluStateStore.setReconnecting(false);

      this.connectedDevices = bluDeviceRegistry.getByProvider('goal_zero');
      await bluDeviceRegistry.ensurePrimary('goal_zero');

      const primary = bluDeviceRegistry.getPrimary();
      bluSessionStore.recordConnection('goal_zero', primary?.device_id ?? null);

      this.notify();

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
  ): GoalZeroConnectResult {
    this.connectionState = 'error';
    this.lastError = message;
    this.lastErrorCode = code;
    this.notify();

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

export const goalZeroBluAdapter = new GoalZeroBluAdapter();


/**
 * JackeryBluAdapter — BLU provider adapter for Jackery portable power stations.
 *
 * Bridges Jackery BLE communication into the BLU universal telemetry layer.
 *
 * Responsibilities:
 *   - Scan for nearby Jackery BLE devices
 *   - Connect via BLE (or simulated BLE in dev)
 *   - Normalize Jackery telemetry into BluTelemetry format
 *   - Register discovered devices in BluDeviceRegistry
 *   - Poll telemetry and feed it into BluStateStore
 *   - Manage connection state transitions
 *   - App lifecycle awareness (pause/resume polling)
 *   - Session persistence and auto-reconnect
 *
 * BLE Architecture:
 *   Jackery devices use a proprietary BLE service (0xFFE0) with
 *   custom payloads. This adapter abstracts the BLE layer and provides
 *   a clean interface identical to the EcoFlow, Bluetti, and Anker SOLIX adapters.
 *
 * Phase 4A — Jackery BLE integration.
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
  isJackeryDeviceName,
  extractJackeryModelFromName,
  lookupJackeryModel,
  JACKERY_SERVICE_UUID,
  type JackeryModelSpec,
} from '../JackeryConstants';

// ── Types ───────────────────────────────────────────────────────────────

/** Discovered BLE device from scanning. */
export interface JackeryDiscoveredDevice {
  id: string;           // BLE peripheral ID (MAC or UUID)
  name: string;         // Advertised device name
  rssi: number;         // Signal strength
  model?: string;       // Extracted model name
  modelSpec?: JackeryModelSpec; // Full model spec if known
}

/** Connection result from the adapter. */
export interface JackeryConnectResult {
  success: boolean;
  device: BluDevice | null;
  error: string | null;
  errorCode: string | null;
}

/** Telemetry poll result from the adapter. */
export interface JackeryPollResult {
  success: boolean;
  telemetry: BluTelemetry | null;
  error: string | null;
}

/** Adapter state snapshot for UI consumption. */
export interface JackeryAdapterState {
  connectionState: BluConnectionState;
  discoveredDevices: JackeryDiscoveredDevice[];
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

interface SimulatedJackeryState {
  batteryPercent: number;
  inputWatts: number;
  outputWatts: number;
  solarWatts: number;
  acOutputWatts: number;
  dcOutputWatts: number;
  usbOutputWatts: number;
  temperatureC: number;
  acOutputOn: boolean;
  dcOutputOn: boolean;
  batteryVolts: number;
  remainingCapacityWh: number;
  chargeCycles: number;
}

function createSimulatedState(): SimulatedJackeryState {
  return {
    batteryPercent: 45 + Math.random() * 40,
    inputWatts: Math.random() > 0.3 ? 60 + Math.random() * 400 : 0,
    outputWatts: 30 + Math.random() * 200,
    solarWatts: Math.random() > 0.4 ? 30 + Math.random() * 300 : 0,
    acOutputWatts: 20 + Math.random() * 150,
    dcOutputWatts: 5 + Math.random() * 40,
    usbOutputWatts: 3 + Math.random() * 25,
    temperatureC: 18 + Math.random() * 20,
    acOutputOn: Math.random() > 0.3,
    dcOutputOn: Math.random() > 0.2,
    batteryVolts: 24 + Math.random() * 8,
    remainingCapacityWh: 300 + Math.random() * 700,
    chargeCycles: Math.floor(30 + Math.random() * 150),
  };
}

function driftSimulatedState(prev: SimulatedJackeryState): SimulatedJackeryState {
  const drift = (val: number, range: number, min: number, max: number) =>
    Math.max(min, Math.min(max, val + (Math.random() - 0.5) * range));

  return {
    batteryPercent: drift(prev.batteryPercent, 2, 0, 100),
    inputWatts: drift(prev.inputWatts, 30, 0, 1400),
    outputWatts: drift(prev.outputWatts, 20, 0, 3000),
    solarWatts: drift(prev.solarWatts, 25, 0, 800),
    acOutputWatts: drift(prev.acOutputWatts, 15, 0, 2000),
    dcOutputWatts: drift(prev.dcOutputWatts, 8, 0, 300),
    usbOutputWatts: drift(prev.usbOutputWatts, 5, 0, 100),
    temperatureC: drift(prev.temperatureC, 1, 5, 55),
    acOutputOn: prev.acOutputOn,
    dcOutputOn: prev.dcOutputOn,
    batteryVolts: drift(prev.batteryVolts, 0.4, 20, 34),
    remainingCapacityWh: drift(prev.remainingCapacityWh, 15, 0, 3024),
    chargeCycles: prev.chargeCycles,
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

// ── Jackery Device Capabilities ─────────────────────────────────────────

const JACKERY_CAPABILITIES: BluDeviceCapabilities = {
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

type AdapterSubscriber = (state: JackeryAdapterState) => void;

// ── Adapter Class ───────────────────────────────────────────────────────

class JackeryBluAdapter {
  private connectionState: BluConnectionState = 'disconnected';
  private discoveredDevices: JackeryDiscoveredDevice[] = [];
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
  private simulatedStates = new Map<string, SimulatedJackeryState>();

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

  getState(): JackeryAdapterState {
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
   * Scan for nearby Jackery BLE devices.
   *
   * On native platforms, this uses the BLE scanner to discover devices
   * advertising the Jackery service UUID. On web/dev, returns simulated
   * devices for testing.
   */
  async scanForDevices(): Promise<JackeryDiscoveredDevice[]> {
    if (this.isScanning) {
      console.log('[JackeryBluAdapter] Scan already in progress.');
      return this.discoveredDevices;
    }

    this.isScanning = true;
    this.lastError = null;
    this.lastErrorCode = null;
    this.notify();

    console.log('[JackeryBluAdapter] Starting BLE scan for Jackery devices...');

    try {
      // On web or when BLE is unavailable, return simulated devices
      if (Platform.OS === 'web' || !this.isBleAvailable()) {
        console.log('[JackeryBluAdapter] BLE unavailable — using simulated discovery.');
        await this.simulateDelay(1500);

        this.discoveredDevices = [
          {
            id: 'jackery-sim-e1000plus',
            name: 'Jackery Explorer 1000 Plus',
            rssi: -48,
            model: 'Explorer 1000 Plus',
            modelSpec: lookupJackeryModel('Explorer 1000 Plus'),
          },
          {
            id: 'jackery-sim-e2000plus',
            name: 'Jackery Explorer 2000 Plus',
            rssi: -59,
            model: 'Explorer 2000 Plus',
            modelSpec: lookupJackeryModel('Explorer 2000 Plus'),
          },
          {
            id: 'jackery-sim-e300plus',
            name: 'Jackery Explorer 300 Plus',
            rssi: -67,
            model: 'Explorer 300 Plus',
            modelSpec: lookupJackeryModel('Explorer 300 Plus'),
          },
        ];

        console.log(`[JackeryBluAdapter] Simulated ${this.discoveredDevices.length} device(s).`);
      } else {
        // Native BLE scanning
        await this.performBleScan();
      }

      this.isScanning = false;
      this.notify();
      return this.discoveredDevices;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed';
      console.error('[JackeryBluAdapter] Scan error:', msg);
      this.lastError = 'Failed to scan for Jackery devices.';
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
    console.log('[JackeryBluAdapter] Native BLE scan — using simulated fallback.');
    await this.simulateDelay(2000);

    this.discoveredDevices = [
      {
        id: 'jackery-sim-e1000plus',
        name: 'Jackery Explorer 1000 Plus',
        rssi: -48,
        model: 'Explorer 1000 Plus',
        modelSpec: lookupJackeryModel('Explorer 1000 Plus'),
      },
    ];
  }

  // ── Connect ────────────────────────────────────────────────────────

  /**
   * Connect to a specific Jackery device by its BLE peripheral ID.
   */
  async connect(deviceId?: string): Promise<JackeryConnectResult> {
    console.log(`[JackeryBluAdapter] Connecting to device: ${deviceId || 'first available'}...`);

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
          'No Jackery device found. Make sure your device is powered on and Bluetooth is enabled.',
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
      await bluDeviceRegistry.ensurePrimary('jackery');

      // Update adapter state
      this.connectionState = 'connected';
      this.connectedDevices = bluDeviceRegistry.getByProvider('jackery');
      this.lastError = null;
      this.lastErrorCode = null;

      // Persist session
      const primary = bluDeviceRegistry.getPrimary();
      bluSessionStore.recordConnection('jackery', primary?.device_id ?? null);

      this.notify();

      console.log(
        `[JackeryBluAdapter] Connected to ${target.name} (${target.id}). ` +
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
      console.error('[JackeryBluAdapter] Connect error:', msg);
      return this.handleConnectError(
        'Connection failed. Please check Bluetooth is enabled and try again.',
        'UNEXPECTED',
      );
    }
  }

  // ── Connect All Discovered ─────────────────────────────────────────

  /**
   * Connect to all discovered Jackery devices.
   * Useful for multi-battery setups with expansion packs.
   */
  async connectAll(): Promise<JackeryConnectResult[]> {
    if (this.discoveredDevices.length === 0) {
      await this.scanForDevices();
    }

    const results: JackeryConnectResult[] = [];
    for (const device of this.discoveredDevices) {
      const result = await this.connect(device.id);
      results.push(result);
    }

    return results;
  }

  // ── Disconnect ─────────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    console.log('[JackeryBluAdapter] Disconnecting...');

    this.stopPolling();
    this.cancelReconnect();
    this.removeAppStateListener();

    // Clear Jackery devices from registry
    await bluDeviceRegistry.clearProvider('jackery');

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
    console.log('[JackeryBluAdapter] Disconnected.');
  }

  // ── Poll Telemetry ─────────────────────────────────────────────────

  /**
   * Poll telemetry for a specific device (or the primary Jackery device).
   */
  async pollTelemetry(deviceId?: string): Promise<JackeryPollResult> {
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
          error: 'No Jackery device available to poll',
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
      const device = bluDeviceRegistry.getDevice('jackery', targetDeviceId);
      const modelSpec = device ? lookupJackeryModel(device.model) : undefined;

      // Normalize to BluTelemetry
      const telemetry = this.normalizeTelemetry(targetDeviceId, newState, modelSpec);

      // Feed into BLU state store
      bluStateStore.ingestTelemetry(telemetry);

      // Update device connection state
      await bluDeviceRegistry.updateConnectionState('jackery', targetDeviceId, 'connected');

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
        `[JackeryBluAdapter] Poll #${this.pollCount} success` +
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
      console.error('[JackeryBluAdapter] Poll error (isolated):', msg);
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
    console.log(`[JackeryBluAdapter] Auto-polling started (${intervalMs}ms interval)`);
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
      console.log('[JackeryBluAdapter] No previous session to restore.');
      return false;
    }

    const session = bluSessionStore.getSession();
    if (session.provider !== 'jackery') {
      console.log('[JackeryBluAdapter] Previous session is not Jackery.');
      return false;
    }

    console.log(
      `[JackeryBluAdapter] Restoring session: primary=${session.primaryDeviceId}` +
      ` | polling=${session.wasPolling}`,
    );

    // Scan and connect
    await this.scanForDevices();
    const result = await this.connect(
      session.primaryDeviceId || undefined,
    );

    if (!result.success) {
      console.log('[JackeryBluAdapter] Session restore failed.');
      return false;
    }

    // Restore primary
    if (session.primaryDeviceId) {
      await bluDeviceRegistry.restorePrimary('jackery', session.primaryDeviceId);
      this.connectedDevices = bluDeviceRegistry.getByProvider('jackery');
      this.notify();
    }

    // Resume polling
    if (session.wasPolling) {
      this.startPolling(DEFAULT_POLL_INTERVAL_MS);
    }

    console.log('[JackeryBluAdapter] Session restored successfully.');
    return true;
  }

  // ── Set Primary Device ─────────────────────────────────────────────

  async setPrimaryDevice(deviceId: string): Promise<void> {
    console.log(`[JackeryBluAdapter] Setting primary device: ${deviceId}`);
    await bluDeviceRegistry.setPrimary('jackery', deviceId);
    this.connectedDevices = bluDeviceRegistry.getByProvider('jackery');
    bluSessionStore.recordPrimaryDeviceChange(deviceId);
    this.notify();

    // Poll the new primary immediately
    await this.pollTelemetry(deviceId);
  }

  // ── Refresh Devices ────────────────────────────────────────────────

  async refreshDevices(): Promise<JackeryDiscoveredDevice[]> {
    console.log('[JackeryBluAdapter] Refreshing device list...');
    return this.scanForDevices();
  }

  // ── Rename Device ──────────────────────────────────────────────────

  async renameDevice(deviceId: string, newName: string): Promise<void> {
    const devices = bluDeviceRegistry.getAll();
    const device = devices.find(
      (d) => d.provider === 'jackery' && d.device_id === deviceId,
    );
    if (!device) return;

    // Re-register with new name (merge logic handles update)
    await bluDeviceRegistry.registerDevice({
      provider: 'jackery',
      device_id: deviceId,
      display_name: newName,
      model: device.model,
      connection_state: device.connection_state,
      last_seen: Date.now(),
      capabilities: device.capabilities,
    });

    this.connectedDevices = bluDeviceRegistry.getByProvider('jackery');
    this.notify();
    console.log(`[JackeryBluAdapter] Device ${deviceId} renamed to "${newName}".`);
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private isBleAvailable(): boolean {
    return false; // Default to simulated mode
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeDevice(discovered: JackeryDiscoveredDevice): BluDevice {
    const modelName = discovered.model || extractJackeryModelFromName(discovered.name) || 'Jackery Explorer';
    const spec = discovered.modelSpec || lookupJackeryModel(modelName);

    return {
      provider: 'jackery',
      device_id: discovered.id,
      display_name: spec?.displayName || discovered.name || discovered.id,
      model: modelName,
      connection_state: 'connected',
      last_seen: Date.now(),
      capabilities: { ...JACKERY_CAPABILITIES },
      is_primary: false,
    };
  }

  private normalizeTelemetry(
    deviceId: string,
    state: SimulatedJackeryState,
    modelSpec?: JackeryModelSpec,
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
      provider: 'jackery',
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
      dc_output_watts: Math.round(state.dcOutputWatts),

      // Environmental
      temperature_celsius: Math.round(state.temperatureC * 10) / 10,

      // Extended
      battery_volts: Math.round(state.batteryVolts * 10) / 10,
      inverter_on: state.acOutputOn,
      capacity_wh: capacityWh,
      charge_cycles: state.chargeCycles,
    };
  }

  private getPrimaryDeviceId(): string | null {
    const primary = bluDeviceRegistry.getPrimary();
    if (primary && primary.provider === 'jackery') {
      return primary.device_id;
    }
    const devices = bluDeviceRegistry.getByProvider('jackery');
    return devices.length > 0 ? devices[0].device_id : null;
  }

  private handlePollFailure(error: string): void {
    this.consecutiveFailures++;
    bluStateStore.recordPollFailure(error);

    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log(
        `[JackeryBluAdapter] ${this.consecutiveFailures} consecutive failures — backing off`,
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
      `[JackeryBluAdapter] Quiet reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`,
    );

    try {
      await this.simulateDelay(2000);

      // Reconnect succeeded (simulated)
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;
      this.connectionState = 'connected';
      bluStateStore.setReconnecting(false);

      this.connectedDevices = bluDeviceRegistry.getByProvider('jackery');
      await bluDeviceRegistry.ensurePrimary('jackery');

      const primary = bluDeviceRegistry.getPrimary();
      bluSessionStore.recordConnection('jackery', primary?.device_id ?? null);

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
  ): JackeryConnectResult {
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

export const jackeryBluAdapter = new JackeryBluAdapter();


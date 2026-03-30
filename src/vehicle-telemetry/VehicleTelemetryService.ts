/**
 * ═══════════════════════════════════════════════════════════
 * ECS VEHICLE TELEMETRY SERVICE — Phase 2D
 * ═══════════════════════════════════════════════════════════
 *
 * Unified vehicle data ingestion layer for ECS.
 *
 * This service:
 *   - Manages telemetry provider connections
 *   - Routes incoming data to the telemetry store
 *   - Handles primary device switching
 *   - Persists session state across app restarts
 *   - Operates independently from BLU power telemetry
 *   - Integrates with OBD-II adapter for Bluetooth connections
 *   - Bridges VT summary to vehicle display for AA/CP
 *
 * Phase 2D adds:
 *   - Enhanced session persistence with device registry snapshot
 *   - Session restore with device validation
 *   - Stale session detection for OBD-II connections
 *   - Automatic reconnection orchestration
 *   - Device switching that immediately reroutes polling
 *   - Reconnecting state propagation to store
 *   - Freshness label computation
 *   - Recovery logging
 *   - Offline/BLE-unavailable safety
 */

import { Platform, AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import type {
  VehicleTelemetryProviderId,
  VehicleTelemetryDevice,
  NormalizedVehicleTelemetry,
  VehicleTelemetryConnectionState,
  VehicleTelemetryCapabilities,
  TelemetryFreshnessLabel,
  SessionRecoveryStatus,
} from './VehicleTelemetryTypes';
import { VT_STORAGE_KEYS } from './VehicleTelemetryTypes';
import { vehicleTelemetryDeviceRegistry } from './VehicleTelemetryDeviceRegistry';
import { vehicleTelemetryStore } from './VehicleTelemetryStore';
import { OBD2PIDPoller } from './OBD2PIDPoller';

const TAG = '[VT-Service]';

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

function sRemove(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    delete mem[key];
  } catch { delete mem[key]; }
}

// ═══════════════════════════════════════════════════════════
// BLE CHARACTERISTIC HELPERS
// ═══════════════════════════════════════════════════════════

const ELM327_SERVICE_UUID = 'ffe0';
const ELM327_CHAR_UUID = 'ffe1';

async function sendBleCommand(device: any, command: string): Promise<string> {
  if (!device) throw new Error('No BLE device connected');

  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(command);
    const base64 = btoa(String.fromCharCode(...bytes));

    await device.writeCharacteristicWithResponseForService(
      ELM327_SERVICE_UUID,
      ELM327_CHAR_UUID,
      base64,
    );

    return await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve('');
      }, 2000);

      let responseBuffer = '';

      const subscription = device.monitorCharacteristicForService(
        ELM327_SERVICE_UUID,
        ELM327_CHAR_UUID,
        (error: any, characteristic: any) => {
          if (error) {
            clearTimeout(timeout);
            subscription?.remove?.();
            reject(error);
            return;
          }

          if (characteristic?.value) {
            try {
              const decoded = atob(characteristic.value);
              responseBuffer += decoded;

              if (responseBuffer.includes('>')) {
                clearTimeout(timeout);
                subscription?.remove?.();
                resolve(responseBuffer);
              }
            } catch {
              // Ignore decode errors
            }
          }
        },
      );

      setTimeout(() => {
        if (responseBuffer.length > 0) {
          clearTimeout(timeout);
          subscription?.remove?.();
          resolve(responseBuffer);
        }
      }, 1500);
    });
  } catch (err: any) {
    console.warn(TAG, 'BLE command failed:', err?.message);
    return '';
  }
}

// ═══════════════════════════════════════════════════════════
// SESSION STATE
// ═══════════════════════════════════════════════════════════

interface VTSessionState {
  activeProvider: VehicleTelemetryProviderId | null;
  primaryDeviceId: string | null;
  wasPolling: boolean;
  obd2WasConnected: boolean;
  savedAt: string;
  /** Phase 2D: Device registry snapshot for validation */
  deviceCount: number;
  /** Phase 2D: Session version for compatibility */
  version: number;
}

const EMPTY_SESSION: VTSessionState = {
  activeProvider: null,
  primaryDeviceId: null,
  wasPolling: false,
  obd2WasConnected: false,
  savedAt: '',
  deviceCount: 0,
  version: 2,
};

const SESSION_VERSION = 2;

// ═══════════════════════════════════════════════════════════
// VEHICLE TELEMETRY SERVICE
// ═══════════════════════════════════════════════════════════

class VehicleTelemetryService {
  private activeProvider: VehicleTelemetryProviderId | null = null;
  private isPolling = false;
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: Array<() => void> = [];
  private vehicleDisplayBridgeTimer: ReturnType<typeof setInterval> | null = null;
  private obd2WasConnected = false;

  /** Phase 2C: OBD-II PID Poller instance */
  private pidPoller: OBD2PIDPoller | null = null;

  /** Phase 2C: BLE device reference for PID communication */
  private bleDeviceRef: any = null;

  /** Phase 2C: App state listener for polling pause/resume */
  private appStateSubscription: any = null;

  /** Phase 2D: Session recovery status */
  private recoveryStatus: SessionRecoveryStatus = 'idle';

  /** Phase 2D: Whether a reconnect has been attempted this session */
  private reconnectAttempted = false;

  constructor() {
    this.restoreSession();
  }

  // ── Session Persistence ────────────────────────────────

  private saveSession(): void {
    try {
      const session: VTSessionState = {
        activeProvider: this.activeProvider,
        primaryDeviceId: vehicleTelemetryDeviceRegistry.getPrimaryId(),
        wasPolling: this.isPolling,
        obd2WasConnected: this.obd2WasConnected,
        savedAt: new Date().toISOString(),
        deviceCount: vehicleTelemetryDeviceRegistry.getCount(),
        version: SESSION_VERSION,
      };
      sSet(VT_STORAGE_KEYS.SESSION, JSON.stringify(session));
    } catch (e) {
      console.warn(TAG, 'Failed to save session:', e);
    }
  }

  private restoreSession(): void {
    this.recoveryStatus = 'restoring';
    try {
      const raw = sGet(VT_STORAGE_KEYS.SESSION);
      if (!raw) {
        this.recoveryStatus = 'no_session';
        console.log(TAG, 'No previous session to restore');
        return;
      }

      const session: VTSessionState = JSON.parse(raw);

      // Phase 2D: Check session version compatibility
      if (session.version && session.version > SESSION_VERSION) {
        console.warn(TAG, 'Session version mismatch — discarding');
        this.recoveryStatus = 'failed';
        return;
      }

      if (session.activeProvider) {
        this.activeProvider = session.activeProvider;
        console.log(TAG, `Restored active provider: ${session.activeProvider}`);
      }

      this.obd2WasConnected = session.obd2WasConnected || false;

      // Phase 2D: Restore primary device with validation
      const restoredPrimary = vehicleTelemetryDeviceRegistry.restorePrimary();

      if (restoredPrimary) {
        console.log(TAG, `Session restored — primary: ${restoredPrimary.device_name}`);
      } else if (session.primaryDeviceId) {
        // Previous primary no longer exists — fallback was found (or no devices)
        console.log(TAG, `Previous primary ${session.primaryDeviceId} unavailable — fallback assigned`);
      }

      // Phase 2D: If OBD-II was previously connected, signal for auto-reconnect
      if (this.obd2WasConnected && session.activeProvider === 'obd2') {
        console.log(TAG, 'OBD-II was connected in previous session — auto-reconnect will be attempted by adapter');
      }

      this.recoveryStatus = 'restored';
      console.log(TAG, 'Session restored successfully');
    } catch (e) {
      console.warn(TAG, 'Failed to restore session:', e);
      this.recoveryStatus = 'failed';
    }
  }

  // ── Notifications ──────────────────────────────────────

  private notify(): void {
    this.listeners.forEach(fn => { try { fn(); } catch {} });
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  // ── Provider Management ────────────────────────────────

  getActiveProvider(): VehicleTelemetryProviderId | null {
    return this.activeProvider;
  }

  setActiveProvider(provider: VehicleTelemetryProviderId): void {
    this.activeProvider = provider;
    console.log(TAG, `Active provider set: ${provider}`);

    if (provider === 'obd2') {
      this.obd2WasConnected = true;
    }

    this.saveSession();
    this.notify();
  }

  clearActiveProvider(): void {
    if (this.isPolling) {
      this.stopPolling();
    }
    this.activeProvider = null;
    this.obd2WasConnected = false;
    console.log(TAG, 'Active provider cleared');
    this.saveSession();
    this.notify();
  }

  // ── Device Registration ────────────────────────────────

  registerDevice(
    provider: VehicleTelemetryProviderId,
    deviceId: string,
    deviceName: string,
    capabilities?: Partial<VehicleTelemetryCapabilities>,
    options?: { firmware_version?: string; protocol?: string },
  ): VehicleTelemetryDevice {
    const device = vehicleTelemetryDeviceRegistry.registerDevice({
      provider,
      device_id: deviceId,
      device_name: deviceName,
      connection_state: 'disconnected',
      last_seen: null,
      capabilities: {
        hasSpeed: false,
        hasRpm: false,
        hasEngineLoad: false,
        hasCoolantTemp: false,
        hasIntakeTemp: false,
        hasBatteryVoltage: false,
        hasFuelLevel: false,
        hasFuelRate: false,
        hasEngineRuntime: false,
        hasTirePressure: false,
        hasDTCs: false,
        ...capabilities,
      },
      firmware_version: options?.firmware_version,
      protocol: options?.protocol,
    });

    this.saveSession();
    return device;
  }

  removeDevice(deviceId: string): void {
    vehicleTelemetryDeviceRegistry.removeDevice(deviceId);

    if (this.activeProvider) {
      const remaining = vehicleTelemetryDeviceRegistry.getByProvider(this.activeProvider);
      if (remaining.length === 0) {
        this.clearActiveProvider();
      }
    }

    this.saveSession();
    this.notify();
  }

  // ── Primary Device Switching (Phase 2D Enhanced) ───────

  /**
   * Change the primary telemetry device.
   * Phase 2D: Immediately reroutes telemetry summary AND polling to the new device.
   */
  changePrimaryDevice(deviceId: string): boolean {
    const success = vehicleTelemetryDeviceRegistry.setPrimary(deviceId);
    if (success) {
      const newPrimary = vehicleTelemetryDeviceRegistry.getById(deviceId);
      console.log(TAG, `Primary device changed to: ${deviceId} (${newPrimary?.device_name})`);

      // Phase 2D: If polling, restart with new primary device
      if (this.isPolling && this.pidPoller) {
        console.log(TAG, 'Restarting polling for new primary device...');
        this.stopPolling();
        // Small delay to let cleanup complete
        setTimeout(() => {
          this.startPolling();
        }, 500);
      }

      // Force store to recompute summary with new primary
      vehicleTelemetryStore.recompute();
      this.saveSession();
      this.notify();
    }
    return success;
  }

  // ── Telemetry Ingestion ────────────────────────────────

  ingestTelemetry(telemetry: NormalizedVehicleTelemetry): void {
    vehicleTelemetryStore.ingest(telemetry);
    this.pushToVehicleDisplay();
  }

  updateDeviceConnectionState(deviceId: string, state: VehicleTelemetryConnectionState): void {
    vehicleTelemetryDeviceRegistry.updateConnectionState(deviceId, state);
    vehicleTelemetryStore.recompute();

    const device = vehicleTelemetryDeviceRegistry.getById(deviceId);
    if (device?.provider === 'obd2') {
      this.obd2WasConnected = state === 'connected';

      // Phase 2D: Propagate reconnecting state to store
      if (state === 'disconnected' || state === 'error') {
        // Check if adapter is reconnecting
        try {
          const { obd2Adapter } = require('./OBD2Adapter');
          const adapterState = obd2Adapter.getState();
          if (adapterState === 'reconnecting') {
            vehicleTelemetryStore.setReconnecting(true);
            console.log(TAG, 'OBD-II disconnected — adapter is reconnecting');
          } else {
            vehicleTelemetryStore.setReconnecting(false);
          }
        } catch {
          vehicleTelemetryStore.setReconnecting(false);
        }
      } else if (state === 'connected') {
        vehicleTelemetryStore.setReconnecting(false);
      }

      this.saveSession();
    }

    this.notify();
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 2C/2D: OBD-II PID POLLING
  // ═══════════════════════════════════════════════════════

  setBleDeviceRef(device: any): void {
    this.bleDeviceRef = device;
    console.log(TAG, 'BLE device reference set for PID polling');
  }

  startPolling(intervalMs: number = 2500): void {
    if (this.isPolling) {
      console.log(TAG, 'Already polling — ignoring duplicate start');
      return;
    }
    if (!this.activeProvider) {
      console.warn(TAG, 'Cannot start polling — no active provider');
      return;
    }

    const primary = vehicleTelemetryDeviceRegistry.getPrimary();
    if (!primary) {
      console.warn(TAG, 'Cannot start polling — no primary device');
      return;
    }

    this.pidPoller = new OBD2PIDPoller(
      primary.device_id,
      {
        onTelemetry: (telemetry) => {
          this.ingestTelemetry(telemetry);
        },
        sendCommand: async (command) => {
          return await sendBleCommand(this.bleDeviceRef, command);
        },
        onError: (error) => {
          console.warn(TAG, 'PID poller error:', error);
        },
        onCapabilitiesDiscovered: (supported, unsupported) => {
          if (primary) {
            const PID_TO_CAPABILITY: Record<string, keyof VehicleTelemetryCapabilities> = {
              '0C': 'hasRpm',
              '0D': 'hasSpeed',
              '04': 'hasEngineLoad',
              '05': 'hasCoolantTemp',
              '0F': 'hasIntakeTemp',
              '2F': 'hasFuelLevel',
              '5E': 'hasFuelRate',
              '1F': 'hasEngineRuntime',
            };

            const caps: Partial<VehicleTelemetryCapabilities> = {
              hasBatteryVoltage: true,
            };

            for (const pid of supported) {
              const capKey = PID_TO_CAPABILITY[pid];
              if (capKey) (caps as any)[capKey] = true;
            }

            for (const pid of unsupported) {
              const capKey = PID_TO_CAPABILITY[pid];
              if (capKey) (caps as any)[capKey] = false;
            }

            vehicleTelemetryDeviceRegistry.updateCapabilities(primary.device_id, caps);
            console.log(TAG, `Capabilities updated for ${primary.device_name}`);
          }
        },
      },
      intervalMs,
    );

    this.pidPoller.start().then((success) => {
      if (success) {
        this.isPolling = true;
        console.log(TAG, `PID polling started (${intervalMs}ms interval)`);
        this.startVehicleDisplayBridge(intervalMs);
        this.setupPollingAppStateListener();
        this.saveSession();
        this.notify();
      } else {
        console.warn(TAG, 'PID poller failed to start');
        this.pidPoller?.destroy();
        this.pidPoller = null;
      }
    }).catch((err) => {
      console.warn(TAG, 'PID polling start error:', err);
      this.pidPoller?.destroy();
      this.pidPoller = null;
    });
  }

  stopPolling(): void {
    if (!this.isPolling && !this.pidPoller) return;

    if (this.pidPoller) {
      this.pidPoller.destroy();
      this.pidPoller = null;
    }

    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }

    this.stopVehicleDisplayBridge();
    this.removePollingAppStateListener();

    this.isPolling = false;
    console.log(TAG, 'Polling stopped');
    this.saveSession();
    this.notify();
  }

  pausePolling(): void {
    if (this.pidPoller && this.isPolling) {
      this.pidPoller.pause();
      console.log(TAG, 'Polling paused (app backgrounded)');
    }
  }

  resumePolling(): void {
    if (this.pidPoller && this.isPolling) {
      this.pidPoller.resume();
      console.log(TAG, 'Polling resumed (app foregrounded)');
    }
  }

  getIsPolling(): boolean {
    return this.isPolling;
  }

  getPollerStatus(): any {
    return this.pidPoller?.getStatus() ?? null;
  }

  // ── App State Listener for Polling ─────────────────────

  private setupPollingAppStateListener(): void {
    this.removePollingAppStateListener();
    try {
      this.appStateSubscription = AppState.addEventListener(
        'change',
        (nextState: AppStateStatus) => {
          if (nextState === 'background' || nextState === 'inactive') {
            this.pausePolling();
          } else if (nextState === 'active') {
            this.resumePolling();
          }
        },
      );
    } catch {
      // AppState may not be available
    }
  }

  private removePollingAppStateListener(): void {
    if (this.appStateSubscription) {
      try { this.appStateSubscription.remove(); } catch {}
      this.appStateSubscription = null;
    }
  }

  // ── Vehicle Display Bridge (AA/CP) ─────────────────────

  private pushToVehicleDisplay(): void {
    try {
      const summary = vehicleTelemetryStore.getSummary();
      if (!summary.has_data) return;

      const { vehicleDisplayStore } = require('../../lib/vehicleDisplayStore');

      const systems: Array<{
        id: string;
        label: string;
        status: 'nominal' | 'warning' | 'critical' | 'offline';
        value: string | null;
      }> = [];

      if (summary.engine_status !== 'unknown') {
        systems.push({
          id: 'vt_engine',
          label: 'Engine',
          status: summary.engine_status === 'running' ? 'nominal' :
                  summary.engine_status === 'idle' ? 'nominal' :
                  summary.engine_status === 'off' ? 'offline' : 'warning',
          value: summary.engine_rpm != null ? `${Math.round(summary.engine_rpm)} RPM` : summary.engine_status.toUpperCase(),
        });
      }

      if (summary.battery_voltage != null) {
        systems.push({
          id: 'vt_battery',
          label: 'Battery',
          status: summary.battery_voltage >= 12.4 ? 'nominal' :
                  summary.battery_voltage >= 11.8 ? 'warning' : 'critical',
          value: `${summary.battery_voltage.toFixed(1)}V`,
        });
      }

      if (summary.fuel_level != null) {
        systems.push({
          id: 'vt_fuel',
          label: 'Fuel',
          status: summary.fuel_level >= 25 ? 'nominal' :
                  summary.fuel_level >= 10 ? 'warning' : 'critical',
          value: `${Math.round(summary.fuel_level)}%`,
        });
      }

      if (summary.coolant_temp != null) {
        systems.push({
          id: 'vt_coolant',
          label: 'Coolant',
          status: summary.coolant_temp <= 220 ? 'nominal' :
                  summary.coolant_temp <= 240 ? 'warning' : 'critical',
          value: `${Math.round(summary.coolant_temp)}°F`,
        });
      }

      if (summary.vehicle_speed != null) {
        systems.push({
          id: 'vt_speed',
          label: 'Speed',
          status: 'nominal',
          value: `${Math.round(summary.vehicle_speed)} mph`,
        });
      }

      if (systems.length > 0) {
        const currentStatus = vehicleDisplayStore.getStatusData();
        const nonVtSystems = (currentStatus.vehicleSystemsSummary || [])
          .filter((s: any) => !s.id.startsWith('vt_'));
        vehicleDisplayStore.updateStatusData({
          vehicleSystemsSummary: [...nonVtSystems, ...systems],
        });
      }
    } catch {
      // Vehicle display store may not be available
    }
  }

  startVehicleDisplayBridge(intervalMs: number = 5000): void {
    this.stopVehicleDisplayBridge();
    this.vehicleDisplayBridgeTimer = setInterval(() => {
      this.pushToVehicleDisplay();
    }, intervalMs);
    console.log(TAG, 'Vehicle display bridge started');
  }

  stopVehicleDisplayBridge(): void {
    if (this.vehicleDisplayBridgeTimer) {
      clearInterval(this.vehicleDisplayBridgeTimer);
      this.vehicleDisplayBridgeTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 2D: FRESHNESS LABEL
  // ═══════════════════════════════════════════════════════

  /**
   * Get the current telemetry freshness label.
   * Delegates to the store which has full context.
   */
  getFreshnessLabel(): TelemetryFreshnessLabel {
    return vehicleTelemetryStore.getFreshnessLabel();
  }

  /**
   * Get the session recovery status.
   */
  getRecoveryStatus(): SessionRecoveryStatus {
    return this.recoveryStatus;
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 2D: RECONNECT ORCHESTRATION
  // ═══════════════════════════════════════════════════════

  /**
   * Signal that the OBD-II adapter is reconnecting.
   * Updates the store's reconnecting state.
   */
  signalReconnecting(isReconnecting: boolean): void {
    vehicleTelemetryStore.setReconnecting(isReconnecting);
    console.log(TAG, `Reconnecting signal: ${isReconnecting}`);
    this.notify();
  }

  /**
   * Signal that a reconnection succeeded.
   * Resumes polling if it was active before.
   */
  signalReconnected(deviceId: string): void {
    vehicleTelemetryStore.setReconnecting(false);
    this.updateDeviceConnectionState(deviceId, 'connected');
    this.obd2WasConnected = true;
    console.log(TAG, `Reconnection succeeded: ${deviceId}`);

    // Resume polling if we were polling before
    if (!this.isPolling && this.activeProvider === 'obd2') {
      console.log(TAG, 'Resuming polling after reconnect...');
      setTimeout(() => this.startPolling(), 1000);
    }

    this.saveSession();
    this.notify();
  }

  /**
   * Signal that a reconnection failed.
   * Keeps last known data visible during grace window.
   */
  signalReconnectFailed(deviceId: string): void {
    vehicleTelemetryStore.setReconnecting(false);
    this.updateDeviceConnectionState(deviceId, 'disconnected');
    console.log(TAG, `Reconnection failed: ${deviceId} — showing last known data`);
    this.notify();
  }

  // ── State Queries ──────────────────────────────────────

  getState(): {
    activeProvider: VehicleTelemetryProviderId | null;
    isPolling: boolean;
    primaryDevice: VehicleTelemetryDevice | null;
    deviceCount: number;
    hasData: boolean;
    obd2WasConnected: boolean;
    freshnessLabel: TelemetryFreshnessLabel;
    recoveryStatus: SessionRecoveryStatus;
    isReconnecting: boolean;
  } {
    return {
      activeProvider: this.activeProvider,
      isPolling: this.isPolling,
      primaryDevice: vehicleTelemetryDeviceRegistry.getPrimary(),
      deviceCount: vehicleTelemetryDeviceRegistry.getCount(),
      hasData: vehicleTelemetryStore.hasData(),
      obd2WasConnected: this.obd2WasConnected,
      freshnessLabel: this.getFreshnessLabel(),
      recoveryStatus: this.recoveryStatus,
      isReconnecting: vehicleTelemetryStore.getIsReconnecting(),
    };
  }

  wasOBD2Connected(): boolean {
    return this.obd2WasConnected;
  }

  /**
   * Full reset — clear all state and devices.
   */
  reset(): void {
    this.stopPolling();
    this.stopVehicleDisplayBridge();
    this.removePollingAppStateListener();
    this.activeProvider = null;
    this.obd2WasConnected = false;
    this.bleDeviceRef = null;
    this.reconnectAttempted = false;
    this.recoveryStatus = 'idle';
    vehicleTelemetryDeviceRegistry.clearAll();
    vehicleTelemetryStore.clear();
    sRemove(VT_STORAGE_KEYS.SESSION);
    console.log(TAG, 'Service reset');
    this.notify();
  }
}

// ── Singleton export ─────────────────────────────────────
export const vehicleTelemetryService = new VehicleTelemetryService();



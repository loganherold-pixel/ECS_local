/**
 * ═══════════════════════════════════════════════════════════
 * ECS OBD-II BLUETOOTH ADAPTER — Phase 2D
 * ═══════════════════════════════════════════════════════════
 *
 * Handles Bluetooth scanning, device filtering, connection,
 * registration, auto-reconnect, and live PID polling for
 * OBD-II adapters.
 *
 * Phase 2D adds:
 *   - Stale session detection for BLE connections
 *   - Quiet automatic reconnection on unexpected drops
 *   - Reconnect signaling to VT service
 *   - Enhanced error recovery (no crashes)
 *   - Connection health monitoring
 *   - Reconnect on app resume with validation
 *   - Graceful degradation when BLE unavailable
 *   - Session-aware reconnect (validates device still exists in registry)
 *
 * Connection flow:
 *   scan → filter → select → pair → register → init ELM327
 *   → discover PIDs → start polling → ingest telemetry
 */

import { Platform, AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { ensureBlePermissions } from '../power/ble/BlePermissions';
import { createBackoff } from '../power/ble/backoff';
import type { Backoff } from '../power/ble/backoff';
import type {
  VehicleTelemetryDevice,
  VehicleTelemetryConnectionState,
} from './VehicleTelemetryTypes';
import { VT_STORAGE_KEYS } from './VehicleTelemetryTypes';
import { vehicleTelemetryDeviceRegistry } from './VehicleTelemetryDeviceRegistry';
import { vehicleTelemetryService } from './VehicleTelemetryService';

const TAG = '[OBD2-Adapter]';

// ═══════════════════════════════════════════════════════════
// OBD-II DEVICE NAME PATTERNS
// ═══════════════════════════════════════════════════════════

const OBD2_NAME_PATTERNS: RegExp[] = [
  /obd/i, /elm\s*327/i, /elm327/i, /v[\-\s]*link/i, /veepeak/i,
  /bafx/i, /scan\s*tool/i, /carista/i, /obd\s*link/i, /vgate/i,
  /konnwei/i, /fixd/i, /blue\s*driver/i, /torque/i, /le\s*link/i,
  /viecar/i, /thinkcar/i, /autel/i, /icar/i, /launch/i,
  /ancel/i, /foxwell/i, /innova/i, /autophix/i, /xtool/i,
];

const OBD2_SERVICE_UUIDS = [
  '00001101-0000-1000-8000-00805f9b34fb',
  'fff0', 'ffe0',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

// ═══════════════════════════════════════════════════════════
// DISCOVERED DEVICE TYPE
// ═══════════════════════════════════════════════════════════

export interface OBD2DiscoveredDevice {
  id: string;
  name: string;
  rssi: number;
  isLikelyOBD: boolean;
  lastSeenAt: number;
  serviceUUIDs?: string[];
}

// ═══════════════════════════════════════════════════════════
// ADAPTER STATE
// ═══════════════════════════════════════════════════════════

export type OBD2AdapterState =
  | 'idle'
  | 'requesting_permissions'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'reconnecting';

export interface OBD2AdapterStatus {
  state: OBD2AdapterState;
  discoveredDevices: OBD2DiscoveredDevice[];
  connectedDeviceId: string | null;
  connectedDeviceName: string | null;
  error: string | null;
  scanProgress: number;
  reconnectAttempt: number;
}

// ═══════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════

const OBD2_STORAGE_KEYS = {
  LAST_DEVICE_ID: 'ecs_obd2_last_device_id',
  LAST_DEVICE_NAME: 'ecs_obd2_last_device_name',
  AUTO_RECONNECT: 'ecs_obd2_auto_reconnect',
} as const;

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
// LAZY BLE MANAGER
// ═══════════════════════════════════════════════════════════

let _bleManager: any | null = null;

function getBleManager(): any {
  if (_bleManager) return _bleManager;

  if (Platform.OS === 'web') {
    throw new Error(`${TAG} BLE is not supported on web.`);
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BleManager } = require('react-native-ble-plx');
    _bleManager = new BleManager();
    return _bleManager;
  } catch (err) {
    throw new Error(`${TAG} Failed to initialise BleManager: ${err}`);
  }
}

// ═══════════════════════════════════════════════════════════
// OBD-II ADAPTER CLASS
// ═══════════════════════════════════════════════════════════

class OBD2Adapter {
  private state: OBD2AdapterState = 'idle';
  private discovered: Map<string, OBD2DiscoveredDevice> = new Map();
  private connectedDeviceId: string | null = null;
  private connectedDeviceName: string | null = null;
  private connectedDeviceRef: any | null = null;
  private error: string | null = null;
  private scanProgress = 0;
  private reconnectAttempt = 0;

  private listeners: (() => void)[] = [];
  private scanTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private scanProgressTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff: Backoff = createBackoff({ initialDelayMs: 1000, maxDelayMs: 30000 });
  private appStateSubscription: any = null;
  private autoReconnectEnabled = false;
  private isDestroyed = false;

  /** Phase 2D: Connection health check timer */
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  /** Phase 2D: Max reconnect attempts before giving up */
  private static readonly MAX_RECONNECT_ATTEMPTS = 8;

  constructor() {
    this.restoreAutoReconnectState();
    this.setupAppStateListener();
  }

  // ── Status ─────────────────────────────────────────────

  getStatus(): OBD2AdapterStatus {
    return {
      state: this.state,
      discoveredDevices: this.getDiscoveredDevices(),
      connectedDeviceId: this.connectedDeviceId,
      connectedDeviceName: this.connectedDeviceName,
      error: this.error,
      scanProgress: this.scanProgress,
      reconnectAttempt: this.reconnectAttempt,
    };
  }

  getState(): OBD2AdapterState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected' && this.connectedDeviceId !== null;
  }

  isScanning(): boolean {
    return this.state === 'scanning';
  }

  // ── Subscriptions ──────────────────────────────────────

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private notify(): void {
    this.listeners.forEach(fn => { try { fn(); } catch {} });
  }

  private setState(next: OBD2AdapterState): void {
    if (this.state === next) return;
    const wasReconnecting = this.state === 'reconnecting';
    const prev = this.state;
    this.state = next;
    console.log(TAG, `State: ${prev} -> ${next}`);

    // Phase 2D: Signal reconnecting state to VT service
    try {
      if (next === 'reconnecting') {
        vehicleTelemetryService.signalReconnecting(true);
      } else if (wasReconnecting) {
        vehicleTelemetryService.signalReconnecting(false);
      }
    } catch {
      // VT service may not be ready
    }

    this.notify();
  }

  // ═══════════════════════════════════════════════════════
  // SCANNING
  // ═══════════════════════════════════════════════════════

  async startScan(durationMs: number = 15000): Promise<void> {
    if (this.state === 'scanning') {
      console.log(TAG, 'Already scanning — ignoring duplicate request');
      return;
    }

    this.error = null;
    this.discovered.clear();
    this.scanProgress = 0;

    this.setState('requesting_permissions');
    console.log(TAG, 'Requesting BLE permissions...');

    const permResult = await ensureBlePermissions();
    if (!permResult.ok) {
      const msg = Platform.OS === 'web'
        ? 'Bluetooth is not available in web preview. Use a mobile device.'
        : `Bluetooth permissions required: ${permResult.missing.join(', ')}`;
      this.error = msg;
      this.setState('error');
      console.warn(TAG, 'Permission denied:', permResult.missing);
      return;
    }

    console.log(TAG, 'BLE permissions granted');

    try {
      const mgr = getBleManager();
      this.setState('scanning');
      console.log(TAG, `Starting BLE scan (${durationMs}ms)...`);

      mgr.startDeviceScan(
        null,
        { allowDuplicates: false },
        (error: any, device: any) => {
          if (error) {
            console.warn(TAG, 'Scan callback error:', error.message ?? error);
            return;
          }

          if (!device?.id) return;

          const name = device.name ?? device.localName ?? '';
          if (!name) return;

          const isLikelyOBD = this.isLikelyOBDDevice(name, device.serviceUUIDs);

          const entry: OBD2DiscoveredDevice = {
            id: device.id,
            name,
            rssi: device.rssi ?? -100,
            isLikelyOBD,
            lastSeenAt: Date.now(),
            serviceUUIDs: device.serviceUUIDs ?? undefined,
          };

          const isNew = !this.discovered.has(device.id);
          this.discovered.set(device.id, entry);

          if (isNew) {
            console.log(
              TAG,
              `Discovered: ${name} (${device.id})${isLikelyOBD ? ' [OBD-II]' : ''} RSSI: ${device.rssi ?? '?'}`,
            );
            this.notify();
          }
        },
      );

      const startTime = Date.now();
      this.scanProgressTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        this.scanProgress = Math.min(elapsed / durationMs, 1);
        this.notify();
      }, 500);

      this.scanTimeoutTimer = setTimeout(() => {
        this.stopScan();
      }, durationMs);

    } catch (err: any) {
      const msg = err?.message ?? 'Failed to start Bluetooth scan';
      console.warn(TAG, 'Scan start failed:', msg);
      this.error = msg;
      this.setState('error');
    }
  }

  async stopScan(): Promise<void> {
    if (this.scanTimeoutTimer) {
      clearTimeout(this.scanTimeoutTimer);
      this.scanTimeoutTimer = null;
    }
    if (this.scanProgressTimer) {
      clearInterval(this.scanProgressTimer);
      this.scanProgressTimer = null;
    }

    try {
      const mgr = getBleManager();
      mgr.stopDeviceScan();
      console.log(TAG, `Scan stopped. Found ${this.discovered.size} device(s)`);
    } catch {
      // Manager may not be initialised
    }

    this.scanProgress = 1;
    if (this.state === 'scanning' || this.state === 'requesting_permissions') {
      this.setState('idle');
    }
  }

  getDiscoveredDevices(): OBD2DiscoveredDevice[] {
    const devices = Array.from(this.discovered.values());
    return devices.sort((a, b) => {
      if (a.isLikelyOBD && !b.isLikelyOBD) return -1;
      if (!a.isLikelyOBD && b.isLikelyOBD) return 1;
      return (b.rssi ?? -100) - (a.rssi ?? -100);
    });
  }

  private isLikelyOBDDevice(name: string, serviceUUIDs?: string[]): boolean {
    for (const pattern of OBD2_NAME_PATTERNS) {
      if (pattern.test(name)) return true;
    }

    if (serviceUUIDs && serviceUUIDs.length > 0) {
      for (const uuid of serviceUUIDs) {
        const lower = uuid.toLowerCase();
        if (OBD2_SERVICE_UUIDS.some(obd => lower.includes(obd.toLowerCase()))) {
          return true;
        }
      }
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════

  async connectToDevice(deviceId: string, deviceName?: string): Promise<boolean> {
    await this.stopScan();

    const name = deviceName || this.discovered.get(deviceId)?.name || `OBD-II (${deviceId.slice(-6)})`;

    this.error = null;
    this.setState('connecting');
    console.log(TAG, `Connecting to: ${name} (${deviceId})...`);

    const existingDevice = vehicleTelemetryDeviceRegistry.getById(deviceId);
    if (existingDevice) {
      vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'connecting');
    }

    try {
      const mgr = getBleManager();

      console.log(TAG, 'Initiating BLE pairing...');
      const device = await mgr.connectToDevice(deviceId, {
        requestMTU: 512,
        timeout: 15000,
      });

      console.log(TAG, 'Discovering services and characteristics...');
      await device.discoverAllServicesAndCharacteristics();

      this.connectedDeviceId = deviceId;
      this.connectedDeviceName = name;
      this.connectedDeviceRef = device;
      this.reconnectAttempt = 0;
      this.backoff.reset();

      console.log(TAG, `Connected successfully: ${name}`);

      vehicleTelemetryService.registerDevice(
        'obd2', deviceId, name,
        {
          hasSpeed: true, hasRpm: true, hasEngineLoad: true,
          hasCoolantTemp: true, hasIntakeTemp: true, hasBatteryVoltage: true,
          hasFuelLevel: true, hasFuelRate: true, hasEngineRuntime: true,
          hasTirePressure: false, hasDTCs: false,
        },
        { protocol: 'OBD-II' },
      );

      vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'connected');
      vehicleTelemetryService.setActiveProvider('obd2');

      this.persistLastDevice(deviceId, name);
      this.autoReconnectEnabled = true;
      sSet(OBD2_STORAGE_KEYS.AUTO_RECONNECT, 'true');

      this.monitorDisconnection(device);
      this.startHealthCheck();

      this.setState('connected');
      return true;

    } catch (err: any) {
      const msg = err?.message ?? 'Connection failed';
      console.warn(TAG, `Connection failed: ${msg}`);
      this.error = msg;

      if (existingDevice) {
        vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'error');
      }

      this.setState('error');
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.cancelReconnect();
    this.stopHealthCheck();
    this.autoReconnectEnabled = false;
    sSet(OBD2_STORAGE_KEYS.AUTO_RECONNECT, 'false');

    // Stop polling first
    try {
      vehicleTelemetryService.stopPolling();
    } catch {}

    if (this.connectedDeviceRef && this.connectedDeviceId) {
      const deviceId = this.connectedDeviceId;
      const name = this.connectedDeviceName;

      try {
        const mgr = getBleManager();
        await mgr.cancelDeviceConnection(deviceId);
        console.log(TAG, `Disconnected: ${name}`);
      } catch {
        // Device may already be disconnected
      }

      vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'disconnected');
    }

    this.connectedDeviceId = null;
    this.connectedDeviceName = null;
    this.connectedDeviceRef = null;
    this.reconnectAttempt = 0;
    this.error = null;

    this.setState('idle');
  }

  // ═══════════════════════════════════════════════════════
  // AUTO-RECONNECT (Phase 2D Enhanced)
  // ═══════════════════════════════════════════════════════

  async attemptReconnect(): Promise<boolean> {
    if (this.state === 'connected' || this.state === 'connecting' || this.state === 'reconnecting') {
      return false;
    }

    const lastDeviceId = sGet(OBD2_STORAGE_KEYS.LAST_DEVICE_ID);
    const lastDeviceName = sGet(OBD2_STORAGE_KEYS.LAST_DEVICE_NAME);

    if (!lastDeviceId) {
      console.log(TAG, 'No previous device to reconnect to');
      return false;
    }

    // Phase 2D: Validate device still exists in registry
    const registeredDevice = vehicleTelemetryDeviceRegistry.getById(lastDeviceId);
    if (!registeredDevice) {
      console.log(TAG, `Previous device ${lastDeviceId} not in registry — skipping reconnect`);
      return false;
    }

    this.reconnectAttempt++;
    this.setState('reconnecting');
    console.log(TAG, `Reconnect attempt ${this.reconnectAttempt}/${OBD2Adapter.MAX_RECONNECT_ATTEMPTS}: ${lastDeviceName} (${lastDeviceId})`);

    try {
      const mgr = getBleManager();

      const device = await mgr.connectToDevice(lastDeviceId, {
        requestMTU: 512,
        timeout: 10000,
      });

      await device.discoverAllServicesAndCharacteristics();

      this.connectedDeviceId = lastDeviceId;
      this.connectedDeviceName = lastDeviceName || `OBD-II (${lastDeviceId.slice(-6)})`;
      this.connectedDeviceRef = device;
      this.reconnectAttempt = 0;
      this.backoff.reset();

      console.log(TAG, `Reconnected successfully: ${this.connectedDeviceName}`);

      // Phase 2D: Signal reconnection success to VT service
      vehicleTelemetryService.signalReconnected(lastDeviceId);

      this.monitorDisconnection(device);
      this.startHealthCheck();

      this.setState('connected');
      return true;

    } catch (err: any) {
      console.warn(TAG, `Reconnect attempt ${this.reconnectAttempt} failed:`, err?.message);

      // Phase 2D: Signal reconnect failure to VT service
      if (this.reconnectAttempt >= OBD2Adapter.MAX_RECONNECT_ATTEMPTS) {
        vehicleTelemetryService.signalReconnectFailed(lastDeviceId);
        console.log(TAG, `Max reconnect attempts (${OBD2Adapter.MAX_RECONNECT_ATTEMPTS}) reached — giving up`);
        this.reconnectAttempt = 0;
        this.setState('idle');
      } else if (this.autoReconnectEnabled && !this.isDestroyed) {
        const delay = this.backoff.next();
        console.log(TAG, `Next reconnect in ${delay}ms`);
        this.reconnectTimer = setTimeout(() => {
          if (this.autoReconnectEnabled && !this.isDestroyed) {
            this.attemptReconnect();
          }
        }, delay);
        // Stay in reconnecting state
      } else {
        vehicleTelemetryService.signalReconnectFailed(lastDeviceId);
        this.setState('idle');
      }

      return false;
    }
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    this.backoff.reset();
  }

  // ═══════════════════════════════════════════════════════
  // DISCONNECTION MONITORING
  // ═══════════════════════════════════════════════════════

  private monitorDisconnection(device: any): void {
    try {
      const mgr = getBleManager();
      mgr.onDeviceDisconnected(
        device.id,
        (error: any, _disconnectedDevice: any) => {
          if (this.connectedDeviceId === device.id) {
            console.warn(
              TAG,
              'Device disconnected:',
              error?.message ?? 'clean disconnect',
            );

            const deviceId = this.connectedDeviceId;
            this.connectedDeviceRef = null;
            this.stopHealthCheck();

            // Stop polling on disconnect
            try {
              vehicleTelemetryService.stopPolling();
            } catch {}

            if (deviceId) {
              vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'disconnected');
            }

            // Phase 2D: Attempt auto-reconnect with VT service signaling
            if (this.autoReconnectEnabled && !this.isDestroyed) {
              console.log(TAG, 'Auto-reconnect enabled — will attempt quiet reconnection');
              this.setState('reconnecting');
              const delay = this.backoff.next();
              this.reconnectTimer = setTimeout(() => {
                this.attemptReconnect();
              }, delay);
            } else {
              this.connectedDeviceId = null;
              this.connectedDeviceName = null;
              this.setState('idle');
            }
          }
        },
      );
    } catch (err) {
      console.warn(TAG, 'Failed to set up disconnection monitor:', err);
    }
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 2D: CONNECTION HEALTH CHECK
  // ═══════════════════════════════════════════════════════

  /**
   * Start periodic health checks on the BLE connection.
   * Detects stale/invalid sessions that the BLE stack
   * might not report via disconnection callbacks.
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.healthCheckTimer = setInterval(async () => {
      if (!this.connectedDeviceRef || !this.connectedDeviceId || this.isDestroyed) {
        this.stopHealthCheck();
        return;
      }

      try {
        const mgr = getBleManager();
        const isConnected = await mgr.isDeviceConnected(this.connectedDeviceId);

        if (!isConnected) {
          console.warn(TAG, 'Health check: device no longer connected (stale session detected)');
          this.connectedDeviceRef = null;
          this.stopHealthCheck();

          const deviceId = this.connectedDeviceId;

          // Stop polling
          try {
            vehicleTelemetryService.stopPolling();
          } catch {}

          if (deviceId) {
            vehicleTelemetryService.updateDeviceConnectionState(deviceId, 'disconnected');
          }

          // Attempt reconnect
          if (this.autoReconnectEnabled && !this.isDestroyed) {
            console.log(TAG, 'Stale session — attempting reconnect');
            this.setState('reconnecting');
            const delay = this.backoff.next();
            this.reconnectTimer = setTimeout(() => {
              this.attemptReconnect();
            }, delay);
          } else {
            this.connectedDeviceId = null;
            this.connectedDeviceName = null;
            this.setState('idle');
          }
        }
      } catch (err: any) {
        // Health check failure is not critical — just log
        console.warn(TAG, 'Health check error:', err?.message);
      }
    }, 30_000); // Check every 30 seconds
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════════
  // APP STATE LISTENER (auto-reconnect on resume)
  // ═══════════════════════════════════════════════════════

  private setupAppStateListener(): void {
    try {
      this.appStateSubscription = AppState.addEventListener(
        'change',
        (nextState: AppStateStatus) => {
          if (nextState === 'active' && this.autoReconnectEnabled && !this.isDestroyed) {
            if (this.state !== 'connected' && this.state !== 'connecting' && this.state !== 'reconnecting') {
              console.log(TAG, 'App resumed — checking connection...');

              // Phase 2D: Validate connection before reconnecting
              setTimeout(async () => {
                if (this.state === 'connected' || this.state === 'connecting' || this.state === 'reconnecting') {
                  return; // Already handling it
                }

                // Check if the device is still connected (stale session detection)
                if (this.connectedDeviceId && this.connectedDeviceRef) {
                  try {
                    const mgr = getBleManager();
                    const isConnected = await mgr.isDeviceConnected(this.connectedDeviceId);
                    if (isConnected) {
                      console.log(TAG, 'App resumed — connection still valid');
                      return;
                    }
                  } catch {
                    // Fall through to reconnect
                  }
                }

                if (this.autoReconnectEnabled) {
                  console.log(TAG, 'App resumed — connection invalid, attempting reconnect');
                  this.attemptReconnect();
                }
              }, 1500);
            }
          }
        },
      );
    } catch {
      // AppState may not be available in all environments
    }
  }

  // ═══════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════

  private persistLastDevice(deviceId: string, deviceName: string): void {
    sSet(OBD2_STORAGE_KEYS.LAST_DEVICE_ID, deviceId);
    sSet(OBD2_STORAGE_KEYS.LAST_DEVICE_NAME, deviceName);
  }

  private restoreAutoReconnectState(): void {
    const autoReconnect = sGet(OBD2_STORAGE_KEYS.AUTO_RECONNECT);
    this.autoReconnectEnabled = autoReconnect === 'true';
    if (this.autoReconnectEnabled) {
      console.log(TAG, 'Auto-reconnect enabled from previous session');
    }
  }

  getLastDeviceInfo(): { id: string; name: string } | null {
    const id = sGet(OBD2_STORAGE_KEYS.LAST_DEVICE_ID);
    const name = sGet(OBD2_STORAGE_KEYS.LAST_DEVICE_NAME);
    if (id && name) return { id, name };
    return null;
  }

  isAutoReconnectEnabled(): boolean {
    return this.autoReconnectEnabled;
  }

  /**
   * Phase 2D: Get the connected BLE device reference.
   * Used by VT service for PID polling.
   */
  getConnectedDeviceRef(): any | null {
    return this.connectedDeviceRef;
  }

  // ═══════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════

  destroy(): void {
    this.isDestroyed = true;
    this.cancelReconnect();
    this.stopScan();
    this.stopHealthCheck();

    if (this.appStateSubscription) {
      try { this.appStateSubscription.remove(); } catch {}
      this.appStateSubscription = null;
    }

    if (this.connectedDeviceRef) {
      try {
        const mgr = getBleManager();
        mgr.cancelDeviceConnection(this.connectedDeviceId!).catch(() => {});
      } catch {}
    }

    this.listeners = [];
    this.discovered.clear();
    this.connectedDeviceId = null;
    this.connectedDeviceName = null;
    this.connectedDeviceRef = null;
  }
}

// ── Singleton export ─────────────────────────────────────
export const obd2Adapter = new OBD2Adapter();


import { AppState, Platform, type AppStateStatus } from 'react-native';

import {
  getBleRuntimeUnsupportedMessage,
  isBleNativeModuleUnavailableError,
} from '../src/power/ble/BleScanReadiness';
import { ensureBlePermissions } from '../src/power/ble/BlePermissions';
import type {
  BluConnectionState,
  BluDevice,
  BluDeviceCapabilities,
  BluProviderId,
  BluTelemetry,
} from './BluTypes';
import { bluDeviceRegistry } from './BluDeviceRegistry';
import { bluSessionStore } from './BluSessionStore';
import { bluStateStore } from './BluStateStore';
import { getBluetoothTelemetrySourceLabel, hasDecodedBluetoothTelemetryMetrics } from './bluetoothLiveTelemetry';

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const BACKGROUND_POLL_INTERVAL_MS = 60_000;
const BLE_SCAN_DURATION_MS = 9_000;
const RECONNECT_THRESHOLD = 2;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 10_000;

const BATTERY_SERVICE_UUID = '180f';
const BATTERY_LEVEL_UUID = '2a19';
const BATTERY_POWER_STATE_UUID = '2a1a';
const ENVIRONMENTAL_SENSING_SERVICE_UUID = '181a';
const TEMPERATURE_UUID = '2a6e';
const DEVICE_INFO_SERVICE_UUID = '180a';
const MANUFACTURER_NAME_UUID = '2a29';
const MODEL_NUMBER_UUID = '2a24';
const FIRMWARE_REVISION_UUID = '2a26';

type AdapterEventName =
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

type BleManagerDevice = any;
type BleManagerSubscription = { remove?: () => void } | null;

export interface NativeBleDiscoveredDevice {
  id: string;
  name: string;
  rssi: number;
  model?: string;
  manufacturer?: string | null;
  firmware?: string | null;
  serviceUUIDs?: string[];
  manufacturerData?: string | null;
}

export interface NativeBleConnectResult {
  success: boolean;
  device: BluDevice | null;
  devices?: BluDevice[];
  error: string | null;
  errorCode?: string | null;
}

export interface NativeBlePollResult {
  success: boolean;
  telemetry: BluTelemetry | null;
  error: string | null;
}

export interface NativeBleAdapterState {
  connectionState: BluConnectionState;
  discoveredDevices: NativeBleDiscoveredDevice[];
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

interface AdapterEventPayload {
  type: AdapterEventName;
  provider: BluProviderId;
  timestamp: number;
  state: NativeBleAdapterState;
  telemetry?: BluTelemetry | null;
  device?: BluDevice | null;
  devices?: BluDevice[];
  error?: string | null;
  errorCode?: string | null;
  meta?: Record<string, unknown>;
}

type AdapterSubscriber = (state: NativeBleAdapterState) => void;
type AdapterEventListener = (payload: AdapterEventPayload) => void;

interface CharacteristicSnapshot {
  serviceUuid: string;
  characteristicUuid: string;
  valueBase64: string | null;
}

interface DecodedTelemetryContext {
  device: NativeBleDiscoveredDevice;
  characteristicMap: Map<string, CharacteristicSnapshot>;
  previousTelemetry: BluTelemetry | null;
  rssi: number | null;
}

export interface NativeBleAdapterConfig {
  provider: BluProviderId;
  displayName: string;
  capabilities: BluDeviceCapabilities;
  isSupportedDevice: (device: {
    name?: string | null;
    manufacturerData?: string | null;
    serviceUUIDs?: string[] | null;
  }) => boolean;
  getModelName?: (deviceName: string) => string | undefined;
  decodeTelemetry?: (ctx: DecodedTelemetryContext) => Partial<BluTelemetry>;
}

let bleManagerInstance: any | null = null;

function getBleManager(): any {
  if (bleManagerInstance) return bleManagerInstance;

  if (Platform.OS === 'web') {
    throw new Error('Bluetooth is unavailable on web.');
  }

  try {
    // Lazy require keeps web builds safe.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BleManager } = require('react-native-ble-plx');
    bleManagerInstance = new BleManager();
    return bleManagerInstance;
  } catch (error) {
    if (isBleNativeModuleUnavailableError(error)) {
      throw new Error(getBleRuntimeUnsupportedMessage());
    }
    const message = String((error as any)?.message ?? error ?? 'unknown error');
    throw new Error(`Failed to initialize Bluetooth manager: ${message}`);
  }
}

function normalizeUuid(uuid?: string | null): string {
  if (!uuid) return '';
  return uuid.replace(/-/g, '').toLowerCase();
}

function makeCharacteristicKey(serviceUuid: string, characteristicUuid: string): string {
  return `${normalizeUuid(serviceUuid)}:${normalizeUuid(characteristicUuid)}`;
}

function decodeBase64(value: string | null | undefined): Uint8Array | null {
  if (!value) return null;
  try {
    if (typeof atob === 'function') {
      const binary = atob(value);
      return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    }
    if (typeof Buffer !== 'undefined') {
      return Uint8Array.from(Buffer.from(value, 'base64'));
    }
  } catch {
    return null;
  }
  return null;
}

function decodeUtf8(value: string | null | undefined): string | null {
  const bytes = decodeBase64(value);
  if (!bytes || bytes.length === 0) return null;
  try {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8').decode(bytes).replace(/\0/g, '').trim() || null;
    }
  } catch {
    // Fall back below.
  }
  try {
    return String.fromCharCode(...bytes).replace(/\0/g, '').trim() || null;
  } catch {
    return null;
  }
}

function parseUint8(value: string | null | undefined): number | null {
  const bytes = decodeBase64(value);
  if (!bytes || bytes.length < 1) return null;
  return bytes[0];
}

function parseInt16LE(value: string | null | undefined, scale = 1): number | null {
  const bytes = decodeBase64(value);
  if (!bytes || bytes.length < 2) return null;
  const raw = (bytes[1] << 8) | bytes[0];
  const signed = raw & 0x8000 ? raw - 0x10000 : raw;
  return signed / scale;
}

function readCharacteristic(
  map: Map<string, CharacteristicSnapshot>,
  serviceUuid: string,
  characteristicUuid: string,
): CharacteristicSnapshot | null {
  return map.get(makeCharacteristicKey(serviceUuid, characteristicUuid)) ?? null;
}

function getStandardTelemetry(
  ctx: DecodedTelemetryContext,
): Partial<BluTelemetry> {
  const batteryLevel = parseUint8(
    readCharacteristic(ctx.characteristicMap, BATTERY_SERVICE_UUID, BATTERY_LEVEL_UUID)?.valueBase64,
  );
  const temperature = parseInt16LE(
    readCharacteristic(ctx.characteristicMap, ENVIRONMENTAL_SENSING_SERVICE_UUID, TEMPERATURE_UUID)?.valueBase64,
    100,
  );
  const batteryStateRaw = parseUint8(
    readCharacteristic(ctx.characteristicMap, BATTERY_SERVICE_UUID, BATTERY_POWER_STATE_UUID)?.valueBase64,
  );

  return {
    battery_percent: batteryLevel ?? undefined,
    temperature_celsius: temperature ?? undefined,
    raw: {
      rssi: ctx.rssi,
      readableCharacteristics: ctx.characteristicMap.size,
      batteryPowerStateRaw: batteryStateRaw,
    },
    signal_strength: ctx.rssi ?? undefined,
  };
}

function coalesceTelemetry(
  base: Partial<BluTelemetry>,
  extension?: Partial<BluTelemetry>,
): Partial<BluTelemetry> {
  if (!extension) return base;
  return {
    ...base,
    ...extension,
    raw: {
      ...(base.raw && typeof base.raw === 'object' ? base.raw : {}),
      ...(extension.raw && typeof extension.raw === 'object' ? extension.raw : {}),
    },
  };
}

function errorFromCode(code: string): string {
  switch (code) {
    case 'BLUETOOTH_DISABLED':
      return 'Bluetooth disabled.';
    case 'PERMISSION_DENIED':
      return 'Permission denied.';
    case 'UNSUPPORTED_DEVICE':
      return 'Unsupported device.';
    case 'PAIRING_REQUIRED':
      return 'Pairing required.';
    case 'DEVICE_UNAVAILABLE':
      return 'Device unavailable.';
    case 'UNSUPPORTED_FIRMWARE':
      return 'Unsupported firmware.';
    case 'PLATFORM_UNSUPPORTED':
      return getBleRuntimeUnsupportedMessage();
    default:
      return 'Connection failed.';
  }
}

function detectErrorCode(error: unknown): string {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  if (isBleNativeModuleUnavailableError(error) || message.includes('development build')) {
    return 'PLATFORM_UNSUPPORTED';
  }
  if (message.includes('powered off') || message.includes('bluetooth state') || message.includes('disabled')) {
    return 'BLUETOOTH_DISABLED';
  }
  if (message.includes('permission')) return 'PERMISSION_DENIED';
  if (message.includes('pair') || message.includes('bond')) return 'PAIRING_REQUIRED';
  if (message.includes('not found') || message.includes('unavailable')) return 'DEVICE_UNAVAILABLE';
  if (message.includes('firmware')) return 'UNSUPPORTED_FIRMWARE';
  return 'CONNECT_FAILED';
}

export function createNativeBleBluAdapter(config: NativeBleAdapterConfig) {
  class NativeBleBluAdapter {
    private connectionState: BluConnectionState = 'disconnected';
    private discoveredDevices: NativeBleDiscoveredDevice[] = [];
    private connectedDevices: BluDevice[] = [];
    private lastError: string | null = null;
    private lastErrorCode: string | null = null;
    private pollCount = 0;
    private lastPollAt: number | null = null;
    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private isPaused = false;
    private isScanning = false;
    private consecutiveFailures = 0;
    private isReconnecting = false;
    private reconnectAttempts = 0;
    private subscribers = new Set<AdapterSubscriber>();
    private eventSubscribers = new Map<AdapterEventName, Set<AdapterEventListener>>();
    private telemetryByDeviceId = new Map<string, BluTelemetry>();
    private lastTelemetry: BluTelemetry | null = null;
    private connectedDeviceRef: BleManagerDevice | null = null;
    private disconnectSubscription: BleManagerSubscription = null;
    private appStateSubscription: { remove?: () => void } | null = null;
    private currentPollInterval = DEFAULT_POLL_INTERVAL_MS;

    constructor() {
      this.attachAppLifecycle();
    }

    subscribe(cb: AdapterSubscriber): () => void {
      this.subscribers.add(cb);
      cb(this.getState());
      return () => {
        this.subscribers.delete(cb);
      };
    }

    on(event: AdapterEventName, listener: AdapterEventListener): () => void {
      const listeners = this.eventSubscribers.get(event) ?? new Set<AdapterEventListener>();
      listeners.add(listener);
      this.eventSubscribers.set(event, listeners);
      return () => this.off(event, listener);
    }

    off(event: AdapterEventName, listener: AdapterEventListener): void {
      const listeners = this.eventSubscribers.get(event);
      if (!listeners) return;
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.eventSubscribers.delete(event);
      }
    }

    addListener(event: AdapterEventName, listener: AdapterEventListener): () => void {
      return this.on(event, listener);
    }

    removeListener(event: AdapterEventName, listener: AdapterEventListener): void {
      this.off(event, listener);
    }

    subscribeEvent(event: AdapterEventName, listener: AdapterEventListener): () => void {
      return this.on(event, listener);
    }

    getState(): NativeBleAdapterState {
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

    getAllTelemetry(): BluTelemetry[] {
      return Array.from(this.telemetryByDeviceId.values()).map((item) => ({ ...item }));
    }

    getECSBridgeState() {
      const primaryDeviceId = this.getPrimaryDeviceId();
      const primaryDevice = primaryDeviceId
        ? bluDeviceRegistry.getDevice(config.provider, primaryDeviceId) ?? null
        : null;

      return {
        provider: config.provider,
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

    async scanForDevices(): Promise<NativeBleDiscoveredDevice[]> {
      if (Platform.OS === 'web') {
        return this.failScan('Bluetooth is unavailable on web.', 'PLATFORM_UNSUPPORTED');
      }

      const permissions = await ensureBlePermissions();
      if (!permissions.ok) {
        return this.failScan('Permission denied.', 'PERMISSION_DENIED');
      }

      let manager: any;
      try {
        manager = getBleManager();
      } catch (error) {
        const errorCode = detectErrorCode(error);
        return this.failScan(errorFromCode(errorCode), errorCode);
      }

      this.isScanning = true;
      this.lastError = null;
      this.lastErrorCode = null;
      this.notify();

      const seen = new Map<string, NativeBleDiscoveredDevice>();
      manager.stopDeviceScan?.();

      manager.startDeviceScan(
        null,
        { allowDuplicates: false },
        (error: unknown, device: any) => {
          if (error) {
            this.isScanning = false;
            this.setError(errorFromCode(detectErrorCode(error)), detectErrorCode(error));
            manager.stopDeviceScan?.();
            this.notify();
            return;
          }

          const name = String(device?.name ?? device?.localName ?? '').trim();
          if (!config.isSupportedDevice({
            name,
            manufacturerData: typeof device?.manufacturerData === 'string' ? device.manufacturerData : null,
            serviceUUIDs: Array.isArray(device?.serviceUUIDs) ? device.serviceUUIDs : null,
          })) {
            return;
          }

          const discovered: NativeBleDiscoveredDevice = {
            id: String(device?.id ?? ''),
            name: name || `${config.displayName} Device`,
            rssi: typeof device?.rssi === 'number' ? device.rssi : -90,
            model: config.getModelName?.(name) ?? undefined,
            serviceUUIDs: Array.isArray(device?.serviceUUIDs) ? [...device.serviceUUIDs] : undefined,
            manufacturerData: typeof device?.manufacturerData === 'string' ? device.manufacturerData : null,
          };

          if (discovered.id) {
            seen.set(discovered.id, discovered);
            this.discoveredDevices = Array.from(seen.values()).sort((a, b) => b.rssi - a.rssi);
            this.notify();
          }
        },
      );

      await new Promise((resolve) => setTimeout(resolve, BLE_SCAN_DURATION_MS));
      manager.stopDeviceScan?.();
      this.isScanning = false;

      if (this.discoveredDevices.length === 0 && !this.lastError) {
        this.setError('No supported devices found.', 'DEVICE_UNAVAILABLE');
      }

      this.notify();
      this.emitEvent('status', {
        meta: { phase: 'scan_complete', discoveredCount: this.discoveredDevices.length },
      });
      return [...this.discoveredDevices];
    }

    async connect(deviceId?: string): Promise<NativeBleConnectResult> {
      this.stopReconnectTimer();
      this.lastError = null;
      this.lastErrorCode = null;
      this.connectionState = 'connecting';
      if (this.isScanning) {
        try {
          const manager = getBleManager();
          manager.stopDeviceScan?.();
        } catch {
          // Best effort only.
        }
        this.isScanning = false;
      }
      this.notify();
      this.emitEvent('connect', { meta: { deviceId: deviceId ?? null } });

      if (Platform.OS === 'web') {
        return this.handleConnectError('Bluetooth is unavailable on web.', 'PLATFORM_UNSUPPORTED');
      }

      const target =
        this.discoveredDevices.find((item) => item.id === deviceId) ??
        (deviceId
          ? {
              id: deviceId,
              name: this.connectedDevices.find((item) => item.device_id === deviceId)?.display_name ?? `${config.displayName} Device`,
              rssi: -90,
              model: config.displayName,
            }
          : null) ??
        this.discoveredDevices[0] ??
        null;

      if (!target) {
        return this.handleConnectError('Start a device scan before connecting.', 'DEVICE_UNAVAILABLE');
      }

      const permissions = await ensureBlePermissions();
      if (!permissions.ok) {
        return this.handleConnectError('Permission denied.', 'PERMISSION_DENIED');
      }

      try {
        const manager = getBleManager();
        const device = await manager.connectToDevice(target.id, {
          requestMTU: 256,
          timeout: 15_000,
        });

        await device.discoverAllServicesAndCharacteristics();
        console.log('[BT_LIVE] device_connected', {
          provider: config.provider,
          deviceId: target.id,
          name: target.name,
        });
        this.connectedDeviceRef = device;
        this.attachDisconnectMonitor(device);

        const metadata = await this.readDeviceMetadata(device, target);
        const bluDevice: BluDevice = {
          provider: config.provider,
          device_id: target.id,
          display_name: target.name,
          model: metadata.model ?? target.model ?? config.displayName,
          connection_state: 'connected',
          last_seen: Date.now(),
          capabilities: config.capabilities,
          is_primary: false,
        };

        await bluDeviceRegistry.registerDevice({
          provider: bluDevice.provider,
          device_id: bluDevice.device_id,
          display_name: bluDevice.display_name,
          model: bluDevice.model,
          connection_state: 'connected',
          last_seen: Date.now(),
          capabilities: bluDevice.capabilities,
        });
        await bluDeviceRegistry.ensurePrimary(config.provider);

        this.connectedDevices = bluDeviceRegistry.getByProvider(config.provider);
        this.connectionState = 'connected';
        this.consecutiveFailures = 0;
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        bluStateStore.setReconnecting(false);
        bluSessionStore.recordConnection(config.provider, target.id);
        this.notify();

        await this.pollTelemetry(target.id);
        this.emitEvent('connected', { device: bluDevice, devices: [...this.connectedDevices] });
        return {
          success: true,
          device: bluDevice,
          devices: [...this.connectedDevices],
          error: null,
          errorCode: null,
        };
      } catch (error) {
        const errorCode = detectErrorCode(error);
        return this.handleConnectError(errorFromCode(errorCode), errorCode);
      }
    }

    async connectAll(): Promise<NativeBleConnectResult[]> {
      const first = this.discoveredDevices[0];
      if (!first) {
        return [this.handleConnectError('Start a device scan before connecting.', 'DEVICE_UNAVAILABLE')];
      }
      return [await this.connect(first.id)];
    }

    async disconnect(): Promise<void> {
      this.stopPolling();
      this.stopReconnectTimer();
      await this.disconnectNativeDevice();
      await bluDeviceRegistry.clearProvider(config.provider);
      this.connectionState = 'disconnected';
      this.connectedDevices = [];
      this.discoveredDevices = [];
      this.lastError = null;
      this.lastErrorCode = null;
      this.pollCount = 0;
      this.lastPollAt = null;
      this.isPaused = false;
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      bluStateStore.setReconnecting(false);
      bluStateStore.clearProviderTelemetry(config.provider);
      bluSessionStore.recordDisconnection();
      this.notify();
      this.emitEvent('disconnected', { meta: { requested: true } });
    }

    async refreshDevices(): Promise<NativeBleConnectResult> {
      await this.scanForDevices();
      return {
        success: true,
        device: this.connectedDevices[0] ?? null,
        devices: [...this.connectedDevices],
        error: null,
        errorCode: null,
      };
    }

    async restoreSession(): Promise<boolean> {
      if (!bluSessionStore.hasPreviousSession()) return false;
      const session = bluSessionStore.getSession();
      if (session.provider !== config.provider) return false;

      if (!session.primaryDeviceId) return false;

      const restored = await this.connect(session.primaryDeviceId);
      if (!restored.success) return false;

      if (session.primaryDeviceId) {
        await this.setPrimaryDevice(session.primaryDeviceId);
      }

      if (session.wasPolling) {
        this.startPolling(DEFAULT_POLL_INTERVAL_MS);
      }

      return true;
    }

    async setPrimaryDevice(deviceId: string): Promise<void> {
      await bluDeviceRegistry.setPrimary(config.provider, deviceId);
      this.connectedDevices = bluDeviceRegistry.getByProvider(config.provider);
      bluSessionStore.recordPrimaryDeviceChange(deviceId);
      await this.pollTelemetry(deviceId);
      this.notify();
    }

    startPolling(intervalMs: number = DEFAULT_POLL_INTERVAL_MS): void {
      this.stopPolling();
      this.currentPollInterval = intervalMs;
      this.isPaused = false;

      const tick = async () => {
        if (this.connectionState !== 'connected' && !this.isReconnecting) return;

        if (this.isPaused) {
          this.pollTimer = setTimeout(tick, BACKGROUND_POLL_INTERVAL_MS);
          return;
        }

        await this.pollConnectedDevices();
        this.pollTimer = setTimeout(tick, this.currentPollInterval);
      };

      void tick();
      bluSessionStore.recordPollingStarted();
    }

    stopPolling(): void {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
      bluSessionStore.recordPollingStopped();
    }

    async renameDevice(deviceId: string, newName: string): Promise<void> {
      const current = bluDeviceRegistry.getDevice(config.provider, deviceId);
      if (!current) return;

      await bluDeviceRegistry.registerDevice({
        provider: config.provider,
        device_id: deviceId,
        display_name: newName,
        model: current.model,
        connection_state: current.connection_state,
        last_seen: Date.now(),
        capabilities: current.capabilities,
      });

      this.connectedDevices = bluDeviceRegistry.getByProvider(config.provider);
      this.notify();
    }

    private attachAppLifecycle(): void {
      this.appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
        const active = state === 'active';
        this.isPaused = !active;
        if (active && this.connectionState === 'connected' && this.connectedDeviceRef) {
          void this.pollConnectedDevices();
        }
        this.notify();
      });
    }

    private notify(): void {
      const state = this.getState();
      for (const cb of this.subscribers) {
        try {
          cb(state);
        } catch {
          // Subscriber errors must never crash the adapter.
        }
      }
      this.emitEvent('status', {});
    }

    private emitEvent(
      type: AdapterEventName,
      extra: Omit<Partial<AdapterEventPayload>, 'type' | 'provider' | 'timestamp' | 'state'>,
    ): void {
      const payload: AdapterEventPayload = {
        type,
        provider: config.provider,
        timestamp: Date.now(),
        state: this.getState(),
        ...extra,
      };
      const listeners = this.eventSubscribers.get(type);
      if (!listeners) return;
      for (const listener of listeners) {
        try {
          listener(payload);
        } catch {
          // Listener errors must never crash the adapter.
        }
      }
    }

    private failScan(message: string, errorCode: string): NativeBleDiscoveredDevice[] {
      this.setError(message, errorCode);
      this.connectionState = 'error';
      this.discoveredDevices = [];
      this.notify();
      return [];
    }

    private handleConnectError(message: string, errorCode: string): NativeBleConnectResult {
      this.connectionState = 'error';
      this.setError(message, errorCode);
      this.notify();
      this.emitEvent('error', { error: message, errorCode });
      return {
        success: false,
        device: null,
        devices: [...this.connectedDevices],
        error: message,
        errorCode,
      };
    }

    private setError(message: string | null, errorCode: string | null): void {
      this.lastError = message;
      this.lastErrorCode = errorCode;
    }

    private getPrimaryDeviceId(): string | null {
      const primary = bluDeviceRegistry.getPrimary();
      if (primary?.provider === config.provider) return primary.device_id;
      return this.connectedDevices[0]?.device_id ?? null;
    }

    private async pollConnectedDevices(): Promise<void> {
      const targetIds =
        this.connectedDevices.map((device) => device.device_id).filter(Boolean).slice(0, 1);
      if (targetIds.length === 0) {
        const primary = this.getPrimaryDeviceId();
        if (primary) targetIds.push(primary);
      }
      for (const deviceId of targetIds) {
        await this.pollTelemetry(deviceId);
      }
    }

    async pollTelemetry(deviceId?: string): Promise<NativeBlePollResult> {
      const targetId = deviceId ?? this.getPrimaryDeviceId();
      if (!targetId || !this.connectedDeviceRef) {
        return { success: false, telemetry: null, error: 'No device available to poll.' };
      }

      try {
        const characteristicMap = await this.readAllReadableCharacteristics(this.connectedDeviceRef);
        const rssi = await this.readRssi(this.connectedDeviceRef);
        const discovered = this.discoveredDevices.find((item) => item.id === targetId) ?? {
          id: targetId,
          name: this.connectedDevices.find((item) => item.device_id === targetId)?.display_name ?? `${config.displayName} Device`,
          rssi: rssi ?? -90,
        };

        const standard = getStandardTelemetry({
          device: discovered,
          characteristicMap,
          previousTelemetry: this.telemetryByDeviceId.get(targetId) ?? null,
          rssi,
        });
        const vendorSpecific = config.decodeTelemetry?.({
          device: discovered,
          characteristicMap,
          previousTelemetry: this.telemetryByDeviceId.get(targetId) ?? null,
          rssi,
        });
        const merged = coalesceTelemetry(standard, vendorSpecific);
        const hasDecodedMetrics = hasDecodedBluetoothTelemetryMetrics(merged as Record<string, unknown>);
        const telemetry: BluTelemetry = {
          timestamp: Date.now(),
          provider: config.provider,
          device_id: targetId,
          source: 'ble_live',
          updatedAt: Date.now(),
          telemetrySourceLabel: getBluetoothTelemetrySourceLabel('ble_live'),
          isLive: hasDecodedMetrics,
          telemetryUnsupported: !hasDecodedMetrics,
          telemetryUnsupportedReason: hasDecodedMetrics
            ? undefined
            : 'Connected over Bluetooth; telemetry is not decoded for this model yet.',
          status_text: hasDecodedMetrics
            ? merged.status_text
            : 'Connected over Bluetooth; telemetry not yet decoded.',
          ...merged,
        };

        this.telemetryByDeviceId.set(targetId, telemetry);
        this.lastTelemetry = telemetry;
        this.pollCount += 1;
        this.lastPollAt = telemetry.timestamp;
        this.consecutiveFailures = 0;
        this.connectionState = 'connected';
        this.lastError = null;
        this.lastErrorCode = null;
        bluStateStore.ingestTelemetry(telemetry);
        await bluDeviceRegistry.updateConnectionState(config.provider, targetId, 'connected');
        bluStateStore.setReconnecting(false);
        this.notify();
        this.emitEvent('telemetry', { telemetry, device: bluDeviceRegistry.getDevice(config.provider, targetId) ?? null });
        this.emitEvent('data', { telemetry, device: bluDeviceRegistry.getDevice(config.provider, targetId) ?? null });
        console.log(hasDecodedMetrics ? '[BT_LIVE] telemetry_decoded' : '[BT_LIVE] telemetry_unsupported', {
          provider: config.provider,
          deviceId: targetId,
          readableCharacteristics: characteristicMap.size,
        });

        return { success: true, telemetry, error: null };
      } catch (error) {
        this.consecutiveFailures += 1;
        bluStateStore.recordPollFailure(String((error as any)?.message ?? error));
        if (targetId) {
          await bluDeviceRegistry.updateConnectionState(config.provider, targetId, 'error');
        }

        if (this.consecutiveFailures >= RECONNECT_THRESHOLD) {
          this.beginReconnect(targetId);
        } else {
          this.connectionState = 'error';
          this.setError(errorFromCode(detectErrorCode(error)), detectErrorCode(error));
          this.notify();
        }

        return {
          success: false,
          telemetry: this.telemetryByDeviceId.get(targetId) ?? null,
          error: String((error as any)?.message ?? error ?? 'Poll failed.'),
        };
      }
    }

    private beginReconnect(deviceId: string): void {
      if (this.isReconnecting) return;
      this.isReconnecting = true;
      this.connectionState = 'error';
      this.reconnectAttempts = 0;
      bluStateStore.setReconnecting(true);
      this.emitEvent('reconnecting', { device: bluDeviceRegistry.getDevice(config.provider, deviceId) ?? null });
      this.notify();
      this.scheduleReconnect(deviceId);
    }

    private scheduleReconnect(deviceId: string): void {
      this.stopReconnectTimer();
      this.reconnectAttempts += 1;
      this.emitEvent('reconnect_start', { device: bluDeviceRegistry.getDevice(config.provider, deviceId) ?? null });
      if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        this.isReconnecting = false;
        bluStateStore.setReconnecting(false);
        this.setError('Device unavailable.', 'DEVICE_UNAVAILABLE');
        this.emitEvent('reconnect_failed', { error: this.lastError, errorCode: this.lastErrorCode });
        this.notify();
        return;
      }

      this.reconnectTimer = setTimeout(() => {
        void this.reconnect(deviceId);
      }, RECONNECT_DELAY_MS);
    }

    private async reconnect(deviceId: string): Promise<void> {
      try {
        const result = await this.connect(deviceId);
        if (result.success) {
          this.isReconnecting = false;
          bluStateStore.setReconnecting(false);
          this.emitEvent('reconnect_success', { device: result.device, devices: result.devices });
          this.emitEvent('reconnected', { device: result.device, devices: result.devices });
          this.startPolling(this.currentPollInterval);
        } else {
          this.scheduleReconnect(deviceId);
        }
      } catch {
        this.scheduleReconnect(deviceId);
      }
    }

    private stopReconnectTimer(): void {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    }

    private async disconnectNativeDevice(): Promise<void> {
      const currentId = this.connectedDeviceRef?.id ?? this.getPrimaryDeviceId();
      try {
        this.disconnectSubscription?.remove?.();
      } catch {
        // Ignore subscription cleanup errors.
      }
      this.disconnectSubscription = null;

      if (this.connectedDeviceRef && currentId) {
        try {
          const manager = getBleManager();
          await manager.cancelDeviceConnection(currentId);
        } catch {
          // Ignore disconnect race conditions.
        }
      }
      this.connectedDeviceRef = null;
    }

    private attachDisconnectMonitor(device: BleManagerDevice): void {
      try {
        const manager = getBleManager();
        this.disconnectSubscription?.remove?.();
        this.disconnectSubscription = manager.onDeviceDisconnected(device.id, (_error: unknown) => {
          if (this.connectionState === 'disconnected') return;
          this.connectionState = 'error';
          this.setError('Device unavailable.', 'DEVICE_UNAVAILABLE');
          this.notify();
          this.beginReconnect(device.id);
        });
      } catch {
        // Best effort only.
      }
    }

    private async readDeviceMetadata(
      device: BleManagerDevice,
      fallback: NativeBleDiscoveredDevice,
    ): Promise<{ manufacturer: string | null; model: string | null; firmware: string | null }> {
      try {
        const characteristicMap = await this.readAllReadableCharacteristics(device, true);
        const manufacturer =
          decodeUtf8(readCharacteristic(characteristicMap, DEVICE_INFO_SERVICE_UUID, MANUFACTURER_NAME_UUID)?.valueBase64) ??
          fallback.manufacturer ??
          null;
        const model =
          decodeUtf8(readCharacteristic(characteristicMap, DEVICE_INFO_SERVICE_UUID, MODEL_NUMBER_UUID)?.valueBase64) ??
          fallback.model ??
          config.getModelName?.(fallback.name) ??
          null;
        const firmware =
          decodeUtf8(readCharacteristic(characteristicMap, DEVICE_INFO_SERVICE_UUID, FIRMWARE_REVISION_UUID)?.valueBase64) ??
          null;
        return { manufacturer, model, firmware };
      } catch {
        return {
          manufacturer: fallback.manufacturer ?? null,
          model: fallback.model ?? config.getModelName?.(fallback.name) ?? null,
          firmware: fallback.firmware ?? null,
        };
      }
    }

    private async readAllReadableCharacteristics(
      device: BleManagerDevice,
      metadataOnly = false,
    ): Promise<Map<string, CharacteristicSnapshot>> {
      const map = new Map<string, CharacteristicSnapshot>();
      const services = await device.services();
      console.log('[BT_LIVE] services_discovered', {
        provider: config.provider,
        deviceId: String(device?.id ?? ''),
        count: Array.isArray(services) ? services.length : 0,
        services: Array.isArray(services) ? services.map((service: any) => service?.uuid).filter(Boolean) : [],
        metadataOnly,
      });

      for (const service of services ?? []) {
        const serviceUuid = normalizeUuid(service?.uuid);
        if (!serviceUuid) continue;

        if (metadataOnly && serviceUuid !== DEVICE_INFO_SERVICE_UUID) {
          continue;
        }

        const characteristics = await device.characteristicsForService(service.uuid);
        for (const characteristic of characteristics ?? []) {
          const characteristicUuid = normalizeUuid(characteristic?.uuid);
          if (!characteristicUuid) continue;

          const canRead =
            characteristic?.isReadable === true ||
            characteristic?.properties?.Read === 'Read' ||
            characteristic?.properties?.read === true;

          if (!canRead) continue;

          try {
            const reading = await device.readCharacteristicForService(service.uuid, characteristic.uuid);
            console.log('[BT_LIVE] characteristic_update', {
              provider: config.provider,
              deviceId: String(device?.id ?? ''),
              serviceUuid,
              characteristicUuid,
              metadataOnly,
            });
            map.set(makeCharacteristicKey(service.uuid, characteristic.uuid), {
              serviceUuid,
              characteristicUuid,
              valueBase64: typeof reading?.value === 'string' ? reading.value : null,
            });
          } catch {
            // Ignore unreadable characteristics.
          }
        }
      }

      return map;
    }

    private async readRssi(device: BleManagerDevice): Promise<number | null> {
      try {
        const refreshed = await device.readRSSI();
        return typeof refreshed?.rssi === 'number' ? refreshed.rssi : null;
      } catch {
        return null;
      }
    }
  }

  return new NativeBleBluAdapter();
}

import { AppState, Platform, type AppStateStatus } from 'react-native';

import {
  getBleRuntimeUnsupportedMessage,
  isBleNativeModuleUnavailableError,
} from '../src/power/ble/BleScanReadiness';
import { ensureBlePermissions, type BlePermissionResult } from '../src/power/ble/BlePermissions';
import type {
  BluConnectionState,
  BluDevice,
  BluDeviceCapabilities,
  BluMultiDeviceCapability,
  BluStreamHealth,
  BluStreamState,
  BluProviderId,
  BluTelemetry,
} from './BluTypes';
import { bluDeviceRegistry } from './BluDeviceRegistry';
import { bluSessionStore } from './BluSessionStore';
import { bluStateStore } from './BluStateStore';
import { getBluetoothTelemetrySourceLabel, hasDecodedBluetoothTelemetryMetrics } from './bluetoothLiveTelemetry';
import { withBluPowerTelemetryEnvelope } from './bluTelemetryEnvelope';
import {
  bluLog,
  bluLogThrottled,
  buildBluConnectionAttemptLogDetails,
  buildBluDiscoveryLogDetails,
  buildBluTelemetryLogDetails,
  buildBluTimeoutLogDetails,
  getBluVendorPrefix,
} from './bluDiagnosticsLog';
import {
  BluStreamLifecycle,
  DEFAULT_FIRST_PACKET_TIMEOUT_MS,
  DEFAULT_STALE_AFTER_MS,
  clearBluStreamHealthSnapshot,
  mapBluStreamPhaseToConnectionStatus,
  mapBluStreamPhaseToTelemetryHealth,
} from './bluStreamLifecycle';
import {
  BLU_SCAN_COOLDOWN_MS,
  BLU_SCAN_WINDOW_MS,
} from './bluPerformanceConfig';
import {
  buildEcoFlowBleCharacteristicProbe,
  buildEcoFlowBleDecodedProtocolPacketCapture,
  buildEcoFlowBleProtocolFrameCapture,
  buildEcoFlowBleReplayCapture,
  detectEcoFlowBleProtocolSupport,
  ECOFLOW_BLE_PROTOCOL_CHARACTERISTICS,
  isEcoFlowBleReplayCaptureEnabled,
  recordEcoFlowBleProbeEvent,
  summarizeEcoFlowBleServices,
  type EcoFlowBleDecodedProtocolPacketCapture,
  type EcoFlowBleProtocolFrameCapture,
  type EcoFlowBleProtocolSupport,
  type EcoFlowBleServiceProbe,
} from './ecoflowBleDiagnosticCapture';
import {
  createEcoFlowBleSessionProbe,
  hasEcoFlowBleProbePrivateKeyConfigured,
  inferEcoFlowBlePacketVersionFromHints,
  isEcoFlowBleDynamicSessionProbeEnabled,
  type EcoFlowBleSessionProbeStep,
} from './ecoflowBleSessionProbe';
import { requestEcoFlowBleAuthPayload } from './ecoflowBleAuthBroker';

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const BACKGROUND_POLL_INTERVAL_MS = 60_000;
const BLE_SCAN_DURATION_MS = BLU_SCAN_WINDOW_MS;
const RECONNECT_THRESHOLD = 2;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 10_000;
const CONNECT_CANCELLED_RETRY_DELAY_MS = 1_200;
const CONNECT_CANCELLED_MAX_ATTEMPTS = 2;
const NATIVE_BLE_MULTI_DEVICE_LIMITATION_REASON =
  'Native BLE provider adapters currently maintain one active peripheral connection per provider instance; OBD2 and other providers can still run independently.';
const DEFAULT_ECOFLOW_BLE_NOTIFICATION_CAPTURE_MS = 1_200;
const DEFAULT_ECOFLOW_BLE_NOTIFICATION_CAPTURE_MAX_FRAMES = 16;
const ECOFLOW_BLE_NOTIFICATION_CAPTURE_MS_LIMIT = 30_000;
const ECOFLOW_BLE_NOTIFICATION_CAPTURE_MAX_FRAMES_LIMIT = 64;

function getEcoFlowBleAccountAuthStatusMessage(label: string | null | undefined): string {
  switch (label) {
    case 'authorized':
      return 'EcoFlow BLE account authorization accepted.';
    case 'wrong_key':
      return 'EcoFlow BLE account authorization was rejected: wrong user id, account, region, or device serial binding.';
    case 'need_refresh_token':
      return 'EcoFlow BLE account authorization was rejected: account token needs to be refreshed.';
    case 'device_already_bound':
      return 'EcoFlow BLE account authorization was rejected: device is already bound to another account.';
    case 'need_bind_install_first':
      return 'EcoFlow BLE account authorization was rejected: device needs to be bound in the EcoFlow app first.';
    case 'maximum_devices_error':
      return 'EcoFlow BLE account authorization was rejected: maximum devices limit reached.';
    case 'device_internal_error':
    case 'app_send_data_error':
    case 'unknown_error':
      return `EcoFlow BLE account authorization was rejected: ${label}.`;
    default:
      return 'EcoFlow BLE account authorization response was received.';
  }
}

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
  activeDeviceIds: string[];
  telemetryByDeviceId: Record<string, BluTelemetry>;
  streamsByDeviceId: Record<string, BluStreamState>;
  multiDeviceCapability: BluMultiDeviceCapability;
  multiDeviceCapabilityReason: string | null;
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
  serviceProbes?: EcoFlowBleServiceProbe[];
  protocolSupport?: EcoFlowBleProtocolSupport | null;
  decodedProtocolPackets?: EcoFlowBleDecodedProtocolPacketCapture[];
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactUuid(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/-/g, '');
}

function getEcoFlowBleProbeFramesFromEnv(): string[] {
  let raw: unknown = null;
  try {
    raw = (globalThis as Record<string, unknown>).__ECS_ECOFLOW_BLE_PROBE_BASE64;
  } catch {}
  try {
    raw =
      raw ??
      process.env?.EXPO_PUBLIC_ECS_ECOFLOW_BLE_PROBE_BASE64 ??
      process.env?.ECS_ECOFLOW_BLE_PROBE_BASE64;
  } catch {}

  return String(raw ?? '')
    .split(/[\s,;]+/g)
    .map((entry) => entry.trim())
    .filter((entry) => /^[A-Za-z0-9+/]+={0,2}$/.test(entry))
    .filter((entry) => entry.length > 0 && entry.length <= 256)
    .slice(0, 4);
}

function getNumberFromEnv(globalName: string, envNames: string[], fallback: number, min: number, max: number): number {
  let raw: unknown = null;
  try {
    raw = (globalThis as Record<string, unknown>)[globalName];
  } catch {}
  try {
    for (const envName of envNames) {
      raw = raw ?? process.env?.[envName];
    }
  } catch {}
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function boolFromEnv(globalName: string, envNames: string[]): boolean {
  let raw: unknown = null;
  try {
    raw = (globalThis as Record<string, unknown>)[globalName];
  } catch {}
  try {
    for (const envName of envNames) {
      raw = raw ?? process.env?.[envName];
    }
  } catch {}
  return raw === true || raw === '1' || raw === 'true';
}

function isEcoFlowBleVerboseSessionLoggingEnabled(): boolean {
  return boolFromEnv('__ECS_ECOFLOW_BLE_VERBOSE_SESSION_LOGS', [
    'EXPO_PUBLIC_ECS_ECOFLOW_BLE_VERBOSE_SESSION_LOGS',
    'ECS_ECOFLOW_BLE_VERBOSE_SESSION_LOGS',
  ]);
}

function getEcoFlowBleNotificationCaptureMs(): number {
  return getNumberFromEnv(
    '__ECS_ECOFLOW_BLE_NOTIFICATION_CAPTURE_MS',
    ['EXPO_PUBLIC_ECS_ECOFLOW_BLE_NOTIFICATION_CAPTURE_MS', 'ECS_ECOFLOW_BLE_NOTIFICATION_CAPTURE_MS'],
    DEFAULT_ECOFLOW_BLE_NOTIFICATION_CAPTURE_MS,
    500,
    ECOFLOW_BLE_NOTIFICATION_CAPTURE_MS_LIMIT,
  );
}

function getEcoFlowBleNotificationCaptureMaxFrames(): number {
  return getNumberFromEnv(
    '__ECS_ECOFLOW_BLE_NOTIFICATION_CAPTURE_MAX_FRAMES',
    ['EXPO_PUBLIC_ECS_ECOFLOW_BLE_NOTIFICATION_CAPTURE_MAX_FRAMES', 'ECS_ECOFLOW_BLE_NOTIFICATION_CAPTURE_MAX_FRAMES'],
    DEFAULT_ECOFLOW_BLE_NOTIFICATION_CAPTURE_MAX_FRAMES,
    1,
    ECOFLOW_BLE_NOTIFICATION_CAPTURE_MAX_FRAMES_LIMIT,
  );
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
    case 'CONNECT_CANCELLED':
      return 'Connection cancelled.';
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
  if (message.includes('operation was cancelled') || message.includes('operation was canceled')) {
    return 'CONNECT_CANCELLED';
  }
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
    private scanPromise: Promise<NativeBleDiscoveredDevice[]> | null = null;
    private lastScanFinishedAt = 0;
    private isPaused = false;
    private isScanning = false;
    private consecutiveFailures = 0;
    private isReconnecting = false;
    private reconnectAttempts = 0;
    private manualDisconnectRequested = false;
    private pollingGeneration = 0;
    private subscribers = new Set<AdapterSubscriber>();
    private eventSubscribers = new Map<AdapterEventName, Set<AdapterEventListener>>();
    private telemetryByDeviceId = new Map<string, BluTelemetry>();
    private lastTelemetry: BluTelemetry | null = null;
    private connectedDeviceRef: BleManagerDevice | null = null;
    private disconnectSubscription: BleManagerSubscription = null;
    private appStateSubscription: { remove?: () => void } | null = null;
    private currentPollInterval = DEFAULT_POLL_INTERVAL_MS;
    private streamLifecycles = new Map<string, BluStreamLifecycle>();
    private pollingDeviceIds = new Set<string>();

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
        connectedDevices: this.getProviderConnectedDevices(),
        activeDeviceIds: this.getActiveDeviceIds(),
        telemetryByDeviceId: this.getTelemetryByDeviceObject(),
        streamsByDeviceId: this.getStreamsByDeviceId(),
        multiDeviceCapability: 'limited',
        multiDeviceCapabilityReason: NATIVE_BLE_MULTI_DEVICE_LIMITATION_REASON,
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

    private getActiveDeviceIds(): string[] {
      return this.getProviderConnectedDevices()
        .map((device) => device.device_id)
        .filter(Boolean);
    }

    private getProviderConnectedDevices(): BluDevice[] {
      const connected = this.connectedDevices.filter((device) => device.connection_state === 'connected');
      const nativeDeviceId = this.getNativeConnectedDeviceId();
      if (!nativeDeviceId) return connected;
      return connected.filter((device) => device.device_id === nativeDeviceId);
    }

    private getTelemetryByDeviceObject(): Record<string, BluTelemetry> {
      return Object.fromEntries(
        Array.from(this.telemetryByDeviceId.entries()).map(([deviceId, telemetry]) => [
          deviceId,
          { ...telemetry },
        ]),
      );
    }

    private getStreamStaleAfterMs(): number {
      return Math.max(DEFAULT_STALE_AFTER_MS, this.currentPollInterval * 2);
    }

    private buildFallbackStreamHealth(deviceId: string, telemetry: BluTelemetry | null): BluStreamHealth {
      const lastPacketAt = telemetry?.updatedAt ?? telemetry?.timestamp ?? undefined;
      const phase =
        telemetry?.telemetryUnsupported
          ? 'failed'
          : telemetry?.isLive
            ? 'streaming'
            : this.connectionState === 'connected'
              ? 'awaitingFirstPacket'
              : this.connectionState === 'error'
                ? 'failed'
                : 'stopped';
      return {
        phase,
        firstPacketAt: lastPacketAt,
        lastPacketAt,
        packetCount: lastPacketAt ? 1 : 0,
        staleAfterMs: this.getStreamStaleAfterMs(),
        reconnectAttempts: this.reconnectAttempts,
        lastError:
          telemetry?.telemetryUnsupported || this.lastError
            ? {
                phase: telemetry?.telemetryUnsupported ? 'telemetry_setup' : 'native_ble',
                code: telemetry?.telemetryUnsupported ? 'TELEMETRY_UNSUPPORTED' : this.lastErrorCode ?? undefined,
                message:
                  telemetry?.telemetryUnsupportedReason ??
                  this.lastError ??
                  'Telemetry stream is unavailable.',
              }
            : undefined,
      };
    }

    private getStreamsByDeviceId(): Record<string, BluStreamState> {
      const now = Date.now();
      const ids = new Set<string>([
        ...this.getActiveDeviceIds(),
        ...this.telemetryByDeviceId.keys(),
        ...this.streamLifecycles.keys(),
      ]);

      return Object.fromEntries(
        Array.from(ids).map((deviceId) => {
          const telemetry = this.telemetryByDeviceId.get(deviceId) ?? null;
          const envelope = telemetry?.bluTelemetryEnvelope;
          const lifecycleHealth = this.streamLifecycles.get(deviceId)?.getHealth();
          const streamHealth = lifecycleHealth ?? this.buildFallbackStreamHealth(deviceId, telemetry);
          const health = mapBluStreamPhaseToTelemetryHealth(streamHealth.phase, {
            lastPacketAt: streamHealth.lastPacketAt,
            staleAfterMs: streamHealth.staleAfterMs,
            now,
            source: envelope?.source ?? (telemetry?.source === 'ble_live' ? 'local-ble' : 'unknown'),
          });
          const stream: BluStreamState = {
            deviceId,
            provider: config.provider,
            phase: streamHealth.phase,
            streamHealth,
            connectionStatus:
              lifecycleHealth
                ? mapBluStreamPhaseToConnectionStatus(streamHealth.phase)
                : envelope?.connectionStatus ??
                  (this.connectionState === 'connected'
                    ? telemetry
                      ? 'streaming'
                      : 'connected'
                    : this.connectionState === 'connecting'
                      ? 'connecting'
                      : this.connectionState === 'error'
                        ? 'failed'
                        : 'disconnected'),
            health: lifecycleHealth ? health : envelope?.health ?? health,
            source: envelope?.source ?? (telemetry?.source === 'ble_live' ? 'local-ble' : 'unknown'),
            lastPacketAt: streamHealth.lastPacketAt ?? telemetry?.updatedAt ?? telemetry?.timestamp ?? null,
            staleAfterMs: streamHealth.staleAfterMs,
            updatedAt: telemetry?.updatedAt ?? telemetry?.timestamp ?? now,
            error: streamHealth.lastError
              ? {
                  phase: streamHealth.lastError.phase,
                  code: streamHealth.lastError.code,
                  message: streamHealth.lastError.message,
                }
              : envelope?.error,
          };
          return [deviceId, stream];
        }),
      );
    }

    private ensureStreamLifecycle(deviceId: string): BluStreamLifecycle {
      const existing = this.streamLifecycles.get(deviceId);
      if (existing) return existing;

      const lifecycle = new BluStreamLifecycle({
        deviceId,
        vendor: config.provider,
        deviceType: config.displayName,
        source: 'local-ble',
        streamMode: 'provider_poll',
        staleAfterMs: this.getStreamStaleAfterMs(),
        firstPacketTimeoutMs: DEFAULT_FIRST_PACKET_TIMEOUT_MS,
        maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
        onPhaseChange: () => this.notify(),
        onRecover: async () => {
          if (this.connectionState === 'connected' && this.connectedDeviceRef) {
            await this.pollTelemetry(deviceId);
          }
        },
        onFailed: (health) => {
          this.setError(
            health.lastError?.message ?? 'Telemetry stream failed.',
            health.lastError?.code ?? 'STREAM_FAILED',
          );
          this.notify();
        },
      });
      this.streamLifecycles.set(deviceId, lifecycle);
      return lifecycle;
    }

    private stopStreamLifecycle(deviceId: string, reason: string): void {
      const lifecycle = this.streamLifecycles.get(deviceId);
      if (lifecycle) {
        lifecycle.stop(reason);
        this.streamLifecycles.delete(deviceId);
      }
      clearBluStreamHealthSnapshot(deviceId, config.provider);
    }

    private stopAllStreamLifecycles(reason: string): void {
      for (const deviceId of Array.from(this.streamLifecycles.keys())) {
        this.stopStreamLifecycle(deviceId, reason);
      }
      this.pollingDeviceIds.clear();
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
        connectedDevices: this.getProviderConnectedDevices(),
        discoveredDevices: [...this.discoveredDevices],
        telemetry: this.getLastTelemetry(),
        telemetryByDeviceId: this.getTelemetryByDeviceObject(),
        streamsByDeviceId: this.getStreamsByDeviceId(),
        activeDeviceIds: this.getActiveDeviceIds(),
        multiDeviceCapability: 'limited' as BluMultiDeviceCapability,
        multiDeviceCapabilityReason: NATIVE_BLE_MULTI_DEVICE_LIMITATION_REASON,
      };
    }

    async scanForDevices(): Promise<NativeBleDiscoveredDevice[]> {
      if (this.scanPromise) {
        return this.scanPromise;
      }

      const now = Date.now();
      if (this.lastScanFinishedAt > 0 && now - this.lastScanFinishedAt < BLU_SCAN_COOLDOWN_MS) {
        bluLogThrottled('[BLU_SCAN]', `${config.provider}:scan-cooldown`, 'native_ble_vendor_scan_suppressed_cooldown', {
          vendor: config.provider,
          providerName: config.displayName,
          cooldownMs: BLU_SCAN_COOLDOWN_MS,
          elapsedMs: now - this.lastScanFinishedAt,
        }, BLU_SCAN_COOLDOWN_MS);
        return [...this.discoveredDevices];
      }

      this.scanPromise = this.runScanForDevices().finally(() => {
        this.scanPromise = null;
        this.lastScanFinishedAt = Date.now();
      });
      return this.scanPromise;
    }

    rememberDiscoveredDevice(device: NativeBleDiscoveredDevice): void {
      const id = String(device.id ?? '').trim();
      if (!id) return;

      const existing = this.discoveredDevices.find((candidate) => candidate.id === id);
      const next: NativeBleDiscoveredDevice = {
        ...existing,
        ...device,
        id,
        name: String(device.name ?? existing?.name ?? `${config.displayName} Device`).trim() || `${config.displayName} Device`,
        rssi: Number.isFinite(device.rssi) ? device.rssi : existing?.rssi ?? -90,
        serviceUUIDs: Array.from(new Set([
          ...(existing?.serviceUUIDs ?? []),
          ...(device.serviceUUIDs ?? []),
        ])),
        manufacturerData: device.manufacturerData ?? existing?.manufacturerData ?? null,
      };

      this.discoveredDevices = [
        ...this.discoveredDevices.filter((candidate) => candidate.id !== id),
        next,
      ].sort((left, right) => right.rssi - left.rssi);
      this.notify();
    }

    private async runScanForDevices(): Promise<NativeBleDiscoveredDevice[]> {
      if (Platform.OS === 'web') {
        bluLog(getBluVendorPrefix(config.provider), 'native_ble_scan_blocked', {
          vendor: config.provider,
          phase: 'scan_readiness',
          errorCode: 'PLATFORM_UNSUPPORTED',
          message: 'Bluetooth is unavailable on web.',
        });
        return this.failScan('Bluetooth is unavailable on web.', 'PLATFORM_UNSUPPORTED');
      }

      bluLog('[BLU_SCAN]', 'native_ble_vendor_permission_start', {
        vendor: config.provider,
        providerName: config.displayName,
        phase: 'scan_permission',
      });
      let permissions: BlePermissionResult;
      try {
        permissions = await ensureBlePermissions();
      } catch (error) {
        const message = String((error as any)?.message ?? error ?? 'Permission check failed.');
        bluLog('[BLU_SCAN]', 'native_ble_vendor_permission_error', {
          vendor: config.provider,
          providerName: config.displayName,
          phase: 'scan_permission',
          errorCode: 'PERMISSION_ERROR',
          message,
        });
        return this.failScan('Permission denied.', 'PERMISSION_DENIED');
      }
      bluLog('[BLU_SCAN]', 'native_ble_vendor_permission_result', {
        vendor: config.provider,
        providerName: config.displayName,
        phase: 'scan_permission',
        ok: permissions.ok,
        missing: permissions.missing,
      });
      if (!permissions.ok) {
        bluLog(getBluVendorPrefix(config.provider), 'native_ble_scan_blocked', {
          vendor: config.provider,
          phase: 'scan_permission',
          errorCode: 'PERMISSION_DENIED',
          message: 'Permission denied.',
          missing: permissions.missing,
        });
        return this.failScan('Permission denied.', 'PERMISSION_DENIED');
      }

      let manager: any;
      try {
        manager = getBleManager();
      } catch (error) {
        const errorCode = detectErrorCode(error);
        const message = String((error as any)?.message ?? errorFromCode(errorCode));
        bluLog('[BLU_SCAN]', 'native_ble_vendor_manager_unavailable', {
          vendor: config.provider,
          providerName: config.displayName,
          phase: 'scan_readiness',
          errorCode,
          message,
        });
        return this.failScan(errorCode === 'PLATFORM_UNSUPPORTED' ? message : errorFromCode(errorCode), errorCode);
      }

      this.isScanning = true;
      this.lastError = null;
      this.lastErrorCode = null;
      this.notify();
      bluLog('[BLU_SCAN]', 'native_ble_vendor_scan_start', {
        vendor: config.provider,
        providerName: config.displayName,
        durationMs: BLE_SCAN_DURATION_MS,
        connectionMode: 'ble',
      });

      const seen = new Map<string, NativeBleDiscoveredDevice>();
      manager.stopDeviceScan?.();

      manager.startDeviceScan(
        null,
        { allowDuplicates: false },
        (error: unknown, device: any) => {
          if (error) {
            this.isScanning = false;
            this.setError(errorFromCode(detectErrorCode(error)), detectErrorCode(error));
            bluLog('[BLU_SCAN]', 'native_ble_vendor_scan_error', {
              vendor: config.provider,
              phase: 'device_callback',
              errorCode: detectErrorCode(error),
              message: errorFromCode(detectErrorCode(error)),
            });
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
            bluLogThrottled(
              '[BLU_SCAN]',
              `${config.provider}:scan:${discovered.id}`,
              'vendor_device_discovered',
              buildBluDiscoveryLogDetails({
                id: discovered.id,
                name: discovered.name,
                localName: name,
                manufacturerData: discovered.manufacturerData,
                serviceUUIDs: discovered.serviceUUIDs,
                rssi: discovered.rssi,
                classifiedVendor: config.provider,
                classifiedType: discovered.model ?? 'power_device',
                confidence: 0.65,
              }),
              10_000,
            );
            bluLogThrottled(
              getBluVendorPrefix(config.provider),
              `${config.provider}:classify:${discovered.id}`,
              'vendor_device_classified',
              {
                ...buildBluDiscoveryLogDetails({
                  id: discovered.id,
                  name: discovered.name,
                  localName: name,
                  manufacturerData: discovered.manufacturerData,
                  serviceUUIDs: discovered.serviceUUIDs,
                  rssi: discovered.rssi,
                  classifiedVendor: config.provider,
                  classifiedType: discovered.model ?? 'power_device',
                  confidence: 0.65,
                }),
                driverMode: config.decodeTelemetry ? 'local_ble_driver' : 'local_ble_incomplete',
              },
              10_000,
            );
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
      bluLog('[BLU_SCAN]', 'native_ble_vendor_scan_complete', {
        vendor: config.provider,
        providerName: config.displayName,
        discoveredCount: this.discoveredDevices.length,
        durationMs: BLE_SCAN_DURATION_MS,
      });
      return [...this.discoveredDevices];
    }

    async connect(deviceId?: string): Promise<NativeBleConnectResult> {
      this.stopReconnectTimer();
      this.manualDisconnectRequested = false;
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
      bluLog('[BLU_CONNECT]', 'native_ble_vendor_connect_start', buildBluConnectionAttemptLogDetails({
        deviceId: deviceId ?? null,
        vendor: config.provider,
        deviceType: config.displayName,
        connectionMode: 'ble',
        startedAt: Date.now(),
        timeoutMs: 15_000,
        attempt: 1,
        driverMode: config.decodeTelemetry ? 'local_ble_driver' : 'local_ble_incomplete',
      }));

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

      bluLog('[BLU_CONNECT]', 'native_ble_vendor_permission_start', {
        deviceId: target.id,
        vendor: config.provider,
        providerName: config.displayName,
        phase: 'connect_permission',
      });
      const permissions = await ensureBlePermissions();
      bluLog('[BLU_CONNECT]', 'native_ble_vendor_permission_result', {
        deviceId: target.id,
        vendor: config.provider,
        providerName: config.displayName,
        phase: 'connect_permission',
        ok: permissions.ok,
        missing: permissions.missing,
      });
      if (!permissions.ok) {
        return this.handleConnectError('Permission denied.', 'PERMISSION_DENIED');
      }

      try {
        const manager = getBleManager();
        const previousDeviceId = this.connectedDeviceRef?.id
          ? String(this.connectedDeviceRef.id)
          : null;
        if (previousDeviceId && previousDeviceId !== target.id) {
          bluLog('[BLU_CONNECT]', 'native_ble_vendor_single_connection_replace', {
            deviceId: target.id,
            previousDeviceId,
            vendor: config.provider,
            providerName: config.displayName,
            multiDeviceCapability: 'limited',
            reason: NATIVE_BLE_MULTI_DEVICE_LIMITATION_REASON,
          });
          await this.disconnectNativeDevice();
          this.stopStreamLifecycle(previousDeviceId, 'native_ble_provider_replaced_device');
          this.telemetryByDeviceId.delete(previousDeviceId);
          bluStateStore.clearDeviceTelemetry(
            config.provider,
            previousDeviceId,
            `${config.displayName} switched to another BLE device.`,
          );
          await bluDeviceRegistry.updateConnectionState(config.provider, previousDeviceId, 'disconnected');
        }
        let device: BleManagerDevice | null = null;
        for (let attempt = 1; attempt <= CONNECT_CANCELLED_MAX_ATTEMPTS; attempt += 1) {
          try {
            device = await manager.connectToDevice(target.id, {
              requestMTU: 256,
              timeout: 15_000,
            });
            break;
          } catch (error) {
            const attemptErrorCode = detectErrorCode(error);
            const attemptMessage = String((error as any)?.message ?? errorFromCode(attemptErrorCode));
            const canRetry =
              attemptErrorCode === 'CONNECT_CANCELLED' &&
              attempt < CONNECT_CANCELLED_MAX_ATTEMPTS &&
              !this.manualDisconnectRequested;
            if (!canRetry) throw error;
            bluLog('[BLU_CONNECT]', 'native_ble_vendor_connect_cancelled_retry', {
              deviceId: target.id,
              vendor: config.provider,
              providerName: config.displayName,
              phase: 'native_ble_connect',
              attempt,
              nextAttempt: attempt + 1,
              delayMs: CONNECT_CANCELLED_RETRY_DELAY_MS,
              errorCode: attemptErrorCode,
              message: attemptMessage,
            });
            try {
              await manager.cancelDeviceConnection?.(target.id);
            } catch {
              // Best effort cleanup before retrying the Android BLE transport.
            }
            await delay(CONNECT_CANCELLED_RETRY_DELAY_MS);
          }
        }
        if (!device) {
          return this.handleConnectError('Device unavailable.', 'DEVICE_UNAVAILABLE');
        }

        await device.discoverAllServicesAndCharacteristics();
        bluLog('[BLU_HANDSHAKE]', 'native_ble_vendor_services_discovered', {
          deviceId: target.id,
          vendor: config.provider,
          providerName: config.displayName,
          phase: 'service_discovery',
          connectionMode: 'ble',
        });
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
        this.ensureStreamLifecycle(target.id).start();
        this.notify();

        await this.pollTelemetry(target.id);
        bluLog('[BLU_HANDSHAKE]', 'native_ble_vendor_connect_succeeded', {
          deviceId: target.id,
          vendor: config.provider,
          providerName: config.displayName,
          phase: 'first_poll_attempted',
          connectionMode: 'ble',
        });
        this.emitEvent('connected', { device: bluDevice, devices: this.getProviderConnectedDevices() });
        return {
          success: true,
          device: bluDevice,
          devices: this.getProviderConnectedDevices(),
          error: null,
          errorCode: null,
        };
      } catch (error) {
        const errorCode = detectErrorCode(error);
        const errorMessage = String((error as any)?.message ?? errorFromCode(errorCode));
        const timeoutLike = /timeout|timed out|unavailable/i.test(errorMessage) || errorCode === 'DEVICE_UNAVAILABLE';
        bluLog(timeoutLike ? '[BLU_TIMEOUT]' : getBluVendorPrefix(config.provider), 'native_ble_vendor_connect_failed', timeoutLike
          ? buildBluTimeoutLogDetails({
              deviceId: deviceId ?? null,
              vendor: config.provider,
              phase: 'native_ble_connect',
              timeoutMs: 15_000,
              lastSuccessfulPhase: 'connect_requested',
              lastPacketAt: this.lastPollAt,
              errorCode,
              message: errorMessage,
            })
          : {
              deviceId: deviceId ?? null,
              vendor: config.provider,
              phase: 'native_ble_connect',
              errorCode,
              message: errorMessage,
            });
        return this.handleConnectError(errorFromCode(errorCode), errorCode);
      }
    }

    async connectAll(): Promise<NativeBleConnectResult[]> {
      const first = this.discoveredDevices[0];
      if (!first) {
        return [this.handleConnectError('Start a device scan before connecting.', 'DEVICE_UNAVAILABLE')];
      }
      if (this.discoveredDevices.length > 1) {
        bluLog('[BLU_CONNECT]', 'native_ble_vendor_connect_all_limited', {
          vendor: config.provider,
          providerName: config.displayName,
          requestedDeviceCount: this.discoveredDevices.length,
          connectedDeviceCount: 1,
          multiDeviceCapability: 'limited',
          reason: NATIVE_BLE_MULTI_DEVICE_LIMITATION_REASON,
        });
      }
        return [await this.connect(first.id)];
    }

    async disconnect(): Promise<void> {
      this.manualDisconnectRequested = true;
      bluLog('[BLU_DISCONNECT]', 'native_ble_vendor_disconnect_start', {
        deviceId: this.connectedDeviceRef?.id ?? this.getPrimaryDeviceId(),
        vendor: config.provider,
        providerName: config.displayName,
        connectionMode: 'ble',
      });
      this.stopPolling();
      this.stopReconnectTimer();
      await this.disconnectNativeDevice();
      await bluDeviceRegistry.clearProvider(config.provider);
      this.connectionState = 'disconnected';
      this.connectedDevices = [];
      this.discoveredDevices = [];
      this.telemetryByDeviceId.clear();
      this.lastTelemetry = null;
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
      bluLog('[BLU_DISCONNECT]', 'native_ble_vendor_disconnect_succeeded', {
        vendor: config.provider,
        providerName: config.displayName,
        connectionMode: 'ble',
      });
    }

    async refreshDevices(): Promise<NativeBleConnectResult> {
      await this.scanForDevices();
      const connected = this.getProviderConnectedDevices();
      return {
        success: true,
        device: connected[0] ?? null,
        devices: connected,
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
      this.stopPolling(false);
      this.currentPollInterval = intervalMs;
      this.isPaused = false;
      const pollingGeneration = ++this.pollingGeneration;

      const tick = async () => {
        if (pollingGeneration !== this.pollingGeneration || this.manualDisconnectRequested) return;
        if (this.connectionState !== 'connected' && !this.isReconnecting) return;

        if (this.isPaused) {
          if (pollingGeneration === this.pollingGeneration && !this.manualDisconnectRequested) {
            this.pollTimer = setTimeout(tick, BACKGROUND_POLL_INTERVAL_MS);
          }
          return;
        }

        await this.pollConnectedDevices();
        if (pollingGeneration === this.pollingGeneration && !this.manualDisconnectRequested) {
          this.pollTimer = setTimeout(tick, this.currentPollInterval);
        }
      };

      void tick();
      bluSessionStore.recordPollingStarted();
      bluLog('[BLU_STREAM]', 'native_ble_vendor_polling_start', {
        vendor: config.provider,
        providerName: config.displayName,
        streamMode: 'provider_poll',
        intervalMs,
      });
    }

    stopPolling(stopStreams: boolean = true): void {
      this.pollingGeneration += 1;
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
      if (stopStreams) {
        this.stopAllStreamLifecycles('polling_stopped');
      }
      bluSessionStore.recordPollingStopped();
      bluLog('[BLU_DISCONNECT]', 'native_ble_vendor_polling_stop', {
        vendor: config.provider,
        providerName: config.displayName,
        streamMode: 'provider_poll',
      });
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
      bluLog(/timeout|timed out|unavailable/i.test(message) ? '[BLU_TIMEOUT]' : getBluVendorPrefix(config.provider), 'native_ble_vendor_connect_error', /timeout|timed out|unavailable/i.test(message)
        ? buildBluTimeoutLogDetails({
            deviceId: null,
            vendor: config.provider,
            phase: 'native_ble_connect',
            timeoutMs: 15_000,
            lastSuccessfulPhase: 'connect_requested',
            lastPacketAt: this.lastPollAt,
            errorCode,
            message,
          })
        : {
            deviceId: null,
            vendor: config.provider,
            phase: 'native_ble_connect',
            errorCode,
            message,
          });
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
      const nativeDeviceId = this.getNativeConnectedDeviceId();
      if (nativeDeviceId) return nativeDeviceId;
      const primary = bluDeviceRegistry.getPrimary();
      if (primary?.provider === config.provider) return primary.device_id;
      return this.connectedDevices[0]?.device_id ?? null;
    }

    private getNativeConnectedDeviceId(): string | null {
      const id = this.connectedDeviceRef?.id;
      return typeof id === 'string' && id.trim().length > 0 ? id : null;
    }

    private resolveNativePollTargetId(requestedId: string | null | undefined): string | null {
      const nativeDeviceId = this.getNativeConnectedDeviceId();
      if (!nativeDeviceId) return requestedId ?? this.getPrimaryDeviceId();
      if (requestedId && requestedId !== nativeDeviceId) {
        bluLogThrottled(
          '[BLU_STREAM]',
          `${config.provider}:native-poll-alias:${requestedId}:${nativeDeviceId}`,
          'native_ble_vendor_poll_alias_rerouted',
          {
            requestedDeviceId: requestedId,
            deviceId: nativeDeviceId,
            vendor: config.provider,
            providerName: config.displayName,
            phase: 'telemetry_poll',
            reason: 'Native BLE adapter has one active peripheral; polling uses the connected BLE device id.',
          },
          30_000,
        );
      }
      return nativeDeviceId;
    }

    private async pollConnectedDevices(): Promise<void> {
      const targetIds =
        this.connectedDevices
          .filter((device) => device.connection_state === 'connected')
          .map((device) => device.device_id)
          .filter(Boolean)
          .slice(0, 1);
      if (targetIds.length === 0) {
        const primary = this.getPrimaryDeviceId();
        if (primary) targetIds.push(primary);
      }
      for (const deviceId of targetIds) {
        await this.pollTelemetry(deviceId);
      }
    }

    async pollTelemetry(deviceId?: string): Promise<NativeBlePollResult> {
      const targetId = this.resolveNativePollTargetId(deviceId ?? this.getPrimaryDeviceId());
      if (!targetId || !this.connectedDeviceRef) {
        return { success: false, telemetry: null, error: 'No device available to poll.' };
      }
      if (this.pollingDeviceIds.has(targetId)) {
        return {
          success: false,
          telemetry: this.telemetryByDeviceId.get(targetId) ?? null,
          error: 'Poll already in progress.',
        };
      }

      const lifecycle = this.ensureStreamLifecycle(targetId);
      const lifecyclePhase = lifecycle.getHealth().phase;
      if (lifecyclePhase === 'idle' || lifecyclePhase === 'stopped' || lifecyclePhase === 'failed') {
        lifecycle.start();
      }
      this.pollingDeviceIds.add(targetId);
      try {
        const characteristicMap = await this.readAllReadableCharacteristics(this.connectedDeviceRef);
        const rssi = await this.readRssi(this.connectedDeviceRef);
        const discovered = this.discoveredDevices.find((item) => item.id === targetId) ?? {
          id: targetId,
          name: this.connectedDevices.find((item) => item.device_id === targetId)?.display_name ?? `${config.displayName} Device`,
          rssi: rssi ?? -90,
        };
        const serviceProbes =
          config.provider === 'ecoflow'
            ? await this.probeEcoFlowBleServices(this.connectedDeviceRef, targetId, discovered)
            : [];
        const protocolSupport =
          config.provider === 'ecoflow'
            ? detectEcoFlowBleProtocolSupport(serviceProbes)
            : null;

        const ecoFlowReplayCaptureEnabled =
          config.provider === 'ecoflow' && isEcoFlowBleReplayCaptureEnabled();
        const ecoFlowDynamicSessionProbeEnabled =
          config.provider === 'ecoflow' &&
          (isEcoFlowBleDynamicSessionProbeEnabled() || hasEcoFlowBleProbePrivateKeyConfigured());
        const ecoFlowProtocolSamplingEnabled =
          config.provider === 'ecoflow' &&
          protocolSupport?.hasAnyProtocolPair === true &&
          (ecoFlowReplayCaptureEnabled || ecoFlowDynamicSessionProbeEnabled);
        if (
          config.provider === 'ecoflow' &&
          protocolSupport?.hasAnyProtocolPair &&
          !ecoFlowProtocolSamplingEnabled
        ) {
          bluLogThrottled(
            '[BLU_HANDSHAKE]',
            `ecoflow-ble-session-probe-disabled:${targetId}`,
            'ecoflow_ble_session_probe_disabled',
            {
              deviceId: targetId,
              vendor: config.provider,
              providerName: config.displayName,
              phase: 'notification_capture',
              protocolStatus: protocolSupport.protocolStatus,
              message: 'EcoFlow BLE session negotiation was explicitly disabled for this build.',
            },
            30_000,
          );
        }

        const protocolCapture =
          ecoFlowProtocolSamplingEnabled
            ? await this.sampleEcoFlowBleProtocolNotifications(this.connectedDeviceRef, targetId, serviceProbes)
            : { frames: [], decodedPackets: [] };

        if (ecoFlowReplayCaptureEnabled) {
          const capture = buildEcoFlowBleReplayCapture({
            deviceId: discovered.id,
            displayName: discovered.name,
            localName: discovered.name,
            model: discovered.model,
            providerId: config.provider,
            providerLabel: config.displayName,
            serviceUuids: discovered.serviceUUIDs ?? [],
            manufacturerData: discovered.manufacturerData ?? null,
            rssi,
            characteristicMap,
            services: serviceProbes,
            protocolFrames: protocolCapture.frames,
            decodedProtocolPackets: protocolCapture.decodedPackets,
          });
          console.log('[ECOFLOW_BLE_REPLAY_CAPTURE]', JSON.stringify(capture));
        }

        const standard = getStandardTelemetry({
          device: discovered,
          characteristicMap,
          previousTelemetry: this.telemetryByDeviceId.get(targetId) ?? null,
          rssi,
        });
        const vendorSpecific = config.decodeTelemetry?.({
          device: discovered,
          characteristicMap,
          serviceProbes,
          protocolSupport,
          decodedProtocolPackets: protocolCapture.decodedPackets,
          previousTelemetry: this.telemetryByDeviceId.get(targetId) ?? null,
          rssi,
        });
        let merged = coalesceTelemetry(standard, vendorSpecific);
        const hasDecodedMetrics = hasDecodedBluetoothTelemetryMetrics(merged as Record<string, unknown>);
        if (config.provider === 'ecoflow' && protocolSupport) {
          merged = coalesceTelemetry(merged, {
            raw: {
              ecoflowBleProtocol: protocolSupport,
              ...(!hasDecodedMetrics ? { parserStatus: protocolSupport.protocolStatus } : {}),
            },
          });
        }
        const telemetry: BluTelemetry = withBluPowerTelemetryEnvelope({
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
        });

        if (hasDecodedMetrics) {
          lifecycle.recordPacket(telemetry.timestamp);
        } else {
          lifecycle.recordError(
            'telemetry_setup',
            telemetry.telemetryUnsupportedReason ?? 'Connected over Bluetooth; telemetry is not decoded for this model yet.',
            'TELEMETRY_UNSUPPORTED',
            {
              canRecover: Boolean(config.decodeTelemetry),
              timeoutMs: this.getStreamStaleAfterMs(),
            },
          );
        }

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
        bluLogThrottled(
          hasDecodedMetrics ? '[BLU_TELEMETRY]' : '[BLU_STREAM]',
          `${config.provider}:telemetry:${targetId}:${hasDecodedMetrics ? 'decoded' : 'unsupported'}`,
          hasDecodedMetrics ? 'native_ble_vendor_telemetry_decoded' : 'native_ble_vendor_telemetry_unsupported',
          hasDecodedMetrics
            ? buildBluTelemetryLogDetails({
                deviceId: targetId,
                vendor: config.provider,
                telemetry,
                streamMode: 'provider_poll',
                lastPacketAt: telemetry.timestamp,
              })
            : {
                deviceId: targetId,
                vendor: config.provider,
                streamMode: 'provider_poll',
                telemetryKeys: Object.keys(merged).filter((key) => (merged as Record<string, unknown>)[key] != null),
                hasVoltage: false,
                hasWatts: false,
                hasBatteryPercent: false,
                hasTemperature: false,
                hasObdPid: false,
                packetAgeMs: 0,
                readableCharacteristics: characteristicMap.size,
                ecoflowBleProtocol: protocolSupport,
                driverMode: config.decodeTelemetry ? 'local_ble_driver' : 'local_ble_incomplete',
              },
          10_000,
        );
        console.log(hasDecodedMetrics ? '[BT_LIVE] telemetry_decoded' : '[BT_LIVE] telemetry_unsupported', {
          provider: config.provider,
          deviceId: targetId,
          readableCharacteristics: characteristicMap.size,
        });

        return { success: true, telemetry, error: null };
      } catch (error) {
        this.consecutiveFailures += 1;
        const message = String((error as any)?.message ?? error ?? 'Poll failed.');
        if (this.manualDisconnectRequested || this.connectionState === 'disconnected' || !this.connectedDeviceRef) {
          lifecycle.stop('poll_aborted_after_disconnect');
          bluLog('[BLU_DISCONNECT]', 'native_ble_vendor_poll_aborted_after_disconnect', {
            deviceId: targetId,
            vendor: config.provider,
            providerName: config.displayName,
            phase: 'telemetry_poll',
            message,
          });
          return {
            success: false,
            telemetry: this.telemetryByDeviceId.get(targetId) ?? null,
            error: message,
          };
        }
        lifecycle.recordError('telemetry_poll', message, detectErrorCode(error), {
          canRecover: true,
          timeoutMs: this.currentPollInterval,
        });
        bluLog('[BLU_TIMEOUT]', 'native_ble_vendor_poll_failed', buildBluTimeoutLogDetails({
          deviceId: targetId,
          vendor: config.provider,
          phase: 'telemetry_poll',
          timeoutMs: this.currentPollInterval,
          lastSuccessfulPhase: this.lastPollAt ? 'telemetry_packet' : 'native_ble_connect',
          lastPacketAt: this.lastPollAt,
          errorCode: detectErrorCode(error),
          message,
        }));
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
          error: message,
        };
      } finally {
        this.pollingDeviceIds.delete(targetId);
      }
    }

    private beginReconnect(deviceId: string): void {
      if (this.manualDisconnectRequested) {
        bluLog('[BLU_RECONNECT]', 'native_ble_vendor_reconnect_skipped_manual_disconnect', {
          deviceId,
          vendor: config.provider,
          providerName: config.displayName,
          manualDisconnectRequested: true,
        });
        return;
      }
      if (this.isReconnecting) return;
      this.isReconnecting = true;
      this.connectionState = 'error';
      this.reconnectAttempts = 0;
      bluStateStore.setReconnecting(true);
      bluLog('[BLU_RECONNECT]', 'native_ble_vendor_reconnect_begin', {
        deviceId,
        vendor: config.provider,
        providerName: config.displayName,
        reason: this.lastError ?? 'poll_failure',
      });
      this.emitEvent('reconnecting', { device: bluDeviceRegistry.getDevice(config.provider, deviceId) ?? null });
      this.notify();
      this.scheduleReconnect(deviceId);
    }

    private scheduleReconnect(deviceId: string): void {
      if (this.manualDisconnectRequested) {
        this.stopReconnectTimer();
        this.isReconnecting = false;
        bluStateStore.setReconnecting(false);
        bluLog('[BLU_RECONNECT]', 'native_ble_vendor_reconnect_schedule_skipped_manual_disconnect', {
          deviceId,
          vendor: config.provider,
          providerName: config.displayName,
          manualDisconnectRequested: true,
        });
        return;
      }
      this.stopReconnectTimer();
      this.reconnectAttempts += 1;
      bluLog('[BLU_RECONNECT]', 'native_ble_vendor_reconnect_scheduled', {
        deviceId,
        vendor: config.provider,
        providerName: config.displayName,
        attempt: this.reconnectAttempts,
        maxAttempts: MAX_RECONNECT_ATTEMPTS,
        delayMs: RECONNECT_DELAY_MS,
      });
      this.emitEvent('reconnect_start', { device: bluDeviceRegistry.getDevice(config.provider, deviceId) ?? null });
      if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        this.isReconnecting = false;
        bluStateStore.setReconnecting(false);
        this.setError('Device unavailable.', 'DEVICE_UNAVAILABLE');
        this.streamLifecycles.get(deviceId)?.recordError(
          'reconnect',
          'Device unavailable.',
          'DEVICE_UNAVAILABLE',
          { canRecover: false },
        );
        bluLog('[BLU_RECONNECT]', 'native_ble_vendor_reconnect_gave_up', {
          deviceId,
          vendor: config.provider,
          providerName: config.displayName,
          attempt: this.reconnectAttempts,
          errorCode: 'DEVICE_UNAVAILABLE',
        });
        this.emitEvent('reconnect_failed', { error: this.lastError, errorCode: this.lastErrorCode });
        this.notify();
        return;
      }

      this.reconnectTimer = setTimeout(() => {
        if (this.manualDisconnectRequested) {
          this.reconnectTimer = null;
          this.isReconnecting = false;
          bluStateStore.setReconnecting(false);
          return;
        }
        void this.reconnect(deviceId);
      }, RECONNECT_DELAY_MS);
    }

    private async reconnect(deviceId: string): Promise<void> {
      if (this.manualDisconnectRequested) {
        this.stopReconnectTimer();
        this.isReconnecting = false;
        bluStateStore.setReconnecting(false);
        bluLog('[BLU_RECONNECT]', 'native_ble_vendor_reconnect_skipped_manual_disconnect', {
          deviceId,
          vendor: config.provider,
          providerName: config.displayName,
          manualDisconnectRequested: true,
        });
        return;
      }
      try {
        const result = await this.connect(deviceId);
        if (result.success) {
          this.isReconnecting = false;
          bluStateStore.setReconnecting(false);
          bluLog('[BLU_RECONNECT]', 'native_ble_vendor_reconnect_succeeded', {
            deviceId,
            vendor: config.provider,
            providerName: config.displayName,
          });
          this.emitEvent('reconnect_success', { device: result.device, devices: result.devices });
          this.emitEvent('reconnected', { device: result.device, devices: result.devices });
          this.startPolling(this.currentPollInterval);
        } else {
          bluLog('[BLU_RECONNECT]', 'native_ble_vendor_reconnect_attempt_failed', {
            deviceId,
            vendor: config.provider,
            providerName: config.displayName,
            errorCode: result.errorCode,
            message: result.error,
          });
          this.scheduleReconnect(deviceId);
        }
      } catch {
        bluLog('[BLU_RECONNECT]', 'native_ble_vendor_reconnect_threw', {
          deviceId,
          vendor: config.provider,
          providerName: config.displayName,
        });
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
          if (this.manualDisconnectRequested) {
            this.connectionState = 'disconnected';
            bluStateStore.setReconnecting(false);
            return;
          }
          this.connectionState = 'error';
          this.setError('Device unavailable.', 'DEVICE_UNAVAILABLE');
          bluLog('[BLU_DISCONNECT]', 'native_ble_vendor_disconnect_detected', {
            deviceId: device.id,
            vendor: config.provider,
            providerName: config.displayName,
            connectionMode: 'ble',
            message: String((_error as any)?.message ?? _error ?? 'Device disconnected.'),
          });
          this.streamLifecycles.get(device.id)?.recordError(
            'device_disconnect',
            'BLE device disconnected.',
            'DEVICE_UNAVAILABLE',
            { canRecover: false },
          );
          this.telemetryByDeviceId.delete(device.id);
          void bluDeviceRegistry.updateConnectionState(config.provider, device.id, 'error');
          bluStateStore.clearDeviceTelemetry(config.provider, device.id, 'BLE device disconnected.');
          this.notify();
          this.beginReconnect(device.id);
        });
      } catch {
        // Best effort only.
      }
    }

    private async probeEcoFlowBleServices(
      device: BleManagerDevice,
      deviceId: string,
      discovered: NativeBleDiscoveredDevice,
    ): Promise<EcoFlowBleServiceProbe[]> {
      try {
        const services = await device.services();
        const serviceProbes: EcoFlowBleServiceProbe[] = [];
        for (const service of services ?? []) {
          const serviceUuid = String(service?.uuid ?? '').trim().toLowerCase();
          if (!serviceUuid) continue;
          let characteristics: any[] = [];
          try {
            characteristics = await device.characteristicsForService(service.uuid);
          } catch {
            characteristics = [];
          }
          serviceProbes.push({
            uuid: serviceUuid,
            characteristicCount: Array.isArray(characteristics) ? characteristics.length : 0,
            characteristics: (characteristics ?? [])
              .map((characteristic) => buildEcoFlowBleCharacteristicProbe(serviceUuid, characteristic))
              .filter((characteristic) => characteristic.characteristicUuid.length > 0),
          });
        }

        const summary = summarizeEcoFlowBleServices(serviceProbes);
        const protocolSupport = detectEcoFlowBleProtocolSupport(summary.services);
        bluLogThrottled(
          '[BLU_HANDSHAKE]',
          `ecoflow-ble-protocol:${deviceId}`,
          'ecoflow_ble_protocol_candidates',
          {
            deviceId,
            vendor: config.provider,
            providerName: config.displayName,
            phase: 'service_discovery',
            serviceCount: summary.serviceCount,
            characteristicCount: summary.characteristicCount,
            notificationCandidateCount: summary.notificationCandidateCount,
            ...protocolSupport,
          },
          30_000,
        );
        recordEcoFlowBleProbeEvent({
          providerId: config.provider,
          providerLabel: config.displayName,
          displayName: discovered.name,
          localName: discovered.name,
          categoryHint: discovered.model,
          manufacturerData: discovered.manufacturerData ?? null,
          serviceUuids: discovered.serviceUUIDs ?? [],
          deviceId,
          phase: 'service_discovery_completed',
          services: serviceProbes,
        });
        return serviceProbes;
      } catch (error) {
        const message = String((error as any)?.message ?? error ?? 'EcoFlow BLE service probe failed.');
        recordEcoFlowBleProbeEvent({
          providerId: config.provider,
          providerLabel: config.displayName,
          displayName: discovered.name,
          localName: discovered.name,
          categoryHint: discovered.model,
          manufacturerData: discovered.manufacturerData ?? null,
          serviceUuids: discovered.serviceUUIDs ?? [],
          deviceId,
          phase: 'service_discovery_failed',
          error: message,
        });
        return [];
      }
    }

    private async sampleEcoFlowBleProtocolNotifications(
      device: BleManagerDevice,
      deviceId: string,
      services: EcoFlowBleServiceProbe[],
    ): Promise<{
      frames: EcoFlowBleProtocolFrameCapture[];
      decodedPackets: EcoFlowBleDecodedProtocolPacketCapture[];
    }> {
      const protocolPairs = [
        ECOFLOW_BLE_PROTOCOL_CHARACTERISTICS.rfcomm,
        ECOFLOW_BLE_PROTOCOL_CHARACTERISTICS.nordicUart,
      ];
      const notifyTarget = services
        .flatMap((service) => service.characteristics.map((characteristic) => ({
          serviceUuid: service.uuid,
          characteristicUuid: characteristic.characteristicUuid,
          isNotifiable: characteristic.isNotifiable,
        })))
        .find((candidate) =>
          candidate.isNotifiable === true &&
          protocolPairs.some((pair) => compactUuid(pair.notifyUuid) === compactUuid(candidate.characteristicUuid))
        );
      const writeTarget = services
        .flatMap((service) => service.characteristics.map((characteristic) => ({
          serviceUuid: service.uuid,
          characteristicUuid: characteristic.characteristicUuid,
          isWritableWithResponse: characteristic.isWritableWithResponse,
          isWritableWithoutResponse: characteristic.isWritableWithoutResponse,
        })))
        .find((candidate) =>
          (candidate.isWritableWithResponse === true || candidate.isWritableWithoutResponse === true) &&
          protocolPairs.some((pair) => compactUuid(pair.writeUuid) === compactUuid(candidate.characteristicUuid))
        );

      if (!notifyTarget) return { frames: [], decodedPackets: [] };

      const frames: EcoFlowBleProtocolFrameCapture[] = [];
      const decodedPackets: EcoFlowBleDecodedProtocolPacketCapture[] = [];
      const probeFrames = getEcoFlowBleProbeFramesFromEnv();
      const dynamicSessionProbeEnabled =
        config.provider === 'ecoflow' &&
        (isEcoFlowBleDynamicSessionProbeEnabled() || hasEcoFlowBleProbePrivateKeyConfigured());
      const connectedDeviceRecord = this.connectedDevices.find((entry) => entry.device_id === deviceId);
      const dynamicSessionPacketVersion = inferEcoFlowBlePacketVersionFromHints([
        deviceId,
        connectedDeviceRecord?.display_name,
        (connectedDeviceRecord as { model?: string | null } | undefined)?.model,
      ]);
      const dynamicSessionProbe = dynamicSessionProbeEnabled
        ? (() => {
            try {
              return createEcoFlowBleSessionProbe({
                packetVersion: dynamicSessionPacketVersion,
                includeDecryptedPayloadBase64: true,
              });
            } catch (error) {
              bluLog('[BLU_HANDSHAKE]', 'ecoflow_ble_dynamic_session_probe_unavailable', {
                deviceId,
                vendor: config.provider,
                providerName: config.displayName,
                phase: 'dynamic_session_probe',
                message: String((error as any)?.message ?? error ?? 'EcoFlow BLE dynamic session probe is unavailable.'),
              });
              return null;
            }
          })()
        : null;
      const activeProbeFrames = dynamicSessionProbe ? [] : probeFrames;
      const captureMs = getEcoFlowBleNotificationCaptureMs();
      const maxFrames = getEcoFlowBleNotificationCaptureMaxFrames();
      const verboseSessionLogs = isEcoFlowBleVerboseSessionLoggingEnabled();
      const startedAt = Date.now();
      let subscription: BleManagerSubscription = null;
      let accountAuthAttempted = false;
      let accountAuthWaitingForStatusResponse = false;
      const accountAuthPayloadPromise = dynamicSessionProbe
        ? requestEcoFlowBleAuthPayload({
            deviceIdHint: deviceId,
            deviceNameHint: connectedDeviceRecord?.display_name ?? deviceId,
            modelHint: (connectedDeviceRecord as { model?: string | null } | undefined)?.model ?? null,
          }).catch((error) => error)
        : null;

      try {
        const writeProbeFrame = async (
          valueBase64: string,
          kind: string,
        ): Promise<void> => {
          if (!writeTarget) return;
          const frame = buildEcoFlowBleProtocolFrameCapture({
            direction: 'write',
            serviceUuid: writeTarget.serviceUuid,
            characteristicUuid: writeTarget.characteristicUuid,
            valueBase64,
            capturedAtOffsetMs: Date.now() - startedAt,
          });
          if (frame) frames.push(frame);
          if (verboseSessionLogs) {
            bluLog('[BLU_HANDSHAKE]', 'ecoflow_ble_active_probe_write_start', {
              deviceId,
              vendor: config.provider,
              providerName: config.displayName,
              phase: kind === 'explicit_env_probe' ? 'active_probe' : 'dynamic_session_probe',
              probeKind: kind,
              serviceUuid: writeTarget.serviceUuid,
              characteristicUuid: writeTarget.characteristicUuid,
              valueLength: frame?.valueLength ?? 0,
              valueFingerprint: frame?.valueFingerprint ?? null,
              writeMode: writeTarget.isWritableWithResponse === true ? 'with_response' : 'without_response',
            });
          }
          if (writeTarget.isWritableWithResponse === true) {
            await device.writeCharacteristicWithResponseForService(
              writeTarget.serviceUuid,
              writeTarget.characteristicUuid,
              valueBase64,
            );
          } else {
            await device.writeCharacteristicWithoutResponseForService(
              writeTarget.serviceUuid,
              writeTarget.characteristicUuid,
              valueBase64,
            );
          }
          if (verboseSessionLogs) {
            bluLog('[BLU_HANDSHAKE]', 'ecoflow_ble_active_probe_write_succeeded', {
              deviceId,
              vendor: config.provider,
              providerName: config.displayName,
              phase: kind === 'explicit_env_probe' ? 'active_probe' : 'dynamic_session_probe',
              probeKind: kind,
              valueLength: frame?.valueLength ?? 0,
              valueFingerprint: frame?.valueFingerprint ?? null,
            });
          }
          if (kind === 'auth_status_request' && dynamicSessionProbe && accountAuthPayloadPromise && !accountAuthAttempted) {
            accountAuthWaitingForStatusResponse = true;
            if (verboseSessionLogs) {
              bluLog('[BLU_HANDSHAKE]', 'ecoflow_ble_account_auth_waiting_for_status_response', {
                deviceId,
                vendor: config.provider,
                providerName: config.displayName,
                phase: 'dynamic_session_probe',
                probeKind: 'account_auth_request',
                message: 'EcoFlow BLE account auth payload will be sent after the auth-status response is captured.',
              });
            }
          }
        };

        const sendAccountAuthRequest = async (): Promise<void> => {
          if (!dynamicSessionProbe || !accountAuthPayloadPromise || accountAuthAttempted) return;
          accountAuthAttempted = true;
          try {
            const authPayload = await accountAuthPayloadPromise;
            if (authPayload instanceof Error) throw authPayload;
            if (verboseSessionLogs) {
              bluLog('[BLU_HANDSHAKE]', 'ecoflow_ble_account_auth_payload_ready', {
                deviceId,
                vendor: config.provider,
                providerName: config.displayName,
                phase: 'dynamic_session_probe',
                probeKind: 'account_auth_request',
                authPayloadFingerprint: authPayload.authPayloadFingerprint,
                deviceSerialFingerprint: authPayload.deviceSerialFingerprint,
                deviceSerialSuffix: authPayload.deviceSerialSuffix,
                accountFingerprint: authPayload.accountFingerprint,
              });
            }
            const accountAuthStep = dynamicSessionProbe.getAccountAuthFrame(authPayload.authPayloadBase64);
            if (accountAuthStep.writeFrameBase64 && accountAuthStep.writeFrameKind) {
              await writeProbeFrame(accountAuthStep.writeFrameBase64, accountAuthStep.writeFrameKind);
            }
          } catch (error) {
            bluLog('[BLU_HANDSHAKE]', 'ecoflow_ble_account_auth_payload_unavailable', {
              deviceId,
              vendor: config.provider,
              providerName: config.displayName,
              phase: 'dynamic_session_probe',
              probeKind: 'account_auth_request',
              message: String((error as any)?.message ?? error ?? 'EcoFlow BLE account auth payload is unavailable.'),
            });
          }
        };

        const handleDynamicSessionProbeStep = (step: EcoFlowBleSessionProbeStep | null): void => {
          if (!step) return;
          for (const summary of step.packetSummaries ?? []) {
            const decodedPacket = buildEcoFlowBleDecodedProtocolPacketCapture({
              direction: 'notify',
              valid: summary.valid,
              src: summary.src,
              dst: summary.dst,
              cmdSet: summary.cmdSet,
              cmdId: summary.cmdId,
              version: summary.version,
              payloadLength: summary.payloadLength,
              payloadFirstByte: summary.payloadFirstByte,
              payloadBase64: summary.payloadBase64,
              payloadFingerprint: summary.payloadFingerprint,
              packetBase64: summary.packetBase64,
              packetFingerprint: summary.packetFingerprint,
              decryptedPayloadBase64: summary.decryptedPayloadBase64,
              decryptedPayloadFingerprint: summary.decryptedPayloadFingerprint,
              decryptedPayloadLength: summary.decryptedPayloadLength,
              parseError: summary.parseError,
              capturedAtOffsetMs: Date.now() - startedAt,
            });
            if (decodedPacket) decodedPackets.push(decodedPacket);
          }
          const shouldLogProbeStep =
            verboseSessionLogs ||
            step.phase === 'public_key_sent' ||
            step.phase === 'shared_key_ready' ||
            step.phase === 'auth_status_sent' ||
            step.phase === 'account_auth_accepted';
          if (shouldLogProbeStep) {
            bluLog('[BLU_HANDSHAKE]', 'ecoflow_ble_dynamic_session_probe_step', {
              deviceId,
              vendor: config.provider,
              providerName: config.displayName,
              phase: 'dynamic_session_probe',
              probePhase: step.phase,
              writeFrameKind: step.writeFrameKind ?? null,
              valueLength: step.valueLength ?? null,
              valueFingerprint: step.valueFingerprint ?? null,
              sessionKeyFingerprint: step.sessionKeyFingerprint ?? null,
              packetVersion: step.packetVersion ?? null,
              packetSummaries: verboseSessionLogs ? step.packetSummaries ?? null : null,
              error: step.error ?? null,
            });
          }
          const accountAuthSummary = step.packetSummaries?.find((summary) => (
            summary.valid === true &&
            summary.cmdSet === 0x35 &&
            summary.cmdId === 0x86 &&
            summary.authStatusCode != null
          ));
          if (accountAuthSummary) {
            bluLog('[BLU_HANDSHAKE]', 'ecoflow_ble_account_auth_result', {
              deviceId,
              vendor: config.provider,
              providerName: config.displayName,
              phase: 'dynamic_session_probe',
              probeKind: 'account_auth_request',
              authStatusCode: accountAuthSummary.authStatusCode,
              authStatusLabel: accountAuthSummary.authStatusLabel ?? 'unknown_error',
              authStatusOk: accountAuthSummary.authStatusOk === true,
              message: getEcoFlowBleAccountAuthStatusMessage(accountAuthSummary.authStatusLabel),
            });
          } else if (step.phase === 'account_auth_accepted') {
            bluLog('[BLU_HANDSHAKE]', 'ecoflow_ble_account_auth_result', {
              deviceId,
              vendor: config.provider,
              providerName: config.displayName,
              phase: 'dynamic_session_probe',
              probeKind: 'account_auth_request',
              authStatusCode: 0,
              authStatusLabel: 'authorized_by_data_packet',
              authStatusOk: true,
              message: 'EcoFlow BLE account authorization appears accepted; encrypted device data started after auth.',
            });
          }
          if (accountAuthWaitingForStatusResponse && step.phase === 'auth_status_received') {
            accountAuthWaitingForStatusResponse = false;
            void sendAccountAuthRequest().catch((error) => {
              bluLog('[BLU_HANDSHAKE]', 'ecoflow_ble_account_auth_write_failed', {
                deviceId,
                vendor: config.provider,
                providerName: config.displayName,
                phase: 'dynamic_session_probe',
                probeKind: 'account_auth_request',
                message: String((error as any)?.message ?? error ?? 'EcoFlow BLE account auth write failed.'),
              });
            });
          }
          if (step.writeFrameBase64 && step.writeFrameKind) {
            void writeProbeFrame(step.writeFrameBase64, step.writeFrameKind).catch((error) => {
              bluLog('[BLU_HANDSHAKE]', 'ecoflow_ble_dynamic_session_probe_write_failed', {
                deviceId,
                vendor: config.provider,
                providerName: config.displayName,
                phase: 'dynamic_session_probe',
                probeKind: step.writeFrameKind,
                message: String((error as any)?.message ?? error ?? 'EcoFlow BLE dynamic session probe write failed.'),
              });
            });
          }
        };

        subscription = device.monitorCharacteristicForService(
          notifyTarget.serviceUuid,
          notifyTarget.characteristicUuid,
          (error: any, characteristic: any) => {
            if (error || frames.length >= maxFrames) return;
            const frame = buildEcoFlowBleProtocolFrameCapture({
              direction: 'notify',
              serviceUuid: notifyTarget.serviceUuid,
              characteristicUuid: notifyTarget.characteristicUuid,
              valueBase64: characteristic?.value,
              capturedAtOffsetMs: Date.now() - startedAt,
            });
            if (frame) frames.push(frame);
            if (dynamicSessionProbe && characteristic?.value) {
              handleDynamicSessionProbeStep(dynamicSessionProbe.processNotifyFrame(characteristic.value));
            }
          },
        );
        if (writeTarget && (activeProbeFrames.length > 0 || dynamicSessionProbe)) {
          const dynamicInitialStep = dynamicSessionProbe?.getPublicKeyExchangeFrame() ?? null;
          bluLogThrottled(
            '[BLU_HANDSHAKE]',
            `ecoflow-ble-active-probe:${deviceId}`,
            'ecoflow_ble_active_probe_start',
            {
              deviceId,
              vendor: config.provider,
              providerName: config.displayName,
              phase: 'active_probe',
              frameCount: activeProbeFrames.length + (dynamicInitialStep?.writeFrameBase64 ? 1 : 0),
              dynamicSessionProbeEnabled: Boolean(dynamicSessionProbe),
              captureMs,
              maxFrames,
            },
            60_000,
          );
          if (dynamicInitialStep) {
            handleDynamicSessionProbeStep(dynamicInitialStep);
          }
          for (const valueBase64 of activeProbeFrames) {
            await writeProbeFrame(valueBase64, 'explicit_env_probe');
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
        } else {
          bluLogThrottled(
            '[BLU_HANDSHAKE]',
            `ecoflow-ble-active-probe-skipped:${deviceId}`,
            'ecoflow_ble_active_probe_skipped',
            {
              deviceId,
              vendor: config.provider,
              providerName: config.displayName,
              phase: 'active_probe',
              hasWriteTarget: Boolean(writeTarget),
              explicitProbeFrameCount: activeProbeFrames.length,
              dynamicSessionProbeEnabled,
              dynamicSessionProbeAvailable: Boolean(dynamicSessionProbe),
              privateKeyConfigured: hasEcoFlowBleProbePrivateKeyConfigured(),
            },
            60_000,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, captureMs));
      } catch (error) {
        bluLog('[BLU_HANDSHAKE]', 'ecoflow_ble_notification_capture_failed', {
          deviceId,
          vendor: config.provider,
          providerName: config.displayName,
          phase: 'notification_capture',
          message: String((error as any)?.message ?? error ?? 'EcoFlow BLE notification capture failed.'),
        });
      } finally {
        try {
          subscription?.remove?.();
        } catch {}
      }

      if (dynamicSessionProbe?.getCurrentPhase() === 'account_auth_sent') {
        bluLog('[BLU_HANDSHAKE]', 'ecoflow_ble_account_auth_response_missing', {
          deviceId,
          vendor: config.provider,
          providerName: config.displayName,
          phase: 'dynamic_session_probe',
          probePhase: 'account_auth_sent',
          frameCount: frames.length,
          timeoutMs: captureMs,
          message:
            'EcoFlow BLE account-bound auth payload was written, but no encrypted telemetry/auth response was captured before the capture window ended.',
        });
      } else if (dynamicSessionProbe?.getCurrentPhase() === 'auth_status_sent') {
        bluLog('[BLU_HANDSHAKE]', 'ecoflow_ble_auth_status_response_missing', {
          deviceId,
          vendor: config.provider,
          providerName: config.displayName,
          phase: 'dynamic_session_probe',
          probePhase: 'auth_status_sent',
          frameCount: frames.length,
          timeoutMs: captureMs,
          message:
            'EcoFlow BLE session key was negotiated and auth-status was sent, but no encrypted response was captured. This model likely requires account-bound BLE authorization before telemetry can stream.',
        });
      }

      bluLogThrottled(
        '[BLU_HANDSHAKE]',
        `ecoflow-ble-notification-capture:${deviceId}`,
        'ecoflow_ble_notification_capture_completed',
        {
          deviceId,
          vendor: config.provider,
          providerName: config.displayName,
          phase: 'notification_capture',
          frameCount: frames.length,
          decodedPacketCount: decodedPackets.length,
          timeoutMs: captureMs,
          maxFrames,
        },
        30_000,
      );

      return { frames, decodedPackets };
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

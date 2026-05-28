import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { BluMultiDeviceCapability, BluProviderId } from './BluTypes';
import { DEFAULT_BLU_CAPABILITIES } from './BluTypes';
import { bluDeviceRegistry } from './BluDeviceRegistry';
import { getProviderMeta } from './BluProviderRegistry';
import { BLU_SCAN_WINDOW_MS } from './bluPerformanceConfig';
import { ecsProviderRegistry } from './EcsProviderRegistry';
import { ecsLog } from './ecsLogger';
import {
  EcoFlowCloudDiscoveryError,
  discoverEcoFlowDevicesForUnifiedScanner,
} from './ecoflowUnifiedScannerDiscovery';
import type { EcsDiscoveredDevice } from './IEcsPowerProvider';
import { getTelemetryFreshness, type TelemetryFreshness } from './EcsProviderDiagnostics';
import {
  getBluetoothTelemetrySourceLabel,
  normalizeBluetoothTelemetrySource,
  type BluetoothTelemetrySource,
} from './bluetoothLiveTelemetry';
import { bluetoothAccessoryRegistry } from './bluetoothAccessoryRegistry';
import {
  isReleaseScannerBluetoothRoute,
  type BluetoothOwnerDomain,
  routeBluetoothDevice,
} from './bluetoothDeviceRouting';
import { genericBluetoothAccessoryManager } from './genericBluetoothAccessoryManager';
import {
  discoverClassicBluetoothDevicesForUnifiedScanner,
  mergeDiscoveredDevices,
  normalizeDiscoveredDevice,
  type UnifiedDiscoverySource,
} from './unifiedDeviceDiscoveryAggregator';
import {
  powerSetupStore,
  type ConnectionMethod,
  type PowerProviderId,
} from './powerSetupStore';
import {
  POWER_SCANNER_BRAND_ALLOWLIST,
  SCANNER_SCAN_WINDOW_DEBOUNCE_MS,
  SCANNER_DEVICE_STALE_TIMEOUT_MS,
  getScannerDeviceStableKey,
  pruneStaleScannerDevices,
  upsertScannerDeviceList,
  type ScannerDeviceListUpsertResult,
} from './scannerDeviceListState';
import {
  createBluestackScannerSummary,
  getBluestackAdvertisementEvidence,
  getBluestackConnectionPolicy,
  getBluestackProviderReadiness,
  identifyBluestackUtilitySensorProfile,
  type BluestackScannerSummary,
} from './bluestack';
import {
  isCloudConnectionType,
  isEcoFlowCloudDeviceConnection,
  normalizeDeviceConnectionType,
} from './deviceConnectionSourceRouting';
import {
  getDeviceConnectionRouteLabel,
  isUserInitiatedConnectionSource,
  shouldSkipAutoConnection,
  type DeviceConnectionRequestSource,
} from './deviceConnectionRequestPolicy';
import {
  isNativeBluetoothRuntimeUnsupported,
  NATIVE_BLUETOOTH_RUNTIME_MESSAGE,
} from './deviceConnectionScanMessaging';
import {
  getPowerBrandConnectionAdapterForDevice,
  getPowerBrandConnectionStatus,
} from './powerBrandConnectionAdapters';
import {
  classifyBluetoothDiagnosticSource,
  recordBluetoothDiagnosticEvent,
} from './bluetoothDiagnostics';
import {
  bluLog,
  bluLogThrottled,
  buildBluConnectionAttemptLogDetails,
  buildBluDiscoveryLogDetails,
  buildBluTelemetryLogDetails,
  buildBluTimeoutLogDetails,
  getBluVendorPrefix,
  inferBluClassificationConfidence,
} from './bluDiagnosticsLog';
import { setSelectedEcoFlowDevice } from './ecoFlowSelectionStore';
import { normalizeEcoFlowBluCandidate } from './ecoflowBluTelemetryEligibility';
import { recordEcoFlowBleProbeEvent } from './ecoflowBleDiagnosticCapture';
import {
  connectEcoFlowCloudDevice,
  ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS,
  startEcoFlowCloudTelemetryPolling,
  stopEcoFlowCloudTelemetryPolling,
  type EcoFlowCloudConnectionDevice,
  type EcoFlowCloudConnectionResult,
} from './ecoflowCloudConnection';
import {
  getEcoFlowConnectionState,
  recordEcoFlowConnectionPhase,
  recordEcoFlowFailure,
  recordEcoFlowTimeout,
  type EcoFlowConnectionPhase,
  type EcoFlowCloudClientState,
  type EcoFlowDeviceConnectionState,
  type EcoFlowDiagnosticReason,
  type EcoFlowTelemetrySource,
  type EcoFlowTimeoutKind,
} from './ecoflowConnectionDiagnostics';
import {
  DEFAULT_STALE_AFTER_MS,
  clearBluStreamHealthSnapshot,
  getBluStreamHealthSnapshot,
  recordBluStreamHealthSnapshot,
} from './bluStreamLifecycle';
import { bluStateStore } from './BluStateStore';
import { useEcsProviders } from './useEcsProviders';
import {
  createUnifiedScannerSnapshot,
  type UnifiedScannerDevice,
  type UnifiedScannerSnapshot,
} from './unifiedScannerContract';
import { powerTelemetryManager } from '../src/power/telemetry/PowerTelemetryManager';
import { isBleRuntimeUnsupported } from '../src/power/ble/BleScanReadiness';
import { obd2Adapter, type OBD2DiscoveredDevice, type OBD2ScanDiagnostics } from '../src/vehicle-telemetry/OBD2Adapter';
import { useOBD2Scanner } from '../src/vehicle-telemetry/useOBD2Scanner';
import { useVehicleTelemetry } from '../src/vehicle-telemetry/useVehicleTelemetry';
import type { VehicleTelemetryDevice } from '../src/vehicle-telemetry/VehicleTelemetryTypes';
import { powerDeviceStore } from '../src/power/devices/PowerDeviceStore';

export type ECSConnectionSection = 'connected' | 'nearby' | 'known' | 'attention';
export type ECSConnectionScanAreaState =
  | 'idle'
  | 'checking'
  | 'scanning'
  | 'results'
  | 'empty'
  | 'permission_denied'
  | 'bluetooth_unavailable'
  | 'runtime_unsupported'
  | 'api_failed'
  | 'ble_failed'
  | 'classic_unsupported'
  | 'scan_failed';

export type ECSConnectionStatus =
  | 'discoverable'
  | 'selected'
  | 'connecting'
  | 'disconnecting'
  | 'connected'
  | 'live'
  | 'failed'
  | 'remembered'
  | 'unsupported'
  | 'partial'
  | 'stale';

export type ECSConnectionSupportLevel =
  | 'verified'
  | 'implemented_unverified'
  | 'partial'
  | 'ui_only'
  | 'generic'
  | 'telemetry';

export type ECSConnectionActionKind =
  | 'connect'
  | 'disconnect'
  | 'disconnecting'
  | 'retry'
  | 'selected'
  | 'connecting'
  | 'connected'
  | 'none';

type DeviceKind = 'power' | 'telemetry' | 'sensor' | 'generic';
type DeviceCategory =
  | 'telemetry'
  | 'obd'
  | 'sensor'
  | 'power'
  | 'propane_monitor'
  | 'water_tank_monitor'
  | 'unknown';

export type ECSDiscoverySourceUiStatus =
  | 'pending'
  | 'scanning'
  | 'success'
  | 'failed'
  | 'unsupported'
  | 'disabled';

export interface ECSDiscoverySourceSummary {
  key: UnifiedDiscoverySource | 'ecoflow_api' | 'obd2';
  label: string;
  status: ECSDiscoverySourceUiStatus;
  deviceCount: number;
  rawCount: number;
  normalizedCount: number;
  addedCount: number;
  failedReason: string | null;
  detail: string | null;
}

export interface ECSScanSummary {
  startedAt: number | null;
  durationMs: number;
  sourcesAttempted: string[];
  rawDevicesSeenCount: number;
  visibleDevicesCount: number;
  filteredDevicesCount: number;
  filterReasons: string[];
  sourceStatuses: ECSDiscoverySourceSummary[];
  bluetoothDiagnostics: OBD2ScanDiagnostics;
}

interface DeviceModelBase {
  id: string;
  rawId: string;
  kind: DeviceKind;
  name: string;
  provider: string;
  providerId: string;
  category: string;
  deviceCategory: DeviceCategory;
  subtype: string | null;
  status: ECSConnectionStatus;
  section: ECSConnectionSection;
  supportLevel: ECSConnectionSupportLevel;
  supportLabel: string;
  supportNote: string | null;
  stateLabel: string;
  detailLabel: string;
  actionKind: ECSConnectionActionKind;
  actionLabel: string;
  isDiscoverable: boolean;
  isSelected: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  isLive: boolean;
  telemetrySource: BluetoothTelemetrySource;
  telemetrySourceLabel: string;
  telemetryUnsupported: boolean;
  connectionSourceLabel: string;
  statusPillLabel: string;
  lastTelemetryAt: number | null;
  diagnosticReason: string | null;
  telemetryFields: Array<{
    key: string;
    label: string;
    value: string;
  }>;
  isRemembered: boolean;
  isSupported: boolean;
  sourceBadges: string[];
  lastError: string | null;
  lastSeenAt: number | null;
  supportsPowerData: boolean;
  supportsTelemetryData: boolean;
  signalStrength: number | null;
  affectsMultipleDevices: boolean;
  connectionType: string | null;
  serviceUuids?: string[];
  manufacturerData?: string | null;
  localName?: string | null;
  requiresNativeBluetooth: boolean;
  connectableViaCloud: boolean;
  multiDeviceCapability?: BluMultiDeviceCapability;
  multiDeviceCapabilityReason?: string | null;
  ecoflowPhase?: EcoFlowConnectionPhase | null;
  ecoflowSource?: EcoFlowTelemetrySource | null;
  ecoflowTimeoutKind?: EcoFlowTimeoutKind | null;
  ecoflowCloudState?: EcoFlowCloudClientState | null;
  ecoflowDiagnosticReason?: EcoFlowDiagnosticReason | null;
}

export type ECSDeviceConnectionModel = DeviceModelBase;

function getManualDisconnectGuardKeys(
  device: Pick<ECSDeviceConnectionModel, 'id' | 'kind' | 'providerId' | 'rawId'>,
): string[] {
  return Array.from(new Set([
    device.id,
    `${device.kind}:${device.providerId}:${device.rawId}`,
    `${device.providerId}:${device.rawId}`,
    device.rawId,
  ].filter(Boolean)));
}

interface PowerSupportDescriptor {
  supportLevel: ECSConnectionSupportLevel;
  supportLabel: string;
  supportNote: string | null;
  isSupported: boolean;
}

const DISCOVERY_SOURCE_LABELS: Record<ECSDiscoverySourceSummary['key'], string> = {
  ble: 'Native BLE',
  classic_bluetooth: 'Classic Bluetooth',
  api: 'API',
  obd2: 'OBD2',
  cached: 'Cached',
  ecoflow_api: 'EcoFlow API',
};

function formatDiagnosticNumber(value: unknown, unit: string, decimals = 0): string | null {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : null;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) return null;
  const rounded = decimals > 0 ? numeric.toFixed(decimals) : String(Math.round(numeric));
  return unit ? `${rounded}${unit}` : rounded;
}

function makeTelemetryField(
  key: string,
  label: string,
  value: unknown,
  unit: string = '',
  decimals = 0,
): DeviceModelBase['telemetryFields'][number] | null {
  const formatted = formatDiagnosticNumber(value, unit, decimals);
  return formatted ? { key, label, value: formatted } : null;
}

function compactTelemetryFields(
  fields: Array<DeviceModelBase['telemetryFields'][number] | null>,
  maxFields = 5,
): DeviceModelBase['telemetryFields'] {
  return fields.filter((field): field is DeviceModelBase['telemetryFields'][number] => Boolean(field)).slice(0, maxFields);
}

function getPowerTelemetryFields(reading: {
  batteryPercent?: number | null;
  batteryVolts?: number | null;
  inputWatts?: number | null;
  outputWatts?: number | null;
  temperatureCelsius?: number | null;
} | null, productType?: string | null): DeviceModelBase['telemetryFields'] {
  if (!reading) return [];
  const isFridge = /fridge|refrigerator|glacier/i.test(String(productType ?? ''));
  return compactTelemetryFields([
    makeTelemetryField('battery_percent', 'Battery', reading.batteryPercent, '%'),
    makeTelemetryField('battery_volts', 'Voltage', reading.batteryVolts, 'V', 1),
    makeTelemetryField('input_watts', 'Input', reading.inputWatts, 'W'),
    makeTelemetryField('output_watts', 'Output', reading.outputWatts, 'W'),
    makeTelemetryField(isFridge ? 'fridge_temp' : 'temperature', isFridge ? 'Fridge' : 'Temp', reading.temperatureCelsius, 'C', 1),
  ]);
}

function getVehicleTelemetryFields(telemetry: {
  battery_voltage?: number | null;
  engine_rpm?: number | null;
  vehicle_speed?: number | null;
} | null): DeviceModelBase['telemetryFields'] {
  if (!telemetry) return [];
  return compactTelemetryFields([
    makeTelemetryField('obd_voltage', 'OBD V', telemetry.battery_voltage, 'V', 1),
    makeTelemetryField('engine_rpm', 'RPM', telemetry.engine_rpm, 'rpm'),
    makeTelemetryField('vehicle_speed', 'Speed', telemetry.vehicle_speed, 'mph'),
  ]);
}

function getConnectionSourceLabel(input: {
  kind: DeviceKind;
  telemetrySource: BluetoothTelemetrySource;
  connectionType?: string | null;
  ecoflowSource?: EcoFlowTelemetrySource | null;
  connectableViaCloud?: boolean | null;
}): string {
  if (input.telemetrySource === 'mock_dev') return 'Mock';
  if (input.kind === 'telemetry') return 'OBD2';
  if (input.ecoflowSource === 'hybrid' || input.connectionType === 'hybrid') return 'Hybrid';
  if (
    input.telemetrySource === 'provider_cloud' ||
    input.ecoflowSource === 'ecoflow-cloud' ||
    input.connectionType === 'api' ||
    input.connectionType === 'cloud' ||
    input.connectableViaCloud === true
  ) {
    return 'Cloud API';
  }
  if (input.telemetrySource === 'ble_live' || input.ecoflowSource === 'local-ble' || input.connectionType === 'ble') {
    return 'Local BLE';
  }
  if (input.telemetrySource === 'cache') return 'Unknown';
  return 'Unknown';
}

function getDiagnosticReason(input: {
  status: ECSConnectionStatus;
  detailLabel: string;
  lastError: string | null;
  telemetryUnsupported: boolean;
  ecoflowDiagnosticReason?: EcoFlowDiagnosticReason | null;
  streamErrorMessage?: string | null;
  isLive: boolean;
}): string | null {
  const explicit =
    normalizeUiLabel(input.ecoflowDiagnosticReason?.reason) ??
    normalizeUiLabel(input.streamErrorMessage) ??
    normalizeUiLabel(input.lastError);
  if (explicit && (input.status === 'failed' || input.status === 'stale' || input.telemetryUnsupported || !input.isLive)) {
    return explicit;
  }
  if (input.status === 'stale') return input.detailLabel;
  if (input.status === 'failed') return input.detailLabel;
  if (input.telemetryUnsupported) return input.detailLabel;
  return null;
}

function getStatusPillLabel(input: {
  status: ECSConnectionStatus;
  isConnected: boolean;
  isConnecting: boolean;
  isLive: boolean;
  isDisconnecting: boolean;
  telemetrySource: BluetoothTelemetrySource;
  telemetryUnsupported: boolean;
  supportLevel: ECSConnectionSupportLevel;
  ecoflowDiagnostic?: EcoFlowDeviceConnectionState | null;
  streamPhase?: string | null;
  hasError: boolean;
}): string {
  const cloudState =
    input.ecoflowDiagnostic?.diagnosticReason?.cloudState ??
    input.ecoflowDiagnostic?.cloudState ??
    null;
  if (input.telemetrySource === 'mock_dev') return 'Mock';
  if (
    input.ecoflowDiagnostic?.diagnosticReason?.requiresCloudAuth ||
    cloudState === 'authRequired' ||
    cloudState === 'deviceUnauthorized'
  ) return 'Auth Required';
  if (input.isDisconnecting) return 'Disconnected';
  if (input.isConnecting || input.status === 'connecting') return 'Connecting';
  if (input.isLive) return 'Live';
  if (cloudState === 'cloudStale' || cloudState === 'deviceOffline') return 'Stale';
  if (input.status === 'stale' || input.streamPhase === 'stale') return 'Stale';
  if (input.ecoflowDiagnostic?.phase === 'timeout') return 'Timeout';
  if (input.status === 'failed' || input.hasError || input.streamPhase === 'failed') return 'Failed';
  if (input.supportLevel === 'ui_only' || input.status === 'unsupported') return 'Unsupported';
  if (
    input.isConnected &&
    (input.telemetryUnsupported ||
      input.ecoflowDiagnostic?.phase === 'awaitingTelemetry' ||
      input.streamPhase === 'awaitingFirstPacket' ||
      input.streamPhase === 'starting')
  ) {
    return 'Awaiting Data';
  }
  if (input.ecoflowDiagnostic?.phase === 'cloudPolling' || cloudState === 'cloudPolling') return 'Cloud Polling';
  if (input.isConnected) return 'Connected';
  if (input.status === 'remembered') return 'Disconnected';
  return 'Discovered';
}

function makeDiscoverySourceSummary(
  key: ECSDiscoverySourceSummary['key'],
  status: ECSDiscoverySourceUiStatus,
  deviceCount: number = 0,
  detail: string | null = null,
  metrics: Partial<Pick<ECSDiscoverySourceSummary, 'rawCount' | 'normalizedCount' | 'addedCount' | 'failedReason'>> = {},
): ECSDiscoverySourceSummary {
  const failedReason = metrics.failedReason ?? (
    status === 'failed' || status === 'unsupported' ? detail : null
  );
  return {
    key,
    label: DISCOVERY_SOURCE_LABELS[key],
    status,
    deviceCount,
    rawCount: metrics.rawCount ?? deviceCount,
    normalizedCount: metrics.normalizedCount ?? deviceCount,
    addedCount: metrics.addedCount ?? (status === 'success' ? deviceCount : 0),
    failedReason,
    detail,
  };
}

function getInitialDiscoverySourceStatuses(): ECSDiscoverySourceSummary[] {
  return [
    makeDiscoverySourceSummary('ble', 'pending', 0, 'Waiting for manual scan.'),
    makeDiscoverySourceSummary('ecoflow_api', 'pending', 0, 'Waiting for manual scan.'),
    makeDiscoverySourceSummary('obd2', 'pending', 0, 'Waiting for manual scan.'),
    makeDiscoverySourceSummary('classic_bluetooth', 'pending', 0, 'Waiting for manual scan.'),
  ];
}

function updateDiscoverySourceStatus(
  statuses: ECSDiscoverySourceSummary[],
  key: ECSDiscoverySourceSummary['key'],
  status: ECSDiscoverySourceUiStatus,
  deviceCount: number,
  detail: string | null,
  metrics: Partial<Pick<ECSDiscoverySourceSummary, 'rawCount' | 'normalizedCount' | 'addedCount' | 'failedReason'>> = {},
): ECSDiscoverySourceSummary[] {
  const buildNextEntry = (entry?: ECSDiscoverySourceSummary): ECSDiscoverySourceSummary => {
    const failedReason = metrics.failedReason ?? (
      status === 'failed' || status === 'unsupported' ? detail : null
    );
    return {
      ...(entry ?? makeDiscoverySourceSummary(key, status, deviceCount, detail)),
      key,
      label: DISCOVERY_SOURCE_LABELS[key],
      status,
      deviceCount,
      rawCount: metrics.rawCount ?? deviceCount,
      normalizedCount: metrics.normalizedCount ?? deviceCount,
      addedCount: metrics.addedCount ?? (status === 'success' ? deviceCount : 0),
      failedReason,
      detail,
    };
  };
  const next = statuses.map((entry) => (
    entry.key === key ? buildNextEntry(entry) : entry
  ));
  if (next.some((entry) => entry.key === key)) return next;
  return [...next, buildNextEntry()];
}

export interface UnifiedDeviceConnectionsResult {
  devices: ECSDeviceConnectionModel[];
  scannerDevices: UnifiedScannerDevice[];
  scannerSnapshot: UnifiedScannerSnapshot;
  bluestackSummary: BluestackScannerSummary;
  connectedDevices: ECSDeviceConnectionModel[];
  nearbyDevices: ECSDeviceConnectionModel[];
  knownDevices: ECSDeviceConnectionModel[];
  attentionDevices: ECSDeviceConnectionModel[];
  connectedCount: number;
  liveCount: number;
  selectedCount: number;
  canConnectSelected: boolean;
  isScanning: boolean;
  isCheckingScanReadiness: boolean;
  isBusy: boolean;
  isBatchBusy: boolean;
  isDegraded: boolean;
  scanStatus: 'idle' | 'scanning' | 'completed';
  scanAreaState: ECSConnectionScanAreaState;
  scanAreaMessage: string;
  lastScanSummary: ECSScanSummary;
  hasUserRequestedScan: boolean;
  hasCompletedManualScan: boolean;
  degradedMessage: string | null;
  infoMessage: string | null;
  globalSummaryLabel: string;
  routeIntent: ECSConnectionRouteIntent | null;
  toggleSelection: (deviceId: string) => void;
  clearSelection: () => void;
  connectDevice: (deviceId: string, source?: DeviceConnectionRequestSource) => Promise<void>;
  disconnectDevice: (deviceId: string, reason?: string) => Promise<void>;
  retryDevice: (deviceId: string, source?: DeviceConnectionRequestSource) => Promise<void>;
  connectSelected: (source?: DeviceConnectionRequestSource) => Promise<void>;
  consumeRouteIntent: (routeId: number) => void;
  rescan: () => Promise<void>;
  stopScanning: (reason?: string) => Promise<void>;
}

export interface ECSConnectionRouteIntent {
  id: number;
  owner: BluetoothOwnerDomain;
  deviceId: string;
  deviceName: string;
  providerId: string;
  providerLabel: string;
  routeKey: string;
  suggestedPath: string | null;
  shouldNavigate: boolean;
  supportLabel: string;
  supportNote: string | null;
  message: string;
}

const POWER_PROVIDER_LABELS: Record<BluProviderId, string> = {
  ecoflow: 'EcoFlow',
  bluetti: 'Bluetti',
  anker_solix: 'Anker SOLIX',
  jackery: 'Jackery',
  goal_zero: 'Goal Zero',
  renogy: 'Renogy',
  redarc: 'REDARC',
  dakota_lithium: 'Dakota Lithium',
  victron: 'Victron Energy',
};
const UNKNOWN_POWER_PROVIDER_ID = 'unknown_power';

const BLU_TO_MANAGED_POWER_PROVIDER: Partial<Record<BluProviderId, PowerProviderId>> = {
  ecoflow: 'EcoFlow',
  bluetti: 'Bluetti',
  anker_solix: 'AnkerSolix',
  jackery: 'Jackery',
  goal_zero: 'GoalZero',
  renogy: 'Renogy',
  redarc: 'Redarc',
  dakota_lithium: 'DakotaLithium',
};

type DeviceUiPhase = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'failed';

interface DeviceUiState {
  phase: DeviceUiPhase;
  error: string | null;
  updatedAt: number;
}

const CONNECT_RETRY_BASE_DELAY_MS = 450;
const CONNECT_RETRY_MAX_DELAY_MS = 2_500;
const CONNECT_RETRY_ATTEMPTS = 3;
const OBD2_FALLBACK_CANDIDATE_LIMIT = 6;
const OBD2_FALLBACK_CANDIDATE_MIN_RSSI = -82;
const OBD2_STRONG_UNKNOWN_CANDIDATE_MIN_RSSI = -70;
const DEFAULT_DISCOVERED_RSSI = -90;
const UNIFIED_BLUETOOTH_SCAN_DURATION_MS = BLU_SCAN_WINDOW_MS;
const POWER_DEVICE_ADVERTISEMENT_STALE_MS = SCANNER_DEVICE_STALE_TIMEOUT_MS;
const REMEMBERED_DEVICE_AUTO_RECONNECT_COOLDOWN_MS = 60_000;
const ECOFLOW_LOCAL_BLE_CONNECT_TIMEOUT_MS = 15_000;
const ECOFLOW_LOCAL_FIRST_TELEMETRY_TIMEOUT_MS = 15_000;
const DEBUG_DEVICE_CONNECTIONS =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  process.env.EXPO_PUBLIC_ECS_DEBUG_BLU_SCAN === '1';

type DiscoveredPowerDeviceLike = Partial<EcsDiscoveredDevice> & {
  device_id?: string;
  display_name?: string | null;
  last_seen?: number | null;
  signal_strength?: number | null;
  productType?: string | null;
  connectionType?: 'api' | 'ble' | 'hybrid' | string | null;
  requiresNativeBluetooth?: boolean | null;
  connectableViaCloud?: boolean | null;
  isOnline?: boolean | null;
  available?: boolean | null;
  source?: UnifiedDiscoverySource | null;
  brand?: string | null;
  category?: string | null;
  displayName?: string | null;
  sourceIds?: Partial<Record<UnifiedDiscoverySource, string>> | null;
};

type UnifiedDiscoveredPowerDevice = Omit<EcsDiscoveredDevice, 'provider'> & {
  provider: string;
  productType?: string;
  connectionType?: 'api' | 'ble' | 'hybrid' | string;
  requiresNativeBluetooth?: boolean;
  connectableViaCloud?: boolean;
  isOnline?: boolean | null;
  available?: boolean | null;
  source?: UnifiedDiscoverySource;
  sources?: UnifiedDiscoverySource[];
  sourceBadges?: string[];
  brand?: string;
  category?: string;
  displayName?: string;
  sourceIds?: Partial<Record<UnifiedDiscoverySource, string>>;
};

function isTransientConnectError(error: string | null | undefined, errorCode?: string | null): boolean {
  const code = String(errorCode ?? '').toUpperCase();
  if (code === 'PERMISSION_DENIED' || code === 'PLATFORM_UNSUPPORTED' || code === 'UNSUPPORTED_DEVICE') {
    return false;
  }
  if (code === 'CONNECT_FAILED' || code === 'DEVICE_UNAVAILABLE' || code === 'SCAN_FAILED') {
    return true;
  }

  const message = String(error ?? '').toLowerCase();
  if (!message) return false;
  if (/permission|denied|unsupported|pairing required|not available on web/.test(message)) {
    return false;
  }
  return /timeout|timed out|cancelled|canceled|temporar|unavailable|busy|failed to connect|connect failed|connection lost|device unavailable|scan failed/.test(message);
}

function getRetryDelayMs(attempt: number): number {
  const baseDelay = Math.min(
    CONNECT_RETRY_MAX_DELAY_MS,
    CONNECT_RETRY_BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1)),
  );
  const jitter = Math.round(baseDelay * (0.2 * Math.random()));
  return baseDelay + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function titleCaseToken(token: string): string {
  if (!token) return token;
  if (token.toUpperCase() === token) return token;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function normalizeUiLabel(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  return trimmed
    .replace(/\bOBD[- ]?II\b/gi, 'OBD2')
    .replace(/\bBLE\b/g, 'Bluetooth')
    .replace(/\s+/g, ' ');
}

function getFallbackBluetoothDeviceName(rawId: string): string {
  const suffix = rawId.trim().slice(-4).toUpperCase();
  return suffix ? `Bluetooth Device ${suffix}` : 'Bluetooth Device';
}

function isEcoFlowCloudDiscoveredDevice(device: UnifiedDiscoveredPowerDevice | null | undefined): boolean {
  return isEcoFlowCloudDeviceConnection(device);
}

function isEcoFlowCloudConnectionModel(device: ECSDeviceConnectionModel | null | undefined): boolean {
  return Boolean(device?.kind === 'power' && isEcoFlowCloudDeviceConnection(device));
}

function getProviderDisplayName(providerId: string): string {
  if (providerId === UNKNOWN_POWER_PROVIDER_ID) return 'Unknown power device';

  const knownLabel = POWER_PROVIDER_LABELS[providerId as BluProviderId];
  if (knownLabel) return knownLabel;

  const meta = getProviderMeta(providerId as BluProviderId);
  if (meta?.displayName) return meta.displayName;

  const cleaned = providerId
    .split(/[_-]+/)
    .map((token) => titleCaseToken(token))
    .join(' ');

  return normalizeUiLabel(cleaned) ?? 'Other';
}

function getPowerCategoryLabel(productType?: string | null): string {
  const normalized = String(productType ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (/fridge|refrigerator|glacier/.test(normalized)) return 'Refrigerator';
  if (/solar/.test(normalized)) return 'Solar Controller';
  if (/charger|dc_dc/.test(normalized)) return 'Power Charger';
  if (/battery/.test(normalized)) return 'Battery Monitor';
  return 'Power Device';
}

function getDiscoverySourceBadge(source: UnifiedDiscoverySource): string {
  switch (source) {
    case 'api':
      return 'API';
    case 'ble':
      return 'BLE';
    case 'classic_bluetooth':
      return 'Classic BT';
    case 'cached':
      return 'Cached';
    default:
      return 'Device';
  }
}

function getDiscoverySourceBadges(sources?: UnifiedDiscoverySource[] | null): string[] {
  return Array.from(new Set((sources ?? []).map(getDiscoverySourceBadge)));
}

function getTelemetryProviderLabel(): string {
  return 'OBD2 Telemetry';
}

function getTelemetryCategoryLabel(): string {
  return 'Vehicle Adapter';
}

function getAccessoryProviderLabel(kind: Extract<DeviceKind, 'sensor' | 'generic'>): string {
  return kind === 'sensor' ? 'Sensor Accessory' : 'Bluetooth Device';
}

function getAccessoryStatus(
  isConnected: boolean,
  isConnecting: boolean,
  isDisconnecting: boolean,
  hasError: boolean,
  isRemembered: boolean,
  isDiscoverable: boolean,
  isSelected: boolean,
): ECSConnectionStatus {
  if (isDisconnecting) return 'disconnecting';
  if (isConnecting) return 'connecting';
  if (isConnected) return 'connected';
  if (hasError) return 'failed';
  if (isRemembered && !isDiscoverable) return 'remembered';
  if (isSelected) return 'selected';
  if (isDiscoverable) return 'discoverable';
  return 'remembered';
}

function getAccessoryStateLabel(status: ECSConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting';
    case 'disconnecting':
      return 'Disconnecting';
    case 'failed':
      return 'Failed';
    case 'remembered':
      return 'Remembered';
    case 'selected':
      return 'Selected';
    case 'discoverable':
    default:
      return 'Available';
  }
}

function mapBluProviderToManagedPowerProvider(providerId: string): PowerProviderId | null {
  return BLU_TO_MANAGED_POWER_PROVIDER[providerId as BluProviderId] ?? null;
}

function isPermissionIssue(error: string | null | undefined): boolean {
  if (!error) return false;
  return /permission|permissions|denied|required|not granted/i.test(error);
}

function isBluetoothUnavailable(error: string | null | undefined): boolean {
  if (!error) return false;
  return /bluetooth|ble|not available|not supported|powered off|unavailable/i.test(error);
}

function getBluDeviceLogType(device: Pick<ECSDeviceConnectionModel, 'kind' | 'deviceCategory' | 'category'>): string {
  if (device.kind === 'telemetry') return 'obd2_adapter';
  if (device.kind === 'power') return device.category || 'power_device';
  if (device.kind === 'sensor') return device.deviceCategory || 'sensor';
  return device.deviceCategory || 'generic_bluetooth';
}

function getBluConnectionMode(device: Pick<ECSDeviceConnectionModel, 'connectionType' | 'kind' | 'providerId' | 'connectableViaCloud'>): string {
  if (device.providerId === 'ecoflow' && device.connectableViaCloud) return 'cloud';
  if (device.connectionType) return device.connectionType;
  return device.kind === 'telemetry' || device.kind === 'sensor' || device.kind === 'generic' ? 'ble' : 'unknown';
}

function isBluTimeoutLike(message: string | null | undefined): boolean {
  return /timeout|timed out|stall|no live|did not receive|status fetch|first poll|not yet flowing|unavailable/i.test(String(message ?? ''));
}

function formatSignal(signalStrength: number | null): string | null {
  if (typeof signalStrength !== 'number' || !Number.isFinite(signalStrength)) return null;
  return `${signalStrength} dBm`;
}

function normalizeDiscoveredPowerDevice(
  provider: string,
  device: DiscoveredPowerDeviceLike,
): UnifiedDiscoveredPowerDevice | null {
  const id = typeof device.id === 'string' && device.id.trim().length > 0
    ? device.id.trim()
    : typeof device.device_id === 'string' && device.device_id.trim().length > 0
      ? device.device_id.trim()
      : null;

  const name =
    normalizeUiLabel(device.name) ??
    normalizeUiLabel(device.display_name) ??
    normalizeUiLabel(device.displayName) ??
    getProviderDisplayName(provider);
  const model =
    normalizeUiLabel(device.model) ??
    name;
  const signalStrength =
    typeof device.rssi === 'number' && Number.isFinite(device.rssi)
      ? device.rssi
      : typeof device.signal_strength === 'number' && Number.isFinite(device.signal_strength)
        ? device.signal_strength
        : DEFAULT_DISCOVERED_RSSI;
  const discoveredAt =
    typeof device.discoveredAt === 'number' && Number.isFinite(device.discoveredAt)
      ? device.discoveredAt
      : typeof device.last_seen === 'number' && Number.isFinite(device.last_seen)
        ? device.last_seen
        : Date.now();
  const raw = device.raw && typeof device.raw === 'object'
    ? device.raw as Record<string, unknown>
    : null;
  const productType =
    normalizeUiLabel(device.productType) ??
    normalizeUiLabel(raw?.productType as string | null | undefined) ??
    normalizeUiLabel(raw?.category as string | null | undefined) ??
    undefined;
  const connectionType =
    normalizeDeviceConnectionType(device.connectionType) ??
    normalizeDeviceConnectionType(raw?.connectionType as string | null | undefined) ??
    undefined;
  const source =
    device.source ??
    (isCloudConnectionType(connectionType) ? 'api' : 'ble');
  const sourceIds =
    device.sourceIds ??
    (raw?.sourceIds && typeof raw.sourceIds === 'object'
      ? raw.sourceIds as Partial<Record<UnifiedDiscoverySource, string>>
      : undefined);
  const sources = source ? [source] : undefined;
  const displayName = normalizeUiLabel(device.displayName) ?? name;
  const brand = normalizeUiLabel(device.brand) ?? getProviderDisplayName(provider);
  const connectableViaCloud =
    device.connectableViaCloud === true ||
    raw?.connectableViaCloud === true ||
    (provider === 'ecoflow' && (source === 'api' || isCloudConnectionType(connectionType)));
  const requiresNativeBluetooth =
    device.requiresNativeBluetooth === false || raw?.requiresNativeBluetooth === false
      ? false
      : !connectableViaCloud;
  const resolvedId = id ?? getScannerDeviceStableKey({
    source,
    sources,
    name,
    displayName,
    brand,
    model,
    rssi: signalStrength,
    lastSeenAt: discoveredAt,
    sourceIds,
    raw,
  }, discoveredAt);

  if (!resolvedId) {
    ecsLog.warn('TELEMETRY', '[BT_SCAN] device_dropped', {
      reason: 'missing_stable_identifier',
      provider,
      source,
      name,
    });
    return null;
  }

  return {
    id: resolvedId,
    name,
    displayName,
    model,
    provider,
    rssi: signalStrength,
    modelDisplayName: normalizeUiLabel(device.modelDisplayName) ?? undefined,
    discoveredAt,
    productType,
    connectionType,
    requiresNativeBluetooth,
    connectableViaCloud,
    source,
    sources,
    sourceBadges: getDiscoverySourceBadges(sources),
    brand,
    category: normalizeUiLabel(device.category) ?? productType ?? getPowerCategoryLabel(productType),
    sourceIds,
    isOnline: typeof device.isOnline === 'boolean'
      ? device.isOnline
      : typeof raw?.isOnline === 'boolean'
        ? raw.isOnline
        : null,
    available: typeof device.available === 'boolean'
      ? device.available
      : typeof raw?.available === 'boolean'
        ? raw.available
        : null,
    raw: device.raw ?? device,
  };
}

function normalizeEcoFlowDiscoveryMatchText(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getEcoFlowDiscoveryText(device: UnifiedDiscoveredPowerDevice): string {
  const raw = device.raw && typeof device.raw === 'object'
    ? device.raw as Record<string, unknown>
    : {};
  return [
    device.id,
    device.name,
    device.displayName,
    device.model,
    device.modelDisplayName,
    device.productType,
    raw.deviceId,
    raw.deviceName,
    raw.name,
    raw.model,
    raw.productName,
    raw.productType,
    raw.serial,
    raw.sn,
    raw.serialNumber,
  ].map(normalizeEcoFlowDiscoveryMatchText).filter(Boolean).join(' ');
}

function isEcoFlowLocalDiscovery(device: UnifiedDiscoveredPowerDevice): boolean {
  const source = device.source ?? (device.connectionType === 'api' ? 'api' : 'ble');
  return (
    device.provider === 'ecoflow' &&
    (source === 'ble' || source === 'classic_bluetooth' || device.connectionType === 'ble' || device.connectionType === 'hybrid')
  );
}

function isEcoFlowCloudDiscovery(device: UnifiedDiscoveredPowerDevice): boolean {
  const source = device.source ?? (device.connectionType === 'api' ? 'api' : 'ble');
  return (
    device.provider === 'ecoflow' &&
    (source === 'api' || device.connectionType === 'api' || device.connectableViaCloud === true || device.requiresNativeBluetooth === false)
  );
}

function findEcoFlowCloudMatchForLocalDiscovery(
  local: UnifiedDiscoveredPowerDevice,
  entries: UnifiedDiscoveredPowerDevice[],
): UnifiedDiscoveredPowerDevice | null {
  if (!isEcoFlowLocalDiscovery(local)) return null;
  if (local.sourceIds?.api) return null;

  const localText = getEcoFlowDiscoveryText(local);
  if (!localText) return null;
  const localSuffixes = new Set(
    localText
      .split(/\s+/)
      .flatMap((part) => {
        const matches = part.match(/[a-z0-9]{4,}$/g) ?? [];
        return matches.map((match) => match.slice(-4));
      })
      .filter((suffix) => suffix.length >= 4),
  );
  const localModelTokens = [
    /delta3/.test(localText) ? 'delta3' : null,
    /delta31500/.test(localText) ? 'delta31500' : null,
    /deltamini/.test(localText) ? 'deltamini' : null,
    /delta2/.test(localText) ? 'delta2' : null,
    /river/.test(localText) ? 'river' : null,
    /glacier/.test(localText) ? 'glacier' : null,
    /wave/.test(localText) ? 'wave' : null,
  ].filter((token): token is string => token != null);

  for (const candidate of entries) {
    if (!isEcoFlowCloudDiscovery(candidate)) continue;
    const apiId = candidate.sourceIds?.api ?? candidate.id;
    const apiSuffix = normalizeEcoFlowDiscoveryMatchText(apiId).slice(-4);
    const candidateText = getEcoFlowDiscoveryText(candidate);
    const hasSuffixMatch = apiSuffix.length >= 4 && localSuffixes.has(apiSuffix);
    const hasModelMatch = localModelTokens.some((token) => candidateText.includes(token));

    if (hasSuffixMatch) return candidate;
    if (hasModelMatch && localText && candidateText && (localText.includes(candidateText) || candidateText.includes(localText))) {
      return candidate;
    }
  }

  return null;
}

function mergeDiscoveredPowerDevices(
  devices: (UnifiedDiscoveredPowerDevice | null)[],
): UnifiedDiscoveredPowerDevice[] {
  const entries = devices.filter((device): device is UnifiedDiscoveredPowerDevice => device != null);
  const bySourceRecord = new Map<string, UnifiedDiscoveredPowerDevice>();
  const normalized = entries.map((device) => {
    const raw = device.raw && typeof device.raw === 'object'
      ? device.raw as Record<string, unknown>
      : {};
    const source = device.source ?? (device.connectionType === 'api' ? 'api' : 'ble');
    const sourceIds = device.sourceIds ?? (
      raw.sourceIds && typeof raw.sourceIds === 'object'
        ? raw.sourceIds as Partial<Record<UnifiedDiscoverySource, string>>
        : undefined
    );
    const ecoFlowCloudMatch = findEcoFlowCloudMatchForLocalDiscovery(device, entries);
    const apiDeviceId = sourceIds?.api ?? ecoFlowCloudMatch?.sourceIds?.api ?? ecoFlowCloudMatch?.id;
    const record = normalizeDiscoveredDevice({
      id: device.id,
      source,
      apiDeviceId,
      bleDeviceId: sourceIds?.ble,
      classicDeviceId: sourceIds?.classic_bluetooth,
      serial:
        normalizeUiLabel(raw.serial as string | null | undefined) ??
        normalizeUiLabel(raw.sn as string | null | undefined) ??
        normalizeUiLabel(raw.serialNumber as string | null | undefined),
      brand: device.brand ?? getProviderDisplayName(device.provider),
      model: device.modelDisplayName ?? device.model,
      displayName: device.displayName ?? device.name,
      category: device.category ?? device.productType ?? getPowerCategoryLabel(device.productType),
      connectionType: device.connectionType,
      rssi: device.rssi,
      online: device.isOnline,
      available: device.available,
      lastSeenAt: device.discoveredAt,
      raw: device,
    });
    if (record) {
      bySourceRecord.set(`${record.source}:${record.id}`, device);
    }
    return record;
  });

  return mergeDiscoveredDevices(normalized).map((record): UnifiedDiscoveredPowerDevice => {
    const hasLocalBluetoothSource =
      record.sources.includes('ble') || record.sources.includes('classic_bluetooth');
    const matchesMergedRecord = (device: UnifiedDiscoveredPowerDevice): boolean => {
      const source = device.source ?? (device.connectionType === 'api' ? 'api' : 'ble');
      const normalizedId = device.id.toLowerCase().replace(/[^a-z0-9]+/g, '');
      const sourceKey = `${source}:${normalizedId}`;
      return record.stableKeys.includes(sourceKey) ||
        (device.sourceIds?.api != null && record.sourceIds.api === device.sourceIds.api) ||
        (device.sourceIds?.ble != null && record.sourceIds.ble === device.sourceIds.ble) ||
        (device.sourceIds?.classic_bluetooth != null && record.sourceIds.classic_bluetooth === device.sourceIds.classic_bluetooth);
    };
    const localSourceRecord =
      hasLocalBluetoothSource
        ? entries.find((device) => {
            if (!matchesMergedRecord(device)) return false;
            const source = device.source ?? (device.connectionType === 'api' ? 'api' : 'ble');
            return source === 'ble' || source === 'classic_bluetooth';
          }) ?? null
        : null;
    const primary =
      localSourceRecord ??
      bySourceRecord.get(`${record.source}:${record.id}`) ??
      entries.find((device) => {
        const source = device.source ?? (device.connectionType === 'api' ? 'api' : 'ble');
        const key = `${source}:${device.id.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
        return record.stableKeys.includes(key);
      }) ??
      entries[0];
    const provider = primary?.provider ?? 'ecoflow';
    const sources = record.sources;
    const primaryRaw = primary?.raw && typeof primary.raw === 'object'
      ? primary.raw as Record<string, unknown>
      : {};
    const connectableViaCloud =
      primary?.connectableViaCloud === true ||
      primaryRaw.connectableViaCloud === true ||
      (provider === 'ecoflow' && ((sources ?? []).includes('api') || isCloudConnectionType(record.connectionType)));
    const preferEcoFlowCloudTelemetry =
      provider === 'ecoflow' &&
      connectableViaCloud &&
      (typeof record.sourceIds.api === 'string' || (sources ?? []).includes('api') || isCloudConnectionType(record.connectionType));
    const requiresNativeBluetooth =
      preferEcoFlowCloudTelemetry
        ? false
        : hasLocalBluetoothSource
        ? true
        : primary?.requiresNativeBluetooth === false ||
          primaryRaw.requiresNativeBluetooth === false ||
          connectableViaCloud
          ? false
          : true;
    const localSourceId =
      record.sourceIds.ble ??
      record.sourceIds.classic_bluetooth ??
      localSourceRecord?.id ??
      null;
    const resolvedId = preferEcoFlowCloudTelemetry
      ? record.sourceIds.api ?? record.id
      : hasLocalBluetoothSource && localSourceId
        ? localSourceId
        : record.id;
    const resolvedSource =
      preferEcoFlowCloudTelemetry
        ? 'api'
        : hasLocalBluetoothSource
        ? localSourceRecord?.source ?? (record.sourceIds.ble ? 'ble' : 'classic_bluetooth')
        : record.source;
    const resolvedConnectionType = preferEcoFlowCloudTelemetry
      ? 'api'
      : record.connectionType;

    return {
      ...(primary ?? {
        id: record.id,
        name: record.displayName,
        model: record.model,
        provider,
        rssi: record.rssi ?? DEFAULT_DISCOVERED_RSSI,
        discoveredAt: record.lastSeenAt,
      }),
      id: resolvedId,
      name: record.displayName,
      displayName: record.displayName,
      model: record.model,
      provider,
      rssi: record.rssi ?? primary?.rssi ?? DEFAULT_DISCOVERED_RSSI,
      discoveredAt: record.lastSeenAt,
      source: resolvedSource,
      sources,
      sourceBadges: getDiscoverySourceBadges(sources),
      sourceIds: record.sourceIds,
      brand: record.brand,
      category: record.category,
      productType: primary?.productType ?? record.category,
      connectionType: resolvedConnectionType,
      requiresNativeBluetooth,
      connectableViaCloud,
      isOnline: record.online,
      available: record.available,
      raw: record.raw,
    };
  }).sort((left, right) => {
    if (left.provider !== right.provider) {
      return left.provider.localeCompare(right.provider);
    }
    const signalDelta = (right.rssi ?? DEFAULT_DISCOVERED_RSSI) - (left.rssi ?? DEFAULT_DISCOVERED_RSSI);
    if (signalDelta !== 0) return signalDelta;
    return left.name.localeCompare(right.name);
  });
}

function upsertDiscoveredPowerDeviceList(
  current: UnifiedDiscoveredPowerDevice[],
  incoming: UnifiedDiscoveredPowerDevice[],
  reason: string,
): ScannerDeviceListUpsertResult<UnifiedDiscoveredPowerDevice> {
  return upsertScannerDeviceList(current, incoming, {
    reason,
    logTag: '[BT_SCAN]',
    brandAllowlist: POWER_SCANNER_BRAND_ALLOWLIST,
    requireBrandAllowlistMatch: true,
  });
}

function getPowerSupportDescriptor(providerId: string): PowerSupportDescriptor {
  const readiness = getBluestackProviderReadiness(providerId);
  if (providerId === UNKNOWN_POWER_PROVIDER_ID) {
    return {
      supportLevel: 'generic',
      supportLabel: 'Needs Identification',
      supportNote: 'Nearby advertisement looks power-related, but ECS could not verify a supported brand from the advertisement.',
      isSupported: false,
    };
  }

  const meta = getProviderMeta(providerId as BluProviderId);
  switch (meta?.status) {
    case 'verified':
      return {
        supportLevel: 'verified',
        supportLabel: providerId === 'ecoflow' ? 'Cloud/API' : 'Supported',
        supportNote: readiness.statusDetail,
        isSupported: true,
      };
    case 'implemented':
      return {
        supportLevel: 'implemented_unverified',
        supportLabel: 'Parser Pending',
        supportNote: readiness.statusDetail,
        isSupported: true,
      };
    case 'limited':
      return {
        supportLevel: 'partial',
        supportLabel: readiness.stage === 'native_parser_pending' ? 'Parser Pending' : 'Partial Support',
        supportNote: readiness.statusDetail,
        isSupported: true,
      };
    case 'planned':
    default:
      return {
        supportLevel: 'ui_only',
        supportLabel: readiness.statusLabel,
        supportNote: readiness.statusDetail,
        isSupported: false,
      };
  }
}

function getPowerLifecycleStatus(
  isConnected: boolean,
  isConnecting: boolean,
  isDisconnecting: boolean,
  isLive: boolean,
  freshness: TelemetryFreshness,
  hasError: boolean,
  isRemembered: boolean,
  isDiscoverable: boolean,
  isSelected: boolean,
  supportLevel: ECSConnectionSupportLevel,
): ECSConnectionStatus {
  if (isDisconnecting) return 'disconnecting';
  if (isLive) return 'live';
  if (isConnecting) return 'connecting';
  if (isConnected) {
    return freshness === 'stale' || freshness === 'expired' ? 'stale' : 'connected';
  }
  if (hasError) return 'failed';
  if (!isDiscoverable && supportLevel === 'ui_only') return 'unsupported';
  if (!isDiscoverable && supportLevel === 'partial') return 'partial';
  if (isRemembered) return 'remembered';
  if (isSelected) return 'selected';
  if (isDiscoverable) return 'discoverable';
  if (supportLevel === 'ui_only') return 'unsupported';
  if (supportLevel === 'partial') return 'partial';
  return 'discoverable';
}

function getTelemetryStatus(
  isConnected: boolean,
  isConnecting: boolean,
  isDisconnecting: boolean,
  isLive: boolean,
  hasError: boolean,
  isRemembered: boolean,
  isDiscoverable: boolean,
  isSelected: boolean,
  freshnessLabel: string,
): ECSConnectionStatus {
  if (isDisconnecting) return 'disconnecting';
  if (isLive) return 'live';
  if (isConnecting) return 'connecting';
  if (isConnected) {
    return freshnessLabel === 'stale' || freshnessLabel === 'last_known' ? 'stale' : 'connected';
  }
  if (hasError) return 'failed';
  if (isRemembered) return 'remembered';
  if (isSelected) return 'selected';
  if (!isDiscoverable) return 'remembered';
  return 'discoverable';
}

function getSectionForStatus(
  status: ECSConnectionStatus,
  isConnected: boolean,
  isDiscoverable: boolean,
): ECSConnectionSection {
  if (isConnected) return 'connected';
  if (status === 'discoverable' || status === 'selected' || status === 'connecting' || status === 'disconnecting') {
    return 'nearby';
  }
  if (isDiscoverable && (status === 'partial' || status === 'unsupported')) {
    return 'nearby';
  }
  if (status === 'remembered') {
    return 'known';
  }
  return 'attention';
}

function getPowerStateLabel(status: ECSConnectionStatus, isLive: boolean): string {
  switch (status) {
    case 'live':
      return isLive ? 'Telemetry Active' : 'Live Data';
    case 'connected':
      return 'Connected';
    case 'disconnecting':
      return 'Disconnecting';
    case 'connecting':
      return 'Connecting';
    case 'failed':
      return 'Failed';
    case 'remembered':
      return 'Remembered';
    case 'unsupported':
      return 'Unsupported';
    case 'partial':
      return 'Partial Support';
    case 'stale':
      return 'Stale';
    case 'selected':
      return 'Selected';
    case 'discoverable':
    default:
      return 'Available';
  }
}

function getEcoFlowStateLabel(
  status: ECSConnectionStatus,
  isLive: boolean,
  diagnostic: EcoFlowDeviceConnectionState | null,
): string {
  if (isLive) return 'Telemetry Active';

  switch (diagnostic?.phase) {
    case 'handshaking':
      return 'Handshaking';
    case 'awaitingTelemetry':
      return 'Awaiting Telemetry';
    case 'cloudPolling':
      return 'Cloud Polling';
    case 'streaming':
      return 'Telemetry Active';
    case 'timeout':
      return diagnostic.timeoutKind === 'firstTelemetryTimeout' ? 'No Telemetry' : 'Timeout';
    case 'failed':
      return 'Failed';
    case 'disconnected':
      return 'Disconnected';
    case 'connected':
      return 'Connected';
    default:
      return getPowerStateLabel(status, isLive);
  }
}

function getPowerDetailLabel(args: {
  isLive: boolean;
  isConnected: boolean;
  freshness: TelemetryFreshness;
  telemetrySource: BluetoothTelemetrySource;
  telemetryUnsupported: boolean;
  lastError: string | null;
  hasError: boolean;
  hasRememberedDevice: boolean;
  hasDiscoveredDevice: boolean;
  supportLevel: ECSConnectionSupportLevel;
  productType?: string | null;
  connectionType?: string | null;
  isOnline?: boolean | null;
  ecoflowDiagnostic?: EcoFlowDeviceConnectionState | null;
}): string {
  if (args.isLive && args.telemetrySource === 'provider_cloud') {
    return 'Provider cloud telemetry is current. Native Bluetooth is not required for this device.';
  }
  if (args.isLive) {
    return 'Live Bluetooth telemetry is flowing into ECS.';
  }
  if (args.ecoflowDiagnostic?.diagnosticReason) {
    const reason = normalizeUiLabel(args.ecoflowDiagnostic.diagnosticReason.reason);
    if (reason) {
      return reason;
    }
  }
  if (args.ecoflowDiagnostic?.cloudState === 'deviceOffline') {
    return 'EcoFlow Cloud reports this device offline or unavailable.';
  }
  if (args.ecoflowDiagnostic?.cloudState === 'cloudUnavailable') {
    return 'EcoFlow Cloud is unavailable. ECS will not treat this as a Bluetooth failure.';
  }
  if (args.ecoflowDiagnostic?.cloudState === 'cloudStale') {
    return 'EcoFlow Cloud is connected, but ECS has not received fresh telemetry for this device.';
  }
  if (args.ecoflowDiagnostic?.phase === 'awaitingTelemetry') {
    return 'EcoFlow connection is established and ECS is waiting for the first telemetry packet.';
  }
  if (args.ecoflowDiagnostic?.phase === 'cloudPolling' && !args.isLive) {
    return 'EcoFlow Cloud is polling, but ECS has not decoded live telemetry for this device yet.';
  }
  if (args.isConnected) {
    if (args.telemetrySource === 'provider_cloud') {
      return 'Provider cloud/API is linked, but ECS has not received live telemetry for this device yet.';
    }
    if (args.telemetrySource === 'cache' || args.freshness === 'stale' || args.freshness === 'expired') {
      return 'Connected, but ECS is showing last-known power data.';
    }
    if (args.telemetryUnsupported) {
      return 'Connected over Bluetooth; telemetry is not decoded for this model yet.';
    }
    return 'Connected, but live power telemetry is not yet flowing.';
  }
  if (args.hasError) {
    return normalizeUiLabel(args.lastError) ?? 'Connection failed.';
  }
  if (args.hasRememberedDevice && !args.hasDiscoveredDevice) {
    return 'Previously connected. Not currently live.';
  }
  if (args.hasDiscoveredDevice) {
    const isApi = String(args.connectionType ?? '').toLowerCase() === 'api';
    const isFridge = /fridge|refrigerator|glacier/i.test(String(args.productType ?? ''));
    if (isApi && isFridge) {
      return args.isOnline === false
        ? 'EcoFlow Glacier refrigerator found through the EcoFlow API. It is currently reported offline.'
        : 'EcoFlow Glacier refrigerator found through the EcoFlow API and ready to connect.';
    }
    if (args.supportLevel === 'ui_only') {
      return isApi
        ? 'Nearby through an API source. Use the provider API path to connect.'
        : 'Nearby, but ECS does not support a live connection path for this device yet.';
    }
    if (args.supportLevel === 'partial') {
      return 'Nearby and discoverable. ECS support is limited for this device.';
    }
    return 'Nearby and ready to connect.';
  }
  return 'Available through ECS provider discovery.';
}

function getTelemetryStateLabel(status: ECSConnectionStatus, isLive: boolean): string {
  switch (status) {
    case 'live':
      return isLive ? 'Connected' : 'Live Telemetry';
    case 'connected':
      return 'Connected';
    case 'disconnecting':
      return 'Disconnecting';
    case 'connecting':
      return 'Connecting';
    case 'failed':
      return 'Failed';
    case 'remembered':
      return 'Remembered';
    case 'stale':
      return 'Stale';
    case 'selected':
      return 'Selected';
    case 'discoverable':
    default:
      return 'Available';
  }
}

function sortDevices(devices: ECSDeviceConnectionModel[]): ECSDeviceConnectionModel[] {
  const sectionOrder: Record<ECSConnectionSection, number> = {
    connected: 0,
    nearby: 1,
    known: 2,
    attention: 3,
  };

  const statusOrder: Record<ECSConnectionStatus, number> = {
    live: 0,
    connected: 1,
    disconnecting: 2,
    connecting: 3,
    selected: 4,
    discoverable: 5,
    partial: 6,
    failed: 7,
    stale: 8,
    remembered: 9,
    unsupported: 10,
  };

  return [...devices].sort((left, right) => {
    const bySection = sectionOrder[left.section] - sectionOrder[right.section];
    if (bySection !== 0) return bySection;

    const byStatus = statusOrder[left.status] - statusOrder[right.status];
    if (byStatus !== 0) return byStatus;

    const byProvider = left.provider.localeCompare(right.provider);
    if (byProvider !== 0) return byProvider;

    return left.name.localeCompare(right.name);
  });
}

function isFallbackObd2CandidateName(name: string | null | undefined): boolean {
  if (!name) return false;
  const normalized = name.trim();
  return /^(Unknown device|Bluetooth Device|BLE Device|OBD2 Adapter)( [A-Z0-9]{4})?$/i.test(normalized);
}

function isObviousBluetoothNoiseName(name: string | null | undefined): boolean {
  if (!name) return false;
  return /\b(tv|roku|airpods?|earbuds?|headphones?|speaker|keyboard|mouse|watch|remote|printer|thermostat|light|bulb|soundbar)\b/i.test(name);
}

function hasObd2FallbackEvidence(device: OBD2DiscoveredDevice): boolean {
  const serviceCount = device.serviceUUIDs?.length ?? 0;
  const hasManufacturerData = typeof device.manufacturerData === 'string' && device.manufacturerData.trim().length > 0;
  const hasSpecificName = !isFallbackObd2CandidateName(device.name) && !isObviousBluetoothNoiseName(device.name);
  return device.isLikelyOBD || serviceCount > 0 || hasManufacturerData || hasSpecificName;
}

function isObd2FallbackCandidate(device: OBD2DiscoveredDevice): boolean {
  const rssi = typeof device.rssi === 'number' && Number.isFinite(device.rssi) ? device.rssi : null;
  if (rssi != null && rssi < OBD2_FALLBACK_CANDIDATE_MIN_RSSI) return false;
  if (hasObd2FallbackEvidence(device)) return true;
  return rssi != null && rssi >= OBD2_STRONG_UNKNOWN_CANDIDATE_MIN_RSSI;
}

function getObd2FallbackCandidateName(device: OBD2DiscoveredDevice, index: number): string {
  if (device.name && !isFallbackObd2CandidateName(device.name)) {
    return device.name;
  }
  const suffix = device.id.trim().replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
  return suffix
    ? `OBD2 candidate ${suffix}`
    : `OBD2 candidate ${index + 1}`;
}

async function ensureManagedPowerOwnership(
  providerId: BluProviderId,
  deviceId: string,
  deviceName: string,
  model: string | null,
  signalStrength: number | null,
  connectionMethod: ConnectionMethod = 'ble',
  connectionState: 'connected' | 'disconnected' | 'reconnecting' | 'unavailable' = 'connected',
): Promise<void> {
  const managedProvider = mapBluProviderToManagedPowerProvider(providerId);
  if (!managedProvider) return;

  const existing = powerSetupStore.getByProviderDevice(managedProvider, deviceId);
  if (existing) {
    await powerSetupStore.update(existing.id, {
      providerDeviceId: deviceId,
      connectionMethod,
      originalName: deviceName,
      customName: existing.customName || deviceName,
      model: model ?? existing.model,
      connectionState,
      signalStrength,
    });
    return;
  }

  await powerSetupStore.add({
    provider: managedProvider,
    providerDeviceId: deviceId,
    connectionMethod,
    originalName: deviceName,
    customName: deviceName,
    model: model ?? deviceName,
    role: 'unassigned',
    vehicleId: null,
    isPrimary: powerSetupStore.count() === 0,
    connectionState,
    lastSocPct: null,
    lastWattsIn: null,
    lastWattsOut: null,
    signalStrength,
  });
}

async function updateManagedPowerOwnershipState(
  providerId: BluProviderId,
  deviceId: string,
  connectionState: 'connected' | 'disconnected' | 'reconnecting' | 'unavailable',
  signalStrength: number | null,
): Promise<void> {
  const managedProvider = mapBluProviderToManagedPowerProvider(providerId);
  if (!managedProvider) return;
  const existing = powerSetupStore.getByProviderDevice(managedProvider, deviceId);
  if (!existing) return;

  await powerSetupStore.update(existing.id, {
    connectionState,
    signalStrength,
  });
}

function makeEcoFlowCloudConnectionDevice(device: ECSDeviceConnectionModel): EcoFlowCloudConnectionDevice {
  return {
    rawId: device.rawId,
    name: device.name,
    subtype: device.subtype,
    category: device.category,
    productType: device.category,
    signalStrength: device.signalStrength,
  };
}

function ingestEcoFlowCloudTelemetryResult(
  device: Pick<ECSDeviceConnectionModel, 'rawId' | 'name'>,
  result: EcoFlowCloudConnectionResult,
): void {
  if (!result.telemetry) {
    if (result.statusError) {
      bluStateStore.recordPollFailure(result.statusError);
      bluLogThrottled(
        '[BLU_TIMEOUT]',
        `ecoflow-cloud-no-telemetry:${device.rawId}:${result.statusError}`,
        'ecoflow_cloud_poll_no_telemetry',
        buildBluTimeoutLogDetails({
          deviceId: device.rawId,
          vendor: 'ecoflow',
          phase: 'ecoflow_cloud_poll',
          timeoutMs: ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS,
          lastSuccessfulPhase: result.connected ? 'cloud_connect' : null,
          lastPacketAt: null,
          errorCode: result.statusError,
          message: result.statusLabel,
        }),
        10_000,
      );
    }
    return;
  }

  bluLogThrottled(
    '[BLU_TELEMETRY]',
    `ecoflow-cloud-telemetry:${device.rawId}`,
    'ecoflow_cloud_telemetry',
    buildBluTelemetryLogDetails({
      deviceId: device.rawId,
      vendor: 'ecoflow',
      telemetry: result.telemetry,
      streamMode: 'cloud_poll',
      lastPacketAt: result.telemetry.quality?.lastPacketAt ?? result.telemetry.timestamp ?? Date.now(),
      productType: result.productType,
      telemetryActive: result.telemetryActive,
    }),
    10_000,
  );
  powerTelemetryManager.ingestTelemetry(result.telemetry);
  bluStateStore.ingestEcoFlowData({
    deviceId: device.rawId,
    deviceName: device.name,
    batteryPct: result.batteryPct,
    solarWatts: result.solarWatts,
    inputWatts: result.inputWatts,
    outputWatts: result.outputWatts,
    estimatedRuntimeMinutes: result.telemetry?.battery?.estRuntimeMin ?? null,
    capacityWh: (result.telemetry as any)?.raw?.capacityWh ?? null,
    status: result.telemetryActive ? 'telemetry_active' : 'cloud_available',
  });
}

function startEcoFlowCloudLiveRefresh(device: ECSDeviceConnectionModel): void {
  bluLog('[BLU_STREAM]', 'ecoflow_cloud_polling_start', {
    deviceId: device.rawId,
    vendor: 'ecoflow',
    streamMode: 'cloud_poll',
    intervalMs: ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS,
  });
  startEcoFlowCloudTelemetryPolling(makeEcoFlowCloudConnectionDevice(device), (nextResult) => {
    ingestEcoFlowCloudTelemetryResult(device, nextResult);
  });
}

async function activateEcoFlowCloudDevice(device: ECSDeviceConnectionModel): Promise<EcoFlowCloudConnectionResult> {
  const startedAt = Date.now();
  bluLog('[BLU_ECOFLOW]', 'cloud_activation_start', buildBluConnectionAttemptLogDetails({
    deviceId: device.rawId,
    vendor: 'ecoflow',
    deviceType: getBluDeviceLogType(device),
    connectionMode: 'cloud',
    startedAt,
    timeoutMs: ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS,
    attempt: 1,
    name: device.name,
    category: device.category,
  }));
  recordEcoFlowConnectionPhase({
    deviceId: device.rawId,
    deviceName: device.name,
    productType: device.category,
    phase: 'connecting',
    source: 'ecoflow-cloud',
    lastSuccessfulPhase: 'discovered',
  });
  setSelectedEcoFlowDevice(device.rawId, device.name);
  await powerDeviceStore.addSelected('EcoFlow', device.rawId);
  const ecoFlowEligibility = normalizeEcoFlowBluCandidate({
    deviceId: device.rawId,
    deviceName: device.name,
    model: device.subtype,
    productType: device.category,
  });
  const isEcoFlowUnknownCloudDevice = ecoFlowEligibility.productType === 'unknown';
  const isEcoFlowRefrigeratorCloudDevice = ecoFlowEligibility.productType === 'refrigerator';
  const isEcoFlowPortableAcCloudDevice = ecoFlowEligibility.productType === 'portable_ac';
  const isEcoFlowChargerCloudDevice = ecoFlowEligibility.productType === 'charger';
  let capabilities = { ...DEFAULT_BLU_CAPABILITIES };
  if (isEcoFlowRefrigeratorCloudDevice || isEcoFlowPortableAcCloudDevice) {
    capabilities = {
      ...DEFAULT_BLU_CAPABILITIES,
      hasInputWatts: false,
      hasOutputWatts: false,
      hasSolarInput: false,
      hasAcOutput: false,
      hasDcOutput: false,
      hasRuntimeEstimate: false,
      hasTemperature: true,
    };
  } else if (isEcoFlowChargerCloudDevice) {
    capabilities = {
      ...DEFAULT_BLU_CAPABILITIES,
      hasBatteryPercent: false,
      hasInputWatts: false,
      hasOutputWatts: false,
      hasSolarInput: false,
      hasAcOutput: false,
      hasDcOutput: false,
      hasRuntimeEstimate: false,
      hasTemperature: false,
    };
  }
  await bluDeviceRegistry.registerDevice({
    provider: 'ecoflow',
    device_id: device.rawId,
    display_name: device.name,
    model: device.subtype ?? device.name,
    product_type: ecoFlowEligibility.productType,
    telemetry_capable: ecoFlowEligibility.telemetryCapable || isEcoFlowUnknownCloudDevice,
    connection_state: 'connecting',
    last_seen: Date.now(),
    capabilities,
  });
  await bluDeviceRegistry.ensurePrimary('ecoflow');
  await ensureManagedPowerOwnership(
    'ecoflow',
    device.rawId,
    device.name,
    device.subtype ?? device.name,
    device.signalStrength,
    'cloud',
    'reconnecting',
  );

  const result = await connectEcoFlowCloudDevice(makeEcoFlowCloudConnectionDevice(device));
  if (result.connected && result.telemetryActive) {
    recordEcoFlowConnectionPhase({
      deviceId: device.rawId,
      deviceName: device.name,
      productType: result.productType,
      phase: 'streaming',
      source: 'ecoflow-cloud',
      lastSuccessfulPhase: 'connected',
      lastPacketAt: result.telemetry?.quality?.lastPacketAt ?? result.telemetry?.timestamp ?? null,
    });
  } else if (result.connected) {
    const requiresCloudAuth =
      result.cloudState === 'authRequired' ||
      result.cloudState === 'deviceUnauthorized' ||
      /authorization|required|not authorized|forbidden/i.test(result.statusError ?? result.statusLabel);
    recordEcoFlowTimeout({
      deviceId: device.rawId,
      deviceName: device.name,
      productType: result.productType,
      source: 'ecoflow-cloud',
      timeoutKind: 'firstTelemetryTimeout',
      reason: result.statusError ?? 'EcoFlow cloud connected, but no live telemetry was decoded on the first poll.',
      canRetry: !requiresCloudAuth,
      requiresCloudAuth,
      requiresNativeBle: false,
      cloudState: result.cloudState ?? 'cloudStale',
      lastSuccessfulPhase: 'connected',
      lastPacketAt: null,
    });
  } else {
    const requiresCloudAuth =
      result.cloudState === 'authRequired' ||
      result.cloudState === 'deviceUnauthorized' ||
      /authorization|required|not authorized|forbidden/i.test(result.statusError ?? result.statusLabel);
    recordEcoFlowFailure({
      deviceId: device.rawId,
      deviceName: device.name,
      productType: result.productType,
      source: 'ecoflow-cloud',
      reason: result.statusError ?? result.statusLabel,
      canRetry: !requiresCloudAuth,
      requiresCloudAuth,
      requiresNativeBle: false,
      cloudState: result.cloudState ?? null,
      lastSuccessfulPhase: 'connecting',
    });
  }
  bluLog(
    result.connected ? '[BLU_HANDSHAKE]' : '[BLU_TIMEOUT]',
    result.connected ? 'ecoflow_cloud_activation_complete' : 'ecoflow_cloud_activation_failed',
    result.connected
      ? {
          deviceId: device.rawId,
          vendor: 'ecoflow',
          phase: 'cloud_connect',
          connectionMode: 'cloud',
          productType: result.productType,
          telemetryActive: result.telemetryActive,
          providerStatus: result.providerStatus,
          cloudState: result.cloudState,
          statusLabel: result.statusLabel,
        }
      : buildBluTimeoutLogDetails({
          deviceId: device.rawId,
          vendor: 'ecoflow',
          phase: 'ecoflow_cloud_connect',
          timeoutMs: ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS,
          lastSuccessfulPhase: 'device_registered',
          lastPacketAt: null,
          errorCode: result.statusError,
          message: result.statusLabel,
        }),
  );

  await bluDeviceRegistry.updateConnectionState(
    'ecoflow',
    device.rawId,
    result.connected ? 'connected' : 'error',
  );
  await updateManagedPowerOwnershipState(
    'ecoflow',
    device.rawId,
    result.connected ? 'connected' : 'unavailable',
    device.signalStrength,
  );

  ingestEcoFlowCloudTelemetryResult(device, result);
  if (result.connected) {
    startEcoFlowCloudLiveRefresh(device);
    if (!result.telemetryActive) {
      bluLog('[BLU_TIMEOUT]', 'ecoflow_cloud_first_poll_no_live_telemetry', buildBluTimeoutLogDetails({
        deviceId: device.rawId,
        vendor: 'ecoflow',
        phase: 'ecoflow_cloud_first_poll',
        timeoutMs: ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS,
        lastSuccessfulPhase: 'cloud_connect',
        lastPacketAt: null,
        errorCode: result.statusError,
        message: result.statusError ?? 'EcoFlow cloud connected, but no live telemetry was decoded on the first poll.',
      }));
    }
  }

  return result;
}

export function useUnifiedDeviceConnections(): UnifiedDeviceConnectionsResult {
  const { deviceSummaries: powerDeviceSummaries, providerSummaries: powerProviderSummaries } = useEcsProviders();
  const {
    attemptReconnect,
    connectToDevice,
    connectedDeviceId,
    devices: discoveredTelemetryDevices,
    error: obdError,
    isConnecting: obdIsConnecting,
    isScanning: obdIsScanning,
    lastDevice: obdLastDevice,
    scanDiagnostics: obdScanDiagnostics,
    startScan,
    state: obdScannerState,
    stopScan,
  } = useOBD2Scanner();
  const {
    devices: rememberedTelemetryDevices,
    disconnectProvider,
    freshnessLabel,
    isConnected: telemetryIsConnected,
    isShowingLastKnown,
    primaryDevice,
    rawTelemetry: vehicleRawTelemetry,
    snapshot: vehicleTelemetrySnapshot,
    summary: vehicleTelemetrySummary,
  } = useVehicleTelemetry();

  const [discoveredPowerDevices, setDiscoveredPowerDevices] = useState<UnifiedDiscoveredPowerDevice[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [deviceUiStateById, setDeviceUiStateById] = useState<Record<string, DeviceUiState>>({});
  const [batchBusy, setBatchBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [manualScanStatus, setManualScanStatus] = useState<'idle' | 'scanning' | 'completed'>('idle');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [scanBeganAt, setScanBeganAt] = useState<number | null>(null);
  const [scanDurationMs, setScanDurationMs] = useState(UNIFIED_BLUETOOTH_SCAN_DURATION_MS);
  const [scannerClock, setScannerClock] = useState(() => Date.now());
  const [sourceStatuses, setSourceStatuses] = useState<ECSDiscoverySourceSummary[]>(() => getInitialDiscoverySourceStatuses());
  const [registeredPowerDevices, setRegisteredPowerDevices] = useState(() => bluDeviceRegistry.getAll());
  const [rememberedAccessoryDevices, setRememberedAccessoryDevices] = useState(
    () => bluetoothAccessoryRegistry.getAll(),
  );
  const [routeIntents, setRouteIntents] = useState<ECSConnectionRouteIntent[]>([]);
  const mountedRef = useRef(true);
  const lastLoggedScanResultCountRef = useRef<number | null>(null);
  const lastLoggedSourceSummaryRef = useRef<string | null>(null);
  const operationSequenceRef = useRef(0);
  const deviceOperationRef = useRef<Record<string, number>>({});
  const routeSequenceRef = useRef(0);
  const loggedRoutingRef = useRef<Map<string, string>>(new Map());
  const scanInFlightRef = useRef(false);
  const lastScanRequestAtRef = useRef(0);
  const activeScanSessionRef = useRef(0);
  const connectInFlightRef = useRef<Set<string>>(new Set());
  const disconnectInFlightRef = useRef<Set<string>>(new Set());
  const diagnosedScannerDeviceIdsRef = useRef<Set<string>>(new Set());
  const autoReconnectAttemptedAtRef = useRef<Map<string, number>>(new Map());
  const userDisconnectedDeviceIdsRef = useRef<Set<string>>(new Set());
  const manualDisconnectRequestedRef = useRef<Record<string, boolean>>({});

  const hasManualDisconnectRequest = useCallback((device: ECSDeviceConnectionModel): boolean => (
    manualDisconnectRequestedRef.current[device.id] === true ||
    getManualDisconnectGuardKeys(device).some((key) => (
      userDisconnectedDeviceIdsRef.current.has(key) ||
      manualDisconnectRequestedRef.current[key] === true
    ))
  ), []);

  const markManualDisconnectRequest = useCallback((device: ECSDeviceConnectionModel): void => {
    userDisconnectedDeviceIdsRef.current.add(device.id);
    manualDisconnectRequestedRef.current[device.id] = true;
    for (const key of getManualDisconnectGuardKeys(device)) {
      userDisconnectedDeviceIdsRef.current.add(key);
      manualDisconnectRequestedRef.current[key] = true;
      autoReconnectAttemptedAtRef.current.set(key, Date.now());
    }
  }, []);

  const clearManualDisconnectRequest = useCallback((device: ECSDeviceConnectionModel): void => {
    userDisconnectedDeviceIdsRef.current.delete(device.id);
    delete manualDisconnectRequestedRef.current[device.id];
    for (const key of getManualDisconnectGuardKeys(device)) {
      userDisconnectedDeviceIdsRef.current.delete(key);
      delete manualDisconnectRequestedRef.current[key];
    }
  }, []);

  useEffect(() => {
    if (!DEBUG_DEVICE_CONNECTIONS) return;
    ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] scan_idle', {
      state: 'awaiting_user_action',
    });
  }, []);

  useEffect(() => {
    if (manualScanStatus === 'idle') return undefined;
    const timer = setInterval(() => setScannerClock(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [manualScanStatus]);

  useEffect(() => {
    mountedRef.current = true;
    if (DEBUG_DEVICE_CONNECTIONS) {
      ecsLog.debug('TELEMETRY', '[BT_BLOCKER] entry_opened', {
        surface: 'unified_device_connections',
        platform: Platform.OS,
        scanMode: 'manual',
      });
    }
    return () => {
      mountedRef.current = false;
      activeScanSessionRef.current += 1;
      scanInFlightRef.current = false;
      void obd2Adapter.stopScan('unified_panel_unmount');
    };
  }, []);

  useEffect(() => bluetoothAccessoryRegistry.subscribe(setRememberedAccessoryDevices), []);

  useEffect(() => (
    bluDeviceRegistry.subscribe(() => {
      setRegisteredPowerDevices(bluDeviceRegistry.getAll());
    })
  ), []);

  const powerReadingByKey = useMemo(() => {
    const next = new Map<string, (typeof powerDeviceSummaries)[number]>();
    for (const summary of powerDeviceSummaries) {
      next.set(`power:${summary.provider}:${summary.deviceId}`, summary);
    }
    return next;
  }, [powerDeviceSummaries]);

  const enqueueRouteIntent = useCallback((intent: Omit<ECSConnectionRouteIntent, 'id'>) => {
    if (!mountedRef.current) return;
    routeSequenceRef.current += 1;
    setRouteIntents((current) => [
      ...current,
      {
        id: routeSequenceRef.current,
        ...intent,
      },
    ]);
  }, []);

  const consumeRouteIntent = useCallback((routeId: number) => {
    if (!mountedRef.current) return;
    setRouteIntents((current) => current.filter((intent) => intent.id !== routeId));
  }, []);

  const routedBluetoothDiscoveries = useMemo(
    () => discoveredTelemetryDevices.map((device) => ({
      device,
      routing: routeBluetoothDevice(device),
    })),
    [discoveredTelemetryDevices],
  );

  useEffect(() => {
    for (const entry of routedBluetoothDiscoveries) {
      const signature = [
        entry.routing.owner,
        entry.routing.providerId,
        entry.routing.displayName,
        entry.routing.secondaryLabel,
        entry.device.rssi,
      ].join('|');
      if (loggedRoutingRef.current.get(entry.device.id) === signature) continue;
      loggedRoutingRef.current.set(entry.device.id, signature);
      const confidence = inferBluClassificationConfidence({
        supportLevel: entry.routing.supportLevel,
        isLikelyOBD: entry.device.isLikelyOBD,
        connectionType: entry.routing.connectionType,
        providerId: entry.routing.providerId,
      });
      const discoveryDetails = buildBluDiscoveryLogDetails({
        id: entry.device.id,
        name: entry.routing.displayName,
        localName: null,
        manufacturerData: entry.device.manufacturerData,
        serviceUUIDs: entry.device.serviceUUIDs,
        rssi: entry.device.rssi,
        classifiedVendor: entry.routing.providerId,
        classifiedType: entry.routing.deviceCategory ?? entry.routing.owner,
        confidence,
      });
      bluLogThrottled(
        '[BLU_CLASSIFY]',
        `unified:${entry.device.id}:${entry.routing.providerId}:${entry.routing.owner}`,
        'device_classified',
        {
          ...discoveryDetails,
          owner: entry.routing.owner,
          providerLabel: entry.routing.providerLabel,
          supportLabel: entry.routing.supportLabel,
          routeKey: entry.routing.routeKey,
          connectionMode: entry.routing.connectionType ?? 'ble',
        },
        10_000,
      );
      bluLogThrottled(
        getBluVendorPrefix(entry.routing.providerId),
        `vendor-classify:${entry.device.id}:${entry.routing.providerId}`,
        'vendor_path_classified',
        {
          ...discoveryDetails,
          driverMode:
            entry.routing.providerId === 'ecoflow'
              ? 'cloud_or_local_ble'
              : entry.routing.owner === 'telemetry'
                ? 'obd2_ble'
                : entry.routing.owner === 'power'
                  ? 'power_brand_adapter'
                  : 'accessory',
          supportLevel: entry.routing.supportLevel,
          supportLabel: entry.routing.supportLabel,
        },
        10_000,
      );
      if (!DEBUG_DEVICE_CONNECTIONS) continue;
      ecsLog.debug('TELEMETRY', '[BT_SCAN] accepted_device', {
        deviceId: entry.device.id,
        displayName: entry.routing.displayName,
        owner: entry.routing.owner,
        providerId: entry.routing.providerId,
        providerLabel: entry.routing.providerLabel,
        supportLabel: entry.routing.supportLabel,
        isLikelyOBD: entry.device.isLikelyOBD,
        rssi: entry.device.rssi,
      });
      ecsLog.debug('TELEMETRY', '[BT_SCAN] brand_matched', {
        deviceId: entry.device.id,
        displayName: entry.routing.displayName,
        providerId: entry.routing.providerId,
        providerLabel: entry.routing.providerLabel,
        owner: entry.routing.owner,
        categoryLabel: entry.routing.categoryLabel,
      });
      ecsLog.debug('TELEMETRY', '[BT_SCAN] connection_ready', {
        deviceId: entry.device.id,
        providerId: entry.routing.providerId,
        owner: entry.routing.owner,
        routeKey: entry.routing.routeKey,
        supportLabel: entry.routing.supportLabel,
      });
      if (
        entry.routing.owner === 'sensor' &&
        (entry.routing.deviceCategory === 'propane_monitor' || entry.routing.deviceCategory === 'water_tank_monitor')
      ) {
        const profile = identifyBluestackUtilitySensorProfile({
          providerId: entry.routing.providerId,
          providerLabel: entry.routing.providerLabel,
          categoryLabel: entry.routing.categoryLabel,
          deviceCategory: entry.routing.deviceCategory,
          name: entry.routing.displayName,
          kind: entry.routing.owner,
          serviceUuids: entry.device.serviceUUIDs,
          manufacturerData: entry.device.manufacturerData,
        });
        recordBluetoothDiagnosticEvent({
          type: 'device_classified',
          source: 'native_ble',
          deviceId: entry.device.id,
          deviceName: entry.routing.displayName,
          providerId: entry.routing.providerId,
          message: 'Bluestack utility sensor advertisement profile captured.',
          details: {
            profileId: profile?.id ?? 'generic_utility_sensor',
            profileStatus: profile?.status ?? 'generic_parser_pending',
            deviceCategory: entry.routing.deviceCategory,
            advertisementEvidence: getBluestackAdvertisementEvidence(entry.device),
          },
        });
      }
    }
  }, [routedBluetoothDiscoveries]);

  const routedPowerDiscoveries = useMemo(
    () => routedBluetoothDiscoveries
      .filter((entry) => isReleaseScannerBluetoothRoute(entry.routing) && entry.routing.owner === 'power')
      .map((entry) => normalizeDiscoveredPowerDevice(
        entry.routing.providerId as BluProviderId,
        {
          id: entry.device.id,
          name: entry.routing.displayName,
          model: entry.routing.displayName,
          rssi: entry.device.rssi,
          discoveredAt: entry.device.lastSeenAt,
          source: 'ble',
          brand: entry.routing.providerLabel,
          category: entry.routing.deviceCategory,
          productType: entry.routing.deviceCategory,
          connectionType: entry.routing.connectionType ?? 'ble',
          sourceIds: {
            ble: entry.device.id,
          },
          raw: entry.device,
        },
      )),
    [routedBluetoothDiscoveries],
  );

  const routedTelemetryDiscoveries = useMemo(
    () => routedBluetoothDiscoveries.filter((entry) => isReleaseScannerBluetoothRoute(entry.routing) && entry.routing.owner === 'telemetry'),
    [routedBluetoothDiscoveries],
  );

  const telemetryFallbackCandidateDiscoveries = useMemo(() => {
    if (routedTelemetryDiscoveries.length > 0) return [];

    const nonTelemetryReleaseIds = new Set(
      routedBluetoothDiscoveries
        .filter((entry) => isReleaseScannerBluetoothRoute(entry.routing) && entry.routing.owner !== 'telemetry')
        .map((entry) => entry.device.id),
    );

    return discoveredTelemetryDevices
      .filter((device) => !nonTelemetryReleaseIds.has(device.id))
      .filter(isObd2FallbackCandidate)
      .sort((left, right) => (right.rssi ?? -100) - (left.rssi ?? -100))
      .slice(0, OBD2_FALLBACK_CANDIDATE_LIMIT);
  }, [discoveredTelemetryDevices, routedBluetoothDiscoveries, routedTelemetryDiscoveries.length]);

  const telemetryFallbackCandidateIds = useMemo(
    () => new Set(telemetryFallbackCandidateDiscoveries.map((device) => device.id)),
    [telemetryFallbackCandidateDiscoveries],
  );

  const routedAccessoryDiscoveries = useMemo(
    () => routedBluetoothDiscoveries.filter((entry) => (
      entry.routing.owner === 'sensor' || entry.routing.owner === 'generic'
    )),
    [routedBluetoothDiscoveries],
  );

  const bleRawDevicesSeenCount = Math.max(
    obdScanDiagnostics.rawDevicesSeenCount,
    discoveredTelemetryDevices.length,
  );
  const bleAcceptedDeviceCount = Math.max(
    obdScanDiagnostics.acceptedDevicesCount,
    discoveredTelemetryDevices.length,
  );
  const missingPermissionSignature = obdScanDiagnostics.missingPermissions.join('|');
  const bluetoothDiagnostics = useMemo<OBD2ScanDiagnostics>(() => ({
    ...obdScanDiagnostics,
    missingPermissions: [...obdScanDiagnostics.missingPermissions],
  }), [
    obdScanDiagnostics.acceptedDevicesCount,
    obdScanDiagnostics.bluetoothState,
    obdScanDiagnostics.initialBluetoothState,
    obdScanDiagnostics.isExpoGo,
    obdScanDiagnostics.lastScanError,
    obdScanDiagnostics.lastUpdatedAt,
    obdScanDiagnostics.message,
    missingPermissionSignature,
    obdScanDiagnostics.nativeBridgeStatus,
    obdScanDiagnostics.permissionStatus,
    obdScanDiagnostics.platform,
    obdScanDiagnostics.rawDeviceCallbacksCount,
    obdScanDiagnostics.rawDevicesSeenCount,
    obdScanDiagnostics.readinessCode,
    obdScanDiagnostics.scanState,
  ]);

  const liveDiscoveredPowerDevices = useMemo(() => pruneStaleScannerDevices(
    mergeDiscoveredPowerDevices([
      ...discoveredPowerDevices,
      ...routedPowerDiscoveries,
    ]),
    {
      now: scannerClock,
      staleAfterMs: POWER_DEVICE_ADVERTISEMENT_STALE_MS,
      logTag: '[BT_SCAN]',
      debug: DEBUG_DEVICE_CONNECTIONS,
    },
  ), [
    discoveredPowerDevices,
    routedPowerDiscoveries,
    scannerClock,
  ]);

  const powerDiscoveredByKey = useMemo(() => {
    const next = new Map<string, UnifiedDiscoveredPowerDevice>();
    for (const device of liveDiscoveredPowerDevices) {
      next.set(`power:${device.provider}:${device.id}`, device);
    }
    return next;
  }, [liveDiscoveredPowerDevices]);

  const telemetryDiscoveredByKey = useMemo(() => {
    const next = new Map<string, (typeof discoveredTelemetryDevices)[number]>();
    for (const { device } of routedTelemetryDiscoveries) {
      next.set(`telemetry:obd2:${device.id}`, device);
    }
    for (const device of telemetryFallbackCandidateDiscoveries) {
      next.set(`telemetry:obd2:${device.id}`, device);
    }
    return next;
  }, [routedTelemetryDiscoveries, telemetryFallbackCandidateDiscoveries]);

  const telemetryRememberedByKey = useMemo(() => {
    const next = new Map<string, VehicleTelemetryDevice>();
    for (const device of rememberedTelemetryDevices) {
      next.set(`telemetry:${device.provider}:${device.device_id}`, device);
    }
    return next;
  }, [rememberedTelemetryDevices]);

  const accessoryRememberedById = useMemo(() => {
    const next = new Map<string, (typeof rememberedAccessoryDevices)[number]>();
    for (const device of rememberedAccessoryDevices) {
      next.set(device.deviceId, device);
    }
    return next;
  }, [rememberedAccessoryDevices]);

  const accessoryDiscoveryById = useMemo(() => {
    const next = new Map<string, (typeof routedAccessoryDiscoveries)[number]>();
    for (const entry of routedAccessoryDiscoveries) {
      next.set(entry.device.id, entry);
    }
    return next;
  }, [routedAccessoryDiscoveries]);

  const rescan = useCallback(async () => {
    const now = Date.now();
    if (now - lastScanRequestAtRef.current < SCANNER_SCAN_WINDOW_DEBOUNCE_MS) {
      if (DEBUG_DEVICE_CONNECTIONS) {
        ecsLog.debug('TELEMETRY', '[BT_SCAN] scan_button_pressed', {
          ignored: true,
          reason: 'debounced_scan_window',
        });
      }
      return;
    }
    lastScanRequestAtRef.current = now;

    if (scanInFlightRef.current || isRefreshing || batchBusy) {
      if (DEBUG_DEVICE_CONNECTIONS) {
        ecsLog.debug('TELEMETRY', '[BT_SCAN] scan_button_pressed', {
          ignored: true,
          reason: scanInFlightRef.current || isRefreshing ? 'scan_pending' : 'batch_busy',
        });
      }
      return;
    }

    scanInFlightRef.current = true;
    const scanSessionId = activeScanSessionRef.current + 1;
    activeScanSessionRef.current = scanSessionId;
    const isCurrentScanSession = () => (
      mountedRef.current && activeScanSessionRef.current === scanSessionId
    );

    setInfoMessage(null);
    setManualScanStatus('scanning');
    setIsRefreshing(true);
    const scanStartedAt = Date.now();
    setScannerClock(scanStartedAt);
    setScanBeganAt(scanStartedAt);
    setScanDurationMs(UNIFIED_BLUETOOTH_SCAN_DURATION_MS);
    setSourceStatuses([
      makeDiscoverySourceSummary('ble', 'scanning', 0, 'BLE scan requested.'),
      makeDiscoverySourceSummary('ecoflow_api', 'scanning', 0, 'EcoFlow API discovery requested.'),
      makeDiscoverySourceSummary('obd2', 'scanning', 0, 'Checking OBD2 Bluetooth runtime.'),
      makeDiscoverySourceSummary('classic_bluetooth', 'scanning', 0, 'Checking Classic Bluetooth availability.'),
    ]);
    lastLoggedScanResultCountRef.current = null;
    bluLog('[BLU_SCAN]', 'unified_scan_start', {
      scanId: scanSessionId,
      sourcesAttempted: ['ble', 'ecoflow_api', 'obd2', 'classic_bluetooth'],
      durationMs: UNIFIED_BLUETOOTH_SCAN_DURATION_MS,
      platform: Platform.OS,
    });
    recordBluetoothDiagnosticEvent({
      type: 'scanner_start',
      source: 'native_ble',
      message: 'Manual unified device scan started.',
      details: {
        scanId: scanSessionId,
        source: 'manual_button',
        durationMs: UNIFIED_BLUETOOTH_SCAN_DURATION_MS,
      },
    });
    recordBluetoothDiagnosticEvent({
      type: 'permission_request',
      source: 'permission',
      message: 'Checking Bluetooth permissions before scan.',
      details: { scanId: scanSessionId },
    });
    if (DEBUG_DEVICE_CONNECTIONS) {
      ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] manual_scan_requested', {
        source: 'manual_button',
      });
      ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] scan_start', {
        source: 'manual_button',
      });
      ecsLog.debug('TELEMETRY', '[BT_SCAN] scan_button_pressed', {
        source: 'manual_button',
        durationMs: UNIFIED_BLUETOOTH_SCAN_DURATION_MS,
      });
      ecsLog.debug('TELEMETRY', '[BT_SCAN] start', {
        source: 'manual_button',
        durationMs: UNIFIED_BLUETOOTH_SCAN_DURATION_MS,
      });
      ecsLog.debug('TELEMETRY', '[BT_BLOCKER] scan_start', {
        source: 'manual_button',
        durationMs: UNIFIED_BLUETOOTH_SCAN_DURATION_MS,
      });
    }

    try {
      const nativeBluetoothUnsupported = isBleRuntimeUnsupported();
      const unsupportedMessage = `${NATIVE_BLUETOOTH_RUNTIME_MESSAGE} Cloud/API devices remain available.`;

      const bleScan = nativeBluetoothUnsupported
        ? Promise.resolve().then(() => {
            if (!isCurrentScanSession()) return;
            bluLog('[BLU_SCAN]', 'native_scan_runtime_unsupported', {
              scanId: scanSessionId,
              phase: 'scan_readiness',
              runtime: Platform.OS === 'web' ? 'web' : 'native_bridge_missing',
              message: unsupportedMessage,
            });
            recordBluetoothDiagnosticEvent({
              type: 'bluetooth_power_state',
              source: 'unsupported_runtime',
              message: unsupportedMessage,
              details: {
                scanId: scanSessionId,
                state: 'unsupported_runtime',
                nativeEnvironmentSupport: 'unsupported',
              },
            });
            setInfoMessage(unsupportedMessage);
            setSourceStatuses((current) => updateDiscoverySourceStatus(
              current,
              'ble',
              'unsupported',
              0,
              unsupportedMessage,
              {
                rawCount: 0,
                normalizedCount: 0,
                addedCount: 0,
                failedReason: 'runtime_unsupported',
              },
            ));
            setSourceStatuses((current) => updateDiscoverySourceStatus(
              current,
              'obd2',
              'unsupported',
              0,
              'OBD2 BLE telemetry adapters require the native BLE bridge. Classic Bluetooth/SPP adapters are not discoverable in this runtime.',
              {
                rawCount: 0,
                normalizedCount: 0,
                addedCount: 0,
                failedReason: 'runtime_unsupported',
              },
            ));
            if (DEBUG_DEVICE_CONNECTIONS) {
              ecsLog.debug('TELEMETRY', '[BT_BLOCKER] scan_stop', {
                reason: 'runtime_unsupported',
                missing: Platform.OS === 'web' ? ['platform'] : ['runtime.expo_go'],
                source: 'unified_device_connections',
              });
            }
          })
        : startScan(UNIFIED_BLUETOOTH_SCAN_DURATION_MS)
          .then(() => {
            if (!isCurrentScanSession()) return;
            recordBluetoothDiagnosticEvent({
              type: 'permission_result',
              source: 'permission',
              message: 'Bluetooth scan readiness accepted.',
              details: {
                scanId: scanSessionId,
                status: 'granted',
              },
            });
            recordBluetoothDiagnosticEvent({
              type: 'bluetooth_power_state',
              source: 'native_ble',
              message: 'Native Bluetooth scan started.',
              details: {
                scanId: scanSessionId,
                state: 'powered_on_or_scanning',
                nativeEnvironmentSupport: 'available',
              },
            });
            setSourceStatuses((current) => updateDiscoverySourceStatus(
              current,
              'ble',
              'success',
              bleAcceptedDeviceCount,
              'BLE scan started. Devices appear as discovery callbacks arrive.',
              {
                rawCount: bleRawDevicesSeenCount,
                normalizedCount: bleAcceptedDeviceCount,
                addedCount: bleAcceptedDeviceCount,
              },
            ));
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error ?? 'BLE discovery failed.');
            const runtimeUnsupported = isNativeBluetoothRuntimeUnsupported(message);
            if (!isCurrentScanSession()) return;
            bluLog(isBluTimeoutLike(message) ? '[BLU_TIMEOUT]' : '[BLU_SCAN]', 'native_ble_scan_failed', isBluTimeoutLike(message)
              ? buildBluTimeoutLogDetails({
                  deviceId: 'scan',
                  vendor: 'native_ble',
                  phase: 'ble_scan',
                  timeoutMs: UNIFIED_BLUETOOTH_SCAN_DURATION_MS,
                  lastSuccessfulPhase: 'permission_result',
                  lastPacketAt: null,
                  errorCode: runtimeUnsupported ? 'runtime_unsupported' : 'scan_failed',
                  message,
                })
              : {
                  scanId: scanSessionId,
                  phase: 'ble_scan',
                  errorCode: runtimeUnsupported ? 'runtime_unsupported' : 'scan_failed',
                  message,
                });
            const source = classifyBluetoothDiagnosticSource(
              message,
              runtimeUnsupported ? 'unsupported_runtime' : 'native_ble',
            );
            recordBluetoothDiagnosticEvent({
              type: source === 'permission' ? 'permission_result' : 'service_discovery_failure',
              source,
              message: 'BLE scan failed.',
              error: message,
              details: {
                scanId: scanSessionId,
                status: source === 'permission' ? 'denied' : 'failed',
              },
            });
            setSourceStatuses((current) => updateDiscoverySourceStatus(
              current,
              'ble',
              runtimeUnsupported ? 'unsupported' : 'failed',
              0,
              runtimeUnsupported ? NATIVE_BLUETOOTH_RUNTIME_MESSAGE : message,
              {
                rawCount: bleRawDevicesSeenCount,
                normalizedCount: bleAcceptedDeviceCount,
                addedCount: 0,
                failedReason: message,
              },
            ));
            if (runtimeUnsupported) {
              setSourceStatuses((current) => updateDiscoverySourceStatus(
                current,
                'obd2',
                'unsupported',
                0,
                'OBD2 BLE telemetry adapters require the native BLE bridge. Classic Bluetooth/SPP adapters are not discoverable in this runtime.',
                {
                  rawCount: 0,
                  normalizedCount: 0,
                  addedCount: 0,
                  failedReason: message,
                },
              ));
            }
          });
      const ecoFlowDiscovery = discoverEcoFlowDevicesForUnifiedScanner()
        .then((devices) => {
          if (!isCurrentScanSession()) return;
          bluLog('[BLU_ECOFLOW]', 'cloud_discovery_completed', {
            scanId: scanSessionId,
            deviceCount: devices.length,
            connectionMode: 'cloud',
            driverMode: 'ecoflow_cloud_api',
          });
          for (const device of devices) {
            recordEcoFlowConnectionPhase({
              deviceId: device.id,
              deviceName: device.name,
              productType: device.productType ?? device.category ?? null,
              phase: 'discovered',
              source: String(device.connectionType ?? '') === 'hybrid' ? 'hybrid' : 'ecoflow-cloud',
            });
            const details = buildBluDiscoveryLogDetails({
              id: device.id,
              name: device.name,
              localName: null,
              manufacturerDataPresent: false,
              serviceUUIDs: [],
              rssi: device.rssi,
              classifiedVendor: 'ecoflow',
              classifiedType: device.productType ?? device.category ?? 'power_device',
              confidence: inferBluClassificationConfidence({
                supportLevel: 'verified',
                connectionType: device.connectionType,
                source: device.source,
                providerId: 'ecoflow',
              }),
            });
            bluLogThrottled('[BLU_SCAN]', `ecoflow-cloud:${device.id}`, 'cloud_device_discovered', {
              ...details,
              connectionMode: 'cloud',
              source: device.source,
              connectableViaCloud: device.connectableViaCloud,
              requiresNativeBluetooth: device.requiresNativeBluetooth,
            }, 10_000);
            bluLogThrottled('[BLU_CLASSIFY]', `ecoflow-cloud-classify:${device.id}`, 'cloud_device_classified', {
              ...details,
              connectionMode: 'cloud',
              driverMode: 'ecoflow_cloud_api',
            }, 10_000);
          }
          recordBluetoothDiagnosticEvent({
            type: 'ecoflow_cloud_auth_success',
            source: 'cloud_access',
            message: 'EcoFlow cloud discovery completed.',
            providerId: 'ecoflow',
            details: {
              scanId: scanSessionId,
              deviceCount: devices.length,
            },
          });
          setSourceStatuses((current) => updateDiscoverySourceStatus(
            current,
            'ecoflow_api',
            'success',
            devices.length,
            devices.length > 0
              ? 'EcoFlow API returned devices.'
              : 'EcoFlow API returned no devices.',
            {
              rawCount: devices.length,
              normalizedCount: devices.length,
              addedCount: devices.length,
            },
          ));
          setDiscoveredPowerDevices((current) => {
            const result = upsertDiscoveredPowerDeviceList(current, devices, 'ecoflow_api_success');
            if (DEBUG_DEVICE_CONNECTIONS) {
              for (const device of devices) {
                ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] cloud_device_added', {
                  providerId: 'ecoflow',
                  deviceId: device.id,
                  name: device.name,
                  model: device.model,
                  source: device.source,
                  connectionType: device.connectionType,
                  requiresNativeBluetooth: device.requiresNativeBluetooth,
                  connectableViaCloud: device.connectableViaCloud,
                });
              }
            }
            return result.devices;
          });
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error ?? 'EcoFlow API discovery failed.');
          const errorSource =
            error instanceof EcoFlowCloudDiscoveryError ? error.errorSource : 'cloud_access';
          recordEcoFlowTimeout({
            deviceId: 'ecoflow_cloud_discovery',
            deviceName: 'EcoFlow Cloud',
            productType: null,
            source: 'ecoflow-cloud',
            timeoutKind: 'scanTimeout',
            reason: message,
            canRetry: errorSource !== 'cloud_auth',
            requiresCloudAuth: errorSource === 'cloud_auth',
            requiresNativeBle: false,
            lastSuccessfulPhase: 'discovered',
            lastPacketAt: null,
          });
          bluLog(isBluTimeoutLike(message) ? '[BLU_TIMEOUT]' : '[BLU_ECOFLOW]', 'cloud_discovery_failed', isBluTimeoutLike(message)
            ? buildBluTimeoutLogDetails({
                deviceId: 'ecoflow_cloud_discovery',
                vendor: 'ecoflow',
                phase: 'ecoflow_cloud_discovery',
                timeoutMs: ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS,
                lastSuccessfulPhase: 'scan_start',
                lastPacketAt: null,
                errorCode: errorSource,
                message,
              })
            : {
                scanId: scanSessionId,
                vendor: 'ecoflow',
                phase: 'ecoflow_cloud_discovery',
                errorCode: errorSource,
                message,
              });
          recordBluetoothDiagnosticEvent({
            type: 'ecoflow_cloud_auth_failure',
            source: errorSource === 'cloud_auth' ? 'ecoflow_cloud_auth' : 'cloud_access',
            message: 'EcoFlow cloud discovery failed.',
            providerId: 'ecoflow',
            error: message,
            details: {
              scanId: scanSessionId,
              errorSource,
            },
          });
          if (isCurrentScanSession()) {
            setSourceStatuses((current) => updateDiscoverySourceStatus(
              current,
              'ecoflow_api',
              'failed',
              0,
              errorSource === 'cloud_auth'
                ? 'EcoFlow cloud access is not authorized for this account/device. BLE discovery continues.'
                : message,
              {
                rawCount: 0,
                normalizedCount: 0,
                addedCount: 0,
                failedReason: errorSource,
              },
            ));
          }
          // EcoFlow cloud discovery logs its own edge-function error and must not block BLE.
        });
      const classicDiscovery = nativeBluetoothUnsupported
        ? Promise.resolve({
            source: 'classic_bluetooth' as const,
            status: 'unsupported' as const,
            devices: [],
            reason: 'Classic Bluetooth discovery is not available in this runtime.',
          })
        : discoverClassicBluetoothDevicesForUnifiedScanner().catch(() => ({
            source: 'classic_bluetooth' as const,
            status: 'failed' as const,
            devices: [],
            reason: 'classic_bluetooth_source_error',
          }));
      const [, , classicResult] = await Promise.allSettled([bleScan, ecoFlowDiscovery, classicDiscovery]);

      if (isCurrentScanSession()) {
        if (
          classicResult.status === 'fulfilled' &&
          classicResult.value.status === 'unsupported'
        ) {
          setSourceStatuses((current) => updateDiscoverySourceStatus(
            current,
            'classic_bluetooth',
            'unsupported',
            0,
            'Classic Bluetooth discovery is not available in this runtime.',
            {
              rawCount: 0,
              normalizedCount: 0,
              addedCount: 0,
              failedReason: 'Classic Bluetooth discovery is not available in this runtime.',
            },
          ));
          setInfoMessage(
            nativeBluetoothUnsupported
              ? unsupportedMessage
              : 'Classic Bluetooth OBD2 discovery is not available in this runtime. BLE OBD2 adapters such as V Peak / Veepeak BLE remain discoverable.',
          );
        } else if (classicResult.status === 'fulfilled') {
          const detail = classicResult.value.reason ?? ('error' in classicResult.value ? classicResult.value.error ?? null : null);
          const normalizedCount = classicResult.value.devices.length;
          setSourceStatuses((current) => updateDiscoverySourceStatus(
            current,
            'classic_bluetooth',
            classicResult.value.status === 'failed' ? 'failed' : 'success',
            normalizedCount,
            detail,
            {
              rawCount: normalizedCount,
              normalizedCount,
              addedCount: classicResult.value.status === 'failed' ? 0 : normalizedCount,
              failedReason: classicResult.value.status === 'failed' ? detail : null,
            },
          ));
        }
        setIsRefreshing(false);
      }
    } finally {
      recordBluetoothDiagnosticEvent({
        type: 'scanner_stop',
        source: 'native_ble',
        message: 'Manual unified device scan finished.',
        details: {
          scanId: scanSessionId,
          state: 'completed',
          rawDevicesSeenCount: bleRawDevicesSeenCount,
          acceptedDevicesCount: bleAcceptedDeviceCount,
        },
      });
      bluLog('[BLU_SCAN]', 'unified_scan_finished', {
        scanId: scanSessionId,
        rawDevicesSeenCount: bleRawDevicesSeenCount,
        acceptedDevicesCount: bleAcceptedDeviceCount,
      });
      if (activeScanSessionRef.current === scanSessionId) {
        scanInFlightRef.current = false;
      }
    }

  }, [batchBusy, bleAcceptedDeviceCount, bleRawDevicesSeenCount, isRefreshing, startScan]);

  useEffect(() => {
    if (manualScanStatus === 'idle') return;
    if (isPermissionIssue(obdError) || isBluetoothUnavailable(obdError) || isNativeBluetoothRuntimeUnsupported(obdError)) {
      const runtimeUnsupported = isNativeBluetoothRuntimeUnsupported(obdError);
      setSourceStatuses((current) => updateDiscoverySourceStatus(
        current,
        'ble',
        runtimeUnsupported ? 'unsupported' : 'failed',
        bleAcceptedDeviceCount,
        runtimeUnsupported
          ? NATIVE_BLUETOOTH_RUNTIME_MESSAGE
          : obdError ?? 'BLE discovery failed.',
        {
          rawCount: bleRawDevicesSeenCount,
          normalizedCount: bleAcceptedDeviceCount,
          addedCount: 0,
          failedReason: obdError ?? 'BLE discovery failed.',
        },
      ));
      if (runtimeUnsupported) {
        setSourceStatuses((current) => updateDiscoverySourceStatus(
          current,
          'obd2',
          'unsupported',
          0,
          'OBD2 BLE telemetry adapters require the native BLE bridge. Classic Bluetooth/SPP adapters are not discoverable in this runtime.',
          {
            rawCount: 0,
            normalizedCount: 0,
            addedCount: 0,
            failedReason: obdError ?? 'Native Bluetooth runtime unsupported.',
          },
        ));
      }
      return;
    }
    setSourceStatuses((current) => updateDiscoverySourceStatus(
      current,
      'ble',
      obdIsScanning || isRefreshing ? 'scanning' : 'success',
      bleAcceptedDeviceCount,
      bleRawDevicesSeenCount > 0
        ? 'BLE discovery callbacks are reporting raw nearby devices.'
        : obdIsScanning || isRefreshing
          ? 'BLE scan is active. No raw devices have been seen yet.'
          : 'BLE scan finished with no raw devices reported.',
      {
        rawCount: bleRawDevicesSeenCount,
        normalizedCount: bleAcceptedDeviceCount,
        addedCount: bleAcceptedDeviceCount,
      },
    ));
    setSourceStatuses((current) => updateDiscoverySourceStatus(
      current,
      'obd2',
      obdIsScanning || isRefreshing ? 'scanning' : 'success',
      routedTelemetryDiscoveries.length + telemetryFallbackCandidateDiscoveries.length,
      routedTelemetryDiscoveries.length > 0
        ? 'OBD2 telemetry adapters are visible in the device list.'
        : telemetryFallbackCandidateDiscoveries.length > 0
          ? 'OBD2 candidate devices are visible. Connect one to test the ELM327 telemetry handshake.'
        : obdIsScanning || isRefreshing
          ? 'Checking for OBD2 telemetry adapters.'
          : 'No OBD2 telemetry adapters were reported by this scan.',
      {
        rawCount: routedTelemetryDiscoveries.length + telemetryFallbackCandidateDiscoveries.length,
        normalizedCount: routedTelemetryDiscoveries.length + telemetryFallbackCandidateDiscoveries.length,
        addedCount: routedTelemetryDiscoveries.length + telemetryFallbackCandidateDiscoveries.length,
      },
    ));
  }, [bleAcceptedDeviceCount, bleRawDevicesSeenCount, isRefreshing, manualScanStatus, obdError, obdIsScanning, routedTelemetryDiscoveries.length, telemetryFallbackCandidateDiscoveries.length]);

  useEffect(() => {
    if (manualScanStatus === 'idle') return;
    if (!isNativeBluetoothRuntimeUnsupported(obdError)) return;
    const cloudCount = discoveredPowerDevices.filter(isEcoFlowCloudDiscoveredDevice).length;
    if (cloudCount <= 0) return;
    if (!DEBUG_DEVICE_CONNECTIONS) return;
    ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] native_runtime_unsupported_but_cloud_ok', {
      providerId: 'ecoflow',
      cloudDeviceCount: cloudCount,
      nativeError: obdError,
    });
  }, [discoveredPowerDevices, manualScanStatus, obdError]);

  const stopScanning = useCallback(async (reason: string = 'manual') => {
    activeScanSessionRef.current += 1;
    recordBluetoothDiagnosticEvent({
      type: 'scanner_stop',
      source: 'native_ble',
      message: 'Unified device scan stopped.',
      details: {
        reason,
        state: 'stopped',
      },
    });
    await stopScan(reason);
    scanInFlightRef.current = false;
    if (mountedRef.current) {
      setIsRefreshing(false);
      setManualScanStatus((current) => (current === 'scanning' ? 'completed' : current));
    }
  }, [stopScan]);

  const setDeviceUiState = useCallback((deviceId: string, phase: DeviceUiPhase, error: string | null = null) => {
    if (!mountedRef.current) return;

    setDeviceUiStateById((current) => {
      const existing = current[deviceId];
      if (existing?.phase === phase && existing?.error === error) {
        return current;
      }
      return {
        ...current,
        [deviceId]: {
          phase,
          error,
          updatedAt: Date.now(),
        },
      };
    });
  }, []);

  const beginDeviceOperation = useCallback((deviceId: string): number => {
    operationSequenceRef.current += 1;
    deviceOperationRef.current[deviceId] = operationSequenceRef.current;
    return operationSequenceRef.current;
  }, []);

  const isCurrentDeviceOperation = useCallback((deviceId: string, operationId: number): boolean => (
    mountedRef.current && deviceOperationRef.current[deviceId] === operationId
  ), []);

  const updateBusy = useCallback((deviceId: string, busy: boolean) => {
    if (!mountedRef.current) return;
    setBusyIds((current) => {
      if (busy && !current.includes(deviceId)) {
        return [...current, deviceId];
      }
      if (!busy) {
        return current.filter((entry) => entry !== deviceId);
      }
      return current;
    });
  }, []);

  const powerDevices = useMemo(() => {
    const keys = new Set<string>();

    for (const device of registeredPowerDevices) {
      keys.add(`power:${device.provider}:${device.device_id}`);
    }

    for (const device of liveDiscoveredPowerDevices) {
      keys.add(`power:${device.provider}:${device.id}`);
    }

    const models: ECSDeviceConnectionModel[] = [];

    for (const key of keys) {
      const [, providerId, ...rawIdParts] = key.split(':') as ['power', string, ...string[]];
      const rawId = rawIdParts.join(':');
      const rememberedDevice =
        registeredPowerDevices.find((device) => device.provider === providerId && device.device_id === rawId) ?? null;
      const discoveredDevice = powerDiscoveredByKey.get(key) ?? null;
      const reading = powerReadingByKey.get(key) ?? null;
      const baseSupport = getPowerSupportDescriptor(providerId);
      const adapterStatus = getPowerBrandConnectionStatus({
        providerId,
        rawId,
        name:
          normalizeUiLabel(rememberedDevice?.display_name) ||
          normalizeUiLabel(discoveredDevice?.name) ||
          getProviderDisplayName(providerId),
        model:
          normalizeUiLabel(rememberedDevice?.model) ||
          normalizeUiLabel(discoveredDevice?.modelDisplayName) ||
          normalizeUiLabel(discoveredDevice?.model) ||
          null,
        connectionType: discoveredDevice?.connectionType ?? null,
        signalStrength: typeof discoveredDevice?.rssi === 'number' ? discoveredDevice.rssi : null,
      });
      const isEcoFlowCloudDevice = isEcoFlowCloudDiscoveredDevice(discoveredDevice);
      const ecoFlowDiagnostic =
        providerId === 'ecoflow'
          ? getEcoFlowConnectionState(rawId)
          : null;
      const streamSnapshot = getBluStreamHealthSnapshot(rawId, providerId);
      const support: PowerSupportDescriptor =
        isEcoFlowCloudDevice
          ? {
              supportLevel: 'verified',
              supportLabel: 'Cloud API',
              supportNote: 'EcoFlow cloud/API device. Native Bluetooth is not required for this connection.',
              isSupported: true,
            }
          : adapterStatus.capability === 'api_required'
          ? {
              supportLevel: 'partial',
              supportLabel: 'API Required',
              supportNote: adapterStatus.detail,
              isSupported: true,
            }
          : adapterStatus.capability === 'connection_support_pending' || adapterStatus.capability === 'unsupported'
            ? {
                supportLevel: 'ui_only',
                supportLabel: adapterStatus.label,
                supportNote: adapterStatus.detail,
                isSupported: false,
              }
            : baseSupport;
      const uiState = deviceUiStateById[key];
      const isSelected = selectedIds.includes(key);
      const isDisconnecting = uiState?.phase === 'disconnecting';
      const isConnecting =
        (uiState?.phase === 'connecting' && !isDisconnecting) ||
        busyIds.includes(key) ||
        rememberedDevice?.connection_state === 'connecting' ||
        false;
      const isConnected =
        !isDisconnecting && (
          rememberedDevice?.connection_state === 'connected' ||
          reading?.connectionState === 'connected' ||
          (providerId === 'ecoflow' && uiState?.phase === 'connected')
        ) ||
        false;
      const freshness = getTelemetryFreshness(reading?.lastUpdated ?? null);
      const telemetrySource = normalizeBluetoothTelemetrySource(
        reading?.telemetrySource,
        reading
          ? freshness === 'stale' || freshness === 'expired'
            ? 'cache'
            : providerId === 'ecoflow'
              ? 'provider_cloud'
              : 'ble_live'
          : isConnected && isEcoFlowCloudDevice
            ? 'provider_cloud'
          : isConnected
            ? 'unavailable'
            : 'unavailable',
      );
      const telemetryUnsupported =
        reading?.telemetryUnsupported === true ||
        (!!isConnected && !reading && providerId === 'ecoflow' && !isEcoFlowCloudDevice);
      const isBleLive =
        telemetrySource === 'ble_live' &&
        reading?.isLive === true &&
        freshness === 'live' &&
        isConnected &&
        !telemetryUnsupported;
      const isCloudTelemetryActive =
        isEcoFlowCloudDevice &&
        telemetrySource === 'provider_cloud' &&
        freshness === 'live' &&
        isConnected &&
        !telemetryUnsupported;
      const isLive = isBleLive || isCloudTelemetryActive;
      const lastSeenAt =
        reading?.lastUpdated ??
        (rememberedDevice?.last_seen ?? discoveredDevice?.discoveredAt ?? null);
      const signalStrength = typeof discoveredDevice?.rssi === 'number' ? discoveredDevice.rssi : null;
      const isEcoFlowSoftTelemetryTimeout =
        providerId === 'ecoflow' &&
        isConnected &&
        ecoFlowDiagnostic?.phase === 'timeout' &&
        ecoFlowDiagnostic.timeoutKind === 'firstTelemetryTimeout';
      const ecoFlowDiagnosticError =
        providerId === 'ecoflow' &&
        !isEcoFlowSoftTelemetryTimeout &&
        (ecoFlowDiagnostic?.phase === 'timeout' || ecoFlowDiagnostic?.phase === 'failed')
          ? ecoFlowDiagnostic.diagnosticReason?.reason ?? null
          : null;
      const lastError =
        (uiState?.phase === 'failed' ? uiState.error : null) ??
        ecoFlowDiagnosticError ??
        (rememberedDevice?.connection_state === 'error'
          ? 'Previous connection attempt failed.'
          : null);
      const hasError = typeof lastError === 'string' && lastError.length > 0;
      const status = getPowerLifecycleStatus(
        !!isConnected,
        !!isConnecting,
        !!isDisconnecting,
        !!isLive,
        freshness,
        hasError,
        !!rememberedDevice,
        !!discoveredDevice,
        isSelected,
        support.supportLevel,
      );
      const section = getSectionForStatus(status, !!isConnected || !!isDisconnecting, !!discoveredDevice);
      const providerLabel = getProviderDisplayName(providerId);
      const multiDeviceCapability: BluMultiDeviceCapability = isEcoFlowCloudDevice ? 'supported' : 'limited';
      const multiDeviceCapabilityReason = isEcoFlowCloudDevice
        ? 'EcoFlow Cloud/API polling is keyed per device and can run alongside OBD2 and local BLE devices.'
        : 'Native BLE power adapters are keyed per device in ECS state, but each provider adapter may maintain only one active peripheral connection at a time.';
      const detailLabel = getPowerDetailLabel({
        isLive: !!isLive,
        isConnected: !!isConnected,
        freshness,
        telemetrySource,
        telemetryUnsupported,
        lastError,
        hasError,
        hasRememberedDevice: !!rememberedDevice,
        hasDiscoveredDevice: !!discoveredDevice,
        supportLevel: support.supportLevel,
        productType: discoveredDevice?.productType,
        connectionType: discoveredDevice?.connectionType,
        isOnline: discoveredDevice?.isOnline,
        ecoflowDiagnostic: ecoFlowDiagnostic,
      });
      const connectionSourceLabel = getConnectionSourceLabel({
        kind: 'power',
        telemetrySource,
        connectionType: discoveredDevice?.connectionType ?? null,
        ecoflowSource: ecoFlowDiagnostic?.source ?? null,
        connectableViaCloud: discoveredDevice?.connectableViaCloud ?? false,
      });
      const statusPillLabel = getStatusPillLabel({
        status,
        isConnected: !!isConnected,
        isConnecting: !!isConnecting,
        isLive: !!isLive,
        isDisconnecting: !!isDisconnecting,
        telemetrySource,
        telemetryUnsupported,
        supportLevel: support.supportLevel,
        ecoflowDiagnostic: ecoFlowDiagnostic,
        streamPhase: streamSnapshot?.phase ?? null,
        hasError,
      });
      const lastTelemetryAt =
        streamSnapshot?.lastPacketAt ??
        reading?.lastUpdated ??
        ecoFlowDiagnostic?.lastPacketAt ??
        null;
      const diagnosticReason = getDiagnosticReason({
        status,
        detailLabel,
        lastError,
        telemetryUnsupported,
        ecoflowDiagnosticReason: ecoFlowDiagnostic?.diagnosticReason ?? null,
        streamErrorMessage: streamSnapshot?.streamHealth.lastError?.message ?? null,
        isLive: !!isLive,
      });

      let actionKind: ECSConnectionActionKind = 'none';
      let actionLabel = 'Unavailable';

      if (isDisconnecting) {
        actionKind = 'disconnecting';
        actionLabel = 'Disconnecting';
      } else if (isConnected) {
        actionKind = 'disconnect';
        actionLabel = 'Disconnect';
      } else if (isConnecting) {
        actionKind = 'connecting';
        actionLabel = 'Connecting';
      } else if (hasError || rememberedDevice) {
        actionKind = 'retry';
        actionLabel = 'Retry';
      } else if (discoveredDevice && support.isSupported) {
        actionKind = 'connect';
        actionLabel = 'Connect';
      } else if (discoveredDevice && !support.isSupported) {
        actionKind = 'none';
        actionLabel = support.supportLabel;
      }

      models.push({
        id: key,
        rawId,
        kind: 'power',
        name: normalizeUiLabel(rememberedDevice?.display_name) || normalizeUiLabel(discoveredDevice?.name) || providerLabel,
        provider: providerLabel,
        providerId,
        category: getPowerCategoryLabel(discoveredDevice?.productType),
        deviceCategory: 'power',
        subtype:
          normalizeUiLabel(rememberedDevice?.model) ||
          normalizeUiLabel(discoveredDevice?.modelDisplayName) ||
          normalizeUiLabel(discoveredDevice?.model) ||
          null,
        status,
        section,
        supportLevel: support.supportLevel,
        supportLabel: support.supportLabel,
        supportNote: support.supportNote,
        stateLabel: providerId === 'ecoflow'
          ? getEcoFlowStateLabel(status, !!isLive, ecoFlowDiagnostic)
          : getPowerStateLabel(status, !!isLive),
        detailLabel,
        actionKind,
        actionLabel,
        isDiscoverable: !!discoveredDevice,
        isSelected,
        isConnecting: !!isConnecting || !!isDisconnecting,
        isConnected: !!isConnected,
        isLive: !!isLive,
        telemetrySource,
        telemetrySourceLabel: reading?.telemetrySourceLabel ?? getBluetoothTelemetrySourceLabel(telemetrySource),
        telemetryUnsupported,
        connectionSourceLabel,
        statusPillLabel,
        lastTelemetryAt: typeof lastTelemetryAt === 'number' ? lastTelemetryAt : null,
        diagnosticReason,
        telemetryFields: getPowerTelemetryFields(reading, discoveredDevice?.productType ?? rememberedDevice?.product_type ?? null),
        isRemembered: !!rememberedDevice,
        isSupported: support.isSupported,
        sourceBadges: discoveredDevice?.sourceBadges ?? [],
        lastError: hasError ? lastError : null,
        lastSeenAt: typeof lastSeenAt === 'number' ? lastSeenAt : null,
        supportsPowerData: true,
        supportsTelemetryData: false,
        signalStrength,
        affectsMultipleDevices: false,
        connectionType: discoveredDevice?.connectionType ?? null,
        requiresNativeBluetooth: discoveredDevice?.requiresNativeBluetooth ?? true,
        connectableViaCloud: discoveredDevice?.connectableViaCloud ?? false,
        multiDeviceCapability,
        multiDeviceCapabilityReason,
        ecoflowPhase: ecoFlowDiagnostic?.phase ?? null,
        ecoflowSource: ecoFlowDiagnostic?.source ?? null,
        ecoflowTimeoutKind: ecoFlowDiagnostic?.timeoutKind ?? null,
        ecoflowCloudState: ecoFlowDiagnostic?.cloudState ?? null,
        ecoflowDiagnosticReason: ecoFlowDiagnostic?.diagnosticReason ?? null,
      });
    }

    return models;
  }, [
    busyIds,
    deviceUiStateById,
    powerDiscoveredByKey,
    powerReadingByKey,
    registeredPowerDevices,
    selectedIds,
    liveDiscoveredPowerDevices,
  ]);

  const telemetryDevices = useMemo(() => {
    const keys = new Set<string>();

    for (const device of rememberedTelemetryDevices) {
      keys.add(`telemetry:${device.provider}:${device.device_id}`);
    }

    for (const { device } of routedTelemetryDiscoveries) {
      keys.add(`telemetry:obd2:${device.id}`);
    }

    for (const device of telemetryFallbackCandidateDiscoveries) {
      keys.add(`telemetry:obd2:${device.id}`);
    }

    if (obdLastDevice?.id) {
      keys.add(`telemetry:obd2:${obdLastDevice.id}`);
    }

    const models: ECSDeviceConnectionModel[] = [];

    for (const key of keys) {
      const parts = key.split(':');
      const providerId = parts[1];
      const rawId = parts.slice(2).join(':');
      const rememberedDevice = telemetryRememberedByKey.get(key) ?? null;
      const discoveredDevice = telemetryDiscoveredByKey.get(`telemetry:obd2:${rawId}`) ?? null;
      const isFallbackObd2Candidate = telemetryFallbackCandidateIds.has(rawId);
      const uiState = deviceUiStateById[key];
      const isSelected = selectedIds.includes(key);
      const isDisconnecting = uiState?.phase === 'disconnecting';
      const isConnecting =
        (uiState?.phase === 'connecting' && !isDisconnecting) ||
        busyIds.includes(key) ||
        rememberedDevice?.connection_state === 'connecting' ||
        (obdIsConnecting && connectedDeviceId == null && rawId === (discoveredDevice?.id ?? rawId));
      const isConnected =
        !isDisconnecting && (
          rememberedDevice?.connection_state === 'connected' ||
          connectedDeviceId === rawId ||
          (primaryDevice?.device_id === rawId && telemetryIsConnected)
        );
      const isLive =
        !isDisconnecting &&
        primaryDevice?.device_id === rawId &&
        vehicleTelemetrySnapshot.isLive &&
        vehicleTelemetrySnapshot.deviceId === rawId;
      const streamSnapshot = getBluStreamHealthSnapshot(rawId, 'obd2');
      const lastSeenAt =
        rememberedDevice?.last_seen ? new Date(rememberedDevice.last_seen).getTime() : null;
      const lastError =
        (uiState?.phase === 'failed' ? uiState.error : null) ??
        (rememberedDevice?.connection_state === 'error'
          ? 'Previous telemetry connection failed.'
          : obdError && (discoveredDevice?.id === rawId || obdLastDevice?.id === rawId)
            ? obdError
            : null);
      const hasError = typeof lastError === 'string' && lastError.length > 0;
      const status = getTelemetryStatus(
        !!isConnected,
        !!isConnecting,
        !!isDisconnecting,
        !!isLive,
        hasError,
        !!rememberedDevice,
        !!discoveredDevice,
        isSelected,
        freshnessLabel,
      );
      const section = getSectionForStatus(status, !!isConnected || !!isDisconnecting, !!discoveredDevice);
      const vehicleTelemetryFields = getVehicleTelemetryFields(
        isLive
          ? vehicleRawTelemetry
          : vehicleTelemetrySnapshot.deviceId === rawId
            ? {
                battery_voltage: vehicleTelemetrySummary.battery_voltage,
                engine_rpm: vehicleTelemetrySummary.engine_rpm,
                vehicle_speed: vehicleTelemetrySummary.vehicle_speed,
              }
            : null,
      );
      const detailLabel =
        isLive
          ? 'Live vehicle telemetry is flowing into ECS.'
          : isConnected
            ? isShowingLastKnown
              ? 'Connected, but ECS is still relying on the last known telemetry while live updates recover.'
              : 'Connected — telemetry not yet decoded.'
            : hasError
              ? normalizeUiLabel(lastError) ?? 'Telemetry connection failed.'
              : rememberedDevice && !discoveredDevice
                ? 'Previously connected. Not currently live.'
                : discoveredDevice
                  ? isFallbackObd2Candidate
                    ? 'Nearby BLE device may be an OBD2 adapter. Tap Connect to test the ELM327 handshake.'
                    : 'Nearby OBD2 adapter ready to connect.'
                  : 'Previously connected. Not currently live.';
      const telemetrySource = isLive ? 'ble_live' : isShowingLastKnown ? 'cache' : 'unavailable';
      const statusPillLabel = getStatusPillLabel({
        status,
        isConnected: !!isConnected,
        isConnecting: !!isConnecting,
        isLive: !!isLive,
        isDisconnecting: !!isDisconnecting,
        telemetrySource,
        telemetryUnsupported: !!isConnected && !isLive && !isShowingLastKnown,
        supportLevel: 'telemetry',
        streamPhase: streamSnapshot?.phase ?? null,
        hasError,
      });
      const lastTelemetryAt =
        streamSnapshot?.lastPacketAt ??
        (vehicleTelemetrySnapshot.deviceId === rawId ? vehicleTelemetrySnapshot.updatedAt : null) ??
        (rememberedDevice?.last_seen ? new Date(rememberedDevice.last_seen).getTime() : null);
      const diagnosticReason = getDiagnosticReason({
        status,
        detailLabel,
        lastError,
        telemetryUnsupported: !!isConnected && !isLive && !isShowingLastKnown,
        streamErrorMessage: streamSnapshot?.streamHealth.lastError?.message ?? null,
        isLive: !!isLive,
      });

      let actionKind: ECSConnectionActionKind = 'none';
      let actionLabel = 'Unavailable';

      if (isDisconnecting) {
        actionKind = 'disconnecting';
        actionLabel = 'Disconnecting';
      } else if (isConnected) {
        actionKind = 'disconnect';
        actionLabel = 'Disconnect';
      } else if (isConnecting) {
        actionKind = 'connecting';
        actionLabel = 'Connecting';
      } else if (hasError || rememberedDevice) {
        actionKind = 'retry';
        actionLabel = 'Retry';
      } else if (discoveredDevice) {
        actionKind = 'connect';
        actionLabel = 'Connect';
      }

      models.push({
        id: key,
        rawId,
        kind: 'telemetry',
        name:
          normalizeUiLabel(rememberedDevice?.device_name) ||
          (discoveredDevice && isFallbackObd2Candidate
            ? getObd2FallbackCandidateName(discoveredDevice, models.length)
            : normalizeUiLabel(discoveredDevice?.name)) ||
          normalizeUiLabel(obdLastDevice?.name) ||
          'OBD2 Adapter',
        provider: getTelemetryProviderLabel(),
        providerId,
        category: getTelemetryCategoryLabel(),
        deviceCategory: 'obd',
        subtype: normalizeUiLabel(rememberedDevice?.protocol) || null,
        status,
        section,
        supportLevel: 'telemetry',
        supportLabel: isFallbackObd2Candidate ? 'OBD2 Candidate' : 'Telemetry',
        supportNote: isFallbackObd2Candidate
          ? 'This BLE advertisement was not branded, but it is close enough to test as an OBD2/ELM327 adapter. ECS will only mark it live after the vehicle telemetry handshake succeeds.'
          : 'Vehicle telemetry connections currently support one active OBD2 adapter at a time.',
        stateLabel: getTelemetryStateLabel(status, !!isLive),
        detailLabel,
        actionKind,
        actionLabel,
        isDiscoverable: !!discoveredDevice,
        isSelected,
        isConnecting: !!isConnecting || !!isDisconnecting,
        isConnected: !!isConnected,
        isLive: !!isLive,
        telemetrySource,
        telemetrySourceLabel: isLive ? 'Live Bluetooth' : isShowingLastKnown ? 'Last Known' : 'Unavailable',
        telemetryUnsupported: !!isConnected && !isLive && !isShowingLastKnown,
        connectionSourceLabel: getConnectionSourceLabel({
          kind: 'telemetry',
          telemetrySource,
          connectionType: 'ble',
        }),
        statusPillLabel,
        lastTelemetryAt: typeof lastTelemetryAt === 'number' ? lastTelemetryAt : null,
        diagnosticReason,
        telemetryFields: vehicleTelemetryFields,
        isRemembered: !!rememberedDevice || obdLastDevice?.id === rawId,
        isSupported: true,
        sourceBadges: discoveredDevice ? [isFallbackObd2Candidate ? 'BLE Candidate' : 'BLE'] : rememberedDevice ? ['Cached'] : [],
        lastError: hasError ? lastError : null,
        lastSeenAt,
        supportsPowerData: false,
        supportsTelemetryData: true,
        signalStrength: discoveredDevice?.rssi ?? null,
        affectsMultipleDevices: false,
        connectionType: 'ble',
        requiresNativeBluetooth: true,
        connectableViaCloud: false,
        multiDeviceCapability: 'limited',
        multiDeviceCapabilityReason: 'Vehicle telemetry currently supports one active OBD2 adapter, while remaining independent from BLU power-device connections.',
      });
    }

    return models;
  }, [
    busyIds,
    connectedDeviceId,
    deviceUiStateById,
    freshnessLabel,
    obdError,
    obdIsConnecting,
    obdLastDevice,
    primaryDevice,
    rememberedTelemetryDevices,
    selectedIds,
    telemetryIsConnected,
    vehicleTelemetrySnapshot,
    isShowingLastKnown,
    telemetryRememberedByKey,
    telemetryDiscoveredByKey,
    telemetryFallbackCandidateDiscoveries,
    telemetryFallbackCandidateIds,
    routedTelemetryDiscoveries,
  ]);

  const accessoryDevices = useMemo(() => {
    const rawIds = new Set<string>();

    for (const device of rememberedAccessoryDevices) {
      rawIds.add(device.deviceId);
    }

    for (const entry of routedAccessoryDiscoveries) {
      rawIds.add(entry.device.id);
    }

    const models: ECSDeviceConnectionModel[] = [];

    for (const rawId of rawIds) {
      const rememberedDevice = accessoryRememberedById.get(rawId) ?? null;
      const discoveredEntry = accessoryDiscoveryById.get(rawId) ?? null;
      const routed = discoveredEntry?.routing ?? null;
      const kind = (rememberedDevice?.owner ?? routed?.owner ?? 'generic') as Extract<DeviceKind, 'sensor' | 'generic'>;
      const key = `accessory:${rawId}`;
      const uiState = deviceUiStateById[key];
      const isSelected = selectedIds.includes(key);
      const isDisconnecting = uiState?.phase === 'disconnecting';
      const isConnecting =
        (uiState?.phase === 'connecting' && !isDisconnecting) ||
        busyIds.includes(key) ||
        rememberedDevice?.connectionState === 'connecting';
      const isConnected = !isDisconnecting && rememberedDevice?.connectionState === 'connected';
      const lastError =
        (uiState?.phase === 'failed' ? uiState.error : null) ??
        rememberedDevice?.lastError ??
        null;
      const hasError = typeof lastError === 'string' && lastError.length > 0;
      const isDiscoverable = !!discoveredEntry;
      const status = getAccessoryStatus(
        !!isConnected,
        !!isConnecting,
        !!isDisconnecting,
        hasError,
        !!rememberedDevice,
        isDiscoverable,
        isSelected,
      );
      const section = getSectionForStatus(status, !!isConnected || !!isDisconnecting, isDiscoverable);

      let actionKind: ECSConnectionActionKind = 'none';
      let actionLabel = 'Unavailable';

      if (isDisconnecting) {
        actionKind = 'disconnecting';
        actionLabel = 'Disconnecting';
      } else if (isConnected) {
        actionKind = 'disconnect';
        actionLabel = 'Disconnect';
      } else if (isConnecting) {
        actionKind = 'connecting';
        actionLabel = 'Connecting';
      } else if (hasError || rememberedDevice) {
        actionKind = 'retry';
        actionLabel = 'Retry';
      } else if (isDiscoverable) {
        actionKind = 'connect';
        actionLabel = 'Connect';
      }

      const utilityLevelPercent =
        typeof rememberedDevice?.utilitySensorTelemetry?.levelPercent === 'number' &&
        Number.isFinite(rememberedDevice.utilitySensorTelemetry.levelPercent)
          ? rememberedDevice.utilitySensorTelemetry.levelPercent
          : null;
      const isLiveUtilitySensor = kind === 'sensor' && !!isConnected && utilityLevelPercent != null;

      models.push({
        id: key,
        rawId,
        kind,
        name:
          rememberedDevice?.displayName ??
          routed?.displayName ??
          getFallbackBluetoothDeviceName(rawId),
        provider:
          rememberedDevice?.providerLabel ??
          routed?.providerLabel ??
          getAccessoryProviderLabel(kind),
        providerId:
          rememberedDevice?.providerId ??
          routed?.providerId ??
          kind,
        category:
          rememberedDevice?.categoryHint ??
          routed?.categoryLabel ??
          'Bluetooth accessory',
        deviceCategory:
          routed?.deviceCategory === 'propane_monitor' || routed?.deviceCategory === 'water_tank_monitor'
            ? routed.deviceCategory
            : kind === 'sensor'
              ? 'sensor'
              : 'unknown',
        subtype:
          routed?.secondaryLabel ??
          null,
        status,
        section,
        supportLevel: 'generic',
        supportLabel:
          rememberedDevice?.supportLabel ??
          routed?.supportLabel ??
          (kind === 'sensor' ? 'Accessory' : 'Generic Bluetooth'),
        supportNote:
          rememberedDevice?.supportNote ??
          routed?.supportNote ??
          null,
        stateLabel: getAccessoryStateLabel(status),
        detailLabel:
          isConnected
            ? kind === 'sensor'
              ? 'Connected as an ECS-managed sensor accessory.'
              : 'Connected as a generic ECS-managed Bluetooth device.'
            : hasError
              ? normalizeUiLabel(lastError) ?? 'Bluetooth accessory connection failed.'
              : rememberedDevice && !discoveredEntry
                ? 'Previously connected. Not currently nearby.'
                : isDiscoverable
                  ? kind === 'sensor'
                    ? 'Nearby sensor accessory ready to connect.'
                    : 'Nearby Bluetooth device ready to connect.'
                  : 'Bluetooth accessory available to ECS.',
        actionKind,
        actionLabel,
        isDiscoverable,
        isSelected,
        isConnecting: !!isConnecting || !!isDisconnecting,
        isConnected: !!isConnected,
        isLive: isLiveUtilitySensor,
        telemetrySource: isLiveUtilitySensor ? 'ble_live' : 'unavailable',
        telemetrySourceLabel: isLiveUtilitySensor ? 'Local BLE' : 'Unavailable',
        telemetryUnsupported: false,
        connectionSourceLabel: getConnectionSourceLabel({
          kind,
          telemetrySource: isLiveUtilitySensor ? 'ble_live' : 'unavailable',
          connectionType: routed?.connectionType ?? null,
        }),
        statusPillLabel: getStatusPillLabel({
          status,
          isConnected: !!isConnected,
          isConnecting: !!isConnecting,
          isLive: isLiveUtilitySensor,
          isDisconnecting: !!isDisconnecting,
          telemetrySource: isLiveUtilitySensor ? 'ble_live' : 'unavailable',
          telemetryUnsupported: false,
          supportLevel: 'generic',
          hasError,
        }),
        lastTelemetryAt: rememberedDevice?.utilitySensorTelemetry?.decodedAt ?? null,
        diagnosticReason: hasError ? normalizeUiLabel(lastError) ?? 'Bluetooth accessory connection failed.' : null,
        telemetryFields: utilityLevelPercent != null
          ? [
              {
                key: 'level_percent',
                label: 'Tank Level',
                value: `${Math.round(utilityLevelPercent)}%`,
              },
            ]
          : [],
        isRemembered: !!rememberedDevice,
        isSupported: true,
        sourceBadges: discoveredEntry ? ['BLE'] : rememberedDevice ? ['Cached'] : [],
        lastError: hasError ? lastError : null,
        lastSeenAt:
          rememberedDevice?.lastSeenAt
            ? new Date(rememberedDevice.lastSeenAt).getTime()
            : discoveredEntry?.device.lastSeenAt ?? null,
        supportsPowerData: false,
        supportsTelemetryData: false,
        signalStrength:
          rememberedDevice?.signalStrength ??
          discoveredEntry?.device.rssi ??
          null,
        affectsMultipleDevices: false,
        connectionType: routed?.connectionType ?? null,
        serviceUuids: discoveredEntry?.device.serviceUUIDs ?? rememberedDevice?.serviceUuids ?? [],
        manufacturerData: discoveredEntry?.device.manufacturerData ?? rememberedDevice?.manufacturerData ?? null,
        localName: discoveredEntry?.device.name ?? rememberedDevice?.localName ?? null,
        requiresNativeBluetooth: true,
        connectableViaCloud: false,
      });
    }

    return models;
  }, [
    accessoryDiscoveryById,
    accessoryRememberedById,
    busyIds,
    deviceUiStateById,
    rememberedAccessoryDevices,
    routedAccessoryDiscoveries,
    selectedIds,
  ]);

  const releaseAccessoryDevices = useMemo(
    () => accessoryDevices.filter((device) => (
      device.deviceCategory === 'propane_monitor' ||
      device.deviceCategory === 'water_tank_monitor' ||
      device.providerId === 'propane_monitor' ||
      device.providerId === 'water_monitor'
    )),
    [accessoryDevices],
  );

  const devices = useMemo(
    () => sortDevices([...powerDevices, ...telemetryDevices, ...releaseAccessoryDevices]),
    [powerDevices, releaseAccessoryDevices, telemetryDevices],
  );

  useEffect(() => {
    const validIds = new Set(
      devices
        .filter((device) => {
          if (device.isConnected || device.isConnecting || device.actionKind === 'none') return false;
          return getBluestackConnectionPolicy(device).canAttemptConnection || device.actionKind === 'retry';
        })
        .map((device) => device.id),
    );

    setSelectedIds((current) => {
      const next = current.filter((deviceId) => validIds.has(deviceId));
      if (next.length === current.length && next.every((entry, index) => entry === current[index])) {
        return current;
      }
      return next;
    });
  }, [devices]);

  const connectDevice = useCallback(async (
    deviceId: string,
    source: DeviceConnectionRequestSource = 'programmatic',
  ) => {
    const device = devices.find((entry) => entry.id === deviceId);
    if (!device) return;
    const isUserInitiated = isUserInitiatedConnectionSource(source);
    if (isUserInitiated) {
      clearManualDisconnectRequest(device);
    } else if (hasManualDisconnectRequest(device)) {
      bluLog('[BLU_RECONNECT]', 'auto_reconnect_skipped_manual_disconnect', {
        deviceId: device.rawId,
        vendor: device.providerId,
        deviceType: getBluDeviceLogType(device),
        connectionMode: getBluConnectionMode(device),
        source,
        manualDisconnectRequested: true,
      });
      ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] connect_skipped_manual_disconnect', {
        deviceId: device.rawId,
        modelId: device.id,
        providerId: device.providerId,
        source,
      });
      return;
    }
    const connectionPolicy = getBluestackConnectionPolicy(device);

    if (device.actionKind === 'none' || (!connectionPolicy.canAttemptConnection && device.actionKind !== 'retry')) {
      bluLog('[BLU_CONNECT]', 'connect_blocked_by_policy', buildBluConnectionAttemptLogDetails({
        deviceId: device.rawId,
        vendor: device.providerId,
        deviceType: getBluDeviceLogType(device),
        connectionMode: getBluConnectionMode(device),
        startedAt: Date.now(),
        timeoutMs: null,
        attempt: 1,
        policyLane: connectionPolicy.lane,
        actionKind: device.actionKind,
        source,
      }));
      ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] connect_blocked_by_bluestack_policy', {
        deviceId: device.rawId,
        modelId: device.id,
        providerId: device.providerId,
        actionKind: device.actionKind,
        policyLane: connectionPolicy.lane,
        source,
      });
      return;
    }

    if (connectInFlightRef.current.has(device.id) || busyIds.includes(device.id) || device.isConnecting) {
      bluLog('[BLU_CONNECT]', 'connect_ignored_pending', buildBluConnectionAttemptLogDetails({
        deviceId: device.rawId,
        vendor: device.providerId,
        deviceType: getBluDeviceLogType(device),
        connectionMode: getBluConnectionMode(device),
        startedAt: Date.now(),
        timeoutMs: null,
        attempt: 1,
        source,
      }));
      ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] connect_ignored_pending', {
        deviceId: device.rawId,
        modelId: device.id,
        providerId: device.providerId,
        source,
      });
      return;
    }

    if (shouldSkipAutoConnection(source)) {
      bluLog('[BLU_RECONNECT]', 'auto_reconnect_skipped_by_policy', {
        deviceId: device.rawId,
        vendor: device.providerId,
        deviceType: getBluDeviceLogType(device),
        connectionMode: getBluConnectionMode(device),
        source,
      });
      ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] connect_skipped_auto_disabled', {
        deviceId: device.rawId,
        modelId: device.id,
        providerId: device.providerId,
        source,
      });
      return;
    }

    connectInFlightRef.current.add(device.id);
    const isEcoFlowCloudDevice = isEcoFlowCloudConnectionModel(device);
    const routeLabel = getDeviceConnectionRouteLabel(device);
    const startedAt = Date.now();
    const connectionMode = getBluConnectionMode(device);
    const connectionAttemptDetails = buildBluConnectionAttemptLogDetails({
      deviceId: device.rawId,
      vendor: device.providerId,
      deviceType: getBluDeviceLogType(device),
      connectionMode,
      startedAt,
      timeoutMs: device.kind === 'telemetry'
        ? 15_000
        : isEcoFlowCloudDevice
          ? ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS
          : null,
      attempt: 1,
      modelId: device.id,
      name: device.name,
      source,
      route: routeLabel,
    });
    bluLog('[BLU_CONNECT]', 'connect_attempt', connectionAttemptDetails);
    bluLog(getBluVendorPrefix(device.providerId), 'vendor_connect_attempt', {
      ...connectionAttemptDetails,
      driverMode:
        device.kind === 'telemetry'
          ? 'obd2_ble'
          : isEcoFlowCloudDevice
            ? 'ecoflow_cloud_api'
            : device.kind === 'power'
              ? 'power_brand_adapter'
              : 'generic_ble_accessory',
    });

    if (isUserInitiated) {
      ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] connect_requested_by_user', {
        deviceId: device.rawId,
        modelId: device.id,
        providerId: device.providerId,
        source,
      });
    }
    ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] connect_route_selected', {
      route: routeLabel,
      deviceId: device.rawId,
      modelId: device.id,
      providerId: device.providerId,
      source,
    });

    if (isEcoFlowCloudDevice) {
      ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] native_connect_skipped_for_cloud_device', {
        providerId: device.providerId,
        deviceId: device.rawId,
        modelId: device.id,
        name: device.name,
        sourceBadges: device.sourceBadges,
        connectionType: device.connectionType,
      });
    } else {
      ecsLog.debug('TELEMETRY', '[BT_CONNECT] start', {
        deviceId: device.rawId,
        modelId: device.id,
        name: device.name,
        kind: device.kind,
        providerId: device.providerId,
      });
    }
    recordBluetoothDiagnosticEvent({
      type: 'connect_start',
      source: isEcoFlowCloudDevice ? 'cloud_access' : 'native_ble',
      deviceId: device.rawId,
      deviceName: device.name,
      providerId: device.providerId,
      message: 'Unified scanner connect requested.',
      details: {
        route: routeLabel,
        kind: device.kind,
        source,
      },
    });

    setInfoMessage(null);
    setDeviceUiState(device.id, 'connecting', null);
    updateBusy(device.id, true);
    const operationId = beginDeviceOperation(device.id);

    try {
      if (obdIsScanning) {
        await stopScan('connect_attempt');
      }

      if (device.kind === 'power') {
        if (isEcoFlowCloudDevice) {
          bluLog('[BLU_HANDSHAKE]', 'ecoflow_cloud_handshake_start', {
            deviceId: device.rawId,
            vendor: 'ecoflow',
            deviceType: getBluDeviceLogType(device),
            connectionMode: 'cloud',
            phase: 'cloud_auth_and_first_poll',
          });
          const activation = await activateEcoFlowCloudDevice(device);

          if (!isCurrentDeviceOperation(device.id, operationId)) return;

          if (!activation.connected) {
            bluLog('[BLU_ECOFLOW]', 'cloud_connect_failed', {
              deviceId: device.rawId,
              vendor: 'ecoflow',
              deviceType: getBluDeviceLogType(device),
              connectionMode: 'cloud',
              phase: 'cloud_connect',
              productType: activation.productType,
              errorCode: activation.statusError,
              message: activation.statusLabel,
              providerStatus: activation.providerStatus,
              cloudState: activation.cloudState,
            });
            bluLog('[BLU_TIMEOUT]', 'ecoflow_cloud_connect_timeout_or_auth_failure', buildBluTimeoutLogDetails({
              deviceId: device.rawId,
              vendor: 'ecoflow',
              phase: 'ecoflow_cloud_connect',
              timeoutMs: ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS,
              lastSuccessfulPhase: 'connect_requested',
              lastPacketAt: null,
              errorCode: activation.statusError,
              message: activation.statusLabel,
            }));
            setDeviceUiState(
              device.id,
              'failed',
              activation.statusError ?? 'EcoFlow Cloud connection failed.',
            );
            recordBluetoothDiagnosticEvent({
              type: 'ecoflow_cloud_auth_failure',
              source: classifyBluetoothDiagnosticSource(activation.statusError, 'ecoflow_cloud_auth'),
              deviceId: device.rawId,
              deviceName: device.name,
              providerId: device.providerId,
              message: 'EcoFlow cloud activation failed.',
              error: activation.statusError ?? 'EcoFlow Cloud connection failed.',
              details: {
                productType: activation.productType,
                providerStatus: activation.providerStatus,
              },
            });
            ecsLog.warn('TELEMETRY', '[DEVICE_CONNECTIONS] cloud_device_connect_failed', {
              providerId: device.providerId,
              deviceId: device.rawId,
              modelId: device.id,
              name: device.name,
              productType: activation.productType,
              reason: activation.statusError,
              providerStatus: activation.providerStatus,
            });
            setInfoMessage(`${device.name} remains listed, but EcoFlow Cloud connection failed.`);
            return;
          }

          setSelectedIds((current) => current.filter((entry) => entry !== device.id));
          setDeviceUiState(device.id, 'connected', null);
          recordBluetoothDiagnosticEvent({
            type: activation.telemetryActive ? 'telemetry_first_packet' : 'ecoflow_cloud_auth_success',
            source: 'cloud_access',
            deviceId: device.rawId,
            deviceName: device.name,
            providerId: device.providerId,
            message: activation.telemetryActive
              ? 'EcoFlow cloud telemetry is active.'
              : 'EcoFlow cloud activation completed without live telemetry.',
            details: {
              productType: activation.productType,
              telemetryActive: activation.telemetryActive,
              providerStatus: activation.providerStatus,
              cloudState: activation.cloudState,
            },
          });
          ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] cloud_device_connected', {
            providerId: device.providerId,
            deviceId: device.rawId,
            modelId: device.id,
            name: device.name,
            productType: activation.productType,
            connectionType: device.connectionType,
            telemetryActive: activation.telemetryActive,
            status: activation.statusLabel,
            statusError: activation.statusError,
            providerStatus: activation.providerStatus,
            cloudState: activation.cloudState,
          });
          bluLog('[BLU_ECOFLOW]', 'cloud_connect_succeeded', {
            deviceId: device.rawId,
            vendor: 'ecoflow',
            deviceType: getBluDeviceLogType(device),
            connectionMode: 'cloud',
            phase: activation.telemetryActive ? 'streaming' : 'cloud_connected_no_live_telemetry',
            productType: activation.productType,
            telemetryActive: activation.telemetryActive,
            providerStatus: activation.providerStatus,
            cloudState: activation.cloudState,
            statusError: activation.statusError,
          });
          if (activation.telemetryActive) {
            bluLog('[BLU_STREAM]', 'ecoflow_cloud_stream_active', buildBluTelemetryLogDetails({
              deviceId: device.rawId,
              vendor: 'ecoflow',
              telemetry: activation.telemetry,
              streamMode: 'cloud_poll',
              lastPacketAt: activation.telemetry?.quality?.lastPacketAt ?? activation.telemetry?.timestamp ?? Date.now(),
              productType: activation.productType,
            }));
            ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] cloud_telemetry_active', {
              providerId: device.providerId,
              deviceId: device.rawId,
              modelId: device.id,
              productType: activation.productType,
              batteryPct: activation.batteryPct,
              inputWatts: activation.inputWatts,
              outputWatts: activation.outputWatts,
              solarWatts: activation.solarWatts,
              fridgeTemperatureC: activation.fridgeTemperatureC,
              acTemperatureC: activation.acTemperatureC,
              acMode: activation.acMode,
              chargerStatus: activation.chargerStatus,
            });
          } else {
            bluLog('[BLU_TIMEOUT]', 'ecoflow_cloud_connected_no_live_telemetry', buildBluTimeoutLogDetails({
              deviceId: device.rawId,
              vendor: 'ecoflow',
              phase: 'ecoflow_cloud_first_poll',
              timeoutMs: ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS,
              lastSuccessfulPhase: 'cloud_connect',
              lastPacketAt: null,
              errorCode: activation.statusError,
              message: activation.statusError ?? 'EcoFlow cloud connected, but no live telemetry packet was decoded.',
            }));
          }
          setInfoMessage(
            activation.telemetryActive
              ? `${device.name} is connected through EcoFlow Cloud with telemetry active.`
              : `${device.name} is available through EcoFlow Cloud. Native Bluetooth is not required in this runtime.`,
          );
          enqueueRouteIntent({
            owner: 'power',
            deviceId: device.rawId,
            deviceName: device.name,
            providerId: device.providerId,
            providerLabel: device.provider,
            routeKey: 'power/live',
            suggestedPath: null,
            shouldNavigate: false,
            supportLabel: device.supportLabel,
            supportNote: activation.statusError
              ? `EcoFlow Cloud is available, but latest status did not load: ${activation.statusError}`
              : 'EcoFlow Cloud/API connection is active; native Bluetooth was skipped.',
            message: activation.telemetryActive
              ? `${device.provider} telemetry is now flowing through EcoFlow Cloud.`
              : `${device.provider} is now owned by the ECS power domain through EcoFlow Cloud.`,
          });
          return;
        }

        const adapter = getPowerBrandConnectionAdapterForDevice({
          providerId: device.providerId,
          rawId: device.rawId,
          name: device.name,
          model: device.subtype,
          signalStrength: device.signalStrength,
        });

        if (device.providerId === 'ecoflow') {
          const ecoFlowEligibility = normalizeEcoFlowBluCandidate({
            deviceId: device.rawId,
            deviceName: device.name,
            model: device.subtype,
            productType: device.category,
          });
          bluLog('[BLU_ECOFLOW]', 'local_ble_connect_attempt', buildBluConnectionAttemptLogDetails({
            deviceId: device.rawId,
            vendor: 'ecoflow',
            deviceType: getBluDeviceLogType(device),
            connectionMode: 'ble',
            startedAt: Date.now(),
            timeoutMs: ECOFLOW_LOCAL_BLE_CONNECT_TIMEOUT_MS,
            attempt: 1,
            driverMode: 'local_ble_parser_pending',
          }));
          recordEcoFlowConnectionPhase({
            deviceId: device.rawId,
            deviceName: device.name,
            productType: ecoFlowEligibility.productType,
            phase: 'connecting',
            source: 'local-ble',
            lastSuccessfulPhase: 'discovered',
          });
          const result = await genericBluetoothAccessoryManager.connect({
            deviceId: device.rawId,
            displayName: device.name,
            providerLabel: device.provider,
            providerId: device.providerId,
            categoryHint: device.category,
            owner: 'generic',
            supportLabel: device.supportLabel,
            supportNote: device.supportNote,
            signalStrength: device.signalStrength,
            serviceUuids: device.serviceUuids,
            manufacturerData: device.manufacturerData,
            localName: device.localName ?? device.name,
          });

          if (!result.success) {
            const failureReason = result.error ?? 'EcoFlow Bluetooth connection failed.';
            bluLog('[BLU_ECOFLOW]', 'local_ble_connect_failed', {
              deviceId: device.rawId,
              vendor: 'ecoflow',
              deviceType: getBluDeviceLogType(device),
              connectionMode: 'ble',
              phase: 'native_transport',
              errorCode: 'CONNECT_FAILED',
              message: failureReason,
              driverMode: 'local_ble_parser_pending',
            });
            if (isBluTimeoutLike(result.error)) {
              recordEcoFlowTimeout({
                deviceId: device.rawId,
                deviceName: device.name,
                productType: ecoFlowEligibility.productType,
                source: 'local-ble',
                timeoutKind: 'connectTimeout',
                reason: failureReason,
                canRetry: true,
                requiresCloudAuth: false,
                requiresNativeBle: true,
                lastSuccessfulPhase: 'connecting',
                lastPacketAt: null,
              });
              bluLog('[BLU_TIMEOUT]', 'ecoflow_local_ble_timeout', buildBluTimeoutLogDetails({
                deviceId: device.rawId,
                vendor: 'ecoflow',
                phase: 'local_ble_connect',
                timeoutMs: ECOFLOW_LOCAL_BLE_CONNECT_TIMEOUT_MS,
                lastSuccessfulPhase: 'connect_requested',
                lastPacketAt: null,
                errorCode: 'CONNECT_FAILED',
                message: failureReason,
              }));
            } else {
              recordEcoFlowFailure({
                deviceId: device.rawId,
                deviceName: device.name,
                productType: ecoFlowEligibility.productType,
                source: 'local-ble',
                reason: failureReason,
                canRetry: true,
                requiresCloudAuth: false,
                requiresNativeBle: true,
                lastSuccessfulPhase: 'connecting',
              });
            }
            recordBluetoothDiagnosticEvent({
              type: 'connect_failure',
              source: 'native_ble',
              deviceId: device.rawId,
              deviceName: device.name,
              providerId: device.providerId,
              message: 'EcoFlow local Bluetooth connect failed.',
              error: failureReason,
            });
            ecsLog.warn('TELEMETRY', '[BT_CONNECT] failure', {
              deviceId: device.rawId,
              modelId: device.id,
              providerId: device.providerId,
              reason: failureReason,
            });
            setDeviceUiState(device.id, 'failed', failureReason);
            return;
          }

          const capabilityError = 'EcoFlow Bluetooth is attached, but ECS does not yet have a validated local telemetry parser for this model. Use the EcoFlow Cloud/API path for live telemetry while local decoding is pending.';
          recordEcoFlowBleProbeEvent({
            deviceId: device.rawId,
            displayName: device.name,
            providerId: device.providerId,
            providerLabel: device.provider,
            localName: device.localName ?? device.name,
            categoryHint: device.category,
            manufacturerData: device.manufacturerData,
            serviceUuids: device.serviceUuids,
            phase: 'local_parser_blocked',
            reason: capabilityError,
          });
          recordEcoFlowConnectionPhase({
            deviceId: device.rawId,
            deviceName: device.name,
            productType: ecoFlowEligibility.productType,
            phase: 'connected',
            source: 'local-ble',
            lastSuccessfulPhase: 'connecting',
          });
          recordEcoFlowConnectionPhase({
            deviceId: device.rawId,
            deviceName: device.name,
            productType: ecoFlowEligibility.productType,
            phase: 'awaitingTelemetry',
            source: 'local-ble',
            lastSuccessfulPhase: 'connected',
          });
          recordBluStreamHealthSnapshot({
            deviceId: device.rawId,
            vendor: 'ecoflow',
            phase: 'awaitingFirstPacket',
            source: 'local-ble',
            streamMode: 'local_ble_notifications',
            staleAfterMs: Math.max(DEFAULT_STALE_AFTER_MS, ECOFLOW_LOCAL_FIRST_TELEMETRY_TIMEOUT_MS),
          });
          await bluDeviceRegistry.registerDevice({
            provider: 'ecoflow',
            device_id: device.rawId,
            display_name: device.name,
            model: device.subtype ?? device.name,
            product_type: ecoFlowEligibility.productType,
            telemetry_capable: false,
            connection_state: 'connected',
            last_seen: Date.now(),
            capabilities: DEFAULT_BLU_CAPABILITIES,
          });
          await bluDeviceRegistry.ensurePrimary('ecoflow');
          await ensureManagedPowerOwnership(
            'ecoflow',
            device.rawId,
            device.name,
            device.subtype ?? device.name,
            device.signalStrength,
            'ble',
            'connected',
          );
          bluLog('[BLU_HANDSHAKE]', 'ecoflow_local_ble_parser_unavailable', {
            deviceId: device.rawId,
            vendor: 'ecoflow',
            deviceType: getBluDeviceLogType(device),
            connectionMode: 'ble',
            phase: 'telemetry_parser',
            lastSuccessfulPhase: 'native_transport_connected',
            driverMode: 'local_ble_incomplete',
            message: capabilityError,
          });
          recordEcoFlowTimeout({
            deviceId: device.rawId,
            deviceName: device.name,
            productType: ecoFlowEligibility.productType,
            source: 'local-ble',
            timeoutKind: 'firstTelemetryTimeout',
            reason: capabilityError,
            canRetry: false,
            requiresCloudAuth: true,
            requiresNativeBle: false,
            lastSuccessfulPhase: 'connected',
            lastPacketAt: null,
          });
          recordBluStreamHealthSnapshot({
            deviceId: device.rawId,
            vendor: 'ecoflow',
            phase: 'failed',
            source: 'local-ble',
            streamMode: 'local_ble_notifications',
            staleAfterMs: Math.max(DEFAULT_STALE_AFTER_MS, ECOFLOW_LOCAL_FIRST_TELEMETRY_TIMEOUT_MS),
            error: {
              phase: 'awaitingFirstPacket',
              code: 'LOCAL_BLE_PARSER_UNAVAILABLE',
              message: capabilityError,
            },
          });
          bluLog('[BLU_TIMEOUT]', 'ecoflow_local_ble_first_telemetry_timeout', buildBluTimeoutLogDetails({
            deviceId: device.rawId,
            vendor: 'ecoflow',
            phase: 'ecoflow_local_ble_first_telemetry',
            timeoutMs: ECOFLOW_LOCAL_FIRST_TELEMETRY_TIMEOUT_MS,
            lastSuccessfulPhase: 'native_transport_connected',
            lastPacketAt: null,
            errorCode: 'LOCAL_BLE_PARSER_UNAVAILABLE',
            message: capabilityError,
          }));
          recordBluetoothDiagnosticEvent({
            type: 'provider_handshake_failure',
            source: 'provider_handshake',
            deviceId: device.rawId,
            deviceName: device.name,
            providerId: device.providerId,
            message: 'EcoFlow local Bluetooth attached; provider telemetry parser unavailable.',
            error: capabilityError,
          });
          ecsLog.warn('TELEMETRY', '[BT_CONNECT] provider_capability_unavailable', {
            deviceId: device.rawId,
            modelId: device.id,
            providerId: device.providerId,
            reason: capabilityError,
          });
          setDeviceUiState(device.id, 'connected', capabilityError);
          setInfoMessage(capabilityError);
          return;
        }

        if (!adapter) {
          bluLog('[BLU_VENDOR]', 'power_brand_adapter_unavailable', {
            deviceId: device.rawId,
            vendor: device.providerId,
            deviceType: getBluDeviceLogType(device),
            connectionMode: getBluConnectionMode(device),
            phase: 'adapter_lookup',
            driverMode: 'disconnected_from_ui',
            message: 'Power brand adapter is unavailable.',
          });
          bluLog(getBluVendorPrefix(device.providerId), 'vendor_adapter_unavailable', {
            deviceId: device.rawId,
            vendor: device.providerId,
            driverMode: 'disconnected_from_ui',
          });
          recordBluetoothDiagnosticEvent({
            type: 'provider_handshake_failure',
            source: 'provider_handshake',
            deviceId: device.rawId,
            deviceName: device.name,
            providerId: device.providerId,
            message: 'Power brand adapter unavailable.',
            error: 'Power brand adapter is unavailable.',
          });
          ecsLog.warn('TELEMETRY', '[BT_CONNECT] failure', {
            deviceId: device.rawId,
            modelId: device.id,
            providerId: device.providerId,
            reason: 'Power brand adapter is unavailable.',
          });
          setDeviceUiState(device.id, 'failed', 'Power brand adapter is unavailable.');
          return;
        }

        let result = null as Awaited<ReturnType<typeof adapter.connect>> | null;
        for (let attempt = 1; attempt <= CONNECT_RETRY_ATTEMPTS; attempt += 1) {
          bluLog('[BLU_CONNECT]', 'power_brand_connect_attempt', buildBluConnectionAttemptLogDetails({
            deviceId: device.rawId,
            vendor: device.providerId,
            deviceType: getBluDeviceLogType(device),
            connectionMode: getBluConnectionMode(device),
            startedAt: Date.now(),
            timeoutMs: null,
            attempt,
            driverMode: 'power_brand_adapter',
          }));
          bluLog(getBluVendorPrefix(device.providerId), 'vendor_connect_attempt', {
            deviceId: device.rawId,
            vendor: device.providerId,
            attempt,
            connectionMode: getBluConnectionMode(device),
            driverMode: 'power_brand_adapter',
          });
          result = await adapter.connect({
            providerId: device.providerId,
            rawId: device.rawId,
            name: device.name,
            model: device.subtype,
            signalStrength: device.signalStrength,
          });
          if (result.success) {
            break;
          }

          if (!isCurrentDeviceOperation(device.id, operationId)) return;

          const nextError = result.error ?? 'Unable to connect this power device.';
          if (!isTransientConnectError(nextError, result.errorCode) || attempt === CONNECT_RETRY_ATTEMPTS) {
            bluLog(getBluVendorPrefix(device.providerId), 'vendor_connect_failed', {
              deviceId: device.rawId,
              vendor: device.providerId,
              deviceType: getBluDeviceLogType(device),
              connectionMode: getBluConnectionMode(device),
              phase: result.errorCode === 'TELEMETRY_UNAVAILABLE' ? 'telemetry_setup' : 'provider_handshake',
              attempt,
              errorCode: result.errorCode ?? null,
              message: nextError,
              driverMode: result.errorCode === 'PARSER_PENDING' ? 'local_ble_incomplete' : 'power_brand_adapter',
            });
            if (isBluTimeoutLike(nextError) || result.errorCode === 'TELEMETRY_UNAVAILABLE') {
              bluLog('[BLU_TIMEOUT]', 'power_brand_connect_timeout_or_stream_unavailable', buildBluTimeoutLogDetails({
                deviceId: device.rawId,
                vendor: device.providerId,
                phase: result.errorCode === 'TELEMETRY_UNAVAILABLE' ? 'telemetry_setup' : 'provider_handshake',
                timeoutMs: null,
                lastSuccessfulPhase: result.errorCode === 'TELEMETRY_UNAVAILABLE' ? 'provider_connect' : 'connect_requested',
                lastPacketAt: null,
                errorCode: result.errorCode ?? null,
                message: nextError,
              }));
            }
            recordBluetoothDiagnosticEvent({
              type: result.errorCode === 'TELEMETRY_UNAVAILABLE' ? 'provider_handshake_failure' : 'connect_failure',
              source: classifyBluetoothDiagnosticSource(nextError, 'provider_handshake'),
              deviceId: device.rawId,
              deviceName: device.name,
              providerId: device.providerId,
              message: 'Power provider connection failed.',
              error: nextError,
              details: { attempt, errorCode: result.errorCode ?? null },
            });
            ecsLog.warn('TELEMETRY', '[BT_CONNECT] failure', {
              deviceId: device.rawId,
              modelId: device.id,
              providerId: device.providerId,
              reason: nextError,
              attempt,
            });
            setDeviceUiState(device.id, 'failed', nextError);
            return;
          }

          await sleep(getRetryDelayMs(attempt));
        }

        if (!result?.success) {
          bluLog('[BLU_VENDOR]', 'power_brand_connect_failed', {
            deviceId: device.rawId,
            vendor: device.providerId,
            deviceType: getBluDeviceLogType(device),
            connectionMode: getBluConnectionMode(device),
            phase: 'provider_handshake',
            errorCode: result?.errorCode ?? null,
            message: result?.error ?? 'Unable to connect this power device.',
          });
          ecsLog.warn('TELEMETRY', '[BT_CONNECT] failure', {
            deviceId: device.rawId,
            modelId: device.id,
            providerId: device.providerId,
            reason: result?.error ?? 'Unable to connect this power device.',
          });
          setDeviceUiState(device.id, 'failed', result?.error ?? 'Unable to connect this power device.');
          return;
        }

        if (!isCurrentDeviceOperation(device.id, operationId)) return;

        await ensureManagedPowerOwnership(
          device.providerId as BluProviderId,
          device.rawId,
          device.name,
          result.devices[0]?.model ?? device.subtype ?? device.name,
          device.signalStrength,
        );
        setSelectedIds((current) => current.filter((entry) => entry !== device.id));
        setDeviceUiState(device.id, 'connected', null);
        recordBluetoothDiagnosticEvent({
          type: 'provider_handshake_success',
          source: 'provider_handshake',
          deviceId: device.rawId,
          deviceName: device.name,
          providerId: device.providerId,
          message: 'Power provider handshake and telemetry setup succeeded.',
          details: {
            status: result.status.label,
            phase: result.status.phase,
          },
        });
        recordBluetoothDiagnosticEvent({
          type: 'telemetry_first_packet',
          source: 'widget_telemetry',
          deviceId: device.rawId,
          deviceName: device.name,
          providerId: device.providerId,
          message: 'Power telemetry reached unified connection flow.',
        });
        bluLog('[BLU_HANDSHAKE]', 'power_provider_handshake_succeeded', {
          deviceId: device.rawId,
          vendor: device.providerId,
          deviceType: getBluDeviceLogType(device),
          connectionMode: getBluConnectionMode(device),
          phase: result.status.phase,
          status: result.status.label,
        });
        bluLog('[BLU_STREAM]', 'power_provider_stream_ready', {
          deviceId: device.rawId,
          vendor: device.providerId,
          deviceType: getBluDeviceLogType(device),
          connectionMode: getBluConnectionMode(device),
          phase: 'streaming',
          streamMode: getBluConnectionMode(device) === 'cloud' ? 'cloud_poll' : 'provider_poll',
        });
        ecsLog.debug('TELEMETRY', '[BT_CONNECT] success', {
          deviceId: device.rawId,
          modelId: device.id,
          kind: device.kind,
          providerId: device.providerId,
        });
        setInfoMessage(
          `${device.provider} connected. ${result.status.detail}`,
        );
        enqueueRouteIntent({
          owner: 'power',
          deviceId: device.rawId,
          deviceName: device.name,
          providerId: device.providerId,
          providerLabel: device.provider,
          routeKey: device.supportLevel === 'partial' ? 'power/partial' : 'power/live',
          suggestedPath: null,
          shouldNavigate: false,
          supportLabel: device.supportLabel,
          supportNote: device.supportNote,
          message: `${device.provider} is now owned by the ECS power domain.`,
        });
        void ecsProviderRegistry.fetchAllTelemetry();
        return;
      }

      if (device.kind === 'sensor' || device.kind === 'generic') {
        let result: Awaited<ReturnType<typeof genericBluetoothAccessoryManager.connect>> | null = null;

        for (let attempt = 1; attempt <= CONNECT_RETRY_ATTEMPTS; attempt += 1) {
          bluLog('[BLU_CONNECT]', 'accessory_connect_attempt', buildBluConnectionAttemptLogDetails({
            deviceId: device.rawId,
            vendor: device.providerId,
            deviceType: getBluDeviceLogType(device),
            connectionMode: 'ble',
            startedAt: Date.now(),
            timeoutMs: null,
            attempt,
            driverMode: 'generic_ble_accessory',
          }));
          result = await genericBluetoothAccessoryManager.connect({
            deviceId: device.rawId,
            displayName: device.name,
            providerLabel: device.provider,
            providerId: device.providerId,
            categoryHint: device.category,
            owner: device.kind,
            supportLabel: device.supportLabel,
            supportNote: device.supportNote,
            signalStrength: device.signalStrength,
            serviceUuids: device.serviceUuids,
            manufacturerData: device.manufacturerData,
            localName: device.localName ?? device.name,
          });
          if (result.success) {
            break;
          }

          if (!isCurrentDeviceOperation(device.id, operationId)) return;

          const accessoryError = result.error ?? 'Unable to connect this Bluetooth accessory.';
          if (!isTransientConnectError(accessoryError) || attempt === CONNECT_RETRY_ATTEMPTS) {
            bluLog(isBluTimeoutLike(accessoryError) ? '[BLU_TIMEOUT]' : '[BLU_CONNECT]', 'accessory_connect_failed', isBluTimeoutLike(accessoryError)
              ? buildBluTimeoutLogDetails({
                  deviceId: device.rawId,
                  vendor: device.providerId,
                  phase: 'generic_ble_connect',
                  timeoutMs: null,
                  lastSuccessfulPhase: 'connect_requested',
                  lastPacketAt: null,
                  errorCode: 'CONNECT_FAILED',
                  message: accessoryError,
                })
              : {
                  deviceId: device.rawId,
                  vendor: device.providerId,
                  deviceType: getBluDeviceLogType(device),
                  connectionMode: 'ble',
                  phase: 'generic_ble_connect',
                  attempt,
                  message: accessoryError,
                });
            ecsLog.warn('TELEMETRY', '[BT_CONNECT] failure', {
              deviceId: device.rawId,
              modelId: device.id,
              providerId: device.providerId,
              reason: accessoryError,
              attempt,
            });
            setDeviceUiState(device.id, 'failed', accessoryError);
            return;
          }

          await sleep(getRetryDelayMs(attempt));
        }

        if (!result?.success) {
          bluLog('[BLU_CONNECT]', 'accessory_connect_failed', {
            deviceId: device.rawId,
            vendor: device.providerId,
            deviceType: getBluDeviceLogType(device),
            connectionMode: 'ble',
            phase: 'generic_ble_connect',
            message: result?.error ?? 'Unable to connect this Bluetooth accessory.',
          });
          ecsLog.warn('TELEMETRY', '[BT_CONNECT] failure', {
            deviceId: device.rawId,
            modelId: device.id,
            providerId: device.providerId,
            reason: result?.error ?? 'Unable to connect this Bluetooth accessory.',
          });
          setDeviceUiState(device.id, 'failed', result?.error ?? 'Unable to connect this Bluetooth accessory.');
          return;
        }

        if (!isCurrentDeviceOperation(device.id, operationId)) return;

        setSelectedIds((current) => current.filter((entry) => entry !== device.id));
        setDeviceUiState(device.id, 'connected', null);
        bluLog('[BLU_HANDSHAKE]', 'accessory_connect_succeeded', {
          deviceId: device.rawId,
          vendor: device.providerId,
          deviceType: getBluDeviceLogType(device),
          connectionMode: 'ble',
          phase: 'native_transport_connected',
          driverMode: 'generic_ble_accessory',
        });
        ecsLog.debug('TELEMETRY', '[BT_CONNECT] success', {
          deviceId: device.rawId,
          modelId: device.id,
          kind: device.kind,
          providerId: device.providerId,
        });
        setInfoMessage(
          device.kind === 'sensor'
            ? `${device.name} connected as an ECS-managed sensor accessory.`
            : `${device.name} connected as a generic ECS-managed Bluetooth device.`,
        );
        enqueueRouteIntent({
          owner: device.kind,
          deviceId: device.rawId,
          deviceName: device.name,
          providerId: device.providerId,
          providerLabel: device.provider,
          routeKey: device.kind === 'sensor' ? 'sensor/generic' : 'bluetooth/generic',
          suggestedPath: null,
          shouldNavigate: false,
          supportLabel: device.supportLabel,
          supportNote: device.supportNote,
          message:
            device.kind === 'sensor'
              ? `${device.name} is now owned by the ECS accessory domain.`
              : `${device.name} is now managed as a generic Bluetooth device in ECS.`,
        });
        return;
      }

      const canUseReconnect =
        !device.isDiscoverable &&
        obdLastDevice?.id === device.rawId;

      let success = false;
      if (canUseReconnect) {
        bluLog('[BLU_RECONNECT]', 'obd2_remembered_reconnect_attempt', {
          deviceId: device.rawId,
          vendor: 'obd2',
          deviceType: getBluDeviceLogType(device),
          connectionMode: 'ble',
          startedAt: Date.now(),
          timeoutMs: 10_000,
          attempt: 1,
          source,
        });
        success = await attemptReconnect();
      } else {
        for (let attempt = 1; attempt <= CONNECT_RETRY_ATTEMPTS; attempt += 1) {
          bluLog('[BLU_CONNECT]', 'obd2_connect_attempt', buildBluConnectionAttemptLogDetails({
            deviceId: device.rawId,
            vendor: 'obd2',
            deviceType: getBluDeviceLogType(device),
            connectionMode: 'ble',
            startedAt: Date.now(),
            timeoutMs: 15_000,
            attempt,
            source,
          }));
          bluLog('[BLU_OBD2]', 'connect_attempt', {
            deviceId: device.rawId,
            vendor: 'obd2',
            connectionMode: 'ble',
            attempt,
          });
          success = await connectToDevice(device.rawId, device.name);
          if (success) {
            break;
          }

          if (!isCurrentDeviceOperation(device.id, operationId)) return;

          const telemetryError = obd2Adapter.getStatus().error ?? obdError ?? 'Unable to connect this telemetry adapter.';
          if (!isTransientConnectError(telemetryError) || attempt === CONNECT_RETRY_ATTEMPTS) {
            bluLog(isBluTimeoutLike(telemetryError) ? '[BLU_TIMEOUT]' : '[BLU_OBD2]', 'obd2_connect_failed', isBluTimeoutLike(telemetryError)
              ? buildBluTimeoutLogDetails({
                  deviceId: device.rawId,
                  vendor: 'obd2',
                  phase: /pid|no data|telemetry/i.test(telemetryError) ? 'obd2_pid_polling' : 'native_ble_connect',
                  timeoutMs: /pid|no data|telemetry/i.test(telemetryError) ? 5_000 : 15_000,
                  lastSuccessfulPhase: /pid|no data|telemetry/i.test(telemetryError) ? 'elm_transport' : 'connect_requested',
                  lastPacketAt: null,
                  errorCode: 'OBD2_CONNECT_FAILED',
                  message: telemetryError,
                })
              : {
                  deviceId: device.rawId,
                  vendor: 'obd2',
                  phase: 'native_ble_connect',
                  attempt,
                  message: telemetryError,
                });
            recordBluetoothDiagnosticEvent({
              type: 'connect_failure',
              source: classifyBluetoothDiagnosticSource(telemetryError, 'native_ble'),
              deviceId: device.rawId,
              deviceName: device.name,
              providerId: device.providerId,
              message: 'OBD2 adapter connection failed.',
              error: telemetryError,
              details: { attempt },
            });
            ecsLog.warn('TELEMETRY', '[BT_CONNECT] failure', {
              deviceId: device.rawId,
              modelId: device.id,
              providerId: device.providerId,
              reason: telemetryError,
              attempt,
            });
            setDeviceUiState(device.id, 'failed', telemetryError);
            return;
          }

          await sleep(getRetryDelayMs(attempt));
        }
      }

      if (!success) {
        const telemetryError = obd2Adapter.getStatus().error ?? obdError ?? 'Unable to connect this telemetry adapter.';
        bluLog('[BLU_OBD2]', 'connect_failed', {
          deviceId: device.rawId,
          vendor: 'obd2',
          phase: 'native_ble_connect',
          message: telemetryError,
        });
        recordBluetoothDiagnosticEvent({
          type: 'connect_failure',
          source: classifyBluetoothDiagnosticSource(telemetryError, 'native_ble'),
          deviceId: device.rawId,
          deviceName: device.name,
          providerId: device.providerId,
          message: 'OBD2 adapter connection failed.',
          error: telemetryError,
        });
        ecsLog.warn('TELEMETRY', '[BT_CONNECT] failure', {
          deviceId: device.rawId,
          modelId: device.id,
          providerId: device.providerId,
          reason: telemetryError,
        });
        setDeviceUiState(device.id, 'failed', telemetryError);
        return;
      }

      if (!isCurrentDeviceOperation(device.id, operationId)) return;

      setSelectedIds((current) => current.filter((entry) => entry !== device.id));
      setDeviceUiState(device.id, 'connected', null);
      bluLog('[BLU_HANDSHAKE]', 'obd2_handshake_succeeded', {
        deviceId: device.rawId,
        vendor: 'obd2',
        deviceType: getBluDeviceLogType(device),
        connectionMode: 'ble',
        phase: 'elm327_pid_polling_started',
      });
      bluLog('[BLU_STREAM]', 'obd2_stream_ready', {
        deviceId: device.rawId,
        vendor: 'obd2',
        streamMode: 'ble_notifications_pid_poll',
      });
      recordBluetoothDiagnosticEvent({
        type: 'obd2_handshake',
        source: 'obd2_pid',
        deviceId: device.rawId,
        deviceName: device.name,
        providerId: device.providerId,
        message: 'OBD2 transport handshake completed.',
      });
      ecsLog.debug('TELEMETRY', '[BT_CONNECT] success', {
        deviceId: device.rawId,
        modelId: device.id,
        kind: device.kind,
        providerId: device.providerId,
      });
      setInfoMessage(`${device.name} connected. ECS handed this adapter into vehicle telemetry.`);
      enqueueRouteIntent({
        owner: 'telemetry',
        deviceId: device.rawId,
        deviceName: device.name,
        providerId: device.providerId,
        providerLabel: device.provider,
        routeKey: 'telemetry/live',
        suggestedPath: '/vehicle-telemetry-settings',
        shouldNavigate: true,
        supportLabel: device.supportLabel,
        supportNote: device.supportNote,
        message: `${device.name} is now owned by the ECS telemetry domain.`,
      });
    } finally {
      connectInFlightRef.current.delete(device.id);
      updateBusy(device.id, false);
    }
  }, [
    attemptReconnect,
    beginDeviceOperation,
    busyIds,
    clearManualDisconnectRequest,
    connectToDevice,
    devices,
    enqueueRouteIntent,
    hasManualDisconnectRequest,
    isCurrentDeviceOperation,
    obdError,
    obdIsScanning,
    obdLastDevice,
    setDeviceUiState,
    stopScan,
    updateBusy,
  ]);

  const disconnectDevice = useCallback(async (deviceId: string, reason: string = 'user_disconnect') => {
    const device = devices.find((entry) => entry.id === deviceId);
    if (!device) return;
    if (disconnectInFlightRef.current.has(device.id)) return;

    disconnectInFlightRef.current.add(device.id);
    if (reason === 'user_disconnect') {
      markManualDisconnectRequest(device);
    }
    setInfoMessage(null);
    setDeviceUiState(device.id, 'disconnecting', null);
    bluLog('[BLU_DISCONNECT]', 'disconnect_requested', {
      deviceId: device.rawId,
      vendor: device.providerId,
      deviceType: getBluDeviceLogType(device),
      connectionMode: getBluConnectionMode(device),
      reason,
      kind: device.kind,
      manualDisconnectRequested: reason === 'user_disconnect',
    });
    recordBluetoothDiagnosticEvent({
      type: 'disconnect_start',
      source: device.connectionType === 'cloud' ? 'cloud_access' : 'native_ble',
      deviceId: device.rawId,
      deviceName: device.name,
      providerId: device.providerId,
      message: 'Unified scanner disconnect requested.',
      details: {
        reason,
        kind: device.kind,
        manualDisconnectRequested: reason === 'user_disconnect',
      },
    });
    setSelectedIds((current) => current.filter((entry) => entry !== device.id));
    updateBusy(device.id, true);
    const operationId = beginDeviceOperation(device.id);

    try {
      if (obdIsScanning) {
        await stopScan('disconnect_attempt');
      }

      if (device.kind === 'power') {
        const providerId = device.providerId as BluProviderId;
        const isEcoFlowCloudDevice = isEcoFlowCloudConnectionModel(device);
        let clearProviderPrimary = true;

        if (providerId === 'ecoflow' && isEcoFlowCloudDevice) {
          const provider = ecsProviderRegistry.getProvider('ecoflow');
          await powerDeviceStore.removeSelected('EcoFlow', device.rawId).catch(() => {});
          const remainingEcoFlowSelections = await powerDeviceStore.getSelected('EcoFlow').catch(() => []);
          if (remainingEcoFlowSelections.length === 0) {
            stopEcoFlowCloudTelemetryPolling(device.rawId);
            provider?.stopPolling();
            await provider?.disconnect();
            setSelectedEcoFlowDevice(null);
          } else {
            const nextEcoFlowDeviceId = remainingEcoFlowSelections[0];
            setSelectedEcoFlowDevice(nextEcoFlowDeviceId, null);
            await bluDeviceRegistry.setPrimary('ecoflow', nextEcoFlowDeviceId).catch(() => {});
            stopEcoFlowCloudTelemetryPolling(device.rawId);
            startEcoFlowCloudTelemetryPolling(
              { rawId: nextEcoFlowDeviceId, name: 'EcoFlow', category: 'power_station' },
              (nextResult) => {
                ingestEcoFlowCloudTelemetryResult(
                  { rawId: nextEcoFlowDeviceId, name: nextResult.telemetry?.device?.model ?? 'EcoFlow' },
                  nextResult,
                );
              },
            );
            await provider?.fetchTelemetry().catch(() => []);
            clearProviderPrimary = false;
          }
        } else if (providerId === 'ecoflow') {
          await genericBluetoothAccessoryManager.disconnect(device.rawId);
          clearBluStreamHealthSnapshot(device.rawId, 'ecoflow');
          recordEcoFlowConnectionPhase({
            deviceId: device.rawId,
            deviceName: device.name,
            productType: device.category,
            phase: 'disconnected',
            source: 'local-ble',
            lastSuccessfulPhase: 'disconnected',
          });
        } else {
          const adapter = getPowerBrandConnectionAdapterForDevice({
            providerId: device.providerId,
            rawId: device.rawId,
            name: device.name,
            model: device.subtype,
            signalStrength: device.signalStrength,
          });
          if (!adapter) {
            setDeviceUiState(device.id, 'failed', 'Power brand adapter is unavailable.');
            return;
          }

          await adapter.disconnect({
            providerId: device.providerId,
            rawId: device.rawId,
            name: device.name,
            model: device.subtype,
            signalStrength: device.signalStrength,
          });
        }

        await bluDeviceRegistry.updateConnectionState(providerId, device.rawId, 'disconnected').catch(() => {});
        if (clearProviderPrimary) {
          await bluDeviceRegistry.clearPrimary(providerId).catch(() => {});
        }
        await updateManagedPowerOwnershipState(
          providerId,
          device.rawId,
          'disconnected',
          device.signalStrength,
        );
        powerTelemetryManager.clearDisconnectedDevice(device.rawId);
        void ecsProviderRegistry.fetchAllTelemetry();
        if (!isCurrentDeviceOperation(device.id, operationId)) return;
        setDeviceUiState(device.id, 'idle', null);
        setInfoMessage(`${device.name} disconnected.`);
        bluLog('[BLU_DISCONNECT]', 'power_disconnect_succeeded', {
          deviceId: device.rawId,
          vendor: device.providerId,
          deviceType: getBluDeviceLogType(device),
          connectionMode: getBluConnectionMode(device),
          reason,
          clearAllPowerTelemetry: false,
        });
        recordBluetoothDiagnosticEvent({
          type: 'disconnect_success',
          source: isEcoFlowCloudDevice ? 'cloud_access' : 'native_ble',
          deviceId: device.rawId,
          deviceName: device.name,
          providerId: device.providerId,
          message: 'Power device disconnected.',
          details: { reason },
        });
        ecsLog.debug('TELEMETRY', '[BT_DISCONNECT] success', {
          deviceId: device.rawId,
          modelId: device.id,
          providerId: device.providerId,
          reason,
        });
        return;
      }

      if (device.kind === 'telemetry') {
        await disconnectProvider();
        clearBluStreamHealthSnapshot(device.rawId, 'obd2');
        if (!isCurrentDeviceOperation(device.id, operationId)) return;
        setDeviceUiState(device.id, 'idle', null);
        setInfoMessage(`${device.name} disconnected.`);
        bluLog('[BLU_DISCONNECT]', 'obd2_disconnect_succeeded', {
          deviceId: device.rawId,
          vendor: 'obd2',
          deviceType: getBluDeviceLogType(device),
          connectionMode: 'ble',
          reason,
          manualDisconnectRequested: reason === 'user_disconnect',
        });
        recordBluetoothDiagnosticEvent({
          type: 'disconnect_success',
          source: 'obd2_pid',
          deviceId: device.rawId,
          deviceName: device.name,
          providerId: device.providerId,
          message: 'OBD2 adapter disconnected.',
          details: { reason },
        });
        ecsLog.debug('TELEMETRY', '[BT_DISCONNECT] success', {
          deviceId: device.rawId,
          modelId: device.id,
          providerId: device.providerId,
          reason,
        });
        return;
      }

      await genericBluetoothAccessoryManager.disconnect(device.rawId);
      if (!isCurrentDeviceOperation(device.id, operationId)) return;
      setDeviceUiState(device.id, 'idle', null);
      setInfoMessage(`${device.name} disconnected.`);
      bluLog('[BLU_DISCONNECT]', 'accessory_disconnect_succeeded', {
        deviceId: device.rawId,
        vendor: device.providerId,
        deviceType: getBluDeviceLogType(device),
        connectionMode: 'ble',
        reason,
      });
      recordBluetoothDiagnosticEvent({
        type: 'disconnect_success',
        source: 'native_ble',
        deviceId: device.rawId,
        deviceName: device.name,
        providerId: device.providerId,
        message: 'Bluetooth accessory disconnected.',
        details: { reason },
      });
      ecsLog.debug('TELEMETRY', '[BT_DISCONNECT] success', {
        deviceId: device.rawId,
        modelId: device.id,
        providerId: device.providerId,
        reason,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'Disconnect failed.');
      bluLog('[BLU_DISCONNECT]', 'disconnect_failed', {
        deviceId: device.rawId,
        vendor: device.providerId,
        deviceType: getBluDeviceLogType(device),
        connectionMode: getBluConnectionMode(device),
        reason,
        errorCode: 'DISCONNECT_FAILED',
        message,
      });
      ecsLog.warn('TELEMETRY', '[BT_DISCONNECT] failure', {
        deviceId: device.rawId,
        modelId: device.id,
        providerId: device.providerId,
        reason,
        error: message,
      });
      recordBluetoothDiagnosticEvent({
        type: 'disconnect_failure',
        source: classifyBluetoothDiagnosticSource(message, 'native_ble'),
        deviceId: device.rawId,
        deviceName: device.name,
        providerId: device.providerId,
        message: 'Bluetooth disconnect failed.',
        error: message,
        details: { reason },
      });
      setDeviceUiState(device.id, 'failed', message || 'Disconnect failed.');
      setInfoMessage(`${device.name} did not disconnect cleanly: ${message || 'unknown error'}`);
    } finally {
      disconnectInFlightRef.current.delete(device.id);
      updateBusy(device.id, false);
    }
  }, [
    beginDeviceOperation,
    devices,
    disconnectProvider,
    isCurrentDeviceOperation,
    markManualDisconnectRequest,
    obdIsScanning,
    setDeviceUiState,
    stopScan,
    updateBusy,
  ]);

  const retryDevice = useCallback(async (
    deviceId: string,
    source: DeviceConnectionRequestSource = 'user_retry',
  ) => {
    const device = devices.find((entry) => entry.id === deviceId);
    if (device) {
      clearManualDisconnectRequest(device);
    } else {
      userDisconnectedDeviceIdsRef.current.delete(deviceId);
      delete manualDisconnectRequestedRef.current[deviceId];
    }
    await connectDevice(deviceId, source);
  }, [clearManualDisconnectRequest, connectDevice, devices]);

  const connectSelected = useCallback(async (
    source: DeviceConnectionRequestSource = 'user_selected_batch',
  ) => {
    const selectedDevices = devices.filter((device) => selectedIds.includes(device.id));
    if (selectedDevices.length === 0) return;

    if (mountedRef.current) {
      setBatchBusy(true);
    }
    setInfoMessage(null);

    try {
      const telemetrySelections = selectedDevices.filter((device) => device.kind === 'telemetry');
      if (telemetrySelections.length > 1) {
        setInfoMessage('Only one OBD2 telemetry adapter can be active at a time right now. ECS will connect the first telemetry adapter in your selection.');
      }

      const powerSelections = selectedDevices.filter((device) => device.kind === 'power');
      for (const device of powerSelections) {
        await connectDevice(device.id, source);
      }

      const accessorySelections = selectedDevices.filter((device) => (
        device.kind === 'sensor' || device.kind === 'generic'
      ));
      for (const device of accessorySelections) {
        await connectDevice(device.id, source);
      }

      if (telemetrySelections.length > 0) {
        await connectDevice(telemetrySelections[0].id, source);
      }
    } finally {
      if (mountedRef.current) {
        setBatchBusy(false);
      }
    }
  }, [connectDevice, devices, selectedIds]);

  const toggleSelection = useCallback((deviceId: string) => {
    const device = devices.find((entry) => entry.id === deviceId);
    if (!device) return;
    if (device.isConnected || device.isConnecting || device.actionKind === 'none') return;
    const connectionPolicy = getBluestackConnectionPolicy(device);
    if (!connectionPolicy.canAttemptConnection && device.actionKind !== 'retry') return;
    clearManualDisconnectRequest(device);

    setSelectedIds((current) => (
      current.includes(deviceId)
        ? current.filter((entry) => entry !== deviceId)
        : [...current, deviceId]
    ));
  }, [clearManualDisconnectRequest, devices]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const isBusy = batchBusy || busyIds.length > 0;
  const isCheckingScanReadiness = obdScannerState === 'requesting_permissions';
  const isScanning =
    isRefreshing ||
    obdIsScanning ||
    powerProviderSummaries.some((provider) => provider.isScanning);

  useEffect(() => {
    if (isBusy || isScanning) return;

    const now = Date.now();
    const candidate = devices.find((device) => {
      if (device.kind !== 'power') return false;
      if (!device.isRemembered || !device.isDiscoverable) return false;
      if (device.isConnected || device.isConnecting) return false;
      if (device.actionKind !== 'connect' && device.actionKind !== 'retry') return false;
      if (hasManualDisconnectRequest(device)) return false;
      const previousAttemptAt = autoReconnectAttemptedAtRef.current.get(device.id) ?? 0;
      return now - previousAttemptAt >= REMEMBERED_DEVICE_AUTO_RECONNECT_COOLDOWN_MS;
    });

    if (!candidate) return;

    autoReconnectAttemptedAtRef.current.set(candidate.id, now);
    bluLog('[BLU_RECONNECT]', 'saved_power_auto_reconnect_attempt', {
      deviceId: candidate.rawId,
      vendor: candidate.providerId,
      deviceType: getBluDeviceLogType(candidate),
      connectionMode: getBluConnectionMode(candidate),
      cooldownMs: REMEMBERED_DEVICE_AUTO_RECONNECT_COOLDOWN_MS,
    });
    void connectDevice(candidate.id, 'saved_auto_reconnect');
  }, [connectDevice, devices, hasManualDisconnectRequest, isBusy, isScanning]);

  useEffect(() => {
    if (manualScanStatus !== 'scanning') return;
    if (isScanning) return;

    setManualScanStatus('completed');
  }, [isScanning, manualScanStatus]);

  const connectedDevices = useMemo(
    () => devices.filter((device) => device.section === 'connected'),
    [devices],
  );
  const nearbyDevices = useMemo(
    () => devices.filter((device) => device.section === 'nearby'),
    [devices],
  );
  const knownDevices = useMemo(
    () => devices.filter((device) => device.section === 'known'),
    [devices],
  );
  const attentionDevices = useMemo(
    () => devices.filter((device) => device.section === 'attention'),
    [devices],
  );
  const visibleScanResultCount = nearbyDevices.length + connectedDevices.length + attentionDevices.length;

  useEffect(() => {
    if (!DEBUG_DEVICE_CONNECTIONS) return;
    if (manualScanStatus === 'idle') {
      lastLoggedScanResultCountRef.current = null;
      lastLoggedSourceSummaryRef.current = null;
      return;
    }
    if (isScanning && visibleScanResultCount === 0) return;
    if (lastLoggedScanResultCountRef.current === visibleScanResultCount) return;

    ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] scan_result', {
      count: visibleScanResultCount,
    });
    lastLoggedScanResultCountRef.current = visibleScanResultCount;
  }, [isScanning, manualScanStatus, visibleScanResultCount]);

  useEffect(() => {
    if (!DEBUG_DEVICE_CONNECTIONS) return;
    if (manualScanStatus === 'idle') return;
    const summary = sourceStatuses.map((source) => ({
      source: source.key,
      status: source.status,
      rawCount: source.rawCount,
      normalizedCount: source.normalizedCount,
      addedCount: source.addedCount,
      failedReason: source.failedReason,
    }));
    const fingerprint = JSON.stringify(summary);
    if (lastLoggedSourceSummaryRef.current === fingerprint) return;

    ecsLog.debug('TELEMETRY', '[DEVICE_CONNECTIONS] source_summary', {
      sources: summary,
    });
    lastLoggedSourceSummaryRef.current = fingerprint;
  }, [manualScanStatus, sourceStatuses]);

  useEffect(() => {
    for (const device of connectedDevices) {
      if (device.isLive) {
        bluLogThrottled('[BLU_TELEMETRY]', `connected-model:${device.rawId}:${device.providerId}`, 'connected_device_live_state', buildBluTelemetryLogDetails({
          deviceId: device.rawId,
          vendor: device.providerId,
          telemetryKeys: device.kind === 'telemetry'
            ? ['obd2_values']
            : device.kind === 'power'
              ? ['battery.socPct', 'battery.wattsIn', 'battery.wattsOut']
              : [],
          lastPacketAt: device.lastSeenAt,
          streamMode: device.telemetrySource === 'provider_cloud' ? 'cloud_poll' : device.telemetrySource === 'ble_live' ? 'ble_live' : device.telemetrySource,
          telemetrySource: device.telemetrySource,
          telemetryUnsupported: device.telemetryUnsupported,
        }), 15_000);
      } else if (device.telemetryUnsupported) {
        bluLogThrottled('[BLU_STREAM]', `connected-model-no-telemetry:${device.rawId}:${device.providerId}`, 'connected_without_live_telemetry', {
          deviceId: device.rawId,
          vendor: device.providerId,
          deviceType: getBluDeviceLogType(device),
          connectionMode: getBluConnectionMode(device),
          telemetrySource: device.telemetrySource,
          telemetryUnsupported: device.telemetryUnsupported,
          streamMode: device.telemetrySource,
        }, 15_000);
      }
      if (!DEBUG_DEVICE_CONNECTIONS) continue;
      ecsLog.debug('TELEMETRY', '[BT_LIVE] control_page_source', {
        deviceId: device.rawId,
        providerId: device.providerId,
        source: device.telemetrySource,
        label: device.telemetrySourceLabel,
        isLive: device.isLive,
        telemetryUnsupported: device.telemetryUnsupported,
      });
    }
  }, [connectedDevices]);

  useEffect(() => {
    if (!DEBUG_DEVICE_CONNECTIONS) return;
    ecsLog.debug('TELEMETRY', '[BT_SCAN] render_count', {
      total: devices.length,
      connected: connectedDevices.length,
      nearby: nearbyDevices.length,
      known: knownDevices.length,
      attention: attentionDevices.length,
      isScanning,
      obdError: obdError ?? null,
    });
    ecsLog.debug('TELEMETRY', '[BT_BLOCKER] rendered_count', {
      total: devices.length,
      connected: connectedDevices.length,
      nearby: nearbyDevices.length,
      known: knownDevices.length,
      attention: attentionDevices.length,
      rawScanDevices: discoveredTelemetryDevices.length,
      routedPower: routedPowerDiscoveries.length,
      routedTelemetry: routedTelemetryDiscoveries.length,
      fallbackObd2Candidates: telemetryFallbackCandidateDiscoveries.length,
      routedAccessories: routedAccessoryDiscoveries.length,
      hiddenAccessoryModels: accessoryDevices.length,
      isScanning,
      obdError: obdError ?? null,
    });
  }, [
    accessoryDevices.length,
    attentionDevices.length,
    connectedDevices.length,
    discoveredTelemetryDevices.length,
    devices.length,
    isScanning,
    knownDevices.length,
    nearbyDevices.length,
    obdError,
    routedAccessoryDiscoveries.length,
    routedPowerDiscoveries.length,
    routedTelemetryDiscoveries.length,
    telemetryFallbackCandidateDiscoveries.length,
  ]);

  const degradedMessage = useMemo(() => {
    const hasRuntimeUnsupportedSource = sourceStatuses.some((source) =>
      (source.key === 'ble' || source.key === 'obd2') &&
      source.status === 'unsupported' &&
      source.failedReason === 'runtime_unsupported',
    );
    if (Platform.OS === 'web') {
      return 'Bluetooth scanning is not available in web preview. Open ECS on a mobile device to scan and connect.';
    }
    if (isPermissionIssue(obdError)) {
      return obdError ?? 'Bluetooth permission is required to scan.';
    }
    if (isNativeBluetoothRuntimeUnsupported(obdError)) {
      return `${NATIVE_BLUETOOTH_RUNTIME_MESSAGE} Cloud/API devices remain available.`;
    }
    if (hasRuntimeUnsupportedSource) {
      return `${NATIVE_BLUETOOTH_RUNTIME_MESSAGE} Cloud/API devices remain available.`;
    }
    if (isBluetoothUnavailable(obdError)) {
      return obdError ?? 'Bluetooth is unavailable or turned off.';
    }
    if (nearbyDevices.some((device) => device.status === 'unsupported')) {
      return 'Some nearby devices are visible, but ECS support is limited for their provider.';
    }
    return null;
  }, [nearbyDevices, obdError, sourceStatuses]);

  const scanAreaState = useMemo<ECSConnectionScanAreaState>(() => {
    const hasRuntimeUnsupportedSource = sourceStatuses.some((source) =>
      (source.key === 'ble' || source.key === 'obd2') &&
      source.status === 'unsupported' &&
      source.failedReason === 'runtime_unsupported',
    );
    if (isCheckingScanReadiness) {
      return 'checking';
    }
    if (manualScanStatus !== 'idle' && isPermissionIssue(obdError)) {
      return 'permission_denied';
    }
    if (visibleScanResultCount > 0) {
      return 'results';
    }
    if (manualScanStatus !== 'idle' && isNativeBluetoothRuntimeUnsupported(obdError)) {
      return 'runtime_unsupported';
    }
    if (manualScanStatus !== 'idle' && hasRuntimeUnsupportedSource) {
      return 'runtime_unsupported';
    }
    if (manualScanStatus !== 'idle' && isBluetoothUnavailable(obdError)) {
      return 'bluetooth_unavailable';
    }
    if (isScanning) {
      return 'scanning';
    }
    if (manualScanStatus === 'completed') {
      if (sourceStatuses.some((source) => source.key === 'ecoflow_api' && source.status === 'failed')) {
        return 'api_failed';
      }
      if (sourceStatuses.some((source) => source.key === 'ble' && source.status === 'failed')) {
        return 'ble_failed';
      }
      if (sourceStatuses.some((source) => source.key === 'classic_bluetooth' && source.status === 'unsupported')) {
        return 'classic_unsupported';
      }
      if (obdError) {
        return 'scan_failed';
      }
      return 'empty';
    }
    return 'idle';
  }, [isCheckingScanReadiness, isScanning, manualScanStatus, visibleScanResultCount, obdError, sourceStatuses]);

  const scanAreaMessage = useMemo(() => {
    const ecoFlowApiStatus = sourceStatuses.find((source) => source.key === 'ecoflow_api') ?? null;
    switch (scanAreaState) {
      case 'checking':
        return 'Checking Bluetooth permissions and adapter readiness before scanning.';
      case 'permission_denied':
        return obdError ?? 'Bluetooth permission is required to scan.';
      case 'bluetooth_unavailable':
        return obdError ?? 'Bluetooth is unavailable or turned off.';
      case 'runtime_unsupported':
        return `${NATIVE_BLUETOOTH_RUNTIME_MESSAGE} Cloud/API devices remain available.`;
      case 'api_failed':
        if (ecoFlowApiStatus?.failedReason === 'cloud_auth') {
          return 'EcoFlow Cloud is not authorized for this account or device. Local Bluetooth discovery remains available.';
        }
        return 'API discovery failed. BLE results remain available when nearby devices are seen.';
      case 'ble_failed':
        return obdError ?? 'BLE discovery failed. API and cached results remain visible if available.';
      case 'classic_unsupported':
        return 'Classic Bluetooth unsupported in this runtime. BLE, API, and cached devices remain visible.';
      case 'scan_failed':
        return obdError ?? 'Bluetooth scan failed. Check permissions and Bluetooth state, then try again.';
      case 'scanning':
        return 'Scanning nearby devices. Available devices populate here as results arrive.';
      case 'empty':
        return 'No nearby devices found. Make sure the device is powered on, nearby, and discoverable.';
      case 'results':
        return 'Found selectable Bluestack devices. Cloud/API devices remain available when native Bluetooth is unavailable.';
      case 'idle':
      default:
        return 'Tap Scan for Device Connections to search nearby Bluetooth devices.';
    }
  }, [visibleScanResultCount, obdError, scanAreaState]);

  const lastScanSummary = useMemo<ECSScanSummary>(() => {
    const rawDevicesSeenCount = sourceStatuses.reduce((count, source) => count + source.rawCount, 0);
    const visibleDevicesCount = visibleScanResultCount;
    const filteredDevicesCount = Math.max(0, rawDevicesSeenCount - visibleDevicesCount);
    const filterReasons = new Set<string>();

    if (manualScanStatus !== 'idle' && rawDevicesSeenCount === 0) {
      filterReasons.add('no_raw_devices_seen');
    }
    for (const source of sourceStatuses) {
      if (source.status === 'failed') {
        filterReasons.add(`${source.label}: ${source.detail ?? 'discovery_failed'}`);
      }
      if (source.status === 'unsupported') {
        filterReasons.add(`${source.label}: unsupported`);
      }
      if (source.status === 'disabled') {
        filterReasons.add(`${source.label}: disabled`);
      }
    }
    if (filteredDevicesCount > 0) {
      filterReasons.add('duplicate_or_unsupported_rows_collapsed');
    }
    if (routedAccessoryDiscoveries.length > 0) {
      filterReasons.add('unsupported_bluetooth_noise_hidden');
    }
    if (attentionDevices.some((device) => device.status === 'unsupported' || device.status === 'partial')) {
      filterReasons.add('some_devices_have_limited_connection_support');
    }

    return {
      startedAt: scanBeganAt,
      durationMs: scanDurationMs,
      sourcesAttempted: sourceStatuses.map((source) => source.label),
      rawDevicesSeenCount,
      visibleDevicesCount,
      filteredDevicesCount,
      filterReasons: Array.from(filterReasons),
      sourceStatuses,
      bluetoothDiagnostics,
    };
  }, [
    attentionDevices,
    manualScanStatus,
    bluetoothDiagnostics,
    visibleScanResultCount,
    scanDurationMs,
    scanBeganAt,
    sourceStatuses,
    routedAccessoryDiscoveries.length,
  ]);

  const globalSummaryLabel = useMemo(() => {
    if (connectedDevices.some((device) => device.isLive)) {
      return 'Live connections active';
    }
    if (connectedDevices.length > 0) {
      return 'Connections active';
    }
    if (isScanning) {
      if (isCheckingScanReadiness) {
        return 'Checking Bluetooth readiness';
      }
      return 'Scanning for device connections';
    }
    if (manualScanStatus === 'idle' && devices.length === 0) {
      return 'Ready to scan';
    }
    if (devices.length === 0) {
      return 'No nearby devices found';
    }
    return 'Ready to connect';
  }, [connectedDevices, devices.length, isCheckingScanReadiness, isScanning, manualScanStatus]);
  const routeIntent = routeIntents[0] ?? null;
  const scannerSnapshot = useMemo(() => createUnifiedScannerSnapshot({
    scanAreaState,
    scanAreaMessage,
    devices,
  }), [devices, scanAreaMessage, scanAreaState]);
  const bluestackSummary = useMemo(
    () => createBluestackScannerSummary(devices),
    [devices],
  );

  useEffect(() => {
    recordBluetoothDiagnosticEvent({
      type: 'scanner_snapshot',
      source: 'native_ble',
      message: 'Unified scanner snapshot updated.',
      details: {
        scannerState: scannerSnapshot.state,
        nativeEnvironmentSupport: scanAreaState === 'runtime_unsupported' ? 'unsupported' : 'available_or_unknown',
        permissions: scanAreaState === 'permission_denied' ? 'denied' : 'granted_or_unknown',
        bluetoothPoweredState: scanAreaState === 'bluetooth_unavailable' ? 'off_or_unavailable' : 'on_or_unknown',
        nearbyDeviceCount: nearbyDevices.length,
        connectedDeviceCount: scannerSnapshot.connectedDeviceCount,
        streamingDeviceCount: scannerSnapshot.streamingDeviceCount,
        bluestackCloudApiCount: bluestackSummary.cloudApiCount,
        bluestackParserPendingCount: bluestackSummary.parserPendingCount,
        bluestackNativeBuildRequiredCount: bluestackSummary.nativeBuildRequiredCount,
        bluestackLiveReadyCount: bluestackSummary.liveReadyCount,
      },
    });

    for (const device of scannerSnapshot.devices) {
      if (diagnosedScannerDeviceIdsRef.current.has(device.id)) continue;
      diagnosedScannerDeviceIdsRef.current.add(device.id);
      recordBluetoothDiagnosticEvent({
        type: 'device_discovered',
        source: device.transport === 'cloud' ? 'cloud_access' : 'native_ble',
        deviceId: device.rawId,
        deviceName: device.name,
        providerId: device.provider,
        message: 'Device entered unified scanner results.',
        details: {
          category: device.category,
          transport: device.transport,
          rssi: device.rssi,
          lastSeenAt: device.lastSeenAt,
        },
      });
      recordBluetoothDiagnosticEvent({
        type: 'device_classified',
        source: device.category === 'unsupported' ? 'provider_handshake' : 'native_ble',
        deviceId: device.rawId,
        deviceName: device.name,
        providerId: device.provider,
        message: 'Device classified by unified scanner contract.',
        details: {
          category: device.category,
          provider: device.provider,
          transport: device.transport,
          connectionState: device.connectionState,
          telemetryState: device.telemetryState,
        },
      });
    }
  }, [bluestackSummary, nearbyDevices.length, scanAreaState, scannerSnapshot]);

  return {
    devices,
    scannerDevices: scannerSnapshot.devices,
    scannerSnapshot,
    bluestackSummary,
    connectedDevices,
    nearbyDevices,
    knownDevices,
    attentionDevices,
    connectedCount: connectedDevices.length,
    liveCount: connectedDevices.filter((device) => device.isLive).length,
    selectedCount: selectedIds.length,
    canConnectSelected: selectedIds.length > 0,
    isScanning,
    isCheckingScanReadiness,
    isBusy,
    isBatchBusy: batchBusy,
    isDegraded: degradedMessage != null,
    scanStatus: manualScanStatus,
    scanAreaState,
    scanAreaMessage,
    lastScanSummary,
    hasUserRequestedScan: manualScanStatus !== 'idle',
    hasCompletedManualScan: manualScanStatus === 'completed',
    degradedMessage,
    infoMessage,
    globalSummaryLabel,
    routeIntent,
    toggleSelection,
    clearSelection,
    connectDevice,
    disconnectDevice,
    retryDevice,
    connectSelected,
    consumeRouteIntent,
    rescan,
    stopScanning,
  };
}

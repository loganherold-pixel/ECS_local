import type { ECSDeviceConnectionModel, ECSConnectionScanAreaState, ECSConnectionStatus } from './useUnifiedDeviceConnections';

export type UnifiedScannerDeviceCategory =
  | 'power_device'
  | 'obd2'
  | 'unknown_supported'
  | 'unsupported';

export type UnifiedScannerProvider =
  | 'ecoflow'
  | 'bluetti'
  | 'jackery'
  | 'anker'
  | 'goalzero'
  | 'generic_obd2'
  | 'unknown';

export type UnifiedScannerTransport =
  | 'ble'
  | 'classic_bluetooth'
  | 'cloud'
  | 'unknown';

export type UnifiedScannerConnectionState =
  | 'idle'
  | 'permission_required'
  | 'bluetooth_off'
  | 'scanning'
  | 'discovered'
  | 'connecting'
  | 'connected'
  | 'streaming'
  | 'disconnecting'
  | 'disconnected'
  | 'error';

export type UnifiedScannerTelemetryState =
  | 'idle'
  | 'unavailable'
  | 'subscribing'
  | 'polling'
  | 'streaming'
  | 'stale'
  | 'error';

export type UnifiedScannerErrorSource =
  | 'native_ble'
  | 'cloud_auth'
  | 'cloud_access'
  | 'cloud_config'
  | 'cloud_device_status'
  | 'parser'
  | 'permission'
  | 'transport'
  | 'app_state';

export interface UnifiedScannerAdvertisedIdentifiers {
  serviceUuids: string[];
  manufacturerData?: string | null;
  localName?: string | null;
}

export interface UnifiedScannerDevice {
  id: string;
  rawId: string;
  name: string;
  category: UnifiedScannerDeviceCategory;
  provider: UnifiedScannerProvider;
  transport: UnifiedScannerTransport;
  connectionState: UnifiedScannerConnectionState;
  telemetryState: UnifiedScannerTelemetryState;
  lastSeenAt: number | null;
  rssi: number | null;
  advertised: UnifiedScannerAdvertisedIdentifiers;
  error: string | null;
  errorSource: UnifiedScannerErrorSource | null;
  sourceModel: ECSDeviceConnectionModel;
}

export interface UnifiedScannerSnapshot {
  state: UnifiedScannerConnectionState;
  devices: UnifiedScannerDevice[];
  visibleDeviceCount: number;
  streamingDeviceCount: number;
  connectedDeviceCount: number;
  lastError: string | null;
}

function normalizeProvider(providerId: string | null | undefined): UnifiedScannerProvider {
  const value = String(providerId ?? '').toLowerCase();
  if (value === 'ecoflow') return 'ecoflow';
  if (value === 'bluetti') return 'bluetti';
  if (value === 'jackery') return 'jackery';
  if (value === 'anker_solix' || value === 'anker') return 'anker';
  if (value === 'goal_zero' || value === 'goalzero') return 'goalzero';
  if (value === 'obd2' || value === 'generic_obd2') return 'generic_obd2';
  return 'unknown';
}

function normalizeTransport(value: string | null | undefined): UnifiedScannerTransport {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'api' || normalized === 'cloud' || normalized === 'provider_cloud') return 'cloud';
  if (normalized === 'ble' || normalized === 'hybrid') return 'ble';
  if (normalized === 'classic_bluetooth') return 'classic_bluetooth';
  return 'unknown';
}

function normalizeCategory(device: ECSDeviceConnectionModel): UnifiedScannerDeviceCategory {
  if (!device.isSupported || device.supportLevel === 'ui_only') return 'unsupported';
  if (device.kind === 'power') return 'power_device';
  if (device.kind === 'telemetry' || device.deviceCategory === 'obd') return 'obd2';
  return 'unknown_supported';
}

function normalizeConnectionState(
  device: ECSDeviceConnectionModel,
  transport: UnifiedScannerTransport,
): UnifiedScannerConnectionState {
  if (device.actionKind === 'disconnecting' || device.status === 'disconnecting') {
    return 'disconnecting';
  }

  if (transport === 'cloud') {
    if (device.isLive) return 'streaming';
    if (device.isConnecting) return 'connecting';
    if (device.lastError) return 'error';
    if (device.isDiscoverable) return 'discovered';
    return 'disconnected';
  }

  if (device.isLive) return 'streaming';
  if (device.isConnecting) return 'connecting';
  if (device.isConnected) return 'connected';
  if (device.lastError) return 'error';
  if (device.isDiscoverable) return 'discovered';
  return 'disconnected';
}

function normalizeTelemetryState(device: ECSDeviceConnectionModel): UnifiedScannerTelemetryState {
  if (device.isLive) return 'streaming';
  if (device.telemetryUnsupported) return 'error';
  if (device.telemetrySource === 'cache') return 'stale';
  if (device.isConnected && device.supportsTelemetryData) return 'polling';
  if (device.isConnecting) return 'subscribing';
  return device.supportsTelemetryData || device.supportsPowerData ? 'unavailable' : 'idle';
}

function inferErrorSource(
  device: ECSDeviceConnectionModel,
  transport: UnifiedScannerTransport,
): UnifiedScannerErrorSource | null {
  if (!device.lastError) return null;
  if (/permission/i.test(device.lastError)) return 'permission';
  if (/signature|region|api key|access key|account binding|credential|configuration|config/i.test(device.lastError)) return 'cloud_config';
  if (/device.*offline|device.*failed|device status|cloud device/i.test(device.lastError)) return 'cloud_device_status';
  if (/unauthori[sz]ed|not authorized|forbidden|approval|auth/i.test(device.lastError)) return 'cloud_auth';
  if (transport === 'cloud' || /cloud|access/i.test(device.lastError)) return 'cloud_access';
  if (/parser|decode|elm|pid/i.test(device.lastError)) return 'parser';
  if (/app state|background|foreground/i.test(device.lastError)) return 'app_state';
  if (transport === 'ble' || transport === 'classic_bluetooth') return 'native_ble';
  return 'transport';
}

export function mapScanAreaStateToScannerState(
  scanAreaState: ECSConnectionScanAreaState,
): UnifiedScannerConnectionState {
  switch (scanAreaState) {
    case 'checking':
    case 'scanning':
      return 'scanning';
    case 'results':
      return 'discovered';
    case 'permission_denied':
      return 'permission_required';
    case 'bluetooth_unavailable':
      return 'bluetooth_off';
    case 'api_failed':
    case 'ble_failed':
    case 'scan_failed':
      return 'error';
    case 'empty':
      return 'disconnected';
    case 'runtime_unsupported':
    case 'classic_unsupported':
      return 'error';
    case 'idle':
    default:
      return 'idle';
  }
}

export function mapConnectionStatusToScannerState(
  status: ECSConnectionStatus,
): UnifiedScannerConnectionState {
  switch (status) {
    case 'live':
      return 'streaming';
    case 'connected':
      return 'connected';
    case 'connecting':
      return 'connecting';
    case 'disconnecting':
      return 'disconnecting';
    case 'discoverable':
    case 'selected':
    case 'partial':
      return 'discovered';
    case 'failed':
    case 'unsupported':
    case 'stale':
      return 'error';
    case 'remembered':
    default:
      return 'disconnected';
  }
}

export function normalizeUnifiedScannerDevice(device: ECSDeviceConnectionModel): UnifiedScannerDevice {
  const transport = normalizeTransport(device.connectionType);
  const serviceUuids = device.sourceBadges
    .filter((badge) => /^service:/i.test(badge))
    .map((badge) => badge.replace(/^service:/i, '').trim())
    .filter(Boolean);

  return {
    id: device.id,
    rawId: device.rawId,
    name: device.name,
    category: normalizeCategory(device),
    provider: normalizeProvider(device.providerId),
    transport,
    connectionState: normalizeConnectionState(device, transport),
    telemetryState: normalizeTelemetryState(device),
    lastSeenAt: device.lastSeenAt,
    rssi: device.signalStrength,
    advertised: {
      serviceUuids,
      localName: device.name,
    },
    error: device.lastError,
    errorSource: inferErrorSource(device, transport),
    sourceModel: device,
  };
}

export function createUnifiedScannerSnapshot(args: {
  scanAreaState: ECSConnectionScanAreaState;
  scanAreaMessage: string;
  devices: ECSDeviceConnectionModel[];
}): UnifiedScannerSnapshot {
  const devices = args.devices.map(normalizeUnifiedScannerDevice);
  const streamingDeviceCount = devices.filter((device) => device.connectionState === 'streaming').length;
  const connectedDeviceCount = devices.filter((device) =>
    device.connectionState === 'connected' || device.connectionState === 'streaming'
  ).length;
  const state = streamingDeviceCount > 0
    ? 'streaming'
    : connectedDeviceCount > 0
      ? 'connected'
      : mapScanAreaStateToScannerState(args.scanAreaState);

  return {
    state,
    devices,
    visibleDeviceCount: devices.length,
    streamingDeviceCount,
    connectedDeviceCount,
    lastError: state === 'error' ? args.scanAreaMessage : null,
  };
}

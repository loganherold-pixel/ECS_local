import { useCallback, useMemo } from 'react';
import { useUnifiedDeviceConnections } from './useUnifiedDeviceConnections';
import type {
  OBD2AdapterState,
  OBD2DiscoveredDevice,
  OBD2ScanDiagnostics,
} from '../src/vehicle-telemetry/OBD2Adapter';
import type { OBD2ScannerHookResult } from '../src/vehicle-telemetry/useOBD2Scanner';
import type { TelemetrySourceStatus } from '../src/vehicle-telemetry/TelemetryDiscoveryControl';

export type { OBD2DiscoveredDevice, OBD2AdapterState, OBD2ScanDiagnostics };
export type UnifiedOBD2ScannerHookResult = OBD2ScannerHookResult;

function isObdDevice(device: ReturnType<typeof useUnifiedDeviceConnections>['devices'][number]): boolean {
  return device.kind === 'telemetry' || device.deviceCategory === 'obd' || device.providerId === 'obd2';
}

function mapScanAreaToObdState(
  scanAreaState: ReturnType<typeof useUnifiedDeviceConnections>['scanAreaState'],
  isScanning: boolean,
  isConnecting: boolean,
  isConnected: boolean,
  hasError: boolean,
): OBD2AdapterState {
  if (isConnected) return 'connected';
  if (isConnecting) return 'connecting';
  if (isScanning) return 'scanning';
  if (hasError) return 'error';
  if (scanAreaState === 'permission_denied') return 'requesting_permissions';
  if (
    scanAreaState === 'bluetooth_unavailable' ||
    scanAreaState === 'runtime_unsupported' ||
    scanAreaState === 'ble_failed' ||
    scanAreaState === 'scan_failed'
  ) {
    return 'error';
  }
  return 'idle';
}

function mapSourceStatus(
  state: OBD2AdapterState,
  hasLastDevice: boolean,
): TelemetrySourceStatus {
  if (state === 'connected') return 'connected';
  if (state === 'connecting' || state === 'scanning' || state === 'requesting_permissions') return 'scanning';
  if (state === 'error') return 'error';
  return hasLastDevice ? 'unavailable' : 'not_configured';
}

function toObdDevice(device: ReturnType<typeof useUnifiedDeviceConnections>['devices'][number]): OBD2DiscoveredDevice {
  return {
    id: device.id,
    name: device.name,
    rssi: device.signalStrength ?? -100,
    isLikelyOBD: true,
    lastSeenAt: device.lastSeenAt ?? Date.now(),
    serviceUUIDs: device.sourceBadges
      .filter((badge) => /^service:/i.test(badge))
      .map((badge) => badge.replace(/^service:/i, '').trim())
      .filter(Boolean),
    manufacturerData: null,
  };
}

export function useUnifiedOBD2Scanner(): UnifiedOBD2ScannerHookResult {
  const connections = useUnifiedDeviceConnections();
  const obdDevices = useMemo(
    () => connections.devices.filter(isObdDevice),
    [connections.devices],
  );
  const connectedDevice = useMemo(
    () => obdDevices.find((device) => device.isConnected || device.isLive) ?? null,
    [obdDevices],
  );
  const connectingDevice = useMemo(
    () => obdDevices.find((device) => device.isConnecting) ?? null,
    [obdDevices],
  );
  const lastDevice = useMemo(() => {
    const candidate = connectedDevice ?? obdDevices[0] ?? null;
    return candidate ? { id: candidate.id, name: candidate.name } : null;
  }, [connectedDevice, obdDevices]);
  const error = useMemo(() => (
    obdDevices.find((device) => device.lastError)?.lastError ??
    (connections.scanAreaState === 'permission_denied' ||
    connections.scanAreaState === 'bluetooth_unavailable' ||
    connections.scanAreaState === 'runtime_unsupported' ||
    connections.scanAreaState === 'ble_failed' ||
    connections.scanAreaState === 'scan_failed'
      ? connections.scanAreaMessage
      : null)
  ), [connections.scanAreaMessage, connections.scanAreaState, obdDevices]);
  const state = mapScanAreaToObdState(
    connections.scanAreaState,
    connections.isScanning,
    Boolean(connectingDevice),
    Boolean(connectedDevice),
    Boolean(error),
  );
  const devices = useMemo(() => obdDevices.map(toObdDevice), [obdDevices]);
  const scanDiagnostics = connections.lastScanSummary.bluetoothDiagnostics as OBD2ScanDiagnostics;

  const startScan = useCallback(async () => {
    await connections.rescan();
  }, [connections]);

  const stopScan = useCallback(async (reason?: string) => {
    await connections.stopScanning(reason ?? 'obd_unified_stop');
  }, [connections]);

  const connectToDevice = useCallback(async (deviceId: string) => {
    try {
      await connections.connectDevice(deviceId, 'user_device_action');
      return true;
    } catch {
      return false;
    }
  }, [connections]);

  const disconnect = useCallback(async () => {
    const target = connectedDevice ?? connectingDevice;
    if (!target) return;
    await connections.disconnectDevice(target.id);
  }, [connectedDevice, connectingDevice, connections]);

  const attemptReconnect = useCallback(async () => {
    const target = obdDevices.find((device) => device.isDiscoverable || device.isConnected || device.isConnecting);
    if (!target) return false;
    await connections.connectDevice(target.id, 'user_device_action');
    return true;
  }, [connections, obdDevices]);

  const clearError = useCallback(() => {
    // Error state is owned by the unified scanner. A fresh scan/connection action clears transient UI state there.
  }, []);

  return {
    state,
    sourceStatus: mapSourceStatus(state, Boolean(lastDevice)),
    isScanning: connections.isScanning,
    isConnected: Boolean(connectedDevice),
    isConnecting: Boolean(connectingDevice),
    isReconnecting: false,
    devices,
    deviceCount: devices.length,
    obdDeviceCount: devices.length,
    connectedDeviceId: connectedDevice?.id ?? null,
    connectedDeviceName: connectedDevice?.name ?? null,
    error,
    scanProgress: connections.isScanning ? 0.5 : 0,
    reconnectAttempt: 0,
    scanDiagnostics,
    connectionJustSucceeded: false,
    autoReconnectEnabled: false,
    lastDevice,
    startScan,
    stopScan,
    connectToDevice,
    disconnect,
    attemptReconnect,
    clearError,
  };
}

export default useUnifiedOBD2Scanner;

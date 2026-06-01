/**
 * ═══════════════════════════════════════════════════════════
 * ECS OBD-II SCANNER HOOK — Phase 2D
 * ═══════════════════════════════════════════════════════════
 *
 * React hook for consuming OBD-II adapter scan and connection
 * state in ECS UI components.
 *
 * Phase 2D: Detects reconnect success (reconnecting → connected)
 * in addition to initial connection (connecting → connected).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { OBD2DiscoveredDevice, OBD2AdapterState, OBD2ScanDiagnostics } from './OBD2Adapter';
import { obd2Adapter } from './OBD2Adapter';
import { vehicleTelemetryService } from './VehicleTelemetryService';
import type { TelemetrySourceStatus } from './TelemetryDiscoveryControl';

export interface OBD2ScannerHookResult {
  /** Current adapter state */
  state: OBD2AdapterState;

  /** User-visible source status for telemetry discovery/connection */
  sourceStatus: TelemetrySourceStatus;

  /** Whether the adapter is currently scanning */
  isScanning: boolean;

  /** Whether the adapter is connected to a device */
  isConnected: boolean;

  /** Whether the adapter is attempting to connect */
  isConnecting: boolean;

  /** Whether the adapter is reconnecting */
  isReconnecting: boolean;

  /** Discovered devices (sorted: OBD-II first, then by RSSI) */
  devices: OBD2DiscoveredDevice[];

  /** Number of discovered devices */
  deviceCount: number;

  /** Number of likely OBD-II devices */
  obdDeviceCount: number;

  /** Connected device ID */
  connectedDeviceId: string | null;

  /** Connected device name */
  connectedDeviceName: string | null;

  /** Error message (if any) */
  error: string | null;

  /** Scan progress (0–1) */
  scanProgress: number;

  /** Reconnect attempt number */
  reconnectAttempt: number;

  /** Native BLE scan diagnostics from the adapter */
  scanDiagnostics: OBD2ScanDiagnostics;

  /** Whether connection just succeeded (for confirmation UI) */
  connectionJustSucceeded: boolean;

  /** Whether auto-reconnect is enabled */
  autoReconnectEnabled: boolean;

  /** Last known device info */
  lastDevice: { id: string; name: string } | null;

  // ── Actions ────────────────────────────────────────────

  /** Start scanning for OBD-II adapters */
  startScan: (durationMs?: number) => Promise<void>;

  /** Stop scanning */
  stopScan: (reason?: string) => Promise<void>;

  /** Connect to a specific device */
  connectToDevice: (deviceId: string, deviceName?: string) => Promise<boolean>;

  /** Disconnect from current device */
  disconnect: () => Promise<void>;

  /** Attempt to reconnect to last known device */
  attemptReconnect: () => Promise<boolean>;

  /** Clear error state */
  clearError: () => void;
}

/**
 * Hook for OBD-II BLE scanner and connection management.
 *
 * Usage:
 *   const scanner = useOBD2Scanner();
 *   scanner.startScan();
 *   // ... user selects a device ...
 *   scanner.connectToDevice(deviceId);
 */
export function useOBD2Scanner(): OBD2ScannerHookResult {
  const [, setRev] = useState(0);
  const mountedRef = useRef(false);
  const bump = useCallback(() => {
    if (mountedRef.current) {
      setRev(r => r + 1);
    }
  }, []);

  const [connectionJustSucceeded, setConnectionJustSucceeded] = useState(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStateRef = useRef<OBD2AdapterState>('idle');

  // Subscribe to adapter state changes
  useEffect(() => {
    mountedRef.current = true;
    const unsub = obd2Adapter.subscribe(() => {
      const status = obd2Adapter.getStatus();

      // Phase 2D: Detect connection success transition
      // Includes both initial connection (connecting → connected) and
      // reconnection (reconnecting → connected)
      if (status.state === 'connected' &&
          (prevStateRef.current === 'connecting' || prevStateRef.current === 'reconnecting')) {
        setConnectionJustSucceeded(true);
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            setConnectionJustSucceeded(false);
          }
        }, 5000);
      }


      prevStateRef.current = status.state;
      bump();
    });

    return () => {
      mountedRef.current = false;
      unsub();
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, [bump]);

  const status = obd2Adapter.getStatus();

  const startScan = useCallback(async (durationMs?: number) => {
    await obd2Adapter.startScan(durationMs, 'user_open_tools');
  }, []);

  const stopScan = useCallback(async (reason?: string) => {
    await obd2Adapter.stopScan(reason);
  }, []);

  const connectToDevice = useCallback(async (deviceId: string, deviceName?: string) => {
    return await obd2Adapter.connectToDevice(deviceId, deviceName);
  }, []);

  const disconnect = useCallback(async () => {
    await vehicleTelemetryService.disconnect({ manualDisconnectRequested: true });
    setConnectionJustSucceeded(false);
  }, []);

  const attemptReconnect = useCallback(async () => {
    return await obd2Adapter.attemptReconnect();
  }, []);

  const clearError = useCallback(() => {
    obd2Adapter.clearError();
  }, []);

  const obdDeviceCount = status.discoveredDevices.filter(d => d.isLikelyOBD).length;

  return {
    state: status.state,
    sourceStatus: status.sourceStatus,
    isScanning: status.state === 'scanning' || status.state === 'requesting_permissions',
    isConnected: status.state === 'connected',
    isConnecting: status.state === 'connecting',
    isReconnecting: status.state === 'reconnecting',
    devices: status.discoveredDevices,
    deviceCount: status.discoveredDevices.length,
    obdDeviceCount,
    connectedDeviceId: status.connectedDeviceId,
    connectedDeviceName: status.connectedDeviceName,
    error: status.error,
    scanProgress: status.scanProgress,
    reconnectAttempt: status.reconnectAttempt,
    scanDiagnostics: status.scanDiagnostics,
    connectionJustSucceeded,
    autoReconnectEnabled: obd2Adapter.isAutoReconnectEnabled(),
    lastDevice: obd2Adapter.getLastDeviceInfo(),

    startScan,
    stopScan,
    connectToDevice,
    disconnect,
    attemptReconnect,
    clearError,
  };
}


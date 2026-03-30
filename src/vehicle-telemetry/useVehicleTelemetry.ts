/**
 * ═══════════════════════════════════════════════════════════
 * ECS VEHICLE TELEMETRY HOOK — Phase 2E
 * ═══════════════════════════════════════════════════════════
 *
 * React hook for consuming vehicle telemetry data in ECS
 * widgets, panels, and companion surfaces.
 *
 * Phase 2E adds:
 *   - disconnectProvider() action for safe OBD-II disconnect
 *   - lastUpdatedText for display in device panels
 *   - Enhanced connection state with reconnecting
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  VehicleTelemetrySummary,
  VehicleTelemetryDevice,
  VehicleTelemetryProviderId,
  NormalizedVehicleTelemetry,
  EngineStatus,
  TelemetryFreshnessLabel,
  SessionRecoveryStatus,
} from './VehicleTelemetryTypes';
import { EMPTY_SUMMARY } from './VehicleTelemetryTypes';
import { vehicleTelemetryStore } from './VehicleTelemetryStore';
import { vehicleTelemetryDeviceRegistry } from './VehicleTelemetryDeviceRegistry';
import { vehicleTelemetryService } from './VehicleTelemetryService';

export interface VehicleTelemetryHookResult {
  /** Current telemetry summary */
  summary: VehicleTelemetrySummary;

  /** Whether any telemetry data is available */
  hasData: boolean;

  /** Whether telemetry data is fresh (< 30s old) */
  isFresh: boolean;

  /** Whether telemetry data is stale (> 90s old) */
  isStale: boolean;

  /** Human-readable freshness text */
  freshnessText: string;

  /** Primary telemetry device (or null) */
  primaryDevice: VehicleTelemetryDevice | null;

  /** All registered devices */
  devices: VehicleTelemetryDevice[];

  /** Number of registered devices */
  deviceCount: number;

  /** Active provider ID */
  activeProvider: VehicleTelemetryProviderId | null;

  /** Whether the service is currently polling */
  isPolling: boolean;

  /** Whether a telemetry device is connected */
  isConnected: boolean;

  /** Whether OBD-II was connected in the previous session */
  obd2WasConnected: boolean;

  /** Change the primary device */
  changePrimary: (deviceId: string) => void;

  // ── Phase 2C additions ─────────────────────────────────

  /** Latest raw telemetry reading */
  rawTelemetry: NormalizedVehicleTelemetry;

  /** Grace window state: fresh / grace / stale / none */
  graceState: 'fresh' | 'grace' | 'stale' | 'none';

  /** Whether data is within the grace window (show last known values) */
  isWithinGraceWindow: boolean;

  /** Derived engine status */
  engineStatus: EngineStatus;

  /** PID poller status (for debug display) */
  pollerStatus: any;

  // ── Phase 2D additions ─────────────────────────────────

  /** Telemetry freshness label for UI display */
  freshnessLabel: TelemetryFreshnessLabel;

  /** Session recovery status */
  recoveryStatus: SessionRecoveryStatus;

  /** Whether the adapter is currently reconnecting */
  isReconnecting: boolean;

  /** Whether the store is showing last known (not live) data */
  isShowingLastKnown: boolean;

  // ── Phase 2E additions ─────────────────────────────────

  /** Disconnect the active provider and clean up */
  disconnectProvider: () => Promise<void>;

  /** Last updated timestamp string for display */
  lastUpdatedText: string | null;

  /** Connection state string including reconnecting */
  connectionDisplayState: 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'error';
}

/**
 * Hook for consuming vehicle telemetry data.
 *
 * Usage:
 *   const vt = useVehicleTelemetry();
 *   if (vt.freshnessLabel === 'live') {
 *     // Show live data
 *   } else if (vt.freshnessLabel === 'reconnecting') {
 *     // Show last known + reconnecting indicator
 *   } else if (vt.freshnessLabel === 'last_known') {
 *     // Show last known with "not live" indicator
 *   } else {
 *     // Show placeholder
 *   }
 */
export function useVehicleTelemetry(): VehicleTelemetryHookResult {
  const [, setRev] = useState(0);
  const bump = useCallback(() => setRev(r => r + 1), []);

  // Subscribe to store, registry, and service changes
  useEffect(() => {
    const unsubs = [
      vehicleTelemetryStore.subscribe(bump),
      vehicleTelemetryDeviceRegistry.subscribe(bump),
      vehicleTelemetryService.subscribe(bump),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [bump]);

  // Freshness timer — update every 10 seconds for grace window tracking
  useEffect(() => {
    const timer = setInterval(bump, 10_000);
    return () => clearInterval(timer);
  }, [bump]);

  const summary = vehicleTelemetryStore.getSummary();
  const primaryDevice = vehicleTelemetryDeviceRegistry.getPrimary();
  const devices = vehicleTelemetryDeviceRegistry.getAll();
  const serviceState = vehicleTelemetryService.getState();

  const changePrimary = useCallback((deviceId: string) => {
    vehicleTelemetryService.changePrimaryDevice(deviceId);
  }, []);

  // Phase 2E: Safe disconnect action
  const disconnectProvider = useCallback(async () => {
    try {
      // Stop polling first
      vehicleTelemetryService.stopPolling();

      // Disconnect OBD-II adapter
      const { obd2Adapter } = require('./OBD2Adapter');
      await obd2Adapter.disconnect();

      // Clear inactive devices from registry
      const allDevices = vehicleTelemetryDeviceRegistry.getAll();
      for (const device of allDevices) {
        if (device.connection_state === 'disconnected' || device.connection_state === 'error') {
          vehicleTelemetryDeviceRegistry.removeDevice(device.device_id);
        }
      }

      // Clear active provider if no devices remain
      if (vehicleTelemetryDeviceRegistry.getCount() === 0) {
        vehicleTelemetryService.clearActiveProvider();
        vehicleTelemetryStore.clear();
      }

      console.log('[VT-Hook] Provider disconnected and cleaned up');
    } catch (err: any) {
      console.warn('[VT-Hook] Disconnect error:', err?.message);
    }
  }, []);

  // Phase 2E: Last updated display text
  const lastUpdatedText = (() => {
    if (!summary.last_updated) return null;
    const age = Date.now() - new Date(summary.last_updated).getTime();
    if (age < 5_000) return 'just now';
    if (age < 60_000) return `${Math.floor(age / 1000)}s ago`;
    if (age < 3600_000) return `${Math.floor(age / 60_000)}m ago`;
    const date = new Date(summary.last_updated);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  })();

  // Phase 2E: Connection display state (includes reconnecting)
  const connectionDisplayState = (() => {
    if (serviceState.isReconnecting) return 'reconnecting' as const;
    if (summary.connection_state === 'connected') return 'connected' as const;
    if (summary.connection_state === 'connecting') return 'connecting' as const;
    if (summary.connection_state === 'error') return 'error' as const;
    return 'disconnected' as const;
  })();

  return {
    summary,
    hasData: summary.has_data,
    isFresh: vehicleTelemetryStore.isFresh(),
    isStale: vehicleTelemetryStore.isStale(),
    freshnessText: vehicleTelemetryStore.getFreshnessText(),
    primaryDevice,
    devices,
    deviceCount: devices.length,
    activeProvider: serviceState.activeProvider,
    isPolling: serviceState.isPolling,
    isConnected: summary.connection_state === 'connected',
    obd2WasConnected: serviceState.obd2WasConnected,
    changePrimary,

    // Phase 2C
    rawTelemetry: vehicleTelemetryStore.getLatestTelemetry(),
    graceState: vehicleTelemetryStore.getGraceState(),
    isWithinGraceWindow: vehicleTelemetryStore.isWithinGraceWindow(),
    engineStatus: summary.engine_status,
    pollerStatus: vehicleTelemetryService.getPollerStatus(),

    // Phase 2D
    freshnessLabel: serviceState.freshnessLabel,
    recoveryStatus: serviceState.recoveryStatus,
    isReconnecting: serviceState.isReconnecting,
    isShowingLastKnown: vehicleTelemetryStore.isShowingLastKnown(),

    // Phase 2E
    disconnectProvider,
    lastUpdatedText,
    connectionDisplayState,
  };
}


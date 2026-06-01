/**
 * useEcsProviders — React hook for unified, provider-agnostic power system access.
 *
 * This hook abstracts away individual provider adapters and exposes a single
 * interface for the dashboard UI to:
 *   - List all connected devices across all providers
 *   - Access normalized telemetry readings
 *   - Perform provider-agnostic actions (scan, connect, disconnect)
 *   - Monitor system-wide health and warnings
 *   - Iterate over providers generically
 *
 * The dashboard UI should use this hook instead of individual provider hooks
 * for all cross-provider operations.
 *
 * Phase 7A — Architecture Hardening: Unified Provider Hook
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { BluProviderId, BluDevice, BluConnectionState } from './BluTypes';
import type { BluetoothTelemetrySource } from './bluetoothLiveTelemetry';
import type {
  EcsNormalizedReading,
  EcsProviderWarning,
  EcsProviderLifecycleState,
} from './IEcsPowerProvider';
import {
  ecsProviderRegistry,
  ECS_PROVIDER_BRANDING,
  type EcsSystemPowerState,
} from './EcsProviderRegistry';
import {
  computeSystemHealthSummary,
  type SystemHealthSummary,
  getTelemetryFreshness,
  type TelemetryFreshness,
} from './EcsProviderDiagnostics';
import { ensureEcsPowerProvidersRegistered } from './ecsLiveSystemBootstrap';

// ── Provider Summary (for UI iteration) ─────────────────────────────────

/**
 * Summary of a single provider's state, suitable for UI rendering.
 * The UI can iterate over an array of these to render provider cards
 * without any provider-specific logic.
 */
export interface EcsProviderSummary {
  /** Provider identifier */
  providerId: BluProviderId;
  /** Display name */
  displayName: string;
  /** Accent color for UI branding */
  accentColor: string;
  /** Icon name (Ionicons) */
  iconName: string;
  /** Transport label (e.g., "Cloud API", "Bluetooth LE") */
  transportLabel: string;
  /** Current lifecycle state */
  lifecycleState: EcsProviderLifecycleState;
  /** Simplified connection state for UI badges */
  connectionState: BluConnectionState;
  /** Number of connected devices */
  connectedDeviceCount: number;
  /** Whether the provider is currently polling */
  isPolling: boolean;
  /** Whether the provider is currently scanning */
  isScanning: boolean;
  /** Total poll count */
  pollCount: number;
  /** Active warnings for this provider */
  warnings: EcsProviderWarning[];
  /** Whether the provider has any active warnings */
  hasWarnings: boolean;
  /** Last error message */
  lastError: string | null;
}

// ── Device Summary (for UI rendering) ───────────────────────────────────

/**
 * Summary of a single device's state, suitable for UI rendering.
 * Combines device metadata with latest telemetry reading.
 */
export interface EcsDeviceSummary {
  /** Device identifier */
  deviceId: string;
  /** User-friendly device name */
  deviceName: string;
  /** Device model */
  model: string;
  /** Provider identifier */
  provider: BluProviderId;
  /** Provider display name */
  providerDisplayName: string;
  /** Provider accent color */
  providerAccentColor: string;
  /** Provider icon name */
  providerIcon: string;
  /** Connection state */
  connectionState: BluConnectionState;
  /** Whether this is the primary device */
  isPrimary: boolean;
  /** Battery percentage */
  batteryPercent: number | null;
  /** Input watts */
  inputWatts: number | null;
  /** Output watts */
  outputWatts: number | null;
  /** Solar input watts */
  solarInputWatts: number | null;
  /** Temperature in °C */
  temperatureCelsius: number | null;
  /** Battery voltage */
  batteryVolts: number | null;
  /** Battery current */
  batteryAmps: number | null;
  /** Battery watts */
  batteryWatts: number | null;
  /** AC output watts */
  acOutputWatts: number | null;
  /** DC output watts */
  dcOutputWatts: number | null;
  /** Estimated runtime in minutes */
  estimatedRuntimeMinutes: number | null;
  /** Warning state */
  warningState: string;
  /** Telemetry freshness */
  freshness: TelemetryFreshness;
  /** Last updated timestamp */
  lastUpdated: number | null;
  /** Truthful telemetry origin for the reading. */
  telemetrySource: BluetoothTelemetrySource;
  /** User-facing source label. */
  telemetrySourceLabel: string;
  /** True only when decoded live Bluetooth telemetry is flowing. */
  isLive: boolean;
  /** Connected source is reachable, but telemetry is not decoded. */
  telemetryUnsupported: boolean;
  /** Reason for unsupported or unavailable telemetry. */
  telemetryUnsupportedReason?: string;
}

// ── Hook Return Type ────────────────────────────────────────────────────

export interface EcsProvidersHookResult {
  // ── System State ──────────────────────────────────────────────────
  /** Aggregated system power state */
  systemState: EcsSystemPowerState | null;
  /** System health summary */
  healthSummary: SystemHealthSummary | null;
  /** Whether any provider is connected */
  isAnyConnected: boolean;
  /** Whether any provider is polling */
  isAnyPolling: boolean;
  /** Whether any provider is reconnecting */
  isAnyReconnecting: boolean;

  // ── Provider Summaries ────────────────────────────────────────────
  /** All registered provider summaries (for generic UI iteration) */
  providerSummaries: EcsProviderSummary[];
  /** Get summary for a specific provider */
  getProviderSummary: (id: BluProviderId) => EcsProviderSummary | null;

  // ── Device Summaries ──────────────────────────────────────────────
  /** All device summaries across all providers */
  deviceSummaries: EcsDeviceSummary[];
  /** Get summary for a specific device */
  getDeviceSummary: (deviceId: string) => EcsDeviceSummary | null;

  // ── Normalized Readings ───────────────────────────────────────────
  /** All latest normalized readings */
  readings: EcsNormalizedReading[];
  /** Get reading for a specific device */
  getReading: (deviceId: string) => EcsNormalizedReading | null;

  // ── Warnings ──────────────────────────────────────────────────────
  /** All active warnings across all providers */
  activeWarnings: EcsProviderWarning[];
  /** Whether there are any active warnings */
  hasWarnings: boolean;

  // ── Actions ───────────────────────────────────────────────────────
  /** Fetch fresh telemetry from all providers */
  refreshAll: () => Promise<void>;
  /** Disconnect all providers */
  disconnectAll: () => Promise<void>;
  /** Start polling on all connected providers */
  startAllPolling: (intervalMs?: number) => void;
  /** Stop polling on all providers */
  stopAllPolling: () => void;
  /** Set a device as primary */
  setPrimary: (deviceId: string) => Promise<void>;
  /** Restore all provider sessions */
  restoreAllSessions: () => Promise<void>;

  // ── Provider Branding ─────────────────────────────────────────────
  /** Get branding info for a provider */
  getBranding: (id: BluProviderId) => typeof ECS_PROVIDER_BRANDING[BluProviderId];
  /** All supported provider IDs (including planned) */
  allProviderIds: BluProviderId[];
  /** Active provider IDs (registered and available) */
  activeProviderIds: BluProviderId[];
}

// ── Hook Implementation ─────────────────────────────────────────────────

export function useEcsProviders(): EcsProvidersHookResult {
  ensureEcsPowerProvidersRegistered();

  const [systemState, setSystemState] = useState<EcsSystemPowerState | null>(null);
  const [readings, setReadings] = useState<EcsNormalizedReading[]>([]);
  const [warnings, setWarnings] = useState<EcsProviderWarning[]>([]);
  const mountedRef = useRef(true);

  // Subscribe to registry events
  useEffect(() => {
    mountedRef.current = true;

    const unsubState = ecsProviderRegistry.onSystemState((state) => {
      if (mountedRef.current) setSystemState(state);
    });

    const unsubReadings = ecsProviderRegistry.onAllReadings((r) => {
      if (mountedRef.current) setReadings(r);
    });

    const unsubWarnings = ecsProviderRegistry.onAnyWarning((w) => {
      if (mountedRef.current) {
        setWarnings((prev) => {
          // Deduplicate by code + deviceId
          const key = `${w.code}:${w.deviceId}`;
          const filtered = prev.filter(
            (existing) => `${existing.code}:${existing.deviceId}` !== key,
          );
          return [...filtered, w];
        });
      }
    });

    // Initial state
    setSystemState(ecsProviderRegistry.getSystemPowerState());
    setReadings(ecsProviderRegistry.getAllLatestReadings());

    return () => {
      mountedRef.current = false;
      unsubState();
      unsubReadings();
      unsubWarnings();
    };
  }, []);

  // ── Provider Summaries ──────────────────────────────────────────────

  const providerSummaries: EcsProviderSummary[] = ecsProviderRegistry
    .getAllProviders()
    .map((provider) => {
      const diag = provider.getDiagnostics();
      const branding = ECS_PROVIDER_BRANDING[provider.providerId];
      const providerWarnings = provider.getActiveWarnings();

      return {
        providerId: provider.providerId,
        displayName: branding?.displayName ?? provider.displayName,
        accentColor: branding?.accentColor ?? provider.accentColor,
        iconName: branding?.iconName ?? provider.iconName,
        transportLabel: branding?.transportLabel ?? 'Unknown',
        lifecycleState: diag.lifecycleState,
        connectionState: provider.reportConnectionState(),
        connectedDeviceCount: diag.connectedDeviceCount,
        isPolling: provider.isPolling(),
        isScanning: diag.lifecycleState === 'scanning',
        pollCount: diag.totalPollCount,
        warnings: providerWarnings,
        hasWarnings: providerWarnings.length > 0,
        lastError: null, // TODO: wire from adapter
      };
    });

  // ── Device Summaries ────────────────────────────────────────────────

  const deviceSummaries: EcsDeviceSummary[] = readings.map((reading) => {
    const branding = ECS_PROVIDER_BRANDING[reading.provider];
    return {
      deviceId: reading.deviceId,
      deviceName: reading.deviceName,
      model: reading.model,
      provider: reading.provider,
      providerDisplayName: branding?.displayName ?? reading.providerDisplayName,
      providerAccentColor: branding?.accentColor ?? reading.providerAccentColor,
      providerIcon: branding?.iconName ?? reading.providerIcon,
      connectionState: reading.connectionState,
      isPrimary: reading.isPrimary,
      batteryPercent: reading.batteryPercent,
      inputWatts: reading.inputWatts,
      outputWatts: reading.outputWatts,
      solarInputWatts: reading.solarInputWatts,
      temperatureCelsius: reading.temperatureCelsius,
      batteryVolts: reading.batteryVolts,
      batteryAmps: reading.batteryAmps,
      batteryWatts: reading.batteryVolts != null && reading.batteryAmps != null
        ? Math.round(reading.batteryVolts * reading.batteryAmps * 100) / 100
        : null,
      acOutputWatts: reading.acOutputWatts,
      dcOutputWatts: reading.dcOutputWatts,
      estimatedRuntimeMinutes: reading.estimatedRuntimeMinutes,
      warningState: reading.warningState,
      freshness: getTelemetryFreshness(reading.lastUpdated),
      lastUpdated: reading.lastUpdated,
      telemetrySource: reading.telemetrySource ?? 'unavailable',
      telemetrySourceLabel: reading.telemetrySourceLabel ?? 'Unavailable',
      isLive: reading.isLive === true,
      telemetryUnsupported: reading.telemetryUnsupported === true,
      telemetryUnsupportedReason: reading.telemetryUnsupportedReason,
    };
  });

  // ── Health Summary ──────────────────────────────────────────────────

  const healthSummary = systemState
    ? computeSystemHealthSummary(
        ecsProviderRegistry.getAllDiagnostics().map((d) => {
          const provider = ecsProviderRegistry.getProvider(d.providerId);
          const providerWarnings = provider?.getActiveWarnings() ?? [];
          return {
            providerId: d.providerId,
            score: 100, // Will be computed by the function
            grade: 'excellent' as const,
            components: {
              connectionStability: 100,
              telemetryFreshness: 100,
              pollSuccessRate: 100,
              warningPenalty: 100,
            },
          };
        }),
        warnings,
      )
    : null;

  // ── Derived State ───────────────────────────────────────────────────

  const isAnyConnected = systemState ? systemState.connectedProviders > 0 : false;
  const isAnyPolling = systemState?.isPolling ?? false;
  const isAnyReconnecting = systemState?.isReconnecting ?? false;

  // ── Actions ─────────────────────────────────────────────────────────

  const refreshAll = useCallback(async () => {
    await ecsProviderRegistry.fetchAllTelemetry();
  }, []);

  const disconnectAll = useCallback(async () => {
    await ecsProviderRegistry.disconnectAll();
  }, []);

  const startAllPolling = useCallback((intervalMs?: number) => {
    ecsProviderRegistry.startAllPolling(intervalMs);
  }, []);

  const stopAllPolling = useCallback(() => {
    ecsProviderRegistry.stopAllPolling();
  }, []);

  const setPrimary = useCallback(async (deviceId: string) => {
    // Find which provider owns this device
    for (const provider of ecsProviderRegistry.getAllProviders()) {
      const devices = provider.getRegisteredDevices();
      if (devices.some((d) => d.device_id === deviceId)) {
        await provider.setPrimaryDevice(deviceId);
        return;
      }
    }
  }, []);

  const restoreAllSessions = useCallback(async () => {
    await ecsProviderRegistry.restoreAllSessions();
  }, []);

  // ── Getters ─────────────────────────────────────────────────────────

  const getProviderSummary = useCallback(
    (id: BluProviderId) => providerSummaries.find((p) => p.providerId === id) ?? null,
    [providerSummaries],
  );

  const getDeviceSummary = useCallback(
    (deviceId: string) => deviceSummaries.find((d) => d.deviceId === deviceId) ?? null,
    [deviceSummaries],
  );

  const getReading = useCallback(
    (deviceId: string) => ecsProviderRegistry.getDeviceReading(deviceId),
    [],
  );

  const getBranding = useCallback(
    (id: BluProviderId) => ECS_PROVIDER_BRANDING[id],
    [],
  );

  const allProviderIds: BluProviderId[] = [
    'ecoflow', 'bluetti', 'anker_solix', 'jackery', 'goal_zero', 'renogy', 'victron',
  ];

  const activeProviderIds = ecsProviderRegistry.getRegisteredProviderIds();

  return {
    systemState,
    healthSummary,
    isAnyConnected,
    isAnyPolling,
    isAnyReconnecting,
    providerSummaries,
    getProviderSummary,
    deviceSummaries,
    getDeviceSummary,
    readings,
    getReading,
    activeWarnings: warnings,
    hasWarnings: warnings.length > 0,
    refreshAll,
    disconnectAll,
    startAllPolling,
    stopAllPolling,
    setPrimary,
    restoreAllSessions,
    getBranding,
    allProviderIds,
    activeProviderIds,
  };
}


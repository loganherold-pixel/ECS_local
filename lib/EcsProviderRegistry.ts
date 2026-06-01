/**
 * EcsProviderRegistry — centralized registry and orchestrator for all ECS power providers.
 *
 * This module provides:
 *   - A single registry of all active provider adapters
 *   - Unified lifecycle management (connect/disconnect/reconnect all)
 *   - Aggregated telemetry from all providers
 *   - Provider-agnostic device enumeration
 *   - Mixed multi-provider deployment support
 *   - Diagnostics and health monitoring across all providers
 *
 * The dashboard UI should interact with this registry rather than
 * individual provider adapters for all cross-provider operations.
 *
 * Phase 7A — Architecture Hardening: Provider Registry + Orchestrator
 */

import type { BluProviderId, BluConnectionState, BluDevice } from './BluTypes';
import type {
  IEcsPowerProvider,
  EcsNormalizedReading,
  EcsProviderDiagnostics,
  EcsProviderWarning,
  EcsProviderLifecycleState,
  EcsConnectResult,
  EcsDiscoveredDevice,
  EcsTelemetryCallback,
  EcsConnectionCallback,
  EcsWarningCallback,
} from './IEcsPowerProvider';
import {
  getBluetoothTelemetrySourceLabel,
  normalizeBluetoothTelemetrySource,
  shouldAcceptBluetoothTelemetry,
} from './bluetoothLiveTelemetry';
import { getBluestackParserDecision } from './bluestack';
import { buildPowerBluTelemetryEnvelope } from './bluTelemetryEnvelope';

// ── Provider Branding Constants ─────────────────────────────────────────

/**
 * Static branding metadata for all supported providers.
 * Used by the UI to render provider-specific labels, colors, and icons
 * without needing access to the provider adapter instance.
 */
export const ECS_PROVIDER_BRANDING: Record<BluProviderId, {
  displayName: string;
  accentColor: string;
  iconName: string;
  transportLabel: string;
}> = {
  ecoflow: {
    displayName: 'EcoFlow',
    accentColor: '#00A6FF',
    iconName: 'flash',
    transportLabel: 'Cloud API',
  },
  bluetti: {
    displayName: 'Bluetti',
    accentColor: '#2196F3',
    iconName: 'cube',
    transportLabel: 'Bluetooth LE',
  },
  anker_solix: {
    displayName: 'Anker SOLIX',
    accentColor: '#00C4B4',
    iconName: 'battery-charging',
    transportLabel: 'Bluetooth LE',
  },
  jackery: {
    displayName: 'Jackery',
    accentColor: '#FF8C00',
    iconName: 'sunny',
    transportLabel: 'Bluetooth LE',
  },
  goal_zero: {
    displayName: 'Goal Zero',
    accentColor: '#4CAF50',
    iconName: 'compass',
    transportLabel: 'Bluetooth LE',
  },
  renogy: {
    displayName: 'Renogy',
    accentColor: '#FF5722',
    iconName: 'hardware-chip',
    transportLabel: 'Bluetooth LE (Modbus)',
  },
  redarc: {
    displayName: 'REDARC',
    accentColor: '#C62828',
    iconName: 'car',
    transportLabel: 'Bluetooth LE • No API key',
  },
  dakota_lithium: {
    displayName: 'Dakota Lithium',
    accentColor: '#6FBF4B',
    iconName: 'shield',
    transportLabel: 'Bluetooth LE • No API key',
  },
  victron: {
    displayName: 'Victron Energy',
    accentColor: '#1976D2',
    iconName: 'git-network',
    transportLabel: 'VE.Direct / BLE',
  },
};

// ── Aggregated System State ─────────────────────────────────────────────

/**
 * Aggregated state across all providers.
 * Used by the dashboard to display system-wide power status.
 */
export interface EcsSystemPowerState {
  /** Total number of registered providers */
  totalProviders: number;
  /** Number of providers with at least one connected device */
  connectedProviders: number;
  /** Total number of connected devices across all providers */
  totalConnectedDevices: number;
  /** Total number of registered devices across all providers */
  totalRegisteredDevices: number;
  /** Aggregated battery percentage (weighted average by capacity) */
  aggregatedBatteryPercent: number | null;
  /** Total system input watts */
  totalInputWatts: number;
  /** Total system output watts */
  totalOutputWatts: number;
  /** Total solar input watts */
  totalSolarWatts: number;
  /** Total system capacity in Wh */
  totalCapacityWh: number;
  /** Whether any provider has active warnings */
  hasWarnings: boolean;
  /** All active warnings across all providers */
  activeWarnings: EcsProviderWarning[];
  /** Whether any provider is currently reconnecting */
  isReconnecting: boolean;
  /** Whether any provider is currently polling */
  isPolling: boolean;
  /** System-wide last telemetry timestamp */
  lastTelemetryAt: number | null;
  /** Per-provider connection states */
  providerStates: Map<BluProviderId, EcsProviderLifecycleState>;
}

// ── Subscriber types ────────────────────────────────────────────────────

type SystemStateCallback = (state: EcsSystemPowerState) => void;
type AllReadingsCallback = (readings: EcsNormalizedReading[]) => void;

function makeReadingKey(provider: BluProviderId, deviceId: string): string {
  return `${provider}:${deviceId}`;
}

// ── Registry Implementation ─────────────────────────────────────────────

class EcsProviderRegistryImpl {
  private providers: Map<BluProviderId, IEcsPowerProvider> = new Map();
  private telemetrySubscribers: Set<AllReadingsCallback> = new Set();
  private stateSubscribers: Set<SystemStateCallback> = new Set();
  private warningSubscribers: Set<EcsWarningCallback> = new Set();
  private providerUnsubscribers: Map<BluProviderId, (() => void)[]> = new Map();
  private cachedReadings: Map<string, EcsNormalizedReading> = new Map(); // `${provider}:${deviceId}` -> latest reading
  private lastSystemState: EcsSystemPowerState | null = null;

  private normalizeReadingSource(reading: EcsNormalizedReading): EcsNormalizedReading | null {
    const parserDecision = getBluestackParserDecision(reading.provider);
    if (!parserDecision.canDecodeLiveTelemetry) {
      return null;
    }

    const fallback = reading.provider === 'ecoflow'
      ? 'provider_cloud'
      : reading.isStale
        ? 'cache'
        : 'ble_live';
    const source = normalizeBluetoothTelemetrySource(reading.telemetrySource, fallback);
    if (!shouldAcceptBluetoothTelemetry(source)) {
      console.log('[BT_LIVE] mock_disabled', {
        provider: reading.provider,
        deviceId: reading.deviceId,
      });
      return null;
    }
    const normalizedReading: EcsNormalizedReading = {
      ...reading,
      telemetrySource: source,
      telemetrySourceLabel: reading.telemetrySourceLabel ?? getBluetoothTelemetrySourceLabel(source),
      isLive:
        (source === 'ble_live' || source === 'provider_cloud') &&
        reading.isLive !== false &&
        !reading.telemetryUnsupported &&
        !reading.isStale,
      updatedAt: reading.updatedAt ?? reading.lastUpdated,
    };
    return {
      ...normalizedReading,
      bluTelemetryEnvelope: reading.bluTelemetryEnvelope ?? buildPowerBluTelemetryEnvelope(normalizedReading),
    };
  }

  // ── Provider Registration ───────────────────────────────────────────

  /**
   * Register a provider adapter with the registry.
   * Automatically subscribes to the provider's telemetry and state events.
   */
  registerProvider(provider: IEcsPowerProvider): void {
    const id = provider.providerId;
    const parserDecision = getBluestackParserDecision(id);
    if (!parserDecision.canDecodeLiveTelemetry) {
      if (this.providers.has(id)) {
        this.unregisterProvider(id);
      }
      return;
    }

    if (this.providers.has(id)) {
      console.warn(`[EcsProviderRegistry] Provider ${id} already registered, replacing.`);
      this.unregisterProvider(id);
    }

    this.providers.set(id, provider);

    // Subscribe to provider events
    const unsubs: (() => void)[] = [];

    unsubs.push(provider.onTelemetry((reading) => {
      const normalizedReading = this.normalizeReadingSource(reading);
      if (!normalizedReading) return;
      this.cachedReadings.set(
        makeReadingKey(normalizedReading.provider, normalizedReading.deviceId),
        normalizedReading,
      );
      this.notifyTelemetrySubscribers();
      this.notifyStateSubscribers();
    }));

    unsubs.push(provider.onConnectionChange((_state) => {
      this.reconcileProviderCache(provider);
      this.notifyTelemetrySubscribers();
      this.notifyStateSubscribers();
    }));

    unsubs.push(provider.onWarning((warning) => {
      for (const cb of this.warningSubscribers) {
        try { cb(warning); } catch { /* subscriber errors must not crash registry */ }
      }
      this.notifyStateSubscribers();
    }));

    this.providerUnsubscribers.set(id, unsubs);
    this.reconcileProviderCache(provider);
    this.notifyStateSubscribers();
  }

  /**
   * Unregister a provider and clean up subscriptions.
   */
  unregisterProvider(id: BluProviderId): void {
    const unsubs = this.providerUnsubscribers.get(id);
    if (unsubs) {
      unsubs.forEach((u) => u());
      this.providerUnsubscribers.delete(id);
    }

    // Remove cached readings for this provider's devices
    for (const [readingKey, reading] of this.cachedReadings) {
      if (reading.provider === id) {
        this.cachedReadings.delete(readingKey);
      }
    }

    this.providers.delete(id);
    this.notifyTelemetrySubscribers();
    this.notifyStateSubscribers();
  }

  /**
   * Get a registered provider by ID.
   */
  getProvider(id: BluProviderId): IEcsPowerProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Get all registered providers.
   */
  getAllProviders(): IEcsPowerProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all registered provider IDs.
   */
  getRegisteredProviderIds(): BluProviderId[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider is registered.
   */
  isRegistered(id: BluProviderId): boolean {
    return this.providers.has(id);
  }

  // ── Aggregated Operations ───────────────────────────────────────────

  /**
   * Get all connected devices across all providers.
   */
  getAllConnectedDevices(): BluDevice[] {
    const devices: BluDevice[] = [];
    for (const provider of this.providers.values()) {
      devices.push(...provider.getConnectedDevices());
    }
    return devices;
  }

  /**
   * Get all registered devices across all providers.
   */
  getAllRegisteredDevices(): BluDevice[] {
    const devices: BluDevice[] = [];
    for (const provider of this.providers.values()) {
      devices.push(...provider.getRegisteredDevices());
    }
    return devices;
  }

  /**
   * Get the latest normalized reading for every connected device.
   */
  getAllLatestReadings(): EcsNormalizedReading[] {
    return Array.from(this.cachedReadings.values());
  }

  /**
   * Get the latest reading for a specific device.
   */
  getDeviceReading(deviceId: string, providerId?: BluProviderId): EcsNormalizedReading | null {
    if (providerId) {
      return this.cachedReadings.get(makeReadingKey(providerId, deviceId)) ?? null;
    }
    return this.getAllLatestReadings()
      .filter((reading) => reading.deviceId === deviceId)
      .sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0))[0] ?? null;
  }

  /**
   * Fetch fresh telemetry from all connected providers.
   */
  async fetchAllTelemetry(): Promise<EcsNormalizedReading[]> {
    const allReadings: EcsNormalizedReading[] = [];

    const promises = Array.from(this.providers.values()).map(async (provider) => {
      if (!provider.isConnected()) return [];
      try {
        return await provider.fetchTelemetry();
      } catch (err) {
        console.warn(`[EcsProviderRegistry] Telemetry fetch failed for ${provider.providerId}:`, err);
        return [];
      }
    });

    const results = await Promise.allSettled(promises);
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const reading of result.value) {
          const normalizedReading = this.normalizeReadingSource(reading);
          if (!normalizedReading) continue;
          this.cachedReadings.set(
            makeReadingKey(normalizedReading.provider, normalizedReading.deviceId),
            normalizedReading,
          );
          allReadings.push(normalizedReading);
        }
      }
    }

    this.notifyTelemetrySubscribers();
    this.notifyStateSubscribers();
    return allReadings;
  }

  /**
   * Discover devices across all providers.
   */
  async discoverAllDevices(): Promise<EcsDiscoveredDevice[]> {
    const allDiscovered: EcsDiscoveredDevice[] = [];

    const promises = Array.from(this.providers.values()).map(async (provider) => {
      try {
        return await provider.discoverDevices();
      } catch (err) {
        console.warn(`[EcsProviderRegistry] Discovery failed for ${provider.providerId}:`, err);
        return [];
      }
    });

    const results = await Promise.allSettled(promises);
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allDiscovered.push(...result.value);
      }
    }

    return allDiscovered;
  }

  /**
   * Disconnect all providers.
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.providers.values()).map(async (provider) => {
      try {
        provider.stopPolling();
        await provider.disconnect();
      } catch (err) {
        console.warn(`[EcsProviderRegistry] Disconnect failed for ${provider.providerId}:`, err);
      }
    });

    await Promise.allSettled(promises);
    this.cachedReadings.clear();
    this.notifyTelemetrySubscribers();
    this.notifyStateSubscribers();
  }

  /**
   * Start polling on all connected providers.
   */
  startAllPolling(intervalMs: number = 15_000): void {
    for (const provider of this.providers.values()) {
      if (provider.isConnected() && !provider.isPolling()) {
        provider.startPolling(intervalMs);
      }
    }
  }

  /**
   * Stop polling on all providers.
   */
  stopAllPolling(): void {
    for (const provider of this.providers.values()) {
      if (provider.isPolling()) {
        provider.stopPolling();
      }
    }
  }

  /**
   * Attempt to restore sessions for all providers.
   */
  async restoreAllSessions(): Promise<Map<BluProviderId, boolean>> {
    const results = new Map<BluProviderId, boolean>();

    const promises = Array.from(this.providers.entries()).map(async ([id, provider]) => {
      try {
        if (provider.hasPreviousSession()) {
          const restored = await provider.restoreSession();
          return [id, restored] as const;
        }
        return [id, false] as const;
      } catch (err) {
        console.warn(`[EcsProviderRegistry] Session restore failed for ${id}:`, err);
        return [id, false] as const;
      }
    });

    const settled = await Promise.allSettled(promises);
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.set(result.value[0], result.value[1]);
      }
    }

    this.notifyStateSubscribers();
    return results;
  }

  // ── System State ────────────────────────────────────────────────────

  /**
   * Compute the aggregated system power state.
   */
  getSystemPowerState(): EcsSystemPowerState {
    const readings = this.getAllLatestReadings();
    const allWarnings: EcsProviderWarning[] = [];
    const providerStates = new Map<BluProviderId, EcsProviderLifecycleState>();

    let connectedProviders = 0;
    let totalConnectedDevices = 0;
    let totalRegisteredDevices = 0;
    let isReconnecting = false;
    let isPolling = false;

    for (const provider of this.providers.values()) {
      const state = provider.getLifecycleState();
      providerStates.set(provider.providerId, state);

      const connected = provider.getConnectedDevices();
      const registered = provider.getRegisteredDevices();

      if (connected.length > 0) connectedProviders++;
      totalConnectedDevices += connected.length;
      totalRegisteredDevices += registered.length;

      if (state === 'reconnecting') isReconnecting = true;
      if (provider.isPolling()) isPolling = true;

      allWarnings.push(...provider.getActiveWarnings());
    }

    // Aggregate telemetry
    let totalInputWatts = 0;
    let totalOutputWatts = 0;
    let totalSolarWatts = 0;
    let totalCapacityWh = 0;
    let weightedSocSum = 0;
    let totalWeight = 0;
    let lastTelemetryAt: number | null = null;

    for (const reading of readings) {
      if (reading.inputWatts != null) totalInputWatts += reading.inputWatts;
      if (reading.outputWatts != null) totalOutputWatts += reading.outputWatts;
      if (reading.solarInputWatts != null) totalSolarWatts += reading.solarInputWatts;
      if (reading.capacityWh != null) totalCapacityWh += reading.capacityWh;

      if (reading.batteryPercent != null) {
        const weight = reading.capacityWh ?? 1000; // default 1kWh if unknown
        weightedSocSum += reading.batteryPercent * weight;
        totalWeight += weight;
      }

      if (reading.lastUpdated && (!lastTelemetryAt || reading.lastUpdated > lastTelemetryAt)) {
        lastTelemetryAt = reading.lastUpdated;
      }
    }

    const aggregatedBatteryPercent = totalWeight > 0
      ? Math.round(weightedSocSum / totalWeight)
      : null;

    const state: EcsSystemPowerState = {
      totalProviders: this.providers.size,
      connectedProviders,
      totalConnectedDevices,
      totalRegisteredDevices,
      aggregatedBatteryPercent,
      totalInputWatts: Math.round(totalInputWatts),
      totalOutputWatts: Math.round(totalOutputWatts),
      totalSolarWatts: Math.round(totalSolarWatts),
      totalCapacityWh: Math.round(totalCapacityWh),
      hasWarnings: allWarnings.length > 0,
      activeWarnings: allWarnings,
      isReconnecting,
      isPolling,
      lastTelemetryAt,
      providerStates,
    };

    this.lastSystemState = state;
    return state;
  }

  // ── Diagnostics ─────────────────────────────────────────────────────

  /**
   * Get diagnostics for all providers.
   */
  getAllDiagnostics(): EcsProviderDiagnostics[] {
    return Array.from(this.providers.values()).map((p) => p.getDiagnostics());
  }

  /**
   * Get diagnostics for a specific provider.
   */
  getProviderDiagnostics(id: BluProviderId): EcsProviderDiagnostics | null {
    return this.providers.get(id)?.getDiagnostics() ?? null;
  }

  // ── Subscriptions ───────────────────────────────────────────────────

  /**
   * Subscribe to aggregated telemetry updates (all devices, all providers).
   */
  onAllReadings(callback: AllReadingsCallback): () => void {
    this.telemetrySubscribers.add(callback);
    return () => { this.telemetrySubscribers.delete(callback); };
  }

  /**
   * Subscribe to system state changes.
   */
  onSystemState(callback: SystemStateCallback): () => void {
    this.stateSubscribers.add(callback);
    return () => { this.stateSubscribers.delete(callback); };
  }

  /**
   * Subscribe to warnings from any provider.
   */
  onAnyWarning(callback: EcsWarningCallback): () => void {
    this.warningSubscribers.add(callback);
    return () => { this.warningSubscribers.delete(callback); };
  }

  // ── Private notification helpers ────────────────────────────────────

  private notifyTelemetrySubscribers(): void {
    const readings = this.getAllLatestReadings();
    for (const cb of this.telemetrySubscribers) {
      try { cb(readings); } catch { /* subscriber errors must not crash registry */ }
    }
  }

  private notifyStateSubscribers(): void {
    const state = this.getSystemPowerState();
    for (const cb of this.stateSubscribers) {
      try { cb(state); } catch { /* subscriber errors must not crash registry */ }
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  private reconcileProviderCache(provider: IEcsPowerProvider): void {
    const connectedById = new Map(
      provider
        .getConnectedDevices()
        .map((device) => [device.device_id, device] as const),
    );

    for (const [readingKey, reading] of Array.from(this.cachedReadings.entries())) {
      if (reading.provider !== provider.providerId) continue;

      const connectedDevice = connectedById.get(reading.deviceId);
      if (!connectedDevice || connectedDevice.connection_state !== 'connected') {
        this.cachedReadings.delete(readingKey);
        continue;
      }

      if (
        reading.connectionState !== connectedDevice.connection_state ||
        reading.isDisconnected ||
        reading.isPrimary !== connectedDevice.is_primary
      ) {
        this.cachedReadings.set(readingKey, {
          ...reading,
          connectionState: connectedDevice.connection_state,
          isDisconnected: false,
          isPrimary: connectedDevice.is_primary,
        });
      }
    }
  }

  /**
   * Destroy all providers and clean up.
   */
  destroy(): void {
    for (const [id] of this.providers) {
      this.unregisterProvider(id);
    }
    this.cachedReadings.clear();
    this.telemetrySubscribers.clear();
    this.stateSubscribers.clear();
    this.warningSubscribers.clear();
    this.lastSystemState = null;
  }
}

// ── Singleton Export ─────────────────────────────────────────────────────

export const ecsProviderRegistry = new EcsProviderRegistryImpl();


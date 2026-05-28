import { createNativeBleBluAdapter } from './createNativeBleBluAdapter';
import { bluDeviceRegistry } from './BluDeviceRegistry';
import type {
  BluConnectionState,
  BluDevice,
  BluDeviceCapabilities,
  BluProviderId,
  BluTelemetry,
} from './BluTypes';
import { DEFAULT_BLU_CAPABILITIES } from './BluTypes';
import type {
  EcsConnectResult,
  EcsDiscoveredDevice,
  EcsNormalizedReading,
  EcsProviderAuthRequirement,
  EcsProviderDiagnostics,
  EcsProviderLifecycleState,
  EcsProviderWarning,
  IEcsPowerProvider,
} from './IEcsPowerProvider';
import { getProviderMeta } from './BluProviderRegistry';
import { getBluetoothTelemetrySourceLabel } from './bluetoothLiveTelemetry';
import { buildPowerBluTelemetryEnvelope } from './bluTelemetryEnvelope';

type NativeBleAdapter = ReturnType<typeof createNativeBleBluAdapter>;

const POWER_BLE_CAPABILITIES: BluDeviceCapabilities = {
  ...DEFAULT_BLU_CAPABILITIES,
  hasBatteryPercent: true,
  hasInputWatts: true,
  hasOutputWatts: true,
  hasSolarInput: true,
  hasTemperature: true,
  hasRuntimeEstimate: true,
};

function normalizeNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function hasDecodedPowerFields(telemetry: BluTelemetry): boolean {
  return [
    telemetry.battery_percent,
    telemetry.input_watts,
    telemetry.output_watts,
    telemetry.solar_input_watts,
    telemetry.ac_output_watts,
    telemetry.dc_output_watts,
    telemetry.battery_volts,
    telemetry.battery_amps,
    telemetry.temperature_celsius,
  ].some((value) => typeof value === 'number' && Number.isFinite(value));
}

function inferChargingState(telemetry: BluTelemetry): EcsNormalizedReading['chargingState'] {
  const inputWatts = telemetry.input_watts ?? telemetry.solar_input_watts ?? telemetry.ac_input_watts ?? 0;
  const outputWatts = telemetry.output_watts ?? 0;
  if (inputWatts > outputWatts && inputWatts > 0) return 'charging';
  if (outputWatts > 0) return 'discharging';
  if (telemetry.battery_percent != null && telemetry.battery_percent >= 99) return 'full';
  return 'unknown';
}

function inferOutputState(telemetry: BluTelemetry): EcsNormalizedReading['outputState'] {
  const ac = telemetry.ac_output_watts ?? 0;
  const dc = telemetry.dc_output_watts ?? 0;
  if (ac > 0 && dc > 0) return 'all_on';
  if (ac > 0) return 'ac_on';
  if (dc > 0) return 'dc_on';
  if ((telemetry.output_watts ?? 0) > 0) return 'all_on';
  return 'unknown';
}

function mapLifecycleState(state: BluConnectionState | string | null | undefined): EcsProviderLifecycleState {
  switch (state) {
    case 'scanning':
      return 'scanning';
    case 'connecting':
      return 'connecting';
    case 'connected':
      return 'connected';
    case 'error':
      return 'error';
    case 'disconnected':
      return 'disconnected';
    default:
      return 'idle';
  }
}

function normalizeReading(
  providerId: BluProviderId,
  displayName: string,
  telemetry: BluTelemetry | null | undefined,
  device?: BluDevice | null,
): EcsNormalizedReading | null {
  if (!telemetry) return null;
  const isLive = telemetry.isLive === true && hasDecodedPowerFields(telemetry);
  const meta = getProviderMeta(providerId);
  const reading: EcsNormalizedReading = {
    provider: providerId,
    providerDisplayName: displayName,
    providerAccentColor: meta?.accentColor ?? '#64748B',
    providerIcon: meta?.icon ?? 'battery-charging',
    deviceId: telemetry.device_id,
    deviceName: device?.display_name ?? String(telemetry.raw?.deviceName ?? displayName),
    model: device?.model ?? String(telemetry.raw?.model ?? displayName),
    batteryPercent: normalizeNumber(telemetry.battery_percent),
    inputWatts: normalizeNumber(telemetry.input_watts),
    outputWatts: normalizeNumber(telemetry.output_watts),
    estimatedRuntimeMinutes: normalizeNumber(telemetry.estimated_runtime_minutes),
    chargingState: inferChargingState(telemetry),
    outputState: inferOutputState(telemetry),
    connectionState: isLive ? 'connected' : 'error',
    warningState: 'normal',
    isDisconnected: false,
    temperatureCelsius: normalizeNumber(telemetry.temperature_celsius),
    solarInputWatts: normalizeNumber(telemetry.solar_input_watts),
    acOutputWatts: normalizeNumber(telemetry.ac_output_watts),
    dcOutputWatts: normalizeNumber(telemetry.dc_output_watts),
    batteryVolts: normalizeNumber(telemetry.battery_volts),
    batteryAmps: normalizeNumber(telemetry.battery_amps),
    chargeCycles: normalizeNumber(telemetry.charge_cycles),
    healthPercent: normalizeNumber(telemetry.health_percent),
    capacityWh: normalizeNumber(telemetry.capacity_wh),
    lastUpdated: normalizeNumber(telemetry.updatedAt ?? telemetry.timestamp) ?? Date.now(),
    isStale: false,
    isPrimary: device?.is_primary === true,
    telemetrySource: isLive ? 'ble_live' : telemetry.source ?? 'unavailable',
    telemetrySourceLabel: telemetry.telemetrySourceLabel ?? getBluetoothTelemetrySourceLabel(isLive ? 'ble_live' : 'unavailable'),
    isLive,
    updatedAt: normalizeNumber(telemetry.updatedAt ?? telemetry.timestamp) ?? Date.now(),
    telemetryUnsupported: !isLive,
    telemetryUnsupportedReason: isLive
      ? undefined
      : telemetry.telemetryUnsupportedReason ?? 'Connected over Bluetooth; telemetry is not decoded for this model yet.',
  };

  return {
    ...reading,
    bluTelemetryEnvelope: telemetry.bluTelemetryEnvelope ?? buildPowerBluTelemetryEnvelope(reading),
  };
}

function createProvider(
  providerId: BluProviderId,
  displayName: string,
  adapter: NativeBleAdapter,
): IEcsPowerProvider {
  const telemetryCallbacks = new Set<(telemetry: EcsNormalizedReading) => void>();
  const connectionCallbacks = new Set<(state: EcsProviderLifecycleState) => void>();
  const warningCallbacks = new Set<(warning: EcsProviderWarning) => void>();
  let isPolling = false;
  let lastConnectionAttemptAt: number | null = null;
  let lastTelemetryAt: number | null = null;

  const emitConnection = () => {
    const state = mapLifecycleState(adapter.getState().connectionState);
    for (const callback of connectionCallbacks) callback(state);
  };

  adapter.subscribe(() => {
    emitConnection();
  });
  adapter.subscribeEvent?.('telemetry', (payload: { telemetry?: BluTelemetry | null; device?: BluDevice | null }) => {
    const reading = normalizeReading(providerId, displayName, payload.telemetry, payload.device);
    if (!reading || !reading.isLive) return;
    lastTelemetryAt = reading.lastUpdated;
    for (const callback of telemetryCallbacks) callback(reading);
  });

  return {
    providerId,
    displayName,
    accentColor: getProviderMeta(providerId)?.accentColor ?? '#64748B',
    iconName: getProviderMeta(providerId)?.icon ?? 'battery-charging',
    transportType: 'ble',

    getLifecycleState: () => mapLifecycleState(adapter.getState().connectionState),
    getAuthRequirement: (): EcsProviderAuthRequirement => ({
      required: false,
      authType: 'none',
      isAuthenticated: true,
      description: `${displayName} uses native Bluetooth and does not require cloud credentials.`,
    }),
    authenticate: async () => true,

    connect: async (deviceId?: string): Promise<EcsConnectResult> => {
      lastConnectionAttemptAt = Date.now();
      const result = await adapter.connect(deviceId);
      return {
        success: result.success,
        deviceCount: result.devices?.length ?? (result.device ? 1 : 0),
        devices: result.devices ?? (result.device ? [result.device] : []),
        error: result.error ?? undefined,
        errorCode: result.errorCode ?? undefined,
      };
    },
    disconnect: async () => {
      isPolling = false;
      await adapter.disconnect();
    },
    reconnect: async () => {
      const restored = await adapter.restoreSession();
      return {
        success: restored,
        deviceCount: adapter.getState().connectedDevices.length,
        devices: adapter.getState().connectedDevices,
        error: restored ? undefined : 'Unable to restore Bluetooth session.',
        errorCode: restored ? undefined : 'RESTORE_FAILED',
      };
    },
    isConnected: () => adapter.getState().connectionState === 'connected',

    discoverDevices: async (): Promise<EcsDiscoveredDevice[]> => {
      const devices = await adapter.scanForDevices();
      return devices.map((device) => ({
        id: device.id,
        name: device.name,
        model: device.model ?? displayName,
        provider: providerId,
        rssi: device.rssi,
        modelDisplayName: device.model,
        discoveredAt: Date.now(),
        raw: device,
      }));
    },
    getConnectedDevices: () => adapter.getState().connectedDevices,
    getRegisteredDevices: () => bluDeviceRegistry.getByProvider(providerId),

    fetchTelemetry: async (): Promise<EcsNormalizedReading[]> => {
      const connectedDevices = adapter.getState().connectedDevices;
      if (connectedDevices.length === 0) return [];
      const readings: EcsNormalizedReading[] = [];
      for (const device of connectedDevices) {
        const result = await adapter.pollTelemetry(device.device_id);
        const reading = normalizeReading(providerId, displayName, result.telemetry, device);
        if (reading) {
          if (reading.isLive) lastTelemetryAt = reading.lastUpdated;
          readings.push(reading);
        }
      }
      return readings;
    },
    startPolling: (intervalMs?: number) => {
      isPolling = true;
      adapter.startPolling(intervalMs);
    },
    stopPolling: () => {
      isPolling = false;
      adapter.stopPolling();
    },
    isPolling: () => isPolling,
    onTelemetry: (callback) => {
      telemetryCallbacks.add(callback);
      return () => telemetryCallbacks.delete(callback);
    },
    onConnectionChange: (callback) => {
      connectionCallbacks.add(callback);
      return () => connectionCallbacks.delete(callback);
    },
    onWarning: (callback) => {
      warningCallbacks.add(callback);
      return () => warningCallbacks.delete(callback);
    },

    normalizeReading: (deviceId, raw) => normalizeReading(providerId, displayName, {
      ...(raw && typeof raw === 'object' ? raw as Partial<BluTelemetry> : {}),
      timestamp: Date.now(),
      provider: providerId,
      device_id: deviceId,
    } as BluTelemetry),
    normalizeDeviceMetadata: (deviceId) => {
      const device = bluDeviceRegistry.getDevice(providerId, deviceId);
      return device ? { deviceId, deviceName: device.display_name, model: device.model } : null;
    },

    getDiagnostics: (): EcsProviderDiagnostics => ({
      providerId,
      lifecycleState: mapLifecycleState(adapter.getState().connectionState),
      connectedDeviceCount: adapter.getState().connectedDevices.length,
      totalPollCount: adapter.getState().pollCount,
      successfulPollCount: lastTelemetryAt ? 1 : 0,
      failedPollCount: adapter.getState().lastError ? 1 : 0,
      pollIntervalMs: 15_000,
      lastTelemetryAt,
      lastConnectionAttemptAt,
      reconnectAttemptsSinceStable: adapter.getState().reconnectAttempts,
      isInBackoff: adapter.getState().isReconnecting,
      currentBackoffMs: adapter.getState().isReconnecting ? 10_000 : 0,
      uptimeMs: lastTelemetryAt ? Math.max(0, Date.now() - lastTelemetryAt) : 0,
      multiDeviceCapability: adapter.getState().multiDeviceCapability,
      multiDeviceCapabilityReason: adapter.getState().multiDeviceCapabilityReason ?? undefined,
      activeDeviceIds: adapter.getState().activeDeviceIds,
      telemetryDeviceIds: Object.keys(adapter.getState().telemetryByDeviceId),
    }),
    getActiveWarnings: () => [],
    reportConnectionState: () => adapter.getState().connectionState,
    reportDeviceWarnings: () => [],
    setPrimaryDevice: (deviceId) => adapter.setPrimaryDevice(deviceId),
    renameDevice: (deviceId, newName) => adapter.renameDevice(deviceId, newName),
    removeDevice: (deviceId) => bluDeviceRegistry.removeDevice(providerId, deviceId),
    saveSession: async () => {},
    restoreSession: () => adapter.restoreSession(),
    hasPreviousSession: () => false,
    destroy: () => {
      isPolling = false;
      adapter.stopPolling();
      void adapter.disconnect();
    },
  };
}

function isNamedDevice(...patterns: RegExp[]) {
  return ({ name, manufacturerData }: { name?: string | null; manufacturerData?: string | null }) => {
    const text = `${name ?? ''} ${manufacturerData ?? ''}`;
    return patterns.some((pattern) => pattern.test(text));
  };
}

export const bluettiPowerProvider = createProvider('bluetti', 'Bluetti', createNativeBleBluAdapter({
  provider: 'bluetti',
  displayName: 'Bluetti',
  capabilities: POWER_BLE_CAPABILITIES,
  isSupportedDevice: isNamedDevice(/bluetti/i, /blue\s*eddy/i, /\bac\d{2,}/i, /\beb\d{2,}/i, /\bep\d{2,}/i),
  getModelName: (name) => name.trim() || 'Bluetti Device',
}));

export const ankerSolixPowerProvider = createProvider('anker_solix', 'Anker SOLIX', createNativeBleBluAdapter({
  provider: 'anker_solix',
  displayName: 'Anker SOLIX',
  capabilities: POWER_BLE_CAPABILITIES,
  isSupportedDevice: isNamedDevice(/anker/i, /solix/i, /\bc\d{3,}/i, /\bf\d{3,}/i),
  getModelName: (name) => name.trim() || 'Anker SOLIX Device',
}));

export const jackeryPowerProvider = createProvider('jackery', 'Jackery', createNativeBleBluAdapter({
  provider: 'jackery',
  displayName: 'Jackery',
  capabilities: POWER_BLE_CAPABILITIES,
  isSupportedDevice: isNamedDevice(/jackery/i, /explorer/i, /solar\s*generator/i),
  getModelName: (name) => name.trim() || 'Jackery Device',
}));

export const goalZeroPowerProvider = createProvider('goal_zero', 'Goal Zero', createNativeBleBluAdapter({
  provider: 'goal_zero',
  displayName: 'Goal Zero',
  capabilities: POWER_BLE_CAPABILITIES,
  isSupportedDevice: isNamedDevice(/goal\s*zero/i, /\byeti\b/i, /\balta\b/i),
  getModelName: (name) => name.trim() || 'Goal Zero Device',
}));

export const renogyPowerProvider = createProvider('renogy', 'Renogy', createNativeBleBluAdapter({
  provider: 'renogy',
  displayName: 'Renogy',
  capabilities: POWER_BLE_CAPABILITIES,
  isSupportedDevice: isNamedDevice(/renogy/i, /\brbt\b/i, /\bbt-?[12]\b/i, /rover/i),
  getModelName: (name) => name.trim() || 'Renogy Device',
}));

export const redarcPowerProvider = createProvider('redarc', 'REDARC', createNativeBleBluAdapter({
  provider: 'redarc',
  displayName: 'REDARC',
  capabilities: POWER_BLE_CAPABILITIES,
  isSupportedDevice: isNamedDevice(/redarc/i, /redvision/i, /manager\s*30/i, /\btvms\b/i, /\bbcdc\b/i),
  getModelName: (name) => name.trim() || 'REDARC Device',
}));

export const dakotaLithiumPowerProvider = createProvider('dakota_lithium', 'Dakota Lithium', createNativeBleBluAdapter({
  provider: 'dakota_lithium',
  displayName: 'Dakota Lithium',
  capabilities: POWER_BLE_CAPABILITIES,
  isSupportedDevice: isNamedDevice(/dakota/i, /\bdl\+?/i, /lifepo4/i),
  getModelName: (name) => name.trim() || 'Dakota Lithium Device',
}));

export const victronPowerProvider = createProvider('victron', 'Victron Energy', createNativeBleBluAdapter({
  provider: 'victron',
  displayName: 'Victron Energy',
  capabilities: POWER_BLE_CAPABILITIES,
  isSupportedDevice: isNamedDevice(/victron/i, /smart\s*shunt/i, /\bbmv\b/i, /smart\s*solar/i, /blue\s*smart/i),
  getModelName: (name) => name.trim() || 'Victron Device',
}));

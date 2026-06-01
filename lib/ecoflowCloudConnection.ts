import { EcoFlowCloudProvider } from '../src/power/cloud/providers/EcoFlowCloudProvider';
import type { PowerTelemetry } from '../src/power/types/PowerTelemetry';

export const ECOFLOW_CLOUD_CONNECT_TOKEN = 'CLOUD';

export type EcoFlowCloudProductType =
  | 'refrigerator'
  | 'power_station'
  | 'charger'
  | 'portable_ac'
  | 'unknown'
  | string;

export interface EcoFlowCloudConnectionDevice {
  id?: string;
  rawId?: string;
  name?: string;
  model?: string | null;
  subtype?: string | null;
  category?: string | null;
  productType?: string | null;
  signalStrength?: number | null;
  raw?: Record<string, unknown> | null;
}

export interface EcoFlowPerDeviceTelemetry {
  deviceId: string;
  name?: string;
  model?: string;
  socPct?: number;
  wattsIn?: number;
  wattsOut?: number;
  solarWatts?: number;
  ok: boolean;
  pendingApproval: boolean;
  error: string | null;
  polledAt: number;
}

export interface EcoFlowCloudConnectionProvider {
  connect(deviceId: string, token: string): Promise<void>;
  pollOnce(): Promise<Partial<PowerTelemetry>>;
  getPerDeviceTelemetry(): EcoFlowPerDeviceTelemetry[];
  lastStatus?: string;
  lastCloudError?: string | null;
}

export interface EcoFlowCloudTelemetryNormalization {
  productType: EcoFlowCloudProductType;
  telemetry: Partial<PowerTelemetry> | null;
  perDeviceTelemetry: EcoFlowPerDeviceTelemetry | null;
  telemetryActive: boolean;
  batteryPct: number | null;
  inputWatts: number | null;
  outputWatts: number | null;
  solarWatts: number | null;
  fridgeTemperatureC: number | null;
  acTemperatureC: number | null;
  acMode: string | null;
  chargerStatus: string | null;
}

export interface EcoFlowCloudConnectionResult extends EcoFlowCloudTelemetryNormalization {
  connected: boolean;
  statusLabel: string;
  statusError: string | null;
  providerStatus: string | null;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readNestedValue(source: unknown, path: string): unknown {
  if (!source || typeof source !== 'object') return undefined;
  let current: unknown = source;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function readNumberFromSources(sources: unknown[], aliases: string[]): number | null {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const alias of aliases) {
      const parsed = readFiniteNumber(readNestedValue(source, alias));
      if (parsed != null) return parsed;
    }
  }
  return null;
}

function readStringFromSources(sources: unknown[], aliases: string[]): string | null {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const alias of aliases) {
      const value = readNestedValue(source, alias);
      const text = normalizeText(value);
      if (text) return text;
    }
  }
  return null;
}

export function normalizeEcoFlowCloudProductType(
  value: string | null | undefined,
  fallbackText: string = '',
): EcoFlowCloudProductType {
  const normalized = `${value ?? ''} ${fallbackText}`.trim().toLowerCase().replace(/\s+/g, '_');
  if (!normalized || normalized === 'unknown') return 'unknown';
  if (/glacier|fridge|refrigerator/.test(normalized)) return 'refrigerator';
  if (/wave|portable_ac|air_condition/.test(normalized)) return 'portable_ac';
  if (/alternator|charger/.test(normalized)) return 'charger';
  if (/delta|river|power_station|power/.test(normalized)) return 'power_station';
  return String(value ?? fallbackText).trim().toLowerCase().replace(/\s+/g, '_') || 'unknown';
}

function resolveDeviceId(device: EcoFlowCloudConnectionDevice): string {
  return normalizeText(device.rawId ?? device.id);
}

function selectPerDeviceTelemetry(
  deviceId: string,
  perDeviceTelemetry: EcoFlowPerDeviceTelemetry[],
): EcoFlowPerDeviceTelemetry | null {
  return perDeviceTelemetry.find((entry) => entry.deviceId === deviceId) ?? null;
}

function hasPowerTelemetryValues(telemetry: Partial<PowerTelemetry> | null): boolean {
  if (!telemetry) return false;
  const battery = telemetry.battery;
  const solar = telemetry.solar;
  return [
    battery?.socPct,
    battery?.wattsIn,
    battery?.wattsOut,
    battery?.volts,
    battery?.amps,
    battery?.tempC,
    battery?.estRuntimeMin,
    solar?.watts,
  ].some((value) => typeof value === 'number' && Number.isFinite(value));
}

export function normalizeEcoFlowCloudTelemetry(
  device: EcoFlowCloudConnectionDevice,
  aggregateTelemetry: Partial<PowerTelemetry> | null,
  perDeviceTelemetry: EcoFlowPerDeviceTelemetry[] = [],
  now: number = Date.now(),
): EcoFlowCloudTelemetryNormalization {
  const deviceId = resolveDeviceId(device);
  const selectedTelemetry = selectPerDeviceTelemetry(deviceId, perDeviceTelemetry);
  const productType = normalizeEcoFlowCloudProductType(
    device.productType ?? device.category ?? null,
    `${device.name ?? ''} ${device.model ?? ''} ${device.subtype ?? ''}`,
  );
  const model = normalizeText(
    device.subtype ??
    device.model ??
    selectedTelemetry?.model ??
    aggregateTelemetry?.device?.model ??
    device.name ??
    'EcoFlow Device',
  );
  const rawSources = [
    device.raw,
    aggregateTelemetry,
    aggregateTelemetry as Record<string, unknown> | null,
    (aggregateTelemetry as Record<string, unknown> | null)?.raw,
  ];

  const batteryPct =
    selectedTelemetry?.socPct ??
    aggregateTelemetry?.battery?.socPct ??
    readNumberFromSources(rawSources, ['batteryPct', 'battery.percent', 'battery.socPct', 'socPct']);
  const inputWatts =
    selectedTelemetry?.wattsIn ??
    aggregateTelemetry?.battery?.wattsIn ??
    readNumberFromSources(rawSources, ['inputWatts', 'battery.wattsIn', 'wattsIn']);
  const outputWatts =
    selectedTelemetry?.wattsOut ??
    aggregateTelemetry?.battery?.wattsOut ??
    readNumberFromSources(rawSources, ['outputWatts', 'battery.wattsOut', 'wattsOut']);
  const solarWatts =
    selectedTelemetry?.solarWatts ??
    aggregateTelemetry?.solar?.watts ??
    readNumberFromSources(rawSources, ['solarWatts', 'solar.watts', 'solar_input_watts']);
  const fridgeTemperatureC =
    productType === 'refrigerator'
      ? readNumberFromSources(rawSources, [
        'fridgeTemperatureC',
        'fridgeTempC',
        'refrigerator.temperatureC',
        'temperatureC',
        'battery.tempC',
      ]) ?? aggregateTelemetry?.battery?.tempC ?? null
      : null;
  const acTemperatureC =
    productType === 'portable_ac'
      ? readNumberFromSources(rawSources, ['acTemperatureC', 'ac.tempC', 'temperatureC', 'battery.tempC'])
      : null;
  const acMode =
    productType === 'portable_ac'
      ? readStringFromSources(rawSources, ['acMode', 'ac.mode', 'mode'])
      : null;
  const chargerStatus =
    productType === 'charger'
      ? readStringFromSources(rawSources, ['chargerStatus', 'charger.status', 'status'])
      : null;

  const telemetryActive = hasPowerTelemetryValues(aggregateTelemetry) || selectedTelemetry?.ok === true;
  const telemetry: Partial<PowerTelemetry> | null = aggregateTelemetry
    ? {
      ...aggregateTelemetry,
      timestamp: aggregateTelemetry.timestamp ?? selectedTelemetry?.polledAt ?? now,
      source: 'cloud',
      sourceLabel: 'EcoFlow Cloud',
      isLive: telemetryActive,
      device: {
        ...aggregateTelemetry.device,
        id: deviceId,
        vendor: 'EcoFlow',
        model,
        serial: deviceId,
      },
      battery: {
        ...aggregateTelemetry.battery,
        socPct: batteryPct ?? aggregateTelemetry.battery?.socPct,
        wattsIn: inputWatts ?? aggregateTelemetry.battery?.wattsIn,
        wattsOut: outputWatts ?? aggregateTelemetry.battery?.wattsOut,
        tempC:
          aggregateTelemetry.battery?.tempC ??
          fridgeTemperatureC ??
          acTemperatureC ??
          undefined,
      },
      solar: {
        ...aggregateTelemetry.solar,
        watts: solarWatts ?? aggregateTelemetry.solar?.watts,
      },
      flags: {
        ...aggregateTelemetry.flags,
        stale: aggregateTelemetry.flags?.stale ?? false,
      },
      capabilities: {
        hasSOC: batteryPct != null,
        hasWattsIn: inputWatts != null,
        hasWattsOut: outputWatts != null,
        hasSolar: solarWatts != null,
        hasRuntimeEstimate: aggregateTelemetry.battery?.estRuntimeMin != null,
        controllable: false,
        ...aggregateTelemetry.capabilities,
      },
      quality: {
        ...aggregateTelemetry.quality,
        connection: telemetryActive ? 'connected' : aggregateTelemetry.quality?.connection,
        lastPacketAt: selectedTelemetry?.polledAt ?? aggregateTelemetry.quality?.lastPacketAt ?? now,
        rssi: device.signalStrength ?? aggregateTelemetry.quality?.rssi,
      },
    }
    : null;

  return {
    productType,
    telemetry,
    perDeviceTelemetry: selectedTelemetry,
    telemetryActive,
    batteryPct: batteryPct ?? null,
    inputWatts: inputWatts ?? null,
    outputWatts: outputWatts ?? null,
    solarWatts: solarWatts ?? null,
    fridgeTemperatureC,
    acTemperatureC,
    acMode,
    chargerStatus,
  };
}

export async function connectEcoFlowCloudDevice(
  device: EcoFlowCloudConnectionDevice,
  provider: EcoFlowCloudConnectionProvider = new EcoFlowCloudProvider(),
): Promise<EcoFlowCloudConnectionResult> {
  const deviceId = resolveDeviceId(device);
  if (!deviceId) {
    return {
      connected: false,
      statusLabel: 'Missing EcoFlow cloud device id.',
      statusError: 'missing_device_id',
      providerStatus: null,
      ...normalizeEcoFlowCloudTelemetry(device, null, []),
    };
  }

  try {
    await provider.connect(deviceId, ECOFLOW_CLOUD_CONNECT_TOKEN);
  } catch (error) {
    return {
      connected: false,
      statusLabel: 'EcoFlow Cloud connection failed.',
      statusError: error instanceof Error ? error.message : String(error ?? 'EcoFlow Cloud connection failed.'),
      providerStatus: provider.lastStatus ?? null,
      ...normalizeEcoFlowCloudTelemetry(device, null, []),
    };
  }

  try {
    const telemetry = await provider.pollOnce();
    const perDeviceTelemetry = provider.getPerDeviceTelemetry();
    const normalized = normalizeEcoFlowCloudTelemetry(device, telemetry, perDeviceTelemetry);
    return {
      connected: true,
      statusLabel: normalized.telemetryActive
        ? 'EcoFlow Cloud telemetry active.'
        : 'EcoFlow Cloud device available.',
      statusError: null,
      providerStatus: provider.lastStatus ?? null,
      ...normalized,
    };
  } catch (error) {
    return {
      connected: true,
      statusLabel: 'EcoFlow Cloud device available. Status fetch will retry later.',
      statusError: error instanceof Error ? error.message : String(error ?? 'EcoFlow status fetch failed.'),
      providerStatus: provider.lastStatus ?? null,
      ...normalizeEcoFlowCloudTelemetry(device, null, provider.getPerDeviceTelemetry()),
    };
  }
}

import type {
  BluConnectionState,
  BluConnectionStatus,
  BluProviderId,
  BluTelemetry,
  BluTelemetryEnvelope,
  BluTelemetryEnvelopeError,
  BluTelemetryEnvelopeSource,
  BluTelemetryHealth,
} from './BluTypes';
import type { EcsNormalizedReading } from './IEcsPowerProvider';
import type {
  NormalizedVehicleTelemetry,
  OBD2TelemetryValue,
  TelemetryConnectionState,
  VehicleTelemetryConnectionState,
  VehicleTelemetrySource,
} from '../src/vehicle-telemetry/VehicleTelemetryTypes';

export const BLU_OBD2_REFERENCE_LIVE_AFTER_MS = 30_000;
export const BLU_OBD2_REFERENCE_STALE_AFTER_MS = 90_000;
export const BLU_POWER_REFERENCE_LIVE_AFTER_MS = 30_000;
export const BLU_POWER_REFERENCE_STALE_AFTER_MS = 5 * 60_000;

export type BluVehicleConnectionState =
  | VehicleTelemetryConnectionState
  | TelemetryConnectionState
  | 'reconnecting'
  | 'disconnecting'
  | 'timeout';

export type Obd2BluTelemetryData = {
  vehicle_speed?: number;
  engine_rpm?: number;
  engine_load?: number;
  coolant_temp?: number;
  intake_temp?: number;
  battery_voltage?: number;
  fuel_level?: number;
  fuel_rate?: number;
  engine_runtime?: number;
  throttle_position?: number;
  mass_air_flow?: number;
  barometric_pressure?: number;
  ambient_temp?: number;
  transmission_temp?: number;
  oil_temp?: number;
  oil_pressure?: number;
  odometer?: number;
  obd2_values?: OBD2TelemetryValue[];
  telemetryKeys: string[];
};

export type PowerBluTelemetryData = {
  battery_percent?: number;
  input_watts?: number;
  output_watts?: number;
  battery_watts?: number;
  estimated_runtime_minutes?: number;
  solar_input_watts?: number;
  ac_output_watts?: number;
  dc_output_watts?: number;
  temperature_celsius?: number;
  battery_volts?: number;
  battery_amps?: number;
  charge_cycles?: number;
  health_percent?: number;
  capacity_wh?: number;
  signal_strength?: number;
  telemetryKeys: string[];
};

export type BluTelemetryHealthInput = {
  timestamp?: number | null;
  now?: number;
  liveAfterMs?: number;
  staleAfterMs?: number;
  source?: BluTelemetryEnvelopeSource | VehicleTelemetrySource | null;
  hasDecodedData?: boolean;
};

export type BuildObd2BluTelemetryEnvelopeOptions = {
  connectionState?: BluVehicleConnectionState | null;
  vendor?: string;
  deviceType?: string;
  now?: number;
  liveAfterMs?: number;
  staleAfterMs?: number;
  error?: BluTelemetryEnvelopeError;
};

const OBD2_NUMERIC_FIELDS: Array<keyof Omit<Obd2BluTelemetryData, 'obd2_values' | 'telemetryKeys'>> = [
  'vehicle_speed',
  'engine_rpm',
  'engine_load',
  'coolant_temp',
  'intake_temp',
  'battery_voltage',
  'fuel_level',
  'fuel_rate',
  'engine_runtime',
  'throttle_position',
  'mass_air_flow',
  'barometric_pressure',
  'ambient_temp',
  'transmission_temp',
  'oil_temp',
  'oil_pressure',
  'odometer',
];

const POWER_NUMERIC_FIELDS: Array<keyof Omit<PowerBluTelemetryData, 'telemetryKeys'>> = [
  'battery_percent',
  'input_watts',
  'output_watts',
  'battery_watts',
  'estimated_runtime_minutes',
  'solar_input_watts',
  'ac_output_watts',
  'dc_output_watts',
  'temperature_celsius',
  'battery_volts',
  'battery_amps',
  'charge_cycles',
  'health_percent',
  'capacity_wh',
  'signal_strength',
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function hasDecodedVehicleTelemetry(
  telemetry: NormalizedVehicleTelemetry | null | undefined,
): boolean {
  if (!telemetry) return false;
  if (Array.isArray(telemetry.obd2_values) && telemetry.obd2_values.length > 0) return true;
  return OBD2_NUMERIC_FIELDS.some((field) => isFiniteNumber(telemetry[field]));
}

export function resolveBluTelemetryHealth(input: BluTelemetryHealthInput): BluTelemetryHealth {
  const source = input.source ?? null;
  if (source === 'mock' || source === 'mock_dev') return 'mock';
  if (input.hasDecodedData === false) return 'unavailable';

  const timestamp = Number(input.timestamp ?? 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'unavailable';

  const now = Number(input.now ?? Date.now());
  const liveAfterMs = input.liveAfterMs ?? BLU_OBD2_REFERENCE_LIVE_AFTER_MS;
  const staleAfterMs = input.staleAfterMs ?? BLU_OBD2_REFERENCE_STALE_AFTER_MS;
  const packetAgeMs = Math.max(0, now - timestamp);

  if (packetAgeMs <= liveAfterMs) return 'live';
  if (packetAgeMs <= staleAfterMs) return 'recent';
  return 'stale';
}

function mapBluetoothSourceToBluEnvelopeSource(source: unknown): BluTelemetryEnvelopeSource {
  if (source === 'mock' || source === 'mock_dev') return 'mock';
  if (source === 'provider_cloud' || source === 'cloud' || source === 'cloud-api') return 'cloud-api';
  if (source === 'ble_live' || source === 'ble' || source === 'local-ble') return 'local-ble';
  if (source === 'obd2' || source === 'bluetooth_obd_live') return 'obd2';
  return 'unknown';
}

export function mapVehicleConnectionStateToBluStatus(
  state: BluVehicleConnectionState | null | undefined,
  options: {
    health?: BluTelemetryHealth;
    hasDecodedData?: boolean;
  } = {},
): BluConnectionStatus {
  const health = options.health;
  const hasDecodedData = options.hasDecodedData === true;

  if (state === 'timeout') return 'timeout';
  if (state === 'disconnecting') return 'disconnecting';
  if (state === 'idle') return 'idle';
  if (state === 'scanning') return 'scanning';
  if (state === 'connecting' || state === 'reconnecting') return 'connecting';
  if (state === 'discovering_services') return 'handshaking';
  if (state === 'error' || state === 'failed' || state === 'unsupported') return 'failed';
  if (state === 'disconnected') return 'disconnected';

  if (state === 'reading' || state === 'connected') {
    if (health === 'stale') return 'stale';
    if (hasDecodedData && (health === 'live' || health === 'recent' || health === 'mock')) {
      return 'streaming';
    }
    return state === 'reading' ? 'handshaking' : 'connected';
  }

  return hasDecodedData ? 'streaming' : 'idle';
}

export function getObd2BluTelemetryData(telemetry: NormalizedVehicleTelemetry): Obd2BluTelemetryData {
  const data: Obd2BluTelemetryData = {
    telemetryKeys: [],
  };

  OBD2_NUMERIC_FIELDS.forEach((field) => {
    const value = telemetry[field];
    if (isFiniteNumber(value)) {
      data[field] = value;
      data.telemetryKeys.push(field);
    }
  });

  if (Array.isArray(telemetry.obd2_values) && telemetry.obd2_values.length > 0) {
    data.obd2_values = telemetry.obd2_values;
    data.telemetryKeys.push('obd2_values');
  }

  return data;
}

export function getPowerBluTelemetryData(telemetry: BluTelemetry): PowerBluTelemetryData {
  const data: PowerBluTelemetryData = {
    telemetryKeys: [],
  };

  for (const field of POWER_NUMERIC_FIELDS) {
    const value = telemetry[field];
    if (isFiniteNumber(value)) {
      data[field] = value;
      data.telemetryKeys.push(field);
    }
  }

  return data;
}

export function getPowerBluTelemetryDataFromReading(reading: EcsNormalizedReading): PowerBluTelemetryData {
  const data: PowerBluTelemetryData = {
    battery_percent: reading.batteryPercent ?? undefined,
    input_watts: reading.inputWatts ?? undefined,
    output_watts: reading.outputWatts ?? undefined,
    estimated_runtime_minutes: reading.estimatedRuntimeMinutes ?? undefined,
    solar_input_watts: reading.solarInputWatts ?? undefined,
    ac_output_watts: reading.acOutputWatts ?? undefined,
    dc_output_watts: reading.dcOutputWatts ?? undefined,
    temperature_celsius: reading.temperatureCelsius ?? undefined,
    battery_volts: reading.batteryVolts ?? undefined,
    battery_amps: reading.batteryAmps ?? undefined,
    charge_cycles: reading.chargeCycles ?? undefined,
    health_percent: reading.healthPercent ?? undefined,
    capacity_wh: reading.capacityWh ?? undefined,
    telemetryKeys: [],
  };

  if (isFiniteNumber(reading.batteryVolts) && isFiniteNumber(reading.batteryAmps)) {
    data.battery_watts = Math.round(reading.batteryVolts * reading.batteryAmps * 100) / 100;
  }

  for (const field of POWER_NUMERIC_FIELDS) {
    if (isFiniteNumber(data[field])) {
      data.telemetryKeys.push(field);
    }
  }

  return data;
}

export function hasDecodedPowerTelemetry(telemetry: BluTelemetry | null | undefined): boolean {
  if (!telemetry || telemetry.telemetryUnsupported === true) return false;
  return getPowerBluTelemetryData(telemetry).telemetryKeys.length > 0;
}

export function hasDecodedPowerTelemetryReading(reading: EcsNormalizedReading | null | undefined): boolean {
  if (!reading || reading.telemetryUnsupported === true) return false;
  return getPowerBluTelemetryDataFromReading(reading).telemetryKeys.length > 0;
}

export function mapPowerConnectionStateToBluStatus(
  state: BluConnectionState | null | undefined,
  options: {
    health?: BluTelemetryHealth;
    hasDecodedData?: boolean;
    telemetryUnsupported?: boolean;
  } = {},
): BluConnectionStatus {
  if (state === 'connecting') return 'connecting';
  if (state === 'disconnected') return 'disconnected';
  if (state === 'error') return 'failed';
  if (state === 'unsupported') return 'failed';

  if (state === 'connected') {
    if (options.health === 'stale') return 'stale';
    if (options.health === 'mock') return 'connected';
    if (options.hasDecodedData && (options.health === 'live' || options.health === 'recent')) {
      return 'streaming';
    }
    return options.telemetryUnsupported ? 'connected' : 'connected';
  }

  return options.hasDecodedData ? 'streaming' : 'idle';
}

export function buildBluPowerTelemetryEnvelope(
  telemetry: BluTelemetry,
  options: {
    vendor?: string;
    deviceType?: string;
    connectionStatus?: BluConnectionStatus;
    connectionState?: BluConnectionState | null;
    now?: number;
    liveAfterMs?: number;
    staleAfterMs?: number;
    error?: BluTelemetryEnvelopeError;
  } = {},
): BluTelemetryEnvelope<PowerBluTelemetryData> {
  const staleAfterMs = options.staleAfterMs ?? BLU_POWER_REFERENCE_STALE_AFTER_MS;
  const liveAfterMs = options.liveAfterMs ?? BLU_POWER_REFERENCE_LIVE_AFTER_MS;
  const data = getPowerBluTelemetryData(telemetry);
  const hasDecodedData = data.telemetryKeys.length > 0;
  const source = mapBluetoothSourceToBluEnvelopeSource(telemetry.source);
  const health = resolveBluTelemetryHealth({
    timestamp: telemetry.updatedAt ?? telemetry.timestamp,
    now: options.now,
    liveAfterMs,
    staleAfterMs,
    source,
    hasDecodedData,
  });
  const connectionStatus = options.connectionStatus ?? mapPowerConnectionStateToBluStatus(
    options.connectionState ?? (telemetry.telemetryUnsupported ? 'connected' : hasDecodedData ? 'connected' : 'disconnected'),
    {
      health,
      hasDecodedData,
      telemetryUnsupported: telemetry.telemetryUnsupported === true,
    },
  );

  return {
    deviceId: telemetry.device_id,
    vendor: options.vendor ?? telemetry.provider,
    deviceType: options.deviceType ?? 'power_device',
    connectionStatus,
    health,
    source,
    timestamp: Number(telemetry.updatedAt ?? telemetry.timestamp ?? 0),
    staleAfterMs,
    data,
    error: options.error ?? (telemetry.telemetryUnsupported
      ? {
          phase: 'telemetry_setup',
          code: 'TELEMETRY_UNSUPPORTED',
          message: telemetry.telemetryUnsupportedReason,
        }
      : undefined),
  };
}

export function withBluPowerTelemetryEnvelope(
  telemetry: BluTelemetry,
  options: Parameters<typeof buildBluPowerTelemetryEnvelope>[1] = {},
): BluTelemetry {
  return {
    ...telemetry,
    bluTelemetryEnvelope: buildBluPowerTelemetryEnvelope(telemetry, options),
  };
}

export function buildPowerBluTelemetryEnvelope(
  reading: EcsNormalizedReading,
  options: {
    vendor?: string;
    deviceType?: string;
    connectionStatus?: BluConnectionStatus;
    now?: number;
    liveAfterMs?: number;
    staleAfterMs?: number;
    error?: BluTelemetryEnvelopeError;
  } = {},
): BluTelemetryEnvelope<PowerBluTelemetryData> {
  const staleAfterMs = options.staleAfterMs ?? BLU_POWER_REFERENCE_STALE_AFTER_MS;
  const liveAfterMs = options.liveAfterMs ?? BLU_POWER_REFERENCE_LIVE_AFTER_MS;
  const data = getPowerBluTelemetryDataFromReading(reading);
  const hasDecodedData = data.telemetryKeys.length > 0;
  const source = mapBluetoothSourceToBluEnvelopeSource(reading.telemetrySource);
  const health = resolveBluTelemetryHealth({
    timestamp: reading.updatedAt ?? reading.lastUpdated,
    now: options.now,
    liveAfterMs,
    staleAfterMs,
    source,
    hasDecodedData,
  });
  const connectionStatus = options.connectionStatus ?? mapPowerConnectionStateToBluStatus(
    reading.connectionState,
    {
      health,
      hasDecodedData,
      telemetryUnsupported: reading.telemetryUnsupported === true,
    },
  );

  return {
    deviceId: reading.deviceId,
    vendor: options.vendor ?? reading.provider,
    deviceType: options.deviceType ?? 'power_device',
    connectionStatus,
    health,
    source,
    timestamp: Number(reading.updatedAt ?? reading.lastUpdated ?? 0),
    staleAfterMs,
    data,
    error: options.error ?? (reading.telemetryUnsupported
      ? {
          phase: 'telemetry_setup',
          code: 'TELEMETRY_UNSUPPORTED',
          message: reading.telemetryUnsupportedReason,
        }
      : undefined),
  };
}

export function resolveObd2BluEnvelopeSource(
  telemetry: Pick<NormalizedVehicleTelemetry, 'provider' | 'source'>,
): BluTelemetryEnvelopeSource {
  if (telemetry.source === 'mock_dev') return 'mock';
  if (telemetry.provider === 'obd2' || telemetry.source === 'bluetooth_obd_live') return 'obd2';
  if (telemetry.source === 'native_vehicle_live') return 'local-ble';
  return 'unknown';
}

export function buildObd2BluTelemetryEnvelope(
  telemetry: NormalizedVehicleTelemetry,
  options: BuildObd2BluTelemetryEnvelopeOptions = {},
): BluTelemetryEnvelope<Obd2BluTelemetryData> {
  const staleAfterMs = options.staleAfterMs ?? BLU_OBD2_REFERENCE_STALE_AFTER_MS;
  const liveAfterMs = options.liveAfterMs ?? BLU_OBD2_REFERENCE_LIVE_AFTER_MS;
  const data = getObd2BluTelemetryData(telemetry);
  const hasDecodedData = hasDecodedVehicleTelemetry(telemetry);
  const source = resolveObd2BluEnvelopeSource(telemetry);
  const health = resolveBluTelemetryHealth({
    timestamp: telemetry.timestamp,
    now: options.now,
    liveAfterMs,
    staleAfterMs,
    source,
    hasDecodedData,
  });
  const connectionStatus = mapVehicleConnectionStateToBluStatus(
    options.connectionState ?? (hasDecodedData ? 'connected' : 'disconnected'),
    { health, hasDecodedData },
  );

  return {
    deviceId: telemetry.device_id,
    vendor: options.vendor ?? 'obd2',
    deviceType: options.deviceType ?? 'obd2_adapter',
    connectionStatus,
    health,
    source,
    timestamp: Number(telemetry.timestamp ?? 0),
    staleAfterMs,
    data,
    error: options.error,
  };
}

export function buildUnavailableBluTelemetryEnvelope(
  input: {
    deviceId?: string | null;
    vendor?: string;
    deviceType?: string;
    connectionStatus?: BluConnectionStatus;
    source?: BluTelemetryEnvelopeSource;
    staleAfterMs?: number;
    error?: BluTelemetryEnvelopeError;
  } = {},
): BluTelemetryEnvelope {
  return {
    deviceId: input.deviceId ?? '',
    vendor: input.vendor ?? 'unknown',
    deviceType: input.deviceType ?? 'unknown',
    connectionStatus: input.connectionStatus ?? 'disconnected',
    health: 'unavailable',
    source: input.source ?? 'unknown',
    timestamp: 0,
    staleAfterMs: input.staleAfterMs ?? BLU_OBD2_REFERENCE_STALE_AFTER_MS,
    data: {},
    error: input.error,
  };
}

import type { BluTelemetry } from '../../lib/BluTypes';
import type { BluetoothAccessoryRecord } from '../../lib/bluetoothAccessoryRegistry';
import type { BluetoothTelemetrySource } from '../../lib/bluetoothLiveTelemetry';
import { identifyBluestackAccessorySensorProfile } from '../../lib/bluestack';
import type { PowerTelemetry } from '../power/types/PowerTelemetry';
import type { NormalizedVehicleTelemetry } from '../vehicle-telemetry/VehicleTelemetryTypes';
import type { ECSTelemetryEvent, ECSTelemetryQuality, ECSTelemetryTransport } from './ECSTelemetryTypes';

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function eventQuality(isLive: boolean, unavailable = false): ECSTelemetryQuality {
  if (unavailable) return 'unavailable';
  return isLive ? 'live' : 'stale';
}

function bluetoothSourceToTransport(source: BluetoothTelemetrySource | undefined): ECSTelemetryTransport {
  switch (source) {
    case 'ble_live':
      return 'ble';
    case 'provider_cloud':
      return 'cloud';
    case 'cache':
      return 'unknown';
    case 'mock_dev':
    case 'unavailable':
    default:
      return 'unknown';
  }
}

function powerSourceToTransport(source: PowerTelemetry['source'] | undefined): ECSTelemetryTransport {
  switch (source) {
    case 'ble':
      return 'ble';
    case 'cloud':
      return 'cloud';
    case 'wifi':
      return 'wifi';
    case 'gateway':
      return 'gateway';
    case 'sim':
    case 'mock_dev':
    case 'unavailable':
    default:
      return 'unknown';
  }
}

function pushNumberMetric(
  events: ECSTelemetryEvent[],
  base: Omit<ECSTelemetryEvent, 'metricKey' | 'label' | 'value' | 'unit'>,
  metricKey: string,
  label: string,
  value: unknown,
  unit: string | null,
): void {
  const normalized = finiteNumber(value);
  if (normalized == null) return;
  events.push({
    ...base,
    metricKey,
    label,
    value: normalized,
    unit,
  });
}

export function bluTelemetryToEcsTelemetryEvents(telemetry: BluTelemetry): ECSTelemetryEvent[] {
  if (!telemetry.device_id) return [];
  const timestamp = telemetry.timestamp || telemetry.updatedAt || Date.now();
  const source = telemetry.source ?? 'unavailable';
  const isLive = telemetry.isLive === true && telemetry.telemetryUnsupported !== true;
  const quality = eventQuality(isLive, telemetry.telemetryUnsupported === true);
  const base = {
    sourceDeviceId: telemetry.device_id,
    sourceDeviceName: telemetry.raw?.deviceName != null ? String(telemetry.raw.deviceName) : null,
    sourceType: 'power_device' as const,
    provider: telemetry.provider,
    providerLabel: null,
    timestamp,
    quality,
    transport: bluetoothSourceToTransport(source),
    errorSource: telemetry.telemetryUnsupported ? 'parser' as const : null,
    errorMessage: telemetry.telemetryUnsupportedReason ?? null,
  };
  const events: ECSTelemetryEvent[] = [];

  pushNumberMetric(events, base, 'battery_percent', 'Battery', telemetry.battery_percent, '%');
  pushNumberMetric(events, base, 'input_watts', 'Input', telemetry.input_watts, 'W');
  pushNumberMetric(events, base, 'input_volts', 'Input Voltage', telemetry.input_volts, 'V');
  pushNumberMetric(events, base, 'input_amps', 'Input Current', telemetry.input_amps, 'A');
  pushNumberMetric(events, base, 'output_watts', 'Output', telemetry.output_watts, 'W');
  pushNumberMetric(events, base, 'output_volts', 'Output Voltage', telemetry.output_volts, 'V');
  pushNumberMetric(events, base, 'output_amps', 'Output Current', telemetry.output_amps, 'A');
  pushNumberMetric(events, base, 'battery_watts', 'Net Battery', telemetry.battery_watts, 'W');
  pushNumberMetric(events, base, 'estimated_runtime_minutes', 'Runtime', telemetry.estimated_runtime_minutes, 'min');
  pushNumberMetric(events, base, 'solar_input_watts', 'Solar', telemetry.solar_input_watts, 'W');
  pushNumberMetric(events, base, 'ac_output_watts', 'AC Output', telemetry.ac_output_watts, 'W');
  pushNumberMetric(events, base, 'dc_output_watts', 'DC Output', telemetry.dc_output_watts, 'W');
  pushNumberMetric(events, base, 'temperature_celsius', 'Temperature', telemetry.temperature_celsius, 'C');
  pushNumberMetric(events, base, 'battery_volts', 'Battery Voltage', telemetry.battery_volts, 'V');
  pushNumberMetric(events, base, 'battery_amps', 'Battery Current', telemetry.battery_amps, 'A');
  pushNumberMetric(events, base, 'capacity_wh', 'Capacity', telemetry.capacity_wh, 'Wh');
  pushNumberMetric(events, base, 'signal_strength', 'Signal', telemetry.signal_strength, 'dBm');

  if (events.length === 0 && telemetry.telemetryUnsupported) {
    events.push({
      ...base,
      metricKey: 'telemetry_state',
      label: 'Telemetry State',
      value: null,
      unit: null,
    });
  }

  return events;
}

export function canonicalPowerTelemetryToEcsTelemetryEvents(telemetry: Partial<PowerTelemetry>): ECSTelemetryEvent[] {
  const deviceId = telemetry.device?.id;
  if (!deviceId) return [];
  const timestamp = telemetry.timestamp ?? Date.now();
  const truth = telemetry.truth;
  const isLive = telemetry.isLive === true || truth?.isLive === true;
  const quality = eventQuality(isLive, truth?.sourceTruth === 'unavailable');
  const base = {
    sourceDeviceId: deviceId,
    sourceDeviceName: telemetry.device?.model ?? null,
    sourceType: 'power_device' as const,
    provider: telemetry.device?.vendor ?? truth?.providerId ?? 'generic',
    providerLabel: null,
    timestamp,
    quality,
    transport: powerSourceToTransport(telemetry.source),
    errorSource: null,
    errorMessage: truth?.sourceTruth === 'unavailable' ? truth.reason ?? null : null,
  };
  const events: ECSTelemetryEvent[] = [];

  pushNumberMetric(events, base, 'battery_percent', 'Battery', telemetry.battery?.socPct, '%');
  pushNumberMetric(events, base, 'capacity_wh', 'Capacity', (telemetry as { capacityWh?: unknown }).capacityWh, 'Wh');
  pushNumberMetric(events, base, 'input_watts', 'Input', telemetry.battery?.wattsIn, 'W');
  pushNumberMetric(events, base, 'input_volts', 'Input Voltage', telemetry.inputVolts ?? telemetry.solar?.volts, 'V');
  pushNumberMetric(events, base, 'input_amps', 'Input Current', telemetry.inputAmps ?? telemetry.solar?.amps, 'A');
  pushNumberMetric(events, base, 'output_watts', 'Output', telemetry.battery?.wattsOut, 'W');
  pushNumberMetric(events, base, 'output_volts', 'Output Voltage', telemetry.outputVolts, 'V');
  pushNumberMetric(events, base, 'output_amps', 'Output Current', telemetry.outputAmps, 'A');
  pushNumberMetric(events, base, 'solar_input_watts', 'Solar', telemetry.solar?.watts, 'W');
  pushNumberMetric(events, base, 'temperature_celsius', 'Temperature', telemetry.battery?.tempC, 'C');
  pushNumberMetric(events, base, 'estimated_runtime_minutes', 'Runtime', telemetry.battery?.estRuntimeMin, 'min');
  pushNumberMetric(events, base, 'battery_volts', 'Battery Voltage', telemetry.battery?.volts, 'V');
  pushNumberMetric(events, base, 'battery_amps', 'Battery Current', telemetry.battery?.amps, 'A');

  return events;
}

export function vehicleTelemetryToEcsTelemetryEvents(telemetry: NormalizedVehicleTelemetry): ECSTelemetryEvent[] {
  if (!telemetry.device_id) return [];
  const timestamp = telemetry.timestamp || Date.now();
  const base = {
    sourceDeviceId: telemetry.device_id,
    sourceDeviceName: null,
    sourceType: 'obd2' as const,
    provider: telemetry.provider,
    providerLabel: 'OBD2',
    timestamp,
    quality: 'live' as const,
    transport: 'ble' as const,
    errorSource: null,
    errorMessage: null,
  };
  const events: ECSTelemetryEvent[] = [];

  pushNumberMetric(events, base, 'vehicle_speed', 'Vehicle Speed', telemetry.vehicle_speed, 'mph');
  pushNumberMetric(events, base, 'engine_rpm', 'Engine RPM', telemetry.engine_rpm, 'rpm');
  pushNumberMetric(events, base, 'coolant_temp', 'Coolant Temperature', telemetry.coolant_temp, 'F');
  pushNumberMetric(events, base, 'battery_voltage', 'Battery Voltage', telemetry.battery_voltage, 'V');
  pushNumberMetric(events, base, 'throttle_position', 'Throttle Position', telemetry.throttle_position, '%');
  pushNumberMetric(events, base, 'engine_load', 'Engine Load', telemetry.engine_load, '%');
  pushNumberMetric(events, base, 'fuel_level', 'Fuel Level', telemetry.fuel_level, '%');
  pushNumberMetric(events, base, 'intake_temp', 'Intake Temperature', telemetry.intake_temp, 'F');
  pushNumberMetric(events, base, 'oil_temp', 'Oil Temperature', telemetry.oil_temp, 'F');
  pushNumberMetric(events, base, 'transmission_temp', 'Transmission Temperature', telemetry.transmission_temp, 'F');
  const tireLabels = ['Front Left Tire Pressure', 'Front Right Tire Pressure', 'Rear Left Tire Pressure', 'Rear Right Tire Pressure'];
  (telemetry.tire_pressures ?? []).forEach((pressure, index) => {
    pushNumberMetric(events, base, `tire_pressure_${index + 1}`, tireLabels[index] ?? `Tire Pressure ${index + 1}`, pressure, 'psi');
  });

  for (const value of telemetry.obd2_values ?? []) {
    if (!Number.isFinite(value.value)) continue;
    events.push({
      sourceDeviceId: value.sourceDeviceId || telemetry.device_id,
      sourceDeviceName: null,
      sourceType: 'obd2',
      provider: telemetry.provider,
      providerLabel: 'OBD2',
      metricKey: `pid_${value.pid.toLowerCase()}`,
      label: value.label,
      value: value.value,
      unit: value.unit || null,
      timestamp: value.timestamp || timestamp,
      quality: value.quality === 'live' ? 'live' : value.quality === 'stale' ? 'stale' : 'error',
      transport: 'ble',
      errorSource: value.quality === 'parser_error' ? 'parser' : null,
      errorMessage: null,
    });
  }

  return events;
}

function isUtilitySensorAccessory(record: BluetoothAccessoryRecord): boolean {
  return (
    record.owner === 'sensor' &&
    (
      record.providerId === 'propane_monitor' ||
      record.providerId === 'water_monitor' ||
      record.categoryHint === 'propane_monitor' ||
      record.categoryHint === 'water_tank_monitor' ||
      /propane|water|fluid/i.test(`${record.providerLabel} ${record.categoryHint} ${record.displayName}`)
    )
  );
}

function accessoryQuality(record: BluetoothAccessoryRecord): ECSTelemetryQuality {
  if (record.connectionState === 'error') return 'error';
  if (record.connectionState === 'connected') {
    return finiteNumber(record.utilitySensorTelemetry?.levelPercent) != null ? 'live' : 'stale';
  }
  return 'unavailable';
}

export function bluetoothAccessoryToEcsTelemetryEvents(record: BluetoothAccessoryRecord): ECSTelemetryEvent[] {
  if (!record.deviceId || !isUtilitySensorAccessory(record)) return [];

  const profile = identifyBluestackAccessorySensorProfile(record);
  const timestamp = Date.parse(record.connectedAt ?? record.lastSeenAt) || Date.now();
  const quality = accessoryQuality(record);
  const isLiveLevel = quality === 'live';
  const parserStatus = record.connectionState === 'connected'
    ? record.utilitySensorTelemetry?.parserStatus ?? profile?.parserStatus ?? 'awaiting_level'
    : 'not_streaming';
  const base = {
    sourceDeviceId: record.deviceId,
    sourceDeviceName: record.displayName,
    sourceType: 'utility_sensor' as const,
    provider: record.providerId,
    providerLabel: record.providerLabel,
    timestamp,
    quality,
    transport: 'ble' as const,
    errorSource: isLiveLevel
      ? null
      : record.connectionState === 'connected'
        ? 'parser' as const
        : 'transport' as const,
    errorMessage: record.connectionState === 'connected'
      ? isLiveLevel
        ? null
        : profile?.detail ?? 'Sensor linked; ECS is waiting for a decoded fluid-level reading from this profile.'
      : record.lastError,
  };

  const events: ECSTelemetryEvent[] = [
    {
      ...base,
      metricKey: 'link_state',
      label: 'Sensor Link',
      value: record.connectionState,
      unit: null,
    },
    {
      ...base,
      metricKey: 'sensor_category',
      label: 'Sensor Category',
      value: profile?.category ?? record.categoryHint,
      unit: null,
    },
    {
      ...base,
      metricKey: 'profile_id',
      label: 'Sensor Profile',
      value: profile?.id ?? 'generic_utility_sensor',
      unit: null,
    },
    {
      ...base,
      metricKey: 'parser_status',
      label: 'Parser Status',
      value: parserStatus,
      unit: null,
    },
  ];

  pushNumberMetric(events, base, 'level_percent', 'Tank Level', record.utilitySensorTelemetry?.levelPercent, '%');
  pushNumberMetric(events, base, 'signal_strength', 'Signal', record.signalStrength, 'dBm');
  return events;
}

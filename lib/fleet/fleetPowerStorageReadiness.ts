import type { ECSPowerTelemetryDeviceReading } from '../../src/telemetry/ECSTelemetryTypes';

export type FleetPowerStorageReadiness = {
  hasLivePowerStorage: boolean;
  liveDeviceCount: number;
  primaryDeviceName: string | null;
  providerLabel: string | null;
};

function hasUsablePowerTelemetry(reading: ECSPowerTelemetryDeviceReading): boolean {
  return (
    reading.batteryPercent != null ||
    reading.capacityWh != null ||
    reading.inputWatts != null ||
    reading.outputWatts != null ||
    reading.solarWatts != null ||
    reading.estimatedRuntimeMinutes != null ||
    reading.batteryVolts != null ||
    reading.batteryWatts != null
  );
}

function isLiveBluetoothPowerReading(reading: ECSPowerTelemetryDeviceReading): boolean {
  return (
    reading.transport === 'ble' &&
    reading.quality === 'live' &&
    reading.isLive === true &&
    reading.isStale !== true &&
    hasUsablePowerTelemetry(reading)
  );
}

export function resolveFleetPowerStorageReadiness(
  readings: readonly ECSPowerTelemetryDeviceReading[] | null | undefined,
): FleetPowerStorageReadiness {
  const liveBluetoothReadings = (readings ?? []).filter(isLiveBluetoothPowerReading);
  const primary = liveBluetoothReadings[0] ?? null;
  return {
    hasLivePowerStorage: liveBluetoothReadings.length > 0,
    liveDeviceCount: liveBluetoothReadings.length,
    primaryDeviceName: primary?.deviceName ?? null,
    providerLabel: primary?.providerLabel ?? null,
  };
}

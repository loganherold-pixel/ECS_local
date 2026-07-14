import { useCallback, useEffect, useState } from 'react';
import { ecsTelemetryStore } from './ECSTelemetryStore';
import type {
  ECSPowerTelemetryDeviceReading,
  ECSTelemetrySnapshot,
  ECSTelemetrySourceType,
  ECSUtilitySensorTelemetryReading,
} from './ECSTelemetryTypes';

export function useECSTelemetrySnapshot(): ECSTelemetrySnapshot {
  const [, setRev] = useState(0);
  const bump = useCallback(() => setRev((rev) => rev + 1), []);

  useEffect(() => ecsTelemetryStore.subscribe(bump), [bump]);

  return ecsTelemetryStore.getSnapshot();
}

function useECSTelemetrySource(sourceType: ECSTelemetrySourceType): void {
  const [, setRev] = useState(0);
  const bump = useCallback(() => setRev((rev) => rev + 1), []);
  useEffect(() => ecsTelemetryStore.subscribeSource(sourceType, bump), [bump, sourceType]);
}

export function useECSPowerTelemetryReadings(): ECSPowerTelemetryDeviceReading[] {
  useECSTelemetrySource('power_device');
  return ecsTelemetryStore.getPowerDeviceReadings();
}

export function useECSUtilitySensorTelemetryReadings(): ECSUtilitySensorTelemetryReading[] {
  useECSTelemetrySource('utility_sensor');
  return ecsTelemetryStore.getUtilitySensorReadings();
}


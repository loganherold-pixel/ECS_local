import { useCallback, useEffect, useState } from 'react';
import { ecsTelemetryStore } from './ECSTelemetryStore';
import type {
  ECSPowerTelemetryDeviceReading,
  ECSTelemetrySnapshot,
  ECSUtilitySensorTelemetryReading,
} from './ECSTelemetryTypes';

export function useECSTelemetrySnapshot(): ECSTelemetrySnapshot {
  const [, setRev] = useState(0);
  const bump = useCallback(() => setRev((rev) => rev + 1), []);

  useEffect(() => ecsTelemetryStore.subscribe(bump), [bump]);

  useEffect(() => {
    const timer = setInterval(bump, 10_000);
    return () => clearInterval(timer);
  }, [bump]);

  return ecsTelemetryStore.getSnapshot();
}

export function useECSPowerTelemetryReadings(): ECSPowerTelemetryDeviceReading[] {
  useECSTelemetrySnapshot();
  return ecsTelemetryStore.getPowerDeviceReadings();
}

export function useECSUtilitySensorTelemetryReadings(): ECSUtilitySensorTelemetryReading[] {
  useECSTelemetrySnapshot();
  return ecsTelemetryStore.getUtilitySensorReadings();
}


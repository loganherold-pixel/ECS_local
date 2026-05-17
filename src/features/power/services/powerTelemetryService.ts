import { useEcoFlowLive } from "../../../../lib/useEcoFlowLive";
import {
  getSelectedEcoFlowDevice,
  getSelectedEcoFlowDeviceName,
  setSelectedEcoFlowDevice,
} from "../../../../lib/ecoFlowSelectionStore";
import { useEcsProviders } from "../../../../lib/useEcsProviders";
import {
  getEcoFlowPerDeviceTelemetry,
  getSelectedEcoFlowPowerDeviceIds,
  listEcoFlowPowerDevices,
  setSelectedEcoFlowPowerDevice,
} from "../adapters/ecoflowAdapter";
import { getPowerAdapter, getPowerAdapters } from "./powerDiscoveryService";
import type {
  PowerAdapterProviderId,
  PowerDeviceCatalogEntry,
  PowerDiscoveredDevice,
  PowerTelemetry,
} from "../types/powerTypes";

export function usePowerTelemetryControls() {
  const providers = useEcsProviders();
  return {
    refreshTelemetry: providers.refreshAll,
    isTelemetryPolling: providers.isAnyPolling,
    providerSummaries: providers.providerSummaries,
    deviceSummaries: providers.deviceSummaries,
  };
}

export function useEcoFlowPowerLive() {
  return useEcoFlowLive();
}

export async function readPowerTelemetry(
  providerId: PowerAdapterProviderId,
  deviceId?: string,
): Promise<PowerTelemetry | null> {
  return getPowerAdapter(providerId)?.readTelemetry(deviceId) ?? null;
}

export async function readAllPowerTelemetry(): Promise<PowerTelemetry[]> {
  const readings = await Promise.all(getPowerAdapters().map((adapter) => adapter.readTelemetry()));
  return readings.filter(Boolean) as PowerTelemetry[];
}

export async function getEcoFlowPowerDeviceCatalog(): Promise<PowerDeviceCatalogEntry[]> {
  return listEcoFlowPowerDevices();
}

export function getEcoFlowPowerTelemetryDevices(): PowerDiscoveredDevice[] {
  return getEcoFlowPerDeviceTelemetry();
}

export async function getSelectedEcoFlowPowerDevices(): Promise<string[]> {
  return getSelectedEcoFlowPowerDeviceIds();
}

export function getPrimaryEcoFlowPowerDevice(): string | null {
  return getSelectedEcoFlowDevice();
}

export function getPrimaryEcoFlowPowerDeviceName(): string | null {
  return getSelectedEcoFlowDeviceName();
}

export function setPrimaryEcoFlowPowerDevice(deviceId: string | null, deviceName: string | null = null): void {
  setSelectedEcoFlowDevice(deviceId, deviceName);
  void setSelectedEcoFlowPowerDevice(deviceId).catch(() => {});
}

export const powerTelemetryService = {
  readPowerTelemetry,
  readAllPowerTelemetry,
  getEcoFlowPowerDeviceCatalog,
  getEcoFlowPowerTelemetryDevices,
  getSelectedEcoFlowPowerDevices,
  getPrimaryEcoFlowPowerDevice,
  getPrimaryEcoFlowPowerDeviceName,
  setPrimaryEcoFlowPowerDevice,
};


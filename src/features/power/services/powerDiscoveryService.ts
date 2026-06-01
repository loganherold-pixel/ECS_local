import { ankerSolixAdapter } from "../adapters/ankerSolixAdapter";
import { bluettiAdapter } from "../adapters/bluettiAdapter";
import { ecoflowAdapter } from "../adapters/ecoflowAdapter";
import { manualPowerAdapter } from "../adapters/manualPowerAdapter";
import type {
  PowerAdapter,
  PowerAdapterProviderId,
  PowerDiscoveredDevice,
} from "../types/powerTypes";

const adapters: PowerAdapter[] = [
  ecoflowAdapter,
  bluettiAdapter,
  ankerSolixAdapter,
  manualPowerAdapter,
];

export function getPowerAdapters(): PowerAdapter[] {
  return adapters.slice();
}

export function getPowerAdapter(providerId: PowerAdapterProviderId): PowerAdapter | null {
  return adapters.find((adapter) => adapter.providerId === providerId) ?? null;
}

export async function discoverPowerDevices(providerId?: PowerAdapterProviderId): Promise<PowerDiscoveredDevice[]> {
  void providerId;
  return [];
}

export const powerDiscoveryService = {
  getPowerAdapters,
  getPowerAdapter,
  discoverPowerDevices,
};

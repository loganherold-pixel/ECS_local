import { setupStore } from './setupStore';
import { vehicleSetupStore } from './vehicleSetupStore';
import { vehicleStore } from './vehicleStore';

export type ConfiguredVehiclePresence = {
  hasConfiguredVehicle: boolean;
  localVehicleCount: number;
  activeVehicleId: string | null;
  setupVehicleId: string | null;
  activeVehicleExists: boolean;
  setupVehicleExists: boolean;
};

export function resolveConfiguredVehiclePresence(): ConfiguredVehiclePresence {
  const localVehicles = vehicleStore.getLocalSnapshot();
  const localVehicleIds = new Set(localVehicles.map((vehicle) => vehicle.id));
  const activeVehicleId = vehicleSetupStore.getActiveVehicleId();
  const setupVehicleId = setupStore.getSetupVehicleId();
  const activeVehicleExists = !!(activeVehicleId && localVehicleIds.has(activeVehicleId));
  const setupVehicleExists = !!(setupVehicleId && localVehicleIds.has(setupVehicleId));
  const hasConfiguredVehicle =
    localVehicles.length > 0 || activeVehicleExists || setupVehicleExists;

  return {
    hasConfiguredVehicle,
    localVehicleCount: localVehicles.length,
    activeVehicleId,
    setupVehicleId,
    activeVehicleExists,
    setupVehicleExists,
  };
}

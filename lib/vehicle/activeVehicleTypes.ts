import type { ConsumablesState } from '../consumablesStore';
import type { FleetFabricServicePayload } from '../fleet/fleetFabricService';
import type {
  ECSVehicleCapabilitySnapshot,
  ECSVehicleIntelligenceSnapshot,
  ECSVehicleWeightSnapshot,
  ECSVehicularState,
} from '../fleet/activeVehicleState';
import type { LocalLoadout, LocalLoadoutItem } from '../loadoutStore';
import type { TiresLiftConfig } from '../tiresLiftStore';
import type { Vehicle } from '../types';
import type { VehicleResourceProfile } from '../vehicleResourceProfile';
import type { VehicleSpec } from '../vehicleSpecStore';

export type VehicleWithExtensions = Vehicle & {
  wizard_config?: Record<string, any> | null;
  accessoryFramework?: any;
  containerZones?: any[] | null;
};

export interface ActiveVehicleContext {
  activeVehicleId: string | null;
  hasActiveVehicleId: boolean;
  vehicle: VehicleWithExtensions | null;
  spec: VehicleSpec | null;
  consumables: ConsumablesState | null;
  tiresLift: TiresLiftConfig | null;
  resourceProfile: VehicleResourceProfile;
  accessoryFramework: any | null;
  containerZones: any[];
  accessorySummary: { label: string; status: string; color: string }[];
  accessoryInstalledCount: number;
  accessoryPlannedCount: number;
  zoneSummary: string;
  loadout: LocalLoadout | null;
  loadoutItems: LocalLoadoutItem[];
  loadoutItemCount: number;
  loadoutTotalWeightLbs: number;
  vehicleState: ECSVehicularState;
  weightSnapshot: ECSVehicleWeightSnapshot;
  capabilitySnapshot: ECSVehicleCapabilitySnapshot;
  intelligenceSnapshot: ECSVehicleIntelligenceSnapshot;
  fleetFabricPayload: FleetFabricServicePayload | null;
  wizardConfig: Record<string, any> | null;
  hasVehicleRecord: boolean;
  hasVehicleContext: boolean;
  profileSignature: string;
}

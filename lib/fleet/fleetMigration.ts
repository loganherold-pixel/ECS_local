import { normalizeFleetBuildLoadoutState } from './fleetBuildLoadout';
import { normalizeFleetChecklistState } from './fleetChecklist';
import {
  adaptLegacyVehicleToFleetVehicle,
  calculateFleetWeightResult,
  scoreFleetVehicle,
  type FleetVehicle,
  type FleetWeightResult,
  type FleetScoringResult,
} from './fleetPremiumDomain';
import { generatePremiumFleetFabricPayload, type FleetFabricServicePayload } from './fleetFabricService';

export const FLEET_PREMIUM_MIGRATION_VERSION = 'fleet-premium-2026-04';

type LegacyVehicleLike = {
  id: string;
  owner_user_id?: string | null;
  ownerUserId?: string | null;
  name?: string | null;
  type?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  wizard_config?: Record<string, unknown> | null;
};

type LegacySpecLike = {
  gvwr_lb?: number | null;
  base_weight_lb?: number | null;
  curb_weight_lb?: number | null;
  empty_weight_lb?: number | null;
  front_base_weight_lb?: number | null;
  rear_base_weight_lb?: number | null;
  front_gawr_lb?: number | null;
  rear_gawr_lb?: number | null;
  cab?: string | null;
  bed_length?: string | null;
  trim?: string | null;
  engine?: string | null;
  drivetrain?: string | null;
};

export type FleetPremiumMigrationInput = {
  vehicle: LegacyVehicleLike;
  specs?: LegacySpecLike | null;
  now?: string;
};

export type FleetPremiumMigrationResult = {
  migrationVersion: typeof FLEET_PREMIUM_MIGRATION_VERSION;
  vehicle: FleetVehicle;
  weightResult: FleetWeightResult;
  scoringResult: FleetScoringResult;
  fabricPayload: FleetFabricServicePayload;
  vehiclePatch: {
    wizard_config: Record<string, unknown>;
  };
};

export function migrateLegacyVehicleToFleetPremium(
  input: FleetPremiumMigrationInput,
): FleetPremiumMigrationResult {
  const existingWizardConfig =
    input.vehicle.wizard_config && typeof input.vehicle.wizard_config === 'object'
      ? input.vehicle.wizard_config
      : {};
  const vehicle = adaptLegacyVehicleToFleetVehicle({
    vehicle: input.vehicle,
    specs: input.specs,
    now: input.now,
  });
  const buildLoadoutState = normalizeFleetBuildLoadoutState(existingWizardConfig.fleet_build_loadout);
  const checklistState = normalizeFleetChecklistState(existingWizardConfig.fleet_checklist);
  const weightResult = calculateFleetWeightResult(vehicle, [], []);
  const scoringResult = scoreFleetVehicle(vehicle, weightResult, []);
  const fabricPayload = generatePremiumFleetFabricPayload({
    vehicle,
    weightResult,
    scoringResult,
    checklistState,
    generatedAt: input.now,
  });

  return {
    migrationVersion: FLEET_PREMIUM_MIGRATION_VERSION,
    vehicle,
    weightResult,
    scoringResult,
    fabricPayload,
    vehiclePatch: {
      wizard_config: {
        ...existingWizardConfig,
        fleet_premium_migration_version: FLEET_PREMIUM_MIGRATION_VERSION,
        fleet_build_profile: vehicle.buildProfile,
        fleet_build_loadout: buildLoadoutState,
        fleet_checklist: checklistState,
      },
    },
  };
}

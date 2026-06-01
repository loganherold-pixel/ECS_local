export type FleetAdvancedSpecsDraft = {
  suspensionLiftInches: number;
  isLeveled: boolean;
  frontLevelInches: number | null;
  tireSizeInches: number | null;
  waterGallons: string;
  fuelGallons: string;
};

export type FleetAdvancedSpecsNormalized = {
  suspensionLiftInches: number;
  isLeveled: boolean;
  frontLevelInches: number | null;
  tireSizeInches: number;
  waterGallons: number;
  fuelGallons: number;
};

export const FLEET_ADVANCED_SUSPENSION_HEIGHT_OPTIONS = Array.from({ length: 11 }, (_, value) => value);
export const FLEET_ADVANCED_FRONT_LEVEL_OPTIONS = [1, 2, 3, 4];
export const FLEET_ADVANCED_TIRE_SIZE_OPTIONS = Array.from({ length: 35 }, (_, index) => index + 26);

export function parseFleetAdvancedNonNegativeDecimal(value: string): number | null {
  const normalized = String(value).replace(/,/g, '').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function formatFleetAdvancedGallonsInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(Math.round(value * 10) / 10);
}

export function validateFleetAdvancedSpecsDraft(draft: FleetAdvancedSpecsDraft): string[] {
  const errors: string[] = [];
  const frontLevelInches = draft.frontLevelInches;
  const tireSizeInches = draft.tireSizeInches;
  if (!Number.isInteger(draft.suspensionLiftInches) || draft.suspensionLiftInches < 0 || draft.suspensionLiftInches > 10) {
    errors.push('Suspension height must be 0-10 inches.');
  }
  if (draft.isLeveled && (!Number.isInteger(frontLevelInches) || frontLevelInches == null || frontLevelInches < 1 || frontLevelInches > 4)) {
    errors.push('Select a front suspension level amount from 1-4 inches.');
  }
  if (!Number.isInteger(tireSizeInches) || tireSizeInches == null || tireSizeInches < 26 || tireSizeInches > 60) {
    errors.push('Tire size must be 26-60 inches.');
  }
  if (parseFleetAdvancedNonNegativeDecimal(draft.waterGallons) == null) {
    errors.push('Water gallons must be numeric and non-negative.');
  }
  if (parseFleetAdvancedNonNegativeDecimal(draft.fuelGallons) == null) {
    errors.push('Fuel gallons must be numeric and non-negative.');
  }
  return errors;
}

export function normalizeFleetAdvancedSpecsDraftForSave(
  draft: FleetAdvancedSpecsDraft,
): FleetAdvancedSpecsNormalized | null {
  if (validateFleetAdvancedSpecsDraft(draft).length > 0 || draft.tireSizeInches == null) {
    return null;
  }

  return {
    suspensionLiftInches: draft.suspensionLiftInches,
    isLeveled: draft.isLeveled,
    frontLevelInches: draft.isLeveled ? draft.frontLevelInches : null,
    tireSizeInches: draft.tireSizeInches,
    waterGallons: parseFleetAdvancedNonNegativeDecimal(draft.waterGallons) ?? 0,
    fuelGallons: parseFleetAdvancedNonNegativeDecimal(draft.fuelGallons) ?? 0,
  };
}

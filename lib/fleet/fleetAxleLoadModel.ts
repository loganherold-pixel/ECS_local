import type { FleetLoadZone } from './fleetPremiumDomain';

export const FLEET_FRONT_AXLE_X = 0.22;
export const FLEET_REAR_AXLE_X = 0.72;
export const FLEET_NORMALIZED_WHEELBASE = FLEET_REAR_AXLE_X - FLEET_FRONT_AXLE_X;

export const FLEET_AXLE_LOAD_ZONE_X: Record<FleetLoadZone, number> = {
  frontLow: 0.14,
  rearLow: 0.78,
  bedLow: 0.70,
  bedHigh: 0.70,
  roof: 0.48,
  cab: 0.36,
  underbody: 0.50,
  hitch: 0.94,
  trailer: 0.98,
};

export type FleetAxleLoadModule = {
  id?: string | null;
  label?: string | null;
  weightLb: number;
  x: number;
};

export type FleetAxleLoadEstimate = {
  frontAxleLoadLb: number;
  rearAxleLoadLb: number;
  frontAxlePercent: number;
  rearAxlePercent: number;
  longitudinalCgX: number;
  visualLongitudinalCgX: number;
  frontOverhangWeightLb: number;
  rearOverhangWeightLb: number;
  warnings: string[];
  stability: 'balanced' | 'moderate_rear' | 'extreme_rear';
};

function safePositive(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundedPercent(value: number): number {
  return Math.round(value * 100);
}

export function estimateFleetAxleLoad(input: {
  baseWeightLb: number;
  baseFrontAxleFraction: number;
  modules?: readonly FleetAxleLoadModule[];
  frontGawrLb?: number | null;
  rearGawrLb?: number | null;
}): FleetAxleLoadEstimate {
  const baseWeightLb = safePositive(input.baseWeightLb);
  const baseFrontAxleFraction = clamp(input.baseFrontAxleFraction, 0, 1);
  let totalWeightLb = baseWeightLb;
  let frontAxleLoadLb = baseWeightLb * baseFrontAxleFraction;
  let rearAxleLoadLb = baseWeightLb - frontAxleLoadLb;
  let frontOverhangWeightLb = 0;
  let rearOverhangWeightLb = 0;

  for (const module of input.modules ?? []) {
    const weightLb = safePositive(module.weightLb);
    if (weightLb <= 0) continue;
    const x = Number.isFinite(module.x) ? module.x : 0.5;
    const rearShare = (x - FLEET_FRONT_AXLE_X) / FLEET_NORMALIZED_WHEELBASE;
    const frontShare = 1 - rearShare;

    totalWeightLb += weightLb;
    frontAxleLoadLb += weightLb * frontShare;
    rearAxleLoadLb += weightLb * rearShare;
    if (x < FLEET_FRONT_AXLE_X) frontOverhangWeightLb += weightLb;
    if (x > FLEET_REAR_AXLE_X) rearOverhangWeightLb += weightLb;
  }

  const rearAxleFraction = totalWeightLb > 0 ? rearAxleLoadLb / totalWeightLb : 0.5;
  const frontAxleFraction = totalWeightLb > 0 ? frontAxleLoadLb / totalWeightLb : 0.5;
  const longitudinalCgX = FLEET_FRONT_AXLE_X + rearAxleFraction * FLEET_NORMALIZED_WHEELBASE;
  const visualLongitudinalCgX = clamp(longitudinalCgX, 0, 1);
  const rearAxlePercent = roundedPercent(rearAxleFraction);
  const frontAxlePercent = roundedPercent(frontAxleFraction);
  const warnings: string[] = [];
  const frontGawrLb = safePositive(input.frontGawrLb);
  const rearGawrLb = safePositive(input.rearGawrLb);

  if (frontOverhangWeightLb > 0) {
    warnings.push('Front overhang load is transferring weight off the rear axle. Verify front GAWR when bumper, winch, or front-low hardware is heavy.');
  }
  if (rearOverhangWeightLb > 0) {
    warnings.push('Rear overhang or hitch load is transferring weight off the front axle and onto the rear axle. Verify rear GAWR and hitch/tongue ratings.');
  }
  if (frontGawrLb > 0) {
    const frontUsage = frontAxleLoadLb / frontGawrLb;
    if (frontUsage >= 1) {
      warnings.push(`Estimated front axle load exceeds front GAWR (${Math.round(frontGawrLb).toLocaleString()} lb).`);
    } else if (frontUsage >= 0.9) {
      warnings.push(`Estimated front axle load is above 90% of front GAWR (${Math.round(frontGawrLb).toLocaleString()} lb).`);
    }
  }
  if (rearGawrLb > 0) {
    const rearUsage = rearAxleLoadLb / rearGawrLb;
    if (rearUsage >= 1) {
      warnings.push(`Estimated rear axle load exceeds rear GAWR (${Math.round(rearGawrLb).toLocaleString()} lb).`);
    } else if (rearUsage >= 0.9) {
      warnings.push(`Estimated rear axle load is above 90% of rear GAWR (${Math.round(rearGawrLb).toLocaleString()} lb).`);
    }
  }

  return {
    frontAxleLoadLb: rounded(frontAxleLoadLb),
    rearAxleLoadLb: rounded(rearAxleLoadLb),
    frontAxlePercent,
    rearAxlePercent,
    longitudinalCgX,
    visualLongitudinalCgX,
    frontOverhangWeightLb: rounded(frontOverhangWeightLb),
    rearOverhangWeightLb: rounded(rearOverhangWeightLb),
    warnings: Array.from(new Set(warnings)),
    stability:
      rearAxlePercent > 75
        ? 'extreme_rear'
        : rearAxlePercent > 65
          ? 'moderate_rear'
          : 'balanced',
  };
}

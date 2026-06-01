// ============================================================
// RIG COMPATIBILITY ENGINE — Vehicle × Expedition Scoring
// ============================================================
// Calculates how compatible a given expedition opportunity is
// with the user's configured vehicle.
//
// Score: 0–100 weighted composite (6 factors)
//   terrainMatch        30%
//   fuelRangeCoverage   25%
//   vehicleCapability   20%
//   tireSizeMatch       15%
//   suspensionLiftMatch 10%
//
// Difficulty Rating (for user's rig):
//   90–100 = Easy
//   70–89  = Moderate
//   40–69  = Hard
//   0–39   = Extreme
//
// Data Sources:
//   vehicleSpecStore    → GVWR, base_weight_lb, fuel_tank_capacity_gal, fuel_type
//   vehicleSetupStore   → active vehicle ID
//   vehicleStore        → vehicle record (avg_mpg, water_capacity_gal, type, make, model)
//   tiresLiftStore      → tireSizeInches, suspensionLiftInches, isLeveled, frontLevelInches
// ============================================================

import { vehicleSpecStore } from './vehicleSpecStore';
import { getVehicleResourceProfile } from './vehicleResourceProfile';
import { vehicleStore } from './vehicleStore';
import { vehicleSetupStore } from './vehicleSetupStore';
import { tiresLiftStore } from './tiresLiftStore';
import type { ECSConfidenceResult } from './ai/confidenceTypes';
import { assessVehicleAssessmentConfidence } from './ai/confidenceEngine';
import { explainRecommendation } from './ai/recommendationExplanationEngine';
import type { ECSExplanationResult } from './ai/recommendationExplanationTypes';

const TAG = '[RIG-COMPAT]';
const DEBUG_RIG_COMPAT =
  __DEV__ &&
  ((globalThis as typeof globalThis & { __ECS_DEBUG_RIG_COMPAT__?: boolean })
    .__ECS_DEBUG_RIG_COMPAT__ === true);
let hasLoggedMissingVehicleProfile = false;

function debugRigCompat(message: string): void {
  if (!DEBUG_RIG_COMPAT) return;
  console.log(TAG, message);
}

// ── Minimal Expedition Shape ────────────────────────────────
// Defined here to avoid circular import with discoverEngine.
// Any object with these fields can be scored.
export interface CompatibilityExpedition {
  id: string;
  name: string;
  distanceMiles: number;
  terrainType: string;
  remotenessScore: number;
  estimatedFuelRequired: number;
  elevationGainFt: number;
  // ── Terrain requirement fields (optional for backward compat) ──
  recommendedTireSize?: number;     // inches (e.g. 33, 35)
  recommendedLift?: number;         // inches (e.g. 2, 3)
  terrainDifficulty?: number;       // 1–10 scale
}

// ── Vehicle Profile ─────────────────────────────────────────
export interface VehicleProfile {
  vehicleId: string;
  vehicleName: string;
  vehicleType: string;
  make: string | null;
  model: string | null;
  gvwr_lb: number;
  base_weight_lb: number;
  fuel_tank_capacity_gal: number;
  fuel_type: 'diesel' | 'gas';
  avg_mpg: number;
  water_capacity_gal: number;
  payload_capacity_lb: number;
  fuel_range_miles: number;
  // ── Tires / Lift fields ──
  tireSizeInches: number;           // 0 = not configured / stock
  suspensionLiftInches: number;     // 0 = stock
  isLeveled: boolean;
  frontLevelInches: number | null;
}

// ── Compatibility Result ────────────────────────────────────
export interface CompatibilityResult {
  score: number;
  difficultyRating: DifficultyRating;
  factors: CompatibilityFactors;
  isFullScore: boolean;
  confidence: ECSConfidenceResult;
  notes: string[];
  explanation?: ECSExplanationResult | null;
}

export interface CompatibilityFactors {
  terrainMatch: number;
  fuelRangeCoverage: number;
  vehicleCapability: number;
  tireSizeMatch: number;
  suspensionLiftMatch: number;
}

export type DifficultyRating = 'EASY' | 'MODERATE' | 'HARD' | 'EXTREME';

// ── Weights (6-factor model) ────────────────────────────────
const W_TERRAIN    = 0.30;
const W_FUEL       = 0.25;
const W_CAPABILITY = 0.20;
const W_TIRE_SIZE  = 0.15;
const W_SUSPENSION = 0.10;

// ── Difficulty Thresholds ───────────────────────────────────
export function getDifficultyRating(score: number): DifficultyRating {
  if (score >= 90) return 'EASY';
  if (score >= 70) return 'MODERATE';
  if (score >= 40) return 'HARD';
  return 'EXTREME';
}

export function getDifficultyColor(rating: DifficultyRating): string {
  switch (rating) {
    case 'EASY':     return '#66BB6A';
    case 'MODERATE': return '#D4A017';
    case 'HARD':     return '#E67E22';
    case 'EXTREME':  return '#E04030';
  }
}

export function getCompatibilityColor(score: number): string {
  if (score >= 90) return '#66BB6A';
  if (score >= 70) return '#D4A017';
  if (score >= 40) return '#E67E22';
  return '#E04030';
}

// ============================================================
// FACTOR CALCULATIONS
// ============================================================

function calculateTerrainMatch(
  profile: VehicleProfile,
  opp: CompatibilityExpedition,
): number {
  const terrain = opp.terrainType.toLowerCase();

  const MATRIX: Record<string, Record<string, number>> = {
    truck: {
      desert: 90, sand: 85, rock: 80, canyon: 88,
      alpine: 75, mountain: 82, forest: 85, gravel: 92,
      mixed: 88, pass: 78,
    },
    suv_van: {
      desert: 80, sand: 70, rock: 65, canyon: 78,
      alpine: 70, mountain: 78, forest: 82, gravel: 88,
      mixed: 85, pass: 72,
    },
    jeep: {
      desert: 92, sand: 88, rock: 95, canyon: 90,
      alpine: 82, mountain: 88, forest: 80, gravel: 85,
      mixed: 88, pass: 85,
    },
    car_crossover: {
      desert: 50, sand: 35, rock: 30, canyon: 45,
      alpine: 40, mountain: 55, forest: 65, gravel: 75,
      mixed: 65, pass: 45,
    },
  };

  let matrixKey = resolveMatrixKey(profile);
  const affinities = MATRIX[matrixKey] || MATRIX.truck;

  let bestScore = 60;
  for (const [keyword, score] of Object.entries(affinities)) {
    if (terrain.includes(keyword)) {
      bestScore = Math.max(bestScore, score);
    }
  }

  if (opp.elevationGainFt > 8000 && matrixKey === 'car_crossover') {
    bestScore = Math.max(20, bestScore - 15);
  }

  return clamp(bestScore, 0, 100);
}

function calculateFuelRangeCoverage(
  profile: VehicleProfile,
  opp: CompatibilityExpedition,
): number {
  if (!profile.fuel_tank_capacity_gal || !profile.avg_mpg) return 50;

  const distance = opp.distanceMiles;
  if (distance <= 0) return 100;

  const terrain = opp.terrainType.toLowerCase();
  let penalty = 1.0;
  if (terrain.includes('alpine') || terrain.includes('mountain') || terrain.includes('pass')) penalty = 0.80;
  else if (terrain.includes('desert') || terrain.includes('sand')) penalty = 0.85;
  else if (terrain.includes('rock') || terrain.includes('canyon')) penalty = 0.82;
  else if (terrain.includes('forest') || terrain.includes('gravel')) penalty = 0.92;

  const effectiveRange = profile.fuel_range_miles * penalty;
  const ratio = effectiveRange / distance;

  if (ratio >= 2.0) return 100;
  if (ratio >= 1.5) return 90 + ((ratio - 1.5) / 0.5) * 10;
  if (ratio >= 1.2) return 80 + ((ratio - 1.2) / 0.3) * 10;
  if (ratio >= 1.0) return 60 + ((ratio - 1.0) / 0.2) * 20;
  return clamp(Math.round(ratio * 60), 0, 59);
}

function calculateVehicleCapability(
  profile: VehicleProfile,
  opp: CompatibilityExpedition,
): number {
  if (!profile.gvwr_lb) return 55;

  let base: number;
  if (profile.gvwr_lb >= 10000) base = 95;
  else if (profile.gvwr_lb >= 8000) base = 85 + ((profile.gvwr_lb - 8000) / 2000) * 10;
  else if (profile.gvwr_lb >= 6000) base = 70 + ((profile.gvwr_lb - 6000) / 2000) * 15;
  else if (profile.gvwr_lb >= 5000) base = 55 + ((profile.gvwr_lb - 5000) / 1000) * 15;
  else base = 35 + (profile.gvwr_lb / 5000) * 20;

  if (profile.payload_capacity_lb > 2000) base += 5;
  else if (profile.payload_capacity_lb > 1000) base += 3;

  const diff = (opp.remotenessScore / 10) * 0.3 + (Math.min(opp.elevationGainFt, 12000) / 12000) * 0.2;
  if (base < 70) base -= diff * 15;

  return clamp(Math.round(base), 0, 100);
}

// ── NEW: Tire Size Match Factor ─────────────────────────────
// Compares vehicle tire size against trail recommended tire size.
// If no tire data is configured, returns a neutral score based on
// vehicle type defaults.
function calculateTireSizeMatch(
  profile: VehicleProfile,
  opp: CompatibilityExpedition,
): number {
  const recommendedSize = opp.recommendedTireSize || getDefaultRecommendedTireSize(opp);
  const vehicleTireSize = profile.tireSizeInches;

  // If tire size not configured, use stock estimates by vehicle type
  if (!vehicleTireSize || vehicleTireSize <= 0) {
    const stockSize = getStockTireSize(profile.vehicleType);
    return scoreTireSize(stockSize, recommendedSize, opp.terrainType);
  }

  return scoreTireSize(vehicleTireSize, recommendedSize, opp.terrainType);
}

function scoreTireSize(
  vehicleSize: number,
  recommendedSize: number,
  terrainType: string,
): number {
  if (recommendedSize <= 0) return 75; // no requirement → neutral

  const diff = vehicleSize - recommendedSize;
  const terrain = terrainType.toLowerCase();

  // Vehicle meets or exceeds recommendation
  if (diff >= 4) return 100;      // well above
  if (diff >= 2) return 95;       // above
  if (diff >= 0) return 90;       // meets exactly

  // Vehicle is below recommendation
  const deficit = Math.abs(diff);

  // Terrain-aware penalty: rocky/alpine terrain penalizes more
  let penaltyMultiplier = 1.0;
  if (terrain.includes('rock') || terrain.includes('canyon')) penaltyMultiplier = 1.4;
  else if (terrain.includes('alpine') || terrain.includes('mountain') || terrain.includes('pass')) penaltyMultiplier = 1.2;
  else if (terrain.includes('sand') || terrain.includes('desert')) penaltyMultiplier = 1.1;

  const penalty = deficit * 8 * penaltyMultiplier;
  return clamp(Math.round(90 - penalty), 15, 89);
}

function getDefaultRecommendedTireSize(opp: CompatibilityExpedition): number {
  const terrain = opp.terrainType.toLowerCase();
  const difficulty = opp.terrainDifficulty || 5;

  if (terrain.includes('rock') || terrain.includes('canyon')) {
    return difficulty >= 8 ? 35 : difficulty >= 5 ? 33 : 31;
  }
  if (terrain.includes('alpine') || terrain.includes('mountain') || terrain.includes('pass')) {
    return difficulty >= 7 ? 33 : 31;
  }
  if (terrain.includes('sand') || terrain.includes('desert')) {
    return difficulty >= 7 ? 33 : 31;
  }
  if (terrain.includes('forest') || terrain.includes('gravel')) {
    return difficulty >= 8 ? 33 : 29;
  }
  return 31; // default
}

function getStockTireSize(vehicleType: string): number {
  switch (vehicleType) {
    case 'jeep': return 33;
    case 'truck': return 31;
    case 'suv_van': return 31;
    case 'car_crossover': return 27;
    default: return 29;
  }
}

// ── NEW: Suspension Lift Match Factor ───────────────────────
// Compares vehicle suspension lift against trail recommended lift.
// Leveled vehicles get a small bonus over pure stock.
function calculateSuspensionLiftMatch(
  profile: VehicleProfile,
  opp: CompatibilityExpedition,
): number {
  const recommendedLift = opp.recommendedLift || getDefaultRecommendedLift(opp);
  const vehicleLift = profile.suspensionLiftInches;
  const isLeveled = profile.isLeveled;
  const frontLevelInches = profile.frontLevelInches ?? 0;

  const levelBonus = isLeveled
    ? Math.max(0.5, Math.min(4, frontLevelInches > 0 ? frontLevelInches : 1) * 0.25)
    : 0;
  const effectiveLift = vehicleLift + (vehicleLift === 0 ? levelBonus : Math.min(levelBonus, 0.5));

  return scoreSuspensionLift(effectiveLift, recommendedLift, opp.terrainType, opp.elevationGainFt);
}

function scoreSuspensionLift(
  vehicleLift: number,
  recommendedLift: number,
  terrainType: string,
  elevationGainFt: number,
): number {
  if (recommendedLift <= 0) return 80; // no requirement → slightly above neutral

  const diff = vehicleLift - recommendedLift;
  const terrain = terrainType.toLowerCase();

  // Vehicle meets or exceeds recommendation
  if (diff >= 3) return 100;      // well above
  if (diff >= 1) return 95;       // above
  if (diff >= 0) return 88;       // meets exactly

  // Vehicle is below recommendation
  const deficit = Math.abs(diff);

  // Terrain-aware penalty
  let penaltyMultiplier = 1.0;
  if (terrain.includes('rock') || terrain.includes('canyon')) penaltyMultiplier = 1.5;
  else if (terrain.includes('alpine') || terrain.includes('mountain') || terrain.includes('pass')) penaltyMultiplier = 1.3;
  else if (terrain.includes('sand') || terrain.includes('desert')) penaltyMultiplier = 1.0;

  // High elevation gain also penalizes more
  if (elevationGainFt > 8000) penaltyMultiplier += 0.2;

  const penalty = deficit * 12 * penaltyMultiplier;
  return clamp(Math.round(88 - penalty), 10, 87);
}

function getDefaultRecommendedLift(opp: CompatibilityExpedition): number {
  const terrain = opp.terrainType.toLowerCase();
  const difficulty = opp.terrainDifficulty || 5;

  if (terrain.includes('rock') || terrain.includes('canyon')) {
    return difficulty >= 8 ? 4 : difficulty >= 5 ? 2 : 0;
  }
  if (terrain.includes('alpine') || terrain.includes('mountain') || terrain.includes('pass')) {
    return difficulty >= 7 ? 3 : difficulty >= 4 ? 2 : 0;
  }
  if (terrain.includes('sand') || terrain.includes('desert')) {
    return difficulty >= 8 ? 2 : 0;
  }
  if (terrain.includes('forest') || terrain.includes('gravel')) {
    return difficulty >= 7 ? 2 : 0;
  }
  return 0;
}

// ============================================================
// MAIN COMPATIBILITY CALCULATOR
// ============================================================

export function calculateRigCompatibility(
  profile: VehicleProfile,
  opp: CompatibilityExpedition,
): CompatibilityResult {
  const notes: string[] = [];

  const terrainMatch = calculateTerrainMatch(profile, opp);
  const fuelRangeCoverage = calculateFuelRangeCoverage(profile, opp);
  const vehicleCapability = calculateVehicleCapability(profile, opp);
  const tireSizeMatch = calculateTireSizeMatch(profile, opp);
  const suspensionLiftMatch = calculateSuspensionLiftMatch(profile, opp);

  const hasFullData = !!(profile.gvwr_lb && profile.fuel_tank_capacity_gal && profile.avg_mpg);

  if (!hasFullData) notes.push('Partial vehicle data — score is estimated');
  if (!profile.fuel_tank_capacity_gal || !profile.avg_mpg) notes.push('Fuel specs not configured');
  if (!profile.water_capacity_gal) notes.push('Water capacity not configured');
  if (!profile.tireSizeInches) notes.push('Tire size not configured — using stock estimate');
  if (!profile.suspensionLiftInches && !profile.isLeveled) notes.push('Suspension not configured — assuming stock');

  const rawScore =
    terrainMatch * W_TERRAIN +
    fuelRangeCoverage * W_FUEL +
    vehicleCapability * W_CAPABILITY +
    tireSizeMatch * W_TIRE_SIZE +
    suspensionLiftMatch * W_SUSPENSION;

  const score = clamp(Math.round(rawScore), 0, 100);
  const difficultyRating = getDifficultyRating(score);
  const confidence = assessVehicleAssessmentConfidence({
    hasVehicleProfile: true,
    hasCoreSpecs: !!(profile.gvwr_lb && profile.base_weight_lb),
    hasFuelSpecs: !!(profile.fuel_tank_capacity_gal && profile.avg_mpg),
    hasTireConfig: !!profile.tireSizeInches,
    hasSuspensionConfig: !!(profile.suspensionLiftInches || profile.isLeveled),
    hasFullScore: hasFullData,
  });

  if (fuelRangeCoverage < 50) notes.push('Fuel stops likely required');
  if (terrainMatch < 50) notes.push('Terrain may challenge this vehicle');
  if (tireSizeMatch < 50) notes.push('Tire size may be insufficient for this terrain');
  if (suspensionLiftMatch < 50) notes.push('Suspension lift may be too low for this trail');
  const explanation = explainRecommendation({
    type: 'vehicle_assessment',
    drivers: notes.length > 0 ? notes : [
      terrainMatch >= 75 ? 'strong terrain fit' : 'terrain fit limits',
      fuelRangeCoverage >= 75 ? 'fuel range coverage' : 'fuel margin',
      tireSizeMatch >= 75 ? 'tire size margin' : 'tire size limits',
    ],
    confidenceLevel: confidence.level,
  });
  debugRigCompat(
    `${opp.name}: score=${score} (T:${terrainMatch} F:${fuelRangeCoverage} V:${vehicleCapability} Tire:${tireSizeMatch} Susp:${suspensionLiftMatch}) -> ${difficultyRating}`,
  );
  return {
    score,
    difficultyRating,
    factors: { terrainMatch, fuelRangeCoverage, vehicleCapability, tireSizeMatch, suspensionLiftMatch },
    isFullScore: hasFullData,
    confidence,
    notes,
    explanation,
  };
}

// ============================================================
// VEHICLE PROFILE BUILDER
// ============================================================

export function buildVehicleProfile(
  vehicleRecord?: {
    id: string;
    name: string;
    type?: string;
    make?: string | null;
    model?: string | null;
    avg_mpg?: number | null;
    water_capacity_gal?: number | null;
    fuel_tank_capacity_gal?: number | null;
  } | null,
): VehicleProfile | null {
  const vehicleId = vehicleRecord?.id || vehicleSetupStore.getActiveVehicleId();
  if (!vehicleId) {
    if (!hasLoggedMissingVehicleProfile) {
      hasLoggedMissingVehicleProfile = true;
      debugRigCompat('No active vehicle; skipping profile build');
    }
    return null;
  }

  const spec = vehicleSpecStore.get(vehicleId);
  hasLoggedMissingVehicleProfile = false;
  const resolvedVehicleRecord = (vehicleRecord ??
    (vehicleStore.getById(vehicleId) as typeof vehicleRecord | null)) ?? null;
  const tiresLift = tiresLiftStore.get(vehicleId);
  const resourceProfile = getVehicleResourceProfile(resolvedVehicleRecord as any, { spec, tiresLift });

  const fuelTankGal = spec?.fuel_tank_capacity_gal || resolvedVehicleRecord?.fuel_tank_capacity_gal || 0;
  const avgMpg = resolvedVehicleRecord?.avg_mpg || 15;
  const waterCapGal = resourceProfile.waterCapacityGal ?? 0;
  const gvwr = spec?.gvwr_lb || 0;
  const baseWeight = spec?.base_weight_lb || 0;
  const payloadCapacity = gvwr > 0 && baseWeight > 0 ? gvwr - baseWeight : 0;
  const fuelRange = fuelTankGal > 0 && avgMpg > 0 ? fuelTankGal * avgMpg : 0;

  let vehicleType = resolvedVehicleRecord?.type || 'truck';
  const make = (resolvedVehicleRecord?.make || '').toLowerCase();
  const model = (resolvedVehicleRecord?.model || '').toLowerCase();
  if (make === 'jeep') vehicleType = 'jeep';
  if (model.includes('sprinter') || model.includes('transit') || model.includes('promaster')) vehicleType = 'suv_van';
  if (model.includes('4runner') || model.includes('bronco') || model.includes('land cruiser') ||
      model.includes('tahoe') || model.includes('expedition')) vehicleType = 'suv_van';
  if (model.includes('outback') || model.includes('crosstrek') || model.includes('rav4') ||
      model.includes('passport') || model.includes('santa cruz')) vehicleType = 'car_crossover';

  const tireSizeInches = resourceProfile.tireSizeInches || 0;
  const suspensionLiftInches = resourceProfile.suspensionLiftInches || 0;
  const isLeveled = resourceProfile.isLeveled || false;
  const frontLevelInches = resourceProfile.frontLevelInches ?? null;

  const profile: VehicleProfile = {
    vehicleId,
    vehicleName: resolvedVehicleRecord?.name || 'Vehicle',
    vehicleType,
    make: resolvedVehicleRecord?.make || null,
    model: resolvedVehicleRecord?.model || null,
    gvwr_lb: gvwr,
    base_weight_lb: baseWeight,
    fuel_tank_capacity_gal: fuelTankGal,
    fuel_type: spec?.fuel_type || 'gas',
    avg_mpg: avgMpg,
    water_capacity_gal: waterCapGal,
    payload_capacity_lb: payloadCapacity,
    fuel_range_miles: fuelRange,
    tireSizeInches,
    suspensionLiftInches,
    isLeveled,
    frontLevelInches,
  };

  debugRigCompat(
    `Built profile for "${profile.vehicleName}": type=${vehicleType}, GVWR=${gvwr}, range=${fuelRange}mi, water=${waterCapGal}gal, tires=${tireSizeInches}", lift=${suspensionLiftInches}", leveled=${isLeveled}, frontLevel=${frontLevelInches ?? 'na'}`,
  );
  return profile;
}

export function buildProfileFromSpecs(): VehicleProfile | null {
  const vehicleId = vehicleSetupStore.getActiveVehicleId();
  if (!vehicleId) return null;

  const spec = vehicleSpecStore.get(vehicleId);
  if (!spec) return null;
  const activeVehicle = vehicleStore.getById(vehicleId) as {
    id: string;
    name?: string | null;
    type?: string | null;
    make?: string | null;
    model?: string | null;
    avg_mpg?: number | null;
    water_capacity_gal?: number | null;
    fuel_tank_capacity_gal?: number | null;
  } | null;
  const tiresLift = tiresLiftStore.get(vehicleId);
  const resourceProfile = getVehicleResourceProfile(activeVehicle as any, { spec, tiresLift });

  const fuelTankCapacityGal = spec.fuel_tank_capacity_gal || activeVehicle?.fuel_tank_capacity_gal || 0;
  const avgMpg = activeVehicle?.avg_mpg || 15;
  const waterCapacityGal = resourceProfile.waterCapacityGal ?? 0;
  const fuelRange = fuelTankCapacityGal > 0 ? fuelTankCapacityGal * avgMpg : 0;

  const tireSizeInches = resourceProfile.tireSizeInches || 0;
  const suspensionLiftInches = resourceProfile.suspensionLiftInches || 0;
  const isLeveled = resourceProfile.isLeveled || false;
  const frontLevelInches = resourceProfile.frontLevelInches ?? null;

  return {
    vehicleId,
    vehicleName: activeVehicle?.name || 'Vehicle',
    vehicleType: activeVehicle?.type || 'truck',
    make: activeVehicle?.make || null,
    model: activeVehicle?.model || null,
    gvwr_lb: spec.gvwr_lb,
    base_weight_lb: spec.base_weight_lb,
    fuel_tank_capacity_gal: fuelTankCapacityGal,
    fuel_type: spec.fuel_type,
    avg_mpg: avgMpg,
    water_capacity_gal: waterCapacityGal,
    payload_capacity_lb: spec.gvwr_lb > 0 && spec.base_weight_lb > 0
      ? spec.gvwr_lb - spec.base_weight_lb : 0,
    fuel_range_miles: fuelRange,
    tireSizeInches,
    suspensionLiftInches,
    isLeveled,
    frontLevelInches,
  };
}

// ============================================================
// BATCH SCORING
// ============================================================

/**
 * Calculate compatibility for multiple opportunities and sort by score (highest first).
 * The generic T extends CompatibilityExpedition so this works with ExpeditionOpportunity.
 */
export function scoreAndSortOpportunities<T extends CompatibilityExpedition>(
  profile: VehicleProfile,
  opportunities: T[],
): { opportunities: (T & { rigCompatibility: number; difficultyRating: string })[]; results: Map<string, CompatibilityResult> } {
  const results = new Map<string, CompatibilityResult>();

  const scored = opportunities.map(op => {
    const result = calculateRigCompatibility(profile, op);
    results.set(op.id, result);
    return { ...op, rigCompatibility: result.score, difficultyRating: result.difficultyRating };
  });

  scored.sort((a, b) => b.rigCompatibility - a.rigCompatibility);
  debugRigCompat(
    `Scored ${scored.length} opportunities; top=${scored[0]?.name ?? 'none'} (${scored[0]?.rigCompatibility ?? 0}%)`,
  );
  return { opportunities: scored, results };
}

// ── Helpers ─────────────────────────────────────────────────

function resolveMatrixKey(profile: VehicleProfile): string {
  const vType = profile.vehicleType.toLowerCase();
  const make = (profile.make || '').toLowerCase();
  const model = (profile.model || '').toLowerCase();

  if (make === 'jeep' || vType.includes('jeep') || vType.includes('wrangler') || vType.includes('gladiator')) return 'jeep';
  if (vType.includes('suv') || vType.includes('van') || model.includes('sprinter') ||
      model.includes('transit') || model.includes('4runner') || model.includes('bronco') ||
      model.includes('land cruiser')) return 'suv_van';
  if (vType.includes('car') || vType.includes('crossover') || model.includes('outback') ||
      model.includes('crosstrek') || model.includes('rav4')) return 'car_crossover';
  return 'truck';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}


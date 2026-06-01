// ============================================================
// RIG UPGRADE SUGGESTIONS ENGINE
// ============================================================
// Analyzes rig compatibility constraints for a given expedition
// and generates actionable upgrade recommendations.
//
// Trigger:  compatibility score < 85%
// Output:   max 2 suggestions, sorted by largest improvement
//
// Each suggestion includes:
//   - upgradeType (fuel_capacity, water_capacity, etc.)
//   - suggestedChange (human-readable recommendation)
//   - estimatedCompatibilityIncrease (current → projected)
//
// This engine does NOT modify the existing compatibility scoring.
// It only reads the factor breakdown and recommends improvements.
//
// Phase 5: Now uses actual tire/lift data from VehicleProfile
// and the new 6-factor compatibility model.
// ============================================================

import type {
  VehicleProfile,
  CompatibilityResult,
  CompatibilityFactors,
  CompatibilityExpedition,
} from './rigCompatibilityEngine';

const TAG = '[RIG-UPGRADE]';
const DEBUG_RIG_UPGRADES =
  __DEV__ &&
  ((globalThis as typeof globalThis & { __ECS_DEBUG_RIG_UPGRADES__?: boolean })
    .__ECS_DEBUG_RIG_UPGRADES__ === true);

function debugRigUpgrade(message: string): void {
  if (!DEBUG_RIG_UPGRADES) return;
  console.log(TAG, message);
}

// ── Upgrade Types ───────────────────────────────────────────
export type UpgradeType =
  | 'fuel_capacity'
  | 'water_capacity'
  | 'suspension_lift'
  | 'tire_size'
  | 'weight_reduction'
  | 'terrain_tires';

// ── Upgrade Suggestion Model ────────────────────────────────
export interface UpgradeSuggestion {
  upgradeType: UpgradeType;
  icon: string;                     // Ionicons icon name
  label: string;                    // short label (e.g. "FUEL CAPACITY")
  suggestedChange: string;          // human-readable (e.g. "+10 gallons fuel capacity")
  constraintFactor: keyof CompatibilityFactors;
  currentFactorScore: number;       // 0–100
  estimatedNewFactorScore: number;  // 0–100
  currentOverallScore: number;      // 0–100
  estimatedNewOverallScore: number; // 0–100
  improvementPoints: number;        // overall score increase
}

// ── Thresholds ──────────────────────────────────────────────
/** Only show upgrade suggestions when overall compatibility is below this */
export const UPGRADE_THRESHOLD = 85;

/** Maximum number of suggestions to return */
export const MAX_SUGGESTIONS = 2;

// ── Factor Weights (must match rigCompatibilityEngine 6-factor model) ──
const W_TERRAIN    = 0.30;
const W_FUEL       = 0.25;
const W_CAPABILITY = 0.20;
const W_TIRE_SIZE  = 0.15;
const W_SUSPENSION = 0.10;

const WEIGHT_MAP: Record<keyof CompatibilityFactors, number> = {
  terrainMatch:       W_TERRAIN,
  fuelRangeCoverage:  W_FUEL,
  vehicleCapability:  W_CAPABILITY,
  tireSizeMatch:      W_TIRE_SIZE,
  suspensionLiftMatch: W_SUSPENSION,
};

// ============================================================
// MAIN API
// ============================================================

/**
 * Generate upgrade suggestions for a given expedition opportunity.
 *
 * @param profile       The user's vehicle profile
 * @param expedition    The expedition being analyzed
 * @param compatResult  The compatibility result from the scoring engine
 * @returns Array of 0–2 UpgradeSuggestions, sorted by largest improvement
 */
export function generateUpgradeSuggestions(
  profile: VehicleProfile,
  expedition: CompatibilityExpedition,
  compatResult: CompatibilityResult,
): UpgradeSuggestion[] {
  if (compatResult.score >= UPGRADE_THRESHOLD) {
    debugRigUpgrade(`${expedition.name}: score ${compatResult.score}% >= ${UPGRADE_THRESHOLD}% - no upgrades needed`);
    return [];
  }

  const suggestions: UpgradeSuggestion[] = [];
  const { factors } = compatResult;
  const currentScore = compatResult.score;

  // ── Analyze each factor and generate suggestions ──────────

  // 1. TIRE SIZE — if tire size match is low
  if (factors.tireSizeMatch < 80) {
    const tireSuggestion = analyzeTireSizeConstraint(profile, expedition, factors, currentScore);
    if (tireSuggestion) suggestions.push(tireSuggestion);
  }

  // 2. SUSPENSION LIFT — if suspension lift match is low
  if (factors.suspensionLiftMatch < 75) {
    const liftSuggestion = analyzeSuspensionLiftConstraint(profile, expedition, factors, currentScore);
    if (liftSuggestion) suggestions.push(liftSuggestion);
  }

  // 3. FUEL RANGE — if fuel coverage is limiting
  if (factors.fuelRangeCoverage < 75) {
    const fuelSuggestion = analyzeFuelConstraint(profile, expedition, factors, currentScore);
    if (fuelSuggestion) suggestions.push(fuelSuggestion);
  }

  // 4. TERRAIN MATCH — if terrain match is low (general terrain capability)
  if (factors.terrainMatch < 70) {
    const terrainSuggestion = analyzeTerrainConstraint(profile, expedition, factors, currentScore);
    if (terrainSuggestion) suggestions.push(terrainSuggestion);
  }

  // 5. VEHICLE CAPABILITY — if vehicle capability is low
  if (factors.vehicleCapability < 60) {
    const weightSuggestion = analyzeWeightConstraint(profile, expedition, factors, currentScore);
    if (weightSuggestion) suggestions.push(weightSuggestion);
  }

  // Sort by largest improvement, take top MAX_SUGGESTIONS
  suggestions.sort((a, b) => b.improvementPoints - a.improvementPoints);
  const topSuggestions = suggestions.slice(0, MAX_SUGGESTIONS);

  if (topSuggestions.length > 0) {
    debugRigUpgrade(
      `${expedition.name}: ${topSuggestions.length} upgrade suggestion(s) — ` +
      topSuggestions.map(s => `${s.label} (+${s.improvementPoints}pts)`).join(', ')
    );
  }

  return topSuggestions;
}

// ============================================================
// CONSTRAINT ANALYZERS
// ============================================================

// ── TIRE SIZE CONSTRAINT ────────────────────────────────────
// Uses actual vehicle tire size data from tiresLiftStore.
function analyzeTireSizeConstraint(
  profile: VehicleProfile,
  expedition: CompatibilityExpedition,
  factors: CompatibilityFactors,
  currentScore: number,
): UpgradeSuggestion | null {
  const currentTireSize = profile.tireSizeInches;
  const recommendedSize = expedition.recommendedTireSize || getDefaultRecommendedTire(expedition);

  // Determine target tire size
  let targetSize: number;
  if (currentTireSize > 0 && currentTireSize < recommendedSize) {
    // Vehicle has tires configured but they're too small
    targetSize = recommendedSize;
  } else if (currentTireSize <= 0) {
    // No tire data configured — suggest the recommended size
    targetSize = recommendedSize;
  } else {
    // Tires meet or exceed recommendation — no suggestion needed
    return null;
  }

  // Build the suggestion text
  let suggestedChange: string;
  if (currentTireSize > 0) {
    suggestedChange = `Increase tire size from ${currentTireSize}" to ${targetSize}"`;
  } else {
    suggestedChange = `Install ${targetSize}" tires (configure in Fleet → Tires / Lift)`;
  }

  // Estimate new tire size match score
  // If we upgrade to the recommended size, we should get ~90
  const newTireScore = clamp(90, 0, 100);
  const newOverall = recalculateOverall(factors, 'tireSizeMatch', newTireScore);

  return {
    upgradeType: 'tire_size',
    icon: 'ellipse-outline',
    label: 'TIRE SIZE',
    suggestedChange,
    constraintFactor: 'tireSizeMatch',
    currentFactorScore: factors.tireSizeMatch,
    estimatedNewFactorScore: newTireScore,
    currentOverallScore: currentScore,
    estimatedNewOverallScore: newOverall,
    improvementPoints: newOverall - currentScore,
  };
}

// ── SUSPENSION LIFT CONSTRAINT ──────────────────────────────
// Uses actual vehicle suspension data from tiresLiftStore.
function analyzeSuspensionLiftConstraint(
  profile: VehicleProfile,
  expedition: CompatibilityExpedition,
  factors: CompatibilityFactors,
  currentScore: number,
): UpgradeSuggestion | null {
  const currentLift = profile.suspensionLiftInches;
  const isLeveled = profile.isLeveled;
  const recommendedLift = expedition.recommendedLift || getDefaultRecommendedLift(expedition);

  if (recommendedLift <= 0) return null; // No lift needed for this trail

  // Determine target lift
  let targetLift: number;
  if (currentLift >= recommendedLift) {
    return null; // Already meets or exceeds
  }
  targetLift = recommendedLift;

  // Build the suggestion text
  let suggestedChange: string;
  if (currentLift > 0) {
    suggestedChange = `Increase suspension lift from ${currentLift}" to ${targetLift}"`;
  } else if (isLeveled) {
    suggestedChange = `Upgrade from leveling kit to ${targetLift}" suspension lift`;
  } else {
    suggestedChange = `Add ${targetLift}" suspension lift`;
  }

  // Estimate new suspension lift match score
  const newLiftScore = clamp(88, 0, 100);
  const newOverall = recalculateOverall(factors, 'suspensionLiftMatch', newLiftScore);

  return {
    upgradeType: 'suspension_lift',
    icon: 'arrow-up-outline',
    label: 'SUSPENSION LIFT',
    suggestedChange,
    constraintFactor: 'suspensionLiftMatch',
    currentFactorScore: factors.suspensionLiftMatch,
    estimatedNewFactorScore: newLiftScore,
    currentOverallScore: currentScore,
    estimatedNewOverallScore: newOverall,
    improvementPoints: newOverall - currentScore,
  };
}

// ── FUEL CONSTRAINT ─────────────────────────────────────────
function analyzeFuelConstraint(
  profile: VehicleProfile,
  expedition: CompatibilityExpedition,
  factors: CompatibilityFactors,
  currentScore: number,
): UpgradeSuggestion | null {
  const currentFuelGal = profile.fuel_tank_capacity_gal;
  const avgMpg = profile.avg_mpg || 15;

  // Calculate how much additional fuel would bring coverage to ~90
  const trailDistance = expedition.distanceMiles;
  const terrainPenalty = getTerrainFuelPenalty(expedition.terrainType);
  const targetRange = trailDistance * 1.8;
  const neededTotalGal = Math.ceil(targetRange / (avgMpg * terrainPenalty));
  const additionalGal = Math.max(5, Math.ceil((neededTotalGal - currentFuelGal) / 5) * 5);

  if (additionalGal <= 0 || additionalGal > 40) return null;

  // Estimate new factor score
  const newFuelRange = (currentFuelGal + additionalGal) * avgMpg;
  const effectiveRange = newFuelRange * terrainPenalty;
  const ratio = effectiveRange / trailDistance;
  let newFuelScore: number;
  if (ratio >= 2.0) newFuelScore = 100;
  else if (ratio >= 1.5) newFuelScore = 90 + ((ratio - 1.5) / 0.5) * 10;
  else if (ratio >= 1.2) newFuelScore = 80 + ((ratio - 1.2) / 0.3) * 10;
  else if (ratio >= 1.0) newFuelScore = 60 + ((ratio - 1.0) / 0.2) * 20;
  else newFuelScore = Math.round(ratio * 60);
  newFuelScore = clamp(Math.round(newFuelScore), 0, 100);

  const newOverall = recalculateOverall(factors, 'fuelRangeCoverage', newFuelScore);

  return {
    upgradeType: 'fuel_capacity',
    icon: 'flame-outline',
    label: 'FUEL CAPACITY',
    suggestedChange: `+${additionalGal} gallons fuel capacity`,
    constraintFactor: 'fuelRangeCoverage',
    currentFactorScore: factors.fuelRangeCoverage,
    estimatedNewFactorScore: newFuelScore,
    currentOverallScore: currentScore,
    estimatedNewOverallScore: newOverall,
    improvementPoints: newOverall - currentScore,
  };
}

// ── TERRAIN CONSTRAINT ──────────────────────────────────────
// General terrain capability improvement (not tire-specific)
function analyzeTerrainConstraint(
  _profile: VehicleProfile,
  expedition: CompatibilityExpedition,
  factors: CompatibilityFactors,
  currentScore: number,
): UpgradeSuggestion | null {
  const terrain = expedition.terrainType.toLowerCase();

  let recommendation: string;
  if (terrain.includes('rock') || terrain.includes('canyon')) {
    recommendation = 'Add skid plates and rock sliders for terrain protection';
  } else if (terrain.includes('sand') || terrain.includes('desert')) {
    recommendation = 'Add recovery boards and air-down capability';
  } else if (terrain.includes('alpine') || terrain.includes('mountain') || terrain.includes('pass')) {
    recommendation = 'Add differential lockers for mountain terrain';
  } else {
    recommendation = 'Add all-terrain capability upgrades';
  }

  const improvement = terrain.includes('rock') ? 12 :
    terrain.includes('sand') ? 10 :
    terrain.includes('alpine') || terrain.includes('mountain') ? 11 : 8;

  const newTerrainScore = clamp(factors.terrainMatch + improvement, 0, 100);
  const newOverall = recalculateOverall(factors, 'terrainMatch', newTerrainScore);

  return {
    upgradeType: 'terrain_tires',
    icon: 'shield-checkmark-outline',
    label: 'TERRAIN CAPABILITY',
    suggestedChange: recommendation,
    constraintFactor: 'terrainMatch',
    currentFactorScore: factors.terrainMatch,
    estimatedNewFactorScore: newTerrainScore,
    currentOverallScore: currentScore,
    estimatedNewOverallScore: newOverall,
    improvementPoints: newOverall - currentScore,
  };
}

// ── WEIGHT CONSTRAINT ───────────────────────────────────────
function analyzeWeightConstraint(
  profile: VehicleProfile,
  _expedition: CompatibilityExpedition,
  factors: CompatibilityFactors,
  currentScore: number,
): UpgradeSuggestion | null {
  const currentPayload = profile.payload_capacity_lb;
  if (currentPayload >= 1000) return null;

  let reductionLbs: number;
  if (currentPayload < 500) reductionLbs = 200;
  else if (currentPayload < 800) reductionLbs = 150;
  else reductionLbs = 100;

  const improvement = reductionLbs >= 200 ? 12 : reductionLbs >= 150 ? 10 : 8;
  const newCapScore = clamp(factors.vehicleCapability + improvement, 0, 100);
  const newOverall = recalculateOverall(factors, 'vehicleCapability', newCapScore);

  return {
    upgradeType: 'weight_reduction',
    icon: 'trending-down-outline',
    label: 'WEIGHT REDUCTION',
    suggestedChange: `Reduce vehicle weight by ${reductionLbs} lbs`,
    constraintFactor: 'vehicleCapability',
    currentFactorScore: factors.vehicleCapability,
    estimatedNewFactorScore: newCapScore,
    currentOverallScore: currentScore,
    estimatedNewOverallScore: newOverall,
    improvementPoints: newOverall - currentScore,
  };
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Recalculate overall score with one factor replaced.
 */
function recalculateOverall(
  factors: CompatibilityFactors,
  replaceFactor: keyof CompatibilityFactors,
  newValue: number,
): number {
  let score = 0;
  for (const [key, weight] of Object.entries(WEIGHT_MAP)) {
    const factorKey = key as keyof CompatibilityFactors;
    const value = factorKey === replaceFactor ? newValue : factors[factorKey];
    score += value * weight;
  }
  return clamp(Math.round(score), 0, 100);
}

/**
 * Get terrain-based fuel efficiency penalty factor.
 */
function getTerrainFuelPenalty(terrainType: string): number {
  const t = terrainType.toLowerCase();
  if (t.includes('alpine') || t.includes('mountain') || t.includes('pass')) return 0.80;
  if (t.includes('desert') || t.includes('sand')) return 0.85;
  if (t.includes('rock') || t.includes('canyon')) return 0.82;
  if (t.includes('forest') || t.includes('gravel')) return 0.92;
  return 0.88;
}

/**
 * Get default recommended tire size based on terrain.
 */
function getDefaultRecommendedTire(expedition: CompatibilityExpedition): number {
  const terrain = expedition.terrainType.toLowerCase();
  const difficulty = expedition.terrainDifficulty || 5;
  if (terrain.includes('rock') || terrain.includes('canyon')) {
    return difficulty >= 8 ? 35 : 33;
  }
  if (terrain.includes('alpine') || terrain.includes('mountain') || terrain.includes('pass')) {
    return difficulty >= 7 ? 33 : 31;
  }
  if (terrain.includes('sand') || terrain.includes('desert')) {
    return difficulty >= 7 ? 33 : 31;
  }
  return 31;
}

/**
 * Get default recommended lift based on terrain.
 */
function getDefaultRecommendedLift(expedition: CompatibilityExpedition): number {
  const terrain = expedition.terrainType.toLowerCase();
  const difficulty = expedition.terrainDifficulty || 5;
  if (terrain.includes('rock') || terrain.includes('canyon')) {
    return difficulty >= 8 ? 4 : difficulty >= 5 ? 2 : 0;
  }
  if (terrain.includes('alpine') || terrain.includes('mountain') || terrain.includes('pass')) {
    return difficulty >= 7 ? 3 : difficulty >= 4 ? 2 : 0;
  }
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================
// UTILITY: Check if upgrades are available for quick UI hints
// ============================================================

/**
 * Quick check: does this expedition have upgrade suggestions?
 * Use this for showing hint badges on cards without full analysis.
 */
export function hasUpgradeSuggestions(compatScore: number | undefined): boolean {
  if (compatScore == null) return false;
  return compatScore < UPGRADE_THRESHOLD;
}

/**
 * Get a brief upgrade hint label for card display.
 * Returns null if no upgrades needed.
 */
export function getUpgradeHintLabel(compatScore: number | undefined): string | null {
  if (compatScore == null || compatScore >= UPGRADE_THRESHOLD) return null;
  if (compatScore < 40) return 'MAJOR UPGRADES NEEDED';
  if (compatScore < 60) return 'UPGRADES RECOMMENDED';
  if (compatScore < 75) return 'MINOR UPGRADES AVAILABLE';
  return 'UPGRADES AVAILABLE';
}

/**
 * Get upgrade hint color based on compatibility score.
 */
export function getUpgradeHintColor(compatScore: number): string {
  if (compatScore < 40) return '#E04030';
  if (compatScore < 60) return '#E67E22';
  if (compatScore < 75) return '#D4A017';
  return '#5AC8FA';
}


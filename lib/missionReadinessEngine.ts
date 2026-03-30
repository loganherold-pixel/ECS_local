/**
 * ECS Mission Readiness Engine — Phase 5D + Phase 6D
 *
 * Computes mission readiness scores by integrating:
 *   - Zone weight aggregation (Phase 5A)
 *   - Load bias awareness (Phase 5B)
 *   - Attitude/stability data (Phase 5C)
 *   - Water logistics
 *   - Power systems
 *   - Loadout completeness
 *   - Phase 6D: Terrain risk penalty (high → -10, critical → -20)
 *
 * RULES:
 *   - No hooks inside this engine
 *   - All functions are pure (no side effects)
 *   - Results designed for memoized selectors
 *   - Scoring is deterministic and transparent
 *   - All sub-scores are 0–100 scale
 */

import type { ContainerZone, AccessoryFramework } from './accessoryFramework';
import {
  type WeightEngineItem,
  type ZoneWeightResult,
  type LoadBiasResult,
  type BiasProfile,
  type AttitudeAwareResult,
  computeZoneWeightAggregation,
  computeLoadBias,
  computeAttitudeAwareStability,
  calculateBiasProfile,
} from './vehicleWeightEngine';
import { type VehicleBaseline, DEFAULT_VEHICLE_BASELINE } from './stabilityEngine';
import type { RiskLevel } from './terrainRiskEngine';



// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Individual readiness dimension score.
 */
export interface ReadinessDimension {
  /** Dimension identifier */
  id: string;
  /** Human-readable label */
  label: string;
  /** Score 0–100 */
  score: number;
  /** Status tier */
  tier: 'critical' | 'warning' | 'good' | 'excellent';
  /** Color for UI display */
  color: string;
  /** Short description of current state */
  detail: string;
  /** Whether this dimension has sufficient data to score */
  hasData: boolean;
}

/**
 * Complete mission readiness assessment.
 */
export interface MissionReadinessResult {
  /** Overall readiness score (0–100) — weighted average of dimensions */
  overallScore: number;
  /** Overall tier */
  overallTier: 'not_ready' | 'minimal' | 'prepared' | 'mission_ready';
  /** Overall color */
  overallColor: string;
  /** Individual dimension scores */
  dimensions: ReadinessDimension[];
  /** Critical issues that must be resolved */
  criticalIssues: string[];
  /** Warnings that should be addressed */
  warnings: string[];
  /** Summary text */
  summary: string;
  /** Whether sufficient data exists for a meaningful assessment */
  hasSufficientData: boolean;
  /** Timestamp of computation */
  computedAt: string;
}

/**
 * Input parameters for readiness computation.
 */
export interface ReadinessInput {
  /** Normalized loadout items */
  loadoutItems: WeightEngineItem[];
  /** Vehicle container zones */
  containerZones: ContainerZone[];
  /** Vehicle base weight in lbs */
  baseWeight: number;
  /** GVWR in lbs */
  gvwr: number;
  /** Vehicle baseline dimensions (optional) */
  vehicleBaseline?: VehicleBaseline;
  /** Accessory framework (optional) */
  accessoryFramework?: AccessoryFramework | null;
  /** Water capacity in gallons */
  waterCapacityGal?: number | null;
  /** Current water level in gallons */
  currentWaterGal?: number | null;
  /** People count for the expedition */
  peopleCount?: number;
  /** Trip length in days */
  tripLengthDays?: number | null;
  /** Fuel tank capacity in gallons */
  fuelCapacityGal?: number | null;
  /** Current fuel percentage (0–100) */
  currentFuelPercent?: number | null;
  /** Average MPG */
  avgMpg?: number | null;
  /** Power battery capacity in Wh */
  batteryCapacityWh?: number | null;
  /** Current power remaining in Wh */
  powerRemainingWh?: number | null;
  /** Average power draw in W */
  powerAvgDrawW?: number | null;
}


// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Dimension weights for overall score computation */
const DIMENSION_WEIGHTS: Record<string, number> = {
  weight:     0.25,  // Weight/GVWR compliance
  balance:    0.15,  // Load distribution balance
  loadout:    0.25,  // Loadout completeness
  water:      0.15,  // Water logistics
  fuel:       0.10,  // Fuel range
  power:      0.10,  // Power systems
};

/** Water usage per person per day (gallons) — conservative estimate */
const WATER_GAL_PER_PERSON_PER_DAY = 1.5;

/** Minimum fuel range in miles considered adequate */
const MIN_ADEQUATE_FUEL_RANGE_MI = 100;


// ═══════════════════════════════════════════════════════════════
// SCORING FUNCTIONS — Individual Dimensions
// ═══════════════════════════════════════════════════════════════

/**
 * Score weight/GVWR compliance (0–100).
 *
 * 100 = under 75% GVWR
 *  75 = at 85% GVWR
 *  50 = at 95% GVWR
 *  25 = at 100% GVWR
 *   0 = over GVWR
 */
function scoreWeight(zoneWeights: ZoneWeightResult): ReadinessDimension {
  const { gvwrPercent, isOverGvwr, vehicleTotalWeight, totalLoadoutWeight } = zoneWeights;
  const hasData = vehicleTotalWeight > 0 && gvwrPercent > 0;

  if (!hasData) {
    return {
      id: 'weight',
      label: 'Weight Compliance',
      score: 50,
      tier: 'warning',
      color: '#FFB74D',
      detail: 'No vehicle weight data configured',
      hasData: false,
    };
  }

  let score: number;
  if (isOverGvwr) {
    score = Math.max(0, 25 - (gvwrPercent - 100) * 5);
  } else if (gvwrPercent > 95) {
    score = 25 + (100 - gvwrPercent) * 5;
  } else if (gvwrPercent > 85) {
    score = 50 + (95 - gvwrPercent) * 2.5;
  } else if (gvwrPercent > 75) {
    score = 75 + (85 - gvwrPercent) * 2.5;
  } else {
    score = 100;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const tier = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 30 ? 'warning' : 'critical';
  const color = tier === 'excellent' ? '#66BB6A' : tier === 'good' ? '#C48A2C' : tier === 'warning' ? '#FFB74D' : '#EF5350';

  const detail = isOverGvwr
    ? `OVER GVWR by ${Math.round(vehicleTotalWeight - (vehicleTotalWeight / gvwrPercent * 100))} lbs`
    : `${gvwrPercent.toFixed(1)}% GVWR — ${Math.round(zoneWeights.remainingPayloadLbs)} lbs remaining`;

  return { id: 'weight', label: 'Weight Compliance', score, tier, color, detail, hasData };
}

/**
 * Score load distribution balance (0–100).
 */
function scoreBalance(loadBias: LoadBiasResult): ReadinessDimension {
  const riskScores: Record<string, number> = {
    low: 100,
    moderate: 75,
    elevated: 45,
    high: 15,
  };

  const score = riskScores[loadBias.overallRisk] || 50;
  const tier = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 30 ? 'warning' : 'critical';
  const color = tier === 'excellent' ? '#66BB6A' : tier === 'good' ? '#C48A2C' : tier === 'warning' ? '#FFB74D' : '#EF5350';

  return {
    id: 'balance',
    label: 'Load Balance',
    score,
    tier,
    color,
    detail: loadBias.summary,
    hasData: true,
  };
}

/**
 * Score loadout completeness (0–100).
 *
 * Based on:
 *   - Total item count (more items = more prepared)
 *   - Critical items present
 *   - Zone assignment coverage
 */
function scoreLoadout(
  loadoutItems: WeightEngineItem[],
  zoneWeights: ZoneWeightResult,
): ReadinessDimension {
  if (loadoutItems.length === 0) {
    return {
      id: 'loadout',
      label: 'Loadout Readiness',
      score: 0,
      tier: 'critical',
      color: '#EF5350',
      detail: 'No items in loadout',
      hasData: false,
    };
  }

  let score = 0;

  // Base score from item count (up to 40 points)
  // 10+ items = full 40 points
  const itemCountScore = Math.min(40, loadoutItems.length * 4);
  score += itemCountScore;

  // Critical items present (up to 25 points)
  const criticalCount = loadoutItems.filter(i => i.critical).length;
  const criticalScore = Math.min(25, criticalCount * 5);
  score += criticalScore;

  // Zone assignment coverage (up to 20 points)
  const assignedCount = loadoutItems.filter(i => i.containerZoneId).length;
  const assignmentPct = loadoutItems.length > 0
    ? assignedCount / loadoutItems.length
    : 0;
  score += Math.round(assignmentPct * 20);

  // Weight data coverage (up to 15 points)
  const itemsWithWeight = loadoutItems.filter(i => i.weight > 0).length;
  const weightCoverage = loadoutItems.length > 0
    ? itemsWithWeight / loadoutItems.length
    : 0;
  score += Math.round(weightCoverage * 15);

  score = Math.max(0, Math.min(100, score));

  const tier = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 30 ? 'warning' : 'critical';
  const color = tier === 'excellent' ? '#66BB6A' : tier === 'good' ? '#C48A2C' : tier === 'warning' ? '#FFB74D' : '#EF5350';

  const unassignedPct = loadoutItems.length > 0
    ? Math.round((zoneWeights.unassignedItems.length / loadoutItems.length) * 100)
    : 0;

  const detail = `${loadoutItems.length} items · ${criticalCount} critical · ${unassignedPct > 0 ? `${unassignedPct}% unassigned` : 'all assigned'}`;

  return { id: 'loadout', label: 'Loadout Readiness', score, tier, color, detail, hasData: true };
}

/**
 * Score water logistics (0–100).
 */
function scoreWater(input: ReadinessInput): ReadinessDimension {
  const { waterCapacityGal, currentWaterGal, peopleCount, tripLengthDays } = input;

  if (!waterCapacityGal || waterCapacityGal <= 0) {
    return {
      id: 'water',
      label: 'Water Logistics',
      score: 30,
      tier: 'warning',
      color: '#FFB74D',
      detail: 'No water capacity configured',
      hasData: false,
    };
  }

  const currentLevel = currentWaterGal ?? waterCapacityGal;
  const people = Math.max(1, peopleCount || 1);
  const dailyUsage = people * WATER_GAL_PER_PERSON_PER_DAY;
  const autonomyDays = dailyUsage > 0 ? currentLevel / dailyUsage : 0;

  let score: number;
  const tripDays = tripLengthDays || 3; // default 3-day trip

  if (autonomyDays >= tripDays * 1.5) {
    score = 100; // 150%+ of trip needs
  } else if (autonomyDays >= tripDays) {
    score = 75 + (autonomyDays - tripDays) / (tripDays * 0.5) * 25;
  } else if (autonomyDays >= tripDays * 0.5) {
    score = 40 + (autonomyDays - tripDays * 0.5) / (tripDays * 0.5) * 35;
  } else {
    score = Math.max(0, autonomyDays / (tripDays * 0.5) * 40);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const tier = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 30 ? 'warning' : 'critical';
  const color = tier === 'excellent' ? '#66BB6A' : tier === 'good' ? '#C48A2C' : tier === 'warning' ? '#FFB74D' : '#EF5350';

  const detail = `${autonomyDays.toFixed(1)} days autonomy · ${currentLevel.toFixed(1)}/${waterCapacityGal.toFixed(1)} gal`;

  return { id: 'water', label: 'Water Logistics', score, tier, color, detail, hasData: true };
}

/**
 * Score fuel range (0–100).
 */
function scoreFuel(input: ReadinessInput): ReadinessDimension {
  const { fuelCapacityGal, currentFuelPercent, avgMpg } = input;

  if (!fuelCapacityGal || fuelCapacityGal <= 0 || !avgMpg || avgMpg <= 0) {
    return {
      id: 'fuel',
      label: 'Fuel Range',
      score: 50,
      tier: 'warning',
      color: '#FFB74D',
      detail: 'No fuel/MPG data configured',
      hasData: false,
    };
  }

  const fuelPct = currentFuelPercent ?? 100;
  const currentGal = fuelCapacityGal * (fuelPct / 100);
  const rangeMi = currentGal * avgMpg;

  let score: number;
  if (rangeMi >= 400) {
    score = 100;
  } else if (rangeMi >= 200) {
    score = 70 + (rangeMi - 200) / 200 * 30;
  } else if (rangeMi >= MIN_ADEQUATE_FUEL_RANGE_MI) {
    score = 40 + (rangeMi - MIN_ADEQUATE_FUEL_RANGE_MI) / 100 * 30;
  } else {
    score = Math.max(0, rangeMi / MIN_ADEQUATE_FUEL_RANGE_MI * 40);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const tier = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 30 ? 'warning' : 'critical';
  const color = tier === 'excellent' ? '#66BB6A' : tier === 'good' ? '#C48A2C' : tier === 'warning' ? '#FFB74D' : '#EF5350';

  const detail = `${Math.round(rangeMi)} mi range · ${Math.round(fuelPct)}% fuel`;

  return { id: 'fuel', label: 'Fuel Range', score, tier, color, detail, hasData: true };
}

/**
 * Score power systems (0–100).
 */
function scorePower(input: ReadinessInput): ReadinessDimension {
  const { batteryCapacityWh, powerRemainingWh, powerAvgDrawW } = input;

  if (!batteryCapacityWh || batteryCapacityWh <= 0) {
    return {
      id: 'power',
      label: 'Power Systems',
      score: 50,
      tier: 'warning',
      color: '#FFB74D',
      detail: 'No power system configured',
      hasData: false,
    };
  }

  const remaining = powerRemainingWh ?? batteryCapacityWh;
  const pct = (remaining / batteryCapacityWh) * 100;

  let score: number;
  if (pct >= 80) {
    score = 100;
  } else if (pct >= 50) {
    score = 60 + (pct - 50) / 30 * 40;
  } else if (pct >= 20) {
    score = 25 + (pct - 20) / 30 * 35;
  } else {
    score = Math.max(0, pct / 20 * 25);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const tier = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 30 ? 'warning' : 'critical';
  const color = tier === 'excellent' ? '#66BB6A' : tier === 'good' ? '#C48A2C' : tier === 'warning' ? '#FFB74D' : '#EF5350';

  const hours = powerAvgDrawW && powerAvgDrawW > 0
    ? (remaining / powerAvgDrawW).toFixed(1)
    : '—';

  const detail = `${Math.round(pct)}% charged · ${hours}h est. runtime`;

  return { id: 'power', label: 'Power Systems', score, tier, color, detail, hasData: true };
}


// ═══════════════════════════════════════════════════════════════
// MAIN COMPUTATION
// ═══════════════════════════════════════════════════════════════

/**
 * Compute complete mission readiness assessment.
 *
 * Integrates all Phase 5 sub-systems:
 *   - Weight compliance (5A)
 *   - Load balance (5B)
 *   - Loadout completeness
 *   - Water logistics
 *   - Fuel range
 *   - Power systems
 *
 * @param input - All input parameters for readiness computation
 * @returns MissionReadinessResult
 */
export function computeMissionReadiness(input: ReadinessInput): MissionReadinessResult {
  const baseline = input.vehicleBaseline || DEFAULT_VEHICLE_BASELINE;

  // Phase 5A: Zone weight aggregation
  const zoneWeights = computeZoneWeightAggregation(
    input.loadoutItems,
    input.containerZones,
    input.baseWeight,
    input.gvwr,
  );

  // Phase 5B: Load bias
  const loadBias = computeLoadBias(zoneWeights, input.containerZones, baseline);

  // Score each dimension
  const dimensions: ReadinessDimension[] = [
    scoreWeight(zoneWeights),
    scoreBalance(loadBias),
    scoreLoadout(input.loadoutItems, zoneWeights),
    scoreWater(input),
    scoreFuel(input),
    scorePower(input),
  ];

  // Compute weighted overall score
  let weightedSum = 0;
  let totalWeight = 0;
  for (const dim of dimensions) {
    const w = DIMENSION_WEIGHTS[dim.id] || 0;
    weightedSum += dim.score * w;
    totalWeight += w;
  }
  const overallScore = totalWeight > 0
    ? Math.round(weightedSum / totalWeight)
    : 0;

  // Overall tier
  const overallTier: MissionReadinessResult['overallTier'] =
    overallScore >= 80 ? 'mission_ready' :
    overallScore >= 60 ? 'prepared' :
    overallScore >= 35 ? 'minimal' :
    'not_ready';

  const overallColor =
    overallTier === 'mission_ready' ? '#66BB6A' :
    overallTier === 'prepared' ? '#C48A2C' :
    overallTier === 'minimal' ? '#FFB74D' :
    '#EF5350';

  // Collect critical issues and warnings
  const criticalIssues: string[] = [];
  const warnings: string[] = [];

  for (const dim of dimensions) {
    if (dim.tier === 'critical' && dim.hasData) {
      criticalIssues.push(`${dim.label}: ${dim.detail}`);
    } else if (dim.tier === 'warning' && dim.hasData) {
      warnings.push(`${dim.label}: ${dim.detail}`);
    }
  }

  // Special critical checks
  if (zoneWeights.isOverGvwr) {
    criticalIssues.unshift('Vehicle exceeds GVWR — reduce load before departure');
  }
  if (loadBias.overallRisk === 'high') {
    criticalIssues.push('Severe load imbalance — redistribute weight');
  }

  // Summary
  const hasSufficientData = dimensions.filter(d => d.hasData).length >= 3;
  const tierLabels: Record<string, string> = {
    mission_ready: 'MISSION READY',
    prepared: 'PREPARED',
    minimal: 'MINIMAL READINESS',
    not_ready: 'NOT READY',
  };

  const summary = hasSufficientData
    ? `${tierLabels[overallTier]} — ${overallScore}% · ${criticalIssues.length} critical · ${warnings.length} warnings`
    : 'Insufficient data for full assessment — configure vehicle specs and loadout';

  return {
    overallScore,
    overallTier,
    overallColor,
    dimensions,
    criticalIssues,
    warnings,
    summary,
    hasSufficientData,
    computedAt: new Date().toISOString(),
  };
}


// ═══════════════════════════════════════════════════════════════
// CONVENIENCE HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Get the tier label for display.
 */
export function getReadinessTierLabel(tier: MissionReadinessResult['overallTier']): string {
  switch (tier) {
    case 'mission_ready': return 'MISSION READY';
    case 'prepared': return 'PREPARED';
    case 'minimal': return 'MINIMAL';
    case 'not_ready': return 'NOT READY';
  }
}

/**
 * Get a compact readiness badge for UI display.
 */
export function getReadinessBadge(result: MissionReadinessResult): {
  label: string;
  color: string;
  score: number;
  icon: string;
} {
  const icons: Record<string, string> = {
    mission_ready: 'shield-checkmark-outline',
    prepared: 'checkmark-circle-outline',
    minimal: 'alert-circle-outline',
    not_ready: 'close-circle-outline',
  };

  return {
    label: getReadinessTierLabel(result.overallTier),
    color: result.overallColor,
    score: result.overallScore,
    icon: icons[result.overallTier] || 'help-circle-outline',
  };
}



// ═══════════════════════════════════════════════════════════════
// PHASE 5D — Simplified Mission Readiness Score
//
// Deterministic deduction-based scoring for Expedition Deploy Mode.
// Base 100, deductions for specific conditions, clamp 0–100.
//
// RULES:
//   - No hooks inside this engine
//   - All functions are pure (no side effects)
//   - No hardcoded accessory types
//   - No mutation of vehicle objects
//   - Designed for memoized selectors
// ═══════════════════════════════════════════════════════════════

/**
 * Readiness level classification.
 *
 *   85–100 = optimal
 *   60–84  = caution
 *   <60    = critical
 */
export type ReadinessLevel = 'optimal' | 'caution' | 'critical';

/**
 * Simplified mission readiness result.
 *
 * Returned by calculateMissionReadiness() — the Phase 5D
 * deduction-based scoring function for Expedition Deploy Mode.
 */
export interface SimplifiedReadinessResult {
  /** Readiness score 0–100 */
  readinessScore: number;
  /** Readiness level: optimal | caution | critical */
  readinessLevel: ReadinessLevel;
  /** Color for UI display */
  readinessColor: string;
  /** Deductions applied (for transparency/debugging) */
  deductions: ReadinessDeduction[];
  /** Total deductions applied */
  totalDeductions: number;
}

/**
 * Individual deduction record for transparency.
 */
export interface ReadinessDeduction {
  /** Deduction reason */
  reason: string;
  /** Points deducted */
  points: number;
  /** Condition that triggered the deduction */
  condition: string;
}

/**

 * Input parameters for the simplified readiness calculation.
 *
 * All fields are optional — missing data is treated as "unknown"
 * and does not trigger deductions (conservative approach).
 *
 * Phase 6D: Added optional terrainRiskLevel for terrain risk penalty.
 */
export interface SimplifiedReadinessInput {
  /** Whether the loadout is complete (all critical items present, all items assigned) */
  loadoutComplete: boolean;
  /** GVWR utilization percentage (0–100+) */
  gvwrPercent: number;
  /** Rear bias percentage (0–100) from BiasProfile */
  rearBiasPercent: number;
  /** Roof load percentage (0–100) from BiasProfile — highLoad / totalLoadoutWeight */
  roofLoadPercent: number;
  /** Whether critical resources (water, fuel) are adequate for the trip */
  resourcesAdequate: boolean;
  /**
   * Phase 6D: Terrain risk level from terrainRiskEngine.
   * If provided, applies readiness penalty:
   *   high → -10
   *   critical → -20
   * If omitted, no terrain risk deduction is applied.
   */
  terrainRiskLevel?: RiskLevel;
}



/**
 * Calculate simplified mission readiness score for Expedition Deploy Mode.
 *
 * Scoring model (clean, deterministic):
 *   Base 100
 *   -20 if GVWR > 100%
 *   -10 if GVWR > 90% (not cumulative with -20)
 *   -10 if Roof load > 50%
 *   -10 if Rear bias > 70%
 *   -15 if loadout incomplete
 *   -15 if critical resource below trip threshold
 *   Phase 6D:
 *   -10 if terrainRiskLevel is 'high'
 *   -20 if terrainRiskLevel is 'critical'
 *   Clamp 0–100.
 *
 * Level rules:
 *   85–100 = optimal
 *   60–84  = caution
 *   <60    = critical
 *
 * @param input - Simplified readiness input parameters
 * @returns SimplifiedReadinessResult
 */
export function calculateMissionReadiness(input: SimplifiedReadinessInput): SimplifiedReadinessResult {
  const {
    loadoutComplete,
    gvwrPercent,
    rearBiasPercent,
    roofLoadPercent,
    resourcesAdequate,
    terrainRiskLevel,
  } = input;

  let score = 100;
  const deductions: ReadinessDeduction[] = [];

  // ── GVWR deductions (mutually exclusive: worst wins) ──
  if (gvwrPercent > 100) {
    const d = 20;
    score -= d;
    deductions.push({
      reason: 'GVWR exceeded',
      points: d,
      condition: `GVWR at ${gvwrPercent.toFixed(1)}% (> 100%)`,
    });
  } else if (gvwrPercent > 90) {
    const d = 10;
    score -= d;
    deductions.push({
      reason: 'GVWR near limit',
      points: d,
      condition: `GVWR at ${gvwrPercent.toFixed(1)}% (> 90%)`,
    });
  }

  // ── Roof load deduction ──
  if (roofLoadPercent > 50) {
    const d = 10;
    score -= d;
    deductions.push({
      reason: 'High roof load',
      points: d,
      condition: `Roof load at ${roofLoadPercent.toFixed(1)}% (> 50%)`,
    });
  }

  // ── Rear bias deduction ──
  if (rearBiasPercent > 70) {
    const d = 10;
    score -= d;
    deductions.push({
      reason: 'Excessive rear bias',
      points: d,
      condition: `Rear bias at ${rearBiasPercent.toFixed(1)}% (> 70%)`,
    });
  }

  // ── Loadout completeness deduction ──
  if (!loadoutComplete) {
    const d = 15;
    score -= d;
    deductions.push({
      reason: 'Loadout incomplete',
      points: d,
      condition: 'Loadout not marked complete',
    });
  }

  // ── Critical resource deduction ──
  if (!resourcesAdequate) {
    const d = 15;
    score -= d;
    deductions.push({
      reason: 'Critical resource deficit',
      points: d,
      condition: 'Critical resource below trip threshold',
    });
  }

  // ── Phase 6D: Terrain risk deduction ──
  // Appended cleanly — does not break existing scoring rubric.
  // Only applies when terrainRiskLevel is provided (opt-in).
  if (terrainRiskLevel === 'critical') {
    const d = 20;
    score -= d;
    deductions.push({
      reason: 'Critical terrain risk',
      points: d,
      condition: 'Terrain risk engine reports critical level',
    });
  } else if (terrainRiskLevel === 'high') {
    const d = 10;
    score -= d;
    deductions.push({
      reason: 'High terrain risk',
      points: d,
      condition: 'Terrain risk engine reports high level',
    });
  }
  // 'low' and 'moderate' terrain risk levels do not apply deductions.

  // ── Clamp 0–100 ──
  score = Math.max(0, Math.min(100, score));

  // ── Level classification ──
  const readinessLevel: ReadinessLevel =
    score >= 85 ? 'optimal' :
    score >= 60 ? 'caution' :
    'critical';

  // ── Color ──
  const readinessColor =
    readinessLevel === 'optimal' ? '#66BB6A' :
    readinessLevel === 'caution' ? '#C48A2C' :
    '#EF5350';

  const totalDeductions = deductions.reduce((sum, d) => sum + d.points, 0);

  return {
    readinessScore: score,
    readinessLevel,
    readinessColor,
    deductions,
    totalDeductions,
  };
}

/**
 * Get the readiness level label for display.
 */
export function getReadinessLevelLabel(level: ReadinessLevel): string {
  switch (level) {
    case 'optimal': return 'OPTIMAL';
    case 'caution': return 'CAUTION';
    case 'critical': return 'CRITICAL';
  }
}

/**
 * Get the readiness level icon name (Ionicons).
 */
export function getReadinessLevelIcon(level: ReadinessLevel): string {
  switch (level) {
    case 'optimal': return 'shield-checkmark-outline';
    case 'caution': return 'alert-circle-outline';
    case 'critical': return 'close-circle-outline';
  }
}

/**
 * Convenience: compute simplified readiness from zone weight data.
 *
 * Bridges the Phase 5A/5B data into the simplified readiness input.
 * Designed for use in memoized selectors that already have zone weight results.
 *
 * Phase 6D: Accepts optional terrainRiskLevel for terrain risk penalty.
 *
 * @param zoneWeightResult - Output from computeZoneWeightAggregation
 * @param biasProfile - Output from calculateBiasProfile
 * @param loadoutComplete - Whether the loadout is marked complete
 * @param resourcesAdequate - Whether critical resources meet trip thresholds
 * @param terrainRiskLevel - Optional terrain risk level from Phase 6B engine
 * @returns SimplifiedReadinessResult
 */
export function calculateMissionReadinessFromWeightData(
  zoneWeightResult: ZoneWeightResult,
  biasProfile: BiasProfile,
  loadoutComplete: boolean = false,
  resourcesAdequate: boolean = true,
  terrainRiskLevel?: RiskLevel,
): SimplifiedReadinessResult {
  return calculateMissionReadiness({
    loadoutComplete,
    gvwrPercent: zoneWeightResult.gvwrPercent,
    rearBiasPercent: biasProfile.rearBiasPercent,
    roofLoadPercent: biasProfile.highLoadPercent,
    resourcesAdequate,
    terrainRiskLevel,
  });
}


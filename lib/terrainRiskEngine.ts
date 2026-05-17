/**
 * ECS Terrain Risk Engine — Phase 6B + 6C
 *
 * Deterministic risk engine that combines:
 *   - Phase 5 load distribution + GVWR metrics
 *   - Phase 6A terrain profile modifiers
 *   - Mission context (remoteness, route progress)
 *   - Phase 6C route context awareness (progress, bailout, commitment)
 *
 * RULES:
 *   - No hooks inside this engine
 *   - All functions are pure (no side effects, no storage access)
 *   - Given identical inputs, risk output is IDENTICAL (deterministic)
 *   - No hardcoded accessory types
 *   - No mutation of input objects
 *   - Designed for memoized selectors
 *   - No ML, no physics sim — clean, readable mapping tables
 *
 * EXPORTS:
 *   calculateTerrainRiskModifiers(terrainProfile)
 *   calculateDynamicRisk({ terrainProfile, gvwrPercent, roofLoadPercent, rearBiasPercent, remotenessScore, routeStatus, routeContext? })
 *   getRiskFlags(dynamicRisk)
 */


import type {
  TerrainProfile,
  TerrainType,
  GradeLevel,
  SideSlopeRisk,
  WaterCrossingRisk,
  TractionLevel,
  RemotenessLevel,
} from './terrainProfile';
import {
  levelToNumeric,
  waterCrossingToNumeric,
} from './terrainProfile';
import type { ECSConfidenceResult } from './ai/confidenceTypes';
import { assessRouteRiskConfidence } from './ai/confidenceEngine';
import type { ECSPriorityResult } from './ai/priorityTypes';
import { assessRouteRiskPriority } from './ai/priorityEngine';
import { explainRecommendation } from './ai/recommendationExplanationEngine';
import type { ECSExplanationResult } from './ai/recommendationExplanationTypes';



// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Terrain risk modifiers — pure terrain-derived coefficients (0–1).
 *
 * These modifiers amplify or attenuate vehicle weight/distribution
 * risk factors based on the terrain being traversed.
 */
export interface TerrainRiskModifiers {
  /** Sensitivity to rollover events (0–1). High = terrain amplifies rollover risk. */
  rolloverSensitivity: number;
  /** Traction loss penalty (0–1). High = terrain reduces available traction. */
  tractionPenalty: number;
  /** Braking degradation penalty (0–1). High = terrain reduces braking effectiveness. */
  brakingPenalty: number;
  /** Likelihood of needing recovery (0–1). High = terrain increases recovery probability. */
  recoveryLikelihood: number;
}

/**
 * Route status context for dynamic risk computation.
 *
 * Represents the current state of route progress and conditions.
 * If unavailable, use 'unknown' for graceful degradation.
 */
export type RouteStatus =
  | 'not_started'
  | 'in_progress'
  | 'near_completion'
  | 'off_route'
  | 'paused'
  | 'unknown';

/**
 * Phase 6C: Route context status — lightweight runtime state.
 *
 * Represents the user's current position within a route
 * and their access to bailout options.
 *
 * This type is defined here (in the risk engine) to avoid
 * circular dependencies with routeContextEngine.
 */
export interface RouteContextStatus {
  /** Route completion percentage (0–100) */
  progressPercent: number;
  /** Estimated time to nearest bailout in minutes (if known) */
  estimatedTimeToBailoutMin?: number;
  /** Whether a bailout option is currently available/reachable */
  bailoutAvailable: boolean;
}

/**
 * Input parameters for dynamic risk computation.
 *
 * Combines Phase 5 weight/distribution metrics with Phase 6A
 * terrain profile and mission context.
 *
 * Phase 6C: Now accepts optional routeContext for progress/bailout awareness.
 */
export interface DynamicRiskInput {
  /** Phase 6A terrain profile */
  terrainProfile: TerrainProfile;
  /** GVWR utilization percentage (0–100+) from Phase 5A */
  gvwrPercent: number;
  /** Roof load percentage (0–100) from Phase 5B BiasProfile.highLoadPercent */
  roofLoadPercent: number;
  /** Rear bias percentage (0–100) from Phase 5B BiasProfile.rearBiasPercent */
  rearBiasPercent: number;
  /** Remoteness score (0–100) from remotenessStore */
  remotenessScore: number;
  /** Current route status */
  routeStatus: RouteStatus;
  /**
   * Phase 6C: Route context status.
   * If omitted, route context escalation is skipped.
   */
  routeContext?: RouteContextStatus;
}

/**
 * Risk level classification.
 *
 *   0–25  = low
 *   26–50 = moderate
 *   51–75 = high
 *   76–100 = critical
 */
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';

/**
 * Dynamic risk assessment result.
 *
 * Single composite score 0–100 with level classification
 * and human-readable driver explanations.
 */
export interface DynamicRiskResult {
  /** Composite risk score 0–100 */
  riskScore: number;
  /** Risk level classification */
  riskLevel: RiskLevel;
  /** Shared ECS confidence result for the risk assessment */
  confidence: ECSConfidenceResult;
  /** Shared ECS priority result for operational escalation */
  priority: ECSPriorityResult;
  /** Short explanations of risk drivers (non-verbose) */
  drivers: string[];
  /** Shared operator-facing explanation */
  explanation?: ECSExplanationResult | null;
  /** Terrain risk modifiers used in computation */
  terrainModifiers: TerrainRiskModifiers;
  /** Individual risk component scores for transparency */
  components: RiskComponents;
}

/**
 * Individual risk component scores (for debugging / detail views).
 *
 * Phase 6C: Added routeContextPenalty sub-component.
 */
export interface RiskComponents {
  /** Weight risk contribution (0–40) */
  weightRisk: number;
  /** Distribution risk contribution (0–25) */
  distributionRisk: number;
  /** Terrain amplification contribution (0–25) */
  terrainAmplification: number;
  /** Context risk contribution (0–10 base + 0–15 route context) */
  contextRisk: number;
  /** Phase 6C: Route context penalty sub-component (0–15), included in contextRisk */
  routeContextPenalty: number;
}

/**
 * Risk flags derived from a DynamicRiskResult.
 *
 * Boolean flags for quick UI checks — designed for badge/indicator
 * rendering without parsing the full result.
 *
 * Phase 6C: Added lateCommitment and remoteNoBailout flags.
 */
export interface RiskFlags {
  /** True if riskScore >= 76 (critical) */
  isCritical: boolean;
  /** True if riskScore >= 51 (high or critical) */
  isHighRisk: boolean;
  /** True if rollover sensitivity is elevated (> 0.5) */
  rolloverWarning: boolean;
  /** True if traction penalty is elevated (> 0.5) */
  tractionWarning: boolean;
  /** True if braking penalty is elevated (> 0.5) */
  brakingWarning: boolean;
  /** True if recovery likelihood is elevated (> 0.5) */
  recoveryWarning: boolean;
  /** True if vehicle is overweight for terrain */
  overweightForTerrain: boolean;
  /** True if roof load is risky for terrain */
  roofLoadRisky: boolean;
  /** True if rear bias is risky for terrain */
  rearBiasRisky: boolean;
  /** True if water crossing risk is present */
  waterCrossingRisk: boolean;
  /** Phase 6C: True if late-commitment escalation applies (>70% + no bailout) */
  lateCommitment: boolean;
  /** Phase 6C: True if remote-no-bailout escalation applies */
  remoteNoBailout: boolean;
  /** Number of active warnings */
  activeWarningCount: number;
}



// ═══════════════════════════════════════════════════════════════
// TERRAIN MODIFIER TABLE
//
// Clean, readable mapping from terrain profile fields to
// risk modifier coefficients. No ML, no physics sim.
//
// Each terrain type has a base modifier set. Grade, slope,
// traction, and water crossing fields then adjust the base.
// ═══════════════════════════════════════════════════════════════

/**
 * Base terrain type → modifier mapping.
 *
 * These represent the inherent risk characteristics of each
 * surface type before grade/slope/traction adjustments.
 */
const TERRAIN_TYPE_MODIFIERS: Record<TerrainType, TerrainRiskModifiers> = {
  highway: {
    rolloverSensitivity: 0.05,
    tractionPenalty: 0.02,
    brakingPenalty: 0.02,
    recoveryLikelihood: 0.02,
  },
  graded_dirt: {
    rolloverSensitivity: 0.15,
    tractionPenalty: 0.12,
    brakingPenalty: 0.10,
    recoveryLikelihood: 0.08,
  },
  forest_road: {
    rolloverSensitivity: 0.25,
    tractionPenalty: 0.18,
    brakingPenalty: 0.15,
    recoveryLikelihood: 0.15,
  },
  rocky: {
    rolloverSensitivity: 0.45,
    tractionPenalty: 0.25,
    brakingPenalty: 0.30,
    recoveryLikelihood: 0.30,
  },
  sand: {
    rolloverSensitivity: 0.20,
    tractionPenalty: 0.50,
    brakingPenalty: 0.35,
    recoveryLikelihood: 0.35,
  },
  snow_ice: {
    rolloverSensitivity: 0.30,
    tractionPenalty: 0.55,
    brakingPenalty: 0.50,
    recoveryLikelihood: 0.25,
  },
  mud: {
    rolloverSensitivity: 0.25,
    tractionPenalty: 0.60,
    brakingPenalty: 0.40,
    recoveryLikelihood: 0.45,
  },
  mixed: {
    rolloverSensitivity: 0.25,
    tractionPenalty: 0.25,
    brakingPenalty: 0.20,
    recoveryLikelihood: 0.20,
  },
};

/**
 * Grade level adjustments — additive to base modifiers.
 *
 * Steep grades increase rollover sensitivity and braking penalty.
 */
const GRADE_ADJUSTMENTS: Record<GradeLevel, Partial<TerrainRiskModifiers>> = {
  low: {},
  moderate: {
    rolloverSensitivity: 0.08,
    brakingPenalty: 0.08,
    recoveryLikelihood: 0.05,
  },
  high: {
    rolloverSensitivity: 0.18,
    brakingPenalty: 0.18,
    recoveryLikelihood: 0.12,
  },
};

/**
 * Side slope risk adjustments — additive to base modifiers.
 *
 * Side slopes primarily increase rollover sensitivity.
 */
const SIDE_SLOPE_ADJUSTMENTS: Record<SideSlopeRisk, Partial<TerrainRiskModifiers>> = {
  low: {},
  moderate: {
    rolloverSensitivity: 0.10,
    recoveryLikelihood: 0.04,
  },
  high: {
    rolloverSensitivity: 0.22,
    recoveryLikelihood: 0.10,
  },
};

/**
 * Traction level adjustments — additive to base modifiers.
 *
 * Poor traction increases traction penalty and recovery likelihood.
 */
const TRACTION_ADJUSTMENTS: Record<TractionLevel, Partial<TerrainRiskModifiers>> = {
  good: {},
  variable: {
    tractionPenalty: 0.08,
    brakingPenalty: 0.05,
    recoveryLikelihood: 0.05,
  },
  poor: {
    tractionPenalty: 0.18,
    brakingPenalty: 0.12,
    recoveryLikelihood: 0.12,
  },
};

/**
 * Water crossing adjustments — additive to base modifiers.
 *
 * Water crossings increase recovery likelihood and traction penalty.
 * Likely crossings also increase braking penalty (wet brakes).
 */
const WATER_CROSSING_ADJUSTMENTS: Record<WaterCrossingRisk, Partial<TerrainRiskModifiers>> = {
  none: {},
  possible: {
    tractionPenalty: 0.05,
    recoveryLikelihood: 0.08,
  },
  likely: {
    tractionPenalty: 0.12,
    brakingPenalty: 0.08,
    recoveryLikelihood: 0.15,
  },
};

/**
 * Remoteness level adjustments — additive to recovery likelihood.
 *
 * Higher remoteness means recovery is harder if something goes wrong.
 */
const REMOTENESS_ADJUSTMENTS: Record<RemotenessLevel, Partial<TerrainRiskModifiers>> = {
  low: {},
  moderate: {
    recoveryLikelihood: 0.06,
  },
  high: {
    recoveryLikelihood: 0.14,
  },
};


// ═══════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate terrain risk modifiers from a terrain profile.
 *
 * Combines base terrain type modifiers with adjustments for
 * grade, side slope, traction, water crossings, and remoteness.
 * All values clamped to 0–1.
 *
 * This is a pure function — no side effects, no hooks.
 *
 * @param terrainProfile - Phase 6A terrain profile
 * @returns TerrainRiskModifiers (all values 0–1)
 */
export function calculateTerrainRiskModifiers(
  terrainProfile: TerrainProfile,
): TerrainRiskModifiers {
  // Start with base terrain type modifiers
  const base = TERRAIN_TYPE_MODIFIERS[terrainProfile.terrainType]
    ?? TERRAIN_TYPE_MODIFIERS.mixed;

  // Accumulate adjustments
  const gradeAdj = GRADE_ADJUSTMENTS[terrainProfile.steepGrade] ?? {};
  const slopeAdj = SIDE_SLOPE_ADJUSTMENTS[terrainProfile.sideSlopeRisk] ?? {};
  const tractionAdj = TRACTION_ADJUSTMENTS[terrainProfile.traction] ?? {};
  const waterAdj = WATER_CROSSING_ADJUSTMENTS[terrainProfile.waterCrossings] ?? {};
  const remoteAdj = REMOTENESS_ADJUSTMENTS[terrainProfile.remoteness] ?? {};

  // Sum all adjustments per modifier
  const sum = (
    baseVal: number,
    ...adjustments: (number | undefined)[]
  ): number => {
    let total = baseVal;
    for (const adj of adjustments) {
      if (adj != null) total += adj;
    }
    return clamp01(total);
  };

  return {
    rolloverSensitivity: sum(
      base.rolloverSensitivity,
      gradeAdj.rolloverSensitivity,
      slopeAdj.rolloverSensitivity,
      tractionAdj.rolloverSensitivity,
      waterAdj.rolloverSensitivity,
      remoteAdj.rolloverSensitivity,
    ),
    tractionPenalty: sum(
      base.tractionPenalty,
      gradeAdj.tractionPenalty,
      slopeAdj.tractionPenalty,
      tractionAdj.tractionPenalty,
      waterAdj.tractionPenalty,
      remoteAdj.tractionPenalty,
    ),
    brakingPenalty: sum(
      base.brakingPenalty,
      gradeAdj.brakingPenalty,
      slopeAdj.brakingPenalty,
      tractionAdj.brakingPenalty,
      waterAdj.brakingPenalty,
      remoteAdj.brakingPenalty,
    ),
    recoveryLikelihood: sum(
      base.recoveryLikelihood,
      gradeAdj.recoveryLikelihood,
      slopeAdj.recoveryLikelihood,
      tractionAdj.recoveryLikelihood,
      waterAdj.recoveryLikelihood,
      remoteAdj.recoveryLikelihood,
    ),
  };
}


/**
 * Calculate dynamic risk score combining weight, distribution,
 * terrain modifiers, and mission context.
 *
 * Scoring model:
 *
 *   1. WEIGHT RISK (0–40 points)
 *      - GVWR utilization drives base weight risk
 *      - Terrain traction penalty amplifies overweight risk
 *
 *   2. DISTRIBUTION RISK (0–25 points)
 *      - Roof load % amplified by rollover sensitivity
 *      - Rear bias % amplified by braking penalty
 *
 *   3. TERRAIN AMPLIFICATION (0–25 points)
 *      - Pure terrain difficulty contribution
 *      - Rollover sensitivity × side slope interaction
 *      - Recovery likelihood × remoteness interaction
 *
 *   4. CONTEXT RISK (0–10 points)
 *      - Route status adjustments
 *      - Remoteness score contribution
 *
 * Total clamped to 0–100.
 *
 * This is a pure function — no side effects, no hooks.
 * Given identical inputs, output is IDENTICAL (deterministic).
 *
 * @param input - Dynamic risk input parameters
 * @returns DynamicRiskResult
 */
export function calculateDynamicRisk(input: DynamicRiskInput): DynamicRiskResult {
  const {
    terrainProfile,
    gvwrPercent,
    roofLoadPercent,
    rearBiasPercent,
    remotenessScore,
    routeStatus,
    routeContext,
  } = input;

  const modifiers = calculateTerrainRiskModifiers(terrainProfile);
  const drivers: string[] = [];

  // ═══════════════════════════════════════════════════════════
  // 1. WEIGHT RISK (0–40 points)
  //
  // Base: GVWR utilization mapped to 0–30 range
  // Amplification: traction penalty increases weight risk
  //   (overweight + poor traction = compounding danger)
  // ═══════════════════════════════════════════════════════════

  let weightRisk = 0;

  if (gvwrPercent > 100) {
    // Over GVWR: severe base risk
    const overBy = gvwrPercent - 100;
    weightRisk = 25 + Math.min(15, overBy * 1.5);
    drivers.push(`Over GVWR by ${overBy.toFixed(0)}%`);
  } else if (gvwrPercent > 90) {
    // Near GVWR: moderate base risk
    weightRisk = 12 + (gvwrPercent - 90) * 1.3;
    drivers.push(`GVWR at ${gvwrPercent.toFixed(0)}%`);
  } else if (gvwrPercent > 75) {
    // Moderate load: low base risk
    weightRisk = (gvwrPercent - 75) * 0.8;
  }
  // else: under 75% GVWR = negligible weight risk

  // Traction amplification: poor traction makes heavy vehicles worse
  if (modifiers.tractionPenalty > 0.3 && gvwrPercent > 80) {
    const tractionAmp = modifiers.tractionPenalty * (gvwrPercent - 80) * 0.08;
    weightRisk += tractionAmp;
    if (tractionAmp > 2) {
      drivers.push(`Weight + poor traction on ${terrainProfile.terrainType}`);
    }
  }

  weightRisk = clamp(weightRisk, 0, 40);

  // ═══════════════════════════════════════════════════════════
  // 2. DISTRIBUTION RISK (0–25 points)
  //
  // Roof load amplified by rollover sensitivity
  //   (high CG + terrain that tips = danger)
  // Rear bias amplified by braking penalty
  //   (rear-heavy + terrain that reduces braking = danger)
  // ═══════════════════════════════════════════════════════════

  let distributionRisk = 0;

  // Roof load risk: base contribution + terrain amplification
  if (roofLoadPercent > 30) {
    const roofBase = (roofLoadPercent - 30) * 0.15;
    const roofAmplified = roofBase * (1 + modifiers.rolloverSensitivity * 1.8);
    distributionRisk += roofAmplified;

    if (roofLoadPercent > 50 && modifiers.rolloverSensitivity > 0.3) {
      drivers.push(`High roof load (${roofLoadPercent.toFixed(0)}%) on rollover-prone terrain`);
    } else if (roofLoadPercent > 50) {
      drivers.push(`High roof load at ${roofLoadPercent.toFixed(0)}%`);
    }
  }

  // Rear bias risk: base contribution + braking amplification
  if (rearBiasPercent > 55) {
    const rearBase = (rearBiasPercent - 55) * 0.12;
    const rearAmplified = rearBase * (1 + modifiers.brakingPenalty * 1.5);
    distributionRisk += rearAmplified;

    if (rearBiasPercent > 70 && modifiers.brakingPenalty > 0.3) {
      drivers.push(`Rear bias (${rearBiasPercent.toFixed(0)}%) with degraded braking`);
    } else if (rearBiasPercent > 70) {
      drivers.push(`Excessive rear bias at ${rearBiasPercent.toFixed(0)}%`);
    }
  }

  // Cross-interaction: high roof + high rear = compounding instability
  if (roofLoadPercent > 40 && rearBiasPercent > 60) {
    const crossPenalty = ((roofLoadPercent - 40) / 60) * ((rearBiasPercent - 60) / 40) * 5;
    distributionRisk += crossPenalty;
    if (crossPenalty > 2) {
      drivers.push('Combined high CG + rear bias instability');
    }
  }

  distributionRisk = clamp(distributionRisk, 0, 25);

  // ═══════════════════════════════════════════════════════════
  // 3. TERRAIN AMPLIFICATION (0–25 points)
  //
  // Pure terrain difficulty contribution independent of vehicle.
  // Rollover sensitivity × side slope interaction.
  // Recovery likelihood × remoteness interaction.
  // Water crossing risk contribution.
  // ═══════════════════════════════════════════════════════════

  let terrainAmplification = 0;

  // Base terrain difficulty from modifier magnitudes
  const avgModifier = (
    modifiers.rolloverSensitivity +
    modifiers.tractionPenalty +
    modifiers.brakingPenalty +
    modifiers.recoveryLikelihood
  ) / 4;
  terrainAmplification += avgModifier * 12;

  // Side slope × rollover sensitivity interaction
  const slopeNumeric = levelToNumeric(terrainProfile.sideSlopeRisk);
  if (slopeNumeric >= 2 && modifiers.rolloverSensitivity > 0.3) {
    const slopeInteraction = (slopeNumeric - 1) * modifiers.rolloverSensitivity * 4;
    terrainAmplification += slopeInteraction;
    if (slopeInteraction > 2) {
      drivers.push(`Side slope risk on ${terrainProfile.terrainType} terrain`);
    }
  }

  // Recovery likelihood × remoteness interaction
  const remoteNumeric = levelToNumeric(terrainProfile.remoteness);
  if (modifiers.recoveryLikelihood > 0.3 && remoteNumeric >= 2) {
    const recoveryInteraction = modifiers.recoveryLikelihood * (remoteNumeric - 1) * 3;
    terrainAmplification += recoveryInteraction;
    if (recoveryInteraction > 2) {
      drivers.push('Remote location with high recovery likelihood');
    }
  }

  // Water crossing contribution
  const waterNumeric = waterCrossingToNumeric(terrainProfile.waterCrossings);
  if (waterNumeric >= 1) {
    const waterContrib = waterNumeric * 2.5;
    terrainAmplification += waterContrib;
    if (waterNumeric >= 2) {
      drivers.push('Likely water crossings — stall/electrical risk');
    }
  }

  terrainAmplification = clamp(terrainAmplification, 0, 25);

  // ═══════════════════════════════════════════════════════════
  // 4. CONTEXT RISK (0–10 base + 0–15 route context penalty)
  //
  // Base: Route status adjustments + remoteness score.
  // Phase 6C: Route context penalty from progress + bailout.
  //
  // ESCALATION RULES (Phase 6C):
  //   Rule 1: remoteness >= 60 + no bailout → +8 penalty
  //   Rule 2: progress > 70% + no bailout → +7 penalty
  //   Rule 3: progress < 30% → reduce penalty by 40%
  // ═══════════════════════════════════════════════════════════

  let contextRisk = 0;
  let routeCtxPenalty = 0;

  // Remoteness score contribution (0–5 points)
  // remotenessScore is 0–100, map to 0–5
  contextRisk += (remotenessScore / 100) * 5;

  // Route status adjustments
  switch (routeStatus) {
    case 'off_route':
      contextRisk += 4;
      drivers.push('Off-route — unfamiliar terrain');
      break;
    case 'not_started':
      contextRisk += 1;
      break;
    case 'paused':
      contextRisk += 0.5;
      break;
    case 'in_progress':
    case 'near_completion':
    case 'unknown':
    default:
      break;
  }

  contextRisk = clamp(contextRisk, 0, 10);

  // ── Phase 6C: Route Context Penalty ──────────────────────
  // Inline computation (avoids circular dependency with routeContextEngine)
  if (routeContext) {
    const progress = clamp(routeContext.progressPercent, 0, 100);
    const hasBailout = routeContext.bailoutAvailable;
    const isHighRemoteness = remotenessScore >= 60;

    // Rule 1: High remoteness + no bailout → +8 penalty
    if (isHighRemoteness && !hasBailout) {
      routeCtxPenalty += 8;
      drivers.push('Remote with no bailout available');
    }

    // Rule 2: Late commitment (>70%) + no bailout → +7 penalty
    if (progress > 70 && !hasBailout) {
      routeCtxPenalty += 7;
      drivers.push(`${Math.round(progress)}% committed — no bailout`);
    }

    // Rule 3: Early route (<30%) → reduce penalty by 40%
    if (progress < 30 && routeCtxPenalty > 0) {
      routeCtxPenalty = Math.round(routeCtxPenalty * 0.6);
      if (routeCtxPenalty > 0) {
        drivers.push('Early route position (reduced penalty)');
      }
    }

    // Bailout time penalty: bailout exists but is far away
    if (hasBailout && routeContext.estimatedTimeToBailoutMin != null) {
      const bailoutMin = routeContext.estimatedTimeToBailoutMin;
      if (bailoutMin > 120) {
        routeCtxPenalty += 3;
        drivers.push(`Bailout ${Math.round(bailoutMin / 60)}h away`);
      } else if (bailoutMin > 60) {
        routeCtxPenalty += 1;
      }
    }

    // Mid-route no-bailout (40–70%): smaller penalty
    if (progress > 40 && progress <= 70 && !hasBailout) {
      const midPenalty = Math.round(((progress - 40) / 30) * 3);
      routeCtxPenalty += midPenalty;
      if (midPenalty >= 2) {
        drivers.push(`${Math.round(progress)}% into route without bailout`);
      }
    }

    routeCtxPenalty = clamp(routeCtxPenalty, 0, 15);
  }

  // ═══════════════════════════════════════════════════════════
  // COMPOSITE SCORE
  // ═══════════════════════════════════════════════════════════

  const rawScore = weightRisk + distributionRisk + terrainAmplification + contextRisk + routeCtxPenalty;
  let riskScore = clamp(Math.round(rawScore), 0, 100);

  // ── Phase 6C: Level Escalation ──────────────────────────
  // After computing the base score, apply level escalation
  // for route context conditions. This ensures the LEVEL
  // can be bumped even if the score penalty alone wouldn't
  // cross a threshold.
  let riskLevel = classifyRiskLevel(riskScore);

  if (routeContext) {
    const progress = clamp(routeContext.progressPercent, 0, 100);
    const hasBailout = routeContext.bailoutAvailable;
    const isHighRemoteness = remotenessScore >= 60;

    let escalationSteps = 0;

    // Rule 1 escalation: high remoteness + no bailout → +1 level
    if (isHighRemoteness && !hasBailout) {
      escalationSteps += 1;
    }

    // Rule 2 escalation: late commitment + no bailout → +1 level
    if (progress > 70 && !hasBailout) {
      escalationSteps += 1;
    }

    // Rule 3: early route reduces escalation
    if (progress < 30 && escalationSteps > 0) {
      const reduction = Math.ceil(escalationSteps * 0.4);
      escalationSteps = Math.max(0, escalationSteps - reduction);
    }

    // Apply escalation (cap at critical)
    if (escalationSteps > 0) {
      riskLevel = escalateRiskLevel(riskLevel, escalationSteps);
    }
  }

  // Ensure at least one driver explanation
  if (drivers.length === 0) {
    if (riskScore <= 10) {
      drivers.push('Low overall risk');
    } else if (riskScore <= 25) {
      drivers.push('Minimal risk factors');
    } else {
      drivers.push('Moderate combined risk factors');
    }
  }

  const confidence = assessRouteRiskConfidence({
    hasTerrainProfile: !!terrainProfile,
    hasWeightProfile: gvwrPercent > 0 || roofLoadPercent > 0 || rearBiasPercent > 0,
    hasRouteContext: !!routeContext || routeStatus !== 'unknown',
    hasWeatherCoverage: false,
  });
  const priority = assessRouteRiskPriority({
    riskLevel,
    riskScore,
    routeActive:
      routeStatus === 'in_progress' ||
      routeStatus === 'near_completion' ||
      routeStatus === 'off_route',
    remotenessScore,
    bailoutAvailable: routeContext?.bailoutAvailable,
    confidence,
    driver: drivers[0] ?? null,
  });
  const explanation = explainRecommendation({
    type: 'route_risk',
    drivers,
    confidenceLevel: confidence.level,
    priorityLevel: priority.level,
  });

  return {
    riskScore,
    riskLevel,
    confidence,
    priority,
    drivers,
    explanation,
    terrainModifiers: modifiers,
    components: {
      weightRisk: Math.round(weightRisk * 10) / 10,
      distributionRisk: Math.round(distributionRisk * 10) / 10,
      terrainAmplification: Math.round(terrainAmplification * 10) / 10,
      contextRisk: Math.round((contextRisk + routeCtxPenalty) * 10) / 10,
      routeContextPenalty: Math.round(routeCtxPenalty * 10) / 10,
    },
  };
}



/**
 * Extract boolean risk flags from a dynamic risk result.
 *
 * Designed for quick UI checks — badge/indicator rendering
 * without parsing the full result object.
 *
 * @param dynamicRisk - Output from calculateDynamicRisk()
 * @returns RiskFlags — boolean flags for UI rendering
 */
export function getRiskFlags(dynamicRisk: DynamicRiskResult): RiskFlags {
  const { riskScore, terrainModifiers } = dynamicRisk;

  const rolloverWarning = terrainModifiers.rolloverSensitivity > 0.5;
  const tractionWarning = terrainModifiers.tractionPenalty > 0.5;
  const brakingWarning = terrainModifiers.brakingPenalty > 0.5;
  const recoveryWarning = terrainModifiers.recoveryLikelihood > 0.5;

  // Derive vehicle-specific flags from drivers
  const overweightForTerrain = dynamicRisk.drivers.some(
    d => d.includes('GVWR') || d.includes('Over GVWR') || d.includes('Weight + poor traction')
  );
  const roofLoadRisky = dynamicRisk.drivers.some(
    d => d.includes('roof load') || d.includes('Combined high CG')
  );
  const rearBiasRisky = dynamicRisk.drivers.some(
    d => d.includes('Rear bias') || d.includes('rear bias')
  );
  const waterCrossingRisk = dynamicRisk.drivers.some(
    d => d.includes('water crossing') || d.includes('Water crossing')
  );

  // Phase 6C: Route context flags
  const lateCommitment = dynamicRisk.drivers.some(
    d => d.includes('committed') && d.includes('no bailout')
  );
  const remoteNoBailout = dynamicRisk.drivers.some(
    d => d.includes('Remote with no bailout')
  );

  const warnings = [
    rolloverWarning,
    tractionWarning,
    brakingWarning,
    recoveryWarning,
    overweightForTerrain,
    roofLoadRisky,
    rearBiasRisky,
    waterCrossingRisk,
    lateCommitment,
    remoteNoBailout,
  ];

  return {
    isCritical: riskScore >= 76,
    isHighRisk: riskScore >= 51,
    rolloverWarning,
    tractionWarning,
    brakingWarning,
    recoveryWarning,
    overweightForTerrain,
    roofLoadRisky,
    rearBiasRisky,
    waterCrossingRisk,
    lateCommitment,
    remoteNoBailout,
    activeWarningCount: warnings.filter(Boolean).length,
  };
}



// ═══════════════════════════════════════════════════════════════
// CONVENIENCE HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Classify a risk score into a risk level.
 *
 *   0–25  = low
 *   26–50 = moderate
 *   51–75 = high
 *   76–100 = critical
 */
export function classifyRiskLevel(score: number): RiskLevel {
  if (score >= 76) return 'critical';
  if (score >= 51) return 'high';
  if (score >= 26) return 'moderate';
  return 'low';
}

/**
 * Get the display color for a risk level.
 */
export function getRiskLevelColor(level: RiskLevel): string {
  switch (level) {
    case 'critical': return '#C0392B';
    case 'high':     return '#EF5350';
    case 'moderate': return '#E67E22';
    case 'low':      return '#4CAF50';
  }
}

/**
 * Get the display label for a risk level.
 */
export function getRiskLevelLabel(level: RiskLevel): string {
  switch (level) {
    case 'critical': return 'CRITICAL';
    case 'high':     return 'HIGH RISK';
    case 'moderate': return 'MODERATE';
    case 'low':      return 'LOW RISK';
  }
}

/**
 * Get the Ionicons icon name for a risk level.
 */
export function getRiskLevelIcon(level: RiskLevel): string {
  switch (level) {
    case 'critical': return 'skull-outline';
    case 'high':     return 'warning-outline';
    case 'moderate': return 'alert-circle-outline';
    case 'low':      return 'shield-checkmark-outline';
  }
}

/**
 * Get a compact risk summary string.
 *
 * Example: "HIGH RISK (67) — 3 factors"
 */
export function getRiskSummary(result: DynamicRiskResult): string {
  const label = getRiskLevelLabel(result.riskLevel);
  const factorCount = result.drivers.length;
  return `${label} (${result.riskScore}) — ${factorCount} factor${factorCount !== 1 ? 's' : ''}`;
}

/**
 * Get the dominant risk component label.
 *
 * Returns the name of the highest-scoring risk component.
 */
export function getDominantRiskComponent(result: DynamicRiskResult): string {
  const { components } = result;
  const entries: [string, number][] = [
    ['Weight', components.weightRisk],
    ['Distribution', components.distributionRisk],
    ['Terrain', components.terrainAmplification],
    ['Context', components.contextRisk],
  ];

  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/**
 * Check if terrain modifiers warrant a specific warning type.
 *
 * Useful for Attitude Monitor caution badges.
 */
export function getTerrainWarningType(
  modifiers: TerrainRiskModifiers,
): 'rollover' | 'traction' | 'braking' | 'recovery' | null {
  // Return the most severe warning
  const entries: [string, number][] = [
    ['rollover', modifiers.rolloverSensitivity],
    ['traction', modifiers.tractionPenalty],
    ['braking', modifiers.brakingPenalty],
    ['recovery', modifiers.recoveryLikelihood],
  ];

  entries.sort((a, b) => b[1] - a[1]);
  const [type, value] = entries[0];

  if (value > 0.5) return type as any;
  return null;
}


// ═══════════════════════════════════════════════════════════════
// BRIDGE FUNCTIONS
//
// Convenience functions that bridge Phase 5 and Phase 6A data
// into the dynamic risk engine without requiring callers to
// manually assemble the DynamicRiskInput.
// ═══════════════════════════════════════════════════════════════

/**
 * Compute dynamic risk from Phase 5 weight data and Phase 6A terrain profile.
 *
 * Convenience bridge that assembles DynamicRiskInput from existing
 * Phase 5 outputs (ZoneWeightResult + BiasProfile) and Phase 6A
 * terrain profile, plus runtime context.
 *
 * Phase 6C: Now accepts optional routeContext for progress/bailout awareness.
 *
 * @param terrainProfile - Phase 6A terrain profile
 * @param gvwrPercent - From Phase 5A ZoneWeightResult.gvwrPercent
 * @param roofLoadPercent - From Phase 5B BiasProfile.highLoadPercent
 * @param rearBiasPercent - From Phase 5B BiasProfile.rearBiasPercent
 * @param remotenessScore - From remotenessStore (0–100), default 25
 * @param routeStatus - Current route status, default 'unknown'
 * @param routeContext - Phase 6C route context (optional)
 * @returns DynamicRiskResult
 */
export function computeDynamicRiskFromPhaseData(
  terrainProfile: TerrainProfile,
  gvwrPercent: number,
  roofLoadPercent: number,
  rearBiasPercent: number,
  remotenessScore: number = 25,
  routeStatus: RouteStatus = 'unknown',
  routeContext?: RouteContextStatus,
): DynamicRiskResult {
  return calculateDynamicRisk({
    terrainProfile,
    gvwrPercent,
    roofLoadPercent,
    rearBiasPercent,
    remotenessScore,
    routeStatus,
    routeContext,
  });
}


// ═══════════════════════════════════════════════════════════════
// INTERNAL UTILITIES
// ═══════════════════════════════════════════════════════════════

/** Risk level ordering for escalation */
const RISK_LEVEL_ORDER: RiskLevel[] = ['low', 'moderate', 'high', 'critical'];

/**
 * Escalate a risk level by N steps.
 *
 * Order: low → moderate → high → critical
 * Caps at critical.
 */
function escalateRiskLevel(level: RiskLevel, steps: number): RiskLevel {
  if (steps <= 0) return level;
  const currentIdx = RISK_LEVEL_ORDER.indexOf(level);
  const newIdx = Math.min(currentIdx + steps, RISK_LEVEL_ORDER.length - 1);
  return RISK_LEVEL_ORDER[newIdx];
}

/** Clamp a value to 0–1 range */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Clamp a value to a min–max range */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}


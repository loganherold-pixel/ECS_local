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


// ═══════════════════════════════════════════════════════════════
// TERRAIN RISK V1
//
// Conservative route-terrain readiness signal for Active Trip and
// Offline Incident Packet surfaces. This v1 API uses only existing route
// authority, geometry status, vehicle, weather, remoteness, elevation/grade,
// and confidence metadata. It does not fetch terrain data or infer trail
// terrain from approach guidance.
// ═══════════════════════════════════════════════════════════════

export const TERRAIN_RISK_V1_CATEGORIES = [
  'low',
  'moderate',
  'elevated',
  'severe',
  'unknown',
] as const;

export type TerrainRiskV1Category = typeof TERRAIN_RISK_V1_CATEGORIES[number];
export type TerrainRiskV1DataState =
  | 'unknown'
  | 'unavailable'
  | 'stale'
  | 'demo'
  | 'mock'
  | 'partial'
  | 'available'
  | 'live'
  | 'verified';
export type TerrainRiskV1ReasonTone = 'positive' | 'watch' | 'caution' | 'critical' | 'neutral';

export type TerrainRiskV1Reason = {
  id: string;
  label: string;
  tone: TerrainRiskV1ReasonTone;
};

export type TerrainRiskV1StatusInput = {
  status?: string | null;
  label?: string | null;
  score?: number | null;
  risk?: string | null;
};

export type TerrainRiskV1Input = {
  route?: {
    authorityStatus?: string | null;
    authorityLabel?: string | null;
    geometryStatus?: string | null;
    geometrySource?: string | null;
    geometryValid?: boolean | null;
    distanceMiles?: number | null;
    trailDifficulty?: string | number | null;
  } | null;
  vehicle?: {
    status?: 'complete' | 'incomplete' | 'missing' | 'unknown' | string | null;
    label?: string | null;
    vehicleType?: string | null;
    rangeMiles?: number | null;
  } | null;
  weather?: TerrainRiskV1StatusInput | null;
  daylight?: TerrainRiskV1StatusInput | null;
  remoteness?: TerrainRiskV1StatusInput | null;
  elevation?: TerrainRiskV1StatusInput | null;
  dataState?: TerrainRiskV1DataState | string | null;
};

export type TerrainRiskV1Result = {
  category: TerrainRiskV1Category;
  label: string;
  score: number | null;
  headline: string;
  riskReasons: TerrainRiskV1Reason[];
  missingDataReasons: TerrainRiskV1Reason[];
  route: {
    authorityStatus: string;
    authorityLabel: string;
    geometryStatus: string;
    geometrySource: string | null;
    geometryValid: boolean;
    distanceMiles: number | null;
    trailDifficulty: string | null;
  };
  vehicle: {
    status: 'complete' | 'incomplete' | 'missing' | 'unknown';
    label: string | null;
  };
  weather: {
    status: TerrainRiskV1DataState | string;
    label: string | null;
  };
  daylight: {
    status: TerrainRiskV1DataState | string;
    label: string | null;
  };
  remoteness: {
    status: TerrainRiskV1DataState | string;
    label: string | null;
  };
  elevation: {
    status: TerrainRiskV1DataState | string;
    label: string | null;
  };
  dataConfidence: {
    state: TerrainRiskV1DataState;
    knownLimitations: string[];
  };
  recommendedAction: {
    id:
      | 'verify_trail_geometry'
      | 'complete_vehicle_profile'
      | 'review_weather'
      | 'review_remoteness'
      | 'review_elevation_grade'
      | 'proceed_with_caution'
      | 'reduce_terrain_exposure';
    label: string;
  };
};

type TerrainRiskSnapshotLike = {
  route?: TerrainRiskV1Input['route'] & {
    authorityStatus?: string | null;
    authorityLabel?: string | null;
  } | null;
  vehicle?: {
    id?: string | null;
    label?: string | null;
    vehicleType?: string | null;
    rangeMiles?: number | null;
  } | null;
  routeConfidence?: {
    metadata?: {
      weatherStatus?: string | null;
    } | null;
    dataConfidence?: {
      state?: string | null;
      knownLimitations?: string[];
    } | null;
    knownLimitations?: string[];
  } | null;
  freshness?: {
    state?: string | null;
  } | null;
};

type TerrainRiskPacketLike = {
  route?: TerrainRiskSnapshotLike['route'] | null;
  vehicle?: TerrainRiskSnapshotLike['vehicle'] | null;
  confidence?: {
    knownLimitations?: string[];
  } | null;
  dataFreshness?: {
    state?: string | null;
  } | null;
};

function cleanTerrainText(value: unknown): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function terrainToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function terrainNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTerrainDataState(value: unknown): TerrainRiskV1DataState | string {
  const normalized = terrainToken(value);
  switch (normalized) {
    case 'available':
    case 'unknown':
    case 'unavailable':
    case 'stale':
    case 'demo':
    case 'mock':
    case 'partial':
    case 'live':
    case 'verified':
      return normalized;
    case 'mocked':
      return 'mock';
    case '':
      return 'unknown';
    default:
      return normalized;
  }
}

export function terrainRiskV1Label(category: TerrainRiskV1Category): string {
  switch (category) {
    case 'low':
      return 'Low';
    case 'moderate':
      return 'Moderate';
    case 'elevated':
      return 'Elevated';
    case 'severe':
      return 'Severe';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

function addTerrainReason(
  list: TerrainRiskV1Reason[],
  id: string,
  label: string,
  tone: TerrainRiskV1ReasonTone,
): void {
  if (list.some((reason) => reason.id === id)) return;
  list.push({ id, label, tone });
}

function terrainCategoryFromScore(score: number): TerrainRiskV1Category {
  if (score >= 76) return 'severe';
  if (score >= 51) return 'elevated';
  if (score >= 26) return 'moderate';
  return 'low';
}

function terrainRecommendedAction(
  category: TerrainRiskV1Category,
  missing: TerrainRiskV1Reason[],
): TerrainRiskV1Result['recommendedAction'] {
  const missingIds = new Set(missing.map((reason) => reason.id));
  if (missingIds.has('approach_only') || missingIds.has('trailhead_guidance') || missingIds.has('route_geometry_missing') || missingIds.has('demo_route') || missingIds.has('preview_geometry')) {
    return { id: 'verify_trail_geometry', label: 'Verify trail terrain' };
  }
  if (missingIds.has('vehicle_missing') || missingIds.has('vehicle_incomplete')) {
    return { id: 'complete_vehicle_profile', label: 'Complete vehicle profile' };
  }
  if (missingIds.has('weather_unavailable') || missingIds.has('weather_unknown')) {
    return { id: 'review_weather', label: 'Review weather before departure' };
  }
  if (missingIds.has('remoteness_unknown')) {
    return { id: 'review_remoteness', label: 'Review remoteness context' };
  }
  if (missingIds.has('elevation_unavailable')) {
    return { id: 'review_elevation_grade', label: 'Review elevation and grade' };
  }
  if (category === 'elevated' || category === 'severe') {
    return { id: 'reduce_terrain_exposure', label: 'Reduce terrain exposure' };
  }
  return { id: 'proceed_with_caution', label: 'Proceed with caution' };
}

function terrainDifficultyRisk(value: string | number | null): { label: string | null; score: number } {
  const numeric = terrainNumber(value);
  if (numeric != null) {
    if (numeric >= 8) return { label: String(value), score: 34 };
    if (numeric >= 5) return { label: String(value), score: 20 };
    if (numeric >= 3) return { label: String(value), score: 12 };
    return { label: String(value), score: 3 };
  }

  const difficulty = terrainToken(value);
  if (!difficulty) return { label: null, score: 0 };
  if (['severe', 'extreme', 'black_diamond'].includes(difficulty)) return { label: difficulty.replace(/_/g, ' '), score: 36 };
  if (['hard', 'difficult', 'technical', 'high'].includes(difficulty)) return { label: difficulty.replace(/_/g, ' '), score: 26 };
  if (['moderate', 'medium'].includes(difficulty)) return { label: difficulty.replace(/_/g, ' '), score: 14 };
  if (['easy', 'low', 'graded'].includes(difficulty)) return { label: difficulty.replace(/_/g, ' '), score: 4 };
  return { label: difficulty.replace(/_/g, ' '), score: 10 };
}

function terrainVehicleStatus(vehicle: TerrainRiskV1Input['vehicle']): TerrainRiskV1Result['vehicle']['status'] {
  const explicit = terrainToken(vehicle?.status);
  if (explicit === 'complete' || explicit === 'incomplete' || explicit === 'missing' || explicit === 'unknown') {
    return explicit;
  }
  if (!vehicle) return 'missing';
  if (!cleanTerrainText(vehicle.label) || !cleanTerrainText(vehicle.vehicleType) || terrainNumber(vehicle.rangeMiles) == null) {
    return 'incomplete';
  }
  return 'complete';
}

function buildUnknownTerrainResult(
  input: TerrainRiskV1Input,
  missing: TerrainRiskV1Reason[],
  riskReasons: TerrainRiskV1Reason[] = [],
  dataState: TerrainRiskV1DataState = 'partial',
): TerrainRiskV1Result {
  const route = normalizeTerrainRoute(input);
  const vehicleStatus = terrainVehicleStatus(input.vehicle);
  const knownLimitations = Array.from(new Set(missing.map((reason) => reason.label)));
  const recommendedAction = terrainRecommendedAction('unknown', missing);

  return {
    category: 'unknown',
    label: terrainRiskV1Label('unknown'),
    score: null,
    headline: `${terrainRiskV1Label('unknown')} - ${recommendedAction.label}`,
    riskReasons,
    missingDataReasons: missing,
    route,
    vehicle: {
      status: vehicleStatus,
      label: cleanTerrainText(input.vehicle?.label),
    },
    weather: terrainStatusSummary(input.weather),
    daylight: terrainStatusSummary(input.daylight),
    remoteness: terrainStatusSummary(input.remoteness),
    elevation: terrainStatusSummary(input.elevation),
    dataConfidence: {
      state: dataState,
      knownLimitations,
    },
    recommendedAction,
  };
}

function normalizeTerrainRoute(input: TerrainRiskV1Input): TerrainRiskV1Result['route'] {
  return {
    authorityStatus: terrainToken(input.route?.authorityStatus) || 'unknown',
    authorityLabel: cleanTerrainText(input.route?.authorityLabel) ?? 'Unknown Route Authority',
    geometryStatus: terrainToken(input.route?.geometryStatus) || 'unknown',
    geometrySource: cleanTerrainText(input.route?.geometrySource),
    geometryValid: input.route?.geometryValid === true,
    distanceMiles: terrainNumber(input.route?.distanceMiles),
    trailDifficulty: cleanTerrainText(input.route?.trailDifficulty),
  };
}

function terrainStatusSummary(input: TerrainRiskV1StatusInput | null | undefined): TerrainRiskV1Result['weather'] {
  return {
    status: normalizeTerrainDataState(input?.status),
    label: cleanTerrainText(input?.label),
  };
}

function routeHasVerifiedTrailTerrain(route: TerrainRiskV1Result['route']): boolean {
  const trueTrailGeometry = ['trail_available', 'trail_route', 'imported_geometry', 'live_verified_geometry', 'verified'].includes(route.geometryStatus);
  return route.geometryValid && trueTrailGeometry;
}

export function evaluateTerrainRiskV1(input: TerrainRiskV1Input): TerrainRiskV1Result {
  const route = normalizeTerrainRoute(input);
  const missing: TerrainRiskV1Reason[] = [];
  const riskReasons: TerrainRiskV1Reason[] = [];

  if (route.geometryStatus === 'approach_only') {
    addTerrainReason(missing, 'approach_only', 'Approach route only. Trail terrain not verified.', 'critical');
    return buildUnknownTerrainResult(input, missing, riskReasons, 'partial');
  }

  if (route.authorityStatus === 'trailhead_guidance' && !routeHasVerifiedTrailTerrain(route)) {
    addTerrainReason(missing, 'trailhead_guidance', 'Trailhead guidance only. Trail terrain not available.', 'critical');
    return buildUnknownTerrainResult(input, missing, riskReasons, 'partial');
  }

  if (route.authorityStatus === 'demo_fixture') {
    addTerrainReason(missing, 'demo_route', 'Demo route. Terrain risk not verified.', 'critical');
    return buildUnknownTerrainResult(input, missing, riskReasons, 'demo');
  }

  if (!routeHasVerifiedTrailTerrain(route)) {
    addTerrainReason(missing, 'route_geometry_missing', 'Route geometry missing.', 'critical');
    return buildUnknownTerrainResult(input, missing, riskReasons, 'unknown');
  }

  const preview = route.authorityStatus === 'preview_geometry';
  if (preview) {
    addTerrainReason(missing, 'preview_geometry', 'Preview geometry. Terrain risk limited.', 'caution');
  } else if (route.authorityStatus === 'live_verified_geometry' || route.authorityStatus === 'imported_geometry' || route.authorityStatus === 'trail_route' || route.authorityStatus === 'expedition_itinerary') {
    addTerrainReason(riskReasons, 'verified_trail_geometry', 'Verified trail geometry available.', 'positive');
  } else {
    addTerrainReason(missing, 'route_authority_unknown', 'Route authority unknown.', 'watch');
  }

  let score = preview ? 32 : 22;
  const difficulty = terrainDifficultyRisk(route.trailDifficulty);
  if (difficulty.label) {
    score += difficulty.score;
    addTerrainReason(riskReasons, 'trail_difficulty_known', `Known trail difficulty: ${difficulty.label}.`, difficulty.score >= 26 ? 'caution' : difficulty.score >= 14 ? 'watch' : 'positive');
  } else {
    score += 8;
    addTerrainReason(missing, 'trail_difficulty_unknown', 'Trail difficulty unknown.', 'watch');
  }

  if (route.distanceMiles != null) {
    if (route.distanceMiles >= 60) {
      score += 14;
      addTerrainReason(riskReasons, 'route_distance_long', 'Long trail distance increases exposure.', 'caution');
    } else if (route.distanceMiles >= 25) {
      score += 7;
      addTerrainReason(riskReasons, 'route_distance_moderate', 'Moderate trail distance exposure.', 'watch');
    } else {
      score += 3;
      addTerrainReason(riskReasons, 'route_distance_known', 'Route distance available.', 'positive');
    }
  } else {
    score += 8;
    addTerrainReason(missing, 'route_distance_unknown', 'Route distance unknown.', 'watch');
  }

  const vehicleStatus = terrainVehicleStatus(input.vehicle);
  if (vehicleStatus === 'missing') {
    score += 12;
    addTerrainReason(missing, 'vehicle_missing', 'Vehicle profile missing.', 'caution');
  } else if (vehicleStatus === 'incomplete' || vehicleStatus === 'unknown') {
    score += 7;
    addTerrainReason(missing, 'vehicle_incomplete', 'Vehicle profile incomplete.', 'watch');
  } else {
    addTerrainReason(riskReasons, 'vehicle_profile_complete', 'Vehicle profile available.', 'positive');
  }

  const weather = terrainStatusSummary(input.weather);
  if (weather.status === 'unavailable') {
    score += 12;
    addTerrainReason(missing, 'weather_unavailable', 'Weather unavailable.', 'caution');
  } else if (weather.status === 'unknown') {
    score += 8;
    addTerrainReason(missing, 'weather_unknown', 'Weather unknown.', 'watch');
  } else if (weather.status === 'stale') {
    score += 6;
    addTerrainReason(missing, 'weather_stale', 'Weather stale.', 'watch');
  } else if (['elevated', 'caution', 'warning', 'severe'].includes(String(weather.status))) {
    score += weather.status === 'severe' ? 22 : 12;
    addTerrainReason(riskReasons, 'weather_elevated', 'Weather may increase terrain risk.', 'caution');
  } else {
    addTerrainReason(riskReasons, 'weather_available', 'Weather input available.', 'positive');
  }

  const remoteness = terrainStatusSummary(input.remoteness);
  const remotenessScore = terrainNumber(input.remoteness?.score);
  if (remoteness.status === 'unknown' || remoteness.status === 'unavailable') {
    score += 5;
    addTerrainReason(missing, 'remoteness_unknown', 'Remoteness unknown.', 'watch');
  } else if (remotenessScore != null && remotenessScore >= 70) {
    score += 12;
    addTerrainReason(riskReasons, 'remote_route', 'High remoteness increases recovery exposure.', 'caution');
  } else if (remotenessScore != null && remotenessScore >= 40) {
    score += 6;
    addTerrainReason(riskReasons, 'moderate_remoteness', 'Moderate remoteness exposure.', 'watch');
  } else {
    addTerrainReason(riskReasons, 'remoteness_available', 'Remoteness input available.', 'positive');
  }

  const elevation = terrainStatusSummary(input.elevation);
  if (elevation.status === 'unknown' || elevation.status === 'unavailable') {
    score += 8;
    addTerrainReason(missing, 'elevation_unavailable', 'Elevation/grade unavailable.', 'watch');
  } else if (['elevated', 'caution', 'warning', 'severe'].includes(String(elevation.status))) {
    score += elevation.status === 'severe' ? 20 : 10;
    addTerrainReason(riskReasons, 'elevation_grade_elevated', 'Elevation or grade may increase terrain risk.', 'caution');
  } else {
    addTerrainReason(riskReasons, 'elevation_available', 'Elevation/grade input available.', 'positive');
  }

  const daylight = terrainStatusSummary(input.daylight);
  if (daylight.status === 'unknown' || daylight.status === 'unavailable') {
    addTerrainReason(missing, 'daylight_unknown', 'Daylight unknown.', 'watch');
  } else if (['limited', 'caution', 'warning'].includes(String(daylight.status))) {
    score += 5;
    addTerrainReason(riskReasons, 'daylight_limited', 'Limited daylight increases terrain exposure.', 'watch');
  }

  let category = terrainCategoryFromScore(clamp(Math.round(score), 0, 100));
  if (preview && category === 'low') category = 'moderate';
  if (category === 'low' && missing.length > 0) category = 'moderate';
  if (category === 'severe' && !riskReasons.some((reason) => reason.tone === 'critical' || /severe|high|long|remote|weather|grade/i.test(reason.label))) {
    category = 'elevated';
  }
  const finalScore = clamp(Math.round(score), 0, 100);
  const dataState = terrainRiskDataConfidence(route, missing, input.dataState);
  const recommendedAction = terrainRecommendedAction(category, missing);

  return {
    category,
    label: terrainRiskV1Label(category),
    score: finalScore,
    headline: `${terrainRiskV1Label(category)} - ${recommendedAction.label}`,
    riskReasons,
    missingDataReasons: missing,
    route,
    vehicle: {
      status: vehicleStatus,
      label: cleanTerrainText(input.vehicle?.label),
    },
    weather,
    daylight,
    remoteness,
    elevation,
    dataConfidence: {
      state: dataState,
      knownLimitations: Array.from(new Set(missing.map((reason) => reason.label))),
    },
    recommendedAction,
  };
}

function terrainRiskDataConfidence(
  route: TerrainRiskV1Result['route'],
  missing: TerrainRiskV1Reason[],
  inputState: TerrainRiskV1Input['dataState'],
): TerrainRiskV1DataState {
  const explicit = normalizeTerrainDataState(inputState);
  if (explicit === 'demo' || explicit === 'mock' || explicit === 'stale') return explicit;
  if (route.authorityStatus === 'demo_fixture') return 'demo';
  if (missing.some((reason) => reason.tone === 'critical' || reason.tone === 'caution')) return 'partial';
  if (route.authorityStatus === 'live_verified_geometry') return 'verified';
  if (route.authorityStatus === 'imported_geometry' || route.authorityStatus === 'trail_route' || route.authorityStatus === 'expedition_itinerary') return 'available';
  if (explicit === 'verified' || explicit === 'live' || explicit === 'available' || explicit === 'partial' || explicit === 'unknown' || explicit === 'unavailable') return explicit;
  return 'unknown';
}

export function evaluateTerrainRiskForActiveTrip(snapshot: TerrainRiskSnapshotLike | null | undefined): TerrainRiskV1Result {
  return evaluateTerrainRiskV1({
    route: {
      authorityStatus: snapshot?.route?.authorityStatus,
      authorityLabel: snapshot?.route?.authorityLabel,
      geometryStatus: snapshot?.route?.geometryStatus,
      geometrySource: snapshot?.route?.geometrySource,
      geometryValid: snapshot?.route?.geometryValid,
      distanceMiles: snapshot?.route?.distanceMiles,
    },
    vehicle: {
      status: snapshot?.vehicle?.id ? undefined : snapshot?.vehicle ? 'incomplete' : 'missing',
      label: snapshot?.vehicle?.label,
      vehicleType: snapshot?.vehicle?.vehicleType,
      rangeMiles: snapshot?.vehicle?.rangeMiles,
    },
    weather: {
      status: snapshot?.routeConfidence?.metadata?.weatherStatus ?? 'unknown',
      label: snapshot?.routeConfidence?.metadata?.weatherStatus
        ? `Weather ${snapshot.routeConfidence.metadata.weatherStatus}`
        : 'Weather unknown',
    },
    daylight: { status: 'unknown', label: 'Daylight unknown' },
    remoteness: { status: 'unknown', label: 'Remoteness unknown' },
    elevation: { status: 'unknown', label: 'Elevation/grade unavailable' },
    dataState: snapshot?.freshness?.state ?? snapshot?.routeConfidence?.dataConfidence?.state,
  });
}

export function evaluateTerrainRiskForOfflineIncidentPacket(packet: TerrainRiskPacketLike | null | undefined): TerrainRiskV1Result {
  return evaluateTerrainRiskV1({
    route: {
      authorityStatus: packet?.route?.authorityStatus,
      authorityLabel: packet?.route?.authorityLabel,
      geometryStatus: packet?.route?.geometryStatus,
      geometrySource: packet?.route?.geometrySource,
      geometryValid: packet?.route?.geometryValid,
      distanceMiles: packet?.route?.distanceMiles,
    },
    vehicle: {
      status: packet?.vehicle ? undefined : 'missing',
      label: packet?.vehicle?.label,
      vehicleType: packet?.vehicle?.vehicleType,
      rangeMiles: packet?.vehicle?.rangeMiles,
    },
    weather: { status: 'unknown', label: 'Weather unknown from local packet' },
    daylight: { status: 'unknown', label: 'Daylight unknown from local packet' },
    remoteness: { status: 'unknown', label: 'Remoteness unknown from local packet' },
    elevation: { status: 'unknown', label: 'Elevation/grade unavailable from local packet' },
    dataState: packet?.dataFreshness?.state,
  });
}


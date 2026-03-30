/**
 * ECS Route Context Engine — Phase 6C
 *
 * Risk adapts based on:
 *   - How far into the route the user is (progressPercent)
 *   - Remoteness level
 *   - Bailout availability (if present)
 *
 * RULES:
 *   - No hooks inside this engine
 *   - All exported functions are pure (no side effects, no storage access)
 *   - Given identical inputs, output is IDENTICAL (deterministic)
 *   - No mutation of input objects
 *
 * ESCALATION RULES:
 *   1. If remoteness is high AND bailoutAvailable is false
 *      → escalate risk level by one step (cap at critical)
 *   2. If progressPercent > 70 AND bailoutAvailable is false
 *      → also escalate (late-commitment risk)
 *   3. If progressPercent < 30
 *      → slightly reduce "commitment penalty"
 *
 * EXPORTS:
 *   RouteContextStatus           — runtime route context type
 *   computeRouteContextEscalation()  — pure escalation logic
 *   computeRouteContextPenalty()     — numeric penalty for risk engine integration
 *   buildRouteContextStatus()        — assembles from store data (reads stores, NOT pure)
 *   applyRouteContextToRisk()        — wraps Phase 6B result with escalation
 */

import type { RiskLevel, DynamicRiskResult, RouteContextStatus } from './terrainRiskEngine';
import type { RemotenessOutput, RemotenessTier } from './remotenessStore';

// Re-export RouteContextStatus from terrainRiskEngine for convenience.
// The canonical definition lives in terrainRiskEngine to avoid circular deps.
export type { RouteContextStatus } from './terrainRiskEngine';



/**
 * Route context escalation result.
 *
 * Describes whether and why the risk level should be escalated
 * based on route context factors.
 */
export interface RouteContextEscalation {
  /** Whether any escalation applies */
  shouldEscalate: boolean;
  /** Number of risk level steps to escalate (0, 1, or 2) */
  escalationSteps: number;
  /** Original risk level before escalation */
  originalLevel: RiskLevel;
  /** Escalated risk level (may be same as original if no escalation) */
  escalatedLevel: RiskLevel;
  /** Reasons for escalation (empty if no escalation) */
  reasons: string[];
  /** Numeric penalty added to risk score (0–15) */
  scorePenalty: number;
}

/**
 * Route context penalty — numeric contribution to risk score.
 *
 * Used by the risk engine to integrate route context into
 * the composite score without needing the full escalation result.
 */
export interface RouteContextPenalty {
  /** Penalty points to add to context risk (0–15) */
  penalty: number;
  /** Commitment factor (0–1): how committed the user is to the route */
  commitmentFactor: number;
  /** Whether late-commitment escalation applies */
  lateCommitment: boolean;
  /** Whether remote-no-bailout escalation applies */
  remoteNoBailout: boolean;
  /** Driver strings for the risk result */
  drivers: string[];
}


// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Progress threshold for late-commitment escalation */
const LATE_COMMITMENT_THRESHOLD = 70;

/** Progress threshold for early-route reduction */
const EARLY_ROUTE_THRESHOLD = 30;

/** Remoteness score threshold for "high remoteness" */
const HIGH_REMOTENESS_SCORE = 60;

/** Risk level ordering for escalation */
const RISK_LEVEL_ORDER: RiskLevel[] = ['low', 'moderate', 'high', 'critical'];

/** Remoteness tiers considered "high" for escalation */
const HIGH_REMOTENESS_TIERS: Set<RemotenessTier> = new Set([
  'REMOTE',
  'DEEP REMOTE',
  'EXTREME',
]);


// ═══════════════════════════════════════════════════════════════
// DEFAULT ROUTE CONTEXT
// ═══════════════════════════════════════════════════════════════

/**
 * Create a default RouteContextStatus for when no route data is available.
 *
 * Defaults to 0% progress with bailout available — minimal risk contribution.
 */
export function createDefaultRouteContext(): RouteContextStatus {
  return {
    progressPercent: 0,
    bailoutAvailable: true,
  };
}

/**
 * Create a RouteContextStatus representing an unknown/unstarted state.
 *
 * Used when expedition is active but route progress is not tracked.
 */
export function createUnknownRouteContext(): RouteContextStatus {
  return {
    progressPercent: 0,
    bailoutAvailable: true,
  };
}


// ═══════════════════════════════════════════════════════════════
// CORE FUNCTIONS (PURE — NO SIDE EFFECTS)
// ═══════════════════════════════════════════════════════════════

/**
 * Compute route context escalation for a given risk level.
 *
 * Applies the Phase 6C escalation rules:
 *
 *   Rule 1: remoteness high + no bailout → escalate +1 step
 *   Rule 2: progress > 70% + no bailout → escalate +1 step
 *   Rule 3: progress < 30% → reduce commitment penalty
 *
 * Rules 1 and 2 can stack (max +2 steps), capped at critical.
 * Rule 3 only applies when Rules 1 and 2 would otherwise apply
 * (it reduces the penalty, not the base level).
 *
 * @param currentLevel - Current risk level from Phase 6B
 * @param routeContext - Route context status
 * @param remotenessScore - Remoteness score (0–100) from remotenessStore
 * @returns RouteContextEscalation
 */
export function computeRouteContextEscalation(
  currentLevel: RiskLevel,
  routeContext: RouteContextStatus,
  remotenessScore: number,
): RouteContextEscalation {
  const reasons: string[] = [];
  let escalationSteps = 0;
  let scorePenalty = 0;

  const progress = clamp(routeContext.progressPercent, 0, 100);
  const remoteScore = clamp(remotenessScore, 0, 100);
  const hasBailout = routeContext.bailoutAvailable;

  // ── Rule 1: High remoteness + no bailout → escalate ──
  const isHighRemoteness = remoteScore >= HIGH_REMOTENESS_SCORE;

  if (isHighRemoteness && !hasBailout) {
    escalationSteps += 1;
    scorePenalty += 8;
    reasons.push('Remote with no bailout available');
  }

  // ── Rule 2: Late commitment + no bailout → escalate ──
  const isLateCommitment = progress > LATE_COMMITMENT_THRESHOLD;

  if (isLateCommitment && !hasBailout) {
    escalationSteps += 1;
    scorePenalty += 7;
    reasons.push(`${Math.round(progress)}% committed with no bailout`);
  }

  // ── Rule 3: Early route → reduce commitment penalty ──
  // Only applies if there would otherwise be escalation
  const isEarlyRoute = progress < EARLY_ROUTE_THRESHOLD;

  if (isEarlyRoute && escalationSteps > 0) {
    // Reduce penalty by ~40% for early-route position
    // (user can still turn back)
    const reduction = Math.ceil(escalationSteps * 0.4);
    escalationSteps = Math.max(0, escalationSteps - reduction);
    scorePenalty = Math.round(scorePenalty * 0.6);

    if (escalationSteps === 0) {
      reasons.length = 0; // Clear reasons if fully reduced
    } else {
      reasons.push('Early route position (reduced penalty)');
    }
  }

  // ── Additional penalty modifiers (non-escalating) ──

  // Bailout time penalty: if bailout exists but is far away
  if (hasBailout && routeContext.estimatedTimeToBailoutMin != null) {
    const bailoutMin = routeContext.estimatedTimeToBailoutMin;
    if (bailoutMin > 120) {
      // > 2 hours to bailout: add minor penalty
      scorePenalty += 3;
      reasons.push(`Bailout ${Math.round(bailoutMin / 60)}h away`);
    } else if (bailoutMin > 60) {
      // > 1 hour to bailout: add small penalty
      scorePenalty += 1;
    }
  }

  // Mid-route commitment factor (non-escalating score addition)
  if (progress > 40 && progress <= LATE_COMMITMENT_THRESHOLD && !hasBailout) {
    // Moderate commitment: add small penalty
    const midPenalty = Math.round(((progress - 40) / 30) * 3);
    scorePenalty += midPenalty;
    if (midPenalty >= 2) {
      reasons.push(`${Math.round(progress)}% into route without bailout`);
    }
  }

  // Cap score penalty
  scorePenalty = clamp(scorePenalty, 0, 15);

  // ── Compute escalated level ──
  const escalatedLevel = escalateRiskLevel(currentLevel, escalationSteps);

  return {
    shouldEscalate: escalationSteps > 0,
    escalationSteps,
    originalLevel: currentLevel,
    escalatedLevel,
    reasons,
    scorePenalty,
  };
}


/**
 * Compute the numeric route context penalty for risk engine integration.
 *
 * This is a lighter-weight alternative to computeRouteContextEscalation()
 * that returns just the numeric penalty and commitment factor, suitable
 * for direct integration into the Phase 6B risk score computation.
 *
 * @param routeContext - Route context status
 * @param remotenessScore - Remoteness score (0–100)
 * @returns RouteContextPenalty
 */
export function computeRouteContextPenalty(
  routeContext: RouteContextStatus,
  remotenessScore: number,
): RouteContextPenalty {
  const progress = clamp(routeContext.progressPercent, 0, 100);
  const remoteScore = clamp(remotenessScore, 0, 100);
  const hasBailout = routeContext.bailoutAvailable;
  const drivers: string[] = [];

  let penalty = 0;
  let lateCommitment = false;
  let remoteNoBailout = false;

  // ── Commitment factor: 0 at start, 1 at 100% ──
  // Non-linear: rises faster after 50%
  let commitmentFactor: number;
  if (progress <= 50) {
    commitmentFactor = (progress / 50) * 0.4; // 0 → 0.4
  } else {
    commitmentFactor = 0.4 + ((progress - 50) / 50) * 0.6; // 0.4 → 1.0
  }

  // ── Rule 1: High remoteness + no bailout ──
  if (remoteScore >= HIGH_REMOTENESS_SCORE && !hasBailout) {
    remoteNoBailout = true;
    penalty += 8;
    drivers.push('Remote with no bailout available');
  }

  // ── Rule 2: Late commitment + no bailout ──
  if (progress > LATE_COMMITMENT_THRESHOLD && !hasBailout) {
    lateCommitment = true;
    penalty += 7;
    drivers.push(`${Math.round(progress)}% committed — no bailout`);
  }

  // ── Rule 3: Early route reduction ──
  if (progress < EARLY_ROUTE_THRESHOLD && penalty > 0) {
    penalty = Math.round(penalty * 0.6);
    if (penalty > 0) {
      drivers.push('Early route (reduced penalty)');
    }
  }

  // ── Bailout distance penalty ──
  if (hasBailout && routeContext.estimatedTimeToBailoutMin != null) {
    const mins = routeContext.estimatedTimeToBailoutMin;
    if (mins > 120) {
      penalty += 3;
      drivers.push(`Bailout ${Math.round(mins / 60)}h away`);
    } else if (mins > 60) {
      penalty += 1;
    }
  }

  // ── Mid-route no-bailout ──
  if (progress > 40 && progress <= LATE_COMMITMENT_THRESHOLD && !hasBailout) {
    const midPenalty = Math.round(((progress - 40) / 30) * 3);
    penalty += midPenalty;
    if (midPenalty >= 2) {
      drivers.push(`${Math.round(progress)}% into route without bailout`);
    }
  }

  penalty = clamp(penalty, 0, 15);

  return {
    penalty,
    commitmentFactor,
    lateCommitment,
    remoteNoBailout,
    drivers,
  };
}


/**
 * Apply route context escalation to a Phase 6B risk result.
 *
 * Takes the output of calculateDynamicRisk() and applies route context
 * escalation rules. Returns a new DynamicRiskResult with:
 *   - Updated riskScore (original + scorePenalty, capped at 100)
 *   - Updated riskLevel (escalated if applicable)
 *   - Additional drivers from escalation reasons
 *
 * This is a pure function — does not mutate the input result.
 *
 * @param riskResult - Output from Phase 6B calculateDynamicRisk()
 * @param routeContext - Route context status
 * @param remotenessScore - Remoteness score (0–100)
 * @returns New DynamicRiskResult with route context applied
 */
export function applyRouteContextToRisk(
  riskResult: DynamicRiskResult,
  routeContext: RouteContextStatus,
  remotenessScore: number,
): DynamicRiskResult {
  const escalation = computeRouteContextEscalation(
    riskResult.riskLevel,
    routeContext,
    remotenessScore,
  );

  // If no escalation and no score penalty, return original
  if (!escalation.shouldEscalate && escalation.scorePenalty === 0) {
    return riskResult;
  }

  // Compute new score
  const newScore = clamp(
    riskResult.riskScore + escalation.scorePenalty,
    0,
    100,
  );

  // Use the higher of: escalated level or score-derived level
  const scoreDerivedLevel = classifyRiskLevel(newScore);
  const finalLevel = higherRiskLevel(escalation.escalatedLevel, scoreDerivedLevel);

  // Merge drivers (original + escalation reasons)
  const newDrivers = [...riskResult.drivers, ...escalation.reasons];

  // Update context risk component
  const newComponents = {
    ...riskResult.components,
    contextRisk: Math.round(
      (riskResult.components.contextRisk + escalation.scorePenalty) * 10
    ) / 10,
  };

  return {
    riskScore: newScore,
    riskLevel: finalLevel,
    drivers: newDrivers,
    terrainModifiers: riskResult.terrainModifiers,
    components: newComponents,
  };
}


// ═══════════════════════════════════════════════════════════════
// STORE BRIDGE FUNCTION (NOT PURE — reads from stores)
//
// This is the only function that accesses external stores.
// It assembles a RouteContextStatus from runtime data.
// ═══════════════════════════════════════════════════════════════

/**
 * Build a RouteContextStatus from existing store data.
 *
 * WARNING: This function reads from stores (waypointProgressStore,
 * bailoutStore, routeStore). It is NOT pure. Use it at the
 * call site, then pass the result to pure functions.
 *
 * @param routeId - Active route ID (or null if no route)
 * @param totalWaypoints - Total waypoint count for the route
 * @param bailoutCount - Number of bailout points associated with the route/run
 * @param nearestBailoutDistMiles - Distance to nearest bailout in miles (optional)
 * @param averageSpeedMph - Current average speed in mph (optional, for time estimate)
 * @returns RouteContextStatus
 */
export function buildRouteContextStatus(params: {
  routeId: string | null;
  totalWaypoints: number;
  currentWaypointIndex: number;
  bailoutCount: number;
  nearestBailoutDistMiles?: number;
  averageSpeedMph?: number;
}): RouteContextStatus {
  const {
    routeId,
    totalWaypoints,
    currentWaypointIndex,
    bailoutCount,
    nearestBailoutDistMiles,
    averageSpeedMph,
  } = params;

  // ── Progress percent ──
  let progressPercent = 0;
  if (routeId && totalWaypoints > 1) {
    progressPercent = clamp(
      (currentWaypointIndex / (totalWaypoints - 1)) * 100,
      0,
      100,
    );
  } else if (routeId && totalWaypoints === 1) {
    // Single waypoint route: either 0% or 100%
    progressPercent = currentWaypointIndex >= 1 ? 100 : 0;
  }

  // ── Bailout availability ──
  // Bailout is "available" if there are any bailout points associated
  const bailoutAvailable = bailoutCount > 0;

  // ── Estimated time to bailout ──
  let estimatedTimeToBailoutMin: number | undefined;
  if (nearestBailoutDistMiles != null && averageSpeedMph != null && averageSpeedMph > 0) {
    estimatedTimeToBailoutMin = (nearestBailoutDistMiles / averageSpeedMph) * 60;
  }

  return {
    progressPercent,
    estimatedTimeToBailoutMin,
    bailoutAvailable,
  };
}


/**
 * Build a RouteContextStatus from raw progress data.
 *
 * Simpler version that doesn't require store access — just takes
 * the raw numbers. Useful for testing and for callers that already
 * have the data.
 *
 * @param progressPercent - Route completion percentage (0–100)
 * @param bailoutAvailable - Whether a bailout option is available
 * @param estimatedTimeToBailoutMin - Optional time to nearest bailout
 * @returns RouteContextStatus
 */
export function buildRouteContextFromRaw(
  progressPercent: number,
  bailoutAvailable: boolean,
  estimatedTimeToBailoutMin?: number,
): RouteContextStatus {
  return {
    progressPercent: clamp(progressPercent, 0, 100),
    bailoutAvailable,
    estimatedTimeToBailoutMin,
  };
}


// ═══════════════════════════════════════════════════════════════
// CONVENIENCE HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if remoteness score qualifies as "high" for escalation purposes.
 */
export function isHighRemoteness(remotenessScore: number): boolean {
  return remotenessScore >= HIGH_REMOTENESS_SCORE;
}

/**
 * Check if remoteness tier qualifies as "high" for escalation purposes.
 */
export function isHighRemotenessTier(tier: RemotenessTier): boolean {
  return HIGH_REMOTENESS_TIERS.has(tier);
}

/**
 * Get the commitment level label for a progress percentage.
 */
export function getCommitmentLabel(progressPercent: number): string {
  const p = clamp(progressPercent, 0, 100);
  if (p < 10) return 'Not started';
  if (p < EARLY_ROUTE_THRESHOLD) return 'Early route';
  if (p < 50) return 'Approaching midpoint';
  if (p < LATE_COMMITMENT_THRESHOLD) return 'Past midpoint';
  if (p < 90) return 'Late commitment';
  return 'Near completion';
}

/**
 * Get the commitment level color for a progress percentage.
 */
export function getCommitmentColor(progressPercent: number): string {
  const p = clamp(progressPercent, 0, 100);
  if (p < EARLY_ROUTE_THRESHOLD) return '#4CAF50';  // green — easy to bail
  if (p < 50) return '#8BC34A';                       // light green
  if (p < LATE_COMMITMENT_THRESHOLD) return '#E67E22'; // orange — moderate commitment
  if (p < 90) return '#EF5350';                        // red — high commitment
  return '#C0392B';                                     // dark red — very committed
}

/**
 * Compute a commitment score (0–100) from progress and bailout availability.
 *
 * Higher = more committed (harder to bail out).
 */
export function computeCommitmentScore(
  routeContext: RouteContextStatus,
): number {
  const progress = clamp(routeContext.progressPercent, 0, 100);
  const hasBailout = routeContext.bailoutAvailable;

  // Base commitment from progress (non-linear)
  let commitment: number;
  if (progress <= 50) {
    commitment = (progress / 50) * 40; // 0 → 40
  } else {
    commitment = 40 + ((progress - 50) / 50) * 60; // 40 → 100
  }

  // No bailout amplifies commitment
  if (!hasBailout) {
    commitment = Math.min(100, commitment * 1.3);
  }

  // Bailout far away partially amplifies
  if (hasBailout && routeContext.estimatedTimeToBailoutMin != null) {
    const mins = routeContext.estimatedTimeToBailoutMin;
    if (mins > 120) {
      commitment = Math.min(100, commitment * 1.15);
    } else if (mins > 60) {
      commitment = Math.min(100, commitment * 1.05);
    }
  }

  return clamp(Math.round(commitment), 0, 100);
}

/**
 * Get a compact route context summary string.
 *
 * Example: "72% committed — no bailout"
 */
export function getRouteContextSummary(
  routeContext: RouteContextStatus,
): string {
  const p = Math.round(routeContext.progressPercent);
  const bailout = routeContext.bailoutAvailable ? 'bailout available' : 'no bailout';

  if (p === 0) return `Not started — ${bailout}`;
  if (p >= 100) return `Route complete — ${bailout}`;
  return `${p}% — ${bailout}`;
}

/**
 * Determine if route context warrants a warning badge.
 *
 * Returns true if the combination of progress + bailout status
 * is concerning enough to show a visual indicator.
 */
export function shouldShowRouteContextWarning(
  routeContext: RouteContextStatus,
  remotenessScore: number,
): boolean {
  const progress = routeContext.progressPercent;
  const hasBailout = routeContext.bailoutAvailable;

  // High remoteness + no bailout: always warn
  if (remotenessScore >= HIGH_REMOTENESS_SCORE && !hasBailout) return true;

  // Late commitment + no bailout: always warn
  if (progress > LATE_COMMITMENT_THRESHOLD && !hasBailout) return true;

  // Mid-route + high remoteness: warn
  if (progress > 40 && remotenessScore >= HIGH_REMOTENESS_SCORE) return true;

  return false;
}


// ═══════════════════════════════════════════════════════════════
// INTERNAL UTILITIES (PURE)
// ═══════════════════════════════════════════════════════════════

/** Clamp a value to a min–max range */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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

/**
 * Classify a risk score into a risk level.
 * (Duplicated from terrainRiskEngine to avoid circular dependency)
 */
function classifyRiskLevel(score: number): RiskLevel {
  if (score >= 76) return 'critical';
  if (score >= 51) return 'high';
  if (score >= 26) return 'moderate';
  return 'low';
}

/**
 * Return the higher of two risk levels.
 */
function higherRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  const aIdx = RISK_LEVEL_ORDER.indexOf(a);
  const bIdx = RISK_LEVEL_ORDER.indexOf(b);
  return aIdx >= bIdx ? a : b;
}


// ============================================================
// EXPEDITION FIT ENGINE — Route × User Compatibility Scoring
// ============================================================
// Phase 12: Evaluates how well routes match the user's vehicle,
// expedition goals, and trip duration. Produces a single
// normalized Expedition Fit score (0–100) for Discovery cards.
//
// SCORING MODEL (6 weighted factors):
//   - Vehicle capability match  (25%): rig compatibility score
//   - Route difficulty          (20%): terrain difficulty vs capability
//   - Loadout weight impact     (15%): payload margin consideration
//   - Remoteness score          (15%): isolation and self-sufficiency
//   - Camping potential         (15%): dispersed camping availability
//   - Route length / duration   (10%): travel time suitability
//
// LABELS:
//   90–100  EXCELLENT
//   75–89   GREAT MATCH
//   55–74   MODERATE FIT
//   35–54   BORDERLINE
//   0–34    POOR FIT
//
// INTEGRATION:
//   - Enriches ExpeditionOpportunity with expeditionFitScore
//   - Integrates with Quiet Exploration ranking
//   - Integrates with Expedition Routes ranking
//   - Integrates with Weekend Adventures ranking
//   - Integrates with Risk Engine when relevant
//   - Works with offline cached routes
//   - Provides simplified indicators for Android Auto / CarPlay
//
// PERFORMANCE:
//   - Pure function, no side effects
//   - O(1) per route (fixed factor count)
//   - No external API calls
//   - Memoization-friendly (deterministic inputs → outputs)
//   - Safe for use in FlatList/ScrollView render paths
//
// FALLBACK:
//   - Incomplete vehicle config → neutral vehicle/loadout scores (60)
//   - Missing camping data → estimated from route metadata
//   - Missing difficulty data → inferred from terrain type
//   - Never returns NaN or undefined
//
// DEDUPLICATION:
//   - Score calculated once per route per evaluation cycle
//   - Batch evaluation prevents redundant calculations
//   - Cache-friendly via Map<string, ExpeditionFitResult>
// ============================================================

import type { ExpeditionOpportunity } from './discoverEngine';
import type { CompatibilityResult } from './rigCompatibilityEngine';

const TAG = '[EXP-FIT]';

// ── Expedition Fit Result ────────────────────────────────────

export interface ExpeditionFitResult {
  /** Composite Expedition Fit score 0–100 */
  score: number;
  /** Display label */
  label: ExpeditionFitLabel;
  /** Display color */
  color: string;
  /** Individual factor scores for diagnostics */
  factors: ExpeditionFitFactors;
  /** Whether the score uses complete vehicle data */
  hasVehicleData: boolean;
  /** Whether the score uses complete route data */
  hasCompleteRouteData: boolean;
  /** Simplified summary for vehicle displays (AA/CarPlay) */
  simplifiedLabel: string;
  /** Whether offline data is sufficient for scoring */
  offlineAvailable: boolean;
}

export interface ExpeditionFitFactors {
  /** Vehicle capability match 0–100 */
  vehicleCapability: number;
  /** Route difficulty score 0–100 (higher = better fit) */
  routeDifficulty: number;
  /** Loadout weight impact 0–100 (higher = better margin) */
  loadoutWeight: number;
  /** Remoteness score 0–100 */
  remoteness: number;
  /** Camping potential 0–100 */
  campingPotential: number;
  /** Route length/duration suitability 0–100 */
  routeDuration: number;
}

export type ExpeditionFitLabel =
  | 'EXCELLENT'
  | 'GREAT MATCH'
  | 'MODERATE FIT'
  | 'BORDERLINE'
  | 'POOR FIT';

// ── Scoring Weights ──────────────────────────────────────────

const W_VEHICLE     = 0.25;
const W_DIFFICULTY  = 0.20;
const W_LOADOUT     = 0.15;
const W_REMOTENESS  = 0.15;
const W_CAMPING     = 0.15;
const W_DURATION    = 0.10;

// ── Vehicle Context (optional) ───────────────────────────────
// When available, provides richer scoring. When absent, neutral
// defaults are used for vehicle-dependent factors.

export interface VehicleContext {
  /** Whether a vehicle profile is configured */
  hasVehicle: boolean;
  /** Payload margin percentage (positive = under GVWR) */
  payloadMarginPct?: number | null;
  /** Whether the vehicle is overweight */
  isOverweight?: boolean;
  /** Vehicle type for duration suitability */
  vehicleType?: string | null;
}

// ============================================================
// MAIN EXPEDITION FIT CALCULATOR
// ============================================================

/**
 * Calculate the Expedition Fit score for a single route.
 *
 * @param opportunity   The expedition opportunity to evaluate
 * @param compatResult  Optional vehicle compatibility result
 * @param vehicleCtx    Optional vehicle context for loadout scoring
 * @returns ExpeditionFitResult with score, label, factors, and metadata
 */
export function calculateExpeditionFit(
  opportunity: ExpeditionOpportunity,
  compatResult: CompatibilityResult | null = null,
  vehicleCtx: VehicleContext | null = null,
): ExpeditionFitResult {
  const hasVehicle = vehicleCtx?.hasVehicle ?? (compatResult != null);

  // ── 1. Vehicle Capability Match (0–100) ────────────────
  // Uses rig compatibility score when available.
  // Falls back to terrain-based estimate when no vehicle configured.
  const vehicleCapability = _computeVehicleCapabilityFactor(
    opportunity,
    compatResult,
    hasVehicle,
  );

  // ── 2. Route Difficulty (0–100) ────────────────────────
  // Higher score = better fit (route is within capability).
  // Inverts difficulty: easy routes score high, extreme routes
  // score lower unless vehicle is highly capable.
  const routeDifficulty = _computeRouteDifficultyFactor(
    opportunity,
    compatResult,
  );

  // ── 3. Loadout Weight Impact (0–100) ───────────────────
  // Evaluates payload margin impact on expedition suitability.
  // Higher margin = more capacity for expedition gear.
  const loadoutWeight = _computeLoadoutWeightFactor(
    opportunity,
    vehicleCtx,
  );

  // ── 4. Remoteness Score (0–100) ────────────────────────
  // Higher remoteness = more expedition character.
  // Normalized from the route's 1–10 remoteness scale.
  const remoteness = _computeRemotenessFactor(opportunity);

  // ── 5. Camping Potential (0–100) ───────────────────────
  // Uses camping potential score when available.
  // Falls back to estimated score from route metadata.
  const campingPotential = _computeCampingPotentialFactor(opportunity);

  // ── 6. Route Length / Duration (0–100) ─────────────────
  // Evaluates whether route length and duration are suitable
  // for expedition travel. Sweet spot: 2–5 day trips.
  const routeDuration = _computeRouteDurationFactor(opportunity);

  // ── Composite Score ────────────────────────────────────
  const raw =
    vehicleCapability * W_VEHICLE +
    routeDifficulty   * W_DIFFICULTY +
    loadoutWeight     * W_LOADOUT +
    remoteness        * W_REMOTENESS +
    campingPotential  * W_CAMPING +
    routeDuration     * W_DURATION;

  const score = clamp(Math.round(raw), 0, 100);

  // ── Build result ───────────────────────────────────────
  const label = getExpeditionFitLabel(score);
  const color = getExpeditionFitColor(score);
  const hasCompleteRouteData = !!(
    opportunity.distanceMiles &&
    opportunity.estimatedDays &&
    opportunity.remotenessScore != null &&
    opportunity.terrainType
  );

  const result: ExpeditionFitResult = {
    score,
    label,
    color,
    factors: {
      vehicleCapability,
      routeDifficulty,
      loadoutWeight,
      remoteness,
      campingPotential,
      routeDuration,
    },
    hasVehicleData: hasVehicle,
    hasCompleteRouteData,
    simplifiedLabel: getSimplifiedFitLabel(score),
    offlineAvailable: true,
  };

  console.log(
    TAG,
    `Fit for "${opportunity.name}": ${score}/100 (${label}) ` +
    `[V:${vehicleCapability} D:${routeDifficulty} L:${loadoutWeight} ` +
    `R:${remoteness} C:${campingPotential} T:${routeDuration}]`,
  );

  return result;
}

// ============================================================
// BATCH EVALUATION
// ============================================================

/**
 * Calculate Expedition Fit for multiple routes.
 * Returns a map of route ID → ExpeditionFitResult.
 * Prevents duplicate calculations via Map keying.
 */
export function calculateExpeditionFitBatch(
  opportunities: ExpeditionOpportunity[],
  compatResults: Map<string, CompatibilityResult>,
  vehicleCtx: VehicleContext | null = null,
): Map<string, ExpeditionFitResult> {
  const results = new Map<string, ExpeditionFitResult>();

  console.log(TAG, `Batch evaluating Expedition Fit for ${opportunities.length} routes`);

  for (const op of opportunities) {
    // Prevent duplicate scoring
    if (results.has(op.id)) continue;

    const compat = compatResults.get(op.id) ?? null;
    results.set(op.id, calculateExpeditionFit(op, compat, vehicleCtx));
  }

  return results;
}

/**
 * Enrich opportunities with expeditionFitScore field.
 * Returns a new array with the score populated.
 */
export function enrichWithExpeditionFit(
  opportunities: ExpeditionOpportunity[],
  fitResults: Map<string, ExpeditionFitResult>,
): ExpeditionOpportunity[] {
  return opportunities.map(op => ({
    ...op,
    expeditionFitScore: fitResults.get(op.id)?.score ?? op.expeditionFitScore,
  }));
}

// ============================================================
// FACTOR CALCULATIONS
// ============================================================

/**
 * Vehicle Capability Factor (0–100).
 * Uses rig compatibility score when available.
 * Without vehicle data, estimates from terrain type.
 */
function _computeVehicleCapabilityFactor(
  op: ExpeditionOpportunity,
  compat: CompatibilityResult | null,
  hasVehicle: boolean,
): number {
  if (hasVehicle && compat) {
    // Direct rig compatibility score
    return clamp(compat.score, 0, 100);
  }

  // No vehicle configured — use neutral estimate based on terrain
  // Easier terrain = higher default fit
  const terrainDiff = op.terrainDifficulty ?? 5;
  return clamp(Math.round(80 - (terrainDiff - 5) * 6), 30, 85);
}

/**
 * Route Difficulty Factor (0–100).
 * Higher = better fit (route is within capability).
 * Uses rig compatibility difficulty rating when available.
 * Falls back to terrain difficulty estimate.
 */
function _computeRouteDifficultyFactor(
  op: ExpeditionOpportunity,
  compat: CompatibilityResult | null,
): number {
  if (compat) {
    // Invert difficulty: higher compat score = easier for this rig
    const score = compat.score;
    // Also consider terrain match specifically
    const terrainMatch = compat.factors?.terrainMatch ?? score;
    // Blend overall score with terrain match
    return clamp(Math.round(score * 0.6 + terrainMatch * 0.4), 0, 100);
  }

  // No vehicle data — estimate from terrain difficulty
  const terrainDiff = op.terrainDifficulty ?? 5;
  // Lower difficulty = higher fit score
  // Difficulty 1 → 95, Difficulty 5 → 65, Difficulty 10 → 30
  return clamp(Math.round(100 - terrainDiff * 7), 25, 95);
}

/**
 * Loadout Weight Impact Factor (0–100).
 * Evaluates how much payload capacity remains for expedition gear.
 * Higher margin = more room for supplies = better expedition fit.
 */
function _computeLoadoutWeightFactor(
  op: ExpeditionOpportunity,
  vehicleCtx: VehicleContext | null,
): number {
  if (!vehicleCtx || vehicleCtx.payloadMarginPct == null) {
    // No weight data — use neutral default
    return 60;
  }

  if (vehicleCtx.isOverweight) {
    // Overweight vehicle — significant penalty
    // More overweight = worse score
    const overPct = Math.abs(vehicleCtx.payloadMarginPct);
    return clamp(Math.round(30 - overPct), 0, 30);
  }

  const margin = vehicleCtx.payloadMarginPct;

  // Route-aware adjustment: longer/more remote routes need more gear
  const gearDemand = _estimateGearDemand(op);

  // Higher margin = better, but adjust for gear demand
  // margin >= 30% with low gear demand = 100
  // margin >= 20% = 85
  // margin >= 10% = 65
  // margin < 10% = scaled down
  let score: number;
  if (margin >= 30) {
    score = 100;
  } else if (margin >= 20) {
    score = 85 + ((margin - 20) / 10) * 15;
  } else if (margin >= 10) {
    score = 60 + ((margin - 10) / 10) * 25;
  } else if (margin >= 5) {
    score = 40 + ((margin - 5) / 5) * 20;
  } else {
    score = 25 + (margin / 5) * 15;
  }

  // Penalize if gear demand is high but margin is low
  if (gearDemand > 70 && margin < 15) {
    score = Math.max(20, score - 15);
  }

  return clamp(Math.round(score), 0, 100);
}

/**
 * Estimate gear demand for a route (0–100).
 * Longer, more remote, multi-day routes need more gear.
 */
function _estimateGearDemand(op: ExpeditionOpportunity): number {
  const days = op.estimatedDays ?? 1;
  const remoteness = op.remotenessScore ?? 5;
  const distance = op.distanceMiles ?? 50;

  // Days contribution (0–40): more days = more gear
  const daysScore = clamp(days / 5, 0, 1) * 40;

  // Remoteness contribution (0–35): more remote = more self-sufficiency
  const remoteScore = clamp(remoteness / 10, 0, 1) * 35;

  // Distance contribution (0–25): longer routes = more fuel/water
  const distScore = clamp(distance / 200, 0, 1) * 25;

  return clamp(Math.round(daysScore + remoteScore + distScore), 0, 100);
}

/**
 * Remoteness Factor (0–100).
 * Higher remoteness = more expedition character = higher fit.
 * Normalized from the route's 1–10 remoteness scale.
 */
function _computeRemotenessFactor(op: ExpeditionOpportunity): number {
  const remoteness = op.remotenessScore ?? 5;
  // Scale 1–10 → 0–100 with a slight boost for moderate remoteness
  // (sweet spot for expedition fit is 5–8)
  if (remoteness >= 9) return 90;  // extreme — slightly less ideal
  if (remoteness >= 7) return 95;  // high — excellent expedition character
  if (remoteness >= 5) return 80;  // moderate — good balance
  if (remoteness >= 3) return 55;  // low — less expedition feel
  return 35;                       // minimal — not very expedition-like
}

/**
 * Camping Potential Factor (0–100).
 * Uses camping potential score when available.
 * Falls back to estimate from suggested camps and terrain.
 */
function _computeCampingPotentialFactor(op: ExpeditionOpportunity): number {
  // Use pre-computed camping potential if available
  if (op.campingPotentialScore != null) {
    return clamp(op.campingPotentialScore, 0, 100);
  }

  // Fallback: estimate from route metadata
  const camps = op.suggestedCamps ?? 0;
  const distance = op.distanceMiles ?? 50;
  const remoteness = op.remotenessScore ?? 5;

  // More camps relative to distance = better
  const campsPerMile = camps / Math.max(distance, 1);
  const campDensity = clamp(campsPerMile * 2000, 0, 60);

  // Remoteness bonus (remote areas tend to have more dispersed camping)
  const remoteBonus = clamp(remoteness * 3, 0, 30);

  // Terrain bonus for forest/desert (good camping terrain)
  const terrain = (op.terrainType ?? '').toLowerCase();
  let terrainBonus = 0;
  if (terrain.includes('forest') || terrain.includes('gravel')) terrainBonus = 10;
  else if (terrain.includes('desert') || terrain.includes('sand')) terrainBonus = 8;
  else if (terrain.includes('alpine') || terrain.includes('mountain')) terrainBonus = 5;

  return clamp(Math.round(campDensity + remoteBonus + terrainBonus), 0, 100);
}

/**
 * Route Duration Factor (0–100).
 * Evaluates whether route length and duration suit expedition travel.
 * Sweet spot: 2–5 day trips with 60–200 mile routes.
 */
function _computeRouteDurationFactor(op: ExpeditionOpportunity): number {
  const days = op.estimatedDays ?? 1;
  const distance = op.distanceMiles ?? 50;

  // Duration suitability (sweet spot: 2–5 days)
  let durationScore: number;
  if (days >= 2 && days <= 5) {
    durationScore = 100;  // ideal expedition length
  } else if (days === 1) {
    durationScore = 60;   // day trip — less expedition feel
  } else if (days <= 7) {
    durationScore = 85;   // extended but manageable
  } else {
    durationScore = 65;   // very long — logistically challenging
  }

  // Distance suitability (sweet spot: 60–200 miles)
  let distanceScore: number;
  if (distance >= 60 && distance <= 200) {
    distanceScore = 100;  // ideal expedition distance
  } else if (distance >= 30 && distance < 60) {
    distanceScore = 70;   // short but viable
  } else if (distance > 200 && distance <= 400) {
    distanceScore = 80;   // long but doable
  } else if (distance > 400) {
    distanceScore = 60;   // very long — needs careful planning
  } else {
    distanceScore = 50;   // very short — minimal expedition character
  }

  // Blend duration and distance scores
  return clamp(Math.round(durationScore * 0.55 + distanceScore * 0.45), 0, 100);
}

// ============================================================
// DISPLAY HELPERS
// ============================================================

/** Get Expedition Fit label for display */
export function getExpeditionFitLabel(score: number): ExpeditionFitLabel {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 75) return 'GREAT MATCH';
  if (score >= 55) return 'MODERATE FIT';
  if (score >= 35) return 'BORDERLINE';
  return 'POOR FIT';
}

/** Get Expedition Fit color for display */
export function getExpeditionFitColor(score: number): string {
  if (score >= 90) return '#66BB6A';
  if (score >= 75) return '#81C784';
  if (score >= 55) return '#D4A017';
  if (score >= 35) return '#E67E22';
  return '#E04030';
}

/** Get Expedition Fit background tint for badges */
export function getExpeditionFitBgTint(score: number): string {
  const color = getExpeditionFitColor(score);
  return color + '12';
}

/** Get Expedition Fit border tint for badges */
export function getExpeditionFitBorderTint(score: number): string {
  const color = getExpeditionFitColor(score);
  return color + '40';
}

/** Get simplified label for vehicle displays (Android Auto / CarPlay) */
export function getSimplifiedFitLabel(score: number): string {
  if (score >= 75) return 'GOOD FIT';
  if (score >= 55) return 'OK FIT';
  if (score >= 35) return 'MARGINAL';
  return 'POOR FIT';
}

/** Get simplified Expedition Fit indicator for vehicle displays */
export function getSimplifiedFitIndicator(score: number): {
  label: string;
  icon: string;
  suitable: boolean;
} {
  if (score >= 75) {
    return { label: 'GOOD FIT', icon: 'checkmark-circle', suitable: true };
  }
  if (score >= 55) {
    return { label: 'OK FIT', icon: 'checkmark-circle-outline', suitable: true };
  }
  if (score >= 35) {
    return { label: 'MARGINAL', icon: 'alert-circle-outline', suitable: false };
  }
  return { label: 'POOR FIT', icon: 'close-circle-outline', suitable: false };
}

/** Format Expedition Fit score for compact display */
export function formatFitScore(score: number): string {
  return `${score}`;
}

/** Format Expedition Fit for detailed display */
export function formatFitDetailed(result: ExpeditionFitResult): string {
  const parts = [
    `FIT ${result.score}/100`,
    result.label,
  ];
  if (!result.hasVehicleData) {
    parts.push('(no vehicle)');
  }
  return parts.join(' · ');
}

// ============================================================
// RISK ENGINE INTEGRATION
// ============================================================

/**
 * Get risk-adjusted Expedition Fit score.
 * Reduces fit score when expedition risk is elevated.
 * Used when the Risk Engine is active and has evaluation data.
 *
 * @param fitScore       Base Expedition Fit score (0–100)
 * @param riskScore      Current expedition risk score (0–100)
 * @returns Adjusted fit score (0–100)
 */
export function getRiskAdjustedFit(
  fitScore: number,
  riskScore: number,
): number {
  if (riskScore <= 25) return fitScore;  // optimal risk — no adjustment

  // Reduce fit proportionally to risk
  // Risk 50 → ~10% reduction
  // Risk 75 → ~25% reduction
  // Risk 100 → ~40% reduction
  const riskPenalty = Math.round((riskScore - 25) * 0.53);
  const adjusted = fitScore - riskPenalty;

  return clamp(adjusted, 0, 100);
}

// ============================================================
// CATEGORY INTEGRATION
// ============================================================

/**
 * Get Expedition Fit bonus for category scoring.
 * Returns a bonus value (0–15) that can be added to
 * category-specific scores to boost well-fitting routes.
 */
export function getCategoryFitBonus(
  fitScore: number,
  category: 'weekend' | 'quiet' | 'expedition',
): number {
  // Higher fit = higher bonus
  const baseBonusRatio = clamp((fitScore - 50) / 50, 0, 1);

  // Category-specific scaling
  switch (category) {
    case 'expedition':
      // Expedition routes benefit most from high fit
      return Math.round(baseBonusRatio * 15);
    case 'weekend':
      // Weekend routes benefit moderately
      return Math.round(baseBonusRatio * 10);
    case 'quiet':
      // Quiet routes benefit least (fit is less critical)
      return Math.round(baseBonusRatio * 5);
  }
}

// ============================================================
// OFFLINE COMPATIBILITY
// ============================================================

/**
 * Check if Expedition Fit can be calculated offline.
 * Fit scores are derived from route metadata + vehicle config,
 * so they are always available when route data is cached.
 */
export function isFitAvailableOffline(): boolean {
  return true;
}

// ============================================================
// VALIDATION
// ============================================================

/**
 * Validate that a route has sufficient metadata for fit evaluation.
 * Returns true if the route can be fully evaluated.
 */
export function validateRouteForFit(route: {
  distanceMiles?: number;
  terrainType?: string;
  remotenessScore?: number;
  estimatedDays?: number;
}): boolean {
  if (!route.distanceMiles || route.distanceMiles <= 0) return false;
  if (!route.terrainType) return false;
  if (route.remotenessScore == null) return false;
  if (route.estimatedDays == null) return false;
  return true;
}

// ============================================================
// HELPERS
// ============================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}


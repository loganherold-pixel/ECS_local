import type {
  CampScoutCandidate,
  CampScoutConfidenceGrade,
  CampScoutFilterMode,
  CampScoutFilterOptions,
  CampScoutLegalityStatus,
  CampScoutScoreBreakdown,
  CampScoutSourceType,
} from "./types";

export const CAMP_SCOUT_DEFAULT_PIN_LIMIT = 5;
export const CAMP_SCOUT_EXPANDED_PIN_LIMIT = 10;
export const CAMP_SCOUT_MIN_DISPLAY_SCORE = 70;
export const CAMP_SCOUT_MIN_ACCESS_CONFIDENCE = 70;
export const CAMP_SCOUT_MIN_LEGALITY_CONFIDENCE = 70;
export const CAMP_SCOUT_MIN_REMOTENESS_SCORE = 70;
export const CAMP_SCOUT_MIN_TERRAIN_CONFIDENCE = 70;
export const CAMP_SCOUT_MAX_VIABLE_SLOPE_ESTIMATE = 8;

export type CampScoutScoringWeights = {
  flatnessTerrain: number;
  accessConfidence: number;
  remotenessValue: number;
  legalAccessConfidence: number;
  safetyEnvironmentalRisk: number;
  sourceSignal: number;
};

export type CampScoutScoringContext = {
  nowIso?: string;
  mapDataStaleAfterDays?: number;
  preferredMinimumRoadDistanceMiles?: number;
  preferredMaximumRoadDistanceMiles?: number;
  weights?: Partial<CampScoutScoringWeights>;
};

export type CampScoutRankingOptions = CampScoutFilterOptions & {
  context?: CampScoutScoringContext;
};

const DEFAULT_WEIGHTS: CampScoutScoringWeights = {
  flatnessTerrain: 20,
  accessConfidence: 18,
  remotenessValue: 18,
  legalAccessConfidence: 20,
  safetyEnvironmentalRisk: 14,
  sourceSignal: 10,
};

const MODE_WEIGHTS: Record<CampScoutFilterMode, CampScoutScoringWeights> = {
  balanced: DEFAULT_WEIGHTS,
  remote: {
    flatnessTerrain: 18,
    accessConfidence: 14,
    remotenessValue: 30,
    legalAccessConfidence: 18,
    safetyEnvironmentalRisk: 14,
    sourceSignal: 6,
  },
  easier_access: {
    flatnessTerrain: 18,
    accessConfidence: 30,
    remotenessValue: 10,
    legalAccessConfidence: 20,
    safetyEnvironmentalRisk: 12,
    sourceSignal: 10,
  },
  official_only: {
    flatnessTerrain: 18,
    accessConfidence: 18,
    remotenessValue: 12,
    legalAccessConfidence: 28,
    safetyEnvironmentalRisk: 12,
    sourceSignal: 12,
  },
};

const GRADE_ORDER: Record<CampScoutConfidenceGrade, number> = {
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

const SOURCE_BASE_SIGNAL: Record<CampScoutSourceType, number> = {
  official_mapped: 92,
  community_suggested: 78,
  imported_route_context: 70,
  ecs_inferred: 62,
  unknown: 35,
};

function clampScore(value: number | undefined, fallback = 0): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, value));
}

function roundScore(value: number): number {
  return Math.round(clampScore(value));
}

export function getCampScoutConfidenceGrade(
  score: number,
): CampScoutConfidenceGrade {
  if (score >= 85) {
    return "A";
  }
  if (score >= 70) {
    return "B";
  }
  if (score >= 50) {
    return "C";
  }
  return "D";
}

function getFlatnessScore(candidate: CampScoutCandidate): number {
  if (typeof candidate.slopeEstimate !== "number") {
    return clampScore(candidate.terrainConfidence, 50);
  }

  if (candidate.slopeEstimate <= 2) {
    return 100;
  }
  if (candidate.slopeEstimate <= 5) {
    return 85;
  }
  if (candidate.slopeEstimate <= 8) {
    return 65;
  }
  if (candidate.slopeEstimate <= 12) {
    return 45;
  }
  return 20;
}

function getAccessProximityScore(
  candidate: CampScoutCandidate,
  context: CampScoutScoringContext,
): number {
  const distance = candidate.distanceFromNearestRoadMiles;
  if (typeof distance !== "number") {
    return 65;
  }

  const minimum = context.preferredMinimumRoadDistanceMiles ?? 0.1;
  const maximum = context.preferredMaximumRoadDistanceMiles ?? 2.5;

  if (distance < minimum) {
    return 65;
  }
  if (distance <= maximum) {
    return 100;
  }
  if (distance <= maximum * 2) {
    return 72;
  }
  return 42;
}

function getPavementSeparationScore(candidate: CampScoutCandidate): number {
  const distance = candidate.distanceFromPavementMiles;
  if (typeof distance !== "number") {
    return 65;
  }

  if (distance >= 8) {
    return 100;
  }
  if (distance >= 4) {
    return 86;
  }
  if (distance >= 2) {
    return 70;
  }
  if (distance >= 0.75) {
    return 54;
  }
  return 34;
}

function getTechnicalEaseScore(candidate: CampScoutCandidate): number {
  const roadAccess = getAccessProximityScore(candidate, {
    preferredMinimumRoadDistanceMiles: 0,
    preferredMaximumRoadDistanceMiles: 1.4,
  });
  const access = clampScore(candidate.accessConfidence, 50);
  const slope =
    typeof candidate.slopeEstimate === "number"
      ? candidate.slopeEstimate <= 4
        ? 100
        : candidate.slopeEstimate <= 8
          ? 76
          : candidate.slopeEstimate <= 12
            ? 52
            : 30
      : clampScore(candidate.terrainConfidence, 62);

  return Math.round(access * 0.55 + roadAccess * 0.3 + slope * 0.15);
}

function getModeAdjustedRemoteness(
  candidate: CampScoutCandidate,
  mode: CampScoutFilterMode,
): number {
  const base = clampScore(candidate.remotenessScore);
  if (mode !== "remote") {
    return base;
  }

  const crowdingPenalty = clampScore(candidate.crowdingScore, 0) * 0.2;
  const pavementSignal = getPavementSeparationScore(candidate);
  const sourceCrowdingPenalty =
    candidate.sourceType === "community_suggested" ? 5 : 0;

  return roundScore(base * 0.58 + pavementSignal * 0.42 - crowdingPenalty - sourceCrowdingPenalty);
}

function getSafetyScore(candidate: CampScoutCandidate): number {
  const knownRisk = Math.max(
    clampScore(candidate.safetyRiskScore, 0),
    clampScore(candidate.environmentalRiskScore, 0),
    clampScore(candidate.knownConflictRiskScore, 0),
  );

  return 100 - knownRisk;
}

function getSourceSignalScore(candidate: CampScoutCandidate): number {
  return Math.max(
    SOURCE_BASE_SIGNAL[candidate.sourceType],
    clampScore(candidate.communitySignalScore, 0),
    clampScore(candidate.officialSignalScore, 0),
  );
}

function isMapDataStale(
  candidate: CampScoutCandidate,
  context: CampScoutScoringContext,
): boolean {
  if (candidate.isMapDataStale) {
    return true;
  }

  if (!candidate.sourceTimestamp || !context.nowIso) {
    return false;
  }

  const staleAfterDays = context.mapDataStaleAfterDays ?? 90;
  const sourceTime = Date.parse(candidate.sourceTimestamp);
  const nowTime = Date.parse(context.nowIso);

  if (Number.isNaN(sourceTime) || Number.isNaN(nowTime)) {
    return false;
  }

  return nowTime - sourceTime > staleAfterDays * 24 * 60 * 60 * 1000;
}

function inferLegalityStatus(candidate: CampScoutCandidate): CampScoutLegalityStatus {
  if (candidate.legalityStatus) return candidate.legalityStatus;
  if (candidate.isPrivateLand || candidate.isProtectedArea || candidate.isClosed || candidate.noCamping) {
    return "restricted_or_not_allowed";
  }
  if (candidate.sourceType === "official_mapped" && candidate.legalityConfidence >= 85) {
    return "verified_allowed";
  }
  if (candidate.legalityConfidence >= 70) {
    return "likely_allowed_needs_verification";
  }
  return "unknown_needs_verification";
}

function candidateSignalText(candidate: CampScoutCandidate): string {
  return [
    candidate.title,
    candidate.accessNotes,
    candidate.terrainType,
    candidate.surfaceType,
    candidate.landUse,
    ...(candidate.sourceNotes ?? []),
    ...(candidate.reasons ?? []),
    ...(candidate.cautions ?? []),
    ...(candidate.warnings ?? []),
    ...(candidate.accessBasis ?? []),
    ...(candidate.terrainBasis ?? []),
    ...(candidate.restrictions ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

function hasExcludedSurfaceSignal(candidate: CampScoutCandidate): boolean {
  if (candidate.isWaterBody || candidate.nearBuildings || candidate.nearHighway) return true;
  const text = candidateSignalText(candidate);
  return (
    /\b(lake|reservoir|pond|wetland|marsh|river|stream|creek|water body|open water|shoreline)\b/.test(text) ||
    /\b(building|structure|residential|subdivision|industrial|developed lot|parking lot)\b/.test(text) ||
    /\b(near|beside|adjacent to|on|inside)\s+(a\s+)?(highway|freeway|interstate|major road|arterial|primary road|paved highway)\b/.test(text) ||
    /\b(highway|freeway|interstate|major road|arterial|primary road|paved highway)\s+(shoulder|corridor|edge|right of way)\b/.test(text)
  );
}

export function isCampScoutHardExcluded(candidate: CampScoutCandidate): boolean {
  if (inferLegalityStatus(candidate) === "restricted_or_not_allowed") return true;
  if (hasExcludedSurfaceSignal(candidate)) return true;
  return (
    typeof candidate.slopeEstimate === "number" &&
    Number.isFinite(candidate.slopeEstimate) &&
    candidate.slopeEstimate > CAMP_SCOUT_MAX_VIABLE_SLOPE_ESTIMATE
  );
}

function buildBreakdown(
  candidate: CampScoutCandidate,
  context: CampScoutScoringContext,
  weights: CampScoutScoringWeights,
  mode: CampScoutFilterMode,
): CampScoutScoreBreakdown {
  const flatnessTerrain = getFlatnessScore(candidate);
  const accessConfidence = Math.round(
    clampScore(candidate.accessConfidence) * 0.75 +
      getAccessProximityScore(candidate, context) * 0.25,
  );
  const remotenessValue = getModeAdjustedRemoteness(candidate, mode);
  const legalAccessConfidence = clampScore(candidate.legalityConfidence);
  const safetyEnvironmentalRisk = getSafetyScore(candidate);
  const sourceSignal = getSourceSignalScore(candidate);
  const modeAdjustedAccess =
    mode === "easier_access"
      ? Math.max(accessConfidence, getTechnicalEaseScore(candidate))
      : accessConfidence;
  const weightedTotal =
    flatnessTerrain * weights.flatnessTerrain +
    modeAdjustedAccess * weights.accessConfidence +
    remotenessValue * weights.remotenessValue +
    legalAccessConfidence * weights.legalAccessConfidence +
    safetyEnvironmentalRisk * weights.safetyEnvironmentalRisk +
    sourceSignal * weights.sourceSignal;
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const total = roundScore(weightedTotal / totalWeight);

  return {
    flatnessTerrain,
    accessConfidence: modeAdjustedAccess,
    remotenessValue,
    legalAccessConfidence,
    safetyEnvironmentalRisk,
    sourceSignal,
    sourceQuality: sourceSignal,
    remoteness: remotenessValue,
    access: modeAdjustedAccess,
    legality: legalAccessConfidence,
    terrain: flatnessTerrain,
    proximity: getAccessProximityScore(candidate, context),
    confidence: total,
    total,
  };
}

function generateReasons(
  candidate: CampScoutCandidate,
  breakdown: CampScoutScoreBreakdown,
  mode: CampScoutFilterMode,
): string[] {
  const reasons: string[] = [];

  if (mode === "remote" && breakdown.remotenessValue >= 78) {
    reasons.push("Remote filter favors this pin for stronger separation from pavement and crowding.");
  }
  if (mode === "easier_access" && breakdown.accessConfidence >= 78) {
    reasons.push("Easier Access filter favors this pin for a more plausible approach.");
  }
  if (mode === "official_only" && candidate.sourceType === "official_mapped") {
    reasons.push("Official Only filter kept this mapped source and suppressed inferred/community-only pins.");
  }
  if (breakdown.flatnessTerrain >= 80) {
    reasons.push("Terrain appears reasonably flat for a remote camp setup.");
  }
  if (breakdown.legalAccessConfidence >= 80) {
    reasons.push("Legal and access confidence is strong for this candidate.");
  }
  if (breakdown.remotenessValue >= 75) {
    reasons.push("Location offers meaningful separation from developed areas.");
  }
  if (breakdown.accessConfidence >= 75) {
    reasons.push("Access looks plausible without being too exposed.");
  }
  if (breakdown.sourceSignal >= 80) {
    reasons.push(
      candidate.sourceType === "official_mapped"
        ? "Official mapped source signal improves confidence."
        : "Community or imported source signal supports the pin.",
    );
  }
  if (breakdown.safetyEnvironmentalRisk >= 80) {
    reasons.push("No high hazard or conflict signal is currently attached.");
  }

  if (reasons.length < 2) {
    reasons.push("Candidate outranked weaker pins in the selected scan area.");
  }

  return reasons.slice(0, 4);
}

function generateCautions(
  candidate: CampScoutCandidate,
  context: CampScoutScoringContext,
): string[] {
  const cautions: string[] = [];

  if (candidate.legalityConfidence < 50) {
    cautions.push("Legal status uncertain: verify land use before relying on this pin.");
  } else if (candidate.legalityConfidence < 75) {
    cautions.push("Legal status uncertain: confirm access rules and posted restrictions before arrival.");
  }

  if (candidate.accessConfidence < 65) {
    cautions.push("Access uncertain: inspect roads, trail conditions, and turnaround options.");
  }

  const terrainConfidence = clampScore(candidate.terrainConfidence, 100);
  if (terrainConfidence < 60) {
    cautions.push("Terrain confidence limited: confirm slope and surface on approach.");
  } else if (terrainConfidence < 75) {
    cautions.push("Terrain confidence moderate: confirm slope and surface before setting up.");
  }

  if (candidate.sourceType === "ecs_inferred") {
    cautions.push("ECS inferred this pin; no direct mapped campsite source is attached.");
  }

  if (
    candidate.seasonalRiskPossible ||
    clampScore(candidate.environmentalRiskScore, 0) >= 35
  ) {
    cautions.push("Seasonal risk possible: check weather, closures, and current ground conditions.");
  }

  if (
    isMapDataStale(candidate, context) ||
    clampScore(candidate.mapDataCompleteness, 100) < 70
  ) {
    cautions.push("Low data coverage: map/source data is incomplete or stale.");
  }

  if (candidate.offlineEstimate) {
    cautions.push("Offline estimate: ranking used cached/local signals and needs field verification.");
  }

  return cautions;
}

export function scoreCampScoutCandidate(
  candidate: CampScoutCandidate,
  context: CampScoutScoringContext = {},
  filters: CampScoutFilterOptions = {},
): CampScoutCandidate {
  const mode = filters.filterMode ?? "balanced";
  const weights = { ...MODE_WEIGHTS[mode], ...context.weights };
  const scoreBreakdown = buildBreakdown(candidate, context, weights, mode);
  const confidenceScore = scoreBreakdown.total;
  const confidenceGrade = getCampScoutConfidenceGrade(confidenceScore);
  const reasons = generateReasons(candidate, scoreBreakdown, mode);
  const cautions = generateCautions(candidate, context);
  const legalityStatus = inferLegalityStatus(candidate);
  const warnings = [...(candidate.warnings ?? [])];

  if (legalityStatus === "unknown_needs_verification") {
    warnings.push("Potential campsite: verify local rules, permits, closures, and land ownership.");
  } else if (legalityStatus === "likely_allowed_needs_verification") {
    warnings.push("No known conflict found from available signals; confirm local rules before occupying.");
  }

  return {
    ...candidate,
    legalityStatus,
    confidenceScore,
    confidenceGrade,
    scoreBreakdown,
    reasons,
    cautions: [...cautions, ...warnings].filter(
      (warning, index, list) => list.indexOf(warning) === index,
    ),
    warnings: warnings.filter((warning, index, list) => list.indexOf(warning) === index),
  };
}

function passesFilters(
  candidate: CampScoutCandidate,
  options: CampScoutRankingOptions,
): boolean {
  if (isCampScoutHardExcluded(candidate)) {
    return false;
  }

  if (options.filterMode === "official_only" && candidate.sourceType !== "official_mapped") {
    return false;
  }

  if (
    options.includeCommunitySuggestions === false &&
    candidate.sourceType === "community_suggested"
  ) {
    return false;
  }

  if (options.sourceTypes && !options.sourceTypes.includes(candidate.sourceType)) {
    return false;
  }

  if (!options.includeUnknownSource && candidate.sourceType === "unknown") {
    return false;
  }

  if (
    typeof options.minimumConfidenceScore === "number" &&
    candidate.confidenceScore < options.minimumConfidenceScore
  ) {
    return false;
  }

  if (
    options.minimumConfidenceGrade &&
    GRADE_ORDER[candidate.confidenceGrade] <
      GRADE_ORDER[options.minimumConfidenceGrade]
  ) {
    return false;
  }

  if (
    typeof options.minimumRemotenessScore === "number" &&
    candidate.remotenessScore < options.minimumRemotenessScore
  ) {
    return false;
  }

  if (
    typeof options.minimumAccessConfidence === "number" &&
    candidate.accessConfidence < options.minimumAccessConfidence
  ) {
    return false;
  }

  if (
    typeof options.minimumLegalityConfidence === "number" &&
    candidate.legalityConfidence < options.minimumLegalityConfidence
  ) {
    return false;
  }

  if (
    typeof options.maximumSlopeEstimate === "number" &&
    typeof candidate.slopeEstimate === "number" &&
    candidate.slopeEstimate > options.maximumSlopeEstimate
  ) {
    return false;
  }

  if (
    typeof options.maximumDistanceFromUserMiles === "number" &&
    typeof candidate.distanceFromUserMiles === "number" &&
    candidate.distanceFromUserMiles > options.maximumDistanceFromUserMiles
  ) {
    return false;
  }

  if (
    typeof options.minimumDistanceFromPavementMiles === "number" &&
    typeof candidate.distanceFromPavementMiles === "number" &&
    candidate.distanceFromPavementMiles < options.minimumDistanceFromPavementMiles
  ) {
    return false;
  }

  if (options.allowLowConfidenceFallback) {
    return true;
  }

  if (!options.expandedResults && candidate.confidenceGrade === "D") {
    return false;
  }

  if (!options.expandedResults && candidate.confidenceGrade === "C") {
    return false;
  }

  if (!options.expandedResults && candidate.confidenceGrade === "B") {
    return candidate.confidenceScore >= 75;
  }

  return options.expandedResults ? candidate.confidenceGrade !== "D" : true;
}

function compareRankedCandidates(
  left: CampScoutCandidate,
  right: CampScoutCandidate,
): number {
  const leftBreakdown = left.scoreBreakdown;
  const rightBreakdown = right.scoreBreakdown;
  const comparisons = [
    right.confidenceScore - left.confidenceScore,
    right.legalityConfidence - left.legalityConfidence,
    right.accessConfidence - left.accessConfidence,
    rightBreakdown.flatnessTerrain - leftBreakdown.flatnessTerrain,
    rightBreakdown.proximity - leftBreakdown.proximity,
    rightBreakdown.sourceSignal - leftBreakdown.sourceSignal,
    rightBreakdown.safetyEnvironmentalRisk -
      leftBreakdown.safetyEnvironmentalRisk,
    left.id.localeCompare(right.id),
  ];

  return comparisons.find((value) => value !== 0) ?? 0;
}

export function rankCampScoutCandidates(
  candidates: CampScoutCandidate[],
  options: CampScoutRankingOptions = {},
): CampScoutCandidate[] {
  const context = options.context ?? {};
  const limit = options.expandedResults
    ? Math.min(
        Math.max(1, options.expandedLimit ?? options.maximumCandidates ?? CAMP_SCOUT_EXPANDED_PIN_LIMIT),
        CAMP_SCOUT_EXPANDED_PIN_LIMIT,
      )
    : Math.min(
        Math.max(1, options.maximumCandidates ?? CAMP_SCOUT_DEFAULT_PIN_LIMIT),
        CAMP_SCOUT_DEFAULT_PIN_LIMIT,
      );

  return candidates
    .map((candidate) => scoreCampScoutCandidate(candidate, context, options))
    .filter((candidate) => passesFilters(candidate, options))
    .sort(compareRankedCandidates)
    .slice(0, limit);
}

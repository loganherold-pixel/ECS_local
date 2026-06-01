import {
  rankCampScoutCandidates,
  scoreCampScoutCandidate,
  type CampScoutRankingOptions,
  type CampScoutScoringContext,
} from "./campScoutScoring";
import type {
  CampScoutArea,
  CampScoutAreaBounds,
  CampScoutCandidate,
  CampScoutCoordinate,
  CampScoutFilterOptions,
  CampScoutScanResult,
  CampScoutScoreBreakdown,
  CampScoutSourceType,
} from "./types";

export type CampScoutCandidateSourceInput = Partial<
  Omit<
    CampScoutCandidate,
    "coordinate" | "sourceType" | "confidenceGrade" | "scoreBreakdown" | "reasons" | "cautions"
  >
> & {
  id?: string;
  title?: string;
  name?: string;
  coordinate?: CampScoutCoordinate;
  latitude?: number;
  longitude?: number;
  sourceType?: CampScoutSourceType;
  sourceNote?: string;
  sourceNotes?: string[];
};

export type EcsInferredCampScoutCandidateInput = CampScoutCandidateSourceInput & {
  sourceType?: "ecs_inferred";
};

export type OfficialMappedCampScoutCandidateInput = CampScoutCandidateSourceInput & {
  sourceType?: "official_mapped";
};

export type CommunitySuggestedCampScoutCandidateInput = CampScoutCandidateSourceInput & {
  sourceType?: "community_suggested";
};

export type ImportedRouteCampScoutCandidateInput = CampScoutCandidateSourceInput & {
  sourceType?: "imported_route_context";
};

export type CampScoutAggregationInput = {
  area: CampScoutArea;
  ecsInferredCandidates?: EcsInferredCampScoutCandidateInput[];
  officialMappedCandidates?: OfficialMappedCampScoutCandidateInput[];
  communitySuggestedCandidates?: CommunitySuggestedCampScoutCandidateInput[];
  importedRouteCandidates?: ImportedRouteCampScoutCandidateInput[];
  unknownCandidates?: CampScoutCandidateSourceInput[];
  filterOptions?: CampScoutFilterOptions;
  context?: CampScoutScoringContext;
  generatedAt?: string;
  scanBounds?: CampScoutAreaBounds;
  dedupeRadiusMiles?: number;
  warnings?: string[];
};

type NormalizedSourceBucket = {
  sourceType: CampScoutSourceType;
  candidates: CampScoutCandidateSourceInput[];
};

const DEFAULT_DEDUPE_RADIUS_MILES = 0.08;
const EARTH_RADIUS_MILES = 3958.8;

const SOURCE_PRIORITY: Record<CampScoutSourceType, number> = {
  official_mapped: 5,
  community_suggested: 4,
  imported_route_context: 3,
  ecs_inferred: 2,
  unknown: 1,
};

const EMPTY_BREAKDOWN: CampScoutScoreBreakdown = {
  flatnessTerrain: 0,
  accessConfidence: 0,
  remotenessValue: 0,
  legalAccessConfidence: 0,
  safetyEnvironmentalRisk: 0,
  sourceSignal: 0,
  sourceQuality: 0,
  remoteness: 0,
  access: 0,
  legality: 0,
  terrain: 0,
  proximity: 0,
  confidence: 0,
  total: 0,
};

const SOURCE_DEFAULTS: Record<
  CampScoutSourceType,
  Pick<
    CampScoutCandidate,
    | "accessConfidence"
    | "legalityConfidence"
    | "remotenessScore"
    | "terrainConfidence"
    | "mapDataCompleteness"
  > &
    Partial<Pick<CampScoutCandidate, "officialSignalScore" | "communitySignalScore">>
> = {
  official_mapped: {
    accessConfidence: 80,
    legalityConfidence: 86,
    remotenessScore: 58,
    terrainConfidence: 68,
    mapDataCompleteness: 90,
    officialSignalScore: 92,
  },
  community_suggested: {
    accessConfidence: 72,
    legalityConfidence: 68,
    remotenessScore: 72,
    terrainConfidence: 66,
    mapDataCompleteness: 78,
    communitySignalScore: 82,
  },
  imported_route_context: {
    accessConfidence: 66,
    legalityConfidence: 60,
    remotenessScore: 68,
    terrainConfidence: 62,
    mapDataCompleteness: 72,
  },
  ecs_inferred: {
    accessConfidence: 64,
    legalityConfidence: 55,
    remotenessScore: 76,
    terrainConfidence: 70,
    mapDataCompleteness: 70,
  },
  unknown: {
    accessConfidence: 50,
    legalityConfidence: 45,
    remotenessScore: 55,
    terrainConfidence: 50,
    mapDataCompleteness: 50,
  },
};

function clampScore(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, value));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function distanceMiles(left: CampScoutCoordinate, right: CampScoutCoordinate): number {
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function coordinateFromInput(
  input: CampScoutCandidateSourceInput,
): CampScoutCoordinate | null {
  if (
    input.coordinate &&
    Number.isFinite(input.coordinate.latitude) &&
    Number.isFinite(input.coordinate.longitude)
  ) {
    return input.coordinate;
  }

  if (Number.isFinite(input.latitude) && Number.isFinite(input.longitude)) {
    return {
      latitude: Number(input.latitude),
      longitude: Number(input.longitude),
    };
  }

  return null;
}

function createCandidateId(
  input: CampScoutCandidateSourceInput,
  sourceType: CampScoutSourceType,
  coordinate: CampScoutCoordinate,
): string {
  if (input.id) {
    return `${sourceType}:${input.id}`;
  }

  const title = (input.title ?? input.name ?? "camp-scout-candidate")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${sourceType}:${title}:${coordinate.latitude.toFixed(5)},${coordinate.longitude.toFixed(5)}`;
}

function sourceNotesFromInput(input: CampScoutCandidateSourceInput): string[] {
  return [
    ...(Array.isArray(input.sourceNotes) ? input.sourceNotes : []),
    ...(input.sourceNote ? [input.sourceNote] : []),
    ...(input.sourceLabel ? [input.sourceLabel] : []),
  ].filter((note, index, notes): note is string => {
    return typeof note === "string" && note.trim().length > 0 && notes.indexOf(note) === index;
  });
}

function normalizeCandidate(
  input: CampScoutCandidateSourceInput,
  sourceType: CampScoutSourceType,
): CampScoutCandidate | null {
  const coordinate = coordinateFromInput(input);
  if (!coordinate) {
    return null;
  }

  const defaults = SOURCE_DEFAULTS[sourceType];
  return {
    id: createCandidateId(input, sourceType, coordinate),
    coordinate,
    title: input.title ?? input.name ?? "Camp Scout candidate",
    sourceType,
    confidenceScore: 0,
    confidenceGrade: "D",
    scoreBreakdown: { ...EMPTY_BREAKDOWN },
    reasons: [],
    cautions: [],
    distanceFromUserMiles: input.distanceFromUserMiles,
    distanceFromNearestRoadMiles: input.distanceFromNearestRoadMiles,
    distanceFromPavementMiles: input.distanceFromPavementMiles,
    slopeEstimate: input.slopeEstimate,
    terrainConfidence: clampScore(input.terrainConfidence, defaults.terrainConfidence ?? 50),
    accessConfidence: clampScore(input.accessConfidence, defaults.accessConfidence),
    legalityConfidence: clampScore(input.legalityConfidence, defaults.legalityConfidence),
    remotenessScore: clampScore(input.remotenessScore, defaults.remotenessScore),
    safetyRiskScore: clampScore(input.safetyRiskScore, 10),
    environmentalRiskScore: clampScore(input.environmentalRiskScore, 10),
    knownConflictRiskScore: clampScore(input.knownConflictRiskScore, 0),
    seasonalRiskPossible: input.seasonalRiskPossible,
    offlineEstimate: input.offlineEstimate,
    crowdingScore: clampScore(input.crowdingScore, 0),
    communitySignalScore: clampScore(
      input.communitySignalScore,
      defaults.communitySignalScore ?? 0,
    ),
    officialSignalScore: clampScore(
      input.officialSignalScore,
      defaults.officialSignalScore ?? 0,
    ),
    recommendationCount: input.recommendationCount,
    verificationCount: input.verificationCount,
    lastVerifiedAt: input.lastVerifiedAt,
    negativeReportsCount: input.negativeReportsCount,
    moderationStatus: input.moderationStatus,
    crowdingSignal: input.crowdingSignal,
    photoCount: input.photoCount,
    mapDataCompleteness: clampScore(
      input.mapDataCompleteness,
      defaults.mapDataCompleteness ?? 50,
    ),
    isMapDataStale: input.isMapDataStale,
    createdAt: input.createdAt,
    sourceTimestamp: input.sourceTimestamp,
    sourceLabel: input.sourceLabel,
    sourceNotes: sourceNotesFromInput(input),
    mergedSourceTypes: [sourceType],
  };
}

function candidateStrength(candidate: CampScoutCandidate): number {
  return (
    candidate.confidenceScore * 100 +
    SOURCE_PRIORITY[candidate.sourceType] * 10 +
    candidate.legalityConfidence +
    candidate.accessConfidence
  );
}

function mergeUniqueText(...values: Array<string | undefined>): string | undefined {
  const unique = values
    .flatMap((value) => (value ? value.split(" + ") : []))
    .map((value) => value.trim())
    .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);

  return unique.length > 0 ? unique.join(" + ") : undefined;
}

function mergeSourceNotes(
  left: CampScoutCandidate,
  right: CampScoutCandidate,
): string[] {
  return [
    ...(left.sourceNotes ?? []),
    ...(right.sourceNotes ?? []),
  ].filter((note, index, notes) => notes.indexOf(note) === index);
}

function mergeNearbyCandidates(
  left: CampScoutCandidate,
  right: CampScoutCandidate,
): CampScoutCandidate {
  const preferred =
    candidateStrength(right) > candidateStrength(left) ? right : left;
  const secondary = preferred === left ? right : left;
  const mergedSourceTypes = [
    ...(preferred.mergedSourceTypes ?? [preferred.sourceType]),
    ...(secondary.mergedSourceTypes ?? [secondary.sourceType]),
  ].filter((sourceType, index, sourceTypes) => sourceTypes.indexOf(sourceType) === index);

  return {
    ...preferred,
    sourceLabel: mergeUniqueText(preferred.sourceLabel, secondary.sourceLabel),
    sourceNotes: mergeSourceNotes(preferred, secondary),
    mergedSourceTypes,
    communitySignalScore: Math.max(
      preferred.communitySignalScore ?? 0,
      secondary.communitySignalScore ?? 0,
    ),
    officialSignalScore: Math.max(
      preferred.officialSignalScore ?? 0,
      secondary.officialSignalScore ?? 0,
    ),
    recommendationCount: Math.max(
      preferred.recommendationCount ?? 0,
      secondary.recommendationCount ?? 0,
    ),
    verificationCount: Math.max(
      preferred.verificationCount ?? 0,
      secondary.verificationCount ?? 0,
    ),
    lastVerifiedAt: preferred.lastVerifiedAt ?? secondary.lastVerifiedAt,
    negativeReportsCount: Math.max(
      preferred.negativeReportsCount ?? 0,
      secondary.negativeReportsCount ?? 0,
    ),
    moderationStatus: preferred.moderationStatus ?? secondary.moderationStatus,
    crowdingSignal: Math.max(
      preferred.crowdingSignal ?? 0,
      secondary.crowdingSignal ?? 0,
    ),
    photoCount: Math.max(preferred.photoCount ?? 0, secondary.photoCount ?? 0),
    seasonalRiskPossible:
      preferred.seasonalRiskPossible || secondary.seasonalRiskPossible,
    offlineEstimate: preferred.offlineEstimate || secondary.offlineEstimate,
    mapDataCompleteness: Math.max(
      preferred.mapDataCompleteness ?? 0,
      secondary.mapDataCompleteness ?? 0,
    ),
  };
}

function dedupeNearbyCandidates(
  candidates: CampScoutCandidate[],
  radiusMiles: number,
): { candidates: CampScoutCandidate[]; duplicateCount: number } {
  const deduped: CampScoutCandidate[] = [];
  let duplicateCount = 0;

  for (const candidate of candidates) {
    const nearbyIndex = deduped.findIndex(
      (existing) =>
        distanceMiles(existing.coordinate, candidate.coordinate) <= radiusMiles,
    );

    if (nearbyIndex === -1) {
      deduped.push(candidate);
      continue;
    }

    duplicateCount += 1;
    deduped[nearbyIndex] = mergeNearbyCandidates(deduped[nearbyIndex], candidate);
  }

  return { candidates: deduped, duplicateCount };
}

function getSourceBuckets(input: CampScoutAggregationInput): NormalizedSourceBucket[] {
  return [
    { sourceType: "ecs_inferred", candidates: input.ecsInferredCandidates ?? [] },
    { sourceType: "official_mapped", candidates: input.officialMappedCandidates ?? [] },
    { sourceType: "community_suggested", candidates: input.communitySuggestedCandidates ?? [] },
    { sourceType: "imported_route_context", candidates: input.importedRouteCandidates ?? [] },
    { sourceType: "unknown", candidates: input.unknownCandidates ?? [] },
  ];
}

function boundsFromCoordinates(
  coordinates: CampScoutCoordinate[],
): CampScoutAreaBounds | undefined {
  if (coordinates.length === 0) {
    return undefined;
  }

  return {
    north: Math.max(...coordinates.map((coordinate) => coordinate.latitude)),
    south: Math.min(...coordinates.map((coordinate) => coordinate.latitude)),
    east: Math.max(...coordinates.map((coordinate) => coordinate.longitude)),
    west: Math.min(...coordinates.map((coordinate) => coordinate.longitude)),
  };
}

function getScanBounds(
  area: CampScoutArea,
  inputBounds: CampScoutAreaBounds | undefined,
  candidates: CampScoutCandidate[],
): CampScoutAreaBounds | undefined {
  return (
    inputBounds ??
    area.bounds ??
    boundsFromCoordinates(area.polygon ?? []) ??
    boundsFromCoordinates(candidates.map((candidate) => candidate.coordinate))
  );
}

function getSourceTypesUsed(candidates: CampScoutCandidate[]): CampScoutSourceType[] {
  return candidates
    .flatMap((candidate) => candidate.mergedSourceTypes ?? [candidate.sourceType])
    .filter((sourceType, index, sourceTypes) => sourceTypes.indexOf(sourceType) === index);
}

function isLowConfidenceHidden(
  candidate: CampScoutCandidate,
  options: CampScoutRankingOptions,
): boolean {
  if (options.expandedResults) {
    return candidate.confidenceGrade === "D";
  }

  return (
    candidate.confidenceGrade === "C" ||
    candidate.confidenceGrade === "D" ||
    (candidate.confidenceGrade === "B" && candidate.confidenceScore < 75)
  );
}

export function aggregateCampScoutCandidates(
  input: CampScoutAggregationInput,
): CampScoutScanResult {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const warnings = [...(input.warnings ?? [])];
  const sourceBuckets = getSourceBuckets(input);
  let invalidCandidateCount = 0;
  const normalizedCandidates = sourceBuckets.flatMap(({ sourceType, candidates }) =>
    candidates.flatMap((candidate) => {
      const normalized = normalizeCandidate(candidate, candidate.sourceType ?? sourceType);
      if (!normalized) {
        invalidCandidateCount += 1;
        return [];
      }
      return [normalized];
    }),
  );

  if (invalidCandidateCount > 0) {
    warnings.push(`${invalidCandidateCount} candidate${invalidCandidateCount === 1 ? "" : "s"} missing coordinates were ignored.`);
  }

  const context = { nowIso: generatedAt, ...(input.context ?? {}) };
  const scoredCandidates = normalizedCandidates.map((candidate) =>
    scoreCampScoutCandidate(candidate, context, input.filterOptions),
  );
  const { candidates: dedupedCandidates, duplicateCount } = dedupeNearbyCandidates(
    scoredCandidates,
    input.dedupeRadiusMiles ?? DEFAULT_DEDUPE_RADIUS_MILES,
  );

  if (duplicateCount > 0) {
    warnings.push(`${duplicateCount} nearby duplicate candidate${duplicateCount === 1 ? "" : "s"} suppressed.`);
  }

  const rankingOptions: CampScoutRankingOptions = {
    ...(input.filterOptions ?? {}),
    context,
  };
  const candidatesShown = rankCampScoutCandidates(dedupedCandidates, rankingOptions);
  const shownIds = new Set(candidatesShown.map((candidate) => candidate.id));
  const hiddenLowConfidenceCount = dedupedCandidates.filter(
    (candidate) => !shownIds.has(candidate.id) && isLowConfidenceHidden(candidate, rankingOptions),
  ).length;

  if (candidatesShown.length === 0) {
    warnings.push(
      input.filterOptions?.filterMode === "official_only"
        ? "No high-confidence official mapped camp candidates found in this area. Try Balanced mode or enable community suggestions."
        : "No high-confidence camp candidates found in this area. Try widening the area, reducing remoteness strictness, or enabling official mapped camps.",
    );
  }

  const officialMappedCount = normalizedCandidates.filter(
    (candidate) => candidate.sourceType === "official_mapped",
  ).length;
  const communitySuggestedCount = normalizedCandidates.filter(
    (candidate) => candidate.sourceType === "community_suggested",
  ).length;
  const ecsInferredCount = normalizedCandidates.filter(
    (candidate) => candidate.sourceType === "ecs_inferred",
  ).length;
  const scanBounds = getScanBounds(input.area, input.scanBounds, normalizedCandidates);
  const summary =
    candidatesShown.length > 0
      ? `${candidatesShown.length} Camp Scout candidate${candidatesShown.length === 1 ? "" : "s"} shown from ${normalizedCandidates.length} considered.`
      : "No high-confidence camp candidates found in this area.";

  return {
    id: `camp-scout-scan-${input.area.id}-${generatedAt}`,
    area: input.area,
    candidates: candidatesShown,
    candidatesShown,
    totalCandidatesConsidered: normalizedCandidates.length,
    hiddenLowConfidenceCount,
    officialMappedCount,
    communitySuggestedCount,
    ecsInferredCount,
    warnings,
    scanBounds,
    filterOptions: input.filterOptions,
    generatedAt,
    sourceTypesUsed: getSourceTypesUsed(normalizedCandidates),
    summary,
    cautions: warnings,
  };
}

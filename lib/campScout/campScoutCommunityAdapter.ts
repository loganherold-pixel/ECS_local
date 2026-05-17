import { getCampScoutConfidenceGrade } from "./campScoutScoring";
import type {
  CampScoutArea,
  CampScoutCandidate,
  CampScoutCommunityModerationStatus,
  CampScoutCoordinate,
  CampScoutFilterOptions,
  CampScoutScoreBreakdown,
} from "./types";

export type CampScoutCommunityCandidateRecord = {
  id?: string;
  title?: string;
  name?: string;
  coordinate?: CampScoutCoordinate;
  latitude?: number;
  longitude?: number;
  confidenceScore?: number;
  accessConfidence?: number;
  legalityConfidence?: number;
  remotenessScore?: number;
  terrainConfidence?: number;
  distanceFromUserMiles?: number;
  distanceFromNearestRoadMiles?: number;
  distanceFromPavementMiles?: number;
  slopeEstimate?: number;
  safetyRiskScore?: number;
  environmentalRiskScore?: number;
  knownConflictRiskScore?: number;
  mapDataCompleteness?: number;
  createdAt?: string;
  sourceTimestamp?: string;
  sourceLabel?: string;
  sourceNotes?: string[];
  recommendationCount?: number;
  verificationCount?: number;
  lastVerifiedAt?: string;
  negativeReportsCount?: number;
  moderationStatus?: CampScoutCommunityModerationStatus;
  crowdingSignal?: number;
  photoCount?: number;
};

export type CampScoutCommunityCandidateFilters = CampScoutFilterOptions & {
  minimumCommunityConfidenceScore?: number;
  maxNegativeReportsCount?: number;
  trustedModerationStatuses?: CampScoutCommunityModerationStatus[];
};

export type CampScoutCommunityCandidateAdapter = {
  getCommunityCampCandidatesForArea: (
    area: CampScoutArea,
    filters?: CampScoutCommunityCandidateFilters,
  ) =>
    | CampScoutCommunityCandidateRecord[]
    | Promise<CampScoutCommunityCandidateRecord[]>;
};

const DEFAULT_MIN_COMMUNITY_CONFIDENCE_SCORE = 70;
const DEFAULT_MAX_NEGATIVE_REPORTS = 2;
const TRUSTED_MODERATION_STATUSES: CampScoutCommunityModerationStatus[] = [
  "approved",
  "trusted",
];

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

function clampScore(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function coordinateFromRecord(
  record: CampScoutCommunityCandidateRecord,
): CampScoutCoordinate | null {
  if (
    record.coordinate &&
    Number.isFinite(record.coordinate.latitude) &&
    Number.isFinite(record.coordinate.longitude)
  ) {
    return record.coordinate;
  }

  if (Number.isFinite(record.latitude) && Number.isFinite(record.longitude)) {
    return {
      latitude: Number(record.latitude),
      longitude: Number(record.longitude),
    };
  }

  return null;
}

function distanceMiles(left: CampScoutCoordinate, right: CampScoutCoordinate): number {
  const earthRadiusMiles = 3958.8;
  const latitudeDelta = ((right.latitude - left.latitude) * Math.PI) / 180;
  const longitudeDelta = ((right.longitude - left.longitude) * Math.PI) / 180;
  const leftLatitude = (left.latitude * Math.PI) / 180;
  const rightLatitude = (right.latitude * Math.PI) / 180;
  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(
  coordinate: CampScoutCoordinate,
  polygon: CampScoutCoordinate[],
): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const current = polygon[i];
    const previous = polygon[j];
    const intersects =
      current.longitude > coordinate.longitude !==
        previous.longitude > coordinate.longitude &&
      coordinate.latitude <
        ((previous.latitude - current.latitude) *
          (coordinate.longitude - current.longitude)) /
          (previous.longitude - current.longitude) +
          current.latitude;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isInsideArea(
  coordinate: CampScoutCoordinate,
  area: CampScoutArea,
): boolean {
  if (area.polygon && area.polygon.length >= 3) {
    return pointInPolygon(coordinate, area.polygon);
  }

  if (area.bounds) {
    return (
      coordinate.latitude <= area.bounds.north &&
      coordinate.latitude >= area.bounds.south &&
      coordinate.longitude <= area.bounds.east &&
      coordinate.longitude >= area.bounds.west
    );
  }

  if (area.center && typeof area.radiusMiles === "number") {
    return distanceMiles(coordinate, area.center) <= area.radiusMiles;
  }

  return false;
}

function hasTrustedModeration(
  record: CampScoutCommunityCandidateRecord,
  filters: CampScoutCommunityCandidateFilters,
): boolean {
  if (!record.moderationStatus) {
    return true;
  }

  const trustedStatuses =
    filters.trustedModerationStatuses ?? TRUSTED_MODERATION_STATUSES;
  return trustedStatuses.includes(record.moderationStatus);
}

function estimateCommunitySignal(
  record: CampScoutCommunityCandidateRecord,
): number {
  const recommendations = Math.min(record.recommendationCount ?? 0, 12) * 2;
  const verifications = Math.min(record.verificationCount ?? 0, 8) * 4;
  const reports = Math.min(record.negativeReportsCount ?? 0, 8) * 6;
  const photos = Math.min(record.photoCount ?? 0, 6);
  const moderationBoost =
    record.moderationStatus === "trusted"
      ? 14
      : record.moderationStatus === "approved"
        ? 9
        : 0;

  return clampScore(58 + recommendations + verifications + photos + moderationBoost - reports, 58);
}

function estimateConfidenceScore(
  record: CampScoutCommunityCandidateRecord,
): number {
  if (typeof record.confidenceScore === "number") {
    return clampScore(record.confidenceScore, 0);
  }

  const access = clampScore(record.accessConfidence, 72);
  const legality = clampScore(record.legalityConfidence, 68);
  const terrain = clampScore(record.terrainConfidence, 66);
  const communitySignal = estimateCommunitySignal(record);

  return clampScore(
    access * 0.24 + legality * 0.3 + terrain * 0.16 + communitySignal * 0.3,
    0,
  );
}

function normalizeCommunityCandidate(
  record: CampScoutCommunityCandidateRecord,
  index: number,
): CampScoutCandidate | null {
  const coordinate = coordinateFromRecord(record);
  if (!coordinate) {
    return null;
  }

  const confidenceScore = estimateConfidenceScore(record);
  const recommendationCount = record.recommendationCount ?? 0;
  const verificationCount = record.verificationCount ?? 0;
  const negativeReportsCount = record.negativeReportsCount ?? 0;

  return {
    id: `community_suggested:${record.id ?? `area-candidate-${index + 1}`}`,
    coordinate,
    title: record.title ?? record.name ?? `Community candidate ${index + 1}`,
    sourceType: "community_suggested",
    confidenceScore,
    confidenceGrade: getCampScoutConfidenceGrade(confidenceScore),
    scoreBreakdown: {
      ...EMPTY_BREAKDOWN,
      confidence: confidenceScore,
      total: confidenceScore,
    },
    reasons: [
      "Community-suggested candidate passed Camp Scout confidence filters.",
      verificationCount > 0
        ? `${verificationCount} community verification${verificationCount === 1 ? "" : "s"} attached.`
        : "Community signal is available for future verification review.",
    ],
    cautions:
      negativeReportsCount > 0
        ? ["Community reports are attached; review current conditions before relying on this pin."]
        : [],
    distanceFromUserMiles: record.distanceFromUserMiles,
    distanceFromNearestRoadMiles: record.distanceFromNearestRoadMiles,
    distanceFromPavementMiles: record.distanceFromPavementMiles,
    slopeEstimate: record.slopeEstimate,
    terrainConfidence: clampScore(record.terrainConfidence, 66),
    accessConfidence: clampScore(record.accessConfidence, 72),
    legalityConfidence: clampScore(record.legalityConfidence, 68),
    remotenessScore: clampScore(record.remotenessScore, 72),
    safetyRiskScore: clampScore(record.safetyRiskScore, 10),
    environmentalRiskScore: clampScore(record.environmentalRiskScore, 10),
    knownConflictRiskScore: clampScore(
      record.knownConflictRiskScore,
      negativeReportsCount > 0 ? Math.min(70, negativeReportsCount * 18) : 0,
    ),
    crowdingScore: clampScore(record.crowdingSignal, 35),
    communitySignalScore: estimateCommunitySignal(record),
    mapDataCompleteness: clampScore(record.mapDataCompleteness, 76),
    createdAt: record.createdAt,
    sourceTimestamp: record.sourceTimestamp ?? record.lastVerifiedAt ?? record.createdAt,
    sourceLabel: record.sourceLabel ?? "Community suggested campsite",
    sourceNotes: record.sourceNotes ?? [],
    recommendationCount,
    verificationCount,
    lastVerifiedAt: record.lastVerifiedAt,
    negativeReportsCount,
    moderationStatus: record.moderationStatus,
    crowdingSignal: record.crowdingSignal,
    photoCount: record.photoCount,
    mergedSourceTypes: ["community_suggested"],
  };
}

function passesCommunityCandidateFilters(
  candidate: CampScoutCandidate,
  filters: CampScoutCommunityCandidateFilters,
): boolean {
  const minimumConfidence =
    filters.minimumCommunityConfidenceScore ??
    filters.minimumConfidenceScore ??
    DEFAULT_MIN_COMMUNITY_CONFIDENCE_SCORE;
  const maxNegativeReports =
    filters.maxNegativeReportsCount ?? DEFAULT_MAX_NEGATIVE_REPORTS;

  return (
    candidate.confidenceScore >= minimumConfidence &&
    (candidate.negativeReportsCount ?? 0) <= maxNegativeReports
  );
}

export async function getCommunityCampCandidatesForArea(
  area: CampScoutArea,
  filters: CampScoutCommunityCandidateFilters = {},
  adapter?: CampScoutCommunityCandidateAdapter | null,
): Promise<CampScoutCandidate[]> {
  if (
    filters.includeCommunitySuggestions === false ||
    filters.filterMode === "official_only" ||
    !adapter
  ) {
    return [];
  }

  try {
    // TODO(camp-scout-community): replace this provider seam with the community
    // review service once approved/trusted moderation and privacy-safe reporting
    // are available. Keep this adapter returning normalized CampScoutCandidate
    // objects so the ranking/aggregation pipeline does not need to change.
    const records = await adapter.getCommunityCampCandidatesForArea(area, filters);
    return records
      .filter((record) => hasTrustedModeration(record, filters))
      .map(normalizeCommunityCandidate)
      .filter((candidate): candidate is CampScoutCandidate => !!candidate)
      .filter((candidate) => isInsideArea(candidate.coordinate, area))
      .filter((candidate) => passesCommunityCandidateFilters(candidate, filters));
  } catch {
    return [];
  }
}

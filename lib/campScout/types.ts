export type CampScoutSourceType =
  | "ecs_inferred"
  | "official_mapped"
  | "community_suggested"
  | "imported_route_context"
  | "unknown";

export type CampScoutConfidenceGrade = "A" | "B" | "C" | "D";
export type CampScoutLegalityStatus =
  | "verified_allowed"
  | "likely_allowed_needs_verification"
  | "unknown_needs_verification"
  | "restricted_or_not_allowed";
export type CampScoutFilterMode =
  | "remote"
  | "balanced"
  | "easier_access"
  | "official_only";
export type CampScoutCommunityModerationStatus =
  | "approved"
  | "trusted"
  | "pending"
  | "needs_review"
  | "rejected"
  | "flagged"
  | "unknown";

export type CampScoutCoordinate = {
  latitude: number;
  longitude: number;
};

export type CampScoutAreaBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type CampScoutArea = {
  id: string;
  title?: string;
  center?: CampScoutCoordinate;
  radiusMiles?: number;
  bounds?: CampScoutAreaBounds;
  polygon?: CampScoutCoordinate[];
  userCoordinate?: CampScoutCoordinate;
  createdAt?: string;
};

export type CampScoutScoreBreakdown = {
  flatnessTerrain: number;
  accessConfidence: number;
  remotenessValue: number;
  legalAccessConfidence: number;
  safetyEnvironmentalRisk: number;
  sourceSignal: number;
  sourceQuality: number;
  remoteness: number;
  access: number;
  legality: number;
  terrain: number;
  proximity: number;
  confidence: number;
  total: number;
};

export type CampScoutCandidate = {
  id: string;
  coordinate: CampScoutCoordinate;
  title: string;
  sourceType: CampScoutSourceType;
  confidenceScore: number;
  confidenceGrade: CampScoutConfidenceGrade;
  scoreBreakdown: CampScoutScoreBreakdown;
  reasons: string[];
  cautions: string[];
  distanceFromUserMiles?: number;
  distanceFromNearestRoadMiles?: number;
  distanceFromPavementMiles?: number;
  slopeEstimate?: number;
  terrainConfidence?: number;
  accessConfidence: number;
  legalityConfidence: number;
  remotenessScore: number;
  safetyRiskScore?: number;
  environmentalRiskScore?: number;
  knownConflictRiskScore?: number;
  seasonalRiskPossible?: boolean;
  offlineEstimate?: boolean;
  crowdingScore?: number;
  communitySignalScore?: number;
  officialSignalScore?: number;
  recommendationCount?: number;
  verificationCount?: number;
  lastVerifiedAt?: string;
  negativeReportsCount?: number;
  moderationStatus?: CampScoutCommunityModerationStatus;
  crowdingSignal?: number;
  photoCount?: number;
  mapDataCompleteness?: number;
  isMapDataStale?: boolean;
  createdAt?: string;
  sourceTimestamp?: string;
  sourceLabel?: string;
  sourceNotes?: string[];
  mergedSourceTypes?: CampScoutSourceType[];
  legalityStatus?: CampScoutLegalityStatus;
  warnings?: string[];
  accessNotes?: string;
  distanceFromRoadOrTrail?: number;
  slope?: number;
  isPrivateLand?: boolean;
  isProtectedArea?: boolean;
  isClosed?: boolean;
  noCamping?: boolean;
  isEcsInferredEligibilityCandidate?: boolean;
  dispersedCampingRegionId?: string;
  eligibilityConfidence?: string;
  landManager?: string;
  accessBasis?: string[];
  terrainBasis?: string[];
  restrictions?: string[];
  verificationWarning?: string;
  routeDistanceMiles?: number;
};

export type CampScoutFilterOptions = {
  filterMode?: CampScoutFilterMode;
  includeCommunitySuggestions?: boolean;
  sourceTypes?: CampScoutSourceType[];
  minimumConfidenceScore?: number;
  minimumConfidenceGrade?: CampScoutConfidenceGrade;
  minimumRemotenessScore?: number;
  minimumAccessConfidence?: number;
  minimumLegalityConfidence?: number;
  maximumSlopeEstimate?: number;
  maximumDistanceFromUserMiles?: number;
  minimumDistanceFromPavementMiles?: number;
  maximumCandidates?: number;
  expandedResults?: boolean;
  expandedLimit?: number;
  includeUnknownSource?: boolean;
  allowLowConfidenceFallback?: boolean;
};

export type CampScoutScanResult = {
  id: string;
  area: CampScoutArea;
  candidates: CampScoutCandidate[];
  candidatesShown: CampScoutCandidate[];
  totalCandidatesConsidered: number;
  hiddenLowConfidenceCount: number;
  officialMappedCount: number;
  communitySuggestedCount: number;
  ecsInferredCount: number;
  warnings: string[];
  scanBounds?: CampScoutAreaBounds;
  filterOptions?: CampScoutFilterOptions;
  generatedAt: string;
  sourceTypesUsed: CampScoutSourceType[];
  summary?: string;
  cautions: string[];
};

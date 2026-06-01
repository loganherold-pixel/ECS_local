export type {
  CampScoutArea,
  CampScoutAreaBounds,
  CampScoutCandidate,
  CampScoutCommunityModerationStatus,
  CampScoutConfidenceGrade,
  CampScoutCoordinate,
  CampScoutFilterMode,
  CampScoutFilterOptions,
  CampScoutLegalityStatus,
  CampScoutScanResult,
  CampScoutScoreBreakdown,
  CampScoutSourceType,
} from "./types";

export {
  CAMP_SCOUT_DEFAULT_PIN_LIMIT,
  CAMP_SCOUT_EXPANDED_PIN_LIMIT,
  getCampScoutConfidenceGrade,
  rankCampScoutCandidates,
  scoreCampScoutCandidate,
} from "./campScoutScoring";

export type {
  CampScoutRankingOptions,
  CampScoutScoringContext,
  CampScoutScoringWeights,
} from "./campScoutScoring";

export {
  CAMP_SCOUT_MAX_AREA_SQUARE_MILES,
  CAMP_SCOUT_MAX_ESTIMATED_CANDIDATES,
  CAMP_SCOUT_MIN_AREA_SQUARE_MILES,
  CAMP_SCOUT_MIN_POLYGON_POINTS,
  canScanCampScoutArea,
  computeCampScoutPolygonAreaSquareMiles,
  validateCampScoutArea,
} from "./campScoutAreaSelection";

export type {
  CampScoutAreaSelectionMode,
  CampScoutAreaValidationOptions,
  CampScoutAreaValidationResult,
  CampScoutAreaValidationStatus,
} from "./campScoutAreaSelection";

export { aggregateCampScoutCandidates } from "./campScoutAggregator";

export type {
  CampScoutAggregationInput,
  CampScoutCandidateSourceInput,
  CommunitySuggestedCampScoutCandidateInput,
  EcsInferredCampScoutCandidateInput,
  ImportedRouteCampScoutCandidateInput,
  OfficialMappedCampScoutCandidateInput,
} from "./campScoutAggregator";

export { getCommunityCampCandidatesForArea } from "./campScoutCommunityAdapter";

export type {
  CampScoutCommunityCandidateAdapter,
  CampScoutCommunityCandidateFilters,
  CampScoutCommunityCandidateRecord,
} from "./campScoutCommunityAdapter";

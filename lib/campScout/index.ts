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
  CAMP_SCOUT_MAX_VIABLE_SLOPE_ESTIMATE,
  CAMP_SCOUT_MIN_ACCESS_CONFIDENCE,
  CAMP_SCOUT_MIN_DISPLAY_SCORE,
  CAMP_SCOUT_MIN_LEGALITY_CONFIDENCE,
  CAMP_SCOUT_MIN_REMOTENESS_SCORE,
  CAMP_SCOUT_MIN_TERRAIN_CONFIDENCE,
  getCampScoutConfidenceGrade,
  isCampScoutHardExcluded,
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

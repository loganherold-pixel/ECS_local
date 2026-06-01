import type { CampsiteCandidate } from '../campsiteCandidateEngine';
import type { ExpeditionForecast } from '../expeditionForecastEngine';
import type { RemotenessIndexOutput } from '../remotenessTypes';
import type { RouteIntelligence } from '../routeAnalysisEngine';
import type { TerrainIntelligence } from '../terrainAnalysisEngine';
import type { CampsiteRating, CampsiteRatingFactor } from '../campsites/campsiteRatingTypes';

export type CampIntelCategory =
  | 'suggested'
  | 'backup'
  | 'emergency'
  | 'saved'
  | 'established'
  | 'community'
  | 'private'
  | 'group'
  | 'pending'
  | 'review'
  | 'previously_used'
  | 'rejected'
  | 'caution';

export type CampIntelRecommendationClass =
  | 'suggested'
  | 'backup'
  | 'emergency'
  | 'rejected_low_confidence';

export type CampIntelConfidence = 'low' | 'medium' | 'high';
export type CampIntelDarknessAdjustmentState =
  | 'daylight_normal'
  | 'last_light_caution'
  | 'after_dark';

export type CampIntelTone = 'positive' | 'caution' | 'warning' | 'info' | 'neutral';

export type CampIntelSourceType =
  | 'route_candidate'
  | 'inferred'
  | 'saved'
  | 'historical'
  | 'verified'
  | 'fallback'
  | 'debug';

export type CampIntelOfflineStatus = 'online' | 'offline_estimated' | 'unavailable';

export type CampIntelFeedbackCode =
  | 'excellent_camp'
  | 'usable'
  | 'poor'
  | 'inaccessible'
  | 'too_exposed'
  | 'not_legal'
  | 'too_small'
  | 'blocked';

export type CampIntelEvidenceSourceLabel =
  | 'ECS-Inferred'
  | 'User-Supported'
  | 'Field-Confirmed'
  | 'Disputed'
  | 'Avoid / Restricted';

export interface CampIntelEvidenceSummary {
  sourceLabel: CampIntelEvidenceSourceLabel;
  intelConfidence: 'High' | 'Medium' | 'Low';
  latestEvidence: string;
  evidenceTypes: string[];
  access: string;
  restrictionSignal: string;
  landUseConfidence: string;
  usePressure: string;
  concern: string | null;
  photoEvidenceCount: number | null;
  newestPhotoAgeLabel: string | null;
}

export type CampIntelBadgeType =
  | 'vehicle_fit'
  | 'weather'
  | 'slope'
  | 'legal'
  | 'comms'
  | 'arrival'
  | 'resource';

export type CampIntelMissionMode =
  | 'fast_transit_overnight'
  | 'basecamp'
  | 'scenic_stay'
  | 'weather_shelter'
  | 'remote_solitude'
  | 'family_friendly_stop'
  | 'emergency_stop_before_dark';

export type CampIntelLegalityConfidence = 'likely_suitable' | 'uncertain' | 'likely_restricted';

export type CampIntelRouteWeatherSnapshotSource =
  | 'live'
  | 'cache_fresh'
  | 'cache_stale'
  | 'fallback'
  | null;

export type CampIntelDataOrigin =
  | 'live'
  | 'manual'
  | 'fallback'
  | 'offline_estimate'
  | 'unavailable';

export type CampIntelRiskFlagType =
  | 'vehicle'
  | 'weather'
  | 'slope'
  | 'legal'
  | 'comms'
  | 'arrival'
  | 'departure'
  | 'flood'
  | 'resource'
  | 'darkness'
  | 'unknown';

export type CampIntelDimension =
  | 'access'
  | 'campability'
  | 'vehicle_fit'
  | 'safety'
  | 'compliance'
  | 'desirability';

export type CampIntelVehicleStateSource = 'live' | 'profile' | 'manual' | 'derived' | 'unavailable';

export type CampIntelReasonKind = 'positive' | 'caution' | 'unknown';

export type CampIntelScenarioFlag =
  | 'night_arrival'
  | 'bad_weather'
  | 'resource_constrained'
  | 'offline_limited'
  | 'trailer_attached';

export type CampIntelUnknownType =
  | 'terrain_confidence'
  | 'weather_freshness'
  | 'compliance_data'
  | 'vehicle_state'
  | 'route_certainty'
  | 'resource_state'
  | 'site_footprint'
  | 'comms_context';

export type CampIntelViabilityGateStatus =
  | 'viable'
  | 'rejected_terrain'
  | 'rejected_access'
  | 'rejected_vehicle'
  | 'rejected_compliance'
  | 'rejected_safety';

export interface CampIntelCoordinate {
  latitude: number;
  longitude: number;
}

export interface CampIntelMicroBadge {
  id: string;
  type: CampIntelBadgeType;
  label: string;
  tone: CampIntelTone;
}

export interface CampIntelReasonChip {
  id: string;
  label: string;
  tone: CampIntelTone;
}

export interface CampIntelAssessmentRow {
  id: string;
  label: string;
  value: string;
  tone?: CampIntelTone;
}

export interface CampIntelSubAssessment {
  score: number;
  label: string;
  summary: string;
  tone: CampIntelTone;
}

export interface CampIntelWeatherSummary {
  headline: string;
  detail: string;
  lowTempF: number | null;
  windMph: number | null;
  precipLabel: string | null;
}

export interface CampIntelVehicleSummary {
  accessLabel: string;
  clearanceConfidence: string;
  wheelbaseLabel: string;
  trailerLabel: string;
}

export interface CampIntelRiskFlag {
  id: string;
  type?: CampIntelRiskFlagType;
  label: string;
  tone: CampIntelTone;
}

export interface CampIntelScoreBreakdown {
  access: number;
  campability: number;
  vehicleFit: number;
  safety: number;
  compliance: number;
  desirability: number;
}

export interface CampIntelRouteRelationInfo {
  segmentIndex: number | null;
  segmentRange: string | null;
  distanceMilesFromStart: number | null;
  detourDistanceMiles: number | null;
  detourCostScore: number | null;
  finalApproachComplexity: number | null;
  turnaroundViability: number | null;
  routeAmbiguity: number | null;
  darknessPenalty: number | null;
  sourceRouteId: string | null;
  sourceRouteName: string | null;
}

export interface CampIntelMissionContext {
  missionMode: CampIntelMissionMode;
  activeRouteId: string | null;
  activeRouteName: string | null;
  totalRouteDistanceMiles: number | null;
  totalDriveTimeHours: number | null;
  activeLegRemainingMiles: number | null;
  activeLegRemainingHours: number | null;
  isAfterSunset: boolean;
  nearSunset: boolean;
  darknessAdjustmentState: CampIntelDarknessAdjustmentState;
  lastLightFactor: number;
  plannedArrivalHour: number | null;
  degradedWeather: boolean;
  constrainedResources: boolean;
  currentTimeIso: string;
}

export interface CampIntelOnlineContext {
  isOnline: boolean;
  offlineStatus: CampIntelOfflineStatus;
  routeCertainty: number;
  weatherFreshnessMinutes: number | null;
  terrainConfidence: number;
  complianceConfidence: number;
  vehicleStateFreshnessMinutes: number | null;
}

export interface CampIntelVehicleContext {
  vehicleId: string | null;
  label: string | null;
  source: CampIntelVehicleStateSource;
  widthInches: number | null;
  wheelbaseInches: number | null;
  clearanceInches: number | null;
  tireSizeInches: number | null;
  suspensionLiftInches: number | null;
  trailerAttached: boolean;
  rooftopTent: boolean;
  loadoutWeightLbs: number | null;
  peopleCount: number | null;
}

export interface CampIntelResourceContext {
  fuelPercent: number | null;
  fuelRangeMiles: number | null;
  waterPercent: number | null;
  powerPercent: number | null;
  resourceStress: number;
}

export interface CampIntelHiddenGemsSupportSignal {
  scenicSupportScore: number;
  nearbyGemCount: number | null;
  detourSupportMiles: number | null;
  source: 'live' | 'derived' | 'none';
  label: string | null;
}

export interface CampIntelSupportSignals {
  hiddenGems: CampIntelHiddenGemsSupportSignal | null;
}

export interface CampIntelRouteAccessContext {
  routeClass: 'easy' | 'moderate' | 'challenging' | 'difficult';
  trailRoughness: number;
  steepness: number;
  finalApproachComplexity: number;
  waterCrossingRisk: number;
  widthRestrictionRisk: number;
  turnaroundViability: number;
  obstacleDensity: number;
  routeAmbiguity: number;
  darknessPenalty: number;
  detourCostMiles: number | null;
}

export interface CampIntelTerrainContext {
  levelness: number;
  slopeRisk: number;
  usableFootprint: number;
  firmness: number;
  drainage: number;
  floodRisk: number;
  ridgelineExposure: number;
  parkingSpace: number;
  shelter: number;
}

export interface CampIntelVehicleCompatibilityContext {
  widthFit: number;
  clearanceFit: number;
  wheelbaseFit: number;
  trailerFit: number;
  nighttimeArrivalDifficulty: number;
  departureDifficulty: number;
}

export interface CampIntelSafetyContext {
  overnightWindRisk: number;
  precipitationRisk: number;
  visibilityRisk: number;
  remotenessRisk: number;
  bailoutDifficulty: number;
  commsDeadZoneRisk: number;
}

export interface CampIntelComplianceContext {
  landUseConfidence: number;
  privateLandRisk: number;
  protectedAreaRisk: number;
  roadEdgeRestrictionRisk: number;
  legality: CampIntelLegalityConfidence;
}

export interface CampIntelDesirabilityContext {
  privacy: number;
  scenicQuality: number;
  shade: number;
  sunriseExposure: number;
  hiddenGemsBonus: number;
}

export interface CampIntelResourceImplicationContext {
  nearestFuelEstimateMiles: number | null;
  bailoutRoadEstimateMiles: number | null;
  nearestTownEstimateMiles: number | null;
  commsConfidence: number;
  detourDistanceMiles: number | null;
}

export interface CampIntelCandidateEnrichment {
  routeAccess: CampIntelRouteAccessContext;
  terrain: CampIntelTerrainContext;
  vehicleCompatibility: CampIntelVehicleCompatibilityContext;
  safety: CampIntelSafetyContext;
  compliance: CampIntelComplianceContext;
  desirability: CampIntelDesirabilityContext;
  resources: CampIntelResourceImplicationContext;
}

export interface CampIntelCandidatePoint {
  id: string;
  coordinate: CampIntelCoordinate;
  label: string;
  generatedLabel: boolean;
  sourceType: CampIntelSourceType;
  candidate: CampsiteCandidate;
  createdAt: string;
  lastComputedAt: string;
  routeRelation: CampIntelRouteRelationInfo;
  missionContext: CampIntelMissionContext;
  onlineContext: CampIntelOnlineContext;
  vehicleContext: CampIntelVehicleContext;
  resourceContext: CampIntelResourceContext;
}

export interface CampIntelReasonContribution {
  id: string;
  dimension: CampIntelDimension | 'confidence';
  kind: CampIntelReasonKind;
  label: string;
  impact: number;
  tone: CampIntelTone;
}

export interface CampIntelScoreDimensionResult {
  raw: number;
  weighted: number;
  weight: number;
  reasons: CampIntelReasonContribution[];
}

export interface CampIntelConfidenceMetric {
  score: number;
  label: CampIntelConfidence;
}

export interface CampIntelConfidenceBreakdown {
  overallConfidence: number;
  overallLabel: CampIntelConfidence;
  terrainConfidence: CampIntelConfidenceMetric;
  accessConfidence: CampIntelConfidenceMetric;
  complianceConfidence: CampIntelConfidenceMetric;
  weatherConfidence: CampIntelConfidenceMetric;
  vehicleFitConfidence: CampIntelConfidenceMetric;
  routeConfidence: CampIntelConfidenceMetric;
  unresolvedUnknowns: CampIntelUnknownType[];
  summaryNotes: string[];
}

export interface CampIntelViabilityResult {
  isViableCandidate: boolean;
  failedViabilityReasons: string[];
  viabilityGateStatus: CampIntelViabilityGateStatus;
}

export interface CampIntelDimensionScores {
  accessScore: CampIntelScoreDimensionResult;
  campabilityScore: CampIntelScoreDimensionResult;
  vehicleFitScore: CampIntelScoreDimensionResult;
  safetyScore: CampIntelScoreDimensionResult;
  complianceScore: CampIntelScoreDimensionResult;
  desirabilityScore: CampIntelScoreDimensionResult;
  overallScore: number;
  confidenceScore: number;
  arrivalRiskScore: number;
  overnightSuitabilityScore: number;
  departureRiskScore: number;
  overnightStabilityScore: number;
}

export interface CampIntelConfidenceDetail {
  score: number;
  label: CampIntelConfidence;
  breakdown: CampIntelConfidenceBreakdown;
  penalties: CampIntelReasonContribution[];
  unknowns: CampIntelUnknownType[];
  scenarioFlags: CampIntelScenarioFlag[];
}

export interface CampIntelExplanation {
  topPositiveReasons: string[];
  topCautionReasons: string[];
  whySuggested: string[];
  whyNotTopRanked: string[];
}

export interface CampIntelRecommendationSummary {
  quickVerdict: string;
  summaryLine: string;
  reasonChips: CampIntelReasonChip[];
}

export interface CampIntelRankedCandidate {
  point: CampIntelCandidatePoint;
  enrichment: CampIntelCandidateEnrichment;
  scores: CampIntelDimensionScores;
  confidence: CampIntelConfidenceDetail;
  viability: CampIntelViabilityResult;
  arrivalAssessment: CampIntelSubAssessment;
  overnightAssessment: CampIntelSubAssessment;
  departureAssessment: CampIntelSubAssessment;
  riskFlags: CampIntelRiskFlag[];
  explanation: CampIntelExplanation;
  classification: CampIntelRecommendationClass;
  recommendation: CampIntelRecommendationSummary;
  overallRank: number;
}

export interface CampIntelWeights {
  access: number;
  campability: number;
  vehicleFit: number;
  safety: number;
  compliance: number;
  desirability: number;
}

export interface CampIntelWeightProfile {
  base: CampIntelWeights;
  applied: CampIntelWeights;
  scenarioFlags: CampIntelScenarioFlag[];
  darknessAdjustmentState: CampIntelDarknessAdjustmentState;
  darknessAdjustmentFactor: number;
}

export interface CampIntelEngineInput {
  routeIntelligence: RouteIntelligence | null;
  terrainIntelligence: TerrainIntelligence | null;
  expeditionForecast: ExpeditionForecast | null;
  remotenessIndex: RemotenessIndexOutput | null;
  routeWeather: CampIntelRouteWeatherSnapshot | null;
  missionMode?: CampIntelMissionMode | null;
  online?: boolean | null;
  currentTimeIso?: string | null;
  vehicleContext?: CampIntelVehicleContext | null;
  resourceContext?: CampIntelResourceContext | null;
  supportSignals?: CampIntelSupportSignals | null;
}

export interface CampIntelRouteWeatherSnapshot {
  headline: string | null;
  detail: string | null;
  lowTempF: number | null;
  windMph: number | null;
  precipLabel: string | null;
  source: CampIntelRouteWeatherSnapshotSource;
}

export interface CampIntelEngineResult {
  missionMode: CampIntelMissionMode;
  weightProfile: CampIntelWeightProfile;
  rankedCandidates: CampIntelRankedCandidate[];
  viabilityRejected: CampIntelRankedCandidate[];
  suggested: CampIntelRankedCandidate[];
  backups: CampIntelRankedCandidate[];
  emergency: CampIntelRankedCandidate[];
  rejected: CampIntelRankedCandidate[];
  generatedAt: string;
}

export interface CampIntelCompareMetrics {
  arrivalRiskScore: number;
  overnightSuitabilityScore: number;
  departureRiskScore: number;
  confidenceScore: number;
  vehicleFitScore: number;
  windExposureScore: number;
  routeDetourMiles: number | null;
  bailoutDistanceMiles: number | null;
  fuelDistanceMiles: number | null;
  privacyScore: number;
  shelterScore: number;
  complianceCertaintyScore: number;
}

export interface CampIntelComparisonEntry {
  siteId: string;
  label: string;
  quickVerdict: string;
  categoryLabel: string;
  arrivalRiskScore: number;
  overnightSuitabilityScore: number;
  departureRiskScore: number;
  overallScore: number;
  confidenceScore: number;
  vehicleFitScore: number;
  windExposureScore: number;
  routeDetourMiles: number | null;
  bailoutDistanceMiles: number | null;
  fuelDistanceMiles: number | null;
  privacyScore: number;
  shelterScore: number;
  complianceCertaintyScore: number;
}

export interface CampIntelComparisonHighlight {
  id: string;
  siteId: string;
  label: string;
  summary: string;
}

export interface CampIntelComparisonResult {
  comparisonSummary: string[];
  compareHighlights: CampIntelComparisonHighlight[];
  entries: CampIntelComparisonEntry[];
}

export interface CampIntelSite {
  id: string;
  label: string;
  coordinate: CampIntelCoordinate;
  category: CampIntelCategory;
  categoryLabel: string;
  confidence: CampIntelConfidence;
  confidenceLabel: string;
  confidenceScore: number;
  rating: CampsiteRating;
  ratingFactors: CampsiteRatingFactor[];
  overallScore: number;
  scoreBreakdown: CampIntelScoreBreakdown;
  quickVerdict: string;
  explanationReasons: string[];
  whyNotTopRanked: string[];
  riskFlags: CampIntelRiskFlag[];
  reasonChips: CampIntelReasonChip[];
  microBadges: CampIntelMicroBadge[];
  vehicleAssessment: CampIntelAssessmentRow[];
  overnightOutlook: CampIntelAssessmentRow[];
  resourceImplications: CampIntelAssessmentRow[];
  weatherSummary: CampIntelWeatherSummary | null;
  vehicleSummary: CampIntelVehicleSummary | null;
  offlineStatus: CampIntelOfflineStatus;
  offlineAssessment: CampIntelOfflineAssessment | null;
  sourceType: CampIntelSourceType;
  evidenceSummary: CampIntelEvidenceSummary;
  detourDistanceMiles: number | null;
  sourceRouteId: string | null;
  sourceRouteName: string | null;
  segmentLabel: string | null;
  fallbackStage: number;
  criteriaBroadened: boolean;
  credibilityTier: CampsiteCandidate['credibilityTier'];
  isSaved: boolean;
  wasUsedBefore: boolean;
  classification: CampIntelRecommendationClass;
  missionMode: CampIntelMissionMode;
  viabilityGateStatus: CampIntelViabilityGateStatus;
  isViableCandidate: boolean;
  failedViabilityReasons: string[];
  arrivalRiskScore: number;
  overnightSuitabilityScore: number;
  departureRiskScore: number;
  overnightStabilityScore: number;
  arrivalAssessment: CampIntelSubAssessment;
  overnightAssessment: CampIntelSubAssessment;
  departureAssessment: CampIntelSubAssessment;
  darknessAdjustmentState: CampIntelDarknessAdjustmentState;
  confidenceBreakdown: CampIntelConfidenceBreakdown;
  unresolvedUnknowns: CampIntelUnknownType[];
  recommendationSummary: string;
  topPositiveReasons: string[];
  topCautionReasons: string[];
  trustNotes: string[];
  feedback: CampIntelFeedbackCode[];
  compareMetrics: CampIntelCompareMetrics;
}

export interface CampIntelOfflineAssessment {
  title: string;
  notes: string[];
  weatherStale: boolean;
  complianceConfidenceReduced: boolean;
  cachedRouteContext: boolean;
}

export interface CampIntelStructuredSummaryCandidate {
  id: string;
  label: string;
  category: CampIntelCategory;
  categoryLabel: string;
  confidence: CampIntelConfidence;
  confidenceLabel: string;
  quickVerdict: string;
  detourDistanceMiles: number | null;
  segmentLabel: string | null;
  overallScore: number;
}

export interface CampIntelStructuredSummary {
  available: boolean;
  generatedAt: string | null;
  missionMode: CampIntelMissionMode | null;
  viableCount: number;
  suggestedCount: number;
  backupCount: number;
  emergencyCount: number;
  headline: string | null;
  summaryLine: string | null;
  routeGuidance: string[];
  trustNotes: string[];
  offlineAssessment: CampIntelOfflineAssessment | null;
  bestCandidate: CampIntelStructuredSummaryCandidate | null;
  bestShelteredCandidate: CampIntelStructuredSummaryCandidate | null;
  stopBeforeDark: boolean;
  lowConfidenceBeyondTop: boolean;
  criteriaBroadened: boolean;
  broadenedCriteriaNotice: string | null;
}

export interface CampIntelCachedRouteResult {
  routeKey: string;
  routeId: string | null;
  routeName: string | null;
  generatedAt: string;
  missionMode: CampIntelMissionMode;
  sites: CampIntelSite[];
  summary: CampIntelStructuredSummary;
}

export interface CampIntelMarkerPayload {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle: string;
  category: CampIntelCategory;
  confidence: CampIntelConfidence;
  confidenceScore: number;
  rating: CampsiteRating;
  score: number;
  rank?: number;
  rankLabel?: string;
  ratingFactors: CampsiteRatingFactor[];
  selected: boolean;
  badges: {
    label: string;
    tone: CampIntelTone;
  }[];
}

export interface CampIntelPreferenceState {
  savedCampIds: string[];
  usedCampIds: string[];
  rejectedCampIds: string[];
  feedbackByCampId: Record<string, CampIntelFeedbackCode[]>;
}

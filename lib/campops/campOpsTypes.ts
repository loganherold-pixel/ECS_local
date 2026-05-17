import type { CampsiteRating, CampsiteRatingFactor } from '../campsites/campsiteRatingTypes';

export const CAMP_OPS_CONFIDENCE_LEVELS = ['high', 'medium', 'low', 'unknown'] as const;
export type CampOpsConfidence = (typeof CAMP_OPS_CONFIDENCE_LEVELS)[number];

export const CAMP_OPS_DATA_SOURCES = [
  'route_candidate',
  'draw_area_candidate',
  'community',
  'private',
  'group',
  'gpx',
  'offline_dataset',
  'manual',
  'user_saved',
  'inferred',
  'unknown',
] as const;
export type CampOpsDataSource = (typeof CAMP_OPS_DATA_SOURCES)[number];

export const CAMP_OPS_RISK_TOLERANCES = [
  'conservative',
  'balanced',
  'permissive',
  'emergency_only',
] as const;
export type CampOpsRiskTolerance = (typeof CAMP_OPS_RISK_TOLERANCES)[number];

export const CAMP_OPS_OFFLINE_MODES = ['online', 'degraded', 'offline', 'unknown'] as const;
export type CampOpsOfflineMode = (typeof CAMP_OPS_OFFLINE_MODES)[number];

export const CAMP_LEGAL_STATUSES = [
  'allowed',
  'likely_allowed',
  'restricted',
  'prohibited',
  'unknown',
] as const;
export type CampLegalStatus = (typeof CAMP_LEGAL_STATUSES)[number];

export const CAMP_ACCESS_DIFFICULTIES = [
  'easy',
  'moderate',
  'high_clearance',
  'technical',
  'unknown',
] as const;
export type CampAccessDifficulty = (typeof CAMP_ACCESS_DIFFICULTIES)[number];

export const CAMP_ACCESS_RESTRICTION_STATUSES = [
  'open',
  'permit_required',
  'seasonal',
  'restricted',
  'closed',
  'unknown',
] as const;
export type CampAccessRestrictionStatus = (typeof CAMP_ACCESS_RESTRICTION_STATUSES)[number];

export const CAMP_PUBLIC_ACCESS_STATUSES = [
  'public',
  'private',
  'permission_required',
  'unknown',
] as const;
export type CampPublicAccessStatus = (typeof CAMP_PUBLIC_ACCESS_STATUSES)[number];

export const CAMP_FIT_STATUSES = ['fit', 'limited', 'not_fit', 'unknown'] as const;
export type CampFitStatus = (typeof CAMP_FIT_STATUSES)[number];

export const CAMP_IMPACT_LEVELS = ['positive', 'neutral', 'watch', 'caution', 'critical', 'unknown'] as const;
export type CampImpactLevel = (typeof CAMP_IMPACT_LEVELS)[number];

export const CAMP_FIRE_RESTRICTION_STATUSES = [
  'none_known',
  'restrictions_possible',
  'restricted',
  'fire_ban',
  'unknown',
] as const;
export type CampFireRestrictionStatus = (typeof CAMP_FIRE_RESTRICTION_STATUSES)[number];

export const CAMP_FIRE_USE_DECISIONS = ['yes', 'no', 'restricted', 'unknown'] as const;
export type CampFireUseDecision = (typeof CAMP_FIRE_USE_DECISIONS)[number];

export const CAMP_OPS_RISK_LEVELS = ['high', 'medium', 'low', 'unknown'] as const;
export type CampOpsRiskLevel = (typeof CAMP_OPS_RISK_LEVELS)[number];

export const CAMP_OPS_WEATHER_EXPOSURE_LEVELS = ['low', 'medium', 'high', 'unknown'] as const;
export type CampOpsWeatherExposureLevel = (typeof CAMP_OPS_WEATHER_EXPOSURE_LEVELS)[number];

export const CAMP_OPS_SERVICE_TYPES = [
  'fuel',
  'potable_water',
  'propane',
  'dump_station',
  'shower',
  'laundry',
  'mechanic_repair',
  'tire_service',
  'grocery_food',
  'developed_campground',
  'town_exit',
] as const;
export type CampOpsServiceType = (typeof CAMP_OPS_SERVICE_TYPES)[number];

export const CAMP_OPS_SERVICE_STATUSES = ['open', 'closed', 'unknown'] as const;
export type CampOpsServiceStatus = (typeof CAMP_OPS_SERVICE_STATUSES)[number];

export const CAMP_OPS_SERVICE_FRESHNESS_STATES = ['fresh', 'stale', 'missing', 'unknown'] as const;
export type CampOpsServiceFreshness = (typeof CAMP_OPS_SERVICE_FRESHNESS_STATES)[number];

export const CAMP_LIKELIHOOD_LEVELS = ['low', 'moderate', 'high', 'unknown'] as const;
export type CampLikelihoodLevel = (typeof CAMP_LIKELIHOOD_LEVELS)[number];

export const CAMP_RESOURCE_DEBT_STATUSES = ['safe', 'tight', 'critical', 'after_dark', 'unknown'] as const;
export type CampResourceDebtStatus = (typeof CAMP_RESOURCE_DEBT_STATUSES)[number];

export const CAMP_RESOURCE_DEBT_CATEGORIES = [
  'fuel',
  'water',
  'daylight',
  'trailDifficulty',
  'recovery',
  'weatherExposure',
  'campUncertainty',
  'convoyFatigue',
] as const;
export type CampResourceDebtCategory = (typeof CAMP_RESOURCE_DEBT_CATEGORIES)[number];

export const CAMP_HARD_GATE_STATES = ['allowed', 'rejected', 'caution', 'unknown'] as const;
export type CampHardGateState = (typeof CAMP_HARD_GATE_STATES)[number];

export const CAMP_GATE_SEVERITIES = ['info', 'watch', 'caution', 'critical', 'unknown'] as const;
export type CampGateSeverity = (typeof CAMP_GATE_SEVERITIES)[number];

export const CAMP_OPERATIONAL_ROLES = [
  'primary',
  'backup',
  'emergency',
  'weather_fallback',
  'resupply',
  'recovery',
  'trailer_safe',
  'family_safe',
  'unknown',
] as const;
export type CampOperationalRole = (typeof CAMP_OPERATIONAL_ROLES)[number];

export const CAMP_OPS_SCORE_KEYS = [
  'overall',
  'legal',
  'access',
  'time',
  'resources',
  'terrain',
  'weather',
  'groupFit',
  'trailerFit',
  'lateArrival',
  'privacy',
  'dataConfidence',
] as const;
export type CampOpsScoreKey = (typeof CAMP_OPS_SCORE_KEYS)[number];

export type CampOpsGeoPoint = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  label?: string | null;
};

export type CampOpsDataPoint<T> = {
  value: T | null;
  source: CampOpsDataSource;
  confidence: CampOpsConfidence;
  updatedAt?: string | null;
  isStale?: boolean;
  staleAfterMinutes?: number | null;
  notes?: string | null;
};

export type CampDesiredArrivalWindow = {
  startIso?: string | null;
  endIso?: string | null;
  latestAcceptableIso?: string | null;
  source?: CampOpsDataSource;
};

export type CampDaylightInfo = {
  sunsetIso?: string | null;
  civilTwilightEndIso?: string | null;
  daylightRemainingMinutes?: number | null;
  source?: CampOpsDataSource;
  confidence?: CampOpsConfidence;
};

export type CampOpsVehicleProfile = {
  vehicleId?: string | null;
  label?: string | null;
  vehicleType?: string | null;
  widthInches?: number | null;
  wheelbaseInches?: number | null;
  clearanceInches?: number | null;
  tireSizeInches?: number | null;
  suspensionLiftInches?: number | null;
  trailerAttached?: boolean | null;
  rooftopTent?: boolean | null;
  operatingWeightLbs?: number | null;
  payloadRemainingLbs?: number | null;
  source?: CampOpsDataSource;
  confidence?: CampOpsConfidence;
};

export type CampOpsConvoyResourceVehicle = {
  vehicleId?: string | null;
  label?: string | null;
  fuelReserveMiles?: number | null;
  fuelPercent?: number | null;
  fuelRangeMiles?: number | null;
  waterGallons?: number | null;
  waterPercent?: number | null;
  confidence?: CampOpsConfidence;
};

export type CampOpsConvoyProfile = {
  groupId?: string | null;
  groupLabel?: string | null;
  vehicleCount?: number | null;
  peopleCount?: number | null;
  petCount?: number | null;
  kidCount?: number | null;
  kidsPresent?: boolean | null;
  trailerCount?: number | null;
  trailerPresent?: boolean | null;
  delayedMemberCount?: number | null;
  leastCapableVehicleProfile?: CampOpsVehicleProfile | null;
  lowestFuelReserveVehicle?: CampOpsConvoyResourceVehicle | null;
  lowestWaterReserveVehicle?: CampOpsConvoyResourceVehicle | null;
  mechanicalIssueFlag?: boolean | null;
  medicalOrAccessibilityConstraint?: boolean | null;
  preferredRiskTolerance?: CampOpsRiskTolerance | null;
  source?: CampOpsDataSource;
  confidence?: CampOpsConfidence;
};

export type CampOpsResourceState = {
  fuelPercent?: number | null;
  fuelRangeMiles?: number | null;
  fuelReserveMiles?: number | null;
  waterGallons?: number | null;
  waterPercent?: number | null;
  waterEnduranceDays?: number | null;
  powerPercent?: number | null;
  propanePercent?: number | null;
  dumpNeeded?: boolean | null;
  showerNeeded?: boolean | null;
  laundryNeeded?: boolean | null;
  serviceNeeded?: boolean | null;
  source?: CampOpsDataSource;
  confidence?: CampOpsConfidence;
};

export type CampOpsUserCampPreferences = {
  preferredCampTypes?: string[];
  avoidCampTypes?: string[];
  privacyPreferred?: boolean | null;
  petFriendlyRequired?: boolean | null;
  kidFriendlyRequired?: boolean | null;
  trailerFriendlyRequired?: boolean | null;
  maxDetourMiles?: number | null;
  minPrivacyLikelihood?: CampLikelihoodLevel | null;
  requireLegalConfidence?: CampOpsConfidence | null;
  notes?: string | null;
};

export type CampOpsRouteProgress = {
  progressPercent?: number | null;
  routeMileMarker?: number | null;
  distanceRemainingMiles?: number | null;
  driveTimeRemainingMinutes?: number | null;
  currentSegmentLabel?: string | null;
  nextDecisionLocation?: CampOpsGeoPoint | null;
  latestTurnoffLocation?: CampOpsGeoPoint | null;
  latestTurnoffMileMarker?: number | null;
  latestTurnoffLabel?: string | null;
  latestTurnoffDistanceMiles?: number | null;
  lastTrailerTurnaroundLocation?: CampOpsGeoPoint | null;
  lastTrailerTurnaroundMileMarker?: number | null;
  lastTrailerTurnaroundLabel?: string | null;
  lastTrailerTurnaroundDistanceMiles?: number | null;
  nextResupplyLocation?: CampOpsGeoPoint | null;
  nextResupplyMileMarker?: number | null;
  nextResupplyLabel?: string | null;
  nextResupplyDistanceMiles?: number | null;
  nextLegalBoundaryLocation?: CampOpsGeoPoint | null;
  nextLegalBoundaryMileMarker?: number | null;
  nextLegalBoundaryLabel?: string | null;
  nextLegalBoundaryDistanceMiles?: number | null;
  offRoute?: boolean | null;
  source?: CampOpsDataSource;
  confidence?: CampOpsConfidence;
};

export type CampSearchContext = {
  id: string;
  currentLocation?: CampOpsDataPoint<CampOpsGeoPoint>;
  routeId?: string | null;
  tripId?: string | null;
  plannedCampId?: string | null;
  currentTimeIso: string;
  desiredArrivalWindow?: CampDesiredArrivalWindow | null;
  daylightInfo?: CampDaylightInfo | null;
  vehicleProfile?: CampOpsVehicleProfile | null;
  convoyProfile?: CampOpsConvoyProfile | null;
  resourceState?: CampOpsResourceState | null;
  userCampPreferences?: CampOpsUserCampPreferences | null;
  riskTolerance: CampOpsRiskTolerance;
  offlineMode: CampOpsOfflineMode;
  delayEstimateMinutes?: number | null;
  routeProgress?: CampOpsRouteProgress | null;
};

export type CampCandidate = {
  id: string;
  name: string;
  location: CampOpsGeoPoint;
  source: CampOpsDataSource;
  sourceConfidence: CampOpsConfidence;
  lastVerifiedDate?: string | null;
  poiType?: string | null;
  category?: string | null;
  description?: string | null;
  rating?: CampsiteRating | string | null;
  score?: number | null;
  tags?: string[];
  amenities?: Record<string, unknown> | null;
  conditions?: Record<string, unknown> | null;
  accessDifficulty?: CampAccessDifficulty | string | null;
  legalConfidence?: CampOpsConfidence | string | null;
  visibility?: string | null;
  ratingFactors?: CampsiteRatingFactor[];
  existingRef?: {
    system: 'campsite_candidate' | 'camp_site' | 'camp_site_report' | 'group_share' | 'offline_marker' | 'unknown';
    id: string;
  } | null;
};

export type CampCandidateEnrichment = {
  candidateId: string;
  legalStatus: CampLegalStatus;
  legalConfidence: CampOpsConfidence;
  closureStatus?: CampAccessRestrictionStatus | null;
  closureReason?: string | null;
  restrictionWindow?: CampOpsRestrictionWindow | null;
  closureAppliesToCamping?: boolean | null;
  closureAppliesToVehicleAccess?: boolean | null;
  closureAppliesToFires?: boolean | null;
  publicAccessStatus?: CampPublicAccessStatus | null;
  accessDifficulty: CampAccessDifficulty;
  vehicleFit: CampFitStatus;
  trailerSuitability: CampFitStatus;
  turnaroundSuitability?: CampFitStatus | null;
  trailerTurnaroundConfidence?: CampOpsConfidence | null;
  deadEndRisk?: CampOpsRiskLevel | null;
  backingRequired?: boolean | null;
  roadWidthConfidence?: CampOpsConfidence | null;
  groupCapacityEstimate?: number | null;
  groupCapacityConfidence?: CampOpsConfidence | null;
  etaIso?: string | null;
  etaMinutesFromNow?: number | null;
  sunsetMarginMinutes?: number | null;
  routeDistanceToCampMiles?: number | null;
  straightLineDistanceToCampMiles?: number | null;
  nextDayRouteMiles?: number | null;
  fuelImpact?: CampOpsImpact;
  waterImpact?: CampOpsImpact;
  terrainSlopeEstimate?: CampOpsEstimate;
  weatherExposure: CampImpactLevel;
  weatherExposureLevel?: CampOpsWeatherExposureLevel | null;
  forecastTimeWindow?: CampOpsForecastTimeWindow | null;
  windSpeedMph?: number | null;
  windGustMph?: number | null;
  windDirection?: string | null;
  precipitationRisk?: CampOpsRiskLevel | null;
  stormRisk?: CampOpsRiskLevel | null;
  temperatureLowF?: number | null;
  temperatureHighF?: number | null;
  heatRisk?: CampOpsRiskLevel | null;
  coldRisk?: CampOpsRiskLevel | null;
  fireRestrictionStatus: CampFireRestrictionStatus;
  campfireAllowed?: CampFireUseDecision | null;
  stoveAllowed?: CampFireUseDecision | null;
  fireRestrictionLevel?: string | null;
  redFlagRisk?: CampOpsRiskLevel | null;
  smokeOrAirQualityRisk?: CampOpsRiskLevel | null;
  reliableWaterRefillAvailable?: boolean | null;
  fireRestrictionConflict?: boolean | null;
  emergencyRestrictionConflict?: boolean | null;
  recoveryFriendly?: boolean | null;
  exitDistanceMiles?: number | null;
  serviceDistanceMiles?: number | null;
  nearestFuel?: CampOpsServiceAvailability | null;
  nearestWater?: CampOpsServiceAvailability | null;
  nearestPropane?: CampOpsServiceAvailability | null;
  nearestDump?: CampOpsServiceAvailability | null;
  nearestRepair?: CampOpsServiceAvailability | null;
  nearestTownOrExit?: CampOpsServiceAvailability | null;
  privacyLikelihood: CampLikelihoodLevel;
  occupancyLikelihood: CampLikelihoodLevel;
  lateArrivalRisk: CampImpactLevel;
  dataConfidence: CampOpsConfidence;
  dataLimitations?: string[];
  sourceSignals?: CampOpsSourceSignalSummary[];
  sourceResolutions?: CampOpsSourceResolutionSummary[];
  resourceDebt?: CampResourceDebt;
};

export type CampOpsRestrictionWindow = {
  startIso?: string | null;
  endIso?: string | null;
  label?: string | null;
};

export type CampOpsForecastTimeWindow = {
  startIso?: string | null;
  endIso?: string | null;
  label?: string | null;
};

export type CampOpsServiceOperatingHours = {
  summary?: string | null;
  isCurrentlyOpen?: boolean | null;
};

export type CampOpsServiceAvailability = {
  serviceType: CampOpsServiceType;
  name: string;
  location?: CampOpsGeoPoint | null;
  distanceFromCampMiles?: number | null;
  distanceFromRouteMiles?: number | null;
  routeAwareDistanceMiles?: number | null;
  confidence: CampOpsConfidence;
  freshness?: CampOpsServiceFreshness;
  observedAtIso?: string | null;
  operatingHours?: CampOpsServiceOperatingHours | null;
  status?: CampOpsServiceStatus;
  sourceSummary?: string | null;
};

export type CampOpsSourceSignalSummary = {
  source: CampOpsDataSource;
  confidence: CampOpsConfidence;
  observedAtIso?: string | null;
  isStale?: boolean;
  cachedAt?: string | null;
  expiresAt?: string | null;
  sourceGeneratedAt?: string | null;
  retrievedAt?: string | null;
  freshnessStatus?: CampOpsCacheFreshnessStatus;
  offlineAvailable?: boolean | null;
  fields: string[];
  limitation?: string | null;
};

export type CampOpsCacheFreshnessStatus = 'fresh' | 'stale' | 'expired' | 'unknown';

export type CampOpsSourceCacheMetadata = {
  cachedAt?: string | null;
  expiresAt?: string | null;
  sourceGeneratedAt?: string | null;
  retrievedAt?: string | null;
  freshnessStatus?: CampOpsCacheFreshnessStatus;
  offlineAvailable?: boolean | null;
};

export type CampOpsSourceResolutionSummary = {
  field: string;
  resolvedValue: unknown;
  resolvedConfidence: CampOpsConfidence;
  conflictDetected: boolean;
  conflictSummary: string | null;
  sourceSummaries: string[];
  staleSources: string[];
  missingSources: string[];
};

export type CampOpsImpact = {
  value: number | null;
  unit: 'percent' | 'miles' | 'gallons' | 'minutes' | 'score' | 'unknown';
  impact: CampImpactLevel;
  confidence: CampOpsConfidence;
};

export type CampOpsEstimate = {
  value: number | null;
  unit: 'degrees' | 'percent_grade' | 'score' | 'unknown';
  confidence: CampOpsConfidence;
  source: CampOpsDataSource;
};

export type CampResourceDebtItem = {
  category: CampResourceDebtCategory;
  status: CampResourceDebtStatus;
  value: number | null;
  unit: 'miles' | 'gallons' | 'minutes' | 'score' | 'unknown';
  reason: string;
  missingDataFields: string[];
  confidence: CampOpsConfidence;
};

export type CampResourceMarginStatus = 'comfortable' | 'tight' | 'critical' | 'unknown';

export type CampResourceMargin = {
  value: number | null;
  unit: 'miles' | 'gallons' | 'unknown';
  status: CampResourceMarginStatus;
  confidence: CampOpsConfidence;
  basis: 'route_aware' | 'straight_line' | 'provided_margin' | 'configured_default' | 'unknown';
  reason: string;
  missingDataFields: string[];
};

export type CampResourceMarginSummary = {
  fuelToCamp: CampResourceMargin;
  fuelAfterCamp: CampResourceMargin;
  fuelToNextKnownFuel: CampResourceMargin;
  fuelExitMargin: CampResourceMargin;
  waterToCamp: CampResourceMargin;
  waterAfterCamp: CampResourceMargin;
  waterNextDayMargin: CampResourceMargin;
  serviceConfidence: CampOpsConfidence;
  assumptions: string[];
};

export type CampResourceDebt = {
  fuel: CampResourceDebtItem;
  water: CampResourceDebtItem;
  daylight: CampResourceDebtItem;
  campUncertainty: CampResourceDebtItem;
  margins?: CampResourceMarginSummary;
  trailDifficulty?: CampResourceDebtItem;
  recovery?: CampResourceDebtItem;
  weatherExposure?: CampResourceDebtItem;
  convoyFatigue?: CampResourceDebtItem;
};

export type CampHardGateResult = {
  state: CampHardGateState;
  gateId: string;
  severity: CampGateSeverity;
  reason: string;
  missingDataFields: string[];
};

export type CampSuitabilityScores = Record<CampOpsScoreKey, number | null>;

export type CampRejectedCandidate = {
  candidate: CampCandidate;
  gates: CampHardGateResult[];
  reasons: string[];
};

export type CampRecommendationExplanations = {
  whyRecommended?: string | null;
  whyBackup?: string | null;
  whyEmergency?: string | null;
  whyWeatherFallback?: string | null;
  whyResupply?: string | null;
  whyTrailerSafe?: string | null;
  plannedCampDowngrade?: string | null;
  keyTradeoffs: string[];
};

export type CampOpsDecisionPointKind =
  | 'technical_section'
  | 'trailer_turnaround'
  | 'resupply'
  | 'before_dark'
  | 'legal_boundary'
  | 'unknown';

export type CampOpsDecisionOption = {
  campId?: string | null;
  label: string;
  etaIso?: string | null;
  summary: string;
};

export type CampOpsDecisionPoint = {
  kind: CampOpsDecisionPointKind;
  location?: CampOpsGeoPoint | null;
  routeMileMarker?: number | null;
  decisionDeadlineIso: string | null;
  reason: string;
  recommendedAction: string;
  continueOption: CampOpsDecisionOption | null;
  divertOption: CampOpsDecisionOption | null;
  riskIfContinues: string;
  latestRecommendedTurnoff: {
    label?: string | null;
    location?: CampOpsGeoPoint | null;
    routeMileMarker?: number | null;
    distanceMiles?: number | null;
  } | null;
  confidence: CampOpsConfidence;
};

export type CampRecommendationSet = {
  recommendedCamp: CampCandidate | null;
  backupCamp: CampCandidate | null;
  emergencyCamp: CampCandidate | null;
  weatherFallbackCamp?: CampCandidate | null;
  resupplyCamp?: CampCandidate | null;
  trailerSafeCamp?: CampCandidate | null;
  rankedCandidates?: CampCandidate[];
  rejectedCandidates: CampRejectedCandidate[];
  warnings: string[];
  assumptions: string[];
  confidenceSummary: {
    level: CampOpsConfidence;
    score: number | null;
    reasons: string[];
    missingDataFields: string[];
  };
  rolesByCandidateId?: Record<string, CampOperationalRole[]>;
  scoresByCandidateId?: Record<string, CampSuitabilityScores>;
  enrichmentsByCandidateId?: Record<string, CampCandidateEnrichment>;
  explanations?: CampRecommendationExplanations;
  decisionPoint?: CampOpsDecisionPoint | null;
};

export const EMPTY_CAMP_SUITABILITY_SCORES: CampSuitabilityScores = {
  overall: null,
  legal: null,
  access: null,
  time: null,
  resources: null,
  terrain: null,
  weather: null,
  groupFit: null,
  trailerFit: null,
  lateArrival: null,
  privacy: null,
  dataConfidence: null,
};

export function normalizeCampOpsScore(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

export function isCampHardGateBlocking(gate: CampHardGateResult): boolean {
  return gate.state === 'rejected' || gate.severity === 'critical';
}

export function createEmptyCampRecommendationSet(
  confidence: CampOpsConfidence = 'unknown',
): CampRecommendationSet {
  return {
    recommendedCamp: null,
    backupCamp: null,
    emergencyCamp: null,
    weatherFallbackCamp: null,
    resupplyCamp: null,
    trailerSafeCamp: null,
    rankedCandidates: [],
    rejectedCandidates: [],
    warnings: [],
    assumptions: [],
    confidenceSummary: {
      level: confidence,
      score: null,
      reasons: [],
      missingDataFields: [],
    },
    rolesByCandidateId: {},
    scoresByCandidateId: {},
    enrichmentsByCandidateId: {},
    explanations: {
      whyRecommended: null,
      whyBackup: null,
      whyEmergency: null,
      whyWeatherFallback: null,
      whyResupply: null,
      whyTrailerSafe: null,
      plannedCampDowngrade: null,
      keyTradeoffs: [],
    },
    decisionPoint: null,
  };
}

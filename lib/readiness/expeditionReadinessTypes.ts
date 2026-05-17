import type {
  ExpeditionReadinessPreferences,
  ExpeditionReadinessPreferenceEffect,
} from './expeditionReadinessPreferences';

export const EXPEDITION_READINESS_STATUSES = ['ready', 'caution', 'hold'] as const;
export type ExpeditionReadinessStatus = (typeof EXPEDITION_READINESS_STATUSES)[number];

export const EXPEDITION_READINESS_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type ExpeditionReadinessConfidence = (typeof EXPEDITION_READINESS_CONFIDENCE_LEVELS)[number];

export const EXPEDITION_READINESS_PROFILES = [
  'dayTrip',
  'overnight',
  'weekendExpedition',
  'remoteExpedition',
  'recoveryUtilityRoute',
  'unknown',
] as const;
export type ExpeditionReadinessProfile = (typeof EXPEDITION_READINESS_PROFILES)[number];

export const EXPEDITION_TRIP_INTENTS = [
  'unknown',
  'dayTrip',
  'overnightCamp',
  'weekendExpedition',
  'remoteExpedition',
  'recoveryUtilityRoute',
] as const;
export type ExpeditionTripIntent = (typeof EXPEDITION_TRIP_INTENTS)[number];
export type ExpeditionTripIntentSource = 'selected' | 'ecs_inferred' | 'unknown';

export const EXPEDITION_READINESS_SOURCE_KINDS = [
  'live',
  'cached',
  'manual',
  'mock',
  'demo',
  'inferred',
  'missing',
  'unknown',
] as const;
export type ExpeditionReadinessSourceKind = (typeof EXPEDITION_READINESS_SOURCE_KINDS)[number];

export const EXPEDITION_READINESS_FRESHNESS_STATES = [
  'fresh',
  'stale',
  'missing',
  'manual',
  'mock',
  'demo',
  'inferred',
  'unknown',
] as const;
export type ExpeditionReadinessFreshnessState = (typeof EXPEDITION_READINESS_FRESHNESS_STATES)[number];

export const EXPEDITION_READINESS_CATEGORY_IDS = [
  'vehicle_fit',
  'route_risk',
  'camp_legality_confidence',
  'weather_window',
  'daylight_margin',
  'offline_preparedness',
  'fuel_range_margin',
  'power_runtime',
  'recovery_bailout_access',
  'communications_signal_confidence',
] as const;
export type ExpeditionReadinessCategoryId = (typeof EXPEDITION_READINESS_CATEGORY_IDS)[number];

export type ExpeditionReadinessFreshnessRecord = {
  state: ExpeditionReadinessFreshnessState;
  source: ExpeditionReadinessSourceKind;
  updatedAt: string | null;
  label: string;
  isStale: boolean;
  isMissing: boolean;
  isMock: boolean;
  isDemo: boolean;
  isInferred: boolean;
  detail?: string | null;
};

export type ExpeditionReadinessSourceFreshness = {
  route: ExpeditionReadinessFreshnessRecord;
  weather: ExpeditionReadinessFreshnessRecord;
  fleet: ExpeditionReadinessFreshnessRecord;
  offline: ExpeditionReadinessFreshnessRecord;
  camp: ExpeditionReadinessFreshnessRecord;
  power: ExpeditionReadinessFreshnessRecord;
  fuel: ExpeditionReadinessFreshnessRecord;
  recovery: ExpeditionReadinessFreshnessRecord;
  communications: ExpeditionReadinessFreshnessRecord;
  daylight: ExpeditionReadinessFreshnessRecord;
  telemetry: ExpeditionReadinessFreshnessRecord;
  currentLocation: ExpeditionReadinessFreshnessRecord;
};

export type ExpeditionReadinessThresholds = {
  ready: number;
  caution: number;
};

export type ExpeditionReadinessCalibration = {
  profile: ExpeditionReadinessProfile;
  label: string;
  weights: Record<ExpeditionReadinessCategoryId, number>;
  thresholds: ExpeditionReadinessThresholds;
  criticalFreshnessSources: (keyof ExpeditionReadinessSourceFreshness)[];
  notes: string[];
};

export type ExpeditionReadinessDataPoint<T> = {
  value: T | null;
  source?: ExpeditionReadinessSourceKind;
  updatedAt?: string | null;
  confidence?: ExpeditionReadinessConfidence;
  isStale?: boolean;
  staleAfterMinutes?: number | null;
  isMock?: boolean;
  isDemo?: boolean;
  isInferred?: boolean;
  label?: string | null;
  notes?: string | null;
};

export type ExpeditionReadinessFactorImpact = 'positive' | 'neutral' | 'warning' | 'blocker' | 'missing';

export type ExpeditionReadinessFactor = {
  id: string;
  label: string;
  impact: ExpeditionReadinessFactorImpact;
  detail: string;
  source: ExpeditionReadinessSourceKind;
  confidence: ExpeditionReadinessConfidence;
  updatedAt?: string | null;
  isStale?: boolean;
  isMock?: boolean;
  isDemo?: boolean;
  isInferred?: boolean;
};

export type ExpeditionReadinessIssue = {
  id: string;
  categoryId: ExpeditionReadinessCategoryId;
  label: string;
  detail: string;
  severity: 'warning' | 'blocker';
};

export type ExpeditionReadinessCategory = {
  id: ExpeditionReadinessCategoryId;
  label: string;
  score: number;
  status: ExpeditionReadinessStatus;
  confidence: ExpeditionReadinessConfidence;
  summary: string;
  factors: ExpeditionReadinessFactor[];
  missingInputs: string[];
  lastUpdatedAt: string;
};

export type ExpeditionReadinessDataIntegrity = {
  usesMockData: boolean;
  usesDemoData: boolean;
  usesInferredData: boolean;
  unmarkedSyntheticData: string[];
};

export type ExpeditionDepartureAuditItemStatus = 'complete' | 'caution' | 'missing' | 'unavailable';

export type ExpeditionDepartureAuditItem = {
  itemId: string;
  label: string;
  status: ExpeditionDepartureAuditItemStatus;
  summary: string;
  actionLabel?: string | null;
  actionTarget?: string | null;
};

export type ExpeditionRecoveryDifficulty = 'low' | 'moderate' | 'high' | 'unknown';

export type ExpeditionRouteRemoteness = 'low' | 'moderate' | 'high' | 'unknown';

export type ExpeditionRecoveryBrief = {
  nearestBailoutSummary: string;
  recoveryDifficulty: ExpeditionRecoveryDifficulty;
  communicationsSummary: string;
  emergencyCoordinatePacketStatus: ExpeditionDepartureAuditItemStatus;
  emergencyCoordinatePacketSummary: string;
  recommendedPrep: string[];
  currentCoordinates: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
  } | null;
  activeRouteLabel: string | null;
  officialContactSummary: string;
  isECSInferred: boolean;
  confidence: ExpeditionReadinessConfidence;
};

export type ExpeditionPowerDataFreshness = 'live' | 'aging' | 'stale' | 'offline' | 'unknown';

export type ExpeditionPowerRuntimeSource = 'provider' | 'derived' | 'manual' | 'unavailable';

export type ExpeditionPowerBrief = {
  status: 'ready' | 'caution' | 'unknown';
  statusLabel: string;
  runtimeSummary: string;
  sourceSummary: string;
  freshnessSummary: string;
  recommendation: string;
  connectedSourceAvailable: boolean;
  powerRelevantForTrip: boolean;
  isStale: boolean;
};

export type ExpeditionReadinessAssessment = {
  tripIntent: ExpeditionTripIntent;
  tripIntentSource: ExpeditionTripIntentSource;
  readinessProfile: ExpeditionReadinessProfile;
  calibration: ExpeditionReadinessCalibration;
  readinessPreferences: ExpeditionReadinessPreferences;
  preferenceEffects: ExpeditionReadinessPreferenceEffect[];
  overallScore: number;
  status: ExpeditionReadinessStatus;
  confidence: ExpeditionReadinessConfidence;
  updatedAt: string;
  sourceFreshness: ExpeditionReadinessSourceFreshness;
  categories: ExpeditionReadinessCategory[];
  blockers: ExpeditionReadinessIssue[];
  warnings: ExpeditionReadinessIssue[];
  recommendations: string[];
  departureAudit: ExpeditionDepartureAuditItem[];
  recoveryBrief: ExpeditionRecoveryBrief;
  powerBrief: ExpeditionPowerBrief;
  explanation: string;
  dataIntegrity: ExpeditionReadinessDataIntegrity;
};

export type ExpeditionReadinessRouteInput = {
  routeId?: string | null;
  name?: string | null;
  distanceMiles?: number | null;
  difficulty?: 'easy' | 'moderate' | 'hard' | 'technical' | 'unknown' | null;
  riskLevel?: 'low' | 'moderate' | 'high' | 'critical' | 'unknown' | null;
  routeConfidence?: ExpeditionReadinessConfidence | null;
  knownHazards?: string[] | null;
  closureKnown?: boolean | null;
  passabilityConfidence?: ExpeditionReadinessConfidence | null;
  source?: ExpeditionReadinessSourceKind;
  updatedAt?: string | null;
  isStale?: boolean;
  isMock?: boolean;
  isDemo?: boolean;
  isInferred?: boolean;
};

export type ExpeditionReadinessVehicleInput = {
  vehicleId?: string | null;
  label?: string | null;
  vehicleType?: string | null;
  make?: string | null;
  model?: string | null;
  submodel?: string | null;
  classificationLabel?: string | null;
  vehicleClass?: string | null;
  drivetrain?: string | null;
  tireSizeInches?: number | null;
  suspensionLiftInches?: number | null;
  groundClearanceInches?: number | null;
  wheelbaseInches?: number | null;
  operatingWeightLbs?: number | null;
  payloadCapacityLbs?: number | null;
  profileComplete?: boolean | null;
  disabled?: boolean | null;
  gvwrUsagePct?: number | null;
  payloadRemainingLbs?: number | null;
  clearanceConcern?: boolean | null;
  recoveryGearReady?: boolean | null;
  recoveryGearSummary?: string | null;
  fuelCapacityGal?: number | null;
  fuelRangeMiles?: number | null;
  waterCapacityGal?: number | null;
  powerSystemWh?: number | null;
  accessoryLoadoutWeightLbs?: number | null;
  activeLoadoutWeightLbs?: number | null;
  keyStrengths?: string[] | null;
  keyConcerns?: string[] | null;
  missingSpecs?: string[] | null;
  recommendations?: string[] | null;
  vehicleFitConfidence?: ExpeditionReadinessConfidence | null;
  source?: ExpeditionReadinessSourceKind;
  updatedAt?: string | null;
  isStale?: boolean;
  isMock?: boolean;
  isDemo?: boolean;
  isInferred?: boolean;
};

export type ExpeditionReadinessWeatherInput = {
  riskLevel?: 'low' | 'moderate' | 'high' | 'critical' | 'unknown' | null;
  severeAlertActive?: boolean | null;
  precipitationChancePercent?: number | null;
  windMph?: number | null;
  temperatureRisk?: 'low' | 'moderate' | 'high' | 'unknown' | null;
  confidence?: ExpeditionReadinessConfidence | null;
  source?: ExpeditionReadinessSourceKind;
  updatedAt?: string | null;
  isStale?: boolean;
  isMock?: boolean;
  isDemo?: boolean;
  isInferred?: boolean;
};

export type ExpeditionReadinessDaylightInput = {
  minutesRemainingAtArrival?: number | null;
  arrivalAfterDark?: boolean | null;
  sunlightStatus?: 'before_sunrise' | 'daylight' | 'near_sunset' | 'after_sunset' | 'unavailable' | null;
  nextSunEvent?: 'sunrise' | 'sunset' | null;
  sunlightLabel?: string | null;
  sunlightSummary?: string | null;
  confidence?: ExpeditionReadinessConfidence | null;
  source?: ExpeditionReadinessSourceKind;
  updatedAt?: string | null;
  isStale?: boolean;
  isMock?: boolean;
  isDemo?: boolean;
  isInferred?: boolean;
};

export type ExpeditionReadinessOfflineInput = {
  routeDownloaded?: boolean | null;
  routeGeometryCached?: boolean | null;
  mapsDownloaded?: boolean | null;
  mapTilesCachedForRoute?: boolean | null;
  campIntelDownloaded?: boolean | null;
  campCandidatesCached?: boolean | null;
  bailoutPointsCached?: boolean | null;
  weatherSnapshotAvailable?: boolean | null;
  fuelTownRoadReferencesCached?: boolean | null;
  emergencyDocsAvailable?: boolean | null;
  emergencyPacketAvailable?: boolean | null;
  currentRoutePackageFresh?: boolean | null;
  routePackageAgeHours?: number | null;
  cachedTileCount?: number | null;
  cachedRegionCount?: number | null;
  isRemoteRoute?: boolean | null;
  isOnline?: boolean | null;
  packageStatus?: 'ready' | 'partial' | 'missing' | 'unknown' | null;
  source?: ExpeditionReadinessSourceKind;
  updatedAt?: string | null;
  isStale?: boolean;
  isMock?: boolean;
  isDemo?: boolean;
  isInferred?: boolean;
};

export type ExpeditionReadinessCampCandidateInput = {
  candidateId?: string | null;
  id?: string | null;
  label?: 'A' | 'B' | 'C' | 'D' | 'E' | string | null;
  name?: string | null;
  coordinates?: {
    latitude: number;
    longitude: number;
  } | null;
  overallCampScore?: number | null;
  legalAccessConfidence?: ExpeditionReadinessConfidence | 'unknown' | null;
  officialConfirmation?: boolean | null;
  accessStatus?: 'open' | 'permit_required' | 'seasonal' | 'restricted' | 'closed' | 'unknown' | null;
  suitabilityScore?: number | null;
  terrainSuitabilityScore?: number | null;
  vehicleAccessConfidence?: ExpeditionReadinessConfidence | 'unknown' | null;
  remotenessScore?: number | null;
  routeDistance?: number | null;
  weatherExposureSummary?: string | null;
  accessSummary?: string | null;
  whyECSPickedThis?: string | null;
  cautionNotes?: string[] | null;
  sourceConfidence?: ExpeditionReadinessConfidence | 'unknown' | null;
  isECSInferred?: boolean | null;
  bailoutProximityMiles?: number | null;
  bailoutProximitySummary?: string | null;
  source?: ExpeditionReadinessSourceKind;
  updatedAt?: string | null;
  isStale?: boolean;
  isMock?: boolean;
  isDemo?: boolean;
  isInferred?: boolean;
};

export type ExpeditionReadinessFuelInput = {
  rangeRemainingMiles?: number | null;
  routeDistanceRemainingMiles?: number | null;
  reserveMiles?: number | null;
  fuelPercent?: number | null;
  source?: ExpeditionReadinessSourceKind;
  updatedAt?: string | null;
  isStale?: boolean;
  isMock?: boolean;
  isDemo?: boolean;
  isInferred?: boolean;
};

export type ExpeditionReadinessPowerInput = {
  runtimeHoursRemaining?: number | null;
  requiredRuntimeHours?: number | null;
  batteryPercent?: number | null;
  inputWatts?: number | null;
  outputWatts?: number | null;
  solarInputWatts?: number | null;
  connectedSourceAvailable?: boolean | null;
  connectionState?: 'connected' | 'reconnecting' | 'disconnected' | 'unavailable' | 'unknown' | null;
  providerLabel?: string | null;
  deviceLabel?: string | null;
  dataFreshness?: ExpeditionPowerDataFreshness | null;
  runtimeSource?: ExpeditionPowerRuntimeSource | null;
  powerRelevantForTrip?: boolean | null;
  powerNeedReason?: string | null;
  powerRecommendation?: string | null;
  hasManualFallback?: boolean | null;
  source?: ExpeditionReadinessSourceKind;
  updatedAt?: string | null;
  isStale?: boolean;
  isMock?: boolean;
  isDemo?: boolean;
  isInferred?: boolean;
};

export type ExpeditionReadinessRecoveryInput = {
  bailoutRoutesAvailable?: boolean | null;
  nearestExitMiles?: number | null;
  nearestPavedRoadMiles?: number | null;
  nearestKnownRoadMiles?: number | null;
  nearestKnownRoadLabel?: string | null;
  nearestTrailheadMiles?: number | null;
  nearestFuelMiles?: number | null;
  nearestTownMiles?: number | null;
  nearestSignalAreaMiles?: number | null;
  officialContactPointAvailable?: boolean | null;
  officialContactPointSummary?: string | null;
  routeBailoutOptionCount?: number | null;
  lastSafeTurnaroundMiles?: number | null;
  recoveryDifficulty?: ExpeditionRecoveryDifficulty | null;
  currentCoordinatesAvailable?: boolean | null;
  currentLatitude?: number | null;
  currentLongitude?: number | null;
  currentAccuracyMeters?: number | null;
  routeRemoteness?: ExpeditionRouteRemoteness | null;
  emergencyCoordinatePacketReady?: boolean | null;
  emergencyCoordinatePacketSummary?: string | null;
  nearestBailoutSummary?: string | null;
  recommendedPrep?: string[] | null;
  recoveryGearReady?: boolean | null;
  recoveryAccessConfidence?: ExpeditionReadinessConfidence | null;
  source?: ExpeditionReadinessSourceKind;
  updatedAt?: string | null;
  isStale?: boolean;
  isMock?: boolean;
  isDemo?: boolean;
  isInferred?: boolean;
};

export type ExpeditionReadinessCommunicationsInput = {
  signalConfidence?: ExpeditionReadinessConfidence | null;
  satelliteCommsReady?: boolean | null;
  teamCheckInPlanReady?: boolean | null;
  cellularExpected?: boolean | null;
  source?: ExpeditionReadinessSourceKind;
  updatedAt?: string | null;
  isStale?: boolean;
  isMock?: boolean;
  isDemo?: boolean;
  isInferred?: boolean;
};

export type ExpeditionReadinessTelemetryInput = {
  vehicleTelemetryLive?: boolean | null;
  lastKnownUsable?: boolean | null;
  source?: ExpeditionReadinessSourceKind;
  updatedAt?: string | null;
  isStale?: boolean;
  isMock?: boolean;
  isDemo?: boolean;
  isInferred?: boolean;
};

export type ExpeditionReadinessLocationInput = {
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  source?: ExpeditionReadinessSourceKind;
  updatedAt?: string | null;
  isStale?: boolean;
  isMock?: boolean;
  isDemo?: boolean;
  isInferred?: boolean;
};

export type ExpeditionReadinessInput = {
  tripIntent?: ExpeditionTripIntent | null;
  tripIntentSource?: ExpeditionTripIntentSource | null;
  readinessProfile?: ExpeditionReadinessProfile | null;
  route?: ExpeditionReadinessRouteInput | null;
  activeVehicle?: ExpeditionReadinessVehicleInput | null;
  weather?: ExpeditionReadinessWeatherInput | null;
  daylight?: ExpeditionReadinessDaylightInput | null;
  offline?: ExpeditionReadinessOfflineInput | null;
  campCandidates?: ExpeditionReadinessCampCandidateInput[] | null;
  fuel?: ExpeditionReadinessFuelInput | null;
  power?: ExpeditionReadinessPowerInput | null;
  recovery?: ExpeditionReadinessRecoveryInput | null;
  communications?: ExpeditionReadinessCommunicationsInput | null;
  telemetry?: ExpeditionReadinessTelemetryInput | null;
  currentLocation?: ExpeditionReadinessLocationInput | null;
  plannedDepartureAt?: string | null;
  capturedAt?: string | null;
  readinessPreferences?: Partial<ExpeditionReadinessPreferences> | null;
};

import type { RouteLifecycleState } from '../types/expedition';

export const ASSESSMENT_CATEGORIES = [
  'overview',
  'route',
  'convoy',
  'camp',
  'logistics',
  'vehicles',
] as const;

export type AssessmentCategory = (typeof ASSESSMENT_CATEGORIES)[number];

export const ASSESSMENT_STATUSES = [
  'normal',
  'watch',
  'caution',
  'critical',
  'unknown',
] as const;

export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const ASSESSMENT_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;

export type AssessmentConfidence = (typeof ASSESSMENT_CONFIDENCE_LEVELS)[number];

export const EXPEDITION_DATA_SOURCES = [
  'liveGps',
  'userManual',
  'vehicleObd',
  'satellite',
  'cached',
  'mock',
  'unknown',
] as const;

export type ExpeditionDataSource = (typeof EXPEDITION_DATA_SOURCES)[number];

export type ExpeditionDataReliability = 'high' | 'medium' | 'low' | 'unknown';

export type ExpeditionGeoPoint = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
};

export type ExpeditionDataPoint<T> = {
  value: T | null;
  source: ExpeditionDataSource;
  updatedAt?: string | null;
  confidence?: AssessmentConfidence;
  reliability?: ExpeditionDataReliability;
  isStale?: boolean;
  staleAfterMinutes?: number;
  notes?: string | null;
};

export type ExpeditionAssessmentDataUsed = {
  id: string;
  label: string;
  value: string | number | boolean | null;
  source: ExpeditionDataSource;
  updatedAt?: string | null;
  confidence?: AssessmentConfidence;
  reliability?: ExpeditionDataReliability;
  isStale?: boolean;
  isMissing?: boolean;
  notes?: string | null;
};

export type ExpeditionAssessmentRelatedAction = {
  id: string;
  label: string;
  targetCategory?: AssessmentCategory;
  disabled?: boolean;
  reason?: string;
};

/**
 * Shared output contract for Expedition operational assessment views.
 *
 * Deterministic assessment logic owns the safety/status decision. AI or narrative
 * logic may explain the result, but it must stay grounded in the visible
 * dataUsed, staleDataWarnings, and missingDataWarnings fields.
 */
export type ExpeditionAssessment = {
  id: string;
  category: AssessmentCategory;
  status: AssessmentStatus;
  title: string;
  summary: string;
  why: string[];
  whatToWatch: string[];
  recommendedAction: string;
  toImproveStatus: string[];
  confidence: AssessmentConfidence;
  dataUsed: ExpeditionAssessmentDataUsed[];
  staleDataWarnings: string[];
  missingDataWarnings: string[];
  lastUpdated: string;
  escalationRecommended: boolean;
  escalationReason?: string | null;
  relatedActions: ExpeditionAssessmentRelatedAction[];
};

export type ExpeditionRouteSnapshot = {
  routeId?: string | null;
  routeName?: ExpeditionDataPoint<string>;
  lifecycleState?: ExpeditionDataPoint<RouteLifecycleState>;
  currentLocation?: ExpeditionDataPoint<ExpeditionGeoPoint>;
  currentSegmentLabel?: ExpeditionDataPoint<string>;
  progressPercent?: ExpeditionDataPoint<number>;
  distanceRemainingMiles?: ExpeditionDataPoint<number>;
  estimatedArrivalIso?: ExpeditionDataPoint<string>;
  plannedArrivalStartIso?: ExpeditionDataPoint<string>;
  plannedArrivalEndIso?: ExpeditionDataPoint<string>;
  daylightRemainingAtEtaMinutes?: ExpeditionDataPoint<number>;
  routeConfidence?: ExpeditionDataPoint<AssessmentConfidence>;
  knownHazards?: ExpeditionDataPoint<string[]>;
  userReportedRouteIssues?: ExpeditionDataPoint<string[]>;
  offRoute?: ExpeditionDataPoint<boolean>;
  upcomingDifficultTerrain?: ExpeditionDataPoint<boolean>;
  upcomingDifficultTerrainLabel?: ExpeditionDataPoint<string>;
  alternateRouteAvailable?: ExpeditionDataPoint<boolean>;
  alternateRouteLabel?: ExpeditionDataPoint<string>;
  lastSafeTurnaroundLabel?: ExpeditionDataPoint<string>;
  exitRouteLabel?: ExpeditionDataPoint<string>;
  deviationTimeMinutes?: ExpeditionDataPoint<number>;
  deviationFuelPercent?: ExpeditionDataPoint<number>;
};

export type ConvoyMemberMovementStatus =
  | 'moving'
  | 'stopped'
  | 'delayed'
  | 'offline'
  | 'needs_assistance'
  | 'unknown';

export type ConvoyMemberSnapshot = {
  id: string;
  callsign: string;
  role?: 'lead' | 'sweep' | 'member' | 'support' | 'unknown';
  lastCheckInAt?: ExpeditionDataPoint<string>;
  lastKnownLocation?: ExpeditionDataPoint<ExpeditionGeoPoint>;
  lastKnownLocationLabel?: ExpeditionDataPoint<string>;
  headingDegrees?: ExpeditionDataPoint<number>;
  speedMph?: ExpeditionDataPoint<number>;
  batteryPercent?: ExpeditionDataPoint<number>;
  locationStale?: ExpeditionDataPoint<boolean>;
  movementStatus?: ExpeditionDataPoint<ConvoyMemberMovementStatus>;
  distanceBehindLeadMiles?: ExpeditionDataPoint<number>;
  missedCheckpoint?: ExpeditionDataPoint<boolean>;
  needsAssistance?: ExpeditionDataPoint<boolean>;
};

export type ConvoySnapshot = {
  teamId?: string | null;
  members?: ConvoyMemberSnapshot[];
  teamMemberCount?: ExpeditionDataPoint<number>;
  activeMemberCount?: ExpeditionDataPoint<number>;
  missingMemberCount?: ExpeditionDataPoint<number>;
  overdueMemberLabels?: ExpeditionDataPoint<string[]>;
  stoppedUnexpectedlyLabels?: ExpeditionDataPoint<string[]>;
  missedCheckpointMemberLabels?: ExpeditionDataPoint<string[]>;
  assistanceNeededMemberLabels?: ExpeditionDataPoint<string[]>;
  lastCheckInAt?: ExpeditionDataPoint<string>;
  trackingEnabled?: ExpeditionDataPoint<boolean>;
  liveLocationMemberCount?: ExpeditionDataPoint<number>;
  staleLocationMemberLabels?: ExpeditionDataPoint<string[]>;
  convoySpacingMinutes?: ExpeditionDataPoint<number>;
  leadSweepSeparationMiles?: ExpeditionDataPoint<number>;
  communicationsStatus?: ExpeditionDataPoint<'online' | 'degraded' | 'offline' | 'unknown'>;
  recommendedRegroupPoint?: ExpeditionDataPoint<string>;
};

export type CampSnapshot = {
  hasRouteCamps?: ExpeditionDataPoint<boolean>;
  plannedCampStatus?: ExpeditionDataPoint<'planned' | 'confirmed' | 'unconfirmed' | 'unsafe' | 'unknown'>;
  nextCampName?: ExpeditionDataPoint<string>;
  estimatedArrivalIso?: ExpeditionDataPoint<string>;
  distanceToNextCampMiles?: ExpeditionDataPoint<number>;
  campReadinessStatus?: ExpeditionDataPoint<AssessmentStatus>;
  campSafetyStatus?: ExpeditionDataPoint<'safe' | 'watch' | 'unsafe' | 'unknown'>;
  campConfirmed?: ExpeditionDataPoint<boolean>;
  weatherExposure?: ExpeditionDataPoint<'low' | 'moderate' | 'high' | 'unknown'>;
  sunsetIso?: ExpeditionDataPoint<string>;
  windMph?: ExpeditionDataPoint<number>;
  temperatureF?: ExpeditionDataPoint<number>;
  precipitationChancePercent?: ExpeditionDataPoint<number>;
  routeDifficultyRemaining?: ExpeditionDataPoint<'easy' | 'moderate' | 'hard' | 'technical' | 'unknown'>;
  convoyArrivalConfidence?: ExpeditionDataPoint<AssessmentConfidence>;
  arrivalBeforeDark?: ExpeditionDataPoint<boolean>;
  daylightRemainingAtArrivalMinutes?: ExpeditionDataPoint<number>;
  alternateCampAvailable?: ExpeditionDataPoint<boolean>;
  alternateCampLabel?: ExpeditionDataPoint<string>;
  alternateCampImprovesDaylightMargin?: ExpeditionDataPoint<boolean>;
  alternateCampFuelRisk?: ExpeditionDataPoint<'low' | 'moderate' | 'high' | 'unknown'>;
  safeSetupBeforeDark?: ExpeditionDataPoint<boolean>;
  overnightFuelReady?: ExpeditionDataPoint<boolean>;
  overnightWaterReady?: ExpeditionDataPoint<boolean>;
  overnightPowerReady?: ExpeditionDataPoint<boolean>;
  knownCampHazards?: ExpeditionDataPoint<string[]>;
};

export type LogisticsSnapshot = {
  fuelRangeMiles?: ExpeditionDataPoint<number>;
  fuelRemainingGallons?: ExpeditionDataPoint<number>;
  fuelLevelPercent?: ExpeditionDataPoint<number>;
  distanceRemainingMiles?: ExpeditionDataPoint<number>;
  nextCheckpointLabel?: ExpeditionDataPoint<string>;
  distanceToNextCheckpointMiles?: ExpeditionDataPoint<number>;
  fuelReserveToNextCheckpointMiles?: ExpeditionDataPoint<number>;
  fuelReserveToCampMiles?: ExpeditionDataPoint<number>;
  fuelReserveToResupplyMiles?: ExpeditionDataPoint<number>;
  waterRemainingLiters?: ExpeditionDataPoint<number>;
  waterEnduranceDays?: ExpeditionDataPoint<number>;
  foodDaysRemaining?: ExpeditionDataPoint<number>;
  groupSize?: ExpeditionDataPoint<number>;
  powerHoursRemaining?: ExpeditionDataPoint<number>;
  batteryPowerStatus?: ExpeditionDataPoint<AssessmentStatus>;
  timeToResupplyHours?: ExpeditionDataPoint<number>;
  distanceToResupplyMiles?: ExpeditionDataPoint<number>;
  shelterReady?: ExpeditionDataPoint<boolean>;
  warmthReady?: ExpeditionDataPoint<boolean>;
  medicalKitReady?: ExpeditionDataPoint<boolean>;
  criticalEquipmentReady?: ExpeditionDataPoint<boolean>;
  criticalEquipmentIssues?: ExpeditionDataPoint<string[]>;
  lastResupplyCompletedAt?: ExpeditionDataPoint<string>;
  supplyStatus?: ExpeditionDataPoint<AssessmentStatus>;
  limitingResource?: ExpeditionDataPoint<string>;
  criticalSupplyWarnings?: ExpeditionDataPoint<string[]>;
};

export type VehicleSnapshot = {
  vehicleId?: string | null;
  callsign?: ExpeditionDataPoint<string>;
  label?: ExpeditionDataPoint<string>;
  driverName?: ExpeditionDataPoint<string>;
  readinessStatus?: ExpeditionDataPoint<AssessmentStatus>;
  engineStatus?: ExpeditionDataPoint<'nominal' | 'warning' | 'fault' | 'unknown'>;
  engineTemperatureF?: ExpeditionDataPoint<number>;
  engineFaultCodes?: ExpeditionDataPoint<string[]>;
  disabled?: ExpeditionDataPoint<boolean>;
  activeMechanicalIssue?: ExpeditionDataPoint<string>;
  manualIssueReports?: ExpeditionDataPoint<string[]>;
  rangeRemainingMiles?: ExpeditionDataPoint<number>;
  fuelLevelPercent?: ExpeditionDataPoint<number>;
  batteryVoltage?: ExpeditionDataPoint<number>;
  tirePressureStatus?: ExpeditionDataPoint<'normal' | 'watch' | 'low' | 'unknown'>;
  recoveryEquipmentReady?: ExpeditionDataPoint<boolean>;
  spareTireReady?: ExpeditionDataPoint<boolean>;
  payloadRiskStatus?: ExpeditionDataPoint<AssessmentStatus>;
  lastTelemetryAt?: ExpeditionDataPoint<string>;
};

export type ExpeditionContextSnapshot = {
  expeditionId?: string | null;
  capturedAt: string;
  offlineMode?: boolean;
  manualInputAvailable?: boolean;
  route?: ExpeditionRouteSnapshot;
  convoy?: ConvoySnapshot;
  camp?: CampSnapshot;
  logistics?: LogisticsSnapshot;
  vehicles?: VehicleSnapshot[];
  notes?: ExpeditionDataPoint<string>;
};

export function isAssessmentCategory(value: string): value is AssessmentCategory {
  return ASSESSMENT_CATEGORIES.includes(value as AssessmentCategory);
}

export function isAssessmentStatus(value: string): value is AssessmentStatus {
  return ASSESSMENT_STATUSES.includes(value as AssessmentStatus);
}

export function isManualExpeditionDataSource(source: ExpeditionDataSource): boolean {
  return source === 'userManual';
}

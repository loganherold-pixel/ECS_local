export type ExpeditionTripStatus = 'planned' | 'active' | 'completed' | 'cancelled' | 'archived';

export type ExpeditionTripDataQuality = 'live' | 'cached' | 'stale' | 'manual' | 'mock' | 'missing' | 'estimated';

export type ExpeditionTripGuidanceSource = 'road' | 'trail' | 'hybrid' | 'run' | 'unknown';

export type PersonalExpeditionRecordType =
  | 'longest_distance'
  | 'longest_duration'
  | 'highest_elevation'
  | 'greatest_elevation_gain'
  | 'most_notable_moments'
  | 'most_badges_earned'
  | 'most_weather_events'
  | 'most_terrain_events'
  | 'most_route_deviations'
  | 'earliest_start'
  | 'latest_finish'
  | 'fastest_average_speed'
  | 'slowest_average_speed';

export type PersonalExpeditionRecordUnit =
  | 'miles'
  | 'seconds'
  | 'feet'
  | 'count'
  | 'mph'
  | 'minutes_after_midnight';

export interface PersonalExpeditionRecord {
  id: string;
  type: PersonalExpeditionRecordType;
  title: string;
  value: number;
  unit: PersonalExpeditionRecordUnit;
  tripId: string;
  achievedAt: string;
  previousValue: number | null;
  isCurrentRecord: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ExpeditionBadgeCategory =
  | 'firsts'
  | 'distance'
  | 'elevation'
  | 'duration'
  | 'weather'
  | 'terrain'
  | 'recovery'
  | 'route_behavior'
  | 'time_of_day'
  | 'notable_moments'
  | 'personal_records'
  | 'seasonal'
  | 'expedition_history'
  | 'exploration'
  | 'remoteness'
  | 'consistency'
  | 'hidden';

export type ExpeditionBadgeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'hidden';

export type ExpeditionBadgeEvaluationType =
  | 'trip_count'
  | 'lifetime_distance'
  | 'single_trip_distance'
  | 'lifetime_duration'
  | 'single_trip_duration'
  | 'max_elevation'
  | 'elevation_gain'
  | 'personal_record'
  | 'weather_terms'
  | 'terrain_terms'
  | 'terrain_risk_count'
  | 'route_event_count'
  | 'recovery_usage'
  | 'viewed_entity'
  | 'notable_moment_count'
  | 'notable_moment_type'
  | 'time_window'
  | 'season'
  | 'context_terms'
  | 'clean_completion'
  | 'hidden_combo';

export type ExpeditionBadgeEvaluationConfig = {
  threshold?: number;
  terms?: string[];
  momentTypes?: ExpeditionRecapNotableMoment['type'][];
  entity?: 'camp' | 'resupply' | 'bailout';
  metric?:
    | 'trip_distance'
    | 'total_distance'
    | 'trip_duration'
    | 'total_duration'
    | 'max_elevation'
    | 'elevation_gain'
    | 'route_events'
    | 'recovery_usage'
    | 'terrain_risk'
    | 'notable_moments'
    | 'trip_count';
  recordMetric?:
    | 'distance'
    | 'duration'
    | 'elevation'
    | 'elevation_gain'
    | 'notable_moments'
    | 'terrain_risk'
    | 'speed';
  hourStart?: number;
  hourEnd?: number;
  timeField?: 'startedAt' | 'completedAt';
  season?: 'spring' | 'summer' | 'fall' | 'winter';
  month?: number;
  requireAll?: boolean;
  maxRouteEvents?: number;
  maxRecoveryUsage?: number;
};

export interface ExpeditionBadge {
  id: string;
  title: string;
  description: string;
  category: ExpeditionBadgeCategory;
  rarity: ExpeditionBadgeRarity;
  iconKey: string;
  unlockedAt: string | null;
  unlockedTripId: string | null;
  isHidden: boolean;
  isRepeatable: boolean;
  progressCurrent: number | null;
  progressTarget: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpeditionBadgeDefinition extends Omit<ExpeditionBadge, 'unlockedAt' | 'unlockedTripId' | 'progressCurrent' | 'progressTarget' | 'updatedAt'> {
  progressTarget: number | null;
  evaluationType: ExpeditionBadgeEvaluationType;
  evaluationConfig: ExpeditionBadgeEvaluationConfig;
}

export type ExpeditionInsightType =
  | 'distance_pattern'
  | 'elevation_pattern'
  | 'weather_pattern'
  | 'time_of_day_pattern'
  | 'route_deviation_pattern'
  | 'recovery_usage'
  | 'milestone_progress'
  | 'expedition_frequency'
  | 'personal_record'
  | 'badge_progress';

export interface ExpeditionInsight {
  id: string;
  type: ExpeditionInsightType;
  title: string;
  description: string;
  confidence: number;
  sourceTripIds: string[];
  generatedAt: string;
  updatedAt: string;
  isDismissed: boolean;
  priority: number;
}

export interface ExpeditionTripCoordinate {
  lat: number;
  lng: number;
  elevationFt?: number | null;
  accuracyM?: number | null;
  speedMph?: number | null;
  headingDeg?: number | null;
  recordedAt?: string | null;
}

export interface ExpeditionTripBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface ExpeditionTripSourceLabel {
  source: string;
  quality: ExpeditionTripDataQuality;
  capturedAt: string;
  staleAt?: string | null;
  note?: string | null;
}

export interface ExpeditionTripWeatherSnapshot {
  id: string;
  capturedAt: string;
  coordinate?: ExpeditionTripCoordinate | null;
  summary?: string | null;
  temperatureF?: number | null;
  windMph?: number | null;
  precipitation?: string | null;
  source: ExpeditionTripSourceLabel;
}

export interface ExpeditionTripTerrainRiskSnapshot {
  id: string;
  capturedAt: string;
  coordinate?: ExpeditionTripCoordinate | null;
  riskLevel?: 'normal' | 'watch' | 'caution' | 'critical' | null;
  summary?: string | null;
  source: ExpeditionTripSourceLabel;
}

export interface ExpeditionTripNotableMoment {
  id: string;
  capturedAt: string;
  type:
    | 'guidance_started'
    | 'guidance_updated'
    | 'guidance_completed'
    | 'guidance_cancelled'
    | 'manual_note'
    | 'route_deviation'
    | 'camp_viewed'
    | 'resupply_viewed'
    | 'recovery_used'
    | 'badge_unlocked';
  title: string;
  detail?: string | null;
  coordinate?: ExpeditionTripCoordinate | null;
  source: ExpeditionTripSourceLabel;
}

export interface ExpeditionTripDeviation {
  id: string;
  capturedAt: string;
  distanceMeters?: number | null;
  coordinate?: ExpeditionTripCoordinate | null;
  statusLabel?: string | null;
  source: ExpeditionTripSourceLabel;
}

export interface ExpeditionTripViewedEntity {
  id: string;
  viewedAt: string;
  title?: string | null;
  coordinate?: ExpeditionTripCoordinate | null;
  source: ExpeditionTripSourceLabel;
}

export interface ExpeditionTripRecoveryUsage {
  usedAt: string;
  context?: string | null;
  source: ExpeditionTripSourceLabel;
}

export interface ExpeditionTripGeneratedSummary {
  text: string;
  generatedAt: string;
  source: ExpeditionTripSourceLabel;
}

export interface ExpeditionRecapLocationSummary {
  coordinate: ExpeditionTripCoordinate | null;
  label?: string | null;
}

export interface ExpeditionRecapTemperatureRange {
  minF: number;
  maxF: number;
}

export interface ExpeditionRecapTerrainRiskEvent {
  id: string;
  capturedAt: string;
  riskLevel?: ExpeditionTripTerrainRiskSnapshot['riskLevel'];
  summary?: string | null;
  coordinate?: ExpeditionTripCoordinate | null;
}

export interface ExpeditionRecapSteepGradeSegment {
  id: string;
  startCoordinate: ExpeditionTripCoordinate;
  endCoordinate: ExpeditionTripCoordinate;
  gradePercent: number;
  elevationChangeFt: number;
}

export interface ExpeditionRecapElevationChange {
  id: string;
  fromElevationFt: number;
  toElevationFt: number;
  changeFt: number;
  coordinate?: ExpeditionTripCoordinate | null;
}

export interface ExpeditionRecapNotableMoment {
  id: string;
  capturedAt: string;
  type:
    | 'highest_elevation'
    | 'weather_change'
    | 'route_deviation'
    | 'reroute_accepted'
    | 'recovery_tools_opened'
    | 'terrain_risk_warning'
    | 'guidance_completed'
    | 'badge_unlocked'
    | 'manual_note';
  title: string;
  detail?: string | null;
  coordinate?: ExpeditionTripCoordinate | null;
}

export interface ExpeditionRecap {
  tripId: string;
  generatedAt: string;

  journeySummary: {
    totalDistanceMiles: number | null;
    totalDurationHours: number | null;
    averageSpeedMph: number | null;
    maxElevationFt: number | null;
    elevationGainFt: number | null;
  };

  routeSummary: {
    startLocation: ExpeditionRecapLocationSummary | null;
    endLocation: ExpeditionRecapLocationSummary | null;
    routeBounds: ExpeditionTripBounds | null;
    routeGeometryReference: string | null;
  };

  environmentSummary?: {
    weatherConditionsEncountered?: string[];
    temperatureRange?: ExpeditionRecapTemperatureRange;
    sunlightConditions?: string[];
  };

  terrainSummary?: {
    terrainRiskEvents?: ExpeditionRecapTerrainRiskEvent[];
    steepGradeSegments?: ExpeditionRecapSteepGradeSegment[];
    notableElevationChanges?: ExpeditionRecapElevationChange[];
  };

  expeditionEvents: {
    notableMoments: ExpeditionRecapNotableMoment[];
    routeDeviations: ExpeditionTripDeviation[];
    reroutes: ExpeditionRecapNotableMoment[];
    recoveryPanelUsage: ExpeditionTripRecoveryUsage[];
  };

  tripOutcome: {
    completionStatus: ExpeditionTripStatus;
    tripRatingCandidate: 'clean' | 'eventful' | 'challenging' | 'incomplete';
  };

  generatedNarrative: {
    headline: string;
    summaryParagraph: string;
  };
}

export type ExpeditionReportExportFormat = 'pdf' | 'html' | 'text';

export type ExpeditionReportExportStatus = 'idle' | 'generating' | 'ready' | 'failed';

export interface ExpeditionReport {
  id: string;
  tripId: string;
  generatedAt: string;
  title: string;
  completedAt: string | null;
  totalDistanceMiles: number | null;
  totalDurationSeconds: number | null;
  maxElevationFt: number | null;
  elevationGainFt: number | null;
  recapHeadline: string | null;
  recapSummary: string | null;
  notableMoments: ExpeditionRecapNotableMoment[];
  badgesEarned: ExpeditionBadge[];
  routeBounds: ExpeditionTripBounds | null;
  routeGeometryReference: string | null;
  mapSnapshotUri: string | null;
  exportFormat: ExpeditionReportExportFormat;
  localUri: string | null;
  createdAt: string;
}

export interface ExpeditionTripRecord {
  id: string;
  schemaVersion: string;
  userId: string | null;
  title: string;
  status: ExpeditionTripStatus;
  startedAt: string;
  completedAt: string | null;
  totalDistanceMiles: number | null;
  totalDurationSeconds: number | null;
  minElevationFt: number | null;
  maxElevationFt: number | null;
  totalElevationGainFt: number | null;
  startCoordinate: ExpeditionTripCoordinate | null;
  endCoordinate: ExpeditionTripCoordinate | null;
  routeGeometry: ExpeditionTripCoordinate[];
  plannedRouteGeometry?: ExpeditionTripCoordinate[];
  routeBounds: ExpeditionTripBounds | null;
  weatherSnapshots: ExpeditionTripWeatherSnapshot[];
  terrainRiskSnapshots: ExpeditionTripTerrainRiskSnapshot[];
  notableMoments: ExpeditionTripNotableMoment[];
  deviations: ExpeditionTripDeviation[];
  bailoutPointsUsed: ExpeditionTripViewedEntity[];
  campCandidatesViewed: ExpeditionTripViewedEntity[];
  resupplyStopsViewed: ExpeditionTripViewedEntity[];
  recoveryPanelUsed: ExpeditionTripRecoveryUsage[];
  badgesUnlocked: string[];
  generatedSummary: ExpeditionTripGeneratedSummary | null;
  recap: ExpeditionRecap | null;
  createdAt: string;
  updatedAt: string;

  guidanceSessionId?: string | null;
  guidanceSource?: ExpeditionTripGuidanceSource;
  routeId?: string | null;
  routeTitle?: string | null;
  routeSubtitle?: string | null;
  dataUsed: ExpeditionTripSourceLabel[];
  syncStatus: 'local' | 'pending' | 'synced' | 'failed';
}

export interface ExpeditionTripSummary {
  id: string;
  title: string;
  completedAt: string | null;
  totalDistanceMiles: number | null;
  totalDurationSeconds: number | null;
  maxElevationFt: number | null;
  badgesUnlockedCount: number;
  notableMomentsCount: number;
  startCoordinate: ExpeditionTripCoordinate | null;
  endCoordinate: ExpeditionTripCoordinate | null;
  routeBounds: ExpeditionTripBounds | null;
}

export interface ExpeditionTripCreateInput {
  id?: string;
  userId?: string | null;
  title?: string | null;
  startedAt?: string | null;
  startCoordinate?: ExpeditionTripCoordinate | null;
  routeGeometry?: ExpeditionTripCoordinate[];
  plannedRouteGeometry?: ExpeditionTripCoordinate[];
  guidanceSessionId?: string | null;
  guidanceSource?: ExpeditionTripGuidanceSource;
  routeId?: string | null;
  routeTitle?: string | null;
  routeSubtitle?: string | null;
  dataSource?: ExpeditionTripSourceLabel;
}

export interface ExpeditionTripStatsUpdateInput {
  updatedAt?: string | null;
  totalDistanceMiles?: number | null;
  totalDurationSeconds?: number | null;
  currentCoordinate?: ExpeditionTripCoordinate | null;
  routeGeometry?: ExpeditionTripCoordinate[];
  plannedRouteGeometry?: ExpeditionTripCoordinate[];
  statusLabel?: string | null;
  isOffRoute?: boolean;
  offRouteDistanceM?: number | null;
  dataSource?: ExpeditionTripSourceLabel;
}

export interface ExpeditionTripFinalizeInput extends ExpeditionTripStatsUpdateInput {
  completedAt?: string | null;
  endCoordinate?: ExpeditionTripCoordinate | null;
  generatedSummary?: ExpeditionTripGeneratedSummary | null;
}

export interface ExpeditionTripGuidanceSnapshot {
  sessionId: string | null;
  lifecycle: 'inactive' | 'preview' | 'active' | 'arrived';
  source: ExpeditionTripGuidanceSource | 'none';
  routeId: string | null;
  routeTitle: string | null;
  routeSubtitle: string | null;
  statusLabel: string;
  routePoints: Array<{
    lat: number;
    lng: number;
    ele?: number | null;
    ele_m?: number | null;
    elevationFeet?: number | null;
  }>;
  progressPoints: Array<{
    lat: number;
    lng: number;
    ele?: number | null;
    ele_m?: number | null;
    elevationFeet?: number | null;
  }>;
  currentLocation: {
    latitude: number;
    longitude: number;
    altitudeFt?: number | null;
    elevationFt?: number | null;
    speedMph?: number | null;
    headingDeg?: number | null;
    accuracyM?: number | null;
    timestamp?: number | null;
  } | null;
  gpsSample?: {
    latitude: number;
    longitude: number;
    altitudeFt?: number | null;
    elevationFt?: number | null;
    speedMph?: number | null;
    headingDeg?: number | null;
    accuracyM?: number | null;
    timestamp?: number | null;
  } | null;
  headingDeg?: number | null;
  remainingDistanceM: number | null;
  progressPercent: number | null;
  isOffRoute: boolean;
  offRouteDistanceM: number | null;
  routeStatusKind: 'nominal' | 'rerouting' | 'off_route' | 'arrived' | null;
  updatedAt: string | null;
}

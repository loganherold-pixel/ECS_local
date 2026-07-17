import type { ExploreRouteReadinessSummary } from '../readiness/exploreRouteReadiness';
import type { CampOpsRouteCampEndpointPlan } from '../campops/campOpsTypes';
import type { ECSJourneyLinkage, ECSRouteProvenance } from '../lifecycle/routeTripExpeditionLifecycle';

export type TripType =
  | 'day_trip'
  | 'overnight_camping'
  | 'weekend_overland'
  | 'multi_day_expedition'
  | 'scenic_exploration'
  | 'technical_trail_run';

export type TimeWindow =
  | 'morning'
  | 'afternoon'
  | 'full_day'
  | 'overnight'
  | 'weekend'
  | 'custom';

export type GroupType = 'solo' | 'two_vehicle' | 'small_group' | 'convoy';

export type TripPriority =
  | 'camping'
  | 'scenic_stops'
  | 'technical_terrain'
  | 'low_risk'
  | 'remote_travel'
  | 'fuel_efficiency'
  | 'family_friendly'
  | 'photography_overlooks';

export type TripBuilderConfidence = 'high' | 'medium' | 'low' | 'unknown';

export type TripBuilderRouteContextConfidenceTier = 'high' | 'medium' | 'partial' | 'fallback';

export const ROUTE_GEOMETRY_STATUSES = [
  'approach_only',
  'trail_available',
  'trail_missing',
  'partial_trail',
  'unknown',
] as const;

export type RouteGeometryStatus = typeof ROUTE_GEOMETRY_STATUSES[number];

export type ItineraryDataState =
  | 'live'
  | 'cached'
  | 'stale'
  | 'manual'
  | 'mock'
  | 'mocked'
  | 'estimated'
  | 'missing'
  | 'unknown';

export type ItineraryDataSource = {
  id?: string | null;
  label: string;
  state: ItineraryDataState;
  provider?: string | null;
  source?: string | null;
  capturedAt?: string | null;
  updatedAt?: string | null;
  confidence?: TripBuilderConfidence | number | null;
  notes?: string[];
};

export type GeoPoint = {
  latitude: number;
  longitude: number;
  elevationFeet?: number | null;
  elevationMeters?: number | null;
  accuracyMeters?: number | null;
  source?: string | ItineraryDataSource | null;
};

export type TripBuilderCoordinate = GeoPoint;

export type TrailheadStartStatus = 'confirmed' | 'likely' | 'unavailable';

export type TrailheadStartCandidate = {
  coordinate: GeoPoint | null;
  name?: string | null;
  confidenceScore: number;
  confidence: TripBuilderConfidence;
  source: ItineraryDataSource;
  warnings: string[];
  isConfirmedTrailhead: boolean;
  status: TrailheadStartStatus;
  metadata?: Record<string, unknown> | null;
};

export const ITINERARY_WAYPOINT_TYPES = [
  'trailhead_start',
  'fuel',
  'grocery',
  'water',
  'supply',
  'camp_potential',
  'scenic_stop',
  'bailout',
  'hazard',
  'turnaround',
  'trail_end',
  'exit',
  'user_added',
] as const;

export type WaypointType = typeof ITINERARY_WAYPOINT_TYPES[number];

export const ITINERARY_PHASES = [
  'approach',
  'pre_trail_resupply',
  'trailhead',
  'trail_navigation',
  'trail_exit',
] as const;

export type ItineraryPhase = typeof ITINERARY_PHASES[number];

export type ItineraryWaypoint = {
  id: string;
  type: WaypointType;
  phase: ItineraryPhase;
  title: string;
  description?: string | null;
  coordinate: GeoPoint | null;
  sequence?: number | null;
  routeMileMarker?: number | null;
  etaOffsetHours?: number | null;
  source: ItineraryDataSource;
  confidence: TripBuilderConfidence;
  confidenceScore?: number | null;
  isUserAdded?: boolean;
  isEcsSuggested?: boolean;
  dataUsed?: ItineraryDataSource[];
  notes?: string[];
  metadata?: Record<string, unknown> | null;
};

export type ItineraryStop = ItineraryWaypoint & {
  sequence: number;
  plannedDay?: number | null;
  dwellMinutes?: number | null;
  required?: boolean;
  stopRole?:
    | 'origin'
    | 'pre_trail_resupply'
    | 'trailhead'
    | 'trail'
    | 'exit'
    | 'fallback'
    | 'operator_added'
    | null;
};

export type RouteSegment = {
  id: string;
  phase: ItineraryPhase;
  sequence: number;
  title?: string | null;
  fromWaypointId?: string | null;
  toWaypointId?: string | null;
  fromStopId?: string | null;
  toStopId?: string | null;
  startCoordinate?: GeoPoint | null;
  endCoordinate?: GeoPoint | null;
  geometry?: GeoPoint[];
  distanceMiles?: number | null;
  estimatedDriveTimeHours?: number | null;
  source?: ItineraryDataSource | null;
  confidence?: TripBuilderConfidence | null;
  dataUsed?: ItineraryDataSource[];
  notes?: string[];
  metadata?: Record<string, unknown> | null;
};

export type ItineraryRoute = {
  id: string;
  phase: ItineraryPhase;
  title: string;
  geometry: GeoPoint[] | null;
  segments: RouteSegment[];
  source: ItineraryDataSource;
  confidence: TripBuilderConfidence;
  distanceMiles?: number | null;
  estimatedDriveTimeHours?: number | null;
  unavailableReason?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ItineraryPhaseStatus =
  | 'available'
  | 'missing'
  | 'optional'
  | 'not_applicable';

export type ItineraryPhaseSummary = {
  phase: ItineraryPhase;
  sequence: number;
  status: ItineraryPhaseStatus;
  title: string;
  routeId?: string | null;
  waypointIds: string[];
  stopIds: string[];
  segmentIds: string[];
  startCoordinate?: GeoPoint | null;
  endCoordinate?: GeoPoint | null;
  transitionFromPhase?: ItineraryPhase | null;
  transitionToPhase?: ItineraryPhase | null;
  unavailableReason?: string | null;
  warnings?: string[];
  metadata?: Record<string, unknown> | null;
};

export const ITINERARY_PRE_TRAIL_STOP_BUCKETS = [
  'fuel',
  'grocery',
  'water',
  'generalSupply',
] as const;

export type ItineraryPreTrailStopBucket = typeof ITINERARY_PRE_TRAIL_STOP_BUCKETS[number];

export type ItineraryPreTrailStopBucketStatus =
  | 'selected'
  | 'ranked'
  | 'provider_unavailable'
  | 'provider_pending'
  | 'no_results'
  | 'missing_anchor'
  | 'not_requested';

export type ItineraryPreTrailProviderState =
  | 'pending'
  | 'ready'
  | 'empty'
  | 'error'
  | 'unavailable';

export type ItineraryPreTrailStopSearchSummary = {
  bucket: ItineraryPreTrailStopBucket;
  status: ItineraryPreTrailStopBucketStatus;
  providerState?: ItineraryPreTrailProviderState | null;
  anchorCoordinate: GeoPoint | null;
  stopCount: number;
  provider?: string | null;
  searchedAt?: string | null;
  searchRadiusMiles?: number | null;
  warnings?: string[];
  dataUsed?: ItineraryDataSource[];
  metadata?: Record<string, unknown> | null;
};

export type ItineraryPreTrailStops = {
  fuel: ItineraryStop[];
  grocery: ItineraryStop[];
  water: ItineraryStop[];
  generalSupply: ItineraryStop[];
};

export type ItineraryConfidenceSummary = {
  overall: TripBuilderConfidence;
  score?: number | null;
  routeGeometry?: TripBuilderConfidence | null;
  routeGeometryStatus?: RouteGeometryStatus | null;
  trailhead?: TripBuilderConfidence | null;
  trailheadConfidenceScore?: number | null;
  trailheadStatus?: TrailheadStartStatus | null;
  resupply?: TripBuilderConfidence | null;
  trailWaypoints?: TripBuilderConfidence | null;
  exitRoute?: TripBuilderConfidence | null;
  dataFreshness?: TripBuilderConfidence | null;
  reasons?: string[];
  missingData?: string[];
  staleData?: string[];
  manualData?: string[];
  dataUsed?: ItineraryDataSource[];
};

export type FuelRangeStatus =
  | 'unknown'
  | 'sufficient'
  | 'recommended'
  | 'critical';

export type TripBuilderFuelTelemetry = {
  sourceType?: string | null;
  source?: string | null;
  sourceLabel?: string | null;
  freshness?: string | null;
  confidence?: string | number | null;
  updatedAt?: string | null;
  timestamp?: number | string | null;
  isLive?: boolean | null;
  provider?: string | null;
  deviceId?: string | null;
  device_id?: string | null;
  rangeMiles?: number | null;
  fuelRangeMiles?: number | null;
  fuelRangeMi?: number | null;
  fuelSafeRangeMi?: number | null;
  estimatedRangeMiles?: number | null;
  fuelLevelPct?: number | null;
  fuelPercent?: number | null;
  fuel_level?: number | null;
  fuelLevel?: number | null;
  fuelRemainingGallons?: number | null;
  fuelRemainingGal?: number | null;
  fuel_remaining_gal?: number | null;
  fuelTankCapacityGal?: number | null;
  tankCapacityGal?: number | null;
  avgMpg?: number | null;
  mpg?: number | null;
  raw?: Record<string, unknown> | null;
};

export type TripFuelRangeConfidence = {
  estimatedTotalDistance: number | null;
  estimatedTrailDistance: number | null;
  knownFuelRange: number | null;
  estimatedFuelRemaining: number | null;
  fuelStatus: FuelRangeStatus;
  confidenceScore: number;
  warnings: string[];
  rangeMarginMiles?: number | null;
  estimatedFuelRequiredGallons?: number | null;
  fuelDataSource?: ItineraryDataSource | null;
  distanceDataSource?: ItineraryDataSource | null;
  preTrailFuelStopCount?: number;
  dataUsed?: ItineraryDataSource[];
  metadata?: Record<string, unknown> | null;
};

export type TripItinerary = {
  id: string;
  sourceRouteId?: string | null;
  routeId?: string | null;
  suggestedRouteId?: string | null;
  title: string;
  status?: 'draft' | 'ready' | 'partial' | 'stale' | 'unknown';
  createdAt: string;
  updatedAt?: string | null;
  userStart?: GeoPoint | null;
  approachRoute?: ItineraryRoute | null;
  preTrailStops?: ItineraryPreTrailStops;
  preTrailStopStatus?: ItineraryPreTrailStopSearchSummary[];
  fuelRangeConfidence?: TripFuelRangeConfidence;
  trailheadStart?: ItineraryWaypoint | null;
  trailheadStartCandidate?: TrailheadStartCandidate | null;
  trailRoute?: ItineraryRoute | null;
  routeGeometryStatus: RouteGeometryStatus;
  trailEnd?: ItineraryWaypoint | null;
  exitRoute?: ItineraryRoute | null;
  exitEnd?: GeoPoint | null;
  trailWaypoints?: ItineraryWaypoint[];
  phases: ItineraryPhase[];
  phaseSummaries?: ItineraryPhaseSummary[];
  stops: ItineraryStop[];
  waypoints: ItineraryWaypoint[];
  segments: RouteSegment[];
  confidence: ItineraryConfidenceSummary;
  dataUsed: ItineraryDataSource[];
  warnings?: TripBuilderWarning[];
  notes?: string[];
  metadata?: Record<string, unknown> | null;
};

export type TripBuilderRouteContextInput = {
  status?: string | null;
  trailheadAnchor?: {
    coordinate?: TripBuilderCoordinate | null;
    source?: string | null;
    confidence?: number | null;
    warnings?: string[];
  } | null;
  supplyMode?: 'none' | 'gas' | 'grocery' | 'gas_and_grocery' | string | null;
  selectedSupplyPlan?: {
    orderedStops?: {
      candidateId: string;
      category: string;
      sequence: number;
    }[] | null;
    score?: number | null;
    confidence?: number | null;
    warnings?: string[];
  } | null;
  routeGeometry?: {
    coordinates?: TripBuilderCoordinate[] | null;
    distanceMiles?: number | null;
    distanceMeters?: number | null;
    durationHours?: number | null;
    durationSeconds?: number | null;
    providerMetadata?: Record<string, unknown> | null;
  } | null;
  routeDistanceMiles?: number | null;
  routeDurationHours?: number | null;
  warnings?: {
    code?: string | null;
    message?: string | null;
    severity?: string | null;
  }[];
  confidence?: {
    value?: number | null;
    tier?: TripBuilderRouteContextConfidenceTier | null;
    reasons?: string[];
  } | null;
  providerMetadata?: Record<string, unknown> | null;
  supplyCandidateCount?: number | null;
  supplyCandidates?: {
    id: string;
    providerPlaceId?: string | null;
    category?: string | null;
    name: string;
    lat?: number | null;
    lng?: number | null;
    coordinate?: TripBuilderCoordinate | null;
    address?: string | null;
    distanceToTrailheadMeters?: number | null;
    driveDistanceToTrailheadMeters?: number | null;
    driveDurationToTrailheadSeconds?: number | null;
    detourDistanceMeters?: number | null;
    detourDurationSeconds?: number | null;
    accessStatus?: 'accessible' | 'inaccessible' | 'unknown' | string | null;
    openStatus?: 'open' | 'closed' | 'temporarily_closed' | 'unknown' | string | null;
    rating?: number | null;
    confidence?: {
      value?: number | null;
      reasons?: string[];
    } | TripBuilderConfidence | number | null;
    score?: number | null;
    warnings?: {
      code?: string | null;
      message?: string | null;
      severity?: string | null;
      source?: string | null;
    }[];
    source?: string | null;
    providerMetadata?: Record<string, unknown> | null;
  }[] | null;
  trailWaypoints?: unknown[] | null;
  campCandidates?: {
    id: string;
    name?: string | null;
    lat?: number | null;
    lng?: number | null;
    coordinate?: TripBuilderCoordinate | null;
    source?: string | null;
    distanceFromRouteMeters?: number | null;
    distanceFromTrailheadMeters?: number | null;
    accessStatus?: string | null;
    legalStatus?: string | null;
    restrictionStatus?: string | null;
    score?: number | null;
    confidence?: {
      value?: number | null;
      reasons?: string[];
    } | TripBuilderConfidence | number | null;
    warnings?: {
      code?: string | null;
      message?: string | null;
      severity?: string | null;
      source?: string | null;
    }[];
    providerMetadata?: Record<string, unknown> | null;
  }[] | null;
  campEndpointPlan?: CampOpsRouteCampEndpointPlan | null;
  bailoutCandidates?: {
    id: string;
    label?: string | null;
    name?: string | null;
    lat?: number | null;
    lng?: number | null;
    coordinate?: TripBuilderCoordinate | null;
    source?: string | null;
    category?: string | null;
    routeMileMarker?: number | null;
    distanceFromRouteMeters?: number | null;
    distanceFromTrailheadMeters?: number | null;
    driveTimeToSafetySeconds?: number | null;
    reachableByVehicle?: boolean | null;
    score?: number | null;
    confidence?: {
      value?: number | null;
      reasons?: string[];
    } | TripBuilderConfidence | number | null;
    warnings?: {
      code?: string | null;
      message?: string | null;
      severity?: string | null;
      source?: string | null;
    }[];
    providerMetadata?: Record<string, unknown> | null;
  }[] | null;
};

export type TripBuilderRouteInput = {
  id?: string | null;
  name?: string | null;
  title?: string | null;
  region?: string | null;
  source?: string | null;
  distanceMiles?: number | null;
  total_distance_miles?: number | null;
  distance_mi?: number | null;
  estimatedDriveTimeHours?: number | null;
  estimatedTravelHours?: number | null;
  eta_hours?: number | null;
  estimatedDays?: number | null;
  terrainType?: string | null;
  terrainDifficulty?: number | null;
  difficultyRating?: string | null;
  remotenessScore?: number | null;
  permitRequired?: boolean | null;
  startLat?: number | null;
  startLng?: number | null;
  coordinate?: unknown;
  destinationCoordinate?: unknown;
  endpointCoordinate?: unknown;
  endCoordinate?: unknown;
  routeGeometry?: unknown;
  routeGeometryStatus?: RouteGeometryStatus | null;
  trailGeometry?: unknown;
  trailheadStartCandidate?: TrailheadStartCandidate | null;
  geojson?: unknown;
  waypoints?: unknown[];
  segments?: unknown[];
  routeMetadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type SuggestedRoute = TripBuilderRouteInput & {
  id: string;
  name: string;
  region?: string | null;
  distanceMiles?: number | null;
  total_distance_miles?: number | null;
  estimatedDriveTimeHours?: number | null;
  estimatedTravelHours?: number | null;
  estimatedDays?: number | null;
  startLat?: number | null;
  startLng?: number | null;
  coordinate?: GeoPoint | { lat: number; lng: number } | null;
  destinationCoordinate?: GeoPoint | { lat: number; lng: number } | null;
  endpointCoordinate?: GeoPoint | { lat: number; lng: number } | null;
  endCoordinate?: GeoPoint | { lat: number; lng: number } | null;
  routeGeometry?: unknown;
  routeGeometryStatus?: RouteGeometryStatus | null;
  trailGeometry?: unknown;
  trailheadStartCandidate?: TrailheadStartCandidate | null;
  waypoints?: unknown[];
  itinerary?: TripItinerary | null;
  itineraryConfidence?: ItineraryConfidenceSummary | null;
};

export type TripBuilderVehicleProfile = {
  id?: string | null;
  label?: string | null;
  vehicleType?: string | null;
  rangeMiles?: number | null;
  rangeSource?: 'telemetry' | 'manual' | 'estimated' | 'unknown' | string | null;
  fuelTankCapacityGal?: number | null;
  avgMpg?: number | null;
  currentFuelGallons?: number | null;
  fuelLevelPct?: number | null;
  waterCapacityGal?: number | null;
  currentWaterGallons?: number | null;
  waterSource?: 'telemetry' | 'manual' | 'estimated' | 'unknown' | string | null;
  payloadRemainingLbs?: number | null;
  clearanceInches?: number | null;
  tireSizeInches?: number | null;
  trailerAttached?: boolean | null;
  supportReadiness?: {
    water?: boolean | null;
    foodSupplies?: boolean | null;
    repair?: boolean | null;
    medical?: boolean | null;
    recovery?: boolean | null;
    source?: string | null;
    labels?: string[];
  } | null;
  confidence?: TripBuilderConfidence | null;
  source?: string | null;
  updatedAt?: string | null;
};

export type TripBuilderReadinessReference = {
  status?: string | null;
  score?: number | null;
  summary?: ExploreRouteReadinessSummary | string | null;
  topConcern?: string | null;
  updatedAt?: string | null;
  source?: string | null;
};

export type TripBuilderInput = {
  tripType: TripType;
  timeWindow: TimeWindow;
  groupType: GroupType;
  priorities?: TripPriority[];
  smartResupplyPreference?: 'fuel_only' | 'fuel_supplies' | 'no' | null;
  bailoutPlanRequested?: boolean | null;
  plannedDepartureAt?: string | null;
  customWindow?: {
    startIso?: string | null;
    endIso?: string | null;
  } | null;
  preferredDailyDriveHours?: number | null;
  notes?: string | null;
};

export type TripPlanRouteSummary = {
  routeId: string;
  name: string;
  region: string | null;
  source: string | null;
  distanceMiles: number | null;
  estimatedDriveTimeHours: number | null;
  estimatedDays: number | null;
  terrainType: string | null;
  difficulty: string | null;
  remotenessScore: number | null;
  permitRequired: boolean | null;
  startCoordinate: TripBuilderCoordinate | null;
  endCoordinate: TripBuilderCoordinate | null;
  routeDataConfidence: TripBuilderConfidence;
  routeContextConfidence?: TripBuilderRouteContextConfidenceTier | null;
  routeContextStatus?: string | null;
  routeAssetId?: string | null;
  provenance?: ECSRouteProvenance | null;
};

export type TripPlanStopType =
  | 'start'
  | 'finish'
  | 'waypoint'
  | 'scenic_stop'
  | 'camp'
  | 'backup_camp'
  | 'exit'
  | 'resupply'
  | 'fuel'
  | 'water'
  | 'supply'
  | 'repair'
  | 'medical'
  | 'ranger_station'
  | 'camp_search'
  | 'planning_checkpoint'
  | 'unknown';

export type TripPlanGuidanceRole = 'required' | 'reference_only';

export type TripPlanReferenceType =
  | 'camp_candidate'
  | 'bailout'
  | 'operator_note';

export type TripPlanStop = {
  id: string;
  type: TripPlanStopType;
  title: string;
  sequence: number;
  plannedDay: number;
  coordinate: TripBuilderCoordinate | null;
  routeMileMarker: number | null;
  etaOffsetHours: number | null;
  source: string;
  confidence: TripBuilderConfidence;
  approachProgressRatio?: number | null;
  guidanceRole?: TripPlanGuidanceRole;
  referenceType?: TripPlanReferenceType | null;
  notes?: string[];
};

export type TripPlanReferencePoint = {
  id: string;
  type: Extract<TripPlanStopType, 'camp' | 'backup_camp' | 'exit' | 'waypoint' | 'planning_checkpoint'>;
  title: string;
  coordinate: TripBuilderCoordinate | null;
  routeMileMarker?: number | null;
  plannedDay?: number | null;
  source?: string | null;
  confidence?: TripBuilderConfidence | null;
  referenceType?: TripPlanReferenceType | null;
  notes?: string[] | null;
};

export type TripPlanSegment = {
  id: string;
  fromStopId: string;
  toStopId: string;
  title: string;
  day: number;
  distanceMiles: number | null;
  estimatedDriveTimeHours: number | null;
  notes: string[];
  riskLevel: 'low' | 'moderate' | 'elevated' | 'high' | 'unknown';
};

export type CampCandidate = {
  id: string;
  name: string;
  location?: TripBuilderCoordinate | null;
  routeMileMarker?: number | null;
  distanceFromRouteMiles?: number | null;
  score?: number | null;
  legalConfidence?: TripBuilderConfidence | string | null;
  accessConfidence?: TripBuilderConfidence | string | null;
  source?: string | null;
  notes?: string[] | null;
};

export type ExitPoint = {
  id: string;
  name: string;
  type?: string | null;
  location?: TripBuilderCoordinate | null;
  routeMileMarker?: number | null;
  distanceFromRouteMiles?: number | null;
  priority?: number | null;
  source?: string | null;
  notes?: string[] | null;
};

export type TripEstimate = {
  totalDistanceMiles: number | null;
  driveTimeHours: number | null;
  tripDays: number | null;
  fuelRequiredGallons: number | null;
  confidence: TripBuilderConfidence;
  basis: string[];
};

export type TripBuilderNote = {
  id: string;
  message: string;
  source: 'route' | 'vehicle' | 'camp' | 'exit' | 'readiness' | 'planning';
};

export type TripBuilderWarning = {
  id: string;
  message: string;
  severity: 'watch' | 'caution' | 'critical';
  source: 'route' | 'vehicle' | 'camp' | 'exit' | 'readiness' | 'planning';
};

export type ResupplyCategory =
  | 'fuel'
  | 'water'
  | 'food_supplies'
  | 'repair'
  | 'medical'
  | 'exit_access';

export type ResupplyStatus = 'good' | 'medium' | 'low' | 'unknown';

export type ResupplyPoint = {
  id: string;
  name: string;
  category: ResupplyCategory;
  location?: TripBuilderCoordinate | null;
  routeMileMarker?: number | null;
  distanceFromRouteMiles?: number | null;
  distanceFromStartMiles?: number | null;
  distanceFromEndMiles?: number | null;
  reliability?: TripBuilderConfidence | null;
  source?: string | null;
  notes?: string[] | null;
  accessStatus?: 'accessible' | 'inaccessible' | 'unknown' | null;
  placeIdentity?: string | null;
  categoryCoverage?: Array<'fuel' | 'food_supplies'> | null;
  selectionState?: 'operator_selected' | 'route_context_selected' | 'candidate' | 'route_waypoint' | null;
  approachEvidence?: {
    rank: number | null;
    score: number | null;
    progressRatio: number | null;
    distanceFromOriginMiles: number | null;
    distanceBeforeTrailheadMiles: number | null;
    distanceBeforeRemoteEntryMiles: number | null;
    corridorOffsetMiles: number | null;
    detourDistanceMiles: number | null;
    detourDurationMinutes: number | null;
    detourSource: 'provider_route' | 'corridor_offset_estimate' | 'unavailable';
    routeAwareConfidence: TripBuilderConfidence;
    beforeTrailhead: boolean | null;
    beforeRemoteEntry: boolean | null;
    remoteEntrySource: string;
    remoteEntryEstimated: boolean;
    operatingStatus: 'open' | 'closed' | 'temporarily_closed' | 'unknown';
  } | null;
};

export type ResupplyRecommendation = {
  id: string;
  category: ResupplyCategory;
  message: string;
  pointId?: string | null;
};

export type ResupplyWarning = {
  id: string;
  category: ResupplyCategory;
  message: string;
  severity: 'watch' | 'caution' | 'critical';
};

export type ResupplyCategoryPlan = {
  category: ResupplyCategory;
  status: ResupplyStatus;
  confidence: TripBuilderConfidence;
  primaryRecommendation: string;
  keyPoint: ResupplyPoint | null;
  keyDistanceMiles: number | null;
  warnings: ResupplyWarning[];
  recommendations: ResupplyRecommendation[];
};

export type FuelPlan = ResupplyCategoryPlan & {
  category: 'fuel';
  estimatedMinimumRangeMiles: number | null;
  vehicleRangeMiles: number | null;
  rangeMarginMiles: number | null;
  nearestFuelBeforeStart: ResupplyPoint | null;
  lastReliableFuelBeforeRemoteSection: ResupplyPoint | null;
  nearestFuelAfterExit: ResupplyPoint | null;
};

export type WaterPlan = ResupplyCategoryPlan & {
  category: 'water';
  knownWaterRefillPoints: ResupplyPoint[];
};

export type SupplyPlan = ResupplyCategoryPlan & {
  category: 'food_supplies';
  knownSupplyPoints: ResupplyPoint[];
};

export type RepairAccessPlan = ResupplyCategoryPlan & {
  category: 'repair';
  knownRepairPoints: ResupplyPoint[];
  nearestPavedExit: ExitPoint | null;
};

export type MedicalAccessPlan = ResupplyCategoryPlan & {
  category: 'medical';
  knownMedicalPoints: ResupplyPoint[];
};

export type ExitAccessPlan = ResupplyCategoryPlan & {
  category: 'exit_access';
  knownExitCount: number;
  primaryExitPoint: ExitPoint | null;
};

export type SmartResupplyPlan = {
  generatedAt: string;
  sourceSummary: string[];
  fuel: FuelPlan;
  water: WaterPlan;
  supplies: SupplyPlan;
  repair: RepairAccessPlan;
  medical: MedicalAccessPlan;
  exitAccess: ExitAccessPlan;
  overallStatus: ResupplyStatus;
  warnings: ResupplyWarning[];
  recommendations: ResupplyRecommendation[];
};

export type TripPlan = {
  id: string;
  generatedAt: string;
  route: TripPlanRouteSummary;
  tripType: TripType;
  timeWindow: TimeWindow;
  groupType: GroupType;
  priorities: TripPriority[];
  estimate: TripEstimate;
  recommendedDeparture: string | null;
  suggestedStops: TripPlanStop[];
  segments: TripPlanSegment[];
  primaryCampCandidate: CampCandidate | null;
  backupCampCandidate: CampCandidate | null;
  primaryExitPoint: ExitPoint | null;
  notes: TripBuilderNote[];
  warnings: TripBuilderWarning[];
  readinessReference: TripBuilderReadinessReference | null;
  smartResupplyPlan: SmartResupplyPlan | null;
  lifecycle?: ECSJourneyLinkage;
};

export type BuildTripPlanArgs = {
  route: TripBuilderRouteInput;
  input: TripBuilderInput;
  vehicleProfile?: TripBuilderVehicleProfile | null;
  readiness?: TripBuilderReadinessReference | null;
  campsiteCandidates?: CampCandidate[] | null;
  exitPoints?: ExitPoint[] | null;
  referencePoints?: TripPlanReferencePoint[] | null;
  resupplyPoints?: ResupplyPoint[] | null;
  availablePoiData?: ResupplyPoint[] | null;
  routeContext?: TripBuilderRouteContextInput | null;
  currentLocation?: TripBuilderCoordinate | null;
  capturedAt?: string;
};

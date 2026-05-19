import type { ExploreRouteReadinessSummary } from '../readiness/exploreRouteReadiness';

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

export type TripBuilderCoordinate = {
  latitude: number;
  longitude: number;
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
  trailGeometry?: unknown;
  geojson?: unknown;
  waypoints?: unknown[];
  segments?: unknown[];
  routeMetadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type TripBuilderVehicleProfile = {
  id?: string | null;
  label?: string | null;
  vehicleType?: string | null;
  rangeMiles?: number | null;
  payloadRemainingLbs?: number | null;
  clearanceInches?: number | null;
  tireSizeInches?: number | null;
  trailerAttached?: boolean | null;
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
  notes?: string[];
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
};

export type BuildTripPlanArgs = {
  route: TripBuilderRouteInput;
  input: TripBuilderInput;
  vehicleProfile?: TripBuilderVehicleProfile | null;
  readiness?: TripBuilderReadinessReference | null;
  campsiteCandidates?: CampCandidate[] | null;
  exitPoints?: ExitPoint[] | null;
  resupplyPoints?: ResupplyPoint[] | null;
  availablePoiData?: ResupplyPoint[] | null;
  currentLocation?: TripBuilderCoordinate | null;
  capturedAt?: string;
};

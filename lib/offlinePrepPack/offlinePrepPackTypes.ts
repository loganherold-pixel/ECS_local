import type {
  CampCandidate,
  ExitPoint,
  ResupplyPoint,
  SmartResupplyPlan,
  TripBuilderReadinessReference,
  TripBuilderRouteInput,
  TripBuilderVehicleProfile,
  TripItinerary,
  TripPlan,
} from '../tripBuilder';
import type { ECSJourneyLinkage } from '../lifecycle/routeTripExpeditionLifecycle';
import type { RoadNavRoute } from '../mapboxRoadNavigation';
import type { MapStyleKey } from '../mapStyleIdentity';
import type { OfflineReadinessManifest } from './offlineReadinessManifest';

export type OfflinePrepPackItemType =
  | 'offline_map'
  | 'critical_offline_segments'
  | 'route_line'
  | 'waypoints'
  | 'campsites'
  | 'exit_points'
  | 'resupply_points'
  | 'emergency_points'
  | 'vehicle_readiness_summary'
  | 'trip_itinerary'
  | 'approach_route'
  | 'road_turn_guidance'
  | 'trailhead'
  | 'trail_route'
  | 'trail_waypoints'
  | 'bailout_points'
  | 'pre_trail_stops'
  | 'trail_end'
  | 'exit_route'
  | 'smart_resupply_summary'
  | 'weather_snapshot'
  | 'remoteness_snapshot'
  | 'sunlight_window'
  | 'elevation_snapshot'
  | 'emergency_notes'
  | 'missing_data_warnings'
  | 'gpx_export'
  | 'trip_sheet';

export type OfflinePrepPackStatus =
  | 'not_started'
  | 'preparing'
  | 'downloading'
  | 'ready'
  | 'partially_ready'
  | 'failed'
  | 'unavailable';

export type OfflinePrepPackItemAvailability =
  | 'available'
  | 'unavailable'
  | 'already_cached'
  | 'pending_download'
  | 'not_set'
  | 'failed';

export type OfflinePrepPackError = {
  id: string;
  itemType?: OfflinePrepPackItemType | null;
  message: string;
  recoverable: boolean;
};

export type OfflinePrepPackProgress = {
  status: OfflinePrepPackStatus;
  totalItems: number;
  readyItems: number;
  unavailableItems: number;
  failedItems: number;
  percent: number;
};

export type OfflinePrepPackBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  corridorMiles: number;
};

export type OfflinePrepPackItem = {
  id: string;
  type: OfflinePrepPackItemType;
  label: string;
  status: OfflinePrepPackStatus;
  availability: OfflinePrepPackItemAvailability;
  required: boolean;
  source: string;
  summary: string;
  count?: number | null;
  estimatedSizeMB?: number | null;
  cacheKey?: string | null;
  error?: OfflinePrepPackError | null;
  metadata?: Record<string, unknown> | null;
};

export type OfflinePrepCriticalMapSegment = {
  id: string;
  label: string;
  signal: 'dead' | 'weak';
  reason: string;
  bounds: OfflinePrepPackBounds;
  coordinates: Array<{ latitude: number; longitude: number }>;
  routePointCount: number;
  tileCount: number;
  estimatedSizeMB: number;
  zoomMin: number;
  zoomMax: number;
};

export type OfflinePrepPackManifest = {
  schemaVersion: number;
  id: string;
  generatedAt: string;
  routeId: string;
  routeName: string;
  routeBounds: OfflinePrepPackBounds | null;
  items: OfflinePrepPackItem[];
  progress: OfflinePrepPackProgress;
  errors: OfflinePrepPackError[];
  tripPlanId: string | null;
  routeAssetId: string | null;
  lifecycle: ECSJourneyLinkage;
  readinessManifest: OfflineReadinessManifest;
};

export type OfflinePrepPack = {
  id: string;
  status: OfflinePrepPackStatus;
  manifest: OfflinePrepPackManifest;
  createdAt: string;
  updatedAt: string;
};

export type OfflinePrepPackInput = {
  route: TripBuilderRouteInput;
  /** Exact base-map style included in the offline route package. */
  mapStyleKey?: MapStyleKey | null;
  /** Provider-normalized road approach, including ordered steps and legs. */
  preparedRoadRoute?: RoadNavRoute | null;
  preparedRoadRouteUnavailableReason?: string | null;
  itinerary?: TripItinerary | null;
  tripPlan?: TripPlan | null;
  smartResupplyPlan?: SmartResupplyPlan | null;
  vehicleProfile?: TripBuilderVehicleProfile | null;
  readiness?: TripBuilderReadinessReference | null;
  campsiteCandidates?: CampCandidate[] | null;
  exitPoints?: ExitPoint[] | null;
  resupplyPoints?: ResupplyPoint[] | null;
  emergencyPoints?: ResupplyPoint[] | null;
  weatherSnapshot?: Record<string, unknown> | null;
  remotenessSnapshot?: Record<string, unknown> | null;
  sunlightWindow?: Record<string, unknown> | null;
  elevationSnapshot?: Record<string, unknown> | null;
  emergencyNotes?: Array<string | Record<string, unknown>> | string | Record<string, unknown> | null;
  capturedAt?: string;
};

export type OfflinePrepPackFromItineraryInput = {
  itinerary: TripItinerary;
  /** Exact base-map style included in the offline route package. */
  mapStyleKey?: MapStyleKey | null;
  /** Provider-normalized road approach, including ordered steps and legs. */
  preparedRoadRoute?: RoadNavRoute | null;
  preparedRoadRouteUnavailableReason?: string | null;
  weatherSnapshot?: Record<string, unknown> | null;
  remotenessSnapshot?: Record<string, unknown> | null;
  sunlightWindow?: Record<string, unknown> | null;
  elevationSnapshot?: Record<string, unknown> | null;
  emergencyNotes?: Array<string | Record<string, unknown>> | string | Record<string, unknown> | null;
  capturedAt?: string;
};

export type OfflineMapPreparationResult = {
  supported: boolean;
  status: OfflinePrepPackStatus;
  availability: OfflinePrepPackItemAvailability;
  summary: string;
  estimatedSizeMB?: number | null;
  cacheKey?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type OfflineMapPreparationAdapter = {
  prepareRouteRegion(input: {
    routeId: string;
    routeName: string;
    bounds: OfflinePrepPackBounds | null;
    routePointCount: number;
    styleKey: MapStyleKey;
  }): OfflineMapPreparationResult;
};

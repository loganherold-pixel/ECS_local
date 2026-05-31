export type RouteContextStatus =
  | 'idle'
  | 'queued'
  | 'resolving_trailhead'
  | 'finding_supplies'
  | 'building_geometry'
  | 'ready'
  | 'partial'
  | 'stale'
  | 'error';

export type TrailheadAnchorSource =
  | 'user_selected_trailhead'
  | 'explicit_trailhead'
  | 'explicit_start_coordinate'
  | 'geometry_first_point'
  | 'geometry_endpoint'
  | 'poi_coordinate'
  | 'centroid_fallback'
  | 'unknown';

export type SupplyMode = 'none' | 'gas' | 'grocery' | 'gas_and_grocery';

export type SupplyCandidateCategory = 'gas' | 'grocery';

export type RouteContextWarningCode =
  | 'missing_origin'
  | 'missing_trail_geometry'
  | 'fallback_trailhead_used'
  | 'no_supply_candidates_found'
  | 'provider_unavailable'
  | 'partial_route_geometry'
  | 'stale_cached_context'
  | 'invalid_coordinate'
  | 'invalid_user_selected_trailhead'
  | 'user_selected_trailhead_missing_coordinates'
  | 'poor_category_match'
  | 'closed_supply_candidate'
  | 'excessive_detour'
  | 'excessive_refuel_detour'
  | 'refuel_far_from_trailhead'
  | 'refuel_drive_distance_unavailable'
  | 'resupply_far_from_refuel'
  | 'resupply_drive_distance_unavailable'
  | 'no_resupply_near_refuel'
  | 'rural_resupply_fallback_used'
  | 'supply_chain_excessive_detour'
  | 'supply_chain_rural_fallback'
  | 'supply_chain_partial'
  | 'supply_chain_provider_distance_estimated'
  | 'missing_route_geometry'
  | 'unknown_camp_access'
  | 'unknown_camp_legal_status'
  | 'unknown_camp_restrictions'
  | 'no_bailout_candidates_found'
  | 'unknown_bailout_reachability'
  | 'unverified_bailout_support';

export const ROUTE_CONTEXT_WARNING_CODES: readonly RouteContextWarningCode[] = [
  'missing_origin',
  'missing_trail_geometry',
  'fallback_trailhead_used',
  'no_supply_candidates_found',
  'provider_unavailable',
  'partial_route_geometry',
  'stale_cached_context',
  'invalid_coordinate',
  'invalid_user_selected_trailhead',
  'user_selected_trailhead_missing_coordinates',
  'poor_category_match',
  'closed_supply_candidate',
  'excessive_detour',
  'excessive_refuel_detour',
  'refuel_far_from_trailhead',
  'refuel_drive_distance_unavailable',
  'resupply_far_from_refuel',
  'resupply_drive_distance_unavailable',
  'no_resupply_near_refuel',
  'rural_resupply_fallback_used',
  'supply_chain_excessive_detour',
  'supply_chain_rural_fallback',
  'supply_chain_partial',
  'supply_chain_provider_distance_estimated',
  'missing_route_geometry',
  'unknown_camp_access',
  'unknown_camp_legal_status',
  'unknown_camp_restrictions',
  'no_bailout_candidates_found',
  'unknown_bailout_reachability',
  'unverified_bailout_support',
] as const;

export type RouteContextProviderMetadata = Record<string, unknown>;

export type Confidence = {
  value: number;
  reasons: string[];
};

export type RouteContextWarning = {
  code: RouteContextWarningCode;
  message: string;
  severity?: 'info' | 'watch' | 'caution' | 'critical';
  source?: string | null;
};

export type RouteContextCoordinate = {
  lat: number;
  lng: number;
  label?: string | null;
};

export type TrailheadAnchor = {
  lat: number;
  lng: number;
  label?: string | null;
  source: TrailheadAnchorSource;
  confidence: Confidence;
  warnings: RouteContextWarning[];
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type SupplyCandidate = {
  id: string;
  providerPlaceId?: string | null;
  category: SupplyCandidateCategory;
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  distanceToTrailheadMeters?: number | null;
  distanceToSupplyChainAnchorMeters?: number | null;
  distanceToRefuelMeters?: number | null;
  driveDistanceToTrailheadMeters?: number | null;
  driveDurationToTrailheadSeconds?: number | null;
  driveDistanceToRefuelMeters?: number | null;
  driveDurationToRefuelSeconds?: number | null;
  detourDistanceMeters?: number | null;
  detourDurationSeconds?: number | null;
  approachScore?: number | null;
  trailheadProximityScore?: number | null;
  refuelAdjacencyScore?: number | null;
  supplyChainScore?: number | null;
  openStatus?: 'open' | 'closed' | 'temporarily_closed' | 'unknown' | null;
  rating?: number | null;
  confidence: Confidence;
  score: number;
  warnings: RouteContextWarning[];
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type SupplyPlanStop = {
  candidateId: string;
  category: SupplyCandidateCategory;
  sequence: number;
};

export type SupplyApproachChainStopRole = 'origin' | 'refuel' | 'resupply' | 'trailhead' | 'route_endpoint';

export type SupplyApproachChainStop = {
  role: SupplyApproachChainStopRole;
  sequence: number;
  coordinate: RouteContextCoordinate | null;
  candidateId?: string | null;
  category?: SupplyCandidateCategory | null;
};

export type SupplyApproachChain = {
  enabled: boolean;
  orderedStops: SupplyApproachChainStop[];
  anchorStrategy: 'trailhead_anchored' | 'legacy_independent';
};

export type SupplyPlan = {
  mode: SupplyMode;
  gasCandidate?: SupplyCandidate | null;
  groceryCandidate?: SupplyCandidate | null;
  orderedStops: SupplyPlanStop[];
  approachChain?: SupplyApproachChain | null;
  score: number;
  confidence: Confidence;
  warnings: RouteContextWarning[];
};

export type RouteGeometryBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type RouteGeometryCorridor = {
  widthMeters: number;
  bbox?: RouteGeometryBounds | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type RouteGeometrySegment = {
  id: string;
  start: RouteContextCoordinate;
  end: RouteContextCoordinate;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type RouteGeometry = {
  origin?: RouteContextCoordinate | null;
  destination: RouteContextCoordinate;
  waypoints: RouteContextCoordinate[];
  encodedPolyline?: string | null;
  coordinates?: RouteContextCoordinate[] | null;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  bbox?: RouteGeometryBounds | null;
  corridor?: RouteGeometryCorridor | null;
  segments: RouteGeometrySegment[];
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type CampCandidate = {
  id: string;
  name?: string | null;
  lat: number;
  lng: number;
  source: string;
  distanceFromRouteMeters?: number | null;
  distanceFromTrailheadMeters?: number | null;
  accessStatus?: 'open' | 'closed' | 'restricted' | 'unknown' | null;
  legalStatus?: 'explicitly_allowed' | 'not_allowed' | 'permit_required' | 'restricted' | 'unknown' | null;
  restrictionStatus?: string | null;
  score?: number | null;
  confidence: Confidence;
  warnings: RouteContextWarning[];
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type BailoutCandidate = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  source: string;
  category?: 'road_access' | 'return_to_start' | 'town' | 'fuel' | 'ranger_station' | 'visitor_center' | 'medical' | 'support' | 'unknown' | null;
  routeMileMarker?: number | null;
  distanceFromRouteMeters?: number | null;
  distanceFromTrailheadMeters?: number | null;
  driveTimeToSafetySeconds?: number | null;
  reachableByVehicle?: boolean | null;
  score?: number | null;
  confidence: Confidence;
  warnings: RouteContextWarning[];
  providerMetadata?: RouteContextProviderMetadata | null;
};

export type RouteContext = {
  id: string;
  trailId: string;
  tripId?: string | null;
  userId?: string | null;
  origin?: RouteContextCoordinate | null;
  trailheadAnchor: TrailheadAnchor;
  selectedSupplyMode?: SupplyMode | null;
  supplyCandidates: SupplyCandidate[];
  selectedSupplyPlan?: SupplyPlan | null;
  routeGeometry: RouteGeometry | null;
  campCandidates: CampCandidate[];
  bailoutCandidates: BailoutCandidate[];
  confidence: Confidence;
  status: RouteContextStatus;
  warnings: RouteContextWarning[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
  providerMetadata?: RouteContextProviderMetadata | null;
};

export const UNKNOWN_CONFIDENCE: Confidence = {
  value: 0,
  reasons: ['No route context data has been resolved yet.'],
};

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

import type { ExploreRouteTypeStatus } from '../exploreRouteAuthority';
import type {
  GeoPoint,
  ItineraryPreTrailStopBucket,
  ItineraryPreTrailStopBucketStatus,
  TripBuilderRouteInput,
  TripBuilderVehicleProfile,
  TripItinerary,
  TripPlan,
} from './tripBuilderTypes';

export type TripConfidenceCategory =
  | 'high_confidence'
  | 'moderate_confidence'
  | 'low_confidence'
  | 'insufficient_data';

export type TripConfidenceReasonTone = 'positive' | 'watch' | 'caution' | 'critical' | 'neutral';

export type TripConfidenceReasonSection =
  | 'route'
  | 'vehicle'
  | 'logistics'
  | 'environment'
  | 'data';

export type TripConfidenceSectionStatus =
  | 'ready'
  | 'watch'
  | 'caution'
  | 'unknown'
  | 'unavailable'
  | 'stale'
  | 'live';

export type TripConfidenceRecommendedActionId =
  | 'complete_vehicle_profile'
  | 'confirm_route_geometry'
  | 'add_refuel_stop'
  | 'add_resupply_stop'
  | 'review_weather'
  | 'select_camp'
  | 'review_bailout_options'
  | 'proceed_with_caution'
  | 'ready_to_start_trip';

export type TripConfidenceDataAvailability =
  | 'available'
  | 'unknown'
  | 'unavailable'
  | 'stale'
  | 'mock'
  | 'partial'
  | 'live'
  | 'verified';

export type TripConfidenceEnvironmentInput = {
  weather?: {
    status?: TripConfidenceDataAvailability | string | null;
    source?: string | null;
    label?: string | null;
  } | null;
  daylight?: {
    status?: TripConfidenceDataAvailability | 'limited' | string | null;
    remainingMinutes?: number | null;
    label?: string | null;
  } | null;
  remoteness?: {
    status?: TripConfidenceDataAvailability | string | null;
    score?: number | null;
    label?: string | null;
  } | null;
  elevation?: {
    status?: TripConfidenceDataAvailability | string | null;
    label?: string | null;
  } | null;
};

export type TripConfidenceTelemetryInput = {
  status?: TripConfidenceDataAvailability | string | null;
  source?: string | null;
  updatedAt?: string | null;
  label?: string | null;
};

export type TripConfidenceInput = {
  itinerary?: TripItinerary | null;
  selectedRoute?: TripBuilderRouteInput | null;
  vehicleProfile?: TripBuilderVehicleProfile | null;
  plan?: TripPlan | null;
  environment?: TripConfidenceEnvironmentInput | null;
  telemetry?: TripConfidenceTelemetryInput | null;
};

export type TripConfidenceReason = {
  id: string;
  label: string;
  tone: TripConfidenceReasonTone;
  section: TripConfidenceReasonSection;
};

export type TripConfidenceSection = {
  key: TripConfidenceReasonSection;
  title: string;
  status: TripConfidenceSectionStatus;
  summary: string;
  reasons: TripConfidenceReason[];
};

export type TripConfidenceRouteSummary = {
  routeId: string | null;
  routeName: string | null;
  status: ExploreRouteTypeStatus;
  authorityLabel: string;
  geometryStatus: TripItinerary['routeGeometryStatus'] | 'unknown';
  geometrySource: string | null;
  geometryValid: boolean;
  trailheadCoordinate: GeoPoint | null;
  distanceMiles: number | null;
};

export type TripConfidenceRecommendedAction = {
  id: TripConfidenceRecommendedActionId;
  label: string;
};

export type TripConfidenceSummaryViewModel = {
  category: TripConfidenceCategory;
  label: string;
  score: number | null;
  headline: string;
  keyWarnings: string[];
  route: TripConfidenceRouteSummary;
  reasons: TripConfidenceReason[];
  sections: TripConfidenceSection[];
  recommendedAction: TripConfidenceRecommendedAction;
  metadata: {
    criticalMissingCount: number;
    providerUnavailable: boolean;
    refuelAnchorsResupply: boolean;
    telemetryStatus: string;
    weatherStatus: string;
  };
};

const PRE_TRAIL_BUCKETS: ItineraryPreTrailStopBucket[] = ['fuel', 'grocery', 'water', 'generalSupply'];
const ROUTE_STATUSES = new Set<ExploreRouteTypeStatus>([
  'trailhead_guidance',
  'trail_route',
  'expedition_itinerary',
  'demo_fixture',
  'preview_geometry',
  'imported_geometry',
  'live_verified_geometry',
  'unknown',
]);

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function positiveNumber(value: unknown): number | null {
  const numeric = finiteNumber(value);
  return numeric != null && numeric > 0 ? numeric : null;
}

function cleanText(value: unknown): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function token(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function routeMetadata(route: TripBuilderRouteInput | null | undefined): Record<string, unknown> {
  if (!route) return {};
  const metadata = route.routeMetadata ?? (route as Record<string, unknown>).route_metadata;
  return isRecord(metadata) ? metadata : {};
}

function metadataValue(
  route: TripBuilderRouteInput | null | undefined,
  key: string,
  itinerary?: TripItinerary | null,
): unknown {
  const metadata = routeMetadata(route);
  const itineraryMetadata = isRecord(itinerary?.metadata) ? itinerary?.metadata as Record<string, unknown> : {};
  return metadata[key] ?? route?.[key] ?? itineraryMetadata[key];
}

function routeStatus(route: TripBuilderRouteInput | null | undefined, itinerary?: TripItinerary | null): ExploreRouteTypeStatus {
  const value = token(
    metadataValue(route, 'routeTypeStatus', itinerary) ??
      metadataValue(route, 'route_type_status', itinerary) ??
      metadataValue(route, 'routeAuthorityStatus', itinerary),
  );
  return ROUTE_STATUSES.has(value as ExploreRouteTypeStatus) ? value as ExploreRouteTypeStatus : 'unknown';
}

function routeAuthorityLabel(status: ExploreRouteTypeStatus, route: TripBuilderRouteInput | null | undefined, itinerary?: TripItinerary | null): string {
  const explicit = cleanText(
    metadataValue(route, 'routeAuthorityLabel', itinerary) ??
      metadataValue(route, 'authorityLabel', itinerary) ??
      metadataValue(route, 'routeAuthoritySource', itinerary),
  );
  if (explicit) return explicit;

  switch (status) {
    case 'live_verified_geometry':
      return 'ECS Validated';
    case 'imported_geometry':
      return 'Imported Geometry';
    case 'trail_route':
      return 'Trail Route';
    case 'expedition_itinerary':
      return 'Expedition Itinerary';
    case 'trailhead_guidance':
      return 'Trailhead Guidance';
    case 'demo_fixture':
      return 'Demo Fixture';
    case 'preview_geometry':
      return 'Preview Geometry';
    default:
      return 'Unknown Route Authority';
  }
}

function coordinateFromValue(value: unknown): GeoPoint | null {
  if (Array.isArray(value)) {
    const longitude = finiteNumber(value[0]);
    const latitude = finiteNumber(value[1]);
    return latitude != null && longitude != null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
      ? { latitude, longitude }
      : null;
  }

  if (!isRecord(value)) return null;
  const latitude = finiteNumber(value.latitude ?? value.lat ?? value.y);
  const longitude = finiteNumber(value.longitude ?? value.lng ?? value.lon ?? value.x);
  return latitude != null && longitude != null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}

function routeTrailhead(route: TripBuilderRouteInput | null | undefined, itinerary?: TripItinerary | null): GeoPoint | null {
  if (itinerary?.trailheadStart?.coordinate) return itinerary.trailheadStart.coordinate;
  const startLat = finiteNumber(route?.startLat ?? (route as Record<string, unknown> | undefined)?.start_lat);
  const startLng = finiteNumber(route?.startLng ?? (route as Record<string, unknown> | undefined)?.start_lng);
  if (startLat != null && startLng != null && Math.abs(startLat) <= 90 && Math.abs(startLng) <= 180) {
    return { latitude: startLat, longitude: startLng };
  }
  return coordinateFromValue(route?.coordinate ?? route?.destinationCoordinate ?? route?.endpointCoordinate ?? route?.endCoordinate);
}

function routeDistance(route: TripBuilderRouteInput | null | undefined, itinerary?: TripItinerary | null): number | null {
  return positiveNumber(route?.distanceMiles) ??
    positiveNumber(route?.total_distance_miles) ??
    positiveNumber(route?.distance_mi) ??
    positiveNumber(itinerary?.trailRoute?.distanceMiles) ??
    positiveNumber(itinerary?.approachRoute?.distanceMiles) ??
    positiveNumber(itinerary?.fuelRangeConfidence?.estimatedTotalDistance);
}

function geometrySource(route: TripBuilderRouteInput | null | undefined, itinerary?: TripItinerary | null): string | null {
  return cleanText(
    metadataValue(route, 'geometrySource', itinerary) ??
      metadataValue(route, 'geometry_source', itinerary) ??
      itinerary?.trailRoute?.source?.label ??
      itinerary?.approachRoute?.source?.label,
  );
}

function routeHasGeometry(route: TripItinerary['trailRoute'] | undefined | null): boolean {
  if (!route) return false;
  if ((route.geometry?.length ?? 0) >= 2) return true;
  return (route.segments ?? []).some((segment) => (segment.geometry?.length ?? 0) >= 2);
}

function preTrailStops(itinerary: TripItinerary | null | undefined, bucket: ItineraryPreTrailStopBucket) {
  return itinerary?.preTrailStops?.[bucket] ?? [];
}

function hasPreTrailStatus(
  itinerary: TripItinerary | null | undefined,
  statuses: ItineraryPreTrailStopBucketStatus[],
): boolean {
  return (itinerary?.preTrailStopStatus ?? []).some((summary) => statuses.includes(summary.status));
}

function selectedPreTrailStopCount(itinerary: TripItinerary | null | undefined): number {
  return PRE_TRAIL_BUCKETS.reduce((count, bucket) => count + preTrailStops(itinerary, bucket).length, 0);
}

function hasRoute(route: TripBuilderRouteInput | null | undefined, itinerary: TripItinerary | null | undefined): boolean {
  return !!cleanText(route?.id ?? route?.name ?? route?.title ?? itinerary?.routeId ?? itinerary?.sourceRouteId ?? itinerary?.title);
}

function hasCompleteVehicleProfile(vehicleProfile: TripBuilderVehicleProfile | null | undefined): boolean {
  if (!vehicleProfile) return false;
  return Boolean(
    cleanText(vehicleProfile.label ?? vehicleProfile.id) &&
      cleanText(vehicleProfile.vehicleType) &&
      (
        positiveNumber(vehicleProfile.rangeMiles) != null ||
        (
          positiveNumber(vehicleProfile.fuelTankCapacityGal) != null &&
          positiveNumber(vehicleProfile.avgMpg) != null
        )
      ),
  );
}

function vehicleHasRange(vehicleProfile: TripBuilderVehicleProfile | null | undefined, itinerary: TripItinerary | null | undefined): boolean {
  return positiveNumber(vehicleProfile?.rangeMiles) != null ||
    positiveNumber(vehicleProfile?.fuelTankCapacityGal) != null ||
    positiveNumber(itinerary?.fuelRangeConfidence?.knownFuelRange) != null ||
    itinerary?.fuelRangeConfidence?.fuelStatus === 'sufficient';
}

function normalizedAvailability(value: unknown): string {
  const normalized = token(value);
  if (!normalized) return 'unknown';
  if (normalized === 'not_available' || normalized === 'none' || normalized === 'missing') return 'unavailable';
  if (normalized === 'cache' || normalized === 'cached') return 'available';
  return normalized;
}

function addReason(
  reasons: TripConfidenceReason[],
  id: string,
  label: string,
  tone: TripConfidenceReasonTone,
  section: TripConfidenceReasonSection,
): void {
  if (reasons.some((reason) => reason.id === id || reason.label === label)) return;
  reasons.push({ id, label, tone, section });
}

function statusSeverity(status: TripConfidenceSectionStatus): number {
  switch (status) {
    case 'unavailable':
      return 5;
    case 'caution':
      return 4;
    case 'stale':
      return 3;
    case 'watch':
      return 2;
    case 'unknown':
      return 1;
    case 'live':
    case 'ready':
    default:
      return 0;
  }
}

function worstStatus(statuses: TripConfidenceSectionStatus[]): TripConfidenceSectionStatus {
  return statuses.reduce((worst, current) => (
    statusSeverity(current) > statusSeverity(worst) ? current : worst
  ), 'ready' as TripConfidenceSectionStatus);
}

function sectionSummary(reasons: TripConfidenceReason[], fallback: string): string {
  const issue = reasons.find((reason) => reason.tone === 'critical' || reason.tone === 'caution' || reason.tone === 'watch');
  return issue?.label ?? reasons[0]?.label ?? fallback;
}

function categoryFrom(score: number, insufficient: boolean): TripConfidenceCategory {
  if (insufficient) return 'insufficient_data';
  if (score >= 80) return 'high_confidence';
  if (score >= 60) return 'moderate_confidence';
  if (score >= 35) return 'low_confidence';
  return 'insufficient_data';
}

export function tripConfidenceLabel(category: TripConfidenceCategory): string {
  switch (category) {
    case 'high_confidence':
      return 'High Confidence';
    case 'moderate_confidence':
      return 'Moderate Confidence';
    case 'low_confidence':
      return 'Low Confidence';
    case 'insufficient_data':
    default:
      return 'Insufficient Data';
  }
}

function actionLabel(id: TripConfidenceRecommendedActionId): string {
  switch (id) {
    case 'complete_vehicle_profile':
      return 'Complete vehicle profile';
    case 'confirm_route_geometry':
      return 'Confirm route geometry';
    case 'add_refuel_stop':
      return 'Add or refine refuel stop';
    case 'add_resupply_stop':
      return 'Add or refine resupply stop';
    case 'review_weather':
      return 'Review weather';
    case 'select_camp':
      return 'Select camp';
    case 'review_bailout_options':
      return 'Review bailout options';
    case 'ready_to_start_trip':
      return 'Ready to start trip';
    case 'proceed_with_caution':
    default:
      return 'Proceed with caution';
  }
}

function recommendedAction(args: {
  category: TripConfidenceCategory;
  hasVehicle: boolean;
  hasVehicleRange: boolean;
  routeGeometryMissing: boolean;
  routePreviewOrDemo: boolean;
  refuelMissing: boolean;
  resupplyMissing: boolean;
  weatherUnknown: boolean;
  campMissing: boolean;
  bailoutMissing: boolean;
}): TripConfidenceRecommendedAction {
  let id: TripConfidenceRecommendedActionId = 'proceed_with_caution';

  if (!args.hasVehicle || !args.hasVehicleRange) id = 'complete_vehicle_profile';
  else if (args.routeGeometryMissing || args.routePreviewOrDemo) id = 'confirm_route_geometry';
  else if (args.refuelMissing) id = 'add_refuel_stop';
  else if (args.resupplyMissing) id = 'add_resupply_stop';
  else if (args.weatherUnknown) id = 'review_weather';
  else if (args.campMissing) id = 'select_camp';
  else if (args.bailoutMissing) id = 'review_bailout_options';
  else if (args.category === 'high_confidence') id = 'ready_to_start_trip';

  return { id, label: actionLabel(id) };
}

export function getTripConfidenceSummary(input: TripConfidenceInput): TripConfidenceSummaryViewModel {
  const itinerary = input.itinerary ?? null;
  const route = input.selectedRoute ?? null;
  const status = routeStatus(route, itinerary);
  const authorityLabel = routeAuthorityLabel(status, route, itinerary);
  const trailheadCoordinate = routeTrailhead(route, itinerary);
  const geometryStatus = itinerary?.routeGeometryStatus ?? route?.routeGeometryStatus ?? 'unknown';
  const hasTrailGeometry = routeHasGeometry(itinerary?.trailRoute);
  const hasApproachGeometry = routeHasGeometry(itinerary?.approachRoute);
  const geometryValid = hasTrailGeometry || (geometryStatus === 'approach_only' && hasApproachGeometry);
  const sourceLabel = geometrySource(route, itinerary);
  const distanceMiles = routeDistance(route, itinerary);
  const routePresent = hasRoute(route, itinerary);
  const fuelStops = preTrailStops(itinerary, 'fuel');
  const groceryStops = preTrailStops(itinerary, 'grocery');
  const providerUnavailable = hasPreTrailStatus(itinerary, ['provider_unavailable', 'provider_pending', 'missing_anchor']);
  const providerNoResults = hasPreTrailStatus(itinerary, ['no_results']);
  const fuelStatus = itinerary?.fuelRangeConfidence?.fuelStatus ?? 'unknown';
  const routeDistanceRequiresFuel = (distanceMiles ?? 0) >= 80 || fuelStatus === 'recommended' || fuelStatus === 'critical' || fuelStatus === 'unknown';
  const hasRefuel = fuelStops.length > 0;
  const hasResupply = groceryStops.length > 0 || preTrailStops(itinerary, 'water').length > 0 || preTrailStops(itinerary, 'generalSupply').length > 0;
  const refuelAnchorsResupply = hasRefuel && groceryStops.some((stop) => cleanText(stop.metadata?.resupplyAnchorStopId) === fuelStops[0]?.id);
  const hasCamp = Boolean(input.plan?.primaryCampCandidate) || (itinerary?.trailWaypoints ?? []).some((waypoint) => waypoint.type === 'camp_potential');
  const hasBailout = Boolean(input.plan?.primaryExitPoint) || (itinerary?.trailWaypoints ?? []).some((waypoint) => waypoint.type === 'bailout');
  const weatherStatus = normalizedAvailability(input.environment?.weather?.status);
  const daylightStatus = normalizedAvailability(input.environment?.daylight?.status);
  const remotenessStatus = normalizedAvailability(input.environment?.remoteness?.status ?? (route?.remotenessScore != null ? 'available' : null));
  const telemetryStatus = normalizedAvailability(input.telemetry?.status);
  const reasons: TripConfidenceReason[] = [];
  let score = 50;
  let criticalMissingCount = 0;

  if (routePresent) {
    score += 6;
  } else {
    score -= 22;
    criticalMissingCount += 1;
    addReason(reasons, 'route_missing', 'Selected route missing', 'critical', 'route');
  }

  if (trailheadCoordinate) {
    score += 8;
    addReason(reasons, 'trailhead_known', 'Trailhead coordinate known', 'positive', 'route');
  } else {
    score -= 20;
    criticalMissingCount += 1;
    addReason(reasons, 'trailhead_missing', 'Trailhead coordinate missing', 'critical', 'route');
  }

  const routePreviewOrDemo = status === 'preview_geometry' || status === 'demo_fixture';
  const routeTrailheadOnly = status === 'trailhead_guidance';
  const routeGeometryMissing = !hasTrailGeometry || geometryStatus === 'trail_missing' || geometryStatus === 'unknown';
  if (hasTrailGeometry && !routePreviewOrDemo) {
    score += 12;
    addReason(reasons, 'route_geometry_present', 'Route geometry present', 'positive', 'route');
  } else if (routeTrailheadOnly) {
    score -= 14;
    criticalMissingCount += 1;
    addReason(reasons, 'trailhead_only_route', 'Trailhead-only route', 'critical', 'route');
    addReason(reasons, 'route_geometry_missing', 'Route geometry missing', 'critical', 'route');
  } else if (status === 'preview_geometry') {
    score -= 12;
    addReason(reasons, 'preview_geometry', 'Route geometry preview-only', 'caution', 'route');
  } else if (status === 'demo_fixture') {
    score -= 14;
    addReason(reasons, 'demo_route', 'Demo route, not verified', 'caution', 'route');
  } else if (routeGeometryMissing) {
    score -= 18;
    criticalMissingCount += 1;
    addReason(reasons, 'route_geometry_missing', 'Route geometry missing', 'critical', 'route');
  }

  switch (status) {
    case 'live_verified_geometry':
      score += 10;
      addReason(reasons, 'ecs_validated_route', 'ECS Validated route', 'positive', 'route');
      break;
    case 'imported_geometry':
      score += 7;
      addReason(reasons, 'imported_geometry', 'Imported route geometry', 'positive', 'route');
      break;
    case 'trail_route':
    case 'expedition_itinerary':
      score += 5;
      addReason(reasons, 'trail_route', 'Trail route geometry', 'positive', 'route');
      break;
    case 'unknown':
      score -= 6;
      criticalMissingCount += 1;
      addReason(reasons, 'route_authority_unknown', 'Route authority unknown', 'watch', 'route');
      break;
    default:
      break;
  }

  if (distanceMiles != null) {
    score += 3;
    addReason(reasons, 'route_distance_known', 'Route distance estimate available', 'positive', 'route');
  }

  const hasVehicle = !!input.vehicleProfile;
  const completeVehicle = hasCompleteVehicleProfile(input.vehicleProfile);
  const hasVehicleRange = vehicleHasRange(input.vehicleProfile, itinerary);
  if (completeVehicle) {
    score += 12;
    addReason(reasons, 'vehicle_complete', 'Vehicle profile complete', 'positive', 'vehicle');
  } else if (hasVehicle) {
    score += 2;
    addReason(reasons, 'vehicle_incomplete', 'Vehicle profile incomplete', 'caution', 'vehicle');
  } else {
    score -= 18;
    addReason(reasons, 'vehicle_missing', 'Vehicle profile missing', 'critical', 'vehicle');
  }

  if (!hasVehicleRange || fuelStatus === 'unknown') {
    score -= 8;
    addReason(reasons, 'vehicle_range_unknown', 'Vehicle range unknown', 'caution', 'vehicle');
  } else if (fuelStatus === 'critical') {
    score -= 18;
    addReason(reasons, 'fuel_range_critical', 'Fuel range critical', 'critical', 'vehicle');
  } else if (fuelStatus === 'recommended') {
    score -= 4;
    addReason(reasons, 'fuel_stop_recommended', 'Fuel margin needs review', 'watch', 'vehicle');
  } else {
    score += 5;
    addReason(reasons, 'fuel_range_known', 'Vehicle range available', 'positive', 'vehicle');
  }

  if (hasRefuel) {
    score += 7;
    addReason(reasons, 'refuel_found', 'Refuel stop found near trailhead', 'positive', 'logistics');
  } else if (routeDistanceRequiresFuel) {
    score -= providerUnavailable ? 8 : 10;
    addReason(reasons, 'refuel_missing', 'Refuel stop missing', 'caution', 'logistics');
  }

  if (hasResupply) {
    score += 5;
    addReason(reasons, 'resupply_found', refuelAnchorsResupply ? 'Resupply stop found near refuel' : 'Resupply stop found', 'positive', 'logistics');
    if (refuelAnchorsResupply) score += 2;
  } else if (selectedPreTrailStopCount(itinerary) === 0 && providerUnavailable) {
    score -= 5;
  } else {
    score -= 2;
    addReason(reasons, 'resupply_missing', 'Resupply stop missing', 'watch', 'logistics');
  }

  if (providerUnavailable) {
    score -= 8;
    addReason(reasons, 'poi_provider_unavailable', 'POI provider unavailable', 'caution', 'logistics');
  } else if (providerNoResults) {
    score -= 3;
    addReason(reasons, 'poi_provider_empty', 'POI candidate list empty', 'watch', 'logistics');
  }

  if (hasCamp) {
    score += 4;
    addReason(reasons, 'camp_selected', 'Camp selected', 'positive', 'logistics');
  } else {
    score -= 3;
    addReason(reasons, 'camp_not_selected', 'Camp not selected', 'watch', 'logistics');
  }

  if (hasBailout) {
    score += 4;
    addReason(reasons, 'bailout_available', 'Bailout available', 'positive', 'logistics');
  } else {
    score -= 4;
    addReason(reasons, 'bailout_unavailable', 'Bailout unavailable', 'caution', 'logistics');
  }

  if (weatherStatus === 'available' || weatherStatus === 'live' || weatherStatus === 'verified') {
    score += 5;
    addReason(reasons, 'weather_available', 'Weather available', 'positive', 'environment');
  } else if (weatherStatus === 'stale') {
    score -= 4;
    addReason(reasons, 'weather_stale', 'Weather stale', 'watch', 'environment');
  } else {
    score -= 8;
    addReason(reasons, 'weather_unavailable', 'Weather unavailable', 'caution', 'environment');
  }

  if (daylightStatus === 'available' || daylightStatus === 'live' || daylightStatus === 'verified') {
    score += 3;
    addReason(reasons, 'daylight_available', 'Daylight available', 'positive', 'environment');
  } else if (daylightStatus === 'limited') {
    score -= 6;
    addReason(reasons, 'daylight_limited', 'Daylight limited', 'caution', 'environment');
  } else {
    score -= 2;
    addReason(reasons, 'daylight_unknown', 'Daylight unknown', 'watch', 'environment');
  }

  if (remotenessStatus === 'available' || remotenessStatus === 'live' || remotenessStatus === 'verified') {
    score += 2;
    addReason(reasons, 'remoteness_available', 'Remoteness available', 'positive', 'environment');
  } else {
    score -= 3;
    addReason(reasons, 'remoteness_unknown', 'Remoteness unknown', 'watch', 'environment');
  }

  if (telemetryStatus === 'live') {
    score += 2;
    addReason(reasons, 'telemetry_live', 'Telemetry live', 'positive', 'data');
  } else if (telemetryStatus === 'stale') {
    score -= 3;
    addReason(reasons, 'stale_telemetry_ignored', 'Stale telemetry ignored', 'watch', 'data');
  } else if (telemetryStatus === 'mock' || telemetryStatus === 'mocked') {
    score -= 4;
    addReason(reasons, 'mock_telemetry_ignored', 'Mock telemetry ignored', 'caution', 'data');
  } else {
    addReason(reasons, 'telemetry_unavailable', 'Telemetry unavailable', 'neutral', 'data');
  }

  const insufficient = (
    criticalMissingCount >= 3 ||
    (routeTrailheadOnly && routeGeometryMissing) ||
    (!routePresent && !trailheadCoordinate)
  );
  const finalScore = clamp(Math.round(score));
  const uncappedCategory = categoryFrom(finalScore, insufficient);
  const hasVisibleCaution = reasons.some((reason) => reason.tone === 'caution' || reason.tone === 'critical');
  const visibleWatchCount = reasons.filter((reason) => reason.tone === 'watch').length;
  let category =
    uncappedCategory === 'high_confidence' && (hasVisibleCaution || visibleWatchCount >= 2)
      ? 'moderate_confidence'
      : uncappedCategory;
  if (category !== 'insufficient_data' && (!hasVehicle || (!hasVehicleRange && fuelStatus === 'unknown'))) {
    category = 'low_confidence';
  }
  const recommended = recommendedAction({
    category,
    hasVehicle,
    hasVehicleRange,
    routeGeometryMissing,
    routePreviewOrDemo,
    refuelMissing: routeDistanceRequiresFuel && !hasRefuel,
    resupplyMissing: !hasResupply && !providerUnavailable,
    weatherUnknown: weatherStatus !== 'available' && weatherStatus !== 'live' && weatherStatus !== 'verified',
    campMissing: !hasCamp,
    bailoutMissing: !hasBailout,
  });

  const routeReasons = reasons.filter((reason) => reason.section === 'route');
  const vehicleReasons = reasons.filter((reason) => reason.section === 'vehicle');
  const logisticsReasons = reasons.filter((reason) => reason.section === 'logistics');
  const environmentReasons = reasons.filter((reason) => reason.section === 'environment');
  const dataReasons = reasons.filter((reason) => reason.section === 'data');

  const routeSectionStatus: TripConfidenceSectionStatus =
    routeGeometryMissing || routeTrailheadOnly ? 'unavailable' :
    routePreviewOrDemo ? 'caution' :
    status === 'unknown' ? 'unknown' :
    'ready';
  const vehicleSectionStatus: TripConfidenceSectionStatus =
    !hasVehicle ? 'unavailable' :
    !completeVehicle || !hasVehicleRange ? 'caution' :
    'ready';
  const logisticsSectionStatus = worstStatus([
    providerUnavailable || (routeDistanceRequiresFuel && !hasRefuel) ? 'caution' : 'ready',
    !hasCamp || !hasBailout ? 'watch' : 'ready',
  ]);
  const environmentSectionStatus: TripConfidenceSectionStatus =
    weatherStatus === 'unknown' || weatherStatus === 'unavailable'
      ? 'unknown'
      : weatherStatus === 'stale' || daylightStatus === 'limited'
        ? 'watch'
        : 'ready';
  const dataSectionStatus: TripConfidenceSectionStatus =
    telemetryStatus === 'live'
      ? 'live'
      : telemetryStatus === 'stale'
        ? 'stale'
        : telemetryStatus === 'mock' || telemetryStatus === 'mocked'
          ? 'caution'
          : 'unknown';

  const keyWarnings = reasons
    .filter((reason) => reason.tone === 'critical' || reason.tone === 'caution')
    .map((reason) => reason.label)
    .slice(0, 5);

  return {
    category,
    label: tripConfidenceLabel(category),
    score: finalScore,
    headline: `${tripConfidenceLabel(category)} - ${recommended.label}`,
    keyWarnings,
    route: {
      routeId: cleanText(route?.id ?? itinerary?.routeId ?? itinerary?.sourceRouteId),
      routeName: cleanText(route?.name ?? route?.title ?? itinerary?.title),
      status,
      authorityLabel,
      geometryStatus,
      geometrySource: sourceLabel,
      geometryValid,
      trailheadCoordinate,
      distanceMiles,
    },
    reasons,
    sections: [
      {
        key: 'route',
        title: 'Route readiness',
        status: routeSectionStatus,
        summary: sectionSummary(routeReasons, 'Route data unavailable'),
        reasons: routeReasons,
      },
      {
        key: 'vehicle',
        title: 'Vehicle readiness',
        status: vehicleSectionStatus,
        summary: sectionSummary(vehicleReasons, 'Vehicle data unavailable'),
        reasons: vehicleReasons,
      },
      {
        key: 'logistics',
        title: 'Logistics readiness',
        status: logisticsSectionStatus,
        summary: sectionSummary(logisticsReasons, 'Logistics data unavailable'),
        reasons: logisticsReasons,
      },
      {
        key: 'environment',
        title: 'Environment readiness',
        status: environmentSectionStatus,
        summary: sectionSummary(environmentReasons, 'Environment data unavailable'),
        reasons: environmentReasons,
      },
      {
        key: 'data',
        title: 'Data confidence',
        status: dataSectionStatus,
        summary: sectionSummary(dataReasons, 'Telemetry not required for MVP confidence'),
        reasons: dataReasons,
      },
    ],
    recommendedAction: recommended,
    metadata: {
      criticalMissingCount,
      providerUnavailable,
      refuelAnchorsResupply,
      telemetryStatus,
      weatherStatus,
    },
  };
}

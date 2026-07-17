import { haversineDistanceMiles } from '../map/routeGeometryUtils';
import {
  normalizeRouteGeometryLineString,
  routeGeometryLineStringToLatitudeLongitude,
} from '../routeGeometryLifecycle';
import type {
  GeoPoint,
  ItineraryConfidenceSummary,
  ItineraryDataSource,
  ItineraryPhase,
  ItineraryPhaseSummary,
  ItineraryPreTrailProviderState,
  ItineraryPreTrailStopSearchSummary,
  ItineraryPreTrailStops,
  ItineraryRoute,
  ItineraryStop,
  ItineraryWaypoint,
  RouteGeometryStatus,
  RouteSegment,
  SuggestedRoute,
  TripBuilderFuelTelemetry,
  TripBuilderRouteContextInput,
  TripBuilderVehicleProfile,
  TripBuilderConfidence,
  TripBuilderWarning,
  TripFuelRangeConfidence,
  TripItinerary,
} from './tripBuilderTypes';
import { resolveFuelRangeConfidence } from './fuelRangeConfidenceResolver';
import {
  resolvePreTrailStops,
  type PreTrailStopCandidateInput,
  type PreTrailStopBucket,
  type ResolvedPreTrailStops,
  type SelectedPreTrailOption,
} from './preTrailResupplyResolver';
import {
  resolveTrailRouteGeometry,
  type ResolvedTrailRouteGeometry,
} from './trailRouteGeometryResolver';
import { resolveTrailWaypoints } from './trailWaypointIntelligenceResolver';
import { resupplyPlaceIdentityFromMetadata } from './resupplyPlaceIdentity';
import { buildTripBuilderCanonicalRouteSpine } from './tripBuilderCanonicalRouteSpine';
import { routeAllowsLoopGuidance } from '../navigation/routeLoopGuidancePolicy';
import {
  CATALOG_GUIDANCE_JOIN_GAP_MAX_METERS,
  normalizeNavigationGuidanceGeometry,
} from '../navigationCatalogGuidanceGeometry';
import {
  guidanceRouteDistanceMeters,
  orientGuidanceRouteFromStart,
} from '../navigation/guidanceRouteProjection';
import type { RoadNavCoordinate } from '../mapboxRoadNavigation';

export type BuildTripItineraryFromSuggestedRouteArgs = {
  suggestedRoute: SuggestedRoute;
  userLocation?: GeoPoint | null;
  userPreferences?: Record<string, unknown> | null;
  selectedPreTrailOptions?: Partial<Record<PreTrailStopBucket, SelectedPreTrailOption[] | null>> | null;
  preTrailStopCandidates?: PreTrailStopCandidateInput | null;
  preTrailProviderAvailable?: boolean | null;
  preTrailProviderStates?: Partial<Record<PreTrailStopBucket, ItineraryPreTrailProviderState>> | null;
  vehicleProfile?: TripBuilderVehicleProfile | null;
  telemetry?: TripBuilderFuelTelemetry | Record<string, unknown> | null;
  routeContext?: TripBuilderRouteContextInput | null;
  generatedAt?: string;
};

const PRE_TRAIL_BUCKETS: PreTrailStopBucket[] = ['fuel', 'grocery', 'water', 'generalSupply'];

const ITINERARY_PHASE_ORDER: ItineraryPhase[] = [
  'approach',
  'pre_trail_resupply',
  'trailhead',
  'trail_navigation',
  'trail_exit',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const numberValue = typeof value === 'string' ? Number(value) : value;
  return typeof numberValue === 'number' && Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeCoordinate(value: unknown): GeoPoint | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    const longitude = finiteNumber(value[0]);
    const latitude = finiteNumber(value[1]);
    return validPoint(latitude, longitude);
  }

  if (!isRecord(value)) return null;

  if (Array.isArray(value.center)) return normalizeCoordinate(value.center);
  if (value.type === 'Point' && Array.isArray(value.coordinates)) return normalizeCoordinate(value.coordinates);

  const nested = value.coordinate ?? value.location ?? value.point;
  if (nested && nested !== value) {
    const nestedPoint = normalizeCoordinate(nested);
    if (nestedPoint) return nestedPoint;
  }

  const latitude = finiteNumber(value.latitude ?? value.lat);
  const longitude = finiteNumber(value.longitude ?? value.lng ?? value.lon);
  const point = validPoint(latitude, longitude);
  if (!point) return null;

  const elevationFeet = finiteNumber(value.elevationFeet);
  const elevationMeters = finiteNumber(value.elevationMeters);
  const accuracyMeters = finiteNumber(value.accuracyMeters);
  return {
    ...point,
    ...(elevationFeet != null ? { elevationFeet } : {}),
    ...(elevationMeters != null ? { elevationMeters } : {}),
    ...(accuracyMeters != null ? { accuracyMeters } : {}),
    ...(typeof value.source === 'string' || isRecord(value.source) ? { source: value.source as GeoPoint['source'] } : {}),
  };
}

function validPoint(latitude: number | null, longitude: number | null): GeoPoint | null {
  if (latitude == null || longitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function safeIdPart(value: unknown, fallback: string): string {
  const text = String(value ?? fallback).trim().toLowerCase();
  return text.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function routeId(route: SuggestedRoute): string {
  return String(route.id ?? route.name ?? route.title ?? 'suggested-route').trim() || 'suggested-route';
}

function routeTitle(route: SuggestedRoute): string {
  return String(route.name ?? route.title ?? route.id ?? 'Suggested route').trim() || 'Suggested route';
}

function routeLoopMetadata(route: SuggestedRoute): {
  routeType: string | null;
  allowLoopGuidance: boolean;
} {
  const routeRecord = route as Record<string, unknown>;
  const routeMetadata = isRecord(route.routeMetadata) ? route.routeMetadata : {};
  const routeType = [
    routeRecord.routeType,
    routeRecord.route_type,
    routeMetadata.routeType,
    routeMetadata.route_type,
  ].map((value) => String(value ?? '').trim()).find(Boolean) ?? null;
  const allowLoopGuidance = routeAllowsLoopGuidance(route);
  return { routeType, allowLoopGuidance };
}

function source(label: string, state: ItineraryDataSource['state'], extras: Partial<ItineraryDataSource> = {}): ItineraryDataSource {
  return {
    label,
    state,
    ...extras,
  };
}

function distanceMiles(points: GeoPoint[]): number | null {
  if (points.length < 2) return null;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineDistanceMiles(points[index - 1], points[index]);
  }
  return Math.round(total * 10) / 10;
}

function geometryFromCandidate(value: unknown): GeoPoint[] {
  const lineString = normalizeRouteGeometryLineString(value);
  if (!lineString) return [];
  return routeGeometryLineStringToLatitudeLongitude(lineString);
}

function geometryFromRouteCandidates(route: SuggestedRoute, keys: string[]): GeoPoint[] {
  const record = route as Record<string, unknown>;
  const metadata: Record<string, unknown> = isRecord(route.routeMetadata) ? route.routeMetadata : {};

  for (const key of keys) {
    const direct = geometryFromCandidate(record[key]);
    if (direct.length >= 2) return direct;

    const nested = geometryFromCandidate(metadata[key]);
    if (nested.length >= 2) return nested;
  }

  return [];
}

function routeSegmentsForGeometry(args: {
  routeId: string;
  phase: ItineraryPhase;
  geometry: GeoPoint[];
  title: string;
  source: ItineraryDataSource;
  confidence: TripBuilderConfidence;
  metadata?: Record<string, unknown> | null;
}): RouteSegment[] {
  if (args.geometry.length < 2) return [];
  return [{
    id: `${args.routeId}-${args.phase}-segment-1`,
    phase: args.phase,
    sequence: 1,
    title: args.title,
    startCoordinate: args.geometry[0],
    endCoordinate: args.geometry[args.geometry.length - 1],
    geometry: args.geometry,
    distanceMiles: distanceMiles(args.geometry),
    source: args.source,
    confidence: args.confidence,
    metadata: {
      routePhase: args.phase,
      ...(args.metadata ?? {}),
    },
  }];
}

function itineraryRoute(args: {
  routeId: string;
  phase: ItineraryPhase;
  title: string;
  geometry: GeoPoint[];
  source: ItineraryDataSource;
  confidence: TripBuilderConfidence;
  unavailableReason: string;
  metadata?: Record<string, unknown> | null;
}): ItineraryRoute | null {
  if (args.geometry.length < 2) return null;
  return {
    id: `${args.routeId}-${args.phase}`,
    phase: args.phase,
    title: args.title,
    geometry: args.geometry,
    segments: routeSegmentsForGeometry(args),
    source: args.source,
    confidence: args.confidence,
    distanceMiles: distanceMiles(args.geometry),
    unavailableReason: null,
    metadata: {
      pointCount: args.geometry.length,
      ...(args.metadata ?? {}),
    },
  };
}

function normalizeConfidence(value: unknown, fallback: TripBuilderConfidence): TripBuilderConfidence {
  if (value === 'high' || value === 'medium' || value === 'low' || value === 'unknown') return value;
  const numeric = finiteNumber(value);
  if (numeric == null) return fallback;
  if (numeric >= 0.78 || numeric >= 78) return 'high';
  if (numeric >= 0.5 || numeric >= 50) return 'medium';
  if (numeric > 0) return 'low';
  return fallback;
}

function trailheadWaypoint(route: SuggestedRoute, geometryResolution: ResolvedTrailRouteGeometry): ItineraryWaypoint | null {
  const derived = geometryResolution.trailheadStart;
  if (!derived) return null;
  const trailheadCandidate = geometryResolution.trailheadStartCandidate;
  const trailheadSource = trailheadCandidate.source ?? geometryResolution.sources.trailheadStart ?? source('trailhead_start_missing_source', 'unknown');
  return {
    id: `${routeId(route)}-trailhead-start`,
    type: 'trailhead_start',
    phase: 'trailhead',
    title: trailheadCandidate.name ?? `${routeTitle(route)} trailhead start`,
    coordinate: derived,
    source: trailheadSource,
    confidence: trailheadCandidate.confidence,
    notes: [
      ...(trailheadSource.notes ?? []),
      ...trailheadCandidate.warnings,
    ],
    metadata: {
      trailheadName: trailheadCandidate.name ?? null,
      trailheadConfidenceScore: trailheadCandidate.confidenceScore,
      trailheadStatus: trailheadCandidate.status,
      isConfirmedTrailhead: trailheadCandidate.isConfirmedTrailhead,
      sourceKind: trailheadCandidate.metadata?.sourceKind ?? null,
    },
  };
}

function hasPreTrailStops(preTrailStops: ItineraryPreTrailStops): boolean {
  return PRE_TRAIL_BUCKETS.some((bucket) => preTrailStops[bucket].length > 0);
}

function trailEndWaypoint(route: SuggestedRoute, geometryResolution: ResolvedTrailRouteGeometry): ItineraryWaypoint | null {
  if (!geometryResolution.trailEnd) return null;
  const trailEndSource = geometryResolution.sources.trailEnd ?? source('trail_end_missing_source', 'unknown');
  return {
    id: `${routeId(route)}-trail-end`,
    type: 'trail_end',
    phase: 'trail_navigation',
    title: `${routeTitle(route)} trail end`,
    coordinate: geometryResolution.trailEnd,
    source: trailEndSource,
    confidence: geometryResolution.confidence.trailEnd,
    notes: trailEndSource.notes,
  };
}

function exitRoute(route: SuggestedRoute, routeIdValue: string, routeName: string): ItineraryRoute | null {
  const exitGeometry = geometryFromRouteCandidates(route, [
    'exitRoute',
    'exit_route',
    'exitGeometry',
    'exit_geometry',
    'trailExitRoute',
    'trail_exit_route',
    'trailExitGeometry',
    'trail_exit_geometry',
  ]);
  return itineraryRoute({
    routeId: routeIdValue,
    phase: 'trail_exit',
    title: `${routeName} exit route`,
    geometry: exitGeometry,
    source: source('suggested_route_exit_geometry', 'cached', { id: routeIdValue }),
    confidence: 'medium',
    unavailableReason: 'Exit route geometry was not provided by the selected route.',
    metadata: {
      geometryRole: 'exit',
      optional: true,
    },
  });
}

function confidenceSummary(args: {
  userStart: GeoPoint | null;
  approachRoute: ItineraryRoute | null;
  trailheadStart: ItineraryWaypoint | null;
  trailRoute: ItineraryRoute | null;
  trailEnd: ItineraryWaypoint | null;
  exitRoute: ItineraryRoute | null;
  trailheadStartCandidate: ResolvedTrailRouteGeometry['trailheadStartCandidate'];
  trailWaypoints: ItineraryWaypoint[];
  preTrailStops: ItineraryPreTrailStops;
  preTrailStopStatus: ItineraryPreTrailStopSearchSummary[];
  fuelRangeConfidence: TripFuelRangeConfidence;
  dataUsed: ItineraryDataSource[];
  routeGeometryStatus: RouteGeometryStatus;
}): ItineraryConfidenceSummary {
  const missingData: string[] = [];
  const reasons: string[] = [];
  const hasMissingPreTrailAnchor = args.preTrailStopStatus.some((summary) => summary.status === 'missing_anchor');
  const hasUnavailablePreTrailProvider = args.preTrailStopStatus.some((summary) => (
    summary.status !== 'not_requested' && (
      summary.status === 'provider_unavailable' ||
      summary.providerState === 'error' || summary.providerState === 'unavailable'
    )
  ));

  if (!args.userStart) missingData.push('user GPS location');
  if (args.fuelRangeConfidence.fuelStatus === 'unknown') missingData.push('vehicle fuel/range data');
  if (!args.approachRoute) missingData.push('approach route geometry');
  if (!args.trailheadStart) missingData.push('trailhead start');
  if (hasMissingPreTrailAnchor) missingData.push('pre-trail stop search anchor');
  if (!args.trailRoute) {
    missingData.push('trail route geometry');
    reasons.push('Trail route intelligence is incomplete because trail geometry was not provided.');
  }
  if (!args.trailEnd) missingData.push('trail end');
  if (!hasPreTrailStops(args.preTrailStops)) {
    reasons.push('No pre-trail fuel, grocery, water, or supply stops were selected.');
  }
  if (hasUnavailablePreTrailProvider) {
    reasons.push('Live pre-trail POI lookup is unavailable for one or more requested buckets; empty buckets are not confirmed absence of stops.');
  }
  if (args.fuelRangeConfidence.fuelStatus === 'critical') {
    reasons.push('Fuel range appears insufficient for the estimated itinerary distance.');
  } else if (args.fuelRangeConfidence.fuelStatus === 'recommended') {
    reasons.push('Pre-trail fuel is recommended because fuel margin is tight or route distance is incomplete.');
  } else if (args.fuelRangeConfidence.fuelStatus === 'sufficient') {
    reasons.push('Fuel range appears sufficient for the currently known itinerary distance.');
  }
  if (args.trailWaypoints.length === 0) {
    reasons.push('No real trail waypoints were present on the selected route.');
  }
  if (args.approachRoute) reasons.push('Approach route geometry is available from the selected route.');
  if (args.trailheadStart) {
    reasons.push(`Trailhead start is ${args.trailheadStartCandidate.status}.`);
  }
  if (args.trailRoute) reasons.push('Trail route geometry is available from selected route data.');
  if (args.routeGeometryStatus === 'approach_only') {
    reasons.push('Selected route geometry is approach guidance only; it was not treated as true trail geometry.');
  }
  if (args.routeGeometryStatus === 'partial_trail') {
    reasons.push('Trail geometry is partial and is not complete enough for trail waypoint generation.');
  }

  const routeGeometryConfidence =
    args.approachRoute && args.trailRoute ? 'high' :
    args.approachRoute || args.trailRoute ? 'medium' :
    'unknown';
  const overall =
    args.trailheadStart && args.approachRoute && args.trailRoute ? 'high' :
    args.trailheadStart && (args.approachRoute || args.trailRoute) ? 'medium' :
    args.trailheadStart || args.approachRoute || args.trailRoute ? 'low' :
    'unknown';
  const resupplyConfidence =
    hasPreTrailStops(args.preTrailStops) ? 'medium' :
    hasUnavailablePreTrailProvider ? 'low' :
    'unknown';

  return {
    overall,
    routeGeometry: routeGeometryConfidence,
    routeGeometryStatus: args.routeGeometryStatus,
    trailhead: args.trailheadStart ? args.trailheadStart.confidence : 'unknown',
    trailheadConfidenceScore: args.trailheadStartCandidate.confidenceScore,
    trailheadStatus: args.trailheadStartCandidate.status,
    resupply: resupplyConfidence,
    trailWaypoints: args.trailWaypoints.length > 0 ? 'medium' : 'unknown',
    exitRoute: args.exitRoute ? 'medium' : 'unknown',
    dataFreshness: 'unknown',
    reasons,
    missingData,
    staleData: [],
    manualData: hasPreTrailStops(args.preTrailStops) ? ['selected pre-trail options'] : [],
    dataUsed: args.dataUsed,
  };
}

function geometryWarnings(geometryResolution: ResolvedTrailRouteGeometry): TripBuilderWarning[] {
  const warnings: TripBuilderWarning[] = [];

  if (!geometryResolution.hasTrueTrailGeometry) {
    warnings.push({
      id: 'trail_geometry_missing',
      message: geometryResolution.hasApproachGeometryOnly
        ? 'Selected route includes approach guidance to the trailhead, but true trail geometry is unavailable.'
        : 'Trail route intelligence is incomplete because trail geometry was not provided.',
      severity: 'watch',
      source: 'route',
    });
  }

  if (geometryResolution.routeGeometryStatus === 'partial_trail') {
    warnings.push({
      id: 'trail_geometry_partial',
      message: 'Trail route geometry is partial and is not complete enough for trail waypoint generation.',
      severity: 'watch',
      source: 'route',
    });
  }

  if (!geometryResolution.hasTrailEnd) {
    warnings.push({
      id: 'trail_end_missing',
      message: 'Trail end is unavailable and was not inferred from approach guidance.',
      severity: 'watch',
      source: 'route',
    });
  }

  if (!geometryResolution.trailheadStartCandidate.coordinate) {
    warnings.push({
      id: 'trailhead_start_missing',
      message: 'Trailhead start is unavailable from the selected route data.',
      severity: 'watch',
      source: 'route',
    });
  } else if (!geometryResolution.trailheadStartCandidate.isConfirmedTrailhead) {
    warnings.push({
      id: 'trailhead_start_unconfirmed',
      message: 'Trailhead start is likely but not confirmed by explicit trailhead data.',
      severity: 'watch',
      source: 'route',
    });
  }

  return warnings;
}

function preTrailWarnings(preTrailResolution: ResolvedPreTrailStops): TripBuilderWarning[] {
  const warnings: TripBuilderWarning[] = [];
  const hasMissingAnchor = preTrailResolution.bucketSummaries.some((summary) => summary.status === 'missing_anchor');
  const hasProviderUnavailable = preTrailResolution.bucketSummaries.some((summary) => (
    summary.status !== 'not_requested' && (
      summary.status === 'provider_unavailable' ||
      summary.providerState === 'error' || summary.providerState === 'unavailable'
    )
  ));
  const hasProviderPending = preTrailResolution.bucketSummaries.some((summary) => (
    summary.status !== 'not_requested' && (
      summary.status === 'provider_pending' || summary.providerState === 'pending'
    )
  ));

  if (hasMissingAnchor) {
    warnings.push({
      id: 'pre_trail_anchor_missing',
      message: 'Pre-trail resupply search cannot run because the trailhead start is unavailable.',
      severity: 'watch',
      source: 'planning',
    });
  }

  if (hasProviderUnavailable) {
    warnings.push({
      id: 'pre_trail_poi_provider_unavailable',
      message: 'Live pre-trail POI lookup is unavailable for one or more requested fuel or supply buckets; retained stops require manual verification.',
      severity: 'watch',
      source: 'planning',
    });
  }

  if (hasProviderPending) {
    warnings.push({
      id: 'pre_trail_poi_provider_pending',
      message: 'Live pre-trail POI lookup is still pending; empty buckets are not a confirmed no-results state.',
      severity: 'watch',
      source: 'planning',
    });
  }

  return warnings;
}

function fuelRangeWarnings(fuelRangeConfidence: TripFuelRangeConfidence): TripBuilderWarning[] {
  if (fuelRangeConfidence.fuelStatus === 'critical') {
    return [{
      id: 'fuel_range_critical',
      message: 'Known fuel range appears below the estimated itinerary distance. Treat pre-trail fuel as critical.',
      severity: 'critical',
      source: 'vehicle',
    }];
  }

  if (fuelRangeConfidence.fuelStatus === 'recommended') {
    return [{
      id: 'fuel_range_recommended',
      message: 'Pre-trail fuel is recommended because fuel margin is tight or route distance confidence is incomplete.',
      severity: 'caution',
      source: 'vehicle',
    }];
  }

  if (fuelRangeConfidence.fuelStatus === 'unknown') {
    return [{
      id: 'fuel_range_unknown',
      message: 'Vehicle fuel range data is unavailable; ECS did not guess fuel readiness.',
      severity: 'watch',
      source: 'vehicle',
    }];
  }

  return [];
}

function lastCoordinate(route: ItineraryRoute | null | undefined): GeoPoint | null {
  const geometry = route?.geometry ?? [];
  return geometry.length > 0 ? geometry[geometry.length - 1] : null;
}

function firstCoordinate(route: ItineraryRoute | null | undefined): GeoPoint | null {
  return route?.geometry?.[0] ?? null;
}

function sameWaypointCoordinate(left: GeoPoint | null | undefined, right: GeoPoint | null | undefined): boolean {
  if (!left || !right) return false;
  return Math.abs(left.latitude - right.latitude) < 0.00001 &&
    Math.abs(left.longitude - right.longitude) < 0.00001;
}

function geoPointFromGuidanceCoordinate(point: RoadNavCoordinate): GeoPoint {
  const elevationMeters = point.ele_m ?? point.ele ?? null;
  return {
    latitude: point.lat,
    longitude: point.lng,
    ...(elevationMeters != null ? { elevationMeters } : {}),
    ...(point.elevationFeet != null ? { elevationFeet: point.elevationFeet } : {}),
  };
}

function uniquePhysicalPreTrailStops(preTrailStops: ItineraryPreTrailStops): ItineraryStop[] {
  const seen = new Set<string>();
  return PRE_TRAIL_BUCKETS
    .flatMap((bucket) => preTrailStops[bucket])
    .filter((stop) => {
      const placeIdentity = resupplyPlaceIdentityFromMetadata(stop.metadata);
      const coordinateKey = stop.coordinate
        ? `${stop.coordinate.latitude.toFixed(5)},${stop.coordinate.longitude.toFixed(5)}`
        : 'no-coordinate';
      const key = placeIdentity ?? `${stop.title.trim().toLowerCase()}:${coordinateKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      const leftProgress = finiteNumber(left.metadata?.approachProgressRatio);
      const rightProgress = finiteNumber(right.metadata?.approachProgressRatio);
      if (leftProgress != null || rightProgress != null) {
        return (leftProgress ?? Number.POSITIVE_INFINITY) - (rightProgress ?? Number.POSITIVE_INFINITY);
      }
      return left.sequence - right.sequence;
    });
}

function phaseTitle(phase: ItineraryPhase): string {
  switch (phase) {
    case 'approach':
      return 'Approach';
    case 'pre_trail_resupply':
      return 'Pre-trail resupply';
    case 'trailhead':
      return 'Trailhead';
    case 'trail_navigation':
      return 'Trail navigation';
    case 'trail_exit':
      return 'Trail exit';
    default:
      return phase;
  }
}

function buildPhaseSummaries(args: {
  userStart: GeoPoint | null;
  approachRoute: ItineraryRoute | null;
  preTrailStops: ItineraryPreTrailStops;
  trailheadStart: ItineraryWaypoint | null;
  trailRoute: ItineraryRoute | null;
  trailEnd: ItineraryWaypoint | null;
  exitRoute: ItineraryRoute | null;
  routeGeometryStatus: RouteGeometryStatus;
  stops: ItineraryStop[];
  waypoints: ItineraryWaypoint[];
  segments: RouteSegment[];
}): ItineraryPhaseSummary[] {
  const routeByPhase: Partial<Record<ItineraryPhase, ItineraryRoute | null>> = {
    approach: args.approachRoute,
    trail_navigation: args.trailRoute,
    trail_exit: args.exitRoute,
  };
  const preTrailStopCount = PRE_TRAIL_BUCKETS.reduce((count, bucket) => count + args.preTrailStops[bucket].length, 0);
  return ITINERARY_PHASE_ORDER.map((phase, index): ItineraryPhaseSummary => {
    const route = routeByPhase[phase] ?? null;
    const phaseWaypoints = args.waypoints.filter((waypoint) => waypoint.phase === phase);
    const phaseStops = args.stops.filter((stop) => stop.phase === phase);
    const phaseSegments = args.segments.filter((segment) => segment.phase === phase);
    const warnings: string[] = [];
    let status: ItineraryPhaseSummary['status'] = 'not_applicable';
    let startCoordinate: GeoPoint | null = null;
    let endCoordinate: GeoPoint | null = null;
    let unavailableReason: string | null = null;
    let transitionFromPhase: ItineraryPhase | null = null;
    let transitionToPhase: ItineraryPhase | null = null;

    if (phase === 'approach') {
      status = args.approachRoute ? 'available' : 'missing';
      startCoordinate = args.userStart ?? firstCoordinate(args.approachRoute);
      endCoordinate = args.trailheadStart?.coordinate ?? lastCoordinate(args.approachRoute);
      unavailableReason = args.approachRoute ? null : 'Approach route geometry was not provided.';
      if (args.approachRoute && args.routeGeometryStatus === 'approach_only') {
        warnings.push('Approach route is road/access guidance only and is not trail navigation geometry.');
      }
    } else if (phase === 'pre_trail_resupply') {
      status = preTrailStopCount > 0 ? 'available' : 'optional';
      startCoordinate = phaseStops[0]?.coordinate ?? args.userStart ?? null;
      endCoordinate = phaseStops[phaseStops.length - 1]?.coordinate ?? args.trailheadStart?.coordinate ?? null;
      unavailableReason = preTrailStopCount > 0 ? null : 'No pre-trail resupply stops were selected.';
    } else if (phase === 'trailhead') {
      status = args.trailheadStart ? 'available' : 'missing';
      startCoordinate = args.trailheadStart?.coordinate ?? null;
      endCoordinate = args.trailheadStart?.coordinate ?? null;
      transitionFromPhase = 'approach';
      transitionToPhase = 'trail_navigation';
      unavailableReason = args.trailheadStart ? null : 'Trailhead start was not resolved.';
    } else if (phase === 'trail_navigation') {
      status = args.trailRoute ? 'available' : 'missing';
      startCoordinate = args.trailheadStart?.coordinate ?? firstCoordinate(args.trailRoute);
      endCoordinate = args.trailEnd?.coordinate ?? lastCoordinate(args.trailRoute);
      transitionFromPhase = 'trailhead';
      transitionToPhase = 'trail_exit';
      unavailableReason = args.trailRoute ? null : 'True trail route geometry was not provided.';
      if (!args.trailRoute) warnings.push('Trail navigation route is unavailable; approach geometry was not promoted to trail geometry.');
      if (!args.trailEnd) warnings.push('Trail end is unavailable.');
    } else if (phase === 'trail_exit') {
      status = args.exitRoute ? 'available' : 'optional';
      startCoordinate = args.trailEnd?.coordinate ?? firstCoordinate(args.exitRoute);
      endCoordinate = lastCoordinate(args.exitRoute);
      transitionFromPhase = 'trail_navigation';
      transitionToPhase = null;
      unavailableReason = args.exitRoute ? null : 'Exit route is optional and was not provided.';
    }

    return {
      phase,
      sequence: index + 1,
      status,
      title: phaseTitle(phase),
      routeId: route?.id ?? null,
      waypointIds: phaseWaypoints.map((waypoint) => waypoint.id),
      stopIds: phaseStops.map((stop) => stop.id),
      segmentIds: phaseSegments.map((segment) => segment.id),
      startCoordinate,
      endCoordinate,
      transitionFromPhase,
      transitionToPhase,
      unavailableReason,
      warnings,
      metadata: {
        routeGeometryStatus: args.routeGeometryStatus,
        routePhase: phase,
      },
    };
  });
}

export function buildTripItineraryFromSuggestedRoute({
  suggestedRoute,
  userLocation = null,
  userPreferences = null,
  selectedPreTrailOptions = null,
  preTrailStopCandidates = null,
  preTrailProviderAvailable = null,
  preTrailProviderStates = null,
  vehicleProfile = null,
  telemetry = null,
  routeContext = null,
  generatedAt = new Date().toISOString(),
}: BuildTripItineraryFromSuggestedRouteArgs): TripItinerary {
  const id = routeId(suggestedRoute);
  const name = routeTitle(suggestedRoute);
  const userStart = normalizeCoordinate(userLocation);
  const loopMetadata = routeLoopMetadata(suggestedRoute);
  const sourceGeometryResolution = resolveTrailRouteGeometry({ suggestedRoute });
  const canonicalTrailSpine = buildTripBuilderCanonicalRouteSpine({
    route: suggestedRoute,
    trailhead: sourceGeometryResolution.trailheadStart,
    includeApproach: false,
    allowLoop: loopMetadata.allowLoopGuidance,
  });
  const canonicalTrailGeometry = canonicalTrailSpine.lineString
    ? canonicalTrailSpine.coordinates
    : [];
  const sourceTrailWasRejected = sourceGeometryResolution.trailGeometry.length >= 2 &&
    canonicalTrailGeometry.length < 2;
  const trailValidatedGeometryResolution: ResolvedTrailRouteGeometry = sourceTrailWasRejected
    ? {
        ...sourceGeometryResolution,
        routeGeometryStatus: 'partial_trail',
        trailRoute: [],
        trailGeometry: [],
        hasApproachGeometryOnly: sourceGeometryResolution.approachGeometry.length >= 2,
        hasTrueTrailGeometry: false,
        trailGeometryCompleteEnoughForWaypointGeneration: false,
        trailRouteUnavailableReason: `Canonical trail geometry was rejected (${canonicalTrailSpine.safeCode}).`,
        confidence: {
          ...sourceGeometryResolution.confidence,
          trailRoute: 'low',
        },
        warnings: [
          ...sourceGeometryResolution.warnings,
          `Canonical trail geometry was rejected (${canonicalTrailSpine.safeCode}).`,
        ],
        metadata: {
          ...sourceGeometryResolution.metadata,
          trailGeometryPointCount: 0,
        },
      }
    : canonicalTrailGeometry.length >= 2
      ? {
          ...sourceGeometryResolution,
          routeGeometryStatus: 'trail_available',
          trailRoute: canonicalTrailGeometry,
          trailGeometry: canonicalTrailGeometry,
          trailheadStart: canonicalTrailSpine.trailhead,
          trailEnd: canonicalTrailSpine.trailEnd,
          hasTrueTrailGeometry: true,
          hasTrailheadStart: canonicalTrailSpine.trailhead != null,
          hasTrailEnd: canonicalTrailSpine.trailEnd != null,
          trailGeometryCompleteEnoughForWaypointGeneration:
            canonicalTrailSpine.trailhead != null && canonicalTrailSpine.trailEnd != null,
          trailRouteUnavailableReason: null,
          trailEndUnavailableReason: canonicalTrailSpine.trailEnd == null
            ? sourceGeometryResolution.trailEndUnavailableReason
            : null,
          metadata: {
            ...sourceGeometryResolution.metadata,
            trailGeometryPointCount: canonicalTrailGeometry.length,
          },
        }
      : sourceGeometryResolution;
  const approachSource = sourceGeometryResolution.approachGeometryInput ??
    sourceGeometryResolution.approachGeometry;
  const approachStart = userStart
    ? { lat: userStart.latitude, lng: userStart.longitude }
    : null;
  const resolvedTrailhead = trailValidatedGeometryResolution.trailheadStart;
  const trailheadGuidance = resolvedTrailhead
    ? { lat: resolvedTrailhead.latitude, lng: resolvedTrailhead.longitude }
    : null;
  const normalizedApproach = normalizeNavigationGuidanceGeometry(approachSource, {
    preferredStart: approachStart,
    allowLoop: false,
    joinGapMaxMeters: CATALOG_GUIDANCE_JOIN_GAP_MAX_METERS,
  });
  const orientedApproach = normalizedApproach.status === 'ready' && normalizedApproach.points.length >= 2
    ? approachStart
      ? orientGuidanceRouteFromStart(normalizedApproach.points, approachStart)
      : trailheadGuidance
        ? orientGuidanceRouteFromStart(normalizedApproach.points, trailheadGuidance).reverse()
        : normalizedApproach.points
    : [];
  const approachJoinsOrigin = !approachStart || (
    orientedApproach[0] != null &&
    guidanceRouteDistanceMeters(approachStart, orientedApproach[0]) <= CATALOG_GUIDANCE_JOIN_GAP_MAX_METERS
  );
  const approachJoinsTrailhead = !trailheadGuidance || (
    orientedApproach[orientedApproach.length - 1] != null &&
    guidanceRouteDistanceMeters(
      orientedApproach[orientedApproach.length - 1],
      trailheadGuidance,
    ) <= CATALOG_GUIDANCE_JOIN_GAP_MAX_METERS
  );
  const canonicalApproachGeometry = approachJoinsOrigin && approachJoinsTrailhead
    ? orientedApproach.map(geoPointFromGuidanceCoordinate)
    : [];
  const sourceApproachWasRejected = sourceGeometryResolution.approachGeometry.length >= 2 &&
    canonicalApproachGeometry.length < 2;
  const geometryResolution: ResolvedTrailRouteGeometry = sourceApproachWasRejected
    ? {
        ...trailValidatedGeometryResolution,
        routeGeometryStatus: trailValidatedGeometryResolution.hasTrueTrailGeometry
          ? trailValidatedGeometryResolution.routeGeometryStatus
          : trailValidatedGeometryResolution.hasTrailheadStart
            ? 'trail_missing'
            : 'unknown',
        approachRoute: [],
        approachGeometry: [],
        hasApproachGeometryOnly: false,
        confidence: {
          ...trailValidatedGeometryResolution.confidence,
          approachRoute: 'low',
        },
        warnings: [
          ...trailValidatedGeometryResolution.warnings,
          'Approach geometry was rejected because its source topology or endpoint continuity is invalid.',
        ],
        metadata: {
          ...trailValidatedGeometryResolution.metadata,
          approachGeometryPointCount: 0,
        },
      }
    : canonicalApproachGeometry.length >= 2
      ? {
          ...trailValidatedGeometryResolution,
          approachRoute: canonicalApproachGeometry,
          approachGeometry: canonicalApproachGeometry,
          hasApproachGeometryOnly:
            !trailValidatedGeometryResolution.hasTrueTrailGeometry && !sourceTrailWasRejected,
          metadata: {
            ...trailValidatedGeometryResolution.metadata,
            approachGeometryPointCount: canonicalApproachGeometry.length,
          },
        }
      : trailValidatedGeometryResolution;
  const approachGeometry = geometryResolution.approachGeometry;
  const trailGeometry = geometryResolution.trailGeometry;
  const routeDataSource = source('suggested_route', 'cached', { id });
  const approachRoute = itineraryRoute({
    routeId: id,
    phase: 'approach',
    title: `${name} approach`,
    geometry: approachGeometry,
    source: geometryResolution.sources.approachRoute ?? source('suggested_route_approach_geometry', 'cached', { id }),
    confidence: geometryResolution.confidence.approachRoute,
    unavailableReason: 'Approach geometry was not provided by the selected route.',
    metadata: {
      geometryRole: 'approach',
      routeGeometryStatus: geometryResolution.routeGeometryStatus,
    },
  });
  const trailRoute = itineraryRoute({
    routeId: id,
    phase: 'trail_navigation',
    title: `${name} trail route`,
    geometry: trailGeometry,
    source: geometryResolution.sources.trailRoute ?? source('suggested_route_trail_geometry', 'missing', { id }),
    confidence: geometryResolution.confidence.trailRoute,
    unavailableReason: geometryResolution.trailRouteUnavailableReason ?? 'Trail geometry was not provided by the selected route.',
    metadata: {
      geometryRole: 'trail',
      routeGeometryStatus: geometryResolution.routeGeometryStatus,
      completeEnoughForWaypointGeneration: geometryResolution.trailGeometryCompleteEnoughForWaypointGeneration,
      routeType: loopMetadata.routeType,
      allowLoopGuidance: loopMetadata.allowLoopGuidance,
    },
  });
  const trailheadStart = trailheadWaypoint(suggestedRoute, geometryResolution);
  const preTrailResolution = resolvePreTrailStops({
    trailheadStart,
    approachRoute,
    candidates: preTrailStopCandidates,
    providerAvailable: preTrailProviderAvailable,
    providerStates: preTrailProviderStates,
    selectedPreTrailOptions,
    userPreferences,
    vehicleProfile,
    routeContext,
    routeId: id,
    generatedAt,
  });
  const preTrailStops = preTrailResolution.preTrailStops;
  const trailEnd = trailEndWaypoint(suggestedRoute, geometryResolution);
  const exitRouteValue = exitRoute(suggestedRoute, id, name);
  const trailWaypointResolution = resolveTrailWaypoints({
    trailRoute,
    trailheadStart,
    trailEnd,
    routeContext,
    userPreferences,
    vehicleProfile,
    waypointRecords: Array.isArray(suggestedRoute.waypoints) ? suggestedRoute.waypoints : [],
    routeId: id,
    generatedAt,
  });
  const trailWaypoints = trailWaypointResolution.trailWaypoints;
  const explicitTrailEndAlreadyPresent = trailEnd
    ? trailWaypoints.some((waypoint) => (
        waypoint.type === 'trail_end' &&
        (waypoint.id === trailEnd.id || sameWaypointCoordinate(waypoint.coordinate, trailEnd.coordinate))
      ))
    : false;
  const fuelRangeConfidence = resolveFuelRangeConfidence({
    vehicleProfile,
    telemetry,
    approachRoute,
    trailRoute,
    exitRoute: exitRouteValue,
    preTrailFuelStops: preTrailStops.fuel,
  });
  const scheduledPreTrailStops = uniquePhysicalPreTrailStops(preTrailStops);
  const stops: ItineraryStop[] = [
    ...scheduledPreTrailStops,
    ...(trailheadStart ? [{ ...trailheadStart, sequence: scheduledPreTrailStops.length + 1, plannedDay: 1, stopRole: 'trailhead' as const }] : []),
    ...(trailEnd ? [{ ...trailEnd, sequence: scheduledPreTrailStops.length + (trailheadStart ? 2 : 1), plannedDay: 1, stopRole: 'trail' as const }] : []),
  ].map((stop, index) => ({ ...stop, sequence: index + 1 }));
  const waypoints: ItineraryWaypoint[] = [
    ...(trailheadStart ? [trailheadStart] : []),
    ...trailWaypoints,
    ...(trailEnd && !explicitTrailEndAlreadyPresent ? [trailEnd] : []),
  ];
  const segments: RouteSegment[] = [
    ...(approachRoute?.segments ?? []),
    ...(trailRoute?.segments ?? []),
    ...(exitRouteValue?.segments ?? []),
  ];
  const phaseSummaries = buildPhaseSummaries({
    userStart,
    approachRoute,
    preTrailStops,
    trailheadStart,
    trailRoute,
    trailEnd,
    exitRoute: exitRouteValue,
    routeGeometryStatus: geometryResolution.routeGeometryStatus,
    stops,
    waypoints,
    segments,
  });
  const dataUsed: ItineraryDataSource[] = [
    routeDataSource,
    ...(userStart ? [source('user_gps_location', 'live')] : []),
    ...(approachRoute ? [approachRoute.source] : []),
    ...(trailRoute ? [trailRoute.source] : []),
    ...(exitRouteValue ? [exitRouteValue.source] : []),
    ...preTrailResolution.dataUsed,
    ...(fuelRangeConfidence.dataUsed ?? []),
    ...trailWaypointResolution.dataUsed,
  ];
  const confidence = confidenceSummary({
    userStart,
    approachRoute,
    trailheadStart,
    trailRoute,
    trailEnd,
    exitRoute: exitRouteValue,
    trailheadStartCandidate: geometryResolution.trailheadStartCandidate,
    trailWaypoints,
    preTrailStops,
    preTrailStopStatus: preTrailResolution.bucketSummaries,
    fuelRangeConfidence,
    dataUsed,
    routeGeometryStatus: geometryResolution.routeGeometryStatus,
  });
  const warnings = [
    ...geometryWarnings(geometryResolution),
    ...preTrailWarnings(preTrailResolution),
    ...fuelRangeWarnings(fuelRangeConfidence),
  ];

  return {
    id: `trip-itinerary-${safeIdPart(id, 'suggested-route')}`,
    sourceRouteId: id,
    routeId: id,
    suggestedRouteId: id,
    title: `${name} draft itinerary`,
    status: 'draft',
    createdAt: generatedAt,
    updatedAt: generatedAt,
    userStart,
    approachRoute,
    preTrailStops,
    preTrailStopStatus: preTrailResolution.bucketSummaries,
    fuelRangeConfidence,
    trailheadStart,
    trailheadStartCandidate: geometryResolution.trailheadStartCandidate,
    trailRoute,
    routeGeometryStatus: geometryResolution.routeGeometryStatus,
    trailEnd,
    exitRoute: exitRouteValue,
    exitEnd: null,
    trailWaypoints,
    phases: ITINERARY_PHASE_ORDER,
    phaseSummaries,
    stops,
    waypoints,
    segments,
    confidence,
    dataUsed,
    warnings,
    notes: userPreferences
      ? ['User preferences were attached as metadata but did not create itinerary stops.']
      : [],
    metadata: {
      userPreferences: userPreferences ?? null,
      sourceRouteName: name,
      approachGeometryPointCount: approachGeometry.length,
      trailGeometryPointCount: trailGeometry.length,
      trailheadConfidenceScore: geometryResolution.trailheadStartCandidate.confidenceScore,
      trailheadStatus: geometryResolution.trailheadStartCandidate.status,
      isConfirmedTrailhead: geometryResolution.trailheadStartCandidate.isConfirmedTrailhead,
      trailheadStartWarnings: geometryResolution.trailheadStartCandidate.warnings,
      preTrailSearchAnchor: preTrailResolution.anchorCoordinate,
      preTrailStopStatus: preTrailResolution.bucketSummaries.map((summary) => ({
        bucket: summary.bucket,
        status: summary.status,
        providerState: summary.providerState ?? null,
        stopCount: summary.stopCount,
        provider: summary.provider ?? null,
        searchRadiusMiles: summary.searchRadiusMiles ?? null,
      })),
      selectedPreTrailStopCounts: Object.fromEntries(
        PRE_TRAIL_BUCKETS.map((bucket) => [bucket, preTrailStops[bucket].length]),
      ),
      fuelRangeConfidence: {
        estimatedTotalDistance: fuelRangeConfidence.estimatedTotalDistance,
        estimatedTrailDistance: fuelRangeConfidence.estimatedTrailDistance,
        knownFuelRange: fuelRangeConfidence.knownFuelRange,
        estimatedFuelRemaining: fuelRangeConfidence.estimatedFuelRemaining,
        fuelStatus: fuelRangeConfidence.fuelStatus,
        confidenceScore: fuelRangeConfidence.confidenceScore,
        rangeMarginMiles: fuelRangeConfidence.rangeMarginMiles ?? null,
        estimatedFuelRequiredGallons: fuelRangeConfidence.estimatedFuelRequiredGallons ?? null,
      },
      trailWaypointIntelligence: trailWaypointResolution.metadata,
      routeGeometryStatus: geometryResolution.routeGeometryStatus,
      routeType: loopMetadata.routeType,
      allowLoopGuidance: loopMetadata.allowLoopGuidance,
      hasApproachGeometryOnly: geometryResolution.hasApproachGeometryOnly,
      hasTrueTrailGeometry: geometryResolution.hasTrueTrailGeometry,
      hasTrailEnd: geometryResolution.hasTrailEnd,
      trailGeometryCompleteEnoughForWaypointGeneration: geometryResolution.trailGeometryCompleteEnoughForWaypointGeneration,
      trailRouteUnavailableReason: geometryResolution.trailRouteUnavailableReason,
      trailEndUnavailableReason: geometryResolution.trailEndUnavailableReason,
    },
  };
}

import {
  haversineDistanceMiles,
  normalizeRouteCoordinate,
  normalizeRouteCoordinates,
  type NormalizedRouteCoordinate,
  type RouteCoordinate,
} from '../map/routeGeometryUtils';
import { normalizeRouteGeometryLineString } from '../routeGeometryLifecycle';
import type {
  BuildTripPlanArgs,
  CampCandidate,
  ExitPoint,
  TripBuilderConfidence,
  TripBuilderNote,
  TripBuilderRouteInput,
  TripBuilderWarning,
  TripPlan,
  TripPlanRouteSummary,
  TripPlanSegment,
  TripPlanStop,
  TripPriority,
  TripType,
  ResupplyPoint,
} from './tripBuilderTypes';
import { buildSmartResupplyPlan } from './smartResupplyPlanner';

const DEFAULT_TRAIL_SPEED_MPH = 18;
const MAX_SCENIC_WAYPOINT_STOPS = 3;
const MAX_SUPPORT_STOPS = 8;

const CAMP_FIELD_KEYS = [
  'campCandidates',
  'camps',
  'campLocations',
  'campsites',
  'dispersedCamps',
  'dispersedCamping',
  'viableCamps',
  'viableCampLocations',
  'suggestedCampsites',
] as const;

const EXIT_FIELD_KEYS = [
  'exitPoints',
  'exits',
  'bailoutPoints',
  'bailouts',
  'bailoutRoutes',
  'pavedExits',
  'alternateRoutes',
  'alternateRouteExits',
  'roadAccessPoints',
  'roadJunctions',
  'trailForks',
  'forks',
] as const;

const RESUPPLY_FIELD_KEYS = [
  'resupplyPoints',
  'supportPoints',
  'poiSupport',
  'routeSupportPoints',
  'services',
  'pois',
] as const;

function finiteNumber(value: unknown): number | null {
  const numberValue = typeof value === 'string' ? Number(value) : value;
  return typeof numberValue === 'number' && Number.isFinite(numberValue) ? numberValue : null;
}

function roundTenths(value: number | null): number | null {
  return value == null ? null : Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeConfidence(value: unknown): TripBuilderConfidence {
  if (value === 'high' || value === 'medium' || value === 'low' || value === 'unknown') return value;
  return 'unknown';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function metadataRecord(route: TripBuilderRouteInput): Record<string, unknown> {
  return asRecord(route.routeMetadata) ?? {};
}

function collectRouteArrays(route: TripBuilderRouteInput, keys: readonly string[]): unknown[] {
  const routeRecord = route as Record<string, unknown>;
  const metadata = metadataRecord(route);
  const values: unknown[] = [];
  keys.forEach((key) => {
    const direct = routeRecord[key];
    if (Array.isArray(direct)) values.push(...direct);
    const nested = metadata[key];
    if (Array.isArray(nested)) values.push(...nested);
  });
  return values;
}

function categoryToken(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[\s-]+/g, '_');
}

function recordLabel(record: Record<string, unknown>, fallback: string): string {
  const value = record.name ?? record.title ?? record.label ?? fallback;
  const text = String(value ?? '').trim();
  return text || fallback;
}

function routePointCategory(record: Record<string, unknown>): TripPlanStop['type'] | null {
  const tokens = [
    record.category,
    record.kind,
    record.waypointType,
    record.type,
    record.ecsWaypointType,
    record.serviceType,
  ].map(categoryToken);
  const joined = tokens.join(' ');
  if (/\bfuel\b|\bgas\b|\brefuel\b/.test(joined)) return 'fuel';
  if (/\bwater\b|\brefill\b/.test(joined)) return 'water';
  if (/\bfood\b|\bsupply\b|\bsupplies\b|\bgrocery\b|\bstore\b/.test(joined)) return 'supply';
  if (/\brepair\b|\bmechanic\b|\btire\b/.test(joined)) return 'repair';
  if (/\bmedical\b|\bhospital\b|\bclinic\b|\bems\b/.test(joined)) return 'medical';
  if (joined.includes('ranger') || joined.includes('agency') || joined.includes('visitor_center')) return 'ranger_station';
  if (/\bexit\b|\bbailout\b|\bpavement\b|\btown_exit\b|\bjunction\b|\btrailhead\b|\bstaging\b|\balternate_route\b/.test(joined)) return 'exit';
  if (/\bcamp\b|\bcampsite\b/.test(joined)) return 'camp';
  if (/\boverlook\b|\bscenic\b|\bphoto\b|\blookout\b/.test(joined)) return 'scenic_stop';
  return null;
}

function isEmergencyBailoutClue(record: Record<string, unknown>): boolean {
  if (routePointCategory(record) === 'exit') return true;
  const text = [
    record.name,
    record.title,
    record.label,
    record.description,
    record.notes,
    record.category,
    record.kind,
    record.type,
    record.waypointType,
  ].map((value) => Array.isArray(value) ? value.join(' ') : String(value ?? '')).join(' ').toLowerCase();
  return /\b(bailout|alternate|escape|emergency|fork|junction|pavement|trailhead|staging|county road|forest road|service road|access road|primary road|highway|hwy|address)\b/.test(text);
}

function sourceFromRecord(record: Record<string, unknown>, fallback: string): string {
  const source = String(record.source ?? record.provider ?? fallback).trim();
  return source || fallback;
}

function toRouteCoordinate(value: unknown): NormalizedRouteCoordinate | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    const latitude = finiteNumber(candidate.latitude) ?? finiteNumber(candidate.lat);
    const longitude = finiteNumber(candidate.longitude) ?? finiteNumber(candidate.lng) ?? finiteNumber(candidate.lon);
    if (
      latitude != null &&
      longitude != null &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      return { latitude, longitude };
    }
  }
  return normalizeRouteCoordinate(value as RouteCoordinate);
}

function coordinatesFromGeoJson(value: unknown): NormalizedRouteCoordinate[] {
  if (!value || typeof value !== 'object') return [];
  const candidate = value as Record<string, unknown>;

  if (candidate.type === 'Feature') {
    return coordinatesFromGeoJson(candidate.geometry);
  }

  if (candidate.type === 'LineString' && Array.isArray(candidate.coordinates)) {
    return normalizeRouteCoordinates(candidate.coordinates as RouteCoordinate[]);
  }

  if (candidate.type === 'MultiLineString' && Array.isArray(candidate.coordinates)) {
    return candidate.coordinates.flatMap((line) =>
      normalizeRouteCoordinates(Array.isArray(line) ? (line as RouteCoordinate[]) : []),
    );
  }

  if (candidate.type === 'FeatureCollection' && Array.isArray(candidate.features)) {
    return candidate.features.flatMap(coordinatesFromGeoJson);
  }

  if (Array.isArray(candidate.coordinates)) {
    return normalizeRouteCoordinates(candidate.coordinates as RouteCoordinate[]);
  }

  return [];
}

function extractRouteCoordinates(route: TripBuilderRouteInput): NormalizedRouteCoordinate[] {
  const sharedGeometry = normalizeRouteGeometryLineString(route);
  if (sharedGeometry) {
    return sharedGeometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
  }

  const routeRecord = route as Record<string, unknown>;
  const directGeometry = [
    ...coordinatesFromGeoJson(routeRecord.geometry),
    ...coordinatesFromGeoJson(routeRecord.coordinates),
    ...coordinatesFromGeoJson(route.trailGeometry),
    ...coordinatesFromGeoJson(route.routeGeometry),
    ...coordinatesFromGeoJson(route.geojson),
  ];

  if (directGeometry.length >= 2) return directGeometry;

  if (Array.isArray(route.trailGeometry)) {
    const coordinates = normalizeRouteCoordinates(route.trailGeometry as RouteCoordinate[]);
    if (coordinates.length >= 2) return coordinates;
  }

  if (Array.isArray(route.routeGeometry)) {
    const coordinates = normalizeRouteCoordinates(route.routeGeometry as RouteCoordinate[]);
    if (coordinates.length >= 2) return coordinates;
  }

  if (Array.isArray(route.segments)) {
    const segmentCoordinates = route.segments.flatMap((segment) => {
      if (!segment || typeof segment !== 'object') return [];
      const points = (segment as { points?: unknown }).points;
      return Array.isArray(points)
        ? points.map(toRouteCoordinate).filter((coordinate): coordinate is NormalizedRouteCoordinate => coordinate != null)
        : [];
    });
    if (segmentCoordinates.length >= 2) return segmentCoordinates;
  }

  if (Array.isArray(route.waypoints)) {
    const waypointCoordinates = route.waypoints
      .map(toRouteCoordinate)
      .filter((coordinate): coordinate is NormalizedRouteCoordinate => coordinate != null);
    if (waypointCoordinates.length >= 2) return waypointCoordinates;
  }

  const start = toRouteCoordinate(
    typeof route.startLat === 'number' && typeof route.startLng === 'number'
      ? { latitude: route.startLat, longitude: route.startLng }
      : route.coordinate,
  );
  const end = toRouteCoordinate(route.destinationCoordinate ?? route.endpointCoordinate ?? route.endCoordinate);
  return start && end ? [start, end] : [];
}

function getRouteDistanceMiles(route: TripBuilderRouteInput, coordinates: NormalizedRouteCoordinate[]): number | null {
  const explicit =
    finiteNumber(route.distanceMiles) ??
    finiteNumber(route.total_distance_miles) ??
    finiteNumber(route.distance_mi);

  if (explicit != null) return explicit;
  if (coordinates.length < 2) return null;

  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += haversineDistanceMiles(coordinates[index - 1], coordinates[index]);
  }
  return total;
}

function interpolateCoordinateAtRouteMile(
  coordinates: NormalizedRouteCoordinate[],
  routeDistanceMiles: number | null,
  targetMile: number,
): NormalizedRouteCoordinate | null {
  if (coordinates.length === 0) return null;
  if (coordinates.length === 1) return coordinates[0];
  const routeDistance = routeDistanceMiles && routeDistanceMiles > 0 ? routeDistanceMiles : null;
  const geometryDistances: number[] = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    geometryDistances[index] = geometryDistances[index - 1] + haversineDistanceMiles(coordinates[index - 1], coordinates[index]);
  }
  const geometryDistance = geometryDistances[geometryDistances.length - 1];
  if (!Number.isFinite(geometryDistance) || geometryDistance <= 0) return coordinates[0];
  const targetGeometryMile = clamp(
    routeDistance ? (targetMile / routeDistance) * geometryDistance : targetMile,
    0,
    geometryDistance,
  );

  for (let index = 1; index < geometryDistances.length; index += 1) {
    const previousMile = geometryDistances[index - 1];
    const nextMile = geometryDistances[index];
    if (targetGeometryMile > nextMile) continue;
    const span = nextMile - previousMile;
    const ratio = span > 0 ? (targetGeometryMile - previousMile) / span : 0;
    const start = coordinates[index - 1];
    const end = coordinates[index];
    return {
      latitude: start.latitude + (end.latitude - start.latitude) * ratio,
      longitude: start.longitude + (end.longitude - start.longitude) * ratio,
    };
  }

  return coordinates[coordinates.length - 1];
}

function getEstimatedDriveTimeHours(route: TripBuilderRouteInput, distanceMiles: number | null): number | null {
  const explicit =
    finiteNumber(route.estimatedDriveTimeHours) ??
    finiteNumber(route.estimatedTravelHours) ??
    finiteNumber(route.eta_hours);
  if (explicit != null) return explicit;
  if (distanceMiles == null) return null;
  return Math.max(0.5, distanceMiles / DEFAULT_TRAIL_SPEED_MPH);
}

function getRouteName(route: TripBuilderRouteInput): string {
  return String(route.name ?? route.title ?? route.id ?? 'Selected route');
}

function getRouteId(route: TripBuilderRouteInput): string {
  const id = route.id ?? route.name ?? route.title ?? 'selected-route';
  return String(id).trim() || 'selected-route';
}

function getRouteDifficulty(route: TripBuilderRouteInput): string | null {
  if (typeof route.difficultyRating === 'string' && route.difficultyRating.trim()) return route.difficultyRating.trim();
  const difficulty = finiteNumber(route.terrainDifficulty);
  if (difficulty == null) return null;
  if (difficulty <= 3) return 'easy';
  if (difficulty <= 5) return 'moderate';
  if (difficulty <= 7) return 'hard';
  return 'technical';
}

function routeDataConfidence(route: TripBuilderRouteInput, coordinates: NormalizedRouteCoordinate[], distanceMiles: number | null): TripBuilderConfidence {
  if (coordinates.length >= 2 && distanceMiles != null) return 'high';
  if (distanceMiles != null || coordinates.length >= 2) return 'medium';
  if (route.id || route.name || route.title) return 'low';
  return 'unknown';
}

function buildRouteSummary(route: TripBuilderRouteInput): {
  summary: TripPlanRouteSummary;
  coordinates: NormalizedRouteCoordinate[];
} {
  const coordinates = extractRouteCoordinates(route);
  const distanceMiles = roundTenths(getRouteDistanceMiles(route, coordinates));
  const estimatedDriveTimeHours = roundTenths(getEstimatedDriveTimeHours(route, distanceMiles));
  const startCoordinate = coordinates[0] ?? toRouteCoordinate(
    typeof route.startLat === 'number' && typeof route.startLng === 'number'
      ? { latitude: route.startLat, longitude: route.startLng }
      : route.coordinate,
  );
  const endCoordinate = coordinates[coordinates.length - 1] ?? toRouteCoordinate(
    route.destinationCoordinate ?? route.endpointCoordinate ?? route.endCoordinate,
  );

  return {
    coordinates,
    summary: {
      routeId: getRouteId(route),
      name: getRouteName(route),
      region: typeof route.region === 'string' ? route.region : null,
      source: typeof route.source === 'string' ? route.source : null,
      distanceMiles,
      estimatedDriveTimeHours,
      estimatedDays: finiteNumber(route.estimatedDays),
      terrainType: typeof route.terrainType === 'string' ? route.terrainType : null,
      difficulty: getRouteDifficulty(route),
      remotenessScore: finiteNumber(route.remotenessScore),
      permitRequired: typeof route.permitRequired === 'boolean' ? route.permitRequired : null,
      startCoordinate: startCoordinate ?? null,
      endCoordinate: endCoordinate ?? null,
      routeDataConfidence: routeDataConfidence(route, coordinates, distanceMiles),
    },
  };
}

function tripTypeNeedsCamping(tripType: TripType, priorities: TripPriority[]): boolean {
  return (
    tripType === 'overnight_camping' ||
    tripType === 'weekend_overland' ||
    tripType === 'multi_day_expedition' ||
    priorities.includes('camping')
  );
}

function plannedDaysForTrip(tripType: TripType, routeDays: number | null): number {
  if (tripType === 'day_trip' || tripType === 'scenic_exploration' || tripType === 'technical_trail_run') return 1;
  if (tripType === 'overnight_camping') return Math.max(2, Math.ceil(routeDays ?? 2));
  if (tripType === 'weekend_overland') return Math.max(2, Math.ceil(routeDays ?? 2));
  return Math.max(3, Math.ceil(routeDays ?? 3));
}

function scoreCampCandidate(candidate: CampCandidate): number {
  const score = finiteNumber(candidate.score) ?? 0;
  const legalBonus = normalizeConfidence(candidate.legalConfidence) === 'high'
    ? 12
    : normalizeConfidence(candidate.legalConfidence) === 'medium'
      ? 6
      : 0;
  const routeBonus = candidate.routeMileMarker != null ? 4 : 0;
  return score + legalBonus + routeBonus;
}

function selectCampCandidates(candidates: CampCandidate[] | null | undefined): {
  primary: CampCandidate | null;
  backup: CampCandidate | null;
} {
  const sorted = [...(candidates ?? [])].sort((left, right) => {
    const scoreDelta = scoreCampCandidate(right) - scoreCampCandidate(left);
    if (scoreDelta !== 0) return scoreDelta;
    return (finiteNumber(left.distanceFromRouteMiles) ?? Number.POSITIVE_INFINITY) -
      (finiteNumber(right.distanceFromRouteMiles) ?? Number.POSITIVE_INFINITY);
  });
  return {
    primary: sorted[0] ?? null,
    backup: sorted[1] ?? null,
  };
}

function selectPrimaryExitPoint(exitPoints: ExitPoint[] | null | undefined): ExitPoint | null {
  const sorted = [...(exitPoints ?? [])].sort((left, right) => {
    const priorityDelta = (finiteNumber(right.priority) ?? 0) - (finiteNumber(left.priority) ?? 0);
    if (priorityDelta !== 0) return priorityDelta;
    return (finiteNumber(left.distanceFromRouteMiles) ?? Number.POSITIVE_INFINITY) -
      (finiteNumber(right.distanceFromRouteMiles) ?? Number.POSITIVE_INFINITY);
  });
  return sorted[0] ?? null;
}

function campCandidateFromRecord(routeId: string, value: unknown, index: number): CampCandidate | null {
  const record = asRecord(value);
  if (!record) return null;
  const location = toRouteCoordinate(record.location ?? record.coordinate ?? record.point ?? record);
  const title = recordLabel(record, `Camp candidate ${index + 1}`);
  if (!location && !record.routeMileMarker && !record.mileMarker) return null;
  return {
    id: String(record.id ?? `${routeId}-camp-${index + 1}`),
    name: title,
    location,
    routeMileMarker: finiteNumber(record.routeMileMarker) ?? finiteNumber(record.mileMarker),
    distanceFromRouteMiles: finiteNumber(record.distanceFromRouteMiles),
    score: finiteNumber(record.score ?? record.suitabilityScore ?? record.campingScore),
    legalConfidence: normalizeConfidence(record.legalConfidence ?? record.confidence),
    accessConfidence: normalizeConfidence(record.accessConfidence ?? record.confidence),
    source: sourceFromRecord(record, 'route_camp_metadata'),
    notes: Array.isArray(record.notes)
      ? record.notes.map(String)
      : typeof record.description === 'string'
        ? [record.description]
        : ['Camp candidate supplied by selected route metadata.'],
  };
}

function deriveCampCandidatesFromRoute(route: TripBuilderRouteInput, routeId: string): CampCandidate[] {
  return collectRouteArrays(route, CAMP_FIELD_KEYS)
    .map((value, index) => campCandidateFromRecord(routeId, value, index))
    .filter((candidate): candidate is CampCandidate => candidate != null);
}

function isRouteCompletionExit(point: ExitPoint | null | undefined): boolean {
  return point?.type === 'route_finish' || point?.source === 'ecs_route_completion_exit';
}

function inferCampCandidateCount(route: TripBuilderRouteInput, tripDays: number, distanceMiles: number | null): number {
  const routeRecord = route as Record<string, unknown>;
  const metadata = metadataRecord(route);
  const explicitSuggested =
    finiteNumber(routeRecord.suggestedCamps) ??
    finiteNumber(routeRecord.suggestedCampCount) ??
    finiteNumber(metadata.suggestedCamps) ??
    finiteNumber(metadata.suggestedCampCount);
  if (explicitSuggested != null && explicitSuggested > 0) {
    return clamp(Math.ceil(explicitSuggested), 1, 5);
  }
  if (tripDays > 1) return clamp(tripDays - 1, 1, 5);
  if (distanceMiles != null && distanceMiles >= 75) return 1;
  return 0;
}

function inferCampCandidatesFromRoute(
  route: TripBuilderRouteInput,
  routeId: string,
  routeSummary: TripPlanRouteSummary,
  coordinates: NormalizedRouteCoordinate[],
  tripDays: number,
): CampCandidate[] {
  const distanceMiles = routeSummary.distanceMiles;
  const candidateCount = inferCampCandidateCount(route, tripDays, distanceMiles);
  if (candidateCount <= 0 || distanceMiles == null || distanceMiles <= 0) return [];
  const remoteness = finiteNumber(route.remotenessScore) ?? 0;
  const baseScore = clamp(52 + remoteness * 2, 52, 70);

  return Array.from({ length: candidateCount }, (_, index): CampCandidate => {
    const progress = (index + 1) / (candidateCount + 1);
    const routeMileMarker = roundTenths(distanceMiles * progress);
    const location = routeMileMarker == null
      ? null
      : interpolateCoordinateAtRouteMile(coordinates, distanceMiles, routeMileMarker);
    const day = index + 1;
    return {
      id: `${routeId}-ecs-camp-window-${day}`,
      name: `Day ${day} ECS camp candidate window`,
      location,
      routeMileMarker,
      distanceFromRouteMiles: location ? 0 : null,
      score: roundTenths(baseScore - index * 2),
      legalConfidence: 'unknown',
      accessConfidence: location ? 'low' : 'unknown',
      source: 'ecs_route_inferred_camp_window',
      notes: [
        'ECS inferred this as a route-progress camp planning window from trip duration and route distance.',
        'This is not a verified legal campsite. Confirm land use, fire restrictions, access, and arrival daylight before relying on it.',
        location
          ? 'Coordinate is route-derived and should be treated as a scouting target, not a reserved or established campsite.'
          : 'Route geometry is limited; use the mile marker as the planning target until better map data is available.',
      ],
    };
  });
}

function exitPointFromRecord(routeId: string, value: unknown, index: number): ExitPoint | null {
  const record = asRecord(value);
  if (!record) return null;
  const location = toRouteCoordinate(record.location ?? record.coordinate ?? record.point ?? record);
  const title = recordLabel(record, `Exit point ${index + 1}`);
  if (!location && !record.routeMileMarker && !record.mileMarker && !record.distanceFromRouteMiles) return null;
  return {
    id: String(record.id ?? `${routeId}-exit-${index + 1}`),
    name: title,
    type: typeof record.type === 'string' ? record.type : typeof record.kind === 'string' ? record.kind : null,
    location,
    routeMileMarker: finiteNumber(record.routeMileMarker) ?? finiteNumber(record.mileMarker),
    distanceFromRouteMiles: finiteNumber(record.distanceFromRouteMiles),
    priority: finiteNumber(record.priority ?? record.score),
    source: sourceFromRecord(record, 'route_exit_metadata'),
    notes: Array.isArray(record.notes)
      ? record.notes.map(String)
      : typeof record.description === 'string'
        ? [record.description]
        : ['Exit point supplied by selected route metadata.'],
  };
}

function deriveExitPointsFromRoute(route: TripBuilderRouteInput, routeId: string): ExitPoint[] {
  const explicit = collectRouteArrays(route, EXIT_FIELD_KEYS)
    .map((value, index) => exitPointFromRecord(routeId, value, index));
  const fromWaypoints = Array.isArray(route.waypoints)
    ? route.waypoints
        .map((waypoint, index) => {
          const record = asRecord(waypoint);
          if (!record || routePointCategory(record) !== 'exit') return null;
          return exitPointFromRecord(routeId, waypoint, index);
        })
    : [];
  return [...explicit, ...fromWaypoints].filter((point): point is ExitPoint => point != null);
}

function routeMileForEmergencyBailout(
  routeSummary: TripPlanRouteSummary,
  fallbackRatio = 0.5,
): number | null {
  return routeSummary.distanceMiles != null && routeSummary.distanceMiles > 0
    ? roundTenths(routeSummary.distanceMiles * fallbackRatio)
    : null;
}

function scoreEmergencyBailoutCandidate(point: ExitPoint, routeDistanceMiles: number | null): number {
  let score = finiteNumber(point.priority) ?? 0;
  const typeText = `${point.type ?? ''} ${point.name ?? ''} ${point.source ?? ''}`.toLowerCase();
  if (/alternate|fork|junction|pavement|road|highway|hwy|trailhead|staging/.test(typeText)) score += 8;
  if (/address|pavement|highway|hwy|county road|forest road|primary road/.test(typeText)) score += 4;
  if (point.location) score += 3;
  if (finiteNumber(point.distanceFromRouteMiles) != null) score += Math.max(0, 4 - Math.min(4, finiteNumber(point.distanceFromRouteMiles) as number));
  const mile = finiteNumber(point.routeMileMarker);
  if (routeDistanceMiles != null && routeDistanceMiles > 0 && mile != null) {
    const midpointDelta = Math.abs(mile - routeDistanceMiles * 0.5) / routeDistanceMiles;
    score += Math.max(0, 5 - midpointDelta * 10);
    if (mile <= 0.05 || mile >= routeDistanceMiles - 0.05) score -= 12;
  }
  return score;
}

function inferEmergencyBailoutFromRouteClues(
  route: TripBuilderRouteInput,
  routeId: string,
  routeSummary: TripPlanRouteSummary,
): ExitPoint | null {
  const candidates = [
    ...collectRouteArrays(route, EXIT_FIELD_KEYS),
    ...(Array.isArray(route.waypoints) ? route.waypoints : []),
  ]
    .map((value, index) => {
      const record = asRecord(value);
      if (!record || !isEmergencyBailoutClue(record)) return null;
      return exitPointFromRecord(routeId, record, index);
    })
    .filter((point): point is ExitPoint => point != null && !isRouteCompletionExit(point));

  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) =>
    scoreEmergencyBailoutCandidate(right, routeSummary.distanceMiles) -
    scoreEmergencyBailoutCandidate(left, routeSummary.distanceMiles)
  )[0] ?? null;
}

function inferMidRouteEmergencyBailoutPoint(
  routeId: string,
  routeSummary: TripPlanRouteSummary,
  coordinates: NormalizedRouteCoordinate[],
): ExitPoint | null {
  const routeMileMarker = routeMileForEmergencyBailout(routeSummary);
  const location = routeMileMarker != null
    ? interpolateCoordinateAtRouteMile(coordinates, routeSummary.distanceMiles, routeMileMarker)
    : null;
  if (!location && routeMileMarker == null) return null;
  return {
    id: `${routeId}-emergency-bailout-midroute`,
    name: `${routeSummary.name} emergency bailout search`,
    type: 'emergency_road_access',
    location,
    routeMileMarker,
    distanceFromRouteMiles: null,
    priority: 5,
    source: 'ecs_midroute_bailout_inference',
    notes: [
      'ECS inferred this as a mid-route emergency bailout search target because no dedicated bailout fork, road access, or address-backed exit was supplied.',
      'Use it to verify the nearest drivable road, addressable access, or walk-out option near the route midpoint before committing to the route.',
      'This is not a confirmed legal road, trail, or evacuation corridor; field verification and current conditions are required.',
    ],
  };
}

function inferExitPointsFromRoute(
  route: TripBuilderRouteInput,
  routeId: string,
  routeSummary: TripPlanRouteSummary,
  coordinates: NormalizedRouteCoordinate[],
): ExitPoint[] {
  const points: ExitPoint[] = [];
  if (routeSummary.startCoordinate) {
    points.push({
      id: `${routeId}-route-start-staging-exit`,
      name: `${routeSummary.name} start / staging return`,
      type: 'route_start',
      location: routeSummary.startCoordinate,
      routeMileMarker: 0,
      distanceFromRouteMiles: 0,
      priority: 3,
      source: 'ecs_route_start_reference',
      notes: [
        'ECS is using the route start as a conservative return/staging reference.',
        'This does not confirm fuel, water, repairs, or alternate pavement access.',
      ],
    });
  }
  const routeClueBailout = inferEmergencyBailoutFromRouteClues(route, routeId, routeSummary);
  const inferredBailout = routeClueBailout ?? inferMidRouteEmergencyBailoutPoint(routeId, routeSummary, coordinates);
  if (inferredBailout) points.push(inferredBailout);
  return points;
}

function resupplyCategoryFromStopType(type: TripPlanStop['type']): ResupplyPoint['category'] | null {
  if (type === 'fuel') return 'fuel';
  if (type === 'water') return 'water';
  if (type === 'supply') return 'food_supplies';
  if (type === 'repair') return 'repair';
  if (type === 'medical') return 'medical';
  if (type === 'exit') return 'exit_access';
  return null;
}

function resupplyPointFromRecord(value: unknown, index: number): ResupplyPoint | null {
  const record = asRecord(value);
  if (!record) return null;
  const stopType = routePointCategory(record);
  const category = stopType ? resupplyCategoryFromStopType(stopType) : null;
  if (!category) return null;
  return {
    id: String(record.id ?? `route-support-${index + 1}`),
    name: recordLabel(record, `${category.replace(/_/g, ' ')} point`),
    category,
    location: toRouteCoordinate(record.location ?? record.coordinate ?? record.point ?? record),
    routeMileMarker: finiteNumber(record.routeMileMarker) ?? finiteNumber(record.mileMarker),
    distanceFromRouteMiles: finiteNumber(record.distanceFromRouteMiles),
    distanceFromStartMiles: finiteNumber(record.distanceFromStartMiles),
    distanceFromEndMiles: finiteNumber(record.distanceFromEndMiles),
    reliability: normalizeConfidence(record.reliability ?? record.confidence),
    source: sourceFromRecord(record, 'route_support_metadata'),
    notes: Array.isArray(record.notes) ? record.notes.map(String) : null,
  };
}

function deriveResupplyPointsFromRoute(route: TripBuilderRouteInput): ResupplyPoint[] {
  const explicit = collectRouteArrays(route, RESUPPLY_FIELD_KEYS);
  const waypoints = Array.isArray(route.waypoints) ? route.waypoints : [];
  const seen = new Set<string>();
  return [...explicit, ...waypoints]
    .map(resupplyPointFromRecord)
    .filter((point): point is ResupplyPoint => {
      if (!point) return false;
      const key = `${point.category}:${point.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildRecommendedDeparture(args: BuildTripPlanArgs, driveTimeHours: number | null, needsCamping: boolean): string | null {
  if (args.input.plannedDepartureAt) return args.input.plannedDepartureAt;
  if (args.input.customWindow?.startIso) return args.input.customWindow.startIso;
  if (args.input.timeWindow === 'morning') return 'Morning departure recommended.';
  if (args.input.timeWindow === 'afternoon') return driveTimeHours != null && driveTimeHours > 3
    ? 'Afternoon departure may be tight; confirm daylight and camp timing before committing.'
    : 'Afternoon departure is acceptable if daylight remains available.';
  if (needsCamping) return 'Depart early enough to reach camp before dark; daylight data is not available.';
  if (args.input.timeWindow === 'full_day') return 'Use a full-day departure window and confirm return timing before starting.';
  return null;
}

function buildWaypointStops(
  routeId: string,
  route: TripBuilderRouteInput,
  priorities: TripPriority[],
  tripType: TripType,
): TripPlanStop[] {
  if (!Array.isArray(route.waypoints)) return [];
  const shouldUseWaypoints =
    tripType === 'weekend_overland' ||
    tripType === 'multi_day_expedition' ||
    priorities.includes('scenic_stops') ||
    priorities.includes('photography_overlooks');
  if (!shouldUseWaypoints) return [];

  return route.waypoints.slice(0, MAX_SCENIC_WAYPOINT_STOPS).map((waypoint, index) => {
    const record = waypoint && typeof waypoint === 'object' ? waypoint as Record<string, unknown> : {};
    const title = String(record.name ?? record.title ?? `Waypoint ${index + 1}`);
    return {
      id: `${routeId}-waypoint-${index + 1}`,
      type: priorities.includes('scenic_stops') || priorities.includes('photography_overlooks') ? 'scenic_stop' : 'waypoint',
      title,
      sequence: index + 2,
      plannedDay: 1,
      coordinate: toRouteCoordinate(waypoint) ?? null,
      routeMileMarker: finiteNumber(record.routeMileMarker),
      etaOffsetHours: null,
      source: 'route_waypoint',
      confidence: toRouteCoordinate(waypoint) ? 'medium' : 'low',
      notes: ['Imported from selected route waypoint data.'],
    };
  });
}

function routePointStopTitle(type: TripPlanStop['type'], name: string): string {
  if (type === 'fuel') return `Fuel: ${name}`;
  if (type === 'water') return `Water: ${name}`;
  if (type === 'supply') return `Supplies: ${name}`;
  if (type === 'repair') return `Repair: ${name}`;
  if (type === 'medical') return `Medical: ${name}`;
  if (type === 'ranger_station') return `Ranger / agency: ${name}`;
  if (type === 'exit') return `Bailout / exit: ${name}`;
  return name;
}

function buildSupportStops(
  routeId: string,
  route: TripBuilderRouteInput,
  suppliedResupplyPoints: ResupplyPoint[],
): TripPlanStop[] {
  const rawRoutePoints = [
    ...(Array.isArray(route.waypoints) ? route.waypoints : []),
    ...collectRouteArrays(route, RESUPPLY_FIELD_KEYS),
    ...collectRouteArrays(route, EXIT_FIELD_KEYS),
  ];
  const waypointStops = rawRoutePoints
    .map((value, index): TripPlanStop | null => {
      const record = asRecord(value);
      if (!record) return null;
      const type = routePointCategory(record);
      if (!type || type === 'camp' || type === 'scenic_stop') return null;
      const coordinate = toRouteCoordinate(record.location ?? record.coordinate ?? record.point ?? record);
      return {
        id: `${routeId}-support-${String(record.id ?? index + 1)}`,
        type,
        title: routePointStopTitle(type, recordLabel(record, `Support point ${index + 1}`)),
        sequence: 1,
        plannedDay: 1,
        coordinate,
        routeMileMarker: finiteNumber(record.routeMileMarker) ?? finiteNumber(record.mileMarker),
        etaOffsetHours: null,
        source: sourceFromRecord(record, 'route_support_metadata'),
        confidence: coordinate || finiteNumber(record.routeMileMarker) != null ? 'medium' : 'low',
        notes: Array.isArray(record.notes)
          ? record.notes.map(String)
          : ['Support point supplied by selected route data. Verify current availability before departure.'],
      };
    })
    .filter((stop): stop is TripPlanStop => stop != null);

  const resupplyStops = suppliedResupplyPoints.map((point, index): TripPlanStop => {
    const type =
      point.category === 'fuel' ? 'fuel' :
      point.category === 'water' ? 'water' :
      point.category === 'food_supplies' ? 'supply' :
      point.category === 'repair' ? 'repair' :
      point.category === 'medical' ? 'medical' :
      'exit';
    return {
      id: `${routeId}-resupply-${point.id || index + 1}`,
      type,
      title: routePointStopTitle(type, point.name),
      sequence: 1,
      plannedDay: 1,
      coordinate: point.location ?? null,
      routeMileMarker: finiteNumber(point.routeMileMarker),
      etaOffsetHours: null,
      source: point.source ?? 'resupply_point',
      confidence: normalizeConfidence(point.reliability),
      notes: point.notes ?? ['Support point supplied by route planning data. Verify current availability before departure.'],
    };
  });

  const seen = new Set<string>();
  return [...waypointStops, ...resupplyStops]
    .filter((stop) => {
      const key = `${stop.type}:${stop.title.toLowerCase()}:${stop.routeMileMarker ?? 'na'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => (left.routeMileMarker ?? -1) - (right.routeMileMarker ?? -1))
    .slice(0, MAX_SUPPORT_STOPS);
}

function nearestCampForMile(
  camps: CampCandidate[],
  targetMile: number,
  usedCampIds: Set<string>,
  routeDistanceMiles: number | null,
): CampCandidate | null {
  if (!routeDistanceMiles) return null;
  const maxDelta = Math.max(8, routeDistanceMiles / 10);
  return [...camps]
    .filter((camp) => !usedCampIds.has(camp.id) && finiteNumber(camp.routeMileMarker) != null)
    .map((camp) => ({ camp, delta: Math.abs((finiteNumber(camp.routeMileMarker) ?? 0) - targetMile) }))
    .filter((entry) => entry.delta <= maxDelta)
    .sort((left, right) => left.delta - right.delta || scoreCampCandidate(right.camp) - scoreCampCandidate(left.camp))[0]?.camp ?? null;
}

function buildDailyPlanningStops(
  routeId: string,
  tripDays: number,
  route: TripPlanRouteSummary,
  camps: CampCandidate[],
  usedCampIds: Set<string>,
): TripPlanStop[] {
  if (tripDays <= 1 || route.distanceMiles == null) return [];
  const stops: TripPlanStop[] = [];
  for (let day = 1; day < tripDays; day += 1) {
    const targetMile = roundTenths((route.distanceMiles / tripDays) * day);
    if (targetMile == null) continue;
    const camp = nearestCampForMile(camps, targetMile, usedCampIds, route.distanceMiles);
    if (camp) {
      usedCampIds.add(camp.id);
      stops.push({
        ...stopFromCamp(routeId, camp, 'camp', stops.length + 1),
        plannedDay: day,
        notes: [
          ...(camp.notes ?? []),
          `Route-aware overnight target for day ${day}. Verify current access and availability before committing.`,
        ],
      });
      continue;
    }
    stops.push({
      id: `${routeId}-day-${day}-camp-window`,
      type: 'camp_search',
      title: `Day ${day} camp search window`,
      sequence: stops.length + 1,
      plannedDay: day,
      coordinate: null,
      routeMileMarker: targetMile,
      etaOffsetHours: route.estimatedDriveTimeHours != null ? roundTenths((route.estimatedDriveTimeHours / tripDays) * day) : null,
      source: 'route_distance_planning',
      confidence: 'low',
      notes: [
        'No named camp candidate is available near this planning window.',
        'Use this mile marker as the point to begin looking for a legal, suitable camp before daylight margin tightens.',
      ],
    });
  }
  return stops;
}

function stopFromCamp(routeId: string, candidate: CampCandidate, type: 'camp' | 'backup_camp', sequence: number): TripPlanStop {
  return {
    id: `${routeId}-${type}-${candidate.id}`,
    type,
    title: candidate.name,
    sequence,
    plannedDay: type === 'camp' ? 1 : 2,
    coordinate: candidate.location ?? null,
    routeMileMarker: finiteNumber(candidate.routeMileMarker),
    etaOffsetHours: null,
    source: candidate.source ?? 'camp_candidate',
    confidence: normalizeConfidence(candidate.legalConfidence) === 'unknown'
      ? normalizeConfidence(candidate.accessConfidence)
      : normalizeConfidence(candidate.legalConfidence),
    notes: candidate.notes ?? undefined,
  };
}

function stopFromExit(routeId: string, exit: ExitPoint, sequence: number): TripPlanStop {
  return {
    id: `${routeId}-exit-${exit.id}`,
    type: 'exit',
    title: exit.name,
    sequence,
    plannedDay: 1,
    coordinate: exit.location ?? null,
    routeMileMarker: finiteNumber(exit.routeMileMarker),
    etaOffsetHours: null,
    source: exit.source ?? 'exit_point',
    confidence: exit.location ? 'medium' : 'low',
    notes: exit.notes ?? undefined,
  };
}

function computeStopMile(stop: TripPlanStop, routeDistanceMiles: number | null): number | null {
  if (stop.routeMileMarker != null) return stop.routeMileMarker;
  if (routeDistanceMiles == null) return null;
  if (stop.type === 'start') return 0;
  if (stop.type === 'finish') return routeDistanceMiles;
  if (stop.type === 'camp') return routeDistanceMiles * 0.62;
  if (stop.type === 'backup_camp') return routeDistanceMiles * 0.72;
  if (stop.type === 'exit') return routeDistanceMiles * 0.5;
  return null;
}

function isPreRouteSupportStop(stop: TripPlanStop): boolean {
  return (stop.type === 'fuel' || stop.type === 'supply') && (stop.routeMileMarker ?? 0) <= 0;
}

function preRouteSupportStopOrder(stop: TripPlanStop): number {
  if (stop.type === 'fuel') return 0;
  if (stop.type === 'supply') return 1;
  return 2;
}

function riskFromInputs(route: TripPlanRouteSummary, priorities: TripPriority[]): TripPlanSegment['riskLevel'] {
  if (priorities.includes('low_risk')) return 'low';
  if ((route.remotenessScore ?? 0) >= 8 || route.difficulty === 'technical') return 'high';
  if ((route.remotenessScore ?? 0) >= 6 || route.difficulty === 'hard') return 'elevated';
  if ((route.remotenessScore ?? 0) >= 4 || route.difficulty === 'moderate') return 'moderate';
  return 'unknown';
}

function buildSegments(stops: TripPlanStop[], route: TripPlanRouteSummary, priorities: TripPriority[]): TripPlanSegment[] {
  if (stops.length < 2) return [];
  const sorted = [...stops].sort((left, right) => left.sequence - right.sequence);
  const miles = sorted.map((stop) => computeStopMile(stop, route.distanceMiles));
  const totalTime = route.estimatedDriveTimeHours;

  return sorted.slice(1).map((stop, index) => {
    const previous = sorted[index];
    const fromMile = miles[index];
    const toMile = miles[index + 1];
    const distance = fromMile != null && toMile != null ? Math.max(0, toMile - fromMile) : null;
    const driveTime = distance != null && route.distanceMiles && totalTime
      ? (distance / route.distanceMiles) * totalTime
      : null;
    return {
      id: `${route.routeId}-segment-${index + 1}`,
      fromStopId: previous.id,
      toStopId: stop.id,
      title: `${previous.title} to ${stop.title}`,
      day: stop.plannedDay,
      distanceMiles: roundTenths(distance),
      estimatedDriveTimeHours: roundTenths(driveTime),
      notes: priorities.includes('low_risk') ? ['Low-risk planning priority selected; verify exits before departure.'] : [],
      riskLevel: riskFromInputs(route, priorities),
    };
  });
}

function addNote(notes: TripBuilderNote[], note: TripBuilderNote): void {
  if (!notes.some((item) => item.id === note.id)) notes.push(note);
}

function addWarning(warnings: TripBuilderWarning[], warning: TripBuilderWarning): void {
  if (!warnings.some((item) => item.id === warning.id)) warnings.push(warning);
}

export function buildTripPlan(args: BuildTripPlanArgs): TripPlan {
  const generatedAt = args.capturedAt ?? new Date().toISOString();
  const priorities = args.input.priorities ?? [];
  const { summary: routeSummary, coordinates: routeCoordinates } = buildRouteSummary(args.route);
  const routeId = routeSummary.routeId;
  const tripDays = plannedDaysForTrip(args.input.tripType, routeSummary.estimatedDays);
  const needsCamping = tripTypeNeedsCamping(args.input.tripType, priorities);
  const routeDerivedCampCandidates = deriveCampCandidatesFromRoute(args.route, routeId);
  const suppliedCampCandidates = [
    ...(args.campsiteCandidates ?? []),
    ...routeDerivedCampCandidates,
  ];
  const inferredCampCandidates = needsCamping && suppliedCampCandidates.length === 0
    ? inferCampCandidatesFromRoute(args.route, routeId, routeSummary, routeCoordinates, tripDays)
    : [];
  const campsiteCandidates = [
    ...suppliedCampCandidates,
    ...inferredCampCandidates,
  ];
  const suppliedExitPoints = args.exitPoints && args.exitPoints.length > 0
    ? args.exitPoints
    : deriveExitPointsFromRoute(args.route, routeId);
  const inferredExitPoints = suppliedExitPoints.length === 0
    ? inferExitPointsFromRoute(args.route, routeId, routeSummary, routeCoordinates)
    : [];
  const exitPoints = [
    ...suppliedExitPoints,
    ...inferredExitPoints,
  ];
  const routeDerivedResupplyPoints = deriveResupplyPointsFromRoute(args.route);
  const resupplyPoints = [
    ...(args.resupplyPoints ?? []),
    ...routeDerivedResupplyPoints,
  ];
  const { primary: primaryCampCandidate, backup: backupCampCandidate } = selectCampCandidates(campsiteCandidates);
  const primaryExitPoint = selectPrimaryExitPoint(exitPoints);
  const notes: TripBuilderNote[] = [];
  const warnings: TripBuilderWarning[] = [];

  const estimateBasis: string[] = [];
  if (routeSummary.distanceMiles != null) estimateBasis.push('selected route distance');
  if (routeSummary.estimatedDriveTimeHours != null) estimateBasis.push('route travel-time estimate');
  if (routeSummary.estimatedDriveTimeHours == null && routeSummary.distanceMiles != null) estimateBasis.push('distance-based trail-speed estimate');

  if (!args.vehicleProfile) {
    addNote(notes, {
      id: 'vehicle_profile_missing',
      message: 'Vehicle profile data unavailable. Vehicle-specific confidence is limited.',
      source: 'vehicle',
    });
  }

  if (needsCamping && !primaryCampCandidate) {
    addNote(notes, {
      id: 'camp_candidate_missing',
      message: 'No known camp source detected for this trip plan. Verify before departure.',
      source: 'camp',
    });
  }

  if (needsCamping && inferredCampCandidates.length > 0) {
    addNote(notes, {
      id: 'camp_candidate_inferred',
      message: 'ECS added route-derived camp planning windows. Treat them as scouting targets until legal access and conditions are verified.',
      source: 'camp',
    });
  }

  if (!primaryExitPoint) {
    addWarning(warnings, {
      id: 'exit_points_missing',
      message: 'Exit access data unavailable for this route. Verify before departure.',
      severity: priorities.includes('low_risk') || priorities.includes('remote_travel') ? 'caution' : 'watch',
      source: 'exit',
    });
  }

  if (inferredExitPoints.length > 0) {
    addWarning(warnings, {
      id: 'exit_points_emergency_bailout_inferred',
      message: 'No confirmed dedicated bailout point was supplied. ECS inferred an emergency bailout target near a route fork or mid-route road-access search area; verify legal access, addressability, and drivability before relying on it.',
      severity: priorities.includes('low_risk') || priorities.includes('remote_travel') ? 'caution' : 'watch',
      source: 'exit',
    });
  }

  if (priorities.includes('remote_travel')) {
    addWarning(warnings, {
      id: 'remote_travel_preparation',
      message: 'Remote travel priority selected. Verify fuel range, communications, offline maps, service gaps, and recovery gear before departure.',
      severity: 'caution',
      source: 'planning',
    });
  }

  if (priorities.includes('low_risk') && primaryExitPoint) {
    addNote(notes, {
      id: 'low_risk_exit_priority',
      message: `Low-risk priority selected; primary exit is ${primaryExitPoint.name}.`,
      source: 'exit',
    });
  }

  if (routeSummary.permitRequired) {
    addWarning(warnings, {
      id: 'permit_review_required',
      message: 'Permit or agency review may be required. Verify before departure.',
      severity: 'caution',
      source: 'route',
    });
  }

  if (routeSummary.routeDataConfidence === 'low' || routeSummary.routeDataConfidence === 'unknown') {
    addWarning(warnings, {
      id: 'route_geometry_limited',
      message: 'Route geometry or distance data is limited. Verify before active guidance.',
      severity: 'watch',
      source: 'route',
    });
  }

  if (args.readiness) {
    addNote(notes, {
      id: 'readiness_reference_available',
      message: 'Route readiness is attached as a reference. Trip Builder does not replace route-card readiness.',
      source: 'readiness',
    });
  }

  const supportStops = buildSupportStops(routeId, args.route, resupplyPoints);
  const preRouteSupportStops = supportStops.filter(isPreRouteSupportStop);
  const inRouteSupportStops = supportStops.filter((stop) => !isPreRouteSupportStop(stop));
  const usedCampIds = new Set<string>();
  if (inferredCampCandidates.length === 0) {
    if (primaryCampCandidate) usedCampIds.add(primaryCampCandidate.id);
    if (backupCampCandidate) usedCampIds.add(backupCampCandidate.id);
  }
  const dailyPlanningStops = needsCamping
    ? buildDailyPlanningStops(routeId, tripDays, routeSummary, campsiteCandidates, usedCampIds)
    : [];

  const stops: TripPlanStop[] = [
    ...preRouteSupportStops,
    {
      id: `${routeId}-start`,
      type: 'start',
      title: `${routeSummary.name} start`,
      sequence: 1,
      plannedDay: 1,
      coordinate: routeSummary.startCoordinate,
      routeMileMarker: 0,
      etaOffsetHours: 0,
      source: 'selected_route',
      confidence: routeSummary.startCoordinate ? 'medium' : 'low',
    },
    ...inRouteSupportStops,
    ...buildWaypointStops(routeId, args.route, priorities, args.input.tripType),
    ...dailyPlanningStops,
  ];

  if (needsCamping && primaryCampCandidate && !stops.some((stop) => stop.id.includes(primaryCampCandidate.id))) {
    stops.push(stopFromCamp(routeId, primaryCampCandidate, 'camp', stops.length + 1));
  }

  if (
    needsCamping &&
    backupCampCandidate &&
    !stops.some((stop) => stop.id.includes(backupCampCandidate.id)) &&
    (args.input.tripType === 'weekend_overland' || args.input.tripType === 'multi_day_expedition' || priorities.includes('low_risk'))
  ) {
    stops.push(stopFromCamp(routeId, backupCampCandidate, 'backup_camp', stops.length + 1));
  }

  if (
    primaryExitPoint &&
    !stops.some((stop) => stop.type === 'exit' && stop.title.includes(primaryExitPoint.name)) &&
    (priorities.includes('low_risk') || priorities.includes('remote_travel') || args.input.tripType === 'multi_day_expedition')
  ) {
    stops.push(stopFromExit(routeId, primaryExitPoint, stops.length + 1));
  }

  stops.push({
    id: `${routeId}-finish`,
    type: 'finish',
    title: `${routeSummary.name} finish`,
    sequence: stops.length + 1,
    plannedDay: tripDays,
    coordinate: routeSummary.endCoordinate,
    routeMileMarker: routeSummary.distanceMiles,
    etaOffsetHours: routeSummary.estimatedDriveTimeHours,
    source: 'selected_route',
    confidence: routeSummary.endCoordinate ? 'medium' : 'low',
  });

  const orderedStops = [...stops].sort((left, right) => {
    const leftPreRouteSupport = isPreRouteSupportStop(left);
    const rightPreRouteSupport = isPreRouteSupportStop(right);
    if (leftPreRouteSupport && rightPreRouteSupport) {
      return preRouteSupportStopOrder(left) - preRouteSupportStopOrder(right) || left.sequence - right.sequence;
    }
    if (leftPreRouteSupport && right.type === 'start') return -1;
    if (rightPreRouteSupport && left.type === 'start') return 1;
    if (leftPreRouteSupport && !rightPreRouteSupport) return -1;
    if (rightPreRouteSupport && !leftPreRouteSupport) return 1;
    if (left.type === 'start') return -1;
    if (right.type === 'start') return 1;
    if (left.type === 'finish') return 1;
    if (right.type === 'finish') return -1;
    const leftMile = computeStopMile(left, routeSummary.distanceMiles);
    const rightMile = computeStopMile(right, routeSummary.distanceMiles);
    if (leftMile != null && rightMile != null && leftMile !== rightMile) return leftMile - rightMile;
    if (left.plannedDay !== right.plannedDay) return left.plannedDay - right.plannedDay;
    return left.sequence - right.sequence;
  });
  const normalizedStops = orderedStops.map((stop, index) => ({ ...stop, sequence: index + 1 }));
  const segments = buildSegments(normalizedStops, routeSummary, priorities);

  if (args.input.tripType === 'day_trip') {
    addNote(notes, {
      id: 'day_trip_completion_focus',
      message: 'Day trip plan prioritizes a simple start-to-finish itinerary and same-day completion.',
      source: 'planning',
    });
  }

  const plan: TripPlan = {
    id: `trip-plan-${routeId}`,
    generatedAt,
    route: routeSummary,
    tripType: args.input.tripType,
    timeWindow: args.input.timeWindow,
    groupType: args.input.groupType,
    priorities,
    estimate: {
      totalDistanceMiles: routeSummary.distanceMiles,
      driveTimeHours: routeSummary.estimatedDriveTimeHours,
      tripDays,
      fuelRequiredGallons: null,
      confidence: routeSummary.routeDataConfidence,
      basis: estimateBasis.length > 0 ? estimateBasis : ['route metadata unavailable'],
    },
    recommendedDeparture: buildRecommendedDeparture(args, routeSummary.estimatedDriveTimeHours, needsCamping),
    suggestedStops: normalizedStops,
    segments,
    primaryCampCandidate: needsCamping ? primaryCampCandidate : null,
    backupCampCandidate: needsCamping ? backupCampCandidate : null,
    primaryExitPoint,
    notes,
    warnings,
    readinessReference: args.readiness ?? null,
    smartResupplyPlan: null,
  };

  return {
    ...plan,
    smartResupplyPlan: buildSmartResupplyPlan({
      route: args.route,
      tripPlan: plan,
      vehicleProfile: args.vehicleProfile,
      userLocation: args.currentLocation,
      resupplyPoints,
      availablePoiData: args.availablePoiData,
      exitPoints,
      capturedAt: generatedAt,
    }),
  };
}

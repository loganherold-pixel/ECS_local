import { Platform } from 'react-native';
import { createPersistedKeyValueCache } from './keyValuePersistence';

import type { RoadNavCoordinate, RoadNavDestination } from './mapboxRoadNavigation';
import type { ExpeditionOpportunity } from './discoverEngine';
import {
  extractExploreRouteCampMarkers,
  type ExploreRouteCampMarker,
} from './exploreRouteCampHandoff';

const STORAGE_KEY = 'ecs_hybrid_navigation_handoff_v1';
const nativeNavigationHandoffCache = createPersistedKeyValueCache('ecs_navigation_handoff');

export type NavigationHandoffSource = 'search' | 'explore' | 'saved' | 'import' | 'dispatch';
export type NavigationHandoffType =
  | 'address'
  | 'place'
  | 'trail'
  | 'trailhead'
  | 'hybrid_route';
export type NavigationTripMode = 'road' | 'trail' | 'hybrid';
export type NavigationRouteSource =
  | 'gpx'
  | 'cached_gpx'
  | 'built'
  | 'explore'
  | 'drawn'
  | 'saved'
  | 'search'
  | 'dispatch_recovery';

export interface NavigationTrailWaypoint {
  id: string;
  coordinate: RoadNavCoordinate;
  name: string | null;
  type: string | null;
  note?: string | null;
  routeIndex?: number | null;
  reachedRadiusM?: number | null;
}

export interface NavigationTrailDecisionPoint {
  id: string;
  coordinate: RoadNavCoordinate;
  type:
    | 'fork_left'
    | 'fork_right'
    | 'continue'
    | 'waypoint'
    | 'gate'
    | 'hazard'
    | 'landmark'
    | 'summit'
    | 'junction';
  instructionText?: string | null;
  landmarkName?: string | null;
  confidence?: number | null;
  routeIndex?: number | null;
  advanceRadiusM?: number | null;
  displayRadiusM?: number | null;
  icon?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface NavigationHandoffPayload {
  id: string;
  source: NavigationHandoffSource;
  type: NavigationHandoffType;
  title: string;
  subtitle: string | null;
  coordinate: RoadNavCoordinate | null;
  trailheadCoordinate: RoadNavCoordinate | null;
  roadDestinationCoordinate: RoadNavCoordinate | null;
  trailGeometry: RoadNavCoordinate[];
  trailLengthMiles: number | null;
  trailCategory: string | null;
  tripMode: NavigationTripMode | null;
  routeSource?: NavigationRouteSource;
  requiresOnlineRouting?: boolean;
  trailWaypoints: NavigationTrailWaypoint[];
  trailDecisionPoints: NavigationTrailDecisionPoint[];
  campMarkers?: ExploreRouteCampMarker[];
  routeMetadata: Record<string, unknown> | null;
  landmarkMetadata: Record<string, unknown> | null;
  raw: unknown;
  createdAt: string;
}

export function getNavigationHandoffRouteUnavailableReason(
  payload: Pick<
    NavigationHandoffPayload,
    'coordinate' | 'trailheadCoordinate' | 'roadDestinationCoordinate' | 'trailGeometry'
  > | null | undefined,
): string | null {
  if (!payload) return 'Route path unavailable.';
  const hasGeometry = Array.isArray(payload.trailGeometry) && payload.trailGeometry.length > 1;
  const hasCoordinate =
    !!payload.coordinate ||
    !!payload.trailheadCoordinate ||
    !!payload.roadDestinationCoordinate;

  return hasGeometry || hasCoordinate ? null : 'Route path unavailable.';
}

export function canStageNavigationHandoffRoute(
  payload: Pick<
    NavigationHandoffPayload,
    'coordinate' | 'trailheadCoordinate' | 'roadDestinationCoordinate' | 'trailGeometry'
  > | null | undefined,
): boolean {
  return getNavigationHandoffRouteUnavailableReason(payload) == null;
}

function isCoordinate(value: unknown): value is RoadNavCoordinate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return Number.isFinite(Number(candidate.lat)) && Number.isFinite(Number(candidate.lng));
}

function normalizeCoordinate(value: unknown): RoadNavCoordinate | null {
  if (!value) return null;
  if (isCoordinate(value)) {
    return {
      lat: Number(value.lat),
      lng: Number(value.lng),
    };
  }

  if (Array.isArray(value) && value.length >= 2) {
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    const lat = Number(candidate.lat ?? candidate.latitude ?? candidate.y);
    const lng = Number(candidate.lng ?? candidate.lon ?? candidate.longitude ?? candidate.x);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return null;
}

function normalizeGeometry(value: unknown): RoadNavCoordinate[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    const points = value
      .map((entry) => normalizeCoordinate(entry))
      .filter((entry): entry is RoadNavCoordinate => !!entry);
    if (points.length > 1) return points;
  }

  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    const nested =
      candidate.coordinates ??
      candidate.geometry ??
      candidate.points ??
      candidate.path ??
      candidate.polyline;

    if (nested && nested !== value) {
      return normalizeGeometry(nested);
    }

    if (Array.isArray(candidate.segments)) {
      const fromSegments = (candidate.segments as unknown[]).flatMap((segment) =>
        normalizeGeometry(segment),
      );
      if (fromSegments.length > 1) return fromSegments;
    }
  }

  return [];
}

function estimateRouteIndex(
  coordinate: RoadNavCoordinate,
  geometry: RoadNavCoordinate[],
): number | null {
  if (geometry.length === 0) return null;
  let bestIndex = 0;
  let bestDistance = Infinity;

  for (let i = 0; i < geometry.length; i += 1) {
    const point = geometry[i];
    const distance = haversineMiles(coordinate, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function normalizeTrailWaypoints(
  value: unknown,
  geometry: RoadNavCoordinate[],
): NavigationTrailWaypoint[] {
  if (!value || typeof value !== 'object') return [];
  const candidate = value as Record<string, unknown>;
  const rawWaypoints =
    candidate.waypoints ??
    candidate.routeWaypoints ??
    candidate.route_waypoints ??
    candidate.rawWaypoints ??
    candidate.raw_waypoints;

  if (!Array.isArray(rawWaypoints)) return [];

  const normalized: NavigationTrailWaypoint[] = [];
  rawWaypoints.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const coordinate = normalizeCoordinate(record.coordinate ?? record);
    if (!coordinate) return;

    normalized.push({
      id: String(record.id ?? record.name ?? `trail-wp-${index}`),
      coordinate,
      name:
        typeof record.name === 'string'
          ? record.name
          : typeof record.title === 'string'
            ? record.title
            : null,
      type:
        typeof record.type === 'string'
          ? record.type
          : typeof record.waypointType === 'string'
            ? record.waypointType
            : null,
      note: typeof record.note === 'string' ? record.note : null,
      routeIndex:
        Number.isFinite(Number(record.routeIndex))
          ? Number(record.routeIndex)
          : estimateRouteIndex(coordinate, geometry),
      reachedRadiusM: Number.isFinite(Number(record.reachedRadiusM))
        ? Number(record.reachedRadiusM)
        : 35,
    });
  });

  return normalized.sort(
    (a, b) =>
      (a.routeIndex ?? Number.MAX_SAFE_INTEGER) -
      (b.routeIndex ?? Number.MAX_SAFE_INTEGER),
  );
}

function normalizeTrailDecisionPoints(
  value: unknown,
  geometry: RoadNavCoordinate[],
): NavigationTrailDecisionPoint[] {
  if (!value || typeof value !== 'object') return [];
  const candidate = value as Record<string, unknown>;
  const rawDecisionPoints =
    candidate.decisionPoints ??
    candidate.decision_points ??
    candidate.routeDecisionPoints ??
    candidate.route_decision_points;

  if (!Array.isArray(rawDecisionPoints)) return [];

  const normalized: NavigationTrailDecisionPoint[] = [];
  rawDecisionPoints.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const coordinate = normalizeCoordinate(record.coordinate ?? record);
    if (!coordinate) return;
    const typeValue = typeof record.type === 'string' ? record.type : 'junction';
    const type = [
      'fork_left',
      'fork_right',
      'continue',
      'waypoint',
      'gate',
      'hazard',
      'landmark',
      'summit',
      'junction',
    ].includes(typeValue)
      ? (typeValue as NavigationTrailDecisionPoint['type'])
      : 'junction';

    normalized.push({
      id: String(record.id ?? `trail-decision-${index}`),
      coordinate,
      type,
      instructionText:
        typeof record.instructionText === 'string'
          ? record.instructionText
          : typeof record.instruction_text === 'string'
            ? record.instruction_text
            : null,
      landmarkName:
        typeof record.landmarkName === 'string'
          ? record.landmarkName
          : typeof record.landmark_name === 'string'
            ? record.landmark_name
            : null,
      confidence: Number.isFinite(Number(record.confidence))
        ? Number(record.confidence)
        : null,
      routeIndex:
        Number.isFinite(Number(record.routeIndex))
          ? Number(record.routeIndex)
          : estimateRouteIndex(coordinate, geometry),
      advanceRadiusM: Number.isFinite(Number(record.advanceRadiusM))
        ? Number(record.advanceRadiusM)
        : 25,
      displayRadiusM: Number.isFinite(Number(record.displayRadiusM))
        ? Number(record.displayRadiusM)
        : 150,
      icon: typeof record.icon === 'string' ? record.icon : null,
      metadata:
        record.metadata && typeof record.metadata === 'object'
          ? (record.metadata as Record<string, unknown>)
          : null,
    });
  });

  return normalized.sort(
    (a, b) =>
      (a.routeIndex ?? Number.MAX_SAFE_INTEGER) -
      (b.routeIndex ?? Number.MAX_SAFE_INTEGER),
  );
}

function extractTrailGeometry(value: unknown): RoadNavCoordinate[] {
  if (!value || typeof value !== 'object') return [];
  const candidate = value as Record<string, unknown>;
  const fields = [
    candidate.trailGeometry,
    candidate.trail_geometry,
    candidate.geometry,
    candidate.routeGeometry,
    candidate.route_geometry,
    candidate.polyline,
    candidate.raw,
    candidate.route_metadata,
    candidate.routeMetadata,
  ];

  for (const field of fields) {
    const geometry = normalizeGeometry(field);
    if (geometry.length > 1) return geometry;
  }

  return [];
}

function extractRoadCoordinate(value: unknown): RoadNavCoordinate | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const fields = [
    candidate.roadDestinationCoordinate,
    candidate.road_destination_coordinate,
    candidate.roadAccessCoordinate,
    candidate.road_access_coordinate,
    candidate.roadAccessEndpoint,
    candidate.road_access_endpoint,
    candidate.accessPoint,
    candidate.access_point,
    candidate.trailheadCoordinate,
    candidate.trailhead_coordinate,
  ];

  for (const field of fields) {
    const coordinate = normalizeCoordinate(field);
    if (coordinate) return coordinate;
  }

  return null;
}

function extractFinalCoordinate(value: unknown): RoadNavCoordinate | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const routeMetadata =
    candidate.routeMetadata && typeof candidate.routeMetadata === 'object'
      ? (candidate.routeMetadata as Record<string, unknown>)
      : candidate.route_metadata && typeof candidate.route_metadata === 'object'
        ? (candidate.route_metadata as Record<string, unknown>)
        : {};
  const fields = [
    candidate.finalDestinationCoordinate,
    candidate.final_destination_coordinate,
    candidate.destinationCoordinate,
    candidate.destination_coordinate,
    candidate.endpointCoordinate,
    candidate.endpoint_coordinate,
    candidate.endCoordinate,
    candidate.end_coordinate,
    candidate.finishCoordinate,
    candidate.finish_coordinate,
    routeMetadata.finalDestinationCoordinate,
    routeMetadata.destinationCoordinate,
    routeMetadata.endpointCoordinate,
    routeMetadata.endCoordinate,
    routeMetadata.finishCoordinate,
  ];

  for (const field of fields) {
    const coordinate = normalizeCoordinate(field);
    if (coordinate) return coordinate;
  }

  return null;
}

function haversineMiles(a: RoadNavCoordinate, b: RoadNavCoordinate): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function computeTrailLengthMiles(points: RoadNavCoordinate[]): number | null {
  if (points.length < 2) return null;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineMiles(points[i - 1], points[i]);
  }
  return Math.round(total * 10) / 10;
}

export function classifyNavigationHandoff(
  payload: Pick<
    NavigationHandoffPayload,
    'tripMode' | 'trailGeometry' | 'roadDestinationCoordinate' | 'trailheadCoordinate' | 'coordinate'
  >,
): NavigationTripMode {
  if (payload.tripMode === 'road' || payload.tripMode === 'trail' || payload.tripMode === 'hybrid') {
    return payload.tripMode;
  }

  const hasTrail = payload.trailGeometry.length > 1;
  const hasRoadAccess = !!(
    payload.roadDestinationCoordinate || payload.trailheadCoordinate
  );

  if (hasTrail && hasRoadAccess) return 'hybrid';
  if (hasTrail) return 'trail';
  return 'road';
}

export function getRoadDestinationCoordinate(
  payload: Pick<
    NavigationHandoffPayload,
    'roadDestinationCoordinate' | 'trailheadCoordinate' | 'coordinate'
  >,
): RoadNavCoordinate | null {
  return payload.roadDestinationCoordinate ?? payload.trailheadCoordinate ?? payload.coordinate;
}

export function toRoadDestinationFromHandoff(
  payload: NavigationHandoffPayload,
): RoadNavDestination | null {
  const coordinate = getRoadDestinationCoordinate(payload);
  if (!coordinate) return null;

  return {
    id: payload.id,
    title: payload.title,
    subtitle: payload.subtitle,
    coordinate,
    sourceType: payload.routeSource === 'dispatch_recovery' ? 'dispatch_recovery' : 'explore_handoff',
    raw: payload.raw,
  };
}

export function buildExploreNavigationPayload(
  route: ExpeditionOpportunity,
): NavigationHandoffPayload {
  const title = String(route.name || 'Trail destination').trim();
  const subtitle = [route.region, route.terrainType].filter(Boolean).join(' • ') || null;
  const routeRecord = route as unknown as Record<string, unknown>;
  const sourceRouteMetadata =
    routeRecord.routeMetadata && typeof routeRecord.routeMetadata === 'object'
      ? (routeRecord.routeMetadata as Record<string, unknown>)
      : {};
  const trailheadCoordinate =
    Number.isFinite(Number(route.startLat)) && Number.isFinite(Number(route.startLng))
      ? { lat: Number(route.startLat), lng: Number(route.startLng) }
      : null;
  const trailGeometry = extractTrailGeometry(route);
  const coordinate =
    normalizeCoordinate(routeRecord.coordinate) ??
    extractFinalCoordinate(route) ??
    (trailGeometry.length > 0 ? trailGeometry[trailGeometry.length - 1] : null) ??
    trailheadCoordinate;
  const roadDestinationCoordinate = extractRoadCoordinate(route);
  const trailWaypoints = normalizeTrailWaypoints(route, trailGeometry);
  const trailDecisionPoints = normalizeTrailDecisionPoints(route, trailGeometry);
  const campMarkers = extractExploreRouteCampMarkers(route);
  const trailLengthMiles =
    Number.isFinite(Number(route.distanceMiles))
      ? Math.round(Number(route.distanceMiles) * 10) / 10
      : computeTrailLengthMiles(trailGeometry);
  const type: NavigationHandoffType =
    trailGeometry.length > 1 && (roadDestinationCoordinate || trailheadCoordinate)
      ? 'hybrid_route'
      : trailGeometry.length > 1
        ? 'trail'
        : trailheadCoordinate
          ? 'trailhead'
          : 'place';

  const payload: NavigationHandoffPayload = {
    id: String(route.id || title),
    source: 'explore',
    type,
    title,
    subtitle,
    coordinate,
    trailheadCoordinate,
    roadDestinationCoordinate,
    trailGeometry,
    trailLengthMiles,
    trailCategory: route.terrainType ?? null,
    tripMode: null,
    routeSource: 'explore',
    requiresOnlineRouting: type === 'hybrid_route' || type === 'place',
    trailWaypoints,
    trailDecisionPoints,
    campMarkers,
    routeMetadata: {
      ...sourceRouteMetadata,
      region: route.region,
      regionGroup: route.regionGroup,
      terrainType: route.terrainType,
      estimatedDays: route.estimatedDays,
      estimatedTravelHours:
        Number.isFinite(Number(routeRecord.estimatedTravelHours))
          ? Number(routeRecord.estimatedTravelHours)
          : null,
      remotenessScore: route.remotenessScore,
      difficultyRating: route.difficultyRating ?? null,
      terrainDifficulty:
        Number.isFinite(Number(routeRecord.terrainDifficulty))
          ? Number(routeRecord.terrainDifficulty)
          : null,
      distanceMiles: route.distanceMiles,
      campSuitability: typeof routeRecord.campSuitability === 'string' ? routeRecord.campSuitability : null,
      suggestedCamps:
        Number.isFinite(Number(routeRecord.suggestedCamps))
          ? Number(routeRecord.suggestedCamps)
          : null,
      routeCampMarkerCount: campMarkers.length,
      cautionNotes: typeof routeRecord.cautionNotes === 'string' ? routeRecord.cautionNotes : null,
    },
    landmarkMetadata: {
      highlights: Array.isArray(route.highlights) ? route.highlights : [],
      localHighlights: Array.isArray(route.localHighlights) ? route.localHighlights : [],
    },
    raw: route,
    createdAt: new Date().toISOString(),
  };

  payload.tripMode = classifyNavigationHandoff(payload);
  return payload;
}

async function readStorage(): Promise<string | null> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY);
    }
    await nativeNavigationHandoffCache.waitForHydration();
    return nativeNavigationHandoffCache.get(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writeStorage(value: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      if (value == null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, value);
      return;
    }
    nativeNavigationHandoffCache.set(STORAGE_KEY, value ?? '');
  } catch {}
}

export async function saveNavigationHandoffPayload(
  payload: NavigationHandoffPayload,
): Promise<void> {
  await writeStorage(JSON.stringify(payload));
}

export async function loadNavigationHandoffPayload(): Promise<NavigationHandoffPayload | null> {
  const raw = await readStorage();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as NavigationHandoffPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    const trailGeometry = normalizeGeometry(parsed.trailGeometry);
    return {
      ...parsed,
      coordinate: normalizeCoordinate(parsed.coordinate),
      trailheadCoordinate: normalizeCoordinate(parsed.trailheadCoordinate),
      roadDestinationCoordinate: normalizeCoordinate(parsed.roadDestinationCoordinate),
      trailGeometry,
      trailWaypoints: normalizeTrailWaypoints(
        { waypoints: parsed.trailWaypoints },
        trailGeometry,
      ),
      trailDecisionPoints: normalizeTrailDecisionPoints(
        { decisionPoints: parsed.trailDecisionPoints },
        trailGeometry,
      ),
      campMarkers: Array.isArray(parsed.campMarkers)
        ? parsed.campMarkers.filter((marker) =>
            Number.isFinite(Number(marker.latitude)) &&
            Number.isFinite(Number(marker.longitude)),
          )
        : [],
      tripMode: classifyNavigationHandoff({
        ...parsed,
        coordinate: normalizeCoordinate(parsed.coordinate),
        trailheadCoordinate: normalizeCoordinate(parsed.trailheadCoordinate),
        roadDestinationCoordinate: normalizeCoordinate(parsed.roadDestinationCoordinate),
        trailGeometry,
      }),
      routeSource: parsed.routeSource,
      requiresOnlineRouting: parsed.requiresOnlineRouting,
    };
  } catch {
    return null;
  }
}

export async function clearNavigationHandoffPayload(): Promise<void> {
  await writeStorage(null);
}

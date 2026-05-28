import { generateGPX } from '../gpxExport';
import {
  buildRemoteMapOverlay,
  type RemoteSegmentFeatureInput,
} from '../remote/mapOverlay';
import type {
  RoadNavCoordinate,
  RoadNavDestination,
} from '../mapboxRoadNavigation';
import type { ImportedRoute, RouteSegment, RouteWaypoint } from '../routeStore';
import type {
  CampCandidate,
  ExitPoint,
  ResupplyPoint,
  TripBuilderCoordinate,
  TripBuilderRouteInput,
} from '../tripBuilder';
import type {
  OfflineMapPreparationAdapter,
  OfflinePrepCriticalMapSegment,
  OfflinePrepPack,
  OfflinePrepPackBounds,
  OfflinePrepPackError,
  OfflinePrepPackInput,
  OfflinePrepPackItem,
  OfflinePrepPackItemAvailability,
  OfflinePrepPackItemType,
  OfflinePrepPackManifest,
  OfflinePrepPackProgress,
  OfflinePrepPackStatus,
} from './offlinePrepPackTypes';

type NormalizedPoint = TripBuilderCoordinate;

const DEFAULT_CORRIDOR_MILES = 3;
const CRITICAL_SEGMENT_CORRIDOR_MILES = 1.5;
const CRITICAL_SEGMENT_ZOOM_MIN = 10;
const CRITICAL_SEGMENT_ZOOM_MAX = 15;
const MAX_CRITICAL_SEGMENTS = 5;
const MAX_AUTO_MAP_AREA_DEGREES = 8;

function finiteNumber(value: unknown): number | null {
  const next = typeof value === 'string' ? Number(value) : value;
  return typeof next === 'number' && Number.isFinite(next) ? next : null;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'offline-prep';
}

function routeName(route: TripBuilderRouteInput): string {
  return String(route.name ?? route.title ?? route.id ?? 'Selected Route');
}

function routeId(route: TripBuilderRouteInput): string {
  return String(route.id ?? route.name ?? route.title ?? 'selected-route');
}

function validCoordinate(latitude: number | null, longitude: number | null): TripBuilderCoordinate | null {
  if (
    latitude == null ||
    longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

function coordinateFromValue(value: unknown): TripBuilderCoordinate | null {
  if (Array.isArray(value)) return validCoordinate(finiteNumber(value[1]), finiteNumber(value[0]));
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return validCoordinate(
    finiteNumber(record.latitude) ?? finiteNumber(record.lat),
    finiteNumber(record.longitude) ?? finiteNumber(record.lng) ?? finiteNumber(record.lon),
  );
}

function coordinatesFromGeoJson(value: unknown): NormalizedPoint[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  if (record.type === 'Feature') return coordinatesFromGeoJson(record.geometry);
  if (record.type === 'FeatureCollection' && Array.isArray(record.features)) {
    return record.features.flatMap(coordinatesFromGeoJson);
  }
  if (record.type === 'LineString' && Array.isArray(record.coordinates)) {
    return record.coordinates.map(coordinateFromValue).filter((point): point is NormalizedPoint => point != null);
  }
  if (record.type === 'MultiLineString' && Array.isArray(record.coordinates)) {
    return record.coordinates.flatMap((line) => Array.isArray(line)
      ? line.map(coordinateFromValue).filter((point): point is NormalizedPoint => point != null)
      : []);
  }
  if (Array.isArray(record.coordinates)) {
    return record.coordinates.map(coordinateFromValue).filter((point): point is NormalizedPoint => point != null);
  }
  return [];
}

function routeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function coordinatesFromRouteGeometryLike(value: unknown, seen = new Set<unknown>()): NormalizedPoint[] {
  if (!value || seen.has(value)) return [];

  if (Array.isArray(value)) {
    const direct = value.map(coordinateFromValue).filter((point): point is NormalizedPoint => point != null);
    if (direct.length >= 2) return direct;
    return value.flatMap((entry) => coordinatesFromRouteGeometryLike(entry, seen));
  }

  const record = routeRecord(value);
  if (!record) return [];
  seen.add(value);

  const geoJson = coordinatesFromGeoJson(record);
  if (geoJson.length >= 2) return geoJson;

  const fields = [
    record.trailGeometry,
    record.trail_geometry,
    record.routeGeometry,
    record.route_geometry,
    record.navigationPayload,
    record.navigation_payload,
    record.handoffPayload,
    record.handoff_payload,
    record.previewPayload,
    record.preview_payload,
    record.geometry,
    record.geojson,
    record.coordinates,
    record.points,
    record.path,
    record.polyline,
    record.raw,
    record.routeMetadata,
    record.route_metadata,
  ];

  for (const field of fields) {
    const points = coordinatesFromRouteGeometryLike(field, seen);
    if (points.length >= 2) return points;
  }

  if (Array.isArray(record.segments)) {
    const points = record.segments.flatMap((segment) => coordinatesFromRouteGeometryLike(segment, seen));
    if (points.length >= 2) return points;
  }

  return [];
}

function routeEndpointCandidate(route: TripBuilderRouteInput): {
  start: NormalizedPoint | null;
  end: NormalizedPoint | null;
} {
  const record = routeRecord(route) ?? {};
  const metadata =
    routeRecord(route.routeMetadata) ??
    routeRecord(record.route_metadata) ??
    {};

  const start = coordinateFromValue(
    typeof route.startLat === 'number' && typeof route.startLng === 'number'
      ? { latitude: route.startLat, longitude: route.startLng }
      : record.trailheadCoordinate ??
        record.trailhead_coordinate ??
        record.startCoordinate ??
        record.start_coordinate ??
        metadata.trailheadCoordinate ??
        metadata.trailhead_coordinate ??
        metadata.startCoordinate ??
        metadata.start_coordinate ??
        route.coordinate,
  );

  const end = coordinateFromValue(
    route.destinationCoordinate ??
      route.endpointCoordinate ??
      route.endCoordinate ??
      record.finalDestinationCoordinate ??
      record.final_destination_coordinate ??
      record.finishCoordinate ??
      record.finish_coordinate ??
      record.roadDestinationCoordinate ??
      record.road_destination_coordinate ??
      metadata.destinationCoordinate ??
      metadata.destination_coordinate ??
      metadata.endpointCoordinate ??
      metadata.endpoint_coordinate ??
      metadata.endCoordinate ??
      metadata.end_coordinate ??
      metadata.finalDestinationCoordinate ??
      metadata.final_destination_coordinate ??
      metadata.finishCoordinate ??
      metadata.finish_coordinate ??
      metadata.roadDestinationCoordinate ??
      metadata.road_destination_coordinate,
  );

  return { start, end };
}

export function getOfflinePrepRouteCoordinates(route: TripBuilderRouteInput): NormalizedPoint[] {
  const geometry = coordinatesFromRouteGeometryLike(route);
  if (geometry.length >= 2) return geometry;

  for (const key of ['trailGeometry', 'routeGeometry'] as const) {
    const value = route[key];
    if (Array.isArray(value)) {
      const points = value.map(coordinateFromValue).filter((point): point is NormalizedPoint => point != null);
      if (points.length >= 2) return points;
    }
  }

  if (Array.isArray(route.segments)) {
    const points = route.segments.flatMap((segment) => {
      if (!segment || typeof segment !== 'object') return [];
      const raw = (segment as { points?: unknown }).points;
      return Array.isArray(raw) ? raw.map(coordinateFromValue).filter((point): point is NormalizedPoint => point != null) : [];
    });
    if (points.length >= 2) return points;
  }

  if (Array.isArray(route.waypoints)) {
    const points = route.waypoints.map(coordinateFromValue).filter((point): point is NormalizedPoint => point != null);
    if (points.length >= 2) return points;
  }

  const { start, end } = routeEndpointCandidate(route);
  return start && end ? [start, end] : [];
}

function routeCoordinatesFromTripPlan(input: OfflinePrepPackInput): NormalizedPoint[] {
  const stops = input.tripPlan?.suggestedStops;
  if (!Array.isArray(stops)) return [];

  const routeStops = stops
    .slice()
    .sort((left, right) => left.sequence - right.sequence)
    .filter((stop) => stop.type !== 'exit')
    .map((stop) => coordinateFromValue(stop.coordinate))
    .filter((point): point is NormalizedPoint => point != null);

  if (routeStops.length >= 2) return routeStops;

  return stops
    .slice()
    .sort((left, right) => left.sequence - right.sequence)
    .map((stop) => coordinateFromValue(stop.coordinate))
    .filter((point): point is NormalizedPoint => point != null);
}

export function getOfflinePrepPackRouteCoordinates(input: OfflinePrepPackInput): NormalizedPoint[] {
  const routePoints = getOfflinePrepRouteCoordinates(input.route);
  if (routePoints.length >= 2) return routePoints;

  const tripPlanPoints = routeCoordinatesFromTripPlan(input);
  return tripPlanPoints.length >= 2 ? tripPlanPoints : routePoints;
}

function toRoadNavCoordinate(point: NormalizedPoint): RoadNavCoordinate {
  return { lat: point.latitude, lng: point.longitude };
}

function samePoint(a: NormalizedPoint, b: NormalizedPoint): boolean {
  return Math.abs(a.latitude - b.latitude) < 0.00001 && Math.abs(a.longitude - b.longitude) < 0.00001;
}

export async function hydrateOfflinePrepRouteGeometry(
  input: OfflinePrepPackInput,
  options: { accessToken?: string | null } = {},
): Promise<OfflinePrepPackInput> {
  const accessToken = options.accessToken?.trim();
  if (!accessToken) return input;

  const existingPoints = getOfflinePrepRouteCoordinates(input.route);
  if (existingPoints.length > 2) return input;
  if (existingPoints.length < 2 || samePoint(existingPoints[0], existingPoints[existingPoints.length - 1])) return input;

  const origin = toRoadNavCoordinate(existingPoints[0]);
  const destinationCoordinate = toRoadNavCoordinate(existingPoints[existingPoints.length - 1]);
  const destination: RoadNavDestination = {
    id: `${routeId(input.route)}-offline-prep-destination`,
    title: routeName(input.route),
    subtitle: typeof input.route.region === 'string' ? input.route.region : null,
    coordinate: destinationCoordinate,
    sourceType: 'explore_handoff',
    raw: input.route,
  };

  const { fetchRoadRoute } = require('../mapboxRoadNavigation') as typeof import('../mapboxRoadNavigation');
  const roadRoute = await fetchRoadRoute({ accessToken, origin, destination });
  if (roadRoute.geometry.length <= existingPoints.length) return input;

  const hydratedRoute: TripBuilderRouteInput = {
    ...input.route,
    routeGeometry: roadRoute.geometry.map((point) => ({
      latitude: point.lat,
      longitude: point.lng,
    })),
    routeMetadata: {
      ...(input.route.routeMetadata ?? {}),
      offlinePrepGeometrySource: 'mapbox_directions_endpoint_route',
      offlinePrepGeometryPointCount: roadRoute.geometry.length,
      offlinePrepGeometryFetchedAt: roadRoute.createdAt,
      offlinePrepGeometryDistanceM: roadRoute.distanceM,
      offlinePrepGeometryDurationS: roadRoute.durationS,
    },
  };

  return {
    ...input,
    route: hydratedRoute,
  };
}

export function buildOfflinePrepRouteBounds(
  route: TripBuilderRouteInput,
  corridorMiles = DEFAULT_CORRIDOR_MILES,
): OfflinePrepPackBounds | null {
  const points = getOfflinePrepRouteCoordinates(route);
  return buildOfflinePrepRouteBoundsFromPoints(points, corridorMiles);
}

function buildOfflinePrepRouteBoundsFromPoints(
  points: NormalizedPoint[],
  corridorMiles = DEFAULT_CORRIDOR_MILES,
): OfflinePrepPackBounds | null {
  if (points.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const point of points) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }

  const bufferDeg = corridorMiles / 69;
  const avgLat = (minLat + maxLat) / 2;
  const lngBuffer = bufferDeg / Math.max(0.25, Math.cos((avgLat * Math.PI) / 180));
  return {
    minLat: Math.max(-90, minLat - bufferDeg),
    maxLat: Math.min(90, maxLat + bufferDeg),
    minLng: Math.max(-180, minLng - lngBuffer),
    maxLng: Math.min(180, maxLng + lngBuffer),
    corridorMiles,
  };
}

function boundsArea(bounds: OfflinePrepPackBounds | null): number | null {
  if (!bounds) return null;
  return Math.max(0, bounds.maxLat - bounds.minLat) * Math.max(0, bounds.maxLng - bounds.minLng);
}

function tileBoundsFromOfflineBounds(bounds: OfflinePrepPackBounds): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  return {
    minLat: bounds.minLat,
    maxLat: bounds.maxLat,
    minLng: bounds.minLng,
    maxLng: bounds.maxLng,
  };
}

function estimateCriticalSegmentTiles(bounds: OfflinePrepPackBounds): { tileCount: number; estimatedSizeMB: number } {
  try {
    const { countTilesForRegion, estimateSizeMB } = require('../tileCacheStore') as typeof import('../tileCacheStore');
    const tileCount = countTilesForRegion(
      tileBoundsFromOfflineBounds(bounds),
      CRITICAL_SEGMENT_ZOOM_MIN,
      CRITICAL_SEGMENT_ZOOM_MAX,
    );
    return {
      tileCount,
      estimatedSizeMB: estimateSizeMB(tileCount, 'tactical'),
    };
  } catch {
    const area = boundsArea(bounds) ?? 0;
    const estimatedSizeMB = Math.max(4, Math.round(area * 900 * 10) / 10);
    return {
      tileCount: Math.max(1, Math.round(estimatedSizeMB * 68)),
      estimatedSizeMB,
    };
  }
}

function normalizedRemotenessScore(route: TripBuilderRouteInput): number | null {
  const metadata = routeRecord(route.routeMetadata) ?? {};
  const raw =
    finiteNumber(route.remotenessScore) ??
    finiteNumber(metadata.remotenessScore) ??
    finiteNumber(metadata.remoteness_score) ??
    finiteNumber(metadata.remoteScore) ??
    finiteNumber(metadata.remote_score);
  if (raw == null) return null;
  return raw <= 10 ? raw * 10 : raw;
}

function routeSegmentFeatures(route: TripBuilderRouteInput): RemoteSegmentFeatureInput[] {
  const record = routeRecord(route) ?? {};
  const metadata = routeRecord(route.routeMetadata) ?? routeRecord(record.route_metadata) ?? {};
  const candidateLists = [
    record.segmentFeatures,
    record.remoteSegmentFeatures,
    record.remotenessSegments,
    record.riskSegments,
    metadata.segmentFeatures,
    metadata.remoteSegmentFeatures,
    metadata.remotenessSegments,
    metadata.riskSegments,
    record.segments,
  ];

  return candidateLists.flatMap((list): RemoteSegmentFeatureInput[] => {
    if (!Array.isArray(list)) return [];
    return list.map((entry): RemoteSegmentFeatureInput | null => {
      const segmentRecord = routeRecord(entry) ?? {};
      const points = coordinatesFromRouteGeometryLike(entry);
      if (points.length < 2) return null;
      return {
        coordinates: points.map((point) => [point.longitude, point.latitude]),
        remoteness_level:
          typeof segmentRecord.remoteness_level === 'string'
            ? segmentRecord.remoteness_level
            : typeof segmentRecord.remotenessLevel === 'string'
              ? segmentRecord.remotenessLevel
              : null,
        risk_level:
          typeof segmentRecord.risk_level === 'string'
            ? segmentRecord.risk_level
            : typeof segmentRecord.riskLevel === 'string'
              ? segmentRecord.riskLevel
              : null,
        risk_score:
          finiteNumber(segmentRecord.risk_score) ??
          finiteNumber(segmentRecord.riskScore) ??
          finiteNumber(segmentRecord.remoteness_score) ??
          finiteNumber(segmentRecord.remotenessScore),
      };
    }).filter((entry): entry is RemoteSegmentFeatureInput => entry != null);
  });
}

function buildCriticalMapSegments(
  route: TripBuilderRouteInput,
  points: NormalizedPoint[],
): OfflinePrepCriticalMapSegment[] {
  if (points.length < 2) return [];

  const overlay = buildRemoteMapOverlay({
    enabled: true,
    routePoints: points.map((point) => ({ lat: point.latitude, lng: point.longitude })),
    segmentFeatures: routeSegmentFeatures(route),
    remotenessScore: normalizedRemotenessScore(route) ?? 72,
  });

  return overlay.forecastSegments
    .filter((segment) => segment.signal === 'dead' || segment.signal === 'weak')
    .sort((left, right) => {
      const leftRank = left.signal === 'dead' ? 0 : 1;
      const rightRank = right.signal === 'dead' ? 0 : 1;
      return leftRank - rightRank;
    })
    .slice(0, MAX_CRITICAL_SEGMENTS)
    .map((segment, index): OfflinePrepCriticalMapSegment | null => {
      const segmentPoints = segment.coordinates.map((coordinate) => ({
        latitude: coordinate[1],
        longitude: coordinate[0],
      }));
      const bounds = buildOfflinePrepRouteBoundsFromPoints(segmentPoints, CRITICAL_SEGMENT_CORRIDOR_MILES);
      if (!bounds) return null;
      const estimate = estimateCriticalSegmentTiles(bounds);
      const signal = segment.signal === 'dead' ? 'dead' : 'weak';
      return {
        id: `critical-segment-${index + 1}`,
        label: signal === 'dead'
          ? `No-signal segment ${index + 1}`
          : `Limited-signal segment ${index + 1}`,
        signal,
        reason: signal === 'dead'
          ? 'Remoteness forecast marks this route section as a likely no-service zone.'
          : 'Remoteness forecast marks this route section as limited-service backup coverage.',
        bounds,
        coordinates: segmentPoints,
        routePointCount: segmentPoints.length,
        tileCount: estimate.tileCount,
        estimatedSizeMB: estimate.estimatedSizeMB,
        zoomMin: CRITICAL_SEGMENT_ZOOM_MIN,
        zoomMax: CRITICAL_SEGMENT_ZOOM_MAX,
      };
    })
    .filter((segment): segment is OfflinePrepCriticalMapSegment => segment != null);
}

function makeError(id: string, itemType: OfflinePrepPackItemType | null, message: string, recoverable = true): OfflinePrepPackError {
  return { id, itemType, message, recoverable };
}

function item(input: {
  type: OfflinePrepPackItemType;
  label: string;
  status: OfflinePrepPackStatus;
  availability: OfflinePrepPackItemAvailability;
  required?: boolean;
  source: string;
  summary: string;
  count?: number | null;
  estimatedSizeMB?: number | null;
  cacheKey?: string | null;
  error?: OfflinePrepPackError | null;
  metadata?: Record<string, unknown> | null;
}): OfflinePrepPackItem {
  return {
    id: `offline-prep-${input.type}`,
    required: input.required ?? false,
    count: null,
    estimatedSizeMB: null,
    cacheKey: null,
    error: null,
    metadata: null,
    ...input,
  };
}

function countArray(value: unknown[] | null | undefined): number {
  return Array.isArray(value) ? value.length : 0;
}

function pointsFromTripPlan(input: OfflinePrepPackInput): {
  campsites: CampCandidate[];
  exits: ExitPoint[];
  resupply: ResupplyPoint[];
} {
  const campsites = [...(input.campsiteCandidates ?? [])];
  if (input.tripPlan?.primaryCampCandidate) campsites.push(input.tripPlan.primaryCampCandidate);
  if (input.tripPlan?.backupCampCandidate) campsites.push(input.tripPlan.backupCampCandidate);

  const exits = [...(input.exitPoints ?? [])];
  if (input.tripPlan?.primaryExitPoint) exits.push(input.tripPlan.primaryExitPoint);

  const resupply = [...(input.resupplyPoints ?? [])];
  const smart = input.smartResupplyPlan ?? input.tripPlan?.smartResupplyPlan ?? null;
  if (smart) {
    [
      smart.fuel.keyPoint,
      smart.water.keyPoint,
      smart.supplies.keyPoint,
      smart.repair.keyPoint,
      smart.medical.keyPoint,
      smart.exitAccess.keyPoint,
    ].forEach((point) => {
      if (point && point.category !== 'exit_access') resupply.push(point);
    });
  }

  return {
    campsites: dedupeById(campsites),
    exits: dedupeById(exits),
    resupply: dedupeById(resupply),
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function routeToImportedRoute(route: TripBuilderRouteInput, points: NormalizedPoint[]): ImportedRoute | null {
  if (points.length < 2) return null;
  const waypoints: RouteWaypoint[] = Array.isArray(route.waypoints)
    ? route.waypoints
      .map((waypoint): RouteWaypoint | null => {
        const coordinate = coordinateFromValue(waypoint);
        if (!coordinate) return null;
        const record = waypoint && typeof waypoint === 'object' ? waypoint as Record<string, unknown> : {};
        return {
          lat: coordinate.latitude,
          lon: coordinate.longitude,
          ele: finiteNumber(record.ele) ?? null,
          name: typeof record.name === 'string' ? record.name : typeof record.title === 'string' ? record.title : null,
          time: typeof record.time === 'string' ? record.time : null,
          waypointType: typeof record.waypointType === 'string' ? record.waypointType as RouteWaypoint['waypointType'] : null,
        };
      })
      .filter((point): point is RouteWaypoint => point != null)
    : [];
  const segment: RouteSegment = {
    points: points.map((point) => ({ lat: point.latitude, lon: point.longitude, ele: null })),
  };
  return {
    id: routeId(route),
    user_id: null,
    device_id: 'offline-prep',
    name: routeName(route),
    description: 'Offline Prep Pack GPX export',
    source_format: 'custom',
    source_app: 'ECS Trip Builder',
    route_category: 'custom',
    linked_run_id: null,
    total_distance_miles: finiteNumber(route.distanceMiles) ?? finiteNumber(route.total_distance_miles) ?? 0,
    elevation_gain_ft: finiteNumber(route.elevationGainFt),
    waypoint_count: waypoints.length,
    segment_count: 1,
    waypoints,
    segments: [segment],
    is_active: false,
    sync_status: 'local',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function defaultOfflineMapAdapter(): OfflineMapPreparationAdapter {
  return {
    prepareRouteRegion({ routeId, routeName, bounds, routePointCount }) {
      if (!bounds || routePointCount < 2) {
        return {
          supported: false,
          status: 'unavailable',
          availability: 'unavailable',
          summary: 'Offline map download is not available yet because route geometry is missing.',
          error: 'Route geometry data unavailable.',
        };
      }

      const area = boundsArea(bounds) ?? 0;
      if (area > MAX_AUTO_MAP_AREA_DEGREES) {
        return {
          supported: true,
          status: 'failed',
          availability: 'failed',
          summary: 'Full-route map download exceeds the automatic offline prep limit. ECS can still prepare smaller low-signal map segments for this route.',
          error: 'Full-route map package is too large for automatic offline prep. Use Low-Signal Map Segments to cache the most likely no-service sections.',
          metadata: {
            bounds,
            routePointCount,
            boundsAreaDegrees: area,
            fullRouteTooLarge: true,
            recommendedFallback: 'critical_offline_segments',
          },
        };
      }

      try {
        const { tileCacheStore } = require('../tileCacheStore');
        const regions = typeof tileCacheStore?.getRegions === 'function' ? tileCacheStore.getRegions() : [];
        const matching = regions.find((region: any) => {
          if (
            region.routeId === routeId &&
            ['complete', 'partial', 'downloading', 'pending', 'error', 'cancelled'].includes(region.status)
          ) {
            return true;
          }
          const rb = region.bounds;
          return rb &&
            rb.minLat <= bounds.minLat &&
            rb.maxLat >= bounds.maxLat &&
            rb.minLng <= bounds.minLng &&
            rb.maxLng >= bounds.maxLng &&
            ['complete', 'partial', 'downloading', 'pending', 'error', 'cancelled'].includes(region.status);
        });
        if (matching?.status === 'complete') {
          return {
            supported: true,
            status: 'ready',
            availability: 'already_cached',
            summary: `Offline map region already cached for ${routeName}.`,
            estimatedSizeMB: matching.actualSizeMB ?? matching.estimatedSizeMB ?? null,
            cacheKey: matching.id,
            metadata: { bounds, regionId: matching.id, cacheStatus: matching.status },
          };
        }
        if (matching?.status === 'downloading' || matching?.status === 'pending') {
          const percent = matching.tileCount > 0
            ? Math.round((Math.max(0, matching.downloadedTiles ?? 0) / matching.tileCount) * 100)
            : 0;
          return {
            supported: true,
            status: matching.status === 'downloading' ? 'downloading' : 'preparing',
            availability: 'pending_download',
            summary: `Offline map preparation is ${matching.status === 'downloading' ? `downloading (${percent}%)` : 'queued'} for ${routeName}.`,
            estimatedSizeMB: matching.estimatedSizeMB ?? null,
            cacheKey: matching.id,
            metadata: { bounds, regionId: matching.id, cacheStatus: matching.status, percent },
          };
        }
        if (matching?.status === 'error' || matching?.status === 'cancelled') {
          return {
            supported: true,
            status: matching.status === 'error' ? 'failed' : 'not_started',
            availability: matching.status === 'error' ? 'failed' : 'pending_download',
            summary: matching.status === 'error'
              ? 'Offline map preparation failed. Retry keeps the same route region.'
              : 'Offline map preparation was cancelled. Retry keeps the same route region.',
            estimatedSizeMB: matching.estimatedSizeMB ?? null,
            cacheKey: matching.id,
            error: matching.status === 'error' ? matching.errorMessage ?? 'Offline map preparation failed.' : null,
            metadata: { bounds, regionId: matching.id, cacheStatus: matching.status },
          };
        }
        return {
          supported: true,
          status: 'not_started',
          availability: 'pending_download',
          summary: 'Offline map preparation can start from Explore and will report route-cache progress here.',
          metadata: { bounds, routePointCount },
        };
      } catch {
        return {
          supported: false,
          status: 'unavailable',
          availability: 'unavailable',
          summary: 'Offline map download is not available yet in this runtime.',
          error: 'Offline map cache adapter unavailable.',
          metadata: { bounds, routePointCount },
        };
      }
    },
  };
}

function buildOfflineMapItem(
  input: OfflinePrepPackInput,
  bounds: OfflinePrepPackBounds | null,
  routePointCount: number,
  adapter: OfflineMapPreparationAdapter,
): OfflinePrepPackItem {
  const result = adapter.prepareRouteRegion({
    routeId: routeId(input.route),
    routeName: routeName(input.route),
    bounds,
    routePointCount,
  });
  const error = result.error
    ? makeError('offline-map-unavailable', 'offline_map', result.error)
    : null;
  return item({
    type: 'offline_map',
    label: 'Offline Map',
    status: result.status,
    availability: result.availability,
    required: true,
    source: result.supported ? 'tile_cache_store' : 'offline_map_adapter',
    summary: result.summary,
    estimatedSizeMB: result.estimatedSizeMB ?? null,
    cacheKey: result.cacheKey ?? null,
    error,
    metadata: result.metadata ?? null,
  });
}

function buildGpxItem(input: OfflinePrepPackInput, points: NormalizedPoint[]): OfflinePrepPackItem {
  const importedRoute = routeToImportedRoute(input.route, points);
  if (!importedRoute) {
    const error = makeError('gpx-route-geometry-missing', 'gpx_export', 'GPX export is not supported in this build without route geometry.');
    return item({
      type: 'gpx_export',
      label: 'GPX Export',
      status: 'unavailable',
      availability: 'unavailable',
      source: 'gpx_export',
      summary: 'GPX export is not supported in this build without route geometry.',
      error,
    });
  }
  const gpx = generateGPX(importedRoute, { creator: 'Expedition Command System', description: 'Offline Prep Pack route export.' });
  return item({
    type: 'gpx_export',
    label: 'GPX Export',
    status: 'ready',
    availability: 'available',
    source: 'gpx_export',
    summary: 'GPX route export is available from the selected route.',
    estimatedSizeMB: Math.max(0.01, Math.round((gpx.length / 1024 / 1024) * 100) / 100),
    metadata: { filename: `${slug(importedRoute.name)}.gpx`, bytes: gpx.length },
  });
}

function buildTripSheetItem(input: OfflinePrepPackInput): OfflinePrepPackItem {
  if (!input.tripPlan) {
    return item({
      type: 'trip_sheet',
      label: 'Trip Sheet',
      status: 'unavailable',
      availability: 'unavailable',
      source: 'trip_builder',
      summary: 'Trip sheet is not supported until a Trip Builder plan exists.',
      error: makeError('trip-sheet-plan-missing', 'trip_sheet', 'TripPlan is unavailable.'),
    });
  }
  return item({
    type: 'trip_sheet',
    label: 'Trip Sheet',
    status: 'ready',
    availability: 'available',
    source: 'trip_builder_json_summary',
    summary: 'Trip sheet manifest is available from the generated Trip Builder plan and Offline Prep manifest.',
    metadata: {
      planId: input.tripPlan.id,
      routeId: routeId(input.route),
      routeName: routeName(input.route),
      stopCount: input.tripPlan.suggestedStops.length,
      warningCount: input.tripPlan.warnings.length,
      weatherSnapshotIncluded: !!input.weatherSnapshot,
      smartResupplyIncluded: !!(input.smartResupplyPlan ?? input.tripPlan.smartResupplyPlan),
    },
  });
}

function buildCriticalOfflineSegmentsItem(
  input: OfflinePrepPackInput,
  points: NormalizedPoint[],
  offlineMapItem: OfflinePrepPackItem,
): OfflinePrepPackItem | null {
  const fullRouteTooLarge = offlineMapItem.metadata?.fullRouteTooLarge === true;
  if (!fullRouteTooLarge) return null;

  const segments = buildCriticalMapSegments(input.route, points);
  if (segments.length === 0) {
    return item({
      type: 'critical_offline_segments',
      label: 'Low-Signal Map Segments',
      status: 'unavailable',
      availability: 'unavailable',
      source: 'remoteness_route_forecast',
      summary: 'ECS could not isolate a smaller low-signal segment from the current route geometry.',
      error: makeError(
        'critical-segments-unavailable',
        'critical_offline_segments',
        'Low-signal segment fallback is unavailable without route segment geometry.',
      ),
      metadata: { fallbackFor: 'offline_map' },
    });
  }

  const totalSizeMB = Math.round(segments.reduce((sum, segment) => sum + segment.estimatedSizeMB, 0) * 10) / 10;
  const deadCount = segments.filter((segment) => segment.signal === 'dead').length;
  return item({
    type: 'critical_offline_segments',
    label: 'Low-Signal Map Segments',
    status: 'not_started',
    availability: 'pending_download',
    required: false,
    source: 'remoteness_route_forecast',
    summary: `${segments.length} low-signal segment${segments.length === 1 ? '' : 's'} can be downloaded instead of the full route, prioritizing ${deadCount || segments.length} likely no-service area${(deadCount || segments.length) === 1 ? '' : 's'}.`,
    count: segments.length,
    estimatedSizeMB: totalSizeMB,
    metadata: {
      fallbackFor: 'offline_map',
      fullRouteMapUnavailable: true,
      segmentCount: segments.length,
      segments,
    },
  });
}

function buildManifestProgress(items: OfflinePrepPackItem[]): OfflinePrepPackProgress {
  const readyItems = items.filter((entry) => entry.status === 'ready').length;
  const unavailableItems = items.filter((entry) => entry.status === 'unavailable').length;
  const failedItems = items.filter((entry) => entry.status === 'failed').length;
  const activeItems = items.filter((entry) => entry.status === 'preparing' || entry.status === 'downloading').length;
  const requiredItems = items.filter((entry) => entry.required);
  let status: OfflinePrepPackStatus = 'not_started';
  if (failedItems > 0) status = 'failed';
  else if (activeItems > 0) status = items.some((entry) => entry.status === 'downloading') ? 'downloading' : 'preparing';
  else if (requiredItems.some((entry) => entry.status === 'unavailable')) status = 'partially_ready';
  else if (readyItems === items.length) status = 'ready';
  else if (readyItems > 0 || unavailableItems > 0) status = 'partially_ready';

  return {
    status,
    totalItems: items.length,
    readyItems,
    unavailableItems,
    failedItems,
    percent: items.length === 0 ? 0 : Math.round((readyItems / items.length) * 100),
  };
}

export function buildOfflinePrepPackManifest(
  input: OfflinePrepPackInput,
  options: { offlineMapAdapter?: OfflineMapPreparationAdapter | null } = {},
): OfflinePrepPackManifest {
  const generatedAt = input.capturedAt ?? new Date().toISOString();
  const points = getOfflinePrepPackRouteCoordinates(input);
  const bounds = buildOfflinePrepRouteBoundsFromPoints(points);
  const route = input.route;
  const routeKey = routeId(route);
  const derived = pointsFromTripPlan(input);
  const smart = input.smartResupplyPlan ?? input.tripPlan?.smartResupplyPlan ?? null;
  const emergencyPointCount = countArray(input.emergencyPoints);
  const campAndEmergencyCount = derived.campsites.length + emergencyPointCount;
  const adapter = options.offlineMapAdapter ?? defaultOfflineMapAdapter();
  const weatherSnapshot = input.weatherSnapshot && typeof input.weatherSnapshot === 'object'
    ? input.weatherSnapshot
    : null;
  const weatherSnapshotCount = weatherSnapshot
    ? finiteNumber(weatherSnapshot.coordinateCount) ?? (Array.isArray(weatherSnapshot.snapshots) ? weatherSnapshot.snapshots.length : null)
    : null;
  const offlineMapItem = buildOfflineMapItem(input, bounds, points.length, adapter);
  const criticalSegmentsItem = buildCriticalOfflineSegmentsItem(input, points, offlineMapItem);

  const items: OfflinePrepPackItem[] = [
    offlineMapItem,
    ...(criticalSegmentsItem ? [criticalSegmentsItem] : []),
    item({
      type: 'route_line',
      label: 'Route Line',
      status: points.length >= 2 ? 'ready' : 'unavailable',
      availability: points.length >= 2 ? 'available' : 'unavailable',
      required: true,
      source: 'selected_route',
      summary: points.length >= 2 ? `${points.length} route points are available for offline prep.` : 'Route geometry data unavailable.',
      count: points.length,
      error: points.length >= 2 ? null : makeError('route-line-missing', 'route_line', 'Route geometry is missing.'),
    }),
    item({
      type: 'waypoints',
      label: 'Waypoints',
      status: countArray(route.waypoints) > 0 ? 'ready' : 'unavailable',
      availability: countArray(route.waypoints) > 0 ? 'available' : 'unavailable',
      source: 'selected_route',
      summary: countArray(route.waypoints) > 0 ? 'Route waypoints can be saved with the pack.' : 'No known waypoint source detected.',
      count: countArray(route.waypoints),
    }),
    item({
      type: 'campsites',
      label: 'Campsites and Emergency Points',
      status: 'ready',
      availability: campAndEmergencyCount > 0 ? 'available' : 'not_set',
      source: 'trip_builder_camps_emergency_points',
      summary: 'Camp candidates and optional emergency points. Either can be saved with the pack or have not been set for this pack.',
      count: campAndEmergencyCount,
    }),
    item({
      type: 'exit_points',
      label: 'Exit Points',
      status: derived.exits.length > 0 ? 'ready' : 'unavailable',
      availability: derived.exits.length > 0 ? 'available' : 'unavailable',
      required: true,
      source: 'trip_builder_exits',
      summary: derived.exits.length > 0 ? 'Known exit points can be saved.' : 'No known exit source detected.',
      count: derived.exits.length,
      error: derived.exits.length > 0 ? null : makeError('exit-points-missing', 'exit_points', 'Exit access data unavailable.'),
    }),
    item({
      type: 'resupply_points',
      label: 'Resupply Points',
      status: derived.resupply.length > 0 ? 'ready' : 'unavailable',
      availability: derived.resupply.length > 0 ? 'available' : 'unavailable',
      source: 'smart_resupply_plan',
      summary: derived.resupply.length > 0 ? 'Known resupply points can be saved.' : 'No known resupply source detected.',
      count: derived.resupply.length,
    }),
    item({
      type: 'vehicle_readiness_summary',
      label: 'Vehicle Readiness',
      status: input.readiness || input.tripPlan?.readinessReference || input.vehicleProfile ? 'ready' : 'unavailable',
      availability: input.readiness || input.tripPlan?.readinessReference || input.vehicleProfile ? 'available' : 'unavailable',
      source: 'readiness_vehicle_profile',
      summary: input.readiness || input.tripPlan?.readinessReference || input.vehicleProfile
        ? 'Vehicle/readiness summary can be included.'
        : 'Vehicle readiness data unavailable.',
    }),
    item({
      type: 'trip_itinerary',
      label: 'Trip Itinerary',
      status: input.tripPlan ? 'ready' : 'unavailable',
      availability: input.tripPlan ? 'available' : 'unavailable',
      required: true,
      source: 'trip_builder',
      summary: input.tripPlan ? 'Trip Builder itinerary can be saved.' : 'Trip itinerary data unavailable until a Trip Builder plan exists.',
      count: input.tripPlan?.suggestedStops.length ?? 0,
      error: input.tripPlan ? null : makeError('trip-itinerary-missing', 'trip_itinerary', 'Trip plan data unavailable.'),
    }),
    item({
      type: 'smart_resupply_summary',
      label: 'Smart Resupply Summary',
      status: smart ? 'ready' : 'unavailable',
      availability: smart ? 'available' : 'unavailable',
      source: 'smart_resupply_plan',
      summary: smart ? `Smart Resupply summary is available with ${smart.warnings.length} item${smart.warnings.length === 1 ? '' : 's'} to verify.` : 'Smart Resupply data unavailable.',
    }),
    item({
      type: 'weather_snapshot',
      label: 'Weather Snapshot',
      status: weatherSnapshot ? 'ready' : 'unavailable',
      availability: weatherSnapshot ? 'available' : 'unavailable',
      source: 'weather_snapshot',
      summary: weatherSnapshot
        ? `Route weather snapshot can be saved${weatherSnapshotCount ? ` for ${weatherSnapshotCount} route sample${weatherSnapshotCount === 1 ? '' : 's'}` : ''}.`
        : 'No known weather snapshot source detected.',
      count: weatherSnapshotCount,
      metadata: weatherSnapshot,
    }),
    buildGpxItem(input, points),
    buildTripSheetItem(input),
  ];

  const errors = items.map((entry) => entry.error).filter((error): error is OfflinePrepPackError => !!error);
  const progress = buildManifestProgress(items);
  return {
    id: `offline-prep-${slug(routeKey)}`,
    generatedAt,
    routeId: routeKey,
    routeName: routeName(route),
    routeBounds: bounds,
    items,
    progress,
    errors,
  };
}

export function buildOfflinePrepPack(
  input: OfflinePrepPackInput,
  options: { offlineMapAdapter?: OfflineMapPreparationAdapter | null } = {},
): OfflinePrepPack {
  const manifest = buildOfflinePrepPackManifest(input, options);
  return {
    id: manifest.id,
    status: manifest.progress.status,
    manifest,
    createdAt: manifest.generatedAt,
    updatedAt: manifest.generatedAt,
  };
}

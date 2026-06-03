import type { RouteWaypoint } from './routeStore';
import type { RouteWaypointType } from './waypointTypes';

export type StitchRoutePoint = {
  lat: number;
  lng: number;
  ele_m?: number | null;
  time?: string | null;
};

export type StitchRunLike = {
  id: string;
  title: string;
  points: StitchRoutePoint[];
  waypoints?: any[];
};

export type StitchBridgeRoute = {
  coordinates: StitchRoutePoint[];
  distanceM?: number | null;
  sourceLabel?: string | null;
};

export type StitchBridgeRequest = {
  from: StitchRoutePoint;
  to: StitchRoutePoint;
  fromRunId: string;
  toRunId: string;
  gapIndex: number;
};

export type StitchComposeInput = {
  title: string;
  selectedRuns: StitchRunLike[];
  currentLocation?: StitchRoutePoint | null;
  fetchBridge?: (request: StitchBridgeRequest) => Promise<StitchBridgeRoute | null>;
};

export type StitchBuildResult = {
  parsed: {
    name: string;
    routePoints: StitchRoutePoint[];
    trackPoints: StitchRoutePoint[];
    primaryCoords: StitchRoutePoint[];
    waypoints: RouteWaypoint[];
  };
  transitionLegCount: number;
  segmentCount: number;
  blocked: boolean;
  gapsNeedingReview: Array<{
    index: number;
    fromRunId: string;
    toRunId: string;
    distanceM: number;
    reason: string;
  }>;
  reversedFirstSegment: boolean;
  segmentOrientations: Array<'forward' | 'reversed' | 'skipped'>;
};

const EARTH_RADIUS_M = 6371000;
const TOUCHING_ENDPOINT_TOLERANCE_M = 30;
const BRIDGE_ENDPOINT_TOLERANCE_M = 120;
const GPS_REVERSE_CLEAR_DELTA_M = 150;
const VALID_ROUTE_WAYPOINT_TYPES = new Set<RouteWaypointType>([
  'camp',
  'water',
  'fuel',
  'hazard',
  'viewpoint',
  'trailhead',
  'junction',
]);

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function stitchDistanceMeters(a: StitchRoutePoint, b: StitchRoutePoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function normalizePoint(point: any): StitchRoutePoint | null {
  const lat = Number(point?.lat ?? point?.latitude);
  const lng = Number(point?.lng ?? point?.lon ?? point?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    ele_m: Number.isFinite(Number(point?.ele_m ?? point?.ele)) ? Number(point?.ele_m ?? point?.ele) : null,
    time: typeof point?.time === 'string' ? point.time : null,
  };
}

function normalizeRunPoints(run: StitchRunLike): StitchRoutePoint[] {
  return (run.points ?? [])
    .map(normalizePoint)
    .filter((point): point is StitchRoutePoint => !!point);
}

function appendDedupe(
  target: StitchRoutePoint[],
  points: StitchRoutePoint[],
  toleranceM = TOUCHING_ENDPOINT_TOLERANCE_M,
): void {
  for (const point of points) {
    const previous = target[target.length - 1];
    if (previous && stitchDistanceMeters(previous, point) <= toleranceM) continue;
    target.push(point);
  }
}

function bridgeIsValid(
  bridge: StitchBridgeRoute | null,
  from: StitchRoutePoint,
  to: StitchRoutePoint,
): bridge is StitchBridgeRoute {
  const coordinates = (bridge?.coordinates ?? [])
    .map(normalizePoint)
    .filter((point): point is StitchRoutePoint => !!point);
  if (coordinates.length < 2) return false;
  return (
    stitchDistanceMeters(coordinates[0], from) <= BRIDGE_ENDPOINT_TOLERANCE_M &&
    stitchDistanceMeters(coordinates[coordinates.length - 1], to) <= BRIDGE_ENDPOINT_TOLERANCE_M
  );
}

function normalizeBridge(bridge: StitchBridgeRoute): StitchRoutePoint[] {
  return (bridge.coordinates ?? [])
    .map(normalizePoint)
    .filter((point): point is StitchRoutePoint => !!point);
}

function shouldReverseFirstSegment(points: StitchRoutePoint[], gps: StitchRoutePoint | null | undefined): boolean {
  if (!gps || points.length < 2) return false;
  const startDistanceM = stitchDistanceMeters(gps, points[0]);
  const endDistanceM = stitchDistanceMeters(gps, points[points.length - 1]);
  return startDistanceM - endDistanceM >= GPS_REVERSE_CLEAR_DELTA_M;
}

function routeWaypointFromRaw(waypoint: any): RouteWaypoint | null {
  const lat = Number(waypoint?.lat ?? waypoint?.latitude);
  const lon = Number(waypoint?.lon ?? waypoint?.lng ?? waypoint?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    ele: Number.isFinite(Number(waypoint?.ele)) ? Number(waypoint.ele) : null,
    name:
      typeof waypoint?.name === 'string'
        ? waypoint.name
        : typeof waypoint?.title === 'string'
          ? waypoint.title
          : null,
    time: typeof waypoint?.time === 'string' ? waypoint.time : null,
    waypointType:
      typeof waypoint?.waypointType === 'string' &&
      VALID_ROUTE_WAYPOINT_TYPES.has(waypoint.waypointType as RouteWaypointType)
        ? (waypoint.waypointType as RouteWaypointType)
        : null,
  };
}

export async function composeStitchedRoute(input: StitchComposeInput): Promise<StitchBuildResult> {
  const routePoints: StitchRoutePoint[] = [];
  const waypoints: RouteWaypoint[] = [];
  const gapsNeedingReview: StitchBuildResult['gapsNeedingReview'] = [];
  const segmentOrientations: StitchBuildResult['segmentOrientations'] = [];
  let transitionLegCount = 0;
  let reversedFirstSegment = false;

  for (let index = 0; index < input.selectedRuns.length; index += 1) {
    const run = input.selectedRuns[index];
    let validPoints = normalizeRunPoints(run);
    if (validPoints.length === 0) {
      segmentOrientations.push('skipped');
      continue;
    }

    if (index === 0 && shouldReverseFirstSegment(validPoints, input.currentLocation)) {
      validPoints = [...validPoints].reverse();
      reversedFirstSegment = true;
      segmentOrientations.push('reversed');
    } else {
      segmentOrientations.push('forward');
    }

    if (routePoints.length > 0) {
      const previousPoint = routePoints[routePoints.length - 1];
      const nextStartPoint = validPoints[0];
      const gapDistanceM = stitchDistanceMeters(previousPoint, nextStartPoint);

      if (gapDistanceM <= TOUCHING_ENDPOINT_TOLERANCE_M) {
        appendDedupe(routePoints, validPoints);
      } else {
        const bridge = input.fetchBridge
          ? await input.fetchBridge({
              from: previousPoint,
              to: nextStartPoint,
              fromRunId: input.selectedRuns[index - 1]?.id ?? '',
              toRunId: run.id,
              gapIndex: index - 1,
            })
          : null;

        if (!bridgeIsValid(bridge, previousPoint, nextStartPoint)) {
          gapsNeedingReview.push({
            index: index - 1,
            fromRunId: input.selectedRuns[index - 1]?.id ?? '',
            toRunId: run.id,
            distanceM: gapDistanceM,
            reason: 'Mapbox driving bridge unavailable or failed endpoint verification.',
          });
          appendDedupe(routePoints, validPoints);
        } else {
          transitionLegCount += 1;
          appendDedupe(routePoints, normalizeBridge(bridge), 1);
          appendDedupe(routePoints, validPoints);
          waypoints.push({
            lat: nextStartPoint.lat,
            lon: nextStartPoint.lng,
            ele: nextStartPoint.ele_m ?? null,
            name: `Transition to ${run.title}`,
            time: null,
            waypointType: null,
          });
        }
      }
    } else {
      appendDedupe(routePoints, validPoints, 1);
    }

    for (const waypoint of run.waypoints ?? []) {
      const normalized = routeWaypointFromRaw(waypoint);
      if (normalized) waypoints.push(normalized);
    }

    if (index < input.selectedRuns.length - 1 && validPoints.length > 0) {
      const finalPoint = validPoints[validPoints.length - 1];
      waypoints.push({
        lat: finalPoint.lat,
        lon: finalPoint.lng,
        ele: finalPoint.ele_m ?? null,
        name: `Segment ${index + 1} complete | ${run.title}`,
        time: null,
        waypointType: null,
      });
    }
  }

  return {
    parsed: {
      name: input.title,
      routePoints,
      trackPoints: [],
      primaryCoords: routePoints,
      waypoints,
    },
    transitionLegCount,
    segmentCount: input.selectedRuns.length,
    blocked: gapsNeedingReview.length > 0,
    gapsNeedingReview,
    reversedFirstSegment,
    segmentOrientations,
  };
}

export function buildMapboxDirectionsBridgeRequest(params: {
  accessToken: string;
  from: StitchRoutePoint;
  to: StitchRoutePoint;
}): string {
  const coordinates = `${params.from.lng},${params.from.lat};${params.to.lng},${params.to.lat}`;
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}`);
  url.searchParams.set('access_token', params.accessToken);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('alternatives', 'true');
  return url.toString();
}

export async function fetchMapboxDirectionsBridge(params: {
  accessToken: string;
  from: StitchRoutePoint;
  to: StitchRoutePoint;
  timeoutMs?: number;
}): Promise<StitchBridgeRoute | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 9000);
  try {
    const response = await fetch(buildMapboxDirectionsBridgeRequest(params), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      routes?: Array<{ distance?: number; geometry?: { coordinates?: [number, number][] } }>;
    };
    const candidates = (data.routes ?? [])
      .map((route) => ({
        coordinates: (route.geometry?.coordinates ?? [])
          .map((coordinate) => normalizePoint({ lng: coordinate[0], lat: coordinate[1] }))
          .filter((point): point is StitchRoutePoint => !!point),
        distanceM: Number.isFinite(Number(route.distance)) ? Number(route.distance) : null,
        sourceLabel: 'mapbox_directions_driving_bridge',
      }))
      .filter((route) => bridgeIsValid(route, params.from, params.to))
      .sort((a, b) => {
        const aDistance = Number.isFinite(Number(a.distanceM)) ? Number(a.distanceM) : Number.MAX_SAFE_INTEGER;
        const bDistance = Number.isFinite(Number(b.distanceM)) ? Number(b.distanceM) : Number.MAX_SAFE_INTEGER;
        return aDistance - bDistance;
      });
    return candidates[0] ?? null;
  } finally {
    clearTimeout(timer);
  }
}

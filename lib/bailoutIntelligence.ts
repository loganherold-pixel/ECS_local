import { haversineMeters, metersToMiles } from './runStore';
import type { BailoutPoint, BailoutType } from './bailoutStore';
import type { ImportedRoute, RouteWaypoint } from './routeStore';
import type { NavigateRouteMapPoint } from './navigateRouteSessionStore';

type Coordinate = {
  lat: number;
  lng: number;
};

type BailoutCandidateSource = 'route_endpoint' | 'route_waypoint' | 'manual_bailout';

export type RouteBailoutCandidate = BailoutPoint & {
  sourceKind?: BailoutCandidateSource;
};

export type BuildRouteBailoutCandidatesArgs = {
  routeId?: string | null;
  routeName?: string | null;
  sessionRoutePoints?: NavigateRouteMapPoint[] | null;
  importedRoute?: ImportedRoute | null;
  manualBailouts?: BailoutPoint[] | null;
  maxManualDistanceFromRouteMiles?: number;
};

const DEFAULT_MANUAL_ROUTE_BUFFER_MILES = 20;
const MAX_ROUTE_POINTS_FOR_DISTANCE = 160;

function finiteNumber(value: unknown): number | null {
  const next = typeof value === 'string' ? Number(value) : value;
  return typeof next === 'number' && Number.isFinite(next) ? next : null;
}

function validCoordinate(lat: unknown, lng: unknown): Coordinate | null {
  const nextLat = finiteNumber(lat);
  const nextLng = finiteNumber(lng);
  if (
    nextLat == null ||
    nextLng == null ||
    nextLat < -90 ||
    nextLat > 90 ||
    nextLng < -180 ||
    nextLng > 180
  ) {
    return null;
  }
  return { lat: nextLat, lng: nextLng };
}

function routeCoordinatesFromImportedRoute(route: ImportedRoute | null | undefined): Coordinate[] {
  if (!route) return [];
  const points: Coordinate[] = [];
  for (const segment of route.segments ?? []) {
    for (const point of segment.points ?? []) {
      const coordinate = validCoordinate(point.lat, point.lon);
      if (coordinate) points.push(coordinate);
    }
  }
  return dedupeCoordinates(points);
}

function routeCoordinatesFromSession(points: NavigateRouteMapPoint[] | null | undefined): Coordinate[] {
  if (!Array.isArray(points)) return [];
  return dedupeCoordinates(points.map((point) => validCoordinate(point.lat, point.lng)).filter((point): point is Coordinate => !!point));
}

function dedupeCoordinates(points: Coordinate[]): Coordinate[] {
  const output: Coordinate[] = [];
  for (const point of points) {
    const previous = output[output.length - 1];
    if (previous && Math.abs(previous.lat - point.lat) < 0.00001 && Math.abs(previous.lng - point.lng) < 0.00001) continue;
    output.push(point);
  }
  return output;
}

function downsampleRoute(points: Coordinate[]): Coordinate[] {
  if (points.length <= MAX_ROUTE_POINTS_FOR_DISTANCE) return points;
  const step = Math.ceil(points.length / MAX_ROUTE_POINTS_FOR_DISTANCE);
  const sampled = points.filter((_, index) => index === 0 || index === points.length - 1 || index % step === 0);
  return sampled[sampled.length - 1] === points[points.length - 1]
    ? sampled
    : [...sampled, points[points.length - 1]];
}

function nearestRouteDistanceMiles(point: Coordinate, routePoints: Coordinate[]): number | null {
  if (routePoints.length === 0) return null;
  let nearest = Number.POSITIVE_INFINITY;
  for (const routePoint of downsampleRoute(routePoints)) {
    nearest = Math.min(nearest, haversineMeters(point.lat, point.lng, routePoint.lat, routePoint.lng));
  }
  return Number.isFinite(nearest) ? metersToMiles(nearest) : null;
}

function makeCandidate(args: {
  id: string;
  routeId: string;
  title: string;
  type: BailoutType;
  coordinate: Coordinate;
  priority: number;
  notes: string;
  sourceKind: BailoutCandidateSource;
}): RouteBailoutCandidate {
  return {
    id: `ecs-bailout:${args.routeId}:${args.id}`,
    user_id: null,
    title: args.title,
    type: args.type,
    lat: args.coordinate.lat,
    lng: args.coordinate.lng,
    notes: args.notes,
    priority: args.priority,
    is_shared: false,
    created_at: new Date(0).toISOString(),
    sourceKind: args.sourceKind,
  };
}

function textToBailoutType(text: string): BailoutType | null {
  const normalized = text.toLowerCase();
  if (/\bfuel\b|\bgas\b|petrol|station/.test(normalized)) return 'fuel';
  if (/\bwater\b|spring|well|refill|creek/.test(normalized)) return 'water';
  if (/grocery|market|store|suppl/.test(normalized)) return 'supplies';
  if (/repair|mechanic|tire|tyre|service/.test(normalized)) return 'repair';
  if (/hospital|clinic|medical|ems|emergency/.test(normalized)) return 'hospital';
  if (/ranger|visitor center|forest service/.test(normalized)) return 'ranger';
  if (/trailhead|staging|parking/.test(normalized)) return 'staging';
  if (/junction|exit|bailout|alternate|pavement|road/.test(normalized)) return 'alternate_route';
  if (/town|city|village/.test(normalized)) return 'town';
  if (/camp/.test(normalized)) return 'camp';
  return null;
}

function waypointToBailoutType(waypoint: RouteWaypoint): BailoutType | null {
  if (waypoint.waypointType === 'fuel') return 'fuel';
  if (waypoint.waypointType === 'water') return 'water';
  if (waypoint.waypointType === 'camp') return 'camp';
  if (waypoint.waypointType === 'trailhead') return 'staging';
  if (waypoint.waypointType === 'junction') return 'alternate_route';
  return textToBailoutType(`${waypoint.name ?? ''} ${waypoint.waypointType ?? ''}`);
}

function routeWaypointCandidates(route: ImportedRoute, routeId: string): RouteBailoutCandidate[] {
  return (route.waypoints ?? [])
    .map((waypoint, index) => {
      const coordinate = validCoordinate(waypoint.lat, waypoint.lon);
      const type = waypointToBailoutType(waypoint);
      if (!coordinate || !type) return null;
      const label = waypoint.name || `${type.replace(/_/g, ' ')} waypoint`;
      return makeCandidate({
        id: `waypoint-${index + 1}`,
        routeId,
        title: label,
        type,
        coordinate,
        priority: 70,
        notes: 'Route waypoint promoted into bailout intelligence. Verify access, hours, legality, and current conditions before relying on it.',
        sourceKind: 'route_waypoint',
      });
    })
    .filter((point): point is RouteBailoutCandidate => !!point);
}

function endpointCandidates(routeId: string, routeName: string, routePoints: Coordinate[]): RouteBailoutCandidate[] {
  if (routePoints.length === 0) return [];
  const start = routePoints[0];
  const finish = routePoints[routePoints.length - 1];
  const candidates: RouteBailoutCandidate[] = [
    makeCandidate({
      id: 'route-start-staging',
      routeId,
      title: `${routeName} start / staging reference`,
      type: 'staging',
      coordinate: start,
      priority: 35,
      notes: 'ECS inferred this from route geometry. Treat as a staging or return reference, not a verified service.',
      sourceKind: 'route_endpoint',
    }),
  ];
  if (Math.round(haversineMeters(start.lat, start.lng, finish.lat, finish.lng)) > 50) {
    candidates.push(makeCandidate({
      id: 'route-finish-exit',
      routeId,
      title: `${routeName} finish / exit reference`,
      type: 'alternate_route',
      coordinate: finish,
      priority: 45,
      notes: 'ECS inferred this from route geometry. Treat as the primary route completion exit unless a better bailout is indexed.',
      sourceKind: 'route_endpoint',
    }));
  }
  return candidates;
}

function manualCandidatesNearRoute(
  manualBailouts: BailoutPoint[],
  routePoints: Coordinate[],
  maxDistanceMiles: number,
): RouteBailoutCandidate[] {
  if (routePoints.length === 0) return manualBailouts as RouteBailoutCandidate[];
  return manualBailouts.filter((point) => {
    const coordinate = validCoordinate(point.lat, point.lng);
    if (!coordinate) return false;
    const distance = nearestRouteDistanceMiles(coordinate, routePoints);
    return distance != null && distance <= maxDistanceMiles;
  }) as RouteBailoutCandidate[];
}

function dedupeCandidates(points: RouteBailoutCandidate[]): RouteBailoutCandidate[] {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.type}:${point.title.trim().toLowerCase()}:${point.lat.toFixed(4)}:${point.lng.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => right.priority - left.priority);
}

export function buildRouteBailoutCandidates(args: BuildRouteBailoutCandidatesArgs): RouteBailoutCandidate[] {
  const routeId = String(args.routeId ?? args.importedRoute?.id ?? 'active-route');
  const routeName = String(args.routeName ?? args.importedRoute?.name ?? 'Route');
  const routePoints = [
    ...routeCoordinatesFromSession(args.sessionRoutePoints),
    ...routeCoordinatesFromImportedRoute(args.importedRoute),
  ];
  const uniqueRoutePoints = dedupeCoordinates(routePoints);
  const manual = manualCandidatesNearRoute(
    args.manualBailouts ?? [],
    uniqueRoutePoints,
    args.maxManualDistanceFromRouteMiles ?? DEFAULT_MANUAL_ROUTE_BUFFER_MILES,
  );
  const waypointCandidates = args.importedRoute ? routeWaypointCandidates(args.importedRoute, routeId) : [];

  return dedupeCandidates([
    ...manual,
    ...waypointCandidates,
    ...endpointCandidates(routeId, routeName, uniqueRoutePoints),
  ]);
}

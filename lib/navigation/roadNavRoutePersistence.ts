import type { RoadNavCoordinate, RoadNavRoute } from '../mapboxRoadNavigation';

function isPersistableRoadNavCoordinate(value: unknown): value is RoadNavCoordinate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RoadNavCoordinate>;
  const lat = Number(candidate.lat);
  const lng = Number(candidate.lng);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Validate a normalized road route before a persisted handoff/cache boundary. */
export function getValidatedRoadNavRoute(
  value: unknown,
  options: { requireTurnByTurn?: boolean } = {},
): RoadNavRoute | null {
  if (!value || typeof value !== 'object') return null;
  const route = value as RoadNavRoute;
  if (
    !Array.isArray(route.geometry) ||
    route.geometry.length < 2 ||
    !route.geometry.every(isPersistableRoadNavCoordinate) ||
    !isPersistableRoadNavCoordinate(route.origin) ||
    !route.destination ||
    !isPersistableRoadNavCoordinate(route.destination.coordinate) ||
    !Array.isArray(route.steps) ||
    !Array.isArray(route.legs) ||
    !route.guidance ||
    !Array.isArray(route.guidance.geometry) ||
    route.guidance.geometry.length < 2 ||
    !route.guidance.geometry.every(isPersistableRoadNavCoordinate)
  ) {
    return null;
  }

  if (options.requireTurnByTurn === true) {
    if (
      route.guidanceMode !== 'turn_by_turn' ||
      route.steps.length === 0 ||
      route.legs.length === 0 ||
      route.guidance.guidanceMode !== 'turn_by_turn' ||
      !Array.isArray(route.guidance.steps) ||
      route.guidance.steps.length === 0
    ) {
      return null;
    }
  }

  if (
    route.orderedWaypoints != null &&
    (
      !Array.isArray(route.orderedWaypoints) ||
      !route.orderedWaypoints.every((waypoint) => (
        !!waypoint &&
        typeof waypoint.id === 'string' &&
        typeof waypoint.title === 'string' &&
        isPersistableRoadNavCoordinate(waypoint.coordinate)
      ))
    )
  ) {
    return null;
  }

  return route;
}

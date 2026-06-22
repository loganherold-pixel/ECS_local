import type { EcsGuidanceCoordinate, EcsGuidanceRoute } from './ecsGuidanceModel';

export type ActiveGuidanceRouteLineStatus =
  | 'ready'
  | 'rerouting'
  | 'reroute_failed'
  | 'reroute_applied'
  | 'unavailable';

export interface ActiveGuidanceRouteLineSync {
  routeId: string | null;
  rerouteGeneration: number | null;
  routeLineKey: string | null;
  geometry: EcsGuidanceCoordinate[];
  status: ActiveGuidanceRouteLineStatus;
  statusLabel: string | null;
  isStale: boolean;
  distanceMeters: number | null;
  durationSeconds: number | null;
  guidanceMode: EcsGuidanceRoute['guidanceMode'] | null;
}

export interface BuildActiveGuidanceRouteLineSyncInput {
  route?: EcsGuidanceRoute | null;
  fallbackGeometry?: readonly EcsGuidanceCoordinate[] | null;
  navigationStatus?: string | null;
  routeConfidenceState?: string | null;
  routeStatusLabel?: string | null;
}

function isValidRouteCoordinate(point: EcsGuidanceCoordinate | null | undefined): point is EcsGuidanceCoordinate {
  return (
    !!point &&
    typeof point.lat === 'number' &&
    typeof point.lng === 'number' &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

function normalizeGeometry(
  routeGeometry?: readonly EcsGuidanceCoordinate[] | null,
  fallbackGeometry?: readonly EcsGuidanceCoordinate[] | null,
): EcsGuidanceCoordinate[] {
  const source = Array.isArray(routeGeometry) && routeGeometry.length > 1 ? routeGeometry : fallbackGeometry;
  return Array.isArray(source) ? source.filter(isValidRouteCoordinate) : [];
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function geometryFingerprint(geometry: readonly EcsGuidanceCoordinate[]): string {
  if (geometry.length < 2) return 'empty';
  const serialized = geometry
    .map((point) => `${point.lng.toFixed(5)},${point.lat.toFixed(5)}`)
    .join('|');
  return `${geometry.length}-${hashString(serialized)}`;
}

function cleanLabel(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveStatus(input: {
  navigationStatus?: string | null;
  routeConfidenceState?: string | null;
  routeStatusLabel?: string | null;
  hasGeometry: boolean;
}): ActiveGuidanceRouteLineStatus {
  if (!input.hasGeometry) return 'unavailable';
  const navigationStatus = input.navigationStatus ?? '';
  const confidenceState = input.routeConfidenceState ?? '';
  const statusLabel = (input.routeStatusLabel ?? '').toLowerCase();
  if (navigationStatus === 'rerouting' || confidenceState === 'rerouting' || statusLabel.includes('recalculating')) {
    return 'rerouting';
  }
  if (confidenceState === 'reroute_failed' || statusLabel.includes('unable to recalculate')) {
    return 'reroute_failed';
  }
  if (confidenceState === 'reroute_applied' || statusLabel.includes('route updated')) {
    return 'reroute_applied';
  }
  return 'ready';
}

function resolveStatusLabel(status: ActiveGuidanceRouteLineStatus): string | null {
  if (status === 'rerouting') return 'Recalculating route...';
  if (status === 'reroute_failed') return 'Unable to recalculate route';
  if (status === 'reroute_applied') return 'Route updated';
  return null;
}

export function buildActiveGuidanceRouteLineSync(
  input: BuildActiveGuidanceRouteLineSyncInput,
): ActiveGuidanceRouteLineSync {
  const route = input.route ?? null;
  const geometry = normalizeGeometry(route?.geometry, input.fallbackGeometry);
  const hasGeometry = geometry.length > 1;
  const status = resolveStatus({
    navigationStatus: input.navigationStatus,
    routeConfidenceState: input.routeConfidenceState,
    routeStatusLabel: input.routeStatusLabel,
    hasGeometry,
  });
  const routeId = cleanLabel(route?.id) ?? null;
  const rerouteGeneration =
    typeof route?.rerouteGeneration === 'number' && Number.isFinite(route.rerouteGeneration)
      ? route.rerouteGeneration
      : null;
  const routeLineKey =
    hasGeometry
      ? [
          routeId ?? 'active-guidance-route',
          rerouteGeneration ?? 'no-generation',
          geometryFingerprint(geometry),
        ].join(':')
      : null;

  return {
    routeId,
    rerouteGeneration,
    routeLineKey,
    geometry,
    status,
    statusLabel: resolveStatusLabel(status),
    isStale: status === 'rerouting',
    distanceMeters:
      typeof route?.distanceMeters === 'number' && Number.isFinite(route.distanceMeters)
        ? route.distanceMeters
        : null,
    durationSeconds:
      typeof route?.durationSeconds === 'number' && Number.isFinite(route.durationSeconds)
        ? route.durationSeconds
        : null,
    guidanceMode: route?.guidanceMode ?? null,
  };
}

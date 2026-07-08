import type { EcsGuidanceCoordinate, EcsGuidanceRoute } from './ecsGuidanceModel';

export type ActiveGuidanceRouteLineStatus =
  | 'ready'
  | 'rerouting'
  | 'reroute_failed'
  | 'reroute_applied'
  | 'unavailable';

export interface ActiveGuidanceRouteLineSync {
  routeId: string | null;
  routeVersion: string | null;
  rerouteGeneration: number | null;
  routeLineKey: string | null;
  geometry: EcsGuidanceCoordinate[];
  status: ActiveGuidanceRouteLineStatus;
  statusLabel: string | null;
  isStale: boolean;
  versionMismatchPrevented: boolean;
  distanceMeters: number | null;
  durationSeconds: number | null;
  guidanceMode: EcsGuidanceRoute['guidanceMode'] | null;
}

export interface BuildActiveGuidanceRouteLineSyncInput {
  route?: EcsGuidanceRoute | null;
  fallbackGeometry?: readonly EcsGuidanceCoordinate[] | null;
  routeVersion?: string | null;
  navigationStatus?: string | null;
  routeConfidenceState?: string | null;
  routeStatusLabel?: string | null;
}

const ACTIVE_GUIDANCE_ROUTE_FINGERPRINT_MAX_POINTS = 256;

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

function coordinateRouteVersion(point: EcsGuidanceCoordinate): string | null {
  const value = (point as EcsGuidanceCoordinate & { routeVersion?: unknown }).routeVersion;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function routeGeometryMatchesVersion(
  geometry: readonly EcsGuidanceCoordinate[],
  routeVersion: string | null,
): boolean {
  const coordinateVersions = new Set(
    geometry
      .map(coordinateRouteVersion)
      .filter((value): value is string => !!value),
  );
  if (coordinateVersions.size > 1) return false;
  if (routeVersion && coordinateVersions.size === 1 && !coordinateVersions.has(routeVersion)) {
    return false;
  }
  return true;
}

function routeVersionMatches(
  route: EcsGuidanceRoute | null,
  activeRouteVersion: string | null,
): boolean {
  if (!route || !activeRouteVersion) return true;
  const routeVersion = cleanLabel((route as EcsGuidanceRoute & { routeVersion?: unknown }).routeVersion);
  return !routeVersion || routeVersion === activeRouteVersion;
}

function normalizeGeometry(
  routeGeometry?: readonly EcsGuidanceCoordinate[] | null,
  routeVersion?: string | null,
): EcsGuidanceCoordinate[] {
  if (!Array.isArray(routeGeometry) || routeGeometry.length < 2) return [];
  const geometry = routeGeometry.filter(isValidRouteCoordinate);
  if (geometry.length < 2) return [];
  if (!routeGeometryMatchesVersion(geometry, cleanLabel(routeVersion))) return [];
  return geometry;
}

function updateHashString(hash: number, value: string): number {
  let nextHash = hash;
  for (let index = 0; index < value.length; index += 1) {
    nextHash = ((nextHash << 5) + nextHash) ^ value.charCodeAt(index);
  }
  return nextHash;
}

function selectGeometryFingerprintCoordinates(
  geometry: readonly EcsGuidanceCoordinate[],
): EcsGuidanceCoordinate[] {
  if (geometry.length <= ACTIVE_GUIDANCE_ROUTE_FINGERPRINT_MAX_POINTS) return geometry.slice();

  const lastIndex = geometry.length - 1;
  const selected = new Set<number>([0, lastIndex]);
  const step = lastIndex / Math.max(ACTIVE_GUIDANCE_ROUTE_FINGERPRINT_MAX_POINTS - 1, 1);

  for (let slot = 1; slot < ACTIVE_GUIDANCE_ROUTE_FINGERPRINT_MAX_POINTS - 1; slot += 1) {
    selected.add(Math.round(slot * step));
  }

  return Array.from(selected)
    .sort((left, right) => left - right)
    .map((index) => geometry[index])
    .filter(isValidRouteCoordinate);
}

function hashGeometryFingerprintCoordinates(geometry: readonly EcsGuidanceCoordinate[]): string {
  let hash = 5381;
  for (const point of geometry) {
    hash = updateHashString(hash, point.lng.toFixed(5));
    hash = updateHashString(hash, ',');
    hash = updateHashString(hash, point.lat.toFixed(5));
    hash = updateHashString(hash, '|');
  }
  return (hash >>> 0).toString(36);
}

function geometryFingerprint(geometry: readonly EcsGuidanceCoordinate[]): string {
  if (geometry.length < 2) return 'empty';
  const fingerprintCoordinates = selectGeometryFingerprintCoordinates(geometry);
  return `${geometry.length}-${fingerprintCoordinates.length}-${hashGeometryFingerprintCoordinates(fingerprintCoordinates)}`;
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
  const routeVersion = cleanLabel(input.routeVersion) ?? null;
  const versionMismatchPrevented = !routeVersionMatches(route, routeVersion);
  const geometry = versionMismatchPrevented
    ? []
    : normalizeGeometry(route?.geometry, routeVersion);
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
          routeVersion,
          routeId ?? 'active-guidance-route',
          rerouteGeneration ?? 'no-generation',
          geometryFingerprint(geometry),
        ]
          .map((part) => (part == null ? null : String(part)))
          .filter((part): part is string => typeof part === 'string' && part.length > 0)
          .join(':')
      : null;

  return {
    routeId,
    routeVersion,
    rerouteGeneration,
    routeLineKey,
    geometry,
    status,
    statusLabel: resolveStatusLabel(status),
    isStale: status === 'rerouting',
    versionMismatchPrevented,
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

import type { RoadNavCoordinate, RoadNavRoute } from '../mapboxRoadNavigation';
import type { EcsGuidanceCoordinate, EcsGuidanceRoute, EcsGuidanceStep } from './ecsGuidanceModel';

type VersionedCoordinate = RoadNavCoordinate | EcsGuidanceCoordinate;

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function coordinateFingerprint(coordinate: VersionedCoordinate | null | undefined): string {
  if (!coordinate) return 'none';
  return `${coordinate.lat.toFixed(5)},${coordinate.lng.toFixed(5)}`;
}

function geometryFingerprint(geometry: readonly VersionedCoordinate[]): string {
  if (geometry.length === 0) return 'empty';
  const middle = geometry[Math.floor(geometry.length / 2)];
  return [
    geometry.length,
    coordinateFingerprint(geometry[0]),
    coordinateFingerprint(middle),
    coordinateFingerprint(geometry[geometry.length - 1]),
  ].join('|');
}

export function cleanRouteVersion(value: unknown): string | null {
  return cleanString(value);
}

export function getRouteIndex(route: Pick<RoadNavRoute, 'routeIndex' | 'selectedRouteIndex'>, fallback = 0): number {
  const routeIndex = finiteNumber(route.routeIndex);
  const selectedRouteIndex = finiteNumber(route.selectedRouteIndex);
  const resolved = routeIndex ?? selectedRouteIndex ?? fallback;
  return Math.max(0, Math.floor(resolved));
}

export function buildRouteVersionFromParts(args: {
  routeId: string;
  routeUuid?: string | null;
  rerouteGeneration?: number | null;
  routeIndex?: number | null;
  generatedAt: string;
  geometry: readonly VersionedCoordinate[];
  steps: readonly Pick<EcsGuidanceStep, 'id'>[];
}): string {
  const rerouteGeneration = finiteNumber(args.rerouteGeneration) ?? 0;
  const routeIndex = finiteNumber(args.routeIndex) ?? 0;
  return [
    args.routeId,
    rerouteGeneration,
    cleanString(args.routeUuid) ?? 'no-route-uuid',
    `alt-${Math.max(0, Math.floor(routeIndex))}`,
    args.generatedAt,
    `g-${geometryFingerprint(args.geometry)}`,
    `s-${args.steps.length}`,
  ].join(':');
}

export function deriveRoadNavRouteVersion(route: RoadNavRoute): string {
  return buildRouteVersionFromParts({
    routeId: route.guidance.id ?? route.id,
    routeUuid: route.mapboxRouteUuid ?? route.guidance.routeUuid ?? null,
    rerouteGeneration: route.guidance.rerouteGeneration ?? 0,
    routeIndex: getRouteIndex(route),
    generatedAt: route.guidance.createdAt ?? route.createdAt,
    geometry: route.guidance.geometry?.length ? route.guidance.geometry : route.geometry,
    steps: route.guidance.steps,
  });
}

export function getRoadNavRouteVersion(route: RoadNavRoute): string {
  return (
    cleanRouteVersion(route.routeVersion) ??
    cleanRouteVersion(route.guidance.routeVersion) ??
    deriveRoadNavRouteVersion(route)
  );
}

export function getGuidanceRouteVersion(route: EcsGuidanceRoute | null | undefined): string | null {
  return cleanRouteVersion(route?.routeVersion);
}

export function tagRouteGeometry<T extends VersionedCoordinate>(
  geometry: readonly T[],
  routeVersion: string,
): Array<T & { routeVersion: string }> {
  return geometry.map((point) => ({
    ...point,
    routeVersion,
  }));
}

export function ensureRoadNavRouteVersion(route: RoadNavRoute): RoadNavRoute {
  const routeVersion = getRoadNavRouteVersion(route);
  const routeIndex = getRouteIndex(route);
  const guidance: EcsGuidanceRoute = {
    ...route.guidance,
    routeVersion,
    routeIndex,
    geometry: tagRouteGeometry(route.guidance.geometry, routeVersion),
    providerMetadata: route.guidance.providerMetadata ?? route.providerMetadata,
  };

  return {
    ...route,
    routeVersion,
    routeIndex,
    selectedRouteIndex: route.selectedRouteIndex ?? routeIndex,
    guidance,
    geometry: tagRouteGeometry(route.geometry, routeVersion),
    providerMetadata: route.providerMetadata,
  };
}

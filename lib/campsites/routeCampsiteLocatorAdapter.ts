import type { RemotenessSnapshot } from '../campsiteCandidateEngine';
import { analyzeRoute, type RouteIntelligence } from '../routeAnalysisEngine';
import type { TerrainIntelligence } from '../terrainAnalysisEngine';
import type { CoordinateLike, RouteCampsiteLocatorInput } from './campsiteLocatorService';

type RoutePoint = { lat: number; lng: number; ele_m: number | null };

export type RouteCampsiteSourceType =
  | 'run'
  | 'road'
  | 'trail'
  | 'hybrid'
  | 'explore'
  | 'imported'
  | 'custom'
  | 'unknown';

export interface RouteCampsiteContext {
  routeId: string;
  routeName: string;
  sourceType: RouteCampsiteSourceType;
  routeCoordinates: CoordinateLike[];
  routeIntelligence?: RouteIntelligence | null;
  terrainIntelligence?: TerrainIntelligence | null;
  remotenessSnapshot?: RemotenessSnapshot | null;
  routeBufferMiles?: number | null;
  routeMetadata?: Record<string, unknown> | null;
}

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function normalizeRoutePoint(value: unknown): RoutePoint | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = Number(value[0]);
    const second = Number(value[1]);
    const latFirstValid = isValidCoordinate(first, second);
    const lonFirstValid = isValidCoordinate(second, first);
    if (latFirstValid && !lonFirstValid) return { lat: first, lng: second, ele_m: null };
    if (lonFirstValid) return { lat: second, lng: first, ele_m: null };
    return null;
  }

  if (typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const lat = Number(record.lat ?? record.latitude);
  const lng = Number(record.lng ?? record.lon ?? record.longitude);
  if (!isValidCoordinate(lat, lng)) return null;

  const ele = Number(record.ele_m ?? record.ele ?? record.elevationM);
  return { lat, lng, ele_m: Number.isFinite(ele) ? ele : null };
}

export function normalizeRouteCampsiteCoordinates(values: unknown[] | null | undefined): RoutePoint[] {
  const points: RoutePoint[] = [];
  for (const value of values ?? []) {
    const next = normalizeRoutePoint(value);
    if (!next) continue;
    const previous = points[points.length - 1];
    if (previous && previous.lat === next.lat && previous.lng === next.lng) continue;
    points.push(next);
  }
  return points;
}

function routeGeometrySignature(points: RoutePoint[]): string {
  if (points.length === 0) return 'empty';
  const first = points[0];
  const last = points[points.length - 1];
  const sampleStep = Math.max(1, Math.floor(points.length / 6));
  const sampled = points
    .filter((_, index) => index % sampleStep === 0)
    .slice(0, 8)
    .map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`)
    .join(';');
  return [
    points.length,
    first.lat.toFixed(5),
    first.lng.toFixed(5),
    last.lat.toFixed(5),
    last.lng.toFixed(5),
    sampled,
  ].join('|');
}

function hasUsableRouteIntelligence(
  routeIntelligence: RouteIntelligence | null | undefined,
  routeId: string,
  routeName: string,
  routeCoordinates: RoutePoint[],
): routeIntelligence is RouteIntelligence {
  if (!routeIntelligence || routeIntelligence.segments.length === 0) return false;
  if (routeIntelligence.sourceId === routeId || routeIntelligence.id === routeId) return true;

  const bounds = routeIntelligence.bounds;
  if (!bounds || routeCoordinates.length < 2) return false;
  if (routeIntelligence.routeName.trim().toLowerCase() !== routeName.trim().toLowerCase()) {
    return false;
  }
  const tolerance = 0.02;
  const endpoints = [routeCoordinates[0], routeCoordinates[routeCoordinates.length - 1]];
  return (
    routeIntelligence.totalDistanceMiles > 0 &&
    endpoints.every((point) =>
      point.lat >= bounds.minLat - tolerance &&
      point.lat <= bounds.maxLat + tolerance &&
      point.lng >= bounds.minLon - tolerance &&
      point.lng <= bounds.maxLon + tolerance,
    )
  );
}

export function buildRouteCampsiteLocatorInput(
  context: RouteCampsiteContext | null,
): RouteCampsiteLocatorInput | null {
  if (!context) return null;

  const routeCoordinates = normalizeRouteCampsiteCoordinates(context.routeCoordinates as unknown[]);
  if (routeCoordinates.length < 2) return null;

  const routeIntelligence = hasUsableRouteIntelligence(
    context.routeIntelligence,
    context.routeId,
    context.routeName,
    routeCoordinates,
  )
    ? context.routeIntelligence
    : analyzeRoute(
        routeCoordinates.map((point) => ({
          lat: point.lat,
          lon: point.lng,
          ele_m: point.ele_m,
        })),
        context.routeId,
        context.routeName,
      );

  if (!routeIntelligence || routeIntelligence.segments.length === 0) return null;

  return {
    routeId: context.routeId,
    routeCoordinates,
    routeIntelligence,
    terrainIntelligence:
      context.terrainIntelligence?.routeIntelligenceId === routeIntelligence.id
        ? context.terrainIntelligence
        : null,
    remotenessSnapshot: context.remotenessSnapshot ?? null,
    routeSourceType: context.sourceType,
    routeMetadata: context.routeMetadata ?? null,
    routeBufferMiles: context.routeBufferMiles ?? null,
  };
}

export function buildRouteCampsiteLocatorSignature(
  context: RouteCampsiteContext | null,
): string | null {
  if (!context) return null;
  const routeCoordinates = normalizeRouteCampsiteCoordinates(context.routeCoordinates as unknown[]);
  if (routeCoordinates.length < 2) return null;

  return [
    context.routeId,
    context.routeName,
    context.sourceType,
    routeGeometrySignature(routeCoordinates),
    context.routeIntelligence?.avgSpeedAssumption ?? 'default-speed',
    context.terrainIntelligence?.id ?? 'no-terrain',
    context.terrainIntelligence?.analyzedAt ?? 'no-terrain-date',
    context.remotenessSnapshot?.tier ?? 'no-tier',
    context.remotenessSnapshot?.score ?? 'no-score',
    context.routeMetadata ? JSON.stringify(context.routeMetadata).slice(0, 500) : 'no-route-metadata',
  ].join('::');
}

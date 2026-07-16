import type { NavigationHandoffPayload } from './navigationHandoffStore';
import {
  buildRoadRouteFromCachedGeometry,
  fetchImportedTraceRoadRoute,
  type RoadNavCoordinate,
  type RoadNavDestination,
  type RoadNavRoute,
} from './mapboxRoadNavigation';
import {
  buildTrailCumulativeDistances,
  projectOnTrailGeometry,
  trailDistanceMeters,
} from './trailGuidanceEngine';

const IMPORTED_TRACE_ON_ROUTE_FALLBACK_MAX_M = 160;

export type ImportedRouteGuidanceSource = 'mapbox_map_matching' | 'synthetic_geometry';

export type ImportedRouteGuidanceResolution = {
  route: RoadNavRoute;
  source: ImportedRouteGuidanceSource;
  distanceFromTraceM: number;
};

function normalizeCoordinate(value: RoadNavCoordinate | null | undefined): RoadNavCoordinate | null {
  if (!value) return null;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    lat,
    lng,
    ...(Number.isFinite(Number(value.ele ?? value.ele_m))
      ? { ele: Number(value.ele ?? value.ele_m), ele_m: Number(value.ele ?? value.ele_m) }
      : null),
  };
}

function normalizeGeometry(geometry: RoadNavCoordinate[]): RoadNavCoordinate[] {
  const normalized: RoadNavCoordinate[] = [];
  geometry.forEach((value) => {
    const point = normalizeCoordinate(value);
    if (!point) return;
    const previous = normalized[normalized.length - 1];
    if (previous && trailDistanceMeters(previous, point) <= 1) return;
    normalized.push(point);
  });
  return normalized;
}

export function isImportedTraceNavigationPayload(
  payload: NavigationHandoffPayload | null | undefined,
): payload is NavigationHandoffPayload {
  if (!payload || payload.trailGeometry.length < 2) return false;
  if (payload.routeSource === 'gpx' || payload.routeSource === 'cached_gpx') return true;
  const geometrySource = String(payload.routeMetadata?.geometrySource ?? '').toLowerCase();
  return geometrySource === 'stored_gpx_geometry';
}

export function prepareImportedTraceGuidanceGeometry(params: {
  origin: RoadNavCoordinate;
  geometry: RoadNavCoordinate[];
}): {
  geometry: RoadNavCoordinate[];
  distanceFromTraceM: number;
} | null {
  const origin = normalizeCoordinate(params.origin);
  const geometry = normalizeGeometry(params.geometry);
  if (!origin || geometry.length < 2) return null;

  const cumulativeDistances = buildTrailCumulativeDistances(geometry);
  const projection = projectOnTrailGeometry(origin, geometry, cumulativeDistances);
  return {
    geometry,
    distanceFromTraceM: projection.distanceFromRouteM,
  };
}

function importedTraceDestination(payload: NavigationHandoffPayload): RoadNavDestination | null {
  const finalCoordinate = normalizeCoordinate(
    payload.trailGeometry[payload.trailGeometry.length - 1] ?? payload.coordinate,
  );
  if (!finalCoordinate) return null;
  return {
    id: payload.id,
    title: payload.title,
    subtitle: payload.subtitle,
    coordinate: finalCoordinate,
    sourceType: 'explore_handoff',
    raw: payload.raw,
  };
}

export async function resolveImportedRouteGuidance(params: {
  payload: NavigationHandoffPayload;
  origin: RoadNavCoordinate;
  accessToken?: string | null;
  liveServicesEnabled: boolean;
}): Promise<ImportedRouteGuidanceResolution | null> {
  if (!isImportedTraceNavigationPayload(params.payload)) return null;
  const prepared = prepareImportedTraceGuidanceGeometry({
    origin: params.origin,
    geometry: params.payload.trailGeometry,
  });
  const destination = importedTraceDestination(params.payload);
  if (!prepared || prepared.geometry.length < 2 || !destination) return null;

  if (params.liveServicesEnabled && params.accessToken) {
    try {
      const matchedRoute = await fetchImportedTraceRoadRoute({
        accessToken: params.accessToken,
        origin: params.origin,
        destination,
        geometry: prepared.geometry,
      });
      if (matchedRoute) {
        return {
          route: matchedRoute,
          source: 'mapbox_map_matching',
          distanceFromTraceM: prepared.distanceFromTraceM,
        };
      }
    } catch {
      // The stored trace remains usable when the live matching provider is unavailable.
    }
  }

  if (prepared.distanceFromTraceM > IMPORTED_TRACE_ON_ROUTE_FALLBACK_MAX_M) return null;
  const route = buildRoadRouteFromCachedGeometry({
    id: `imported-trace-guidance:${params.payload.id}:${Date.now().toString(36)}`,
    origin: params.origin,
    destination,
    geometry: prepared.geometry,
    source: 'imported_trace',
    routeKind: 'road',
    createdAt: new Date().toISOString(),
  });
  if (route.guidance.guidanceMode !== 'turn_by_turn' || route.guidance.steps.length < 2) {
    return null;
  }

  return {
    route,
    source: 'synthetic_geometry',
    distanceFromTraceM: prepared.distanceFromTraceM,
  };
}

export function promoteImportedTracePayloadToRoadGuidance(
  payload: NavigationHandoffPayload,
  resolution: ImportedRouteGuidanceResolution,
): NavigationHandoffPayload {
  return {
    ...payload,
    tripMode: 'road',
    requiresOnlineRouting: false,
    routeMetadata: {
      ...(payload.routeMetadata ?? {}),
      importedTraceOriginalTripMode:
        payload.routeMetadata?.importedTraceOriginalTripMode ?? payload.tripMode ?? 'hybrid',
      activeGuidanceMode: resolution.route.guidance.guidanceMode,
      activeGuidanceProvider: resolution.route.providerMetadata?.provider ?? resolution.source,
      activeGuidanceSource: resolution.route.guidance.source,
      activeGuidanceSourceLabel: resolution.route.guidance.guidanceSourceLabel ?? null,
      activeGuidanceStepCount: resolution.route.guidance.steps.length,
      activeGuidanceDistanceFromTraceM: Math.round(resolution.distanceFromTraceM),
    },
  };
}

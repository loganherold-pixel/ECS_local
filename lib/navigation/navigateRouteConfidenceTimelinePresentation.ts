import type {
  RouteConfidenceTimeline,
  RouteConfidenceTimelineItem,
  RouteConfidenceTimelineOverlay,
  RouteGeometry,
} from '../routeContext';

/**
 * Navigate-owned presentation inputs for the canonical Route Confidence Timeline.
 * This module only normalizes displayed route context; deterministic confidence
 * conclusions remain owned by the Route Context engine.
 */
export type NavigateRouteConfidenceCacheSnapshot = {
  cached_route_available: boolean;
  offline_cache_ready: boolean;
  evaluated_at?: string | null;
};

export type NavigateRouteConfidenceSummaryInput = {
  confidence?: number | null;
  status?: string | null;
  summary?: string | null;
};

export type NavigateRouteHazardIntelInput = {
  headline?: string | null;
  summaryLine?: string | null;
};

export function routeConfidenceTimelineConfidenceFromPercent(
  value: number | null | undefined,
): RouteConfidenceTimelineOverlay['confidenceLevel'] {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value >= 70) return 'high';
  if (value >= 45) return 'medium';
  if (value > 0) return 'low';
  return 'unknown';
}

export function routeConfidenceTimelineTimestamp(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 0 && value < 100000000000 ? value * 1000 : value;
    const parsed = new Date(millis);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  return null;
}

export function routeConfidenceTimelineString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function routeConfidenceTimelineSource(
  id: string,
  label: string,
  observedAt: unknown,
  freshness: RouteConfidenceTimelineOverlay['source']['freshness'] = 'fresh',
): RouteConfidenceTimelineOverlay['source'] {
  return {
    id,
    label,
    sourceType: 'navigate',
    observedAt: routeConfidenceTimelineTimestamp(observedAt),
    freshness,
  };
}

export function navigateRouteConfidenceGeometry(
  routePoints: readonly { lat: number; lng: number }[],
  geometryVersion: string,
  distanceMeters?: number | null,
): RouteGeometry | null {
  const coordinates = routePoints
    .map((point) => ({
      lat: Number(point.lat),
      lng: Number(point.lng),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (coordinates.length < 2) return null;
  return {
    origin: coordinates[0],
    destination: coordinates[coordinates.length - 1],
    waypoints: coordinates.slice(1, -1),
    coordinates,
    distanceMeters: Number.isFinite(Number(distanceMeters)) ? Number(distanceMeters) : null,
    durationSeconds: null,
    bbox: null,
    corridor: null,
    segments: [],
    providerMetadata: {
      geometryVersion,
      source: 'navigate_displayed_route',
    },
  };
}

export function navigateTimelineMeasure(
  routePoints: readonly { lat: number; lng: number }[],
  distanceMeters?: number | null,
): number {
  const explicit = Number(distanceMeters);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Math.max((routePoints.length - 1) * 1000, 1000);
}

export function buildNavigateRouteConfidenceTimelineOverlays(args: {
  totalMeasure: number;
  routeConfidenceSummary: NavigateRouteConfidenceSummaryInput | null;
  cacheSnapshot: NavigateRouteConfidenceCacheSnapshot | null;
  routeHazardIntel: NavigateRouteHazardIntelInput | null;
  weatherObservedAt?: unknown;
  weatherSource?: string | null;
  generatedAt: string;
}): RouteConfidenceTimelineOverlay[] {
  const total = Math.max(args.totalMeasure, 1);
  const overlays: RouteConfidenceTimelineOverlay[] = [];
  const confidence = Number(args.routeConfidenceSummary?.confidence);
  if (Number.isFinite(confidence)) {
    const confidenceLevel = routeConfidenceTimelineConfidenceFromPercent(confidence);
    overlays.push({
      id: 'navigate-route-confidence-summary',
      startMeasure: 0,
      endMeasure: total,
      label: confidenceLevel === 'low' || confidenceLevel === 'unknown'
        ? 'Route confidence uncertainty'
        : 'Route confidence baseline',
      confidenceLevel,
      conditionState: confidenceLevel === 'low' || confidenceLevel === 'unknown' ? 'unknown' : 'normal',
      driverCategory: 'terrain_weather',
      source: routeConfidenceTimelineSource('route-confidence-summary', 'Route confidence summary', args.generatedAt),
      detail: routeConfidenceTimelineString(args.routeConfidenceSummary?.summary),
    });
  }

  if (args.cacheSnapshot && !args.cacheSnapshot.cached_route_available) {
    overlays.push({
      id: 'navigate-offline-map-gap',
      startMeasure: total * 0.35,
      endMeasure: total * 0.62,
      label: 'Offline map gap',
      confidenceLevel: args.cacheSnapshot.offline_cache_ready ? 'low' : 'unknown',
      conditionState: 'unknown',
      driverCategory: 'offline_coverage',
      source: routeConfidenceTimelineSource(
        'offline-cache-readiness',
        'Offline cache readiness',
        args.cacheSnapshot.evaluated_at || null,
        args.cacheSnapshot.offline_cache_ready ? 'fresh' : 'missing',
      ),
      detail: 'Offline package coverage is incomplete for this route context.',
    });
  }

  if (args.routeHazardIntel) {
    overlays.push({
      id: 'navigate-weather-risk',
      startMeasure: total * 0.55,
      endMeasure: total * 0.86,
      label: args.routeHazardIntel.headline ?? 'Weather-exposed corridor',
      confidenceLevel: args.weatherSource === 'live' ? 'high' : 'medium',
      conditionState: 'known_risky',
      driverCategory: 'terrain_weather',
      source: routeConfidenceTimelineSource(
        'route-corridor-weather',
        'Route corridor weather',
        args.weatherObservedAt ?? args.generatedAt,
        args.weatherSource === 'cache_stale' ? 'stale' : 'fresh',
      ),
      detail: routeConfidenceTimelineString(args.routeHazardIntel.summaryLine),
    });
  }

  return overlays;
}

export function routeConfidenceTimelinePointAtMeasure(
  routePoints: readonly { lat: number; lng: number }[],
  item: RouteConfidenceTimelineItem,
  totalMeasure: number,
): { lat: number; lng: number } | null {
  if (routePoints.length === 0) return null;
  const midpoint = (item.startMeasure + item.endMeasure) / 2;
  const ratio = totalMeasure > 0 ? Math.max(0, Math.min(1, midpoint / totalMeasure)) : 0;
  const index = Math.max(0, Math.min(routePoints.length - 1, Math.round(ratio * (routePoints.length - 1))));
  const point = routePoints[index];
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    ? { lat: point.lat, lng: point.lng }
    : null;
}

export function routeConfidenceTimelineMatchesRoute(
  timeline: RouteConfidenceTimeline | null,
  selectedRouteId: string | null | undefined,
  selectedRouteGeometryVersion: string | null | undefined,
): boolean {
  if (!timeline) return false;
  const expectedRouteId = selectedRouteId ?? 'navigate-route';
  return (
    timeline.routeId === expectedRouteId &&
    timeline.geometryVersion === selectedRouteGeometryVersion
  );
}


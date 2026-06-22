export type ExploreMapPreviewCoordinate = {
  latitude: number;
  longitude: number;
};

export type ExploreMapPreviewRoute = {
  routeId: string;
  title: string;
  category?: string | null;
  geometry?: ExploreMapPreviewCoordinate[] | null;
  trailheadCoordinate?: ExploreMapPreviewCoordinate | null;
  centroidCoordinate?: ExploreMapPreviewCoordinate | null;
  guidanceReady?: boolean;
  source?: string | null;
};

export type ExploreMapPreviewRenderPlan = {
  mode: 'clustered_markers' | 'simplified_lines' | 'focused_detail';
  useCombinedFeatureCollection: true;
  lazyLoadFullGeometry: true;
  maxPointsPerRoute: number;
  reason: string;
};

export type ExploreRoutePreviewFeature = {
  type: 'Feature';
  geometry:
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Point'; coordinates: [number, number] };
  properties: {
    routeId: string;
    title: string;
    category: string;
    guidanceReady: boolean;
    source: string;
    geometryResolution: 'preview_simplified' | 'preview_marker';
  };
};

export type ExploreRoutePreviewFeatureCollection = {
  type: 'FeatureCollection';
  features: ExploreRoutePreviewFeature[];
  metadata: {
    mode: ExploreMapPreviewRenderPlan['mode'];
    combinedSourceCount: 1;
    lineLayerCount: number;
    markerLayerCount: number;
    fullGeometryLoadedForInitialCards: false;
    maxPointsPerRoute: number;
  };
};

export type ExploreInitialRenderWorkEstimate = {
  candidateCount: number;
  cachedResultCount: number;
  pendingRefresh: boolean;
  estimatedInitialCardRenderCount: number;
  firstVisibleCanRenderBeforeRefresh: boolean;
  fullGeometryRequiredForInitialCards: false;
};

export const EXPLORE_PREVIEW_MAX_SIMPLIFIED_POINTS = 48;
const LOW_ZOOM_CLUSTER_THRESHOLD = 9;
const HIGH_CANDIDATE_CLUSTER_THRESHOLD = 120;

function isValidCoordinate(point: ExploreMapPreviewCoordinate | null | undefined): point is ExploreMapPreviewCoordinate {
  return (
    !!point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

function sameCoordinate(left: ExploreMapPreviewCoordinate, right: ExploreMapPreviewCoordinate): boolean {
  return Math.abs(left.latitude - right.latitude) < 0.0000001 &&
    Math.abs(left.longitude - right.longitude) < 0.0000001;
}

export function simplifyRouteGeometryForPreview(
  coordinates: ExploreMapPreviewCoordinate[],
  options: { maxPoints?: number } = {},
): ExploreMapPreviewCoordinate[] {
  const validCoordinates = coordinates.filter(isValidCoordinate);
  const maxPoints = Math.max(2, Math.round(options.maxPoints ?? EXPLORE_PREVIEW_MAX_SIMPLIFIED_POINTS));
  if (validCoordinates.length <= maxPoints) return validCoordinates.slice();

  const simplified: ExploreMapPreviewCoordinate[] = [];
  const lastIndex = validCoordinates.length - 1;
  const step = lastIndex / (maxPoints - 1);

  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = index === maxPoints - 1 ? lastIndex : Math.round(index * step);
    const point = validCoordinates[sourceIndex];
    if (!point) continue;
    if (simplified.length === 0 || !sameCoordinate(simplified[simplified.length - 1], point)) {
      simplified.push(point);
    }
  }

  const first = validCoordinates[0];
  const last = validCoordinates[lastIndex];
  if (simplified.length === 0 || !sameCoordinate(simplified[0], first)) {
    simplified.unshift(first);
  }
  if (!sameCoordinate(simplified[simplified.length - 1], last)) {
    simplified.push(last);
  }

  return simplified.slice(0, maxPoints - 1).concat(last);
}

export function getExploreMapPreviewRenderPlan(input: {
  zoom: number;
  candidateCount: number;
  focusedRouteId?: string | null;
}): ExploreMapPreviewRenderPlan {
  if (input.focusedRouteId) {
    return {
      mode: 'focused_detail',
      useCombinedFeatureCollection: true,
      lazyLoadFullGeometry: true,
      maxPointsPerRoute: EXPLORE_PREVIEW_MAX_SIMPLIFIED_POINTS,
      reason: 'focused_route_detail_loads_full_geometry_only_for_selection',
    };
  }

  if (input.zoom <= LOW_ZOOM_CLUSTER_THRESHOLD || input.candidateCount >= HIGH_CANDIDATE_CLUSTER_THRESHOLD) {
    return {
      mode: 'clustered_markers',
      useCombinedFeatureCollection: true,
      lazyLoadFullGeometry: true,
      maxPointsPerRoute: 2,
      reason: 'low_zoom_or_many_routes_use_clustered_markers',
    };
  }

  return {
    mode: 'simplified_lines',
    useCombinedFeatureCollection: true,
    lazyLoadFullGeometry: true,
    maxPointsPerRoute: EXPLORE_PREVIEW_MAX_SIMPLIFIED_POINTS,
    reason: 'viewport_can_show_simplified_route_lines',
  };
}

function midpoint(points: ExploreMapPreviewCoordinate[]): ExploreMapPreviewCoordinate | null {
  const valid = points.filter(isValidCoordinate);
  if (valid.length === 0) return null;
  return valid[Math.floor(valid.length / 2)];
}

function pointCoordinates(point: ExploreMapPreviewCoordinate): [number, number] {
  return [point.longitude, point.latitude];
}

function routePoint(route: ExploreMapPreviewRoute): ExploreMapPreviewCoordinate | null {
  return (
    route.trailheadCoordinate ??
    route.centroidCoordinate ??
    midpoint(route.geometry ?? []) ??
    null
  );
}

export function buildExploreRoutePreviewFeatureCollection(
  routes: ExploreMapPreviewRoute[],
  options: {
    zoom: number;
    focusedRouteId?: string | null;
    maxPointsPerRoute?: number;
  },
): ExploreRoutePreviewFeatureCollection {
  const plan = getExploreMapPreviewRenderPlan({
    zoom: options.zoom,
    candidateCount: routes.length,
    focusedRouteId: options.focusedRouteId ?? null,
  });
  const maxPointsPerRoute = Math.max(2, Math.round(options.maxPointsPerRoute ?? plan.maxPointsPerRoute));
  const features: ExploreRoutePreviewFeature[] = [];

  routes.forEach((route) => {
    const validGeometry = (route.geometry ?? []).filter(isValidCoordinate);
    const shouldRenderLine =
      validGeometry.length >= 2 &&
      (plan.mode === 'simplified_lines' || plan.mode === 'focused_detail');

    if (shouldRenderLine) {
      const simplified = simplifyRouteGeometryForPreview(validGeometry, { maxPoints: maxPointsPerRoute });
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: simplified.map(pointCoordinates),
        },
        properties: {
          routeId: route.routeId,
          title: route.title,
          category: route.category ?? 'route',
          guidanceReady: route.guidanceReady !== false,
          source: route.source ?? 'ecs_route_catalog',
          geometryResolution: 'preview_simplified',
        },
      });
      return;
    }

    const markerPoint = routePoint(route);
    if (!markerPoint) return;
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: pointCoordinates(markerPoint),
      },
      properties: {
        routeId: route.routeId,
        title: route.title,
        category: route.category ?? 'route',
        guidanceReady: route.guidanceReady !== false,
        source: route.source ?? 'ecs_route_catalog',
        geometryResolution: 'preview_marker',
      },
    });
  });

  return {
    type: 'FeatureCollection',
    features,
    metadata: {
      mode: plan.mode,
      combinedSourceCount: 1,
      lineLayerCount: plan.mode === 'clustered_markers' ? 0 : 2,
      markerLayerCount: 1,
      fullGeometryLoadedForInitialCards: false,
      maxPointsPerRoute,
    },
  };
}

export function estimateExploreInitialRenderWork(input: {
  candidateCount: number;
  cachedResultCount?: number;
  visibleCardCount: number;
  pendingRefresh?: boolean;
}): ExploreInitialRenderWorkEstimate {
  const visibleCardCount = Math.max(0, Math.round(input.visibleCardCount));
  const cachedResultCount = Math.max(0, Math.round(input.cachedResultCount ?? 0));
  return {
    candidateCount: Math.max(0, Math.round(input.candidateCount)),
    cachedResultCount,
    pendingRefresh: !!input.pendingRefresh,
    estimatedInitialCardRenderCount: Math.min(visibleCardCount, 12),
    firstVisibleCanRenderBeforeRefresh: cachedResultCount > 0 || !input.pendingRefresh,
    fullGeometryRequiredForInitialCards: false,
  };
}

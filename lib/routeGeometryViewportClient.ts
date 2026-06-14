import { supabase } from './supabase';
import {
  ROUTE_GEOMETRY_VIEWPORT_DEFAULT_LIMIT,
  normalizeRouteGeometryViewportResponse,
  type RouteGeometryViewportBbox,
  type RouteGeometryViewportResult,
} from './routeGeometryViewport';

export function isRouteGeometryViewportOverlayFeatureEnabled(): boolean {
  const value =
    typeof process !== 'undefined'
      ? process.env.EXPO_PUBLIC_ECS_ROUTE_GEOMETRY_VIEWPORT_OVERLAY
      : undefined;
  return value === '1' || value === 'true';
}

export async function fetchRouteGeometryViewportSegments(args: {
  bbox: RouteGeometryViewportBbox;
  zoom: number;
  limit?: number;
  vehicleClass?: string | null;
  includeReferenceGeometry?: boolean;
}): Promise<RouteGeometryViewportResult> {
  const { data, error } = await supabase.functions.invoke('route-geometry-segments', {
    body: {
      bbox: args.bbox,
      zoom: args.zoom,
      limit: args.limit ?? ROUTE_GEOMETRY_VIEWPORT_DEFAULT_LIMIT,
      vehicleClass: args.vehicleClass ?? null,
      includeReferenceGeometry: args.includeReferenceGeometry !== false,
    },
  });

  if (error) {
    throw new Error(error.message || 'ECS route geometry is unavailable.');
  }

  return normalizeRouteGeometryViewportResponse(data);
}

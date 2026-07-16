import {
  fetchRouteGeometryViewportSegments,
} from '../../../../lib/routeGeometryViewportClient';
import { supabase } from '../../../../lib/supabase';
import type {
  RouteGeometryViewportBbox,
  RouteGeometryViewportResult,
} from '../../../../lib/routeGeometryViewport';
import {
  MVUM_SOURCE_PROVIDER_PREFIX,
  normalizeMvumCanonicalSegment,
  type MvumCanonicalSegment,
} from './index';

export async function fetchNavigateMvumViewportSegments(args: {
  bbox: RouteGeometryViewportBbox;
  zoom: number;
  limit?: number;
  vehicleClass?: string | null;
  signal?: AbortSignal;
}): Promise<RouteGeometryViewportResult> {
  return fetchRouteGeometryViewportSegments({
    bbox: args.bbox,
    zoom: args.zoom,
    limit: args.limit,
    vehicleClass: args.vehicleClass ?? null,
    includeReferenceGeometry: true,
    sourceProviderPrefix: MVUM_SOURCE_PROVIDER_PREFIX,
    signal: args.signal,
  });
}

export async function fetchNavigateMvumCanonicalSegments(args: {
  segmentIds: readonly string[];
}): Promise<MvumCanonicalSegment[]> {
  const segmentIds = Array.from(new Set(args.segmentIds.map((id) => String(id ?? '').trim()).filter(Boolean)));
  if (segmentIds.length === 0) return [];

  const { data, error } = await supabase.functions.invoke('navigate-mvum-segment-geometry', {
    body: { segmentIds },
  });

  if (error) {
    throw new Error(
      typeof error.message === 'string' && error.message.trim().length > 0
        ? error.message
        : 'MVUM canonical geometry unavailable',
    );
  }

  const rawSegments = Array.isArray((data as { segments?: unknown[] } | null)?.segments)
    ? (data as { segments: unknown[] }).segments
    : Array.isArray(data)
      ? data
      : [];
  return rawSegments
    .map(normalizeMvumCanonicalSegment)
    .filter((segment): segment is MvumCanonicalSegment => !!segment);
}

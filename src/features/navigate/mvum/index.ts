import {
  buildRouteGeometryViewportCacheKey,
  isRouteGeometryViewportZoomEligible,
  normalizeRouteGeometryViewportBbox,
  ROUTE_GEOMETRY_VIEWPORT_MIN_ZOOM,
  type RouteGeometryViewportBbox,
  type RouteGeometryViewportResult,
  type RouteGeometryViewportSegment,
} from '../../../../lib/routeGeometryViewport';
import type {
  MvumSegmentSummary,
  MvumSelectedSegment,
  RouteLineGeometry,
  StitchedRouteDraft,
  StitchedRouteGap,
  StitchedRouteGeometrySourceState,
} from '../../../../lib/routeDataContracts';
import { normalizeNavigationGuidanceGeometry } from '../../../../lib/navigationCatalogGuidanceGeometry';
import {
  buildGuidanceRouteDistanceIndex,
  findNearestPlausibleRouteProjection,
  resolveGuidanceSnapToleranceMeters,
  splitGuidanceRouteAtProjection,
  type GuidanceRouteCoordinate,
} from '../../../../lib/navigation/guidanceRouteProjection';

export const MVUM_OVERLAY_SOURCE_ID = 'navigate-mvum-source';
export const MVUM_OVERLAY_HALO_LAYER_ID = 'navigate-mvum-halo-layer';
export const MVUM_OVERLAY_LAYER_ID = 'navigate-mvum-line-layer';
export const MVUM_OVERLAY_SELECTED_SOURCE_ID = 'navigate-mvum-selected-source';
export const MVUM_OVERLAY_SELECTED_LAYER_ID = 'navigate-mvum-selected-layer';
export const MVUM_OVERLAY_MIN_ZOOM = ROUTE_GEOMETRY_VIEWPORT_MIN_ZOOM;
export const MVUM_OVERLAY_SOURCE_LAYER = 'mvum_segments';
export const MVUM_OVERLAY_CACHE_NAMESPACE = 'navigate.mvum.viewport';
export const MVUM_VIEWPORT_CACHE_TTL_MS = 5 * 60 * 1000;
export const MVUM_SOURCE_PROVIDER_PREFIX = 'usfs_mvum';
export const MVUM_SEGMENT_ID_PROPERTY_KEYS = [
  'segmentId',
  'segment_id',
  'routeSegmentId',
  'route_segment_id',
  'id',
] as const;
export const NAVIGATE_STITCHED_ROUTE_SOURCE_ID = 'navigate-stitched-route-source';
export const NAVIGATE_STITCHED_ROUTE_LAYER_ID = 'navigate-stitched-route-layer';
export const NAVIGATE_STITCHED_ROUTE_HALO_LAYER_ID = 'navigate-stitched-route-halo-layer';
export const MVUM_STITCH_GAP_THRESHOLD_METERS = 35;

export type NavigateMvumOverlayState = {
  enabled: boolean;
  selectedSegmentIds: string[];
};

export type NavigateMvumViewportFetchPlan =
  | { status: 'disabled' }
  | { status: 'vector_tiles'; tileUrl: string; sourceLayer: string }
  | { status: 'zoom_deferred'; minZoom: number }
  | { status: 'offline'; bbox: RouteGeometryViewportBbox | null; cacheKey: string | null }
  | { status: 'missing_bbox' }
  | { status: 'fetch_viewport'; bbox: RouteGeometryViewportBbox; cacheKey: string };

export type NavigateMvumViewportCacheEntry = {
  result: RouteGeometryViewportResult;
  cachedAtMs: number;
};

export type NavigateMvumMapOverlayPayload = {
  enabled: boolean;
  requestFingerprint?: string | null;
  requestGeneration?: number;
  invalidFeatureCount?: number;
  minZoom: number;
  sourceId: typeof MVUM_OVERLAY_SOURCE_ID;
  sourceType: 'vector' | 'geojson';
  vectorTileUrl: string | null;
  vectorSourceLayer: string;
  featureCollection: MvumLineFeatureCollection | null;
  selectedSourceId: typeof MVUM_OVERLAY_SELECTED_SOURCE_ID;
  selectedSegmentIds: string[];
};

export type MvumCanonicalSegmentSourceQuality =
  | 'canonical'
  | 'limited_tile_geometry'
  | 'unavailable';

export type MvumCanonicalSegment = {
  segmentId: string;
  sourceLayer: string;
  sourceQuality: MvumCanonicalSegmentSourceQuality;
  geometry: RouteLineGeometry | null;
  distanceMeters: number | null;
  estimatedDurationSeconds: number | null;
  warnings: string[];
};

export type NavigateMvumSelectionSnapshot = {
  selectedSegmentIds: string[];
  selectedSegments: MvumSelectedSegment[];
  selectedAtById: ReadonlyMap<string, string>;
};

export type NavigateMvumSelectionStore = {
  getSnapshot: () => NavigateMvumSelectionSnapshot;
  toggleSegment: (segmentId: string) => NavigateMvumSelectionSnapshot;
  clear: () => NavigateMvumSelectionSnapshot;
  subscribe: (listener: () => void) => () => void;
};

export type NavigateMvumStitchedRoutePreviewPayload = {
  sourceId: typeof NAVIGATE_STITCHED_ROUTE_SOURCE_ID;
  layerId: typeof NAVIGATE_STITCHED_ROUTE_LAYER_ID;
  haloLayerId: typeof NAVIGATE_STITCHED_ROUTE_HALO_LAYER_ID;
  draftId: string;
  featureCollection: MvumRouteFeatureCollection;
  unresolvedGapCount: number;
  warnings: string[];
};

export type NavigateMvumGuidanceEntryPlan = {
  status:
    | 'ready_on_route'
    | 'ready_with_approach'
    | 'location_unavailable'
    | 'preview_only'
    | 'invalid_geometry';
  entryCoordinate: GuidanceRouteCoordinate | null;
  trailGeometry: GuidanceRouteCoordinate[];
  distanceToEntryM: number | null;
  snapToleranceM: number;
  skippedRouteDistanceM: number;
  remainingRouteDistanceM: number;
  reason: string | null;
};

export type MvumLineStringGeometry = {
  type: 'LineString';
  coordinates: [number, number][];
};

export type MvumMultiLineStringGeometry = {
  type: 'MultiLineString';
  coordinates: [number, number][][];
};

export type MvumLineFeature = {
  type: 'Feature';
  id: string;
  properties: Record<string, unknown>;
  geometry: MvumLineStringGeometry;
};

export type MvumLineFeatureCollection = {
  type: 'FeatureCollection';
  features: MvumLineFeature[];
};

export type MvumRouteFeature = {
  type: 'Feature';
  id: string;
  properties: Record<string, unknown>;
  geometry: MvumLineStringGeometry | MvumMultiLineStringGeometry;
};

export type MvumRouteFeatureCollection = {
  type: 'FeatureCollection';
  features: MvumRouteFeature[];
};

type BuildNavigateMvumMapOverlayInput = {
  enabled: boolean;
  requestFingerprint?: string | null;
  requestGeneration?: number;
  invalidFeatureCount?: number;
  selectedSegmentIds: string[];
  vectorTileUrl?: string | null;
  vectorSourceLayer?: string | null;
  viewportSegments?: RouteGeometryViewportSegment[] | null;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function createNavigateMvumViewportCacheEntry(
  result: RouteGeometryViewportResult,
  cachedAtMs = Date.now(),
): NavigateMvumViewportCacheEntry | null {
  if (result.degraded || result.segments.length === 0 || !Number.isFinite(cachedAtMs)) {
    return null;
  }
  return { result, cachedAtMs };
}

export function readNavigateMvumViewportCacheEntry(
  value: unknown,
  nowMs = Date.now(),
): RouteGeometryViewportResult | null {
  const entry = readRecord(value);
  const cachedAtMs = finiteNumber(entry?.cachedAtMs);
  const result = entry?.result as RouteGeometryViewportResult | undefined;
  if (
    cachedAtMs == null ||
    !result ||
    !Array.isArray(result.segments) ||
    result.degraded ||
    result.segments.length === 0
  ) {
    return null;
  }
  const checkedAtMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  return checkedAtMs - cachedAtMs < MVUM_VIEWPORT_CACHE_TTL_MS ? result : null;
}

function uniqueCleanIds(ids: readonly unknown[]): string[] {
  const next: string[] = [];
  const seen = new Set<string>();
  ids.forEach((id) => {
    const normalized = cleanText(id);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    next.push(normalized);
  });
  return next;
}

function cleanCoordinatePair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = finiteNumber(value[0]);
  const latitude = finiteNumber(value[1]);
  if (longitude == null || latitude == null) return null;
  if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null;
  return [longitude, latitude];
}

function cleanLineCoordinates(value: unknown): [number, number][] | null {
  if (!Array.isArray(value)) return null;
  const coordinates = value
    .map(cleanCoordinatePair)
    .filter((point): point is [number, number] => !!point);
  return coordinates.length >= 2 ? coordinates : null;
}

function normalizeRouteLineGeometry(value: unknown): RouteLineGeometry | null {
  const record = readRecord(value);
  if (!record) return null;

  if (record.type === 'LineString') {
    const coordinates = cleanLineCoordinates(record.coordinates);
    return coordinates ? { type: 'LineString', coordinates } : null;
  }

  if (record.type === 'MultiLineString' && Array.isArray(record.coordinates)) {
    const coordinates = record.coordinates
      .map(cleanLineCoordinates)
      .filter((line): line is [number, number][] => !!line);
    return coordinates.length > 0 ? { type: 'MultiLineString', coordinates } : null;
  }

  return null;
}

function lineCoordinatesFromGeometry(geometry: RouteLineGeometry | null | undefined): [number, number][] | null {
  if (!geometry) return null;
  if (geometry.type === 'LineString') {
    return cleanLineCoordinates(geometry.coordinates);
  }
  if (geometry.type !== 'MultiLineString' || !Array.isArray(geometry.coordinates)) return null;
  const lines = geometry.coordinates
    .map(cleanLineCoordinates)
    .filter((line): line is [number, number][] => !!line);
  if (lines.length === 0) return null;
  return lines.reduce<[number, number][]>((merged, line) => {
    if (merged.length === 0) return [...line];
    const last = merged[merged.length - 1];
    const first = line[0];
    if (last && first && coordinateDistanceMeters(last, first) <= 1) {
      return [...merged, ...line.slice(1)];
    }
    return [...merged, ...line];
  }, []);
}

function coordinateDistanceMeters(a: [number, number], b: [number, number]): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusM = 6371008.8;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const deltaLat = toRad(b[1] - a[1]);
  const deltaLng = toRad(b[0] - a[0]);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function lineDistanceMeters(coordinates: readonly [number, number][]): number {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += coordinateDistanceMeters(coordinates[index - 1], coordinates[index]);
  }
  return total;
}

function reverseLine(coordinates: readonly [number, number][]): [number, number][] {
  return [...coordinates].reverse();
}

function mergeLinesWithoutDuplicateEndpoints(lines: readonly [number, number][][]): [number, number][] {
  return lines.reduce<[number, number][]>((merged, line) => {
    if (line.length === 0) return merged;
    if (merged.length === 0) return [...line];
    const last = merged[merged.length - 1];
    const first = line[0];
    if (last && first && coordinateDistanceMeters(last, first) <= 1) {
      return [...merged, ...line.slice(1)];
    }
    return [...merged, ...line];
  }, []);
}

function mvumViewportCacheKey(cacheKey: string): string {
  return `${MVUM_OVERLAY_CACHE_NAMESPACE}:${cacheKey}`;
}

export function buildNavigateMvumViewportCacheKey(
  bbox: RouteGeometryViewportBbox,
  zoom: number,
  vehicleClass?: string | null,
): string {
  return mvumViewportCacheKey(
    buildRouteGeometryViewportCacheKey(bbox, zoom, {
      includeReferenceGeometry: true,
      vehicleClass: vehicleClass ?? null,
      sourceProviderPrefix: MVUM_SOURCE_PROVIDER_PREFIX,
    }),
  );
}

function normalizeMvumViewportBbox(value: unknown): RouteGeometryViewportBbox | null {
  const record = value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
  if (!record) return null;
  const minLat = Number(record.minLat ?? record.minLatitude);
  const minLng = Number(record.minLng ?? record.minLongitude);
  const maxLat = Number(record.maxLat ?? record.maxLatitude);
  const maxLng = Number(record.maxLng ?? record.maxLongitude);
  return normalizeRouteGeometryViewportBbox({
    minLat,
    minLng,
    maxLat,
    maxLng,
  });
}

function segmentBbox(segment: RouteGeometryViewportSegment): MvumSegmentSummary['bbox'] {
  const points = segment.coordinates.filter((point) =>
    Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
  );
  if (points.length === 0) return null;
  return {
    minLat: Math.min(...points.map((point) => point.latitude)),
    minLng: Math.min(...points.map((point) => point.longitude)),
    maxLat: Math.max(...points.map((point) => point.latitude)),
    maxLng: Math.max(...points.map((point) => point.longitude)),
  };
}

export function createNavigateMvumOverlayState(): NavigateMvumOverlayState {
  return {
    enabled: false,
    selectedSegmentIds: [],
  };
}

export function createNavigateMvumSelectionStore(options?: {
  initialSegmentIds?: readonly string[];
  sourceLayer?: string | null;
  now?: () => string;
}): NavigateMvumSelectionStore {
  let selectedSegmentIds = uniqueCleanIds(options?.initialSegmentIds ?? []);
  const selectedAtById = new Map<string, string>();
  const listeners = new Set<() => void>();
  const sourceLayer = cleanText(options?.sourceLayer) ?? MVUM_OVERLAY_SOURCE_LAYER;
  const now = options?.now ?? (() => new Date().toISOString());

  selectedSegmentIds.forEach((segmentId) => {
    selectedAtById.set(segmentId, now());
  });

  const buildSnapshot = (): NavigateMvumSelectionSnapshot => ({
    selectedSegmentIds: [...selectedSegmentIds],
    selectedSegments: buildMvumSelectedSegments(selectedSegmentIds, selectedAtById, sourceLayer),
    selectedAtById: new Map(selectedAtById),
  });

  const publish = () => {
    listeners.forEach((listener) => listener());
    return buildSnapshot();
  };

  return {
    getSnapshot: buildSnapshot,
    toggleSegment(segmentId: string) {
      const normalizedId = cleanText(segmentId);
      if (!normalizedId) return buildSnapshot();
      if (selectedSegmentIds.includes(normalizedId)) {
        selectedSegmentIds = selectedSegmentIds.filter((id) => id !== normalizedId);
        selectedAtById.delete(normalizedId);
      } else {
        selectedSegmentIds = [...selectedSegmentIds, normalizedId];
        selectedAtById.set(normalizedId, now());
      }
      return publish();
    },
    clear() {
      if (selectedSegmentIds.length === 0) return buildSnapshot();
      selectedSegmentIds = [];
      selectedAtById.clear();
      return publish();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function toggleMvumSelectedSegmentId(currentIds: readonly string[], segmentId: string): string[] {
  const normalizedId = cleanText(segmentId);
  const existing = uniqueCleanIds(currentIds);
  if (!normalizedId) return existing;
  return existing.includes(normalizedId)
    ? existing.filter((id) => id !== normalizedId)
    : [...existing, normalizedId];
}

export function planNavigateMvumViewportFetch(args: {
  enabled: boolean;
  bbox?: RouteGeometryViewportBbox | null;
  zoom?: number | null;
  online?: boolean | null;
  vehicleClass?: string | null;
  vectorTileUrl?: string | null;
  vectorSourceLayer?: string | null;
}): NavigateMvumViewportFetchPlan {
  if (!args.enabled) return { status: 'disabled' };
  if (!isRouteGeometryViewportZoomEligible(args.zoom)) {
    return { status: 'zoom_deferred', minZoom: MVUM_OVERLAY_MIN_ZOOM };
  }
  const tileUrl = cleanText(args.vectorTileUrl);
  if (tileUrl) {
    return {
      status: 'vector_tiles',
      tileUrl,
      sourceLayer: cleanText(args.vectorSourceLayer) ?? MVUM_OVERLAY_SOURCE_LAYER,
    };
  }
  const bbox = normalizeMvumViewportBbox(args.bbox);
  if (args.online === false) {
    return {
      status: 'offline',
      bbox,
      cacheKey: bbox
        ? buildNavigateMvumViewportCacheKey(bbox, Number(args.zoom), args.vehicleClass)
        : null,
    };
  }
  if (!bbox) return { status: 'missing_bbox' };
  return {
    status: 'fetch_viewport',
    bbox,
    cacheKey: buildNavigateMvumViewportCacheKey(bbox, Number(args.zoom), args.vehicleClass),
  };
}

export function mvumSegmentsToSummaries(
  segments: readonly RouteGeometryViewportSegment[],
  fetchedAt?: string | null,
): MvumSegmentSummary[] {
  return segments.map((segment) => ({
    segmentId: segment.id,
    forestId: null,
    routeNumber: null,
    trailName: segment.name,
    allowedUse: [],
    difficulty: null,
    bbox: segmentBbox(segment),
    sourceLayer: segment.sourceLabel || segment.sourceId || MVUM_OVERLAY_SOURCE_LAYER,
    updatedAt: segment.lastVerifiedAt ?? fetchedAt ?? null,
  }));
}

export function buildMvumSelectedSegments(
  segmentIds: readonly string[],
  selectedAtById: ReadonlyMap<string, string>,
  sourceLayer = MVUM_OVERLAY_SOURCE_LAYER,
): MvumSelectedSegment[] {
  const now = new Date().toISOString();
  return uniqueCleanIds(segmentIds).map((segmentId, index) => ({
    segmentId,
    selectedAt: selectedAtById.get(segmentId) ?? now,
    selectionOrder: index + 1,
    sourceLayer,
    tileFeatureId: segmentId,
  }));
}

export function normalizeMvumCanonicalSegment(value: unknown): MvumCanonicalSegment | null {
  const record = readRecord(value);
  if (!record) return null;
  const segmentId = cleanText(record.segmentId ?? record.segment_id ?? record.id);
  if (!segmentId) return null;
  const sourceQualityValue = cleanText(record.sourceQuality ?? record.source_quality);
  const sourceQuality: MvumCanonicalSegmentSourceQuality =
    sourceQualityValue === 'canonical' ||
    sourceQualityValue === 'limited_tile_geometry' ||
    sourceQualityValue === 'unavailable'
      ? sourceQualityValue
      : 'canonical';
  const geometry = normalizeRouteLineGeometry(record.geometry ?? record.routeGeometry ?? record.route_geometry);
  const warningsInput = Array.isArray(record.warnings) ? record.warnings : [];
  return {
    segmentId,
    sourceLayer: cleanText(record.sourceLayer ?? record.source_layer) ?? MVUM_OVERLAY_SOURCE_LAYER,
    sourceQuality,
    geometry,
    distanceMeters: finiteNumber(record.distanceMeters ?? record.distance_meters),
    estimatedDurationSeconds: finiteNumber(
      record.estimatedDurationSeconds ?? record.estimated_duration_seconds,
    ),
    warnings: warningsInput
      .map(cleanText)
      .filter((warning): warning is string => !!warning),
  };
}

export function buildMvumCanonicalSegmentsFromViewport(
  viewportSegments: readonly RouteGeometryViewportSegment[],
  selectedSegmentIds: readonly string[],
): MvumCanonicalSegment[] {
  const segmentById = new Map(viewportSegments.map((segment) => [segment.id, segment]));
  return uniqueCleanIds(selectedSegmentIds).map((segmentId): MvumCanonicalSegment => {
    const segment = segmentById.get(segmentId);
    const coordinates = (segment?.coordinates ?? [])
      .map((point) => [point.longitude, point.latitude] as [number, number])
      .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));
    const geometry: RouteLineGeometry | null =
      coordinates && coordinates.length >= 2
        ? { type: 'LineString', coordinates }
        : null;
    return {
      segmentId,
      sourceLayer: segment?.sourceLabel || segment?.sourceId || MVUM_OVERLAY_SOURCE_LAYER,
      sourceQuality: geometry ? 'limited_tile_geometry' : 'unavailable',
      geometry,
      distanceMeters: geometry ? lineDistanceMeters(coordinates) : null,
      estimatedDurationSeconds: null,
      warnings: geometry
        ? ['Limited MVUM viewport geometry used because canonical segment geometry was unavailable.']
        : ['Canonical MVUM segment geometry unavailable.'],
    };
  });
}

export type OrderedMvumSegment = {
  segment: MvumCanonicalSegment;
  coordinates: [number, number][];
};

function orientedSegment(
  segment: MvumCanonicalSegment,
  reverse = false,
): OrderedMvumSegment | null {
  const coordinates = lineCoordinatesFromGeometry(segment.geometry);
  if (!coordinates || coordinates.length < 2) return null;
  return {
    segment,
    coordinates: reverse ? reverseLine(coordinates) : coordinates,
  };
}

function scoreOrderedMvumSegments(ordered: readonly OrderedMvumSegment[]): {
  gapCount: number;
  gapDistanceMeters: number;
} {
  let gapCount = 0;
  let gapDistanceMeters = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1].coordinates;
    const next = ordered[index].coordinates;
    const previousEnd = previous[previous.length - 1];
    const nextStart = next[0];
    if (!previousEnd || !nextStart) continue;
    const distance = coordinateDistanceMeters(previousEnd, nextStart);
    if (distance > MVUM_STITCH_GAP_THRESHOLD_METERS) {
      gapCount += 1;
      gapDistanceMeters += distance;
    }
  }
  return { gapCount, gapDistanceMeters };
}

function buildGreedyMvumOrder(
  start: OrderedMvumSegment,
  remaining: readonly MvumCanonicalSegment[],
): OrderedMvumSegment[] {
  const ordered: OrderedMvumSegment[] = [start];
  const remainingById = new Map(remaining.map((segment) => [segment.segmentId, segment]));

  while (remainingById.size > 0) {
    const previousLine = ordered[ordered.length - 1].coordinates;
    const previousEnd = previousLine[previousLine.length - 1];
    if (!previousEnd) break;
    let best: OrderedMvumSegment | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const segment of remainingById.values()) {
      const forward = orientedSegment(segment, false);
      const reversed = orientedSegment(segment, true);
      for (const candidate of [forward, reversed]) {
        if (!candidate) continue;
        const candidateStart = candidate.coordinates[0];
        if (!candidateStart) continue;
        const distance = coordinateDistanceMeters(previousEnd, candidateStart);
        if (distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
    }

    if (!best) break;
    ordered.push(best);
    remainingById.delete(best.segment.segmentId);
  }

  return ordered;
}

export function orderMvumSegmentsForStitching(
  selectedSegmentIds: readonly string[],
  segments: readonly MvumCanonicalSegment[],
): OrderedMvumSegment[] {
  const selectedIds = uniqueCleanIds(selectedSegmentIds);
  const segmentById = new Map(segments.map((segment) => [segment.segmentId, segment]));
  const selectedSegments = selectedIds
    .map((segmentId) => segmentById.get(segmentId) ?? null)
    .filter((segment): segment is MvumCanonicalSegment => !!segment)
    .filter((segment) => !!lineCoordinatesFromGeometry(segment.geometry));
  if (selectedSegments.length === 0) return [];

  const candidates: OrderedMvumSegment[][] = [];
  selectedSegments.forEach((segment, startIndex) => {
    [false, true].forEach((reverse) => {
      const start = orientedSegment(segment, reverse);
      if (!start) return;
      const remaining = selectedSegments.filter((candidate, index) => index !== startIndex);
      candidates.push(buildGreedyMvumOrder(start, remaining));
    });
  });

  return candidates.sort((a, b) => {
    const aScore = scoreOrderedMvumSegments(a);
    const bScore = scoreOrderedMvumSegments(b);
    if (aScore.gapCount !== bScore.gapCount) return aScore.gapCount - bScore.gapCount;
    if (Math.abs(aScore.gapDistanceMeters - bScore.gapDistanceMeters) > 0.1) {
      return aScore.gapDistanceMeters - bScore.gapDistanceMeters;
    }
    const aFirst = selectedIds.indexOf(a[0]?.segment.segmentId ?? '');
    const bFirst = selectedIds.indexOf(b[0]?.segment.segmentId ?? '');
    return aFirst - bFirst;
  })[0] ?? [];
}

export function detectMvumSegmentGaps(
  orderedSegments: readonly OrderedMvumSegment[],
  thresholdMeters = MVUM_STITCH_GAP_THRESHOLD_METERS,
): StitchedRouteGap[] {
  const gaps: StitchedRouteGap[] = [];
  for (let index = 1; index < orderedSegments.length; index += 1) {
    const previous = orderedSegments[index - 1];
    const next = orderedSegments[index];
    const distance = coordinateDistanceMeters(
      previous.coordinates[previous.coordinates.length - 1],
      next.coordinates[0],
    );
    if (distance > thresholdMeters) {
      gaps.push({
        fromSegmentId: previous.segment.segmentId,
        toSegmentId: next.segment.segmentId,
        reason: 'gap_detected',
      });
    }
  }
  return gaps;
}

export function buildMvumStitchedRouteDraft(args: {
  selectedSegmentIds: readonly string[];
  segments: readonly MvumCanonicalSegment[];
  now?: string;
}): StitchedRouteDraft {
  const selectedSegmentIds = uniqueCleanIds(args.selectedSegmentIds);
  const now = cleanText(args.now) ?? new Date().toISOString();
  const segmentById = new Map(args.segments.map((segment) => [segment.segmentId, segment]));
  const orderedSegments = orderMvumSegmentsForStitching(selectedSegmentIds, args.segments);
  const unresolvedGaps = detectMvumSegmentGaps(orderedSegments);
  const missingGeometryGaps = selectedSegmentIds
    .filter((segmentId) => {
      const segment = segmentById.get(segmentId);
      return !segment || !lineCoordinatesFromGeometry(segment.geometry);
    })
    .map((segmentId): StitchedRouteGap => ({
      fromSegmentId: segmentId,
      toSegmentId: null,
      reason: 'canonical_geometry_unavailable',
    }));
  const allGaps = [...unresolvedGaps, ...missingGeometryGaps];
  const orderedLines = orderedSegments.map((segment) => segment.coordinates);
  const geometry: RouteLineGeometry | null =
    orderedLines.length === 0
      ? null
      : unresolvedGaps.length === 0
        ? { type: 'LineString', coordinates: mergeLinesWithoutDuplicateEndpoints(orderedLines) }
        : { type: 'MultiLineString', coordinates: orderedLines };
  const distanceMeters = orderedSegments.reduce((total, ordered) => {
    const declared = ordered.segment.distanceMeters;
    return total + (declared != null && declared >= 0 ? declared : lineDistanceMeters(ordered.coordinates));
  }, 0);
  const durationSegments = orderedSegments
    .map((ordered) => ordered.segment.estimatedDurationSeconds)
    .filter((duration): duration is number => duration != null && duration >= 0);
  const segmentWarnings = args.segments.flatMap((segment) => segment.warnings);
  const usedSegments = orderedSegments.map((ordered) => ordered.segment);
  const hasCanonicalGeometry = usedSegments.some(
    (segment) => segment.sourceQuality === 'canonical',
  );
  const hasLimitedGeometry = usedSegments.some(
    (segment) => segment.sourceQuality === 'limited_tile_geometry',
  );
  const hasUnavailableGeometrySource = usedSegments.some(
    (segment) => segment.sourceQuality === 'unavailable',
  );
  const geometrySourceState: StitchedRouteGeometrySourceState =
    geometry == null || missingGeometryGaps.length > 0
      ? 'unavailable'
      : hasUnavailableGeometrySource
        ? hasCanonicalGeometry || hasLimitedGeometry
          ? 'mixed'
          : 'unavailable'
      : hasCanonicalGeometry && hasLimitedGeometry
        ? 'mixed'
        : hasLimitedGeometry
          ? 'limited_tile_geometry'
          : 'canonical';
  const warnings = Array.from(new Set([
    ...segmentWarnings,
    orderedSegments.some((ordered) => ordered.segment.sourceQuality === 'limited_tile_geometry')
      ? 'Some MVUM geometry is limited/simplified; verify before navigation.'
      : null,
    orderedSegments.some((ordered) => ordered.segment.sourceQuality === 'unavailable') || missingGeometryGaps.length > 0
      ? 'Canonical MVUM segment geometry is unavailable for one or more selected segments.'
      : null,
    unresolvedGaps.length > 0
      ? 'Gaps detected between selected MVUM segments; verify connectors before navigation.'
      : null,
    geometry == null
      ? 'No valid MVUM geometry is available for the selected segments.'
      : null,
  ].filter((warning): warning is string => !!cleanText(warning))));

  return {
    draftId: `mvum-stitched:${selectedSegmentIds.join('|')}:${now}`,
    selectedSegmentIds,
    orderedSegmentIds: orderedSegments.map((ordered) => ordered.segment.segmentId),
    geometry,
    distanceMeters: orderedSegments.length > 0 ? Math.round(distanceMeters) : null,
    estimatedDurationSeconds:
      durationSegments.length > 0
        ? Math.round(durationSegments.reduce((total, duration) => total + duration, 0))
        : null,
    warnings,
    unresolvedGaps: allGaps,
    geometrySourceState,
    createdAt: now,
    updatedAt: now,
  };
}

function hashMvumPersistenceValue(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildMvumStitchedRoutePersistenceKey(
  draft: StitchedRouteDraft | null | undefined,
): string | null {
  const geometry = normalizeRouteLineGeometry(draft?.geometry);
  if (
    !draft ||
    !geometry ||
    draft.unresolvedGaps.length > 0 ||
    draft.geometrySourceState !== 'canonical'
  ) {
    return null;
  }
  const identity = JSON.stringify({
    selectedSegmentIds: draft.selectedSegmentIds,
    orderedSegmentIds: draft.orderedSegmentIds,
    geometry,
    geometrySourceState: draft.geometrySourceState ?? null,
  });
  return `mvum-stitch:${hashMvumPersistenceValue(identity)}`;
}

export function buildMvumGuidanceEntryPlan(args: {
  draft: StitchedRouteDraft | null | undefined;
  origin: GuidanceRouteCoordinate | null | undefined;
  accuracyM?: number | null;
}): NavigateMvumGuidanceEntryPlan {
  const snapToleranceM = resolveGuidanceSnapToleranceMeters({
    context: 'trail',
    accuracyM: args.accuracyM,
  });
  const emptyPlan = (
    status: NavigateMvumGuidanceEntryPlan['status'],
    reason: string,
  ): NavigateMvumGuidanceEntryPlan => ({
    status,
    entryCoordinate: null,
    trailGeometry: [],
    distanceToEntryM: null,
    snapToleranceM,
    skippedRouteDistanceM: 0,
    remainingRouteDistanceM: 0,
    reason,
  });

  if (!args.draft?.geometry || args.draft.unresolvedGaps.length > 0) {
    return emptyPlan(
      'invalid_geometry',
      'Connected canonical MVUM geometry is required before guidance can start.',
    );
  }
  if (args.draft.geometrySourceState !== 'canonical') {
    return emptyPlan(
      'preview_only',
      'Active guidance requires canonical MVUM segment geometry. Limited viewport geometry remains available for save and preview only.',
    );
  }

  const normalized = normalizeNavigationGuidanceGeometry(args.draft.geometry, {
    allowLoop: false,
  });
  if (normalized.status !== 'ready' || normalized.points.length < 2) {
    return emptyPlan(
      normalized.status === 'preview_only' ? 'preview_only' : 'invalid_geometry',
      normalized.unavailableReason ?? 'MVUM route geometry is unavailable for active guidance.',
    );
  }
  if (
    !args.origin ||
    !Number.isFinite(args.origin.lat) ||
    !Number.isFinite(args.origin.lng) ||
    Math.abs(args.origin.lat) > 90 ||
    Math.abs(args.origin.lng) > 180
  ) {
    return emptyPlan(
      'location_unavailable',
      'A current GPS fix is required to route to the nearest point on this MVUM route.',
    );
  }

  const routeIndex = buildGuidanceRouteDistanceIndex(normalized.points);
  const projection = findNearestPlausibleRouteProjection({
    position: args.origin,
    routeIndex,
    accuracyM: args.accuracyM,
  });
  if (!projection) {
    return emptyPlan(
      'invalid_geometry',
      'ECS could not project the current GPS position onto the canonical MVUM route.',
    );
  }

  const split = splitGuidanceRouteAtProjection(routeIndex.geometry, projection);
  const usesForwardRemainder = split.remaining.length >= 2;
  const trailGeometry = usesForwardRemainder
    ? split.remaining
    : split.completed.slice().reverse();
  if (trailGeometry.length < 2) {
    return emptyPlan(
      'invalid_geometry',
      'The selected MVUM route does not contain enough remaining geometry for guidance.',
    );
  }

  const needsApproach = projection.distanceFromPositionM > snapToleranceM;
  return {
    status: needsApproach ? 'ready_with_approach' : 'ready_on_route',
    entryCoordinate: projection.coordinate,
    trailGeometry,
    distanceToEntryM: projection.distanceFromPositionM,
    snapToleranceM,
    skippedRouteDistanceM: projection.distanceFromRouteStartM,
    remainingRouteDistanceM: usesForwardRemainder
      ? Math.max(0, routeIndex.totalDistanceM - projection.distanceFromRouteStartM)
      : projection.distanceFromRouteStartM,
    reason: null,
  };
}

export function buildNavigateMvumFeatureCollection(
  segments: readonly RouteGeometryViewportSegment[],
): MvumLineFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: segments
      .map((segment): MvumLineFeature | null => {
        const coordinates = segment.coordinates
          .map((point) => [point.longitude, point.latitude] as [number, number])
          .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));
        if (coordinates.length < 2) return null;
        return {
          type: 'Feature',
          id: segment.id,
          properties: {
            segmentId: segment.id,
            name: segment.name,
            sourceLayer: segment.sourceLabel || segment.sourceId || MVUM_OVERLAY_SOURCE_LAYER,
            sourceKind: 'mvum',
          },
          geometry: {
            type: 'LineString',
            coordinates,
          },
        };
      })
      .filter((feature): feature is MvumLineFeature => !!feature),
  };
}

export function buildNavigateMvumMapOverlay(
  input: BuildNavigateMvumMapOverlayInput,
): NavigateMvumMapOverlayPayload {
  const vectorTileUrl = cleanText(input.vectorTileUrl);
  return {
    enabled: input.enabled,
    requestFingerprint: cleanText(input.requestFingerprint),
    requestGeneration: Math.max(0, Math.trunc(input.requestGeneration ?? 0)),
    invalidFeatureCount: Math.max(0, Math.trunc(input.invalidFeatureCount ?? 0)),
    minZoom: MVUM_OVERLAY_MIN_ZOOM,
    sourceId: MVUM_OVERLAY_SOURCE_ID,
    sourceType: vectorTileUrl ? 'vector' : 'geojson',
    vectorTileUrl,
    vectorSourceLayer: cleanText(input.vectorSourceLayer) ?? MVUM_OVERLAY_SOURCE_LAYER,
    featureCollection: vectorTileUrl
      ? null
      : buildNavigateMvumFeatureCollection(input.enabled ? input.viewportSegments ?? [] : []),
    selectedSourceId: MVUM_OVERLAY_SELECTED_SOURCE_ID,
    selectedSegmentIds: Array.from(new Set(input.selectedSegmentIds.map(String).filter(Boolean))),
  };
}

export function buildNavigateMvumStitchedRoutePreview(
  draft: StitchedRouteDraft | null | undefined,
): NavigateMvumStitchedRoutePreviewPayload | null {
  const geometry = normalizeRouteLineGeometry(draft?.geometry);
  if (!draft || !geometry) return null;
  const featureCollection: MvumRouteFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: draft.draftId,
        properties: {
          draftId: draft.draftId,
          sourceKind: 'mvum_stitched_route',
          selectedSegmentIds: draft.selectedSegmentIds,
          orderedSegmentIds: draft.orderedSegmentIds,
          unresolvedGapCount: draft.unresolvedGaps.length,
          warnings: draft.warnings,
        },
        geometry: geometry as MvumLineStringGeometry | MvumMultiLineStringGeometry,
      },
    ],
  };
  return {
    sourceId: NAVIGATE_STITCHED_ROUTE_SOURCE_ID,
    layerId: NAVIGATE_STITCHED_ROUTE_LAYER_ID,
    haloLayerId: NAVIGATE_STITCHED_ROUTE_HALO_LAYER_ID,
    draftId: draft.draftId,
    featureCollection,
    unresolvedGapCount: draft.unresolvedGaps.length,
    warnings: draft.warnings,
  };
}

export function resolveNavigateMvumVectorTileUrl(): string | null {
  const value = typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_ECS_MVUM_VECTOR_TILE_URL
    : undefined;
  return cleanText(value);
}

export function resolveNavigateMvumVectorSourceLayer(): string {
  const value = typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_ECS_MVUM_VECTOR_SOURCE_LAYER
    : undefined;
  return cleanText(value) ?? MVUM_OVERLAY_SOURCE_LAYER;
}

export type NavigateMvumViewportResult = RouteGeometryViewportResult;

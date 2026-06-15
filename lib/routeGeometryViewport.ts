import type { RouteSegmentSourceMetadata } from './map/dispersedCampingSegmentBuild';
import type {
  RouteGeometryOverlayConfidence,
  RouteGeometryOverlayDataState,
  RouteGeometryOverlaySegment,
  RouteGeometryOverlaySourceKind,
} from './navigateRouteGeometryOverlay';
import {
  ROUTE_GEOMETRY_OVERLAY_COLOR,
  ROUTE_GEOMETRY_OVERLAY_PLANNING_WARNING,
} from './navigateRouteGeometryOverlay';

export const ROUTE_GEOMETRY_VIEWPORT_MIN_ZOOM = 10;
export const ROUTE_GEOMETRY_VIEWPORT_MAX_LIMIT = 500;
export const ROUTE_GEOMETRY_VIEWPORT_DEFAULT_LIMIT = 500;
export const ROUTE_GEOMETRY_VIEWPORT_WARNING =
  'ECS catalog route geometry is planning/reference geometry. Verify access, closures, and posted rules before travel.';
export const ROUTE_GEOMETRY_VIEWPORT_PLANNING_SOURCE = 'route_geometry_viewport';

export type RouteGeometryViewportBbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type RouteGeometryViewportCoordinate = {
  latitude: number;
  longitude: number;
};

export type RouteGeometryViewportSegment = {
  id: string;
  name: string;
  sourceKind: Extract<RouteGeometryOverlaySourceKind, 'route_catalog'>;
  sourceId: string;
  sourceLabel: string;
  dataState: RouteGeometryOverlayDataState;
  confidence: RouteGeometryOverlayConfidence;
  legalityStatus: 'legal_verified' | 'limited_verified' | 'geometry_only' | 'community_unverified';
  publicAccessStatus: 'open' | 'limited' | 'unknown';
  warnings: string[];
  attribution?: string | null;
  license?: string | null;
  lastVerifiedAt?: string | null;
  coordinates: RouteGeometryViewportCoordinate[];
};

export type RouteGeometryViewportResult = {
  segments: RouteGeometryViewportSegment[];
  candidateCount: number;
  cappedCount: number;
  skippedMissingGeometryCount: number;
  skippedClosedCount: number;
  bboxFilterApplied: boolean;
  cacheKey?: string | null;
  fetchedAt?: string | null;
};

export type RouteGeometryViewportFetchPlan =
  | {
      type: 'schedule';
      bbox: RouteGeometryViewportBbox;
      cacheKey: string;
      dueAt: number;
    }
  | {
      type: 'skip';
      reason:
        | 'overlay_disabled'
        | 'feature_disabled'
        | 'zoom_too_low'
        | 'offline'
        | 'missing_bbox'
        | 'invalid_bbox'
        | 'bbox_too_small'
        | 'duplicate_pending'
        | 'duplicate_in_flight';
      cacheKey?: string;
    };

export type RouteGeometryViewportFetchStart = {
  bbox: RouteGeometryViewportBbox;
  cacheKey: string;
  requestId: number;
};

type RawViewportSegment = Record<string, unknown>;
type NormalizedPoint = { latitude: number; longitude: number };

const DEFAULT_BUCKET_DEGREES = 0.01;
const MIN_BBOX_SPAN_DEGREES = 0.001;
const DEFAULT_DEBOUNCE_MS = 450;
const EARTH_RADIUS_MILES = 3958.7613;

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value: unknown, fallback = ''): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text || fallback;
}

function bucketDown(value: number, bucketDegrees: number): number {
  return Math.floor(value / bucketDegrees) * bucketDegrees;
}

function bucketUp(value: number, bucketDegrees: number): number {
  return Math.ceil(value / bucketDegrees) * bucketDegrees;
}

function roundBucket(value: number): number {
  return Number(value.toFixed(6));
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizePoint(value: unknown): NormalizedPoint | null {
  const record = readRecord(value);
  const longitude = Array.isArray(value)
    ? finiteNumber(value[0])
    : finiteNumber(record?.longitude ?? record?.lng ?? record?.lon);
  const latitude = Array.isArray(value)
    ? finiteNumber(value[1])
    : finiteNumber(record?.latitude ?? record?.lat);
  if (latitude == null || longitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function normalizeLine(value: unknown): RouteGeometryViewportCoordinate[] {
  return readArray(value)
    .map(normalizePoint)
    .filter((point): point is NormalizedPoint => !!point)
    .filter((point, index, points) => {
      const previous = points[index - 1];
      return !previous || previous.latitude !== point.latitude || previous.longitude !== point.longitude;
    });
}

function normalizeGeometryLine(raw: RawViewportSegment): RouteGeometryViewportCoordinate[] {
  const geometry = readRecord(raw.geometry ?? raw.route_geometry);
  if (!geometry) {
    return normalizeLine(raw.coordinates);
  }
  if (geometry.type === 'LineString') {
    return normalizeLine(geometry.coordinates);
  }
  if (geometry.type === 'MultiLineString') {
    return readArray(geometry.coordinates)
      .map(normalizeLine)
      .find((line) => line.length > 1) ?? [];
  }
  return [];
}

function normalizeWarnings(input: unknown): string[] {
  const warnings = readArray(input)
    .map((value) => cleanText(value))
    .filter(Boolean);
  return Array.from(new Set([ROUTE_GEOMETRY_VIEWPORT_WARNING, ROUTE_GEOMETRY_OVERLAY_PLANNING_WARNING, ...warnings]));
}

function normalizeDataState(value: unknown): RouteGeometryOverlayDataState {
  const text = cleanText(value).toLowerCase();
  if (text === 'live') return 'live';
  if (text === 'local' || text === 'local_review') return 'local';
  if (text === 'cached') return 'cached';
  if (text === 'stale' || text === 'aging') return 'stale';
  if (text === 'fixture' || text === 'mock' || text === 'mocked') return 'fixture';
  if (text === 'manual') return 'manual';
  if (text === 'estimated') return 'estimated';
  return 'unknown';
}

function normalizeConfidence(value: unknown): RouteGeometryOverlayConfidence {
  const text = cleanText(value).toLowerCase();
  if (text === 'high' || text === 'medium' || text === 'low' || text === 'unknown') return text;
  const score = finiteNumber(value);
  if (score == null) return 'unknown';
  if (score >= 85) return 'high';
  if (score >= 65) return 'medium';
  if (score >= 1) return 'low';
  return 'unknown';
}

function normalizeLegalityStatus(value: unknown): RouteGeometryViewportSegment['legalityStatus'] | 'closed_or_prohibited' {
  const text = cleanText(value).toLowerCase();
  if (text === 'legal_verified') return 'legal_verified';
  if (text === 'limited_verified') return 'limited_verified';
  if (text === 'community_unverified') return 'community_unverified';
  if (text === 'closed_or_prohibited') return 'closed_or_prohibited';
  return 'geometry_only';
}

function normalizePublicAccessStatus(value: unknown): RouteGeometryViewportSegment['publicAccessStatus'] | 'closed' {
  const text = cleanText(value).toLowerCase();
  if (text === 'open') return 'open';
  if (text === 'limited') return 'limited';
  if (text === 'closed') return 'closed';
  return 'unknown';
}

function isClosedOrProhibited(raw: RawViewportSegment): boolean {
  return (
    normalizeLegalityStatus(raw.legalityStatus ?? raw.legality_status) === 'closed_or_prohibited' ||
    normalizePublicAccessStatus(raw.publicAccessStatus ?? raw.public_access_status) === 'closed'
  );
}

function sourceColor(_segment: Pick<RouteGeometryViewportSegment, 'dataState' | 'legalityStatus'>): string {
  return ROUTE_GEOMETRY_OVERLAY_COLOR;
}

function overlayIdForSegment(segment: Pick<RouteGeometryViewportSegment, 'sourceKind' | 'id'>): string {
  return `route-geometry:${segment.sourceKind}:${segment.id}`;
}

function segmentSourceMetadata(segment: RouteGeometryViewportSegment): RouteSegmentSourceMetadata {
  return {
    kind: 'ecs_route_geometry',
    sourceLabel: segment.sourceLabel,
    confidence: 'planning_geometry',
    routeGeometrySourceKind: segment.sourceKind,
    dataState: segment.dataState,
    warnings: normalizeWarnings(segment.warnings),
  };
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMiles(a: RouteGeometryViewportCoordinate, b: RouteGeometryViewportCoordinate): number {
  const latitude1 = degreesToRadians(a.latitude);
  const latitude2 = degreesToRadians(b.latitude);
  const deltaLatitude = degreesToRadians(b.latitude - a.latitude);
  const deltaLongitude = degreesToRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function normalizeRouteGeometryViewportBbox(
  bbox: RouteGeometryViewportBbox | null | undefined,
  bucketDegrees = DEFAULT_BUCKET_DEGREES,
): RouteGeometryViewportBbox | null {
  if (!bbox) return null;
  const { minLng, minLat, maxLng, maxLat } = bbox;
  if ([minLng, minLat, maxLng, maxLat].some((value) => finiteNumber(value) == null)) return null;

  const west = Math.max(-180, Math.min(minLng, maxLng));
  const east = Math.min(180, Math.max(minLng, maxLng));
  const south = Math.max(-90, Math.min(minLat, maxLat));
  const north = Math.min(90, Math.max(minLat, maxLat));
  if (east <= west || north <= south) return null;
  if (east - west < MIN_BBOX_SPAN_DEGREES || north - south < MIN_BBOX_SPAN_DEGREES) return null;

  const normalized = {
    minLng: Math.max(-180, bucketDown(west, bucketDegrees)),
    minLat: Math.max(-90, bucketDown(south, bucketDegrees)),
    maxLng: Math.min(180, bucketUp(east, bucketDegrees)),
    maxLat: Math.min(90, bucketUp(north, bucketDegrees)),
  };
  if (normalized.maxLng <= normalized.minLng || normalized.maxLat <= normalized.minLat) return null;

  return {
    minLng: roundBucket(normalized.minLng),
    minLat: roundBucket(normalized.minLat),
    maxLng: roundBucket(normalized.maxLng),
    maxLat: roundBucket(normalized.maxLat),
  };
}

export function isRouteGeometryViewportZoomEligible(zoom: unknown): boolean {
  return typeof zoom === 'number' && Number.isFinite(zoom) && zoom >= ROUTE_GEOMETRY_VIEWPORT_MIN_ZOOM;
}

export function buildRouteGeometryViewportCacheKey(
  bbox: RouteGeometryViewportBbox,
  zoom: number,
  options: { includeReferenceGeometry?: boolean; vehicleClass?: string | null } = {},
): string {
  const zoomBucket = Math.max(ROUTE_GEOMETRY_VIEWPORT_MIN_ZOOM, Math.floor(zoom));
  const referencePart = options.includeReferenceGeometry === false ? 'verified' : 'ref';
  const vehicleClass = cleanText(options.vehicleClass).replace(/[^a-z0-9_]+/gi, '_') || 'all_vehicle';
  return [
    'route_geometry_segments',
    `z${zoomBucket}`,
    referencePart,
    vehicleClass,
    bbox.minLng.toFixed(2),
    bbox.minLat.toFixed(2),
    bbox.maxLng.toFixed(2),
    bbox.maxLat.toFixed(2),
  ].join(':');
}

export function normalizeRouteGeometryViewportResponse(value: unknown): RouteGeometryViewportResult {
  const record = readRecord(value);
  const rawSegments = readArray(record?.segments);
  const meta = readRecord(record?.meta);
  const segments: RouteGeometryViewportSegment[] = [];
  let skippedMissingGeometryCount = finiteNumber(meta?.skippedMissingGeometryCount ?? meta?.skipped_missing_geometry_count) ?? 0;
  let skippedClosedCount = finiteNumber(meta?.skippedClosedCount ?? meta?.skipped_closed_count) ?? 0;

  for (const rawValue of rawSegments) {
    const raw = readRecord(rawValue);
    if (!raw) continue;
    if (isClosedOrProhibited(raw)) {
      skippedClosedCount += 1;
      continue;
    }
    const coordinates = normalizeGeometryLine(raw);
    if (coordinates.length < 2) {
      skippedMissingGeometryCount += 1;
      continue;
    }
    const id = cleanText(raw.id ?? raw.segmentId ?? raw.segment_id, `viewport-${segments.length}`);
    const sourceLabel = cleanText(raw.sourceLabel ?? raw.source_label, 'ECS Route Catalog');
    const legalityStatus = normalizeLegalityStatus(raw.legalityStatus ?? raw.legality_status);
    const publicAccessStatus = normalizePublicAccessStatus(raw.publicAccessStatus ?? raw.public_access_status);
    if (legalityStatus === 'closed_or_prohibited' || publicAccessStatus === 'closed') {
      skippedClosedCount += 1;
      continue;
    }
    segments.push({
      id,
      name: cleanText(raw.name ?? raw.canonicalName ?? raw.canonical_name, 'ECS Route Geometry'),
      sourceKind: 'route_catalog',
      sourceId: cleanText(raw.sourceId ?? raw.source_id, id),
      sourceLabel,
      dataState: normalizeDataState(raw.dataState ?? raw.data_state),
      confidence: normalizeConfidence(raw.confidence ?? raw.confidenceScore ?? raw.confidence_score),
      legalityStatus,
      publicAccessStatus,
      warnings: normalizeWarnings(raw.warnings ?? raw.warningReasons ?? raw.warning_reasons),
      attribution: cleanText(raw.attribution) || null,
      license: cleanText(raw.license) || null,
      lastVerifiedAt: cleanText(raw.lastVerifiedAt ?? raw.last_verified_at) || null,
      coordinates,
    });
  }

  return {
    segments,
    candidateCount: finiteNumber(meta?.candidateCount ?? meta?.candidate_count) ?? rawSegments.length,
    cappedCount: finiteNumber(meta?.cappedCount ?? meta?.capped_count) ?? 0,
    skippedMissingGeometryCount,
    skippedClosedCount,
    bboxFilterApplied: Boolean(meta?.bboxFilterApplied ?? meta?.bbox_filter_applied ?? true),
    cacheKey: cleanText(meta?.cacheKey ?? meta?.cache_key) || null,
    fetchedAt: cleanText(meta?.fetchedAt ?? meta?.fetched_at) || null,
  };
}

export function routeGeometryViewportSegmentToOverlaySegment(
  segment: RouteGeometryViewportSegment,
  selectedSegmentIds: Set<string> = new Set(),
): RouteGeometryOverlaySegment {
  const id = overlayIdForSegment(segment);
  const warnings = normalizeWarnings(segment.warnings);
  return {
    id,
    name: segment.name,
    kind: 'route_geometry_segment',
    coordinates: segment.coordinates,
    color: sourceColor(segment),
    sourceKind: segment.sourceKind,
    sourceId: segment.sourceId,
    sourceLabel: segment.sourceLabel,
    dataState: segment.dataState,
    confidence: segment.confidence,
    warnings,
    routeGeometrySelected: selectedSegmentIds.has(id) || selectedSegmentIds.has(segment.id),
    routeGeometrySourceKind: segment.sourceKind,
    routeGeometryDataState: segment.dataState,
    routeGeometryConfidence: segment.confidence,
    routeGeometryWarningsJson: JSON.stringify(warnings),
    sourceMetadata: segmentSourceMetadata(segment),
  };
}

export function routeGeometryViewportSegmentsToOverlaySegments(
  segments: RouteGeometryViewportSegment[],
  selectedSegmentIds: string[] = [],
): RouteGeometryOverlaySegment[] {
  const selected = new Set(selectedSegmentIds.map(String));
  return segments.map((segment) => routeGeometryViewportSegmentToOverlaySegment(segment, selected));
}

export function mergeRouteGeometryViewportSegmentsWithSelected(
  visibleSegments: RouteGeometryOverlaySegment[],
  selectedSegments: RouteGeometryOverlaySegment[],
): RouteGeometryOverlaySegment[] {
  const byId = new Map<string, RouteGeometryOverlaySegment>();
  visibleSegments.forEach((segment) => byId.set(segment.id, segment));
  selectedSegments.forEach((segment) => {
    if (!byId.has(segment.id)) byId.set(segment.id, segment);
  });
  return Array.from(byId.values());
}

export function resolveNearestRouteGeometryEndpoint(
  segments: RouteGeometryOverlaySegment[],
  userLocation: RouteGeometryViewportCoordinate | null | undefined,
): { latitude: number; longitude: number; segmentId: string; distanceMiles: number } | null {
  if (!userLocation) return null;
  let nearest: { latitude: number; longitude: number; segmentId: string; distanceMiles: number } | null = null;
  for (const segment of segments) {
    if (!Array.isArray(segment.coordinates) || segment.coordinates.length < 2) continue;
    const endpoints = [segment.coordinates[0], segment.coordinates[segment.coordinates.length - 1]];
    for (const endpoint of endpoints) {
      const distance = distanceMiles(userLocation, endpoint);
      if (!nearest || distance < nearest.distanceMiles) {
        nearest = {
          latitude: endpoint.latitude,
          longitude: endpoint.longitude,
          segmentId: segment.id,
          distanceMiles: Number(distance.toFixed(2)),
        };
      }
    }
  }
  return nearest;
}

export class RouteGeometryViewportFetchCoordinator {
  private debounceMs: number;
  private pending: { bbox: RouteGeometryViewportBbox; cacheKey: string; dueAt: number } | null = null;
  private inFlight: { cacheKey: string; requestId: number } | null = null;
  private sequence = 0;

  constructor(options: { debounceMs?: number } = {}) {
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  plan(args: {
    bbox: RouteGeometryViewportBbox | null | undefined;
    zoom: number;
    enabled: boolean;
    featureEnabled: boolean;
    online: boolean;
    now: number;
    includeReferenceGeometry?: boolean;
    vehicleClass?: string | null;
  }): RouteGeometryViewportFetchPlan {
    if (!args.enabled) {
      this.cancel();
      return { type: 'skip', reason: 'overlay_disabled' };
    }
    if (!args.featureEnabled) {
      this.cancel();
      return { type: 'skip', reason: 'feature_disabled' };
    }
    if (!isRouteGeometryViewportZoomEligible(args.zoom)) {
      this.cancel();
      return { type: 'skip', reason: 'zoom_too_low' };
    }
    if (!args.online) {
      this.cancel();
      return { type: 'skip', reason: 'offline' };
    }
    if (!args.bbox) return { type: 'skip', reason: 'missing_bbox' };

    const normalized = normalizeRouteGeometryViewportBbox(args.bbox);
    if (!normalized) {
      const invalidReason =
        [args.bbox.minLng, args.bbox.minLat, args.bbox.maxLng, args.bbox.maxLat].every((value) => finiteNumber(value) != null)
          ? 'bbox_too_small'
          : 'invalid_bbox';
      return { type: 'skip', reason: invalidReason };
    }

    const cacheKey = buildRouteGeometryViewportCacheKey(normalized, args.zoom, {
      includeReferenceGeometry: args.includeReferenceGeometry,
      vehicleClass: args.vehicleClass,
    });
    if (this.pending?.cacheKey === cacheKey) return { type: 'skip', reason: 'duplicate_pending', cacheKey };
    if (this.inFlight?.cacheKey === cacheKey) return { type: 'skip', reason: 'duplicate_in_flight', cacheKey };
    if (this.inFlight) {
      this.inFlight = null;
      this.sequence += 1;
    }

    this.pending = {
      bbox: normalized,
      cacheKey,
      dueAt: args.now + this.debounceMs,
    };
    return {
      type: 'schedule',
      bbox: normalized,
      cacheKey,
      dueAt: this.pending.dueAt,
    };
  }

  consumeDue(now: number): RouteGeometryViewportFetchStart | null {
    if (!this.pending || this.pending.dueAt > now) return null;
    const next = this.pending;
    this.pending = null;
    this.sequence += 1;
    this.inFlight = {
      cacheKey: next.cacheKey,
      requestId: this.sequence,
    };
    return {
      bbox: next.bbox,
      cacheKey: next.cacheKey,
      requestId: this.sequence,
    };
  }

  isCurrent(request: Pick<RouteGeometryViewportFetchStart, 'cacheKey' | 'requestId'>): boolean {
    return this.inFlight?.cacheKey === request.cacheKey && this.inFlight.requestId === request.requestId;
  }

  complete(request: Pick<RouteGeometryViewportFetchStart, 'cacheKey' | 'requestId'>): boolean {
    if (!this.isCurrent(request)) return false;
    this.inFlight = null;
    return true;
  }

  cancel(): void {
    this.pending = null;
    this.inFlight = null;
    this.sequence += 1;
  }
}

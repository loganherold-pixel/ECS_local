import {
  normalizeRouteCatalogRecord,
  verifyRouteCatalogRecord,
  type RouteCatalogRecord,
} from './explore/routeCatalog';
import { ROUTE_CATALOG_COVERAGE_AREAS } from './explore/routeCatalogSearchArea';
import {
  ROUTE_GEOMETRY_OVERLAY_COLOR,
  ROUTE_GEOMETRY_OVERLAY_PLANNING_WARNING,
  type RouteGeometryOverlayConfidence,
  type RouteGeometryOverlayDataState,
  type RouteGeometryOverlaySegment,
  type RouteGeometryOverlaySourceKind,
} from './navigateRouteGeometryOverlay';
import type { RouteSegmentSourceMetadata } from './map/dispersedCampingSegmentBuild';

export const ROUTE_CATALOG_VIEWPORT_DEFAULT_LIMIT = 500;
const ROUTE_CATALOG_VIEWPORT_MAX_LIMIT = 1000;
const ROUTE_CATALOG_VIEWPORT_MIN_RADIUS_MILES = 15;
const ROUTE_CATALOG_VIEWPORT_RADIUS_PADDING_MILES = 10;

export type RouteCatalogViewportBbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type RouteCatalogViewportCoordinate = {
  latitude: number;
  longitude: number;
};

export type RouteCatalogGeometryStatus =
  | 'guidance_ready'
  | 'preview_geometry'
  | 'trailhead_only'
  | 'insufficient_geometry';

export type RouteCatalogViewportQuery = {
  bbox: RouteCatalogViewportBbox;
  zoom: number;
  limit: number;
  center: RouteCatalogViewportCoordinate;
  radiusMiles: number;
  regionTags: string[];
  cacheKey: string;
};

export type RouteCatalogViewportFeatureProperties = {
  routeId: string;
  title: string;
  name: string;
  forest: string | null;
  region: string | null;
  distanceMiles: number | null;
  tripType: string | null;
  geometryStatus: RouteCatalogGeometryStatus;
  guidanceReady: boolean;
  source: 'route_catalog';
  sourceLabel: string;
  routeGeometryMode: string | null;
  segmentIds: string[];
  confidence: RouteGeometryOverlayConfidence;
  dataState: RouteGeometryOverlayDataState;
  warnings: string[];
  featureKind: 'route_line' | 'trailhead_marker';
};

export type RouteCatalogViewportLineGeometry = {
  type: 'LineString' | 'MultiLineString';
  coordinates: number[][] | number[][][];
};

export type RouteCatalogViewportPointGeometry = {
  type: 'Point';
  coordinates: [number, number];
};

export type RouteCatalogViewportFeature = {
  type: 'Feature';
  id: string;
  geometry: RouteCatalogViewportLineGeometry | RouteCatalogViewportPointGeometry;
  properties: RouteCatalogViewportFeatureProperties;
};

export type RouteCatalogViewportFeatureCollection = {
  type: 'FeatureCollection';
  features: RouteCatalogViewportFeature[];
};

export type RouteCatalogViewportResult = {
  featureCollection: RouteCatalogViewportFeatureCollection;
  candidateCount: number;
  returnedCount: number;
  lineFeatureCount: number;
  markerFeatureCount: number;
  guidanceReadyCount: number;
  trailheadOnlyCount: number;
  insufficientGeometryCount: number;
  skippedOutsideViewportCount: number;
  bboxFilterApplied: boolean;
  source: 'route_catalog';
};

type BuildRouteCatalogViewportQueryInput = {
  bbox: RouteCatalogViewportBbox;
  zoom: number;
  limit?: number | null;
  radiusMiles?: number | null;
  regionTags?: string[] | null;
};

type NormalizedLine = [number, number][];

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeRegionTags(values: string[] | null | undefined): string[] {
  return Array.from(
    new Set((values ?? []).map(normalizeToken).filter(Boolean)),
  );
}

function normalizeLimit(value: unknown): number {
  const parsed = finiteNumber(value);
  if (parsed == null) return ROUTE_CATALOG_VIEWPORT_DEFAULT_LIMIT;
  return Math.max(1, Math.min(ROUTE_CATALOG_VIEWPORT_MAX_LIMIT, Math.floor(parsed)));
}

function normalizeBbox(value: RouteCatalogViewportBbox): RouteCatalogViewportBbox {
  const minLng = Math.min(value.minLng, value.maxLng);
  const maxLng = Math.max(value.minLng, value.maxLng);
  const minLat = Math.min(value.minLat, value.maxLat);
  const maxLat = Math.max(value.minLat, value.maxLat);
  return {
    minLng: round(minLng, 5),
    minLat: round(minLat, 5),
    maxLng: round(maxLng, 5),
    maxLat: round(maxLat, 5),
  };
}

function bboxCenter(bbox: RouteCatalogViewportBbox): RouteCatalogViewportCoordinate {
  return {
    latitude: round((bbox.minLat + bbox.maxLat) / 2, 6),
    longitude: round((bbox.minLng + bbox.maxLng) / 2, 6),
  };
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMiles(a: RouteCatalogViewportCoordinate, b: RouteCatalogViewportCoordinate): number {
  const earthRadiusMiles = 3958.7613;
  const latitude1 = degreesToRadians(a.latitude);
  const latitude2 = degreesToRadians(b.latitude);
  const deltaLatitude = degreesToRadians(b.latitude - a.latitude);
  const deltaLongitude = degreesToRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function radiusForBbox(bbox: RouteCatalogViewportBbox): number {
  const center = bboxCenter(bbox);
  const corners = [
    { latitude: bbox.minLat, longitude: bbox.minLng },
    { latitude: bbox.minLat, longitude: bbox.maxLng },
    { latitude: bbox.maxLat, longitude: bbox.minLng },
    { latitude: bbox.maxLat, longitude: bbox.maxLng },
  ];
  const farthest = Math.max(...corners.map((corner) => haversineMiles(center, corner)));
  return round(Math.max(ROUTE_CATALOG_VIEWPORT_MIN_RADIUS_MILES, farthest + ROUTE_CATALOG_VIEWPORT_RADIUS_PADDING_MILES), 2);
}

function routeCatalogViewportCacheKey(query: Omit<RouteCatalogViewportQuery, 'cacheKey'>): string {
  const zoomBucket = Math.max(0, Math.floor(query.zoom));
  const tags = query.regionTags.length > 0 ? query.regionTags.join(',') : 'all';
  return [
    'route_catalog_viewport',
    `z${zoomBucket}`,
    query.limit,
    query.bbox.minLng.toFixed(5),
    query.bbox.minLat.toFixed(5),
    query.bbox.maxLng.toFixed(5),
    query.bbox.maxLat.toFixed(5),
    tags,
  ].join(':');
}

export function buildRouteCatalogViewportQuery(
  input: BuildRouteCatalogViewportQueryInput,
): RouteCatalogViewportQuery {
  const bbox = normalizeBbox(input.bbox);
  const center = bboxCenter(bbox);
  const radiusMiles = round(
    Math.max(
      ROUTE_CATALOG_VIEWPORT_MIN_RADIUS_MILES,
      finiteNumber(input.radiusMiles) ?? radiusForBbox(bbox),
    ),
    2,
  );
  const withoutCacheKey = {
    bbox,
    zoom: finiteNumber(input.zoom) ?? 0,
    limit: normalizeLimit(input.limit),
    center,
    radiusMiles,
    regionTags: normalizeRegionTags(input.regionTags),
  };
  return {
    ...withoutCacheKey,
    cacheKey: routeCatalogViewportCacheKey(withoutCacheKey),
  };
}

function normalizeCoordinatePair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = finiteNumber(value[0]);
  const latitude = finiteNumber(value[1]);
  if (longitude == null || latitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return [longitude, latitude];
}

function lineFromCoordinates(value: unknown): NormalizedLine {
  if (!Array.isArray(value)) return [];
  const line: NormalizedLine = [];
  value.forEach((entry) => {
    const coordinate = normalizeCoordinatePair(entry);
    if (!coordinate) return;
    const previous = line[line.length - 1];
    if (previous && previous[0] === coordinate[0] && previous[1] === coordinate[1]) return;
    line.push(coordinate);
  });
  return line;
}

function linesFromGeometry(geometry: RouteCatalogRecord['routeGeometry']): NormalizedLine[] {
  if (!geometry) return [];
  if (geometry.type === 'LineString') {
    const line = lineFromCoordinates(geometry.coordinates);
    return line.length > 1 ? [line] : [];
  }
  if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
    return (geometry.coordinates as unknown[])
      .map(lineFromCoordinates)
      .filter((line) => line.length > 1);
  }
  return [];
}

function lineBounds(line: NormalizedLine): RouteCatalogViewportBbox | null {
  if (line.length === 0) return null;
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  line.forEach(([longitude, latitude]) => {
    minLng = Math.min(minLng, longitude);
    minLat = Math.min(minLat, latitude);
    maxLng = Math.max(maxLng, longitude);
    maxLat = Math.max(maxLat, latitude);
  });
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
  return { minLng, minLat, maxLng, maxLat };
}

function boundsIntersect(left: RouteCatalogViewportBbox, right: RouteCatalogViewportBbox): boolean {
  return !(
    left.maxLng < right.minLng ||
    left.minLng > right.maxLng ||
    left.maxLat < right.minLat ||
    left.minLat > right.maxLat
  );
}

function coordinateInBbox(coordinate: RouteCatalogViewportCoordinate, bbox: RouteCatalogViewportBbox): boolean {
  return (
    coordinate.longitude >= bbox.minLng &&
    coordinate.longitude <= bbox.maxLng &&
    coordinate.latitude >= bbox.minLat &&
    coordinate.latitude <= bbox.maxLat
  );
}

function routeGeometryIntersectsBbox(lines: NormalizedLine[], bbox: RouteCatalogViewportBbox): boolean {
  return lines.some((line) => {
    const bounds = lineBounds(line);
    if (!bounds || !boundsIntersect(bounds, bbox)) return false;
    return line.some(([longitude, latitude]) =>
      coordinateInBbox({ latitude, longitude }, bbox),
    ) || boundsIntersect(bounds, bbox);
  });
}

function routeMatchesRegion(route: RouteCatalogRecord, regionTags: string[]): boolean {
  if (regionTags.length === 0) return false;
  const routeTokens = [
    route.name,
    route.publicId,
    route.id,
    ...(route.tags ?? []),
    ...route.sourceRecords.map((source) => source.label),
    ...route.sourceRecords.map((source) => source.authority),
  ].map(normalizeToken);
  return regionTags.some((tag) => routeTokens.includes(tag));
}

function routeIsWithinRadius(route: RouteCatalogRecord, query: RouteCatalogViewportQuery): boolean {
  return haversineMiles(query.center, route.centerCoordinate) <= query.radiusMiles;
}

function forestFromRoute(route: RouteCatalogRecord): string | null {
  const tags = route.tags ?? [];
  const direct = tags.find((tag) => /forest|basin|grassland|nra|ohv|orv/i.test(tag));
  if (direct) return direct;
  const normalizedTags = new Set(tags.map(normalizeToken));
  const area = ROUTE_CATALOG_COVERAGE_AREAS.find((candidate) =>
    normalizedTags.has(normalizeToken(candidate.key)) ||
    normalizedTags.has(normalizeToken(candidate.label)) ||
    normalizedTags.has(normalizeToken(candidate.shortLabel)),
  );
  return area?.label ?? null;
}

function geometryStatusForRoute(
  route: RouteCatalogRecord,
  lines: NormalizedLine[],
  guidanceReady: boolean,
): RouteCatalogGeometryStatus {
  if (lines.length === 0) {
    return route.routeGeometry ? 'insufficient_geometry' : 'trailhead_only';
  }
  if (route.routeGeometryMode === 'preview_simplified') return 'preview_geometry';
  return guidanceReady ? 'guidance_ready' : 'insufficient_geometry';
}

function confidenceForScore(score: number): RouteGeometryOverlayConfidence {
  if (score >= 85) return 'high';
  if (score >= 65) return 'medium';
  if (score > 0) return 'low';
  return 'unknown';
}

function dataStateForRoute(route: RouteCatalogRecord): RouteGeometryOverlayDataState {
  if (route.sourceRecords.some((source) => source.lastVerifiedAt)) return 'live';
  if (route.updatedAt || route.createdAt) return 'cached';
  return 'unknown';
}

function segmentIdsForRoute(route: RouteCatalogRecord): string[] {
  const intelligence = route.routeIntelligence && typeof route.routeIntelligence === 'object'
    ? route.routeIntelligence as Record<string, unknown>
    : {};
  const raw =
    intelligence.segmentIds ??
    intelligence.segment_ids ??
    intelligence.routeSegmentIds ??
    intelligence.route_segment_ids;
  const values = Array.isArray(raw) ? raw : [];
  const segmentIds = values.map((value) => String(value ?? '').trim()).filter(Boolean);
  return segmentIds.length > 0 ? Array.from(new Set(segmentIds)) : [route.publicId ?? route.id];
}

function geometryFromLines(
  route: RouteCatalogRecord,
  lines: NormalizedLine[],
): RouteCatalogViewportLineGeometry | null {
  if (lines.length === 0) return null;
  if (route.routeGeometry?.type === 'MultiLineString' || lines.length > 1) {
    return {
      type: 'MultiLineString',
      coordinates: lines,
    };
  }
  return {
    type: 'LineString',
    coordinates: lines[0],
  };
}

function featurePropertiesForRoute(
  route: RouteCatalogRecord,
  status: RouteCatalogGeometryStatus,
  guidanceReady: boolean,
): RouteCatalogViewportFeatureProperties {
  const verification = verifyRouteCatalogRecord(route);
  const warnings = Array.from(new Set([
    ...verification.warnings,
    ...verification.blockers,
  ]));
  const forest = forestFromRoute(route);
  return {
    routeId: route.publicId ?? route.id,
    title: route.name,
    name: route.name,
    forest,
    region: forest,
    distanceMiles: route.distanceMiles ?? null,
    tripType: route.routeType ?? null,
    geometryStatus: status,
    guidanceReady,
    source: 'route_catalog',
    sourceLabel: verification.sourceLabel,
    routeGeometryMode: route.routeGeometryMode ?? null,
    segmentIds: segmentIdsForRoute(route),
    confidence: confidenceForScore(verification.confidenceScore),
    dataState: dataStateForRoute(route),
    warnings,
    featureKind: status === 'trailhead_only' || status === 'insufficient_geometry' ? 'trailhead_marker' : 'route_line',
  };
}

function featureForRoute(route: RouteCatalogRecord, query: RouteCatalogViewportQuery): RouteCatalogViewportFeature | null {
  const lines = linesFromGeometry(route.routeGeometry);
  const geometryIntersects = lines.length > 0 && routeGeometryIntersectsBbox(lines, query.bbox);
  const centerIntersects = coordinateInBbox(route.centerCoordinate, query.bbox);
  const regionRadiusMatch = routeMatchesRegion(route, query.regionTags) && routeIsWithinRadius(route, query);
  if (!geometryIntersects && !centerIntersects && !regionRadiusMatch) return null;

  const verification = verifyRouteCatalogRecord(route);
  const hasGuidanceGeometry = lines.length > 0 && route.routeGeometryMode !== 'preview_simplified';
  const guidanceReady = hasGuidanceGeometry && verification.publicRecommendation && verification.blockers.length === 0;
  const geometryStatus = geometryStatusForRoute(route, lines, guidanceReady);
  const properties = featurePropertiesForRoute(route, geometryStatus, guidanceReady);
  const lineGeometry = geometryFromLines(route, lines);
  if (lineGeometry) {
    return {
      type: 'Feature',
      id: `route-catalog:${route.publicId ?? route.id}`,
      geometry: lineGeometry,
      properties: {
        ...properties,
        featureKind: 'route_line',
      },
    };
  }

  return {
    type: 'Feature',
    id: `route-catalog:${route.publicId ?? route.id}:trailhead`,
    geometry: {
      type: 'Point',
      coordinates: [route.centerCoordinate.longitude, route.centerCoordinate.latitude],
    },
    properties,
  };
}

function normalizeRoutes(records: unknown[]): RouteCatalogRecord[] {
  const byId = new Map<string, RouteCatalogRecord>();
  records.forEach((value) => {
    const route = normalizeRouteCatalogRecord(value);
    if (!route) return;
    byId.set(route.publicId ?? route.id, route);
  });
  return Array.from(byId.values());
}

export function queryRouteCatalogViewportRecords(
  records: unknown[],
  query: RouteCatalogViewportQuery,
): RouteCatalogViewportResult {
  const routes = normalizeRoutes(records);
  const features: RouteCatalogViewportFeature[] = [];
  let skippedOutsideViewportCount = 0;

  for (const route of routes) {
    if (features.length >= query.limit) break;
    const feature = featureForRoute(route, query);
    if (!feature) {
      skippedOutsideViewportCount += 1;
      continue;
    }
    features.push(feature);
  }

  const lineFeatureCount = features.filter((feature) => feature.geometry.type !== 'Point').length;
  const markerFeatureCount = features.length - lineFeatureCount;
  const guidanceReadyCount = features.filter((feature) => feature.properties.guidanceReady).length;
  const trailheadOnlyCount = features.filter((feature) => feature.properties.geometryStatus === 'trailhead_only').length;
  const insufficientGeometryCount = features.filter((feature) => feature.properties.geometryStatus === 'insufficient_geometry').length;

  return {
    featureCollection: {
      type: 'FeatureCollection',
      features,
    },
    candidateCount: routes.length,
    returnedCount: features.length,
    lineFeatureCount,
    markerFeatureCount,
    guidanceReadyCount,
    trailheadOnlyCount,
    insufficientGeometryCount,
    skippedOutsideViewportCount,
    bboxFilterApplied: true,
    source: 'route_catalog',
  };
}

function coordinatesToOverlay(line: NormalizedLine) {
  return line.map(([longitude, latitude]) => ({ latitude, longitude }));
}

function featureWarnings(feature: RouteCatalogViewportFeature): string[] {
  const warnings = new Set<string>([ROUTE_GEOMETRY_OVERLAY_PLANNING_WARNING]);
  feature.properties.warnings.forEach((warning) => {
    const clean = cleanText(warning);
    if (clean) warnings.add(clean);
  });
  if (feature.properties.geometryStatus === 'preview_geometry') {
    warnings.add('Preview geometry only; start guidance from the route detail when full geometry is available.');
  }
  if (feature.properties.geometryStatus === 'insufficient_geometry') {
    warnings.add('Route geometry is insufficient for active trail guidance.');
  }
  return Array.from(warnings);
}

function metadataForFeature(feature: RouteCatalogViewportFeature): RouteSegmentSourceMetadata {
  return {
    kind: 'ecs_route_geometry',
    sourceLabel: feature.properties.sourceLabel,
    confidence: 'planning_geometry',
    routeGeometrySourceKind: 'route_catalog',
    dataState: feature.properties.dataState,
    warnings: featureWarnings(feature),
    routeCatalogRouteId: feature.properties.routeId,
    geometryStatus: feature.properties.geometryStatus,
    guidanceReady: feature.properties.guidanceReady,
    segmentIds: feature.properties.segmentIds,
  };
}

function lineFeatureToSegments(
  feature: RouteCatalogViewportFeature,
  selectedIds: Set<string>,
): RouteGeometryOverlaySegment[] {
  if (feature.geometry.type === 'Point') return [];
  const lines = feature.geometry.type === 'MultiLineString'
    ? (feature.geometry.coordinates as number[][][])
        .map(lineFromCoordinates)
        .filter((line) => line.length > 1)
    : [lineFromCoordinates(feature.geometry.coordinates)].filter((line) => line.length > 1);

  return lines.map((line, index) => {
    const id = lines.length === 1
      ? `route-catalog:${feature.properties.routeId}`
      : `route-catalog:${feature.properties.routeId}:${index}`;
    const warnings = featureWarnings(feature);
    const sourceMetadata = metadataForFeature(feature);
    return {
      id,
      name: feature.properties.title,
      kind: 'route_geometry_segment',
      coordinates: coordinatesToOverlay(line),
      color: ROUTE_GEOMETRY_OVERLAY_COLOR,
      sourceKind: 'route_catalog' as RouteGeometryOverlaySourceKind,
      sourceId: feature.properties.routeId,
      sourceLabel: feature.properties.sourceLabel,
      dataState: feature.properties.dataState,
      confidence: feature.properties.confidence,
      warnings,
      routeGeometrySelected: selectedIds.has(id),
      routeGeometrySourceKind: 'route_catalog' as RouteGeometryOverlaySourceKind,
      routeGeometryDataState: feature.properties.dataState,
      routeGeometryConfidence: feature.properties.confidence,
      routeGeometryWarningsJson: JSON.stringify(warnings),
      sourceMetadata,
    };
  });
}

export function routeCatalogViewportFeaturesToRouteGeometrySegments(
  featureCollection: RouteCatalogViewportFeatureCollection,
  selectedSegmentIds: string[] = [],
): RouteGeometryOverlaySegment[] {
  const selectedIds = new Set(selectedSegmentIds.map(String));
  return featureCollection.features.flatMap((feature) => lineFeatureToSegments(feature, selectedIds));
}

export class RouteCatalogViewportCache {
  private maxEntries: number;
  private entries = new Map<string, RouteCatalogViewportResult>();

  constructor(options: { maxEntries?: number } = {}) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 24));
  }

  get(query: Pick<RouteCatalogViewportQuery, 'cacheKey'>): RouteCatalogViewportResult | null {
    const cached = this.entries.get(query.cacheKey);
    if (!cached) return null;
    this.entries.delete(query.cacheKey);
    this.entries.set(query.cacheKey, cached);
    return cached;
  }

  set(query: Pick<RouteCatalogViewportQuery, 'cacheKey'>, result: RouteCatalogViewportResult): RouteCatalogViewportResult {
    if (this.entries.has(query.cacheKey)) this.entries.delete(query.cacheKey);
    this.entries.set(query.cacheKey, result);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
    return result;
  }

  getOrSet(
    query: Pick<RouteCatalogViewportQuery, 'cacheKey'>,
    loader: () => RouteCatalogViewportResult,
  ): RouteCatalogViewportResult {
    const cached = this.get(query);
    if (cached) return cached;
    return this.set(query, loader());
  }

  clear(): void {
    this.entries.clear();
  }
}

export type RouteCoordinate = {
  latitude: number;
  longitude: number;
};

export type RouteBbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type RouteLineGeometry = {
  type: 'LineString' | 'MultiLineString';
  coordinates: number[][] | number[][][];
};

export type RouteCatalogSourceType = 'official' | 'community' | 'imported' | 'preview';

export type RouteCatalogSummary = {
  routeId: string;
  title: string;
  region: string | null;
  forestName: string | null;
  distanceMeters: number | null;
  estimatedDurationSeconds: number | null;
  difficulty: string | null;
  popularityScore: number | null;
  communityRating: number | null;
  sourceType: RouteCatalogSourceType;
  bbox: RouteBbox | null;
  trailheadCoordinate: RouteCoordinate | null;
  thumbnailUrl: string | null;
  thumbnailAssetKey: string | null;
  updatedAt: string | null;
  tags: string[];
};

export type RouteDetail = {
  routeId: string;
  summary: RouteCatalogSummary;
  geometry: RouteLineGeometry | null;
  steps: Array<Record<string, unknown>>;
  warnings: string[];
  sourceMetadata: Record<string, unknown>;
};

export type MvumSegmentSummary = {
  segmentId: string;
  forestId: string | null;
  routeNumber: string | null;
  trailName: string | null;
  allowedUse: string[];
  difficulty: string | null;
  bbox: RouteBbox | null;
  sourceLayer: string;
  updatedAt: string | null;
};

export type MvumSelectedSegment = {
  segmentId: string;
  selectedAt: string;
  selectionOrder: number;
  sourceLayer: string;
  tileFeatureId: string | null;
};

export type StitchedRouteGap = {
  fromSegmentId: string | null;
  toSegmentId: string | null;
  reason: string;
};

export type StitchedRouteDraft = {
  draftId: string;
  selectedSegmentIds: string[];
  orderedSegmentIds: string[];
  geometry: RouteLineGeometry | null;
  distanceMeters: number | null;
  estimatedDurationSeconds: number | null;
  warnings: string[];
  unresolvedGaps: StitchedRouteGap[];
  createdAt: string;
  updatedAt: string;
};

export const EXPLORE_ROUTE_RUNTIME_MODELS = ['RouteCatalogSummary', 'RouteDetail'] as const;
export const NAVIGATE_ROUTE_RUNTIME_MODELS = [
  'MvumSegmentSummary',
  'MvumSelectedSegment',
  'StitchedRouteDraft',
] as const;

const SUMMARY_GEOMETRY_KEYS = new Set([
  'geometry',
  'routeGeometry',
  'route_geometry',
  'coordinates',
  'steps',
  'maneuvers',
  'segments',
]);

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requiredText(value: unknown): string | null {
  return cleanText(value);
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = finiteNumber(value);
  if (parsed == null || parsed < 0) return null;
  return Math.floor(parsed);
}

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item))
    .filter((item): item is string => !!item);
}

function readBbox(value: unknown): RouteBbox | null {
  const record = readRecord(value);
  if (!record) return null;
  const minLng = finiteNumber(record.minLng ?? record.west);
  const minLat = finiteNumber(record.minLat ?? record.south);
  const maxLng = finiteNumber(record.maxLng ?? record.east);
  const maxLat = finiteNumber(record.maxLat ?? record.north);
  if (minLng == null || minLat == null || maxLng == null || maxLat == null) return null;
  if (Math.abs(minLng) > 180 || Math.abs(maxLng) > 180 || Math.abs(minLat) > 90 || Math.abs(maxLat) > 90) {
    return null;
  }
  if (maxLng < minLng || maxLat < minLat) return null;
  return { minLng, minLat, maxLng, maxLat };
}

function readCoordinate(value: unknown): RouteCoordinate | null {
  const record = readRecord(value);
  if (!record) return null;
  const latitude = finiteNumber(record.latitude ?? record.lat);
  const longitude = finiteNumber(record.longitude ?? record.lng ?? record.lon);
  if (latitude == null || longitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function cleanCoordinatePair(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = finiteNumber(value[0]);
  const latitude = finiteNumber(value[1]);
  if (longitude == null || latitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return [longitude, latitude];
}

function readLineStringCoordinates(value: unknown): number[][] | null {
  if (!Array.isArray(value)) return null;
  const coordinates = value.map(cleanCoordinatePair).filter((point): point is number[] => !!point);
  return coordinates.length >= 2 ? coordinates : null;
}

function readRouteLineGeometry(value: unknown): RouteLineGeometry | null {
  const record = readRecord(value);
  if (!record) return null;

  if (record.type === 'LineString') {
    const coordinates = readLineStringCoordinates(record.coordinates);
    return coordinates ? { type: 'LineString', coordinates } : null;
  }

  if (record.type === 'MultiLineString' && Array.isArray(record.coordinates)) {
    const coordinates = record.coordinates
      .map(readLineStringCoordinates)
      .filter((line): line is number[][] => !!line);
    return coordinates.length > 0 ? { type: 'MultiLineString', coordinates } : null;
  }

  return null;
}

function sourceType(value: unknown): RouteCatalogSourceType | null {
  const normalized = cleanText(value)?.toLowerCase();
  if (
    normalized === 'official' ||
    normalized === 'community' ||
    normalized === 'imported' ||
    normalized === 'preview'
  ) {
    return normalized;
  }
  return null;
}

function hasForbiddenSummaryGeometry(record: Record<string, unknown>): boolean {
  return Object.keys(record).some((key) => SUMMARY_GEOMETRY_KEYS.has(key) && record[key] != null);
}

export function normalizeRouteCatalogSummary(value: unknown): RouteCatalogSummary | null {
  const record = readRecord(value);
  if (!record || hasForbiddenSummaryGeometry(record)) return null;
  const routeId = requiredText(record.routeId ?? record.route_id ?? record.id);
  const title = requiredText(record.title ?? record.name);
  const normalizedSourceType = sourceType(record.sourceType ?? record.source_type);
  if (!routeId || !title || !normalizedSourceType) return null;

  return {
    routeId,
    title,
    region: cleanText(record.region),
    forestName: cleanText(record.forestName ?? record.forest_name ?? record.forest),
    distanceMeters: finiteNumber(record.distanceMeters ?? record.distance_meters),
    estimatedDurationSeconds: finiteNumber(
      record.estimatedDurationSeconds ?? record.estimated_duration_seconds,
    ),
    difficulty: cleanText(record.difficulty),
    popularityScore: finiteNumber(record.popularityScore ?? record.popularity_score),
    communityRating: finiteNumber(record.communityRating ?? record.community_rating),
    sourceType: normalizedSourceType,
    bbox: readBbox(record.bbox),
    trailheadCoordinate: readCoordinate(
      record.trailheadCoordinate ?? record.trailhead_coordinate ?? record.startCoordinate,
    ),
    thumbnailUrl: cleanText(record.thumbnailUrl ?? record.thumbnail_url),
    thumbnailAssetKey: cleanText(record.thumbnailAssetKey ?? record.thumbnail_asset_key ?? record.localAssetKey),
    updatedAt: cleanText(record.updatedAt ?? record.updated_at),
    tags: cleanStringArray(record.tags),
  };
}

export function isRouteCatalogSummary(value: unknown): value is RouteCatalogSummary {
  return normalizeRouteCatalogSummary(value) != null;
}

export function normalizeRouteDetail(value: unknown): RouteDetail | null {
  const record = readRecord(value);
  if (!record) return null;
  const routeId = requiredText(record.routeId ?? record.route_id ?? record.id);
  const summary = normalizeRouteCatalogSummary(record.summary);
  if (!routeId || !summary || summary.routeId !== routeId) return null;
  const sourceMetadata = readRecord(record.sourceMetadata ?? record.source_metadata) ?? {};
  const steps = Array.isArray(record.steps)
    ? record.steps.map(readRecord).filter((step): step is Record<string, unknown> => !!step)
    : [];
  return {
    routeId,
    summary,
    geometry: readRouteLineGeometry(record.geometry ?? record.routeGeometry ?? record.route_geometry),
    steps,
    warnings: cleanStringArray(record.warnings),
    sourceMetadata,
  };
}

export function isRouteDetail(value: unknown): value is RouteDetail {
  return normalizeRouteDetail(value) != null;
}

export function normalizeMvumSegmentSummary(value: unknown): MvumSegmentSummary | null {
  const record = readRecord(value);
  if (!record || hasForbiddenSummaryGeometry(record)) return null;
  const segmentId = requiredText(record.segmentId ?? record.segment_id ?? record.id);
  const sourceLayer = requiredText(record.sourceLayer ?? record.source_layer);
  if (!segmentId || !sourceLayer) return null;
  return {
    segmentId,
    forestId: cleanText(record.forestId ?? record.forest_id),
    routeNumber: cleanText(record.routeNumber ?? record.route_number),
    trailName: cleanText(record.trailName ?? record.trail_name ?? record.name),
    allowedUse: cleanStringArray(record.allowedUse ?? record.allowed_use),
    difficulty: cleanText(record.difficulty),
    bbox: readBbox(record.bbox),
    sourceLayer,
    updatedAt: cleanText(record.updatedAt ?? record.updated_at),
  };
}

export function isMvumSegmentSummary(value: unknown): value is MvumSegmentSummary {
  return normalizeMvumSegmentSummary(value) != null;
}

export function normalizeMvumSelectedSegment(value: unknown): MvumSelectedSegment | null {
  const record = readRecord(value);
  if (!record) return null;
  const segmentId = requiredText(record.segmentId ?? record.segment_id);
  const selectedAt = requiredText(record.selectedAt ?? record.selected_at);
  const selectionOrder = nonNegativeInteger(record.selectionOrder ?? record.selection_order);
  const sourceLayer = requiredText(record.sourceLayer ?? record.source_layer);
  if (!segmentId || !selectedAt || selectionOrder == null || !sourceLayer) return null;
  return {
    segmentId,
    selectedAt,
    selectionOrder,
    sourceLayer,
    tileFeatureId: cleanText(record.tileFeatureId ?? record.tile_feature_id),
  };
}

export function isMvumSelectedSegment(value: unknown): value is MvumSelectedSegment {
  return normalizeMvumSelectedSegment(value) != null;
}

function normalizeStitchedRouteGap(value: unknown): StitchedRouteGap | null {
  const record = readRecord(value);
  if (!record) return null;
  const reason = requiredText(record.reason);
  if (!reason) return null;
  return {
    fromSegmentId: cleanText(record.fromSegmentId ?? record.from_segment_id),
    toSegmentId: cleanText(record.toSegmentId ?? record.to_segment_id),
    reason,
  };
}

export function normalizeStitchedRouteDraft(value: unknown): StitchedRouteDraft | null {
  const record = readRecord(value);
  if (!record) return null;
  const draftId = requiredText(record.draftId ?? record.draft_id);
  const createdAt = requiredText(record.createdAt ?? record.created_at);
  const updatedAt = requiredText(record.updatedAt ?? record.updated_at);
  const unresolvedGapsInput = record.unresolvedGaps ?? record.unresolved_gaps;
  if (!draftId || !createdAt || !updatedAt) return null;
  return {
    draftId,
    selectedSegmentIds: cleanStringArray(record.selectedSegmentIds ?? record.selected_segment_ids),
    orderedSegmentIds: cleanStringArray(record.orderedSegmentIds ?? record.ordered_segment_ids),
    geometry: readRouteLineGeometry(record.geometry),
    distanceMeters: finiteNumber(record.distanceMeters ?? record.distance_meters),
    estimatedDurationSeconds: finiteNumber(
      record.estimatedDurationSeconds ?? record.estimated_duration_seconds,
    ),
    warnings: cleanStringArray(record.warnings),
    unresolvedGaps: Array.isArray(unresolvedGapsInput)
      ? unresolvedGapsInput
          .map(normalizeStitchedRouteGap)
          .filter((gap): gap is StitchedRouteGap => !!gap)
      : [],
    createdAt,
    updatedAt,
  };
}

export function isStitchedRouteDraft(value: unknown): value is StitchedRouteDraft {
  return normalizeStitchedRouteDraft(value) != null;
}

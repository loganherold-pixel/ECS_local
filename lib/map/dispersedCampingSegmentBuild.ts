export const DISPERSED_ROUTE_LEG_PLANNING_WARNING =
  'Planning geometry. Verify local access, closures, and posted rules before travel or camping.';

export type DispersedRouteLegConfidence = 'planning_geometry' | 'official_shadow' | 'unknown';

export type RouteSegmentSourceMetadata = {
  kind: 'dispersed_route_leg' | 'freehand_trace' | 'snapped_trace';
  sourceLabel: string;
  confidence: DispersedRouteLegConfidence;
  regionIds?: string[];
  landManager?: string | null;
};

export type DispersedRouteLegSegment = {
  id: string;
  coordinates: [number, number][];
  sourceLabel: string;
  confidence: DispersedRouteLegConfidence;
  regionIds: string[];
  landManager: string | null;
  eligibilityConfidence: 'high' | 'medium' | 'verify' | 'restricted' | 'unknown';
  warnings: string[];
};

export type DispersedRouteLegSelectionPayload = DispersedRouteLegSegment & {
  selected: boolean;
};

type RawCoordinate =
  | [number, number]
  | {
      latitude?: number;
      longitude?: number;
      lat?: number;
      lng?: number;
      lon?: number;
    };

type RenderedRouteLegFeature = {
  id?: string | number | null;
  sourceLayer?: string | null;
  layer?: { id?: string | null; type?: string | null; sourceLayer?: string | null } | null;
  properties?: Record<string, unknown> | null;
  geometry?: {
    type?: string | null;
    coordinates?: RawCoordinate[] | RawCoordinate[][] | null;
  } | null;
};

type BuildDispersedRouteLegSegmentsOptions = {
  maxPointsPerSegment?: number;
  maxSegments?: number;
};

export type DispersedRouteBuilderSegmentData = {
  id: string;
  coordinates: [number, number][];
  rawSegment?: [number, number][];
  snappedSegment?: [number, number][];
  snapConfidence?: 'high' | 'medium' | 'low' | null;
  snapSource?: string | null;
  snapStatus?: 'snapped' | 'raw_smoothed' | 'too_short' | 'ambiguous' | 'failed' | 'network_pending' | 'blocked' | null;
  snapProvider?: 'rendered_features' | 'mapbox_map_matching' | null;
  snapProfile?: 'driving' | null;
  snapMessage?: string | null;
  sourceSegmentId?: string | null;
  buildSource?: RouteSegmentSourceMetadata | null;
};

const DEFAULT_MAX_POINTS_PER_SEGMENT = 24;
const DEFAULT_MAX_SEGMENTS = 240;

const ROUTEABLE_TOKENS = new Set([
  'bridleway',
  'cycleway',
  'dirt',
  'footway',
  'highway',
  'minor',
  'motorway',
  'path',
  'primary',
  'raceway',
  'residential',
  'road',
  'secondary',
  'service',
  'street',
  'tertiary',
  'track',
  'trail',
  'trunk',
  'unclassified',
]);

const BLOCKED_TOKENS = [
  'building',
  'closed',
  'construction',
  'no_access',
  'no access',
  'no-access',
  'private',
  'prohibited',
  'restricted',
  'water',
];

function toFiniteNumber(value: unknown): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function normalizeRouteLegCoordinate(raw: RawCoordinate): [number, number] | null {
  if (Array.isArray(raw)) {
    const lng = toFiniteNumber(raw[0]);
    const lat = toFiniteNumber(raw[1]);
    if (lng == null || lat == null) return null;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
    return [lng, lat];
  }

  const lng = toFiniteNumber(raw.longitude ?? raw.lng ?? raw.lon);
  const lat = toFiniteNumber(raw.latitude ?? raw.lat);
  if (lng == null || lat == null) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

export function normalizeDispersedRouteLegCoordinates(input: unknown): [number, number][] {
  if (!Array.isArray(input)) return [];

  const coordinates: [number, number][] = [];
  for (const raw of input as RawCoordinate[]) {
    const coordinate = normalizeRouteLegCoordinate(raw);
    if (!coordinate) continue;

    const previous = coordinates[coordinates.length - 1];
    if (previous && previous[0] === coordinate[0] && previous[1] === coordinate[1]) continue;
    coordinates.push(coordinate);
  }

  return coordinates;
}

function splitCoordinateLines(feature: RenderedRouteLegFeature): [number, number][][] {
  const type = String(feature.geometry?.type || '').toLowerCase();
  const coordinates = feature.geometry?.coordinates;

  if (type === 'linestring') {
    const line = normalizeDispersedRouteLegCoordinates(coordinates);
    return line.length > 1 ? [line] : [];
  }

  if (type === 'multilinestring' && Array.isArray(coordinates)) {
    return (coordinates as RawCoordinate[][])
      .map((line) => normalizeDispersedRouteLegCoordinates(line))
      .filter((line) => line.length > 1);
  }

  return [];
}

function chunkRouteLegLine(line: [number, number][], maxPointsPerSegment: number): [number, number][][] {
  if (line.length <= maxPointsPerSegment) return [line];

  const chunks: [number, number][][] = [];
  let index = 0;
  while (index < line.length - 1) {
    const chunk = line.slice(index, index + maxPointsPerSegment);
    if (chunk.length > 1) chunks.push(chunk);
    index += Math.max(1, maxPointsPerSegment - 1);
  }

  return chunks;
}

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function collectFeatureTokens(feature: RenderedRouteLegFeature): string {
  const props = feature.properties || {};
  const values: string[] = [
    feature.sourceLayer,
    feature.layer?.id,
    feature.layer?.type,
    feature.layer?.sourceLayer,
  ].filter(Boolean) as string[];

  [
    'access',
    'bicycle',
    'brunnel',
    'camping',
    'class',
    'confidence',
    'eligibilityConfidence',
    'foot',
    'highway',
    'kind',
    'landuse',
    'motor_vehicle',
    'route',
    'seasonal',
    'service',
    'status',
    'subclass',
    'surface',
    'type',
    'vehicle',
  ].forEach((key) => values.push(String(props[key] ?? '')));

  return values.join(' ').toLowerCase();
}

export function isBlockedDispersedRouteLegFeature(feature: RenderedRouteLegFeature): boolean {
  const tokens = collectFeatureTokens(feature);
  return BLOCKED_TOKENS.some((token) => tokens.includes(token));
}

function isRouteableDispersedRouteLegFeature(feature: RenderedRouteLegFeature): boolean {
  const tokens = collectFeatureTokens(feature)
    .split(/[^a-z0-9_-]+/i)
    .map((token) => normalizeToken(token))
    .filter(Boolean);

  if (tokens.some((token) => ROUTEABLE_TOKENS.has(token))) return true;

  const layerId = normalizeToken(feature.layer?.id || feature.sourceLayer);
  return layerId.includes('road') || layerId.includes('trail') || layerId.includes('path') || layerId.includes('track');
}

function readRegionIds(properties: Record<string, unknown>): string[] {
  const raw =
    properties.regionIds ??
    properties.region_ids ??
    properties.regionId ??
    properties.region_id ??
    properties.eligibleRegionIds ??
    properties.eligible_region_ids;
  const values = Array.isArray(raw) ? raw : raw != null ? String(raw).split(',') : [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  );
}

function readLandManager(properties: Record<string, unknown>): string | null {
  const raw =
    properties.landManager ??
    properties.land_manager ??
    properties.manager ??
    properties.Mang_Name ??
    properties.agency;
  const next = String(raw ?? '').trim();
  return next || null;
}

function readEligibilityConfidence(
  properties: Record<string, unknown>,
): DispersedRouteLegSegment['eligibilityConfidence'] {
  const raw = normalizeToken(properties.eligibilityConfidence ?? properties.confidence);
  if (raw === 'high' || raw === 'medium' || raw === 'verify' || raw === 'restricted') return raw;
  return 'unknown';
}

function readSourceLabel(feature: RenderedRouteLegFeature): string {
  const props = feature.properties || {};
  const label =
    props.name ??
    props.ref ??
    props.routeName ??
    props.route_name ??
    props.class ??
    props.subclass ??
    feature.sourceLayer ??
    feature.layer?.id;
  const sourceLabel = String(label ?? '').trim();
  return sourceLabel || 'Rendered routeable feature';
}

function coordinateHash(coordinates: [number, number][]): string {
  const payload = coordinates.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join('|');
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildDispersedRouteLegSegments(
  features: RenderedRouteLegFeature[],
  options: BuildDispersedRouteLegSegmentsOptions = {},
): DispersedRouteLegSegment[] {
  const maxPointsPerSegment = Math.max(2, Math.floor(options.maxPointsPerSegment ?? DEFAULT_MAX_POINTS_PER_SEGMENT));
  const maxSegments = Math.max(1, Math.floor(options.maxSegments ?? DEFAULT_MAX_SEGMENTS));
  const segments: DispersedRouteLegSegment[] = [];
  const seenIds = new Set<string>();

  for (const feature of features || []) {
    if (!feature || isBlockedDispersedRouteLegFeature(feature) || !isRouteableDispersedRouteLegFeature(feature)) continue;

    const properties = feature.properties || {};
    const eligibilityConfidence = readEligibilityConfidence(properties);
    if (eligibilityConfidence === 'restricted') continue;

    const regionIds = readRegionIds(properties);
    const landManager = readLandManager(properties);
    const sourceLabel = readSourceLabel(feature);

    for (const line of splitCoordinateLines(feature)) {
      for (const coordinates of chunkRouteLegLine(line, maxPointsPerSegment)) {
        const id = `dispersed-leg-${coordinateHash(coordinates)}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        segments.push({
          id,
          coordinates,
          sourceLabel,
          confidence: 'planning_geometry',
          regionIds,
          landManager,
          eligibilityConfidence,
          warnings: [DISPERSED_ROUTE_LEG_PLANNING_WARNING],
        });

        if (segments.length >= maxSegments) return segments;
      }
    }
  }

  return segments;
}

export function dispersedRouteLegToRouteBuilderSegment(
  segment: DispersedRouteLegSegment,
): DispersedRouteBuilderSegmentData {
  return {
    id: `route-builder-${segment.id}`,
    coordinates: segment.coordinates,
    rawSegment: segment.coordinates,
    snappedSegment: segment.coordinates,
    snapConfidence: 'medium',
    snapSource: 'dispersed-route-leg',
    snapStatus: 'snapped',
    snapProvider: 'rendered_features',
    snapProfile: null,
    snapMessage: DISPERSED_ROUTE_LEG_PLANNING_WARNING,
    sourceSegmentId: segment.id,
    buildSource: {
      kind: 'dispersed_route_leg',
      sourceLabel: segment.sourceLabel,
      confidence: segment.confidence,
      regionIds: segment.regionIds,
      landManager: segment.landManager,
    },
  };
}

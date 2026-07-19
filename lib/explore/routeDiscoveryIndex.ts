import type {
  ECSTrailPack,
  ECSTrailPackCatalogTripClassification,
  ECSTrailPackCoordinate,
  ECSTrailPackDiscoveryItem,
} from './trailPacks';
import type {
  ECSTrailPackConfidence,
  ECSTrailPackConfidenceInput,
} from './trailPackConfidence';
import {
  isTrailPackPubliclyDiscoverable,
  type ECSTrailPackReviewState,
} from './trailPackReviewQueue';
import {
  getExploreRouteThumbnail,
  type ExploreTrailThumbnailAssignment,
} from '../exploreTrailThumbnails';
import {
  capUniqueRankedRoutes,
  ECS_ROUTE_SEARCH_RESULT_LIMIT,
  normalizeRouteSearchResultLimit,
} from './routeSearchResultPolicy';

export type RouteDiscoveryGeometryStatus =
  | 'full'
  | 'preview_geometry'
  | 'trailhead_only'
  | 'insufficient_geometry';

export type RouteDiscoveryRefinement =
  | 'remoteness'
  | 'dayTrip'
  | 'weekendTrip'
  | 'expedition'
  | null;

export type RouteDiscoveryCoordinate = {
  latitude: number;
  longitude: number;
};

export type RouteDiscoveryCoordinateBucket = {
  coordinate: RouteDiscoveryCoordinate;
  bucketKey: string;
  bucketSizeDegrees: number;
};

export type RouteDiscoveryBounds = {
  minLatitude: number;
  minLongitude: number;
  maxLatitude: number;
  maxLongitude: number;
};

export type RouteDiscoveryIndexEntry = {
  routeId: string;
  title: string;
  aliases: string[];
  forestRegion: string | null;
  trailheadCoordinate: RouteDiscoveryCoordinate | null;
  centroidCoordinate: RouteDiscoveryCoordinate | null;
  bounds: RouteDiscoveryBounds | null;
  distanceMiles: number | null;
  estimatedDurationMinutes: number | null;
  tripType: string | null;
  routeType: string | null;
  difficulty: string | null;
  guidanceReady: boolean;
  geometryStatus: RouteDiscoveryGeometryStatus;
  featuredScore: number;
  popularityScore: number;
  confidenceScore: number;
  thumbnail: ExploreTrailThumbnailAssignment | null;
  source: string;
  verificationStatus: string | null;
  reviewStatus: string | null;
  updatedAt: string | null;
  searchDistanceMiles: number | null;
  distanceFromUserMiles?: number;
  searchMatchReasons?: string[];
};

export type RouteDiscoveryIndex = {
  entries: RouteDiscoveryIndexEntry[];
  routeById: Map<string, ECSTrailPack>;
  versionHash: string;
  builtAt: string;
};

export type RouteDiscoveryIndexQuery = {
  coordinate: RouteDiscoveryCoordinate;
  radiusMiles: number;
  refinement?: RouteDiscoveryRefinement;
  resultLimit?: number | null;
  firstBatchSize?: number;
  batchSize?: number;
  cursor?: number | null;
  guidanceReadyOnly?: boolean;
  searchText?: string | null;
  routeCategory?: string | null;
  sourceFilter?: string | null;
  searchFingerprint?: string | null;
  accessContextFingerprint?: string | null;
};

export type RouteDiscoveryIndexResult = {
  items: RouteDiscoveryIndexEntry[];
  allItems: RouteDiscoveryIndexEntry[];
  totalEligibleCount: number;
  offset: number;
  nextCursor: number | null;
  batchSize: number;
  cacheStatus: 'uncached' | 'miss' | 'hit' | 'stale' | 'refresh';
  shouldRevalidate: boolean;
  cacheKey?: string;
};

export type RouteDiscoveryTrailPackResult = RouteDiscoveryIndexResult & {
  trailPacks: ECSTrailPackDiscoveryItem[];
  allTrailPacks: ECSTrailPackDiscoveryItem[];
};

export type RouteDiscoveryCacheEntry<T> = {
  result: T;
  storedAtMs: number;
};

export type RouteDiscoveryCache<T = RouteDiscoveryTrailPackResult> = {
  ttlMs: number;
  staleMs: number;
  maxEntries: number;
  entries: Map<string, RouteDiscoveryCacheEntry<T>>;
  get: (key: string, nowMs?: number) => { status: 'hit' | 'stale' | 'miss'; result: T | null };
  set: (key: string, result: T, nowMs?: number) => void;
  clear: () => void;
};

export type RouteDiscoveryImageCache = {
  loadedUris: Set<string>;
  failedUris: Set<string>;
  pendingUris: Set<string>;
  markLoaded: (uri: string | null | undefined) => void;
  markFailed: (uri: string | null | undefined) => void;
  markPending: (uri: string | null | undefined) => void;
  status: (uri: string | null | undefined) => 'loaded' | 'failed' | 'pending' | 'missing';
};

const EARTH_RADIUS_MILES = 3958.7613;
const DEFAULT_FIRST_BATCH_SIZE = ECS_ROUTE_SEARCH_RESULT_LIMIT;
const DEFAULT_BATCH_SIZE = ECS_ROUTE_SEARCH_RESULT_LIMIT;
const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_CACHE_STALE_MS = 240_000;
const DEFAULT_CACHE_MAX_ENTRIES = 24;
export const ROUTE_DISCOVERY_COORDINATE_BUCKET_DEGREES = 0.05;

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number != null && number > 0 ? number : null;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function unique(values: string[], limit = 16): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  });
  return result.slice(0, limit);
}

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function asCoordinate(value: unknown): RouteDiscoveryCoordinate | null {
  const record = readRecord(value);
  if (record) {
    const latitude = finiteNumber(record.latitude ?? record.lat);
    const longitude = finiteNumber(record.longitude ?? record.lng ?? record.lon);
    if (latitude != null && longitude != null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { latitude, longitude };
    }
  }
  if (Array.isArray(value) && value.length >= 2) {
    const longitude = finiteNumber(value[0]);
    const latitude = finiteNumber(value[1]);
    if (latitude != null && longitude != null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { latitude, longitude };
    }
  }
  return null;
}

function routeIntelligence(pack: ECSTrailPack): Record<string, unknown> {
  return readRecord(pack.routeIntelligence) ?? {};
}

function coordinateFromPack(pack: ECSTrailPack, keys: string[]): RouteDiscoveryCoordinate | null {
  const intelligence = routeIntelligence(pack);
  for (const key of keys) {
    const direct = asCoordinate((pack as unknown as Record<string, unknown>)[key]);
    if (direct) return direct;
    const nested = asCoordinate(intelligence[key]);
    if (nested) return nested;
  }
  return null;
}

function normalizeBounds(value: unknown): RouteDiscoveryBounds | null {
  const record = readRecord(value);
  if (record) {
    const minLatitude = finiteNumber(record.minLatitude ?? record.min_latitude ?? record.south);
    const minLongitude = finiteNumber(record.minLongitude ?? record.min_longitude ?? record.west);
    const maxLatitude = finiteNumber(record.maxLatitude ?? record.max_latitude ?? record.north);
    const maxLongitude = finiteNumber(record.maxLongitude ?? record.max_longitude ?? record.east);
    if (
      minLatitude != null &&
      minLongitude != null &&
      maxLatitude != null &&
      maxLongitude != null
    ) {
      return {
        minLatitude: Math.min(minLatitude, maxLatitude),
        minLongitude: Math.min(minLongitude, maxLongitude),
        maxLatitude: Math.max(minLatitude, maxLatitude),
        maxLongitude: Math.max(minLongitude, maxLongitude),
      };
    }
  }
  if (Array.isArray(value) && value.length >= 4) {
    const minLongitude = finiteNumber(value[0]);
    const minLatitude = finiteNumber(value[1]);
    const maxLongitude = finiteNumber(value[2]);
    const maxLatitude = finiteNumber(value[3]);
    if (
      minLatitude != null &&
      minLongitude != null &&
      maxLatitude != null &&
      maxLongitude != null
    ) {
      return {
        minLatitude: Math.min(minLatitude, maxLatitude),
        minLongitude: Math.min(minLongitude, maxLongitude),
        maxLatitude: Math.max(minLatitude, maxLatitude),
        maxLongitude: Math.max(minLongitude, maxLongitude),
      };
    }
  }
  return null;
}

function boundsFromGeometry(pack: ECSTrailPack): RouteDiscoveryBounds | null {
  const geometry = pack.routeGeometry;
  if (!geometry) return null;
  const rawSegments = geometry.type === 'MultiLineString'
    ? geometry.coordinates as number[][][]
    : [geometry.coordinates as number[][]];
  let minLatitude = Number.POSITIVE_INFINITY;
  let minLongitude = Number.POSITIVE_INFINITY;
  let maxLatitude = Number.NEGATIVE_INFINITY;
  let maxLongitude = Number.NEGATIVE_INFINITY;
  rawSegments.forEach((segment) => {
    segment.forEach((coordinate) => {
      const point = asCoordinate(coordinate);
      if (!point) return;
      minLatitude = Math.min(minLatitude, point.latitude);
      minLongitude = Math.min(minLongitude, point.longitude);
      maxLatitude = Math.max(maxLatitude, point.latitude);
      maxLongitude = Math.max(maxLongitude, point.longitude);
    });
  });
  if (!Number.isFinite(minLatitude)) return null;
  return { minLatitude, minLongitude, maxLatitude, maxLongitude };
}

function boundsForPack(pack: ECSTrailPack): RouteDiscoveryBounds | null {
  const intelligence = routeIntelligence(pack);
  return normalizeBounds(
    intelligence.bounds ??
      intelligence.routeBounds ??
      intelligence.bbox ??
      intelligence.boundingBox ??
      (pack as unknown as Record<string, unknown>).bounds ??
      (pack as unknown as Record<string, unknown>).bbox,
  ) ?? boundsFromGeometry(pack);
}

function centerOfBounds(bounds: RouteDiscoveryBounds): RouteDiscoveryCoordinate {
  return {
    latitude: (bounds.minLatitude + bounds.maxLatitude) / 2,
    longitude: (bounds.minLongitude + bounds.maxLongitude) / 2,
  };
}

function aliasesForPack(pack: ECSTrailPack): string[] {
  const intelligence = routeIntelligence(pack);
  return unique([
    pack.name,
    pack.id,
    ...(pack.tags ?? []),
    ...readStringArray(intelligence.aliases),
    ...readStringArray(intelligence.routeAliases),
    ...readStringArray((pack as unknown as Record<string, unknown>).aliases),
  ].map((value) => value.toLowerCase()));
}

function forestRegionForPack(pack: ECSTrailPack): string | null {
  const tags = pack.tags ?? [];
  const explicit = tags.find((tag) => /forest|region|district|tahoe|eldorado|plumas|mendocino|sierra/i.test(tag));
  if (explicit) return explicit;
  const intelligence = routeIntelligence(pack);
  return cleanText(intelligence.forest ?? intelligence.region ?? intelligence.area) || null;
}

function geometryStatusForPack(pack: ECSTrailPack, bounds: RouteDiscoveryBounds | null): RouteDiscoveryGeometryStatus {
  if (pack.routeGeometryMode === 'full') return 'full';
  if (pack.routeGeometryMode === 'preview_simplified') return 'preview_geometry';
  const activeGuidanceStatus = cleanText(pack.catalogVerification?.activeGuidance?.status);
  if (activeGuidanceStatus === 'ready' && bounds) return 'full';
  if (pack.routeGeometryMode === 'omitted' || !bounds) {
    const trailhead = coordinateFromPack(pack, [
      'trailheadCoordinate',
      'trailhead_coordinate',
      'startCoordinate',
      'start_coordinate',
    ]);
    return trailhead ? 'trailhead_only' : 'insufficient_geometry';
  }
  return 'preview_geometry';
}

function guidanceReadyForPack(pack: ECSTrailPack, geometryStatus: RouteDiscoveryGeometryStatus): boolean {
  const activeGuidanceStatus = cleanText(pack.catalogVerification?.activeGuidance?.status);
  if (activeGuidanceStatus === 'ready') return true;
  if (activeGuidanceStatus === 'preview_only' || activeGuidanceStatus === 'unavailable') return false;
  return geometryStatus === 'full';
}

function tripTypeForPack(pack: ECSTrailPack): string | null {
  const classification = pack.catalogTripClassification as ECSTrailPackCatalogTripClassification | undefined;
  if (classification?.tripType) return classification.tripType;
  const intelligence = routeIntelligence(pack);
  return cleanText(
    intelligence.tripType ??
      intelligence.trip_type ??
      (pack as unknown as Record<string, unknown>).tripType,
  ) || null;
}

function popularityForPack(pack: ECSTrailPack): number {
  return Math.max(0, (pack.positiveFeedbackCount ?? 0) * 4 + (pack.completionCount ?? 0) * 2 - (pack.negativeFeedbackCount ?? 0) * 3);
}

function thumbnailForPack(pack: ECSTrailPack): ExploreTrailThumbnailAssignment | null {
  const intelligence = routeIntelligence(pack);
  const directUri = cleanText(intelligence.thumbnailUri ?? intelligence.thumbnail_url ?? intelligence.imageUri ?? intelligence.image_url);
  if (directUri) {
    return {
      state: 'direct_route_image',
      trust: 'trusted',
      uri: directUri,
      sourceKey: pack.id,
      reason: 'route_discovery_index_metadata',
    } as ExploreTrailThumbnailAssignment;
  }
  return getExploreRouteThumbnail({
    id: pack.id,
    name: pack.name,
    region: forestRegionForPack(pack) ?? undefined,
    imageTag: cleanText(intelligence.imageTag ?? intelligence.image_tag) || 'trail-pack',
    terrainType: pack.routeType,
    description: pack.description,
    category: pack.source,
    startLat: pack.centerCoordinate.latitude,
    startLng: pack.centerCoordinate.longitude,
  });
}

function versionHashForPacks(packs: ECSTrailPack[]): string {
  const basis = packs
    .map((pack) => `${pack.id}:${pack.updatedAt ?? ''}:${pack.routeGeometryMode ?? ''}:${pack.confidenceScore ?? ''}`)
    .sort()
    .join('|');
  let hash = 0;
  for (let index = 0; index < basis.length; index += 1) {
    hash = ((hash << 5) - hash + basis.charCodeAt(index)) | 0;
  }
  return `catalog-${packs.length}-${Math.abs(hash)}`;
}

export function buildRouteDiscoveryIndex(
  trailPacks: ECSTrailPack[],
  options: { catalogVersionHash?: string; builtAt?: string } = {},
): RouteDiscoveryIndex {
  const routeById = new Map<string, ECSTrailPack>();
  const entries = trailPacks.map((pack) => {
    routeById.set(pack.id, pack);
    const intelligence = routeIntelligence(pack);
    const bounds = boundsForPack(pack);
    const trailheadCoordinate = coordinateFromPack(pack, [
      'trailheadCoordinate',
      'trailhead_coordinate',
      'startCoordinate',
      'start_coordinate',
    ]);
    const centroidCoordinate =
      coordinateFromPack(pack, ['centroidCoordinate', 'centroid_coordinate', 'centerCoordinate', 'center_coordinate']) ??
      pack.centerCoordinate ??
      (bounds ? centerOfBounds(bounds) : null);
    const geometryStatus = geometryStatusForPack(pack, bounds);
    return {
      routeId: pack.id,
      title: pack.name,
      aliases: aliasesForPack(pack),
      forestRegion: forestRegionForPack(pack),
      trailheadCoordinate,
      centroidCoordinate,
      bounds,
      distanceMiles: positiveNumber(pack.distanceMiles),
      estimatedDurationMinutes: positiveNumber(pack.estimatedDurationMinutes),
      tripType: tripTypeForPack(pack),
      routeType: pack.routeType ?? null,
      difficulty: pack.difficulty ?? null,
      guidanceReady: guidanceReadyForPack(pack, geometryStatus),
      geometryStatus,
      featuredScore: positiveNumber(pack.featuredRouteScore ?? intelligence.featuredRouteScore ?? intelligence.featured_route_score) ?? 0,
      popularityScore: popularityForPack(pack),
      confidenceScore: positiveNumber(pack.confidenceScore) ?? 0,
      thumbnail: thumbnailForPack(pack),
      source: pack.source,
      verificationStatus: cleanText(pack.catalogVerification?.sourceLabel ?? intelligence.verificationStatus) || null,
      reviewStatus: pack.reviewStatus,
      updatedAt: pack.updatedAt ?? null,
      searchDistanceMiles: positiveNumber(pack.searchDistanceMiles),
      searchMatchReasons: pack.searchMatchReasons ?? [],
    } satisfies RouteDiscoveryIndexEntry;
  });

  return {
    entries,
    routeById,
    versionHash: options.catalogVersionHash ?? versionHashForPacks(trailPacks),
    builtAt: options.builtAt ?? new Date().toISOString(),
  };
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMilesBetween(a: RouteDiscoveryCoordinate, b: RouteDiscoveryCoordinate): number {
  const latitude1 = degreesToRadians(a.latitude);
  const latitude2 = degreesToRadians(b.latitude);
  const deltaLatitude = degreesToRadians(b.latitude - a.latitude);
  const deltaLongitude = degreesToRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function distanceToBoundsMiles(point: RouteDiscoveryCoordinate, bounds: RouteDiscoveryBounds): number {
  const clamped = {
    latitude: Math.max(bounds.minLatitude, Math.min(bounds.maxLatitude, point.latitude)),
    longitude: Math.max(bounds.minLongitude, Math.min(bounds.maxLongitude, point.longitude)),
  };
  return distanceMilesBetween(point, clamped);
}

function indexedDistance(entry: RouteDiscoveryIndexEntry, coordinate: RouteDiscoveryCoordinate): number | null {
  if (entry.searchDistanceMiles != null) return entry.searchDistanceMiles;
  const distances = [
    entry.bounds ? distanceToBoundsMiles(coordinate, entry.bounds) : null,
    entry.trailheadCoordinate ? distanceMilesBetween(coordinate, entry.trailheadCoordinate) : null,
    entry.centroidCoordinate ? distanceMilesBetween(coordinate, entry.centroidCoordinate) : null,
  ].filter((value): value is number => value != null && Number.isFinite(value));
  return distances.length > 0 ? Math.min(...distances) : null;
}

function matchesRefinement(entry: RouteDiscoveryIndexEntry, refinement: RouteDiscoveryRefinement): boolean {
  if (!refinement) return true;
  const tripType = normalizeToken(entry.tripType);
  const durationHours = entry.estimatedDurationMinutes != null ? entry.estimatedDurationMinutes / 60 : null;
  const distanceMiles = entry.distanceMiles ?? 0;

  if (refinement === 'remoteness') {
    return /remote|backcountry|forest|high[-_ ]?clearance/.test(`${entry.aliases.join(' ')} ${entry.forestRegion ?? ''}`.toLowerCase());
  }
  if (refinement === 'dayTrip') {
    if (tripType === 'day_trip') return true;
    return (durationHours == null || durationHours <= 12) && distanceMiles < 80;
  }
  if (refinement === 'weekendTrip') {
    if (tripType === 'weekend_overland' || tripType === 'overnight_camping') return true;
    return durationHours != null && durationHours > 12 && durationHours <= 24;
  }
  if (refinement === 'expedition') {
    if (tripType === 'multi_day_expedition') return true;
    return (durationHours != null && durationHours > 24) || distanceMiles >= 150;
  }
  return true;
}

function normalizedSearchWords(value: unknown): string[] {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function routeDiscoverySearchHaystack(entry: RouteDiscoveryIndexEntry): string {
  return [
    entry.routeId,
    entry.title,
    ...entry.aliases,
    entry.forestRegion,
    entry.tripType,
    entry.routeType,
    entry.difficulty,
    entry.source,
    entry.verificationStatus,
  ]
    .flatMap(normalizedSearchWords)
    .join(' ');
}

function matchesSearchText(entry: RouteDiscoveryIndexEntry, searchText: unknown): boolean {
  const words = normalizedSearchWords(searchText);
  if (words.length === 0) return true;
  const haystack = routeDiscoverySearchHaystack(entry);
  return words.every((word) => haystack.includes(word));
}

function routeDiscoverySourceFamily(source: unknown): string {
  switch (normalizeToken(source)) {
    case 'ecs_validated':
      return 'official';
    case 'community_reviewed':
    case 'ecs_submitted':
    case 'needs_review':
      return 'community';
    case 'imported_gpx':
    case 'imported_kml':
      return 'imported';
    case 'partner_source':
      return 'partner';
    default:
      return normalizeToken(source);
  }
}

function matchesSourceFilter(entry: RouteDiscoveryIndexEntry, sourceFilter: unknown): boolean {
  const requested = normalizeToken(sourceFilter);
  if (!requested || requested === 'all' || requested === 'all_sources') return true;
  const source = normalizeToken(entry.source);
  return requested === source || requested === routeDiscoverySourceFamily(source);
}

function matchesRouteCategory(entry: RouteDiscoveryIndexEntry, routeCategory: unknown): boolean {
  const requested = normalizeToken(routeCategory);
  if (
    !requested ||
    requested === 'all' ||
    requested === 'all_routes' ||
    requested === 'all_drivable_trails'
  ) {
    return true;
  }
  const categories = new Set([
    normalizeToken(entry.routeType),
    normalizeToken(entry.tripType),
    normalizeToken(entry.difficulty),
    normalizeToken(entry.source),
    routeDiscoverySourceFamily(entry.source),
    ...entry.aliases.map(normalizeToken),
  ].filter(Boolean));
  return categories.has(requested);
}

function compareRouteDiscoveryEntries(left: RouteDiscoveryIndexEntry, right: RouteDiscoveryIndexEntry): number {
  const featuredDelta = right.featuredScore - left.featuredScore;
  if (featuredDelta !== 0) return featuredDelta;
  const guidanceDelta = Number(right.guidanceReady) - Number(left.guidanceReady);
  if (guidanceDelta !== 0) return guidanceDelta;
  const confidenceDelta = right.confidenceScore - left.confidenceScore;
  if (confidenceDelta !== 0) return confidenceDelta;
  const popularityDelta = right.popularityScore - left.popularityScore;
  if (popularityDelta !== 0) return popularityDelta;
  const distanceDelta = (left.distanceFromUserMiles ?? Number.MAX_SAFE_INTEGER) -
    (right.distanceFromUserMiles ?? Number.MAX_SAFE_INTEGER);
  if (distanceDelta !== 0) return distanceDelta;
  const titleDelta = left.title.localeCompare(right.title);
  if (titleDelta !== 0) return titleDelta;
  return left.routeId.localeCompare(right.routeId);
}

function selectRouteDiscoveryEntries(
  index: RouteDiscoveryIndex,
  query: RouteDiscoveryIndexQuery,
): RouteDiscoveryIndexEntry[] {
  const entries: RouteDiscoveryIndexEntry[] = [];
  index.entries.forEach((entry) => {
    const distanceFromUserMiles = indexedDistance(entry, query.coordinate);
    if (distanceFromUserMiles == null) return;
    const candidate = {
      ...entry,
      distanceFromUserMiles: Math.round(distanceFromUserMiles * 10) / 10,
    };
    entries.push(candidate);
  });
  const filtered = entries
    .filter((entry) => (entry.distanceFromUserMiles ?? Number.POSITIVE_INFINITY) <= query.radiusMiles)
    .filter((entry) => !query.guidanceReadyOnly || entry.guidanceReady)
    .filter((entry) => matchesRefinement(entry, query.refinement ?? null))
    .filter((entry) => matchesSearchText(entry, query.searchText))
    .filter((entry) => matchesRouteCategory(entry, query.routeCategory))
    .filter((entry) => matchesSourceFilter(entry, query.sourceFilter));
  const entriesByRouteId = new Map<string, RouteDiscoveryIndexEntry>();
  filtered.forEach((entry) => {
    const existing = entriesByRouteId.get(entry.routeId);
    if (!existing || compareRouteDiscoveryEntries(entry, existing) < 0) {
      entriesByRouteId.set(entry.routeId, entry);
    }
  });
  return Array.from(entriesByRouteId.values()).sort(compareRouteDiscoveryEntries);
}

function batchEntries(
  allItems: RouteDiscoveryIndexEntry[],
  query: RouteDiscoveryIndexQuery,
  cacheStatus: RouteDiscoveryIndexResult['cacheStatus'],
  shouldRevalidate = false,
  cacheKey?: string,
): RouteDiscoveryIndexResult {
  const totalEligibleCount = allItems.length;
  const cappedItems = capUniqueRankedRoutes(
    allItems,
    (entry) => entry.routeId,
    query.resultLimit,
  );
  const firstBatchSize = normalizeRouteSearchResultLimit(query.firstBatchSize ?? DEFAULT_FIRST_BATCH_SIZE);
  const batchSize = normalizeRouteSearchResultLimit(query.batchSize ?? DEFAULT_BATCH_SIZE);
  const offset = Math.max(0, Math.round(query.cursor ?? 0));
  const size = offset === 0 ? firstBatchSize : batchSize;
  const items = cappedItems.slice(offset, offset + size);
  const nextCursor = offset + items.length < cappedItems.length ? offset + items.length : null;
  return {
    items,
    allItems: cappedItems,
    totalEligibleCount,
    offset,
    nextCursor,
    batchSize,
    cacheStatus,
    shouldRevalidate,
    cacheKey,
  };
}

export function queryRouteDiscoveryIndex(
  index: RouteDiscoveryIndex,
  query: RouteDiscoveryIndexQuery,
): RouteDiscoveryIndexResult {
  return batchEntries(selectRouteDiscoveryEntries(index, query), query, 'uncached');
}

export function getNextRouteDiscoveryBatch(
  result: Pick<RouteDiscoveryIndexResult, 'allItems' | 'nextCursor' | 'batchSize'>,
): Pick<RouteDiscoveryIndexResult, 'items' | 'offset' | 'nextCursor' | 'batchSize'> {
  const allItems = capUniqueRankedRoutes(result.allItems, (entry) => entry.routeId);
  const batchSize = normalizeRouteSearchResultLimit(result.batchSize);
  const offset = result.nextCursor ?? allItems.length;
  const items = allItems.slice(offset, offset + batchSize);
  return {
    items,
    offset,
    nextCursor: offset + items.length < allItems.length ? offset + items.length : null,
    batchSize,
  };
}

function bucketCoordinateValue(value: number, bucketSizeDegrees: number): number {
  return Number((Math.floor(value / bucketSizeDegrees) * bucketSizeDegrees).toFixed(4));
}

export function normalizeRouteDiscoveryCoordinateBucket(
  coordinate: RouteDiscoveryCoordinate,
  options: { bucketSizeDegrees?: number } = {},
): RouteDiscoveryCoordinateBucket {
  const bucketSizeDegrees = positiveNumber(options.bucketSizeDegrees) ?? ROUTE_DISCOVERY_COORDINATE_BUCKET_DEGREES;
  const latitude = bucketCoordinateValue(coordinate.latitude, bucketSizeDegrees);
  const longitude = bucketCoordinateValue(coordinate.longitude, bucketSizeDegrees);
  return {
    coordinate: { latitude, longitude },
    bucketKey: `${latitude.toFixed(2)},${longitude.toFixed(2)}@${bucketSizeDegrees.toFixed(2)}`,
    bucketSizeDegrees,
  };
}

function stableCacheContextValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableCacheContextValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => typeof entry !== 'function' && entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableCacheContextValue(entry)]),
    );
  }
  return value ?? null;
}

function fingerprintCacheContext(value: unknown): string {
  const basis = JSON.stringify(stableCacheContextValue(value));
  let hash = 2166136261;
  for (let index = 0; index < basis.length; index += 1) {
    hash ^= basis.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function routeDiscoveryAccessCacheContext(options: {
  includeOwnDrafts?: boolean;
  ownTrailPackIds?: string[];
  includeBroaderResults?: boolean;
  confidenceInputsByTrailPackId?: Record<string, ECSTrailPackConfidenceInput>;
  reviewStatesByTrailPackId?: Record<string, ECSTrailPackReviewState>;
}): unknown {
  return {
    includeOwnDrafts: !!options.includeOwnDrafts,
    includeBroaderResults: !!options.includeBroaderResults,
    ownTrailPackIds: [...(options.ownTrailPackIds ?? [])].sort(),
    confidenceInputsByTrailPackId: options.confidenceInputsByTrailPackId ?? {},
    reviewStatesByTrailPackId: options.reviewStatesByTrailPackId ?? {},
  };
}

export function createRouteDiscoveryCacheKey(
  index: Pick<RouteDiscoveryIndex, 'versionHash'>,
  query: Pick<
    RouteDiscoveryIndexQuery,
    | 'coordinate'
    | 'radiusMiles'
    | 'refinement'
    | 'guidanceReadyOnly'
    | 'resultLimit'
    | 'firstBatchSize'
    | 'batchSize'
    | 'cursor'
    | 'searchText'
    | 'routeCategory'
    | 'sourceFilter'
    | 'searchFingerprint'
    | 'accessContextFingerprint'
  >,
  accessContext?: unknown,
): string {
  const bucket = normalizeRouteDiscoveryCoordinateBucket(query.coordinate);
  return [
    index.versionHash,
    bucket.bucketKey,
    Math.round(query.radiusMiles),
    query.refinement ?? 'all',
    query.guidanceReadyOnly ? 'guidance_ready' : 'all_geometry',
    `limit-${normalizeRouteSearchResultLimit(query.resultLimit)}`,
    `batch-${normalizeRouteSearchResultLimit(query.firstBatchSize ?? DEFAULT_FIRST_BATCH_SIZE)}-${normalizeRouteSearchResultLimit(query.batchSize ?? DEFAULT_BATCH_SIZE)}`,
    `cursor-${Math.max(0, Math.round(query.cursor ?? 0))}`,
    `search-${fingerprintCacheContext({
      text: cleanText(query.searchText).toLowerCase(),
      category: normalizeToken(query.routeCategory),
      source: normalizeToken(query.sourceFilter),
      fingerprint: cleanText(query.searchFingerprint),
    })}`,
    `access-${fingerprintCacheContext({
      query: cleanText(query.accessContextFingerprint),
      context: accessContext ?? null,
    })}`,
  ].join(':');
}

export function createRouteDiscoveryCache<T = RouteDiscoveryTrailPackResult>(
  options: { ttlMs?: number; staleMs?: number; maxEntries?: number } = {},
): RouteDiscoveryCache<T> {
  const entries = new Map<string, RouteDiscoveryCacheEntry<T>>();
  const ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const staleMs = options.staleMs ?? DEFAULT_CACHE_STALE_MS;
  const maxEntries = Math.max(1, Math.round(options.maxEntries ?? DEFAULT_CACHE_MAX_ENTRIES));
  return {
    ttlMs,
    staleMs,
    maxEntries,
    entries,
    get(key: string, nowMs = Date.now()) {
      const cached = entries.get(key);
      if (!cached) return { status: 'miss', result: null };
      const ageMs = Math.max(0, nowMs - cached.storedAtMs);
      if (ageMs <= ttlMs + staleMs) {
        entries.delete(key);
        entries.set(key, cached);
      }
      if (ageMs <= ttlMs) return { status: 'hit', result: cached.result };
      if (ageMs <= ttlMs + staleMs) return { status: 'stale', result: cached.result };
      entries.delete(key);
      return { status: 'miss', result: null };
    },
    set(key: string, result: T, nowMs = Date.now()) {
      entries.delete(key);
      entries.set(key, { result, storedAtMs: nowMs });
      while (entries.size > maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (typeof oldestKey !== 'string') break;
        entries.delete(oldestKey);
      }
    },
    clear() {
      entries.clear();
    },
  };
}

function confidenceBand(score: number): ECSTrailPackConfidence['band'] {
  if (score >= 90) return 'verified';
  if (score >= 70) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
}

function lightweightConfidence(
  pack: ECSTrailPack,
  input?: ECSTrailPackConfidenceInput,
): ECSTrailPackConfidence {
  const blockers = [
    ...(pack.catalogVerification?.blockers ?? []),
    ...(input?.feedbackBlockers ?? []),
    ...(input?.feedbackNeedsReview ? ['Trail Pack feedback requires review'] : []),
  ];
  const warnings = [
    ...(pack.catalogVerification?.warnings ?? []),
    ...(input?.recentHazardReportsCount ? ['Recent hazard reports need review'] : []),
  ];
  const baseScore = pack.catalogVerification?.confidenceScore ?? pack.confidenceScore ?? 0;
  const score = Math.max(0, Math.min(100, Math.round(baseScore - blockers.length * 18 - warnings.length * 3)));
  return {
    score,
    band: confidenceBand(score),
    reasons: pack.confidenceReasons?.length ? pack.confidenceReasons : [pack.catalogVerification?.sourceLabel ?? 'Indexed route confidence'],
    warnings,
    blockers,
    lastEvaluatedAt: new Date(0).toISOString(),
  };
}

function shouldPromoteIndexedTrailPack(
  pack: ECSTrailPack,
  confidence: ECSTrailPackConfidence,
  includeBroaderResults: boolean,
): boolean {
  if (pack.catalogVerification?.publicRecommendation === true && confidence.blockers.length === 0) return true;
  if (includeBroaderResults) return confidence.blockers.length === 0 && confidence.band !== 'low';
  return confidence.blockers.length === 0 && (confidence.band === 'verified' || confidence.band === 'high');
}

function trailPackFromEntry(
  index: RouteDiscoveryIndex,
  entry: RouteDiscoveryIndexEntry,
  options: {
    includeOwnDrafts?: boolean;
    ownTrailPackIds?: string[];
    includeBroaderResults?: boolean;
    confidenceInputsByTrailPackId?: Record<string, ECSTrailPackConfidenceInput>;
    reviewStatesByTrailPackId?: Record<string, ECSTrailPackReviewState>;
  } = {},
): ECSTrailPackDiscoveryItem | null {
  const ownTrailPackIds = new Set(options.ownTrailPackIds ?? []);
  const pack = index.routeById.get(entry.routeId);
  if (!pack) return null;
  const reviewState = options.reviewStatesByTrailPackId?.[pack.id];
  const publicOrOwn =
    isTrailPackPubliclyDiscoverable(pack, reviewState) ||
    (!!options.includeOwnDrafts && ownTrailPackIds.has(pack.id));
  if (!publicOrOwn) return null;
  const evaluatedConfidence = lightweightConfidence(pack, options.confidenceInputsByTrailPackId?.[pack.id]);
  if (
    !ownTrailPackIds.has(pack.id) &&
    !shouldPromoteIndexedTrailPack(pack, evaluatedConfidence, !!options.includeBroaderResults)
  ) {
    return null;
  }
  return {
    ...pack,
    confidenceScore: evaluatedConfidence.score,
    confidenceReasons: evaluatedConfidence.reasons,
    distanceFromUserMiles: entry.distanceFromUserMiles ?? pack.searchDistanceMiles ?? 0,
    evaluatedConfidence,
  };
}

function trailPacksFromEntries(
  index: RouteDiscoveryIndex,
  entries: RouteDiscoveryIndexEntry[],
  options: Parameters<typeof trailPackFromEntry>[2] = {},
): ECSTrailPackDiscoveryItem[] {
  return entries
    .map((entry) => trailPackFromEntry(index, entry, options))
    .filter((pack): pack is ECSTrailPackDiscoveryItem => !!pack);
}

function buildTrailPackResult(
  index: RouteDiscoveryIndex,
  query: RouteDiscoveryIndexQuery,
  options: Parameters<typeof trailPacksFromEntries>[2],
  cacheStatus: RouteDiscoveryIndexResult['cacheStatus'],
  shouldRevalidate = false,
  cacheKey?: string,
): RouteDiscoveryTrailPackResult {
  const selected = selectRouteDiscoveryEntries(index, query);
  const publicEntries: RouteDiscoveryIndexEntry[] = [];
  const allTrailPacks: ECSTrailPackDiscoveryItem[] = [];
  selected.forEach((entry) => {
    const trailPack = trailPackFromEntry(index, entry, options);
    if (!trailPack) return;
    publicEntries.push(entry);
  });
  const batched = batchEntries(publicEntries, query, cacheStatus, shouldRevalidate, cacheKey);
  allTrailPacks.push(...trailPacksFromEntries(index, batched.allItems, options));
  return {
    ...batched,
    trailPacks: trailPacksFromEntries(index, batched.items, options),
    allTrailPacks,
  };
}

function capCachedTrailPackResult(
  result: RouteDiscoveryTrailPackResult,
): RouteDiscoveryTrailPackResult {
  const allItems = capUniqueRankedRoutes(result.allItems, (entry) => entry.routeId);
  const allowedIds = new Set(allItems.map((entry) => entry.routeId));
  const items = capUniqueRankedRoutes(
    result.items.filter((entry) => allowedIds.has(entry.routeId)),
    (entry) => entry.routeId,
  );
  const allTrailPacks = capUniqueRankedRoutes(
    result.allTrailPacks.filter((pack) => allowedIds.has(pack.id)),
    (pack) => pack.id,
  );
  const visibleIds = new Set(items.map((entry) => entry.routeId));
  const trailPacks = capUniqueRankedRoutes(
    result.trailPacks.filter((pack) => visibleIds.has(pack.id)),
    (pack) => pack.id,
  );
  const batchSize = normalizeRouteSearchResultLimit(result.batchSize);
  const nextOffset = result.offset + items.length;
  return {
    ...result,
    items,
    allItems,
    trailPacks,
    allTrailPacks,
    batchSize,
    nextCursor: nextOffset < allItems.length ? nextOffset : null,
  };
}

export function queryTrailPackDiscoveryIndexCached(
  index: RouteDiscoveryIndex,
  query: RouteDiscoveryIndexQuery,
  options: {
    cache?: RouteDiscoveryCache<RouteDiscoveryTrailPackResult>;
    nowMs?: number;
    includeOwnDrafts?: boolean;
    ownTrailPackIds?: string[];
    includeBroaderResults?: boolean;
    confidenceInputsByTrailPackId?: Record<string, ECSTrailPackConfidenceInput>;
    reviewStatesByTrailPackId?: Record<string, ECSTrailPackReviewState>;
  } = {},
): RouteDiscoveryTrailPackResult {
  const cache = options.cache;
  const cacheKey = createRouteDiscoveryCacheKey(
    index,
    query,
    routeDiscoveryAccessCacheContext(options),
  );
  if (cache) {
    const cached = cache.get(cacheKey, options.nowMs);
    if (cached.result) {
      const cappedCachedResult = capCachedTrailPackResult(cached.result);
      return {
        ...cappedCachedResult,
        cacheStatus: cached.status,
        shouldRevalidate: cached.status === 'stale',
        cacheKey,
      };
    }
  }

  const fresh = buildTrailPackResult(index, query, options, cache ? 'miss' : 'uncached', false, cacheKey);
  cache?.set(cacheKey, fresh, options.nowMs);
  return fresh;
}

export function revalidateTrailPackDiscoveryIndexCache(
  index: RouteDiscoveryIndex,
  query: RouteDiscoveryIndexQuery,
  options: {
    cache: RouteDiscoveryCache<RouteDiscoveryTrailPackResult>;
    nowMs?: number;
    includeOwnDrafts?: boolean;
    ownTrailPackIds?: string[];
    includeBroaderResults?: boolean;
    confidenceInputsByTrailPackId?: Record<string, ECSTrailPackConfidenceInput>;
    reviewStatesByTrailPackId?: Record<string, ECSTrailPackReviewState>;
  },
): { updated: boolean; result: RouteDiscoveryTrailPackResult } {
  const cacheKey = createRouteDiscoveryCacheKey(
    index,
    query,
    routeDiscoveryAccessCacheContext(options),
  );
  const previous = options.cache.entries.get(cacheKey)?.result ?? null;
  const fresh = buildTrailPackResult(index, query, options, 'refresh', false, cacheKey);
  const previousIds = previous?.allItems.map((entry) => entry.routeId).join('|') ?? '';
  const freshIds = fresh.allItems.map((entry) => entry.routeId).join('|');
  const updated = previousIds !== freshIds;
  options.cache.set(cacheKey, fresh, options.nowMs);
  return { updated, result: fresh };
}

export function createRouteDiscoveryImageCache(): RouteDiscoveryImageCache {
  const loadedUris = new Set<string>();
  const failedUris = new Set<string>();
  const pendingUris = new Set<string>();
  return {
    loadedUris,
    failedUris,
    pendingUris,
    markLoaded(uri) {
      if (!uri) return;
      pendingUris.delete(uri);
      failedUris.delete(uri);
      loadedUris.add(uri);
    },
    markFailed(uri) {
      if (!uri) return;
      pendingUris.delete(uri);
      loadedUris.delete(uri);
      failedUris.add(uri);
    },
    markPending(uri) {
      if (!uri || loadedUris.has(uri) || failedUris.has(uri)) return;
      pendingUris.add(uri);
    },
    status(uri) {
      if (!uri) return 'missing';
      if (loadedUris.has(uri)) return 'loaded';
      if (failedUris.has(uri)) return 'failed';
      if (pendingUris.has(uri)) return 'pending';
      return 'missing';
    },
  };
}

export function planRouteDiscoveryImagePrefetch(
  entries: RouteDiscoveryIndexEntry[],
  options: {
    imageCache: RouteDiscoveryImageCache;
    visibleCount: number;
    prefetchCount?: number;
  },
): {
  prefetchUris: string[];
  placeholderVisible: boolean;
  textAndMetadataFirst: boolean;
} {
  const prefetchCount = Math.max(0, Math.round(options.prefetchCount ?? 4));
  const visibleCount = Math.max(0, Math.round(options.visibleCount));
  const prefetchUris: string[] = [];
  entries.slice(visibleCount).some((entry) => {
    const uri = entry.thumbnail?.uri ?? null;
    if (!uri || options.imageCache.status(uri) === 'loaded' || options.imageCache.status(uri) === 'failed') {
      return false;
    }
    if (!prefetchUris.includes(uri)) prefetchUris.push(uri);
    return prefetchUris.length >= prefetchCount;
  });
  return {
    prefetchUris,
    placeholderVisible: true,
    textAndMetadataFirst: true,
  };
}

export const routeDiscoveryCache = createRouteDiscoveryCache<RouteDiscoveryTrailPackResult>();
export const routeDiscoveryImageCache = createRouteDiscoveryImageCache();

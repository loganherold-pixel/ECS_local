import { supabase } from '../supabase';
import {
  getRouteCatalogCoverageState,
  normalizeRouteCatalogDetailResponse,
  normalizeRouteCatalogSearchResponse,
  type RouteCatalogCoverageState,
} from './routeCatalog';
import type {
  ECSTrailPack,
  ECSTrailPackCoordinate,
  ECSTrailPackDifficulty,
  ECSTrailPackReviewStatus,
  ECSTrailPackRouteGeometry,
  ECSTrailPackRouteType,
  ECSTrailPackSource,
} from './trailPacks';

export type LiveTrailPackCatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

export type LiveTrailPackCatalogSearchCriteria = {
  latitude?: number | null;
  longitude?: number | null;
  radiusMiles?: number | null;
  vehicleClass?: string | null;
  minDistanceMiles?: number | null;
  maxDistanceMiles?: number | null;
  minDurationMinutes?: number | null;
  maxDurationMinutes?: number | null;
  routeType?: ECSTrailPackRouteType | string | null;
  difficulty?: ECSTrailPackDifficulty | string | null;
  minConfidenceScore?: number | null;
  minRemotenessScore?: number | null;
  maxRemotenessScore?: number | null;
  minCampabilityScore?: number | null;
  availableFuelRangeMiles?: number | null;
  availableWaterCapacityGallons?: number | null;
  locationSource?: 'live_gps' | 'default_location' | string | null;
  limit?: number;
};

export type LiveTrailPackCatalogSnapshot = {
  trailPacks: ECSTrailPack[];
  status: LiveTrailPackCatalogStatus;
  error: string | null;
  lastLoadedAt: string | null;
  coverageState: RouteCatalogCoverageState;
  source: 'route_catalog' | 'trail_packs_fallback' | 'unavailable';
};

type Listener = () => void;

const listeners = new Set<Listener>();
let refreshRequestSequence = 0;
let snapshot: LiveTrailPackCatalogSnapshot = {
  trailPacks: [],
  status: 'idle',
  error: null,
  lastLoadedAt: null,
  coverageState: getRouteCatalogCoverageState([], { userHasCriteria: false }),
  source: 'unavailable',
};

const TRAIL_PACK_SELECT = [
  'id',
  'public_id',
  'name',
  'description',
  'source',
  'route_type',
  'center_latitude',
  'center_longitude',
  'route_geometry',
  'distance_miles',
  'estimated_duration_minutes',
  'difficulty',
  'vehicle_fit',
  'confidence_score',
  'confidence_reasons',
  'last_verified_at',
  'positive_feedback_count',
  'negative_feedback_count',
  'completion_count',
  'review_status',
  'tags',
  'created_at',
  'updated_at',
].join(',');

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number != null && number > 0 ? number : undefined;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanVehicleClass(value: unknown): string | undefined {
  return cleanText(value);
}

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

function setSnapshot(next: LiveTrailPackCatalogSnapshot): LiveTrailPackCatalogSnapshot {
  snapshot = next;
  emit();
  return liveTrailPackCatalogStore.getSnapshot();
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSource(value: unknown): ECSTrailPackSource {
  const source = String(value ?? '').trim();
  if (
    source === 'ecs_submitted' ||
    source === 'community_reviewed' ||
    source === 'ecs_validated' ||
    source === 'imported_gpx' ||
    source === 'imported_kml' ||
    source === 'partner_source' ||
    source === 'needs_review'
  ) {
    return source;
  }
  return 'needs_review';
}

function normalizeRouteType(value: unknown): ECSTrailPackRouteType {
  const routeType = String(value ?? '').trim();
  if (
    routeType === 'loop' ||
    routeType === 'out_and_back' ||
    routeType === 'point_to_point' ||
    routeType === 'area_pack' ||
    routeType === 'unknown'
  ) {
    return routeType;
  }
  return 'unknown';
}

function normalizeDifficulty(value: unknown): ECSTrailPackDifficulty {
  const difficulty = String(value ?? '').trim();
  if (
    difficulty === 'easy' ||
    difficulty === 'moderate' ||
    difficulty === 'technical' ||
    difficulty === 'extreme' ||
    difficulty === 'unknown'
  ) {
    return difficulty;
  }
  return 'unknown';
}

function normalizeReviewStatus(value: unknown): ECSTrailPackReviewStatus {
  const status = String(value ?? '').trim();
  if (
    status === 'draft' ||
    status === 'pending_review' ||
    status === 'approved' ||
    status === 'rejected' ||
    status === 'needs_more_data'
  ) {
    return status;
  }
  return 'needs_more_data';
}

function isCoordinate(value: unknown): value is ECSTrailPackCoordinate {
  const record = readRecord(value);
  if (!record) return false;
  const latitude = Number(record.latitude ?? record.lat);
  const longitude = Number(record.longitude ?? record.lng ?? record.lon);
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

function normalizeCoordinate(value: unknown): ECSTrailPackCoordinate | null {
  if (!isCoordinate(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    latitude: Number(record.latitude ?? record.lat),
    longitude: Number(record.longitude ?? record.lng ?? record.lon),
  };
}

function normalizeCoordinatePair(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  ) {
    return [longitude, latitude];
  }
  return null;
}

function normalizeGeometry(value: unknown): ECSTrailPackRouteGeometry | undefined {
  const parsed = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      })()
    : value;
  const record = readRecord(parsed);
  if (!record) return undefined;

  if (record.type === 'LineString' && Array.isArray(record.coordinates)) {
    const coordinates = record.coordinates
      .map(normalizeCoordinatePair)
      .filter((point): point is number[] => !!point);
    return coordinates.length >= 2 ? { type: 'LineString', coordinates } : undefined;
  }

  if (record.type === 'MultiLineString' && Array.isArray(record.coordinates)) {
    const coordinates = record.coordinates
      .map((line) =>
        Array.isArray(line)
          ? line.map(normalizeCoordinatePair).filter((point): point is number[] => !!point)
          : [],
      )
      .filter((line) => line.length >= 2);
    return coordinates.length > 0 ? { type: 'MultiLineString', coordinates } : undefined;
  }

  return undefined;
}

function centerFromGeometry(geometry: ECSTrailPackRouteGeometry | undefined): ECSTrailPackCoordinate | null {
  if (!geometry) return null;
  const rawCoordinates = geometry.type === 'MultiLineString'
    ? (geometry.coordinates as number[][][]).flat()
    : (geometry.coordinates as number[][]);
  if (rawCoordinates.length === 0) return null;
  const totals = rawCoordinates.reduce(
    (acc, coordinate) => ({
      latitude: acc.latitude + Number(coordinate[1]),
      longitude: acc.longitude + Number(coordinate[0]),
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: totals.latitude / rawCoordinates.length,
    longitude: totals.longitude / rawCoordinates.length,
  };
}

export function normalizeLiveTrailPackRecord(value: unknown): ECSTrailPack | null {
  const record = readRecord(value);
  if (!record) return null;

  const id = readString(record, 'public_id', 'publicId', 'id');
  const name = readString(record, 'name', 'title');
  if (!id || !name) return null;

  const routeGeometry = normalizeGeometry(record.route_geometry ?? record.routeGeometry);
  const centerCoordinate =
    normalizeCoordinate(record.center_coordinate ?? record.centerCoordinate) ??
    (() => {
      const latitude = readNumber(record, 'center_latitude', 'centerLatitude', 'latitude', 'lat');
      const longitude = readNumber(record, 'center_longitude', 'centerLongitude', 'longitude', 'lng', 'lon');
      return latitude != null && longitude != null
        ? { latitude, longitude }
        : null;
    })() ??
    centerFromGeometry(routeGeometry);
  if (!centerCoordinate) return null;

  const confidenceScore = readNumber(record, 'confidence_score', 'confidenceScore') ?? 0;
  const positiveFeedbackCount = readNumber(record, 'positive_feedback_count', 'positiveFeedbackCount') ?? 0;
  const negativeFeedbackCount = readNumber(record, 'negative_feedback_count', 'negativeFeedbackCount') ?? 0;
  const completionCount = readNumber(record, 'completion_count', 'completionCount') ?? 0;
  const createdAt = readString(record, 'created_at', 'createdAt') ?? new Date(0).toISOString();
  const updatedAt = readString(record, 'updated_at', 'updatedAt') ?? createdAt;

  return {
    id,
    name,
    description: readString(record, 'description'),
    source: normalizeSource(record.source),
    dataState: 'live',
    routeType: normalizeRouteType(record.route_type ?? record.routeType),
    centerCoordinate,
    routeGeometry,
    distanceMiles: readNumber(record, 'distance_miles', 'distanceMiles'),
    estimatedDurationMinutes: readNumber(record, 'estimated_duration_minutes', 'estimatedDurationMinutes'),
    difficulty: normalizeDifficulty(record.difficulty),
    vehicleFit: readStringArray(record.vehicle_fit ?? record.vehicleFit),
    remotenessScore: readNumber(record, 'remoteness_score', 'remotenessScore'),
    campabilityScore: readNumber(record, 'campability_score', 'campabilityScore'),
    minimumFuelRangeMiles: readNumber(
      record,
      'minimum_fuel_range_miles',
      'minimumFuelRangeMiles',
      'minFuelRangeMiles',
    ),
    minimumWaterCapacityGallons: readNumber(
      record,
      'minimum_water_capacity_gallons',
      'minimumWaterCapacityGallons',
      'minWaterCapacityGallons',
    ),
    routeIntelligence: readRecord(record.route_intelligence ?? record.routeIntelligence) ?? undefined,
    confidenceScore,
    confidenceReasons: readStringArray(record.confidence_reasons ?? record.confidenceReasons) ?? [
      'Loaded from the live ECS Trail Pack catalog.',
    ],
    lastVerifiedAt: readString(record, 'last_verified_at', 'lastVerifiedAt'),
    positiveFeedbackCount,
    negativeFeedbackCount,
    completionCount,
    reviewStatus: normalizeReviewStatus(record.review_status ?? record.reviewStatus),
    tags: readStringArray(record.tags),
    createdAt,
    updatedAt,
  };
}

export function normalizeLiveTrailPackRecords(records: unknown): ECSTrailPack[] {
  if (!Array.isArray(records)) return [];
  return records
    .map(normalizeLiveTrailPackRecord)
    .filter((pack): pack is ECSTrailPack => !!pack && pack.dataState === 'live' && pack.reviewStatus === 'approved');
}

export function buildRouteCatalogSearchBody(
  criteria: LiveTrailPackCatalogSearchCriteria = {},
): Record<string, unknown> {
  const latitude = finiteNumber(criteria.latitude);
  const longitude = finiteNumber(criteria.longitude);
  const radiusMiles = finiteNumber(criteria.radiusMiles);
  const vehicleClass = cleanVehicleClass(criteria.vehicleClass);
  const minDistanceMiles = finiteNumber(criteria.minDistanceMiles);
  const maxDistanceMiles = finiteNumber(criteria.maxDistanceMiles);
  const minDurationMinutes = finiteNumber(criteria.minDurationMinutes);
  const maxDurationMinutes = finiteNumber(criteria.maxDurationMinutes);
  const minConfidenceScore = finiteNumber(criteria.minConfidenceScore);
  const minRemotenessScore = finiteNumber(criteria.minRemotenessScore);
  const maxRemotenessScore = finiteNumber(criteria.maxRemotenessScore);
  const minCampabilityScore = finiteNumber(criteria.minCampabilityScore);
  const availableFuelRangeMiles = positiveNumber(criteria.availableFuelRangeMiles);
  const availableWaterCapacityGallons = positiveNumber(criteria.availableWaterCapacityGallons);
  const routeType = cleanText(criteria.routeType);
  const difficulty = cleanText(criteria.difficulty);
  return {
    limit: criteria.limit ?? 200,
    includeGeometry: true,
    includeAssessment: true,
    recommendationOnly: true,
    ...(latitude != null && longitude != null && radiusMiles != null
      ? {
          latitude: criteria.latitude,
          longitude: criteria.longitude,
          radiusMiles: criteria.radiusMiles,
        }
      : {}),
    ...(vehicleClass ? { vehicleClass: criteria.vehicleClass } : {}),
    ...(minDistanceMiles != null ? { minDistanceMiles: criteria.minDistanceMiles } : {}),
    ...(maxDistanceMiles != null ? { maxDistanceMiles: criteria.maxDistanceMiles } : {}),
    ...(minDurationMinutes != null ? { minDurationMinutes: criteria.minDurationMinutes } : {}),
    ...(maxDurationMinutes != null ? { maxDurationMinutes: criteria.maxDurationMinutes } : {}),
    ...(routeType ? { routeType: criteria.routeType } : {}),
    ...(difficulty ? { difficulty: criteria.difficulty } : {}),
    ...(minConfidenceScore != null ? { minConfidenceScore: criteria.minConfidenceScore } : {}),
    ...(minRemotenessScore != null ? { minRemotenessScore: criteria.minRemotenessScore } : {}),
    ...(maxRemotenessScore != null ? { maxRemotenessScore: criteria.maxRemotenessScore } : {}),
    ...(minCampabilityScore != null ? { minCampabilityScore: criteria.minCampabilityScore } : {}),
    ...(availableFuelRangeMiles != null ? { availableFuelRangeMiles: criteria.availableFuelRangeMiles } : {}),
    ...(availableWaterCapacityGallons != null
      ? { availableWaterCapacityGallons: criteria.availableWaterCapacityGallons }
      : {}),
    ...(typeof criteria.locationSource === 'string' && criteria.locationSource.trim().length > 0
      ? { locationSource: criteria.locationSource }
      : {}),
  };
}

async function fetchRouteCatalogTrailPacks(criteria: LiveTrailPackCatalogSearchCriteria = {}): Promise<{
  trailPacks: ECSTrailPack[];
  coverageState: RouteCatalogCoverageState;
}> {
  const { data, error } = await supabase.functions.invoke('route-catalog-search', {
    body: buildRouteCatalogSearchBody(criteria),
  });

  if (error) {
    throw new Error(error.message || 'Verified route catalog unavailable.');
  }

  const normalized = normalizeRouteCatalogSearchResponse(data);
  return {
    trailPacks: normalized.trailPacks,
    coverageState: normalized.coverageState,
  };
}

export async function fetchRouteCatalogTrailPackDetail(trailPack: ECSTrailPack | string): Promise<ECSTrailPack> {
  const routeId = typeof trailPack === 'string' ? trailPack : trailPack.id;
  const { data, error } = await supabase.functions.invoke('route-catalog-detail', {
    body: {
      id: routeId,
      publicId: routeId,
      includeGeometry: true,
      includeAssessment: true,
      includeOfflineCache: true,
    },
  });

  if (error) {
    throw new Error(error.message || 'Verified route detail unavailable.');
  }

  const normalized = normalizeRouteCatalogDetailResponse(
    data,
    typeof trailPack === 'string' ? undefined : trailPack,
  );
  if (!normalized) {
    throw new Error('Verified route detail unavailable.');
  }
  return normalized;
}

async function fetchLegacyTrailPacks(): Promise<ECSTrailPack[]> {
  const { data, error } = await supabase
    .from('trail_packs')
    .select(TRAIL_PACK_SELECT)
    .eq('review_status', 'approved')
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message || 'Live Trail Pack catalog unavailable.');
  }

  return normalizeLiveTrailPackRecords(data);
}

export async function refreshLiveTrailPackCatalog(
  criteria: LiveTrailPackCatalogSearchCriteria = {},
): Promise<LiveTrailPackCatalogSnapshot> {
  const requestId = refreshRequestSequence + 1;
  refreshRequestSequence = requestId;
  setSnapshot({
    ...snapshot,
    status: 'loading',
    error: null,
  });

  const loadedAt = new Date().toISOString();
  let routeCatalogError: Error | null = null;

  try {
    const routeCatalog = await fetchRouteCatalogTrailPacks(criteria);
    if (requestId !== refreshRequestSequence) return liveTrailPackCatalogStore.getSnapshot();
    return setSnapshot({
      trailPacks: routeCatalog.trailPacks,
      status: 'ready',
      error: null,
      lastLoadedAt: loadedAt,
      coverageState: routeCatalog.coverageState,
      source: 'route_catalog',
    });
  } catch (error) {
    if (requestId !== refreshRequestSequence) return liveTrailPackCatalogStore.getSnapshot();
    routeCatalogError = error instanceof Error ? error : new Error('Verified route catalog unavailable.');
  }

  try {
    const legacyTrailPacks = await fetchLegacyTrailPacks();
    if (requestId !== refreshRequestSequence) return liveTrailPackCatalogStore.getSnapshot();
    return setSnapshot({
      trailPacks: legacyTrailPacks,
      status: 'ready',
      error: routeCatalogError.message,
      lastLoadedAt: loadedAt,
      coverageState: getRouteCatalogCoverageState(legacyTrailPacks, { userHasCriteria: false }),
      source: 'trail_packs_fallback',
    });
  } catch (error) {
    if (requestId !== refreshRequestSequence) return liveTrailPackCatalogStore.getSnapshot();
    return setSnapshot({
      trailPacks: [],
      status: 'error',
      error: error instanceof Error ? error.message : routeCatalogError.message,
      lastLoadedAt: loadedAt,
      coverageState: getRouteCatalogCoverageState([], { unavailable: true }),
      source: 'unavailable',
    });
  }
}

export const liveTrailPackCatalogStore = {
  getSnapshot(): LiveTrailPackCatalogSnapshot {
    return {
      trailPacks: [...snapshot.trailPacks],
      status: snapshot.status,
      error: snapshot.error,
      lastLoadedAt: snapshot.lastLoadedAt,
      coverageState: snapshot.coverageState,
      source: snapshot.source,
    };
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  refresh: refreshLiveTrailPackCatalog,
};

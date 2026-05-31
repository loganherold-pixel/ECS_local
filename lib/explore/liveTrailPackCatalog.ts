import { supabase } from '../supabase';
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

export type LiveTrailPackCatalogSnapshot = {
  trailPacks: ECSTrailPack[];
  status: LiveTrailPackCatalogStatus;
  error: string | null;
  lastLoadedAt: string | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let snapshot: LiveTrailPackCatalogSnapshot = {
  trailPacks: [],
  status: 'idle',
  error: null,
  lastLoadedAt: null,
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

export async function refreshLiveTrailPackCatalog(): Promise<LiveTrailPackCatalogSnapshot> {
  setSnapshot({
    ...snapshot,
    status: 'loading',
    error: null,
  });

  try {
    const { data, error } = await supabase
      .from('trail_packs')
      .select(TRAIL_PACK_SELECT)
      .eq('review_status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(200);

    if (error) {
      throw new Error(error.message || 'Live Trail Pack catalog unavailable.');
    }

    return setSnapshot({
      trailPacks: normalizeLiveTrailPackRecords(data),
      status: 'ready',
      error: null,
      lastLoadedAt: new Date().toISOString(),
    });
  } catch (error) {
    return setSnapshot({
      trailPacks: [],
      status: 'error',
      error: error instanceof Error ? error.message : 'Live Trail Pack catalog unavailable.',
      lastLoadedAt: new Date().toISOString(),
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
    };
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  refresh: refreshLiveTrailPackCatalog,
};

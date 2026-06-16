import {
  createNewActiveTripRecord,
  expeditionTripRecordStore,
  finalizeCompletedTrip,
} from './expeditionTripRecordStore';
import {
  evaluateBadgesForCompletedTrip,
  getBadgesForTrip,
} from './expeditionBadgeStore';
import type {
  ExpeditionBadge,
  ExpeditionTripCoordinate,
  ExpeditionTripDataQuality,
  ExpeditionTripGuidanceSource,
  ExpeditionTripRecord,
  ExpeditionTripSourceLabel,
} from './expeditionTripRecordTypes';

export type CompletedGuidanceSummaryMaterializerInput = {
  completedExpeditionRecord?: unknown;
  routeCompleted?: boolean;
  routeLabel?: string | null;
  gpsElevationFt?: number | null;
};

export type CompletedGuidanceSummaryMaterializerResult = {
  created: boolean;
  trip: ExpeditionTripRecord | null;
  badges: ExpeditionBadge[];
  reason?: 'not_completed' | 'missing_record' | 'missing_id';
};

const METERS_PER_MILE = 1609.344;

function nowISO(): string {
  return new Date().toISOString();
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function readString(source: Record<string, unknown> | null, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readNumber(source: Record<string, unknown> | null, keys: string[]): number | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function safeIso(value: unknown, fallback = nowISO()): string {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const iso = new Date(value).toISOString();
    if (Number.isFinite(new Date(iso).getTime())) return iso;
  }
  return fallback;
}

function startedAtFromDuration(completedAt: string, durationSeconds: number | null): string {
  if (durationSeconds == null || durationSeconds <= 0) return completedAt;
  const completedMs = new Date(completedAt).getTime();
  if (!Number.isFinite(completedMs)) return completedAt;
  return new Date(completedMs - durationSeconds * 1000).toISOString();
}

function isFiniteCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function normalizeCoordinate(value: unknown, recordedAt: string): ExpeditionTripCoordinate | null {
  const source = asObject(value);
  if (!source) return null;
  const lat = readNumber(source, ['lat', 'latitude']);
  const lng = readNumber(source, ['lng', 'longitude', 'lon']);
  if (lat == null || lng == null || !isFiniteCoordinate(lat, lng)) return null;
  const elevationFt =
    readNumber(source, ['elevationFt', 'elevationFeet', 'altitudeFt']) ??
    (() => {
      const elevationM = readNumber(source, ['ele', 'ele_m', 'elevationM', 'altitudeM']);
      return elevationM == null ? null : elevationM * 3.28084;
    })();
  return {
    lat,
    lng,
    elevationFt: elevationFt == null ? null : Math.round(elevationFt),
    accuracyM: readNumber(source, ['accuracyM']),
    speedMph: readNumber(source, ['speedMph']),
    headingDeg: readNumber(source, ['headingDeg', 'bearing']),
    recordedAt: readString(source, ['recordedAt', 'timestamp']) ?? recordedAt,
  };
}

function readGeometry(record: Record<string, unknown>, completedAt: string, gpsElevationFt?: number | null): ExpeditionTripCoordinate[] {
  const raw =
    record.routeGeometry ??
    record.routePoints ??
    record.geometry ??
    record.coordinates ??
    record.points;
  if (!Array.isArray(raw)) return [];

  const normalized: ExpeditionTripCoordinate[] = [];
  for (const point of raw) {
    const coordinate = normalizeCoordinate(point, completedAt);
    if (!coordinate) continue;
    const previous = normalized[normalized.length - 1];
    if (
      previous &&
      previous.lat.toFixed(6) === coordinate.lat.toFixed(6) &&
      previous.lng.toFixed(6) === coordinate.lng.toFixed(6)
    ) {
      continue;
    }
    normalized.push(coordinate);
  }

  if (normalized.length > 0 && normalized.every((point) => point.elevationFt == null) && Number.isFinite(gpsElevationFt)) {
    return normalized.map((point, index) => (
      index === normalized.length - 1 ? { ...point, elevationFt: Math.round(Number(gpsElevationFt)) } : point
    ));
  }
  return normalized;
}

function distanceMilesFromRecord(record: Record<string, unknown>): number | null {
  const miles = readNumber(record, [
    'totalDistanceMiles',
    'distanceMiles',
    'completedMiles',
    'routeDistanceMiles',
    'totalDistance',
  ]);
  if (miles != null) return Math.max(0, miles);
  const meters = readNumber(record, ['distance', 'distanceMeters', 'distance_meters', 'totalDistanceMeters']);
  return meters == null ? null : Math.max(0, meters / METERS_PER_MILE);
}

function durationSecondsFromRecord(record: Record<string, unknown>): number | null {
  const seconds = readNumber(record, ['totalDurationSeconds', 'durationSeconds', 'durationSec', 'duration_seconds']);
  if (seconds != null) return Math.max(0, Math.round(seconds));
  const minutes = readNumber(record, ['durationMinutes', 'totalDurationMinutes']);
  return minutes == null ? null : Math.max(0, Math.round(minutes * 60));
}

function guidanceSourceFromRecord(record: Record<string, unknown>): ExpeditionTripGuidanceSource {
  const source = readString(record, ['guidanceSource', 'source']);
  if (source === 'road' || source === 'trail' || source === 'hybrid' || source === 'run' || source === 'unknown') {
    return source;
  }
  return 'unknown';
}

function sourceLabel(capturedAt: string): ExpeditionTripSourceLabel {
  return {
    source: 'dashboard_completed_guidance_summary',
    quality: 'estimated' satisfies ExpeditionTripDataQuality,
    capturedAt,
    note: 'Materialized from completed active guidance so Expedition Hub badge scoring can run.',
  };
}

function isCompletionVisible(record: Record<string, unknown>, routeCompleted?: boolean): boolean {
  const state = readString(record, ['state', 'status', 'lifecycle']);
  return Boolean(routeCompleted) ||
    state === 'complete' ||
    state === 'completed' ||
    state === 'arrived' ||
    state === 'ended';
}

function badgeIds(badges: ExpeditionBadge[]): Set<string> {
  return new Set(badges.map((badge) => `${badge.id}:${badge.unlockedTripId ?? ''}`));
}

function onlyNewBadges(before: Set<string>, after: ExpeditionBadge[]): ExpeditionBadge[] {
  return after.filter((badge) => !before.has(`${badge.id}:${badge.unlockedTripId ?? ''}`));
}

export async function materializeCompletedGuidanceSummary({
  completedExpeditionRecord,
  routeCompleted = false,
  routeLabel,
  gpsElevationFt,
}: CompletedGuidanceSummaryMaterializerInput): Promise<CompletedGuidanceSummaryMaterializerResult> {
  const record = asObject(completedExpeditionRecord);
  if (!record) return { created: false, trip: null, badges: [], reason: 'missing_record' };
  if (!isCompletionVisible(record, routeCompleted)) return { created: false, trip: null, badges: [], reason: 'not_completed' };

  const id = readString(record, ['id', 'tripId', 'routeId', 'activeRouteId', 'guidanceSessionId']);
  if (!id) return { created: false, trip: null, badges: [], reason: 'missing_id' };

  const existing = await expeditionTripRecordStore.getById(id);
  const beforeBadges = badgeIds(await getBadgesForTrip(id).catch(() => []));
  if (existing?.status === 'completed') {
    const evaluated = await evaluateBadgesForCompletedTrip(existing.id).catch(() => []);
    const currentTripBadges = await getBadgesForTrip(existing.id).catch(() => evaluated);
    return {
      created: false,
      trip: existing,
      badges: onlyNewBadges(beforeBadges, currentTripBadges.length > 0 ? currentTripBadges : evaluated),
    };
  }

  const completedAt = safeIso(
    record.completedAt ?? record.endedAt ?? record.updatedAt ?? record.lastUpdatedAt ?? record.timestamp,
  );
  const routeGeometry = readGeometry(record, completedAt, gpsElevationFt);
  const durationSeconds = durationSecondsFromRecord(record) ?? 0;
  const totalDistanceMiles = distanceMilesFromRecord(record);
  const title =
    readString(record, ['title', 'expeditionName', 'routeTitle', 'name', 'destination']) ??
    routeLabel?.trim() ??
    'Completed Expedition';
  const source = sourceLabel(completedAt);
  const activeTrip = existing?.status === 'active'
    ? existing
    : createNewActiveTripRecord({
        id,
        title,
        startedAt: startedAtFromDuration(completedAt, durationSeconds),
        startCoordinate: routeGeometry[0] ?? null,
        routeGeometry,
        plannedRouteGeometry: routeGeometry,
        guidanceSessionId: readString(record, ['guidanceSessionId', 'sessionId']) ?? id,
        guidanceSource: guidanceSourceFromRecord(record),
        routeId: readString(record, ['routeId', 'activeRouteId']) ?? id,
        routeTitle: title,
        routeSubtitle: readString(record, ['routeSubtitle', 'subtitle', 'destination']),
        dataSource: source,
      });

  const completedTrip = finalizeCompletedTrip(activeTrip, {
    completedAt,
    totalDistanceMiles,
    totalDurationSeconds: durationSeconds,
    endCoordinate: routeGeometry[routeGeometry.length - 1] ?? activeTrip.endCoordinate,
    routeGeometry: routeGeometry.length > 0 ? routeGeometry : activeTrip.routeGeometry,
    plannedRouteGeometry: routeGeometry.length > 0 ? routeGeometry : activeTrip.plannedRouteGeometry,
    statusLabel: 'Guidance completed',
    dataSource: source,
    generatedSummary: {
      text: `${title} completed and archived from active guidance.`,
      generatedAt: completedAt,
      source,
    },
  });

  const savedTrip = await expeditionTripRecordStore.save({
    ...completedTrip,
    title,
    totalDistanceMiles: totalDistanceMiles ?? completedTrip.totalDistanceMiles,
    totalDurationSeconds: durationSeconds || completedTrip.totalDurationSeconds,
    maxElevationFt: readNumber(record, ['maxElevationFt', 'highestElevationFt']) ?? completedTrip.maxElevationFt,
  });
  const evaluated = await evaluateBadgesForCompletedTrip(savedTrip.id).catch(() => []);
  const currentTripBadges = await getBadgesForTrip(savedTrip.id).catch(() => evaluated);
  return {
    created: true,
    trip: savedTrip,
    badges: onlyNewBadges(beforeBadges, currentTripBadges.length > 0 ? currentTripBadges : evaluated),
  };
}

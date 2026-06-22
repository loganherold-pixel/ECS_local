import { createMigratingNonSecureStorage } from '../nonSecureStorage';
import {
  classifyGpsSampleForMotion,
  type MapMotionGpsSample,
} from '../mapMotion';
import { generateExpeditionRecap } from './expeditionRecapEngine';
import type {
  ExpeditionRecap,
  ExpeditionTripBounds,
  ExpeditionTripCoordinate,
  ExpeditionTripCreateInput,
  ExpeditionTripDataQuality,
  ExpeditionTripDeviation,
  ExpeditionTripFinalizeInput,
  ExpeditionTripGeneratedSummary,
  ExpeditionTripGuidanceSnapshot,
  ExpeditionTripGuidanceSource,
  ExpeditionTripNotableMoment,
  ExpeditionTripRecord,
  ExpeditionTripSourceLabel,
  ExpeditionTripStatsUpdateInput,
  ExpeditionTripStatus,
  ExpeditionTripSummary,
} from './expeditionTripRecordTypes';

const STORAGE_KEY = 'ecs_expedition_trip_records_v1';
const STORAGE_VERSION = 1;
const TRIP_SCHEMA_VERSION = 'ecs.expedition.trip.v1';
const RECAP_SCHEMA_VERSION = 'ecs.expedition.recap.v1';
const BADGE_UNLOCK_SCHEMA_VERSION = 'ecs.expedition.badge-unlock.v1';
const INSIGHT_SCHEMA_VERSION = 'ecs.expedition.insight.v1';
const REPORT_SCHEMA_VERSION = 'ecs.expedition.report.v1';
const PERSONAL_RECORD_SCHEMA_VERSION = 'ecs.expedition.personal-record.v1';
const MAX_ROUTE_POINTS = 2500;
const MAX_NOTABLE_MOMENTS = 200;
const MAX_DEVIATIONS = 150;
const MAX_DATA_USED = 80;
const ROUTE_DEVIATION_EVENT_SUPPRESSION_MS = 10 * 60 * 1000;
const tripRecordStorage = createMigratingNonSecureStorage('ecs_expedition_trip_records', {
  logTag: 'ExpeditionTripRecordStore',
});

interface PersistedExpeditionTripRecords {
  version: number;
  records: ExpeditionTripRecord[];
  activeTripId: string | null;
}

let hydratedSnapshot: PersistedExpeditionTripRecords | null = null;
let hydrationPromise: Promise<PersistedExpeditionTripRecords> | null = null;
let guidanceTrackingQueue: Promise<ExpeditionTripRecord | null> = Promise.resolve(null);

export function getTripSchemaVersion(): string {
  return TRIP_SCHEMA_VERSION;
}

export function getExpeditionSchemaMigrationHooks(): Record<string, string> {
  return {
    currentTripSchema: TRIP_SCHEMA_VERSION,
    recapSchema: RECAP_SCHEMA_VERSION,
    badgeUnlockSchema: BADGE_UNLOCK_SCHEMA_VERSION,
    insightSchema: INSIGHT_SCHEMA_VERSION,
    reportSchema: REPORT_SCHEMA_VERSION,
    personalRecordsSchema: PERSONAL_RECORD_SCHEMA_VERSION,
  };
}

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(prefix = 'trip'): string {
  const cryptoRef = typeof crypto !== 'undefined' ? crypto : null;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultSource(source: string, quality: ExpeditionTripDataQuality = 'live'): ExpeditionTripSourceLabel {
  return {
    source,
    quality,
    capturedAt: nowISO(),
  };
}

function isFiniteCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function normalizeCoordinate(input: unknown, recordedAt?: string | null): ExpeditionTripCoordinate | null {
  const value = input as Partial<ExpeditionTripCoordinate> & {
    latitude?: number;
    longitude?: number;
    altitudeFt?: number | null;
    ele?: number | null;
    ele_m?: number | null;
    elevationFeet?: number | null;
    accuracyM?: number | null;
    speedMph?: number | null;
    headingDeg?: number | null;
  } | null | undefined;
  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude);
  if (!isFiniteCoordinate(lat, lng)) return null;

  const elevationFeet = Number(value?.elevationFt ?? value?.elevationFeet ?? value?.altitudeFt);
  const elevationMeters = Number(value?.ele ?? value?.ele_m);
  const elevationFt = Number.isFinite(elevationFeet)
    ? elevationFeet
    : Number.isFinite(elevationMeters)
      ? elevationMeters * 3.28084
      : null;

  return {
    lat,
    lng,
    elevationFt: elevationFt == null ? null : Math.round(elevationFt),
    accuracyM: finiteNumberOrNull(value?.accuracyM),
    speedMph: finiteNumberOrNull(value?.speedMph),
    headingDeg: finiteNumberOrNull(value?.headingDeg),
    recordedAt: value?.recordedAt ?? recordedAt ?? null,
  };
}

function normalizeGeometry(points: unknown, recordedAt?: string | null): ExpeditionTripCoordinate[] {
  if (!Array.isArray(points)) return [];
  const normalized: ExpeditionTripCoordinate[] = [];
  for (const point of points) {
    const coordinate = normalizeCoordinate(point, recordedAt);
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
  return downsampleGeometry(normalized);
}

function downsampleGeometry(points: ExpeditionTripCoordinate[], maxPoints = MAX_ROUTE_POINTS): ExpeditionTripCoordinate[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const sampled = points.filter((_, index) => index === 0 || index === points.length - 1 || index % step === 0);
  return sampled[sampled.length - 1] === points[points.length - 1]
    ? sampled
    : [...sampled, points[points.length - 1]];
}

function computeBounds(points: ExpeditionTripCoordinate[]): ExpeditionTripBounds | null {
  if (points.length === 0) return null;
  return points.reduce<ExpeditionTripBounds>(
    (bounds, point) => ({
      north: Math.max(bounds.north, point.lat),
      south: Math.min(bounds.south, point.lat),
      east: Math.max(bounds.east, point.lng),
      west: Math.min(bounds.west, point.lng),
    }),
    { north: points[0].lat, south: points[0].lat, east: points[0].lng, west: points[0].lng },
  );
}

function distanceMiles(a: ExpeditionTripCoordinate, b: ExpeditionTripCoordinate): number {
  const earthRadiusMiles = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function computeDistanceMiles(points: ExpeditionTripCoordinate[]): number | null {
  if (points.length < 2) return null;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceMiles(points[index - 1], points[index]);
  }
  return Math.round(total * 100) / 100;
}

function computeElevationStats(points: ExpeditionTripCoordinate[]): {
  minElevationFt: number | null;
  maxElevationFt: number | null;
  totalElevationGainFt: number | null;
} {
  const elevations = points
    .map((point) => point.elevationFt)
    .filter((value): value is number => Number.isFinite(value));
  if (elevations.length === 0) {
    return { minElevationFt: null, maxElevationFt: null, totalElevationGainFt: null };
  }

  let gain = 0;
  let previous: number | null = null;
  for (const elevation of elevations) {
    if (previous != null && elevation > previous) gain += elevation - previous;
    previous = elevation;
  }

  return {
    minElevationFt: Math.round(Math.min(...elevations)),
    maxElevationFt: Math.round(Math.max(...elevations)),
    totalElevationGainFt: Math.round(gain),
  };
}

function secondsBetween(startedAt: string | null | undefined, endedAt: string): number | null {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

function mergeDataUsed(
  existing: ExpeditionTripSourceLabel[],
  source: ExpeditionTripSourceLabel | null | undefined,
): ExpeditionTripSourceLabel[] {
  if (!source) return existing;
  const signature = `${source.source}:${source.quality}:${source.capturedAt}`;
  const alreadyUsed = existing.some((item) => `${item.source}:${item.quality}:${item.capturedAt}` === signature);
  if (alreadyUsed) return existing;
  return [...existing, source].slice(-MAX_DATA_USED);
}

function deriveDistanceFromGuidance(
  snapshot: ExpeditionTripGuidanceSnapshot,
  routeGeometry: ExpeditionTripCoordinate[],
): number | null {
  const routeDistance = computeDistanceMiles(routeGeometry);
  if (routeDistance != null) return routeDistance;

  if (
    snapshot.remainingDistanceM != null &&
    snapshot.progressPercent != null &&
    snapshot.progressPercent > 0 &&
    snapshot.progressPercent < 100
  ) {
    const remainingMiles = snapshot.remainingDistanceM / 1609.344;
    return Math.round((remainingMiles / (1 - snapshot.progressPercent / 100)) * 100) / 100;
  }

  return null;
}

function finiteNumberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function safeDateString(value: unknown): string | null {
  const normalized = nullableString(value);
  if (!normalized) return null;
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? normalized : null;
}

function dateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function latestRouteDeviation(record: ExpeditionTripRecord): ExpeditionTripDeviation | null {
  let latest: ExpeditionTripDeviation | null = null;
  let latestMs: number | null = null;
  for (const deviation of record.deviations) {
    const deviationMs = dateMs(deviation.capturedAt);
    if (deviationMs == null) continue;
    if (latestMs == null || deviationMs > latestMs) {
      latest = deviation;
      latestMs = deviationMs;
    }
  }
  return latest;
}

function shouldStoreRouteDeviation(record: ExpeditionTripRecord, timestamp: string): boolean {
  const currentMs = dateMs(timestamp);
  if (currentMs == null) return true;
  const latest = latestRouteDeviation(record);
  const latestMs = dateMs(latest?.capturedAt);
  if (latestMs == null) return true;
  return currentMs - latestMs > ROUTE_DEVIATION_EVENT_SUPPRESSION_MS;
}

function shouldGenerateFallbackRecap(record: ExpeditionTripRecord): boolean {
  if (record.status !== 'completed' || record.recap || !record.completedAt) return false;
  return (
    record.routeGeometry.length > 0 ||
    record.totalDistanceMiles != null ||
    record.totalDurationSeconds != null ||
    record.maxElevationFt != null
  );
}

function logTripMigrationIssue(message: string, metadata?: Record<string, unknown>): void {
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(`[ExpeditionTripRecordStore] ${message}`, metadata ?? {});
  }
}

function safeGenerateExpeditionRecap(
  record: ExpeditionTripRecord,
  generatedAt: string,
): ExpeditionRecap | null {
  try {
    return generateExpeditionRecap(record, generatedAt);
  } catch (error) {
    logTripMigrationIssue('Expedition recap generation failed; preserving trip completion.', {
      tripId: record.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function normalizeTripStatus(value: unknown, completedAt: string | null): ExpeditionTripStatus {
  if (
    value === 'planned' ||
    value === 'active' ||
    value === 'completed' ||
    value === 'cancelled' ||
    value === 'archived'
  ) {
    return value;
  }
  return completedAt ? 'completed' : 'active';
}

function normalizeBounds(value: unknown, routeGeometry: ExpeditionTripCoordinate[]): ExpeditionTripBounds | null {
  const input = value as Partial<ExpeditionTripBounds> | null | undefined;
  const north = Number(input?.north);
  const south = Number(input?.south);
  const east = Number(input?.east);
  const west = Number(input?.west);
  if (
    Number.isFinite(north) &&
    Number.isFinite(south) &&
    Number.isFinite(east) &&
    Number.isFinite(west)
  ) {
    return { north, south, east, west };
  }
  return computeBounds(routeGeometry);
}

function normalizeSourceLabel(value: unknown, fallbackSource: string): ExpeditionTripSourceLabel {
  const input = value as Partial<ExpeditionTripSourceLabel> | null | undefined;
  const quality = input?.quality;
  return {
    source: nullableString(input?.source) ?? fallbackSource,
    quality:
      quality === 'live' ||
      quality === 'cached' ||
      quality === 'stale' ||
      quality === 'manual' ||
      quality === 'mock' ||
      quality === 'missing' ||
      quality === 'estimated'
        ? quality
        : 'missing',
    capturedAt: nullableString(input?.capturedAt) ?? nowISO(),
    staleAt: nullableString(input?.staleAt),
    note: nullableString(input?.note),
  };
}

function normalizeSourceList(value: unknown): ExpeditionTripSourceLabel[] {
  if (!Array.isArray(value)) return [defaultSource('local_trip_record', 'missing')];
  return value
    .map((item) => normalizeSourceLabel(item, 'local_trip_record'))
    .slice(-MAX_DATA_USED);
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeSyncStatus(value: unknown): ExpeditionTripRecord['syncStatus'] {
  if (value === 'local' || value === 'pending' || value === 'synced' || value === 'failed') {
    return value;
  }
  return 'local';
}

function normalizeGeneratedSummary(value: unknown): ExpeditionTripGeneratedSummary | null {
  const input = value as Partial<ExpeditionTripGeneratedSummary> | null | undefined;
  const text = nullableString(input?.text);
  if (!text) return null;
  return {
    text,
    generatedAt: nullableString(input?.generatedAt) ?? nowISO(),
    source: normalizeSourceLabel(input?.source, 'local_trip_record'),
  };
}

function normalizeExpeditionRecap(value: unknown): ExpeditionRecap | null {
  const input = value as Partial<ExpeditionRecap> | null | undefined;
  if (!input || typeof input !== 'object') return null;
  const tripId = nullableString(input.tripId);
  const generatedAt = nullableString(input.generatedAt);
  if (!tripId || !generatedAt || !input.journeySummary || !input.routeSummary || !input.generatedNarrative) {
    return null;
  }

  return {
    tripId,
    generatedAt,
    journeySummary: {
      totalDistanceMiles: finiteNumberOrNull(input.journeySummary.totalDistanceMiles),
      totalDurationHours: finiteNumberOrNull(input.journeySummary.totalDurationHours),
      averageSpeedMph: finiteNumberOrNull(input.journeySummary.averageSpeedMph),
      maxElevationFt: finiteNumberOrNull(input.journeySummary.maxElevationFt),
      elevationGainFt: finiteNumberOrNull(input.journeySummary.elevationGainFt),
    },
    routeSummary: {
      startLocation: input.routeSummary.startLocation ?? null,
      endLocation: input.routeSummary.endLocation ?? null,
      routeBounds: normalizeBounds(input.routeSummary.routeBounds, []),
      routeGeometryReference: nullableString(input.routeSummary.routeGeometryReference),
    },
    ...(input.environmentSummary ? { environmentSummary: input.environmentSummary } : null),
    ...(input.terrainSummary ? { terrainSummary: input.terrainSummary } : null),
    expeditionEvents: {
      notableMoments: normalizeArray(input.expeditionEvents?.notableMoments),
      routeDeviations: normalizeArray(input.expeditionEvents?.routeDeviations),
      reroutes: normalizeArray(input.expeditionEvents?.reroutes),
      recoveryPanelUsage: normalizeArray(input.expeditionEvents?.recoveryPanelUsage),
    },
    tripOutcome: {
      completionStatus: normalizeTripStatus(input.tripOutcome?.completionStatus, null),
      tripRatingCandidate:
        input.tripOutcome?.tripRatingCandidate === 'clean' ||
        input.tripOutcome?.tripRatingCandidate === 'eventful' ||
        input.tripOutcome?.tripRatingCandidate === 'challenging' ||
        input.tripOutcome?.tripRatingCandidate === 'incomplete'
          ? input.tripOutcome.tripRatingCandidate
          : 'incomplete',
    },
    generatedNarrative: {
      headline: nullableString(input.generatedNarrative.headline) ?? 'Completed expedition',
      summaryParagraph: nullableString(input.generatedNarrative.summaryParagraph) ?? 'Expedition completed.',
    },
  };
}

export function normalizeExpeditionTripRecord(raw: unknown): ExpeditionTripRecord | null {
  const input = raw as Partial<ExpeditionTripRecord> & {
    endedAt?: string | null;
    name?: string | null;
    expeditionName?: string | null;
    routePoints?: unknown;
  } | null | undefined;

  const id = nullableString(input?.id);
  if (!id) return null;

  const createdAt = safeDateString(input?.createdAt) ?? safeDateString(input?.startedAt) ?? nowISO();
  const startedAt = safeDateString(input?.startedAt) ?? createdAt;
  const completedAt = safeDateString(input?.completedAt) ?? safeDateString(input?.endedAt);
  const updatedAt = safeDateString(input?.updatedAt) ?? completedAt ?? startedAt;
  const routeGeometry = normalizeGeometry(input?.routeGeometry ?? input?.routePoints ?? [], updatedAt);
  const status = normalizeTripStatus(input?.status, completedAt);
  const finalCompletedAt =
    status === 'completed'
      ? completedAt ?? updatedAt ?? createdAt
      : status === 'archived'
        ? completedAt
        : null;
  const startCoordinate = normalizeCoordinate(input?.startCoordinate, startedAt) ?? routeGeometry[0] ?? null;
  const endCoordinate =
    normalizeCoordinate(input?.endCoordinate, finalCompletedAt ?? updatedAt) ??
    routeGeometry[routeGeometry.length - 1] ??
    startCoordinate;
  const elevation = computeElevationStats(routeGeometry);

  const normalized: ExpeditionTripRecord = {
    id,
    schemaVersion: TRIP_SCHEMA_VERSION,
    userId: nullableString(input?.userId),
    title:
      nullableString(input?.title) ??
      nullableString(input?.routeTitle) ??
      nullableString(input?.name) ??
      nullableString(input?.expeditionName) ??
      'Untitled Expedition',
    status,
    startedAt,
    completedAt: finalCompletedAt,
    totalDistanceMiles: finiteNumberOrNull(input?.totalDistanceMiles),
    totalDurationSeconds: finiteNumberOrNull(input?.totalDurationSeconds),
    minElevationFt: finiteNumberOrNull(input?.minElevationFt) ?? elevation.minElevationFt,
    maxElevationFt: finiteNumberOrNull(input?.maxElevationFt) ?? elevation.maxElevationFt,
    totalElevationGainFt: finiteNumberOrNull(input?.totalElevationGainFt) ?? elevation.totalElevationGainFt,
    startCoordinate,
    endCoordinate,
    routeGeometry,
    plannedRouteGeometry: normalizeGeometry(input?.plannedRouteGeometry ?? [], updatedAt),
    routeBounds: normalizeBounds(input?.routeBounds, routeGeometry),
    weatherSnapshots: normalizeArray(input?.weatherSnapshots),
    terrainRiskSnapshots: normalizeArray(input?.terrainRiskSnapshots),
    notableMoments: normalizeArray(input?.notableMoments),
    deviations: normalizeArray(input?.deviations),
    bailoutPointsUsed: normalizeArray(input?.bailoutPointsUsed),
    campCandidatesViewed: normalizeArray(input?.campCandidatesViewed),
    resupplyStopsViewed: normalizeArray(input?.resupplyStopsViewed),
    recoveryPanelUsed: normalizeArray(input?.recoveryPanelUsed),
    badgesUnlocked: normalizeArray<string>(input?.badgesUnlocked).filter((item) => typeof item === 'string'),
    generatedSummary: normalizeGeneratedSummary(input?.generatedSummary),
    recap: normalizeExpeditionRecap(input?.recap),
    createdAt,
    updatedAt,
    guidanceSessionId: nullableString(input?.guidanceSessionId),
    guidanceSource: guidanceSourceFromUnknown(input?.guidanceSource),
    routeId: nullableString(input?.routeId),
    routeTitle: nullableString(input?.routeTitle),
    routeSubtitle: nullableString(input?.routeSubtitle),
    dataUsed: normalizeSourceList(input?.dataUsed),
    syncStatus: normalizeSyncStatus(input?.syncStatus),
  };

  return shouldGenerateFallbackRecap(normalized)
    ? {
        ...normalized,
        recap: safeGenerateExpeditionRecap(normalized, normalized.completedAt ?? normalized.updatedAt),
      }
    : normalized;
}

export function normalizeTripRecord(rawTrip: unknown): ExpeditionTripRecord | null {
  return normalizeExpeditionTripRecord(rawTrip);
}

export function migrateTripRecord(rawTrip: unknown): ExpeditionTripRecord | null {
  return normalizeTripRecord(rawTrip);
}

export function validateTripRecord(rawTrip: unknown): boolean {
  return normalizeTripRecord(rawTrip) != null;
}

function guidanceSourceFromUnknown(value: unknown): ExpeditionTripGuidanceSource {
  return value === 'road' || value === 'trail' || value === 'hybrid' || value === 'run' || value === 'unknown'
    ? value
    : 'unknown';
}

function toTripSummary(record: ExpeditionTripRecord): ExpeditionTripSummary {
  return {
    id: record.id,
    title: record.title,
    completedAt: record.completedAt,
    totalDistanceMiles: record.totalDistanceMiles,
    totalDurationSeconds: record.totalDurationSeconds,
    maxElevationFt: record.maxElevationFt,
    badgesUnlockedCount: record.badgesUnlocked.length,
    notableMomentsCount: record.notableMoments.length,
    startCoordinate: record.startCoordinate,
    endCoordinate: record.endCoordinate,
    routeBounds: record.routeBounds,
  };
}

async function loadSnapshot(): Promise<PersistedExpeditionTripRecords> {
  if (hydratedSnapshot) return hydratedSnapshot;
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    const raw = await tripRecordStorage.read(STORAGE_KEY);
    if (!raw) {
      hydratedSnapshot = { version: STORAGE_VERSION, records: [], activeTripId: null };
      return hydratedSnapshot;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedExpeditionTripRecords;
      const records = Array.isArray(parsed.records)
        ? parsed.records
            .map((record) => {
              try {
                return migrateTripRecord(record);
              } catch (error) {
                logTripMigrationIssue('Skipping trip record that failed migration.', {
                  error: error instanceof Error ? error.message : String(error),
                });
                return null;
              }
            })
            .filter((record): record is ExpeditionTripRecord => !!record)
        : [];
      const activeTripId = parsed.activeTripId && records.some((record) => record.id === parsed.activeTripId)
        ? parsed.activeTripId
        : records.find((record) => record.status === 'active')?.id ?? null;
      hydratedSnapshot = {
        version: STORAGE_VERSION,
        records,
        activeTripId,
      };
      if (
        parsed.version !== STORAGE_VERSION ||
        records.some((record) => record.schemaVersion !== TRIP_SCHEMA_VERSION)
      ) {
        await tripRecordStorage.write(STORAGE_KEY, JSON.stringify(hydratedSnapshot));
      }
      return hydratedSnapshot;
    } catch {
      hydratedSnapshot = { version: STORAGE_VERSION, records: [], activeTripId: null };
      return hydratedSnapshot;
    }
  })().finally(() => {
    hydrationPromise = null;
  });

  return hydrationPromise;
}

async function saveSnapshot(snapshot: PersistedExpeditionTripRecords): Promise<void> {
  hydratedSnapshot = snapshot;
  await tripRecordStorage.write(STORAGE_KEY, JSON.stringify(snapshot));
}

export async function upgradeTripSchemaIfNeeded(): Promise<{
  upgraded: number;
  skipped: number;
  schemaVersion: string;
}> {
  const raw = await tripRecordStorage.read(STORAGE_KEY);
  if (!raw) {
    hydratedSnapshot = { version: STORAGE_VERSION, records: [], activeTripId: null };
    return { upgraded: 0, skipped: 0, schemaVersion: TRIP_SCHEMA_VERSION };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedExpeditionTripRecords> & {
      records?: unknown[];
      activeTripId?: string | null;
    };
    const rawRecords = Array.isArray(parsed.records) ? parsed.records : [];
    let skipped = 0;
    const records = rawRecords
      .map((record) => {
        try {
          const migrated = migrateTripRecord(record);
          if (!migrated) skipped += 1;
          return migrated;
        } catch (error) {
          skipped += 1;
          logTripMigrationIssue('Skipping trip record that failed schema upgrade.', {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      })
      .filter((record): record is ExpeditionTripRecord => !!record);
    const activeTripId = parsed.activeTripId && records.some((record) => record.id === parsed.activeTripId)
      ? parsed.activeTripId
      : records.find((record) => record.status === 'active')?.id ?? null;
    const upgradedSnapshot = { version: STORAGE_VERSION, records, activeTripId };
    await saveSnapshot(upgradedSnapshot);
    return {
      upgraded: records.length,
      skipped,
      schemaVersion: TRIP_SCHEMA_VERSION,
    };
  } catch (error) {
    logTripMigrationIssue('Trip schema upgrade failed; preserving existing storage payload.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { upgraded: 0, skipped: 0, schemaVersion: TRIP_SCHEMA_VERSION };
  }
}

function queueCompletedTripPostProcessing(record: ExpeditionTripRecord): void {
  if (record.status !== 'completed') return;
  void (async () => {
    await import('./expeditionBadgeStore')
      .then(({ evaluateBadgesForCompletedTrip }) => evaluateBadgesForCompletedTrip(record.id))
      .catch(() => null);
    await import('./expeditionInsightStore')
      .then(({ generateInsightsForCompletedTrip }) => generateInsightsForCompletedTrip(record.id))
      .catch(() => null);
    await import('./expeditionPersonalRecordStore')
      .then(({ evaluatePersonalRecordsForCompletedTrip }) => evaluatePersonalRecordsForCompletedTrip(record.id))
      .catch(() => null);
  })();
}

function upsertRecord(snapshot: PersistedExpeditionTripRecords, record: ExpeditionTripRecord): PersistedExpeditionTripRecords {
  const normalizedRecord = normalizeExpeditionTripRecord(record) ?? record;
  const index = snapshot.records.findIndex((item) => item.id === normalizedRecord.id);
  const records =
    index >= 0
      ? snapshot.records.map((item, itemIndex) => (itemIndex === index ? normalizedRecord : item))
      : [...snapshot.records, normalizedRecord];
  return {
    ...snapshot,
    records,
    activeTripId: normalizedRecord.status === 'active' ? normalizedRecord.id : snapshot.activeTripId,
  };
}

function findActiveRecord(
  snapshot: PersistedExpeditionTripRecords,
  guidanceSessionId?: string | null,
): ExpeditionTripRecord | null {
  if (guidanceSessionId) {
    const matching = snapshot.records.find(
      (record) => record.status === 'active' && record.guidanceSessionId === guidanceSessionId,
    );
    if (matching) return matching;
  }

  if (snapshot.activeTripId) {
    return snapshot.records.find((record) => record.id === snapshot.activeTripId && record.status === 'active') ?? null;
  }

  return snapshot.records.find((record) => record.status === 'active') ?? null;
}

export function createNewActiveTripRecord(input: ExpeditionTripCreateInput = {}): ExpeditionTripRecord {
  const timestamp = input.startedAt ?? nowISO();
  const routeGeometry = normalizeGeometry(input.routeGeometry ?? [], timestamp);
  const plannedRouteGeometry = normalizeGeometry(input.plannedRouteGeometry ?? [], timestamp);
  const startCoordinate =
    input.startCoordinate ?? routeGeometry[0] ?? null;
  const elevation = computeElevationStats(routeGeometry);
  const title = input.title?.trim() || input.routeTitle?.trim() || 'Expedition Trip';
  const dataSource = input.dataSource ?? defaultSource('navigate_guidance');

  return {
    id: input.id ?? generateId('expedition-trip'),
    schemaVersion: TRIP_SCHEMA_VERSION,
    userId: input.userId ?? null,
    title,
    status: 'active',
    startedAt: timestamp,
    completedAt: null,
    totalDistanceMiles: computeDistanceMiles(routeGeometry),
    totalDurationSeconds: 0,
    minElevationFt: elevation.minElevationFt,
    maxElevationFt: elevation.maxElevationFt,
    totalElevationGainFt: elevation.totalElevationGainFt,
    startCoordinate,
    endCoordinate: startCoordinate,
    routeGeometry,
    plannedRouteGeometry,
    routeBounds: computeBounds(routeGeometry),
    weatherSnapshots: [],
    terrainRiskSnapshots: [],
    notableMoments: [
      {
        id: generateId('moment'),
        capturedAt: timestamp,
        type: 'guidance_started',
        title: 'Guidance started',
        detail: input.routeTitle ?? null,
        coordinate: startCoordinate,
        source: dataSource,
      },
    ],
    deviations: [],
    bailoutPointsUsed: [],
    campCandidatesViewed: [],
    resupplyStopsViewed: [],
    recoveryPanelUsed: [],
    badgesUnlocked: [],
    generatedSummary: null,
    recap: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    guidanceSessionId: input.guidanceSessionId ?? null,
    guidanceSource: input.guidanceSource ?? 'unknown',
    routeId: input.routeId ?? null,
    routeTitle: input.routeTitle ?? null,
    routeSubtitle: input.routeSubtitle ?? null,
    dataUsed: [dataSource],
    syncStatus: 'local',
  };
}

export function safelyStoreNotableMoment(
  record: ExpeditionTripRecord,
  moment: Omit<ExpeditionTripNotableMoment, 'id' | 'capturedAt' | 'source'> & {
    id?: string | null;
    capturedAt?: string | null;
    source?: ExpeditionTripSourceLabel | null;
  },
): ExpeditionTripRecord {
  const capturedAt = moment.capturedAt ?? nowISO();
  const source = moment.source ?? defaultSource('manual_trip_record', 'manual');
  const nextMoment: ExpeditionTripNotableMoment = {
    id: moment.id ?? generateId('moment'),
    capturedAt,
    type: moment.type,
    title: moment.title.trim().slice(0, 120) || 'Trip moment',
    detail: moment.detail?.trim().slice(0, 600) ?? null,
    coordinate: moment.coordinate ?? null,
    source,
  };

  const alreadyStored = record.notableMoments.some((item) => item.id === nextMoment.id);
  if (alreadyStored) return record;

  return {
    ...record,
    notableMoments: [...record.notableMoments, nextMoment].slice(-MAX_NOTABLE_MOMENTS),
    dataUsed: mergeDataUsed(record.dataUsed, source),
    updatedAt: capturedAt,
  };
}

export function safelyAppendBadgeIds(record: ExpeditionTripRecord, badgeIds: string[]): ExpeditionTripRecord {
  const uniqueBadges = new Set(record.badgesUnlocked);
  for (const badgeId of badgeIds) {
    const normalized = badgeId.trim();
    if (normalized.length > 0) uniqueBadges.add(normalized);
  }

  return {
    ...record,
    badgesUnlocked: Array.from(uniqueBadges),
    updatedAt: nowISO(),
  };
}

export function updateTripStatsDuringGuidance(
  record: ExpeditionTripRecord,
  input: ExpeditionTripStatsUpdateInput,
): ExpeditionTripRecord {
  const timestamp = input.updatedAt ?? nowISO();
  const incomingGeometry = normalizeGeometry(input.routeGeometry ?? [], timestamp);
  const routeGeometry = incomingGeometry.length > 1 ? incomingGeometry : record.routeGeometry;
  const plannedRouteGeometry = input.plannedRouteGeometry
    ? normalizeGeometry(input.plannedRouteGeometry, timestamp)
    : record.plannedRouteGeometry ?? [];
  const currentCoordinate = input.currentCoordinate ?? routeGeometry[routeGeometry.length - 1] ?? record.endCoordinate;
  const elevation = computeElevationStats(routeGeometry);
  let nextRecord: ExpeditionTripRecord = {
    ...record,
    totalDistanceMiles: input.totalDistanceMiles ?? computeDistanceMiles(routeGeometry) ?? record.totalDistanceMiles,
    totalDurationSeconds: input.totalDurationSeconds ?? secondsBetween(record.startedAt, timestamp) ?? record.totalDurationSeconds,
    minElevationFt: elevation.minElevationFt ?? record.minElevationFt,
    maxElevationFt: elevation.maxElevationFt ?? record.maxElevationFt,
    totalElevationGainFt: elevation.totalElevationGainFt ?? record.totalElevationGainFt,
    endCoordinate: currentCoordinate,
    routeGeometry,
    plannedRouteGeometry,
    routeBounds: computeBounds(routeGeometry) ?? record.routeBounds,
    dataUsed: mergeDataUsed(record.dataUsed, input.dataSource),
    updatedAt: timestamp,
    syncStatus: record.syncStatus === 'synced' ? 'pending' : record.syncStatus,
  };

  if (input.isOffRoute && shouldStoreRouteDeviation(nextRecord, timestamp)) {
    const deviationSource = input.dataSource ?? defaultSource('navigate_guidance');
    const deviationId = [
      'deviation',
      Math.round(input.offRouteDistanceM ?? 0),
      currentCoordinate?.lat.toFixed(5) ?? 'unknown',
      currentCoordinate?.lng.toFixed(5) ?? 'unknown',
    ].join(':');
    const alreadyStored = nextRecord.deviations.some((item) => item.id === deviationId);
    if (!alreadyStored) {
      const deviation: ExpeditionTripDeviation = {
        id: deviationId,
        capturedAt: timestamp,
        distanceMeters: input.offRouteDistanceM ?? null,
        coordinate: currentCoordinate,
        statusLabel: input.statusLabel ?? null,
        source: deviationSource,
      };
      nextRecord = safelyStoreNotableMoment(
        {
          ...nextRecord,
          deviations: [...nextRecord.deviations, deviation].slice(-MAX_DEVIATIONS),
        },
        {
          id: `${deviationId}:moment`,
          capturedAt: timestamp,
          type: 'route_deviation',
          title: 'Route deviation detected',
          detail: input.statusLabel ?? null,
          coordinate: currentCoordinate,
          source: deviationSource,
        },
      );
    }
  }

  return nextRecord;
}

export function finalizeCompletedTrip(
  record: ExpeditionTripRecord,
  input: ExpeditionTripFinalizeInput = {},
): ExpeditionTripRecord {
  const completedAt = input.completedAt ?? nowISO();
  const updated = updateTripStatsDuringGuidance(record, {
    ...input,
    updatedAt: completedAt,
    currentCoordinate: input.endCoordinate ?? input.currentCoordinate ?? record.endCoordinate,
  });
  const source = input.dataSource ?? defaultSource('navigate_guidance');
  const withCompletionMoment = safelyStoreNotableMoment(
    {
      ...updated,
      status: 'completed',
      completedAt,
      totalDurationSeconds: input.totalDurationSeconds ?? secondsBetween(record.startedAt, completedAt) ?? updated.totalDurationSeconds,
      endCoordinate: input.endCoordinate ?? updated.endCoordinate,
      generatedSummary: input.generatedSummary ?? record.generatedSummary,
      dataUsed: mergeDataUsed(updated.dataUsed, source),
      syncStatus: updated.syncStatus === 'synced' ? 'pending' : updated.syncStatus,
      updatedAt: completedAt,
    },
    {
      id: `guidance-completed:${record.guidanceSessionId ?? record.id}`,
      capturedAt: completedAt,
      type: 'guidance_completed',
      title: 'Guidance completed',
      detail: input.statusLabel ?? record.routeTitle ?? null,
      coordinate: input.endCoordinate ?? updated.endCoordinate,
      source,
    },
  );
  const recap = safeGenerateExpeditionRecap(withCompletionMoment, completedAt);
  const generatedSummary = withCompletionMoment.generatedSummary ?? {
    ...(recap
      ? {
          text: recap.generatedNarrative.summaryParagraph,
          generatedAt: recap.generatedAt,
          source: defaultSource('ecs_deterministic_expedition_recap', 'estimated'),
        }
      : buildSummaryText(withCompletionMoment)),
  };

  return {
    ...withCompletionMoment,
    generatedSummary,
    recap,
    updatedAt: completedAt,
  };
}

function sourceFromGuidance(snapshot: ExpeditionTripGuidanceSnapshot): ExpeditionTripSourceLabel {
  return defaultSource(`navigate_${snapshot.source === 'none' ? 'unknown' : snapshot.source}_guidance`);
}

function recordedAtFromGpsTimestamp(timestamp: number | null | undefined, fallback: string | null | undefined): string | null {
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    const iso = new Date(timestamp).toISOString();
    if (new Date(iso).getTime() === timestamp) return iso;
  }
  return fallback ?? null;
}

function gpsCoordinateFromGuidance(snapshot: ExpeditionTripGuidanceSnapshot): ExpeditionTripCoordinate | null {
  const sample = snapshot.gpsSample ?? snapshot.currentLocation;
  if (!sample) return null;
  return normalizeCoordinate(
    {
      lat: sample.latitude,
      lng: sample.longitude,
      altitudeFt: sample.altitudeFt ?? sample.elevationFt ?? null,
      accuracyM: sample.accuracyM ?? null,
      speedMph: sample.speedMph ?? null,
      headingDeg: sample.headingDeg ?? snapshot.headingDeg ?? null,
    },
    recordedAtFromGpsTimestamp(sample.timestamp, snapshot.updatedAt),
  );
}

function coordinateFromGuidance(snapshot: ExpeditionTripGuidanceSnapshot): ExpeditionTripCoordinate | null {
  const gpsCoordinate = gpsCoordinateFromGuidance(snapshot);
  if (gpsCoordinate) return gpsCoordinate;
  const progress = normalizeGeometry(snapshot.progressPoints, snapshot.updatedAt);
  return progress[progress.length - 1] ?? null;
}

function coordinateToMotionSample(coordinate: ExpeditionTripCoordinate | null | undefined): MapMotionGpsSample | null {
  if (!coordinate) return null;
  const timestamp = coordinate.recordedAt ? new Date(coordinate.recordedAt).getTime() : Date.now();
  if (!Number.isFinite(timestamp)) return null;
  return {
    latitude: coordinate.lat,
    longitude: coordinate.lng,
    altitudeFt: coordinate.elevationFt ?? null,
    speedMph: coordinate.speedMph ?? null,
    headingDeg: coordinate.headingDeg ?? null,
    accuracyM: coordinate.accuracyM ?? null,
    timestamp,
  };
}

function appendGuidanceTraceCoordinate(
  routeGeometry: ExpeditionTripCoordinate[],
  coordinate: ExpeditionTripCoordinate | null,
): ExpeditionTripCoordinate[] {
  if (!coordinate) return routeGeometry;
  const existing = normalizeGeometry(routeGeometry, null);
  const previous = existing[existing.length - 1] ?? null;
  if (
    previous &&
    previous.lat.toFixed(6) === coordinate.lat.toFixed(6) &&
    previous.lng.toFixed(6) === coordinate.lng.toFixed(6)
  ) {
    return existing;
  }

  const previousSample = coordinateToMotionSample(previous);
  const nextSample = coordinateToMotionSample(coordinate);
  const decision = classifyGpsSampleForMotion(previousSample, nextSample, {
    maxAccuracyM: 75,
    maxTeleportSpeedMph: 180,
    jitterDistanceM: 2.5,
  });
  if (!decision.accepted) return existing;

  return downsampleGeometry([...existing, coordinate]);
}

function guidanceSource(snapshot: ExpeditionTripGuidanceSnapshot): ExpeditionTripGuidanceSource {
  return snapshot.source === 'none' ? 'unknown' : snapshot.source;
}

function buildSummaryText(record: ExpeditionTripRecord): ExpeditionTripGeneratedSummary {
  const distance = record.totalDistanceMiles == null ? 'distance unavailable' : `${record.totalDistanceMiles.toFixed(1)} mi`;
  const durationMinutes = record.totalDurationSeconds == null ? null : Math.round(record.totalDurationSeconds / 60);
  const duration = durationMinutes == null ? 'duration unavailable' : `${durationMinutes} min`;
  return {
    text: `${record.title} completed with ${distance} recorded over ${duration}.`,
    generatedAt: nowISO(),
    source: defaultSource('ecs_deterministic_trip_summary', 'estimated'),
  };
}

function buildCancelledSummaryText(record: ExpeditionTripRecord): ExpeditionTripGeneratedSummary {
  const distance = record.totalDistanceMiles == null ? 'distance unavailable' : `${record.totalDistanceMiles.toFixed(1)} mi`;
  const durationMinutes = record.totalDurationSeconds == null ? null : Math.round(record.totalDurationSeconds / 60);
  const duration = durationMinutes == null ? 'duration unavailable' : `${durationMinutes} min`;
  return {
    text: `${record.title} ended before confirmed arrival with ${distance} recorded over ${duration}. It is not counted as a completed expedition.`,
    generatedAt: nowISO(),
    source: defaultSource('ecs_deterministic_trip_summary', 'estimated'),
  };
}

export async function ensureActiveTripRecordForGuidance(
  snapshot: ExpeditionTripGuidanceSnapshot,
): Promise<ExpeditionTripRecord | null> {
  if (snapshot.lifecycle !== 'active' && snapshot.lifecycle !== 'arrived') return null;

  const persisted = await loadSnapshot();
  const active = findActiveRecord(persisted, snapshot.sessionId);
  const timestamp = snapshot.updatedAt ?? nowISO();
  const source = sourceFromGuidance(snapshot);
  const plannedRouteGeometry = normalizeGeometry(snapshot.routePoints, timestamp);
  const currentCoordinate = coordinateFromGuidance(snapshot);

  if (!active) {
    const routeGeometry = appendGuidanceTraceCoordinate([], currentCoordinate);
    const totalDistanceMiles = deriveDistanceFromGuidance(snapshot, routeGeometry);
    const created = createNewActiveTripRecord({
      title: snapshot.routeTitle,
      startedAt: timestamp,
      startCoordinate: currentCoordinate ?? null,
      routeGeometry,
      plannedRouteGeometry,
      guidanceSessionId: snapshot.sessionId,
      guidanceSource: guidanceSource(snapshot),
      routeId: snapshot.routeId,
      routeTitle: snapshot.routeTitle,
      routeSubtitle: snapshot.routeSubtitle,
      dataSource: source,
    });
    const updated = updateTripStatsDuringGuidance(created, {
      updatedAt: timestamp,
      totalDistanceMiles,
      currentCoordinate,
      routeGeometry,
      plannedRouteGeometry,
      statusLabel: snapshot.statusLabel,
      isOffRoute: snapshot.isOffRoute,
      offRouteDistanceM: snapshot.offRouteDistanceM,
      dataSource: source,
    });
    const finalRecord = snapshot.lifecycle === 'arrived'
      ? finalizeCompletedTrip(updated, {
          completedAt: timestamp,
          endCoordinate: currentCoordinate ?? updated.endCoordinate,
          routeGeometry,
          plannedRouteGeometry,
          statusLabel: snapshot.statusLabel,
          dataSource: source,
          generatedSummary: buildSummaryText(updated),
        })
      : updated;
    await saveSnapshot(upsertRecord(persisted, finalRecord));
    queueCompletedTripPostProcessing(finalRecord);
    return finalRecord;
  }

  const routeGeometry = appendGuidanceTraceCoordinate(active.routeGeometry, currentCoordinate);
  const totalDistanceMiles = deriveDistanceFromGuidance(snapshot, routeGeometry);
  const updated = updateTripStatsDuringGuidance(active, {
    updatedAt: timestamp,
    totalDistanceMiles,
    currentCoordinate,
    routeGeometry,
    plannedRouteGeometry,
    statusLabel: snapshot.statusLabel,
    isOffRoute: snapshot.isOffRoute,
    offRouteDistanceM: snapshot.offRouteDistanceM,
    dataSource: source,
  });
  const finalRecord = snapshot.lifecycle === 'arrived'
    ? finalizeCompletedTrip(updated, {
        completedAt: timestamp,
        endCoordinate: currentCoordinate ?? updated.endCoordinate,
        routeGeometry,
        plannedRouteGeometry,
        statusLabel: snapshot.statusLabel,
        dataSource: source,
        generatedSummary: buildSummaryText(updated),
      })
    : updated;
  const nextSnapshot = upsertRecord(persisted, finalRecord);
  await saveSnapshot({
    ...nextSnapshot,
    activeTripId: finalRecord.status === 'active' ? finalRecord.id : null,
  });
  queueCompletedTripPostProcessing(finalRecord);
  return finalRecord;
}

export async function finalizeActiveTripRecordFromGuidanceEnd(
  endedAt = nowISO(),
): Promise<ExpeditionTripRecord | null> {
  return cancelActiveTripRecordFromGuidanceEnd(endedAt);
}

export async function cancelActiveTripRecordFromGuidanceEnd(
  endedAt = nowISO(),
): Promise<ExpeditionTripRecord | null> {
  const persisted = await loadSnapshot();
  const active = findActiveRecord(persisted);
  if (!active) return null;

  const source = defaultSource('navigate_guidance_end');
  const updated = updateTripStatsDuringGuidance(active, {
    updatedAt: endedAt,
    currentCoordinate: active.endCoordinate,
    routeGeometry: active.routeGeometry,
    statusLabel: 'Guidance ended before confirmed arrival',
    dataSource: source,
  });
  const cancelled = safelyStoreNotableMoment(
    {
      ...updated,
      status: 'cancelled',
      completedAt: null,
      generatedSummary: buildCancelledSummaryText(updated),
      recap: null,
      dataUsed: mergeDataUsed(updated.dataUsed, source),
      syncStatus: updated.syncStatus === 'synced' ? 'pending' : updated.syncStatus,
      updatedAt: endedAt,
    },
    {
      id: `guidance-cancelled:${active.guidanceSessionId ?? active.id}`,
      capturedAt: endedAt,
      type: 'guidance_cancelled',
      title: 'Guidance ended before arrival',
      detail: 'Not counted as a completed expedition.',
      coordinate: updated.endCoordinate,
      source,
    },
  );
  await saveSnapshot(upsertRecord({ ...persisted, activeTripId: null }, cancelled));
  return cancelled;
}

async function applyGuidanceSnapshotToTripRecord(
  snapshot: ExpeditionTripGuidanceSnapshot,
): Promise<ExpeditionTripRecord | null> {
  if (snapshot.lifecycle === 'active' || snapshot.lifecycle === 'arrived') {
    return ensureActiveTripRecordForGuidance(snapshot);
  }

  if (snapshot.lifecycle === 'inactive') {
    return cancelActiveTripRecordFromGuidanceEnd(snapshot.updatedAt ?? nowISO());
  }

  return null;
}

export function trackExpeditionTripFromGuidanceSnapshot(
  snapshot: ExpeditionTripGuidanceSnapshot,
): Promise<ExpeditionTripRecord | null> {
  const next = guidanceTrackingQueue
    .catch(() => null)
    .then(() => applyGuidanceSnapshotToTripRecord(snapshot));
  guidanceTrackingQueue = next;
  return next;
}

export const expeditionTripRecordStore = {
  async getAll(): Promise<ExpeditionTripRecord[]> {
    const snapshot = await loadSnapshot();
    return [...snapshot.records].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  },

  async getCompleted(): Promise<ExpeditionTripRecord[]> {
    const records = await this.getAll();
    return records
      .filter((record) => record.status === 'completed')
      .sort((a, b) => new Date(b.completedAt ?? b.updatedAt).getTime() - new Date(a.completedAt ?? a.updatedAt).getTime());
  },

  async getCompletedSummaries(): Promise<ExpeditionTripSummary[]> {
    const completed = await this.getCompleted();
    return completed.map(toTripSummary);
  },

  async getActive(): Promise<ExpeditionTripRecord | null> {
    const snapshot = await loadSnapshot();
    return findActiveRecord(snapshot);
  },

  async getById(id: string): Promise<ExpeditionTripRecord | null> {
    const snapshot = await loadSnapshot();
    return snapshot.records.find((record) => record.id === id) ?? null;
  },

  async save(record: ExpeditionTripRecord): Promise<ExpeditionTripRecord> {
    const snapshot = await loadSnapshot();
    const normalized = normalizeExpeditionTripRecord(record) ?? record;
    await saveSnapshot(upsertRecord(snapshot, normalized));
    queueCompletedTripPostProcessing(normalized);
    return normalized;
  },

  async updateTitle(id: string, title: string): Promise<ExpeditionTripRecord | null> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return null;

    const snapshot = await loadSnapshot();
    const existing = snapshot.records.find((record) => record.id === id);
    if (!existing) return null;

    const updated: ExpeditionTripRecord = {
      ...existing,
      title: trimmedTitle.slice(0, 120),
      updatedAt: nowISO(),
      syncStatus: existing.syncStatus === 'synced' ? 'pending' : existing.syncStatus,
    };
    await saveSnapshot(upsertRecord(snapshot, updated));
    return updated;
  },

  async archive(id: string): Promise<ExpeditionTripRecord | null> {
    const snapshot = await loadSnapshot();
    const existing = snapshot.records.find((record) => record.id === id);
    if (!existing) return null;

    const updated: ExpeditionTripRecord = {
      ...existing,
      status: 'archived',
      updatedAt: nowISO(),
      syncStatus: existing.syncStatus === 'synced' ? 'pending' : existing.syncStatus,
    };
    const nextSnapshot = upsertRecord(snapshot, updated);
    await saveSnapshot({
      ...nextSnapshot,
      activeTripId: snapshot.activeTripId === id ? null : nextSnapshot.activeTripId,
    });
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    const snapshot = await loadSnapshot();
    const records = snapshot.records.filter((record) => record.id !== id);
    if (records.length === snapshot.records.length) return false;

    await saveSnapshot({
      ...snapshot,
      records,
      activeTripId: snapshot.activeTripId === id ? null : snapshot.activeTripId,
    });
    return true;
  },

  async clearAllForTests(): Promise<void> {
    const empty = { version: STORAGE_VERSION, records: [], activeTripId: null };
    await saveSnapshot(empty);
  },
};

// TODO Expedition Hub: generate recap map overlays from routeGeometry and routeBounds.
// TODO Expedition Hub: evaluate badges from completed trip stats and notable moments.
// TODO Expedition Hub: feed learned insights from completed, source-labeled trip history.
// TODO Expedition Hub: support printable/exportable recaps without coupling export logic here.

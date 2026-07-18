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
import {
  buildCompletionKey,
  canonicalJourneyEntityId,
} from '../lifecycle/routeTripExpeditionLifecycle';

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

function nestedObject(source: Record<string, unknown>, ...path: string[]): Record<string, unknown> | null {
  let current: Record<string, unknown> | null = source;
  for (const key of path) {
    current = current ? asObject(current[key]) : null;
    if (!current) return null;
  }
  return current;
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
  if (Array.isArray(value) && value.length >= 2) {
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    if (!isFiniteCoordinate(lat, lng)) return null;
    return {
      lat,
      lng,
      elevationFt: null,
      accuracyM: null,
      speedMph: null,
      headingDeg: null,
      recordedAt,
    };
  }
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

function coordinateList(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  const source = asObject(value);
  if (!source) return null;
  if (source.type === 'Feature') return coordinateList(source.geometry);
  if (source.type === 'LineString') return coordinateList(source.coordinates);
  return coordinateList(source.coordinates ?? source.points);
}

function normalizeGeometry(rawValue: unknown, completedAt: string, gpsElevationFt?: number | null): ExpeditionTripCoordinate[] {
  const raw = coordinateList(rawValue);
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

function geometrySources(record: Record<string, unknown>): Record<string, unknown>[] {
  return [
    record,
    nestedObject(record, 'guidance'),
    nestedObject(record, 'guidanceSession'),
    nestedObject(record, 'routeSession'),
    nestedObject(record, 'navigationSession'),
    nestedObject(record, 'activeRoute'),
    nestedObject(record, 'route'),
  ].filter((source): source is Record<string, unknown> => !!source);
}

function readGeometryByRole(
  record: Record<string, unknown>,
  keys: string[],
  completedAt: string,
  gpsElevationFt?: number | null,
): ExpeditionTripCoordinate[] {
  let sparseFallback: ExpeditionTripCoordinate[] = [];
  for (const source of geometrySources(record)) {
    for (const key of keys) {
      if (source[key] == null) continue;
      const geometry = normalizeGeometry(source[key], completedAt, gpsElevationFt);
      if (geometry.length >= 2) return geometry;
      if (geometry.length > sparseFallback.length) sparseFallback = geometry;
    }
  }
  return sparseFallback;
}

function readRecordedGeometry(
  record: Record<string, unknown>,
  completedAt: string,
  gpsElevationFt?: number | null,
): ExpeditionTripCoordinate[] {
  return readGeometryByRole(
    record,
    ['recordedRouteGeometry', 'recordedTrace', 'gpsTrace', 'routeGeometry'],
    completedAt,
    gpsElevationFt,
  );
}

function readPlannedGeometry(
  record: Record<string, unknown>,
  completedAt: string,
): ExpeditionTripCoordinate[] {
  return readGeometryByRole(
    record,
    ['plannedRouteGeometry', 'routePoints', 'canonicalRouteGeometry', 'geometry', 'coordinates', 'points'],
    completedAt,
  );
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
  const state =
    readString(record, ['state', 'status', 'lifecycle']) ??
    readString(nestedObject(record, 'lifecycle'), ['phase', 'state', 'status']) ??
    readString(nestedObject(record, 'canonicalLifecycle'), ['state', 'phase', 'status']);
  return Boolean(routeCompleted) ||
    state === 'complete' ||
    state === 'completed' ||
    state === 'arrived' ||
    state === 'ended';
}

type CompletionIdentity = {
  id: string;
  completionKey: string | null;
  expeditionId: string | null;
  guidanceSessionId: string | null;
};

function stripCanonicalPrefix(value: string | null, prefix: string): string | null {
  if (!value) return null;
  const canonicalPrefix = `${prefix}:`;
  return value.startsWith(canonicalPrefix) ? value.slice(canonicalPrefix.length) || null : value;
}

function readCompletionIdentity(record: Record<string, unknown>): CompletionIdentity | null {
  const lifecycleIdentity = nestedObject(record, 'lifecycle', 'identity');
  const canonicalLifecycle = nestedObject(record, 'canonicalLifecycle');
  const canonicalPlan = nestedObject(record, 'canonicalLifecycle', 'plan');
  const canonicalCompletion = nestedObject(record, 'canonicalLifecycle', 'completion');
  const guidance = nestedObject(record, 'guidance');
  const guidanceSession = nestedObject(record, 'guidanceSession');
  const routeSession = nestedObject(record, 'routeSession');
  const navigationSession = nestedObject(record, 'navigationSession');

  const directId = readString(record, ['id', 'tripId', 'routeId', 'activeRouteId']);
  const guidanceSessionId = stripCanonicalPrefix(
    readString(record, ['guidanceSessionId', 'sessionId']) ??
      readString(guidance, ['guidanceSessionId', 'sessionId', 'id']) ??
      readString(guidanceSession, ['guidanceSessionId', 'sessionId', 'id']) ??
      readString(routeSession, ['guidanceSessionId', 'sessionId']) ??
      readString(navigationSession, ['guidanceSessionId']) ??
      readString(lifecycleIdentity, ['guidanceSessionId']),
    'guidance',
  );
  const expeditionId = stripCanonicalPrefix(
    readString(record, ['expeditionId']) ??
      readString(lifecycleIdentity, ['expeditionId']) ??
      readString(canonicalLifecycle, ['expeditionId']) ??
      readString(canonicalPlan, ['expeditionId']),
    'expedition',
  );
  const explicitCompletionKey =
    readString(record, ['completionKey', 'completedOutcomeId']) ??
    readString(lifecycleIdentity, ['completedOutcomeId']) ??
    readString(canonicalCompletion, ['completionKey', 'outcomeId']);
  const completionKey = explicitCompletionKey
    ? canonicalJourneyEntityId('completed_outcome', explicitCompletionKey)
    : buildCompletionKey({ expeditionId, guidanceSessionId });
  const id = directId ?? stripCanonicalPrefix(explicitCompletionKey, 'expedition-trip') ?? expeditionId ?? guidanceSessionId;
  return id ? { id, completionKey, expeditionId, guidanceSessionId } : null;
}

function canonicalIdentity(kind: 'completed_outcome' | 'expedition' | 'guidance_session', value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean ? canonicalJourneyEntityId(kind, clean) : null;
}

function recordLifecycleIdentity(record: ExpeditionTripRecord): Record<string, unknown> | null {
  return asObject(asObject(record.lifecycle)?.identity);
}

function matchingRecord(
  records: ExpeditionTripRecord[],
  kind: 'completed_outcome' | 'expedition' | 'guidance_session',
  expected: string | null,
): ExpeditionTripRecord | null {
  if (!expected) return null;
  return records.find((candidate) => {
    const lifecycleIdentity = recordLifecycleIdentity(candidate);
    const values = kind === 'completed_outcome'
      ? [candidate.completionKey, readString(lifecycleIdentity, ['completedOutcomeId'])]
      : kind === 'expedition'
        ? [candidate.expeditionId, readString(lifecycleIdentity, ['expeditionId'])]
        : [candidate.guidanceSessionId, readString(lifecycleIdentity, ['guidanceSessionId'])];
    return values.some((value) => canonicalIdentity(kind, value) === expected);
  }) ?? null;
}

async function findCanonicalTrip(identity: CompletionIdentity): Promise<ExpeditionTripRecord | null> {
  const records = await expeditionTripRecordStore.getAll();
  return matchingRecord(
    records,
    'completed_outcome',
    canonicalIdentity('completed_outcome', identity.completionKey),
  ) ?? matchingRecord(
    records,
    'guidance_session',
    canonicalIdentity('guidance_session', identity.guidanceSessionId),
  ) ?? matchingRecord(
    records,
    'expedition',
    canonicalIdentity('expedition', identity.expeditionId),
  ) ?? records.find((candidate) => candidate.id === identity.id) ?? null;
}

function hasDrawableGeometry(geometry: ExpeditionTripCoordinate[] | null | undefined): boolean {
  return (geometry?.length ?? 0) >= 2;
}

function enrichMatchingGeometry(
  existing: ExpeditionTripCoordinate[],
  incoming: ExpeditionTripCoordinate[],
): { geometry: ExpeditionTripCoordinate[]; changed: boolean } {
  if (!hasDrawableGeometry(existing) || existing.length !== incoming.length) {
    return { geometry: existing, changed: false };
  }
  const sameCoordinates = existing.every((point, index) => (
    Math.abs(point.lat - incoming[index].lat) <= 0.000001 &&
    Math.abs(point.lng - incoming[index].lng) <= 0.000001
  ));
  if (!sameCoordinates) return { geometry: existing, changed: false };

  let changed = false;
  const geometry = existing.map((point, index) => {
    const candidate = incoming[index];
    const elevationFt = point.elevationFt == null && candidate.elevationFt != null
      ? candidate.elevationFt
      : point.elevationFt;
    const recordedAt = point.recordedAt == null && candidate.recordedAt != null
      ? candidate.recordedAt
      : point.recordedAt;
    const pointChanged = elevationFt !== point.elevationFt || recordedAt !== point.recordedAt;
    if (pointChanged) changed = true;
    return pointChanged
      ? { ...point, elevationFt, recordedAt }
      : point;
  });
  return { geometry, changed };
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

  const identity = readCompletionIdentity(record);
  if (!identity) return { created: false, trip: null, badges: [], reason: 'missing_id' };

  const {
    id,
    completionKey,
    expeditionId,
    guidanceSessionId,
  } = identity;
  const existing = await findCanonicalTrip(identity);
  const beforeBadges = badgeIds(await getBadgesForTrip(existing?.id ?? id).catch(() => []));
  const completedAt = safeIso(
    record.completedAt ?? record.endedAt ?? record.updatedAt ?? record.lastUpdatedAt ?? record.timestamp,
  );
  const recordedRouteGeometry = readRecordedGeometry(record, completedAt, gpsElevationFt);
  const plannedRouteGeometry = readPlannedGeometry(record, completedAt);
  const durationSeconds = durationSecondsFromRecord(record) ?? 0;
  const totalDistanceMiles = distanceMilesFromRecord(record);
  const title =
    readString(record, ['title', 'expeditionName', 'routeTitle', 'name', 'destination']) ??
    routeLabel?.trim() ??
    'Completed Expedition';
  const source = sourceLabel(completedAt);

  if (existing?.status === 'completed') {
    const existingRecordedGeometry = existing.routeGeometry ?? [];
    const existingPlannedGeometry = existing.plannedRouteGeometry ?? [];
    const canAddRecordedGeometry =
      !hasDrawableGeometry(existingRecordedGeometry) && hasDrawableGeometry(recordedRouteGeometry);
    const canAddPlannedGeometry =
      !hasDrawableGeometry(existingPlannedGeometry) && hasDrawableGeometry(plannedRouteGeometry);
    const recordedEnrichment = canAddRecordedGeometry
      ? { geometry: recordedRouteGeometry, changed: true }
      : enrichMatchingGeometry(existingRecordedGeometry, recordedRouteGeometry);
    const plannedEnrichment = canAddPlannedGeometry
      ? { geometry: plannedRouteGeometry, changed: true }
      : enrichMatchingGeometry(existingPlannedGeometry, plannedRouteGeometry);
    let resolvedTrip = existing;

    if (recordedEnrichment.changed || plannedEnrichment.changed) {
      const nextRecordedGeometry = recordedEnrichment.geometry;
      const nextPlannedGeometry = plannedEnrichment.geometry;
      const enriched = finalizeCompletedTrip(existing, {
        completedAt: existing.completedAt ?? completedAt,
        totalDistanceMiles: existing.totalDistanceMiles ?? totalDistanceMiles,
        totalDurationSeconds: existing.totalDurationSeconds ?? durationSeconds,
        endCoordinate:
          nextRecordedGeometry[nextRecordedGeometry.length - 1] ??
          existing.endCoordinate,
        routeGeometry: nextRecordedGeometry,
        plannedRouteGeometry: nextPlannedGeometry,
        statusLabel: 'Guidance completed',
        dataSource: source,
        generatedSummary: existing.generatedSummary,
      });
      resolvedTrip = await expeditionTripRecordStore.save(enriched);
    }

    const evaluated = await evaluateBadgesForCompletedTrip(resolvedTrip.id).catch(() => []);
    const currentTripBadges = await getBadgesForTrip(resolvedTrip.id).catch(() => evaluated);
    return {
      created: false,
      trip: resolvedTrip,
      badges: onlyNewBadges(beforeBadges, currentTripBadges.length > 0 ? currentTripBadges : evaluated),
    };
  }

  const activeTrip = existing?.status === 'active'
    ? existing
    : createNewActiveTripRecord({
        id,
        completionKey,
        expeditionId,
        title,
        startedAt: startedAtFromDuration(completedAt, durationSeconds),
        startCoordinate: recordedRouteGeometry[0] ?? plannedRouteGeometry[0] ?? null,
        routeGeometry: recordedRouteGeometry,
        plannedRouteGeometry,
        guidanceSessionId: guidanceSessionId ?? id,
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
    endCoordinate:
      recordedRouteGeometry[recordedRouteGeometry.length - 1] ??
      plannedRouteGeometry[plannedRouteGeometry.length - 1] ??
      activeTrip.endCoordinate,
    routeGeometry: hasDrawableGeometry(activeTrip.routeGeometry)
      ? activeTrip.routeGeometry
      : recordedRouteGeometry,
    plannedRouteGeometry: hasDrawableGeometry(activeTrip.plannedRouteGeometry)
      ? activeTrip.plannedRouteGeometry
      : plannedRouteGeometry,
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

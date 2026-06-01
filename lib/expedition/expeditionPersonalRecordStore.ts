import { createMigratingNonSecureStorage } from '../nonSecureStorage';
import { getUnlockedBadges } from './expeditionBadgeStore';
import { expeditionTripRecordStore } from './expeditionTripRecordStore';
import type {
  ExpeditionBadge,
  ExpeditionTripRecord,
  PersonalExpeditionRecord,
  PersonalExpeditionRecordType,
  PersonalExpeditionRecordUnit,
} from './expeditionTripRecordTypes';

const STORAGE_KEY = 'ecs_personal_expedition_records_v1';
const STORAGE_VERSION = 1;
const recordStorage = createMigratingNonSecureStorage('ecs_personal_expedition_records', {
  logTag: 'ExpeditionPersonalRecordStore',
});

type RecordComparator = 'max' | 'min';

type PersonalRecordDefinition = {
  type: PersonalExpeditionRecordType;
  title: string;
  unit: PersonalExpeditionRecordUnit;
  comparator: RecordComparator;
  valueForTrip: (trip: ExpeditionTripRecord, badgeCount: number) => number | null;
};

type PersistedPersonalExpeditionRecords = {
  version: number;
  records: PersonalExpeditionRecord[];
};

let hydratedSnapshot: PersistedPersonalExpeditionRecords | null = null;
let hydrationPromise: Promise<PersistedPersonalExpeditionRecords> | null = null;
let personalRecordEvaluationQueue: Promise<PersonalExpeditionRecord[]> = Promise.resolve([]);
let personalRecordReconciliationPromise: Promise<PersistedPersonalExpeditionRecords> | null = null;

function nowISO(): string {
  return new Date().toISOString();
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function recordTypeFromUnknown(value: unknown): PersonalExpeditionRecordType | null {
  return PERSONAL_RECORD_DEFINITIONS.some((definition) => definition.type === value)
    ? value as PersonalExpeditionRecordType
    : null;
}

function recordUnitFromUnknown(value: unknown): PersonalExpeditionRecordUnit | null {
  return value === 'miles' ||
    value === 'seconds' ||
    value === 'feet' ||
    value === 'count' ||
    value === 'mph' ||
    value === 'minutes_after_midnight'
    ? value
    : null;
}

function completedTimestamp(trip: ExpeditionTripRecord): number {
  const parsed = new Date(trip.completedAt ?? trip.updatedAt).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function achievedAtForTrip(trip: ExpeditionTripRecord): string {
  return trip.completedAt ?? trip.updatedAt;
}

function minutesAfterMidnight(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getHours() * 60 + parsed.getMinutes();
}

function distanceMiles(trip: ExpeditionTripRecord): number | null {
  return finitePositiveNumber(trip.totalDistanceMiles ?? trip.recap?.journeySummary.totalDistanceMiles);
}

function durationSeconds(trip: ExpeditionTripRecord): number | null {
  const seconds = trip.totalDurationSeconds;
  if (seconds != null) return finitePositiveNumber(seconds);
  const hours = trip.recap?.journeySummary.totalDurationHours;
  return hours == null ? null : finitePositiveNumber(hours * 3600);
}

function maxElevationFt(trip: ExpeditionTripRecord): number | null {
  return finitePositiveNumber(trip.maxElevationFt ?? trip.recap?.journeySummary.maxElevationFt);
}

function elevationGainFt(trip: ExpeditionTripRecord): number | null {
  return finitePositiveNumber(trip.totalElevationGainFt ?? trip.recap?.journeySummary.elevationGainFt);
}

function notableMomentCount(trip: ExpeditionTripRecord): number | null {
  return nonNegativeCount(Math.max(
    trip.notableMoments.length,
    trip.recap?.expeditionEvents.notableMoments.length ?? 0,
  ));
}

function weatherEventCount(trip: ExpeditionTripRecord): number | null {
  const conditions = new Set<string>();
  trip.weatherSnapshots.forEach((snapshot) => {
    if (snapshot.summary) conditions.add(snapshot.summary.toLowerCase());
    if (snapshot.precipitation) conditions.add(snapshot.precipitation.toLowerCase());
  });
  (trip.recap?.environmentSummary?.weatherConditionsEncountered ?? []).forEach((condition) => {
    if (condition) conditions.add(condition.toLowerCase());
  });
  return nonNegativeCount(Math.max(trip.weatherSnapshots.length, conditions.size));
}

function terrainEventCount(trip: ExpeditionTripRecord): number | null {
  return nonNegativeCount(
    trip.terrainRiskSnapshots.length +
      (trip.recap?.terrainSummary?.terrainRiskEvents?.length ?? 0) +
      (trip.recap?.terrainSummary?.steepGradeSegments?.length ?? 0),
  );
}

function routeDeviationCount(trip: ExpeditionTripRecord): number | null {
  return nonNegativeCount(
    trip.deviations.length +
      (trip.recap?.expeditionEvents.routeDeviations.length ?? 0) +
      (trip.recap?.expeditionEvents.reroutes.length ?? 0),
  );
}

function averageSpeedMph(trip: ExpeditionTripRecord): number | null {
  const miles = distanceMiles(trip);
  const seconds = durationSeconds(trip);
  if (miles == null || seconds == null || seconds <= 0) return null;
  const mph = miles / (seconds / 3600);
  return finitePositiveNumber(Math.round(mph * 10) / 10);
}

function finitePositiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function nonNegativeCount(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

const PERSONAL_RECORD_DEFINITIONS: PersonalRecordDefinition[] = [
  {
    type: 'longest_distance',
    title: 'Longest Expedition',
    unit: 'miles',
    comparator: 'max',
    valueForTrip: (trip) => distanceMiles(trip),
  },
  {
    type: 'longest_duration',
    title: 'Longest Duration',
    unit: 'seconds',
    comparator: 'max',
    valueForTrip: (trip) => durationSeconds(trip),
  },
  {
    type: 'highest_elevation',
    title: 'Highest Route',
    unit: 'feet',
    comparator: 'max',
    valueForTrip: (trip) => maxElevationFt(trip),
  },
  {
    type: 'greatest_elevation_gain',
    title: 'Greatest Elevation Gain',
    unit: 'feet',
    comparator: 'max',
    valueForTrip: (trip) => elevationGainFt(trip),
  },
  {
    type: 'most_notable_moments',
    title: 'Most Notable Moments',
    unit: 'count',
    comparator: 'max',
    valueForTrip: (trip) => notableMomentCount(trip),
  },
  {
    type: 'most_badges_earned',
    title: 'Most Badges Earned',
    unit: 'count',
    comparator: 'max',
    valueForTrip: (_trip, badgeCount) => nonNegativeCount(badgeCount),
  },
  {
    type: 'most_weather_events',
    title: 'Most Weather Events',
    unit: 'count',
    comparator: 'max',
    valueForTrip: (trip) => weatherEventCount(trip),
  },
  {
    type: 'most_terrain_events',
    title: 'Most Terrain Events',
    unit: 'count',
    comparator: 'max',
    valueForTrip: (trip) => terrainEventCount(trip),
  },
  {
    type: 'most_route_deviations',
    title: 'Most Route Deviations',
    unit: 'count',
    comparator: 'max',
    valueForTrip: (trip) => routeDeviationCount(trip),
  },
  {
    type: 'earliest_start',
    title: 'Earliest Start',
    unit: 'minutes_after_midnight',
    comparator: 'min',
    valueForTrip: (trip) => minutesAfterMidnight(trip.startedAt),
  },
  {
    type: 'latest_finish',
    title: 'Latest Finish',
    unit: 'minutes_after_midnight',
    comparator: 'max',
    valueForTrip: (trip) => minutesAfterMidnight(trip.completedAt),
  },
  {
    type: 'fastest_average_speed',
    title: 'Fastest Average Speed',
    unit: 'mph',
    comparator: 'max',
    valueForTrip: (trip) => averageSpeedMph(trip),
  },
  {
    type: 'slowest_average_speed',
    title: 'Slowest Average Speed',
    unit: 'mph',
    comparator: 'min',
    valueForTrip: (trip) => averageSpeedMph(trip),
  },
];

function definitionForType(type: PersonalExpeditionRecordType): PersonalRecordDefinition {
  return PERSONAL_RECORD_DEFINITIONS.find((definition) => definition.type === type) ?? PERSONAL_RECORD_DEFINITIONS[0];
}

function normalizeRecord(raw: unknown): PersonalExpeditionRecord | null {
  const input = raw as Partial<PersonalExpeditionRecord> | null | undefined;
  const id = nullableString(input?.id);
  const type = recordTypeFromUnknown(input?.type);
  const value = finiteNumberOrNull(input?.value);
  const tripId = nullableString(input?.tripId);
  const achievedAt = nullableString(input?.achievedAt);
  if (!id || !type || value == null || !tripId || !achievedAt) return null;

  const definition = definitionForType(type);
  const createdAt = nullableString(input?.createdAt) ?? achievedAt;
  return {
    id,
    type,
    title: nullableString(input?.title) ?? definition.title,
    value,
    unit: recordUnitFromUnknown(input?.unit) ?? definition.unit,
    tripId,
    achievedAt,
    previousValue: finiteNumberOrNull(input?.previousValue),
    isCurrentRecord: input?.isCurrentRecord === true,
    createdAt,
    updatedAt: nullableString(input?.updatedAt) ?? createdAt,
  };
}

async function loadSnapshot(): Promise<PersistedPersonalExpeditionRecords> {
  if (hydratedSnapshot) return hydratedSnapshot;
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    const raw = await recordStorage.read(STORAGE_KEY);
    if (!raw) {
      hydratedSnapshot = { version: STORAGE_VERSION, records: [] };
      return hydratedSnapshot;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedPersonalExpeditionRecords;
      const records = Array.isArray(parsed.records)
        ? parsed.records
            .map(normalizeRecord)
            .filter((record): record is PersonalExpeditionRecord => !!record)
        : [];
      hydratedSnapshot = { version: STORAGE_VERSION, records: normalizeCurrentRecordFlags(records) };
      return hydratedSnapshot;
    } catch {
      hydratedSnapshot = { version: STORAGE_VERSION, records: [] };
      return hydratedSnapshot;
    }
  })().finally(() => {
    hydrationPromise = null;
  });

  return hydrationPromise;
}

async function saveSnapshot(snapshot: PersistedPersonalExpeditionRecords): Promise<void> {
  hydratedSnapshot = {
    version: STORAGE_VERSION,
    records: normalizeCurrentRecordFlags(snapshot.records),
  };
  await recordStorage.write(STORAGE_KEY, JSON.stringify(hydratedSnapshot));
}

function badgeCountByTrip(badges: ExpeditionBadge[]): Map<string, number> {
  const counts = new Map<string, number>();
  badges.forEach((badge) => {
    if (!badge.unlockedAt || !badge.unlockedTripId) return;
    counts.set(badge.unlockedTripId, (counts.get(badge.unlockedTripId) ?? 0) + 1);
  });
  return counts;
}

function beatsRecord(candidate: number, current: number | null, comparator: RecordComparator): boolean {
  if (current == null) return true;
  return comparator === 'max' ? candidate > current : candidate < current;
}

function sortRecordHistory(a: PersonalExpeditionRecord, b: PersonalExpeditionRecord): number {
  return new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime();
}

function sortCurrentRecords(a: PersonalExpeditionRecord, b: PersonalExpeditionRecord): number {
  const rankDelta = currentRecordRank(a.type) - currentRecordRank(b.type);
  return rankDelta !== 0 ? rankDelta : sortRecordHistory(a, b);
}

function currentRecordRank(type: PersonalExpeditionRecordType): number {
  const ordered: PersonalExpeditionRecordType[] = [
    'longest_distance',
    'highest_elevation',
    'longest_duration',
    'greatest_elevation_gain',
    'most_badges_earned',
    'most_notable_moments',
    'fastest_average_speed',
    'latest_finish',
    'earliest_start',
    'most_weather_events',
    'most_terrain_events',
    'most_route_deviations',
    'slowest_average_speed',
  ];
  return ordered.indexOf(type) === -1 ? ordered.length : ordered.indexOf(type);
}

function normalizeCurrentRecordFlags(records: PersonalExpeditionRecord[]): PersonalExpeditionRecord[] {
  const currentIds = new Set<string>();
  for (const definition of PERSONAL_RECORD_DEFINITIONS) {
    const candidates = records.filter((record) => record.type === definition.type);
    if (candidates.length === 0) continue;
    const current = candidates.reduce((best, record) => {
      if (beatsRecord(record.value, best.value, definition.comparator)) return record;
      if (record.value === best.value && new Date(record.achievedAt).getTime() > new Date(best.achievedAt).getTime()) {
        return record;
      }
      return best;
    }, candidates[0]);
    currentIds.add(current.id);
  }

  return records
    .map((record) => ({
      ...record,
      isCurrentRecord: currentIds.has(record.id),
    }))
    .sort(sortRecordHistory);
}

function previousBestForDefinition(
  definition: PersonalRecordDefinition,
  targetTrip: ExpeditionTripRecord,
  completedTrips: ExpeditionTripRecord[],
  countsByTrip: Map<string, number>,
): { value: number; tripId: string } | null {
  const targetCompletedAt = completedTimestamp(targetTrip);
  const previousTrips = completedTrips.filter((trip) => trip.id !== targetTrip.id && completedTimestamp(trip) < targetCompletedAt);
  let best: { value: number; tripId: string } | null = null;

  for (const trip of previousTrips) {
    const value = definition.valueForTrip(trip, countsByTrip.get(trip.id) ?? trip.badgesUnlocked.length);
    if (value == null) continue;
    if (!best || beatsRecord(value, best.value, definition.comparator)) {
      best = { value, tripId: trip.id };
    }
  }

  return best;
}

function buildRecordForTrip(
  definition: PersonalRecordDefinition,
  targetTrip: ExpeditionTripRecord,
  completedTrips: ExpeditionTripRecord[],
  countsByTrip: Map<string, number>,
  timestamp: string,
): PersonalExpeditionRecord | null {
  const value = definition.valueForTrip(targetTrip, countsByTrip.get(targetTrip.id) ?? targetTrip.badgesUnlocked.length);
  if (value == null) return null;
  const previous = previousBestForDefinition(definition, targetTrip, completedTrips, countsByTrip);
  if (!beatsRecord(value, previous?.value ?? null, definition.comparator)) return null;
  const achievedAt = achievedAtForTrip(targetTrip);

  return {
    id: `personal-record:${definition.type}:${targetTrip.id}`,
    type: definition.type,
    title: definition.title,
    value,
    unit: definition.unit,
    tripId: targetTrip.id,
    achievedAt,
    previousValue: previous?.value ?? null,
    isCurrentRecord: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildRecordsFromHistory(
  completedTrips: ExpeditionTripRecord[],
  badges: ExpeditionBadge[],
  timestamp: string,
): PersonalExpeditionRecord[] {
  const countsByTrip = badgeCountByTrip(badges);
  const chronologicalTrips = [...completedTrips].sort((a, b) => completedTimestamp(a) - completedTimestamp(b));
  const records: PersonalExpeditionRecord[] = [];

  chronologicalTrips.forEach((trip) => {
    PERSONAL_RECORD_DEFINITIONS.forEach((definition) => {
      const record = buildRecordForTrip(definition, trip, chronologicalTrips, countsByTrip, timestamp);
      if (record) records.push(record);
    });
  });

  return normalizeCurrentRecordFlags(records);
}

function recordSetSignature(records: PersonalExpeditionRecord[]): string {
  return [...records]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((record) => [
      record.id,
      record.type,
      record.value,
      record.unit,
      record.tripId,
      record.achievedAt,
      record.previousValue ?? '',
      record.isCurrentRecord ? 'current' : 'history',
    ].join('|'))
    .join('\n');
}

async function hydrateFromTripHistoryIfNeeded(snapshot: PersistedPersonalExpeditionRecords): Promise<PersistedPersonalExpeditionRecords> {
  const completedTrips = await expeditionTripRecordStore.getCompleted();
  if (completedTrips.length === 0) return snapshot;
  const badges = await getUnlockedBadges().catch(() => []);
  await personalRecordEvaluationQueue.catch(() => []);

  const latestSnapshot = await loadSnapshot();
  const existingById = new Map(latestSnapshot.records.map((record) => [record.id, record]));
  const records = buildRecordsFromHistory(completedTrips, badges, nowISO()).map((record) => {
    const existing = existingById.get(record.id);
    return existing
      ? {
          ...record,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        }
      : record;
  });
  if (records.length === 0) return snapshot;
  const hydrated = { version: STORAGE_VERSION, records: normalizeCurrentRecordFlags(records) };
  if (recordSetSignature(latestSnapshot.records) === recordSetSignature(hydrated.records)) {
    return latestSnapshot;
  }
  await saveSnapshot(hydrated);
  return hydrated;
}

async function reconcilePersonalRecordsFromTripHistory(): Promise<PersistedPersonalExpeditionRecords> {
  if (personalRecordReconciliationPromise) return personalRecordReconciliationPromise;
  personalRecordReconciliationPromise = (async () => {
    await personalRecordEvaluationQueue.catch(() => []);
    return hydrateFromTripHistoryIfNeeded(await loadSnapshot());
  })().finally(() => {
    personalRecordReconciliationPromise = null;
  });
  return personalRecordReconciliationPromise;
}

async function evaluatePersonalRecordsForCompletedTripNow(tripId: string): Promise<PersonalExpeditionRecord[]> {
  try {
    const trip = await expeditionTripRecordStore.getById(tripId);
    if (!trip || trip.status !== 'completed') return [];

    const [completedTrips, badges] = await Promise.all([
      expeditionTripRecordStore.getCompleted(),
      getUnlockedBadges().catch(() => []),
    ]);
    const countsByTrip = badgeCountByTrip(badges);
    const timestamp = nowISO();
    const newRecords = PERSONAL_RECORD_DEFINITIONS
      .map((definition) => buildRecordForTrip(definition, trip, completedTrips, countsByTrip, timestamp))
      .filter((record): record is PersonalExpeditionRecord => !!record);

    if (newRecords.length === 0) return [];

    const latestSnapshot = await loadSnapshot();
    const existingById = new Map(latestSnapshot.records.map((record) => [record.id, record]));
    newRecords.forEach((record) => existingById.set(record.id, record));
    const nextRecords = normalizeCurrentRecordFlags(Array.from(existingById.values()));
    await saveSnapshot({ version: STORAGE_VERSION, records: nextRecords });
    return nextRecords.filter((record) => record.tripId === trip.id);
  } catch {
    return [];
  }
}

export async function evaluatePersonalRecordsForCompletedTrip(tripId: string): Promise<PersonalExpeditionRecord[]> {
  const evaluation = personalRecordEvaluationQueue
    .catch(() => [])
    .then(() => evaluatePersonalRecordsForCompletedTripNow(tripId));
  personalRecordEvaluationQueue = evaluation.catch(() => []);
  return evaluation;
}

export async function getCurrentPersonalRecords(): Promise<PersonalExpeditionRecord[]> {
  const snapshot = await reconcilePersonalRecordsFromTripHistory();
  return snapshot.records
    .filter((record) => record.isCurrentRecord)
    .sort(sortCurrentRecords);
}

export async function getRecordsForTrip(tripId: string): Promise<PersonalExpeditionRecord[]> {
  const snapshot = await reconcilePersonalRecordsFromTripHistory();
  return snapshot.records
    .filter((record) => record.tripId === tripId)
    .sort(sortCurrentRecords);
}

export async function getRecordHistory(recordType: PersonalExpeditionRecordType): Promise<PersonalExpeditionRecord[]> {
  const snapshot = await reconcilePersonalRecordsFromTripHistory();
  return snapshot.records
    .filter((record) => record.type === recordType)
    .sort(sortRecordHistory);
}

export async function didTripSetRecord(tripId: string): Promise<boolean> {
  const records = await getRecordsForTrip(tripId);
  return records.length > 0;
}

export async function clearAllPersonalExpeditionRecordsForTests(): Promise<void> {
  const empty = { version: STORAGE_VERSION, records: [] };
  hydratedSnapshot = empty;
  personalRecordEvaluationQueue = Promise.resolve([]);
  personalRecordReconciliationPromise = null;
  await recordStorage.write(STORAGE_KEY, JSON.stringify(empty));
}

// TODO Expedition Personal Records: connect record-breaking badge triggers after badge definitions can depend on stored records.
// TODO Expedition Personal Records: add record comparison charts, export record stamps, yearly records, and seasonal records.

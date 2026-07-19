import type { ExpeditionOpportunity } from '../discoverEngine';

export type ExploreRefinementFilter = 'remoteness' | 'dayTrip' | 'weekendTrip' | 'expedition';

export const EXPLORE_REFINEMENT_OPTIONS: { key: ExploreRefinementFilter; label: string }[] = [
  { key: 'remoteness', label: 'Remoteness' },
  { key: 'dayTrip', label: 'Day Trip' },
  { key: 'weekendTrip', label: 'Weekend Trip' },
  { key: 'expedition', label: 'Expedition' },
];

type RefinableTrail = Partial<ExpeditionOpportunity> & object;
type UnknownRecord = Record<string, unknown>;

const DAY_TRIP_MAX_HOURS = 12;
const WEEKEND_TRIP_MAX_HOURS = 24;
const EXPEDITION_MIN_DISTANCE_MILES = 150;
const REMOTE_NEAREST_TOWN_OR_SERVICE_MILES = 15;
const REMOTE_NEAREST_PAVED_ROAD_MILES = 8;

const NESTED_FIELD_GROUPS = [
  'metadata',
  'routeMetadata',
  'route_metadata',
  'sourceMetadata',
  'source_metadata',
  'properties',
  'assessment',
  'readiness',
  'trip',
  'routeIntelligence',
  'route_intelligence',
  'routeCatalogOperationalCriteria',
  'route_catalog_operational_criteria',
  'operationalCriteria',
  'operational_criteria',
] as const;

const DURATION_HOUR_FIELDS = [
  'estimatedHours',
  'durationHours',
  'estimatedTravelHours',
  'estimatedDurationHours',
  'routeDurationHours',
  'travelTimeHours',
] as const;

const DURATION_MINUTE_FIELDS = [
  'estimatedMinutes',
  'durationMinutes',
  'estimatedDurationMinutes',
  'routeDurationMinutes',
  'travelTimeMinutes',
] as const;

const DURATION_DAY_FIELDS = [
  'estimatedDays',
  'durationDays',
  'routeDurationDays',
  'tripDays',
] as const;

const SOCIETY_DISTANCE_FIELDS = [
  'distanceToNearestTownMiles',
  'nearestTownDistanceMiles',
  'nearestTownMiles',
  'distanceFromNearestTownMiles',
  'milesFromTown',
  'milesFromNearestTown',
  'distanceToNearestCityMiles',
  'nearestCityDistanceMiles',
  'distanceToNearestCommunityMiles',
  'nearestCommunityDistanceMiles',
  'distanceToNearestSettlementMiles',
  'nearestSettlementDistanceMiles',
  'distanceToNearestServicesMiles',
  'nearestServicesDistanceMiles',
  'servicesDistanceMiles',
  'nearestFuelDistanceMiles',
] as const;

const PAVED_ACCESS_DISTANCE_FIELDS = [
  'distanceToNearestPavedRoadMiles',
  'nearestPavedRoadDistanceMiles',
  'distanceFromPavedRoadMiles',
  'pavedRoadDistanceMiles',
  'serviceRoadDistanceMiles',
] as const;

const DISTANCE_MILE_FIELDS = [
  'distanceMiles',
  'routeMiles',
  'miles',
  'lengthMiles',
  'routeLengthMiles',
] as const;

function asRecord(value: unknown): UnknownRecord | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as UnknownRecord;
  }
  return null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const clean = value.trim().replace(/,/g, '');
    const parsed = Number(clean);
    if (Number.isFinite(parsed)) return parsed;

    const matchedNumber = clean.match(/-?\d+(?:\.\d+)?/);
    if (!matchedNumber) return null;
    const parsedMatched = Number(matchedNumber[0]);
    return Number.isFinite(parsedMatched) ? parsedMatched : null;
  }
  return null;
}

function candidateRecords(trail: RefinableTrail): UnknownRecord[] {
  const root = trail as UnknownRecord;
  const records = [root];

  // Catalog records may wrap operational intelligence inside normalized
  // metadata. Walk only the known field groups so the client evaluates the
  // same refinement facts as the Edge function without traversing arbitrary
  // payload data.
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    for (const key of NESTED_FIELD_GROUPS) {
      const nested = asRecord(record[key]);
      if (nested && !records.includes(nested)) records.push(nested);
    }
  }

  return records;
}

function readFirstNumber(trail: RefinableTrail, keys: readonly string[]): number | null {
  for (const record of candidateRecords(trail)) {
    for (const key of keys) {
      const parsed = finiteNumber(record[key]);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

function readFirstBoolean(trail: RefinableTrail, keys: readonly string[]): boolean | null {
  for (const record of candidateRecords(trail)) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', 'yes', 'required'].includes(normalized)) return true;
        if (['false', 'no', 'none', 'not required'].includes(normalized)) return false;
      }
    }
  }
  return null;
}

function getSearchableTrailText(trail: RefinableTrail): string {
  const fields = trail as Partial<ExpeditionOpportunity> & UnknownRecord;
  return [
    fields.tripMode,
    fields.routeLabel,
    fields.category,
    fields.discoveryCategory,
    fields.name,
    fields.description,
    ...(Array.isArray(fields.highlights) ? fields.highlights : []),
    ...(Array.isArray(fields.tags) ? fields.tags : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function getTrailDurationHours(trail: RefinableTrail): number | null {
  const directHours = readFirstNumber(trail, DURATION_HOUR_FIELDS);
  if (directHours != null) return directHours;

  const durationMinutes = readFirstNumber(trail, DURATION_MINUTE_FIELDS);
  if (durationMinutes != null) return Math.max(0.1, durationMinutes / 60);

  const directDays = readFirstNumber(trail, DURATION_DAY_FIELDS);
  if (directDays != null) return Math.max(0.1, directDays * DAY_TRIP_MAX_HOURS);

  return null;
}

export function getTrailDurationDays(trail: RefinableTrail): number | null {
  const directDays = readFirstNumber(trail, DURATION_DAY_FIELDS);
  if (directDays != null) return directDays;

  const durationHours = getTrailDurationHours(trail);
  if (durationHours != null) {
    return Math.max(0.1, durationHours / DAY_TRIP_MAX_HOURS);
  }

  return null;
}

function getTrailDistanceMiles(trail: RefinableTrail): number | null {
  return readFirstNumber(trail, DISTANCE_MILE_FIELDS);
}

function getNearestTownOrServiceMiles(trail: RefinableTrail): number | null {
  return readFirstNumber(trail, SOCIETY_DISTANCE_FIELDS);
}

function getNearestPavedAccessMiles(trail: RefinableTrail): number | null {
  return readFirstNumber(trail, PAVED_ACCESS_DISTANCE_FIELDS);
}

function getTrailDurationHint(trail: RefinableTrail): ExploreRefinementFilter | null {
  const searchable = getSearchableTrailText(trail);

  if (/\b(day trip|day-trip|short route|local route|same day|same-day|single day)\b/.test(searchable)) {
    return 'dayTrip';
  }
  if (/\b(weekend|overnight|two day|2 day|1-2 day|1 to 2 day)\b/.test(searchable)) {
    return 'weekendTrip';
  }
  if (/\b(expedition|multi-day|multi day|backcountry travel|extended travel)\b/.test(searchable)) {
    return 'expedition';
  }

  return null;
}

function trailRequiresCamping(trail: RefinableTrail): boolean {
  const explicit = readFirstBoolean(trail, [
    'requiresCamping',
    'campingRequired',
    'overnightRequired',
    'requiresOvernight',
  ]);
  if (explicit != null) return explicit;

  const searchable = getSearchableTrailText(trail);
  return /\b(overnight|requires camping|camping required|camp required|multi-day|multi day)\b/.test(searchable);
}

function normalizedRemoteScore(value: unknown): number | null {
  const score = finiteNumber(value);
  if (score == null) return null;
  if (score <= 1) return score * 10;
  if (score <= 10) return score;
  return score / 10;
}

function distanceBasedRemotenessScore(trail: RefinableTrail): number | null {
  const societyDistance = getNearestTownOrServiceMiles(trail);
  const pavedAccessDistance = getNearestPavedAccessMiles(trail);
  const scores = [
    societyDistance != null
      ? Math.max(0, Math.min(10, 5 + (societyDistance - REMOTE_NEAREST_TOWN_OR_SERVICE_MILES) / 2))
      : null,
    pavedAccessDistance != null
      ? Math.max(0, Math.min(8, 5 + (pavedAccessDistance - REMOTE_NEAREST_PAVED_ROAD_MILES)))
      : null,
  ].filter((score): score is number => score != null);

  return scores.length > 0 ? Math.max(...scores) : null;
}

function hasExplicitIsolationDistance(trail: RefinableTrail): boolean {
  return getNearestTownOrServiceMiles(trail) != null || getNearestPavedAccessMiles(trail) != null;
}

function hasRemoteIsolationDistance(trail: RefinableTrail): boolean {
  const societyDistance = getNearestTownOrServiceMiles(trail);
  const pavedAccessDistance = getNearestPavedAccessMiles(trail);
  return (
    (societyDistance != null && societyDistance >= REMOTE_NEAREST_TOWN_OR_SERVICE_MILES) ||
    (pavedAccessDistance != null && pavedAccessDistance >= REMOTE_NEAREST_PAVED_ROAD_MILES)
  );
}

function matchesTripHint(trail: RefinableTrail, refinement: ExploreRefinementFilter): boolean {
  const hint = getTrailDurationHint(trail);
  if (hint === refinement) return true;

  if (refinement === 'expedition') {
    const distanceMiles = getTrailDistanceMiles(trail);
    return distanceMiles != null && distanceMiles >= EXPEDITION_MIN_DISTANCE_MILES;
  }

  return false;
}

function matchesDayTrip(trail: RefinableTrail): boolean {
  if (trailRequiresCamping(trail)) return false;

  const durationHours = getTrailDurationHours(trail);
  if (durationHours != null) return durationHours <= DAY_TRIP_MAX_HOURS;

  return matchesTripHint(trail, 'dayTrip');
}

function matchesWeekendTrip(trail: RefinableTrail): boolean {
  const durationHours = getTrailDurationHours(trail);
  if (durationHours != null) {
    return durationHours > DAY_TRIP_MAX_HOURS && durationHours <= WEEKEND_TRIP_MAX_HOURS;
  }

  return matchesTripHint(trail, 'weekendTrip');
}

function matchesExpedition(trail: RefinableTrail): boolean {
  const durationHours = getTrailDurationHours(trail);
  if (durationHours != null) return durationHours > WEEKEND_TRIP_MAX_HOURS;

  return matchesTripHint(trail, 'expedition');
}

export function getExploreRemotenessSortScore(trail: RefinableTrail): number {
  const fields = trail as Partial<ExpeditionOpportunity> & UnknownRecord;
  const distanceScore = distanceBasedRemotenessScore(trail);
  if (distanceScore != null) return Math.max(0, distanceScore);

  const remoteness = normalizedRemoteScore(fields.remotenessScore);
  if (remoteness != null) return remoteness;

  const solitude = normalizedRemoteScore(fields.solitudeScore);
  if (solitude != null) return solitude;

  const popularity = finiteNumber(fields.popularityScore ?? fields.popularity);
  if (popularity != null) {
    const normalizedPopularity = popularity <= 1 ? popularity * 100 : popularity;
    return Math.max(0, Math.min(10, (100 - normalizedPopularity) / 10));
  }

  if (fields.hiddenGem === true) return 7;

  const label = String(fields.routeLabel ?? '').toLowerCase();
  if (label.includes('remote')) return 8;
  if (label.includes('hidden gem')) return 7;
  return 0;
}

export function isRemoteTrail(trail: RefinableTrail): boolean {
  const fields = trail as Partial<ExpeditionOpportunity> & UnknownRecord;
  if (hasExplicitIsolationDistance(trail)) {
    return hasRemoteIsolationDistance(trail);
  }

  const remoteness = normalizedRemoteScore(fields.remotenessScore);
  if (remoteness != null) return remoteness >= 7;

  const solitude = normalizedRemoteScore(fields.solitudeScore);
  if (solitude != null) return solitude >= 7;

  const popularity = finiteNumber(fields.popularityScore ?? fields.popularity);
  if (popularity != null) {
    const normalizedPopularity = popularity <= 1 ? popularity * 100 : popularity;
    return normalizedPopularity <= 30;
  }

  if (fields.hiddenGem === true) return true;

  const label = String(fields.routeLabel ?? '').toLowerCase();
  return label.includes('remote') || label.includes('hidden gem');
}

export function trailMatchesExploreRefinement(
  trail: RefinableTrail,
  refinement: ExploreRefinementFilter | null,
): boolean {
  if (!refinement) return true;

  if (refinement === 'remoteness') {
    return isRemoteTrail(trail);
  }

  switch (refinement) {
    case 'dayTrip':
      return matchesDayTrip(trail);
    case 'weekendTrip':
      return matchesWeekendTrip(trail);
    case 'expedition':
      return matchesExpedition(trail);
    default:
      return true;
  }
}

export function applyExploreRefinementFilter<T extends RefinableTrail>(
  trails: T[],
  refinement: ExploreRefinementFilter | null,
): T[] {
  if (!refinement) return trails;
  if (refinement === 'remoteness') {
    return trails
      .filter(isRemoteTrail)
      .sort((left, right) => {
        const scoreDiff = getExploreRemotenessSortScore(right) - getExploreRemotenessSortScore(left);
        if (scoreDiff !== 0) return scoreDiff;
        const leftName = String((left as UnknownRecord).name ?? '');
        const rightName = String((right as UnknownRecord).name ?? '');
        const nameDiff = leftName.localeCompare(rightName);
        if (nameDiff !== 0) return nameDiff;
        const leftId = String((left as UnknownRecord).id ?? '');
        const rightId = String((right as UnknownRecord).id ?? '');
        return leftId.localeCompare(rightId);
      });
  }
  return trails.filter((trail) => trailMatchesExploreRefinement(trail, refinement));
}

export function getExploreRefinementCounts<T extends RefinableTrail>(
  trails: T[],
): Record<ExploreRefinementFilter, number> {
  return EXPLORE_REFINEMENT_OPTIONS.reduce(
    (counts, option) => {
      counts[option.key] = applyExploreRefinementFilter(trails, option.key).length;
      return counts;
    },
    {
      remoteness: 0,
      dayTrip: 0,
      weekendTrip: 0,
      expedition: 0,
    } as Record<ExploreRefinementFilter, number>,
  );
}

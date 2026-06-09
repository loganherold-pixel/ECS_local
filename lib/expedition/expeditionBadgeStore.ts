import { createMigratingNonSecureStorage } from '../nonSecureStorage';
import {
  BADGE_IDENTITY_MVP_BADGE_MAPPING,
  isBadgeIdentitySignalDeferred,
  isBadgeIdentitySignalSafe,
  type BadgeIdentityMvpSignalId,
} from './badgeExpeditionIdentityReadiness';
import {
  EXPEDITION_BADGE_DEFINITIONS,
  getBadgeDefinition,
} from './expeditionBadgeRegistry';
import {
  expeditionTripRecordStore,
  safelyAppendBadgeIds,
} from './expeditionTripRecordStore';
import type {
  ExpeditionBadge,
  ExpeditionBadgeDefinition,
  ExpeditionTripRecord,
} from './expeditionTripRecordTypes';

const STORAGE_KEY = 'ecs_expedition_badges_v1';
const STORAGE_VERSION = 1;
const badgeStorage = createMigratingNonSecureStorage('ecs_expedition_badges', {
  logTag: 'ExpeditionBadgeStore',
});

type PersistedExpeditionBadges = {
  version: number;
  badges: ExpeditionBadge[];
};

export type BadgeIdentitySafeSignalInput = {
  signalId: string;
  source?: string | null;
  occurredAt?: string | null;
  sourceQuality?: string | null;
  dataQuality?: string | null;
  isDemo?: boolean | null;
  isMock?: boolean | null;
};

type BadgeEvaluationContext = {
  trip: ExpeditionTripRecord;
  completedTrips: ExpeditionTripRecord[];
  previousTrips: ExpeditionTripRecord[];
  totalCompletedTrips: number;
  totalMiles: number;
  totalHours: number;
  totalRecoveryUsageCount: number;
  tripMiles: number;
  tripHours: number;
  maxHistoricalElevationFt: number;
  previousMaxElevationFt: number;
  tripMaxElevationFt: number;
  tripElevationGainFt: number;
  weatherTerms: string[];
  terrainTerms: string[];
  terrainRiskCount: number;
  totalTerrainRiskCount: number;
  routeEventCount: number;
  recoveryUsageCount: number;
  notableMomentCount: number;
  totalNotableMomentCount: number;
  campViewedCount: number;
  resupplyViewedCount: number;
  bailoutUsedCount: number;
  startedHour: number | null;
  completedHour: number | null;
  completedMonth: number | null;
  contextText: string;
};

let hydratedSnapshot: PersistedExpeditionBadges | null = null;
let hydrationPromise: Promise<PersistedExpeditionBadges> | null = null;
let badgeReconciliationPromise: Promise<void> | null = null;
let badgeEvaluationQueue: Promise<ExpeditionBadge[]> = Promise.resolve([]);

function nowISO(): string {
  return new Date().toISOString();
}

function finiteNumberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function qualityToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isMockOrDemoSignal(input: BadgeIdentitySafeSignalInput): boolean {
  if (input.isDemo || input.isMock) return true;
  const tokens = [
    input.source,
    input.sourceQuality,
    input.dataQuality,
  ].map(qualityToken);
  return tokens.some((token) => (
    token.includes('mock') ||
    token.includes('demo') ||
    token.includes('fixture') ||
    token.includes('test_only')
  ));
}

function badgeIdForSafeSignal(signalId: string): string | null {
  if (!isBadgeIdentitySignalSafe(signalId) || isBadgeIdentitySignalDeferred(signalId)) return null;
  return BADGE_IDENTITY_MVP_BADGE_MAPPING[signalId as BadgeIdentityMvpSignalId] ?? null;
}

function badgeCategoryFromUnknown(value: unknown): ExpeditionBadge['category'] {
  return value === 'firsts' ||
    value === 'distance' ||
    value === 'elevation' ||
    value === 'duration' ||
    value === 'weather' ||
    value === 'terrain' ||
    value === 'recovery' ||
    value === 'route_behavior' ||
    value === 'time_of_day' ||
    value === 'exploration' ||
    value === 'remoteness' ||
    value === 'notable_moments' ||
    value === 'personal_records' ||
    value === 'seasonal' ||
    value === 'expedition_history' ||
    value === 'consistency' ||
    value === 'hidden'
    ? value
    : 'exploration';
}

function badgeRarityFromUnknown(value: unknown): ExpeditionBadge['rarity'] {
  return value === 'common' ||
    value === 'uncommon' ||
    value === 'rare' ||
    value === 'epic' ||
    value === 'legendary' ||
    value === 'hidden'
    ? value
    : 'common';
}

function normalizeBadge(raw: unknown): ExpeditionBadge | null {
  const input = raw as Partial<ExpeditionBadge> | null | undefined;
  const id = nullableString(input?.id);
  if (!id) return null;
  const definition = getBadgeDefinition(id);
  const createdAt = nullableString(input?.createdAt) ?? definition?.createdAt ?? nowISO();
  const updatedAt = nullableString(input?.updatedAt) ?? nullableString(input?.unlockedAt) ?? createdAt;

  return {
    id,
    title: nullableString(input?.title) ?? definition?.title ?? 'Expedition Badge',
    description: nullableString(input?.description) ?? definition?.description ?? 'Expedition achievement earned.',
    category: definition?.category ?? badgeCategoryFromUnknown(input?.category),
    rarity: definition?.rarity ?? badgeRarityFromUnknown(input?.rarity),
    iconKey: nullableString(input?.iconKey) ?? definition?.iconKey ?? 'patch',
    unlockedAt: nullableString(input?.unlockedAt),
    unlockedTripId: nullableString(input?.unlockedTripId),
    isHidden: typeof input?.isHidden === 'boolean' ? input.isHidden : definition?.isHidden ?? false,
    isRepeatable: typeof input?.isRepeatable === 'boolean' ? input.isRepeatable : definition?.isRepeatable ?? false,
    progressCurrent: finiteNumberOrNull(input?.progressCurrent),
    progressTarget: finiteNumberOrNull(input?.progressTarget) ?? definition?.progressTarget ?? null,
    createdAt,
    updatedAt,
  };
}

function badgeFromDefinition(
  definition: ExpeditionBadgeDefinition,
  input: {
    unlockedAt?: string | null;
    unlockedTripId?: string | null;
    progressCurrent?: number | null;
  } = {},
): ExpeditionBadge {
  const unlockedAt = input.unlockedAt ?? null;
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    category: definition.category,
    rarity: definition.rarity,
    iconKey: definition.iconKey,
    unlockedAt,
    unlockedTripId: input.unlockedTripId ?? null,
    isHidden: definition.isHidden,
    isRepeatable: definition.isRepeatable,
    progressCurrent: input.progressCurrent ?? null,
    progressTarget: definition.progressTarget,
    createdAt: definition.createdAt,
    updatedAt: unlockedAt ?? definition.createdAt,
  };
}

function sortNewestBadges(a: ExpeditionBadge, b: ExpeditionBadge): number {
  return new Date(b.unlockedAt ?? b.updatedAt).getTime() - new Date(a.unlockedAt ?? a.updatedAt).getTime();
}

async function loadSnapshot(): Promise<PersistedExpeditionBadges> {
  if (hydratedSnapshot) return hydratedSnapshot;
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    const raw = await badgeStorage.read(STORAGE_KEY);
    if (!raw) {
      hydratedSnapshot = { version: STORAGE_VERSION, badges: [] };
      return hydratedSnapshot;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedExpeditionBadges;
      const badges = Array.isArray(parsed.badges)
        ? parsed.badges
            .map(normalizeBadge)
            .filter((badge): badge is ExpeditionBadge => !!badge)
        : [];
      hydratedSnapshot = { version: STORAGE_VERSION, badges };
      return hydratedSnapshot;
    } catch {
      hydratedSnapshot = { version: STORAGE_VERSION, badges: [] };
      return hydratedSnapshot;
    }
  })().finally(() => {
    hydrationPromise = null;
  });

  return hydrationPromise;
}

async function saveSnapshot(snapshot: PersistedExpeditionBadges): Promise<void> {
  hydratedSnapshot = snapshot;
  await badgeStorage.write(STORAGE_KEY, JSON.stringify(snapshot));
}

function getHour(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours();
}

function getMonth(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getMonth();
}

function getDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getDay();
}

function uniqueLowercaseTerms(values: Array<string | null | undefined>): string[] {
  const terms = new Set<string>();
  values.forEach((value) => {
    if (typeof value === 'string' && value.trim().length > 0) {
      terms.add(value.trim().toLowerCase());
    }
  });
  return Array.from(terms);
}

function getTripHours(trip: ExpeditionTripRecord): number {
  const seconds = trip.totalDurationSeconds;
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return 0;
  return seconds / 3600;
}

function getTripMiles(trip: ExpeditionTripRecord): number {
  return trip.totalDistanceMiles ?? trip.recap?.journeySummary.totalDistanceMiles ?? 0;
}

function getTripMaxElevation(trip: ExpeditionTripRecord): number {
  return trip.maxElevationFt ?? trip.recap?.journeySummary.maxElevationFt ?? 0;
}

function getTripElevationGain(trip: ExpeditionTripRecord): number {
  return trip.totalElevationGainFt ?? trip.recap?.journeySummary.elevationGainFt ?? 0;
}

function getTripTerrainRiskCount(trip: ExpeditionTripRecord): number {
  return trip.terrainRiskSnapshots.length + (trip.recap?.terrainSummary?.terrainRiskEvents?.length ?? 0);
}

function getTripRouteEventCount(trip: ExpeditionTripRecord): number {
  return (
    trip.deviations.length +
    (trip.recap?.expeditionEvents.routeDeviations.length ?? 0) +
    (trip.recap?.expeditionEvents.reroutes.length ?? 0)
  );
}

function getTripRecoveryUsageCount(trip: ExpeditionTripRecord): number {
  return trip.recoveryPanelUsed.length + (trip.recap?.expeditionEvents.recoveryPanelUsage.length ?? 0);
}

function getTripNotableMomentCount(trip: ExpeditionTripRecord): number {
  return Math.max(trip.notableMoments.length, trip.recap?.expeditionEvents.notableMoments.length ?? 0);
}

function getAverageSpeedMph(trip: ExpeditionTripRecord): number {
  const hours = getTripHours(trip);
  return hours > 0 ? getTripMiles(trip) / hours : 0;
}

function tripMaxTemperature(trip: ExpeditionTripRecord): number | null {
  const snapshotTemps = trip.weatherSnapshots
    .map((snapshot) => snapshot.temperatureF)
    .filter((value): value is number => Number.isFinite(value));
  const recapMax = trip.recap?.environmentSummary?.temperatureRange?.maxF;
  const values = [...snapshotTemps, ...(Number.isFinite(recapMax) ? [recapMax as number] : [])];
  return values.length > 0 ? Math.max(...values) : null;
}

function tripMinTemperature(trip: ExpeditionTripRecord): number | null {
  const snapshotTemps = trip.weatherSnapshots
    .map((snapshot) => snapshot.temperatureF)
    .filter((value): value is number => Number.isFinite(value));
  const recapMin = trip.recap?.environmentSummary?.temperatureRange?.minF;
  const values = [...snapshotTemps, ...(Number.isFinite(recapMin) ? [recapMin as number] : [])];
  return values.length > 0 ? Math.min(...values) : null;
}

function temperatureRange(trip: ExpeditionTripRecord): number {
  const min = tripMinTemperature(trip);
  const max = tripMaxTemperature(trip);
  return min != null && max != null ? max - min : 0;
}

function routeContextTerms(trip: ExpeditionTripRecord): string[] {
  return [
    trip.title,
    trip.routeTitle,
    trip.routeSubtitle,
    trip.guidanceSource,
    trip.generatedSummary?.text,
    trip.recap?.generatedNarrative.headline,
    trip.recap?.generatedNarrative.summaryParagraph,
    ...trip.weatherSnapshots.map((snapshot) => snapshot.summary),
    ...trip.weatherSnapshots.map((snapshot) => snapshot.precipitation),
    ...trip.terrainRiskSnapshots.map((snapshot) => snapshot.summary),
    ...(trip.recap?.environmentSummary?.weatherConditionsEncountered ?? []),
    ...(trip.recap?.environmentSummary?.sunlightConditions ?? []),
    ...(trip.recap?.terrainSummary?.terrainRiskEvents?.map((event) => event.summary) ?? []),
    ...(trip.recap?.expeditionEvents.notableMoments.map((moment) => `${moment.title} ${moment.detail ?? ''}`) ?? []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function buildEvaluationContext(trip: ExpeditionTripRecord, completedTrips: ExpeditionTripRecord[]): BadgeEvaluationContext {
  const normalizedCompletedTrips = completedTrips.some((item) => item.id === trip.id)
    ? completedTrips
    : [...completedTrips, trip];
  const previousTrips = normalizedCompletedTrips.filter((item) => item.id !== trip.id);
  const tripMiles = getTripMiles(trip);
  const tripHours = getTripHours(trip);
  const tripMaxElevationFt = getTripMaxElevation(trip);
  const previousMaxElevationFt = previousTrips.reduce(
    (max, item) => Math.max(max, getTripMaxElevation(item)),
    0,
  );
  const weatherTerms = uniqueLowercaseTerms([
    ...trip.weatherSnapshots.map((snapshot) => snapshot.summary),
    ...trip.weatherSnapshots.map((snapshot) => snapshot.precipitation),
    ...(trip.recap?.environmentSummary?.weatherConditionsEncountered ?? []),
  ]);
  const terrainTerms = uniqueLowercaseTerms([
    trip.routeTitle,
    trip.routeSubtitle,
    trip.generatedSummary?.text,
    trip.recap?.generatedNarrative.summaryParagraph,
    ...trip.terrainRiskSnapshots.map((snapshot) => snapshot.summary),
    ...(trip.recap?.terrainSummary?.terrainRiskEvents?.map((event) => event.summary) ?? []),
  ]);
  const terrainRiskCount = getTripTerrainRiskCount(trip);
  const routeEventCount = getTripRouteEventCount(trip);
  const notableMomentCount = getTripNotableMomentCount(trip);
  const startedDay = getDay(trip.startedAt);
  const contextText = [
    ...routeContextTerms(trip),
    ...weatherTerms,
    ...terrainTerms,
    startedDay === 0 || startedDay === 6 ? 'weekend' : null,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return {
    trip,
    completedTrips: normalizedCompletedTrips,
    previousTrips,
    totalCompletedTrips: normalizedCompletedTrips.length,
    totalMiles: normalizedCompletedTrips.reduce((sum, item) => sum + getTripMiles(item), 0),
    totalHours: normalizedCompletedTrips.reduce((sum, item) => sum + getTripHours(item), 0),
    totalRecoveryUsageCount: normalizedCompletedTrips.reduce((sum, item) => sum + getTripRecoveryUsageCount(item), 0),
    tripMiles,
    tripHours,
    maxHistoricalElevationFt: Math.max(previousMaxElevationFt, tripMaxElevationFt),
    previousMaxElevationFt,
    tripMaxElevationFt,
    tripElevationGainFt: getTripElevationGain(trip),
    weatherTerms,
    terrainTerms,
    terrainRiskCount,
    totalTerrainRiskCount: normalizedCompletedTrips.reduce((sum, item) => sum + getTripTerrainRiskCount(item), 0),
    routeEventCount,
    recoveryUsageCount: getTripRecoveryUsageCount(trip),
    notableMomentCount,
    totalNotableMomentCount: normalizedCompletedTrips.reduce((sum, item) => sum + getTripNotableMomentCount(item), 0),
    campViewedCount: trip.campCandidatesViewed.length,
    resupplyViewedCount: trip.resupplyStopsViewed.length,
    bailoutUsedCount: trip.bailoutPointsUsed.length,
    startedHour: getHour(trip.startedAt),
    completedHour: getHour(trip.completedAt),
    completedMonth: getMonth(trip.completedAt),
    contextText,
  };
}

function progressForDefinition(definition: ExpeditionBadgeDefinition, context: BadgeEvaluationContext): number | null {
  switch (definition.evaluationType) {
    case 'trip_count':
      return context.totalCompletedTrips;
    case 'lifetime_distance':
      return context.totalMiles;
    case 'single_trip_distance':
      return context.tripMiles;
    case 'lifetime_duration':
      return context.totalHours;
    case 'single_trip_duration':
      return context.tripHours;
    case 'max_elevation':
      return context.maxHistoricalElevationFt;
    case 'elevation_gain':
      return context.tripElevationGainFt;
    case 'terrain_risk_count':
      return context.terrainRiskCount;
    case 'route_event_count':
      return context.routeEventCount;
    case 'recovery_usage':
      return definition.id === 'recovery-veteran' ? context.totalRecoveryUsageCount : context.recoveryUsageCount;
    case 'viewed_entity':
      return viewedEntityCount(definition, context);
    case 'notable_moment_count':
      return context.notableMomentCount;
    case 'weather_terms':
      return weatherProgress(definition, context);
    case 'terrain_terms':
      return matchedTerms(context.contextText, definition.evaluationConfig.terms ?? []).length;
    case 'hidden_combo':
      return metricValue(definition.evaluationConfig.metric, context);
    default:
      return null;
  }
}

function shouldUnlockBadge(definition: ExpeditionBadgeDefinition, context: BadgeEvaluationContext): boolean {
  const threshold = definition.evaluationConfig.threshold ?? definition.progressTarget;
  switch (definition.evaluationType) {
    case 'trip_count':
      return threshold != null && context.totalCompletedTrips >= threshold;
    case 'lifetime_distance':
      return threshold != null && context.totalMiles >= threshold;
    case 'single_trip_distance':
      return threshold != null && context.tripMiles >= threshold;
    case 'lifetime_duration':
      return threshold != null && context.totalHours >= threshold;
    case 'single_trip_duration':
      return threshold != null && context.tripHours >= threshold;
    case 'max_elevation':
      return threshold != null && context.tripMaxElevationFt >= threshold;
    case 'elevation_gain':
      return threshold != null && context.tripElevationGainFt >= threshold;
    case 'personal_record':
      return isPersonalRecord(definition, context);
    case 'weather_terms':
      return hasWeatherMatch(definition, context);
    case 'terrain_terms':
    case 'context_terms':
      return hasTermMatch(definition, context);
    case 'terrain_risk_count':
      return threshold != null && context.terrainRiskCount >= threshold;
    case 'route_event_count':
      return threshold != null && context.routeEventCount >= threshold;
    case 'recovery_usage':
      return (definition.id === 'recovery-veteran' ? context.totalRecoveryUsageCount : context.recoveryUsageCount) >= (threshold ?? 1);
    case 'viewed_entity':
      return viewedEntityCount(definition, context) >= (threshold ?? 1);
    case 'notable_moment_count':
      return context.notableMomentCount >= (threshold ?? 1);
    case 'notable_moment_type':
      return hasNotableMomentType(definition, context);
    case 'time_window':
      return hasTimeWindow(definition, context);
    case 'season':
      return hasSeasonMatch(definition, context);
    case 'clean_completion':
      return hasCleanCompletion(definition, context);
    case 'safe_signal':
      return false;
    case 'hidden_combo':
      return hasHiddenCombo(definition, context);
    default:
      return false;
  }
}

function matchedTerms(text: string, terms: string[]): string[] {
  if (terms.length === 0) return [];
  return terms.filter((term) => text.includes(term.toLowerCase()));
}

function hasTermMatch(definition: ExpeditionBadgeDefinition, context: BadgeEvaluationContext): boolean {
  const terms = definition.evaluationConfig.terms ?? [];
  if (terms.length === 0) return false;
  const matches = matchedTerms(context.contextText, terms);
  return definition.evaluationConfig.requireAll ? matches.length === terms.length : matches.length > 0;
}

function weatherProgress(definition: ExpeditionBadgeDefinition, context: BadgeEvaluationContext): number {
  if (definition.id === 'temperature-swing') return temperatureRange(context.trip);
  if (definition.evaluationConfig.terms?.length) {
    return matchedTerms(context.contextText, definition.evaluationConfig.terms).length;
  }
  return context.weatherTerms.length;
}

function hasWeatherMatch(definition: ExpeditionBadgeDefinition, context: BadgeEvaluationContext): boolean {
  const threshold = definition.evaluationConfig.threshold ?? definition.progressTarget;
  if (definition.id === 'heat-line' || definition.id === 'desert-crossing') {
    return hasTermMatch(definition, context) || (tripMaxTemperature(context.trip) ?? Number.NEGATIVE_INFINITY) >= (threshold ?? 95);
  }
  if (definition.id === 'cold-start') {
    return hasTermMatch(definition, context) || (tripMinTemperature(context.trip) ?? Number.POSITIVE_INFINITY) <= (threshold ?? 32);
  }
  if (definition.id === 'temperature-swing') {
    return threshold != null && temperatureRange(context.trip) >= threshold;
  }
  if (definition.evaluationConfig.terms?.length) return hasTermMatch(definition, context);
  return threshold != null && context.weatherTerms.length >= threshold;
}

function viewedEntityCount(definition: ExpeditionBadgeDefinition, context: BadgeEvaluationContext): number {
  switch (definition.evaluationConfig.entity) {
    case 'camp':
      return context.campViewedCount;
    case 'resupply':
      return context.resupplyViewedCount;
    case 'bailout':
      return context.bailoutUsedCount;
    default:
      return 0;
  }
}

function hasNotableMomentType(definition: ExpeditionBadgeDefinition, context: BadgeEvaluationContext): boolean {
  const types = definition.evaluationConfig.momentTypes ?? [];
  if (types.length === 0) return false;
  const recapMoments = context.trip.recap?.expeditionEvents.notableMoments ?? [];
  return recapMoments.some((moment) => types.includes(moment.type));
}

function hasTimeWindow(definition: ExpeditionBadgeDefinition, context: BadgeEvaluationContext): boolean {
  const hour = definition.evaluationConfig.timeField === 'startedAt' ? context.startedHour : context.completedHour;
  const start = definition.evaluationConfig.hourStart;
  const end = definition.evaluationConfig.hourEnd;
  if (hour == null || start == null || end == null) return false;
  if (start <= end) return hour >= start && hour <= end;
  return hour >= start || hour <= end;
}

function seasonFromMonth(month: number | null): 'spring' | 'summer' | 'fall' | 'winter' | null {
  if (month == null) return null;
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

function hasSeasonMatch(definition: ExpeditionBadgeDefinition, context: BadgeEvaluationContext): boolean {
  if (definition.evaluationConfig.month != null) {
    return context.completedMonth === definition.evaluationConfig.month;
  }
  const targetSeason = definition.evaluationConfig.season;
  if (targetSeason) return seasonFromMonth(context.completedMonth) === targetSeason;
  if (definition.id === 'first-trip-of-the-season') return context.totalCompletedTrips >= 1;
  if (definition.id === 'last-trip-of-the-season') return context.totalCompletedTrips >= 1;
  return false;
}

function hasCleanCompletion(definition: ExpeditionBadgeDefinition, context: BadgeEvaluationContext): boolean {
  const maxRouteEvents = definition.evaluationConfig.maxRouteEvents ?? 0;
  const maxRecoveryUsage = definition.evaluationConfig.maxRecoveryUsage;
  if (context.routeEventCount > maxRouteEvents) return false;
  if (maxRecoveryUsage != null && context.recoveryUsageCount > maxRecoveryUsage) return false;
  return true;
}

function metricValue(metric: ExpeditionBadgeDefinition['evaluationConfig']['metric'], context: BadgeEvaluationContext): number | null {
  switch (metric) {
    case 'trip_distance':
      return context.tripMiles;
    case 'total_distance':
      return context.totalMiles;
    case 'trip_duration':
      return context.tripHours;
    case 'total_duration':
      return context.totalHours;
    case 'max_elevation':
      return context.tripMaxElevationFt;
    case 'elevation_gain':
      return context.tripElevationGainFt;
    case 'route_events':
      return context.routeEventCount;
    case 'recovery_usage':
      return context.recoveryUsageCount;
    case 'terrain_risk':
      return context.terrainRiskCount;
    case 'notable_moments':
      return context.notableMomentCount;
    case 'trip_count':
      return context.totalCompletedTrips;
    default:
      return null;
  }
}

function hasHiddenCombo(definition: ExpeditionBadgeDefinition, context: BadgeEvaluationContext): boolean {
  const metric = metricValue(definition.evaluationConfig.metric, context);
  const threshold = definition.evaluationConfig.threshold;
  const metricPass = threshold == null || (metric != null && metric >= threshold);
  const terms = definition.evaluationConfig.terms ?? [];
  const termPass = terms.length === 0 || hasTermMatch(definition, context);
  const cleanPass =
    definition.evaluationConfig.maxRouteEvents == null && definition.evaluationConfig.maxRecoveryUsage == null
      ? true
      : hasCleanCompletion(definition, context);
  if (definition.id === 'mountain-pass') {
    return context.tripMaxElevationFt >= 8000 || context.tripElevationGainFt >= 2500 || termPass;
  }
  if (definition.id === 'uncharted-habit') {
    return context.totalCompletedTrips >= 3 &&
      context.completedTrips.slice(0, 3).every((item) => getTripMiles(item) >= 25);
  }
  return metricPass && termPass && cleanPass;
}

function previousRecordValue(definition: ExpeditionBadgeDefinition, context: BadgeEvaluationContext): number {
  const metric = definition.evaluationConfig.recordMetric;
  if (!metric) return 0;
  return context.previousTrips.reduce((max, trip) => Math.max(max, recordMetricValue(metric, trip)), 0);
}

function recordMetricValue(
  metric: NonNullable<ExpeditionBadgeDefinition['evaluationConfig']['recordMetric']>,
  trip: ExpeditionTripRecord,
): number {
  switch (metric) {
    case 'distance':
      return getTripMiles(trip);
    case 'duration':
      return getTripHours(trip);
    case 'elevation':
      return getTripMaxElevation(trip);
    case 'elevation_gain':
      return getTripElevationGain(trip);
    case 'notable_moments':
      return getTripNotableMomentCount(trip);
    case 'terrain_risk':
      return getTripTerrainRiskCount(trip);
    case 'speed':
      return getAverageSpeedMph(trip);
    default:
      return 0;
  }
}

function isPersonalRecord(definition: ExpeditionBadgeDefinition, context: BadgeEvaluationContext): boolean {
  const metric = definition.evaluationConfig.recordMetric;
  if (!metric) return false;
  const current = recordMetricValue(metric, context.trip);
  if (current <= 0) return false;
  const previous = previousRecordValue(definition, context);
  return current > previous;
}

function upsertBadges(existing: ExpeditionBadge[], additions: ExpeditionBadge[]): ExpeditionBadge[] {
  const next = [...existing];
  for (const badge of additions) {
    const alreadyUnlocked = next.some((item) => item.id === badge.id);
    const alreadyUnlockedForTrip = next.some(
      (item) => item.id === badge.id && item.unlockedTripId === badge.unlockedTripId,
    );
    if (!badge.isRepeatable && alreadyUnlocked) continue;
    if (badge.isRepeatable && alreadyUnlockedForTrip) continue;
    next.push(badge);
  }
  return next.sort(sortNewestBadges);
}

async function evaluateBadgesForCompletedTripNow(tripId: string): Promise<ExpeditionBadge[]> {
  try {
    const trip = await expeditionTripRecordStore.getById(tripId);
    if (!trip || trip.status !== 'completed') return [];

    const [snapshot, completedTrips] = await Promise.all([
      loadSnapshot(),
      expeditionTripRecordStore.getCompleted(),
    ]);
    const context = buildEvaluationContext(trip, completedTrips);
    const existingUnlocked = snapshot.badges.filter((badge) => !!badge.unlockedAt);
    const existingIds = new Set(existingUnlocked.map((badge) => badge.id));
    const existingTripIds = new Set(
      existingUnlocked
        .filter((badge) => badge.unlockedTripId === trip.id)
        .map((badge) => badge.id),
    );
    const unlockedAt = nowISO();
    const newlyUnlocked = EXPEDITION_BADGE_DEFINITIONS
      .filter((definition) => definition.isRepeatable ? !existingTripIds.has(definition.id) : !existingIds.has(definition.id))
      .filter((definition) => shouldUnlockBadge(definition, context))
      .map((definition) => badgeFromDefinition(definition, {
        unlockedAt,
        unlockedTripId: trip.id,
        progressCurrent: progressForDefinition(definition, context),
      }));

    if (newlyUnlocked.length === 0) return [];

    const latestSnapshot = await loadSnapshot();
    await saveSnapshot({
      version: STORAGE_VERSION,
      badges: upsertBadges(latestSnapshot.badges, newlyUnlocked),
    });

    const latestTrip = await expeditionTripRecordStore.getById(trip.id);
    if (!latestTrip || latestTrip.status !== 'completed') return newlyUnlocked;

    const newBadgeIds = newlyUnlocked
      .map((badge) => badge.id)
      .filter((badgeId) => !latestTrip.badgesUnlocked.includes(badgeId));
    if (newBadgeIds.length > 0) {
      await expeditionTripRecordStore.save(safelyAppendBadgeIds(latestTrip, newBadgeIds));
    }

    return newlyUnlocked;
  } catch {
    return [];
  }
}

export async function evaluateBadgesForCompletedTrip(tripId: string): Promise<ExpeditionBadge[]> {
  const evaluation = badgeEvaluationQueue
    .catch(() => [])
    .then(() => evaluateBadgesForCompletedTripNow(tripId));
  badgeEvaluationQueue = evaluation.catch(() => []);
  return evaluation;
}

async function reconcileBadgeUnlocksFromCompletedTrips(): Promise<void> {
  if (badgeReconciliationPromise) return badgeReconciliationPromise;
  badgeReconciliationPromise = (async () => {
    const completedTrips = await expeditionTripRecordStore.getCompleted();
    for (const trip of completedTrips) {
      await evaluateBadgesForCompletedTrip(trip.id);
    }
  })().finally(() => {
    badgeReconciliationPromise = null;
  });
  return badgeReconciliationPromise;
}

export async function getUnlockedBadges(): Promise<ExpeditionBadge[]> {
  await reconcileBadgeUnlocksFromCompletedTrips();
  const snapshot = await loadSnapshot();
  return snapshot.badges
    .filter((badge) => !!badge.unlockedAt)
    .sort(sortNewestBadges);
}

export async function getBadgesForTrip(tripId: string): Promise<ExpeditionBadge[]> {
  const unlocked = await getUnlockedBadges();
  return unlocked
    .filter((badge) => badge.unlockedTripId === tripId)
    .sort(sortNewestBadges);
}

export async function getRecentBadgeUnlocks(limit = 5): Promise<ExpeditionBadge[]> {
  const unlocked = await getUnlockedBadges();
  return unlocked.slice(0, Math.max(0, limit));
}

export async function recordBadgeIdentitySafeSignal(input: BadgeIdentitySafeSignalInput): Promise<ExpeditionBadge[]> {
  try {
    if (isMockOrDemoSignal(input)) return [];
    const badgeId = badgeIdForSafeSignal(input.signalId);
    if (!badgeId) return [];
    const definition = getBadgeDefinition(badgeId);
    if (!definition) return [];

    const snapshot = await loadSnapshot();
    if (snapshot.badges.some((badge) => badge.id === badgeId && !!badge.unlockedAt)) return [];

    const unlockedAt = nullableString(input.occurredAt) ?? nowISO();
    const badge = badgeFromDefinition(definition, {
      unlockedAt,
      unlockedTripId: null,
      progressCurrent: 1,
    });
    await saveSnapshot({
      version: STORAGE_VERSION,
      badges: upsertBadges(snapshot.badges, [badge]),
    });
    return [badge];
  } catch {
    return [];
  }
}

export async function getCurrentExpeditionBadgeTitle(): Promise<string | null> {
  const [badge] = await getRecentBadgeUnlocks(1);
  const title = typeof badge?.title === 'string' ? badge.title.trim() : '';
  return title || null;
}

function isNextProgressMilestone(
  definition: ExpeditionBadgeDefinition,
  context: BadgeEvaluationContext,
  unlockedById: Map<string, ExpeditionBadge>,
): boolean {
  if (definition.isHidden || definition.progressTarget == null || unlockedById.has(definition.id)) return false;
  if (
    definition.evaluationType !== 'lifetime_distance' &&
    definition.evaluationType !== 'lifetime_duration' &&
    definition.evaluationType !== 'trip_count' &&
    definition.evaluationType !== 'max_elevation'
  ) {
    return false;
  }

  const sameTrack = EXPEDITION_BADGE_DEFINITIONS
    .filter((candidate) =>
      !candidate.isHidden &&
      candidate.evaluationType === definition.evaluationType &&
      candidate.progressTarget != null)
    .sort((a, b) => (a.progressTarget ?? 0) - (b.progressTarget ?? 0));
  const currentProgress = progressForDefinition(definition, context) ?? 0;
  const nextLocked = sameTrack.find((candidate) => !unlockedById.has(candidate.id) && (candidate.progressTarget ?? 0) > currentProgress);
  return nextLocked?.id === definition.id;
}

export async function getBadgeProgress(): Promise<ExpeditionBadge[]> {
  await reconcileBadgeUnlocksFromCompletedTrips();
  const [snapshot, completedTrips] = await Promise.all([
    loadSnapshot(),
    expeditionTripRecordStore.getCompleted(),
  ]);
  const latestTrip = completedTrips[0] ?? null;
  const context = latestTrip ? buildEvaluationContext(latestTrip, completedTrips) : null;
  const unlockedById = new Map(snapshot.badges.filter((badge) => !!badge.unlockedAt).map((badge) => [badge.id, badge]));

  const unlockedBadges = snapshot.badges
    .filter((badge) => !!badge.unlockedAt)
    .sort(sortNewestBadges);
  if (!context) return unlockedBadges;

  const progressBadges = EXPEDITION_BADGE_DEFINITIONS
    .filter((definition) => isNextProgressMilestone(definition, context, unlockedById))
    .map((definition) => {
      const unlocked = unlockedById.get(definition.id);
      if (unlocked) return unlocked;
      return badgeFromDefinition(definition, {
        progressCurrent: progressForDefinition(definition, context) ?? 0,
      });
    });

  return [
    ...unlockedBadges,
    ...progressBadges,
  ];
}

export async function hasBadge(badgeId: string): Promise<boolean> {
  const unlocked = await getUnlockedBadges();
  return unlocked.some((badge) => badge.id === badgeId);
}

export async function clearAllBadgesForTests(): Promise<void> {
  badgeReconciliationPromise = null;
  badgeEvaluationQueue = Promise.resolve([]);
  await saveSnapshot({ version: STORAGE_VERSION, badges: [] });
}

// TODO Expedition Badges: add full badge evaluation coverage as the 100+ badge library grows.
// TODO Expedition Badges: feed badge unlock locations into future recap map markers.

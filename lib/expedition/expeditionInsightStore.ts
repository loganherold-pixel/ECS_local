import { createMigratingNonSecureStorage } from '../nonSecureStorage';
import { getBadgeProgress, getUnlockedBadges } from './expeditionBadgeStore';
import { expeditionTripRecordStore } from './expeditionTripRecordStore';
import type {
  ExpeditionBadge,
  ExpeditionInsight,
  ExpeditionInsightType,
  ExpeditionTripRecord,
} from './expeditionTripRecordTypes';

const STORAGE_KEY = 'ecs_expedition_insights_v1';
const STORAGE_VERSION = 1;
const MAX_SOURCE_TRIPS = 8;
const insightStorage = createMigratingNonSecureStorage('ecs_expedition_insights', {
  logTag: 'ExpeditionInsightStore',
});

type PersistedExpeditionInsights = {
  version: number;
  insights: ExpeditionInsight[];
};

let hydratedSnapshot: PersistedExpeditionInsights | null = null;
let hydrationPromise: Promise<PersistedExpeditionInsights> | null = null;

function nowISO(): string {
  return new Date().toISOString();
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function finiteNumberOrFallback(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function insightTypeFromUnknown(value: unknown): ExpeditionInsightType {
  return value === 'distance_pattern' ||
    value === 'elevation_pattern' ||
    value === 'weather_pattern' ||
    value === 'time_of_day_pattern' ||
    value === 'route_deviation_pattern' ||
    value === 'recovery_usage' ||
    value === 'milestone_progress' ||
    value === 'expedition_frequency' ||
    value === 'personal_record' ||
    value === 'badge_progress'
    ? value
    : 'personal_record';
}

function normalizeInsight(raw: unknown): ExpeditionInsight | null {
  const input = raw as Partial<ExpeditionInsight> | null | undefined;
  const id = nullableString(input?.id);
  const title = nullableString(input?.title);
  const description = nullableString(input?.description);
  if (!id || !title || !description) return null;
  const generatedAt = nullableString(input?.generatedAt) ?? nowISO();
  return {
    id,
    type: insightTypeFromUnknown(input?.type),
    title,
    description,
    confidence: Math.max(0, Math.min(1, finiteNumberOrFallback(input?.confidence, 0.6))),
    sourceTripIds: Array.isArray(input?.sourceTripIds)
      ? input.sourceTripIds.filter((tripId): tripId is string => typeof tripId === 'string').slice(0, MAX_SOURCE_TRIPS)
      : [],
    generatedAt,
    updatedAt: nullableString(input?.updatedAt) ?? generatedAt,
    isDismissed: input?.isDismissed === true,
    priority: finiteNumberOrFallback(input?.priority, 1),
  };
}

function sortInsights(a: ExpeditionInsight, b: ExpeditionInsight): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

async function loadSnapshot(): Promise<PersistedExpeditionInsights> {
  if (hydratedSnapshot) return hydratedSnapshot;
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    const raw = await insightStorage.read(STORAGE_KEY);
    if (!raw) {
      hydratedSnapshot = { version: STORAGE_VERSION, insights: [] };
      return hydratedSnapshot;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedExpeditionInsights;
      const insights = Array.isArray(parsed.insights)
        ? parsed.insights
            .map(normalizeInsight)
            .filter((insight): insight is ExpeditionInsight => !!insight)
        : [];
      hydratedSnapshot = { version: STORAGE_VERSION, insights };
      return hydratedSnapshot;
    } catch {
      hydratedSnapshot = { version: STORAGE_VERSION, insights: [] };
      return hydratedSnapshot;
    }
  })().finally(() => {
    hydrationPromise = null;
  });

  return hydrationPromise;
}

async function saveSnapshot(snapshot: PersistedExpeditionInsights): Promise<void> {
  hydratedSnapshot = snapshot;
  await insightStorage.write(STORAGE_KEY, JSON.stringify(snapshot));
}

function makeInsight(input: Omit<ExpeditionInsight, 'generatedAt' | 'updatedAt' | 'isDismissed'>, timestamp: string): ExpeditionInsight {
  return {
    ...input,
    generatedAt: timestamp,
    updatedAt: timestamp,
    isDismissed: false,
    sourceTripIds: input.sourceTripIds.slice(0, MAX_SOURCE_TRIPS),
    confidence: Math.max(0, Math.min(1, input.confidence)),
  };
}

function distanceMiles(trip: ExpeditionTripRecord): number {
  return trip.totalDistanceMiles ?? trip.recap?.journeySummary.totalDistanceMiles ?? 0;
}

function durationHours(trip: ExpeditionTripRecord): number {
  if (trip.totalDurationSeconds != null) return trip.totalDurationSeconds / 3600;
  return trip.recap?.journeySummary.totalDurationHours ?? 0;
}

function maxElevationFt(trip: ExpeditionTripRecord): number {
  return trip.maxElevationFt ?? trip.recap?.journeySummary.maxElevationFt ?? 0;
}

function elevationGainFt(trip: ExpeditionTripRecord): number {
  return trip.totalElevationGainFt ?? trip.recap?.journeySummary.elevationGainFt ?? 0;
}

function completedHour(trip: ExpeditionTripRecord): number | null {
  if (!trip.completedAt) return null;
  const parsed = new Date(trip.completedAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getHours();
}

function completedDate(trip: ExpeditionTripRecord): number {
  return new Date(trip.completedAt ?? trip.updatedAt).getTime();
}

function weatherConditionCount(trip: ExpeditionTripRecord): number {
  const conditions = new Set<string>();
  trip.weatherSnapshots.forEach((snapshot) => {
    if (snapshot.summary) conditions.add(snapshot.summary.toLowerCase());
    if (snapshot.precipitation) conditions.add(snapshot.precipitation.toLowerCase());
  });
  (trip.recap?.environmentSummary?.weatherConditionsEncountered ?? []).forEach((condition) => {
    if (condition) conditions.add(condition.toLowerCase());
  });
  return conditions.size;
}

function routeDeviationCount(trip: ExpeditionTripRecord): number {
  return trip.deviations.length +
    (trip.recap?.expeditionEvents.routeDeviations.length ?? 0) +
    (trip.recap?.expeditionEvents.reroutes.length ?? 0);
}

function recoveryUsageCount(trip: ExpeditionTripRecord): number {
  return trip.recoveryPanelUsed.length + (trip.recap?.expeditionEvents.recoveryPanelUsage.length ?? 0);
}

function terrainRiskEventCount(trip: ExpeditionTripRecord): number {
  return trip.terrainRiskSnapshots.length + (trip.recap?.terrainSummary?.terrainRiskEvents?.length ?? 0);
}

function notableMomentCount(trip: ExpeditionTripRecord): number {
  return trip.notableMoments.length + (trip.recap?.expeditionEvents.notableMoments.length ?? 0);
}

function formatMiles(value: number): string {
  return value < 10 && value > 0 ? `${value.toFixed(1)} miles` : `${Math.round(value).toLocaleString()} miles`;
}

function formatElevation(value: number): string {
  return `${Math.round(value).toLocaleString()} ft`;
}

function generateInsights(
  completedTrips: ExpeditionTripRecord[],
  badges: ExpeditionBadge[],
  badgeProgress: ExpeditionBadge[],
  timestamp: string,
): ExpeditionInsight[] {
  const trips = [...completedTrips].sort((a, b) => completedDate(b) - completedDate(a));
  if (trips.length === 0) return [];

  const insights: ExpeditionInsight[] = [];
  const longestTrip = trips.reduce((longest, trip) => distanceMiles(trip) > distanceMiles(longest) ? trip : longest, trips[0]);
  const longestMiles = distanceMiles(longestTrip);
  if (longestMiles > 0) {
    insights.push(makeInsight({
      id: 'personal-record-longest-distance',
      type: 'personal_record',
      title: 'Longest Completed Expedition',
      description: `Your longest completed expedition so far was ${formatMiles(longestMiles)}.`,
      confidence: 0.94,
      sourceTripIds: [longestTrip.id],
      priority: 94,
    }, timestamp));
  }

  const highestTrip = trips.reduce((highest, trip) => maxElevationFt(trip) > maxElevationFt(highest) ? trip : highest, trips[0]);
  const highestElevation = maxElevationFt(highestTrip);
  if (highestElevation > 0) {
    insights.push(makeInsight({
      id: 'personal-record-highest-elevation',
      type: 'personal_record',
      title: 'Highest Recorded Route',
      description: `Your highest recorded route reached ${formatElevation(highestElevation)}.`,
      confidence: 0.92,
      sourceTripIds: [highestTrip.id],
      priority: 92,
    }, timestamp));
  }

  const recentTrips = trips.slice(0, 3);
  const recentWithGain = recentTrips.filter((trip) => elevationGainFt(trip) >= 1000);
  if (recentTrips.length >= 3 && recentWithGain.length === recentTrips.length) {
    insights.push(makeInsight({
      id: 'recent-elevation-gain-pattern',
      type: 'elevation_pattern',
      title: 'Recent Elevation Pattern',
      description: 'Your last 3 expeditions included significant elevation gain.',
      confidence: 0.86,
      sourceTripIds: recentTrips.map((trip) => trip.id),
      priority: 82,
    }, timestamp));
  }

  const sunsetTrips = trips.filter((trip) => {
    const hour = completedHour(trip);
    return hour != null && hour >= 17 && hour < 21;
  });
  if (trips.length >= 3 && sunsetTrips.length >= Math.ceil(trips.length * 0.5)) {
    insights.push(makeInsight({
      id: 'finish-time-sunset-pattern',
      type: 'time_of_day_pattern',
      title: 'Finish Time Pattern',
      description: 'Your completed routes often finish near sunset.',
      confidence: 0.78,
      sourceTripIds: sunsetTrips.slice(0, MAX_SOURCE_TRIPS).map((trip) => trip.id),
      priority: 72,
    }, timestamp));
  }

  const weatherTrips = trips.filter((trip) => weatherConditionCount(trip) >= 2);
  if (weatherTrips.length >= 2) {
    insights.push(makeInsight({
      id: 'weather-change-count',
      type: 'weather_pattern',
      title: 'Weather Variety Logged',
      description: `You have completed ${weatherTrips.length} trips with weather changes recorded.`,
      confidence: 0.82,
      sourceTripIds: weatherTrips.slice(0, MAX_SOURCE_TRIPS).map((trip) => trip.id),
      priority: 70,
    }, timestamp));
  }

  const routeDeviationTrips = trips.filter((trip) => routeDeviationCount(trip) > 0);
  if (routeDeviationTrips.length >= 2) {
    insights.push(makeInsight({
      id: 'route-deviation-count',
      type: 'route_deviation_pattern',
      title: 'Route Adjustments Logged',
      description: `You have completed ${routeDeviationTrips.length} trips with route deviations or reroutes recorded.`,
      confidence: 0.8,
      sourceTripIds: routeDeviationTrips.slice(0, MAX_SOURCE_TRIPS).map((trip) => trip.id),
      priority: 66,
    }, timestamp));
  }

  const recoveryTrips = trips.filter((trip) => recoveryUsageCount(trip) > 0);
  if (recoveryTrips.length > 0) {
    insights.push(makeInsight({
      id: 'recovery-usage-count',
      type: 'recovery_usage',
      title: 'Recovery Tools Used',
      description: `Recovery tools were opened during ${recoveryTrips.length} completed ${recoveryTrips.length === 1 ? 'expedition' : 'expeditions'}.`,
      confidence: 0.9,
      sourceTripIds: recoveryTrips.slice(0, MAX_SOURCE_TRIPS).map((trip) => trip.id),
      priority: 64,
    }, timestamp));
  }

  const terrainRiskTrips = trips.filter((trip) => terrainRiskEventCount(trip) > 0);
  if (terrainRiskTrips.length >= 2) {
    insights.push(makeInsight({
      id: 'terrain-risk-event-count',
      type: 'elevation_pattern',
      title: 'Terrain Events Recorded',
      description: `You have completed ${terrainRiskTrips.length} trips with terrain risk events recorded.`,
      confidence: 0.8,
      sourceTripIds: terrainRiskTrips.slice(0, MAX_SOURCE_TRIPS).map((trip) => trip.id),
      priority: 62,
    }, timestamp));
  }

  const notableTrips = trips.filter((trip) => notableMomentCount(trip) >= 3);
  if (notableTrips.length >= 2) {
    insights.push(makeInsight({
      id: 'notable-moments-count',
      type: 'personal_record',
      title: 'Notable Events Captured',
      description: `You have completed ${notableTrips.length} trips with multiple notable moments captured.`,
      confidence: 0.76,
      sourceTripIds: notableTrips.slice(0, MAX_SOURCE_TRIPS).map((trip) => trip.id),
      priority: 58,
    }, timestamp));
  }

  const totalMiles = trips.reduce((sum, trip) => sum + distanceMiles(trip), 0);
  if (totalMiles >= 25) {
    insights.push(makeInsight({
      id: 'milestone-total-distance',
      type: 'milestone_progress',
      title: 'Total Distance Logged',
      description: `You have completed ${formatMiles(totalMiles)} across saved expeditions.`,
      confidence: 0.88,
      sourceTripIds: trips.slice(0, MAX_SOURCE_TRIPS).map((trip) => trip.id),
      priority: 60,
    }, timestamp));
  }

  if (trips.length >= 2) {
    const sortedOldestFirst = [...trips].sort((a, b) => completedDate(a) - completedDate(b));
    const first = completedDate(sortedOldestFirst[0]);
    const last = completedDate(sortedOldestFirst[sortedOldestFirst.length - 1]);
    const spanDays = Math.max(1, Math.round((last - first) / 86_400_000) + 1);
    insights.push(makeInsight({
      id: 'expedition-frequency-count',
      type: 'expedition_frequency',
      title: 'Expedition History',
      description: `You have completed ${trips.length} expeditions over ${spanDays} ${spanDays === 1 ? 'day' : 'days'}.`,
      confidence: 0.84,
      sourceTripIds: trips.slice(0, MAX_SOURCE_TRIPS).map((trip) => trip.id),
      priority: 56,
    }, timestamp));
  }

  const unlockedCount = badges.length;
  if (unlockedCount > 0) {
    insights.push(makeInsight({
      id: 'badge-unlock-count',
      type: 'badge_progress',
      title: 'Badges Earned',
      description: `You have unlocked ${unlockedCount} expedition ${unlockedCount === 1 ? 'badge' : 'badges'}.`,
      confidence: 0.9,
      sourceTripIds: badges
        .map((badge) => badge.unlockedTripId)
        .filter((tripId): tripId is string => !!tripId)
        .slice(0, MAX_SOURCE_TRIPS),
      priority: 54,
    }, timestamp));
  }

  const nearBadge = badgeProgress
    .filter((badge) => !badge.unlockedAt && badge.progressTarget != null && badge.progressCurrent != null)
    .filter((badge) => badge.progressTarget != null && badge.progressTarget > 0)
    .sort((a, b) => ((b.progressCurrent ?? 0) / (b.progressTarget ?? 1)) - ((a.progressCurrent ?? 0) / (a.progressTarget ?? 1)))[0];
  if (nearBadge && (nearBadge.progressCurrent ?? 0) > 0) {
    insights.push(makeInsight({
      id: `badge-progress-${nearBadge.id}`,
      type: 'badge_progress',
      title: 'Badge Progress',
      description: `${nearBadge.title} progress is ${Math.round(nearBadge.progressCurrent ?? 0).toLocaleString()} of ${Math.round(nearBadge.progressTarget ?? 0).toLocaleString()}.`,
      confidence: 0.78,
      sourceTripIds: trips.slice(0, MAX_SOURCE_TRIPS).map((trip) => trip.id),
      priority: 50,
    }, timestamp));
  }

  return insights.sort(sortInsights);
}

function mergeWithDismissedState(existing: ExpeditionInsight[], generated: ExpeditionInsight[]): ExpeditionInsight[] {
  const previousById = new Map(existing.map((insight) => [insight.id, insight]));
  const next = generated.map((insight) => {
    const previous = previousById.get(insight.id);
    return previous?.isDismissed
      ? {
          ...insight,
          isDismissed: true,
          generatedAt: previous.generatedAt,
          updatedAt: previous.updatedAt,
        }
      : insight;
  });
  const dismissedStale = existing.filter(
    (insight) => insight.isDismissed && !generated.some((item) => item.id === insight.id),
  );
  return [...next, ...dismissedStale].sort(sortInsights);
}

export async function generateInsightsFromTripHistory(): Promise<ExpeditionInsight[]> {
  try {
    const [snapshot, completedTrips, unlockedBadges, badgeProgress] = await Promise.all([
      loadSnapshot(),
      expeditionTripRecordStore.getCompleted(),
      getUnlockedBadges().catch(() => []),
      getBadgeProgress().catch(() => []),
    ]);
    const timestamp = nowISO();
    const generated = generateInsights(completedTrips, unlockedBadges, badgeProgress, timestamp);
    const latestSnapshot = hydratedSnapshot ?? snapshot;
    const nextInsights = mergeWithDismissedState(latestSnapshot.insights, generated);
    await saveSnapshot({ version: STORAGE_VERSION, insights: nextInsights });
    return nextInsights.filter((insight) => !insight.isDismissed).sort(sortInsights);
  } catch {
    return [];
  }
}

export async function generateInsightsForCompletedTrip(tripId: string): Promise<ExpeditionInsight[]> {
  try {
    const trip = await expeditionTripRecordStore.getById(tripId);
    if (!trip || trip.status !== 'completed') return [];
    return generateInsightsFromTripHistory();
  } catch {
    return [];
  }
}

export async function getCurrentInsights(limit = 3): Promise<ExpeditionInsight[]> {
  const snapshot = await loadSnapshot();
  return snapshot.insights
    .filter((insight) => !insight.isDismissed)
    .sort(sortInsights)
    .slice(0, Math.max(0, limit));
}

export async function dismissInsight(insightId: string): Promise<ExpeditionInsight | null> {
  const snapshot = await loadSnapshot();
  const existing = snapshot.insights.find((insight) => insight.id === insightId);
  if (!existing) return null;
  const updated: ExpeditionInsight = {
    ...existing,
    isDismissed: true,
    updatedAt: nowISO(),
  };
  await saveSnapshot({
    version: STORAGE_VERSION,
    insights: snapshot.insights.map((insight) => insight.id === insightId ? updated : insight),
  });
  return updated;
}

export async function refreshExpeditionInsights(): Promise<ExpeditionInsight[]> {
  return generateInsightsFromTripHistory();
}

export async function clearAllInsightsForTests(): Promise<void> {
  await saveSnapshot({ version: STORAGE_VERSION, insights: [] });
}

// TODO Expedition Insights: add an insight detail view once the hub needs deeper drill-in.
// TODO Expedition Insights: connect grounded insight patterns to badge progress explanations.
// TODO Expedition Insights: make selected insights available to future recap export flows.
// TODO Expedition Insights: elevate personal record cards without turning the hub into a dashboard.
// TODO Expedition Insights: add seasonal expedition trends and terrain preference analysis.

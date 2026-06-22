import type {
  ExpeditionRecap,
  ExpeditionRecapNotableMoment,
  ExpeditionTripCoordinate,
} from './expeditionTripRecordTypes';

export type TimelineCategory =
  | 'elevation'
  | 'weather'
  | 'route deviation'
  | 'reroute'
  | 'terrain risk'
  | 'recovery'
  | 'milestone'
  | 'campsite'
  | 'resupply';

export type NormalizedNotableMoment = {
  id: string;
  tripId: string;
  type: string;
  title: string;
  description: string;
  timestamp: string | null;
  elapsedSeconds: number | null;
  coordinate: ExpeditionTripCoordinate | null;
  severity: 'info' | 'watch' | 'caution' | 'critical';
  source: 'expedition_recap';
  createdAt: string | null;
  category: TimelineCategory;
};

const ROUTE_DEVIATION_TIMELINE_CLUSTER_MS = 5 * 60 * 1000;

export function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function categoryForMoment(type: ExpeditionRecapNotableMoment['type'] | string): TimelineCategory {
  switch (type) {
    case 'highest_elevation':
      return 'elevation';
    case 'weather_change':
      return 'weather';
    case 'route_deviation':
      return 'route deviation';
    case 'reroute_accepted':
      return 'reroute';
    case 'terrain_risk_warning':
      return 'terrain risk';
    case 'recovery_tools_opened':
      return 'recovery';
    default:
      return 'milestone';
  }
}

export function severityForCategory(category: TimelineCategory): NormalizedNotableMoment['severity'] {
  if (category === 'terrain risk') return 'caution';
  if (category === 'route deviation' || category === 'reroute' || category === 'recovery') return 'watch';
  return 'info';
}

export function descriptionForMoment(moment: ExpeditionRecapNotableMoment, category: TimelineCategory): string {
  const detail = moment.detail?.trim();
  if (detail) {
    if (category === 'elevation') return `Highest elevation recorded: ${detail}.`;
    if (category === 'weather') return `Weather change recorded: ${detail}.`;
    if (category === 'route deviation') return `Route deviation recorded: ${detail}.`;
    if (category === 'reroute') return `Reroute recorded: ${detail}.`;
    if (category === 'terrain risk') return `Terrain risk recorded: ${detail}.`;
    if (category === 'recovery') return `Recovery usage recorded: ${detail}.`;
    return detail.endsWith('.') ? detail : `${detail}.`;
  }

  if (category === 'elevation') return 'Highest elevation event captured from trip data.';
  if (category === 'weather') return 'Weather event captured from trip data.';
  if (category === 'route deviation') return 'Route deviation captured from trip data.';
  if (category === 'reroute') return 'Reroute event captured from trip data.';
  if (category === 'terrain risk') return 'Terrain risk event captured from trip data.';
  if (category === 'recovery') return 'Recovery tool usage captured from trip data.';
  return 'Milestone captured from completed trip data.';
}

function sortedMoments(moments: NormalizedNotableMoment[]): NormalizedNotableMoment[] {
  return [...moments].sort((left, right) => {
    const leftMs = timestampMs(left.timestamp) ?? Number.MAX_SAFE_INTEGER;
    const rightMs = timestampMs(right.timestamp) ?? Number.MAX_SAFE_INTEGER;
    if (leftMs !== rightMs) return leftMs - rightMs;
    return left.id.localeCompare(right.id);
  });
}

function collapseRouteDeviationClusters(moments: NormalizedNotableMoment[]): NormalizedNotableMoment[] {
  const collapsed: NormalizedNotableMoment[] = [];
  let lastKeptDeviationMs: number | null = null;

  for (const moment of moments) {
    if (moment.category === 'route deviation') {
      const currentMs = timestampMs(moment.timestamp);
      if (
        currentMs != null &&
        lastKeptDeviationMs != null &&
        currentMs >= lastKeptDeviationMs &&
        currentMs - lastKeptDeviationMs <= ROUTE_DEVIATION_TIMELINE_CLUSTER_MS
      ) {
        continue;
      }
      lastKeptDeviationMs = currentMs;
    }
    collapsed.push(moment);
  }

  return collapsed;
}

export function normalizeExpeditionNotableMoments(
  recap: ExpeditionRecap | null,
  tripStartedAt: string,
): NormalizedNotableMoment[] {
  const startedMs = timestampMs(tripStartedAt);
  const moments = (recap?.expeditionEvents.notableMoments ?? [])
    .map((moment, index) => {
      const capturedMs = timestampMs(moment.capturedAt);
      const category = categoryForMoment(moment.type);
      return {
        id: moment.id || `moment-${index}`,
        tripId: recap?.tripId ?? 'unknown-trip',
        type: moment.type,
        title: moment.title.trim() || 'Trip moment',
        description: descriptionForMoment(moment, category),
        timestamp: moment.capturedAt || null,
        elapsedSeconds:
          startedMs != null && capturedMs != null && capturedMs >= startedMs
            ? Math.round((capturedMs - startedMs) / 1000)
            : null,
        coordinate: moment.coordinate ?? null,
        severity: severityForCategory(category),
        source: 'expedition_recap' as const,
        createdAt: moment.capturedAt || null,
        category,
      };
    });

  return collapseRouteDeviationClusters(sortedMoments(moments));
}

export function formatNotableMomentLocalTime(value: string | null, locale?: string): string {
  const parsedMs = timestampMs(value);
  if (parsedMs == null) return 'Time unavailable';
  return new Date(parsedMs).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

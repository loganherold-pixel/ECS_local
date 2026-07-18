import {
  buildGuidanceRouteDistanceIndex,
  findNearestPlausibleRouteProjection,
  guidanceRouteDistanceMeters,
} from '../navigation/guidanceRouteProjection';
import { buildExpeditionRecapRoutePresentation } from './expeditionRecapRoutePresentation';
import type {
  ExpeditionBadge,
  ExpeditionRecapNotableMoment,
  ExpeditionTripCoordinate,
  ExpeditionTripDataQuality,
  ExpeditionTripRecord,
  ExpeditionTripSourceLabel,
} from './expeditionTripRecordTypes';

export type ExpeditionReportStoryCategory =
  | 'route'
  | 'achievement'
  | 'weather'
  | 'terrain'
  | 'convoy'
  | 'mechanical'
  | 'medical'
  | 'supply'
  | 'camp'
  | 'recovery'
  | 'highlight';

export type ExpeditionReportStorySignificance = 'info' | 'watch' | 'caution' | 'critical';

export type ExpeditionReportStoryCoverageStatus = 'recorded' | 'partial' | 'unavailable';

export type ExpeditionReportStoryPlacementBasis =
  | 'route_projection'
  | 'route_sample'
  | 'not_route_located';

export type ExpeditionReportTrackedEventInput = {
  id: string;
  capturedAt: string;
  title: string;
  detail?: string | null;
  category: ExpeditionReportStoryCategory;
  significance: ExpeditionReportStorySignificance;
  sourceLabel: string;
  sourceQuality: ExpeditionTripDataQuality;
  syncState?: string | null;
  coordinate?: ExpeditionTripCoordinate | null;
};

export type ExpeditionReportStoryTimelineEvent = {
  id: string;
  capturedAt: string | null;
  elapsedSeconds: number | null;
  category: ExpeditionReportStoryCategory;
  significance: ExpeditionReportStorySignificance;
  title: string;
  detail: string | null;
  sourceLabel: string;
  sourceQuality: ExpeditionTripDataQuality;
  syncState: string | null;
  routeProgressPercent: number | null;
  placementBasis: ExpeditionReportStoryPlacementBasis;
};

export type ExpeditionReportStoryRoutePoint = {
  x: number;
  y: number;
  progressPercent: number;
};

export type ExpeditionReportStoryElevationPoint = {
  progressPercent: number;
  elevationPercent: number;
  elevationFt: number;
};

export type ExpeditionReportStoryRoute = {
  status: 'ready' | 'unavailable';
  source: 'recorded' | 'planned' | 'unavailable';
  sourceLabel: string;
  sourceDetail: string;
  points: ExpeditionReportStoryRoutePoint[];
  elevationProfile: ExpeditionReportStoryElevationPoint[];
  elevationSampleCount: number;
  locatedEventCount: number;
};

export type ExpeditionReportStoryCoverage = {
  id: 'route' | 'weather' | 'terrain' | 'convoy' | 'field_log' | 'achievements';
  label: string;
  status: ExpeditionReportStoryCoverageStatus;
  count: number;
  detail: string;
};

export type ExpeditionReportStorySection = {
  id: 'journey' | 'weather' | 'terrain' | 'convoy' | 'field_log' | 'achievements';
  title: string;
  status: ExpeditionReportStoryCoverageStatus;
  paragraphs: string[];
  eventIds: string[];
};

export type ExpeditionReportStory = {
  version: 1;
  route: ExpeditionReportStoryRoute;
  narrativeParagraphs: string[];
  sections: ExpeditionReportStorySection[];
  timeline: ExpeditionReportStoryTimelineEvent[];
  coverage: ExpeditionReportStoryCoverage[];
  omittedEventCount: number;
  privacyNotice: string;
};

export type BuildExpeditionReportStoryInput = {
  trip: ExpeditionTripRecord;
  badgesEarned?: readonly ExpeditionBadge[];
  trackedEvents?: readonly ExpeditionReportTrackedEventInput[];
};

type PendingEvent = Omit<ExpeditionReportStoryTimelineEvent, 'elapsedSeconds' | 'routeProgressPercent' | 'placementBasis'> & {
  coordinate: ExpeditionTripCoordinate | null;
  routePointIndex?: number | null;
};

const MAX_ROUTE_POINTS = 180;
const MAX_ELEVATION_POINTS = 160;
const MAX_TIMELINE_EVENTS = 300;
const MAX_ROUTE_EVENT_DISTANCE_M = 3218.69;
const STORY_CATEGORIES: ExpeditionReportStoryCategory[] = [
  'route',
  'achievement',
  'weather',
  'terrain',
  'convoy',
  'mechanical',
  'medical',
  'supply',
  'camp',
  'recovery',
  'highlight',
];
const SIGNIFICANCE_LEVELS: ExpeditionReportStorySignificance[] = ['info', 'watch', 'caution', 'critical'];
const SOURCE_QUALITIES: ExpeditionTripDataQuality[] = ['live', 'cached', 'stale', 'manual', 'mock', 'missing', 'estimated'];

function cleanText(value: unknown, limit = 700): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return normalized ? normalized.slice(0, limit) : null;
}

function validTimestamp(value: unknown): string | null {
  const normalized = cleanText(value, 80);
  return normalized && Number.isFinite(new Date(normalized).getTime()) ? normalized : null;
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function rounded(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function validCoordinate(value: ExpeditionTripCoordinate | null | undefined): ExpeditionTripCoordinate | null {
  if (
    !value ||
    !Number.isFinite(value.lat) ||
    !Number.isFinite(value.lng) ||
    value.lat < -90 ||
    value.lat > 90 ||
    value.lng < -180 ||
    value.lng > 180
  ) {
    return null;
  }
  return value;
}

function sourceLabel(source: ExpeditionTripSourceLabel | null | undefined, fallback: string): string {
  return cleanText(source?.source, 120) ?? fallback;
}

function sourceQuality(source: ExpeditionTripSourceLabel | null | undefined): ExpeditionTripDataQuality {
  return source && SOURCE_QUALITIES.includes(source.quality) ? source.quality : 'missing';
}

function significanceForTerrain(
  value: 'normal' | 'watch' | 'caution' | 'critical' | null | undefined,
): ExpeditionReportStorySignificance {
  if (value === 'critical') return 'critical';
  if (value === 'caution') return 'caution';
  if (value === 'watch') return 'watch';
  return 'info';
}

function significanceForBadge(badge: ExpeditionBadge): ExpeditionReportStorySignificance {
  if (badge.rarity === 'legendary') return 'critical';
  if (badge.rarity === 'epic' || badge.rarity === 'rare') return 'caution';
  if (badge.rarity === 'uncommon') return 'watch';
  return 'info';
}

function tripMomentCategory(type: string): ExpeditionReportStoryCategory {
  if (type === 'badge_unlocked') return 'achievement';
  if (type === 'camp_viewed') return 'camp';
  if (type === 'resupply_viewed') return 'supply';
  if (type === 'recovery_used') return 'recovery';
  if (type === 'manual_note') return 'highlight';
  return 'route';
}

function recapMomentCategory(type: ExpeditionRecapNotableMoment['type']): ExpeditionReportStoryCategory {
  if (type === 'weather_change') return 'weather';
  if (type === 'terrain_risk_warning' || type === 'highest_elevation') return 'terrain';
  if (type === 'badge_unlocked') return 'achievement';
  if (type === 'recovery_tools_opened') return 'recovery';
  if (type === 'manual_note') return 'highlight';
  return 'route';
}

function eventSignificance(category: ExpeditionReportStoryCategory, type: string): ExpeditionReportStorySignificance {
  if (category === 'medical') return 'critical';
  if (category === 'mechanical' || category === 'recovery') return 'watch';
  if (type.includes('deviation') || type.includes('cancelled')) return 'caution';
  return 'info';
}

function pushEvent(target: PendingEvent[], event: Partial<PendingEvent> & Pick<PendingEvent, 'id' | 'category' | 'title'>): void {
  const id = cleanText(event.id, 180);
  const title = cleanText(event.title, 220);
  if (!id || !title || !STORY_CATEGORIES.includes(event.category)) return;
  target.push({
    id,
    capturedAt: validTimestamp(event.capturedAt),
    category: event.category,
    significance: SIGNIFICANCE_LEVELS.includes(event.significance as ExpeditionReportStorySignificance)
      ? event.significance as ExpeditionReportStorySignificance
      : 'info',
    title,
    detail: cleanText(event.detail),
    sourceLabel: cleanText(event.sourceLabel, 120) ?? 'Saved expedition record',
    sourceQuality: SOURCE_QUALITIES.includes(event.sourceQuality as ExpeditionTripDataQuality)
      ? event.sourceQuality as ExpeditionTripDataQuality
      : 'missing',
    syncState: cleanText(event.syncState, 80),
    coordinate: validCoordinate(event.coordinate),
    routePointIndex: finiteNumber(event.routePointIndex),
  });
}

function weatherDetail(snapshot: ExpeditionTripRecord['weatherSnapshots'][number]): string | null {
  return [
    cleanText(snapshot.summary),
    finiteNumber(snapshot.temperatureF) == null ? null : `${Math.round(snapshot.temperatureF as number)} F`,
    finiteNumber(snapshot.windMph) == null ? null : `${Math.round(snapshot.windMph as number)} mph wind`,
    cleanText(snapshot.precipitation),
  ].filter((value): value is string => !!value).join(' / ') || null;
}

function collectPendingEvents(input: BuildExpeditionReportStoryInput): PendingEvent[] {
  const { trip } = input;
  const events: PendingEvent[] = [];

  trip.notableMoments.forEach((moment) => {
    const category = tripMomentCategory(moment.type);
    pushEvent(events, {
      id: `trip:${moment.id}`,
      capturedAt: moment.capturedAt,
      category,
      significance: eventSignificance(category, moment.type),
      title: moment.title,
      detail: moment.detail,
      coordinate: moment.coordinate,
      sourceLabel: sourceLabel(moment.source, 'Saved trip event'),
      sourceQuality: sourceQuality(moment.source),
    });
  });

  trip.weatherSnapshots.forEach((snapshot) => pushEvent(events, {
    id: `weather:${snapshot.id}`,
    capturedAt: snapshot.capturedAt,
    category: 'weather',
    significance: finiteNumber(snapshot.windMph) != null && Number(snapshot.windMph) >= 30 ? 'caution' : 'info',
    title: cleanText(snapshot.summary) ?? 'Weather update',
    detail: weatherDetail(snapshot),
    coordinate: snapshot.coordinate,
    sourceLabel: sourceLabel(snapshot.source, 'Saved weather snapshot'),
    sourceQuality: sourceQuality(snapshot.source),
  }));

  trip.terrainRiskSnapshots.forEach((snapshot) => pushEvent(events, {
    id: `terrain:${snapshot.id}`,
    capturedAt: snapshot.capturedAt,
    category: 'terrain',
    significance: significanceForTerrain(snapshot.riskLevel),
    title: snapshot.riskLevel && snapshot.riskLevel !== 'normal'
      ? `${snapshot.riskLevel[0].toUpperCase()}${snapshot.riskLevel.slice(1)} terrain event`
      : 'Terrain update',
    detail: snapshot.summary,
    coordinate: snapshot.coordinate,
    sourceLabel: sourceLabel(snapshot.source, 'Saved terrain analysis'),
    sourceQuality: sourceQuality(snapshot.source),
  }));

  trip.deviations.forEach((deviation) => pushEvent(events, {
    id: `deviation:${deviation.id}`,
    capturedAt: deviation.capturedAt,
    category: 'route',
    significance: 'caution',
    title: 'Route deviation recorded',
    detail: [
      cleanText(deviation.statusLabel),
      finiteNumber(deviation.distanceMeters) == null ? null : `${Math.round(deviation.distanceMeters as number)} m from route`,
    ].filter((value): value is string => !!value).join(' / ') || null,
    coordinate: deviation.coordinate,
    sourceLabel: sourceLabel(deviation.source, 'Navigate guidance'),
    sourceQuality: sourceQuality(deviation.source),
  }));

  trip.recoveryPanelUsed.forEach((usage, index) => pushEvent(events, {
    id: `recovery:${index}:${usage.usedAt}`,
    capturedAt: usage.usedAt,
    category: 'recovery',
    significance: 'watch',
    title: 'Recovery tools used',
    detail: usage.context,
    sourceLabel: sourceLabel(usage.source, 'Incident and recovery'),
    sourceQuality: sourceQuality(usage.source),
  }));

  const viewedGroups: {
    category: 'camp' | 'supply' | 'route';
    label: string;
    values: ExpeditionTripRecord['campCandidatesViewed'];
  }[] = [
    { category: 'camp', label: 'Camp candidate reviewed', values: trip.campCandidatesViewed },
    { category: 'supply', label: 'Resupply stop reviewed', values: trip.resupplyStopsViewed },
    { category: 'route', label: 'Bailout option reviewed', values: trip.bailoutPointsUsed },
  ];
  viewedGroups.forEach((group) => group.values.forEach((item) => pushEvent(events, {
    id: `${group.category}:${item.id}`,
    capturedAt: item.viewedAt,
    category: group.category,
    significance: group.category === 'route' ? 'watch' : 'info',
    title: item.title ?? group.label,
    detail: item.title ? group.label : null,
    coordinate: item.coordinate,
    sourceLabel: sourceLabel(item.source, 'Saved expedition planning'),
    sourceQuality: sourceQuality(item.source),
  })));

  const recapIdsDerivedFromDirectSources = new Set<string>([
    ...trip.notableMoments.map((moment) => moment.id),
    `highest-elevation:${trip.id}`,
    `weather-change:${trip.id}`,
    ...trip.deviations.map((deviation) => `recap:${deviation.id}`),
    ...trip.recoveryPanelUsed.map((usage) => `recovery:${usage.usedAt}`),
    ...trip.terrainRiskSnapshots.map((risk) => `terrain-risk:${risk.id}`),
  ]);
  (trip.recap?.expeditionEvents.notableMoments ?? [])
    .filter((moment) => !recapIdsDerivedFromDirectSources.has(moment.id))
    .forEach((moment) => {
      const category = recapMomentCategory(moment.type);
      pushEvent(events, {
        id: `recap:${moment.id}`,
        capturedAt: moment.capturedAt,
        category,
        significance: eventSignificance(category, moment.type),
        title: moment.title,
        detail: moment.detail,
        coordinate: moment.coordinate,
        sourceLabel: 'Saved deterministic expedition recap',
        sourceQuality: 'estimated',
      });
    });

  (input.badgesEarned ?? []).filter((badge) => !!badge.unlockedAt).forEach((badge) => pushEvent(events, {
    id: `badge:${badge.id}`,
    capturedAt: badge.unlockedAt,
    category: 'achievement',
    significance: significanceForBadge(badge),
    title: badge.title,
    detail: badge.description,
    sourceLabel: 'ECS deterministic badge engine',
    sourceQuality: 'estimated',
    coordinate: null,
  }));

  (input.trackedEvents ?? []).forEach((event) => pushEvent(events, event));

  return events;
}

function timestampMs(value: string | null): number {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function elapsedSeconds(startedAt: string, capturedAt: string | null): number | null {
  const started = new Date(startedAt).getTime();
  const captured = capturedAt ? new Date(capturedAt).getTime() : Number.NaN;
  if (!Number.isFinite(started) || !Number.isFinite(captured) || captured < started) return null;
  return Math.round((captured - started) / 1000);
}

function sampleIndices(length: number, maxPoints: number, preserved: number[] = []): number[] {
  if (length <= maxPoints) return Array.from({ length }, (_, index) => index);
  const indices = new Set<number>([0, length - 1, ...preserved.filter((index) => index >= 0 && index < length)]);
  const remaining = Math.max(0, maxPoints - indices.size);
  const step = (length - 1) / Math.max(1, remaining + 1);
  for (let index = 1; index <= remaining; index += 1) indices.add(Math.round(index * step));
  return [...indices].sort((left, right) => left - right).slice(0, maxPoints);
}

function routeProgressDistances(geometry: ExpeditionTripCoordinate[]): number[] {
  const distances = [0];
  for (let index = 1; index < geometry.length; index += 1) {
    distances[index] = distances[index - 1] + guidanceRouteDistanceMeters(geometry[index - 1], geometry[index]);
  }
  return distances;
}

function buildRoute(
  trip: ExpeditionTripRecord,
  pending: PendingEvent[],
): {
  route: ExpeditionReportStoryRoute;
  timeline: ExpeditionReportStoryTimelineEvent[];
} {
  const presentation = buildExpeditionRecapRoutePresentation({
    tripId: trip.id,
    startedAt: trip.startedAt,
    completedAt: trip.completedAt,
    routeGeometry: trip.routeGeometry,
    plannedRouteGeometry: trip.plannedRouteGeometry,
    recap: trip.recap,
  });
  const routeStoryEvents: PendingEvent[] = [];
  const routeDerivedMomentTypes = new Set([
    'route_start',
    'route_finish',
    'lowest_elevation',
    'elevation_sample',
    'flat_elevation_profile',
    ...(presentation.source === 'planned' ? ['highest_elevation'] : []),
  ]);
  presentation.storyMoments
    .filter((moment) => routeDerivedMomentTypes.has(moment.type))
    .forEach((moment) => pushEvent(routeStoryEvents, {
    id: `route-story:${moment.id}`,
    capturedAt: moment.timestamp,
    category: moment.category === 'elevation' ? 'terrain' : 'route',
    significance: 'info',
    title: moment.title,
    detail: moment.description,
    coordinate: moment.coordinate,
    routePointIndex: moment.routePointIndex,
    sourceLabel: presentation.sourceLabel,
    sourceQuality: presentation.source === 'recorded' ? 'cached' : 'estimated',
    }));
  const pendingWithRouteStory = [...pending, ...routeStoryEvents];
  const geometry = presentation.geometry;
  if (presentation.status !== 'ready' || geometry.length < 2) {
    return {
      route: {
        status: 'unavailable',
        source: 'unavailable',
        sourceLabel: presentation.sourceLabel,
        sourceDetail: presentation.sourceDetail,
        points: [],
        elevationProfile: [],
        elevationSampleCount: 0,
        locatedEventCount: 0,
      },
      timeline: pendingWithRouteStory.map(({ coordinate: _coordinate, routePointIndex: _routePointIndex, ...event }): ExpeditionReportStoryTimelineEvent => ({
        ...event,
        elapsedSeconds: elapsedSeconds(trip.startedAt, event.capturedAt),
        routeProgressPercent: null,
        placementBasis: 'not_route_located',
      })),
    };
  }

  const lats = geometry.map((coordinate) => coordinate.lat);
  const lngs = geometry.map((coordinate) => coordinate.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  if (maxLng - minLng > 180) {
    return {
      route: {
        status: 'unavailable',
        source: presentation.source,
        sourceLabel: presentation.sourceLabel,
        sourceDetail: `${presentation.sourceDetail} The redacted print schematic does not support longitude-boundary routes.`,
        points: [],
        elevationProfile: [],
        elevationSampleCount: presentation.elevationSampleCount,
        locatedEventCount: 0,
      },
      timeline: pendingWithRouteStory.map(({ coordinate: _coordinate, routePointIndex: _routePointIndex, ...event }): ExpeditionReportStoryTimelineEvent => ({
        ...event,
        elapsedSeconds: elapsedSeconds(trip.startedAt, event.capturedAt),
        routeProgressPercent: null,
        placementBasis: 'not_route_located',
      })),
    };
  }

  const cumulative = routeProgressDistances(geometry);
  const totalDistance = cumulative[cumulative.length - 1] || 1;
  const elevationValues = geometry
    .map((coordinate, index) => ({ index, value: finiteNumber(coordinate.elevationFt) }))
    .filter((entry): entry is { index: number; value: number } => entry.value != null);
  const highIndex = elevationValues.reduce<number | null>(
    (selected, entry) => selected == null || entry.value > (finiteNumber(geometry[selected].elevationFt) ?? -Infinity) ? entry.index : selected,
    null,
  );
  const lowIndex = elevationValues.reduce<number | null>(
    (selected, entry) => selected == null || entry.value < (finiteNumber(geometry[selected].elevationFt) ?? Infinity) ? entry.index : selected,
    null,
  );
  const routeIndices = sampleIndices(geometry.length, MAX_ROUTE_POINTS, [highIndex ?? -1, lowIndex ?? -1]);
  const latRange = Math.max(0.000001, maxLat - minLat);
  const lngRange = Math.max(0.000001, maxLng - minLng);
  const points = routeIndices.map<ExpeditionReportStoryRoutePoint>((index) => ({
    x: rounded(((geometry[index].lng - minLng) / lngRange) * 100),
    y: rounded((1 - (geometry[index].lat - minLat) / latRange) * 100),
    progressPercent: rounded((cumulative[index] / totalDistance) * 100),
  }));

  const minElevation = elevationValues.length > 0 ? Math.min(...elevationValues.map((entry) => entry.value)) : 0;
  const maxElevation = elevationValues.length > 0 ? Math.max(...elevationValues.map((entry) => entry.value)) : 0;
  const elevationRange = Math.max(1, maxElevation - minElevation);
  const elevationIndices = sampleIndices(
    elevationValues.length,
    MAX_ELEVATION_POINTS,
    [
      highIndex == null ? -1 : elevationValues.findIndex((entry) => entry.index === highIndex),
      lowIndex == null ? -1 : elevationValues.findIndex((entry) => entry.index === lowIndex),
    ],
  );
  const elevationProfile = elevationIndices.map<ExpeditionReportStoryElevationPoint>((sampleIndex) => {
    const entry = elevationValues[sampleIndex];
    return {
      progressPercent: rounded((cumulative[entry.index] / totalDistance) * 100),
      elevationPercent: rounded(((entry.value - minElevation) / elevationRange) * 100),
      elevationFt: rounded(entry.value, 0),
    };
  });

  const routeIndex = buildGuidanceRouteDistanceIndex(geometry);
  let locatedEventCount = 0;
  const timeline = pendingWithRouteStory.map<ExpeditionReportStoryTimelineEvent>((event) => {
    let routeProgressPercent: number | null = null;
    let placementBasis: ExpeditionReportStoryPlacementBasis = 'not_route_located';
    if (event.routePointIndex != null && event.routePointIndex >= 0 && event.routePointIndex < cumulative.length) {
      routeProgressPercent = rounded((cumulative[event.routePointIndex] / totalDistance) * 100);
      placementBasis = 'route_sample';
    } else if (event.coordinate) {
      const projection = findNearestPlausibleRouteProjection({
        position: event.coordinate,
        routeIndex,
      });
      if (projection && projection.distanceFromPositionM <= MAX_ROUTE_EVENT_DISTANCE_M) {
        routeProgressPercent = rounded((projection.distanceFromRouteStartM / Math.max(1, routeIndex.totalDistanceM)) * 100);
        placementBasis = 'route_projection';
      }
    }
    if (routeProgressPercent != null) locatedEventCount += 1;
    return {
      id: event.id,
      capturedAt: event.capturedAt,
      elapsedSeconds: elapsedSeconds(trip.startedAt, event.capturedAt),
      category: event.category,
      significance: event.significance,
      title: event.title,
      detail: event.detail,
      sourceLabel: event.sourceLabel,
      sourceQuality: event.sourceQuality,
      syncState: event.syncState,
      routeProgressPercent: routeProgressPercent == null ? null : clamp(routeProgressPercent),
      placementBasis,
    };
  });

  return {
    route: {
      status: points.length >= 2 ? 'ready' : 'unavailable',
      source: presentation.source,
      sourceLabel: presentation.sourceLabel,
      sourceDetail: presentation.sourceDetail,
      points,
      elevationProfile,
      elevationSampleCount: presentation.elevationSampleCount,
      locatedEventCount,
    },
    timeline,
  };
}

function dedupeAndSort(events: ExpeditionReportStoryTimelineEvent[]): ExpeditionReportStoryTimelineEvent[] {
  const seenIds = new Set<string>();
  const seenSemanticEvents = new Set<string>();
  return [...events]
    .sort((left, right) => {
      const delta = timestampMs(left.capturedAt) - timestampMs(right.capturedAt);
      return delta !== 0 ? delta : left.id.localeCompare(right.id);
    })
    .filter((event) => {
      const semanticIdentity = `${event.category}|${event.capturedAt ?? ''}|${event.title.toLowerCase()}`;
      if (seenIds.has(event.id) || seenSemanticEvents.has(semanticIdentity)) return false;
      seenIds.add(event.id);
      seenSemanticEvents.add(semanticIdentity);
      return true;
    });
}

function coverageStatus(events: ExpeditionReportStoryTimelineEvent[]): ExpeditionReportStoryCoverageStatus {
  if (events.length === 0) return 'unavailable';
  return events.some((event) => event.sourceQuality === 'stale' || event.sourceQuality === 'missing' || event.sourceQuality === 'mock')
    ? 'partial'
    : 'recorded';
}

function coverageFor(
  id: ExpeditionReportStoryCoverage['id'],
  label: string,
  events: ExpeditionReportStoryTimelineEvent[],
  unavailableDetail: string,
): ExpeditionReportStoryCoverage {
  const status = coverageStatus(events);
  const partial = events.filter((event) => event.sourceQuality === 'stale' || event.sourceQuality === 'missing' || event.sourceQuality === 'mock').length;
  return {
    id,
    label,
    status,
    count: events.length,
    detail: status === 'unavailable'
      ? unavailableDetail
      : status === 'partial'
        ? `${events.length} saved event(s); ${partial} use stale, missing, or mocked source state.`
        : `${events.length} saved event(s) are available for this report.`,
  };
}

function formatDistance(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString()} mi`;
}

function formatDuration(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const hours = seconds / 3600;
  return hours < 1 ? `${Math.max(1, Math.round(seconds / 60))} min` : `${rounded(hours, 1)} hr${hours >= 1.5 ? 's' : ''}`;
}

function section(
  id: ExpeditionReportStorySection['id'],
  title: string,
  events: ExpeditionReportStoryTimelineEvent[],
  unavailable: string,
  recordedParagraph: (events: ExpeditionReportStoryTimelineEvent[]) => string,
): ExpeditionReportStorySection {
  const status = coverageStatus(events);
  return {
    id,
    title,
    status,
    paragraphs: [status === 'unavailable' ? unavailable : recordedParagraph(events)],
    eventIds: events.map((event) => event.id),
  };
}

function buildNarrative(
  trip: ExpeditionTripRecord,
  route: ExpeditionReportStoryRoute,
  timeline: ExpeditionReportStoryTimelineEvent[],
): string[] {
  const metrics = [formatDistance(trip.totalDistanceMiles), formatDuration(trip.totalDurationSeconds)].filter(Boolean);
  const first = `${trip.title} is preserved as a completed expedition${metrics.length > 0 ? ` covering ${metrics.join(' over ')}` : ''}. ${route.sourceDetail}`;
  const counts = {
    achievements: timeline.filter((event) => event.category === 'achievement').length,
    weather: timeline.filter((event) => event.category === 'weather').length,
    terrain: timeline.filter((event) => event.category === 'terrain').length,
    convoy: timeline.filter((event) => event.category === 'convoy').length,
    mechanical: timeline.filter((event) => event.category === 'mechanical').length,
    recovery: timeline.filter((event) => event.category === 'recovery').length,
    highlights: timeline.filter((event) => event.category === 'highlight').length,
  };
  const observed = [
    counts.achievements ? `${counts.achievements} achievement${counts.achievements === 1 ? '' : 's'}` : null,
    counts.weather ? `${counts.weather} weather update${counts.weather === 1 ? '' : 's'}` : null,
    counts.terrain ? `${counts.terrain} terrain event${counts.terrain === 1 ? '' : 's'}` : null,
    counts.convoy ? `${counts.convoy} convoy or communications event${counts.convoy === 1 ? '' : 's'}` : null,
    counts.mechanical ? `${counts.mechanical} mechanical event${counts.mechanical === 1 ? '' : 's'}` : null,
    counts.recovery ? `${counts.recovery} recovery action${counts.recovery === 1 ? '' : 's'}` : null,
    counts.highlights ? `${counts.highlights} saved highlight${counts.highlights === 1 ? '' : 's'}` : null,
  ].filter((value): value is string => !!value);
  const second = observed.length > 0
    ? `The saved timeline contains ${observed.join(', ')}. Each item below retains its recorded source state; unavailable history is identified separately.`
    : 'No detailed operational events were preserved with this trip. The report does not reconstruct missing history from current app state.';
  return [first, second];
}

export function buildExpeditionReportStory(input: BuildExpeditionReportStoryInput): ExpeditionReportStory {
  const pending = collectPendingEvents(input);
  const routeResult = buildRoute(input.trip, pending);
  const sorted = dedupeAndSort(routeResult.timeline);
  const omittedEventCount = Math.max(0, sorted.length - MAX_TIMELINE_EVENTS);
  const timeline = sorted.slice(0, MAX_TIMELINE_EVENTS);
  const byCategory = (categories: ExpeditionReportStoryCategory[]) => timeline.filter((event) => categories.includes(event.category));
  const weather = byCategory(['weather']);
  const terrain = byCategory(['terrain']);
  const convoy = byCategory(['convoy']);
  const fieldLog = byCategory(['mechanical', 'medical', 'supply', 'camp', 'recovery', 'highlight']);
  const achievements = byCategory(['achievement']);
  const routeEvents = byCategory(['route']);
  const routeCoverageStatus: ExpeditionReportStoryCoverageStatus = routeResult.route.status !== 'ready'
    ? 'unavailable'
    : routeResult.route.source === 'recorded'
      ? 'recorded'
      : 'partial';
  const routeCoverage: ExpeditionReportStoryCoverage = {
    id: 'route',
    label: 'Route story',
    status: routeCoverageStatus,
    count: routeEvents.length,
    detail: routeResult.route.sourceDetail,
  };
  const coverage: ExpeditionReportStoryCoverage[] = [
    routeCoverage,
    coverageFor('weather', 'Weather history', weather, 'No historical weather snapshots were saved with this expedition.'),
    coverageFor('terrain', 'Terrain history', terrain, 'No historical terrain-risk events were saved with this expedition.'),
    coverageFor('convoy', 'Convoy and communications history', convoy, 'No expedition-linked convoy or communications events were available.'),
    coverageFor('field_log', 'Field log and operational history', fieldLog, 'No expedition-linked field log events were available.'),
    coverageFor('achievements', 'Achievements', achievements, 'No achievements were earned from this expedition.'),
  ];
  const sections: ExpeditionReportStorySection[] = [
    {
      id: 'journey',
      title: 'Journey',
      status: routeCoverageStatus,
      paragraphs: buildNarrative(input.trip, routeResult.route, timeline),
      eventIds: routeEvents.map((event) => event.id),
    },
    section('weather', 'Weather Along the Journey', weather, 'No historical weather updates were saved. Current weather was not substituted into this report.', (events) => `${events.length} saved weather update(s) appear in chronological order below, with their original source state.`),
    section('terrain', 'Terrain and Route Risk', terrain, 'No historical terrain-risk events were saved. Route elevation alone is not treated as technical difficulty.', (events) => `${events.length} saved terrain or elevation event(s) are shown. Their significance comes only from the deterministic saved analysis.`),
    section('convoy', 'Convoy and Communications', convoy, 'No expedition-linked convoy or communications history was available for this report.', (events) => `${events.length} expedition-linked convoy or communications event(s) were preserved. Current team positions were not used.`),
    section('field_log', 'Field Notes and Operational Moments', fieldLog, 'No expedition-linked field notes, breakdowns, supply, camp, medical, or recovery moments were available.', (events) => `${events.length} saved operational moment(s) document highlights, stops, breakdowns, resources, or recovery activity.`),
    section('achievements', 'Achievements', achievements, 'No achievements were earned from this expedition.', (events) => `${events.length} achievement(s) were earned from this expedition. Badge evaluation time is not presented as a route location.`),
  ];

  return {
    version: 1,
    route: routeResult.route,
    narrativeParagraphs: buildNarrative(input.trip, routeResult.route, timeline),
    sections,
    timeline,
    coverage,
    omittedEventCount,
    privacyNotice: 'This shared report uses a location-redacted route schematic. Exact coordinates, route bounds, member identities, attachments, and raw provider payloads are omitted.',
  };
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function normalizedStringArray(value: unknown, limit: number): string[] {
  return (Array.isArray(value) ? value : [])
    .map((item) => cleanText(item))
    .filter((item): item is string => !!item)
    .slice(0, limit);
}

export function normalizeExpeditionReportStory(value: unknown): ExpeditionReportStory | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Partial<ExpeditionReportStory>;
  if (input.version !== 1 || !input.route || typeof input.route !== 'object') return null;
  const route = input.route as Partial<ExpeditionReportStoryRoute>;
  const points = (Array.isArray(route.points) ? route.points : []).map((point) => {
    const raw = point as Partial<ExpeditionReportStoryRoutePoint>;
    const x = finiteNumber(raw.x);
    const y = finiteNumber(raw.y);
    const progressPercent = finiteNumber(raw.progressPercent);
    if (x == null || y == null || progressPercent == null) return null;
    return { x: clamp(x), y: clamp(y), progressPercent: clamp(progressPercent) };
  }).filter((point): point is ExpeditionReportStoryRoutePoint => !!point).slice(0, MAX_ROUTE_POINTS);
  const elevationProfile = (Array.isArray(route.elevationProfile) ? route.elevationProfile : []).map((point) => {
    const raw = point as Partial<ExpeditionReportStoryElevationPoint>;
    const progressPercent = finiteNumber(raw.progressPercent);
    const elevationPercent = finiteNumber(raw.elevationPercent);
    const elevationFt = finiteNumber(raw.elevationFt);
    if (progressPercent == null || elevationPercent == null || elevationFt == null) return null;
    return { progressPercent: clamp(progressPercent), elevationPercent: clamp(elevationPercent), elevationFt };
  }).filter((point): point is ExpeditionReportStoryElevationPoint => !!point).slice(0, MAX_ELEVATION_POINTS);
  const timeline = (Array.isArray(input.timeline) ? input.timeline : []).map((item) => {
    const raw = item as Partial<ExpeditionReportStoryTimelineEvent>;
    const id = cleanText(raw.id, 180);
    const title = cleanText(raw.title, 220);
    if (!id || !title) return null;
    const routeProgressPercent = finiteNumber(raw.routeProgressPercent);
    return {
      id,
      capturedAt: validTimestamp(raw.capturedAt),
      elapsedSeconds: finiteNumber(raw.elapsedSeconds),
      category: enumValue(raw.category, STORY_CATEGORIES, 'highlight'),
      significance: enumValue(raw.significance, SIGNIFICANCE_LEVELS, 'info'),
      title,
      detail: cleanText(raw.detail),
      sourceLabel: cleanText(raw.sourceLabel, 120) ?? 'Saved expedition record',
      sourceQuality: enumValue(raw.sourceQuality, SOURCE_QUALITIES, 'missing'),
      syncState: cleanText(raw.syncState, 80),
      routeProgressPercent: routeProgressPercent == null ? null : clamp(routeProgressPercent),
      placementBasis: enumValue(raw.placementBasis, ['route_projection', 'route_sample', 'not_route_located'] as const, 'not_route_located'),
    };
  }).filter((item): item is ExpeditionReportStoryTimelineEvent => !!item).slice(0, MAX_TIMELINE_EVENTS);
  const coverageIds: ExpeditionReportStoryCoverage['id'][] = ['route', 'weather', 'terrain', 'convoy', 'field_log', 'achievements'];
  const coverage = (Array.isArray(input.coverage) ? input.coverage : []).map((item) => {
    const raw = item as Partial<ExpeditionReportStoryCoverage>;
    if (!coverageIds.includes(raw.id as ExpeditionReportStoryCoverage['id'])) return null;
    return {
      id: raw.id as ExpeditionReportStoryCoverage['id'],
      label: cleanText(raw.label, 120) ?? String(raw.id),
      status: enumValue(raw.status, ['recorded', 'partial', 'unavailable'] as const, 'unavailable'),
      count: Math.max(0, Math.round(finiteNumber(raw.count) ?? 0)),
      detail: cleanText(raw.detail) ?? 'Source state unavailable.',
    };
  }).filter((item): item is ExpeditionReportStoryCoverage => !!item).slice(0, coverageIds.length);
  const sectionIds: ExpeditionReportStorySection['id'][] = ['journey', 'weather', 'terrain', 'convoy', 'field_log', 'achievements'];
  const sections = (Array.isArray(input.sections) ? input.sections : []).map((item) => {
    const raw = item as Partial<ExpeditionReportStorySection>;
    if (!sectionIds.includes(raw.id as ExpeditionReportStorySection['id'])) return null;
    return {
      id: raw.id as ExpeditionReportStorySection['id'],
      title: cleanText(raw.title, 160) ?? String(raw.id),
      status: enumValue(raw.status, ['recorded', 'partial', 'unavailable'] as const, 'unavailable'),
      paragraphs: normalizedStringArray(raw.paragraphs, 4),
      eventIds: normalizedStringArray(raw.eventIds, MAX_TIMELINE_EVENTS),
    };
  }).filter((item): item is ExpeditionReportStorySection => !!item).slice(0, sectionIds.length);

  return {
    version: 1,
    route: {
      status: route.status === 'ready' && points.length >= 2 ? 'ready' : 'unavailable',
      source: enumValue(route.source, ['recorded', 'planned', 'unavailable'] as const, 'unavailable'),
      sourceLabel: cleanText(route.sourceLabel, 120) ?? 'Route unavailable',
      sourceDetail: cleanText(route.sourceDetail) ?? 'Route source detail unavailable.',
      points,
      elevationProfile,
      elevationSampleCount: Math.max(0, Math.round(finiteNumber(route.elevationSampleCount) ?? elevationProfile.length)),
      locatedEventCount: Math.max(0, Math.round(finiteNumber(route.locatedEventCount) ?? 0)),
    },
    narrativeParagraphs: normalizedStringArray(input.narrativeParagraphs, 4),
    sections,
    timeline,
    coverage,
    omittedEventCount: Math.max(0, Math.round(finiteNumber(input.omittedEventCount) ?? 0)),
    privacyNotice: cleanText(input.privacyNotice) ?? 'Exact locations are omitted from this shared report.',
  };
}

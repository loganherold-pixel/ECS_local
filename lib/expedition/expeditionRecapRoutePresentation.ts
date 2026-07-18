import {
  normalizeExpeditionNotableMoments,
  timestampMs,
  type NormalizedNotableMoment,
} from './expeditionNotableMomentTimelineModel';
import type {
  ExpeditionRecap,
  ExpeditionTripBounds,
  ExpeditionTripCoordinate,
} from './expeditionTripRecordTypes';

export type ExpeditionRecapRouteSource = 'recorded' | 'planned' | 'unavailable';

export type ExpeditionRecapRouteStoryMoment = NormalizedNotableMoment & {
  routePointIndex: number | null;
  routeSource: Exclude<ExpeditionRecapRouteSource, 'unavailable'>;
};

export type ExpeditionRecapElevationExtremum = {
  coordinate: ExpeditionTripCoordinate;
  elevationFt: number;
  routePointIndex: number;
};

export type ExpeditionRecapRoutePresentation = {
  status: 'ready' | 'unavailable';
  source: ExpeditionRecapRouteSource;
  sourceLabel: string;
  sourceDetail: string;
  geometry: ExpeditionTripCoordinate[];
  bounds: ExpeditionTripBounds | null;
  startCoordinate: ExpeditionTripCoordinate | null;
  endCoordinate: ExpeditionTripCoordinate | null;
  elevationSampleCount: number;
  highestElevation: ExpeditionRecapElevationExtremum | null;
  lowestElevation: ExpeditionRecapElevationExtremum | null;
  storyMoments: ExpeditionRecapRouteStoryMoment[];
};

export type ExpeditionRecapRoutePresentationInput = {
  tripId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  routeGeometry?: readonly ExpeditionTripCoordinate[] | null;
  plannedRouteGeometry?: readonly ExpeditionTripCoordinate[] | null;
  recap?: ExpeditionRecap | null;
};

type SelectedRoute = {
  source: Exclude<ExpeditionRecapRouteSource, 'unavailable'>;
  geometry: ExpeditionTripCoordinate[];
};

function isValidCoordinate(
  coordinate: ExpeditionTripCoordinate | null | undefined,
): coordinate is ExpeditionTripCoordinate {
  return !!coordinate &&
    Number.isFinite(coordinate.lat) &&
    Number.isFinite(coordinate.lng) &&
    coordinate.lat >= -90 &&
    coordinate.lat <= 90 &&
    coordinate.lng >= -180 &&
    coordinate.lng <= 180;
}

function validGeometry(
  geometry: readonly ExpeditionTripCoordinate[] | null | undefined,
): ExpeditionTripCoordinate[] {
  return (geometry ?? []).filter(isValidCoordinate);
}

function selectRoute(input: ExpeditionRecapRoutePresentationInput): SelectedRoute | null {
  const recorded = validGeometry(input.routeGeometry);
  if (recorded.length >= 2) {
    return { source: 'recorded', geometry: recorded };
  }

  const planned = validGeometry(input.plannedRouteGeometry);
  if (planned.length >= 2) {
    return { source: 'planned', geometry: planned };
  }

  return null;
}

function computeBounds(geometry: ExpeditionTripCoordinate[]): ExpeditionTripBounds | null {
  if (geometry.length < 2) return null;
  return geometry.reduce<ExpeditionTripBounds>(
    (bounds, coordinate) => ({
      north: Math.max(bounds.north, coordinate.lat),
      south: Math.min(bounds.south, coordinate.lat),
      east: Math.max(bounds.east, coordinate.lng),
      west: Math.min(bounds.west, coordinate.lng),
    }),
    {
      north: geometry[0].lat,
      south: geometry[0].lat,
      east: geometry[0].lng,
      west: geometry[0].lng,
    },
  );
}

function elapsedSeconds(startedAt: string | null | undefined, timestamp: string | null): number | null {
  const startedMs = timestampMs(startedAt);
  const momentMs = timestampMs(timestamp);
  if (startedMs == null || momentMs == null || momentMs < startedMs) return null;
  return Math.round((momentMs - startedMs) / 1000);
}

function exactRoutePointIndex(
  geometry: ExpeditionTripCoordinate[],
  coordinate: ExpeditionTripCoordinate | null,
): number | null {
  if (!isValidCoordinate(coordinate)) return null;
  const index = geometry.findIndex(
    (point) => point.lat === coordinate.lat && point.lng === coordinate.lng,
  );
  return index >= 0 ? index : null;
}

function coordinatesEqual(
  left: ExpeditionTripCoordinate | null | undefined,
  right: ExpeditionTripCoordinate | null | undefined,
): boolean {
  return isValidCoordinate(left) &&
    isValidCoordinate(right) &&
    left.lat === right.lat &&
    left.lng === right.lng;
}

function elevationExtrema(geometry: ExpeditionTripCoordinate[]): {
  sampleCount: number;
  highest: ExpeditionRecapElevationExtremum | null;
  lowest: ExpeditionRecapElevationExtremum | null;
} {
  const samples = geometry
    .map((coordinate, routePointIndex) => ({
      coordinate,
      routePointIndex,
      elevationFt: coordinate.elevationFt,
    }))
    .filter((sample): sample is ExpeditionRecapElevationExtremum =>
      typeof sample.elevationFt === 'number' && Number.isFinite(sample.elevationFt));

  if (samples.length === 0) {
    return { sampleCount: 0, highest: null, lowest: null };
  }

  let highest = samples[0];
  let lowest = samples[0];
  for (const sample of samples.slice(1)) {
    if (sample.elevationFt > highest.elevationFt) highest = sample;
    if (sample.elevationFt < lowest.elevationFt) lowest = sample;
  }

  return { sampleCount: samples.length, highest, lowest };
}

function routeMoment(
  params: {
    id: string;
    tripId: string;
    type: string;
    title: string;
    description: string;
    timestamp: string | null;
    coordinate: ExpeditionTripCoordinate;
    category: NormalizedNotableMoment['category'];
    routePointIndex: number;
    routeSource: Exclude<ExpeditionRecapRouteSource, 'unavailable'>;
  },
  startedAt: string | null | undefined,
): ExpeditionRecapRouteStoryMoment {
  return {
    id: params.id,
    tripId: params.tripId,
    type: params.type,
    title: params.title,
    description: params.description,
    timestamp: params.timestamp,
    elapsedSeconds: elapsedSeconds(startedAt, params.timestamp),
    coordinate: params.coordinate,
    severity: 'info',
    source: 'expedition_recap',
    createdAt: params.timestamp,
    category: params.category,
    routePointIndex: params.routePointIndex,
    routeSource: params.routeSource,
  };
}

function buildStoryMoments(
  input: ExpeditionRecapRoutePresentationInput,
  selected: SelectedRoute,
  extrema: ReturnType<typeof elevationExtrema>,
): ExpeditionRecapRouteStoryMoment[] {
  const tripId = input.recap?.tripId || input.tripId || 'unknown-trip';
  const geometry = selected.geometry;
  const startCoordinate = geometry[0];
  const endCoordinate = geometry[geometry.length - 1];
  const routeSource = selected.source;
  const recorded = routeSource === 'recorded';
  const recapMoments = normalizeExpeditionNotableMoments(input.recap ?? null, input.startedAt ?? '')
    .filter((moment) => moment.type !== 'highest_elevation' && moment.type !== 'guidance_completed')
    .map<ExpeditionRecapRouteStoryMoment>((moment) => ({
      ...moment,
      routePointIndex: exactRoutePointIndex(geometry, moment.coordinate),
      routeSource,
    }));
  const recapHighMoment = recorded && extrema.highest
    ? input.recap?.expeditionEvents.notableMoments.find(
        (moment) => moment.type === 'highest_elevation' &&
          coordinatesEqual(moment.coordinate, extrema.highest?.coordinate),
      )
    : undefined;
  const recapFinishMoment = recorded
    ? input.recap?.expeditionEvents.notableMoments.find(
        (moment) => moment.type === 'guidance_completed' &&
          coordinatesEqual(moment.coordinate, endCoordinate),
      )
    : undefined;

  const startTimestamp = recorded
    ? startCoordinate.recordedAt ?? input.startedAt ?? null
    : null;
  const finishTimestamp = recorded
    ? endCoordinate.recordedAt ?? input.completedAt ?? null
    : null;
  const start = routeMoment({
    id: `recap-route-start:${tripId}`,
    tripId,
    type: 'route_start',
    title: recorded ? 'Recorded journey start' : 'Planned route start',
    description: recorded
      ? 'The saved GPS track begins at this recorded point.'
      : 'The saved planned route begins here; a drawable GPS track was not recorded.',
    timestamp: startTimestamp,
    coordinate: startCoordinate,
    category: 'milestone',
    routePointIndex: 0,
    routeSource,
  }, input.startedAt);
  const finish = routeMoment({
    id: recapFinishMoment?.id || `recap-route-finish:${tripId}`,
    tripId,
    type: 'route_finish',
    title: recorded ? 'Recorded journey finish' : 'Planned route finish',
    description: recorded
      ? 'The saved GPS track ends at this recorded point.'
      : 'This is the end of the saved planned route, not a confirmed recorded finish.',
    timestamp: finishTimestamp,
    coordinate: endCoordinate,
    category: 'milestone',
    routePointIndex: geometry.length - 1,
    routeSource,
  }, input.startedAt);

  const elevationMoments: ExpeditionRecapRouteStoryMoment[] = [];
  if (extrema.highest) {
    const highTimestamp = recorded ? extrema.highest.coordinate.recordedAt ?? null : null;
    const singleSample = extrema.sampleCount === 1;
    const flatProfile = !singleSample &&
      extrema.lowest != null &&
      extrema.lowest.elevationFt === extrema.highest.elevationFt;
    const type = singleSample
      ? 'elevation_sample'
      : flatProfile
        ? 'flat_elevation_profile'
        : 'highest_elevation';
    const title = singleSample
      ? recorded ? 'Only recorded elevation sample' : 'Only planned-route elevation sample'
      : flatProfile
        ? recorded ? 'Flat recorded elevation profile' : 'Flat planned-route elevation profile'
        : recorded ? 'Recorded high point' : 'Planned-route high point';
    const description = singleSample
      ? recorded
        ? `Only one saved GPS-track elevation sample is available: ${Math.round(extrema.highest.elevationFt).toLocaleString()} ft.`
        : `Only one saved planned-route elevation sample is available: ${Math.round(extrema.highest.elevationFt).toLocaleString()} ft. This does not confirm the point was traveled.`
      : flatProfile
        ? recorded
          ? `All saved GPS-track elevation samples are ${Math.round(extrema.highest.elevationFt).toLocaleString()} ft.`
          : `All saved planned-route elevation samples are ${Math.round(extrema.highest.elevationFt).toLocaleString()} ft. This does not confirm the route was traveled.`
        : recorded
          ? `Highest saved GPS-track elevation sample: ${Math.round(extrema.highest.elevationFt).toLocaleString()} ft.`
          : `Highest saved planned-route elevation sample: ${Math.round(extrema.highest.elevationFt).toLocaleString()} ft. This does not confirm the point was traveled.`;
    elevationMoments.push(routeMoment({
      id: type === 'highest_elevation' && recapHighMoment?.id
        ? recapHighMoment.id
        : `recap-route-${singleSample ? 'elevation-sample' : flatProfile ? 'flat-elevation' : 'high'}:${tripId}`,
      tripId,
      type,
      title,
      description,
      timestamp: highTimestamp,
      coordinate: extrema.highest.coordinate,
      category: 'elevation',
      routePointIndex: extrema.highest.routePointIndex,
      routeSource,
    }, input.startedAt));
  }
  if (
    extrema.lowest &&
    (!extrema.highest || extrema.lowest.elevationFt !== extrema.highest.elevationFt)
  ) {
    const lowTimestamp = recorded ? extrema.lowest.coordinate.recordedAt ?? null : null;
    elevationMoments.push(routeMoment({
      id: `recap-route-low:${tripId}`,
      tripId,
      type: 'lowest_elevation',
      title: recorded ? 'Recorded low point' : 'Planned-route low point',
      description: recorded
        ? `Lowest saved GPS-track elevation sample: ${Math.round(extrema.lowest.elevationFt).toLocaleString()} ft.`
        : `Lowest saved planned-route elevation sample: ${Math.round(extrema.lowest.elevationFt).toLocaleString()} ft. This does not confirm the point was traveled.`,
      timestamp: lowTimestamp,
      coordinate: extrema.lowest.coordinate,
      category: 'elevation',
      routePointIndex: extrema.lowest.routePointIndex,
      routeSource,
    }, input.startedAt));
  }

  const middle = [...recapMoments, ...elevationMoments].sort((left, right) => {
    const leftMs = timestampMs(left.timestamp);
    const rightMs = timestampMs(right.timestamp);
    if (leftMs != null && rightMs != null && leftMs !== rightMs) return leftMs - rightMs;
    if (leftMs != null && rightMs == null) return -1;
    if (leftMs == null && rightMs != null) return 1;
    if (left.routePointIndex != null && right.routePointIndex != null && left.routePointIndex !== right.routePointIndex) {
      return left.routePointIndex - right.routePointIndex;
    }
    if (left.routePointIndex != null && right.routePointIndex == null) return -1;
    if (left.routePointIndex == null && right.routePointIndex != null) return 1;
    return left.id.localeCompare(right.id);
  });

  return [start, ...middle, finish];
}

export function buildExpeditionRecapRoutePresentation(
  input: ExpeditionRecapRoutePresentationInput,
): ExpeditionRecapRoutePresentation {
  const selected = selectRoute(input);
  if (!selected) {
    return {
      status: 'unavailable',
      source: 'unavailable',
      sourceLabel: 'Route unavailable',
      sourceDetail: 'This expedition has neither a drawable recorded GPS track nor saved planned-route geometry.',
      geometry: [],
      bounds: null,
      startCoordinate: null,
      endCoordinate: null,
      elevationSampleCount: 0,
      highestElevation: null,
      lowestElevation: null,
      storyMoments: [],
    };
  }

  const extrema = elevationExtrema(selected.geometry);
  const recorded = selected.source === 'recorded';
  return {
    status: 'ready',
    source: selected.source,
    sourceLabel: recorded ? 'Recorded GPS track' : 'Planned route fallback',
    sourceDetail: recorded
      ? 'Showing the saved GPS track captured during this expedition.'
      : 'No drawable GPS track was saved. Showing the canonical planned route; it does not represent confirmed travel.',
    geometry: selected.geometry,
    bounds: computeBounds(selected.geometry),
    startCoordinate: selected.geometry[0],
    endCoordinate: selected.geometry[selected.geometry.length - 1],
    elevationSampleCount: extrema.sampleCount,
    highestElevation: extrema.highest,
    lowestElevation: extrema.lowest,
    storyMoments: buildStoryMoments(input, selected, extrema),
  };
}

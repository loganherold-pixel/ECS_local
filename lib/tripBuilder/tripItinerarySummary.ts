import type {
  ItineraryPhase,
  ItineraryPreTrailStopBucket,
  ItineraryPreTrailStopBucketStatus,
  TripItinerary,
} from './tripBuilderTypes';
import { resupplyPlaceIdentityFromMetadata } from './resupplyPlaceIdentity';

export const TRIP_ITINERARY_SUMMARY_MESSAGES = {
  full_itinerary_available:
    'ECS will guide you from your current location to the trailhead, identify nearby fuel or supply options before entering the trail, then guide the trail route with suggested camp, scenic, bailout, and end-of-trail points.',
  trail_geometry_missing:
    'Trail route geometry is not available yet. ECS can still prepare approach guidance and pre-trail planning, but trail waypoints require a mapped trail route.',
  pre_trail_poi_missing:
    'Pre-trail fuel and supply search is not available yet. ECS has prepared the itinerary structure and will add nearby options when provider data is available.',
  gps_missing:
    'Current location is unavailable. ECS can prepare the trailhead and trail itinerary, but approach routing requires GPS.',
  itinerary_pending:
    'Select or generate a route itinerary to see how ECS will stage approach, resupply, trailhead, trail navigation, and trail exit phases.',
  itinerary_structure_ready:
    'ECS has staged the itinerary phases from start to trailhead, trail route, waypoints, and trail end. Verified waypoint intelligence will appear only when mapped source data is available.',
} as const;

export type TripItinerarySummaryState = keyof typeof TRIP_ITINERARY_SUMMARY_MESSAGES;

export type TripItinerarySummaryPhaseKey =
  | 'start'
  | 'fuel_supplies'
  | 'trailhead'
  | 'trail_route'
  | 'waypoints'
  | 'trail_end';

export type TripItinerarySummaryPhaseStatus =
  | 'available'
  | 'missing'
  | 'pending'
  | 'optional'
  | 'unavailable';

export type TripItinerarySummaryPhase = {
  key: TripItinerarySummaryPhaseKey;
  phase: ItineraryPhase;
  label: string;
  status: TripItinerarySummaryPhaseStatus;
  detail: string;
  count?: number;
};

export type TripItinerarySummaryViewModel = {
  state: TripItinerarySummaryState;
  title: string;
  message: string;
  phases: TripItinerarySummaryPhase[];
  dataNotes: string[];
  metadata: {
    hasUserStart: boolean;
    hasApproachRoute: boolean;
    hasPreTrailStops: boolean;
    hasTrailheadStart: boolean;
    hasTrailRoute: boolean;
    hasTrailWaypoints: boolean;
    hasTrailEnd: boolean;
    hasPreTrailPoiUnavailable: boolean;
    routeGeometryStatus: TripItinerary['routeGeometryStatus'] | null;
    preTrailPoiState: TripItinerarySummaryPreTrailState;
  };
};

const PRE_TRAIL_BUCKETS: ItineraryPreTrailStopBucket[] = ['fuel', 'grocery', 'water', 'generalSupply'];

export type TripItinerarySummaryPreTrailState =
  | 'available'
  | 'not_requested'
  | 'provider_unavailable'
  | 'pending'
  | 'no_results'
  | 'optional';

const POI_UNAVAILABLE_STATUSES: ItineraryPreTrailStopBucketStatus[] = [
  'provider_unavailable',
  'missing_anchor',
];

function routeHasGeometry(route: TripItinerary['approachRoute']): boolean {
  if (!route) return false;
  if (Array.isArray(route.geometry) && route.geometry.length >= 2) return true;
  return route.segments.some((segment) => Array.isArray(segment.geometry) && segment.geometry.length >= 2);
}

function preTrailStopCount(itinerary: TripItinerary): number {
  const stops = itinerary.preTrailStops;
  if (!stops) return 0;
  const identities = new Set<string>();
  PRE_TRAIL_BUCKETS.flatMap((bucket) => stops[bucket] ?? []).forEach((stop) => {
    const placeIdentity = resupplyPlaceIdentityFromMetadata(stop.metadata);
    const coordinateIdentity = stop.coordinate
      ? `${stop.coordinate.latitude.toFixed(5)},${stop.coordinate.longitude.toFixed(5)}`
      : 'no-coordinate';
    identities.add(placeIdentity ?? `${stop.title.trim().toLowerCase()}:${coordinateIdentity}`);
  });
  return identities.size;
}

function hasPreTrailPoiUnavailable(itinerary: TripItinerary, stopCount: number): boolean {
  const summaries = itinerary.preTrailStopStatus ?? [];
  if (stopCount > 0) return false;
  return summaries.some((summary) => POI_UNAVAILABLE_STATUSES.includes(summary.status));
}

function preTrailPoiState(itinerary: TripItinerary | null | undefined, stopCount: number): TripItinerarySummaryPreTrailState {
  if (stopCount > 0) return 'available';
  const summaries = itinerary?.preTrailStopStatus ?? [];
  if (summaries.length === 0) return 'optional';
  if (summaries.every((summary) => summary.status === 'not_requested')) return 'not_requested';
  if (summaries.some((summary) => summary.status === 'provider_pending')) return 'pending';
  if (summaries.some((summary) => POI_UNAVAILABLE_STATUSES.includes(summary.status))) return 'provider_unavailable';
  if (summaries.some((summary) => summary.status === 'no_results')) return 'no_results';
  return 'optional';
}

function hasTrueTrailRoute(itinerary: TripItinerary): boolean {
  return routeHasGeometry(itinerary.trailRoute);
}

function dataNotes(args: {
  itinerary: TripItinerary | null | undefined;
  hasUserStart: boolean;
  hasApproachRoute: boolean;
  hasPreTrailPoiUnavailable: boolean;
  preTrailState: TripItinerarySummaryPreTrailState;
  hasTrailRoute: boolean;
  hasTrailWaypoints: boolean;
  hasTrailEnd: boolean;
}): string[] {
  if (!args.itinerary) return [];
  const notes: string[] = [];
  const providerRefreshUnavailable = (args.itinerary.preTrailStopStatus ?? []).some((summary) => (
    summary.status !== 'not_requested' && (
      summary.providerState === 'error' || summary.providerState === 'unavailable'
    )
  ));
  const providerRefreshPending = (args.itinerary.preTrailStopStatus ?? []).some((summary) => (
    summary.status !== 'not_requested' && summary.providerState === 'pending'
  ));

  if (!args.hasUserStart) notes.push('GPS start is pending; approach routing remains incomplete.');
  if (!args.hasApproachRoute) notes.push('Approach geometry is unavailable or has not been resolved yet.');
  if (args.preTrailState === 'not_requested') notes.push('Pre-trail POI planning not requested.');
  if (args.preTrailState === 'provider_unavailable') notes.push('POI provider unavailable for pre-trail fuel and supply planning.');
  if (args.preTrailState === 'pending') notes.push('Pre-trail POI planning is still updating.');
  if (args.preTrailState === 'no_results') notes.push('No nearby refuel or resupply candidates were found.');
  if (args.preTrailState === 'available' && providerRefreshUnavailable) {
    notes.push('Retained pre-trail stops are shown, but live provider refresh is unavailable; verify them manually.');
  } else if (args.preTrailState === 'available' && providerRefreshPending) {
    notes.push('Retained pre-trail stops are shown while live provider refresh is pending.');
  }
  if (!args.hasTrailRoute) notes.push('True trail geometry is unavailable; approach guidance was not promoted to trail navigation.');
  if (!args.hasTrailWaypoints) notes.push('No verified camp, scenic, bailout, hazard, or user waypoint data has been added yet.');
  if (!args.hasTrailEnd) notes.push('Trail end is unavailable and was not inferred from the approach route.');

  return notes;
}

function phaseStatusDetail(status: TripItinerarySummaryPhaseStatus): string {
  switch (status) {
    case 'available':
      return 'Ready';
    case 'missing':
      return 'Missing';
    case 'pending':
      return 'Pending';
    case 'optional':
      return 'Optional';
    case 'unavailable':
    default:
      return 'Unavailable';
  }
}

function buildPhases(args: {
  itinerary: TripItinerary | null | undefined;
  preTrailCount: number;
  hasUserStart: boolean;
  hasPreTrailPoiUnavailable: boolean;
  preTrailState: TripItinerarySummaryPreTrailState;
  hasTrailRoute: boolean;
  hasTrailWaypoints: boolean;
  hasTrailEnd: boolean;
}): TripItinerarySummaryPhase[] {
  const trailheadAvailable = !!args.itinerary?.trailheadStart?.coordinate;
  const trailWaypointCount = args.itinerary?.trailWaypoints?.length ?? 0;
  const providerUnavailableIsBlocking =
    args.preTrailState === 'provider_unavailable' &&
    (!args.hasUserStart || !args.hasTrailRoute);
  const phaseRows: TripItinerarySummaryPhase[] = [
    {
      key: 'start',
      phase: 'approach',
      label: 'Start',
      status: args.hasUserStart ? 'available' : 'missing',
      detail: args.hasUserStart ? 'Current GPS' : 'GPS needed',
    },
    {
      key: 'fuel_supplies',
      phase: 'pre_trail_resupply',
      label: 'Fuel/Supplies',
      status: args.preTrailCount > 0
        ? 'available'
        : args.preTrailState === 'pending'
          ? 'pending'
          : args.preTrailState === 'provider_unavailable'
            ? providerUnavailableIsBlocking ? 'unavailable' : 'pending'
            : 'optional',
      detail: args.preTrailCount > 0
        ? `${args.preTrailCount} stop${args.preTrailCount === 1 ? '' : 's'}`
        : args.preTrailState === 'not_requested'
          ? 'Not requested'
          : args.preTrailState === 'pending'
            ? 'Updating'
            : args.preTrailState === 'provider_unavailable'
              ? providerUnavailableIsBlocking ? 'Provider unavailable' : 'Provider pending'
              : args.preTrailState === 'no_results'
                ? 'No candidates found'
                : 'No stops selected',
      count: args.preTrailCount,
    },
    {
      key: 'trailhead',
      phase: 'trailhead',
      label: 'Trailhead',
      status: trailheadAvailable ? 'available' : 'missing',
      detail: trailheadAvailable ? 'Transition point' : 'Needs coordinate',
    },
    {
      key: 'trail_route',
      phase: 'trail_navigation',
      label: 'Trail Route',
      status: args.hasTrailRoute ? 'available' : 'missing',
      detail: args.hasTrailRoute ? 'Mapped trail' : 'Geometry needed',
    },
    {
      key: 'waypoints',
      phase: 'trail_navigation',
      label: 'Waypoints',
      status: args.hasTrailWaypoints ? 'available' : args.hasTrailRoute ? 'pending' : 'unavailable',
      detail: args.hasTrailWaypoints
        ? `${trailWaypointCount} verified`
        : args.hasTrailRoute
          ? 'Awaiting data'
          : 'Needs trail route',
      count: trailWaypointCount,
    },
    {
      key: 'trail_end',
      phase: 'trail_navigation',
      label: 'Trail End',
      status: args.hasTrailEnd ? 'available' : 'missing',
      detail: args.hasTrailEnd ? 'Known endpoint' : 'Needs endpoint',
    },
  ];

  return phaseRows.map((row) => ({
    ...row,
    detail: row.detail || phaseStatusDetail(row.status),
  }));
}

export function getTripItinerarySummary(
  itinerary: TripItinerary | null | undefined,
): TripItinerarySummaryViewModel {
  if (!itinerary) {
    return {
      state: 'itinerary_pending',
      title: 'Itinerary Summary',
      message: TRIP_ITINERARY_SUMMARY_MESSAGES.itinerary_pending,
      phases: buildPhases({
        itinerary: null,
        preTrailCount: 0,
        hasUserStart: false,
        hasPreTrailPoiUnavailable: false,
        preTrailState: 'optional',
        hasTrailRoute: false,
        hasTrailWaypoints: false,
        hasTrailEnd: false,
      }),
      dataNotes: [],
      metadata: {
        hasUserStart: false,
        hasApproachRoute: false,
        hasPreTrailStops: false,
        hasTrailheadStart: false,
        hasTrailRoute: false,
        hasTrailWaypoints: false,
        hasTrailEnd: false,
        hasPreTrailPoiUnavailable: false,
        preTrailPoiState: 'optional',
        routeGeometryStatus: null,
      },
    };
  }

  const hasUserStart = !!itinerary.userStart;
  const hasApproachRoute = routeHasGeometry(itinerary.approachRoute);
  const preTrailCount = preTrailStopCount(itinerary);
  const hasPreTrailStops = preTrailCount > 0;
  const preTrailState = preTrailPoiState(itinerary, preTrailCount);
  const hasPreTrailPoiMissing = hasPreTrailPoiUnavailable(itinerary, preTrailCount);
  const hasTrailheadStart = !!itinerary.trailheadStart?.coordinate;
  const hasTrailRoute = hasTrueTrailRoute(itinerary);
  const hasTrailWaypoints = (itinerary.trailWaypoints ?? []).length > 0;
  const hasTrailEnd = !!itinerary.trailEnd?.coordinate;

  let state: TripItinerarySummaryState;
  if (!hasUserStart) {
    state = 'gps_missing';
  } else if (!hasTrailRoute) {
    state = 'trail_geometry_missing';
  } else if (hasPreTrailPoiMissing) {
    state = 'pre_trail_poi_missing';
  } else if (hasTrailWaypoints && hasTrailEnd) {
    state = 'full_itinerary_available';
  } else {
    state = 'itinerary_structure_ready';
  }

  return {
    state,
    title: 'Itinerary Summary',
    message: TRIP_ITINERARY_SUMMARY_MESSAGES[state],
    phases: buildPhases({
      itinerary,
      preTrailCount,
      hasUserStart,
      hasPreTrailPoiUnavailable: hasPreTrailPoiMissing,
      preTrailState,
      hasTrailRoute,
      hasTrailWaypoints,
      hasTrailEnd,
    }),
    dataNotes: dataNotes({
      itinerary,
      hasUserStart,
      hasApproachRoute,
      hasPreTrailPoiUnavailable: hasPreTrailPoiMissing,
      preTrailState,
      hasTrailRoute,
      hasTrailWaypoints,
      hasTrailEnd,
    }),
    metadata: {
      hasUserStart,
      hasApproachRoute,
      hasPreTrailStops,
      hasTrailheadStart,
      hasTrailRoute,
      hasTrailWaypoints,
      hasTrailEnd,
      hasPreTrailPoiUnavailable: hasPreTrailPoiMissing,
      preTrailPoiState: preTrailState,
      routeGeometryStatus: itinerary.routeGeometryStatus,
    },
  };
}

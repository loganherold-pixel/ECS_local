import type {
  ItineraryConfidenceSummary,
  ItineraryPreTrailStopBucket,
  ItineraryRoute,
  ItineraryStop,
  ItineraryWaypoint,
  TripBuilderConfidence,
  TripBuilderWarning,
  TripItinerary,
} from './tripBuilderTypes';

export type TripItineraryReviewPhaseKey =
  | 'approach'
  | 'pre_trail_resupply'
  | 'trailhead_start'
  | 'trail_navigation'
  | 'trail_waypoints'
  | 'trail_end'
  | 'trail_exit';

export type TripItineraryReviewAvailability =
  | 'available'
  | 'partial'
  | 'pending'
  | 'missing'
  | 'optional'
  | 'unavailable';

export type TripItineraryReviewItem = {
  id: string;
  title: string;
  kind: string;
  confidence: TripBuilderConfidence | null;
  sourceLabel: string | null;
  isUserAdded: boolean;
  isEcsSuggested: boolean;
  detail?: string | null;
};

export type TripItineraryReviewPhase = {
  key: TripItineraryReviewPhaseKey;
  title: string;
  description: string;
  availability: TripItineraryReviewAvailability;
  confidence: TripBuilderConfidence | null;
  editable: boolean;
  recommendation: string | null;
  items: TripItineraryReviewItem[];
  warnings: string[];
  missingData: string[];
  metadata?: Record<string, unknown> | null;
};

export type TripItineraryReviewModel = {
  title: string;
  subtitle: string;
  phases: TripItineraryReviewPhase[];
  confidenceSummary: {
    overall: TripBuilderConfidence;
    score: number | null;
    routeGeometry: TripBuilderConfidence | null;
    routeGeometryStatus: TripItinerary['routeGeometryStatus'] | null;
    trailhead: TripBuilderConfidence | null;
    resupply: TripBuilderConfidence | null;
    trailWaypoints: TripBuilderConfidence | null;
    exitRoute: TripBuilderConfidence | null;
    reasons: string[];
    missingData: string[];
  };
  missingDataWarnings: string[];
  metadata: {
    hasItinerary: boolean;
    phaseCount: number;
    realWaypointCount: number;
    userAddedWaypointCount: number;
    warningCount: number;
  };
};

const PRE_TRAIL_BUCKETS: ItineraryPreTrailStopBucket[] = ['fuel', 'grocery', 'water', 'generalSupply'];

function routeHasGeometry(route: ItineraryRoute | null | undefined): boolean {
  if (!route) return false;
  if ((route.geometry?.length ?? 0) >= 2) return true;
  return (route.segments ?? []).some((segment) => (segment.geometry?.length ?? 0) >= 2);
}

function routeDistanceLabel(route: ItineraryRoute | null | undefined): string | null {
  const distance = route?.distanceMiles;
  return typeof distance === 'number' && Number.isFinite(distance)
    ? `${distance.toFixed(distance >= 10 ? 0 : 1)} mi`
    : null;
}

function sourceLabel(item: ItineraryStop | ItineraryWaypoint): string | null {
  const label = item.source?.label ?? item.source?.source ?? item.source?.provider ?? null;
  const text = String(label ?? '').trim();
  return text || null;
}

function waypointKindLabel(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function reviewItemFromWaypoint(item: ItineraryStop | ItineraryWaypoint): TripItineraryReviewItem {
  return {
    id: item.id,
    title: item.title,
    kind: waypointKindLabel(item.type),
    confidence: item.confidence ?? null,
    sourceLabel: sourceLabel(item),
    isUserAdded: item.isUserAdded === true,
    isEcsSuggested: item.isEcsSuggested === true,
    detail: item.description ?? item.notes?.[0] ?? null,
  };
}

function preTrailStops(itinerary: TripItinerary): ItineraryStop[] {
  const stops = itinerary.preTrailStops;
  if (!stops) return [];
  return PRE_TRAIL_BUCKETS.flatMap((bucket) => stops[bucket] ?? []);
}

function warningMessages(warnings: TripBuilderWarning[] | undefined, predicate: (warning: TripBuilderWarning) => boolean): string[] {
  return (warnings ?? [])
    .filter(predicate)
    .map((warning) => warning.message)
    .filter(Boolean);
}

function unique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const text = String(value ?? '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    result.push(text);
  });
  return result;
}

function missingDataContains(confidence: ItineraryConfidenceSummary | undefined, pattern: RegExp): boolean {
  return (confidence?.missingData ?? []).some((item) => pattern.test(item));
}

function preTrailProviderWarnings(itinerary: TripItinerary): string[] {
  const statusWarnings = (itinerary.preTrailStopStatus ?? [])
    .filter((summary) => (
      summary.status !== 'not_requested' && (
        summary.status === 'provider_unavailable' ||
        summary.status === 'provider_pending' ||
        summary.status === 'missing_anchor' ||
        summary.providerState === 'error' ||
        summary.providerState === 'unavailable' ||
        summary.providerState === 'pending'
      )
    ))
    .flatMap((summary) => summary.warnings ?? []);
  const planningWarnings = warningMessages(
    itinerary.warnings,
    (warning) => warning.id.includes('pre_trail') || warning.source === 'planning',
  );
  return unique([...statusWarnings, ...planningWarnings]);
}

function routeDescription(route: ItineraryRoute | null | undefined, fallback: string): string {
  const distance = routeDistanceLabel(route);
  if (routeHasGeometry(route)) {
    return distance
      ? `${fallback} Geometry is available for ${distance}.`
      : `${fallback} Geometry is available.`;
  }
  return fallback;
}

function confidenceSummary(itinerary: TripItinerary | null | undefined): TripItineraryReviewModel['confidenceSummary'] {
  const confidence = itinerary?.confidence;
  return {
    overall: confidence?.overall ?? 'unknown',
    score: typeof confidence?.score === 'number' && Number.isFinite(confidence.score) ? confidence.score : null,
    routeGeometry: confidence?.routeGeometry ?? null,
    routeGeometryStatus: confidence?.routeGeometryStatus ?? itinerary?.routeGeometryStatus ?? null,
    trailhead: confidence?.trailhead ?? null,
    resupply: confidence?.resupply ?? null,
    trailWaypoints: confidence?.trailWaypoints ?? null,
    exitRoute: confidence?.exitRoute ?? null,
    reasons: confidence?.reasons ?? [],
    missingData: confidence?.missingData ?? [],
  };
}

function pendingItineraryReview(): TripItineraryReviewModel {
  return {
    title: 'Confidence-Built Itinerary Review',
    subtitle: 'ECS will show the phased expedition plan after a route itinerary is available.',
    phases: [],
    confidenceSummary: confidenceSummary(null),
    missingDataWarnings: ['No TripItinerary draft is available yet.'],
    metadata: {
      hasItinerary: false,
      phaseCount: 0,
      realWaypointCount: 0,
      userAddedWaypointCount: 0,
      warningCount: 1,
    },
  };
}

export function getTripItineraryReview(
  itinerary: TripItinerary | null | undefined,
): TripItineraryReviewModel {
  if (!itinerary) return pendingItineraryReview();

  const preTrail = preTrailStops(itinerary);
  const hasPreTrailProviderWarning = preTrail.length === 0 && preTrailProviderWarnings(itinerary).length > 0;
  const trailWaypoints = itinerary.trailWaypoints ?? [];
  const realWaypointItems = trailWaypoints.map(reviewItemFromWaypoint);
  const hasTrailRoute = routeHasGeometry(itinerary.trailRoute);
  const hasApproachRoute = routeHasGeometry(itinerary.approachRoute);
  const hasTrailEnd = !!itinerary.trailEnd?.coordinate;
  const hasExitRoute = routeHasGeometry(itinerary.exitRoute);
  const hasTrailhead = !!itinerary.trailheadStart?.coordinate;
  const trailGeometryWarnings = warningMessages(
    itinerary.warnings,
    (warning) => warning.id.includes('trail_geometry') || warning.id.includes('trail_end'),
  );
  const trailheadWarnings = warningMessages(
    itinerary.warnings,
    (warning) => warning.id.includes('trailhead'),
  );
  const missingTrailGeometry = !hasTrailRoute || missingDataContains(itinerary.confidence, /trail route geometry/i);
  const preTrailWarnings = preTrailProviderWarnings(itinerary);

  const phases: TripItineraryReviewPhase[] = [
    {
      key: 'approach',
      title: 'Approach',
      description: hasApproachRoute
        ? routeDescription(itinerary.approachRoute, 'Road/access guidance is staged to the trailhead area.')
        : 'Approach guidance is not available yet.',
      availability: hasApproachRoute ? 'available' : itinerary.userStart ? 'missing' : 'pending',
      confidence: itinerary.approachRoute?.confidence ?? (hasApproachRoute ? 'medium' : 'unknown'),
      editable: false,
      recommendation: itinerary.userStart
        ? 'Use this phase only as trailhead approach guidance.'
        : 'GPS is needed before ECS can start approach routing.',
      items: [],
      warnings: unique([
        !itinerary.userStart ? 'Current location is unavailable; approach routing requires GPS.' : null,
        ...warningMessages(itinerary.warnings, (warning) => warning.id.includes('approach') || warning.message.includes('Approach')),
      ]),
      missingData: itinerary.userStart ? [] : ['user GPS location'],
    },
    {
      key: 'pre_trail_resupply',
      title: 'Pre-Trail Fuel/Supplies',
      description: preTrail.length > 0
        ? `${preTrail.length} operator or provider-backed pre-trail stop${preTrail.length === 1 ? '' : 's'} staged near the trailhead.`
        : hasPreTrailProviderWarning
          ? 'Fuel and supply buckets are ready, but live pre-trail POI data is not available yet.'
          : 'No pre-trail fuel or supply stops are selected yet.',
      availability: preTrail.length > 0 ? 'available' : hasPreTrailProviderWarning ? 'pending' : 'optional',
      confidence: itinerary.confidence.resupply ?? null,
      editable: true,
      recommendation: preTrail.length > 0
        ? 'Verify hours, fuel type, and supplies before entering the trail.'
        : 'Add known stops manually until provider data is available.',
      items: preTrail.map(reviewItemFromWaypoint),
      warnings: preTrailWarnings,
      missingData: hasPreTrailProviderWarning ? ['pre-trail POI provider data'] : [],
    },
    {
      key: 'trailhead_start',
      title: 'Trailhead Start',
      description: hasTrailhead
        ? `${itinerary.trailheadStart?.title ?? 'Trailhead start'} marks the transition from approach to trail navigation.`
        : 'Trailhead start is unavailable from the selected route data.',
      availability: hasTrailhead ? 'available' : 'missing',
      confidence: itinerary.trailheadStart?.confidence ?? itinerary.confidence.trailhead ?? null,
      editable: false,
      recommendation: hasTrailhead
        ? 'Confirm the trailhead on arrival before switching to trail navigation.'
        : 'Confirm or add a trailhead coordinate before relying on trail phases.',
      items: itinerary.trailheadStart ? [reviewItemFromWaypoint(itinerary.trailheadStart)] : [],
      warnings: trailheadWarnings,
      missingData: hasTrailhead ? [] : ['trailhead start'],
    },
    {
      key: 'trail_navigation',
      title: 'Trail Route',
      description: hasTrailRoute
        ? routeDescription(itinerary.trailRoute, 'True trail navigation geometry is available.')
        : 'Trail route geometry is missing; ECS is not treating approach guidance as the expedition trail.',
      availability: hasTrailRoute ? 'available' : 'missing',
      confidence: itinerary.trailRoute?.confidence ?? itinerary.confidence.routeGeometry ?? null,
      editable: false,
      recommendation: hasTrailRoute
        ? 'Use mapped trail geometry for trail navigation and waypoint review.'
        : 'Import or select a mapped trail route before expecting trail waypoint intelligence.',
      items: [],
      warnings: missingTrailGeometry ? trailGeometryWarnings : [],
      missingData: missingTrailGeometry ? ['trail route geometry'] : [],
      metadata: {
        routeGeometryStatus: itinerary.routeGeometryStatus,
      },
    },
    {
      key: 'trail_waypoints',
      title: 'Camp/Scenic/Bailout Points',
      description: realWaypointItems.length > 0
        ? `${realWaypointItems.length} real trail waypoint${realWaypointItems.length === 1 ? '' : 's'} available from route intelligence or user input.`
        : 'No verified camp, scenic, bailout, hazard, turnaround, or user-added trail waypoints are available yet.',
      availability: realWaypointItems.length > 0 ? 'available' : hasTrailRoute ? 'pending' : 'unavailable',
      confidence: itinerary.confidence.trailWaypoints ?? null,
      editable: true,
      recommendation: realWaypointItems.length > 0
        ? 'Review each point before departure; bailout access is only confirmed when source data supports it.'
        : 'ECS will leave this empty until real waypoint data exists.',
      items: realWaypointItems,
      warnings: realWaypointItems.length > 0 ? [] : ['No fake camp, scenic, bailout, or hazard points were generated.'],
      missingData: realWaypointItems.length > 0 ? [] : ['verified trail waypoint records'],
    },
    {
      key: 'trail_end',
      title: 'Trail End',
      description: hasTrailEnd
        ? `${itinerary.trailEnd?.title ?? 'Trail end'} marks the end of trail navigation.`
        : 'Trail end is unavailable and was not inferred from the approach route.',
      availability: hasTrailEnd ? 'available' : 'missing',
      confidence: itinerary.trailEnd?.confidence ?? null,
      editable: false,
      recommendation: hasTrailEnd
        ? 'Confirm the endpoint before planning final exit timing.'
        : 'Verify the route endpoint before relying on exit planning.',
      items: itinerary.trailEnd ? [reviewItemFromWaypoint(itinerary.trailEnd)] : [],
      warnings: hasTrailEnd ? [] : warningMessages(itinerary.warnings, (warning) => warning.id.includes('trail_end')),
      missingData: hasTrailEnd ? [] : ['trail end'],
    },
    {
      key: 'trail_exit',
      title: 'Exit',
      description: hasExitRoute
        ? routeDescription(itinerary.exitRoute, 'Optional exit geometry is available after trail completion.')
        : 'Exit route remains optional and has not been provided.',
      availability: hasExitRoute ? 'available' : 'optional',
      confidence: itinerary.exitRoute?.confidence ?? itinerary.confidence.exitRoute ?? null,
      editable: true,
      recommendation: hasExitRoute
        ? 'Verify exit access and services before departure.'
        : 'Add exit access when confirmed source data is available.',
      items: [],
      warnings: [],
      missingData: [],
    },
  ];

  const missingDataWarnings = unique([
    ...phases.flatMap((phase) => phase.warnings),
    ...(itinerary.confidence.missingData ?? []).map((item) => `Missing ${item}.`),
  ]);
  const userAddedWaypointCount = trailWaypoints.filter((waypoint) => waypoint.isUserAdded).length;

  return {
    title: 'Confidence-Built Itinerary Review',
    subtitle: 'Start, fuel and supplies, trailhead, trail route, real waypoints, trail end, and exit are separated so missing data stays visible.',
    phases,
    confidenceSummary: confidenceSummary(itinerary),
    missingDataWarnings,
    metadata: {
      hasItinerary: true,
      phaseCount: phases.length,
      realWaypointCount: realWaypointItems.length,
      userAddedWaypointCount,
      warningCount: missingDataWarnings.length,
    },
  };
}

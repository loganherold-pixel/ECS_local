import type {
  RouteContext,
  RouteContextCoordinate,
  RouteGeometry,
  SupplyCandidate,
  SupplyMode,
} from '../routeContext';
import type {
  ResupplyPoint,
  TripBuilderConfidence,
  TripBuilderCoordinate,
  TripBuilderRouteContextConfidenceTier,
  TripBuilderRouteContextInput,
  TripBuilderRouteInput,
} from './tripBuilderTypes';
import { providerResupplyPlaceIdentity } from './resupplyPlaceIdentity';

const METERS_PER_MILE = 1609.344;

function isFiniteCoordinate(coordinate?: RouteContextCoordinate | null): coordinate is RouteContextCoordinate {
  return !!coordinate &&
    Number.isFinite(coordinate.lat) &&
    Number.isFinite(coordinate.lng) &&
    Math.abs(coordinate.lat) <= 90 &&
    Math.abs(coordinate.lng) <= 180;
}

function tripCoordinate(coordinate?: RouteContextCoordinate | null): TripBuilderCoordinate | null {
  return isFiniteCoordinate(coordinate)
    ? { latitude: coordinate.lat, longitude: coordinate.lng }
    : null;
}

function confidenceLabel(value: number | null | undefined): TripBuilderConfidence {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value >= 0.78) return 'high';
  if (value >= 0.5) return 'medium';
  if (value > 0) return 'low';
  return 'unknown';
}

function routeContextConfidenceTier(context: RouteContext): TripBuilderRouteContextConfidenceTier {
  const warningCodes = new Set(context.warnings.map((warning) => warning.code));
  const missingSupply = context.selectedSupplyMode &&
    context.selectedSupplyMode !== 'none' &&
    context.supplyCandidates.length === 0;
  if (
    context.status === 'stale' ||
    context.status === 'partial' ||
    warningCodes.has('stale_cached_context') ||
    warningCodes.has('missing_origin') ||
    warningCodes.has('provider_unavailable') ||
    warningCodes.has('no_supply_candidates_found') ||
    missingSupply
  ) {
    return 'partial';
  }
  if (
    context.status === 'ready' &&
    context.confidence.value >= 0.78 &&
    context.trailheadAnchor.source !== 'unknown' &&
    (context.routeGeometry?.coordinates?.length ?? 0) >= 2
  ) {
    return 'high';
  }
  if (context.confidence.value >= 0.5) return 'medium';
  return 'fallback';
}

function routeGeometryLineString(geometry?: RouteGeometry | null): { type: 'LineString'; coordinates: [number, number][] } | null {
  const coordinates = geometry?.coordinates
    ?.filter(isFiniteCoordinate)
    .map((coordinate): [number, number] => [coordinate.lng, coordinate.lat]) ?? [];
  return coordinates.length >= 2 ? { type: 'LineString', coordinates } : null;
}

function distanceMilesFromMeters(value?: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round((value / METERS_PER_MILE) * 10) / 10;
}

function routeContextModeMatches(mode: SupplyMode | null | undefined, candidate: SupplyCandidate): boolean {
  if (!mode || mode === 'none') return true;
  if (mode === 'gas') return candidate.category === 'gas';
  if (mode === 'grocery') return candidate.category === 'grocery';
  return candidate.category === 'gas' || candidate.category === 'grocery';
}

function routeContextSupplyCandidatesForItinerary(
  context: RouteContext,
  mode?: SupplyMode | null,
): NonNullable<TripBuilderRouteContextInput['supplyCandidates']> {
  return orderedSupplyCandidates(context, mode).map((candidate) => ({
    id: candidate.id,
    providerPlaceId: candidate.providerPlaceId ?? null,
    category: candidate.category,
    name: candidate.name,
    lat: candidate.lat,
    lng: candidate.lng,
    address: candidate.address ?? null,
    distanceToTrailheadMeters: candidate.distanceToTrailheadMeters ?? null,
    driveDistanceToTrailheadMeters: candidate.driveDistanceToTrailheadMeters ?? null,
    driveDurationToTrailheadSeconds: candidate.driveDurationToTrailheadSeconds ?? null,
    detourDistanceMeters: candidate.detourDistanceMeters ?? null,
    detourDurationSeconds: candidate.detourDurationSeconds ?? null,
    accessStatus: candidate.accessStatus ?? 'unknown',
    openStatus: candidate.openStatus ?? null,
    rating: candidate.rating ?? null,
    confidence: {
      value: candidate.confidence.value,
      reasons: candidate.confidence.reasons,
    },
    score: candidate.score,
    warnings: candidate.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      severity: warning.severity ?? null,
      source: warning.source ?? null,
    })),
    source: 'route_context_engine',
    providerMetadata: candidate.providerMetadata ?? null,
  }));
}

function routeContextCampCandidatesForItinerary(
  context: RouteContext,
): NonNullable<TripBuilderRouteContextInput['campCandidates']> {
  return context.campCandidates.map((candidate) => ({
    id: candidate.id,
    name: candidate.name ?? null,
    lat: candidate.lat,
    lng: candidate.lng,
    source: candidate.source,
    distanceFromRouteMeters: candidate.distanceFromRouteMeters ?? null,
    distanceFromTrailheadMeters: candidate.distanceFromTrailheadMeters ?? null,
    accessStatus: candidate.accessStatus ?? null,
    legalStatus: candidate.legalStatus ?? null,
    restrictionStatus: candidate.restrictionStatus ?? null,
    score: candidate.score ?? null,
    confidence: {
      value: candidate.confidence.value,
      reasons: candidate.confidence.reasons,
    },
    warnings: candidate.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      severity: warning.severity ?? null,
      source: warning.source ?? null,
    })),
    providerMetadata: candidate.providerMetadata ?? null,
  }));
}

function routeContextBailoutCandidatesForItinerary(
  context: RouteContext,
): NonNullable<TripBuilderRouteContextInput['bailoutCandidates']> {
  return context.bailoutCandidates.map((candidate) => ({
    id: candidate.id,
    label: candidate.label,
    lat: candidate.lat,
    lng: candidate.lng,
    source: candidate.source,
    category: candidate.category ?? null,
    routeMileMarker: candidate.routeMileMarker ?? null,
    distanceFromRouteMeters: candidate.distanceFromRouteMeters ?? null,
    distanceFromTrailheadMeters: candidate.distanceFromTrailheadMeters ?? null,
    driveTimeToSafetySeconds: candidate.driveTimeToSafetySeconds ?? null,
    reachableByVehicle: candidate.reachableByVehicle ?? null,
    score: candidate.score ?? null,
    confidence: {
      value: candidate.confidence.value,
      reasons: candidate.confidence.reasons,
    },
    warnings: candidate.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      severity: warning.severity ?? null,
      source: warning.source ?? null,
    })),
    providerMetadata: candidate.providerMetadata ?? null,
  }));
}

function orderedSupplyCandidates(context: RouteContext, mode?: SupplyMode | null): SupplyCandidate[] {
  const byId = new Map(context.supplyCandidates.map((candidate) => [candidate.id, candidate]));
  const orderedIds = context.selectedSupplyPlan?.orderedStops.map((stop) => stop.candidateId) ?? [];
  const ordered = orderedIds
    .map((id) => byId.get(id))
    .filter((candidate): candidate is SupplyCandidate => !!candidate && routeContextModeMatches(mode, candidate));
  const seen = new Set(ordered.map((candidate) => candidate.id));
  const rest = context.supplyCandidates
    .filter((candidate) => !seen.has(candidate.id) && routeContextModeMatches(mode, candidate))
    .sort((left, right) => right.score - left.score || right.confidence.value - left.confidence.value);
  return [...ordered, ...rest];
}

export function isUsableRouteContext(context: RouteContext | null | undefined): context is RouteContext {
  return !!context && (context.status === 'ready' || context.status === 'partial' || context.status === 'stale');
}

export type TripBuilderRouteContextEvidenceState = 'complete' | 'partial' | 'stale';

export function routeContextEvidenceState(
  context: Pick<RouteContext, 'status'> | null | undefined,
): TripBuilderRouteContextEvidenceState {
  if (context?.status === 'ready') return 'complete';
  if (context?.status === 'stale') return 'stale';
  return 'partial';
}

export function routeContextTrailheadCoordinate(context: RouteContext | null | undefined): TripBuilderCoordinate | null {
  if (!isUsableRouteContext(context)) return null;
  if (context.trailheadAnchor.source === 'unknown') return null;
  return tripCoordinate(context.trailheadAnchor);
}

export function routeContextRoutePoints(context: RouteContext | null | undefined): TripBuilderCoordinate[] {
  if (!isUsableRouteContext(context)) return [];
  return context.routeGeometry?.coordinates
    ?.map(tripCoordinate)
    .filter((coordinate): coordinate is TripBuilderCoordinate => coordinate != null) ?? [];
}

export function routeWithRouteContext(
  route: TripBuilderRouteInput,
  context: RouteContext | null | undefined,
): TripBuilderRouteInput {
  if (!isUsableRouteContext(context)) return route;
  const lineString = routeGeometryLineString(context.routeGeometry);
  const trailhead = routeContextTrailheadCoordinate(context);
  const distanceMiles = distanceMilesFromMeters(context.routeGeometry?.distanceMeters);
  const driveHours = context.routeGeometry?.durationSeconds != null
    ? Math.round((context.routeGeometry.durationSeconds / 3600) * 10) / 10
    : null;
  return {
    ...route,
    startLat: trailhead?.latitude ?? route.startLat,
    startLng: trailhead?.longitude ?? route.startLng,
    routeGeometry: lineString ?? route.routeGeometry,
    distanceMiles: distanceMiles ?? route.distanceMiles,
    estimatedDriveTimeHours: driveHours ?? route.estimatedDriveTimeHours,
    routeMetadata: {
      ...(route.routeMetadata ?? {}),
      routeContext: {
        id: context.id,
        status: context.status,
        trailheadSource: context.trailheadAnchor.source,
        selectedSupplyMode: context.selectedSupplyMode ?? null,
      },
    },
  };
}

export function routeContextToTripBuilderItineraryContext(
  context: RouteContext | null | undefined,
  mode?: SupplyMode | null,
): TripBuilderRouteContextInput | null {
  if (!isUsableRouteContext(context)) return null;
  const routePoints = routeContextRoutePoints(context);
  const trailhead = routeContextTrailheadCoordinate(context);
  return {
    status: context.status,
    trailheadAnchor: trailhead ? {
      coordinate: trailhead,
      source: context.trailheadAnchor.source,
      confidence: context.trailheadAnchor.confidence.value,
      warnings: context.trailheadAnchor.warnings.map((warning) => warning.code),
    } : null,
    supplyMode: mode ?? context.selectedSupplyMode ?? null,
    selectedSupplyPlan: context.selectedSupplyPlan ? {
      orderedStops: context.selectedSupplyPlan.orderedStops,
      score: context.selectedSupplyPlan.score,
      confidence: context.selectedSupplyPlan.confidence.value,
      warnings: context.selectedSupplyPlan.warnings.map((warning) => warning.code),
    } : null,
    routeGeometry: context.routeGeometry ? {
      coordinates: routePoints,
      distanceMeters: context.routeGeometry.distanceMeters ?? null,
      durationSeconds: context.routeGeometry.durationSeconds ?? null,
    } : null,
    routeDistanceMiles: distanceMilesFromMeters(context.routeGeometry?.distanceMeters),
    routeDurationHours: context.routeGeometry?.durationSeconds != null
      ? Math.round((context.routeGeometry.durationSeconds / 3600) * 10) / 10
      : null,
    warnings: context.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      severity: warning.severity ?? null,
    })),
    confidence: {
      value: context.confidence.value,
      tier: routeContextConfidenceTier(context),
      reasons: context.confidence.reasons,
    },
    supplyCandidateCount: context.supplyCandidates
      .filter((candidate) => routeContextModeMatches(mode ?? context.selectedSupplyMode, candidate))
      .length,
    supplyCandidates: routeContextSupplyCandidatesForItinerary(context, mode ?? context.selectedSupplyMode),
    campCandidates: routeContextCampCandidatesForItinerary(context),
    campEndpointPlan: context.campEndpointPlan ?? null,
    bailoutCandidates: routeContextBailoutCandidatesForItinerary(context),
  };
}

export function routeContextSupplyCandidatesToResupplyPoints(
  context: RouteContext | null | undefined,
  mode?: SupplyMode | null,
): ResupplyPoint[] {
  if (!isUsableRouteContext(context)) return [];
  const evidenceState = routeContextEvidenceState(context);
  const orderedCandidates = orderedSupplyCandidates(context, mode);
  const selectedIds = new Set(context.selectedSupplyPlan?.orderedStops.map((stop) => stop.candidateId) ?? []);
  return orderedCandidates.map((candidate, index): ResupplyPoint => ({
    id: `route-context-${candidate.id}`,
    name: candidate.name,
    category: candidate.category === 'gas' ? 'fuel' : 'food_supplies',
    location: { latitude: candidate.lat, longitude: candidate.lng },
    routeMileMarker: null,
    distanceFromRouteMiles: distanceMilesFromMeters(candidate.detourDistanceMeters),
    distanceFromStartMiles: null,
    reliability: confidenceLabel(candidate.confidence.value),
    source: evidenceState === 'complete' ? 'route_context_engine' : `${evidenceState}_route_context_engine`,
    accessStatus: candidate.accessStatus ?? 'unknown',
    placeIdentity: providerResupplyPlaceIdentity(
      candidate.providerPlaceId,
      candidate.providerMetadata?.providerId ?? candidate.providerMetadata?.source ?? 'route-context',
    ) ?? `route-context:${candidate.id}`,
    categoryCoverage: [candidate.category === 'gas' ? 'fuel' : 'food_supplies'],
    selectionState: selectedIds.has(candidate.id) ? 'route_context_selected' : 'candidate',
    approachEvidence: {
      rank: index + 1,
      score: candidate.supplyChainScore ?? candidate.approachScore ?? candidate.score ?? null,
      progressRatio: null,
      distanceFromOriginMiles: null,
      distanceBeforeTrailheadMiles: distanceMilesFromMeters(
        candidate.driveDistanceToTrailheadMeters ?? candidate.distanceToTrailheadMeters,
      ),
      distanceBeforeRemoteEntryMiles: null,
      corridorOffsetMiles: null,
      detourDistanceMiles: distanceMilesFromMeters(candidate.detourDistanceMeters),
      detourDurationMinutes: candidate.detourDurationSeconds == null
        ? null
        : Math.round((candidate.detourDurationSeconds / 60) * 10) / 10,
      detourSource: candidate.detourDistanceMeters == null ? 'unavailable' : 'provider_route',
      routeAwareConfidence: candidate.detourDistanceMeters == null ? 'unknown' : confidenceLabel(candidate.confidence.value),
      beforeTrailhead: null,
      beforeRemoteEntry: null,
      remoteEntrySource: 'unavailable',
      remoteEntryEstimated: false,
      operatingStatus: candidate.openStatus === 'open' || candidate.openStatus === 'closed' || candidate.openStatus === 'temporarily_closed'
        ? candidate.openStatus
        : 'unknown',
    },
    notes: [
      evidenceState === 'stale'
        ? 'Suggested by cached/stale Route Context evidence. Refresh and verify current hours and access before departure.'
        : evidenceState === 'partial'
          ? 'Suggested by partial Route Context evidence. Verify current hours and access before departure.'
          : 'Suggested by background route context. Verify current hours and access before departure.',
      candidate.openStatus && candidate.openStatus !== 'unknown' ? `Open status: ${candidate.openStatus}.` : null,
      candidate.address ? `Address: ${candidate.address}.` : null,
    ].filter((note): note is string => !!note),
  }));
}

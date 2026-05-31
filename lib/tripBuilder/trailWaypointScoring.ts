import {
  distancePointToRouteMiles,
  haversineDistanceMiles,
} from '../map/routeGeometryUtils';
import type {
  GeoPoint,
  ItineraryDataSource,
  ItineraryRoute,
  ItineraryWaypoint,
  TrailheadStartCandidate,
  TripBuilderConfidence,
  TripBuilderRouteContextInput,
  TripBuilderVehicleProfile,
  WaypointType,
} from './tripBuilderTypes';

export type TrailWaypointRouteProximityStatus =
  | 'on_route'
  | 'near_route'
  | 'off_route'
  | 'unknown';

export type TrailWaypointCoordinatePrecision =
  | 'precise'
  | 'approximate'
  | 'unknown'
  | 'missing';

export type TrailWaypointVehicleSuitabilityStatus =
  | 'suitable'
  | 'watch'
  | 'limited'
  | 'unknown';

export type TrailWaypointRouteProximity = {
  distanceMiles: number | null;
  score: number;
  status: TrailWaypointRouteProximityStatus;
  source: 'trail_route_geometry' | 'missing_trail_geometry' | 'missing_coordinate';
};

export type TrailWaypointDistanceFromTrailhead = {
  miles: number | null;
  score: number;
  source: 'trailhead_start' | 'missing_trailhead' | 'missing_coordinate';
};

export type TrailWaypointVehicleSuitability = {
  score: number;
  status: TrailWaypointVehicleSuitabilityStatus;
  reasons: string[];
};

export type ScoredTrailWaypointCandidate = {
  waypoint: ItineraryWaypoint;
  waypointId: string;
  waypointType: WaypointType;
  confidenceScore: number;
  usefulnessScore: number;
  safetyScore: number;
  sourceScore: number;
  priorityScore: number;
  proximityToRoute: TrailWaypointRouteProximity;
  distanceFromTrailhead: TrailWaypointDistanceFromTrailhead;
  vehicleSuitability: TrailWaypointVehicleSuitability;
  warnings: string[];
  metadata: {
    isUserAdded: boolean;
    isEcsSuggested: boolean;
    coordinatePrecision: TrailWaypointCoordinatePrecision;
    coordinateAccuracyMeters: number | null;
    sourceLabel: string;
    sourceState: ItineraryDataSource['state'] | null;
    source: string | null;
    provider: string | null;
    routeContextStatus: string | null;
    routeContextConfidence: number | null;
    trailRouteGeometryPointCount: number;
    originalMetadata: Record<string, unknown> | null;
    scoringInputs: {
      baseConfidenceScore: number;
      coordinatePrecisionScore: number;
      typeUsefulnessScore: number;
      typeSafetyScore: number;
      preferenceScore: number;
      trailEndMatchScore: number | null;
    };
  };
};

export type ScoreTrailWaypointCandidatesArgs = {
  candidates?: ItineraryWaypoint[] | null;
  trailRoute?: ItineraryRoute | GeoPoint[] | null;
  trailheadStart?: ItineraryWaypoint | TrailheadStartCandidate | GeoPoint | null;
  trailEnd?: ItineraryWaypoint | GeoPoint | null;
  vehicleProfile?: TripBuilderVehicleProfile | null;
  userPreferences?: Record<string, unknown> | null;
  routeContext?: TripBuilderRouteContextInput | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : null;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(clamp(value) * 100) / 100;
}

function roundDistance(value: number | null): number | null {
  return value == null ? null : Math.round(value * 100) / 100;
}

function confidenceLabelScore(value: TripBuilderConfidence | null | undefined): number {
  if (value === 'high') return 0.88;
  if (value === 'medium') return 0.66;
  if (value === 'low') return 0.38;
  return 0.24;
}

function numericConfidence(value: unknown): number | null {
  if (isRecord(value)) return numericConfidence(value.value);
  const numeric = finiteNumber(value);
  if (numeric == null) return null;
  return numeric > 1 ? clamp(numeric / 100) : clamp(numeric);
}

function candidateBaseConfidence(waypoint: ItineraryWaypoint): number {
  return numericConfidence(waypoint.confidenceScore ?? waypoint.source.confidence) ??
    confidenceLabelScore(waypoint.confidence);
}

function routeGeometryPoints(route?: ItineraryRoute | GeoPoint[] | null): GeoPoint[] {
  if (Array.isArray(route)) return route.filter((point) => point != null);
  const direct = route?.geometry?.filter((point): point is GeoPoint => point != null) ?? [];
  if (direct.length >= 2) return direct;
  const segmentPoints = route?.segments
    ?.flatMap((segment) => segment.geometry ?? [])
    .filter((point): point is GeoPoint => point != null) ?? [];
  return segmentPoints;
}

function coordinateFrom(value?: ItineraryWaypoint | TrailheadStartCandidate | GeoPoint | null): GeoPoint | null {
  if (!value) return null;
  if ('coordinate' in value) return value.coordinate ?? null;
  if (Number.isFinite(value.latitude) && Number.isFinite(value.longitude)) return value;
  return null;
}

function coordinateAccuracyMeters(waypoint: ItineraryWaypoint): number | null {
  const metadata = isRecord(waypoint.metadata) ? waypoint.metadata : {};
  return finiteNumber(waypoint.coordinate?.accuracyMeters) ??
    finiteNumber(metadata.accuracyMeters) ??
    finiteNumber(metadata.coordinateAccuracyMeters);
}

function coordinatePrecision(waypoint: ItineraryWaypoint): {
  precision: TrailWaypointCoordinatePrecision;
  score: number;
  warnings: string[];
} {
  if (!waypoint.coordinate) {
    return {
      precision: 'missing',
      score: 0,
      warnings: ['Waypoint coordinate is unavailable; proximity and trailhead distance could not be scored.'],
    };
  }

  const metadata = isRecord(waypoint.metadata) ? waypoint.metadata : {};
  const explicitPrecision = String(metadata.coordinatePrecision ?? metadata.precision ?? '').toLowerCase();
  const approximate = metadata.approximate === true || explicitPrecision === 'approximate';
  const accuracyMeters = coordinateAccuracyMeters(waypoint);

  if (approximate || (accuracyMeters != null && accuracyMeters > 250)) {
    return {
      precision: 'approximate',
      score: 0.45,
      warnings: ['Waypoint coordinate is approximate; confidence was reduced.'],
    };
  }

  if (accuracyMeters != null && accuracyMeters <= 50) {
    return {
      precision: 'precise',
      score: 0.95,
      warnings: [],
    };
  }

  if (explicitPrecision === 'precise') {
    return {
      precision: 'precise',
      score: 0.88,
      warnings: [],
    };
  }

  return {
    precision: 'unknown',
    score: 0.68,
    warnings: ['Waypoint coordinate precision is unknown.'],
  };
}

function sourceText(waypoint: ItineraryWaypoint): string {
  return [
    waypoint.source.label,
    waypoint.source.source,
    waypoint.source.provider,
    isRecord(waypoint.metadata) ? waypoint.metadata.waypointSourceKind : null,
    isRecord(waypoint.metadata) ? waypoint.metadata.providerMetadata : null,
  ].map((value) => JSON.stringify(value ?? '')).join(' ').toLowerCase();
}

function sourceReliabilityScore(waypoint: ItineraryWaypoint): { score: number; warnings: string[] } {
  const state = waypoint.source.state;
  const stateScore =
    state === 'live' ? 0.92 :
    state === 'manual' ? 0.78 :
    state === 'cached' ? 0.72 :
    state === 'estimated' ? 0.45 :
    state === 'stale' ? 0.38 :
    state === 'mock' || state === 'mocked' ? 0.25 :
    state === 'missing' ? 0.08 :
    0.32;
  const text = sourceText(waypoint).replace(/[_-]+/g, ' ');
  const providerScore =
    /\bsupabase|ecs supabase\b/.test(text) ? 0.86 :
    /\boffline prep pack\b/.test(text) ? 0.76 :
    /\bmapbox\b/.test(text) ? 0.72 :
    /\broute context\b/.test(text) ? 0.68 :
    /\bosm|openstreetmap\b/.test(text) ? 0.55 :
    /\boperator|manual|user\b/.test(text) ? 0.78 :
    stateScore;
  const explicit = numericConfidence(waypoint.source.confidence);
  const score = explicit != null
    ? (stateScore * 0.45) + (providerScore * 0.35) + (explicit * 0.2)
    : (stateScore * 0.55) + (providerScore * 0.45);
  const warnings: string[] = [];

  if (state === 'estimated' || state === 'stale' || state === 'mock' || state === 'mocked') {
    warnings.push(`Waypoint source is ${state}; treat this waypoint as lower confidence.`);
  } else if (state === 'missing' || state === 'unknown') {
    warnings.push('Waypoint source reliability is unknown or missing.');
  }

  if (waypoint.isUserAdded) {
    warnings.push('User-added waypoint was preserved but is not provider-confirmed.');
  }

  return {
    score: roundScore(score),
    warnings,
  };
}

function proximityScore(
  waypoint: ItineraryWaypoint,
  routeGeometry: GeoPoint[],
): { proximity: TrailWaypointRouteProximity; warnings: string[] } {
  if (!waypoint.coordinate) {
    return {
      proximity: {
        distanceMiles: null,
        score: 0,
        status: 'unknown',
        source: 'missing_coordinate',
      },
      warnings: ['Waypoint coordinate is missing, so route proximity is unknown.'],
    };
  }

  if (routeGeometry.length < 2) {
    return {
      proximity: {
        distanceMiles: null,
        score: 0.25,
        status: 'unknown',
        source: 'missing_trail_geometry',
      },
      warnings: ['Trail route geometry is unavailable; route proximity could not be scored.'],
    };
  }

  const distance = distancePointToRouteMiles(waypoint.coordinate, routeGeometry);
  if (distance == null) {
    return {
      proximity: {
        distanceMiles: null,
        score: 0.25,
        status: 'unknown',
        source: 'trail_route_geometry',
      },
      warnings: ['Trail route geometry could not produce a route proximity score.'],
    };
  }

  const score =
    distance <= 0.05 ? 1 :
    distance <= 0.25 ? 0.86 :
    distance <= 0.5 ? 0.7 :
    distance <= 1 ? 0.5 :
    distance <= 3 ? 0.25 :
    0.1;
  const status =
    distance <= 0.05 ? 'on_route' :
    distance <= 0.5 ? 'near_route' :
    'off_route';
  const warnings = distance > 1
    ? ['Waypoint is more than one mile from the true trail route; verify placement before relying on it.']
    : [];

  return {
    proximity: {
      distanceMiles: roundDistance(distance),
      score: roundScore(score),
      status,
      source: 'trail_route_geometry',
    },
    warnings,
  };
}

function distanceFromTrailheadScore(
  waypoint: ItineraryWaypoint,
  trailheadStart?: ItineraryWaypoint | TrailheadStartCandidate | GeoPoint | null,
): { distance: TrailWaypointDistanceFromTrailhead; warnings: string[] } {
  if (!waypoint.coordinate) {
    return {
      distance: {
        miles: null,
        score: 0,
        source: 'missing_coordinate',
      },
      warnings: ['Waypoint coordinate is missing, so distance from trailhead is unknown.'],
    };
  }

  const trailheadCoordinate = coordinateFrom(trailheadStart);
  if (!trailheadCoordinate) {
    return {
      distance: {
        miles: null,
        score: 0.35,
        source: 'missing_trailhead',
      },
      warnings: ['Trailhead start is unavailable; distance from trailhead could not be scored.'],
    };
  }

  return {
    distance: {
      miles: roundDistance(haversineDistanceMiles(waypoint.coordinate, trailheadCoordinate)),
      score: 0.9,
      source: 'trailhead_start',
    },
    warnings: [],
  };
}

function waypointTypeUsefulness(type: WaypointType): number {
  switch (type) {
    case 'hazard':
      return 0.88;
    case 'bailout':
      return 0.86;
    case 'turnaround':
      return 0.78;
    case 'trail_end':
      return 0.74;
    case 'exit':
      return 0.66;
    case 'camp_potential':
      return 0.66;
    case 'water':
    case 'fuel':
    case 'grocery':
    case 'supply':
      return 0.6;
    case 'scenic_stop':
      return 0.52;
    case 'user_added':
      return 0.5;
    case 'trailhead_start':
      return 0.42;
    default:
      return 0.45;
  }
}

function waypointTypeSafety(type: WaypointType): number {
  switch (type) {
    case 'hazard':
      return 0.96;
    case 'bailout':
      return 0.92;
    case 'turnaround':
      return 0.82;
    case 'trail_end':
    case 'exit':
      return 0.72;
    case 'camp_potential':
      return 0.58;
    case 'water':
    case 'fuel':
    case 'grocery':
    case 'supply':
      return 0.56;
    case 'user_added':
      return 0.5;
    case 'scenic_stop':
      return 0.35;
    case 'trailhead_start':
      return 0.48;
    default:
      return 0.45;
  }
}

function preferenceScore(type: WaypointType, userPreferences?: Record<string, unknown> | null): number {
  const text = JSON.stringify(userPreferences ?? {}).toLowerCase().replace(/[_-]+/g, ' ');
  if (!text || text === '{}') return 0.5;
  if (type === 'camp_potential' && /\bcamp|overnight\b/.test(text)) return 0.78;
  if (type === 'scenic_stop' && /\bscenic|view|photo|vista\b/.test(text)) return 0.78;
  if ((type === 'bailout' || type === 'turnaround') && /\bsafety|bailout|escape|conservative\b/.test(text)) return 0.82;
  if (type === 'hazard' && /\bsafety|hazard|risk|conservative\b/.test(text)) return 0.82;
  if (type === 'user_added') return 0.7;
  return 0.55;
}

function trailEndMatchScore(waypoint: ItineraryWaypoint, trailEnd?: ItineraryWaypoint | GeoPoint | null): number | null {
  if (waypoint.type !== 'trail_end' || !waypoint.coordinate) return null;
  const endCoordinate = coordinateFrom(trailEnd);
  if (!endCoordinate) return null;
  const distance = haversineDistanceMiles(waypoint.coordinate, endCoordinate);
  return distance <= 0.1 ? 1 : distance <= 0.5 ? 0.72 : 0.38;
}

function vehicleSuitability(
  waypoint: ItineraryWaypoint,
  vehicleProfile?: TripBuilderVehicleProfile | null,
): { suitability: TrailWaypointVehicleSuitability; warnings: string[] } {
  const metadata = isRecord(waypoint.metadata) ? waypoint.metadata : {};
  const providerMetadata = isRecord(metadata.providerMetadata) ? metadata.providerMetadata : {};
  const rawScore = numericConfidence(
    metadata.vehicleSuitabilityScore ??
      providerMetadata.vehicleSuitabilityScore ??
      metadata.vehicleFitScore ??
      providerMetadata.vehicleFitScore,
  );
  const suitabilityLabel = String(
    metadata.vehicleSuitability ??
      providerMetadata.vehicleSuitability ??
      metadata.vehicleFit ??
      providerMetadata.vehicleFit ??
      '',
  ).toLowerCase();
  const reachableByVehicle = metadata.reachableByVehicle ?? providerMetadata.reachableByVehicle;
  const minClearanceInches = finiteNumber(metadata.minClearanceInches ?? providerMetadata.minClearanceInches);
  const trailerSuitable = metadata.trailerSuitable ?? providerMetadata.trailerSuitable;
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = rawScore ?? 0.55;
  let status: TrailWaypointVehicleSuitabilityStatus = rawScore == null ? 'unknown' : 'suitable';

  if (suitabilityLabel === 'limited' || suitabilityLabel === 'poor' || suitabilityLabel === 'not_suitable') {
    score = Math.min(score, 0.35);
    status = 'limited';
    warnings.push('Waypoint vehicle suitability is marked limited by source metadata.');
  } else if (suitabilityLabel === 'watch' || suitabilityLabel === 'caution') {
    score = Math.min(score, 0.58);
    status = 'watch';
    warnings.push('Waypoint vehicle suitability needs review.');
  } else if (suitabilityLabel === 'good' || suitabilityLabel === 'suitable') {
    score = Math.max(score, 0.78);
    status = 'suitable';
    reasons.push('Waypoint source metadata marks this as suitable for the vehicle context.');
  }

  if (reachableByVehicle === false) {
    score = Math.min(score, 0.32);
    status = 'limited';
    warnings.push('Waypoint is not marked reachable by vehicle.');
  }

  if (minClearanceInches != null && vehicleProfile?.clearanceInches != null) {
    if (vehicleProfile.clearanceInches < minClearanceInches) {
      score = Math.min(score, 0.24);
      status = 'limited';
      warnings.push('Vehicle clearance appears below waypoint requirement.');
    } else if (vehicleProfile.clearanceInches - minClearanceInches <= 1) {
      score = Math.min(score, 0.56);
      status = status === 'limited' ? status : 'watch';
      warnings.push('Vehicle clearance margin is tight for this waypoint.');
    } else {
      score = Math.max(score, 0.72);
      status = status === 'unknown' ? 'suitable' : status;
      reasons.push('Vehicle clearance appears compatible with waypoint metadata.');
    }
  }

  if (vehicleProfile?.trailerAttached && trailerSuitable === false) {
    score = Math.min(score, 0.34);
    status = 'limited';
    warnings.push('Waypoint is not marked trailer-suitable while a trailer is attached.');
  }

  if (reasons.length === 0 && warnings.length === 0) {
    reasons.push(vehicleProfile
      ? 'Vehicle-specific waypoint suitability data is unavailable.'
      : 'No vehicle profile or waypoint fit data was available.');
  }

  return {
    suitability: {
      score: roundScore(score),
      status,
      reasons,
    },
    warnings,
  };
}

function scoreWaypoint(args: {
  waypoint: ItineraryWaypoint;
  routeGeometry: GeoPoint[];
  trailheadStart?: ItineraryWaypoint | TrailheadStartCandidate | GeoPoint | null;
  trailEnd?: ItineraryWaypoint | GeoPoint | null;
  vehicleProfile?: TripBuilderVehicleProfile | null;
  userPreferences?: Record<string, unknown> | null;
  routeContext?: TripBuilderRouteContextInput | null;
}): ScoredTrailWaypointCandidate {
  const precision = coordinatePrecision(args.waypoint);
  const source = sourceReliabilityScore(args.waypoint);
  const proximity = proximityScore(args.waypoint, args.routeGeometry);
  const trailheadDistance = distanceFromTrailheadScore(args.waypoint, args.trailheadStart);
  const vehicle = vehicleSuitability(args.waypoint, args.vehicleProfile);
  const typeUsefulness = waypointTypeUsefulness(args.waypoint.type);
  const typeSafety = waypointTypeSafety(args.waypoint.type);
  const preferences = preferenceScore(args.waypoint.type, args.userPreferences);
  const endMatch = trailEndMatchScore(args.waypoint, args.trailEnd);
  const baseConfidence = candidateBaseConfidence(args.waypoint);
  const routeContextConfidence = numericConfidence(args.routeContext?.confidence?.value);
  const warnings = [
    ...precision.warnings,
    ...source.warnings,
    ...proximity.warnings,
    ...trailheadDistance.warnings,
    ...vehicle.warnings,
  ];

  if (baseConfidence < 0.5) {
    warnings.push('Waypoint candidate confidence is low.');
  }
  if (routeContextConfidence != null && routeContextConfidence < 0.5) {
    warnings.push('Route context confidence is low; waypoint scoring should be reviewed.');
  }

  const confidenceScore = roundScore(
    (baseConfidence * 0.34) +
      (source.score * 0.26) +
      (proximity.proximity.score * 0.18) +
      (precision.score * 0.14) +
      ((routeContextConfidence ?? 0.55) * 0.08),
  );
  const confidenceWithMissingGeometry = args.routeGeometry.length < 2
    ? Math.min(confidenceScore, 0.62)
    : confidenceScore;
  const usefulnessScore = roundScore(
    (typeUsefulness * 0.36) +
      (proximity.proximity.score * 0.22) +
      (source.score * 0.14) +
      (preferences * 0.14) +
      (trailheadDistance.distance.score * 0.08) +
      ((endMatch ?? 0.5) * 0.06),
  );
  const safetyScore = roundScore(
    (typeSafety * 0.58) +
      (vehicle.suitability.score * 0.18) +
      (proximity.proximity.score * 0.14) +
      (source.score * 0.1),
  );
  const priorityScore = roundScore(
    (usefulnessScore * 0.38) +
      (safetyScore * 0.34) +
      (confidenceWithMissingGeometry * 0.28),
  );

  return {
    waypoint: args.waypoint,
    waypointId: args.waypoint.id,
    waypointType: args.waypoint.type,
    confidenceScore: roundScore(confidenceWithMissingGeometry),
    usefulnessScore,
    safetyScore,
    sourceScore: source.score,
    priorityScore,
    proximityToRoute: proximity.proximity,
    distanceFromTrailhead: trailheadDistance.distance,
    vehicleSuitability: vehicle.suitability,
    warnings: Array.from(new Set(warnings)),
    metadata: {
      isUserAdded: args.waypoint.isUserAdded === true,
      isEcsSuggested: args.waypoint.isEcsSuggested === true,
      coordinatePrecision: precision.precision,
      coordinateAccuracyMeters: coordinateAccuracyMeters(args.waypoint),
      sourceLabel: args.waypoint.source.label,
      sourceState: args.waypoint.source.state ?? null,
      source: args.waypoint.source.source ?? null,
      provider: args.waypoint.source.provider ?? null,
      routeContextStatus: args.routeContext?.status ?? null,
      routeContextConfidence,
      trailRouteGeometryPointCount: args.routeGeometry.length,
      originalMetadata: isRecord(args.waypoint.metadata) ? args.waypoint.metadata : null,
      scoringInputs: {
        baseConfidenceScore: roundScore(baseConfidence),
        coordinatePrecisionScore: roundScore(precision.score),
        typeUsefulnessScore: roundScore(typeUsefulness),
        typeSafetyScore: roundScore(typeSafety),
        preferenceScore: roundScore(preferences),
        trailEndMatchScore: endMatch == null ? null : roundScore(endMatch),
      },
    },
  };
}

export function scoreTrailWaypointCandidates({
  candidates = [],
  trailRoute = null,
  trailheadStart = null,
  trailEnd = null,
  vehicleProfile = null,
  userPreferences = null,
  routeContext = null,
}: ScoreTrailWaypointCandidatesArgs): ScoredTrailWaypointCandidate[] {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const routeGeometry = routeGeometryPoints(trailRoute);
  return candidates.map((waypoint) => scoreWaypoint({
    waypoint,
    routeGeometry,
    trailheadStart,
    trailEnd,
    vehicleProfile,
    userPreferences,
    routeContext,
  }));
}

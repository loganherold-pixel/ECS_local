export type TripBuilderCampSuggestionCoordinate = {
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
};

export type TripBuilderCampSuggestionCandidate = {
  id: string;
  name?: string | null;
  lat?: number | null;
  lng?: number | null;
  source?: string | null;
  distanceFromRouteMeters?: number | null;
  distanceFromTrailheadMeters?: number | null;
  accessStatus?: string | null;
  legalStatus?: string | null;
  restrictionStatus?: string | null;
  score?: number | null;
  confidence?: { value?: number | null; reasons?: string[] | null } | number | null;
  providerMetadata?: unknown;
};

export type TripBuilderSuggestedEstablishedCampPin = {
  id: string;
  title: string;
  coordinate: { latitude: number; longitude: number };
  subtitle: string;
  source: string;
  score: number | null;
  confidenceValue: number | null;
  distanceFromRouteMeters: number | null;
  routeProgressRatio: number;
  referenceOnly: true;
};

export type TripBuilderSuggestedEstablishedCampPinInput = {
  routePoints: TripBuilderCampSuggestionCoordinate[];
  candidates: TripBuilderCampSuggestionCandidate[] | null | undefined;
  limit?: number;
  maxDistanceFromRouteMeters?: number;
};

const EARTH_RADIUS_METERS = 6_371_000;
const DEFAULT_LIMIT = 5;
const DEFAULT_MAX_ROUTE_DISTANCE_METERS = 16_100;

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCoordinate(value: TripBuilderCampSuggestionCoordinate | null | undefined): { latitude: number; longitude: number } | null {
  if (!value) return null;
  const latitude = finiteNumber(value.latitude ?? value.lat);
  const longitude = finiteNumber(value.longitude ?? value.lng);
  if (latitude == null || longitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}

function haversineMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number {
  const dLat = degreesToRadians(right.latitude - left.latitude);
  const dLng = degreesToRadians(right.longitude - left.longitude);
  const lat1 = degreesToRadians(left.latitude);
  const lat2 = degreesToRadians(right.latitude);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function projectedMeters(
  point: { latitude: number; longitude: number },
  referenceLatitude: number,
): { x: number; y: number } {
  const latRadians = degreesToRadians(referenceLatitude);
  return {
    x: degreesToRadians(point.longitude) * Math.cos(latRadians) * EARTH_RADIUS_METERS,
    y: degreesToRadians(point.latitude) * EARTH_RADIUS_METERS,
  };
}

function nearestRouteProjection(
  coordinate: { latitude: number; longitude: number },
  routePoints: { latitude: number; longitude: number }[],
): { distanceMeters: number; routeProgressRatio: number } | null {
  if (routePoints.length === 0) return null;
  if (routePoints.length === 1) {
    return {
      distanceMeters: haversineMeters(coordinate, routePoints[0]),
      routeProgressRatio: 0,
    };
  }

  const segmentLengths = routePoints.slice(1).map((point, index) => haversineMeters(routePoints[index], point));
  const totalLength = segmentLengths.reduce((sum, value) => sum + value, 0);
  const candidatePoint = projectedMeters(coordinate, coordinate.latitude);
  let covered = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestProgress = 0;

  for (let index = 1; index < routePoints.length; index += 1) {
    const start = routePoints[index - 1];
    const end = routePoints[index];
    const startPoint = projectedMeters(start, coordinate.latitude);
    const endPoint = projectedMeters(end, coordinate.latitude);
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const denominator = dx * dx + dy * dy;
    const ratio = denominator > 0
      ? Math.max(0, Math.min(1, ((candidatePoint.x - startPoint.x) * dx + (candidatePoint.y - startPoint.y) * dy) / denominator))
      : 0;
    const projected = {
      x: startPoint.x + dx * ratio,
      y: startPoint.y + dy * ratio,
    };
    const distance = Math.hypot(candidatePoint.x - projected.x, candidatePoint.y - projected.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestProgress = covered + segmentLengths[index - 1] * ratio;
    }
    covered += segmentLengths[index - 1];
  }

  return {
    distanceMeters: nearestDistance,
    routeProgressRatio: totalLength > 0 ? Math.max(0, Math.min(1, nearestProgress / totalLength)) : 0,
  };
}

function providerText(candidate: TripBuilderCampSuggestionCandidate): string {
  const parts = [
    candidate.name,
    candidate.source,
  ];
  try {
    parts.push(JSON.stringify(candidate.providerMetadata ?? ''));
  } catch {}
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function isSuggestedEstablishedCampCandidate(candidate: TripBuilderCampSuggestionCandidate): boolean {
  const text = providerText(candidate);
  if (/\b(operator|manual|user_saved|user saved|route[-_\s]?inferred|ecs_route|route_candidate|dispersed|wild|clearing)\b/.test(text)) {
    return false;
  }
  return /\b(established|campground|campsite|developed|recreation|ridb|nps|reserveamerica|reserve|campflare|osm|mapbox_route_context_places)\b/.test(text);
}

function confidenceValue(candidate: TripBuilderCampSuggestionCandidate): number | null {
  if (typeof candidate.confidence === 'number') return finiteNumber(candidate.confidence);
  return finiteNumber(candidate.confidence?.value);
}

function subtitleForCandidate(candidate: TripBuilderCampSuggestionCandidate, distanceFromRouteMeters: number | null): string {
  const details = [
    distanceFromRouteMeters != null ? `${Math.round(distanceFromRouteMeters)} m from route` : null,
    candidate.accessStatus ? `access ${candidate.accessStatus}` : 'access unknown',
    candidate.legalStatus ? `legal ${candidate.legalStatus}` : 'legal unknown',
  ].filter(Boolean);
  return `${details.join(' | ')}. Verify reservation, access, seasonal restrictions, and current conditions.`;
}

export function buildSuggestedEstablishedCampPins({
  routePoints,
  candidates,
  limit = DEFAULT_LIMIT,
  maxDistanceFromRouteMeters = DEFAULT_MAX_ROUTE_DISTANCE_METERS,
}: TripBuilderSuggestedEstablishedCampPinInput): TripBuilderSuggestedEstablishedCampPin[] {
  const normalizedRoute = routePoints.map(normalizeCoordinate).filter((point): point is { latitude: number; longitude: number } => !!point);
  if (normalizedRoute.length === 0 || !Array.isArray(candidates) || candidates.length === 0) return [];

  const suggestions = candidates
    .flatMap((candidate): TripBuilderSuggestedEstablishedCampPin[] => {
      if (!isSuggestedEstablishedCampCandidate(candidate)) return [];
      const coordinate = normalizeCoordinate({ lat: candidate.lat, lng: candidate.lng });
      if (!coordinate) return [];
      const projection = nearestRouteProjection(coordinate, normalizedRoute);
      const distanceFromRouteMeters = finiteNumber(candidate.distanceFromRouteMeters) ?? projection?.distanceMeters ?? null;
      if (distanceFromRouteMeters != null && distanceFromRouteMeters > maxDistanceFromRouteMeters) return [];
      const source = String(candidate.source ?? 'route_context_camp_provider');
      return [{
        id: candidate.id,
        title: candidate.name?.trim() || 'Established camp suggestion',
        coordinate,
        subtitle: subtitleForCandidate(candidate, distanceFromRouteMeters),
        source,
        score: finiteNumber(candidate.score),
        confidenceValue: confidenceValue(candidate),
        distanceFromRouteMeters,
        routeProgressRatio: projection?.routeProgressRatio ?? 0,
        referenceOnly: true,
      }];
    })
    .sort((left, right) => (
      (right.score ?? Number.NEGATIVE_INFINITY) - (left.score ?? Number.NEGATIVE_INFINITY) ||
      (right.confidenceValue ?? Number.NEGATIVE_INFINITY) - (left.confidenceValue ?? Number.NEGATIVE_INFINITY) ||
      (left.distanceFromRouteMeters ?? Number.POSITIVE_INFINITY) - (right.distanceFromRouteMeters ?? Number.POSITIVE_INFINITY) ||
      left.routeProgressRatio - right.routeProgressRatio ||
      left.title.localeCompare(right.title)
    ));

  return suggestions.slice(0, Math.max(0, limit));
}

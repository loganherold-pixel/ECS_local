import type {
  ExpeditionReadinessCampCandidateInput,
  ExpeditionReadinessInput,
  ExpeditionReadinessRouteReferenceCoordinate,
} from './expeditionReadinessTypes';

export const CAMP_CANDIDATE_VIABILITY_RADIUS_MILES = 5;

export type CampCandidateViabilityStatus = 'viable' | 'none' | 'unknown';

export type CampCandidateViabilityResult = {
  status: CampCandidateViabilityStatus;
  radiusMiles: number;
  candidateCount: number;
  evaluatedCandidateCount: number;
  referencePointCount: number;
  viableCandidates: ExpeditionReadinessCampCandidateInput[];
  bestCandidate: ExpeditionReadinessCampCandidateInput | null;
  nearestDistanceMiles: number | null;
  nearestReferenceLabel: string | null;
};

type CandidateDistance = {
  candidate: ExpeditionReadinessCampCandidateInput;
  distanceMiles: number;
  referenceLabel: string | null;
};

function finiteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeCoordinate(
  coordinate: ExpeditionReadinessRouteReferenceCoordinate | null | undefined,
): ExpeditionReadinessRouteReferenceCoordinate | null {
  const latitude = finiteNumber(coordinate?.latitude);
  const longitude = finiteNumber(coordinate?.longitude);
  if (latitude == null || longitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {
    latitude,
    longitude,
    label: coordinate?.label ?? null,
  };
}

function haversineMiles(
  left: ExpeditionReadinessRouteReferenceCoordinate,
  right: ExpeditionReadinessRouteReferenceCoordinate,
): number {
  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(right.latitude - left.latitude);
  const deltaLng = toRadians(right.longitude - left.longitude);
  const leftLat = toRadians(left.latitude);
  const rightLat = toRadians(right.latitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(deltaLng / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function campIsOperationallyViable(candidate: ExpeditionReadinessCampCandidateInput): boolean {
  return candidate.accessStatus !== 'closed' && candidate.accessStatus !== 'restricted';
}

function candidateRank(candidate: ExpeditionReadinessCampCandidateInput): number {
  return candidate.overallCampScore ?? candidate.suitabilityScore ?? 0;
}

function routeReferenceCoordinates(input: ExpeditionReadinessInput): ExpeditionReadinessRouteReferenceCoordinate[] {
  const endpoint = normalizeCoordinate(input.route?.endpointCoordinate);
  const waypoints = (input.route?.waypointCoordinates ?? [])
    .map((coordinate) => normalizeCoordinate(coordinate))
    .filter((coordinate): coordinate is ExpeditionReadinessRouteReferenceCoordinate => Boolean(coordinate));
  return [endpoint, ...waypoints].filter((coordinate): coordinate is ExpeditionReadinessRouteReferenceCoordinate => Boolean(coordinate));
}

function nearestCandidateDistance(
  candidate: ExpeditionReadinessCampCandidateInput,
  referencePoints: ExpeditionReadinessRouteReferenceCoordinate[],
): CandidateDistance | null {
  const coordinate = normalizeCoordinate(candidate.coordinates);
  if (coordinate && referencePoints.length > 0) {
    return referencePoints.reduce<CandidateDistance | null>((nearest, referencePoint) => {
      const distanceMiles = haversineMiles(coordinate, referencePoint);
      if (!nearest || distanceMiles < nearest.distanceMiles) {
        return {
          candidate,
          distanceMiles,
          referenceLabel: referencePoint.label ?? null,
        };
      }
      return nearest;
    }, null);
  }

  if (referencePoints.length === 0) {
    const routeDistance = finiteNumber(candidate.routeDistance);
    if (routeDistance != null && routeDistance >= 0) {
      return {
        candidate,
        distanceMiles: routeDistance,
        referenceLabel: null,
      };
    }
  }

  return null;
}

export function evaluateCampCandidateViability(
  input: ExpeditionReadinessInput,
  radiusMiles = CAMP_CANDIDATE_VIABILITY_RADIUS_MILES,
): CampCandidateViabilityResult {
  const candidates = Array.isArray(input.campCandidates) ? input.campCandidates : [];
  const referencePoints = routeReferenceCoordinates(input);
  const candidatesKnown =
    Array.isArray(input.campCandidates) ||
    input.offline?.campCandidatesCached === true ||
    input.offline?.campIntelDownloaded === true;

  const distances = candidates
    .map((candidate) => nearestCandidateDistance(candidate, referencePoints))
    .filter((distance): distance is CandidateDistance => Boolean(distance));
  const viableDistances = distances
    .filter((distance) => (
      distance.distanceMiles <= radiusMiles &&
      campIsOperationallyViable(distance.candidate)
    ))
    .sort((left, right) => {
      const rankDelta = candidateRank(right.candidate) - candidateRank(left.candidate);
      return rankDelta !== 0 ? rankDelta : left.distanceMiles - right.distanceMiles;
    });
  const nearest = distances.reduce<CandidateDistance | null>((closest, distance) => {
    if (!closest || distance.distanceMiles < closest.distanceMiles) return distance;
    return closest;
  }, null);

  let status: CampCandidateViabilityStatus = 'unknown';
  if (viableDistances.length > 0) {
    status = 'viable';
  } else if (distances.length > 0 || (referencePoints.length > 0 && candidatesKnown && candidates.length === 0)) {
    status = 'none';
  }

  return {
    status,
    radiusMiles,
    candidateCount: candidates.length,
    evaluatedCandidateCount: distances.length,
    referencePointCount: referencePoints.length,
    viableCandidates: viableDistances.map((distance) => distance.candidate),
    bestCandidate: viableDistances[0]?.candidate ?? null,
    nearestDistanceMiles: nearest?.distanceMiles ?? null,
    nearestReferenceLabel: nearest?.referenceLabel ?? null,
  };
}

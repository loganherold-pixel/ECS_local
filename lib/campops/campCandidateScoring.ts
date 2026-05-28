import {
  CAMP_SCOUT_MAX_VIABLE_SLOPE_ESTIMATE,
  CAMP_SCOUT_MIN_ACCESS_CONFIDENCE,
  CAMP_SCOUT_MIN_DISPLAY_SCORE,
  CAMP_SCOUT_MIN_LEGALITY_CONFIDENCE,
  CAMP_SCOUT_MIN_REMOTENESS_SCORE,
  CAMP_SCOUT_MIN_TERRAIN_CONFIDENCE,
  rankCampScoutCandidates,
  scoreCampScoutCandidate,
  type CampScoutCandidate,
  type CampScoutLegalityStatus,
} from '../campScout';
import type { DispersedCampingRegion } from '../map/dispersedCampingTypes';
import {
  distancePointToRouteMiles,
  getGeometryCentroid,
  haversineDistanceMiles,
  normalizeRouteCoordinate,
  pointInPolygonGeometry,
  polygonGeometryToCoordinates,
  type NormalizedRouteCoordinate,
} from '../map/routeGeometryUtils';
import {
  ECS_INFERRED_CAMP_CANDIDATE_TITLE,
  ECS_INFERRED_CAMP_CANDIDATE_WARNING,
  type DispersedCampingCandidateGenerationInput,
  type DispersedCampingCandidateGenerationResult,
  type DispersedCampingEligibilityCandidateAssessment,
} from './campCandidateTypes';

const DEFAULT_INFERRED_CANDIDATE_LIMIT = 5;
const MAX_INFERRED_CANDIDATE_LIMIT = 10;
const DEFAULT_SCOUT_RADIUS_MILES = 2;
const MAX_SCOUT_RADIUS_MILES = 2;

const SCOUT_CANDIDATE_OFFSETS: ReadonlyArray<{ bearingDegrees: number; distanceMiles: number }> = [
  { bearingDegrees: 0, distanceMiles: 0 },
  { bearingDegrees: 0, distanceMiles: 0.45 },
  { bearingDegrees: 90, distanceMiles: 0.65 },
  { bearingDegrees: 180, distanceMiles: 0.85 },
  { bearingDegrees: 270, distanceMiles: 1.05 },
  { bearingDegrees: 45, distanceMiles: 1.25 },
  { bearingDegrees: 135, distanceMiles: 1.45 },
  { bearingDegrees: 225, distanceMiles: 1.65 },
  { bearingDegrees: 315, distanceMiles: 1.85 },
];

const ELIGIBILITY_SCORE = {
  high: 88,
  medium: 74,
  verify: 52,
  restricted: 0,
} as const;

const LAND_MANAGER_BLOCKLIST = new Set(['PRIVATE', 'TRIBAL', 'MILITARY']);

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const next = values
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0);
  return next.filter((value, index) => next.indexOf(value) === index);
}

function includesBlockedRestriction(region: DispersedCampingRegion): boolean {
  const text = [...region.restrictions, region.eligibilityLabel]
    .join(' ')
    .toLowerCase();
  return (
    text.includes('known closure') ||
    text.includes('closed') ||
    text.includes('no camping') ||
    text.includes('no public access') ||
    text.includes('closed road') ||
    text.includes('restricted access')
  );
}

export function assessDispersedCampingRegionForCandidate(
  region: DispersedCampingRegion,
): DispersedCampingEligibilityCandidateAssessment {
  const warnings = uniqueStrings([
    ...region.restrictions,
    ECS_INFERRED_CAMP_CANDIDATE_WARNING,
  ]);

  if (region.confidence === 'restricted') {
    return {
      accepted: false,
      regionId: region.id,
      confidence: region.confidence,
      landManager: region.landManager,
      eligibilityScore: 0,
      hardBlockReason: 'Restricted / unavailable eligibility region',
      warnings,
    };
  }

  if (LAND_MANAGER_BLOCKLIST.has(region.landManager)) {
    return {
      accepted: false,
      regionId: region.id,
      confidence: region.confidence,
      landManager: region.landManager,
      eligibilityScore: 0,
      hardBlockReason: `${region.landManager} land is not eligible for inferred camp candidates`,
      warnings,
    };
  }

  if (region.landManager === 'NPS') {
    return {
      accepted: false,
      regionId: region.id,
      confidence: region.confidence,
      landManager: region.landManager,
      eligibilityScore: 0,
      hardBlockReason: 'National Park general land requires explicit backcountry or permit-area data',
      warnings,
    };
  }

  if (region.closureKnown === true || includesBlockedRestriction(region)) {
    return {
      accepted: false,
      regionId: region.id,
      confidence: region.confidence,
      landManager: region.landManager,
      eligibilityScore: 0,
      hardBlockReason: 'Known closure or restricted access signal present',
      warnings,
    };
  }

  return {
    accepted: true,
    regionId: region.id,
    confidence: region.confidence,
    landManager: region.landManager,
    eligibilityScore: ELIGIBILITY_SCORE[region.confidence],
    warnings,
  };
}

function legalityStatusFor(region: DispersedCampingRegion): CampScoutLegalityStatus {
  if (region.confidence === 'high' || region.confidence === 'medium') {
    return 'likely_allowed_needs_verification';
  }
  return 'unknown_needs_verification';
}

function accessConfidenceFor(region: DispersedCampingRegion): number {
  if (region.confidence === 'high') return 78;
  if (region.confidence === 'medium') return 70;
  return 58;
}

function terrainConfidenceFor(region: DispersedCampingRegion): number {
  if (region.confidence === 'high') return 74;
  if (region.confidence === 'medium') return 70;
  return 56;
}

function remotenessFor(region: DispersedCampingRegion): number {
  if (region.landManager === 'BLM') return 74;
  if (region.landManager === 'USFS') return 78;
  return 62;
}

function routeProximityScore(routeDistanceMiles: number | undefined): number {
  if (typeof routeDistanceMiles !== 'number' || !Number.isFinite(routeDistanceMiles)) return 58;
  const normalized = Math.max(0, Math.min(5, routeDistanceMiles));
  return Math.max(58, Math.min(96, Math.round(96 - (normalized / 5) * 38)));
}

function distanceFromCurrentLocationMiles(
  coordinate: NormalizedRouteCoordinate,
  currentLocation: DispersedCampingCandidateGenerationInput['currentLocation'],
): number | undefined {
  const current = normalizeRouteCoordinate(currentLocation);
  if (!current) return undefined;
  return Math.round(haversineDistanceMiles(coordinate, current) * 10) / 10;
}

function distanceFromRouteMiles(
  coordinate: NormalizedRouteCoordinate,
  routeCoordinates: DispersedCampingCandidateGenerationInput['routeCoordinates'],
): number | undefined {
  const distance = distancePointToRouteMiles(coordinate, routeCoordinates);
  return typeof distance === 'number' ? Math.round(distance * 10) / 10 : undefined;
}

function scoutRadiusMiles(input: DispersedCampingCandidateGenerationInput): number {
  const requested = input.maxScoutRadiusMiles ?? DEFAULT_SCOUT_RADIUS_MILES;
  if (typeof requested !== 'number' || !Number.isFinite(requested)) return DEFAULT_SCOUT_RADIUS_MILES;
  return Math.max(0.1, Math.min(MAX_SCOUT_RADIUS_MILES, requested));
}

function routeDistanceLimitMiles(input: DispersedCampingCandidateGenerationInput): number | null {
  const requested = input.maxRouteDistanceMiles;
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) return null;
  return requested;
}

function offsetCoordinateMiles(
  origin: NormalizedRouteCoordinate,
  bearingDegrees: number,
  distanceMiles: number,
): NormalizedRouteCoordinate {
  if (distanceMiles <= 0) return origin;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const latitudeDelta = (Math.cos(bearing) * distanceMiles) / 69;
  const longitudeScale = 69.172 * Math.cos((origin.latitude * Math.PI) / 180);
  const longitudeDelta = longitudeScale === 0 ? 0 : (Math.sin(bearing) * distanceMiles) / longitudeScale;
  return {
    latitude: origin.latitude + latitudeDelta,
    longitude: origin.longitude + longitudeDelta,
  };
}

function coordinateKey(coordinate: NormalizedRouteCoordinate): string {
  return `${coordinate.latitude.toFixed(5)}:${coordinate.longitude.toFixed(5)}`;
}

function isEligibleScoutCoordinate(
  region: DispersedCampingRegion,
  coordinate: NormalizedRouteCoordinate,
  input: DispersedCampingCandidateGenerationInput,
  scoutCenter: NormalizedRouteCoordinate | null,
  maxRadiusMiles: number,
): boolean {
  if (!pointInPolygonGeometry(coordinate, region.geometry)) return false;
  if (scoutCenter && haversineDistanceMiles(coordinate, scoutCenter) > maxRadiusMiles) return false;

  const maxRouteDistanceMiles = routeDistanceLimitMiles(input);
  if (maxRouteDistanceMiles == null) return true;

  const routeDistanceMiles = distancePointToRouteMiles(coordinate, input.routeCoordinates);
  return typeof routeDistanceMiles === 'number' && routeDistanceMiles <= maxRouteDistanceMiles;
}

function addScoutCoordinate(
  coordinates: NormalizedRouteCoordinate[],
  seen: Set<string>,
  region: DispersedCampingRegion,
  coordinate: NormalizedRouteCoordinate,
  input: DispersedCampingCandidateGenerationInput,
  scoutCenter: NormalizedRouteCoordinate | null,
  maxRadiusMiles: number,
  maxCandidates: number,
): void {
  if (coordinates.length >= maxCandidates) return;
  if (!isEligibleScoutCoordinate(region, coordinate, input, scoutCenter, maxRadiusMiles)) return;

  const key = coordinateKey(coordinate);
  if (seen.has(key)) return;
  seen.add(key);
  coordinates.push(coordinate);
}

function buildScoutCandidateCoordinates(
  region: DispersedCampingRegion,
  input: DispersedCampingCandidateGenerationInput,
  maxCandidates: number,
): NormalizedRouteCoordinate[] {
  const centroid = getGeometryCentroid(region.geometry);
  if (!centroid) return [];

  const requestedScoutCenter = normalizeRouteCoordinate(input.scoutCenter);
  const scoutCenter =
    requestedScoutCenter && pointInPolygonGeometry(requestedScoutCenter, region.geometry)
      ? requestedScoutCenter
      : null;
  const maxRadiusMiles = scoutRadiusMiles(input);

  if (!scoutCenter) {
    return isEligibleScoutCoordinate(region, centroid, input, null, maxRadiusMiles) ? [centroid] : [];
  }

  const coordinates: NormalizedRouteCoordinate[] = [];
  const seen = new Set<string>();

  for (const offset of SCOUT_CANDIDATE_OFFSETS) {
    const coordinate = offsetCoordinateMiles(scoutCenter, offset.bearingDegrees, offset.distanceMiles);
    addScoutCoordinate(coordinates, seen, region, coordinate, input, scoutCenter, maxRadiusMiles, maxCandidates);
  }

  if (coordinates.length < maxCandidates) {
    for (const coordinate of polygonGeometryToCoordinates(region.geometry)) {
      addScoutCoordinate(coordinates, seen, region, coordinate, input, scoutCenter, maxRadiusMiles, maxCandidates);
    }
  }

  return coordinates;
}

function buildCandidateFromRegion(
  region: DispersedCampingRegion,
  assessment: DispersedCampingEligibilityCandidateAssessment,
  input: DispersedCampingCandidateGenerationInput,
  coordinate: NormalizedRouteCoordinate,
  candidateIndex: number,
): CampScoutCandidate | null {
  const routeDistance =
    distanceFromRouteMiles(coordinate, input.routeCoordinates) ??
    input.routeNearbyRegions?.find((result) => result.regionId === region.id)?.distanceFromRouteMiles;
  const scoutCenter = normalizeRouteCoordinate(input.scoutCenter);
  const scoutDistance =
    scoutCenter != null ? Math.round(haversineDistanceMiles(coordinate, scoutCenter) * 10) / 10 : undefined;
  const legalityConfidence = assessment.eligibilityScore;
  const accessConfidence = accessConfidenceFor(region);
  const terrainConfidence = terrainConfidenceFor(region);
  const sourceNotes = uniqueStrings([
    `${region.landManager} eligibility region`,
    ...region.basis,
    routeDistance != null ? `${routeDistance} mi from route corridor` : null,
    scoutDistance != null ? `${scoutDistance} mi from selected scout point` : null,
  ]);
  const restrictions = uniqueStrings([
    ...assessment.warnings,
    region.confidence === 'verify' ? 'Eligibility requires local verification before use.' : null,
    routeDistance == null
      ? 'Nearest road or trail access is not confirmed; route preview may end at the closest routable road.'
      : routeDistance > 0.25
        ? 'Candidate may sit away from a mapped routable road or trail; verify vehicle access before committing.'
        : null,
  ]);

  const baseCandidate: CampScoutCandidate = {
    id: `ecs-eligibility-${region.id}${candidateIndex > 0 ? `-${candidateIndex + 1}` : ''}`,
    coordinate: {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    },
    title: ECS_INFERRED_CAMP_CANDIDATE_TITLE,
    sourceType: 'ecs_inferred',
    confidenceScore: 0,
    confidenceGrade: 'D',
    scoreBreakdown: {
      flatnessTerrain: terrainConfidence,
      accessConfidence,
      remotenessValue: remotenessFor(region),
      legalAccessConfidence: legalityConfidence,
      safetyEnvironmentalRisk: 72,
      sourceSignal: 62,
      sourceQuality: 62,
      remoteness: remotenessFor(region),
      access: accessConfidence,
      legality: legalityConfidence,
      terrain: terrainConfidence,
      proximity: routeProximityScore(routeDistance),
      confidence: 0,
      total: 0,
    },
    reasons: uniqueStrings([
      'Candidate scouting location inside a dispersed camping eligibility region.',
      scoutDistance != null
        ? `Generated within ${Math.min(MAX_SCOUT_RADIUS_MILES, input.maxScoutRadiusMiles ?? DEFAULT_SCOUT_RADIUS_MILES)} mi of the selected scout point.`
        : null,
      'Ranked by ECS against eligibility confidence, access, remoteness, route proximity, and terrain confidence.',
      region.confidence === 'high'
        ? 'High-confidence BLM eligibility signal adds positive score.'
        : region.confidence === 'medium'
          ? 'Medium-confidence USFS / MVUM-access signal adds moderate score.'
          : 'Verify-level eligibility signal kept as low-confidence scouting only.',
      ...region.basis,
    ]).slice(0, 5),
    cautions: restrictions,
    distanceFromUserMiles: distanceFromCurrentLocationMiles(coordinate, input.currentLocation),
    distanceFromNearestRoadMiles: routeDistance,
    distanceFromRoadOrTrail: routeDistance,
    terrainConfidence,
    accessConfidence,
    legalityConfidence,
    remotenessScore: remotenessFor(region),
    safetyRiskScore: 18,
    environmentalRiskScore: 18,
    knownConflictRiskScore: 0,
    offlineEstimate: false,
    mapDataCompleteness: region.confidence === 'verify' ? 58 : 76,
    sourceLabel: 'ECS-Inferred',
    sourceNotes,
    legalityStatus: legalityStatusFor(region),
    warnings: restrictions,
    accessNotes: sourceNotes.join('; '),
    isPrivateLand: false,
    isProtectedArea: false,
    isClosed: false,
    noCamping: false,
    isEcsInferredEligibilityCandidate: true,
    dispersedCampingRegionId: region.id,
    eligibilityConfidence: region.confidence,
    landManager: region.landManager,
    accessBasis: sourceNotes,
    terrainBasis: [
      scoutCenter
        ? 'Candidate point was generated near the selected scout point; confirm slope, surface, and turnaround space in the field.'
        : 'Candidate point is the region center; confirm slope, surface, and turnaround space in the field.',
    ],
    restrictions,
    verificationWarning: ECS_INFERRED_CAMP_CANDIDATE_WARNING,
    routeDistanceMiles: routeDistance,
  };

  const scoredCandidate = scoreCampScoutCandidate(baseCandidate, {
    preferredMinimumRoadDistanceMiles: 0,
    preferredMaximumRoadDistanceMiles: 1,
  }, {
    filterMode: 'balanced',
    allowLowConfidenceFallback: true,
    expandedResults: true,
  });
  return {
    ...scoredCandidate,
    reasons: uniqueStrings([
      ...scoredCandidate.reasons,
      'Ranked by ECS against eligibility confidence, access, remoteness, route proximity, and terrain confidence.',
    ]).slice(0, 5),
  };
}

export function buildDispersedCampingCampScoutCandidates(
  input: DispersedCampingCandidateGenerationInput,
): DispersedCampingCandidateGenerationResult {
  const maxCandidates = Math.max(
    1,
    Math.min(MAX_INFERRED_CANDIDATE_LIMIT, Math.floor(input.maxCandidates ?? DEFAULT_INFERRED_CANDIDATE_LIMIT)),
  );
  const routeRank = new Map((input.routeNearbyRegions ?? []).map((result, index) => [result.regionId, index]));
  const candidateRegions = input.routeNearbyRegions?.length
    ? input.regions.filter((region) => routeRank.has(region.id))
    : input.regions;
  const rejectedRegionIds: string[] = [];
  const warnings = new Set<string>();
  const rawCandidates: CampScoutCandidate[] = [];

  for (const region of candidateRegions) {
    const assessment = assessDispersedCampingRegionForCandidate(region);
    assessment.warnings.forEach((warning) => warnings.add(warning));
    if (!assessment.accepted) {
      rejectedRegionIds.push(region.id);
      continue;
    }
    if (region.confidence === 'verify' && input.includeVerifyCandidates === false) {
      continue;
    }
    const scoutCoordinates = buildScoutCandidateCoordinates(region, input, maxCandidates);
    scoutCoordinates.forEach((coordinate, index) => {
      const candidate = buildCandidateFromRegion(region, assessment, input, coordinate, index);
      if (candidate) rawCandidates.push(candidate);
    });
  }

  const ranked = rankCampScoutCandidates(rawCandidates, {
    filterMode: 'balanced',
    sourceTypes: ['ecs_inferred'],
    includeUnknownSource: false,
    expandedResults: true,
    expandedLimit: maxCandidates,
    maximumCandidates: maxCandidates,
    allowLowConfidenceFallback: true,
    minimumLegalityConfidence: CAMP_SCOUT_MIN_LEGALITY_CONFIDENCE,
    minimumConfidenceScore: CAMP_SCOUT_MIN_DISPLAY_SCORE,
    minimumAccessConfidence: CAMP_SCOUT_MIN_ACCESS_CONFIDENCE,
    minimumRemotenessScore: CAMP_SCOUT_MIN_REMOTENESS_SCORE,
    maximumSlopeEstimate: CAMP_SCOUT_MAX_VIABLE_SLOPE_ESTIMATE,
    context: {
      preferredMinimumRoadDistanceMiles: 0,
      preferredMaximumRoadDistanceMiles: 1,
    },
  }).slice(0, maxCandidates);

  const filtered = ranked.filter(
    (candidate) =>
      candidate.confidenceScore >= CAMP_SCOUT_MIN_DISPLAY_SCORE &&
      candidate.accessConfidence >= CAMP_SCOUT_MIN_ACCESS_CONFIDENCE &&
      candidate.legalityConfidence >= CAMP_SCOUT_MIN_LEGALITY_CONFIDENCE &&
      candidate.remotenessScore >= CAMP_SCOUT_MIN_REMOTENESS_SCORE &&
      (candidate.terrainConfidence ?? 0) >= CAMP_SCOUT_MIN_TERRAIN_CONFIDENCE,
  );

  return {
    candidates: filtered.map((candidate) => ({
      ...candidate,
      reasons: uniqueStrings([
        ...candidate.reasons,
        'Ranked by ECS against eligibility confidence, access, remoteness, route proximity, and terrain confidence.',
      ]).slice(0, 5),
    })),
    rejectedRegionIds,
    warnings: Array.from(warnings),
    generatedAt: new Date().toISOString(),
  };
}

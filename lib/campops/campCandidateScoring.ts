import {
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
} from '../map/routeGeometryUtils';
import {
  ECS_INFERRED_CAMP_CANDIDATE_TITLE,
  ECS_INFERRED_CAMP_CANDIDATE_WARNING,
  type DispersedCampingCandidateGenerationInput,
  type DispersedCampingCandidateGenerationResult,
  type DispersedCampingEligibilityCandidateAssessment,
} from './campCandidateTypes';

const DEFAULT_INFERRED_CANDIDATE_LIMIT = 5;

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
  if (region.confidence === 'high') return 68;
  if (region.confidence === 'medium') return 64;
  return 56;
}

function remotenessFor(region: DispersedCampingRegion): number {
  if (region.landManager === 'BLM') return 74;
  if (region.landManager === 'USFS') return 78;
  return 62;
}

function distanceFromCurrentLocationMiles(
  region: DispersedCampingRegion,
  currentLocation: DispersedCampingCandidateGenerationInput['currentLocation'],
): number | undefined {
  const centroid = getGeometryCentroid(region.geometry);
  const current = normalizeRouteCoordinate(currentLocation);
  if (!centroid || !current) return undefined;
  return Math.round(haversineDistanceMiles(centroid, current) * 10) / 10;
}

function distanceFromRouteMiles(
  region: DispersedCampingRegion,
  routeCoordinates: DispersedCampingCandidateGenerationInput['routeCoordinates'],
): number | undefined {
  const centroid = getGeometryCentroid(region.geometry);
  if (!centroid) return undefined;
  const distance = distancePointToRouteMiles(centroid, routeCoordinates);
  return typeof distance === 'number' ? Math.round(distance * 10) / 10 : undefined;
}

function buildCandidateFromRegion(
  region: DispersedCampingRegion,
  assessment: DispersedCampingEligibilityCandidateAssessment,
  input: DispersedCampingCandidateGenerationInput,
): CampScoutCandidate | null {
  const centroid = getGeometryCentroid(region.geometry);
  if (!centroid) return null;

  const routeDistance =
    input.routeNearbyRegions?.find((result) => result.regionId === region.id)?.distanceFromRouteMiles ??
    distanceFromRouteMiles(region, input.routeCoordinates);
  const legalityConfidence = assessment.eligibilityScore;
  const accessConfidence = accessConfidenceFor(region);
  const terrainConfidence = terrainConfidenceFor(region);
  const sourceNotes = uniqueStrings([
    `${region.landManager} eligibility region`,
    ...region.basis,
    routeDistance != null ? `${routeDistance} mi from route corridor` : null,
  ]);
  const restrictions = uniqueStrings([
    ...assessment.warnings,
    region.confidence === 'verify' ? 'Eligibility requires local verification before use.' : null,
  ]);

  const baseCandidate: CampScoutCandidate = {
    id: `ecs-eligibility-${region.id}`,
    coordinate: {
      latitude: centroid.latitude,
      longitude: centroid.longitude,
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
      proximity: routeDistance != null && routeDistance <= 5 ? 82 : 62,
      confidence: 0,
      total: 0,
    },
    reasons: uniqueStrings([
      'Candidate scouting location inside a dispersed camping eligibility region.',
      region.confidence === 'high'
        ? 'High-confidence BLM eligibility signal adds positive score.'
        : region.confidence === 'medium'
          ? 'Medium-confidence USFS / MVUM-access signal adds moderate score.'
          : 'Verify-level eligibility signal kept as low-confidence scouting only.',
      ...region.basis,
    ]).slice(0, 5),
    cautions: restrictions,
    distanceFromUserMiles: distanceFromCurrentLocationMiles(region, input.currentLocation),
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
    terrainBasis: ['Candidate point is the region center; confirm slope, surface, and turnaround space in the field.'],
    restrictions,
    verificationWarning: ECS_INFERRED_CAMP_CANDIDATE_WARNING,
    routeDistanceMiles: routeDistance,
  };

  return scoreCampScoutCandidate(baseCandidate, {
    preferredMinimumRoadDistanceMiles: 0.05,
    preferredMaximumRoadDistanceMiles: 5,
  }, {
    filterMode: 'balanced',
    allowLowConfidenceFallback: true,
    expandedResults: true,
  });
}

export function buildDispersedCampingCampScoutCandidates(
  input: DispersedCampingCandidateGenerationInput,
): DispersedCampingCandidateGenerationResult {
  const maxCandidates = Math.max(1, Math.min(5, Math.floor(input.maxCandidates ?? DEFAULT_INFERRED_CANDIDATE_LIMIT)));
  const routeRank = new Map((input.routeNearbyRegions ?? []).map((result, index) => [result.regionId, index]));
  const routeDistance = new Map(
    (input.routeNearbyRegions ?? []).map((result) => [result.regionId, result.distanceFromRouteMiles ?? Number.POSITIVE_INFINITY]),
  );
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
    const candidate = buildCandidateFromRegion(region, assessment, input);
    if (candidate) rawCandidates.push(candidate);
  }

  const ranked = rankCampScoutCandidates(rawCandidates, {
    filterMode: 'balanced',
    sourceTypes: ['ecs_inferred'],
    includeUnknownSource: false,
    expandedResults: true,
    expandedLimit: maxCandidates,
    maximumCandidates: maxCandidates,
    allowLowConfidenceFallback: true,
    minimumLegalityConfidence: undefined,
    context: {
      preferredMinimumRoadDistanceMiles: 0.05,
      preferredMaximumRoadDistanceMiles: 5,
    },
  }).sort((left, right) => {
    const leftRouteRank = routeRank.get(left.dispersedCampingRegionId ?? '') ?? Number.POSITIVE_INFINITY;
    const rightRouteRank = routeRank.get(right.dispersedCampingRegionId ?? '') ?? Number.POSITIVE_INFINITY;
    if (leftRouteRank !== rightRouteRank) return leftRouteRank - rightRouteRank;

    const leftDistance = routeDistance.get(left.dispersedCampingRegionId ?? '') ?? left.routeDistanceMiles ?? Number.POSITIVE_INFINITY;
    const rightDistance = routeDistance.get(right.dispersedCampingRegionId ?? '') ?? right.routeDistanceMiles ?? Number.POSITIVE_INFINITY;
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;

    return right.confidenceScore - left.confidenceScore;
  }).slice(0, maxCandidates);

  return {
    candidates: ranked,
    rejectedRegionIds,
    warnings: Array.from(warnings),
    generatedAt: new Date().toISOString(),
  };
}

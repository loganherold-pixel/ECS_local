import {
  analyzeCampsiteCandidates,
  analyzePolygonCampsiteCandidates,
  campsiteCandidateEngine,
  scoreCampsiteCandidates,
  type CampsiteCandidate as EngineCampsiteCandidate,
  type CampsiteCandidateResult,
  type RemotenessSnapshot,
} from '../campsiteCandidateEngine';
import {
  withCampOpsSearchPayload,
  type CampOpsSearchIntegrationOptions,
} from '../campops/campOpsSearchIntegration';
import type { RouteIntelligence } from '../routeAnalysisEngine';
import type { TerrainIntelligence } from '../terrainAnalysisEngine';
import {
  CampsiteFallbackStage,
  MAX_CAMPSITE_MARKERS,
  getCampsiteFallbackStageDefinition,
  normalizeCampsiteScore,
} from './campsiteThresholds';
import {
  campsiteRatingFromScore,
  campsiteRatingImpactFromScore,
  type CampsiteRating,
  type CampsiteRatingFactor,
} from './campsiteRatingTypes';
import { ecsLog } from '../ecsLogger';

export { MAX_CAMPSITE_MARKERS };

export const MAJOR_ROADWAY_EXCLUSION_MILES = 1;
export const ROUTE_CAMPSITE_BUFFER_MILES = 0.5;
export const ROUTE_CAMPSITE_MIN_CONFIDENCE_SCORE = 55;
export const POLYGON_ADJACENT_CAMP_BUFFER_MILES = 0.5;
export const DRAW_AREA_CAMPSITE_MIN_CONFIDENCE_SCORE = 55;
const DRIVABLE_TRAIL_ACCESS_SCORE_BONUS = 8;

function logCampsiteLocatorDebug(event: string, details?: Record<string, unknown>): void {
  ecsLog.dev('CAMPOPS', event, details, {
    tag: '[CAMPSITE_CANDIDATE]',
    debugFlag: 'ECS_DEBUG_CAMP',
    fingerprint: `${event}:${JSON.stringify(details ?? {})}`,
    throttleMs: 2500,
    aggregateWindowMs: 30_000,
  });
}

/**
 * Central campsite marker locator.
 *
 * Valid campsite population paths:
 * 1. Route overview: route proximity is an eligibility filter, then campsite score selects the top candidates.
 * 2. Completed polygon drawing: only candidates inside the polygon are eligible, then remoteness/campsite score selects the top candidates.
 *
 * All public locator outputs are capped by MAX_CAMPSITE_MARKERS (5) before reaching map payloads.
 */

export type CoordinateLike =
  | { latitude: number; longitude: number }
  | { lat: number; lng: number }
  | [number, number];

export interface CampsiteCandidate {
  id: string;
  name?: string | null;
  label?: string | null;
  latitude: number;
  longitude: number;
  rating?: CampsiteRating;
  score: number;
  remotenessScore?: number | null;
  campingSuitabilityScore?: number | null;
  legalAccessScore?: number | null;
  terrainScore?: number | null;
  routeProximityScore?: number | null;
  ratingFactors?: CampsiteRatingFactor[];
  viabilityTier?: string | null;
  viabilityConfidenceLabel?: string | null;
  distanceFromRouteMiles?: number | null;
  distanceFromRoadwayMiles?: number | null;
  nearestRoadwayMiles?: number | null;
  nearestMajorRoadMiles?: number | null;
  nearestPavedRoadMiles?: number | null;
  accessType?: string | null;
  roadClass?: string | null;
  source?: string | null;
  sourceType?: 'official' | 'inferred' | 'community' | 'fallback' | string | null;
  legalityStatus?:
    | 'verified_allowed'
    | 'likely_allowed_needs_verification'
    | 'unknown_needs_verification'
    | 'restricted_or_not_allowed'
    | string
    | null;
  warnings?: string[];
  reasons?: string[];
  confidenceLabel?: string | null;
  distanceFromRoadOrTrail?: number | null;
  slope?: number | null;
  accessNotes?: string | null;
  explanation?: string | null;
  reason?: string | null;
}

export type { CampsiteRating, CampsiteRatingFactor };

export interface RouteCampsiteLocatorInput {
  routeId: string;
  routeGeometry?: CoordinateLike[] | null;
  routeCoordinates?: CoordinateLike[] | null;
  routeIntelligence?: RouteIntelligence | null;
  terrainIntelligence?: TerrainIntelligence | null;
  remotenessSnapshot?: RemotenessSnapshot | null;
  routeSourceType?: string | null;
  routeMetadata?: Record<string, unknown> | null;
  vehicleProfile?: unknown;
  searchRadiusMiles?: number | null;
  routeBufferMiles?: number | null;
  candidates?: unknown[] | null;
  campopsRecommendationsEnabled?: boolean | null;
  campOps?: Omit<CampOpsSearchIntegrationOptions, 'source' | 'enabled' | 'vehicleProfile'> | null;
}

export interface PolygonCampsiteLocatorInput {
  polygonCoordinates: CoordinateLike[];
  mapViewport?: unknown;
  terrainIntelligence?: TerrainIntelligence | null;
  remotenessSnapshot?: RemotenessSnapshot | null;
  vehicleProfile?: unknown;
  candidates?: unknown[] | null;
  polygonId?: string | null;
  routeName?: string | null;
  campopsRecommendationsEnabled?: boolean | null;
  campOps?: Omit<CampOpsSearchIntegrationOptions, 'source' | 'enabled' | 'vehicleProfile'> | null;
}

type LocatorMode = 'route' | 'polygon';
type NormalizedCoordinate = { latitude: number; longitude: number };
type RouteCorridorSample = NormalizedCoordinate & { distanceMiles: number; progress: number };
type CampsiteHardExclusionReason =
  | 'private_land'
  | 'protected_restricted_closed'
  | 'legal_status_restricted'
  | 'unsafe_terrain';

function isFiniteLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isFiniteLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function normalizeCoordinate(value: unknown): NormalizedCoordinate | null {
  if (Array.isArray(value)) {
    const latitude = Number(value[0]);
    const longitude = Number(value[1]);
    return isFiniteLatitude(latitude) && isFiniteLongitude(longitude)
      ? { latitude, longitude }
      : null;
  }
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const latitude = Number(candidate.latitude ?? candidate.lat);
  const longitude = Number(candidate.longitude ?? candidate.lng ?? candidate.lon);
  return isFiniteLatitude(latitude) && isFiniteLongitude(longitude)
    ? { latitude, longitude }
    : null;
}

export function normalizeRouteCoordinates(
  routeCoordinates?: CoordinateLike[] | null,
  routeIntelligence?: RouteIntelligence | null,
): NormalizedCoordinate[] {
  const explicit = Array.isArray(routeCoordinates) ? routeCoordinates : [];
  const fromRouteIntelligence =
    routeIntelligence?.segments
      ?.map((segment) => segment.coordinates)
      .filter(Boolean) ?? [];
  return [...explicit, ...fromRouteIntelligence]
    .map(normalizeCoordinate)
    .filter((point): point is NormalizedCoordinate => !!point);
}

function getCandidateId(candidate: unknown): string | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const record = candidate as Record<string, unknown>;
  const rawId = record.id ?? record.candidateId ?? record.siteId;
  return typeof rawId === 'string' && rawId.trim() ? rawId.trim() : null;
}

function getCandidateCoordinate(candidate: unknown): NormalizedCoordinate | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const record = candidate as Record<string, unknown>;
  return (
    normalizeCoordinate(record) ??
    normalizeCoordinate(record.coordinate) ??
    normalizeCoordinate(record.coordinates)
  );
}

function getCandidateScore(candidate: unknown): number {
  if (!candidate || typeof candidate !== 'object') return 0;
  const record = candidate as Record<string, unknown>;
  const score = Number(
    record.score ??
      record.suitabilityScore ??
      record.campingSuitabilityScore ??
      record.overallScore ??
      record.qualityScore ??
      record.remotenessScore ??
      0,
  );
  return Number.isFinite(score) ? score : 0;
}

function getRouteDistance(candidate: unknown): number | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const record = candidate as Record<string, unknown>;
  const distance = Number(record.distanceFromRouteMiles);
  return Number.isFinite(distance) ? distance : null;
}

function readTrimmedText(record: Record<string, unknown>, keys: string[]): string {
  return keys
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase())
    .join(' ');
}

function getAccessDescriptor(candidate: unknown): string {
  if (!candidate || typeof candidate !== 'object') return '';
  const record = candidate as Record<string, unknown>;
  return readTrimmedText(record, [
    'accessType',
    'accessKind',
    'accessClass',
    'roadClass',
    'routeClass',
    'nearestAccessType',
    'nearestRoadType',
    'surface',
    'roadSurface',
    'source',
    'category',
  ]);
}

function isDrivableTrailDescriptor(descriptor: string): boolean {
  return /drivable trail|off[-\s]?road|4x4|four[-\s]?wheel|ohv|jeep|forest road|fire road|service road|dirt road|gravel road|unimproved road|unpaved|trail/.test(descriptor);
}

function isMajorRoadwayDescriptor(descriptor: string): boolean {
  if (!descriptor || isDrivableTrailDescriptor(descriptor)) return false;
  return /highway|freeway|interstate|paved road|major road|arterial|residential|urban|city street|street|roadway|asphalt|pavement|primary road|secondary road/.test(descriptor);
}

function isRoadwayRouteSource(routeSourceType?: string | null): boolean {
  return routeSourceType === 'road';
}

function isDrivableTrailRouteSource(routeSourceType?: string | null): boolean {
  return routeSourceType === 'trail' || routeSourceType === 'hybrid' || routeSourceType === 'explore';
}

function routeMetadataSupportsDispersedCamping(metadata?: Record<string, unknown> | null): boolean {
  if (!metadata) return false;
  const suggestedCamps = Number(metadata.suggestedCamps);
  const text = [
    metadata.terrainType,
    metadata.campSuitability,
    metadata.cautionNotes,
    metadata.routeType,
    metadata.category,
    metadata.source,
    Array.isArray(metadata.highlights) ? metadata.highlights.join(' ') : null,
  ]
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .join(' ')
    .toLowerCase();

  return (
    (Number.isFinite(suggestedCamps) && suggestedCamps > 0) ||
    /dispersed camp|dispersed camping|camp access|forest road|fire road|service road|4x4|ohv|off[-\s]?road|primitive road|unimproved|unpaved|dirt|gravel/.test(text)
  );
}

function hasSupportedRoadRouteCampingSignal(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  const record = candidate as Record<string, unknown>;
  return (
    record.routeCampAccessSupport === true ||
    record.publicLandEligibility === true ||
    record.dispersedCampingEligible === true ||
    record.hasMvumAccessNearby === true ||
    record.officialMappedCampAccess === true
  );
}

function isCampingAppropriateRouteCandidate(
  candidate: unknown,
  options: { routeSourceType?: string | null } = {},
): boolean {
  const descriptor = getAccessDescriptor(candidate);
  if (isRoadwayRouteSource(options.routeSourceType)) {
    return isDrivableTrailDescriptor(descriptor) || hasSupportedRoadRouteCampingSignal(candidate);
  }
  return true;
}

function getPolygonRemotenessScore(candidate: unknown): number {
  if (!candidate || typeof candidate !== 'object') return 0;
  const record = candidate as Record<string, unknown>;
  const score = Number(record.remotenessScore ?? record.suitabilityScore ?? record.score ?? 0);
  return Number.isFinite(score) ? score : 0;
}

function readFiniteNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function getMajorRoadwayDistance(candidate: unknown, options: { routeSourceType?: string | null } = {}): number | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const record = candidate as Record<string, unknown>;
  const explicitRoadwayDistance = readFiniteNumber(record, [
    'distanceFromRoadwayMiles',
    'roadwayDistanceMiles',
    'nearestRoadwayMiles',
    'nearestMajorRoadMiles',
    'majorRoadDistanceMiles',
    'distanceToMajorRoadMiles',
    'nearestPavedRoadMiles',
    'nearestPavedRoadDistanceMiles',
    'distanceToPavedRoadMiles',
    'pavedRoadDistanceMiles',
    'distanceToHighwayMiles',
    'highwayDistanceMiles',
  ]);
  if (explicitRoadwayDistance != null) return explicitRoadwayDistance;

  const descriptor = getAccessDescriptor(candidate);
  if (isMajorRoadwayDescriptor(descriptor)) {
    return (
      readFiniteNumber(record, [
        'distanceFromAccessMiles',
        'nearestAccessMiles',
        'accessDistanceMiles',
        'roadDistanceMiles',
        'nearestRoadMiles',
      ]) ?? getRouteDistance(candidate)
    );
  }

  if (isRoadwayRouteSource(options.routeSourceType) && !hasSupportedRoadRouteCampingSignal(candidate)) {
    return getRouteDistance(candidate);
  }

  return null;
}

function isExcludedByMajorRoadway(candidate: unknown, options: { routeSourceType?: string | null } = {}): boolean {
  const distance = getMajorRoadwayDistance(candidate, options);
  return distance != null && distance <= MAJOR_ROADWAY_EXCLUSION_MILES;
}

function readStringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function isHardRestrictedCampsite(candidate: unknown): boolean {
  return getHardCampsiteExclusionReason(candidate) != null;
}

function readRestrictionStatusText(candidate: unknown): string {
  if (!candidate || typeof candidate !== 'object') return '';
  const record = candidate as Record<string, unknown>;
  return [
    readStringField(record, ['legalityStatus', 'legalStatus', 'landStatus', 'accessStatus', 'closureStatus']),
    readStringField(record, ['ownership', 'restrictionStatus', 'campingStatus']),
    readStringField(record, ['terrainStatus', 'safetyStatus']),
  ]
    .filter((value): value is string => !!value)
    .join(' ')
    .toLowerCase();
}

function isKnownPrivateLand(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  const record = candidate as Record<string, unknown>;
  const status = readRestrictionStatusText(candidate);
  return (
    record.isPrivateLand === true ||
    record.privateLand === true ||
    (status.includes('private') && !status.includes('not private') && !status.includes('non-private'))
  );
}

function isKnownProtectedRestrictedClosed(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  const record = candidate as Record<string, unknown>;
  const status = readRestrictionStatusText(candidate);
  if (
    record.isProtectedArea === true ||
    record.protectedArea === true ||
    record.isClosed === true ||
    record.closed === true ||
    record.noCamping === true
  ) {
    return true;
  }

  if (!status) return false;
  return (
    status.includes('protected') ||
    status.includes('closed') ||
    status.includes('no camping') ||
    status.includes('not allowed') ||
    status.includes('prohibited')
  );
}

function isRestrictedByLegalStatus(candidate: unknown): boolean {
  const status = readRestrictionStatusText(candidate);
  return status.includes('restricted_or_not_allowed');
}

function isKnownUnsafeTerrain(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  const record = candidate as Record<string, unknown>;
  if (record.unsafeTerrain === true || record.terrainUnsafe === true) return true;
  const status = readRestrictionStatusText(candidate);
  if (status.includes('unsafe terrain') || status.includes('terrain unsafe')) return true;
  const slope = readFiniteNumber(record, ['slope', 'slopeEstimate']);
  return slope != null && slope > 30;
}

function getHardCampsiteExclusionReason(candidate: unknown): CampsiteHardExclusionReason | null {
  if (isKnownPrivateLand(candidate)) return 'private_land';
  if (isKnownProtectedRestrictedClosed(candidate)) return 'protected_restricted_closed';
  if (isRestrictedByLegalStatus(candidate)) return 'legal_status_restricted';
  if (isKnownUnsafeTerrain(candidate)) return 'unsafe_terrain';
  return null;
}

function isNearDrivableTrailAccess(candidate: unknown, options: { routeSourceType?: string | null } = {}): boolean {
  const descriptor = getAccessDescriptor(candidate);
  return isDrivableTrailDescriptor(descriptor) || isDrivableTrailRouteSource(options.routeSourceType);
}

function appendUniqueReason(reasons: string[], reason: string): void {
  if (!reasons.some((existing) => existing.toLowerCase() === reason.toLowerCase())) {
    reasons.push(reason);
  }
}

function withAccessReasonMetadata<T>(
  candidate: T,
  options: { routeSourceType?: string | null } = {},
): T {
  if (!candidate || typeof candidate !== 'object') return candidate;
  const record = candidate as Record<string, unknown>;
  const existingReasons = Array.isArray(record.candidateReason)
    ? record.candidateReason.filter((reason): reason is string => typeof reason === 'string')
    : [];
  const candidateReason = [...existingReasons];
  const roadwayDistance = getMajorRoadwayDistance(candidate, options);

  if (roadwayDistance != null && roadwayDistance > MAJOR_ROADWAY_EXCLUSION_MILES) {
    appendUniqueReason(candidateReason, 'Remote from major roadways');
  }
  if (isNearDrivableTrailAccess(candidate, options)) {
    appendUniqueReason(candidateReason, 'Near drivable trail access');
  }

  return {
    ...record,
    candidateReason,
  } as T;
}

function withSupportedRoadRouteCampsiteMetadata(
  result: CampsiteCandidateResult,
): CampsiteCandidateResult {
  const applySupport = (candidate: EngineCampsiteCandidate): EngineCampsiteCandidate => {
    const record = candidate as EngineCampsiteCandidate & {
      accessType?: unknown;
      source?: unknown;
    };
    const reasons = Array.isArray(candidate.candidateReason)
      ? candidate.candidateReason.filter((reason): reason is string => typeof reason === 'string')
      : [];
    return {
      ...candidate,
      routeCampAccessSupport: true,
      publicLandEligibility: true,
      dispersedCampingEligible: true,
      legalityStatus: 'likely_allowed_needs_verification',
      accessType:
        typeof record.accessType === 'string' && record.accessType.trim().length > 0
          ? record.accessType
          : 'supported forest-road route corridor inferred',
      source:
        typeof record.source === 'string' && record.source.trim().length > 0
          ? record.source
          : 'route_analysis',
      candidateReason: [
        ...reasons,
        ...(reasons.some((reason) =>
          reason.toLowerCase().includes('route metadata indicates dispersed camping'),
        )
          ? []
          : ['Route metadata indicates dispersed camping or public-access forest-road context']),
        ...(reasons.some((reason) =>
          reason.toLowerCase().includes('legal/access status requires'),
        )
          ? []
          : ['Legal/access status requires provider or field verification']),
      ],
    } as EngineCampsiteCandidate;
  };

  return {
    ...result,
    candidates: result.candidates.map(applySupport),
    suggestedCampsites: result.suggestedCampsites.map(applySupport),
  };
}

function getCandidateRankScore(
  candidate: unknown,
  mode: LocatorMode,
): number {
  const descriptor = getAccessDescriptor(candidate);
  const trailAccessBonus =
    mode === 'route' && isDrivableTrailDescriptor(descriptor)
      ? DRIVABLE_TRAIL_ACCESS_SCORE_BONUS
      : 0;
  return getCandidateScore(candidate) + trailAccessBonus;
}

function toDisplayScore(candidate: unknown): number {
  if (!candidate || typeof candidate !== 'object') return 0;
  const record = candidate as Record<string, unknown>;
  const explicitScore = readFiniteNumber(record, ['score', 'overallScore']);
  if (explicitScore != null) return Math.max(0, Math.min(100, explicitScore));
  const categoryScores = [
    readFiniteNumber(record, ['remotenessScore']),
    readFiniteNumber(record, ['campingSuitabilityScore']),
    readFiniteNumber(record, ['legalAccessScore']),
    readFiniteNumber(record, ['terrainScore']),
    readFiniteNumber(record, ['routeProximityScore']),
    readFiniteNumber(record, ['confidenceScore']),
  ].filter((value): value is number => value != null && Number.isFinite(value));
  if (categoryScores.length > 0) {
    const average =
      categoryScores.reduce((total, value) => total + Math.max(0, Math.min(100, value)), 0) /
      categoryScores.length;
    return Math.max(0, Math.min(100, Math.round(average)));
  }
  const suitabilityScore = readFiniteNumber(record, ['suitabilityScore', 'campingSuitabilityScore']);
  if (suitabilityScore != null) return Math.round(normalizeCampsiteScore(suitabilityScore) * 100);
  const qualityScore = readFiniteNumber(record, ['qualityScore']);
  return qualityScore != null ? Math.max(0, Math.min(100, Math.round(qualityScore))) : 0;
}

function toPercentScore(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatFactorValue(value: number | null): string | undefined {
  return value == null ? undefined : `${value}/100`;
}

function buildRatingFactorsForCandidate(candidate: unknown): CampsiteRatingFactor[] {
  if (!candidate || typeof candidate !== 'object') return [];
  const record = candidate as Record<string, unknown>;
  if (Array.isArray(record.ratingFactors) && record.ratingFactors.length > 0) {
    return record.ratingFactors.filter(
      (factor): factor is CampsiteRatingFactor =>
        !!factor && typeof factor === 'object' && typeof (factor as Record<string, unknown>).label === 'string',
    );
  }

  const breakdown =
    record.scoringBreakdown && typeof record.scoringBreakdown === 'object'
      ? (record.scoringBreakdown as Record<string, unknown>)
      : {};
  const factors: CampsiteRatingFactor[] = [];

  const suitabilityPercent = toPercentScore(normalizeCampsiteScore(getCandidateScore(candidate)) * 100);
  if (suitabilityPercent != null) {
    factors.push({
      label: 'Camping suitability',
      value: formatFactorValue(suitabilityPercent),
      impact: campsiteRatingImpactFromScore(suitabilityPercent),
      description: 'Existing campsite suitability score from timing, terrain, and route-day fit.',
    });
  }

  const qualityScore = toPercentScore(readFiniteNumber(record, ['qualityScore']));
  if (qualityScore != null) {
    factors.push({
      label: 'Terrain suitability',
      value: formatFactorValue(qualityScore),
      impact: campsiteRatingImpactFromScore(qualityScore),
      description: 'Existing terrain quality score from the candidate segment.',
    });
  }

  const remotenessBonus = readFiniteNumber(breakdown, ['remotenessBonus']);
  if (remotenessBonus != null) {
    const remotenessScore = toPercentScore((remotenessBonus / 3) * 100);
    factors.push({
      label: 'Remoteness',
      value: formatFactorValue(remotenessScore),
      impact: campsiteRatingImpactFromScore(remotenessScore),
      description: 'Higher remoteness improves dispersed-camping quality in the current scoring model.',
    });
  }

  const timingBonus = readFiniteNumber(breakdown, ['idealTimingBonus', 'timingBonus']);
  if (timingBonus != null) {
    const timingScore = toPercentScore(((timingBonus + 3) / 7) * 100);
    factors.push({
      label: 'Camp timing',
      value: formatFactorValue(timingScore),
      impact: campsiteRatingImpactFromScore(timingScore),
      description: 'Timing reflects whether this stop falls in the existing ideal or acceptable camp window.',
    });
  }

  return factors.slice(0, 5);
}

function enrichCampsiteCandidateForRating<T>(candidate: T): T {
  if (!candidate || typeof candidate !== 'object') return candidate;
  const record = candidate as Record<string, unknown>;
  const score = toDisplayScore(candidate);
  const terrainScore = toPercentScore(readFiniteNumber(record, ['terrainScore', 'qualityScore']));
  const campingSuitabilityScore = toPercentScore(normalizeCampsiteScore(getCandidateScore(candidate)) * 100);
  const rating = typeof record.rating === 'string' && /^[ABCD]$/.test(record.rating)
    ? (record.rating as CampsiteRating)
    : campsiteRatingFromScore(score);

  return {
    ...record,
    rating,
    score,
    remotenessScore: readFiniteNumber(record, ['remotenessScore']) ?? undefined,
    campingSuitabilityScore,
    terrainScore,
    legalAccessScore: readFiniteNumber(record, ['legalAccessScore']) ?? undefined,
    routeProximityScore: readFiniteNumber(record, ['routeProximityScore']) ?? undefined,
    distanceFromRoadwayMiles: getMajorRoadwayDistance(record),
    nearestRoadwayMiles: readFiniteNumber(record, ['nearestRoadwayMiles', 'roadwayDistanceMiles']) ?? undefined,
    nearestMajorRoadMiles: readFiniteNumber(record, ['nearestMajorRoadMiles', 'majorRoadDistanceMiles']) ?? undefined,
    nearestPavedRoadMiles: readFiniteNumber(record, ['nearestPavedRoadMiles', 'nearestPavedRoadDistanceMiles']) ?? undefined,
    accessType: typeof record.accessType === 'string' ? record.accessType : undefined,
    roadClass: typeof record.roadClass === 'string' ? record.roadClass : undefined,
    ratingFactors: buildRatingFactorsForCandidate(record),
  } as T;
}

function haversineMiles(a: NormalizedCoordinate, b: NormalizedCoordinate): number {
  const radiusMiles = 3958.8;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function approximateDistancePointToSegmentMiles(
  point: NormalizedCoordinate,
  start: NormalizedCoordinate,
  end: NormalizedCoordinate,
): number {
  const milesPerDegreeLat = 69;
  const milesPerDegreeLon = Math.cos((point.latitude * Math.PI) / 180) * 69;
  const px = point.longitude * milesPerDegreeLon;
  const py = point.latitude * milesPerDegreeLat;
  const sx = start.longitude * milesPerDegreeLon;
  const sy = start.latitude * milesPerDegreeLat;
  const ex = end.longitude * milesPerDegreeLon;
  const ey = end.latitude * milesPerDegreeLat;
  const dx = ex - sx;
  const dy = ey - sy;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq <= 0) return haversineMiles(point, start);

  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSq));
  const closest = {
    latitude: (sy + t * dy) / milesPerDegreeLat,
    longitude: (sx + t * dx) / milesPerDegreeLon,
  };
  return haversineMiles(point, closest);
}

export function distancePointToRoutePolyline(
  point: CoordinateLike,
  routeCoordinates: CoordinateLike[],
): number {
  const normalizedPoint = normalizeCoordinate(point);
  const route = routeCoordinates
    .map(normalizeCoordinate)
    .filter((coordinate): coordinate is NormalizedCoordinate => !!coordinate);
  if (!normalizedPoint || route.length === 0) return Number.POSITIVE_INFINITY;
  if (route.length === 1) return haversineMiles(normalizedPoint, route[0]);

  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < route.length; index += 1) {
    bestDistance = Math.min(
      bestDistance,
      approximateDistancePointToSegmentMiles(normalizedPoint, route[index - 1], route[index]),
    );
  }
  return bestDistance;
}

function routePolylineDistanceMiles(routeCoordinates: NormalizedCoordinate[]): number {
  let total = 0;
  for (let index = 1; index < routeCoordinates.length; index += 1) {
    total += haversineMiles(routeCoordinates[index - 1], routeCoordinates[index]);
  }
  return total;
}

function coordinateAtRouteDistance(
  routeCoordinates: NormalizedCoordinate[],
  targetDistanceMiles: number,
): NormalizedCoordinate | null {
  if (routeCoordinates.length === 0) return null;
  if (targetDistanceMiles <= 0) return routeCoordinates[0];

  let traveled = 0;
  for (let index = 1; index < routeCoordinates.length; index += 1) {
    const start = routeCoordinates[index - 1];
    const end = routeCoordinates[index];
    const segmentDistance = haversineMiles(start, end);
    if (segmentDistance <= 0) continue;

    if (traveled + segmentDistance >= targetDistanceMiles) {
      const ratio = (targetDistanceMiles - traveled) / segmentDistance;
      return {
        latitude: start.latitude + (end.latitude - start.latitude) * ratio,
        longitude: start.longitude + (end.longitude - start.longitude) * ratio,
      };
    }
    traveled += segmentDistance;
  }

  return routeCoordinates[routeCoordinates.length - 1];
}

function sampleRouteCorridorPoints(
  routeCoordinates: NormalizedCoordinate[],
  routeBufferMiles?: number | null,
): RouteCorridorSample[] {
  if (routeCoordinates.length < 2) return [];

  const totalDistance = routePolylineDistanceMiles(routeCoordinates);
  if (!Number.isFinite(totalDistance) || totalDistance <= 0) return [];

  const intervalMiles = Math.max(1.5, Math.min(5, (routeBufferMiles ?? ROUTE_CAMPSITE_BUFFER_MILES) * 4));
  const targetDistances = new Set<number>([0, totalDistance / 2, totalDistance]);
  for (let distance = intervalMiles; distance < totalDistance; distance += intervalMiles) {
    targetDistances.add(distance);
  }

  const samples: RouteCorridorSample[] = [];
  const seen = new Set<string>();
  [...targetDistances]
    .sort((a, b) => a - b)
    .forEach((distanceMiles) => {
      const coordinate = coordinateAtRouteDistance(routeCoordinates, distanceMiles);
      if (!coordinate) return;
      const key = coordinateDedupeKey(coordinate);
      if (seen.has(key)) return;
      seen.add(key);
      samples.push({
        ...coordinate,
        distanceMiles: Math.round(distanceMiles * 10) / 10,
        progress: totalDistance > 0 ? distanceMiles / totalDistance : 0,
      });
    });

  return samples;
}

function distancePointToPolygonBoundaryMiles(
  point: NormalizedCoordinate,
  polygonCoordinates: CoordinateLike[],
): number {
  const polygon = polygonCoordinates
    .map(normalizeCoordinate)
    .filter((coordinate): coordinate is NormalizedCoordinate => !!coordinate);
  if (polygon.length < 3) return Number.POSITIVE_INFINITY;
  return distancePointToRoutePolyline(point, [...polygon, polygon[0]]);
}

export function pointInPolygon(point: CoordinateLike, polygonCoordinates: CoordinateLike[]): boolean {
  const normalizedPoint = normalizeCoordinate(point);
  const polygon = polygonCoordinates
    .map(normalizeCoordinate)
    .filter((coordinate): coordinate is NormalizedCoordinate => !!coordinate);

  if (!normalizedPoint || polygon.length < 3) return false;

  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index++) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const intersects =
      current.latitude > normalizedPoint.latitude !== previous.latitude > normalizedPoint.latitude &&
      normalizedPoint.longitude <
        ((previous.longitude - current.longitude) *
          (normalizedPoint.latitude - current.latitude)) /
          ((previous.latitude - current.latitude) || 1e-9) +
          current.longitude;
    if (intersects) inside = !inside;
  }
  return inside;
}

function coordinateDedupeKey(coordinate: NormalizedCoordinate): string {
  return `${coordinate.latitude.toFixed(4)}:${coordinate.longitude.toFixed(4)}`;
}

function dedupeCandidates<T>(candidates: T[]): T[] {
  const seenIds = new Set<string>();
  const seenCoordinates = new Set<string>();
  const output: T[] = [];

  for (const candidate of candidates) {
    const coordinate = getCandidateCoordinate(candidate);
    if (!coordinate) continue;
    const id = getCandidateId(candidate);
    const coordinateKey = coordinateDedupeKey(coordinate);
    if ((id && seenIds.has(id)) || seenCoordinates.has(coordinateKey)) continue;
    if (id) seenIds.add(id);
    seenCoordinates.add(coordinateKey);
    output.push(candidate);
  }

  return output;
}

function getCandidateSourceDescriptor(candidate: unknown): string {
  if (!candidate || typeof candidate !== 'object') return '';
  const record = candidate as Record<string, unknown>;
  return readTrimmedText(record, ['sourceType', 'source', 'category', 'siteType', 'type']);
}

function hasOfficialCampsiteSignal(candidate: unknown): boolean {
  const descriptor = getCandidateSourceDescriptor(candidate);
  return (
    descriptor.includes('official') ||
    descriptor.includes('official_mapped') ||
    descriptor.includes('mapped campsite') ||
    descriptor.includes('campground_poi') ||
    descriptor.includes('established_campground')
  );
}

function isCampsiteFilterDebugEnabled(): boolean {
  return (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    (((globalThis as typeof globalThis & { __ECS_CAMP_DEBUG__?: boolean }).__ECS_CAMP_DEBUG__ === true) ||
      (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_ECS_CAMP_DEBUG === '1'))
  );
}

function logCampsiteFilterStageCounts(payload: Record<string, unknown>): void {
  if (isCampsiteFilterDebugEnabled()) {
    console.log('[CAMPSITE_CANDIDATE]', 'filter_stage_counts', payload);
  }
}

export function rankAndLimitCampsites<T>(
  candidates: T[],
  mode: LocatorMode,
  options: {
    routeCoordinates?: CoordinateLike[] | null;
    routeBufferMiles?: number | null;
    routeSourceType?: string | null;
    polygonCoordinates?: CoordinateLike[] | null;
  } = {},
): T[] {
  const routeCoordinates = options.routeCoordinates ?? [];
  const routeBufferMiles = Number.isFinite(options.routeBufferMiles)
    ? Number(options.routeBufferMiles)
    : ROUTE_CAMPSITE_BUFFER_MILES;
  const polygonCoordinates = options.polygonCoordinates ?? [];
  const validCoordinateCandidates = candidates
    .filter((candidate) => !!getCandidateCoordinate(candidate))
    .map((candidate) => withAccessReasonMetadata(candidate, options));
  const insideAreaCandidates =
    mode === 'polygon' && polygonCoordinates.length >= 3
      ? validCoordinateCandidates.filter((candidate) => {
          const coordinate = getCandidateCoordinate(candidate);
          return !!coordinate && pointInPolygon(coordinate, polygonCoordinates);
        })
      : validCoordinateCandidates;

  const hardExclusionCounts = validCoordinateCandidates.reduce(
    (counts, candidate) => {
      const reason = getHardCampsiteExclusionReason(candidate);
      if (reason) counts[reason] += 1;
      return counts;
    },
    {
      private_land: 0,
      protected_restricted_closed: 0,
      legal_status_restricted: 0,
      unsafe_terrain: 0,
    } as Record<CampsiteHardExclusionReason, number>,
  );
  const hardPassCandidates = validCoordinateCandidates.filter(
    (candidate) => !getHardCampsiteExclusionReason(candidate),
  );

  const eligible = hardPassCandidates.filter((candidate) => {
    const coordinate = getCandidateCoordinate(candidate);
    if (!coordinate) return false;
    if (isExcludedByMajorRoadway(candidate, options)) {
      return false;
    }
    if (mode === 'route' && routeCoordinates.length > 0) {
      if (!isCampingAppropriateRouteCandidate(candidate, options)) {
        return false;
      }
      if (toDisplayScore(candidate) < ROUTE_CAMPSITE_MIN_CONFIDENCE_SCORE) {
        return false;
      }
      const explicitDistance = getRouteDistance(candidate);
      const distance =
        explicitDistance != null
          ? explicitDistance
          : distancePointToRoutePolyline(coordinate, routeCoordinates);
      return distance <= routeBufferMiles;
    }
    if (mode === 'polygon' && polygonCoordinates.length >= 3) {
      return (
        pointInPolygon(coordinate, polygonCoordinates) &&
        toDisplayScore(candidate) >= DRAW_AREA_CAMPSITE_MIN_CONFIDENCE_SCORE
      );
    }
    return true;
  });
  const fallbackEligible =
    mode === 'polygon' && eligible.length === 0 && polygonCoordinates.length >= 3
      ? hardPassCandidates
          .filter((candidate) => {
            const coordinate = getCandidateCoordinate(candidate);
            return !!coordinate && pointInPolygon(coordinate, polygonCoordinates);
          })
          .map((candidate) => {
            if (!candidate || typeof candidate !== 'object') return candidate;
            const record = candidate as Record<string, unknown>;
            const reasons = Array.isArray(record.candidateReason)
              ? record.candidateReason.filter((reason): reason is string => typeof reason === 'string')
              : [];
            return {
              ...record,
              source: typeof record.source === 'string' ? record.source : 'draw_area_soft_fallback',
              sourceType: typeof record.sourceType === 'string' ? record.sourceType : 'fallback',
              legalityStatus: record.legalityStatus ?? 'unknown_needs_verification',
              warnings: [
                ...((Array.isArray(record.warnings) ? record.warnings : []) as unknown[]).filter(
                  (warning): warning is string => typeof warning === 'string',
                ),
                'Potential campsite: verify local rules, permits, closures, and land ownership.',
              ],
              candidateReason: [
                ...reasons,
                'Soft filter fallback: hard exclusions passed but confidence thresholds were relaxed.',
                'Legal/access status requires verification.',
              ],
              viabilityTier: record.viabilityTier ?? 'possible',
              viabilityConfidenceLabel: record.viabilityConfidenceLabel ?? 'Possible',
              criteriaBroadened: true,
            } as T;
          })
      : eligible;

  const ranked = dedupeCandidates(
    fallbackEligible.sort((a, b) => {
      const scoreDelta =
        mode === 'polygon'
          ? toDisplayScore(b) - toDisplayScore(a)
          : getCandidateRankScore(b, mode) - getCandidateRankScore(a, mode);
      if (scoreDelta !== 0) return scoreDelta;

      if (mode === 'route') {
        const routeDistanceDelta = (getRouteDistance(a) ?? 999) - (getRouteDistance(b) ?? 999);
        if (routeDistanceDelta !== 0) return routeDistanceDelta;
      }

      if (mode === 'polygon') {
        const remotenessDelta = getPolygonRemotenessScore(b) - getPolygonRemotenessScore(a);
        if (remotenessDelta !== 0) return remotenessDelta;
      }

      const aCoord = getCandidateCoordinate(a);
      const bCoord = getCandidateCoordinate(b);
      return coordinateDedupeKey(aCoord!).localeCompare(coordinateDedupeKey(bCoord!));
    }),
  )
    .slice(0, MAX_CAMPSITE_MARKERS);

  const insideHardPassCandidates = insideAreaCandidates.filter(
    (candidate) => !getHardCampsiteExclusionReason(candidate),
  );
  const scoreThresholdRemovedCount =
    mode === 'polygon'
      ? insideHardPassCandidates.filter((candidate) => toDisplayScore(candidate) < DRAW_AREA_CAMPSITE_MIN_CONFIDENCE_SCORE).length
      : hardPassCandidates.filter((candidate) => {
          if (routeCoordinates.length === 0) return false;
          if (!isCampingAppropriateRouteCandidate(candidate, options)) return true;
          if (toDisplayScore(candidate) < ROUTE_CAMPSITE_MIN_CONFIDENCE_SCORE) return true;
          if (isExcludedByMajorRoadway(candidate, options)) return true;
          const coordinate = getCandidateCoordinate(candidate);
          if (!coordinate) return false;
          const explicitDistance = getRouteDistance(candidate);
          const distance =
            explicitDistance != null
              ? explicitDistance
              : distancePointToRoutePolyline(coordinate, routeCoordinates);
          return distance > routeBufferMiles;
        }).length;

  logCampsiteFilterStageCounts({
    mode,
    rawCandidates: candidates.length,
    insideDrawnPolygon: mode === 'polygon' && polygonCoordinates.length >= 3 ? insideAreaCandidates.length : null,
    validCoordinates: validCoordinateCandidates.length,
    officialCampsitePoiMatches: insideAreaCandidates.filter(hasOfficialCampsiteSignal).length,
    landOwnershipJurisdictionPass: hardPassCandidates.length,
    privateLandRemoved: hardExclusionCounts.private_land,
    protectedRestrictedClosedRemoved: hardExclusionCounts.protected_restricted_closed,
    slopeTerrainRemoved: hardExclusionCounts.unsafe_terrain,
    accessRemotenessRemoved: scoreThresholdRemovedCount,
    legalStatusRemoved: hardExclusionCounts.legal_status_restricted,
    finalCandidates: ranked.length,
    softFallbackUsed: fallbackEligible !== eligible,
  });

  return ranked;
}

function toPublicCandidate(candidate: unknown, index: number): CampsiteCandidate {
  const coordinate = getCandidateCoordinate(candidate)!;
  const record = (candidate && typeof candidate === 'object' ? candidate : {}) as Record<string, unknown>;
  const reasons = Array.isArray(record.candidateReason) ? record.candidateReason : [];
  const warnings = Array.isArray(record.warnings)
    ? record.warnings.filter((warning): warning is string => typeof warning === 'string')
    : [];
  const score = toDisplayScore(candidate);
  const rating = typeof record.rating === 'string' && /^[ABCD]$/.test(record.rating)
    ? (record.rating as CampsiteCandidate['rating'])
    : campsiteRatingFromScore(score);
  const campingSuitabilityScore = toPercentScore(normalizeCampsiteScore(getCandidateScore(candidate)) * 100);
  return {
    id: getCandidateId(candidate) ?? `camp-${coordinateDedupeKey(coordinate)}-${index}`,
    name: typeof record.name === 'string' ? record.name : null,
    label:
      typeof record.label === 'string'
        ? record.label
        : typeof record.segmentRange === 'string'
          ? record.segmentRange
          : null,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    rating,
    score,
    remotenessScore: Number.isFinite(Number(record.remotenessScore)) ? Number(record.remotenessScore) : null,
    campingSuitabilityScore,
    legalAccessScore: Number.isFinite(Number(record.legalAccessScore)) ? Number(record.legalAccessScore) : null,
    terrainScore: Number.isFinite(Number(record.terrainScore)) ? Number(record.terrainScore) : null,
    routeProximityScore: Number.isFinite(Number(record.routeProximityScore)) ? Number(record.routeProximityScore) : null,
    ratingFactors: buildRatingFactorsForCandidate(candidate),
    viabilityTier: typeof record.viabilityTier === 'string' ? record.viabilityTier : null,
    viabilityConfidenceLabel:
      typeof record.viabilityConfidenceLabel === 'string' ? record.viabilityConfidenceLabel : null,
    distanceFromRouteMiles: getRouteDistance(candidate),
    distanceFromRoadwayMiles: getMajorRoadwayDistance(candidate),
    nearestRoadwayMiles: readFiniteNumber(record, ['nearestRoadwayMiles', 'roadwayDistanceMiles']),
    nearestMajorRoadMiles: readFiniteNumber(record, ['nearestMajorRoadMiles', 'majorRoadDistanceMiles']),
    nearestPavedRoadMiles: readFiniteNumber(record, ['nearestPavedRoadMiles', 'nearestPavedRoadDistanceMiles']),
    accessType: typeof record.accessType === 'string' ? record.accessType : null,
    roadClass: typeof record.roadClass === 'string' ? record.roadClass : null,
    source: typeof record.source === 'string' ? record.source : 'ecs_campsite_locator',
    sourceType:
      typeof record.sourceType === 'string'
        ? record.sourceType
        : typeof record.source === 'string' && record.source.includes('fallback')
          ? 'fallback'
          : 'inferred',
    legalityStatus:
      typeof record.legalityStatus === 'string'
        ? record.legalityStatus
        : 'unknown_needs_verification',
    warnings:
      warnings.length > 0
        ? warnings
        : ['Potential campsite: verify local rules, permits, closures, and land ownership.'],
    reasons: reasons.filter((reason): reason is string => typeof reason === 'string'),
    confidenceLabel:
      typeof record.viabilityConfidenceLabel === 'string'
        ? record.viabilityConfidenceLabel
        : rating === 'A'
          ? 'Higher confidence'
          : rating === 'B'
            ? 'Moderate confidence'
            : 'Lower confidence',
    distanceFromRoadOrTrail: getMajorRoadwayDistance(candidate),
    slope: readFiniteNumber(record, ['slope', 'slopeEstimate']),
    accessNotes: typeof record.accessNotes === 'string' ? record.accessNotes : null,
    explanation:
      typeof record.explanation === 'string'
        ? record.explanation
        : reasons.length > 0
          ? reasons.join('; ')
          : null,
    reason:
      typeof record.reason === 'string'
        ? record.reason
        : reasons.length > 0
          ? String(reasons[0])
          : null,
  };
}

function capCampsiteResult(
  result: CampsiteCandidateResult,
  mode: LocatorMode,
  options: {
    routeCoordinates?: CoordinateLike[] | null;
    routeBufferMiles?: number | null;
    routeSourceType?: string | null;
    polygonCoordinates?: CoordinateLike[] | null;
  } = {},
): CampsiteCandidateResult {
  const ranked = rankAndLimitCampsites<EngineCampsiteCandidate>(result.candidates, mode, options).map(
    enrichCampsiteCandidateForRating,
  );
  return {
    ...result,
    candidates: ranked,
    suggestedCampsites: ranked,
    candidateCount: ranked.length,
    hasHighConfidence: ranked.some((candidate) => candidate.confidence === 'HIGH'),
    bestConfidence:
      ranked.find((candidate) => candidate.confidence === 'HIGH')?.confidence ??
      ranked.find((candidate) => candidate.confidence === 'MEDIUM')?.confidence ??
      ranked[0]?.confidence ??
      null,
  };
}

type RouteEmptyReason =
  | 'route_analysis_no_candidate_segments'
  | 'road_source_requires_explicit_drivable_camp_access'
  | 'route_filter_removed_candidates';

function routeEmptyMessage(reason: RouteEmptyReason): string {
  switch (reason) {
    case 'road_source_requires_explicit_drivable_camp_access':
      return 'Road-only route context is not enough to infer camp pins. ECS needs explicit off-road, forest road, trail, or mapped campsite access data before showing route camps.';
    case 'route_filter_removed_candidates':
      return 'Route analysis found possible camp segments, but none survived the route corridor, roadway, or confidence filters.';
    case 'route_analysis_no_candidate_segments':
    default:
      return 'Route analysis completed, but no segment qualified for route-source camp generation. The route may be short, steep, too close to endpoints, or missing suitable flat segments.';
  }
}

function resolveRouteEmptyReason(args: {
  analyzedCandidateCount: number;
  routeSourceType?: string | null;
}): RouteEmptyReason {
  if (args.analyzedCandidateCount <= 0) return 'route_analysis_no_candidate_segments';
  if (isRoadwayRouteSource(args.routeSourceType)) {
    return 'road_source_requires_explicit_drivable_camp_access';
  }
  return 'route_filter_removed_candidates';
}

function shortRouteId(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function logRouteCampsiteLocatorSummary(args: {
  result: CampsiteCandidateResult;
  analyzedCandidateCount: number;
  routeCoordinateCount: number;
  routeSourceType?: string | null;
  routeBufferMiles?: number | null;
}): void {
  const acceptedCount = args.result.suggestedCampsites.length;
  const emptyReason =
    acceptedCount === 0
      ? resolveRouteEmptyReason({
          analyzedCandidateCount: args.analyzedCandidateCount,
          routeSourceType: args.routeSourceType,
        })
      : null;

  logCampsiteLocatorDebug('route_locator_summary', {
    routeIntelligenceId: shortRouteId(args.result.routeIntelligenceId),
    routeName: args.result.routeName,
    routeSourceType: args.routeSourceType ?? null,
    routeCoordinateCount: args.routeCoordinateCount,
    routeBufferMiles: args.routeBufferMiles ?? ROUTE_CAMPSITE_BUFFER_MILES,
    analyzedCandidateCount: args.analyzedCandidateCount,
    acceptedCount,
    emptyReason,
    emptyStateMessage: emptyReason ? routeEmptyMessage(emptyReason) : null,
  });
}

function logRouteCampsiteLocatorDiagnostic(
  event: string,
  details: Record<string, unknown>,
): void {
  logCampsiteLocatorDebug(event, details);
}

function buildRouteCorridorFallbackResult(args: {
  baseResult: CampsiteCandidateResult;
  routeIntelligence: RouteIntelligence;
  routeCoordinates: NormalizedCoordinate[];
  terrainIntelligence?: TerrainIntelligence | null;
  remotenessSnapshot?: RemotenessSnapshot | null;
  routeBufferMiles?: number | null;
  routeSourceType?: string | null;
  routeMetadata?: Record<string, unknown> | null;
}): CampsiteCandidateResult | null {
  const routeBufferMiles = args.routeBufferMiles ?? ROUTE_CAMPSITE_BUFFER_MILES;
  const roadRouteHasCampSupport =
    isRoadwayRouteSource(args.routeSourceType) &&
    routeMetadataSupportsDispersedCamping(args.routeMetadata);
  const samples = sampleRouteCorridorPoints(args.routeCoordinates, routeBufferMiles);
  if (samples.length === 0) {
    logRouteCampsiteLocatorDiagnostic('fallback_corridor_candidate_count', {
      routeIntelligenceId: shortRouteId(args.routeIntelligence.id),
      routeName: args.routeIntelligence.routeName,
      fallbackCandidateCount: 0,
      routeBufferMiles,
    });
    return null;
  }

  const fallbackStage = getCampsiteFallbackStageDefinition(CampsiteFallbackStage.LowerScoreModerately);
  const rawCandidates = samples.map((sample, index): EngineCampsiteCandidate => {
    const isEndpoint = sample.progress <= 0.05 || sample.progress >= 0.95;
    const displayScore = Math.max(
      ROUTE_CAMPSITE_MIN_CONFIDENCE_SCORE,
      Math.min(66, 58 + Math.round((1 - Math.abs(sample.progress - 0.5)) * 10)),
    );
    return {
      segmentIndex: index,
      coordinates: [sample.latitude, sample.longitude],
      distanceMiles: sample.distanceMiles,
      avgElevation: args.routeIntelligence.avgElevationFeet || 4200,
      elevationGain: isEndpoint ? 95 : 55,
      candidateReason: [
        'Route corridor fallback sample',
        'Possible route-adjacent camp area',
        `Sampled within ${routeBufferMiles} mi route search corridor`,
        ...(roadRouteHasCampSupport
          ? ['Route metadata indicates dispersed camping or public-access forest-road context']
          : []),
        'Legal/access status requires provider or field verification',
      ],
      segmentRange:
        sample.progress <= 0.05
          ? 'Route start area'
          : sample.progress >= 0.95
            ? 'Route destination area'
            : `${sample.distanceMiles.toFixed(1)} mi corridor sample`,
      difficulty: 'easy',
      qualityScore: displayScore,
      suitabilityScore: 0,
      score: displayScore,
      remotenessScore: args.remotenessSnapshot?.score ?? 55,
      campingSuitabilityScore: Math.max(55, displayScore - 4),
      terrainScore: Math.max(55, displayScore - 2),
      routeProximityScore: 85,
      legalAccessScore: 55,
      accessConfidenceScore: 58,
      distanceFromRouteMiles: 0,
      accessType: roadRouteHasCampSupport
        ? 'supported forest-road route corridor inferred'
        : 'route corridor inferred',
      source: 'route_corridor_sampling',
      routeCampAccessSupport: roadRouteHasCampSupport,
      publicLandEligibility: roadRouteHasCampSupport ? true : undefined,
      dispersedCampingEligible: roadRouteHasCampSupport ? true : undefined,
      legalityStatus: roadRouteHasCampSupport
        ? 'likely_allowed_needs_verification'
        : 'unknown_needs_verification',
      suitabilityLevel: 'LOW',
      estimatedArrivalHour: null,
      scoringBreakdown: {
        flatTerrainBonus: 0,
        remotenessBonus: 0,
        timingBonus: 0,
        elevationPenalty: 0,
        mountainPassPenalty: 0,
        idealTimingBonus: 0,
        tooEarlyPenalty: 0,
        tooLatePenalty: 0,
        shortRouteReduction: 0,
        overnightReduction: 0,
        reasons: [],
      },
      confidence: 'LOW',
      confidenceReasons: ['Fallback corridor sample; confirm access and local rules before occupying'],
      viabilityTier: 'possible',
      viabilityConfidenceLabel: 'Possible',
      fallbackStage: fallbackStage.stage,
      fallbackMode: fallbackStage.mode,
      criteriaBroadened: true,
      credibilityTier: fallbackStage.credibilityTier,
    } as EngineCampsiteCandidate;
  });

  const scoredCandidates = scoreCampsiteCandidates(
    rawCandidates,
    args.routeIntelligence,
    args.terrainIntelligence ?? null,
    args.remotenessSnapshot ?? null,
    fallbackStage,
  ).map((candidate) => ({
    ...candidate,
    score: Math.max(Number(candidate.score) || 0, ROUTE_CAMPSITE_MIN_CONFIDENCE_SCORE),
    legalAccessScore: candidate.legalAccessScore ?? 55,
    accessConfidenceScore: (candidate as EngineCampsiteCandidate & { accessConfidenceScore?: number })
      .accessConfidenceScore ?? 58,
    source: (candidate as EngineCampsiteCandidate & { source?: string }).source ?? 'route_corridor_sampling',
  })) as EngineCampsiteCandidate[];

  logRouteCampsiteLocatorDiagnostic('fallback_corridor_sampling_used', {
    routeIntelligenceId: shortRouteId(args.routeIntelligence.id),
    routeName: args.routeIntelligence.routeName,
    routeCoordinateCount: args.routeCoordinates.length,
    routeSegmentCount: args.routeIntelligence.segments?.length ?? 0,
    routeBufferMiles,
    sampleCount: samples.length,
    routeSourceType: args.routeSourceType ?? null,
    roadRouteHasCampSupport,
  });
  logRouteCampsiteLocatorDiagnostic('fallback_corridor_candidate_count', {
    routeIntelligenceId: shortRouteId(args.routeIntelligence.id),
    routeName: args.routeIntelligence.routeName,
    fallbackCandidateCount: scoredCandidates.length,
    roadRouteHasCampSupport,
  });

  return {
    ...args.baseResult,
    candidates: scoredCandidates,
    suggestedCampsites: scoredCandidates,
    candidateCount: scoredCandidates.length,
    excludedSegments: Math.max(0, (args.routeIntelligence.segments?.length ?? 0) - scoredCandidates.length),
    scoringApplied: true,
    fallbackStage: fallbackStage.stage,
    fallbackMode: fallbackStage.mode,
    criteriaBroadened: true,
    uiNotice: 'Showing possible route-corridor camp candidates; confirm local access and rules before occupying.',
  };
}

function withOptionalCampOpsPayload(
  result: CampsiteCandidateResult,
  source: 'route' | 'polygon',
  input: Pick<
  RouteCampsiteLocatorInput | PolygonCampsiteLocatorInput,
    'campopsRecommendationsEnabled' | 'campOps' | 'vehicleProfile'
  >,
): CampsiteCandidateResult {
  const campOpsOptions = input.campOps ?? {};
  return withCampOpsSearchPayload(result, {
    source,
    vehicleProfile: input.vehicleProfile,
    ...campOpsOptions,
    rolloutConfig: {
      ...(campOpsOptions.rolloutConfig ?? {}),
      campopsRecommendationsEnabled:
        campOpsOptions.rolloutConfig?.campopsRecommendationsEnabled ??
        input.campopsRecommendationsEnabled ??
        campOpsOptions.rolloutConfig?.campOpsRecommendationSetEnabled,
    },
  });
}

export function locateCampsiteResultForRoute(
  input: RouteCampsiteLocatorInput,
  options: { publish?: boolean } = {},
): CampsiteCandidateResult {
  const routeIntelligence = input.routeIntelligence;
  if (!routeIntelligence) {
    throw new Error('locateCampsiteResultForRoute requires routeIntelligence.');
  }

  const routeCoordinates = normalizeRouteCoordinates(
    input.routeCoordinates ?? input.routeGeometry,
    routeIntelligence,
  );
  const analyzedResult: CampsiteCandidateResult = {
    ...analyzeCampsiteCandidates(
      routeIntelligence,
      input.terrainIntelligence ?? null,
      input.remotenessSnapshot ?? null,
    ),
    analysisSource: 'route',
    source: 'route',
    polygonId: null,
  };
  if (routeCoordinates.length < 2) {
    logRouteCampsiteLocatorDiagnostic('no_route_coordinates', {
      routeIntelligenceId: shortRouteId(routeIntelligence.id),
      routeName: routeIntelligence.routeName,
      routeCoordinateCount: routeCoordinates.length,
    });
  }
  if (!routeIntelligence.segments || routeIntelligence.segments.length === 0) {
    logRouteCampsiteLocatorDiagnostic('no_route_segments', {
      routeIntelligenceId: shortRouteId(routeIntelligence.id),
      routeName: routeIntelligence.routeName,
      routeCoordinateCount: routeCoordinates.length,
    });
  } else if (analyzedResult.suggestedCampsites.length === 0) {
    logRouteCampsiteLocatorDiagnostic('route_segments_present_no_candidate_segments', {
      routeIntelligenceId: shortRouteId(routeIntelligence.id),
      routeName: routeIntelligence.routeName,
      routeSegmentCount: routeIntelligence.segments.length,
      routeCoordinateCount: routeCoordinates.length,
    });
  }
  const fallbackResult =
    analyzedResult.suggestedCampsites.length === 0 && routeCoordinates.length >= 2
      ? buildRouteCorridorFallbackResult({
          baseResult: analyzedResult,
          routeIntelligence,
          routeCoordinates,
          terrainIntelligence: input.terrainIntelligence ?? null,
          remotenessSnapshot: input.remotenessSnapshot ?? null,
          routeBufferMiles: input.routeBufferMiles ?? input.searchRadiusMiles ?? null,
          routeSourceType: input.routeSourceType ?? null,
          routeMetadata: input.routeMetadata ?? null,
        })
      : null;
  const roadRouteHasCampSupport =
    isRoadwayRouteSource(input.routeSourceType) &&
    routeMetadataSupportsDispersedCamping(input.routeMetadata);
  const locatorResultBase = fallbackResult ?? analyzedResult;
  const locatorResult = roadRouteHasCampSupport
    ? withSupportedRoadRouteCampsiteMetadata(locatorResultBase)
    : locatorResultBase;
  const cappedResult = capCampsiteResult(
    locatorResult,
    'route',
    {
      routeCoordinates,
      routeBufferMiles: input.routeBufferMiles ?? input.searchRadiusMiles ?? null,
      routeSourceType: input.routeSourceType ?? null,
    },
  );
  const emptyReason =
    cappedResult.suggestedCampsites.length === 0
      ? resolveRouteEmptyReason({
          analyzedCandidateCount: locatorResult.suggestedCampsites.length,
          routeSourceType: input.routeSourceType ?? null,
        })
      : null;
  const result = withOptionalCampOpsPayload(
    emptyReason
      ? {
          ...cappedResult,
          emptyReason,
          emptyStateMessage: routeEmptyMessage(emptyReason),
        }
      : cappedResult,
    'route',
    input,
  );

  logRouteCampsiteLocatorSummary({
    result,
    analyzedCandidateCount: locatorResult.suggestedCampsites.length,
    routeCoordinateCount: routeCoordinates.length,
    routeSourceType: input.routeSourceType ?? null,
    routeBufferMiles: input.routeBufferMiles ?? input.searchRadiusMiles ?? null,
  });

  if (options.publish !== false) {
    return campsiteCandidateEngine.publishResult(result);
  }
  return result;
}

export async function locateCampsitesForRoute(
  input: RouteCampsiteLocatorInput,
): Promise<CampsiteCandidate[]> {
  if (Array.isArray(input.candidates)) {
    const ranked = rankAndLimitCampsites(input.candidates, 'route', {
      routeCoordinates: normalizeRouteCoordinates(input.routeCoordinates ?? input.routeGeometry, input.routeIntelligence),
      routeBufferMiles: input.routeBufferMiles ?? input.searchRadiusMiles ?? null,
      routeSourceType: input.routeSourceType ?? null,
    });
    return ranked.map(toPublicCandidate);
  }

  if (!input.routeIntelligence) return [];
  const result = locateCampsiteResultForRoute(input, { publish: false });
  return result.candidates.map(toPublicCandidate);
}

export function locateCampsiteResultForPolygon(
  input: PolygonCampsiteLocatorInput,
  options: { publish?: boolean } = {},
): CampsiteCandidateResult {
  const result = withOptionalCampOpsPayload(
    capCampsiteResult(
      {
        ...analyzePolygonCampsiteCandidates(
          input.polygonCoordinates
            .map(normalizeCoordinate)
            .filter((point): point is NormalizedCoordinate => !!point),
          input.remotenessSnapshot ?? null,
          { polygonId: input.polygonId, routeName: input.routeName },
        ),
        analysisSource: 'polygon',
        polygonId: input.polygonId ?? null,
      },
      'polygon',
      { polygonCoordinates: input.polygonCoordinates },
    ),
    'polygon',
    input,
  );

  if (options.publish !== false) {
    return campsiteCandidateEngine.publishResult(result);
  }
  return result;
}

export async function locateCampsitesForPolygon(
  input: PolygonCampsiteLocatorInput,
): Promise<CampsiteCandidate[]> {
  if (Array.isArray(input.candidates)) {
    const ranked = rankAndLimitCampsites(input.candidates, 'polygon', {
      polygonCoordinates: input.polygonCoordinates,
    });
    return ranked.map(toPublicCandidate);
  }

  const result = locateCampsiteResultForPolygon(input, { publish: false });
  return result.candidates.map(toPublicCandidate);
}

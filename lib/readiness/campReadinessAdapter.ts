import type {
  CampScoutCandidate,
} from '../campScout';
import type {
  CampCandidate,
  CampCandidateEnrichment,
  CampOpsConfidence,
  CampRecommendationSet,
  CampSuitabilityScores,
} from '../campops/campOpsTypes';
import { normalizeCampOpsScore } from '../campops/campOpsTypes';
import type {
  ExpeditionReadinessCampCandidateInput,
  ExpeditionReadinessConfidence,
} from './expeditionReadinessTypes';

const READINESS_CAMP_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;

type ReadinessCampMapPin = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  sourceType?: 'ecs_inferred' | 'official_mapped' | 'community_suggested' | 'imported_route_context' | 'unknown';
  confidenceScore?: number;
  legalityStatus?: 'verified_allowed' | 'likely_allowed_needs_verification' | 'unknown_needs_verification' | 'restricted_or_not_allowed';
  campOpsCandidateId?: string;
  distanceFromRoadOrTrail?: number;
  accessNotes?: string;
  reasons?: string[];
  warnings?: string[];
};

function clampScore(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

function confidenceFromScore(value: number | null | undefined): ExpeditionReadinessConfidence | 'unknown' {
  const score = clampScore(value);
  if (score == null) return 'unknown';
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  if (score > 0) return 'low';
  return 'unknown';
}

function normalizeConfidence(
  confidence: CampOpsConfidence | ExpeditionReadinessConfidence | string | null | undefined,
): ExpeditionReadinessConfidence | 'unknown' {
  if (confidence === 'high' || confidence === 'medium' || confidence === 'low') return confidence;
  return 'unknown';
}

function capInferredLegalConfidence(
  confidence: ExpeditionReadinessConfidence | 'unknown',
  isECSInferred: boolean,
): ExpeditionReadinessConfidence | 'unknown' {
  if (!isECSInferred) return confidence;
  return confidence === 'high' ? 'medium' : confidence;
}

function legalConfidenceFromCampScout(candidate: CampScoutCandidate): ExpeditionReadinessConfidence | 'unknown' {
  if (
    candidate.legalityStatus === 'restricted_or_not_allowed' ||
    candidate.isPrivateLand ||
    candidate.isProtectedArea ||
    candidate.isClosed ||
    candidate.noCamping
  ) {
    return 'low';
  }
  return confidenceFromScore(candidate.legalityConfidence);
}

function accessStatusFromCampScout(
  candidate: CampScoutCandidate,
): ExpeditionReadinessCampCandidateInput['accessStatus'] {
  if (
    candidate.legalityStatus === 'restricted_or_not_allowed' ||
    candidate.isPrivateLand ||
    candidate.isProtectedArea ||
    candidate.isClosed ||
    candidate.noCamping
  ) {
    return 'restricted';
  }
  return 'unknown';
}

function campOpsAccessStatus(
  enrichment: CampCandidateEnrichment | undefined,
): ExpeditionReadinessCampCandidateInput['accessStatus'] {
  if (enrichment?.closureStatus === 'closed' || enrichment?.legalStatus === 'prohibited') return 'closed';
  if (enrichment?.closureStatus === 'restricted' || enrichment?.legalStatus === 'restricted') return 'restricted';
  if (enrichment?.closureStatus === 'permit_required') return 'permit_required';
  if (enrichment?.closureStatus === 'seasonal') return 'seasonal';
  return 'unknown';
}

function weatherExposureSummary(enrichment: CampCandidateEnrichment | undefined): string {
  const exposure = enrichment?.weatherExposureLevel ?? enrichment?.weatherExposure ?? 'unknown';
  const wind = typeof enrichment?.windSpeedMph === 'number' ? `${Math.round(enrichment.windSpeedMph)} mph wind` : null;
  const storm = enrichment?.stormRisk && enrichment.stormRisk !== 'unknown'
    ? `${enrichment.stormRisk} storm risk`
    : null;
  return [String(exposure).replace(/_/g, ' '), wind, storm].filter(Boolean).join(', ') || 'Weather exposure confidence limited.';
}

function accessSummary(candidate: CampCandidate, enrichment: CampCandidateEnrichment | undefined): string {
  const access = enrichment?.accessDifficulty ?? candidate.accessDifficulty ?? 'unknown';
  const vehicleFit = enrichment?.vehicleFit && enrichment.vehicleFit !== 'unknown'
    ? `vehicle fit ${enrichment.vehicleFit.replace(/_/g, ' ')}`
    : null;
  const distance = typeof enrichment?.routeDistanceToCampMiles === 'number'
    ? `${enrichment.routeDistanceToCampMiles.toFixed(enrichment.routeDistanceToCampMiles < 10 ? 1 : 0)} mi from route`
    : null;
  return [String(access).replace(/_/g, ' '), vehicleFit, distance].filter(Boolean).join(', ') || 'Access confidence limited.';
}

function campOpsReason(
  candidate: CampCandidate,
  recommendationSet: CampRecommendationSet,
  index: number,
): string {
  const explanations = recommendationSet.explanations;
  if (candidate.id === recommendationSet.recommendedCamp?.id && explanations?.whyRecommended) return explanations.whyRecommended;
  if (candidate.id === recommendationSet.backupCamp?.id && explanations?.whyBackup) return explanations.whyBackup;
  if (candidate.id === recommendationSet.emergencyCamp?.id && explanations?.whyEmergency) return explanations.whyEmergency;
  const tradeoff = explanations?.keyTradeoffs?.[index] ?? explanations?.keyTradeoffs?.[0];
  if (tradeoff) return tradeoff;
  const tag = candidate.tags?.find((item) => item.trim().length > 0);
  if (tag) return tag;
  return 'CampOps ranked this candidate from route, access, terrain, source-confidence, and resource signals.';
}

function campOpsCautionNotes(
  candidate: CampCandidate,
  enrichment: CampCandidateEnrichment | undefined,
  recommendationSet: CampRecommendationSet,
): string[] {
  return Array.from(new Set([
    candidate.legalConfidence !== 'high'
      ? 'Legal Access Confidence is limited; verify official agency rules before committing.'
      : null,
    enrichment?.legalStatus && enrichment.legalStatus !== 'allowed'
      ? `Legal/source status is ${String(enrichment.legalStatus).replace(/_/g, ' ')}.`
      : null,
    enrichment?.closureStatus && enrichment.closureStatus !== 'open'
      ? `Access status is ${String(enrichment.closureStatus).replace(/_/g, ' ')}.`
      : null,
    ...(enrichment?.dataLimitations ?? []),
    ...(recommendationSet.warnings ?? []),
  ].filter((item): item is string => Boolean(item && item.trim())))).slice(0, 5);
}

function scoreFromCampOps(
  candidate: CampCandidate,
  scores: CampSuitabilityScores | undefined,
  recommendationSet: CampRecommendationSet,
): number | null {
  return (
    normalizeCampOpsScore(scores?.overall) ??
    normalizeCampOpsScore(candidate.score) ??
    normalizeCampOpsScore(recommendationSet.confidenceSummary.score)
  );
}

function campOpsCandidateToReadiness(
  candidate: CampCandidate,
  recommendationSet: CampRecommendationSet,
  index: number,
): ExpeditionReadinessCampCandidateInput | null {
  if (!candidate.location || !Number.isFinite(candidate.location.latitude) || !Number.isFinite(candidate.location.longitude)) {
    return null;
  }
  const scores = recommendationSet.scoresByCandidateId?.[candidate.id];
  const enrichment = recommendationSet.enrichmentsByCandidateId?.[candidate.id];
  const isECSInferred = candidate.source === 'route_candidate' ||
    candidate.source === 'draw_area_candidate' ||
    candidate.source === 'inferred' ||
    candidate.source === 'offline_dataset';
  const legalAccessConfidence = capInferredLegalConfidence(
    normalizeConfidence(enrichment?.legalConfidence ?? candidate.legalConfidence),
    isECSInferred,
  );
  const overallCampScore = scoreFromCampOps(candidate, scores, recommendationSet);
  const routeDistance =
    enrichment?.routeDistanceToCampMiles ??
    enrichment?.straightLineDistanceToCampMiles ??
    null;
  const bailoutProximityMiles =
    enrichment?.exitDistanceMiles ??
    enrichment?.nearestTownOrExit?.routeAwareDistanceMiles ??
    enrichment?.nearestTownOrExit?.distanceFromCampMiles ??
    null;

  return {
    candidateId: candidate.id,
    id: candidate.id,
    label: READINESS_CAMP_LABELS[index] ?? String(index + 1),
    name: candidate.name || `Camp candidate ${index + 1}`,
    coordinates: {
      latitude: candidate.location.latitude,
      longitude: candidate.location.longitude,
    },
    overallCampScore,
    suitabilityScore: overallCampScore,
    terrainSuitabilityScore: clampScore(scores?.terrain),
    vehicleAccessConfidence: normalizeConfidence(enrichment?.roadWidthConfidence ?? candidate.sourceConfidence),
    remotenessScore: clampScore(scores?.privacy),
    routeDistance,
    weatherExposureSummary: weatherExposureSummary(enrichment),
    accessSummary: accessSummary(candidate, enrichment),
    whyECSPickedThis: campOpsReason(candidate, recommendationSet, index),
    cautionNotes: campOpsCautionNotes(candidate, enrichment, recommendationSet),
    legalAccessConfidence,
    officialConfirmation: !isECSInferred && legalAccessConfidence === 'high',
    accessStatus: campOpsAccessStatus(enrichment),
    sourceConfidence: normalizeConfidence(candidate.sourceConfidence),
    isECSInferred,
    bailoutProximityMiles,
    bailoutProximitySummary: bailoutProximityMiles == null
      ? 'Bailout proximity confidence limited.'
      : `${bailoutProximityMiles.toFixed(bailoutProximityMiles < 10 ? 1 : 0)} mi to exit or town signal.`,
    source: isECSInferred ? 'inferred' : 'cached',
    updatedAt: new Date().toISOString(),
    isInferred: isECSInferred,
  };
}

export function buildReadinessCampCandidatesFromCampOps(
  recommendationSet: CampRecommendationSet | null | undefined,
): ExpeditionReadinessCampCandidateInput[] {
  if (!recommendationSet) return [];
  const ranked = Array.isArray(recommendationSet.rankedCandidates) ? recommendationSet.rankedCandidates : [];
  const fallback = [
    recommendationSet.recommendedCamp,
    recommendationSet.backupCamp,
    recommendationSet.emergencyCamp,
  ].filter((candidate): candidate is CampCandidate => Boolean(candidate));
  const candidates = ranked.length > 0 ? ranked : fallback;
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      if (seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    })
    .slice(0, 5)
    .map((candidate, index) => campOpsCandidateToReadiness(candidate, recommendationSet, index))
    .filter((candidate): candidate is ExpeditionReadinessCampCandidateInput => Boolean(candidate));
}

export function buildReadinessCampCandidatesFromCampScout(
  candidates: CampScoutCandidate[] | null | undefined,
): ExpeditionReadinessCampCandidateInput[] {
  if (!Array.isArray(candidates)) return [];
  const nowIso = new Date().toISOString();
  return candidates.slice(0, 5).map((candidate, index) => {
    const isECSInferred = candidate.sourceType === 'ecs_inferred' || candidate.sourceType === 'unknown';
    const legalAccessConfidence = capInferredLegalConfidence(legalConfidenceFromCampScout(candidate), isECSInferred);
    const overallCampScore = clampScore(candidate.confidenceScore ?? candidate.scoreBreakdown?.total);
    return {
      candidateId: candidate.id,
      id: candidate.id,
      label: READINESS_CAMP_LABELS[index] ?? String(index + 1),
      name: candidate.title || `Camp candidate ${index + 1}`,
      coordinates: candidate.coordinate,
      overallCampScore,
      suitabilityScore: overallCampScore,
      terrainSuitabilityScore: clampScore(candidate.terrainConfidence ?? candidate.scoreBreakdown?.terrain),
      vehicleAccessConfidence: confidenceFromScore(candidate.accessConfidence),
      remotenessScore: clampScore(candidate.remotenessScore),
      routeDistance: candidate.distanceFromRoadOrTrail ?? candidate.distanceFromNearestRoadMiles ?? null,
      weatherExposureSummary: candidate.seasonalRiskPossible
        ? 'Seasonal exposure possible; weather confidence limited.'
        : 'Weather exposure requires route forecast review.',
      accessSummary: candidate.accessNotes ?? 'Access confidence limited.',
      whyECSPickedThis: candidate.reasons?.[0] ?? 'Camp Scout ranked this dispersed candidate from available terrain, access, remoteness, and source signals.',
      cautionNotes: [
        ...(candidate.cautions ?? []),
        ...(candidate.warnings ?? []),
        legalAccessConfidence !== 'high'
          ? 'Legal Access Confidence is limited; check official agency rules.'
          : null,
      ].filter((item): item is string => Boolean(item)),
      legalAccessConfidence,
      officialConfirmation: candidate.sourceType === 'official_mapped' && legalAccessConfidence === 'high',
      accessStatus: accessStatusFromCampScout(candidate),
      sourceConfidence: confidenceFromScore(candidate.confidenceScore),
      isECSInferred,
      bailoutProximityMiles: null,
      bailoutProximitySummary: 'Bailout proximity is not available from this Camp Scout candidate.',
      source: isECSInferred ? 'inferred' : 'cached',
      updatedAt: candidate.sourceTimestamp ?? candidate.lastVerifiedAt ?? candidate.createdAt ?? nowIso,
      isStale: Boolean(candidate.isMapDataStale),
      isInferred: isECSInferred,
    };
  });
}

export function buildReadinessCampCandidatesFromMapPins(
  markers: ReadinessCampMapPin[] | null | undefined,
): ExpeditionReadinessCampCandidateInput[] {
  if (!Array.isArray(markers)) return [];
  const nowIso = new Date().toISOString();
  return markers.slice(0, 5).map((marker, index) => {
    const isECSInferred = marker.sourceType === 'ecs_inferred' || marker.sourceType === 'unknown';
    const restricted = marker.legalityStatus === 'restricted_or_not_allowed';
    const legalAccessConfidence = restricted
      ? 'low'
      : capInferredLegalConfidence(confidenceFromScore(marker.confidenceScore), isECSInferred);
    return {
      candidateId: marker.campOpsCandidateId ?? marker.id,
      id: marker.campOpsCandidateId ?? marker.id,
      label: READINESS_CAMP_LABELS[index] ?? String(index + 1),
      name: marker.title || `Camp candidate ${index + 1}`,
      coordinates: {
        latitude: marker.latitude,
        longitude: marker.longitude,
      },
      overallCampScore: clampScore(marker.confidenceScore),
      suitabilityScore: clampScore(marker.confidenceScore),
      legalAccessConfidence,
      officialConfirmation: marker.sourceType === 'official_mapped' && legalAccessConfidence === 'high',
      accessStatus: restricted ? 'restricted' : 'unknown',
      terrainSuitabilityScore: null,
      vehicleAccessConfidence: 'unknown',
      remotenessScore: null,
      routeDistance: marker.distanceFromRoadOrTrail ?? null,
      weatherExposureSummary: 'Weather exposure not included in this map pin.',
      accessSummary: marker.accessNotes ?? 'Access confidence limited.',
      whyECSPickedThis: marker.reasons?.[0] ?? 'Visible camp overlay candidate from available ECS map signals.',
      cautionNotes: [
        ...(marker.warnings ?? []),
        legalAccessConfidence !== 'high'
          ? 'Legal confidence limited; verify official agency rules.'
          : null,
      ].filter((item): item is string => Boolean(item)),
      sourceConfidence: confidenceFromScore(marker.confidenceScore),
      isECSInferred,
      bailoutProximityMiles: null,
      bailoutProximitySummary: 'Bailout proximity is not available from this map pin.',
      source: isECSInferred ? 'inferred' : 'cached',
      updatedAt: nowIso,
      isInferred: isECSInferred,
    };
  });
}

export function mergeReadinessCampCandidateSets(
  ...sets: Array<ExpeditionReadinessCampCandidateInput[] | null | undefined>
): ExpeditionReadinessCampCandidateInput[] {
  const seen = new Set<string>();
  const merged: ExpeditionReadinessCampCandidateInput[] = [];
  sets.flat().forEach((candidate) => {
    if (!candidate) return;
    const key = candidate.candidateId ?? candidate.id ?? `${candidate.coordinates?.latitude}:${candidate.coordinates?.longitude}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(candidate);
  });
  return merged
    .sort((left, right) => (right.overallCampScore ?? right.suitabilityScore ?? 0) - (left.overallCampScore ?? left.suitabilityScore ?? 0))
    .slice(0, 5)
    .map((candidate, index) => ({
      ...candidate,
      label: READINESS_CAMP_LABELS[index] ?? candidate.label ?? String(index + 1),
    }));
}

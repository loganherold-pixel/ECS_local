import type { ObservationGeometry } from './ecs5ObservationPipeline';
import {
  calculateECS5SourceConfidence,
  sourceConfidenceLabel,
  type ConfidenceEvidenceSource,
  type SourceConfidenceScore,
} from './ecs5SourceConfidence';

export type BailoutRouteType =
  | 'alternate_exit'
  | 'emergency_exit'
  | 'recovery_exit'
  | 'shelter_in_place'
  | 'fuel_resupply'
  | 'water_resupply'
  | 'medical_exit'
  | 'unknown';

export type BailoutPassabilityStatus =
  | 'likely_passable'
  | 'uncertain'
  | 'likely_impassable'
  | 'closed'
  | 'illegal'
  | 'unknown';

export type BailoutLegalStatus =
  | 'open'
  | 'closed'
  | 'restricted'
  | 'permit_required'
  | 'private'
  | 'unknown';

export type BailoutClosureStatus =
  | 'open'
  | 'active_closure'
  | 'closed'
  | 'expired'
  | 'stale'
  | 'unknown';

export type BailoutRiskSignalStatus =
  | 'low'
  | 'watch'
  | 'moderate'
  | 'warning'
  | 'high'
  | 'critical'
  | 'severe'
  | 'unknown';

export type BailoutTriggerType =
  | 'official_closure'
  | 'legal_access_unknown'
  | 'vehicle_class_mismatch'
  | 'wildfire_perimeter'
  | 'active_fire_nearby'
  | 'severe_weather_alert'
  | 'flood_winter_wind_weather'
  | 'high_aqi_smoke'
  | 'fuel_reserve_low'
  | 'daylight_low'
  | 'crew_health_or_readiness'
  | 'route_blocked_report'
  | 'source_conflict'
  | 'unknown';

export type BailoutTriggerSeverity = 'info' | 'watch' | 'warning' | 'critical' | 'blocker';

export type BailoutRecommendation =
  | 'continue_primary'
  | 'use_bailout'
  | 'delay'
  | 'do_not_travel'
  | 'no_verified_bailout'
  | 'manual_review_required';

export interface BailoutRoute {
  id: string;
  expeditionId: string;
  tripId?: string | null;
  primaryRouteId: string;
  name: string;
  type: BailoutRouteType;
  geometry: ObservationGeometry | null;
  startSegmentId: string;
  reconnectsToRouteId?: string | null;
  destinationLabel: string;
  estimatedDistance: number;
  estimatedDuration: number;
  technicalDifficulty: string;
  minVehicleCapability: string;
  driverSkillRecommendation: string;
  fuelRequirementEstimate: number;
  daylightRequirementEstimate: number;
  passabilityStatus: BailoutPassabilityStatus;
  legalStatus: BailoutLegalStatus;
  closureStatus: BailoutClosureStatus;
  fireRiskStatus: BailoutRiskSignalStatus;
  smokeAqiRiskStatus: BailoutRiskSignalStatus;
  weatherRiskStatus: BailoutRiskSignalStatus;
  riskScore: number;
  confidenceScore: number;
  confidenceBreakdown?: SourceConfidenceScore | null;
  evidenceIds: string[];
  lastEvaluatedAt: string;
  expiresAt?: string | null;
  offlineAvailable: boolean;
}

export interface BailoutTrigger {
  id: string;
  routeId: string;
  segmentId?: string | null;
  triggerType: BailoutTriggerType;
  severity: BailoutTriggerSeverity;
  evidenceIds: string[];
  createdAt: string;
}

export interface BailoutEvidenceRef {
  id: string;
  providerId?: string | null;
  sourceName?: string | null;
  sourceType?: string | null;
  recordType?: string | null;
  subjectType?: string | null;
  status?: string | null;
  detail?: string | null;
  observedAt?: string | null;
  publishedAt?: string | null;
  ingestedAt?: string | null;
  expiresAt?: string | null;
  ttlSeconds?: number | null;
  geometry?: ObservationGeometry | null;
  evidenceUrl?: string | null;
  knownLimitations?: string[];
  qualityIssues?: string[];
  official?: boolean;
  stale?: boolean;
  cached?: boolean;
  agrees?: boolean | null;
  conflictsWith?: string[];
  manualReviewed?: boolean;
  manualReviewAllowed?: boolean;
}

export interface RankedBailoutRoute {
  route: BailoutRoute;
  rank: number;
  rankingScore: number;
  blocked: boolean;
  selectable: boolean;
  recommendation: BailoutRecommendation;
  blockers: string[];
  warnings: string[];
  unknowns: string[];
  triggers: BailoutTrigger[];
  label: string;
  reason: string;
  triggerConditions: string[];
  legalStatus: BailoutLegalStatus;
  closureStatus: BailoutClosureStatus;
  passabilityStatus: BailoutPassabilityStatus;
  fireWeatherSmokeSummary: string;
  confidenceLabel: 'high' | 'medium' | 'low' | 'unknown';
  evidenceList: BailoutEvidenceRef[];
  lastVerifiedAt?: string | null;
  staleOfflineWarning?: string | null;
  verifyWithManagingAgencyReminder?: string | null;
}

export interface BailoutDecision {
  primaryRouteId: string;
  evaluatedAt: string;
  recommendation: BailoutRecommendation;
  selectedBailoutRouteId?: string | null;
  rankedCandidates: RankedBailoutRoute[];
  blockers: string[];
  warnings: string[];
  unknowns: string[];
  evidence: BailoutEvidenceRef[];
  confidenceSummary: SourceConfidenceScore;
}

export type BailoutRouteCandidateInput = Partial<BailoutRoute> & {
  id: string;
  name: string;
  primaryRouteId?: string;
  expeditionId?: string;
  startSegmentId?: string;
  destinationLabel?: string;
};

export interface BailoutVehicleProfile {
  capability?: string | null;
  driverSkill?: string | null;
  fuelReserveDistance?: number | null;
  daylightHoursRemaining?: number | null;
}

export interface BailoutCrewReadiness {
  readinessScore?: number | null;
  healthRiskStatus?: BailoutRiskSignalStatus | null;
}

export interface EvaluateBailoutRoutesInput {
  primaryRouteId: string;
  expeditionId?: string | null;
  tripId?: string | null;
  bailoutRoutes: BailoutRouteCandidateInput[];
  triggers?: BailoutTrigger[];
  evidence?: BailoutEvidenceRef[];
  vehicleProfile?: BailoutVehicleProfile;
  crewReadiness?: BailoutCrewReadiness;
  now?: Date;
}

interface CandidateEvaluation {
  route: BailoutRoute;
  riskScore: number;
  confidence: SourceConfidenceScore;
  triggers: BailoutTrigger[];
  blockers: string[];
  warnings: string[];
  unknowns: string[];
  evidence: BailoutEvidenceRef[];
  stale: boolean;
  selectable: boolean;
  recommendation: BailoutRecommendation;
}

export function evaluateBailoutRoutes(input: EvaluateBailoutRoutesInput): BailoutDecision {
  const now = input.now ?? new Date();
  const evaluatedAt = now.toISOString();
  const globalEvidence = dedupeEvidence(input.evidence ?? []);
  const evaluations = input.bailoutRoutes
    .map((candidate) => normalizeRoute(candidate, input, evaluatedAt))
    .map((route) => evaluateCandidate(route, input, globalEvidence, now));

  const rankedCandidates = evaluations
    .sort(compareEvaluations)
    .map((evaluation, index) => toRankedCandidate(evaluation, index + 1));

  const selectable = rankedCandidates.filter((candidate) => candidate.selectable);
  const best = selectable[0] ?? null;
  const blockers = dedupe(rankedCandidates.flatMap((candidate) => candidate.blockers));
  const warnings = dedupe(rankedCandidates.flatMap((candidate) => candidate.warnings));
  const unknowns = dedupe(rankedCandidates.flatMap((candidate) => candidate.unknowns));
  const evidence = dedupeEvidence([
    ...globalEvidence,
    ...rankedCandidates.flatMap((candidate) => candidate.evidenceList),
  ]);
  const confidenceSummary = calculateECS5SourceConfidence({
    decisionType: 'manual_review',
    now,
    sources: evidence.map(evidenceToConfidenceSource),
  });

  return {
    primaryRouteId: input.primaryRouteId,
    evaluatedAt,
    recommendation: resolveDecisionRecommendation(best, rankedCandidates),
    selectedBailoutRouteId: best?.route.id ?? null,
    rankedCandidates,
    blockers,
    warnings,
    unknowns,
    evidence,
    confidenceSummary,
  };
}

function normalizeRoute(
  candidate: BailoutRouteCandidateInput,
  input: EvaluateBailoutRoutesInput,
  evaluatedAt: string,
): BailoutRoute {
  return {
    id: candidate.id,
    expeditionId: candidate.expeditionId ?? input.expeditionId ?? 'unknown',
    tripId: candidate.tripId ?? input.tripId ?? null,
    primaryRouteId: candidate.primaryRouteId ?? input.primaryRouteId,
    name: candidate.name,
    type: candidate.type ?? 'unknown',
    geometry: candidate.geometry ?? null,
    startSegmentId: candidate.startSegmentId ?? 'unknown',
    reconnectsToRouteId: candidate.reconnectsToRouteId ?? null,
    destinationLabel: candidate.destinationLabel ?? candidate.name,
    estimatedDistance: safeNumber(candidate.estimatedDistance, 0),
    estimatedDuration: safeNumber(candidate.estimatedDuration, 0),
    technicalDifficulty: candidate.technicalDifficulty ?? 'unknown',
    minVehicleCapability: candidate.minVehicleCapability ?? 'unknown',
    driverSkillRecommendation: candidate.driverSkillRecommendation ?? 'unknown',
    fuelRequirementEstimate: safeNumber(candidate.fuelRequirementEstimate, 0),
    daylightRequirementEstimate: safeNumber(candidate.daylightRequirementEstimate, 0),
    passabilityStatus: candidate.passabilityStatus ?? 'unknown',
    legalStatus: candidate.legalStatus ?? 'unknown',
    closureStatus: candidate.closureStatus ?? 'unknown',
    fireRiskStatus: candidate.fireRiskStatus ?? 'unknown',
    smokeAqiRiskStatus: candidate.smokeAqiRiskStatus ?? 'unknown',
    weatherRiskStatus: candidate.weatherRiskStatus ?? 'unknown',
    riskScore: safeNumber(candidate.riskScore, 0),
    confidenceScore: safeNumber(candidate.confidenceScore, 0),
    confidenceBreakdown: candidate.confidenceBreakdown ?? null,
    evidenceIds: dedupe(candidate.evidenceIds ?? []),
    lastEvaluatedAt: candidate.lastEvaluatedAt ?? evaluatedAt,
    expiresAt: candidate.expiresAt ?? null,
    offlineAvailable: candidate.offlineAvailable ?? false,
  };
}

function evaluateCandidate(
  route: BailoutRoute,
  input: EvaluateBailoutRoutesInput,
  globalEvidence: BailoutEvidenceRef[],
  now: Date,
): CandidateEvaluation {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const unknowns: string[] = [];
  let risk = 10;
  const triggers = [...(input.triggers ?? []).filter((trigger) => trigger.routeId === route.id)];
  const routeEvidence = dedupeEvidence([
    ...globalEvidence.filter((evidence) => route.evidenceIds.includes(evidence.id)),
    ...globalEvidence.filter((evidence) => evidenceAppliesToRoute(evidence, route)),
  ]);

  if (route.legalStatus === 'closed' || route.legalStatus === 'private') {
    risk += 85;
    blockers.push(`Legal status is ${route.legalStatus}; do not treat this bailout as available.`);
    triggers.push(trigger(route, 'official_closure', 'blocker', route.evidenceIds, now));
  } else if (route.legalStatus === 'unknown') {
    risk += 28;
    unknowns.push('Legal access is unknown; verify with the managing agency before relying on this bailout.');
    triggers.push(trigger(route, 'legal_access_unknown', 'warning', route.evidenceIds, now));
  } else if (route.legalStatus === 'restricted' || route.legalStatus === 'permit_required') {
    risk += 18;
    warnings.push(`Legal status is ${route.legalStatus}; confirm vehicle class, permits, and timing.`);
  }

  if (route.closureStatus === 'active_closure' || route.closureStatus === 'closed') {
    risk += 90;
    blockers.push('Active official closure intersects this bailout route.');
    triggers.push(trigger(route, 'official_closure', 'blocker', route.evidenceIds, now));
  } else if (route.closureStatus === 'stale') {
    risk += 18;
    warnings.push('Closure data is stale; verify current status before travel.');
    triggers.push(trigger(route, 'source_conflict', 'warning', route.evidenceIds, now));
  } else if (route.closureStatus === 'unknown') {
    risk += 12;
    unknowns.push('Closure status is unknown.');
  }

  if (route.passabilityStatus === 'closed' || route.passabilityStatus === 'illegal') {
    risk += 80;
    blockers.push(`Passability status is ${route.passabilityStatus}.`);
    triggers.push(trigger(route, 'route_blocked_report', 'blocker', route.evidenceIds, now));
  } else if (route.passabilityStatus === 'likely_impassable') {
    risk += 55;
    warnings.push('Bailout is likely impassable based on current condition signals.');
    triggers.push(trigger(route, 'route_blocked_report', 'critical', route.evidenceIds, now));
  } else if (route.passabilityStatus === 'uncertain' || route.passabilityStatus === 'unknown') {
    risk += 16;
    unknowns.push('Passability is uncertain; legal/open access does not mean passable.');
  }

  risk += applySignalRisk(route.fireRiskStatus, 'fire', route, triggers, blockers, warnings, now);
  risk += applySignalRisk(route.smokeAqiRiskStatus, 'smoke', route, triggers, blockers, warnings, now);
  risk += applySignalRisk(route.weatherRiskStatus, 'weather', route, triggers, blockers, warnings, now);

  const vehiclePenalty = vehicleCapabilityPenalty(route, input.vehicleProfile);
  if (vehiclePenalty >= 35) {
    blockers.push('Vehicle capability does not meet the minimum bailout route requirement.');
    triggers.push(trigger(route, 'vehicle_class_mismatch', 'blocker', route.evidenceIds, now));
  } else if (vehiclePenalty > 0) {
    warnings.push('Vehicle capability or driver skill is marginal for this bailout route.');
    triggers.push(trigger(route, 'vehicle_class_mismatch', 'warning', route.evidenceIds, now));
  }
  risk += vehiclePenalty;

  const fuelReserve = input.vehicleProfile?.fuelReserveDistance;
  if (typeof fuelReserve === 'number' && route.fuelRequirementEstimate > fuelReserve) {
    risk += 30;
    warnings.push('Fuel reserve is below the estimated requirement for this bailout.');
    triggers.push(trigger(route, 'fuel_reserve_low', 'warning', route.evidenceIds, now));
  }
  const daylight = input.vehicleProfile?.daylightHoursRemaining;
  if (typeof daylight === 'number' && route.daylightRequirementEstimate > daylight) {
    risk += 20;
    warnings.push('Estimated daylight is below this bailout route requirement.');
    triggers.push(trigger(route, 'daylight_low', 'warning', route.evidenceIds, now));
  }
  if ((input.crewReadiness?.readinessScore ?? 100) < 50 || riskLevel(input.crewReadiness?.healthRiskStatus ?? 'low') >= 3) {
    risk += 22;
    warnings.push('Crew readiness or health status makes this bailout less suitable.');
    triggers.push(trigger(route, 'crew_health_or_readiness', 'warning', route.evidenceIds, now));
  }

  const stale = route.expiresAt != null && Date.parse(route.expiresAt) <= now.getTime();
  if (stale) {
    risk += 12;
    warnings.push('Bailout evaluation is stale; cached/offline data may no longer match field conditions.');
  }
  if (!route.offlineAvailable) {
    warnings.push('Bailout data is not confirmed available offline.');
  }

  risk = clamp(Math.max(risk, route.riskScore), 0, 100);
  const confidence = route.confidenceBreakdown ?? calculateECS5SourceConfidence({
    decisionType: confidenceDecisionType(route),
    now,
    sources: routeEvidence.length > 0
      ? routeEvidence.map(evidenceToConfidenceSource)
      : route.evidenceIds.map((id) => evidenceToConfidenceSource({ id, sourceName: id })),
  });
  const confidenceScore = route.confidenceScore > 0 && routeEvidence.length === 0
    ? route.confidenceScore
    : route.confidenceScore > 0
      ? Math.min(route.confidenceScore, confidence.score || route.confidenceScore)
      : confidence.score;
  const confidenceAdjustedRoute = {
    ...route,
    riskScore: risk,
    confidenceScore,
    confidenceBreakdown: confidence,
  };
  const blocked = blockers.length > 0 || route.legalStatus === 'unknown' || route.closureStatus === 'unknown' || risk >= 85;
  const selectable = !blocked && confidenceScore >= 45 && risk < 70;

  return {
    route: confidenceAdjustedRoute,
    riskScore: risk,
    confidence,
    triggers: dedupeTriggers(triggers),
    blockers,
    warnings,
    unknowns,
    evidence: routeEvidence,
    stale,
    selectable,
    recommendation: selectable ? 'use_bailout' : blockers.length > 0 ? 'do_not_travel' : 'manual_review_required',
  };
}

function applySignalRisk(
  status: BailoutRiskSignalStatus,
  kind: 'fire' | 'smoke' | 'weather',
  route: BailoutRoute,
  triggers: BailoutTrigger[],
  blockers: string[],
  warnings: string[],
  now: Date,
): number {
  const level = riskLevel(status);
  if (kind === 'fire' && level >= 4) {
    blockers.push('Fire perimeter or critical fire signal affects this bailout route.');
    triggers.push(trigger(route, 'wildfire_perimeter', 'blocker', route.evidenceIds, now));
    return 65;
  }
  if (kind === 'fire' && level >= 3) {
    warnings.push('Active fire nearby raises bailout route risk.');
    triggers.push(trigger(route, 'active_fire_nearby', 'critical', route.evidenceIds, now));
    return 36;
  }
  if (kind === 'smoke' && level >= 4) {
    warnings.push('Hazardous smoke/AQI may make this bailout unsuitable for crew health.');
    triggers.push(trigger(route, 'high_aqi_smoke', 'critical', route.evidenceIds, now));
    return 38;
  }
  if (kind === 'weather' && level >= 4) {
    warnings.push('Severe weather intersects or affects this bailout route.');
    triggers.push(trigger(route, 'severe_weather_alert', 'critical', route.evidenceIds, now));
    return 38;
  }
  if (kind === 'weather' && level >= 3) {
    warnings.push('Weather risk may affect travel, recovery, towing, or exposure.');
    triggers.push(trigger(route, 'flood_winter_wind_weather', 'warning', route.evidenceIds, now));
    return 24;
  }
  if (level >= 3) {
    warnings.push(`${kind} risk is elevated on this bailout route.`);
    return 24;
  }
  if (level === 2) return 12;
  if (status === 'unknown') return 8;
  return 0;
}

function toRankedCandidate(evaluation: CandidateEvaluation, rank: number): RankedBailoutRoute {
  const route = evaluation.route;
  const staleWarning = evaluation.stale || evaluation.confidence.staleWarning
    ? 'Last verified data is stale or cached; confirm before relying on this route.'
    : null;
  return {
    route,
    rank,
    rankingScore: Math.round(100 - evaluation.riskScore + Math.min(20, route.confidenceScore / 5)),
    blocked: !evaluation.selectable,
    selectable: evaluation.selectable,
    recommendation: evaluation.recommendation,
    blockers: dedupe(evaluation.blockers),
    warnings: dedupe(evaluation.warnings),
    unknowns: dedupe(evaluation.unknowns),
    triggers: evaluation.triggers,
    label: route.name,
    reason: bailoutReason(route),
    triggerConditions: dedupe(evaluation.triggers.map((item) => item.triggerType)),
    legalStatus: route.legalStatus,
    closureStatus: route.closureStatus,
    passabilityStatus: route.passabilityStatus,
    fireWeatherSmokeSummary: `Fire: ${route.fireRiskStatus}; Weather: ${route.weatherRiskStatus}; Smoke/AQI: ${route.smokeAqiRiskStatus}`,
    confidenceLabel: sourceConfidenceLabel(route.confidenceScore),
    evidenceList: evaluation.evidence,
    lastVerifiedAt: route.lastEvaluatedAt,
    staleOfflineWarning: staleWarning,
    verifyWithManagingAgencyReminder: shouldVerifyWithAgency(route, evaluation)
      ? 'Verify access and closure status with the managing agency; legal/open does not mean safe or passable.'
      : null,
  };
}

function resolveDecisionRecommendation(
  best: RankedBailoutRoute | null,
  ranked: RankedBailoutRoute[],
): BailoutRecommendation {
  if (best) return 'use_bailout';
  if (ranked.length === 0) return 'no_verified_bailout';
  if (ranked.every((candidate) => candidate.blockers.length > 0)) return 'no_verified_bailout';
  if (ranked.some((candidate) => candidate.unknowns.length > 0 || candidate.verifyWithManagingAgencyReminder)) return 'manual_review_required';
  if (ranked.some((candidate) => candidate.warnings.some((warning) => /smoke|weather|fire|daylight/i.test(warning)))) return 'delay';
  return 'no_verified_bailout';
}

function compareEvaluations(a: CandidateEvaluation, b: CandidateEvaluation): number {
  if (a.selectable !== b.selectable) return a.selectable ? -1 : 1;
  if (a.riskScore !== b.riskScore) return a.riskScore - b.riskScore;
  if (a.route.confidenceScore !== b.route.confidenceScore) return b.route.confidenceScore - a.route.confidenceScore;
  if (a.route.estimatedDistance !== b.route.estimatedDistance) return a.route.estimatedDistance - b.route.estimatedDistance;
  return a.route.estimatedDuration - b.route.estimatedDuration;
}

function vehicleCapabilityPenalty(route: BailoutRoute, vehicleProfile?: BailoutVehicleProfile): number {
  const required = capabilityRank(route.minVehicleCapability);
  const actual = capabilityRank(vehicleProfile?.capability ?? 'unknown');
  let penalty = 0;
  if (required > 0 && actual > 0 && actual < required) penalty += required - actual >= 2 ? 45 : 30;
  if (required > 0 && actual === 0) penalty += 16;
  const driverRequired = skillRank(route.driverSkillRecommendation);
  const driverActual = skillRank(vehicleProfile?.driverSkill ?? 'unknown');
  if (driverRequired > 0 && driverActual > 0 && driverActual < driverRequired) penalty += 18;
  return penalty;
}

function confidenceDecisionType(route: BailoutRoute): 'legal_access' | 'closure' | 'passability' | 'weather' | 'smoke_aqi' | 'active_fire' | 'manual_review' {
  if (route.closureStatus === 'active_closure' || route.closureStatus === 'closed') return 'closure';
  if (route.legalStatus !== 'open') return 'legal_access';
  if (riskLevel(route.fireRiskStatus) >= 3) return 'active_fire';
  if (riskLevel(route.smokeAqiRiskStatus) >= 3) return 'smoke_aqi';
  if (riskLevel(route.weatherRiskStatus) >= 3) return 'weather';
  if (route.passabilityStatus !== 'likely_passable') return 'passability';
  return 'manual_review';
}

function evidenceToConfidenceSource(evidence: BailoutEvidenceRef): ConfidenceEvidenceSource {
  return {
    id: evidence.id,
    providerId: evidence.providerId,
    sourceName: evidence.sourceName,
    sourceType: evidence.sourceType,
    recordType: evidence.recordType,
    subjectType: evidence.subjectType,
    status: evidence.status,
    detail: evidence.detail,
    observedAt: evidence.observedAt,
    publishedAt: evidence.publishedAt,
    ingestedAt: evidence.ingestedAt,
    expiresAt: evidence.expiresAt,
    ttlSeconds: evidence.ttlSeconds,
    geometry: evidence.geometry,
    evidenceUrl: evidence.evidenceUrl,
    knownLimitations: evidence.knownLimitations,
    qualityIssues: evidence.qualityIssues,
    official: evidence.official,
    cached: evidence.cached,
    stale: evidence.stale,
    agrees: evidence.agrees,
    conflictsWith: evidence.conflictsWith,
    manualReviewed: evidence.manualReviewed,
    manualReviewAllowed: evidence.manualReviewAllowed,
  };
}

function trigger(
  route: BailoutRoute,
  triggerType: BailoutTriggerType,
  severity: BailoutTriggerSeverity,
  evidenceIds: string[],
  now: Date,
): BailoutTrigger {
  return {
    id: `${route.id}:${triggerType}:${severity}`,
    routeId: route.id,
    segmentId: route.startSegmentId,
    triggerType,
    severity,
    evidenceIds: dedupe(evidenceIds),
    createdAt: now.toISOString(),
  };
}

function bailoutReason(route: BailoutRoute): string {
  if (route.type === 'fuel_resupply') return `Fuel resupply toward ${route.destinationLabel}`;
  if (route.type === 'water_resupply') return `Water resupply toward ${route.destinationLabel}`;
  if (route.type === 'medical_exit') return `Medical exit toward ${route.destinationLabel}`;
  if (route.type === 'shelter_in_place') return `Shelter-in-place option at ${route.destinationLabel}`;
  if (route.type === 'emergency_exit') return `Emergency exit toward ${route.destinationLabel}`;
  if (route.type === 'recovery_exit') return `Recovery exit toward ${route.destinationLabel}`;
  if (route.type === 'alternate_exit') return `Alternate exit toward ${route.destinationLabel}`;
  return `Bailout option toward ${route.destinationLabel}`;
}

function shouldVerifyWithAgency(route: BailoutRoute, evaluation: CandidateEvaluation): boolean {
  return route.legalStatus !== 'open' ||
    route.closureStatus !== 'open' ||
    route.confidenceScore < 70 ||
    evaluation.unknowns.length > 0 ||
    evaluation.stale;
}

function evidenceAppliesToRoute(evidence: BailoutEvidenceRef, route: BailoutRoute): boolean {
  const detail = `${evidence.detail ?? ''} ${evidence.status ?? ''}`.toLowerCase();
  return detail.includes(route.id.toLowerCase()) || route.evidenceIds.includes(evidence.id);
}

function riskLevel(status: BailoutRiskSignalStatus | null | undefined): number {
  switch (status) {
    case 'low': return 1;
    case 'watch':
    case 'moderate': return 2;
    case 'warning':
    case 'high': return 3;
    case 'critical':
    case 'severe': return 4;
    case 'unknown':
    default: return 0;
  }
}

function capabilityRank(value: string | null | undefined): number {
  const normalized = normalize(value);
  if (['easy_2wd', '2wd', 'stock', 'standard'].includes(normalized)) return 1;
  if (['awd', 'soft_roader', 'mild'].includes(normalized)) return 2;
  if (['high_clearance', 'moderate'].includes(normalized)) return 3;
  if (['four_by_four', '4x4', 'four_wheel_drive', 'aggressive'].includes(normalized)) return 4;
  if (['technical', 'extreme'].includes(normalized)) return 5;
  return 0;
}

function skillRank(value: string | null | undefined): number {
  const normalized = normalize(value);
  if (['novice', 'easy', 'basic'].includes(normalized)) return 1;
  if (['intermediate', 'moderate'].includes(normalized)) return 2;
  if (['experienced', 'advanced'].includes(normalized)) return 3;
  if (['expert', 'technical'].includes(normalized)) return 4;
  return 0;
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalize(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function dedupeEvidence(values: BailoutEvidenceRef[]): BailoutEvidenceRef[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value?.id || seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

function dedupeTriggers(values: BailoutTrigger[]): BailoutTrigger[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.routeId}:${value.segmentId ?? ''}:${value.triggerType}:${value.severity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

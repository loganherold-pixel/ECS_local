import {
  haversineDistanceMeters,
  nearestPointOnRoute,
  normalizeRouteGeometryCoordinates,
  totalRouteDistanceMeters,
} from '../routeContext/routeContextGeometry';
import type { RouteContextCoordinate } from '../routeContext/routeContextTypes';
import {
  assessSourceTruth,
  evaluateSourceTruthRef,
  sanitizeSourceTruthRef,
  type SourceTruthConfidence,
  type SourceTruthPolicyKey,
  type SourceTruthRef,
} from '../sourceTruth';
import {
  CONVOY_LOCATION_FRESH_UNDER_MS,
  classifyConvoyLocationStaleness,
} from './convoyTrackingThresholds';

export const CONVOY_REGROUP_MAX_LOCATION_ACCURACY_METERS = 100;
export const CONVOY_REGROUP_OFF_ROUTE_BASE_METERS = 150;
export const CONVOY_REGROUP_CANDIDATE_CORRIDOR_METERS = 500;
export const CONVOY_REGROUP_WATCH_SPREAD_METERS = 2.5 * 1609.344;
export const CONVOY_REGROUP_DISPERSED_SPREAD_METERS = 5 * 1609.344;
export const CONVOY_REGROUP_WATCH_SPREAD_SECONDS = 8 * 60;
export const CONVOY_REGROUP_DISPERSED_SPREAD_SECONDS = 15 * 60;
export const SMART_RALLY_HAZARD_CONFLICT_METERS = 500;
export const SMART_RALLY_DAYLIGHT_CAUTION_MINUTES = 30;

const FUTURE_LOCATION_TOLERANCE_MS = 5_000;
const MIN_ROUTE_SPEED_MPS = 1;
const CANDIDATE_BEHIND_TOLERANCE_METERS = 50;

export type ConvoyRegroupPlannerStatus =
  | 'disabled'
  | 'restricted'
  | 'unavailable'
  | 'not_needed'
  | 'proposal';

export type ConvoyDispersionPosture = 'cohesive' | 'watch' | 'dispersed' | 'unknown';

export type ConvoyRegroupCandidateType =
  | 'rally'
  | 'waypoint'
  | 'turnaround'
  | 'camp'
  | 'resupply'
  | 'bailout'
  // Legacy values remain readable, but Smart Rally never selects them.
  | 'staging'
  | 'verified_context';

export const SMART_RALLY_ALLOWED_CANDIDATE_TYPES = [
  'rally',
  'waypoint',
  'turnaround',
  'camp',
  'resupply',
  'bailout',
] as const satisfies readonly ConvoyRegroupCandidateType[];

export type SmartRallyCandidateType = (typeof SMART_RALLY_ALLOWED_CANDIDATE_TYPES)[number];

export type ConvoyRegroupVehicleSuitability =
  | 'verified_suitable'
  | 'conditional'
  | 'unknown'
  | 'unsuitable';

export type ConvoyRegroupCandidateAccess =
  | 'verified_open'
  | 'unknown'
  | 'restricted'
  | 'closed'
  | 'prohibited';

export type ConvoyRegroupStoppingSuitability =
  | 'verified'
  | 'conditional'
  | 'unknown'
  | 'unsuitable';

export type ConvoyRegroupCandidatePosture = 'verified' | 'conditional' | 'unsuitable' | 'unknown';

export type ConvoyRegroupMemberExclusionReason =
  | 'restricted'
  | 'missing_location'
  | 'invalid_coordinate'
  | 'invalid_timestamp'
  | 'future_timestamp'
  | 'not_current'
  | 'accuracy_missing'
  | 'inaccurate'
  | 'non_live_origin'
  | 'source_unavailable'
  | 'member_offline';

export interface ConvoyRegroupCoordinate {
  lat: number;
  lng: number;
}

export interface ConvoyRegroupMemberInput {
  memberId: string;
  label: string;
  role: 'lead' | 'sweep' | 'member' | 'support';
  locationVisibility?: 'visible' | 'restricted';
  coordinate?: ConvoyRegroupCoordinate | null;
  capturedAt?: string | null;
  accuracyMeters?: number | null;
  speedMps?: number | null;
  movementStatus?: 'moving' | 'stopped' | 'delayed' | 'offline' | 'needs_assistance' | 'unknown';
  explicitlyStale?: boolean;
  sourceTruth: SourceTruthRef;
}

export interface ConvoyRegroupRouteInput {
  id: string;
  title?: string | null;
  coordinates: RouteContextCoordinate[];
  averageSpeedMps?: number | null;
  sourceTruth: SourceTruthRef;
}

export interface ConvoyRegroupCandidateInput {
  id: string;
  title: string;
  type: ConvoyRegroupCandidateType;
  coordinate: ConvoyRegroupCoordinate;
  access: ConvoyRegroupCandidateAccess;
  stoppingSuitability: ConvoyRegroupStoppingSuitability;
  vehicleSuitability?: ConvoyRegroupVehicleSuitability;
  trailerSuitability?: ConvoyRegroupVehicleSuitability;
  sourceTruth: SourceTruthRef;
  sourceTruthPolicyKey?: SourceTruthPolicyKey;
  rationale?: string[];
  warningCodes?: string[];
  sourceEntity?: {
    store: 'routeStore' | 'pinStore' | 'bailoutStore' | 'routeContextEngine' | 'dispatch';
    id: string;
    routeId?: string | null;
    index?: number | null;
  };
}

export interface ConvoyRegroupDaylightInput {
  status: 'daylight' | 'near_sunset' | 'after_sunset' | 'before_sunrise' | 'unavailable';
  sunsetAt?: string | null;
  remainingMinutes?: number | null;
  sourceTruth: SourceTruthRef;
}

export interface ConvoyRegroupVehicleConstraints {
  trailerPresent: boolean | null;
  sourceTruth?: SourceTruthRef | null;
}

export interface ConvoyRegroupHazardInput {
  id: string;
  title: string;
  coordinate: ConvoyRegroupCoordinate;
  blocking: boolean | null;
  sourceTruth: SourceTruthRef;
}

export interface ConvoyRegroupPlannerInput {
  enabled: boolean;
  positionSharingEnabled: boolean;
  memberLocationPermissionAllowed: boolean;
  activeConvoyId?: string | null;
  route?: ConvoyRegroupRouteInput | null;
  members: ConvoyRegroupMemberInput[];
  candidates: ConvoyRegroupCandidateInput[];
  hazards?: ConvoyRegroupHazardInput[];
  daylight?: ConvoyRegroupDaylightInput | null;
  vehicleConstraints?: ConvoyRegroupVehicleConstraints | null;
  now?: number | string | Date;
}

export interface ConvoyRegroupMemberProjection {
  memberId: string;
  label: string;
  role: ConvoyRegroupMemberInput['role'];
  ageMs: number;
  accuracyMeters: number;
  distanceAlongRouteMeters: number;
  distanceFromRouteMeters: number;
  offRoute: boolean;
  needsAssistance: boolean;
  sourceTruth: SourceTruthRef;
}

export interface ConvoyRegroupExcludedMember {
  reason: ConvoyRegroupMemberExclusionReason;
  memberId?: string;
  label?: string;
  role?: ConvoyRegroupMemberInput['role'];
  ageMs?: number | null;
  accuracyMeters?: number | null;
}

export interface ConvoyRegroupExcludedSummary {
  total: number;
  restricted: number;
  staleOrAging: number;
  inaccurateOrUnknown: number;
  unavailable: number;
}

export interface ConvoyRegroupEtaWindow {
  earliestSeconds: number;
  latestSeconds: number;
  spreadSeconds: number;
}

export interface ConvoyRegroupCandidateEvaluation {
  candidate: ConvoyRegroupCandidateInput;
  posture: ConvoyRegroupCandidatePosture;
  score: number;
  routeDistanceMeters: number | null;
  distanceFromRouteMeters: number | null;
  etaWindow: ConvoyRegroupEtaWindow | null;
  reasons: string[];
  missingInputs: string[];
  warningCodes: string[];
  sourceTruth: SourceTruthRef;
}

export interface ConvoyRegroupPostureSummary {
  reportedMemberCount: number;
  activeMemberCount: number;
  staleMemberCount: number;
  assistanceMemberCount: number;
  offRouteMemberCount: number;
  routeProgressSpreadMeters: number | null;
  leadToSweepSpreadMeters: number | null;
  excludedMemberCount: number;
}

export interface ConvoyRegroupProposal {
  fingerprint: string;
  candidate: ConvoyRegroupCandidateEvaluation;
  rationale: string[];
  recommendedVerification: string[];
  confidence: SourceTruthConfidence;
  sourceTruth: SourceTruthRef;
  operatorActionRequired: true;
  previewOnly: true;
}

export interface ConvoyRegroupPlannerResult {
  status: ConvoyRegroupPlannerStatus;
  posture: ConvoyDispersionPosture;
  generatedAt: string;
  routeId: string | null;
  spreadMeters: number | null;
  spreadSeconds: number | null;
  leadToSweepMeters: number | null;
  leadToSweepSeconds: number | null;
  offRouteCount: number;
  includedMembers: ConvoyRegroupMemberProjection[];
  excludedMembers: ConvoyRegroupExcludedMember[];
  excludedSummary: ConvoyRegroupExcludedSummary;
  postureSummary: ConvoyRegroupPostureSummary;
  candidateEvaluations: ConvoyRegroupCandidateEvaluation[];
  proposal: ConvoyRegroupProposal | null;
  alternateCandidate: ConvoyRegroupCandidateEvaluation | null;
  confidence: SourceTruthConfidence;
  sourceTruth: SourceTruthRef;
  inputSources: SourceTruthRef[];
  reasonCode: string | null;
  message: string;
  warnings: string[];
  risksAndUnknowns: string[];
  automaticActions: [];
  deterministic: true;
}

type EligibleMemberResult = {
  included: ConvoyRegroupMemberProjection[];
  excluded: ConvoyRegroupExcludedMember[];
};

const CONFIDENCE_RANK: Record<SourceTruthConfidence, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function finiteCoordinate(value: ConvoyRegroupCoordinate | null | undefined): value is ConvoyRegroupCoordinate {
  return Boolean(
    value &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    Math.abs(value.lat) <= 90 &&
    Math.abs(value.lng) <= 180,
  );
}

function normalizeNow(value: ConvoyRegroupPlannerInput['now']): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)));
}

function minimumConfidence(values: SourceTruthConfidence[]): SourceTruthConfidence {
  if (values.length === 0) return 'unknown';
  return values.reduce((lowest, value) => (
    CONFIDENCE_RANK[value] < CONFIDENCE_RANK[lowest] ? value : lowest
  ), values[0]);
}

function lowerConfidence(value: SourceTruthConfidence, steps = 1): SourceTruthConfidence {
  const order: SourceTruthConfidence[] = ['unknown', 'low', 'medium', 'high'];
  const index = order.indexOf(value);
  if (index <= 0) return value === 'unknown' ? 'unknown' : 'low';
  return order[Math.max(1, index - steps)];
}

function summarizeExclusions(excluded: ConvoyRegroupExcludedMember[]): ConvoyRegroupExcludedSummary {
  return {
    total: excluded.length,
    restricted: excluded.filter((member) => member.reason === 'restricted').length,
    staleOrAging: excluded.filter((member) => (
      member.reason === 'not_current' ||
      member.reason === 'invalid_timestamp' ||
      member.reason === 'future_timestamp'
    )).length,
    inaccurateOrUnknown: excluded.filter((member) => (
      member.reason === 'accuracy_missing' || member.reason === 'inaccurate'
    )).length,
    unavailable: excluded.filter((member) => (
      member.reason === 'missing_location' ||
      member.reason === 'invalid_coordinate' ||
      member.reason === 'source_unavailable' ||
      member.reason === 'non_live_origin' ||
      member.reason === 'member_offline'
    )).length,
  };
}

function isSmartRallyCandidateType(type: ConvoyRegroupCandidateType): type is SmartRallyCandidateType {
  return (SMART_RALLY_ALLOWED_CANDIDATE_TYPES as readonly ConvoyRegroupCandidateType[]).includes(type);
}

function buildPostureSummary(args: {
  reportedMemberCount: number;
  included?: readonly ConvoyRegroupMemberProjection[];
  excluded?: readonly ConvoyRegroupExcludedMember[];
  spreadMeters?: number | null;
  leadToSweepMeters?: number | null;
}): ConvoyRegroupPostureSummary {
  const included = args.included ?? [];
  const excluded = args.excluded ?? [];
  return {
    reportedMemberCount: Math.max(0, args.reportedMemberCount),
    activeMemberCount: included.length,
    staleMemberCount: excluded.filter((member) => (
      member.reason === 'not_current' ||
      member.reason === 'invalid_timestamp' ||
      member.reason === 'future_timestamp'
    )).length,
    assistanceMemberCount: included.filter((member) => member.needsAssistance).length,
    offRouteMemberCount: included.filter((member) => member.offRoute).length,
    routeProgressSpreadMeters: args.spreadMeters ?? null,
    leadToSweepSpreadMeters: args.leadToSweepMeters ?? null,
    excludedMemberCount: excluded.length,
  };
}

function plannerSourceTruth(args: {
  generatedAt: string;
  observedAt?: string | null;
  confidence: SourceTruthConfidence;
  availability: 'usable' | 'degraded' | 'unavailable';
  coverage: 'complete' | 'partial' | 'unknown';
  warningCodes: string[];
  conflict?: boolean;
}): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id: 'convoy-regroup-planner-result',
    origin: 'inferred',
    authority: 'ECS Convoy Regroup Planner',
    provider: null,
    observedAt: args.observedAt ?? args.generatedAt,
    fetchedAt: args.generatedAt,
    expiresAt: null,
    confidence: args.confidence,
    coverage: args.coverage,
    availability: args.availability,
    conflict: args.conflict === true,
    warningCodes: args.warningCodes,
  });
}

function emptyResult(args: {
  status: ConvoyRegroupPlannerStatus;
  posture?: ConvoyDispersionPosture;
  generatedAt: string;
  routeId?: string | null;
  reasonCode: string;
  message: string;
  warnings?: string[];
  excludedMembers?: ConvoyRegroupExcludedMember[];
  inputSources?: SourceTruthRef[];
  reportedMemberCount?: number;
}): ConvoyRegroupPlannerResult {
  const excludedMembers = args.excludedMembers ?? [];
  const warnings = unique([args.reasonCode, ...(args.warnings ?? [])]);
  const sourceTruth = plannerSourceTruth({
    generatedAt: args.generatedAt,
    confidence: 'unknown',
    availability: 'unavailable',
    coverage: excludedMembers.length > 0 ? 'partial' : 'unknown',
    warningCodes: warnings,
  });
  return {
    status: args.status,
    posture: args.posture ?? 'unknown',
    generatedAt: args.generatedAt,
    routeId: args.routeId ?? null,
    spreadMeters: null,
    spreadSeconds: null,
    leadToSweepMeters: null,
    leadToSweepSeconds: null,
    offRouteCount: 0,
    includedMembers: [],
    excludedMembers,
    excludedSummary: summarizeExclusions(excludedMembers),
    postureSummary: buildPostureSummary({
      reportedMemberCount: args.reportedMemberCount ?? 0,
      excluded: excludedMembers,
    }),
    candidateEvaluations: [],
    proposal: null,
    alternateCandidate: null,
    confidence: 'unknown',
    sourceTruth,
    inputSources: (args.inputSources ?? []).map(sanitizeSourceTruthRef),
    reasonCode: args.reasonCode,
    message: args.message,
    warnings,
    risksAndUnknowns: warnings,
    automaticActions: [],
    deterministic: true,
  };
}

function evaluateMembers(
  members: readonly ConvoyRegroupMemberInput[],
  routeCoordinates: readonly RouteContextCoordinate[],
  nowMs: number,
): EligibleMemberResult {
  const included: ConvoyRegroupMemberProjection[] = [];
  const excluded: ConvoyRegroupExcludedMember[] = [];

  for (const member of members) {
    if (member.locationVisibility === 'restricted') {
      // Restricted output is deliberately anonymous and coordinate-free.
      excluded.push({ reason: 'restricted' });
      continue;
    }

    const base = {
      memberId: member.memberId,
      label: member.label,
      role: member.role,
      accuracyMeters: member.accuracyMeters ?? null,
    };
    if (member.movementStatus === 'offline') {
      excluded.push({ ...base, reason: 'member_offline' });
      continue;
    }
    if (!member.coordinate) {
      excluded.push({ ...base, reason: 'missing_location' });
      continue;
    }
    if (!finiteCoordinate(member.coordinate)) {
      excluded.push({ ...base, reason: 'invalid_coordinate' });
      continue;
    }
    if (member.sourceTruth.origin !== 'live') {
      excluded.push({ ...base, reason: 'non_live_origin' });
      continue;
    }
    const sourceEvaluation = evaluateSourceTruthRef(member.sourceTruth, {
      policyKey: 'convoy_member_location',
      now: nowMs,
    });
    if (sourceEvaluation.availability === 'unavailable') {
      excluded.push({ ...base, reason: 'source_unavailable' });
      continue;
    }

    const capturedMs = Date.parse(String(member.capturedAt ?? ''));
    if (!Number.isFinite(capturedMs)) {
      excluded.push({ ...base, reason: 'invalid_timestamp' });
      continue;
    }
    if (capturedMs - nowMs > FUTURE_LOCATION_TOLERANCE_MS) {
      excluded.push({ ...base, reason: 'future_timestamp', ageMs: null });
      continue;
    }
    const ageMs = Math.max(0, nowMs - capturedMs);
    const staleness = classifyConvoyLocationStaleness(member.capturedAt, nowMs);
    if (
      member.explicitlyStale ||
      staleness.staleness !== 'fresh' ||
      ageMs >= CONVOY_LOCATION_FRESH_UNDER_MS ||
      sourceEvaluation.freshness !== 'live'
    ) {
      excluded.push({ ...base, reason: 'not_current', ageMs });
      continue;
    }
    if (member.accuracyMeters == null || !Number.isFinite(member.accuracyMeters)) {
      excluded.push({ ...base, reason: 'accuracy_missing', ageMs });
      continue;
    }
    if (member.accuracyMeters < 0 || member.accuracyMeters > CONVOY_REGROUP_MAX_LOCATION_ACCURACY_METERS) {
      excluded.push({ ...base, reason: 'inaccurate', ageMs });
      continue;
    }

    const projection = nearestPointOnRoute(member.coordinate, routeCoordinates);
    if (!projection) {
      excluded.push({ ...base, reason: 'invalid_coordinate', ageMs });
      continue;
    }
    const offRouteThreshold = Math.max(
      CONVOY_REGROUP_OFF_ROUTE_BASE_METERS,
      member.accuracyMeters * 2,
    );
    included.push({
      memberId: member.memberId,
      label: member.label,
      role: member.role,
      ageMs,
      accuracyMeters: member.accuracyMeters,
      distanceAlongRouteMeters: projection.distanceAlongRouteMeters,
      distanceFromRouteMeters: projection.distanceMeters,
      offRoute: projection.distanceMeters > offRouteThreshold,
      needsAssistance: member.movementStatus === 'needs_assistance',
      sourceTruth: sanitizeSourceTruthRef(member.sourceTruth),
    });
  }

  return { included, excluded };
}

function routeSpeed(route: ConvoyRegroupRouteInput): number | null {
  const value = Number(route.averageSpeedMps);
  return Number.isFinite(value) && value >= MIN_ROUTE_SPEED_MPS ? value : null;
}

function calculateDispersion(
  members: readonly ConvoyRegroupMemberProjection[],
  speedMps: number | null,
): {
  posture: ConvoyDispersionPosture;
  spreadMeters: number;
  spreadSeconds: number | null;
  leadToSweepMeters: number | null;
  leadToSweepSeconds: number | null;
  offRouteCount: number;
} {
  const distances = members.map((member) => member.distanceAlongRouteMeters);
  const spreadMeters = Math.max(...distances) - Math.min(...distances);
  const spreadSeconds = speedMps ? spreadMeters / speedMps : null;
  const lead = members.find((member) => member.role === 'lead' && !member.offRoute) ?? null;
  const sweep = members.find((member) => member.role === 'sweep' && !member.offRoute) ?? null;
  const leadToSweepMeters = lead && sweep
    ? Math.abs(lead.distanceAlongRouteMeters - sweep.distanceAlongRouteMeters)
    : null;
  const leadToSweepSeconds = leadToSweepMeters != null && speedMps
    ? leadToSweepMeters / speedMps
    : null;
  const offRouteCount = members.filter((member) => member.offRoute).length;
  const assistanceCount = members.filter((member) => member.needsAssistance).length;
  const dispersed =
    assistanceCount > 0 ||
    offRouteCount > 0 ||
    spreadMeters >= CONVOY_REGROUP_DISPERSED_SPREAD_METERS ||
    (spreadSeconds != null && spreadSeconds >= CONVOY_REGROUP_DISPERSED_SPREAD_SECONDS) ||
    (leadToSweepSeconds != null && leadToSweepSeconds >= CONVOY_REGROUP_DISPERSED_SPREAD_SECONDS);
  const watch =
    spreadMeters >= CONVOY_REGROUP_WATCH_SPREAD_METERS ||
    (spreadSeconds != null && spreadSeconds >= CONVOY_REGROUP_WATCH_SPREAD_SECONDS) ||
    (leadToSweepSeconds != null && leadToSweepSeconds >= CONVOY_REGROUP_WATCH_SPREAD_SECONDS);

  return {
    posture: dispersed ? 'dispersed' : watch ? 'watch' : 'cohesive',
    spreadMeters,
    spreadSeconds,
    leadToSweepMeters,
    leadToSweepSeconds,
    offRouteCount,
  };
}

function projectHazards(
  hazards: readonly ConvoyRegroupHazardInput[],
  routeCoordinates: readonly RouteContextCoordinate[],
): Array<ConvoyRegroupHazardInput & { routeDistanceMeters: number; distanceFromRouteMeters: number }> {
  return hazards.flatMap((hazard) => {
    if (hazard.blocking === false) return [];
    const projection = nearestPointOnRoute(hazard.coordinate, routeCoordinates);
    if (!projection || projection.distanceMeters > CONVOY_REGROUP_CANDIDATE_CORRIDOR_METERS) return [];
    return [{
      ...hazard,
      routeDistanceMeters: projection.distanceAlongRouteMeters,
      distanceFromRouteMeters: projection.distanceMeters,
    }];
  });
}

function evaluateCandidate(args: {
  candidate: ConvoyRegroupCandidateInput;
  routeCoordinates: readonly RouteContextCoordinate[];
  members: readonly ConvoyRegroupMemberProjection[];
  speedMps: number | null;
  routeHazards: ReturnType<typeof projectHazards>;
  daylight?: ConvoyRegroupDaylightInput | null;
  vehicleConstraints?: ConvoyRegroupVehicleConstraints | null;
  nowMs: number;
}): ConvoyRegroupCandidateEvaluation {
  const {
    candidate,
    routeCoordinates,
    members,
    speedMps,
    routeHazards,
    daylight,
    vehicleConstraints,
    nowMs,
  } = args;
  const projection = nearestPointOnRoute(candidate.coordinate, routeCoordinates);
  const reasons = [...(candidate.rationale ?? [])];
  const missingInputs: string[] = [];
  const warningCodes = [...(candidate.warningCodes ?? []), ...candidate.sourceTruth.warningCodes];
  let posture: ConvoyRegroupCandidatePosture = 'conditional';
  let score = 100;

  if (!projection) {
    return {
      candidate,
      posture: 'unknown',
      score: 0,
      routeDistanceMeters: null,
      distanceFromRouteMeters: null,
      etaWindow: null,
      reasons: unique([...reasons, 'Route projection is unavailable for this candidate.']),
      missingInputs: ['candidate_route_projection'],
      warningCodes: unique([...warningCodes, 'candidate_projection_unavailable']),
      sourceTruth: sanitizeSourceTruthRef(candidate.sourceTruth),
    };
  }

  const frontmostDistance = Math.max(...members.map((member) => member.distanceAlongRouteMeters));
  const rearmostDistance = Math.min(...members.map((member) => member.distanceAlongRouteMeters));
  const distanceAheadMeters = projection.distanceAlongRouteMeters - frontmostDistance;
  const candidateSource = evaluateSourceTruthRef(candidate.sourceTruth, {
    policyKey: candidate.sourceTruthPolicyKey ?? 'manual_user_state',
    now: nowMs,
  });

  if (projection.distanceMeters > CONVOY_REGROUP_CANDIDATE_CORRIDOR_METERS) {
    posture = 'unsuitable';
    reasons.push('Candidate is outside the reliable active-route corridor.');
    warningCodes.push('candidate_outside_route_corridor');
  }
  if (distanceAheadMeters < -CANDIDATE_BEHIND_TOLERANCE_METERS) {
    posture = 'unsuitable';
    reasons.push('Candidate is behind the front of the convoy and would require backtracking.');
    warningCodes.push('candidate_behind_convoy_front');
  }
  if (candidate.access === 'closed' || candidate.access === 'restricted' || candidate.access === 'prohibited') {
    posture = 'unsuitable';
    reasons.push('Known access evidence does not support using this point.');
    warningCodes.push(`candidate_access_${candidate.access}`);
  }
  if (candidate.stoppingSuitability === 'unsuitable') {
    posture = 'unsuitable';
    reasons.push('Known context marks this point unsuitable for a regroup stop.');
    warningCodes.push('candidate_stopping_unsuitable');
  }

  const blockingHazard = routeHazards.find((hazard) => (
    hazard.blocking === true &&
    hazard.routeDistanceMeters >= rearmostDistance &&
    hazard.routeDistanceMeters <= projection.distanceAlongRouteMeters
  ));
  if (blockingHazard) {
    posture = 'unsuitable';
    reasons.push(`Candidate is beyond the known blocking hazard: ${blockingHazard.title}.`);
    warningCodes.push('candidate_beyond_blocking_hazard');
  }
  const nearbyHazard = routeHazards.find((hazard) => {
    const distanceMeters = haversineDistanceMeters(candidate.coordinate, hazard.coordinate);
    return distanceMeters != null && distanceMeters <= SMART_RALLY_HAZARD_CONFLICT_METERS;
  });
  if (nearbyHazard?.blocking === true) {
    posture = 'unsuitable';
    reasons.push(`Candidate conflicts with the known blocking hazard: ${nearbyHazard.title}.`);
    warningCodes.push('candidate_blocking_hazard_conflict');
  } else if (nearbyHazard) {
    score -= 20;
    reasons.push(`A nearby hazard report requires operator verification: ${nearbyHazard.title}.`);
    warningCodes.push('candidate_near_unverified_hazard');
  }

  if (candidateSource.availability === 'unavailable') {
    if (posture !== 'unsuitable') posture = 'unknown';
    reasons.push('Candidate source is unavailable.');
    missingInputs.push('candidate_source');
    warningCodes.push('candidate_source_unavailable');
  } else if (candidateSource.freshness === 'stale' || candidateSource.freshness === 'expired') {
    score -= 25;
    reasons.push('Candidate source is stale or expired and requires verification.');
    warningCodes.push('candidate_source_not_current');
  }

  const vehicleSuitability = candidate.vehicleSuitability ?? 'unknown';
  const trailerSuitability = candidate.trailerSuitability ?? 'unknown';
  if (vehicleSuitability === 'unsuitable') {
    posture = 'unsuitable';
    reasons.push('Known vehicle-fit evidence marks this point unsuitable for the convoy.');
    warningCodes.push('candidate_vehicle_unsuitable');
  } else if (vehicleSuitability === 'conditional') {
    score -= 12;
    reasons.push('Vehicle fit is conditional and requires operator verification.');
    warningCodes.push('candidate_vehicle_fit_conditional');
  } else if (vehicleSuitability === 'unknown') {
    score -= 5;
    missingInputs.push('candidate_vehicle_suitability');
    warningCodes.push('candidate_vehicle_fit_unknown');
  }

  if (vehicleConstraints?.trailerPresent === true) {
    if (trailerSuitability === 'unsuitable') {
      posture = 'unsuitable';
      reasons.push('Known trailer-fit evidence marks this point unsuitable.');
      warningCodes.push('candidate_trailer_unsuitable');
    } else if (trailerSuitability === 'conditional') {
      score -= 15;
      reasons.push('Trailer access or turnaround is conditional and requires operator verification.');
      warningCodes.push('candidate_trailer_fit_conditional');
    } else if (trailerSuitability === 'unknown') {
      score -= 10;
      missingInputs.push('candidate_trailer_suitability');
      reasons.push('Trailer access and turnaround suitability are unknown.');
      warningCodes.push('candidate_trailer_fit_unknown');
    }
  } else if (vehicleConstraints?.trailerPresent == null) {
    missingInputs.push('convoy_trailer_state');
  }

  if (posture !== 'unsuitable' && posture !== 'unknown') {
    if (
      candidate.access === 'verified_open' &&
      candidate.stoppingSuitability === 'verified' &&
      candidateSource.availability === 'usable' &&
      vehicleSuitability === 'verified_suitable' &&
      (vehicleConstraints?.trailerPresent !== true || trailerSuitability === 'verified_suitable') &&
      !nearbyHazard
    ) {
      posture = 'verified';
      reasons.push('Known normalized context supports current access and stopping use.');
    } else {
      posture = 'conditional';
      reasons.push('Access, stopping, hazard, vehicle, or trailer suitability remains unverified; operator confirmation is required.');
      warningCodes.push('candidate_verification_required');
      score -= 20;
    }
  }

  score -= Math.max(0, distanceAheadMeters) / 1609.344;
  score -= projection.distanceMeters / 100;
  if (candidateSource.confidence === 'low' || candidateSource.confidence === 'unknown') score -= 12;

  let etaWindow: ConvoyRegroupEtaWindow | null = null;
  const onRouteMembers = members.filter((member) => !member.offRoute);
  if (speedMps && onRouteMembers.length === members.length) {
    const arrivalSeconds = onRouteMembers.map((member) => (
      Math.max(0, projection.distanceAlongRouteMeters - member.distanceAlongRouteMeters) / speedMps
    ));
    etaWindow = {
      earliestSeconds: Math.min(...arrivalSeconds),
      latestSeconds: Math.max(...arrivalSeconds),
      spreadSeconds: Math.max(...arrivalSeconds) - Math.min(...arrivalSeconds),
    };
    score -= Math.min(20, etaWindow.spreadSeconds / 300);
    if (etaWindow.spreadSeconds >= CONVOY_REGROUP_WATCH_SPREAD_SECONDS) {
      reasons.push('Member arrival spread remains material at this point.');
      warningCodes.push('candidate_arrival_spread_material');
    }
  } else {
    missingInputs.push(speedMps ? 'off_route_arrival_estimate' : 'route_speed');
    reasons.push('Arrival window is unknown because route speed or on-route projection is incomplete.');
  }

  const averageAccuracy = members.reduce((sum, member) => sum + member.accuracyMeters, 0) / members.length;
  const oldestAgeMs = Math.max(...members.map((member) => member.ageMs));
  score -= Math.min(8, averageAccuracy / 25);
  score -= Math.min(8, oldestAgeMs / 60_000);

  if (daylight) {
    const daylightSource = evaluateSourceTruthRef(daylight.sourceTruth, {
      policyKey: 'weather_forecast',
      now: nowMs,
    });
    const sunsetMs = Date.parse(String(daylight.sunsetAt ?? ''));
    const latestArrivalMs = etaWindow ? nowMs + etaWindow.latestSeconds * 1000 : null;
    if (daylightSource.availability === 'unavailable' || daylight.status === 'unavailable') {
      missingInputs.push('daylight');
      warningCodes.push('daylight_unavailable');
    } else if (daylight.status === 'after_sunset' || daylight.status === 'before_sunrise') {
      score -= 20;
      reasons.push('The current daylight state requires low-light verification before regrouping.');
      warningCodes.push('candidate_low_light_arrival');
    } else if (latestArrivalMs != null && Number.isFinite(sunsetMs)) {
      const marginMinutes = (sunsetMs - latestArrivalMs) / 60_000;
      if (marginMinutes < 0) {
        score -= 20;
        reasons.push('The latest projected arrival is after the available sunset estimate.');
        warningCodes.push('candidate_arrival_after_sunset');
      } else if (marginMinutes <= SMART_RALLY_DAYLIGHT_CAUTION_MINUTES) {
        score -= 10;
        reasons.push('The latest projected arrival has a limited daylight margin.');
        warningCodes.push('candidate_daylight_margin_limited');
      }
    } else if (!etaWindow) {
      missingInputs.push('candidate_daylight_arrival');
    }
    if (daylightSource.freshness === 'stale' || daylightSource.freshness === 'expired') {
      score -= 8;
      warningCodes.push('daylight_source_not_current');
    }
  } else {
    missingInputs.push('daylight');
  }

  return {
    candidate,
    posture,
    score: Math.max(0, Math.round(score * 10) / 10),
    routeDistanceMeters: projection.distanceAlongRouteMeters,
    distanceFromRouteMeters: projection.distanceMeters,
    etaWindow,
    reasons: unique(reasons),
    missingInputs: unique(missingInputs),
    warningCodes: unique(warningCodes),
    sourceTruth: sanitizeSourceTruthRef(candidate.sourceTruth),
  };
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function proposalFingerprint(args: {
  routeId: string;
  members: readonly ConvoyRegroupMemberProjection[];
  candidate: ConvoyRegroupCandidateEvaluation;
  posture: ConvoyDispersionPosture;
}): string {
  const memberState = args.members
    .map((member) => `${member.memberId}:${Math.round(member.distanceAlongRouteMeters / 100)}:${member.offRoute ? 1 : 0}`)
    .sort()
    .join('|');
  return `regroup-${stableHash([
    args.routeId,
    args.candidate.candidate.id,
    Math.round(args.candidate.routeDistanceMeters ?? 0),
    args.posture,
    memberState,
  ].join('|'))}`;
}

function oldestObservedAt(members: readonly ConvoyRegroupMemberProjection[]): string | null {
  const timestamps = members
    .map((member) => member.sourceTruth.observedAt)
    .filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))))
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  return timestamps[0] ?? null;
}

function proposalConfidence(args: {
  route: ConvoyRegroupRouteInput;
  members: readonly ConvoyRegroupMemberProjection[];
  candidate: ConvoyRegroupCandidateEvaluation;
  speedMps: number | null;
  supportingSources?: readonly SourceTruthRef[];
}): SourceTruthConfidence {
  const sourceAssessment = assessSourceTruth([
    args.route.sourceTruth,
    ...args.members.map((member) => member.sourceTruth),
    args.candidate.sourceTruth,
    ...(args.supportingSources ?? []),
  ], { policyKey: 'convoy_member_location' });
  let confidence = minimumConfidence([
    sourceAssessment.confidence,
    args.candidate.sourceTruth.confidence,
  ]);
  if (confidence === 'unknown') confidence = 'low';
  if (args.candidate.posture === 'conditional') confidence = lowerConfidence(confidence);
  if (!args.speedMps || args.members.some((member) => member.offRoute)) confidence = lowerConfidence(confidence);
  return confidence;
}

export function planConvoyRegroup(input: ConvoyRegroupPlannerInput): ConvoyRegroupPlannerResult {
  const nowMs = normalizeNow(input.now);
  const generatedAt = new Date(nowMs).toISOString();
  const reportedMemberCount = input.members.length;
  if (!input.enabled) {
    return emptyResult({
      status: 'disabled',
      generatedAt,
      reasonCode: 'feature_disabled',
      message: 'Smart Rally is disabled for this rollout.',
      reportedMemberCount,
    });
  }
  if (!input.positionSharingEnabled) {
    return emptyResult({
      status: 'restricted',
      generatedAt,
      reasonCode: 'position_sharing_gate_disabled',
      message: 'Smart Rally is unavailable until the approved position-sharing gate is enabled.',
      reportedMemberCount,
    });
  }
  if (!input.memberLocationPermissionAllowed) {
    return emptyResult({
      status: 'restricted',
      generatedAt,
      reasonCode: 'member_location_permission_denied',
      message: 'Member locations are restricted for this operator.',
      reportedMemberCount,
    });
  }
  if (!String(input.activeConvoyId ?? '').trim()) {
    return emptyResult({
      status: 'unavailable',
      generatedAt,
      reasonCode: 'no_active_convoy',
      message: 'Start or join an active convoy before evaluating Smart Rally posture.',
      reportedMemberCount,
    });
  }
  if (!input.route) {
    return emptyResult({
      status: 'unavailable',
      generatedAt,
      reasonCode: 'no_active_route',
      message: 'An active route is required to compare convoy progress.',
      reportedMemberCount,
    });
  }

  const routeCoordinates = normalizeRouteGeometryCoordinates(input.route.coordinates);
  if (routeCoordinates.length < 2 || totalRouteDistanceMeters(routeCoordinates) <= 0) {
    return emptyResult({
      status: 'unavailable',
      generatedAt,
      routeId: input.route.id,
      reasonCode: 'route_geometry_unavailable',
      message: 'Active route geometry is unavailable for reliable convoy projection.',
      inputSources: [input.route.sourceTruth],
      reportedMemberCount,
    });
  }
  const routeAssessment = evaluateSourceTruthRef(input.route.sourceTruth, {
    policyKey: 'offline_map_route_package',
    now: nowMs,
  });
  if (routeAssessment.availability === 'unavailable') {
    return emptyResult({
      status: 'unavailable',
      generatedAt,
      routeId: input.route.id,
      reasonCode: 'route_source_unavailable',
      message: 'Active route source evidence is unavailable.',
      inputSources: [input.route.sourceTruth],
      reportedMemberCount,
    });
  }

  const memberEvaluation = evaluateMembers(input.members, routeCoordinates, nowMs);
  const excludedSummary = summarizeExclusions(memberEvaluation.excluded);
  if (memberEvaluation.included.length < 2) {
    const unavailable = emptyResult({
        status: 'unavailable',
        generatedAt,
        routeId: input.route.id,
        reasonCode: 'insufficient_current_positions',
        message: 'At least two fresh, accurate, live member positions are required.',
        excludedMembers: memberEvaluation.excluded,
        inputSources: [input.route.sourceTruth],
        reportedMemberCount,
      });
    return {
      ...unavailable,
      includedMembers: memberEvaluation.included,
      postureSummary: buildPostureSummary({
        reportedMemberCount,
        included: memberEvaluation.included,
        excluded: memberEvaluation.excluded,
      }),
    };
  }

  const speedMps = routeSpeed(input.route);
  const dispersion = calculateDispersion(memberEvaluation.included, speedMps);
  const inputSources = [
    sanitizeSourceTruthRef(input.route.sourceTruth),
    ...memberEvaluation.included.map((member) => member.sourceTruth),
    ...(input.daylight ? [sanitizeSourceTruthRef(input.daylight.sourceTruth)] : []),
    ...(input.vehicleConstraints?.sourceTruth
      ? [sanitizeSourceTruthRef(input.vehicleConstraints.sourceTruth)]
      : []),
    ...(input.hazards ?? []).map((hazard) => sanitizeSourceTruthRef(hazard.sourceTruth)),
  ];
  const allowedCandidates = input.candidates.filter((candidate) => isSmartRallyCandidateType(candidate.type));
  const unsupportedCandidateCount = input.candidates.length - allowedCandidates.length;
  const postureSummary = buildPostureSummary({
    reportedMemberCount,
    included: memberEvaluation.included,
    excluded: memberEvaluation.excluded,
    spreadMeters: dispersion.spreadMeters,
    leadToSweepMeters: dispersion.leadToSweepMeters,
  });
  const baseWarnings = unique([
    routeAssessment.freshness === 'stale' || routeAssessment.freshness === 'expired'
      ? 'route_source_not_current'
      : null,
    excludedSummary.total > 0 ? 'members_excluded' : null,
    dispersion.offRouteCount > 0 ? 'member_off_route' : null,
    postureSummary.assistanceMemberCount > 0 ? 'member_assistance_requested' : null,
    excludedSummary.restricted > 0 ? 'restricted_members_excluded' : null,
    unsupportedCandidateCount > 0 ? 'unsupported_candidate_types_excluded' : null,
    speedMps == null ? 'route_speed_unavailable' : null,
  ]);

  if (dispersion.posture === 'cohesive') {
    const confidence = minimumConfidence(inputSources.map((source) => source.confidence));
    const sourceTruth = plannerSourceTruth({
      generatedAt,
      observedAt: oldestObservedAt(memberEvaluation.included),
      confidence,
      availability: excludedSummary.total > 0 ? 'degraded' : 'usable',
      coverage: excludedSummary.total > 0 ? 'partial' : 'complete',
      warningCodes: baseWarnings,
      conflict: inputSources.some((source) => source.conflict),
    });
    return {
      status: 'not_needed',
      posture: 'cohesive',
      generatedAt,
      routeId: input.route.id,
      spreadMeters: dispersion.spreadMeters,
      spreadSeconds: dispersion.spreadSeconds,
      leadToSweepMeters: dispersion.leadToSweepMeters,
      leadToSweepSeconds: dispersion.leadToSweepSeconds,
      offRouteCount: dispersion.offRouteCount,
      includedMembers: memberEvaluation.included,
      excludedMembers: memberEvaluation.excluded,
      excludedSummary,
      postureSummary,
      candidateEvaluations: [],
      proposal: null,
      alternateCandidate: null,
      confidence,
      sourceTruth,
      inputSources,
      reasonCode: 'convoy_within_spread_thresholds',
      message: 'Current eligible member positions remain within regroup thresholds.',
      warnings: baseWarnings,
      risksAndUnknowns: baseWarnings,
      automaticActions: [],
      deterministic: true,
    };
  }

  if (allowedCandidates.length === 0) {
    const unavailable = emptyResult({
      status: 'unavailable',
      posture: dispersion.posture,
      generatedAt,
      routeId: input.route.id,
      reasonCode: 'no_known_regroup_candidates',
      message: 'Convoy dispersion warrants review, but no known normalized regroup candidate is available.',
      warnings: baseWarnings,
      excludedMembers: memberEvaluation.excluded,
      inputSources,
      reportedMemberCount,
    });
    return {
      ...unavailable,
      spreadMeters: dispersion.spreadMeters,
      spreadSeconds: dispersion.spreadSeconds,
      leadToSweepMeters: dispersion.leadToSweepMeters,
      leadToSweepSeconds: dispersion.leadToSweepSeconds,
      offRouteCount: dispersion.offRouteCount,
      includedMembers: memberEvaluation.included,
      postureSummary,
    };
  }

  const routeHazards = projectHazards(input.hazards ?? [], routeCoordinates);
  const evaluations = allowedCandidates.map((candidate) => evaluateCandidate({
    candidate,
    routeCoordinates,
    members: memberEvaluation.included,
    speedMps,
    routeHazards,
    daylight: input.daylight,
    vehicleConstraints: input.vehicleConstraints,
    nowMs,
  })).sort((left, right) => {
    const postureRank: Record<ConvoyRegroupCandidatePosture, number> = {
      verified: 3,
      conditional: 2,
      unknown: 1,
      unsuitable: 0,
    };
    return postureRank[right.posture] - postureRank[left.posture] ||
      right.score - left.score ||
      String(left.candidate.id).localeCompare(String(right.candidate.id));
  });
  const selected = evaluations.find((evaluation) => (
    evaluation.posture === 'verified' || evaluation.posture === 'conditional'
  )) ?? null;
  const alternateCandidate = selected
    ? evaluations.find((evaluation) => (
        evaluation.candidate.id !== selected.candidate.id &&
        (evaluation.posture === 'verified' || evaluation.posture === 'conditional')
      )) ?? null
    : null;

  if (!selected) {
    const confidence: SourceTruthConfidence = 'low';
    const warnings = unique([
      ...baseWarnings,
      'no_suitable_regroup_candidate',
      ...evaluations.flatMap((candidate) => candidate.warningCodes),
    ]);
    const sourceTruth = plannerSourceTruth({
      generatedAt,
      observedAt: oldestObservedAt(memberEvaluation.included),
      confidence,
      availability: 'degraded',
      coverage: 'partial',
      warningCodes: warnings,
      conflict: inputSources.some((source) => source.conflict),
    });
    return {
      status: 'unavailable',
      posture: dispersion.posture,
      generatedAt,
      routeId: input.route.id,
      spreadMeters: dispersion.spreadMeters,
      spreadSeconds: dispersion.spreadSeconds,
      leadToSweepMeters: dispersion.leadToSweepMeters,
      leadToSweepSeconds: dispersion.leadToSweepSeconds,
      offRouteCount: dispersion.offRouteCount,
      includedMembers: memberEvaluation.included,
      excludedMembers: memberEvaluation.excluded,
      excludedSummary,
      postureSummary,
      candidateEvaluations: evaluations,
      proposal: null,
      alternateCandidate: null,
      confidence,
      sourceTruth,
      inputSources,
      reasonCode: 'no_suitable_regroup_candidate',
      message: 'Known candidates do not support a regroup proposal with current evidence.',
      warnings,
      risksAndUnknowns: warnings,
      automaticActions: [],
      deterministic: true,
    };
  }

  const confidence = proposalConfidence({
    route: input.route,
    members: memberEvaluation.included,
    candidate: selected,
    speedMps,
    supportingSources: inputSources.slice(1 + memberEvaluation.included.length),
  });
  const warnings = unique([
    ...baseWarnings,
    ...selected.warningCodes,
    selected.posture === 'conditional' ? 'operator_verification_required' : null,
  ]);
  const sourceTruth = plannerSourceTruth({
    generatedAt,
    observedAt: oldestObservedAt(memberEvaluation.included),
    confidence,
    availability: selected.posture === 'verified' && excludedSummary.total === 0 ? 'usable' : 'degraded',
    coverage: selected.posture === 'verified' && excludedSummary.total === 0 ? 'complete' : 'partial',
    warningCodes: warnings,
    conflict: [...inputSources, selected.sourceTruth].some((source) => source.conflict),
  });
  const rationale = unique([
    dispersion.offRouteCount > 0
      ? `${dispersion.offRouteCount} eligible member position${dispersion.offRouteCount === 1 ? ' is' : 's are'} off the reliable route corridor.`
      : null,
    postureSummary.assistanceMemberCount > 0
      ? `${postureSummary.assistanceMemberCount} permission-visible member${postureSummary.assistanceMemberCount === 1 ? ' has' : 's have'} requested assistance.`
      : null,
    excludedSummary.total > 0
      ? `${excludedSummary.total} member position${excludedSummary.total === 1 ? ' was' : 's were'} excluded because it was stale, restricted, inaccurate, or unavailable.`
      : null,
    `Eligible convoy spread is ${(dispersion.spreadMeters / 1609.344).toFixed(1)} miles along the active route.`,
    selected.posture === 'conditional'
      ? 'The selected point is known to ECS, but current access or stopping suitability still needs operator verification.'
      : 'The selected point has verified normalized access and stopping context.',
  ]);
  const proposal: ConvoyRegroupProposal = {
    fingerprint: proposalFingerprint({
      routeId: input.route.id,
      members: memberEvaluation.included,
      candidate: selected,
      posture: dispersion.posture,
    }),
    candidate: selected,
    rationale,
    recommendedVerification: unique([
      'Confirm current access and stopping conditions before directing the convoy.',
      selected.posture === 'conditional' ? 'Verify that the point can accommodate the convoy without creating a traffic or access conflict.' : null,
      'Confirm all intended recipients can receive and acknowledge the Rally ping.',
    ]),
    confidence,
    sourceTruth,
    operatorActionRequired: true,
    previewOnly: true,
  };

  return {
    status: 'proposal',
    posture: dispersion.posture,
    generatedAt,
    routeId: input.route.id,
    spreadMeters: dispersion.spreadMeters,
    spreadSeconds: dispersion.spreadSeconds,
    leadToSweepMeters: dispersion.leadToSweepMeters,
    leadToSweepSeconds: dispersion.leadToSweepSeconds,
    offRouteCount: dispersion.offRouteCount,
    includedMembers: memberEvaluation.included,
    excludedMembers: memberEvaluation.excluded,
    excludedSummary,
    postureSummary,
    candidateEvaluations: evaluations,
    proposal,
    alternateCandidate,
    confidence,
    sourceTruth,
    inputSources: [...inputSources, selected.sourceTruth],
    reasonCode: null,
    message: 'A Smart Rally proposal is ready for operator review. Nothing has been sent or rerouted.',
    warnings,
    risksAndUnknowns: unique([
      ...selected.warningCodes,
      ...selected.missingInputs.map((inputName) => `missing_${inputName}`),
    ]),
    automaticActions: [],
    deterministic: true,
  };
}

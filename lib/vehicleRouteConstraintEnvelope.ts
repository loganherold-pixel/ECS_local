import {
  calculateRigCompatibilityV2,
  type RigCompatibilityV2FactorResult,
  type RigCompatibilityV2Input,
  type RigCompatibilityV2SourceEvidence,
} from './rigCompatibilityV2';
import {
  sanitizeSourceTruthRef,
  type SourceTruthConfidence,
  type SourceTruthCoverage,
  type SourceTruthRef,
} from './sourceTruth';

export const VEHICLE_ROUTE_CONSTRAINT_ENVELOPE_VERSION = 'vehicle_route_constraint_envelope.v1' as const;

export const VEHICLE_ROUTE_CONSTRAINT_FACTOR_IDS = [
  'payload_weight',
  'load_distribution',
  'tire_suitability',
  'suspension_lift',
  'trailer_constraints',
  'grade_elevation',
  'terrain_exposure',
  'fuel_range',
  'remoteness_bailout',
  'recovery_readiness',
  'route_advisories',
] as const;

export type VehicleRouteConstraintFactorId = (typeof VEHICLE_ROUTE_CONSTRAINT_FACTOR_IDS)[number];

export type VehicleRouteConstraintPosture =
  | 'within_envelope'
  | 'watch'
  | 'exceeds_known_envelope'
  | 'unknown';

export type VehicleRouteConstraintRiskLevel = 'clear' | 'watch' | 'caution' | 'critical';
export type VehicleRouteTerrainClass = 'easy' | 'moderate' | 'challenging' | 'difficult';
export type VehicleRouteAdvisoryCoverage = 'complete' | 'partial' | 'unknown';

export const VEHICLE_ROUTE_UNSUPPORTED_CONSTRAINTS = [
  'water_fording_depth',
  'exact_ground_clearance_requirement',
  'trail_width',
  'bridge_capacity',
  'surface_traction',
  'passability',
  'legal_access',
] as const;

export type VehicleRouteUnsupportedConstraint = (typeof VEHICLE_ROUTE_UNSUPPORTED_CONSTRAINTS)[number];

export interface VehicleRouteKnownAdvisory {
  id: string;
  severity: 'info' | 'watch' | 'blocking';
  reason: string;
  sourceTruth?: SourceTruthRef | null;
}

export interface VehicleRouteSegmentKnownConstraints {
  minimumTireDiameterInches?: number | null;
  minimumSuspensionLiftInches?: number | null;
  trailerAccess?: 'allowed' | 'not_recommended' | 'prohibited' | 'unknown' | null;
  maximumTrailerWeightLbs?: number | null;
  maximumTrailerLengthFeet?: number | null;
}

export interface VehicleRouteConstraintSegmentInput {
  id: string;
  index: number;
  label?: string | null;
  distanceStartMiles: number;
  distanceEndMiles: number;
  averageElevationFeet?: number | null;
  maximumElevationFeet?: number | null;
  elevationGainFeet?: number | null;
  maximumGradePercent?: number | null;
  elevationDataAvailable?: boolean | null;
  terrainClass?: VehicleRouteTerrainClass | null;
  remotenessScore?: number | null;
  nearestBailoutDistanceMiles?: number | null;
  bailoutDataAvailable?: boolean | null;
  advisories?: readonly VehicleRouteKnownAdvisory[] | null;
  advisoryCoverage?: VehicleRouteAdvisoryCoverage | null;
  knownConstraints?: VehicleRouteSegmentKnownConstraints | null;
  sourceTruth?: SourceTruthRef | null;
  bailoutSourceTruth?: SourceTruthRef | null;
}

export interface VehicleRouteLoadDistributionInput {
  available: boolean;
  topHeavyRisk?: VehicleRouteConstraintRiskLevel | null;
  frontAxleRisk?: VehicleRouteConstraintRiskLevel | null;
  rearAxleRisk?: VehicleRouteConstraintRiskLevel | null;
  dataQuality?: string | null;
  sourceTruth?: SourceTruthRef | null;
  warnings?: readonly string[] | null;
}

export interface VehicleRouteConstraintEnvelopeInput {
  routeId: string;
  routeLabel: string;
  rigCompatibilityInput: RigCompatibilityV2Input;
  segments: readonly VehicleRouteConstraintSegmentInput[];
  loadDistribution?: VehicleRouteLoadDistributionInput | null;
}

export interface VehicleRouteConstraintFactorResult {
  id: VehicleRouteConstraintFactorId;
  label: string;
  posture: VehicleRouteConstraintPosture;
  contributesToPosture: boolean;
  reason: string;
  confidence: SourceTruthConfidence;
  sourceTruth: SourceTruthRef[];
  missingInputs: string[];
  warningCodes: string[];
  verificationOrMitigation: string[];
}

export interface VehicleRouteConstraintConfidence {
  level: SourceTruthConfidence;
  score: number;
  coverage: SourceTruthCoverage;
  assessedFactorCount: number;
  contributingFactorCount: number;
  unknownFactorCount: number;
  reasons: string[];
}

export interface VehicleRouteConstraintSegmentResult {
  id: string;
  index: number;
  label: string;
  distanceStartMiles: number;
  distanceEndMiles: number;
  posture: VehicleRouteConstraintPosture;
  limitingFactor: Pick<VehicleRouteConstraintFactorResult, 'id' | 'label' | 'posture' | 'reason'> | null;
  factors: VehicleRouteConstraintFactorResult[];
  confidence: VehicleRouteConstraintConfidence;
  sourceTruth: SourceTruthRef[];
  missingInputs: string[];
  warningCodes: string[];
  verificationOrMitigation: string[];
}

export interface VehicleRouteConstraintScenarioMetadata {
  kind: VehicleRouteConstraintScenario['kind'];
  label: string;
  previewOnly: true;
}

export interface VehicleRouteConstraintEnvelopeResult {
  version: typeof VEHICLE_ROUTE_CONSTRAINT_ENVELOPE_VERSION;
  fingerprint: string;
  routeId: string;
  routeLabel: string;
  posture: VehicleRouteConstraintPosture;
  segments: VehicleRouteConstraintSegmentResult[];
  earliestWorseningSegment: Pick<
    VehicleRouteConstraintSegmentResult,
    'id' | 'index' | 'label' | 'distanceStartMiles' | 'distanceEndMiles' | 'posture'
  > | null;
  confidence: VehicleRouteConstraintConfidence;
  sourceTruth: SourceTruthRef[];
  missingInputs: string[];
  warningCodes: string[];
  verificationOrMitigation: string[];
  unsupportedConstraints: VehicleRouteUnsupportedConstraint[];
  safetyBoundary: string;
  scenario: VehicleRouteConstraintScenarioMetadata | null;
  previewOnly: true;
  deterministic: true;
  aiAuthority: 'explanation_only';
}

export type VehicleRouteConstraintScenario =
  | { kind: 'remove_trailer' }
  | { kind: 'refuel'; currentFuelGallons: number; fuelRangeMiles?: number | null }
  | { kind: 'reduce_high_load'; projectedLoadDistribution: VehicleRouteLoadDistributionInput }
  | {
      kind: 'select_vehicle';
      rigCompatibilityInput: RigCompatibilityV2Input;
      loadDistribution?: VehicleRouteLoadDistributionInput | null;
    };

const FACTOR_LABELS: Record<VehicleRouteConstraintFactorId, string> = {
  payload_weight: 'Payload / operating weight',
  load_distribution: 'Load distribution',
  tire_suitability: 'Tire suitability',
  suspension_lift: 'Suspension / lift',
  trailer_constraints: 'Trailer constraints',
  grade_elevation: 'Grade / elevation exposure',
  terrain_exposure: 'Terrain exposure',
  fuel_range: 'Fuel range',
  remoteness_bailout: 'Remoteness / bailout access',
  recovery_readiness: 'Recovery readiness',
  route_advisories: 'Known route warnings',
};

const POSTURE_RANK: Record<VehicleRouteConstraintPosture, number> = {
  within_envelope: 0,
  watch: 1,
  unknown: 2,
  exceeds_known_envelope: 3,
};

const CONFIDENCE_SCORE: Record<SourceTruthConfidence, number> = {
  high: 100,
  medium: 70,
  low: 40,
  unknown: 0,
};

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeNumber(value: number | null | undefined): number | null {
  const normalized = finiteNumber(value);
  return normalized != null && normalized >= 0 ? normalized : null;
}

function positiveNumber(value: number | null | undefined): number | null {
  const normalized = finiteNumber(value);
  return normalized != null && normalized > 0 ? normalized : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueSources(values: readonly SourceTruthRef[]): SourceTruthRef[] {
  return Array.from(new Map(values.map((ref) => {
    const sanitized = sanitizeSourceTruthRef(ref);
    return [sanitized.id, sanitized] as const;
  })).values());
}

function factorResult(
  id: VehicleRouteConstraintFactorId,
  input: Omit<VehicleRouteConstraintFactorResult, 'id' | 'label'>,
): VehicleRouteConstraintFactorResult {
  return {
    id,
    label: FACTOR_LABELS[id],
    ...input,
    sourceTruth: uniqueSources(input.sourceTruth),
    missingInputs: unique(input.missingInputs),
    warningCodes: unique(input.warningCodes),
    verificationOrMitigation: unique(input.verificationOrMitigation),
  };
}

function confidenceFromSources(
  sources: readonly SourceTruthRef[],
  fallback: SourceTruthConfidence,
): SourceTruthConfidence {
  if (sources.length === 0) return fallback;
  let score = 100;
  for (const source of sources) {
    score = Math.min(score, CONFIDENCE_SCORE[source.confidence]);
    if (source.availability === 'degraded') score = Math.min(score, 55);
    if (source.availability === 'unavailable' || source.origin === 'unavailable') score = 0;
    if (source.coverage === 'partial') score = Math.min(score, 55);
    if (source.conflict) score = Math.min(score, 35);
  }
  if (score >= 85) return 'high';
  if (score >= 60) return 'medium';
  if (score > 0) return 'low';
  return 'unknown';
}

function sourceRefs(factor: RigCompatibilityV2FactorResult): SourceTruthRef[] {
  return factor.sourceTruth.map(sanitizeSourceTruthRef);
}

function unknownFactor(
  id: VehicleRouteConstraintFactorId,
  reason: string,
  missingInputs: string[],
  options: {
    contributesToPosture?: boolean;
    sourceTruth?: SourceTruthRef[];
    verificationOrMitigation?: string[];
    warningCodes?: string[];
  } = {},
): VehicleRouteConstraintFactorResult {
  return factorResult(id, {
    posture: 'unknown',
    contributesToPosture: options.contributesToPosture ?? true,
    reason,
    confidence: confidenceFromSources(options.sourceTruth ?? [], 'unknown'),
    sourceTruth: options.sourceTruth ?? [],
    missingInputs,
    warningCodes: options.warningCodes ?? [],
    verificationOrMitigation: options.verificationOrMitigation ?? missingInputs,
  });
}

function payloadFactor(
  factor: RigCompatibilityV2FactorResult,
  confidence: SourceTruthConfidence,
): VehicleRouteConstraintFactorResult {
  const sources = sourceRefs(factor);
  let posture: VehicleRouteConstraintPosture;
  if (factor.state === 'unknown') posture = 'unknown';
  else if (factor.warningCodes.includes('gvwr_exceeded')) posture = 'exceeds_known_envelope';
  else if (factor.state === 'watch' || factor.state === 'limited' || factor.state === 'incompatible') posture = 'watch';
  else posture = 'within_envelope';
  return factorResult('payload_weight', {
    posture,
    contributesToPosture: true,
    reason: factor.reason,
    confidence: confidenceFromSources(sources, confidence),
    sourceTruth: sources,
    missingInputs: factor.missingInputs,
    warningCodes: factor.warningCodes,
    verificationOrMitigation: factor.verificationTargets,
  });
}

function loadDistributionFactor(
  load: VehicleRouteLoadDistributionInput | null | undefined,
): VehicleRouteConstraintFactorResult {
  const sources = load?.sourceTruth ? [sanitizeSourceTruthRef(load.sourceTruth)] : [];
  if (!load?.available) {
    return unknownFactor(
      'load_distribution',
      'Load distribution cannot be assessed from the current Fleet state.',
      ['load distribution and center-of-gravity assessment'],
      {
        sourceTruth: sources,
        verificationOrMitigation: ['Review roof/high load and axle distribution in Fleet.'],
      },
    );
  }
  const risks = [load.topHeavyRisk, load.frontAxleRisk, load.rearAxleRisk].filter(Boolean) as VehicleRouteConstraintRiskLevel[];
  if (risks.length === 0) {
    return unknownFactor(
      'load_distribution',
      'Fleet load distribution is present but has no usable risk indicators.',
      ['top-heavy and axle risk indicators'],
      { sourceTruth: sources },
    );
  }
  const posture: VehicleRouteConstraintPosture = risks.includes('critical')
    ? 'exceeds_known_envelope'
    : risks.some((risk) => risk === 'caution' || risk === 'watch')
      ? 'watch'
      : 'within_envelope';
  return factorResult('load_distribution', {
    posture,
    contributesToPosture: true,
    reason: posture === 'exceeds_known_envelope'
      ? 'Fleet reports a critical top-heavy or axle-distribution condition.'
      : posture === 'watch'
        ? 'Fleet reports a top-heavy or axle-distribution watch condition.'
        : 'Fleet load-distribution indicators are clear.',
    confidence: confidenceFromSources(sources, 'medium'),
    sourceTruth: sources,
    missingInputs: [],
    warningCodes: unique([
      ...(load.warnings ?? []),
      ...(posture === 'exceeds_known_envelope' ? ['critical_load_distribution'] : []),
      ...(posture === 'watch' ? ['load_distribution_watch'] : []),
    ]),
    verificationOrMitigation: posture === 'within_envelope'
      ? []
      : ['Reduce roof/bed-high load or rebalance the load before relying on this preview.'],
  });
}

function tireFactor(
  segment: VehicleRouteConstraintSegmentInput,
  factor: RigCompatibilityV2FactorResult,
  vehicleTire: number | null,
  confidence: SourceTruthConfidence,
): VehicleRouteConstraintFactorResult {
  const minimum = positiveNumber(segment.knownConstraints?.minimumTireDiameterInches);
  const sources = sourceRefs(factor);
  if (minimum == null) {
    return unknownFactor(
      'tire_suitability',
      'No reliable segment-specific tire minimum is available; tire fit is excluded from posture.',
      ['segment tire minimum'],
      {
        contributesToPosture: false,
        sourceTruth: sources,
        verificationOrMitigation: ['Verify route tire requirements from an authoritative route source.'],
      },
    );
  }
  if (vehicleTire == null) {
    return unknownFactor(
      'tire_suitability',
      'The segment has a tire minimum, but installed tire diameter is unknown.',
      ['installed tire diameter'],
      { sourceTruth: sources, verificationOrMitigation: ['Confirm installed tire size in Fleet.'] },
    );
  }
  const exceeds = vehicleTire < minimum;
  return factorResult('tire_suitability', {
    posture: exceeds ? 'exceeds_known_envelope' : 'within_envelope',
    contributesToPosture: true,
    reason: exceeds
      ? `Installed ${vehicleTire.toFixed(1)} in tires are below the known ${minimum.toFixed(1)} in segment minimum.`
      : `Installed ${vehicleTire.toFixed(1)} in tires meet the known ${minimum.toFixed(1)} in segment minimum.`,
    confidence: confidenceFromSources(sources, confidence),
    sourceTruth: sources,
    missingInputs: [],
    warningCodes: exceeds ? ['segment_tire_minimum_not_met'] : [],
    verificationOrMitigation: exceeds ? ['Use a suitable vehicle or verify a different authoritative route constraint.'] : [],
  });
}

function suspensionFactor(
  segment: VehicleRouteConstraintSegmentInput,
  factor: RigCompatibilityV2FactorResult,
  vehicleLift: number | null,
  confidence: SourceTruthConfidence,
): VehicleRouteConstraintFactorResult {
  const minimum = nonNegativeNumber(segment.knownConstraints?.minimumSuspensionLiftInches);
  const sources = sourceRefs(factor);
  if (minimum == null) {
    return unknownFactor(
      'suspension_lift',
      'No reliable segment-specific lift minimum is available; suspension fit is excluded from posture.',
      ['segment suspension/lift minimum'],
      {
        contributesToPosture: false,
        sourceTruth: sources,
        verificationOrMitigation: ['Verify route suspension requirements from an authoritative route source.'],
      },
    );
  }
  if (vehicleLift == null) {
    return unknownFactor(
      'suspension_lift',
      'The segment has a lift minimum, but the saved suspension configuration is unknown.',
      ['installed suspension lift'],
      { sourceTruth: sources, verificationOrMitigation: ['Confirm suspension/lift configuration in Fleet.'] },
    );
  }
  const exceeds = vehicleLift < minimum;
  return factorResult('suspension_lift', {
    posture: exceeds ? 'exceeds_known_envelope' : 'within_envelope',
    contributesToPosture: true,
    reason: exceeds
      ? `Saved ${vehicleLift.toFixed(1)} in lift is below the known ${minimum.toFixed(1)} in segment minimum.`
      : `Saved ${vehicleLift.toFixed(1)} in lift meets the known ${minimum.toFixed(1)} in segment minimum.`,
    confidence: confidenceFromSources(sources, confidence),
    sourceTruth: sources,
    missingInputs: [],
    warningCodes: exceeds ? ['segment_lift_minimum_not_met'] : [],
    verificationOrMitigation: exceeds ? ['Use a suitable vehicle or verify a different authoritative route constraint.'] : [],
  });
}

function trailerFactor(
  segment: VehicleRouteConstraintSegmentInput,
  factor: RigCompatibilityV2FactorResult,
  trailerAttached: boolean | null,
  confidence: SourceTruthConfidence,
): VehicleRouteConstraintFactorResult {
  const sources = sourceRefs(factor);
  if (trailerAttached === false) {
    return factorResult('trailer_constraints', {
      posture: 'within_envelope',
      contributesToPosture: false,
      reason: 'No trailer is attached, so trailer constraints do not contribute to this segment posture.',
      confidence: confidenceFromSources(sources, confidence),
      sourceTruth: sources,
      missingInputs: [],
      warningCodes: [],
      verificationOrMitigation: [],
    });
  }
  if (trailerAttached == null) {
    return unknownFactor(
      'trailer_constraints',
      'Trailer presence is unknown.',
      ['trailer attachment state'],
      { sourceTruth: sources, verificationOrMitigation: ['Confirm trailer attachment state.'] },
    );
  }
  const access = segment.knownConstraints?.trailerAccess ?? 'unknown';
  if (access === 'unknown') {
    return unknownFactor(
      'trailer_constraints',
      'A trailer is attached, but this segment has no reliable trailer constraint.',
      ['segment trailer access/limit evidence'],
      { sourceTruth: sources, verificationOrMitigation: ['Verify trailer access and turnaround limits.'] },
    );
  }
  const hardExceeded = access === 'prohibited' || factor.warningCodes.includes('trailer_limit_exceeded');
  const posture: VehicleRouteConstraintPosture = hardExceeded
    ? 'exceeds_known_envelope'
    : access === 'not_recommended' || factor.state === 'watch' || factor.state === 'limited'
      ? 'watch'
      : factor.state === 'unknown'
        ? 'unknown'
        : 'within_envelope';
  return factorResult('trailer_constraints', {
    posture,
    contributesToPosture: true,
    reason: factor.reason,
    confidence: confidenceFromSources(sources, confidence),
    sourceTruth: sources,
    missingInputs: factor.missingInputs,
    warningCodes: factor.warningCodes,
    verificationOrMitigation: factor.verificationTargets,
  });
}

function gradeFactor(segment: VehicleRouteConstraintSegmentInput): VehicleRouteConstraintFactorResult {
  const source = segment.sourceTruth ? [sanitizeSourceTruthRef(segment.sourceTruth)] : [];
  const grade = nonNegativeNumber(segment.maximumGradePercent);
  if (segment.elevationDataAvailable === false || grade == null) {
    return unknownFactor(
      'grade_elevation',
      'Segment grade exposure cannot be assessed because elevation/grade data is missing.',
      ['segment maximum grade from route geometry'],
      { sourceTruth: source, verificationOrMitigation: ['Review a route with elevation-backed grade analysis.'] },
    );
  }
  const posture: VehicleRouteConstraintPosture = grade > 8 ? 'watch' : 'within_envelope';
  const elevation = finiteNumber(segment.maximumElevationFeet);
  return factorResult('grade_elevation', {
    posture,
    contributesToPosture: true,
    reason: `${grade.toFixed(1)}% maximum grade${elevation == null ? '' : ` near ${Math.round(elevation).toLocaleString()} ft`}. Grade is exposure only; ECS has no verified vehicle maximum-grade limit.`,
    confidence: confidenceFromSources(source, 'medium'),
    sourceTruth: source,
    missingInputs: [],
    warningCodes: posture === 'watch' ? ['steep_grade_exposure'] : [],
    verificationOrMitigation: posture === 'watch'
      ? ['Review speed, braking, load distribution, weather, and field conditions before this segment.']
      : [],
  });
}

function terrainFactor(segment: VehicleRouteConstraintSegmentInput): VehicleRouteConstraintFactorResult {
  const source = segment.sourceTruth ? [sanitizeSourceTruthRef(segment.sourceTruth)] : [];
  const terrain = segment.terrainClass;
  if (!terrain) {
    return unknownFactor(
      'terrain_exposure',
      'Segment terrain classification is unavailable.',
      ['segment terrain classification'],
      { sourceTruth: source },
    );
  }
  const posture: VehicleRouteConstraintPosture = terrain === 'challenging' || terrain === 'difficult'
    ? 'watch'
    : 'within_envelope';
  return factorResult('terrain_exposure', {
    posture,
    contributesToPosture: true,
    reason: `${terrain} terrain classification is an exposure indicator, not a passability or traction conclusion.`,
    confidence: confidenceFromSources(source, 'medium'),
    sourceTruth: source,
    missingInputs: [],
    warningCodes: posture === 'watch' ? ['terrain_exposure_watch'] : [],
    verificationOrMitigation: posture === 'watch' ? ['Verify current surface and field conditions locally.'] : [],
  });
}

function fuelFactor(
  factor: RigCompatibilityV2FactorResult,
  confidence: SourceTruthConfidence,
): VehicleRouteConstraintFactorResult {
  const sources = sourceRefs(factor);
  let posture: VehicleRouteConstraintPosture;
  if (factor.state === 'unknown') posture = 'unknown';
  else if (factor.warningCodes.includes('fuel_range_below_policy')) posture = 'exceeds_known_envelope';
  else if ((factor.score ?? 0) < 85) posture = 'watch';
  else posture = 'within_envelope';
  return factorResult('fuel_range', {
    posture,
    contributesToPosture: true,
    reason: factor.reason,
    confidence: confidenceFromSources(sources, confidence),
    sourceTruth: sources,
    missingInputs: factor.missingInputs,
    warningCodes: factor.warningCodes,
    verificationOrMitigation: factor.verificationTargets,
  });
}

function remotenessFactor(segment: VehicleRouteConstraintSegmentInput): VehicleRouteConstraintFactorResult {
  const source = segment.bailoutSourceTruth
    ? [sanitizeSourceTruthRef(segment.bailoutSourceTruth)]
    : segment.sourceTruth
      ? [sanitizeSourceTruthRef(segment.sourceTruth)]
      : [];
  const distance = nonNegativeNumber(segment.nearestBailoutDistanceMiles);
  if (segment.bailoutDataAvailable !== true || distance == null) {
    return unknownFactor(
      'remoteness_bailout',
      'Bailout distance is unavailable for this segment.',
      ['segment bailout/recovery access distance'],
      { sourceTruth: source, verificationOrMitigation: ['Add or verify bailout points for the active route.'] },
    );
  }
  const posture: VehicleRouteConstraintPosture = distance > 3 ? 'watch' : 'within_envelope';
  return factorResult('remoteness_bailout', {
    posture,
    contributesToPosture: true,
    reason: `The most remote covered point is ${distance.toFixed(1)} mi from its nearest known bailout. This measures remoteness, not bailout passability.`,
    confidence: confidenceFromSources(source, 'medium'),
    sourceTruth: source,
    missingInputs: [],
    warningCodes: distance > 10 ? ['bailout_distance_remote'] : distance > 3 ? ['bailout_distance_watch'] : [],
    verificationOrMitigation: posture === 'watch' ? ['Verify bailout routing and recovery communications before departure.'] : [],
  });
}

function recoveryFactor(
  factor: RigCompatibilityV2FactorResult,
  confidence: SourceTruthConfidence,
): VehicleRouteConstraintFactorResult {
  const sources = sourceRefs(factor);
  if (factor.state === 'not_applicable') {
    return factorResult('recovery_readiness', {
      posture: 'within_envelope',
      contributesToPosture: false,
      reason: factor.reason,
      confidence: confidenceFromSources(sources, confidence),
      sourceTruth: sources,
      missingInputs: [],
      warningCodes: factor.warningCodes,
      verificationOrMitigation: [],
    });
  }
  const posture: VehicleRouteConstraintPosture = factor.state === 'unknown'
    ? 'unknown'
    : factor.state === 'limited' || factor.state === 'incompatible'
      ? 'exceeds_known_envelope'
      : factor.state === 'watch'
        ? 'watch'
        : 'within_envelope';
  return factorResult('recovery_readiness', {
    posture,
    contributesToPosture: true,
    reason: factor.reason,
    confidence: confidenceFromSources(sources, confidence),
    sourceTruth: sources,
    missingInputs: factor.missingInputs,
    warningCodes: factor.warningCodes,
    verificationOrMitigation: factor.verificationTargets,
  });
}

function advisoryFactor(segment: VehicleRouteConstraintSegmentInput): VehicleRouteConstraintFactorResult {
  const advisories = [...(segment.advisories ?? [])];
  const sources = uniqueSources([
    ...(segment.sourceTruth ? [segment.sourceTruth] : []),
    ...advisories.flatMap((advisory) => advisory.sourceTruth ? [advisory.sourceTruth] : []),
  ]);
  const coverage = segment.advisoryCoverage ?? 'unknown';
  const blocking = advisories.filter((advisory) => advisory.severity === 'blocking');
  const watches = advisories.filter((advisory) => advisory.severity === 'watch');
  if (blocking.length > 0) {
    return factorResult('route_advisories', {
      posture: 'exceeds_known_envelope',
      contributesToPosture: true,
      reason: blocking.map((advisory) => advisory.reason).join(' '),
      confidence: confidenceFromSources(sources, 'medium'),
      sourceTruth: sources,
      missingInputs: coverage === 'complete' ? [] : ['complete advisory coverage'],
      warningCodes: blocking.map((advisory) => advisory.id),
      verificationOrMitigation: ['Resolve or verify the blocking route advisory before relying on this segment.'],
    });
  }
  if (watches.length > 0) {
    return factorResult('route_advisories', {
      posture: 'watch',
      contributesToPosture: true,
      reason: watches.map((advisory) => advisory.reason).join(' '),
      confidence: confidenceFromSources(sources, 'medium'),
      sourceTruth: sources,
      missingInputs: coverage === 'complete' ? [] : ['complete advisory coverage'],
      warningCodes: watches.map((advisory) => advisory.id),
      verificationOrMitigation: ['Review the known advisory before this segment.'],
    });
  }
  if (coverage !== 'complete') {
    return unknownFactor(
      'route_advisories',
      'Current-condition advisory coverage is incomplete; no closure, legality, or passability conclusion is made.',
      ['complete current-condition advisory coverage'],
      {
        sourceTruth: sources,
        verificationOrMitigation: ['Verify closures and current conditions with an authoritative source.'],
      },
    );
  }
  return factorResult('route_advisories', {
    posture: 'within_envelope',
    contributesToPosture: true,
    reason: 'No blocking or watch advisory is present in the explicitly complete advisory input.',
    confidence: confidenceFromSources(sources, 'medium'),
    sourceTruth: sources,
    missingInputs: [],
    warningCodes: [],
    verificationOrMitigation: [],
  });
}

function terrainDifficulty(terrain: VehicleRouteTerrainClass | null | undefined): number | null {
  if (terrain === 'easy') return 2;
  if (terrain === 'moderate') return 4;
  if (terrain === 'challenging') return 6;
  if (terrain === 'difficult') return 8;
  return null;
}

function segmentRigInput(
  base: RigCompatibilityV2Input,
  segment: VehicleRouteConstraintSegmentInput,
): RigCompatibilityV2Input {
  const segmentSource: RigCompatibilityV2SourceEvidence | null = segment.sourceTruth
    ? { ref: sanitizeSourceTruthRef(segment.sourceTruth), policyKey: 'offline_map_route_package' }
    : null;
  return {
    ...base,
    vehicle: {
      ...base.vehicle,
      geometry: base.vehicle.geometry ? { ...base.vehicle.geometry } : null,
    },
    route: {
      ...base.route,
      id: `${base.route.id}:${segment.id}`,
      label: `${base.route.label ?? base.route.id} - ${segment.label ?? `Segment ${segment.index + 1}`}`,
      distanceMiles: Math.max(0, segment.distanceEndMiles),
      estimatedFuelRequiredGallons: null,
      terrainDifficulty: terrainDifficulty(segment.terrainClass),
      maxGradePercent: segment.maximumGradePercent ?? null,
      remotenessScore: segment.remotenessScore ?? null,
      tractionRequirement: 'unknown',
      recommendedTireDiameterInches: segment.knownConstraints?.minimumTireDiameterInches ?? null,
      recommendedSuspensionLiftInches: segment.knownConstraints?.minimumSuspensionLiftInches ?? null,
      geometryRequirements: null,
      trailerAccess: segment.knownConstraints?.trailerAccess ?? 'unknown',
      maximumTrailerWeightLbs: segment.knownConstraints?.maximumTrailerWeightLbs ?? null,
      maximumTrailerLengthFeet: segment.knownConstraints?.maximumTrailerLengthFeet ?? null,
      recoveryRequirement: null,
    },
    trailer: base.trailer ? { ...base.trailer } : null,
    resources: {
      ...(base.resources ?? {}),
      requiredWaterGallons: null,
      availablePowerRuntimeHours: null,
      requiredPowerRuntimeHours: null,
    },
    recovery: base.recovery ? { ...base.recovery } : null,
    sourceTruth: {
      ...(base.sourceTruth ?? {}),
      ...(segmentSource ? { route: segmentSource, terrain_grade_exposure: segmentSource } : {}),
    },
  };
}

function buildConfidence(factors: readonly VehicleRouteConstraintFactorResult[]): VehicleRouteConstraintConfidence {
  const contributing = factors.filter((factor) => factor.contributesToPosture);
  const assessed = contributing.filter((factor) => factor.posture !== 'unknown');
  const unknownCount = contributing.length - assessed.length;
  const coveragePct = contributing.length > 0 ? (assessed.length / contributing.length) * 100 : 0;
  const quality = contributing.length > 0
    ? contributing.reduce((total, factor) => total + CONFIDENCE_SCORE[factor.confidence], 0) / contributing.length
    : 0;
  const conflict = factors.some((factor) => factor.sourceTruth.some((source) => source.conflict));
  let score = Math.round((coveragePct * 0.55) + (quality * 0.45));
  if (conflict) score = Math.min(score, 35);
  const level: SourceTruthConfidence = score >= 85 ? 'high' : score >= 60 ? 'medium' : score > 0 ? 'low' : 'unknown';
  const coverage: SourceTruthCoverage = coveragePct === 100 ? 'complete' : coveragePct > 0 ? 'partial' : 'unknown';
  return {
    level,
    score,
    coverage,
    assessedFactorCount: assessed.length,
    contributingFactorCount: contributing.length,
    unknownFactorCount: unknownCount,
    reasons: unique([
      `${assessed.length} of ${contributing.length} contributing factors are assessed.`,
      conflict ? 'Conflicting source evidence caps confidence at low.' : '',
    ]),
  };
}

function limitingFactor(
  factors: readonly VehicleRouteConstraintFactorResult[],
): VehicleRouteConstraintFactorResult | null {
  const contributing = factors.filter((factor) => factor.contributesToPosture);
  return contributing.reduce<VehicleRouteConstraintFactorResult | null>((current, factor) => {
    if (!current || POSTURE_RANK[factor.posture] > POSTURE_RANK[current.posture]) return factor;
    return current;
  }, null);
}

function segmentResult(
  input: VehicleRouteConstraintEnvelopeInput,
  segment: VehicleRouteConstraintSegmentInput,
): VehicleRouteConstraintSegmentResult {
  const rigInput = segmentRigInput(input.rigCompatibilityInput, segment);
  const rigResult = calculateRigCompatibilityV2(rigInput);
  const v2Confidence = rigResult.confidence.level;
  const vehicleTire = positiveNumber(rigInput.vehicle.tireDiameterInches);
  const vehicleLift = nonNegativeNumber(rigInput.vehicle.suspensionLiftInches);
  const trailerAttached = typeof rigInput.trailer?.attached === 'boolean' ? rigInput.trailer.attached : null;
  const factors: VehicleRouteConstraintFactorResult[] = [
    payloadFactor(rigResult.factors.payload_readiness, v2Confidence),
    loadDistributionFactor(input.loadDistribution),
    tireFactor(segment, rigResult.factors.tire_suitability, vehicleTire, v2Confidence),
    suspensionFactor(segment, rigResult.factors.suspension_lift, vehicleLift, v2Confidence),
    trailerFactor(segment, rigResult.factors.trailer_constraints, trailerAttached, v2Confidence),
    gradeFactor(segment),
    terrainFactor(segment),
    fuelFactor(rigResult.factors.fuel_resource_range, v2Confidence),
    remotenessFactor(segment),
    recoveryFactor(rigResult.factors.recovery_readiness, v2Confidence),
    advisoryFactor(segment),
  ];
  const limiting = limitingFactor(factors);
  const posture = limiting?.posture ?? 'unknown';
  const confidence = buildConfidence(factors);
  return {
    id: segment.id,
    index: segment.index,
    label: segment.label?.trim() || `Segment ${segment.index + 1}`,
    distanceStartMiles: Math.max(0, segment.distanceStartMiles),
    distanceEndMiles: Math.max(0, segment.distanceStartMiles, segment.distanceEndMiles),
    posture,
    limitingFactor: limiting
      ? { id: limiting.id, label: limiting.label, posture: limiting.posture, reason: limiting.reason }
      : null,
    factors,
    confidence,
    sourceTruth: uniqueSources(factors.flatMap((factor) => factor.sourceTruth)),
    missingInputs: unique(factors.flatMap((factor) => factor.missingInputs)),
    warningCodes: unique(factors.flatMap((factor) => factor.warningCodes)),
    verificationOrMitigation: unique(factors.flatMap((factor) => factor.verificationOrMitigation)),
  };
}

function overallConfidence(segments: readonly VehicleRouteConstraintSegmentResult[]): VehicleRouteConstraintConfidence {
  if (segments.length === 0) {
    return {
      level: 'unknown',
      score: 0,
      coverage: 'unknown',
      assessedFactorCount: 0,
      contributingFactorCount: 0,
      unknownFactorCount: 0,
      reasons: ['No route segments are available.'],
    };
  }
  const score = Math.min(...segments.map((segment) => segment.confidence.score));
  const level: SourceTruthConfidence = score >= 85 ? 'high' : score >= 60 ? 'medium' : score > 0 ? 'low' : 'unknown';
  const assessed = segments.reduce((total, segment) => total + segment.confidence.assessedFactorCount, 0);
  const contributing = segments.reduce((total, segment) => total + segment.confidence.contributingFactorCount, 0);
  const unknown = segments.reduce((total, segment) => total + segment.confidence.unknownFactorCount, 0);
  return {
    level,
    score,
    coverage: segments.every((segment) => segment.confidence.coverage === 'complete')
      ? 'complete'
      : segments.every((segment) => segment.confidence.coverage === 'unknown')
        ? 'unknown'
        : 'partial',
    assessedFactorCount: assessed,
    contributingFactorCount: contributing,
    unknownFactorCount: unknown,
    reasons: [`Lowest segment confidence is ${score}%.`, `${unknown} contributing factor checks are unknown.`],
  };
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function scenarioLabel(scenario: VehicleRouteConstraintScenario): string {
  if (scenario.kind === 'remove_trailer') return 'Remove trailer';
  if (scenario.kind === 'refuel') return 'Refuel';
  if (scenario.kind === 'reduce_high_load') return 'Reduce roof/high load';
  return 'Select different vehicle';
}

function nowIso(value: RigCompatibilityV2Input['now']): string | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function simulatedEvidence(id: string, observedAt: string | null): RigCompatibilityV2SourceEvidence {
  return {
    ref: sanitizeSourceTruthRef({
      id,
      origin: 'simulated',
      authority: 'ECS local scenario preview',
      provider: null,
      observedAt,
      fetchedAt: null,
      expiresAt: null,
      confidence: 'medium',
      coverage: 'partial',
      availability: 'usable',
      conflict: false,
      warningCodes: ['preview_only_no_state_mutation'],
    }),
    policyKey: 'manual_user_state',
  };
}

function cloneInput(input: VehicleRouteConstraintEnvelopeInput): VehicleRouteConstraintEnvelopeInput {
  const rig = input.rigCompatibilityInput;
  return {
    routeId: input.routeId,
    routeLabel: input.routeLabel,
    rigCompatibilityInput: {
      ...rig,
      vehicle: { ...rig.vehicle, geometry: rig.vehicle.geometry ? { ...rig.vehicle.geometry } : null },
      route: {
        ...rig.route,
        geometryRequirements: rig.route.geometryRequirements ? { ...rig.route.geometryRequirements } : null,
      },
      trailer: rig.trailer ? { ...rig.trailer } : null,
      resources: rig.resources ? { ...rig.resources } : null,
      recovery: rig.recovery ? { ...rig.recovery } : null,
      sourceTruth: { ...(rig.sourceTruth ?? {}) },
    },
    segments: input.segments.map((segment) => ({
      ...segment,
      advisories: segment.advisories?.map((advisory) => ({ ...advisory })) ?? null,
      knownConstraints: segment.knownConstraints ? { ...segment.knownConstraints } : null,
      sourceTruth: segment.sourceTruth ? { ...segment.sourceTruth, warningCodes: [...segment.sourceTruth.warningCodes] } : null,
      bailoutSourceTruth: segment.bailoutSourceTruth
        ? { ...segment.bailoutSourceTruth, warningCodes: [...segment.bailoutSourceTruth.warningCodes] }
        : null,
    })),
    loadDistribution: input.loadDistribution
      ? {
          ...input.loadDistribution,
          warnings: [...(input.loadDistribution.warnings ?? [])],
          sourceTruth: input.loadDistribution.sourceTruth
            ? { ...input.loadDistribution.sourceTruth, warningCodes: [...input.loadDistribution.sourceTruth.warningCodes] }
            : null,
        }
      : null,
  };
}

function evaluate(
  input: VehicleRouteConstraintEnvelopeInput,
  scenario: VehicleRouteConstraintScenarioMetadata | null,
): VehicleRouteConstraintEnvelopeResult {
  const segments = input.segments
    .map((segment) => segmentResult(input, segment))
    .sort((left, right) => left.index - right.index);
  const worst = segments.reduce<VehicleRouteConstraintSegmentResult | null>((current, segment) => {
    if (!current || POSTURE_RANK[segment.posture] > POSTURE_RANK[current.posture]) return segment;
    return current;
  }, null);
  const earliestWorsening = segments.find((segment) => segment.posture !== 'within_envelope') ?? null;
  const confidence = overallConfidence(segments);
  const missing = segments.length === 0
    ? ['route analysis segments']
    : unique(segments.flatMap((segment) => segment.missingInputs));
  const warnings = unique(segments.flatMap((segment) => segment.warningCodes));
  const verification = unique(segments.flatMap((segment) => segment.verificationOrMitigation));
  const sources = uniqueSources(segments.flatMap((segment) => segment.sourceTruth));
  const fingerprint = `vehicle-envelope-${hashText(JSON.stringify({
    routeId: input.routeId,
    segments: segments.map((segment) => ({
      id: segment.id,
      posture: segment.posture,
      limitingFactor: segment.limitingFactor?.id ?? null,
      confidence: segment.confidence.score,
    })),
    scenario,
  }))}`;
  return {
    version: VEHICLE_ROUTE_CONSTRAINT_ENVELOPE_VERSION,
    fingerprint,
    routeId: input.routeId,
    routeLabel: input.routeLabel,
    posture: worst?.posture ?? 'unknown',
    segments,
    earliestWorseningSegment: earliestWorsening
      ? {
          id: earliestWorsening.id,
          index: earliestWorsening.index,
          label: earliestWorsening.label,
          distanceStartMiles: earliestWorsening.distanceStartMiles,
          distanceEndMiles: earliestWorsening.distanceEndMiles,
          posture: earliestWorsening.posture,
        }
      : null,
    confidence,
    sourceTruth: sources,
    missingInputs: missing,
    warningCodes: warnings,
    verificationOrMitigation: verification,
    unsupportedConstraints: [...VEHICLE_ROUTE_UNSUPPORTED_CONSTRAINTS],
    safetyBoundary: 'Known constraints only. This envelope does not establish passability, legal access, surface traction, water-fording depth, bridge capacity, trail width, or exact clearance.',
    scenario,
    previewOnly: true,
    deterministic: true,
    aiAuthority: 'explanation_only',
  };
}

export function evaluateVehicleRouteConstraintEnvelope(
  input: VehicleRouteConstraintEnvelopeInput,
): VehicleRouteConstraintEnvelopeResult {
  return evaluate(input, null);
}

export function previewVehicleRouteConstraintScenario(
  input: VehicleRouteConstraintEnvelopeInput,
  scenario: VehicleRouteConstraintScenario,
): VehicleRouteConstraintEnvelopeResult {
  const preview = cloneInput(input);
  const observedAt = nowIso(preview.rigCompatibilityInput.now);
  if (scenario.kind === 'remove_trailer') {
    preview.rigCompatibilityInput.trailer = {
      ...(preview.rigCompatibilityInput.trailer ?? {}),
      attached: false,
    };
    preview.rigCompatibilityInput.sourceTruth = {
      ...(preview.rigCompatibilityInput.sourceTruth ?? {}),
      trailer_constraints: simulatedEvidence('vehicle-envelope-scenario:remove-trailer', observedAt),
    };
  } else if (scenario.kind === 'refuel') {
    const gallons = Math.max(0, finiteNumber(scenario.currentFuelGallons) ?? 0);
    const mpg = positiveNumber(preview.rigCompatibilityInput.resources?.averageMpg);
    const explicitRange = nonNegativeNumber(scenario.fuelRangeMiles);
    preview.rigCompatibilityInput.resources = {
      ...(preview.rigCompatibilityInput.resources ?? {}),
      currentFuelGallons: gallons,
      fuelRangeMiles: explicitRange ?? (mpg == null ? null : gallons * mpg),
    };
    preview.rigCompatibilityInput.sourceTruth = {
      ...(preview.rigCompatibilityInput.sourceTruth ?? {}),
      fuel_resource_range: simulatedEvidence('vehicle-envelope-scenario:refuel', observedAt),
    };
  } else if (scenario.kind === 'reduce_high_load') {
    preview.loadDistribution = {
      ...scenario.projectedLoadDistribution,
      sourceTruth: sanitizeSourceTruthRef({
        id: 'vehicle-envelope-scenario:reduce-high-load',
        origin: 'simulated',
        authority: 'ECS local scenario preview',
        provider: null,
        observedAt,
        fetchedAt: null,
        expiresAt: null,
        confidence: 'medium',
        coverage: 'partial',
        availability: 'usable',
        conflict: false,
        warningCodes: ['preview_only_no_state_mutation'],
      }),
    };
  } else {
    preview.rigCompatibilityInput = cloneInput({
      ...preview,
      rigCompatibilityInput: scenario.rigCompatibilityInput,
    }).rigCompatibilityInput;
    preview.loadDistribution = scenario.loadDistribution ?? null;
  }
  return evaluate(preview, {
    kind: scenario.kind,
    label: scenarioLabel(scenario),
    previewOnly: true,
  });
}

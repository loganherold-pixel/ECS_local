import {
  evaluateSourceTruthRef,
  sanitizeSourceTruthRef,
  type SourceTruthConfidence,
  type SourceTruthCoverage,
  type SourceTruthPolicyKey,
  type SourceTruthRef,
} from './sourceTruth';

export const RIG_COMPATIBILITY_V2_VERSION = 'rig_compatibility.v2' as const;

export const RIG_COMPATIBILITY_V2_FACTOR_IDS = [
  'payload_readiness',
  'drivetrain_traction',
  'tire_suitability',
  'suspension_lift',
  'vehicle_geometry',
  'trailer_constraints',
  'fuel_resource_range',
  'recovery_readiness',
  'terrain_grade_exposure',
] as const;

export type RigCompatibilityV2FactorId = (typeof RIG_COMPATIBILITY_V2_FACTOR_IDS)[number];

export const RIG_COMPATIBILITY_V2_FACTOR_WEIGHTS: Record<RigCompatibilityV2FactorId, number> = {
  payload_readiness: 16,
  drivetrain_traction: 14,
  tire_suitability: 12,
  suspension_lift: 8,
  vehicle_geometry: 14,
  trailer_constraints: 10,
  fuel_resource_range: 12,
  recovery_readiness: 8,
  terrain_grade_exposure: 6,
};

export const RIG_COMPATIBILITY_V2_THRESHOLDS = {
  payload: {
    comfortableUsagePct: 80,
    watchUsagePct: 90,
    limitedUsagePct: 95,
    criticalUsagePct: 100,
  },
  defaultFuelReserveRatio: 0.2,
  recovery: {
    basicRemotenessScore: 4,
    remoteRemotenessScore: 8,
  },
  posture: {
    compatibleScore: 85,
    watchScore: 65,
    limitedScore: 40,
  },
  confidence: {
    highScore: 85,
    mediumScore: 65,
    completeFactorCoveragePct: 90,
  },
} as const;

export type RigCompatibilityV2FactorState =
  | 'compatible'
  | 'watch'
  | 'limited'
  | 'incompatible'
  | 'unknown'
  | 'not_applicable';

export type RigCompatibilityV2Posture = Exclude<RigCompatibilityV2FactorState, 'not_applicable'>;
export type RigCompatibilityV2TractionRequirement =
  | 'none'
  | 'all_weather'
  | 'four_wheel_drive'
  | 'unknown';
export type RigCompatibilityV2TrailerAccess =
  | 'allowed'
  | 'not_recommended'
  | 'prohibited'
  | 'unknown';
export type RigCompatibilityV2RecoveryRequirement =
  | 'none'
  | 'basic'
  | 'remote'
  | 'self_recovery'
  | 'unknown';

export interface RigCompatibilityV2SourceEvidence {
  ref: SourceTruthRef;
  policyKey?: SourceTruthPolicyKey | null;
}

export type RigCompatibilityV2SourceKey =
  | 'vehicle_profile'
  | 'route'
  | RigCompatibilityV2FactorId;

export type RigCompatibilityV2SourceMap = Partial<
  Record<
    RigCompatibilityV2SourceKey,
    RigCompatibilityV2SourceEvidence | readonly RigCompatibilityV2SourceEvidence[] | null
  >
>;

export interface RigCompatibilityV2VehicleGeometry {
  groundClearanceInches?: number | null;
  wheelbaseInches?: number | null;
  overallWidthInches?: number | null;
  approachAngleDegrees?: number | null;
  breakoverAngleDegrees?: number | null;
  departureAngleDegrees?: number | null;
  turningDiameterFeet?: number | null;
}

export interface RigCompatibilityV2VehicleInput {
  id: string;
  label?: string | null;
  gvwrLbs?: number | null;
  operatingWeightLbs?: number | null;
  drivetrain?: string | null;
  tireDiameterInches?: number | null;
  suspensionLiftInches?: number | null;
  isLeveled?: boolean | null;
  geometry?: RigCompatibilityV2VehicleGeometry | null;
}

export interface RigCompatibilityV2RouteGeometryRequirements {
  minimumGroundClearanceInches?: number | null;
  maximumWheelbaseInches?: number | null;
  maximumVehicleWidthInches?: number | null;
  minimumApproachAngleDegrees?: number | null;
  minimumBreakoverAngleDegrees?: number | null;
  minimumDepartureAngleDegrees?: number | null;
  maximumTurningDiameterFeet?: number | null;
}

export interface RigCompatibilityV2RouteInput {
  id: string;
  label?: string | null;
  distanceMiles?: number | null;
  estimatedFuelRequiredGallons?: number | null;
  terrainType?: string | null;
  terrainDifficulty?: number | null;
  maxGradePercent?: number | null;
  remotenessScore?: number | null;
  tractionRequirement?: RigCompatibilityV2TractionRequirement | null;
  recommendedTireDiameterInches?: number | null;
  recommendedSuspensionLiftInches?: number | null;
  geometryRequirements?: RigCompatibilityV2RouteGeometryRequirements | null;
  trailerAccess?: RigCompatibilityV2TrailerAccess | null;
  maximumTrailerWeightLbs?: number | null;
  maximumTrailerLengthFeet?: number | null;
  fuelReserveRatio?: number | null;
  recoveryRequirement?: RigCompatibilityV2RecoveryRequirement | null;
}

export interface RigCompatibilityV2TrailerInput {
  attached?: boolean | null;
  weightLbs?: number | null;
  lengthFeet?: number | null;
}

export interface RigCompatibilityV2ResourceInput {
  currentFuelGallons?: number | null;
  averageMpg?: number | null;
  fuelRangeMiles?: number | null;
  currentWaterGallons?: number | null;
  requiredWaterGallons?: number | null;
  availablePowerRuntimeHours?: number | null;
  requiredPowerRuntimeHours?: number | null;
}

export interface RigCompatibilityV2RecoveryInput {
  ratedRecoveryPoints?: boolean | null;
  strapOrRope?: boolean | null;
  shackles?: boolean | null;
  tractionAids?: boolean | null;
  fullSizeSpare?: boolean | null;
  jack?: boolean | null;
  winch?: boolean | null;
}

export interface RigCompatibilityV2Input {
  vehicle: RigCompatibilityV2VehicleInput;
  route: RigCompatibilityV2RouteInput;
  trailer?: RigCompatibilityV2TrailerInput | null;
  resources?: RigCompatibilityV2ResourceInput | null;
  recovery?: RigCompatibilityV2RecoveryInput | null;
  sourceTruth?: RigCompatibilityV2SourceMap | null;
  now?: number | Date | string | null;
}

export interface RigCompatibilityV2FactorEvidence {
  label: string;
  actual: number | string | boolean | null;
  required: number | string | boolean | null;
  unit?: string | null;
  passes?: boolean | null;
}

export interface RigCompatibilityV2FactorResult {
  id: RigCompatibilityV2FactorId;
  label: string;
  weight: number;
  score: number | null;
  state: RigCompatibilityV2FactorState;
  coverage: SourceTruthCoverage;
  includedInScore: boolean;
  reason: string;
  evidence: RigCompatibilityV2FactorEvidence[];
  missingInputs: string[];
  sourceTruth: SourceTruthRef[];
  warningCodes: string[];
  verificationTargets: string[];
}

export interface RigCompatibilityV2ConfidenceResult {
  level: SourceTruthConfidence;
  score: number;
  coverage: SourceTruthCoverage;
  factorCoveragePct: number;
  sourceQualityScore: number;
  knownFactorWeight: number;
  applicableFactorWeight: number;
  reasons: string[];
}

export interface RigCompatibilityV2Result {
  version: typeof RIG_COMPATIBILITY_V2_VERSION;
  fingerprint: string;
  score: number | null;
  posture: RigCompatibilityV2Posture;
  factors: Record<RigCompatibilityV2FactorId, RigCompatibilityV2FactorResult>;
  limitingFactors: RigCompatibilityV2FactorId[];
  missingData: string[];
  confidence: RigCompatibilityV2ConfidenceResult;
  sourceTruth: SourceTruthRef[];
  warnings: string[];
  suggestedVerificationTargets: string[];
  deterministic: true;
  aiAuthority: 'explanation_only';
}

type FactorDraft = Omit<
  RigCompatibilityV2FactorResult,
  'id' | 'label' | 'weight' | 'sourceTruth' | 'warningCodes'
> & {
  warningCodes?: string[];
};

const FACTOR_LABELS: Record<RigCompatibilityV2FactorId, string> = {
  payload_readiness: 'Payload / operating weight',
  drivetrain_traction: 'Drivetrain / traction',
  tire_suitability: 'Tire suitability',
  suspension_lift: 'Suspension / lift',
  vehicle_geometry: 'Vehicle dimensions / geometry',
  trailer_constraints: 'Trailer constraints',
  fuel_resource_range: 'Fuel / resource range',
  recovery_readiness: 'Recovery readiness',
  terrain_grade_exposure: 'Route terrain / grade exposure',
};

const FACTOR_SOURCE_KEYS: Record<RigCompatibilityV2FactorId, RigCompatibilityV2SourceKey[]> = {
  payload_readiness: ['payload_readiness', 'vehicle_profile'],
  drivetrain_traction: ['drivetrain_traction', 'vehicle_profile', 'route'],
  tire_suitability: ['tire_suitability', 'vehicle_profile', 'route'],
  suspension_lift: ['suspension_lift', 'vehicle_profile', 'route'],
  vehicle_geometry: ['vehicle_geometry', 'vehicle_profile', 'route'],
  trailer_constraints: ['trailer_constraints', 'route'],
  fuel_resource_range: ['fuel_resource_range', 'route'],
  recovery_readiness: ['recovery_readiness', 'route'],
  terrain_grade_exposure: ['terrain_grade_exposure', 'route'],
};

const SOURCE_CONFIDENCE_QUALITY: Record<SourceTruthConfidence, number> = {
  high: 1,
  medium: 0.72,
  low: 0.4,
  unknown: 0.15,
};

const SOURCE_ORIGIN_QUALITY: Record<SourceTruthRef['origin'], number> = {
  live: 1,
  cached: 0.85,
  manual: 0.75,
  estimated: 0.5,
  inferred: 0.4,
  simulated: 0.2,
  unavailable: 0,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveNumber(value: number | null | undefined): number | null {
  const normalized = finiteNumber(value);
  return normalized != null && normalized > 0 ? normalized : null;
}

function nonNegativeNumber(value: number | null | undefined): number | null {
  const normalized = finiteNumber(value);
  return normalized != null && normalized >= 0 ? normalized : null;
}

function round(value: number, digits = 0): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function stateForScore(score: number): RigCompatibilityV2FactorState {
  if (score >= RIG_COMPATIBILITY_V2_THRESHOLDS.posture.compatibleScore) return 'compatible';
  if (score >= RIG_COMPATIBILITY_V2_THRESHOLDS.posture.watchScore) return 'watch';
  if (score >= RIG_COMPATIBILITY_V2_THRESHOLDS.posture.limitedScore) return 'limited';
  return 'incompatible';
}

function postureForScore(score: number | null): RigCompatibilityV2Posture {
  if (score == null) return 'unknown';
  return stateForScore(score) as RigCompatibilityV2Posture;
}

function sourceEntries(
  input: RigCompatibilityV2Input,
  keys: readonly RigCompatibilityV2SourceKey[],
): RigCompatibilityV2SourceEvidence[] {
  const entries: RigCompatibilityV2SourceEvidence[] = [];
  for (const key of keys) {
    const value = input.sourceTruth?.[key];
    if (!value) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (!item?.ref) continue;
      entries.push({
        ref: sanitizeSourceTruthRef(item.ref),
        policyKey: item.policyKey ?? null,
      });
    }
  }

  const deduped = new Map<string, RigCompatibilityV2SourceEvidence>();
  for (const item of entries) {
    const key = `${item.ref.id}:${item.policyKey ?? 'default'}`;
    if (!deduped.has(key)) deduped.set(key, item);
  }
  return Array.from(deduped.values());
}

function allSourceEntries(input: RigCompatibilityV2Input): RigCompatibilityV2SourceEvidence[] {
  return sourceEntries(input, ['vehicle_profile', 'route', ...RIG_COMPATIBILITY_V2_FACTOR_IDS]);
}

function sourceWarnings(
  evidence: readonly RigCompatibilityV2SourceEvidence[],
  now: RigCompatibilityV2Input['now'],
): string[] {
  const warnings: string[] = [];
  for (const item of evidence) {
    const ref = item.ref;
    warnings.push(...ref.warningCodes);
    if (ref.conflict) warnings.push('source_conflict');
    if (ref.origin === 'unavailable' || ref.availability === 'unavailable') {
      warnings.push('source_unavailable');
    }
    if (now != null) {
      const evaluated = evaluateSourceTruthRef(ref, {
        policyKey: item.policyKey ?? 'default',
        now,
      });
      if (evaluated.freshness === 'stale') warnings.push('source_stale');
      if (evaluated.freshness === 'expired') warnings.push('source_expired');
      if (evaluated.freshness === 'unavailable') warnings.push('source_unavailable');
    }
  }
  return unique(warnings);
}

function createFactor(
  input: RigCompatibilityV2Input,
  id: RigCompatibilityV2FactorId,
  draft: FactorDraft,
): RigCompatibilityV2FactorResult {
  const evidence = sourceEntries(input, FACTOR_SOURCE_KEYS[id]);
  return {
    id,
    label: FACTOR_LABELS[id],
    weight: RIG_COMPATIBILITY_V2_FACTOR_WEIGHTS[id],
    ...draft,
    sourceTruth: evidence.map((item) => item.ref),
    warningCodes: unique([
      ...(draft.warningCodes ?? []),
      ...sourceWarnings(evidence, input.now),
    ]),
  };
}

function unknownFactor(
  input: RigCompatibilityV2Input,
  id: RigCompatibilityV2FactorId,
  reason: string,
  missingInputs: string[],
  verificationTargets: string[] = missingInputs,
  evidence: RigCompatibilityV2FactorEvidence[] = [],
  warningCodes: string[] = [],
): RigCompatibilityV2FactorResult {
  return createFactor(input, id, {
    score: null,
    state: 'unknown',
    coverage: evidence.length > 0 ? 'partial' : 'unknown',
    includedInScore: false,
    reason,
    evidence,
    missingInputs: unique(missingInputs),
    verificationTargets: unique(verificationTargets),
    warningCodes,
  });
}

function notApplicableFactor(
  input: RigCompatibilityV2Input,
  id: RigCompatibilityV2FactorId,
  reason: string,
  evidence: RigCompatibilityV2FactorEvidence[] = [],
): RigCompatibilityV2FactorResult {
  return createFactor(input, id, {
    score: null,
    state: 'not_applicable',
    coverage: 'complete',
    includedInScore: false,
    reason,
    evidence,
    missingInputs: [],
    verificationTargets: [],
  });
}

function calculatePayloadFactor(input: RigCompatibilityV2Input): RigCompatibilityV2FactorResult {
  const gvwr = positiveNumber(input.vehicle.gvwrLbs);
  const operatingWeight = nonNegativeNumber(input.vehicle.operatingWeightLbs);
  const missing = [
    ...(gvwr == null ? ['vehicle GVWR'] : []),
    ...(operatingWeight == null ? ['current operating weight'] : []),
  ];
  if (missing.length > 0) {
    return unknownFactor(
      input,
      'payload_readiness',
      'Payload readiness is unknown because GVWR or current operating weight is missing.',
      missing,
      ['door-placard GVWR', 'loaded scale-ticket operating weight'],
    );
  }

  const resolvedGvwr = gvwr as number;
  const resolvedOperatingWeight = operatingWeight as number;
  const usagePct = (resolvedOperatingWeight / resolvedGvwr) * 100;
  let score: number;
  if (usagePct > RIG_COMPATIBILITY_V2_THRESHOLDS.payload.criticalUsagePct) score = 0;
  else if (usagePct >= RIG_COMPATIBILITY_V2_THRESHOLDS.payload.criticalUsagePct) score = 20;
  else if (usagePct >= RIG_COMPATIBILITY_V2_THRESHOLDS.payload.limitedUsagePct) score = 35;
  else if (usagePct >= RIG_COMPATIBILITY_V2_THRESHOLDS.payload.watchUsagePct) score = 60;
  else if (usagePct >= RIG_COMPATIBILITY_V2_THRESHOLDS.payload.comfortableUsagePct) score = 80;
  else score = 100;

  const overBy = Math.max(0, resolvedOperatingWeight - resolvedGvwr);
  return createFactor(input, 'payload_readiness', {
    score,
    state: stateForScore(score),
    coverage: 'complete',
    includedInScore: true,
    reason: usagePct > 100
      ? `Operating weight exceeds GVWR by ${round(overBy)} lb.`
      : `Operating weight uses ${round(usagePct, 1)}% of GVWR; payload is scored by utilization, not vehicle size.`,
    evidence: [
      {
        label: 'GVWR usage',
        actual: round(usagePct, 1),
        required: RIG_COMPATIBILITY_V2_THRESHOLDS.payload.criticalUsagePct,
        unit: '%',
        passes: usagePct <= 100,
      },
    ],
    missingInputs: [],
    verificationTargets: usagePct >= 90
      ? ['loaded scale-ticket operating weight', 'door-placard GVWR']
      : [],
    warningCodes: usagePct > 100
      ? ['gvwr_exceeded']
      : usagePct >= 95
        ? ['payload_margin_limited']
        : usagePct >= 90
          ? ['payload_margin_watch']
          : [],
  });
}

export type NormalizedRigDrivetrain =
  | 'four_wheel_drive'
  | 'all_wheel_drive'
  | 'two_wheel_drive'
  | 'unknown';

export function normalizeRigDrivetrain(value: string | null | undefined): NormalizedRigDrivetrain {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (/\b(4x4|4wd|four[ -]?wheel drive)\b/.test(normalized)) return 'four_wheel_drive';
  if (/\b(awd|all[ -]?wheel drive)\b/.test(normalized)) return 'all_wheel_drive';
  if (/\b(2wd|fwd|rwd|two[ -]?wheel drive|front[ -]?wheel drive|rear[ -]?wheel drive)\b/.test(normalized)) {
    return 'two_wheel_drive';
  }
  return 'unknown';
}

function calculateDrivetrainFactor(input: RigCompatibilityV2Input): RigCompatibilityV2FactorResult {
  const drivetrain = normalizeRigDrivetrain(input.vehicle.drivetrain);
  const requirement = input.route.tractionRequirement ?? 'unknown';
  const missing = [
    ...(drivetrain === 'unknown' ? ['verified drivetrain'] : []),
    ...(requirement === 'unknown' ? ['route traction requirement'] : []),
  ];
  if (missing.length > 0) {
    return unknownFactor(
      input,
      'drivetrain_traction',
      'Drivetrain fit is unknown until both the vehicle drivetrain and route traction requirement are explicit.',
      missing,
      ['vehicle drivetrain', 'route traction requirement'],
      [{ label: 'Drivetrain', actual: drivetrain, required: requirement }],
    );
  }

  let score = 100;
  if (requirement === 'all_weather') {
    if (drivetrain === 'all_wheel_drive') score = 90;
    if (drivetrain === 'two_wheel_drive') score = 50;
  }
  if (requirement === 'four_wheel_drive') {
    if (drivetrain === 'four_wheel_drive') score = 90;
    else if (drivetrain === 'all_wheel_drive') score = 45;
    else score = 0;
  }

  return createFactor(input, 'drivetrain_traction', {
    score,
    state: stateForScore(score),
    coverage: 'complete',
    includedInScore: true,
    reason: requirement === 'four_wheel_drive' && drivetrain === 'four_wheel_drive'
      ? 'The saved drivetrain meets the explicit four-wheel-drive requirement; lockers and low range remain unassessed.'
      : `Saved drivetrain is ${drivetrain}; route requirement is ${requirement}.`,
    evidence: [{
      label: 'Traction class',
      actual: drivetrain,
      required: requirement,
      passes: score >= RIG_COMPATIBILITY_V2_THRESHOLDS.posture.watchScore,
    }],
    missingInputs: [],
    verificationTargets: requirement === 'four_wheel_drive'
      ? ['low-range availability if the route requires it', 'locker configuration if the route requires it']
      : [],
    warningCodes: requirement === 'four_wheel_drive'
      ? ['low_range_not_assessed', 'lockers_not_assessed']
      : [],
  });
}

function calculateTireFactor(input: RigCompatibilityV2Input): RigCompatibilityV2FactorResult {
  const tire = positiveNumber(input.vehicle.tireDiameterInches);
  const recommended = positiveNumber(input.route.recommendedTireDiameterInches);
  const missing = [
    ...(tire == null ? ['verified tire diameter'] : []),
    ...(recommended == null ? ['route tire recommendation'] : []),
  ];
  if (missing.length > 0) {
    return unknownFactor(
      input,
      'tire_suitability',
      'Tire suitability is unknown; V2 does not substitute a stock tire estimate.',
      missing,
      ['installed tire diameter', 'route tire recommendation'],
    );
  }

  const resolvedTire = tire as number;
  const resolvedRecommended = recommended as number;
  const difference = resolvedTire - resolvedRecommended;
  const score = difference >= 2 ? 100 : difference >= 0 ? 90 : difference >= -1 ? 65 : difference >= -2 ? 40 : 10;
  return createFactor(input, 'tire_suitability', {
    score,
    state: stateForScore(score),
    coverage: 'complete',
    includedInScore: true,
    reason: difference >= 0
      ? `Installed tire diameter meets the explicit route recommendation by ${round(difference, 1)} in.`
      : `Installed tire diameter is ${round(Math.abs(difference), 1)} in below the explicit route recommendation.`,
    evidence: [{
      label: 'Tire diameter',
      actual: resolvedTire,
      required: resolvedRecommended,
      unit: 'in',
      passes: difference >= 0,
    }],
    missingInputs: [],
    verificationTargets: score < 85 ? ['installed tire size and construction', 'route tire recommendation'] : [],
    warningCodes: difference < 0 ? ['tire_recommendation_not_met'] : [],
  });
}

function calculateSuspensionFactor(input: RigCompatibilityV2Input): RigCompatibilityV2FactorResult {
  const recommended = nonNegativeNumber(input.route.recommendedSuspensionLiftInches);
  if (recommended == null) {
    return unknownFactor(
      input,
      'suspension_lift',
      'Suspension fit is unknown because the route has no verified lift requirement.',
      ['route suspension/lift requirement'],
      ['route suspension/lift requirement'],
    );
  }
  if (recommended === 0) {
    return notApplicableFactor(
      input,
      'suspension_lift',
      'The route explicitly has no suspension-lift requirement.',
      [{ label: 'Required lift', actual: input.vehicle.suspensionLiftInches ?? null, required: 0, unit: 'in', passes: true }],
    );
  }

  const lift = nonNegativeNumber(input.vehicle.suspensionLiftInches);
  if (lift == null) {
    return unknownFactor(
      input,
      'suspension_lift',
      'Suspension fit is unknown; V2 does not assume an unconfigured vehicle is stock.',
      ['verified suspension/lift configuration'],
      ['installed suspension/lift configuration'],
    );
  }

  const difference = lift - recommended;
  const score = difference >= 1 ? 100 : difference >= 0 ? 90 : difference >= -1 ? 65 : difference >= -2 ? 35 : 10;
  return createFactor(input, 'suspension_lift', {
    score,
    state: stateForScore(score),
    coverage: 'complete',
    includedInScore: true,
    reason: difference >= 0
      ? `Saved suspension lift meets the explicit route recommendation by ${round(difference, 1)} in.`
      : `Saved suspension lift is ${round(Math.abs(difference), 1)} in below the route recommendation; leveling is not counted as general clearance.`,
    evidence: [{
      label: 'Suspension lift',
      actual: lift,
      required: recommended,
      unit: 'in',
      passes: difference >= 0,
    }],
    missingInputs: [],
    verificationTargets: score < 85 ? ['installed suspension lift', 'route lift requirement'] : [],
    warningCodes: difference < 0 ? ['suspension_recommendation_not_met'] : [],
  });
}

type GeometryCheck = {
  label: string;
  actual: number | null;
  required: number;
  unit: string;
  passes: (actual: number, required: number) => boolean;
  margin: (actual: number, required: number) => number;
  target: string;
};

function calculateGeometryFactor(input: RigCompatibilityV2Input): RigCompatibilityV2FactorResult {
  const vehicle = input.vehicle.geometry ?? {};
  const route = input.route.geometryRequirements ?? {};
  const checks: GeometryCheck[] = [];
  const addMinimum = (
    label: string,
    actual: number | null | undefined,
    required: number | null | undefined,
    unit: string,
    target: string,
  ) => {
    const normalizedRequirement = positiveNumber(required);
    if (normalizedRequirement == null) return;
    checks.push({
      label,
      actual: positiveNumber(actual),
      required: normalizedRequirement,
      unit,
      passes: (value, limit) => value >= limit,
      margin: (value, limit) => (value - limit) / limit,
      target,
    });
  };
  const addMaximum = (
    label: string,
    actual: number | null | undefined,
    required: number | null | undefined,
    unit: string,
    target: string,
  ) => {
    const normalizedRequirement = positiveNumber(required);
    if (normalizedRequirement == null) return;
    checks.push({
      label,
      actual: positiveNumber(actual),
      required: normalizedRequirement,
      unit,
      passes: (value, limit) => value <= limit,
      margin: (value, limit) => (limit - value) / limit,
      target,
    });
  };

  addMinimum('Ground clearance', vehicle.groundClearanceInches, route.minimumGroundClearanceInches, 'in', 'verified ground clearance');
  addMaximum('Wheelbase', vehicle.wheelbaseInches, route.maximumWheelbaseInches, 'in', 'verified wheelbase');
  addMaximum('Vehicle width', vehicle.overallWidthInches, route.maximumVehicleWidthInches, 'in', 'verified overall width');
  addMinimum('Approach angle', vehicle.approachAngleDegrees, route.minimumApproachAngleDegrees, 'deg', 'verified approach angle');
  addMinimum('Breakover angle', vehicle.breakoverAngleDegrees, route.minimumBreakoverAngleDegrees, 'deg', 'verified breakover angle');
  addMinimum('Departure angle', vehicle.departureAngleDegrees, route.minimumDepartureAngleDegrees, 'deg', 'verified departure angle');
  addMaximum('Turning diameter', vehicle.turningDiameterFeet, route.maximumTurningDiameterFeet, 'ft', 'verified turning diameter');

  if (checks.length === 0) {
    return unknownFactor(
      input,
      'vehicle_geometry',
      'Geometry fit is unknown because the route has no verified dimensional constraints.',
      ['route dimensional/geometry constraints'],
      ['route clearance, width, wheelbase, and angle constraints'],
    );
  }

  const missingChecks = checks.filter((check) => check.actual == null);
  const evidence: RigCompatibilityV2FactorEvidence[] = checks.map((check) => ({
    label: check.label,
    actual: check.actual,
    required: check.required,
    unit: check.unit,
    passes: check.actual == null ? null : check.passes(check.actual, check.required),
  }));
  if (missingChecks.length > 0) {
    return unknownFactor(
      input,
      'vehicle_geometry',
      'Geometry fit remains unknown because one or more explicit route constraints cannot be checked.',
      missingChecks.map((check) => check.target),
      missingChecks.map((check) => check.target),
      evidence,
      ['geometry_evidence_incomplete'],
    );
  }

  const evaluated = checks.map((check) => {
    const actual = check.actual as number;
    const passes = check.passes(actual, check.required);
    const margin = check.margin(actual, check.required);
    return { ...check, actual, passes, margin };
  });
  const failures = evaluated.filter((check) => !check.passes);
  const score = failures.length > 0
    ? 0
    : Math.min(...evaluated.map((check) => (check.margin < 0.05 ? 75 : 95)));
  return createFactor(input, 'vehicle_geometry', {
    score,
    state: stateForScore(score),
    coverage: 'complete',
    includedInScore: true,
    reason: failures.length > 0
      ? `Vehicle geometry exceeds ${failures.map((check) => check.label.toLowerCase()).join(', ')} route constraints.`
      : score < 85
        ? 'Vehicle geometry meets the explicit constraints with less than 5% margin on at least one limit.'
        : 'Vehicle geometry meets every explicit route constraint with at least 5% margin.',
    evidence,
    missingInputs: [],
    verificationTargets: failures.map((check) => check.target),
    warningCodes: failures.length > 0
      ? ['vehicle_geometry_constraint_exceeded']
      : score < 85
        ? ['vehicle_geometry_margin_narrow']
        : [],
  });
}

function calculateTrailerFactor(input: RigCompatibilityV2Input): RigCompatibilityV2FactorResult {
  const trailer = input.trailer ?? {};
  const attached = trailer.attached;
  if (attached === false) {
    return notApplicableFactor(
      input,
      'trailer_constraints',
      'No trailer is attached, so trailer constraints are not part of this comparison.',
      [{ label: 'Trailer attached', actual: false, required: false, passes: true }],
    );
  }
  if (attached !== true) {
    return unknownFactor(
      input,
      'trailer_constraints',
      'Trailer fit is unknown because ECS does not have an explicit attached/not-attached state.',
      ['trailer attachment state'],
      ['trailer attachment state'],
    );
  }

  const access = input.route.trailerAccess ?? 'unknown';
  if (access === 'unknown') {
    return unknownFactor(
      input,
      'trailer_constraints',
      'A trailer is attached, but route trailer access is unknown.',
      ['route trailer access evidence'],
      ['route trailer access and turnaround constraints'],
      [{ label: 'Trailer access', actual: 'attached', required: 'verified route access' }],
      ['trailer_route_access_unknown'],
    );
  }
  if (access === 'prohibited') {
    return createFactor(input, 'trailer_constraints', {
      score: 0,
      state: 'incompatible',
      coverage: 'complete',
      includedInScore: true,
      reason: 'The route is explicitly marked as prohibiting trailers.',
      evidence: [{ label: 'Trailer access', actual: 'attached', required: 'prohibited', passes: false }],
      missingInputs: [],
      verificationTargets: ['route trailer prohibition authority'],
      warningCodes: ['trailer_prohibited'],
    });
  }
  if (access === 'not_recommended') {
    return createFactor(input, 'trailer_constraints', {
      score: 30,
      state: 'incompatible',
      coverage: 'complete',
      includedInScore: true,
      reason: 'The route is explicitly marked as not recommended for trailers.',
      evidence: [{ label: 'Trailer access', actual: 'attached', required: 'not recommended', passes: false }],
      missingInputs: [],
      verificationTargets: ['route trailer restriction and turnaround evidence'],
      warningCodes: ['trailer_not_recommended'],
    });
  }

  const maximumWeight = positiveNumber(input.route.maximumTrailerWeightLbs);
  const maximumLength = positiveNumber(input.route.maximumTrailerLengthFeet);
  const checks = [
    ...(maximumWeight == null ? [] : [{
      label: 'Trailer weight',
      actual: positiveNumber(trailer.weightLbs),
      required: maximumWeight,
      unit: 'lb',
      target: 'loaded trailer weight',
    }]),
    ...(maximumLength == null ? [] : [{
      label: 'Trailer length',
      actual: positiveNumber(trailer.lengthFeet),
      required: maximumLength,
      unit: 'ft',
      target: 'trailer length',
    }]),
  ];
  const evidence: RigCompatibilityV2FactorEvidence[] = [
    { label: 'Trailer access', actual: 'attached', required: 'allowed', passes: true },
    ...checks.map((check) => ({
      label: check.label,
      actual: check.actual,
      required: check.required,
      unit: check.unit,
      passes: check.actual == null ? null : check.actual <= check.required,
    })),
  ];
  const missingChecks = checks.filter((check) => check.actual == null);
  if (missingChecks.length > 0) {
    return unknownFactor(
      input,
      'trailer_constraints',
      'Trailer access is allowed, but an explicit route trailer limit cannot be checked.',
      missingChecks.map((check) => check.target),
      missingChecks.map((check) => check.target),
      evidence,
      ['trailer_dimensions_incomplete'],
    );
  }
  const failures = checks.filter((check) => (check.actual as number) > check.required);
  if (failures.length > 0) {
    return createFactor(input, 'trailer_constraints', {
      score: 0,
      state: 'incompatible',
      coverage: 'complete',
      includedInScore: true,
      reason: `Trailer exceeds the route ${failures.map((check) => check.label.toLowerCase()).join(' and ')} limit.`,
      evidence,
      missingInputs: [],
      verificationTargets: failures.map((check) => check.target),
      warningCodes: ['trailer_limit_exceeded'],
    });
  }

  const hasNumericLimits = checks.length > 0;
  return createFactor(input, 'trailer_constraints', {
    score: hasNumericLimits ? 90 : 70,
    state: hasNumericLimits ? 'compatible' : 'watch',
    coverage: hasNumericLimits ? 'complete' : 'partial',
    includedInScore: true,
    reason: hasNumericLimits
      ? 'Attached trailer meets the explicit route access and numeric trailer limits.'
      : 'Route trailer access is allowed, but no numeric trailer limits are available.',
    evidence,
    missingInputs: hasNumericLimits ? [] : ['numeric route trailer limits'],
    verificationTargets: hasNumericLimits ? [] : ['route width, turnaround, weight, and length limits'],
    warningCodes: hasNumericLimits ? [] : ['trailer_numeric_limits_unknown'],
  });
}

function scoreResourceRatio(ratio: number): number {
  if (ratio >= 1.5) return 100;
  if (ratio >= 1.2) return 85;
  if (ratio >= 1) return 65;
  if (ratio >= 0.8) return 35;
  return 0;
}

function calculateResourceFactor(input: RigCompatibilityV2Input): RigCompatibilityV2FactorResult {
  const resources = input.resources ?? {};
  const distance = nonNegativeNumber(input.route.distanceMiles);
  const estimatedFuel = positiveNumber(input.route.estimatedFuelRequiredGallons);
  const currentFuel = nonNegativeNumber(resources.currentFuelGallons);
  const explicitRange = nonNegativeNumber(resources.fuelRangeMiles);
  const averageMpg = positiveNumber(resources.averageMpg);
  const calculatedRange = currentFuel != null && averageMpg != null ? currentFuel * averageMpg : null;
  const fuelRange = explicitRange ?? calculatedRange;
  const reserveRatio = clamp(
    finiteNumber(input.route.fuelReserveRatio) ?? RIG_COMPATIBILITY_V2_THRESHOLDS.defaultFuelReserveRatio,
    0,
    1,
  );

  const evidence: RigCompatibilityV2FactorEvidence[] = [];
  const scores: number[] = [];
  const missing: string[] = [];
  const warnings: string[] = [];
  const reasons: string[] = [];

  if (estimatedFuel != null) {
    if (currentFuel == null) {
      missing.push('current fuel gallons');
    } else {
      const requiredWithReserve = estimatedFuel * (1 + reserveRatio);
      const ratio = requiredWithReserve > 0 ? currentFuel / requiredWithReserve : 1;
      const score = scoreResourceRatio(ratio);
      scores.push(score);
      evidence.push({
        label: 'Fuel on board',
        actual: round(currentFuel, 1),
        required: round(requiredWithReserve, 1),
        unit: 'gal',
        passes: ratio >= 1,
      });
      reasons.push(`Fuel covers ${round(ratio * 100)}% of the route estimate plus ${round(reserveRatio * 100)}% reserve.`);
      if (ratio < 1) warnings.push('fuel_range_below_policy');
    }
  } else if (distance != null && distance > 0) {
    if (fuelRange == null) {
      missing.push('current fuel range from explicit fuel and MPG data');
    } else {
      const requiredWithReserve = distance * (1 + reserveRatio);
      const ratio = fuelRange / requiredWithReserve;
      const score = scoreResourceRatio(ratio);
      scores.push(score);
      evidence.push({
        label: 'Fuel range',
        actual: round(fuelRange, 1),
        required: round(requiredWithReserve, 1),
        unit: 'mi',
        passes: ratio >= 1,
      });
      reasons.push(`Fuel range covers ${round(ratio * 100)}% of route distance plus ${round(reserveRatio * 100)}% reserve.`);
      if (ratio < 1) warnings.push('fuel_range_below_policy');
    }
  }

  const requiredWater = positiveNumber(resources.requiredWaterGallons);
  if (requiredWater != null) {
    const currentWater = nonNegativeNumber(resources.currentWaterGallons);
    if (currentWater == null) {
      missing.push('current water gallons');
    } else {
      const ratio = currentWater / requiredWater;
      scores.push(scoreResourceRatio(ratio));
      evidence.push({
        label: 'Water on board',
        actual: round(currentWater, 1),
        required: round(requiredWater, 1),
        unit: 'gal',
        passes: ratio >= 1,
      });
      reasons.push(`Water covers ${round(ratio * 100)}% of the explicit requirement.`);
      if (ratio < 1) warnings.push('water_below_requirement');
    }
  }

  const requiredPower = positiveNumber(resources.requiredPowerRuntimeHours);
  if (requiredPower != null) {
    const availablePower = nonNegativeNumber(resources.availablePowerRuntimeHours);
    if (availablePower == null) {
      missing.push('available power runtime');
    } else {
      const ratio = availablePower / requiredPower;
      scores.push(scoreResourceRatio(ratio));
      evidence.push({
        label: 'Power runtime',
        actual: round(availablePower, 1),
        required: round(requiredPower, 1),
        unit: 'hr',
        passes: ratio >= 1,
      });
      reasons.push(`Power runtime covers ${round(ratio * 100)}% of the explicit requirement.`);
      if (ratio < 1) warnings.push('power_runtime_below_requirement');
    }
  }

  const routeNeedsFuel = (estimatedFuel != null) || (distance != null && distance > 0);
  if (!routeNeedsFuel && requiredWater == null && requiredPower == null) {
    return unknownFactor(
      input,
      'fuel_resource_range',
      'Fuel and resource fit is unknown because the route has no usable distance or resource requirement.',
      ['route distance or explicit resource requirements'],
      ['route distance and fuel/water/power requirements'],
    );
  }
  if (missing.length > 0) {
    return unknownFactor(
      input,
      'fuel_resource_range',
      'Fuel or resource fit remains unknown because a required current value is missing.',
      missing,
      missing,
      evidence,
      warnings,
    );
  }
  if (scores.length === 0) {
    return unknownFactor(
      input,
      'fuel_resource_range',
      'Fuel and resource fit could not be evaluated from the available inputs.',
      ['usable fuel or resource values'],
      ['current fuel, MPG, water, and power runtime'],
      evidence,
    );
  }

  const score = Math.min(...scores);
  return createFactor(input, 'fuel_resource_range', {
    score,
    state: stateForScore(score),
    coverage: 'complete',
    includedInScore: true,
    reason: reasons.join(' '),
    evidence,
    missingInputs: [],
    verificationTargets: score < 85 ? ['current fuel/resource levels', 'route consumption estimate'] : [],
    warningCodes: warnings,
  });
}

type RecoveryKey = keyof RigCompatibilityV2RecoveryInput;

const RECOVERY_LABELS: Record<RecoveryKey, string> = {
  ratedRecoveryPoints: 'rated recovery points',
  strapOrRope: 'recovery strap or kinetic rope',
  shackles: 'rated shackles',
  tractionAids: 'traction aids',
  fullSizeSpare: 'full-size spare tire',
  jack: 'suitable jack',
  winch: 'winch',
};

function resolveRecoveryRequirement(input: RigCompatibilityV2Input): RigCompatibilityV2RecoveryRequirement {
  const explicit = input.route.recoveryRequirement;
  if (explicit && explicit !== 'unknown') return explicit;
  const remoteness = finiteNumber(input.route.remotenessScore);
  if (remoteness == null) return 'unknown';
  if (remoteness >= RIG_COMPATIBILITY_V2_THRESHOLDS.recovery.remoteRemotenessScore) return 'remote';
  if (remoteness >= RIG_COMPATIBILITY_V2_THRESHOLDS.recovery.basicRemotenessScore) return 'basic';
  return 'none';
}

function calculateRecoveryFactor(input: RigCompatibilityV2Input): RigCompatibilityV2FactorResult {
  const requirement = resolveRecoveryRequirement(input);
  if (requirement === 'unknown') {
    return unknownFactor(
      input,
      'recovery_readiness',
      'Recovery readiness is unknown because neither an explicit requirement nor usable remoteness is available.',
      ['route recovery requirement or remoteness score'],
      ['route recovery requirement', 'recovery kit inventory'],
    );
  }
  if (requirement === 'none') {
    return notApplicableFactor(
      input,
      'recovery_readiness',
      'The route recovery policy does not require a recovery kit for this low-remoteness input.',
      [{ label: 'Recovery requirement', actual: 'not evaluated', required: 'none', passes: true }],
    );
  }

  const required: RecoveryKey[] = requirement === 'basic'
    ? ['ratedRecoveryPoints', 'strapOrRope', 'shackles']
    : requirement === 'self_recovery'
      ? ['ratedRecoveryPoints', 'strapOrRope', 'shackles', 'tractionAids', 'fullSizeSpare', 'jack', 'winch']
      : ['ratedRecoveryPoints', 'strapOrRope', 'shackles', 'tractionAids', 'fullSizeSpare', 'jack'];
  const recovery = input.recovery ?? {};
  const unknown = required.filter((key) => recovery[key] == null);
  const absent = required.filter((key) => recovery[key] === false);
  const evidence = required.map<RigCompatibilityV2FactorEvidence>((key) => ({
    label: RECOVERY_LABELS[key],
    actual: recovery[key] ?? null,
    required: true,
    passes: recovery[key] == null ? null : recovery[key] === true,
  }));
  if (unknown.length > 0) {
    return unknownFactor(
      input,
      'recovery_readiness',
      absent.length > 0
        ? 'Recovery readiness is incomplete and known required items are absent.'
        : 'Recovery readiness is unknown because required kit items have not been verified.',
      unknown.map((key) => RECOVERY_LABELS[key]),
      unknown.map((key) => RECOVERY_LABELS[key]),
      evidence,
      absent.length > 0 ? ['recovery_items_missing', 'recovery_inventory_incomplete'] : ['recovery_inventory_incomplete'],
    );
  }

  const present = required.length - absent.length;
  const score = round((present / required.length) * 100);
  return createFactor(input, 'recovery_readiness', {
    score,
    state: stateForScore(score),
    coverage: 'complete',
    includedInScore: true,
    reason: absent.length === 0
      ? `Verified recovery inventory meets the ${requirement} policy.`
      : `${absent.length} of ${required.length} required recovery items are absent.`,
    evidence,
    missingInputs: [],
    verificationTargets: absent.map((key) => RECOVERY_LABELS[key]),
    warningCodes: absent.length > 0 ? ['recovery_items_missing'] : [],
  });
}

function terrainDifficultyScore(value: number): number {
  if (value <= 3) return 95;
  if (value <= 5) return 75;
  if (value <= 7) return 55;
  return 30;
}

function gradeExposureScore(value: number): number {
  if (value <= 8) return 95;
  if (value <= 12) return 75;
  if (value <= 18) return 50;
  return 25;
}

function calculateTerrainFactor(input: RigCompatibilityV2Input): RigCompatibilityV2FactorResult {
  const difficulty = finiteNumber(input.route.terrainDifficulty);
  const grade = nonNegativeNumber(input.route.maxGradePercent);
  if (difficulty == null && grade == null) {
    return unknownFactor(
      input,
      'terrain_grade_exposure',
      'Route terrain and grade exposure are unknown.',
      ['route terrain difficulty', 'route maximum grade'],
      ['route terrain classification', 'route elevation/grade analysis'],
    );
  }

  const scores = [
    ...(difficulty == null ? [] : [terrainDifficultyScore(clamp(difficulty, 1, 10))]),
    ...(grade == null ? [] : [gradeExposureScore(grade)]),
  ];
  const score = Math.min(...scores);
  const missing = [
    ...(difficulty == null ? ['route terrain difficulty'] : []),
    ...(grade == null ? ['route maximum grade'] : []),
  ];
  return createFactor(input, 'terrain_grade_exposure', {
    score,
    state: stateForScore(score),
    coverage: missing.length > 0 ? 'partial' : 'complete',
    includedInScore: true,
    reason: `Route exposure is based only on ${[
      difficulty == null ? null : `terrain difficulty ${round(difficulty, 1)}/10`,
      grade == null ? null : `maximum grade ${round(grade, 1)}%`,
    ].filter(Boolean).join(' and ')}; vehicle mass does not improve this factor.`,
    evidence: [
      ...(difficulty == null ? [] : [{ label: 'Terrain difficulty', actual: round(difficulty, 1), required: null, unit: '/10' }]),
      ...(grade == null ? [] : [{ label: 'Maximum grade', actual: round(grade, 1), required: null, unit: '%' }]),
    ],
    missingInputs: missing,
    verificationTargets: missing,
    warningCodes: score < 65 ? ['route_exposure_high'] : [],
  });
}

function sourceQuality(
  evidence: RigCompatibilityV2SourceEvidence,
  now: RigCompatibilityV2Input['now'],
): number {
  const ref = evidence.ref;
  const availability = ref.availability === 'unavailable' ? 0 : ref.availability === 'degraded' ? 0.6 : 1;
  const coverage = ref.coverage === 'complete' ? 1 : ref.coverage === 'partial' ? 0.65 : 0.4;
  const conflict = ref.conflict ? 0.3 : 1;
  let freshness = 1;
  if (now != null) {
    const evaluated = evaluateSourceTruthRef(ref, {
      policyKey: evidence.policyKey ?? 'default',
      now,
    });
    freshness = evaluated.freshness === 'live' || evaluated.freshness === 'recent'
      ? 1
      : evaluated.freshness === 'stale'
        ? 0.6
        : evaluated.freshness === 'expired'
          ? 0.25
          : 0;
  }
  return SOURCE_CONFIDENCE_QUALITY[ref.confidence]
    * SOURCE_ORIGIN_QUALITY[ref.origin]
    * availability
    * coverage
    * conflict
    * freshness;
}

function buildConfidence(
  input: RigCompatibilityV2Input,
  factors: Record<RigCompatibilityV2FactorId, RigCompatibilityV2FactorResult>,
): RigCompatibilityV2ConfidenceResult {
  const applicable = Object.values(factors).filter((factor) => factor.state !== 'not_applicable');
  const known = applicable.filter((factor) => factor.includedInScore && factor.score != null);
  const applicableWeight = applicable.reduce((total, factor) => total + factor.weight, 0);
  const knownWeight = known.reduce((total, factor) => total + factor.weight, 0);
  const factorCoveragePct = applicableWeight > 0 ? round((knownWeight / applicableWeight) * 100) : 0;
  const sources = allSourceEntries(input);
  const sourceQualityScore = sources.length > 0
    ? round((sources.reduce((total, item) => total + sourceQuality(item, input.now), 0) / sources.length) * 100)
    : 0;
  let score = knownWeight > 0
    ? round((factorCoveragePct * 0.45) + (sourceQualityScore * 0.55))
    : 0;
  const hasConflict = sources.some((item) => item.ref.conflict);
  if (hasConflict) score = Math.min(score, 35);
  const level: SourceTruthConfidence = score >= RIG_COMPATIBILITY_V2_THRESHOLDS.confidence.highScore
    ? 'high'
    : score >= RIG_COMPATIBILITY_V2_THRESHOLDS.confidence.mediumScore
      ? 'medium'
      : score > 0
        ? 'low'
        : 'unknown';
  const coverage: SourceTruthCoverage = factorCoveragePct >= RIG_COMPATIBILITY_V2_THRESHOLDS.confidence.completeFactorCoveragePct
    ? 'complete'
    : factorCoveragePct > 0
      ? 'partial'
      : 'unknown';
  const reasons = unique([
    factorCoveragePct < 100 ? `${100 - factorCoveragePct}% of applicable factor weight is unknown.` : 'All applicable factors are scored.',
    sources.length === 0 ? 'No source-truth evidence was supplied.' : `Source quality score is ${sourceQualityScore}%.`,
    hasConflict ? 'Conflicting source evidence caps confidence at low.' : '',
  ]);
  return {
    level,
    score,
    coverage,
    factorCoveragePct,
    sourceQualityScore,
    knownFactorWeight: knownWeight,
    applicableFactorWeight: applicableWeight,
    reasons,
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

export function createRigCompatibilityV2Fingerprint(input: RigCompatibilityV2Input): string {
  const sources = allSourceEntries(input).map((item) => ({
    id: item.ref.id,
    origin: item.ref.origin,
    observedAt: item.ref.observedAt ?? null,
    fetchedAt: item.ref.fetchedAt ?? null,
    expiresAt: item.ref.expiresAt ?? null,
    confidence: item.ref.confidence,
    coverage: item.ref.coverage ?? 'unknown',
    availability: item.ref.availability ?? null,
    conflict: item.ref.conflict === true,
    warningCodes: [...item.ref.warningCodes].sort(),
    policyKey: item.policyKey ?? 'default',
  }));
  return `rig-v2-${hashText(JSON.stringify({
    vehicle: input.vehicle,
    route: input.route,
    trailer: input.trailer ?? null,
    resources: input.resources ?? null,
    recovery: input.recovery ?? null,
    sources,
    now: input.now ?? null,
  }))}`;
}

export function calculateRigCompatibilityV2(input: RigCompatibilityV2Input): RigCompatibilityV2Result {
  const factorList = [
    calculatePayloadFactor(input),
    calculateDrivetrainFactor(input),
    calculateTireFactor(input),
    calculateSuspensionFactor(input),
    calculateGeometryFactor(input),
    calculateTrailerFactor(input),
    calculateResourceFactor(input),
    calculateRecoveryFactor(input),
    calculateTerrainFactor(input),
  ];
  const factors = Object.fromEntries(
    factorList.map((factor) => [factor.id, factor]),
  ) as Record<RigCompatibilityV2FactorId, RigCompatibilityV2FactorResult>;
  const scored = factorList.filter((factor) => factor.includedInScore && factor.score != null);
  const scoredWeight = scored.reduce((total, factor) => total + factor.weight, 0);
  const score = scoredWeight > 0
    ? round(scored.reduce((total, factor) => total + (factor.score as number) * factor.weight, 0) / scoredWeight)
    : null;
  const incompatible = factorList.filter((factor) => factor.state === 'incompatible');
  const posture = incompatible.length > 0 ? 'incompatible' : postureForScore(score);
  const confidence = buildConfidence(input, factors);
  const sources = allSourceEntries(input).map((item) => item.ref);
  const sourceRefs = Array.from(new Map(sources.map((ref) => [ref.id, ref])).values());
  const limitingFactors = factorList
    .filter((factor) => factor.state === 'incompatible' || factor.state === 'limited')
    .sort((a, b) => b.weight - a.weight)
    .map((factor) => factor.id);
  const missingData = unique(factorList.flatMap((factor) => factor.missingInputs));
  const warnings = unique([
    ...factorList.flatMap((factor) => factor.warningCodes),
    ...(confidence.factorCoveragePct < 100 ? ['partial_factor_coverage'] : []),
    ...(confidence.level === 'low' || confidence.level === 'unknown' ? ['compatibility_confidence_limited'] : []),
  ]);
  const suggestedVerificationTargets = unique(
    factorList.flatMap((factor) => factor.verificationTargets),
  );

  return {
    version: RIG_COMPATIBILITY_V2_VERSION,
    fingerprint: createRigCompatibilityV2Fingerprint(input),
    score,
    posture,
    factors,
    limitingFactors,
    missingData,
    confidence,
    sourceTruth: sourceRefs,
    warnings,
    suggestedVerificationTargets,
    deterministic: true,
    aiAuthority: 'explanation_only',
  };
}

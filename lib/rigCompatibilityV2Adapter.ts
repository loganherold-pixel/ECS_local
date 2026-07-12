import type { ECSConfidenceReason, ECSConfidenceResult } from './ai/confidenceTypes';
import type { ActiveVehicleContext } from './vehicle/activeVehicleTypes';
import type { RouteIntelligence } from './routeAnalysisEngine';
import type {
  CompatibilityExpedition,
  CompatibilityResult,
  DifficultyRating,
} from './rigCompatibilityEngine';
import {
  calculateRigCompatibilityV2,
  type RigCompatibilityV2Input,
  type RigCompatibilityV2RecoveryInput,
  type RigCompatibilityV2ResourceInput,
  type RigCompatibilityV2Result,
  type RigCompatibilityV2RouteInput,
  type RigCompatibilityV2SourceEvidence,
  type RigCompatibilityV2SourceMap,
  type RigCompatibilityV2TrailerInput,
} from './rigCompatibilityV2';
import {
  isRigCompatibilityV2Enabled,
  type RigCompatibilityV2FeatureFlags,
} from './rigCompatibilityV2Config';
import {
  sanitizeSourceTruthRef,
  type SourceTruthConfidence,
  type SourceTruthOrigin,
  type SourceTruthRef,
} from './sourceTruth';

type CompatibilityOpportunityWithAuthority = CompatibilityExpedition & {
  routeAuthorityLabel?: string | null;
  routeAuthoritySource?: string | null;
  hasTrueTrailGeometry?: boolean | null;
};

export interface RigCompatibilityV2AdapterOptions {
  now?: number | Date | string | null;
  routeIntelligence?: Pick<
    RouteIntelligence,
    'totalDistanceMiles' | 'segments' | 'analyzedAt' | 'hasElevation'
  > | null;
  routeOverrides?: Partial<RigCompatibilityV2RouteInput> | null;
  trailer?: RigCompatibilityV2TrailerInput | null;
  resources?: Partial<RigCompatibilityV2ResourceInput> | null;
  recovery?: Partial<RigCompatibilityV2RecoveryInput> | null;
  sourceTruth?: RigCompatibilityV2SourceMap | null;
}

export interface RigCompatibilityV2Diagnostics {
  v1FactorCount: 5;
  v2FactorCount: 9;
  v1Score: number;
  v2Score: number | null;
  scoreDelta: number | null;
  v1DifficultyRating: DifficultyRating;
  v2Posture: RigCompatibilityV2Result['posture'];
  v1CapabilityUsesGvwrProxy: true;
  v2CapabilityUsesGvwrProxy: false;
  v2UnknownFactors: RigCompatibilityV2Result['missingData'];
}

export interface VersionedRigCompatibilityResult {
  activeVersion: 'v1' | 'v2';
  presentationResult: CompatibilityResult;
  v1: CompatibilityResult;
  v2: RigCompatibilityV2Result | null;
  diagnostics: RigCompatibilityV2Diagnostics | null;
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

function firstPositive(...values: (number | null | undefined)[]): number | null {
  for (const value of values) {
    const normalized = positiveNumber(value);
    if (normalized != null) return normalized;
  }
  return null;
}

function firstNonNegative(...values: (number | null | undefined)[]): number | null {
  for (const value of values) {
    const normalized = nonNegativeNumber(value);
    if (normalized != null) return normalized;
  }
  return null;
}

function toIso(value: number | string | null | undefined): string | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function sourceConfidence(score: number | null | undefined): SourceTruthConfidence {
  const normalized = finiteNumber(score);
  if (normalized == null || normalized <= 0) return 'unknown';
  if (normalized >= 85) return 'high';
  if (normalized >= 65) return 'medium';
  return 'low';
}

function sourceEvidence(
  ref: SourceTruthRef,
  policyKey: RigCompatibilityV2SourceEvidence['policyKey'],
): RigCompatibilityV2SourceEvidence {
  return {
    ref: sanitizeSourceTruthRef(ref),
    policyKey,
  };
}

function unavailableSource(id: string, warningCode: string): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id,
    origin: 'unavailable',
    authority: 'ECS local state',
    provider: null,
    observedAt: null,
    fetchedAt: null,
    expiresAt: null,
    confidence: 'unknown',
    coverage: 'unknown',
    availability: 'unavailable',
    conflict: false,
    warningCodes: [warningCode],
  });
}

function vehicleProfileSource(context: ActiveVehicleContext): RigCompatibilityV2SourceEvidence {
  const available = context.hasVehicleContext;
  return sourceEvidence({
    id: `rig-vehicle-profile:${context.activeVehicleId ?? 'none'}`,
    origin: available ? 'manual' : 'unavailable',
    authority: 'ECS Fleet profile',
    provider: null,
    observedAt: context.vehicle?.updated_at ?? context.vehicleState.updatedAt,
    fetchedAt: null,
    expiresAt: null,
    confidence: available ? sourceConfidence(context.vehicleState.confidence.score) : 'unknown',
    coverage: available ? (context.weightSnapshot.isPartial ? 'partial' : 'complete') : 'unknown',
    availability: available ? (context.weightSnapshot.isPartial ? 'degraded' : 'usable') : 'unavailable',
    conflict: false,
    warningCodes: context.weightSnapshot.isPartial ? ['vehicle_profile_partial'] : [],
  }, 'vehicle_profile');
}

function payloadSource(context: ActiveVehicleContext): RigCompatibilityV2SourceEvidence {
  const available = context.weightSnapshot.gvwrLbs != null
    && context.weightSnapshot.estimatedOperatingWeightLbs != null;
  const origin: SourceTruthOrigin = !available
    ? 'unavailable'
    : context.weightSnapshot.isEstimate
      ? 'estimated'
      : 'manual';
  return sourceEvidence({
    id: `rig-payload:${context.activeVehicleId ?? 'none'}`,
    origin,
    authority: 'ECS Fleet weight engine',
    provider: null,
    observedAt: context.vehicle?.updated_at ?? context.vehicleState.updatedAt,
    fetchedAt: null,
    expiresAt: null,
    confidence: available ? sourceConfidence(context.weightSnapshot.weightConfidence) : 'unknown',
    coverage: available ? (context.weightSnapshot.isPartial ? 'partial' : 'complete') : 'unknown',
    availability: available ? (context.weightSnapshot.isPartial ? 'degraded' : 'usable') : 'unavailable',
    conflict: false,
    warningCodes: [
      ...(context.weightSnapshot.isEstimate ? ['weight_estimated'] : []),
      ...(context.weightSnapshot.isPartial ? ['weight_partial'] : []),
    ],
  }, 'vehicle_profile');
}

function profileFieldSource(
  context: ActiveVehicleContext,
  id: string,
  available: boolean,
  observedAt?: string | null,
): RigCompatibilityV2SourceEvidence {
  const hasOemReference = Boolean(context.spec?.oem_reference_id);
  return sourceEvidence({
    id: `${id}:${context.activeVehicleId ?? 'none'}`,
    origin: !available ? 'unavailable' : hasOemReference ? 'cached' : 'manual',
    authority: hasOemReference
      ? context.spec?.oem_reference_label ?? 'Saved OEM reference'
      : 'ECS Fleet profile',
    provider: hasOemReference ? 'ECS OEM spec catalog' : null,
    observedAt: observedAt ?? context.vehicle?.updated_at ?? context.vehicleState.updatedAt,
    fetchedAt: null,
    expiresAt: null,
    confidence: !available
      ? 'unknown'
      : sourceConfidence(context.spec?.oem_reference_confidence ?? context.vehicleState.confidence.score),
    coverage: available ? 'complete' : 'unknown',
    availability: available ? 'usable' : 'unavailable',
    conflict: false,
    warningCodes: available ? [] : [`${id}_missing`],
  }, 'vehicle_profile');
}

function routeSource(
  opportunity: CompatibilityOpportunityWithAuthority,
  options: RigCompatibilityV2AdapterOptions,
): RigCompatibilityV2SourceEvidence {
  const hasAnalysis = Boolean(options.routeIntelligence);
  const hasGeometry = opportunity.hasTrueTrailGeometry === true || hasAnalysis;
  return sourceEvidence({
    id: `rig-route:${opportunity.id}`,
    origin: 'cached',
    authority: opportunity.routeAuthorityLabel ?? 'ECS route catalog',
    provider: opportunity.routeAuthoritySource ?? null,
    observedAt: options.routeIntelligence?.analyzedAt ?? null,
    fetchedAt: null,
    expiresAt: null,
    confidence: hasGeometry ? 'high' : 'medium',
    coverage: hasGeometry ? 'complete' : 'partial',
    availability: 'usable',
    conflict: false,
    warningCodes: hasGeometry ? [] : ['route_geometry_or_analysis_partial'],
  }, 'offline_map_route_package');
}

function currentFuelGallons(context: ActiveVehicleContext): number | null {
  const explicitGallons = context.consumables?.fuel_gal_updated_at != null
    ? nonNegativeNumber(context.consumables.fuel_gal_current)
    : null;
  if (explicitGallons != null) return explicitGallons;

  const hasExplicitPercent = (context.consumables?.fuel_percent_current ?? 0) > 0
    || context.vehicle?.current_fuel_percent != null;
  return hasExplicitPercent
    ? nonNegativeNumber(context.resourceProfile.currentFuelGallons)
    : null;
}

function currentWaterGallons(context: ActiveVehicleContext): number | null {
  const hasExplicitWater = context.consumables?.water_updated_at != null
    || context.vehicle?.current_water_gal != null;
  return hasExplicitWater
    ? nonNegativeNumber(context.resourceProfile.currentWaterGallons)
    : null;
}

function resourceSource(
  context: ActiveVehicleContext,
  fuelGallons: number | null,
  waterGallons: number | null,
): RigCompatibilityV2SourceEvidence {
  const hasResource = fuelGallons != null || waterGallons != null;
  const origin: SourceTruthOrigin = !hasResource
    ? 'unavailable'
    : context.consumables?.fuel_source === 'sensor'
      ? 'live'
      : 'manual';
  const observedAt = toIso(
    context.consumables?.fuel_gal_updated_at
      ?? context.consumables?.water_updated_at
      ?? context.vehicle?.updated_at,
  );
  return sourceEvidence({
    id: `rig-resources:${context.activeVehicleId ?? 'none'}`,
    origin,
    authority: origin === 'live' ? 'Vehicle consumables sensor' : 'ECS consumables state',
    provider: null,
    observedAt,
    fetchedAt: null,
    expiresAt: null,
    confidence: hasResource ? (origin === 'live' ? 'high' : 'medium') : 'unknown',
    coverage: hasResource ? 'partial' : 'unknown',
    availability: hasResource ? 'usable' : 'unavailable',
    conflict: false,
    warningCodes: hasResource ? [] : ['current_resources_missing'],
  }, origin === 'live' ? 'vehicle_telemetry' : 'manual_user_state');
}

function recoveryFromContext(context: ActiveVehicleContext): RigCompatibilityV2RecoveryInput {
  const labels = [
    ...context.accessorySummary
      .filter((item) => !/planned/i.test(item.status))
      .map((item) => item.label),
    ...context.loadoutItems
      .filter((item) => item.is_packed)
      .map((item) => `${item.name} ${item.category} ${item.notes ?? ''}`),
  ].join(' ').toLowerCase();
  const has = (pattern: RegExp): true | null => pattern.test(labels) ? true : null;
  return {
    ratedRecoveryPoints: has(/\brated recovery point(s)?\b/),
    strapOrRope: has(/\b(recovery strap|kinetic rope|kinetic recovery rope|static recovery strap)\b/),
    shackles: has(/\b(soft shackle|steel shackle|rated shackle)(s)?\b/),
    tractionAids: has(/\b(traction board|recovery board|maxtrax|snow chain)(s)?\b/),
    fullSizeSpare: has(/\bfull[- ]size spare( tire)?\b/),
    jack: has(/\b(bottle jack|jack base|high lift|farm jack)\b/),
    winch: has(/\bwinch\b/),
  };
}

function recoverySource(
  context: ActiveVehicleContext,
  recovery: RigCompatibilityV2RecoveryInput,
): RigCompatibilityV2SourceEvidence {
  const knownItems = Object.values(recovery).filter((value) => value === true).length;
  return sourceEvidence({
    id: `rig-recovery:${context.activeVehicleId ?? 'none'}`,
    origin: knownItems > 0 ? 'manual' : 'unavailable',
    authority: 'ECS Fleet loadout',
    provider: null,
    observedAt: context.loadout?.updated_at ?? context.vehicle?.updated_at ?? null,
    fetchedAt: null,
    expiresAt: null,
    confidence: knownItems > 0 ? 'medium' : 'unknown',
    coverage: knownItems > 0 ? 'partial' : 'unknown',
    availability: knownItems > 0 ? 'degraded' : 'unavailable',
    conflict: false,
    warningCodes: ['recovery_inventory_presence_only'],
  }, 'manual_user_state');
}

function maxRouteGrade(options: RigCompatibilityV2AdapterOptions): number | null {
  if (!options.routeIntelligence?.hasElevation) return null;
  const grades = options.routeIntelligence.segments
    .map((segment) => nonNegativeNumber(segment.maxGradePercent))
    .filter((value): value is number => value != null);
  return grades.length > 0 ? Math.max(...grades) : null;
}

export function buildRigCompatibilityV2InputFromActiveVehicleContext(
  context: ActiveVehicleContext,
  rawOpportunity: CompatibilityExpedition,
  options: RigCompatibilityV2AdapterOptions = {},
): RigCompatibilityV2Input {
  const opportunity = rawOpportunity as CompatibilityOpportunityWithAuthority;
  const canonicalBuild = context.vehicleState.canonicalFleetState?.fleetVehicle.buildProfile;
  const drivetrain = context.spec?.drivetrain
    ?? canonicalBuild?.drivetrain
    ?? (typeof context.wizardConfig?.drivetrain === 'string' ? context.wizardConfig.drivetrain : null)
    ?? null;
  const tireDiameter = firstPositive(
    context.tiresLift?.tireSizeInches,
    context.spec?.tire_size_inches,
    context.vehicle?.tire_size_inches,
  );
  const suspensionIsExplicit = context.tiresLift != null
    || finiteNumber(context.spec?.suspension_lift_inches) != null
    || finiteNumber(context.vehicle?.suspension_lift_inches) != null;
  const suspensionLift = suspensionIsExplicit
    ? firstNonNegative(
        context.tiresLift?.suspensionLiftInches,
        context.spec?.suspension_lift_inches,
        context.vehicle?.suspension_lift_inches,
      )
    : null;
  const fuelGallons = currentFuelGallons(context);
  const waterGallons = currentWaterGallons(context);
  const averageMpg = positiveNumber(context.vehicle?.avg_mpg);
  const inferredRecovery = recoveryFromContext(context);
  const recovery = { ...inferredRecovery, ...(options.recovery ?? {}) };
  const routeEvidence = routeSource(opportunity, options);
  const geometryValues = {
    groundClearanceInches: firstPositive(context.spec?.ground_clearance_inches, context.vehicle?.ground_clearance_inches),
    wheelbaseInches: firstPositive(context.spec?.wheelbase_in, context.vehicle?.wheelbase_in),
    overallWidthInches: firstPositive(context.spec?.overall_width_in, context.vehicle?.overall_width_in),
    approachAngleDegrees: firstPositive(context.spec?.approach_angle_deg, context.vehicle?.approach_angle_deg),
    breakoverAngleDegrees: firstPositive(context.spec?.breakover_angle_deg, context.vehicle?.breakover_angle_deg),
    departureAngleDegrees: firstPositive(context.spec?.departure_angle_deg, context.vehicle?.departure_angle_deg),
    turningDiameterFeet: firstPositive(context.spec?.turning_diameter_ft, context.vehicle?.turning_diameter_ft),
  };
  const hasGeometry = Object.values(geometryValues).some((value) => value != null);
  const defaultSources: RigCompatibilityV2SourceMap = {
    vehicle_profile: vehicleProfileSource(context),
    route: routeEvidence,
    payload_readiness: payloadSource(context),
    drivetrain_traction: profileFieldSource(context, 'drivetrain', Boolean(drivetrain)),
    tire_suitability: profileFieldSource(
      context,
      'tires',
      tireDiameter != null,
      context.tiresLift?.updatedAt ?? null,
    ),
    suspension_lift: profileFieldSource(
      context,
      'suspension',
      suspensionLift != null,
      context.tiresLift?.updatedAt ?? null,
    ),
    vehicle_geometry: profileFieldSource(context, 'geometry', hasGeometry),
    trailer_constraints: options.trailer
      ? sourceEvidence({
          id: `rig-trailer:${context.activeVehicleId ?? 'none'}`,
          origin: 'manual',
          authority: 'ECS trip context',
          provider: null,
          observedAt: context.vehicleState.updatedAt,
          fetchedAt: null,
          expiresAt: null,
          confidence: 'medium',
          coverage: 'partial',
          availability: 'usable',
          conflict: false,
          warningCodes: [],
        }, 'manual_user_state')
      : sourceEvidence(unavailableSource('rig-trailer:none', 'trailer_state_missing'), 'manual_user_state'),
    fuel_resource_range: resourceSource(context, fuelGallons, waterGallons),
    recovery_readiness: recoverySource(context, recovery),
    terrain_grade_exposure: routeEvidence,
  };
  const route: RigCompatibilityV2RouteInput = {
    label: opportunity.name,
    distanceMiles: options.routeIntelligence?.totalDistanceMiles ?? opportunity.distanceMiles,
    estimatedFuelRequiredGallons: opportunity.estimatedFuelRequired,
    terrainType: opportunity.terrainType,
    terrainDifficulty: opportunity.terrainDifficulty ?? null,
    maxGradePercent: maxRouteGrade(options),
    remotenessScore: opportunity.remotenessScore,
    tractionRequirement: 'unknown',
    recommendedTireDiameterInches: opportunity.recommendedTireSize ?? null,
    recommendedSuspensionLiftInches: opportunity.recommendedLift ?? null,
    geometryRequirements: null,
    trailerAccess: 'unknown',
    maximumTrailerWeightLbs: null,
    maximumTrailerLengthFeet: null,
    fuelReserveRatio: null,
    recoveryRequirement: null,
    ...(options.routeOverrides ?? {}),
    id: options.routeOverrides?.id ?? opportunity.id,
  };

  return {
    vehicle: {
      id: context.activeVehicleId ?? context.vehicle?.id ?? 'vehicle-unavailable',
      label: context.vehicle?.name ?? context.vehicleState.identity.displayName,
      gvwrLbs: context.weightSnapshot.gvwrLbs,
      operatingWeightLbs: context.weightSnapshot.estimatedOperatingWeightLbs,
      drivetrain,
      tireDiameterInches: tireDiameter,
      suspensionLiftInches: suspensionLift,
      isLeveled: suspensionIsExplicit
        ? Boolean(context.tiresLift?.isLeveled ?? context.spec?.is_leveled ?? context.vehicle?.is_leveled)
        : null,
      geometry: geometryValues,
    },
    route,
    trailer: options.trailer ?? { attached: null, weightLbs: null, lengthFeet: null },
    resources: {
      currentFuelGallons: fuelGallons,
      averageMpg,
      fuelRangeMiles: fuelGallons != null && averageMpg != null ? fuelGallons * averageMpg : null,
      currentWaterGallons: waterGallons,
      requiredWaterGallons: null,
      availablePowerRuntimeHours: null,
      requiredPowerRuntimeHours: null,
      ...(options.resources ?? {}),
    },
    recovery,
    sourceTruth: {
      ...defaultSources,
      ...(options.sourceTruth ?? {}),
    },
    now: options.now ?? null,
  };
}

function legacyDifficulty(score: number): DifficultyRating {
  if (score >= 90) return 'EASY';
  if (score >= 70) return 'MODERATE';
  if (score >= 40) return 'HARD';
  return 'EXTREME';
}

function averageKnown(values: (number | null)[], fallback: number): number {
  const known = values.filter((value): value is number => value != null);
  return known.length > 0
    ? Math.round(known.reduce((total, value) => total + value, 0) / known.length)
    : fallback;
}

function legacyConfidence(v2: RigCompatibilityV2Result): ECSConfidenceResult {
  const level = v2.confidence.level === 'medium' ? 'moderate' : v2.confidence.level;
  const reasons: ECSConfidenceReason[] = [];
  if (v2.confidence.factorCoveragePct < 100) reasons.push('missing_required_inputs');
  if (v2.sourceTruth.some((source) => source.conflict)) reasons.push('conflicting_inputs');
  if (v2.sourceTruth.some((source) => source.origin === 'manual')) reasons.push('manual_only');
  if (v2.sourceTruth.some((source) => source.origin === 'estimated' || source.origin === 'inferred')) {
    reasons.push('estimated_partial');
  }
  if (reasons.length === 0 && v2.sourceTruth.length === 0) reasons.push('awaiting_signal');

  const sourceSummary = v2.sourceTruth.reduce<ECSConfidenceResult['sourceSummary']>((summary, source) => {
    if (source.origin === 'live') summary.live += 1;
    else if (source.origin === 'manual') summary.manual += 1;
    else if (source.origin === 'unavailable') summary.missing += 1;
    else summary.inferred += 1;
    return summary;
  }, { live: 0, manual: 0, inferred: 0, stale: 0, missing: 0 });

  return {
    level,
    score: v2.confidence.score,
    label: `${v2.confidence.level === 'unknown' ? 'Unknown' : `${v2.confidence.level[0].toUpperCase()}${v2.confidence.level.slice(1)}`} confidence`,
    shortReason: `${v2.confidence.factorCoveragePct}% factor coverage; source quality ${v2.confidence.sourceQualityScore}%`,
    reasons,
    sourceSummary,
  };
}

/**
 * Transitional adapter for legacy cards. It is never selected unless the V2
 * rollout flag is explicitly enabled.
 */
export function adaptRigCompatibilityV2ToLegacyResult(
  v2: RigCompatibilityV2Result,
  fallbackV1: CompatibilityResult,
): CompatibilityResult {
  const score = v2.score ?? fallbackV1.score;
  return {
    score,
    difficultyRating: legacyDifficulty(score),
    factors: {
      terrainMatch: v2.factors.terrain_grade_exposure.score ?? fallbackV1.factors.terrainMatch,
      fuelRangeCoverage: v2.factors.fuel_resource_range.score ?? fallbackV1.factors.fuelRangeCoverage,
      vehicleCapability: averageKnown([
        v2.factors.payload_readiness.score,
        v2.factors.drivetrain_traction.score,
        v2.factors.vehicle_geometry.score,
        v2.factors.trailer_constraints.score,
      ], fallbackV1.factors.vehicleCapability),
      tireSizeMatch: v2.factors.tire_suitability.score ?? fallbackV1.factors.tireSizeMatch,
      suspensionLiftMatch: v2.factors.suspension_lift.score ?? fallbackV1.factors.suspensionLiftMatch,
    },
    isFullScore: v2.confidence.coverage === 'complete' && v2.missingData.length === 0,
    confidence: legacyConfidence(v2),
    notes: [
      ...v2.warnings.map((warning) => `V2: ${warning.replace(/_/g, ' ')}`),
      ...v2.missingData.map((missing) => `V2 missing: ${missing}`),
    ],
    explanation: null,
  };
}

export function compareRigCompatibilityVersions(
  v1: CompatibilityResult,
  v2: RigCompatibilityV2Result,
): RigCompatibilityV2Diagnostics {
  return {
    v1FactorCount: 5,
    v2FactorCount: 9,
    v1Score: v1.score,
    v2Score: v2.score,
    scoreDelta: v2.score == null ? null : v2.score - v1.score,
    v1DifficultyRating: v1.difficultyRating,
    v2Posture: v2.posture,
    v1CapabilityUsesGvwrProxy: true,
    v2CapabilityUsesGvwrProxy: false,
    v2UnknownFactors: [...v2.missingData],
  };
}

export function resolveVersionedRigCompatibility(input: {
  v1: CompatibilityResult;
  v2Input: RigCompatibilityV2Input;
  flags?: RigCompatibilityV2FeatureFlags | null;
}): VersionedRigCompatibilityResult {
  if (!isRigCompatibilityV2Enabled(input.flags)) {
    return {
      activeVersion: 'v1',
      presentationResult: input.v1,
      v1: input.v1,
      v2: null,
      diagnostics: null,
    };
  }

  const v2 = calculateRigCompatibilityV2(input.v2Input);
  return {
    activeVersion: 'v2',
    presentationResult: adaptRigCompatibilityV2ToLegacyResult(v2, input.v1),
    v1: input.v1,
    v2,
    diagnostics: compareRigCompatibilityVersions(input.v1, v2),
  };
}

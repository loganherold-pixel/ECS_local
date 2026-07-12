import type { ActiveVehicleContext } from './vehicle/activeVehicleTypes';
import type { RouteIntelligence, RouteAnalysisSegment } from './routeAnalysisEngine';
import type { CompatibilityExpedition } from './rigCompatibilityEngine';
import {
  type RigCompatibilityV2RecoveryInput,
  type RigCompatibilityV2ResourceInput,
  type RigCompatibilityV2SourceMap,
  type RigCompatibilityV2TrailerInput,
} from './rigCompatibilityV2';
import { buildRigCompatibilityV2InputFromActiveVehicleContext } from './rigCompatibilityV2Adapter';
import type { RunSegment } from './segmentRiskEngine';
import { sanitizeSourceTruthRef, type SourceTruthConfidence, type SourceTruthRef } from './sourceTruth';
import {
  evaluateVehicleRouteConstraintEnvelope,
  type VehicleRouteAdvisoryCoverage,
  type VehicleRouteConstraintEnvelopeInput,
  type VehicleRouteConstraintEnvelopeResult,
  type VehicleRouteConstraintSegmentInput,
  type VehicleRouteKnownAdvisory,
  type VehicleRouteSegmentKnownConstraints,
} from './vehicleRouteConstraintEnvelope';

const METERS_PER_MILE = 1609.344;

export interface VehicleRouteConstraintSegmentEvidence {
  knownConstraints?: VehicleRouteSegmentKnownConstraints | null;
  advisories?: readonly VehicleRouteKnownAdvisory[] | null;
  advisoryCoverage?: VehicleRouteAdvisoryCoverage | null;
  sourceTruth?: SourceTruthRef | null;
}

export interface VehicleRouteConstraintEnvelopeAdapterOptions {
  now?: number | Date | string | null;
  routeRiskSegments?: readonly RunSegment[] | null;
  segmentEvidenceByIndex?: Readonly<Record<number, VehicleRouteConstraintSegmentEvidence | undefined>> | null;
  trailer?: RigCompatibilityV2TrailerInput | null;
  resources?: Partial<RigCompatibilityV2ResourceInput> | null;
  recovery?: Partial<RigCompatibilityV2RecoveryInput> | null;
  sourceTruth?: RigCompatibilityV2SourceMap | null;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function terrainDifficulty(value: RouteIntelligence['overallDifficulty']): number {
  if (value === 'easy') return 2;
  if (value === 'moderate') return 4;
  if (value === 'challenging') return 6;
  return 8;
}

function vehicleConfidence(context: ActiveVehicleContext): SourceTruthConfidence {
  const score = finiteNumber(context.vehicleState.confidence.score);
  if (score == null || score <= 0) return 'unknown';
  if (score >= 85) return 'high';
  if (score >= 65) return 'medium';
  return 'low';
}

function routeAnalysisSource(intelligence: RouteIntelligence): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id: `vehicle-envelope:route-analysis:${intelligence.id}`,
    origin: 'inferred',
    authority: 'ECS Route Analysis',
    provider: null,
    observedAt: intelligence.analyzedAt,
    fetchedAt: null,
    expiresAt: null,
    confidence: intelligence.hasElevation ? 'medium' : 'low',
    coverage: intelligence.hasElevation ? 'complete' : 'partial',
    availability: intelligence.segments.length > 0 ? 'usable' : 'unavailable',
    conflict: false,
    warningCodes: intelligence.hasElevation ? [] : ['route_elevation_unavailable'],
  });
}

function loadDistributionSource(context: ActiveVehicleContext): SourceTruthRef {
  const load = context.vehicleState.centerOfGravity;
  return sanitizeSourceTruthRef({
    id: `vehicle-envelope:load-distribution:${context.activeVehicleId ?? 'none'}`,
    origin: context.weightSnapshot.isEstimate ? 'estimated' : 'manual',
    authority: 'ECS Fleet',
    provider: null,
    observedAt: context.vehicleState.updatedAt,
    fetchedAt: null,
    expiresAt: null,
    confidence: vehicleConfidence(context),
    coverage: context.weightSnapshot.isPartial || !load.dataQuality ? 'partial' : 'complete',
    availability: context.hasVehicleContext && load.totalKnownWeightLbs != null ? 'usable' : 'unavailable',
    conflict: false,
    warningCodes: [
      ...(context.weightSnapshot.isPartial ? ['fleet_weight_partial'] : []),
      ...load.warnings,
    ],
  });
}

function runSegmentRangeMiles(segment: RunSegment): { start: number; end: number } {
  const end = Math.max(0, segment.cumulative_distance_m / METERS_PER_MILE);
  const start = Math.max(0, end - (segment.distance_m / METERS_PER_MILE));
  return { start, end };
}

function overlappingRunSegments(
  segment: RouteAnalysisSegment,
  routeRiskSegments: readonly RunSegment[] | null | undefined,
): RunSegment[] {
  if (!routeRiskSegments?.length) return [];
  return routeRiskSegments.filter((riskSegment) => {
    const range = runSegmentRangeMiles(riskSegment);
    return range.end > segment.distanceStart && range.start < segment.distanceEnd;
  });
}

function bailoutEvidence(
  intelligence: RouteIntelligence,
  routeSegment: RouteAnalysisSegment,
  routeRiskSegments: readonly RunSegment[] | null | undefined,
): {
  available: boolean;
  nearestDistanceMiles: number | null;
  remotenessScore: number | null;
  sourceTruth: SourceTruthRef;
} {
  const matching = overlappingRunSegments(routeSegment, routeRiskSegments);
  const complete = matching.length > 0 && matching.every((segment) => finiteNumber(segment.bailout_dist_m) != null);
  const distances = matching
    .map((segment) => finiteNumber(segment.bailout_dist_m))
    .filter((value): value is number => value != null && value >= 0);
  const scores = matching
    .map((segment) => finiteNumber(segment.remoteness_score))
    .filter((value): value is number => value != null && value >= 0);
  const partial = !complete && distances.length > 0;
  return {
    available: complete,
    nearestDistanceMiles: complete && distances.length > 0
      ? Math.max(...distances) / METERS_PER_MILE
      : null,
    remotenessScore: complete && scores.length > 0
      ? clamp(Math.max(...scores) / 4, 0, 10)
      : null,
    sourceTruth: sanitizeSourceTruthRef({
      id: `vehicle-envelope:bailout:${intelligence.sourceId}:${routeSegment.segmentIndex}`,
      origin: matching.length > 0 ? 'inferred' : 'unavailable',
      authority: 'ECS Bailout Analysis',
      provider: null,
      observedAt: null,
      fetchedAt: null,
      expiresAt: null,
      confidence: complete ? 'medium' : partial ? 'low' : 'unknown',
      coverage: complete ? 'complete' : partial ? 'partial' : 'unknown',
      availability: complete ? 'usable' : partial ? 'degraded' : 'unavailable',
      conflict: false,
      warningCodes: complete
        ? []
        : partial
          ? ['bailout_coverage_partial']
          : ['bailout_data_unavailable'],
    }),
  };
}

function buildSegment(
  intelligence: RouteIntelligence,
  segment: RouteAnalysisSegment,
  routeSource: SourceTruthRef,
  options: VehicleRouteConstraintEnvelopeAdapterOptions,
): VehicleRouteConstraintSegmentInput {
  const evidence = options.segmentEvidenceByIndex?.[segment.segmentIndex];
  const bailout = bailoutEvidence(intelligence, segment, options.routeRiskSegments);
  return {
    id: `${intelligence.sourceId}:segment:${segment.segmentIndex}`,
    index: segment.segmentIndex,
    label: `Segment ${segment.segmentIndex + 1}`,
    distanceStartMiles: Math.max(0, segment.distanceStart),
    distanceEndMiles: Math.max(segment.distanceStart, segment.distanceEnd),
    averageElevationFeet: intelligence.hasElevation ? segment.avgElevation : null,
    maximumElevationFeet: intelligence.hasElevation ? segment.maxElevation : null,
    elevationGainFeet: intelligence.hasElevation ? segment.elevationGain : null,
    maximumGradePercent: intelligence.hasElevation ? segment.maxGradePercent : null,
    elevationDataAvailable: intelligence.hasElevation,
    terrainClass: segment.difficulty,
    remotenessScore: bailout.remotenessScore,
    nearestBailoutDistanceMiles: bailout.nearestDistanceMiles,
    bailoutDataAvailable: bailout.available,
    advisories: evidence?.advisories ?? null,
    advisoryCoverage: evidence?.advisoryCoverage ?? 'unknown',
    knownConstraints: evidence?.knownConstraints ?? null,
    sourceTruth: evidence?.sourceTruth ?? routeSource,
    bailoutSourceTruth: bailout.sourceTruth,
  };
}

export function buildVehicleRouteConstraintEnvelopeInputFromRouteAnalysis(
  intelligence: RouteIntelligence,
  context: ActiveVehicleContext,
  options: VehicleRouteConstraintEnvelopeAdapterOptions = {},
): VehicleRouteConstraintEnvelopeInput {
  const routeSource = routeAnalysisSource(intelligence);
  const routeRiskSegments = options.routeRiskSegments?.filter(
    (segment) => segment.run_id === intelligence.sourceId,
  ) ?? null;
  const routeMatchedOptions: VehicleRouteConstraintEnvelopeAdapterOptions = {
    ...options,
    routeRiskSegments,
  };
  const opportunity: CompatibilityExpedition = {
    id: intelligence.sourceId,
    name: intelligence.routeName,
    distanceMiles: intelligence.totalDistanceMiles,
    terrainType: intelligence.overallDifficulty,
    remotenessScore: 0,
    estimatedFuelRequired: 0,
    elevationGainFt: intelligence.elevationGainFeet,
    terrainDifficulty: terrainDifficulty(intelligence.overallDifficulty),
  };
  const rigCompatibilityInput = buildRigCompatibilityV2InputFromActiveVehicleContext(
    context,
    opportunity,
    {
      now: options.now,
      routeIntelligence: intelligence,
      routeOverrides: {
        id: intelligence.sourceId,
        distanceMiles: intelligence.totalDistanceMiles,
        terrainType: intelligence.overallDifficulty,
        terrainDifficulty: terrainDifficulty(intelligence.overallDifficulty),
        maxGradePercent: intelligence.hasElevation
          ? Math.max(0, ...intelligence.segments.map((segment) => segment.maxGradePercent))
          : null,
        remotenessScore: null,
        tractionRequirement: 'unknown',
        recommendedTireDiameterInches: null,
        recommendedSuspensionLiftInches: null,
        geometryRequirements: null,
        trailerAccess: 'unknown',
        maximumTrailerWeightLbs: null,
        maximumTrailerLengthFeet: null,
        recoveryRequirement: null,
      },
      trailer: options.trailer,
      resources: options.resources,
      recovery: options.recovery,
      sourceTruth: {
        route: { ref: routeSource, policyKey: 'offline_map_route_package' },
        terrain_grade_exposure: { ref: routeSource, policyKey: 'offline_map_route_package' },
        ...(options.sourceTruth ?? {}),
      },
    },
  );
  const load = context.vehicleState.centerOfGravity;
  return {
    routeId: intelligence.sourceId,
    routeLabel: intelligence.routeName,
    rigCompatibilityInput,
    segments: intelligence.segments.map((segment) => buildSegment(
      intelligence,
      segment,
      routeSource,
      routeMatchedOptions,
    )),
    loadDistribution: {
      available: context.hasVehicleContext && load.totalKnownWeightLbs != null,
      topHeavyRisk: load.topHeavyRisk,
      frontAxleRisk: load.frontAxleRisk,
      rearAxleRisk: load.rearAxleRisk,
      dataQuality: load.dataQuality,
      sourceTruth: loadDistributionSource(context),
      warnings: load.warnings,
    },
  };
}

export function buildVehicleRouteConstraintEnvelopeFromRouteAnalysis(
  intelligence: RouteIntelligence | null | undefined,
  context: ActiveVehicleContext,
  options: VehicleRouteConstraintEnvelopeAdapterOptions = {},
): VehicleRouteConstraintEnvelopeResult | null {
  if (!intelligence || intelligence.segments.length === 0) return null;
  return evaluateVehicleRouteConstraintEnvelope(
    buildVehicleRouteConstraintEnvelopeInputFromRouteAnalysis(intelligence, context, options),
  );
}

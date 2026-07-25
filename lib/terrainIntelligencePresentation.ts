import type { ActiveVehicleContext } from './vehicle/activeVehicleTypes';
import type {
  SourceTruthConfidence,
  SourceTruthFreshness,
  SourceTruthOrigin,
  SourceTruthRef,
} from './sourceTruth';
import {
  downsampleTerrainProfilePreservingExtrema,
  type TerrainHazard,
  type TerrainProfilePoint,
  type TerrainRiskRoute,
} from './terrainRiskCommandProfile';
import type { TerrainElevationSegment } from './terrainElevationRouteEngine';
import type {
  TerrainRiskDashboardPresentation,
  TerrainRiskMissingDataReason,
  TerrainRiskProfileSource,
} from './terrainRiskDashboardPresentation';

export type TerrainIntelligenceState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'partial'
  | 'stale'
  | 'unavailable'
  | 'error';

export type TerrainIntelligencePosture =
  | 'low'
  | 'moderate'
  | 'high'
  | 'critical'
  | 'unknown';

export type TerrainIntelligenceSourceState =
  | 'live'
  | 'recent'
  | 'cached'
  | 'stale'
  | 'partial'
  | 'unavailable';

export type TerrainSignalKind =
  | 'access'
  | 'current_condition'
  | 'weather'
  | 'terrain'
  | 'vehicle_fit';

export type TerrainIntelligenceField<T> = {
  value: T | null;
  unit: string | null;
  origin: SourceTruthOrigin;
  freshness: SourceTruthFreshness;
  confidence: SourceTruthConfidence;
  supported: boolean;
  missingReason: string | null;
};

export type TerrainIntelligenceRiskSegment = {
  id: string;
  startDistanceMiles: number;
  endDistanceMiles: number;
  riskScore: number;
  riskLevel: 'low' | 'moderate' | 'high';
  gradePercent: number;
  reasonCodes: string[];
  confidence: SourceTruthConfidence;
  signalKind: 'terrain';
};

export type TerrainIntelligenceVehicleFit = {
  vehicleId: string | null;
  status: 'ready' | 'partial' | 'unavailable';
  payloadRemainingLbs: number | null;
  clearanceInches: number | null;
  tireSizeInches: number | null;
  suspensionLiftInches: number | null;
  sourceLabel: string;
  confidence: SourceTruthConfidence;
  routeFitDetermined: false;
  missingReasons: string[];
};

export type TerrainIntelligenceRecommendation = {
  status: 'monitor' | 'caution' | 'unavailable';
  text: string;
  reasonCodes: string[];
  deterministic: true;
};

export type TerrainIntelligenceSnapshot = {
  state: TerrainIntelligenceState;
  posture: TerrainIntelligencePosture;
  overallRiskScore: number | null;
  routeId: string | null;
  routeName: string | null;
  routeGeometryFingerprint: string | null;
  fullProfile: TerrainProfilePoint[];
  compactProfile: TerrainProfilePoint[];
  expandedProfile: TerrainProfilePoint[];
  currentProgressDistanceMiles: number | null;
  completedDistanceMiles: number | null;
  remainingDistanceMiles: number | null;
  currentElevation: TerrainIntelligenceField<number>;
  gradeAhead: TerrainIntelligenceField<number>;
  predictiveSideSlope: TerrainIntelligenceField<number>;
  surfaceInformation: TerrainIntelligenceField<string>;
  roughness: TerrainIntelligenceField<number>;
  waterCrossingRisk: TerrainIntelligenceField<string>;
  clearanceConcern: TerrainIntelligenceField<string>;
  riskSegments: TerrainIntelligenceRiskSegment[];
  nextTerrainEvent: TerrainHazard | null;
  vehicleFit: TerrainIntelligenceVehicleFit;
  recommendation: TerrainIntelligenceRecommendation;
  source: TerrainRiskProfileSource;
  sourceTruth: SourceTruthRef[];
  signalAvailability: Record<TerrainSignalKind, 'available' | 'partial' | 'unavailable'>;
  missingDataReasons: string[];
};

export type CompactTerrainIntelligenceSnapshot = Pick<
  TerrainIntelligenceSnapshot,
  | 'state'
  | 'posture'
  | 'overallRiskScore'
  | 'routeId'
  | 'routeName'
  | 'routeGeometryFingerprint'
  | 'compactProfile'
  | 'currentProgressDistanceMiles'
  | 'completedDistanceMiles'
  | 'remainingDistanceMiles'
  | 'currentElevation'
  | 'gradeAhead'
  | 'riskSegments'
  | 'nextTerrainEvent'
  | 'source'
  | 'missingDataReasons'
> & {
  sourceState: TerrainIntelligenceSourceState;
};

export type BuildTerrainIntelligenceInput = {
  presentation: TerrainRiskDashboardPresentation;
  route: TerrainRiskRoute | null;
  activeVehicleContext?: ActiveVehicleContext | null;
  profileDensity?: 'compact' | 'expanded' | 'all';
};

const COMPACT_PROFILE_POINTS = 42;
const EXPANDED_PROFILE_POINTS = 160;
const RADIANS_TO_DEGREES = 180 / Math.PI;

type StableRouteAnalysis = {
  route: TerrainRiskRoute;
  fullProfile: TerrainProfilePoint[];
  compactProfile: TerrainProfilePoint[];
  expandedProfile: TerrainProfilePoint[] | null;
  riskSegments: TerrainIntelligenceRiskSegment[];
};

let cachedRouteKey: string | null = null;
let cachedRouteAnalysis: StableRouteAnalysis | null = null;
let routeAnalysisGenerationCount = 0;

function finiteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function confidenceFromVehicle(context: ActiveVehicleContext | null | undefined): SourceTruthConfidence {
  const score = context?.vehicleState.confidence.score ?? 0;
  if (score >= 88) return 'high';
  if (score >= 70) return 'medium';
  if (score > 0) return 'low';
  return 'unknown';
}

function mapSegment(
  segment: TerrainElevationSegment,
  confidence: SourceTruthConfidence,
): TerrainIntelligenceRiskSegment {
  return {
    id: segment.id,
    startDistanceMiles: segment.startDistanceMiles,
    endDistanceMiles: segment.endDistanceMiles,
    riskScore: segment.riskScore,
    riskLevel: segment.riskLevel,
    gradePercent: segment.gradePercent,
    reasonCodes: [...segment.hazardKinds],
    confidence,
    signalKind: 'terrain',
  };
}

function routeAnalysisKey(route: TerrainRiskRoute): string {
  const first = route.profile[0];
  const last = route.profile[route.profile.length - 1];
  return [
    route.id,
    route.profile.length,
    route.terrainSegments.length,
    route.totalDistanceMiles,
    first?.distanceMiles,
    first?.elevationFeet,
    last?.distanceMiles,
    last?.elevationFeet,
    route.sourceLabel,
  ].join(':');
}

function getStableRouteAnalysis(
  route: TerrainRiskRoute,
  confidence: SourceTruthConfidence,
  geometryFingerprint: string | null,
  includeExpanded: boolean,
): StableRouteAnalysis {
  const key = `${geometryFingerprint ?? routeAnalysisKey(route)}:${routeAnalysisKey(route)}:${confidence}`;
  if (cachedRouteKey === key && cachedRouteAnalysis) {
    if (includeExpanded && cachedRouteAnalysis.expandedProfile == null) {
      cachedRouteAnalysis.expandedProfile =
        downsampleTerrainProfilePreservingExtrema(route.profile, EXPANDED_PROFILE_POINTS);
    }
    return cachedRouteAnalysis;
  }

  routeAnalysisGenerationCount += 1;
  cachedRouteKey = key;
  cachedRouteAnalysis = {
    route,
    fullProfile: route.profile,
    compactProfile: downsampleTerrainProfilePreservingExtrema(route.profile, COMPACT_PROFILE_POINTS),
    expandedProfile: includeExpanded
      ? downsampleTerrainProfilePreservingExtrema(route.profile, EXPANDED_PROFILE_POINTS)
      : null,
    riskSegments: route.terrainSegments.map((segment) => mapSegment(segment, confidence)),
  };
  return cachedRouteAnalysis;
}

export function getTerrainIntelligenceAnalysisGenerationCountForTests(): number {
  return routeAnalysisGenerationCount;
}

export function resetTerrainIntelligenceMemoizationForTests(): void {
  cachedRouteKey = null;
  cachedRouteAnalysis = null;
  routeAnalysisGenerationCount = 0;
}

/** Canonical predictive route grade is percent. Degrees are presentation-only. */
export function gradePercentToDegrees(gradePercent: number): number {
  if (!Number.isFinite(gradePercent)) return 0;
  return Math.atan(gradePercent / 100) * RADIANS_TO_DEGREES;
}

function unsupportedField<T>(reason: string): TerrainIntelligenceField<T> {
  return {
    value: null,
    unit: null,
    origin: 'unavailable',
    freshness: 'unavailable',
    confidence: 'unknown',
    supported: false,
    missingReason: reason,
  };
}

function sourceField<T>(
  value: T | null,
  unit: string | null,
  source: TerrainRiskProfileSource,
  missingReason: string,
): TerrainIntelligenceField<T> {
  return {
    value,
    unit,
    origin: value == null ? 'unavailable' : source.origin,
    freshness: value == null ? 'unavailable' : source.freshness,
    confidence: value == null ? 'unknown' : source.confidence,
    supported: value != null,
    missingReason: value == null ? missingReason : null,
  };
}

function resolveState(presentation: TerrainRiskDashboardPresentation): TerrainIntelligenceState {
  if (presentation.status === 'idle') return 'idle';
  if (presentation.status === 'loading') return 'loading';
  if (presentation.status === 'error') return 'error';
  if (presentation.status === 'stale') return 'stale';
  if (presentation.status === 'degraded') return 'partial';
  if (presentation.status === 'ready') return 'ready';
  return 'unavailable';
}

function resolvePosture(route: TerrainRiskRoute | null): TerrainIntelligencePosture {
  if (!route) return 'unknown';
  if (route.overallRiskScore >= 85) return 'critical';
  return route.overallRiskLabel;
}

function resolveSourceState(snapshot: TerrainIntelligenceSnapshot): TerrainIntelligenceSourceState {
  if (snapshot.state === 'partial') return 'partial';
  if (snapshot.state === 'stale' || snapshot.source.freshness === 'stale' || snapshot.source.freshness === 'expired') {
    return 'stale';
  }
  if (snapshot.state !== 'ready' || snapshot.source.origin === 'unavailable') return 'unavailable';
  if (snapshot.source.origin === 'cached') return 'cached';
  if (snapshot.source.origin === 'live' && snapshot.source.freshness === 'live') return 'live';
  if (snapshot.source.freshness === 'recent') return 'recent';
  return 'unavailable';
}

export function selectCompactTerrainIntelligence(
  snapshot: TerrainIntelligenceSnapshot,
): CompactTerrainIntelligenceSnapshot {
  return {
    state: snapshot.state,
    posture: snapshot.posture,
    overallRiskScore: snapshot.overallRiskScore,
    routeId: snapshot.routeId,
    routeName: snapshot.routeName,
    routeGeometryFingerprint: snapshot.routeGeometryFingerprint,
    compactProfile: snapshot.compactProfile,
    currentProgressDistanceMiles: snapshot.currentProgressDistanceMiles,
    completedDistanceMiles: snapshot.completedDistanceMiles,
    remainingDistanceMiles: snapshot.remainingDistanceMiles,
    currentElevation: snapshot.currentElevation,
    gradeAhead: snapshot.gradeAhead,
    riskSegments: snapshot.riskSegments,
    nextTerrainEvent: snapshot.nextTerrainEvent,
    source: snapshot.source,
    missingDataReasons: snapshot.missingDataReasons,
    sourceState: resolveSourceState(snapshot),
  };
}

function buildVehicleFit(
  context: ActiveVehicleContext | null | undefined,
): TerrainIntelligenceVehicleFit {
  if (!context?.hasVehicleContext) {
    return {
      vehicleId: null,
      status: 'unavailable',
      payloadRemainingLbs: null,
      clearanceInches: null,
      tireSizeInches: null,
      suspensionLiftInches: null,
      sourceLabel: 'Active vehicle unavailable',
      confidence: 'unknown',
      routeFitDetermined: false,
      missingReasons: ['active_vehicle_unavailable', 'route_requirements_unavailable'],
    };
  }

  const clearanceInches =
    context.spec?.ground_clearance_inches ??
    context.vehicle?.ground_clearance_inches ??
    null;
  const missingReasons = ['route_requirements_unavailable'];
  if (!finiteNumber(clearanceInches)) missingReasons.push('vehicle_clearance_unavailable');
  if (context.weightSnapshot.isPartial) missingReasons.push(...context.weightSnapshot.partialDataReasons);

  return {
    vehicleId: context.activeVehicleId,
    status: missingReasons.length > 1 ? 'partial' : 'ready',
    payloadRemainingLbs: context.weightSnapshot.remainingPayloadLbs,
    clearanceInches: finiteNumber(clearanceInches) ? clearanceInches : null,
    tireSizeInches: context.capabilitySnapshot.tireSizeInches,
    suspensionLiftInches: context.capabilitySnapshot.suspensionLiftInches,
    sourceLabel: context.weightSnapshot.isEstimate
      ? 'Active vehicle and estimated loadout'
      : 'Active vehicle and loadout',
    confidence: confidenceFromVehicle(context),
    routeFitDetermined: false,
    missingReasons: Array.from(new Set(missingReasons)),
  };
}

function buildRecommendation(
  state: TerrainIntelligenceState,
  nextEvent: TerrainHazard | null,
  gradeAhead: number | null,
): TerrainIntelligenceRecommendation {
  if (state !== 'ready' && state !== 'partial' && state !== 'stale') {
    return {
      status: 'unavailable',
      text: 'Terrain recommendation unavailable until route elevation analysis is usable.',
      reasonCodes: ['terrain_analysis_unavailable'],
      deterministic: true,
    };
  }
  if (nextEvent?.riskLevel === 'high' || (gradeAhead ?? 0) >= 12) {
    return {
      status: 'caution',
      text: 'Reduce speed before the next elevation-derived high-risk segment and verify conditions in the field.',
      reasonCodes: [
        ...(nextEvent?.riskLevel === 'high' ? ['high_risk_segment_ahead'] : []),
        ...((gradeAhead ?? 0) >= 12 ? ['steep_grade_ahead'] : []),
      ],
      deterministic: true,
    };
  }
  return {
    status: 'monitor',
    text: 'Continue monitoring route grade and verify surface and obstacles in the field.',
    reasonCodes: ['no_material_elevation_risk_detected'],
    deterministic: true,
  };
}

function sourceTruthRef(source: TerrainRiskProfileSource): SourceTruthRef {
  return {
    id: 'terrain_intelligence_route_profile',
    origin: source.origin,
    role: 'primary',
    policyKey: source.origin === 'manual' ? 'manual_user_state' : 'offline_map_route_package',
    provider: source.provider,
    observedAt: source.observedAt,
    confidence: source.confidence,
    coverage: source.coverage,
    availability: source.origin === 'unavailable' ? 'unavailable' : source.coverage === 'partial' ? 'degraded' : 'usable',
    warningCodes: [],
  };
}

function missingReasons(
  reason: TerrainRiskMissingDataReason | null,
  vehicleFit: TerrainIntelligenceVehicleFit,
): string[] {
  return Array.from(new Set([
    ...(reason ? [reason] : []),
    'predictive_side_slope_source_unavailable',
    'surface_source_unavailable',
    'roughness_source_unavailable',
    'water_crossing_source_unavailable',
    'route_clearance_requirements_unavailable',
    ...vehicleFit.missingReasons,
  ]));
}

export function buildTerrainIntelligenceSnapshot({
  presentation,
  route,
  activeVehicleContext,
  profileDensity = 'all',
}: BuildTerrainIntelligenceInput): TerrainIntelligenceSnapshot {
  const truthfulRoute = route?.dataState === 'live-route' && route.profile.length >= 2 ? route : null;
  const analysis = truthfulRoute
    ? getStableRouteAnalysis(
        truthfulRoute,
        presentation.source.confidence,
        presentation.routeIdentity?.fingerprint ?? null,
        profileDensity !== 'compact',
      )
    : null;
  const progress = presentation.currentProgressDistanceMiles;
  const totalDistance = truthfulRoute?.totalDistanceMiles ?? null;
  const remainingDistanceMiles =
    finiteNumber(totalDistance) && finiteNumber(progress)
      ? Math.max(0, totalDistance - progress)
      : null;
  const nextSegment = analysis?.riskSegments.find(
    (segment) => segment.endDistanceMiles > (progress ?? 0),
  ) ?? null;
  const gradeAhead = nextSegment?.gradePercent ?? null;
  const vehicleFit = buildVehicleFit(activeVehicleContext);
  const presentationState = resolveState(presentation);
  const state =
    truthfulRoute?.elevationCoverage === 'partial' &&
    (presentationState === 'ready' || presentationState === 'partial')
      ? 'partial'
      : presentationState;

  return {
    state,
    posture: resolvePosture(truthfulRoute),
    overallRiskScore: truthfulRoute?.overallRiskScore ?? null,
    routeId: presentation.routeIdentity?.id ?? null,
    routeName: presentation.routeIdentity?.name ?? null,
    routeGeometryFingerprint: presentation.routeIdentity?.fingerprint ?? null,
    fullProfile: profileDensity === 'all' ? analysis?.fullProfile ?? [] : [],
    compactProfile: analysis?.compactProfile ?? [],
    expandedProfile: profileDensity === 'compact' ? [] : analysis?.expandedProfile ?? [],
    currentProgressDistanceMiles: progress,
    completedDistanceMiles: progress,
    remainingDistanceMiles,
    currentElevation: sourceField(
      presentation.currentElevationFeet,
      'ft',
      presentation.source,
      'current_elevation_unavailable',
    ),
    gradeAhead: sourceField(gradeAhead, '%', presentation.source, 'grade_ahead_unavailable'),
    predictiveSideSlope: unsupportedField('verified_cross_slope_model_unavailable'),
    surfaceInformation: unsupportedField('segment_surface_source_unavailable'),
    roughness: unsupportedField('route_roughness_source_unavailable'),
    waterCrossingRisk: unsupportedField('verified_water_crossing_source_unavailable'),
    clearanceConcern: unsupportedField('route_obstacle_clearance_source_unavailable'),
    riskSegments: analysis?.riskSegments ?? [],
    nextTerrainEvent: presentation.nextMaterialTerrainRiskEvent,
    vehicleFit,
    recommendation: buildRecommendation(state, presentation.nextMaterialTerrainRiskEvent, gradeAhead),
    source: presentation.source,
    sourceTruth: [sourceTruthRef(presentation.source)],
    signalAvailability: {
      access: 'unavailable',
      current_condition: 'unavailable',
      weather: 'unavailable',
      terrain: analysis
        ? (truthfulRoute?.elevationCoverage === 'partial' || presentation.source.coverage === 'partial'
            ? 'partial'
            : 'available')
        : 'unavailable',
      vehicle_fit: vehicleFit.status === 'ready' ? 'available' : vehicleFit.status,
    },
    missingDataReasons: missingReasons(presentation.missingDataReason, vehicleFit),
  };
}

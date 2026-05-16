import type { ECSAIContext } from '../aiContextBuilder';
import { buildVehicleProfile, type CompatibilityExpedition } from '../rigCompatibilityEngine';
import { evaluateECSConfidence } from './confidenceEngine';
import { buildFusedWeatherRouteAdvisory } from './fusedWeatherRouteAdvisoryEngine';
import { computeOfflineReadiness } from './offlineReadinessEngine';
import type { ECSOperatorTrustMode } from './operatorTrustTypes';
import { operatorTrustModeStore } from './operatorTrustMode';
import { assessMissionScenarioPriority } from './priorityEngine';
import { explainRecommendation } from './recommendationExplanationEngine';
import { computeRouteViability } from './routeViabilityEngine';
import { evaluateVehicleFit } from './vehicleFitEngine';
import type { ECSFusedWeatherRouteAdvisoryResult } from './fusedWeatherRouteTypes';
import type { ECSOfflineReadinessResult } from './offlineReadinessTypes';
import type { ECSRouteViabilityResult } from './routeViabilityTypes';
import type { ECSVehicleFitResult } from './vehicleFitTypes';
import type {
  ECSMissionScenarioDimensions,
  ECSMissionScenarioLevel,
  ECSMissionScenarioResult,
} from './missionScenarioTypes';

type ComputeMissionScenarioArgs = {
  richContext: ECSAIContext;
  operatorTrustMode?: ECSOperatorTrustMode;
  offlineReadiness?: ECSOfflineReadinessResult | null;
  routeViability?: ECSRouteViabilityResult | null;
  vehicleFit?: ECSVehicleFitResult | null;
  fusedWeatherRoute?: ECSFusedWeatherRouteAdvisoryResult | null;
};

type PlanningDimension = {
  score: number;
  label: string;
  strength?: string | null;
  limitation?: string | null;
  action?: string | null;
};

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function pushUnique(target: string[], value: string | null | undefined): void {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized || target.includes(normalized)) return;
  target.push(normalized);
}

function dedupe(values: (string | null | undefined)[]): string[] {
  const results: string[] = [];
  values.forEach((value) => pushUnique(results, value));
  return results;
}

function actionLimit(mode: ECSOperatorTrustMode): number {
  switch (mode) {
    case 'conservative_guidance':
      return 4;
    case 'minimal_advisory':
      return 2;
    case 'balanced_command':
    default:
      return 3;
  }
}

function dimensionLabel(score: number): string {
  if (score >= 82) return 'Strong';
  if (score >= 66) return 'Ready';
  if (score >= 48) return 'Watch';
  if (score >= 30) return 'Needs work';
  return 'Limited';
}

function routeViabilityScore(level: ECSRouteViabilityResult['level'] | null | undefined): number {
  switch (level) {
    case 'viable':
      return 84;
    case 'watch_closely':
      return 68;
    case 'limited_margin':
      return 50;
    case 'exit_recommended':
      return 28;
    case 'unknown':
    default:
      return 42;
  }
}

function weatherSupportScore(
  staleness: string | null | undefined,
  fusedWeatherRoute: ECSFusedWeatherRouteAdvisoryResult | null,
): number {
  let score = 74;

  switch (String(staleness ?? '').toLowerCase()) {
    case 'fresh':
      score += 14;
      break;
    case 'aging':
      score += 4;
      break;
    case 'stale':
    case 'very_stale':
      score -= 26;
      break;
    default:
      score -= 10;
      break;
  }

  if (fusedWeatherRoute?.relevance === 'route_critical') {
    score -= fusedWeatherRoute.softenedByFreshness ? 14 : 22;
  } else if (fusedWeatherRoute?.relevance === 'route_relevant') {
    score -= fusedWeatherRoute.softenedByFreshness ? 8 : 14;
  }

  return clampScore(score);
}

function mapDifficultyToNumeric(value: string | null | undefined): number {
  switch (String(value ?? '').toLowerCase()) {
    case 'difficult':
      return 9;
    case 'challenging':
      return 7;
    case 'moderate':
      return 5;
    case 'easy':
      return 3;
    default:
      return 5;
  }
}

function deriveRecommendedTireSize(difficulty: number): number | undefined {
  if (difficulty >= 8) return 35;
  if (difficulty >= 6) return 33;
  if (difficulty >= 4) return 31;
  return undefined;
}

function deriveRecommendedLift(difficulty: number): number | undefined {
  if (difficulty >= 8) return 4;
  if (difficulty >= 6) return 2;
  return undefined;
}

function buildPlanningRouteOpportunity(
  richContext: ECSAIContext,
): CompatibilityExpedition | null {
  const routeIntelligence = richContext.route.routeIntelligence as Record<string, unknown> | null | undefined;
  const routeContext = richContext.route.routeContext as Record<string, unknown> | null | undefined;
  const activeRoute = richContext.route.activeRoute as Record<string, unknown> | null | undefined;
  const activeRun = richContext.route.activeRun as Record<string, unknown> | null | undefined;
  const remotenessScore =
    safeNumber(richContext.summary.remotenessScore)
    ?? safeNumber((richContext.environment.remoteness as any)?.score)
    ?? 5;
  const distanceMiles =
    safeNumber(routeIntelligence?.totalDistanceMiles)
    ?? safeNumber(activeRoute?.distanceMiles)
    ?? safeNumber(activeRun?.distanceMiles)
    ?? safeNumber(activeRun?.distance)
    ?? null;

  if (distanceMiles == null || distanceMiles <= 0) {
    return null;
  }

  const difficulty = mapDifficultyToNumeric(String(routeIntelligence?.overallDifficulty ?? routeContext?.terrainType ?? 'moderate'));
  const terrainType = String(routeContext?.terrainType ?? activeRoute?.terrainType ?? routeIntelligence?.overallDifficulty ?? 'mixed');
  const estimatedFuelRequired =
    safeNumber(routeContext?.estimatedFuelRequired)
    ?? Math.max(8, Math.round((distanceMiles / 15) * 10) / 10);

  return {
    id: String(activeRoute?.id ?? activeRun?.id ?? routeIntelligence?.id ?? 'mission-scenario-route'),
    name: String(routeIntelligence?.routeName ?? activeRoute?.name ?? activeRun?.title ?? 'Planned route'),
    distanceMiles,
    terrainType,
    remotenessScore,
    estimatedFuelRequired,
    elevationGainFt:
      safeNumber(routeIntelligence?.elevationGainFeet)
      ?? safeNumber(routeIntelligence?.elevationGainFt)
      ?? 0,
    terrainDifficulty: difficulty,
    recommendedTireSize: deriveRecommendedTireSize(difficulty),
    recommendedLift: deriveRecommendedLift(difficulty),
  };
}

function resolveVehicleReadinessDimension(args: {
  richContext: ECSAIContext;
  criticalMissing: number;
  vehicleProfile: ReturnType<typeof buildVehicleProfile> | null;
}): PlanningDimension {
  const { richContext, criticalMissing, vehicleProfile } = args;
  let score = vehicleProfile ? 42 : 18;

  if (vehicleProfile) {
    if (vehicleProfile.gvwr_lb > 0 && vehicleProfile.base_weight_lb > 0) score += 10;
    if (vehicleProfile.fuel_tank_capacity_gal > 0 && vehicleProfile.avg_mpg > 0) score += 14;
    if (vehicleProfile.water_capacity_gal > 0) score += 10;
    if (vehicleProfile.tireSizeInches > 0) score += 8;
    if (vehicleProfile.suspensionLiftInches > 0 || vehicleProfile.isLeveled || (vehicleProfile.frontLevelInches ?? 0) > 0) score += 4;
    if (vehicleProfile.payload_capacity_lb > 0) score += 6;
    if (vehicleProfile.vehicleName) score += 4;
  }

  const packed = richContext.mission.itemCounts?.packed ?? 0;
  const total = richContext.mission.itemCounts?.total ?? 0;
  if (total > 0 && packed >= total) {
    score += 8;
  } else if (total > 0 && packed / total >= 0.7) {
    score += 4;
  }

  if (criticalMissing > 0) {
    score -= Math.min(24, criticalMissing * 8);
  }

  const finalScore = clampScore(score);
  const missingSpecs = dedupe([
    !vehicleProfile ? 'vehicle profile is incomplete' : null,
    vehicleProfile && !(vehicleProfile.fuel_tank_capacity_gal > 0 && vehicleProfile.avg_mpg > 0)
      ? 'fuel profile is incomplete'
      : null,
    vehicleProfile && !(vehicleProfile.water_capacity_gal > 0)
      ? 'water capacity is still estimated'
      : null,
    vehicleProfile && !(vehicleProfile.tireSizeInches > 0)
      ? 'tire size is still estimated'
      : null,
    criticalMissing > 0 ? `${criticalMissing} critical loadout item${criticalMissing === 1 ? '' : 's'} missing` : null,
  ]);

  return {
    score: finalScore,
    label: dimensionLabel(finalScore),
    strength:
      finalScore >= 78
        ? 'Vehicle profile and baseline readiness are in strong shape.'
        : finalScore >= 62
          ? 'Vehicle baseline is mostly configured for expedition planning.'
          : null,
    limitation:
      missingSpecs[0]
      ?? (finalScore < 45 ? 'Vehicle readiness is still incomplete.' : null),
    action:
      missingSpecs[0]
        ? missingSpecs[0].includes('loadout')
          ? 'Resolve critical loadout gaps before departure.'
          : missingSpecs[0].includes('fuel profile')
            ? 'Complete fuel range baseline before departure.'
            : missingSpecs[0].includes('water')
              ? 'Confirm water capacity before departure.'
              : missingSpecs[0].includes('tire')
                ? 'Finish tire-size setup to improve route-fit confidence.'
                : 'Complete the vehicle baseline before departure.'
        : null,
  };
}

function resolveRouteSuitabilityDimension(args: {
  opportunity: CompatibilityExpedition | null;
  vehicleFit: ECSVehicleFitResult | null;
  routeViability: ECSRouteViabilityResult | null;
  fusedWeatherRoute: ECSFusedWeatherRouteAdvisoryResult | null;
  phase: string | null | undefined;
}): PlanningDimension {
  const { opportunity, vehicleFit, routeViability, fusedWeatherRoute, phase } = args;
  if (!opportunity) {
    const score = clampScore(phase === 'staging' ? 34 : phase === 'vehicle_setup' ? 42 : 48);
    return {
      score,
      label: dimensionLabel(score),
      limitation: 'Route intent is not fully locked in yet.',
      action: 'Confirm a planned route to sharpen expedition planning.',
    };
  }

  let score = Math.round(
    ((vehicleFit?.score ?? 56) * 0.62) +
    (routeViabilityScore(routeViability?.level) * 0.38),
  );

  if (fusedWeatherRoute?.relevance === 'route_critical') {
    score -= 20;
  } else if (fusedWeatherRoute?.relevance === 'route_relevant') {
    score -= 10;
  }

  const finalScore = clampScore(score);
  const limitation =
    vehicleFit?.limitingFactors?.[0]
    ?? (routeViability?.level === 'exit_recommended'
      ? 'Current route posture is not favorable for this expedition plan.'
      : fusedWeatherRoute?.drivers?.[0]
        ? `${fusedWeatherRoute.drivers[0]} is affecting route suitability.`
        : null);

  return {
    score: finalScore,
    label: dimensionLabel(finalScore),
    strength:
      finalScore >= 80
        ? 'Route suitability is supported by current fit and route margin.'
        : finalScore >= 64
          ? 'The planned route remains broadly workable for the current setup.'
          : null,
    limitation,
    action:
      routeViability?.level === 'exit_recommended'
        ? 'Reconsider route commitment or identify a safer alternative before departure.'
        : vehicleFit?.level === 'poor_fit'
          ? 'Adjust vehicle setup or choose a less demanding route.'
          : vehicleFit?.level === 'limited_fit'
            ? 'Review route-fit limits before locking the plan.'
            : fusedWeatherRoute?.relevance === 'route_critical'
              ? 'Recheck route timing against the current weather window.'
              : !vehicleFit
                ? 'Add route context to improve route-suitability confidence.'
                : null,
  };
}

function resolveResourceDimension(args: {
  richContext: ECSAIContext;
  routeViability: ECSRouteViabilityResult | null;
}): PlanningDimension {
  const forecastLevel = String(args.richContext.resources.forecast?.sufficiencyLevel ?? '').toLowerCase();
  let score = args.routeViability ? routeViabilityScore(args.routeViability.level) : 54;

  if (forecastLevel === 'resources insufficient') {
    score = Math.min(score, 26);
  } else if (forecastLevel === 'resources limited') {
    score = Math.min(score, 48);
  } else if (forecastLevel === 'watch consumption') {
    score = Math.min(score, 62);
  }

  const finalScore = clampScore(score);
  return {
    score: finalScore,
    label: dimensionLabel(finalScore),
    strength:
      finalScore >= 76
        ? 'Fuel, water, and power posture support the current mission plan.'
        : null,
    limitation:
      args.routeViability?.drivers?.[0]
      ?? (forecastLevel === 'resources limited' || forecastLevel === 'resources insufficient'
        ? 'Resource posture remains the main planning constraint.'
        : null),
    action:
      args.routeViability?.level === 'exit_recommended'
        ? 'Tighten the route plan around current fuel and reserve margin.'
        : forecastLevel === 'resources insufficient'
          ? 'Rework sustainment assumptions before departure.'
          : forecastLevel === 'resources limited'
            ? 'Confirm resupply and conservation margin before departure.'
            : null,
  };
}

function resolveWeatherDimension(args: {
  richContext: ECSAIContext;
  fusedWeatherRoute: ECSFusedWeatherRouteAdvisoryResult | null;
}): PlanningDimension {
  const score = weatherSupportScore(args.richContext.environment.weather.staleness, args.fusedWeatherRoute);
  const stale =
    args.richContext.environment.weather.staleness === 'stale'
    || args.richContext.environment.weather.staleness === 'very_stale';

  return {
    score,
    label: dimensionLabel(score),
    strength:
      score >= 78
        ? 'Weather support is current enough to trust planning posture.'
        : null,
    limitation:
      stale
        ? 'Weather freshness is limiting planning confidence.'
        : args.fusedWeatherRoute?.relevance === 'route_critical'
          ? 'Weather is materially affecting the current route plan.'
          : args.fusedWeatherRoute?.relevance === 'route_relevant'
            ? 'Weather remains relevant to route timing and exposure.'
            : null,
    action:
      stale
        ? 'Refresh weather support while service is available.'
        : args.fusedWeatherRoute?.relevance === 'route_critical'
          ? 'Reassess departure timing against route-weather exposure.'
          : null,
  };
}

function resolveOfflineDimension(
  offlineReadiness: ECSOfflineReadinessResult,
): PlanningDimension {
  return {
    score: offlineReadiness.score,
    label: dimensionLabel(offlineReadiness.score),
    strength:
      offlineReadiness.level === 'ready' || offlineReadiness.level === 'ready_with_limitations'
        ? offlineReadiness.readySystems[0] ?? 'Offline guidance posture is in good shape.'
        : null,
    limitation:
      offlineReadiness.missingSystems[0]
      ?? offlineReadiness.limitedSystems[0]
      ?? null,
    action: offlineReadiness.operatorActions[0] ?? null,
  };
}

function resolveBailoutDimension(args: {
  richContext: ECSAIContext;
  routeViability: ECSRouteViabilityResult | null;
}): PlanningDimension {
  const remotenessScore =
    safeNumber(args.richContext.summary.remotenessScore)
    ?? safeNumber((args.richContext.environment.remoteness as any)?.score)
    ?? 0;
  let score = args.routeViability ? routeViabilityScore(args.routeViability.level) : 62;

  if (args.routeViability?.bailoutRelevant) {
    score -= 12;
  }
  if (remotenessScore >= 85) {
    score -= 18;
  } else if (remotenessScore >= 70) {
    score -= 10;
  }

  const finalScore = clampScore(score);
  return {
    score: finalScore,
    label: dimensionLabel(finalScore),
    strength:
      finalScore >= 74
        ? 'Recovery and bailout margin remain acceptable for the current plan.'
        : null,
    limitation:
      args.routeViability?.bailoutSummary
      ?? (remotenessScore >= 70 ? 'Remoteness is tightening recovery flexibility.' : null),
    action:
      args.routeViability?.bailoutRelevant
        ? 'Confirm bailout assumptions before deeper commitment.'
        : remotenessScore >= 70
          ? 'Review recovery options while planning still has service support.'
          : null,
  };
}

function levelForScenario(args: {
  score: number;
  confidenceLevel: string | null | undefined;
  routeSelected: boolean;
  phase: string | null | undefined;
  vehicleReadinessScore: number;
  offlineLevel: ECSOfflineReadinessResult['level'];
  routeViabilityLevel: ECSRouteViabilityResult['level'] | null | undefined;
}): ECSMissionScenarioLevel {
  if (
    args.confidenceLevel === 'low'
    || args.confidenceLevel === 'unknown'
  ) {
    return args.routeSelected || args.vehicleReadinessScore >= 45
      ? 'needs_preparation'
      : 'unknown';
  }

  if (
    args.routeViabilityLevel === 'exit_recommended'
    || args.offlineLevel === 'not_ready'
    || args.vehicleReadinessScore < 34
  ) {
    return 'needs_preparation';
  }

  if (args.score >= 82) return 'strong';
  if (args.score >= 66) return 'ready_with_limitations';
  if (args.score >= 48) return 'watch_closely';

  if (!args.routeSelected && (args.phase === 'vehicle_setup' || args.phase === 'staging')) {
    return 'needs_preparation';
  }

  return 'needs_preparation';
}

function scenarioLabel(level: ECSMissionScenarioLevel): string {
  switch (level) {
    case 'strong':
      return 'Planning strong';
    case 'ready_with_limitations':
      return 'Ready with limitations';
    case 'watch_closely':
      return 'Watch planning margin';
    case 'needs_preparation':
      return 'Preparation needed';
    case 'unknown':
    default:
      return 'Planning picture incomplete';
  }
}

function scenarioSummary(
  level: ECSMissionScenarioLevel,
  limitations: string[],
  strengths: string[],
): string {
  const topLimitation = limitations[0];
  const topStrength = strengths[0];

  switch (level) {
    case 'strong':
      return topStrength
        ? `Planning picture is strong because ${topStrength.toLowerCase()}`
        : 'Planning picture is strong with route, sustainment, and offline posture aligned.';
    case 'ready_with_limitations':
      return topLimitation
        ? `Plan is ready with limitations because ${topLimitation.toLowerCase()}`
        : 'Plan is broadly ready, but a few readiness gaps remain.';
    case 'watch_closely':
      return topLimitation
        ? `Plan remains workable, but ${topLimitation.toLowerCase()}`
        : 'Plan remains workable, but margin should be watched before departure.';
    case 'needs_preparation':
      return topLimitation
        ? `Preparation is needed because ${topLimitation.toLowerCase()}`
        : 'Preparation is needed before this expedition plan is fully ready.';
    case 'unknown':
    default:
      return 'Planning picture remains incomplete because route, vehicle, or readiness support is still missing.';
  }
}

export function computeMissionScenario(
  args: ComputeMissionScenarioArgs,
): ECSMissionScenarioResult {
  const operatorTrustMode = args.operatorTrustMode ?? operatorTrustModeStore.mode;
  const phase = args.richContext.phase.current.phase;
  const routeActive = args.richContext.meta.hasActiveRoute || args.richContext.meta.hasActiveRun;
  const routeContext = args.richContext.route.routeContext as any;
  const forecast = args.richContext.resources.forecast as any;
  const telemetryReadout = args.richContext.resources.telemetryReadout as any;
  const authority = args.richContext.resources.powerAuthority as any;
  const remotenessScore =
    safeNumber(args.richContext.summary.remotenessScore)
    ?? safeNumber((args.richContext.environment.remoteness as any)?.score)
    ?? null;

  const vehicleProfile = buildVehicleProfile();
  const opportunity = buildPlanningRouteOpportunity(args.richContext);
  const offlineReadiness = args.offlineReadiness ?? computeOfflineReadiness({ richContext: args.richContext });
  const routeViability =
    args.routeViability ??
    computeRouteViability({
      forecast: forecast ?? null,
      routeContext: routeContext
        ? {
            progressPercent: safeNumber(routeContext.progressPercent),
            bailoutAvailable:
              typeof routeContext.bailoutAvailable === 'boolean'
                ? routeContext.bailoutAvailable
                : null,
            estimatedTimeToBailoutMin: safeNumber(routeContext.estimatedTimeToBailoutMin),
          }
        : null,
      resources: {
        fuelPercent: safeNumber(telemetryReadout?.fuelPercent),
        fuelRangeMiles: safeNumber(telemetryReadout?.fuelRangeMiles),
        waterPercent: safeNumber(telemetryReadout?.waterPercent),
        powerPercent:
          safeNumber(authority?.batteryPercent)
          ?? safeNumber(telemetryReadout?.batteryPercent),
        powerRuntimeHours: safeNumber(authority?.runtimeHours),
        inputWatts: safeNumber(authority?.inputWatts),
        outputWatts: safeNumber(authority?.outputWatts),
      },
      terrainRisk: args.richContext.risk.terrainRisk ?? null,
      remotenessScore,
      remainingDistanceMiles:
        safeNumber(routeContext?.distanceRemainingMiles)
        ?? safeNumber((args.richContext.route.routeIntelligence as any)?.distanceRemainingMiles)
        ?? safeNumber((args.richContext.route.activeRun as any)?.distanceRemainingMiles)
        ?? null,
      status: args.richContext.liveStatus?.resources ?? args.richContext.liveStatus?.telemetry ?? null,
      phase,
      routeActive,
      degradedState: args.richContext.operations.degraded.state,
      offline: args.richContext.environment.connectivity?.isOnline === false,
    });
  const vehicleFit =
    args.vehicleFit ??
    (opportunity
      ? evaluateVehicleFit(opportunity, vehicleProfile, {
          status:
            args.richContext.liveStatus?.telemetry?.status === 'live'
              ? args.richContext.liveStatus.telemetry
              : args.richContext.liveStatus?.readiness ?? null,
          operationalState: args.richContext.operations.degraded.state,
          phase,
          offline: args.richContext.environment.connectivity?.isOnline === false,
          hasLiveTelemetry: args.richContext.liveStatus?.telemetry?.status === 'live',
          weatherFreshness: args.richContext.environment.weather.staleness as any,
        })
      : null);
  const fusedWeatherRoute =
    args.fusedWeatherRoute ??
    (opportunity || routeContext
      ? buildFusedWeatherRouteAdvisory({
          weather: args.richContext.environment.weather,
          terrainRisk: args.richContext.risk.terrainRisk ?? null,
          routeActive,
          phase,
          remotenessScore,
          bailoutAvailable:
            typeof routeContext?.bailoutAvailable === 'boolean'
              ? routeContext.bailoutAvailable
              : null,
          estimatedTimeToBailoutMin: safeNumber(routeContext?.estimatedTimeToBailoutMin),
          degradedState: args.richContext.operations.degraded.state,
          offline: args.richContext.environment.connectivity?.isOnline === false,
        })
      : null);

  const criticalMissing = args.richContext.mission.itemCounts?.criticalMissing ?? 0;
  const vehicleReadiness = resolveVehicleReadinessDimension({
    richContext: args.richContext,
    criticalMissing,
    vehicleProfile,
  });
  const routeSuitability = resolveRouteSuitabilityDimension({
    opportunity,
    vehicleFit,
    routeViability,
    fusedWeatherRoute,
    phase,
  });
  const resourceSufficiency = resolveResourceDimension({
    richContext: args.richContext,
    routeViability,
  });
  const weatherSupport = resolveWeatherDimension({
    richContext: args.richContext,
    fusedWeatherRoute,
  });
  const offlineSupport = resolveOfflineDimension(offlineReadiness);
  const bailoutMargin = resolveBailoutDimension({
    richContext: args.richContext,
    routeViability,
  });

  const score = clampScore(
    (vehicleReadiness.score * 0.2) +
    (routeSuitability.score * 0.22) +
    (resourceSufficiency.score * 0.18) +
    (weatherSupport.score * 0.14) +
    (offlineSupport.score * 0.16) +
    (bailoutMargin.score * 0.1),
  );

  const confidence = evaluateECSConfidence({
    domain: 'mission_scenario',
    offline: args.richContext.environment.connectivity?.isOnline === false,
    degraded:
      args.richContext.operations.degraded.state === 'degraded'
      || args.richContext.operations.degraded.state === 'limited'
      || args.richContext.operations.degraded.state === 'unavailable',
    cloudDependent: true,
    capLevel:
      !opportunity && (phase === 'vehicle_setup' || phase === 'staging')
        ? 'moderate'
        : undefined,
    sources: [
      {
        id: 'vehicle_profile',
        origin: 'manual',
        available: !!vehicleProfile,
        required: true,
        freshness: 'fresh',
        priority: 'critical',
      },
      {
        id: 'route_intent',
        origin: 'inferred',
        available: !!opportunity,
        required: phase === 'staging',
        freshness: 'fresh',
        priority: 'critical',
      },
      {
        id: 'vehicle_fit',
        origin: vehicleFit?.status?.sourceType === 'live' ? 'live' : 'manual',
        available: !!vehicleFit,
        required: !!opportunity,
        freshness:
          vehicleFit?.status?.freshness === 'current'
            ? 'fresh'
            : vehicleFit?.status?.freshness === 'recent'
              ? 'aging'
              : vehicleFit?.status?.freshness === 'stale'
                ? 'stale'
                : 'unknown',
        priority: 'high',
      },
      {
        id: 'route_viability',
        origin: 'inferred',
        available: !!routeViability,
        required: !!opportunity,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'offline_readiness',
        origin: 'manual',
        available: !!offlineReadiness,
        required: true,
        freshness: 'fresh',
        priority: 'critical',
      },
      {
        id: 'weather_support',
        origin: 'live',
        available: args.richContext.environment.weather.source !== 'none',
        required: false,
        freshness:
          args.richContext.environment.weather.staleness === 'fresh'
            ? 'fresh'
            : args.richContext.environment.weather.staleness === 'aging'
              ? 'aging'
              : args.richContext.environment.weather.staleness === 'stale' || args.richContext.environment.weather.staleness === 'very_stale'
                ? 'stale'
                : 'unknown',
        priority: 'normal',
      },
      {
        id: 'resource_forecast',
        origin: 'inferred',
        available: !!forecast || !!routeViability,
        required: false,
        freshness: 'fresh',
        priority: 'high',
      },
    ],
  });

  const routeSelected = !!opportunity;
  const level = levelForScenario({
    score,
    confidenceLevel: confidence.level,
    routeSelected,
    phase,
    vehicleReadinessScore: vehicleReadiness.score,
    offlineLevel: offlineReadiness.level,
    routeViabilityLevel: routeViability?.level,
  });

  const strengths = dedupe([
    vehicleReadiness.strength,
    routeSuitability.strength,
    resourceSufficiency.strength,
    weatherSupport.strength,
    offlineSupport.strength,
    bailoutMargin.strength,
  ]).slice(0, 3);

  const limitations = dedupe([
    vehicleReadiness.limitation,
    routeSuitability.limitation,
    resourceSufficiency.limitation,
    weatherSupport.limitation,
    offlineSupport.limitation,
    bailoutMargin.limitation,
  ]).slice(0, 4);

  const requiredActions = dedupe([
    vehicleReadiness.action,
    routeSuitability.action,
    resourceSufficiency.action,
    weatherSupport.action,
    offlineSupport.action,
    bailoutMargin.action,
  ]).slice(0, actionLimit(operatorTrustMode));

  const summary = scenarioSummary(level, limitations, strengths);
  const explanation = explainRecommendation({
    type: 'mission_scenario',
    drivers: limitations.length > 0 ? limitations.slice(0, 3) : strengths.slice(0, 3),
    confidenceLevel: confidence.level,
    priorityLevel:
      level === 'needs_preparation'
        ? 'caution'
        : level === 'watch_closely'
          ? 'advisory'
          : 'informational',
    degradedState: args.richContext.operations.degraded.state,
    trustMode: operatorTrustMode,
  });
  const priority = assessMissionScenarioPriority({
    level,
    phase,
    routeSelected,
    shortReason: requiredActions[0] ?? summary,
    confidence,
  });

  const supportingDimensions: ECSMissionScenarioDimensions = {
    vehicleReadiness: vehicleReadiness.label,
    routeSuitability: routeSuitability.label,
    resourceSufficiency: resourceSufficiency.label,
    weatherSupport: weatherSupport.label,
    offlineReadiness: offlineSupport.label,
    bailoutMargin: bailoutMargin.label,
  };

  return {
    level,
    score,
    label: scenarioLabel(level),
    summary,
    strengths,
    limitations,
    requiredActions,
    supportingDimensions,
    confidence,
    priority,
    explanation,
  };
}

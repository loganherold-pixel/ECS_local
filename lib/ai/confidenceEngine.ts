import type {
  ECSConfidenceFreshness,
  ECSConfidenceInput,
  ECSConfidenceLevel,
  ECSConfidenceReason,
  ECSConfidenceResult,
  ECSConfidenceSourceInput,
} from './confidenceTypes';

const LEVEL_LABELS: Record<ECSConfidenceLevel, string> = {
  high: 'High confidence',
  moderate: 'Moderate confidence',
  limited: 'Limited confidence',
  low: 'Low confidence',
  unknown: 'Confidence unavailable',
};

const LEVEL_ORDER: ECSConfidenceLevel[] = ['unknown', 'low', 'limited', 'moderate', 'high'];

function freshnessWeight(freshness?: ECSConfidenceFreshness | null): number {
  switch (freshness) {
    case 'fresh':
      return 1;
    case 'aging':
      return 0.72;
    case 'stale':
      return 0.25;
    case 'unknown':
    default:
      return 0.45;
  }
}

function priorityWeight(priority?: ECSConfidenceSourceInput['priority']): number {
  switch (priority) {
    case 'critical':
      return 1.35;
    case 'high':
      return 1.15;
    case 'low':
      return 0.8;
    case 'normal':
    default:
      return 1;
  }
}

function levelFromScore(score: number, hasUsableSources: boolean): ECSConfidenceLevel {
  if (!hasUsableSources) return 'unknown';
  if (score >= 85) return 'high';
  if (score >= 65) return 'moderate';
  if (score >= 40) return 'limited';
  if (score >= 15) return 'low';
  return 'unknown';
}

function capLevel(level: ECSConfidenceLevel, cap?: ECSConfidenceLevel): ECSConfidenceLevel {
  if (!cap) return level;
  const levelIndex = LEVEL_ORDER.indexOf(level);
  const capIndex = LEVEL_ORDER.indexOf(cap);
  return LEVEL_ORDER[Math.min(levelIndex, capIndex)] ?? level;
}

function buildShortReason(reasons: ECSConfidenceReason[]): string {
  if (reasons.includes('awaiting_signal')) return 'Awaiting stronger signal';
  if (reasons.includes('missing_required_inputs')) return 'Missing required inputs';
  if (reasons.includes('conflicting_inputs')) return 'Inputs do not agree';
  if (reasons.includes('offline_estimate')) return 'Offline estimate';
  if (reasons.includes('stale_data')) return 'Data is stale';
  if (reasons.includes('manual_only')) return 'Based on manual inputs';
  if (reasons.includes('estimated_partial')) return 'Estimated from partial data';
  if (reasons.includes('live_multi_source')) return 'Live sources agree';
  if (reasons.includes('live_single_source')) return 'Single live source active';
  return 'Confidence stable';
}

export function evaluateECSConfidence(input: ECSConfidenceInput): ECSConfidenceResult {
  const sources = Array.isArray(input.sources) ? input.sources : [];
  const availableSources = sources.filter((source) => source.available !== false);
  const requiredSources = sources.filter((source) => source.required);
  const missingRequired = requiredSources.filter((source) => source.available === false);
  const liveSources = availableSources.filter((source) => source.origin === 'live');
  const manualSources = availableSources.filter((source) => source.origin === 'manual');
  const inferredSources = availableSources.filter((source) => source.origin === 'inferred');
  const staleSources = availableSources.filter((source) => source.freshness === 'stale');
  const conflictingSources = availableSources.filter((source) => source.agrees === false);
  const usableCount = availableSources.length;

  const completenessRatio =
    requiredSources.length > 0
      ? (requiredSources.length - missingRequired.length) / requiredSources.length
      : usableCount > 0
        ? 1
        : 0;

  const freshnessRatio =
    usableCount > 0
      ? availableSources.reduce((sum, source) => {
          return sum + freshnessWeight(source.freshness) * priorityWeight(source.priority);
        }, 0) /
        availableSources.reduce((sum, source) => sum + priorityWeight(source.priority), 0)
      : 0;

  const agreementInputs = availableSources.filter((source) => source.agrees != null);
  const agreementRatio =
    agreementInputs.length > 0
      ? agreementInputs.filter((source) => source.agrees !== false).length / agreementInputs.length
      : usableCount > 1
        ? 1
        : liveSources.length > 0
          ? 0.75
          : 0.6;

  let score = usableCount > 0 ? 14 : 0;
  score += completenessRatio * 28;
  score += freshnessRatio * 18;
  score += Math.min(24, liveSources.length * 10 + Math.max(0, liveSources.length - 1) * 4);
  score += Math.min(10, manualSources.length * 3);
  score += Math.min(8, inferredSources.length * 2);
  score += agreementRatio * 12;
  score -= missingRequired.length * 14;
  score -= staleSources.length * 8;
  score -= conflictingSources.length * 18;

  if (manualSources.length > 0 && liveSources.length === 0 && inferredSources.length === 0) {
    score -= 8;
  }
  if (inferredSources.length > liveSources.length + manualSources.length) {
    score -= 8;
  }
  if (input.degraded) {
    score -= 6;
  }
  if (input.offline && input.cloudDependent) {
    score -= 12;
  }
  if (input.awaitingSignal && liveSources.length === 0) {
    score -= 8;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const reasons: ECSConfidenceReason[] = [];
  if (usableCount === 0 || (input.awaitingSignal && liveSources.length === 0)) {
    reasons.push('awaiting_signal');
  }
  if (missingRequired.length > 0) {
    reasons.push('missing_required_inputs');
  }
  if (conflictingSources.length > 0) {
    reasons.push('conflicting_inputs');
  }
  if (staleSources.length > 0) {
    reasons.push('stale_data');
  }
  if (input.offline && input.cloudDependent) {
    reasons.push('offline_estimate');
  }
  if (liveSources.length >= 2 && agreementRatio >= 0.75) {
    reasons.push('live_multi_source');
  } else if (liveSources.length >= 1) {
    reasons.push('live_single_source');
  }
  if (manualSources.length > 0 && liveSources.length === 0 && inferredSources.length === 0) {
    reasons.push('manual_only');
  }
  if (
    inferredSources.length > 0 ||
    missingRequired.length > 0 ||
    (manualSources.length > 0 && liveSources.length === 0)
  ) {
    reasons.push('estimated_partial');
  }

  let level = levelFromScore(score, usableCount > 0);
  level = capLevel(level, input.capLevel);

  return {
    level,
    score,
    label: LEVEL_LABELS[level],
    shortReason: buildShortReason(reasons),
    reasons,
    sourceSummary: {
      live: liveSources.length,
      manual: manualSources.length,
      inferred: inferredSources.length,
      stale: staleSources.length,
      missing: sources.filter((source) => source.available === false).length,
    },
  };
}

export function formatConfidenceCompactLine(result: ECSConfidenceResult | null | undefined): string | null {
  if (!result) return null;
  return `${result.label} - ${result.shortReason}`;
}

export function toLegacyTriConfidence(
  result: ECSConfidenceResult | null | undefined,
): 'high' | 'medium' | 'low' {
  switch (result?.level) {
    case 'high':
      return 'high';
    case 'moderate':
      return 'medium';
    case 'limited':
    case 'low':
    case 'unknown':
    default:
      return 'low';
  }
}

export function assessRouteRiskConfidence(params: {
  hasTerrainProfile: boolean;
  hasWeightProfile: boolean;
  hasRouteContext: boolean;
  hasWeatherCoverage?: boolean;
  weatherFreshness?: ECSConfidenceFreshness;
  offline?: boolean;
}): ECSConfidenceResult {
  return evaluateECSConfidence({
    domain: 'trail_risk',
    offline: !!params.offline,
    cloudDependent: !!params.hasWeatherCoverage,
    capLevel: params.hasWeatherCoverage ? undefined : 'moderate',
    sources: [
      {
        id: 'terrain_profile',
        origin: 'manual',
        available: params.hasTerrainProfile,
        required: true,
        freshness: 'fresh',
        priority: 'critical',
      },
      {
        id: 'weight_profile',
        origin: 'manual',
        available: params.hasWeightProfile,
        required: true,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'route_context',
        origin: 'inferred',
        available: params.hasRouteContext,
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
      {
        id: 'weather_coverage',
        origin: 'live',
        available: !!params.hasWeatherCoverage,
        required: false,
        freshness: params.weatherFreshness ?? 'unknown',
        priority: 'high',
      },
    ],
  });
}

export function assessRemotenessConfidence(params: {
  hasGpsFix: boolean;
  hasSpeedSignal: boolean;
  hasElevationSignal: boolean;
  hasRouteContext: boolean;
  connectivityFreshness: ECSConfidenceFreshness;
  availableFactors: number;
  totalFactors: number;
  offline?: boolean;
}): ECSConfidenceResult {
  const factorCoverage = params.totalFactors > 0 ? params.availableFactors / params.totalFactors : 0;
  return evaluateECSConfidence({
    domain: 'remoteness',
    offline: !!params.offline,
    capLevel: factorCoverage >= 0.85 && params.hasGpsFix ? undefined : 'moderate',
    sources: [
      {
        id: 'gps_fix',
        origin: 'live',
        available: params.hasGpsFix,
        required: true,
        freshness: params.hasGpsFix ? 'fresh' : 'unknown',
        priority: 'critical',
      },
      {
        id: 'speed_signal',
        origin: 'live',
        available: params.hasSpeedSignal,
        required: false,
        freshness: params.hasSpeedSignal ? 'fresh' : 'unknown',
        priority: 'normal',
      },
      {
        id: 'elevation_signal',
        origin: 'live',
        available: params.hasElevationSignal,
        required: false,
        freshness: params.hasElevationSignal ? 'fresh' : 'unknown',
        priority: 'normal',
      },
      {
        id: 'route_context',
        origin: 'inferred',
        available: params.hasRouteContext,
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
      {
        id: 'factor_coverage',
        origin: 'inferred',
        available: factorCoverage > 0,
        required: true,
        freshness: factorCoverage >= 0.85 ? 'fresh' : factorCoverage >= 0.6 ? 'aging' : 'stale',
        priority: 'high',
      },
      {
        id: 'connectivity_context',
        origin: 'live',
        available: params.connectivityFreshness !== 'unknown',
        required: false,
        freshness: params.connectivityFreshness,
        priority: 'normal',
      },
    ],
  });
}

export function assessVehicleAssessmentConfidence(params: {
  hasVehicleProfile: boolean;
  hasCoreSpecs: boolean;
  hasFuelSpecs: boolean;
  hasTireConfig: boolean;
  hasSuspensionConfig: boolean;
  hasFullScore: boolean;
}): ECSConfidenceResult {
  return evaluateECSConfidence({
    domain: 'vehicle_assessment',
    capLevel: params.hasFullScore ? undefined : 'moderate',
    sources: [
      {
        id: 'vehicle_profile',
        origin: 'manual',
        available: params.hasVehicleProfile,
        required: true,
        freshness: 'fresh',
        priority: 'critical',
      },
      {
        id: 'core_specs',
        origin: 'manual',
        available: params.hasCoreSpecs,
        required: true,
        freshness: 'fresh',
        priority: 'critical',
      },
      {
        id: 'fuel_specs',
        origin: 'manual',
        available: params.hasFuelSpecs,
        required: true,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'tire_config',
        origin: 'manual',
        available: params.hasTireConfig,
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
      {
        id: 'suspension_config',
        origin: 'manual',
        available: params.hasSuspensionConfig,
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
    ],
  });
}

export function assessExploreRecommendationConfidence(params: {
  hasDistanceContext: boolean;
  gpsEstimated: boolean;
  hasVehicleAssessment: boolean;
  hasHiddenGemSignals: boolean;
  aiConfidence?: 'high' | 'good' | 'explore' | null;
  offline?: boolean;
  degraded?: boolean;
}): ECSConfidenceResult {
  const base = evaluateECSConfidence({
    domain: 'explore_recommendation',
    offline: !!params.offline,
    degraded: !!params.degraded,
    cloudDependent: true,
    capLevel: 'moderate',
    sources: [
      {
        id: 'route_dataset',
        origin: 'inferred',
        available: true,
        required: true,
        freshness: 'fresh',
        priority: 'critical',
      },
      {
        id: 'distance_context',
        origin: params.gpsEstimated ? 'inferred' : 'live',
        available: params.hasDistanceContext,
        required: true,
        freshness: params.gpsEstimated ? 'aging' : 'fresh',
        priority: 'high',
      },
      {
        id: 'vehicle_assessment',
        origin: 'manual',
        available: params.hasVehicleAssessment,
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
      {
        id: 'hidden_gem_signals',
        origin: 'inferred',
        available: params.hasHiddenGemSignals,
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
      {
        id: 'ai_refinement',
        origin: 'inferred',
        available: !!params.aiConfidence,
        required: false,
        freshness:
          params.aiConfidence === 'high'
            ? 'fresh'
            : params.aiConfidence === 'good'
              ? 'aging'
              : 'stale',
        priority: 'low',
      },
    ],
  });

  if (params.aiConfidence === 'high' && base.level === 'limited') {
    return {
      ...base,
      score: Math.min(100, base.score + 8),
      level: 'moderate',
      label: LEVEL_LABELS.moderate,
      shortReason: 'Estimated from strong route signals',
    };
  }

  return base;
}

export function assessTelemetryConfidence(params: {
  hasLiveTelemetry: boolean;
  hasBluetoothProvider: boolean;
  hasCloudTelemetry?: boolean;
  hasStoredProviderState?: boolean;
  hasManualProfile: boolean;
  telemetryFreshness: ECSConfidenceFreshness;
  providerLimited?: boolean;
  offline?: boolean;
}): ECSConfidenceResult {
  return evaluateECSConfidence({
    domain: 'telemetry',
    offline: !!params.offline,
    degraded: !!params.providerLimited,
    cloudDependent: !!params.hasCloudTelemetry,
    capLevel:
      params.hasCloudTelemetry && !params.hasLiveTelemetry
        ? 'moderate'
        : undefined,
    sources: [
      {
        id: 'telemetry_live',
        origin: 'live',
        available: params.hasLiveTelemetry,
        required: true,
        freshness: params.telemetryFreshness,
        priority: 'critical',
      },
      {
        id: 'provider_link',
        origin: 'live',
        available: params.hasBluetoothProvider,
        required: false,
        freshness: params.telemetryFreshness,
        priority: 'high',
      },
      {
        id: 'provider_cloud',
        origin: 'inferred',
        available: !!params.hasCloudTelemetry,
        required: false,
        freshness: params.telemetryFreshness,
        priority: 'high',
      },
      {
        id: 'stored_provider_state',
        origin: 'inferred',
        available: !!params.hasStoredProviderState,
        required: false,
        freshness: params.telemetryFreshness === 'stale' ? 'stale' : 'aging',
        priority: 'normal',
      },
      {
        id: 'manual_profile',
        origin: 'manual',
        available: params.hasManualProfile,
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
    ],
  });
}

export function assessRouteViabilityConfidence(params: {
  hasForecast: boolean;
  hasLiveResourceTelemetry: boolean;
  hasManualBaseline: boolean;
  hasRouteContext: boolean;
  hasRemainingDistance: boolean;
  hasBailoutContext: boolean;
  resourceFreshness: ECSConfidenceFreshness;
  offline?: boolean;
  degraded?: boolean;
}): ECSConfidenceResult {
  return evaluateECSConfidence({
    domain: 'route_viability',
    offline: !!params.offline,
    degraded: !!params.degraded,
    capLevel:
      !params.hasRouteContext || (!params.hasForecast && !params.hasManualBaseline)
        ? 'limited'
        : undefined,
    sources: [
      {
        id: 'route_context',
        origin: 'inferred',
        available: params.hasRouteContext,
        required: true,
        freshness: 'fresh',
        priority: 'critical',
      },
      {
        id: 'remaining_distance',
        origin: 'inferred',
        available: params.hasRemainingDistance,
        required: false,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'resource_forecast',
        origin: 'inferred',
        available: params.hasForecast,
        required: false,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'live_resource_telemetry',
        origin: 'live',
        available: params.hasLiveResourceTelemetry,
        required: false,
        freshness: params.resourceFreshness,
        priority: 'critical',
      },
      {
        id: 'manual_resource_baseline',
        origin: 'manual',
        available: params.hasManualBaseline,
        required: !params.hasForecast,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'bailout_context',
        origin: 'inferred',
        available: params.hasBailoutContext,
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
    ],
  });
}

export function assessOfflineReadinessConfidence(params: {
  hasCacheCoverage: boolean;
  hasLocalRoute: boolean;
  routeRelevant: boolean;
  gpsReady: boolean;
  gpsWaiting?: boolean;
  hasManualBaseline: boolean;
  hasExpeditionData: boolean;
  hasWeatherSupport: boolean;
  weatherFreshness: ECSConfidenceFreshness;
  syncFresh: boolean;
  offline?: boolean;
  degraded?: boolean;
}): ECSConfidenceResult {
  return evaluateECSConfidence({
    domain: 'offline_readiness',
    offline: !!params.offline,
    degraded: !!params.degraded,
    cloudDependent: !params.hasWeatherSupport,
    awaitingSignal: !!params.gpsWaiting && !params.gpsReady,
    capLevel:
      !params.hasCacheCoverage || (params.routeRelevant && !params.hasLocalRoute)
        ? 'limited'
        : undefined,
    sources: [
      {
        id: 'cache_coverage',
        origin: 'inferred',
        available: params.hasCacheCoverage,
        required: true,
        freshness: 'fresh',
        priority: 'critical',
      },
      {
        id: 'local_route',
        origin: 'inferred',
        available: params.hasLocalRoute,
        required: params.routeRelevant,
        freshness: 'fresh',
        priority: 'critical',
      },
      {
        id: 'gps_readiness',
        origin: 'live',
        available: params.gpsReady,
        required: true,
        freshness: params.gpsReady ? 'fresh' : params.gpsWaiting ? 'aging' : 'unknown',
        priority: 'critical',
      },
      {
        id: 'manual_baseline',
        origin: 'manual',
        available: params.hasManualBaseline,
        required: false,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'expedition_data',
        origin: 'inferred',
        available: params.hasExpeditionData,
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
      {
        id: 'weather_support',
        origin: 'inferred',
        available: params.hasWeatherSupport,
        required: false,
        freshness: params.weatherFreshness,
        priority: 'normal',
      },
      {
        id: 'sync_freshness',
        origin: 'live',
        available: params.syncFresh,
        required: false,
        freshness: params.syncFresh ? 'fresh' : 'aging',
        priority: 'low',
      },
    ],
  });
}

export function assessWeatherConfidence(params: {
  hasWeather: boolean;
  freshness: ECSConfidenceFreshness;
  hasAlerts?: boolean;
  offline?: boolean;
}): ECSConfidenceResult {
  return evaluateECSConfidence({
    domain: 'weather',
    offline: !!params.offline,
    cloudDependent: true,
    sources: [
      {
        id: 'weather_current',
        origin: 'live',
        available: params.hasWeather,
        required: true,
        freshness: params.freshness,
        priority: 'critical',
      },
      {
        id: 'weather_alerts',
        origin: 'live',
        available: !!params.hasAlerts,
        required: false,
        freshness: params.freshness,
        priority: 'high',
      },
    ],
  });
}

export function assessBriefConfidence(params: {
  hasActiveRoute: boolean;
  hasFreshWeather: boolean;
  hasRemoteness: boolean;
  hasTelemetry: boolean;
  hasGpsFix: boolean;
  connectivityOnline: boolean;
  dataCompleteness: number;
  warnings: string[];
}): ECSConfidenceResult {
  const completenessFreshness: ECSConfidenceFreshness =
    params.dataCompleteness >= 80 ? 'fresh' : params.dataCompleteness >= 55 ? 'aging' : 'stale';

  return evaluateECSConfidence({
    domain: 'ecs_brief',
    offline: !params.connectivityOnline,
    degraded: params.warnings.length > 0,
    cloudDependent: true,
    sources: [
      {
        id: 'route_context',
        origin: params.hasActiveRoute ? 'live' : 'inferred',
        available: params.hasActiveRoute,
        required: true,
        freshness: params.hasActiveRoute ? 'fresh' : 'unknown',
        priority: 'critical',
      },
      {
        id: 'weather',
        origin: 'live',
        available: params.hasFreshWeather,
        required: false,
        freshness: params.hasFreshWeather ? 'fresh' : 'stale',
        priority: 'high',
      },
      {
        id: 'remoteness',
        origin: 'inferred',
        available: params.hasRemoteness,
        required: false,
        freshness: params.hasRemoteness ? 'fresh' : 'unknown',
        priority: 'normal',
      },
      {
        id: 'telemetry',
        origin: 'live',
        available: params.hasTelemetry,
        required: false,
        freshness: params.hasTelemetry ? 'fresh' : 'unknown',
        priority: 'high',
      },
      {
        id: 'gps',
        origin: 'live',
        available: params.hasGpsFix,
        required: false,
        freshness: params.hasGpsFix ? 'fresh' : 'unknown',
        priority: 'normal',
      },
      {
        id: 'context_completeness',
        origin: 'inferred',
        available: params.dataCompleteness > 0,
        required: true,
        freshness: completenessFreshness,
        priority: 'high',
      },
    ],
  });
}

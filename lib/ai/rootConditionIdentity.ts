import type {
  ECSOrchestratorCandidate,
  ECSRootConditionFamily,
  ECSRootConditionIdentity,
} from './orchestratorTypes';

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function routeRiskFamilyFromCandidate(
  candidate: ECSOrchestratorCandidate,
  combinedText: string,
): ECSRootConditionFamily {
  if (candidate.groupKey === 'route_weather') {
    return includesAny(combinedText, ['stale', 'aging', 'cached forecast', 'forecast support'])
      ? 'stale_weather_support'
      : 'weather_route_exposure';
  }

  if (candidate.groupKey === 'route_viability') {
    return includesAny(combinedText, ['exit', 'bailout', 'retreat', 'recovery'])
      ? 'bailout_relevance'
      : 'resource_margin_decline';
  }

  if (candidate.groupKey === 'telemetry_disconnect') {
    return 'telemetry_disconnect';
  }

  if (candidate.groupKey === 'navigation_guidance') {
    return 'gps_guidance_degradation';
  }

  if (candidate.groupKey === 'degraded_operations') {
    return includesAny(combinedText, ['offline capable', 'offline-capable'])
      ? 'offline_capable_operation'
      : 'degraded_operations';
  }

  if (candidate.groupKey === 'vehicle_fit') {
    return 'route_fit_limitation';
  }

  if (candidate.groupKey === 'signal_priority') {
    return 'operational_alert';
  }

  switch (candidate.source) {
    case 'mission_scenario':
      return 'mission_planning_readiness';
    case 'route_viability':
      return includesAny(combinedText, ['exit', 'bailout', 'retreat', 'recovery'])
        ? 'bailout_relevance'
        : 'resource_margin_decline';
    case 'route_risk':
    case 'remoteness':
      return includesAny(combinedText, ['weather', 'wind', 'storm', 'rain', 'snow', 'precip'])
        ? 'weather_route_exposure'
        : includesAny(combinedText, ['bailout', 'exit', 'retreat', 'recovery'])
          ? 'bailout_relevance'
          : 'route_risk_elevation';
    case 'weather':
      return includesAny(combinedText, ['stale', 'aging', 'cached', 'forecast support'])
        ? 'stale_weather_support'
        : 'weather_route_exposure';
    case 'telemetry':
      return includesAny(combinedText, ['disconnect', 'stale', 'manual', 'provider', 'reconnect'])
        ? 'telemetry_disconnect'
        : 'degraded_operations';
    case 'resource_status':
      return includesAny(combinedText, ['fuel', 'range', 'margin', 'reserve', 'water', 'endurance'])
        ? 'resource_margin_decline'
        : 'degraded_operations';
    case 'vehicle_assessment':
      return candidate.phase === 'vehicle_setup' || candidate.phase === 'staging'
        ? 'vehicle_readiness_gap'
        : 'route_fit_limitation';
    case 'bailout':
      return 'bailout_relevance';
    case 'sync':
      return includesAny(combinedText, ['offline capable', 'offline-capable'])
        ? 'offline_capable_operation'
        : 'degraded_operations';
    case 'explore':
      return 'planning_recommendation';
    case 'brief':
      return 'degraded_operations';
    case 'safety':
    case 'attitude':
      return 'operational_alert';
    default:
      return 'degraded_operations';
  }
}

function scopeForFamily(family: ECSRootConditionFamily): ECSRootConditionIdentity['scope'] {
  switch (family) {
    case 'weather_route_exposure':
    case 'gps_guidance_degradation':
    case 'bailout_relevance':
    case 'route_risk_elevation':
      return 'route';
    case 'resource_margin_decline':
      return 'resource';
    case 'route_fit_limitation':
    case 'vehicle_readiness_gap':
      return 'readiness';
    case 'mission_planning_readiness':
      return 'planning';
    case 'planning_recommendation':
      return 'planning';
    case 'offline_capable_operation':
    case 'degraded_operations':
    case 'telemetry_disconnect':
      return 'system';
    case 'operational_alert':
      return 'safety';
    case 'stale_weather_support':
      return 'planning';
    default:
      return 'system';
  }
}

function affectedDomainForFamily(
  family: ECSRootConditionFamily,
  candidate: ECSOrchestratorCandidate,
): string | null {
  switch (family) {
    case 'weather_route_exposure':
    case 'stale_weather_support':
      return 'weather';
    case 'gps_guidance_degradation':
      return 'gps';
    case 'telemetry_disconnect':
      return 'telemetry';
    case 'resource_margin_decline':
      return 'resource';
    case 'route_fit_limitation':
    case 'vehicle_readiness_gap':
      return 'vehicle_assessment';
    case 'mission_planning_readiness':
      return 'mission_scenario';
    case 'offline_capable_operation':
    case 'degraded_operations':
      return 'offline';
    case 'bailout_relevance':
      return 'route_viability';
    case 'route_risk_elevation':
      return 'route_risk';
    case 'planning_recommendation':
      return 'explore';
    case 'operational_alert':
      return candidate.priority?.domain ?? candidate.source;
    default:
      return candidate.priority?.domain ?? null;
  }
}

function buildKey(family: ECSRootConditionFamily, candidate: ECSOrchestratorCandidate): string {
  if (family === 'planning_recommendation') {
    const sourceKey = normalizeText(candidate.priority?.sourceKey);
    if (sourceKey) {
      return `planning_recommendation:${sourceKey}`;
    }
  }

  if (family === 'mission_planning_readiness') {
    return 'mission_planning_readiness';
  }

  return family;
}

export function resolveRootConditionIdentity(
  candidate: ECSOrchestratorCandidate,
): ECSRootConditionIdentity {
  if (candidate.rootCondition?.key) {
    return candidate.rootCondition;
  }

  const combinedText = [
    candidate.title,
    candidate.summary,
    candidate.explanation?.text,
    candidate.explanation?.shortText,
    candidate.priority?.shortReason,
    candidate.priority?.title,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(' ');

  const family = routeRiskFamilyFromCandidate(candidate, combinedText);

  return {
    key: buildKey(family, candidate),
    family,
    sourceFamily: candidate.groupKey ?? candidate.source,
    affectedDomain: affectedDomainForFamily(family, candidate),
    scope: scopeForFamily(family),
    suppressionCompatibility: [family, candidate.groupKey ?? candidate.source].filter(Boolean),
  };
}

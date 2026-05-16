import type {
  ECSDegradedOperationsInput,
  ECSDegradedOperationsResult,
  ECSOperationalState,
  ECSRouteGuidanceAvailability,
  ECSRouteGuidanceAvailabilityInput,
} from './degradedOperationsTypes';

function pushUnique(target: string[], value: string | null | undefined) {
  if (!value) return;
  if (!target.includes(value)) {
    target.push(value);
  }
}

function dedupeList(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeCopy(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function isLowValueTelemetryDegradedSummary(summary: string | null | undefined): boolean {
  const normalized = normalizeCopy(summary);
  if (!normalized) return false;

  return (
    normalized.includes('live vehicle data is reduced') &&
    normalized.includes('blending saved inputs with partial telemetry')
  ) || (
    normalized.includes('live telemetry is unavailable') &&
    normalized.includes('guidance is leaning on saved inputs')
  );
}

function classifyGps(status: string | null | undefined): 'good' | 'weak' | 'missing' {
  const normalized = String(status ?? '').trim().toUpperCase();
  if (
    normalized === 'ACTIVE'
    || normalized === 'TRACKING'
    || normalized === 'LOCKED'
    || normalized === 'READY'
  ) {
    return 'good';
  }
  if (
    normalized === 'ACQUIRING'
    || normalized === 'RETRYING'
    || normalized === 'SEARCHING'
    || normalized === 'INITIALIZING'
  ) {
    return 'weak';
  }
  return 'missing';
}

function classifyTelemetry(state: string | null | undefined): 'live' | 'partial' | 'manual' | 'missing' {
  const normalized = String(state ?? '').trim().toUpperCase();
  if (!normalized) return 'missing';
  if (
    normalized.includes('LIVE')
    || normalized.includes('FRESH')
    || normalized.includes('CONNECTED')
    || normalized.includes('CURRENT')
  ) {
    return 'live';
  }
  if (
    normalized.includes('CLOUD')
    || normalized.includes('PARTIAL')
    || normalized.includes('DEGRADED')
    || normalized.includes('STALE')
    || normalized.includes('ATTENTION')
    || normalized.includes('ESTIMATE')
    || normalized.includes('WAITING')
    || normalized.includes('DISCONNECT')
  ) {
    return 'partial';
  }
  if (
    normalized.includes('MANUAL')
    || normalized.includes('PROFILE')
    || normalized.includes('SAVED')
    || normalized.includes('BASELINE')
  ) {
    return 'manual';
  }
  return 'missing';
}

function cachedMapsAvailable(input: ECSDegradedOperationsInput): boolean {
  if (typeof input.hasCachedMapData === 'boolean') return input.hasCachedMapData;
  return input.offlineCacheState === 'healthy'
    || input.offlineCacheState === 'watch'
    || input.offlineCacheState === 'warning';
}

export function assessRouteGuidanceAvailability(
  input: ECSRouteGuidanceAvailabilityInput,
): ECSRouteGuidanceAvailability {
  const gps = classifyGps(input.gpsStatus);
  const requested = !!input.routeGuidanceRequested;

  if (!requested) {
    return {
      requested,
      available: false,
      unavailable: false,
      reason: 'not_requested',
      label: 'Route guidance not active',
    };
  }

  let reason: ECSRouteGuidanceAvailability['reason'] = 'available';
  if (!input.hasActiveRoute) {
    reason = 'no_active_route';
  } else if (!input.hasRouteGeometry) {
    reason = 'missing_geometry';
  } else if (gps === 'missing') {
    reason = 'gps_missing';
  }

  const available = reason === 'available';
  return {
    requested,
    available,
    unavailable: !available,
    reason,
    label: available ? 'Route guidance available' : 'Route guidance unavailable',
  };
}

function buildSummary(args: {
  state: ECSOperationalState;
  offline: boolean;
  limitedNet: boolean;
  gps: 'good' | 'weak' | 'missing';
  weatherStale: boolean;
  telemetryMode: 'live' | 'partial' | 'manual' | 'missing';
  hasCachedMaps: boolean;
  routeGuidanceRequested: boolean;
  routeGuidanceAvailable: boolean;
  routeGuidanceUnavailable: boolean;
  routeRiskEstimated: boolean;
}): string {
  if (args.state === 'fully_operational') {
    return 'Live guidance inputs are available and ECS is operating normally.';
  }

  if (args.state === 'offline_capable') {
    if (args.weatherStale) {
      return 'Offline support is active. Saved maps remain available, but weather is no longer current.';
    }
    return 'Offline support is active. Saved maps and core navigation remain available while cloud-backed guidance is limited.';
  }

  if (args.state === 'unavailable') {
    if (args.routeGuidanceUnavailable) {
      return 'Turn-by-turn guidance is paused until a valid route and positioning signal are restored.';
    }
    if (args.gps === 'missing') {
      return 'Location-based guidance is unavailable until GPS returns.';
    }
    return 'Required inputs are unavailable for this ECS task.';
  }

  if (args.state === 'limited') {
    if (args.gps === 'weak' || args.gps === 'missing') {
      return 'GPS is weak, so route and advisory guidance are running with reduced certainty.';
    }
    if (args.telemetryMode === 'manual' || args.telemetryMode === 'missing') {
      return 'Live telemetry is unavailable, so vehicle guidance is leaning on saved inputs.';
    }
    return 'Several live inputs are reduced. Guidance remains available, but with less certainty.';
  }

  if (args.weatherStale) {
    const guidanceLine = args.routeGuidanceRequested
      ? args.routeGuidanceAvailable
        ? ' Route guidance available.'
        : ' Route guidance unavailable.'
      : '';
    return `Weather data is stale.${guidanceLine}`;
  }
  if (args.routeRiskEstimated) {
    return 'Route risk remains available, but one or more supporting inputs are estimated.';
  }
  if (args.telemetryMode === 'partial' || args.telemetryMode === 'manual') {
    return 'Live vehicle data is reduced, so ECS is blending saved inputs with partial telemetry.';
  }
  if (args.limitedNet) {
    return 'Connectivity is reduced, so cloud-backed ECS services may lag current conditions.';
  }
  if (args.hasCachedMaps && args.offline) {
    return 'Saved map data is available while cloud-backed ECS services are limited.';
  }
  return 'Some ECS systems are reduced, but core capability remains available.';
}

function buildActions(args: {
  offline: boolean;
  limitedNet: boolean;
  gps: 'good' | 'weak' | 'missing';
  weatherStale: boolean;
  telemetryMode: 'live' | 'partial' | 'manual' | 'missing';
  bleDisconnected: boolean;
  routeGuidanceUnavailable: boolean;
  hasCachedMaps: boolean;
  cloudRecommendationsLimited: boolean;
}): string[] {
  const actions: string[] = [];

  if (args.routeGuidanceUnavailable) {
    pushUnique(actions, 'Load a valid route and confirm GPS lock before relying on active guidance.');
  }
  if (args.gps === 'weak') {
    pushUnique(actions, 'Hold for stronger GPS signal before relying on precise route prompts.');
  }
  if (args.gps === 'missing') {
    pushUnique(actions, 'Move to a clearer sky view or re-enable location services.');
  }
  if (args.weatherStale) {
    pushUnique(actions, 'Refresh weather when signal returns before committing to exposed terrain.');
  }
  if (args.telemetryMode !== 'live' && args.bleDisconnected) {
    pushUnique(actions, 'Reconnect vehicle telemetry when practical to restore live systems data.');
  } else if (args.telemetryMode === 'manual' || args.telemetryMode === 'missing') {
    pushUnique(actions, 'Verify vehicle and resource baselines before relying on estimated systems guidance.');
  }
  if (args.offline && args.hasCachedMaps) {
    pushUnique(actions, 'Saved maps remain available offline; hold cloud-dependent recommendations until service returns.');
  } else if (args.offline || args.limitedNet || args.cloudRecommendationsLimited) {
    pushUnique(actions, 'Expect cloud-backed recommendations to lag until connectivity stabilizes.');
  }

  return actions.slice(0, 4);
}

export function assessDegradedOperations(
  input: ECSDegradedOperationsInput,
): ECSDegradedOperationsResult {
  const workingSystems: string[] = [];
  const degradedSystems: string[] = [];
  const unavailableSystems: string[] = [];

  const gps = classifyGps(input.gpsStatus);
  const telemetryMode = input.telemetryAvailable
    ? classifyTelemetry(input.telemetryState)
    : (input.manualBaselineAvailable ? 'manual' : 'missing');
  const connectivityLevel = input.connectivityLevel ?? 'unknown';
  const offline = input.connectivityOnline === false || connectivityLevel === 'no_service';
  const limitedNet = connectivityLevel === 'limited';
  const hasCachedMaps = cachedMapsAvailable(input);
  const weatherStaleness = String(input.weatherStaleness ?? 'unknown').toLowerCase();
  const weatherStale = weatherStaleness === 'stale' || weatherStaleness === 'very_stale';
  const routeGuidanceRequested = !!input.routeGuidanceRequested;
  const routeGuidance = assessRouteGuidanceAvailability(input);
  const routeGuidanceUnavailable = routeGuidance.unavailable;
  const routeRiskEstimated =
    !!input.routeRiskAvailable
    && (
      !input.routeIntelligenceAvailable
      || !input.terrainIntelligenceAvailable
      || weatherStale
      || limitedNet
    );
  const bleDisconnected = input.bleConnected === false;
  const cloudRecommendationsLimited = !!input.cloudDependentRecommendations && (offline || limitedNet);

  if (gps === 'good') {
    pushUnique(workingSystems, 'GPS');
  } else if (gps === 'weak') {
    pushUnique(degradedSystems, 'GPS');
  } else {
    pushUnique(unavailableSystems, 'GPS');
  }

  if (routeGuidanceRequested) {
    if (routeGuidanceUnavailable) {
      pushUnique(unavailableSystems, 'Route guidance');
    } else if (gps === 'good') {
      pushUnique(workingSystems, 'Route guidance');
    } else {
      pushUnique(degradedSystems, 'Route guidance');
    }
  } else if (input.hasActiveRoute || input.hasRouteGeometry) {
    pushUnique(workingSystems, 'Route context');
  }

  if (hasCachedMaps) {
    pushUnique(workingSystems, 'Cached maps');
  } else if (offline) {
    pushUnique(unavailableSystems, 'Offline maps');
  }

  if (input.weatherAvailable) {
    if (!weatherStale && !offline) {
      pushUnique(workingSystems, 'Weather');
    } else {
      pushUnique(degradedSystems, 'Weather');
    }
  } else {
    pushUnique(unavailableSystems, 'Weather');
  }

  if (telemetryMode === 'live') {
    pushUnique(workingSystems, 'Vehicle telemetry');
  } else if (telemetryMode === 'partial') {
    pushUnique(degradedSystems, 'Vehicle telemetry');
  } else if (telemetryMode === 'manual') {
    pushUnique(workingSystems, 'Manual vehicle baseline');
    pushUnique(degradedSystems, 'Vehicle telemetry');
  } else {
    pushUnique(unavailableSystems, 'Vehicle telemetry');
  }

  if (input.routeRiskAvailable) {
    if (routeRiskEstimated) {
      pushUnique(degradedSystems, 'Route risk');
    } else {
      pushUnique(workingSystems, 'Route risk');
    }
  } else if (input.hasActiveRoute) {
    pushUnique(degradedSystems, 'Route risk');
  }

  if (input.remotenessAvailable) {
    pushUnique(workingSystems, 'Remoteness');
  } else if (input.hasActiveRoute) {
    pushUnique(degradedSystems, 'Remoteness');
  }

  if (input.forecastAvailable) {
    if (telemetryMode === 'manual' || telemetryMode === 'partial') {
      pushUnique(degradedSystems, 'Resource forecast');
    } else {
      pushUnique(workingSystems, 'Resource forecast');
    }
  }

  if (cloudRecommendationsLimited) {
    pushUnique(degradedSystems, 'Cloud recommendations');
  } else if (input.cloudDependentRecommendations) {
    pushUnique(workingSystems, 'Cloud recommendations');
  }

  if (offline) {
    pushUnique(unavailableSystems, 'Cloud sync');
  } else if (limitedNet) {
    pushUnique(degradedSystems, 'Cloud sync');
  } else {
    pushUnique(workingSystems, 'Cloud sync');
  }

  let state: ECSOperationalState;
  if (routeGuidanceUnavailable) {
    state = 'unavailable';
  } else if (
    offline
    && gps === 'good'
    && (hasCachedMaps || input.hasActiveRoute || input.hasRouteGeometry)
  ) {
    state = 'offline_capable';
  } else if (unavailableSystems.length === 0 && degradedSystems.length === 0) {
    state = 'fully_operational';
  } else if (
    gps !== 'good'
    || unavailableSystems.length >= 2
    || degradedSystems.length >= 4
  ) {
    state = 'limited';
  } else if (workingSystems.length === 0 && unavailableSystems.length > 0) {
    state = 'unavailable';
  } else {
    state = 'degraded';
  }

  const shortLabel =
    state === 'fully_operational'
      ? 'Operational'
      : state === 'offline_capable'
        ? 'Offline capable'
        : state === 'degraded'
          ? 'Degraded'
          : state === 'limited'
            ? 'Limited guidance'
            : 'Unavailable';

  const summary = buildSummary({
    state,
    offline,
    limitedNet,
    gps,
    weatherStale,
    telemetryMode,
    hasCachedMaps,
    routeGuidanceRequested,
    routeGuidanceAvailable: routeGuidance.available,
    routeGuidanceUnavailable,
    routeRiskEstimated,
  });

  const operatorActions = buildActions({
    offline,
    limitedNet,
    gps,
    weatherStale,
    telemetryMode,
    bleDisconnected,
    routeGuidanceUnavailable,
    hasCachedMaps,
    cloudRecommendationsLimited,
  });

  return {
    state,
    shortLabel,
    summary,
    workingSystems: dedupeList(workingSystems),
    degradedSystems: dedupeList(degradedSystems),
    unavailableSystems: dedupeList(unavailableSystems),
    operatorActions,
  };
}

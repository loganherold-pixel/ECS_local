import { connectivityIntelStore } from '../connectivityIntelStore';
import { evaluateCacheReadiness } from '../offlineCacheAwarenessEngine';
import type { ECSConfidenceFreshness } from './confidenceTypes';
import { assessOfflineReadinessConfidence } from './confidenceEngine';
import { assessOfflineReadinessPriority } from './priorityEngine';
import { explainRecommendation } from './recommendationExplanationEngine';
import type {
  ComputeOfflineReadinessArgs,
  ECSOfflineReadinessDrivers,
  ECSOfflineReadinessLevel,
  ECSOfflineReadinessResult,
} from './offlineReadinessTypes';

function dedupe(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  values.forEach((value) => {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    results.push(normalized);
  });

  return results;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function mapWeatherFreshness(staleness: string | null | undefined): ECSConfidenceFreshness {
  switch (String(staleness ?? '').toLowerCase()) {
    case 'fresh':
      return 'fresh';
    case 'aging':
      return 'aging';
    case 'stale':
    case 'very_stale':
      return 'stale';
    default:
      return 'unknown';
  }
}

function deriveDrivers(args: ComputeOfflineReadinessArgs): ECSOfflineReadinessDrivers {
  const { richContext } = args;
  const phase = richContext.phase.current.phase;
  const gpsStatus = String((richContext.environment.gps as any)?.gpsStatus ?? '').trim().toUpperCase();
  const cacheSummary = connectivityIntelStore.getSummary();
  const cacheSnapshot = evaluateCacheReadiness();
  const isOnline = richContext.environment.connectivity?.isOnline !== false;
  const routeRelevant =
    richContext.meta.hasActiveRoute
    || richContext.meta.hasActiveRun
    || phase === 'transit'
    || phase === 'trail_entry'
    || phase === 'active_expedition'
    || phase === 'recovery_exit';
  const planningRelevant =
    phase === 'vehicle_setup'
    || phase === 'staging'
    || phase === 'camp_stationary'
    || !routeRelevant;
  const hasMapCoverage =
    cacheSnapshot.cached_region_available
    || cacheSummary.cached_region_available
    || cacheSnapshot.expedition_data_covers_position
    || cacheSnapshot.expedition_data_covers_route;
  const hasAnyOfflineCache =
    cacheSnapshot.offline_cache_ready
    || cacheSummary.offline_cache_ready
    || cacheSnapshot.expedition_data_cached;
  const hasCachedRouteCoverage =
    cacheSnapshot.cached_route_available
    || cacheSummary.cached_route_available
    || cacheSnapshot.expedition_data_covers_route;
  const hasLocalRoute =
    hasCachedRouteCoverage
    || !!richContext.route.activeRoute
    || !!richContext.route.activeRun
    || !!richContext.route.routeContext;
  const hasExpeditionData =
    cacheSnapshot.expedition_data_cached
    || cacheSnapshot.expedition_data_regions > 0
    || cacheSnapshot.expedition_data_entries > 0;
  const hasExpeditionCoverage =
    cacheSnapshot.expedition_data_covers_position
    || cacheSnapshot.expedition_data_covers_route;
  const gpsReady = gpsStatus === 'ACTIVE' || gpsStatus === 'TRACKING';
  const gpsWaiting =
    gpsStatus === 'ACQUIRING'
    || gpsStatus === 'RETRYING'
    || gpsStatus === 'INITIALIZING';
  const gpsUnavailable =
    gpsStatus === 'OFFLINE'
    || gpsStatus === 'DENIED'
    || gpsStatus === 'UNAVAILABLE'
    || gpsStatus === 'NO_SIGNAL';
  const hasManualBaseline =
    !!richContext.mission.snapshot
    || !!richContext.resources.telemetryConfig
    || !!richContext.summary.vehicleName;
  const weatherSource = richContext.environment.weather.source;
  const weatherFreshness = mapWeatherFreshness(richContext.environment.weather.staleness);
  const hasWeatherSupport = weatherSource !== 'none';
  const weatherFresh = hasWeatherSupport && weatherFreshness !== 'stale';
  const weatherStale = !hasWeatherSupport || weatherFreshness === 'stale';
  const providerTelemetry = richContext.resources.providerTelemetry;
  const telemetryRequiresLiveConnection =
    providerTelemetry
      ? (
          (providerTelemetry.supportType === 'ble'
            || providerTelemetry.supportType === 'hybrid'
            || providerTelemetry.supportType === 'wifi')
          && providerTelemetry.source !== 'manual_baseline'
          && providerTelemetry.source !== 'cloud_sync'
          && providerTelemetry.state !== 'unsupported'
          && providerTelemetry.state !== 'unavailable'
        )
      : (
          !!richContext.resources.powerAuthority?.provider
          || richContext.liveStatus.telemetry.status === 'waiting'
          || richContext.liveStatus.telemetry.status === 'degraded'
          || richContext.liveStatus.telemetry.status === 'live'
        );
  const syncFresh =
    cacheSummary.freshness === 'live'
    || cacheSummary.freshness === 'recovering'
    || cacheSummary.operational_readiness === 'online_ready'
    || cacheSummary.operational_readiness === 'offline_ready'
    || cacheSummary.operational_readiness === 'degraded_ready';

  return {
    routeRelevant,
    planningRelevant,
    isOnline,
    cacheSummary,
    cacheSnapshot,
    hasMapCoverage,
    hasAnyOfflineCache,
    hasLocalRoute,
    hasCachedRouteCoverage,
    hasExpeditionData,
    hasExpeditionCoverage,
    gpsReady,
    gpsWaiting,
    gpsUnavailable,
    hasManualBaseline,
    hasWeatherSupport,
    weatherFresh,
    weatherStale,
    telemetryRequiresLiveConnection,
    syncFresh,
  };
}

function computeScore(drivers: ECSOfflineReadinessDrivers): number {
  let score = 0;

  if (drivers.hasAnyOfflineCache) score += 18;
  if (drivers.hasMapCoverage) score += 20;
  if (drivers.hasLocalRoute) score += drivers.routeRelevant ? 18 : 10;
  if (drivers.hasCachedRouteCoverage) score += 8;
  if (drivers.hasExpeditionData) score += 8;
  if (drivers.hasExpeditionCoverage) score += 6;
  if (drivers.gpsReady) score += 16;
  else if (drivers.gpsWaiting) score += 6;
  if (drivers.hasManualBaseline) score += 10;
  if (drivers.hasWeatherSupport) score += drivers.weatherFresh ? 8 : 3;
  if (drivers.syncFresh) score += 6;

  if (drivers.routeRelevant && !drivers.hasMapCoverage) score -= 22;
  if (drivers.routeRelevant && !drivers.hasLocalRoute) score -= 24;
  if (drivers.planningRelevant && !drivers.hasAnyOfflineCache) score -= 16;
  if (!drivers.gpsReady && drivers.gpsUnavailable) score -= 24;
  if (drivers.routeRelevant && !drivers.hasExpeditionCoverage) score -= 8;
  if (drivers.planningRelevant && drivers.weatherStale) score -= 8;
  if (!drivers.hasManualBaseline) score -= 10;
  if (drivers.telemetryRequiresLiveConnection) score -= 4;
  if (!drivers.syncFresh) score -= 4;

  return clampScore(score);
}

function resolveLevel(
  score: number,
  drivers: ECSOfflineReadinessDrivers,
): ECSOfflineReadinessLevel {
  if (
    (drivers.routeRelevant && (!drivers.hasMapCoverage || !drivers.hasLocalRoute))
    || (!drivers.gpsReady && drivers.gpsUnavailable)
  ) {
    return score >= 40 ? 'limited' : 'not_ready';
  }

  if (score >= 82) return 'ready';
  if (score >= 66) return 'ready_with_limitations';
  if (score >= 48) return 'partial';
  if (score >= 28) return 'limited';
  return 'not_ready';
}

function buildReadySystems(drivers: ECSOfflineReadinessDrivers): string[] {
  return dedupe([
    drivers.hasMapCoverage ? 'Cached maps cover the expected area' : null,
    drivers.hasLocalRoute ? 'Local route guidance is available' : null,
    drivers.gpsReady ? 'GPS can support offline guidance' : null,
    drivers.hasExpeditionData ? 'Expedition datasets are stored locally' : null,
    drivers.hasManualBaseline ? 'Vehicle and resource baselines are available locally' : null,
    drivers.weatherFresh ? 'Recent weather context is available' : null,
  ]);
}

function buildLimitedSystems(drivers: ECSOfflineReadinessDrivers): string[] {
  return dedupe([
    drivers.weatherStale ? 'Weather freshness will be limited offline' : null,
    drivers.telemetryRequiresLiveConnection ? 'Live provider telemetry may not refresh offline' : null,
    !drivers.syncFresh ? 'Recent sync coverage is still settling' : null,
    drivers.hasAnyOfflineCache && !drivers.hasCachedRouteCoverage
      ? 'Map cache is available, but active route coverage is incomplete'
      : null,
    drivers.hasExpeditionData && !drivers.hasExpeditionCoverage
      ? 'Expedition datasets exist, but route coverage is incomplete'
      : null,
  ]);
}

function buildMissingSystems(drivers: ECSOfflineReadinessDrivers): string[] {
  return dedupe([
    !drivers.hasAnyOfflineCache ? 'Offline map cache is missing' : null,
    drivers.routeRelevant && !drivers.hasMapCoverage ? 'Cached map coverage is missing for the route area' : null,
    drivers.routeRelevant && !drivers.hasLocalRoute ? 'Active route is not available locally' : null,
    !drivers.gpsReady && drivers.gpsUnavailable ? 'GPS guidance support is unavailable' : null,
    !drivers.hasManualBaseline ? 'Vehicle or resource baseline is incomplete' : null,
  ]);
}

function buildOperatorActions(drivers: ECSOfflineReadinessDrivers): string[] {
  return dedupe([
    !drivers.hasMapCoverage ? 'Download maps for the planned route area.' : null,
    drivers.routeRelevant && !drivers.hasLocalRoute ? 'Cache the active route before departure.' : null,
    drivers.planningRelevant && drivers.weatherStale && drivers.isOnline
      ? 'Refresh weather support while service is available.'
      : null,
    !drivers.syncFresh && drivers.isOnline ? 'Complete sync before entering limited-service terrain.' : null,
    drivers.telemetryRequiresLiveConnection ? 'Reconnect provider telemetry if live power data is required.' : null,
    !drivers.hasManualBaseline ? 'Confirm vehicle and resource baselines before going offline.' : null,
  ]).slice(0, 4);
}

function buildLabel(level: ECSOfflineReadinessLevel): string {
  switch (level) {
    case 'ready':
      return 'Offline ready';
    case 'ready_with_limitations':
      return 'Ready with limitations';
    case 'partial':
      return 'Partially prepared';
    case 'limited':
      return 'Offline readiness limited';
    case 'not_ready':
    default:
      return 'Offline preparation needed';
  }
}

function buildSummary(
  level: ECSOfflineReadinessLevel,
  drivers: ECSOfflineReadinessDrivers,
): string {
  switch (level) {
    case 'ready':
      return 'Core maps, route guidance, and local baselines remain ready for field use without service.';
    case 'ready_with_limitations':
      return drivers.weatherStale
        ? 'Core guidance is prepared for offline use, but weather freshness and cloud-backed support will soften.'
        : 'Core guidance is prepared for offline use, with a few non-critical limits remaining.';
    case 'partial':
      return 'Offline operation is partly prepared, but route or cache coverage still needs attention before deeper service loss.';
    case 'limited':
      return 'Offline operation is limited because key cached route, map, or local-support coverage is incomplete.';
    case 'not_ready':
    default:
      return 'Offline field posture is not ready because required maps, route coverage, or GPS support are missing.';
  }
}

function buildExplanationDrivers(
  level: ECSOfflineReadinessLevel,
  drivers: ECSOfflineReadinessDrivers,
): string[] {
  if (level === 'ready' || level === 'ready_with_limitations') {
    return dedupe([
      drivers.hasMapCoverage ? 'cached maps' : null,
      drivers.hasLocalRoute ? 'local route package' : null,
      drivers.gpsReady ? 'GPS readiness' : null,
      drivers.weatherStale ? 'stale weather support' : null,
      drivers.telemetryRequiresLiveConnection ? 'live telemetry dependency' : null,
    ]);
  }

  return dedupe([
    !drivers.hasMapCoverage ? 'missing map coverage' : null,
    !drivers.hasLocalRoute ? 'missing route package' : null,
    !drivers.gpsReady ? 'reduced GPS readiness' : null,
    !drivers.hasManualBaseline ? 'missing local baseline' : null,
    drivers.weatherStale ? 'stale weather support' : null,
  ]);
}

export function computeOfflineReadiness(
  args: ComputeOfflineReadinessArgs,
): ECSOfflineReadinessResult {
  const drivers = deriveDrivers(args);
  const score = computeScore(drivers);
  const level = resolveLevel(score, drivers);
  const readySystems = buildReadySystems(drivers);
  const limitedSystems = buildLimitedSystems(drivers);
  const missingSystems = buildMissingSystems(drivers);
  const operatorActions = buildOperatorActions(drivers);
  const confidence = assessOfflineReadinessConfidence({
    hasCacheCoverage: drivers.hasMapCoverage || drivers.hasAnyOfflineCache,
    hasLocalRoute: drivers.hasLocalRoute,
    routeRelevant: drivers.routeRelevant,
    gpsReady: drivers.gpsReady,
    gpsWaiting: drivers.gpsWaiting,
    hasManualBaseline: drivers.hasManualBaseline,
    hasExpeditionData: drivers.hasExpeditionData,
    hasWeatherSupport: drivers.hasWeatherSupport,
    weatherFreshness: mapWeatherFreshness(args.richContext.environment.weather.staleness),
    syncFresh: drivers.syncFresh,
    offline: !drivers.isOnline,
    degraded: level === 'limited' || level === 'not_ready',
  });
  const summary = buildSummary(level, drivers);
  const explanation = explainRecommendation({
    type: 'offline_readiness',
    drivers: buildExplanationDrivers(level, drivers),
    confidenceLevel: confidence.level,
    priorityLevel:
      level === 'limited' || level === 'not_ready'
        ? 'warning'
        : level === 'partial'
          ? 'caution'
          : 'informational',
    degradedState: args.richContext.operations.degraded.state,
  });
  const priority = assessOfflineReadinessPriority({
    readinessLevel: level,
    routeActive: drivers.routeRelevant,
    phase: args.richContext.phase.current.phase,
    isOnline: drivers.isOnline,
    shortReason:
      operatorActions[0]
      ?? (level === 'ready'
        ? 'Offline field posture remains prepared.'
        : 'Offline preparation should be tightened before service drops.'),
    confidence,
  });

  return {
    level,
    score,
    label: buildLabel(level),
    summary,
    readySystems,
    limitedSystems,
    missingSystems,
    operatorActions,
    drivers,
    confidence,
    priority,
    explanation,
  };
}

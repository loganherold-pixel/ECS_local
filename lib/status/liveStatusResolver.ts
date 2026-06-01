import type { ECSAIContext } from '../aiContextBuilder';
import type {
  ECSLiveStatus,
  ECSLiveStatusDomain,
  ECSLiveStatusFreshness,
  ECSLiveStatusMap,
  ECSLiveStatusResult,
  ECSLiveStatusSourceType,
} from './liveStatusTypes';

type ResolverInput = {
  liveAvailable?: boolean;
  syncedAvailable?: boolean;
  manualAvailable?: boolean;
  inferredAvailable?: boolean;
  waiting?: boolean;
  stale?: boolean;
  degraded?: boolean;
  offlineCapable?: boolean;
  offlineReason?: string;
  liveReason?: string;
  estimatedReason?: string;
  degradedReason?: string;
  waitingReason?: string;
  unavailableReason?: string;
  freshness?: ECSLiveStatusFreshness;
};

const STATUS_LABELS: Record<ECSLiveStatus, string> = {
  live: 'ECS Live',
  estimated: 'ECS Cached',
  degraded: 'ECS Limited',
  offline_capable: 'ECS Offline Support',
  waiting: 'ECS Syncing Context',
  unavailable: 'Unavailable',
};

function normalizeSignal(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase();
}

function cleanText(value: string | null | undefined): string | undefined {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function createStatus(
  status: ECSLiveStatus,
  sourceType: ECSLiveStatusSourceType,
  reason: string | undefined,
  freshness: ECSLiveStatusFreshness,
  usable: boolean,
): ECSLiveStatusResult {
  return {
    status,
    label: STATUS_LABELS[status],
    shortReason: cleanText(reason),
    sourceType,
    freshness,
    usable,
  };
}

function resolveSourceType(input: ResolverInput): ECSLiveStatusSourceType {
  if (input.liveAvailable) return 'live';
  if (input.syncedAvailable) return 'synced';
  if (input.manualAvailable) return 'manual';
  if (input.inferredAvailable) return 'inferred';
  return 'none';
}

function resolveSharedStatus(input: ResolverInput): ECSLiveStatusResult {
  const sourceType = resolveSourceType(input);
  const freshness = input.freshness ?? 'unknown';
  const fallbackAvailable =
    !!input.syncedAvailable || !!input.manualAvailable || !!input.inferredAvailable;

  if (input.offlineCapable) {
    return createStatus(
      'offline_capable',
      sourceType === 'none' ? 'inferred' : sourceType,
      input.offlineReason,
      freshness,
      true,
    );
  }

  if (input.liveAvailable && !input.stale && !input.degraded) {
    return createStatus('live', 'live', input.liveReason, freshness, true);
  }

  if ((input.liveAvailable || fallbackAvailable) && (input.stale || input.degraded)) {
    return createStatus('degraded', sourceType, input.degradedReason, freshness, true);
  }

  if (fallbackAvailable) {
    return createStatus('estimated', sourceType, input.estimatedReason, freshness, true);
  }

  if (input.waiting) {
    return createStatus('waiting', 'none', input.waitingReason, 'unknown', false);
  }

  return createStatus('unavailable', 'none', input.unavailableReason, 'unknown', false);
}

function mapWeatherFreshness(value: string | null | undefined): ECSLiveStatusFreshness {
  switch (normalizeSignal(value)) {
    case 'FRESH':
      return 'current';
    case 'AGING':
      return 'recent';
    case 'STALE':
    case 'VERY_STALE':
      return 'stale';
    default:
      return 'unknown';
  }
}

function mapProviderFreshness(value: string | null | undefined): ECSLiveStatusFreshness {
  switch (String(value ?? '').trim().toLowerCase()) {
    case 'current':
      return 'current';
    case 'recent':
      return 'recent';
    case 'stale':
      return 'stale';
    default:
      return 'unknown';
  }
}

function gpsIsLive(status: string | null | undefined): boolean {
  const normalized = normalizeSignal(status);
  return normalized === 'ACTIVE' || normalized === 'TRACKING';
}

function gpsIsWaiting(status: string | null | undefined): boolean {
  const normalized = normalizeSignal(status);
  return normalized === 'ACQUIRING' || normalized === 'RETRYING' || normalized === 'INITIALIZING';
}

function gpsIsUnavailable(status: string | null | undefined): boolean {
  const normalized = normalizeSignal(status);
  return normalized === 'OFFLINE' || normalized === 'DENIED' || normalized === 'UNAVAILABLE' || normalized === 'NO_SIGNAL';
}

function telemetryIsLive(status: string | null | undefined, freshness: string | null | undefined): boolean {
  const normalizedStatus = normalizeSignal(status);
  const normalizedFreshness = normalizeSignal(freshness);
  return normalizedStatus === 'LIVE' || normalizedFreshness === 'LIVE' || normalizedStatus === 'LIVE_PROVIDER_CONNECTED';
}

function telemetryIsWaiting(status: string | null | undefined, freshness: string | null | undefined): boolean {
  const normalizedStatus = normalizeSignal(status);
  const normalizedFreshness = normalizeSignal(freshness);
  return normalizedStatus === 'PARTIAL' || normalizedFreshness === 'RECONNECTING' || normalizedStatus === 'WAITING_FOR_PROVIDER';
}

function telemetryIsStale(status: string | null | undefined, freshness: string | null | undefined): boolean {
  const normalizedStatus = normalizeSignal(status);
  const normalizedFreshness = normalizeSignal(freshness);
  return normalizedStatus === 'ATTENTION'
    || normalizedFreshness === 'STALE'
    || normalizedFreshness === 'LAST_KNOWN'
    || normalizedStatus === 'STALE_BUT_USABLE'
    || normalizedStatus === 'TEMPORARILY_DISCONNECTED'
    || normalizedStatus === 'UNAVAILABLE';
}

function telemetryDomainStatusFromProvider(ctx: ECSAIContext): ECSLiveStatusResult | null {
  const providerTelemetry = ctx.resources.providerTelemetry;
  if (!providerTelemetry) return null;

  const freshness = mapProviderFreshness(providerTelemetry.freshness);

  switch (providerTelemetry.state) {
    case 'live_provider_connected':
      return createStatus('live', 'live', providerTelemetry.summary, freshness, true);
    case 'cloud_backed':
      return createStatus(
        providerTelemetry.degraded ? 'degraded' : 'estimated',
        'synced',
        providerTelemetry.summary,
        freshness,
        true,
      );
    case 'manual_baseline':
      return createStatus('estimated', 'manual', providerTelemetry.summary, freshness, true);
    case 'waiting_for_provider':
      return providerTelemetry.usable
        ? createStatus('degraded', providerTelemetry.supportType === 'cloud' ? 'synced' : 'manual', providerTelemetry.summary, freshness, true)
        : createStatus('waiting', 'none', providerTelemetry.summary, freshness, false);
    case 'temporarily_disconnected':
    case 'stale_but_usable':
      return createStatus(
        'degraded',
        providerTelemetry.source === 'manual_baseline'
          ? 'manual'
          : providerTelemetry.source === 'cloud_sync'
            ? 'synced'
            : 'manual',
        providerTelemetry.summary,
        freshness,
        providerTelemetry.usable,
      );
    case 'unsupported':
    case 'unavailable':
    default:
      return createStatus('unavailable', 'none', providerTelemetry.summary, freshness, false);
  }
}

function routeDomainStatus(ctx: ECSAIContext): ECSLiveStatusResult {
  const hasRouteSupport =
    !!ctx.route.activeRoute ||
    !!ctx.route.activeRun ||
    !!ctx.route.routeIntelligence ||
    !!ctx.route.routeContext;
  const gpsStatus = normalizeSignal((ctx.environment.gps as any)?.gpsStatus);
  const offlineMapsReady =
    ctx.storage?.offlineCacheState === 'healthy' ||
    ctx.storage?.offlineCacheState === 'watch';
  const online = ctx.environment.connectivity?.isOnline ?? null;

  return resolveSharedStatus({
    liveAvailable: hasRouteSupport && gpsIsLive(gpsStatus),
    inferredAvailable: hasRouteSupport,
    waiting: hasRouteSupport && gpsIsWaiting(gpsStatus),
    degraded:
      hasRouteSupport &&
      (
        ctx.operations.degraded.state === 'degraded' ||
        ctx.operations.degraded.state === 'limited' ||
        (!gpsIsLive(gpsStatus) && !gpsIsWaiting(gpsStatus) && !gpsIsUnavailable(gpsStatus))
      ),
    offlineCapable:
      hasRouteSupport &&
      gpsIsLive(gpsStatus) &&
      online === false &&
      offlineMapsReady,
    liveReason: 'Active guidance is using current route and positioning data.',
    offlineReason: 'Offline route guidance remains available from cached map and route data.',
    degradedReason: 'Route guidance remains available, but positioning or support data is reduced.',
    estimatedReason: 'Route posture is based on stored route geometry and inferred context.',
    waitingReason: 'Awaiting GPS signal before promoting live route guidance.',
    unavailableReason: 'Route guidance is unavailable until a valid route and position fix are available.',
    freshness: gpsIsLive(gpsStatus) ? 'current' : 'unknown',
  });
}

function weatherDomainStatus(ctx: ECSAIContext): ECSLiveStatusResult {
  const weather = ctx.environment.weather;
  const online = ctx.environment.connectivity?.isOnline ?? null;
  const available = !!weather.current || weather.source !== 'none' || !!weather.response;
  const freshness = mapWeatherFreshness(weather.staleness);
  const stale = freshness === 'stale';
  const liveGps = gpsIsLive((ctx.environment.gps as any)?.gpsStatus);

  return resolveSharedStatus({
    liveAvailable: weather.source === 'live' && available && freshness !== 'stale',
    syncedAvailable: weather.source === 'cache' && available,
    waiting: !available && online !== false && liveGps,
    stale,
    degraded:
      available &&
      (stale || weather.source === 'cache' || ctx.operations.degraded.state === 'degraded'),
    liveReason: 'Weather support is current and route-aware.',
    estimatedReason: weather.source === 'cache'
      ? 'Using recently synced or cached weather support.'
      : 'Weather support is estimated from the latest available refresh.',
    degradedReason: stale
      ? 'Weather support is stale and should be treated as reduced-confidence.'
      : 'Weather support is available, but freshness or connectivity is reduced.',
    waitingReason: 'Awaiting weather refresh for current route context.',
    unavailableReason: 'Weather support is unavailable for current ECS guidance.',
    freshness,
  });
}

function telemetryDomainStatus(ctx: ECSAIContext): ECSLiveStatusResult {
  const providerStatus = telemetryDomainStatusFromProvider(ctx);
  if (providerStatus) {
    return providerStatus;
  }

  const telemetryState = normalizeSignal((ctx.resources.telemetryReadout as any)?.state ?? ctx.summary.telemetryState);
  const authorityFreshness = normalizeSignal(ctx.resources.powerAuthority?.freshness);
  const manualBaselineAvailable =
    !!ctx.mission.snapshot ||
    !!ctx.resources.telemetryConfig ||
    !!ctx.summary.vehicleName;

  return resolveSharedStatus({
    liveAvailable: telemetryIsLive(telemetryState, authorityFreshness),
    manualAvailable: manualBaselineAvailable,
    waiting: telemetryIsWaiting(telemetryState, authorityFreshness),
    stale: telemetryIsStale(telemetryState, authorityFreshness),
    degraded:
      telemetryIsStale(telemetryState, authorityFreshness) ||
      ctx.operations.degraded.degradedSystems.includes('Vehicle telemetry'),
    liveReason: 'Vehicle telemetry is live and current.',
    estimatedReason: 'Using stored vehicle baseline.',
    degradedReason: 'Vehicle telemetry is stale or partially disconnected.',
    waitingReason: manualBaselineAvailable
      ? 'Awaiting vehicle telemetry while stored baseline remains available.'
      : 'Awaiting vehicle telemetry.',
    unavailableReason: 'Vehicle telemetry is unavailable and no stored baseline is available.',
    freshness: telemetryIsLive(telemetryState, authorityFreshness)
      ? 'current'
      : telemetryIsStale(telemetryState, authorityFreshness)
        ? 'stale'
        : 'unknown',
  });
}

function resourcesDomainStatus(
  ctx: ECSAIContext,
  telemetryStatus: ECSLiveStatusResult,
): ECSLiveStatusResult {
  const forecastAvailable = !!ctx.resources.forecast;
  const manualBaselineAvailable = !!ctx.mission.snapshot || !!ctx.resources.telemetryConfig;
  const providerTelemetry = ctx.resources.providerTelemetry;

  return resolveSharedStatus({
    liveAvailable:
      forecastAvailable
      && (
        telemetryStatus.status === 'live'
        || providerTelemetry?.state === 'live_provider_connected'
      ),
    syncedAvailable:
      forecastAvailable
      && providerTelemetry?.source === 'cloud_sync',
    manualAvailable:
      forecastAvailable
      && (
        manualBaselineAvailable
        || providerTelemetry?.source === 'manual_baseline'
      ),
    inferredAvailable: forecastAvailable,
    waiting: !forecastAvailable && telemetryStatus.status === 'waiting',
    stale:
      telemetryStatus.status === 'degraded'
      && telemetryStatus.freshness === 'stale',
    degraded:
      forecastAvailable &&
      (
        telemetryStatus.status === 'degraded' ||
        ctx.operations.degraded.degradedSystems.includes('Resource forecast')
      ),
    offlineCapable:
      forecastAvailable &&
      ctx.operations.degraded.state === 'offline_capable',
    liveReason: 'Resource state is using live provider-backed forecast inputs.',
    offlineReason: 'Resource planning remains available from local route and vehicle data.',
    estimatedReason:
      providerTelemetry?.source === 'cloud_sync'
        ? 'Resource state is using provider-synced values and forecast.'
        : 'Resource state is based on stored vehicle baseline and forecast.',
    degradedReason: 'Resource guidance is available, but live support is reduced.',
    waitingReason: 'Awaiting resource telemetry before promoting live resource status.',
    unavailableReason: 'Resource state is unavailable until a vehicle baseline or telemetry is available.',
    freshness: telemetryStatus.freshness ?? 'unknown',
  });
}

function readinessDomainStatus(
  ctx: ECSAIContext,
  telemetryStatus: ECSLiveStatusResult,
): ECSLiveStatusResult {
  const baselineAvailable =
    !!ctx.summary.vehicleName ||
    !!ctx.mission.snapshot ||
    !!ctx.resources.telemetryConfig ||
    !!ctx.resources.forecast;
  const setupPhase = ctx.phase.current.phase === 'vehicle_setup';

  return resolveSharedStatus({
    liveAvailable: baselineAvailable && telemetryStatus.status === 'live',
    manualAvailable: baselineAvailable,
    waiting: !baselineAvailable && setupPhase,
    degraded: baselineAvailable && setupPhase,
    liveReason: 'Readiness is backed by live vehicle telemetry and stored setup.',
    estimatedReason: 'Readiness is using stored vehicle baseline.',
    degradedReason: 'Readiness is reduced because core vehicle baseline is still incomplete.',
    waitingReason: 'Awaiting baseline vehicle setup before readiness can strengthen.',
    unavailableReason: 'Vehicle readiness is unavailable until a baseline vehicle profile exists.',
    freshness: telemetryStatus.freshness ?? 'unknown',
  });
}

function remotenessDomainStatus(ctx: ECSAIContext): ECSLiveStatusResult {
  const remotenessAvailable = !!ctx.environment.remoteness;
  const gpsStatus = normalizeSignal((ctx.environment.gps as any)?.gpsStatus);

  return resolveSharedStatus({
    liveAvailable: remotenessAvailable && gpsIsLive(gpsStatus),
    inferredAvailable: remotenessAvailable,
    waiting: !remotenessAvailable && gpsIsWaiting(gpsStatus),
    degraded:
      remotenessAvailable &&
      !gpsIsLive(gpsStatus) &&
      !gpsIsWaiting(gpsStatus),
    liveReason: 'Remoteness is using current position context.',
    estimatedReason: 'Remoteness is estimated from the latest available route and position context.',
    degradedReason: 'Remoteness remains available, but live positioning quality is reduced.',
    waitingReason: 'Awaiting location context for remoteness scoring.',
    unavailableReason: 'Remoteness context is unavailable without route or position support.',
    freshness: gpsIsLive(gpsStatus) ? 'current' : 'unknown',
  });
}

function recommendationsDomainStatus(
  ctx: ECSAIContext,
  weatherStatus: ECSLiveStatusResult,
): ECSLiveStatusResult {
  const routeSupport =
    !!ctx.route.routeIntelligence ||
    !!ctx.route.terrainIntelligence ||
    !!ctx.route.routeContext;
  const remoteSupport = !!ctx.environment.remoteness;
  const online = ctx.environment.connectivity?.isOnline ?? null;
  const baselineAvailable = routeSupport || remoteSupport;
  const fullSupport =
    routeSupport &&
    remoteSupport &&
    (weatherStatus.status === 'live' || weatherStatus.status === 'estimated');

  return resolveSharedStatus({
    liveAvailable: fullSupport && weatherStatus.status === 'live' && online !== false,
    syncedAvailable: fullSupport && weatherStatus.status === 'estimated',
    inferredAvailable: baselineAvailable,
    waiting: online !== false && !baselineAvailable,
    degraded:
      baselineAvailable &&
      (
        weatherStatus.status === 'degraded' ||
        ctx.operations.degraded.state === 'degraded' ||
        ctx.operations.degraded.state === 'limited'
      ),
    offlineCapable:
      baselineAvailable &&
      online === false,
    liveReason: 'Recommendations are using current route, weather, and remoteness support.',
    offlineReason: 'Local route data remains usable, but cloud-backed recommendation freshness is reduced.',
    estimatedReason: 'Recommendations are based on partial local route support.',
    degradedReason: 'Recommendation quality is softened by stale or partial support data.',
    waitingReason: 'Awaiting stronger route, weather, or location support.',
    unavailableReason: 'Recommendation support is unavailable without enough route context.',
    freshness: weatherStatus.freshness ?? 'unknown',
  });
}

function overallDomainStatus(
  ctx: ECSAIContext,
  statuses: Omit<ECSLiveStatusMap, 'overall'>,
): ECSLiveStatusResult {
  const operations = ctx.operations.degraded;

  if (operations.state === 'offline_capable') {
    return createStatus(
      'offline_capable',
      'inferred',
      operations.summary || 'Core ECS guidance remains available offline.',
      'recent',
      true,
    );
  }

  if (operations.state === 'unavailable') {
    return createStatus(
      'unavailable',
      'none',
      operations.summary || 'Required ECS inputs are unavailable.',
      'unknown',
      false,
    );
  }

  if (operations.state === 'degraded' || operations.state === 'limited') {
    return createStatus(
      'degraded',
      'inferred',
      operations.summary || 'Some ECS systems are degraded.',
      'recent',
      true,
    );
  }

  if (
    statuses.route.status === 'live' ||
    statuses.telemetry.status === 'live' ||
    statuses.weather.status === 'live'
  ) {
    return createStatus(
      'live',
      'live',
      'Core ECS guidance is using live mission inputs.',
      'current',
      true,
    );
  }

  if (
    statuses.route.status === 'estimated' ||
    statuses.resources.status === 'estimated' ||
    statuses.readiness.status === 'estimated'
  ) {
    return createStatus(
      'estimated',
      'manual',
      'ECS is using stored baselines and partial mission context.',
      'recent',
      true,
    );
  }

  if (
    statuses.route.status === 'waiting' ||
    statuses.weather.status === 'waiting' ||
    statuses.telemetry.status === 'waiting'
  ) {
    return createStatus(
      'waiting',
      'none',
      'ECS is awaiting stronger live signal before promoting status.',
      'unknown',
      false,
    );
  }

  return createStatus(
    'unavailable',
    'none',
    'ECS command status is unavailable until core mission signals come online.',
    'unknown',
    false,
  );
}

export function buildECSLiveStatusMap(ctx: ECSAIContext): ECSLiveStatusMap {
  const route = routeDomainStatus(ctx);
  const weather = weatherDomainStatus(ctx);
  const telemetry = telemetryDomainStatus(ctx);
  const resources = resourcesDomainStatus(ctx, telemetry);
  const readiness = readinessDomainStatus(ctx, telemetry);
  const remoteness = remotenessDomainStatus(ctx);
  const recommendations = recommendationsDomainStatus(ctx, weather);
  const overall = overallDomainStatus(ctx, {
    route,
    weather,
    telemetry,
    resources,
    readiness,
    recommendations,
    remoteness,
  });

  return {
    overall,
    route,
    weather,
    telemetry,
    resources,
    readiness,
    recommendations,
    remoteness,
  };
}

export function selectLiveStatusForSource(
  liveStatus: ECSLiveStatusMap | null | undefined,
  source: string | null | undefined,
): ECSLiveStatusResult | null {
  if (!liveStatus || !source) return liveStatus?.overall ?? null;

  switch (source) {
    case 'route_risk':
    case 'bailout':
      return liveStatus.route;
    case 'route_viability':
      return liveStatus.resources;
    case 'offline_readiness':
      return liveStatus.overall;
    case 'weather':
      return liveStatus.weather;
    case 'telemetry':
    case 'attitude':
      return liveStatus.telemetry;
    case 'resource_status':
      return liveStatus.resources;
    case 'vehicle_assessment':
      return liveStatus.readiness;
    case 'remoteness':
      return liveStatus.remoteness;
    case 'explore':
      return liveStatus.recommendations;
    case 'brief':
    case 'safety':
    case 'sync':
    default:
      return liveStatus.overall;
  }
}

export default buildECSLiveStatusMap;

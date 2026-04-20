// ============================================================
// ECS AI CONTEXT BUILDER
// ============================================================
// Central synthesis layer for ECS AI / Mission Briefing.
// Reads existing ECS stores and engines, then returns one
// normalized, AI-safe context object for downstream briefing.
//
// Design goals:
// - No React hooks
// - Safe null handling everywhere
// - Works with partial data
// - Deterministic output shape
// - Uses existing ECS engines instead of duplicating logic
// - Accepts optional live ECS state overrides so Navigate / Dashboard
//   can provide already-stabilized map, weather, telemetry, and route
//   context instead of forcing this builder to rediscover it.
// ============================================================

import type { MissionExpedition, ExpeditionSnapshot, MissionStats, TelemetryReadout } from './missionTypes';
import { missionExpeditionStore, missionSnapshotStore, missionItemStore, computeMissionStats } from './missionStore';
import type { ExpeditionRecord } from './expeditionStateStore';
import { expeditionStateStore } from './expeditionStateStore';

import type { ImportedRoute } from './routeStore';
import { routeStore } from './routeStore';

import type { ECSRun } from './runStore';
import { runStore } from './runStore';

import type { RouteIntelligence } from './routeAnalysisEngine';
import { routeAnalysisEngine } from './routeAnalysisEngine';

import type { TerrainIntelligence } from './terrainAnalysisEngine';
import { terrainAnalysisEngine } from './terrainAnalysisEngine';

import type { RemotenessOutput } from './remotenessStore';
import { remotenessStore } from './remotenessStore';

import type { DynamicRiskResult, RouteContextStatus, RouteStatus } from './terrainRiskEngine';
import { calculateDynamicRisk, getRiskFlags, getRiskSummary } from './terrainRiskEngine';

import { buildRouteContextStatus } from './routeContextEngine';

import { telemetryConfigStore, computeTelemetryReadout } from './telemetryStore';
import { bluPowerAuthority, type BluAuthoritySnapshot } from './BluPowerAuthority';
import { normalizeBluProviderState } from './blu/providerNormalizationEngine';
import type { ECSNormalizedProviderResult } from './blu/providerNormalizationTypes';

import type {
  ResourceForecast,
  VehicleProfileSnapshot,
  LoadoutTotalsSnapshot,
  TelemetrySnapshot,
  TerrainContext,
  SufficiencyLevel,
} from './resourceForecastEngine';
import { computeResourceForecast, resourceForecastEngine } from './resourceForecastEngine';

import type { GPSUIState } from './gpsUIState';
import { gpsUIState } from './gpsUIState';

import { connectivity } from './connectivity';
import type { ConnectivityDetailedState } from './connectivity';

import type { WeatherResponse, WaypointWeather } from './weatherTypes';
import { fetchWeather, getWeatherStaleness, getWeatherAge } from './weatherStore';
import type { CampIntelStructuredSummary } from './campIntel/campIntelTypes';
import type { CampDecisionState } from './campIntel/campDecisionTypes';
import { connectivityIntelStore } from './connectivityIntelStore';
import { evaluateCacheReadiness } from './offlineCacheAwarenessEngine';
import { assessDegradedOperations } from './ai/degradedOperationsEngine';
import type { ECSDegradedOperationsResult } from './ai/degradedOperationsTypes';
import { inferExpeditionPhase } from './ai/expeditionPhaseEngine';
import type { ECSExpeditionPhaseResult } from './ai/expeditionPhaseTypes';
import { buildECSLiveStatusMap } from './status/liveStatusResolver';
import type { ECSLiveStatusMap } from './status/liveStatusTypes';
import { setupStore } from './setupStore';
import { vehicleSetupStore } from './vehicleSetupStore';

// ============================================================
// TYPES
// ============================================================

export interface ECSAIContextMeta {
  builtAt: string;
  hasActiveExpedition: boolean;
  hasActiveRoute: boolean;
  hasActiveRun: boolean;
  dataCompleteness: number; // 0–100
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  sourceMode?: 'stores' | 'live_bridge' | 'hybrid';
}

export interface ECSAIMissionBlock {
  expedition: MissionExpedition | null;
  expeditionRecord: ExpeditionRecord | null;
  snapshot: ExpeditionSnapshot | null;
  stats: MissionStats | null;
  itemCounts: {
    total: number;
    packed: number;
    missing: number;
    critical: number;
    criticalMissing: number;
  };
}

export interface ECSAIRouteBlock {
  activeRoute: ImportedRoute | null;
  activeRun: ECSRun | null;
  routeStatus: RouteStatus;
  routeIntelligence: RouteIntelligence | null;
  terrainIntelligence: TerrainIntelligence | null;
  campIntel: CampIntelStructuredSummary | null;
  campDecision: CampDecisionState | null;
  routeContext: RouteContextStatus | null;
  progress: {
    totalWaypoints: number;
    currentWaypointIndex: number;
    progressPercent: number;
  };
}

export interface ECSAIEnvironmentBlock {
  remoteness: RemotenessOutput | null;
  connectivity: ConnectivityDetailedState | null;
  gps: GPSUIState;
  weather: {
    current: WaypointWeather | null;
    response: WeatherResponse | null;
    source: 'live' | 'cache' | 'none';
    staleness: 'fresh' | 'aging' | 'stale' | 'very_stale' | 'unknown';
    ageLabel: string | null;
    severity?: 'none' | 'advisory' | 'warning' | 'extreme';
    summaryLabel?: string | null;
  };
}

export interface ECSAIResourcesBlock {
  telemetryReadout: TelemetryReadout | null;
  telemetryConfig: ReturnType<typeof telemetryConfigStore.get> | null;
  forecast: ResourceForecast | null;
  powerAuthority: ECSAIPowerAuthorityBlock | null;
  providerTelemetry: ECSNormalizedProviderResult | null;
}


export interface ECSAIPowerAuthorityBlock {
  available: boolean;
  freshness: string | null;
  provider: string | null;
  providerLabel: string | null;
  deviceLabel: string | null;
  batteryPercent: number | null;
  inputWatts: number | null;
  outputWatts: number | null;
  solarInputWatts: number | null;
  estimatedRuntimeMinutes: number | null;
  estimatedRuntimeHours: number | null;
  capacityWh: number | null;
  lastUpdatedAt: number | null;
  freshnessText: string | null;
}

export interface ECSAIRiskBlock {
  terrainRisk: DynamicRiskResult | null;
  terrainRiskFlags: ReturnType<typeof getRiskFlags> | null;
  terrainRiskSummary: string | null;
}

export interface ECSAIReadinessBlock {
  available: boolean;
  reason: string | null;
}

export interface ECSAINavigationBlock {
  cameraMode: string | null;
  followUser: boolean | null;
  mapExpanded: boolean | null;
  mapStyleMode: string | null;
  replayActive: boolean | null;
  pinDropMode: boolean | null;
}

export interface ECSAIStorageBlock {
  offlineCacheState: 'healthy' | 'watch' | 'warning' | 'critical' | 'unknown';
  storageUsageLabel: string | null;
}

export interface ECSAIOperationsBlock {
  degraded: ECSDegradedOperationsResult;
}

export interface ECSAIPhaseBlock {
  current: ECSExpeditionPhaseResult;
}

export interface ECSAIContext {
  meta: ECSAIContextMeta;
  mission: ECSAIMissionBlock;
  route: ECSAIRouteBlock;
  environment: ECSAIEnvironmentBlock;
  resources: ECSAIResourcesBlock;
  risk: ECSAIRiskBlock;
  readiness: ECSAIReadinessBlock;
  navigation?: ECSAINavigationBlock;
  storage?: ECSAIStorageBlock;
  operations: ECSAIOperationsBlock;
  phase: ECSAIPhaseBlock;
  liveStatus: ECSLiveStatusMap;
  summary: {
    missionName: string | null;
    vehicleName: string | null;
    routeName: string | null;
    remotenessTier: string | null;
    remotenessScore: number | null;
    riskLevel: string | null;
    forecastLevel: string | null;
    telemetryState: string | null;
    gpsStatus: string | null;
    connectivityLevel: string | null;
    weatherLevel?: string | null;
    cameraMode?: string | null;
    operationalState?: string | null;
    operationalSummary?: string | null;
    expeditionPhase?: string | null;
    criticalIssues: string[];
  };
}

export interface ECSAILiveStateBridge {
  builtAt?: string;
  mission?: Partial<ECSAIMissionBlock>;
  route?: Partial<ECSAIRouteBlock>;
  environment?: Partial<ECSAIEnvironmentBlock>;
  resources?: Partial<ECSAIResourcesBlock>;
  risk?: Partial<ECSAIRiskBlock>;
  readiness?: Partial<ECSAIReadinessBlock>;
  navigation?: Partial<ECSAINavigationBlock>;
  storage?: Partial<ECSAIStorageBlock>;
  operations?: Partial<ECSAIOperationsBlock>;
  phase?: Partial<ECSAIPhaseBlock>;
  summary?: Partial<ECSAIContext['summary']>;
  flags?: {
    skipWeatherFetch?: boolean;
  };
}

export interface ECSAIContextBuildOptions {
  liveState?: ECSAILiveStateBridge | null;
  skipWeatherFetch?: boolean;
}

// ============================================================
// PUBLIC API
// ============================================================

export async function buildAIContext(): Promise<ECSAIContext> {
  return buildAIContextFromLiveState(null);
}

export async function buildAIContextFromLiveState(
  liveState: ECSAILiveStateBridge | null = null,
  options: ECSAIContextBuildOptions = {},
): Promise<ECSAIContext> {
  const warnings: string[] = [];
  const live = liveState ?? options.liveState ?? null;

  const storeMissionExpedition = missionExpeditionStore.getActive();
  const storeExpeditionRecord = expeditionStateStore.getCurrentExpedition();
  const effectiveExpeditionId = live?.mission?.expedition?.id
    ?? live?.mission?.expeditionRecord?.id
    ?? storeMissionExpedition?.id
    ?? storeExpeditionRecord?.id
    ?? null;

  const storeSnapshot =
    storeMissionExpedition?.snapshotId
      ? missionSnapshotStore.getById(storeMissionExpedition.snapshotId)
      : effectiveExpeditionId
        ? missionSnapshotStore.getByExpeditionId(effectiveExpeditionId)
        : null;

  const missionExpedition = live?.mission?.expedition ?? storeMissionExpedition ?? null;
  const expeditionRecord = live?.mission?.expeditionRecord ?? storeExpeditionRecord ?? null;
  const snapshot = live?.mission?.snapshot ?? storeSnapshot ?? null;

  const storeItems = effectiveExpeditionId ? missionItemStore.getByExpeditionId(effectiveExpeditionId) : [];
  const storeStats = effectiveExpeditionId ? computeMissionStats(effectiveExpeditionId) : null;
  const mergedItemCounts = normalizeItemCounts(live?.mission?.itemCounts, storeItems);

  const activeRoute = live?.route?.activeRoute ?? routeStore.getActive() ?? null;
  const activeRun = live?.route?.activeRun ?? (runStore.getActive ? runStore.getActive() : null) ?? null;
  const routeIntelligence = live?.route?.routeIntelligence ?? routeAnalysisEngine.getCurrent() ?? null;
  const terrainIntelligence = live?.route?.terrainIntelligence ?? terrainAnalysisEngine.getCurrent() ?? null;

  const storeTotalWaypoints = activeRoute?.waypoints?.length ?? activeRun?.waypoints?.length ?? 0;
  const providedProgress = live?.route?.progress;
  const totalWaypoints = finiteOr(providedProgress?.totalWaypoints, storeTotalWaypoints);
  const currentWaypointIndex = finiteOr(providedProgress?.currentWaypointIndex, 0);
  const progressPercent = finiteOr(
    providedProgress?.progressPercent,
    totalWaypoints > 0
      ? Math.max(0, Math.min(100, (currentWaypointIndex / Math.max(1, totalWaypoints)) * 100))
      : 0,
  );

  const routeContext =
    live?.route?.routeContext ??
    (
      activeRoute || activeRun
        ? buildRouteContextStatus({
            routeId: activeRoute?.id ?? activeRun?.id ?? null,
            totalWaypoints,
            currentWaypointIndex,
            bailoutCount: 0,
            nearestBailoutDistMiles: undefined,
            averageSpeedMph: getAverageSpeedMph(live?.environment?.gps),
          })
        : null
    );

  const routeStatus =
    live?.route?.routeStatus ??
    deriveRouteStatus({
      activeRoute,
      activeRun,
      progressPercent,
      expeditionRecord,
    });

  const remoteness = live?.environment?.remoteness ?? getRemotenessSafe(warnings);
  const gps = live?.environment?.gps ?? gpsUIState.get();
  const connectivityState = live?.environment?.connectivity ?? getConnectivitySafe(warnings);

  const shouldSkipWeatherFetch = !!(options.skipWeatherFetch || live?.flags?.skipWeatherFetch || live?.environment?.weather);
  const weatherBundle = live?.environment?.weather
    ? normalizeWeatherBundle(live.environment.weather)
    : await getWeatherBundle({
        activeRoute,
        activeRun,
        gps,
        warnings,
        skipFetch: shouldSkipWeatherFetch,
      });

  const authoritySnapshot = getBluAuthoritySnapshotSafe();
  const authorityPower = normalizeAuthorityPower(authoritySnapshot);
  const telemetryConfig = live?.resources?.telemetryConfig
    ?? (effectiveExpeditionId ? telemetryConfigStore.get(effectiveExpeditionId) : null);
  const providerTelemetry = normalizeBluProviderState({
    expeditionId: effectiveExpeditionId,
    authoritySnapshot,
    telemetryConfig,
    manualBaselineAvailable:
      !!snapshot ||
      !!telemetryConfig ||
      !!live?.summary?.vehicleName,
  });

  const telemetryReadout = live?.resources?.telemetryReadout
    ?? buildAuthorityTelemetryReadout(authorityPower, providerTelemetry)
    ?? (effectiveExpeditionId ? computeTelemetryReadout(effectiveExpeditionId) : null);

  const forecast = live?.resources?.forecast ?? buildResourceForecastSafe({
    routeIntelligence,
    snapshot,
    telemetryReadout,
    telemetryConfig,
    terrainIntelligence,
    weather: weatherBundle.current,
    warnings,
    authorityPower,
  });

  const terrainRisk = live?.risk?.terrainRisk ?? buildTerrainRiskSafe({
    missionExpedition,
    snapshot,
    remoteness,
    routeStatus,
    routeContext,
    warnings,
  });

  const terrainRiskFlags = live?.risk?.terrainRiskFlags ?? (terrainRisk ? getRiskFlags(terrainRisk) : null);
  const terrainRiskSummary = live?.risk?.terrainRiskSummary ?? (terrainRisk ? getRiskSummary(terrainRisk) : null);

  const readiness: ECSAIReadinessBlock = {
    available: live?.readiness?.available ?? false,
    reason:
      live?.readiness?.reason ??
      'Mission readiness wiring deferred until vehicle weight / bias inputs are bridged into this context builder.',
  };

  const criticalIssues = dedupe([
    ...collectCriticalIssues({
      stats: live?.mission?.stats ?? storeStats,
      telemetryReadout,
      forecast,
      terrainRisk,
      gps,
      connectivityState,
      weather: weatherBundle.current,
      weatherLevel: weatherBundle.severity ?? null,
    }),
    ...(live?.summary?.criticalIssues ?? []),
  ]).slice(0, 6);

  const completeness = computeCompleteness({
    missionExpedition,
    expeditionRecord,
    snapshot,
    activeRoute,
    activeRun,
    routeIntelligence,
    terrainIntelligence,
    remoteness,
    telemetryReadout,
    forecast,
    weather: weatherBundle.current,
  });

  const navigation: ECSAINavigationBlock = {
    cameraMode: live?.navigation?.cameraMode ?? null,
    followUser: live?.navigation?.followUser ?? null,
    mapExpanded: live?.navigation?.mapExpanded ?? null,
    mapStyleMode: live?.navigation?.mapStyleMode ?? null,
    replayActive: live?.navigation?.replayActive ?? null,
    pinDropMode: live?.navigation?.pinDropMode ?? null,
  };

  const connectivitySummary = connectivityIntelStore.getSummary();
  const cacheSnapshot = evaluateCacheReadiness();

  const storage: ECSAIStorageBlock = {
    offlineCacheState:
      live?.storage?.offlineCacheState
      ?? deriveOfflineCacheState(connectivitySummary, cacheSnapshot),
    storageUsageLabel:
      live?.storage?.storageUsageLabel
      ?? deriveOfflineCacheUsageLabel(cacheSnapshot),
  };

  const operations: ECSAIOperationsBlock = {
    degraded:
      live?.operations?.degraded
      ?? assessDegradedOperations({
        hasActiveRoute: !!activeRoute || !!activeRun,
        routeGuidanceRequested: !!activeRoute || !!activeRun,
        hasRouteGeometry: !!activeRoute || !!routeIntelligence || !!routeContext,
        offlineCacheState: storage.offlineCacheState,
        gpsStatus: (gps as any)?.gpsStatus ?? null,
        connectivityLevel: (connectivityState as any)?.level ?? null,
        connectivityOnline: connectivityState?.isOnline ?? null,
        weatherAvailable: !!weatherBundle.current || weatherBundle.source !== 'none',
        weatherStaleness: weatherBundle.staleness,
        telemetryAvailable: !!telemetryReadout,
        telemetryState:
          providerTelemetry?.legacyTelemetryState
          ?? (telemetryReadout as any)?.state
          ?? authorityPower?.freshness
          ?? null,
        bleConnected:
          providerTelemetry
            ? providerTelemetry.source === 'live_provider'
              && (
                providerTelemetry.supportType === 'ble'
                || providerTelemetry.supportType === 'hybrid'
                || providerTelemetry.supportType === 'wifi'
              )
            : authorityPower?.available ?? null,
        manualBaselineAvailable: !!snapshot || !!telemetryConfig,
        routeIntelligenceAvailable: !!routeIntelligence,
        terrainIntelligenceAvailable: !!terrainIntelligence,
        routeRiskAvailable: !!terrainRisk,
        remotenessAvailable: !!remoteness,
        forecastAvailable: !!forecast,
        cloudDependentRecommendations: true,
      }),
  };

  const phase: ECSAIPhaseBlock = {
    current:
      live?.phase?.current
      ?? inferExpeditionPhase({
        setupComplete: setupStore.isComplete(),
        hasActiveVehicle: !!vehicleSetupStore.getActiveVehicleId() || !!missionExpedition?.vehicleId || !!expeditionRecord?.activeVehicleId,
        hasActiveExpedition: !!missionExpedition || !!expeditionRecord,
        expeditionState: expeditionRecord?.state ?? missionExpedition?.status ?? null,
        hasSelectedRoute: !!activeRoute || !!activeRun,
        hasActiveGuidance: !!activeRoute || !!activeRun,
        routeStatus,
        progressPercent,
        speedMph: getAverageSpeedMph(gps) ?? null,
        remotenessScore: typeof (remoteness as any)?.score === 'number' ? (remoteness as any).score : null,
        bailoutAvailable: routeContext?.bailoutAvailable ?? null,
        campRecommended:
          !!live?.route?.campDecision?.available
          && (
            live?.route?.campDecision?.campRecommendationType === 'stop_now'
            || live?.route?.campDecision?.campRecommendationType === 'do_not_pass_current_high_confidence_camp'
            || live?.route?.campDecision?.campRecommendationType === 'use_emergency_overnight_option'
          ),
      }),
  };

  const sourceMode: ECSAIContextMeta['sourceMode'] =
    live
      ? (options.skipWeatherFetch || live.flags?.skipWeatherFetch ? 'live_bridge' : 'hybrid')
      : 'stores';

  const contextBase = {
    meta: {
      builtAt: live?.builtAt ?? new Date().toISOString(),
      hasActiveExpedition: !!missionExpedition || !!expeditionRecord,
      hasActiveRoute: !!activeRoute,
      hasActiveRun: !!activeRun,
      dataCompleteness: completeness,
      confidence: classifyConfidence(completeness),
      warnings,
      sourceMode,
    },

    mission: {
      expedition: missionExpedition,
      expeditionRecord,
      snapshot,
      stats: live?.mission?.stats ?? storeStats,
      itemCounts: mergedItemCounts,
    },

    route: {
      activeRoute,
      activeRun,
      routeStatus,
      routeIntelligence,
      terrainIntelligence,
      campIntel: live?.route?.campIntel ?? null,
      campDecision: live?.route?.campDecision ?? null,
      routeContext,
      progress: {
        totalWaypoints,
        currentWaypointIndex,
        progressPercent,
      },
    },

    environment: {
      remoteness,
      connectivity: connectivityState,
      gps,
      weather: weatherBundle,
    },

    resources: {
      telemetryReadout,
      telemetryConfig,
      forecast,
      powerAuthority: authorityPower,
      providerTelemetry,
    },

    risk: {
      terrainRisk,
      terrainRiskFlags,
      terrainRiskSummary,
    },

    readiness,
    navigation,
    storage,
    operations,
    phase,

    summary: {
      missionName: live?.summary?.missionName ?? missionExpedition?.name ?? expeditionRecord?.vehicleName ?? null,
      vehicleName:
        live?.summary?.vehicleName
        ?? missionExpedition?.vehicleName
        ?? expeditionRecord?.vehicleName
        ?? (snapshot as any)?.snapshotJson?.vehicle?.name
        ?? null,
      routeName: live?.summary?.routeName ?? (routeIntelligence as any)?.routeName ?? activeRoute?.name ?? activeRun?.title ?? null,
      remotenessTier: live?.summary?.remotenessTier ?? (remoteness as any)?.tier ?? null,
      remotenessScore: live?.summary?.remotenessScore ?? (typeof (remoteness as any)?.score === 'number' ? (remoteness as any).score : null),
      riskLevel: live?.summary?.riskLevel ?? (terrainRisk as any)?.riskLevel ?? null,
      forecastLevel: live?.summary?.forecastLevel ?? (forecast as any)?.sufficiencyLevel ?? null,
      telemetryState:
        providerTelemetry?.legacyTelemetryState
        ?? live?.summary?.telemetryState
        ?? (telemetryReadout as any)?.state
        ?? authorityPower?.freshness
        ?? null,
      gpsStatus: live?.summary?.gpsStatus ?? (gps as any)?.gpsStatus ?? null,
      connectivityLevel: live?.summary?.connectivityLevel ?? (connectivityState as any)?.level ?? null,
      weatherLevel: live?.summary?.weatherLevel ?? weatherBundle.severity ?? null,
      cameraMode: live?.summary?.cameraMode ?? navigation.cameraMode ?? null,
      operationalState: live?.summary?.operationalState ?? operations.degraded.shortLabel ?? null,
      operationalSummary: live?.summary?.operationalSummary ?? operations.degraded.summary ?? null,
      expeditionPhase: live?.summary?.expeditionPhase ?? phase.current.label ?? null,
      criticalIssues,
    },
  };

  const liveStatus = buildECSLiveStatusMap(contextBase as ECSAIContext);

  return {
    ...contextBase,
    liveStatus,
  };
}

export function summarizeAIContext(ctx: ECSAIContext): string {
  const parts = [
    ctx.summary.missionName ? `Mission ${ctx.summary.missionName}` : null,
    ctx.summary.routeName ? `route ${ctx.summary.routeName}` : null,
    ctx.summary.weatherLevel ? `weather ${ctx.summary.weatherLevel}` : null,
    ctx.summary.forecastLevel ? `forecast ${shortForecastLabel(ctx.summary.forecastLevel as SufficiencyLevel | null | undefined)}` : null,
    ctx.summary.telemetryState ? `telemetry ${ctx.summary.telemetryState}` : null,
    ctx.summary.remotenessTier ? `remoteness ${ctx.summary.remotenessTier}` : null,
    ctx.summary.operationalState ? `ops ${ctx.summary.operationalState}` : null,
    ctx.summary.expeditionPhase ? `phase ${ctx.summary.expeditionPhase}` : null,
  ].filter(Boolean);

  return parts.length > 0
    ? parts.join(' • ')
    : 'AI context available with partial mission inputs.';
}

// ============================================================
// HELPERS
// ============================================================

function deriveRouteStatus(params: {
  activeRoute: ImportedRoute | null;
  activeRun: ECSRun | null;
  progressPercent: number;
  expeditionRecord: ExpeditionRecord | null;
}): RouteStatus {
  const { activeRoute, activeRun, progressPercent, expeditionRecord } = params;

  if (!activeRoute && !activeRun) return 'not_started';
  if ((expeditionRecord as any)?.state === 'paused') return 'paused';
  if (progressPercent >= 90) return 'near_completion';
  if (activeRoute || activeRun) return 'in_progress';
  return 'unknown';
}

function getAverageSpeedMph(gps?: GPSUIState | null): number | undefined {
  const state = gps ?? gpsUIState.get();
  const speed = Number((state as any)?.position?.speedMph ?? (state as any)?.position?.speed ?? NaN);
  return Number.isFinite(speed) && speed > 0 ? speed : undefined;
}

function getRemotenessSafe(warnings: string[]): RemotenessOutput | null {
  try {
    const index = (remotenessStore as any).getIndex?.();
    if (index && typeof index === 'object') {
      const legacy = (remotenessStore as any).get?.();
      return legacy ?? index;
    }

    const legacy = (remotenessStore as any).get?.();
    return legacy ?? null;
  } catch (err: any) {
    warnings.push(`Remoteness unavailable: ${err?.message || 'unknown error'}`);
    return null;
  }
}

function getConnectivitySafe(warnings: string[]): ConnectivityDetailedState | null {
  try {
    return connectivity.getDetailedState();
  } catch (err: any) {
    warnings.push(`Connectivity detail unavailable: ${err?.message || 'unknown error'}`);
    return null;
  }
}

async function getWeatherBundle(params: {
  activeRoute: ImportedRoute | null;
  activeRun: ECSRun | null;
  gps: GPSUIState;
  warnings: string[];
  skipFetch?: boolean;
}): Promise<ECSAIContext['environment']['weather']> {
  const { activeRoute, activeRun, gps, warnings, skipFetch } = params;

  const coord = pickPrimaryWeatherCoordinate(activeRoute, activeRun, gps);

  if (!coord || skipFetch) {
    return {
      current: null,
      response: null,
      source: 'none',
      staleness: 'unknown',
      ageLabel: null,
      severity: 'none',
      summaryLabel: null,
    };
  }

  try {
    const response = await fetchWeather([coord], 'imperial');
    const current = response?.results?.[0] ?? null;
    const fetchedAtMs = response?.fetched_at ? new Date(response.fetched_at).getTime() : NaN;
    const hasFetchedAt = Number.isFinite(fetchedAtMs);

    const severity = classifyWeatherSeverity(current);
    return {
      current,
      response,
      source: 'live',
      staleness: hasFetchedAt ? getWeatherStaleness(fetchedAtMs) : 'unknown',
      ageLabel: hasFetchedAt ? getWeatherAge(fetchedAtMs) : null,
      severity,
      summaryLabel: severity === 'none' ? null : `WX ${severity.toUpperCase()}`,
    };
  } catch (err: any) {
    warnings.push(`Weather unavailable: ${err?.message || 'unknown error'}`);
    return {
      current: null,
      response: null,
      source: 'none',
      staleness: 'unknown',
      ageLabel: null,
      severity: 'none',
      summaryLabel: null,
    };
  }
}

function normalizeWeatherBundle(
  weather: Partial<ECSAIEnvironmentBlock['weather']> | null | undefined,
): ECSAIEnvironmentBlock['weather'] {
  const current = weather?.current ?? null;
  const severity = (weather?.severity ?? classifyWeatherSeverity(current)) as ECSAIEnvironmentBlock['weather']['severity'];

  return {
    current,
    response: weather?.response ?? null,
    source: weather?.source ?? (current ? 'live' : 'none'),
    staleness: weather?.staleness ?? 'unknown',
    ageLabel: weather?.ageLabel ?? null,
    severity,
    summaryLabel: weather?.summaryLabel ?? (severity && severity !== 'none' ? `WX ${severity.toUpperCase()}` : null),
  };
}

function classifyWeatherSeverity(weather: WaypointWeather | null): 'none' | 'advisory' | 'warning' | 'extreme' {
  if (!weather) return 'none';

  const alerts = Array.isArray((weather as any)?.alerts) ? (weather as any).alerts : [];
  if (alerts.some((a: any) => a?.severity === 'extreme')) return 'extreme';
  if (alerts.some((a: any) => a?.severity === 'warning')) return 'warning';
  if (alerts.some((a: any) => a?.severity === 'advisory')) return 'advisory';

  const wind = safeNumber((weather as any)?.current?.wind_speed ?? (weather as any)?.wind_speed);
  const visibility = safeNumber((weather as any)?.current?.visibility ?? (weather as any)?.visibility, 10000);
  const main = String((weather as any)?.current?.weather_main ?? (weather as any)?.weather_main ?? '').toLowerCase();

  if (wind >= 40 || (visibility > 0 && visibility <= 500)) return 'extreme';
  if (wind >= 25 || (visibility > 0 && visibility <= 1600) || main.includes('thunderstorm') || main.includes('snow')) return 'warning';
  if (wind >= 15 || (visibility > 0 && visibility <= 5000) || main.includes('rain') || main.includes('fog') || main.includes('mist') || main.includes('haze')) return 'advisory';

  return 'none';
}

function pickPrimaryWeatherCoordinate(
  activeRoute: ImportedRoute | null,
  activeRun: ECSRun | null,
  gps: GPSUIState,
): { lat: number; lng: number; label?: string } | null {
  const gpsLat = Number((gps as any)?.position?.latitude);
  const gpsLng = Number((gps as any)?.position?.longitude);

  if (Number.isFinite(gpsLat) && Number.isFinite(gpsLng)) {
    return { lat: gpsLat, lng: gpsLng, label: 'Current Position' };
  }

  const routePoint = (activeRoute as any)?.segments?.[0]?.points?.[0];
  if (routePoint) {
    return { lat: routePoint.lat, lng: routePoint.lon, label: (activeRoute as any)?.name ?? 'Active Route' };
  }

  const runPoint = (activeRun as any)?.points?.[0];
  if (runPoint) {
    return { lat: runPoint.lat, lng: runPoint.lng, label: (activeRun as any)?.title ?? 'Active Run' };
  }

  return null;
}


function getBluAuthoritySnapshotSafe(): BluAuthoritySnapshot | null {
  try {
    return bluPowerAuthority.getSnapshot();
  } catch {
    return null;
  }
}

function normalizeAuthorityPower(snapshot: BluAuthoritySnapshot | null): ECSAIPowerAuthorityBlock | null {
  if (!snapshot) return null;
  if (!snapshot.hasPowerData && !snapshot.primaryDevice && snapshot.freshness === 'disconnected') return null;

  return {
    available: snapshot.hasPowerData || !!snapshot.primaryDevice,
    freshness: snapshot.freshness ?? null,
    provider: snapshot.activeProvider ?? null,
    providerLabel: snapshot.providerLabel ?? null,
    deviceLabel: snapshot.deviceLabel ?? null,
    batteryPercent: finiteNumber(snapshot.batteryPercent),
    inputWatts: finiteNumber(snapshot.inputWatts),
    outputWatts: finiteNumber(snapshot.outputWatts),
    solarInputWatts: finiteNumber(snapshot.solarInputWatts),
    estimatedRuntimeMinutes: finiteNumber(snapshot.estimatedRuntimeMinutes),
    estimatedRuntimeHours:
      finiteNumber(snapshot.estimatedRuntimeMinutes) != null
        ? Number((Number(snapshot.estimatedRuntimeMinutes) / 60).toFixed(1))
        : null,
    capacityWh: finiteNumber(snapshot.capacityWh),
    lastUpdatedAt: finiteNumber(snapshot.lastUpdatedAt),
    freshnessText: snapshot.freshnessText ?? null,
  };
}

function buildAuthorityTelemetryReadout(
  authorityPower: ECSAIPowerAuthorityBlock | null,
  providerTelemetry?: ECSNormalizedProviderResult | null,
): TelemetryReadout | null {
  if (!authorityPower?.available) return null;

  const state =
    providerTelemetry?.legacyTelemetryState
    ?? (
      authorityPower.freshness === 'live'
        ? 'LIVE'
        : authorityPower.freshness === 'reconnecting'
          ? 'PARTIAL'
          : authorityPower.freshness === 'stale' || authorityPower.freshness === 'last_known'
            ? 'ATTENTION'
            : 'PARTIAL'
    );

  const criticals: string[] = [];
  if (authorityPower.batteryPercent != null && authorityPower.batteryPercent <= 15) {
    criticals.push(`House power critically low at ${Math.round(authorityPower.batteryPercent)}%.`);
  }
  if (authorityPower.freshness === 'stale') {
    criticals.push('Shared power telemetry is stale.');
  }

  return {
    state,
    criticals,
    powerPercent: authorityPower.batteryPercent,
    powerAvgDrawW: authorityPower.outputWatts,
    powerEstHours: authorityPower.estimatedRuntimeHours,
  } as any;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildResourceForecastSafe(params: {
  routeIntelligence: RouteIntelligence | null;
  snapshot: ExpeditionSnapshot | null;
  telemetryReadout: TelemetryReadout | null;
  telemetryConfig: ReturnType<typeof telemetryConfigStore.get> | null;
  terrainIntelligence: TerrainIntelligence | null;
  weather: WaypointWeather | null;
  warnings: string[];
  authorityPower?: ECSAIPowerAuthorityBlock | null;
}): ResourceForecast | null {
  const {
    routeIntelligence,
    snapshot,
    telemetryReadout,
    telemetryConfig,
    terrainIntelligence,
    weather,
    warnings,
    authorityPower,
  } = params;

  if (!routeIntelligence) return resourceForecastEngine.getCurrent();

  try {
    const vehicleProfile = buildVehicleProfileSnapshot(snapshot, telemetryConfig);
    const loadoutTotals = buildLoadoutTotalsSnapshot(snapshot);
    const telemetry = buildTelemetrySnapshot(telemetryReadout, telemetryConfig, authorityPower);
    const terrain = buildTerrainContext(terrainIntelligence, routeIntelligence, weather);

    return computeResourceForecast(
      routeIntelligence,
      vehicleProfile,
      loadoutTotals,
      telemetry,
      terrain,
    );
  } catch (err: any) {
    warnings.push(`Resource forecast build failed: ${err?.message || 'unknown error'}`);
    return resourceForecastEngine.getCurrent();
  }
}

function buildVehicleProfileSnapshot(
  snapshot: ExpeditionSnapshot | null,
  telemetryConfig: ReturnType<typeof telemetryConfigStore.get> | null,
): VehicleProfileSnapshot | null {
  if (!snapshot && !telemetryConfig) return null;

  const totalWeightLbs = sumSnapshotWeight(snapshot);
  return {
    fuelCapacityGallons: (telemetryConfig as any)?.fuelCapacityGal ?? null,
    currentFuelPercent: percent((telemetryConfig as any)?.fuelRemainingGal, (telemetryConfig as any)?.fuelCapacityGal),
    avgMpg: (telemetryConfig as any)?.fuelMpg ?? null,
    totalWeightLbs,
    curbWeightLbs: null,
  };
}

function buildLoadoutTotalsSnapshot(snapshot: ExpeditionSnapshot | null): LoadoutTotalsSnapshot | null {
  if (!snapshot) return null;

  return {
    waterGallons: null,
    fuelGallons: null,
    totalCargoWeightLbs: sumSnapshotWeight(snapshot),
    peopleCount: (snapshot as any).snapshotJson?.profile?.peopleCount ?? null,
    waterGallonsPerPersonPerDay: null,
  };
}

function buildTelemetrySnapshot(
  telemetryReadout: TelemetryReadout | null,
  telemetryConfig: ReturnType<typeof telemetryConfigStore.get> | null,
  authorityPower?: ECSAIPowerAuthorityBlock | null,
): TelemetrySnapshot | null {
  if (!telemetryReadout && !telemetryConfig && !authorityPower) return null;

  return {
    batterySocPercent: authorityPower?.batteryPercent ?? (telemetryReadout as any)?.powerPercent ?? null,
    batteryCapacityWh: authorityPower?.capacityWh ?? (telemetryConfig as any)?.powerCapacityWh ?? null,
    avgDrawWatts: authorityPower?.outputWatts ?? (telemetryReadout as any)?.powerAvgDrawW ?? (telemetryConfig as any)?.powerAvgDrawW ?? null,
    estimatedRuntimeHours: authorityPower?.estimatedRuntimeHours ?? (telemetryReadout as any)?.powerEstHours ?? null,
    solarInputWatts: authorityPower?.solarInputWatts ?? null,
    sunHoursPerDay: null,
  };
}

function buildTerrainContext(
  terrainIntelligence: TerrainIntelligence | null,
  routeIntelligence: RouteIntelligence | null,
  weather: WaypointWeather | null,
): TerrainContext | null {
  if (!terrainIntelligence && !routeIntelligence && !weather) return null;

  const temp = (weather as any)?.current?.temp ?? (weather as any)?.temp ?? null;

  return {
    difficulty: (routeIntelligence as any)?.overallDifficulty ?? null,
    isOffRoad: (routeIntelligence as any)?.overallDifficulty
      ? (routeIntelligence as any).overallDifficulty !== 'easy'
      : undefined,
    elevationGainFeet: (routeIntelligence as any)?.elevationGainFeet ?? null,
    isHotWeather: typeof temp === 'number' ? temp >= 90 : undefined,
    isColdWeather: typeof temp === 'number' ? temp <= 32 : undefined,
  };
}

function buildTerrainRiskSafe(params: {
  missionExpedition: MissionExpedition | null;
  snapshot: ExpeditionSnapshot | null;
  remoteness: RemotenessOutput | null;
  routeStatus: RouteStatus;
  routeContext: RouteContextStatus | null;
  warnings: string[];
}): DynamicRiskResult | null {
  const { missionExpedition, snapshot, remoteness, routeStatus, routeContext, warnings } = params;

  const terrainProfile = (missionExpedition as any)?.terrainProfile;
  if (!terrainProfile) return null;

  try {
    return calculateDynamicRisk({
      terrainProfile,
      gvwrPercent: deriveGvwrPercent(snapshot),
      roofLoadPercent: deriveRoofLoadPercent(snapshot),
      rearBiasPercent: deriveRearBiasPercent(snapshot),
      remotenessScore: (remoteness as any)?.score ?? 25,
      routeStatus,
      routeContext: routeContext ?? undefined,
    });
  } catch (err: any) {
    warnings.push(`Terrain risk unavailable: ${err?.message || 'unknown error'}`);
    return null;
  }
}

function deriveGvwrPercent(snapshot: ExpeditionSnapshot | null): number {
  const totalWeight = sumSnapshotWeight(snapshot);
  if (!totalWeight) return 0;
  return 70;
}

function deriveRoofLoadPercent(snapshot: ExpeditionSnapshot | null): number {
  if (!snapshot) return 0;

  const items = (snapshot as any).snapshotJson?.items ?? [];
  const roofish = items
    .filter((item: any) => {
      const loc = String(item.storageLocation ?? '').toLowerCase();
      return loc.includes('roof');
    })
    .reduce((sum: number, item: any) => sum + safeNumber(item.weightLbs), 0);

  const total = sumSnapshotWeight(snapshot);
  if (total <= 0) return 0;
  return round1((roofish / total) * 100);
}

function deriveRearBiasPercent(snapshot: ExpeditionSnapshot | null): number {
  if (!snapshot) return 50;

  const items = (snapshot as any).snapshotJson?.items ?? [];
  const rearish = items
    .filter((item: any) => {
      const loc = String(item.storageLocation ?? '').toLowerCase();
      return loc.includes('rear') || loc.includes('bed') || loc.includes('cargo') || loc.includes('tail');
    })
    .reduce((sum: number, item: any) => sum + safeNumber(item.weightLbs), 0);

  const total = sumSnapshotWeight(snapshot);
  if (total <= 0) return 50;
  return round1(50 + (rearish / total) * 50);
}

function collectCriticalIssues(params: {
  stats: MissionStats | null;
  telemetryReadout: TelemetryReadout | null;
  forecast: ResourceForecast | null;
  terrainRisk: DynamicRiskResult | null;
  gps: GPSUIState;
  connectivityState: ConnectivityDetailedState | null;
  weather: WaypointWeather | null;
  weatherLevel?: string | null;
}): string[] {
  const { stats, telemetryReadout, forecast, terrainRisk, gps, connectivityState, weather, weatherLevel } = params;
  const issues: string[] = [];

  if (((stats as any)?.criticalMissing ?? 0) > 0) {
    const count = (stats as any)?.criticalMissing;
    issues.push(`${count} critical loadout item${count === 1 ? '' : 's'} missing`);
  }

  if (Array.isArray((telemetryReadout as any)?.criticals) && (telemetryReadout as any).criticals.length) {
    issues.push(...(telemetryReadout as any).criticals.slice(0, 2));
  }

  if ((forecast as any)?.sufficiencyLevel === 'Resources Insufficient') {
    issues.push('Resources projected to fall short');
  } else if ((forecast as any)?.sufficiencyLevel === 'Resources Limited') {
    issues.push('Resource margins are tight');
  }

  if ((terrainRisk as any)?.riskLevel === 'critical') {
    issues.push('Terrain risk is critical');
  } else if ((terrainRisk as any)?.riskLevel === 'high') {
    issues.push('Terrain risk is elevated');
  }

  const gpsStatus = String((gps as any)?.gpsStatus ?? '').toUpperCase();
  if (gpsStatus === 'OFFLINE' || gpsStatus === 'UNAVAILABLE' || gpsStatus === 'DENIED') {
    issues.push('GPS unavailable');
  }

  if ((connectivityState as any)?.level === 'no_service') {
    issues.push('No connectivity service');
  }

  const alerts = Array.isArray((weather as any)?.alerts) ? (weather as any).alerts : [];
  const severeAlert = alerts.find((a: any) => a?.severity === 'extreme' || a?.severity === 'warning');
  if (severeAlert?.title) {
    issues.push(severeAlert.title);
  } else if (weatherLevel === 'extreme' || weatherLevel === 'warning') {
    issues.push(`Weather is ${weatherLevel}`);
  }

  return dedupe(issues).slice(0, 6);
}

function computeCompleteness(parts: Record<string, any>): number {
  const checks = [
    !!parts.missionExpedition,
    !!parts.expeditionRecord,
    !!parts.snapshot,
    !!parts.activeRoute || !!parts.activeRun,
    !!parts.routeIntelligence,
    !!parts.terrainIntelligence,
    !!parts.remoteness,
    !!parts.telemetryReadout,
    !!parts.forecast,
    !!parts.weather,
  ];

  const hits = checks.filter(Boolean).length;
  return Math.round((hits / checks.length) * 100);
}

function deriveOfflineCacheState(
  summary: import('./connectivityIntelTypes').ConnectivitySummary,
  snapshot: import('./offlineCacheAwarenessEngine').CacheReadinessSnapshot,
): ECSAIStorageBlock['offlineCacheState'] {
  const routeCoverage =
    snapshot.cached_route_available || snapshot.expedition_data_covers_route;
  const areaCoverage =
    snapshot.cached_region_available
    || snapshot.expedition_data_covers_position
    || summary.cached_region_available;
  const anyCache =
    snapshot.offline_cache_ready
    || snapshot.expedition_data_cached
    || summary.offline_cache_ready;

  if (routeCoverage || (areaCoverage && anyCache)) {
    return 'healthy';
  }

  if (anyCache) {
    return 'watch';
  }

  if (
    summary.connectivity_state === 'offline'
    || summary.operational_readiness === 'offline_unprepared'
  ) {
    return 'critical';
  }

  if (
    summary.connectivity_state === 'degraded'
    || summary.connectivity_state === 'limited'
    || summary.operational_readiness === 'degraded_unprepared'
  ) {
    return 'warning';
  }

  return 'unknown';
}

function deriveOfflineCacheUsageLabel(
  snapshot: import('./offlineCacheAwarenessEngine').CacheReadinessSnapshot,
): string | null {
  const parts: string[] = [];

  if (snapshot.cached_region_count > 0) {
    parts.push(`${snapshot.cached_region_count} map region${snapshot.cached_region_count === 1 ? '' : 's'}`);
  }

  if (snapshot.expedition_data_regions > 0) {
    parts.push(`${snapshot.expedition_data_regions} expedition dataset${snapshot.expedition_data_regions === 1 ? '' : 's'}`);
  }

  if (snapshot.cached_size_mb > 0) {
    parts.push(`${Math.round(snapshot.cached_size_mb)} MB cached`);
  }

  return parts.length > 0 ? parts.join(' • ') : null;
}

function classifyConfidence(score: number): 'high' | 'medium' | 'low' {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function sumSnapshotWeight(snapshot: ExpeditionSnapshot | null): number {
  if (!(snapshot as any)?.snapshotJson?.items?.length) return 0;
  return round1(
    (snapshot as any).snapshotJson.items.reduce((sum: number, item: any) => sum + safeNumber(item.weightLbs), 0)
  );
}

function percent(current: number | null | undefined, total: number | null | undefined): number | null {
  if (!isFiniteNumber(current) || !isFiniteNumber(total) || total <= 0) return null;
  return round1((current / total) * 100);
}

function normalizeItemCounts(
  provided: Partial<ECSAIMissionBlock['itemCounts']> | undefined,
  storeItems: any[],
): ECSAIMissionBlock['itemCounts'] {
  return {
    total: finiteOr(provided?.total, storeItems.length),
    packed: finiteOr(provided?.packed, storeItems.filter((i: any) => i?.status === 'packed').length),
    missing: finiteOr(provided?.missing, storeItems.filter((i: any) => i?.status === 'missing').length),
    critical: finiteOr(provided?.critical, storeItems.filter((i: any) => !!i?.critical).length),
    criticalMissing: finiteOr(
      provided?.criticalMissing,
      storeItems.filter((i: any) => !!i?.critical && i?.status === 'missing').length,
    ),
  };
}

function finiteOr(value: any, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeNumber(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isFiniteNumber(value: any): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function shortForecastLabel(value?: SufficiencyLevel | null): string {
  switch (value) {
    case 'Resources Insufficient': return 'INSUFFICIENT';
    case 'Resources Limited': return 'LIMITED';
    case 'Watch Consumption': return 'WATCH';
    case 'Stable': return 'STABLE';
    default: return 'UNKNOWN';
  }
}

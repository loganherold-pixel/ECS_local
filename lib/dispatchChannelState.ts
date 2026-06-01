import {
  normalizeDispatchEvent,
  type DispatchEvent,
  type DispatchEventSeverity,
  type DispatchEventSource,
  type DispatchEventType,
  type DispatchLiveSourceState,
} from './dispatchLiveEvents';
import { getSharedOperationalWeatherState, subscribeSharedOperationalWeather } from './useOperationalWeather';
import { routeAnalysisEngine } from './routeAnalysisEngine';
import { terrainAnalysisEngine } from './terrainAnalysisEngine';
import { resourceForecastEngine } from './resourceForecastEngine';
import { connectivity } from './connectivity';
import { resolveCanonicalConnectivityState } from './connectivityState';
import {
  navigateRouteSessionStore,
  type NavigateRouteMapPoint,
  type NavigateRouteSessionSnapshot,
} from './navigateRouteSessionStore';
import { routeStore, type ImportedRoute, type RouteSegment } from './routeStore';
import {
  buildTerrainRiskCommandRoute,
  formatTerrainRiskLabel,
  type TerrainRiskRoute,
  type TerrainRiskRoutePoint,
  type TerrainRiskRouteSegment,
} from './terrainRiskCommandProfile';
import { vehicleTelemetryStore } from '../src/vehicle-telemetry/VehicleTelemetryStore';
import type { LiveDispatchEventInput } from './dispatchLiveAggregator';
import type { TeamStoreSnapshot } from './teamStore';

export type DispatchChannelId =
  | 'weather'
  | 'route'
  | 'terrain'
  | 'vehicle'
  | 'resources'
  | 'sync';

export type DispatchChannelSnapshot = {
  id: DispatchChannelId;
  label: string;
  statusLabel: string;
  detail: string;
  actionLabel: string;
  sourceLabel: string;
  sourceState: DispatchLiveSourceState;
  severity: DispatchEventSeverity;
  eventType: DispatchEventType;
  eventSource: DispatchEventSource;
  updatedAt: string | null;
};

type DispatchChannelContext = {
  queuedCount: number;
  dirtyCount?: number;
  syncStatus?: string;
  isOnline: boolean;
  offlineMode: boolean;
};

const CHANNEL_ACTION: Record<DispatchChannelId, string> = {
  weather: 'Ping Weather Threat',
  route: 'Report Route Issue',
  terrain: 'Mark Hazard',
  vehicle: 'Request Check',
  resources: 'Request Supply',
  sync: 'Sync Dispatch',
};

const METERS_TO_MILES = 0.000621371;
const EARTH_RADIUS_MI = 3958.8;

function nowIso(): string {
  return new Date().toISOString();
}

function titleCase(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function severityFromWeather(value: string | null | undefined): DispatchEventSeverity {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('extreme') || normalized.includes('critical') || normalized.includes('severe')) {
    return 'critical';
  }
  if (normalized.includes('warning') || normalized.includes('watch')) {
    return 'warning';
  }
  if (normalized.includes('advisory') || normalized.includes('caution')) {
    return 'watch';
  }
  return 'info';
}

function severityFromRoute(value: string | null | undefined): DispatchEventSeverity {
  switch (value) {
    case 'difficult':
      return 'warning';
    case 'challenging':
      return 'watch';
    case 'moderate':
    case 'easy':
    default:
      return 'info';
  }
}

function severityFromTerrain(value: string | null | undefined): DispatchEventSeverity {
  switch (value) {
    case 'SEVERE':
      return 'critical';
    case 'HIGH':
      return 'warning';
    case 'MODERATE':
      return 'watch';
    case 'LOW':
    default:
      return 'info';
  }
}

function severityFromResource(value: string | null | undefined): DispatchEventSeverity {
  switch (value) {
    case 'Resources Insufficient':
      return 'critical';
    case 'Resources Limited':
      return 'warning';
    case 'Watch Consumption':
      return 'watch';
    case 'Stable':
    default:
      return 'info';
  }
}

function severityFromVehicle(state: ReturnType<typeof vehicleTelemetryStore.getECSVehicleTelemetryState>): DispatchEventSeverity {
  if (state.connectionState === 'error' || state.connectionState === 'unsupported') {
    return 'warning';
  }
  if (state.isStale || state.isShowingLastKnown) {
    return 'watch';
  }
  return state.isConnected && state.hasData ? 'info' : 'watch';
}

function severityFromConnectivity(context: DispatchChannelContext): DispatchEventSeverity {
  const queuedCount = Number(context.queuedCount ?? 0) + Number(context.dirtyCount ?? 0);
  const state = resolveCanonicalConnectivityState({
    isOnline: context.isOnline,
    offlineMode: context.offlineMode,
    syncStatus: context.syncStatus,
    connectivityStatus: connectivity.status,
    connectivity: connectivity.getDetailedState(),
  });
  if (!state.syncAvailable) {
    return 'warning';
  }
  if (queuedCount > 0) {
    return 'watch';
  }
  return 'info';
}

function sourceStateFromWeather(): DispatchLiveSourceState {
  const { snapshot } = getSharedOperationalWeatherState();
  if (
    snapshot.status.source === 'live' ||
    (snapshot.status.source === 'cache_fresh' && !snapshot.status.stale)
  ) {
    return 'live_systems';
  }
  if (snapshot.status.source === 'cache_stale' || snapshot.status.stale) {
    return 'cached_last_known';
  }
  return 'unavailable';
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatMiles(value: number | null | undefined): string | null {
  if (!isFiniteNumber(value) || value <= 0) return null;
  return `${value.toFixed(value >= 10 ? 0 : 1)} mi`;
}

function routeSessionLifecycleLabel(lifecycle: NavigateRouteSessionSnapshot['lifecycle']): string {
  switch (lifecycle) {
    case 'active':
      return 'GUIDANCE ACTIVE';
    case 'arrived':
      return 'ARRIVED';
    case 'preview':
      return 'ROUTE STAGED';
    case 'inactive':
    default:
      return 'ROUTE READY';
  }
}

function getRouteSessionDistanceMiles(snapshot: NavigateRouteSessionSnapshot): number | null {
  if (isFiniteNumber(snapshot.remainingDistanceM) && snapshot.remainingDistanceM > 0) {
    return snapshot.remainingDistanceM * METERS_TO_MILES;
  }
  return computePointDistanceMiles(snapshot.routePoints);
}

function computePointDistanceMiles(points: Array<{ lat?: number | null; lng?: number | null; lon?: number | null }>): number | null {
  if (!Array.isArray(points) || points.length < 2) return null;
  let distanceMiles = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    const previousLng = previous.lng ?? previous.lon;
    const nextLng = next.lng ?? next.lon;
    if (
      !isFiniteNumber(previous.lat) ||
      !isFiniteNumber(previousLng) ||
      !isFiniteNumber(next.lat) ||
      !isFiniteNumber(nextLng)
    ) {
      continue;
    }
    distanceMiles += haversineMiles(previous.lat, previousLng, next.lat, nextLng);
  }
  return distanceMiles > 0 ? distanceMiles : null;
}

function getSessionRoutePoints(snapshot: NavigateRouteSessionSnapshot): TerrainRiskRoutePoint[] {
  return snapshot.routePoints.map((point: NavigateRouteMapPoint) => ({
    lat: point.lat,
    lng: point.lng,
    ele: point.ele ?? point.ele_m ?? null,
    ele_m: point.ele_m ?? point.ele ?? null,
    elevationFeet: point.elevationFeet ?? null,
  }));
}

function getImportedRouteSegments(route: ImportedRoute): TerrainRiskRouteSegment[] {
  return route.segments.map((segment: RouteSegment) => ({
    points: segment.points.map((point) => ({
      lat: point.lat,
      lon: point.lon,
      ele: point.ele,
      ele_m: point.ele,
    })),
  }));
}

function getRouteSessionFallback(): {
  id: string | null;
  name: string;
  statusLabel: string;
  detail: string;
  sourceLabel: string;
  updatedAt: string | null;
  distanceMiles: number | null;
  pointCount: number;
  routePoints: TerrainRiskRoutePoint[];
} | null {
  const snapshot = navigateRouteSessionStore.getSnapshot();
  const hasRouteGeometry = snapshot.routePoints.length >= 2;
  const hasRouteIdentity = !!(snapshot.routeId || snapshot.routeTitle);
  if (snapshot.lifecycle === 'inactive' || (!hasRouteGeometry && !hasRouteIdentity)) {
    return null;
  }

  const distanceMiles = getRouteSessionDistanceMiles(snapshot);
  const routePoints = getSessionRoutePoints(snapshot);
  const pointCount = snapshot.routePoints.length;
  const detail = [
    snapshot.routeTitle ?? 'Loaded route',
    formatMiles(distanceMiles),
    pointCount > 0 ? `${pointCount} pts` : null,
    snapshot.statusLabel,
  ].filter(Boolean).join(' / ');

  return {
    id: snapshot.routeId ?? snapshot.sessionId,
    name: snapshot.routeTitle ?? 'Loaded route',
    statusLabel: routeSessionLifecycleLabel(snapshot.lifecycle),
    detail,
    sourceLabel: 'Navigate Route Session',
    updatedAt: snapshot.updatedAt,
    distanceMiles,
    pointCount,
    routePoints,
  };
}

function getLocalActiveRouteFallback(): {
  id: string | null;
  name: string;
  statusLabel: string;
  detail: string;
  sourceLabel: string;
  updatedAt: string | null;
  distanceMiles: number | null;
  pointCount: number;
  routeSegments: TerrainRiskRouteSegment[];
} | null {
  const route = routeStore.getActive();
  if (!route) return null;

  const pointCount = route.segments.reduce((sum, segment) => sum + segment.points.length, 0);
  const distanceMiles = isFiniteNumber(route.total_distance_miles) && route.total_distance_miles > 0
    ? route.total_distance_miles
    : computePointDistanceMiles(route.segments.flatMap((segment) => segment.points));
  const detail = [
    route.name,
    formatMiles(distanceMiles),
    pointCount > 0 ? `${pointCount} pts` : null,
    titleCase(route.source_format),
  ].filter(Boolean).join(' / ');

  return {
    id: route.id,
    name: route.name,
    statusLabel: 'ROUTE READY',
    detail,
    sourceLabel: 'Local Active Route',
    updatedAt: route.updated_at,
    distanceMiles,
    pointCount,
    routeSegments: getImportedRouteSegments(route),
  };
}

function getRouteFallback() {
  return getRouteSessionFallback() ?? getLocalActiveRouteFallback();
}

type TerrainRiskFallback = {
  route: TerrainRiskRoute;
  updatedAt: string | null;
};

function buildTerrainRiskFromRouteFallback(): TerrainRiskFallback | null {
  const sessionRoute = getRouteSessionFallback();
  if (sessionRoute && sessionRoute.routePoints.length >= 2) {
    const route = buildTerrainRiskCommandRoute({
      active: true,
      routeId: sessionRoute.id,
      routeName: sessionRoute.name,
      totalDistanceMiles: sessionRoute.distanceMiles,
      sourceLabel: 'Live guidance elevation profile',
      routePoints: sessionRoute.routePoints,
      currentElevationFeet: null,
    });
    return route ? { route, updatedAt: sessionRoute.updatedAt } : null;
  }

  const localRoute = getLocalActiveRouteFallback();
  if (localRoute?.routeSegments.length) {
    const route = buildTerrainRiskCommandRoute({
      active: true,
      routeId: localRoute.id,
      routeName: localRoute.name,
      totalDistanceMiles: localRoute.distanceMiles,
      sourceLabel: 'Local active route elevation profile',
      routeSegments: localRoute.routeSegments,
      currentElevationFeet: null,
    });
    return route ? { route, updatedAt: localRoute.updatedAt } : null;
  }

  return null;
}

function terrainRiskToLegacyRiskLabel(level: TerrainRiskRoute['overallRiskLabel']): 'LOW' | 'MODERATE' | 'HIGH' {
  return formatTerrainRiskLabel(level).toUpperCase() as 'LOW' | 'MODERATE' | 'HIGH';
}

function buildWeatherChannel(): DispatchChannelSnapshot {
  const { snapshot } = getSharedOperationalWeatherState();
  const sourceState = sourceStateFromWeather();
  const strongestAlert = snapshot.alerts[0] ?? null;
  const severity = strongestAlert ? severityFromWeather(strongestAlert.severity) : 'info';
  const temp = typeof snapshot.current.temp === 'number' ? `${Math.round(snapshot.current.temp)}F` : null;
  const wind = typeof snapshot.current.windSpeed === 'number' ? `${Math.round(snapshot.current.windSpeed)} mph wind` : null;
  const condition = snapshot.current.condition ?? snapshot.current.description ?? snapshot.status.label ?? 'Weather unavailable';
  const statusLabel = strongestAlert
    ? 'ALERT'
    : sourceState === 'live_systems'
      ? 'LIVE'
      : sourceState === 'cached_last_known'
        ? snapshot.status.stale || snapshot.status.source === 'cache_stale'
          ? 'STALE'
          : 'RECENT'
        : 'NO LIVE DATA';
  const freshness = snapshot.status.source === 'live'
    ? 'live'
    : snapshot.status.source === 'cache_fresh' || snapshot.status.source === 'cache_stale'
      ? snapshot.status.source === 'cache_stale' || snapshot.status.stale ? 'stale cache' : 'cache'
      : 'unavailable';
  const detail = strongestAlert?.title ?? [
    temp,
    wind,
    condition,
    freshness,
  ].filter(Boolean).join(' / ');

  return {
    id: 'weather',
    label: 'Weather',
    statusLabel,
    detail,
    actionLabel: CHANNEL_ACTION.weather,
    sourceLabel: 'Shared ECS Weather',
    sourceState,
    severity,
    eventType: 'team_ping',
    eventSource: 'weather_engine',
    updatedAt: snapshot.fetchedAt,
  };
}

function buildRouteChannel(): DispatchChannelSnapshot {
  const route = routeAnalysisEngine.getCurrent();
  if (!route) {
    const routeFallback = getRouteFallback();
    if (routeFallback) {
      return {
        id: 'route',
        label: 'Route',
        statusLabel: routeFallback.statusLabel,
        detail: routeFallback.detail,
        actionLabel: CHANNEL_ACTION.route,
        sourceLabel: routeFallback.sourceLabel,
        sourceState: 'live_systems',
        severity: 'info',
        eventType: 'route',
        eventSource: 'route_engine',
        updatedAt: routeFallback.updatedAt,
      };
    }

    return {
      id: 'route',
      label: 'Route',
      statusLabel: 'NO LIVE DATA',
      detail: 'No active route analysis',
      actionLabel: CHANNEL_ACTION.route,
      sourceLabel: 'Route Engine',
      sourceState: 'unavailable',
      severity: 'info',
      eventType: 'route',
      eventSource: 'route_engine',
      updatedAt: null,
    };
  }

  return {
    id: 'route',
    label: 'Route',
    statusLabel: titleCase(route.overallDifficulty).toUpperCase(),
    detail: `${route.routeName} / ${route.totalDistanceMiles.toFixed(1)} mi / ${route.segmentCount} segments`,
    actionLabel: CHANNEL_ACTION.route,
    sourceLabel: 'Route Engine',
    sourceState: 'live_systems',
    severity: severityFromRoute(route.overallDifficulty),
    eventType: 'route',
    eventSource: 'route_engine',
    updatedAt: route.analyzedAt,
  };
}

function buildTerrainChannel(): DispatchChannelSnapshot {
  const terrain = terrainAnalysisEngine.getCurrent();
  if (!terrain) {
    const terrainRiskFallback = buildTerrainRiskFromRouteFallback();
    if (terrainRiskFallback) {
      const routeTerrainRisk = terrainRiskFallback.route;
      const riskLabel = terrainRiskToLegacyRiskLabel(routeTerrainRisk.overallRiskLabel);
      const spotCount = routeTerrainRisk.hotSpotCount + routeTerrainRisk.warmSpotCount;
      const detail = [
        routeTerrainRisk.name,
        formatMiles(routeTerrainRisk.totalDistanceMiles),
        routeTerrainRisk.nextHazard.label,
        spotCount > 0 ? `${spotCount} warm/hot` : 'no elevated spots',
        routeTerrainRisk.dataState === 'estimated-route' ? 'GPS altitude estimate' : 'elevation profile',
      ].filter(Boolean).join(' / ');

      return {
        id: 'terrain',
        label: 'Terrain',
        statusLabel: `${riskLabel} ${routeTerrainRisk.overallRiskScore}`,
        detail,
        actionLabel: CHANNEL_ACTION.terrain,
        sourceLabel: 'Route Terrain Risk',
        sourceState: routeTerrainRisk.dataState === 'live-route' ? 'live_systems' : 'cached_last_known',
        severity: severityFromTerrain(riskLabel),
        eventType: 'terrain',
        eventSource: 'terrain_engine',
        updatedAt: terrainRiskFallback.updatedAt,
      };
    }

    return {
      id: 'terrain',
      label: 'Terrain',
      statusLabel: 'NO LIVE DATA',
      detail: 'No terrain analysis active',
      actionLabel: CHANNEL_ACTION.terrain,
      sourceLabel: 'Terrain Engine',
      sourceState: 'unavailable',
      severity: 'info',
      eventType: 'terrain',
      eventSource: 'terrain_engine',
      updatedAt: null,
    };
  }

  return {
    id: 'terrain',
    label: 'Terrain',
    statusLabel: terrain.overallRisk,
    detail: `${terrain.terrainWarnings.length} warnings / ${terrain.totalSegments} segments`,
    actionLabel: CHANNEL_ACTION.terrain,
    sourceLabel: 'Terrain Engine',
    sourceState: 'live_systems',
    severity: severityFromTerrain(terrain.overallRisk),
    eventType: 'terrain',
    eventSource: 'terrain_engine',
    updatedAt: terrain.analyzedAt,
  };
}

function buildVehicleChannel(): DispatchChannelSnapshot {
  const state = vehicleTelemetryStore.getECSVehicleTelemetryState();
  const telemetry = state.telemetry;
  const detailParts = [
    typeof telemetry.vehicle_speed === 'number' ? `${Math.round(telemetry.vehicle_speed)} mph` : null,
    typeof telemetry.engine_rpm === 'number' ? `${Math.round(telemetry.engine_rpm)} rpm` : null,
    typeof telemetry.coolant_temp === 'number' ? `${Math.round(telemetry.coolant_temp)}F coolant` : null,
    state.freshnessText,
  ].filter(Boolean);

  return {
    id: 'vehicle',
    label: 'Vehicle',
    statusLabel: state.isConnected ? 'CONNECTED' : titleCase(String(state.connectionState)).toUpperCase(),
    detail: detailParts.length > 0 ? detailParts.join(' / ') : 'No vehicle telemetry stream',
    actionLabel: CHANNEL_ACTION.vehicle,
    sourceLabel: 'Vehicle Telemetry',
    sourceState: state.isFresh && state.hasData
      ? 'live_systems'
      : state.hasData
        ? 'cached_last_known'
        : 'unavailable',
    severity: severityFromVehicle(state),
    eventType: 'vehicle',
    eventSource: 'vehicle_telemetry',
    updatedAt: state.lastUpdated,
  };
}

function buildResourcesChannel(): DispatchChannelSnapshot {
  const forecast = resourceForecastEngine.getCurrent();
  if (!forecast || !forecast.hasRealData) {
    return {
      id: 'resources',
      label: 'Resources',
      statusLabel: 'NO LIVE DATA',
      detail: 'No active resource forecast',
      actionLabel: CHANNEL_ACTION.resources,
      sourceLabel: 'Resource Store',
      sourceState: 'unavailable',
      severity: 'info',
      eventType: 'resources',
      eventSource: 'resource_store',
      updatedAt: null,
    };
  }

  return {
    id: 'resources',
    label: 'Resources',
    statusLabel: forecast.sufficiencyLevel.toUpperCase(),
    detail: resourceForecastEngine.getSummary(forecast),
    actionLabel: CHANNEL_ACTION.resources,
    sourceLabel: 'Resource Store',
    sourceState: 'live_systems',
    severity: severityFromResource(forecast.sufficiencyLevel),
    eventType: 'resources',
    eventSource: 'resource_store',
    updatedAt: forecast.computedAt,
  };
}

function buildSyncChannel(context: DispatchChannelContext): DispatchChannelSnapshot {
  const state = connectivity.getDetailedState();
  const queuedCount = Number(context.queuedCount ?? 0) + Number(context.dirtyCount ?? 0);
  const canonical = resolveCanonicalConnectivityState({
    isOnline: context.isOnline,
    offlineMode: context.offlineMode,
    syncStatus: context.syncStatus,
    connectivityStatus: state.status,
    connectivity: state,
  });
  const statusLabel = queuedCount > 0
    ? `${queuedCount} QUEUED`
    : canonical.userForcedOfflineMode
      ? 'OFFLINE MODE'
      : String(context.syncStatus ?? state.status).toUpperCase();
  const detail = [
    state.networkType !== 'unknown' ? titleCase(state.networkType) : null,
    state.level !== 'unknown' ? titleCase(state.level) : null,
    typeof state.latencyMs === 'number' ? `${Math.round(state.latencyMs)} ms` : null,
  ].filter(Boolean).join(' / ') || (state.initialized ? 'Connectivity monitor active' : 'Connectivity initializing');

  return {
    id: 'sync',
    label: 'Sync',
    statusLabel,
    detail,
    actionLabel: CHANNEL_ACTION.sync,
    sourceLabel: 'Sync State',
    sourceState: state.initialized ? 'live_systems' : 'unavailable',
    severity: severityFromConnectivity(context),
    eventType: 'sync',
    eventSource: 'sync_state',
    updatedAt: canonical.networkOnline ? state.lastOnlineAt : state.lastOfflineAt,
  };
}

export function getDispatchChannelSnapshots(context: DispatchChannelContext): DispatchChannelSnapshot[] {
  return [
    buildWeatherChannel(),
    buildRouteChannel(),
    buildTerrainChannel(),
    buildResourcesChannel(),
    buildVehicleChannel(),
    buildSyncChannel(context),
  ];
}

export function getLiveDispatchEventInput(
  context: DispatchChannelContext,
  teamState: TeamStoreSnapshot | null,
): LiveDispatchEventInput {
  const weatherState = getDispatchWeatherStateFromShared();
  const activeRouteState = routeAnalysisEngine.getCurrent() ?? getLiveRouteStateFromFallback();
  const terrainRiskState = terrainAnalysisEngine.getCurrent() ?? getLiveTerrainStateFromFallback();
  return {
    weatherState,
    activeRouteState,
    terrainRiskState,
    vehicleTelemetryState: vehicleTelemetryStore.getECSVehicleTelemetryState(),
    resourceState: resourceForecastEngine.getCurrent(),
    syncState: {
      isOnline: context.isOnline,
      offlineMode: context.offlineMode,
      syncStatus: context.syncStatus,
      queuedCount: context.queuedCount,
      dirtyCount: context.dirtyCount ?? 0,
      connectivity: connectivity.getDetailedState(),
    },
    teamState,
    recoveryState: null,
  };
}

function getLiveRouteStateFromFallback(): LiveDispatchEventInput['activeRouteState'] {
  const route = getRouteFallback();
  if (!route) return null;
  return {
    id: route.id ?? undefined,
    sourceId: route.id ?? undefined,
    routeName: route.name,
    totalDistanceMiles: route.distanceMiles ?? undefined,
    segmentCount: route.pointCount > 1 ? Math.max(1, route.pointCount - 1) : undefined,
    segments: [],
    overallDifficulty: 'easy',
    analyzedAt: route.updatedAt ?? nowIso(),
  };
}

function getLiveTerrainStateFromFallback(): LiveDispatchEventInput['terrainRiskState'] {
  const terrainRiskFallback = buildTerrainRiskFromRouteFallback();
  if (!terrainRiskFallback) return null;
  const routeTerrainRisk = terrainRiskFallback.route;
  const overallRisk = terrainRiskToLegacyRiskLabel(routeTerrainRisk.overallRiskLabel);
  return {
    id: routeTerrainRisk.id,
    routeIntelligenceId: routeTerrainRisk.id,
    routeName: routeTerrainRisk.name,
    overallRisk,
    analyzedAt: terrainRiskFallback.updatedAt ?? nowIso(),
    terrainWarnings: routeTerrainRisk.terrainSegments
      .filter((segment) => segment.riskLevel === 'high' || segment.hazardKinds.length > 0)
      .slice(0, 3)
      .map((segment, index) => ({
        segmentIndex: index,
        warningType: segment.hazardKinds[0] ?? segment.riskLevel,
        message: `${segment.label} ${segment.riskLevel} terrain risk.`,
        segmentRange: `${segment.startDistanceMiles.toFixed(1)}-${segment.endDistanceMiles.toFixed(1)} mi`,
      })),
  };
}

function getDispatchWeatherStateFromShared(): LiveDispatchEventInput['weatherState'] {
  const { snapshot, result } = getSharedOperationalWeatherState();
  const firstResult = snapshot.raw ?? result?.data?.results?.[0] ?? null;
  const forecast =
    firstResult?.forecast ??
    snapshot.daily ??
    snapshot.hourly ??
    [];
  const alerts = snapshot.alerts ?? firstResult?.alerts ?? [];

  return {
    locationName: snapshot.locationName,
    fetchedAt: snapshot.fetchedAt ?? result?.data?.fetched_at ?? null,
    alerts,
    current: snapshot.current,
    raw: firstResult
      ? {
          ...firstResult,
          label: firstResult.label ?? snapshot.locationName,
          current: firstResult.current ?? null,
          forecast,
          alerts,
        }
      : null,
    normalized: {
      ...snapshot.normalized,
      forecast: snapshot.normalized.forecast?.length
        ? snapshot.normalized.forecast
        : forecast,
    },
    hourly: snapshot.hourly,
    daily: snapshot.daily,
    status: snapshot.status,
  };
}

export function subscribeDispatchChannels(listener: () => void): () => void {
  const unsubscribers = [
    subscribeSharedOperationalWeather(listener),
    routeAnalysisEngine.subscribe(() => listener()),
    terrainAnalysisEngine.subscribe(() => listener()),
    navigateRouteSessionStore.subscribe(() => listener()),
    routeStore.subscribe(() => listener()),
    resourceForecastEngine.subscribe(() => listener()),
    vehicleTelemetryStore.subscribe(listener),
    connectivity.onStatusChange(() => listener()),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}

export function createDispatchEventFromChannelAction(channel: DispatchChannelSnapshot): DispatchEvent | null {
  const actionSource: DispatchEventSource = 'team_member';
  const severity: DispatchEventSeverity = channel.severity === 'info' ? 'watch' : channel.severity;
  return normalizeDispatchEvent({
    id: `dispatch-channel-${channel.id}-${Date.now()}`,
    timestamp: nowIso(),
    type: channel.eventType,
    severity,
    title: channel.actionLabel,
    message: `${channel.actionLabel} from ${channel.label}. Current state: ${channel.statusLabel}. ${channel.detail}`,
    source: actionSource,
    requiresMapDrilldown: channel.severity === 'warning' || channel.severity === 'critical',
  });
}

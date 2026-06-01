import {
  normalizeDispatchEvent,
  sortDispatchEvents,
  type DispatchEvent,
  type DispatchEventSeverity,
  type DispatchEventSource,
} from './dispatchLiveEvents';
import { resolveCanonicalConnectivityState } from './connectivityState';
import { getWeatherFreshness, type WeatherFreshness } from './weatherFreshness';
import { ecsLog } from './ecsLogger';
import type { TeamStoreSnapshot } from './teamStore';

type WeatherAlertInput = {
  title?: string | null;
  type?: string | null;
  severity?: string | null;
  effective?: string | null;
  expires?: string | null;
  description?: string | null;
  body?: string | null;
  message?: string | null;
};

type WeatherStateInput = {
  locationName?: string | null;
  fetchedAt?: string | null;
  alerts?: WeatherAlertInput[];
  current?: {
    temp?: number | null;
    feelsLike?: number | null;
    windSpeed?: number | null;
    windGust?: number | null;
    visibility?: number | null;
    precipChance?: number | null;
    precipType?: string | null;
    condition?: string | null;
    description?: string | null;
  } | null;
  raw?: {
    lat?: number | null;
    lng?: number | null;
    lon?: number | null;
    label?: string | null;
    current?: {
      temp?: number | null;
      feels_like?: number | null;
      wind_speed?: number | null;
      wind_gust?: number | null;
      humidity?: number | null;
      pressure?: number | null;
      visibility?: number | null;
      weather_main?: string | null;
      weather_description?: string | null;
    } | null;
    forecast?: Array<unknown> | null;
    alerts?: WeatherAlertInput[] | null;
    trail_conditions?: {
      overall?: string | null;
      factors?: Array<{
        factor?: string | null;
        status?: string | null;
        detail?: string | null;
      }>;
    } | null;
  } | null;
  normalized?: {
    current?: {
      tempF?: number | null;
      tempC?: number | null;
      temperature?: number | null;
      temperatureF?: number | null;
      temperatureC?: number | null;
      feelsLikeF?: number | null;
      windMph?: number | null;
      windGustMph?: number | null;
      condition?: string | null;
      precipitationChance?: number | null;
      pressureHpa?: number | null;
    } | null;
    forecast?: Array<unknown> | null;
    updatedAt?: string | null;
  } | null;
  hourly?: Array<unknown> | null;
  daily?: Array<unknown> | null;
  status?: {
    source?: string | null;
    stale?: boolean;
    freshness?: WeatherFreshness | null;
    cachedAt?: number | null;
    timestampMs?: number | null;
    kind?: string | null;
    label?: string | null;
  };
};

type RouteSegmentInput = {
  segmentIndex?: number;
  distanceStart?: number;
  distanceEnd?: number;
  coordinates?: [number, number];
  difficulty?: string;
  maxGradePercent?: number;
};

type ActiveRouteStateInput = {
  id?: string;
  sourceId?: string;
  routeName?: string;
  totalDistanceMiles?: number;
  segmentCount?: number;
  segments?: RouteSegmentInput[];
  overallDifficulty?: string;
  analyzedAt?: string;
};

type TerrainWarningInput = {
  segmentIndex?: number;
  warningType?: string;
  message?: string;
  segmentRange?: string;
};

type TerrainRiskStateInput = {
  id?: string;
  routeIntelligenceId?: string;
  routeName?: string;
  overallRisk?: string;
  analyzedAt?: string;
  terrainWarnings?: TerrainWarningInput[];
};

type VehicleTelemetryStateInput = {
  isFresh?: boolean;
  isStale?: boolean;
  isShowingLastKnown?: boolean;
  hasData?: boolean;
  lastUpdated?: string | null;
  summary?: {
    coolant_temp?: number | null;
    fuel_level?: number | null;
    battery_voltage?: number | null;
    engine_status?: string | null;
    connection_state?: string | null;
    device_name?: string | null;
    provider?: string | null;
  };
};

type ResourceStateInput = {
  routeMiles?: number;
  hasRealData?: boolean;
  overallStatus?: string;
  sufficiencyLevel?: string;
  computedAt?: string | null;
  routeIntelligenceId?: string;
  drivers?: string[];
  intelMessages?: Array<{
    id?: string;
    severity?: string;
    resource?: string;
    message?: string;
  }>;
};

type SyncStateInput = {
  isOnline?: boolean;
  offlineMode?: boolean;
  syncStatus?: string;
  queuedCount?: number;
  dirtyCount?: number;
  connectivity?: {
    status?: string;
    level?: string;
    isOnline?: boolean;
    isInternetReachable?: boolean;
    lastOfflineAt?: string | null;
    initialized?: boolean;
  } | null;
};

export type LiveDispatchEventInput = {
  weatherState?: WeatherStateInput | null;
  activeRouteState?: ActiveRouteStateInput | null;
  terrainRiskState?: TerrainRiskStateInput | null;
  vehicleTelemetryState?: VehicleTelemetryStateInput | null;
  resourceState?: ResourceStateInput | null;
  syncState?: SyncStateInput | null;
  teamState?: TeamStoreSnapshot | null;
  recoveryState?: {
    events?: DispatchEvent[];
  } | null;
};

const HIGH_ROUTE_DIFFICULTIES = new Set(['challenging', 'difficult']);
const HIGH_TERRAIN_RISKS = new Set(['HIGH', 'SEVERE']);
const WEATHER_WIND_WARNING_MPH = 25;
const WEATHER_WIND_CRITICAL_MPH = 40;
const WEATHER_VISIBILITY_WARNING_METERS = 1600;
const WEATHER_VISIBILITY_CRITICAL_METERS = 500;
const WEATHER_PRECIP_WARNING_PERCENT = 70;
const WEATHER_FREEZE_WARNING_F = 20;
const WEATHER_FREEZE_WATCH_F = 32;
const WEATHER_HEAT_WARNING_F = 100;
const WEATHER_HEAT_WATCH_F = 90;
const DISPATCH_WIRE_LOG_LABELS = {
  weather_events: '[DISPATCH_WIRE] weather_events count=',
  route_events: '[DISPATCH_WIRE] route_events count=',
  terrain_events: '[DISPATCH_WIRE] terrain_events count=',
  vehicle_events: '[DISPATCH_WIRE] vehicle_events count=',
  resource_events: '[DISPATCH_WIRE] resource_events count=',
  sync_events: '[DISPATCH_WIRE] sync_events count=',
  team_events: '[DISPATCH_WIRE] team_events count=',
  final_events: '[DISPATCH_WIRE] final_events count=',
  deduped: '[DISPATCH_WIRE] deduped count=',
} as const;

let lastLiveDispatchInputSignature = '';
const EMPTY_DISPATCH_EVENTS: DispatchEvent[] = [];
let lastLiveDispatchEvents: DispatchEvent[] = EMPTY_DISPATCH_EVENTS;
let lastLiveDispatchEventFingerprint = '';
const lastDispatchWireCounts = new Map<keyof typeof DISPATCH_WIRE_LOG_LABELS, number>();
let lastWeatherZeroReason: string | null = null;
let lastSyncStateLogSignature: string | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stableToken(value: unknown): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'unknown';
}

function normalizeForSignature(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForSignature);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const next = (value as Record<string, unknown>)[key];
        if (typeof next !== 'function' && next !== undefined) {
          acc[key] = normalizeForSignature(next);
        }
        return acc;
      }, {});
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Number(value.toFixed(5)) : null;
  }
  return value ?? null;
}

function validIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function eventTimestamp(_live: boolean, sourceTimestamp: unknown): string {
  return validIsoOrNull(sourceTimestamp) ?? nowIso();
}

function isWeatherLive(source: string | null | undefined): boolean {
  return source === 'live';
}

function isWeatherCached(source: string | null | undefined): boolean {
  return source === 'cache_fresh' || source === 'cache_stale';
}

function eventListSignature(events: DispatchEvent[] | undefined): unknown[] {
  return (events ?? []).map((event) => ({
    id: event.id,
    type: event.type,
    severity: event.severity,
    title: event.title,
    message: event.message,
    source: event.source,
    status: event.status,
    priority: event.priority,
    note: event.note,
    locationStatus: event.locationStatus,
    dedupeKey: event.dedupeKey,
    routeSegmentId: event.routeSegmentId,
    location: event.location
      ? {
          latitude: event.location.latitude,
          longitude: event.location.longitude,
        }
      : null,
  }));
}

function eventFingerprint(event: DispatchEvent): unknown {
  return {
    id: event.id,
    type: event.type,
    severity: event.severity,
    title: event.title,
    message: event.message,
    details: event.details ?? null,
    source: event.source,
    status: event.status ?? null,
    priority: event.priority ?? null,
    note: event.note ?? null,
    locationStatus: event.locationStatus ?? null,
    category: event.category ?? null,
    hazardType: event.hazardType ?? null,
    cadReferenceId: event.cadReferenceId ?? null,
    dedupeKey: event.dedupeKey ?? null,
    targetEventId: event.targetEventId ?? null,
    targetItemId: event.targetItemId ?? null,
    teamId: event.teamId ?? null,
    sessionId: event.sessionId ?? null,
    channelId: event.channelId ?? null,
    syncState: event.syncState ?? null,
    routeSegmentId: event.routeSegmentId ?? null,
    requiresMapDrilldown: event.requiresMapDrilldown ?? null,
    updatedAt: validIsoOrNull(event.updatedAt) ?? null,
    location: event.location
      ? {
          latitude: event.location.latitude,
          longitude: event.location.longitude,
          accuracyMeters: event.location.accuracyMeters ?? null,
          altitude: event.location.altitude ?? null,
          heading: event.location.heading ?? null,
          timestamp: event.location.timestamp ?? null,
          source: event.location.source ?? null,
        }
      : null,
  };
}

export function createLiveDispatchEventListFingerprint(events: DispatchEvent[] | undefined): string {
  return JSON.stringify(normalizeForSignature((events ?? []).map(eventFingerprint)));
}

function weatherSignature(weatherState: WeatherStateInput | null | undefined): unknown {
  if (!weatherState || !hasDispatchWeatherData(weatherState)) {
    return { available: false };
  }

  return {
    available: true,
    locationName: weatherState.locationName ?? weatherState.raw?.label ?? null,
    source: weatherState.status?.source ?? null,
    freshness: weatherState.status?.freshness ?? null,
    stale: weatherState.status?.stale ?? false,
    current: {
      temp: weatherState.current?.temp ?? weatherState.normalized?.current?.tempF ?? weatherState.normalized?.current?.temperatureF ?? null,
      condition: weatherState.current?.condition ?? weatherState.current?.description ?? weatherState.normalized?.current?.condition ?? weatherState.raw?.current?.weather_main ?? weatherState.raw?.current?.weather_description ?? null,
      windSpeed: numericWeatherValue(
        weatherState.current?.windGust,
        weatherState.raw?.current?.wind_gust,
        weatherState.current?.windSpeed,
        weatherState.normalized?.current?.windMph,
        weatherState.raw?.current?.wind_speed,
      ),
      visibility: numericWeatherValue(weatherState.current?.visibility, weatherState.raw?.current?.visibility),
      precipChance: numericWeatherValue(weatherState.current?.precipChance, weatherState.normalized?.current?.precipitationChance),
      precipType: weatherState.current?.precipType ?? null,
    },
    location: {
      lat: weatherState.raw?.lat ?? null,
      lng: weatherState.raw?.lng ?? weatherState.raw?.lon ?? null,
    },
    alerts: weatherAlerts(weatherState).map((alert) => ({
      title: alert.title ?? null,
      type: alert.type ?? null,
      severity: alert.severity ?? null,
      effective: alert.effective ?? null,
      expires: alert.expires ?? null,
      description: alert.description ?? alert.body ?? alert.message ?? null,
    })),
    forecastCount:
      (weatherState.normalized?.forecast?.length ?? 0) ||
      (weatherState.daily?.length ?? 0) ||
      (weatherState.hourly?.length ?? 0) ||
      (weatherState.raw?.forecast?.length ?? 0),
    trail: {
      overall: weatherState.raw?.trail_conditions?.overall ?? null,
      factors: weatherState.raw?.trail_conditions?.factors?.map((factor) => ({
        factor: factor.factor ?? null,
        status: factor.status ?? null,
        detail: factor.detail ?? null,
      })) ?? [],
    },
  };
}

function routeSignature(route: ActiveRouteStateInput | null | undefined): unknown {
  if (!route) return null;
  return {
    id: route.sourceId ?? route.id ?? null,
    routeName: route.routeName ?? null,
    totalDistanceMiles: route.totalDistanceMiles ?? null,
    segmentCount: route.segmentCount ?? route.segments?.length ?? null,
    overallDifficulty: route.overallDifficulty ?? null,
    segments: route.segments?.map((segment) => ({
      segmentIndex: segment.segmentIndex ?? null,
      difficulty: segment.difficulty ?? null,
      coordinates: segment.coordinates ?? null,
    })) ?? [],
  };
}

function terrainSignature(terrain: TerrainRiskStateInput | null | undefined): unknown {
  if (!terrain) return null;
  return {
    id: terrain.routeIntelligenceId ?? terrain.id ?? null,
    routeName: terrain.routeName ?? null,
    overallRisk: terrain.overallRisk ?? null,
    warnings: terrain.terrainWarnings?.map((warning) => ({
      segmentIndex: warning.segmentIndex ?? null,
      warningType: warning.warningType ?? null,
      message: warning.message ?? null,
      segmentRange: warning.segmentRange ?? null,
    })) ?? [],
  };
}

function vehicleSignature(vehicle: VehicleTelemetryStateInput | null | undefined): unknown {
  if (!vehicle?.hasData) return { hasData: false };
  return {
    hasData: true,
    isFresh: vehicle.isFresh ?? false,
    isShowingLastKnown: vehicle.isShowingLastKnown ?? false,
    summary: {
      coolant_temp: vehicle.summary?.coolant_temp ?? null,
      fuel_level: vehicle.summary?.fuel_level ?? null,
      battery_voltage: vehicle.summary?.battery_voltage ?? null,
      engine_status: vehicle.summary?.engine_status ?? null,
      device_name: vehicle.summary?.device_name ?? null,
      provider: vehicle.summary?.provider ?? null,
    },
  };
}

function resourceSignature(resource: ResourceStateInput | null | undefined): unknown {
  if (!resource?.hasRealData) return { hasRealData: false };
  return {
    hasRealData: true,
    sufficiencyLevel: resource.sufficiencyLevel ?? null,
    routeIntelligenceId: resource.routeIntelligenceId ?? null,
    drivers: resource.drivers ?? [],
    intelMessages: resource.intelMessages?.map((intel) => ({
      id: intel.id ?? null,
      severity: intel.severity ?? null,
      resource: intel.resource ?? null,
      message: intel.message ?? null,
    })) ?? [],
  };
}

function syncSignature(sync: SyncStateInput | null | undefined, team: TeamStoreSnapshot | null | undefined): unknown {
  const queuedCount = Number(sync?.queuedCount ?? 0) + Number(sync?.dirtyCount ?? 0);
  const canonical = resolveCanonicalConnectivityState({
    isOnline: sync?.isOnline,
    offlineMode: sync?.offlineMode,
    syncStatus: sync?.syncStatus,
    connectivityStatus: sync?.connectivity?.status,
    connectivity: sync?.connectivity,
  });
  return {
    hasActiveTeam: !!team?.activeTeam,
    activeTeamId: team?.activeTeam?.id ?? null,
    activeTeamName: team?.activeTeam?.name ?? null,
    queuedCount,
    syncAvailable: canonical.syncAvailable,
    userForcedOfflineMode: canonical.userForcedOfflineMode,
    effectiveOfflineMode: canonical.effectiveOfflineMode,
    networkOnline: canonical.networkOnline,
    reason: canonical.reason,
  };
}

function liveDispatchInputSignature(input: LiveDispatchEventInput): string {
  return JSON.stringify(normalizeForSignature({
    weatherState: weatherSignature(input.weatherState),
    activeRouteState: routeSignature(input.activeRouteState),
    terrainRiskState: terrainSignature(input.terrainRiskState),
    vehicleTelemetryState: vehicleSignature(input.vehicleTelemetryState),
    resourceState: resourceSignature(input.resourceState),
    syncState: syncSignature(input.syncState, input.teamState),
    recoveryEvents: eventListSignature(input.recoveryState?.events),
  }));
}

function hasAnyEntries(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function hasDispatchWeatherData(weatherState: WeatherStateInput | null | undefined): boolean {
  if (!weatherState) return false;
  const raw = weatherState.raw;
  const current = weatherState.current;
  const rawCurrent = raw?.current;
  const normalizedCurrent = weatherState.normalized?.current;
  const hasCurrent = Boolean(
    numericWeatherValue(
      current?.temp,
      current?.feelsLike,
      current?.windGust,
      current?.windSpeed,
      current?.visibility,
      current?.precipChance,
      rawCurrent?.temp,
      rawCurrent?.feels_like,
      rawCurrent?.wind_gust,
      rawCurrent?.wind_speed,
      rawCurrent?.humidity,
      rawCurrent?.pressure,
      rawCurrent?.visibility,
      normalizedCurrent?.tempF,
      normalizedCurrent?.tempC,
      normalizedCurrent?.temperature,
      normalizedCurrent?.temperatureF,
      normalizedCurrent?.temperatureC,
      normalizedCurrent?.feelsLikeF,
      normalizedCurrent?.windMph,
      normalizedCurrent?.windGustMph,
      normalizedCurrent?.precipitationChance,
      normalizedCurrent?.pressureHpa,
    ) != null ||
    cleanString(current?.condition) ||
    cleanString(current?.description) ||
    cleanString(rawCurrent?.weather_main) ||
    cleanString(rawCurrent?.weather_description) ||
    cleanString(normalizedCurrent?.condition)
  );

  return Boolean(
    hasCurrent ||
    hasAnyEntries(weatherState.alerts) ||
    hasAnyEntries(raw?.alerts) ||
    hasAnyEntries(raw?.forecast) ||
    hasAnyEntries(weatherState.normalized?.forecast) ||
    hasAnyEntries(weatherState.hourly) ||
    hasAnyEntries(weatherState.daily) ||
    Boolean(raw?.trail_conditions?.factors?.length),
  );
}

function weatherAlerts(weatherState: WeatherStateInput | null | undefined): WeatherAlertInput[] {
  if (!weatherState) return [];
  const topLevelAlerts = hasAnyEntries(weatherState.alerts) ? weatherState.alerts ?? [] : [];
  const rawAlerts = hasAnyEntries(weatherState.raw?.alerts) ? weatherState.raw?.alerts ?? [] : [];
  return topLevelAlerts.length > 0 ? topLevelAlerts : rawAlerts;
}

function isStaleWeatherFreshness(value: WeatherFreshness | null | undefined): boolean {
  return value === 'stale' || value === 'very_stale';
}

function resolveDispatchWeatherFreshness(weatherState: WeatherStateInput | null | undefined): {
  freshness: WeatherFreshness;
  stale: boolean;
} {
  if (!weatherState) return { freshness: 'missing', stale: true };
  if (weatherState.status?.freshness) {
    return {
      freshness: weatherState.status.freshness,
      stale: isStaleWeatherFreshness(weatherState.status.freshness),
    };
  }

  const freshness = getWeatherFreshness({
    source: weatherState.status?.source as any,
    fetchedAt: weatherState.fetchedAt ?? weatherState.normalized?.updatedAt ?? null,
    updatedAt: weatherState.normalized?.updatedAt ?? null,
    cachedAt: weatherState.status?.cachedAt ?? weatherState.status?.timestampMs ?? null,
    hasWeatherData: hasDispatchWeatherData(weatherState),
  });

  return {
    freshness: freshness.freshness,
    stale: freshness.stale,
  };
}

function weatherFreshnessLabel(
  weatherState: WeatherStateInput,
  source: string | null,
  freshness: ReturnType<typeof resolveDispatchWeatherFreshness>,
): 'live' | 'cached' | 'stale' {
  if (
    weatherState.status?.stale ||
    weatherState.status?.kind === 'stale' ||
    weatherState.status?.source === 'cache_stale' ||
    weatherState.status?.freshness === 'stale' ||
    weatherState.status?.freshness === 'very_stale'
  ) {
    return 'stale';
  }
  if (isWeatherLive(source)) return 'live';
  if (isWeatherCached(source)) return 'cached';
  return freshness.stale ? 'stale' : 'cached';
}

function severityRank(severity: DispatchEventSeverity): number {
  switch (severity) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    case 'watch':
      return 1;
    case 'info':
    default:
      return 0;
  }
}

function capStaleWeatherSeverity(
  severity: DispatchEventSeverity,
  freshnessLabel: 'live' | 'cached' | 'stale',
): DispatchEventSeverity {
  if (freshnessLabel !== 'stale') return severity;
  return severityRank(severity) > severityRank('watch') ? 'watch' : severity;
}

function weatherAdvisoryMessage(params: {
  freshnessLabel: 'live' | 'cached' | 'stale';
  detail: string;
  locationName: string;
  condition?: string;
}): string {
  const prefix = params.freshnessLabel === 'stale'
    ? 'Stale weather advisory'
    : 'Weather advisory';
  const condition = cleanString(params.condition);
  return [
    `${prefix}: Forecast indicates ${params.detail} near ${params.locationName}.`,
    condition ? `Current signal: ${condition}.` : null,
    `Source freshness: ${params.freshnessLabel}.`,
    'Monitor conditions.',
  ].filter(Boolean).join(' ');
}

function sourceFromFreshness(isLive: boolean, normalSource: DispatchEventSource): DispatchEventSource {
  return isLive ? normalSource : 'cache';
}

function locationHash(location: DispatchEvent['location']): string {
  if (!location) {
    return 'no-location';
  }

  return `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
}

function dedupeKey(event: DispatchEvent): string {
  return [
    event.type,
    event.source,
    event.severity,
    event.routeSegmentId ?? locationHash(event.location),
    stableToken(event.title),
  ].join('|');
}

function dispatchEvent(raw: unknown): DispatchEvent | null {
  return normalizeDispatchEvent(raw);
}

function logCount(label: keyof typeof DISPATCH_WIRE_LOG_LABELS, count: number): void {
  if (lastDispatchWireCounts.get(label) === count) {
    return;
  }
  lastDispatchWireCounts.set(label, count);
  ecsLog.dev('SYSTEM', DISPATCH_WIRE_LOG_LABELS[label], { count }, {
    tag: '[DISPATCH_WIRE]',
    debugFlag: 'ECS_DEBUG_DISPATCH_WIRE',
    fingerprint: `${label}:${count}`,
    throttleMs: 5000,
    aggregateWindowMs: 30_000,
  });
}

function logWeatherZeroReason(reason: string, signatureScope = 'global'): void {
  const signature = `${reason}:${signatureScope}`;
  if (lastWeatherZeroReason === signature) {
    return;
  }
  lastWeatherZeroReason = signature;
  console.log('[DISPATCH_WIRE]', `weather_events reason=${reason}`, { reason, signatureScope });
  ecsLog.dev('SYSTEM', 'weather_events reason', { reason, signatureScope }, {
    tag: '[DISPATCH_WIRE]',
    debugFlag: 'ECS_DEBUG_DISPATCH_WIRE',
    fingerprint: `weather_events:${signature}`,
    throttleMs: 5000,
    aggregateWindowMs: 30_000,
  });
}

function routeSegmentId(routeId: string | undefined, segmentIndex: number | undefined): string | undefined {
  if (!routeId || !Number.isInteger(segmentIndex) || segmentIndex == null || segmentIndex < 0) {
    return undefined;
  }

  return `${routeId}:${segmentIndex}`;
}

function locationFromCoordinates(coordinates: [number, number] | undefined): DispatchEvent['location'] {
  if (!coordinates) {
    return undefined;
  }

  const latitude = Number(coordinates[0]);
  const longitude = Number(coordinates[1]);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return undefined;
  }

  return { latitude, longitude };
}

function locationFromWeather(weatherState: WeatherStateInput): DispatchEvent['location'] {
  const latitude = Number(weatherState.raw?.lat);
  const longitude = Number(weatherState.raw?.lng ?? weatherState.raw?.lon);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return undefined;
  }

  return { latitude, longitude };
}

function severityFromWeather(severity: string | null | undefined): DispatchEventSeverity | null {
  const normalized = cleanString(severity).toLowerCase();
  if (normalized === 'extreme' || normalized.includes('severe') || normalized.includes('critical')) {
    return 'critical';
  }
  if (normalized === 'warning' || normalized.includes('warning')) {
    return 'warning';
  }
  if (normalized === 'advisory' || normalized.includes('advisory') || normalized.includes('watch') || normalized.includes('caution')) {
    return 'watch';
  }
  return null;
}

function numericWeatherValue(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function weatherConditionText(weatherState: WeatherStateInput): string {
  return cleanString(
    weatherState.current?.description ??
    weatherState.current?.condition ??
    weatherState.normalized?.current?.condition ??
    weatherState.raw?.current?.weather_description ??
    weatherState.raw?.current?.weather_main ??
    weatherState.status?.label ??
    'Weather conditions',
  );
}

function weatherEventCandidate(
  weatherState: WeatherStateInput,
  params: {
    key: string;
    severity: DispatchEventSeverity;
    title: string;
    message: string;
    timestamp?: string | null;
    updatedAt?: string | null;
    live: boolean;
  },
): DispatchEvent | null {
  const location = locationFromWeather(weatherState);
  return dispatchEvent({
    id: `live-weather-${stableToken(params.key)}-${params.severity}`,
    timestamp: eventTimestamp(params.live, params.timestamp ?? weatherState.fetchedAt ?? weatherState.normalized?.updatedAt),
    updatedAt: validIsoOrNull(params.updatedAt),
    type: 'weather',
    severity: params.severity,
    title: params.title,
    body: params.message,
    description: params.message,
    message: params.message,
    source: sourceFromFreshness(params.live, 'weather_engine'),
    location,
    dedupeKey: ['weather', stableToken(params.key), params.severity, locationHash(location)].join('|'),
    status: 'open',
    priority: params.severity === 'critical' ? 'high' : params.severity,
    requiresMapDrilldown: !!location,
  });
}

function buildWeatherConditionEvents(weatherState: WeatherStateInput, source: string | null): DispatchEvent[] {
  const live = isWeatherLive(source);
  const freshness = resolveDispatchWeatherFreshness(weatherState);
  const freshnessLabel = weatherFreshnessLabel(weatherState, source, freshness);
  const events: DispatchEvent[] = [];
  const locationName = weatherState.locationName ?? weatherState.raw?.label ?? 'current position';
  const condition = weatherConditionText(weatherState);
  const windMph = numericWeatherValue(
    weatherState.current?.windGust,
    weatherState.raw?.current?.wind_gust,
    weatherState.current?.windSpeed,
    weatherState.normalized?.current?.windMph,
    weatherState.raw?.current?.wind_speed,
  );
  const visibilityMeters = numericWeatherValue(weatherState.current?.visibility, weatherState.raw?.current?.visibility);
  const rawPrecipChance = numericWeatherValue(weatherState.current?.precipChance, weatherState.normalized?.current?.precipitationChance);
  const precipChance = rawPrecipChance != null && rawPrecipChance > 0 && rawPrecipChance <= 1
    ? rawPrecipChance * 100
    : rawPrecipChance;
  const precipType = cleanString(weatherState.current?.precipType);
  const tempF = numericWeatherValue(
    weatherState.current?.feelsLike,
    weatherState.current?.temp,
    weatherState.normalized?.current?.feelsLikeF,
    weatherState.normalized?.current?.tempF,
    weatherState.normalized?.current?.temperatureF,
    weatherState.raw?.current?.feels_like,
    weatherState.raw?.current?.temp,
  );
  const conditionLower = cleanString(condition).toLowerCase();

  if (windMph != null && windMph >= WEATHER_WIND_WARNING_MPH) {
    const severity = capStaleWeatherSeverity(
      windMph >= WEATHER_WIND_CRITICAL_MPH ? 'critical' : 'warning',
      freshnessLabel,
    );
    const event = weatherEventCandidate(weatherState, {
      key: `wind-${Math.round(windMph / 5) * 5}`,
      severity,
      title: 'Weather Advisory',
      message: weatherAdvisoryMessage({
        freshnessLabel,
        detail: `${Math.round(windMph)} mph wind`,
        locationName,
        condition,
      }),
      live,
    });
    if (event) events.push(event);
  }

  if (visibilityMeters != null && visibilityMeters <= WEATHER_VISIBILITY_WARNING_METERS) {
    const severity = capStaleWeatherSeverity(
      visibilityMeters <= WEATHER_VISIBILITY_CRITICAL_METERS ? 'critical' : 'warning',
      freshnessLabel,
    );
    const miles = Math.max(0, visibilityMeters / 1609.344);
    const event = weatherEventCandidate(weatherState, {
      key: `visibility-${severity}`,
      severity,
      title: 'Weather Advisory',
      message: weatherAdvisoryMessage({
        freshnessLabel,
        detail: `${miles.toFixed(1)} mi visibility`,
        locationName,
        condition,
      }),
      live,
    });
    if (event) events.push(event);
  }

  if (precipChance != null && precipChance >= WEATHER_PRECIP_WARNING_PERCENT) {
    const event = weatherEventCandidate(weatherState, {
      key: `precip-${Math.round(precipChance / 10) * 10}-${precipType || 'precip'}`,
      severity: 'watch',
      title: 'Weather Advisory',
      message: weatherAdvisoryMessage({
        freshnessLabel,
        detail: `${Math.round(precipChance)}% precipitation chance${precipType ? ` (${precipType})` : ''}`,
        locationName,
      }),
      live,
    });
    if (event) events.push(event);
  }

  if (tempF != null && tempF <= WEATHER_FREEZE_WATCH_F) {
    const severity = capStaleWeatherSeverity(
      tempF <= WEATHER_FREEZE_WARNING_F ? 'warning' : 'watch',
      freshnessLabel,
    );
    const event = weatherEventCandidate(weatherState, {
      key: `freeze-${Math.round(tempF / 5) * 5}`,
      severity,
      title: 'Weather Advisory',
      message: weatherAdvisoryMessage({
        freshnessLabel,
        detail: `${Math.round(tempF)}F freezing conditions`,
        locationName,
        condition,
      }),
      live,
    });
    if (event) events.push(event);
  }

  if (tempF != null && tempF >= WEATHER_HEAT_WATCH_F) {
    const severity = capStaleWeatherSeverity(
      tempF >= WEATHER_HEAT_WARNING_F ? 'warning' : 'watch',
      freshnessLabel,
    );
    const event = weatherEventCandidate(weatherState, {
      key: `heat-${Math.round(tempF / 5) * 5}`,
      severity,
      title: 'Weather Advisory',
      message: weatherAdvisoryMessage({
        freshnessLabel,
        detail: `${Math.round(tempF)}F heat exposure`,
        locationName,
        condition,
      }),
      live,
    });
    if (event) events.push(event);
  }

  if (/\b(thunder|lightning|storm)\b/.test(conditionLower)) {
    const event = weatherEventCandidate(weatherState, {
      key: `storm-${stableToken(conditionLower)}`,
      severity: capStaleWeatherSeverity('warning', freshnessLabel),
      title: 'Weather Advisory',
      message: weatherAdvisoryMessage({
        freshnessLabel,
        detail: condition || 'storm conditions',
        locationName,
      }),
      live,
    });
    if (event) events.push(event);
  }

  const trail = weatherState.raw?.trail_conditions;
  const trailOverall = cleanString(trail?.overall).toLowerCase();
  if (trailOverall === 'hazardous' || trailOverall === 'poor') {
    const topFactor = trail?.factors?.find((factor) => {
      const status = cleanString(factor.status).toLowerCase();
      return status === 'danger' || status === 'warning';
    });
    const severity: DispatchEventSeverity = trailOverall === 'hazardous' ? 'critical' : 'warning';
    const event = weatherEventCandidate(weatherState, {
      key: `trail-${trailOverall}-${topFactor?.factor ?? 'overall'}`,
      severity,
      title: trailOverall === 'hazardous' ? 'Hazardous Trail Weather' : 'Poor Trail Weather',
      message: cleanString(topFactor?.detail) || `Trail conditions are ${trailOverall} near ${locationName}.`,
      live,
    });
    if (event) events.push(event);
  }

  return events;
}

function dedupeWeatherEvents(events: DispatchEvent[]): DispatchEvent[] {
  const byKey = new Map<string, DispatchEvent>();
  for (const event of sortDispatchEvents(events)) {
    const key = event.dedupeKey ?? dedupeKey(event);
    if (byKey.has(key)) {
      logWeatherZeroReason('duplicate_suppressed', key);
      continue;
    }
    byKey.set(key, event);
  }
  return sortDispatchEvents([...byKey.values()]);
}

function severityFromRouteDifficulty(difficulty: string | null | undefined): DispatchEventSeverity | null {
  switch (difficulty) {
    case 'difficult':
      return 'warning';
    case 'challenging':
      return 'watch';
    default:
      return null;
  }
}

function severityFromTerrainRisk(risk: string | null | undefined): DispatchEventSeverity | null {
  switch (risk) {
    case 'SEVERE':
      return 'critical';
    case 'HIGH':
      return 'warning';
    default:
      return null;
  }
}

function severityFromResourceLevel(level: string | null | undefined): DispatchEventSeverity | null {
  switch (level) {
    case 'Resources Insufficient':
      return 'critical';
    case 'Resources Limited':
      return 'warning';
    case 'Watch Consumption':
      return 'watch';
    default:
      return null;
  }
}

export function buildWeatherEvents(weatherState?: WeatherStateInput | null): DispatchEvent[] {
  const alerts = weatherAlerts(weatherState);
  const source = weatherState?.status?.source ?? null;
  const freshness = resolveDispatchWeatherFreshness(weatherState);
  const zeroReasonScope = JSON.stringify(normalizeForSignature(weatherSignature(weatherState)));
  if (!weatherState) {
    logWeatherZeroReason('missing_weather', zeroReasonScope);
    return [];
  }
  if (!hasDispatchWeatherData(weatherState)) {
    logWeatherZeroReason('missing_weather', zeroReasonScope);
    return [];
  }

  const live = isWeatherLive(source);
  const freshnessLabel = weatherFreshnessLabel(weatherState, source, freshness);
  const alertEvents = alerts.reduce<DispatchEvent[]>((events, alert, index) => {
    const rawSeverity = severityFromWeather(alert.severity);
    const severity = rawSeverity ? capStaleWeatherSeverity(rawSeverity, freshnessLabel) : null;
    if (!severity) {
      return events;
    }

    const title = cleanString(alert.title) || `${cleanString(alert.type) || 'Weather'} Alert`;
    const alertMessage = cleanString(alert.description ?? alert.body ?? alert.message)
      || `Weather alert near ${weatherState.locationName ?? weatherState.raw?.label ?? 'current position'}.`;
    const message = [
      freshnessLabel === 'stale' ? 'Stale weather advisory.' : 'Weather advisory.',
      `Forecast indicates ${title}.`,
      alertMessage,
      `Source freshness: ${freshnessLabel}.`,
      'Monitor conditions.',
    ].join(' ');
    const event = weatherEventCandidate(weatherState, {
      key: `alert-${alert.type ?? alert.title ?? index}-${alert.effective ?? alert.expires ?? ''}`,
      severity,
      title,
      message,
      timestamp: alert.effective ?? weatherState.fetchedAt,
      updatedAt: alert.expires ?? null,
      live,
    });
    if (event) {
      events.push(event);
    }

    return events;
  }, []);
  const conditionEvents = buildWeatherConditionEvents(weatherState, source);
  const events = dedupeWeatherEvents([...alertEvents, ...conditionEvents]);

  if (events.length === 0) {
    logWeatherZeroReason(
      freshness.stale
        ? 'stale_suppressed'
        : alerts.length > 0
          ? 'below_threshold'
          : 'no_alerts',
      zeroReasonScope,
    );
  }

  return events;
}

function buildRouteEvents(route?: ActiveRouteStateInput | null): DispatchEvent[] {
  if (!route || !HIGH_ROUTE_DIFFICULTIES.has(cleanString(route.overallDifficulty))) {
    return [];
  }

  const routeId = route.sourceId ?? route.id;
  const challengingSegment = route.segments?.find((segment) => HIGH_ROUTE_DIFFICULTIES.has(cleanString(segment.difficulty)));
  const severity = severityFromRouteDifficulty(route.overallDifficulty);
  if (!severity) {
    return [];
  }

  const segmentIndex = challengingSegment?.segmentIndex;
  const event = dispatchEvent({
    id: `live-route-${stableToken(routeId)}-${stableToken(route.overallDifficulty)}`,
    timestamp: validIsoOrNull(route.analyzedAt) ?? nowIso(),
    type: 'route',
    severity,
    title: `${cleanString(route.overallDifficulty).toUpperCase()} Route Condition`,
    message: `${route.routeName ?? 'Active route'} is rated ${route.overallDifficulty}. ${route.totalDistanceMiles?.toFixed?.(1) ?? '--'} mi / ${route.segmentCount ?? route.segments?.length ?? 0} segments.`,
    source: 'route_engine',
    location: locationFromCoordinates(challengingSegment?.coordinates),
    routeSegmentId: routeSegmentId(routeId, segmentIndex),
    requiresMapDrilldown: !!challengingSegment,
  });

  return event ? [event] : [];
}

function buildTerrainEvents(terrain?: TerrainRiskStateInput | null): DispatchEvent[] {
  if (!terrain || !HIGH_TERRAIN_RISKS.has(cleanString(terrain.overallRisk))) {
    return [];
  }

  const severity = severityFromTerrainRisk(terrain.overallRisk);
  if (!severity) {
    return [];
  }

  const routeId = terrain.routeIntelligenceId ?? terrain.id;
  const topWarnings = (terrain.terrainWarnings ?? []).slice(0, 3);
  if (topWarnings.length === 0) {
    const event = dispatchEvent({
      id: `live-terrain-${stableToken(routeId)}-${stableToken(terrain.overallRisk)}`,
      timestamp: validIsoOrNull(terrain.analyzedAt) ?? nowIso(),
      type: 'terrain',
      severity,
      title: `${terrain.overallRisk} Terrain Risk`,
      message: `${terrain.routeName ?? 'Active route'} has ${terrain.overallRisk?.toLowerCase()} terrain risk.`,
      source: 'terrain_engine',
      requiresMapDrilldown: false,
    });
    return event ? [event] : [];
  }

  return topWarnings.reduce<DispatchEvent[]>((events, warning) => {
    const event = dispatchEvent({
      id: `live-terrain-${stableToken(routeId)}-${warning.segmentIndex ?? 'route'}-${stableToken(warning.warningType)}`,
      timestamp: validIsoOrNull(terrain.analyzedAt) ?? nowIso(),
      type: 'terrain',
      severity,
      title: `${terrain.overallRisk} Terrain: ${cleanString(warning.warningType).replace(/_/g, ' ') || 'Route Warning'}`,
      message: cleanString(warning.message) || `${terrain.routeName ?? 'Active route'} terrain warning ${warning.segmentRange ?? ''}`.trim(),
      source: 'terrain_engine',
      routeSegmentId: routeSegmentId(routeId, warning.segmentIndex),
      requiresMapDrilldown: Number.isInteger(warning.segmentIndex),
    });
    if (event) {
      events.push(event);
    }

    return events;
  }, []);
}

function buildVehicleEvents(vehicle?: VehicleTelemetryStateInput | null): DispatchEvent[] {
  if (!vehicle?.hasData || !vehicle.lastUpdated) {
    return [];
  }

  const live = !!vehicle.isFresh && !vehicle.isShowingLastKnown;
  const source = sourceFromFreshness(live, 'vehicle_telemetry');
  const timestamp = eventTimestamp(live, vehicle.lastUpdated);
  const summary = vehicle.summary ?? {};
  const label = summary.device_name ? `${summary.device_name}: ` : '';
  const candidates: Array<{
    key: string;
    severity: DispatchEventSeverity;
    title: string;
    message: string;
  }> = [];

  if (typeof summary.coolant_temp === 'number') {
    if (summary.coolant_temp >= 230) {
      candidates.push({
        key: 'coolant-critical',
        severity: 'critical',
        title: 'Vehicle Temperature Critical',
        message: `${label}coolant temperature is ${Math.round(summary.coolant_temp)}F.`,
      });
    } else if (summary.coolant_temp >= 215) {
      candidates.push({
        key: 'coolant-warning',
        severity: 'warning',
        title: 'Vehicle Temperature Warning',
        message: `${label}coolant temperature is ${Math.round(summary.coolant_temp)}F.`,
      });
    }
  }

  if (typeof summary.fuel_level === 'number') {
    if (summary.fuel_level <= 10) {
      candidates.push({
        key: 'fuel-critical',
        severity: 'critical',
        title: 'Vehicle Fuel Critical',
        message: `${label}fuel level is ${Math.round(summary.fuel_level)}%.`,
      });
    } else if (summary.fuel_level <= 20) {
      candidates.push({
        key: 'fuel-warning',
        severity: 'warning',
        title: 'Vehicle Fuel Warning',
        message: `${label}fuel level is ${Math.round(summary.fuel_level)}%.`,
      });
    }
  }

  if (typeof summary.battery_voltage === 'number') {
    if (summary.battery_voltage <= 10.8) {
      candidates.push({
        key: 'battery-critical',
        severity: 'critical',
        title: 'Vehicle Battery Critical',
        message: `${label}battery voltage is ${summary.battery_voltage.toFixed(1)}V.`,
      });
    } else if (summary.battery_voltage <= 11.5) {
      candidates.push({
        key: 'battery-warning',
        severity: 'warning',
        title: 'Vehicle Battery Warning',
        message: `${label}battery voltage is ${summary.battery_voltage.toFixed(1)}V.`,
      });
    }
  }

  return candidates.reduce<DispatchEvent[]>((events, candidate) => {
    const event = dispatchEvent({
      id: `live-vehicle-${candidate.key}`,
      timestamp,
      type: 'vehicle',
      severity: candidate.severity,
      title: candidate.title,
      message: source === 'cache' ? `${candidate.message} Last-known telemetry.` : candidate.message,
      source,
      requiresMapDrilldown: false,
    });
    if (event) {
      events.push(event);
    }

    return events;
  }, []);
}

function buildResourceEvents(resource?: ResourceStateInput | null): DispatchEvent[] {
  if (!resource?.hasRealData || !resource.computedAt) {
    return [];
  }

  const severity = severityFromResourceLevel(resource.sufficiencyLevel);
  if (!severity) {
    return [];
  }

  const message = resource.drivers?.filter(Boolean).slice(0, 2).join(' / ')
    || resource.intelMessages?.find((intel) => intel.message)?.message
    || `Resource forecast is ${resource.sufficiencyLevel}.`;
  const event = dispatchEvent({
    id: `live-resources-${stableToken(resource.routeIntelligenceId)}-${stableToken(resource.sufficiencyLevel)}`,
    timestamp: validIsoOrNull(resource.computedAt) ?? nowIso(),
    type: 'resources',
    severity,
    title: `Resources: ${resource.sufficiencyLevel}`,
    message,
    source: 'resource_store',
    requiresMapDrilldown: false,
  });

  return event ? [event] : [];
}

function buildSyncEvents(sync?: SyncStateInput | null, team?: TeamStoreSnapshot | null): DispatchEvent[] {
  const events: DispatchEvent[] = [];
  const queuedCount = Number(sync?.queuedCount ?? 0) + Number(sync?.dirtyCount ?? 0);
  const canonical = resolveCanonicalConnectivityState({
    isOnline: sync?.isOnline,
    offlineMode: sync?.offlineMode,
    syncStatus: sync?.syncStatus,
    connectivityStatus: sync?.connectivity?.status,
    connectivity: sync?.connectivity,
  });
  const timestamp = validIsoOrNull(sync?.connectivity?.lastOfflineAt) ?? nowIso();

  const syncLogSignature = JSON.stringify({
    reason: team?.activeTeam ? canonical.reason : 'no_team',
    networkOnline: canonical.networkOnline,
    userForcedOfflineMode: canonical.userForcedOfflineMode,
    effectiveOfflineMode: canonical.effectiveOfflineMode,
    syncAvailable: canonical.syncAvailable,
  });
  if (syncLogSignature !== lastSyncStateLogSignature) {
    lastSyncStateLogSignature = syncLogSignature;
    ecsLog.dev('SYSTEM', 'sync_state', {
      reason: team?.activeTeam ? canonical.reason : 'no_team',
      networkOnline: canonical.networkOnline,
      userForcedOfflineMode: canonical.userForcedOfflineMode,
      effectiveOfflineMode: canonical.effectiveOfflineMode,
      syncAvailable: canonical.syncAvailable,
    }, {
      tag: '[DISPATCH_WIRE]',
      debugFlag: 'ECS_DEBUG_DISPATCH_WIRE',
      fingerprint: syncLogSignature,
      throttleMs: 5000,
      aggregateWindowMs: 30_000,
    });
  }

  if (!canonical.syncAvailable && team?.activeTeam) {
    const event = dispatchEvent({
      id: 'live-sync-offline',
      timestamp,
      type: 'sync',
      severity: 'warning',
      title: canonical.userForcedOfflineMode ? 'Offline Mode Active' : 'Dispatch Sync Offline',
      message: queuedCount > 0
        ? `${queuedCount} dispatch or app changes queued until service returns.`
        : canonical.userForcedOfflineMode
          ? 'Offline mode is active. Team updates remain local until online mode resumes.'
          : 'Live sync unavailable. ECS is using local state.',
      source: 'sync_state',
      requiresMapDrilldown: false,
    });
    if (event) {
      events.push(event);
    }
  } else if (queuedCount > 0) {
    const event = dispatchEvent({
      id: 'live-sync-queued',
      timestamp: nowIso(),
      type: 'sync',
      severity: 'watch',
      title: 'Dispatch Sync Queued',
      message: `${queuedCount} dispatch or app changes waiting to sync.`,
      source: 'sync_state',
      requiresMapDrilldown: false,
    });
    if (event) {
      events.push(event);
    }
  }

  if (!canonical.syncAvailable && team?.activeTeam) {
    const event = dispatchEvent({
      id: `live-sync-team-${stableToken(team.activeTeam.id)}`,
      timestamp,
      type: 'sync',
      severity: 'watch',
      title: 'Team Sync Unavailable',
      message: canonical.userForcedOfflineMode
        ? `${team.activeTeam.name} team updates are paused while offline mode is active.`
        : `${team.activeTeam.name} team updates are unavailable until connectivity returns.`,
      source: 'sync_state',
      requiresMapDrilldown: false,
    });
    if (event) {
      events.push(event);
    }
  }

  return events;
}

function dedupeEvents(events: DispatchEvent[]): DispatchEvent[] {
  const byKey = new Map<string, DispatchEvent>();
  sortDispatchEvents(events).forEach((event) => {
    const key = dedupeKey(event);
    if (!byKey.has(key)) {
      byKey.set(key, event);
    }
  });
  return sortDispatchEvents([...byKey.values()]);
}

export function buildLiveDispatchEvents({
  weatherState,
  activeRouteState,
  terrainRiskState,
  vehicleTelemetryState,
  resourceState,
  syncState,
  teamState,
  recoveryState,
}: LiveDispatchEventInput): DispatchEvent[] {
  const inputSignature = liveDispatchInputSignature({
    weatherState,
    activeRouteState,
    terrainRiskState,
    vehicleTelemetryState,
    resourceState,
    syncState,
    teamState,
    recoveryState,
  });
  if (inputSignature === lastLiveDispatchInputSignature) {
    return lastLiveDispatchEvents;
  }

  const weatherEvents = weatherState ? buildWeatherEvents(weatherState) : [];
  logCount('weather_events', weatherEvents.length);

  const routeEvents = buildRouteEvents(activeRouteState);
  logCount('route_events', routeEvents.length);

  const terrainEvents = buildTerrainEvents(terrainRiskState);
  logCount('terrain_events', terrainEvents.length);

  const vehicleEvents = buildVehicleEvents(vehicleTelemetryState);
  logCount('vehicle_events', vehicleEvents.length);

  const resourceEvents = buildResourceEvents(resourceState);
  logCount('resource_events', resourceEvents.length);

  const syncEvents = buildSyncEvents(syncState, teamState);
  logCount('sync_events', syncEvents.length);

  const teamEvents: DispatchEvent[] = [];
  logCount('team_events', teamEvents.length);

  const recoveryEvents = recoveryState?.events ?? [];

  const allEvents = [
    ...weatherEvents,
    ...routeEvents,
    ...terrainEvents,
    ...vehicleEvents,
    ...resourceEvents,
    ...syncEvents,
    ...teamEvents,
    ...recoveryEvents,
  ];
  const dedupedEvents = dedupeEvents(allEvents);
  const nextEventFingerprint = createLiveDispatchEventListFingerprint(dedupedEvents);
  if (nextEventFingerprint === lastLiveDispatchEventFingerprint) {
    lastLiveDispatchInputSignature = inputSignature;
    return lastLiveDispatchEvents;
  }

  logCount('deduped', allEvents.length - dedupedEvents.length);
  logCount('final_events', dedupedEvents.length);

  lastLiveDispatchInputSignature = inputSignature;
  lastLiveDispatchEventFingerprint = nextEventFingerprint;
  lastLiveDispatchEvents = dedupedEvents.length > 0 ? dedupedEvents : EMPTY_DISPATCH_EVENTS;
  return lastLiveDispatchEvents;
}

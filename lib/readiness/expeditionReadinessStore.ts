import { getActiveVehicleState, subscribeActiveVehicleState } from '../fleet/activeVehicleState';
import { connectivity } from '../connectivity';
import { evaluateCacheReadiness } from '../offlineCacheAwarenessEngine';
import { powerSetupStore } from '../powerSetupStore';
import { routeStore } from '../routeStore';
import { tileCacheStore } from '../tileCacheStore';
import { gpsUIState } from '../gpsUIState';
import { bailoutStore } from '../bailoutStore';
import { buildRouteBailoutCandidates } from '../bailoutIntelligence';
import {
  buildEnvironmentSnapshot,
  formatSunlightCountdownValue,
  getSunlightCountdownLabel,
} from '../environmentSnapshotService';
import {
  getSharedOperationalWeatherState,
  subscribeSharedOperationalWeather,
} from '../useOperationalWeather';
import {
  navigateRouteSessionStore,
  type NavigateRouteSessionSnapshot,
} from '../navigateRouteSessionStore';
import {
  buildExpeditionReadiness,
} from './expeditionReadinessScoring';
import {
  buildExpeditionReadinessAlerts,
  selectPrimaryReadinessAlert,
  type ExpeditionReadinessAlert,
} from './expeditionReadinessAlerts';
import {
  expeditionReadinessPreferencesStore,
  getReadinessAlertTuning,
  normalizeExpeditionReadinessPreferences,
  type ExpeditionReadinessPreferences,
} from './expeditionReadinessPreferences';
import { buildReadinessVehicleInputFromFleetState } from './fleetReadinessAdapter';
import { buildRecoveryReadinessInput } from './recoveryReadinessAdapter';
import { buildPowerReadinessInput } from './powerReadinessAdapter';
import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessFreshnessRecord,
  ExpeditionReadinessInput,
  ExpeditionReadinessSourceFreshness,
  ExpeditionReadinessSourceKind,
  ExpeditionTripIntent,
  ExpeditionTripIntentSource,
} from './expeditionReadinessTypes';

type ReadinessListener = () => void;
export type ExpeditionReadinessSourceKey = keyof ExpeditionReadinessSourceFreshness;

export type ExpeditionReadinessStoreState = {
  currentAssessment: ExpeditionReadinessAssessment | null;
  assessmentHistory: ExpeditionReadinessAssessment[];
  lastAssessmentAt: string | null;
  activeTripId: string | null;
  activeRouteId: string | null;
  readinessMode: 'planning' | 'active';
  tripIntent: ExpeditionTripIntent;
  tripIntentSource: ExpeditionTripIntentSource;
  isUsingDemoData: boolean;
  inputFreshness: ExpeditionReadinessSourceFreshness | null;
  inputPatch: ExpeditionReadinessInput;
  isAutoRefreshActive: boolean;
  activeReadinessAlert: ExpeditionReadinessAlert | null;
  readinessAlertHistory: ExpeditionReadinessAlert[];
  readinessPreferences: ExpeditionReadinessPreferences;
};

type ReadinessRecomputeOptions = {
  immediate?: boolean;
  reason?: string;
};

const HISTORY_LIMIT = 20;
const ALERT_HISTORY_LIMIT = 12;
const RECOMPUTE_DEBOUNCE_MS = 700;
const FRESHNESS_TICK_MS = 60_000;
const WEATHER_STALE_MINUTES = 90;
const WEATHER_SNAPSHOT_AVAILABLE_MINUTES = 60;
const LOCATION_STALE_ACTIVE_MINUTES = 5;
const POWER_STALE_CONNECTED_MINUTES = 5;
const ROUTE_STALE_MINUTES = 12 * 60;
const OFFLINE_STALE_MINUTES = 24 * 60;

const listeners = new Set<ReadinessListener>();
let sourceUnsubscribers: Array<() => void> = [];
let recomputeTimer: ReturnType<typeof setTimeout> | null = null;
let freshnessTimer: ReturnType<typeof setInterval> | null = null;
let lastInputSignature: string | null = null;
let freshnessOverrides: Partial<ExpeditionReadinessSourceFreshness> = {};
let lastAlertAtByTrigger: Record<string, string> = {};
let globalLastAlertAt: string | null = null;

let state: ExpeditionReadinessStoreState = {
  currentAssessment: null,
  assessmentHistory: [],
  lastAssessmentAt: null,
  activeTripId: null,
  activeRouteId: null,
  readinessMode: 'planning',
  tripIntent: 'unknown',
  tripIntentSource: 'unknown',
  isUsingDemoData: false,
  inputFreshness: null,
  inputPatch: {},
  isAutoRefreshActive: false,
  activeReadinessAlert: null,
  readinessAlertHistory: [],
  readinessPreferences: expeditionReadinessPreferencesStore.getSnapshot(),
};

function getPowerIntelligenceSnapshotSafe() {
  try {
    return require('../powerIntelligence').ecsPowerIntelligence.getSnapshot();
  } catch {
    return null;
  }
}

function subscribePowerIntelligenceSafe(listener: () => void): () => void {
  try {
    const authority = require('../powerIntelligence').ecsPowerIntelligence;
    if (authority?.subscribe) {
      return authority.subscribe(listener);
    }
  } catch {}
  return () => undefined;
}

function notify(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, nextValue) => {
      if (typeof nextValue === 'number' && !Number.isFinite(nextValue)) return null;
      if (nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue)) {
        const record = nextValue as Record<string, unknown>;
        return Object.keys(record)
          .sort()
          .reduce<Record<string, unknown>>((output, key) => {
            output[key] = record[key];
            return output;
          }, {});
      }
      return nextValue;
    });
  } catch {
    return String(Date.now());
  }
}

function freshnessRecord(
  label: string,
  options: {
    source?: ExpeditionReadinessSourceKind;
    updatedAt?: string | null;
    isStale?: boolean;
    isMissing?: boolean;
    isMock?: boolean;
    isDemo?: boolean;
    isInferred?: boolean;
    detail?: string | null;
  } = {},
): ExpeditionReadinessFreshnessRecord {
  const source = options.source ?? (options.isMissing ? 'missing' : 'unknown');
  const isMissing = options.isMissing ?? source === 'missing';
  const isMock = options.isMock ?? source === 'mock';
  const isDemo = options.isDemo ?? source === 'demo';
  const isInferred = options.isInferred ?? source === 'inferred';
  const isStale = options.isStale ?? false;
  return {
    label,
    source,
    updatedAt: options.updatedAt ?? null,
    state: isMissing
      ? 'missing'
      : isDemo
        ? 'demo'
        : isMock
          ? 'mock'
          : isInferred
            ? 'inferred'
            : isStale
              ? 'stale'
              : source === 'manual'
                ? 'manual'
                : source === 'unknown'
                  ? 'unknown'
                  : 'fresh',
    isStale,
    isMissing,
    isMock,
    isDemo,
    isInferred,
    detail: options.detail ?? null,
  };
}

function isStaleIso(updatedAt: string | null | undefined, staleAfterMinutes: number, nowMs = Date.now()): boolean {
  if (!updatedAt) return false;
  const parsed = Date.parse(updatedAt);
  if (!Number.isFinite(parsed)) return false;
  return nowMs - parsed > staleAfterMinutes * 60 * 1000;
}

function routeDistanceMilesFromSession(snapshot: NavigateRouteSessionSnapshot): number | null {
  if (typeof snapshot.remainingDistanceM === 'number' && Number.isFinite(snapshot.remainingDistanceM)) {
    return Math.round((snapshot.remainingDistanceM / 1609.344) * 10) / 10;
  }
  return null;
}

function buildRouteInput() {
  const session = navigateRouteSessionStore.getSnapshot();
  if (session.lifecycle !== 'inactive') {
    return {
      routeId: session.routeId ?? session.sessionId,
      name: session.routeTitle ?? session.statusLabel,
      distanceMiles: routeDistanceMilesFromSession(session),
      difficulty: 'unknown' as const,
      riskLevel: session.isOffRoute ? 'high' as const : session.isRerouting ? 'moderate' as const : 'unknown' as const,
      routeConfidence: session.isOffRoute ? 'low' as const : session.lifecycle === 'active' ? 'high' as const : 'medium' as const,
      knownHazards: session.isOffRoute ? ['Off route'] : [],
      source: 'live' as const,
      updatedAt: session.updatedAt ?? new Date().toISOString(),
      isStale: isStaleIso(session.updatedAt, ROUTE_STALE_MINUTES),
    };
  }

  const activeRoute = routeStore.getActive();
  if (!activeRoute) return null;
  return {
    routeId: activeRoute.id,
    name: activeRoute.name,
    distanceMiles: activeRoute.total_distance_miles,
    difficulty: 'unknown' as const,
    riskLevel: 'unknown' as const,
    routeConfidence: 'medium' as const,
    knownHazards: [],
    source: activeRoute.sync_status === 'synced' ? 'cached' as const : 'manual' as const,
    updatedAt: activeRoute.updated_at,
    isStale: isStaleIso(activeRoute.updated_at, ROUTE_STALE_MINUTES),
  };
}

function buildVehicleInput() {
  const vehicleState = getActiveVehicleState();
  return buildReadinessVehicleInputFromFleetState(vehicleState);
}

function buildFuelInput() {
  const vehicleState = getActiveVehicleState();
  if (!vehicleState.identity.hasVehicle) return null;
  const avgMpg = typeof vehicleState.vehicle?.avg_mpg === 'number' ? vehicleState.vehicle.avg_mpg : null;
  const rangeRemainingMiles =
    avgMpg != null && avgMpg > 0 && vehicleState.capability.currentFuelGallons > 0
      ? Math.round(vehicleState.capability.currentFuelGallons * avgMpg)
      : null;
  if (rangeRemainingMiles == null && vehicleState.capability.currentFuelPercent == null) return null;
  return {
    rangeRemainingMiles,
    routeDistanceRemainingMiles: routeDistanceMilesFromSession(navigateRouteSessionStore.getSnapshot()) ?? routeStore.getActive()?.total_distance_miles ?? null,
    fuelPercent: vehicleState.capability.currentFuelPercent,
    source: 'manual' as const,
    updatedAt: vehicleState.updatedAt,
  };
}

function isRemoteRouteForOffline(route: ReturnType<typeof buildRouteInput>): boolean {
  if (!route) return false;
  const riskLevel = String(route.riskLevel ?? 'unknown');
  const difficulty = String(route.difficulty ?? 'unknown');
  return (
    riskLevel === 'high'
    || riskLevel === 'critical'
    || difficulty === 'hard'
    || difficulty === 'technical'
    || (typeof route.distanceMiles === 'number' && route.distanceMiles >= 40)
  );
}

function isRecentIso(updatedAt: string | null | undefined, minutes: number, nowMs = Date.now()): boolean {
  if (!updatedAt) return false;
  const parsed = Date.parse(updatedAt);
  if (!Number.isFinite(parsed)) return false;
  return nowMs - parsed <= minutes * 60 * 1000;
}

function buildOfflineInput(
  activeRouteId: string | null,
  route: ReturnType<typeof buildRouteInput>,
  weather: ReturnType<typeof buildWeatherInput>,
) {
  try {
    const snapshot = evaluateCacheReadiness();
    const bailoutCount = bailoutStore.count();
    const routeDownloaded = activeRouteId ? snapshot.cached_route_available || snapshot.expedition_data_covers_route : snapshot.cached_route_available;
    const mapsDownloaded = snapshot.cached_region_available || snapshot.cached_tile_count > 0;
    const routeGeometryCached = routeDownloaded;
    const mapTilesCachedForRoute = activeRouteId ? snapshot.cached_route_available : mapsDownloaded;
    const expeditionDataAvailable = snapshot.expedition_data_cached || snapshot.expedition_data_covers_route;
    const hasAnyOffline = snapshot.offline_cache_ready || snapshot.expedition_data_cached || mapsDownloaded || routeDownloaded;
    const packageFresh = !isStaleIso(snapshot.evaluated_at, OFFLINE_STALE_MINUTES);
    const weatherSnapshotAvailable = weather
      ? weather.source === 'live' && weather.isStale !== true
        ? true
        : isRecentIso(weather.updatedAt, WEATHER_SNAPSHOT_AVAILABLE_MINUTES)
      : null;
    return {
      routeDownloaded,
      routeGeometryCached,
      mapsDownloaded,
      mapTilesCachedForRoute,
      campIntelDownloaded: expeditionDataAvailable,
      campCandidatesCached: expeditionDataAvailable,
      bailoutPointsCached: expeditionDataAvailable || bailoutCount > 0 ? true : null,
      weatherSnapshotAvailable,
      fuelTownRoadReferencesCached: expeditionDataAvailable ? true : null,
      emergencyDocsAvailable: null,
      emergencyPacketAvailable: null,
      currentRoutePackageFresh: packageFresh,
      routePackageAgeHours:
        snapshot.evaluated_at && Number.isFinite(Date.parse(snapshot.evaluated_at))
          ? Math.max(0, (Date.now() - Date.parse(snapshot.evaluated_at)) / (60 * 60 * 1000))
          : null,
      cachedTileCount: snapshot.cached_tile_count,
      cachedRegionCount: snapshot.cached_region_count,
      isRemoteRoute: isRemoteRouteForOffline(route),
      isOnline: connectivity.isOnline(),
      packageStatus: routeDownloaded && mapsDownloaded ? 'ready' as const : hasAnyOffline ? 'partial' as const : 'missing' as const,
      source: 'cached' as const,
      updatedAt: snapshot.evaluated_at || new Date().toISOString(),
      isStale: !packageFresh,
    };
  } catch {
    return null;
  }
}

function buildPowerInput(sourceInput: Pick<ExpeditionReadinessInput, 'route' | 'offline' | 'campCandidates' | 'plannedDepartureAt' | 'daylight'>) {
  try {
    return buildPowerReadinessInput({
      sourceInput,
      primaryDevice: powerSetupStore.getPrimary(),
      intelligence: getPowerIntelligenceSnapshotSafe(),
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return buildPowerReadinessInput({
      sourceInput,
      primaryDevice: null,
      intelligence: null,
      updatedAt: new Date().toISOString(),
    });
  }
}

function buildLocationInput() {
  const gps = gpsUIState.get();
  if (!gps.position || !gps.hasFix) return null;
  const updatedAt = new Date(gps.position.timestamp).toISOString();
  const activeGuidance = navigateRouteSessionStore.getSnapshot().lifecycle === 'active';
  return {
    latitude: gps.position.latitude,
    longitude: gps.position.longitude,
    accuracyMeters: gps.position.accuracyM,
    source: 'live' as const,
    updatedAt,
    isStale: activeGuidance && isStaleIso(updatedAt, LOCATION_STALE_ACTIVE_MINUTES),
  };
}

function hasUsableWeatherState(state: ReturnType<typeof getSharedOperationalWeatherState>): boolean {
  const snapshot = state.snapshot;
  return Boolean(
    snapshot.raw ||
    state.result?.data?.results?.length ||
    snapshot.alerts.length ||
    snapshot.daily.length ||
    snapshot.current.temp != null ||
    snapshot.current.windSpeed != null ||
    snapshot.current.condition ||
    snapshot.current.description,
  );
}

function weatherUpdatedAt(state: ReturnType<typeof getSharedOperationalWeatherState>): string | null {
  const snapshot = state.snapshot;
  if (state.result?.data?.fetched_at) return state.result.data.fetched_at;
  if (snapshot.fetchedAt) return snapshot.fetchedAt;
  if (snapshot.normalized.updatedAt) return snapshot.normalized.updatedAt;
  if (typeof state.result?.cachedAt === 'number') return new Date(state.result.cachedAt).toISOString();
  if (typeof snapshot.status.cachedAt === 'number') return new Date(snapshot.status.cachedAt).toISOString();
  if (typeof snapshot.status.timestampMs === 'number') return new Date(snapshot.status.timestampMs).toISOString();
  return null;
}

function buildWeatherInput() {
  try {
    const sharedWeather = getSharedOperationalWeatherState();
    if (!hasUsableWeatherState(sharedWeather)) return null;
    const snapshot = sharedWeather.snapshot;
    const updatedAt = weatherUpdatedAt(sharedWeather);
    const windMph = snapshot.current.windGust ?? snapshot.current.windSpeed ?? null;
    const severeAlertActive = snapshot.alerts.some((alert) => alert.severity === 'warning' || alert.severity === 'extreme');
    const riskLevel =
      snapshot.alerts.some((alert) => alert.severity === 'extreme')
        ? 'critical' as const
        : severeAlertActive || (typeof windMph === 'number' && windMph >= 35)
          ? 'high' as const
          : (typeof windMph === 'number' && windMph >= 20) || (snapshot.current.precipChance ?? 0) >= 60
            ? 'moderate' as const
            : 'low' as const;
    const temp = snapshot.current.feelsLike ?? snapshot.current.temp;
    const temperatureRisk =
      typeof temp === 'number' && Number.isFinite(temp)
        ? temp >= 95 || temp <= 20
          ? 'high' as const
          : temp >= 85 || temp <= 32
            ? 'moderate' as const
            : 'low' as const
        : 'unknown' as const;
    const source =
      snapshot.status.source === 'live'
        ? 'live' as const
        : snapshot.status.source === 'cache_fresh' || snapshot.status.source === 'cache_stale'
          ? 'cached' as const
          : 'unknown' as const;
    const staleFromSource =
      snapshot.status.stale ||
      snapshot.status.freshness === 'stale' ||
      snapshot.status.freshness === 'very_stale';
    return {
      riskLevel,
      severeAlertActive,
      precipitationChancePercent: snapshot.current.precipChance,
      windMph,
      temperatureRisk,
      confidence: staleFromSource ? 'low' as const : source === 'live' ? 'high' as const : 'medium' as const,
      source,
      updatedAt,
      isStale: staleFromSource || isStaleIso(updatedAt, WEATHER_STALE_MINUTES),
    };
  } catch {
    return null;
  }
}

function buildDaylightInput(
  weatherState: ReturnType<typeof getSharedOperationalWeatherState> | null,
  currentLocation: ReturnType<typeof buildLocationInput>,
) {
  try {
    const snapshot = weatherState?.snapshot ?? null;
    const weatherAt = weatherState ? weatherUpdatedAt(weatherState) : null;
    const coordinate =
      currentLocation
        ? {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            accuracyM: currentLocation.accuracyMeters,
            source: 'gps' as const,
            updatedAt: currentLocation.updatedAt,
          }
        : snapshot?.location.lat != null && snapshot.location.lng != null
          ? {
              latitude: snapshot.location.lat,
              longitude: snapshot.location.lng,
              accuracyM: snapshot.location.accuracyM,
              source: 'weather_provider' as const,
              updatedAt: weatherAt,
            }
          : null;
    const environment = buildEnvironmentSnapshot({
      coordinate,
      solarTimes: snapshot
        ? {
            sunrise: snapshot.current.sunrise,
            sunset: snapshot.current.sunset,
            source: 'weather_provider',
            updatedAt: weatherAt,
          }
        : null,
    });
    const sunlight = environment.sunlight;
    if (sunlight.remainingMinutes == null || sunlight.nextEvent == null || sunlight.status === 'unavailable') {
      return null;
    }
    return {
      minutesRemainingAtArrival: sunlight.remainingMinutes,
      arrivalAfterDark: false,
      sunlightStatus: sunlight.status,
      nextSunEvent: sunlight.nextEvent,
      sunlightLabel: getSunlightCountdownLabel(sunlight),
      sunlightSummary: `${getSunlightCountdownLabel(sunlight)}: ${formatSunlightCountdownValue(sunlight)}.`,
      confidence: sunlight.confidence === 'high' ? 'high' as const : sunlight.confidence === 'medium' ? 'medium' as const : 'low' as const,
      source: sunlight.source === 'weather_provider' ? 'live' as const : 'inferred' as const,
      updatedAt: sunlight.nextEventIso ?? weatherAt ?? currentLocation?.updatedAt ?? new Date().toISOString(),
      isStale: false,
      isInferred: sunlight.source !== 'weather_provider',
    };
  } catch {
    return null;
  }
}

function buildCampCandidatesPlaceholder() {
  return null;
}

function buildRecoveryInput(
  route: ReturnType<typeof buildRouteInput>,
  activeVehicle: ReturnType<typeof buildVehicleInput>,
  communications: ReturnType<typeof buildCommunicationsInput>,
  currentLocation: ReturnType<typeof buildLocationInput>,
  capturedAt: string,
) {
  try {
    const routeSession = navigateRouteSessionStore.getSnapshot();
    const routeId = route?.routeId ?? routeSession.routeId ?? null;
    const importedRoute = routeId ? routeStore.getById(routeId) : routeStore.getActive();
    const routeBailouts = routeId ? bailoutStore.getRunBailouts(routeId) : [];
    const allBailouts = bailoutStore.getAll();
    const routeDerivedBailouts = buildRouteBailoutCandidates({
      routeId,
      routeName: route?.name ?? routeSession.routeTitle ?? importedRoute?.name ?? null,
      sessionRoutePoints: routeSession.routePoints,
      importedRoute,
      manualBailouts: routeBailouts.length > 0 ? routeBailouts : allBailouts,
    });
    return buildRecoveryReadinessInput({
      route,
      activeVehicle,
      communications,
      currentLocation,
      routeBailouts: routeDerivedBailouts.length > 0 ? routeDerivedBailouts : routeBailouts.length > 0 ? routeBailouts : allBailouts,
      allBailouts,
      capturedAt,
    });
  } catch {
    return null;
  }
}

function buildCommunicationsInput() {
  try {
    const detail = connectivity.getDetailedState();
    const level = detail.level;
    return {
      signalConfidence: level === 'normal' ? 'high' as const : level === 'limited' ? 'medium' as const : level === 'no_service' ? 'low' as const : null,
      satelliteCommsReady: null,
      teamCheckInPlanReady: null,
      cellularExpected: detail.networkType === 'cellular' ? detail.isOnline : null,
      source: detail.initialized ? 'live' as const : 'unknown' as const,
      updatedAt: detail.lastOnlineAt ?? detail.lastOfflineAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function buildTelemetryInput() {
  const gps = gpsUIState.get();
  return {
    vehicleTelemetryLive: null,
    lastKnownUsable: gps.hasFix || gps.position != null,
    source: gps.hasFix ? 'live' as const : 'unknown' as const,
    updatedAt: gps.position ? new Date(gps.position.timestamp).toISOString() : null,
  };
}

function mergeInput(base: ExpeditionReadinessInput, patch: ExpeditionReadinessInput): ExpeditionReadinessInput {
  return {
    ...base,
    ...patch,
  };
}

function applyFreshnessWindows(input: ExpeditionReadinessInput): ExpeditionReadinessInput {
  const activeGuidance = navigateRouteSessionStore.getSnapshot().lifecycle === 'active';
  return {
    ...input,
    route: input.route
      ? { ...input.route, isStale: input.route.isStale ?? isStaleIso(input.route.updatedAt, ROUTE_STALE_MINUTES) }
      : input.route,
    weather: input.weather
      ? { ...input.weather, isStale: input.weather.isStale ?? isStaleIso(input.weather.updatedAt, WEATHER_STALE_MINUTES) }
      : input.weather,
    offline: input.offline
      ? { ...input.offline, isStale: input.offline.isStale ?? isStaleIso(input.offline.updatedAt, OFFLINE_STALE_MINUTES) }
      : input.offline,
    power: input.power
      ? {
          ...input.power,
          isStale: input.power.isStale ?? (
            input.power.source === 'live'
              ? isStaleIso(input.power.updatedAt, POWER_STALE_CONNECTED_MINUTES)
              : false
          ),
        }
      : input.power,
    currentLocation: input.currentLocation
      ? {
          ...input.currentLocation,
          isStale: input.currentLocation.isStale ?? (
            activeGuidance
              ? isStaleIso(input.currentLocation.updatedAt, LOCATION_STALE_ACTIVE_MINUTES)
              : false
          ),
        }
      : input.currentLocation,
  };
}

function applyFreshnessOverrides(
  assessment: ExpeditionReadinessAssessment,
  overrides: Partial<ExpeditionReadinessSourceFreshness> | null | undefined,
): ExpeditionReadinessAssessment {
  if (!overrides || Object.keys(overrides).length === 0) return assessment;
  return {
    ...assessment,
    sourceFreshness: {
      ...assessment.sourceFreshness,
      ...overrides,
    },
  };
}

function buildSourceInput(): ExpeditionReadinessInput {
  const capturedAt = new Date().toISOString();
  const route = buildRouteInput();
  const activeRouteId = route?.routeId ?? null;
  const activeVehicle = buildVehicleInput();
  const communications = buildCommunicationsInput();
  const currentLocation = buildLocationInput();
  const weatherState = (() => {
    try {
      return getSharedOperationalWeatherState();
    } catch {
      return null;
    }
  })();
  const weather = buildWeatherInput();
  const daylight = buildDaylightInput(weatherState, currentLocation);
  const campCandidates = buildCampCandidatesPlaceholder();
  const offline = buildOfflineInput(activeRouteId, route, weather);
  const plannedDepartureAt = null;
  const power = buildPowerInput({ route, offline, campCandidates, daylight, plannedDepartureAt });
  return {
    capturedAt,
    plannedDepartureAt,
    route,
    activeVehicle,
    weather,
    daylight,
    offline,
    campCandidates,
    fuel: buildFuelInput(),
    power,
    recovery: buildRecoveryInput(route, activeVehicle, communications, currentLocation, capturedAt),
    communications,
    telemetry: buildTelemetryInput(),
    currentLocation,
    readinessPreferences: state.readinessPreferences,
  };
}

function currentFreshnessOverrides(): Partial<ExpeditionReadinessSourceFreshness> {
  return freshnessOverrides;
}

function commitAssessment(assessment: ExpeditionReadinessAssessment, activeRouteId: string | null): void {
  const previousAssessment = state.currentAssessment;
  const previousActiveRouteId = state.activeRouteId;
  const history = state.currentAssessment
    ? [state.currentAssessment, ...state.assessmentHistory].slice(0, HISTORY_LIMIT)
    : state.assessmentHistory;
  const candidateAlerts = buildExpeditionReadinessAlerts(previousAssessment, assessment, {
    isActiveExpedition: state.readinessMode === 'active',
    previousActiveRouteId,
    activeRouteId,
    lastAlertAtByTrigger,
    globalLastAlertAt,
    ...getReadinessAlertTuning(state.readinessPreferences),
  });
  const nextAlert = selectPrimaryReadinessAlert(candidateAlerts);
  if (nextAlert) {
    lastAlertAtByTrigger = {
      ...lastAlertAtByTrigger,
      [nextAlert.triggerKey]: nextAlert.createdAt,
    };
    globalLastAlertAt = nextAlert.createdAt;
  }
  const activeReadinessAlert = nextAlert
    ?? (assessment.status === 'ready' && state.activeReadinessAlert?.severity !== 'info'
      ? null
      : state.activeReadinessAlert);
  state = {
    ...state,
    currentAssessment: assessment,
    assessmentHistory: history,
    lastAssessmentAt: assessment.updatedAt,
    activeRouteId,
    tripIntent: assessment.tripIntent,
    tripIntentSource: assessment.tripIntentSource,
    isUsingDemoData: assessment.dataIntegrity.usesDemoData || assessment.dataIntegrity.usesMockData,
    inputFreshness: assessment.sourceFreshness,
    readinessPreferences: assessment.readinessPreferences,
    activeReadinessAlert,
    readinessAlertHistory: nextAlert
      ? [nextAlert, ...state.readinessAlertHistory].slice(0, ALERT_HISTORY_LIMIT)
      : state.readinessAlertHistory,
  };
  notify();
}

function recomputeNow(): ExpeditionReadinessAssessment {
  const baseInput = buildSourceInput();
  const input = applyFreshnessWindows(mergeInput(baseInput, state.inputPatch));
  const activeRouteId = input.route?.routeId ?? null;
  const inputSignature = stableStringify({ input, freshness: currentFreshnessOverrides() });

  if (inputSignature === lastInputSignature && state.currentAssessment) {
    return state.currentAssessment;
  }

  lastInputSignature = inputSignature;
  const assessment = applyFreshnessOverrides(buildExpeditionReadiness(input), currentFreshnessOverrides());
  commitAssessment(assessment, activeRouteId);
  return assessment;
}

function scheduleRecompute(options: ReadinessRecomputeOptions = {}): void {
  if (recomputeTimer) {
    clearTimeout(recomputeTimer);
    recomputeTimer = null;
  }
  if (options.immediate) {
    recomputeNow();
    return;
  }
  recomputeTimer = setTimeout(() => {
    recomputeTimer = null;
    recomputeNow();
  }, RECOMPUTE_DEBOUNCE_MS);
}

function ensureSourceSubscriptions(): void {
  if (sourceUnsubscribers.length > 0) return;
  const onSourceChange = () => scheduleRecompute({ reason: 'source_change' });
  sourceUnsubscribers = [
    subscribeActiveVehicleState(onSourceChange),
    routeStore.subscribe(onSourceChange),
    navigateRouteSessionStore.subscribe(onSourceChange),
    powerSetupStore.subscribe(onSourceChange),
    subscribePowerIntelligenceSafe(onSourceChange),
    subscribeSharedOperationalWeather(onSourceChange),
    tileCacheStore.subscribe(onSourceChange),
    gpsUIState.subscribe(onSourceChange),
    connectivity.onStatusChange(onSourceChange),
    expeditionReadinessPreferencesStore.subscribe((preferences) => {
      state = {
        ...state,
        readinessPreferences: normalizeExpeditionReadinessPreferences(preferences),
      };
      lastInputSignature = null;
      scheduleRecompute({ reason: 'readiness_preferences_change' });
    }),
  ];
  freshnessTimer = setInterval(() => {
    scheduleRecompute({ reason: 'freshness_tick' });
  }, FRESHNESS_TICK_MS);
  state = { ...state, isAutoRefreshActive: true };
  scheduleRecompute({ immediate: true, reason: 'subscription_start' });
}

function stopSourceSubscriptions(): void {
  sourceUnsubscribers.forEach((unsubscribe) => unsubscribe());
  sourceUnsubscribers = [];
  if (freshnessTimer) {
    clearInterval(freshnessTimer);
    freshnessTimer = null;
  }
  if (recomputeTimer) {
    clearTimeout(recomputeTimer);
    recomputeTimer = null;
  }
  state = { ...state, isAutoRefreshActive: false };
}

export const expeditionReadinessStore = {
  subscribe(listener: ReadinessListener): () => void {
    listeners.add(listener);
    ensureSourceSubscriptions();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        stopSourceSubscriptions();
      }
    };
  },

  getSnapshot(): ExpeditionReadinessStoreState {
    return state;
  },

  recomputeReadiness(options: ReadinessRecomputeOptions = {}): ExpeditionReadinessAssessment {
    if (options.immediate === false) {
      scheduleRecompute(options);
      return state.currentAssessment ?? recomputeNow();
    }
    return recomputeNow();
  },

  clearReadiness(): void {
    if (recomputeTimer) {
      clearTimeout(recomputeTimer);
      recomputeTimer = null;
    }
    lastInputSignature = null;
    freshnessOverrides = {};
    lastAlertAtByTrigger = {};
    globalLastAlertAt = null;
    state = {
      ...state,
      currentAssessment: null,
      assessmentHistory: [],
      lastAssessmentAt: null,
      activeTripId: null,
      activeRouteId: null,
      readinessMode: 'planning',
      tripIntent: 'unknown',
      tripIntentSource: 'unknown',
      isUsingDemoData: false,
      inputFreshness: null,
      inputPatch: {},
      activeReadinessAlert: null,
      readinessAlertHistory: [],
      readinessPreferences: expeditionReadinessPreferencesStore.getSnapshot(),
    };
    notify();
  },

  setReadinessInputPatch(patch: ExpeditionReadinessInput): ExpeditionReadinessAssessment {
    state = {
      ...state,
      inputPatch: mergeInput(state.inputPatch, patch),
    };
    lastInputSignature = null;
    return recomputeNow();
  },

  setTripIntent(intent: ExpeditionTripIntent): ExpeditionReadinessAssessment {
    state = {
      ...state,
      tripIntent: intent,
      tripIntentSource: intent === 'unknown' ? 'unknown' : 'selected',
      inputPatch: {
        ...state.inputPatch,
        tripIntent: intent,
        tripIntentSource: intent === 'unknown' ? 'unknown' : 'selected',
        readinessProfile: null,
      },
    };
    lastInputSignature = null;
    return recomputeNow();
  },

  setReadinessPreferencePatch(
    patch: Partial<Omit<ExpeditionReadinessPreferences, 'updatedAt'>>,
  ): ExpeditionReadinessAssessment {
    const preferences = expeditionReadinessPreferencesStore.update(patch);
    state = {
      ...state,
      readinessPreferences: preferences,
    };
    lastInputSignature = null;
    return recomputeNow();
  },

  beginActiveExpedition(options: {
    activeRouteId?: string | null;
    activeTripId?: string | null;
  } = {}): ExpeditionReadinessAssessment {
    const routeSession = navigateRouteSessionStore.getSnapshot();
    const activeRouteId =
      options.activeRouteId ??
      routeSession.routeId ??
      state.activeRouteId ??
      state.inputPatch.route?.routeId ??
      null;
    const activeTripId =
      options.activeTripId ??
      state.activeTripId ??
      (activeRouteId ? `trip:${activeRouteId}:${Date.now()}` : `trip:${Date.now()}`);

    state = {
      ...state,
      activeRouteId,
      activeTripId,
      readinessMode: 'active',
    };
    lastAlertAtByTrigger = {};
    globalLastAlertAt = null;
    lastInputSignature = null;
    return recomputeNow();
  },

  dismissReadinessAlert(alertId?: string | null): void {
    if (!state.activeReadinessAlert) return;
    if (alertId && state.activeReadinessAlert.id !== alertId) return;
    state = {
      ...state,
      activeReadinessAlert: null,
    };
    notify();
  },

  markReadinessSourceFreshness(
    source: ExpeditionReadinessSourceKey,
    patch: Partial<ExpeditionReadinessFreshnessRecord>,
  ): ExpeditionReadinessAssessment {
    const current = state.inputFreshness?.[source]
      ?? state.currentAssessment?.sourceFreshness[source]
      ?? freshnessRecord(source, { isMissing: true });
    const nextRecord: ExpeditionReadinessFreshnessRecord = {
      ...current,
      ...patch,
    };
    freshnessOverrides = {
      ...freshnessOverrides,
      [source]: nextRecord,
    };
    state = {
      ...state,
      inputFreshness: {
        ...(state.inputFreshness ?? state.currentAssessment?.sourceFreshness ?? buildExpeditionReadiness({}).sourceFreshness),
        [source]: nextRecord,
      },
    };
    lastInputSignature = null;
    return recomputeNow();
  },
};

import { Platform } from 'react-native';
import type {
  ECSVehiclePresentationModel,
  ECSVehicleSessionState,
  ModeOverrideSetting,
  ModeTransitionNotice,
  VehicleAction,
  VehicleActionType,
  VehicleAttitudeData,
  VehicleDataSource,
  VehicleDisplayMode,
  VehicleDisplayScreen,
  VehicleDisplayState,
  VehicleExitPlanData,
  VehicleIndicators,
  VehicleMapData,
  VehicleNavigationData,
  VehicleResourceData,
  VehicleRouteSessionState,
  VehicleSessionLogEntry,
  VehicleStatusData,
  VehicleSubsystemStatus,
  VehicleSystemHealth,
  VehicleSystemStatus,
  VehicleWeatherData,
  VehicleWeatherHazardData,
  VehicleWeatherAlert,
} from './vehicleDisplayTypes';
import type { PersistedRoadNavigationSession } from './roadNavigationStore';
import type { ECSWeatherSnapshot } from './ecsWeather';
import type { DashboardSourceCandidate } from './dashboardWidgetSources';
import {
  formatWeatherAlertLine,
  formatWeatherHeadline,
  formatWeatherWindLine,
} from './ecsWeather';
import {
  getSharedOperationalWeatherState,
  removeSharedOperationalWeatherConsumer,
  setSharedOperationalWeatherConsumer,
  subscribeSharedOperationalWeather,
} from './useOperationalWeather';
import {
  isVehicleDisplayRunning,
  setVehicleDisplayRunning,
} from './vehicleDisplayRuntime';
import { resolveDashboardValue } from './dashboardWidgetSources';
import { buildVehiclePresentationModel } from './vehiclePresentationModel';
import { reportLayoutFailure } from './ecsIssueReporter';
import { createInitialAIOrchestratorMemory, runECSAI } from './ai/aiOrchestrator';
import { selectAutomotiveCommandSurface } from './automotive/automotiveCommandSelectors';
import { createDefaultAutomotiveSurfaceState } from './automotive/automotiveSurfaceTypes';

const STORAGE_KEY = 'ecs_vehicle_display_state';
const REFRESH_INTERVAL_MS = 5_000;
const ATTITUDE_UPDATE_INTERVAL_MS = 400;
const MAX_SESSION_LOGS = 120;

const mem: Record<string, string> = {};

function sGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return mem[key] || null;
  } catch {
    return mem[key] || null;
  }
}

function sSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    mem[key] = value;
  } catch {
    mem[key] = value;
  }
}

function createDefaultIndicators(): VehicleIndicators {
  return {
    gpsSignal: 'none',
    connectivity: 'unknown',
    offlineMaps: false,
    batteryPercent: null,
    batteryCharging: false,
  };
}

function createDefaultSubsystem(label: string): VehicleSubsystemStatus {
  return {
    available: false,
    label,
    severity: 'unknown',
    detail: null,
    lastGoodDataAt: null,
    isStale: false,
    staleSinceMinutes: null,
  };
}

function createDefaultSystemHealth(): VehicleSystemHealth {
  return {
    gps: createDefaultSubsystem('GPS Unknown'),
    connectivity: createDefaultSubsystem('Connectivity Unknown'),
    weather: createDefaultSubsystem('Weather Unknown'),
    offlineMaps: createDefaultSubsystem('Maps Unknown'),
    route: createDefaultSubsystem('No Route'),
    expedition: createDefaultSubsystem('No Expedition'),
    breadcrumb: createDefaultSubsystem('No Trail'),
    overallStatus: 'nominal',
    statusLine: 'Initializing…',
    lastEvaluatedAt: 0,
  };
}

function createDefaultNavigationData(mode: VehicleDisplayMode): VehicleNavigationData {
  return {
    mode,
    routePhase: 'inactive',
    currentLat: null,
    currentLon: null,
    headingDeg: null,
    speedMph: null,
    routeLine: false,
    nextManeuver: null,
    distanceRemainingMiles: null,
    etaMinutes: null,
    nearbyFuelServices: [],
    breadcrumbTrail: false,
    importedGpxRoute: false,
    offRouteAlert: false,
    offRouteDistanceFt: null,
    elevationShading: false,
    offlineMapIndicator: false,
    offlineMapRegion: null,
    routeName: null,
    destinationName: null,
    statusLabel: 'No route staged',
    progressPct: null,
    etaLabel: null,
    hazardState: 'normal',
    hazardLabel: null,
    offRouteDetected: false,
    unavailableReason: 'No route staged',
  };
}

function createDefaultAttitudeData(): VehicleAttitudeData {
  return {
    status: 'unavailable',
    rollDeg: null,
    pitchDeg: null,
    sideSlopeState: 'unavailable',
    tiltState: 'unavailable',
    supportLabel: 'Waiting for motion sensors',
    source: 'none',
    unavailableReason: 'Motion sensors unavailable',
  };
}

function createDefaultResourceData(): VehicleResourceData {
  return {
    status: 'fallback',
    fuelPercent: null,
    fuelRangeMiles: null,
    waterRemaining: null,
    waterUnit: 'gal',
    batteryPercent: null,
    powerInputWatts: null,
    powerOutputWatts: null,
    chargeState: 'inactive',
    alternateFluidLabel: null,
    alternateFluidValue: null,
    alternateFluidUnit: null,
    fuelSource: 'none',
    waterSource: 'none',
    powerSource: 'none',
    alternateFluidSource: 'none',
    supportLabel: 'Waiting for vehicle data',
    unavailableReason: 'No live telemetry or configured fallback',
  };
}

function createDefaultWeatherHazardData(): VehicleWeatherHazardData {
  return {
    status: 'unavailable',
    condition: null,
    weatherSummary: null,
    alertSummary: null,
    windMph: null,
    precipitationChance: null,
    temperatureF: null,
    hazardState: 'normal',
    routeHazard: null,
    source: 'none',
    unavailableReason: 'GPS required',
  };
}

function createDefaultExitPlanData(): VehicleExitPlanData {
  return {
    status: 'unavailable',
    remotenessScore: null,
    remotenessTier: null,
    nearestBailoutLabel: null,
    nearestBailoutDistanceMiles: null,
    exitToPavementMiles: null,
    exitEtaMinutes: null,
    offlineConfidence: 'unknown',
    connectivityLabel: null,
    fuelSupportLabel: null,
    supportLabel: 'Awaiting location context',
    source: 'none',
    unavailableReason: 'GPS required',
  };
}

function createDefaultStatusData(mode: VehicleDisplayMode): VehicleStatusData {
  return {
    mode,
    routePhase: 'inactive',
    tripDistanceMiles: null,
    tripDurationHours: null,
    daylightRemainingHours: null,
    connectivityForecast: 'unknown',
    remotenessIndex: null,
    remotenessTier: null,
    distanceFromStartMiles: null,
    elevationGainFt: null,
    vehicleSystemsSummary: [],
    weatherRisk: 'unknown',
    statusHeadline: 'Vehicle display ready',
    statusSupport: 'Waiting for route and expedition context',
  };
}

function createDefaultWeatherData(mode: VehicleDisplayMode): VehicleWeatherData {
  return {
    mode,
    radarOverlay: false,
    stormMovement: null,
    windSpeedMph: null,
    windDirection: null,
    temperatureF: null,
    temperatureTrend: 'unknown',
    weatherAlerts: [],
    weatherMain: null,
    weatherDescription: null,
    humidity: null,
    feelsLikeF: null,
    lightningRisk: 'unknown',
    windExposure: 'unknown',
    temperatureDropForecastF: null,
    hazardState: 'normal',
    alertSummary: null,
    routeHazard: null,
    unavailableReason: 'Weather unavailable',
  };
}

function createDefaultPresentationModel(
  activeScreen: VehicleDisplayScreen,
): ECSVehiclePresentationModel {
  return {
    generatedAt: new Date().toISOString(),
    sessionState: 'idle',
    routePhase: 'inactive',
    activeScreen,
    fallbackUsed: false,
    degradedReasons: [],
    navigation: {
      availability: 'unavailable',
      source: 'none',
      title: null,
      detail: 'No route staged',
      stale: false,
      fallbackUsed: false,
    },
    attitude: {
      availability: 'unavailable',
      source: 'none',
      title: null,
      detail: 'Motion sensors unavailable',
      stale: false,
      fallbackUsed: false,
    },
    resources: {
      availability: 'unavailable',
      source: 'none',
      title: null,
      detail: 'No vehicle or resource profile available',
      stale: false,
      fallbackUsed: false,
    },
    weatherHazard: {
      availability: 'unavailable',
      source: 'none',
      title: null,
      detail: 'Weather unavailable',
      stale: false,
      fallbackUsed: false,
    },
    exitPlan: {
      availability: 'unavailable',
      source: 'none',
      title: null,
      detail: 'GPS required',
      stale: false,
      fallbackUsed: false,
    },
  };
}

function createDefaultState(): VehicleDisplayState {
  const mode: VehicleDisplayMode = 'highway_drive';
  const navigationData = createDefaultNavigationData(mode);
  const activeScreen: VehicleDisplayScreen = 'navigation';
  return {
    mode,
    activeScreen,
    isConnected: false,
    isManualOverride: false,
    modeOverride: 'auto',
    indicators: createDefaultIndicators(),
    systemHealth: createDefaultSystemHealth(),
    routePhase: 'inactive',
    sessionState: 'idle',
    navigationData,
    attitudeData: createDefaultAttitudeData(),
    resourceData: createDefaultResourceData(),
    weatherHazardData: createDefaultWeatherHazardData(),
    exitPlanData: createDefaultExitPlanData(),
    automotiveSurface: createDefaultAutomotiveSurfaceState(),
    presentationModel: createDefaultPresentationModel(activeScreen),
    mapData: navigationData,
    statusData: createDefaultStatusData(mode),
    weatherData: createDefaultWeatherData(mode),
    actions: [],
    lastUpdatedAt: new Date().toISOString(),
    transitionNotice: null,
  };
}

function normalizePersistedScreen(raw: unknown): VehicleDisplayScreen {
  switch (raw) {
    case 'navigation':
    case 'attitude':
    case 'resources':
    case 'weather_hazard':
    case 'exit_plan':
      return raw;
    default:
      return 'navigation';
  }
}

interface PersistedVehicleDisplayState {
  mode: VehicleDisplayMode;
  activeScreen: VehicleDisplayScreen;
  isManualOverride: boolean;
}

function loadPersistedState(): Partial<PersistedVehicleDisplayState> {
  try {
    const raw = sGet(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PersistedVehicleDisplayState>;
    return {
      mode:
        parsed.mode === 'expedition_drive' || parsed.mode === 'highway_drive'
          ? parsed.mode
          : undefined,
      activeScreen: normalizePersistedScreen(parsed.activeScreen),
      isManualOverride: !!parsed.isManualOverride,
    };
  } catch {
    return {};
  }
}

function persistState(state: VehicleDisplayState): void {
  const persisted: PersistedVehicleDisplayState = {
    mode: state.mode,
    activeScreen: state.activeScreen,
    isManualOverride: state.isManualOverride,
  };
  sSet(STORAGE_KEY, JSON.stringify(persisted));
}

function roundMiles(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function roundTenths(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function formatEtaMinutes(minutes: number | null): string | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  const future = new Date(Date.now() + minutes * 60_000);
  return future.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function mapConnectivity(level: string | null | undefined): VehicleIndicators['connectivity'] {
  switch (level) {
    case 'normal':
      return 'online';
    case 'limited':
      return 'limited';
    case 'no_service':
      return 'offline';
    default:
      return 'unknown';
  }
}

function mapGpsSignal(
  hasFix: boolean,
  quality: string | null | undefined,
): VehicleIndicators['gpsSignal'] {
  if (!hasFix) return 'none';
  if (quality === 'HIGH') return 'strong';
  if (quality === 'MEDIUM') return 'moderate';
  return 'weak';
}

function mapWeatherRisk(
  hazardState: VehicleWeatherHazardData['hazardState'],
): VehicleStatusData['weatherRisk'] {
  switch (hazardState) {
    case 'critical':
      return 'severe';
    case 'warning':
      return 'high';
    case 'caution':
      return 'moderate';
    case 'normal':
      return 'low';
    default:
      return 'unknown';
  }
}

function sourceLabel(source: VehicleDataSource): string {
  switch (source) {
    case 'live_telemetry':
      return 'Live telemetry';
    case 'bluetooth':
      return 'Bluetooth';
    case 'gps_live':
      return 'GPS live';
    case 'ai_navigation':
      return 'ECS route intelligence';
    case 'manual':
      return 'Manual fallback';
    case 'cached':
      return 'Cached';
    default:
      return 'Unavailable';
  }
}

function mapDashboardSourceToVehicleDataSource(
  source: 'live' | 'bluetooth' | 'ai-derived' | 'manual' | 'unavailable',
): VehicleDataSource {
  switch (source) {
    case 'live':
      return 'live_telemetry';
    case 'bluetooth':
      return 'bluetooth';
    case 'ai-derived':
      return 'ai_navigation';
    case 'manual':
      return 'manual';
    default:
      return 'none';
  }
}

function applyAutomotiveSurfaceToNavigationData(
  navigationData: VehicleNavigationData,
): VehicleNavigationData {
  const primary = _automotiveSurface.primaryCommand;
  const secondary = _automotiveSurface.secondaryCommands;
  const supportLine =
    secondary[0]?.summary
    ?? _automotiveSurface.guidance.statusLine
    ?? navigationData.statusLabel;

  return {
    ...navigationData,
    statusLabel:
      primary?.title
      ?? _automotiveSurface.guidance.statusLine
      ?? navigationData.statusLabel,
    nextManeuver:
      navigationData.nextManeuver
      ?? _automotiveSurface.guidance.nextManeuver
      ?? primary?.summary
      ?? null,
    hazardLabel:
      primary && primary.tone !== 'calm'
        ? primary.summary
        : navigationData.hazardLabel
          ?? (secondary[0] ? supportLine : null),
  };
}

function applyAutomotiveSurfaceToStatusData(
  statusData: VehicleStatusData,
): VehicleStatusData {
  const primary = _automotiveSurface.primaryCommand;
  const secondary = _automotiveSurface.secondaryCommands;
  return {
    ...statusData,
    statusHeadline:
      primary?.title
      ?? _automotiveSurface.guidance.routeName
      ?? statusData.statusHeadline,
    statusSupport:
      primary?.summary
      ?? secondary[0]?.summary
      ?? _automotiveSurface.guidance.statusLine
      ?? statusData.statusSupport,
  };
}

function applyAutomotiveSurfaceToResourceData(
  resourceData: VehicleResourceData,
): VehicleResourceData {
  const relevant =
    _automotiveSurface.primaryCommand?.role === 'resource_margin'
      ? _automotiveSurface.primaryCommand
      : _automotiveSurface.secondaryCommands.find((item) => item.role === 'resource_margin') ?? null;
  if (!relevant) return resourceData;
  return {
    ...resourceData,
    supportLabel: relevant.summary,
  };
}

function applyAutomotiveSurfaceToWeatherHazardData(
  weatherData: VehicleWeatherHazardData,
): VehicleWeatherHazardData {
  const relevant =
    _automotiveSurface.primaryCommand?.role === 'route_warning'
      ? _automotiveSurface.primaryCommand
      : _automotiveSurface.secondaryCommands.find((item) => item.role === 'route_warning') ?? null;
  if (!relevant) return weatherData;
  return {
    ...weatherData,
    routeHazard: relevant.summary,
    alertSummary: weatherData.alertSummary ?? relevant.summary,
  };
}

function applyAutomotiveSurfaceToExitPlanData(
  exitPlanData: VehicleExitPlanData,
): VehicleExitPlanData {
  const relevant =
    _automotiveSurface.primaryCommand?.role === 'exit_relevance'
      ? _automotiveSurface.primaryCommand
      : _automotiveSurface.secondaryCommands.find((item) => item.role === 'exit_relevance') ?? null;
  if (!relevant) return exitPlanData;
  return {
    ...exitPlanData,
    supportLabel: relevant.summary,
  };
}

function resolveVehicleSourceValue<T>(
  candidates: DashboardSourceCandidate<T>[],
): { value: T | null; source: VehicleDataSource; detail: string | null; updatedAt: number | null } {
  const resolved = resolveDashboardValue(candidates);
  if (!resolved) {
    return {
      value: null,
      source: 'none',
      detail: null,
      updatedAt: null,
    };
  }

  return {
    value: resolved.value,
    source: mapDashboardSourceToVehicleDataSource(resolved.source),
    detail: resolved.detail ?? null,
    updatedAt: resolved.updatedAt ?? null,
  };
}

function buildSystemHealth(params: {
  gps: any;
  indicators: VehicleIndicators;
  navigationData: VehicleNavigationData;
  weatherHazardData: VehicleWeatherHazardData;
  exitPlanData: VehicleExitPlanData;
}): VehicleSystemHealth {
  const { gps, indicators, navigationData, weatherHazardData, exitPlanData } = params;
  const breadcrumbState = safeRequire('./breadcrumbTracker')?.breadcrumbTracker?.get?.();
  const hasExpedition = Boolean(safeRequire('./missionStore')?.missionExpeditionStore?.getActive?.());
  const weatherIsStale =
    weatherHazardData.source === 'cached' || weatherHazardData.status === 'fallback';

  const gpsSubsystem: VehicleSubsystemStatus = {
    available: Boolean(gps?.hasFix),
    label:
      indicators.gpsSignal === 'strong'
        ? 'GPS OK'
        : indicators.gpsSignal === 'moderate'
          ? 'GPS Moderate'
          : indicators.gpsSignal === 'weak'
            ? 'GPS Weak'
            : gps?.permissionDenied
              ? 'GPS Permission Required'
              : 'GPS Unavailable',
    severity:
      indicators.gpsSignal === 'none'
        ? 'error'
        : indicators.gpsSignal === 'weak'
          ? 'warning'
          : 'ok',
    detail: gps?.permissionDenied ? 'Location permission required' : gps?.error ?? null,
    lastGoodDataAt: typeof gps?.lastEmitTs === 'number' ? gps.lastEmitTs : null,
    isStale: Boolean(gps?.hasFix) && indicators.gpsSignal === 'weak',
    staleSinceMinutes: null,
  };

  const connectivitySubsystem: VehicleSubsystemStatus = {
    available: indicators.connectivity !== 'offline',
    label:
      indicators.connectivity === 'online'
        ? 'Online'
        : indicators.connectivity === 'limited'
          ? 'Limited'
          : indicators.connectivity === 'offline'
            ? 'Offline'
            : 'Connectivity Unknown',
    severity:
      indicators.connectivity === 'online'
        ? 'ok'
        : indicators.connectivity === 'limited'
          ? 'warning'
          : indicators.connectivity === 'offline'
            ? 'error'
            : 'unknown',
    detail: null,
    lastGoodDataAt: indicators.connectivity === 'online' ? Date.now() : null,
    isStale: false,
    staleSinceMinutes: null,
  };

  const weatherSubsystem: VehicleSubsystemStatus = {
    available: weatherHazardData.status !== 'unavailable',
    label:
      weatherHazardData.status === 'unavailable'
        ? 'Weather Unavailable'
        : weatherIsStale
          ? 'Weather Stale'
          : 'Weather Live',
    severity:
      weatherHazardData.status === 'unavailable'
        ? 'warning'
        : weatherIsStale
          ? 'warning'
          : 'ok',
    detail: weatherHazardData.alertSummary ?? weatherHazardData.unavailableReason ?? null,
    lastGoodDataAt: Date.now(),
    isStale: weatherIsStale,
    staleSinceMinutes: null,
  };

  const offlineMapsSubsystem: VehicleSubsystemStatus = {
    available: indicators.offlineMaps,
    label: indicators.offlineMaps ? 'Maps Ready' : 'Offline Maps Missing',
    severity: indicators.offlineMaps ? 'ok' : 'warning',
    detail: indicators.offlineMaps ? null : 'Offline map pack not ready',
    lastGoodDataAt: indicators.offlineMaps ? Date.now() : null,
    isStale: false,
    staleSinceMinutes: null,
  };

  const routeSubsystem: VehicleSubsystemStatus = {
    available: navigationData.routePhase !== 'inactive',
    label:
      navigationData.routePhase === 'route_active'
        ? 'Guidance Active'
        : navigationData.routePhase === 'route_selected'
          ? 'Route Ready'
          : navigationData.routePhase === 'alerting_or_degraded'
            ? 'Guidance Degraded'
            : navigationData.routePhase === 'completed'
              ? 'Route Complete'
              : 'No Route',
    severity:
      navigationData.routePhase === 'alerting_or_degraded'
        ? 'warning'
        : navigationData.routePhase === 'inactive'
          ? 'unknown'
          : 'ok',
    detail: navigationData.nextManeuver ?? navigationData.unavailableReason ?? null,
    lastGoodDataAt: navigationData.routePhase !== 'inactive' ? Date.now() : null,
    isStale: false,
    staleSinceMinutes: null,
  };

  const expeditionSubsystem: VehicleSubsystemStatus = {
    available: hasExpedition,
    label: hasExpedition ? 'Expedition Active' : 'No Expedition',
    severity: hasExpedition ? 'ok' : 'unknown',
    detail: null,
    lastGoodDataAt: hasExpedition ? Date.now() : null,
    isStale: false,
    staleSinceMinutes: null,
  };

  const breadcrumbSubsystem: VehicleSubsystemStatus = {
    available: Boolean(breadcrumbState?.isRecording || breadcrumbState?.pointCount > 0),
    label:
      breadcrumbState?.isRecording
        ? 'Trail Recording'
        : breadcrumbState?.pointCount > 0
          ? 'Trail Cached'
          : 'No Trail',
    severity:
      breadcrumbState?.isRecording
        ? 'ok'
        : breadcrumbState?.pointCount > 0
          ? 'warning'
          : 'unknown',
    detail:
      breadcrumbState?.pointCount > 0
        ? `${breadcrumbState.pointCount} points`
        : null,
    lastGoodDataAt: breadcrumbState?.pointCount > 0 ? Date.now() : null,
    isStale: false,
    staleSinceMinutes: null,
  };

  const overallStatus =
    gpsSubsystem.severity === 'error' ||
    routeSubsystem.severity === 'warning' ||
    weatherSubsystem.severity === 'warning' ||
    exitPlanData.status === 'unavailable'
      ? 'degraded'
      : 'nominal';

  return {
    gps: gpsSubsystem,
    connectivity: connectivitySubsystem,
    weather: weatherSubsystem,
    offlineMaps: offlineMapsSubsystem,
    route: routeSubsystem,
    expedition: expeditionSubsystem,
    breadcrumb: breadcrumbSubsystem,
    overallStatus,
    statusLine:
      navigationData.routePhase === 'alerting_or_degraded'
        ? navigationData.hazardLabel ?? 'Guidance degraded'
        : weatherHazardData.alertSummary ??
          exitPlanData.supportLabel ??
          navigationData.statusLabel,
    lastEvaluatedAt: Date.now(),
  };
}

function buildNativeHealthPayload(health: VehicleSystemHealth): Record<string, unknown> {
  return {
    overallStatus: health.overallStatus,
    statusLine: health.statusLine,
    lastEvaluatedAt: health.lastEvaluatedAt,
    gps: health.gps,
    connectivity: health.connectivity,
    weather: health.weather,
    offlineMaps: health.offlineMaps,
    route: health.route,
    expedition: health.expedition,
    breadcrumb: health.breadcrumb,
  };
}

function summarizeWeatherAlerts(snapshot: ECSWeatherSnapshot | null): VehicleWeatherAlert[] {
  if (!snapshot) return [];
  return snapshot.alerts.slice(0, 3).map((alert, index) => ({
    id: `${alert.title}-${index}`,
    title: alert.title,
    severity:
      alert.severity === 'extreme'
        ? 'emergency'
        : alert.severity === 'warning'
          ? 'warning'
          : 'advisory',
    description: alert.description,
    expiresAt: alert.expires,
  }));
}

function computeEtaMinutes(distanceMiles: number | null, speedMph: number | null, fallbackMph = 24): number | null {
  if (distanceMiles == null || !Number.isFinite(distanceMiles) || distanceMiles <= 0) return null;
  const mph = speedMph != null && speedMph > 2 ? speedMph : fallbackMph;
  return Math.max(1, Math.round((distanceMiles / mph) * 60));
}

function computeFuelRangeMiles(
  fuelPercent: number | null,
  tankCapacityGal: number | null | undefined,
  avgMpg: number | null | undefined,
): number | null {
  if (fuelPercent == null || tankCapacityGal == null) return null;
  const mpg = avgMpg && Number.isFinite(avgMpg) && avgMpg > 0 ? avgMpg : 12;
  return Math.round(tankCapacityGal * mpg * Math.max(0, fuelPercent) / 100);
}

function safeRequire(path: string): any {
  try {
    switch (path) {
      case './waypointProgressStore':
        return require('./waypointProgressStore');
      case './breadcrumbTracker':
        return require('./breadcrumbTracker');
      case './activeVehicleContext':
        return require('./activeVehicleContext');
      case '../src/vehicle-telemetry/VehicleTelemetryStore':
        return require('../src/vehicle-telemetry/VehicleTelemetryStore');
      case './BluStateStore':
        return require('./BluStateStore');
      case './BluPowerAuthority':
        return require('./BluPowerAuthority');
      case './gpsUIState':
        return require('./gpsUIState');
      case './connectivity':
        return require('./connectivity');
      case './remotenessStore':
        return require('./remotenessStore');
      case './missionStore':
        return require('./missionStore');
      case './routeStore':
        return require('./routeStore');
      case './vehicleDisplayTypes':
        return require('./vehicleDisplayTypes');
      default:
        return null;
    }
  } catch {
    return null;
  }
}

type Listener = () => void;
const _listeners = new Set<Listener>();

let _state: VehicleDisplayState = createDefaultState();
let _sessionLogs: VehicleSessionLogEntry[] = [];
let _refreshTimer: ReturnType<typeof setInterval> | null = null;
let _isRunning = false;
let _roadSessionInFlight = false;
let _roadSession: PersistedRoadNavigationSession | null = null;
let _weatherSnapshot: ECSWeatherSnapshot | null = null;
let _weatherUnavailableReason: string | null = null;
let _sharedWeatherUnsubscribe: (() => void) | null = null;
let _automotiveSurface = createDefaultAutomotiveSurfaceState();
let _automotiveAIRefreshInFlight = false;
let _automotiveAIMemory = createInitialAIOrchestratorMemory();
let _attitudeReading = {
  rollDeg: null as number | null,
  pitchDeg: null as number | null,
  available: false,
  active: false,
};
let _accelerometerSubscription: { remove?: () => void } | null = null;
let _manualMapOverrides: Partial<VehicleMapData> = {};
let _lastLoggedRoutePhase: VehicleRouteSessionState | null = null;
let _lastLoggedGpsDegraded = false;
let _lastLoggedTelemetryUnavailable = false;
let _lastLoggedWeatherUnavailable = false;
let _lastPresentationSignature: string | null = null;
let _lastFallbackSignature: string | null = null;
let _lastUnavailableSignature: string | null = null;
let _lastKnownPosition: { lat: number; lon: number; heading: number | null } | null = null;

const _persisted = loadPersistedState();
if (_persisted.mode) _state.mode = _persisted.mode;
if (_persisted.activeScreen) _state.activeScreen = _persisted.activeScreen;
if (_persisted.isManualOverride != null) _state.isManualOverride = _persisted.isManualOverride;

function _notify(): void {
  _state.lastUpdatedAt = new Date().toISOString();
  persistState(_state);
  for (const fn of _listeners) {
    try {
      fn();
    } catch {}
  }
}

function _syncSharedOperationalWeatherConsumer(gps: any): void {
  setSharedOperationalWeatherConsumer('vehicle_display', {
    enabled: _isRunning,
    gps: {
      lat: gps?.position?.latitude ?? null,
      lng: gps?.position?.longitude ?? null,
      hasFix: Boolean(gps?.hasFix),
      permissionDenied: Boolean(gps?.permissionDenied),
    },
    units: 'imperial',
    freshnessWindowMs: 10 * 60 * 1000,
    movementThresholdM: 750,
  });
}

function _applySharedWeatherState(): void {
  const sharedWeather = getSharedOperationalWeatherState();
  _weatherSnapshot = sharedWeather.snapshot;
  _weatherUnavailableReason = sharedWeather.snapshot.status.error ?? sharedWeather.snapshot.status.label ?? null;
}

function recordSessionEvent(
  event: VehicleSessionLogEntry['event'],
  payload?: Record<string, unknown>,
): void {
  _sessionLogs.push({
    event,
    timestamp: new Date().toISOString(),
    payload,
  });
  if (_sessionLogs.length > MAX_SESSION_LOGS) {
    _sessionLogs = _sessionLogs.slice(-MAX_SESSION_LOGS);
  }
}

function deriveAttitudeState(
  rollDeg: number | null,
  pitchDeg: number | null,
): Pick<VehicleAttitudeData, 'sideSlopeState' | 'tiltState' | 'supportLabel'> {
  if (rollDeg == null || pitchDeg == null) {
    return {
      sideSlopeState: 'unavailable',
      tiltState: 'unavailable',
      supportLabel: 'Waiting for motion sensors',
    };
  }

  const maxRoll = Math.abs(rollDeg);
  const maxPitch = Math.abs(pitchDeg);
  if (maxRoll >= 30 || maxPitch >= 25) {
    return {
      sideSlopeState: 'critical',
      tiltState: 'critical',
      supportLabel: 'Critical lean detected',
    };
  }
  if (maxRoll >= 18 || maxPitch >= 15) {
    return {
      sideSlopeState: 'caution',
      tiltState: 'caution',
      supportLabel: 'Caution threshold crossed',
    };
  }
  return {
    sideSlopeState: 'normal',
    tiltState: 'stable',
    supportLabel: 'Attitude nominal',
  };
}

function buildNavigationData(params: {
  mode: VehicleDisplayMode;
  gps: any;
  activeRoute: any | null;
  roadSession: PersistedRoadNavigationSession | null;
  remotenessIndex: any | null;
  weatherData: VehicleWeatherHazardData;
}): VehicleNavigationData {
  const { mode, gps, activeRoute, roadSession, remotenessIndex, weatherData } = params;
  const currentLat = gps?.position?.latitude ?? null;
  const currentLon = gps?.position?.longitude ?? null;
  const speedMph = gps?.position?.speedMph ?? null;
  const headingDeg = gps?.position?.headingDeg ?? null;
  const routeLoaded = !!activeRoute || !!roadSession;
  const routePreview = roadSession?.status === 'destination_selected' || roadSession?.status === 'route_preview';
  const wpStore = safeRequire('./waypointProgressStore')?.waypointProgressStore;
  const totalWaypoints = Array.isArray(activeRoute?.waypoints) ? activeRoute.waypoints.length : 0;
  const waypointIndex =
    activeRoute?.id && wpStore?.getIndex ? wpStore.getIndex(activeRoute.id) : 0;
  const routeCompleted =
    roadSession?.status === 'arrived' ||
    (!!activeRoute &&
      totalWaypoints > 0 &&
      wpStore?.isComplete?.(activeRoute.id, totalWaypoints));

  let routePhase: VehicleRouteSessionState = 'inactive';
  if (routeCompleted) {
    routePhase = 'completed';
  } else if (roadSession?.status === 'rerouting' || (routeLoaded && !gps?.hasFix)) {
    routePhase = 'alerting_or_degraded';
  } else if (roadSession?.status === 'navigation_active') {
    routePhase = 'route_active';
  } else if (routePreview || routeLoaded) {
    routePhase = 'route_selected';
  }

  const progressPct =
    totalWaypoints > 1
      ? Math.max(0, Math.min(100, Math.round((waypointIndex / (totalWaypoints - 1)) * 100)))
      : routeLoaded
        ? 0
        : null;
  const distanceRemainingMiles =
    routePhase === 'completed'
      ? 0
      : activeRoute?.total_distance_miles && progressPct != null
        ? Math.max(0, roundTenths(activeRoute.total_distance_miles * (1 - progressPct / 100)) ?? 0)
        : null;
  const etaMinutes = routePhase === 'completed' ? 0 : computeEtaMinutes(distanceRemainingMiles, speedMph);
  const roadDestination = roadSession?.destination?.title ?? null;
  const nextWaypoint = activeRoute?.waypoints?.[Math.min(waypointIndex, Math.max(totalWaypoints - 1, 0))];
  const nextManeuver =
    routePhase === 'completed'
      ? 'Route complete'
      : roadDestination && (roadSession?.status === 'navigation_active' || roadSession?.status === 'rerouting')
        ? `Continue to ${roadDestination}`
        : nextWaypoint?.name
          ? `Proceed to ${nextWaypoint.name}`
          : roadDestination && routePreview
            ? `Ready to ${roadDestination}`
            : routeLoaded
              ? 'Continue on route'
              : null;

  const nearbyFuelDistance = remotenessIndex?.proximity?.nearestFuelStation?.distanceMi;
  const nearbyFuelServices =
    nearbyFuelDistance != null
      ? [
          {
            id: 'nearest-fuel',
            name: 'Nearest Fuel',
            type: 'fuel' as const,
            distanceMiles: Math.max(0, roundTenths(nearbyFuelDistance) ?? nearbyFuelDistance),
            bearing: '--',
          },
        ]
      : [];

  const offlineReady = Boolean(remotenessIndex?.signals?.cacheReady || remotenessIndex?.signals?.expeditionDataReady);
  const hazardLabel =
    routePhase === 'alerting_or_degraded'
      ? gps?.hasFix
        ? 'Route degraded'
        : 'GPS degraded'
      : weatherData.hazardState === 'warning' || weatherData.hazardState === 'critical'
        ? weatherData.alertSummary ?? weatherData.routeHazard
        : null;

  return {
    mode,
    routePhase,
    currentLat,
    currentLon,
    headingDeg,
    speedMph,
    routeLine: routeLoaded,
    nextManeuver,
    distanceRemainingMiles,
    etaMinutes,
    nearbyFuelServices,
    breadcrumbTrail: Boolean(safeRequire('./breadcrumbTracker')?.breadcrumbTracker?.get?.()?.isRecording),
    importedGpxRoute: activeRoute?.source_format === 'gpx',
    offRouteAlert: roadSession?.status === 'rerouting',
    offRouteDistanceFt: roadSession?.status === 'rerouting' ? 300 : null,
    elevationShading: mode === 'expedition_drive',
    offlineMapIndicator: offlineReady,
    offlineMapRegion: offlineReady ? 'OFFLINE READY' : null,
    routeName: activeRoute?.name ?? roadDestination ?? null,
    destinationName: roadDestination,
    statusLabel:
      routePhase === 'route_active'
        ? 'Route active'
        : routePhase === 'route_selected'
          ? 'Route ready'
          : routePhase === 'alerting_or_degraded'
            ? 'Guidance degraded'
            : routePhase === 'completed'
              ? 'Route complete'
              : 'No route staged',
    progressPct,
    etaLabel: formatEtaMinutes(etaMinutes),
    hazardState: routePhase === 'alerting_or_degraded' ? 'warning' : weatherData.hazardState,
    hazardLabel,
    offRouteDetected: roadSession?.status === 'rerouting',
    unavailableReason: routeLoaded ? null : gps?.hasFix ? 'Select a route to begin guidance' : 'GPS required',
  };
}

function buildAttitudeData(): VehicleAttitudeData {
  if (!_attitudeReading.available || !_attitudeReading.active) {
    return {
      status: 'unavailable',
      rollDeg: null,
      pitchDeg: null,
      sideSlopeState: 'unavailable',
      tiltState: 'unavailable',
      supportLabel: 'Waiting for motion sensors',
      source: 'none',
      unavailableReason: 'Motion sensors unavailable',
    };
  }
  const state = deriveAttitudeState(_attitudeReading.rollDeg, _attitudeReading.pitchDeg);
  return {
    status: 'live',
    rollDeg: _attitudeReading.rollDeg,
    pitchDeg: _attitudeReading.pitchDeg,
    sideSlopeState: state.sideSlopeState,
    tiltState: state.tiltState,
    supportLabel: state.supportLabel,
    source: 'live_telemetry',
    unavailableReason: null,
  };
}

function buildResourceData(): VehicleResourceData {
  const vehicleContext = safeRequire('./activeVehicleContext')?.getActiveVehicleContext?.();
  const telemetryState = safeRequire('../src/vehicle-telemetry/VehicleTelemetryStore')?.vehicleTelemetryStore?.getECSVehicleTelemetryState?.();
  const bluSummary = safeRequire('./BluStateStore')?.bluStateStore?.getSummary?.();
  const powerSnapshot = safeRequire('./BluPowerAuthority')?.bluPowerAuthority?.getSnapshot?.();
  const consumables = vehicleContext?.consumables ?? null;
  const specAny = vehicleContext?.spec as any;
  const tankCapacity = specAny?.fuel_tank_capacity_gal ?? vehicleContext?.resourceProfile?.fuelTankCapacityGal ?? null;
  const avgMpg = specAny?.avg_mpg ?? specAny?.highway_mpg ?? specAny?.combined_mpg ?? specAny?.mpg_estimate ?? null;

  const fuelResolution = resolveVehicleSourceValue<number>([
    {
      source: 'live',
      value: telemetryState?.summary?.fuel_level ?? null,
      detail: 'OBD fuel telemetry',
    },
    {
      source: 'manual',
      value: consumables?.fuel_percent_current ?? null,
      available: consumables?.fuel_percent_current != null,
      detail: 'Configured vehicle profile',
    },
  ]);
  const fuelPercent = fuelResolution.value;
  const fuelSource = fuelResolution.source;

  const waterResolution = resolveVehicleSourceValue<number>([
    {
      source: consumables?.water_source === 'sensor' ? 'bluetooth' : 'manual',
      value: consumables?.water_gal_current ?? null,
      available: consumables?.water_gal_current != null,
      updatedAt: consumables?.water_updated_at ?? null,
      detail:
        consumables?.water_source === 'sensor'
          ? 'Connected water sensor'
          : 'Manual expedition reserve',
    },
  ]);
  const waterRemaining = waterResolution.value;
  const waterSource = waterResolution.source;

  const batteryResolution = resolveVehicleSourceValue<number>([
    {
      source: 'bluetooth',
      value: powerSnapshot?.batteryPercent ?? bluSummary?.battery_percent ?? null,
      available: Boolean(powerSnapshot?.isConnected || bluSummary?.available),
      detail: 'Connected power system',
    },
  ]);
  const batteryPercent = batteryResolution.value != null ? Math.round(batteryResolution.value) : null;

  const powerInputResolution = resolveVehicleSourceValue<number>([
    {
      source: 'bluetooth',
      value: powerSnapshot?.inputWatts ?? bluSummary?.live_input ?? null,
      available: Boolean(powerSnapshot?.isConnected || bluSummary?.available),
      detail: 'Connected power system',
    },
  ]);
  const powerOutputResolution = resolveVehicleSourceValue<number>([
    {
      source: 'bluetooth',
      value: powerSnapshot?.outputWatts ?? bluSummary?.live_output ?? null,
      available: Boolean(powerSnapshot?.isConnected || bluSummary?.available),
      detail: 'Connected power system',
    },
  ]);
  const powerInputWatts = powerInputResolution.value;
  const powerOutputWatts = powerOutputResolution.value;
  const powerSource =
    powerInputResolution.source !== 'none'
      ? powerInputResolution.source
      : powerOutputResolution.source;

  const alternateFluidResolution = resolveVehicleSourceValue<number>([
    {
      source: consumables?.alternate_fluid_source === 'sensor' ? 'bluetooth' : 'manual',
      value: consumables?.alternate_fluid_current ?? null,
      available: consumables?.alternate_fluid_current != null,
      updatedAt: consumables?.alternate_fluid_updated_at ?? null,
      detail:
        consumables?.alternate_fluid_source === 'sensor'
          ? 'Connected alternate fluid sensor'
          : 'Manual alternate fluid reserve',
    },
  ]);
  const alternateFluidValue = alternateFluidResolution.value;
  const alternateFluidSource = alternateFluidResolution.source;

  const chargeState =
    (powerInputWatts ?? 0) > (powerOutputWatts ?? 0) && (powerInputWatts ?? 0) > 0
      ? 'charging'
      : (powerOutputWatts ?? 0) > 0
        ? 'discharging'
        : batteryPercent != null
          ? 'balanced'
          : 'inactive';

  const fuelRangeMiles = computeFuelRangeMiles(fuelPercent, tankCapacity, avgMpg);
  const status: VehicleResourceData['status'] =
    fuelSource === 'live_telemetry' || powerSource === 'bluetooth'
      ? 'live'
      : fuelSource === 'manual' || waterSource === 'manual' || alternateFluidSource === 'manual'
        ? 'fallback'
        : 'unavailable';

  return {
    status,
    fuelPercent: fuelPercent != null ? Math.round(fuelPercent) : null,
    fuelRangeMiles,
    waterRemaining: waterRemaining != null ? roundTenths(waterRemaining) : null,
    waterUnit: 'gal',
    batteryPercent,
    powerInputWatts: powerInputWatts != null ? Math.round(powerInputWatts) : null,
    powerOutputWatts: powerOutputWatts != null ? Math.round(powerOutputWatts) : null,
    chargeState,
    alternateFluidLabel: consumables?.alternate_fluid_label ?? null,
    alternateFluidValue: alternateFluidValue != null ? roundTenths(alternateFluidValue) : null,
    alternateFluidUnit: consumables?.alternate_fluid_unit ?? null,
    fuelSource,
    waterSource,
    powerSource,
    alternateFluidSource,
    supportLabel:
      status === 'live'
        ? `Live ${sourceLabel(powerSource !== 'none' ? powerSource : fuelSource)}`
        : status === 'fallback'
          ? 'Manual resource fallback'
          : 'No vehicle or resource profile available',
    unavailableReason: status === 'unavailable' ? 'No live telemetry or configured fallback' : null,
  };
}

function computeWeatherHazardState(snapshot: ECSWeatherSnapshot | null): {
  state: VehicleWeatherHazardData['hazardState'];
  routeHazard: string | null;
  alertSummary: string | null;
} {
  if (!snapshot) {
    return { state: 'normal', routeHazard: null, alertSummary: null };
  }

  const topAlert = snapshot.alerts[0];
  if (topAlert) {
    return {
      state:
        topAlert.severity === 'extreme'
          ? 'critical'
          : topAlert.severity === 'warning'
            ? 'warning'
            : 'caution',
      routeHazard: topAlert.title,
      alertSummary: formatWeatherAlertLine(snapshot),
    };
  }

  const wind = snapshot.current.windSpeed ?? 0;
  const precip = snapshot.current.precipChance ?? 0;
  if (wind >= 35 || precip >= 85) {
    return {
      state: 'warning',
      routeHazard: 'Hazardous weather ahead',
      alertSummary: formatWeatherWindLine(snapshot),
    };
  }
  if (wind >= 22 || precip >= 55) {
    return {
      state: 'caution',
      routeHazard: 'Conditions may affect route',
      alertSummary: formatWeatherWindLine(snapshot),
    };
  }

  return {
    state: 'normal',
    routeHazard: null,
    alertSummary: formatWeatherWindLine(snapshot),
  };
}

function buildWeatherHazardData(gps: any): VehicleWeatherHazardData {
  if (!gps?.hasFix) {
    return {
      status: 'unavailable',
      condition: null,
      weatherSummary: null,
      alertSummary: null,
      windMph: null,
      precipitationChance: null,
      temperatureF: null,
      hazardState: 'normal',
      routeHazard: null,
      source: 'none',
      unavailableReason: gps?.permissionDenied ? 'Location permission required' : 'GPS required',
    };
  }

  if (
    !_weatherSnapshot ||
    _weatherSnapshot.status.kind === 'permission-blocked' ||
    _weatherSnapshot.status.kind === 'network-blocked' ||
    (_weatherSnapshot.status.kind === 'error' && !_weatherSnapshot.raw)
  ) {
    return {
      status: 'unavailable',
      condition: null,
      weatherSummary: null,
      alertSummary: null,
      windMph: null,
      precipitationChance: null,
      temperatureF: null,
      hazardState: 'normal',
      routeHazard: null,
      source: 'none',
      unavailableReason: _weatherUnavailableReason ?? 'Weather unavailable',
    };
  }

  const hazard = computeWeatherHazardState(_weatherSnapshot);
  const source: VehicleDataSource =
    _weatherSnapshot.status.source === 'cache_fresh' || _weatherSnapshot.status.source === 'cache_stale'
      ? 'cached'
      : 'gps_live';

  return {
    status: source === 'cached' ? 'fallback' : 'live',
    condition: _weatherSnapshot.current.condition,
    weatherSummary: formatWeatherHeadline(_weatherSnapshot),
    alertSummary: hazard.alertSummary,
    windMph: _weatherSnapshot.current.windSpeed != null ? Math.round(_weatherSnapshot.current.windSpeed) : null,
    precipitationChance:
      _weatherSnapshot.current.precipChance != null
        ? Math.round(_weatherSnapshot.current.precipChance)
        : null,
    temperatureF: _weatherSnapshot.current.temp != null ? Math.round(_weatherSnapshot.current.temp) : null,
    hazardState: hazard.state,
    routeHazard: hazard.routeHazard,
    source,
    unavailableReason: null,
  };
}

function buildExitPlanData(params: {
  remotenessIndex: any | null;
  resourceData: VehicleResourceData;
  gps: any;
}): VehicleExitPlanData {
  const { remotenessIndex, resourceData, gps } = params;
  if (!gps?.hasFix) {
    return {
      status: 'unavailable',
      remotenessScore: null,
      remotenessTier: null,
      nearestBailoutLabel: null,
      nearestBailoutDistanceMiles: null,
      exitToPavementMiles: null,
      exitEtaMinutes: null,
      offlineConfidence: 'unknown',
      connectivityLabel: null,
      fuelSupportLabel: null,
      supportLabel: 'Awaiting location fix',
      source: 'none',
      unavailableReason: gps?.permissionDenied ? 'Location permission required' : 'GPS required',
    };
  }

  const proximity = remotenessIndex?.proximity;
  const nearestOptions = [
    { label: 'Town', distance: proximity?.nearestTown?.distanceMi },
    { label: 'Fuel', distance: proximity?.nearestFuelStation?.distanceMi },
    { label: 'Services', distance: proximity?.nearestServices?.distanceMi },
  ].filter((item) => item.distance != null) as { label: string; distance: number }[];

  nearestOptions.sort((a, b) => a.distance - b.distance);
  const nearest = nearestOptions[0] ?? null;
  const exitToPavementMiles = proximity?.nearestPavedRoad?.distanceMi ?? nearest?.distance ?? null;
  const exitEtaMinutes = computeEtaMinutes(exitToPavementMiles, gps?.position?.speedMph ?? null, 18);
  const cacheReady = Boolean(remotenessIndex?.signals?.cacheReady || remotenessIndex?.signals?.expeditionDataReady);
  const offlineConfidence: VehicleExitPlanData['offlineConfidence'] =
    cacheReady
      ? 'high'
      : remotenessIndex?.connectivity?.signal === 'moderate' || remotenessIndex?.connectivity?.signal === 'strong'
        ? 'medium'
        : remotenessIndex?.connectivity?.signal
          ? 'low'
          : 'unknown';

  const fuelSupportLabel =
    resourceData.fuelRangeMiles != null && exitToPavementMiles != null
      ? resourceData.fuelRangeMiles > exitToPavementMiles * 1.25
        ? 'Fuel margin sufficient'
        : 'Fuel margin tightening'
      : null;

  const advisories = Array.isArray(remotenessIndex?.advisories) ? remotenessIndex.advisories : [];
  return {
    status: remotenessIndex ? 'live' : 'unavailable',
    remotenessScore: remotenessIndex?.score ?? null,
    remotenessTier: remotenessIndex?.tier ?? remotenessIndex?.level ?? null,
    nearestBailoutLabel: nearest ? `Nearest ${nearest.label}` : null,
    nearestBailoutDistanceMiles: nearest ? roundTenths(nearest.distance) : null,
    exitToPavementMiles: exitToPavementMiles != null ? roundTenths(exitToPavementMiles) : null,
    exitEtaMinutes,
    offlineConfidence,
    connectivityLabel: remotenessIndex?.connectivity?.signal ?? null,
    fuelSupportLabel,
    supportLabel:
      advisories[0]?.message ??
      remotenessIndex?.forecast?.advisory ??
      remotenessIndex?.reason ??
      (remotenessIndex ? 'Exit plan available' : 'No remoteness context available'),
    source: remotenessIndex ? 'ai_navigation' : 'none',
    unavailableReason: remotenessIndex ? null : 'No remoteness context available',
  };
}

function buildVehicleSystemsSummary(
  attitudeData: VehicleAttitudeData,
  resourceData: VehicleResourceData,
  exitPlanData: VehicleExitPlanData,
): VehicleSystemStatus[] {
  return [
    {
      id: 'attitude',
      label: 'Attitude',
      status:
        attitudeData.sideSlopeState === 'critical'
          ? 'critical'
          : attitudeData.sideSlopeState === 'caution'
            ? 'warning'
            : attitudeData.status === 'unavailable'
              ? 'offline'
              : 'nominal',
      value:
        attitudeData.rollDeg != null && attitudeData.pitchDeg != null
          ? `R ${Math.round(attitudeData.rollDeg)}° • P ${Math.round(attitudeData.pitchDeg)}°`
          : null,
    },
    {
      id: 'resources',
      label: 'Resources',
      status:
        resourceData.status === 'unavailable'
          ? 'offline'
          : resourceData.fuelPercent != null && resourceData.fuelPercent < 15
            ? 'warning'
            : 'nominal',
      value:
        resourceData.fuelPercent != null || resourceData.waterRemaining != null
          ? `Fuel ${resourceData.fuelPercent ?? '--'}% • Water ${resourceData.waterRemaining ?? '--'} ${resourceData.waterUnit}`
          : null,
    },
    {
      id: 'exit_plan',
      label: 'Exit',
      status:
        exitPlanData.offlineConfidence === 'low'
          ? 'warning'
          : exitPlanData.status === 'unavailable'
            ? 'offline'
            : 'nominal',
      value:
        exitPlanData.exitToPavementMiles != null
          ? `Pavement ${roundTenths(exitPlanData.exitToPavementMiles)} mi`
          : null,
    },
  ];
}

function buildStatusData(params: {
  mode: VehicleDisplayMode;
  navigationData: VehicleNavigationData;
  weatherHazardData: VehicleWeatherHazardData;
  exitPlanData: VehicleExitPlanData;
  attitudeData: VehicleAttitudeData;
  resourceData: VehicleResourceData;
  activeRoute: any | null;
}): VehicleStatusData {
  const { mode, navigationData, weatherHazardData, exitPlanData, attitudeData, resourceData, activeRoute } = params;
  const breadcrumbState = safeRequire('./breadcrumbTracker')?.breadcrumbTracker?.get?.();
  const startedAt = breadcrumbState?.recordingStartedAt ? Date.parse(breadcrumbState.recordingStartedAt) : null;

  return {
    mode,
    routePhase: navigationData.routePhase,
    tripDistanceMiles: roundTenths(breadcrumbState?.totalTrailDistanceMi ?? null),
    tripDurationHours:
      startedAt && Number.isFinite(startedAt) ? roundTenths((Date.now() - startedAt) / 3_600_000) : null,
    daylightRemainingHours: null,
    connectivityForecast:
      exitPlanData.connectivityLabel === 'strong'
        ? 'strong'
        : exitPlanData.connectivityLabel === 'moderate'
          ? 'moderate'
          : exitPlanData.connectivityLabel === 'weak' || exitPlanData.connectivityLabel === 'intermittent'
            ? 'weak'
            : exitPlanData.connectivityLabel === 'offline' || exitPlanData.connectivityLabel === 'no_signal'
              ? 'none'
              : 'unknown',
    remotenessIndex: exitPlanData.remotenessScore != null ? Math.round(exitPlanData.remotenessScore) : null,
    remotenessTier: exitPlanData.remotenessTier,
    distanceFromStartMiles: roundTenths(breadcrumbState?.distanceFromStartMi ?? null),
    elevationGainFt: activeRoute?.elevation_gain_ft ?? breadcrumbState?.elevationGainFt ?? null,
    vehicleSystemsSummary: buildVehicleSystemsSummary(attitudeData, resourceData, exitPlanData),
    weatherRisk: mapWeatherRisk(weatherHazardData.hazardState),
    statusHeadline: navigationData.statusLabel,
    statusSupport:
      navigationData.routePhase === 'route_active'
        ? navigationData.nextManeuver
        : exitPlanData.supportLabel,
  };
}

function buildWeatherData(
  mode: VehicleDisplayMode,
  weatherHazardData: VehicleWeatherHazardData,
  snapshot: ECSWeatherSnapshot | null,
): VehicleWeatherData {
  const alerts = summarizeWeatherAlerts(snapshot);
  return {
    mode,
    radarOverlay: false,
    stormMovement: null,
    windSpeedMph: weatherHazardData.windMph,
    windDirection: snapshot?.current.windDirection ?? null,
    temperatureF: weatherHazardData.temperatureF,
    temperatureTrend: 'steady',
    weatherAlerts: alerts,
    weatherMain: weatherHazardData.condition,
    weatherDescription: weatherHazardData.weatherSummary,
    humidity: snapshot?.current.humidity ?? null,
    feelsLikeF: snapshot?.current.feelsLike ?? null,
    lightningRisk:
      alerts.some((alert) => /thunder|lightning/i.test(alert.title)) ? 'high' : 'unknown',
    windExposure:
      (weatherHazardData.windMph ?? 0) >= 30
        ? 'exposed'
        : (weatherHazardData.windMph ?? 0) >= 18
          ? 'moderate'
          : 'sheltered',
    temperatureDropForecastF: null,
    hazardState: weatherHazardData.hazardState,
    alertSummary: weatherHazardData.alertSummary,
    routeHazard: weatherHazardData.routeHazard,
    unavailableReason: weatherHazardData.unavailableReason,
  };
}

function _rebuildState(reason: 'tick' | 'async' = 'tick'): void {
  const gps = safeRequire('./gpsUIState')?.gpsUIState?.get?.() ?? {};
  _syncSharedOperationalWeatherConsumer(gps);
  _applySharedWeatherState();
  const connectivityModule = safeRequire('./connectivity')?.connectivity;
  const connectivityLevel = connectivityModule?.getLevel?.() ?? 'unknown';
  const remotenessStore = safeRequire('./remotenessStore')?.remotenessStore;
  const remotenessIndex = remotenessStore?.getIndex?.() ?? null;
  const remotenessLegacy = remotenessStore?.get?.() ?? null;
  const activeRoute = safeRequire('./routeStore')?.routeStore?.getActive?.() ?? null;
  const bluSummary = safeRequire('./BluStateStore')?.bluStateStore?.getSummary?.();
  const powerSnapshot = safeRequire('./BluPowerAuthority')?.bluPowerAuthority?.getSnapshot?.();

  const indicators: VehicleIndicators = {
    gpsSignal: mapGpsSignal(Boolean(gps?.hasFix), gps?.fixQuality),
    connectivity: mapConnectivity(connectivityLevel),
    offlineMaps: Boolean(remotenessIndex?.signals?.cacheReady || remotenessIndex?.signals?.expeditionDataReady),
    batteryPercent:
      powerSnapshot?.batteryPercent != null
        ? Math.round(powerSnapshot.batteryPercent)
        : bluSummary?.battery_percent != null
          ? Math.round(bluSummary.battery_percent)
          : null,
    batteryCharging: (powerSnapshot?.inputWatts ?? bluSummary?.live_input ?? 0) > 0,
  };

  const weatherHazardData = buildWeatherHazardData(gps);
  const navigationData = buildNavigationData({
    mode: _state.mode,
    gps,
    activeRoute,
    roadSession: _roadSession,
    remotenessIndex: remotenessIndex ?? remotenessLegacy,
    weatherData: weatherHazardData,
  });
  const attitudeData = buildAttitudeData();
  const resourceData = applyAutomotiveSurfaceToResourceData(buildResourceData());
  const exitPlanData = applyAutomotiveSurfaceToExitPlanData(buildExitPlanData({
    remotenessIndex: remotenessIndex ?? remotenessLegacy,
    resourceData,
    gps,
  }));
  const automotiveWeatherData = applyAutomotiveSurfaceToWeatherHazardData(weatherHazardData);
  const nextMapData = applyAutomotiveSurfaceToNavigationData({
    ...navigationData,
    ..._manualMapOverrides,
  });
  const statusData = applyAutomotiveSurfaceToStatusData(buildStatusData({
    mode: _state.mode,
    navigationData: nextMapData,
    weatherHazardData: automotiveWeatherData,
    exitPlanData,
    attitudeData,
    resourceData,
    activeRoute,
  }));
  const weatherData = buildWeatherData(_state.mode, automotiveWeatherData, _weatherSnapshot);
  const actionTypes = safeRequire('./vehicleDisplayTypes');
  const actions: VehicleAction[] =
    _state.mode === 'highway_drive'
      ? [...((actionTypes?.HIGHWAY_ACTIONS ?? []) as VehicleAction[])]
      : [...((actionTypes?.EXPEDITION_ACTIONS ?? []) as VehicleAction[])];

  const nextPhase = nextMapData.routePhase;
  const sessionState = buildVehiclePresentationModel({
    activeScreen: _state.activeScreen,
    routePhase: nextPhase,
    navigationData: nextMapData,
    attitudeData,
    resourceData,
    weatherHazardData: automotiveWeatherData,
    exitPlanData,
  });
  const systemHealth = buildSystemHealth({
    gps,
    indicators,
    navigationData: nextMapData,
    weatherHazardData,
    exitPlanData,
  });

  if (gps?.hasFix && gps?.position) {
    _lastKnownPosition = {
      lat: gps.position.latitude,
      lon: gps.position.longitude,
      heading: gps.position.headingDeg ?? null,
    };
  }

  _state = {
    ..._state,
    indicators,
    routePhase: nextPhase,
    sessionState: sessionState.sessionState,
    navigationData: nextMapData,
    attitudeData,
    resourceData,
    weatherHazardData: automotiveWeatherData,
    exitPlanData,
    presentationModel: sessionState,
    automotiveSurface: _automotiveSurface,
    mapData: nextMapData,
    statusData,
    weatherData,
    actions,
    systemHealth,
  };

  if (_lastLoggedRoutePhase !== nextPhase) {
    recordSessionEvent('route_phase_changed', { phase: nextPhase });
    _lastLoggedRoutePhase = nextPhase;
  }

  const gpsDegraded = nextPhase !== 'inactive' && indicators.gpsSignal === 'none';
  if (gpsDegraded && !_lastLoggedGpsDegraded) {
    recordSessionEvent('gps_degraded', { routePhase: nextPhase });
  }
  _lastLoggedGpsDegraded = gpsDegraded;

  const telemetryUnavailable = resourceData.status === 'unavailable';
  if (telemetryUnavailable && !_lastLoggedTelemetryUnavailable) {
    recordSessionEvent('telemetry_unavailable', {});
  }
  _lastLoggedTelemetryUnavailable = telemetryUnavailable;

  const weatherUnavailable = automotiveWeatherData.status === 'unavailable';
  if (weatherUnavailable && !_lastLoggedWeatherUnavailable) {
    recordSessionEvent('weather_unavailable', { reason: automotiveWeatherData.unavailableReason });
  }
  _lastLoggedWeatherUnavailable = weatherUnavailable;

  const presentationSignature = JSON.stringify({
    sessionState: sessionState.sessionState,
    routePhase: sessionState.routePhase,
    navigationSource: sessionState.navigation.source,
    attitudeSource: sessionState.attitude.source,
    resourceSource: sessionState.resources.source,
    weatherSource: sessionState.weatherHazard.source,
    exitSource: sessionState.exitPlan.source,
    activeScreen: sessionState.activeScreen,
  });
  if (presentationSignature !== _lastPresentationSignature) {
    recordSessionEvent('presentation_model_generated', {
      sessionState: sessionState.sessionState,
      routePhase: sessionState.routePhase,
      activeScreen: sessionState.activeScreen,
      navigationSource: sessionState.navigation.source,
      attitudeSource: sessionState.attitude.source,
      resourceSource: sessionState.resources.source,
      weatherSource: sessionState.weatherHazard.source,
      exitSource: sessionState.exitPlan.source,
      weatherAvailability: sessionState.weatherHazard.availability,
      exitAvailability: sessionState.exitPlan.availability,
      fallbackUsed: sessionState.fallbackUsed,
    });
    _lastPresentationSignature = presentationSignature;
  }

  const fallbackSignature = sessionState.fallbackUsed
    ? JSON.stringify({
        resources: sessionState.resources.availability,
        weather: sessionState.weatherHazard.availability,
        exit: sessionState.exitPlan.availability,
      })
    : null;
  if (fallbackSignature && fallbackSignature !== _lastFallbackSignature) {
    recordSessionEvent('fallback_triggered', {
      resources: sessionState.resources.availability,
      weather: sessionState.weatherHazard.availability,
      exit: sessionState.exitPlan.availability,
    });
  }
  _lastFallbackSignature = fallbackSignature;

  const unavailableSignature = sessionState.degradedReasons.length
    ? JSON.stringify({
        reasons: sessionState.degradedReasons,
      })
    : null;
  if (unavailableSignature && unavailableSignature !== _lastUnavailableSignature) {
    recordSessionEvent('unavailable_state_triggered', {
      reasons: sessionState.degradedReasons,
      sessionState: sessionState.sessionState,
    });
  }
  _lastUnavailableSignature = unavailableSignature;

  if (reason === 'tick') {
    void _refreshAsyncSources(gps);
    void _refreshAutomotiveSurface(nextMapData);
  }

  _notify();
}

async function _refreshAutomotiveSurface(
  navigationData: VehicleNavigationData,
): Promise<void> {
  if (_automotiveAIRefreshInFlight) return;
  _automotiveAIRefreshInFlight = true;

  try {
    const result = await runECSAI(
      {
        previousAIState: _automotiveAIMemory.lastState,
      },
      _automotiveAIMemory,
      {
        enableWhenIdle: true,
        emitBriefWhenNoSignals: true,
      },
    );

    _automotiveAIMemory = result.memory;
    const nextSurface = selectAutomotiveCommandSurface({
      aiState: result.state,
      navigation: {
        routeName: navigationData.routeName,
        nextManeuver: navigationData.nextManeuver,
        distanceRemainingMiles: navigationData.distanceRemainingMiles,
        etaLabel: navigationData.etaLabel,
        progressPct: navigationData.progressPct,
        statusLabel: navigationData.statusLabel,
      },
    });

    if (JSON.stringify(nextSurface) !== JSON.stringify(_automotiveSurface)) {
      _automotiveSurface = nextSurface;
      _rebuildState('async');
    }
  } catch {
    // Keep the last known automotive surface if AI refresh fails.
  } finally {
    _automotiveAIRefreshInFlight = false;
  }
}

async function _refreshAsyncSources(gps: any): Promise<void> {
  if (!_roadSessionInFlight) {
    _roadSessionInFlight = true;
    try {
      const { loadRoadNavigationSession } = await import('./roadNavigationStore');
      const nextSession = await loadRoadNavigationSession();
      if (JSON.stringify(_roadSession ?? null) !== JSON.stringify(nextSession ?? null)) {
        _roadSession = nextSession;
        _rebuildState('async');
      }
    } catch {
      // ignore
    } finally {
      _roadSessionInFlight = false;
    }
  }
}

async function _startAttitudeStream(): Promise<void> {
  if (_accelerometerSubscription) return;
  try {
    const sensorModule = await import('expo-sensors');
    const Accel = sensorModule.Accelerometer;
    const isAvailable = await Accel.isAvailableAsync();
    _attitudeReading.available = !!isAvailable;
    if (!isAvailable) {
      _attitudeReading.active = false;
      _rebuildState('async');
      return;
    }

    Accel.setUpdateInterval(ATTITUDE_UPDATE_INTERVAL_MS);
    _accelerometerSubscription = Accel.addListener((data: { x: number; y: number; z: number }) => {
      const magnitude = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
      if (!Number.isFinite(magnitude) || magnitude < 0.01) return;

      const rollDeg = Math.round((Math.atan2(data.x, Math.sqrt(data.y * data.y + data.z * data.z)) * 180 / Math.PI) * 10) / 10;
      const pitchDeg = Math.round((Math.atan2(-data.z, Math.sqrt(data.x * data.x + data.y * data.y)) * 180 / Math.PI) * 10) / 10;
      if (_attitudeReading.rollDeg === rollDeg && _attitudeReading.pitchDeg === pitchDeg && _attitudeReading.active) {
        return;
      }

      _attitudeReading = {
        rollDeg,
        pitchDeg,
        available: true,
        active: true,
      };
      _rebuildState('async');
    });
  } catch {
    _attitudeReading.active = false;
    _attitudeReading.available = false;
    _rebuildState('async');
  }
}

function _stopAttitudeStream(): void {
  try {
    _accelerometerSubscription?.remove?.();
  } catch {}
  _accelerometerSubscription = null;
}

export const vehicleDisplayStore = {
  get(): VehicleDisplayState {
    return _state;
  },
  getMode(): VehicleDisplayMode {
    return _state.mode;
  },
  getActiveScreen(): VehicleDisplayScreen {
    return _state.activeScreen;
  },
  getIndicators(): VehicleIndicators {
    return _state.indicators;
  },
  getNavigationData(): VehicleNavigationData {
    return _state.navigationData;
  },
  getAttitudeData(): VehicleAttitudeData {
    return _state.attitudeData;
  },
  getResourceData(): VehicleResourceData {
    return _state.resourceData;
  },
  getWeatherHazardData(): VehicleWeatherHazardData {
    return _state.weatherHazardData;
  },
  getExitPlanData(): VehicleExitPlanData {
    return _state.exitPlanData;
  },
  getMapData(): VehicleMapData {
    return _state.mapData;
  },
  getStatusData(): VehicleStatusData {
    return _state.statusData;
  },
  getWeatherData(): VehicleWeatherData {
    return _state.weatherData;
  },
  getActions(): VehicleAction[] {
    return _state.actions;
  },
  getSystemHealth(): VehicleSystemHealth {
    return _state.systemHealth;
  },
  getRoutePhase(): VehicleRouteSessionState {
    return _state.routePhase;
  },
  getSessionState(): ECSVehicleSessionState {
    return _state.sessionState;
  },
  getPresentationModel(): ECSVehiclePresentationModel {
    return _state.presentationModel;
  },
  getSessionLog(): VehicleSessionLogEntry[] {
    return [..._sessionLogs];
  },
  getLastKnownPosition(): { lat: number; lon: number; heading: number | null } | null {
    return _lastKnownPosition ? { ..._lastKnownPosition } : null;
  },
  buildNativeHealthPayload(): Record<string, unknown> {
    return buildNativeHealthPayload(_state.systemHealth);
  },
  isConnected(): boolean {
    return _state.isConnected;
  },
  setMode(mode: VehicleDisplayMode): void {
    if (_state.mode === mode) return;
    _state.mode = mode;
    _rebuildState('async');
  },
  setActiveScreen(screen: VehicleDisplayScreen): void {
    if (_state.activeScreen === screen) return;
    _state.activeScreen = screen;
    recordSessionEvent('surface_changed', { screen });
    _notify();
  },
  setConnected(connected: boolean): void {
    if (_state.isConnected === connected) return;
    _state.isConnected = connected;
    recordSessionEvent(connected ? 'car_session_connected' : 'car_session_disconnected', {
      screen: _state.activeScreen,
      routePhase: _state.routePhase,
      sessionState: _state.sessionState,
    });
    _notify();
  },
  setManualOverride(override: boolean): void {
    _state.isManualOverride = override;
    _notify();
  },
  setModeOverride(setting: ModeOverrideSetting): void {
    _state.modeOverride = setting;
    _notify();
  },
  getModeOverride(): ModeOverrideSetting {
    return _state.modeOverride;
  },
  setTransitionNotice(notice: ModeTransitionNotice | null): void {
    _state.transitionNotice = notice;
    _notify();
  },
  getTransitionNotice(): ModeTransitionNotice | null {
    return _state.transitionNotice;
  },
  updateMapData(partial: Partial<VehicleMapData>): void {
    _manualMapOverrides = { ..._manualMapOverrides, ...partial };
    _rebuildState('async');
  },
  updateStatusData(partial: Partial<VehicleStatusData>): void {
    _state.statusData = { ..._state.statusData, ...partial };
    _notify();
  },
  updateWeatherData(partial: Partial<VehicleWeatherData>): void {
    _state.weatherData = { ..._state.weatherData, ...partial };
    _notify();
  },
  updateIndicators(partial: Partial<VehicleIndicators>): void {
    _state.indicators = { ..._state.indicators, ...partial };
    _notify();
  },
  updateSystemHealth(health: VehicleSystemHealth): void {
    _state.systemHealth = health;
  },
  executeAction(actionType: VehicleActionType): VehicleActionType {
    return actionType;
  },
  recordTemplateRenderFailure(details: Record<string, unknown>): void {
    recordSessionEvent('template_render_failure', details);
    reportLayoutFailure({
      severity: 'high',
      issueTitle: 'Vehicle display template render failure',
      ecsArea: 'vehicle_display',
      message: typeof details?.message === 'string' ? details.message : 'Vehicle display template render failure',
      signature: `vehicle_display_template:${String(details?.template ?? 'unknown')}:${String(details?.reason ?? details?.message ?? 'render_failure')}`,
      metadata: details,
    });
  },
  start(): void {
    if (_isRunning) return;
    _isRunning = true;
    setVehicleDisplayRunning(true);
    _sharedWeatherUnsubscribe = subscribeSharedOperationalWeather(() => {
      _applySharedWeatherState();
      _rebuildState('async');
    });
    recordSessionEvent('car_session_started', { screen: _state.activeScreen });
    _rebuildState('tick');
    void _startAttitudeStream();
    _refreshTimer = setInterval(() => {
      _rebuildState('tick');
    }, REFRESH_INTERVAL_MS);
  },
  stop(): void {
    if (!_isRunning) return;
    _isRunning = false;
    setVehicleDisplayRunning(false);
    _sharedWeatherUnsubscribe?.();
    _sharedWeatherUnsubscribe = null;
    removeSharedOperationalWeatherConsumer('vehicle_display');
    recordSessionEvent('car_session_ended', { screen: _state.activeScreen });
    if (_refreshTimer) {
      clearInterval(_refreshTimer);
      _refreshTimer = null;
    }
    _stopAttitudeStream();
  },
  isRunning(): boolean {
    return isVehicleDisplayRunning();
  },
  reset(): void {
    vehicleDisplayStore.stop();
    _manualMapOverrides = {};
    _weatherSnapshot = null;
    _weatherUnavailableReason = null;
    _sharedWeatherUnsubscribe?.();
    _sharedWeatherUnsubscribe = null;
    removeSharedOperationalWeatherConsumer('vehicle_display');
    _roadSession = null;
    _sessionLogs = [];
    _lastLoggedRoutePhase = null;
    _lastLoggedGpsDegraded = false;
    _lastLoggedTelemetryUnavailable = false;
    _lastLoggedWeatherUnavailable = false;
    _lastPresentationSignature = null;
    _lastFallbackSignature = null;
    _lastUnavailableSignature = null;
    _lastKnownPosition = null;
    _automotiveSurface = createDefaultAutomotiveSurfaceState();
    _automotiveAIRefreshInFlight = false;
    _automotiveAIMemory = createInitialAIOrchestratorMemory();
    _state = createDefaultState();
    _notify();
  },
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => {
      _listeners.delete(fn);
    };
  },
};

/**
 * Vehicle display type contract for ECS in-vehicle surfaces.
 *
 * The vehicle experience is intentionally route-first and low-distraction.
 * We keep legacy map/status/weather payloads alive for bridge/native
 * compatibility while exposing richer ECS-specific surfaces for the JS UI.
 */

import type { ECSAutomotiveSurfaceState } from './automotive/automotiveSurfaceTypes';

export type VehicleDisplayMode = 'highway_drive' | 'expedition_drive';

export type ModeOverrideSetting = 'auto' | 'highway' | 'expedition';

export const MODE_OVERRIDE_LABELS: Record<ModeOverrideSetting, string> = {
  auto: 'AUTO',
  highway: 'HIGHWAY',
  expedition: 'EXPEDITION',
};

export const VEHICLE_DISPLAY_MODE_LABELS: Record<VehicleDisplayMode, string> = {
  highway_drive: 'HIGHWAY MODE',
  expedition_drive: 'EXPEDITION MODE',
};

export const VEHICLE_DISPLAY_MODE_SHORT_LABELS: Record<VehicleDisplayMode, string> = {
  highway_drive: 'HWY',
  expedition_drive: 'EXP',
};

export const VEHICLE_DISPLAY_MODE_COLORS: Record<VehicleDisplayMode, string> = {
  highway_drive: '#5B8DEF',
  expedition_drive: '#D4A017',
};

export interface ModeTransitionNotice {
  newMode: VehicleDisplayMode;
  previousMode: VehicleDisplayMode;
  message: string;
  timestamp: number;
  isAutomatic: boolean;
  displayDurationMs: number;
}

export type VehicleDisplayScreen =
  | 'navigation'
  | 'attitude'
  | 'resources'
  | 'weather_hazard'
  | 'exit_plan';

export const VEHICLE_DISPLAY_SCREENS: VehicleDisplayScreen[] = [
  'navigation',
  'attitude',
  'resources',
  'weather_hazard',
  'exit_plan',
];

export const VEHICLE_SCREEN_LABELS: Record<VehicleDisplayScreen, string> = {
  navigation: 'NAV',
  attitude: 'ATT',
  resources: 'RES',
  weather_hazard: 'WX',
  exit_plan: 'EXIT',
};

export const VEHICLE_SCREEN_ICONS: Record<VehicleDisplayScreen, string> = {
  navigation: 'navigate-outline',
  attitude: 'car-sport-outline',
  resources: 'battery-half-outline',
  weather_hazard: 'thunderstorm-outline',
  exit_plan: 'trail-sign-outline',
};

export type VehicleRouteSessionState =
  | 'inactive'
  | 'route_selected'
  | 'route_active'
  | 'alerting_or_degraded'
  | 'completed';

export type VehicleSurfaceStatus = 'live' | 'fallback' | 'unavailable';

export type ECSVehicleSessionState =
  | 'idle'
  | 'route_preview'
  | 'guidance_active'
  | 'degraded'
  | 'rerouting'
  | 'paused'
  | 'completed';

export type VehicleSurfaceAvailability =
  | 'available_live'
  | 'available_fallback'
  | 'stale'
  | 'unavailable';

export type VehicleDataSource =
  | 'live_telemetry'
  | 'bluetooth'
  | 'gps_live'
  | 'ai_navigation'
  | 'manual'
  | 'cached'
  | 'none';

export type VehicleHazardState = 'normal' | 'caution' | 'warning' | 'critical';

export interface VehicleNearbyPOI {
  id: string;
  name: string;
  type: 'fuel' | 'service' | 'rest_area' | 'hospital';
  distanceMiles: number;
  bearing: string;
}

export interface VehicleNavigationData {
  mode: VehicleDisplayMode;
  routePhase: VehicleRouteSessionState;
  currentLat: number | null;
  currentLon: number | null;
  headingDeg: number | null;
  speedMph: number | null;
  routeLine: boolean;
  nextManeuver: string | null;
  distanceRemainingMiles: number | null;
  etaMinutes: number | null;
  nearbyFuelServices: VehicleNearbyPOI[];
  breadcrumbTrail: boolean;
  importedGpxRoute: boolean;
  offRouteAlert: boolean;
  offRouteDistanceFt: number | null;
  elevationShading: boolean;
  offlineMapIndicator: boolean;
  offlineMapRegion: string | null;
  routeName: string | null;
  destinationName: string | null;
  statusLabel: string;
  progressPct: number | null;
  etaLabel: string | null;
  hazardState: VehicleHazardState;
  hazardLabel: string | null;
  offRouteDetected: boolean;
  unavailableReason: string | null;
}

export interface VehicleAttitudeData {
  status: VehicleSurfaceStatus;
  rollDeg: number | null;
  pitchDeg: number | null;
  sideSlopeState: 'normal' | 'caution' | 'critical' | 'unavailable';
  tiltState: 'stable' | 'caution' | 'critical' | 'unavailable';
  supportLabel: string;
  source: VehicleDataSource;
  unavailableReason: string | null;
}

export interface VehicleResourceData {
  status: VehicleSurfaceStatus;
  fuelPercent: number | null;
  fuelRangeMiles: number | null;
  waterRemaining: number | null;
  waterUnit: string;
  batteryPercent: number | null;
  powerInputWatts: number | null;
  powerOutputWatts: number | null;
  chargeState: 'charging' | 'discharging' | 'balanced' | 'inactive';
  alternateFluidLabel: string | null;
  alternateFluidValue: number | null;
  alternateFluidUnit: string | null;
  fuelSource: VehicleDataSource;
  waterSource: VehicleDataSource;
  powerSource: VehicleDataSource;
  alternateFluidSource: VehicleDataSource;
  supportLabel: string;
  unavailableReason: string | null;
}

export interface VehicleWeatherHazardData {
  status: VehicleSurfaceStatus;
  condition: string | null;
  weatherSummary: string | null;
  alertSummary: string | null;
  windMph: number | null;
  precipitationChance: number | null;
  temperatureF: number | null;
  hazardState: VehicleHazardState;
  routeHazard: string | null;
  source: VehicleDataSource;
  unavailableReason: string | null;
}

export interface VehicleExitPlanData {
  status: VehicleSurfaceStatus;
  remotenessScore: number | null;
  remotenessTier: string | null;
  nearestBailoutLabel: string | null;
  nearestBailoutDistanceMiles: number | null;
  exitToPavementMiles: number | null;
  exitEtaMinutes: number | null;
  offlineConfidence: 'high' | 'medium' | 'low' | 'unknown';
  connectivityLabel: string | null;
  fuelSupportLabel: string | null;
  supportLabel: string;
  source: VehicleDataSource;
  unavailableReason: string | null;
}

export interface VehicleSurfacePresentationSummary {
  availability: VehicleSurfaceAvailability;
  source: VehicleDataSource;
  title: string | null;
  detail: string | null;
  stale: boolean;
  fallbackUsed: boolean;
}

export interface ECSVehiclePresentationModel {
  generatedAt: string;
  sessionState: ECSVehicleSessionState;
  routePhase: VehicleRouteSessionState;
  activeScreen: VehicleDisplayScreen;
  fallbackUsed: boolean;
  degradedReasons: string[];
  navigation: VehicleSurfacePresentationSummary;
  attitude: VehicleSurfacePresentationSummary;
  resources: VehicleSurfacePresentationSummary;
  weatherHazard: VehicleSurfacePresentationSummary;
  exitPlan: VehicleSurfacePresentationSummary;
}

export interface VehicleStatusData {
  mode: VehicleDisplayMode;
  routePhase: VehicleRouteSessionState;
  tripDistanceMiles: number | null;
  tripDurationHours: number | null;
  daylightRemainingHours: number | null;
  connectivityForecast: 'strong' | 'moderate' | 'weak' | 'none' | 'unknown';
  remotenessIndex: number | null;
  remotenessTier: string | null;
  distanceFromStartMiles: number | null;
  elevationGainFt: number | null;
  vehicleSystemsSummary: VehicleSystemStatus[];
  weatherRisk: 'low' | 'moderate' | 'high' | 'severe' | 'unknown';
  statusHeadline: string | null;
  statusSupport: string | null;
}

export interface VehicleSystemStatus {
  id: string;
  label: string;
  status: 'nominal' | 'warning' | 'critical' | 'offline';
  value: string | null;
}

export interface VehicleWeatherAlert {
  id: string;
  title: string;
  severity: 'advisory' | 'watch' | 'warning' | 'emergency';
  description: string;
  expiresAt: string | null;
}

export interface VehicleWeatherData {
  mode: VehicleDisplayMode;
  radarOverlay: boolean;
  stormMovement: string | null;
  windSpeedMph: number | null;
  windDirection: string | null;
  temperatureF: number | null;
  temperatureTrend: 'rising' | 'falling' | 'steady' | 'unknown';
  weatherAlerts: VehicleWeatherAlert[];
  weatherMain: string | null;
  weatherDescription: string | null;
  humidity: number | null;
  feelsLikeF: number | null;
  lightningRisk: 'low' | 'moderate' | 'high' | 'unknown';
  windExposure: 'sheltered' | 'moderate' | 'exposed' | 'unknown';
  temperatureDropForecastF: number | null;
  hazardState: VehicleHazardState;
  alertSummary: string | null;
  routeHazard: string | null;
  unavailableReason: string | null;
}

export interface VehicleIndicators {
  gpsSignal: 'strong' | 'moderate' | 'weak' | 'none';
  connectivity: 'online' | 'limited' | 'offline' | 'unknown';
  offlineMaps: boolean;
  batteryPercent: number | null;
  batteryCharging: boolean;
}

export interface VehicleSystemHealth {
  gps: VehicleSubsystemStatus;
  connectivity: VehicleSubsystemStatus;
  weather: VehicleSubsystemStatus;
  offlineMaps: VehicleSubsystemStatus;
  route: VehicleSubsystemStatus;
  expedition: VehicleSubsystemStatus;
  breadcrumb: VehicleSubsystemStatus;
  overallStatus: 'nominal' | 'degraded' | 'critical';
  statusLine: string;
  lastEvaluatedAt: number;
}

export interface VehicleSubsystemStatus {
  available: boolean;
  label: string;
  severity: 'ok' | 'warning' | 'error' | 'unknown';
  detail: string | null;
  lastGoodDataAt: number | null;
  isStale: boolean;
  staleSinceMinutes: number | null;
}

export interface VehicleFallbackLabels {
  tripDistance: string;
  tripDuration: string;
  daylight: string;
  connectivity: string;
  remoteness: string;
  distanceFromStart: string;
  elevationGain: string;
  vehicleSystems: string;
  weatherRisk: string;
  temperature: string;
  wind: string;
  stormMovement: string;
  alerts: string;
  gpsPosition: string;
  offlineMap: string;
}

export const DEFAULT_FALLBACK_LABELS: VehicleFallbackLabels = {
  tripDistance: 'Trip data unavailable',
  tripDuration: 'Duration unavailable',
  daylight: 'Daylight data unavailable',
  connectivity: 'Connectivity unknown',
  remoteness: 'Remoteness unavailable',
  distanceFromStart: 'Distance unavailable',
  elevationGain: 'Elevation unavailable',
  vehicleSystems: 'Vehicle systems unavailable',
  weatherRisk: 'Weather risk unknown',
  temperature: 'Temperature unavailable',
  wind: 'Wind data unavailable',
  stormMovement: 'Storm data unavailable',
  alerts: 'Alert status unknown',
  gpsPosition: 'GPS signal lost',
  offlineMap: 'Offline map unavailable',
};

export const STALE_DATA_THRESHOLDS = {
  weatherMinutes: 15,
  gpsMinutes: 2,
  statusMinutes: 5,
} as const;

export type VehicleSessionLogEvent =
  | 'car_session_started'
  | 'car_session_ended'
  | 'car_session_connected'
  | 'car_session_disconnected'
  | 'surface_changed'
  | 'route_phase_changed'
  | 'gps_degraded'
  | 'telemetry_unavailable'
  | 'presentation_model_generated'
  | 'fallback_triggered'
  | 'unavailable_state_triggered'
  | 'template_render_failure'
  | 'weather_unavailable';

export interface VehicleSessionLogEntry {
  event: VehicleSessionLogEvent;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface VehicleDisplayState {
  mode: VehicleDisplayMode;
  activeScreen: VehicleDisplayScreen;
  isConnected: boolean;
  isManualOverride: boolean;
  modeOverride: ModeOverrideSetting;
  indicators: VehicleIndicators;
  systemHealth: VehicleSystemHealth;
  routePhase: VehicleRouteSessionState;
  sessionState: ECSVehicleSessionState;
  navigationData: VehicleNavigationData;
  attitudeData: VehicleAttitudeData;
  resourceData: VehicleResourceData;
  weatherHazardData: VehicleWeatherHazardData;
  exitPlanData: VehicleExitPlanData;
  automotiveSurface: ECSAutomotiveSurfaceState;
  presentationModel: ECSVehiclePresentationModel;
  mapData: VehicleMapData;
  statusData: VehicleStatusData;
  weatherData: VehicleWeatherData;
  actions: VehicleAction[];
  lastUpdatedAt: string;
  transitionNotice: ModeTransitionNotice | null;
}

export interface VehicleDisplaySignals {
  roadClassification: string | null;
  speedMph: number | null;
  remotenessIndex: number | null;
  activeExpedition: boolean;
  hasGpsFix: boolean;
}

export const VEHICLE_DISPLAY_THRESHOLDS = {
  highwaySpeedMph: 35,
  expeditionSpeedMph: 20,
  expeditionRemotenessThreshold: 40,
  highwayRemotenessThreshold: 15,
  highwayRoadTypes: ['motorway', 'primary', 'secondary', 'trunk'] as string[],
  expeditionRoadTypes: ['track', 'trail', 'unclassified', 'path'] as string[],
  confirmationWindowMs: 15_000,
  switchCooldownMs: 45_000,
  transitionNoticeDurationMs: 5_000,
} as const;

export interface VehicleAction {
  id: string;
  label: string;
  icon: string;
  color: string;
  enabled: boolean;
  actionType: VehicleActionType;
}

export type VehicleActionType =
  | 'add_waypoint'
  | 'quick_note'
  | 'find_fuel'
  | 'report_hazard'
  | 'navigate_home'
  | 'drop_waypoint'
  | 'incident_marker'
  | 'return_to_start'
  | 'emergency_comms'
  | 'set_mode_auto'
  | 'set_mode_highway'
  | 'set_mode_expedition';

export const HIGHWAY_ACTIONS: VehicleAction[] = [
  {
    id: 'hw_add_waypoint',
    label: 'Add Waypoint',
    icon: 'pin-outline',
    color: '#5B8DEF',
    enabled: true,
    actionType: 'add_waypoint',
  },
  {
    id: 'hw_quick_note',
    label: 'Quick Note',
    icon: 'create-outline',
    color: '#8B949E',
    enabled: true,
    actionType: 'quick_note',
  },
  {
    id: 'hw_find_fuel',
    label: 'Find Fuel',
    icon: 'car-outline',
    color: '#4CAF50',
    enabled: true,
    actionType: 'find_fuel',
  },
  {
    id: 'hw_report_hazard',
    label: 'Report Hazard',
    icon: 'warning-outline',
    color: '#E67E22',
    enabled: true,
    actionType: 'report_hazard',
  },
  {
    id: 'hw_navigate_home',
    label: 'Navigate Home',
    icon: 'home-outline',
    color: '#5AC8FA',
    enabled: true,
    actionType: 'navigate_home',
  },
];

export const EXPEDITION_ACTIONS: VehicleAction[] = [
  {
    id: 'ex_drop_waypoint',
    label: 'Drop Waypoint',
    icon: 'location-outline',
    color: '#D4A017',
    enabled: true,
    actionType: 'drop_waypoint',
  },
  {
    id: 'ex_incident_marker',
    label: 'Incident Marker',
    icon: 'alert-circle-outline',
    color: '#EF5350',
    enabled: true,
    actionType: 'incident_marker',
  },
  {
    id: 'ex_quick_note',
    label: 'Quick Note',
    icon: 'create-outline',
    color: '#8B949E',
    enabled: true,
    actionType: 'quick_note',
  },
  {
    id: 'ex_return_to_start',
    label: 'Return to Start',
    icon: 'return-down-back-outline',
    color: '#5AC8FA',
    enabled: true,
    actionType: 'return_to_start',
  },
  {
    id: 'ex_emergency_comms',
    label: 'Emergency Comms',
    icon: 'radio-outline',
    color: '#C0392B',
    enabled: true,
    actionType: 'emergency_comms',
  },
];

// Legacy aliases kept to minimize churn in bridge/native fallbacks.
export type VehicleMapData = VehicleNavigationData;

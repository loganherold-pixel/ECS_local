/**
 * VehicleDisplayMode — Type Definitions
 *
 * Defines the data structures for vehicle display integration
 * (Android Auto / Apple CarPlay).
 *
 * Vehicle displays present a reduced, driver-safe interface while
 * the mobile device remains the full ECS command console.
 *
 * Two operating modes:
 *   - HighwayDrive: paved-road travel
 *   - ExpeditionDrive: off-road and remote travel
 *
 * Four display screens:
 *   - Map: navigation and route display
 *   - Status: trip/expedition summary
 *   - Weather: conditions and forecasts
 *   - Actions: large driver-safe action buttons
 *
 * Mode Override Settings:
 *   - auto: automatic switching based on context signals
 *   - highway: force HighwayDrive regardless of context
 *   - expedition: force ExpeditionDrive regardless of context
 */

// ── Operating Modes ─────────────────────────────────────────

export type VehicleDisplayMode = 'highway_drive' | 'expedition_drive';

/**
 * Mode override setting for manual control.
 *   - auto: automatic context-based switching
 *   - highway: force HighwayDrive
 *   - expedition: force ExpeditionDrive
 */
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
  highway_drive: '#5B8DEF',      // navigation blue
  expedition_drive: '#D4A017',   // ECS gold
};

// ── Mode Transition Notice ──────────────────────────────────

/**
 * A brief, non-blocking notification shown when the vehicle
 * display mode changes automatically.
 */
export interface ModeTransitionNotice {
  /** The new mode that was switched to */
  newMode: VehicleDisplayMode;
  /** The previous mode */
  previousMode: VehicleDisplayMode;
  /** Human-readable message */
  message: string;
  /** Timestamp of the transition */
  timestamp: number;
  /** Whether this was an automatic switch (vs manual) */
  isAutomatic: boolean;
  /** How long to display the notice (ms) */
  displayDurationMs: number;
}

// ── Display Screens ─────────────────────────────────────────

export type VehicleDisplayScreen = 'map' | 'status' | 'weather' | 'actions';

export const VEHICLE_DISPLAY_SCREENS: VehicleDisplayScreen[] = [
  'map',
  'status',
  'weather',
  'actions',
];

export const VEHICLE_SCREEN_LABELS: Record<VehicleDisplayScreen, string> = {
  map: 'MAP',
  status: 'STATUS',
  weather: 'WEATHER',
  actions: 'ACTIONS',
};

export const VEHICLE_SCREEN_ICONS: Record<VehicleDisplayScreen, string> = {
  map: 'map-outline',
  status: 'speedometer-outline',
  weather: 'cloud-outline',
  actions: 'apps-outline',
};

// ── Map Screen Data ─────────────────────────────────────────

export interface VehicleMapData {
  mode: VehicleDisplayMode;

  // Common
  currentLat: number | null;
  currentLon: number | null;
  headingDeg: number | null;
  speedMph: number | null;

  // HighwayDrive
  routeLine: boolean;
  nextManeuver: string | null;
  distanceRemainingMiles: number | null;
  etaMinutes: number | null;
  nearbyFuelServices: VehicleNearbyPOI[];

  // ExpeditionDrive
  breadcrumbTrail: boolean;
  importedGpxRoute: boolean;
  offRouteAlert: boolean;
  offRouteDistanceFt: number | null;
  elevationShading: boolean;
  offlineMapIndicator: boolean;
  offlineMapRegion: string | null;
}

export interface VehicleNearbyPOI {
  id: string;
  name: string;
  type: 'fuel' | 'service' | 'rest_area' | 'hospital';
  distanceMiles: number;
  bearing: string;
}

// ── Status Screen Data ──────────────────────────────────────

export interface VehicleStatusData {
  mode: VehicleDisplayMode;

  // HighwayDrive
  tripDistanceMiles: number | null;
  tripDurationHours: number | null;
  daylightRemainingHours: number | null;
  connectivityForecast: 'strong' | 'moderate' | 'weak' | 'none' | 'unknown';

  // ExpeditionDrive
  remotenessIndex: number | null;
  remotenessTier: string | null;
  distanceFromStartMiles: number | null;
  elevationGainFt: number | null;
  vehicleSystemsSummary: VehicleSystemStatus[];
  weatherRisk: 'low' | 'moderate' | 'high' | 'severe' | 'unknown';
}

export interface VehicleSystemStatus {
  id: string;
  label: string;
  status: 'nominal' | 'warning' | 'critical' | 'offline';
  value: string | null;
}

// ── Weather Screen Data ─────────────────────────────────────

export interface VehicleWeatherData {
  mode: VehicleDisplayMode;

  // Common
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

  // ExpeditionDrive extras
  lightningRisk: 'low' | 'moderate' | 'high' | 'unknown';
  windExposure: 'sheltered' | 'moderate' | 'exposed' | 'unknown';
  temperatureDropForecastF: number | null;
}

export interface VehicleWeatherAlert {
  id: string;
  title: string;
  severity: 'advisory' | 'watch' | 'warning' | 'emergency';
  description: string;
  expiresAt: string | null;
}

// ── Actions Screen Data ─────────────────────────────────────

export interface VehicleAction {
  id: string;
  label: string;
  icon: string;
  color: string;
  /** Whether this action is available in the current context */
  enabled: boolean;
  /** Action type for dispatch */
  actionType: VehicleActionType;
}

export type VehicleActionType =
  // HighwayDrive actions
  | 'add_waypoint'
  | 'quick_note'
  | 'find_fuel'
  | 'report_hazard'
  | 'navigate_home'
  // ExpeditionDrive actions
  | 'drop_waypoint'
  | 'incident_marker'
  | 'return_to_start'
  | 'emergency_comms'
  // Mode override actions
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

// ── Shared Vehicle Indicators ───────────────────────────────

export interface VehicleIndicators {
  gpsSignal: 'strong' | 'moderate' | 'weak' | 'none';
  connectivity: 'online' | 'limited' | 'offline' | 'unknown';
  offlineMaps: boolean;
  batteryPercent: number | null;
  batteryCharging: boolean;
}

// ── System Health (Fallback Layer) ──────────────────────────

/**
 * System health status for the vehicle display fallback layer.
 * Each subsystem reports its availability so screens can degrade gracefully.
 */
export interface VehicleSystemHealth {
  /** GPS fix status */
  gps: VehicleSubsystemStatus;
  /** Network connectivity status */
  connectivity: VehicleSubsystemStatus;
  /** Weather data availability */
  weather: VehicleSubsystemStatus;
  /** Offline map availability */
  offlineMaps: VehicleSubsystemStatus;
  /** Active route availability */
  route: VehicleSubsystemStatus;
  /** Active expedition status */
  expedition: VehicleSubsystemStatus;
  /** Breadcrumb trail status */
  breadcrumb: VehicleSubsystemStatus;
  /** Overall system health summary */
  overallStatus: 'nominal' | 'degraded' | 'critical';
  /** Compact status line for display */
  statusLine: string;
  /** Timestamp of last health evaluation */
  lastEvaluatedAt: number;
}

export interface VehicleSubsystemStatus {
  /** Whether the subsystem is available */
  available: boolean;
  /** Short label for display (e.g., "GPS OK", "No Weather") */
  label: string;
  /** Severity level */
  severity: 'ok' | 'warning' | 'error' | 'unknown';
  /** Optional detail message */
  detail: string | null;
  /** Timestamp of last known good data (for stale detection) */
  lastGoodDataAt: number | null;
  /** Whether data is stale (available but outdated) */
  isStale: boolean;
  /** How many minutes since last good data (null if never had data) */
  staleSinceMinutes: number | null;
}

/**
 * Fallback display values for screens when data is unavailable.
 * Each field contains the placeholder text to show.
 */
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

/**
 * Thresholds for stale data detection (in minutes).
 */
export const STALE_DATA_THRESHOLDS = {
  /** Weather data older than this is considered stale */
  weatherMinutes: 15,
  /** GPS data older than this is considered stale */
  gpsMinutes: 2,
  /** Status data older than this is considered stale */
  statusMinutes: 5,
} as const;

// ── Combined Vehicle Display State ──────────────────────────

export interface VehicleDisplayState {
  /** Current operating mode */
  mode: VehicleDisplayMode;
  /** Active screen */
  activeScreen: VehicleDisplayScreen;
  /** Whether vehicle display is connected/active */
  isConnected: boolean;
  /** Whether manual mode override is active */
  isManualOverride: boolean;
  /** Current mode override setting */
  modeOverride: ModeOverrideSetting;
  /** Shared indicators */
  indicators: VehicleIndicators;
  /** System health for fallback handling */
  systemHealth: VehicleSystemHealth;
  /** Screen data (computed on demand) */
  mapData: VehicleMapData;
  statusData: VehicleStatusData;
  weatherData: VehicleWeatherData;
  /** Actions for current mode */
  actions: VehicleAction[];
  /** Last updated timestamp */
  lastUpdatedAt: string;
  /** Active transition notice (null when no notice) */
  transitionNotice: ModeTransitionNotice | null;
}

// ── Mode Detection Signals ──────────────────────────────────

export interface VehicleDisplaySignals {
  roadClassification: string | null;
  speedMph: number | null;
  remotenessIndex: number | null;
  activeExpedition: boolean;
  hasGpsFix: boolean;
}

export const VEHICLE_DISPLAY_THRESHOLDS = {
  /** Speed above this favors HighwayDrive */
  highwaySpeedMph: 35,
  /** Speed below this favors ExpeditionDrive */
  expeditionSpeedMph: 20,
  /** Remoteness above this favors ExpeditionDrive */
  expeditionRemotenessThreshold: 40,
  /** Remoteness below this favors HighwayDrive */
  highwayRemotenessThreshold: 15,
  /** Road types that favor HighwayDrive */
  highwayRoadTypes: ['motorway', 'primary', 'secondary', 'trunk'] as string[],
  /** Road types that favor ExpeditionDrive */
  expeditionRoadTypes: ['track', 'trail', 'unclassified', 'path'] as string[],
  /** Confirmation window before switching (ms) */
  confirmationWindowMs: 15_000,
  /** Cooldown after switching (ms) */
  switchCooldownMs: 45_000,
  /** Transition notice display duration (ms) */
  transitionNoticeDurationMs: 5_000,
} as const;


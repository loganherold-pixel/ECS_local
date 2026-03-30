/**
 * ECS Offline Expedition Intelligence — Type Definitions (Phase 9)
 * ================================================================
 *
 * Defines the data structures for offline situational awareness
 * and risk information provided during ExpeditionDrive mode.
 *
 * All intelligence outputs are designed for driver-safe display:
 *   - Short messages
 *   - Simple labels
 *   - No complex charts or large text blocks
 *
 * The intelligence module operates entirely offline using:
 *   - Trail geometry (breadcrumb history)
 *   - Elevation data (from route segments)
 *   - Remoteness data (from remotenessStore)
 *   - Breadcrumb history (from breadcrumbTracker)
 *   - Weather cache (from weatherStore)
 *
 * No internet connection is required.
 */

// ── Terrain Difficulty ──────────────────────────────────────

/**
 * Terrain difficulty classification.
 * Estimated from slope, elevation change, route curvature,
 * and surface classification.
 */
export type TerrainDifficultyLevel = 'Easy' | 'Moderate' | 'Difficult' | 'Extreme';

export interface TerrainDifficultyEstimate {
  /** Overall difficulty level */
  level: TerrainDifficultyLevel;
  /** Numeric score 0–100 for finer granularity */
  score: number;
  /** Short human-readable reason */
  reason: string;
  /** Display color for the difficulty level */
  color: string;
  /** Icon name (Ionicons) */
  icon: string;
  /** Individual factor contributions */
  factors: {
    /** Slope factor contribution (0–25) */
    slope: number;
    /** Elevation change factor contribution (0–25) */
    elevationChange: number;
    /** Route curvature factor contribution (0–25) */
    curvature: number;
    /** Surface/speed factor contribution (0–25) */
    surface: number;
  };
}

// ── Offline Remoteness ──────────────────────────────────────

/**
 * Enhanced remoteness estimate for offline operation.
 * Provides a local estimate even when live services are unavailable.
 */
export interface OfflineRemotenessEstimate {
  /** Remoteness score 0–100 */
  score: number;
  /** Tier label */
  tier: string;
  /** Display color */
  color: string;
  /** Short reason for the estimate */
  reason: string;
  /** Whether this is based on live data or offline estimation */
  source: 'live' | 'offline_estimate';
  /** Individual signal contributions */
  signals: {
    /** Distance from known roads (estimated) */
    distanceFromRoads: number;
    /** Distance from start point */
    distanceFromStart: number;
    /** Breadcrumb isolation factor */
    breadcrumbIsolation: number;
    /** Connectivity factor */
    connectivityFactor: number;
  };
}

// ── Elevation Alerts ────────────────────────────────────────

/**
 * Types of elevation alerts.
 */
export type ElevationAlertType =
  | 'steep_ascent'
  | 'steep_descent'
  | 'high_elevation'
  | 'rapid_elevation_change';

/**
 * An elevation alert detected from trail/route data.
 */
export interface ElevationAlert {
  /** Alert type */
  type: ElevationAlertType;
  /** Short driver-safe message */
  message: string;
  /** Severity: low, moderate, high */
  severity: 'low' | 'moderate' | 'high';
  /** Display color */
  color: string;
  /** Icon name (Ionicons) */
  icon: string;
  /** Relevant metric value (e.g., grade percentage, elevation in ft) */
  metricValue: number | null;
  /** Metric unit label */
  metricUnit: string | null;
}

// ── Cached Weather Awareness ────────────────────────────────

/**
 * Weather awareness from cached data.
 * Clearly indicates when data is cached vs live.
 */
export interface CachedWeatherAwareness {
  /** Whether weather data is available (cached or live) */
  available: boolean;
  /** Data source */
  source: 'live' | 'cached' | 'unavailable';
  /** How old the cached data is (human-readable) */
  ageLabel: string | null;
  /** Age in minutes */
  ageMinutes: number | null;
  /** Staleness level */
  staleness: 'fresh' | 'aging' | 'stale' | 'very_stale' | 'unavailable';
  /** Last known temperature (F) */
  temperatureF: number | null;
  /** Last known wind speed (mph) */
  windSpeedMph: number | null;
  /** Last known wind direction */
  windDirection: string | null;
  /** Storm risk assessment */
  stormRisk: 'low' | 'moderate' | 'high' | 'unknown';
  /** Weather description */
  description: string | null;
  /** Number of active weather alerts */
  alertCount: number;
  /** Display color for staleness */
  stalenessColor: string;
}

// ── Offline Hazard Awareness ────────────────────────────────

/**
 * Types of offline hazard indicators.
 */
export type HazardType =
  | 'steep_grade'
  | 'rapid_elevation_change'
  | 'sharp_curvature'
  | 'ridge_approach'
  | 'narrow_trail'
  | 'exposure_risk';

/**
 * An offline hazard indicator detected from terrain and route patterns.
 */
export interface HazardIndicator {
  /** Hazard type */
  type: HazardType;
  /** Short driver-safe warning message */
  message: string;
  /** Severity level */
  severity: 'advisory' | 'caution' | 'warning';
  /** Display color */
  color: string;
  /** Icon name (Ionicons) */
  icon: string;
  /** Distance ahead where hazard is expected (miles), null if current */
  distanceAheadMi: number | null;
}

// ── Expedition Risk Score ───────────────────────────────────

/**
 * Expedition risk level classification.
 */
export type ExpeditionRiskLevel = 'Low Risk' | 'Moderate Risk' | 'High Risk' | 'Extreme Risk';

/**
 * Combined expedition risk assessment.
 * Synthesizes remoteness, terrain difficulty, elevation risk,
 * and weather snapshot into a single risk level.
 */
export interface ExpeditionRiskAssessment {
  /** Overall risk level */
  level: ExpeditionRiskLevel;
  /** Numeric score 0–100 */
  score: number;
  /** Display color */
  color: string;
  /** Icon name (Ionicons) */
  icon: string;
  /** Short summary message */
  summary: string;
  /** Individual risk factor contributions */
  factors: {
    /** Remoteness contribution (0–25) */
    remoteness: number;
    /** Terrain difficulty contribution (0–25) */
    terrain: number;
    /** Elevation risk contribution (0–25) */
    elevation: number;
    /** Weather risk contribution (0–25) */
    weather: number;
  };
  /** Top risk drivers (max 3, short labels) */
  drivers: string[];
}

// ── Combined Intelligence Output ────────────────────────────

/**
 * Complete Offline Expedition Intelligence output.
 * Contains all intelligence assessments for the current position.
 */
export interface OfflineExpeditionIntelligenceOutput {
  /** Whether intelligence is active (ExpeditionDrive mode) */
  isActive: boolean;
  /** When this intelligence was last computed */
  computedAt: string;
  /** Whether the device is currently offline */
  isOffline: boolean;

  /** Terrain difficulty estimate */
  terrainDifficulty: TerrainDifficultyEstimate;
  /** Offline remoteness estimate */
  remoteness: OfflineRemotenessEstimate;
  /** Active elevation alerts (max 3) */
  elevationAlerts: ElevationAlert[];
  /** Cached weather awareness */
  weatherAwareness: CachedWeatherAwareness;
  /** Active hazard indicators (max 3) */
  hazards: HazardIndicator[];
  /** Overall expedition risk assessment */
  riskAssessment: ExpeditionRiskAssessment;

  /** Data availability flags */
  dataAvailability: {
    hasGps: boolean;
    hasRoute: boolean;
    hasBreadcrumbs: boolean;
    hasElevation: boolean;
    hasWeatherCache: boolean;
    hasRemoteness: boolean;
  };
}

// ── Display Constants ───────────────────────────────────────

export const TERRAIN_DIFFICULTY_COLORS: Record<TerrainDifficultyLevel, string> = {
  Easy: '#66BB6A',
  Moderate: '#FFB74D',
  Difficult: '#FF7043',
  Extreme: '#EF5350',
};

export const TERRAIN_DIFFICULTY_ICONS: Record<TerrainDifficultyLevel, string> = {
  Easy: 'trail-sign-outline',
  Moderate: 'trending-up-outline',
  Difficult: 'triangle-outline',
  Extreme: 'flame-outline',
};

export const EXPEDITION_RISK_COLORS: Record<ExpeditionRiskLevel, string> = {
  'Low Risk': '#66BB6A',
  'Moderate Risk': '#FFB74D',
  'High Risk': '#FF7043',
  'Extreme Risk': '#EF5350',
};

export const EXPEDITION_RISK_ICONS: Record<ExpeditionRiskLevel, string> = {
  'Low Risk': 'shield-checkmark-outline',
  'Moderate Risk': 'alert-circle-outline',
  'High Risk': 'warning-outline',
  'Extreme Risk': 'flame-outline',
};

export const HAZARD_SEVERITY_COLORS: Record<string, string> = {
  advisory: '#42A5F5',
  caution: '#FFB74D',
  warning: '#EF5350',
};

export const ELEVATION_ALERT_COLORS: Record<string, string> = {
  low: '#FFB74D',
  moderate: '#FF7043',
  high: '#EF5350',
};

export const STALENESS_COLORS: Record<string, string> = {
  fresh: '#66BB6A',
  aging: '#FFB74D',
  stale: '#FF7043',
  very_stale: '#EF5350',
  unavailable: '#8A8A85',
};


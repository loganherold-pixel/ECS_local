/**
 * ECS Predictive Expedition Awareness — Type Definitions (Phase 10)
 * ==================================================================
 *
 * Defines the data structures for predictive expedition intelligence
 * that analyzes the current expedition route and predicts upcoming risks.
 *
 * The module operates during ExpeditionDrive mode and generates
 * predictions for:
 *   1. Fuel Range Risk
 *   2. Daylight Risk
 *   3. Water Supply Projection
 *   4. Remoteness Exposure Prediction
 *   5. Terrain Exposure Prediction
 *   6. Combined Expedition Risk Summary
 *
 * All outputs are driver-safe: short messages, simple labels,
 * no complex charts or large text blocks.
 *
 * DATA SOURCES (all local, existing ECS stores):
 *   - telemetryConfigStore: fuel, water, power data
 *   - routeStore: active route, distance remaining
 *   - breadcrumbTracker: trail data, speed, distance
 *   - remotenessStore: remoteness index
 *   - gpsUIState: GPS position, speed, altitude
 *   - weatherStore: cached weather (temperature)
 *   - offlineExpeditionIntelligence: terrain difficulty (reuse)
 *   - vehicleDisplayStore: current display mode
 *   - missionStore: active expedition
 */

// ── Prediction Status Levels ────────────────────────────────

export type PredictionStatus = 'sufficient' | 'caution' | 'risk' | 'unknown';

// ── Fuel Range Risk Prediction ──────────────────────────────

export interface FuelRangePrediction {
  /** Whether fuel data is available for prediction */
  available: boolean;
  /** Overall fuel status */
  status: PredictionStatus;
  /** Short driver-safe message */
  message: string;
  /** Fuel remaining in gallons */
  fuelRemainingGal: number | null;
  /** Estimated fuel range in miles */
  estimatedRangeMi: number | null;
  /** Route distance remaining in miles */
  routeDistanceRemainingMi: number | null;
  /** Fuel margin (range - distance remaining) in miles */
  marginMi: number | null;
  /** Terrain difficulty multiplier applied to consumption */
  terrainMultiplier: number;
  /** Fuel percentage remaining */
  fuelPercent: number | null;
}

// ── Daylight Risk Prediction ────────────────────────────────

export interface DaylightPrediction {
  /** Whether daylight data is available */
  available: boolean;
  /** Overall daylight status */
  status: PredictionStatus;
  /** Short driver-safe message */
  message: string;
  /** Hours of daylight remaining */
  daylightRemainingHours: number | null;
  /** Estimated hours to complete route */
  estimatedCompletionHours: number | null;
  /** Estimated sunset time (local, HH:MM format) */
  sunsetTimeLocal: string | null;
  /** Whether expedition will likely continue after dark */
  darknessLikely: boolean;
  /** Daylight margin (daylight remaining - completion time) in hours */
  marginHours: number | null;
}

// ── Water Supply Projection ─────────────────────────────────

export interface WaterSupplyPrediction {
  /** Whether water data is available */
  available: boolean;
  /** Overall water status */
  status: PredictionStatus;
  /** Short driver-safe message */
  message: string;
  /** Water remaining in liters */
  waterRemainingL: number | null;
  /** Estimated water needed for remaining expedition */
  waterNeededL: number | null;
  /** Water margin in liters */
  marginL: number | null;
  /** Estimated days of water autonomy */
  autonomyDays: number | null;
  /** Temperature factor (hot weather increases consumption) */
  temperatureFactor: number;
}

// ── Remoteness Exposure Prediction ──────────────────────────

export type RemotenessTrend = 'increasing' | 'stable' | 'decreasing' | 'unknown';

export interface RemotenessExposurePrediction {
  /** Whether remoteness data is available */
  available: boolean;
  /** Overall remoteness status */
  status: PredictionStatus;
  /** Short driver-safe message */
  message: string;
  /** Current remoteness score (0–100) */
  currentScore: number | null;
  /** Current remoteness tier */
  currentTier: string | null;
  /** Remoteness trend direction */
  trend: RemotenessTrend;
  /** Distance from start point in miles */
  distanceFromStartMi: number | null;
  /** Estimated distance to nearest exit route (miles) */
  distanceToExitMi: number | null;
  /** Whether isolation risk is elevated */
  isolationRisk: boolean;
}

// ── Terrain Exposure Prediction ─────────────────────────────

export interface TerrainExposurePrediction {
  /** Whether terrain data is available */
  available: boolean;
  /** Overall terrain status */
  status: PredictionStatus;
  /** Short driver-safe message */
  message: string;
  /** Predicted difficulty of upcoming terrain */
  upcomingDifficulty: 'Easy' | 'Moderate' | 'Difficult' | 'Extreme' | 'Unknown';
  /** Estimated elevation change ahead (feet) */
  elevationChangeAheadFt: number | null;
  /** Whether a technical trail section is predicted */
  technicalSectionAhead: boolean;
  /** Predicted slope severity */
  slopeSeverity: 'mild' | 'moderate' | 'steep' | 'extreme' | 'unknown';
  /** Route curvature assessment */
  curvatureLevel: 'straight' | 'winding' | 'technical' | 'unknown';
}

// ── Combined Expedition Risk Summary ────────────────────────

export type PredictiveRiskLevel = 'Low Risk' | 'Moderate Risk' | 'High Risk' | 'Extreme Risk';

export interface PredictiveRiskSummary {
  /** Overall risk level */
  level: PredictiveRiskLevel;
  /** Numeric score 0–100 */
  score: number;
  /** Display color */
  color: string;
  /** Icon name (Ionicons) */
  icon: string;
  /** Short summary message */
  summary: string;
  /** Individual risk factor contributions (0–20 each) */
  factors: {
    fuel: number;
    daylight: number;
    water: number;
    remoteness: number;
    terrain: number;
  };
  /** Top risk drivers (max 3, short labels) */
  drivers: string[];
}

// ── Combined Predictive Awareness Output ────────────────────

export interface PredictiveAwarenessOutput {
  /** Whether the predictive engine is active */
  isActive: boolean;
  /** When predictions were last computed */
  computedAt: string;
  /** Whether the device is currently in ExpeditionDrive mode */
  isExpeditionDrive: boolean;

  /** Fuel range risk prediction */
  fuelPrediction: FuelRangePrediction;
  /** Daylight risk prediction */
  daylightPrediction: DaylightPrediction;
  /** Water supply projection */
  waterPrediction: WaterSupplyPrediction;
  /** Remoteness exposure prediction */
  remotenessPrediction: RemotenessExposurePrediction;
  /** Terrain exposure prediction */
  terrainPrediction: TerrainExposurePrediction;
  /** Combined risk summary */
  riskSummary: PredictiveRiskSummary;

  /** Data availability flags */
  dataAvailability: {
    hasFuel: boolean;
    hasWater: boolean;
    hasRoute: boolean;
    hasGps: boolean;
    hasDaylight: boolean;
    hasRemoteness: boolean;
    hasTerrain: boolean;
    hasWeather: boolean;
  };
}

// ── Display Constants ───────────────────────────────────────

export const PREDICTION_STATUS_COLORS: Record<PredictionStatus, string> = {
  sufficient: '#66BB6A',
  caution: '#FFB74D',
  risk: '#EF5350',
  unknown: '#8A8A85',
};

export const PREDICTION_STATUS_ICONS: Record<PredictionStatus, string> = {
  sufficient: 'checkmark-circle-outline',
  caution: 'alert-circle-outline',
  risk: 'warning-outline',
  unknown: 'help-circle-outline',
};

export const PREDICTION_STATUS_LABELS: Record<PredictionStatus, string> = {
  sufficient: 'Sufficient',
  caution: 'Caution',
  risk: 'Risk',
  unknown: 'Unknown',
};

export const PREDICTIVE_RISK_COLORS: Record<PredictiveRiskLevel, string> = {
  'Low Risk': '#66BB6A',
  'Moderate Risk': '#FFB74D',
  'High Risk': '#FF7043',
  'Extreme Risk': '#EF5350',
};

export const PREDICTIVE_RISK_ICONS: Record<PredictiveRiskLevel, string> = {
  'Low Risk': 'shield-checkmark-outline',
  'Moderate Risk': 'alert-circle-outline',
  'High Risk': 'warning-outline',
  'Extreme Risk': 'flame-outline',
};

export const REMOTENESS_TREND_ICONS: Record<RemotenessTrend, string> = {
  increasing: 'arrow-up-outline',
  stable: 'remove-outline',
  decreasing: 'arrow-down-outline',
  unknown: 'help-circle-outline',
};

export const REMOTENESS_TREND_LABELS: Record<RemotenessTrend, string> = {
  increasing: 'Increasing',
  stable: 'Stable',
  decreasing: 'Decreasing',
  unknown: 'Unknown',
};


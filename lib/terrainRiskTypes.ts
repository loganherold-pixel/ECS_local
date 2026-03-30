/**
 * ECS Terrain Risk Prediction Engine — Types
 *
 * Defines the complete type system for terrain risk prediction:
 *   - Vehicle Capability Profile (from build config, loadout, accessories)
 *   - Terrain Risk Assessment (live + route-ahead)
 *   - Risk Categories (Stable / Caution / Elevated / High)
 *   - Sub-risk factors (Side Slope, Steep Grade, Clearance, Load Bias, Traction)
 *   - Expedition Intelligence Advisories
 *   - Smoothing/hysteresis configuration
 *
 * RULES:
 *   - No imports from other app modules (leaf node)
 *   - Pure type definitions only
 *   - No runtime code
 */

// ═══════════════════════════════════════════════════════════
// RISK LEVEL CLASSIFICATION
// ═══════════════════════════════════════════════════════════

/** Primary terrain risk level — user-facing */
export type TerrainRiskLevel = 'stable' | 'caution' | 'elevated' | 'high';

/** Internal sub-risk categories */
export type SubRiskCategory =
  | 'side_slope'
  | 'steep_grade'
  | 'clearance'
  | 'load_bias'
  | 'traction'
  | 'articulation';

/** Sub-risk factor assessment */
export interface SubRiskFactor {
  category: SubRiskCategory;
  /** Score 0–100 */
  score: number;
  /** Classified level */
  level: TerrainRiskLevel;
  /** Short human-readable reason */
  reason: string;
}

// ═══════════════════════════════════════════════════════════
// VEHICLE CAPABILITY PROFILE
// ═══════════════════════════════════════════════════════════

/** Vehicle class for terrain capability baseline */
export type VehicleClass =
  | 'stock_suv'
  | 'stock_truck'
  | 'modified_4x4'
  | 'built_overland'
  | 'heavy_overland'
  | 'unknown';

/** Tire size category */
export type TireSizeCategory = 'stock' | 'plus_one' | 'plus_two' | 'oversize' | 'unknown';

/** Suspension modification level */
export type SuspensionLevel = 'stock' | 'leveled' | 'mild_lift' | 'moderate_lift' | 'heavy_lift' | 'unknown';

/**
 * Vehicle Capability Profile — derived from user's configured build.
 *
 * Represents how well the vehicle can handle terrain challenges.
 * Higher capability scores = better terrain handling.
 */
export interface VehicleCapabilityProfile {
  /** Vehicle class classification */
  vehicleClass: VehicleClass;
  /** Tire size category */
  tireCategory: TireSizeCategory;
  /** Suspension modification level */
  suspensionLevel: SuspensionLevel;

  /** Wheelbase in inches (longer = more stable on grades, less agile) */
  wheelbaseIn: number;
  /** Track width in inches (wider = more side-slope stability) */
  trackWidthIn: number;
  /** Estimated CG height in inches (lower = more stable) */
  cgHeightIn: number;

  /** Whether vehicle has roof load (RTT, rack cargo, etc.) */
  hasRoofLoad: boolean;
  /** Roof load percentage of total loadout (0–100) */
  roofLoadPercent: number;
  /** Whether vehicle has a trailer configured */
  hasTrailer: boolean;

  /** GVWR utilization percentage (0–100+) */
  gvwrPercent: number;
  /** Rear bias percentage (0–100) */
  rearBiasPercent: number;
  /** Left/right imbalance (0 = balanced, higher = worse) */
  lateralImbalance: number;

  /** Overall terrain capability score (0–100, higher = more capable) */
  capabilityScore: number;
  /** Stability margin score (0–100, higher = more stable) */
  stabilityScore: number;
  /** Traction readiness score (0–100, higher = better traction) */
  tractionScore: number;
}

// ═══════════════════════════════════════════════════════════
// TERRAIN RISK ASSESSMENT (Live)
// ═══════════════════════════════════════════════════════════

/**
 * Live terrain risk assessment — the primary output.
 *
 * Combines vehicle capability, current terrain, attitude,
 * and route context into a single risk evaluation.
 */
export interface TerrainRiskAssessment {
  /** Composite risk score 0–100 */
  riskScore: number;
  /** Primary risk level (user-facing) */
  riskLevel: TerrainRiskLevel;
  /** Short descriptor for the current risk */
  descriptor: string;
  /** Dominant risk factor driving the assessment */
  dominantFactor: SubRiskCategory | 'none';

  /** Individual sub-risk factor scores */
  subRisks: SubRiskFactor[];

  /** Vehicle capability profile used */
  vehicleProfile: VehicleCapabilityProfile;

  /** Current attitude contribution */
  attitudeContribution: {
    rollDeg: number;
    pitchDeg: number;
    tiltDeg: number;
    /** Whether attitude is actively influencing risk */
    isActive: boolean;
  };

  /** Route-ahead forecast (if available) */
  forecast: RouteAheadRiskForecast | null;

  /** Expedition intelligence advisories */
  advisories: TerrainRiskAdvisory[];

  /** Timestamp of this assessment */
  timestamp: number;
  /** Whether this assessment has sufficient data */
  hasSufficientData: boolean;
}

// ═══════════════════════════════════════════════════════════
// ROUTE-AHEAD RISK FORECAST
// ═══════════════════════════════════════════════════════════

/** A single forecast segment */
export interface ForecastSegment {
  /** Distance ahead in miles */
  distanceMi: number;
  /** Time ahead in minutes (estimated) */
  timeMin: number;
  /** Predicted risk level for this segment */
  riskLevel: TerrainRiskLevel;
  /** Predicted risk score 0–100 */
  riskScore: number;
  /** Primary concern for this segment */
  primaryConcern: string;
  /** Predicted grade degrees (if available) */
  gradeDeg: number | null;
  /** Predicted side slope degrees (if available) */
  sideSlopeDeg: number | null;
}

/**
 * Route-ahead risk forecast — predicts terrain risk
 * for the next 5–20 miles of the active route.
 */
export interface RouteAheadRiskForecast {
  /** Whether forecast data is available */
  available: boolean;
  /** Forecast segments (typically 4: 5mi, 10mi, 15mi, 20mi) */
  segments: ForecastSegment[];
  /** Peak risk level across all segments */
  peakRiskLevel: TerrainRiskLevel;
  /** Peak risk score across all segments */
  peakRiskScore: number;
  /** Distance to peak risk in miles */
  distanceToPeakMi: number;
  /** Summary message for the forecast */
  summary: string;
  /** Whether risk is increasing ahead */
  riskIncreasing: boolean;
}

// ═══════════════════════════════════════════════════════════
// EXPEDITION INTELLIGENCE ADVISORIES
// ═══════════════════════════════════════════════════════════

/** Advisory severity */
export type AdvisorySeverity = 'info' | 'caution' | 'warning' | 'critical';

/**
 * A terrain risk advisory for Expedition Intelligence.
 *
 * Uses calm, tactical wording — never alarmist.
 */
export interface TerrainRiskAdvisory {
  /** Unique advisory ID */
  id: string;
  /** Severity level */
  severity: AdvisorySeverity;
  /** Short advisory message (1 line) */
  message: string;
  /** Which sub-risk triggered this */
  source: SubRiskCategory | 'forecast' | 'composite';
  /** Timestamp when advisory was generated */
  timestamp: number;
  /** Cooldown key (prevents duplicate advisories) */
  cooldownKey: string;
}

// ═══════════════════════════════════════════════════════════
// ENGINE CONFIGURATION
// ═══════════════════════════════════════════════════════════

/** Scoring weights for the composite risk calculation */
export interface TerrainRiskWeights {
  /** Weight for terrain steepness/grade (0–1) */
  terrainSteepness: number;
  /** Weight for side slope exposure (0–1) */
  sideSlope: number;
  /** Weight for vehicle stability profile (0–1) */
  vehicleStability: number;
  /** Weight for load placement / roof load (0–1) */
  loadPlacement: number;
  /** Weight for tire/suspension suitability (0–1) */
  tireSuspension: number;
  /** Weight for current attitude values (0–1) */
  currentAttitude: number;
  /** Weight for traction conditions (0–1) */
  traction: number;
}

/** Default scoring weights */
export const DEFAULT_TERRAIN_RISK_WEIGHTS: TerrainRiskWeights = {
  terrainSteepness: 0.20,
  sideSlope: 0.20,
  vehicleStability: 0.15,
  loadPlacement: 0.15,
  tireSuspension: 0.10,
  currentAttitude: 0.10,
  traction: 0.10,
};

/** Smoothing/hysteresis configuration */
export interface TerrainRiskSmoothing {
  /** EMA alpha for score smoothing (0–1, lower = smoother) */
  scoreAlpha: number;
  /** Minimum score change to update level (prevents flicker) */
  levelChangeThreshold: number;
  /** Hold time in ms before downgrading risk level */
  levelDowngradeHoldMs: number;
  /** Minimum interval between advisory emissions (ms) */
  advisoryCooldownMs: number;
}

/** Default smoothing configuration */
export const DEFAULT_TERRAIN_RISK_SMOOTHING: TerrainRiskSmoothing = {
  scoreAlpha: 0.25,
  levelChangeThreshold: 8,
  levelDowngradeHoldMs: 30000,
  advisoryCooldownMs: 300000,
};


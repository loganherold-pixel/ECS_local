/**
 * ECS Terrain Risk Prediction Engine
 *
 * Combines vehicle configuration, loadout, attitude inputs, terrain context,
 * and route conditions to estimate terrain-related risk during expeditions.
 *
 * ARCHITECTURE:
 *   - Pure functions (no hooks, no side effects, no storage)
 *   - Deterministic: identical inputs → identical outputs
 *   - Designed for memoized selectors and reactive stores
 *   - Smoothing/hysteresis handled by the store layer
 *
 * SCORING MODEL (7 weighted factors):
 *   1. Terrain Steepness (20%) — grade severity
 *   2. Side Slope Exposure (20%) — rollover risk from terrain
 *   3. Vehicle Stability (15%) — CG height, track width, wheelbase
 *   4. Load Placement (15%) — roof load, rear bias, lateral imbalance
 *   5. Tire/Suspension (10%) — traction readiness from build
 *   6. Current Attitude (10%) — live roll/pitch from accelerometer
 *   7. Traction Conditions (10%) — surface type and conditions
 *
 * EXPORTS:
 *   buildVehicleCapabilityProfile(...)
 *   computeTerrainRiskAssessment(...)
 *   computeRouteAheadForecast(...)
 *   generateTerrainAdvisories(...)
 *   classifyTerrainRiskLevel(score)
 *   getTerrainRiskColor(level)
 *   getTerrainRiskLabel(level)
 *   getTerrainRiskIcon(level)
 */

import type { TerrainProfile } from './terrainProfile';
import { levelToNumeric, tractionToNumeric, waterCrossingToNumeric } from './terrainProfile';
import type {
  TerrainRiskLevel,
  SubRiskCategory,
  SubRiskFactor,
  VehicleCapabilityProfile,
  VehicleClass,
  TireSizeCategory,
  SuspensionLevel,
  TerrainRiskAssessment,
  RouteAheadRiskForecast,
  ForecastSegment,
  TerrainRiskAdvisory,
  AdvisorySeverity,
  TerrainRiskWeights,
} from './terrainRiskTypes';
import { DEFAULT_TERRAIN_RISK_WEIGHTS } from './terrainRiskTypes';

// ═══════════════════════════════════════════════════════════
// VEHICLE CAPABILITY PROFILE
// ═══════════════════════════════════════════════════════════

/**
 * Input data for building a vehicle capability profile.
 * All fields optional — engine handles missing data gracefully.
 */
export interface VehicleCapabilityInput {
  /** Vehicle curb weight in lbs */
  curbWeightLbs?: number;
  /** GVWR in lbs */
  gvwrLbs?: number;
  /** Current total weight in lbs */
  totalWeightLbs?: number;
  /** Wheelbase in inches */
  wheelbaseIn?: number;
  /** Track width in inches */
  trackWidthIn?: number;
  /** CG height in inches (from stability engine) */
  cgHeightIn?: number;
  /** Tire diameter in inches */
  tireDiameterIn?: number;
  /** Suspension lift in inches */
  liftIn?: number;
  /** Whether vehicle has 4WD/AWD */
  has4wd?: boolean;
  /** Whether vehicle has locking differentials */
  hasLockers?: boolean;
  /** Roof load weight in lbs */
  roofLoadLbs?: number;
  /** Total loadout weight in lbs */
  totalLoadoutLbs?: number;
  /** Rear bias percentage (0–100) */
  rearBiasPercent?: number;
  /** Left/right weight difference in lbs */
  lateralDiffLbs?: number;
  /** Whether a trailer is attached */
  hasTrailer?: boolean;
  /** GVWR utilization percentage */
  gvwrPercent?: number;
}

/**
 * Build a Vehicle Capability Profile from available vehicle data.
 *
 * Gracefully handles missing fields with conservative defaults.
 * More data = more accurate terrain risk predictions.
 */
export function buildVehicleCapabilityProfile(
  input: VehicleCapabilityInput,
): VehicleCapabilityProfile {
  const {
    curbWeightLbs = 4500,
    wheelbaseIn = 110,
    trackWidthIn = 62,
    cgHeightIn = 28,
    tireDiameterIn = 0,
    liftIn = 0,
    has4wd = false,
    hasLockers = false,
    roofLoadLbs = 0,
    totalLoadoutLbs = 0,
    rearBiasPercent = 50,
    lateralDiffLbs = 0,
    hasTrailer = false,
    gvwrPercent = 0,
  } = input;

  // ── Classify vehicle ──
  const vehicleClass = classifyVehicle(curbWeightLbs, liftIn, tireDiameterIn, has4wd, hasLockers);
  const tireCategory = classifyTireSize(tireDiameterIn);
  const suspensionLevel = classifySuspension(liftIn);

  // ── Roof load percentage ──
  const hasRoofLoad = roofLoadLbs > 0;
  const roofLoadPercent = totalLoadoutLbs > 0
    ? Math.min(100, Math.round((roofLoadLbs / totalLoadoutLbs) * 100))
    : 0;

  // ── Lateral imbalance (normalized 0–100) ──
  const lateralImbalance = totalLoadoutLbs > 0
    ? Math.min(100, Math.round((Math.abs(lateralDiffLbs) / totalLoadoutLbs) * 100))
    : 0;

  // ── Capability Score (0–100) ──
  let capabilityScore = 30; // baseline for unknown vehicle
  if (has4wd) capabilityScore += 15;
  if (hasLockers) capabilityScore += 10;
  capabilityScore += tireBonus(tireCategory);
  capabilityScore += suspensionBonus(suspensionLevel);
  if (wheelbaseIn > 120) capabilityScore += 5; // longer wheelbase = grade stability
  capabilityScore = clamp(capabilityScore, 0, 100);

  // ── Stability Score (0–100) ──
  // Lower CG + wider track + no roof load = more stable
  let stabilityScore = 60;
  const cgPenalty = Math.max(0, (cgHeightIn - 28) * 2); // penalty for high CG
  stabilityScore -= cgPenalty;
  if (trackWidthIn > 65) stabilityScore += 8;
  if (trackWidthIn < 58) stabilityScore -= 8;
  if (hasRoofLoad) stabilityScore -= Math.min(20, roofLoadPercent * 0.4);
  if (rearBiasPercent > 65) stabilityScore -= (rearBiasPercent - 65) * 0.5;
  if (hasTrailer) stabilityScore -= 12;
  if (gvwrPercent > 90) stabilityScore -= (gvwrPercent - 90) * 1.5;
  stabilityScore = clamp(Math.round(stabilityScore), 0, 100);

  // ── Traction Score (0–100) ──
  let tractionScore = 40;
  if (has4wd) tractionScore += 20;
  if (hasLockers) tractionScore += 15;
  tractionScore += tireBonus(tireCategory);
  tractionScore = clamp(tractionScore, 0, 100);

  return {
    vehicleClass,
    tireCategory,
    suspensionLevel,
    wheelbaseIn,
    trackWidthIn,
    cgHeightIn,
    hasRoofLoad,
    roofLoadPercent,
    hasTrailer,
    gvwrPercent,
    rearBiasPercent,
    lateralImbalance,
    capabilityScore,
    stabilityScore,
    tractionScore,
  };
}

function classifyVehicle(
  weight: number, lift: number, tireIn: number, has4wd: boolean, hasLockers: boolean,
): VehicleClass {
  if (lift > 4 && tireIn > 35 && hasLockers) return 'heavy_overland';
  if (lift > 2 && tireIn > 33 && has4wd) return 'built_overland';
  if ((lift > 0 || tireIn > 31) && has4wd) return 'modified_4x4';
  if (has4wd && weight > 4000) return 'stock_truck';
  if (has4wd) return 'stock_suv';
  return 'unknown';
}

function classifyTireSize(diameterIn: number): TireSizeCategory {
  if (diameterIn <= 0) return 'unknown';
  if (diameterIn >= 37) return 'oversize';
  if (diameterIn >= 35) return 'plus_two';
  if (diameterIn >= 33) return 'plus_one';
  return 'stock';
}

function classifySuspension(liftIn: number): SuspensionLevel {
  if (liftIn <= 0) return 'stock';
  if (liftIn <= 1) return 'leveled';
  if (liftIn <= 2.5) return 'mild_lift';
  if (liftIn <= 4) return 'moderate_lift';
  return 'heavy_lift';
}

function tireBonus(cat: TireSizeCategory): number {
  switch (cat) {
    case 'oversize': return 15;
    case 'plus_two': return 12;
    case 'plus_one': return 8;
    case 'stock': return 3;
    default: return 0;
  }
}

function suspensionBonus(level: SuspensionLevel): number {
  switch (level) {
    case 'heavy_lift': return 12;
    case 'moderate_lift': return 10;
    case 'mild_lift': return 7;
    case 'leveled': return 4;
    case 'stock': return 2;
    default: return 0;
  }
}

// ═══════════════════════════════════════════════════════════
// TERRAIN RISK ASSESSMENT
// ═══════════════════════════════════════════════════════════

/**
 * Input for computing a terrain risk assessment.
 */
export interface TerrainRiskInput {
  /** Vehicle capability profile */
  vehicleProfile: VehicleCapabilityProfile;
  /** Current terrain profile */
  terrainProfile: TerrainProfile;
  /** Current roll angle in degrees (from accelerometer) */
  rollDeg: number;
  /** Current pitch angle in degrees (from accelerometer) */
  pitchDeg: number;
  /** Whether accelerometer data is available */
  hasSensorData: boolean;
  /** Route-ahead forecast (optional) */
  forecast?: RouteAheadRiskForecast | null;
  /** Scoring weights (optional, uses defaults) */
  weights?: TerrainRiskWeights;
}

/**
 * Compute a live terrain risk assessment.
 *
 * This is the primary entry point for the terrain risk engine.
 * Combines all available data into a single risk evaluation.
 *
 * Pure function — no side effects, no hooks.
 */
export function computeTerrainRiskAssessment(
  input: TerrainRiskInput,
): TerrainRiskAssessment {
  const {
    vehicleProfile,
    terrainProfile,
    rollDeg,
    pitchDeg,
    hasSensorData,
    forecast = null,
    weights = DEFAULT_TERRAIN_RISK_WEIGHTS,
  } = input;

  const now = Date.now();
  const subRisks: SubRiskFactor[] = [];

  // ── 1. Terrain Steepness (grade) ──
  const gradeNumeric = levelToNumeric(terrainProfile.steepGrade); // 1–3
  const gradeScore = mapToScore(gradeNumeric, 1, 3, 0, 85);
  // Amplify if vehicle is heavy or has poor braking
  const gradeAmplified = gradeScore * (1 + (vehicleProfile.gvwrPercent > 90 ? 0.2 : 0));
  const steepGradeRisk = clamp(Math.round(gradeAmplified), 0, 100);
  subRisks.push({
    category: 'steep_grade',
    score: steepGradeRisk,
    level: classifyTerrainRiskLevel(steepGradeRisk),
    reason: steepGradeRisk > 60 ? 'Steep grade with heavy load'
      : steepGradeRisk > 30 ? 'Moderate grade'
      : 'Low grade risk',
  });

  // ── 2. Side Slope Exposure ──
  const slopeNumeric = levelToNumeric(terrainProfile.sideSlopeRisk); // 1–3
  let slopeScore = mapToScore(slopeNumeric, 1, 3, 0, 80);
  // Amplify by CG height and roof load
  if (vehicleProfile.hasRoofLoad) {
    slopeScore *= (1 + vehicleProfile.roofLoadPercent * 0.005);
  }
  if (vehicleProfile.cgHeightIn > 32) {
    slopeScore *= 1.15;
  }
  const sideSlopeRisk = clamp(Math.round(slopeScore), 0, 100);
  subRisks.push({
    category: 'side_slope',
    score: sideSlopeRisk,
    level: classifyTerrainRiskLevel(sideSlopeRisk),
    reason: sideSlopeRisk > 60 ? 'High side slope with elevated CG'
      : sideSlopeRisk > 30 ? 'Moderate side slope exposure'
      : 'Low side slope risk',
  });

  // ── 3. Vehicle Stability ──
  // Inverse of stability score — lower stability = higher risk
  const stabilityRisk = clamp(100 - vehicleProfile.stabilityScore, 0, 100);
  subRisks.push({
    category: 'articulation',
    score: stabilityRisk,
    level: classifyTerrainRiskLevel(stabilityRisk),
    reason: stabilityRisk > 60 ? 'Vehicle stability compromised'
      : stabilityRisk > 30 ? 'Moderate stability concern'
      : 'Good vehicle stability',
  });

  // ── 4. Load Placement ──
  let loadScore = 0;
  if (vehicleProfile.roofLoadPercent > 40) {
    loadScore += (vehicleProfile.roofLoadPercent - 40) * 1.2;
  }
  if (vehicleProfile.rearBiasPercent > 60) {
    loadScore += (vehicleProfile.rearBiasPercent - 60) * 0.8;
  }
  if (vehicleProfile.lateralImbalance > 15) {
    loadScore += vehicleProfile.lateralImbalance * 0.5;
  }
  if (vehicleProfile.hasTrailer) {
    loadScore += 15;
  }
  const loadRisk = clamp(Math.round(loadScore), 0, 100);
  subRisks.push({
    category: 'load_bias',
    score: loadRisk,
    level: classifyTerrainRiskLevel(loadRisk),
    reason: loadRisk > 60 ? 'Load placement increases rollover risk'
      : loadRisk > 30 ? 'Load distribution could be improved'
      : 'Load placement acceptable',
  });

  // ── 5. Traction Conditions ──
  const tractionNumeric = tractionToNumeric(terrainProfile.traction); // 1–3
  let tractionScore = mapToScore(tractionNumeric, 1, 3, 0, 75);
  // Reduce risk if vehicle has good traction capability
  const tractionReduction = vehicleProfile.tractionScore * 0.3;
  tractionScore = Math.max(0, tractionScore - tractionReduction);
  // Water crossing amplification
  const waterNumeric = waterCrossingToNumeric(terrainProfile.waterCrossings);
  if (waterNumeric > 0) {
    tractionScore += waterNumeric * 10;
  }
  const tractionRisk = clamp(Math.round(tractionScore), 0, 100);
  subRisks.push({
    category: 'traction',
    score: tractionRisk,
    level: classifyTerrainRiskLevel(tractionRisk),
    reason: tractionRisk > 60 ? 'Poor traction conditions'
      : tractionRisk > 30 ? 'Variable traction'
      : 'Good traction expected',
  });

  // ── 6. Current Attitude (live sensor) ──
  const absRoll = Math.abs(rollDeg);
  const absPitch = Math.abs(pitchDeg);
  const tilt = Math.sqrt(rollDeg * rollDeg + pitchDeg * pitchDeg);
  let attitudeScore = 0;
  if (hasSensorData) {
    // Roll is more dangerous than pitch for rollover
    attitudeScore += Math.min(50, absRoll * 2.5);
    attitudeScore += Math.min(30, absPitch * 1.5);
    // Amplify if vehicle has high CG
    if (vehicleProfile.cgHeightIn > 30 && absRoll > 10) {
      attitudeScore *= 1.2;
    }
  }
  const attitudeRisk = clamp(Math.round(attitudeScore), 0, 100);

  // ── 7. Clearance (estimated from tire/suspension) ──
  let clearanceScore = 0;
  if (terrainProfile.terrainType === 'rocky') {
    clearanceScore = 40;
    if (vehicleProfile.suspensionLevel === 'stock') clearanceScore += 20;
    if (vehicleProfile.tireCategory === 'stock') clearanceScore += 15;
  } else if (terrainProfile.terrainType === 'forest_road') {
    clearanceScore = 15;
    if (vehicleProfile.suspensionLevel === 'stock') clearanceScore += 10;
  }
  const clearanceRisk = clamp(Math.round(clearanceScore), 0, 100);
  subRisks.push({
    category: 'clearance',
    score: clearanceRisk,
    level: classifyTerrainRiskLevel(clearanceRisk),
    reason: clearanceRisk > 60 ? 'Clearance may be insufficient'
      : clearanceRisk > 30 ? 'Clearance adequate with caution'
      : 'Clearance sufficient',
  });

  // ═══ COMPOSITE SCORE ═══
  const compositeScore =
    steepGradeRisk * weights.terrainSteepness +
    sideSlopeRisk * weights.sideSlope +
    stabilityRisk * weights.vehicleStability +
    loadRisk * weights.loadPlacement +
    tractionRisk * weights.traction +
    attitudeRisk * weights.currentAttitude +
    (clearanceRisk * 0.5 + tractionRisk * 0.5) * weights.tireSuspension;

  const riskScore = clamp(Math.round(compositeScore), 0, 100);
  const riskLevel = classifyTerrainRiskLevel(riskScore);

  // ── Dominant factor ──
  const sortedSub = [...subRisks].sort((a, b) => b.score - a.score);
  const dominantFactor: SubRiskCategory | 'none' =
    sortedSub.length > 0 && sortedSub[0].score > 15
      ? sortedSub[0].category
      : 'none';

  // ── Descriptor ──
  const descriptor = buildDescriptor(riskLevel, dominantFactor, vehicleProfile);

  // ── Advisories ──
  const advisories = generateTerrainAdvisories(
    riskLevel, riskScore, subRisks, vehicleProfile, forecast, now,
  );

  return {
    riskScore,
    riskLevel,
    descriptor,
    dominantFactor,
    subRisks,
    vehicleProfile,
    attitudeContribution: {
      rollDeg,
      pitchDeg,
      tiltDeg: Math.round(tilt * 10) / 10,
      isActive: hasSensorData && tilt > 2,
    },
    forecast,
    advisories,
    timestamp: now,
    hasSufficientData: true,
  };
}

// ═══════════════════════════════════════════════════════════
// ROUTE-AHEAD FORECAST
// ═══════════════════════════════════════════════════════════

/**
 * Input for route-ahead forecast computation.
 */
export interface RouteAheadInput {
  /** Vehicle capability profile */
  vehicleProfile: VehicleCapabilityProfile;
  /** Current terrain profile */
  terrainProfile: TerrainProfile;
  /** Predicted grades at forecast distances (degrees) */
  predictedGrades: { distanceMi: number; gradeDeg: number | null }[];
  /** Predicted side slopes at forecast distances (degrees) */
  predictedSideSlopes: { distanceMi: number; slopeDeg: number | null }[];
  /** Average speed in mph (for time estimates) */
  avgSpeedMph?: number;
}

/**
 * Compute a route-ahead risk forecast.
 *
 * Analyzes the next 5–20 miles of route to predict terrain risk.
 * Returns forecast segments at standard intervals.
 */
export function computeRouteAheadForecast(
  input: RouteAheadInput,
): RouteAheadRiskForecast {
  const {
    vehicleProfile,
    terrainProfile,
    predictedGrades,
    predictedSideSlopes,
    avgSpeedMph = 20,
  } = input;

  if (predictedGrades.length === 0) {
    return {
      available: false,
      segments: [],
      peakRiskLevel: 'stable',
      peakRiskScore: 0,
      distanceToPeakMi: 0,
      summary: 'No route data available',
      riskIncreasing: false,
    };
  }

  const segments: ForecastSegment[] = [];
  let peakScore = 0;
  let peakDistance = 0;

  const distances = [5, 10, 15, 20];

  for (const dist of distances) {
    const gradeEntry = predictedGrades.find(g => Math.abs(g.distanceMi - dist) < 3);
    const slopeEntry = predictedSideSlopes.find(s => Math.abs(s.distanceMi - dist) < 3);

    const gradeDeg = gradeEntry?.gradeDeg ?? null;
    const slopeDeg = slopeEntry?.slopeDeg ?? null;

    // Estimate risk for this segment
    let segScore = 0;
    if (gradeDeg != null) {
      segScore += Math.min(40, gradeDeg * 3);
    }
    if (slopeDeg != null) {
      segScore += Math.min(40, slopeDeg * 3.5);
      if (vehicleProfile.hasRoofLoad) segScore += slopeDeg * 0.5;
    }
    // Terrain type base risk
    const terrainBase = getTerrainTypeBaseRisk(terrainProfile.terrainType);
    segScore += terrainBase * 0.3;

    // Vehicle capability reduction
    segScore -= vehicleProfile.capabilityScore * 0.15;

    segScore = clamp(Math.round(segScore), 0, 100);

    if (segScore > peakScore) {
      peakScore = segScore;
      peakDistance = dist;
    }

    const timeMin = avgSpeedMph > 0 ? Math.round((dist / avgSpeedMph) * 60) : 0;
    const riskLevel = classifyTerrainRiskLevel(segScore);

    let primaryConcern = 'Conditions stable';
    if (gradeDeg != null && gradeDeg > 8) primaryConcern = 'Steep grade approaching';
    else if (slopeDeg != null && slopeDeg > 6) primaryConcern = 'Side slope exposure ahead';
    else if (segScore > 50) primaryConcern = 'Challenging terrain ahead';
    else if (segScore > 25) primaryConcern = 'Moderate terrain ahead';

    segments.push({
      distanceMi: dist,
      timeMin,
      riskLevel,
      riskScore: segScore,
      primaryConcern,
      gradeDeg,
      sideSlopeDeg: slopeDeg,
    });
  }

  const peakRiskLevel = classifyTerrainRiskLevel(peakScore);
  const firstScore = segments.length > 0 ? segments[0].riskScore : 0;
  const lastScore = segments.length > 0 ? segments[segments.length - 1].riskScore : 0;
  const riskIncreasing = lastScore > firstScore + 5;

  let summary = 'Terrain conditions stable ahead';
  if (peakScore > 60) {
    summary = `Challenging terrain in ${peakDistance} miles`;
  } else if (peakScore > 35) {
    summary = `Moderate terrain ahead — ${peakDistance} mi`;
  } else if (riskIncreasing) {
    summary = 'Terrain difficulty gradually increasing';
  }

  return {
    available: true,
    segments,
    peakRiskLevel,
    peakRiskScore: peakScore,
    distanceToPeakMi: peakDistance,
    summary,
    riskIncreasing,
  };
}

function getTerrainTypeBaseRisk(type: string): number {
  const map: Record<string, number> = {
    highway: 5, graded_dirt: 15, forest_road: 25,
    rocky: 50, sand: 40, snow_ice: 55, mud: 55, mixed: 30,
  };
  return map[type] ?? 25;
}

// ═══════════════════════════════════════════════════════════
// ADVISORY GENERATION
// ═══════════════════════════════════════════════════════════

function generateTerrainAdvisories(
  riskLevel: TerrainRiskLevel,
  riskScore: number,
  subRisks: SubRiskFactor[],
  vehicleProfile: VehicleCapabilityProfile,
  forecast: RouteAheadRiskForecast | null,
  now: number,
): TerrainRiskAdvisory[] {
  const advisories: TerrainRiskAdvisory[] = [];
  let idCounter = 0;
  const mkId = () => `tra-${now}-${idCounter++}`;

  // ── Sub-risk advisories ──
  for (const sub of subRisks) {
    if (sub.score < 45) continue;

    const severity: AdvisorySeverity = sub.score >= 75 ? 'warning'
      : sub.score >= 60 ? 'caution' : 'info';

    const messages: Record<SubRiskCategory, string> = {
      side_slope: 'Side slope risk increasing',
      steep_grade: 'Steep grade conditions present',
      clearance: 'Clearance concern for current terrain',
      load_bias: 'Current load profile raises rollover concern',
      traction: 'Traction conditions reduced',
      articulation: 'Vehicle stability margin reduced',
    };

    advisories.push({
      id: mkId(),
      severity,
      message: messages[sub.category] || sub.reason,
      source: sub.category,
      timestamp: now,
      cooldownKey: `terrain-${sub.category}`,
    });
  }

  // ── Forecast advisories ──
  if (forecast?.available && forecast.peakRiskScore > 40) {
    const fSeverity: AdvisorySeverity = forecast.peakRiskScore >= 70 ? 'warning'
      : forecast.peakRiskScore >= 50 ? 'caution' : 'info';

    advisories.push({
      id: mkId(),
      severity: fSeverity,
      message: forecast.summary,
      source: 'forecast',
      timestamp: now,
      cooldownKey: 'terrain-forecast',
    });
  }

  // ── Vehicle-specific advisories ──
  if (vehicleProfile.hasRoofLoad && riskScore > 40) {
    advisories.push({
      id: mkId(),
      severity: 'caution',
      message: 'Top-heavy load increases rollover concern on current terrain',
      source: 'composite',
      timestamp: now,
      cooldownKey: 'terrain-roof-load',
    });
  }

  if (vehicleProfile.gvwrPercent > 95 && riskScore > 30) {
    advisories.push({
      id: mkId(),
      severity: 'caution',
      message: 'Near GVWR — reduced terrain margin',
      source: 'composite',
      timestamp: now,
      cooldownKey: 'terrain-gvwr',
    });
  }

  return advisories;
}

// ═══════════════════════════════════════════════════════════
// CLASSIFICATION & DISPLAY HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Classify a risk score (0–100) into a terrain risk level.
 *
 *   0–20  = stable
 *   21–45 = caution
 *   46–70 = elevated
 *   71–100 = high
 */
export function classifyTerrainRiskLevel(score: number): TerrainRiskLevel {
  if (score >= 71) return 'high';
  if (score >= 46) return 'elevated';
  if (score >= 21) return 'caution';
  return 'stable';
}

/** Get display color for a terrain risk level */
export function getTerrainRiskColor(level: TerrainRiskLevel): string {
  switch (level) {
    case 'high': return '#C0392B';
    case 'elevated': return '#E67E22';
    case 'caution': return '#FFB74D';
    case 'stable': return '#4CAF50';
  }
}

/** Get display label for a terrain risk level */
export function getTerrainRiskLabel(level: TerrainRiskLevel): string {
  switch (level) {
    case 'high': return 'HIGH';
    case 'elevated': return 'ELEVATED';
    case 'caution': return 'CAUTION';
    case 'stable': return 'STABLE';
  }
}

/** Get Ionicons icon name for a terrain risk level */
export function getTerrainRiskIcon(level: TerrainRiskLevel): string {
  switch (level) {
    case 'high': return 'warning-outline';
    case 'elevated': return 'alert-circle-outline';
    case 'caution': return 'alert-outline';
    case 'stable': return 'shield-checkmark-outline';
  }
}

function buildDescriptor(
  level: TerrainRiskLevel,
  dominant: SubRiskCategory | 'none',
  profile: VehicleCapabilityProfile,
): string {
  if (level === 'stable') return 'Terrain conditions nominal';
  if (level === 'high') {
    if (dominant === 'side_slope') return 'High side slope risk';
    if (dominant === 'steep_grade') return 'Steep grade risk';
    return 'Route difficulty may exceed setup';
  }
  if (level === 'elevated') {
    if (dominant === 'side_slope') return 'Side slope exposure increasing';
    if (dominant === 'steep_grade') return 'Steep grade approaching';
    if (dominant === 'load_bias') return 'Load profile raises concern';
    return 'Elevated terrain risk';
  }
  // caution
  if (dominant === 'traction') return 'Variable traction conditions';
  if (dominant === 'clearance') return 'Clearance awareness needed';
  return 'Moderate terrain conditions';
}

// ═══════════════════════════════════════════════════════════
// SMOOTHING HELPERS (for store layer)
// ═══════════════════════════════════════════════════════════

/**
 * Apply EMA smoothing to a risk score.
 */
export function smoothScore(
  currentSmoothed: number,
  newRaw: number,
  alpha: number,
): number {
  return Math.round((alpha * newRaw + (1 - alpha) * currentSmoothed) * 10) / 10;
}

/**
 * Determine if a level change should be applied (hysteresis).
 *
 * Upgrades (more risk) happen immediately.
 * Downgrades (less risk) require the hold period to elapse.
 */
export function shouldChangeLevel(
  currentLevel: TerrainRiskLevel,
  newLevel: TerrainRiskLevel,
  lastUpgradeTime: number,
  holdMs: number,
  now: number,
): boolean {
  const order: TerrainRiskLevel[] = ['stable', 'caution', 'elevated', 'high'];
  const currentIdx = order.indexOf(currentLevel);
  const newIdx = order.indexOf(newLevel);

  if (newIdx > currentIdx) return true; // upgrade immediately
  if (newIdx < currentIdx) {
    return (now - lastUpgradeTime) >= holdMs; // downgrade after hold
  }
  return false; // same level
}

// ═══════════════════════════════════════════════════════════
// INTERNAL UTILITIES
// ═══════════════════════════════════════════════════════════

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mapToScore(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return outMin;
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}


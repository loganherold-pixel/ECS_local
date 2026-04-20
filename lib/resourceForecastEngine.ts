/**
 * ECS EXPEDITION RESOURCE FORECAST ENGINE — Full Implementation
 * ==============================================================
 *
 * Predicts whether the user has enough Fuel, Water, and Power to
 * complete the currently loaded route using routeIntelligence data.
 *
 * INPUTS:
 *   - RouteIntelligence (distance, drive time, elevation, difficulty)
 *   - Vehicle profile (fuel capacity, MPG, fuel %, weight)
 *   - Loadout totals (water, spare fuel, cargo weight, people count)
 *   - Telemetry snapshot (battery SOC, capacity, draw, solar input)
 *   - Terrain context (difficulty, off-road factor)
 *
 * OUTPUT:
 *   - ResourceForecast with fuel/water/power status + overall sufficiency
 *   - SufficiencyLevel: Stable / Watch Consumption / Resources Limited / Resources Insufficient
 *   - Expedition intelligence messages
 *   - Planning estimates (pre-departure requirements)
 *
 * ARCHITECTURE:
 *   - Pure computation (no side effects)
 *   - Subscriber pattern for UI updates
 *   - Recomputes when route, loadout, or telemetry changes
 *   - Stores result in memory + localStorage
 */

import { Platform } from 'react-native';
import type { RouteIntelligence } from './routeAnalysisEngine';

const TAG = '[RESOURCE_FORECAST]';

// ── Safe Defaults ────────────────────────────────────────────

export const FORECAST_DEFAULTS = {
  MPG: 12,
  WATER_GPD: 2.5,          // gallons per person per day
  PEOPLE: 2,
  SPEED_MPH: 35,
  POWER_HOURS: 18,          // fallback if no telemetry
  FUEL_TANK_GAL: 26,        // fallback full tank
  WATER_GAL: 10,            // fallback water carry
  DRIVE_HOURS_PER_DAY: 8,   // hours of driving per "day"
  CAMP_POWER_HOURS: 6,      // power usage per camp night
  OFF_ROAD_PENALTY: 1.25,   // 25% more fuel off-road
  WEIGHT_PENALTY_PER_500LB: 0.04, // 4% MPG reduction per 500 lb cargo
  CLIMB_PENALTY_PER_1000FT: 0.08, // 8% more fuel per 1000 ft gain
  SOLAR_EFFICIENCY: 0.75,   // 75% real-world solar efficiency
  HOT_WEATHER_WATER_MULT: 1.3, // 30% more water in hot conditions
  COLD_WEATHER_FUEL_MULT: 1.1, // 10% more fuel in cold conditions
} as const;

// ── Types ────────────────────────────────────────────────────

export type ForecastStatus = 'OK' | 'CAUTION' | 'LOW';

/**
 * Resource Sufficiency Level — human-readable overall assessment.
 */
export type SufficiencyLevel =
  | 'Stable'
  | 'Watch Consumption'
  | 'Resources Limited'
  | 'Resources Insufficient';

/**
 * Sufficiency display configuration.
 */
export interface SufficiencyConfig {
  level: SufficiencyLevel;
  color: string;
  icon: string;
  shortLabel: string;
  description: string;
}

export const SUFFICIENCY_CONFIGS: Record<SufficiencyLevel, SufficiencyConfig> = {
  'Stable': {
    level: 'Stable',
    color: '#66BB6A',
    icon: 'checkmark-circle-outline',
    shortLabel: 'STABLE',
    description: 'All resources sufficient for the planned route.',
  },
  'Watch Consumption': {
    level: 'Watch Consumption',
    color: '#FFB74D',
    icon: 'eye-outline',
    shortLabel: 'WATCH',
    description: 'Resources adequate but margins are tight. Monitor consumption.',
  },
  'Resources Limited': {
    level: 'Resources Limited',
    color: '#FF9800',
    icon: 'alert-circle-outline',
    shortLabel: 'LIMITED',
    description: 'One or more resources may not cover the full route.',
  },
  'Resources Insufficient': {
    level: 'Resources Insufficient',
    color: '#EF5350',
    icon: 'warning-outline',
    shortLabel: 'INSUFFICIENT',
    description: 'Resources projected to fall short. Plan resupply or reduce scope.',
  },
};

export interface FuelForecast {
  mpgUsed: number;
  adjustedMpg: number;
  availableGallons: number;
  requiredGallons: number;
  marginGallons: number;
  marginPercent: number;
  status: ForecastStatus;
  notes: string[];
  /** Terrain penalty applied (multiplier) */
  terrainPenalty: number;
  /** Weight penalty applied (multiplier) */
  weightPenalty: number;
  /** Off-road penalty applied (multiplier) */
  offRoadPenalty: number;
}

export interface WaterForecast {
  availableGallons: number;
  requiredGallons: number;
  marginGallons: number;
  marginPercent: number;
  estimatedDays: number;
  peopleCount: number;
  dailyUsagePerPerson: number;
  status: ForecastStatus;
  notes: string[];
}

export interface PowerForecast {
  availableHours: number;
  requiredHours: number;
  marginHours: number;
  marginPercent: number;
  solarContributionHours: number;
  status: ForecastStatus;
  notes: string[];
}

/**
 * Expedition intelligence message generated from forecast data.
 */
export interface ForecastIntelMessage {
  id: string;
  severity: 'info' | 'caution' | 'warning' | 'critical';
  resource: 'fuel' | 'water' | 'power' | 'general';
  message: string;
  icon: string;
  color: string;
}

/**
 * Pre-departure planning estimate.
 */
export interface PlanningEstimate {
  fuelRequiredGallons: number;
  waterRequiredGallons: number;
  powerRequiredHours: number;
  estimatedDays: number;
  estimatedDriveHours: number;
  routeMiles: number;
  fuelCostEstimate: number | null; // at ~$4/gal
  notes: string[];
}

export interface ResourceForecast {
  /** Route distance used for forecast */
  routeMiles: number;
  /** Estimated drive hours (from Phase 1 or computed) */
  estimatedDriveHours: number;
  /** Estimated expedition duration in days */
  estimatedDays: number;

  fuel: FuelForecast;
  water: WaterForecast;
  power: PowerForecast;

  /** Worst of the three statuses */
  overallStatus: ForecastStatus;
  /** Human-readable sufficiency level */
  sufficiencyLevel: SufficiencyLevel;
  /** Top 1–3 reasons driving the overall status */
  drivers: string[];
  /** Expedition intelligence messages */
  intelMessages: ForecastIntelMessage[];
  /** Pre-departure planning estimate */
  planningEstimate: PlanningEstimate;

  /** Timestamp of last computation */
  computedAt: string;
  /** Source route intelligence ID */
  routeIntelligenceId: string;
  /** Whether any real data was available (vs all defaults) */
  hasRealData: boolean;
  /** Route difficulty used for terrain adjustments */
  routeDifficulty: string;
}

// ── Input Snapshot Types ─────────────────────────────────────

export interface VehicleProfileSnapshot {
  fuelCapacityGallons?: number | null;
  currentFuelPercent?: number | null;
  waterCapacityGallons?: number | null;
  batteryCapacityWh?: number | null;
  avgMpg?: number | null;
  /** Total vehicle + cargo weight in lbs (for fuel economy adjustment) */
  totalWeightLbs?: number | null;
  /** Base curb weight in lbs */
  curbWeightLbs?: number | null;
}

export interface LoadoutTotalsSnapshot {
  waterGallons?: number | null;
  fuelGallons?: number | null;        // spare fuel in loadout
  totalCargoWeightLbs?: number | null;
  peopleCount?: number | null;
  /** Custom water usage per person per day (gallons) */
  waterGallonsPerPersonPerDay?: number | null;
}

export interface TelemetrySnapshot {
  /** EcoFlow or power station battery SOC (0–100) */
  batterySocPercent?: number | null;
  /** Known battery capacity in Wh */
  batteryCapacityWh?: number | null;
  /** Average power draw in watts */
  avgDrawWatts?: number | null;
  /** Estimated runtime hours (if directly available) */
  estimatedRuntimeHours?: number | null;
  /** Solar input watts (current or average) */
  solarInputWatts?: number | null;
  /** Average sun hours per day for solar calculation */
  sunHoursPerDay?: number | null;
}

/**
 * Terrain context for more accurate fuel forecasting.
 */
export interface TerrainContext {
  /** Route difficulty: easy, moderate, challenging, difficult */
  difficulty?: string | null;
  /** Whether route is primarily off-road */
  isOffRoad?: boolean;
  /** Total elevation gain in feet */
  elevationGainFeet?: number | null;
  /** Whether hot weather conditions apply */
  isHotWeather?: boolean;
  /** Whether cold weather conditions apply */
  isColdWeather?: boolean;
}

// ── Status Helpers ───────────────────────────────────────────

function maxSeverity(...statuses: ForecastStatus[]): ForecastStatus {
  if (statuses.includes('LOW')) return 'LOW';
  if (statuses.includes('CAUTION')) return 'CAUTION';
  return 'OK';
}

/**
 * Derive sufficiency level from individual resource statuses.
 */
function deriveSufficiencyLevel(
  fuel: ForecastStatus,
  water: ForecastStatus,
  power: ForecastStatus,
  fuelMarginPct: number,
  waterMarginPct: number,
  powerMarginPct: number,
): SufficiencyLevel {
  const statuses = [fuel, water, power];
  const lowCount = statuses.filter(s => s === 'LOW').length;
  const cautionCount = statuses.filter(s => s === 'CAUTION').length;

  // Any LOW → Insufficient or Limited
  if (lowCount >= 2) return 'Resources Insufficient';
  if (lowCount === 1) {
    // Check if the LOW resource is severely low
    const minMargin = Math.min(fuelMarginPct, waterMarginPct, powerMarginPct);
    if (minMargin < -20) return 'Resources Insufficient';
    return 'Resources Limited';
  }

  // Multiple cautions or tight margins
  if (cautionCount >= 2) return 'Resources Limited';
  if (cautionCount === 1) return 'Watch Consumption';

  // All OK but check margins
  const minMargin = Math.min(fuelMarginPct, waterMarginPct, powerMarginPct);
  if (minMargin < 15) return 'Watch Consumption';

  return 'Stable';
}

const STATUS_COLORS: Record<ForecastStatus, string> = {
  OK: '#66BB6A',
  CAUTION: '#FFB74D',
  LOW: '#EF5350',
};

const STATUS_ICONS: Record<ForecastStatus, string> = {
  OK: 'checkmark-circle-outline',
  CAUTION: 'alert-circle-outline',
  LOW: 'warning-outline',
};

export { STATUS_COLORS, STATUS_ICONS };

// ── Storage ──────────────────────────────────────────────────

const STORAGE_KEY = 'ecs_resource_forecast';
const mem: Record<string, string> = {};

function sGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return mem[key] || null;
  } catch { return mem[key] || null; }
}

function sSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    mem[key] = value;
  } catch { mem[key] = value; }
}

// ── Core Computation ─────────────────────────────────────────

function safeNum(value: number, fallback: number = 0): number {
  if (value == null || !isFinite(value) || isNaN(value)) return fallback;
  return value;
}

/**
 * Compute terrain penalty multiplier based on route difficulty and elevation.
 */
function computeTerrainPenalty(terrain?: TerrainContext | null, routeIntel?: RouteIntelligence | null): number {
  let penalty = 1.0;

  // Difficulty-based penalty
  const difficulty = terrain?.difficulty || routeIntel?.overallDifficulty || 'easy';
  switch (difficulty) {
    case 'moderate': penalty *= 1.10; break;
    case 'challenging': penalty *= 1.25; break;
    case 'difficult': penalty *= 1.45; break;
    default: penalty *= 1.0;
  }

  // Elevation gain penalty
  const elevGain = terrain?.elevationGainFeet ?? routeIntel?.elevationGainFeet ?? 0;
  if (elevGain > 0) {
    const climbPenalty = (elevGain / 1000) * FORECAST_DEFAULTS.CLIMB_PENALTY_PER_1000FT;
    penalty *= (1 + Math.min(climbPenalty, 0.5)); // cap at 50% additional
  }

  // Cold weather fuel penalty
  if (terrain?.isColdWeather) {
    penalty *= FORECAST_DEFAULTS.COLD_WEATHER_FUEL_MULT;
  }

  return Math.round(penalty * 100) / 100;
}

/**
 * Compute weight penalty on fuel economy.
 */
function computeWeightPenalty(cargoWeightLbs: number): number {
  if (cargoWeightLbs <= 0) return 1.0;
  const penalty = (cargoWeightLbs / 500) * FORECAST_DEFAULTS.WEIGHT_PENALTY_PER_500LB;
  return Math.round((1 + Math.min(penalty, 0.3)) * 100) / 100; // cap at 30%
}

/**
 * Compute off-road penalty.
 */
function computeOffRoadPenalty(isOffRoad: boolean): number {
  return isOffRoad ? FORECAST_DEFAULTS.OFF_ROAD_PENALTY : 1.0;
}

/**
 * Generate expedition intelligence messages from forecast results.
 */
function generateIntelMessages(
  fuel: FuelForecast,
  water: WaterForecast,
  power: PowerForecast,
  routeMiles: number,
  estimatedDays: number,
  sufficiency: SufficiencyLevel,
): ForecastIntelMessage[] {
  const messages: ForecastIntelMessage[] = [];
  let msgId = 0;

  // Fuel messages
  if (fuel.status === 'LOW') {
    messages.push({
      id: `rf-${++msgId}`,
      severity: 'critical',
      resource: 'fuel',
      message: `Fuel reserves may not cover the remaining ${routeMiles} mi route. Plan a refuel stop or add spare fuel.`,
      icon: 'flame-outline',
      color: '#EF5350',
    });
  } else if (fuel.status === 'CAUTION') {
    messages.push({
      id: `rf-${++msgId}`,
      severity: 'caution',
      resource: 'fuel',
      message: `Fuel margin tight for the full route. ${fuel.marginGallons.toFixed(1)} gal reserve at ${fuel.adjustedMpg.toFixed(1)} MPG adjusted.`,
      icon: 'flame-outline',
      color: '#FFB74D',
    });
  }

  // Terrain adjustment notice
  if (fuel.terrainPenalty > 1.1) {
    messages.push({
      id: `rf-${++msgId}`,
      severity: 'info',
      resource: 'fuel',
      message: `Terrain adjustments reduce effective MPG by ${Math.round((fuel.terrainPenalty - 1) * 100)}%. Fuel estimate accounts for elevation and difficulty.`,
      icon: 'trail-sign-outline',
      color: '#42A5F5',
    });
  }

  // Water messages
  if (water.status === 'LOW') {
    messages.push({
      id: `rf-${++msgId}`,
      severity: 'warning',
      resource: 'water',
      message: `Water reserves below expedition target for ${estimatedDays} day${estimatedDays > 1 ? 's' : ''}. Consider increasing carry capacity.`,
      icon: 'water-outline',
      color: '#EF5350',
    });
  } else if (water.status === 'CAUTION') {
    messages.push({
      id: `rf-${++msgId}`,
      severity: 'caution',
      resource: 'water',
      message: `Water margin tight — ${water.marginGallons.toFixed(1)} gal reserve for ${water.peopleCount} people over ${estimatedDays} day${estimatedDays > 1 ? 's' : ''}.`,
      icon: 'water-outline',
      color: '#FFB74D',
    });
  }

  // Power messages
  if (power.status === 'LOW') {
    messages.push({
      id: `rf-${++msgId}`,
      severity: 'warning',
      resource: 'power',
      message: `Battery runtime limited for current equipment load. Consider solar charging or reduced draw.`,
      icon: 'battery-charging-outline',
      color: '#EF5350',
    });
  } else if (power.status === 'CAUTION') {
    messages.push({
      id: `rf-${++msgId}`,
      severity: 'caution',
      resource: 'power',
      message: `Power margin tight — consider solar top-off or reducing overnight draw.`,
      icon: 'battery-charging-outline',
      color: '#FFB74D',
    });
  }

  // Solar contribution notice
  if (power.solarContributionHours > 2) {
    messages.push({
      id: `rf-${++msgId}`,
      severity: 'info',
      resource: 'power',
      message: `Solar charging adds ~${power.solarContributionHours.toFixed(1)} hrs of estimated runtime over the trip.`,
      icon: 'sunny-outline',
      color: '#FFD54F',
    });
  }

  // Overall sufficiency message
  if (sufficiency === 'Stable') {
    messages.push({
      id: `rf-${++msgId}`,
      severity: 'info',
      resource: 'general',
      message: `All resources sufficient for the planned ${routeMiles} mi route.`,
      icon: 'checkmark-circle-outline',
      color: '#66BB6A',
    });
  }

  return messages;
}

/**
 * Generate pre-departure planning estimate.
 */
function generatePlanningEstimate(
  routeMiles: number,
  estimatedDriveHours: number,
  estimatedDays: number,
  fuelRequired: number,
  waterRequired: number,
  powerRequired: number,
  adjustedMpg: number,
): PlanningEstimate {
  const notes: string[] = [];
  notes.push(`Based on ${routeMiles} mi route, ~${estimatedDays} day${estimatedDays > 1 ? 's' : ''}`);
  if (adjustedMpg < FORECAST_DEFAULTS.MPG) {
    notes.push(`Adjusted MPG: ${adjustedMpg.toFixed(1)} (terrain/weight factors applied)`);
  }
  notes.push(`Water: ${FORECAST_DEFAULTS.WATER_GPD} gal/person/day assumed`);

  return {
    fuelRequiredGallons: safeNum(Math.round(fuelRequired * 10) / 10),
    waterRequiredGallons: safeNum(Math.round(waterRequired * 10) / 10),
    powerRequiredHours: safeNum(Math.round(powerRequired * 10) / 10),
    estimatedDays,
    estimatedDriveHours: safeNum(Math.round(estimatedDriveHours * 10) / 10),
    routeMiles: safeNum(Math.round(routeMiles * 10) / 10),
    fuelCostEstimate: fuelRequired > 0 ? Math.round(fuelRequired * 4 * 100) / 100 : null,
    notes,
  };
}

function createDefaultForecast(routeIntelligenceId: string = 'unknown'): ResourceForecast {
  return {
    routeMiles: 0,
    estimatedDriveHours: 0,
    estimatedDays: 1,
    fuel: {
      mpgUsed: FORECAST_DEFAULTS.MPG,
      adjustedMpg: FORECAST_DEFAULTS.MPG,
      availableGallons: FORECAST_DEFAULTS.FUEL_TANK_GAL,
      requiredGallons: 0,
      marginGallons: FORECAST_DEFAULTS.FUEL_TANK_GAL,
      marginPercent: 100,
      status: 'OK',
      notes: ['No route loaded — using defaults'],
      terrainPenalty: 1.0,
      weightPenalty: 1.0,
      offRoadPenalty: 1.0,
    },
    water: {
      availableGallons: FORECAST_DEFAULTS.WATER_GAL,
      requiredGallons: 0,
      marginGallons: FORECAST_DEFAULTS.WATER_GAL,
      marginPercent: 100,
      estimatedDays: 1,
      peopleCount: FORECAST_DEFAULTS.PEOPLE,
      dailyUsagePerPerson: FORECAST_DEFAULTS.WATER_GPD,
      status: 'OK',
      notes: ['No route loaded — using defaults'],
    },
    power: {
      availableHours: FORECAST_DEFAULTS.POWER_HOURS,
      requiredHours: 0,
      marginHours: FORECAST_DEFAULTS.POWER_HOURS,
      marginPercent: 100,
      solarContributionHours: 0,
      status: 'OK',
      notes: ['No route loaded — using defaults'],
    },
    overallStatus: 'OK',
    sufficiencyLevel: 'Stable',
    drivers: ['No route loaded'],
    intelMessages: [],
    planningEstimate: {
      fuelRequiredGallons: 0,
      waterRequiredGallons: 0,
      powerRequiredHours: 0,
      estimatedDays: 1,
      estimatedDriveHours: 0,
      routeMiles: 0,
      fuelCostEstimate: null,
      notes: ['No route loaded'],
    },
    computedAt: new Date().toISOString(),
    routeIntelligenceId,
    hasRealData: false,
    routeDifficulty: 'easy',
  };
}

/**
 * Compute a complete resource forecast.
 *
 * All inputs are optional — safe defaults are used when data is missing.
 */
export function computeResourceForecast(
  routeIntelligence: RouteIntelligence,
  vehicleProfile?: VehicleProfileSnapshot | null,
  loadoutTotals?: LoadoutTotalsSnapshot | null,
  telemetry?: TelemetrySnapshot | null,
  terrain?: TerrainContext | null,
): ResourceForecast {
  if (!routeIntelligence) {
    console.warn(TAG, 'computeResourceForecast called with null routeIntelligence — returning defaults');
    return createDefaultForecast();
  }

  const routeMiles = safeNum(routeIntelligence.totalDistanceMiles);

  if (routeMiles <= 0) {
    console.warn(TAG, 'Route distance is zero or negative — returning default forecast');
    return createDefaultForecast(routeIntelligence.id);
  }

  let hasRealData = false;

  // ── Estimated drive hours ──────────────────────────────────
  const rawDriveHours = routeIntelligence.estimatedDriveTimeHours > 0
    ? routeIntelligence.estimatedDriveTimeHours
    : routeMiles / FORECAST_DEFAULTS.SPEED_MPH;
  const estimatedDriveHours = safeNum(rawDriveHours, routeMiles / FORECAST_DEFAULTS.SPEED_MPH);

  // ── Estimated expedition duration in days ──────────────────
  const estimatedDays = Math.max(1, Math.ceil(estimatedDriveHours / FORECAST_DEFAULTS.DRIVE_HOURS_PER_DAY));

  // ── People count ───────────────────────────────────────────
  const peopleCount = safeNum(loadoutTotals?.peopleCount ?? FORECAST_DEFAULTS.PEOPLE, FORECAST_DEFAULTS.PEOPLE);

  // ── Cargo weight for fuel economy adjustment ───────────────
  const cargoWeight = safeNum(loadoutTotals?.totalCargoWeightLbs ?? 0);

  // ── Route difficulty ───────────────────────────────────────
  const routeDifficulty = terrain?.difficulty || routeIntelligence.overallDifficulty || 'easy';

  // ══════════════════════════════════════════════════════════
  // FUEL FORECAST
  // ══════════════════════════════════════════════════════════

  let mpgUsed: number = FORECAST_DEFAULTS.MPG;
  if (vehicleProfile?.avgMpg && vehicleProfile.avgMpg > 0 && isFinite(vehicleProfile.avgMpg)) {
    mpgUsed = vehicleProfile.avgMpg;
    hasRealData = true;
  }
  if (mpgUsed <= 0 || !isFinite(mpgUsed)) {
    mpgUsed = FORECAST_DEFAULTS.MPG;
  }

  // Compute penalty factors
  const terrainPenalty = computeTerrainPenalty(terrain, routeIntelligence);
  const weightPenalty = computeWeightPenalty(cargoWeight);
  const offRoadPenalty = computeOffRoadPenalty(terrain?.isOffRoad ?? false);

  // Combined penalty (multiplicative)
  const combinedPenalty = terrainPenalty * weightPenalty * offRoadPenalty;
  const adjustedMpg = safeNum(mpgUsed / combinedPenalty, FORECAST_DEFAULTS.MPG);

  // Resolve available fuel (gallons)
  let fuelAvailable: number = FORECAST_DEFAULTS.FUEL_TANK_GAL;
  const fuelNotes: string[] = [];

  if (vehicleProfile?.fuelCapacityGallons && vehicleProfile.fuelCapacityGallons > 0) {
    if (vehicleProfile.currentFuelPercent != null && vehicleProfile.currentFuelPercent > 0) {
      fuelAvailable = vehicleProfile.fuelCapacityGallons * (vehicleProfile.currentFuelPercent / 100);
      fuelNotes.push(`Tank: ${vehicleProfile.currentFuelPercent}% of ${vehicleProfile.fuelCapacityGallons} gal`);
      hasRealData = true;
    } else {
      fuelAvailable = vehicleProfile.fuelCapacityGallons;
      fuelNotes.push(`Assuming full tank: ${vehicleProfile.fuelCapacityGallons} gal`);
      hasRealData = true;
    }
  } else {
    fuelNotes.push(`Using default tank: ${FORECAST_DEFAULTS.FUEL_TANK_GAL} gal`);
  }

  // Add spare fuel from loadout
  if (loadoutTotals?.fuelGallons && loadoutTotals.fuelGallons > 0) {
    fuelAvailable += loadoutTotals.fuelGallons;
    fuelNotes.push(`+${loadoutTotals.fuelGallons.toFixed(1)} gal spare fuel`);
    hasRealData = true;
  }

  // Compute fuel requirement
  const fuelRequired = safeNum(routeMiles / adjustedMpg);
  const fuelMargin = safeNum(fuelAvailable - fuelRequired);
  const fuelMarginPct = fuelRequired > 0 ? safeNum((fuelMargin / fuelRequired) * 100) : 100;

  // Fuel status thresholds
  let fuelStatus: ForecastStatus = 'OK';
  if (fuelMargin < 0) {
    fuelStatus = 'LOW';
    fuelNotes.push('Fuel projected shortfall — add spare fuel or plan refuel stop');
  } else if (fuelMargin < 3 || fuelMarginPct < 15) {
    fuelStatus = 'CAUTION';
    fuelNotes.push('Fuel margin tight for full route');
  }

  // Add penalty notes
  if (terrainPenalty > 1.05) {
    fuelNotes.push(`Terrain penalty: +${Math.round((terrainPenalty - 1) * 100)}% consumption`);
  }
  if (weightPenalty > 1.02) {
    fuelNotes.push(`Weight penalty: +${Math.round((weightPenalty - 1) * 100)}% (${cargoWeight.toLocaleString()} lb cargo)`);
  }
  if (offRoadPenalty > 1.0) {
    fuelNotes.push(`Off-road penalty: +${Math.round((offRoadPenalty - 1) * 100)}%`);
  }

  fuelNotes.push(`Adjusted MPG: ${adjustedMpg.toFixed(1)} (base ${mpgUsed})`);

  const fuel: FuelForecast = {
    mpgUsed,
    adjustedMpg: safeNum(Math.round(adjustedMpg * 10) / 10),
    availableGallons: safeNum(Math.round(fuelAvailable * 10) / 10),
    requiredGallons: safeNum(Math.round(fuelRequired * 10) / 10),
    marginGallons: safeNum(Math.round(fuelMargin * 10) / 10),
    marginPercent: safeNum(Math.round(fuelMarginPct)),
    status: fuelStatus,
    notes: fuelNotes,
    terrainPenalty,
    weightPenalty,
    offRoadPenalty,
  };

  // ══════════════════════════════════════════════════════════
  // WATER FORECAST
  // ══════════════════════════════════════════════════════════

  let waterAvailable: number = FORECAST_DEFAULTS.WATER_GAL;
  const waterNotes: string[] = [];
  const waterGPD = safeNum(
    loadoutTotals?.waterGallonsPerPersonPerDay ?? FORECAST_DEFAULTS.WATER_GPD,
    FORECAST_DEFAULTS.WATER_GPD,
  );

  if (loadoutTotals?.waterGallons != null && loadoutTotals.waterGallons > 0) {
    waterAvailable = loadoutTotals.waterGallons;
    waterNotes.push(`Loadout water: ${loadoutTotals.waterGallons.toFixed(1)} gal`);
    hasRealData = true;
  } else if (vehicleProfile?.waterCapacityGallons != null && vehicleProfile.waterCapacityGallons > 0) {
    waterAvailable = vehicleProfile.waterCapacityGallons;
    waterNotes.push(`Vehicle water capacity: ${vehicleProfile.waterCapacityGallons.toFixed(1)} gal`);
    hasRealData = true;
  } else {
    waterNotes.push(`Using default: ${FORECAST_DEFAULTS.WATER_GAL} gal`);
  }

  // Apply hot weather multiplier
  let effectiveWaterGPD: number = waterGPD;
  if (terrain?.isHotWeather) {
    effectiveWaterGPD *= FORECAST_DEFAULTS.HOT_WEATHER_WATER_MULT;
    waterNotes.push(`Hot weather: +${Math.round((FORECAST_DEFAULTS.HOT_WEATHER_WATER_MULT - 1) * 100)}% water usage`);
  }

  const waterRequired = safeNum(effectiveWaterGPD * peopleCount * estimatedDays);
  const waterMargin = safeNum(waterAvailable - waterRequired);
  const waterMarginPct = waterRequired > 0 ? safeNum((waterMargin / waterRequired) * 100) : 100;

  let waterStatus: ForecastStatus = 'OK';
  if (waterMargin < 0) {
    waterStatus = 'LOW';
    waterNotes.push('Water insufficient for estimated duration');
  } else if (waterMargin < 2 || waterMarginPct < 15) {
    waterStatus = 'CAUTION';
    waterNotes.push('Water margin tight — increase carry for hot/remote routes');
  }

  waterNotes.push(`Estimate: ${peopleCount} people, ${estimatedDays} day${estimatedDays > 1 ? 's' : ''}, ${effectiveWaterGPD.toFixed(1)} gal/person/day`);

  const water: WaterForecast = {
    availableGallons: safeNum(Math.round(waterAvailable * 10) / 10),
    requiredGallons: safeNum(Math.round(waterRequired * 10) / 10),
    marginGallons: safeNum(Math.round(waterMargin * 10) / 10),
    marginPercent: safeNum(Math.round(waterMarginPct)),
    estimatedDays,
    peopleCount,
    dailyUsagePerPerson: effectiveWaterGPD,
    status: waterStatus,
    notes: waterNotes,
  };

  // ══════════════════════════════════════════════════════════
  // POWER FORECAST
  // ══════════════════════════════════════════════════════════

  let powerAvailable: number = FORECAST_DEFAULTS.POWER_HOURS;
  const powerNotes: string[] = [];
  let solarContributionHours = 0;

  // Try to compute from telemetry
  if (telemetry?.estimatedRuntimeHours != null && telemetry.estimatedRuntimeHours > 0) {
    powerAvailable = telemetry.estimatedRuntimeHours;
    powerNotes.push(`Telemetry runtime: ${telemetry.estimatedRuntimeHours.toFixed(1)} hrs`);
    hasRealData = true;
  } else if (
    telemetry?.batterySocPercent != null &&
    telemetry.batteryCapacityWh != null &&
    telemetry.batteryCapacityWh > 0
  ) {
    const remainingWh = (telemetry.batterySocPercent / 100) * telemetry.batteryCapacityWh;
    const drawW = (telemetry.avgDrawWatts && telemetry.avgDrawWatts > 0)
      ? telemetry.avgDrawWatts
      : 50;
    powerAvailable = drawW > 0 ? safeNum(remainingWh / drawW, FORECAST_DEFAULTS.POWER_HOURS) : FORECAST_DEFAULTS.POWER_HOURS;
    powerNotes.push(`Battery: ${telemetry.batterySocPercent}% SOC, ${telemetry.batteryCapacityWh} Wh`);
    hasRealData = true;
  } else if (vehicleProfile?.batteryCapacityWh != null && vehicleProfile.batteryCapacityWh > 0) {
    const assumedDrawW = (telemetry?.avgDrawWatts && telemetry.avgDrawWatts > 0) ? telemetry.avgDrawWatts : 50;
    powerAvailable = assumedDrawW > 0
      ? safeNum(vehicleProfile.batteryCapacityWh / assumedDrawW, FORECAST_DEFAULTS.POWER_HOURS)
      : FORECAST_DEFAULTS.POWER_HOURS;
    powerNotes.push(`Configured battery capacity: ${Math.round(vehicleProfile.batteryCapacityWh)} Wh`);
    hasRealData = true;
  } else {
    powerNotes.push(`Using default: ${FORECAST_DEFAULTS.POWER_HOURS} hrs`);
  }

  // Solar charging contribution
  if (telemetry?.solarInputWatts && telemetry.solarInputWatts > 0) {
    const sunHours = telemetry.sunHoursPerDay ?? 5;
    const drawW = (telemetry.avgDrawWatts && telemetry.avgDrawWatts > 0) ? telemetry.avgDrawWatts : 50;
    const dailySolarWh = telemetry.solarInputWatts * sunHours * FORECAST_DEFAULTS.SOLAR_EFFICIENCY;
    const dailySolarHours = drawW > 0 ? dailySolarWh / drawW : 0;
    solarContributionHours = safeNum(dailySolarHours * estimatedDays);
    powerAvailable += solarContributionHours;
    powerNotes.push(`Solar: +${solarContributionHours.toFixed(1)} hrs over ${estimatedDays}d (${telemetry.solarInputWatts}W @ ${sunHours}h/day)`);
    hasRealData = true;
  }

  // Required power: drive time + camp usage per estimated day
  const powerRequired = safeNum(estimatedDriveHours + (estimatedDays * FORECAST_DEFAULTS.CAMP_POWER_HOURS));
  const powerMargin = safeNum(powerAvailable - powerRequired);
  const powerMarginPct = powerRequired > 0 ? safeNum((powerMargin / powerRequired) * 100) : 100;

  let powerStatus: ForecastStatus = 'OK';
  if (powerMargin < 0) {
    powerStatus = 'LOW';
    powerNotes.push('Power insufficient — consider solar or reduced draw');
  } else if (powerMargin < 6 || powerMarginPct < 15) {
    powerStatus = 'CAUTION';
    powerNotes.push('Power margin tight — consider solar/top-off');
  }

  powerNotes.push(`Includes ${estimatedDays * FORECAST_DEFAULTS.CAMP_POWER_HOURS}h estimated camp usage`);

  const power: PowerForecast = {
    availableHours: safeNum(Math.round(powerAvailable * 10) / 10),
    requiredHours: safeNum(Math.round(powerRequired * 10) / 10),
    marginHours: safeNum(Math.round(powerMargin * 10) / 10),
    marginPercent: safeNum(Math.round(powerMarginPct)),
    solarContributionHours: safeNum(Math.round(solarContributionHours * 10) / 10),
    status: powerStatus,
    notes: powerNotes,
  };

  // ══════════════════════════════════════════════════════════
  // OVERALL STATUS + SUFFICIENCY + DRIVERS + INTEL
  // ══════════════════════════════════════════════════════════

  const overallStatus = maxSeverity(fuel.status, water.status, power.status);
  const sufficiencyLevel = deriveSufficiencyLevel(
    fuel.status, water.status, power.status,
    fuelMarginPct, waterMarginPct, powerMarginPct,
  );

  const drivers: string[] = [];

  // Add LOW drivers first
  if (fuel.status === 'LOW') drivers.push('Fuel projected shortfall');
  if (water.status === 'LOW') drivers.push('Water estimate low for duration');
  if (power.status === 'LOW') drivers.push('Power insufficient for route');

  // Then CAUTION drivers
  if (fuel.status === 'CAUTION') drivers.push('Fuel margin tight');
  if (water.status === 'CAUTION') drivers.push('Water margin tight');
  if (power.status === 'CAUTION') drivers.push('Power margin tight');

  // If all OK
  if (drivers.length === 0) {
    drivers.push('All resources sufficient');
  }

  const topDrivers = drivers.slice(0, 3);

  // Generate intelligence messages
  const intelMessages = generateIntelMessages(
    fuel, water, power, routeMiles, estimatedDays, sufficiencyLevel,
  );

  // Generate planning estimate
  const planningEstimate = generatePlanningEstimate(
    routeMiles, estimatedDriveHours, estimatedDays,
    fuelRequired, waterRequired, powerRequired, adjustedMpg,
  );

  return {
    routeMiles: safeNum(Math.round(routeMiles * 10) / 10),
    estimatedDriveHours: safeNum(Math.round(estimatedDriveHours * 10) / 10),
    estimatedDays,
    fuel,
    water,
    power,
    overallStatus,
    sufficiencyLevel,
    drivers: topDrivers,
    intelMessages,
    planningEstimate,
    computedAt: new Date().toISOString(),
    routeIntelligenceId: routeIntelligence.id,
    hasRealData,
    routeDifficulty,
  };
}


// ── Listeners ────────────────────────────────────────────────

type ForecastListener = (forecast: ResourceForecast | null) => void;
const _listeners = new Set<ForecastListener>();

function _notify(forecast: ResourceForecast | null) {
  _listeners.forEach(fn => {
    try { fn(forecast); } catch (e) { console.error(TAG, 'Listener error:', e); }
  });
}

// ── Internal State ───────────────────────────────────────────

let _currentForecast: ResourceForecast | null = null;

// ── Persistence ──────────────────────────────────────────────

function loadStoredForecast(): ResourceForecast | null {
  try {
    const raw = sGet(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveForecast(forecast: ResourceForecast): void {
  try {
    sSet(STORAGE_KEY, JSON.stringify(forecast));
  } catch (e) {
    console.warn(TAG, 'Failed to save forecast:', e);
  }
}

function clearStoredForecast(): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    delete mem[STORAGE_KEY];
  } catch {}
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API — resourceForecastEngine
// ══════════════════════════════════════════════════════════════

export const resourceForecastEngine = {
  /**
   * Subscribe to forecast changes.
   * Returns unsubscribe function.
   */
  subscribe(listener: ForecastListener): () => void {
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  },

  /**
   * Compute and store a new resource forecast.
   * Notifies all subscribers.
   */
  compute(
    routeIntelligence: RouteIntelligence,
    vehicleProfile?: VehicleProfileSnapshot | null,
    loadoutTotals?: LoadoutTotalsSnapshot | null,
    telemetry?: TelemetrySnapshot | null,
    terrain?: TerrainContext | null,
  ): ResourceForecast {
    const forecast = computeResourceForecast(
      routeIntelligence,
      vehicleProfile,
      loadoutTotals,
      telemetry,
      terrain,
    );

    _currentForecast = forecast;
    saveForecast(forecast);
    _notify(forecast);

    console.log(
      TAG,
      `Forecast computed: ${forecast.routeMiles} mi, sufficiency=${forecast.sufficiencyLevel}`,
      `fuel=${forecast.fuel.status} water=${forecast.water.status} power=${forecast.power.status}`,
    );

    return forecast;
  },

  /**
   * Get the current forecast (in-memory or from storage).
   */
  getCurrent(): ResourceForecast | null {
    if (_currentForecast) return _currentForecast;
    _currentForecast = loadStoredForecast();
    return _currentForecast;
  },

  /**
   * Check if forecast matches a given route intelligence ID.
   */
  isCurrentFor(routeIntelligenceId: string): boolean {
    const current = this.getCurrent();
    return current != null && current.routeIntelligenceId === routeIntelligenceId;
  },

  /**
   * Clear current forecast.
   */
  clear(): void {
    _currentForecast = null;
    clearStoredForecast();
    _notify(null);
    console.log(TAG, 'Forecast cleared');
  },

  /**
   * Format margin value with sign prefix.
   */
  formatMargin(value: number, unit: string): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)} ${unit}`;
  },

  /**
   * Get status color for a ForecastStatus.
   */
  getStatusColor(status: ForecastStatus): string {
    return STATUS_COLORS[status];
  },

  /**
   * Get status icon name for a ForecastStatus.
   */
  getStatusIcon(status: ForecastStatus): string {
    return STATUS_ICONS[status];
  },

  /**
   * Get sufficiency configuration.
   */
  getSufficiencyConfig(level: SufficiencyLevel): SufficiencyConfig {
    return SUFFICIENCY_CONFIGS[level];
  },

  /**
   * Get a human-readable summary string.
   */
  getSummary(forecast: ResourceForecast): string {
    const parts: string[] = [];
    parts.push(`${forecast.routeMiles} mi route`);
    parts.push(`~${forecast.estimatedDays}d expedition`);
    if (forecast.overallStatus !== 'OK') {
      parts.push(`${forecast.drivers[0]}`);
    }
    return parts.join(' — ');
  },

  /**
   * Get compact status label for dashboard display.
   */
  getCompactLabel(forecast: ResourceForecast): string {
    const config = SUFFICIENCY_CONFIGS[forecast.sufficiencyLevel];
    return config.shortLabel;
  },

  /**
   * Get expedition intelligence messages from current forecast.
   */
  getIntelMessages(): ForecastIntelMessage[] {
    const current = this.getCurrent();
    return current?.intelMessages ?? [];
  },

  /**
   * Get planning estimate from current forecast.
   */
  getPlanningEstimate(): PlanningEstimate | null {
    const current = this.getCurrent();
    return current?.planningEstimate ?? null;
  },

  /**
   * Quick sufficiency check without full forecast.
   * Returns the sufficiency level of the current forecast.
   */
  getSufficiencyLevel(): SufficiencyLevel {
    const current = this.getCurrent();
    return current?.sufficiencyLevel ?? 'Stable';
  },
};



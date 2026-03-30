/**
 * ECS EXPEDITION FORECAST ENGINE — Predictive Expedition Intelligence (Phase 4)
 * ==============================================================================
 *
 * Combines outputs from Phase 1–3 into a single predictive expedition briefing:
 *   - Route Intelligence (Phase 1): distance, drive time, elevation
 *   - Resource Forecast (Phase 2): fuel, water, power status
 *   - Terrain Intelligence (Phase 3): steep segments, passes, elevation
 *
 * OUTPUTS:
 *   - ExpeditionForecast with overall status, alerts, and summary
 *   - Feeds the Expedition Forecast Panel (Dashboard + Navigate)
 *
 * ARCHITECTURE:
 *   - Pure computation (no side effects)
 *   - Subscriber pattern for UI updates
 *   - Recomputes when any input engine changes
 *   - Stores result in memory + localStorage
 */

import { Platform } from 'react-native';
import type { RouteIntelligence } from './routeAnalysisEngine';
import type { ResourceForecast, ForecastStatus } from './resourceForecastEngine';
import type { TerrainIntelligence } from './terrainAnalysisEngine';

const TAG = '[EXPEDITION_FORECAST]';

// ── Types ────────────────────────────────────────────────────

/**
 * Overall expedition forecast status.
 * WARNING = at least one critical issue
 * CAUTION = at least one non-critical concern
 * OK = all systems nominal
 */
export type ExpeditionForecastStatus = 'OK' | 'CAUTION' | 'WARNING';

/**
 * Alert type categories.
 */
export type ForecastAlertType = 'FUEL' | 'POWER' | 'WATER' | 'TERRAIN';

/**
 * Alert severity levels.
 */
export type ForecastAlertSeverity = 'CAUTION' | 'WARNING';

/**
 * A single forecast alert.
 */
export interface ForecastAlert {
  /** Alert category */
  type: ForecastAlertType;
  /** Alert severity */
  severity: ForecastAlertSeverity;
  /** Human-readable alert message */
  message: string;
  /** Icon name for display */
  icon: string;
}

/**
 * Summary of route characteristics.
 */
export interface ForecastSummary {
  /** Total route distance (miles) */
  routeDistance: number;
  /** Estimated drive time (hours) */
  estimatedDriveTime: number;
  /** Total elevation gain (feet) */
  elevationGain: number;
  /** Highest point on route (feet) */
  highestElevation: number;
  /** Estimated expedition duration (days) */
  estimatedDays: number;
  /** Route name */
  routeName: string;
  /** Overall terrain difficulty */
  terrainDifficulty: string;
}

/**
 * Complete expedition forecast result.
 */
export interface ExpeditionForecast {
  /** Unique forecast ID */
  id: string;
  /** Overall forecast status */
  status: ExpeditionForecastStatus;
  /** Natural-language expedition brief — one clear sentence summarizing conditions */
  brief: string;
  /** All generated alerts */
  alerts: ForecastAlert[];
  /** Route summary data */
  summary: ForecastSummary;
  /** Resources that are confirmed OK */
  confirmations: ForecastConfirmation[];
  /** Source IDs for cache invalidation */
  sourceIds: {
    routeIntelligenceId: string;
    resourceForecastId: string | null;
    terrainIntelligenceId: string | null;
  };
  /** Computation timestamp */
  computedAt: string;
}


/**
 * A positive confirmation (resource is OK).
 */
export interface ForecastConfirmation {
  type: ForecastAlertType;
  message: string;
  icon: string;
}

// ── Constants ────────────────────────────────────────────────

const STORAGE_KEY = 'ecs_expedition_forecast';

// ── Status Metadata ──────────────────────────────────────────

export const FORECAST_STATUS_META: Record<ExpeditionForecastStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
}> = {
  OK: {
    label: 'OK',
    color: '#66BB6A',
    bgColor: 'rgba(102,187,106,0.08)',
    icon: 'shield-checkmark-outline',
  },
  CAUTION: {
    label: 'CAUTION',
    color: '#FFB74D',
    bgColor: 'rgba(255,183,77,0.08)',
    icon: 'alert-circle-outline',
  },
  WARNING: {
    label: 'WARNING',
    color: '#EF5350',
    bgColor: 'rgba(239,83,80,0.08)',
    icon: 'warning-outline',
  },
};

export const ALERT_TYPE_META: Record<ForecastAlertType, {
  label: string;
  icon: string;
  color: string;
}> = {
  FUEL: { label: 'FUEL', icon: 'flame-outline', color: '#FF9800' },
  WATER: { label: 'WATER', icon: 'water-outline', color: '#42A5F5' },
  POWER: { label: 'POWER', icon: 'battery-half-outline', color: '#AB47BC' },
  TERRAIN: { label: 'TERRAIN', icon: 'trail-sign-outline', color: '#8D6E63' },
};

export const SEVERITY_META: Record<ForecastAlertSeverity, {
  label: string;
  color: string;
  icon: string;
}> = {
  CAUTION: { label: 'CAUTION', color: '#FFB74D', icon: 'alert-circle-outline' },
  WARNING: { label: 'WARNING', color: '#EF5350', icon: 'warning-outline' },
};

// ── Storage Helpers ──────────────────────────────────────────

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

function uuid(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
// ── Brief Helper ─────────────────────────────────────────────

/** Format hours as human-readable drive time (standalone, no engine dependency). */
function formatDriveTimeStr(hours: number): string {
  if (hours <= 0) return '0m';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}


// ══════════════════════════════════════════════════════════════
// EXPEDITION BRIEF GENERATOR
// ══════════════════════════════════════════════════════════════
//
// Generates a single natural-language sentence summarizing the
// expedition based on route analysis, terrain intelligence, and
// resource forecasts. Combines multiple signals into a concise
// human-readable briefing.
// ══════════════════════════════════════════════════════════════

/**

 *
 * Combines terrain, fuel, water, power, and campsite signals into one clear sentence.
 * If multiple issues exist, they are joined with "and".
 * If no issues exist, returns a positive default brief.
 *
 * Phase 3 Campsite Refinement: Optionally appends a campsite brief sentence
 * when at least one campsite suggestion has HIGH confidence. Does not overwrite
 * more important warnings such as fuel, water, or mountain pass alerts.
 *
 * @param routeIntel - Phase 1 RouteIntelligence
 * @param resourceForecast - Phase 2 ResourceForecast (optional)
 * @param terrainIntel - Phase 3 TerrainIntelligence (optional)
 * @param campsiteBrief - Optional campsite brief sentence from campsiteCandidateEngine (Phase 3 Refinement)
 * @returns A single natural-language sentence (or two sentences if campsite brief appended)
 */
function generateExpeditionBrief(
  routeIntel: RouteIntelligence,
  resourceForecast?: ResourceForecast | null,
  terrainIntel?: TerrainIntelligence | null,
  campsiteBrief?: string | null,
): string {
  const terrainSignals: string[] = [];
  const resourceSignals: string[] = [];

  // ── Terrain Signals ────────────────────────────────────────

  if (terrainIntel) {
    // Mountain pass — highest priority terrain signal
    if (terrainIntel.mountainPassDetected) {
      if (terrainIntel.mountainPassCount > 1) {
        terrainSignals.push(`route crosses ${terrainIntel.mountainPassCount} mountain passes with significant elevation gain`);
      } else {
        terrainSignals.push('route crosses a mountain pass with significant elevation gain');
      }
    }

    // Steep terrain — only if no mountain pass (avoid redundancy)
    if (terrainIntel.steepSegments > 2 && !terrainIntel.mountainPassDetected) {
      terrainSignals.push('steep terrain expected along portions of the route');
    } else if (terrainIntel.steepSegments > 0 && terrainIntel.steepSegments <= 2 && !terrainIntel.mountainPassDetected) {
      terrainSignals.push('some steep terrain segments along the route');
    }

    // High elevation — add if significant
    if (terrainIntel.highElevationSegments > 2) {
      terrainSignals.push(`extended high elevation travel above 7,500 ft`);
    }

    // Severe/high terrain risk — add if not already covered by specific signals
    if (terrainIntel.overallRisk === 'SEVERE' && terrainSignals.length === 0) {
      terrainSignals.push('severe terrain conditions expected');
    } else if (terrainIntel.overallRisk === 'HIGH' && terrainSignals.length === 0) {
      terrainSignals.push('challenging terrain conditions expected');
    }
  }

  // ── Resource Signals ───────────────────────────────────────

  if (resourceForecast) {
    // Fuel
    if (resourceForecast.fuel.status === 'LOW') {
      resourceSignals.push('fuel margin appears insufficient for the planned route');
    } else if (resourceForecast.fuel.status === 'CAUTION') {
      resourceSignals.push('fuel margin appears tight for the planned route');
    }

    // Water
    if (resourceForecast.water.status === 'LOW') {
      resourceSignals.push('water supply may be insufficient for estimated trip duration');
    } else if (resourceForecast.water.status === 'CAUTION') {
      resourceSignals.push('water supply margin is tight for estimated duration');
    }

    // Power
    if (resourceForecast.power.status === 'LOW') {
      resourceSignals.push('power reserves may not sustain expedition systems');
    } else if (resourceForecast.power.status === 'CAUTION') {
      resourceSignals.push('power reserves are tight for the expedition');
    }
  }

  // ── Combine Signals ────────────────────────────────────────

  const allSignals = [...terrainSignals, ...resourceSignals];

  // No issues detected — return positive brief
  if (allSignals.length === 0) {
    // Provide a contextual positive brief based on route characteristics
    const distStr = routeIntel.totalDistanceMiles.toFixed(0);
    const driveStr = formatDriveTimeStr(routeIntel.estimatedDriveTimeHours);

    let baseBrief: string;
    if (routeIntel.overallDifficulty === 'easy') {
      baseBrief = `Route analyzed. ${distStr}-mile expedition over ${driveStr} drive time with normal conditions expected.`;
    } else if (routeIntel.overallDifficulty === 'moderate') {
      baseBrief = `Route analyzed. ${distStr}-mile expedition with moderate terrain and resource levels appear sufficient.`;
    } else {
      baseBrief = `Route analyzed. Expedition conditions appear normal for this ${distStr}-mile route.`;
    }

    // Phase 3 Campsite Refinement: Append campsite brief if available and space allows
    if (campsiteBrief) {
      return baseBrief + ' ' + campsiteBrief;
    }
    return baseBrief;
  }

  // Single signal — capitalize and form sentence
  if (allSignals.length === 1) {
    const baseBrief = capitalizeFirst(allSignals[0]) + '.';
    // Phase 3: Only append campsite brief for single-signal briefs (space allows)
    if (campsiteBrief) {
      return baseBrief + ' ' + campsiteBrief;
    }
    return baseBrief;
  }

  // Two signals — join with "and"
  if (allSignals.length === 2) {
    return capitalizeFirst(allSignals[0]) + ' and ' + allSignals[1] + '.';
    // Note: Do NOT append campsite brief when 2+ warnings exist — too cluttered
  }

  // Three or more signals — take the top 2 terrain + top 1 resource (or vice versa)
  // to keep the brief concise
  const primarySignals: string[] = [];

  // Take up to 1 terrain signal (most important)
  if (terrainSignals.length > 0) {
    primarySignals.push(terrainSignals[0]);
  }

  // Take up to 1 resource signal (most important — LOW first, then CAUTION)
  if (resourceSignals.length > 0) {
    primarySignals.push(resourceSignals[0]);
  }

  // If we still have room and more signals, add one more
  if (primarySignals.length < 2) {
    const remaining = allSignals.filter(s => !primarySignals.includes(s));
    if (remaining.length > 0) {
      primarySignals.push(remaining[0]);
    }
  }

  // Build the sentence
  if (primarySignals.length === 1) {
    return capitalizeFirst(primarySignals[0]) + '.';
  }

  const result = capitalizeFirst(primarySignals[0]) + ' and ' + primarySignals[1] + '.';

  // If there are additional signals beyond the 2 we used, note them
  const extraCount = allSignals.length - 2;
  if (extraCount > 0) {
    return result.replace('.', ` with ${extraCount} additional concern${extraCount > 1 ? 's' : ''}.`);
  }

  return result;
}


/**
 * Capitalize the first letter of a string.
 */
function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}



/**
 * Generate a complete expedition forecast from Phase 1–3 outputs.
 *
 * @param routeIntel - Phase 1 RouteIntelligence (required)
 * @param resourceForecast - Phase 2 ResourceForecast (optional)
 * @param terrainIntel - Phase 3 TerrainIntelligence (optional)
 * @param campsiteBrief - Optional campsite brief sentence (Phase 3 Campsite Refinement)
 * @returns ExpeditionForecast
 */
export function generateExpeditionForecast(
  routeIntel: RouteIntelligence,
  resourceForecast?: ResourceForecast | null,
  terrainIntel?: TerrainIntelligence | null,
  campsiteBrief?: string | null,
): ExpeditionForecast {
  const alerts: ForecastAlert[] = [];
  const confirmations: ForecastConfirmation[] = [];

  const estimatedDays = resourceForecast?.estimatedDays
    ?? Math.max(1, Math.ceil(routeIntel.estimatedDriveTimeHours / 8));

  const summary: ForecastSummary = {
    routeDistance: routeIntel.totalDistanceMiles,
    estimatedDriveTime: routeIntel.estimatedDriveTimeHours,
    elevationGain: routeIntel.elevationGainFeet,
    highestElevation: terrainIntel?.highestElevationFeet ?? routeIntel.highestElevationFeet,
    estimatedDays,
    routeName: routeIntel.routeName,
    terrainDifficulty: routeIntel.overallDifficulty,
  };

  // ══════════════════════════════════════════════════════════
  // RESOURCE ALERTS (from Phase 2)
  // ══════════════════════════════════════════════════════════

  if (resourceForecast) {
    // ── Fuel Alerts ──
    if (resourceForecast.fuel.status === 'LOW') {
      alerts.push({
        type: 'FUEL',
        severity: 'WARNING',
        message: 'Fuel margin insufficient for route',
        icon: 'flame-outline',
      });
    } else if (resourceForecast.fuel.status === 'CAUTION') {
      alerts.push({
        type: 'FUEL',
        severity: 'CAUTION',
        message: 'Fuel margin tight for full route',
        icon: 'flame-outline',
      });
    } else {
      confirmations.push({
        type: 'FUEL',
        message: `Fuel supply adequate (+${resourceForecast.fuel.marginGallons.toFixed(1)} gal)`,
        icon: 'checkmark-circle-outline',
      });
    }

    // ── Water Alerts ──
    if (resourceForecast.water.status === 'LOW') {
      alerts.push({
        type: 'WATER',
        severity: 'WARNING',
        message: 'Water supply insufficient for trip duration',
        icon: 'water-outline',
      });
    } else if (resourceForecast.water.status === 'CAUTION') {
      alerts.push({
        type: 'WATER',
        severity: 'CAUTION',
        message: 'Water margin tight for estimated duration',
        icon: 'water-outline',
      });
    } else {
      confirmations.push({
        type: 'WATER',
        message: `Water supply adequate (+${resourceForecast.water.marginGallons.toFixed(1)} gal)`,
        icon: 'checkmark-circle-outline',
      });
    }

    // ── Power Alerts ──
    if (resourceForecast.power.status === 'LOW') {
      alerts.push({
        type: 'POWER',
        severity: 'WARNING',
        message: 'Power reserve may not sustain expedition',
        icon: 'battery-half-outline',
      });
    } else if (resourceForecast.power.status === 'CAUTION') {
      alerts.push({
        type: 'POWER',
        severity: 'CAUTION',
        message: 'Power reserve margin tight',
        icon: 'battery-half-outline',
      });
    } else {
      confirmations.push({
        type: 'POWER',
        message: `Power reserve sufficient (+${resourceForecast.power.marginHours.toFixed(1)} hrs)`,
        icon: 'checkmark-circle-outline',
      });
    }
  } else {
    // No resource forecast available — note it
    confirmations.push({
      type: 'FUEL',
      message: 'Fuel forecast unavailable — load route for analysis',
      icon: 'help-circle-outline',
    });
    confirmations.push({
      type: 'WATER',
      message: 'Water forecast unavailable',
      icon: 'help-circle-outline',
    });
    confirmations.push({
      type: 'POWER',
      message: 'Power forecast unavailable',
      icon: 'help-circle-outline',
    });
  }

  // ══════════════════════════════════════════════════════════
  // TERRAIN ALERTS (from Phase 3)
  // ══════════════════════════════════════════════════════════

  if (terrainIntel) {
    // Mountain pass detection
    if (terrainIntel.mountainPassDetected) {
      alerts.push({
        type: 'TERRAIN',
        severity: 'CAUTION',
        message: `Mountain pass crossing detected${terrainIntel.mountainPassCount > 1 ? ` (${terrainIntel.mountainPassCount} passes)` : ''}`,
        icon: 'triangle-outline',
      });
    }

    // Multiple steep segments
    if (terrainIntel.steepSegments > 2) {
      alerts.push({
        type: 'TERRAIN',
        severity: 'CAUTION',
        message: `Multiple steep terrain segments (${terrainIntel.steepSegments})`,
        icon: 'trending-up-outline',
      });
    } else if (terrainIntel.steepSegments > 0 && terrainIntel.steepSegments <= 2) {
      // Minor steep terrain — still note it but don't alert
      confirmations.push({
        type: 'TERRAIN',
        message: `${terrainIntel.steepSegments} steep segment${terrainIntel.steepSegments > 1 ? 's' : ''} — manageable`,
        icon: 'checkmark-circle-outline',
      });
    }

    // High elevation segments
    if (terrainIntel.highElevationSegments > 2) {
      alerts.push({
        type: 'TERRAIN',
        severity: 'CAUTION',
        message: `Extended high elevation travel (${terrainIntel.highElevationSegments} segments above 7,500 ft)`,
        icon: 'arrow-up-circle-outline',
      });
    }

    // Severe terrain risk
    if (terrainIntel.overallRisk === 'SEVERE') {
      alerts.push({
        type: 'TERRAIN',
        severity: 'WARNING',
        message: 'Severe terrain risk — plan accordingly',
        icon: 'skull-outline',
      });
    } else if (terrainIntel.overallRisk === 'HIGH') {
      alerts.push({
        type: 'TERRAIN',
        severity: 'CAUTION',
        message: 'High terrain difficulty — allow extra time',
        icon: 'warning-outline',
      });
    }

    // No terrain warnings at all
    if (terrainIntel.terrainWarnings.length === 0) {
      confirmations.push({
        type: 'TERRAIN',
        message: 'Terrain within normal parameters',
        icon: 'checkmark-circle-outline',
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  // DETERMINE OVERALL STATUS
  // ══════════════════════════════════════════════════════════

  let status: ExpeditionForecastStatus = 'OK';

  const hasWarning = alerts.some(a => a.severity === 'WARNING');
  const hasCaution = alerts.some(a => a.severity === 'CAUTION');

  if (hasWarning) {
    status = 'WARNING';
  } else if (hasCaution) {
    status = 'CAUTION';
  }

  // ── Sort alerts: WARNING first, then CAUTION ──
  alerts.sort((a, b) => {
    const severityOrder: Record<ForecastAlertSeverity, number> = { WARNING: 0, CAUTION: 1 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  // ══════════════════════════════════════════════════════════
  // GENERATE EXPEDITION BRIEF
  // ══════════════════════════════════════════════════════════

  const brief = generateExpeditionBrief(routeIntel, resourceForecast, terrainIntel, campsiteBrief);


  // ── Build forecast ──
  const forecast: ExpeditionForecast = {
    id: uuid(),
    status,
    brief,
    alerts,
    summary,
    confirmations,
    sourceIds: {
      routeIntelligenceId: routeIntel.id,
      resourceForecastId: resourceForecast?.routeIntelligenceId ?? null,
      terrainIntelligenceId: terrainIntel?.id ?? null,
    },
    computedAt: new Date().toISOString(),
  };





  return forecast;
}

// ── Listeners ────────────────────────────────────────────────

type ForecastListener = (forecast: ExpeditionForecast | null) => void;
const _listeners = new Set<ForecastListener>();

function _notify(forecast: ExpeditionForecast | null) {
  _listeners.forEach(fn => {
    try { fn(forecast); } catch (e) { console.error(TAG, 'Listener error:', e); }
  });
}

// ── Internal State ───────────────────────────────────────────

let _currentForecast: ExpeditionForecast | null = null;

// ── Persistence ──────────────────────────────────────────────

function loadStoredForecast(): ExpeditionForecast | null {
  try {
    const raw = sGet(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveForecast(forecast: ExpeditionForecast): void {
  try {
    sSet(STORAGE_KEY, JSON.stringify(forecast));
  } catch (e) {
    console.warn(TAG, 'Failed to save expedition forecast:', e);
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
// PUBLIC API — expeditionForecastEngine
// ══════════════════════════════════════════════════════════════

export const expeditionForecastEngine = {
  /**
   * Subscribe to expedition forecast changes.
   * Returns unsubscribe function.
   */
  subscribe(listener: ForecastListener): () => void {
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  },
  /**
   * Generate and store a new expedition forecast.
   * Notifies all subscribers.
   * @param campsiteBrief - Optional campsite brief sentence (Phase 3 Campsite Refinement)
   */
  generate(
    routeIntel: RouteIntelligence,
    resourceForecast?: ResourceForecast | null,
    terrainIntel?: TerrainIntelligence | null,
    campsiteBrief?: string | null,
  ): ExpeditionForecast {
    const forecast = generateExpeditionForecast(routeIntel, resourceForecast, terrainIntel, campsiteBrief);
    _currentForecast = forecast;
    saveForecast(forecast);
    _notify(forecast);
    return forecast;
  },


  /**
   * Get the current expedition forecast (in-memory or from storage).
   */
  getCurrent(): ExpeditionForecast | null {
    if (_currentForecast) return _currentForecast;
    _currentForecast = loadStoredForecast();
    return _currentForecast;
  },

  /**
   * Check if forecast matches a given route intelligence ID.
   */
  isCurrentFor(routeIntelligenceId: string): boolean {
    const current = this.getCurrent();
    return current != null && current.sourceIds.routeIntelligenceId === routeIntelligenceId;
  },

  /**
   * Check if the forecast needs recomputation based on source IDs.
   */
  needsRecompute(
    routeIntelligenceId: string,
    resourceForecastId?: string | null,
    terrainIntelligenceId?: string | null,
  ): boolean {
    const current = this.getCurrent();
    if (!current) return true;
    if (current.sourceIds.routeIntelligenceId !== routeIntelligenceId) return true;
    if (resourceForecastId && current.sourceIds.resourceForecastId !== resourceForecastId) return true;
    if (terrainIntelligenceId && current.sourceIds.terrainIntelligenceId !== terrainIntelligenceId) return true;
    return false;
  },

  /**
   * Clear current expedition forecast.
   */
  clear(): void {
    _currentForecast = null;
    clearStoredForecast();
    _notify(null);


  },

  /**
   * Get status metadata for display.
   */
  getStatusMeta(status: ExpeditionForecastStatus) {
    return FORECAST_STATUS_META[status];
  },

  /**
   * Get alert type metadata for display.
   */
  getAlertTypeMeta(type: ForecastAlertType) {
    return ALERT_TYPE_META[type];
  },

  /**
   * Get a compact summary string.
   */
  getSummary(forecast: ExpeditionForecast): string {
    const parts: string[] = [];
    parts.push(`${forecast.summary.routeDistance.toFixed(0)} mi`);
    parts.push(`~${forecast.summary.estimatedDriveTime.toFixed(1)} hrs`);
    if (forecast.alerts.length > 0) {
      parts.push(`${forecast.alerts.length} alert${forecast.alerts.length > 1 ? 's' : ''}`);
    }
    return parts.join(' — ');
  },

  /**
   * Get alert count by severity.
   */
  getAlertCounts(forecast: ExpeditionForecast): { warnings: number; cautions: number } {
    let warnings = 0;
    let cautions = 0;
    for (const a of forecast.alerts) {
      if (a.severity === 'WARNING') warnings++;
      else if (a.severity === 'CAUTION') cautions++;
    }
    return { warnings, cautions };
  },

  /**
   * Format drive time as human-readable string.
   */
  formatDriveTime(hours: number): string {
    if (hours <= 0) return '0m';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  },

  /**
   * Format elevation as human-readable string with commas.
   */
  formatElevation(feet: number): string {
    return feet.toLocaleString('en-US');
  },
};


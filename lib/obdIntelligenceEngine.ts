/**
 * ═══════════════════════════════════════════════════════════
 * ECS OBD INTELLIGENCE ENGINE
 * ═══════════════════════════════════════════════════════════
 *
 * Generates expedition intelligence alerts from live OBD-II
 * vehicle telemetry data. Feeds into the Expedition Intelligence
 * system with calm, tactical wording.
 *
 * Alert categories:
 *   - Engine temperature warnings
 *   - Transmission temperature warnings
 *   - Fuel level alerts
 *   - Battery voltage alerts
 *   - Engine load warnings (sustained climb)
 *   - Coolant temperature alerts
 *
 * All alerts use restrained, professional language suitable
 * for expedition use.
 */

import type { NormalizedVehicleTelemetry } from '../src/vehicle-telemetry/VehicleTelemetryTypes';

// ═══════════════════════════════════════════════════════════
// ALERT TYPES
// ═══════════════════════════════════════════════════════════

export type OBDAlertSeverity = 'info' | 'caution' | 'warning' | 'critical';

export interface OBDIntelligenceAlert {
  id: string;
  severity: OBDAlertSeverity;
  category: string;
  title: string;
  message: string;
  value: number | null;
  threshold: number;
  unit: string;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════
// THRESHOLDS
// ═══════════════════════════════════════════════════════════

const THRESHOLDS = {
  coolant_temp_caution: 220,    // °F
  coolant_temp_warning: 235,    // °F
  coolant_temp_critical: 250,   // °F

  transmission_temp_caution: 200, // °F
  transmission_temp_warning: 230, // °F
  transmission_temp_critical: 260, // °F

  fuel_level_caution: 25,       // %
  fuel_level_warning: 15,       // %
  fuel_level_critical: 8,       // %

  battery_voltage_low: 12.0,    // V
  battery_voltage_critical: 11.5, // V
  battery_voltage_high: 15.0,   // V

  engine_load_sustained: 85,    // % (sustained high load)
  engine_load_critical: 95,     // %

  intake_temp_high: 150,        // °F
} as const;

// ═══════════════════════════════════════════════════════════
// COOLDOWN TRACKING (prevent alert spam)
// ═══════════════════════════════════════════════════════════

const alertCooldowns: Map<string, number> = new Map();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between same alerts

function canAlert(alertId: string): boolean {
  const lastTime = alertCooldowns.get(alertId);
  if (!lastTime) return true;
  return Date.now() - lastTime >= COOLDOWN_MS;
}

function markAlerted(alertId: string): void {
  alertCooldowns.set(alertId, Date.now());
}

// ═══════════════════════════════════════════════════════════
// ALERT EVALUATION
// ═══════════════════════════════════════════════════════════

/**
 * Evaluate OBD telemetry and generate intelligence alerts.
 *
 * Called by the telemetry polling loop whenever new data arrives.
 * Returns an array of new alerts (empty if no thresholds crossed).
 */
export function evaluateOBDTelemetry(
  telemetry: NormalizedVehicleTelemetry,
): OBDIntelligenceAlert[] {
  const alerts: OBDIntelligenceAlert[] = [];
  const ts = telemetry.timestamp || Date.now();

  // ── Coolant Temperature ────────────────────────────────
  if (telemetry.coolant_temp != null) {
    const t = telemetry.coolant_temp;
    if (t >= THRESHOLDS.coolant_temp_critical && canAlert('coolant_critical')) {
      alerts.push({
        id: 'coolant_critical',
        severity: 'critical',
        category: 'ENGINE',
        title: 'Coolant temperature critical',
        message: `Engine coolant has reached ${Math.round(t)}°F. Consider stopping to allow the engine to cool. Check coolant levels.`,
        value: t,
        threshold: THRESHOLDS.coolant_temp_critical,
        unit: '°F',
        timestamp: ts,
      });
      markAlerted('coolant_critical');
    } else if (t >= THRESHOLDS.coolant_temp_warning && canAlert('coolant_warning')) {
      alerts.push({
        id: 'coolant_warning',
        severity: 'warning',
        category: 'ENGINE',
        title: 'Engine temperature elevated',
        message: `Coolant temperature at ${Math.round(t)}°F. Monitor closely during sustained climbs or towing.`,
        value: t,
        threshold: THRESHOLDS.coolant_temp_warning,
        unit: '°F',
        timestamp: ts,
      });
      markAlerted('coolant_warning');
    } else if (t >= THRESHOLDS.coolant_temp_caution && canAlert('coolant_caution')) {
      alerts.push({
        id: 'coolant_caution',
        severity: 'caution',
        category: 'ENGINE',
        title: 'Engine temperature rising',
        message: `Coolant temperature at ${Math.round(t)}°F. Normal range is 195–220°F.`,
        value: t,
        threshold: THRESHOLDS.coolant_temp_caution,
        unit: '°F',
        timestamp: ts,
      });
      markAlerted('coolant_caution');
    }
  }

  // ── Transmission Temperature ───────────────────────────
  if (telemetry.transmission_temp != null) {
    const t = telemetry.transmission_temp;
    if (t >= THRESHOLDS.transmission_temp_critical && canAlert('trans_critical')) {
      alerts.push({
        id: 'trans_critical',
        severity: 'critical',
        category: 'TRANSMISSION',
        title: 'Transmission temperature critical',
        message: `Transmission fluid at ${Math.round(t)}°F. Reduce load immediately. Consider stopping.`,
        value: t,
        threshold: THRESHOLDS.transmission_temp_critical,
        unit: '°F',
        timestamp: ts,
      });
      markAlerted('trans_critical');
    } else if (t >= THRESHOLDS.transmission_temp_warning && canAlert('trans_warning')) {
      alerts.push({
        id: 'trans_warning',
        severity: 'warning',
        category: 'TRANSMISSION',
        title: 'Transmission temperature elevated',
        message: `Transmission at ${Math.round(t)}°F. Reduce speed on grades. Avoid heavy towing loads.`,
        value: t,
        threshold: THRESHOLDS.transmission_temp_warning,
        unit: '°F',
        timestamp: ts,
      });
      markAlerted('trans_warning');
    } else if (t >= THRESHOLDS.transmission_temp_caution && canAlert('trans_caution')) {
      alerts.push({
        id: 'trans_caution',
        severity: 'caution',
        category: 'TRANSMISSION',
        title: 'Transmission temperature rising',
        message: `Transmission fluid at ${Math.round(t)}°F. Monitor during sustained grades.`,
        value: t,
        threshold: THRESHOLDS.transmission_temp_caution,
        unit: '°F',
        timestamp: ts,
      });
      markAlerted('trans_caution');
    }
  }

  // ── Fuel Level ─────────────────────────────────────────
  if (telemetry.fuel_level != null) {
    const f = telemetry.fuel_level;
    if (f <= THRESHOLDS.fuel_level_critical && canAlert('fuel_critical')) {
      alerts.push({
        id: 'fuel_critical',
        severity: 'critical',
        category: 'FUEL',
        title: 'Fuel level critical',
        message: `Fuel at ${Math.round(f)}%. Locate fuel immediately. Consider route adjustment.`,
        value: f,
        threshold: THRESHOLDS.fuel_level_critical,
        unit: '%',
        timestamp: ts,
      });
      markAlerted('fuel_critical');
    } else if (f <= THRESHOLDS.fuel_level_warning && canAlert('fuel_warning')) {
      alerts.push({
        id: 'fuel_warning',
        severity: 'warning',
        category: 'FUEL',
        title: 'Fuel level low for current route',
        message: `Fuel at ${Math.round(f)}%. Plan refueling at next available station.`,
        value: f,
        threshold: THRESHOLDS.fuel_level_warning,
        unit: '%',
        timestamp: ts,
      });
      markAlerted('fuel_warning');
    } else if (f <= THRESHOLDS.fuel_level_caution && canAlert('fuel_caution')) {
      alerts.push({
        id: 'fuel_caution',
        severity: 'caution',
        category: 'FUEL',
        title: 'Fuel level below quarter tank',
        message: `Fuel at ${Math.round(f)}%. Consider refueling before entering remote areas.`,
        value: f,
        threshold: THRESHOLDS.fuel_level_caution,
        unit: '%',
        timestamp: ts,
      });
      markAlerted('fuel_caution');
    }
  }

  // ── Battery Voltage ────────────────────────────────────
  if (telemetry.battery_voltage != null) {
    const v = telemetry.battery_voltage;
    if (v <= THRESHOLDS.battery_voltage_critical && canAlert('batt_critical')) {
      alerts.push({
        id: 'batt_critical',
        severity: 'critical',
        category: 'ELECTRICAL',
        title: 'Vehicle voltage critically low',
        message: `Battery at ${v.toFixed(1)}V. Possible alternator failure or parasitic draw. Check charging system.`,
        value: v,
        threshold: THRESHOLDS.battery_voltage_critical,
        unit: 'V',
        timestamp: ts,
      });
      markAlerted('batt_critical');
    } else if (v <= THRESHOLDS.battery_voltage_low && canAlert('batt_low')) {
      alerts.push({
        id: 'batt_low',
        severity: 'warning',
        category: 'ELECTRICAL',
        title: 'Vehicle voltage below expected range',
        message: `Battery at ${v.toFixed(1)}V. Normal running voltage is 13.5–14.5V. Monitor alternator output.`,
        value: v,
        threshold: THRESHOLDS.battery_voltage_low,
        unit: 'V',
        timestamp: ts,
      });
      markAlerted('batt_low');
    } else if (v >= THRESHOLDS.battery_voltage_high && canAlert('batt_high')) {
      alerts.push({
        id: 'batt_high',
        severity: 'caution',
        category: 'ELECTRICAL',
        title: 'Vehicle voltage above normal range',
        message: `Battery at ${v.toFixed(1)}V. Possible voltage regulator issue. Normal is 13.5–14.5V.`,
        value: v,
        threshold: THRESHOLDS.battery_voltage_high,
        unit: 'V',
        timestamp: ts,
      });
      markAlerted('batt_high');
    }
  }

  // ── Engine Load ────────────────────────────────────────
  if (telemetry.engine_load != null) {
    const l = telemetry.engine_load;
    if (l >= THRESHOLDS.engine_load_critical && canAlert('load_critical')) {
      alerts.push({
        id: 'load_critical',
        severity: 'warning',
        category: 'ENGINE',
        title: 'Engine load at maximum',
        message: `Engine load at ${Math.round(l)}%. Reduce speed or downshift on sustained climbs.`,
        value: l,
        threshold: THRESHOLDS.engine_load_critical,
        unit: '%',
        timestamp: ts,
      });
      markAlerted('load_critical');
    } else if (l >= THRESHOLDS.engine_load_sustained && canAlert('load_sustained')) {
      alerts.push({
        id: 'load_sustained',
        severity: 'caution',
        category: 'ENGINE',
        title: 'Engine load high on sustained climb',
        message: `Engine load at ${Math.round(l)}%. Monitor temperatures during extended high-load operation.`,
        value: l,
        threshold: THRESHOLDS.engine_load_sustained,
        unit: '%',
        timestamp: ts,
      });
      markAlerted('load_sustained');
    }
  }

  // ── Intake Air Temperature ─────────────────────────────
  if (telemetry.intake_temp != null) {
    const t = telemetry.intake_temp;
    if (t >= THRESHOLDS.intake_temp_high && canAlert('intake_high')) {
      alerts.push({
        id: 'intake_high',
        severity: 'caution',
        category: 'ENGINE',
        title: 'Intake air temperature elevated',
        message: `Intake air at ${Math.round(t)}°F. High intake temps reduce engine efficiency. Consider stopping in shade.`,
        value: t,
        threshold: THRESHOLDS.intake_temp_high,
        unit: '°F',
        timestamp: ts,
      });
      markAlerted('intake_high');
    }
  }

  return alerts;
}

/**
 * Get current threshold configuration (for display in settings).
 */
export function getOBDThresholds() {
  return { ...THRESHOLDS };
}

/**
 * Clear all alert cooldowns (e.g., on new expedition start).
 */
export function resetAlertCooldowns(): void {
  alertCooldowns.clear();
}

/**
 * Get the severity color for an alert.
 */
export function getAlertSeverityColor(severity: OBDAlertSeverity): string {
  switch (severity) {
    case 'critical': return '#EF5350';
    case 'warning': return '#FFB300';
    case 'caution': return '#FFB74D';
    case 'info': return '#4FC3F7';
    default: return '#78909C';
  }
}

/**
 * Get the severity icon for an alert.
 */
export function getAlertSeverityIcon(severity: OBDAlertSeverity): string {
  switch (severity) {
    case 'critical': return 'alert-circle';
    case 'warning': return 'warning-outline';
    case 'caution': return 'information-circle-outline';
    case 'info': return 'information-outline';
    default: return 'help-circle-outline';
  }
}



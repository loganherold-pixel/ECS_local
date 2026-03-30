/**
 * ECS Safe Defaults & Defensive Validation
 * Phase 10: Stability + Crash Protection Layer
 *
 * Provides:
 *   - Safe numeric operations (NaN/Infinity guards)
 *   - Default vehicle configuration values
 *   - Vehicle config completeness validation
 *   - Safe container weight calculations
 *   - GPX import error wrapping
 *   - GPS signal fallback helpers
 *   - Attitude monitor data guards
 */

import { ecsLog } from './ecsLogger';

// ═══════════════════════════════════════════════════════════
// SAFE NUMERIC OPERATIONS
// ═══════════════════════════════════════════════════════════

/** Return a safe number, defaulting to fallback if NaN/Infinity/undefined/null */
export function safeNum(value: any, fallback: number = 0): number {
  if (value == null) return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    ecsLog.warn('WEIGHT', `Invalid numeric value detected: ${value}, using fallback: ${fallback}`);
    return fallback;
  }
  return n;
}

/** Clamp a number between min and max, with NaN guard */
export function safeClamp(value: any, min: number, max: number, fallback?: number): number {
  const n = safeNum(value, fallback ?? min);
  return Math.max(min, Math.min(max, n));
}

/** Safe division — returns fallback if divisor is 0, NaN, or Infinity */
export function safeDivide(numerator: number, denominator: number, fallback: number = 0): number {
  const n = safeNum(numerator, 0);
  const d = safeNum(denominator, 0);
  if (d === 0) return fallback;
  const result = n / d;
  return Number.isFinite(result) ? result : fallback;
}

/** Safe multiplication — returns 0 if any operand is NaN/Infinity */
export function safeMultiply(...values: any[]): number {
  let result = 1;
  for (const v of values) {
    const n = safeNum(v, 0);
    if (n === 0) return 0;
    result *= n;
  }
  return Number.isFinite(result) ? result : 0;
}

/** Safe sum — skips NaN/Infinity values */
export function safeSum(...values: any[]): number {
  let total = 0;
  for (const v of values) {
    total += safeNum(v, 0);
  }
  return Number.isFinite(total) ? total : 0;
}

/** Safe percentage — returns 0-100, guards against NaN */
export function safePercent(value: number, total: number, fallback: number = 0): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) return fallback;
  const pct = (value / total) * 100;
  return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : fallback;
}

// ═══════════════════════════════════════════════════════════
// VEHICLE CONFIGURATION DEFAULTS
// ═══════════════════════════════════════════════════════════

export interface SafeVehicleDefaults {
  base_weight_lb: number;
  gvwr_lb: number;
  fuel_tank_capacity_gal: number;
  fuel_type: 'diesel' | 'gas';
  water_capacity_gal: number;
  power_capacity_wh: number;
}

/** Default vehicle values when configuration is incomplete */
export const VEHICLE_DEFAULTS: SafeVehicleDefaults = {
  base_weight_lb: 0,
  gvwr_lb: 0,
  fuel_tank_capacity_gal: 0,
  fuel_type: 'diesel',
  water_capacity_gal: 0,
  power_capacity_wh: 0,
};

/** Check if vehicle configuration has minimum required data */
export function isVehicleConfigComplete(config: {
  base_weight_lb?: number;
  gvwr_lb?: number;
}): boolean {
  return (
    (config.base_weight_lb ?? 0) > 0 &&
    (config.gvwr_lb ?? 0) > 0
  );
}

/** Check if vehicle configuration has any data at all */
export function hasAnyVehicleConfig(config: Record<string, any> | null | undefined): boolean {
  if (!config) return false;
  return Object.values(config).some(v => v != null && v !== '' && v !== 0);
}

/** Get safe vehicle weight, defaulting to 0 if invalid */
export function safeVehicleWeight(weight: any): number {
  const w = safeNum(weight, 0);
  if (w < 0) {
    ecsLog.warn('WEIGHT', `Negative vehicle weight detected: ${weight}, defaulting to 0`);
    return 0;
  }
  // Sanity check: no vehicle weighs more than 100,000 lbs
  if (w > 100000) {
    ecsLog.warn('WEIGHT', `Unrealistic vehicle weight: ${weight} lb, capping at 100000`);
    return 100000;
  }
  return w;
}

// ═══════════════════════════════════════════════════════════
// CONTAINER WEIGHT SAFETY
// ═══════════════════════════════════════════════════════════

/** Safe container weight calculation — defaults to 0 on failure */
export function safeContainerWeight(items: Array<{ weight_lbs?: number; qty?: number; deleted_at?: string | null }>): number {
  try {
    if (!Array.isArray(items)) {
      ecsLog.warn('WEIGHT', 'Container items is not an array, defaulting to 0');
      return 0;
    }
    let total = 0;
    for (const item of items) {
      if (item.deleted_at) continue;
      const weight = safeNum(item.weight_lbs, 0);
      const qty = safeNum(item.qty, 1);
      total += weight * qty;
    }
    return Number.isFinite(total) ? Math.max(0, total) : 0;
  } catch (err) {
    ecsLog.error('WEIGHT', 'Container weight calculation failed', err);
    return 0;
  }
}

/** Safe total vehicle weight — never returns NaN */
export function safeTotalVehicleWeight(
  baseWeight: number,
  hardwareAdditions: number,
  consumablesWeight: number,
  itemsWeight: number,
): number {
  const base = safeNum(baseWeight, 0);
  const hw = safeNum(hardwareAdditions, 0);
  const cons = safeNum(consumablesWeight, 0);
  const items = safeNum(itemsWeight, 0);
  const total = base + hw + cons + items;
  if (!Number.isFinite(total)) {
    ecsLog.error('WEIGHT', 'Total vehicle weight calculation returned non-finite value', null, {
      baseWeight, hardwareAdditions, consumablesWeight, itemsWeight, total,
    });
    return safeNum(base + hw, 0); // Fallback to base + hardware only
  }
  return Math.max(0, total);
}

// ═══════════════════════════════════════════════════════════
// ATTITUDE MONITOR SAFETY
// ═══════════════════════════════════════════════════════════

export interface SafeAttitudeData {
  rollDeg: number;
  pitchDeg: number;
  tiltDeg: number;
  isNeutral: boolean;
  sensorStatus: string;
}

/** Get safe attitude data, returning neutral values if data is missing/invalid */
export function safeAttitudeData(
  rollDeg?: number | null,
  pitchDeg?: number | null,
  sensorStatus?: string | null,
): SafeAttitudeData {
  const roll = safeClamp(rollDeg, -90, 90, 0);
  const pitch = safeClamp(pitchDeg, -90, 90, 0);
  const tilt = Math.sqrt(roll * roll + pitch * pitch);
  const isNeutral = Math.abs(roll) < 0.5 && Math.abs(pitch) < 0.5;
  const status = sensorStatus || 'OFFLINE';

  return {
    rollDeg: roll,
    pitchDeg: pitch,
    tiltDeg: Number.isFinite(tilt) ? tilt : 0,
    isNeutral,
    sensorStatus: status,
  };
}

// ═══════════════════════════════════════════════════════════
// GPS SIGNAL SAFETY
// ═══════════════════════════════════════════════════════════

export interface SafeGPSState {
  hasSignal: boolean;
  latitude: number | null;
  longitude: number | null;
  statusMessage: string;
}

/** Get safe GPS state with appropriate fallback messages */
export function safeGPSState(
  hasFix?: boolean,
  latitude?: number | null,
  longitude?: number | null,
  gpsStatus?: string,
): SafeGPSState {
  if (!hasFix || latitude == null || longitude == null) {
    return {
      hasSignal: false,
      latitude: null,
      longitude: null,
      statusMessage: gpsStatus === 'DENIED'
        ? 'Location permission denied'
        : gpsStatus === 'UNAVAILABLE'
          ? 'GPS not available'
          : 'Waiting for GPS signal',
    };
  }

  // Validate coordinates
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    ecsLog.warn('GPS', 'Invalid GPS coordinates received', { latitude, longitude });
    return {
      hasSignal: false,
      latitude: null,
      longitude: null,
      statusMessage: 'Invalid GPS data',
    };
  }

  // Sanity check coordinate ranges
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    ecsLog.warn('GPS', 'GPS coordinates out of range', { latitude, longitude });
    return {
      hasSignal: false,
      latitude: null,
      longitude: null,
      statusMessage: 'GPS calibrating',
    };
  }

  return {
    hasSignal: true,
    latitude,
    longitude,
    statusMessage: 'Tracking',
  };
}

// ═══════════════════════════════════════════════════════════
// GPX IMPORT SAFETY
// ═══════════════════════════════════════════════════════════

export interface SafeGPXResult {
  success: boolean;
  errorMessage: string | null;
}

/** Wrap GPX parsing in a safe try-catch with user-friendly error messages */
export function safeParseGPX(
  parseFn: () => any,
  fileName?: string,
): { result: any | null; error: string | null } {
  try {
    const result = parseFn();
    return { result, error: null };
  } catch (err: any) {
    const message = err?.message || 'Unknown error';
    ecsLog.error('GPX', `Failed to parse route file: ${fileName || 'unknown'}`, err);

    // Map technical errors to user-friendly messages
    if (message.includes('INVALID INPUT') || message.includes('INVALID GPX') || message.includes('INVALID KML')) {
      return { result: null, error: 'Route file could not be loaded' };
    }
    if (message.includes('no waypoints') || message.includes('no Placemarks') || message.includes('no geometry')) {
      return { result: null, error: 'Route file contains no geographic data' };
    }
    if (message.includes('KMZ')) {
      return { result: null, error: 'KMZ files must be extracted first. Export as .kml instead.' };
    }
    if (message.includes('Unrecognized file format')) {
      return { result: null, error: 'Unsupported file format. Use .gpx or .kml files.' };
    }

    return { result: null, error: 'Route file could not be loaded' };
  }
}

// ═══════════════════════════════════════════════════════════
// DISCOVERY EMPTY STATE SAFETY
// ═══════════════════════════════════════════════════════════

/** Check if discovery results are valid and non-empty */
export function hasDiscoveryResults(results: any[] | null | undefined): boolean {
  return Array.isArray(results) && results.length > 0;
}

/** Get discovery fallback message */
export function getDiscoveryFallbackMessage(searchQuery?: string): string {
  if (searchQuery && searchQuery.trim().length > 0) {
    return `No trails found matching "${searchQuery}"`;
  }
  return 'No trails found in this area. Try expanding your search radius.';
}

// ═══════════════════════════════════════════════════════════
// TELEMETRY SAFETY
// ═══════════════════════════════════════════════════════════

/** Safe telemetry value — returns null if invalid */
export function safeTelemetryValue(value: any): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Check if telemetry data is stale (older than maxAgeMs) */
export function isTelemetryStale(lastUpdate: string | null | undefined, maxAgeMs: number = 300000): boolean {
  if (!lastUpdate) return true;
  try {
    const updateTime = new Date(lastUpdate).getTime();
    if (!Number.isFinite(updateTime)) return true;
    return Date.now() - updateTime > maxAgeMs;
  } catch {
    return true;
  }
}


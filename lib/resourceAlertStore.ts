/**
 * Resource Alert Store
 *
 * Monitors vehicle resource levels and emits low-resource warnings:
 *   - Water: triggers when current_water_gal < 25% of water_capacity_gal
 *   - Fuel:  triggers when current_fuel_percent < 20%
 *
 * Features:
 *   - Reactive: subscribers notified on state changes
 *   - Dismissable: alerts can be snoozed for a configurable duration
 *   - Persistent snooze: dismissed alerts stay dismissed for the snooze window
 *   - Severity levels: 'warning' (threshold breached) and 'critical' (< 10%)
 *   - Vehicle-scoped: alerts are tracked per vehicle ID
 */
import { Platform } from 'react-native';

// ── Thresholds ─────────────────────────────────────────────────
export const WATER_WARNING_PCT = 0.25;   // 25% of capacity
export const WATER_CRITICAL_PCT = 0.10;  // 10% of capacity
export const FUEL_WARNING_PCT = 20;      // 20% fuel
export const FUEL_CRITICAL_PCT = 10;     // 10% fuel

// ── Snooze duration (ms) ───────────────────────────────────────
const SNOOZE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// ── Alert Types ────────────────────────────────────────────────
export type ResourceAlertType = 'water' | 'fuel';
export type ResourceAlertSeverity = 'warning' | 'critical';

export interface ResourceAlert {
  type: ResourceAlertType;
  severity: ResourceAlertSeverity;
  /** Current value (gal for water, percent for fuel) */
  currentValue: number;
  /** Threshold value that was breached */
  thresholdValue: number;
  /** Capacity value (gal for water, 100 for fuel) */
  capacityValue: number;
  /** Percentage remaining (0–100) */
  percentRemaining: number;
  /** Human-readable message */
  message: string;
  /** Human-readable short label */
  label: string;
  /** Timestamp when alert was first detected */
  detectedAt: number;
}

export interface ResourceAlertState {
  vehicleId: string | null;
  alerts: ResourceAlert[];
  /** Whether any alerts are active (not snoozed) */
  hasActiveAlerts: boolean;
}

// ── Snooze tracking ────────────────────────────────────────────
interface SnoozeEntry {
  vehicleId: string;
  alertType: ResourceAlertType;
  snoozedUntil: number; // epoch ms
}

// ── localStorage helpers ───────────────────────────────────────
const SNOOZE_KEY = 'ecs_resource_alert_snooze';

function loadSnoozeEntries(): SnoozeEntry[] {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(SNOOZE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return [];
}

function saveSnoozeEntries(entries: SnoozeEntry[]): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(SNOOZE_KEY, JSON.stringify(entries));
    }
  } catch {}
}

// ── Store State ────────────────────────────────────────────────
type Listener = (state: ResourceAlertState) => void;
const listeners = new Set<Listener>();
let currentState: ResourceAlertState = {
  vehicleId: null,
  alerts: [],
  hasActiveAlerts: false,
};
let snoozeEntries: SnoozeEntry[] = loadSnoozeEntries();

function notify() {
  listeners.forEach(fn => {
    try { fn(currentState); } catch {}
  });
}

function isSnoozed(vehicleId: string, alertType: ResourceAlertType): boolean {
  const now = Date.now();
  // Clean expired entries
  snoozeEntries = snoozeEntries.filter(e => e.snoozedUntil > now);
  return snoozeEntries.some(
    e => e.vehicleId === vehicleId && e.alertType === alertType && e.snoozedUntil > now
  );
}

// ── Public API ─────────────────────────────────────────────────
export const resourceAlertStore = {

  /**
   * Evaluate resource levels for a vehicle and update alert state.
   * Call this whenever vehicle data changes (on fetch, on update, on poll).
   */
  evaluate(vehicle: {
    id: string;
    water_capacity_gal?: number | null;
    current_water_gal?: number | null;
    current_fuel_percent?: number | null;
  } | null): ResourceAlertState {
    if (!vehicle || !vehicle.id) {
      currentState = { vehicleId: null, alerts: [], hasActiveAlerts: false };
      notify();
      return currentState;
    }

    const alerts: ResourceAlert[] = [];
    const vId = vehicle.id;

    // ── Water Alert ──────────────────────────────────────
    const waterCap = vehicle.water_capacity_gal != null ? Number(vehicle.water_capacity_gal) : null;
    const waterCur = vehicle.current_water_gal != null ? Number(vehicle.current_water_gal) : null;

    if (waterCap && waterCap > 0 && waterCur != null && !isSnoozed(vId, 'water')) {
      const waterPct = waterCur / waterCap;
      const waterPctDisplay = Math.round(waterPct * 100);

      if (waterPct < WATER_CRITICAL_PCT) {
        alerts.push({
          type: 'water',
          severity: 'critical',
          currentValue: waterCur,
          thresholdValue: waterCap * WATER_CRITICAL_PCT,
          capacityValue: waterCap,
          percentRemaining: waterPctDisplay,
          message: `Critical: Water at ${waterPctDisplay}% (${waterCur.toFixed(1)} of ${waterCap.toFixed(1)} gal)`,
          label: `WATER CRITICAL — ${waterPctDisplay}%`,
          detectedAt: Date.now(),
        });
      } else if (waterPct < WATER_WARNING_PCT) {
        alerts.push({
          type: 'water',
          severity: 'warning',
          currentValue: waterCur,
          thresholdValue: waterCap * WATER_WARNING_PCT,
          capacityValue: waterCap,
          percentRemaining: waterPctDisplay,
          message: `Low water: ${waterPctDisplay}% remaining (${waterCur.toFixed(1)} of ${waterCap.toFixed(1)} gal)`,
          label: `LOW WATER — ${waterPctDisplay}%`,
          detectedAt: Date.now(),
        });
      }
    }

    // ── Fuel Alert ───────────────────────────────────────
    const fuelPct = vehicle.current_fuel_percent != null ? Number(vehicle.current_fuel_percent) : null;

    if (fuelPct != null && !isSnoozed(vId, 'fuel')) {
      if (fuelPct < FUEL_CRITICAL_PCT) {
        alerts.push({
          type: 'fuel',
          severity: 'critical',
          currentValue: fuelPct,
          thresholdValue: FUEL_CRITICAL_PCT,
          capacityValue: 100,
          percentRemaining: Math.round(fuelPct),
          message: `Critical: Fuel at ${Math.round(fuelPct)}%`,
          label: `FUEL CRITICAL — ${Math.round(fuelPct)}%`,
          detectedAt: Date.now(),
        });
      } else if (fuelPct < FUEL_WARNING_PCT) {
        alerts.push({
          type: 'fuel',
          severity: 'warning',
          currentValue: fuelPct,
          thresholdValue: FUEL_WARNING_PCT,
          capacityValue: 100,
          percentRemaining: Math.round(fuelPct),
          message: `Low fuel: ${Math.round(fuelPct)}% remaining`,
          label: `LOW FUEL — ${Math.round(fuelPct)}%`,
          detectedAt: Date.now(),
        });
      }
    }

    currentState = {
      vehicleId: vId,
      alerts,
      hasActiveAlerts: alerts.length > 0,
    };

    notify();
    return currentState;
  },

  /**
   * Dismiss (snooze) a specific alert type for the current vehicle.
   * The alert won't reappear for SNOOZE_DURATION_MS (30 min).
   */
  dismiss(vehicleId: string, alertType: ResourceAlertType): void {
    const now = Date.now();
    // Remove any existing snooze for this vehicle+type
    snoozeEntries = snoozeEntries.filter(
      e => !(e.vehicleId === vehicleId && e.alertType === alertType)
    );
    // Add new snooze
    snoozeEntries.push({
      vehicleId,
      alertType,
      snoozedUntil: now + SNOOZE_DURATION_MS,
    });
    saveSnoozeEntries(snoozeEntries);

    // Re-evaluate to remove the dismissed alert from state
    // (We need the vehicle data, but we can just filter the current alerts)
    currentState = {
      ...currentState,
      alerts: currentState.alerts.filter(a => a.type !== alertType),
      hasActiveAlerts: currentState.alerts.filter(a => a.type !== alertType).length > 0,
    };
    notify();
  },

  /**
   * Clear all snooze entries (e.g., on vehicle change or manual reset).
   */
  clearAllSnoozes(): void {
    snoozeEntries = [];
    saveSnoozeEntries([]);
  },

  /**
   * Get the current alert state without triggering evaluation.
   */
  getState(): ResourceAlertState {
    return currentState;
  },

  /**
   * Subscribe to alert state changes.
   * Returns an unsubscribe function.
   */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};


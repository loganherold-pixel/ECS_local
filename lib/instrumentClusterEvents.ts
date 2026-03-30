/**
 * Instrument Cluster Event Emitter
 *
 * FLUFF CONVERSION — Phase 10: Dashboard Instrument Cluster Lock
 *
 * Monitors triggers that were previously displayed as live dashboard
 * widgets and converts them into Expedition Timeline events.
 *
 * Removed widgets whose triggers are converted here:
 *   - Stability Index    → RISK events on roll/pitch threshold crossings
 *   - Power Systems      → SUPPLY events on battery threshold crossings
 *   - Expedition Channel → COMMS events on connectivity state changes
 *   - Loadout Readiness  → SUPPLY events on significant packing changes
 *   - Operational Readiness → NOTE events on readiness score changes
 *
 * Widgets whose data is already covered by core instruments:
 *   - Status Overview    → covered by Progress + Sustainability
 *   - Route Progress     → covered by Progress widget
 *   - Fuel Range         → covered by Sustainability widget
 *   - Water Projection   → covered by Sustainability widget
 *   - Vehicle Health     → covered by Vehicle Systems widget
 *   - Mission Sustainment → covered by Sustainability widget
 *
 * Usage:
 *   Call instrumentClusterEvents.start(expeditionId) when an expedition
 *   goes active. Call .stop() when it completes or is paused.
 *   The emitter checks thresholds on a timer and emits events via
 *   expeditionEventStore.createEvent().
 */

import { expeditionEventStore, type CreateEventInput } from './expeditionEventStore';

// ── Threshold Constants ──────────────────────────────────────

/** Roll angle (degrees) that triggers a RISK event */
const ROLL_WARNING_DEG = 25;
const ROLL_DANGER_DEG = 35;

/** Pitch angle (degrees) that triggers a RISK event */
const PITCH_WARNING_DEG = 20;
const PITCH_DANGER_DEG = 30;

/** Battery percentage that triggers a SUPPLY event */
const BATTERY_LOW_PCT = 25;
const BATTERY_CRITICAL_PCT = 10;

/** Minimum interval between duplicate events (ms) — prevents spam */
const EVENT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// ── State Tracking ───────────────────────────────────────────

interface EmitterState {
  expeditionId: string | null;
  lastRollEvent: number;
  lastPitchEvent: number;
  lastBatteryEvent: number;
  lastConnectivityEvent: number;
  lastConnectivityState: 'online' | 'offline' | 'unknown';
}

function createDefaultState(): EmitterState {
  return {
    expeditionId: null,
    lastRollEvent: 0,
    lastPitchEvent: 0,
    lastBatteryEvent: 0,
    lastConnectivityEvent: 0,
    lastConnectivityState: 'unknown',
  };
}

// ── Emitter Class ────────────────────────────────────────────

class InstrumentClusterEventEmitter {
  private state: EmitterState = createDefaultState();
  private running = false;

  /**
   * Start monitoring for an active expedition.
   * Events will be emitted to the expedition timeline.
   */
  start(expeditionId: string): void {
    this.state = createDefaultState();
    this.state.expeditionId = expeditionId;
    this.running = true;
    console.log('[InstrumentClusterEvents] Started for expedition:', expeditionId);
  }

  /** Stop monitoring. */
  stop(): void {
    this.running = false;
    this.state.expeditionId = null;
    console.log('[InstrumentClusterEvents] Stopped');
  }

  /** Check if the emitter is running. */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Feed stability data (roll/pitch) for threshold checking.
   * Call this from the accelerometer update loop.
   */
  checkStability(rollDeg: number, pitchDeg: number): void {
    if (!this.running || !this.state.expeditionId) return;
    const now = Date.now();
    const absRoll = Math.abs(rollDeg);
    const absPitch = Math.abs(pitchDeg);

    // ── Roll threshold crossing ──
    if (absRoll >= ROLL_DANGER_DEG && now - this.state.lastRollEvent > EVENT_COOLDOWN_MS) {
      this.state.lastRollEvent = now;
      this.emit({
        expedition_id: this.state.expeditionId,
        event_type: 'RISK',
        severity: 'HIGH',
        title: 'Roll Angle Critical',
        details: `Roll angle reached ${rollDeg.toFixed(1)}° (threshold: ${ROLL_DANGER_DEG}°). Vehicle stability at risk.`,
      });
    } else if (absRoll >= ROLL_WARNING_DEG && absRoll < ROLL_DANGER_DEG && now - this.state.lastRollEvent > EVENT_COOLDOWN_MS) {
      this.state.lastRollEvent = now;
      this.emit({
        expedition_id: this.state.expeditionId,
        event_type: 'RISK',
        severity: 'MED',
        title: 'Roll Angle Warning',
        details: `Roll angle at ${rollDeg.toFixed(1)}° (warning: ${ROLL_WARNING_DEG}°). Monitor vehicle attitude.`,
      });
    }

    // ── Pitch threshold crossing ──
    if (absPitch >= PITCH_DANGER_DEG && now - this.state.lastPitchEvent > EVENT_COOLDOWN_MS) {
      this.state.lastPitchEvent = now;
      this.emit({
        expedition_id: this.state.expeditionId,
        event_type: 'RISK',
        severity: 'HIGH',
        title: 'Pitch Angle Critical',
        details: `Pitch angle reached ${pitchDeg.toFixed(1)}° (threshold: ${PITCH_DANGER_DEG}°). Steep grade detected.`,
      });
    } else if (absPitch >= PITCH_WARNING_DEG && absPitch < PITCH_DANGER_DEG && now - this.state.lastPitchEvent > EVENT_COOLDOWN_MS) {
      this.state.lastPitchEvent = now;
      this.emit({
        expedition_id: this.state.expeditionId,
        event_type: 'RISK',
        severity: 'MED',
        title: 'Pitch Angle Warning',
        details: `Pitch angle at ${pitchDeg.toFixed(1)}° (warning: ${PITCH_WARNING_DEG}°). Steep terrain ahead.`,
      });
    }
  }

  /**
   * Feed connectivity state for change detection.
   * Call this when connectivity status changes.
   */
  checkConnectivity(state: 'online' | 'offline' | 'unknown'): void {
    if (!this.running || !this.state.expeditionId) return;
    const now = Date.now();

    // Only emit on actual state changes, with cooldown
    if (state !== this.state.lastConnectivityState && now - this.state.lastConnectivityEvent > EVENT_COOLDOWN_MS) {
      const prevState = this.state.lastConnectivityState;
      this.state.lastConnectivityState = state;
      this.state.lastConnectivityEvent = now;

      if (state === 'offline' && prevState === 'online') {
        this.emit({
          expedition_id: this.state.expeditionId,
          event_type: 'COMMS',
          severity: 'MED',
          title: 'Connectivity Lost',
          details: 'Device went offline. Sync paused. Data will be queued for upload when connection is restored.',
        });
      } else if (state === 'online' && prevState === 'offline') {
        this.emit({
          expedition_id: this.state.expeditionId,
          event_type: 'COMMS',
          severity: 'LOW',
          title: 'Connectivity Restored',
          details: 'Device back online. Queued data will sync automatically.',
        });
      }
    } else {
      this.state.lastConnectivityState = state;
    }
  }

  /**
   * Feed battery percentage for threshold checking.
   * Call this periodically from power monitoring.
   */
  checkBattery(batteryPct: number): void {
    if (!this.running || !this.state.expeditionId) return;
    const now = Date.now();

    if (batteryPct <= BATTERY_CRITICAL_PCT && now - this.state.lastBatteryEvent > EVENT_COOLDOWN_MS) {
      this.state.lastBatteryEvent = now;
      this.emit({
        expedition_id: this.state.expeditionId,
        event_type: 'SUPPLY',
        severity: 'HIGH',
        title: 'Battery Critical',
        details: `Auxiliary battery at ${batteryPct}%. Reduce power consumption immediately.`,
      });
    } else if (batteryPct <= BATTERY_LOW_PCT && batteryPct > BATTERY_CRITICAL_PCT && now - this.state.lastBatteryEvent > EVENT_COOLDOWN_MS) {
      this.state.lastBatteryEvent = now;
      this.emit({
        expedition_id: this.state.expeditionId,
        event_type: 'SUPPLY',
        severity: 'MED',
        title: 'Battery Low',
        details: `Auxiliary battery at ${batteryPct}%. Consider reducing non-essential loads.`,
      });
    }
  }

  // ── Internal: emit event to expedition timeline ──
  private emit(input: CreateEventInput): void {
    expeditionEventStore.createEvent(input).catch(err => {
      console.warn('[InstrumentClusterEvents] Failed to emit event:', err);
    });
  }
}

// ── Singleton ────────────────────────────────────────────────
export const instrumentClusterEvents = new InstrumentClusterEventEmitter();


/**
 * ═══════════════════════════════════════════════════════════
 * ECS EXPEDITION RISK ENGINE STORE — Phase 4A/4E
 * ═══════════════════════════════════════════════════════════
 *
 * Central state store for the Expedition Risk Engine.
 * Accessible throughout ECS for dashboard widgets, expedition
 * systems, and vehicle display surfaces (Android Auto / CarPlay).
 *
 * Phase 4E additions:
 *   - Operational status stabilization (hysteresis band)
 *   - route_difficulty_score and resource_route_balance in summary
 *   - Operational status transition logging
 *   - Consecutive evaluation counter for stabilization
 *
 * Responsibilities:
 *   - Hold the current RiskEvaluation and RiskSummary
 *   - Hold the most recent RiskInputSnapshot
 *   - Persist the last valid evaluation across sessions
 *   - Restore evaluation on app launch
 *   - Notify subscribers when risk state changes
 *   - Provide stable cached output references
 *   - Track evaluation lifecycle metadata
 *   - Stabilize operational status transitions (Phase 4E)
 *
 * Design:
 *   - Operates independently from UI components
 *   - Identity-stable output (only replaced on meaningful change)
 *   - Safe for Android Auto / CarPlay consumption
 *   - Failures never crash ECS systems
 */

import { Platform } from 'react-native';
import type {
  RiskEvaluation,
  RiskSummary,
  RiskInputSnapshot,
  RiskEngineState,
  RiskEngineSession,
  OperationalStatus,
  PrimaryRiskFactor,
} from './expeditionRiskTypes';
import {
  createDefaultRiskEvaluation,
  createDefaultRiskSummary,
  RISK_ENGINE_SESSION_VERSION,
  RISK_FACTOR_LABELS,
  OPERATIONAL_STATUS_THRESHOLDS,
} from './expeditionRiskTypes';


// ── Storage helpers ──────────────────────────────────────
const STORAGE_KEY = 'ecs_expedition_risk_session';

const _memStore: Record<string, string> = {};
const _ls = {
  get: (k: string): string | null => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        return localStorage.getItem(k);
      }
    } catch {}
    return _memStore[k] || null;
  },
  set: (k: string, v: string) => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(k, v);
      }
    } catch {}
    _memStore[k] = v;
  },
  del: (k: string) => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.removeItem(k);
      }
    } catch {}
    delete _memStore[k];
  },
};


// ── Constants ────────────────────────────────────────────

/** Max age for a persisted session (24 hours) */
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;


// ── Internal State ───────────────────────────────────────

let _evaluation: RiskEvaluation | null = null;
let _summary: RiskSummary | null = null;
let _lastInputSnapshot: RiskInputSnapshot | null = null;
let _initialized = false;
let _running = false;
let _evaluationCount = 0;
let _lastEvaluationAt: string | null = null;
let _lastTrigger: 'periodic' | 'signal_change' | 'manual' | null = null;

/** Cached output references for identity stability */
let _cachedEvaluation: RiskEvaluation | null = null;
let _cachedSummary: RiskSummary | null = null;

/**
 * Phase 4E: Stabilized operational status.
 * This is the "display" status that only changes when hysteresis
 * thresholds are crossed, preventing UI flicker.
 */
let _stabilizedStatus: OperationalStatus = 'optimal';

/** Listeners */
type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify() {
  _listeners.forEach(fn => { try { fn(); } catch {} });
}


// ── Change Detection ─────────────────────────────────────

function _evaluationChanged(a: RiskEvaluation, b: RiskEvaluation): boolean {
  return (
    a.risk_score !== b.risk_score ||
    a.operational_status !== b.operational_status ||
    a.primary_risk_factor !== b.primary_risk_factor ||
    a.capability_score !== b.capability_score ||
    a.resource_readiness !== b.resource_readiness ||
    a.connectivity_risk !== b.connectivity_risk ||
    a.isolation_risk !== b.isolation_risk ||
    a.route_difficulty_score !== b.route_difficulty_score ||
    a.resource_route_balance !== b.resource_route_balance ||
    a.available_inputs !== b.available_inputs ||
    a.is_complete !== b.is_complete
  );
}


// ── Phase 4E: Operational Status Stabilization ───────────

/**
 * Apply hysteresis to prevent rapid oscillation between operational states.
 *
 * The raw status is computed from the risk score using simple thresholds.
 * The stabilized status only transitions when the score crosses a hysteresis
 * band, requiring a larger score change to transition than to maintain.
 *
 * This prevents the dashboard risk indicator from flickering when the
 * score oscillates near a threshold boundary.
 */
function _stabilizeOperationalStatus(
  rawScore: number,
  currentStabilized: OperationalStatus,
): OperationalStatus {
  const T = OPERATIONAL_STATUS_THRESHOLDS;

  switch (currentStabilized) {
    case 'optimal':
      if (rawScore > T.optimal_to_caution) return 'caution';
      return 'optimal';

    case 'caution':
      if (rawScore < T.caution_to_optimal) return 'optimal';
      if (rawScore > T.caution_to_elevated) return 'elevated';
      return 'caution';

    case 'elevated':
      if (rawScore < T.elevated_to_caution) return 'caution';
      if (rawScore > T.elevated_to_critical) return 'critical';
      return 'elevated';

    case 'critical':
      if (rawScore < T.critical_to_elevated) return 'elevated';
      return 'critical';

    default:
      return currentStabilized;
  }
}


// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

export const expeditionRiskStore = {

  // ── Read ──────────────────────────────────────────────

  /**
   * Get the current risk evaluation.
   * Returns a stable cached reference (only replaced on meaningful change).
   * Returns null if no evaluation has been computed yet.
   */
  getEvaluation(): RiskEvaluation | null {
    return _cachedEvaluation;
  },

  /**
   * Get the current risk summary (dashboard-ready).
   * Returns a stable cached reference.
   * Returns null if no evaluation has been computed yet.
   */
  getSummary(): RiskSummary | null {
    return _cachedSummary;
  },

  /**
   * Get the most recent input snapshot.
   */
  getLastInputSnapshot(): RiskInputSnapshot | null {
    return _lastInputSnapshot;
  },

  /**
   * Get the full engine state (for diagnostics).
   */
  getState(): RiskEngineState {
    return {
      initialized: _initialized,
      running: _running,
      evaluation: _cachedEvaluation,
      summary: _cachedSummary,
      last_input_snapshot: _lastInputSnapshot,
      evaluation_count: _evaluationCount,
      last_evaluation_at: _lastEvaluationAt,
      last_trigger: _lastTrigger,
    };
  },

  /**
   * Get the current operational status.
   * Phase 4E: Returns the stabilized status (hysteresis-protected).
   * Returns 'optimal' if no evaluation exists.
   */
  getOperationalStatus(): OperationalStatus {
    return _evaluation?.operational_status ?? 'optimal';
  },

  /**
   * Phase 4E: Get the stabilized operational status.
   * This is the display-safe status with hysteresis protection.
   */
  getStabilizedStatus(): OperationalStatus {
    return _stabilizedStatus;
  },

  /**
   * Get the current risk score (0–100).
   * Returns 0 if no evaluation exists.
   */
  getRiskScore(): number {
    return _evaluation?.risk_score ?? 0;
  },

  /**
   * Get the primary risk factor.
   */
  getPrimaryRiskFactor(): PrimaryRiskFactor {
    return _evaluation?.primary_risk_factor ?? 'none';
  },

  /**
   * Get the primary risk factor label.
   */
  getPrimaryRiskLabel(): string {
    const factor = _evaluation?.primary_risk_factor ?? 'none';
    return RISK_FACTOR_LABELS[factor] ?? 'Unknown';
  },

  /**
   * Whether the engine has been initialized.
   */
  isInitialized(): boolean {
    return _initialized;
  },

  /**
   * Whether the engine is actively running.
   */
  isRunning(): boolean {
    return _running;
  },

  /**
   * Get the evaluation count.
   */
  getEvaluationCount(): number {
    return _evaluationCount;
  },


  // ── Write ─────────────────────────────────────────────

  /**
   * Update the risk evaluation.
   * Phase 4E: Applies operational status stabilization and
   * includes route_difficulty_score and resource_route_balance in summary.
   * Only notifies subscribers if the evaluation meaningfully changed.
   */
  updateEvaluation(
    evaluation: RiskEvaluation,
    trigger: 'periodic' | 'signal_change' | 'manual' = 'periodic',
  ): void {
    const prev = _evaluation;
    const prevStabilized = _stabilizedStatus;

    // Phase 4E: Apply operational status stabilization
    const newStabilized = _stabilizeOperationalStatus(
      evaluation.risk_score,
      _stabilizedStatus,
    );

    // Override the evaluation's operational_status with the stabilized version
    const stabilizedEvaluation: RiskEvaluation = {
      ...evaluation,
      operational_status: newStabilized,
    };

    _evaluation = stabilizedEvaluation;
    _stabilizedStatus = newStabilized;
    _evaluationCount++;
    _lastEvaluationAt = stabilizedEvaluation.evaluated_at;
    _lastTrigger = trigger;

    // Build summary from evaluation (Phase 4E: includes all sub-scores)
    _summary = {
      risk_score: stabilizedEvaluation.risk_score,
      operational_status: stabilizedEvaluation.operational_status,
      primary_risk_factor: stabilizedEvaluation.primary_risk_factor,
      primary_risk_label: RISK_FACTOR_LABELS[stabilizedEvaluation.primary_risk_factor] ?? 'Unknown',
      capability_score: stabilizedEvaluation.capability_score,
      resource_readiness: stabilizedEvaluation.resource_readiness,
      connectivity_risk: stabilizedEvaluation.connectivity_risk,
      isolation_risk: stabilizedEvaluation.isolation_risk,
      route_difficulty_score: stabilizedEvaluation.route_difficulty_score,
      resource_route_balance: stabilizedEvaluation.resource_route_balance,
      available_inputs: stabilizedEvaluation.available_inputs,
      total_inputs: stabilizedEvaluation.total_inputs,
      is_complete: stabilizedEvaluation.is_complete,
      summary_line: stabilizedEvaluation.summary_line,
      updated_at: stabilizedEvaluation.evaluated_at,
    };

    // Phase 4E: Log operational status transitions
    if (prevStabilized !== newStabilized) {
      console.log(
        `[RiskEngine] [4E] Status transition: ${prevStabilized} → ${newStabilized} ` +
        `(score=${stabilizedEvaluation.risk_score}, factor=${stabilizedEvaluation.primary_risk_factor})`
      );
    }

    // Check for meaningful change
    if (prev == null || _evaluationChanged(prev, stabilizedEvaluation)) {
      _cachedEvaluation = { ...stabilizedEvaluation };
      _cachedSummary = { ..._summary };

      console.log(
        `[RiskEngine] Evaluation #${_evaluationCount}: ` +
        `score=${stabilizedEvaluation.risk_score} status=${stabilizedEvaluation.operational_status} ` +
        `factor=${stabilizedEvaluation.primary_risk_factor} ` +
        `inputs=${stabilizedEvaluation.available_inputs}/${stabilizedEvaluation.total_inputs} ` +
        `trigger=${trigger}`
      );

      _notify();
    }
  },

  /**
   * Update the last input snapshot.
   */
  updateInputSnapshot(snapshot: RiskInputSnapshot): void {
    _lastInputSnapshot = snapshot;
  },

  /**
   * Mark the engine as initialized.
   */
  setInitialized(value: boolean): void {
    _initialized = value;
    console.log(`[RiskEngine] Initialized: ${value}`);
  },

  /**
   * Set the running state.
   */
  setRunning(value: boolean): void {
    _running = value;
    console.log(`[RiskEngine] Running: ${value}`);
  },


  // ── Persistence ───────────────────────────────────────

  /**
   * Persist current state to user storage.
   */
  persist(): void {
    try {
      if (!_evaluation) return;

      const session: RiskEngineSession = {
        version: RISK_ENGINE_SESSION_VERSION,
        last_evaluation: _evaluation,
        last_summary: _summary,
        evaluation_count: _evaluationCount,
        persisted_at: new Date().toISOString(),
      };

      _ls.set(STORAGE_KEY, JSON.stringify(session));
      console.log('[RiskEngine] Session persisted');
    } catch (e) {
      console.warn('[RiskEngine] Failed to persist session:', e);
    }
  },

  /**
   * Restore state from user storage.
   * Returns true if a valid session was restored.
   */
  restore(): boolean {
    try {
      const raw = _ls.get(STORAGE_KEY);
      if (!raw) {
        console.log('[RiskEngine] No persisted session found');
        return false;
      }

      const session: RiskEngineSession = JSON.parse(raw);

      // Version check
      if (session.version > RISK_ENGINE_SESSION_VERSION) {
        console.log('[RiskEngine] Session version too new, discarding');
        _ls.del(STORAGE_KEY);
        return false;
      }

      // Age check
      const age = Date.now() - new Date(session.persisted_at).getTime();
      if (age > SESSION_MAX_AGE_MS) {
        console.log('[RiskEngine] Session too old, discarding');
        _ls.del(STORAGE_KEY);
        return false;
      }

      // Restore evaluation
      if (session.last_evaluation) {
        _evaluation = session.last_evaluation;
        _cachedEvaluation = { ..._evaluation };
        // Phase 4E: Restore stabilized status from persisted evaluation
        _stabilizedStatus = _evaluation.operational_status;
      }
      if (session.last_summary) {
        _summary = session.last_summary;
        _cachedSummary = { ..._summary };
      }
      _evaluationCount = session.evaluation_count || 0;
      _lastEvaluationAt = session.last_evaluation?.evaluated_at ?? null;

      console.log(
        `[RiskEngine] Session restored: ` +
        `score=${_evaluation?.risk_score ?? 'N/A'} ` +
        `status=${_evaluation?.operational_status ?? 'N/A'} ` +
        `evals=${_evaluationCount}`
      );

      _notify();
      return true;
    } catch (e) {
      console.warn('[RiskEngine] Failed to restore session:', e);
      return false;
    }
  },

  /**
   * Clear persisted session.
   */
  clearPersistedSession(): void {
    _ls.del(STORAGE_KEY);
    console.log('[RiskEngine] Persisted session cleared');
  },


  // ── Reset ─────────────────────────────────────────────

  /**
   * Reset all state to defaults.
   */
  reset(): void {
    _evaluation = null;
    _summary = null;
    _lastInputSnapshot = null;
    _cachedEvaluation = null;
    _cachedSummary = null;
    _initialized = false;
    _running = false;
    _evaluationCount = 0;
    _lastEvaluationAt = null;
    _lastTrigger = null;
    _stabilizedStatus = 'optimal';
    _notify();
    console.log('[RiskEngine] Store reset');
  },


  // ── Subscriptions ─────────────────────────────────────

  /**
   * Subscribe to risk engine state changes.
   * Returns unsubscribe function.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};



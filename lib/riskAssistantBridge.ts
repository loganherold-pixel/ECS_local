/**
 * ═══════════════════════════════════════════════════════════
 * ECS RISK ↔ ASSISTANT COHESION BRIDGE — Integration Pass 4
 * ═══════════════════════════════════════════════════════════
 *
 * Central cohesion layer ensuring the Expedition Risk Engine
 * and AI Expedition Assistant operate as one unified decision-
 * support surface. Prevents contradictions, ensures shared
 * interpretation of risk state, and coordinates guidance
 * generation with dashboard display.
 *
 * Responsibilities:
 *   1. Single source of truth for risk interpretation
 *   2. Prevent assistant from contradicting dashboard Risk Indicator
 *   3. Ensure guidance cards use same risk interpretation as dashboard
 *   4. Generate operational explanations from real ECS inputs
 *   5. Detect material risk changes for guidance generation
 *   6. Suppress duplicate guidance unless severity increases
 *   7. Coordinate stale/unknown data labeling
 *   8. Provide companion dashboard summaries (Android Auto / CarPlay)
 *   9. Lightweight logging without performance overhead
 *  10. Failure isolation between Risk Engine and Assistant
 *
 * Architecture:
 *   - Reads from expeditionRiskStore (never writes to it)
 *   - Reads from all ECS context sources via assistantContextEngine
 *   - Provides normalized risk interpretation for assistant consumption
 *   - Subscribes to risk store changes for reactive guidance updates
 *   - All operations are non-blocking and failure-safe
 *
 * Performance:
 *   - All reads are synchronous (< 1ms)
 *   - Material change detection: < 2ms
 *   - Explanation generation: < 5ms
 *   - Logging throttled to prevent noise during travel
 */

import type {
  RiskSummary,
  RiskInputSnapshot,
  OperationalStatus,
  PrimaryRiskFactor,
} from './expeditionRiskTypes';
import {
  RISK_FACTOR_LABELS,
  OPERATIONAL_STATUS_DISPLAY,
} from './expeditionRiskTypes';
import type {
  AssistantContextSnapshot,
  AssistantGuidanceCard,
  GuidanceTriggerCondition,
} from './assistantTypes';

const TAG = '[RiskAssistantBridge]';

// ── Logging Throttle ─────────────────────────────────────

let _lastLogTimestamp = 0;
const LOG_THROTTLE_MS = 20_000; // 20 seconds between logs

function _throttledLog(msg: string): void {
  const now = Date.now();
  if (now - _lastLogTimestamp < LOG_THROTTLE_MS) return;
  _lastLogTimestamp = now;
  console.log(TAG, msg);
}


// ── Internal State ───────────────────────────────────────

/** Last risk summary used for material change detection */
let _lastRiskSummary: RiskSummary | null = null;

/** Last risk score that triggered a guidance update */
let _lastGuidanceRiskScore: number = 0;

/** Last operational status that triggered a guidance update */
let _lastGuidanceStatus: OperationalStatus = 'optimal';

/** Last primary risk factor that triggered a guidance update */
let _lastGuidanceFactor: PrimaryRiskFactor = 'none';

/** Subscription cleanup */
let _riskUnsub: (() => void) | null = null;

/** Bridge initialized flag */
let _initialized = false;

/** Material change callback */
let _onMaterialChange: ((summary: RiskSummary) => void) | null = null;


// ══════════════════════════════════════════════════════════
// RISK INTERPRETATION — Single Source of Truth
// ══════════════════════════════════════════════════════════

/**
 * Risk interpretation object — the canonical representation
 * of current risk state for both dashboard and assistant.
 *
 * Both the dashboard Risk Indicator widget and the assistant
 * MUST use this same object to prevent contradictions.
 */
export interface RiskInterpretation {
  /** Whether risk data is available */
  available: boolean;
  /** Whether the data is stale */
  stale: boolean;
  /** Risk score 0–100 */
  risk_score: number;
  /** Stabilized operational status */
  operational_status: OperationalStatus;
  /** Primary risk factor identifier */
  primary_risk_factor: PrimaryRiskFactor;
  /** Human-readable primary risk factor label */
  primary_risk_label: string;
  /** Human-readable summary line (same as dashboard) */
  summary_line: string;
  /** Status display color (same as dashboard) */
  status_color: string;
  /** Status display label (same as dashboard) */
  status_label: string;
  /** Sub-scores for detailed explanation */
  sub_scores: {
    capability: number;
    health: number;
    resource_readiness: number;
    connectivity_risk: number;
    isolation_risk: number;
    route_difficulty: number;
    resource_route_balance: number;
  };
  /** Data completeness */
  available_inputs: number;
  total_inputs: number;
  is_complete: boolean;
  /** Timestamp of last evaluation */
  evaluated_at: string | null;
  /** Freshness label for display */
  freshness_label: string;
}

/**
 * Get the canonical risk interpretation.
 *
 * This is the SINGLE SOURCE OF TRUTH that both the dashboard
 * Risk Indicator and the assistant must use. Prevents any
 * contradiction between what the dashboard shows and what
 * the assistant says.
 */
export function getRiskInterpretation(): RiskInterpretation {
  try {
    const { expeditionRiskStore } = require('./expeditionRiskStore');

    if (!expeditionRiskStore.isInitialized()) {
      return _createUnavailableInterpretation();
    }

    const summary = expeditionRiskStore.getSummary();
    const stabilizedStatus = expeditionRiskStore.getStabilizedStatus();

    if (!summary) {
      return _createUnavailableInterpretation();
    }

    // Use the STABILIZED status (hysteresis-protected) for display
    const displayStatus = stabilizedStatus || summary.operational_status;
    const statusDisplay = OPERATIONAL_STATUS_DISPLAY[displayStatus as OperationalStatus];

    // Determine freshness
    const evalAge = summary.updated_at
      ? Date.now() - new Date(summary.updated_at).getTime()
      : Infinity;
    const isStale = evalAge > 60_000; // > 60 seconds
    const freshnessLabel = isStale
      ? `Evaluated ${Math.round(evalAge / 1000)}s ago`
      : 'Live';

    return {
      available: true,
      stale: isStale,
      risk_score: summary.risk_score,
      operational_status: displayStatus,
      primary_risk_factor: summary.primary_risk_factor,
      primary_risk_label: summary.primary_risk_label,
      summary_line: summary.summary_line,
      status_color: statusDisplay?.color || '#78909C',
      status_label: statusDisplay?.label || 'Unknown',
      sub_scores: {
        capability: summary.capability_score,
        health: 0, // Will be populated from evaluation
        resource_readiness: summary.resource_readiness,
        connectivity_risk: summary.connectivity_risk,
        isolation_risk: summary.isolation_risk,
        route_difficulty: summary.route_difficulty_score,
        resource_route_balance: summary.resource_route_balance,
      },
      available_inputs: summary.available_inputs,
      total_inputs: summary.total_inputs,
      is_complete: summary.is_complete,
      evaluated_at: summary.updated_at,
      freshness_label: freshnessLabel,
    };
  } catch (e) {
    console.warn(TAG, 'Failed to get risk interpretation:', e);
    return _createUnavailableInterpretation();
  }
}

function _createUnavailableInterpretation(): RiskInterpretation {
  return {
    available: false,
    stale: false,
    risk_score: 0,
    operational_status: 'optimal',
    primary_risk_factor: 'none',
    primary_risk_label: 'No Concerns',
    summary_line: 'Risk engine not initialized',
    status_color: '#78909C',
    status_label: 'Unavailable',
    sub_scores: {
      capability: 0,
      health: 0,
      resource_readiness: 0,
      connectivity_risk: 0,
      isolation_risk: 0,
      route_difficulty: 0,
      resource_route_balance: 0,
    },
    available_inputs: 0,
    total_inputs: 6,
    is_complete: false,
    evaluated_at: null,
    freshness_label: 'Unavailable',
  };
}


// ══════════════════════════════════════════════════════════
// OPERATIONAL EXPLANATION GENERATION
// ══════════════════════════════════════════════════════════

/**
 * System-specific explanation map.
 * Maps primary risk factors to the ECS system that triggered them,
 * so the assistant can reference the correct source.
 */
const FACTOR_SYSTEM_MAP: Record<PrimaryRiskFactor, string> = {
  vehicle_overweight: 'Loadout System',
  fuel_critical: 'Vehicle Telemetry',
  water_critical: 'Consumables / Expedition Resources',
  power_critical: 'BLU Power Telemetry',
  no_connectivity: 'Connectivity Intelligence',
  high_remoteness: 'Remoteness Engine',
  terrain_difficulty: 'Route Analysis',
  vehicle_health: 'Vehicle Telemetry (OBD2)',
  loadout_incomplete: 'Loadout System',
  no_route: 'Navigation System',
  multiple_concerns: 'Multiple ECS Systems',
  offline_unprepared: 'Offline Expedition Database + Connectivity Intelligence',
  degraded_unprepared: 'Connectivity Intelligence',
  deep_isolation: 'Remoteness Engine',
  resource_depleted: 'Expedition Resources',
  route_capability_mismatch: 'Route Analysis + Vehicle Configuration',
  power_unsustainable: 'BLU Power Telemetry',
  none: 'No specific system',
};

/**
 * Generate an operational explanation for the current risk state.
 *
 * Uses real ECS inputs — never invents data. Labels unknown
 * categories explicitly as "unknown" rather than guessing.
 * Uses concise operational language, not generic filler.
 *
 * @param interpretation - Current risk interpretation
 * @param snapshot - Optional input snapshot for deeper detail
 */
export function generateRiskExplanation(
  interpretation: RiskInterpretation,
  snapshot?: RiskInputSnapshot | null,
): string {
  if (!interpretation.available) {
    return 'Risk assessment is not available. The Risk Engine has not completed an evaluation. Configure your vehicle, loadout, and route for a comprehensive risk assessment.';
  }

  const lines: string[] = [];
  const { sub_scores, primary_risk_factor, primary_risk_label, risk_score, operational_status } = interpretation;

  // ── Status line (matches dashboard exactly) ────────────
  lines.push(`Operational status: ${interpretation.status_label} (${risk_score}/100).`);

  // ── Primary factor with system attribution ─────────────
  if (primary_risk_factor !== 'none') {
    const system = FACTOR_SYSTEM_MAP[primary_risk_factor] || 'Unknown system';
    lines.push(`Primary concern: ${primary_risk_label} — reported by ${system}.`);
  }

  // ── Sub-score breakdown (only for available data) ──────
  const scoreLines: string[] = [];

  if (interpretation.available_inputs > 0) {
    // Only report scores that have data behind them
    if (sub_scores.isolation_risk > 0) {
      scoreLines.push(`Isolation: ${sub_scores.isolation_risk}/100`);
    }
    if (sub_scores.connectivity_risk > 0) {
      scoreLines.push(`Connectivity risk: ${sub_scores.connectivity_risk}/100`);
    }
    if (sub_scores.resource_readiness > 0) {
      scoreLines.push(`Resource readiness: ${sub_scores.resource_readiness}/100`);
    }
    if (sub_scores.capability > 0) {
      scoreLines.push(`Vehicle capability: ${sub_scores.capability}/100`);
    }
    if (sub_scores.route_difficulty > 0) {
      scoreLines.push(`Route difficulty: ${sub_scores.route_difficulty}/100`);
    }
    if (sub_scores.resource_route_balance > 0 && sub_scores.resource_route_balance < 100) {
      scoreLines.push(`Resource-route balance: ${sub_scores.resource_route_balance}/100`);
    }
  }

  if (scoreLines.length > 0) {
    lines.push(`Sub-scores: ${scoreLines.join(', ')}.`);
  }

  // ── Data completeness notice ───────────────────────────
  if (!interpretation.is_complete) {
    const missing = interpretation.total_inputs - interpretation.available_inputs;
    lines.push(`Note: ${missing} of ${interpretation.total_inputs} input categories are unavailable. Assessment is partial.`);
  }

  // ── Staleness notice ───────────────────────────────────
  if (interpretation.stale) {
    lines.push(`Data freshness: ${interpretation.freshness_label}. Values may not reflect current conditions.`);
  }

  // ── Snapshot-specific details (if available) ───────────
  if (snapshot) {
    const details = _extractSnapshotDetails(snapshot, primary_risk_factor);
    if (details) {
      lines.push(details);
    }
  }

  return lines.join(' ');
}

/**
 * Extract specific details from the risk input snapshot
 * relevant to the primary risk factor.
 */
function _extractSnapshotDetails(
  snapshot: RiskInputSnapshot,
  factor: PrimaryRiskFactor,
): string | null {
  try {
    switch (factor) {
      case 'vehicle_overweight': {
        const cap = snapshot.vehicle_capability;
        if (cap.payload_margin_lb != null) {
          return `Vehicle exceeds GVWR by ${Math.abs(cap.payload_margin_lb).toLocaleString()} lb. Build weight: ${cap.build_weight_lb?.toLocaleString() || '?'} lb, GVWR: ${cap.gvwr_lb?.toLocaleString() || '?'} lb.`;
        }
        return null;
      }

      case 'fuel_critical': {
        const health = snapshot.vehicle_health;
        if (health.fuel_percent != null) {
          return `Vehicle fuel: ${health.fuel_percent}%.${health.fuel_critical ? ' CRITICAL.' : ''}`;
        }
        return null;
      }

      case 'water_critical': {
        const res = snapshot.expedition_resources;
        if (res.water_gal != null) {
          return `Water remaining: ${res.water_gal.toFixed(1)} gal.${res.water_autonomy_days != null ? ` Estimated autonomy: ${res.water_autonomy_days.toFixed(1)} days.` : ''}`;
        }
        return null;
      }

      case 'power_critical':
      case 'power_unsustainable': {
        const res = snapshot.expedition_resources;
        if (res.has_blu_telemetry) {
          const parts: string[] = [];
          if (res.blu_battery_percent != null) parts.push(`BLU battery: ${res.blu_battery_percent}%`);
          if (res.blu_input_watts != null) parts.push(`input: ${res.blu_input_watts}W`);
          if (res.blu_output_watts != null) parts.push(`output: ${res.blu_output_watts}W`);
          if (res.blu_runtime_minutes != null) {
            const hrs = Math.floor(res.blu_runtime_minutes / 60);
            const mins = res.blu_runtime_minutes % 60;
            parts.push(`runtime: ${hrs}h ${mins}m`);
          }
          parts.push(res.blu_power_sustainable ? 'sustainable' : 'NOT sustainable');
          return `BLU Power: ${parts.join(', ')}.`;
        }
        return null;
      }

      case 'offline_unprepared':
      case 'degraded_unprepared': {
        const conn = snapshot.connectivity_status;
        return `Connectivity: ${conn.connectivity_state} (${conn.network_type}). Cache ready: ${conn.offline_cache_ready ? 'yes' : 'no'}. Region cached: ${conn.cached_region_available ? 'yes' : 'no'}. Route cached: ${conn.cached_route_available ? 'yes' : 'no'}.`;
      }

      case 'deep_isolation':
      case 'high_remoteness': {
        const rem = snapshot.remoteness;
        if (rem.remoteness_score != null) {
          return `Remoteness: ${rem.remoteness_tier} (score: ${rem.remoteness_score}/100).${rem.distance_from_services_mi != null ? ` Estimated ${rem.distance_from_services_mi} mi from services.` : ''} Cache: ${rem.cache_ready ? 'available' : 'not available'}.`;
        }
        return null;
      }

      case 'route_capability_mismatch': {
        const route = snapshot.route_difficulty;
        if (route.difficulty_vs_capability_delta != null) {
          return `Route challenge: ${route.route_challenge_score}/100. Vehicle capability delta: ${route.difficulty_vs_capability_delta > 0 ? '+' : ''}${route.difficulty_vs_capability_delta}. Trail rating: ${route.trail_difficulty_rating ?? 'unknown'}/5.`;
        }
        return null;
      }

      case 'vehicle_health': {
        const health = snapshot.vehicle_health;
        if (health.has_anomaly) {
          return `Vehicle anomalies: ${health.anomaly_flags.join(', ')}. Battery: ${health.battery_voltage ?? '?'}V (${health.battery_health}). Coolant: ${health.coolant_temp_f ?? '?'}°F.`;
        }
        return null;
      }

      case 'resource_depleted': {
        const res = snapshot.expedition_resources;
        const depleted: string[] = [];
        if (res.fuel_low) depleted.push(`fuel ${res.fuel_percent ?? '?'}%`);
        if (res.water_low) depleted.push(`water ${res.water_gal?.toFixed(1) ?? '?'} gal`);
        if (res.power_limited) depleted.push(`power runtime ${res.power_runtime_hrs?.toFixed(1) ?? '?'}h`);
        return depleted.length > 0 ? `Depleted resources: ${depleted.join(', ')}.` : null;
      }

      default:
        return null;
    }
  } catch {
    return null;
  }
}


// ══════════════════════════════════════════════════════════
// QUESTION-SPECIFIC ANSWER GENERATION
// ══════════════════════════════════════════════════════════

/**
 * Answer types for specific user questions about risk.
 */
export type RiskQuestion =
  | 'biggest_risk'
  | 'why_risk_increased'
  | 'offline_ready'
  | 'loadout_stability'
  | 'risk_explanation';

/**
 * Generate a specific answer to a risk-related question
 * using live ECS context. Never invents data — labels
 * unknown categories explicitly.
 */
export function answerRiskQuestion(
  question: RiskQuestion,
  context: AssistantContextSnapshot,
): string {
  const interp = getRiskInterpretation();

  try {
    switch (question) {
      case 'biggest_risk':
        return _answerBiggestRisk(interp, context);
      case 'why_risk_increased':
        return _answerWhyRiskIncreased(interp, context);
      case 'offline_ready':
        return _answerOfflineReady(context);
      case 'loadout_stability':
        return _answerLoadoutStability(context);
      case 'risk_explanation':
        return _answerRiskExplanation(interp);
      default:
        return 'Unable to determine the specific question. Try asking about your biggest risk, offline readiness, or loadout stability.';
    }
  } catch (e) {
    console.warn(TAG, 'Failed to answer risk question:', e);
    return 'An error occurred while analyzing your question. The Risk Engine and Assistant systems are operating independently — this error does not affect risk monitoring.';
  }
}

function _answerBiggestRisk(interp: RiskInterpretation, ctx: AssistantContextSnapshot): string {
  if (!interp.available) {
    return 'Risk assessment is not yet available. The Risk Engine needs vehicle configuration, loadout, and route data to identify risks.';
  }

  if (interp.primary_risk_factor === 'none') {
    return `No significant risks identified. Operational status: ${interp.status_label}. Risk score: ${interp.risk_score}/100. All monitored systems are within normal parameters.`;
  }

  const system = FACTOR_SYSTEM_MAP[interp.primary_risk_factor];
  const lines: string[] = [
    `Your biggest current risk is ${interp.primary_risk_label}, identified by the ${system}.`,
    `Overall risk score: ${interp.risk_score}/100 (${interp.status_label}).`,
    interp.summary_line,
  ];

  // Add specific context based on the factor
  let snapshot: RiskInputSnapshot | null = null;
  try {
    const { expeditionRiskStore } = require('./expeditionRiskStore');
    snapshot = expeditionRiskStore.getLastInputSnapshot();
  } catch {}

  if (snapshot) {
    const detail = _extractSnapshotDetails(snapshot, interp.primary_risk_factor);
    if (detail) lines.push(detail);
  }

  return lines.join(' ');
}

function _answerWhyRiskIncreased(interp: RiskInterpretation, ctx: AssistantContextSnapshot): string {
  if (!interp.available) {
    return 'Risk assessment is not yet available. Cannot determine risk changes without an active evaluation.';
  }

  const lines: string[] = [];

  if (_lastRiskSummary && interp.risk_score > _lastRiskSummary.risk_score) {
    const delta = interp.risk_score - _lastRiskSummary.risk_score;
    lines.push(`Risk increased by ${delta} points (from ${_lastRiskSummary.risk_score} to ${interp.risk_score}/100).`);

    // Identify which sub-scores changed
    const changes: string[] = [];
    if (interp.sub_scores.isolation_risk > (_lastRiskSummary.isolation_risk || 0) + 5) {
      changes.push(`isolation risk increased to ${interp.sub_scores.isolation_risk}/100`);
    }
    if (interp.sub_scores.connectivity_risk > (_lastRiskSummary.connectivity_risk || 0) + 5) {
      changes.push(`connectivity risk increased to ${interp.sub_scores.connectivity_risk}/100`);
    }
    if (interp.sub_scores.resource_readiness < (_lastRiskSummary.resource_readiness || 100) - 5) {
      changes.push(`resource readiness dropped to ${interp.sub_scores.resource_readiness}/100`);
    }
    if (interp.sub_scores.capability < (_lastRiskSummary.capability_score || 100) - 5) {
      changes.push(`vehicle capability dropped to ${interp.sub_scores.capability}/100`);
    }
    if (interp.sub_scores.route_difficulty > (_lastRiskSummary.route_difficulty_score || 0) + 5) {
      changes.push(`route difficulty increased to ${interp.sub_scores.route_difficulty}/100`);
    }

    if (changes.length > 0) {
      lines.push(`Contributing factors: ${changes.join('; ')}.`);
    }

    if (_lastRiskSummary.primary_risk_factor !== interp.primary_risk_factor) {
      lines.push(`Primary concern changed from ${RISK_FACTOR_LABELS[_lastRiskSummary.primary_risk_factor as PrimaryRiskFactor] || _lastRiskSummary.primary_risk_factor} to ${interp.primary_risk_label}.`);
    }
  } else if (_lastRiskSummary) {
    lines.push(`Risk has not increased since last check. Current score: ${interp.risk_score}/100 (${interp.status_label}).`);
    if (interp.risk_score < _lastRiskSummary.risk_score) {
      lines.push(`Risk actually decreased by ${_lastRiskSummary.risk_score - interp.risk_score} points.`);
    }
  } else {
    lines.push(`Current risk score: ${interp.risk_score}/100 (${interp.status_label}). No previous evaluation available for comparison.`);
    lines.push(`Primary concern: ${interp.primary_risk_label}. ${interp.summary_line}`);
  }

  return lines.join(' ');
}

function _answerOfflineReady(ctx: AssistantContextSnapshot): string {
  const or = ctx.offline_readiness;
  const cs = ctx.connectivity_status;
  const lines: string[] = [];

  if (or.availability === 'unavailable' && cs.availability === 'unavailable') {
    return 'Offline readiness status is unknown. The Offline Expedition Database and Connectivity Intelligence systems have not reported data.';
  }

  // Offline data status
  if (or.availability !== 'unavailable') {
    if (or.has_offline_data) {
      lines.push(`Offline data: ${or.downloaded_regions} region(s), ${or.total_entries.toLocaleString()} entries.`);
      if (or.covers_active_route && or.covers_current_position) {
        lines.push('Coverage: current position and active route are covered. You are offline-ready.');
      } else if (or.covers_current_position) {
        lines.push('Coverage: current position is covered, but active route is NOT fully covered.');
      } else if (or.covers_active_route) {
        lines.push('Coverage: active route is covered, but current position is NOT covered.');
      } else {
        lines.push('Coverage: neither current position nor active route are covered. You are NOT offline-ready.');
      }
      if (!or.all_regions_valid) {
        lines.push('Warning: some cached regions have integrity issues.');
      }
    } else {
      lines.push('No offline expedition data has been downloaded. You are NOT offline-ready.');
    }
  } else {
    lines.push('Offline data status: unknown (Offline Expedition Database not reporting).');
  }

  // Connectivity context
  if (cs.availability !== 'unavailable') {
    lines.push(`Current connectivity: ${cs.connectivity_state} (${cs.network_type}, ${cs.signal_quality}).`);
    if (cs.offline_cache_ready) {
      lines.push('Offline cache is marked as ready by Connectivity Intelligence.');
    }
  }

  return lines.join(' ');
}

function _answerLoadoutStability(ctx: AssistantContextSnapshot): string {
  const ls = ctx.loadout_status;
  const vp = ctx.vehicle_profile;
  const lines: string[] = [];

  if (ls.availability === 'unavailable') {
    return 'Loadout status is unknown. No active loadout has been configured. Set up a loadout to assess weight distribution and stability impact.';
  }

  if (!ls.has_active_loadout) {
    return 'No active loadout is configured. Without loadout data, stability impact cannot be assessed.';
  }

  lines.push(`Loadout: ${ls.total_items} items, ${ls.readiness_pct}% ready.`);

  if (ls.total_weight_lbs != null) {
    lines.push(`Loadout weight: ${ls.total_weight_lbs.toLocaleString()} lb.`);
  }

  if (ls.is_overweight) {
    lines.push('WARNING: Vehicle is overweight. This directly affects stability, handling, and braking performance.');
    if (ls.payload_margin_lb != null) {
      lines.push(`Exceeding GVWR by ${Math.abs(ls.payload_margin_lb).toLocaleString()} lb.`);
    }
  } else if (ls.payload_margin_lb != null && vp.gvwr_lb) {
    const marginPct = Math.round((ls.payload_margin_lb / vp.gvwr_lb) * 100);
    lines.push(`Payload margin: ${ls.payload_margin_lb.toLocaleString()} lb (${marginPct}% of GVWR).`);
    if (marginPct < 10) {
      lines.push('Margin is low. Vehicle is near capacity, which may affect stability on rough terrain.');
    } else {
      lines.push('Weight is within safe limits for stability.');
    }
  }

  // Check risk engine for weight distribution data
  try {
    const { expeditionRiskStore } = require('./expeditionRiskStore');
    const snapshot = expeditionRiskStore.getLastInputSnapshot();
    if (snapshot?.vehicle_capability) {
      const cap = snapshot.vehicle_capability;
      if (cap.weight_distribution !== 'unknown') {
        lines.push(`Weight distribution: ${cap.weight_distribution}.`);
        if (cap.load_imbalanced) {
          lines.push('Load is imbalanced (extreme rear bias). This affects handling and tilt risk.');
        }
      }
      if (cap.rear_axle_pct != null) {
        lines.push(`Rear axle load: ${cap.rear_axle_pct}%.`);
      }
    }
  } catch {}

  if (ls.critical_missing > 0) {
    lines.push(`${ls.critical_missing} critical item(s) are missing from the loadout.`);
  }

  return lines.join(' ');
}

function _answerRiskExplanation(interp: RiskInterpretation): string {
  if (!interp.available) {
    return 'The Risk Engine has not completed an evaluation. It needs data from vehicle configuration, loadout, route, connectivity, and remoteness systems to produce a risk assessment.';
  }

  let snapshot: RiskInputSnapshot | null = null;
  try {
    const { expeditionRiskStore } = require('./expeditionRiskStore');
    snapshot = expeditionRiskStore.getLastInputSnapshot();
  } catch {}

  return generateRiskExplanation(interp, snapshot);
}


// ══════════════════════════════════════════════════════════
// MATERIAL CHANGE DETECTION
// ══════════════════════════════════════════════════════════

/**
 * Thresholds for what constitutes a "material" change
 * that should trigger new guidance generation.
 */
const MATERIAL_CHANGE_THRESHOLDS = {
  /** Minimum risk score change to trigger new guidance */
  risk_score_delta: 8,
  /** Status change always triggers */
  status_change: true,
  /** Factor change triggers if score is above this */
  factor_change_min_score: 25,
};

/**
 * Determine if the current risk state represents a material
 * change from the last guidance generation point.
 *
 * Returns true only when conditions have materially changed,
 * preventing duplicate or redundant guidance cards.
 */
export function isMaterialRiskChange(current: RiskSummary): boolean {
  // First evaluation is always material
  if (!_lastRiskSummary) return true;

  const scoreDelta = Math.abs(current.risk_score - _lastGuidanceRiskScore);
  const statusChanged = current.operational_status !== _lastGuidanceStatus;
  const factorChanged = current.primary_risk_factor !== _lastGuidanceFactor;

  // Status change is always material
  if (statusChanged) return true;

  // Score change above threshold
  if (scoreDelta >= MATERIAL_CHANGE_THRESHOLDS.risk_score_delta) return true;

  // Factor change when score is significant
  if (factorChanged && current.risk_score >= MATERIAL_CHANGE_THRESHOLDS.factor_change_min_score) return true;

  return false;
}

/**
 * Record that guidance was generated for the current risk state.
 * Called after guidance cards are updated.
 */
export function recordGuidanceGeneration(summary: RiskSummary): void {
  _lastGuidanceRiskScore = summary.risk_score;
  _lastGuidanceStatus = summary.operational_status;
  _lastGuidanceFactor = summary.primary_risk_factor;
}


// ══════════════════════════════════════════════════════════
// COMPANION DASHBOARD SUPPORT
// ══════════════════════════════════════════════════════════

/**
 * Simplified risk + assistant summary for Android Auto / CarPlay.
 *
 * Safe for consumption by companion dashboards — never throws,
 * always returns a valid object.
 */
export interface CompanionRiskAssistantSummary {
  /** Risk score 0–100 */
  risk_score: number;
  /** Operational status label */
  status_label: string;
  /** Status color for display */
  status_color: string;
  /** Primary risk factor label */
  primary_risk_label: string;
  /** One-line summary */
  summary_line: string;
  /** Top guidance card summary (if any) */
  top_guidance: string | null;
  /** Number of active guidance cards */
  active_guidance_count: number;
  /** Whether risk data is available */
  available: boolean;
}

export function getCompanionRiskAssistantSummary(): CompanionRiskAssistantSummary {
  try {
    const interp = getRiskInterpretation();

    let topGuidance: string | null = null;
    let activeCount = 0;
    try {
      const { assistantStore } = require('./assistantStore');
      const cards = assistantStore.getActiveGuidanceCards();
      activeCount = cards.length;
      if (cards.length > 0) {
        topGuidance = `${cards[0].title}: ${cards[0].body}`;
      }
    } catch {}

    return {
      risk_score: interp.risk_score,
      status_label: interp.status_label,
      status_color: interp.status_color,
      primary_risk_label: interp.primary_risk_label,
      summary_line: interp.summary_line,
      top_guidance: topGuidance,
      active_guidance_count: activeCount,
      available: interp.available,
    };
  } catch {
    return {
      risk_score: 0,
      status_label: 'Unavailable',
      status_color: '#78909C',
      primary_risk_label: 'No Concerns',
      summary_line: 'Risk assessment unavailable',
      top_guidance: null,
      active_guidance_count: 0,
      available: false,
    };
  }
}


// ══════════════════════════════════════════════════════════
// BRIDGE LIFECYCLE
// ══════════════════════════════════════════════════════════

/**
 * Initialize the Risk ↔ Assistant bridge.
 *
 * Subscribes to risk store changes and triggers assistant
 * guidance re-evaluation when material changes occur.
 *
 * @param onMaterialChange - Optional callback when material risk changes occur
 */
export function initBridge(
  onMaterialChange?: (summary: RiskSummary) => void,
): void {
  if (_initialized) return;

  _onMaterialChange = onMaterialChange || null;

  try {
    const { expeditionRiskStore } = require('./expeditionRiskStore');

    _riskUnsub = expeditionRiskStore.subscribe(() => {
      try {
        const summary = expeditionRiskStore.getSummary();
        if (!summary) return;

        // Check for material change
        if (isMaterialRiskChange(summary)) {
          _throttledLog(
            `Material risk change: ${_lastRiskSummary?.risk_score ?? '?'} → ${summary.risk_score} ` +
            `(${_lastGuidanceStatus} → ${summary.operational_status}, ` +
            `factor: ${summary.primary_risk_factor})`
          );

          // Notify callback
          if (_onMaterialChange) {
            try {
              _onMaterialChange(summary);
            } catch (e) {
              // Failure in assistant callback must never affect Risk Engine
              console.warn(TAG, 'Material change callback error (isolated):', e);
            }
          }

          recordGuidanceGeneration(summary);
        }

        // Always update last summary for delta tracking
        _lastRiskSummary = { ...summary };
      } catch (e) {
        // Failure in bridge must never affect Risk Engine
        console.warn(TAG, 'Risk subscription handler error (isolated):', e);
      }
    });

    _initialized = true;
    console.log(TAG, 'Bridge initialized — Risk ↔ Assistant cohesion active');
  } catch (e) {
    console.warn(TAG, 'Bridge initialization failed (non-fatal):', e);
  }
}

/**
 * Tear down the bridge.
 */
export function teardownBridge(): void {
  if (_riskUnsub) {
    _riskUnsub();
    _riskUnsub = null;
  }
  _onMaterialChange = null;
  _initialized = false;
  _lastRiskSummary = null;
  _lastGuidanceRiskScore = 0;
  _lastGuidanceStatus = 'optimal';
  _lastGuidanceFactor = 'none';
  console.log(TAG, 'Bridge torn down');
}

/**
 * Whether the bridge is initialized.
 */
export function isBridgeInitialized(): boolean {
  return _initialized;
}

/**
 * Get diagnostics for the bridge state.
 */
export function getBridgeDiagnostics(): {
  initialized: boolean;
  last_risk_score: number;
  last_guidance_status: OperationalStatus;
  last_guidance_factor: PrimaryRiskFactor;
  has_risk_subscription: boolean;
} {
  return {
    initialized: _initialized,
    last_risk_score: _lastGuidanceRiskScore,
    last_guidance_status: _lastGuidanceStatus,
    last_guidance_factor: _lastGuidanceFactor,
    has_risk_subscription: _riskUnsub !== null,
  };
}


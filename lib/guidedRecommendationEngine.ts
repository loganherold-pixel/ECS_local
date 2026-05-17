/**
 * ═══════════════════════════════════════════════════════════
 * ECS AI EXPEDITION ASSISTANT — Guided Recommendation Engine
 * ═══════════════════════════════════════════════════════════
 *
 * Phase 7C: Evaluates ECS context signals and generates
 * proactive guidance cards when conditions warrant attention.
 *
 * Trigger Conditions:
 *   - risk_elevated:               Risk score > 50
 *   - risk_critical:               Risk score > 75
 *   - load_unbalanced:             Payload margin < 10% of GVWR
 *   - load_overweight:             Vehicle exceeds GVWR
 *   - power_limited:               Battery < 30% and not sustainable
 *   - power_critical:              Battery < 15%
 *   - fuel_low:                    Fuel < 25%
 *   - fuel_critical:               Fuel < 10%
 *   - water_low:                   Water reserves approaching threshold
 *   - connectivity_lost_no_cache:  Offline with no cached data
 *   - route_exceeds_capability:    Route difficulty > vehicle capability
 *   - offline_data_missing:        No offline data for active route/area
 *   - critical_loadout_missing:    Critical loadout items not packed
 *   - vehicle_anomaly:             Vehicle health anomaly detected
 *   - remoteness_high_unprepared:  High remoteness without offline cache
 *
 * Design Principles:
 *   - Non-blocking: never interrupts critical ECS systems
 *   - Deduplication: same trigger won't generate duplicate cards
 *   - Auto-dismiss: resolved conditions automatically dismiss cards
 *   - Performance-safe: evaluation completes in < 5ms
 *   - Graceful degradation: missing context is skipped, not errored
 */

import type {
  AssistantContextSnapshot,
  AssistantGuidanceCard,
  GuidanceTriggerCondition,
  AssistantResponseType,
  AssistantConfidenceLevel,
  AssistantContextCategory,
  ContextBasis,
  ContextAvailability,
} from './assistantTypes';

const TAG = '[AI-ASSISTANT-GUIDE]';

// ── ID Generation ────────────────────────────────────────

function _id(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function _isAvail(a: ContextAvailability): boolean {
  return a === 'available' || a === 'stale';
}

function _now(): string { return new Date().toISOString(); }


// ── Trigger Evaluation Result ────────────────────────────

interface TriggerResult {
  trigger: GuidanceTriggerCondition;
  fired: boolean;
  title: string;
  body: string;
  explanation: string;
  suggested_action: string;
  type: AssistantResponseType;
  confidence: AssistantConfidenceLevel;
  priority: number;
  source_categories: AssistantContextCategory[];
  from_live_telemetry: boolean;
}


// ══════════════════════════════════════════════════════════
// TRIGGER EVALUATORS
// ══════════════════════════════════════════════════════════

function _evalRiskElevated(s: AssistantContextSnapshot): TriggerResult {
  const rk = s.risk_status;
  const fired = _isAvail(rk.availability) && rk.is_complete && rk.risk_score > 50 && rk.risk_score <= 75;
  return {
    trigger: 'risk_elevated',
    fired,
    title: 'Elevated Expedition Risk',
    body: `Risk score: ${rk.risk_score}/100 (${rk.operational_status}). Primary concern: ${rk.primary_risk_label}.`,
    explanation: `The Expedition Risk Engine has identified elevated operational risk. Your overall risk score is ${rk.risk_score}/100, driven primarily by ${rk.primary_risk_label}. Capability score: ${rk.capability_score}/100. Resource readiness: ${rk.resource_readiness}/100. ${rk.summary_line}`,
    suggested_action: 'Review the Risk Assessment in the assistant and address the primary risk factor before departure.',
    type: 'caution',
    confidence: 'high',
    priority: 2,
    source_categories: ['risk_status'],
    from_live_telemetry: rk.availability === 'available',
  };
}

function _evalRiskCritical(s: AssistantContextSnapshot): TriggerResult {
  const rk = s.risk_status;
  const fired = _isAvail(rk.availability) && rk.is_complete && rk.risk_score > 75;
  return {
    trigger: 'risk_critical',
    fired,
    title: 'Critical Expedition Risk',
    body: `Risk score: ${rk.risk_score}/100 \u2014 operational status: ${rk.operational_status}. Immediate attention required.`,
    explanation: `The Expedition Risk Engine reports critical risk levels. Score: ${rk.risk_score}/100. Primary factor: ${rk.primary_risk_label}. Connectivity risk: ${rk.connectivity_risk}/100. Isolation risk: ${rk.isolation_risk}/100. ${rk.summary_line}. Proceeding under these conditions is not recommended without mitigation.`,
    suggested_action: 'Do not proceed until the primary risk factor is addressed. Review vehicle systems, loadout, and connectivity preparations.',
    type: 'caution',
    confidence: 'high',
    priority: 1,
    source_categories: ['risk_status'],
    from_live_telemetry: rk.availability === 'available',
  };
}

function _evalLoadUnbalanced(s: AssistantContextSnapshot): TriggerResult {
  const ls = s.loadout_status;
  const vp = s.vehicle_profile;
  const hasData = _isAvail(ls.availability) && _isAvail(vp.availability) && ls.has_active_loadout && vp.gvwr_lb;
  let fired = false;
  let margin = 0;
  let marginPct = 0;

  if (hasData && vp.gvwr_lb && ls.total_weight_lbs) {
    const baseWeight = vp.base_weight_lb || 0;
    const totalLoaded = baseWeight + ls.total_weight_lbs;
    margin = vp.gvwr_lb - totalLoaded;
    marginPct = Math.round((margin / vp.gvwr_lb) * 100);
    fired = margin > 0 && marginPct < 10;
  }

  return {
    trigger: 'load_unbalanced',
    fired,
    title: 'Low Payload Margin',
    body: `Payload margin is only ${margin.toLocaleString()} lb (${marginPct}% of GVWR). Vehicle is near capacity.`,
    explanation: `Your current loaded weight leaves only ${margin.toLocaleString()} lb of payload margin, which is ${marginPct}% of your ${vp.gvwr_lb?.toLocaleString() || '?'} lb GVWR. Operating near GVWR limits affects handling, braking distance, and fuel efficiency. Consider redistributing or removing non-essential items.`,
    suggested_action: 'Review your loadout and remove non-essential items to increase payload margin above 10%.',
    type: 'recommendation',
    confidence: hasData ? 'high' : 'low',
    priority: 3,
    source_categories: ['loadout_status', 'vehicle_profile'],
    from_live_telemetry: false,
  };
}

function _evalLoadOverweight(s: AssistantContextSnapshot): TriggerResult {
  const ls = s.loadout_status;
  const fired = _isAvail(ls.availability) && ls.has_active_loadout && ls.is_overweight;
  const excess = ls.payload_margin_lb != null ? Math.abs(ls.payload_margin_lb) : 0;

  return {
    trigger: 'load_overweight',
    fired,
    title: 'Vehicle Overweight',
    body: `Vehicle exceeds GVWR${excess > 0 ? ` by ${excess.toLocaleString()} lb` : ''}. This affects safety and may be illegal.`,
    explanation: `Your vehicle is loaded beyond its Gross Vehicle Weight Rating (GVWR). Exceeding GVWR compromises braking performance, tire safety, suspension integrity, and handling stability. This condition may also violate road regulations. Total weight: ${ls.total_weight_lbs?.toLocaleString() || '?'} lb loadout weight.`,
    suggested_action: 'Reduce payload immediately. Remove non-essential items until the vehicle is within GVWR limits.',
    type: 'caution',
    confidence: 'high',
    priority: 1,
    source_categories: ['loadout_status', 'vehicle_profile'],
    from_live_telemetry: false,
  };
}

function _evalPowerLimited(s: AssistantContextSnapshot): TriggerResult {
  const ps = s.power_status;
  const fired = _isAvail(ps.availability) && ps.has_blu_telemetry &&
    (ps.battery_percent ?? 100) < 30 && !ps.is_sustainable && (ps.battery_percent ?? 100) >= 15;

  return {
    trigger: 'power_limited',
    fired,
    title: 'Power System Limited',
    body: `Battery at ${ps.battery_percent ?? '?'}% and not sustainable (output exceeds input by ${((ps.output_watts ?? 0) - (ps.input_watts ?? 0))}W).`,
    explanation: `Your BLU power system is drawing more power than it receives. Battery level: ${ps.battery_percent ?? '?'}%. Input: ${ps.input_watts ?? 0}W. Output: ${ps.output_watts ?? 0}W. At current draw rates, battery will deplete. ${ps.runtime_minutes != null ? `Estimated runtime: ${Math.floor(ps.runtime_minutes / 60)}h ${ps.runtime_minutes % 60}m.` : ''}`,
    suggested_action: 'Reduce power consumption or increase charging input. Disconnect non-essential loads to extend runtime.',
    type: 'recommendation',
    confidence: ps.availability === 'available' ? 'high' : 'medium',
    priority: 2,
    source_categories: ['power_status'],
    from_live_telemetry: ps.availability === 'available',
  };
}

function _evalPowerCritical(s: AssistantContextSnapshot): TriggerResult {
  const ps = s.power_status;
  const fired = _isAvail(ps.availability) && ps.has_blu_telemetry && (ps.battery_percent ?? 100) < 15;

  return {
    trigger: 'power_critical',
    fired,
    title: 'Power Critically Low',
    body: `Battery at ${ps.battery_percent ?? '?'}%. Immediate charging required.`,
    explanation: `BLU power system battery is critically low at ${ps.battery_percent ?? '?'}%. At this level, connected devices may shut down unexpectedly. Input: ${ps.input_watts ?? 0}W. Output: ${ps.output_watts ?? 0}W. Prioritize charging immediately to avoid complete power loss.`,
    suggested_action: 'Connect to a charging source immediately. Disconnect all non-essential loads. Start vehicle engine if alternator charging is available.',
    type: 'caution',
    confidence: 'high',
    priority: 1,
    source_categories: ['power_status'],
    from_live_telemetry: ps.availability === 'available',
  };
}

function _evalFuelLow(s: AssistantContextSnapshot): TriggerResult {
  const vh = s.vehicle_health;
  const fired = _isAvail(vh.availability) && vh.has_live_telemetry &&
    vh.fuel_percent != null && vh.fuel_percent < 25 && vh.fuel_percent >= 10;

  return {
    trigger: 'fuel_low',
    fired,
    title: 'Fuel Level Low',
    body: `Fuel at ${vh.fuel_percent ?? '?'}%. Plan a fuel stop before entering remote areas.`,
    explanation: `Vehicle fuel level is at ${vh.fuel_percent ?? '?'}%. Off-road driving typically reduces fuel efficiency by 30-50% compared to highway driving. If you are heading into remote areas, ensure you have sufficient fuel for the round trip plus a safety margin. ${s.vehicle_profile.fuel_tank_capacity_gal ? `Tank capacity: ${s.vehicle_profile.fuel_tank_capacity_gal} gal.` : ''}`,
    suggested_action: 'Refuel at the next available station. Consider carrying auxiliary fuel if heading into remote areas.',
    type: 'recommendation',
    confidence: vh.availability === 'available' ? 'high' : 'medium',
    priority: 2,
    source_categories: ['vehicle_health'],
    from_live_telemetry: vh.availability === 'available',
  };
}

function _evalFuelCritical(s: AssistantContextSnapshot): TriggerResult {
  const vh = s.vehicle_health;
  const fired = _isAvail(vh.availability) && vh.has_live_telemetry &&
    vh.fuel_percent != null && vh.fuel_percent < 10;

  return {
    trigger: 'fuel_critical',
    fired,
    title: 'Fuel Critically Low',
    body: `Fuel at ${vh.fuel_percent ?? '?'}%. Refuel immediately.`,
    explanation: `Vehicle fuel level is critically low at ${vh.fuel_percent ?? '?'}%. Running out of fuel in a remote area creates a serious safety risk. Do not proceed further from fuel sources. ${s.route_context.has_active_route ? `Active route: ${s.route_context.route_name || 'loaded'} (${s.route_context.total_distance_mi?.toFixed(1) || '?'} mi).` : ''}`,
    suggested_action: 'Refuel immediately. Do not proceed into remote areas. Consider turning back to the nearest fuel source.',
    type: 'caution',
    confidence: 'high',
    priority: 1,
    source_categories: ['vehicle_health'],
    from_live_telemetry: vh.availability === 'available',
  };
}

function _evalWaterLow(s: AssistantContextSnapshot): TriggerResult {
  // Water status is typically tracked via loadout critical items or resource readiness
  const rk = s.risk_status;
  const fired = _isAvail(rk.availability) && rk.is_complete && rk.resource_readiness < 40;

  return {
    trigger: 'water_low',
    fired,
    title: 'Resource Readiness Low',
    body: `Resource readiness: ${rk.resource_readiness}/100. Water and consumable reserves may be insufficient.`,
    explanation: `The Expedition Risk Engine reports resource readiness at ${rk.resource_readiness}/100, which indicates your consumable reserves (water, food, fuel) may be insufficient for the planned expedition. This is a composite score factoring in your loadout, route distance, and expected duration.`,
    suggested_action: 'Review your water and consumable supplies. Top up reserves before departure. Check the loadout for critical missing items.',
    type: 'recommendation',
    confidence: rk.availability === 'available' ? 'high' : 'medium',
    priority: 2,
    source_categories: ['risk_status', 'loadout_status'],
    from_live_telemetry: false,
  };
}

function _evalConnectivityLostNoCache(s: AssistantContextSnapshot): TriggerResult {
  const cs = s.connectivity_status;
  const or = s.offline_readiness;
  const fired = _isAvail(cs.availability) &&
    (!cs.internet_reachable || cs.connectivity_state === 'offline') &&
    (!or.has_offline_data || !or.covers_current_position);

  return {
    trigger: 'connectivity_lost_no_cache',
    fired,
    title: 'Offline Without Cached Data',
    body: `No internet connectivity and ${or.has_offline_data ? 'offline data does not cover current area' : 'no offline data cached'}.`,
    explanation: `You have lost internet connectivity (state: ${cs.connectivity_state}, network: ${cs.network_type}). ${or.has_offline_data ? `Offline data is available (${or.downloaded_regions} region(s)) but does not cover your current position.` : 'No offline expedition data has been downloaded.'} Navigation, discovery, and weather features will be limited or unavailable.`,
    suggested_action: 'When connectivity returns, download offline regions for your area. Consider moving to a location with signal to cache essential data.',
    type: 'caution',
    confidence: _isAvail(cs.availability) ? 'high' : 'medium',
    priority: 2,
    source_categories: ['connectivity_status', 'offline_readiness'],
    from_live_telemetry: cs.availability === 'available',
  };
}

function _evalRouteExceedsCapability(s: AssistantContextSnapshot): TriggerResult {
  const rk = s.risk_status;
  const rc = s.route_context;
  const fired = _isAvail(rk.availability) && rk.is_complete &&
    _isAvail(rc.availability) && rc.has_active_route &&
    rk.capability_score < 40;

  return {
    trigger: 'route_exceeds_capability',
    fired,
    title: 'Route May Exceed Vehicle Capability',
    body: `Capability score: ${rk.capability_score}/100 for route "${rc.route_name || 'active'}". Vehicle may not be suited for this route.`,
    explanation: `The Expedition Risk Engine rates your vehicle capability at ${rk.capability_score}/100 for the active route. This considers your vehicle type, specifications, loadout weight, and route difficulty. A score below 40 indicates the route may exceed your vehicle's safe operating envelope. Route: ${rc.route_name || 'active'}, ${rc.total_distance_mi?.toFixed(1) || '?'} mi${rc.elevation_gain_ft ? `, ${rc.elevation_gain_ft.toLocaleString()} ft elevation gain` : ''}.`,
    suggested_action: 'Consider an alternative route, reduce vehicle weight, or ensure you have recovery equipment. Do not attempt technical sections without proper preparation.',
    type: 'caution',
    confidence: 'high',
    priority: 1,
    source_categories: ['risk_status', 'route_context', 'vehicle_profile'],
    from_live_telemetry: false,
  };
}

function _evalOfflineDataMissing(s: AssistantContextSnapshot): TriggerResult {
  const or = s.offline_readiness;
  const rc = s.route_context;
  const rs = s.remoteness_status;
  const fired = _isAvail(rc.availability) && rc.has_active_route &&
    (!or.has_offline_data || !or.covers_active_route) &&
    (_isAvail(rs.availability) ? (rs.remoteness_score ?? 0) > 30 : true);

  return {
    trigger: 'offline_data_missing',
    fired,
    title: 'Offline Data Missing for Route',
    body: `No offline data covers your active route${_isAvail(rs.availability) ? ` (remoteness: ${rs.remoteness_tier})` : ''}. Download before departure.`,
    explanation: `Your active route "${rc.route_name || 'loaded'}" is not covered by cached offline data. ${or.has_offline_data ? `You have ${or.downloaded_regions} region(s) cached, but they do not cover this route.` : 'No offline expedition data has been downloaded.'} If you lose connectivity during the expedition, navigation and discovery features will be unavailable for this route.`,
    suggested_action: 'Download offline regions covering your route before departure. Use the Discover tab to cache expedition data for the route area.',
    type: 'recommendation',
    confidence: 'medium',
    priority: 3,
    source_categories: ['offline_readiness', 'route_context'],
    from_live_telemetry: false,
  };
}

function _evalCriticalLoadoutMissing(s: AssistantContextSnapshot): TriggerResult {
  const ls = s.loadout_status;
  const fired = _isAvail(ls.availability) && ls.has_active_loadout && ls.critical_missing > 0;

  return {
    trigger: 'critical_loadout_missing',
    fired,
    title: `${ls.critical_missing} Critical Item${ls.critical_missing !== 1 ? 's' : ''} Missing`,
    body: `Your loadout has ${ls.critical_missing} critical item${ls.critical_missing !== 1 ? 's' : ''} not yet packed. Readiness: ${ls.readiness_pct}%.`,
    explanation: `Your active loadout "${ls.loadout_name || 'current'}" has ${ls.critical_missing} critical item${ls.critical_missing !== 1 ? 's' : ''} that are not packed. Critical items are essential for expedition safety and operation. Total items: ${ls.total_items}, packed: ${ls.packed_items}, readiness: ${ls.readiness_pct}%.${ls.total_weight_lbs ? ` Current loadout weight: ${ls.total_weight_lbs.toLocaleString()} lb.` : ''}`,
    suggested_action: 'Open the Loadout tab and pack all critical items before departure. Do not depart with missing critical gear.',
    type: 'caution',
    confidence: 'high',
    priority: 1,
    source_categories: ['loadout_status'],
    from_live_telemetry: false,
  };
}

function _evalVehicleAnomaly(s: AssistantContextSnapshot): TriggerResult {
  const vh = s.vehicle_health;
  const fired = _isAvail(vh.availability) && vh.has_live_telemetry && vh.has_anomaly && vh.anomaly_flags.length > 0;

  const flagDescriptions: Record<string, string> = {
    low_battery_voltage: 'Low battery voltage (< 11.8V) \u2014 possible charging system issue',
    high_coolant_temp: 'High coolant temperature (> 230\u00B0F) \u2014 possible overheating',
    critically_low_fuel: 'Critically low fuel (< 10%)',
    check_engine_light: 'Check engine light is on',
    low_oil_pressure: 'Low oil pressure detected',
  };

  const details = vh.anomaly_flags.map(f => flagDescriptions[f] || f).join('. ');

  return {
    trigger: 'vehicle_anomaly',
    fired,
    title: 'Vehicle Health Anomaly',
    body: `${vh.anomaly_flags.length} anomal${vh.anomaly_flags.length !== 1 ? 'ies' : 'y'} detected: ${vh.anomaly_flags.join(', ')}.`,
    explanation: `Live vehicle telemetry has detected ${vh.anomaly_flags.length} anomal${vh.anomaly_flags.length !== 1 ? 'ies' : 'y'}. ${details}. Battery: ${vh.battery_voltage ?? '?'}V (${vh.battery_health}). Engine: ${vh.engine_status}. ${vh.coolant_temp_f != null ? `Coolant: ${vh.coolant_temp_f}\u00B0F.` : ''} ${vh.fuel_percent != null ? `Fuel: ${vh.fuel_percent}%.` : ''}`,
    suggested_action: 'Inspect the vehicle before proceeding. Address any anomalies \u2014 especially check engine lights and overheating \u2014 before entering remote areas.',
    type: 'caution',
    confidence: 'high',
    priority: 1,
    source_categories: ['vehicle_health'],
    from_live_telemetry: true,
  };
}

function _evalRemotenessHighUnprepared(s: AssistantContextSnapshot): TriggerResult {
  const rs = s.remoteness_status;
  const or = s.offline_readiness;
  const fired = _isAvail(rs.availability) && rs.engine_running &&
    (rs.remoteness_score ?? 0) > 60 &&
    (!rs.cache_ready || !or.has_offline_data);

  return {
    trigger: 'remoteness_high_unprepared',
    fired,
    title: 'Remote Area \u2014 Not Prepared',
    body: `Remoteness: ${rs.remoteness_tier} (score: ${rs.remoteness_score}/100). No offline cache available for this area.`,
    explanation: `You are in a ${rs.remoteness_tier} area (remoteness score: ${rs.remoteness_score}/100). ${!rs.cache_ready ? 'The remoteness engine reports no offline cache for this area.' : ''} ${!or.has_offline_data ? 'No offline expedition data has been downloaded.' : `Offline data: ${or.downloaded_regions} region(s), but coverage may be insufficient.`} In highly remote areas, offline data is essential for navigation, discovery, and safety.`,
    suggested_action: 'Download offline expedition data for this area while you still have connectivity. Ensure you have emergency communications equipment.',
    type: 'caution',
    confidence: rs.availability === 'available' ? 'high' : 'medium',
    priority: 2,
    source_categories: ['remoteness_status', 'offline_readiness'],
    from_live_telemetry: rs.availability === 'available',
  };
}


// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

/**
 * All trigger evaluators in priority order.
 */
const ALL_EVALUATORS: ((s: AssistantContextSnapshot) => TriggerResult)[] = [
  _evalRiskCritical,
  _evalRiskElevated,
  _evalLoadOverweight,
  _evalLoadUnbalanced,
  _evalPowerCritical,
  _evalPowerLimited,
  _evalFuelCritical,
  _evalFuelLow,
  _evalWaterLow,
  _evalConnectivityLostNoCache,
  _evalRouteExceedsCapability,
  _evalOfflineDataMissing,
  _evalCriticalLoadoutMissing,
  _evalVehicleAnomaly,
  _evalRemotenessHighUnprepared,
];


/**
 * Compute context basis for guidance cards.
 */
function _computeBasis(s: AssistantContextSnapshot): ContextBasis {
  const avails = [
    s.vehicle_profile.availability,
    s.vehicle_health.availability,
    s.loadout_status.availability,
    s.power_status.availability,
    s.connectivity_status.availability,
    s.remoteness_status.availability,
    s.risk_status.availability,
    s.route_context.availability,
    s.offline_readiness.availability,
  ];
  const liveCount = avails.filter(a => a === 'available').length;
  const staleCount = avails.filter(a => a === 'stale').length;
  if (liveCount === 0 && staleCount === 0) return 'none';
  if (staleCount > 0 && liveCount === 0) return 'stale';
  if (liveCount >= avails.length * 0.7) return 'live';
  return 'partial';
}


/**
 * Evaluate all trigger conditions against the current context snapshot.
 *
 * Returns a list of newly generated guidance cards for conditions
 * that are currently active. Existing cards are passed in for
 * deduplication and auto-dismiss logic.
 *
 * @param snapshot - Current ECS context snapshot
 * @param existingCards - Currently active guidance cards
 * @returns Updated array of guidance cards (new + existing with resolved status)
 */
export function evaluateGuidance(
  snapshot: AssistantContextSnapshot,
  existingCards: AssistantGuidanceCard[],
): AssistantGuidanceCard[] {
  const startTime = Date.now();
  const basis = _computeBasis(snapshot);

  // Build a map of existing cards by trigger for dedup
  const existingByTrigger = new Map<GuidanceTriggerCondition, AssistantGuidanceCard>();
  for (const card of existingCards) {
    if (!card.dismissed) {
      existingByTrigger.set(card.trigger, card);
    }
  }

  // Evaluate all triggers
  const results: TriggerResult[] = [];
  const firedTriggers = new Set<GuidanceTriggerCondition>();

  for (const evaluator of ALL_EVALUATORS) {
    try {
      const result = evaluator(snapshot);
      results.push(result);
      if (result.fired) {
        firedTriggers.add(result.trigger);
      }
    } catch (e) {
      console.warn(TAG, 'Trigger evaluation error:', e);
    }
  }

  // Build updated card list
  const updatedCards: AssistantGuidanceCard[] = [];

  // 1. Process fired triggers — create new cards or keep existing
  for (const result of results) {
    if (!result.fired) continue;

    const existing = existingByTrigger.get(result.trigger);
    if (existing) {
      // Card already exists for this trigger — update it but keep same ID
      updatedCards.push({
        ...existing,
        title: result.title,
        body: result.body,
        explanation: result.explanation,
        suggested_action: result.suggested_action,
        confidence: result.confidence,
        context_basis: basis,
        from_live_telemetry: result.from_live_telemetry,
        resolved: false,
        resolved_at: null,
      });
    } else {
      // New card
      updatedCards.push({
        id: _id(),
        title: result.title,
        body: result.body,
        explanation: result.explanation,
        suggested_action: result.suggested_action,
        type: result.type,
        confidence: result.confidence,
        priority: result.priority,
        trigger: result.trigger,
        source_categories: result.source_categories,
        context_basis: basis,
        dismissed: false,
        resolved: false,
        expanded: false,
        from_live_telemetry: result.from_live_telemetry,
        generated_at: _now(),
        resolved_at: null,
      });
    }
  }

  // 2. Process existing cards whose triggers no longer fire — mark resolved
  for (const card of existingCards) {
    if (card.dismissed) continue; // Skip dismissed cards entirely
    if (firedTriggers.has(card.trigger)) continue; // Already handled above

    // Trigger no longer fires — auto-dismiss by marking resolved
    updatedCards.push({
      ...card,
      resolved: true,
      resolved_at: card.resolved_at || _now(),
    });
  }

  // 3. Sort by priority (lower = higher priority), then by generated_at
  updatedCards.sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1; // Active first
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.generated_at < b.generated_at ? 1 : -1; // Newer first within same priority
  });

  const elapsed = Date.now() - startTime;
  const activeCount = updatedCards.filter(c => !c.resolved && !c.dismissed).length;
  const resolvedCount = updatedCards.filter(c => c.resolved).length;

  console.log(TAG, `Evaluation: ${firedTriggers.size} trigger(s) fired, ${activeCount} active card(s), ${resolvedCount} resolved, ${elapsed}ms`);

  return updatedCards;
}


/**
 * Get a simplified summary of active guidance for Android Auto / CarPlay.
 * Returns only the highest-priority active card summary text.
 */
export function getGuidanceSummaryForCompanion(cards: AssistantGuidanceCard[]): string | null {
  const active = cards.filter(c => !c.dismissed && !c.resolved);
  if (active.length === 0) return null;

  // Return highest priority card
  const top = active[0]; // Already sorted by priority
  return `${top.title}: ${top.body}`;
}


/**
 * Count active (non-dismissed, non-resolved) guidance cards.
 */
export function countActiveGuidance(cards: AssistantGuidanceCard[]): number {
  return cards.filter(c => !c.dismissed && !c.resolved).length;
}


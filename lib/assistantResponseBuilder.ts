/**
 * ═══════════════════════════════════════════════════════════
 * ECS AI EXPEDITION ASSISTANT — Response Builder
 * (Phase 7B + Integration Pass 4)
 * ═══════════════════════════════════════════════════════════
 *
 * Intelligent, ECS-context-aware response builder that:
 *   - Classifies user query intent
 *   - Routes queries to specialized handlers
 *   - Generates structured, concise, operationally relevant responses
 *   - Computes context basis (live/partial/stale/none)
 *   - Prioritizes ECS context over generic advice
 *   - Handles missing context gracefully with limited-context explanations
 *   - Cross-references multiple ECS systems for compound assessments
 *
 * Supported Intents:
 *   readiness_check, vehicle_status, power_status, risk_assessment,
 *   route_analysis, offline_readiness, loadout_check, connectivity_check,
 *   remoteness_check, expedition_overview, general
 *
 * Integration Pass 4 additions:
 *   - risk_detail intent for "biggest risk", "why risk increased"
 *   - stability_check intent for "loadout affecting stability"
 *   - Bridge-based risk interpretation for dashboard coherence
 *   - Cross-system risk explanation with system attribution
 *   - Enhanced sub-score reporting (all 7 factors)
 *
 * Phase 7B: Full context-aware response generation.
 */

import type {
  AssistantContextSnapshot,
  AssistantResponse,
  AssistantResponseBlock,
  AssistantConfidenceLevel,
  AssistantContextCategory,
  ContextBasis,
  QueryIntent,
  ContextAvailability,
} from './assistantTypes';

const TAG = '[AI-ASSISTANT-RESP]';

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


// ══════════════════════════════════════════════════════════
// QUERY INTENT CLASSIFICATION
// ══════════════════════════════════════════════════════════

const INTENT_PATTERNS: { intent: QueryIntent; patterns: RegExp[] }[] = [
  {
    intent: 'readiness_check',
    patterns: [
      /\bready\b/i, /\bprepared?\b/i, /\bgo\s+for\b/i,
      /\bam\s+i\s+ready/i, /\bcan\s+i\s+go/i, /\bshould\s+i\s+go/i,
      /\bpre-?launch/i, /\blaunch\s+check/i, /\bfit\s+to\s+go/i,
    ],
  },
  {
    intent: 'vehicle_status',
    patterns: [
      /\bvehicle\b/i, /\btruck\b/i, /\bcar\b/i, /\brig\b/i,
      /\bengine\b/i, /\bfuel\b/i, /\bcoolant\b/i,
      /\bvehicle\s+health/i, /\bvehicle\s+status/i,
    ],
  },
  {
    intent: 'power_status',
    patterns: [
      /\bpower\b/i, /\bbattery\b/i, /\bsolar\b/i, /\bcharg/i,
      /\bwatt/i, /\bamp/i, /\benergy\b/i, /\bblu\b/i,
      /\bsustainable?\b/i, /\bruntime\b/i,
    ],
  },
  {
    intent: 'risk_assessment',
    patterns: [
      /\brisk/i, /\bdanger/i, /\bsafe/i, /\bhazard/i,
      /\bbiggest\s+(current\s+)?risk/i, /\bthreat/i,
      /\bconcern/i, /\bworr/i,
    ],
  },
  {
    intent: 'route_analysis',
    patterns: [
      /\broute\b/i, /\btrail\b/i, /\bdistance\b/i, /\bnavigate?\b/i,
      /\belevation\b/i, /\bwaypoint/i, /\bpath\b/i, /\bdirection/i,
    ],
  },
  {
    intent: 'offline_readiness',
    patterns: [
      /\boffline/i, /\bcache/i, /\bdownload/i,
      /\boffline.?ready/i, /\bno\s+signal/i,
      /\bwithout\s+(internet|service|signal)/i,
    ],
  },
  {
    intent: 'loadout_check',
    patterns: [
      /\bloadout\b/i, /\bgear\b/i, /\bpack/i, /\bweight\b/i,
      /\bitem/i, /\bstabilit/i, /\boverweight/i, /\bpayload/i,
      /\bcritical\s+item/i, /\bcargo\b/i,
    ],
  },
  {
    intent: 'connectivity_check',
    patterns: [
      /\bconnect/i, /\bsignal\b/i, /\bnetwork\b/i,
      /\bwifi\b/i, /\bcellular\b/i, /\blte\b/i,
      /\binternet\b/i, /\bonline\b/i,
    ],
  },
  {
    intent: 'remoteness_check',
    patterns: [
      /\bremote/i, /\bisolat/i, /\bcivilization/i,
      /\bhow\s+far\b/i, /\bbackcountry/i, /\bwilderness/i,
    ],
  },
  {
    intent: 'expedition_overview',
    patterns: [
      /\boverview\b/i, /\bsummary\b/i, /\bbrief\b/i,
      /\bstatus\s+report/i, /\bsitrep/i, /\bexpedition\s+status/i,
      /\bhow\s+am\s+i\s+doing/i, /\bwhat'?s?\s+my\s+status/i,
    ],
  },
];

/**
 * Classify the intent of a user query.
 */
export function classifyIntent(query: string): QueryIntent {
  const q = query.toLowerCase().trim();

  // Score each intent by number of matching patterns
  let bestIntent: QueryIntent = 'general';
  let bestScore = 0;

  for (const { intent, patterns } of INTENT_PATTERNS) {
    const score = patterns.filter(p => p.test(q)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  console.log(TAG, `Intent classified: "${query.substring(0, 40)}..." → ${bestIntent} (score: ${bestScore})`);
  return bestIntent;
}


// ══════════════════════════════════════════════════════════
// CONTEXT BASIS COMPUTATION
// ══════════════════════════════════════════════════════════

/**
 * Compute the context basis from a snapshot.
 * Determines how much live ECS data contributed to the response.
 */
export function computeContextBasis(snapshot: AssistantContextSnapshot): ContextBasis {
  const avails: ContextAvailability[] = [
    snapshot.vehicle_profile.availability,
    snapshot.vehicle_health.availability,
    snapshot.loadout_status.availability,
    snapshot.power_status.availability,
    snapshot.connectivity_status.availability,
    snapshot.remoteness_status.availability,
    snapshot.risk_status.availability,
    snapshot.route_context.availability,
    snapshot.offline_readiness.availability,
  ];

  const liveCount = avails.filter(a => a === 'available').length;
  const staleCount = avails.filter(a => a === 'stale').length;
  const total = avails.length;

  if (liveCount === 0 && staleCount === 0) return 'none';
  if (staleCount > 0 && liveCount === 0) return 'stale';
  if (liveCount + staleCount < total * 0.5) return 'partial';
  if (staleCount > liveCount) return 'stale';
  if (liveCount >= total * 0.7) return 'live';
  return 'partial';
}

function _computeConfidence(snapshot: AssistantContextSnapshot): AssistantConfidenceLevel {
  const pct = snapshot.total_count > 0
    ? (snapshot.available_count / snapshot.total_count) * 100
    : 0;
  if (pct >= 70) return 'high';
  if (pct >= 40) return 'medium';
  return 'low';
}

function _isAvail(a: ContextAvailability): boolean {
  return a === 'available' || a === 'stale';
}

function _blockConf(a: ContextAvailability): AssistantConfidenceLevel {
  if (a === 'available') return 'high';
  if (a === 'stale') return 'medium';
  return 'low';
}


// ══════════════════════════════════════════════════════════
// INTENT-SPECIFIC RESPONSE HANDLERS
// ══════════════════════════════════════════════════════════

function _now(): string { return new Date().toISOString(); }

function _block(
  type: AssistantResponseBlock['type'],
  text: string,
  confidence: AssistantConfidenceLevel,
  sources: AssistantContextCategory[],
): AssistantResponseBlock {
  return { id: _id(), type, text, confidence, source_categories: sources, generated_at: _now() };
}


// ── Readiness Check ──────────────────────────────────────

function _handleReadinessCheck(s: AssistantContextSnapshot): AssistantResponseBlock[] {
  const blocks: AssistantResponseBlock[] = [];
  const issues: string[] = [];
  const strengths: string[] = [];

  // Vehicle
  if (_isAvail(s.vehicle_profile.availability) && s.vehicle_profile.has_specs) {
    strengths.push(`Vehicle configured: ${s.vehicle_profile.vehicle_name || 'configured'}`);
  } else {
    issues.push('Vehicle profile not configured');
  }

  // Loadout
  if (_isAvail(s.loadout_status.availability) && s.loadout_status.has_active_loadout) {
    if (s.loadout_status.critical_missing > 0) {
      issues.push(`${s.loadout_status.critical_missing} critical loadout item(s) missing`);
    } else if (s.loadout_status.readiness_pct >= 90) {
      strengths.push(`Loadout ${s.loadout_status.readiness_pct}% ready`);
    } else {
      issues.push(`Loadout only ${s.loadout_status.readiness_pct}% ready`);
    }
    if (s.loadout_status.is_overweight) {
      issues.push('Vehicle is overweight');
    }
  } else {
    issues.push('No active loadout configured');
  }

  // Power
  if (_isAvail(s.power_status.availability) && s.power_status.has_blu_telemetry) {
    if ((s.power_status.battery_percent ?? 0) < 30) {
      issues.push(`Power low: ${s.power_status.battery_percent}% battery`);
    } else {
      strengths.push(`Power: ${s.power_status.battery_percent}% battery`);
    }
  }

  // Route
  if (_isAvail(s.route_context.availability) && s.route_context.has_active_route) {
    strengths.push(`Route loaded: ${s.route_context.route_name || 'active'}`);
  } else {
    issues.push('No active route loaded');
  }

  // Offline
  if (_isAvail(s.offline_readiness.availability) && s.offline_readiness.has_offline_data) {
    if (s.offline_readiness.covers_active_route) {
      strengths.push('Offline data covers route');
    } else {
      issues.push('Offline data does not cover active route');
    }
  }

  // Risk
  if (_isAvail(s.risk_status.availability) && s.risk_status.is_complete) {
    if (s.risk_status.risk_score > 60) {
      issues.push(`Risk score elevated: ${s.risk_status.risk_score}/100 (${s.risk_status.primary_risk_label})`);
    } else {
      strengths.push(`Risk: ${s.risk_status.operational_status}`);
    }
  }

  // Build summary
  const readyPct = Math.round((strengths.length / Math.max(strengths.length + issues.length, 1)) * 100);
  const conf = _computeConfidence(s);

  if (issues.length === 0 && strengths.length > 0) {
    blocks.push(_block('summary', `Expedition readiness: GOOD. All checked systems are in order. ${strengths.join('. ')}.`, conf,
      ['vehicle_profile', 'loadout_status', 'power_status', 'route_context', 'offline_readiness', 'risk_status']));
  } else if (issues.length > 0) {
    blocks.push(_block('summary', `Expedition readiness: ${readyPct}%. ${strengths.length} system(s) ready, ${issues.length} issue(s) found.`, conf,
      ['vehicle_profile', 'loadout_status', 'power_status', 'route_context', 'offline_readiness', 'risk_status']));

    for (const issue of issues.slice(0, 3)) {
      blocks.push(_block('caution', issue, conf, []));
    }

    if (strengths.length > 0) {
      blocks.push(_block('recommendation', `Strengths: ${strengths.join(', ')}. Address the issues above before departure.`, conf, []));
    }
  } else {
    blocks.push(_block('suggested_action', 'Limited system data available. Configure your vehicle, load a route, and set up your loadout for a comprehensive readiness assessment.', 'low', []));
  }

  return blocks;
}


// ── Vehicle Status ───────────────────────────────────────

function _handleVehicleStatus(s: AssistantContextSnapshot): AssistantResponseBlock[] {
  const blocks: AssistantResponseBlock[] = [];
  const vp = s.vehicle_profile;
  const vh = s.vehicle_health;

  if (_isAvail(vp.availability)) {
    const parts: string[] = [];
    if (vp.vehicle_name) parts.push(vp.vehicle_name);
    if (vp.make && vp.model) parts.push(`${vp.make} ${vp.model}`);
    if (vp.vehicle_type) parts.push(`Type: ${vp.vehicle_type}`);
    if (vp.gvwr_lb) parts.push(`GVWR: ${vp.gvwr_lb.toLocaleString()} lb`);
    if (vp.fuel_tank_capacity_gal) parts.push(`Fuel tank: ${vp.fuel_tank_capacity_gal} gal (${vp.fuel_type || 'unknown'})`);

    blocks.push(_block('summary', `Vehicle Profile: ${parts.join(' | ')}`, _blockConf(vp.availability), ['vehicle_profile']));
  } else {
    blocks.push(_block('suggested_action', 'No vehicle profile configured. Set up your vehicle in the Fleet tab for vehicle-aware guidance.', 'low', ['vehicle_profile']));
  }

  if (_isAvail(vh.availability) && vh.has_live_telemetry) {
    const healthParts: string[] = [`Engine: ${vh.engine_status}`];
    if (vh.battery_voltage) healthParts.push(`Battery: ${vh.battery_voltage}V (${vh.battery_health})`);
    if (vh.fuel_percent != null) healthParts.push(`Fuel: ${vh.fuel_percent}%`);
    if (vh.coolant_temp_f != null) healthParts.push(`Coolant: ${vh.coolant_temp_f}\u00B0F`);

    blocks.push(_block('summary', `Live Telemetry (${vh.telemetry_freshness}): ${healthParts.join(' | ')}`, _blockConf(vh.availability), ['vehicle_health']));

    if (vh.has_anomaly && vh.anomaly_flags.length > 0) {
      blocks.push(_block('caution', `Vehicle anomalies detected: ${vh.anomaly_flags.join(', ')}. Inspect before departure.`, 'high', ['vehicle_health']));
    }

    if (vh.fuel_percent != null && vh.fuel_percent < 25) {
      blocks.push(_block('caution', `Fuel level is low (${vh.fuel_percent}%). Consider refueling before heading into remote areas.`, _blockConf(vh.availability), ['vehicle_health']));
    }

    if (vh.battery_voltage != null && vh.battery_voltage < 12.0) {
      blocks.push(_block('caution', `Battery voltage is low (${vh.battery_voltage}V). This may indicate a charging system issue.`, _blockConf(vh.availability), ['vehicle_health']));
    }
  } else if (_isAvail(vp.availability)) {
    blocks.push(_block('recommendation', 'No live vehicle telemetry connected. Connect an OBD2 adapter for real-time health monitoring.', 'medium', ['vehicle_health']));
  }

  return blocks;
}


// ── Power Status ─────────────────────────────────────────

function _handlePowerStatus(s: AssistantContextSnapshot): AssistantResponseBlock[] {
  const blocks: AssistantResponseBlock[] = [];
  const ps = s.power_status;

  if (_isAvail(ps.availability) && ps.has_blu_telemetry) {
    const parts: string[] = [`${ps.device_count} device(s)`];
    if (ps.battery_percent != null) parts.push(`Battery: ${ps.battery_percent}%`);
    if (ps.input_watts != null) parts.push(`Input: ${ps.input_watts}W`);
    if (ps.output_watts != null) parts.push(`Output: ${ps.output_watts}W`);
    if (ps.runtime_minutes != null) {
      const hrs = Math.floor(ps.runtime_minutes / 60);
      const mins = ps.runtime_minutes % 60;
      parts.push(`Runtime: ${hrs}h ${mins}m`);
    }

    blocks.push(_block('summary', `Power System: ${parts.join(' | ')}`, _blockConf(ps.availability), ['power_status']));

    if (!ps.is_sustainable) {
      const deficit = (ps.output_watts ?? 0) - (ps.input_watts ?? 0);
      blocks.push(_block('caution', `Power is not sustainable \u2014 output exceeds input by ${deficit}W. Battery will deplete over time.`, _blockConf(ps.availability), ['power_status']));
      blocks.push(_block('recommendation', 'Reduce power consumption or increase solar/charging input to achieve sustainability.', 'medium', ['power_status']));
    } else {
      blocks.push(_block('summary', 'Power is sustainable \u2014 input meets or exceeds output. Good for extended operation.', _blockConf(ps.availability), ['power_status']));
    }

    if (ps.battery_percent != null && ps.battery_percent < 20) {
      blocks.push(_block('caution', `Battery critically low (${ps.battery_percent}%). Prioritize charging or reduce non-essential loads.`, 'high', ['power_status']));
    }
  } else {
    blocks.push(_block('suggested_action', 'No power devices connected. Pair a BLU-compatible power station for real-time power monitoring and sustainability tracking.', 'low', ['power_status']));
  }

  return blocks;
}

// ── Risk Assessment (Integration Pass 4: Enhanced) ───────
// Uses the Risk ↔ Assistant Bridge for canonical risk interpretation.
// Ensures the assistant never contradicts the dashboard Risk Indicator.
// Provides operational explanations from real ECS inputs.
// Detects specific risk sub-questions and routes to bridge answers.

/**
 * Sub-intent patterns for specific risk questions.
 * These are checked WITHIN the risk_assessment intent handler
 * to provide precise, bridge-based answers.
 */
const RISK_SUB_INTENTS: { question: string; patterns: RegExp[] }[] = [
  {
    question: 'biggest_risk',
    patterns: [
      /\bbiggest\s+(current\s+)?risk/i,
      /\bwhat\s+is\s+my\s+(biggest|main|primary|top)\s+risk/i,
      /\bwhat\s+risk/i,
      /\bgreatest\s+concern/i,
      /\bmost\s+dangerous/i,
    ],
  },
  {
    question: 'why_risk_increased',
    patterns: [
      /\bwhy\s+(did|has)\s+(my\s+)?risk\s+(increase|go\s+up|rise|change)/i,
      /\brisk\s+increase/i,
      /\bwhat\s+caused\s+(the\s+)?risk/i,
      /\bwhy\s+is\s+(my\s+)?risk\s+(higher|elevated|worse)/i,
    ],
  },
  {
    question: 'offline_ready',
    patterns: [
      /\bam\s+i\s+offline[\s-]?ready/i,
      /\boffline\s+ready/i,
      /\bcan\s+i\s+go\s+offline/i,
      /\bready\s+for\s+offline/i,
      /\bwork\s+without\s+(internet|signal|service)/i,
    ],
  },
  {
    question: 'loadout_stability',
    patterns: [
      /\bloadout\s+affect(ing)?\s+stability/i,
      /\bstability/i,
      /\bweight\s+(affect|impact|distribution)/i,
      /\boverweight/i,
      /\bload\s+(balance|imbalance)/i,
      /\btilt\s+risk/i,
    ],
  },
];

function _detectRiskSubIntent(query: string): string | null {
  const q = query.toLowerCase().trim();
  for (const { question, patterns } of RISK_SUB_INTENTS) {
    if (patterns.some(p => p.test(q))) return question;
  }
  return null;
}

function _handleRiskAssessment(s: AssistantContextSnapshot, query?: string): AssistantResponseBlock[] {
  const blocks: AssistantResponseBlock[] = [];
  const rk = s.risk_status;

  // Integration Pass 4: Detect specific sub-questions and route to bridge
  if (query) {
    const subIntent = _detectRiskSubIntent(query);
    if (subIntent) {
      try {
        const bridge = require('./riskAssistantBridge');
        const answer = bridge.answerRiskQuestion(subIntent, s);
        if (answer) {
          blocks.push(_block(
            rk.risk_score > 50 ? 'caution' : 'summary',
            answer,
            _isAvail(rk.availability) ? _blockConf(rk.availability) : 'medium',
            ['risk_status'],
          ));
          // Log the bridge-based answer
          console.log(TAG, `Risk sub-intent "${subIntent}" answered via bridge`);
          return blocks;
        }
      } catch (e) {
        // Bridge failure is non-fatal — fall through to standard handler
        console.warn(TAG, 'Risk bridge sub-intent handler error (non-fatal):', e);
      }
    }
  }

  // Integration Pass 4: Use the bridge for canonical interpretation
  let bridgeExplanation: string | null = null;
  try {
    const bridge = require('./riskAssistantBridge');
    const interp = bridge.getRiskInterpretation();
    if (interp.available) {
      bridgeExplanation = bridge.generateRiskExplanation(interp);
    }
  } catch {}

  if (_isAvail(rk.availability) && rk.is_complete) {
    // Integration Pass 4: Use stabilized_status to match dashboard exactly
    const displayStatus = rk.stabilized_status || rk.operational_status;

    blocks.push(_block(
      rk.risk_score > 50 ? 'caution' : 'summary',
      `Risk Score: ${rk.risk_score}/100 (${displayStatus}). ${rk.summary_line}`,
      _blockConf(rk.availability),
      ['risk_status'],
    ));

    // Integration Pass 4: Enhanced sub-score breakdown with all 7 factors
    const subScoreParts: string[] = [
      `Primary concern: ${rk.primary_risk_label}`,
      `Capability: ${rk.capability_score}/100`,
      `Resource readiness: ${rk.resource_readiness}/100`,
    ];
    if (rk.health_score > 0) subScoreParts.push(`Vehicle health: ${rk.health_score}/100`);
    subScoreParts.push(`Connectivity risk: ${rk.connectivity_risk}/100`);
    subScoreParts.push(`Isolation risk: ${rk.isolation_risk}/100`);
    if (rk.route_difficulty_score > 0) subScoreParts.push(`Route difficulty: ${rk.route_difficulty_score}/100`);
    if (rk.resource_route_balance < 100) subScoreParts.push(`Resource-route balance: ${rk.resource_route_balance}/100`);

    blocks.push(_block('summary', subScoreParts.join('. ') + '.', _blockConf(rk.availability), ['risk_status']));

    // Integration Pass 4: Use bridge explanation if available (adds system attribution)
    if (bridgeExplanation && bridgeExplanation.length > rk.summary_line.length + 20) {
      blocks.push(_block('summary', bridgeExplanation, _blockConf(rk.availability), ['risk_status']));
    }

    // Cross-reference with connectivity and remoteness
    if (_isAvail(s.connectivity_status.availability) && rk.connectivity_risk > 50) {
      blocks.push(_block('caution',
        `Connectivity contributes to elevated risk. Current state: ${s.connectivity_status.connectivity_state} (${s.connectivity_status.signal_quality}). ${s.connectivity_status.offline_cache_ready ? 'Offline cache is available.' : 'No offline cache \u2014 consider downloading data.'}`,
        'medium',
        ['risk_status', 'connectivity_status'],
      ));
    }

    if (_isAvail(s.remoteness_status.availability) && rk.isolation_risk > 50) {
      blocks.push(_block('caution',
        `Isolation contributes to elevated risk. Remoteness: ${s.remoteness_status.remoteness_tier} (score: ${s.remoteness_status.remoteness_score}/100).`,
        'medium',
        ['risk_status', 'remoteness_status'],
      ));
    }

    // Integration Pass 4: Cross-reference BLU power if unsustainable
    if (_isAvail(s.power_status.availability) && s.power_status.has_blu_telemetry && !s.power_status.is_sustainable) {
      blocks.push(_block('caution',
        `BLU power is not sustainable (input: ${s.power_status.input_watts ?? 0}W, output: ${s.power_status.output_watts ?? 0}W). This contributes to resource risk.`,
        'medium',
        ['risk_status', 'power_status'],
      ));
    }

    // Integration Pass 4: Cross-reference OBD telemetry if anomalies
    if (_isAvail(s.vehicle_health.availability) && s.vehicle_health.has_anomaly) {
      blocks.push(_block('caution',
        `Vehicle telemetry anomalies detected: ${s.vehicle_health.anomaly_flags.join(', ')}. This contributes to vehicle health risk.`,
        'high',
        ['risk_status', 'vehicle_health'],
      ));
    }

    if (rk.risk_score > 70) {
      blocks.push(_block('recommendation', 'Consider addressing the primary risk factor before proceeding. Review your loadout, connectivity preparations, and route alternatives.', 'high', ['risk_status']));
    }
  } else if (_isAvail(rk.availability)) {
    blocks.push(_block('summary', `Risk evaluation in progress: ${rk.summary_line}. Full assessment requires more system data.`, 'medium', ['risk_status']));
  } else {
    blocks.push(_block('suggested_action', 'Risk engine has not completed evaluation. Configure your vehicle, loadout, and route for a comprehensive risk assessment.', 'low', ['risk_status']));
  }

  return blocks;
}




// ── Route Analysis ───────────────────────────────────────

function _handleRouteAnalysis(s: AssistantContextSnapshot): AssistantResponseBlock[] {
  const blocks: AssistantResponseBlock[] = [];
  const rc = s.route_context;

  if (_isAvail(rc.availability) && rc.has_active_route) {
    const parts: string[] = [rc.route_name || 'Active Route'];
    if (rc.total_distance_mi) parts.push(`${rc.total_distance_mi.toFixed(1)} miles`);
    if (rc.elevation_gain_ft) parts.push(`${rc.elevation_gain_ft.toLocaleString()} ft elevation gain`);
    parts.push(`${rc.waypoint_count} waypoint(s)`);
    if (rc.segment_count > 0) parts.push(`${rc.segment_count} segment(s)`);
    if (rc.source_format) parts.push(`Source: ${rc.source_format.toUpperCase()}`);

    blocks.push(_block('summary', `Route: ${parts.join(' | ')}`, _blockConf(rc.availability), ['route_context']));

    // Cross-reference with offline readiness
    if (_isAvail(s.offline_readiness.availability)) {
      if (s.offline_readiness.covers_active_route) {
        blocks.push(_block('summary', 'Offline data covers this route. You can navigate even without connectivity.', _blockConf(s.offline_readiness.availability), ['route_context', 'offline_readiness']));
      } else if (s.offline_readiness.has_offline_data) {
        blocks.push(_block('caution', 'Offline data is available but does not fully cover this route. Consider downloading additional regions.', 'medium', ['route_context', 'offline_readiness']));
      } else {
        blocks.push(_block('caution', 'No offline data cached for this route. Download expedition data before entering remote areas.', 'medium', ['route_context', 'offline_readiness']));
      }
    }

    // Cross-reference with vehicle for fuel range
    if (_isAvail(s.vehicle_profile.availability) && s.vehicle_profile.fuel_tank_capacity_gal && rc.total_distance_mi) {
      // Rough estimate: 15 mpg off-road
      const estimatedRange = s.vehicle_profile.fuel_tank_capacity_gal * 15;
      if (rc.total_distance_mi > estimatedRange * 0.8) {
        blocks.push(_block('caution', `Route distance (${rc.total_distance_mi.toFixed(0)} mi) approaches estimated fuel range (~${estimatedRange} mi at 15 mpg off-road). Plan fuel stops.`, 'medium', ['route_context', 'vehicle_profile']));
      }
    }
  } else {
    blocks.push(_block('suggested_action', 'No active route loaded. Import a GPX, KML, or GeoJSON file in the Navigate tab for route-aware guidance.', 'low', ['route_context']));
  }

  return blocks;
}


// ── Offline Readiness ────────────────────────────────────

function _handleOfflineReadiness(s: AssistantContextSnapshot): AssistantResponseBlock[] {
  const blocks: AssistantResponseBlock[] = [];
  const or = s.offline_readiness;
  const cs = s.connectivity_status;

  if (_isAvail(or.availability) && or.has_offline_data) {
    blocks.push(_block('summary',
      `Offline Data: ${or.downloaded_regions} region(s), ${or.total_entries.toLocaleString()} entries, ${or.storage_mb.toFixed(1)} MB. Categories: ${or.available_categories.join(', ') || 'none'}.`,
      _blockConf(or.availability),
      ['offline_readiness'],
    ));

    if (or.covers_current_position && or.covers_active_route) {
      blocks.push(_block('summary', 'Offline data covers your current position and active route. You are offline-ready.', 'high', ['offline_readiness']));
    } else if (or.covers_current_position) {
      blocks.push(_block('recommendation', 'Offline data covers your current position but not the full route. Download additional regions for complete coverage.', 'medium', ['offline_readiness']));
    } else {
      blocks.push(_block('caution', 'Offline data does not cover your current position. Download regions for your area before losing connectivity.', 'medium', ['offline_readiness']));
    }

    if (!or.all_regions_valid) {
      blocks.push(_block('caution', 'Some offline regions have integrity issues. Validate or re-download affected regions.', 'medium', ['offline_readiness']));
    }
  } else {
    blocks.push(_block('caution', 'No offline expedition data cached. You will lose access to discovery and navigation data without connectivity.', 'low', ['offline_readiness']));
    blocks.push(_block('suggested_action', 'Download offline regions in the Discover tab before heading into remote areas.', 'low', ['offline_readiness']));
  }

  // Cross-reference with connectivity
  if (_isAvail(cs.availability)) {
    if (cs.connectivity_state === 'offline' || !cs.internet_reachable) {
      if (or.has_offline_data) {
        blocks.push(_block('summary', 'Currently offline. Cached expedition data is being used for navigation and discovery.', 'medium', ['offline_readiness', 'connectivity_status']));
      } else {
        blocks.push(_block('caution', 'Currently offline with no cached data. Navigation and discovery features will be limited.', 'low', ['offline_readiness', 'connectivity_status']));
      }
    }
  }

  return blocks;
}



// ── Loadout Check with Bridge (Integration Pass 4) ───────
// Detects stability sub-questions and routes to bridge answers.

function _handleLoadoutCheck(s: AssistantContextSnapshot): AssistantResponseBlock[] {
  const ls = s.loadout_status;

  if (!_isAvail(ls.availability)) {
    return [
      _block('summary', 'Loadout status is not currently available.', 'low', ['loadout_status']),
    ];
  }

  if (!ls.has_active_loadout) {
    return [
      _block(
        'suggested_action',
        'No active loadout is configured. Set up a loadout to evaluate readiness, critical items, and weight impact.',
        _blockConf(ls.availability),
        ['loadout_status'],
      ),
    ];
  }

  const blocks: AssistantResponseBlock[] = [
    _block(
      ls.is_overweight || ls.critical_missing > 0 ? 'caution' : 'summary',
      `Loadout readiness is ${ls.readiness_pct}%. ${ls.critical_missing} critical item(s) are missing and ${ls.packed_items}/${ls.total_items} items are packed.`,
      _blockConf(ls.availability),
      ['loadout_status'],
    ),
  ];

  if (ls.is_overweight) {
    blocks.push(
      _block(
        'caution',
        'The current loadout is overweight. Rebalance or reduce cargo before departure.',
        _blockConf(ls.availability),
        ['loadout_status'],
      ),
    );
  }

  return blocks;
}

function _handleLoadoutCheckWithBridge(s: AssistantContextSnapshot, query?: string): AssistantResponseBlock[] {
  // Integration Pass 4: Detect stability sub-questions via bridge
  if (query) {
    const stabilityPatterns = [
      /\bstabilit/i, /\btilt\s+risk/i, /\bload\s+(balance|imbalance)/i,
      /\bweight\s+distribut/i, /\baffect(ing)?\s+stability/i,
    ];
    if (stabilityPatterns.some(p => p.test(query))) {
      try {
        const bridge = require('./riskAssistantBridge');
        const answer = bridge.answerRiskQuestion('loadout_stability', s);
        if (answer) {
          return [_block(
            s.loadout_status.is_overweight ? 'caution' : 'summary',
            answer,
            _isAvail(s.loadout_status.availability) ? _blockConf(s.loadout_status.availability) : 'medium',
            ['loadout_status', 'risk_status'],
          )];
        }
      } catch {}
    }
  }
  // Fall through to standard loadout handler
  return _handleLoadoutCheck(s);
}

// ── Connectivity Check ───────────────────────────────────

function _handleConnectivityCheck(s: AssistantContextSnapshot): AssistantResponseBlock[] {
  const blocks: AssistantResponseBlock[] = [];
  const cs = s.connectivity_status;

  if (_isAvail(cs.availability)) {
    blocks.push(_block('summary',
      `Connectivity: ${cs.connectivity_state} (${cs.network_type}). Signal: ${cs.signal_quality}. Freshness: ${cs.freshness}. Readiness: ${cs.operational_readiness}.`,
      _blockConf(cs.availability),
      ['connectivity_status'],
    ));

    if (!cs.internet_reachable) {
      blocks.push(_block('caution', 'Internet is not reachable. Cloud sync, weather updates, and online features are unavailable.', _blockConf(cs.availability), ['connectivity_status']));
    }

    if (cs.offline_cache_ready) {
      blocks.push(_block('summary', 'Offline cache is ready. Core features will continue working without connectivity.', _blockConf(cs.availability), ['connectivity_status']));
    } else if (!cs.internet_reachable) {
      blocks.push(_block('caution', 'No offline cache available and no internet connection. Functionality will be limited.', 'low', ['connectivity_status']));
    }

    if (_isAvail(s.remoteness_status.availability)) {
      const rs = s.remoteness_status;
      if ((rs.remoteness_score ?? 0) > 60 && !cs.offline_cache_ready) {
        blocks.push(_block('recommendation', `You are in a remote area (${rs.remoteness_tier}) without offline cache. Download expedition data while you still have connectivity.`, 'medium', ['connectivity_status', 'remoteness_status']));
      }
    }
  } else {
    blocks.push(_block('suggested_action', 'Connectivity Intelligence is not initialized. It will activate automatically as network conditions are detected.', 'low', ['connectivity_status']));
  }

  return blocks;
}


// ── Remoteness Check ─────────────────────────────────────

function _handleRemotenessCheck(s: AssistantContextSnapshot): AssistantResponseBlock[] {
  const blocks: AssistantResponseBlock[] = [];
  const rs = s.remoteness_status;

  if (_isAvail(rs.availability) && rs.engine_running) {
    blocks.push(_block(
      (rs.remoteness_score ?? 0) > 60 ? 'caution' : 'summary',
      `Remoteness: ${rs.remoteness_tier} (score: ${rs.remoteness_score}/100). ${rs.cache_ready ? 'Offline cache available.' : 'No offline cache for this area.'}`,
      _blockConf(rs.availability),
      ['remoteness_status'],
    ));

    if ((rs.remoteness_score ?? 0) > 80) {
      blocks.push(_block('caution', 'You are in a highly remote area. Ensure you have offline data, sufficient fuel, and emergency communications.', 'high', ['remoteness_status']));
    } else if ((rs.remoteness_score ?? 0) > 50) {
      blocks.push(_block('recommendation', 'Moderate remoteness. Verify offline data coverage and check your resource levels.', 'medium', ['remoteness_status']));
    }

    if (_isAvail(s.offline_readiness.availability) && !s.offline_readiness.has_offline_data && (rs.remoteness_score ?? 0) > 40) {
      blocks.push(_block('suggested_action', 'Download offline expedition data for your area. Remote locations require cached data for reliable navigation.', 'medium', ['remoteness_status', 'offline_readiness']));
    }
  } else {
    blocks.push(_block('suggested_action', 'Remoteness engine is not running. It activates when GPS location is available.', 'low', ['remoteness_status']));
  }

  return blocks;
}


// ── Expedition Overview ──────────────────────────────────

function _handleExpeditionOverview(s: AssistantContextSnapshot): AssistantResponseBlock[] {
  const blocks: AssistantResponseBlock[] = [];
  const parts: string[] = [];

  if (_isAvail(s.risk_status.availability) && s.risk_status.is_complete) {
    parts.push(`Risk: ${s.risk_status.operational_status} (${s.risk_status.risk_score}/100)`);
  }
  if (_isAvail(s.vehicle_profile.availability) && s.vehicle_profile.vehicle_name) {
    parts.push(`Vehicle: ${s.vehicle_profile.vehicle_name}`);
  }
  if (_isAvail(s.route_context.availability) && s.route_context.has_active_route) {
    parts.push(`Route: ${s.route_context.route_name || 'Active'} (${s.route_context.total_distance_mi?.toFixed(1) || '?'} mi)`);
  }
  if (_isAvail(s.loadout_status.availability) && s.loadout_status.has_active_loadout) {
    parts.push(`Loadout: ${s.loadout_status.readiness_pct}% ready`);
  }
  if (_isAvail(s.power_status.availability) && s.power_status.has_blu_telemetry) {
    parts.push(`Power: ${s.power_status.battery_percent ?? '?'}%`);
  }
  if (_isAvail(s.connectivity_status.availability)) {
    parts.push(`Connectivity: ${s.connectivity_status.connectivity_state}`);
  }
  if (_isAvail(s.remoteness_status.availability) && s.remoteness_status.engine_running) {
    parts.push(`Remoteness: ${s.remoteness_status.remoteness_tier}`);
  }
  if (_isAvail(s.offline_readiness.availability) && s.offline_readiness.has_offline_data) {
    parts.push(`Offline: ${s.offline_readiness.downloaded_regions} region(s)`);
  }

  const conf = _computeConfidence(s);

  if (parts.length > 0) {
    blocks.push(_block('summary',
      `ECS Expedition Status (${s.available_count}/${s.total_count} systems reporting): ${parts.join(' | ')}`,
      conf,
      ['vehicle_profile', 'risk_status', 'route_context', 'loadout_status', 'power_status', 'connectivity_status', 'remoteness_status', 'offline_readiness'],
    ));
  } else {
    blocks.push(_block('suggested_action',
      'No ECS systems are currently reporting data. Configure your vehicle, load a route, set up your loadout, and connect power devices for a comprehensive expedition overview.',
      'low', [],
    ));
    return blocks;
  }

  if (_isAvail(s.risk_status.availability) && s.risk_status.risk_score > 50) {
    blocks.push(_block('caution', `Top concern: ${s.risk_status.primary_risk_label}. ${s.risk_status.summary_line}`, conf, ['risk_status']));
  }
  if (_isAvail(s.loadout_status.availability) && s.loadout_status.critical_missing > 0) {
    blocks.push(_block('caution', `${s.loadout_status.critical_missing} critical loadout item(s) missing.`, conf, ['loadout_status']));
  }
  if (_isAvail(s.power_status.availability) && !s.power_status.is_sustainable && s.power_status.has_blu_telemetry) {
    blocks.push(_block('caution', 'Power is not sustainable \u2014 output exceeds input.', conf, ['power_status']));
  }

  return blocks;
}


// ── General / Fallback ───────────────────────────────────

function _handleGeneral(query: string, s: AssistantContextSnapshot): AssistantResponseBlock[] {
  const blocks: AssistantResponseBlock[] = [];
  const conf = _computeConfidence(s);

  if (s.available_count > 0) {
    blocks.push(_block('summary',
      `I have access to ${s.available_count}/${s.total_count} ECS systems. I can help with expedition readiness, vehicle status, power monitoring, risk assessment, route analysis, offline data, loadout management, connectivity, and remoteness evaluation. Try asking a specific question about your expedition.`,
      conf, [],
    ));

    const issues: string[] = [];
    if (_isAvail(s.risk_status.availability) && s.risk_status.risk_score > 60) {
      issues.push(`Elevated risk (${s.risk_status.risk_score}/100): ${s.risk_status.primary_risk_label}`);
    }
    if (_isAvail(s.loadout_status.availability) && s.loadout_status.critical_missing > 0) {
      issues.push(`${s.loadout_status.critical_missing} critical loadout item(s) missing`);
    }
    if (_isAvail(s.power_status.availability) && !s.power_status.is_sustainable && s.power_status.has_blu_telemetry) {
      issues.push('Power not sustainable');
    }

    if (issues.length > 0) {
      blocks.push(_block('caution', `Current issues detected: ${issues.join('. ')}.`, conf, []));
    }
  } else {
    blocks.push(_block('suggested_action',
      'Limited ECS context available. Configure your vehicle, load a route, and set up your loadout to enable comprehensive expedition guidance.',
      'low', [],
    ));
  }

  return blocks;
}


// ══════════════════════════════════════════════════════════
// PUBLIC API — Response Builder
// ══════════════════════════════════════════════════════════

/**
 * Build a structured, ECS-context-aware response to a user query.
 */
export function buildResponse(
  query: string,
  snapshot: AssistantContextSnapshot,
): AssistantResponse {
  const startTime = Date.now();

  try {
    const intent = classifyIntent(query);
    const basis = computeContextBasis(snapshot);
    let blocks: AssistantResponseBlock[];

    switch (intent) {
      case 'readiness_check':
        blocks = _handleReadinessCheck(snapshot);
        break;
      case 'vehicle_status':
        blocks = _handleVehicleStatus(snapshot);
        break;
      case 'power_status':
        blocks = _handlePowerStatus(snapshot);
        break;
      case 'risk_assessment':
        blocks = _handleRiskAssessment(snapshot, query);
        break;
      case 'route_analysis':
        blocks = _handleRouteAnalysis(snapshot);
        break;
      case 'offline_readiness':
        blocks = _handleOfflineReadiness(snapshot);
        break;
      case 'loadout_check':
        blocks = _handleLoadoutCheckWithBridge(snapshot, query);
        break;
      case 'connectivity_check':
        blocks = _handleConnectivityCheck(snapshot);
        break;
      case 'remoteness_check':
        blocks = _handleRemotenessCheck(snapshot);
        break;
      case 'expedition_overview':
        blocks = _handleExpeditionOverview(snapshot);
        break;
      default:
        blocks = _handleGeneral(query, snapshot);
    }

    const confidence = _computeConfidence(snapshot);
    if (basis === 'none') {
      blocks.push(_block('caution', 'No live ECS data available. This response is based on general guidance only. Configure ECS systems for context-aware assistance.', 'low', []));
    } else if (basis === 'stale') {
      blocks.push(_block('recommendation', 'This response is based on stale ECS data. Refresh your systems for the most current guidance.', 'low', []));
    }

    const response: AssistantResponse = {
      id: _id(),
      query,
      blocks,
      confidence,
      context_available: snapshot.available_count,
      context_total: snapshot.total_count,
      mode: 'placeholder',
      context_basis: basis,
      query_intent: intent,
      generated_at: _now(),
    };

    const elapsed = Date.now() - startTime;
    console.log(TAG, `Response built: intent=${intent}, basis=${basis}, confidence=${confidence}, blocks=${blocks.length}, ${elapsed}ms`);

    return response;

  } catch (e) {
    console.error(TAG, 'Response build error:', e);

    return {
      id: _id(),
      query,
      blocks: [_block('caution', 'An error occurred while generating a response. Please try again.', 'low', [])],
      confidence: 'low',
      context_available: snapshot.available_count,
      context_total: snapshot.total_count,
      mode: 'placeholder',
      context_basis: 'none',
      query_intent: 'general',
      generated_at: _now(),
    };
  }
}


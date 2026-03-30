/**
 * ECS Adaptive Expedition Guidance — Phase 11 + Phase 12
 * ========================================================
 *
 * Analyzes outputs from PredictiveExpeditionAwareness,
 * OfflineExpeditionIntelligence, and CollaborativeExpeditionIntelligence
 * to generate recommended actions during an expedition.
 *
 * GUIDANCE CATEGORIES:
 *   1. Fuel Safety — fuel margin, return-to-fuel suggestions
 *   2. Daylight Safety — camp before dark, sunset warnings
 *   3. Terrain Safety — difficult terrain ahead, speed reduction
 *   4. Remoteness Safety — isolation warnings, turnaround point
 *   5. Weather Safety — storm risk, wind exposure
 *   6. Bailout Routes — nearby exit routes when conditions worsen
 *   7. Collaborative — community-reported hazards, campsites, etc. (Phase 12)
 *
 * ACTIVATION:
 *   - Active during ExpeditionDrive mode
 *   - Evaluates every 45 seconds
 *   - Generates suggestions, not automatic decisions
 *
 * PRIORITY SYSTEM:
 *   Info → Advisory → Warning → Critical
 *   Highest priority displayed first.
 *
 * DISMISSAL:
 *   - Users can dismiss messages
 *   - Dismissed messages suppressed for 12 minutes
 *   - Prevents repeated annoying alerts
 *
 * ARCHITECTURE:
 *   - Singleton store with subscribe/get pattern
 *   - Timer-driven evaluation (45s)
 *   - Reads from Phase 9 + Phase 10 + Phase 12 outputs
 *   - Does NOT modify the mobile dashboard
 *   - Does NOT replace existing systems
 *   - Does NOT automatically reroute navigation
 */


import type {
  AdaptiveGuidanceOutput,
  GuidanceMessage,
  GuidanceSummary,
  GuidancePriority,
  GuidanceCategory,
  NearbyBailoutInfo,
} from './adaptiveGuidanceTypes';

import {
  GUIDANCE_PRIORITY_COLORS,
  GUIDANCE_PRIORITY_ICONS,
  GUIDANCE_PRIORITY_ORDER,
  GUIDANCE_CATEGORY_ICONS,
  DISMISSAL_SUPPRESSION_MS,
} from './adaptiveGuidanceTypes';

const TAG = '[ADAPTIVE_GUIDANCE]';

// ── Constants ───────────────────────────────────────────────

/** Evaluation interval (ms) — 45 seconds */

const EVALUATE_INTERVAL_MS = 45_000;

/** Maximum active messages to display (increased for Phase 12) */
const MAX_ACTIVE_MESSAGES = 8;

/** Earth radius in miles */
const EARTH_RADIUS_MI = 3958.8;

// ── Helpers ─────────────────────────────────────────────────

function generateId(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function haversineDistanceMi(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Dismissal Tracking ──────────────────────────────────────

/** Map of deduplicationKey → dismissal timestamp */
const _dismissals = new Map<string, number>();

function isDismissed(deduplicationKey: string): boolean {
  const dismissedAt = _dismissals.get(deduplicationKey);
  if (dismissedAt == null) return false;
  const elapsed = Date.now() - dismissedAt;
  if (elapsed > DISMISSAL_SUPPRESSION_MS) {
    _dismissals.delete(deduplicationKey);
    return false;
  }
  return true;
}

function dismissMessage(deduplicationKey: string): void {
  _dismissals.set(deduplicationKey, Date.now());
}

// ── Message Factory ─────────────────────────────────────────

function createMessage(
  category: GuidanceCategory,
  priority: GuidancePriority,
  message: string,
  detail: string | null = null,
  iconOverride?: string,
): GuidanceMessage {
  const deduplicationKey = `${category}:${priority}:${message.slice(0, 30)}`;

  return {
    id: generateId(),
    category,
    priority,
    message,
    detail,
    icon: iconOverride ?? GUIDANCE_CATEGORY_ICONS[category],
    color: GUIDANCE_PRIORITY_COLORS[priority],
    generatedAt: new Date().toISOString(),
    dismissed: isDismissed(deduplicationKey),
    dismissedAt: isDismissed(deduplicationKey) ? new Date(_dismissals.get(deduplicationKey)!).toISOString() : null,
    deduplicationKey,
  };
}

// ══════════════════════════════════════════════════════════════
// 1. FUEL SAFETY GUIDANCE
// ══════════════════════════════════════════════════════════════

function evaluateFuelGuidance(predictive: any): GuidanceMessage[] {
  const messages: GuidanceMessage[] = [];
  if (!predictive?.fuelPrediction?.available) return messages;

  const fuel = predictive.fuelPrediction;

  if (fuel.status === 'risk') {
    if (fuel.marginMi != null && fuel.marginMi < 0) {
      messages.push(createMessage(
        'fuel', 'critical',
        'Consider returning to last known fuel location',
        `Fuel shortfall: ${Math.abs(fuel.marginMi)} mi`,
        'flame-outline',
      ));
    } else {
      messages.push(createMessage(
        'fuel', 'warning',
        'Fuel risk high for planned route',
        fuel.fuelPercent != null ? `${fuel.fuelPercent}% remaining` : null,
      ));
    }
  } else if (fuel.status === 'caution') {
    messages.push(createMessage(
      'fuel', 'advisory',
      'Fuel margin low for current route',
      fuel.estimatedRangeMi != null ? `Est. range: ${fuel.estimatedRangeMi} mi` : null,
    ));
  }

  return messages;
}

// ══════════════════════════════════════════════════════════════
// 2. DAYLIGHT SAFETY GUIDANCE
// ══════════════════════════════════════════════════════════════

function evaluateDaylightGuidance(predictive: any): GuidanceMessage[] {
  const messages: GuidanceMessage[] = [];
  if (!predictive?.daylightPrediction?.available) return messages;

  const daylight = predictive.daylightPrediction;

  if (daylight.status === 'risk') {
    if (daylight.darknessLikely && daylight.daylightRemainingHours != null && daylight.daylightRemainingHours <= 0) {
      messages.push(createMessage(
        'daylight', 'warning',
        'After dark — exercise caution',
        'Consider establishing camp',
        'moon-outline',
      ));
    } else if (daylight.darknessLikely) {
      messages.push(createMessage(
        'daylight', 'warning',
        'Route completion likely after sunset',
        'Consider establishing camp before dark',
      ));
    }
  } else if (daylight.status === 'caution') {
    const remaining = daylight.daylightRemainingHours;
    if (remaining != null && remaining < 1.5) {
      messages.push(createMessage(
        'daylight', 'advisory',
        'Consider establishing camp before dark',
        `${remaining.toFixed(1)} hrs daylight remaining`,
      ));
    } else {
      messages.push(createMessage(
        'daylight', 'advisory',
        `Tight daylight margin`,
        daylight.sunsetTimeLocal ? `Sunset at ${daylight.sunsetTimeLocal}` : null,
      ));
    }
  }

  // Check for nearby campsite waypoint opportunity
  if (daylight.status === 'caution' || daylight.status === 'risk') {
    try {
      const { routeStore } = require('./routeStore');
      const activeRoute = routeStore.getActive();
      if (activeRoute?.waypoints) {
        const campWaypoint = activeRoute.waypoints.find((w: any) =>
          w.waypointType === 'camp' || w.waypointType === 'rest_stop' ||
          (w.name && /camp|rest|bivou/i.test(w.name))
        );
        if (campWaypoint) {
          messages.push(createMessage(
            'daylight', 'info',
            'Nearby campsite opportunity',
            campWaypoint.name || 'Camp waypoint on route',
            'bonfire-outline',
          ));
        }
      }
    } catch {}
  }

  return messages;
}

// ══════════════════════════════════════════════════════════════
// 3. TERRAIN SAFETY GUIDANCE
// ══════════════════════════════════════════════════════════════

function evaluateTerrainGuidance(predictive: any, offline: any): GuidanceMessage[] {
  const messages: GuidanceMessage[] = [];

  // Use predictive terrain exposure
  if (predictive?.terrainPrediction?.available) {
    const terrain = predictive.terrainPrediction;

    if (terrain.upcomingDifficulty === 'Extreme') {
      messages.push(createMessage(
        'terrain', 'warning',
        'Technical terrain ahead',
        'Consider evaluating alternate route',
        'warning-outline',
      ));
    } else if (terrain.upcomingDifficulty === 'Difficult') {
      messages.push(createMessage(
        'terrain', 'advisory',
        'Difficult terrain ahead',
        'Reduce speed and assess trail conditions',
      ));
    }

    if (terrain.technicalSectionAhead && terrain.upcomingDifficulty !== 'Extreme') {
      messages.push(createMessage(
        'terrain', 'advisory',
        'Technical trail section ahead',
        terrain.slopeSeverity === 'steep' || terrain.slopeSeverity === 'extreme'
          ? 'Steep elevation change approaching'
          : null,
      ));
    }
  }

  // Use offline hazard indicators
  if (offline?.hazards?.length > 0) {
    for (const hazard of offline.hazards.slice(0, 2)) {
      if (hazard.severity === 'warning') {
        // Avoid duplicate terrain messages
        const alreadyHasTerrainWarning = messages.some(m =>
          m.category === 'terrain' && (m.priority === 'warning' || m.priority === 'critical')
        );
        if (!alreadyHasTerrainWarning) {
          messages.push(createMessage(
            'terrain', 'advisory',
            hazard.message,
            null,
            hazard.icon,
          ));
        }
      }
    }
  }

  // Use offline elevation alerts
  if (offline?.elevationAlerts?.length > 0) {
    for (const alert of offline.elevationAlerts.slice(0, 1)) {
      if (alert.severity === 'high') {
        const alreadyHasElevation = messages.some(m =>
          m.message.toLowerCase().includes('elevation') || m.message.toLowerCase().includes('steep')
        );
        if (!alreadyHasElevation) {
          messages.push(createMessage(
            'terrain', 'advisory',
            alert.message,
            null,
            alert.icon,
          ));
        }
      }
    }
  }

  return messages;
}

// ══════════════════════════════════════════════════════════════
// 4. REMOTENESS SAFETY GUIDANCE
// ══════════════════════════════════════════════════════════════

function evaluateRemotenessGuidance(predictive: any, offline: any): GuidanceMessage[] {
  const messages: GuidanceMessage[] = [];

  // Use predictive remoteness exposure
  if (predictive?.remotenessPrediction?.available) {
    const remoteness = predictive.remotenessPrediction;

    if (remoteness.status === 'risk') {
      if (remoteness.trend === 'increasing') {
        messages.push(createMessage(
          'remoteness', 'warning',
          'Extreme remoteness ahead',
          'Consider establishing a turnaround point',
        ));
      } else if (remoteness.isolationRisk) {
        messages.push(createMessage(
          'remoteness', 'warning',
          'Isolation risk high',
          'Ensure adequate supplies and fuel',
        ));
      }
    } else if (remoteness.status === 'caution') {
      if (remoteness.trend === 'increasing') {
        messages.push(createMessage(
          'remoteness', 'advisory',
          'Remoteness increasing',
          'Ensure adequate supplies and fuel',
        ));
      }
    }
  }

  // Fallback to offline remoteness
  if (messages.length === 0 && offline?.remoteness) {
    const rem = offline.remoteness;
    if (rem.score > 75) {
      messages.push(createMessage(
        'remoteness', 'warning',
        `${rem.tier} — high isolation`,
        'Consider establishing a turnaround point',
      ));
    } else if (rem.score > 50) {
      messages.push(createMessage(
        'remoteness', 'advisory',
        `Remote area — ${rem.tier}`,
        'Monitor supplies and fuel',
      ));
    }
  }

  return messages;
}

// ══════════════════════════════════════════════════════════════
// 5. WEATHER SAFETY GUIDANCE
// ══════════════════════════════════════════════════════════════

function evaluateWeatherGuidance(offline: any): GuidanceMessage[] {
  const messages: GuidanceMessage[] = [];

  if (!offline?.weatherAwareness?.available) return messages;

  const weather = offline.weatherAwareness;

  // Storm risk
  if (weather.stormRisk === 'high') {
    messages.push(createMessage(
      'weather', 'warning',
      'Storm risk increasing',
      'Consider delaying route progress',
      'thunderstorm-outline',
    ));
  } else if (weather.stormRisk === 'moderate') {
    messages.push(createMessage(
      'weather', 'advisory',
      'Moderate storm risk',
      weather.description || null,
      'rainy-outline',
    ));
  }

  // Wind exposure
  if (weather.windSpeedMph != null && weather.windSpeedMph > 30) {
    messages.push(createMessage(
      'weather', 'warning',
      'High wind conditions',
      'Exercise caution on exposed terrain',
      'flag-outline',
    ));
  } else if (weather.windSpeedMph != null && weather.windSpeedMph > 20) {
    // Only add if we don't already have a weather warning
    if (messages.length === 0 || messages[0].priority !== 'warning') {
      messages.push(createMessage(
        'weather', 'info',
        `Wind ${Math.round(weather.windSpeedMph)} mph`,
        weather.windDirection ? `From ${weather.windDirection}` : null,
        'flag-outline',
      ));
    }
  }

  // Stale weather data warning
  if (weather.staleness === 'very_stale') {
    messages.push(createMessage(
      'weather', 'info',
      'Weather data outdated',
      weather.ageLabel ? `Last update: ${weather.ageLabel}` : 'No recent weather data',
      'cloud-offline-outline',
    ));
  }

  return messages;
}

// ══════════════════════════════════════════════════════════════
// 6. BAILOUT ROUTE AWARENESS
// ══════════════════════════════════════════════════════════════

function evaluateBailoutGuidance(
  bailoutInfo: NearbyBailoutInfo,
  hasRisks: boolean,
): GuidanceMessage[] {
  const messages: GuidanceMessage[] = [];

  if (!bailoutInfo.available || bailoutInfo.totalNearby === 0) return messages;

  // Only suggest bailout routes when conditions are worsening
  if (hasRisks && bailoutInfo.nearestDistanceMi != null) {
    if (bailoutInfo.nearestDistanceMi < 5) {
      messages.push(createMessage(
        'bailout', 'info',
        'Possible exit route nearby',
        bailoutInfo.nearestName
          ? `${bailoutInfo.nearestName} — ${bailoutInfo.nearestDistanceMi.toFixed(1)} mi`
          : `${bailoutInfo.nearestDistanceMi.toFixed(1)} mi away`,
      ));
    } else if (bailoutInfo.nearestDistanceMi < 15) {
      messages.push(createMessage(
        'bailout', 'info',
        'Consider alternate route',
        bailoutInfo.nearestName
          ? `${bailoutInfo.nearestName} — ${bailoutInfo.nearestDistanceMi.toFixed(1)} mi`
          : `Nearest exit: ${bailoutInfo.nearestDistanceMi.toFixed(1)} mi`,
      ));
    }
  }

  return messages;
}


// ══════════════════════════════════════════════════════════════
// 7. COLLABORATIVE INTELLIGENCE GUIDANCE (Phase 12)
// ══════════════════════════════════════════════════════════════

function evaluateCollaborativeGuidance(): GuidanceMessage[] {
  const messages: GuidanceMessage[] = [];

  try {
    const { collaborativeExpeditionIntelligence } = require('./collaborativeExpeditionIntelligence');
    const relevant = collaborativeExpeditionIntelligence.getGuidanceRelevant();

    if (!relevant || relevant.length === 0) return messages;

    // Process guidance-relevant observations
    for (const obs of relevant) {
      const distLabel = obs.distance_km != null
        ? obs.distance_km < 1
          ? `${Math.round(obs.distance_km * 1000)}m ahead`
          : `${obs.distance_km.toFixed(1)} km ahead`
        : 'nearby';

      switch (obs.observation_type) {
        case 'hazard': {
          const priority: GuidancePriority =
            obs.confidence_level >= 3 ? 'warning' : 'advisory';
          messages.push(createMessage(
            'collaborative', priority,
            'Hazard reported ahead',
            obs.description || distLabel,
            'warning-outline',
          ));
          break;
        }

        case 'blocked_route': {
          const priority: GuidancePriority =
            obs.confidence_level >= 3 ? 'warning' : 'advisory';
          messages.push(createMessage(
            'collaborative', priority,
            'Blocked trail reported',
            obs.description || distLabel,
            'close-circle-outline',
          ));
          break;
        }

        case 'water_crossing': {
          messages.push(createMessage(
            'collaborative', 'advisory',
            'Water crossing ahead',
            obs.description || distLabel,
            'water-outline',
          ));
          break;
        }

        case 'trail_difficulty': {
          messages.push(createMessage(
            'collaborative', 'advisory',
            'Difficult trail reported ahead',
            obs.description || distLabel,
            'trail-sign-outline',
          ));
          break;
        }

        case 'campsite': {
          messages.push(createMessage(
            'collaborative', 'info',
            'Possible campsite nearby',
            obs.description || distLabel,
            'bonfire-outline',
          ));
          break;
        }

        case 'fuel_availability': {
          messages.push(createMessage(
            'collaborative', 'info',
            'Fuel availability reported nearby',
            obs.description || distLabel,
            'speedometer-outline',
          ));
          break;
        }
      }

      // Limit to 3 collaborative messages max
      if (messages.length >= 3) break;
    }
  } catch (err) {
    // Collaborative intelligence not available — graceful degradation
  }

  return messages;
}



// ══════════════════════════════════════════════════════════════
// BAILOUT INFO COMPUTATION
// ══════════════════════════════════════════════════════════════

function computeBailoutInfo(
  currentLat: number | null,
  currentLon: number | null,
): NearbyBailoutInfo {
  if (currentLat == null || currentLon == null) {
    return {
      available: false,
      nearestName: null,
      nearestDistanceMi: null,
      nearestType: null,
      totalNearby: 0,
    };
  }

  try {
    const { bailoutStore } = require('./bailoutStore');
    const allBailouts = bailoutStore.getAll();

    if (allBailouts.length === 0) {
      return {
        available: false,
        nearestName: null,
        nearestDistanceMi: null,
        nearestType: null,
        totalNearby: 0,
      };
    }

    let nearestDist = Infinity;
    let nearestPoint: any = null;
    let nearbyCount = 0;

    for (const bp of allBailouts) {
      const dist = haversineDistanceMi(currentLat, currentLon, bp.lat, bp.lng);
      if (dist < 25) nearbyCount++;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestPoint = bp;
      }
    }

    return {
      available: true,
      nearestName: nearestPoint?.title ?? null,
      nearestDistanceMi: nearestDist < 100 ? Math.round(nearestDist * 10) / 10 : null,
      nearestType: nearestPoint?.type ?? null,
      totalNearby: nearbyCount,
    };
  } catch {
    return {
      available: false,
      nearestName: null,
      nearestDistanceMi: null,
      nearestType: null,
      totalNearby: 0,
    };
  }
}

// ══════════════════════════════════════════════════════════════
// SUMMARY COMPUTATION
// ══════════════════════════════════════════════════════════════

function computeSummary(messages: GuidanceMessage[]): GuidanceSummary {
  const active = messages.filter(m => !m.dismissed);

  const criticalCount = active.filter(m => m.priority === 'critical').length;
  const warningCount = active.filter(m => m.priority === 'warning').length;
  const advisoryCount = active.filter(m => m.priority === 'advisory').length;
  const infoCount = active.filter(m => m.priority === 'info').length;

  let highestPriority: GuidancePriority | null = null;
  if (criticalCount > 0) highestPriority = 'critical';
  else if (warningCount > 0) highestPriority = 'warning';
  else if (advisoryCount > 0) highestPriority = 'advisory';
  else if (infoCount > 0) highestPriority = 'info';

  // Top message: highest priority, most recent
  const sorted = [...active].sort((a, b) => {
    const pDiff = GUIDANCE_PRIORITY_ORDER[b.priority] - GUIDANCE_PRIORITY_ORDER[a.priority];
    if (pDiff !== 0) return pDiff;
    return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
  });

  return {
    totalActive: active.length,
    criticalCount,
    warningCount,
    advisoryCount,
    infoCount,
    highestPriority,
    topMessage: sorted[0] ?? null,
  };
}

// ══════════════════════════════════════════════════════════════
// DEFAULT OUTPUT
// ══════════════════════════════════════════════════════════════

function createDefaultOutput(): AdaptiveGuidanceOutput {
  return {
    isActive: false,
    evaluatedAt: new Date().toISOString(),
    isExpeditionDrive: false,
    messages: [],
    summary: {
      totalActive: 0,
      criticalCount: 0,
      warningCount: 0,
      advisoryCount: 0,
      infoCount: 0,
      highestPriority: null,
      topMessage: null,
    },
    bailoutInfo: {
      available: false,
      nearestName: null,
      nearestDistanceMi: null,
      nearestType: null,
      totalNearby: 0,
    },
    totalGenerated: 0,
    totalDismissed: 0,
  };
}

// ══════════════════════════════════════════════════════════════
// CORE EVALUATION
// ══════════════════════════════════════════════════════════════

function _evaluate(): void {
  try {
    // ── Check if we should be active ──
    let isExpeditionDrive = false;
    try {
      const { vehicleDisplayStore } = require('./vehicleDisplayStore');
      isExpeditionDrive = vehicleDisplayStore.getMode() === 'expedition_drive';
    } catch {}

    let hasActiveExpedition = false;
    try {
      const { missionExpeditionStore } = require('./missionStore');
      const activeExp = missionExpeditionStore.getActive();
      hasActiveExpedition = activeExp != null && activeExp.status === 'active';
    } catch {}

    const shouldBeActive = isExpeditionDrive || hasActiveExpedition;

    if (!shouldBeActive) {
      if (_cachedOutput?.isActive) {
        _cachedOutput = { ...createDefaultOutput(), isActive: false };
        _notify();
      }
      return;
    }

    // ── Gather intelligence outputs ──

    // Phase 10: Predictive Expedition Awareness
    let predictive: any = null;
    try {
      const { predictiveExpeditionAwareness } = require('./predictiveExpeditionAwareness');
      predictive = predictiveExpeditionAwareness.get();
    } catch {}

    // Phase 9: Offline Expedition Intelligence
    let offline: any = null;
    try {
      const { offlineExpeditionIntelligence } = require('./offlineExpeditionIntelligence');
      offline = offlineExpeditionIntelligence.get();
    } catch {}

    // GPS position for bailout computation
    let currentLat: number | null = null;
    let currentLon: number | null = null;
    try {
      const { gpsUIState } = require('./gpsUIState');
      const gps = gpsUIState.get();
      if (gps.hasFix && gps.position) {
        currentLat = gps.position.latitude;
        currentLon = gps.position.longitude;
      }
    } catch {}

    // ── Evaluate guidance for each category ──

    const allMessages: GuidanceMessage[] = [];

    // 1. Fuel Safety Guidance
    allMessages.push(...evaluateFuelGuidance(predictive));

    // 2. Daylight Safety Guidance
    allMessages.push(...evaluateDaylightGuidance(predictive));

    // 3. Terrain Safety Guidance
    allMessages.push(...evaluateTerrainGuidance(predictive, offline));

    // 4. Remoteness Safety Guidance
    allMessages.push(...evaluateRemotenessGuidance(predictive, offline));

    // 5. Weather Safety Guidance
    allMessages.push(...evaluateWeatherGuidance(offline));

    // 6. Bailout Route Awareness
    const bailoutInfo = computeBailoutInfo(currentLat, currentLon);
    const hasRisks = allMessages.some(m =>
      !m.dismissed && (m.priority === 'warning' || m.priority === 'critical')
    );
    allMessages.push(...evaluateBailoutGuidance(bailoutInfo, hasRisks));

    // 7. Collaborative Intelligence Guidance (Phase 12)
    allMessages.push(...evaluateCollaborativeGuidance());


    // ── Deduplicate messages ──
    const seen = new Set<string>();
    const deduped: GuidanceMessage[] = [];
    for (const msg of allMessages) {
      if (!seen.has(msg.deduplicationKey)) {
        seen.add(msg.deduplicationKey);
        deduped.push(msg);
      }
    }

    // ── Sort by priority (highest first), then by time ──
    deduped.sort((a, b) => {
      const pDiff = GUIDANCE_PRIORITY_ORDER[b.priority] - GUIDANCE_PRIORITY_ORDER[a.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
    });

    // ── Limit to max active messages ──
    const limited = deduped.slice(0, MAX_ACTIVE_MESSAGES);

    // ── Compute summary ──
    const summary = computeSummary(limited);

    // ── Build output ──
    const totalDismissed = limited.filter(m => m.dismissed).length;

    const output: AdaptiveGuidanceOutput = {
      isActive: true,
      evaluatedAt: new Date().toISOString(),
      isExpeditionDrive,
      messages: limited,
      summary,
      bailoutInfo,
      totalGenerated: limited.length,
      totalDismissed,
    };

    // ── Check for meaningful change ──
    if (_cachedOutput && !_hasChanged(_cachedOutput, output)) {
      return;
    }

    _cachedOutput = output;
    _notify();

  } catch (err) {
    console.warn(TAG, 'Evaluation error:', err);
  }
}

/**
 * Check if the output has meaningfully changed.
 */
function _hasChanged(
  prev: AdaptiveGuidanceOutput,
  next: AdaptiveGuidanceOutput,
): boolean {
  if (prev.isActive !== next.isActive) return true;
  if (prev.isExpeditionDrive !== next.isExpeditionDrive) return true;

  // Check summary changes
  if (prev.summary.totalActive !== next.summary.totalActive) return true;
  if (prev.summary.highestPriority !== next.summary.highestPriority) return true;
  if (prev.summary.criticalCount !== next.summary.criticalCount) return true;
  if (prev.summary.warningCount !== next.summary.warningCount) return true;

  // Check top message change
  const prevTop = prev.summary.topMessage;
  const nextTop = next.summary.topMessage;
  if ((prevTop == null) !== (nextTop == null)) return true;
  if (prevTop && nextTop && prevTop.deduplicationKey !== nextTop.deduplicationKey) return true;

  // Check message deduplication keys
  const prevKeys = prev.messages.filter(m => !m.dismissed).map(m => m.deduplicationKey).sort().join(',');
  const nextKeys = next.messages.filter(m => !m.dismissed).map(m => m.deduplicationKey).sort().join(',');
  if (prevKeys !== nextKeys) return true;

  // Check bailout info changes
  if (prev.bailoutInfo.available !== next.bailoutInfo.available) return true;
  if (prev.bailoutInfo.totalNearby !== next.bailoutInfo.totalNearby) return true;

  return false;
}

// ══════════════════════════════════════════════════════════════
// INTERNAL STATE
// ══════════════════════════════════════════════════════════════

let _cachedOutput: AdaptiveGuidanceOutput | null = null;
let _evaluateTimer: ReturnType<typeof setInterval> | null = null;
let _isRunning = false;

// Listeners
type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify(): void {
  for (const fn of _listeners) {
    try { fn(); } catch {}
  }
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

export const adaptiveExpeditionGuidance = {
  /**
   * Get current guidance output.
   */
  get(): AdaptiveGuidanceOutput {
    if (_cachedOutput) return _cachedOutput;
    return createDefaultOutput();
  },

  /**
   * Start the adaptive guidance engine.
   * Begins periodic evaluation (every 45 seconds).
   */
  start(): void {
    if (_isRunning) return;
    _isRunning = true;

    console.log(TAG, 'Starting Adaptive Expedition Guidance');

    // Delay first evaluation slightly to let Phase 9/10 compute first
    setTimeout(() => {
      if (_isRunning) {
        _evaluate();
        _evaluateTimer = setInterval(_evaluate, EVALUATE_INTERVAL_MS);
      }
    }, 5000);
  },

  /**
   * Stop the adaptive guidance engine.
   */
  stop(): void {
    if (!_isRunning) return;
    _isRunning = false;

    if (_evaluateTimer) {
      clearInterval(_evaluateTimer);
      _evaluateTimer = null;
    }

    console.log(TAG, 'Stopped Adaptive Expedition Guidance');
  },

  /**
   * Whether the engine is actively evaluating.
   */
  isRunning(): boolean {
    return _isRunning;
  },

  /**
   * Force an immediate evaluation.
   */
  forceEvaluate(): void {
    _evaluate();
  },

  /**
   * Dismiss a guidance message by its deduplication key.
   * The message will be suppressed for 12 minutes.
   */
  dismiss(deduplicationKey: string): void {
    dismissMessage(deduplicationKey);
    // Re-evaluate to update dismissed state
    _evaluate();
    console.log(TAG, `Dismissed guidance: ${deduplicationKey}`);
  },

  /**
   * Dismiss a guidance message by its ID.
   */
  dismissById(messageId: string): void {
    const output = adaptiveExpeditionGuidance.get();
    const msg = output.messages.find(m => m.id === messageId);
    if (msg) {
      adaptiveExpeditionGuidance.dismiss(msg.deduplicationKey);
    }
  },

  /**
   * Clear all dismissals, allowing suppressed messages to reappear.
   */
  clearDismissals(): void {
    _dismissals.clear();
    _evaluate();
    console.log(TAG, 'Cleared all dismissals');
  },

  /**
   * Reset all state.
   */
  reset(): void {
    adaptiveExpeditionGuidance.stop();
    _cachedOutput = null;
    _dismissals.clear();
    _notify();
    console.log(TAG, 'Guidance state reset');
  },

  /**
   * Subscribe to guidance changes.
   * Returns unsubscribe function.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },

  // ── Convenience Accessors ─────────────────────────────────

  /**
   * Get active (non-dismissed) messages.
   */
  getActiveMessages(): GuidanceMessage[] {
    return adaptiveExpeditionGuidance.get().messages.filter(m => !m.dismissed);
  },

  /**
   * Get the guidance summary.
   */
  getSummary(): GuidanceSummary {
    return adaptiveExpeditionGuidance.get().summary;
  },

  /**
   * Get the top (most important) active message.
   */
  getTopMessage(): GuidanceMessage | null {
    return adaptiveExpeditionGuidance.get().summary.topMessage;
  },

  /**
   * Get the bailout route information.
   */
  getBailoutInfo(): NearbyBailoutInfo {
    return adaptiveExpeditionGuidance.get().bailoutInfo;
  },

  /**
   * Get a driver-safe banner line for the map screen.
   * Returns the top message text, or null if no active guidance.
   */
  getBannerLine(): { message: string; color: string; icon: string } | null {
    const top = adaptiveExpeditionGuidance.getTopMessage();
    if (!top) return null;
    return {
      message: top.message,
      color: top.color,
      icon: top.icon,
    };
  },

  /**
   * Get the count of active warnings + critical messages.
   */
  getAlertCount(): number {
    const summary = adaptiveExpeditionGuidance.getSummary();
    return summary.criticalCount + summary.warningCount;
  },

  /**
   * Get a compact status line for vehicle display.
   */
  getCompactStatus(): string {
    const output = adaptiveExpeditionGuidance.get();
    if (!output.isActive) return 'Guidance standby';
    if (output.summary.totalActive === 0) return 'No active guidance';

    const top = output.summary.topMessage;
    if (top) return top.message;

    return `${output.summary.totalActive} guidance items`;
  },
};


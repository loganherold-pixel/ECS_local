/**
 * ECS Predictive Intelligence Engine
 * ═══════════════════════════════════════════════════════════════
 *
 * Analyzes upcoming route segments to generate forward-looking
 * expedition advisories. This is the predictive layer of the
 * Expedition Intelligence system.
 *
 * Forward Analysis Window:
 *   • 5–20 miles ahead (distance-based)
 *   • 10–30 minutes of travel (time-based at current speed)
 *
 * Predictive Categories:
 *   • Route Awareness (terrain, grade, trail width)
 *   • Connectivity Forecast (signal coverage ahead)
 *   • Resource Planning (fuel/water sufficiency)
 *   • Environmental Conditions (weather, temperature, wind)
 *   • Expedition Timing (sunset, camp opportunities)
 *   • Elevation Changes (altitude gain/loss ahead)
 *
 * Personality: Calm, professional, tactical, minimal.
 *
 * Future-Ready Hooks:
 *   • Terrain risk forecasting
 *   • Seasonal trail conditions
 *   • Wildfire / closure alerts
 *   • Snowpack conditions
 *   • User driving style adaptation
 *   • Vehicle capability profiles
 *   • Crowd-sourced expedition reports
 */

import type { AdvisoryMode } from './advisoryStore';

// ── Types ────────────────────────────────────────────────

export type PredictiveConfidence = 'high' | 'moderate' | 'low';

export interface PredictiveMessage {
  id: string;
  text: string;
  mode: AdvisoryMode;
  priority: number;
  icon?: string;
  displayDuration?: number;
  interruptible?: boolean;
  confidence: PredictiveConfidence;
  source: 'predictive';
  /** Distance ahead in miles where condition is expected */
  distanceAheadMi?: number;
  /** Time ahead in minutes where condition is expected */
  timeAheadMin?: number;
}

export interface RouteSegmentAhead {
  /** Distance from current position in miles */
  distanceFromCurrentMi: number;
  /** Elevation at this point in feet */
  elevationFt: number | null;
  /** Latitude */
  lat: number;
  /** Longitude */
  lon: number;
}

export interface PredictiveContext {
  // ── Current Position ──────────────────────────────────
  currentLat?: number | null;
  currentLon?: number | null;
  currentAltitudeFt?: number | null;
  currentSpeedMph?: number | null;

  // ── Route Ahead ───────────────────────────────────────
  /** Sampled points along the route ahead (up to 20 miles) */
  routeSegmentsAhead?: RouteSegmentAhead[];
  /** Total route distance remaining in miles */
  routeDistanceRemainingMi?: number | null;
  /** Whether route contains off-pavement segments */
  hasOffPavementSegments?: boolean;

  // ── Resources ─────────────────────────────────────────
  fuelPercent?: number | null;
  fuelRangeMi?: number | null;
  waterPercent?: number | null;
  waterAutonomyDays?: number | null;
  powerPercent?: number | null;

  // ── Remoteness Ahead ──────────────────────────────────
  /** Current remoteness score (0-100) */
  currentRemotenessScore?: number;
  /** Estimated remoteness trend (increasing/decreasing/stable) */
  remotenessTrend?: 'increasing' | 'decreasing' | 'stable';

  // ── Weather Forecast ──────────────────────────────────
  /** Forecast wind speed in mph for next segment */
  forecastWindMph?: number | null;
  /** Forecast temperature in F for next segment */
  forecastTempF?: number | null;
  /** Forecast condition for next segment */
  forecastCondition?: string | null;
  /** Temperature change expected (degrees F) */
  tempChangeForecastF?: number | null;

  // ── Connectivity Forecast ─────────────────────────────
  /** Estimated signal strength ahead (0-100) */
  estimatedSignalAhead?: number | null;
  /** Whether canyon/valley terrain is ahead */
  canyonTerrainAhead?: boolean;

  // ── Time Context ──────────────────────────────────────
  hoursUntilSunset?: number | null;
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';

  // ── Vehicle Capability ────────────────────────────────
  vehicleType?: 'stock_suv' | 'built_4x4' | 'expedition_rig' | 'unknown';
}

// ── Haversine Distance (miles) ──────────────────────────

function haversineDistanceMi(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Message Factory ──────────────────────────────────────

function makePredictive(
  id: string,
  text: string,
  mode: AdvisoryMode,
  priority: number,
  confidence: PredictiveConfidence,
  opts?: {
    icon?: string;
    displayDuration?: number;
    interruptible?: boolean;
    distanceAheadMi?: number;
    timeAheadMin?: number;
  }
): PredictiveMessage {
  return {
    id: `pred-${id}`,
    text,
    mode,
    priority,
    confidence,
    source: 'predictive',
    icon: opts?.icon,
    displayDuration: opts?.displayDuration ?? (mode === 'alert' ? 6000 : 5000),
    interruptible: opts?.interruptible ?? (mode !== 'alert'),
    distanceAheadMi: opts?.distanceAheadMi,
    timeAheadMin: opts?.timeAheadMin,
  };
}

// ══════════════════════════════════════════════════════════
// PREDICTIVE EVALUATORS
// ══════════════════════════════════════════════════════════

// ── 1. Elevation / Grade Analysis ────────────────────────

function evaluateElevationAhead(ctx: PredictiveContext): PredictiveMessage[] {
  const msgs: PredictiveMessage[] = [];
  const segments = ctx.routeSegmentsAhead;
  if (!segments || segments.length < 2) return msgs;

  const currentAlt = ctx.currentAltitudeFt;
  if (currentAlt == null) return msgs;

  // Find max elevation ahead
  let maxElevAhead = currentAlt;
  let maxElevDistance = 0;
  let minElevAhead = currentAlt;

  for (const seg of segments) {
    if (seg.elevationFt != null) {
      if (seg.elevationFt > maxElevAhead) {
        maxElevAhead = seg.elevationFt;
        maxElevDistance = seg.distanceFromCurrentMi;
      }
      if (seg.elevationFt < minElevAhead) {
        minElevAhead = seg.elevationFt;
      }
    }
  }

  const gainAhead = maxElevAhead - currentAlt;
  const lossAhead = currentAlt - minElevAhead;

  // Steep climb ahead (>2000ft gain in next 10 miles)
  if (gainAhead > 2000 && maxElevDistance <= 10) {
    msgs.push(makePredictive(
      'steep-climb',
      `Steep grade approaching — ${Math.round(gainAhead).toLocaleString()} ft gain ahead`,
      'advisory', 3, 'high',
      { icon: 'trending-up-outline', distanceAheadMi: maxElevDistance }
    ));
  }
  // Moderate climb (>1000ft)
  else if (gainAhead > 1000 && maxElevDistance <= 15) {
    msgs.push(makePredictive(
      'moderate-climb',
      'Elevation gain ahead — monitor engine temperature',
      'advisory', 4, 'high',
      { icon: 'trending-up-outline', distanceAheadMi: maxElevDistance }
    ));
  }

  // High elevation ahead (>9000ft)
  if (maxElevAhead > 9000 && currentAlt < 9000) {
    msgs.push(makePredictive(
      'high-elev-ahead',
      `High elevation ahead — ${Math.round(maxElevAhead).toLocaleString()} ft`,
      'advisory', 4, 'high',
      { icon: 'trending-up-outline', distanceAheadMi: maxElevDistance }
    ));
  }

  // Steep descent ahead (>1500ft loss)
  if (lossAhead > 1500) {
    msgs.push(makePredictive(
      'steep-descent',
      'Steep descent ahead — use low gear',
      'advisory', 4, 'high',
      { icon: 'trending-down-outline' }
    ));
  }

  // Analyze grade steepness between consecutive points
  for (let i = 1; i < segments.length && i < 8; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];
    if (prev.elevationFt != null && curr.elevationFt != null) {
      const distMi = curr.distanceFromCurrentMi - prev.distanceFromCurrentMi;
      if (distMi > 0.1) {
        const elevChangeFt = Math.abs(curr.elevationFt - prev.elevationFt);
        const distFt = distMi * 5280;
        const gradePct = (elevChangeFt / distFt) * 100;

        if (gradePct > 15) {
          msgs.push(makePredictive(
            'extreme-grade',
            `Extreme grade detected ahead — ${Math.round(gradePct)}% slope`,
            'alert', 2, 'moderate',
            { icon: 'alert-circle-outline', distanceAheadMi: curr.distanceFromCurrentMi }
          ));
          break; // Only report the first extreme grade
        }
      }
    }
  }

  return msgs;
}

// ── 2. Resource Sufficiency Forecast ─────────────────────

function evaluateResourceForecast(ctx: PredictiveContext): PredictiveMessage[] {
  const msgs: PredictiveMessage[] = [];

  // Fuel range vs remaining route
  if (ctx.fuelRangeMi != null && ctx.routeDistanceRemainingMi != null) {
    const ratio = ctx.fuelRangeMi / ctx.routeDistanceRemainingMi;

    if (ratio < 0.8) {
      msgs.push(makePredictive(
        'fuel-insufficient',
        'Fuel range may not cover remaining route',
        'alert', 2, 'high',
        { icon: 'speedometer-outline' }
      ));
    } else if (ratio < 1.15) {
      msgs.push(makePredictive(
        'fuel-tight',
        'Fuel range tight for remaining route distance',
        'advisory', 3, 'high',
        { icon: 'speedometer-outline' }
      ));
    }
  }

  // Water autonomy forecast
  if (ctx.waterAutonomyDays != null && ctx.waterAutonomyDays < 1.5) {
    msgs.push(makePredictive(
      'water-forecast',
      `Water autonomy at ${ctx.waterAutonomyDays.toFixed(1)} days — plan resupply`,
      ctx.waterAutonomyDays < 0.5 ? 'alert' : 'advisory',
      ctx.waterAutonomyDays < 0.5 ? 2 : 3,
      'high',
      { icon: 'water-outline' }
    ));
  }

  // Power forecast for extended trip
  if (ctx.powerPercent != null && ctx.powerPercent < 30 &&
      ctx.routeDistanceRemainingMi != null && ctx.routeDistanceRemainingMi > 20) {
    msgs.push(makePredictive(
      'power-forecast',
      'Battery reserve below expedition target for remaining distance',
      'advisory', 3, 'high',
      { icon: 'battery-half-outline' }
    ));
  }

  return msgs;
}

// ── 3. Connectivity Forecast ─────────────────────────────

function evaluateConnectivityForecast(ctx: PredictiveContext): PredictiveMessage[] {
  const msgs: PredictiveMessage[] = [];

  // Canyon terrain ahead — GPS may weaken
  if (ctx.canyonTerrainAhead) {
    msgs.push(makePredictive(
      'canyon-gps',
      'GPS signal may weaken in canyon terrain ahead',
      'advisory', 4, 'moderate',
      { icon: 'navigate-outline' }
    ));
  }

  // Signal strength forecast
  if (ctx.estimatedSignalAhead != null && ctx.estimatedSignalAhead < 15) {
    msgs.push(makePredictive(
      'signal-drop-ahead',
      'Cell coverage likely to drop ahead',
      'advisory', 3, 'moderate',
      { icon: 'cellular-outline' }
    ));
  } else if (ctx.estimatedSignalAhead != null && ctx.estimatedSignalAhead < 30) {
    msgs.push(makePredictive(
      'signal-weak-ahead',
      'Low signal coverage expected ahead',
      'advisory', 4, 'moderate',
      { icon: 'cellular-outline' }
    ));
  }

  // Remoteness increasing
  if (ctx.remotenessTrend === 'increasing' && ctx.currentRemotenessScore != null) {
    if (ctx.currentRemotenessScore > 40) {
      msgs.push(makePredictive(
        'remoteness-increasing',
        'Remote terrain begins ahead — limited infrastructure expected',
        'advisory', 4, 'high',
        { icon: 'compass-outline' }
      ));
    }
  }

  return msgs;
}

// ── 4. Environmental Forecast ────────────────────────────

function evaluateEnvironmentalForecast(ctx: PredictiveContext): PredictiveMessage[] {
  const msgs: PredictiveMessage[] = [];

  // Wind forecast
  if (ctx.forecastWindMph != null) {
    if (ctx.forecastWindMph > 40) {
      msgs.push(makePredictive(
        'wind-severe-ahead',
        'High wind risk ahead along exposed sections',
        'alert', 2, 'moderate',
        { icon: 'flag-outline' }
      ));
    } else if (ctx.forecastWindMph > 25) {
      msgs.push(makePredictive(
        'wind-ahead',
        'High winds expected along route',
        'advisory', 4, 'moderate',
        { icon: 'flag-outline' }
      ));
    }
  }

  // Temperature forecast
  if (ctx.tempChangeForecastF != null) {
    if (ctx.tempChangeForecastF < -15) {
      msgs.push(makePredictive(
        'temp-drop-ahead',
        'Rapid temperature drop expected tonight',
        'advisory', 4, 'moderate',
        { icon: 'thermometer-outline' }
      ));
    } else if (ctx.tempChangeForecastF > 15) {
      msgs.push(makePredictive(
        'temp-rise-ahead',
        'Significant temperature increase expected ahead',
        'advisory', 5, 'moderate',
        { icon: 'thermometer-outline' }
      ));
    }
  }

  // Snow/ice at higher elevations
  if (ctx.forecastTempF != null && ctx.forecastTempF < 32) {
    const segments = ctx.routeSegmentsAhead;
    if (segments) {
      const highPoints = segments.filter(s => s.elevationFt != null && s.elevationFt > 7000);
      if (highPoints.length > 0) {
        msgs.push(makePredictive(
          'snow-possible-ahead',
          'Snow possible at higher elevations along route',
          'advisory', 3, 'low',
          { icon: 'snow-outline' }
        ));
      }
    }
  }

  // Severe weather forecast
  if (ctx.forecastCondition === 'storm' || ctx.forecastCondition === 'severe' ||
      ctx.forecastCondition === 'thunderstorm') {
    msgs.push(makePredictive(
      'severe-weather-ahead',
      'Severe weather risk along upcoming route segment',
      'alert', 2, 'moderate',
      { icon: 'thunderstorm-outline' }
    ));
  }

  return msgs;
}

// ── 5. Expedition Timing Forecast ────────────────────────

function evaluateTimingForecast(ctx: PredictiveContext): PredictiveMessage[] {
  const msgs: PredictiveMessage[] = [];

  // Sunset vs remaining route
  if (ctx.hoursUntilSunset != null && ctx.routeDistanceRemainingMi != null && ctx.currentSpeedMph != null) {
    const estimatedHoursRemaining = ctx.currentSpeedMph > 2
      ? ctx.routeDistanceRemainingMi / ctx.currentSpeedMph
      : Infinity;

    if (estimatedHoursRemaining > ctx.hoursUntilSunset && ctx.hoursUntilSunset < 3) {
      msgs.push(makePredictive(
        'sunset-before-completion',
        'Sunset approaching before route completion',
        'advisory', 3, 'moderate',
        { icon: 'sunny-outline', timeAheadMin: Math.round(ctx.hoursUntilSunset * 60) }
      ));
    }
  }

  // Camp opportunity window
  if (ctx.hoursUntilSunset != null && ctx.hoursUntilSunset < 2.5 && ctx.hoursUntilSunset > 0.5) {
    if (ctx.currentRemotenessScore != null && ctx.currentRemotenessScore > 30) {
      msgs.push(makePredictive(
        'camp-opportunity',
        'Camp-worthy terrain likely nearby',
        'advisory', 5, 'low',
        { icon: 'moon-outline' }
      ));
    }
  }

  // Night driving warning
  if (ctx.timeOfDay === 'night' && ctx.currentSpeedMph != null && ctx.currentSpeedMph > 5) {
    if (ctx.routeDistanceRemainingMi != null && ctx.routeDistanceRemainingMi > 10) {
      msgs.push(makePredictive(
        'night-driving-distance',
        'Significant distance remaining in night conditions',
        'advisory', 4, 'high',
        { icon: 'moon-outline' }
      ));
    }
  }

  return msgs;
}

// ── 6. Route Characteristic Forecast ─────────────────────

function evaluateRouteCharacteristics(ctx: PredictiveContext): PredictiveMessage[] {
  const msgs: PredictiveMessage[] = [];

  // Off-pavement segments ahead
  if (ctx.hasOffPavementSegments) {
    msgs.push(makePredictive(
      'off-pavement-ahead',
      'Off-pavement segment ahead — adjust speed accordingly',
      'advisory', 4, 'moderate',
      { icon: 'trail-sign-outline' }
    ));
  }

  // Narrow trail segments (inferred from elevation changes + remoteness)
  if (ctx.currentRemotenessScore != null && ctx.currentRemotenessScore > 60) {
    const segments = ctx.routeSegmentsAhead;
    if (segments && segments.length > 3) {
      // Check for rapid elevation changes suggesting narrow switchbacks
      let rapidChanges = 0;
      for (let i = 1; i < Math.min(segments.length, 6); i++) {
        const prev = segments[i - 1];
        const curr = segments[i];
        if (prev.elevationFt != null && curr.elevationFt != null) {
          const distMi = curr.distanceFromCurrentMi - prev.distanceFromCurrentMi;
          if (distMi > 0 && distMi < 1) {
            const changePerMile = Math.abs(curr.elevationFt - prev.elevationFt) / distMi;
            if (changePerMile > 500) rapidChanges++;
          }
        }
      }
      if (rapidChanges >= 2) {
        msgs.push(makePredictive(
          'narrow-trail-ahead',
          'Narrow trail segments likely ahead',
          'advisory', 4, 'low',
          { icon: 'trail-sign-outline' }
        ));
      }
    }
  }

  return msgs;
}

// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

/**
 * Evaluate predictive intelligence based on forward-looking route analysis.
 *
 * Called by the Expedition Intelligence engine during each evaluation cycle.
 * Returns predictive messages that are merged with reactive messages
 * before priority filtering.
 */
export function evaluatePredictive(ctx: PredictiveContext): PredictiveMessage[] {
  const allMessages: PredictiveMessage[] = [
    ...evaluateElevationAhead(ctx),
    ...evaluateResourceForecast(ctx),
    ...evaluateConnectivityForecast(ctx),
    ...evaluateEnvironmentalForecast(ctx),
    ...evaluateTimingForecast(ctx),
    ...evaluateRouteCharacteristics(ctx),
  ];

  return allMessages;
}

/**
 * Build route segments ahead from the active route and current GPS position.
 *
 * Samples points along the route within the forward analysis window
 * (up to 20 miles ahead). Returns an array of RouteSegmentAhead objects
 * with distance, elevation, and coordinates.
 */
export function buildRouteSegmentsAhead(
  routeSegments: Array<{ points: Array<{ lat: number; lon: number; ele: number | null }> }>,
  currentLat: number,
  currentLon: number,
  maxDistanceMi: number = 20
): RouteSegmentAhead[] {
  const result: RouteSegmentAhead[] = [];
  if (!routeSegments || routeSegments.length === 0) return result;

  // Flatten all segment points into a single ordered array
  const allPoints: Array<{ lat: number; lon: number; ele: number | null }> = [];
  for (const seg of routeSegments) {
    for (const pt of seg.points) {
      allPoints.push(pt);
    }
  }

  if (allPoints.length === 0) return result;

  // Find the nearest point to current position
  let nearestIdx = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < allPoints.length; i++) {
    const d = haversineDistanceMi(currentLat, currentLon, allPoints[i].lat, allPoints[i].lon);
    if (d < nearestDist) {
      nearestDist = d;
      nearestIdx = i;
    }
  }

  // Sample points ahead from nearest position
  let cumulativeDistance = 0;
  const sampleInterval = Math.max(1, Math.floor((allPoints.length - nearestIdx) / 20)); // ~20 samples max

  for (let i = nearestIdx + 1; i < allPoints.length; i += sampleInterval) {
    const prevPt = i === nearestIdx + 1
      ? allPoints[nearestIdx]
      : allPoints[Math.max(nearestIdx, i - sampleInterval)];
    const currPt = allPoints[i];

    cumulativeDistance += haversineDistanceMi(prevPt.lat, prevPt.lon, currPt.lat, currPt.lon);

    if (cumulativeDistance > maxDistanceMi) break;

    result.push({
      distanceFromCurrentMi: cumulativeDistance,
      elevationFt: currPt.ele != null ? Math.round(currPt.ele * 3.281) : null,
      lat: currPt.lat,
      lon: currPt.lon,
    });
  }

  return result;
}

/**
 * Estimate remoteness trend based on route segments ahead.
 * Compares elevation complexity and distance from known infrastructure.
 */
export function estimateRemotenessTrend(
  segmentsAhead: RouteSegmentAhead[],
  currentRemotenessScore: number
): 'increasing' | 'decreasing' | 'stable' {
  if (segmentsAhead.length < 3) return 'stable';

  // Simple heuristic: if elevation is increasing and we're already remote,
  // remoteness is likely increasing
  const firstThird = segmentsAhead.slice(0, Math.floor(segmentsAhead.length / 3));
  const lastThird = segmentsAhead.slice(Math.floor(segmentsAhead.length * 2 / 3));

  const avgElevFirst = firstThird.reduce((sum, s) => sum + (s.elevationFt ?? 0), 0) / (firstThird.length || 1);
  const avgElevLast = lastThird.reduce((sum, s) => sum + (s.elevationFt ?? 0), 0) / (lastThird.length || 1);

  const elevDelta = avgElevLast - avgElevFirst;

  if (currentRemotenessScore > 40 && elevDelta > 500) return 'increasing';
  if (currentRemotenessScore > 30 && elevDelta < -500) return 'decreasing';
  return 'stable';
}

/**
 * Detect if canyon terrain is ahead based on rapid elevation drops
 * in route segments.
 */
export function detectCanyonTerrain(segmentsAhead: RouteSegmentAhead[]): boolean {
  if (segmentsAhead.length < 4) return false;

  let significantDrops = 0;
  for (let i = 1; i < segmentsAhead.length; i++) {
    const prev = segmentsAhead[i - 1];
    const curr = segmentsAhead[i];
    if (prev.elevationFt != null && curr.elevationFt != null) {
      const drop = prev.elevationFt - curr.elevationFt;
      if (drop > 300) significantDrops++;
    }
  }

  // Canyon terrain: multiple significant drops in a short distance
  return significantDrops >= 2;
}


/**
 * ECS Offline Expedition Intelligence — Phase 9
 * ================================================
 *
 * Provides situational awareness and risk information when the device
 * has little or no connectivity. Operates entirely on locally available
 * data: trail geometry, elevation, remoteness, breadcrumb history,
 * and weather cache.
 *
 * ACTIVATION:
 *   - Primarily active when VehicleDisplayMode = ExpeditionDrive
 *   - Computes intelligence on a timer (10s interval)
 *   - Degrades gracefully when data is unavailable
 *
 * INTELLIGENCE OUTPUTS:
 *   1. Terrain Difficulty Estimation (Easy → Extreme)
 *   2. Offline Remoteness Awareness (enhanced when offline)
 *   3. Terrain Elevation Alerts (steep ascent/descent, high elevation)
 *   4. Cached Weather Awareness (with staleness indicators)
 *   5. Offline Hazard Awareness (grade, curvature, ridge approach)
 *   6. Expedition Risk Score (Low → Extreme, composite)
 *
 * ARCHITECTURE:
 *   - Singleton store with subscribe/get pattern
 *   - Timer-driven recomputation (10s)
 *   - Reads from existing ECS stores (no new data sources)
 *   - Pure analysis functions (deterministic)
 *   - Does NOT modify the mobile dashboard
 *   - Does NOT replace existing systems
 *
 * DATA SOURCES (all local):
 *   - breadcrumbTracker: trail geometry, path history
 *   - remotenessStore: remoteness score/tier
 *   - routeStore: route segments, elevation data
 *   - weatherStore: cached weather data
 *   - gpsUIState: current GPS position
 *   - connectivity: online/offline status
 *   - vehicleDisplayStore: current display mode
 */

import type {
  OfflineExpeditionIntelligenceOutput,
  TerrainDifficultyEstimate,
  TerrainDifficultyLevel,
  OfflineRemotenessEstimate,
  ElevationAlert,
  CachedWeatherAwareness,
  HazardIndicator,
  ExpeditionRiskAssessment,
  ExpeditionRiskLevel,
} from './offlineIntelligenceTypes';


import {
  TERRAIN_DIFFICULTY_COLORS,
  TERRAIN_DIFFICULTY_ICONS,
  EXPEDITION_RISK_COLORS,
  EXPEDITION_RISK_ICONS,
  HAZARD_SEVERITY_COLORS,
  ELEVATION_ALERT_COLORS,
  STALENESS_COLORS,
} from './offlineIntelligenceTypes';

const TAG = '[OFFLINE_INTEL]';

// ── Constants ───────────────────────────────────────────────

/** Recomputation interval (ms) */
const RECOMPUTE_INTERVAL_MS = 10_000;

/** Earth radius in miles */
const EARTH_RADIUS_MI = 3958.8;

/** Meters to feet conversion */
const M_TO_FT = 3.28084;

/** Minimum breadcrumb points for meaningful analysis */
const MIN_BREADCRUMB_POINTS = 3;

/** Lookahead window for hazard detection (number of recent breadcrumbs) */
const HAZARD_LOOKAHEAD_POINTS = 20;

/** Steep grade threshold (degrees) */
const STEEP_GRADE_DEG = 8;

/** Very steep grade threshold (degrees) */
const VERY_STEEP_GRADE_DEG = 15;

/** High elevation threshold (feet) */
const HIGH_ELEVATION_FT = 7500;

/** Sharp curvature threshold (degrees per segment) */
const SHARP_CURVATURE_DEG = 45;

/** Rapid elevation change threshold (feet per segment) */
const RAPID_ELEVATION_CHANGE_FT = 200;

// ── Haversine Helpers ───────────────────────────────────────

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

function bearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const r1 = lat1 * Math.PI / 180;
  const r2 = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(r2);
  const x = Math.cos(r1) * Math.sin(r2) - Math.sin(r1) * Math.cos(r2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ══════════════════════════════════════════════════════════════
// 1. TERRAIN DIFFICULTY ESTIMATION
// ══════════════════════════════════════════════════════════════

/**
 * Estimate terrain difficulty from breadcrumb trail data.
 *
 * Analyzes recent breadcrumb points for:
 *   - Slope (grade from elevation changes)
 *   - Elevation change (total gain/loss)
 *   - Route curvature (heading change rate)
 *   - Surface classification (speed-based heuristic)
 *
 * Returns Easy / Moderate / Difficult / Extreme.
 */
function estimateTerrainDifficulty(
  breadcrumbPoints: any[],
  currentSpeedMph: number | null,
  currentAltitudeFt: number | null,
): TerrainDifficultyEstimate {
  let slopeScore = 0;
  let elevationScore = 0;
  let curvatureScore = 0;
  let surfaceScore = 0;
  let reason = 'Insufficient data';

  if (breadcrumbPoints.length >= MIN_BREADCRUMB_POINTS) {
    // Use the most recent points for analysis
    const recentPoints = breadcrumbPoints.slice(-HAZARD_LOOKAHEAD_POINTS);

    // ── Slope Analysis ──
    let maxGradeDeg = 0;
    let totalGradeDeg = 0;
    let gradeCount = 0;

    for (let i = 1; i < recentPoints.length; i++) {
      const prev = recentPoints[i - 1];
      const curr = recentPoints[i];
      if (prev.altitudeM != null && curr.altitudeM != null) {
        const distM = haversineDistanceMi(prev.latitude, prev.longitude, curr.latitude, curr.longitude) * 1609.34;
        if (distM > 5) {
          const eleChangeM = curr.altitudeM - prev.altitudeM;
          const gradeDeg = Math.abs(Math.atan2(eleChangeM, distM) * 180 / Math.PI);
          maxGradeDeg = Math.max(maxGradeDeg, gradeDeg);
          totalGradeDeg += gradeDeg;
          gradeCount++;
        }
      }
    }

    const avgGradeDeg = gradeCount > 0 ? totalGradeDeg / gradeCount : 0;
    // Map grade to 0–25 score
    if (maxGradeDeg > VERY_STEEP_GRADE_DEG) slopeScore = 25;
    else if (maxGradeDeg > STEEP_GRADE_DEG) slopeScore = 15 + (maxGradeDeg - STEEP_GRADE_DEG) / (VERY_STEEP_GRADE_DEG - STEEP_GRADE_DEG) * 10;
    else if (avgGradeDeg > 3) slopeScore = avgGradeDeg / STEEP_GRADE_DEG * 15;
    else slopeScore = avgGradeDeg * 2;

    // ── Elevation Change Analysis ──
    let totalGainFt = 0;
    let totalLossFt = 0;
    for (let i = 1; i < recentPoints.length; i++) {
      const prev = recentPoints[i - 1];
      const curr = recentPoints[i];
      if (prev.altitudeM != null && curr.altitudeM != null) {
        const diffFt = (curr.altitudeM - prev.altitudeM) * M_TO_FT;
        if (diffFt > 3) totalGainFt += diffFt;
        else if (diffFt < -3) totalLossFt += Math.abs(diffFt);
      }
    }
    const totalChangeFt = totalGainFt + totalLossFt;
    // Map elevation change to 0–25 score
    if (totalChangeFt > 1000) elevationScore = 25;
    else if (totalChangeFt > 500) elevationScore = 15 + (totalChangeFt - 500) / 500 * 10;
    else if (totalChangeFt > 100) elevationScore = totalChangeFt / 500 * 15;
    else elevationScore = totalChangeFt / 100 * 5;

    // ── Curvature Analysis ──
    let totalHeadingChange = 0;
    let headingSegments = 0;

    for (let i = 1; i < recentPoints.length - 1; i++) {
      const p0 = recentPoints[i - 1];
      const p1 = recentPoints[i];
      const p2 = recentPoints[i + 1];
      const b1 = bearing(p0.latitude, p0.longitude, p1.latitude, p1.longitude);
      const b2 = bearing(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
      const hChange = Math.abs(angleDiff(b1, b2));
      totalHeadingChange += hChange;
      headingSegments++;
    }

    const avgCurvature = headingSegments > 0 ? totalHeadingChange / headingSegments : 0;
    // Map curvature to 0–25 score
    if (avgCurvature > 60) curvatureScore = 25;
    else if (avgCurvature > SHARP_CURVATURE_DEG) curvatureScore = 15 + (avgCurvature - SHARP_CURVATURE_DEG) / 15 * 10;
    else if (avgCurvature > 15) curvatureScore = avgCurvature / SHARP_CURVATURE_DEG * 15;
    else curvatureScore = avgCurvature / 15 * 5;

    // ── Surface/Speed Heuristic ──
    // Low speed on trail suggests technical terrain
    if (currentSpeedMph != null) {
      if (currentSpeedMph < 5) surfaceScore = 20;
      else if (currentSpeedMph < 10) surfaceScore = 15;
      else if (currentSpeedMph < 20) surfaceScore = 8;
      else if (currentSpeedMph < 35) surfaceScore = 3;
      else surfaceScore = 0;
    } else {
      surfaceScore = 5; // Unknown speed, assume moderate
    }

    // ── Determine reason ──
    const maxFactor = Math.max(slopeScore, elevationScore, curvatureScore, surfaceScore);
    if (maxFactor === slopeScore && slopeScore > 10) reason = `Steep terrain (${maxGradeDeg.toFixed(0)} deg grade)`;
    else if (maxFactor === elevationScore && elevationScore > 10) reason = `${Math.round(totalChangeFt)} ft elevation change`;
    else if (maxFactor === curvatureScore && curvatureScore > 10) reason = `Winding trail (${avgCurvature.toFixed(0)} deg avg turn)`;
    else if (maxFactor === surfaceScore && surfaceScore > 10) reason = 'Technical terrain conditions';
    else reason = 'Moderate trail conditions';
  } else {
    // Insufficient breadcrumb data — use speed heuristic only
    if (currentSpeedMph != null && currentSpeedMph < 10) {
      surfaceScore = 12;
      reason = 'Low speed suggests technical terrain';
    } else {
      reason = 'Assessing terrain...';
    }
  }

  // ── Composite score and classification ──
  const totalScore = clamp(Math.round(slopeScore + elevationScore + curvatureScore + surfaceScore), 0, 100);

  let level: TerrainDifficultyLevel;
  if (totalScore >= 70) level = 'Extreme';
  else if (totalScore >= 45) level = 'Difficult';
  else if (totalScore >= 20) level = 'Moderate';
  else level = 'Easy';

  return {
    level,
    score: totalScore,
    reason,
    color: TERRAIN_DIFFICULTY_COLORS[level],
    icon: TERRAIN_DIFFICULTY_ICONS[level],
    factors: {
      slope: Math.round(slopeScore),
      elevationChange: Math.round(elevationScore),
      curvature: Math.round(curvatureScore),
      surface: Math.round(surfaceScore),
    },
  };
}

// ══════════════════════════════════════════════════════════════
// 2. OFFLINE REMOTENESS AWARENESS
// ══════════════════════════════════════════════════════════════

/**
 * Enhance remoteness estimate when connectivity is unavailable.
 *
 * Uses:
 *   - Live remotenessStore data (if available)
 *   - Distance from start point (breadcrumbs)
 *   - Breadcrumb isolation (how far from any known point)
 *   - Connectivity status
 */
function estimateOfflineRemoteness(
  liveRemoteness: { score: number; tier: string; tierColor: string } | null,
  breadcrumbState: any,
  isOffline: boolean,
): OfflineRemotenessEstimate {
  // If live remoteness is available and we're online, use it directly
  if (liveRemoteness && !isOffline) {
    return {
      score: liveRemoteness.score,
      tier: liveRemoteness.tier,
      color: liveRemoteness.tierColor,
      reason: `Live: ${liveRemoteness.tier}`,
      source: 'live',
      signals: {
        distanceFromRoads: 0,
        distanceFromStart: breadcrumbState?.distanceFromStartMi ?? 0,
        breadcrumbIsolation: 0,
        connectivityFactor: 0,
      },
    };
  }

  // ── Offline estimation ──
  let score = 0;
  const signals = {
    distanceFromRoads: 0,
    distanceFromStart: 0,
    breadcrumbIsolation: 0,
    connectivityFactor: 0,
  };

  // Start with live score if available (last known value)
  if (liveRemoteness) {
    score = liveRemoteness.score;
  }

  // Distance from start contributes to remoteness
  const distFromStart = breadcrumbState?.distanceFromStartMi ?? 0;
  if (distFromStart > 50) signals.distanceFromStart = 25;
  else if (distFromStart > 20) signals.distanceFromStart = 15;
  else if (distFromStart > 10) signals.distanceFromStart = 10;
  else if (distFromStart > 5) signals.distanceFromStart = 5;
  else signals.distanceFromStart = distFromStart;

  // Breadcrumb isolation: trail distance vs straight-line distance
  const trailDist = breadcrumbState?.totalTrailDistanceMi ?? 0;
  if (trailDist > 0 && distFromStart > 0) {
    const windingFactor = trailDist / Math.max(distFromStart, 0.1);
    // High winding factor suggests remote/complex terrain
    if (windingFactor > 3) signals.breadcrumbIsolation = 15;
    else if (windingFactor > 2) signals.breadcrumbIsolation = 10;
    else if (windingFactor > 1.5) signals.breadcrumbIsolation = 5;
  }

  // Offline penalty
  if (isOffline) {
    signals.connectivityFactor = 15;
  }

  // Combine signals with live score
  const offlineBoost = signals.distanceFromStart + signals.breadcrumbIsolation + signals.connectivityFactor;
  score = clamp(Math.round(Math.max(score, offlineBoost)), 0, 100);

  // Classify tier
  let tier: string;
  let color: string;
  if (score <= 15) { tier = 'NEAR CIVILIZATION'; color = '#4CAF50'; }
  else if (score <= 35) { tier = 'BACKCOUNTRY'; color = '#C48A2C'; }
  else if (score <= 60) { tier = 'REMOTE'; color = '#E67E22'; }
  else if (score <= 80) { tier = 'DEEP REMOTE'; color = '#EF5350'; }
  else { tier = 'EXTREME'; color = '#C0392B'; }

  return {
    score,
    tier,
    color,
    reason: isOffline ? `Offline estimate: ${tier}` : `Estimated: ${tier}`,
    source: 'offline_estimate',
    signals,
  };
}

// ══════════════════════════════════════════════════════════════
// 3. TERRAIN ELEVATION ALERTS
// ══════════════════════════════════════════════════════════════

/**
 * Monitor elevation changes and generate alerts.
 *
 * Detects:
 *   - Steep ascent ahead
 *   - Steep descent ahead
 *   - High elevation zone
 *   - Rapid elevation change
 */
function detectElevationAlerts(
  breadcrumbPoints: any[],
  currentAltitudeFt: number | null,
  routeElevationGainFt: number | null,
): ElevationAlert[] {
  const alerts: ElevationAlert[] = [];

  if (breadcrumbPoints.length < MIN_BREADCRUMB_POINTS) return alerts;

  const recentPoints = breadcrumbPoints.slice(-HAZARD_LOOKAHEAD_POINTS);

  // ── Detect grade trend (ascending/descending) ──
  let recentGainFt = 0;
  let recentLossFt = 0;
  let maxSegmentGainFt = 0;
  let maxSegmentLossFt = 0;

  for (let i = 1; i < recentPoints.length; i++) {
    const prev = recentPoints[i - 1];
    const curr = recentPoints[i];
    if (prev.altitudeM != null && curr.altitudeM != null) {
      const diffFt = (curr.altitudeM - prev.altitudeM) * M_TO_FT;
      if (diffFt > 3) {
        recentGainFt += diffFt;
        maxSegmentGainFt = Math.max(maxSegmentGainFt, diffFt);
      } else if (diffFt < -3) {
        recentLossFt += Math.abs(diffFt);
        maxSegmentLossFt = Math.max(maxSegmentLossFt, Math.abs(diffFt));
      }
    }
  }

  // ── Steep ascent detection ──
  if (recentGainFt > 300 || maxSegmentGainFt > RAPID_ELEVATION_CHANGE_FT) {
    const severity = recentGainFt > 600 ? 'high' : recentGainFt > 300 ? 'moderate' : 'low';
    alerts.push({
      type: 'steep_ascent',
      message: `Steep ascent — ${Math.round(recentGainFt)} ft gain`,
      severity,
      color: ELEVATION_ALERT_COLORS[severity],
      icon: 'arrow-up-outline',
      metricValue: Math.round(recentGainFt),
      metricUnit: 'ft gain',
    });
  }

  // ── Steep descent detection ──
  if (recentLossFt > 300 || maxSegmentLossFt > RAPID_ELEVATION_CHANGE_FT) {
    const severity = recentLossFt > 600 ? 'high' : recentLossFt > 300 ? 'moderate' : 'low';
    alerts.push({
      type: 'steep_descent',
      message: `Steep descent — ${Math.round(recentLossFt)} ft drop`,
      severity,
      color: ELEVATION_ALERT_COLORS[severity],
      icon: 'arrow-down-outline',
      metricValue: Math.round(recentLossFt),
      metricUnit: 'ft drop',
    });
  }

  // ── High elevation zone ──
  if (currentAltitudeFt != null && currentAltitudeFt > HIGH_ELEVATION_FT) {
    const severity = currentAltitudeFt > 12000 ? 'high' : currentAltitudeFt > 9000 ? 'moderate' : 'low';
    alerts.push({
      type: 'high_elevation',
      message: `High elevation — ${Math.round(currentAltitudeFt).toLocaleString()} ft`,
      severity,
      color: ELEVATION_ALERT_COLORS[severity],
      icon: 'trending-up-outline',
      metricValue: Math.round(currentAltitudeFt),
      metricUnit: 'ft',
    });
  }

  // ── Rapid elevation change ──
  if (maxSegmentGainFt > RAPID_ELEVATION_CHANGE_FT || maxSegmentLossFt > RAPID_ELEVATION_CHANGE_FT) {
    const maxChange = Math.max(maxSegmentGainFt, maxSegmentLossFt);
    const severity = maxChange > 400 ? 'high' : 'moderate';
    // Only add if not already covered by ascent/descent alerts
    if (alerts.length < 2) {
      alerts.push({
        type: 'rapid_elevation_change',
        message: `Rapid elevation change — ${Math.round(maxChange)} ft`,
        severity,
        color: ELEVATION_ALERT_COLORS[severity],
        icon: 'swap-vertical-outline',
        metricValue: Math.round(maxChange),
        metricUnit: 'ft change',
      });
    }
  }

  // Limit to 3 alerts
  return alerts.slice(0, 3);
}

// ══════════════════════════════════════════════════════════════
// 4. CACHED WEATHER AWARENESS
// ══════════════════════════════════════════════════════════════

/**
 * Assess weather awareness from cached data.
 *
 * If live weather is unavailable, uses the most recently cached
 * weather snapshot with clear staleness indicators.
 */
function assessCachedWeather(
  isOffline: boolean,
): CachedWeatherAwareness {
  try {
    // Try to get cached weather from weatherStore
    const weatherStore = require('./weatherStore');
    const { getAnyCachedWeather, getWeatherAge, getWeatherStaleness } = weatherStore;

    // We need coordinates to look up cached weather — try GPS
    const { gpsUIState } = require('./gpsUIState');
    const gps = gpsUIState.get();

    if (!gps.hasFix || !gps.position) {
      return createUnavailableWeather();
    }

    const lat = gps.position.latitude;
    const lon = gps.position.longitude;

    const cached = getAnyCachedWeather([{ lat, lng: lon }]);

    if (!cached || !cached.data || !cached.data.results || cached.data.results.length === 0) {
      return createUnavailableWeather();
    }

    const result = cached.data.results[0];
    const current = result?.current;
    const ageMinutes = Math.round((Date.now() - cached.cachedAt) / 60000);
    const ageLabel = getWeatherAge(cached.cachedAt);
    const staleness = getWeatherStaleness(cached.cachedAt);

    // Assess storm risk from weather data
    let stormRisk: 'low' | 'moderate' | 'high' | 'unknown' = 'unknown';
    if (current) {
      const weatherId = current.weather_id;
      const windSpeed = current.wind_speed;
      if (weatherId != null) {
        if (weatherId >= 200 && weatherId < 300) stormRisk = 'high'; // Thunderstorm
        else if (weatherId >= 500 && weatherId < 600 && windSpeed != null && windSpeed > 25) stormRisk = 'high';
        else if (weatherId >= 300 && weatherId < 600) stormRisk = 'moderate'; // Rain/drizzle
        else if (windSpeed != null && windSpeed > 30) stormRisk = 'moderate';
        else stormRisk = 'low';
      }
    }

    // Get wind direction
    let windDirection: string | null = null;
    if (current?.wind_deg != null) {
      const { getWindDirection } = require('./weatherTypes');
      windDirection = getWindDirection(current.wind_deg);
    }

    return {
      available: true,
      source: isOffline ? 'cached' : (staleness === 'fresh' ? 'live' : 'cached'),
      ageLabel,
      ageMinutes,
      staleness,
      temperatureF: current?.temp ?? null,
      windSpeedMph: current?.wind_speed ?? null,
      windDirection,
      stormRisk,
      description: current?.weather_description ?? null,
      alertCount: result?.alerts?.length ?? 0,
      stalenessColor: STALENESS_COLORS[staleness] ?? STALENESS_COLORS.unavailable,
    };
  } catch {
    return createUnavailableWeather();
  }
}

function createUnavailableWeather(): CachedWeatherAwareness {
  return {
    available: false,
    source: 'unavailable',
    ageLabel: null,
    ageMinutes: null,
    staleness: 'unavailable',
    temperatureF: null,
    windSpeedMph: null,
    windDirection: null,
    stormRisk: 'unknown',
    description: null,
    alertCount: 0,
    stalenessColor: STALENESS_COLORS.unavailable,
  };
}

// ══════════════════════════════════════════════════════════════
// 5. OFFLINE HAZARD AWARENESS
// ══════════════════════════════════════════════════════════════

/**
 * Identify potential hazards from terrain and route patterns.
 *
 * Detects:
 *   - Steep grade ahead
 *   - Rapid elevation change
 *   - Sharp route curvature
 *   - Ridge line approach
 *   - Exposure risk (high elevation + wind)
 */
function detectHazards(
  breadcrumbPoints: any[],
  currentSpeedMph: number | null,
  currentAltitudeFt: number | null,
  weatherAwareness: CachedWeatherAwareness,
): HazardIndicator[] {
  const hazards: HazardIndicator[] = [];

  if (breadcrumbPoints.length < MIN_BREADCRUMB_POINTS) return hazards;

  const recentPoints = breadcrumbPoints.slice(-HAZARD_LOOKAHEAD_POINTS);

  // ── Steep grade detection ──
  for (let i = Math.max(0, recentPoints.length - 5); i < recentPoints.length - 1; i++) {
    const prev = recentPoints[i];
    const curr = recentPoints[i + 1];
    if (prev.altitudeM != null && curr.altitudeM != null) {
      const distM = haversineDistanceMi(prev.latitude, prev.longitude, curr.latitude, curr.longitude) * 1609.34;
      if (distM > 5) {
        const gradeDeg = Math.abs(Math.atan2(curr.altitudeM - prev.altitudeM, distM) * 180 / Math.PI);
        if (gradeDeg > VERY_STEEP_GRADE_DEG) {
          hazards.push({
            type: 'steep_grade',
            message: `Steep grade — ${gradeDeg.toFixed(0)} degrees`,
            severity: 'warning',
            color: HAZARD_SEVERITY_COLORS.warning,
            icon: 'trending-up-outline',
            distanceAheadMi: null,
          });
          break; // Only report once
        } else if (gradeDeg > STEEP_GRADE_DEG) {
          hazards.push({
            type: 'steep_grade',
            message: `Moderate grade — ${gradeDeg.toFixed(0)} degrees`,
            severity: 'caution',
            color: HAZARD_SEVERITY_COLORS.caution,
            icon: 'trending-up-outline',
            distanceAheadMi: null,
          });
          break;
        }
      }
    }
  }

  // ── Sharp curvature detection ──
  if (recentPoints.length >= 4) {
    const lastFew = recentPoints.slice(-6);
    let maxTurn = 0;
    for (let i = 1; i < lastFew.length - 1; i++) {
      const b1 = bearing(lastFew[i - 1].latitude, lastFew[i - 1].longitude, lastFew[i].latitude, lastFew[i].longitude);
      const b2 = bearing(lastFew[i].latitude, lastFew[i].longitude, lastFew[i + 1].latitude, lastFew[i + 1].longitude);
      maxTurn = Math.max(maxTurn, Math.abs(angleDiff(b1, b2)));
    }

    if (maxTurn > 90) {
      hazards.push({
        type: 'sharp_curvature',
        message: 'Sharp terrain ahead',
        severity: 'warning',
        color: HAZARD_SEVERITY_COLORS.warning,
        icon: 'git-branch-outline',
        distanceAheadMi: null,
      });
    } else if (maxTurn > SHARP_CURVATURE_DEG) {
      hazards.push({
        type: 'sharp_curvature',
        message: 'Winding trail conditions',
        severity: 'caution',
        color: HAZARD_SEVERITY_COLORS.caution,
        icon: 'git-branch-outline',
        distanceAheadMi: null,
      });
    }
  }

  // ── Ridge approach detection ──
  // Heuristic: recent consistent climbing + high elevation + exposed
  if (currentAltitudeFt != null && currentAltitudeFt > 6000) {
    let climbingSegments = 0;
    for (let i = Math.max(0, recentPoints.length - 8); i < recentPoints.length - 1; i++) {
      const prev = recentPoints[i];
      const curr = recentPoints[i + 1];
      if (prev.altitudeM != null && curr.altitudeM != null && curr.altitudeM > prev.altitudeM + 1) {
        climbingSegments++;
      }
    }

    if (climbingSegments >= 5) {
      hazards.push({
        type: 'ridge_approach',
        message: 'Approaching ridge line',
        severity: 'advisory',
        color: HAZARD_SEVERITY_COLORS.advisory,
        icon: 'triangle-outline',
        distanceAheadMi: null,
      });
    }
  }

  // ── Exposure risk ──
  // High elevation + high wind = exposure risk
  if (
    currentAltitudeFt != null && currentAltitudeFt > HIGH_ELEVATION_FT &&
    weatherAwareness.available &&
    weatherAwareness.windSpeedMph != null && weatherAwareness.windSpeedMph > 20
  ) {
    hazards.push({
      type: 'exposure_risk',
      message: `Wind exposure at ${Math.round(currentAltitudeFt).toLocaleString()} ft`,
      severity: 'caution',
      color: HAZARD_SEVERITY_COLORS.caution,
      icon: 'flag-outline',
      distanceAheadMi: null,
    });
  }

  // Limit to 3 hazards
  return hazards.slice(0, 3);
}

// ══════════════════════════════════════════════════════════════
// 6. EXPEDITION RISK SCORE
// ══════════════════════════════════════════════════════════════

/**
 * Generate a composite expedition risk assessment.
 *
 * Combines:
 *   - Remoteness (0–25)
 *   - Terrain difficulty (0–25)
 *   - Elevation risk (0–25)
 *   - Weather risk (0–25)
 */
function assessExpeditionRisk(
  remoteness: OfflineRemotenessEstimate,
  terrainDifficulty: TerrainDifficultyEstimate,
  elevationAlerts: ElevationAlert[],
  weatherAwareness: CachedWeatherAwareness,
): ExpeditionRiskAssessment {
  const drivers: string[] = [];

  // ── Remoteness factor (0–25) ──
  const remotenessFactor = clamp(Math.round(remoteness.score / 4), 0, 25);
  if (remotenessFactor > 15) drivers.push('High remoteness');
  else if (remotenessFactor > 8) drivers.push('Remote location');

  // ── Terrain factor (0–25) ──
  const terrainFactor = clamp(Math.round(terrainDifficulty.score / 4), 0, 25);
  if (terrainFactor > 15) drivers.push('Extreme terrain');
  else if (terrainFactor > 8) drivers.push('Difficult terrain');

  // ── Elevation factor (0–25) ──
  let elevationFactor = 0;
  for (const alert of elevationAlerts) {
    if (alert.severity === 'high') elevationFactor += 12;
    else if (alert.severity === 'moderate') elevationFactor += 7;
    else elevationFactor += 3;
  }
  elevationFactor = clamp(elevationFactor, 0, 25);
  if (elevationFactor > 15) drivers.push('Significant elevation risk');
  else if (elevationFactor > 8) drivers.push('Elevation concerns');

  // ── Weather factor (0–25) ──
  let weatherFactor = 0;
  if (weatherAwareness.available) {
    // Storm risk
    if (weatherAwareness.stormRisk === 'high') weatherFactor += 15;
    else if (weatherAwareness.stormRisk === 'moderate') weatherFactor += 8;

    // Wind
    if (weatherAwareness.windSpeedMph != null) {
      if (weatherAwareness.windSpeedMph > 40) weatherFactor += 10;
      else if (weatherAwareness.windSpeedMph > 25) weatherFactor += 5;
    }

    // Staleness penalty
    if (weatherAwareness.staleness === 'very_stale') weatherFactor += 5;
    else if (weatherAwareness.staleness === 'stale') weatherFactor += 3;

    if (weatherFactor > 15) drivers.push('Severe weather risk');
    else if (weatherFactor > 8) drivers.push('Weather concerns');
  } else {
    // No weather data = uncertainty
    weatherFactor = 8;
    drivers.push('Weather data unavailable');
  }
  weatherFactor = clamp(weatherFactor, 0, 25);

  // ── Composite score ──
  const totalScore = clamp(remotenessFactor + terrainFactor + elevationFactor + weatherFactor, 0, 100);

  // ── Classify risk level ──
  let level: ExpeditionRiskLevel;
  if (totalScore >= 70) level = 'Extreme Risk';
  else if (totalScore >= 45) level = 'High Risk';
  else if (totalScore >= 20) level = 'Moderate Risk';
  else level = 'Low Risk';

  // Ensure at least one driver
  if (drivers.length === 0) {
    drivers.push('Low overall risk');
  }

  return {
    level,
    score: totalScore,
    color: EXPEDITION_RISK_COLORS[level],
    icon: EXPEDITION_RISK_ICONS[level],
    summary: `${level} — ${drivers[0]}`,
    factors: {
      remoteness: remotenessFactor,
      terrain: terrainFactor,
      elevation: elevationFactor,
      weather: weatherFactor,
    },
    drivers: drivers.slice(0, 3),
  };
}

// ══════════════════════════════════════════════════════════════
// DEFAULT OUTPUT
// ══════════════════════════════════════════════════════════════

function createDefaultOutput(): OfflineExpeditionIntelligenceOutput {
  return {
    isActive: false,
    computedAt: new Date().toISOString(),
    isOffline: false,
    terrainDifficulty: {
      level: 'Easy',
      score: 0,
      reason: 'Assessing terrain...',
      color: TERRAIN_DIFFICULTY_COLORS.Easy,
      icon: TERRAIN_DIFFICULTY_ICONS.Easy,
      factors: { slope: 0, elevationChange: 0, curvature: 0, surface: 0 },
    },
    remoteness: {
      score: 0,
      tier: 'NEAR CIVILIZATION',
      color: '#4CAF50',
      reason: 'Assessing environment...',
      source: 'offline_estimate',
      signals: { distanceFromRoads: 0, distanceFromStart: 0, breadcrumbIsolation: 0, connectivityFactor: 0 },
    },
    elevationAlerts: [],
    weatherAwareness: createUnavailableWeather(),
    hazards: [],
    riskAssessment: {
      level: 'Low Risk',
      score: 0,
      color: EXPEDITION_RISK_COLORS['Low Risk'],
      icon: EXPEDITION_RISK_ICONS['Low Risk'],
      summary: 'Assessing risk...',
      factors: { remoteness: 0, terrain: 0, elevation: 0, weather: 0 },
      drivers: ['Assessing...'],
    },
    dataAvailability: {
      hasGps: false,
      hasRoute: false,
      hasBreadcrumbs: false,
      hasElevation: false,
      hasWeatherCache: false,
      hasRemoteness: false,
    },
  };
}

// ══════════════════════════════════════════════════════════════
// CORE RECOMPUTATION
// ══════════════════════════════════════════════════════════════

function _recompute(): void {
  try {
    // ── Check if we should be active ──
    let isExpeditionDrive = false;
    try {
      const { vehicleDisplayStore } = require('./vehicleDisplayStore');
      isExpeditionDrive = vehicleDisplayStore.getMode() === 'expedition_drive';
    } catch {}
    // Also check if there's an active expedition
    let hasActiveExpedition = false;
    try {
      const { missionExpeditionStore } = require('./missionStore');
      const activeExp = missionExpeditionStore.getActive();
      hasActiveExpedition = activeExp != null && activeExp.status === 'active';
    } catch {}


    // Activate if in ExpeditionDrive OR has active expedition
    const shouldBeActive = isExpeditionDrive || hasActiveExpedition;

    if (!shouldBeActive) {
      // Still compute but mark as inactive
      if (_cachedOutput?.isActive) {
        _cachedOutput = { ...createDefaultOutput(), isActive: false };
        _notify();
      }
      return;
    }

    // ── Gather data from stores ──
    let isOffline = false;
    try {
      const { connectivity } = require('./connectivity');
      isOffline = !connectivity.isOnline();
    } catch {}

    // GPS data
    let currentLat: number | null = null;
    let currentLon: number | null = null;
    let currentSpeedMph: number | null = null;
    let currentAltitudeFt: number | null = null;
    let hasGps = false;

    try {
      const { gpsUIState } = require('./gpsUIState');
      const gps = gpsUIState.get();
      if (gps.hasFix && gps.position) {
        currentLat = gps.position.latitude;
        currentLon = gps.position.longitude;
        currentSpeedMph = gps.position.speedMph ?? null;
        currentAltitudeFt = gps.position.altitudeFt ?? null;
        hasGps = true;
      }
    } catch {}

    // Breadcrumb data
    let breadcrumbPoints: any[] = [];
    let breadcrumbState: any = null;
    let hasBreadcrumbs = false;

    try {
      const { breadcrumbTracker } = require('./breadcrumbTracker');
      breadcrumbPoints = breadcrumbTracker.getPoints();
      breadcrumbState = breadcrumbTracker.get();
      hasBreadcrumbs = breadcrumbPoints.length >= MIN_BREADCRUMB_POINTS;
    } catch {}

    // Route data
    let hasRoute = false;
    let hasElevation = false;
    let routeElevationGainFt: number | null = null;

    try {
      const { routeStore } = require('./routeStore');
      const activeRoute = routeStore.getActive();
      if (activeRoute) {
        hasRoute = true;
        routeElevationGainFt = activeRoute.elevation_gain_ft;
        // Check if route has elevation data
        if (activeRoute.segments) {
          for (const seg of activeRoute.segments) {
            if (seg.points.some((p: any) => p.ele != null)) {
              hasElevation = true;
              break;
            }
          }
        }
      }
    } catch {}

    // Also check breadcrumbs for elevation
    if (!hasElevation && breadcrumbPoints.length > 0) {
      hasElevation = breadcrumbPoints.some((p: any) => p.altitudeM != null);
    }

    // Remoteness data
    let liveRemoteness: { score: number; tier: string; tierColor: string } | null = null;
    let hasRemoteness = false;

    try {
      const { remotenessStore } = require('./remotenessStore');
      const remoteness = remotenessStore.get();
      if (remoteness && remoteness.score > 0) {
        liveRemoteness = {
          score: remoteness.score,
          tier: remoteness.tier,
          tierColor: remoteness.tierColor,
        };
        hasRemoteness = true;
      }
    } catch {}

    // ── Compute intelligence ──

    // 1. Terrain Difficulty
    const terrainDifficulty = estimateTerrainDifficulty(
      breadcrumbPoints,
      currentSpeedMph,
      currentAltitudeFt,
    );

    // 2. Offline Remoteness
    const remoteness = estimateOfflineRemoteness(
      liveRemoteness,
      breadcrumbState,
      isOffline,
    );

    // 3. Elevation Alerts
    const elevationAlerts = detectElevationAlerts(
      breadcrumbPoints,
      currentAltitudeFt,
      routeElevationGainFt,
    );

    // 4. Cached Weather Awareness
    const weatherAwareness = assessCachedWeather(isOffline);

    // 5. Hazard Detection
    const hazards = detectHazards(
      breadcrumbPoints,
      currentSpeedMph,
      currentAltitudeFt,
      weatherAwareness,
    );

    // 6. Expedition Risk Score
    const riskAssessment = assessExpeditionRisk(
      remoteness,
      terrainDifficulty,
      elevationAlerts,
      weatherAwareness,
    );

    // ── Build output ──
    const output: OfflineExpeditionIntelligenceOutput = {
      isActive: true,
      computedAt: new Date().toISOString(),
      isOffline,
      terrainDifficulty,
      remoteness,
      elevationAlerts,
      weatherAwareness,
      hazards,
      riskAssessment,
      dataAvailability: {
        hasGps,
        hasRoute,
        hasBreadcrumbs,
        hasElevation,
        hasWeatherCache: weatherAwareness.available,
        hasRemoteness,
      },
    };

    // ── Check for meaningful change ──
    if (_cachedOutput && !_hasChanged(_cachedOutput, output)) {
      return; // No meaningful change, skip notification
    }

    _cachedOutput = output;
    _notify();

  } catch (err) {
    console.warn(TAG, 'Recomputation error:', err);
  }
}

/**
 * Check if the output has meaningfully changed.
 * Prevents unnecessary re-renders from identity churn.
 */
function _hasChanged(
  prev: OfflineExpeditionIntelligenceOutput,
  next: OfflineExpeditionIntelligenceOutput,
): boolean {
  if (prev.isActive !== next.isActive) return true;
  if (prev.isOffline !== next.isOffline) return true;
  if (prev.terrainDifficulty.level !== next.terrainDifficulty.level) return true;
  if (Math.abs(prev.terrainDifficulty.score - next.terrainDifficulty.score) > 5) return true;
  if (prev.remoteness.tier !== next.remoteness.tier) return true;
  if (Math.abs(prev.remoteness.score - next.remoteness.score) > 5) return true;
  if (prev.elevationAlerts.length !== next.elevationAlerts.length) return true;
  if (prev.weatherAwareness.staleness !== next.weatherAwareness.staleness) return true;
  if (prev.weatherAwareness.stormRisk !== next.weatherAwareness.stormRisk) return true;
  if (prev.hazards.length !== next.hazards.length) return true;
  if (prev.riskAssessment.level !== next.riskAssessment.level) return true;
  if (Math.abs(prev.riskAssessment.score - next.riskAssessment.score) > 5) return true;
  // Check data availability changes
  const pa = prev.dataAvailability;
  const na = next.dataAvailability;
  if (pa.hasGps !== na.hasGps || pa.hasRoute !== na.hasRoute ||
      pa.hasBreadcrumbs !== na.hasBreadcrumbs || pa.hasElevation !== na.hasElevation ||
      pa.hasWeatherCache !== na.hasWeatherCache || pa.hasRemoteness !== na.hasRemoteness) return true;
  return false;
}

// ══════════════════════════════════════════════════════════════
// INTERNAL STATE
// ══════════════════════════════════════════════════════════════

let _cachedOutput: OfflineExpeditionIntelligenceOutput | null = null;
let _recomputeTimer: ReturnType<typeof setInterval> | null = null;
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

export const offlineExpeditionIntelligence = {
  /**
   * Get current intelligence output.
   *
   * Returns the most recent computed intelligence, or a default
   * output if intelligence hasn't been computed yet.
   */
  get(): OfflineExpeditionIntelligenceOutput {
    if (_cachedOutput) return _cachedOutput;
    return createDefaultOutput();
  },

  /**
   * Start the intelligence engine.
   *
   * Begins periodic recomputation (every 10 seconds).
   * Call when expedition starts or ExpeditionDrive activates.
   */
  start(): void {
    if (_isRunning) return;
    _isRunning = true;

    console.log(TAG, 'Starting Offline Expedition Intelligence');

    // Immediate first computation
    _recompute();

    // Periodic recomputation
    _recomputeTimer = setInterval(_recompute, RECOMPUTE_INTERVAL_MS);
  },

  /**
   * Stop the intelligence engine.
   *
   * Call when expedition ends or ExpeditionDrive deactivates.
   */
  stop(): void {
    if (!_isRunning) return;
    _isRunning = false;

    if (_recomputeTimer) {
      clearInterval(_recomputeTimer);
      _recomputeTimer = null;
    }

    console.log(TAG, 'Stopped Offline Expedition Intelligence');
  },

  /**
   * Whether the engine is actively computing.
   */
  isRunning(): boolean {
    return _isRunning;
  },

  /**
   * Force an immediate recomputation.
   * Useful when significant state changes occur.
   */
  forceRecompute(): void {
    _recompute();
  },

  /**
   * Reset all state.
   */
  reset(): void {
    offlineExpeditionIntelligence.stop();
    _cachedOutput = null;
    _notify();
    console.log(TAG, 'Intelligence state reset');
  },

  /**
   * Subscribe to intelligence changes.
   * Returns unsubscribe function.
   *
   * Notifications are only sent when the output meaningfully changes
   * (level/tier changes, score changes > 5, alert count changes, etc.).
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },

  // ── Convenience Accessors ─────────────────────────────────

  /**
   * Get just the terrain difficulty estimate.
   */
  getTerrainDifficulty(): TerrainDifficultyEstimate {
    return offlineExpeditionIntelligence.get().terrainDifficulty;
  },

  /**
   * Get just the remoteness estimate.
   */
  getRemoteness(): OfflineRemotenessEstimate {
    return offlineExpeditionIntelligence.get().remoteness;
  },

  /**
   * Get active elevation alerts.
   */
  getElevationAlerts(): ElevationAlert[] {
    return offlineExpeditionIntelligence.get().elevationAlerts;
  },

  /**
   * Get cached weather awareness.
   */
  getWeatherAwareness(): CachedWeatherAwareness {
    return offlineExpeditionIntelligence.get().weatherAwareness;
  },

  /**
   * Get active hazard indicators.
   */
  getHazards(): HazardIndicator[] {
    return offlineExpeditionIntelligence.get().hazards;
  },

  /**
   * Get the expedition risk assessment.
   */
  getRiskAssessment(): ExpeditionRiskAssessment {
    return offlineExpeditionIntelligence.get().riskAssessment;
  },

  /**
   * Get data availability flags.
   */
  getDataAvailability(): OfflineExpeditionIntelligenceOutput['dataAvailability'] {
    return offlineExpeditionIntelligence.get().dataAvailability;
  },

  /**
   * Get a compact summary string for vehicle display screens.
   *
   * Example: "Moderate Risk — Difficult terrain, REMOTE"
   */
  getCompactSummary(): string {
    const output = offlineExpeditionIntelligence.get();
    if (!output.isActive) return 'Intelligence inactive';

    const risk = output.riskAssessment.level;
    const terrain = output.terrainDifficulty.level;
    const remoteness = output.remoteness.tier;

    return `${risk} — ${terrain} terrain, ${remoteness}`;
  },

  /**
   * Get a driver-safe status line for vehicle display.
   *
   * Returns the most important piece of intelligence as a short string.
   * Prioritizes hazards > elevation alerts > risk level.
   */
  getDriverStatusLine(): string {
    const output = offlineExpeditionIntelligence.get();
    if (!output.isActive) return 'Expedition intelligence standby';

    // Priority 1: Active hazards
    if (output.hazards.length > 0) {
      return output.hazards[0].message;
    }

    // Priority 2: Elevation alerts
    if (output.elevationAlerts.length > 0) {
      return output.elevationAlerts[0].message;
    }

    // Priority 3: High risk
    if (output.riskAssessment.score >= 45) {
      return output.riskAssessment.summary;
    }

    // Priority 4: Weather warning
    if (output.weatherAwareness.stormRisk === 'high') {
      return 'Storm risk detected';
    }

    // Default: terrain + remoteness
    return `${output.terrainDifficulty.level} terrain — ${output.remoteness.tier}`;
  },
};


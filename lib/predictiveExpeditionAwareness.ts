/**
 * ECS Predictive Expedition Awareness — Phase 10
 * =================================================
 *
 * Analyzes the current expedition route and predicts upcoming risks
 * using existing ECS data:
 *   - Active route + distance remaining
 *   - Breadcrumb trail + vehicle speed
 *   - Fuel level + consumption
 *   - Water storage + usage rate
 *   - Daylight remaining (solar calculation)
 *   - Remoteness index + trend
 *   - Terrain difficulty (from Phase 9)
 *
 * PREDICTIONS:
 *   1. Fuel Range Risk — is fuel sufficient for the route?
 *   2. Daylight Risk — will the expedition continue after dark?
 *   3. Water Supply Projection — is water sufficient?
 *   4. Remoteness Exposure — is remoteness increasing?
 *   5. Terrain Exposure — difficult terrain ahead?
 *   6. Combined Expedition Risk Summary
 *
 * ACTIVATION:
 *   - Active during ExpeditionDrive mode
 *   - Recomputes every 45 seconds
 *   - Degrades gracefully when data is unavailable
 *
 * ARCHITECTURE:
 *   - Singleton store with subscribe/get pattern
 *   - Timer-driven recomputation (45s)
 *   - Reads from existing ECS stores (no new data sources)
 *   - Pure analysis functions (deterministic)
 *   - Does NOT modify the mobile dashboard
 *   - Does NOT replace existing systems
 */

import type {
  PredictiveAwarenessOutput,
  FuelRangePrediction,
  DaylightPrediction,
  WaterSupplyPrediction,
  RemotenessExposurePrediction,
  TerrainExposurePrediction,
  PredictiveRiskSummary,
  PredictiveRiskLevel,
  PredictionStatus,
  RemotenessTrend,
} from './predictiveAwarenessTypes';

import {
  PREDICTION_STATUS_COLORS,
  PREDICTIVE_RISK_COLORS,
  PREDICTIVE_RISK_ICONS,
} from './predictiveAwarenessTypes';
import {
  buildEnvironmentSnapshot,
  formatEnvironmentTime,
} from './environmentSnapshotService';

const TAG = '[PREDICTIVE_AWARENESS]';

// ── Constants ───────────────────────────────────────────────

/** Recomputation interval (ms) — 45 seconds */
const RECOMPUTE_INTERVAL_MS = 45_000;

/** Earth radius in miles */
const EARTH_RADIUS_MI = 3958.8;

/** Liters per gallon */
const L_PER_GAL = 3.78541;

/** Default water consumption rate (liters per person per day) */
const DEFAULT_WATER_RATE_LPD = 3.5;

/** Default people count */
const DEFAULT_PEOPLE = 2;

/** Minimum breadcrumb points for speed analysis */
const MIN_SPEED_POINTS = 5;

// ── Haversine Helper ────────────────────────────────────────

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

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ══════════════════════════════════════════════════════════════
// 1. FUEL RANGE RISK PREDICTION
// ══════════════════════════════════════════════════════════════

/**
 * Estimate whether current fuel supply is sufficient for the route.
 *
 * Uses:
 *   - Vehicle fuel level (from telemetryConfigStore)
 *   - Average fuel consumption (MPG from telemetry)
 *   - Route distance remaining
 *   - Terrain difficulty multiplier
 */
function predictFuelRange(
  fuelRemainingGal: number | null,
  fuelCapacityGal: number | null,
  mpg: number | null,
  routeDistanceRemainingMi: number | null,
  terrainDifficultyScore: number,
): FuelRangePrediction {
  if (fuelRemainingGal == null || mpg == null || mpg <= 0) {
    return {
      available: false,
      status: 'unknown',
      message: 'Fuel data unavailable',
      fuelRemainingGal: null,
      estimatedRangeMi: null,
      routeDistanceRemainingMi,
      marginMi: null,
      terrainMultiplier: 1.0,
      fuelPercent: null,
    };
  }

  // Terrain difficulty increases fuel consumption
  // Score 0–100 maps to multiplier 1.0–1.8
  const terrainMultiplier = 1.0 + (terrainDifficultyScore / 100) * 0.8;
  const adjustedMpg = mpg / terrainMultiplier;

  const estimatedRangeMi = Math.round(fuelRemainingGal * adjustedMpg);
  const fuelPercent = fuelCapacityGal && fuelCapacityGal > 0
    ? Math.round((fuelRemainingGal / fuelCapacityGal) * 100)
    : null;

  // If no route, just report fuel status
  if (routeDistanceRemainingMi == null || routeDistanceRemainingMi <= 0) {
    const status: PredictionStatus = fuelPercent != null
      ? (fuelPercent < 15 ? 'risk' : fuelPercent < 30 ? 'caution' : 'sufficient')
      : 'sufficient';

    return {
      available: true,
      status,
      message: status === 'risk'
        ? `Fuel low — ${fuelPercent}% remaining`
        : status === 'caution'
        ? `Fuel moderate — ${estimatedRangeMi} mi range`
        : `Fuel sufficient — ${estimatedRangeMi} mi range`,
      fuelRemainingGal,
      estimatedRangeMi,
      routeDistanceRemainingMi,
      marginMi: null,
      terrainMultiplier,
      fuelPercent,
    };
  }

  const marginMi = estimatedRangeMi - routeDistanceRemainingMi;

  let status: PredictionStatus;
  let message: string;

  if (marginMi < 0) {
    status = 'risk';
    message = `Fuel risk high — ${Math.abs(Math.round(marginMi))} mi shortfall`;
  } else if (marginMi < estimatedRangeMi * 0.2) {
    status = 'caution';
    message = `Fuel margin low for current route`;
  } else {
    status = 'sufficient';
    message = `Fuel sufficient — ${Math.round(marginMi)} mi margin`;
  }

  return {
    available: true,
    status,
    message,
    fuelRemainingGal,
    estimatedRangeMi,
    routeDistanceRemainingMi,
    marginMi: Math.round(marginMi),
    terrainMultiplier: Math.round(terrainMultiplier * 100) / 100,
    fuelPercent,
  };
}

// ══════════════════════════════════════════════════════════════
// 2. DAYLIGHT RISK PREDICTION
// ══════════════════════════════════════════════════════════════

/**
 * Predict whether the expedition will continue after dark.
 *
 * Uses:
 *   - Current speed + distance remaining → estimated completion time
 *   - Latitude → approximate sunset time
 *   - Terrain difficulty → speed reduction factor
 */
function predictDaylight(
  currentLat: number | null,
  currentLon: number | null,
  currentSpeedMph: number | null,
  routeDistanceRemainingMi: number | null,
  terrainDifficultyScore: number,
): DaylightPrediction {
  if (currentLat == null || currentLon == null) {
    return {
      available: false,
      status: 'unknown',
      message: 'GPS coordinate unavailable for daylight estimate',
      daylightRemainingHours: null,
      estimatedCompletionHours: null,
      sunsetTimeLocal: null,
      darknessLikely: false,
      marginHours: null,
    };
  }

  const now = new Date();
  const environment = buildEnvironmentSnapshot({
    coordinate: {
      latitude: currentLat,
      longitude: currentLon,
      source: 'gps',
      updatedAt: now.getTime(),
    },
    nowMs: now.getTime(),
  });
  const isCurrentlyDark = environment.sunlight.nextEvent === 'sunrise';
  const daylightRemainingHours =
    environment.sunlight.remainingMinutes == null
      ? null
      : isCurrentlyDark
        ? 0
        : environment.sunlight.remainingMinutes / 60;
  const sunsetTimeLocal = formatEnvironmentTime(
    environment.sunlight.sunsetIso,
    environment.timezone.id,
  );
  if (daylightRemainingHours == null || sunsetTimeLocal === 'Unavailable') {
    return {
      available: false,
      status: 'unknown',
      message: 'Sunlight data unavailable for current coordinate',
      daylightRemainingHours: null,
      estimatedCompletionHours: null,
      sunsetTimeLocal: null,
      darknessLikely: false,
      marginHours: null,
    };
  }

  // Estimate completion time
  let estimatedCompletionHours: number | null = null;
  let darknessLikely = false;
  let marginHours: number | null = null;

  if (routeDistanceRemainingMi != null && routeDistanceRemainingMi > 0) {
    // Use current speed with terrain adjustment
    let effectiveSpeed = currentSpeedMph ?? 15; // Default 15 mph if no speed
    if (effectiveSpeed < 2) effectiveSpeed = 15; // Stopped → use default

    // Terrain reduces effective speed
    const terrainSpeedFactor = 1.0 - (terrainDifficultyScore / 100) * 0.4;
    effectiveSpeed *= Math.max(0.3, terrainSpeedFactor);

    estimatedCompletionHours = routeDistanceRemainingMi / effectiveSpeed;
    marginHours = daylightRemainingHours - estimatedCompletionHours;
    darknessLikely = marginHours < 0;
  }

  let status: PredictionStatus;
  let message: string;

  if (daylightRemainingHours <= 0) {
    status = 'risk';
    message = 'After dark — use caution';
    darknessLikely = true;
  } else if (darknessLikely) {
    status = 'risk';
    message = 'Sunset likely before route completion';
  } else if (marginHours != null && marginHours < 1.0) {
    status = 'caution';
    message = `Tight daylight margin — ${Math.round(marginHours * 60)} min`;
  } else if (daylightRemainingHours < 1.5) {
    status = 'caution';
    message = `${daylightRemainingHours.toFixed(1)} hrs daylight remaining`;
  } else {
    status = 'sufficient';
    message = `Daylight sufficient — sunset ${sunsetTimeLocal}`;
  }

  return {
    available: true,
    status,
    message,
    daylightRemainingHours: Math.round(daylightRemainingHours * 10) / 10,
    estimatedCompletionHours: estimatedCompletionHours != null
      ? Math.round(estimatedCompletionHours * 10) / 10
      : null,
    sunsetTimeLocal,
    darknessLikely,
    marginHours: marginHours != null ? Math.round(marginHours * 10) / 10 : null,
  };
}

// ══════════════════════════════════════════════════════════════
// 3. WATER SUPPLY PROJECTION
// ══════════════════════════════════════════════════════════════

/**
 * Predict water sufficiency for the remaining expedition.
 *
 * Uses:
 *   - Water remaining (from telemetryConfigStore)
 *   - Daily burn rate
 *   - Expedition duration estimate
 *   - Temperature factor (hot weather increases consumption)
 */
function predictWaterSupply(
  waterRemainingL: number | null,
  waterDailyBurnL: number | null,
  estimatedDaysRemaining: number,
  temperatureF: number | null,
  terrainDifficultyScore: number,
): WaterSupplyPrediction {
  if (waterRemainingL == null) {
    return {
      available: false,
      status: 'unknown',
      message: 'Water data unavailable',
      waterRemainingL: null,
      waterNeededL: null,
      marginL: null,
      autonomyDays: null,
      temperatureFactor: 1.0,
    };
  }

  const dailyBurn = waterDailyBurnL ?? DEFAULT_WATER_RATE_LPD * DEFAULT_PEOPLE;

  // Temperature increases water consumption
  let temperatureFactor = 1.0;
  if (temperatureF != null) {
    if (temperatureF > 100) temperatureFactor = 1.6;
    else if (temperatureF > 90) temperatureFactor = 1.4;
    else if (temperatureF > 80) temperatureFactor = 1.2;
    else if (temperatureF > 70) temperatureFactor = 1.1;
    else temperatureFactor = 1.0;
  }

  // Terrain difficulty also increases water consumption
  const terrainFactor = 1.0 + (terrainDifficultyScore / 100) * 0.3;

  const adjustedDailyBurn = dailyBurn * temperatureFactor * terrainFactor;
  const waterNeededL = adjustedDailyBurn * Math.max(estimatedDaysRemaining, 0.5);
  const marginL = waterRemainingL - waterNeededL;
  const autonomyDays = adjustedDailyBurn > 0
    ? Math.round((waterRemainingL / adjustedDailyBurn) * 10) / 10
    : null;

  let status: PredictionStatus;
  let message: string;

  if (marginL < 0) {
    status = 'risk';
    message = `Water supply risk — ${Math.abs(Math.round(marginL * 10) / 10)} L shortfall`;
  } else if (autonomyDays != null && autonomyDays < 1.5) {
    status = 'caution';
    message = `Water margin low — ${autonomyDays} days remaining`;
  } else {
    status = 'sufficient';
    message = `Water supply adequate — ${autonomyDays ?? '?'} days`;
  }

  return {
    available: true,
    status,
    message,
    waterRemainingL: Math.round(waterRemainingL * 10) / 10,
    waterNeededL: Math.round(waterNeededL * 10) / 10,
    marginL: Math.round(marginL * 10) / 10,
    autonomyDays,
    temperatureFactor: Math.round(temperatureFactor * 100) / 100,
  };
}

// ══════════════════════════════════════════════════════════════
// 4. REMOTENESS EXPOSURE PREDICTION
// ══════════════════════════════════════════════════════════════

/** History of remoteness scores for trend detection */
let _remotenessHistory: Array<{ score: number; timestamp: number }> = [];
const REMOTENESS_HISTORY_MAX = 20;
const REMOTENESS_TREND_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Predict whether the expedition is moving deeper into remote terrain.
 *
 * Uses:
 *   - Current remoteness score + tier
 *   - Historical remoteness scores (trend)
 *   - Distance from start
 *   - Route distance remaining
 */
function predictRemotenessExposure(
  currentScore: number | null,
  currentTier: string | null,
  distanceFromStartMi: number,
  routeDistanceRemainingMi: number | null,
): RemotenessExposurePrediction {
  if (currentScore == null) {
    return {
      available: false,
      status: 'unknown',
      message: 'Remoteness data unavailable',
      currentScore: null,
      currentTier: null,
      trend: 'unknown',
      distanceFromStartMi: 0,
      distanceToExitMi: null,
      isolationRisk: false,
    };
  }

  // Record history for trend detection
  const now = Date.now();
  _remotenessHistory.push({ score: currentScore, timestamp: now });

  // Trim old entries
  const cutoff = now - REMOTENESS_TREND_WINDOW_MS;
  _remotenessHistory = _remotenessHistory.filter(h => h.timestamp >= cutoff);
  if (_remotenessHistory.length > REMOTENESS_HISTORY_MAX) {
    _remotenessHistory = _remotenessHistory.slice(-REMOTENESS_HISTORY_MAX);
  }

  // Detect trend
  let trend: RemotenessTrend = 'unknown';
  if (_remotenessHistory.length >= 3) {
    const firstThird = _remotenessHistory.slice(0, Math.floor(_remotenessHistory.length / 3));
    const lastThird = _remotenessHistory.slice(-Math.floor(_remotenessHistory.length / 3));

    const avgFirst = firstThird.reduce((s, h) => s + h.score, 0) / firstThird.length;
    const avgLast = lastThird.reduce((s, h) => s + h.score, 0) / lastThird.length;

    const delta = avgLast - avgFirst;
    if (delta > 5) trend = 'increasing';
    else if (delta < -5) trend = 'decreasing';
    else trend = 'stable';
  }

  // Estimate distance to exit (rough: distance from start as proxy)
  const distanceToExitMi = distanceFromStartMi > 0
    ? Math.round(distanceFromStartMi * 10) / 10
    : null;

  // Isolation risk: high remoteness + increasing trend + far from start
  const isolationRisk = currentScore > 60 && (trend === 'increasing' || distanceFromStartMi > 30);

  let status: PredictionStatus;
  let message: string;

  if (currentScore > 80 || (currentScore > 60 && trend === 'increasing')) {
    status = 'risk';
    if (trend === 'increasing') {
      message = 'Extreme remoteness ahead';
    } else {
      message = `Isolation risk high — ${currentTier}`;
    }
  } else if (currentScore > 50 || (currentScore > 35 && trend === 'increasing')) {
    status = 'caution';
    if (trend === 'increasing') {
      message = 'Remoteness increasing';
    } else {
      message = `Remote area — ${Math.round(distanceFromStartMi)} mi from start`;
    }
  } else {
    status = 'sufficient';
    message = trend === 'decreasing'
      ? 'Remoteness decreasing'
      : `${currentTier ?? 'Near civilization'}`;
  }

  return {
    available: true,
    status,
    message,
    currentScore,
    currentTier,
    trend,
    distanceFromStartMi: Math.round(distanceFromStartMi * 100) / 100,
    distanceToExitMi,
    isolationRisk,
  };
}

// ══════════════════════════════════════════════════════════════
// 5. TERRAIN EXPOSURE PREDICTION
// ══════════════════════════════════════════════════════════════

/**
 * Predict difficult terrain sections ahead.
 *
 * Uses:
 *   - Route elevation data (ahead of current position)
 *   - Breadcrumb trail analysis
 *   - Current terrain difficulty from Phase 9
 */
function predictTerrainExposure(
  breadcrumbPoints: any[],
  routeSegments: any[] | null,
  currentLat: number | null,
  currentLon: number | null,
  currentSpeedMph: number | null,
  currentTerrainDifficultyLevel: string,
  currentTerrainDifficultyScore: number,
): TerrainExposurePrediction {
  let elevationChangeAheadFt: number | null = null;
  let technicalSectionAhead = false;
  let slopeSeverity: TerrainExposurePrediction['slopeSeverity'] = 'unknown';
  let curvatureLevel: TerrainExposurePrediction['curvatureLevel'] = 'unknown';

  // Analyze route segments ahead of current position
  if (routeSegments && routeSegments.length > 0 && currentLat != null && currentLon != null) {
    // Find nearest point on route
    let nearestIdx = 0;
    let nearestDist = Infinity;
    const allPoints: any[] = [];

    for (const seg of routeSegments) {
      for (const pt of seg.points) {
        allPoints.push(pt);
      }
    }

    for (let i = 0; i < allPoints.length; i++) {
      const d = haversineDistanceMi(currentLat, currentLon, allPoints[i].lat, allPoints[i].lon);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    // Look ahead ~5 miles on the route
    const lookaheadMi = 5;
    let distAccum = 0;
    let totalGainFt = 0;
    let totalLossFt = 0;
    let maxGradeDeg = 0;
    let headingChanges = 0;
    let headingSegments = 0;

    for (let i = nearestIdx; i < allPoints.length - 1 && distAccum < lookaheadMi; i++) {
      const p1 = allPoints[i];
      const p2 = allPoints[i + 1];
      const segDist = haversineDistanceMi(p1.lat, p1.lon, p2.lat, p2.lon);
      distAccum += segDist;

      // Elevation analysis
      if (p1.ele != null && p2.ele != null) {
        const eleDiffM = p2.ele - p1.ele;
        const eleDiffFt = eleDiffM * 3.28084;
        if (eleDiffFt > 0) totalGainFt += eleDiffFt;
        else totalLossFt += Math.abs(eleDiffFt);

        // Grade calculation
        const distM = segDist * 1609.34;
        if (distM > 5) {
          const gradeDeg = Math.abs(Math.atan2(eleDiffM, distM) * 180 / Math.PI);
          maxGradeDeg = Math.max(maxGradeDeg, gradeDeg);
        }
      }

      // Curvature analysis
      if (i < allPoints.length - 2) {
        const p3 = allPoints[i + 2];
        const b1 = Math.atan2(p2.lon - p1.lon, p2.lat - p1.lat) * 180 / Math.PI;
        const b2 = Math.atan2(p3.lon - p2.lon, p3.lat - p2.lat) * 180 / Math.PI;
        let diff = b2 - b1;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        headingChanges += Math.abs(diff);
        headingSegments++;
      }
    }

    elevationChangeAheadFt = Math.round(totalGainFt + totalLossFt);

    // Slope severity
    if (maxGradeDeg > 15) slopeSeverity = 'extreme';
    else if (maxGradeDeg > 8) slopeSeverity = 'steep';
    else if (maxGradeDeg > 3) slopeSeverity = 'moderate';
    else slopeSeverity = 'mild';

    // Curvature level
    const avgCurvature = headingSegments > 0 ? headingChanges / headingSegments : 0;
    if (avgCurvature > 45) curvatureLevel = 'technical';
    else if (avgCurvature > 20) curvatureLevel = 'winding';
    else curvatureLevel = 'straight';

    // Technical section detection
    technicalSectionAhead = maxGradeDeg > 12 || avgCurvature > 40 ||
      (totalGainFt > 500 && distAccum < 3);
  }

  // Fallback: use breadcrumb-based analysis if no route
  if (routeSegments == null || routeSegments.length === 0) {
    if (breadcrumbPoints.length >= MIN_SPEED_POINTS) {
      const recentPoints = breadcrumbPoints.slice(-20);

      // Check recent speed for technical terrain
      const avgSpeed = recentPoints.reduce((s: number, p: any) =>
        s + (p.speedMph ?? 15), 0) / recentPoints.length;
      if (avgSpeed < 8) technicalSectionAhead = true;

      // Curvature from breadcrumbs
      let totalTurn = 0;
      let turnCount = 0;
      for (let i = 1; i < recentPoints.length - 1; i++) {
        const p0 = recentPoints[i - 1];
        const p1 = recentPoints[i];
        const p2 = recentPoints[i + 1];
        const b1 = Math.atan2(p1.longitude - p0.longitude, p1.latitude - p0.latitude) * 180 / Math.PI;
        const b2 = Math.atan2(p2.longitude - p1.longitude, p2.latitude - p1.latitude) * 180 / Math.PI;
        let diff = b2 - b1;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        totalTurn += Math.abs(diff);
        turnCount++;
      }
      const avgTurn = turnCount > 0 ? totalTurn / turnCount : 0;
      if (avgTurn > 45) curvatureLevel = 'technical';
      else if (avgTurn > 20) curvatureLevel = 'winding';
      else curvatureLevel = 'straight';
    }
  }

  // Determine upcoming difficulty from current + route analysis
  let upcomingDifficulty: TerrainExposurePrediction['upcomingDifficulty'] = 'Unknown';
  if (currentTerrainDifficultyLevel) {
    upcomingDifficulty = currentTerrainDifficultyLevel as any;
  }

  // Upgrade difficulty if route analysis shows harder terrain ahead
  if (slopeSeverity === 'extreme' || (technicalSectionAhead && curvatureLevel === 'technical')) {
    upcomingDifficulty = 'Extreme';
  } else if (slopeSeverity === 'steep' || technicalSectionAhead) {
    if (upcomingDifficulty === 'Easy' || upcomingDifficulty === 'Moderate') {
      upcomingDifficulty = 'Difficult';
    }
  }

  const hasData = (routeSegments && routeSegments.length > 0) ||
    breadcrumbPoints.length >= MIN_SPEED_POINTS;

  let status: PredictionStatus;
  let message: string;

  if (!hasData) {
    status = 'unknown';
    message = 'Terrain data insufficient';
  } else if (upcomingDifficulty === 'Extreme') {
    status = 'risk';
    message = technicalSectionAhead
      ? 'Technical trail section ahead'
      : 'Extreme terrain approaching';
  } else if (upcomingDifficulty === 'Difficult') {
    status = 'caution';
    message = slopeSeverity === 'steep'
      ? 'Steep elevation change approaching'
      : 'Difficult terrain ahead';
  } else if (upcomingDifficulty === 'Moderate') {
    status = 'caution';
    message = 'Moderate terrain conditions';
  } else {
    status = 'sufficient';
    message = 'Trail conditions manageable';
  }

  return {
    available: hasData,
    status,
    message,
    upcomingDifficulty,
    elevationChangeAheadFt,
    technicalSectionAhead,
    slopeSeverity,
    curvatureLevel,
  };
}

// ══════════════════════════════════════════════════════════════
// 6. COMBINED EXPEDITION RISK SUMMARY
// ══════════════════════════════════════════════════════════════

/**
 * Generate a combined risk summary from all predictions.
 *
 * Each factor contributes 0–20 to the total score (max 100).
 */
function assessPredictiveRisk(
  fuel: FuelRangePrediction,
  daylight: DaylightPrediction,
  water: WaterSupplyPrediction,
  remoteness: RemotenessExposurePrediction,
  terrain: TerrainExposurePrediction,
): PredictiveRiskSummary {
  const drivers: string[] = [];

  // ── Fuel factor (0–20) ──
  let fuelFactor = 0;
  if (fuel.available) {
    if (fuel.status === 'risk') { fuelFactor = 18; drivers.push('Fuel risk high'); }
    else if (fuel.status === 'caution') { fuelFactor = 10; drivers.push('Fuel margin low'); }
    else fuelFactor = 2;
  } else {
    fuelFactor = 5; // Unknown = mild concern
  }

  // ── Daylight factor (0–20) ──
  let daylightFactor = 0;
  if (daylight.available) {
    if (daylight.status === 'risk') { daylightFactor = 16; drivers.push('High darkness risk'); }
    else if (daylight.status === 'caution') { daylightFactor = 9; drivers.push('Daylight limited'); }
    else daylightFactor = 1;
  }

  // ── Water factor (0–20) ──
  let waterFactor = 0;
  if (water.available) {
    if (water.status === 'risk') { waterFactor = 18; drivers.push('Water supply risk'); }
    else if (water.status === 'caution') { waterFactor = 10; drivers.push('Water margin low'); }
    else waterFactor = 2;
  } else {
    waterFactor = 4;
  }

  // ── Remoteness factor (0–20) ──
  let remotenessFactor = 0;
  if (remoteness.available) {
    if (remoteness.status === 'risk') { remotenessFactor = 17; drivers.push('Extreme remoteness'); }
    else if (remoteness.status === 'caution') { remotenessFactor = 9; drivers.push('Remoteness increasing'); }
    else remotenessFactor = 2;
  }

  // ── Terrain factor (0–20) ──
  let terrainFactor = 0;
  if (terrain.available) {
    if (terrain.status === 'risk') { terrainFactor = 17; drivers.push('Technical terrain ahead'); }
    else if (terrain.status === 'caution') { terrainFactor = 9; drivers.push('Difficult terrain'); }
    else terrainFactor = 2;
  }

  // ── Composite score ──
  const totalScore = clamp(
    fuelFactor + daylightFactor + waterFactor + remotenessFactor + terrainFactor,
    0, 100,
  );

  // ── Classify risk level ──
  let level: PredictiveRiskLevel;
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
    color: PREDICTIVE_RISK_COLORS[level],
    icon: PREDICTIVE_RISK_ICONS[level],
    summary: `${level} — ${drivers[0]}`,
    factors: {
      fuel: fuelFactor,
      daylight: daylightFactor,
      water: waterFactor,
      remoteness: remotenessFactor,
      terrain: terrainFactor,
    },
    drivers: drivers.slice(0, 3),
  };
}

// ══════════════════════════════════════════════════════════════
// DEFAULT OUTPUT
// ══════════════════════════════════════════════════════════════

function createDefaultOutput(): PredictiveAwarenessOutput {
  return {
    isActive: false,
    computedAt: new Date().toISOString(),
    isExpeditionDrive: false,
    fuelPrediction: {
      available: false, status: 'unknown', message: 'Initializing...',
      fuelRemainingGal: null, estimatedRangeMi: null,
      routeDistanceRemainingMi: null, marginMi: null,
      terrainMultiplier: 1.0, fuelPercent: null,
    },
    daylightPrediction: {
      available: false, status: 'unknown', message: 'Initializing...',
      daylightRemainingHours: null, estimatedCompletionHours: null,
      sunsetTimeLocal: null, darknessLikely: false, marginHours: null,
    },
    waterPrediction: {
      available: false, status: 'unknown', message: 'Initializing...',
      waterRemainingL: null, waterNeededL: null,
      marginL: null, autonomyDays: null, temperatureFactor: 1.0,
    },
    remotenessPrediction: {
      available: false, status: 'unknown', message: 'Initializing...',
      currentScore: null, currentTier: null, trend: 'unknown',
      distanceFromStartMi: 0, distanceToExitMi: null, isolationRisk: false,
    },
    terrainPrediction: {
      available: false, status: 'unknown', message: 'Initializing...',
      upcomingDifficulty: 'Unknown', elevationChangeAheadFt: null,
      technicalSectionAhead: false, slopeSeverity: 'unknown', curvatureLevel: 'unknown',
    },
    riskSummary: {
      level: 'Low Risk', score: 0,
      color: PREDICTIVE_RISK_COLORS['Low Risk'],
      icon: PREDICTIVE_RISK_ICONS['Low Risk'],
      summary: 'Assessing risks...',
      factors: { fuel: 0, daylight: 0, water: 0, remoteness: 0, terrain: 0 },
      drivers: ['Assessing...'],
    },
    dataAvailability: {
      hasFuel: false, hasWater: false, hasRoute: false, hasGps: false,
      hasDaylight: false, hasRemoteness: false, hasTerrain: false, hasWeather: false,
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

    // ── Gather data from stores ──

    // GPS data
    let currentLat: number | null = null;
    let currentLon: number | null = null;
    let currentSpeedMph: number | null = null;
    let hasGps = false;

    try {
      const { gpsUIState } = require('./gpsUIState');
      const gps = gpsUIState.get();
      if (gps.hasFix && gps.position) {
        currentLat = gps.position.latitude;
        currentLon = gps.position.longitude;
        currentSpeedMph = gps.position.speedMph ?? null;
        hasGps = true;
      }
    } catch {}

    // Route data
    let routeDistanceRemainingMi: number | null = null;
    let routeSegments: any[] | null = null;
    let hasRoute = false;

    try {
      const { routeStore } = require('./routeStore');
      const activeRoute = routeStore.getActive();
      if (activeRoute) {
        hasRoute = true;
        routeSegments = activeRoute.segments ?? null;

        // Calculate distance remaining from current position
        if (currentLat != null && currentLon != null && activeRoute.total_distance_miles > 0) {
          // Find nearest point on route and calculate remaining distance
          let totalRouteDist = activeRoute.total_distance_miles;
          let distToNearest = Infinity;
          let nearestCumulDist = 0;
          let cumulDist = 0;

          if (activeRoute.segments && activeRoute.segments.length > 0) {
            for (const seg of activeRoute.segments) {
              for (let i = 0; i < seg.points.length; i++) {
                const pt = seg.points[i];
                const d = haversineDistanceMi(currentLat, currentLon, pt.lat, pt.lon);
                if (d < distToNearest) {
                  distToNearest = d;
                  nearestCumulDist = cumulDist;
                }
                if (i > 0) {
                  const prev = seg.points[i - 1];
                  cumulDist += haversineDistanceMi(prev.lat, prev.lon, pt.lat, pt.lon);
                }
              }
            }
            routeDistanceRemainingMi = Math.max(0, totalRouteDist - nearestCumulDist);
          } else {
            routeDistanceRemainingMi = totalRouteDist;
          }
        } else {
          routeDistanceRemainingMi = activeRoute.total_distance_miles;
        }
      }
    } catch {}

    // Breadcrumb data
    let breadcrumbPoints: any[] = [];
    let distanceFromStartMi = 0;

    try {
      const { breadcrumbTracker } = require('./breadcrumbTracker');
      breadcrumbPoints = breadcrumbTracker.getPoints();
      const bcState = breadcrumbTracker.get();
      distanceFromStartMi = bcState.distanceFromStartMi;
    } catch {}

    // Telemetry data
    let fuelRemainingGal: number | null = null;
    let fuelCapacityGal: number | null = null;
    let mpg: number | null = null;
    let waterRemainingL: number | null = null;
    let waterDailyBurnL: number | null = null;
    let hasFuel = false;
    let hasWater = false;

    try {
      const { missionExpeditionStore } = require('./missionStore');
      const activeExp = missionExpeditionStore.getActive();
      if (activeExp) {
        const { telemetryConfigStore } = require('./telemetryStore');
        const config = telemetryConfigStore.get(activeExp.id);
        if (config.fuelRemainingGal != null) {
          fuelRemainingGal = config.fuelRemainingGal;
          fuelCapacityGal = config.fuelCapacityGal;
          mpg = config.fuelMpg;
          hasFuel = true;
        }
        if (config.waterRemainingL != null) {
          waterRemainingL = config.waterRemainingL;
          waterDailyBurnL = config.waterDailyBurnL;
          hasWater = true;
        }
      }
    } catch {}

    // Remoteness data
    let remotenessScore: number | null = null;
    let remotenessTier: string | null = null;
    let hasRemoteness = false;

    try {
      const { remotenessStore } = require('./remotenessStore');
      const remoteness = remotenessStore.get();
      if (remoteness && remoteness.score > 0) {
        remotenessScore = remoteness.score;
        remotenessTier = remoteness.tier;
        hasRemoteness = true;
      }
    } catch {}

    // Terrain difficulty from Phase 9
    let terrainDifficultyLevel = 'Easy';
    let terrainDifficultyScore = 0;
    let hasTerrain = false;

    try {
      const { offlineExpeditionIntelligence } = require('./offlineExpeditionIntelligence');
      const intel = offlineExpeditionIntelligence.get();
      if (intel.isActive) {
        terrainDifficultyLevel = intel.terrainDifficulty.level;
        terrainDifficultyScore = intel.terrainDifficulty.score;
        hasTerrain = true;
      }
    } catch {}

    // Weather data (for temperature)
    let temperatureF: number | null = null;
    let hasWeather = false;

    try {
      const { offlineExpeditionIntelligence } = require('./offlineExpeditionIntelligence');
      const intel = offlineExpeditionIntelligence.get();
      if (intel.weatherAwareness.available && intel.weatherAwareness.temperatureF != null) {
        temperatureF = intel.weatherAwareness.temperatureF;
        hasWeather = true;
      }
    } catch {}

    // Estimate remaining expedition duration
    let estimatedDaysRemaining = 1;
    if (routeDistanceRemainingMi != null && routeDistanceRemainingMi > 0) {
      const avgSpeed = currentSpeedMph ?? 20;
      const hoursRemaining = routeDistanceRemainingMi / Math.max(avgSpeed, 5);
      estimatedDaysRemaining = Math.max(0.5, hoursRemaining / 8); // 8 hours driving per day
    }

    // ── Compute predictions ──

    // 1. Fuel Range Risk
    const fuelPrediction = predictFuelRange(
      fuelRemainingGal, fuelCapacityGal, mpg,
      routeDistanceRemainingMi, terrainDifficultyScore,
    );

    // 2. Daylight Risk
    const daylightPrediction = predictDaylight(
      currentLat, currentLon, currentSpeedMph,
      routeDistanceRemainingMi, terrainDifficultyScore,
    );

    // 3. Water Supply Projection
    const waterPrediction = predictWaterSupply(
      waterRemainingL, waterDailyBurnL,
      estimatedDaysRemaining, temperatureF, terrainDifficultyScore,
    );

    // 4. Remoteness Exposure
    const remotenessPrediction = predictRemotenessExposure(
      remotenessScore, remotenessTier,
      distanceFromStartMi, routeDistanceRemainingMi,
    );

    // 5. Terrain Exposure
    const terrainPrediction = predictTerrainExposure(
      breadcrumbPoints, routeSegments,
      currentLat, currentLon, currentSpeedMph,
      terrainDifficultyLevel, terrainDifficultyScore,
    );

    // 6. Combined Risk Summary
    const riskSummary = assessPredictiveRisk(
      fuelPrediction, daylightPrediction, waterPrediction,
      remotenessPrediction, terrainPrediction,
    );

    // ── Build output ──
    const output: PredictiveAwarenessOutput = {
      isActive: true,
      computedAt: new Date().toISOString(),
      isExpeditionDrive,
      fuelPrediction,
      daylightPrediction,
      waterPrediction,
      remotenessPrediction,
      terrainPrediction,
      riskSummary,
      dataAvailability: {
        hasFuel,
        hasWater,
        hasRoute,
        hasGps,
        hasDaylight: hasGps, // Daylight needs GPS for latitude
        hasRemoteness,
        hasTerrain,
        hasWeather,
      },
    };

    // ── Check for meaningful change ──
    if (_cachedOutput && !_hasChanged(_cachedOutput, output)) {
      return;
    }

    _cachedOutput = output;
    _notify();

  } catch (err) {
    console.warn(TAG, 'Recomputation error:', err);
  }
}

/**
 * Check if the output has meaningfully changed.
 */
function _hasChanged(
  prev: PredictiveAwarenessOutput,
  next: PredictiveAwarenessOutput,
): boolean {
  if (prev.isActive !== next.isActive) return true;
  if (prev.isExpeditionDrive !== next.isExpeditionDrive) return true;

  // Check prediction statuses
  if (prev.fuelPrediction.status !== next.fuelPrediction.status) return true;
  if (prev.daylightPrediction.status !== next.daylightPrediction.status) return true;
  if (prev.waterPrediction.status !== next.waterPrediction.status) return true;
  if (prev.remotenessPrediction.status !== next.remotenessPrediction.status) return true;
  if (prev.terrainPrediction.status !== next.terrainPrediction.status) return true;

  // Check risk summary
  if (prev.riskSummary.level !== next.riskSummary.level) return true;
  if (Math.abs(prev.riskSummary.score - next.riskSummary.score) > 5) return true;

  // Check key metric changes
  if (prev.fuelPrediction.fuelPercent !== next.fuelPrediction.fuelPercent) return true;
  if (prev.daylightPrediction.darknessLikely !== next.daylightPrediction.darknessLikely) return true;
  if (prev.remotenessPrediction.trend !== next.remotenessPrediction.trend) return true;
  if (prev.terrainPrediction.upcomingDifficulty !== next.terrainPrediction.upcomingDifficulty) return true;

  // Check data availability changes
  const pa = prev.dataAvailability;
  const na = next.dataAvailability;
  if (pa.hasFuel !== na.hasFuel || pa.hasWater !== na.hasWater ||
      pa.hasRoute !== na.hasRoute || pa.hasGps !== na.hasGps ||
      pa.hasRemoteness !== na.hasRemoteness || pa.hasTerrain !== na.hasTerrain) return true;

  return false;
}

// ══════════════════════════════════════════════════════════════
// INTERNAL STATE
// ══════════════════════════════════════════════════════════════

let _cachedOutput: PredictiveAwarenessOutput | null = null;
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

export const predictiveExpeditionAwareness = {
  /**
   * Get current predictive awareness output.
   */
  get(): PredictiveAwarenessOutput {
    if (_cachedOutput) return _cachedOutput;
    return createDefaultOutput();
  },

  /**
   * Start the predictive awareness engine.
   * Begins periodic recomputation (every 45 seconds).
   */
  start(): void {
    if (_isRunning) return;
    _isRunning = true;

    console.log(TAG, 'Starting Predictive Expedition Awareness');

    // Immediate first computation
    _recompute();

    // Periodic recomputation (45s)
    _recomputeTimer = setInterval(_recompute, RECOMPUTE_INTERVAL_MS);
  },

  /**
   * Stop the predictive awareness engine.
   */
  stop(): void {
    if (!_isRunning) return;
    _isRunning = false;

    if (_recomputeTimer) {
      clearInterval(_recomputeTimer);
      _recomputeTimer = null;
    }

    console.log(TAG, 'Stopped Predictive Expedition Awareness');
  },

  /**
   * Whether the engine is actively computing.
   */
  isRunning(): boolean {
    return _isRunning;
  },

  /**
   * Force an immediate recomputation.
   */
  forceRecompute(): void {
    _recompute();
  },

  /**
   * Reset all state.
   */
  reset(): void {
    predictiveExpeditionAwareness.stop();
    _cachedOutput = null;
    _remotenessHistory = [];
    _notify();
    console.log(TAG, 'Predictive awareness state reset');
  },

  /**
   * Subscribe to prediction changes.
   * Returns unsubscribe function.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },

  // ── Convenience Accessors ─────────────────────────────────

  getFuelPrediction(): FuelRangePrediction {
    return predictiveExpeditionAwareness.get().fuelPrediction;
  },

  getDaylightPrediction(): DaylightPrediction {
    return predictiveExpeditionAwareness.get().daylightPrediction;
  },

  getWaterPrediction(): WaterSupplyPrediction {
    return predictiveExpeditionAwareness.get().waterPrediction;
  },

  getRemotenessPrediction(): RemotenessExposurePrediction {
    return predictiveExpeditionAwareness.get().remotenessPrediction;
  },

  getTerrainPrediction(): TerrainExposurePrediction {
    return predictiveExpeditionAwareness.get().terrainPrediction;
  },

  getRiskSummary(): PredictiveRiskSummary {
    return predictiveExpeditionAwareness.get().riskSummary;
  },

  /**
   * Get a compact summary string for vehicle display screens.
   *
   * Example: "Moderate Risk — Fuel margin low, Remoteness increasing"
   */
  getCompactSummary(): string {
    const output = predictiveExpeditionAwareness.get();
    if (!output.isActive) return 'Predictive awareness inactive';
    return output.riskSummary.summary;
  },

  /**
   * Get a driver-safe status line for vehicle display.
   *
   * Returns the most critical prediction as a short string.
   * Prioritizes risk > caution > sufficient.
   */
  getDriverStatusLine(): string {
    const output = predictiveExpeditionAwareness.get();
    if (!output.isActive) return 'Predictive awareness standby';

    // Priority 1: Any risk-level predictions
    const riskPredictions = [
      output.fuelPrediction,
      output.daylightPrediction,
      output.waterPrediction,
      output.remotenessPrediction,
      output.terrainPrediction,
    ].filter(p => p.status === 'risk');

    if (riskPredictions.length > 0) {
      return riskPredictions[0].message;
    }

    // Priority 2: Any caution-level predictions
    const cautionPredictions = [
      output.fuelPrediction,
      output.daylightPrediction,
      output.waterPrediction,
      output.remotenessPrediction,
      output.terrainPrediction,
    ].filter(p => p.status === 'caution');

    if (cautionPredictions.length > 0) {
      return cautionPredictions[0].message;
    }

    // Priority 3: Overall summary
    return output.riskSummary.summary;
  },

  /**
   * Get the number of active warnings (risk + caution predictions).
   */
  getWarningCount(): number {
    const output = predictiveExpeditionAwareness.get();
    if (!output.isActive) return 0;

    return [
      output.fuelPrediction,
      output.daylightPrediction,
      output.waterPrediction,
      output.remotenessPrediction,
      output.terrainPrediction,
    ].filter(p => p.status === 'risk' || p.status === 'caution').length;
  },
};


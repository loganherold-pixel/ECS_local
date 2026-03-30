/**
 * ECS ROUTE ANALYSIS ENGINE — Predictive Expedition Intelligence (Phase 1)
 * ========================================================================
 *
 * Analyzes loaded GPX routes and extracts forecast information used by the
 * Predictive Expedition Intelligence system.
 *
 * Activates when a user loads or imports a route into the Navigate tab.
 *
 * OUTPUTS:
 *   - Total distance (miles)
 *   - Estimated drive time (hours)
 *   - Elevation gain (feet)
 *   - Highest elevation (feet)
 *   - Lowest elevation (feet)
 *   - Route segments (every 10 miles)
 *   - Terrain difficulty classification per segment
 *   - Elevation profile data
 *
 * ARCHITECTURE:
 *   - Pure analysis functions (no side effects)
 *   - Subscriber pattern for UI updates
 *   - Stores locally (localStorage/memory)
 *   - Integrates with runStore and routeStore
 */

import { Platform } from 'react-native';

const TAG = '[ROUTE_ANALYSIS]';

// ── Types ────────────────────────────────────────────────────

/**
 * A 10-mile route segment with terrain analysis data.
 */
export interface RouteAnalysisSegment {
  /** Segment index (0-based) */
  segmentIndex: number;
  /** Distance at segment start (miles) */
  distanceStart: number;
  /** Distance at segment end (miles) */
  distanceEnd: number;
  /** Average elevation in this segment (feet) */
  avgElevation: number;
  /** Elevation gain within this segment (feet) */
  elevationGain: number;
  /** Elevation loss within this segment (feet) */
  elevationLoss: number;
  /** Highest point in this segment (feet) */
  maxElevation: number;
  /** Lowest point in this segment (feet) */
  minElevation: number;
  /** Representative coordinate for this segment [lat, lon] */
  coordinates: [number, number];
  /** Number of track points in this segment */
  pointCount: number;
  /** Average grade percentage in this segment */
  avgGradePercent: number;
  /** Max grade percentage in this segment */
  maxGradePercent: number;
  /** Terrain difficulty tier for this segment */
  difficulty: 'easy' | 'moderate' | 'challenging' | 'difficult';
  /** Estimated drive time for this segment (hours) */
  estimatedDriveTimeHours: number;
}

/**
 * Complete route intelligence analysis result.
 */
export interface RouteIntelligence {
  /** Unique analysis ID */
  id: string;
  /** Source run/route ID */
  sourceId: string;
  /** Source route name */
  routeName: string;
  /** Total route distance (miles) */
  totalDistanceMiles: number;
  /** Estimated total drive time (hours) at avg 35 mph, adjusted for terrain */
  estimatedDriveTimeHours: number;
  /** Total elevation gain (feet) */
  elevationGainFeet: number;
  /** Total elevation loss (feet) */
  elevationLossFeet: number;
  /** Highest point on route (feet) */
  highestElevationFeet: number;
  /** Lowest point on route (feet) */
  lowestElevationFeet: number;
  /** Average elevation (feet) */
  avgElevationFeet: number;
  /** Total number of track points analyzed */
  totalPoints: number;
  /** 10-mile route segments */
  segments: RouteAnalysisSegment[];
  /** Number of segments */
  segmentCount: number;
  /** Overall terrain difficulty */
  overallDifficulty: 'easy' | 'moderate' | 'challenging' | 'difficult';
  /** Route bounding box */
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null;
  /** Elevation profile sample points (distance → elevation) */
  elevationProfile: Array<{ distanceMi: number; elevationFt: number }>;
  /** Analysis timestamp */
  analyzedAt: string;
  /** Whether elevation data was available */
  hasElevation: boolean;
  /** Average speed assumption used (mph) */
  avgSpeedAssumption: number;
}

// ── Constants ────────────────────────────────────────────────

const SEGMENT_DISTANCE_MI = 10;       // Divide route into 10-mile segments
const DEFAULT_AVG_SPEED_MPH = 35;     // Default average speed assumption
const EARTH_RADIUS_MI = 3958.8;       // Earth radius in miles
const METERS_TO_FEET = 3.28084;       // Meters to feet conversion
const MAX_ELEVATION_PROFILE_POINTS = 150; // Max points in elevation profile
const STORAGE_KEY = 'ecs_route_intelligence';

// ── Storage helpers ──────────────────────────────────────────

const mem: Record<string, string> = {};

function sGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return mem[key] || null;
  } catch { return mem[key] || null; }
}

function sSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    mem[key] = value;
  } catch { mem[key] = value; }
}

function uuid(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Haversine Distance (miles) ───────────────────────────────

function haversineDistMi(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Grade Calculation ────────────────────────────────────────

function computeGradePercent(
  eleDiffFt: number,
  horizontalDistMi: number,
): number {
  if (horizontalDistMi <= 0) return 0;
  const horizontalDistFt = horizontalDistMi * 5280;
  return Math.abs((eleDiffFt / horizontalDistFt) * 100);
}

// ── Difficulty Classification ────────────────────────────────

function classifySegmentDifficulty(
  elevationGainFt: number,
  avgGradePercent: number,
  maxGradePercent: number,
  distanceMi: number,
): 'easy' | 'moderate' | 'challenging' | 'difficult' {
  // Gain per mile
  const gainPerMi = distanceMi > 0 ? elevationGainFt / distanceMi : 0;

  // Scoring
  let score = 0;

  // Elevation gain per mile contribution
  if (gainPerMi > 500) score += 3;
  else if (gainPerMi > 300) score += 2;
  else if (gainPerMi > 150) score += 1;

  // Average grade contribution
  if (avgGradePercent > 8) score += 3;
  else if (avgGradePercent > 5) score += 2;
  else if (avgGradePercent > 3) score += 1;

  // Max grade contribution
  if (maxGradePercent > 15) score += 2;
  else if (maxGradePercent > 10) score += 1;

  // Classify
  if (score >= 6) return 'difficult';
  if (score >= 4) return 'challenging';
  if (score >= 2) return 'moderate';
  return 'easy';
}

function classifyOverallDifficulty(
  segments: RouteAnalysisSegment[],
): 'easy' | 'moderate' | 'challenging' | 'difficult' {
  if (segments.length === 0) return 'easy';

  const difficultyScores = {
    easy: 0,
    moderate: 1,
    challenging: 2,
    difficult: 3,
  };

  let totalScore = 0;
  let maxScore = 0;

  for (const seg of segments) {
    const s = difficultyScores[seg.difficulty];
    totalScore += s;
    maxScore = Math.max(maxScore, s);
  }

  // Use weighted average: 60% average + 40% max
  const avgScore = totalScore / segments.length;
  const compositeScore = avgScore * 0.6 + maxScore * 0.4;

  if (compositeScore >= 2.5) return 'difficult';
  if (compositeScore >= 1.5) return 'challenging';
  if (compositeScore >= 0.5) return 'moderate';
  return 'easy';
}

// ── Estimated Drive Time ─────────────────────────────────────

function estimateDriveTime(
  distanceMi: number,
  elevationGainFt: number,
  avgSpeedMph: number = DEFAULT_AVG_SPEED_MPH,
): number {
  if (distanceMi <= 0) return 0;

  // Base time from distance
  let hours = distanceMi / avgSpeedMph;

  // Terrain penalty: add time for elevation gain
  // Rule: ~1 hour per 3000 ft of gain for vehicle travel
  if (elevationGainFt > 0) {
    hours += elevationGainFt / 3000;
  }

  return Math.round(hours * 100) / 100;
}

// ── Point Interface ──────────────────────────────────────────

interface AnalysisPoint {
  lat: number;
  lon: number;
  ele_m: number | null; // elevation in meters
}

// ── Core Analysis Function ───────────────────────────────────

/**
 * Analyze a route from an array of track points.
 *
 * Divides the route into 10-mile segments and computes:
 *   - Total distance
 *   - Elevation gain/loss
 *   - Highest/lowest elevation
 *   - Per-segment terrain analysis
 *   - Estimated drive time
 *   - Elevation profile
 *
 * @param points Array of track points with lat, lon, ele_m
 * @param sourceId Source run/route ID
 * @param routeName Route name
 * @param avgSpeedMph Average speed assumption (default: 35 mph)
 * @returns RouteIntelligence analysis result
 */
export function analyzeRoute(
  points: AnalysisPoint[],
  sourceId: string,
  routeName: string,
  avgSpeedMph: number = DEFAULT_AVG_SPEED_MPH,
): RouteIntelligence {
  const now = new Date().toISOString();

  // ── Edge case: not enough points ──
  if (!points || points.length < 2) {
    console.warn(TAG, 'Insufficient points for analysis — returning empty intelligence');
    return createEmptyIntelligence(sourceId, routeName, now, avgSpeedMph);
  }

  // ── Compute cumulative distances and elevation stats ──
  const cumulativeDistMi: number[] = [0];
  let totalGainM = 0;
  let totalLossM = 0;
  let minEleM = Infinity;
  let maxEleM = -Infinity;
  let totalEleM = 0;
  let elePointCount = 0;
  let hasElevation = false;

  // Bounds
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;

  // ── Stabilization: Track previous valid elevation for fallback ──
  let previousElevationM: number | null = null;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];

    // ── Stabilization: Skip points with invalid coordinates ──
    if (pt.lat == null || pt.lon == null || isNaN(pt.lat) || isNaN(pt.lon)) {
      // Push previous cumulative distance to maintain array alignment
      if (i > 0) cumulativeDistMi.push(cumulativeDistMi[i - 1]);
      continue;
    }

    // Update bounds
    minLat = Math.min(minLat, pt.lat);
    maxLat = Math.max(maxLat, pt.lat);
    minLon = Math.min(minLon, pt.lon);
    maxLon = Math.max(maxLon, pt.lon);

    // ── Stabilization: Elevation fallback logic ──
    // Use current elevation, or fall back to previous valid elevation, or 0
    const effectiveEleM: number | null =
      (pt.ele_m != null && !isNaN(pt.ele_m))
        ? pt.ele_m
        : previousElevationM;

    // Track previous valid elevation for next iteration
    if (pt.ele_m != null && !isNaN(pt.ele_m)) {
      previousElevationM = pt.ele_m;
    }

    // Elevation tracking (use original value for stats, not fallback)
    if (pt.ele_m != null && !isNaN(pt.ele_m)) {
      hasElevation = true;
      minEleM = Math.min(minEleM, pt.ele_m);
      maxEleM = Math.max(maxEleM, pt.ele_m);
      totalEleM += pt.ele_m;
      elePointCount++;
    }

    // Distance and elevation change
    if (i > 0) {
      const prev = points[i - 1];
      // ── Stabilization: Guard against invalid previous coordinates ──
      if (prev.lat != null && prev.lon != null && !isNaN(prev.lat) && !isNaN(prev.lon)) {
        const dist = haversineDistMi(prev.lat, prev.lon, pt.lat, pt.lon);
        // ── Stabilization: Guard against unreasonably large distances (GPS glitches) ──
        const safeDist = (isFinite(dist) && dist < 500) ? dist : 0;
        cumulativeDistMi.push(cumulativeDistMi[cumulativeDistMi.length - 1] + safeDist);
      } else {
        cumulativeDistMi.push(cumulativeDistMi[cumulativeDistMi.length - 1]);
      }

      // ── Stabilization: Use effective elevation for gain/loss calculation ──
      const prevEle = (prev.ele_m != null && !isNaN(prev.ele_m)) ? prev.ele_m : null;
      const currEle = (pt.ele_m != null && !isNaN(pt.ele_m)) ? pt.ele_m : null;
      if (prevEle != null && currEle != null) {
        const diff = currEle - prevEle;
        if (diff > 0) totalGainM += diff;
        else totalLossM += Math.abs(diff);
      }
    }
  }


  const totalDistanceMi = cumulativeDistMi[cumulativeDistMi.length - 1];
  const elevationGainFt = hasElevation ? Math.round(totalGainM * METERS_TO_FEET) : 0;
  const elevationLossFt = hasElevation ? Math.round(totalLossM * METERS_TO_FEET) : 0;
  const highestElevationFt = hasElevation && maxEleM !== -Infinity
    ? Math.round(maxEleM * METERS_TO_FEET) : 0;
  const lowestElevationFt = hasElevation && minEleM !== Infinity
    ? Math.round(minEleM * METERS_TO_FEET) : 0;
  const avgElevationFt = elePointCount > 0
    ? Math.round((totalEleM / elePointCount) * METERS_TO_FEET) : 0;

  // ── Build 10-mile segments ──
  const segments: RouteAnalysisSegment[] = [];
  const numSegments = Math.max(1, Math.ceil(totalDistanceMi / SEGMENT_DISTANCE_MI));

  for (let segIdx = 0; segIdx < numSegments; segIdx++) {
    const segStartMi = segIdx * SEGMENT_DISTANCE_MI;
    const segEndMi = Math.min((segIdx + 1) * SEGMENT_DISTANCE_MI, totalDistanceMi);

    // Find point indices within this segment
    let startPtIdx = 0;
    let endPtIdx = points.length - 1;

    for (let i = 0; i < cumulativeDistMi.length; i++) {
      if (cumulativeDistMi[i] >= segStartMi) {
        startPtIdx = i;
        break;
      }
    }

    for (let i = startPtIdx; i < cumulativeDistMi.length; i++) {
      if (cumulativeDistMi[i] >= segEndMi) {
        endPtIdx = i;
        break;
      }
    }

    // Ensure we have at least 2 points
    if (endPtIdx <= startPtIdx) endPtIdx = Math.min(startPtIdx + 1, points.length - 1);

    // Compute segment stats
    let segGainM = 0;
    let segLossM = 0;
    let segMinEleM = Infinity;
    let segMaxEleM = -Infinity;
    let segTotalEleM = 0;
    let segEleCount = 0;
    let segMaxGradePercent = 0;
    let segTotalGradePercent = 0;
    let segGradeCount = 0;

    for (let i = startPtIdx; i <= endPtIdx; i++) {
      const pt = points[i];
      if (pt.ele_m != null && !isNaN(pt.ele_m)) {
        segMinEleM = Math.min(segMinEleM, pt.ele_m);
        segMaxEleM = Math.max(segMaxEleM, pt.ele_m);
        segTotalEleM += pt.ele_m;
        segEleCount++;
      }

      if (i > startPtIdx) {
        const prev = points[i - 1];
        if (prev.ele_m != null && pt.ele_m != null && !isNaN(prev.ele_m) && !isNaN(pt.ele_m)) {
          const diff = pt.ele_m - prev.ele_m;
          if (diff > 0) segGainM += diff;
          else segLossM += Math.abs(diff);

          // Grade calculation
          const hDist = haversineDistMi(prev.lat, prev.lon, pt.lat, pt.lon);
          if (hDist > 0.001) { // Avoid division by near-zero
            const eleDiffFt = Math.abs(diff) * METERS_TO_FEET;
            const grade = computeGradePercent(eleDiffFt, hDist);
            segMaxGradePercent = Math.max(segMaxGradePercent, grade);
            segTotalGradePercent += grade;
            segGradeCount++;
          }
        }
      }
    }

    // Midpoint coordinate for this segment
    const midIdx = Math.floor((startPtIdx + endPtIdx) / 2);
    const midPt = points[midIdx];

    const segDistMi = segEndMi - segStartMi;
    const segGainFt = Math.round(segGainM * METERS_TO_FEET);
    const segLossFt = Math.round(segLossM * METERS_TO_FEET);
    const segAvgEleFt = segEleCount > 0
      ? Math.round((segTotalEleM / segEleCount) * METERS_TO_FEET) : 0;
    const segMaxEleFt = segMaxEleM !== -Infinity
      ? Math.round(segMaxEleM * METERS_TO_FEET) : 0;
    const segMinEleFt = segMinEleM !== Infinity
      ? Math.round(segMinEleM * METERS_TO_FEET) : 0;
    const segAvgGrade = segGradeCount > 0
      ? Math.round((segTotalGradePercent / segGradeCount) * 10) / 10 : 0;
    const segMaxGrade = Math.round(segMaxGradePercent * 10) / 10;

    const segDifficulty = classifySegmentDifficulty(
      segGainFt, segAvgGrade, segMaxGrade, segDistMi,
    );

    const segDriveTime = estimateDriveTime(segDistMi, segGainFt, avgSpeedMph);

    segments.push({
      segmentIndex: segIdx,
      distanceStart: Math.round(segStartMi * 10) / 10,
      distanceEnd: Math.round(segEndMi * 10) / 10,
      avgElevation: segAvgEleFt,
      elevationGain: segGainFt,
      elevationLoss: segLossFt,
      maxElevation: segMaxEleFt,
      minElevation: segMinEleFt,
      coordinates: [midPt.lat, midPt.lon],
      pointCount: endPtIdx - startPtIdx + 1,
      avgGradePercent: segAvgGrade,
      maxGradePercent: segMaxGrade,
      difficulty: segDifficulty,
      estimatedDriveTimeHours: segDriveTime,
    });
  }

  // ── Build elevation profile ──
  const elevationProfile: Array<{ distanceMi: number; elevationFt: number }> = [];
  if (hasElevation && points.length > 0) {
    const step = Math.max(1, Math.floor(points.length / MAX_ELEVATION_PROFILE_POINTS));
    for (let i = 0; i < points.length; i += step) {
      const pt = points[i];
      if (pt.ele_m != null && !isNaN(pt.ele_m)) {
        elevationProfile.push({
          distanceMi: Math.round(cumulativeDistMi[i] * 100) / 100,
          elevationFt: Math.round(pt.ele_m * METERS_TO_FEET),
        });
      }
    }
    // Always include last point
    const lastPt = points[points.length - 1];
    if (lastPt.ele_m != null && !isNaN(lastPt.ele_m)) {
      const lastDist = cumulativeDistMi[cumulativeDistMi.length - 1];
      const lastEntry = elevationProfile[elevationProfile.length - 1];
      if (!lastEntry || Math.abs(lastEntry.distanceMi - lastDist) > 0.01) {
        elevationProfile.push({
          distanceMi: Math.round(lastDist * 100) / 100,
          elevationFt: Math.round(lastPt.ele_m * METERS_TO_FEET),
        });
      }
    }
  }

  // ── Overall difficulty ──
  const overallDifficulty = classifyOverallDifficulty(segments);

  // ── Estimated total drive time ──
  const totalDriveTime = estimateDriveTime(totalDistanceMi, elevationGainFt, avgSpeedMph);

  // ── Bounds ──
  const bounds = (minLat !== Infinity) ? {
    minLat: parseFloat(minLat.toFixed(6)),
    maxLat: parseFloat(maxLat.toFixed(6)),
    minLon: parseFloat(minLon.toFixed(6)),
    maxLon: parseFloat(maxLon.toFixed(6)),
  } : null;

  const result: RouteIntelligence = {
    id: uuid(),
    sourceId,
    routeName,
    totalDistanceMiles: Math.round(totalDistanceMi * 100) / 100,
    estimatedDriveTimeHours: totalDriveTime,
    elevationGainFeet: elevationGainFt,
    elevationLossFeet: elevationLossFt,
    highestElevationFeet: highestElevationFt,
    lowestElevationFeet: lowestElevationFt,
    avgElevationFeet: avgElevationFt,
    totalPoints: points.length,
    segments,
    segmentCount: segments.length,
    overallDifficulty,
    bounds,
    elevationProfile,
    analyzedAt: now,
    hasElevation,
    avgSpeedAssumption: avgSpeedMph,
  };

  console.log(TAG, `Analysis complete: ${routeName} — ${totalDistanceMi.toFixed(1)} mi, ${segments.length} segments`);

  return result;
}

// ── Empty Intelligence ───────────────────────────────────────

function createEmptyIntelligence(
  sourceId: string,
  routeName: string,
  analyzedAt: string,
  avgSpeedMph: number,
): RouteIntelligence {
  return {
    id: uuid(),
    sourceId,
    routeName,
    totalDistanceMiles: 0,
    estimatedDriveTimeHours: 0,
    elevationGainFeet: 0,
    elevationLossFeet: 0,
    highestElevationFeet: 0,
    lowestElevationFeet: 0,
    avgElevationFeet: 0,
    totalPoints: 0,
    segments: [],
    segmentCount: 0,
    overallDifficulty: 'easy',
    bounds: null,
    elevationProfile: [],
    analyzedAt,
    hasElevation: false,
    avgSpeedAssumption: avgSpeedMph,
  };
}

// ── Listeners ────────────────────────────────────────────────

type IntelligenceListener = (intel: RouteIntelligence | null) => void;
const _listeners = new Set<IntelligenceListener>();

function _notify(intel: RouteIntelligence | null) {
  _listeners.forEach(fn => {
    try { fn(intel); } catch (e) { console.error(TAG, 'Listener error:', e); }
  });
}

// ── Internal State ───────────────────────────────────────────

let _currentIntelligence: RouteIntelligence | null = null;

// ── Persistence ──────────────────────────────────────────────

function loadStoredIntelligence(): RouteIntelligence | null {
  try {
    const raw = sGet(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveIntelligence(intel: RouteIntelligence): void {
  try {
    sSet(STORAGE_KEY, JSON.stringify(intel));
  } catch (e) {
    console.warn(TAG, 'Failed to save intelligence:', e);
  }
}

function clearStoredIntelligence(): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    delete mem[STORAGE_KEY];
  } catch {}
}

// ── Difficulty Metadata ──────────────────────────────────────

export const DIFFICULTY_META: Record<string, {
  label: string;
  color: string;
  icon: string;
}> = {
  easy:        { label: 'EASY',        color: '#66BB6A', icon: 'checkmark-circle-outline' },
  moderate:    { label: 'MODERATE',    color: '#FFB74D', icon: 'alert-circle-outline' },
  challenging: { label: 'CHALLENGING', color: '#FF9800', icon: 'warning-outline' },
  difficult:   { label: 'DIFFICULT',   color: '#EF5350', icon: 'flame-outline' },
};

// ============================================================
// PUBLIC API — routeAnalysisEngine
// ============================================================

export const routeAnalysisEngine = {
  /**
   * Subscribe to route intelligence changes.
   * Returns unsubscribe function.
   */
  subscribe(listener: IntelligenceListener): () => void {
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  },

  /**
   * Analyze a route from RunPoint[] (from runStore).
   * Stores result and notifies listeners.
   */
  analyzeFromRunPoints(
    runPoints: Array<{ lat: number; lng: number; ele_m: number | null }>,
    sourceId: string,
    routeName: string,
    avgSpeedMph?: number,
  ): RouteIntelligence {
    // ── Stabilization: Guard against null/empty input ──
    if (!runPoints || runPoints.length === 0) {
      console.warn(TAG, 'analyzeFromRunPoints called with empty points — returning empty intelligence');
      const empty = createEmptyIntelligence(sourceId || 'unknown', routeName || 'Unknown Route', new Date().toISOString(), avgSpeedMph ?? DEFAULT_AVG_SPEED_MPH);
      _currentIntelligence = empty;
      _notify(empty);
      return empty;
    }

    const analysisPoints: AnalysisPoint[] = runPoints.map(p => ({
      lat: p.lat,
      lon: p.lng,
      ele_m: p.ele_m,
    }));

    const intel = analyzeRoute(analysisPoints, sourceId, routeName, avgSpeedMph);
    _currentIntelligence = intel;
    saveIntelligence(intel);
    _notify(intel);
    return intel;
  },

  /**
   * Analyze a route from RouteSegment[] (from routeStore).
   * Flattens segments into points, then analyzes.
   */
  analyzeFromRouteSegments(
    segments: Array<{ points: Array<{ lat: number; lon: number; ele: number | null }> }>,
    sourceId: string,
    routeName: string,
    avgSpeedMph?: number,
  ): RouteIntelligence {
    // ── Stabilization: Guard against null/empty segments ──
    if (!segments || segments.length === 0) {
      console.warn(TAG, 'analyzeFromRouteSegments called with empty segments — returning empty intelligence');
      const empty = createEmptyIntelligence(sourceId || 'unknown', routeName || 'Unknown Route', new Date().toISOString(), avgSpeedMph ?? DEFAULT_AVG_SPEED_MPH);
      _currentIntelligence = empty;
      _notify(empty);
      return empty;
    }

    const analysisPoints: AnalysisPoint[] = [];
    for (const seg of segments) {
      // ── Stabilization: Skip segments with no points ──
      if (!seg.points || seg.points.length === 0) continue;
      for (const pt of seg.points) {
        analysisPoints.push({
          lat: pt.lat,
          lon: pt.lon,
          ele_m: pt.ele,
        });
      }
    }

    // ── Stabilization: Guard against all segments being empty ──
    if (analysisPoints.length === 0) {
      console.warn(TAG, 'analyzeFromRouteSegments: all segments empty — returning empty intelligence');
      const empty = createEmptyIntelligence(sourceId || 'unknown', routeName || 'Unknown Route', new Date().toISOString(), avgSpeedMph ?? DEFAULT_AVG_SPEED_MPH);
      _currentIntelligence = empty;
      _notify(empty);
      return empty;
    }

    const intel = analyzeRoute(analysisPoints, sourceId, routeName, avgSpeedMph);
    _currentIntelligence = intel;
    saveIntelligence(intel);
    _notify(intel);
    return intel;
  },


  /**
   * Get the current route intelligence (in-memory or from storage).
   */
  getCurrent(): RouteIntelligence | null {
    if (_currentIntelligence) return _currentIntelligence;
    _currentIntelligence = loadStoredIntelligence();
    return _currentIntelligence;
  },

  /**
   * Clear current route intelligence.
   */
  clear(): void {
    _currentIntelligence = null;
    clearStoredIntelligence();
    _notify(null);
    console.log(TAG, 'Intelligence cleared');
  },

  /**
   * Check if intelligence exists for a given source ID.
   */
  hasIntelligenceFor(sourceId: string): boolean {
    const current = this.getCurrent();
    return current != null && current.sourceId === sourceId;
  },

  /**
   * Format drive time as human-readable string.
   */
  formatDriveTime(hours: number): string {
    if (hours <= 0) return '0m';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  },

  /**
   * Format elevation as human-readable string with commas.
   */
  formatElevation(feet: number): string {
    return feet.toLocaleString('en-US');
  },

  /**
   * Get segment difficulty distribution.
   */
  getDifficultyDistribution(intel: RouteIntelligence): Record<string, number> {
    const dist: Record<string, number> = {
      easy: 0,
      moderate: 0,
      challenging: 0,
      difficult: 0,
    };
    for (const seg of intel.segments) {
      dist[seg.difficulty]++;
    }
    return dist;
  },
};


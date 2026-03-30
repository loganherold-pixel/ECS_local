/**
 * ECS Elevation Complexity Analyzer v1.1
 *
 * Analyzes route segment elevation data within a local window
 * (~2–5 miles ahead of current position) and produces a terrain
 * complexity tier used by the Remoteness engine.
 *
 * INPUTS:
 *   - Route segments with points containing lat/lon/ele (meters)
 *   - Current GPS position (lat/lon) or null
 *
 * OUTPUTS:
 *   - terrainComplexity: 'low' | 'medium' | 'high'
 *   - elevRangeFt: max–min elevation in the analysis window (feet)
 *   - elevChurnFtPerMi: cumulative abs(delta ele) per mile (feet/mi)
 *   - windowMiles: length of the analysis window (miles)
 *   - windowPoints: number of track points in the window
 *
 * TIER MAPPING (v1.1 — Phase 1 thresholds):
 *   Low:    elevChurnFtPerMi < 250 AND elevRangeFt < 400
 *   Medium: elevChurnFtPerMi 250–600 OR elevRangeFt 400–900
 *   High:   elevChurnFtPerMi > 600 OR elevRangeFt > 900
 *
 * SCORING CONTRIBUTION (used by remotenessStore):
 *   Low:    +0 pts
 *   Medium: +12 pts
 *   High:   +24 pts
 */

export type TerrainComplexityTier = 'low' | 'medium' | 'high';

export interface ElevationComplexityResult {
  /** Terrain complexity tier */
  tier: TerrainComplexityTier;
  /** Max–min elevation in analysis window (feet) */
  elevRangeFt: number;
  /** Cumulative abs(delta ele) per mile (feet/mile) */
  elevChurnFtPerMi: number;
  /** Length of the analysis window (miles) */
  windowMiles: number;
  /** Number of track points in the analysis window */
  windowPoints: number;
  /** Whether the analysis had usable elevation data */
  hasElevation: boolean;
}

/** A single track point with optional elevation (meters) */
interface TrackPoint {
  lat: number;
  lon: number;
  ele: number | null;
}

/** A route segment containing track points */
interface Segment {
  points: TrackPoint[];
}

// ── Constants ──────────────────────────────────────────
const METERS_TO_FEET = 3.28084;
const WINDOW_MIN_MILES = 2;
const WINDOW_MAX_MILES = 5;

// ── Tier thresholds (v1.1) ─────────────────────────────
const LOW_CHURN_CEIL = 250;      // ft/mi — below this AND range below LOW_RANGE_CEIL → low
const LOW_RANGE_CEIL = 400;      // ft — below this AND churn below LOW_CHURN_CEIL → low
const HIGH_CHURN_FLOOR = 600;    // ft/mi — above this → high
const HIGH_RANGE_FLOOR = 900;    // ft — above this → high

// ── Scoring contribution (v1.1) ────────────────────────
export const TERRAIN_COMPLEXITY_SCORES: Record<TerrainComplexityTier, number> = {
  low: 0,
  medium: 12,
  high: 24,
};

// ── Haversine distance (miles) ─────────────────────────
function haversineDistMi(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Flatten all segments into a single ordered array of track points.
 */
function flattenSegments(segments: Segment[]): TrackPoint[] {
  const result: TrackPoint[] = [];
  for (const seg of segments) {
    for (const pt of seg.points) {
      result.push(pt);
    }
  }
  return result;
}

/**
 * Find the index of the nearest track point to a given GPS position.
 * Uses simple squared-distance comparison (no haversine needed for nearest).
 */
function findNearestPointIndex(
  points: TrackPoint[],
  gpsLat: number,
  gpsLon: number,
): number {
  if (points.length === 0) return 0;

  let bestIdx = 0;
  let bestDist = Infinity;

  for (let i = 0; i < points.length; i++) {
    const dLat = points[i].lat - gpsLat;
    const dLon = points[i].lon - gpsLon;
    const dist = dLat * dLat + dLon * dLon;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  return bestIdx;
}

/**
 * Classify terrain complexity from elevation range and churn.
 *
 * v1.1 thresholds:
 *   LOW:    churn < 250 AND range < 400
 *   HIGH:   churn > 600 OR range > 900
 *   MEDIUM: everything else (churn 250–600 OR range 400–900)
 */
function classifyTerrain(
  elevRangeFt: number,
  elevChurnFtPerMi: number,
): TerrainComplexityTier {
  // HIGH: either metric exceeds the high threshold
  if (elevChurnFtPerMi > HIGH_CHURN_FLOOR || elevRangeFt > HIGH_RANGE_FLOOR) {
    return 'high';
  }
  // LOW: both metrics below the low ceiling
  if (elevChurnFtPerMi < LOW_CHURN_CEIL && elevRangeFt < LOW_RANGE_CEIL) {
    return 'low';
  }
  // MEDIUM: everything in between
  return 'medium';
}

/**
 * Analyze elevation complexity for a local window of route track points.
 *
 * @param segments  Route segments containing track points with lat/lon/ele (meters)
 * @param gpsLat   Current GPS latitude (null to use route start)
 * @param gpsLon   Current GPS longitude (null to use route start)
 * @returns        ElevationComplexityResult
 */
export function analyzeElevationComplexity(
  segments: Segment[],
  gpsLat: number | null,
  gpsLon: number | null,
): ElevationComplexityResult {
  // ── Fallback: no segments or empty ──
  if (!segments || segments.length === 0) {
    return {
      tier: 'low',
      elevRangeFt: 0,
      elevChurnFtPerMi: 0,
      windowMiles: 0,
      windowPoints: 0,
      hasElevation: false,
    };
  }

  // ── Flatten all segments into a single point array ──
  const allPoints = flattenSegments(segments);
  if (allPoints.length < 2) {
    return {
      tier: 'low',
      elevRangeFt: 0,
      elevChurnFtPerMi: 0,
      windowMiles: 0,
      windowPoints: allPoints.length,
      hasElevation: false,
    };
  }

  // ── Find starting index ──
  // If GPS is available, find nearest point; otherwise start at index 0
  let startIdx = 0;
  if (gpsLat != null && gpsLon != null) {
    startIdx = findNearestPointIndex(allPoints, gpsLat, gpsLon);
  }

  // ── Build analysis window: collect points for ~2–5 miles ahead ──
  const windowPoints: TrackPoint[] = [allPoints[startIdx]];
  let windowMiles = 0;

  for (let i = startIdx + 1; i < allPoints.length; i++) {
    const prev = allPoints[i - 1];
    const curr = allPoints[i];
    const segDist = haversineDistMi(prev.lat, prev.lon, curr.lat, curr.lon);
    windowMiles += segDist;
    windowPoints.push(curr);

    // Stop once we've collected enough distance
    if (windowMiles >= WINDOW_MAX_MILES) break;
  }

  // If we didn't get enough forward distance, also look behind
  if (windowMiles < WINDOW_MIN_MILES && startIdx > 0) {
    for (let i = startIdx - 1; i >= 0; i--) {
      const next = allPoints[i + 1];
      const curr = allPoints[i];
      const segDist = haversineDistMi(curr.lat, curr.lon, next.lat, next.lon);
      windowMiles += segDist;
      windowPoints.unshift(curr);

      if (windowMiles >= WINDOW_MIN_MILES) break;
    }
  }

  // ── Check if we have usable elevation data ──
  const pointsWithEle = windowPoints.filter(p => p.ele != null);
  if (pointsWithEle.length < 2 || windowMiles < 0.01) {
    return {
      tier: 'low',
      elevRangeFt: 0,
      elevChurnFtPerMi: 0,
      windowMiles,
      windowPoints: windowPoints.length,
      hasElevation: false,
    };
  }

  // ── Compute elevation range (feet) ──
  let minEle = Infinity;
  let maxEle = -Infinity;
  for (const pt of pointsWithEle) {
    const eleFt = pt.ele! * METERS_TO_FEET;
    if (eleFt < minEle) minEle = eleFt;
    if (eleFt > maxEle) maxEle = eleFt;
  }
  const elevRangeFt = maxEle - minEle;

  // ── Compute elevation churn (sum of abs delta, feet/mile) ──
  let totalChurnFt = 0;
  let prevEleFt: number | null = null;

  for (const pt of windowPoints) {
    if (pt.ele == null) continue;
    const eleFt = pt.ele * METERS_TO_FEET;
    if (prevEleFt != null) {
      totalChurnFt += Math.abs(eleFt - prevEleFt);
    }
    prevEleFt = eleFt;
  }

  const elevChurnFtPerMi = windowMiles > 0 ? totalChurnFt / windowMiles : 0;

  // ── Classify tier ──
  const tier = classifyTerrain(elevRangeFt, elevChurnFtPerMi);

  return {
    tier,
    elevRangeFt: Math.round(elevRangeFt),
    elevChurnFtPerMi: Math.round(elevChurnFtPerMi),
    windowMiles: Math.round(windowMiles * 100) / 100,
    windowPoints: windowPoints.length,
    hasElevation: true,
  };
}


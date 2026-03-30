/**
 * ECS Terrain Prediction Engine
 *
 * Estimates upcoming terrain risk from the active route polyline.
 *
 * Algorithm:
 *   1. Find the nearest point on the route to the current GPS position.
 *   2. Walk forward along the polyline for LOOKAHEAD_M meters.
 *   3. Compute predicted grade from elevation deltas (if available).
 *   4. Estimate side-slope from heading change rate (heuristic).
 *   5. Compute predicted stability margin using the existing
 *      effectiveLimit logic from StabilityStrip.
 *
 * RULES:
 *   - No hooks — pure functions only
 *   - No side effects, no storage access
 *   - Deterministic: identical inputs → identical outputs
 *   - No database tables created
 *   - Uses existing routeStore data shapes
 */

import type { RouteSegment } from './routeStore';

// ── Configuration ───────────────────────────────────────────

/** How far ahead to look on the route (meters) */
const LOOKAHEAD_M = 120;

/** Minimum segment distance to compute grade (avoid div-by-zero) */
const MIN_DIST_M = 5;

/** Earth radius in meters */
const EARTH_R_M = 6_371_000;

// ── Types ───────────────────────────────────────────────────

export interface RoutePoint {
  lat: number;
  lon: number;
  ele: number | null;
}

export interface TerrainPrediction {
  /** Whether we have a valid prediction */
  available: boolean;

  /** Predicted grade in degrees (positive = uphill). null if no elevation data. */
  gradeDeg: number | null;

  /** Predicted side-slope in degrees (from heading change heuristic). null if insufficient data. */
  sideSlopeDeg: number | null;

  /** Predicted tilt angle = max(grade, sideSlope, currentTilt) */
  predictedTiltDeg: number;

  /** Predicted stability margin = effectiveLimit - predictedTiltDeg */
  predictedMarginDeg: number;

  /** Status classification */
  status: 'SAFE' | 'CAUTION' | 'HIGH RISK';

  /** Status color for UI */
  statusColor: string;

  /** 1-2 recommended actions */
  actions: string[];

  /** Lookahead distance used (meters) */
  lookaheadM: number;

  /** Whether elevation data was available for grade computation */
  hasElevation: boolean;
}

// ── Haversine distance (meters) ─────────────────────────────

function haversineM(
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
  return EARTH_R_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Bearing between two points (degrees) ────────────────────

function bearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const r1 = lat1 * Math.PI / 180;
  const r2 = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(r2);
  const x =
    Math.cos(r1) * Math.sin(r2) -
    Math.sin(r1) * Math.cos(r2) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

// ── Angular difference (signed, -180 to 180) ───────────────

function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

// ── Flatten route segments into a single point array ────────

export function flattenSegments(segments: RouteSegment[]): RoutePoint[] {
  const pts: RoutePoint[] = [];
  for (const seg of segments) {
    for (const p of seg.points) {
      pts.push({ lat: p.lat, lon: p.lon, ele: p.ele });
    }
  }
  return pts;
}

// ── Find nearest point index on polyline ────────────────────

function findNearestIndex(
  pts: RoutePoint[],
  lat: number,
  lon: number,
): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = haversineM(lat, lon, pts[i].lat, pts[i].lon);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ── Core Prediction Function ────────────────────────────────

/**
 * Compute terrain prediction for the next segment ahead.
 *
 * @param segments      - Route segments from the active route
 * @param currentLat    - Current GPS latitude (null if no fix)
 * @param currentLon    - Current GPS longitude (null if no fix)
 * @param currentTiltDeg - Current tilt angle from accelerometer (abs value)
 * @param effectiveLimit - Effective stability limit from StabilityStrip logic
 * @param lookaheadM    - How far ahead to look (default 120m)
 */
export function predictNextSegment(
  segments: RouteSegment[],
  currentLat: number | null,
  currentLon: number | null,
  currentTiltDeg: number,
  effectiveLimit: number,
  lookaheadM: number = LOOKAHEAD_M,
): TerrainPrediction {
  // ── No route data ─────────────────────────────────────
  const pts = flattenSegments(segments);
  if (pts.length < 2) {
    return noData(effectiveLimit, currentTiltDeg);
  }

  // ── No GPS fix: use first segment as fallback ─────────
  let startIdx: number;
  if (currentLat != null && currentLon != null) {
    startIdx = findNearestIndex(pts, currentLat, currentLon);
  } else {
    startIdx = 0;
  }

  // ── Walk forward along polyline for lookaheadM ────────
  let distAccum = 0;
  let endIdx = startIdx;

  for (let i = startIdx; i < pts.length - 1; i++) {
    const d = haversineM(pts[i].lat, pts[i].lon, pts[i + 1].lat, pts[i + 1].lon);
    distAccum += d;
    endIdx = i + 1;
    if (distAccum >= lookaheadM) break;
  }

  // Need at least 2 points ahead
  if (endIdx <= startIdx) {
    return noData(effectiveLimit, currentTiltDeg);
  }

  const actualLookahead = distAccum;

  // ── Compute grade from elevation ──────────────────────
  let gradeDeg: number | null = null;
  let hasElevation = false;

  const startPt = pts[startIdx];
  const endPt = pts[endIdx];

  if (startPt.ele != null && endPt.ele != null && actualLookahead > MIN_DIST_M) {
    hasElevation = true;
    const eleChange = endPt.ele - startPt.ele; // meters
    const gradeRad = Math.atan2(eleChange, actualLookahead);
    gradeDeg = Math.abs(gradeRad * 180 / Math.PI);
    gradeDeg = Math.round(gradeDeg * 10) / 10;
  }

  // ── Estimate side-slope from heading changes ──────────
  // Heuristic: rapid heading changes on a trail correlate with
  // off-camber / switchback terrain. We compute the cumulative
  // absolute heading change per meter and map it to a side-slope
  // estimate. This is a rough proxy, not a physics model.
  let sideSlopeDeg: number | null = null;

  if (endIdx - startIdx >= 2) {
    let totalHeadingChange = 0;
    let segDist = 0;
    let validSegments = 0;

    for (let i = startIdx; i < endIdx - 1; i++) {
      const b1 = bearing(pts[i].lat, pts[i].lon, pts[i + 1].lat, pts[i + 1].lon);
      const b2 = bearing(pts[i + 1].lat, pts[i + 1].lon, pts[i + 2].lat, pts[i + 2].lon);
      const hChange = Math.abs(angleDiff(b1, b2));
      const d = haversineM(pts[i].lat, pts[i].lon, pts[i + 1].lat, pts[i + 1].lon);

      if (d > 1) { // skip zero-length segments
        totalHeadingChange += hChange;
        segDist += d;
        validSegments++;
      }
    }

    if (validSegments > 0 && segDist > MIN_DIST_M) {
      // Heading change rate: degrees per meter
      const changeRate = totalHeadingChange / segDist;

      // Map heading change rate to estimated side-slope:
      //   0 deg/m → 0° side slope (straight road)
      //   0.5 deg/m → ~3° (gentle curves)
      //   1.0 deg/m → ~6° (moderate switchbacks)
      //   2.0 deg/m → ~12° (tight switchbacks)
      //   3.0+ deg/m → ~15°+ (extreme terrain)
      // Using a simple mapping: sideSlope ≈ changeRate × 5, capped at 20°
      const rawSlope = changeRate * 5;
      sideSlopeDeg = Math.round(Math.min(20, rawSlope) * 10) / 10;
    }
  }

  // ── Compute predicted tilt and margin ─────────────────
  const candidates: number[] = [currentTiltDeg];
  if (gradeDeg != null) candidates.push(gradeDeg);
  if (sideSlopeDeg != null) candidates.push(sideSlopeDeg);

  const predictedTiltDeg = Math.max(...candidates);
  const predictedMarginDeg = Math.round((effectiveLimit - predictedTiltDeg) * 10) / 10;

  // ── Status classification ─────────────────────────────
  let status: TerrainPrediction['status'];
  let statusColor: string;

  if (predictedMarginDeg > 15) {
    status = 'SAFE';
    statusColor = '#66BB6A';
  } else if (predictedMarginDeg >= 8) {
    status = 'CAUTION';
    statusColor = '#FFB74D';
  } else {
    status = 'HIGH RISK';
    statusColor = '#EF5350';
  }

  // ── Recommended actions ───────────────────────────────
  const actions: string[] = [];
  switch (status) {
    case 'SAFE':
      actions.push('Maintain pace.');
      break;
    case 'CAUTION':
      actions.push('Reduce speed; avoid off-camber line.');
      if (sideSlopeDeg != null && sideSlopeDeg > 5) {
        actions.push('Keep wheels perpendicular to slope.');
      }
      break;
    case 'HIGH RISK':
      actions.push('Consider reroute or stop & rebalance load.');
      if (gradeDeg != null && gradeDeg > 10) {
        actions.push('Steep grade ahead — engage low range.');
      } else if (sideSlopeDeg != null && sideSlopeDeg > 10) {
        actions.push('Severe off-camber — avoid traversing.');
      }
      break;
  }

  return {
    available: true,
    gradeDeg,
    sideSlopeDeg,
    predictedTiltDeg: Math.round(predictedTiltDeg * 10) / 10,
    predictedMarginDeg,
    status,
    statusColor,
    actions,
    lookaheadM: Math.round(actualLookahead),
    hasElevation,
  };
}

// ── No-data fallback ────────────────────────────────────────

function noData(effectiveLimit: number, currentTiltDeg: number): TerrainPrediction {
  const margin = Math.round((effectiveLimit - currentTiltDeg) * 10) / 10;
  return {
    available: false,
    gradeDeg: null,
    sideSlopeDeg: null,
    predictedTiltDeg: currentTiltDeg,
    predictedMarginDeg: margin,
    status: margin > 15 ? 'SAFE' : margin >= 8 ? 'CAUTION' : 'HIGH RISK',
    statusColor: margin > 15 ? '#66BB6A' : margin >= 8 ? '#FFB74D' : '#EF5350',
    actions: [],
    lookaheadM: 0,
    hasElevation: false,
  };
}


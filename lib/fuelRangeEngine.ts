/**
 * ECS Fuel Range Engine
 *
 * Calculates estimated fuel consumption for a route using:
 *   - Vehicle fuel capacity (gal) and MPG rating
 *   - Route total distance (mi) and elevation gain (ft)
 *   - Terrain adjustment factors (uphill penalty, downhill bonus)
 *   - Per-segment fuel consumption with running fuel gauge
 *   - Fuel stop planning and range warnings
 *
 * All calculations are offline-capable and deterministic.
 */

import type { ImportedRoute, RouteSegment as RouteStoreSegment } from './routeStore';

// ── Types ────────────────────────────────────────────────────

export interface FuelProfile {
  fuelCapacityGal: number;
  mpg: number;
  currentFuelGal?: number; // defaults to full tank
}

export interface TerrainAdjustment {
  label: string;
  factor: number; // multiplier on fuel consumption (>1 = more fuel, <1 = less)
  description: string;
}

export interface SegmentFuelAnalysis {
  segmentIndex: number;
  distanceMiles: number;
  elevationGainFt: number;
  elevationLossFt: number;
  terrainFactor: number;
  adjustedMpg: number;
  fuelUsedGal: number;
  fuelRemainingGal: number;
  fuelPercent: number;
  cumulativeDistanceMiles: number;
  isLowFuel: boolean;     // < 25%
  isCriticalFuel: boolean; // < 10%
  isEmpty: boolean;        // 0%
}

export interface FuelStopRecommendation {
  afterSegmentIndex: number;
  atDistanceMiles: number;
  fuelRemainingGal: number;
  fuelPercent: number;
  urgency: 'suggested' | 'recommended' | 'critical';
}

export interface FuelRangeResult {
  // Overview
  totalDistanceMiles: number;
  totalElevationGainFt: number;
  totalElevationLossFt: number;
  baseMpg: number;
  effectiveMpg: number; // terrain-adjusted average
  totalFuelNeededGal: number;
  fuelCapacityGal: number;
  startingFuelGal: number;

  // Range analysis
  maxRangeMiles: number;         // how far you can go on current fuel
  rangeDeficitMiles: number;     // negative = sufficient, positive = shortfall
  isRouteSufficient: boolean;    // can complete route without refueling
  fuelReserveGal: number;        // fuel remaining at end (if sufficient)
  fuelReservePercent: number;

  // Per-segment breakdown
  segments: SegmentFuelAnalysis[];

  // Fuel stops
  fuelStopsNeeded: number;
  fuelStops: FuelStopRecommendation[];

  // Terrain impact
  terrainPenaltyPercent: number; // how much terrain increases consumption
  overallTerrainFactor: number;

  // Warnings
  warnings: FuelWarning[];
}

export interface FuelWarning {
  type: 'insufficient_range' | 'low_fuel_segment' | 'no_elevation_data' | 'steep_terrain' | 'reserve_low';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  segmentIndex?: number;
}

// ── Terrain Adjustment Factors ──────────────────────────────

/**
 * Compute terrain adjustment factor based on elevation change per mile.
 *
 * Uphill: MPG decreases (factor > 1 means more fuel used)
 * Downhill: MPG increases slightly (factor < 1)
 * Flat: factor = 1.0
 *
 * Based on real-world data:
 *   - 5% grade uphill ≈ 20-30% more fuel
 *   - 10% grade uphill ≈ 50-70% more fuel
 *   - Downhill bonus is capped (engine braking, not coasting)
 */
export function computeTerrainFactor(
  elevationGainFt: number,
  elevationLossFt: number,
  distanceMiles: number,
): number {
  if (distanceMiles <= 0) return 1.0;

  const distanceFeet = distanceMiles * 5280;

  // Average grade percentages
  const uphillGradePct = distanceFeet > 0 ? (elevationGainFt / distanceFeet) * 100 : 0;
  const downhillGradePct = distanceFeet > 0 ? (elevationLossFt / distanceFeet) * 100 : 0;

  // Uphill penalty: exponential increase with grade
  // 0% grade = 1.0x, 3% = 1.15x, 5% = 1.25x, 8% = 1.45x, 10% = 1.60x
  let uphillFactor = 1.0;
  if (uphillGradePct > 0) {
    uphillFactor = 1.0 + (uphillGradePct * 0.05) + (Math.pow(uphillGradePct, 1.5) * 0.003);
    uphillFactor = Math.min(uphillFactor, 2.5); // cap at 2.5x
  }

  // Downhill bonus: mild improvement (engine braking limits savings)
  // 0% = 1.0x, 3% = 0.95x, 5% = 0.90x, 8% = 0.88x
  let downhillFactor = 1.0;
  if (downhillGradePct > 0) {
    downhillFactor = 1.0 - (downhillGradePct * 0.02);
    downhillFactor = Math.max(downhillFactor, 0.80); // cap bonus at 20%
  }

  // Weight the factors by proportion of uphill vs downhill
  const totalElevChange = elevationGainFt + elevationLossFt;
  if (totalElevChange === 0) return 1.0;

  const uphillWeight = elevationGainFt / totalElevChange;
  const downhillWeight = elevationLossFt / totalElevChange;

  const combinedFactor = (uphillFactor * uphillWeight) + (downhillFactor * downhillWeight);

  // Round to 2 decimal places
  return Math.round(combinedFactor * 100) / 100;
}

/**
 * Get human-readable terrain adjustment presets.
 */
export const TERRAIN_PRESETS: TerrainAdjustment[] = [
  { label: 'FLAT / HIGHWAY', factor: 1.0, description: 'Paved roads, minimal elevation change' },
  { label: 'ROLLING HILLS', factor: 1.12, description: 'Moderate elevation changes, mixed terrain' },
  { label: 'MOUNTAIN PASS', factor: 1.35, description: 'Significant climbs and descents' },
  { label: 'STEEP OFF-ROAD', factor: 1.55, description: 'Technical terrain with steep grades' },
  { label: 'EXTREME ALPINE', factor: 1.80, description: 'High altitude, extreme grades, loose surface' },
];

// ── Haversine Distance ──────────────────────────────────────

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Segment Analysis ────────────────────────────────────────

interface AnalyzedSegment {
  distanceMiles: number;
  elevationGainFt: number;
  elevationLossFt: number;
  hasElevation: boolean;
  pointCount: number;
}

function analyzeSegments(route: ImportedRoute): AnalyzedSegment[] {
  return route.segments.map(seg => {
    let distance = 0;
    let elevGain = 0;
    let elevLoss = 0;
    let hasElev = false;

    for (let i = 1; i < seg.points.length; i++) {
      const p1 = seg.points[i - 1];
      const p2 = seg.points[i];
      distance += haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);

      if (p1.ele != null && p2.ele != null) {
        hasElev = true;
        const diff = p2.ele - p1.ele;
        if (diff > 0) elevGain += diff;
        else elevLoss += Math.abs(diff);
      }
    }

    return {
      distanceMiles: Math.round(distance * 100) / 100,
      elevationGainFt: Math.round(elevGain * 3.281), // meters to feet
      elevationLossFt: Math.round(elevLoss * 3.281),
      hasElevation: hasElev,
      pointCount: seg.points.length,
    };
  });
}

// ── Main Calculator ─────────────────────────────────────────

/**
 * Calculate comprehensive fuel range analysis for a route.
 */
export function calculateFuelRange(
  route: ImportedRoute,
  profile: FuelProfile,
  manualTerrainFactor?: number, // override computed terrain factor
): FuelRangeResult {
  const segments = analyzeSegments(route);
  const startingFuel = profile.currentFuelGal ?? profile.fuelCapacityGal;

  // Totals
  let totalDistance = 0;
  let totalElevGain = 0;
  let totalElevLoss = 0;
  let hasAnyElevation = false;

  for (const seg of segments) {
    totalDistance += seg.distanceMiles;
    totalElevGain += seg.elevationGainFt;
    totalElevLoss += seg.elevationLossFt;
    if (seg.hasElevation) hasAnyElevation = true;
  }

  // If no segment data, use route-level stats
  if (segments.length === 0) {
    totalDistance = route.total_distance_miles;
    totalElevGain = route.elevation_gain_ft || 0;
    // Estimate loss as ~80% of gain for typical routes
    totalElevLoss = Math.round(totalElevGain * 0.8);
  }

  // Compute overall terrain factor
  const computedTerrainFactor = hasAnyElevation
    ? computeTerrainFactor(totalElevGain, totalElevLoss, totalDistance)
    : 1.0;

  const overallTerrainFactor = manualTerrainFactor ?? computedTerrainFactor;
  const effectiveMpg = Math.round((profile.mpg / overallTerrainFactor) * 10) / 10;
  const terrainPenaltyPercent = Math.round((overallTerrainFactor - 1) * 100);

  // Total fuel needed
  const totalFuelNeeded = totalDistance > 0 && effectiveMpg > 0
    ? Math.round((totalDistance / effectiveMpg) * 100) / 100
    : 0;

  // Max range on current fuel
  const maxRange = Math.round(startingFuel * effectiveMpg);

  // Per-segment fuel analysis
  let runningFuel = startingFuel;
  let cumulativeDistance = 0;
  const segmentAnalyses: SegmentFuelAnalysis[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segTerrainFactor = seg.hasElevation
      ? computeTerrainFactor(seg.elevationGainFt, seg.elevationLossFt, seg.distanceMiles)
      : overallTerrainFactor;

    const segAdjustedMpg = Math.round((profile.mpg / segTerrainFactor) * 10) / 10;
    const segFuelUsed = seg.distanceMiles > 0 && segAdjustedMpg > 0
      ? Math.round((seg.distanceMiles / segAdjustedMpg) * 1000) / 1000
      : 0;

    runningFuel = Math.max(0, runningFuel - segFuelUsed);
    cumulativeDistance += seg.distanceMiles;

    const fuelPercent = profile.fuelCapacityGal > 0
      ? Math.round((runningFuel / profile.fuelCapacityGal) * 100)
      : 0;

    segmentAnalyses.push({
      segmentIndex: i,
      distanceMiles: seg.distanceMiles,
      elevationGainFt: seg.elevationGainFt,
      elevationLossFt: seg.elevationLossFt,
      terrainFactor: segTerrainFactor,
      adjustedMpg: segAdjustedMpg,
      fuelUsedGal: segFuelUsed,
      fuelRemainingGal: Math.round(runningFuel * 100) / 100,
      fuelPercent,
      cumulativeDistanceMiles: Math.round(cumulativeDistance * 100) / 100,
      isLowFuel: fuelPercent < 25 && fuelPercent > 10,
      isCriticalFuel: fuelPercent <= 10 && fuelPercent > 0,
      isEmpty: fuelPercent <= 0,
    });
  }

  // If no segments, create a single synthetic segment
  if (segmentAnalyses.length === 0 && totalDistance > 0) {
    const fuelUsed = totalFuelNeeded;
    runningFuel = Math.max(0, startingFuel - fuelUsed);
    const fuelPercent = profile.fuelCapacityGal > 0
      ? Math.round((runningFuel / profile.fuelCapacityGal) * 100)
      : 0;

    segmentAnalyses.push({
      segmentIndex: 0,
      distanceMiles: totalDistance,
      elevationGainFt: totalElevGain,
      elevationLossFt: totalElevLoss,
      terrainFactor: overallTerrainFactor,
      adjustedMpg: effectiveMpg,
      fuelUsedGal: Math.round(fuelUsed * 100) / 100,
      fuelRemainingGal: Math.round(runningFuel * 100) / 100,
      fuelPercent,
      cumulativeDistanceMiles: totalDistance,
      isLowFuel: fuelPercent < 25 && fuelPercent > 10,
      isCriticalFuel: fuelPercent <= 10 && fuelPercent > 0,
      isEmpty: fuelPercent <= 0,
    });
  }

  // Route sufficiency
  const isRouteSufficient = startingFuel >= totalFuelNeeded;
  const fuelReserve = Math.max(0, startingFuel - totalFuelNeeded);
  const fuelReservePercent = profile.fuelCapacityGal > 0
    ? Math.round((fuelReserve / profile.fuelCapacityGal) * 100)
    : 0;
  const rangeDeficit = totalDistance - maxRange;

  // Fuel stop recommendations
  const fuelStops: FuelStopRecommendation[] = [];
  let stopsNeeded = 0;

  if (!isRouteSufficient) {
    stopsNeeded = Math.ceil(totalFuelNeeded / profile.fuelCapacityGal) - 1;
    // Find segments where fuel drops below 20%
    for (const seg of segmentAnalyses) {
      if (seg.fuelPercent < 20 && seg.fuelPercent > 0) {
        const urgency: FuelStopRecommendation['urgency'] =
          seg.fuelPercent < 10 ? 'critical' : seg.fuelPercent < 15 ? 'recommended' : 'suggested';

        // Only add if not too close to a previous stop
        const lastStop = fuelStops[fuelStops.length - 1];
        if (!lastStop || seg.cumulativeDistanceMiles - lastStop.atDistanceMiles > 20) {
          fuelStops.push({
            afterSegmentIndex: seg.segmentIndex,
            atDistanceMiles: seg.cumulativeDistanceMiles,
            fuelRemainingGal: seg.fuelRemainingGal,
            fuelPercent: seg.fuelPercent,
            urgency,
          });
        }
      }
    }
  }

  // Also check for low-fuel segments even on sufficient routes
  for (const seg of segmentAnalyses) {
    if (seg.fuelPercent < 15 && seg.fuelPercent > 0) {
      const existing = fuelStops.find(s => s.afterSegmentIndex === seg.segmentIndex);
      if (!existing) {
        fuelStops.push({
          afterSegmentIndex: seg.segmentIndex,
          atDistanceMiles: seg.cumulativeDistanceMiles,
          fuelRemainingGal: seg.fuelRemainingGal,
          fuelPercent: seg.fuelPercent,
          urgency: 'suggested',
        });
      }
    }
  }

  // Warnings
  const warnings: FuelWarning[] = [];

  if (!isRouteSufficient) {
    warnings.push({
      type: 'insufficient_range',
      severity: 'critical',
      message: `Route exceeds fuel range by ${Math.abs(rangeDeficit).toFixed(1)} mi. ${stopsNeeded} fuel stop${stopsNeeded > 1 ? 's' : ''} needed.`,
    });
  }

  if (!hasAnyElevation && totalDistance > 0) {
    warnings.push({
      type: 'no_elevation_data',
      severity: 'info',
      message: 'No elevation data in route. Terrain adjustments are estimated.',
    });
  }

  if (terrainPenaltyPercent > 30) {
    warnings.push({
      type: 'steep_terrain',
      severity: 'warning',
      message: `Steep terrain increases fuel consumption by ${terrainPenaltyPercent}%.`,
    });
  }

  if (isRouteSufficient && fuelReservePercent < 15) {
    warnings.push({
      type: 'reserve_low',
      severity: 'warning',
      message: `Low fuel reserve at destination (${fuelReservePercent}%). Consider planning a fuel stop.`,
    });
  }

  for (const seg of segmentAnalyses) {
    if (seg.isCriticalFuel || seg.isEmpty) {
      warnings.push({
        type: 'low_fuel_segment',
        severity: 'critical',
        message: `Fuel critically low at segment ${seg.segmentIndex + 1} (${seg.fuelPercent}% at ${seg.cumulativeDistanceMiles.toFixed(1)} mi).`,
        segmentIndex: seg.segmentIndex,
      });
    }
  }

  return {
    totalDistanceMiles: Math.round(totalDistance * 100) / 100,
    totalElevationGainFt: totalElevGain,
    totalElevationLossFt: totalElevLoss,
    baseMpg: profile.mpg,
    effectiveMpg,
    totalFuelNeededGal: totalFuelNeeded,
    fuelCapacityGal: profile.fuelCapacityGal,
    startingFuelGal: startingFuel,
    maxRangeMiles: maxRange,
    rangeDeficitMiles: Math.round(rangeDeficit * 100) / 100,
    isRouteSufficient,
    fuelReserveGal: Math.round(fuelReserve * 100) / 100,
    fuelReservePercent,
    segments: segmentAnalyses,
    fuelStopsNeeded: Math.max(stopsNeeded, fuelStops.filter(s => s.urgency === 'critical').length),
    fuelStops,
    terrainPenaltyPercent,
    overallTerrainFactor,
    warnings,
  };
}

/**
 * Generate fuel gauge data points for visualization.
 * Returns an array of { distancePct, fuelPct } for plotting.
 */
export function generateFuelGaugePoints(result: FuelRangeResult): { distancePct: number; fuelPct: number }[] {
  if (result.totalDistanceMiles <= 0) return [{ distancePct: 0, fuelPct: 100 }];

  const startPct = result.fuelCapacityGal > 0
    ? Math.round((result.startingFuelGal / result.fuelCapacityGal) * 100)
    : 100;

  const points: { distancePct: number; fuelPct: number }[] = [
    { distancePct: 0, fuelPct: startPct },
  ];

  for (const seg of result.segments) {
    const distPct = Math.round((seg.cumulativeDistanceMiles / result.totalDistanceMiles) * 100);
    points.push({ distancePct: distPct, fuelPct: Math.max(0, seg.fuelPercent) });
  }

  return points;
}

/**
 * Get color for fuel percentage level.
 */
export function getFuelColor(percent: number): string {
  if (percent <= 10) return '#EF5350';  // critical red
  if (percent <= 25) return '#FF9800';  // warning orange
  if (percent <= 50) return '#FFB74D';  // caution amber
  return '#66BB6A';                     // good green
}

/**
 * Get severity label for fuel level.
 */
export function getFuelSeverity(percent: number): string {
  if (percent <= 10) return 'CRITICAL';
  if (percent <= 25) return 'LOW';
  if (percent <= 50) return 'MODERATE';
  return 'GOOD';
}


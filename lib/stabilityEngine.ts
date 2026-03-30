/**
 * Stability Engine — Advanced Mass Model
 *
 * Computes center-of-mass (CG) from vehicle load zone data.
 * Calculates dynamic rollover and pitch thresholds.
 * Provides stability index for the Attitude Monitor widget.
 *
 * Coordinate system:
 *   X = longitudinal (positive = forward of rear axle centerline)
 *   Y = lateral (positive = right of vehicle centerline)
 *   Z = vertical (positive = up from ground)
 *
 * All distances in inches, weights in lbs.
 */

// ── Default Vehicle Parameters ─────────────────────────────
export interface VehicleBaseline {
  curbWeightLbs: number;
  trackWidthIn: number;      // tire-to-tire width
  wheelbaseIn: number;       // front-to-rear axle distance
  baseCgHeightIn: number;    // factory CG height (unloaded)
  baseCgXIn: number;         // factory CG longitudinal offset from rear axle
  baseCgYIn: number;         // factory CG lateral offset (usually 0)
}

// Reasonable defaults for a mid-size overland truck (e.g., Tacoma / 4Runner class)
export const DEFAULT_VEHICLE_BASELINE: VehicleBaseline = {
  curbWeightLbs: 4500,
  trackWidthIn: 62,
  wheelbaseIn: 110,
  baseCgHeightIn: 28,
  baseCgXIn: 50,   // slightly forward of rear axle
  baseCgYIn: 0,
};

// Maps zone name patterns to estimated Z height (inches from ground)
const ZONE_HEIGHT_MAP: { pattern: RegExp; zIn: number }[] = [
  { pattern: /roof|rack.*roof|cab.*roof|bed.*rack/i, zIn: 72 },
  { pattern: /smart.*cap|alu.*cab|shell.*roof|topper/i, zIn: 68 },
  { pattern: /hard.*top/i, zIn: 66 },
  { pattern: /bed.*cover/i, zIn: 48 },
  { pattern: /cab.*interior|cab\b/i, zIn: 36 },
  { pattern: /rear|bed|open.*bed|cargo|trunk|hatch/i, zIn: 32 },
  { pattern: /drawer/i, zIn: 24 },
  { pattern: /kitchen/i, zIn: 26 },
  { pattern: /under.*seat/i, zIn: 18 },
  { pattern: /water.*tank/i, zIn: 20 },
  { pattern: /tailgate/i, zIn: 30 },
  { pattern: /hitch|bumper|tire.*carrier|recovery.*mount|bike.*rack|hitch.*box/i, zIn: 22 },
  { pattern: /bin.*left|bin.*right/i, zIn: 28 },
];

// Maps zone name patterns to estimated X position (inches from rear axle)
const ZONE_X_MAP: { pattern: RegExp; xIn: number }[] = [
  { pattern: /cab.*roof|cab.*interior|cab\b/i, xIn: 80 },
  { pattern: /bed.*rack|rear|bed|open.*bed|tailgate/i, xIn: -10 },
  { pattern: /smart.*cap|alu.*cab|shell.*roof|topper|bed.*cover/i, xIn: -5 },
  { pattern: /roof.*rack/i, xIn: 40 },
  { pattern: /hard.*top/i, xIn: 40 },
  { pattern: /drawer/i, xIn: -5 },
  { pattern: /kitchen/i, xIn: -12 },
  { pattern: /cargo|trunk|hatch/i, xIn: -15 },
  { pattern: /hitch|bumper|tire.*carrier|recovery.*mount|bike.*rack|hitch.*box/i, xIn: -35 },
  { pattern: /water.*tank/i, xIn: -8 },
  { pattern: /bin.*left|bin.*right/i, xIn: -8 },
];


// Maps zone name patterns to estimated Y position (inches from centerline)
const ZONE_Y_MAP: { pattern: RegExp; yIn: number }[] = [
  { pattern: /left/i, yIn: -18 },
  { pattern: /right/i, yIn: 18 },
  // Most zones are centered
];

function estimateZonePosition(zoneName: string): { x: number; y: number; z: number } {
  let z = 30; // default mid-height
  let x = 0;  // default at rear axle
  let y = 0;  // default centered

  for (const entry of ZONE_HEIGHT_MAP) {
    if (entry.pattern.test(zoneName)) {
      z = entry.zIn;
      break;
    }
  }

  for (const entry of ZONE_X_MAP) {
    if (entry.pattern.test(zoneName)) {
      x = entry.xIn;
      break;
    }
  }

  for (const entry of ZONE_Y_MAP) {
    if (entry.pattern.test(zoneName)) {
      y = entry.yIn;
      break;
    }
  }

  return { x, y, z };
}

// ── Load Module ────────────────────────────────────────────
export interface LoadModule {
  zoneName: string;
  weightLbs: number;
  x?: number;  // override position
  y?: number;
  z?: number;
  waterFillPct?: number; // 0-1, for water tanks
}

// ── CG Result ──────────────────────────────────────────────
export interface CGResult {
  xCg: number;      // longitudinal CG (inches from rear axle)
  yCg: number;      // lateral CG (inches from centerline)
  zCg: number;      // vertical CG (inches from ground)
  totalMass: number; // total system mass (lbs)
  moduleCount: number;
  hasSufficientData: boolean;
}

// ── Stability Result ───────────────────────────────────────
export interface StabilityResult {
  cg: CGResult;
  criticalRollAngleDeg: number;
  rollWarningDeg: number;
  rollHighRiskDeg: number;
  criticalPitchAngleDeg: number;
  pitchWarningDeg: number;
  pitchHighRiskDeg: number;
  stabilityIndex: number;       // 0-120 (clamped)
  stabilityColor: string;       // gold / orange / red
  rollLimitExceeded: boolean;
  isAdvanced: boolean;
}

// ── Compute Center of Mass ─────────────────────────────────
export function computeCG(
  baseline: VehicleBaseline,
  modules: LoadModule[],
): CGResult {
  // Start with base vehicle
  let totalMass = baseline.curbWeightLbs;
  let sumMX = baseline.curbWeightLbs * baseline.baseCgXIn;
  let sumMY = baseline.curbWeightLbs * baseline.baseCgYIn;
  let sumMZ = baseline.curbWeightLbs * baseline.baseCgHeightIn;

  let validModules = 0;

  for (const mod of modules) {
    if (mod.weightLbs <= 0) continue;

    const pos = estimateZonePosition(mod.zoneName);
    const x = mod.x ?? pos.x;
    const y = mod.y ?? pos.y;
    const z = mod.z ?? pos.z;

    // Apply water fill percentage if applicable
    const effectiveWeight = mod.waterFillPct != null
      ? mod.weightLbs * mod.waterFillPct
      : mod.weightLbs;

    if (effectiveWeight <= 0) continue;

    totalMass += effectiveWeight;
    sumMX += effectiveWeight * x;
    sumMY += effectiveWeight * y;
    sumMZ += effectiveWeight * z;
    validModules++;
  }

  const xCg = totalMass > 0 ? sumMX / totalMass : baseline.baseCgXIn;
  const yCg = totalMass > 0 ? sumMY / totalMass : baseline.baseCgYIn;
  const zCg = totalMass > 0 ? sumMZ / totalMass : baseline.baseCgHeightIn;

  return {
    xCg,
    yCg,
    zCg,
    totalMass,
    moduleCount: validModules,
    hasSufficientData: validModules >= 2,
  };
}

// ── Compute Stability Thresholds ───────────────────────────
export function computeStability(
  baseline: VehicleBaseline,
  modules: LoadModule[],
  currentRollAngleDeg: number = 0,
): StabilityResult {
  const cg = computeCG(baseline, modules);

  // Critical Roll Angle: θ_crit = arctan(TrackWidth / (2 × z_cg))
  const halfTrack = baseline.trackWidthIn / 2;
  const criticalRollRad = Math.atan2(halfTrack, cg.zCg);
  const criticalRollAngleDeg = (criticalRollRad * 180) / Math.PI;

  // Roll thresholds
  const rollWarningDeg = criticalRollAngleDeg * 0.85;
  const rollHighRiskDeg = criticalRollAngleDeg * 0.95;

  // Pitch critical angle with fore/aft CG shift
  // If CG shifts rearward (lower xCg), reduce uphill tolerance
  const cgShiftFromCenter = cg.xCg - (baseline.wheelbaseIn / 2);
  const effectiveWheelbaseForPitch = baseline.wheelbaseIn - Math.abs(cgShiftFromCenter) * 0.5;
  const criticalPitchRad = Math.atan2(effectiveWheelbaseForPitch, 2 * cg.zCg);
  const criticalPitchAngleDeg = (criticalPitchRad * 180) / Math.PI;

  const pitchWarningDeg = criticalPitchAngleDeg * 0.85;
  const pitchHighRiskDeg = criticalPitchAngleDeg * 0.95;

  // Stability Index = (Actual Roll Angle / Critical Roll Angle) × 100
  const absRoll = Math.abs(currentRollAngleDeg);
  const rawIndex = criticalRollAngleDeg > 0
    ? (absRoll / criticalRollAngleDeg) * 100
    : 0;
  const stabilityIndex = Math.min(120, rawIndex);

  // Color coding
  let stabilityColor = '#C48A2C'; // gold (default, under 75%)
  if (stabilityIndex >= 90) {
    stabilityColor = '#C0392B'; // red
  } else if (stabilityIndex >= 75) {
    stabilityColor = '#E67E22'; // orange
  }

  const rollLimitExceeded = stabilityIndex > 100;

  return {
    cg,
    criticalRollAngleDeg,
    rollWarningDeg,
    rollHighRiskDeg,
    criticalPitchAngleDeg,
    pitchWarningDeg,
    pitchHighRiskDeg,
    stabilityIndex,
    stabilityColor,
    rollLimitExceeded,
    isAdvanced: cg.hasSufficientData,
  };
}

// ── Simplified (default) stability ─────────────────────────
export function computeSimplifiedStability(
  currentRollAngleDeg: number = 0,
): StabilityResult {
  const baseline = DEFAULT_VEHICLE_BASELINE;
  return computeStability(baseline, [], currentRollAngleDeg);
}

// ── Build load modules from zone data ──────────────────────
export interface ZoneWeightData {
  zoneName: string;
  totalWeightLbs: number;
  isWaterTank?: boolean;
  waterFillPct?: number;
}

export function buildLoadModules(zones: ZoneWeightData[]): LoadModule[] {
  return zones
    .filter(z => z.totalWeightLbs > 0)
    .map(z => ({
      zoneName: z.zoneName,
      weightLbs: z.totalWeightLbs,
      waterFillPct: z.isWaterTank ? (z.waterFillPct ?? 1) : undefined,
    }));
}


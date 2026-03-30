/**
 * vehicleTiltEngine — ECS Vehicle Weight Distribution Tilt Engine
 * ───────────────────────────────────────────────────────────────
 * Calculates roll (left/right) and pitch (front/rear) from loadout
 * container weights, producing normalized tilt values that drive
 * a subtle 3D tilt animation on the Vehicle Twin truck image.
 *
 * Data flow:
 *   Container weights → moment arms → weighted average → normalized tilt
 *   → clamped degrees (max 3° roll, 2° pitch) → CSS transform
 *
 * Roll convention:
 *   -1.0 = heavy left    →  truck tilts left
 *   +1.0 = heavy right   →  truck tilts right
 *
 * Pitch convention:
 *   -1.0 = heavy front   →  truck nose-dives
 *   +1.0 = heavy rear    →  truck tail-sags
 *
 * Stability Score:
 *   100 = perfectly balanced (no tilt)
 *    40 = maximum imbalance (worst case)
 */

/* ═══════════════════════════════════════════════════════════════
   Container Moment Arms
   ═══════════════════════════════════════════════════════════════
   Each container has a roll and pitch influence coefficient.
   Values are normalized from -1.0 to +1.0 representing the
   moment arm direction and magnitude.

   These values are tuned for a standard overlanding truck layout:
     - Front bumper is the most forward (pitch = -0.9)
     - Bed drawers are the most rearward (pitch = +0.6)
     - Left/right drawers have the strongest lateral influence
   ═══════════════════════════════════════════════════════════════ */
export const CONTAINER_MOMENTS: Record<string, { roll: number; pitch: number }> = {
  cab_storage:      { roll:  0.0,  pitch: -0.6 },
  rear_seat:        { roll:  0.0,  pitch: -0.2 },
  roof_rack:        { roll:  0.0,  pitch: -0.1 },
  bed_main:         { roll:  0.0,  pitch:  0.6 },
  bed_drawer_left:  { roll: -0.9,  pitch:  0.6 },
  bed_drawer_right: { roll:  0.9,  pitch:  0.6 },
  front_bumper:     { roll:  0.0,  pitch: -0.9 },
  rear_bumper:      { roll:  0.0,  pitch:  0.9 },
};

/* ═══════════════════════════════════════════════════════════════
   Container Weight Map Type
   ═══════════════════════════════════════════════════════════════ */
export interface ContainerWeightMap {
  [containerId: string]: number;
}

/* ═══════════════════════════════════════════════════════════════
   Tilt Result
   ═══════════════════════════════════════════════════════════════ */
export interface VehicleTilt {
  /** Normalized roll moment (-1 to +1). Negative = left heavy. */
  rollNorm: number;
  /** Normalized pitch moment (-1 to +1). Negative = front heavy. */
  pitchNorm: number;
  /** Total weight across all containers (lbs). */
  totalWeight: number;
}

/* ═══════════════════════════════════════════════════════════════
   Tilt Degrees Result
   ═══════════════════════════════════════════════════════════════ */
export interface TiltDegrees {
  /** Roll in degrees. Max ±3°. Negative = left tilt. */
  rollDeg: number;
  /** Pitch in degrees. Max ±2°. Negative = nose down. */
  pitchDeg: number;
}

/* ═══════════════════════════════════════════════════════════════
   Clamp Utility
   ═══════════════════════════════════════════════════════════════ */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/* ═══════════════════════════════════════════════════════════════
   computeVehicleTilt
   ═══════════════════════════════════════════════════════════════
   Aggregates container weights and computes weighted-average
   roll and pitch moments.

   @param containerWeights  Map of container ID → weight in lbs
   @returns VehicleTilt with normalized roll/pitch and total weight
   ═══════════════════════════════════════════════════════════════ */
export function computeVehicleTilt(containerWeights: ContainerWeightMap): VehicleTilt {
  let total = 0;
  let rollMoment = 0;
  let pitchMoment = 0;

  for (const [containerId, w] of Object.entries(containerWeights)) {
    const weight = Number(w || 0);
    if (!weight || weight <= 0) continue;

    const m = CONTAINER_MOMENTS[containerId] || { roll: 0, pitch: 0 };

    total += weight;
    rollMoment += weight * m.roll;
    pitchMoment += weight * m.pitch;
  }

  const rollNorm = total > 0 ? rollMoment / total : 0;
  const pitchNorm = total > 0 ? pitchMoment / total : 0;

  return { rollNorm, pitchNorm, totalWeight: total };
}

/* ═══════════════════════════════════════════════════════════════
   tiltToDegrees
   ═══════════════════════════════════════════════════════════════
   Converts normalized tilt values to clamped degree values.
   Keeps animation subtle and premium:
     Roll:  max ±3° (enough to see, not cartoonish)
     Pitch: max ±2° (gentler, since top-down view)

   @param rollNorm   Normalized roll (-1 to +1)
   @param pitchNorm  Normalized pitch (-1 to +1)
   @returns TiltDegrees with clamped roll and pitch in degrees
   ═══════════════════════════════════════════════════════════════ */
export function tiltToDegrees(rollNorm: number, pitchNorm: number): TiltDegrees {
  const MAX_ROLL_DEG = 3.0;
  const MAX_PITCH_DEG = 2.0;

  const rollDeg = clamp(rollNorm, -1, 1) * MAX_ROLL_DEG;
  const pitchDeg = clamp(pitchNorm, -1, 1) * MAX_PITCH_DEG;

  return { rollDeg, pitchDeg };
}

/* ═══════════════════════════════════════════════════════════════
   stabilityScore
   ═══════════════════════════════════════════════════════════════
   Computes a 0–100 stability score reflecting weight balance.
   100 = perfectly balanced (no tilt at all)
    40 = maximum imbalance (worst case, both axes maxed)

   Uses Euclidean magnitude of the normalized tilt vector.

   @param rollNorm   Normalized roll (-1 to +1)
   @param pitchNorm  Normalized pitch (-1 to +1)
   @returns Integer score 0–100
   ═══════════════════════════════════════════════════════════════ */
export function stabilityScore(rollNorm: number, pitchNorm: number): number {
  const magnitude = Math.sqrt(rollNorm * rollNorm + pitchNorm * pitchNorm);
  // Scale: magnitude 0 → score 100, magnitude 1+ → score 40
  return Math.round(100 - clamp(magnitude, 0, 1) * 60);
}

/* ═══════════════════════════════════════════════════════════════
   stabilityGrade
   ═══════════════════════════════════════════════════════════════
   Maps stability score to a human-readable grade + color.

   @param score  Stability score (0–100)
   @returns { grade, color, description }
   ═══════════════════════════════════════════════════════════════ */
export interface StabilityGrade {
  grade: string;
  color: string;
  description: string;
}

export function stabilityGrade(score: number): StabilityGrade {
  if (score >= 90) return { grade: 'OPTIMAL', color: '#66BB6A', description: 'Weight is well balanced' };
  if (score >= 75) return { grade: 'GOOD', color: '#81C784', description: 'Minor weight bias detected' };
  if (score >= 60) return { grade: 'FAIR', color: '#FFB300', description: 'Moderate weight imbalance' };
  if (score >= 45) return { grade: 'CAUTION', color: '#FF9500', description: 'Significant weight shift' };
  return { grade: 'CRITICAL', color: '#FF3B30', description: 'Severe weight imbalance' };
}

/* ═══════════════════════════════════════════════════════════════
   Full Tilt Analysis (convenience function)
   ═══════════════════════════════════════════════════════════════
   Combines all computations into a single result object.

   @param containerWeights  Map of container ID → weight in lbs
   @returns Complete tilt analysis with degrees, score, and grade
   ═══════════════════════════════════════════════════════════════ */
export interface TiltAnalysis {
  tilt: VehicleTilt;
  degrees: TiltDegrees;
  score: number;
  grade: StabilityGrade;
}

export function analyzeTilt(containerWeights: ContainerWeightMap): TiltAnalysis {
  const tilt = computeVehicleTilt(containerWeights);
  const degrees = tiltToDegrees(tilt.rollNorm, tilt.pitchNorm);
  const score = stabilityScore(tilt.rollNorm, tilt.pitchNorm);
  const grade = stabilityGrade(score);

  return { tilt, degrees, score, grade };
}


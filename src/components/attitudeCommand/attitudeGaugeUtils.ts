export const DEFAULT_ATTITUDE_GAUGE_MIN_DEG = -30;
export const DEFAULT_ATTITUDE_GAUGE_MAX_DEG = 30;
export const DEFAULT_ATTITUDE_GAUGE_MAX_VISUAL_ROTATION_DEG = 70;

function toFiniteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function clampAngle(
  valueDeg: number,
  minDeg: number = DEFAULT_ATTITUDE_GAUGE_MIN_DEG,
  maxDeg: number = DEFAULT_ATTITUDE_GAUGE_MAX_DEG,
): number {
  const safeValue = toFiniteNumber(valueDeg);
  const lower = Math.min(toFiniteNumber(minDeg), toFiniteNumber(maxDeg));
  const upper = Math.max(toFiniteNumber(minDeg), toFiniteNumber(maxDeg));

  return Math.max(lower, Math.min(upper, safeValue));
}

export function mapAngleToNeedleRotation(
  valueDeg: number,
  minDeg: number = DEFAULT_ATTITUDE_GAUGE_MIN_DEG,
  maxDeg: number = DEFAULT_ATTITUDE_GAUGE_MAX_DEG,
  maxVisualRotationDeg: number = DEFAULT_ATTITUDE_GAUGE_MAX_VISUAL_ROTATION_DEG,
): number {
  const clampedValue = clampAngle(valueDeg, minDeg, maxDeg);
  const visualRangeDeg = Math.max(Math.abs(toFiniteNumber(minDeg)), Math.abs(toFiniteNumber(maxDeg)), 1);

  return (clampedValue / visualRangeDeg) * toFiniteNumber(maxVisualRotationDeg);
}

export const DEFAULT_MAX_PITCH_DEG = 30;
export const DEFAULT_MAX_ROLL_DEG = 30;
export const DEFAULT_TICK_TRAVEL_Y = 170;
export const DEFAULT_INDICATOR_TRAVEL_Y = 170;
export const HORIZON_Y = 512;

// ECS convention: sign constants keep the live UI markers tunable without rewriting the SVG overlay.
export const PITCH_UI_SIGN = -1;
export const ROLL_UI_SIGN = -1;
export const PITCH_FRONT_UI_SIGN = -1;
export const PITCH_REAR_UI_SIGN = 1;
export const ROLL_LEFT_UI_SIGN = -1;
export const ROLL_RIGHT_UI_SIGN = 1;
export const LANDSCAPE_LEFT_SIGN = 1;
export const LANDSCAPE_RIGHT_SIGN = 1;

export function clamp(value: number, min: number, max: number): number {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin;
  const lower = Math.min(safeMin, safeMax);
  const upper = Math.max(safeMin, safeMax);
  const safeValue = Number.isFinite(value) ? value : lower;

  return Math.min(upper, Math.max(lower, safeValue));
}

export function safeDeg(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function resolvePositiveDegreeLimit(value: unknown, fallback: number): number {
  const resolved = Math.abs(safeDeg(value));
  return resolved > 0 ? resolved : Math.max(1, Math.abs(safeDeg(fallback)));
}

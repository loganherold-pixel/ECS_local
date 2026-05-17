import { clamp, safeDeg } from './vehicleAttitudeTuning';

export const ATTITUDE_INCLINATION_ARTBOARD = 'Artboard';
export const ATTITUDE_INCLINATION_STATE_MACHINE = 'State Machine 1';
export const ATTITUDE_INCLINATION_RIVE_ARTBOARD = ATTITUDE_INCLINATION_ARTBOARD;
export const ATTITUDE_INCLINATION_RIVE_STATE_MACHINE = ATTITUDE_INCLINATION_STATE_MACHINE;

// The transparent ring-only inclination_widget.riv keeps the same runtime
// surface as the prior asset. ECS bypasses drag/touch and writes this
// state-machine number input from calibrated pitch/roll telemetry.
export const ATTITUDE_INCLINATION_NUMBER_INPUT = 'slider';

export const ATTITUDE_INCLINATION_DEFAULT_MIN_DEG = -30;
export const ATTITUDE_INCLINATION_DEFAULT_MAX_DEG = 30;

// The new asset hides non-ring artwork through Rive transparency. Keep this
// focus scale if the artboard geometry is still the original wide widget and
// the visible ring needs to fill the ECS meter slot. If the artboard was later
// resized to a tight square around the ring, set this to 1.
export const ATTITUDE_INCLINATION_RIVE_FOCUS_SCALE = 2.34;
export const ATTITUDE_INCLINATION_RIVE_FOCUS_TRANSLATE_X = 0;
export const ATTITUDE_INCLINATION_RIVE_FOCUS_TRANSLATE_Y = -2;

export type AttitudeInclinationAxis = 'pitch' | 'roll';

export type AttitudeInclinationRuntimeInput = {
  axis: AttitudeInclinationAxis;
  valueDeg: number | null | undefined;
  minDeg?: number | null | undefined;
  maxDeg?: number | null | undefined;
};

export type AttitudeInclinationRuntimeValues = {
  axis: AttitudeInclinationAxis;
  /** Sanitized unclamped telemetry value for the ECS live text readout. */
  valueDeg: number;
  /** Clamped value sent into the Rive state-machine number input. */
  inputValue: number;
  /** 0-100 intensity, useful for lightweight fallback styling. */
  absPercent: number;
};

function resolveLimit(value: number | null | undefined, fallback: number): number {
  const resolved = safeDeg(value);
  return Math.abs(resolved) > 0 ? resolved : fallback;
}

export function resolveAttitudeInclinationRuntime(
  input: AttitudeInclinationRuntimeInput,
): AttitudeInclinationRuntimeValues {
  const maxDeg = Math.max(
    1,
    Math.abs(resolveLimit(input.maxDeg, ATTITUDE_INCLINATION_DEFAULT_MAX_DEG)),
  );
  const minDeg = -Math.max(
    1,
    Math.abs(resolveLimit(input.minDeg, ATTITUDE_INCLINATION_DEFAULT_MIN_DEG)),
  );
  const valueDeg = safeDeg(input.valueDeg);
  const inputValue = clamp(valueDeg, minDeg, maxDeg);
  const absPercent = Math.round(
    Math.min(100, (Math.abs(inputValue) / Math.max(Math.abs(minDeg), Math.abs(maxDeg))) * 100),
  );

  return {
    axis: input.axis,
    valueDeg,
    inputValue,
    absPercent,
  };
}

export function formatInclinationDegrees(value: number): string {
  const safeValue = safeDeg(value);
  const prefix = safeValue > 0 ? '+' : '';
  return `${prefix}${safeValue.toFixed(1)}°`;
}

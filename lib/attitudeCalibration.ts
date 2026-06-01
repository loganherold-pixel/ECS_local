export interface AttitudeCalibrationOffsets {
  roll: number;
  pitch: number;
}

export interface CalibratedAttitudeAngles {
  roll: number;
  pitch: number;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function createAttitudeCalibrationOffsets(
  rawRoll: number,
  rawPitch: number,
): AttitudeCalibrationOffsets {
  return {
    roll: finiteOrZero(rawRoll),
    pitch: finiteOrZero(rawPitch),
  };
}

export function resetAttitudeCalibrationOffsets(): AttitudeCalibrationOffsets {
  return { roll: 0, pitch: 0 };
}

export function applyAttitudeCalibration(
  rawRoll: number,
  rawPitch: number,
  offsets: AttitudeCalibrationOffsets,
): CalibratedAttitudeAngles {
  return {
    roll: finiteOrZero(rawRoll) - finiteOrZero(offsets.roll),
    pitch: finiteOrZero(rawPitch) - finiteOrZero(offsets.pitch),
  };
}

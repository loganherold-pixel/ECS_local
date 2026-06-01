export type AccelerometerMountOrientation = 'portrait' | 'landscape';

export type AccelerometerSample = {
  x: number;
  y: number;
  z: number;
};

export type AccelerometerAttitudeAngles = {
  roll: number;
  pitch: number;
};

const RAD_TO_DEG = 180 / Math.PI;

export function computeVerticalMountAccelerometerAngles(
  sample: AccelerometerSample,
  mountOrientation: AccelerometerMountOrientation = 'portrait',
): AccelerometerAttitudeAngles | null {
  const { x, y, z } = sample;
  const magnitude = Math.sqrt(x * x + y * y + z * z);
  if (magnitude < 0.01) return null;

  const roll = mountOrientation === 'landscape'
    ? Math.atan2(y * (x < 0 ? -1 : 1), Math.sqrt(x * x + z * z)) * RAD_TO_DEG
    : Math.atan2(x, Math.sqrt(y * y + z * z)) * RAD_TO_DEG;
  const pitch = Math.atan2(-z, Math.sqrt(x * x + y * y)) * RAD_TO_DEG;

  return { roll, pitch };
}

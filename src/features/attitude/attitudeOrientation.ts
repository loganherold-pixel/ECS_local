import { useWindowDimensions } from 'react-native';

import {
  LANDSCAPE_LEFT_SIGN,
  LANDSCAPE_RIGHT_SIGN,
  safeDeg,
} from './vehicleAttitudeTuning';

export type EcsScreenOrientation =
  | 'portrait'
  | 'portraitUpsideDown'
  | 'landscapeLeft'
  | 'landscapeRight';

export type AttitudeTelemetryFrame = 'vehicle' | 'screen' | 'device';

export type AttitudeInput = {
  pitchDeg: number;
  rollDeg: number;
};

export type AttitudeOutput = {
  pitchDeg: number;
  rollDeg: number;
};

export function mapScreenAttitudeToVehicleAttitude(
  input: AttitudeInput,
  orientation: EcsScreenOrientation,
): AttitudeOutput {
  const pitch = safeDeg(input.pitchDeg);
  const roll = safeDeg(input.rollDeg);

  switch (orientation) {
    case 'portrait':
      return {
        pitchDeg: pitch,
        rollDeg: roll,
      };

    case 'portraitUpsideDown':
      return {
        pitchDeg: -pitch,
        rollDeg: -roll,
      };

    case 'landscapeLeft':
      return {
        pitchDeg: roll * LANDSCAPE_LEFT_SIGN,
        rollDeg: -pitch * LANDSCAPE_LEFT_SIGN,
      };

    case 'landscapeRight':
      return {
        pitchDeg: -roll * LANDSCAPE_RIGHT_SIGN,
        rollDeg: pitch * LANDSCAPE_RIGHT_SIGN,
      };

    default:
      return {
        pitchDeg: pitch,
        rollDeg: roll,
      };
  }
}

export function mapAttitudeInputForTelemetryFrame(
  input: AttitudeInput,
  orientation: EcsScreenOrientation,
  telemetryFrame: AttitudeTelemetryFrame,
): AttitudeOutput {
  if (telemetryFrame === 'vehicle') {
    return {
      pitchDeg: safeDeg(input.pitchDeg),
      rollDeg: safeDeg(input.rollDeg),
    };
  }

  if (telemetryFrame === 'device') {
    const pitch = safeDeg(input.pitchDeg);
    const roll = safeDeg(input.rollDeg);

    if (orientation === 'portraitUpsideDown') {
      return {
        pitchDeg: -pitch,
        rollDeg: -roll,
      };
    }

    return {
      pitchDeg: pitch,
      rollDeg: roll,
    };
  }

  return mapScreenAttitudeToVehicleAttitude(input, orientation);
}

export function useEcsScreenOrientation(): EcsScreenOrientation {
  const { width, height } = useWindowDimensions();
  return width > height ? 'landscapeRight' : 'portrait';
}

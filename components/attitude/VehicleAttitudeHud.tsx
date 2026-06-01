import React from 'react';
import type { ImageSourcePropType } from 'react-native';

import VehicleAttitudeStage from '../../src/features/attitude/components/VehicleAttitudeStage';
import type { VehicleAttitudeAsset } from '../../src/features/attitude/vehicleAttitudeAssets';

export interface VehicleAttitudeHudProps {
  rollDegrees: number;
  pitchDegrees: number;
  rawRollDegrees?: number;
  rawPitchDegrees?: number;
  attitudeImageSrc: string;
  attitudeImageSource: ImageSourcePropType;
  geometry: VehicleAttitudeAsset;
  compact?: boolean;
  onCalibrate?: () => void;
  onResetCalibration?: () => void;
  calibrationActive?: boolean;
}

function VehicleAttitudeHud({
  rollDegrees,
  pitchDegrees,
  rawRollDegrees,
  rawPitchDegrees,
  attitudeImageSrc,
  attitudeImageSource,
  geometry,
  compact,
  onCalibrate,
  onResetCalibration,
  calibrationActive,
}: VehicleAttitudeHudProps) {
  void rawRollDegrees;
  void rawPitchDegrees;
  void attitudeImageSrc;
  void attitudeImageSource;
  void compact;

  return (
    <VehicleAttitudeStage
      vehicleId={geometry.vehicleId}
      rollDeg={rollDegrees}
      pitchDeg={pitchDegrees}
      telemetryFrame="vehicle"
      showZeroButton
      onZero={onCalibrate}
      onResetZero={onResetCalibration}
      zeroActive={calibrationActive}
    />
  );
}

export default React.memo(VehicleAttitudeHud);

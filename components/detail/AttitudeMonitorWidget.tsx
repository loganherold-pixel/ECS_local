import React, { useMemo } from 'react';

import AttitudeMonitorExpandedView from '../attitude/AttitudeMonitorExpandedView';
import { useActiveAttitudeMonitorVehicleId } from '../../lib/attitudeMonitorVehicleVisual';
import { getAttitudeSensorState } from '../../lib/attitudeMonitorModel';
import { useAttitudeMonitorDisplayState } from '../../lib/useAttitudeMonitorDisplayState';
import {
  normalizeDeviceAttitudeTelemetry,
  type DeviceAttitudeSensorStatus,
} from '../../lib/deviceAttitudeTelemetry';
import type { AttitudeWeightSignals } from '../../lib/vehicleWeightEngine';
import type { RiskLevel } from '../../lib/terrainRiskEngine';
import type { LoadModule, VehicleBaseline } from '../../lib/stabilityEngine';

interface Props {
  advancedEnabled: boolean;
  loadModules: LoadModule[];
  vehicleBaseline?: VehicleBaseline;
  rollAngleDeg?: number;
  pitchAngleDeg?: number;
  sensorStatus?: DeviceAttitudeSensorStatus;
  sampleTimestampMs?: number | null;
  isCalibrated?: boolean;
  onCalibrate?: () => void;
  onResetCalibration?: () => void;
  weightSignals?: AttitudeWeightSignals;
  terrainRiskLevel?: RiskLevel;
  terrainRiskScore?: number;
  terrainRiskDrivers?: string[];
}

function areAttitudeMonitorWidgetPropsEqual(previous: Readonly<Props>, next: Readonly<Props>): boolean {
  return (
    previous.advancedEnabled === next.advancedEnabled &&
    previous.rollAngleDeg === next.rollAngleDeg &&
    previous.pitchAngleDeg === next.pitchAngleDeg &&
    previous.sensorStatus === next.sensorStatus &&
    previous.sampleTimestampMs === next.sampleTimestampMs
  );
}

function AttitudeMonitorWidget({
  advancedEnabled,
  rollAngleDeg = 0,
  pitchAngleDeg = 0,
  sensorStatus = 'OFFLINE',
  sampleTimestampMs = null,
  isCalibrated = false,
  onCalibrate,
  onResetCalibration,
}: Props) {
  const attitudeTelemetry = useMemo(
    () =>
      normalizeDeviceAttitudeTelemetry({
        rollDeg: rollAngleDeg,
        pitchDeg: pitchAngleDeg,
        sensorStatus,
        sampleTimestampMs,
      }),
    [pitchAngleDeg, rollAngleDeg, sampleTimestampMs, sensorStatus],
  );
  const displayState = useAttitudeMonitorDisplayState({
    rollDeg: attitudeTelemetry.rollDeg,
    pitchDeg: attitudeTelemetry.pitchDeg,
    sensorStatus,
    sampleTimestampMs: attitudeTelemetry.updatedAt,
    advanced: advancedEnabled,
    sourceOrigin: 'device_sensors',
    telemetryHealthOverride: attitudeTelemetry.displayHealth,
    sourceLabelOverride: attitudeTelemetry.sourceLabel,
    sourceShortLabelOverride: attitudeTelemetry.sourceLabel,
    sourceChipLabelOverride: attitudeTelemetry.sourceChipLabel,
    sourceStatusLineOverride: attitudeTelemetry.sourceStatusLine,
  });
  const attitudeVehicleId = useActiveAttitudeMonitorVehicleId();
  const sensorState = useMemo(() => getAttitudeSensorState(sensorStatus), [sensorStatus]);

  return (
    <AttitudeMonitorExpandedView
      displayState={displayState}
      sensorState={sensorState}
      sensorStatus={sensorStatus}
      vehicleId={attitudeVehicleId}
      rawRollDeg={attitudeTelemetry.rawRollDeg}
      rawPitchDeg={attitudeTelemetry.rawPitchDeg}
      onCalibrate={onCalibrate}
      onResetCalibration={onResetCalibration}
      calibrationActive={isCalibrated}
    />
  );
}

export default React.memo(AttitudeMonitorWidget, areAttitudeMonitorWidgetPropsEqual);

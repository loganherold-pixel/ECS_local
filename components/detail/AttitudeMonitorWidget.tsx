import React, { useMemo } from 'react';

import AttitudeMonitorExpandedView from '../attitude/AttitudeMonitorExpandedView';
import { useActiveAttitudeMonitorVehicleVisual } from '../../lib/attitudeMonitorVehicleVisual';
import { getAttitudeSensorState } from '../../lib/attitudeMonitorModel';
import { useAttitudeMonitorDisplayState } from '../../lib/useAttitudeMonitorDisplayState';
import type { AttitudeWeightSignals } from '../../lib/vehicleWeightEngine';
import type { RiskLevel } from '../../lib/terrainRiskEngine';
import type { LoadModule, VehicleBaseline } from '../../lib/stabilityEngine';

interface Props {
  advancedEnabled: boolean;
  loadModules: LoadModule[];
  vehicleBaseline?: VehicleBaseline;
  rollAngleDeg?: number;
  pitchAngleDeg?: number;
  sensorStatus?: 'LIVE' | 'CALIBRATED' | 'OFFLINE' | 'UNAVAILABLE';
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
}: Props) {
  const displayState = useAttitudeMonitorDisplayState({
    rollDeg: rollAngleDeg,
    pitchDeg: pitchAngleDeg,
    sensorStatus,
    sampleTimestampMs,
    advanced: advancedEnabled,
    sourceOrigin: 'device_sensors',
  });
  const heroVisual = useActiveAttitudeMonitorVehicleVisual();
  const sensorState = useMemo(() => getAttitudeSensorState(sensorStatus), [sensorStatus]);

  return (
    <AttitudeMonitorExpandedView
      displayState={displayState}
      sensorState={sensorState}
      sensorStatus={sensorStatus}
      heroVehicle={heroVisual}
    />
  );
}

export default React.memo(AttitudeMonitorWidget, areAttitudeMonitorWidgetPropsEqual);

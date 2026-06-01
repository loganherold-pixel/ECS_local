import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useActiveVehicleAttitudeBackdrop } from '../../../lib/attitudeMonitorVehicleVisual';
import { TACTICAL } from '../../../lib/theme';
import { useAccelerometer } from '../../../lib/useAccelerometer';
import AttitudeCommandWidget from './AttitudeCommandWidget';

export type AttitudeCommandWidgetConnectedProps = {
  pitchDeg?: number | null;
  rollDeg?: number | null;
  activeVehicleName?: string;
  telemetryEnabled?: boolean;
  title?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
};

function toFiniteTelemetryValue(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function AttitudeCommandWidgetConnected({
  pitchDeg,
  rollDeg,
  activeVehicleName,
  telemetryEnabled = true,
  title,
  className,
  style,
}: AttitudeCommandWidgetConnectedProps) {
  void className;

  const backdrop = useActiveVehicleAttitudeBackdrop();
  const pitchOverride = toFiniteTelemetryValue(pitchDeg);
  const rollOverride = toFiniteTelemetryValue(rollDeg);
  const shouldUseLiveHook = telemetryEnabled && (pitchOverride == null || rollOverride == null);
  const liveTelemetry = useAccelerometer(shouldUseLiveHook);
  const resolvedPitchDeg = pitchOverride ?? liveTelemetry.pitchDeg ?? 0;
  const resolvedRollDeg = rollOverride ?? liveTelemetry.rollDeg ?? 0;

  if (!backdrop.backdropSrc && !backdrop.backdropSource) {
    return (
      <View
        testID="attitude-command-connected-unavailable"
        accessibilityRole="summary"
        accessibilityLabel="Attitude Command unavailable. Vehicle attitude backdrop is missing."
        style={[styles.unavailable, style]}
      >
        <Text style={styles.unavailableBody}>Vehicle attitude backdrop unavailable</Text>
      </View>
    );
  }

  return (
    <AttitudeCommandWidget
      backdropSrc={backdrop.backdropSrc ?? ''}
      backdropSource={backdrop.backdropSource}
      pitchDeg={resolvedPitchDeg}
      rollDeg={resolvedRollDeg}
      title={title}
      activeVehicleName={activeVehicleName ?? backdrop.attitudeVehicleId}
      isFallbackBackdrop={backdrop.isFallback}
      style={style}
    />
  );
}

export default React.memo(AttitudeCommandWidgetConnected);

const styles = StyleSheet.create({
  unavailable: {
    minHeight: 160,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(249, 194, 84, 0.4)',
    backgroundColor: 'rgba(5, 8, 10, 0.68)',
  },
  unavailableBody: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { VehicleAttitudeData } from '../../lib/vehicleDisplayTypes';
import AttitudeMonitorSurface from '../attitude/AttitudeMonitorSurface';
import { useActiveAttitudeMonitorVehicleId } from '../../lib/attitudeMonitorVehicleVisual';
import { useAttitudeMonitorDisplayState } from '../../lib/useAttitudeMonitorDisplayState';
import { TACTICAL } from '../../lib/theme';
import type { AttitudeSourceOrigin } from '../../lib/attitudeMonitorModel';

interface Props {
  data: VehicleAttitudeData;
}

function areVehicleAttitudeDataEqual(left: VehicleAttitudeData, right: VehicleAttitudeData): boolean {
  return (
    left.rollDeg === right.rollDeg &&
    left.pitchDeg === right.pitchDeg &&
    left.status === right.status &&
    left.source === right.source &&
    left.sideSlopeState === right.sideSlopeState &&
    left.tiltState === right.tiltState &&
    left.unavailableReason === right.unavailableReason
  );
}

function getVehicleTone(data: VehicleAttitudeData): 'good' | 'attention' | 'critical' | 'neutral' {
  if (data.sideSlopeState === 'critical' || data.tiltState === 'critical') {
    return 'critical';
  }
  if (data.sideSlopeState === 'caution' || data.tiltState === 'caution') {
    return 'attention';
  }
  if (data.status === 'unavailable') {
    return 'neutral';
  }
  return 'good';
}

function getVehicleInstruction(data: VehicleAttitudeData, tone: ReturnType<typeof getVehicleTone>): string {
  if (data.status === 'unavailable') {
    return data.unavailableReason || 'Waiting for sensors.';
  }
  if (tone === 'critical') {
    return 'Reposition vehicle.';
  }
  if (tone === 'attention') {
    return 'Proceed with caution.';
  }
  return 'Continue monitoring.';
}

function mapVehicleSourceToAttitudeOrigin(source: VehicleAttitudeData['source']): AttitudeSourceOrigin | null {
  switch (source) {
    case 'live_telemetry':
      return 'vehicle_telemetry';
    case 'bluetooth':
      return 'blu_device';
    case 'manual':
      return 'manual';
    case 'cached':
      return 'vehicle_telemetry';
    default:
      return null;
  }
}

function VehicleAttitudeScreen({ data }: Props) {
  const tone = getVehicleTone(data);
  const displayState = useAttitudeMonitorDisplayState({
    rollDeg: data.rollDeg,
    pitchDeg: data.pitchDeg,
    sourceOrigin: mapVehicleSourceToAttitudeOrigin(data.source),
    telemetryHealthOverride:
      data.status === 'live' ? 'live' : data.status === 'fallback' ? 'stale' : 'unavailable',
    severityOverride:
      tone === 'critical' ? 'warning' : tone === 'attention' ? 'caution' : null,
  });
  const live = displayState.liveMotion;
  const attitudeVehicleId = useActiveAttitudeMonitorVehicleId();
  const showGuidance =
    displayState.severity !== 'normal' || displayState.telemetryHealth !== 'live';
  const sourceLine = displayState.sourceLabel ?? displayState.statusText;
  const healthLine =
    displayState.telemetryHealth === 'live'
      ? displayState.confidenceLabel ?? displayState.telemetryHint
      : displayState.sourceStatusLine ?? displayState.telemetryHint;
  const guidanceLine = live ? displayState.postureInstruction : getVehicleInstruction(data, tone);

  return (
    <View style={styles.container}>
      <View style={styles.surfaceWrap}>
        <AttitudeMonitorSurface
          rollDeg={displayState.displayRollDeg}
          pitchDeg={displayState.displayPitchDeg}
          live={displayState.liveMotion}
          tone={displayState.tone}
          postureLabel={displayState.postureLabel}
          postureInstruction={guidanceLine}
          topLabel={displayState.sourceChipLabel ?? displayState.badgeLabel}
          variant="automotive"
          vehicleId={attitudeVehicleId}
          telemetryFrame="vehicle"
        />
      </View>

      <View style={styles.statusRail}>
        <View style={styles.statusLead}>
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>{displayState.badgeLabel}</Text>
          </View>
          <View style={styles.statusStack}>
            <Text style={styles.statusPrimary} numberOfLines={1}>
              {sourceLine}
            </Text>
            <Text style={styles.statusSecondary} numberOfLines={1}>
              {healthLine}
            </Text>
          </View>
        </View>
        {showGuidance ? (
          <View style={[styles.guidancePill, tone === 'critical' ? styles.guidancePillCritical : tone === 'attention' ? styles.guidancePillWarning : null]}>
            <Text style={styles.guidanceLabel}>GUIDANCE</Text>
            <Text style={styles.guidanceText} numberOfLines={1}>
              {guidanceLine}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default React.memo(VehicleAttitudeScreen, (previous, next) =>
  areVehicleAttitudeDataEqual(previous.data, next.data),
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090B0E',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 12,
  },
  surfaceWrap: {
    flex: 1,
    minHeight: 0,
  },
  statusRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    minHeight: 58,
  },
  statusLead: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(15,18,21,0.96)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: TACTICAL.textMuted,
  },
  statusStack: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  statusPrimary: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  statusSecondary: {
    fontSize: 12,
    lineHeight: 16,
    color: TACTICAL.textMuted,
    fontWeight: '600',
  },
  guidancePill: {
    flexGrow: 1,
    flexBasis: 240,
    flexShrink: 1,
    minWidth: 190,
    maxWidth: 320,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(15,18,21,0.96)',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 3,
  },
  guidancePillWarning: {
    borderColor: 'rgba(212, 160, 23, 0.24)',
    backgroundColor: 'rgba(35, 28, 14, 0.96)',
  },
  guidancePillCritical: {
    borderColor: 'rgba(197, 69, 55, 0.28)',
    backgroundColor: 'rgba(38, 18, 16, 0.96)',
  },
  guidanceLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: TACTICAL.textMuted,
  },
  guidanceText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: TACTICAL.text,
  },
});

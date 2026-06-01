import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type DimensionValue,
  type ViewStyle,
} from 'react-native';

import type { AttitudeMonitorDisplayState } from '../../lib/useAttitudeMonitorDisplayState';
import type {
  AttitudeMonitorVehicleVisualDescriptor,
} from '../../lib/attitudeMonitorVehicleVisual';
import {
  formatAttitudeDegrees,
  type AttitudeSensorState,
} from '../../lib/attitudeMonitorModel';
import {
  syncAttitudeApproachingLimitTone,
  useAttitudeMonitorSoundPreference,
} from '../../lib/attitudeMonitorAudio';
import { hapticMicro } from '../../lib/haptics';
import { TACTICAL } from '../../lib/theme';
import AttitudeMonitorSurface from './AttitudeMonitorSurface';

interface AttitudeMonitorExpandedViewProps {
  displayState: AttitudeMonitorDisplayState;
  sensorState: AttitudeSensorState;
  sensorStatus?: string;
  vehicleId?: string | null;
  heroVehicle?: AttitudeMonitorVehicleVisualDescriptor;
  rawRollDeg?: number | null;
  rawPitchDeg?: number | null;
  onCalibrate?: () => void;
  onResetCalibration?: () => void;
  calibrationActive?: boolean;
  style?: ViewStyle;
}

function getSourceLabel(sensorStatus?: string) {
  switch (sensorStatus) {
    case 'CALIBRATED':
    case 'LIVE':
      return 'Device Attitude Live';
    case 'PAUSED':
    case 'BACKGROUND':
      return 'Device Attitude Recent';
    case 'PERMISSION_DENIED':
    case 'UNAVAILABLE':
      return 'Unavailable';
    case 'AWAITING':
      return 'Unavailable';
    default:
      return 'Unavailable';
  }
}

function AttitudeMonitorExpandedView({
  displayState,
  sensorState,
  sensorStatus,
  vehicleId,
  heroVehicle,
  rawRollDeg,
  rawPitchDeg,
  onCalibrate,
  onResetCalibration,
  calibrationActive = false,
  style,
}: AttitudeMonitorExpandedViewProps) {
  const [layoutWidth, setLayoutWidth] = useState(0);
  const { enabled: soundEnabled, toggle: toggleSoundEnabled } = useAttitudeMonitorSoundPreference();

  const width = layoutWidth || 680;
  const wide = width >= 940;
  const roomy = width >= 640;
  const compact = width < 440;
  const narrowSupport = width < 560;
  const surfaceHeight = Math.max(
    compact ? 268 : 286,
    Math.min(wide ? 420 : roomy ? 372 : 332, width * (wide ? 0.34 : roomy ? 0.44 : 0.64)),
  );
  const summaryTileWidth = wide ? '23.5%' : roomy ? '48.5%' : '48%';
  const supportTileWidth = wide ? '31.8%' : roomy ? '48.5%' : '100%';
  const accentColor =
    displayState.severity === 'warning'
      ? TACTICAL.danger
      : displayState.severity === 'caution'
        ? TACTICAL.amber
        : displayState.telemetryHealth === 'unavailable'
          ? TACTICAL.textMuted
          : '#74B27E';
  const chromeBorder =
    displayState.severity === 'warning'
      ? 'rgba(192,57,43,0.2)'
      : displayState.severity === 'caution'
        ? 'rgba(212,160,23,0.22)'
        : 'rgba(255,255,255,0.06)';
  const topLabel = displayState.sourceChipLabel ?? (displayState.telemetryHealth === 'live' ? null : displayState.badgeLabel);
  const sensorSummary = useMemo(() => {
    if (displayState.telemetryHealth === 'recent') {
      return 'Device Attitude Recent';
    }
    if (displayState.telemetryHealth === 'stale') {
      return 'Stale';
    }
    return getSourceLabel(sensorStatus);
  }, [displayState.telemetryHealth, sensorStatus]);
  const sensorHealthBody = displayState.sourceStatusLine
    ? `${displayState.sourceStatusLine}. ${displayState.telemetryHint}`
    : `${sensorSummary}. ${displayState.telemetryHint}`;
  const handleToggleSound = useCallback(() => {
    void hapticMicro();
    toggleSoundEnabled();
  }, [toggleSoundEnabled]);

  useEffect(() => {
    syncAttitudeApproachingLimitTone({
      severity: displayState.severity,
      telemetryHealth: displayState.telemetryHealth,
      soundEnabled,
    });
  }, [displayState.severity, displayState.telemetryHealth, soundEnabled]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width: nextWidth } = event.nativeEvent.layout;
    setLayoutWidth((prev) => (Math.abs(prev - nextWidth) < 4 ? prev : nextWidth));
  };

  return (
    <View style={[styles.container, style]} onLayout={handleLayout}>
      <View style={[styles.heroStage, { minHeight: surfaceHeight, borderColor: chromeBorder }]}>
        <AttitudeMonitorSurface
          rollDeg={displayState.displayRollDeg}
          pitchDeg={displayState.displayPitchDeg}
          rawRollDeg={rawRollDeg ?? displayState.rawRollDeg}
          rawPitchDeg={rawPitchDeg ?? displayState.rawPitchDeg}
          live={displayState.liveMotion}
          tone={displayState.tone}
          postureLabel={displayState.postureLabel}
          postureInstruction={displayState.postureInstruction}
          rollColor={displayState.liveMotion ? displayState.rollColor : TACTICAL.textMuted}
          pitchColor={displayState.liveMotion ? displayState.pitchColor : TACTICAL.textMuted}
          topLabel={topLabel}
          variant={wide ? 'vehicle' : 'detail'}
          vehicleId={vehicleId ?? heroVehicle?.attitudeVehicleId}
          heroVehicle={heroVehicle}
          telemetryFrame="vehicle"
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
          onCalibrate={onCalibrate}
          onResetCalibration={onResetCalibration}
          calibrationActive={calibrationActive}
        />
      </View>

      <View style={styles.summaryGrid}>
        <SummaryTile
          label="Roll"
          value={formatAttitudeDegrees(displayState.displayRollDeg)}
          color={displayState.liveMotion ? displayState.rollColor : TACTICAL.textMuted}
          width={summaryTileWidth}
        />
        <SummaryTile
          label="Pitch"
          value={formatAttitudeDegrees(displayState.displayPitchDeg)}
          color={displayState.liveMotion ? displayState.pitchColor : TACTICAL.textMuted}
          width={summaryTileWidth}
        />
        <SummaryTile
          label="Tilt"
          value={formatAttitudeDegrees(displayState.tilt)}
          color={displayState.liveMotion ? displayState.tiltColor : TACTICAL.textMuted}
          width={summaryTileWidth}
        />
        <SummaryTile
          label="State"
          value={displayState.postureLabel}
          color={accentColor}
          width={summaryTileWidth}
        />
      </View>

      <View style={styles.supportGrid}>
        <SupportCard
          eyebrow="Guidance"
          title={displayState.statusText}
          body={displayState.postureInstruction}
          width={supportTileWidth}
          borderColor={chromeBorder}
          accentColor={accentColor}
          titleLines={narrowSupport ? 1 : 2}
          bodyLines={narrowSupport ? 2 : 3}
        />
        <SupportCard
          eyebrow="Threshold band"
          title={`Roll ${displayState.thresholds.rollWarning}° / ${displayState.thresholds.rollDanger}°`}
          body={`Pitch ${displayState.thresholds.pitchWarning}° / ${displayState.thresholds.pitchDanger}°`}
          width={supportTileWidth}
          borderColor={chromeBorder}
          accentColor={displayState.severity === 'warning' ? TACTICAL.danger : TACTICAL.amber}
          titleLines={1}
          bodyLines={1}
        />
        <SupportCard
          eyebrow="Sensor health"
          title={displayState.sourceLabel ?? sensorState.title}
          body={sensorHealthBody}
          width={supportTileWidth}
          borderColor={chromeBorder}
          accentColor={displayState.telemetryHealth === 'unavailable' ? TACTICAL.textMuted : TACTICAL.text}
          titleLines={narrowSupport ? 1 : 2}
          bodyLines={narrowSupport ? 2 : 3}
        />
      </View>
    </View>
  );
}

function SummaryTile({
  label,
  value,
  color,
  width,
}: {
  label: string;
  value: string;
  color: string;
  width: DimensionValue;
}) {
  return (
    <View style={[styles.summaryTile, { width }]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function SupportCard({
  eyebrow,
  title,
  body,
  width,
  borderColor,
  accentColor,
  titleLines = 2,
  bodyLines = 3,
}: {
  eyebrow: string;
  title: string;
  body: string;
  width: DimensionValue;
  borderColor: string;
  accentColor: string;
  titleLines?: number;
  bodyLines?: number;
}) {
  return (
    <View style={[styles.supportCard, { width, borderColor }]}>
      <Text style={styles.supportEyebrow}>{eyebrow}</Text>
      <Text style={[styles.supportTitle, { color: accentColor }]} numberOfLines={titleLines}>
        {title}
      </Text>
      <Text style={styles.supportBody} numberOfLines={bodyLines}>
        {body}
      </Text>
    </View>
  );
}

export default React.memo(AttitudeMonitorExpandedView);

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  heroStage: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#0A0D10',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  summaryTile: {
    minHeight: 88,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(10,13,16,0.92)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  supportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  supportCard: {
    minHeight: 110,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(14,17,21,0.94)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  supportEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.25,
    textTransform: 'uppercase',
    color: TACTICAL.textMuted,
  },
  supportTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  supportBody: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },
});

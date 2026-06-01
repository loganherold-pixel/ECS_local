import React, { useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  resolveAttitudeMonitorVehicleVisual,
  type AttitudeMonitorVehicleVisualDescriptor,
} from '../../lib/attitudeMonitorVehicleVisual';
import { type AttitudeSurfaceTone } from '../../lib/attitudeMonitorModel';
import { TACTICAL } from '../../lib/theme';
import type { AttitudeTelemetryFrame } from '../../src/features/attitude/attitudeOrientation';
import VehicleAttitudeStage from '../../src/features/attitude/components/VehicleAttitudeStage';

export type AttitudeSurfaceVariant =
  | 'widgetCompact'
  | 'widget'
  | 'detail'
  | 'vehicle'
  | 'automotive';

interface AttitudeMonitorSurfaceProps {
  rollDeg?: number | null;
  pitchDeg?: number | null;
  rawRollDeg?: number | null;
  rawPitchDeg?: number | null;
  live?: boolean;
  tone?: AttitudeSurfaceTone;
  postureLabel: string;
  postureInstruction?: string | null;
  statusLabel?: string | null;
  statusTone?: AttitudeSurfaceTone;
  rollColor?: string;
  pitchColor?: string;
  topLabel?: string | null;
  variant?: AttitudeSurfaceVariant;
  vehicleId?: string | null;
  heroVehicle?: AttitudeMonitorVehicleVisualDescriptor;
  soundEnabled?: boolean;
  onToggleSound?: (() => void) | null;
  onCalibrate?: (() => void) | null;
  onResetCalibration?: (() => void) | null;
  calibrationActive?: boolean;
  telemetryFrame?: AttitudeTelemetryFrame;
  style?: ViewStyle;
}

function heroVehicleEqual(
  left?: AttitudeMonitorVehicleVisualDescriptor,
  right?: AttitudeMonitorVehicleVisualDescriptor,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return !left && !right;
  }

  return (
    left.familyId === right.familyId &&
    left.displayName === right.displayName &&
    left.matchedVehicleId === right.matchedVehicleId &&
    left.usesFallbackAsset === right.usesFallbackAsset &&
    left.usesFallbackFamily === right.usesFallbackFamily &&
    left.attitudeAssets?.vehicleKey === right.attitudeAssets?.vehicleKey &&
    left.attitudeVehicleId === right.attitudeVehicleId &&
    left.missingVehicleId === right.missingVehicleId &&
    left.assetSource === right.assetSource &&
    left.rearAssetSource === right.rearAssetSource &&
    left.compactAssetSource === right.compactAssetSource &&
    left.fit === right.fit
  );
}

function areAttitudeSurfacePropsEqual(
  previous: Readonly<AttitudeMonitorSurfaceProps>,
  next: Readonly<AttitudeMonitorSurfaceProps>,
): boolean {
  return (
    previous.rollDeg === next.rollDeg &&
    previous.pitchDeg === next.pitchDeg &&
    previous.rawRollDeg === next.rawRollDeg &&
    previous.rawPitchDeg === next.rawPitchDeg &&
    previous.live === next.live &&
    previous.tone === next.tone &&
    previous.postureLabel === next.postureLabel &&
    previous.postureInstruction === next.postureInstruction &&
    previous.statusLabel === next.statusLabel &&
    previous.statusTone === next.statusTone &&
    previous.rollColor === next.rollColor &&
    previous.pitchColor === next.pitchColor &&
    previous.topLabel === next.topLabel &&
    previous.variant === next.variant &&
    previous.vehicleId === next.vehicleId &&
    previous.soundEnabled === next.soundEnabled &&
    previous.onToggleSound === next.onToggleSound &&
    previous.onCalibrate === next.onCalibrate &&
    previous.onResetCalibration === next.onResetCalibration &&
    previous.calibrationActive === next.calibrationActive &&
    previous.telemetryFrame === next.telemetryFrame &&
    previous.style === next.style &&
    heroVehicleEqual(previous.heroVehicle, next.heroVehicle)
  );
}

function AttitudeMonitorSurface({
  rollDeg,
  pitchDeg,
  rawRollDeg,
  rawPitchDeg,
  live = true,
  tone = 'good',
  postureLabel,
  topLabel,
  variant = 'widget',
  vehicleId,
  heroVehicle,
  soundEnabled = true,
  onToggleSound,
  onCalibrate,
  onResetCalibration,
  calibrationActive = false,
  telemetryFrame = 'device',
  style,
}: AttitudeMonitorSurfaceProps) {
  const [bounds, setBounds] = useState({ width: 0, height: 0 });

  const effectiveWidth =
    bounds.width ||
    (variant === 'automotive'
      ? 960
      : variant === 'vehicle'
        ? 720
        : variant === 'detail'
          ? 540
          : variant === 'widgetCompact'
            ? 280
            : 360);
  const effectiveHeight =
    bounds.height ||
    (variant === 'automotive'
      ? 348
      : variant === 'vehicle'
        ? 360
        : variant === 'detail'
          ? 320
          : variant === 'widgetCompact'
            ? 140
            : 210);
  const automotive = variant === 'automotive';
  const stageWidth = Math.max(effectiveWidth, 1);
  const stageHeight = Math.max(effectiveHeight, 1);
  const compactHeight = variant === 'widgetCompact' || stageHeight < 152 || stageWidth < 250;
  const ultraCompact = stageHeight < 118 || stageWidth < 220;
  const large = automotive || variant === 'vehicle' || variant === 'detail' || stageWidth >= 520;
  const resolvedHeroVehicle = useMemo(
    () => heroVehicle ?? resolveAttitudeMonitorVehicleVisual(null),
    [heroVehicle],
  );
  const resolvedVehicleId = vehicleId ?? resolvedHeroVehicle.attitudeVehicleId;

  const palette = useMemo(() => {
    if (tone === 'critical') {
      return {
        edge: 'rgba(197, 69, 55, 0.5)',
        edgeSoft: 'rgba(197, 69, 55, 0.18)',
        glow: 'rgba(197, 69, 55, 0.18)',
        lift: 'rgba(197, 69, 55, 0.12)',
        postureBg: 'rgba(56, 18, 16, 0.88)',
        postureBorder: 'rgba(197, 69, 55, 0.34)',
        postureText: '#F2C2BA',
      };
    }
    if (tone === 'attention') {
      return {
        edge: 'rgba(212, 160, 23, 0.42)',
        edgeSoft: 'rgba(212, 160, 23, 0.16)',
        glow: 'rgba(212, 160, 23, 0.14)',
        lift: 'rgba(212, 160, 23, 0.1)',
        postureBg: 'rgba(44, 31, 14, 0.88)',
        postureBorder: 'rgba(212, 160, 23, 0.28)',
        postureText: '#F0DB9B',
      };
    }
    if (tone === 'neutral') {
      return {
        edge: 'rgba(139, 148, 158, 0.22)',
        edgeSoft: 'rgba(139, 148, 158, 0.1)',
        glow: 'rgba(212, 160, 23, 0.08)',
        lift: 'rgba(139, 148, 158, 0.06)',
        postureBg: 'rgba(22, 26, 31, 0.9)',
        postureBorder: 'rgba(139, 148, 158, 0.18)',
        postureText: '#C5CED6',
      };
    }
    return {
      edge: 'rgba(212, 160, 23, 0.28)',
      edgeSoft: 'rgba(212, 160, 23, 0.12)',
      glow: 'rgba(212, 160, 23, 0.12)',
      lift: 'rgba(212, 160, 23, 0.08)',
      postureBg: 'rgba(28, 23, 14, 0.88)',
      postureBorder: 'rgba(212, 160, 23, 0.22)',
      postureText: '#F5E1A4',
    };
  }, [tone]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBounds((prev) => {
      if (Math.abs(prev.width - width) < 2 && Math.abs(prev.height - height) < 2) {
        return prev;
      }
      return { width, height };
    });
  };

  const outerPadX = automotive ? 24 : ultraCompact ? 8 : compactHeight ? 10 : large ? 20 : 14;
  const outerPadY = automotive ? 18 : ultraCompact ? 8 : compactHeight ? 10 : large ? 18 : 14;
  const topLabelTop = automotive ? 12 : ultraCompact ? 6 : compactHeight ? 8 : 10;
  const postureValueSize = automotive ? 13 : ultraCompact ? 9 : compactHeight ? 10 : 11;
  const topLabelSize = automotive ? 10 : ultraCompact ? 8 : compactHeight ? 9 : 10;
  const posturePillTop = automotive ? 14 : ultraCompact ? 7 : compactHeight ? 8 : 10;
  const posturePillRight = automotive ? 18 : ultraCompact ? 8 : compactHeight ? 10 : 12;
  const soundPillLeft = posturePillRight;
  const soundPillLabel = ultraCompact
    ? soundEnabled ? 'ON' : 'OFF'
    : soundEnabled ? 'SOUND ON' : 'SOUND OFF';
  const posturePillMaxWidth = Math.max(
    automotive ? 132 : compactHeight ? 94 : 108,
    Math.min(
      automotive ? 220 : compactHeight ? 148 : 176,
      stageWidth * (automotive ? 0.28 : compactHeight ? 0.34 : 0.36),
    ),
  );
  const soundPillMaxWidth = Math.max(
    automotive ? 132 : compactHeight ? 94 : 108,
    Math.min(
      automotive ? 210 : compactHeight ? 138 : 164,
      stageWidth * (automotive ? 0.26 : compactHeight ? 0.32 : 0.34),
    ),
  );
  return (
    <View
      style={[
        styles.surface,
        {
          borderColor: palette.edgeSoft,
          shadowColor: tone === 'critical' ? TACTICAL.danger : TACTICAL.amber,
        },
        style,
      ]}
      onLayout={handleLayout}
    >
      {topLabel ? (
        <Text
          style={[styles.topLabelText, { top: topLabelTop, fontSize: topLabelSize }]}
          numberOfLines={1}
        >
          {topLabel}
        </Text>
      ) : null}

      {onToggleSound ? (
        <TouchableOpacity
          accessibilityLabel={soundEnabled ? 'Disable attitude monitor sound' : 'Enable attitude monitor sound'}
          accessibilityRole="button"
          activeOpacity={0.82}
          onPress={onToggleSound}
          style={[
            styles.soundPill,
            {
              top: posturePillTop,
              left: soundPillLeft,
              maxWidth: soundPillMaxWidth,
              backgroundColor: soundEnabled ? palette.postureBg : 'rgba(20, 24, 30, 0.9)',
              borderColor: soundEnabled ? palette.postureBorder : 'rgba(139, 148, 158, 0.2)',
            },
          ]}
        >
          <Ionicons
            name={soundEnabled ? 'volume-high-outline' : 'volume-mute-outline'}
            size={ultraCompact ? 11 : compactHeight ? 12 : 13}
            color={soundEnabled ? palette.postureText : 'rgba(197, 206, 214, 0.86)'}
          />
          <Text
            style={[
              styles.soundPillText,
              {
                color: soundEnabled ? palette.postureText : 'rgba(197, 206, 214, 0.86)',
                fontSize: postureValueSize,
              },
            ]}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            numberOfLines={1}
          >
            {soundPillLabel}
          </Text>
        </TouchableOpacity>
      ) : null}

      <View
        style={[
          styles.posturePill,
          {
            top: posturePillTop,
            right: posturePillRight,
            maxWidth: posturePillMaxWidth,
            backgroundColor: palette.postureBg,
            borderColor: palette.postureBorder,
          },
        ]}
      >
        <Text
          style={[
            styles.posturePillText,
            {
              color: palette.postureText,
              fontSize: postureValueSize,
            },
          ]}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          numberOfLines={1}
        >
          {postureLabel}
        </Text>
      </View>

      <View
        style={[
          styles.contentRow,
          automotive ? styles.automotiveContentRow : null,
          { paddingHorizontal: outerPadX, paddingVertical: outerPadY },
        ]}
      >
        <View
          style={[
            styles.heroZone,
            automotive ? styles.automotiveHeroZone : null,
          ]}
        >
          <View style={styles.heroLane}>
            <VehicleAttitudeStage
              vehicleId={resolvedVehicleId}
              rollDeg={live ? rollDeg ?? 0 : 0}
              pitchDeg={live ? pitchDeg ?? 0 : 0}
              telemetryFrame={telemetryFrame}
              mode={variant === 'detail' || variant === 'vehicle' || variant === 'automotive' ? 'command' : 'monitor'}
              showZeroButton={live}
              showReadouts={live}
              showLiveHashIndicators={live}
              onZero={live ? onCalibrate ?? undefined : undefined}
              onResetZero={live ? onResetCalibration ?? undefined : undefined}
              zeroActive={live && calibrationActive}
            />
          </View>

        </View>
      </View>
    </View>
  );
}

export default React.memo(AttitudeMonitorSurface, areAttitudeSurfacePropsEqual);

const styles = StyleSheet.create({
  surface: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 0,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 28,
    elevation: 0,
  },
  topLabelText: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 3,
    color: 'rgba(230, 237, 243, 0.82)',
    fontWeight: '800',
    letterSpacing: 1.1,
    textShadowColor: 'rgba(0,0,0,0.64)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  contentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  automotiveContentRow: {
    alignItems: 'center',
  },
  heroZone: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  automotiveHeroZone: {
    paddingLeft: 10,
  },
  heroLane: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'stretch',
    justifyContent: 'center',
    minHeight: 0,
  },
  posturePill: {
    position: 'absolute',
    zIndex: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  soundPill: {
    position: 'absolute',
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 24,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  posturePillText: {
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.34)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  soundPillText: {
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.34)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});

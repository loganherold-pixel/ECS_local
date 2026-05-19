import React, { useState } from 'react';
import {
  Image,
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { TACTICAL } from '../../../lib/theme';
import AttitudeDial from '../../features/attitude/components/AttitudeDial';
import { formatSignedDegrees } from './attitudeReadoutUtils';

export type AttitudeCommandWidgetProps = {
  backdropSrc: string;
  backdropSource?: ImageSourcePropType | null;
  pitchDeg: number;
  rollDeg: number;
  title?: string;
  activeVehicleName?: string;
  className?: string;
  isFallbackBackdrop?: boolean;
  style?: StyleProp<ViewStyle>;
};

const ATTITUDE_COMMAND_STAGE_ASPECT_RATIO = 4 / 3;
const MIN_MEASURED_STAGE_WIDTH = 1;

export type AttitudeCommandStageBounds = {
  width: number;
  height?: number | null;
};

export type AttitudeCommandStageSize = {
  width: number;
  height: number;
};

export function getContainedAttitudeCommandStageSize(
  bounds: AttitudeCommandStageBounds | null,
): AttitudeCommandStageSize | null {
  const availableWidth = bounds?.width;
  const availableHeight = bounds?.height;

  if (typeof availableWidth !== 'number' || !Number.isFinite(availableWidth) || availableWidth < MIN_MEASURED_STAGE_WIDTH) {
    return null;
  }

  if (typeof availableHeight !== 'number' || !Number.isFinite(availableHeight) || availableHeight <= 0) {
    return {
      width: availableWidth,
      height: availableWidth / ATTITUDE_COMMAND_STAGE_ASPECT_RATIO,
    };
  }

  const widthFromHeight = availableHeight * ATTITUDE_COMMAND_STAGE_ASPECT_RATIO;
  const fittedWidth = Math.min(availableWidth, widthFromHeight);

  return {
    width: fittedWidth,
    height: fittedWidth / ATTITUDE_COMMAND_STAGE_ASPECT_RATIO,
  };
}

function getBackdropSource(backdropSrc: string): ImageSourcePropType {
  return { uri: backdropSrc };
}

function formatDegreesForAccessibility(valueDeg: number): string {
  return formatSignedDegrees(valueDeg).replace('°', ' degrees');
}

function formatTitleForAccessibility(title: string): string {
  return title === 'ATTITUDE COMMAND' ? 'Attitude Command' : title;
}

function AttitudeCommandWidget({
  backdropSrc,
  backdropSource,
  pitchDeg,
  rollDeg,
  title = 'ATTITUDE COMMAND',
  activeVehicleName,
  className,
  isFallbackBackdrop = false,
  style,
}: AttitudeCommandWidgetProps) {
  void className;

  const [bounds, setBounds] = useState<AttitudeCommandStageBounds | null>(null);
  const accessibilityVehicle = activeVehicleName ? ` for ${activeVehicleName}` : '';
  const fallbackLabel = isFallbackBackdrop ? ' Fallback vehicle backdrop in use.' : '';
  const pitchAccessibility = formatDegreesForAccessibility(pitchDeg);
  const rollAccessibility = formatDegreesForAccessibility(rollDeg);
  const accessibleTitle = formatTitleForAccessibility(title);
  const containedStageSize = getContainedAttitudeCommandStageSize(bounds);
  const dialSize = containedStageSize
    ? Math.max(82, Math.min(containedStageSize.width * 0.31, containedStageSize.height * 0.42))
    : 118;

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBounds((previous) => {
      if (
        previous &&
        Math.abs(previous.width - width) < 1 &&
        Math.abs((previous.height ?? 0) - height) < 1
      ) {
        return previous;
      }

      return { width, height };
    });
  };

  return (
    <View
      testID="attitude-command-widget"
      accessibilityRole="summary"
      accessibilityLabel={`${accessibleTitle}${accessibilityVehicle}: pitch ${pitchAccessibility}, roll ${rollAccessibility}.${fallbackLabel}`}
      style={[styles.shell, style]}
      onLayout={handleLayout}
    >
      <View
        testID="attitude-command-stage"
        pointerEvents="none"
        style={[
          styles.stage,
          containedStageSize
            ? {
              width: containedStageSize.width,
              height: containedStageSize.height,
            }
            : null,
        ]}
      >
        <Image
          testID="attitude-command-backdrop"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          source={backdropSource ?? getBackdropSource(backdropSrc)}
          resizeMode="contain"
          fadeDuration={0}
          style={styles.backdrop}
        />

        <View
          testID="attitude-command-pitch-gauge-slot"
          style={[
            styles.overlaySlot,
            styles.pitchGaugeSlot,
            {
              width: dialSize,
              height: dialSize,
            },
          ]}
        >
          <AttitudeDial
            label="PITCH"
            valueDeg={pitchDeg}
            size={dialSize}
            ecsGold={TACTICAL.amber}
            testID="attitude-command-pitch-dial-meter"
          />
        </View>
        <View
          testID="attitude-command-roll-gauge-slot"
          style={[
            styles.overlaySlot,
            styles.rollGaugeSlot,
            {
              width: dialSize,
              height: dialSize,
            },
          ]}
        >
          <AttitudeDial
            label="ROLL"
            valueDeg={rollDeg}
            size={dialSize}
            ecsGold={TACTICAL.amber}
            testID="attitude-command-roll-dial-meter"
          />
        </View>
      </View>
    </View>
  );
}

export default React.memo(AttitudeCommandWidget);

const styles = StyleSheet.create({
  shell: {
    flexShrink: 1,
    minWidth: 0,
    minHeight: 0,
    width: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stage: {
    position: 'relative',
    width: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
    aspectRatio: ATTITUDE_COMMAND_STAGE_ASPECT_RATIO,
    flexShrink: 1,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: TACTICAL.bg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  overlaySlot: {
    position: 'absolute',
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pitchGaugeSlot: {
    left: '8%',
    top: '17%',
  },
  rollGaugeSlot: {
    left: '53%',
    top: '17%',
  },
});

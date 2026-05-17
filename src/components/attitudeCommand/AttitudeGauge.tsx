import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { TACTICAL } from '../../../lib/theme';
import {
  GAUGE_INDICATOR_SRC,
  GAUGE_TICKS_SRC,
} from '../../features/attitude/attitudeGaugeAssets';
import {
  DEFAULT_ATTITUDE_GAUGE_MAX_DEG,
  DEFAULT_ATTITUDE_GAUGE_MIN_DEG,
  DEFAULT_ATTITUDE_GAUGE_MAX_VISUAL_ROTATION_DEG,
  mapAngleToNeedleRotation,
} from './attitudeGaugeUtils';

export type AttitudeGaugeProps = {
  valueDeg: number;
  label: 'PITCH' | 'ROLL' | string;
  minDeg?: number;
  maxDeg?: number;
  showLabel?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
};

const GAUGE_ASPECT_RATIO = 1316 / 422;
const NEEDLE_WIDTH_RATIO = 42 / 650;
const NEEDLE_HEIGHT_RATIO = 226 / 208;
const NEEDLE_PIVOT_Y_RATIO = 1.18;

function getGaugeTestIdBase(label: string): string {
  const normalizedLabel = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `vehicle-attitude-${normalizedLabel || 'axis'}-gauge`;
}

function AttitudeGauge({
  valueDeg,
  label,
  minDeg = DEFAULT_ATTITUDE_GAUGE_MIN_DEG,
  maxDeg = DEFAULT_ATTITUDE_GAUGE_MAX_DEG,
  showLabel = true,
  className,
  style,
}: AttitudeGaugeProps) {
  void className;

  const rotationDeg = mapAngleToNeedleRotation(
    valueDeg,
    minDeg,
    maxDeg,
    DEFAULT_ATTITUDE_GAUGE_MAX_VISUAL_ROTATION_DEG,
  );
  const testIdBase = getGaugeTestIdBase(label);

  return (
    <View
      testID={testIdBase}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.gauge, style]}
    >
      {showLabel ? (
        <Text
          testID={`${testIdBase}-label`}
          accessibilityRole="header"
          style={styles.gaugeLabel}
          numberOfLines={1}
        >
          {label}
        </Text>
      ) : null}

      <Image
        testID={`${testIdBase}-ticks`}
        source={GAUGE_TICKS_SRC}
        resizeMode="contain"
        fadeDuration={0}
        style={styles.gaugeImage}
      />
      <View
        testID={`${testIdBase}-indicator-pivot`}
        pointerEvents="none"
        style={[
          styles.gaugeIndicatorPivot,
          {
            transform: [{ rotate: `${rotationDeg}deg` }],
          },
        ]}
      >
        <Image
          testID={`${testIdBase}-indicator`}
          source={GAUGE_INDICATOR_SRC}
          resizeMode="contain"
          fadeDuration={0}
          style={styles.gaugeIndicatorImage}
        />
      </View>
    </View>
  );
}

export default React.memo(AttitudeGauge);

const styles = StyleSheet.create({
  gauge: {
    position: 'relative',
    width: '100%',
    aspectRatio: GAUGE_ASPECT_RATIO,
    overflow: 'visible',
    alignItems: 'center',
  },
  gaugeImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  gaugeLabel: {
    position: 'absolute',
    top: '-14%',
    alignSelf: 'center',
    color: TACTICAL.amber,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    letterSpacing: 1.6,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.78)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 7,
  },
  gaugeIndicatorPivot: {
    position: 'absolute',
    left: `${50 - (NEEDLE_WIDTH_RATIO * 100) / 2}%`,
    top: `${(NEEDLE_PIVOT_Y_RATIO - NEEDLE_HEIGHT_RATIO) * 100}%`,
    width: `${NEEDLE_WIDTH_RATIO * 100}%`,
    height: `${NEEDLE_HEIGHT_RATIO * 200}%`,
    overflow: 'visible',
    alignItems: 'center',
  },
  gaugeIndicatorImage: {
    position: 'absolute',
    top: 0,
    width: '100%',
    height: '50%',
  },
});

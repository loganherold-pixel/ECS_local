import React, { useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  G,
  Line,
  Path,
} from 'react-native-svg';
import { getAttitudeDialMagnitudeColor } from '../attitudeDialColor';

export type AttitudeDialLabel = 'ROLL' | 'PITCH';

export type AttitudeDialProps = {
  label: AttitudeDialLabel;
  valueDeg: number;
  minDeg?: number;
  maxDeg?: number;
  size: number;
  ecsGold: string;
  warningThresholdDeg?: number;
  criticalThresholdDeg?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

type Tick = {
  key: string;
  active: boolean;
  major: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

const DEFAULT_MIN_DEG = -45;
const DEFAULT_MAX_DEG = 45;
const ARC_START_DEG = -45;
const ARC_SWEEP_DEG = 270;
const TICK_STEP_DEG = 5;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizeRange(minDeg: number, maxDeg: number) {
  if (minDeg === maxDeg) {
    return { min: DEFAULT_MIN_DEG, max: DEFAULT_MAX_DEG };
  }
  return minDeg < maxDeg
    ? { min: minDeg, max: maxDeg }
    : { min: maxDeg, max: minDeg };
}

function degreeToDialAngle(value: number, minDeg: number, maxDeg: number) {
  const ratio = (value - minDeg) / (maxDeg - minDeg);
  return ARC_START_DEG + ratio * ARC_SWEEP_DEG;
}

function polarPoint(center: number, radius: number, angleDeg: number) {
  const angleRad = (angleDeg - 90) * Math.PI / 180;
  return {
    x: center + Math.cos(angleRad) * radius,
    y: center + Math.sin(angleRad) * radius,
  };
}

function describeArc(center: number, radius: number, startAngle: number, endAngle: number) {
  if (Math.abs(endAngle - startAngle) < 0.5) {
    return '';
  }

  const start = polarPoint(center, radius, startAngle);
  const end = polarPoint(center, radius, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  const sweepFlag = endAngle >= startAngle ? 1 : 0;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius.toFixed(3)} ${radius.toFixed(3)} 0 ${largeArcFlag} ${sweepFlag} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

function formatDialValue(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}\u00b0`;
}

export default function AttitudeDial({
  criticalThresholdDeg,
  ecsGold,
  label,
  maxDeg = DEFAULT_MAX_DEG,
  minDeg = DEFAULT_MIN_DEG,
  size,
  style,
  testID,
  valueDeg,
  warningThresholdDeg,
}: AttitudeDialProps) {
  const dialSize = Math.max(88, size);
  const center = dialSize / 2;
  const outerRadius = dialSize * 0.43;
  const tickOuterRadius = dialSize * 0.43;
  const tickInnerMajorRadius = dialSize * 0.35;
  const tickInnerMinorRadius = dialSize * 0.38;
  const glowRadius = dialSize * 0.365;
  const indicatorRadius = dialSize * 0.49;
  const { min, max } = normalizeRange(minDeg, maxDeg);
  const clampedValue = clamp(valueDeg, min, max);
  const displayValue = Number.isFinite(valueDeg) ? valueDeg : 0;
  const zeroValue = clamp(0, min, max);
  const valueAngle = degreeToDialAngle(clampedValue, min, max);
  const zeroAngle = degreeToDialAngle(zeroValue, min, max);
  void ecsGold;
  const activeColor = getAttitudeDialMagnitudeColor({
    criticalThresholdDeg,
    maxDeg: max,
    minDeg: min,
    valueDeg: clampedValue,
    warningThresholdDeg,
  });
  const animatedAngle = useSharedValue(valueAngle);

  useEffect(() => {
    animatedAngle.value = withTiming(valueAngle, {
      duration: 240,
    });
  }, [animatedAngle, valueAngle]);

  const indicatorAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${animatedAngle.value}deg` }],
  }));

  const ticks = useMemo<Tick[]>(() => {
    const generated: Tick[] = [];
    for (let degree = min; degree <= max + 0.001; degree += TICK_STEP_DEG) {
      const major = Math.abs(degree % 10) < 0.001;
      const angle = degreeToDialAngle(degree, min, max);
      const outer = polarPoint(center, tickOuterRadius, angle);
      const inner = polarPoint(center, major ? tickInnerMajorRadius : tickInnerMinorRadius, angle);
      const lower = Math.min(zeroValue, clampedValue);
      const upper = Math.max(zeroValue, clampedValue);
      generated.push({
        active: degree >= lower - 0.001 && degree <= upper + 0.001,
        key: `${label}-${degree}`,
        major,
        x1: inner.x,
        y1: inner.y,
        x2: outer.x,
        y2: outer.y,
      });
    }
    return generated;
  }, [
    center,
    clampedValue,
    label,
    max,
    min,
    tickInnerMajorRadius,
    tickInnerMinorRadius,
    tickOuterRadius,
    zeroValue,
  ]);

  const glowPath = describeArc(
    center,
    glowRadius,
    Math.min(zeroAngle, valueAngle),
    Math.max(zeroAngle, valueAngle),
  );
  const counterGlowPath = describeArc(
    center,
    glowRadius,
    Math.min(zeroAngle, valueAngle) + 180,
    Math.max(zeroAngle, valueAngle) + 180,
  );
  const indicatorTop = polarPoint(center, indicatorRadius, 0);
  const indicatorBottom = polarPoint(center, indicatorRadius, 180);
  const indicatorWidth = dialSize * 0.046;
  const indicatorHeight = dialSize * 0.05;

  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={[
        styles.shell,
        {
          width: dialSize,
          height: dialSize,
          borderRadius: dialSize / 2,
        },
        style,
      ]}
    >
      <Svg
        width={dialSize}
        height={dialSize}
        viewBox={`0 0 ${dialSize} ${dialSize}`}
        pointerEvents="none"
        testID={testID ? `${testID}-svg` : undefined}
      >
        <Circle
          cx={center}
          cy={center}
          r={outerRadius}
          fill="rgba(4, 8, 10, 0.56)"
          stroke="rgba(232, 182, 77, 0.16)"
          strokeWidth={1}
        />
        <Circle
          cx={center}
          cy={center}
          r={dialSize * 0.29}
          fill="rgba(0, 0, 0, 0.16)"
          stroke="rgba(255, 255, 255, 0.035)"
          strokeWidth={1}
        />
        {glowPath ? (
          <Path
            d={glowPath}
            fill="none"
            stroke={activeColor}
            strokeOpacity={0.24}
            strokeWidth={dialSize * 0.05}
            strokeLinecap="round"
          />
        ) : null}
        {counterGlowPath ? (
          <Path
            d={counterGlowPath}
            fill="none"
            stroke={activeColor}
            strokeOpacity={0.2}
            strokeWidth={dialSize * 0.05}
            strokeLinecap="round"
          />
        ) : null}
        {glowPath ? (
          <Path
            d={glowPath}
            fill="none"
            stroke={activeColor}
            strokeOpacity={0.74}
            strokeWidth={dialSize * 0.018}
            strokeLinecap="round"
          />
        ) : null}
        {counterGlowPath ? (
          <Path
            d={counterGlowPath}
            fill="none"
            stroke={activeColor}
            strokeOpacity={0.58}
            strokeWidth={dialSize * 0.016}
            strokeLinecap="round"
          />
        ) : null}
        <G>
          {ticks.map((tick) => (
            <Line
              key={tick.key}
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
              stroke={tick.active ? activeColor : 'rgba(179, 164, 122, 0.34)'}
              strokeOpacity={tick.active ? 0.98 : 0.78}
              strokeWidth={tick.major ? dialSize * 0.012 : dialSize * 0.007}
              strokeLinecap="round"
            />
          ))}
        </G>
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[styles.indicatorLayer, indicatorAnimatedStyle]}
      >
        <Svg
          width={dialSize}
          height={dialSize}
          viewBox={`0 0 ${dialSize} ${dialSize}`}
          pointerEvents="none"
        >
          <Path
            d={[
              `M ${center.toFixed(3)} ${(indicatorTop.y - indicatorHeight).toFixed(3)}`,
              `L ${(center - indicatorWidth).toFixed(3)} ${(indicatorTop.y + indicatorHeight * 0.42).toFixed(3)}`,
              `L ${(center + indicatorWidth).toFixed(3)} ${(indicatorTop.y + indicatorHeight * 0.42).toFixed(3)}`,
              'Z',
            ].join(' ')}
            fill={activeColor}
            opacity={0.9}
          />
          <Path
            d={[
              `M ${center.toFixed(3)} ${(indicatorBottom.y + indicatorHeight).toFixed(3)}`,
              `L ${(center - indicatorWidth).toFixed(3)} ${(indicatorBottom.y - indicatorHeight * 0.42).toFixed(3)}`,
              `L ${(center + indicatorWidth).toFixed(3)} ${(indicatorBottom.y - indicatorHeight * 0.42).toFixed(3)}`,
              'Z',
            ].join(' ')}
            fill={activeColor}
            opacity={0.9}
          />
        </Svg>
      </Animated.View>
      <View
        testID={testID ? `${testID}-center-readout` : undefined}
        pointerEvents="none"
        style={styles.centerReadout}
      >
        <Text
          style={[
            styles.label,
            {
              color: 'rgba(233, 222, 189, 0.82)',
              fontSize: Math.max(10, dialSize * 0.07),
              lineHeight: Math.max(12, dialSize * 0.082),
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          testID={testID ? `${testID}-degree-readout` : undefined}
          style={[
            styles.value,
            {
              color: activeColor,
              fontSize: Math.max(22, dialSize * 0.19),
              lineHeight: Math.max(26, dialSize * 0.215),
              textShadowColor: activeColor,
            },
          ]}
          numberOfLines={1}
        >
          {formatDialValue(displayValue)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    backgroundColor: 'rgba(4, 7, 8, 0.38)',
  },
  centerReadout: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
  },
  indicatorLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  label: {
    fontWeight: '900',
    letterSpacing: 0.9,
    textAlign: 'center',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.72)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 7,
  },
  value: {
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 9,
  },
});

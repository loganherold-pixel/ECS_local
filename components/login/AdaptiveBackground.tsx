import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View, type DimensionValue } from 'react-native';
import { useReducedMotion } from '../../lib/ecsAnimations';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type TimePeriod = 'night' | 'dawn' | 'day' | 'dusk';

function getTimePeriod(): TimePeriod {
  const hour = new Date().getHours();
  if (hour >= 20 || hour < 6) return 'night';
  if (hour >= 6 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 17) return 'day';
  return 'dusk';
}

interface TimeTheme {
  baseBg: string;
  gridOpacity: number;
  contourOpacity: number;
  vignetteOpacity: number;
  warmGlowOpacity: number;
  warmGlowColor: string;
}

type PercentDimension = `${number}%`;
type PositionedLine = {
  top: PercentDimension;
  left: PercentDimension;
  width: PercentDimension;
};

const THEMES: Record<TimePeriod, TimeTheme> = {
  night: {
    baseBg: '#0B0E12',
    gridOpacity: 0.04,
    contourOpacity: 0.08,
    vignetteOpacity: 0.42,
    warmGlowOpacity: 0,
    warmGlowColor: '#1B1510',
  },
  dawn: {
    baseBg: '#0B0E12',
    gridOpacity: 0.045,
    contourOpacity: 0.09,
    vignetteOpacity: 0.38,
    warmGlowOpacity: 0.06,
    warmGlowColor: '#3D2914',
  },
  day: {
    baseBg: '#0B0E12',
    gridOpacity: 0.04,
    contourOpacity: 0.075,
    vignetteOpacity: 0.36,
    warmGlowOpacity: 0.02,
    warmGlowColor: '#2A1F14',
  },
  dusk: {
    baseBg: '#0B0E12',
    gridOpacity: 0.045,
    contourOpacity: 0.085,
    vignetteOpacity: 0.4,
    warmGlowOpacity: 0.05,
    warmGlowColor: '#3A2713',
  },
};

const GRID_LINES: PositionedLine[] = Array.from({ length: 9 }).map((_, index) => ({
  top: `${10 + index * 10}%`,
  left: `${-4 + (index % 2) * 2}%`,
  width: `${108 - (index % 3) * 8}%`,
}));

const CONTOUR_LINES: (PositionedLine & { rotate: `${number}deg` })[] = Array.from({ length: 11 }).map((_, index) => ({
  top: `${8 + index * 8}%`,
  left: `${4 + (index % 4) * 5}%`,
  width: `${62 + (index % 5) * 7}%`,
  rotate: `${-5 + (index % 6) * 1.8}deg`,
}));

interface Props {
  children: React.ReactNode;
}

function AdaptiveBackground({ children }: Props) {
  const theme = useMemo(() => THEMES[getTimePeriod()], []);
  const reducedMotion = useReducedMotion();
  const driftX = useRef(new Animated.Value(0)).current;
  const driftY = useRef(new Animated.Value(0)).current;
  const contourPulse = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (reducedMotion) {
      driftX.setValue(0);
      driftY.setValue(0);
      contourPulse.setValue(0.92);
      return;
    }

    const drift = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(driftX, {
            toValue: 3,
            duration: 22000,
            useNativeDriver: true,
          }),
          Animated.timing(driftX, {
            toValue: -3,
            duration: 22000,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(driftY, {
            toValue: 2,
            duration: 26000,
            useNativeDriver: true,
          }),
          Animated.timing(driftY, {
            toValue: -2,
            duration: 26000,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(contourPulse, {
          toValue: 1,
          duration: 7000,
          useNativeDriver: true,
        }),
        Animated.timing(contourPulse, {
          toValue: 0.88,
          duration: 7000,
          useNativeDriver: true,
        }),
      ]),
    );

    drift.start();
    pulse.start();

    return () => {
      drift.stop();
      pulse.stop();
    };
  }, [contourPulse, driftX, driftY, reducedMotion]);

  return (
    <View style={[styles.container, { backgroundColor: theme.baseBg }]}>
      <View style={[styles.softVerticalShade, styles.topShade]} pointerEvents="none" />
      <View style={[styles.softVerticalShade, styles.bottomShade]} pointerEvents="none" />
      <View
        style={[
          styles.centerGlow,
          {
            backgroundColor: theme.warmGlowColor,
            opacity: theme.warmGlowOpacity,
          },
        ]}
        pointerEvents="none"
      />

      <View style={[styles.gridLayer, { opacity: theme.gridOpacity }]} pointerEvents="none">
        {GRID_LINES.map((line, index) => (
          <View
            key={`grid-${index}`}
            style={[
              styles.gridLine,
              {
                top: line.top,
                left: line.left,
                width: line.width as DimensionValue,
              },
            ]}
          />
        ))}
      </View>

      <Animated.View
        style={[
          styles.contourLayer,
          {
            opacity: contourPulse,
            transform: [{ translateX: driftX }, { translateY: driftY }],
          },
        ]}
        pointerEvents="none"
      >
        {CONTOUR_LINES.map((line, index) => (
          <View
            key={`contour-${index}`}
            style={[
              styles.contourLine,
              {
                top: line.top,
                left: line.left,
                width: line.width as DimensionValue,
                opacity: theme.contourOpacity - (index % 4) * 0.01,
                transform: [{ rotate: line.rotate }],
              },
            ]}
          />
        ))}
      </Animated.View>

      <View
        style={[
          styles.vignette,
          {
            opacity: theme.vignetteOpacity,
          },
        ]}
        pointerEvents="none"
      />

      <View style={styles.contentLayer}>{children}</View>
    </View>
  );
}

export default memo(AdaptiveBackground);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  softVerticalShade: {
    position: 'absolute',
    left: -40,
    right: -40,
    height: SCREEN_H * 0.34,
    backgroundColor: 'rgba(0,0,0,0.18)',
    zIndex: 1,
  },
  topShade: {
    top: -20,
  },
  bottomShade: {
    bottom: -30,
  },
  centerGlow: {
    position: 'absolute',
    top: SCREEN_H * 0.12,
    left: SCREEN_W * 0.12,
    right: SCREEN_W * 0.12,
    height: SCREEN_H * 0.18,
    borderRadius: 999,
    zIndex: 1,
  },
  gridLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  gridLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 999,
  },
  contourLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  contourLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(212,160,23,0.92)',
    borderRadius: 999,
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
    zIndex: 4,
  },
  contentLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
});

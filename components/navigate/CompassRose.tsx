/**
 * CompassRose — Tactical Heading Indicator Overlay
 *
 * Phase 6 Enhancements:
 *   - Recalibration indicator when heading accuracy drops
 *   - Accuracy-based source badge coloring (green/amber/red)
 *   - Tap to re-center map on current GPS location
 *   - Stationary lock indicator (heading frozen when not moving)
 *   - True north always reflected correctly
 *   - Improved heading display with degree symbol
 *
 * Phase 18 — Bottom Offset / Container Override:
 *   - Supports lifting above custom dock/system nav via containerStyle
 *   - Preserves existing ECS compass visuals and behavior
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Animated,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { TACTICAL } from '../../lib/theme';
import { ECS_EASE, ECS_MOTION } from '../../lib/ecsAnimations';
import type { HeadingAccuracy } from '../../lib/useVehicleHeading';

// ── Constants ────────────────────────────────────────────────
const COMPASS_SIZE = 68;
const DIAL_SIZE = 62;
const INNER_SIZE = 34;
const TICK_COUNT = 36; // every 10°
const CARDINAL_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
const RECENTER_HINT_VISIBLE_MS = 3400;
const RECENTER_HINT_FADE_MS = ECS_MOTION.intelBarFadeOut;
let recenterHintSeenThisSession = false;

function getCardinal(degrees: number): string {
  const idx = Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
  return CARDINAL_DIRECTIONS[idx];
}

// ── Accuracy Colors ──────────────────────────────────────────
function getAccuracyColor(accuracy: HeadingAccuracy): string {
  switch (accuracy) {
    case 'high':
      return '#66BB6A';
    case 'medium':
      return TACTICAL.amber;
    case 'low':
      return '#EF5350';
    case 'none':
    default:
      return 'rgba(138,138,133,0.5)';
  }
}


// ── Props ────────────────────────────────────────────────────
interface CompassRoseProps {
  heading?: number | null;
  followUser?: boolean;
  visible?: boolean;
  onPress?: () => void;
  accuracy?: HeadingAccuracy;
  needsRecalibration?: boolean;
  isStationaryLocked?: boolean;
  source?: 'compass' | 'gps' | 'none';
  containerStyle?: StyleProp<ViewStyle>;
  paused?: boolean;
}

const CompassRose = React.memo(function CompassRose({
  heading: externalHeading,
  followUser = false,
  visible = true,
  onPress,
  accuracy = 'medium',
  needsRecalibration = false,
  isStationaryLocked = false,
  source = 'none',
  containerStyle,
  paused = false,
}: CompassRoseProps) {
  const [internalHeading, setInternalHeading] = useState<number | null>(null);
  const [tapHintVisible, setTapHintVisible] = useState(() => !recenterHintSeenThisSession);

  const rotateAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const hintFadeAnim = useRef(new Animated.Value(recenterHintSeenThisSession ? 0 : 1)).current;
  const recalPulseAnim = useRef(new Animated.Value(0)).current;
  const prevHeadingRef = useRef<number>(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const dismissTapHint = useCallback(() => {
    recenterHintSeenThisSession = true;
    Animated.timing(hintFadeAnim, {
      toValue: 0,
      duration: RECENTER_HINT_FADE_MS,
      easing: ECS_EASE.accelerate,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && mountedRef.current) setTapHintVisible(false);
    });
  }, [hintFadeAnim]);

  // ── Fade in/out ────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: visible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible, fadeAnim]);

  useEffect(() => {
    if (paused || isStationaryLocked) {
      hintFadeAnim.setValue(1);
      return undefined;
    }

    if (recenterHintSeenThisSession || !tapHintVisible) {
      hintFadeAnim.setValue(0);
      return undefined;
    }

    const timer = setTimeout(() => {
      dismissTapHint();
    }, RECENTER_HINT_VISIBLE_MS);

    return () => clearTimeout(timer);
  }, [dismissTapHint, hintFadeAnim, isStationaryLocked, paused, tapHintVisible]);

  // ── Recalibration pulse animation ─────────────────────────
  useEffect(() => {
    if (needsRecalibration) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(recalPulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(recalPulseAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }

    recalPulseAnim.setValue(0);
  }, [needsRecalibration, recalPulseAnim]);

  // ── Magnetometer (native only) — only if no external heading ──
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (externalHeading != null) return;

    let subscription: any = null;

    (async () => {
      try {
        const sensorModule = await import('expo-sensors');
        const Mag = sensorModule.Magnetometer;

        const isAvailable = await Mag.isAvailableAsync();
        if (!isAvailable || !mountedRef.current) return;

        Mag.setUpdateInterval(100);

        subscription = Mag.addListener((data: { x: number; y: number; z: number }) => {
          if (!mountedRef.current) return;

          let heading = Math.atan2(data.x, data.y) * (180 / Math.PI);
          heading = ((heading % 360) + 360) % 360;

          setInternalHeading(Math.round(heading));
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      if (subscription) {
        try {
          subscription.remove();
        } catch {}
      }
    };
  }, [externalHeading]);

  // ── GPS heading (web fallback) — only if no external heading ──
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (externalHeading != null) return;
    if (!followUser) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!mountedRef.current) return;
        const { heading: gpsHeading } = pos.coords;
        if (gpsHeading != null && gpsHeading >= 0) {
          setInternalHeading(Math.round(gpsHeading));
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [followUser, externalHeading]);

  const effectiveHeading = externalHeading != null ? externalHeading : internalHeading;

  // ── Smooth rotation animation ─────────────────────────────
  useEffect(() => {
    if (effectiveHeading == null) return;

    const target = -effectiveHeading;
    const prev = prevHeadingRef.current;

    let diff = target - prev;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    const smoothTarget = prev + diff;

    Animated.timing(rotateAnim, {
      toValue: smoothTarget,
      duration: ECS_MOTION.compassRotationDuration,
      easing: ECS_EASE.linear,
      useNativeDriver: true,
    }).start();

    prevHeadingRef.current = smoothTarget;
  }, [effectiveHeading, rotateAnim]);

  const dialRotation = rotateAnim.interpolate({
    inputRange: [-720, 720],
    outputRange: ['-720deg', '720deg'],
  });

  if (!visible) return null;

  const hasHeading = effectiveHeading != null;
  const displayDeg = hasHeading ? effectiveHeading : null;
  const displayCardinal = hasHeading ? getCardinal(effectiveHeading!) : '—';
  const displaySource = source === 'gps' ? 'GPS' : source === 'compass' ? 'MAG' : 'NO FIX';

  const accuracyColor = getAccuracyColor(accuracy);

  const Wrapper = onPress ? TouchableOpacity : View;
  const handlePress = () => {
    if (tapHintVisible) {
      dismissTapHint();
    }
    onPress?.();
  };
  const wrapperProps = onPress
    ? {
        onPress: handlePress,
        activeOpacity: 0.85,
        hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
        accessibilityRole: 'button' as const,
        accessibilityLabel: 'Recenter map on current location',
        accessibilityHint: 'Centers the map on your current GPS location.',
      }
    : {};

  return (
    <Animated.View style={[styles.container, containerStyle, { opacity: fadeAnim }]}>
      <Wrapper
        style={[styles.compassOuter, paused && styles.compassOuterPaused]}
        {...(wrapperProps as any)}
      >
        <View style={styles.outerGlow} />

        {needsRecalibration && (
          <Animated.View
            style={[
              styles.recalibrationRing,
              { opacity: recalPulseAnim },
            ]}
          />
        )}

        <Animated.View
          style={[
            styles.dial,
            { transform: [{ rotate: dialRotation }] },
          ]}
        >
          {Array.from({ length: TICK_COUNT }).map((_, i) => {
            const deg = i * 10;
            const isCardinal = deg % 90 === 0;
            const isIntercardinal = deg % 45 === 0 && !isCardinal;

            return (
              <View
                key={i}
                style={[
                  styles.tickContainer,
                  { transform: [{ rotate: `${deg}deg` }] },
                ]}
              >
                <View
                  style={[
                    styles.tick,
                    isCardinal && styles.tickCardinal,
                    isIntercardinal && styles.tickIntercardinal,
                    deg === 0 && styles.tickNorth,
                  ]}
                />
              </View>
            );
          })}

          <View style={[styles.cardinalLabel, styles.cardinalN]}>
            <Text style={[styles.cardinalText, styles.cardinalTextN]}>N</Text>
          </View>
          <View style={[styles.cardinalLabel, styles.cardinalE]}>
            <Text style={styles.cardinalText}>E</Text>
          </View>
          <View style={[styles.cardinalLabel, styles.cardinalS]}>
            <Text style={styles.cardinalText}>S</Text>
          </View>
          <View style={[styles.cardinalLabel, styles.cardinalW]}>
            <Text style={styles.cardinalText}>W</Text>
          </View>

          <View style={styles.northTriangleContainer}>
            <View style={styles.northTriangle} />
          </View>
        </Animated.View>

        <View style={[styles.centerHub, paused && styles.centerHubPaused]}>
          <Text style={styles.headingDegrees}>
            {displayDeg != null ? `${displayDeg}°` : '—'}
          </Text>
          <Text style={styles.headingCardinal}>{displayCardinal}</Text>
        </View>

        <View style={styles.headingIndicator}>
          <View style={styles.headingLine} />
          <View style={styles.headingDot} />
        </View>

        <Animated.View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no"
          style={[styles.recenterHint, { opacity: hintFadeAnim }]}
        >
          <Text style={styles.recenterHintText}>
            {paused ? 'POWER SAVE' : isStationaryLocked ? 'LOCKED' : 'TAP TO CENTER'}
          </Text>
        </Animated.View>

        {hasHeading && !paused ? (
          <View style={[styles.headingQualityAccent, { backgroundColor: accuracyColor }]} />
        ) : null}

        <View style={styles.headingSourceBadge}>
          <Text style={[styles.headingSourceText, { color: accuracyColor }]}>
            {paused ? 'PAUSED' : displaySource}
          </Text>
        </View>
      </Wrapper>
    </Animated.View>
  );
});

CompassRose.displayName = 'CompassRose';

export default CompassRose;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 56,
    right: 14,
    zIndex: 28,
  },

  compassOuter: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    borderRadius: COMPASS_SIZE / 2,
    backgroundColor: 'rgba(11,15,18,0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(196,138,44,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  },
  compassOuterPaused: {
    borderColor: 'rgba(196,138,44,0.2)',
    backgroundColor: 'rgba(11,15,18,0.82)',
  },

  outerGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: COMPASS_SIZE / 2,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.08)',
    shadowColor: '#C48A2C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 0,
  },

  recalibrationRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: COMPASS_SIZE / 2,
    borderWidth: 2,
    borderColor: '#EF5350',
    backgroundColor: 'transparent',
  },

  dial: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    borderRadius: DIAL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },

  tickContainer: {
    position: 'absolute',
    width: 1,
    height: DIAL_SIZE,
    alignItems: 'center',
    left: DIAL_SIZE / 2 - 0.5,
    top: 0,
  },

  tick: {
    width: 1,
    height: 4,
    backgroundColor: 'rgba(138,138,133,0.25)',
    position: 'absolute',
    top: 1,
  },

  tickCardinal: {
    width: 1.5,
    height: 7,
    backgroundColor: 'rgba(196,138,44,0.6)',
    top: 0,
  },

  tickIntercardinal: {
    width: 1,
    height: 5,
    backgroundColor: 'rgba(138,138,133,0.4)',
    top: 1,
  },

  tickNorth: {
    width: 2,
    height: 8,
    backgroundColor: TACTICAL.amber,
    top: 0,
  },

  cardinalLabel: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardinalN: {
    top: 9,
    left: DIAL_SIZE / 2 - 5,
  },

  cardinalE: {
    right: 7,
    top: DIAL_SIZE / 2 - 5,
  },

  cardinalS: {
    bottom: 9,
    left: DIAL_SIZE / 2 - 4,
  },

  cardinalW: {
    left: 7,
    top: DIAL_SIZE / 2 - 5,
  },

  cardinalText: {
    fontSize: 7,
    fontWeight: '700',
    color: 'rgba(138,138,133,0.6)',
    letterSpacing: 0.5,
  },

  cardinalTextN: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '800',
  },

  northTriangleContainer: {
    position: 'absolute',
    top: 1,
    left: DIAL_SIZE / 2 - 4,
    width: 8,
    height: 6,
    alignItems: 'center',
  },

  northTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: TACTICAL.amber,
  },

  centerHub: {
    width: INNER_SIZE,
    height: INNER_SIZE,
    borderRadius: INNER_SIZE / 2,
    backgroundColor: 'rgba(11,15,18,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  centerHubPaused: {
    borderColor: 'rgba(196,138,44,0.2)',
    backgroundColor: 'rgba(11,15,18,0.88)',
  },

  headingDegrees: {
    display: 'none',
    width: 0,
    height: 0,
    fontSize: 0,
    lineHeight: 0,
    opacity: 0,
  },

  headingCardinal: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.2,
    lineHeight: 13,
    textTransform: 'uppercase',
  },

  headingIndicator: {
    position: 'absolute',
    top: 0,
    left: COMPASS_SIZE / 2 - 3,
    width: 6,
    alignItems: 'center',
    zIndex: 6,
  },

  headingLine: {
    width: 2,
    height: 6,
    backgroundColor: TACTICAL.amber,
    borderRadius: 1,
  },

  headingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: TACTICAL.amber,
    marginTop: -1,
  },

  recenterHint: {
    position: 'absolute',
    top: COMPASS_SIZE + 6,
    alignSelf: 'center',
    minWidth: 64,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: 'rgba(11,15,18,0.56)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },

  recenterHintText: {
    fontSize: 6,
    fontWeight: '800',
    color: 'rgba(214,208,190,0.58)',
    letterSpacing: 0.7,
  },

  headingQualityAccent: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 5,
    height: 5,
    borderRadius: 3,
    zIndex: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 2,
  },
  headingSourceBadge: {
    position: 'absolute',
    bottom: 6,
    alignSelf: 'center',
    minWidth: 28,
    minHeight: 10,
    paddingHorizontal: 4,
    borderRadius: 5,
    backgroundColor: 'rgba(11,15,18,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingSourceText: {
    fontSize: 5.5,
    lineHeight: 7,
    fontWeight: '900',
    letterSpacing: 0.45,
    includeFontPadding: false,
  },
});

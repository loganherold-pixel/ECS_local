/**
 * AnimatedShield — Premium animated wrapper for ECS badge logo.
 *
 * Features:
 *   A) Subtle breathing pulse: scale 1.00 → 1.02 → 1.00, 5s loop
 *   B) Soft gold ambient glow behind the badge
 *   C) One-time highlight sweep on mount: diagonal light catch, 1200ms
 *
 * GPU-friendly: uses only transform + opacity animations.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Image,
} from 'react-native';

const ECS_BADGE_SOURCE = require('../../assets/ecs/nav/ecs-center.png');

interface Props {
  /** Width of the badge image */
  badgeWidth?: number;
  /** Height of the badge image (auto-calculated from aspect if not set) */
  badgeHeight?: number;
  /** Enable pulse/glow/sweep effects */
  animated?: boolean;
}

export default function AnimatedShield({ badgeWidth = 160, badgeHeight, animated = true }: Props) {
  // Badge is roughly square with slight vertical bias (~1.05:1)
  const imgH = badgeHeight || Math.round(badgeWidth * 1.05);

  // ── Breathing pulse ────────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.02,
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 2500,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [animated, pulseAnim]);

  // ── Gold glow pulse (opacity) ──────────────────────────────
  const glowAnim = useRef(new Animated.Value(0.12)).current;

  useEffect(() => {
    if (!animated) return;
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.20,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.12,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    );
    glow.start();
    return () => glow.stop();
  }, [animated, glowAnim]);

  // ── One-time highlight sweep ───────────────────────────────
  const sweepX = useRef(new Animated.Value(-1)).current;
  const [sweepDone, setSweepDone] = useState(!animated);

  useEffect(() => {
    if (!animated) {
      setSweepDone(true);
      return;
    }
    const timer = setTimeout(() => {
      Animated.timing(sweepX, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }).start(() => {
        setSweepDone(true);
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [animated, sweepX]);

  const containerW = badgeWidth + 16;
  const containerH = imgH + 16;


  return (
    <View style={[styles.container, { width: containerW, height: containerH }]}>
      {/* ── Soft gold ambient glow ──────────────────────────── */}
      <Animated.View
        style={[
          styles.glowRing,
          {
            width: badgeWidth * 0.7,
            height: imgH * 0.7,
            borderRadius: badgeWidth * 0.35,
            opacity: glowAnim,
          },
        ]}
      />

      {/* ── Badge with breathing pulse ─────────────────────── */}
      <Animated.View
        style={[
          styles.shieldWrapper,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <Image
          source={ECS_BADGE_SOURCE}
          style={{
            width: badgeWidth,
            height: imgH,
          }}
          resizeMode="contain"
        />

        {/* ── Highlight sweep (one-time) ────────────────── */}
        {!sweepDone && (
          <View style={[styles.sweepMask, { width: badgeWidth, height: imgH }]}>
            <Animated.View
              style={[
                styles.sweepBeam,
                {
                  height: imgH * 1.5,
                  transform: [
                    {
                      translateX: sweepX.interpolate({
                        inputRange: [-1, 1],
                        outputRange: [-badgeWidth * 0.8, badgeWidth * 1.2],
                      }),
                    },
                    { rotate: '-20deg' },
                  ],
                },
              ]}
            />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    // Pure transparent glow — no solid background that could create a dark box.
    // The glow effect comes only from the shadow on iOS.
    // On Android, elevation is removed to prevent dark rectangular shadows.
    backgroundColor: 'transparent',
    shadowColor: '#C48A2C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.20,
    shadowRadius: 40,
    // NO elevation — Android elevation creates dark rectangular shadows
    // regardless of shadowColor, which was causing the dark box behind the badge.
    elevation: 0,
  },
  shieldWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sweepMask: {
    position: 'absolute',
    overflow: 'hidden',
    top: 0,
    left: 0,
  },
  sweepBeam: {
    position: 'absolute',
    top: -20,
    width: 24,
    backgroundColor: 'rgba(255, 240, 200, 0.18)',
    shadowColor: '#FFE8B0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
});




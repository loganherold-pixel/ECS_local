/**
 * AdaptiveBackground — Cinematic layered background for the ECS login screen.
 *
 * Z-index layer stack:
 *   0  Video layer          (full-screen looping video via VideoBackground)
 *   1  Dark overlay          (single uniform full-screen layer — NO overlap bands)
 *   2  Topographic ambient   (subtle topo image + drawn lines, very low opacity)
 *   3  Content / Login UI    (children — rendered above all layers)
 *
 * IMPORTANT — Uniform overlay:
 *   The dark overlay is a SINGLE full-screen View with uniform opacity.
 *   Previous implementation used two overlapping panels (top 50% + bottom 55%)
 *   which created a visible darker band in the overlap zone (45–55% of screen).
 *   This has been replaced with a single uniform layer to ensure consistent
 *   darkness across the entire screen.
 *
 * Stability rules:
 *   - Video is NOT inside a scroll container
 *   - Does NOT re-render during auth state changes (memo + stable refs)
 *   - Does NOT dynamically resize on window change
 *   - Overlay is pointer-events: none
 *
 * Time-aware theming adapts overlay intensity:
 *   Night  (8pm–5:59am)  — deeper overlay, dimmer topo
 *   Dawn   (6am–8:59am)  — warm glow, slightly brighter topo
 *   Day    (9am–4:59pm)  — neutral dark base
 *   Dusk   (5pm–7:59pm)  — amber tint, warm-to-dark
 */
import React, { useEffect, useRef, useMemo, memo } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import VideoBackground from './VideoBackground';

const TOPO_IMAGE =
  'https://d64gsuwffb70l.cloudfront.net/6996be90738429204d7b8809_1771546206665_9e4a0d84.jpg';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Time period detection ──────────────────────────────────────
type TimePeriod = 'night' | 'dawn' | 'day' | 'dusk';

function getTimePeriod(): TimePeriod {
  const h = new Date().getHours();
  if (h >= 20 || h < 6) return 'night';
  if (h >= 6 && h < 9) return 'dawn';
  if (h >= 9 && h < 17) return 'day';
  return 'dusk'; // 17–19
}

// ── Theme configs per time period ──────────────────────────────
// Single uniform overlay alpha replaces the old top/bottom split.
// Value is the average of the previous top + bottom alphas.
interface TimeTheme {
  baseBg: string;
  topoOpacity: number;
  /** Single uniform overlay alpha — applied to the entire screen */
  overlayAlpha: number;
  warmGlowColor: string;
  warmGlowOpacity: number;
}

const TIME_THEMES: Record<TimePeriod, TimeTheme> = {
  night: {
    baseBg: '#06090C',
    topoOpacity: 0.05,
    overlayAlpha: 0.55,
    warmGlowColor: '#1A1510',
    warmGlowOpacity: 0,
  },
  dawn: {
    baseBg: '#0B0F12',
    topoOpacity: 0.07,
    overlayAlpha: 0.50,
    warmGlowColor: '#3D2810',
    warmGlowOpacity: 0.06,
  },
  day: {
    baseBg: '#0B0F12',
    topoOpacity: 0.06,
    overlayAlpha: 0.53,
    warmGlowColor: '#1A1510',
    warmGlowOpacity: 0,
  },
  dusk: {
    baseBg: '#0D0E10',
    topoOpacity: 0.06,
    overlayAlpha: 0.51,
    warmGlowColor: '#3D2810',
    warmGlowOpacity: 0.05,
  },
};

// ── Dark Overlay Layer (z-index 1) ─────────────────────────────
// Single uniform full-screen overlay — no overlapping panels.
const DarkOverlay = memo(function DarkOverlay({
  alpha,
}: {
  alpha: number;
}) {
  const isWeb = Platform.OS === 'web';

  if (isWeb) {
    return (
      <View
        style={[
          styles.overlayUniform,
          {
            backgroundColor: `rgba(0,0,0,${alpha})`,
          },
        ]}
        pointerEvents="none"
      />
    );
  }

  // Native: single uniform panel — no overlap, no banding
  return (
    <View
      style={[
        styles.overlayUniform,
        { backgroundColor: `rgba(0,0,0,${alpha})` },
      ]}
      pointerEvents="none"
    />
  );
});

// ── Main component ─────────────────────────────────────────────
interface Props {
  children: React.ReactNode;
}

function AdaptiveBackground({ children }: Props) {
  const period = useMemo(() => getTimePeriod(), []);
  const theme = TIME_THEMES[period];

  // ── Parallax drift animation (topo layer) ─────────────────
  const driftX = useRef(new Animated.Value(0)).current;
  const driftY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const xLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(driftX, {
          toValue: 5,
          duration: 18000,
          useNativeDriver: true,
        }),
        Animated.timing(driftX, {
          toValue: -5,
          duration: 18000,
          useNativeDriver: true,
        }),
      ])
    );

    const yLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(driftY, {
          toValue: 3,
          duration: 22000,
          useNativeDriver: true,
        }),
        Animated.timing(driftY, {
          toValue: -3,
          duration: 22000,
          useNativeDriver: true,
        }),
      ])
    );

    xLoop.start();
    yLoop.start();

    return () => {
      xLoop.stop();
      yLoop.stop();
    };
  }, [driftX, driftY]);

  // ── Subtle topo line opacity pulse (16s cycle) ────────────
  const topoLinesPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(topoLinesPulse, {
          toValue: 0.5,
          duration: 8000,
          useNativeDriver: true,
        }),
        Animated.timing(topoLinesPulse, {
          toValue: 1,
          duration: 8000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [topoLinesPulse]);

  return (
    <View style={[styles.container, { backgroundColor: theme.baseBg }]}>

      {/* ═══════════════════════════════════════════════════════
          LAYER 0 — Video (full-screen, behind everything)
          Now renders on BOTH web and native (expo-av on native).
          Includes branded fallback image for loading/error states.
          ═══════════════════════════════════════════════════════ */}
      <VideoBackground />

      {/* ═══════════════════════════════════════════════════════
          LAYER 1 — Dark overlay (UNIFORM — single full-screen layer)
          No overlapping panels. No banding. Consistent darkness
          across the entire screen from top to bottom.
          ═══════════════════════════════════════════════════════ */}
      <DarkOverlay alpha={theme.overlayAlpha} />

      {/* ═══════════════════════════════════════════════════════
          LAYER 2 — Topographic ambient (subtle, very low opacity)
          ═══════════════════════════════════════════════════════ */}
      <Animated.View
        style={[
          styles.topoLayer,
          {
            transform: [
              { translateX: driftX },
              { translateY: driftY },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <Image
          source={{ uri: TOPO_IMAGE }}
          style={[styles.topoImage, { opacity: theme.topoOpacity }]}
          contentFit="cover"
        />
      </Animated.View>

      {/* Warm glow (dawn/dusk only) */}
      {theme.warmGlowOpacity > 0 && (
        <View
          style={[
            styles.warmGlow,
            {
              backgroundColor: theme.warmGlowColor,
              opacity: theme.warmGlowOpacity,
            },
          ]}
          pointerEvents="none"
        />
      )}

      {/* Subtle animated topo line overlay */}
      <Animated.View
        style={[styles.topoLinesContainer, { opacity: topoLinesPulse }]}
        pointerEvents="none"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.topoLineDrawn,
              {
                top: `${12 + i * 11}%`,
                left: `${5 + (i % 3) * 8}%`,
                width: `${55 + (i % 4) * 10}%`,
                opacity: theme.topoOpacity * 0.35,
                transform: [{ rotate: `${-3 + (i % 5) * 1.5}deg` }],
              },
            ]}
          />
        ))}
      </Animated.View>

      {/* ═══════════════════════════════════════════════════════
          LAYER 3 — Content (Login UI)
          ═══════════════════════════════════════════════════════ */}
      <View style={styles.contentLayer}>
        {children}
      </View>
    </View>
  );
}

export default memo(AdaptiveBackground);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Layer 1: Dark overlay (uniform, full-screen) ─────────────
  overlayUniform: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },

  // ── Layer 2: Topo ambient ────────────────────────────────────
  topoLayer: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    zIndex: 2,
  },
  topoImage: {
    width: SCREEN_W + 20,
    height: SCREEN_H + 20,
  },
  warmGlow: {
    position: 'absolute',
    top: '15%',
    left: '10%',
    right: '10%',
    height: '20%',
    borderRadius: 100,
    zIndex: 2,
  },
  topoLinesContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 2,
  },
  topoLineDrawn: {
    position: 'absolute',
    height: 0.5,
    backgroundColor: 'rgba(180, 140, 50, 0.06)',
    borderRadius: 10,
  },

  // ── Layer 3: Content ─────────────────────────────────────────
  contentLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
});




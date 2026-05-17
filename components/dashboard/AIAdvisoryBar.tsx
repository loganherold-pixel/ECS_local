/**
 * AIAdvisoryBar — Tactical AI Advisory Strip
 * ─────────────────────────────────────────────────────────────
 * Fixed-height horizontal container that surfaces short, important,
 * readable system messages in a calm and premium way.
 *
 * Placement: Above dashboard widget containers, below header.
 *
 * Three modes:
 *   ALERT    — Red/amber accent, safety-critical
 *   ADVISORY — Gold accent, informational
 *   STANDBY  — Muted, neutral reassurance
 *
 * Animation:
 *   • 300ms fade-in
 *   • 300ms fade-out
 *   • No sliding, bouncing, or ticker effects
 *
 * The bar always reserves the same height whether or not
 * a message is displayed.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { useTheme } from '../../context/ThemeContext';
import {
  advisoryStore,
  type AdvisoryState,
  type AdvisoryMode,
} from '../../lib/advisoryStore';
import { useStableAnimatedValue } from '../../lib/ecsAnimations';

// ── Bar Height ───────────────────────────────────────────────
// Fixed height that never changes — prevents layout shift.
const BAR_HEIGHT = 44;

// ── Fade Durations ───────────────────────────────────────────
const FADE_IN_MS = 300;
const FADE_OUT_MS = 300;

// ── Mode Color Palette ───────────────────────────────────────
const MODE_COLORS: Record<AdvisoryMode, {
  bg: string;
  border: string;
  text: string;
  icon: string;
  indicator: string;
  label: string;
}> = {
  alert: {
    bg: 'rgba(192, 57, 43, 0.08)',
    border: 'rgba(192, 57, 43, 0.25)',
    text: '#E8A09A',
    icon: '#E05A4F',
    indicator: '#E05A4F',
    label: 'ALERT',
  },
  advisory: {
    bg: 'rgba(212, 160, 23, 0.06)',
    border: 'rgba(212, 160, 23, 0.18)',
    text: '#D4C8A0',
    icon: '#D4A017',
    indicator: '#D4A017',
    label: 'ADVISORY',
  },
  standby: {
    bg: 'rgba(139, 148, 158, 0.04)',
    border: 'rgba(139, 148, 158, 0.10)',
    text: '#8B949E',
    icon: '#6B7580',
    indicator: '#6B7580',
    label: 'STANDBY',
  },
};

interface AIAdvisoryBarProps {
  /** Whether the bar is visible (feature toggle) */
  enabled?: boolean;
}

export default function AIAdvisoryBar({ enabled = true }: AIAdvisoryBarProps) {
  const { palette, drivingOverrides } = useTheme();
  const [state, setState] = useState<AdvisoryState>(advisoryStore.getState());
  const fadeAnim = useStableAnimatedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const visible = !!state.current && state.isVisible;
  const currentMessageId = state.current?.id ?? null;

  // ── Reduced Motion ─────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') {
      AccessibilityInfo.isReduceMotionEnabled?.()?.then?.(setReduceMotion);
    }
  }, []);

  // ── Subscribe to advisory store ────────────────────────
  useEffect(() => {
    const unsubscribe = advisoryStore.subscribe((newState) => {
      setState((current) => (
        current.current?.id === newState.current?.id &&
        current.isVisible === newState.isVisible &&
        current.enabled === newState.enabled &&
        current.simplifiedMode === newState.simplifiedMode
          ? current
          : newState
      ));
    });
    return unsubscribe;
  }, []);

  // ── Animate fade based on visibility state ─────────────
  useEffect(() => {
    fadeAnim.stopAnimation();
    if (!currentMessageId) {
      // No message — ensure faded out
      if (reduceMotion || drivingOverrides.disableAnimations) {
        fadeAnim.setValue(0);
      } else {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: FADE_OUT_MS,
          useNativeDriver: true,
        }).start();
      }
      return;
    }

    if (visible) {
      // Fade in
      if (reduceMotion || drivingOverrides.disableAnimations) {
        fadeAnim.setValue(1);
      } else {
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: FADE_IN_MS,
          useNativeDriver: true,
        }).start();
      }
    } else {
      // Fade out
      if (reduceMotion || drivingOverrides.disableAnimations) {
        fadeAnim.setValue(0);
      } else {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: FADE_OUT_MS,
          useNativeDriver: true,
        }).start();
      }
    }
  }, [currentMessageId, visible, reduceMotion, drivingOverrides.disableAnimations, fadeAnim]);

  // ── Don't render if feature is disabled ────────────────
  if (!enabled || !state.enabled) {
    return <View style={styles.reservedSpace} />;
  }

  const message = state.current;
  const mode: AdvisoryMode = message?.mode ?? 'standby';
  const colors = MODE_COLORS[mode];

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.bar,
          {
            backgroundColor: colors.bg,
            borderColor: colors.border,
            opacity: fadeAnim,
          },
        ]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={message ? `${colors.label}: ${message.text}` : 'No advisories'}
      >
        {message ? (
          <View style={styles.content}>
            {/* ── AI Indicator + Mode Dot ── */}
            <View style={styles.indicatorGroup}>
              <View style={[styles.modeDot, { backgroundColor: colors.indicator }]} />
              <Ionicons
                name={message.icon || 'radio-outline'}
                size={18}
                color={colors.icon}
              />
            </View>

            {/* ── Message Text ── */}
            <Text
              style={[
                styles.messageText,
                { color: colors.text },
              ]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {message.text}
            </Text>

            {/* ── Mode Label ── */}
            <View style={[styles.modeBadge, { borderColor: colors.border }]}>
              <Text style={[styles.modeBadgeText, { color: colors.icon }]}>
                {colors.label}
              </Text>
            </View>
          </View>
        ) : (
          /* ── Empty state: subtle AI indicator ── */
          <View style={styles.emptyContent}>
            <View style={[styles.emptyDot, { backgroundColor: MODE_COLORS.standby.indicator }]} />
            <Ionicons
              name="radio-outline"
              size={14}
              color={MODE_COLORS.standby.icon}
            />
            <Text style={[styles.emptyText, { color: MODE_COLORS.standby.text }]}>
              ECS ADVISORY
            </Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Reserved Space — always same height ────────────────
  reservedSpace: {
    height: BAR_HEIGHT,
  },

  // ── Container — fixed height, no expansion ─────────────
  container: {
    height: BAR_HEIGHT,
    paddingHorizontal: 12,
    paddingVertical: 3,
    justifyContent: 'center',
  },

  // ── Bar — the visual advisory strip ────────────────────
  bar: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 0.75,
    justifyContent: 'center',
    paddingHorizontal: 12,
    overflow: 'hidden',
  },

  // ── Content Layout ─────────────────────────────────────
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // ── AI Indicator Group (dot + icon) ────────────────────
  indicatorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  modeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  // ── Message Text — large, bold, glanceable ─────────────
  messageText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
    lineHeight: 18,
  },

  // ── Mode Badge ─────────────────────────────────────────
  modeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.75,
  },

  modeBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  // ── Empty State ────────────────────────────────────────
  emptyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    opacity: 0.4,
  },

  emptyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  emptyText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
});






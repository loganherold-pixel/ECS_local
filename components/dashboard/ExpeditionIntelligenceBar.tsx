/**
 * ExpeditionIntelligenceBar — Tactical Expedition Intelligence Strip
 * ═══════════════════════════════════════════════════════════════════
 *
 * Fixed-height horizontal container that surfaces short, important,
 * readable expedition advisories in a calm and premium way.
 *
 * Placement: Above dashboard widget containers, below header.
 * This is NOT a chat box or scrolling notification feed.
 * It is a tactical intelligence strip — one message at a time.
 *
 * Three modes:
 *   ALERT    — Red/amber accent, safety-critical
 *   ADVISORY — Gold accent, informational
 *   STANDBY  — Muted, neutral reassurance
 *
 * Animation:
 *   • 300ms fade-in (gentle)
 *   • 300ms fade-out (gentle)
 *   • No sliding, bouncing, or ticker effects
 *
 * The bar always reserves the same height whether or not
 * a message is displayed — no layout shift.
 *
 * Readability / Driving UI:
 *   • Large font size (14px semibold)
 *   • High contrast text
 *   • Clean, glanceable layout
 *   • Minimal visual clutter
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
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
import { DEPTH_SHADOWS } from '../../lib/depthSystem';

// ── Bar Height ───────────────────────────────────────────
// Fixed height that never changes — prevents layout shift.
const BAR_HEIGHT = 48;

// ── Fade Durations ───────────────────────────────────────
const FADE_IN_MS = 300;
const FADE_OUT_MS = 300;

// ── Mode Visual Configurations ───────────────────────────
// Each mode has a distinct visual treatment that is immediately
// recognizable at a glance while maintaining ECS design language.

interface ModeVisual {
  bg: string;
  border: string;
  text: string;
  icon: string;
  indicator: string;
  label: string;
  accent: string;
}

const MODE_VISUALS: Record<AdvisoryMode, ModeVisual> = {
  alert: {
    bg: 'rgba(192, 57, 43, 0.10)',
    border: 'rgba(192, 57, 43, 0.30)',
    text: '#F5B7B1',
    icon: '#E74C3C',
    indicator: '#E74C3C',
    label: 'ALERT',
    accent: '#E74C3C',
  },
  advisory: {
    bg: 'rgba(212, 160, 23, 0.07)',
    border: 'rgba(212, 160, 23, 0.20)',
    text: '#E8D5A0',
    icon: '#D4A017',
    indicator: '#D4A017',
    label: 'ADVISORY',
    accent: '#D4A017',
  },
  standby: {
    bg: 'rgba(139, 148, 158, 0.04)',
    border: 'rgba(139, 148, 158, 0.10)',
    text: '#8B949E',
    icon: '#6B7580',
    indicator: '#555E68',
    label: 'STANDBY',
    accent: '#555E68',
  },
};

// ── Mode Icons ───────────────────────────────────────────
const MODE_ICONS: Record<AdvisoryMode, string> = {
  alert: 'alert-circle',
  advisory: 'radio',
  standby: 'shield-checkmark',
};

interface ExpeditionIntelligenceBarProps {
  enabled?: boolean;
}

export default function ExpeditionIntelligenceBar({ enabled = true }: ExpeditionIntelligenceBarProps) {
  const { drivingOverrides } = useTheme();
  const [state, setState] = useState<AdvisoryState>(advisoryStore.getState());
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  // ── Reduced Motion ─────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') {
      AccessibilityInfo.isReduceMotionEnabled?.()?.then?.(setReduceMotion);
    }
  }, []);

  // ── Subscribe to advisory store ────────────────────────
  useEffect(() => {
    const unsubscribe = advisoryStore.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  // ── Animate fade based on visibility state ─────────────
  useEffect(() => {
    const shouldAnimate = !reduceMotion && !drivingOverrides.disableAnimations;

    if (!state.current) {
      if (shouldAnimate) {
        Animated.timing(fadeAnim, {
          toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true,
        }).start();
      } else {
        fadeAnim.setValue(0);
      }
      return;
    }

    if (state.isVisible) {
      if (shouldAnimate) {
        Animated.timing(fadeAnim, {
          toValue: 1, duration: FADE_IN_MS, useNativeDriver: true,
        }).start();
      } else {
        fadeAnim.setValue(1);
      }
    } else {
      if (shouldAnimate) {
        Animated.timing(fadeAnim, {
          toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true,
        }).start();
      } else {
        fadeAnim.setValue(0);
      }
    }
  }, [state.isVisible, state.current, reduceMotion, drivingOverrides.disableAnimations]);

  // ── Don't render if feature is disabled ────────────────
  if (!enabled || !state.enabled) {
    return <View style={styles.reservedSpace} />;
  }

  const message = state.current;
  const mode: AdvisoryMode = message?.mode ?? 'standby';
  const visual = MODE_VISUALS[mode];

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.bar,
          {
            backgroundColor: visual.bg,
            borderColor: visual.border,
            opacity: fadeAnim,
          },
        ]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          message
            ? `${visual.label}: ${message.text}`
            : 'Expedition Intelligence — no advisories'
        }
      >
        {message ? (
          <View style={styles.content}>
            {/* ── Left Accent Strip — mode identification ── */}
            <View style={[styles.accentStrip, { backgroundColor: visual.accent }]} />

            {/* ── Mode Indicator + Icon ── */}
            <View style={styles.indicatorGroup}>
              <View style={[styles.modeDot, { backgroundColor: visual.indicator }]} />
              <Ionicons
                name={message.icon || MODE_ICONS[mode]}
                size={17}
                color={visual.icon}
              />
            </View>

            {/* ── Message Text — large, bold, glanceable ── */}
            <Text
              style={[styles.messageText, { color: visual.text }]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {message.text}
            </Text>

            {/* ── Mode Badge ── */}
            <View style={[styles.modeBadge, { borderColor: visual.accent + '40' }]}>
              <Text style={[styles.modeBadgeText, { color: visual.accent }]}>
                {visual.label}
              </Text>
            </View>
          </View>
        ) : (
          /* ── Empty state: subtle intelligence indicator ── */
          <View style={styles.emptyContent}>
            <View style={[styles.emptyAccent, { backgroundColor: MODE_VISUALS.standby.accent }]} />
            <View style={[styles.emptyDot, { backgroundColor: MODE_VISUALS.standby.indicator }]} />
            <Ionicons
              name="radio-outline"
              size={13}
              color={MODE_VISUALS.standby.icon}
            />
            <Text style={[styles.emptyText, { color: MODE_VISUALS.standby.text }]}>
              EXPEDITION INTELLIGENCE
            </Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

// ── Depth Level 4 shadow for Intelligence Bar ───────────
const depthShadow4 = DEPTH_SHADOWS[4];

const styles = StyleSheet.create({
  reservedSpace: {
    height: BAR_HEIGHT,
  },

  container: {
    height: BAR_HEIGHT,
    paddingHorizontal: 12,
    paddingVertical: 4,
    justifyContent: 'center',
    // Depth Level 4 — Intelligence bar floats above widgets
    zIndex: 4,
  },

  bar: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 0.75,
    justifyContent: 'center',
    overflow: 'hidden',
    // Adaptive Depth: Level 4 shadow for prominent elevation
    shadowColor: depthShadow4.shadowColor,
    shadowOffset: depthShadow4.shadowOffset,
    shadowOpacity: depthShadow4.shadowOpacity,
    shadowRadius: depthShadow4.shadowRadius,
    elevation: depthShadow4.elevation,
  },

  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    gap: 8,
  },

  accentStrip: {
    width: 3,
    alignSelf: 'stretch',
  },

  indicatorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 6,
  },

  modeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  messageText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
    lineHeight: 19,
  },

  modeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.75,
  },

  modeBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  emptyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    opacity: 0.35,
  },

  emptyAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    opacity: 0.4,
  },

  emptyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  emptyText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2.5,
  },
});





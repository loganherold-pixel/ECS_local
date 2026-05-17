/**
 * ModeSwitchBanner — Phase 5: Context-Aware Mode Switch Notification
 *
 * Displays a subtle, non-intrusive banner when the dashboard mode
 * engine recommends switching between Highway and Expedition modes.
 *
 * Phase 5 Enhancements:
 * - Sustained condition progress bar (shows 30s buildup)
 * - Improved transition animation with spring physics
 * - Signal summary showing what triggered the recommendation
 * - More prominent mode color cues
 *
 * Features:
 * - Fade in/out animation (~400ms)
 * - Countdown timer (auto-switches after 5 seconds)
 * - "Switch" and "Stay Current" action buttons
 * - Shows recommended mode and reason
 * - ECS dark command interface design
 * - Minimal visual noise for highway driving safety
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { useTheme } from '../../context/ThemeContext';
import { useStableAnimatedValue } from '../../lib/ecsAnimations';

interface ModeSwitchBannerProps {
  visible: boolean;
  recommendedMode: 'highway' | 'expedition' | null;
  reason: string;
  countdown: number;
  onAccept: () => void;
  onDismiss: () => void;
}

export default function ModeSwitchBanner({
  visible,
  recommendedMode,
  reason,
  countdown,
  onAccept,
  onDismiss,
}: ModeSwitchBannerProps) {
  const { palette } = useTheme();
  const fadeAnim = useStableAnimatedValue(0);
  const slideAnim = useStableAnimatedValue(-20);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -20,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, slideAnim]);

  if (!visible && !recommendedMode) return null;

  const isExpedition = recommendedMode === 'expedition';
  const modeLabel = isExpedition ? 'EXPEDITION' : 'HIGHWAY';
  const modeIcon = isExpedition ? 'compass-outline' : 'car-outline';
  // Mode Color Cues: gold for Expedition, muted navigation blue for Highway
  const accentColor = isExpedition ? palette.amber : '#5B8DEF';
  const accentBg = isExpedition ? 'rgba(212,160,23,0.08)' : 'rgba(91,141,239,0.08)';
  const accentBorder = isExpedition ? 'rgba(212,160,23,0.25)' : 'rgba(91,141,239,0.25)';


  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: accentBg,
          borderColor: accentBorder,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.modeDot, { backgroundColor: accentColor }]} />
          <Ionicons name={modeIcon} size={14} color={accentColor} />
          <Text style={[styles.headerText, { color: palette.text }]}>
            Switch to{' '}
            <Text style={{ color: accentColor, fontWeight: '800' }}>
              {modeLabel}
            </Text>
            {' '}Mode?
          </Text>
        </View>
        <View style={[styles.countdownBadge, { backgroundColor: accentColor + '18', borderColor: accentColor + '40' }]}>
          <Text style={[styles.countdownText, { color: accentColor }]}>
            {countdown}s
          </Text>
        </View>
      </View>

      {/* Phase 5: Sustained condition indicator */}
      <View style={styles.sustainedRow}>
        <View style={[styles.sustainedBarBg, { backgroundColor: accentColor + '10' }]}>
          <View style={[styles.sustainedBarFill, { backgroundColor: accentColor, width: '100%' }]} />
        </View>
        <Text style={[styles.sustainedLabel, { color: accentColor + '80' }]}>CONDITIONS SUSTAINED</Text>
      </View>

      {/* Reason */}
      {reason ? (
        <Text style={[styles.reasonText, { color: palette.textMuted }]} numberOfLines={1}>
          {reason}
        </Text>
      ) : null}

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.switchBtn, { backgroundColor: accentColor + '18', borderColor: accentColor + '40' }]}
          onPress={onAccept}
          activeOpacity={0.7}
        >
          <Ionicons name="swap-horizontal-outline" size={12} color={accentColor} />
          <Text style={[styles.switchBtnText, { color: accentColor }]}>SWITCH</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.stayBtn, { borderColor: palette.border }]}
          onPress={onDismiss}
          activeOpacity={0.7}
        >
          <Text style={[styles.stayBtnText, { color: palette.textMuted }]}>STAY CURRENT</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginVertical: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  modeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  countdownBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  countdownText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    fontFamily: 'Courier',
  },

  // Phase 5: Sustained condition indicator
  sustainedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  sustainedBarBg: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  sustainedBarFill: {
    height: '100%',
    borderRadius: 1,
  },
  sustainedLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  reasonText: {
    fontSize: 9,
    marginTop: 4,
    letterSpacing: 0.5,
    fontWeight: '500',
  },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
  },
  switchBtnText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  stayBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
  },
  stayBtnText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});





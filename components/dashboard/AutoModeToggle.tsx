/**
 * AutoModeToggle — Phase 5: Dashboard Auto-Switching Indicator
 *
 * Small toggle button positioned near the dog ear tabs that shows
 * whether automatic context-aware dashboard switching is enabled.
 *
 * States:
 * - AUTO ON:  Gold text, subtle gold background — engine is evaluating
 * - AUTO OFF: Muted text, "MANUAL" label — manual override active
 * - COOLDOWN: Muted dot — engine is in post-switch cooldown
 * - SUSTAINING: Pulsing dot — conditions are being sustained toward a switch
 *
 * Phase 5 Enhancements:
 * - Manual override visible indicator ("MANUAL" label when auto is off)
 * - Sustained condition progress indicator (pulsing dot)
 * - Improved visual hierarchy
 *
 * Tapping toggles auto mode on/off via the dashboardModeEngine.
 *
 * Design: Minimal, non-intrusive, ECS command aesthetic.
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { useTheme } from '../../context/ThemeContext';

interface AutoModeToggleProps {
  enabled: boolean;
  inCooldown: boolean;
  isManualOverride?: boolean;
  isSustaining?: boolean;
  onToggle: () => void;
}

export default function AutoModeToggle({
  enabled,
  inCooldown,
  isManualOverride = false,
  isSustaining = false,
  onToggle,
}: AutoModeToggleProps) {
  const { palette } = useTheme();

  const activeColor = palette.amber;
  const inactiveColor = palette.textMuted;
  const manualColor = '#5B8DEF'; // Highway blue for manual override
  const sustainColor = '#4CAF50'; // Green for sustaining

  // Determine visual state
  const isManual = !enabled || isManualOverride;
  const color = isManual ? manualColor : activeColor;
  const label = isManual ? 'MANUAL' : 'AUTO';

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: isManual
            ? (manualColor + '0C')
            : enabled
              ? (activeColor + '0C')
              : 'transparent',
          borderColor: isManual
            ? (manualColor + '25')
            : enabled
              ? (activeColor + '25')
              : palette.border,
        },
      ]}
      onPress={onToggle}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons
        name={isManual ? 'hand-left-outline' : 'sync-outline'}
        size={9}
        color={color}
      />
      <Text style={[styles.label, { color }]}>
        {label}
      </Text>

      {/* Status indicator dot */}
      {enabled && isSustaining && !inCooldown && (
        <View style={[styles.sustainDot, { backgroundColor: sustainColor }]} />
      )}
      {enabled && inCooldown && !isSustaining && (
        <View style={[styles.cooldownDot, { backgroundColor: inactiveColor }]} />
      )}
      {enabled && !inCooldown && !isSustaining && (
        <View style={[styles.activeDot, { backgroundColor: activeColor }]} />
      )}
      {isManual && (
        <View style={[styles.manualDot, { backgroundColor: manualColor }]} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  label: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 2,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  cooldownDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.4,
  },
  sustainDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.8,
  },
  manualDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.6,
  },
});





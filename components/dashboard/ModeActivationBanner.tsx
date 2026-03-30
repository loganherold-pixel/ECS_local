/**
 * ModeActivationBanner — Phase 5: Mode Switch Confirmation
 *
 * Displays a brief, non-intrusive banner when the dashboard mode
 * changes (either automatically or manually).
 *
 * Features:
 * - Fade in/out animation (~300ms)
 * - Auto-dismisses after 3 seconds
 * - Shows "Expedition Mode Active" or "Highway Mode Active"
 * - Mode-specific color accent (gold for Expedition, blue for Highway)
 * - Minimal visual footprint — single line with icon
 * - Tap to dismiss early
 * - ECS dark command interface design
 */

import React, { useEffect, useRef } from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  View,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { useTheme } from '../../context/ThemeContext';

interface ModeActivationBannerProps {
  visible: boolean;
  activatedMode: 'highway' | 'expedition' | null;
  bannerText: string;
  onDismiss: () => void;
}

export default function ModeActivationBanner({
  visible,
  activatedMode,
  bannerText,
  onDismiss,
}: ModeActivationBannerProps) {
  const { palette } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.95,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, scaleAnim]);

  if (!visible && !activatedMode) return null;

  const isExpedition = activatedMode === 'expedition';
  const accentColor = isExpedition ? palette.amber : '#5B8DEF';
  const accentBg = isExpedition ? 'rgba(212,160,23,0.10)' : 'rgba(91,141,239,0.10)';
  const accentBorder = isExpedition ? 'rgba(212,160,23,0.30)' : 'rgba(91,141,239,0.30)';
  const modeIcon = isExpedition ? 'compass-outline' : 'car-outline';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: accentBg,
          borderColor: accentBorder,
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <TouchableOpacity
        style={styles.inner}
        onPress={onDismiss}
        activeOpacity={0.7}
      >
        <View style={[styles.dot, { backgroundColor: accentColor }]} />
        <Ionicons name={modeIcon} size={13} color={accentColor} />
        <Text style={[styles.text, { color: accentColor }]}>
          {bannerText || (isExpedition ? 'Expedition Mode Active' : 'Highway Mode Active')}
        </Text>
        <View style={[styles.indicator, { backgroundColor: accentColor }]} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  text: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  indicator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.5,
  },
});






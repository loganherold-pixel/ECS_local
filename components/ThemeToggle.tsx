/**
 * ThemeToggle — Quick-access appearance mode cycle button
 *
 * Tap: cycles Dark → Light → Driving → Auto → (back)
 * Long-press: opens Appearance settings modal
 *
 * Icons:
 * - Dark: moon-outline
 * - Light: sunny-outline
 * - Driving: car-sport-outline (steering wheel equivalent)
 * - Dynamic: contrast-outline in mode view, green car in eye view
 */
import React, { useRef, useCallback } from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';

import { useTheme } from '../context/ThemeContext';
import type { AppearanceMode } from '../lib/appearanceStore';

interface ThemeToggleProps {
  size?: number;
  onLongPress?: () => void;
  showLabel?: boolean;
  compact?: boolean;
  cycleModes?: readonly AppearanceMode[];
  iconMode?: 'mode' | 'eye';
}

const MODE_CONFIG: Record<AppearanceMode, {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
}> = {
  dark: { icon: 'moon-outline', label: 'DARK', color: '#8A8AFF' },
  light: { icon: 'sunny-outline', label: 'LIGHT', color: '#FFB800' },
  driving: { icon: 'car-sport-outline', label: 'HI-VIS', color: '#E0A030' },
  dynamic: { icon: 'contrast-outline', label: 'DYNAMIC', color: '#4CAF50' },
};

export default function ThemeToggle({
  size = 28,
  onLongPress,
  showLabel = false,
  compact = false,
  cycleModes,
  iconMode = 'mode',
}: ThemeToggleProps) {
  const { appearanceMode, cycleMode, palette, isDriving, isAutoDrivingActive } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const config = MODE_CONFIG[appearanceMode];
  const displayIcon =
    iconMode === 'eye'
      ? appearanceMode === 'dynamic'
        ? 'car-sport-outline'
        : 'eye-outline'
      : config.icon;

  const handlePress = useCallback(() => {
    // Animate press
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1.05, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();

    cycleMode(cycleModes);
  }, [cycleMode, cycleModes, scaleAnim]);

  const btnSize = compact ? size - 4 : size;
  const iconSize = compact ? 13 : 15;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.button,
          {
            width: btnSize,
            height: btnSize,
            borderRadius: btnSize / 2 - 2,
            backgroundColor: palette.panel,
            borderColor: config.color + '50',
          },
          isDriving && styles.buttonDriving,
        ]}
        onPress={handlePress}
        onLongPress={onLongPress}
        delayLongPress={400}
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons
          name={displayIcon}
          size={iconSize}
          color={config.color}
        />
        {isAutoDrivingActive && (
          <View style={[styles.autoDot, { backgroundColor: '#50A050' }]} />
        )}
      </TouchableOpacity>
      {showLabel && (
        <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  buttonDriving: {
    borderWidth: 2,
  },
  autoDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  label: {
    fontSize: 6,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 2,
  },
});





import React from 'react';
import {
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { VISIBILITY_THEME_CYCLE } from '../lib/appearanceStore';
import { ECS_SURFACE } from '../lib/ecsSurfaceTokens';
import { TACTICAL } from '../lib/theme';
import { SafeIcon as Ionicons } from './SafeIcon';
import ThemeToggle from './ThemeToggle';
import LandscapeDockRevealButton from './LandscapeDockRevealButton';

type LandscapeShellControlsProps = {
  bluetoothAccessibilityLabel?: string;
  onBluetoothPress: () => void;
  onProfilePress: () => void;
  onRevealDock: () => void;
  profileAccessibilityLabel?: string;
  revealAccessibilityHint?: string;
  revealAccessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export default function LandscapeShellControls({
  bluetoothAccessibilityLabel = 'Open Bluetooth controls',
  onBluetoothPress,
  onProfilePress,
  onRevealDock,
  profileAccessibilityLabel = 'Open profile command hub',
  revealAccessibilityHint = 'Temporarily shows the lower ECS tab bar for five seconds.',
  revealAccessibilityLabel = 'Reveal ECS navigation dock',
  style,
  testID,
}: LandscapeShellControlsProps) {
  return (
    <View style={[styles.cluster, style]} testID={testID}>
      <TouchableOpacity
        style={styles.controlButton}
        accessibilityRole="button"
        accessibilityLabel={bluetoothAccessibilityLabel}
        accessibilityHint="Opens device connections and Bluetooth controls"
        activeOpacity={0.78}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        onPress={onBluetoothPress}
      >
        <Ionicons name="bluetooth-outline" size={14} color={TACTICAL.amber} />
      </TouchableOpacity>

      <ThemeToggle
        compact
        size={32}
        iconMode="eye"
        cycleModes={VISIBILITY_THEME_CYCLE}
      />

      <TouchableOpacity
        style={styles.controlButton}
        accessibilityRole="button"
        accessibilityLabel={profileAccessibilityLabel}
        activeOpacity={0.78}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        onPress={onProfilePress}
      >
        <Ionicons name="person-circle-outline" size={16} color={TACTICAL.amber} />
      </TouchableOpacity>

      <LandscapeDockRevealButton
        inline
        style={styles.dockRevealButton}
        onPress={onRevealDock}
        accessibilityLabel={revealAccessibilityLabel}
        accessibilityHint={revealAccessibilityHint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    flexShrink: 0,
  },
  controlButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}44`,
    backgroundColor: ECS_SURFACE.background.compact,
  },
  dockRevealButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderColor: `${TACTICAL.amber}66`,
    backgroundColor: ECS_SURFACE.background.compact,
  },
});

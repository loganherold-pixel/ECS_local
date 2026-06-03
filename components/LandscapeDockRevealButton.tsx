import React from 'react';
import {
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';

import { SafeIcon as Ionicons } from './SafeIcon';
import { TACTICAL } from '../lib/theme';

type LandscapeDockRevealButtonProps = {
  accessibilityLabel?: string;
  accessibilityHint?: string;
  inline?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export default function LandscapeDockRevealButton({
  accessibilityLabel = 'Reveal ECS navigation dock',
  accessibilityHint,
  inline = false,
  onPress,
  style,
  testID,
}: LandscapeDockRevealButtonProps) {
  return (
    <TouchableOpacity
      style={[inline ? styles.inlineButton : styles.absoluteButton, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      activeOpacity={0.82}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      onPress={onPress}
      testID={testID}
    >
      <Ionicons name="apps-outline" size={15} color={TACTICAL.amber} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  absoluteButton: {
    position: 'absolute',
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.30)',
    backgroundColor: 'rgba(8,12,15,0.84)',
    zIndex: 175,
    elevation: 175,
  },
  inlineButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.30)',
    backgroundColor: 'rgba(196,138,44,0.10)',
  },
});

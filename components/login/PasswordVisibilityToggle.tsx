import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { TACTICAL } from '../../lib/theme';

type PasswordVisibilityToggleProps = {
  visible: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export default function PasswordVisibilityToggle({
  visible,
  onPress,
  style,
  textStyle,
}: PasswordVisibilityToggleProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      accessibilityHint="Toggles password visibility."
      style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null, style]}
    >
      <Text style={[styles.text, textStyle]}>{visible ? 'Hide' : 'Show'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 44,
    minHeight: 36,
    marginLeft: 10,
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.72,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.amber,
    letterSpacing: 0.4,
  },
});


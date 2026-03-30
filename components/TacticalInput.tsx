import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, TextInputProps } from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';

import { TACTICAL } from '../lib/theme';

interface TacticalInputProps extends TextInputProps {
  label: string;
  error?: string;
  isPassword?: boolean;
}

export default function TacticalInput({ label, error, isPassword, style, ...props }: TacticalInputProps) {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const borderColor = error
    ? TACTICAL.borderError
    : focused
    ? TACTICAL.borderFocus
    : 'rgba(62, 79, 60, 0.4)';

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, { borderBottomColor: borderColor }]}>
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={TACTICAL.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          secureTextEntry={isPassword && !showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          {...props}
        />
        {isPassword && (
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={TACTICAL.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.2,
    marginBottom: 8,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    paddingBottom: 4,
  },
  input: {
    flex: 1,
    fontSize: 18,
    color: TACTICAL.text,
    paddingVertical: 8,
    fontWeight: '500',
  },
  eyeBtn: {
    padding: 8,
  },
  errorText: {
    fontSize: 12,
    color: TACTICAL.danger,
    marginTop: 6,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});




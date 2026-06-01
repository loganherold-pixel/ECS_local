import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { copyTextToClipboard } from '../lib/clipboard';
import { TACTICAL } from '../lib/theme';
import { SafeIcon as Ionicons } from './SafeIcon';

type ECSCopyButtonProps = {
  value: string;
  label?: string;
  copiedLabel?: string;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  onCopied?: (success: boolean) => void;
};

export function ECSCopyButton({
  value,
  label = 'COPY',
  copiedLabel = 'COPIED',
  disabled = false,
  compact = true,
  style,
  textStyle,
  accessibilityLabel,
  onCopied,
}: ECSCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const copiedOpacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    Animated.timing(copiedOpacity, {
      toValue: copied ? 1 : 0,
      duration: copied ? 120 : 260,
      useNativeDriver: true,
    }).start();
  }, [copied, copiedOpacity]);

  const handlePress = async () => {
    if (disabled || !value) return;
    const success = await copyTextToClipboard(value);
    onCopied?.(success);
    if (!success) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), 1700);
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        compact ? styles.buttonCompact : null,
        copied ? styles.buttonCopied : null,
        (disabled || !value) ? styles.buttonDisabled : null,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label} to clipboard`}
      onPress={handlePress}
      activeOpacity={0.82}
      disabled={disabled || !value}
    >
      <Ionicons
        name={copied ? 'checkmark-circle-outline' : 'copy-outline'}
        size={compact ? 13 : 15}
        color={copied ? '#66BB6A' : TACTICAL.text}
      />
      <Text style={[styles.label, copied ? styles.labelCopied : null, textStyle]}>
        {copied ? copiedLabel : label}
      </Text>
      <Animated.View pointerEvents="none" style={[styles.copiedGlow, { opacity: copiedOpacity }]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.42)',
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  buttonCompact: {
    minHeight: 30,
    paddingHorizontal: 8,
  },
  buttonCopied: {
    borderColor: 'rgba(102,187,106,0.72)',
    backgroundColor: 'rgba(102,187,106,0.10)',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  label: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  labelCopied: {
    color: '#66BB6A',
  },
  copiedGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(102,187,106,0.08)',
  },
});

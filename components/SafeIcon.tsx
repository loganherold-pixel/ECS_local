// ============================================================
// SAFE ICON — Crash-proof Ionicons wrapper
// ============================================================
// Wraps @expo/vector-icons/Ionicons with a try/catch so that
// if the icon library fails to resolve at runtime the app
// renders a small placeholder instead of crashing the entire
// screen / error boundary.
//
// Usage:
//   import { SafeIcon } from '../components/SafeIcon';
//   <SafeIcon name="alert-circle-outline" size={24} color="#E6E6E1" />

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// ── Attempt to load Ionicons ─────────────────────────────────
let IoniconsComponent: any = null;

try {
  // Try the named export first (pre-v15 style)
  const mod = require('@expo/vector-icons');
  if (mod && mod.Ionicons) {
    IoniconsComponent = mod.Ionicons;
  }
} catch {
  // Silently fail
}

if (!IoniconsComponent) {
  try {
    // Try the default export from the sub-path (v15 style)
    const mod = require('@expo/vector-icons/Ionicons');
    if (mod && (mod.default || mod)) {
      IoniconsComponent = mod.default || mod;
    }
  } catch {
    // Silently fail
  }
}

// ── Props ────────────────────────────────────────────────────
interface SafeIconProps {
  name: string;
  size?: number;
  color?: string;
  style?: any;
}

// ── Component ────────────────────────────────────────────────
export function SafeIcon({ name, size = 24, color = '#8A8A85', style }: SafeIconProps) {
  if (IoniconsComponent) {
    try {
      return <IoniconsComponent name={name} size={size} color={color} style={style} />;
    } catch {
      // Fall through to placeholder
    }
  }

  // Fallback: a small colored square / dot as a placeholder
  const dim = Math.max(size * 0.45, 6);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <View
        style={{
          width: dim,
          height: dim,
          borderRadius: dim * 0.2,
          borderWidth: 1.5,
          borderColor: color,
          opacity: 0.6,
        }}
      />
    </View>
  );
}

export default SafeIcon;




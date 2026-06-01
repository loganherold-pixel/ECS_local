// ============================================================
// SAFE ICON - Crash-proof Ionicons wrapper
// ============================================================
// Wraps @expo/vector-icons/Ionicons with a fallback so screens
// do not crash when the icon module fails to resolve.

import React from 'react';
import { View } from 'react-native';

let IoniconsComponent: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@expo/vector-icons');
  if (mod && mod.Ionicons) {
    IoniconsComponent = mod.Ionicons;
  }
} catch {
  // Silently fail.
}

if (!IoniconsComponent) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@expo/vector-icons/Ionicons');
    if (mod && (mod.default || mod)) {
      IoniconsComponent = mod.default || mod;
    }
  } catch {
    // Silently fail.
  }
}

export interface SafeIconProps {
  name: string;
  size?: number;
  color?: string;
  style?: any;
}

const SAFE_ICON_GLYPH_MAP: Record<string, string> =
  IoniconsComponent && typeof IoniconsComponent.glyphMap === 'object'
    ? IoniconsComponent.glyphMap
    : {};

function SafeIconInner({ name, size = 24, color = '#8A8A85', style }: SafeIconProps) {
  if (IoniconsComponent) {
    try {
      return <IoniconsComponent name={name} size={size} color={color} style={style} />;
    } catch {
      // Fall through to placeholder.
    }
  }

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

type SafeIconComponent = ((props: SafeIconProps) => React.ReactElement) & {
  glyphMap: Record<string, string>;
};

export const SafeIcon = Object.assign(SafeIconInner, {
  glyphMap: SAFE_ICON_GLYPH_MAP,
}) as SafeIconComponent;

export default SafeIcon;

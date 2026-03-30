/**
 * BrandShieldIcon — ECS Flagship icon for the CommandDock center button
 *
 * The icon IS the button visual. No container, no frame, no inset padding.
 * The image fills the entire available space.
 *
 * v3 — Enlarged 50% (72 → 108 base), containerless, transparent background.
 *
 * Phase 9 — Bold Gold Structural Integration:
 *   • Reduced outer glow intensity (shadowOpacity 0.35 → 0.18)
 *   • Added subtle inset shadow beneath badge to anchor it into the bar
 *   • No animation, no glossy effects, no bounce
 *   • Badge feels mechanically seated, not floating
 */
import React from 'react';
import { View, Image, StyleSheet, Platform } from 'react-native';

const ECS_FLAGSHIP_URI =
  'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771957619198_cffd2c7b.png';

// Icon size — enlarged 50% for containerless center dock treatment
const BASE_SIZE = 108;

// Phase 9: Desaturated gold for badge border tone (matches TACTICAL.amber)
const BADGE_GOLD = '#B58B3A';

interface Props {
  scale?: number;
  active?: boolean;
}

export default function BrandShieldIcon({ scale = 1, active = false }: Props) {
  const size = BASE_SIZE * scale;

  return (
    <View
      style={[
        styles.root,
        {
          width: size,
          height: size,
        },
        // Phase 9: Reduced amber halo — restrained, not luminous
        active && styles.activeHalo,
      ]}
    >
      {/* Phase 9: Inset shadow layer — anchors badge into bar surface */}
      <View
        style={[
          styles.insetShadow,
          {
            width: size * 0.88,
            height: size * 0.88,
            borderRadius: size * 0.22,
          },
        ]}
      />
      <Image
        source={{ uri: ECS_FLAGSHIP_URI }}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.22,
          opacity: active ? 1.0 : 0.88,
        }}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    // Explicitly zero out all shadows / elevation
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },

  // Phase 9: Reduced amber halo — restrained intensity, no luminous bloom
  activeHalo: {
    ...(Platform.OS === 'web'
      ? {}
      : {
          shadowColor: BADGE_GOLD,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.18,  // Phase 9: reduced from 0.35
          shadowRadius: 8,      // Phase 9: reduced from 12
          elevation: 0,         // Keep elevation 0 — no Android shadow plate
        }),
  },

  // Phase 9: Subtle inset shadow beneath badge — anchors into bar surface
  // Simulated via a dark underlayer positioned slightly below the badge image
  insetShadow: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    top: 4,
    // Slight downward offset creates "seated into surface" feel
    ...(Platform.OS === 'web'
      ? {}
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.5,
          shadowRadius: 6,
        }),
  },
});




import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { AUTH_SURFACE } from '../../lib/auth/authSurface';
import { AUTH_VISUAL_SPEC } from '../../lib/auth/authVisualSpec';
import { TACTICAL } from '../../lib/theme';

type BannerTone = 'neutral' | 'error' | 'success';

type AuthStatusBannerProps = {
  text: string;
  tone?: BannerTone;
};

export default function AuthStatusBanner({
  text,
  tone = 'neutral',
}: AuthStatusBannerProps) {
  const iconName =
    tone === 'error'
      ? 'alert-circle-outline'
      : tone === 'success'
        ? 'checkmark-circle-outline'
        : text.toLowerCase().includes('network')
          ? 'cloud-offline-outline'
          : 'information-circle-outline';

  const tint =
    tone === 'error'
      ? '#E2A29A'
      : tone === 'success'
        ? TACTICAL.amber
        : 'rgba(230,237,243,0.72)';

  return (
    <View
      accessible
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      style={[
        styles.row,
        tone === 'error' ? styles.rowError : null,
        tone === 'success' ? styles.rowSuccess : null,
      ]}
    >
      <Ionicons name={iconName} size={AUTH_VISUAL_SPEC.typography.statusBanner.iconSize} color={tint} />
      <Text style={[styles.text, { color: tint }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: AUTH_SURFACE.helperRadius,
    borderWidth: 1,
    borderColor: AUTH_SURFACE.helperBorder,
    backgroundColor: AUTH_SURFACE.helperBackground,
    paddingHorizontal: AUTH_SURFACE.helperPaddingX,
    paddingVertical: AUTH_SURFACE.helperPaddingY,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AUTH_VISUAL_SPEC.typography.statusBanner.rowGap,
  },
  rowError: {
    borderColor: 'rgba(217,123,114,0.28)',
    backgroundColor: 'rgba(217,123,114,0.08)',
  },
  rowSuccess: {
    borderColor: 'rgba(212,160,23,0.24)',
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  text: {
    flex: 1,
    fontSize: AUTH_VISUAL_SPEC.typography.statusBanner.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.statusBanner.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.statusBanner.fontWeight,
  },
});

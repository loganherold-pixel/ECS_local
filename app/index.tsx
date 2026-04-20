import React, { useMemo } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, useWindowDimensions } from 'react-native';
import AdaptiveBackground from '../components/login/AdaptiveBackground';
import AuthBrandLockup from '../components/login/AuthBrandLockup';
import { AUTH_COPY } from '../lib/auth/authCopy';
import { resolveAuthLayoutMetrics } from '../lib/auth/authResponsive';
import { AUTH_VISUAL_SPEC } from '../lib/auth/authVisualSpec';
import { TACTICAL } from '../lib/theme';

/**
 * Index Route — Entry Point
 *
 * Auth-based redirects are handled centrally by the AuthGate
 * in app/_layout.tsx. This component only renders briefly as a
 * fallback while the redirect fires.
 */
export default function Index() {
  const { width, height } = useWindowDimensions();
  const layoutMetrics = useMemo(() => resolveAuthLayoutMetrics(width, height), [width, height]);

  return (
    <AdaptiveBackground>
      <View
        style={[
          styles.loading,
          {
            paddingHorizontal: layoutMetrics.horizontalPadding,
            justifyContent: layoutMetrics.centerContent ? 'center' : 'flex-start',
            paddingTop: layoutMetrics.topPadding,
            paddingBottom: layoutMetrics.bottomPadding,
          },
        ]}
      >
        <AuthBrandLockup
          title={AUTH_COPY.title}
          variant="state"
          containerStyle={[styles.brandBlock, { maxWidth: layoutMetrics.loadingMaxWidth }]}
        />
        <ActivityIndicator size="small" color={TACTICAL.amber} />
        <Text style={styles.loadingText}>{AUTH_COPY.session.checking}</Text>
      </View>
    </AdaptiveBackground>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
  },
  brandBlock: {
    marginBottom: AUTH_VISUAL_SPEC.spacing.headerSupportingGap.state,
  },
  loadingText: {
    marginTop: AUTH_VISUAL_SPEC.spacing.brandGap.compactLandscape,
    fontSize: AUTH_VISUAL_SPEC.typography.loadingText.fontSize,
    lineHeight: AUTH_VISUAL_SPEC.typography.loadingText.lineHeight,
    fontWeight: AUTH_VISUAL_SPEC.typography.loadingText.fontWeight,
    color: TACTICAL.text,
    letterSpacing: AUTH_VISUAL_SPEC.typography.loadingText.letterSpacing,
  },
});





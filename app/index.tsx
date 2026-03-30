import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { TACTICAL } from '../lib/theme';

/**
 * Index Route — Entry Point
 *
 * Auth-based redirects are handled centrally by the AuthGate
 * in app/_layout.tsx. This component only renders briefly as a
 * fallback while the redirect fires.
 */
export default function Index() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={TACTICAL.accent} />
      <Text style={styles.loadingText}>INITIALIZING SYSTEMS...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: TACTICAL.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});





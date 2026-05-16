import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { useTheme } from '../../context/ThemeContext';
import { SPACING } from '../../lib/theme';

export default function PowerSetupRedirectScreen() {
  const router = useRouter();
  const { colors, palette } = useTheme();

  useEffect(() => {
    router.replace('/power/blu');
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.card, { backgroundColor: palette.panel, borderColor: palette.border }]}>
        <Ionicons name="bluetooth-outline" size={24} color={palette.amber} />
        <Text style={[styles.title, { color: palette.text }]}>Opening Device Connections</Text>
        <Text style={[styles.body, { color: palette.textMuted }]}>
          ECS now uses one production scanner for nearby power devices and Bluetooth telemetry.
        </Text>
        <ActivityIndicator size="small" color={palette.amber} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  body: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});

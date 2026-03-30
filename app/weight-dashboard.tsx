/**
 * Weight Dashboard Screen
 *
 * Full-screen weight tracking dashboard accessible from:
 *   - Loadouts screen
 *   - Expedition Builder
 *   - Loadout Editor
 *
 * Shows real-time weight tracking with CG visualization,
 * zone distribution, tilt risk, and before/after comparison.
 */
import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { SafeIcon as Ionicons } from '../components/SafeIcon';
import { TACTICAL } from '../lib/theme';
import WeightDashboardPanel from '../components/weight-dashboard/WeightDashboardPanel';

export default function WeightDashboardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ loadoutId?: string }>();

  return (
    <View style={styles.container}>
      {/* Back button overlay */}
      <View style={styles.backBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={18} color={TACTICAL.text} />
          <Text style={styles.backText}>BACK</Text>
        </TouchableOpacity>
      </View>

      <WeightDashboardPanel
        loadoutId={params.loadoutId || null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TACTICAL.bg,
  },
  backBar: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 16 : 50,
    right: 16,
    zIndex: 10,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  backText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1,
  },
});





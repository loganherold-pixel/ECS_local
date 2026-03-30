/**
 * BuildSummaryBar — Compact inline build configuration summary
 *
 * Replaces the vehicle side-profile silhouette visualizer.
 * Displays selected configuration as inline text:
 *   [VEHICLE TYPE] • [CAB RACK] • [BED CONFIG] • [DRAWER] • [HITCH]
 *
 * No silhouette. No overlay graphics.
 * Clean, minimal, tactical.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TACTICAL } from '../../lib/theme';
import { getBuildSummaryText } from '../../lib/weightEngine';

interface Props {
  selections: Record<string, string>;
}

export default function BuildSummaryBar({ selections }: Props) {
  const summaryText = useMemo(() => getBuildSummaryText(selections), [selections]);

  if (!selections.vehicle_type || !summaryText) return null;

  return (
    <View style={styles.container}>
      <View style={styles.accentBar} />
      <View style={styles.content}>
        <Text style={styles.label}>BUILD</Text>
        <Text style={styles.summary} numberOfLines={2}>
          {summaryText}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: 'rgba(18, 24, 29, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.25)',
    minHeight: 36,
  },
  accentBar: {
    width: 3,
    backgroundColor: 'rgba(212, 175, 55, 0.5)',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  label: {
    fontSize: 8,
    fontWeight: '900',
    color: 'rgba(138, 138, 138, 0.45)',
    letterSpacing: 1.5,
  },
  summary: {
    flex: 1,
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(212, 175, 55, 0.65)',
    letterSpacing: 1,
  },
});




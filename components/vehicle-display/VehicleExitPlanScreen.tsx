import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import type { VehicleExitPlanData } from '../../lib/vehicleDisplayTypes';
import type { ECSAutomotiveSurfaceState } from '../../lib/automotive/automotiveSurfaceTypes';

interface Props {
  data: VehicleExitPlanData;
  automotive?: ECSAutomotiveSurfaceState | null;
}

function confidenceColor(confidence: VehicleExitPlanData['offlineConfidence']): string {
  switch (confidence) {
    case 'high':
      return '#4CAF50';
    case 'medium':
      return '#D4A017';
    case 'low':
      return '#EF5350';
    default:
      return '#8B949E';
  }
}

export default function VehicleExitPlanScreen({ data, automotive }: Props) {
  const exitCommand =
    automotive?.primaryCommand?.role === 'exit_relevance'
      ? automotive.primaryCommand
      : automotive?.secondaryCommands.find((command) => command.role === 'exit_relevance') ?? null;
  const accent = confidenceColor(data.offlineConfidence);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>EXIT PLAN</Text>
        <Text style={styles.heroValue}>
          {data.nearestBailoutLabel ?? 'No bailout target'}
        </Text>
        <Text style={styles.heroSub}>
          {exitCommand?.summary ?? data.supportLabel ?? data.unavailableReason ?? 'Exit context unavailable'}
        </Text>
      </View>

      <View style={styles.metrics}>
        <Metric
          label="Bailout"
          value={
            data.nearestBailoutDistanceMiles != null
              ? `${data.nearestBailoutDistanceMiles} mi`
              : '--'
          }
        />
        <Metric
          label="Pavement"
          value={data.exitToPavementMiles != null ? `${data.exitToPavementMiles} mi` : '--'}
        />
        <Metric
          label="Exit ETA"
          value={data.exitEtaMinutes != null ? `${data.exitEtaMinutes} min` : '--'}
        />
      </View>

      <View style={styles.footerRow}>
        <View style={[styles.statusCard, { borderColor: `${accent}55`, backgroundColor: `${accent}14` }]}>
          <Text style={[styles.statusTitle, { color: accent }]}>OFFLINE CONFIDENCE</Text>
          <Text style={styles.statusValue}>{data.offlineConfidence.toUpperCase()}</Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>SUPPORT</Text>
          <Text style={styles.statusValue}>{data.fuelSupportLabel ?? data.connectivityLabel ?? '--'}</Text>
        </View>
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E12',
    padding: 14,
    gap: 12,
  },
  hero: {
    backgroundColor: '#111418',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    color: '#8B949E',
    marginBottom: 8,
  },
  heroValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#E6EDF3',
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 14,
    lineHeight: 20,
    color: '#B3BDC8',
  },
  metrics: {
    flexDirection: 'row',
    gap: 10,
  },
  metric: {
    flex: 1,
    backgroundColor: '#111418',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8B949E',
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E6EDF3',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusCard: {
    flex: 1,
    backgroundColor: '#111418',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  statusTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8B949E',
    marginBottom: 8,
  },
  statusValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E6EDF3',
  },
});

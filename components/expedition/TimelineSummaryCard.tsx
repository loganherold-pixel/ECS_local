// ============================================================
// Timeline Summary Card — Expedition stats from timeline data
// ============================================================
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, ECS } from '../../lib/theme';
import type { TimelineSummary } from '../../lib/timelineIntelligenceEngine';

interface Props {
  summary: TimelineSummary;
}

interface StatItem {
  icon: string;
  label: string;
  value: string;
  color: string;
}

export default function TimelineSummaryCard({ summary }: Props) {
  const stats: StatItem[] = [
    {
      icon: 'speedometer-outline',
      label: 'DISTANCE',
      value: `${summary.distanceMi} mi`,
      color: '#42A5F5',
    },
    {
      icon: 'time-outline',
      label: 'DURATION',
      value: summary.durationFormatted,
      color: '#D4A017',
    },
    {
      icon: 'radio-outline',
      label: 'REMOTE ZONES',
      value: String(summary.remoteZonesEntered),
      color: '#E67E22',
    },
    {
      icon: 'trophy-outline',
      label: 'MILESTONES',
      value: String(summary.milestonesReached),
      color: '#42A5F5',
    },
    {
      icon: 'warning-outline',
      label: 'WARNINGS',
      value: String(summary.systemWarnings),
      color: summary.systemWarnings > 0 ? '#FF9500' : '#4CAF50',
    },
    {
      icon: 'document-text-outline',
      label: 'TOTAL EVENTS',
      value: String(summary.totalEvents),
      color: '#8B949E',
    },
  ];

  // Add optional stats
  if (summary.fuelStops > 0) {
    stats.push({
      icon: 'flame-outline',
      label: 'FUEL STOPS',
      value: String(summary.fuelStops),
      color: '#EF5350',
    });
  }
  if (summary.campsEstablished > 0) {
    stats.push({
      icon: 'bonfire-outline',
      label: 'CAMPS',
      value: String(summary.campsEstablished),
      color: '#FFB74D',
    });
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="analytics-outline" size={14} color={ECS.accent} />
          <Text style={styles.headerTitle}>EXPEDITION SUMMARY</Text>
        </View>
        {summary.peakRemoteness && (
          <View style={[styles.peakBadge, { borderColor: '#E67E22' + '40' }]}>
            <Text style={styles.peakLabel}>PEAK</Text>
            <Text style={styles.peakValue}>{summary.peakRemoteness}</Text>
          </View>
        )}
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        {stats.map((stat, i) => (
          <View key={stat.label} style={styles.statCell}>
            <View style={[styles.statIconWrap, { backgroundColor: stat.color + '10' }]}>
              <Ionicons name={stat.icon as any} size={14} color={stat.color} />
            </View>
            <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: ECS.bgPanel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    overflow: 'hidden',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 0.75,
    borderBottomColor: ECS.stroke,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: ECS.accent,
    letterSpacing: 3,
  },

  peakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    backgroundColor: 'rgba(230,126,34,0.06)',
  },
  peakLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: '#E67E22',
    letterSpacing: 1,
  },
  peakValue: {
    fontSize: 8,
    fontWeight: '700',
    color: '#E67E22',
    letterSpacing: 0.5,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  statCell: {
    width: '33.33%',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  statIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  statLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
});




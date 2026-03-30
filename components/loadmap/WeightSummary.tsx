/**
 * WeightSummary — Load Map Weight Tracking Widget
 *
 * Shows:
 *   - Overall vehicle loadout weight
 *   - Per-zone weight with capacity bars
 *   - Overweight warnings
 *   - Weight coverage indicator
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { VehicleWeightSummary, ZoneWeightSummary } from '../../lib/weightStore';
import { getWeightStatusColor, getWeightStatusLabel } from '../../lib/weightStore';

interface Props {
  summary: VehicleWeightSummary;
}

function ZoneWeightRow({ zone }: { zone: ZoneWeightSummary }) {
  const statusColor = getWeightStatusColor(zone.utilizationPct);
  const hasWeight = zone.totalWeightLbs > 0;

  return (
    <View style={styles.zoneRow}>
      <View style={styles.zoneRowHeader}>
        <View style={styles.zoneNameRow}>
          <View style={[styles.zoneIndicator, { backgroundColor: statusColor }]} />
          <Text style={styles.zoneName} numberOfLines={1}>{zone.zoneName}</Text>
          {zone.isOverweight && (
            <View style={styles.overweightBadge}>
              <Ionicons name="warning" size={10} color="#EF5350" />
              <Text style={styles.overweightText}>OVER</Text>
            </View>
          )}
          {zone.isWarning && (
            <View style={styles.warningBadge}>
              <Ionicons name="alert-circle" size={10} color="#FFB74D" />
              <Text style={styles.warningText}>NEAR</Text>
            </View>
          )}
        </View>
        <Text style={[styles.zoneWeight, { color: hasWeight ? statusColor : TACTICAL.textMuted }]}>
          {hasWeight ? `${zone.totalWeightLbs} lbs` : '—'}
        </Text>
      </View>
      <View style={styles.zoneBarContainer}>
        <View style={styles.zoneBarTrack}>
          <View
            style={[
              styles.zoneBarFill,
              {
                width: `${Math.min(100, zone.utilizationPct)}%`,
                backgroundColor: statusColor,
              },
            ]}
          />
        </View>
        <Text style={styles.zoneCapacity}>
          {zone.capacityLbs} lbs max
        </Text>
      </View>
    </View>
  );
}

export default function WeightSummary({ summary }: Props) {
  const totalUtilization = summary.totalCapacityLbs > 0
    ? Math.round((summary.totalLoadoutWeightLbs / summary.totalCapacityLbs) * 100)
    : 0;
  const totalColor = getWeightStatusColor(totalUtilization);
  const totalStatus = getWeightStatusLabel(totalUtilization);
  const hasAnyWeight = summary.totalLoadoutWeightLbs > 0;
  const coveragePct = summary.totalItems > 0
    ? Math.round((summary.itemsWithWeight / summary.totalItems) * 100)
    : 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="scale-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>WEIGHT DISTRIBUTION</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: `${totalColor}18`, borderColor: `${totalColor}40` }]}>
          <Text style={[styles.statusPillText, { color: totalColor }]}>{totalStatus}</Text>
        </View>
      </View>

      {/* Total Weight Card */}
      <View style={styles.totalCard}>
        <View style={styles.totalRow}>
          <View style={styles.totalMain}>
            <Text style={[styles.totalValue, { color: hasAnyWeight ? totalColor : TACTICAL.textMuted }]}>
              {hasAnyWeight ? summary.totalLoadoutWeightLbs.toFixed(1) : '0.0'}
            </Text>
            <Text style={styles.totalUnit}>LBS</Text>
          </View>
          <View style={styles.totalMeta}>
            <Text style={styles.totalMetaLabel}>CAPACITY</Text>
            <Text style={styles.totalMetaValue}>{summary.totalCapacityLbs} lbs</Text>
          </View>
          <View style={styles.totalMeta}>
            <Text style={styles.totalMetaLabel}>COVERAGE</Text>
            <Text style={[styles.totalMetaValue, { color: coveragePct < 50 ? TACTICAL.amber : TACTICAL.text }]}>
              {coveragePct}%
            </Text>
          </View>
        </View>
        {/* Total bar */}
        <View style={styles.totalBar}>
          <View
            style={[
              styles.totalBarFill,
              {
                width: `${Math.min(100, totalUtilization)}%`,
                backgroundColor: totalColor,
              },
            ]}
          />
        </View>
        {coveragePct < 100 && summary.totalItems > 0 && (
          <Text style={styles.coverageNote}>
            {summary.itemsWithoutWeight} of {summary.totalItems} items missing weight data
          </Text>
        )}
      </View>

      {/* Overweight Warnings */}
      {summary.overweightZones.length > 0 && (
        <View style={styles.warningCard}>
          <Ionicons name="warning" size={14} color="#EF5350" />
          <View style={{ flex: 1 }}>
            <Text style={styles.warningCardTitle}>ZONE OVERWEIGHT</Text>
            {summary.overweightZones.map(z => (
              <Text key={z.zoneId} style={styles.warningCardText}>
                {z.zoneName}: {z.totalWeightLbs} lbs / {z.capacityLbs} lbs ({z.utilizationPct}%)
              </Text>
            ))}
          </View>
        </View>
      )}

      {/* Per-Zone Breakdown */}
      <View style={styles.zonesSection}>
        <Text style={styles.zonesSectionTitle}>PER-ZONE WEIGHT</Text>
        {summary.zones.map(zone => (
          <ZoneWeightRow key={zone.zoneId} zone={zone} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.2)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Total
  totalCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.15)',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 8,
  },
  totalMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    flex: 1,
  },
  totalValue: {
    fontSize: 28,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  totalUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  totalMeta: {
    alignItems: 'flex-end',
  },
  totalMetaLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  totalMetaValue: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  totalBar: {
    height: 4,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  totalBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  coverageNote: {
    fontSize: 9,
    color: TACTICAL.amber,
    marginTop: 6,
    fontStyle: 'italic',
  },

  // Warning
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 14,
    marginTop: 10,
    padding: 10,
    backgroundColor: 'rgba(239, 83, 80, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 83, 80, 0.25)',
  },
  warningCardTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: '#EF5350',
    letterSpacing: 1,
    marginBottom: 2,
  },
  warningCardText: {
    fontSize: 10,
    color: TACTICAL.text,
    lineHeight: 16,
  },

  // Zones
  zonesSection: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  zonesSectionTitle: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  zoneRow: {
    marginBottom: 10,
  },
  zoneRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  zoneNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  zoneIndicator: {
    width: 3,
    height: 14,
    borderRadius: 1.5,
  },
  zoneName: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    flex: 1,
  },
  zoneWeight: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  overweightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(239, 83, 80, 0.12)',
    borderRadius: 4,
  },
  overweightText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#EF5350',
    letterSpacing: 0.5,
  },
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(255, 183, 77, 0.12)',
    borderRadius: 4,
  },
  warningText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FFB74D',
    letterSpacing: 0.5,
  },
  zoneBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zoneBarTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  zoneBarFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  zoneCapacity: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    minWidth: 60,
    textAlign: 'right',
  },
});




/**
 * WeightComparisonCard — Before/After Weight Impact
 *
 * Shows the impact of adding or removing items:
 *   - Weight delta
 *   - CG shift
 *   - Axle load change
 *   - Stability impact
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import type { WeightComparison } from '../../lib/weightDashboardStore';

interface Props {
  comparison: WeightComparison;
  itemName?: string;
}

function DeltaIndicator({ value, unit, label, invert }: {
  value: number;
  unit: string;
  label: string;
  invert?: boolean;
}) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const isNeutral = value === 0;

  // For some metrics, positive is bad (weight, stability index)
  // For others, positive might be neutral (axle balance)
  let color = TACTICAL.textMuted;
  let icon: string = 'remove-outline';

  if (!isNeutral) {
    if (invert) {
      color = isPositive ? '#EF5350' : '#66BB6A';
      icon = isPositive ? 'arrow-up' : 'arrow-down';
    } else {
      color = isPositive ? '#66BB6A' : '#EF5350';
      icon = isPositive ? 'arrow-up' : 'arrow-down';
    }
  }

  return (
    <View style={styles.deltaItem}>
      <Text style={styles.deltaLabel}>{label}</Text>
      <View style={styles.deltaValueRow}>
        {!isNeutral && (
          <Ionicons name={icon as any} size={10} color={color} />
        )}
        <Text style={[styles.deltaValue, { color }]}>
          {isPositive ? '+' : ''}{value}{unit}
        </Text>
      </View>
    </View>
  );
}

export default function WeightComparisonCard({ comparison, itemName }: Props) {
  const { before, after, delta } = comparison;
  const hasChange = delta.weightChange !== 0;

  if (!hasChange) {
    return null;
  }

  const isAdding = delta.weightChange > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons
            name={isAdding ? 'add-circle-outline' : 'remove-circle-outline'}
            size={14}
            color={TACTICAL.amber}
          />
          <Text style={styles.headerTitle}>WEIGHT IMPACT</Text>
        </View>
        <View style={[styles.impactBadge, { backgroundColor: delta.impactColor + '18', borderColor: delta.impactColor + '50' }]}>
          <Text style={[styles.impactText, { color: delta.impactColor }]}>
            {delta.impactLevel.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Item context */}
      {itemName && (
        <View style={styles.contextRow}>
          <Ionicons name="cube-outline" size={12} color={TACTICAL.textMuted} />
          <Text style={styles.contextText}>
            {isAdding ? 'Adding' : 'Removing'}: {itemName}
          </Text>
        </View>
      )}

      {/* Before/After comparison */}
      <View style={styles.comparisonRow}>
        {/* Before */}
        <View style={styles.snapshotCard}>
          <Text style={styles.snapshotLabel}>BEFORE</Text>
          <Text style={styles.snapshotWeight}>{before.totalWeight}</Text>
          <Text style={styles.snapshotUnit}>lbs</Text>
          <View style={styles.snapshotMeta}>
            <Text style={styles.snapshotMetaText}>F:{before.frontAxlePct}%</Text>
            <Text style={styles.snapshotMetaText}>R:{before.rearAxlePct}%</Text>
          </View>
        </View>

        {/* Delta arrow */}
        <View style={styles.deltaArrow}>
          <View style={[styles.deltaArrowLine, { backgroundColor: delta.impactColor }]} />
          <View style={[styles.deltaArrowHead, { borderLeftColor: delta.impactColor }]} />
          <Text style={[styles.deltaArrowText, { color: delta.impactColor }]}>
            {delta.weightChange > 0 ? '+' : ''}{delta.weightChange} lbs
          </Text>
        </View>

        {/* After */}
        <View style={[styles.snapshotCard, styles.snapshotCardAfter]}>
          <Text style={styles.snapshotLabel}>AFTER</Text>
          <Text style={[styles.snapshotWeight, { color: delta.impactColor }]}>{after.totalWeight}</Text>
          <Text style={styles.snapshotUnit}>lbs</Text>
          <View style={styles.snapshotMeta}>
            <Text style={styles.snapshotMetaText}>F:{after.frontAxlePct}%</Text>
            <Text style={styles.snapshotMetaText}>R:{after.rearAxlePct}%</Text>
          </View>
        </View>
      </View>

      {/* Delta details */}
      <View style={styles.deltaGrid}>
        <DeltaIndicator
          value={delta.weightChange}
          unit=" lbs"
          label="WEIGHT"
          invert
        />
        <DeltaIndicator
          value={delta.frontAxleChange}
          unit="%"
          label="FRONT AXLE"
        />
        <DeltaIndicator
          value={delta.rearAxleChange}
          unit="%"
          label="REAR AXLE"
          invert
        />
        <DeltaIndicator
          value={delta.stabilityChange}
          unit=""
          label="STABILITY"
          invert
        />
      </View>

      {/* CG Shift */}
      {(Math.abs(delta.cgXShift) > 0.001 || Math.abs(delta.cgZShift) > 0.001) && (
        <View style={styles.cgShift}>
          <Ionicons name="move-outline" size={10} color={TACTICAL.textMuted} />
          <Text style={styles.cgShiftText}>
            CG shift: X {delta.cgXShift > 0 ? '+' : ''}{(delta.cgXShift * 100).toFixed(2)}%
            {' / '}
            Z {delta.cgZShift > 0 ? '+' : ''}{(delta.cgZShift * 100).toFixed(2)}%
          </Text>
        </View>
      )}
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
    paddingVertical: 10,
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
  impactBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  impactText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Context
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  contextText: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
  },

  // Comparison
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  snapshotCard: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.15)',
  },
  snapshotCardAfter: {
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  snapshotLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  snapshotWeight: {
    fontSize: 20,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  snapshotUnit: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  snapshotMeta: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  snapshotMetaText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },

  // Delta arrow
  deltaArrow: {
    alignItems: 'center',
    gap: 2,
    width: 50,
  },
  deltaArrowLine: {
    width: 24,
    height: 2,
    borderRadius: 1,
  },
  deltaArrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginTop: -2,
  },
  deltaArrowText: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: 'Courier',
    marginTop: 2,
  },

  // Delta grid
  deltaGrid: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 6,
  },
  deltaItem: {
    flex: 1,
    alignItems: 'center',
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 6,
  },
  deltaLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginBottom: 3,
  },
  deltaValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  deltaValue: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Courier',
  },

  // CG Shift
  cgShift: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  cgShiftText: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
});




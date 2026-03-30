/**
 * BuildSnapshotCard — Displays the frozen build state at run creation
 *
 * Shows vehicle name, weight distribution, range, and limit status.
 * This snapshot does NOT update dynamically — it represents the build
 * at the time of route creation.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import type { BuildSnapshot } from '../../lib/runStore';

interface Props {
  snapshot: BuildSnapshot;
  compact?: boolean;
}

export default function BuildSnapshotCard({ snapshot, compact = false }: Props) {
  const hasVehicle = snapshot.vehicle_name !== 'No Vehicle';
  const roofPct = snapshot.limits.roof_limit_lb > 0
    ? Math.round((snapshot.roof_weight_lb / snapshot.limits.roof_limit_lb) * 100)
    : null;
  const hitchPct = snapshot.limits.hitch_limit_lb > 0
    ? Math.round((snapshot.hitch_weight_lb / snapshot.limits.hitch_limit_lb) * 100)
    : null;

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Ionicons name="car-outline" size={14} color={TACTICAL.amber} />
        <Text style={styles.compactVehicle} numberOfLines={1}>
          {snapshot.vehicle_name}
        </Text>
        {snapshot.total_weight_lb > 0 && (
          <Text style={styles.compactWeight}>{snapshot.total_weight_lb} lb</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="car-outline" size={16} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>BUILD SNAPSHOT</Text>
        </View>
        <Text style={styles.capturedAt}>
          {new Date(snapshot.captured_at).toLocaleDateString()}
        </Text>
      </View>

      {/* Vehicle Name */}
      <Text style={[styles.vehicleName, !hasVehicle && styles.vehicleNameMuted]}>
        {snapshot.vehicle_name}
      </Text>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatItem
          label="TOTAL WEIGHT"
          value={snapshot.total_weight_lb > 0 ? `${snapshot.total_weight_lb}` : '--'}
          unit="LB"
        />
        <View style={styles.statDivider} />
        <StatItem
          label="EST RANGE"
          value={snapshot.estimated_range_miles > 0 ? `${snapshot.estimated_range_miles}` : '--'}
          unit="MI"
        />
        <View style={styles.statDivider} />
        <StatItem
          label="ROOF"
          value={snapshot.roof_weight_lb > 0 ? `${snapshot.roof_weight_lb}` : '--'}
          unit="LB"
          pct={roofPct}
        />
        <View style={styles.statDivider} />
        <StatItem
          label="HITCH"
          value={snapshot.hitch_weight_lb > 0 ? `${snapshot.hitch_weight_lb}` : '--'}
          unit="LB"
          pct={hitchPct}
        />
      </View>

      {/* Limit bars */}
      {(snapshot.limits.roof_limit_lb > 0 || snapshot.limits.hitch_limit_lb > 0) && (
        <View style={styles.limitsSection}>
          {snapshot.limits.roof_limit_lb > 0 && (
            <LimitBar
              label="ROOF"
              current={snapshot.roof_weight_lb}
              limit={snapshot.limits.roof_limit_lb}
            />
          )}
          {snapshot.limits.hitch_limit_lb > 0 && (
            <LimitBar
              label="HITCH"
              current={snapshot.hitch_weight_lb}
              limit={snapshot.limits.hitch_limit_lb}
            />
          )}
        </View>
      )}

      <Text style={styles.frozenNote}>
        Snapshot frozen at run creation — does not update
      </Text>
    </View>
  );
}

function StatItem({ label, value, unit, pct }: { label: string; value: string; unit: string; pct?: number | null }) {
  const pctColor = pct != null
    ? pct > 100 ? '#EF5350' : pct > 80 ? '#FFB74D' : '#66BB6A'
    : undefined;

  return (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statUnit}>{unit}</Text>
      </View>
      {pct != null && (
        <Text style={[styles.statPct, { color: pctColor }]}>{pct}%</Text>
      )}
    </View>
  );
}

function LimitBar({ label, current, limit }: { label: string; current: number; limit: number }) {
  const pct = Math.min(Math.round((current / limit) * 100), 120);
  const isOver = current > limit;
  const isWarn = current > limit * 0.8;
  const barColor = isOver ? '#EF5350' : isWarn ? '#FFB74D' : '#66BB6A';

  return (
    <View style={styles.limitRow}>
      <View style={styles.limitLabelRow}>
        <Text style={styles.limitLabel}>{label}</Text>
        <Text style={[styles.limitValues, { color: isOver ? '#EF5350' : TACTICAL.textMuted }]}>
          {current} / {limit} lb
        </Text>
      </View>
      <View style={styles.limitBarBg}>
        <View style={[styles.limitBarFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: DENSITY.titleBodyGap,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    ...TYPO.T4,
    color: TACTICAL.amber,
  },
  capturedAt: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  vehicleName: {
    ...TYPO.T2,
    color: TACTICAL.text,
    marginBottom: DENSITY.internalRowGap,
  },
  vehicleNameMuted: {
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
  },
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: DENSITY.internalRowGap,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: TACTICAL.border,
    marginTop: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    ...TYPO.T4,
    fontSize: 7,
    letterSpacing: 2,
    marginBottom: 3,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  statValue: {
    ...TYPO.K2,
    color: TACTICAL.text,
  },
  statUnit: {
    ...TYPO.T4,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  statPct: {
    ...TYPO.K3,
    fontSize: 9,
    marginTop: 1,
  },
  limitsSection: {
    gap: 8,
    marginBottom: DENSITY.internalRowGap,
    paddingTop: DENSITY.internalRowGap,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
  },
  limitRow: {
    gap: 4,
  },
  limitLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  limitLabel: {
    ...TYPO.T4,
    fontSize: 8,
    letterSpacing: 3,
  },
  limitValues: {
    ...TYPO.K3,
    fontSize: 9,
  },
  limitBarBg: {
    height: 4,
    backgroundColor: 'rgba(62,79,60,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  limitBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  frozenNote: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  // Compact
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderRadius: 6,
  },
  compactVehicle: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.text,
    flex: 1,
  },
  compactWeight: {
    ...TYPO.K3,
    fontSize: 9,
    color: TACTICAL.amber,
  },
});




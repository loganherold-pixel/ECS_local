/**
 * ExitPlanPanel — Phase 2.6
 *
 * Compact run-level panel showing:
 *   - Nearest bailout on this route (name + distance)
 *   - Max remoteness point (segment index)
 *   - Overall remoteness level
 *   - Total bailouts count
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import { type ExitPlan, getBailoutTypeMeta } from '../../lib/bailoutStore';
import type { RunHealthLevel } from '../../lib/runStore';

const LEVEL_COLORS: Record<RunHealthLevel, string> = {
  green: '#66BB6A',
  yellow: '#FFB300',
  red: '#EF5350',
};

const LEVEL_BG: Record<RunHealthLevel, string> = {
  green: 'rgba(102,187,106,0.08)',
  yellow: 'rgba(255,179,0,0.08)',
  red: 'rgba(239,83,80,0.08)',
};

interface Props {
  exitPlan: ExitPlan;
  onViewBailouts?: () => void;
  compact?: boolean;
}

export default function ExitPlanPanel({ exitPlan, onViewBailouts, compact }: Props) {
  const color = LEVEL_COLORS[exitPlan.remoteness_level];
  const bg = LEVEL_BG[exitPlan.remoteness_level];
  const typeMeta = getBailoutTypeMeta(exitPlan.nearest_bailout_type);

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactContainer, { borderColor: color + '30', backgroundColor: bg }]}
        onPress={onViewBailouts}
        activeOpacity={0.85}
      >
        <View style={styles.compactRow}>
          <Ionicons name="exit-outline" size={14} color={color} />
          <Text style={[styles.compactLabel, { color }]}>EXIT PLAN</Text>
          <View style={[styles.levelDot, { backgroundColor: color }]} />
        </View>
        <Text style={styles.compactValue} numberOfLines={1}>
          {exitPlan.nearest_bailout_name} — {exitPlan.nearest_bailout_distance_miles.toFixed(1)} mi
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { borderColor: color + '30' }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="exit-outline" size={16} color={color} />
          <Text style={[styles.title, { color }]}>EXIT PLAN</Text>
        </View>
        <View style={[styles.levelBadge, { backgroundColor: bg, borderColor: color + '40' }]}>
          <View style={[styles.levelDot, { backgroundColor: color }]} />
          <Text style={[styles.levelText, { color }]}>
            {exitPlan.remoteness_level.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Nearest Bailout */}
      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <Ionicons name={typeMeta.icon as any} size={14} color={typeMeta.color} />
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowLabel}>NEAREST BAILOUT</Text>
          <Text style={styles.rowValue}>{exitPlan.nearest_bailout_name}</Text>
          <Text style={styles.rowSub}>
            {exitPlan.nearest_bailout_distance_miles.toFixed(1)} mi — {typeMeta.label}
          </Text>
        </View>
      </View>

      {/* Max Remoteness */}
      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <Ionicons name="warning-outline" size={14} color={TACTICAL.amber} />
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowLabel}>MAX REMOTENESS</Text>
          <Text style={styles.rowValue}>{exitPlan.max_remoteness_miles.toFixed(1)} mi from bailout</Text>
          <Text style={styles.rowSub}>
            Segment #{exitPlan.max_remoteness_seg_index + 1}
          </Text>
        </View>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{exitPlan.total_bailouts}</Text>
          <Text style={styles.statLabel}>BAILOUTS</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{exitPlan.nearest_bailout_distance_miles.toFixed(1)}</Text>
          <Text style={styles.statLabel}>NEAREST MI</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{exitPlan.max_remoteness_miles.toFixed(1)}</Text>
          <Text style={styles.statLabel}>MAX REMOTE MI</Text>
        </View>
      </View>

      {/* Action */}
      {onViewBailouts && (
        <TouchableOpacity style={styles.actionBtn} onPress={onViewBailouts} activeOpacity={0.8}>
          <Ionicons name="navigate-outline" size={12} color={TACTICAL.amber} />
          <Text style={styles.actionBtnText}>MANAGE BAILOUTS</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    padding: DENSITY.cardPad,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    ...TYPO.T3,
    letterSpacing: 4,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  levelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  levelText: {
    ...TYPO.U2,
    fontSize: 8,
  },

  // Rows
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.15)',
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(62,79,60,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    ...TYPO.T4,
    fontSize: 8,
    letterSpacing: 3,
  },
  rowValue: {
    ...TYPO.B1,
    color: TACTICAL.text,
    fontSize: 13,
  },
  rowSub: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.15)',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    ...TYPO.K2,
    color: TACTICAL.text,
  },
  statLabel: {
    ...TYPO.T4,
    fontSize: 7,
    letterSpacing: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: TACTICAL.border,
  },

  // Action
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: 'rgba(196,138,44,0.06)',
  },
  actionBtnText: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
  },

  // Compact
  compactContainer: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactLabel: {
    ...TYPO.U2,
    fontSize: 8,
    flex: 1,
  },
  compactValue: {
    ...TYPO.B2,
    fontSize: 11,
    color: TACTICAL.text,
  },
});




/**
 * RunCard — Displays a run in the navigate list
 *
 * Shows: title, distance, point count, health status, build snapshot summary
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import { type ECSRun, computeRunHealth, type RunHealthLevel } from '../../lib/runStore';
import RunHealthBadge from './RunHealthBadge';

const HEALTH_COLORS: Record<RunHealthLevel, string> = {
  green: '#66BB6A',
  yellow: '#FFB74D',
  red: '#EF5350',
};

interface Props {
  run: ECSRun;
  onPress: () => void;
  onDelete?: () => void;
  onSetActive?: () => void;
}

export default function RunCard({ run, onPress, onDelete, onSetActive }: Props) {
  const health = useMemo(() => computeRunHealth(run), [run]);
  const healthColor = HEALTH_COLORS[health.overall];
  const hasVehicle = run.build_snapshot.vehicle_name !== 'No Vehicle';

  return (
    <TouchableOpacity
      style={[styles.container, run.is_active && styles.containerActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: healthColor }]} />

      <View style={styles.content}>
        {/* Top row: title + health */}
        <View style={styles.topRow}>
          <View style={styles.titleRow}>
            {run.is_active && (
              <View style={styles.activeDot} />
            )}
            <Text style={[styles.title, run.is_active && styles.titleActive]} numberOfLines={1}>
              {run.title}
            </Text>
          </View>
          <View style={[styles.healthPill, { backgroundColor: healthColor + '15', borderColor: healthColor + '40' }]}>
            <View style={[styles.healthDot, { backgroundColor: healthColor }]} />
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Ionicons name="navigate-outline" size={11} color={TACTICAL.textMuted} />
            <Text style={styles.statText}>
              {run.stats.distance_miles.toFixed(1)} mi
            </Text>
          </View>
          <View style={styles.statSep} />
          <View style={styles.stat}>
            <Ionicons name="location-outline" size={11} color={TACTICAL.textMuted} />
            <Text style={styles.statText}>{run.stats.point_count} pts</Text>
          </View>
          {run.stats.elevation_gain_ft != null && (
            <>
              <View style={styles.statSep} />
              <View style={styles.stat}>
                <Ionicons name="trending-up-outline" size={11} color={TACTICAL.textMuted} />
                <Text style={styles.statText}>{run.stats.elevation_gain_ft} ft</Text>
              </View>
            </>
          )}
        </View>

        {/* Bottom row: vehicle + date + actions */}
        <View style={styles.bottomRow}>
          <View style={styles.metaRow}>
            {hasVehicle && (
              <View style={styles.vehicleBadge}>
                <Ionicons name="car-outline" size={10} color={TACTICAL.amber} />
                <Text style={styles.vehicleText} numberOfLines={1}>
                  {run.build_snapshot.vehicle_name}
                </Text>
              </View>
            )}
            <Text style={styles.dateText}>
              {new Date(run.created_at).toLocaleDateString()}
            </Text>
          </View>

          <View style={styles.actions}>
            {onSetActive && !run.is_active && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={(e) => { e.stopPropagation?.(); onSetActive(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="radio-button-off-outline" size={14} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={(e) => { e.stopPropagation?.(); onDelete(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={13} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: DENSITY.borderDefault,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
    marginBottom: 8,
  },
  containerActive: {
    borderColor: TACTICAL.amber + '50',
  },
  accentBar: {
    width: 3,
  },
  content: {
    flex: 1,
    padding: DENSITY.cardPad,
    paddingLeft: DENSITY.cardPad - 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#66BB6A',
  },
  title: {
    ...TYPO.T3,
    color: TACTICAL.text,
    flex: 1,
  },
  titleActive: {
    color: TACTICAL.amber,
  },
  healthPill: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statText: {
    ...TYPO.K3,
    fontSize: 10,
    color: TACTICAL.text,
  },
  statSep: {
    width: 1,
    height: 10,
    backgroundColor: TACTICAL.border,
    marginHorizontal: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  vehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(196,138,44,0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  vehicleText: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.amber,
    maxWidth: 100,
  },
  dateText: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    padding: 4,
  },
});




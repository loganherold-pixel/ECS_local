// ============================================================
// TEMPLATE SYNC BADGE — Visual sync status indicator
// ============================================================
// Shows sync status on each template card:
//   • Synced (green checkmark)
//   • Pending (amber clock)
//   • Conflict (red warning)
//   • Local Only (gray offline)
//   • Syncing (animated spinner)
// ============================================================

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { TemplateSyncStatus } from '../../lib/templateSyncEngine';

interface Props {
  status: TemplateSyncStatus;
  compact?: boolean;
}

const STATUS_CONFIG: Record<TemplateSyncStatus, {
  icon: string;
  color: string;
  label: string;
  bgColor: string;
  borderColor: string;
}> = {
  synced: {
    icon: 'cloud-done',
    color: '#4CAF50',
    label: 'SYNCED',
    bgColor: 'rgba(76, 175, 80, 0.10)',
    borderColor: 'rgba(76, 175, 80, 0.25)',
  },
  pending: {
    icon: 'cloud-upload-outline',
    color: '#C48A2C',
    label: 'PENDING',
    bgColor: 'rgba(196, 138, 44, 0.10)',
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  conflict: {
    icon: 'warning',
    color: '#C0392B',
    label: 'CONFLICT',
    bgColor: 'rgba(192, 57, 43, 0.12)',
    borderColor: 'rgba(192, 57, 43, 0.30)',
  },
  local_only: {
    icon: 'cloud-offline-outline',
    color: '#8A8A85',
    label: 'LOCAL',
    bgColor: 'rgba(138, 138, 133, 0.08)',
    borderColor: 'rgba(138, 138, 133, 0.20)',
  },
  syncing: {
    icon: 'sync',
    color: '#5B8DEF',
    label: 'SYNCING',
    bgColor: 'rgba(91, 141, 239, 0.10)',
    borderColor: 'rgba(91, 141, 239, 0.25)',
  },
};

export default function TemplateSyncBadge({ status, compact = false }: Props) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.local_only;
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status === 'syncing') {
      const animation = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      animation.start();
      return () => animation.stop();
    } else {
      spinAnim.setValue(0);
    }
  }, [status]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  if (compact) {
    return (
      <View style={[styles.compactBadge, { backgroundColor: config.bgColor, borderColor: config.borderColor }]}>
        {status === 'syncing' ? (
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Ionicons name={config.icon as any} size={10} color={config.color} />
          </Animated.View>
        ) : (
          <Ionicons name={config.icon as any} size={10} color={config.color} />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.badge, { backgroundColor: config.bgColor, borderColor: config.borderColor }]}>
      {status === 'syncing' ? (
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <Ionicons name={config.icon as any} size={11} color={config.color} />
        </Animated.View>
      ) : (
        <Ionicons name={config.icon as any} size={11} color={config.color} />
      )}
      <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

// ── Sync Summary Bar ─────────────────────────────────────────

interface SummaryProps {
  total: number;
  synced: number;
  pending: number;
  conflicts: number;
  localOnly: number;
  lastSyncedAt: string | null;
  isSyncing: boolean;
}

export function SyncSummaryBar({
  total, synced, pending, conflicts, localOnly, lastSyncedAt, isSyncing,
}: SummaryProps) {
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isSyncing) {
      const animation = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      animation.start();
      return () => animation.stop();
    } else {
      spinAnim.setValue(0);
    }
  }, [isSyncing]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const formatTime = (iso: string | null): string => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Progress bar segments
  const barWidth = total > 0 ? 100 : 0;
  const syncedPct = total > 0 ? (synced / total) * 100 : 0;
  const pendingPct = total > 0 ? (pending / total) * 100 : 0;
  const conflictPct = total > 0 ? (conflicts / total) * 100 : 0;

  return (
    <View style={styles.summaryContainer}>
      <View style={styles.summaryTop}>
        <View style={styles.summaryLeft}>
          {isSyncing ? (
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Ionicons name="sync" size={14} color="#5B8DEF" />
            </Animated.View>
          ) : (
            <Ionicons name="cloud-done" size={14} color={conflicts > 0 ? '#C0392B' : '#4CAF50'} />
          )}
          <Text style={styles.summaryLabel}>
            {isSyncing ? 'SYNCING...' : conflicts > 0 ? `${conflicts} CONFLICT${conflicts > 1 ? 'S' : ''}` : 'CLOUD SYNC'}
          </Text>
        </View>
        <Text style={styles.summaryTime}>
          {isSyncing ? 'In progress' : formatTime(lastSyncedAt)}
        </Text>
      </View>

      {/* Progress bar */}
      {total > 0 && (
        <View style={styles.progressBar}>
          {syncedPct > 0 && (
            <View style={[styles.progressSegment, { width: `${syncedPct}%`, backgroundColor: '#4CAF50' }]} />
          )}
          {pendingPct > 0 && (
            <View style={[styles.progressSegment, { width: `${pendingPct}%`, backgroundColor: '#C48A2C' }]} />
          )}
          {conflictPct > 0 && (
            <View style={[styles.progressSegment, { width: `${conflictPct}%`, backgroundColor: '#C0392B' }]} />
          )}
        </View>
      )}

      {/* Status counts */}
      <View style={styles.summaryStats}>
        {synced > 0 && (
          <View style={styles.statItem}>
            <View style={[styles.statDot, { backgroundColor: '#4CAF50' }]} />
            <Text style={styles.statText}>{synced} synced</Text>
          </View>
        )}
        {pending > 0 && (
          <View style={styles.statItem}>
            <View style={[styles.statDot, { backgroundColor: '#C48A2C' }]} />
            <Text style={styles.statText}>{pending} pending</Text>
          </View>
        )}
        {conflicts > 0 && (
          <View style={styles.statItem}>
            <View style={[styles.statDot, { backgroundColor: '#C0392B' }]} />
            <Text style={styles.statText}>{conflicts} conflict{conflicts > 1 ? 's' : ''}</Text>
          </View>
        )}
        {localOnly > 0 && (
          <View style={styles.statItem}>
            <View style={[styles.statDot, { backgroundColor: '#8A8A85' }]} />
            <Text style={styles.statText}>{localOnly} local</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  // Compact badge
  compactBadge: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Summary bar
  summaryContainer: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.30)',
    padding: 12,
    gap: 8,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  summaryTime: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },

  // Progress bar
  progressBar: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(138, 138, 133, 0.15)',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  progressSegment: {
    height: '100%',
  },

  // Stats
  summaryStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statText: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },
});




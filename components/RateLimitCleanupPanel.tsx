/**
 * RateLimitCleanupPanel — Admin panel for rate limit table maintenance
 *
 * Shows current table size, expired row count, per-function breakdown,
 * and provides one-tap cleanup (expired only) and purge (all rows) actions.
 *
 * Invokes the `rate-limit-cleanup` edge function with actions: stats, cleanup, purge.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';
import { useTheme } from '../context/ThemeContext';
import { SPACING, RADIUS } from '../lib/theme';
import { supabase } from '../lib/supabase';

interface Stats {
  total_rows: number;
  expired_rows: number;
  active_rows: number;
  unique_users: number;
  unique_functions: number;
  oldest_window: string | null;
  newest_window: string | null;
  rows_by_function: Record<string, number>;
}

interface Props {
  onToast?: (msg: string) => void;
}

const FUNCTION_LABELS: Record<string, string> = {
  'analyze-expedition': 'AI Analysis',
  'cross-expedition-trends': 'AI Trends',
  'get-weather': 'Weather',
  'dispatch-feed': 'Dispatch',
};

export default function RateLimitCleanupPanel({ onToast }: Props) {
  const { colors } = useTheme();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const invoke = useCallback(async (action: string, retention_hours?: number) => {
    setLoading(true);
    setLastAction(action);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('rate-limit-cleanup', {
        body: { action, ...(retention_hours ? { retention_hours } : {}) },
      });
      if (error) throw error;

      if (action === 'stats' && data?.stats) {
        setStats(data.stats);
        setHasLoaded(true);
      } else if (action === 'cleanup' && data?.result) {
        setLastResult(`Cleaned ${data.result.deleted_count} expired rows. ${data.result.remaining_count ?? '?'} remaining.`);
        onToast?.(`Cleaned ${data.result.deleted_count} expired rate limit rows`);
        // Refresh stats
        invoke('stats');
        return;
      } else if (action === 'purge' && data?.result) {
        setLastResult(`Purged ${data.result.deleted_count} rows. Table is now empty.`);
        onToast?.(`Purged all ${data.result.deleted_count} rate limit rows`);
        invoke('stats');
        return;
      }
    } catch (e: any) {
      setLastResult(`Error: ${e?.message || 'Request failed'}`);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  const loadStats = useCallback(() => invoke('stats'), [invoke]);

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: colors.goldMuted }]}>
          <Ionicons name="speedometer-outline" size={18} color={colors.gold} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Rate Limit Maintenance</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Manage expired rate limit tracking data
          </Text>
        </View>
      </View>

      {/* Load Stats Button (if not loaded yet) */}
      {!hasLoaded && (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.goldMuted, borderColor: colors.goldBorder }]}
          onPress={loadStats}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.gold} />
          ) : (
            <>
              <Ionicons name="analytics-outline" size={16} color={colors.gold} />
              <Text style={[styles.actionBtnText, { color: colors.gold }]}>Load Table Statistics</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Stats Display */}
      {hasLoaded && stats && (
        <>
          {/* Row counts */}
          <View style={[styles.statsGrid, { borderColor: colors.border }]}>
            <View style={styles.statCell}>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{stats.total_rows}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total Rows</Text>
            </View>
            <View style={[styles.statCell, { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
              <Text style={[styles.statValue, { color: stats.expired_rows > 0 ? colors.warning : colors.success }]}>
                {stats.expired_rows}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Expired (24h+)</Text>
            </View>
            <View style={[styles.statCell, { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.success }]}>{stats.active_rows}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Active</Text>
            </View>
          </View>

          {/* Per-function breakdown */}
          {Object.keys(stats.rows_by_function).length > 0 && (
            <View style={[styles.breakdownSection, { borderTopColor: colors.border }]}>
              <Text style={[styles.breakdownTitle, { color: colors.textSecondary }]}>BY FUNCTION</Text>
              {Object.entries(stats.rows_by_function).map(([fn, count]) => (
                <View key={fn} style={styles.breakdownRow}>
                  <View style={[styles.fnDot, { backgroundColor: colors.gold }]} />
                  <Text style={[styles.fnName, { color: colors.textPrimary }]}>
                    {FUNCTION_LABELS[fn] || fn}
                  </Text>
                  <Text style={[styles.fnCount, { color: colors.textMuted }]}>{count}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Meta info */}
          <View style={[styles.metaRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.metaText, { color: colors.textMuted }]}>
              {stats.unique_users} user{stats.unique_users !== 1 ? 's' : ''} tracked
            </Text>
            {stats.oldest_window && (
              <Text style={[styles.metaText, { color: colors.textMuted }]}>
                Oldest: {formatDate(stats.oldest_window)}
              </Text>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.goldMuted, borderColor: colors.goldBorder, flex: 1 }]}
              onPress={() => invoke('cleanup', 24)}
              disabled={loading}
              activeOpacity={0.7}
            >
              {loading && lastAction === 'cleanup' ? (
                <ActivityIndicator size="small" color={colors.gold} />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={14} color={colors.gold} />
                  <Text style={[styles.actionBtnText, { color: colors.gold }]}>Clean Expired</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: 'rgba(255,59,48,0.08)', borderColor: 'rgba(255,59,48,0.25)', flex: 1 }]}
              onPress={() => invoke('purge')}
              disabled={loading}
              activeOpacity={0.7}
            >
              {loading && lastAction === 'purge' ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <>
                  <Ionicons name="nuclear-outline" size={14} color={colors.danger} />
                  <Text style={[styles.actionBtnText, { color: colors.danger }]}>Purge All</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.refreshBtn, { borderColor: colors.border }]}
              onPress={loadStats}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Last action result */}
      {lastResult && (
        <View style={[styles.resultBanner, {
          backgroundColor: lastResult.startsWith('Error') ? 'rgba(255,59,48,0.08)' : 'rgba(52,199,89,0.08)',
          borderColor: lastResult.startsWith('Error') ? 'rgba(255,59,48,0.25)' : 'rgba(52,199,89,0.25)',
        }]}>
          <Ionicons
            name={lastResult.startsWith('Error') ? 'alert-circle-outline' : 'checkmark-circle-outline'}
            size={14}
            color={lastResult.startsWith('Error') ? '#FF3B30' : '#34C759'}
          />
          <Text style={[styles.resultText, {
            color: lastResult.startsWith('Error') ? '#FF3B30' : '#34C759',
          }]}>{lastResult}</Text>
        </View>
      )}

      {/* Auto-cleanup info */}
      <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
        <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
        <Text style={[styles.infoText, { color: colors.textMuted }]}>
          Expired windows ({'>'} 24h) are cleaned automatically by the rate-limit-cleanup function. Use this panel for manual maintenance.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: RADIUS.md, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.md },
  iconWrap: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 1 },
  statsGrid: { flexDirection: 'row', borderWidth: 1, borderRadius: RADIUS.sm, marginBottom: SPACING.sm, overflow: 'hidden' },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  statValue: { fontSize: 22, fontWeight: '800', fontFamily: 'Courier' },
  statLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5, marginTop: 2, textTransform: 'uppercase' },
  breakdownSection: { borderTopWidth: 1, paddingTop: SPACING.sm, marginBottom: SPACING.sm },
  breakdownTitle: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  fnDot: { width: 6, height: 6, borderRadius: 3 },
  fnName: { flex: 1, fontSize: 12, fontWeight: '600' },
  fnCount: { fontSize: 12, fontFamily: 'Courier', fontWeight: '700' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: SPACING.sm, marginBottom: SPACING.sm },
  metaText: { fontSize: 10, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 8, marginBottom: SPACING.sm },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: RADIUS.sm, borderWidth: 1,
  },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
  refreshBtn: {
    width: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: RADIUS.sm, borderWidth: 1,
  },
  resultBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: 8, borderRadius: RADIUS.sm, borderWidth: 1, marginBottom: SPACING.sm,
  },
  resultText: { flex: 1, fontSize: 11, fontWeight: '600' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderTopWidth: 1, paddingTop: SPACING.sm },
  infoText: { flex: 1, fontSize: 10, lineHeight: 14 },
});





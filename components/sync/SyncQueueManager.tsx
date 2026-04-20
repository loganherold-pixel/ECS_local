/**
 * Sync Queue Manager
 *
 * Visible offline sync queue accessible from Settings/More tab.
 * Shows all pending local changes (dirty rows) and offline queue operations,
 * with timestamps, retry counts, manual retry, and discard controls.
 *
 * Conflict Resolution Integration:
 * - Shows pending conflict count in KPI dashboard
 * - Displays conflict alert banner when conflicts exist
 * - Opens ConflictResolutionModal for side-by-side diff resolution
 * - Shows conflict history panel for past resolutions
 *
 * Real-Time Sync Integration:
 * - Live Sync toggle to enable/disable Supabase Realtime subscriptions
 * - Connection status indicator with connected/disconnected/error states
 * - LiveSyncBanner for incoming remote change notifications
 * - Recent realtime event feed
 * - Realtime diagnostics in Sync Diagnostics panel
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Switch,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { SPACING, RADIUS } from '../../lib/theme';
import { useTheme } from '../../context/ThemeContext';
import { useApp } from '../../context/AppContext';
import {
  tripStore,
  riskScoreStore,
  loadItemStore,
  loadMapSlotStore,
  fuelWaterLogStore,
  waypointStore,
} from '../../lib/storage';
import { offlineQueue, type QueuedOperation } from '../../lib/offlineQueue';
import { connectivity } from '../../lib/connectivity';
import {
  getPendingConflicts,
  getPendingConflictCount,
  onConflictChange,
  getTableLabel,
  getRecordDisplayName,
  type SyncConflict,
} from '../../lib/conflictStore';
import {
  realtimeSync,
  type RealtimeEvent,
  type RealtimeStatus,
} from '../../lib/realtimeSync';
import ConflictResolutionModal from './ConflictResolutionModal';
import ConflictHistoryPanel from './ConflictHistoryPanel';
import LiveSyncBanner from './LiveSyncBanner';

// ── Types ─────────────────────────────────────────────────────
interface DirtyGroup {
  table: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  items: DirtyItem[];
}

interface DirtyItem {
  id: string;
  table: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  isDeleted: boolean;
}

// ── Staleness threshold: 7 days ───────────────────────────────
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

function isStale(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() > STALE_THRESHOLD_MS;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hrs = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hrs}:${min}`;
  } catch {
    return iso;
  }
}

// ── Helper to extract display name from a dirty row ───────────
function getItemName(row: any, table: string): string {
  if (row.name) return row.name;
  if (table === 'risk_scores') return `Risk: ${row.trip_id?.slice(0, 8) || 'unknown'}`;
  if (table === 'load_map_slots') return `Slot: ${row.slot_key || row.id?.slice(0, 8)}`;
  if (table === 'fuel_water_logs') return `Log: ${row.log_date || row.id?.slice(0, 8)}`;
  if (table === 'waypoints') return `WP: ${row.latitude?.toFixed(4) || ''}, ${row.longitude?.toFixed(4) || ''}`;
  return row.id?.slice(0, 12) || 'Unknown';
}

// ── Queue operation type labels ───────────────────────────────
const OP_TYPE_LABELS: Record<string, string> = {
  waypoint_create: 'Create Waypoint',
  waypoint_sync: 'Sync Waypoints',
  map_cache: 'Cache Map Tiles',
  geocode: 'Geocode Request',
  sync_push: 'Push Data',
  sync_pull: 'Pull Data',
  edge_function: 'Edge Function',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#FF3B30',
  normal: '#FF9500',
  low: '#8A8A85',
};

// ── Realtime status helpers ───────────────────────────────────
const RT_STATUS_CONFIG: Record<RealtimeStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  connected: { label: 'CONNECTED', color: '#34C759', icon: 'radio-outline' },
  connecting: { label: 'CONNECTING', color: '#FF9500', icon: 'sync-outline' },
  disconnected: { label: 'DISCONNECTED', color: '#8E8E93', icon: 'radio-button-off-outline' },
  error: { label: 'ERROR', color: '#FF3B30', icon: 'alert-circle-outline' },
};

const RT_EVENT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  trips: 'map-outline',
  load_items: 'cube-outline',
  risk_scores: 'shield-outline',
  waypoints: 'navigate-outline',
  load_map_slots: 'grid-outline',
  fuel_water_logs: 'water-outline',
};

const RT_TABLE_LABELS: Record<string, string> = {
  trips: 'Expedition',
  load_items: 'Loadout',
  risk_scores: 'Risk',
  waypoints: 'Waypoint',
  load_map_slots: 'Slot',
  fuel_water_logs: 'Log',
};

export default function SyncQueueManager() {
  const { colors, palette } = useTheme();
  const {
    syncStatus,
    dirtyCount,
    lastSyncAt,
    lastSyncResult,
    isOnline,
    queueSize,
    user,
    triggerSync,
    showToast,
  } = useApp();

  const [dirtyGroups, setDirtyGroups] = useState<DirtyGroup[]>([]);
  const [queueItems, setQueueItems] = useState<QueuedOperation[]>([]);
  const [loadingDirty, setLoadingDirty] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandQueue, setExpandQueue] = useState(false);

  // ── Conflict state ──────────────────────────────────────────
  const [conflictCount, setConflictCount] = useState(getPendingConflictCount());
  const [pendingConflicts, setPendingConflicts] = useState<SyncConflict[]>([]);
  const [conflictModalVisible, setConflictModalVisible] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // ── Realtime sync state ─────────────────────────────────────
  const [liveSyncEnabled, setLiveSyncEnabled] = useState(realtimeSync.enabled);
  const [rtStatus, setRtStatus] = useState<RealtimeStatus>(realtimeSync.status);
  const [rtEvents, setRtEvents] = useState<RealtimeEvent[]>(realtimeSync.eventHistory);
  const [expandRtEvents, setExpandRtEvents] = useState(false);

  // ── Listen for conflict changes ─────────────────────────────
  useEffect(() => {
    const unsub = onConflictChange((count) => {
      setConflictCount(count);
      setPendingConflicts(getPendingConflicts().filter(c => c.status === 'pending'));
    });

    // Initial load
    const pending = getPendingConflicts().filter(c => c.status === 'pending');
    setPendingConflicts(pending);
    setConflictCount(pending.length);

    return unsub;
  }, []);

  // Refresh conflicts after sync
  useEffect(() => {
    const pending = getPendingConflicts().filter(c => c.status === 'pending');
    setPendingConflicts(pending);
    setConflictCount(pending.length);
  }, [syncStatus, lastSyncResult]);

  // ── Listen for realtime sync status changes ─────────────────
  useEffect(() => {
    const unsubStatus = realtimeSync.onStatusChange((status) => {
      setRtStatus(status);
    });

    const unsubChange = realtimeSync.onChange((_event) => {
      // Refresh event history when new events arrive
      setRtEvents(realtimeSync.eventHistory);
    });

    // Sync initial state
    setRtStatus(realtimeSync.status);
    setLiveSyncEnabled(realtimeSync.enabled);
    setRtEvents(realtimeSync.eventHistory);

    return () => {
      unsubStatus();
      unsubChange();
    };
  }, []);

  // ── Live Sync toggle handler ────────────────────────────────
  const handleToggleLiveSync = useCallback((value: boolean) => {
    setLiveSyncEnabled(value);
    realtimeSync.setEnabled(value);

    if (value) {
      showToast('Live Sync enabled — listening for remote changes');
    } else {
      showToast('Live Sync disabled — saving bandwidth');
    }
  }, [showToast]);

  // ── Load dirty rows from all stores ─────────────────────────
  const loadDirtyRows = useCallback(async () => {
    setLoadingDirty(true);
    try {
      const [dirtyTrips, dirtyRisks, dirtyItems, dirtySlots, dirtyLogs, dirtyWaypoints] =
        await Promise.all([
          tripStore.getDirty().catch(() => []),
          riskScoreStore.getDirty().catch(() => []),
          loadItemStore.getDirty().catch(() => []),
          loadMapSlotStore.getDirty().catch(() => []),
          fuelWaterLogStore.getDirty().catch(() => []),
          waypointStore.getDirty().catch(() => []),
        ]);

      const groups: DirtyGroup[] = [];

      if (dirtyTrips.length > 0) {
        groups.push({
          table: 'trips',
          label: 'Expeditions',
          icon: 'map-outline',
          items: dirtyTrips.map((r: any) => ({
            id: r.id,
            table: 'trips',
            name: r.name || `Trip ${r.id.slice(0, 8)}`,
            updatedAt: r.updated_at,
            createdAt: r.created_at,
            isDeleted: !!r.deleted_at,
          })),
        });
      }

      if (dirtyItems.length > 0) {
        groups.push({
          table: 'load_items',
          label: 'Loadout Items',
          icon: 'cube-outline',
          items: dirtyItems.map((r: any) => ({
            id: r.id,
            table: 'load_items',
            name: r.name || `Item ${r.id.slice(0, 8)}`,
            updatedAt: r.updated_at,
            createdAt: r.created_at,
            isDeleted: !!r.deleted_at,
          })),
        });
      }

      if (dirtyWaypoints.length > 0) {
        groups.push({
          table: 'waypoints',
          label: 'Waypoints',
          icon: 'navigate-outline',
          items: dirtyWaypoints.map((r: any) => ({
            id: r.id,
            table: 'waypoints',
            name: getItemName(r, 'waypoints'),
            updatedAt: r.updated_at,
            createdAt: r.created_at,
            isDeleted: !!r.deleted_at,
          })),
        });
      }

      if (dirtySlots.length > 0) {
        groups.push({
          table: 'load_map_slots',
          label: 'Load Map Slots',
          icon: 'grid-outline',
          items: dirtySlots.map((r: any) => ({
            id: r.id,
            table: 'load_map_slots',
            name: getItemName(r, 'load_map_slots'),
            updatedAt: r.updated_at,
            createdAt: r.created_at,
            isDeleted: !!r.deleted_at,
          })),
        });
      }

      if (dirtyRisks.length > 0) {
        groups.push({
          table: 'risk_scores',
          label: 'Risk Assessments',
          icon: 'shield-outline',
          items: dirtyRisks.map((r: any) => ({
            id: r.id,
            table: 'risk_scores',
            name: getItemName(r, 'risk_scores'),
            updatedAt: r.updated_at,
            createdAt: r.created_at,
            isDeleted: !!r.deleted_at,
          })),
        });
      }

      if (dirtyLogs.length > 0) {
        groups.push({
          table: 'fuel_water_logs',
          label: 'Fuel/Water Logs',
          icon: 'water-outline',
          items: dirtyLogs.map((r: any) => ({
            id: r.id,
            table: 'fuel_water_logs',
            name: getItemName(r, 'fuel_water_logs'),
            updatedAt: r.updated_at,
            createdAt: r.created_at,
            isDeleted: !!r.deleted_at,
          })),
        });
      }

      setDirtyGroups(groups);
    } catch (e) {
      console.warn('[SyncQueue] Failed to load dirty rows:', e);
    }
    setLoadingDirty(false);
  }, []);

  // ── Load offline queue items ────────────────────────────────
  const loadQueueItems = useCallback(() => {
    setQueueItems(offlineQueue.queue);
  }, []);

  // ── Initial load + refresh on sync status change ────────────
  useEffect(() => {
    loadDirtyRows();
    loadQueueItems();
  }, [syncStatus, dirtyCount, queueSize, loadDirtyRows, loadQueueItems]);

  // ── Listen for queue changes ────────────────────────────────
  useEffect(() => {
    const unsub = offlineQueue.onChange(() => {
      loadQueueItems();
    });
    return unsub;
  }, [loadQueueItems]);

  // ── Sync Now handler ────────────────────────────────────────
  const handleSyncNow = useCallback(async () => {
    if (!isOnline) {
      showToast('Offline — cannot sync right now');
      return;
    }
    if (!user) {
      showToast('Sign in to sync data');
      return;
    }

    setSyncing(true);
    try {
      await triggerSync();
      await loadDirtyRows();
      loadQueueItems();

      // Refresh conflicts after sync
      const pending = getPendingConflicts().filter(c => c.status === 'pending');
      setPendingConflicts(pending);
      setConflictCount(pending.length);

      if (pending.length > 0) {
        showToast(`${pending.length} conflict(s) need resolution`);
      }
    } catch (e: any) {
      showToast(`Sync failed: ${e?.message || 'Unknown error'}`);
    }
    setSyncing(false);
  }, [isOnline, user, triggerSync, loadDirtyRows, loadQueueItems, showToast]);

  // ── Conflict resolution handlers ────────────────────────────
  const handleOpenConflictModal = useCallback(() => {
    const pending = getPendingConflicts().filter(c => c.status === 'pending');
    setPendingConflicts(pending);
    if (pending.length === 0) {
      showToast('No pending conflicts');
      return;
    }
    setConflictModalVisible(true);
  }, [showToast]);

  const handleConflictsResolved = useCallback(() => {
    setConflictModalVisible(false);
    const pending = getPendingConflicts().filter(c => c.status === 'pending');
    setPendingConflicts(pending);
    setConflictCount(pending.length);
    setHistoryRefreshKey(k => k + 1);
    loadDirtyRows();
  }, [loadDirtyRows]);

  // ── Retry a specific queue item ─────────────────────────────
  const handleRetryQueueItem = useCallback(async (op: QueuedOperation) => {
    if (!isOnline) {
      showToast('Offline — cannot retry');
      return;
    }
    offlineQueue.dequeue(op.id);
    offlineQueue.enqueue(op.type, op.payload, op.priority, op.maxRetries);
    showToast('Re-queued for retry');
    loadQueueItems();
  }, [isOnline, showToast, loadQueueItems]);

  // ── Discard a queue item ────────────────────────────────────
  const handleDiscardQueueItem = useCallback((op: QueuedOperation) => {
    const doDiscard = () => {
      offlineQueue.dequeue(op.id);
      showToast('Queue item discarded');
      loadQueueItems();
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Discard "${OP_TYPE_LABELS[op.type] || op.type}" operation?`)) {
        doDiscard();
      }
    } else {
      Alert.alert(
        'Discard Operation',
        `Remove "${OP_TYPE_LABELS[op.type] || op.type}" from queue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: doDiscard },
        ]
      );
    }
  }, [showToast, loadQueueItems]);

  // ── Discard all stale dirty rows ────────────────────────────
  const handleDiscardStale = useCallback(async () => {
    const staleCount = dirtyGroups.reduce(
      (sum, g) => sum + g.items.filter(i => isStale(i.updatedAt)).length,
      0
    );

    if (staleCount === 0) {
      showToast('No stale entries found');
      return;
    }

    const doDiscard = async () => {
      try {
        await Promise.all([
          tripStore.clearDirty(),
          riskScoreStore.clearDirty(),
          loadItemStore.clearDirty(),
          loadMapSlotStore.clearDirty(),
          fuelWaterLogStore.clearDirty(),
          waypointStore.clearDirty(),
        ]);
        showToast(`Cleared ${staleCount} stale entries`);
        await loadDirtyRows();
      } catch (e: any) {
        showToast('Failed to clear stale entries');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Discard ${staleCount} stale entries older than 7 days? Data will remain local but won't sync.`)) {
        await doDiscard();
      }
    } else {
      Alert.alert(
        'Discard Stale Entries',
        `Remove ${staleCount} entries older than 7 days from sync queue? Data stays local.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: doDiscard },
        ]
      );
    }
  }, [dirtyGroups, showToast, loadDirtyRows]);

  // ── Clear entire offline queue ──────────────────────────────
  const handleClearQueue = useCallback(() => {
    if (queueItems.length === 0) {
      showToast('Queue is empty');
      return;
    }

    const doClear = () => {
      offlineQueue.clearAll();
      showToast('Offline queue cleared');
      loadQueueItems();
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Clear all ${queueItems.length} queued operations?`)) {
        doClear();
      }
    } else {
      Alert.alert(
        'Clear Queue',
        `Remove all ${queueItems.length} queued operations?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear All', style: 'destructive', onPress: doClear },
        ]
      );
    }
  }, [queueItems, showToast, loadQueueItems]);

  // ── Toggle group expansion ──────────────────────────────────
  const toggleGroup = useCallback((table: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(table)) next.delete(table);
      else next.add(table);
      return next;
    });
  }, []);

  // ── Compute stats ───────────────────────────────────────────
  const totalDirty = dirtyGroups.reduce((sum, g) => sum + g.items.length, 0);
  const totalStale = dirtyGroups.reduce(
    (sum, g) => sum + g.items.filter(i => isStale(i.updatedAt)).length,
    0
  );
  const failedQueueItems = queueItems.filter(q => q.retryCount > 0);
  const rtStats = realtimeSync.stats;

  // ── Status badge color ──────────────────────────────────────
  const getStatusColor = () => {
    if (syncing || syncStatus === 'syncing') return colors.info;
    if (conflictCount > 0) return colors.warning;
    if (syncStatus === 'synced' && totalDirty === 0) return colors.success;
    if (syncStatus === 'error') return colors.danger;
    if (!isOnline) return colors.textMuted;
    if (totalDirty > 0) return colors.warning;
    return colors.success;
  };

  const getStatusLabel = () => {
    if (syncing || syncStatus === 'syncing') return 'SYNCING';
    if (conflictCount > 0) return `${conflictCount} CONFLICT${conflictCount !== 1 ? 'S' : ''}`;
    if (syncStatus === 'synced' && totalDirty === 0) return 'ALL SYNCED';
    if (syncStatus === 'error') return 'SYNC ERROR';
    if (!isOnline) return 'OFFLINE';
    if (totalDirty > 0) return `${totalDirty} PENDING`;
    return 'UP TO DATE';
  };

  const statusColor = getStatusColor();
  const rtStatusCfg = RT_STATUS_CONFIG[rtStatus];

  return (
    <View>
      {/* ═══════ LIVE SYNC BANNER (incoming remote changes) ═══════ */}
      <LiveSyncBanner />

      {/* ═══════ LIVE SYNC TOGGLE CARD ═══════ */}
      <View style={[s.liveSyncCard, { backgroundColor: colors.bgCard, borderColor: liveSyncEnabled ? rtStatusCfg.color + '40' : colors.border }]}>
        <View style={s.liveSyncHeader}>
          <View style={[s.liveSyncIconWrap, { backgroundColor: rtStatusCfg.color + '15' }]}>
            <Ionicons name={rtStatusCfg.icon} size={18} color={rtStatusCfg.color} />
          </View>
          <View style={s.liveSyncInfo}>
            <View style={s.liveSyncTitleRow}>
              <Text style={[s.liveSyncTitle, { color: colors.textPrimary }]}>Live Sync</Text>
              <View style={[s.rtStatusBadge, { backgroundColor: rtStatusCfg.color + '15', borderColor: rtStatusCfg.color + '30' }]}>
                <View style={[s.rtStatusDot, { backgroundColor: rtStatusCfg.color }]} />
                <Text style={[s.rtStatusText, { color: rtStatusCfg.color }]}>{rtStatusCfg.label}</Text>
              </View>
            </View>
            <Text style={[s.liveSyncDesc, { color: colors.textMuted }]}>
              {liveSyncEnabled
                ? rtStatus === 'connected'
                  ? 'Receiving real-time changes from 6 tables'
                  : rtStatus === 'connecting'
                    ? 'Establishing realtime connection...'
                    : rtStatus === 'error'
                      ? 'Connection error — will auto-reconnect'
                      : 'Waiting for connection...'
                : 'Disabled — toggle to receive live updates'
              }
            </Text>
          </View>
          <Switch
            value={liveSyncEnabled}
            onValueChange={handleToggleLiveSync}
            trackColor={{ false: 'rgba(255,255,255,0.08)', true: rtStatusCfg.color + '40' }}
            thumbColor={liveSyncEnabled ? rtStatusCfg.color : colors.textMuted}
            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
          />
        </View>

        {/* Live Sync stats row */}
        {liveSyncEnabled && (
          <View style={[s.liveSyncStats, { borderTopColor: colors.border }]}>
            <View style={s.liveSyncStat}>
              <Text style={[s.liveSyncStatValue, { color: colors.textPrimary }]}>{rtStats.totalEventsReceived}</Text>
              <Text style={[s.liveSyncStatLabel, { color: colors.textMuted }]}>EVENTS</Text>
            </View>
            <View style={[s.liveSyncStatDivider, { backgroundColor: colors.border }]} />
            <View style={s.liveSyncStat}>
              <Text style={[s.liveSyncStatValue, { color: colors.textPrimary }]}>{rtStats.totalRowsMerged}</Text>
              <Text style={[s.liveSyncStatLabel, { color: colors.textMuted }]}>MERGED</Text>
            </View>
            <View style={[s.liveSyncStatDivider, { backgroundColor: colors.border }]} />
            <View style={s.liveSyncStat}>
              <Text style={[s.liveSyncStatValue, { color: rtStats.totalConflictsDetected > 0 ? colors.warning : colors.textPrimary }]}>
                {rtStats.totalConflictsDetected}
              </Text>
              <Text style={[s.liveSyncStatLabel, { color: colors.textMuted }]}>CONFLICTS</Text>
            </View>
            <View style={[s.liveSyncStatDivider, { backgroundColor: colors.border }]} />
            <View style={s.liveSyncStat}>
              <Text style={[s.liveSyncStatValue, { color: colors.textPrimary }]}>{rtStats.subscribedTables}</Text>
              <Text style={[s.liveSyncStatLabel, { color: colors.textMuted }]}>TABLES</Text>
            </View>
          </View>
        )}

        {/* Connected since */}
        {liveSyncEnabled && rtStats.connectedAt && (
          <View style={[s.connectedSince, { borderTopColor: colors.border }]}>
            <Ionicons name="time-outline" size={10} color={colors.textMuted} />
            <Text style={[s.connectedSinceText, { color: colors.textMuted }]}>
              Connected {timeAgo(rtStats.connectedAt)}
              {rtStats.lastEventAt ? ` \u00B7 Last event ${timeAgo(rtStats.lastEventAt)}` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* ═══════ RECENT REALTIME EVENTS ═══════ */}
      {liveSyncEnabled && rtEvents.length > 0 && (
        <>
          <TouchableOpacity
            style={[s.rtEventsHeader, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
            onPress={() => setExpandRtEvents(!expandRtEvents)}
            activeOpacity={0.7}
          >
            <Ionicons name="pulse-outline" size={14} color={colors.info} />
            <Text style={[s.rtEventsHeaderText, { color: colors.textPrimary }]}>
              Recent Realtime Events
            </Text>
            <View style={[s.rtEventsCount, { backgroundColor: colors.info + '20', borderColor: colors.info + '40' }]}>
              <Text style={[s.rtEventsCountText, { color: colors.info }]}>{rtEvents.length}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                realtimeSync.clearEventHistory();
                setRtEvents([]);
                showToast('Event history cleared');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={12} color={colors.textMuted} />
            </TouchableOpacity>
            <Ionicons
              name={expandRtEvents ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.textMuted}
            />
          </TouchableOpacity>

          {expandRtEvents && (
            <View style={[s.rtEventsList, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              {rtEvents.slice(0, 20).map((event) => {
                const icon = RT_EVENT_ICONS[event.table] || 'document-outline';
                const tableLabel = RT_TABLE_LABELS[event.table] || event.table;
                const typeColor = event.type === 'INSERT' ? colors.success
                  : event.type === 'DELETE' ? colors.danger
                  : colors.info;

                return (
                  <View key={event.id} style={[s.rtEventRow, { borderBottomColor: colors.border }]}>
                    <Ionicons name={icon} size={12} color={colors.textMuted} />
                    <View style={s.rtEventInfo}>
                      <View style={s.rtEventTopRow}>
                        <Text style={[s.rtEventName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {event.recordName}
                        </Text>
                        <View style={[s.rtEventTypeBadge, { backgroundColor: typeColor + '15' }]}>
                          <Text style={[s.rtEventTypeText, { color: typeColor }]}>{event.type}</Text>
                        </View>
                        {event.conflictDetected && (
                          <View style={[s.rtConflictBadge, { backgroundColor: colors.warning + '15' }]}>
                            <Ionicons name="git-compare-outline" size={8} color={colors.warning} />
                          </View>
                        )}
                      </View>
                      <Text style={[s.rtEventMeta, { color: colors.textMuted }]}>
                        {tableLabel} {'\u00B7'} {timeAgo(event.timestamp)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}

      {/* ═══════ STATUS HEADER ═══════ */}
      <View style={[s.statusCard, { backgroundColor: colors.bgCard, borderColor: statusColor + '40' }]}>
        <View style={s.statusRow}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusLabel, { color: statusColor }]}>{getStatusLabel()}</Text>
          {!isOnline && (
            <View style={[s.offlineBadge, { backgroundColor: colors.textMuted + '20', borderColor: colors.textMuted + '40' }]}>
              <Ionicons name="cloud-offline-outline" size={10} color={colors.textMuted} />
              <Text style={[s.offlineBadgeText, { color: colors.textMuted }]}>OFFLINE</Text>
            </View>
          )}
        </View>

        {/* KPI Row — now 5 items including conflicts */}
        <View style={s.kpiRow}>
          <View style={s.kpiItem}>
            <Text style={[s.kpiValue, { color: totalDirty > 0 ? colors.warning : colors.success }]}>
              {totalDirty}
            </Text>
            <Text style={[s.kpiLabel, { color: colors.textMuted }]}>PENDING</Text>
          </View>
          <View style={[s.kpiDivider, { backgroundColor: colors.border }]} />
          <View style={s.kpiItem}>
            <Text style={[s.kpiValue, { color: conflictCount > 0 ? colors.warning : colors.textMuted }]}>
              {conflictCount}
            </Text>
            <Text style={[s.kpiLabel, { color: colors.textMuted }]}>CONFLICTS</Text>
          </View>
          <View style={[s.kpiDivider, { backgroundColor: colors.border }]} />
          <View style={s.kpiItem}>
            <Text style={[s.kpiValue, { color: queueItems.length > 0 ? colors.info : colors.textMuted }]}>
              {queueItems.length}
            </Text>
            <Text style={[s.kpiLabel, { color: colors.textMuted }]}>QUEUED</Text>
          </View>
          <View style={[s.kpiDivider, { backgroundColor: colors.border }]} />
          <View style={s.kpiItem}>
            <Text style={[s.kpiValue, { color: totalStale > 0 ? colors.danger : colors.textMuted }]}>
              {totalStale}
            </Text>
            <Text style={[s.kpiLabel, { color: colors.textMuted }]}>STALE</Text>
          </View>
          <View style={[s.kpiDivider, { backgroundColor: colors.border }]} />
          <View style={s.kpiItem}>
            <Text style={[s.kpiValue, { color: failedQueueItems.length > 0 ? colors.danger : colors.textMuted }]}>
              {failedQueueItems.length}
            </Text>
            <Text style={[s.kpiLabel, { color: colors.textMuted }]}>FAILED</Text>
          </View>
        </View>

        {/* Last sync info */}
        {lastSyncAt && (
          <View style={[s.lastSyncRow, { borderTopColor: colors.border }]}>
            <Ionicons name="time-outline" size={12} color={colors.textMuted} />
            <Text style={[s.lastSyncText, { color: colors.textMuted }]}>
              Last sync: {timeAgo(lastSyncAt)} ({formatTimestamp(lastSyncAt)})
            </Text>
          </View>
        )}

        {lastSyncResult && lastSyncResult.errors.length > 0 && (
          <View style={[s.errorBanner, { backgroundColor: colors.danger + '10', borderColor: colors.danger + '30' }]}>
            <Ionicons name="alert-circle" size={14} color={colors.danger} />
            <Text style={[s.errorBannerText, { color: colors.danger }]} numberOfLines={2}>
              {lastSyncResult.errors[0]}
            </Text>
          </View>
        )}
      </View>

      {/* ═══════ CONFLICT ALERT BANNER ═══════ */}
      {conflictCount > 0 && (
        <TouchableOpacity
          style={[s.conflictBanner, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '40' }]}
          onPress={handleOpenConflictModal}
          activeOpacity={0.7}
        >
          <View style={s.conflictBannerLeft}>
            <Ionicons name="git-compare-outline" size={20} color={colors.warning} />
            <View style={s.conflictBannerInfo}>
              <Text style={[s.conflictBannerTitle, { color: colors.warning }]}>
                {conflictCount} Sync Conflict{conflictCount !== 1 ? 's' : ''} Detected
              </Text>
              <Text style={[s.conflictBannerDesc, { color: colors.textMuted }]}>
                Records modified both locally and remotely. Tap to resolve.
              </Text>
            </View>
          </View>
          <View style={[s.resolveBtn, { backgroundColor: colors.warning }]}>
            <Text style={s.resolveBtnText}>RESOLVE</Text>
            <Ionicons name="chevron-forward" size={14} color="#000" />
          </View>
        </TouchableOpacity>
      )}

      {/* ═══════ ACTION BUTTONS ═══════ */}
      <View style={s.actionRow}>
        <TouchableOpacity
          style={[
            s.syncNowBtn,
            {
              backgroundColor: isOnline && user ? colors.gold : colors.textMuted + '30',
              opacity: syncing ? 0.7 : 1,
            },
          ]}
          onPress={handleSyncNow}
          disabled={syncing || !isOnline || !user}
          activeOpacity={0.7}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Ionicons name="sync-outline" size={18} color={isOnline && user ? '#000' : colors.textMuted} />
          )}
          <Text style={[s.syncNowText, { color: isOnline && user ? '#000' : colors.textMuted }]}>
            {syncing ? 'SYNCING...' : 'SYNC NOW'}
          </Text>
        </TouchableOpacity>

        {totalStale > 0 && (
          <TouchableOpacity
            style={[s.discardBtn, { borderColor: colors.danger + '40' }]}
            onPress={handleDiscardStale}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={14} color={colors.danger} />
            <Text style={[s.discardBtnText, { color: colors.danger }]}>DISCARD STALE</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ═══════ PENDING CONFLICTS LIST ═══════ */}
      {pendingConflicts.length > 0 && (
        <>
          <Text style={[s.sectionLabel, { color: colors.warning, borderBottomColor: colors.warning + '30' }]}>
            PENDING CONFLICTS
          </Text>

          {pendingConflicts.map((conflict, idx) => (
            <TouchableOpacity
              key={conflict.id}
              style={[s.conflictCard, { backgroundColor: colors.bgCard, borderColor: colors.warning + '30' }]}
              onPress={handleOpenConflictModal}
              activeOpacity={0.7}
            >
              <View style={s.conflictCardTop}>
                <Ionicons name="git-compare-outline" size={14} color={colors.warning} />
                <Text style={[s.conflictCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {getRecordDisplayName(conflict.localRow, conflict.tableName)}
                </Text>
                <View style={[s.conflictTableBadge, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '30' }]}>
                  <Text style={[s.conflictTableText, { color: colors.warning }]}>
                    {getTableLabel(conflict.tableName)}
                  </Text>
                </View>
              </View>
              <View style={s.conflictCardMeta}>
                <Text style={[s.conflictCardMetaText, { color: colors.textMuted }]}>
                  {conflict.conflictingFields.length} field{conflict.conflictingFields.length !== 1 ? 's' : ''} differ
                  {' \u00B7 '}
                  Detected {timeAgo(conflict.detectedAt)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* ═══════ PENDING LOCAL CHANGES ═══════ */}
      <Text style={[s.sectionLabel, { color: colors.gold, borderBottomColor: colors.goldBorder, marginTop: pendingConflicts.length > 0 ? SPACING.lg : 0 }]}>
        PENDING LOCAL CHANGES
      </Text>

      {loadingDirty ? (
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color={colors.gold} />
          <Text style={[s.loadingText, { color: colors.textMuted }]}>Scanning local data...</Text>
        </View>
      ) : totalDirty === 0 ? (
        <View style={[s.emptyCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Ionicons name="checkmark-circle-outline" size={32} color={colors.success} />
          <Text style={[s.emptyText, { color: colors.textSecondary }]}>All local changes synced</Text>
          <Text style={[s.emptySubtext, { color: colors.textMuted }]}>No pending modifications</Text>
        </View>
      ) : (
        dirtyGroups.map(group => {
          const isExpanded = expandedGroups.has(group.table);
          const staleInGroup = group.items.filter(i => isStale(i.updatedAt)).length;

          return (
            <View key={group.table} style={[s.groupCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <TouchableOpacity
                style={s.groupHeader}
                onPress={() => toggleGroup(group.table)}
                activeOpacity={0.7}
              >
                <Ionicons name={group.icon} size={16} color={colors.gold} />
                <Text style={[s.groupLabel, { color: colors.textPrimary }]}>{group.label}</Text>
                <View style={[s.countBadge, { backgroundColor: colors.warning + '20', borderColor: colors.warning + '40' }]}>
                  <Text style={[s.countBadgeText, { color: colors.warning }]}>{group.items.length}</Text>
                </View>
                {staleInGroup > 0 && (
                  <View style={[s.staleBadge, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '30' }]}>
                    <Text style={[s.staleBadgeText, { color: colors.danger }]}>{staleInGroup} stale</Text>
                  </View>
                )}
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textMuted}
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={[s.groupItems, { borderTopColor: colors.border }]}>
                  {group.items.map(item => {
                    const stale = isStale(item.updatedAt);
                    return (
                      <View
                        key={item.id}
                        style={[
                          s.itemRow,
                          { borderBottomColor: colors.border },
                          stale && { backgroundColor: colors.danger + '05' },
                        ]}
                      >
                        <View style={s.itemInfo}>
                          <View style={s.itemNameRow}>
                            <Text
                              style={[
                                s.itemName,
                                { color: colors.textPrimary },
                                item.isDeleted && { textDecorationLine: 'line-through', color: colors.textMuted },
                              ]}
                              numberOfLines={1}
                            >
                              {item.name}
                            </Text>
                            {item.isDeleted && (
                              <View style={[s.deletedBadge, { backgroundColor: colors.danger + '15' }]}>
                                <Text style={[s.deletedBadgeText, { color: colors.danger }]}>DEL</Text>
                              </View>
                            )}
                            {stale && (
                              <View style={[s.stalePill, { backgroundColor: colors.danger + '15' }]}>
                                <Ionicons name="time-outline" size={9} color={colors.danger} />
                                <Text style={[s.stalePillText, { color: colors.danger }]}>STALE</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[s.itemMeta, { color: colors.textMuted }]}>
                            Modified {timeAgo(item.updatedAt)} {'\u00B7'} {formatTimestamp(item.updatedAt)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })
      )}

      {/* ═══════ OFFLINE OPERATION QUEUE ═══════ */}
      <Text style={[s.sectionLabel, { color: colors.gold, borderBottomColor: colors.goldBorder, marginTop: SPACING.xl }]}>
        OFFLINE OPERATION QUEUE
      </Text>

      {queueItems.length === 0 ? (
        <View style={[s.emptyCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Ionicons name="cloud-done-outline" size={32} color={colors.success} />
          <Text style={[s.emptyText, { color: colors.textSecondary }]}>No queued operations</Text>
          <Text style={[s.emptySubtext, { color: colors.textMuted }]}>Operations queue when offline</Text>
        </View>
      ) : (
        <>
          <TouchableOpacity
            style={[s.queueHeader, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
            onPress={() => setExpandQueue(!expandQueue)}
            activeOpacity={0.7}
          >
            <Ionicons name="layers-outline" size={16} color={colors.info} />
            <Text style={[s.queueHeaderText, { color: colors.textPrimary }]}>
              {queueItems.length} Operation{queueItems.length !== 1 ? 's' : ''} Queued
            </Text>
            <TouchableOpacity
              style={[s.clearQueueBtn, { borderColor: colors.danger + '40' }]}
              onPress={handleClearQueue}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle-outline" size={12} color={colors.danger} />
              <Text style={[s.clearQueueBtnText, { color: colors.danger }]}>CLEAR</Text>
            </TouchableOpacity>
            <Ionicons
              name={expandQueue ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textMuted}
            />
          </TouchableOpacity>

          {expandQueue && queueItems.map(op => (
            <View
              key={op.id}
              style={[
                s.queueItem,
                { backgroundColor: colors.bgCard, borderColor: colors.border },
                op.retryCount > 0 && { borderLeftColor: colors.danger, borderLeftWidth: 3 },
              ]}
            >
              <View style={s.queueItemTop}>
                <View style={[s.priorityDot, { backgroundColor: PRIORITY_COLORS[op.priority] || colors.textMuted }]} />
                <Text style={[s.queueItemType, { color: colors.textPrimary }]}>
                  {OP_TYPE_LABELS[op.type] || op.type}
                </Text>
                <Text style={[s.queueItemPriority, { color: PRIORITY_COLORS[op.priority] || colors.textMuted }]}>
                  {op.priority.toUpperCase()}
                </Text>
              </View>

              <View style={s.queueItemMeta}>
                <Text style={[s.queueItemMetaText, { color: colors.textMuted }]}>
                  Queued {timeAgo(op.createdAt)} {'\u00B7'} Retries: {op.retryCount}/{op.maxRetries}
                </Text>
              </View>

              {op.lastError && (
                <View style={[s.queueItemError, { backgroundColor: colors.danger + '10' }]}>
                  <Ionicons name="alert-circle" size={11} color={colors.danger} />
                  <Text style={[s.queueItemErrorText, { color: colors.danger }]} numberOfLines={2}>
                    {op.lastError}
                  </Text>
                </View>
              )}

              <View style={s.queueItemActions}>
                <TouchableOpacity
                  style={[s.queueActionBtn, { borderColor: colors.info + '40' }]}
                  onPress={() => handleRetryQueueItem(op)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh-outline" size={12} color={colors.info} />
                  <Text style={[s.queueActionText, { color: colors.info }]}>RETRY</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.queueActionBtn, { borderColor: colors.danger + '40' }]}
                  onPress={() => handleDiscardQueueItem(op)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={12} color={colors.danger} />
                  <Text style={[s.queueActionText, { color: colors.danger }]}>DISCARD</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      {/* ═══════ CONFLICT HISTORY ═══════ */}
      <Text style={[s.sectionLabel, { color: colors.gold, borderBottomColor: colors.goldBorder, marginTop: SPACING.xl }]}>
        CONFLICT RESOLUTION HISTORY
      </Text>
      <ConflictHistoryPanel refreshKey={historyRefreshKey} showToast={showToast} />

      {/* ═══════ CONNECTIVITY & REALTIME INFO ═══════ */}
      <View style={[s.infoCard, { backgroundColor: colors.bgCard, borderColor: colors.border, marginTop: SPACING.xl }]}>
        <Text style={[s.infoTitle, { color: colors.textSecondary }]}>SYNC DIAGNOSTICS</Text>

        <View style={s.infoRow}>
          <Text style={[s.infoLabel, { color: colors.textMuted }]}>Network</Text>
          <View style={s.infoValueRow}>
            <View style={[s.miniDot, { backgroundColor: isOnline ? colors.success : colors.danger }]} />
            <Text style={[s.infoValue, { color: isOnline ? colors.success : colors.danger }]}>
              {isOnline ? 'Connected' : 'Disconnected'}
            </Text>
          </View>
        </View>

        <View style={s.infoRow}>
          <Text style={[s.infoLabel, { color: colors.textMuted }]}>Auth</Text>
          <Text style={[s.infoValue, { color: user ? colors.success : colors.textMuted }]}>
            {user ? user.email : 'Not signed in'}
          </Text>
        </View>

        <View style={s.infoRow}>
          <Text style={[s.infoLabel, { color: colors.textMuted }]}>Sync Status</Text>
          <Text style={[s.infoValue, { color: colors.textSecondary }]}>{syncStatus.toUpperCase()}</Text>
        </View>

        <View style={s.infoRow}>
          <Text style={[s.infoLabel, { color: colors.textMuted }]}>Dirty Rows</Text>
          <Text style={[s.infoValue, { color: colors.textSecondary }]}>{dirtyCount}</Text>
        </View>

        <View style={s.infoRow}>
          <Text style={[s.infoLabel, { color: colors.textMuted }]}>Conflicts</Text>
          <Text style={[s.infoValue, { color: conflictCount > 0 ? colors.warning : colors.textSecondary }]}>
            {conflictCount}
          </Text>
        </View>

        {/* ── Realtime diagnostics ── */}
        <View style={[s.infoSectionDivider, { borderTopColor: colors.border }]}>
          <Text style={[s.infoSectionTitle, { color: colors.info }]}>REALTIME</Text>
        </View>

        <View style={s.infoRow}>
          <Text style={[s.infoLabel, { color: colors.textMuted }]}>Live Sync</Text>
          <View style={s.infoValueRow}>
            <View style={[s.miniDot, { backgroundColor: liveSyncEnabled ? rtStatusCfg.color : colors.textMuted }]} />
            <Text style={[s.infoValue, { color: liveSyncEnabled ? rtStatusCfg.color : colors.textMuted }]}>
              {liveSyncEnabled ? rtStatusCfg.label : 'DISABLED'}
            </Text>
          </View>
        </View>

        <View style={s.infoRow}>
          <Text style={[s.infoLabel, { color: colors.textMuted }]}>RT Events</Text>
          <Text style={[s.infoValue, { color: colors.textSecondary }]}>{rtStats.totalEventsReceived}</Text>
        </View>

        <View style={s.infoRow}>
          <Text style={[s.infoLabel, { color: colors.textMuted }]}>RT Merged</Text>
          <Text style={[s.infoValue, { color: colors.textSecondary }]}>{rtStats.totalRowsMerged}</Text>
        </View>

        <View style={s.infoRow}>
          <Text style={[s.infoLabel, { color: colors.textMuted }]}>RT Conflicts</Text>
          <Text style={[s.infoValue, { color: rtStats.totalConflictsDetected > 0 ? colors.warning : colors.textSecondary }]}>
            {rtStats.totalConflictsDetected}
          </Text>
        </View>

        {rtStats.connectedAt && (
          <View style={s.infoRow}>
            <Text style={[s.infoLabel, { color: colors.textMuted }]}>Connected Since</Text>
            <Text style={[s.infoValue, { color: colors.textSecondary }]}>
              {timeAgo(rtStats.connectedAt)}
            </Text>
          </View>
        )}

        {rtStats.lastEventAt && (
          <View style={s.infoRow}>
            <Text style={[s.infoLabel, { color: colors.textMuted }]}>Last RT Event</Text>
            <Text style={[s.infoValue, { color: colors.textSecondary }]}>
              {timeAgo(rtStats.lastEventAt)}
            </Text>
          </View>
        )}

        {/* ── Batch sync diagnostics ── */}
        <View style={[s.infoSectionDivider, { borderTopColor: colors.border }]}>
          <Text style={[s.infoSectionTitle, { color: colors.gold }]}>BATCH SYNC</Text>
        </View>

        {lastSyncResult && (
          <>
            <View style={s.infoRow}>
              <Text style={[s.infoLabel, { color: colors.textMuted }]}>Last Push</Text>
              <Text style={[s.infoValue, { color: colors.textSecondary }]}>{lastSyncResult.pushed} rows</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={[s.infoLabel, { color: colors.textMuted }]}>Last Pull</Text>
              <Text style={[s.infoValue, { color: colors.textSecondary }]}>{lastSyncResult.pulled} rows</Text>
            </View>
            {'conflicts' in lastSyncResult && (
              <View style={s.infoRow}>
                <Text style={[s.infoLabel, { color: colors.textMuted }]}>Last Conflicts</Text>
                <Text style={[s.infoValue, { color: (lastSyncResult as any).conflicts > 0 ? colors.warning : colors.textSecondary }]}>
                  {(lastSyncResult as any).conflicts || 0}
                </Text>
              </View>
            )}
            {lastSyncResult.errors.length > 0 && (
              <View style={s.infoRow}>
                <Text style={[s.infoLabel, { color: colors.textMuted }]}>Errors</Text>
                <Text style={[s.infoValue, { color: colors.danger }]}>{lastSyncResult.errors.length}</Text>
              </View>
            )}
          </>
        )}

        {connectivity.lastOnlineAt && (
          <View style={s.infoRow}>
            <Text style={[s.infoLabel, { color: colors.textMuted }]}>Last Online</Text>
            <Text style={[s.infoValue, { color: colors.textSecondary }]}>
              {timeAgo(connectivity.lastOnlineAt)}
            </Text>
          </View>
        )}

        <View style={s.infoRow}>
          <Text style={[s.infoLabel, { color: colors.textMuted }]}>Reconnects</Text>
          <Text style={[s.infoValue, { color: colors.textSecondary }]}>{connectivity.reconnectCount}</Text>
        </View>
      </View>

      {/* ═══════ CONFLICT RESOLUTION MODAL ═══════ */}
      <ConflictResolutionModal
        visible={conflictModalVisible}
        conflicts={pendingConflicts}
        onClose={() => setConflictModalVisible(false)}
        onResolved={handleConflictsResolved}
        showToast={showToast}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Live Sync card
  liveSyncCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  liveSyncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveSyncIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveSyncInfo: {
    flex: 1,
  },
  liveSyncTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveSyncTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  rtStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  rtStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  rtStatusText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  liveSyncDesc: {
    fontSize: 10,
    marginTop: 2,
  },
  liveSyncStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
  },
  liveSyncStat: {
    flex: 1,
    alignItems: 'center',
  },
  liveSyncStatValue: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  liveSyncStatLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 1,
  },
  liveSyncStatDivider: {
    width: 1,
    height: 22,
  },
  connectedSince: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
  },
  connectedSinceText: {
    fontSize: 9,
    fontFamily: 'Courier',
  },

  // Realtime events
  rtEventsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  rtEventsHeaderText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  rtEventsCount: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  rtEventsCountText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  rtEventsList: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  rtEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  rtEventInfo: {
    flex: 1,
  },
  rtEventTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rtEventName: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  rtEventTypeBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  rtEventTypeText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  rtConflictBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rtEventMeta: {
    fontSize: 9,
    fontFamily: 'Courier',
    marginTop: 1,
  },

  // Status card
  statusCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.md,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    flex: 1,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  offlineBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // KPI row
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kpiItem: {
    flex: 1,
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  kpiLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  kpiDivider: {
    width: 1,
    height: 28,
  },

  // Last sync
  lastSyncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
  },
  lastSyncText: {
    fontSize: 11,
    fontFamily: 'Courier',
  },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  errorBannerText: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },

  // Conflict alert banner
  conflictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    marginBottom: SPACING.md,
  },
  conflictBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  conflictBannerInfo: {
    flex: 1,
  },
  conflictBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  conflictBannerDesc: {
    fontSize: 10,
    marginTop: 2,
  },
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
  },
  resolveBtnText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Conflict card
  conflictCard: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  conflictCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conflictCardTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  conflictTableBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  conflictTableText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  conflictCardMeta: {
    marginTop: 4,
    paddingLeft: 22,
  },
  conflictCardMetaText: {
    fontSize: 10,
    fontFamily: 'Courier',
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  syncNowBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: RADIUS.sm,
  },
  syncNowText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
  discardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  discardBtnText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    paddingBottom: 6,
  },

  // Loading
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: SPACING.lg,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
  },

  // Empty state
  emptyCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 11,
  },

  // Group card
  groupCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: SPACING.md,
  },
  groupLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  staleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  staleBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },

  // Group items
  groupItems: {
    borderTopWidth: 1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  itemInfo: {
    flex: 1,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemName: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  deletedBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  deletedBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  stalePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  stalePillText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  itemMeta: {
    fontSize: 10,
    marginTop: 2,
    fontFamily: 'Courier',
  },

  // Queue header
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  queueHeaderText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  clearQueueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  clearQueueBtnText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Queue item
  queueItem: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  queueItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  queueItemType: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  queueItemPriority: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  queueItemMeta: {
    marginTop: 4,
    paddingLeft: 16,
  },
  queueItemMetaText: {
    fontSize: 10,
    fontFamily: 'Courier',
  },
  queueItemError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    padding: 6,
    borderRadius: 4,
  },
  queueItemErrorText: {
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
  },
  queueItemActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingLeft: 16,
  },
  queueActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
  },
  queueActionText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Info card
  infoCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.md,
  },
  infoTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: SPACING.sm,
  },
  infoSectionDivider: {
    borderTopWidth: 1,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  infoSectionTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  infoValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  infoValue: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
});







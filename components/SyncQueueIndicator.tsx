/**
 * Sync Queue Indicator
 *
 * A visible, always-present indicator that shows:
 * - Number of pending sync actions (from syncActionQueue + offlineQueue)
 * - Current sync status (idle, syncing, offline, error)
 * - Expandable drawer with queue details and action history
 * - Category breakdown of pending changes
 * - Retry/clear controls for failed actions
 * - Persistence backend indicator (IndexedDB vs localStorage)
 * - Combined badge count from both sync and offline queues
 * - Queue conflict count and resolution trigger
 *
 * Positioned in the Header bar next to the existing sync indicators.
 * Animated badge with pulse when actions are pending.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';
import { useTheme } from '../context/ThemeContext';
import { GOLD_RAIL } from '../lib/theme';

import {
  syncActionQueue,
  ACTION_CATEGORY_MAP,
  ACTION_ICON_MAP,
  type QueueStats,
  type QueueSyncStatus,
  type SyncAction,
} from '../lib/syncActionQueue';

import {
  ERROR_CATEGORY_LABELS,
  ERROR_CATEGORY_COLORS,
  ERROR_CATEGORY_ICONS,
  type ErrorCategory,
} from '../lib/retryClassifier';

import { offlineQueue } from '../lib/offlineQueue';
import { conflictResolver, type QueueConflict } from '../lib/conflictResolver';
import ConflictResolutionSheet from './sync/ConflictResolutionSheet';


// ── Status Config ─────────────────────────────────────────────

interface StatusConfig {
  icon: string;
  color: string;
  label: string;
  bgColor: string;
  borderColor: string;
}

function getStatusConfig(status: QueueSyncStatus, pendingCount: number, palette: any): StatusConfig {
  if (status === 'syncing') {
    return {
      icon: 'sync-outline',
      color: '#5A9BD5',
      label: 'SYNCING',
      bgColor: 'rgba(90,155,213,0.08)',
      borderColor: 'rgba(90,155,213,0.25)',
    };
  }
  if (status === 'offline' && pendingCount > 0) {
    return {
      icon: 'cloud-offline-outline',
      color: '#FF9500',
      label: 'QUEUED',
      bgColor: 'rgba(255,149,0,0.08)',
      borderColor: 'rgba(255,149,0,0.25)',
    };
  }
  if (status === 'error') {
    return {
      icon: 'alert-circle-outline',
      color: '#FF3B30',
      label: 'ERROR',
      bgColor: 'rgba(255,59,48,0.08)',
      borderColor: 'rgba(255,59,48,0.25)',
    };
  }
  if (status === 'partial') {
    return {
      icon: 'warning-outline',
      color: '#FF9500',
      label: 'PARTIAL',
      bgColor: 'rgba(255,149,0,0.08)',
      borderColor: 'rgba(255,149,0,0.25)',
    };
  }
  if (pendingCount > 0) {
    return {
      icon: 'arrow-up-circle-outline',
      color: palette.amber || '#C48A2C',
      label: 'PENDING',
      bgColor: 'rgba(196,138,44,0.08)',
      borderColor: 'rgba(196,138,44,0.25)',
    };
  }
  // Idle with nothing pending
  return {
    icon: 'checkmark-circle-outline',
    color: '#3E6B3E',
    label: 'SYNCED',
    bgColor: 'rgba(62,107,62,0.08)',
    borderColor: 'rgba(62,107,62,0.25)',
  };
}

// ── Component ─────────────────────────────────────────────────

export default function SyncQueueIndicator() {
  const { palette, colors } = useTheme();
  const [stats, setStats] = useState<QueueStats>(syncActionQueue.stats);
  const [offlineCount, setOfflineCount] = useState(offlineQueue.size);
  const [conflictCount, setConflictCount] = useState(conflictResolver.pendingCount);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [conflictSheetVisible, setConflictSheetVisible] = useState(false);
  const [activeDrawerTab, setActiveDrawerTab] = useState<'queue' | 'history' | 'offline' | 'conflicts'>('queue');

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinRef = useRef<Animated.CompositeAnimation | null>(null);
  const badgeScaleAnim = useRef(new Animated.Value(0)).current;

  // Subscribe to queue changes
  useEffect(() => {
    const unsub = syncActionQueue.onChange((newStats) => {
      setStats(newStats);
    });
    return unsub;
  }, []);

  // Subscribe to offline queue changes
  useEffect(() => {
    const unsub = offlineQueue.onChange((queue) => {
      setOfflineCount(queue.length);
    });
    return unsub;
  }, []);

  // Subscribe to conflict changes
  useEffect(() => {
    const unsub = conflictResolver.onChange((conflicts) => {
      setConflictCount(conflicts.filter(c => c.status === 'pending').length);
    });
    return unsub;
  }, []);

  // Combined count for badge (include conflicts)
  const totalBadgeCount = stats.pendingCount + stats.failedCount + offlineCount + conflictCount;

  const handleOpenConflicts = useCallback(() => {
    setDrawerVisible(false);
    setConflictSheetVisible(true);
  }, []);


  useEffect(() => {
    if (totalBadgeCount > 0 && stats.status !== 'syncing') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseRef.current = anim;
      anim.start();
    } else {
      if (pulseRef.current) {
        pulseRef.current.stop();
        pulseRef.current = null;
      }
      pulseAnim.setValue(1);
    }

    return () => {
      if (pulseRef.current) {
        pulseRef.current.stop();
        pulseRef.current = null;
      }
    };
  }, [totalBadgeCount, stats.status, pulseAnim]);

  // Spin animation when syncing
  useEffect(() => {
    if (stats.status === 'syncing') {
      spinAnim.setValue(0);
      const anim = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spinRef.current = anim;
      anim.start();
    } else {
      if (spinRef.current) {
        spinRef.current.stop();
        spinRef.current = null;
      }
      spinAnim.setValue(0);
    }

    return () => {
      if (spinRef.current) {
        spinRef.current.stop();
        spinRef.current = null;
      }
    };
  }, [stats.status, spinAnim]);

  // Badge scale animation
  useEffect(() => {
    const target = totalBadgeCount > 0 ? 1 : 0;
    Animated.spring(badgeScaleAnim, {
      toValue: target,
      friction: 6,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [totalBadgeCount, badgeScaleAnim]);

  const spinRotation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const config = getStatusConfig(stats.status, totalBadgeCount, palette);

  const handleRetryFailed = useCallback(() => {
    syncActionQueue.retryFailed();
  }, []);

  const handleClearFailed = useCallback(() => {
    syncActionQueue.clearFailed();
  }, []);

  const handleClearAll = useCallback(() => {
    syncActionQueue.clearAll();
  }, []);

  const handleForceSync = useCallback(() => {
    syncActionQueue.processQueue();
  }, []);

  const handleProcessOffline = useCallback(() => {
    offlineQueue.processQueue();
  }, []);

  const handleClearOffline = useCallback(() => {
    offlineQueue.clearAll();
    setOfflineCount(0);
  }, []);

  // Format relative time
  const formatRelativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return new Date(iso).toLocaleDateString();
  };

  // Don't render anything if queue is idle and empty
  const showIndicator = totalBadgeCount > 0 || stats.status === 'syncing' || stats.status === 'error';

  if (!showIndicator) return null;

  return (
    <>
      {/* ── Compact Badge ── */}
      <Animated.View style={{ opacity: stats.status === 'syncing' ? 1 : pulseAnim }}>
        <TouchableOpacity
          style={[
            styles.badge,
            {
              backgroundColor: config.bgColor,
              borderColor: config.borderColor,
            },
          ]}
          onPress={() => setDrawerVisible(true)}
          activeOpacity={0.7}
        >
          {stats.status === 'syncing' ? (
            <Animated.View style={{ transform: [{ rotate: spinRotation }] }}>
              <Ionicons name="sync-outline" size={11} color={config.color} />
            </Animated.View>
          ) : (
            <Ionicons name={config.icon as any} size={11} color={config.color} />
          )}

          {totalBadgeCount > 0 && (
            <Animated.View
              style={[
                styles.countPill,
                {
                  backgroundColor: config.color,
                  transform: [{ scale: badgeScaleAnim }],
                },
              ]}
            >
              <Text style={styles.countText}>
                {totalBadgeCount > 99 ? '99+' : totalBadgeCount}
              </Text>
            </Animated.View>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* ── Expanded Drawer Modal ── */}
      <Modal
        visible={drawerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDrawerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setDrawerVisible(false)}
          />
          <View style={[styles.drawer, { backgroundColor: palette.panel, borderColor: GOLD_RAIL.section }]}>
            {/* Header */}
            <View style={[styles.drawerHeader, { borderBottomColor: GOLD_RAIL.section }]}>
              <View style={styles.drawerTitleRow}>
                <Ionicons name="layers-outline" size={16} color={palette.amber} />
                <Text style={[styles.drawerTitle, { color: palette.text }]}>SYNC QUEUE</Text>
                <View style={[styles.statusChip, { backgroundColor: config.bgColor, borderColor: config.borderColor }]}>
                  <View style={[styles.statusDot, { backgroundColor: config.color }]} />
                  <Text style={[styles.statusLabel, { color: config.color }]}>{config.label}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setDrawerVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={palette.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Stats Row */}
            <View style={[styles.statsRow, { borderBottomColor: GOLD_RAIL.subsection }]}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: palette.amber }]}>{stats.pendingCount}</Text>
                <Text style={[styles.statLabel, { color: palette.textMuted }]}>PENDING</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: GOLD_RAIL.major }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: stats.failedCount > 0 ? '#FF3B30' : palette.textMuted }]}>
                  {stats.failedCount}
                </Text>
                <Text style={[styles.statLabel, { color: palette.textMuted }]}>FAILED</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: GOLD_RAIL.major }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: '#3E6B3E' }]}>{stats.totalProcessed}</Text>
                <Text style={[styles.statLabel, { color: palette.textMuted }]}>SYNCED</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: GOLD_RAIL.major }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: offlineCount > 0 ? '#FF9500' : palette.textMuted }]}>
                  {offlineCount}
                </Text>
                <Text style={[styles.statLabel, { color: palette.textMuted }]}>OFFLINE</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: GOLD_RAIL.major }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: palette.textMuted }]}>
                  {stats.isOnline ? 'YES' : 'NO'}
                </Text>
                <Text style={[styles.statLabel, { color: palette.textMuted }]}>ONLINE</Text>
              </View>
            </View>

            {/* Persistence Backend Indicator */}
            <View style={[styles.persistenceRow, { borderBottomColor: GOLD_RAIL.subsection }]}>
              <Ionicons
                name={stats.persistenceBackend === 'indexeddb' ? 'server-outline' : 'document-outline'}
                size={10}
                color={stats.persistenceBackend === 'indexeddb' ? '#3E6B3E' : palette.textMuted}
              />
              <Text style={[styles.persistenceText, {
                color: stats.persistenceBackend === 'indexeddb' ? '#3E6B3E' : palette.textMuted,
              }]}>
                {stats.persistenceBackend === 'indexeddb' ? 'IndexedDB' : 'localStorage'} persistence
              </Text>
            </View>

            {/* Category Breakdown */}
            {Object.keys(stats.pendingByCategory).length > 0 && (
              <View style={[styles.categoryRow, { borderBottomColor: GOLD_RAIL.subsection }]}>
                {Object.entries(stats.pendingByCategory).map(([cat, count]) => (
                  <View
                    key={cat}
                    style={[styles.categoryChip, { backgroundColor: palette.amber + '10', borderColor: palette.amber + '25' }]}
                  >
                    <Text style={[styles.categoryText, { color: palette.amber }]}>
                      {cat} ({count})
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Tab Toggle */}
            <View style={[styles.tabRow, { borderBottomColor: GOLD_RAIL.section }]}>

              <TouchableOpacity
                style={[
                  styles.tabBtn,
                  activeDrawerTab === 'queue' && { borderBottomColor: palette.amber, borderBottomWidth: 2 },
                ]}
                onPress={() => setActiveDrawerTab('queue')}
              >
                <Text style={[
                  styles.tabText,
                  { color: activeDrawerTab === 'queue' ? palette.amber : palette.textMuted },
                ]}>
                  QUEUE ({stats.pendingCount + stats.failedCount})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tabBtn,
                  activeDrawerTab === 'offline' && { borderBottomColor: palette.amber, borderBottomWidth: 2 },
                ]}
                onPress={() => setActiveDrawerTab('offline')}
              >
                <Text style={[
                  styles.tabText,
                  { color: activeDrawerTab === 'offline' ? palette.amber : palette.textMuted },
                ]}>
                  OFFLINE ({offlineCount})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tabBtn,
                  activeDrawerTab === 'history' && { borderBottomColor: palette.amber, borderBottomWidth: 2 },
                ]}
                onPress={() => setActiveDrawerTab('history')}
              >
                <Text style={[
                  styles.tabText,
                  { color: activeDrawerTab === 'history' ? palette.amber : palette.textMuted },
                ]}>
                  HISTORY ({stats.recentActions.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {activeDrawerTab === 'queue' ? (
                <>
                  {syncActionQueue.queue.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="checkmark-circle-outline" size={28} color={palette.textMuted + '60'} />
                      <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                        All actions synced
                      </Text>
                    </View>
                  ) : (
                    syncActionQueue.queue.map((action) => (
                      <ActionRow
                        key={action.id}
                        action={action}
                        palette={palette}
                        showStatus
                      />
                    ))
                  )}
                </>
              ) : activeDrawerTab === 'offline' ? (
                <>
                  {offlineQueue.queue.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="cloud-done-outline" size={28} color={palette.textMuted + '60'} />
                      <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                        No offline operations queued
                      </Text>
                    </View>
                  ) : (
                    offlineQueue.queue.map((op) => (
                      <OfflineOpRow
                        key={op.id}
                        op={op}
                        palette={palette}
                      />
                    ))
                  )}
                </>
              ) : (
                <>
                  {stats.recentActions.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="time-outline" size={28} color={palette.textMuted + '60'} />
                      <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                        No recent sync history
                      </Text>
                    </View>
                  ) : (
                    stats.recentActions.map((action) => (
                      <ActionRow
                        key={action.id}
                        action={action}
                        palette={palette}
                        showStatus={false}
                      />
                    ))
                  )}
                </>
              )}
            </ScrollView>

            {/* Action Buttons */}
            <View style={[styles.actionBar, { borderTopColor: palette.border + '40' }]}>
              {stats.failedCount > 0 && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: 'rgba(255,149,0,0.08)', borderColor: 'rgba(255,149,0,0.25)' }]}
                    onPress={handleRetryFailed}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="refresh-outline" size={12} color="#FF9500" />
                    <Text style={[styles.actionBtnText, { color: '#FF9500' }]}>RETRY FAILED</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: 'rgba(255,59,48,0.06)', borderColor: 'rgba(255,59,48,0.2)' }]}
                    onPress={handleClearFailed}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={12} color="#FF3B30" />
                    <Text style={[styles.actionBtnText, { color: '#FF3B30' }]}>CLEAR FAILED</Text>
                  </TouchableOpacity>
                </>
              )}
              {stats.pendingCount > 0 && stats.isOnline && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: 'rgba(90,155,213,0.08)', borderColor: 'rgba(90,155,213,0.25)' }]}
                  onPress={handleForceSync}
                  activeOpacity={0.7}
                >
                  <Ionicons name="push-outline" size={12} color="#5A9BD5" />
                  <Text style={[styles.actionBtnText, { color: '#5A9BD5' }]}>SYNC NOW</Text>
                </TouchableOpacity>
              )}
              {offlineCount > 0 && stats.isOnline && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: 'rgba(90,155,213,0.08)', borderColor: 'rgba(90,155,213,0.25)' }]}
                  onPress={handleProcessOffline}
                  activeOpacity={0.7}
                >
                  <Ionicons name="cloud-upload-outline" size={12} color="#5A9BD5" />
                  <Text style={[styles.actionBtnText, { color: '#5A9BD5' }]}>FLUSH OFFLINE</Text>
                </TouchableOpacity>
              )}
              {offlineCount > 0 && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: 'rgba(255,59,48,0.06)', borderColor: 'rgba(255,59,48,0.2)' }]}
                  onPress={handleClearOffline}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={12} color="#FF3B30" />
                  <Text style={[styles.actionBtnText, { color: '#FF3B30' }]}>CLEAR OFFLINE</Text>
                </TouchableOpacity>
              )}
              {(stats.pendingCount > 0 || stats.failedCount > 0) && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: palette.panel, borderColor: palette.border }]}
                  onPress={handleClearAll}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle-outline" size={12} color={palette.textMuted} />
                  <Text style={[styles.actionBtnText, { color: palette.textMuted }]}>CLEAR ALL</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Last Sync Info */}
            {stats.lastSyncAt && (
              <View style={[styles.lastSyncRow, { borderTopColor: palette.border + '20' }]}>
                <Ionicons name="time-outline" size={10} color={palette.textMuted} />
                <Text style={[styles.lastSyncText, { color: palette.textMuted }]}>
                  Last sync: {formatRelativeTime(stats.lastSyncAt)}
                </Text>
                {stats.lastError && (
                  <Text style={[styles.lastErrorText, { color: '#FF3B30' }]} numberOfLines={2}>

                    {stats.lastError}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Action Row Sub-Component ──────────────────────────────────

function ActionRow({
  action,
  palette,
  showStatus,
}: {
  action: SyncAction;
  palette: any;
  showStatus: boolean;
}) {
  const icon = ACTION_ICON_MAP[action.type] || 'sync-outline';
  const category = ACTION_CATEGORY_MAP[action.type] || 'General';

  const statusColor =
    action.status === 'completed' ? '#3E6B3E' :
    action.status === 'failed' ? '#FF3B30' :
    action.status === 'processing' ? '#5A9BD5' :
    action.status === 'retrying' ? '#FF9500' :
    palette.textMuted;

  const statusLabel =
    action.status === 'completed' ? 'DONE' :
    action.status === 'failed' ? 'FAIL' :
    action.status === 'processing' ? 'SYNC' :
    action.status === 'retrying' ? `RETRY ${action.retryCount}` :
    'WAIT';

  const timeDiff = Date.now() - new Date(action.createdAt).getTime();
  const timeLabel = timeDiff < 60000 ? `${Math.floor(timeDiff / 1000)}s` :
    timeDiff < 3600000 ? `${Math.floor(timeDiff / 60000)}m` :
    `${Math.floor(timeDiff / 3600000)}h`;

  // Error category badge (from retryClassifier)
  const errCat = action.errorCategory as ErrorCategory | undefined;
  const errCatLabel = errCat ? ERROR_CATEGORY_LABELS[errCat] : null;
  const errCatColor = errCat ? ERROR_CATEGORY_COLORS[errCat] : null;
  const errCatIcon = errCat ? ERROR_CATEGORY_ICONS[errCat] : null;

  return (
    <View style={[actionStyles.row, { borderBottomColor: palette.border + '20' }]}>
      <View style={[actionStyles.iconWrap, { backgroundColor: statusColor + '12' }]}>
        <Ionicons name={icon as any} size={12} color={statusColor} />
      </View>
      <View style={actionStyles.info}>
        <Text style={[actionStyles.desc, { color: palette.text }]} numberOfLines={2}>
          {action.description}
        </Text>

        <View style={actionStyles.metaRow}>
          <Text style={[actionStyles.category, { color: palette.textMuted }]}>{category}</Text>
          <Text style={[actionStyles.time, { color: palette.textMuted }]}>{timeLabel}</Text>
          {/* Error category badge */}
          {errCatLabel && errCatColor && (
            <View style={[
              actionStyles.errCatBadge,
              { backgroundColor: errCatColor + '15', borderColor: errCatColor + '35' },
            ]}>
              {errCatIcon && (
                <Ionicons name={errCatIcon as any} size={7} color={errCatColor} />
              )}
              <Text style={[actionStyles.errCatText, { color: errCatColor }]}>
                {errCatLabel}
              </Text>
              {action.lastHttpStatus && (
                <Text style={[actionStyles.errCatText, { color: errCatColor, opacity: 0.7 }]}>
                  {action.lastHttpStatus}
                </Text>
              )}
            </View>
          )}
        </View>
        {action.lastError && (
          <Text style={[actionStyles.error, { color: '#FF3B30' }]} numberOfLines={2}>
            {action.lastError}
          </Text>
        )}
      </View>
      {showStatus && (
        <View style={[actionStyles.statusBadge, { backgroundColor: statusColor + '15', borderColor: statusColor + '30' }]}>
          <Text style={[actionStyles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      )}
    </View>
  );
}


// ── Offline Operation Row Sub-Component ───────────────────────

function OfflineOpRow({
  op,
  palette,
}: {
  op: { id: string; type: string; priority: string; createdAt: string; retryCount: number; maxRetries: number; lastError?: string };
  palette: any;
}) {
  const typeColor =
    op.priority === 'critical' ? '#FF3B30' :
    op.priority === 'normal' ? palette.amber || '#C48A2C' :
    palette.textMuted;

  const timeDiff = Date.now() - new Date(op.createdAt).getTime();
  const timeLabel = timeDiff < 60000 ? `${Math.floor(timeDiff / 1000)}s` :
    timeDiff < 3600000 ? `${Math.floor(timeDiff / 60000)}m` :
    `${Math.floor(timeDiff / 3600000)}h`;

  return (
    <View style={[actionStyles.row, { borderBottomColor: palette.border + '20' }]}>
      <View style={[actionStyles.iconWrap, { backgroundColor: typeColor + '12' }]}>
        <Ionicons name="cloud-offline-outline" size={12} color={typeColor} />
      </View>
      <View style={actionStyles.info}>
        <Text style={[actionStyles.desc, { color: palette.text }]} numberOfLines={1}>
          {op.type.replace(/_/g, ' ')}
        </Text>
        <View style={actionStyles.metaRow}>
          <Text style={[actionStyles.category, { color: palette.textMuted }]}>
            {op.priority.toUpperCase()}
          </Text>
          <Text style={[actionStyles.time, { color: palette.textMuted }]}>{timeLabel}</Text>
          {op.retryCount > 0 && (
            <Text style={[actionStyles.time, { color: '#FF9500' }]}>
              retry {op.retryCount}/{op.maxRetries}
            </Text>
          )}
          {op.lastError && (
            <Text style={[actionStyles.error, { color: '#FF3B30' }]} numberOfLines={1}>
              {op.lastError}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    position: 'relative',
  },
  countPill: {
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  countText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#FFFFFF',
    fontFamily: 'Courier',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    maxHeight: '75%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },

  // Header
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  drawerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  drawerTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
  },
  closeBtn: {
    padding: 4,
  },

  // Status chip
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  statLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: '80%',
    alignSelf: 'center',
    opacity: 0.3,
  },

  // Persistence indicator
  persistenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderBottomWidth: 1,
  },
  persistenceText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Categories
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
  },

  // Content
  content: {
    maxHeight: 280,
    paddingHorizontal: 12,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Last sync
  lastSyncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  lastSyncText: {
    fontSize: 8,
    fontWeight: '600',
  },
  lastErrorText: {
    fontSize: 8,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
});

const actionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  desc: {
    fontSize: 11,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  category: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  time: {
    fontSize: 8,
    fontWeight: '600',
  },
  error: {
    fontSize: 8,
    fontWeight: '600',
    marginTop: 2,
    color: '#FF3B30',
  },
  errCatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  errCatText: {
    fontSize: 6,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },
});





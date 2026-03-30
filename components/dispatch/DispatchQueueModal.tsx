// ============================================================
// ECS DISPATCH — OFFLINE QUEUE VIEWER MODAL
// ============================================================
// Shows all queued dispatch events with their status, allows
// deleting individual items, retrying failed items, clearing
// all, and manually triggering a flush.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ScrollView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { dispatchQueue } from '../../lib/dispatchQueueStore';
import type { QueuedDispatchEvent, FlushResult } from '../../lib/dispatchQueueStore';
import { EVENT_TYPE_META } from '../../lib/dispatchTypes';
import { connectivity } from '../../lib/connectivity';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Filter to a specific expedition (optional) */
  expeditionId?: string;
  /** Called after successful flush with created events */
  onFlushed?: (result: FlushResult) => void;
}

// ── Status display config ────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending:  { label: 'PENDING',  color: TACTICAL.amber,    icon: 'time-outline' },
  sending:  { label: 'SENDING',  color: '#42A5F5',         icon: 'sync-outline' },
  failed:   { label: 'FAILED',   color: TACTICAL.danger,   icon: 'alert-circle-outline' },
};

function formatQueuedTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;

  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DispatchQueueModal({
  visible,
  onClose,
  expeditionId,
  onFlushed,
}: Props) {
  const [items, setItems] = useState<QueuedDispatchEvent[]>([]);
  const [flushing, setFlushing] = useState(false);
  const [isOnline, setIsOnline] = useState(connectivity.isOnline());
  const [lastFlushResult, setLastFlushResult] = useState<FlushResult | null>(null);

  // Subscribe to queue changes
  useEffect(() => {
    if (!visible) return;

    const updateItems = (queue: QueuedDispatchEvent[]) => {
      const filtered = expeditionId
        ? queue.filter(i => i.expedition_id === expeditionId)
        : queue;
      setItems(filtered);
      setFlushing(dispatchQueue.isFlushing);
    };

    // Initial load
    const initial = expeditionId
      ? dispatchQueue.getByExpedition(expeditionId)
      : dispatchQueue.queue;
    setItems(initial);

    const unsub = dispatchQueue.onChange(updateItems);

    // Track connectivity
    const connUnsub = connectivity.onStatusChange((status) => {
      setIsOnline(status === 'online');
    });
    setIsOnline(connectivity.isOnline());

    return () => {
      unsub();
      connUnsub();
    };
  }, [visible, expeditionId]);

  // ── Actions ────────────────────────────────────────────────

  const handleFlush = async () => {
    setFlushing(true);
    setLastFlushResult(null);
    try {
      const result = expeditionId
        ? await dispatchQueue.flushExpedition(expeditionId)
        : await dispatchQueue.flush();
      setLastFlushResult(result);
      onFlushed?.(result);
    } catch (err: any) {
      setLastFlushResult({
        sent: 0,
        failed: 0,
        remaining: items.length,
        errors: [{ id: 'flush', error: err.message || 'Flush failed' }],
        created: [],
      });
    }
    setFlushing(false);
  };

  const handleDeleteItem = (id: string) => {
    const doDelete = () => {
      dispatchQueue.dequeue(id);
    };

    if (Platform.OS === 'web') {
      if (confirm('Remove this queued event? It will not be sent.')) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Remove Queued Event',
        'This event will be permanently removed and will not be sent.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const handleRetryItem = (id: string) => {
    dispatchQueue.retryItem(id);
  };

  const handleRetryAllFailed = () => {
    dispatchQueue.retryAllFailed();
  };

  const handleClearAll = () => {
    const doClear = () => {
      if (expeditionId) {
        dispatchQueue.clearExpedition(expeditionId);
      } else {
        dispatchQueue.clearAll();
      }
    };

    if (Platform.OS === 'web') {
      if (confirm('Remove all queued events? They will not be sent.')) {
        doClear();
      }
    } else {
      Alert.alert(
        'Clear Queue',
        'All queued events will be permanently removed.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear All', style: 'destructive', onPress: doClear },
        ]
      );
    }
  };

  // ── Derived state ──────────────────────────────────────────
  const pendingCount = items.filter(i => i.status === 'pending').length;
  const failedCount = items.filter(i => i.status === 'failed' && i.retry_count >= i.max_retries).length;
  const sendingCount = items.filter(i => i.status === 'sending').length;
  const retryableCount = items.filter(i => i.status === 'failed').length;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* ── Header ──────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons name="cloud-upload-outline" size={16} color={TACTICAL.amber} />
              </View>
              <View>
                <Text style={styles.headerTitle}>DISPATCH QUEUE</Text>
                <Text style={styles.headerSubtitle}>
                  {items.length} event{items.length !== 1 ? 's' : ''} queued
                  {!isOnline ? ' (offline)' : ''}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          {/* ── Status Summary ─────────────────────────────── */}
          <View style={styles.statusRow}>
            {pendingCount > 0 && (
              <View style={styles.statusChip}>
                <Ionicons name="time-outline" size={10} color={TACTICAL.amber} />
                <Text style={[styles.statusChipText, { color: TACTICAL.amber }]}>
                  {pendingCount} PENDING
                </Text>
              </View>
            )}
            {sendingCount > 0 && (
              <View style={styles.statusChip}>
                <Ionicons name="sync-outline" size={10} color="#42A5F5" />
                <Text style={[styles.statusChipText, { color: '#42A5F5' }]}>
                  {sendingCount} SENDING
                </Text>
              </View>
            )}
            {failedCount > 0 && (
              <View style={styles.statusChip}>
                <Ionicons name="alert-circle-outline" size={10} color={TACTICAL.danger} />
                <Text style={[styles.statusChipText, { color: TACTICAL.danger }]}>
                  {failedCount} FAILED
                </Text>
              </View>
            )}
            {!isOnline && (
              <View style={[styles.statusChip, styles.offlineChip]}>
                <View style={styles.offlineDot} />
                <Text style={styles.offlineChipText}>OFFLINE</Text>
              </View>
            )}
          </View>

          {/* ── Action Buttons ─────────────────────────────── */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[
                styles.flushBtn,
                (!isOnline || flushing || pendingCount === 0) && styles.flushBtnDisabled,
              ]}
              onPress={handleFlush}
              disabled={!isOnline || flushing || pendingCount === 0}
              activeOpacity={0.7}
            >
              {flushing ? (
                <ActivityIndicator size={12} color="#0B0F12" />
              ) : (
                <Ionicons name="cloud-upload-outline" size={13} color="#0B0F12" />
              )}
              <Text style={styles.flushBtnText}>
                {flushing ? 'SENDING...' : isOnline ? 'SEND NOW' : 'OFFLINE'}
              </Text>
            </TouchableOpacity>

            {retryableCount > 0 && (
              <TouchableOpacity
                style={styles.retryAllBtn}
                onPress={handleRetryAllFailed}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={12} color={TACTICAL.amber} />
                <Text style={styles.retryAllBtnText}>RETRY FAILED</Text>
              </TouchableOpacity>
            )}

            {items.length > 0 && (
              <TouchableOpacity
                style={styles.clearAllBtn}
                onPress={handleClearAll}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={12} color={TACTICAL.danger} />
              </TouchableOpacity>
            )}
          </View>

          {/* ── Flush Result Banner ────────────────────────── */}
          {lastFlushResult && (
            <View style={[
              styles.flushResultBanner,
              lastFlushResult.errors.length > 0 && styles.flushResultBannerError,
            ]}>
              {lastFlushResult.sent > 0 && (
                <View style={styles.flushResultRow}>
                  <Ionicons name="checkmark-circle-outline" size={12} color="#66BB6A" />
                  <Text style={[styles.flushResultText, { color: '#66BB6A' }]}>
                    {lastFlushResult.sent} event{lastFlushResult.sent !== 1 ? 's' : ''} sent successfully
                  </Text>
                </View>
              )}
              {lastFlushResult.errors.length > 0 && (
                <View style={styles.flushResultRow}>
                  <Ionicons name="alert-circle-outline" size={12} color={TACTICAL.danger} />
                  <Text style={[styles.flushResultText, { color: TACTICAL.danger }]}>
                    {lastFlushResult.errors.length} error{lastFlushResult.errors.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
              <TouchableOpacity onPress={() => setLastFlushResult(null)}>
                <Ionicons name="close-circle-outline" size={14} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Queue Items List ───────────────────────────── */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {items.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle-outline" size={40} color={TACTICAL.textMuted} />
                <Text style={styles.emptyTitle}>QUEUE EMPTY</Text>
                <Text style={styles.emptySubtitle}>
                  All dispatch events have been sent. New events composed while offline will appear here.
                </Text>
              </View>
            ) : (
              items.map((item) => {
                const eventMeta = EVENT_TYPE_META[item.form.event_type] || EVENT_TYPE_META.status_update;
                const statusMeta = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
                const isPermanentlyFailed = item.status === 'failed' && item.retry_count >= item.max_retries;
                const isCritical = item.form.priority === 'critical';

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.queueItem,
                      isPermanentlyFailed && styles.queueItemFailed,
                      item.status === 'sending' && styles.queueItemSending,
                    ]}
                  >
                    {/* Left accent */}
                    <View style={[styles.itemAccent, { backgroundColor: eventMeta.color }]} />

                    <View style={styles.itemBody}>
                      {/* Top row: type + status + time */}
                      <View style={styles.itemTopRow}>
                        <View style={[styles.itemTypeIcon, { borderColor: `${eventMeta.color}40` }]}>
                          <Ionicons name={eventMeta.icon as any} size={12} color={eventMeta.color} />
                        </View>
                        <Text style={[styles.itemTypeLabel, { color: eventMeta.color }]}>
                          {eventMeta.label.toUpperCase()}
                        </Text>

                        {isCritical && (
                          <View style={styles.criticalChip}>
                            <Text style={styles.criticalChipText}>CRITICAL</Text>
                          </View>
                        )}

                        <View style={{ flex: 1 }} />

                        {/* Status badge */}
                        <View style={[styles.statusBadge, { borderColor: `${statusMeta.color}40` }]}>
                          {item.status === 'sending' ? (
                            <ActivityIndicator size={8} color={statusMeta.color} />
                          ) : (
                            <Ionicons name={statusMeta.icon as any} size={9} color={statusMeta.color} />
                          )}
                          <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>
                            {statusMeta.label}
                          </Text>
                        </View>
                      </View>

                      {/* Headline */}
                      <Text style={styles.itemHeadline} numberOfLines={2}>
                        {item.form.headline}
                      </Text>

                      {/* Detail preview */}
                      {item.form.detail ? (
                        <Text style={styles.itemDetail} numberOfLines={1}>
                          {item.form.detail}
                        </Text>
                      ) : null}

                      {/* Bottom row: queued time + retry info + actions */}
                      <View style={styles.itemBottomRow}>
                        <View style={styles.itemMeta}>
                          <Ionicons name="time-outline" size={9} color={TACTICAL.textMuted} />
                          <Text style={styles.itemMetaText}>
                            Queued {formatQueuedTime(item.queued_at)}
                          </Text>
                        </View>

                        {item.retry_count > 0 && (
                          <View style={styles.itemMeta}>
                            <Ionicons name="refresh-outline" size={9} color={TACTICAL.textMuted} />
                            <Text style={styles.itemMetaText}>
                              {item.retry_count}/{item.max_retries} retries
                            </Text>
                          </View>
                        )}

                        <View style={{ flex: 1 }} />

                        {/* Retry button (for failed items) */}
                        {item.status === 'failed' && (
                          <TouchableOpacity
                            style={styles.itemRetryBtn}
                            onPress={() => handleRetryItem(item.id)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="refresh-outline" size={11} color={TACTICAL.amber} />
                          </TouchableOpacity>
                        )}

                        {/* Delete button */}
                        {item.status !== 'sending' && (
                          <TouchableOpacity
                            style={styles.itemDeleteBtn}
                            onPress={() => handleDeleteItem(item.id)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="trash-outline" size={11} color={TACTICAL.danger} />
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Error message */}
                      {item.last_error && (
                        <View style={styles.errorRow}>
                          <Ionicons name="warning-outline" size={9} color={TACTICAL.danger} />
                          <Text style={styles.errorText} numberOfLines={2}>
                            {item.last_error}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )}

            {/* Bottom spacing */}
            <View style={{ height: 30 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    minHeight: 300,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    marginTop: 1,
  },

  // Status row
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  statusChipText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  offlineChip: {
    backgroundColor: 'rgba(229, 57, 53, 0.06)',
    borderColor: 'rgba(229, 57, 53, 0.2)',
  },
  offlineDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E53935',
  },
  offlineChipText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#E53935',
    letterSpacing: 1,
  },

  // Action row
  actionRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  flushBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  flushBtnDisabled: {
    opacity: 0.4,
  },
  flushBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.5,
  },
  retryAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
  },
  retryAllBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
  clearAllBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.3)',
    backgroundColor: 'rgba(229, 57, 53, 0.06)',
  },

  // Flush result banner
  flushResultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(102, 187, 106, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(102, 187, 106, 0.2)',
  },
  flushResultBannerError: {
    backgroundColor: 'rgba(229, 57, 53, 0.06)',
    borderColor: 'rgba(229, 57, 53, 0.2)',
  },
  flushResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  flushResultText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // List
  listContent: {
    padding: 16,
    paddingTop: 8,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  emptySubtitle: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 260,
  },

  // Queue item
  queueItem: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 6,
  },
  queueItemFailed: {
    borderColor: 'rgba(229, 57, 53, 0.3)',
    backgroundColor: 'rgba(229, 57, 53, 0.04)',
  },
  queueItemSending: {
    borderColor: 'rgba(66, 165, 245, 0.3)',
    backgroundColor: 'rgba(66, 165, 245, 0.04)',
  },
  itemAccent: {
    width: 3,
  },
  itemBody: {
    flex: 1,
    padding: 10,
    paddingLeft: 8,
  },

  // Item top row
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 5,
  },
  itemTypeIcon: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
  },
  itemTypeLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  criticalChip: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  criticalChipText: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  statusBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Item content
  itemHeadline: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.3,
    lineHeight: 16,
  },
  itemDetail: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 2,
    lineHeight: 14,
  },

  // Item bottom row
  itemBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.12)',
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  itemMetaText: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },
  itemRetryBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
  },
  itemDeleteBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(229, 57, 53, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.2)',
  },

  // Error row
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: 4,
    paddingTop: 4,
  },
  errorText: {
    fontSize: 9,
    color: TACTICAL.danger,
    flex: 1,
    lineHeight: 13,
  },
});




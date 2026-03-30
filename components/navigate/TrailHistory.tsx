/**
 * TrailHistory — Saved Trail History Panel (Phase 2.8.3)
 *
 * Displays saved trail recordings with:
 *   - List of saved trails with date, distance, duration, point count
 *   - Tap to replay a saved trail
 *   - Delete individual trails (with confirmation)
 *   - Export as GPX / JSON
 *   - Storage size indicator bar
 *   - Auto-cleanup status (trails expiring within 7 days)
 *   - Expedition grouping
 *
 * ECS dark glass styling with amber accents.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Platform, Alert,
  FlatList,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import {
  trailHistoryStore,
  type TrailHistorySummary,
  type StorageInfo,
} from '../../lib/trailHistoryStore';
import { hapticMicro, hapticCommand } from '../../lib/haptics';

interface Props {
  onReplayTrail: (trailId: string) => void;
  onExportTrail: (trailId: string, format: 'gpx' | 'json') => void;
  showToast: (msg: string) => void;
  /** Refresh trigger — increment to reload data */
  refreshKey?: number;
}

function formatElapsedShort(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

function formatDateFull(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function TrailHistory({
  onReplayTrail, onExportTrail, showToast, refreshKey = 0,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [exportModalId, setExportModalId] = useState<string | null>(null);

  // Load trail data
  const trails = useMemo(() => {
    // refreshKey dependency forces reload
    void refreshKey;
    return trailHistoryStore.getAll();
  }, [refreshKey, expanded]); // reload when expanded changes too

  const storageInfo = useMemo<StorageInfo>(() => {
    void refreshKey;
    return trailHistoryStore.getStorageInfo();
  }, [refreshKey, trails.length]);

  const toggleExpanded = useCallback(() => {
    hapticMicro();
    setExpanded(prev => !prev);
  }, []);

  // ── Handlers ──────────────────────────────────────────────

  const handleReplay = useCallback((trailId: string) => {
    hapticCommand();
    onReplayTrail(trailId);
  }, [onReplayTrail]);

  const handleDeleteConfirm = useCallback((trailId: string) => {
    hapticMicro();
    setDeleteConfirmId(trailId);
  }, []);

  const handleDeleteExecute = useCallback(() => {
    if (!deleteConfirmId) return;
    trailHistoryStore.deleteTrail(deleteConfirmId);
    setDeleteConfirmId(null);
    showToast('TRAIL DELETED');
  }, [deleteConfirmId, showToast]);

  const handleExportOpen = useCallback((trailId: string) => {
    hapticMicro();
    setExportModalId(trailId);
  }, []);

  const handleExportAction = useCallback((format: 'gpx' | 'json') => {
    if (!exportModalId) return;
    onExportTrail(exportModalId, format);
    setExportModalId(null);
  }, [exportModalId, onExportTrail]);

  const handleAutoCleanup = useCallback(() => {
    hapticCommand();
    const removed = trailHistoryStore.autoCleanup();
    if (removed > 0) {
      showToast(`CLEANED UP ${removed} EXPIRED TRAIL${removed > 1 ? 'S' : ''}`);
    } else {
      showToast('NO EXPIRED TRAILS');
    }
  }, [showToast]);

  const handleDeleteAll = useCallback(() => {
    const doDelete = () => {
      const count = trailHistoryStore.deleteAll();
      showToast(`DELETED ${count} TRAIL${count > 1 ? 'S' : ''}`);
    };
    if (Platform.OS === 'web') {
      if (confirm(`Delete all ${trails.length} saved trails? This cannot be undone.`)) doDelete();
    } else {
      Alert.alert(
        'Delete All Trails',
        `Remove all ${trails.length} saved trails? This cannot be undone.`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete All', style: 'destructive', onPress: doDelete }],
      );
    }
  }, [trails.length, showToast]);

  // Don't render if no trails and not expanded
  if (trails.length === 0 && !expanded) return null;

  // ── Storage bar percentage ────────────────────────────────
  const MAX_DISPLAY_BYTES = 4 * 1024 * 1024; // 4MB reference
  const storagePercent = Math.min((storageInfo.total_bytes / MAX_DISPLAY_BYTES) * 100, 100);
  const storageColor = storagePercent > 80 ? '#EF5350' : storagePercent > 50 ? '#FFB300' : '#66BB6A';

  const deleteTarget = deleteConfirmId ? trails.find(t => t.id === deleteConfirmId) : null;

  return (
    <View style={styles.container}>
      {/* ── Header row ───────────────────────────────────── */}
      <TouchableOpacity
        style={styles.headerRow}
        onPress={toggleExpanded}
        activeOpacity={0.8}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="time-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>TRAIL HISTORY</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{trails.length}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.storageMini}>{storageInfo.total_formatted}</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={TACTICAL.textMuted}
          />
        </View>
      </TouchableOpacity>

      {/* ── Expanded content ─────────────────────────────── */}
      {expanded && (
        <View style={styles.expandedContent}>
          {/* Storage indicator */}
          <View style={styles.storageSection}>
            <View style={styles.storageHeader}>
              <Text style={styles.storageLabel}>STORAGE</Text>
              <Text style={styles.storageValue}>
                {storageInfo.total_formatted} / 4 MB
              </Text>
            </View>
            <View style={styles.storageBar}>
              <View style={[
                styles.storageFill,
                { width: `${storagePercent}%`, backgroundColor: storageColor },
              ]} />
            </View>
            {storageInfo.trails_expiring_soon > 0 && (
              <View style={styles.expiryWarning}>
                <Ionicons name="alert-circle-outline" size={11} color="#FFB300" />
                <Text style={styles.expiryText}>
                  {storageInfo.trails_expiring_soon} trail{storageInfo.trails_expiring_soon > 1 ? 's' : ''} expiring within 7 days
                </Text>
              </View>
            )}
          </View>

          {/* Action bar */}
          <View style={styles.actionBar}>
            <TouchableOpacity
              style={styles.cleanupBtn}
              onPress={handleAutoCleanup}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={12} color={TACTICAL.amber} />
              <Text style={styles.cleanupBtnText}>CLEANUP</Text>
            </TouchableOpacity>
            {trails.length > 0 && (
              <TouchableOpacity
                style={styles.deleteAllBtn}
                onPress={handleDeleteAll}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={11} color="#EF5350" />
                <Text style={styles.deleteAllText}>DELETE ALL</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.retentionNote}>90-day retention</Text>
          </View>

          {/* Trail list */}
          {trails.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="trail-sign-outline" size={24} color={TACTICAL.textMuted} />
              <Text style={styles.emptyText}>No saved trails yet</Text>
              <Text style={styles.emptySubtext}>
                Trails are automatically saved when you stop recording
              </Text>
            </View>
          ) : (
            <View style={styles.trailList}>
              {trails.map((trail) => (
                <TrailHistoryRow
                  key={trail.id}
                  trail={trail}
                  onReplay={handleReplay}
                  onDelete={handleDeleteConfirm}
                  onExport={handleExportOpen}
                />
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── Delete Confirmation Modal ────────────────────── */}
      <Modal visible={!!deleteConfirmId} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>DELETE TRAIL?</Text>
            <Text style={styles.modalBody}>
              {deleteTarget
                ? `"${deleteTarget.name}" — ${deleteTarget.point_count} points, ${deleteTarget.distance_miles.toFixed(1)} mi`
                : 'This trail will be permanently removed.'}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setDeleteConfirmId(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalDeleteBtn}
                onPress={handleDeleteExecute}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={14} color="#fff" />
                <Text style={styles.modalDeleteText}>DELETE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Export Modal ──────────────────────────────────── */}
      <Modal visible={!!exportModalId} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.exportHeader}>
              <Text style={styles.modalTitle}>EXPORT TRAIL</Text>
              <TouchableOpacity onPress={() => setExportModalId(null)}>
                <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.exportActions}>
              <TouchableOpacity
                style={styles.exportFormatBtn}
                onPress={() => handleExportAction('gpx')}
                activeOpacity={0.8}
              >
                <Ionicons name="document-outline" size={20} color={TACTICAL.amber} />
                <Text style={styles.exportFormatLabel}>GPX</Text>
                <Text style={styles.exportFormatSub}>Standard format</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.exportFormatBtn}
                onPress={() => handleExportAction('json')}
                activeOpacity={0.8}
              >
                <Ionicons name="code-outline" size={20} color={TACTICAL.amber} />
                <Text style={styles.exportFormatLabel}>JSON</Text>
                <Text style={styles.exportFormatSub}>Full data</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Trail Row Component ──────────────────────────────────────

function TrailHistoryRow({ trail, onReplay, onDelete, onExport }: {
  trail: TrailHistorySummary;
  onReplay: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
}) {
  const isExpiringSoon = trail.days_until_expiry <= 7;

  return (
    <View style={styles.trailRow}>
      {/* Main info */}
      <TouchableOpacity
        style={styles.trailInfo}
        onPress={() => onReplay(trail.id)}
        activeOpacity={0.8}
      >
        <View style={styles.trailTopRow}>
          <View style={styles.trailNameRow}>
            {trail.expedition_name && (
              <View style={styles.expBadge}>
                <View style={styles.expBadgeDot} />
                <Text style={styles.expBadgeText} numberOfLines={1}>
                  {trail.expedition_name}
                </Text>
              </View>
            )}
            <Text style={styles.trailDate}>{formatDateFull(trail.started_at)}</Text>
          </View>
          <Ionicons name="play-circle-outline" size={18} color="#4A90D9" />
        </View>

        <View style={styles.trailStatsRow}>
          <View style={styles.trailStat}>
            <Text style={styles.trailStatValue}>{trail.distance_miles.toFixed(1)}</Text>
            <Text style={styles.trailStatUnit}>MI</Text>
          </View>
          <View style={styles.trailStatDivider} />
          <View style={styles.trailStat}>
            <Text style={styles.trailStatValue}>{formatElapsedShort(trail.elapsed_seconds)}</Text>
            <Text style={styles.trailStatUnit}>TIME</Text>
          </View>
          <View style={styles.trailStatDivider} />
          <View style={styles.trailStat}>
            <Text style={styles.trailStatValue}>{trail.avg_speed_mph.toFixed(0)}</Text>
            <Text style={styles.trailStatUnit}>AVG MPH</Text>
          </View>
          <View style={styles.trailStatDivider} />
          <View style={styles.trailStat}>
            <Text style={styles.trailStatValue}>{trail.point_count}</Text>
            <Text style={styles.trailStatUnit}>PTS</Text>
          </View>
          {trail.has_elevation && (
            <>
              <View style={styles.trailStatDivider} />
              <View style={styles.trailStat}>
                <Text style={styles.trailStatValue}>{trail.elevation_gain_ft}</Text>
                <Text style={styles.trailStatUnit}>FT GAIN</Text>
              </View>
            </>
          )}
        </View>

        {/* Bottom meta row */}
        <View style={styles.trailMetaRow}>
          <Text style={styles.trailSize}>
            {trailHistoryStore.formatBytes(trail.storage_bytes)}
          </Text>
          {trail.segment_count > 1 && (
            <Text style={styles.trailSegments}>
              {trail.segment_count} segments
            </Text>
          )}
          {isExpiringSoon && (
            <View style={styles.expiryBadge}>
              <Ionicons name="alert-circle" size={9} color="#FFB300" />
              <Text style={styles.expiryBadgeText}>
                {trail.days_until_expiry}d left
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Action buttons */}
      <View style={styles.trailActions}>
        <TouchableOpacity
          style={styles.trailActionBtn}
          onPress={() => onExport(trail.id)}
          activeOpacity={0.8}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Ionicons name="share-outline" size={13} color={TACTICAL.amber} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.trailActionBtn}
          onPress={() => onDelete(trail.id)}
          activeOpacity={0.8}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Ionicons name="trash-outline" size={13} color="#EF5350" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginHorizontal: DENSITY.screenPad,
    marginBottom: DENSITY.cardGap,
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },

  // ── Header ──────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    ...TYPO.T4,
    color: TACTICAL.amber,
    fontSize: 10,
    letterSpacing: 4,
  },
  countBadge: {
    backgroundColor: 'rgba(196,138,44,0.15)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
  },
  countText: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.amber,
  },
  storageMini: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // ── Expanded ────────────────────────────────────────────
  expandedContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
    paddingTop: 12,
    gap: 10,
  },

  // ── Storage ─────────────────────────────────────────────
  storageSection: {
    gap: 6,
  },
  storageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  storageLabel: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 3,
  },
  storageValue: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },
  storageBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(62,79,60,0.2)',
    overflow: 'hidden',
  },
  storageFill: {
    height: 4,
    borderRadius: 2,
  },
  expiryWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  expiryText: {
    ...TYPO.B2,
    fontSize: 10,
    color: '#FFB300',
  },

  // ── Action bar ──────────────────────────────────────────
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cleanupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  cleanupBtnText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  deleteAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.3)',
    backgroundColor: 'rgba(239,83,80,0.06)',
  },
  deleteAllText: {
    ...TYPO.U2,
    fontSize: 7,
    color: '#EF5350',
    letterSpacing: 2,
  },
  retentionNote: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginLeft: 'auto',
  },

  // ── Empty state ─────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  emptyText: {
    ...TYPO.T3,
    color: TACTICAL.textMuted,
  },
  emptySubtext: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    maxWidth: 240,
  },

  // ── Trail list ──────────────────────────────────────────
  trailList: {
    gap: 8,
  },

  // ── Trail row ───────────────────────────────────────────
  trailRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(62,79,60,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  trailInfo: {
    flex: 1,
    padding: 10,
    gap: 6,
  },
  trailTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  trailNameRow: {
    flex: 1,
    gap: 3,
  },
  expBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#66BB6A',
  },
  expBadgeText: {
    ...TYPO.U2,
    fontSize: 7,
    color: '#66BB6A',
    letterSpacing: 2,
    maxWidth: 160,
  },
  trailDate: {
    ...TYPO.B2,
    fontSize: 11,
    color: TACTICAL.text,
    fontWeight: '600',
  },

  trailStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trailStat: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  trailStatValue: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  trailStatUnit: {
    ...TYPO.U2,
    fontSize: 6,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  trailStatDivider: {
    width: 1,
    height: 18,
    backgroundColor: TACTICAL.border,
  },

  trailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trailSize: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  trailSegments: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
  },
  expiryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(255,179,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.3)',
  },
  expiryBadgeText: {
    fontFamily: 'Courier',
    fontSize: 8,
    fontWeight: '600',
    color: '#FFB300',
  },

  // ── Trail actions ───────────────────────────────────────
  trailActions: {
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderLeftWidth: 1,
    borderLeftColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.04)',
  },
  trailActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.08)',
  },

  // ── Modals ──────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    gap: 12,
  },
  modalTitle: {
    ...TYPO.T2,
    color: TACTICAL.amber,
  },
  modalBody: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalCancel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  modalCancelText: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 9,
    letterSpacing: 3,
  },
  modalDeleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#EF5350',
  },
  modalDeleteText: {
    ...TYPO.U1,
    color: '#fff',
    fontSize: 10,
    letterSpacing: 2,
  },

  // ── Export modal ────────────────────────────────────────
  exportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exportActions: {
    flexDirection: 'row',
    gap: 10,
  },
  exportFormatBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.06)',
  },
  exportFormatLabel: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 3,
  },
  exportFormatSub: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 8,
  },
});




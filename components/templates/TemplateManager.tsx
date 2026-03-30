// ============================================================
// TEMPLATE MANAGER — Full CRUD + Cloud Sync for Templates
// ============================================================
// Displayed in the More tab. Supports:
//   • List all templates with sync status badges
//   • Rename / Duplicate / Delete templates
//   • Cloud sync (push local, pull remote)
//   • Conflict detection and resolution via diff modal
//   • Sync summary bar with progress indicators
// ============================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { templateStore, type ExpeditionTemplate } from '../../lib/templateStore';
import {
  templateSyncEngine,
  type TemplateSyncMeta,
  type TemplateSyncStatus,
  type TemplateConflict,
  type ConflictResolution,
} from '../../lib/templateSyncEngine';
import TemplateSyncBadge, { SyncSummaryBar } from './TemplateSyncBadge';
import ConflictDiffModal from './ConflictDiffModal';

interface Props {
  userId: string | null;
  onToast: (msg: string) => void;
}

export default function TemplateManager({ userId, onToast }: Props) {
  const [templates, setTemplates] = useState<ExpeditionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Sync state
  const [syncMeta, setSyncMeta] = useState<TemplateSyncMeta>(templateSyncEngine.meta);
  const [isSyncing, setIsSyncing] = useState(false);
  const [conflictModal, setConflictModal] = useState<TemplateConflict | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // Listen to sync engine changes
  useEffect(() => {
    const unsubMeta = templateSyncEngine.onMetaChange((meta) => {
      if (mountedRef.current) setSyncMeta(meta);
    });
    const unsubSyncing = templateSyncEngine.onSyncingChange((syncing) => {
      if (mountedRef.current) setIsSyncing(syncing);
    });

    // Start auto-sync
    templateSyncEngine.startAutoSync();

    return () => {
      unsubMeta();
      unsubSyncing();
    };
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const result = await templateStore.list(userId);
      if (mountedRef.current) setTemplates(result);
    } catch (e) {
      console.warn('[TemplateManager] fetch error:', e);
    }
    if (mountedRef.current) setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => {
    fetchTemplates();
  }, [fetchTemplates]));

  // ── Sync Actions ───────────────────────────────────────────

  const handleSync = useCallback(async () => {
    if (isSyncing || !userId) return;

    const localTemplates = templateStore.getLocalTemplates();
    const result = await templateSyncEngine.performSync(localTemplates, userId);

    // Merge pulled templates into local store
    const pulled = templateSyncEngine.getPulledTemplates(result);
    if (pulled.length > 0) {
      templateStore.mergeFromCloud(pulled);
    }

    // Refresh template list
    await fetchTemplates();

    if (result.errors.length > 0) {
      onToast(`Sync completed with ${result.errors.length} error(s)`);
    } else if (result.conflicts > 0) {
      onToast(`Sync found ${result.conflicts} conflict(s) — tap to resolve`);
    } else {
      const parts: string[] = [];
      if (result.pushed > 0) parts.push(`${result.pushed} pushed`);
      if (result.pulled > 0) parts.push(`${result.pulled} pulled`);
      onToast(parts.length > 0 ? `Synced: ${parts.join(', ')}` : 'All templates in sync');
    }
  }, [isSyncing, userId, fetchTemplates, onToast]);

  const handleResolveConflict = useCallback(async (templateId: string, resolution: ConflictResolution) => {
    const result = await templateSyncEngine.resolveConflict(templateId, resolution, userId);

    if (result.resolved) {
      // Update local store with resolved template
      if (result.template) {
        templateStore.mergeFromCloud([result.template]);
      }
      if (result.copy) {
        templateStore.mergeFromCloud([result.copy]);
      }
      await fetchTemplates();
      setConflictModal(null);
      onToast(`Conflict resolved: ${resolution.replace('_', ' ')}`);
    } else {
      onToast(`Resolution failed: ${result.error || 'Unknown error'}`);
    }
  }, [userId, fetchTemplates, onToast]);

  // ── Template CRUD ──────────────────────────────────────────

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) return;
    setActionLoading(id);
    try {
      await templateStore.update(id, { name: renameValue.trim() }, userId);
      setRenamingId(null);
      setRenameValue('');
      await fetchTemplates();
      onToast('Template renamed');
    } catch {
      onToast('Rename failed');
    }
    setActionLoading(null);
  };

  const handleDuplicate = async (id: string) => {
    setActionLoading(id);
    try {
      await templateStore.duplicate(id, userId);
      await fetchTemplates();
      onToast('Template duplicated');
    } catch {
      onToast('Duplicate failed');
    }
    setActionLoading(null);
  };

  const handleDelete = async (id: string, name: string) => {
    const doDelete = async () => {
      setActionLoading(id);
      try {
        await templateStore.delete(id, userId);
        await fetchTemplates();
        onToast('Template deleted');
      } catch {
        onToast('Delete failed');
      }
      setActionLoading(null);
    };

    if (Platform.OS === 'web') {
      if (confirm(`Delete template "${name}"? This cannot be undone.`)) {
        await doDelete();
      }
    } else {
      Alert.alert(
        'DELETE TEMPLATE',
        `Delete "${name}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  // ── Compute sync stats ─────────────────────────────────────

  const syncStats = (() => {
    let synced = 0, pending = 0, conflicts = 0, localOnly = 0;
    for (const t of templates) {
      const s = syncMeta.templateStatuses[t.id] || 'local_only';
      if (s === 'synced') synced++;
      else if (s === 'pending' || s === 'syncing') pending++;
      else if (s === 'conflict') conflicts++;
      else localOnly++;
    }
    return { synced, pending, conflicts, localOnly };
  })();

  // ── Render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={TACTICAL.amber} />
        <Text style={styles.loadingText}>Loading templates...</Text>
      </View>
    );
  }

  if (templates.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <Ionicons name="bookmark-outline" size={36} color={TACTICAL.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>NO TEMPLATES</Text>
        <Text style={styles.emptySub}>
          Complete all 4 builder steps, then use "SAVE AS TEMPLATE" in the Expedition Builder to create reusable configurations.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Sync Summary Bar */}
      <SyncSummaryBar
        total={templates.length}
        synced={syncStats.synced}
        pending={syncStats.pending}
        conflicts={syncStats.conflicts}
        localOnly={syncStats.localOnly}
        lastSyncedAt={syncMeta.lastSyncedAt}
        isSyncing={isSyncing}
      />

      {/* Header Row */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>
          {templates.length} TEMPLATE{templates.length !== 1 ? 'S' : ''}
        </Text>
        <View style={styles.headerActions}>
          {/* Sync Button */}
          <TouchableOpacity
            onPress={handleSync}
            style={[styles.syncBtn, isSyncing && styles.syncBtnActive]}
            disabled={isSyncing}
            activeOpacity={0.7}
          >
            {isSyncing ? (
              <ActivityIndicator size={12} color="#5B8DEF" />
            ) : (
              <Ionicons name="cloud-upload-outline" size={14} color="#5B8DEF" />
            )}
            <Text style={styles.syncBtnText}>{isSyncing ? 'SYNCING' : 'SYNC'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={fetchTemplates} style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={16} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Conflict Alert Banner */}
      {syncMeta.conflicts.length > 0 && (
        <View style={styles.conflictBanner}>
          <Ionicons name="warning" size={16} color="#C0392B" />
          <Text style={styles.conflictBannerText}>
            {syncMeta.conflicts.length} template{syncMeta.conflicts.length > 1 ? 's have' : ' has'} merge conflicts
          </Text>
          <TouchableOpacity
            style={styles.conflictResolveBtn}
            onPress={() => setConflictModal(syncMeta.conflicts[0])}
          >
            <Text style={styles.conflictResolveBtnText}>RESOLVE</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Template Cards */}
      {templates.map((template) => {
        const isExpanded = expandedId === template.id;
        const isRenaming = renamingId === template.id;
        const isLoading = actionLoading === template.id;
        const itemCount = template.items_snapshot?.length || 0;
        const zoneCount = template.zones_snapshot?.length || template.zone_count || 0;
        const syncStatus: TemplateSyncStatus = syncMeta.templateStatuses[template.id] || 'local_only';
        const hasConflict = syncMeta.conflicts.some(c => c.templateId === template.id);

        return (
          <View
            key={template.id}
            style={[
              styles.templateCard,
              hasConflict && styles.templateCardConflict,
            ]}
          >
            {/* Card Header */}
            <TouchableOpacity
              style={styles.templateHeader}
              onPress={() => setExpandedId(isExpanded ? null : template.id)}
              activeOpacity={0.75}
            >
              <View style={styles.templateIcon}>
                <Ionicons name="bookmark" size={16} color="#4CAF50" />
              </View>
              <View style={styles.templateInfo}>
                {isRenaming ? (
                  <View style={styles.renameRow}>
                    <TextInput
                      style={styles.renameInput}
                      value={renameValue}
                      onChangeText={setRenameValue}
                      autoFocus
                      placeholder="Template name"
                      placeholderTextColor={TACTICAL.textMuted}
                      onSubmitEditing={() => handleRename(template.id)}
                    />
                    <TouchableOpacity
                      onPress={() => handleRename(template.id)}
                      style={styles.renameConfirm}
                    >
                      <Ionicons name="checkmark" size={16} color="#4CAF50" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setRenamingId(null); setRenameValue(''); }}
                      style={styles.renameCancel}
                    >
                      <Ionicons name="close" size={16} color={TACTICAL.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <View style={styles.nameRow}>
                      <Text style={styles.templateName} numberOfLines={1}>{template.name}</Text>
                      <TemplateSyncBadge status={syncStatus} />
                    </View>
                    <View style={styles.templateMeta}>
                      {template.vehicle_name && (
                        <View style={styles.metaChip}>
                          <Ionicons name="car-sport" size={9} color={TACTICAL.amber} />
                          <Text style={styles.metaChipText}>{template.vehicle_name}</Text>
                        </View>
                      )}
                      {zoneCount > 0 && (
                        <View style={styles.metaChip}>
                          <Ionicons name="grid" size={9} color={TACTICAL.textMuted} />
                          <Text style={styles.metaChipText}>{zoneCount}Z</Text>
                        </View>
                      )}
                      {itemCount > 0 && (
                        <View style={styles.metaChip}>
                          <Ionicons name="cube" size={9} color={TACTICAL.textMuted} />
                          <Text style={styles.metaChipText}>{itemCount} items</Text>
                        </View>
                      )}
                      {template.use_count > 0 && (
                        <Text style={styles.useCount}>Used {template.use_count}x</Text>
                      )}
                    </View>
                  </>
                )}
              </View>
              <View style={styles.templateRight}>
                {isLoading ? (
                  <ActivityIndicator size="small" color={TACTICAL.amber} />
                ) : (
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={TACTICAL.textMuted}
                  />
                )}
              </View>
            </TouchableOpacity>

            {/* Expanded Detail */}
            {isExpanded && !isRenaming && (
              <View style={styles.expandedSection}>
                {/* Conflict warning */}
                {hasConflict && (
                  <TouchableOpacity
                    style={styles.conflictAlert}
                    onPress={() => {
                      const c = syncMeta.conflicts.find(x => x.templateId === template.id);
                      if (c) setConflictModal(c);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="git-merge" size={16} color="#C0392B" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.conflictAlertTitle}>MERGE CONFLICT DETECTED</Text>
                      <Text style={styles.conflictAlertSub}>
                        This template was edited on another device. Tap to resolve.
                      </Text>
                    </View>
                    <Ionicons name="arrow-forward" size={14} color="#C0392B" />
                  </TouchableOpacity>
                )}

                {/* Description */}
                {template.description && (
                  <Text style={styles.templateDesc}>{template.description}</Text>
                )}

                {/* Sync Status Detail */}
                <View style={styles.syncDetailRow}>
                  <Text style={styles.syncDetailLabel}>SYNC STATUS</Text>
                  <TemplateSyncBadge status={syncStatus} />
                </View>

                {/* Snapshot Details */}
                <View style={styles.detailGrid}>
                  <DetailRow label="Vehicle" value={template.vehicle_name || '--'} />
                  <DetailRow label="Framework" value={template.framework_type || '--'} />
                  <DetailRow label="Zones" value={zoneCount > 0 ? `${zoneCount} configured` : '--'} />
                  <DetailRow label="Loadout Items" value={itemCount > 0 ? `${itemCount} items` : '--'} />
                  <DetailRow
                    label="Created"
                    value={new Date(template.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: '2-digit'
                    })}
                  />
                  {template.last_used_at && (
                    <DetailRow
                      label="Last Used"
                      value={new Date(template.last_used_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: '2-digit'
                      })}
                    />
                  )}
                </View>

                {/* Zone Names */}
                {template.zones_snapshot && template.zones_snapshot.length > 0 && (
                  <View style={styles.zoneList}>
                    <Text style={styles.zoneListLabel}>ZONES</Text>
                    <View style={styles.zoneChips}>
                      {template.zones_snapshot.map((z, i) => (
                        <View key={z.id || i} style={styles.zoneChip}>
                          <Text style={styles.zoneChipText}>{z.name}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Actions */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      setRenamingId(template.id);
                      setRenameValue(template.name);
                    }}
                  >
                    <Ionicons name="pencil-outline" size={14} color={TACTICAL.amber} />
                    <Text style={styles.actionBtnText}>RENAME</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleDuplicate(template.id)}
                  >
                    <Ionicons name="copy-outline" size={14} color={TACTICAL.amber} />
                    <Text style={styles.actionBtnText}>DUPLICATE</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnDanger]}
                    onPress={() => handleDelete(template.id, template.name)}
                  >
                    <Ionicons name="trash-outline" size={14} color={TACTICAL.danger} />
                    <Text style={[styles.actionBtnText, styles.actionBtnTextDanger]}>DELETE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        );
      })}

      {/* Conflict Diff Modal */}
      <ConflictDiffModal
        visible={!!conflictModal}
        conflict={conflictModal}
        onResolve={handleResolveConflict}
        onClose={() => setConflictModal(null)}
      />
    </View>
  );
}

// ── Detail Row ───────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { gap: 10 },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  loadingText: { fontSize: 12, color: TACTICAL.textMuted, letterSpacing: 0.5 },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 2,
  },
  emptySub: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(91, 141, 239, 0.25)',
    backgroundColor: 'rgba(91, 141, 239, 0.06)',
  },
  syncBtnActive: {
    backgroundColor: 'rgba(91, 141, 239, 0.12)',
    borderColor: 'rgba(91, 141, 239, 0.40)',
  },
  syncBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#5B8DEF',
    letterSpacing: 1,
  },
  refreshBtn: { padding: 4 },

  // Conflict banner
  conflictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(192, 57, 43, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.25)',
  },
  conflictBannerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#C0392B',
    letterSpacing: 0.3,
  },
  conflictResolveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(192, 57, 43, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.30)',
  },
  conflictResolveBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#C0392B',
    letterSpacing: 1,
  },

  // Template Card
  templateCard: {
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    overflow: 'hidden',
  },
  templateCardConflict: {
    borderColor: 'rgba(192, 57, 43, 0.35)',
    borderLeftWidth: 3,
    borderLeftColor: '#C0392B',
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  templateIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateInfo: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  templateName: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.3,
    flex: 1,
  },
  templateMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  metaChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  useCount: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  templateRight: { width: 24, alignItems: 'center' },

  // Rename
  renameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  renameInput: {
    flex: 1,
    backgroundColor: TACTICAL.bg,
    borderWidth: 1,
    borderColor: TACTICAL.amber,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: TACTICAL.text,
    fontSize: 13,
  },
  renameConfirm: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameCancel: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(138,138,133,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Expanded
  expandedSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.25)',
    padding: 14,
    paddingTop: 12,
    gap: 12,
  },
  templateDesc: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // Conflict alert in expanded card
  conflictAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(192, 57, 43, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.25)',
  },
  conflictAlertTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#C0392B',
    letterSpacing: 1,
  },
  conflictAlertSub: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 2,
  },

  // Sync detail
  syncDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  syncDetailLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Detail Grid
  detailGrid: { gap: 6 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },

  // Zone List
  zoneList: { gap: 6 },
  zoneListLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  zoneChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  zoneChip: {
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  zoneChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
  },
  actionBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
  actionBtnDanger: {
    borderColor: 'rgba(192, 57, 43, 0.25)',
    backgroundColor: 'rgba(192, 57, 43, 0.06)',
  },
  actionBtnTextDanger: {
    color: TACTICAL.danger,
  },
});




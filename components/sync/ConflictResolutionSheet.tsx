/**
 * ConflictResolutionSheet
 *
 * Bottom sheet UI for resolving offline action queue conflicts.
 * Shows two conflicting actions side-by-side with field-level diffs,
 * allowing users to pick which version to keep per field or manually
 * merge values.
 *
 * Integrates with:
 * - conflictResolver.ts — reads conflicts, applies resolutions
 * - syncActionQueue.ts — replaces conflicting actions with merged result
 * - SyncQueueIndicator.tsx — opened from the CONFLICTS tab
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Modal,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { useTheme } from '../../context/ThemeContext';
import { SPACING, RADIUS, COLORS } from '../../lib/theme';
import {
  conflictResolver,
  type QueueConflict,
  type FieldDiff,
  type ConflictResolution,
} from '../../lib/conflictResolver';
import { syncActionQueue } from '../../lib/syncActionQueue';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ConflictResolutionSheet({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const [conflicts, setConflicts] = useState<QueueConflict[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [applying, setApplying] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Subscribe to conflict changes
  useEffect(() => {
    const refresh = () => setConflicts(conflictResolver.pendingConflicts);
    refresh();
    const unsub = conflictResolver.onChange(() => refresh());
    return unsub;
  }, [visible]);

  const currentConflict = conflicts[currentIndex] || null;

  // ── Field Resolution Handlers ───────────────────────────────

  const handleFieldResolution = useCallback((field: string, resolution: 'a' | 'b') => {
    if (!currentConflict) return;
    conflictResolver.setFieldResolution(currentConflict.id, field, resolution);
    setConflicts(conflictResolver.pendingConflicts);
  }, [currentConflict]);

  const handleAllA = useCallback(() => {
    if (!currentConflict) return;
    conflictResolver.setAllFieldResolutions(currentConflict.id, 'a');
    setConflicts(conflictResolver.pendingConflicts);
  }, [currentConflict]);

  const handleAllB = useCallback(() => {
    if (!currentConflict) return;
    conflictResolver.setAllFieldResolutions(currentConflict.id, 'b');
    setConflicts(conflictResolver.pendingConflicts);
  }, [currentConflict]);

  const handleStartEdit = useCallback((field: string, currentValue: any) => {
    setEditingField(field);
    setEditValue(currentValue === null || currentValue === undefined ? '' : String(currentValue));
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!currentConflict || !editingField) return;
    conflictResolver.setFieldResolution(currentConflict.id, editingField, 'manual', editValue);
    setEditingField(null);
    setEditValue('');
    setConflicts(conflictResolver.pendingConflicts);
  }, [currentConflict, editingField, editValue]);

  const handleCancelEdit = useCallback(() => {
    setEditingField(null);
    setEditValue('');
  }, []);

  // ── Resolution Actions ──────────────────────────────────────

  const handleApplyMerge = useCallback(async () => {
    if (!currentConflict) return;
    setApplying(true);

    try {
      const resolution = conflictResolver.resolveConflict(currentConflict.id);
      if (resolution) {
        // Remove the two conflicting actions from the queue
        for (const id of resolution.replacedActionIds) {
          syncActionQueue.remove(id);
        }
        // Enqueue the merged action
        syncActionQueue.enqueue(
          resolution.mergedAction.type,
          resolution.mergedAction.payload,
          resolution.mergedAction.description,
          resolution.mergedAction.priority,
        );
      }

      const remaining = conflictResolver.pendingConflicts;
      setConflicts(remaining);
      if (currentIndex >= remaining.length) {
        setCurrentIndex(Math.max(0, remaining.length - 1));
      }
      if (remaining.length === 0) {
        onClose();
      }
    } catch (e: any) {
      console.error('[ConflictResolutionSheet] Apply merge failed:', e);
    }

    setApplying(false);
  }, [currentConflict, currentIndex, onClose]);

  const handleKeepFirst = useCallback(() => {
    if (!currentConflict) return;
    const resolution = conflictResolver.resolveKeepFirst(currentConflict.id);
    if (resolution) {
      for (const id of resolution.replacedActionIds) {
        syncActionQueue.remove(id);
      }
      syncActionQueue.enqueue(
        resolution.mergedAction.type,
        resolution.mergedAction.payload,
        resolution.mergedAction.description,
        resolution.mergedAction.priority,
      );
    }
    const remaining = conflictResolver.pendingConflicts;
    setConflicts(remaining);
    if (currentIndex >= remaining.length) {
      setCurrentIndex(Math.max(0, remaining.length - 1));
    }
    if (remaining.length === 0) onClose();
  }, [currentConflict, currentIndex, onClose]);

  const handleKeepLast = useCallback(() => {
    if (!currentConflict) return;
    const resolution = conflictResolver.resolveKeepLast(currentConflict.id);
    if (resolution) {
      for (const id of resolution.replacedActionIds) {
        syncActionQueue.remove(id);
      }
      syncActionQueue.enqueue(
        resolution.mergedAction.type,
        resolution.mergedAction.payload,
        resolution.mergedAction.description,
        resolution.mergedAction.priority,
      );
    }
    const remaining = conflictResolver.pendingConflicts;
    setConflicts(remaining);
    if (currentIndex >= remaining.length) {
      setCurrentIndex(Math.max(0, remaining.length - 1));
    }
    if (remaining.length === 0) onClose();
  }, [currentConflict, currentIndex, onClose]);

  const handleDiscard = useCallback(() => {
    if (!currentConflict) return;
    conflictResolver.discardConflict(currentConflict.id);
    const remaining = conflictResolver.pendingConflicts;
    setConflicts(remaining);
    if (currentIndex >= remaining.length) {
      setCurrentIndex(Math.max(0, remaining.length - 1));
    }
    if (remaining.length === 0) onClose();
  }, [currentConflict, currentIndex, onClose]);

  // ── Format Value ────────────────────────────────────────────

  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return '(empty)';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'object') return JSON.stringify(val, null, 1);
    const str = String(val);
    return str.length > 80 ? str.slice(0, 77) + '...' : str;
  };

  const formatTime = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (!visible || conflicts.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={[s.sheet, { backgroundColor: colors.bg }]}>
          {/* ═══════ HEADER ═══════ */}
          <View style={[s.header, { borderBottomColor: colors.goldBorder }]}>
            <View style={s.headerLeft}>
              <Ionicons name="git-compare-outline" size={18} color={colors.warning} />
              <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
                QUEUE CONFLICTS
              </Text>
              <View style={[s.countBadge, { backgroundColor: colors.warning + '20' }]}>
                <Text style={[s.countBadgeText, { color: colors.warning }]}>
                  {conflicts.length}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {currentConflict && (
            <>
              {/* ═══════ CONFLICT INFO BAR ═══════ */}
              <View style={[s.infoBar, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
                <View style={s.infoLeft}>
                  <View style={[s.entityBadge, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '30' }]}>
                    <Text style={[s.entityBadgeText, { color: colors.warning }]}>
                      {currentConflict.entityType.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[s.entityName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {currentConflict.entityName}
                  </Text>
                </View>
                <Text style={[s.diffCount, { color: colors.textMuted }]}>
                  {currentConflict.diffs.length} conflicting field{currentConflict.diffs.length !== 1 ? 's' : ''}
                </Text>
              </View>

              {/* ═══════ ACTION COMPARISON HEADER ═══════ */}
              <View style={[s.compareHeader, { borderBottomColor: colors.border }]}>
                <View style={[s.compareCol, { borderRightColor: colors.border, borderRightWidth: 1 }]}>
                  <View style={[s.actionTag, { backgroundColor: colors.info + '12' }]}>
                    <Ionicons name="time-outline" size={10} color={colors.info} />
                    <Text style={[s.actionTagText, { color: colors.info }]}>EARLIER</Text>
                  </View>
                  <Text style={[s.actionDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                    {currentConflict.actionA.description}
                  </Text>
                  <Text style={[s.actionTime, { color: colors.textMuted }]}>
                    {formatTime(currentConflict.actionA.createdAt)}
                  </Text>
                </View>
                <View style={s.compareCol}>
                  <View style={[s.actionTag, { backgroundColor: colors.success + '12' }]}>
                    <Ionicons name="time-outline" size={10} color={colors.success} />
                    <Text style={[s.actionTagText, { color: colors.success }]}>LATER</Text>
                  </View>
                  <Text style={[s.actionDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                    {currentConflict.actionB.description}
                  </Text>
                  <Text style={[s.actionTime, { color: colors.textMuted }]}>
                    {formatTime(currentConflict.actionB.createdAt)}
                  </Text>
                </View>
              </View>

              {/* ═══════ QUICK ACTIONS ═══════ */}
              <View style={[s.quickRow, { borderBottomColor: colors.border }]}>
                <TouchableOpacity
                  style={[s.quickBtn, { backgroundColor: colors.info + '10', borderColor: colors.info + '30' }]}
                  onPress={handleAllA}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-back-outline" size={12} color={colors.info} />
                  <Text style={[s.quickBtnText, { color: colors.info }]}>ALL EARLIER</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.quickBtn, { backgroundColor: colors.success + '10', borderColor: colors.success + '30' }]}
                  onPress={handleAllB}
                  activeOpacity={0.7}
                >
                  <Text style={[s.quickBtnText, { color: colors.success }]}>ALL LATER</Text>
                  <Ionicons name="arrow-forward-outline" size={12} color={colors.success} />
                </TouchableOpacity>
              </View>

              {/* ═══════ FIELD DIFFS ═══════ */}
              <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {currentConflict.diffs.map((diff) => (
                  <FieldDiffCard
                    key={diff.field}
                    diff={diff}
                    colors={colors}
                    conflictId={currentConflict.id}
                    onResolve={handleFieldResolution}
                    onStartEdit={handleStartEdit}
                    editingField={editingField}
                    editValue={editValue}
                    onEditChange={setEditValue}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={handleCancelEdit}
                    formatValue={formatValue}
                  />
                ))}

                {/* Non-conflicting unique fields info */}
                {(currentConflict.uniqueToA.length > 0 || currentConflict.uniqueToB.length > 0) && (
                  <View style={[s.uniqueSection, { borderTopColor: colors.border }]}>
                    <Text style={[s.uniqueTitle, { color: colors.textMuted }]}>
                      NON-CONFLICTING FIELDS (auto-included)
                    </Text>
                    {currentConflict.uniqueToA.map(f => (
                      <View key={`ua-${f}`} style={s.uniqueRow}>
                        <Ionicons name="checkmark-outline" size={10} color={colors.info} />
                        <Text style={[s.uniqueField, { color: colors.info }]}>
                          {f.replace(/_/g, ' ')} (from earlier)
                        </Text>
                      </View>
                    ))}
                    {currentConflict.uniqueToB.map(f => (
                      <View key={`ub-${f}`} style={s.uniqueRow}>
                        <Ionicons name="checkmark-outline" size={10} color={colors.success} />
                        <Text style={[s.uniqueField, { color: colors.success }]}>
                          {f.replace(/_/g, ' ')} (from later)
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={{ height: 20 }} />
              </ScrollView>

              {/* ═══════ BOTTOM ACTION BAR ═══════ */}
              <View style={[s.bottomBar, { backgroundColor: colors.bgCard, borderTopColor: colors.border }]}>
                {/* Navigation */}
                {conflicts.length > 1 && (
                  <View style={s.navRow}>
                    <TouchableOpacity
                      style={[s.navBtn, { borderColor: colors.border }]}
                      onPress={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                      disabled={currentIndex === 0}
                    >
                      <Ionicons
                        name="chevron-back"
                        size={14}
                        color={currentIndex === 0 ? colors.textMuted : colors.textPrimary}
                      />
                    </TouchableOpacity>
                    <Text style={[s.navLabel, { color: colors.textMuted }]}>
                      {currentIndex + 1} / {conflicts.length}
                    </Text>
                    <TouchableOpacity
                      style={[s.navBtn, { borderColor: colors.border }]}
                      onPress={() => setCurrentIndex(Math.min(conflicts.length - 1, currentIndex + 1))}
                      disabled={currentIndex === conflicts.length - 1}
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={currentIndex === conflicts.length - 1 ? colors.textMuted : colors.textPrimary}
                      />
                    </TouchableOpacity>
                  </View>
                )}

                {/* Action buttons */}
                <View style={s.actionRow}>
                  <TouchableOpacity
                    style={[s.secondaryBtn, { borderColor: colors.info + '40' }]}
                    onPress={handleKeepFirst}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="arrow-back-outline" size={12} color={colors.info} />
                    <Text style={[s.secondaryBtnText, { color: colors.info }]}>KEEP FIRST</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.secondaryBtn, { borderColor: colors.success + '40' }]}
                    onPress={handleKeepLast}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="arrow-forward-outline" size={12} color={colors.success} />
                    <Text style={[s.secondaryBtnText, { color: colors.success }]}>KEEP LAST</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.secondaryBtn, { borderColor: colors.danger + '40' }]}
                    onPress={handleDiscard}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-outline" size={12} color={colors.danger} />
                    <Text style={[s.secondaryBtnText, { color: colors.danger }]}>SKIP</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[s.mergeBtn, { backgroundColor: colors.gold, opacity: applying ? 0.6 : 1 }]}
                  onPress={handleApplyMerge}
                  disabled={applying}
                  activeOpacity={0.7}
                >
                  <Ionicons name="git-merge-outline" size={16} color="#000" />
                  <Text style={s.mergeBtnText}>
                    {applying ? 'MERGING...' : 'MERGE & RESOLVE'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── FieldDiffCard Sub-Component ───────────────────────────────

function FieldDiffCard({
  diff,
  colors,
  conflictId,
  onResolve,
  onStartEdit,
  editingField,
  editValue,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  formatValue,
}: {
  diff: FieldDiff;
  colors: any;
  conflictId: string;
  onResolve: (field: string, res: 'a' | 'b') => void;
  onStartEdit: (field: string, val: any) => void;
  editingField: string | null;
  editValue: string;
  onEditChange: (val: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  formatValue: (val: any) => string;
}) {
  const isEditing = editingField === diff.field;
  const borderColor =
    diff.resolution === 'a' ? colors.info + '50' :
    diff.resolution === 'b' ? colors.success + '50' :
    diff.resolution === 'manual' ? colors.warning + '50' :
    colors.border;

  const resLabel =
    diff.resolution === 'a' ? 'EARLIER' :
    diff.resolution === 'b' ? 'LATER' :
    'CUSTOM';

  const resColor =
    diff.resolution === 'a' ? colors.info :
    diff.resolution === 'b' ? colors.success :
    colors.warning;

  return (
    <View style={[fs.card, { backgroundColor: colors.bgCard, borderColor }]}>
      {/* Field Header */}
      <View style={fs.cardHeader}>
        <Text style={[fs.fieldLabel, { color: colors.textPrimary }]}>{diff.label}</Text>
        <View style={[fs.resBadge, { backgroundColor: resColor + '15' }]}>
          <Text style={[fs.resBadgeText, { color: resColor }]}>{resLabel}</Text>
        </View>
      </View>

      {/* Side-by-side values */}
      <View style={fs.diffRow}>
        {/* Version A (Earlier) */}
        <TouchableOpacity
          style={[
            fs.diffBox,
            {
              borderColor: diff.resolution === 'a' ? colors.info + '50' : colors.border,
              backgroundColor: diff.resolution === 'a' ? colors.info + '08' : 'transparent',
            },
          ]}
          onPress={() => onResolve(diff.field, 'a')}
          activeOpacity={0.7}
        >
          <View style={fs.diffLabelRow}>
            <Ionicons
              name={diff.resolution === 'a' ? 'radio-button-on' : 'radio-button-off-outline'}
              size={12}
              color={colors.info}
            />
            <Text style={[fs.diffLabel, { color: colors.info }]}>A</Text>
          </View>
          <Text
            style={[
              fs.diffValue,
              { color: colors.textPrimary },
              diff.resolution === 'a' && { fontWeight: '800' },
            ]}
            numberOfLines={4}
          >
            {formatValue(diff.valueA)}
          </Text>
        </TouchableOpacity>

        {/* Divider */}
        <View style={[fs.diffDivider, { backgroundColor: colors.border }]}>
          <Ionicons name="swap-horizontal" size={10} color={colors.textMuted} />
        </View>

        {/* Version B (Later) */}
        <TouchableOpacity
          style={[
            fs.diffBox,
            {
              borderColor: diff.resolution === 'b' ? colors.success + '50' : colors.border,
              backgroundColor: diff.resolution === 'b' ? colors.success + '08' : 'transparent',
            },
          ]}
          onPress={() => onResolve(diff.field, 'b')}
          activeOpacity={0.7}
        >
          <View style={fs.diffLabelRow}>
            <Ionicons
              name={diff.resolution === 'b' ? 'radio-button-on' : 'radio-button-off-outline'}
              size={12}
              color={colors.success}
            />
            <Text style={[fs.diffLabel, { color: colors.success }]}>B</Text>
          </View>
          <Text
            style={[
              fs.diffValue,
              { color: colors.textPrimary },
              diff.resolution === 'b' && { fontWeight: '800' },
            ]}
            numberOfLines={4}
          >
            {formatValue(diff.valueB)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Manual Edit */}
      {isEditing ? (
        <View style={[fs.editRow, { borderTopColor: colors.border }]}>
          <TextInput
            style={[fs.editInput, { color: colors.textPrimary, borderColor: colors.warning + '50', backgroundColor: colors.bg }]}
            value={editValue}
            onChangeText={onEditChange}
            placeholder="Enter custom value..."
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          <TouchableOpacity
            style={[fs.editBtn, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '30' }]}
            onPress={onSaveEdit}
          >
            <Ionicons name="checkmark" size={14} color={colors.warning} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[fs.editBtn, { borderColor: colors.border }]}
            onPress={onCancelEdit}
          >
            <Ionicons name="close" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[fs.editTrigger, { borderTopColor: colors.border }]}
          onPress={() => onStartEdit(diff.field, diff.resolution === 'a' ? diff.valueA : diff.valueB)}
          activeOpacity={0.7}
        >
          <Ionicons name="create-outline" size={10} color={colors.textMuted} />
          <Text style={[fs.editTriggerText, { color: colors.textMuted }]}>CUSTOM VALUE</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  closeBtn: {
    padding: 4,
  },

  // Info bar
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  entityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  entityBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  entityName: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  diffCount: {
    fontSize: 10,
    fontWeight: '600',
  },

  // Compare header
  compareHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  compareCol: {
    flex: 1,
    padding: SPACING.sm,
    gap: 3,
  },
  actionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  actionTagText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  actionDesc: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14,
  },
  actionTime: {
    fontSize: 9,
    fontFamily: 'Courier',
    fontWeight: '600',
  },

  // Quick actions
  quickRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
  },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  quickBtnText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },

  // Unique fields
  uniqueSection: {
    borderTopWidth: 1,
    paddingTop: SPACING.md,
    marginTop: SPACING.sm,
  },
  uniqueTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: SPACING.sm,
  },
  uniqueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  uniqueField: {
    fontSize: 10,
    fontWeight: '600',
  },

  // Bottom bar
  bottomBar: {
    padding: SPACING.md,
    borderTopWidth: 1,
    gap: SPACING.sm,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    marginBottom: 2,
  },
  navBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  mergeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: RADIUS.sm,
  },
  mergeBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
});

// ── FieldDiffCard Styles ──────────────────────────────────────

const fs = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  resBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  resBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },

  diffRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.sm,
    gap: 0,
  },
  diffBox: {
    flex: 1,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  diffLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  diffLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2,
  },
  diffValue: {
    fontSize: 11,
    fontFamily: 'Courier',
    lineHeight: 15,
  },
  diffDivider: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    marginHorizontal: 1,
  },

  // Edit
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: SPACING.sm,
    borderTopWidth: 1,
  },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    fontFamily: 'Courier',
  },
  editBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  editTriggerText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
});






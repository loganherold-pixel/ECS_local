/**
 * Conflict Resolution Modal
 *
 * Shows a side-by-side diff of local vs remote versions when sync conflicts
 * are detected. Allows per-field resolution: Keep Local, Keep Remote, or Merge.
 * Stores resolution history in the conflict log.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import ECSModal from '../ECSModal';
import { SafeIcon as Ionicons } from '../SafeIcon';


import { SPACING, RADIUS } from '../../lib/theme';
import { useTheme } from '../../context/ThemeContext';
import {
  type SyncConflict,
  type ConflictField,
  type FieldResolution,
  getFieldLabel,
  getTableLabel,
  getRecordDisplayName,
  buildMergedRow,
  determineStrategy,
  removePendingConflict,
  addConflictLogEntry,
  notifyConflictListeners,
} from '../../lib/conflictStore';
import {
  tripStore,
  riskScoreStore,
  loadItemStore,
  loadMapSlotStore,
  fuelWaterLogStore,
  waypointStore,
} from '../../lib/storage';

interface Props {
  visible: boolean;
  conflicts: SyncConflict[];
  onClose: () => void;
  onResolved: () => void;
  showToast: (msg: string) => void;
}

// ── Store mapping for applying resolutions ────────────────────
const STORE_MAP: Record<string, { bulkUpsert: (items: any[]) => Promise<void> }> = {
  trips: tripStore,
  risk_scores: riskScoreStore,
  load_items: loadItemStore,
  load_map_slots: loadMapSlotStore,
  fuel_water_logs: fuelWaterLogStore,
  waypoints: waypointStore,
};

export default function ConflictResolutionModal({ visible, conflicts, onClose, onResolved, showToast }: Props) {
  const { colors } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fieldStates, setFieldStates] = useState<Map<string, ConflictField[]>>(new Map());
  const [applying, setApplying] = useState(false);

  // Initialize field states from conflicts
  const getFieldsForConflict = useCallback((conflict: SyncConflict): ConflictField[] => {
    const existing = fieldStates.get(conflict.id);
    if (existing) return existing;
    return conflict.conflictingFields.map(f => ({ ...f }));
  }, [fieldStates]);

  const pendingConflicts = useMemo(() =>
    conflicts.filter(c => c.status === 'pending'),
    [conflicts]
  );

  const currentConflict = pendingConflicts[currentIndex] || null;
  const currentFields = currentConflict ? getFieldsForConflict(currentConflict) : [];

  // ── Update field resolution ─────────────────────────────────
  const setFieldResolution = useCallback((conflictId: string, fieldName: string, resolution: FieldResolution) => {
    setFieldStates(prev => {
      const next = new Map(prev);
      const conflict = pendingConflicts.find(c => c.id === conflictId);
      if (!conflict) return next;

      const fields = next.get(conflictId) || conflict.conflictingFields.map(f => ({ ...f }));
      const updated = fields.map(f =>
        f.field === fieldName ? { ...f, resolution } : f
      );
      next.set(conflictId, updated);
      return next;
    });
  }, [pendingConflicts]);

  // ── Set all fields to same resolution ───────────────────────
  const setAllFields = useCallback((conflictId: string, resolution: FieldResolution) => {
    setFieldStates(prev => {
      const next = new Map(prev);
      const conflict = pendingConflicts.find(c => c.id === conflictId);
      if (!conflict) return next;

      const fields = (next.get(conflictId) || conflict.conflictingFields.map(f => ({ ...f })))
        .map(f => ({ ...f, resolution }));
      next.set(conflictId, fields);
      return next;
    });
  }, [pendingConflicts]);

  // ── Apply resolution for current conflict ───────────────────
  const applyResolution = useCallback(async () => {
    if (!currentConflict) return;

    setApplying(true);
    try {
      const fields = fieldStates.get(currentConflict.id) || currentConflict.conflictingFields;

      // Build the merged row
      const conflictWithResolutions: SyncConflict = {
        ...currentConflict,
        conflictingFields: fields,
      };
      const mergedRow = buildMergedRow(conflictWithResolutions);
      const strategy = determineStrategy(fields);

      // Apply to the appropriate store
      const store = STORE_MAP[currentConflict.tableName];
      if (store) {
        await store.bulkUpsert([mergedRow]);
      }

      // Log the resolution
      addConflictLogEntry({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        conflictId: currentConflict.id,
        tableName: currentConflict.tableName,
        recordId: currentConflict.recordId,
        fieldResolutions: fields,
        resolvedAt: new Date().toISOString(),
        strategy,
        localUpdatedAt: currentConflict.localRow.updated_at || '',
        remoteUpdatedAt: currentConflict.remoteRow.updated_at || '',
      });

      // Remove from pending
      removePendingConflict(currentConflict.id);
      notifyConflictListeners();

      // Clean up field state
      setFieldStates(prev => {
        const next = new Map(prev);
        next.delete(currentConflict.id);
        return next;
      });

      showToast(`Conflict resolved: ${strategy.replace(/_/g, ' ')}`);

      // Move to next or close
      if (currentIndex >= pendingConflicts.length - 1) {
        setCurrentIndex(0);
        onResolved();
      } else {
        // Index stays same since the array shrinks
      }
    } catch (e: any) {
      showToast(`Resolution failed: ${e?.message || 'Unknown error'}`);
    }
    setApplying(false);
  }, [currentConflict, fieldStates, currentIndex, pendingConflicts, onResolved, showToast]);

  // ── Discard conflict (keep local as-is) ─────────────────────
  const discardConflict = useCallback(() => {
    if (!currentConflict) return;

    removePendingConflict(currentConflict.id);
    notifyConflictListeners();

    setFieldStates(prev => {
      const next = new Map(prev);
      next.delete(currentConflict.id);
      return next;
    });

    showToast('Conflict discarded (local version kept)');

    if (currentIndex >= pendingConflicts.length - 1) {
      setCurrentIndex(0);
      onResolved();
    }
  }, [currentConflict, currentIndex, pendingConflicts, onResolved, showToast]);

  // ── Format value for display ────────────────────────────────
  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return '(empty)';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'number') return String(val);
    const str = String(val);
    if (str.length > 60) return str.slice(0, 57) + '...';
    return str;
  };

  if (!visible || pendingConflicts.length === 0) return null;

  return (
    <ECSModal visible={visible} onClose={onClose} tier="global">
      <View style={[ms.overlay, { backgroundColor: 'transparent' }]}>

        <View style={[ms.container, { backgroundColor: colors.bg }]}>
          {/* ═══════ HEADER ═══════ */}
          <View style={[ms.header, { borderBottomColor: colors.border }]}>
            <View style={ms.headerLeft}>
              <Ionicons name="git-compare-outline" size={20} color={colors.warning} />
              <Text style={[ms.headerTitle, { color: colors.textPrimary }]}>SYNC CONFLICT</Text>
            </View>
            <View style={ms.headerRight}>
              <View style={[ms.counterBadge, { backgroundColor: colors.warning + '20', borderColor: colors.warning + '40' }]}>
                <Text style={[ms.counterText, { color: colors.warning }]}>
                  {currentIndex + 1} / {pendingConflicts.length}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={ms.closeBtn}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={ms.scroll}
            contentContainerStyle={ms.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {currentConflict && (
              <>
                {/* ═══════ CONFLICT INFO ═══════ */}
                <View style={[ms.infoCard, { backgroundColor: colors.bgCard, borderColor: colors.warning + '30' }]}>
                  <View style={ms.infoRow}>
                    <Ionicons name="document-outline" size={14} color={colors.gold} />
                    <Text style={[ms.infoLabel, { color: colors.textMuted }]}>Table</Text>
                    <Text style={[ms.infoValue, { color: colors.textPrimary }]}>
                      {getTableLabel(currentConflict.tableName)}
                    </Text>
                  </View>
                  <View style={ms.infoRow}>
                    <Ionicons name="pricetag-outline" size={14} color={colors.gold} />
                    <Text style={[ms.infoLabel, { color: colors.textMuted }]}>Record</Text>
                    <Text style={[ms.infoValue, { color: colors.textPrimary }]} numberOfLines={1}>
                      {getRecordDisplayName(currentConflict.localRow, currentConflict.tableName)}
                    </Text>
                  </View>
                  <View style={ms.infoRow}>
                    <Ionicons name="time-outline" size={14} color={colors.gold} />
                    <Text style={[ms.infoLabel, { color: colors.textMuted }]}>Detected</Text>
                    <Text style={[ms.infoValue, { color: colors.textMuted }]}>
                      {new Date(currentConflict.detectedAt).toLocaleString()}
                    </Text>
                  </View>
                  <View style={ms.timestampRow}>
                    <View style={[ms.tsBox, { backgroundColor: colors.info + '10', borderColor: colors.info + '30' }]}>
                      <Text style={[ms.tsLabel, { color: colors.info }]}>LOCAL</Text>
                      <Text style={[ms.tsValue, { color: colors.info }]}>
                        {currentConflict.localRow.updated_at
                          ? new Date(currentConflict.localRow.updated_at).toLocaleString()
                          : '?'}
                      </Text>
                    </View>
                    <View style={[ms.tsBox, { backgroundColor: colors.success + '10', borderColor: colors.success + '30' }]}>
                      <Text style={[ms.tsLabel, { color: colors.success }]}>REMOTE</Text>
                      <Text style={[ms.tsValue, { color: colors.success }]}>
                        {currentConflict.remoteRow.updated_at
                          ? new Date(currentConflict.remoteRow.updated_at).toLocaleString()
                          : '?'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* ═══════ QUICK ACTIONS ═══════ */}
                <View style={ms.quickActions}>
                  <TouchableOpacity
                    style={[ms.quickBtn, { backgroundColor: colors.info + '15', borderColor: colors.info + '40' }]}
                    onPress={() => setAllFields(currentConflict.id, 'local')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="phone-portrait-outline" size={14} color={colors.info} />
                    <Text style={[ms.quickBtnText, { color: colors.info }]}>KEEP ALL LOCAL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[ms.quickBtn, { backgroundColor: colors.success + '15', borderColor: colors.success + '40' }]}
                    onPress={() => setAllFields(currentConflict.id, 'remote')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="cloud-outline" size={14} color={colors.success} />
                    <Text style={[ms.quickBtnText, { color: colors.success }]}>KEEP ALL REMOTE</Text>
                  </TouchableOpacity>
                </View>

                {/* ═══════ FIELD-BY-FIELD DIFF ═══════ */}
                <Text style={[ms.sectionLabel, { color: colors.gold, borderBottomColor: colors.goldBorder }]}>
                  CONFLICTING FIELDS ({currentFields.length})
                </Text>

                {currentFields.map((field, idx) => {
                  const resolution = field.resolution;
                  return (
                    <View
                      key={field.field}
                      style={[
                        ms.fieldCard,
                        {
                          backgroundColor: colors.bgCard,
                          borderColor: resolution === 'local'
                            ? colors.info + '40'
                            : resolution === 'remote'
                              ? colors.success + '40'
                              : colors.warning + '40',
                        },
                      ]}
                    >
                      {/* Field name */}
                      <View style={ms.fieldHeader}>
                        <Text style={[ms.fieldName, { color: colors.textPrimary }]}>
                          {getFieldLabel(field.field)}
                        </Text>
                        <View style={[
                          ms.resolutionBadge,
                          {
                            backgroundColor: resolution === 'local'
                              ? colors.info + '15'
                              : resolution === 'remote'
                                ? colors.success + '15'
                                : colors.warning + '15',
                          },
                        ]}>
                          <Text style={[
                            ms.resolutionBadgeText,
                            {
                              color: resolution === 'local'
                                ? colors.info
                                : resolution === 'remote'
                                  ? colors.success
                                  : colors.warning,
                            },
                          ]}>
                            {resolution.toUpperCase()}
                          </Text>
                        </View>
                      </View>

                      {/* Side-by-side values */}
                      <View style={ms.diffRow}>
                        <View style={[
                          ms.diffBox,
                          {
                            backgroundColor: resolution === 'local' ? colors.info + '08' : 'transparent',
                            borderColor: resolution === 'local' ? colors.info + '30' : colors.border,
                          },
                        ]}>
                          <View style={ms.diffLabelRow}>
                            <Ionicons name="phone-portrait-outline" size={10} color={colors.info} />
                            <Text style={[ms.diffLabel, { color: colors.info }]}>LOCAL</Text>
                          </View>
                          <Text
                            style={[
                              ms.diffValue,
                              { color: colors.textPrimary },
                              resolution === 'local' && { fontWeight: '800' },
                            ]}
                            numberOfLines={3}
                          >
                            {formatValue(field.localValue)}
                          </Text>
                        </View>

                        <View style={[ms.diffArrow, { backgroundColor: colors.border }]}>
                          <Ionicons name="swap-horizontal" size={12} color={colors.textMuted} />
                        </View>

                        <View style={[
                          ms.diffBox,
                          {
                            backgroundColor: resolution === 'remote' ? colors.success + '08' : 'transparent',
                            borderColor: resolution === 'remote' ? colors.success + '30' : colors.border,
                          },
                        ]}>
                          <View style={ms.diffLabelRow}>
                            <Ionicons name="cloud-outline" size={10} color={colors.success} />
                            <Text style={[ms.diffLabel, { color: colors.success }]}>REMOTE</Text>
                          </View>
                          <Text
                            style={[
                              ms.diffValue,
                              { color: colors.textPrimary },
                              resolution === 'remote' && { fontWeight: '800' },
                            ]}
                            numberOfLines={3}
                          >
                            {formatValue(field.remoteValue)}
                          </Text>
                        </View>
                      </View>

                      {/* Resolution buttons */}
                      <View style={ms.resolutionRow}>
                        <TouchableOpacity
                          style={[
                            ms.resBtn,
                            {
                              borderColor: colors.info + '40',
                              backgroundColor: resolution === 'local' ? colors.info + '15' : 'transparent',
                            },
                          ]}
                          onPress={() => setFieldResolution(currentConflict.id, field.field, 'local')}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={resolution === 'local' ? 'radio-button-on' : 'radio-button-off'}
                            size={14}
                            color={colors.info}
                          />
                          <Text style={[ms.resBtnText, { color: colors.info }]}>LOCAL</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            ms.resBtn,
                            {
                              borderColor: colors.success + '40',
                              backgroundColor: resolution === 'remote' ? colors.success + '15' : 'transparent',
                            },
                          ]}
                          onPress={() => setFieldResolution(currentConflict.id, field.field, 'remote')}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={resolution === 'remote' ? 'radio-button-on' : 'radio-button-off'}
                            size={14}
                            color={colors.success}
                          />
                          <Text style={[ms.resBtnText, { color: colors.success }]}>REMOTE</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            <View style={{ height: 100 }} />
          </ScrollView>

          {/* ═══════ BOTTOM ACTION BAR ═══════ */}
          <View style={[ms.bottomBar, { backgroundColor: colors.bgCard, borderTopColor: colors.border }]}>
            {/* Navigation */}
            {pendingConflicts.length > 1 && (
              <View style={ms.navRow}>
                <TouchableOpacity
                  style={[ms.navBtn, { borderColor: colors.border }]}
                  onPress={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="chevron-back"
                    size={16}
                    color={currentIndex === 0 ? colors.textMuted : colors.textPrimary}
                  />
                </TouchableOpacity>
                <Text style={[ms.navLabel, { color: colors.textMuted }]}>
                  Conflict {currentIndex + 1} of {pendingConflicts.length}
                </Text>
                <TouchableOpacity
                  style={[ms.navBtn, { borderColor: colors.border }]}
                  onPress={() => setCurrentIndex(Math.min(pendingConflicts.length - 1, currentIndex + 1))}
                  disabled={currentIndex === pendingConflicts.length - 1}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={currentIndex === pendingConflicts.length - 1 ? colors.textMuted : colors.textPrimary}
                  />
                </TouchableOpacity>
              </View>
            )}

            {/* Action buttons */}
            <View style={ms.actionRow}>
              <TouchableOpacity
                style={[ms.discardBtn, { borderColor: colors.danger + '40' }]}
                onPress={discardConflict}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={14} color={colors.danger} />
                <Text style={[ms.discardBtnText, { color: colors.danger }]}>DISCARD</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  ms.applyBtn,
                  {
                    backgroundColor: colors.gold,
                    opacity: applying ? 0.6 : 1,
                  },
                ]}
                onPress={applyResolution}
                disabled={applying}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark-circle" size={18} color="#000" />
                <Text style={ms.applyBtnText}>
                  {applying ? 'APPLYING...' : 'APPLY RESOLUTION'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </ECSModal>

  );
}

// ── Styles ────────────────────────────────────────────────────
const ms = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 700,
    ...(Platform.OS === 'web' ? {
      maxHeight: '95vh' as any,
      marginVertical: 20,
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
    } : {}),
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
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  counterBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  counterText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  closeBtn: {
    padding: 4,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
  },

  // Info card
  infoCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    width: 60,
  },
  infoValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
  timestampRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  tsBox: {
    flex: 1,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  tsLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 2,
  },
  tsValue: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Courier',
  },

  // Quick actions
  quickActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  quickBtnText: {
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

  // Field card
  fieldCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  fieldName: {
    fontSize: 13,
    fontWeight: '700',
  },
  resolutionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  resolutionBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Diff row
  diffRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 0,
    marginBottom: SPACING.sm,
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
    fontSize: 12,
    fontFamily: 'Courier',
    lineHeight: 16,
  },
  diffArrow: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    marginHorizontal: 2,
  },

  // Resolution buttons
  resolutionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  resBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  resBtnText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Bottom bar
  bottomBar: {
    padding: SPACING.md,
    borderTopWidth: 1,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  discardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  discardBtnText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  applyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: RADIUS.sm,
  },
  applyBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
});






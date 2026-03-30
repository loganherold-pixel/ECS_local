/**
 * ChecklistTab — Pre-Departure Rig Checklist
 *
 * Grouped list of common overland items with:
 *   - Check/uncheck to mark "packed"
 *   - Collapsible category groups
 *   - "Assign Container" action to push items into loadout
 *   - Progress tracking per group and overall
 *
 * Lightweight, fast, and simple.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { CHECKLIST_GROUPS, type ChecklistItem, type ChecklistGroup } from './ChecklistData';
import type { ContainerZone } from '../../lib/accessoryFramework';
import type { AddItemPayload } from './AddItemModal';

// ── Constants ───────────────────────────────────────────────
const ECS_GOLD = '#C48A2C';

// ── Props ───────────────────────────────────────────────────
interface ChecklistTabProps {
  /** Available container zones for "Assign Container" */
  containerZones: ContainerZone[];
  /** Callback to add an item to the loadout */
  onAddToLoadout: (payload: AddItemPayload) => Promise<void>;
  /** Show toast message */
  showToast: (msg: string) => void;
}

// ── Packed state type ───────────────────────────────────────
type PackedState = Record<string, boolean>;

export default function ChecklistTab({
  containerZones,
  onAddToLoadout,
  showToast,
}: ChecklistTabProps) {
  // ── State ─────────────────────────────────────────────────
  const [packedItems, setPackedItems] = useState<PackedState>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [containerPickerVisible, setContainerPickerVisible] = useState(false);
  const [pendingAssignItem, setPendingAssignItem] = useState<ChecklistItem | null>(null);
  const [assignedItems, setAssignedItems] = useState<Record<string, string>>({}); // itemId → containerKey

  // ── Toggle packed ─────────────────────────────────────────
  const togglePacked = useCallback((itemId: string) => {
    setPackedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  }, []);

  // ── Toggle group collapse ─────────────────────────────────
  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  // ── Overall stats ─────────────────────────────────────────
  const stats = useMemo(() => {
    let total = 0;
    let packed = 0;
    let critical = 0;
    let criticalPacked = 0;
    for (const group of CHECKLIST_GROUPS) {
      for (const item of group.items) {
        total++;
        if (packedItems[item.id]) packed++;
        if (item.isCritical) {
          critical++;
          if (packedItems[item.id]) criticalPacked++;
        }
      }
    }
    return { total, packed, critical, criticalPacked, pct: total > 0 ? Math.round((packed / total) * 100) : 0 };
  }, [packedItems]);

  // ── Group stats ───────────────────────────────────────────
  const getGroupStats = useCallback((group: ChecklistGroup) => {
    const total = group.items.length;
    const packed = group.items.filter(i => packedItems[i.id]).length;
    return { total, packed, pct: total > 0 ? Math.round((packed / total) * 100) : 0 };
  }, [packedItems]);

  // ── Assign Container flow ─────────────────────────────────
  const handleAssignPress = useCallback((item: ChecklistItem) => {
    if (containerZones.length === 0) {
      showToast('NO CONTAINERS — CONFIGURE ACCESSORIES FIRST');
      return;
    }
    setPendingAssignItem(item);
    setContainerPickerVisible(true);
  }, [containerZones, showToast]);

  const handleContainerSelect = useCallback(async (zone: ContainerZone) => {
    if (!pendingAssignItem) return;
    setContainerPickerVisible(false);

    try {
      await onAddToLoadout({
        name: pendingAssignItem.name,
        quantity: 1,
        weight_lbs: pendingAssignItem.approxWeightLbs ?? null,
        is_critical: pendingAssignItem.isCritical,
        notes: null,
        storage_location: zone.id,
      });

      // Mark as assigned
      setAssignedItems(prev => ({ ...prev, [pendingAssignItem.id]: zone.id }));

      // Also mark as packed
      setPackedItems(prev => ({ ...prev, [pendingAssignItem.id]: true }));

      showToast(`ADDED TO ${zone.label.toUpperCase()}`);
    } catch (e) {
      console.error('[Checklist] Assign error:', e);
      showToast('FAILED TO ADD ITEM');
    }

    setPendingAssignItem(null);
  }, [pendingAssignItem, onAddToLoadout, showToast]);

  // ── Check All / Uncheck All ───────────────────────────────
  const handleCheckAll = useCallback(() => {
    const newState: PackedState = {};
    for (const group of CHECKLIST_GROUPS) {
      for (const item of group.items) {
        newState[item.id] = true;
      }
    }
    setPackedItems(newState);
  }, []);

  const handleUncheckAll = useCallback(() => {
    setPackedItems({});
  }, []);

  // ── Readiness color ───────────────────────────────────────
  const getReadinessColor = (pct: number) => {
    if (pct >= 100) return '#4CAF50';
    if (pct >= 70) return TACTICAL.amber;
    if (pct >= 40) return '#FF9800';
    return TACTICAL.danger;
  };

  // ── Get container label for assigned item ─────────────────
  const getAssignedContainerLabel = (itemId: string): string | null => {
    const containerKey = assignedItems[itemId];
    if (!containerKey) return null;
    const zone = containerZones.find(z => z.id === containerKey);
    return zone?.label || containerKey;
  };

  return (
    <View style={styles.container}>
      {/* ── Progress Header ──────────────────────────────────── */}
      <View style={styles.progressHeader}>
        <View style={styles.progressLeft}>
          <Text style={[styles.progressPct, { color: getReadinessColor(stats.pct) }]}>
            {stats.pct}%
          </Text>
          <View>
            <Text style={styles.progressLabel}>CHECKLIST COMPLETE</Text>
            <Text style={styles.progressSub}>
              {stats.packed}/{stats.total} items
              {stats.critical > 0 && ` · ${stats.criticalPacked}/${stats.critical} critical`}
            </Text>
          </View>
        </View>
        <View style={styles.progressActions}>
          <TouchableOpacity style={styles.miniBtn} onPress={handleCheckAll}>
            <Ionicons name="checkmark-done-outline" size={14} color="#4CAF50" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.miniBtn} onPress={handleUncheckAll}>
            <Ionicons name="close-circle-outline" size={14} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Progress Bar ─────────────────────────────────────── */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.min(100, stats.pct)}%`, backgroundColor: getReadinessColor(stats.pct) },
            ]}
          />
        </View>
      </View>

      {/* ── Checklist Groups ─────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {CHECKLIST_GROUPS.map(group => {
          const isCollapsed = collapsedGroups[group.id];
          const gs = getGroupStats(group);

          return (
            <View key={group.id} style={styles.group}>
              {/* ── Group Header ──────────────────────────────── */}
              <TouchableOpacity
                style={styles.groupHeader}
                onPress={() => toggleGroup(group.id)}
                activeOpacity={0.7}
              >
                <View style={styles.groupHeaderLeft}>
                  <View style={[styles.groupIcon, { backgroundColor: `${group.color}15`, borderColor: `${group.color}30` }]}>
                    <Ionicons name={group.iconName as any} size={14} color={group.color} />
                  </View>
                  <Text style={styles.groupLabel}>{group.label.toUpperCase()}</Text>
                  <View style={[styles.groupCountBadge, gs.pct >= 100 && styles.groupCountBadgeComplete]}>
                    <Text style={[styles.groupCountText, gs.pct >= 100 && styles.groupCountTextComplete]}>
                      {gs.packed}/{gs.total}
                    </Text>
                  </View>
                </View>
                <View style={styles.groupHeaderRight}>
                  {/* Mini progress bar */}
                  <View style={styles.groupProgressTrack}>
                    <View
                      style={[
                        styles.groupProgressFill,
                        { width: `${Math.min(100, gs.pct)}%`, backgroundColor: getReadinessColor(gs.pct) },
                      ]}
                    />
                  </View>
                  <Ionicons
                    name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                    size={14}
                    color={TACTICAL.textMuted}
                  />
                </View>
              </TouchableOpacity>

              {/* ── Group Items ────────────────────────────────── */}
              {!isCollapsed && (
                <View style={styles.groupItems}>
                  {group.items.map(item => {
                    const isPacked = packedItems[item.id] || false;
                    const assignedLabel = getAssignedContainerLabel(item.id);

                    return (
                      <View key={item.id} style={[styles.itemRow, item.isCritical && styles.itemRowCritical]}>
                        {/* Checkbox */}
                        <TouchableOpacity
                          style={styles.checkbox}
                          onPress={() => togglePacked(item.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons
                            name={isPacked ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={isPacked ? '#4CAF50' : 'rgba(138,138,133,0.35)'}
                          />
                        </TouchableOpacity>

                        {/* Item Info */}
                        <View style={styles.itemInfo}>
                          <Text
                            style={[styles.itemName, isPacked && styles.itemNamePacked]}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                          <View style={styles.itemMeta}>
                            {item.isCritical && (
                              <View style={styles.critBadge}>
                                <Ionicons name="alert-circle" size={8} color={TACTICAL.danger} />
                                <Text style={styles.critText}>CRITICAL</Text>
                              </View>
                            )}
                            {item.approxWeightLbs != null && item.approxWeightLbs > 0 && (
                              <Text style={styles.weightHint}>
                                ~{item.approxWeightLbs} lb
                              </Text>
                            )}
                            {assignedLabel && (
                              <View style={styles.assignedBadge}>
                                <Ionicons name="cube" size={7} color={ECS_GOLD} />
                                <Text style={styles.assignedText}>{assignedLabel}</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Assign Container Button */}
                        {!assignedItems[item.id] && (
                          <TouchableOpacity
                            style={styles.assignBtn}
                            onPress={() => handleAssignPress(item)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Ionicons name="arrow-forward-circle-outline" size={16} color={ECS_GOLD} />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        {/* ── Bottom Spacer ──────────────────────────────────── */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Container Picker Modal ────────────────────────────── */}
      <Modal visible={containerPickerVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => { setContainerPickerVisible(false); setPendingAssignItem(null); }}
        >
          <View style={styles.pickerSheet}>
            {/* Picker Header */}
            <View style={styles.pickerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerTitle}>ASSIGN CONTAINER</Text>
                {pendingAssignItem && (
                  <Text style={styles.pickerSub} numberOfLines={1}>
                    {pendingAssignItem.name}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => { setContainerPickerVisible(false); setPendingAssignItem(null); }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Container Options */}
            <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
              {containerZones.length === 0 ? (
                <View style={styles.pickerEmpty}>
                  <Ionicons name="cube-outline" size={32} color={TACTICAL.textMuted} />
                  <Text style={styles.pickerEmptyText}>No containers configured</Text>
                </View>
              ) : (
                containerZones.map(zone => {
                  const isSuggested = pendingAssignItem?.suggestedContainer === zone.id;
                  return (
                    <TouchableOpacity
                      key={zone.id}
                      style={[styles.pickerOption, isSuggested && styles.pickerOptionSuggested]}
                      onPress={() => handleContainerSelect(zone)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.pickerIconWrap, { backgroundColor: `${zone.color}15`, borderColor: `${zone.color}30` }]}>
                        <Ionicons name={zone.icon as any} size={16} color={zone.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerOptionLabel}>{zone.label}</Text>
                        {isSuggested && (
                          <Text style={styles.pickerSuggestedText}>SUGGESTED</Text>
                        )}
                      </View>
                      <Ionicons name="add-circle-outline" size={18} color={zone.color} />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {/* Skip / Don't Assign */}
            <TouchableOpacity
              style={styles.pickerSkipBtn}
              onPress={() => {
                if (pendingAssignItem) {
                  setPackedItems(prev => ({ ...prev, [pendingAssignItem.id]: true }));
                }
                setContainerPickerVisible(false);
                setPendingAssignItem(null);
              }}
            >
              <Text style={styles.pickerSkipText}>MARK PACKED WITHOUT ASSIGNING</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Progress Header ───────────────────────────────────────
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.12)',
  },
  progressLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressPct: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  progressLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  progressSub: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  progressActions: {
    flexDirection: 'row',
    gap: 6,
  },
  miniBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Progress Bar ──────────────────────────────────────────
  progressBarContainer: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  progressBarTrack: {
    height: 3,
    backgroundColor: TACTICAL.panel,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  // ── Scroll ────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 6,
    paddingBottom: 20,
  },

  // ── Group ─────────────────────────────────────────────────
  group: {
    marginHorizontal: 10,
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  groupIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  groupCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(138,138,133,0.1)',
  },
  groupCountBadgeComplete: {
    backgroundColor: 'rgba(76,175,80,0.12)',
  },
  groupCountText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  groupCountTextComplete: {
    color: '#4CAF50',
  },
  groupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupProgressTrack: {
    width: 40,
    height: 3,
    backgroundColor: 'rgba(138,138,133,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  groupProgressFill: {
    height: '100%',
    borderRadius: 2,
  },

  // ── Group Items ───────────────────────────────────────────
  groupItems: {
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
  },

  // ── Item Row ──────────────────────────────────────────────
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(30,35,43,0.5)',
  },
  itemRowCritical: {
    borderLeftWidth: 3,
    borderLeftColor: TACTICAL.danger,
  },
  checkbox: {
    padding: 2,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.text,
  },
  itemNamePacked: {
    textDecorationLine: 'line-through',
    color: TACTICAL.textMuted,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  critBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: `${TACTICAL.danger}15`,
    borderRadius: 3,
  },
  critText: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.danger,
    letterSpacing: 0.5,
  },
  weightHint: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  assignedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(196,138,44,0.08)',
    borderRadius: 3,
  },
  assignedText: {
    fontSize: 7,
    fontWeight: '800',
    color: ECS_GOLD,
    letterSpacing: 0.3,
  },
  assignBtn: {
    padding: 4,
  },

  // ── Container Picker Modal ────────────────────────────────
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: TACTICAL.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    borderTopWidth: 2,
    borderColor: TACTICAL.border,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  pickerTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 2,
  },
  pickerSub: {
    fontSize: 10,
    color: ECS_GOLD,
    fontWeight: '600',
    marginTop: 2,
  },
  pickerList: {
    padding: 10,
    maxHeight: 300,
  },
  pickerEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  pickerEmptyText: {
    fontSize: 12,
    color: TACTICAL.textMuted,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
    marginBottom: 5,
  },
  pickerOptionSuggested: {
    borderColor: 'rgba(196,138,44,0.4)',
    backgroundColor: 'rgba(196,138,44,0.06)',
  },
  pickerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerOptionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  pickerSuggestedText: {
    fontSize: 7,
    fontWeight: '900',
    color: ECS_GOLD,
    letterSpacing: 1,
    marginTop: 1,
  },
  pickerSkipBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
  },
  pickerSkipText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
});




import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Modal, Switch } from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import TabErrorBoundary from '../../components/TabErrorBoundary';


import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, RADIUS, ZONES, MODES, ZONE_COLORS } from '../../lib/theme';
import { useApp } from '../../context/AppContext';
import { loadItemStore } from '../../lib/storage';
import { LoadItem } from '../../lib/types';
import { getActiveItems, getPackingStats } from '../../lib/calculations';
import Header from '../../components/Header';
import AuthModal from '../../components/AuthModal';
import Toast from '../../components/Toast';

function LoadItemsScreenInner() {
  const { activeTrip, loadItems, refreshActiveTrip, showToast } = useApp();
  const [authVisible, setAuthVisible] = useState(false);
  const [editItem, setEditItem] = useState<LoadItem | null>(null);
  const [editFields, setEditFields] = useState<Partial<LoadItem>>({});
  const [filterZone, setFilterZone] = useState<string | null>(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(true); // DEFAULT: Active items only
  const [quickName, setQuickName] = useState('');

  useFocusEffect(useCallback(() => { refreshActiveTrip(); }, [refreshActiveTrip]));

  const activeMode = activeTrip?.active_mode || 'Trip';

  // Compute active items and packing stats
  const activeItems = useMemo(() => getActiveItems(loadItems, activeMode), [loadItems, activeMode]);
  const packStats = useMemo(() => getPackingStats(loadItems, activeMode), [loadItems, activeMode]);

  // Filtered items: apply zone filter + active-only filter
  const filteredItems = useMemo(() => {
    let items = loadItems;
    // Active-only filter (default ON)
    if (showActiveOnly) {
      items = items.filter(i => i.mode === activeMode || i.mode === 'Both');
    }
    // Zone filter
    if (filterZone) {
      items = items.filter(i => i.zone === filterZone);
    }
    return items;
  }, [loadItems, showActiveOnly, activeMode, filterZone]);

  if (!activeTrip) {
    return (
      <View style={styles.container}>
        <Header onAuthPress={() => setAuthVisible(true)} />
        <View style={styles.emptyState}>
          <Ionicons name="cube-outline" size={56} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>No Active Trip</Text>
          <Text style={styles.emptySubtext}>Select a trip first</Text>
        </View>
        <AuthModal visible={authVisible} onClose={() => setAuthVisible(false)} />
        <Toast />
      </View>
    );
  }

  const quickAdd = async () => {
    if (!quickName.trim()) return;
    await loadItemStore.create({
      trip_id: activeTrip.id,
      name: quickName.trim(),
      zone: filterZone || 'Cab',
      mode: 'Both',
    });
    setQuickName('');
    refreshActiveTrip();
    showToast('Item added');
  };

  const togglePacked = async (item: LoadItem) => {
    await loadItemStore.update(item.id, { packed: !item.packed });
    refreshActiveTrip();
  };

  const deleteItem = async (id: string) => {
    await loadItemStore.softDelete(id);
    refreshActiveTrip();
    showToast('Item deleted');
  };

  const openEdit = (item: LoadItem) => {
    setEditItem(item);
    setEditFields({ ...item });
  };

  const saveEdit = async () => {
    if (!editItem) return;
    await loadItemStore.update(editItem.id, editFields);
    setEditItem(null);
    refreshActiveTrip();
    showToast('Item updated');
  };

  const bulkPackAll = async () => {
    await loadItemStore.bulkUpdatePacked(activeTrip.id, filterZone, true, activeMode);
    refreshActiveTrip();
    showToast('All active items marked packed');
  };

  const bulkUnpackAll = async () => {
    await loadItemStore.bulkUpdatePacked(activeTrip.id, filterZone, false, activeMode);
    refreshActiveTrip();
    showToast('All items unpacked');
  };

  const renderChipSelect = (label: string, field: string, options: readonly string[]) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, (editFields as any)?.[field] === opt && styles.chipActive]}
            onPress={() => setEditFields(prev => ({ ...prev, [field]: opt }))}
          >
            <Text style={[styles.chipText, (editFields as any)?.[field] === opt && styles.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  // Active Packed % alert threshold
  const activePackedPctLow = packStats.pct < 70 && packStats.totalActive > 0;

  return (
    <View style={styles.container}>
      <Header onAuthPress={() => setAuthVisible(true)} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Active Mode Badge */}
        <View style={styles.modeBadgeRow}>
          <View style={styles.modeBadge}>
            <Ionicons name="flash" size={12} color={COLORS.gold} />
            <Text style={styles.modeBadgeText}>Active Mode: {activeMode}</Text>
          </View>
          {activePackedPctLow && (
            <View style={styles.alertPctBadge}>
              <Ionicons name="alert-circle" size={12} color={COLORS.danger} />
              <Text style={styles.alertPctText}>{packStats.pct}% packed</Text>
            </View>
          )}
        </View>

        {/* Stats Bar */}
        <View style={styles.statsBar}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{loadItems.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: COLORS.gold }]}>{packStats.totalActive}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: COLORS.success }]}>{packStats.packedActive}</Text>
            <Text style={styles.statLabel}>Packed</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: packStats.pct >= 100 ? COLORS.success : packStats.pct >= 70 ? COLORS.gold : COLORS.danger }]}>{packStats.pct}%</Text>
            <Text style={styles.statLabel}>Complete</Text>
          </View>
          <TouchableOpacity style={styles.checklistBtn} onPress={() => setShowChecklist(!showChecklist)}>
            <Ionicons name={showChecklist ? 'list' : 'checkbox-outline'} size={18} color={COLORS.gold} />
          </TouchableOpacity>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, {
            width: `${Math.min(packStats.pct, 100)}%`,
            backgroundColor: packStats.pct >= 70 ? COLORS.gold : COLORS.danger,
          }]} />
        </View>

        {/* Active-Only Toggle + Zone Filter */}
        <View style={styles.filterSection}>
          <TouchableOpacity
            style={[styles.activeToggle, showActiveOnly && styles.activeToggleOn]}
            onPress={() => setShowActiveOnly(!showActiveOnly)}
          >
            <Ionicons
              name={showActiveOnly ? 'flash' : 'flash-outline'}
              size={14}
              color={showActiveOnly ? COLORS.gold : COLORS.textMuted}
            />
            <Text style={[styles.activeToggleText, showActiveOnly && styles.activeToggleTextOn]}>
              {showActiveOnly ? `Active (${activeMode})` : 'All Items'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, !filterZone && styles.filterChipActive]}
            onPress={() => setFilterZone(null)}
          >
            <Text style={[styles.filterChipText, !filterZone && styles.filterChipTextActive]}>All</Text>
          </TouchableOpacity>
          {ZONES.map(z => (
            <TouchableOpacity
              key={z}
              style={[styles.filterChip, filterZone === z && styles.filterChipActive, filterZone === z && { borderColor: ZONE_COLORS[z] }]}
              onPress={() => setFilterZone(filterZone === z ? null : z)}
            >
              <View style={[styles.zoneDot, { backgroundColor: ZONE_COLORS[z] }]} />
              <Text style={[styles.filterChipText, filterZone === z && { color: ZONE_COLORS[z] }]}>{z}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Quick Add */}
        <View style={styles.quickAdd}>
          <TextInput
            style={styles.quickInput}
            value={quickName}
            onChangeText={setQuickName}
            placeholder="Quick add item..."
            placeholderTextColor={COLORS.textMuted}
            onSubmitEditing={quickAdd}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.quickBtn} onPress={quickAdd}>
            <Ionicons name="add" size={22} color="#000" />
          </TouchableOpacity>
        </View>

        {/* Bulk Actions */}
        <View style={styles.bulkRow}>
          <TouchableOpacity style={styles.bulkBtn} onPress={bulkPackAll}>
            <Ionicons name="checkmark-done" size={14} color={COLORS.success} />
            <Text style={[styles.bulkText, { color: COLORS.success }]}>Pack All Active</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bulkBtn} onPress={bulkUnpackAll}>
            <Ionicons name="close-circle-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.bulkText}>Unpack All</Text>
          </TouchableOpacity>
        </View>

        {/* Items List */}
        {showChecklist ? (
          // Checklist view - active items only (always filtered by active_mode)
          <>
            <View style={styles.checklistHeader}>
              <Ionicons name="checkbox-outline" size={16} color={COLORS.gold} />
              <Text style={styles.checklistHeaderText}>PACKING CHECKLIST ({activeMode} mode)</Text>
            </View>
            {activeItems.map(item => (
              <TouchableOpacity key={item.id} style={styles.checkItem} onPress={() => togglePacked(item)}>
                <Ionicons
                  name={item.packed ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={item.packed ? COLORS.success : COLORS.textMuted}
                />
                <View style={styles.checkItemInfo}>
                  <Text style={[styles.checkItemName, item.packed && styles.checkItemPacked]}>{item.name}</Text>
                  <Text style={styles.checkItemMeta}>{item.zone} | Qty: {item.qty} | {item.mode}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {activeItems.length === 0 && (
              <View style={styles.emptyItems}>
                <Text style={styles.emptyItemsText}>No active items for {activeMode} mode</Text>
              </View>
            )}
          </>
        ) : (
          <>
            {/* Show filter indicator */}
            {showActiveOnly && (
              <View style={styles.filterIndicator}>
                <Ionicons name="funnel" size={10} color={COLORS.gold} />
                <Text style={styles.filterIndicatorText}>
                  Showing {filteredItems.length} {showActiveOnly ? 'active' : ''} item{filteredItems.length !== 1 ? 's' : ''}
                  {filterZone ? ` in ${filterZone}` : ''}
                </Text>
              </View>
            )}
            {filteredItems.map(item => {
              const isActive = item.mode === activeMode || item.mode === 'Both';
              return (
                <View key={item.id} style={[styles.itemCard, !isActive && styles.itemInactive]}>
                  <TouchableOpacity style={styles.packToggle} onPress={() => togglePacked(item)}>
                    <Ionicons
                      name={item.packed ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={item.packed ? COLORS.success : COLORS.textMuted}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.itemInfo} onPress={() => openEdit(item)}>
                    <View style={styles.itemHeader}>
                      <Text style={[styles.itemName, item.packed && styles.itemNamePacked]}>{item.name}</Text>
                      {!isActive && <Text style={styles.inactiveBadge}>INACTIVE</Text>}
                    </View>
                    <View style={styles.itemMeta}>
                      <View style={[styles.zoneBadge, { backgroundColor: `${ZONE_COLORS[item.zone] || COLORS.textMuted}20` }]}>
                        <Text style={[styles.zoneBadgeText, { color: ZONE_COLORS[item.zone] || COLORS.textMuted }]}>{item.zone}</Text>
                      </View>
                      <Text style={styles.metaText}>x{item.qty}</Text>
                      <View style={[styles.modePill, item.mode === 'Both' ? styles.modePillBoth : item.mode === activeMode ? styles.modePillActive : styles.modePillInactive]}>
                        <Text style={[styles.modePillText, item.mode === 'Both' ? styles.modePillTextBoth : item.mode === activeMode ? styles.modePillTextActive : styles.modePillTextInactive]}>{item.mode}</Text>
                      </View>
                      {item.weight_lbs != null && item.weight_lbs > 0 && <Text style={styles.metaText}>{item.weight_lbs}lb</Text>}
                    </View>
                    {item.notes ? <Text style={styles.notesText} numberOfLines={3}>{item.notes}</Text> : null}

                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(item.id)}>
                    <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}

        {filteredItems.length === 0 && !showChecklist && (
          <View style={styles.emptyItems}>
            <Text style={styles.emptyItemsText}>
              No {showActiveOnly ? 'active ' : ''}items{filterZone ? ` in ${filterZone}` : ''}
            </Text>
            {showActiveOnly && (
              <TouchableOpacity onPress={() => setShowActiveOnly(false)}>
                <Text style={styles.showAllLink}>Show all items</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit Item Modal */}
      <Modal visible={!!editItem} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Item</Text>
              <TouchableOpacity onPress={() => setEditItem(null)}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={editFields.name || ''}
                  onChangeText={v => setEditFields(p => ({ ...p, name: v }))}
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              {renderChipSelect('Zone', 'zone', ZONES)}
              {renderChipSelect('Mode', 'mode', MODES)}
              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Quantity</Text>
                  <TextInput
                    style={styles.input}
                    value={String(editFields.qty ?? 1)}
                    onChangeText={v => setEditFields(p => ({ ...p, qty: parseInt(v) || 1 }))}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Weight (lbs)</Text>
                  <TextInput
                    style={styles.input}
                    value={String(editFields.weight_lbs ?? '')}
                    onChangeText={v => setEditFields(p => ({ ...p, weight_lbs: v === '' ? null : parseFloat(v) || null }))}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Notes</Text>
                <TextInput
                  style={[styles.input, { minHeight: 60 }]}
                  value={editFields.notes || ''}
                  onChangeText={v => setEditFields(p => ({ ...p, notes: v }))}
                  multiline
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              <View style={styles.fieldGroup}>
                <View style={styles.switchRow}>
                  <Text style={styles.fieldLabel}>Packed</Text>
                  <Switch
                    value={editFields.packed || false}
                    onValueChange={v => setEditFields(p => ({ ...p, packed: v }))}
                    trackColor={{ false: COLORS.border, true: COLORS.success }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEdit}>
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <AuthModal visible={authVisible} onClose={() => setAuthVisible(false)} />
      <Toast />
    </View>
  );
}


export default function LoadItemsScreen() {
  return (
    <TabErrorBoundary tabName="LOAD ITEMS">
      <LoadItemsScreenInner />
    </TabErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: 100 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: COLORS.textSecondary, fontSize: 18, fontWeight: '600' },
  emptySubtext: { color: COLORS.textMuted, fontSize: 13 },

  // Mode Badge Row
  modeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.goldMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.goldBorder,
  },
  modeBadgeText: {
    fontSize: 11,
    color: COLORS.gold,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  alertPctBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,59,48,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.3)',
  },
  alertPctText: {
    fontSize: 11,
    color: COLORS.danger,
    fontWeight: '800',
  },

  // Stats
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, fontFamily: 'Courier' },
  statLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  checklistBtn: {
    marginLeft: 'auto',
    padding: 8,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.goldBorder,
  },
  progressBar: {
    height: 4,
    backgroundColor: COLORS.bgInput,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Active-Only Toggle
  filterSection: {
    marginBottom: SPACING.sm,
  },
  activeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    alignSelf: 'flex-start',
  },
  activeToggleOn: {
    borderColor: COLORS.goldBorder,
    backgroundColor: COLORS.goldMuted,
  },
  activeToggleText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  activeToggleTextOn: {
    color: COLORS.gold,
  },

  // Filter Row
  filterRow: { flexDirection: 'row', marginBottom: SPACING.md },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 6,
    backgroundColor: COLORS.bgInput,
  },
  filterChipActive: { borderColor: COLORS.gold, backgroundColor: COLORS.goldMuted },
  filterChipText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: COLORS.gold },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },

  // Filter Indicator
  filterIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
    paddingVertical: 4,
  },
  filterIndicatorText: {
    fontSize: 11,
    color: COLORS.gold,
    fontWeight: '600',
    fontStyle: 'italic',
  },

  // Quick Add
  quickAdd: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  quickInput: {
    flex: 1,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  quickBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.sm,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  bulkText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },

  // Checklist Header
  checklistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.md,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.goldBorder,
  },
  checklistHeaderText: {
    fontSize: 11,
    color: COLORS.gold,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  // Item Card
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemInactive: { opacity: 0.4 },
  packToggle: { padding: 4, marginRight: SPACING.sm },
  itemInfo: { flex: 1 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemName: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  itemNamePacked: { textDecorationLine: 'line-through', color: COLORS.textSecondary },
  inactiveBadge: { fontSize: 8, color: COLORS.textMuted, fontWeight: '800', letterSpacing: 1, backgroundColor: COLORS.bgInput, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  zoneBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3 },
  zoneBadgeText: { fontSize: 10, fontWeight: '700' },
  metaText: { fontSize: 11, color: COLORS.textMuted },
  notesText: { fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 2 },
  deleteBtn: { padding: 6 },

  // Mode Pill
  modePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  modePillBoth: {
    backgroundColor: 'rgba(90,200,250,0.1)',
    borderColor: 'rgba(90,200,250,0.3)',
  },
  modePillActive: {
    backgroundColor: 'rgba(52,199,89,0.1)',
    borderColor: 'rgba(52,199,89,0.3)',
  },
  modePillInactive: {
    backgroundColor: 'rgba(153,153,153,0.1)',
    borderColor: 'rgba(153,153,153,0.2)',
  },
  modePillText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  modePillTextBoth: { color: COLORS.info },
  modePillTextActive: { color: COLORS.success },
  modePillTextInactive: { color: COLORS.textMuted },

  // Empty
  emptyItems: { alignItems: 'center', paddingVertical: 30 },
  emptyItemsText: { color: COLORS.textMuted, fontSize: 14 },
  showAllLink: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    textDecorationLine: 'underline',
  },

  // Checklist
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  checkItemInfo: { flex: 1 },
  checkItemName: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
  checkItemPacked: { textDecorationLine: 'line-through', color: COLORS.success },
  checkItemMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: COLORS.bgModal, justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: COLORS.goldBorder,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.gold },
  modalBody: { padding: SPACING.lg },
  fieldGroup: { marginBottom: SPACING.md },
  fieldLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  row: { flexDirection: 'row', gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 6,
    backgroundColor: COLORS.bgInput,
  },
  chipActive: { borderColor: COLORS.gold, backgroundColor: COLORS.goldMuted },
  chipText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: COLORS.gold },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  saveBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  saveBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
});





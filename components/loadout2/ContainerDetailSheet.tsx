/**
 * ContainerDetailSheet — Loadout 2.0 Container Drill-Down
 *
 * Opens as a modal sheet when user taps a container card.
 * Shows:
 *   - Container name + icon + total weight prominently
 *   - Item list with packed toggles, qty steppers, weight
 *   - Quick Add button for pre-built item templates
 *   - Add Item button at bottom
 *   - Liquid-specific UI for water_storage container
 *
 * All item mutations are delegated to parent via callbacks.
 */
import React, { useMemo, useCallback, useState } from 'react';
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
import { AccessoryIcon } from '../vehicle-wizard/AccessoryIcons';
import { TACTICAL } from '../../lib/theme';
import type { LoadoutItem } from '../../lib/types';
import type { ContainerZone } from '../../lib/accessoryFramework';
import {
  getContainerWeight,
  getContainerItemCount,
  LIQUID_CONTAINER_KEY,
} from '../../lib/loadout2Types';
import ItemRow from './ItemRow';
import AddItemModal, { type AddItemPayload } from './AddItemModal';
import QuickAddLibrary from './QuickAddLibrary';

// ── Props ───────────────────────────────────────────────────
export interface ContainerDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The container zone being viewed */
  container: ContainerZone | null;
  /** All loadout items (will be filtered to this container) */
  allItems: LoadoutItem[];
  /** All container zones (for weight matching) */
  allZones: ContainerZone[];
  /** Loadout ID for new items */
  loadoutId: string;
  /** Called when an item is added */
  onAddItem: (payload: AddItemPayload) => Promise<void>;
  /** Called when an item is updated */
  onUpdateItem: (itemId: string, updates: Partial<LoadoutItem>) => Promise<void>;
  /** Called when an item is deleted */
  onDeleteItem: (itemId: string) => Promise<void>;
}

export default function ContainerDetailSheet({
  visible,
  onClose,
  container,
  allItems,
  allZones,
  loadoutId,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
}: ContainerDetailSheetProps) {
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [editItem, setEditItem] = useState<LoadoutItem | null>(null);
  const [saving, setSaving] = useState(false);

  // NOTE: All hooks MUST be called before any early return to satisfy
  // React's rules of hooks (same number of hooks every render).

  const isLiquid = container ? container.id === LIQUID_CONTAINER_KEY : false;
  const color = container ? (container.color || TACTICAL.amber) : TACTICAL.amber;

  // ── Filter items for this container ────────────────────────
  const containerItems = useMemo(() => {
    if (!container) return [];
    return allItems.filter(item => {
      if (!item.storage_location) return false;
      // Direct match on container key (Loadout 2.0 style)
      if (item.storage_location === container.id) return true;
      // Also try label match for legacy items
      if (item.storage_location.toLowerCase() === container.label.toLowerCase()) return true;
      return false;
    });
  }, [allItems, container]);

  // ── Compute totals ─────────────────────────────────────────
  const totalWeight = useMemo(() => {
    return containerItems.reduce(
      (sum, item) => sum + ((item.weight_lbs || 0) * (item.quantity || 1)),
      0
    );
  }, [containerItems]);

  const packedCount = useMemo(
    () => containerItems.filter(i => i.is_packed).length,
    [containerItems]
  );

  const criticalCount = useMemo(
    () => containerItems.filter(i => i.is_critical).length,
    [containerItems]
  );

  // ── Handlers ───────────────────────────────────────────────
  const handleTogglePacked = useCallback(async (itemId: string, packed: boolean) => {
    await onUpdateItem(itemId, { is_packed: packed });
  }, [onUpdateItem]);

  const handleUpdateQty = useCallback(async (itemId: string, qty: number) => {
    await onUpdateItem(itemId, { quantity: qty });
  }, [onUpdateItem]);

  const handleEdit = useCallback((item: LoadoutItem) => {
    setEditItem(item);
    setAddModalVisible(true);
  }, []);

  const handleDelete = useCallback((itemId: string) => {
    const doDelete = async () => {
      await onDeleteItem(itemId);
    };
    if (Platform.OS === 'web') {
      if (confirm('Remove this item from the container?')) doDelete();
    } else {
      Alert.alert('Remove Item', 'This item will be removed from the container.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [onDeleteItem]);

  const handleAddSave = useCallback(async (payload: AddItemPayload) => {
    setSaving(true);
    try {
      if (editItem) {
        // Update existing item
        await onUpdateItem(editItem.id, {
          name: payload.name,
          quantity: payload.quantity,
          weight_lbs: payload.weight_lbs,
          is_critical: payload.is_critical,
          notes: payload.notes,
          storage_location: payload.storage_location,
        });
      } else {
        // Add new item
        await onAddItem(payload);
      }
      setAddModalVisible(false);
      setEditItem(null);
    } catch (e) {
      console.error('[ContainerDetail] Save error:', e);
    }
    setSaving(false);
  }, [editItem, onAddItem, onUpdateItem]);

  const handleCloseAddModal = useCallback(() => {
    setAddModalVisible(false);
    setEditItem(null);
  }, []);

  // ── Quick Add handler ─────────────────────────────────────
  const handleQuickAdd = useCallback(async (item: { name: string; weight_lbs: number; is_critical: boolean }) => {
    if (!container) return;
    const payload: AddItemPayload = {
      name: item.name,
      quantity: 1,
      weight_lbs: item.weight_lbs,
      is_critical: item.is_critical,
      notes: null,
      storage_location: container.id,
    };
    await onAddItem(payload);
  }, [container, onAddItem]);

  // ── Early return AFTER all hooks ───────────────────────────
  if (!container) return null;


  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* ── Header ──────────────────────────────────────── */}
          <View style={[styles.header, { borderBottomColor: `${color}25` }]}>
            <View style={styles.headerTop}>
              <View style={styles.headerLeft}>
                <View style={[styles.iconWrap, { backgroundColor: `${color}18`, borderColor: `${color}40` }]}>
                  <AccessoryIcon categoryId={container.id} size={18} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.containerName}>{container.label}</Text>
                  <View style={styles.headerMeta}>
                    <Text style={styles.itemCountText}>
                      {containerItems.length} item{containerItems.length !== 1 ? 's' : ''}
                    </Text>
                    {packedCount > 0 && (
                      <View style={styles.packedBadge}>
                        <Ionicons name="checkmark-circle" size={9} color="#4CAF50" />
                        <Text style={styles.packedBadgeText}>{packedCount} PACKED</Text>
                      </View>
                    )}
                    {criticalCount > 0 && (
                      <View style={styles.critBadge}>
                        <Ionicons name="alert-circle" size={9} color={TACTICAL.danger} />
                        <Text style={styles.critBadgeText}>{criticalCount}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>

            {/* ── Weight Display ──────────────────────────────── */}
            <View style={[styles.weightBar, { borderColor: `${color}20` }]}>
              <View style={styles.weightBarLeft}>
                <Ionicons name="scale-outline" size={14} color={color} />
                <Text style={styles.weightBarLabel}>CONTAINER TOTAL</Text>
              </View>
              <Text style={[styles.weightBarValue, { color }]}>
                {totalWeight > 0
                  ? `${totalWeight >= 100 ? Math.round(totalWeight) : totalWeight.toFixed(1)} lb`
                  : '0 lb'}
              </Text>
            </View>

            {/* Liquid info banner */}
            {isLiquid && (
              <View style={styles.liquidBanner}>
                <Ionicons name="information-circle-outline" size={14} color="#4FC3F7" />
                <Text style={styles.liquidBannerText}>
                  Liquid items are entered by volume (gallons/liters). Weight is auto-computed from density.
                </Text>
              </View>
            )}
          </View>

          {/* ── Item List ───────────────────────────────────── */}
          <ScrollView
            style={styles.itemList}
            contentContainerStyle={styles.itemListContent}
            showsVerticalScrollIndicator={false}
          >
            {containerItems.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: `${color}10` }]}>
                  <AccessoryIcon categoryId={container.id} size={32} color={`${color}60`} />
                </View>
                <Text style={styles.emptyTitle}>EMPTY CONTAINER</Text>
                <Text style={styles.emptySubtext}>
                  {isLiquid
                    ? 'Add water, fuel, or other liquids to this container.'
                    : 'Use Quick Add for common items or add custom items below.'}
                </Text>
              </View>
            ) : (
              containerItems.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  containerColor={color}
                  onTogglePacked={handleTogglePacked}
                  onUpdateQty={handleUpdateQty}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))
            )}

            <View style={{ height: 80 }} />
          </ScrollView>

          {/* ── Bottom Action Bar (pinned) ─────────────────────── */}
          <View style={styles.addBar}>
            {/* Quick Add + Add Item side by side */}
            <View style={styles.buttonRow}>
              {/* Quick Add Button — opens template library */}
              {!isLiquid && (
                <TouchableOpacity
                  style={[styles.quickAddBtn, { borderColor: `${color}40` }]}
                  onPress={() => setQuickAddVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="library-outline" size={16} color={color} />
                  <Text style={[styles.quickAddBtnText, { color }]}>QUICK ADD</Text>
                </TouchableOpacity>
              )}

              {/* Add Item Button — opens manual form */}
              <TouchableOpacity
                style={[
                  styles.addBtn,
                  { borderColor: `${color}40` },
                  !isLiquid && { flex: 1 },
                ]}
                onPress={() => {
                  setEditItem(null);
                  setAddModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isLiquid ? 'water-outline' : 'add-circle-outline'}
                  size={18}
                  color={color}
                />
                <Text style={[styles.addBtnText, { color }]}>
                  {isLiquid ? 'ADD LIQUID' : 'ADD ITEM'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* ── Add/Edit Item Modal ────────────────────────────── */}
      <AddItemModal
        visible={addModalVisible}
        onClose={handleCloseAddModal}
        onSave={handleAddSave}
        containerKey={container.id}
        containerLabel={container.label}
        containerColor={color}
        editItem={editItem}
        saving={saving}
      />

      {/* ── Quick Add Library Modal ────────────────────────── */}
      <QuickAddLibrary
        visible={quickAddVisible}
        onClose={() => setQuickAddVisible(false)}
        onAddItem={handleQuickAdd}
        containerColor={color}
        containerLabel={container.label}
      />
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: TACTICAL.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '92%',
    minHeight: '50%',
    borderTopWidth: 2,
    borderColor: TACTICAL.border,
  },

  // ── Header ────────────────────────────────────────────────
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerName: {
    fontSize: 16,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  itemCountText: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },
  packedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(76,175,80,0.1)',
    borderRadius: 3,
  },
  packedBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 0.5,
  },
  critBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: `${TACTICAL.danger}12`,
    borderRadius: 3,
  },
  critBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.danger,
  },

  // ── Weight Bar ────────────────────────────────────────────
  weightBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  weightBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weightBarLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  weightBarValue: {
    fontSize: 20,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },

  // ── Liquid Banner ─────────────────────────────────────────
  liquidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(79, 195, 247, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(79, 195, 247, 0.15)',
  },
  liquidBannerText: {
    fontSize: 9,
    color: '#4FC3F7',
    fontWeight: '600',
    flex: 1,
    lineHeight: 14,
  },

  // ── Item List ─────────────────────────────────────────────
  itemList: {
    flex: 1,
  },
  itemListContent: {
    padding: 12,
    gap: 0,
  },

  // ── Empty State ───────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 2,
  },
  emptySubtext: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    paddingHorizontal: 30,
    lineHeight: 16,
  },

  // ── Bottom Action Bar ─────────────────────────────────────
  addBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  quickAddBtnText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
  },
});




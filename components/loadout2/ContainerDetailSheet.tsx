import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AccessoryIcon } from '../vehicle-wizard/AccessoryIcons';
import { ECSButton } from '../ECSButton';
import { ECSChip } from '../ECSChip';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import type { ContainerZone } from '../../lib/accessoryFramework';
import type { LoadoutItem } from '../../lib/types';
import { LIQUID_CONTAINER_KEY, getTotalLoadoutWeight } from '../../lib/loadout2Types';
import AddItemModal, { type AddItemPayload } from './AddItemModal';
import ItemRow from './ItemRow';
import QuickAddLibrary from './QuickAddLibrary';

type DetailFilter = 'all' | 'packed' | 'unpacked' | 'critical';

export interface ContainerDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  container: ContainerZone | null;
  allItems: LoadoutItem[];
  onAddItem: (payload: AddItemPayload) => Promise<void>;
  onUpdateItem: (itemId: string, updates: Partial<LoadoutItem>) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
}

export default function ContainerDetailSheet({
  visible,
  onClose,
  container,
  allItems,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
}: ContainerDetailSheetProps) {
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [editItem, setEditItem] = useState<LoadoutItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DetailFilter>('all');

  const isLiquid = container ? container.id === LIQUID_CONTAINER_KEY : false;
  const color = container?.color || TACTICAL.amber;

  const containerItems = useMemo(() => {
    if (!container) return [];
    return allItems.filter((item) => {
      const storageLocation = (item.storage_location || '').toLowerCase();
      return storageLocation === container.id || storageLocation === container.label.toLowerCase();
    });
  }, [allItems, container]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return containerItems.filter((item) => {
      if (filter === 'packed' && !item.is_packed) return false;
      if (filter === 'unpacked' && item.is_packed) return false;
      if (filter === 'critical' && !item.is_critical) return false;
      if (!query) return true;
      return [item.name, item.notes || '', item.storage_location || '']
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [containerItems, filter, search]);

  const totalWeight = useMemo(() => getTotalLoadoutWeight(containerItems), [containerItems]);
  const packedCount = useMemo(() => containerItems.filter((item) => item.is_packed).length, [containerItems]);
  const criticalCount = useMemo(() => containerItems.filter((item) => item.is_critical).length, [containerItems]);

  const handleTogglePacked = useCallback(async (itemId: string, packed: boolean) => {
    await onUpdateItem(itemId, { is_packed: packed });
  }, [onUpdateItem]);

  const handleUpdateQty = useCallback(async (itemId: string, quantity: number) => {
    await onUpdateItem(itemId, { quantity });
  }, [onUpdateItem]);

  const handleEdit = useCallback((item: LoadoutItem) => {
    setEditItem(item);
    setAddModalVisible(true);
  }, []);

  const handleDelete = useCallback((itemId: string) => {
    const runDelete = async () => onDeleteItem(itemId);
    if (Platform.OS === 'web') {
      if (confirm('Remove this item from the container?')) runDelete();
      return;
    }
    Alert.alert('Remove Item', 'This item will be removed from the container.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: runDelete },
    ]);
  }, [onDeleteItem]);

  const handleAddSave = useCallback(async (payload: AddItemPayload) => {
    setSaving(true);
    try {
      if (editItem) {
        await onUpdateItem(editItem.id, {
          name: payload.name,
          quantity: payload.quantity,
          weight_lbs: payload.weight_lbs,
          weight_source: payload.weight_source,
          category: payload.category ?? editItem.category,
          is_critical: payload.is_critical,
          notes: payload.notes,
          storage_location: payload.storage_location,
        });
      } else {
        await onAddItem(payload);
      }
      setAddModalVisible(false);
      setEditItem(null);
    } catch (error) {
      console.error('[ContainerDetailSheet] save failed', error);
    } finally {
      setSaving(false);
    }
  }, [editItem, onAddItem, onUpdateItem]);

  const handleQuickAdd = useCallback(async (item: {
    name: string;
    quantity?: number;
    weight_lbs: number;
    is_critical: boolean;
    category?: LoadoutItem['category'];
    weight_source?: LoadoutItem['weight_source'];
  }) => {
    if (!container) return;
    await onAddItem({
      name: item.name,
      quantity: item.quantity ?? 1,
      weight_lbs: item.weight_lbs,
      weight_source: item.weight_source,
      category: item.category,
      is_critical: item.is_critical,
      notes: null,
      storage_location: container.id,
    });
  }, [container, onAddItem]);

  if (!container) return null;

  return (
    <>
      <ECSModalShell
        visible={visible}
        onClose={onClose}
        title={container.label}
        subtitle={`${containerItems.length} items configured in this loadout zone`}
        icon="cube-outline"
        overlayClass="workflow"
        stackBehavior="allow-stack"
        scrollable
        maxHeightFraction={0.98}
        footer={(
          <ECSOverlayFooter>
            {!isLiquid ? (
              <ECSButton
                label="Quick Add"
                icon="library-outline"
                variant="secondary"
                size="large"
                onPress={() => setQuickAddVisible(true)}
                grow
              />
            ) : null}
            <ECSButton
              label={isLiquid ? 'Add Liquid' : 'Add Item'}
              icon={isLiquid ? 'water-outline' : 'add-circle-outline'}
              variant="primary"
              size="large"
              onPress={() => {
                setEditItem(null);
                setAddModalVisible(true);
              }}
              grow
            />
          </ECSOverlayFooter>
        )}
        bodyStyle={styles.modalBody}
        contentContainerStyle={styles.modalContent}
      >
        <View style={[styles.summaryCard, { borderColor: `${color}26` }]}>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryIconWrap, { backgroundColor: `${color}14`, borderColor: `${color}30` }]}>
              <AccessoryIcon categoryId={container.id} size={18} color={color} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryTitle}>Container Summary</Text>
              <Text style={styles.summarySubtitle}>
                {totalWeight > 0 ? `${totalWeight.toFixed(1)} lb total` : 'No weight recorded yet'}
              </Text>
            </View>
            <View style={styles.summaryStats}>
              <Text style={[styles.summaryStatValue, { color }]}>{containerItems.length}</Text>
              <Text style={styles.summaryStatLabel}>Items</Text>
            </View>
          </View>

          <View style={styles.summaryMeta}>
            <ECSChip label={`Packed ${packedCount}`} compact selected={packedCount > 0} />
            <ECSChip label={`Critical ${criticalCount}`} compact selected={criticalCount > 0} />
            {isLiquid ? <ECSChip label="Liquid Zone" compact selected /> : null}
          </View>
        </View>

        <View style={styles.toolsCard}>
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={15} color={TACTICAL.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search container items"
              placeholderTextColor={TACTICAL.textMuted}
              autoCorrect={false}
            />
            {search.length > 0 ? (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.filterWrap}>
            <ECSChip label="All" compact selected={filter === 'all'} onPress={() => setFilter('all')} />
            <ECSChip label="Packed" compact selected={filter === 'packed'} onPress={() => setFilter('packed')} />
            <ECSChip label="Unpacked" compact selected={filter === 'unpacked'} onPress={() => setFilter('unpacked')} />
            <ECSChip label="Critical" compact selected={filter === 'critical'} onPress={() => setFilter('critical')} />
          </View>
        </View>

        {filteredItems.length === 0 ? (
          <View style={styles.emptyState}>
            <AccessoryIcon categoryId={container.id} size={28} color={`${color}88`} />
            <Text style={styles.emptyTitle}>{containerItems.length === 0 ? 'Empty Container' : 'No Items Matched'}</Text>
            <Text style={styles.emptyBody}>
              {containerItems.length === 0
                ? (isLiquid ? 'Add water, fuel, or other liquids for this vehicle system.' : 'Use Quick Add or Add Item to populate this container.')
                : 'Clear the search or change the filter to review more items.'}
            </Text>
          </View>
        ) : (
          <View style={styles.itemList}>
            {filteredItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                containerColor={color}
                onTogglePacked={handleTogglePacked}
                onUpdateQty={handleUpdateQty}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </View>
        )}
      </ECSModalShell>

      <AddItemModal
        visible={addModalVisible}
        onClose={() => {
          setAddModalVisible(false);
          setEditItem(null);
        }}
        onSave={handleAddSave}
        containerKey={container.id}
        containerLabel={container.label}
        containerColor={color}
        editItem={editItem}
        saving={saving}
      />

      {!isLiquid ? (
        <QuickAddLibrary
          visible={quickAddVisible}
          onClose={() => setQuickAddVisible(false)}
          onAddItem={handleQuickAdd}
          containerColor={color}
          containerLabel={container.label}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  modalBody: {
    flex: 1,
    minHeight: 0,
  },
  modalContent: {
    gap: 10,
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(10,14,18,0.84)',
    padding: 10,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCopy: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.1,
  },
  summarySubtitle: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    marginTop: 3,
  },
  summaryStats: {
    minWidth: 44,
    alignItems: 'center',
  },
  summaryStatValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  summaryStatLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  summaryMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toolsCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
    padding: 10,
    gap: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  searchInput: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 0,
  },
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  itemList: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
    backgroundColor: TACTICAL.panel,
  },
  emptyState: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  emptyBody: {
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
});

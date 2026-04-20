import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ECSButton } from '../ECSButton';
import { ECSChip } from '../ECSChip';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  QUICK_ADD_CATALOG,
  QUICK_ADD_GROUPS,
  getQuickAddItemsForGroup,
  searchQuickAddCatalog,
  type QuickAddCatalogItem,
  type QuickAddGroupId,
} from '../../lib/loadoutQuickAddCatalog';
import type { LoadoutItemCategory, WeightSource } from '../../lib/types';

export interface QuickAddLibraryProps {
  visible: boolean;
  onClose: () => void;
  onAddItem: (item: {
    name: string;
    quantity?: number;
    weight_lbs: number;
    is_critical: boolean;
    category?: LoadoutItemCategory;
    weight_source?: WeightSource;
  }) => Promise<void>;
  containerColor: string;
  containerLabel: string;
}

export default function QuickAddLibrary({
  visible,
  onClose,
  onAddItem,
  containerColor,
  containerLabel,
}: QuickAddLibraryProps) {
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState<QuickAddGroupId | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setActiveGroup(null);
    setAddingId(null);
    setAddedIds(new Set());
  }, [visible]);

  const filteredItems = useMemo(
    () => searchQuickAddCatalog(search, activeGroup),
    [activeGroup, search],
  );

  const groupedResults = useMemo(() => {
    const groups = activeGroup
      ? [QUICK_ADD_GROUPS.find((group) => group.id === activeGroup)].filter(Boolean)
      : QUICK_ADD_GROUPS;
    return groups
      .map((group) => ({
        group: group!,
        items: search
          ? filteredItems.filter((item) => item.filterGroupId === group!.id)
          : getQuickAddItemsForGroup(group!.id),
      }))
      .filter((entry) => entry.items.length > 0);
  }, [activeGroup, filteredItems, search]);

  const handleAddItem = useCallback(async (item: QuickAddCatalogItem) => {
    if (addingId) return;
    setAddingId(item.id);
    try {
      await onAddItem({
        name: item.displayName,
        quantity: item.defaultQuantity,
        weight_lbs: item.defaultWeightLbs,
        is_critical: item.isCritical ?? false,
        category: item.persistedCategory,
        weight_source: item.persistedWeightSource,
      });
      setAddedIds((previous) => new Set(previous).add(item.id));
    } catch (error) {
      console.error('[QuickAddLibrary] add failed', error);
    } finally {
      setAddingId(null);
    }
  }, [addingId, onAddItem]);

  const totalResults = filteredItems.length;
  const addedCount = addedIds.size;

  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title="Quick Add"
      subtitle={`Browse common field gear for ${containerLabel}`}
      icon="library-outline"
      overlayClass="workflow"
      stackBehavior="allow-stack"
      footer={(
        <ECSOverlayFooter>
          <ECSButton
            label={addedCount > 0 ? `Close (${addedCount} Added)` : 'Close'}
            variant="primary"
            size="large"
            onPress={onClose}
            grow
          />
        </ECSOverlayFooter>
      )}
      bodyStyle={styles.modalBody}
      contentContainerStyle={styles.modalContent}
    >
      <View style={[styles.headerBlock, { borderColor: `${containerColor}24` }]}>
        <View style={styles.headerRow}>
          <View style={[styles.containerIcon, { backgroundColor: `${containerColor}14`, borderColor: `${containerColor}30` }]}>
            <Ionicons name="cube-outline" size={14} color={containerColor} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>Loadout Catalog</Text>
            <Text style={styles.headerLine}>{containerLabel}</Text>
          </View>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{QUICK_ADD_CATALOG.length} items</Text>
          </View>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={15} color={TACTICAL.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search quick-add items"
            placeholderTextColor={TACTICAL.textMuted}
            autoCorrect={false}
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            {totalResults} result{totalResults === 1 ? '' : 's'}
            {search ? ' matched' : ' available'}
            {addedCount > 0 ? ` · ${addedCount} added` : ''}
          </Text>
          {(search || activeGroup) ? (
            <TouchableOpacity
              onPress={() => {
                setSearch('');
                setActiveGroup(null);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.clearText}>Reset</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.chipWrap}>
        <ECSChip
          label="All"
          selected={!activeGroup}
          onPress={() => setActiveGroup(null)}
          compact
        />
        {QUICK_ADD_GROUPS.map((group) => (
          <ECSChip
            key={group.id}
            label={group.label}
            icon={group.icon as any}
            selected={activeGroup === group.id}
            onPress={() => setActiveGroup(activeGroup === group.id ? null : group.id)}
            compact
          />
        ))}
      </View>

      {groupedResults.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={28} color={TACTICAL.textMuted} />
          <Text style={styles.emptyTitle}>No Items Matched</Text>
          <Text style={styles.emptyBody}>Clear the search or switch groups to review more equipment.</Text>
        </View>
      ) : (
        <View style={styles.resultsWrap}>
          {groupedResults.map(({ group, items }) => (
            <View key={group.id} style={styles.groupSection}>
              <View style={styles.groupHeader}>
                <View style={[styles.groupIconWrap, { backgroundColor: `${group.color}14` }]}>
                  <Ionicons name={group.icon as any} size={13} color={group.color} />
                </View>
                <Text style={[styles.groupTitle, { color: group.color }]}>{group.label}</Text>
                <Text style={styles.groupCount}>{items.length}</Text>
              </View>

              {items.map((item) => {
                const isAdding = addingId === item.id;
                const added = addedIds.has(item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.itemRow, added && styles.itemRowAdded]}
                    onPress={() => handleAddItem(item)}
                    disabled={!!addingId}
                    activeOpacity={0.78}
                  >
                    <View style={styles.itemCopy}>
                      <View style={styles.itemTitleRow}>
                        <Text style={styles.itemTitle}>{item.displayName}</Text>
                        {item.isCritical ? (
                          <View style={styles.criticalBadge}>
                            <Text style={styles.criticalBadgeText}>Critical</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.itemMeta}>
                        {item.defaultWeightLbs < 1 ? item.defaultWeightLbs.toFixed(2) : item.defaultWeightLbs.toFixed(1)} lb
                        {' · '}
                        {item.weightSourceType === 'category_average'
                          ? 'Category Avg'
                          : item.weightSourceType === 'retailer_spec'
                            ? 'Retailer Spec'
                            : 'Manufacturer Spec'}
                      </Text>
                    </View>

                    <View style={styles.itemAction}>
                      {isAdding ? (
                        <ActivityIndicator size="small" color={containerColor} />
                      ) : added ? (
                        <View style={[styles.addBadge, { borderColor: `${containerColor}34`, backgroundColor: `${containerColor}14` }]}>
                          <Ionicons name="checkmark" size={14} color={containerColor} />
                        </View>
                      ) : (
                        <View style={[styles.addBadge, { borderColor: `${containerColor}34` }]}>
                          <Ionicons name="add" size={16} color={containerColor} />
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </ECSModalShell>
  );
}

const styles = StyleSheet.create({
  modalBody: {
    flex: 1,
    minHeight: 0,
  },
  modalContent: {
    gap: 12,
  },
  headerBlock: {
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(10,14,18,0.86)',
    padding: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  containerIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  headerEyebrow: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.8,
    color: TACTICAL.textMuted,
  },
  headerLine: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    marginTop: 3,
  },
  headerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  headerBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    color: TACTICAL.amber,
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
    backgroundColor: 'rgba(5,8,10,0.72)',
  },
  searchInput: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  metaText: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },
  clearText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 0.8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  resultsWrap: {
    gap: 12,
  },
  groupSection: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,138,44,0.12)',
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  groupIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: {
    flex: 1,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  groupCount: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,35,43,0.55)',
  },
  itemRowAdded: {
    backgroundColor: 'rgba(196,138,44,0.04)',
  },
  itemCopy: {
    flex: 1,
    minWidth: 0,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  itemTitle: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  itemMeta: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    marginTop: 3,
  },
  criticalBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: `${TACTICAL.danger}14`,
  },
  criticalBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.danger,
    letterSpacing: 0.5,
  },
  itemAction: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBadge: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  emptyState: {
    minHeight: 220,
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

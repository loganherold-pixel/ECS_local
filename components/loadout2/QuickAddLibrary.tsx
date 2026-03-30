/**
 * QuickAddLibrary — Pre-built Item Template Library
 *
 * Categorized list of common overland/expedition items with pre-filled weights.
 * Opens from ContainerDetailSheet via "Quick Add" button.
 * Tapping an item instantly adds it to the current container.
 *
 * Categories:
 *   Recovery, Kitchen, Shelter, Water, Tools, Power, Safety, Navigation
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';

// ═══════════════════════════════════════════════════════════════
// TEMPLATE DATA
// ═══════════════════════════════════════════════════════════════

export interface TemplateItem {
  id: string;
  name: string;
  weight_lbs: number;
  is_critical: boolean;
  category: string;
}

export interface TemplateCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
  items: TemplateItem[];
}

const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    id: 'recovery',
    label: 'Recovery',
    icon: 'construct-outline',
    color: '#E07C4F',
    items: [
      { id: 'r1', name: 'Traction Boards (pair)', weight_lbs: 26.0, is_critical: true, category: 'Recovery' },
      { id: 'r2', name: 'Soft Shackles (pair)', weight_lbs: 0.5, is_critical: true, category: 'Recovery' },
      { id: 'r3', name: 'Winch Line (synthetic)', weight_lbs: 8.0, is_critical: false, category: 'Recovery' },
      { id: 'r4', name: 'Recovery Strap 30ft', weight_lbs: 9.5, is_critical: true, category: 'Recovery' },
      { id: 'r5', name: 'Tree Saver Strap', weight_lbs: 3.5, is_critical: false, category: 'Recovery' },
      { id: 'r6', name: 'Snatch Block', weight_lbs: 7.0, is_critical: false, category: 'Recovery' },
      { id: 'r7', name: 'Recovery Gloves', weight_lbs: 0.6, is_critical: false, category: 'Recovery' },
      { id: 'r8', name: 'D-Ring Shackle 3/4"', weight_lbs: 2.2, is_critical: false, category: 'Recovery' },
      { id: 'r9', name: 'Hi-Lift Jack', weight_lbs: 28.0, is_critical: false, category: 'Recovery' },
      { id: 'r10', name: 'Kinetic Recovery Rope', weight_lbs: 12.0, is_critical: false, category: 'Recovery' },
    ],
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    icon: 'flame-outline',
    color: '#D4A017',
    items: [
      { id: 'k1', name: 'Camp Stove (dual burner)', weight_lbs: 12.0, is_critical: false, category: 'Kitchen' },
      { id: 'k2', name: 'Cookset (pot + pan)', weight_lbs: 4.5, is_critical: false, category: 'Kitchen' },
      { id: 'k3', name: 'Utensil Set', weight_lbs: 0.8, is_critical: false, category: 'Kitchen' },
      { id: 'k4', name: 'Plates & Bowls (set of 2)', weight_lbs: 1.2, is_critical: false, category: 'Kitchen' },
      { id: 'k5', name: 'Cutting Board', weight_lbs: 1.0, is_critical: false, category: 'Kitchen' },
      { id: 'k6', name: 'Cooler (hard-sided 45qt)', weight_lbs: 23.0, is_critical: false, category: 'Kitchen' },
      { id: 'k7', name: 'Spice Kit', weight_lbs: 1.5, is_critical: false, category: 'Kitchen' },
      { id: 'k8', name: 'Percolator / Coffee Maker', weight_lbs: 2.0, is_critical: false, category: 'Kitchen' },
      { id: 'k9', name: 'Propane Canister (1 lb)', weight_lbs: 1.8, is_critical: false, category: 'Kitchen' },
      { id: 'k10', name: 'Camp Table (folding)', weight_lbs: 11.0, is_critical: false, category: 'Kitchen' },
      { id: 'k11', name: 'Dish Soap & Sponge', weight_lbs: 0.5, is_critical: false, category: 'Kitchen' },
      { id: 'k12', name: 'Mugs (set of 2)', weight_lbs: 0.8, is_critical: false, category: 'Kitchen' },
    ],
  },
  {
    id: 'shelter',
    label: 'Shelter',
    icon: 'bed-outline',
    color: '#7B68EE',
    items: [
      { id: 's1', name: 'Sleeping Bag (0°F)', weight_lbs: 4.0, is_critical: true, category: 'Shelter' },
      { id: 's2', name: 'Sleeping Pad (inflatable)', weight_lbs: 1.8, is_critical: true, category: 'Shelter' },
      { id: 's3', name: 'Camp Pillow', weight_lbs: 0.6, is_critical: false, category: 'Shelter' },
      { id: 's4', name: 'Ground Tent (2P)', weight_lbs: 5.5, is_critical: false, category: 'Shelter' },
      { id: 's5', name: 'Tarp (10x10)', weight_lbs: 3.0, is_critical: false, category: 'Shelter' },
      { id: 's6', name: 'Camp Chair (compact)', weight_lbs: 5.0, is_critical: false, category: 'Shelter' },
      { id: 's7', name: 'Headlamp', weight_lbs: 0.3, is_critical: true, category: 'Shelter' },
      { id: 's8', name: 'Camp Lantern', weight_lbs: 1.2, is_critical: false, category: 'Shelter' },
      { id: 's9', name: 'Sleeping Bag Liner', weight_lbs: 0.7, is_critical: false, category: 'Shelter' },
      { id: 's10', name: 'Hammock w/ Straps', weight_lbs: 2.0, is_critical: false, category: 'Shelter' },
    ],
  },
  {
    id: 'water',
    label: 'Water',
    icon: 'water-outline',
    color: '#4FC3F7',
    items: [
      { id: 'w1', name: 'Water Filter (pump)', weight_lbs: 1.2, is_critical: true, category: 'Water' },
      { id: 'w2', name: 'Water Bottle (32oz)', weight_lbs: 0.4, is_critical: false, category: 'Water' },
      { id: 'w3', name: 'Hydration Bladder (3L)', weight_lbs: 0.5, is_critical: false, category: 'Water' },
      { id: 'w4', name: 'Collapsible Jug (5gal)', weight_lbs: 0.8, is_critical: false, category: 'Water' },
      { id: 'w5', name: 'Purification Tablets', weight_lbs: 0.1, is_critical: true, category: 'Water' },
      { id: 'w6', name: 'Gravity Filter System', weight_lbs: 1.0, is_critical: false, category: 'Water' },
      { id: 'w7', name: 'Stainless Bottle (40oz)', weight_lbs: 0.9, is_critical: false, category: 'Water' },
      { id: 'w8', name: 'Water Jug (rigid 7gal)', weight_lbs: 3.5, is_critical: false, category: 'Water' },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: 'hammer-outline',
    color: '#8B949E',
    items: [
      { id: 't1', name: 'Folding Shovel', weight_lbs: 5.5, is_critical: true, category: 'Tools' },
      { id: 't2', name: 'Axe / Hatchet', weight_lbs: 3.5, is_critical: false, category: 'Tools' },
      { id: 't3', name: 'Tire Repair Kit', weight_lbs: 2.0, is_critical: true, category: 'Tools' },
      { id: 't4', name: 'Air Compressor (12V)', weight_lbs: 8.0, is_critical: true, category: 'Tools' },
      { id: 't5', name: 'Multi-Tool', weight_lbs: 0.5, is_critical: false, category: 'Tools' },
      { id: 't6', name: 'Duct Tape Roll', weight_lbs: 0.7, is_critical: false, category: 'Tools' },
      { id: 't7', name: 'Ratchet Strap Set (4)', weight_lbs: 4.0, is_critical: false, category: 'Tools' },
      { id: 't8', name: 'Zip Ties (assorted)', weight_lbs: 0.3, is_critical: false, category: 'Tools' },
      { id: 't9', name: 'Socket Set (compact)', weight_lbs: 6.0, is_critical: false, category: 'Tools' },
      { id: 't10', name: 'Tire Pressure Gauge', weight_lbs: 0.2, is_critical: false, category: 'Tools' },
    ],
  },
  {
    id: 'power',
    label: 'Power',
    icon: 'battery-charging-outline',
    color: '#50C878',
    items: [
      { id: 'p1', name: 'Portable Power Station', weight_lbs: 22.0, is_critical: false, category: 'Power' },
      { id: 'p2', name: 'Solar Panel (100W)', weight_lbs: 12.0, is_critical: false, category: 'Power' },
      { id: 'p3', name: 'USB Power Bank (20000mAh)', weight_lbs: 1.0, is_critical: false, category: 'Power' },
      { id: 'p4', name: 'Inverter (400W)', weight_lbs: 2.5, is_critical: false, category: 'Power' },
      { id: 'p5', name: 'USB Cables (assorted)', weight_lbs: 0.3, is_critical: false, category: 'Power' },
      { id: 'p6', name: 'Flashlight (tactical)', weight_lbs: 0.5, is_critical: true, category: 'Power' },
      { id: 'p7', name: 'Battery Jumper Pack', weight_lbs: 4.0, is_critical: true, category: 'Power' },
      { id: 'p8', name: 'Extension Cord (25ft)', weight_lbs: 3.0, is_critical: false, category: 'Power' },
    ],
  },
  {
    id: 'safety',
    label: 'Safety',
    icon: 'medkit-outline',
    color: '#E05050',
    items: [
      { id: 'sf1', name: 'First Aid Kit (comprehensive)', weight_lbs: 3.5, is_critical: true, category: 'Safety' },
      { id: 'sf2', name: 'Fire Extinguisher', weight_lbs: 5.0, is_critical: true, category: 'Safety' },
      { id: 'sf3', name: 'Emergency Blanket (2-pack)', weight_lbs: 0.3, is_critical: true, category: 'Safety' },
      { id: 'sf4', name: 'Signal Whistle', weight_lbs: 0.1, is_critical: false, category: 'Safety' },
      { id: 'sf5', name: 'Signal Mirror', weight_lbs: 0.2, is_critical: false, category: 'Safety' },
      { id: 'sf6', name: 'Road Flares (3-pack)', weight_lbs: 1.5, is_critical: false, category: 'Safety' },
      { id: 'sf7', name: 'Trauma Kit (IFAK)', weight_lbs: 1.8, is_critical: true, category: 'Safety' },
      { id: 'sf8', name: 'Bear Spray', weight_lbs: 1.2, is_critical: false, category: 'Safety' },
      { id: 'sf9', name: 'Sunscreen SPF 50', weight_lbs: 0.4, is_critical: false, category: 'Safety' },
      { id: 'sf10', name: 'Bug Spray', weight_lbs: 0.4, is_critical: false, category: 'Safety' },
    ],
  },
  {
    id: 'navigation',
    label: 'Navigation',
    icon: 'compass-outline',
    color: '#5AC8FA',
    items: [
      { id: 'n1', name: 'Paper Maps (regional)', weight_lbs: 0.5, is_critical: false, category: 'Navigation' },
      { id: 'n2', name: 'Compass (baseplate)', weight_lbs: 0.2, is_critical: false, category: 'Navigation' },
      { id: 'n3', name: 'Handheld GPS', weight_lbs: 0.6, is_critical: false, category: 'Navigation' },
      { id: 'n4', name: 'Satellite Communicator', weight_lbs: 0.4, is_critical: true, category: 'Navigation' },
      { id: 'n5', name: 'Binoculars (compact)', weight_lbs: 1.2, is_critical: false, category: 'Navigation' },
      { id: 'n6', name: 'CB / HAM Radio', weight_lbs: 2.5, is_critical: false, category: 'Navigation' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export interface QuickAddLibraryProps {
  visible: boolean;
  onClose: () => void;
  /** Called when user taps an item — should add it to the container */
  onAddItem: (item: { name: string; weight_lbs: number; is_critical: boolean }) => Promise<void>;
  /** Container accent color */
  containerColor: string;
  /** Container label for display */
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
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Reset state when modal opens
  React.useEffect(() => {
    if (visible) {
      setSearch('');
      setActiveCategory(null);
      setAddingId(null);
      setAddedIds(new Set());
    }
  }, [visible]);

  // Filter items based on search and active category
  const filteredCategories = useMemo(() => {
    const q = search.toLowerCase().trim();
    return TEMPLATE_CATEGORIES
      .filter(cat => !activeCategory || cat.id === activeCategory)
      .map(cat => ({
        ...cat,
        items: cat.items.filter(item =>
          !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
        ),
      }))
      .filter(cat => cat.items.length > 0);
  }, [search, activeCategory]);

  const totalFiltered = useMemo(
    () => filteredCategories.reduce((sum, cat) => sum + cat.items.length, 0),
    [filteredCategories]
  );

  const handleAddItem = useCallback(async (item: TemplateItem) => {
    if (addingId) return;
    setAddingId(item.id);
    try {
      await onAddItem({
        name: item.name,
        weight_lbs: item.weight_lbs,
        is_critical: item.is_critical,
      });
      setAddedIds(prev => new Set(prev).add(item.id));
    } catch (e) {
      console.error('[QuickAdd] Error adding item:', e);
    }
    setAddingId(null);
  }, [addingId, onAddItem]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* ── Header ──────────────────────────────────────── */}
          <View style={[styles.header, { borderBottomColor: `${containerColor}30` }]}>
            <View style={styles.headerTop}>
              <View style={styles.headerLeft}>
                <View style={[styles.headerIcon, { backgroundColor: `${containerColor}18` }]}>
                  <Ionicons name="library-outline" size={16} color={containerColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.headerTitle}>QUICK ADD</Text>
                  <Text style={[styles.headerSub, { color: containerColor }]}>
                    {containerLabel}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>

            {/* ── Search Bar ──────────────────────────────────── */}
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={15} color={TACTICAL.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search items..."
                placeholderTextColor={TACTICAL.textMuted}
                autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* ── Category Filter Chips ───────────────────────── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipContent}
            >
              <TouchableOpacity
                style={[
                  styles.chip,
                  !activeCategory && styles.chipActive,
                ]}
                onPress={() => setActiveCategory(null)}
              >
                <Text style={[
                  styles.chipText,
                  !activeCategory && styles.chipTextActive,
                ]}>ALL</Text>
              </TouchableOpacity>
              {TEMPLATE_CATEGORIES.map(cat => {
                const active = activeCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.chip,
                      active && { borderColor: cat.color, backgroundColor: `${cat.color}15` },
                    ]}
                    onPress={() => setActiveCategory(active ? null : cat.id)}
                  >
                    <Ionicons name={cat.icon as any} size={11} color={active ? cat.color : TACTICAL.textMuted} />
                    <Text style={[
                      styles.chipText,
                      active && { color: cat.color },
                    ]}>{cat.label.toUpperCase()}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ── Item List ───────────────────────────────────── */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {filteredCategories.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={32} color={TACTICAL.textMuted} />
                <Text style={styles.emptyTitle}>NO ITEMS FOUND</Text>
                <Text style={styles.emptySubtext}>
                  Try a different search term or clear the filter.
                </Text>
              </View>
            ) : (
              filteredCategories.map(cat => (
                <View key={cat.id} style={styles.categorySection}>
                  {/* Category Header */}
                  <View style={styles.catHeader}>
                    <View style={[styles.catIconWrap, { backgroundColor: `${cat.color}12` }]}>
                      <Ionicons name={cat.icon as any} size={13} color={cat.color} />
                    </View>
                    <Text style={[styles.catLabel, { color: cat.color }]}>{cat.label.toUpperCase()}</Text>
                    <View style={[styles.catCountBadge, { backgroundColor: `${cat.color}12` }]}>
                      <Text style={[styles.catCountText, { color: cat.color }]}>{cat.items.length}</Text>
                    </View>
                  </View>

                  {/* Items */}
                  {cat.items.map((item, idx) => {
                    const isAdding = addingId === item.id;
                    const wasAdded = addedIds.has(item.id);

                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.itemRow,
                          wasAdded && styles.itemRowAdded,
                          idx === cat.items.length - 1 && { borderBottomWidth: 0 },
                        ]}
                        onPress={() => handleAddItem(item)}
                        disabled={isAdding}
                        activeOpacity={0.7}
                      >
                        <View style={styles.itemInfo}>
                          <View style={styles.itemNameRow}>
                            <Text style={[styles.itemName, wasAdded && { color: TACTICAL.textMuted }]}>
                              {item.name}
                            </Text>
                            {item.is_critical && (
                              <View style={styles.criticalBadge}>
                                <Ionicons name="alert-circle" size={8} color={TACTICAL.danger} />
                                <Text style={styles.criticalText}>CRITICAL</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.itemWeight}>
                            {item.weight_lbs < 1
                              ? `${item.weight_lbs.toFixed(1)} lb`
                              : `${item.weight_lbs} lb`}
                          </Text>
                        </View>

                        {/* Add Button / Status */}
                        <View style={styles.itemAction}>
                          {isAdding ? (
                            <ActivityIndicator size="small" color={containerColor} />
                          ) : wasAdded ? (
                            <View style={[styles.addedBadge, { borderColor: `${containerColor}40` }]}>
                              <Ionicons name="checkmark" size={14} color={containerColor} />
                            </View>
                          ) : (
                            <View style={[styles.addBtnSmall, { borderColor: `${containerColor}40` }]}>
                              <Ionicons name="add" size={16} color={containerColor} />
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))
            )}

            {/* Results count */}
            {filteredCategories.length > 0 && (
              <View style={styles.resultCount}>
                <Text style={styles.resultCountText}>
                  {totalFiltered} ITEM{totalFiltered !== 1 ? 'S' : ''} AVAILABLE
                  {addedIds.size > 0 ? ` \u2022 ${addedIds.size} ADDED` : ''}
                </Text>
              </View>
            )}

            <View style={{ height: 30 }} />
          </ScrollView>

          {/* ── Footer ──────────────────────────────────────── */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.8}>
              <Ionicons name="checkmark-circle-outline" size={16} color={TACTICAL.text} />
              <Text style={styles.doneBtnText}>
                {addedIds.size > 0 ? `DONE (${addedIds.size} ADDED)` : 'CLOSE'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: TACTICAL.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '92%',
    minHeight: '60%',
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
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 2,
  },
  headerSub: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 2,
  },

  // ── Search Bar ────────────────────────────────────────────
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: TACTICAL.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.text,
    paddingVertical: 0,
  },

  // ── Category Chips ────────────────────────────────────────
  chipScroll: {
    marginTop: 10,
    marginBottom: 2,
  },
  chipContent: {
    gap: 6,
    paddingRight: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.bg,
  },
  chipActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(212,160,23,0.12)',
  },
  chipText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  chipTextActive: {
    color: TACTICAL.amber,
  },

  // ── Body ──────────────────────────────────────────────────
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 12,
  },

  // ── Category Section ──────────────────────────────────────
  categorySection: {
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
    overflow: 'hidden',
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  catIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    flex: 1,
  },
  catCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  catCountText: {
    fontSize: 9,
    fontWeight: '900',
  },

  // ── Item Row ──────────────────────────────────────────────
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,35,43,0.6)',
  },
  itemRowAdded: {
    backgroundColor: 'rgba(212,160,23,0.04)',
  },
  itemInfo: {
    flex: 1,
    marginRight: 10,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  itemWeight: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    marginTop: 2,
  },
  criticalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: `rgba(192,57,43,0.1)`,
    borderRadius: 3,
  },
  criticalText: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.danger,
    letterSpacing: 0.5,
  },

  // ── Item Action ───────────────────────────────────────────
  itemAction: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnSmall: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  addedBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,160,23,0.08)',
  },

  // ── Empty State ───────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    gap: 10,
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
  },

  // ── Result Count ──────────────────────────────────────────
  resultCount: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  resultCountText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },

  // ── Footer ────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: TACTICAL.accent,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  doneBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 2,
  },
});




// ============================================================
// MISSION LOADOUT OPS — Item tracking during active mission
// ============================================================
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { ExpeditionItem, ExpeditionItemStatus } from '../../lib/missionTypes';
import { missionItemStore, missionEventStore } from '../../lib/missionStore';

const STATUS_META: Record<ExpeditionItemStatus, { label: string; color: string; icon: string }> = {
  missing: { label: 'MISSING', color: '#E53935', icon: 'alert-circle-outline' },
  packed: { label: 'PACKED', color: '#4CAF50', icon: 'checkmark-circle-outline' },
  deployed: { label: 'DEPLOYED', color: '#4FC3F7', icon: 'arrow-forward-circle-outline' },
  consumed: { label: 'CONSUMED', color: TACTICAL.amber, icon: 'flame-outline' },
  lost: { label: 'LOST', color: '#E53935', icon: 'close-circle-outline' },
};

const CATEGORY_COLORS: Record<string, string> = {
  water: '#4FC3F7',
  food: '#FFB74D',
  power: '#FFD54F',
  shelter: '#CE93D8',
  tools: '#90A4AE',
  medical: '#EF5350',
  navigation: '#66BB6A',
  communication: '#42A5F5',
  general: '#8A8A85',
};

interface Props {
  expeditionId: string;
  onRefresh: () => void;
}

export default function MissionLoadoutOps({ expeditionId, onRefresh }: Props) {
  const [items, setItems] = useState<ExpeditionItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'critical' | ExpeditionItemStatus>('all');
  const [search, setSearch] = useState('');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  useEffect(() => {
    refreshItems();
  }, [expeditionId]);

  const refreshItems = () => {
    const data = missionItemStore.getByExpeditionId(expeditionId);
    setItems(data);
  };

  const filtered = useMemo(() => {
    let result = items;
    if (filter === 'critical') result = result.filter(i => i.critical);
    else if (filter !== 'all') result = result.filter(i => i.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i => i.name.toLowerCase().includes(q));
    }
    return result.sort((a, b) => {
      if (a.critical && !b.critical) return -1;
      if (!a.critical && b.critical) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [items, filter, search]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length, critical: 0 };
    for (const item of items) {
      counts[item.status] = (counts[item.status] || 0) + 1;
      if (item.critical) counts.critical++;
    }
    return counts;
  }, [items]);

  const handleUseItem = (item: ExpeditionItem) => {
    missionItemStore.useItem(item.id, 1);
    missionEventStore.append(expeditionId, 'ITEM_USED', { itemId: item.id, name: item.name, qty: 1 });
    refreshItems();
    onRefresh();
  };

  const handleMarkStatus = (item: ExpeditionItem, status: ExpeditionItemStatus) => {
    missionItemStore.updateStatus(item.id, status);
    const eventType = status === 'consumed' ? 'ITEM_CONSUMED' : status === 'lost' ? 'ITEM_LOST' : status === 'deployed' ? 'ITEM_DEPLOYED' : 'STATUS_CHANGED';
    missionEventStore.append(expeditionId, eventType as any, { itemId: item.id, name: item.name, status });
    refreshItems();
    onRefresh();
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={TACTICAL.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search items..."
          placeholderTextColor={TACTICAL.textMuted}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        <View style={styles.filterRow}>
          {[
            { key: 'all', label: 'ALL' },
            { key: 'critical', label: 'CRITICAL' },
            { key: 'packed', label: 'PACKED' },
            { key: 'deployed', label: 'DEPLOYED' },
            { key: 'consumed', label: 'CONSUMED' },
            { key: 'missing', label: 'MISSING' },
          ].map(f => {
            const isActive = filter === f.key;
            const count = statusCounts[f.key] || 0;
            const meta = f.key !== 'all' && f.key !== 'critical' ? STATUS_META[f.key as ExpeditionItemStatus] : null;
            const color = f.key === 'critical' ? '#E53935' : meta?.color || TACTICAL.text;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, isActive && { borderColor: color, backgroundColor: `${color}12` }]}
                onPress={() => setFilter(f.key as any)}
              >
                <Text style={[styles.filterChipText, isActive && { color }]}>{f.label}</Text>
                <Text style={[styles.filterCount, isActive && { color }]}>{count}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Items */}
      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cube-outline" size={36} color={TACTICAL.textMuted} />
          <Text style={styles.emptyTitle}>NO ITEMS MATCH</Text>
          <Text style={styles.emptySub}>Try a different filter or search term</Text>
        </View>
      ) : (
        filtered.map(item => {
          const meta = STATUS_META[item.status];
          const catColor = CATEGORY_COLORS[item.categoryKey] || CATEGORY_COLORS.general;
          const isExpanded = expandedItem === item.id;
          const usagePercent = item.qtyPlanned > 0 ? Math.round((item.qtyUsed / item.qtyPlanned) * 100) : 0;

          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.itemCard, item.critical && styles.itemCardCritical]}
              onPress={() => setExpandedItem(isExpanded ? null : item.id)}
              activeOpacity={0.8}
            >
              <View style={styles.itemRow}>
                <View style={[styles.catStrip, { backgroundColor: catColor }]} />
                <View style={styles.itemMain}>
                  <View style={styles.itemTopRow}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    {item.critical && (
                      <View style={styles.criticalBadge}>
                        <Ionicons name="alert-circle" size={10} color="#E53935" />
                        <Text style={styles.criticalBadgeText}>CRITICAL</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.itemBottomRow}>
                    <View style={[styles.statusChip, { borderColor: `${meta.color}50` }]}>
                      <Ionicons name={meta.icon as any} size={10} color={meta.color} />
                      <Text style={[styles.statusChipText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Text style={styles.qtyText}>
                      {item.qtyUsed}/{item.qtyPlanned} used
                    </Text>
                    {item.zoneId && (
                      <Text style={styles.zoneText}>{item.zoneId}</Text>
                    )}
                  </View>
                  {/* Usage bar */}
                  {item.qtyPlanned > 0 && (
                    <View style={styles.usageTrack}>
                      <View style={[styles.usageFill, { width: `${usagePercent}%`, backgroundColor: meta.color }]} />
                    </View>
                  )}
                </View>
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={TACTICAL.textMuted} />
              </View>

              {/* Expanded Actions */}
              {isExpanded && (
                <View style={styles.expandedActions}>
                  {item.status === 'packed' && (
                    <>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => handleUseItem(item)}>
                        <Ionicons name="swap-horizontal-outline" size={14} color={TACTICAL.amber} />
                        <Text style={[styles.actionBtnText, { color: TACTICAL.amber }]}>USE 1</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => handleMarkStatus(item, 'deployed')}>
                        <Ionicons name="arrow-forward-circle-outline" size={14} color="#4FC3F7" />
                        <Text style={[styles.actionBtnText, { color: '#4FC3F7' }]}>DEPLOY</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {item.status === 'deployed' && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleUseItem(item)}>
                      <Ionicons name="swap-horizontal-outline" size={14} color={TACTICAL.amber} />
                      <Text style={[styles.actionBtnText, { color: TACTICAL.amber }]}>USE 1</Text>
                    </TouchableOpacity>
                  )}
                  {(item.status === 'packed' || item.status === 'deployed') && (
                    <>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => handleMarkStatus(item, 'consumed')}>
                        <Ionicons name="flame-outline" size={14} color={TACTICAL.amber} />
                        <Text style={[styles.actionBtnText, { color: TACTICAL.amber }]}>CONSUMED</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => handleMarkStatus(item, 'lost')}>
                        <Ionicons name="close-circle-outline" size={14} color="#E53935" />
                        <Text style={[styles.actionBtnText, { color: '#E53935' }]}>LOST</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {item.status === 'missing' && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleMarkStatus(item, 'packed')}>
                      <Ionicons name="checkmark-circle-outline" size={14} color="#4CAF50" />
                      <Text style={[styles.actionBtnText, { color: '#4CAF50' }]}>MARK PACKED</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: TACTICAL.panel, borderRadius: 10,
    borderWidth: 1, borderColor: TACTICAL.border,
    paddingHorizontal: 12, marginVertical: 12,
  },
  searchInput: { flex: 1, paddingVertical: 10, color: TACTICAL.text, fontSize: 14 },
  filterScroll: { marginBottom: 12, maxHeight: 38 },
  filterRow: { flexDirection: 'row', gap: 6 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: TACTICAL.panel,
  },
  filterChipText: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  filterCount: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, fontFamily: 'Courier' },

  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  emptyTitle: { fontSize: 13, fontWeight: '900', color: TACTICAL.text, letterSpacing: 1.5 },
  emptySub: { fontSize: 12, color: TACTICAL.textMuted },

  itemCard: {
    backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 12,
    borderWidth: 1, borderColor: TACTICAL.border, marginBottom: 8, overflow: 'hidden',
  },
  itemCardCritical: { borderColor: 'rgba(229,57,53,0.3)' },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  catStrip: { width: 3, height: 40, borderRadius: 2 },
  itemMain: { flex: 1, gap: 4 },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { flex: 1, fontSize: 13, fontWeight: '800', color: TACTICAL.text },
  criticalBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: 'rgba(229,57,53,0.1)',
  },
  criticalBadgeText: { fontSize: 7, fontWeight: '900', color: '#E53935', letterSpacing: 1 },
  itemBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    borderWidth: 1,
  },
  statusChipText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  qtyText: { fontSize: 10, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  zoneText: { fontSize: 9, color: TACTICAL.textMuted, fontStyle: 'italic' },
  usageTrack: { height: 2, backgroundColor: 'rgba(138,138,133,0.12)', borderRadius: 1, marginTop: 4 },
  usageFill: { height: 2, borderRadius: 1 },

  expandedActions: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4,
    borderTopWidth: 1, borderTopColor: TACTICAL.border,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: 'rgba(0,0,0,0.15)',
  },
  actionBtnText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
});




import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';

import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Platform, ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL } from '../lib/theme';
import { useApp } from '../context/AppContext';
import TopoBackground from '../components/TopoBackground';

import { checklistStore, expeditionStore } from '../lib/expeditionCommandStore';
import type { EcsChecklistItem, EcsChecklistPriority } from '../lib/expeditionTypes';
import { computeReadiness } from '../lib/expeditionTypes';

const PRIORITY_META: Record<EcsChecklistPriority, { label: string; color: string; weight: number }> = {
  critical: { label: 'CRITICAL', color: '#E53935', weight: 4 },
  high: { label: 'HIGH', color: '#FFB74D', weight: 2 },
  normal: { label: 'NORMAL', color: TACTICAL.textMuted, weight: 1 },
  low: { label: 'LOW', color: '#78909C', weight: 0.5 },
};

export default function ExpeditionChecklistScreen() {
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const router = useRouter();
  const { user } = useApp();
  const params = useLocalSearchParams<{ id?: string }>();
  const expeditionId = params.id || '';

  const [items, setItems] = useState<EcsChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<EcsChecklistPriority>('normal');
  const [newCategory, setNewCategory] = useState('general');
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!user || !expeditionId) return;
    if (mountedRef.current) setLoading(true);
    try {
      const data = await checklistStore.list(expeditionId, user.id);
      if (mountedRef.current) setItems(data);
    } catch (err) {
      console.warn('[ExpeditionChecklist] fetchItems error:', err);
    }
    if (mountedRef.current) setLoading(false);
  }, [user, expeditionId]);


  useFocusEffect(useCallback(() => { fetchItems(); }, [fetchItems]));

  const readiness = useMemo(() => computeReadiness(items), [items]);

  const categories = useMemo(() => {
    const cats = new Set(items.map(i => i.category || 'general'));
    return Array.from(cats).sort();
  }, [items]);

  const grouped = useMemo(() => {
    const filtered = filterCategory ? items.filter(i => (i.category || 'general') === filterCategory) : items;
    const groups: Record<string, EcsChecklistItem[]> = {};
    for (const item of filtered) {
      const cat = item.category || 'general';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    // Sort within each group: undone first, then by priority
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) => {
        if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
        return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
      });
    }
    return groups;
  }, [items, filterCategory]);

  const handleToggle = async (item: EcsChecklistItem) => {
    const newDone = !item.is_done;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_done: newDone, done_at: newDone ? new Date().toISOString() : null } : i));
    try {
      await checklistStore.toggleItem(item.id, newDone);
      if (!mountedRef.current) return;
      const updated = items.map(i => i.id === item.id ? { ...i, is_done: newDone } : i);
      const { score } = computeReadiness(updated);
      await expeditionStore.update(expeditionId, { readiness_score: score } as any);
    } catch (err) {
      console.warn('[ExpeditionChecklist] handleToggle error:', err);
    }
  };

  const handleAddItem = async () => {
    if (!user || !expeditionId || !newTitle.trim() || saving) return;
    setSaving(true);
    try {
      const item = await checklistStore.addItem(user.id, {
        expedition_id: expeditionId,
        title: newTitle.trim(),
        priority: newPriority,
        category: newCategory,
      });
      if (!mountedRef.current) return;
      if (item) {
        setItems(prev => [...prev, item]);
        const updated = [...items, item];
        const { score } = computeReadiness(updated);
        await expeditionStore.update(expeditionId, { readiness_score: score } as any);
      }
      if (!mountedRef.current) return;
      setNewTitle('');
      setAddModalVisible(false);
    } catch (err) {
      console.warn('[ExpeditionChecklist] handleAddItem error:', err);
    }
    if (mountedRef.current) setSaving(false);
  };

  const handleRemoveItem = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    try {
      await checklistStore.removeItem(id);
      if (!mountedRef.current) return;
      const updated = items.filter(i => i.id !== id);
      const { score } = computeReadiness(updated);
      await expeditionStore.update(expeditionId, { readiness_score: score } as any);
    } catch (err) {
      console.warn('[ExpeditionChecklist] handleRemoveItem error:', err);
    }
  };



  if (!user) return null;

  const readinessColor = readiness.score >= 80 ? '#4CAF50' : readiness.score >= 50 ? TACTICAL.amber : '#E53935';

  return (
    <TopoBackground>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={TACTICAL.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerBrand}>MISSION CHECKLIST</Text>
            <View style={styles.headerRow}>
              <Text style={[styles.readinessText, { color: readinessColor }]}>{readiness.score}% READY</Text>
              <Text style={styles.headerCount}>{items.filter(i => i.is_done).length}/{items.length}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setAddModalVisible(true)} activeOpacity={0.7}>
            <Ionicons name="add" size={20} color={TACTICAL.text} />
          </TouchableOpacity>
        </View>

        {/* Readiness Bar */}
        <View style={styles.readinessBar}>
          <View style={[styles.readinessFill, { width: `${Math.min(readiness.score, 100)}%`, backgroundColor: readinessColor }]} />
        </View>

        {/* Category Filters */}
        {categories.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <TouchableOpacity
              style={[styles.filterChip, !filterCategory && styles.filterChipActive]}
              onPress={() => setFilterCategory(null)}
            >
              <Text style={[styles.filterChipText, !filterCategory && styles.filterChipTextActive]}>ALL</Text>
            </TouchableOpacity>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.filterChip, filterCategory === cat && styles.filterChipActive]}
                onPress={() => setFilterCategory(filterCategory === cat ? null : cat)}
              >
                <Text style={[styles.filterChipText, filterCategory === cat && styles.filterChipTextActive]}>
                  {cat.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Checklist */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={TACTICAL.accent} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="checkbox-outline" size={48} color={TACTICAL.textMuted} />
            <Text style={styles.emptyTitle}>NO CHECKLIST ITEMS</Text>
            <Text style={styles.emptySub}>Add items manually or regenerate from templates.</Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {Object.entries(grouped).map(([category, catItems]) => (
              <View key={category} style={styles.categoryGroup}>
                <View style={styles.categoryHeader}>
                  <Text style={styles.categoryTitle}>{category.toUpperCase()}</Text>
                  <Text style={styles.categoryCount}>
                    {catItems.filter(i => i.is_done).length}/{catItems.length}
                  </Text>
                </View>
                {catItems.map(item => {
                  const pMeta = PRIORITY_META[item.priority] || PRIORITY_META.normal;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.checkItem, item.is_done && styles.checkItemDone]}
                      onPress={() => handleToggle(item)}
                      onLongPress={() => handleRemoveItem(item.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={item.is_done ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={item.is_done ? '#4CAF50' : pMeta.color}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.checkItemText, item.is_done && styles.checkItemTextDone]}>
                          {item.title}
                        </Text>
                      </View>
                      <View style={[styles.priorityBadge, { borderColor: pMeta.color }]}>
                        <Text style={[styles.priorityBadgeText, { color: pMeta.color }]}>{pMeta.label}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            <View style={{ height: 120 }} />
          </ScrollView>
        )}

        {/* Add Item Modal */}
        <Modal visible={addModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>ADD CHECKLIST ITEM</Text>
                <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                  <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>ITEM TITLE</Text>
              <TextInput
                style={styles.modalInput}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="e.g. Check tire pressure"
                placeholderTextColor={TACTICAL.textMuted}
                autoFocus
              />

              <Text style={styles.fieldLabel}>PRIORITY</Text>
              <View style={styles.priorityRow}>
                {(Object.entries(PRIORITY_META) as [EcsChecklistPriority, typeof PRIORITY_META['normal']][]).map(([p, meta]) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.priorityOption, newPriority === p && { borderColor: meta.color, backgroundColor: `${meta.color}15` }]}
                    onPress={() => setNewPriority(p)}
                  >
                    <Text style={[styles.priorityOptionText, newPriority === p && { color: meta.color }]}>{meta.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>CATEGORY</Text>
              <TextInput
                style={styles.modalInput}
                value={newCategory}
                onChangeText={setNewCategory}
                placeholder="e.g. recovery, medical, tools"
                placeholderTextColor={TACTICAL.textMuted}
              />

              <TouchableOpacity
                style={[styles.modalSaveBtn, (!newTitle.trim() || saving) && { opacity: 0.5 }]}
                onPress={handleAddItem}
                disabled={!newTitle.trim() || saving}
                activeOpacity={0.85}
              >
                {saving ? <ActivityIndicator size="small" color="#0B0F12" /> : <Ionicons name="add-circle-outline" size={16} color="#0B0F12" />}
                <Text style={styles.modalSaveBtnText}>{saving ? 'ADDING...' : 'ADD ITEM'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </TopoBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: Platform.OS === 'web' ? 16 : 54, paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: TACTICAL.border },
  headerBrand: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  readinessText: { fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  headerCount: { fontSize: 12, fontWeight: '700', color: TACTICAL.textMuted, fontFamily: 'Courier' },
  addBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: TACTICAL.accent },

  readinessBar: { height: 3, marginHorizontal: 16, borderRadius: 1.5, backgroundColor: 'rgba(138,138,133,0.15)', marginBottom: 12 },
  readinessFill: { height: 3, borderRadius: 1.5 },

  filterRow: { paddingHorizontal: 16, gap: 8, marginBottom: 10 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: TACTICAL.panel },
  filterChipActive: { borderColor: TACTICAL.accent, backgroundColor: 'rgba(62, 79, 60, 0.25)' },
  filterChipText: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  filterChipTextActive: { color: TACTICAL.text },

  listContent: { paddingHorizontal: 16 },
  categoryGroup: { marginBottom: 16 },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  categoryTitle: { fontSize: 11, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.5 },
  categoryCount: { fontSize: 11, fontWeight: '700', color: TACTICAL.textMuted, fontFamily: 'Courier' },

  checkItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.1)', borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.2)', marginBottom: 6,
  },
  checkItemDone: { opacity: 0.5 },
  checkItemText: { fontSize: 13, fontWeight: '700', color: TACTICAL.text },
  checkItemTextDone: { textDecorationLine: 'line-through', color: TACTICAL.textMuted },
  priorityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  priorityBadgeText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },

  emptyTitle: { fontSize: 14, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1 },
  emptySub: { fontSize: 12, color: TACTICAL.textMuted, textAlign: 'center' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: TACTICAL.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'web' ? 20 : 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 14, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.5 },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 2, marginBottom: 6, marginTop: 8 },
  modalInput: {
    backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: TACTICAL.border,
    borderRadius: 12, padding: 14, color: TACTICAL.text, fontSize: 14, marginBottom: 8,
  },
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  priorityOption: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: TACTICAL.border },
  priorityOptionText: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  modalSaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12, backgroundColor: TACTICAL.amber, marginTop: 8,
  },
  modalSaveBtnText: { fontSize: 12, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.2 },
});





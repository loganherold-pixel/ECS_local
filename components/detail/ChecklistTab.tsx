import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import type { TripChecklist, TripChecklistItem } from '../../lib/types';

interface Props {
  expeditionId: string;
  userId: string;
}

export default function ChecklistTab({ expeditionId, userId }: Props) {
  const [checklists, setChecklists] = useState<TripChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewChecklist, setShowNewChecklist] = useState(false);
  const [newChecklistName, setNewChecklistName] = useState('');
  const [saving, setSaving] = useState(false);
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null);
  const [newItemLabel, setNewItemLabel] = useState('');

  // Mounted ref to prevent setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchChecklists = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }
    try {
      const { data: lists, error: err } = await supabase
        .from('trip_checklists')
        .select('*')
        .eq('expedition_id', expeditionId)
        .order('created_at');
      if (!mountedRef.current) return;
      if (err) throw err;

      // Fetch items for each checklist
      const listsWithItems: TripChecklist[] = [];
      for (const list of (lists || [])) {
        const { data: items } = await supabase
          .from('trip_checklist_items')
          .select('*')
          .eq('checklist_id', list.id)
          .order('sort_order');
        if (!mountedRef.current) return;
        listsWithItems.push({ ...list, items: items || [] });
      }
      setChecklists(listsWithItems);
    } catch (ex: any) {
      console.warn('[ChecklistTab] fetchChecklists exception:', ex?.message || ex);
      if (mountedRef.current) setError('FAILED TO LOAD CHECKLISTS');
    }
    if (mountedRef.current) setLoading(false);
  }, [expeditionId]);

  useEffect(() => { fetchChecklists(); }, [fetchChecklists]);

  const handleCreateChecklist = async () => {
    if (!newChecklistName.trim()) return;
    setSaving(true);
    try {
      const { error: err } = await supabase.from('trip_checklists').insert({
        expedition_id: expeditionId,
        owner_user_id: userId,
        name: newChecklistName.trim(),
      });
      if (!mountedRef.current) return;
      if (err) throw err;
      setNewChecklistName('');
      setShowNewChecklist(false);
      await fetchChecklists();
    } catch (ex: any) {
      console.warn('[ChecklistTab] handleCreateChecklist exception:', ex?.message || ex);
      if (mountedRef.current) setError('FAILED TO CREATE CHECKLIST');
    }
    if (mountedRef.current) setSaving(false);
  };

  const handleDeleteChecklist = async (id: string) => {
    const doDelete = async () => {
      try {
        await supabase.from('trip_checklist_items').delete().eq('checklist_id', id);
        if (!mountedRef.current) return;
        const { error: err } = await supabase.from('trip_checklists').delete().eq('id', id);
        if (!mountedRef.current) return;
        if (err) {
          console.warn('[ChecklistTab] handleDeleteChecklist error:', err.message);
          setError('FAILED TO DELETE CHECKLIST');
        } else {
          fetchChecklists();
        }
      } catch (ex: any) {
        console.warn('[ChecklistTab] handleDeleteChecklist exception:', ex?.message || ex);
        if (mountedRef.current) setError('FAILED TO DELETE CHECKLIST');
      }
    };
    if (Platform.OS === 'web') {
      if (confirm('Delete this checklist and all items?')) doDelete();
    } else {
      Alert.alert('Delete Checklist', 'All items will be removed.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleAddItem = async (checklistId: string) => {
    if (!newItemLabel.trim()) return;
    setSaving(true);
    try {
      const checklist = checklists.find(c => c.id === checklistId);
      const sortOrder = (checklist?.items?.length || 0);
      const { error: err } = await supabase.from('trip_checklist_items').insert({
        checklist_id: checklistId,
        owner_user_id: userId,
        label: newItemLabel.trim(),
        sort_order: sortOrder,
      });
      if (!mountedRef.current) return;
      if (err) throw err;
      setNewItemLabel('');
      setAddingItemTo(null);
      await fetchChecklists();
    } catch (ex: any) {
      console.warn('[ChecklistTab] handleAddItem exception:', ex?.message || ex);
      if (mountedRef.current) setError('FAILED TO ADD ITEM');
    }
    if (mountedRef.current) setSaving(false);
  };

  const handleToggleItem = async (item: TripChecklistItem) => {
    try {
      const { error: err } = await supabase
        .from('trip_checklist_items')
        .update({ is_done: !item.is_done })
        .eq('id', item.id);
      if (!mountedRef.current) return;
      if (err) {
        console.warn('[ChecklistTab] handleToggleItem error:', err.message);
        setError('FAILED TO UPDATE ITEM');
      } else {
        // Optimistic update
        setChecklists(prev => prev.map(cl => ({
          ...cl,
          items: cl.items?.map(it => it.id === item.id ? { ...it, is_done: !it.is_done } : it),
        })));
      }
    } catch (ex: any) {
      console.warn('[ChecklistTab] handleToggleItem exception:', ex?.message || ex);
      if (mountedRef.current) setError('FAILED TO UPDATE ITEM');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const { error: err } = await supabase.from('trip_checklist_items').delete().eq('id', itemId);
      if (!mountedRef.current) return;
      if (err) {
        console.warn('[ChecklistTab] handleDeleteItem error:', err.message);
        setError('FAILED TO DELETE ITEM');
      } else {
        setChecklists(prev => prev.map(cl => ({
          ...cl,
          items: cl.items?.filter(it => it.id !== itemId),
        })));
      }
    } catch (ex: any) {
      console.warn('[ChecklistTab] handleDeleteItem exception:', ex?.message || ex);
      if (mountedRef.current) setError('FAILED TO DELETE ITEM');
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={TACTICAL.accent} />
        <Text style={s.loadingText}>LOADING CHECKLISTS...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {error && (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={TACTICAL.danger} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}><Ionicons name="close" size={16} color={TACTICAL.danger} /></TouchableOpacity>
        </View>
      )}

      {/* Add checklist button */}
      {!showNewChecklist && (
        <TouchableOpacity style={s.addBtn} onPress={() => setShowNewChecklist(true)}>
          <Ionicons name="add-circle-outline" size={18} color={TACTICAL.text} />
          <Text style={s.addBtnText}>NEW CHECKLIST</Text>
        </TouchableOpacity>
      )}

      {/* New checklist form */}
      {showNewChecklist && (
        <View style={s.formCard}>
          <TextInput style={s.input} value={newChecklistName} onChangeText={setNewChecklistName} placeholder="Checklist Name *" placeholderTextColor={TACTICAL.textMuted} autoFocus />
          <View style={s.formActions}>
            <TouchableOpacity style={s.saveBtn} onPress={handleCreateChecklist} disabled={saving || !newChecklistName.trim()}>
              {saving ? <ActivityIndicator size="small" color={TACTICAL.text} /> : <Ionicons name="checkmark" size={18} color={TACTICAL.text} />}
              <Text style={s.saveBtnText}>CREATE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowNewChecklist(false); setNewChecklistName(''); }}>
              <Text style={s.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Checklists */}
      {checklists.length === 0 && !showNewChecklist ? (
        <View style={s.empty}>
          <Ionicons name="checkbox-outline" size={40} color={TACTICAL.textMuted} />
          <Text style={s.emptyTitle}>NO CHECKLISTS</Text>
          <Text style={s.emptySubtitle}>Create a checklist to track mission tasks</Text>
        </View>
      ) : (
        checklists.map(cl => {
          const items = cl.items || [];
          const doneCount = items.filter(i => i.is_done).length;
          const totalCount = items.length;
          const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

          return (
            <View key={cl.id} style={s.clCard}>
              {/* Checklist header */}
              <View style={s.clHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.clName}>{cl.name}</Text>
                  <Text style={s.clProgress}>{doneCount}/{totalCount} COMPLETE ({pct}%)</Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteChecklist(cl.id)} style={s.clDeleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={TACTICAL.danger} />
                </TouchableOpacity>
              </View>

              {/* Progress bar */}
              <View style={s.progressBar}>
                <View style={[s.progressFill, { width: `${pct}%` }]} />
              </View>

              {/* Items */}
              {items.map(item => (
                <TouchableOpacity key={item.id} style={s.itemRow} onPress={() => handleToggleItem(item)} activeOpacity={0.7}>
                  <View style={[s.checkbox, item.is_done && s.checkboxDone]}>
                    {item.is_done && <Ionicons name="checkmark" size={14} color={TACTICAL.text} />}
                  </View>
                  <Text style={[s.itemLabel, item.is_done && s.itemLabelDone]}>{item.label}</Text>
                  <TouchableOpacity onPress={() => handleDeleteItem(item.id)} style={s.itemDeleteBtn}>
                    <Ionicons name="close-circle-outline" size={16} color={TACTICAL.textMuted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}

              {/* Add item */}
              {addingItemTo === cl.id ? (
                <View style={s.addItemRow}>
                  <TextInput style={s.addItemInput} value={newItemLabel} onChangeText={setNewItemLabel} placeholder="Item label..." placeholderTextColor={TACTICAL.textMuted} autoFocus onSubmitEditing={() => handleAddItem(cl.id)} />
                  <TouchableOpacity onPress={() => handleAddItem(cl.id)} disabled={saving || !newItemLabel.trim()}>
                    <Ionicons name="checkmark-circle" size={24} color={newItemLabel.trim() ? TACTICAL.accent : TACTICAL.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setAddingItemTo(null); setNewItemLabel(''); }}>
                    <Ionicons name="close-circle" size={24} color={TACTICAL.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.addItemBtn} onPress={() => { setAddingItemTo(cl.id); setNewItemLabel(''); }}>
                  <Ionicons name="add" size={16} color={TACTICAL.textMuted} />
                  <Text style={s.addItemBtnText}>ADD ITEM</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: 0 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 12, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(192,57,43,0.15)', borderWidth: 1, borderColor: 'rgba(192,57,43,0.3)', borderRadius: 10, padding: 12, marginBottom: 14 },
  errorText: { fontSize: 12, fontWeight: '700', color: TACTICAL.danger, flex: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: TACTICAL.accent, borderRadius: TACTICAL.radius, padding: 14, marginBottom: 16 },
  addBtnText: { fontSize: 13, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1.5 },
  formCard: { backgroundColor: TACTICAL.panel, borderRadius: TACTICAL.radius, borderWidth: 1, borderColor: TACTICAL.amber, padding: 16, marginBottom: 16 },
  input: { backgroundColor: TACTICAL.bg, borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 10, padding: 12, color: TACTICAL.text, fontSize: 14, marginBottom: 10 },
  formActions: { flexDirection: 'row', gap: 10 },
  saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: TACTICAL.accent, borderRadius: 10, padding: 14 },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1 },
  cancelBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: TACTICAL.textMuted },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  emptySubtitle: { fontSize: 12, color: TACTICAL.textMuted },
  clCard: { backgroundColor: TACTICAL.panel, borderRadius: TACTICAL.radius, borderWidth: 1, borderColor: TACTICAL.border, padding: 14, marginBottom: 12 },
  clHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  clName: { fontSize: 15, fontWeight: '700', color: TACTICAL.text },
  clProgress: { fontSize: 10, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginTop: 2 },
  clDeleteBtn: { padding: 6 },
  progressBar: { height: 4, backgroundColor: TACTICAL.bg, borderRadius: 2, marginBottom: 12, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: TACTICAL.accent, borderRadius: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(62,79,60,0.15)' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: TACTICAL.border, alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: TACTICAL.accent, borderColor: TACTICAL.accent },
  itemLabel: { flex: 1, fontSize: 14, color: TACTICAL.text },
  itemLabelDone: { textDecorationLine: 'line-through', color: TACTICAL.textMuted },
  itemDeleteBtn: { padding: 4 },
  addItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 },
  addItemInput: { flex: 1, backgroundColor: TACTICAL.bg, borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 8, padding: 10, color: TACTICAL.text, fontSize: 13 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, paddingBottom: 4 },
  addItemBtnText: { fontSize: 12, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
});




import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import type { Loadout } from '../../lib/types';

// Legacy category type for expedition-level loadout attachment
type LegacyLoadoutCategory = 'general' | 'camping' | 'recovery' | 'cooking' | 'medical' | 'comms';
type LoadoutWithLegacyCategory = Loadout & { category?: LegacyLoadoutCategory | null };

const CATEGORIES: { value: LegacyLoadoutCategory; label: string; icon: string; color: string }[] = [
  { value: 'general', label: 'GENERAL', icon: 'cube-outline', color: '#5B8DEF' },
  { value: 'camping', label: 'CAMPING', icon: 'bonfire-outline', color: '#4CAF50' },
  { value: 'recovery', label: 'RECOVERY', icon: 'construct-outline', color: TACTICAL.amber },
  { value: 'cooking', label: 'COOKING', icon: 'flame-outline', color: '#E67E22' },
  { value: 'medical', label: 'MEDICAL', icon: 'medkit-outline', color: TACTICAL.danger },
  { value: 'comms', label: 'COMMS', icon: 'radio-outline', color: '#9B59B6' },
];


interface Props {
  expeditionId: string;
  userId: string;
  currentLoadoutId: string | null;
}

export default function LoadoutTab({ expeditionId, userId, currentLoadoutId }: Props) {
  const [loadouts, setLoadouts] = useState<Loadout[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [attachedId, setAttachedId] = useState<string | null>(currentLoadoutId);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<LegacyLoadoutCategory>('general');

  const [weight, setWeight] = useState('');
  const [itemCount, setItemCount] = useState('');

  const fetchLoadouts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('loadouts')
        .select('*')
        .eq('owner_user_id', userId)
        .order('name');
      if (err) throw err;
      setLoadouts(data || []);
    } catch { setError('FAILED TO LOAD LOADOUTS'); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchLoadouts(); }, [fetchLoadouts]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('loadouts').insert({
        owner_user_id: userId,
        name: name.trim(),
        description: description.trim() || null,
        category,
        total_weight_lbs: weight.trim() ? parseFloat(weight) : null,
        item_count: itemCount.trim() ? parseInt(itemCount) : 0,
      });
      if (err) throw err;
      setName(''); setDescription(''); setCategory('general'); setWeight(''); setItemCount('');
      setShowForm(false);
      await fetchLoadouts();
    } catch { setError('FAILED TO CREATE LOADOUT'); }
    setSaving(false);
  };

  const handleAttach = async (loadoutId: string | null) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: err } = await supabase
        .from('expeditions')
        .update({ loadout_id: loadoutId })
        .eq('id', expeditionId);
      if (err) throw err;
      setAttachedId(loadoutId);
      setSuccess(loadoutId ? 'LOADOUT ATTACHED' : 'LOADOUT DETACHED');
      setTimeout(() => setSuccess(null), 3000);
    } catch { setError('FAILED TO UPDATE'); }
    setSaving(false);
  };

  const handleDeleteLoadout = async (id: string) => {
    const doDelete = async () => {
      if (attachedId === id) {
        await supabase.from('expeditions').update({ loadout_id: null }).eq('id', expeditionId);
        setAttachedId(null);
      }
      const { error: err } = await supabase.from('loadouts').delete().eq('id', id);
      if (!err) fetchLoadouts();
    };
    if (Platform.OS === 'web') {
      if (confirm('Delete this loadout?')) doDelete();
    } else {
      Alert.alert('Delete Loadout', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };
  const getCatConfig = (c: any) => CATEGORIES.find(cat => cat.value === c) || CATEGORIES[0];


  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={TACTICAL.accent} />
        <Text style={s.loadingText}>LOADING LOADOUTS...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {success && (
        <View style={s.successBanner}>
          <Ionicons name="checkmark-circle" size={16} color={TACTICAL.successText} />
          <Text style={s.successText}>{success}</Text>
        </View>
      )}
      {error && (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={TACTICAL.danger} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {/* Currently attached */}
      {attachedId && (
        <View style={s.attachedBanner}>
          <Ionicons name="link-outline" size={16} color={TACTICAL.amber} />
          <Text style={s.attachedText}>
            ATTACHED: {loadouts.find(l => l.id === attachedId)?.name || 'Unknown'}
          </Text>
          <TouchableOpacity onPress={() => handleAttach(null)} style={s.detachBtn}>
            <Ionicons name="close-circle" size={18} color={TACTICAL.danger} />
          </TouchableOpacity>
        </View>
      )}

      {/* Create button */}
      {!showForm && (
        <TouchableOpacity style={s.addBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="add-circle-outline" size={18} color={TACTICAL.text} />
          <Text style={s.addBtnText}>CREATE LOADOUT</Text>
        </TouchableOpacity>
      )}

      {/* Create form */}
      {showForm && (
        <View style={s.formCard}>
          <Text style={s.formTitle}>NEW LOADOUT</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Loadout Name *" placeholderTextColor={TACTICAL.textMuted} />
          <TextInput style={[s.input, s.textArea]} value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor={TACTICAL.textMuted} multiline textAlignVertical="top" />

          <Text style={s.fieldLabel}>CATEGORY</Text>
          <View style={s.catRow}>
            {CATEGORIES.map(c => (
              <TouchableOpacity key={c.value} style={[s.catChip, category === c.value && { borderColor: c.color, backgroundColor: `${c.color}15` }]} onPress={() => setCategory(c.value)}>
                <Ionicons name={c.icon as any} size={14} color={category === c.value ? c.color : TACTICAL.textMuted} />
                <Text style={[s.catChipText, category === c.value && { color: c.color }]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.row}>
            <TextInput style={[s.input, { flex: 1 }]} value={weight} onChangeText={setWeight} placeholder="Total Weight (lbs)" placeholderTextColor={TACTICAL.textMuted} keyboardType="numeric" />
            <TextInput style={[s.input, { flex: 1 }]} value={itemCount} onChangeText={setItemCount} placeholder="Item Count" placeholderTextColor={TACTICAL.textMuted} keyboardType="numeric" />
          </View>

          <View style={s.formActions}>
            <TouchableOpacity style={s.saveBtn} onPress={handleCreate} disabled={saving || !name.trim()}>
              {saving ? <ActivityIndicator size="small" color={TACTICAL.text} /> : <Ionicons name="checkmark" size={18} color={TACTICAL.text} />}
              <Text style={s.saveBtnText}>{saving ? 'SAVING...' : 'CREATE'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowForm(false)}>
              <Text style={s.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Loadout list */}
      {loadouts.length === 0 && !showForm ? (
        <View style={s.empty}>
          <Ionicons name="cube-outline" size={40} color={TACTICAL.textMuted} />
          <Text style={s.emptyTitle}>NO LOADOUTS CREATED</Text>
          <Text style={s.emptySubtitle}>Create a loadout to attach to this expedition</Text>
        </View>
      ) : (
        loadouts.map(lo => {
          const cfg = getCatConfig((lo as LoadoutWithLegacyCategory).category ?? 'general');
          const isAttached = attachedId === lo.id;
          return (
            <View key={lo.id} style={[s.loCard, isAttached && s.loCardAttached]}>
              <View style={s.loHeader}>
                <View style={[s.loCatBadge, { borderColor: cfg.color }]}>
                  <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
                  <Text style={[s.loCatText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
                {isAttached && (
                  <View style={s.linkedBadge}>
                    <Ionicons name="link" size={12} color={TACTICAL.amber} />
                    <Text style={s.linkedText}>LINKED</Text>
                  </View>
                )}
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => handleDeleteLoadout(lo.id)} style={s.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={TACTICAL.danger} />
                </TouchableOpacity>
              </View>
              <Text style={s.loName}>{lo.name}</Text>
              {lo.description && <Text style={s.loDesc}>{lo.description}</Text>}
              <View style={s.loMeta}>
                {lo.total_weight_lbs != null && (
                  <View style={s.loMetaItem}>
                    <Ionicons name="barbell-outline" size={12} color={TACTICAL.textMuted} />
                    <Text style={s.loMetaText}>{lo.total_weight_lbs} lbs</Text>
                  </View>
                )}
                <View style={s.loMetaItem}>
                  <Ionicons name="layers-outline" size={12} color={TACTICAL.textMuted} />
                  <Text style={s.loMetaText}>{lo.item_count} items</Text>
                </View>
              </View>
              {!isAttached ? (
                <TouchableOpacity style={s.attachBtn} onPress={() => handleAttach(lo.id)} disabled={saving}>
                  <Ionicons name="link-outline" size={16} color={TACTICAL.text} />
                  <Text style={s.attachBtnText}>ATTACH TO EXPEDITION</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={s.detachFullBtn} onPress={() => handleAttach(null)} disabled={saving}>
                  <Ionicons name="close-circle-outline" size={16} color={TACTICAL.danger} />

                  <Text style={[s.attachBtnText, { color: TACTICAL.danger }]}>DETACH</Text>
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
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(62,107,62,0.15)', borderWidth: 1, borderColor: 'rgba(62,107,62,0.3)', borderRadius: 10, padding: 12, marginBottom: 14 },
  successText: { fontSize: 12, fontWeight: '700', color: TACTICAL.successText },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(192,57,43,0.15)', borderWidth: 1, borderColor: 'rgba(192,57,43,0.3)', borderRadius: 10, padding: 12, marginBottom: 14 },
  errorText: { fontSize: 12, fontWeight: '700', color: TACTICAL.danger },
  attachedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(196,138,44,0.1)', borderWidth: 1, borderColor: 'rgba(196,138,44,0.3)', borderRadius: 10, padding: 12, marginBottom: 14 },
  attachedText: { fontSize: 12, fontWeight: '700', color: TACTICAL.amber, flex: 1, letterSpacing: 0.5 },
  detachBtn: { padding: 4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: TACTICAL.accent, borderRadius: TACTICAL.radius, padding: 14, marginBottom: 16 },
  addBtnText: { fontSize: 13, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1.5 },
  formCard: { backgroundColor: TACTICAL.panel, borderRadius: TACTICAL.radius, borderWidth: 1, borderColor: TACTICAL.amber, padding: 16, marginBottom: 16 },
  formTitle: { fontSize: 11, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 2, marginBottom: 12 },
  input: { backgroundColor: TACTICAL.bg, borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 10, padding: 12, color: TACTICAL.text, fontSize: 14, marginBottom: 10 },
  textArea: { minHeight: 60, paddingTop: 12 },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5, marginBottom: 8 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: TACTICAL.bg },
  catChipText: { fontSize: 10, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.5 },
  row: { flexDirection: 'row', gap: 10 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: TACTICAL.accent, borderRadius: 10, padding: 14 },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1 },
  cancelBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: TACTICAL.textMuted },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  emptySubtitle: { fontSize: 12, color: TACTICAL.textMuted },
  loCard: { backgroundColor: TACTICAL.panel, borderRadius: TACTICAL.radius, borderWidth: 1, borderColor: TACTICAL.border, padding: 14, marginBottom: 10 },
  loCardAttached: { borderColor: TACTICAL.amber },
  loHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  loCatBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  loCatText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  linkedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(196,138,44,0.15)', borderWidth: 1, borderColor: 'rgba(196,138,44,0.3)' },
  linkedText: { fontSize: 9, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1 },
  deleteBtn: { padding: 6 },
  loName: { fontSize: 15, fontWeight: '700', color: TACTICAL.text, marginBottom: 4 },
  loDesc: { fontSize: 13, color: TACTICAL.textMuted, lineHeight: 18, marginBottom: 6 },
  loMeta: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  loMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  loMetaText: { fontSize: 11, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  attachBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: TACTICAL.accent, borderRadius: 8, padding: 10 },
  attachBtnText: { fontSize: 11, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1 },
  detachFullBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(192,57,43,0.1)', borderWidth: 1, borderColor: 'rgba(192,57,43,0.3)', borderRadius: 8, padding: 10 },
});




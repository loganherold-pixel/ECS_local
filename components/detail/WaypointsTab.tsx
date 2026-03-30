import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Platform, Switch,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import type { ExpeditionWaypoint, WaypointType } from '../../lib/types';

const WP_TYPES: { value: WaypointType; label: string; icon: string; color: string }[] = [
  { value: 'stop', label: 'STOP', icon: 'location-outline', color: '#5B8DEF' },
  { value: 'camp', label: 'CAMP', icon: 'bonfire-outline', color: '#4CAF50' },
  { value: 'resupply', label: 'RESUPPLY', icon: 'cart-outline', color: TACTICAL.amber },
  { value: 'water', label: 'WATER', icon: 'water-outline', color: '#29B6F6' },
  { value: 'fuel', label: 'FUEL', icon: 'flask-outline', color: '#FF9800' },
  { value: 'poi', label: 'POI', icon: 'star-outline', color: '#9B59B6' },
  { value: 'hazard', label: 'HAZARD', icon: 'warning-outline', color: TACTICAL.danger },
];

interface Props {
  expeditionId: string;
  userId: string;
}

export default function WaypointsTab({ expeditionId, userId }: Props) {
  const [waypoints, setWaypoints] = useState<ExpeditionWaypoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [elevation, setElevation] = useState('');
  const [wpType, setWpType] = useState<WaypointType>('stop');
  const [eta, setEta] = useState('');
  const [waterResupplyGal, setWaterResupplyGal] = useState('');
  const [isPrimaryResupply, setIsPrimaryResupply] = useState(true);

  const fetchWaypoints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('expedition_waypoints')
        .select('*')
        .eq('expedition_id', expeditionId)
        .order('order_index', { ascending: true });
      if (err) throw err;
      setWaypoints(data || []);
    } catch { setError('FAILED TO LOAD WAYPOINTS'); }
    setLoading(false);
  }, [expeditionId]);

  useEffect(() => { fetchWaypoints(); }, [fetchWaypoints]);

  const resetForm = () => {
    setName(''); setDescription(''); setLat(''); setLng('');
    setElevation(''); setWpType('stop'); setEta('');
    setWaterResupplyGal(''); setIsPrimaryResupply(true);
    setEditingId(null); setShowForm(false);
  };

  const startEdit = (wp: ExpeditionWaypoint) => {
    setName(wp.name);
    setDescription(wp.description || '');
    setLat(wp.latitude?.toString() || '');
    setLng(wp.longitude?.toString() || '');
    setElevation(wp.elevation_ft?.toString() || '');
    setWpType(wp.waypoint_type);
    setEta(wp.eta || '');
    setWaterResupplyGal(wp.water_resupply_gal?.toString() || '');
    setIsPrimaryResupply(wp.is_primary_resupply ?? true);
    setEditingId(wp.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        name: name.trim(),
        description: description.trim() || null,
        latitude: lat.trim() ? parseFloat(lat) : null,
        longitude: lng.trim() ? parseFloat(lng) : null,
        elevation_ft: elevation.trim() ? parseFloat(elevation) : null,
        waypoint_type: wpType,
        eta: eta.trim() || null,
        water_resupply_gal: wpType === 'water' && waterResupplyGal.trim()
          ? parseFloat(waterResupplyGal) : null,
        is_primary_resupply: wpType === 'water' ? isPrimaryResupply : true,
      };

      if (editingId) {
        const { error: err } = await supabase.from('expedition_waypoints').update(payload).eq('id', editingId);
        if (err) throw err;
      } else {
        payload.expedition_id = expeditionId;
        payload.owner_user_id = userId;
        payload.order_index = waypoints.length;
        const { error: err } = await supabase.from('expedition_waypoints').insert(payload);
        if (err) throw err;
      }
      resetForm();
      await fetchWaypoints();
    } catch { setError('SAVE FAILED'); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const doDelete = async () => {
      const { error: err } = await supabase.from('expedition_waypoints').delete().eq('id', id);
      if (!err) fetchWaypoints();
    };
    if (Platform.OS === 'web') {
      if (confirm('Delete this waypoint?')) doDelete();
    } else {
      Alert.alert('Delete Waypoint', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const moveWaypoint = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= waypoints.length) return;
    const a = waypoints[index];
    const b = waypoints[newIndex];
    await Promise.all([
      supabase.from('expedition_waypoints').update({ order_index: newIndex }).eq('id', a.id),
      supabase.from('expedition_waypoints').update({ order_index: index }).eq('id', b.id),
    ]);
    fetchWaypoints();
  };

  const getTypeConfig = (t: WaypointType) => WP_TYPES.find(w => w.value === t) || WP_TYPES[0];

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={TACTICAL.accent} />
        <Text style={s.loadingText}>LOADING WAYPOINTS...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {error && (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={TACTICAL.danger} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {/* Add button */}
      {!showForm && (
        <TouchableOpacity style={s.addBtn} onPress={() => { resetForm(); setShowForm(true); }}>
          <Ionicons name="add-circle-outline" size={18} color={TACTICAL.text} />
          <Text style={s.addBtnText}>ADD WAYPOINT</Text>
        </TouchableOpacity>
      )}

      {/* Form */}
      {showForm && (
        <View style={s.formCard}>
          <Text style={s.formTitle}>{editingId ? 'EDIT WAYPOINT' : 'NEW WAYPOINT'}</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Waypoint Name *" placeholderTextColor={TACTICAL.textMuted} />
          <TextInput style={[s.input, s.textArea]} value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor={TACTICAL.textMuted} multiline textAlignVertical="top" />

          {/* Type selector */}
          <Text style={s.fieldLabel}>TYPE</Text>
          <View style={s.typeRow}>
            {WP_TYPES.map(t => (
              <TouchableOpacity key={t.value} style={[s.typeChip, wpType === t.value && { borderColor: t.color, backgroundColor: `${t.color}15` }]} onPress={() => setWpType(t.value)}>
                <Ionicons name={t.icon as any} size={14} color={wpType === t.value ? t.color : TACTICAL.textMuted} />
                <Text style={[s.typeChipText, wpType === t.value && { color: t.color }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── WATER RESUPPLY FIELDS (shown only when type = 'water') ── */}
          {wpType === 'water' && (
            <View style={s.waterFieldsContainer}>
              <View style={s.waterFieldsHeader}>
                <Ionicons name="water-outline" size={14} color="#29B6F6" />
                <Text style={s.waterFieldsTitle}>WATER RESUPPLY DETAILS</Text>
              </View>

              <Text style={s.fieldLabel}>EXPECTED WATER RESUPPLY (GAL)</Text>
              <TextInput
                style={s.input}
                value={waterResupplyGal}
                onChangeText={setWaterResupplyGal}
                placeholder="e.g. 15"
                placeholderTextColor={TACTICAL.textMuted}
                keyboardType="numeric"
              />

              <View style={s.toggleRow}>
                <View style={s.toggleLeft}>
                  <Ionicons
                    name={isPrimaryResupply ? 'shield-checkmark-outline' : 'shield-outline'}
                    size={16}
                    color={isPrimaryResupply ? '#29B6F6' : TACTICAL.textMuted}
                  />
                  <View>
                    <Text style={[s.toggleLabel, isPrimaryResupply && { color: '#29B6F6' }]}>
                      PRIMARY WATER STOP
                    </Text>
                    <Text style={s.toggleSub}>
                      Used for next-resupply projection calculations
                    </Text>
                  </View>
                </View>
                <Switch
                  value={isPrimaryResupply}
                  onValueChange={setIsPrimaryResupply}
                  trackColor={{ false: TACTICAL.bg, true: 'rgba(41,182,246,0.3)' }}
                  thumbColor={isPrimaryResupply ? '#29B6F6' : TACTICAL.textMuted}
                />
              </View>
            </View>
          )}

          {/* Coordinates */}
          <View style={s.row}>
            <TextInput style={[s.input, { flex: 1 }]} value={lat} onChangeText={setLat} placeholder="Latitude" placeholderTextColor={TACTICAL.textMuted} keyboardType="numeric" />
            <TextInput style={[s.input, { flex: 1 }]} value={lng} onChangeText={setLng} placeholder="Longitude" placeholderTextColor={TACTICAL.textMuted} keyboardType="numeric" />
          </View>
          <View style={s.row}>
            <TextInput style={[s.input, { flex: 1 }]} value={elevation} onChangeText={setElevation} placeholder="Elevation (ft)" placeholderTextColor={TACTICAL.textMuted} keyboardType="numeric" />
            <TextInput style={[s.input, { flex: 1 }]} value={eta} onChangeText={setEta} placeholder="ETA (YYYY-MM-DD HH:MM)" placeholderTextColor={TACTICAL.textMuted} />
          </View>

          <View style={s.formActions}>
            <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving || !name.trim()}>
              {saving ? <ActivityIndicator size="small" color={TACTICAL.text} /> : <Ionicons name="checkmark" size={18} color={TACTICAL.text} />}
              <Text style={s.saveBtnText}>{saving ? 'SAVING...' : 'SAVE'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={resetForm}>
              <Text style={s.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Waypoint List */}
      {waypoints.length === 0 && !showForm ? (
        <View style={s.empty}>
          <Ionicons name="navigate-outline" size={40} color={TACTICAL.textMuted} />
          <Text style={s.emptyTitle}>NO WAYPOINTS PLOTTED</Text>
          <Text style={s.emptySubtitle}>Add waypoints to plan your route</Text>
        </View>
      ) : (
        waypoints.map((wp, idx) => {
          const cfg = getTypeConfig(wp.waypoint_type);
          const isWaterWp = wp.waypoint_type === 'water';
          return (
            <View key={wp.id} style={[s.wpCard, isWaterWp && s.wpCardWater]}>
              <View style={s.wpHeader}>
                <View style={s.wpOrderBadge}>
                  <Text style={s.wpOrderText}>{idx + 1}</Text>
                </View>
                <View style={[s.wpTypeBadge, { borderColor: cfg.color }]}>
                  <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
                  <Text style={[s.wpTypeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
                {/* Primary resupply badge for water waypoints */}
                {isWaterWp && wp.is_primary_resupply && (
                  <View style={s.primaryBadge}>
                    <Ionicons name="shield-checkmark" size={10} color="#29B6F6" />
                    <Text style={s.primaryBadgeText}>PRIMARY</Text>
                  </View>
                )}
                <View style={{ flex: 1 }} />
                <View style={s.wpActions}>
                  {idx > 0 && (
                    <TouchableOpacity onPress={() => moveWaypoint(idx, 'up')} style={s.wpActionBtn}>
                      <Ionicons name="chevron-up" size={16} color={TACTICAL.textMuted} />
                    </TouchableOpacity>
                  )}
                  {idx < waypoints.length - 1 && (
                    <TouchableOpacity onPress={() => moveWaypoint(idx, 'down')} style={s.wpActionBtn}>
                      <Ionicons name="chevron-down" size={16} color={TACTICAL.textMuted} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => startEdit(wp)} style={s.wpActionBtn}>
                    <Ionicons name="create-outline" size={16} color={TACTICAL.amber} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(wp.id)} style={s.wpActionBtn}>
                    <Ionicons name="trash-outline" size={16} color={TACTICAL.danger} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={s.wpName}>{wp.name}</Text>
              {wp.description && <Text style={s.wpDesc}>{wp.description}</Text>}

              {/* Water resupply info */}
              {isWaterWp && wp.water_resupply_gal != null && (
                <View style={s.waterInfoRow}>
                  <Ionicons name="water" size={13} color="#29B6F6" />
                  <Text style={s.waterInfoText}>
                    RESUPPLY: {wp.water_resupply_gal} GAL
                  </Text>
                </View>
              )}

              <View style={s.wpMeta}>
                {wp.latitude != null && wp.longitude != null && (
                  <View style={s.wpMetaItem}>
                    <Ionicons name="location-outline" size={12} color={TACTICAL.textMuted} />
                    <Text style={s.wpMetaText}>{wp.latitude.toFixed(4)}, {wp.longitude.toFixed(4)}</Text>
                  </View>
                )}
                {wp.elevation_ft != null && (
                  <View style={s.wpMetaItem}>
                    <Ionicons name="trending-up-outline" size={12} color={TACTICAL.textMuted} />
                    <Text style={s.wpMetaText}>{wp.elevation_ft} ft</Text>
                  </View>
                )}
                {wp.eta && (
                  <View style={s.wpMetaItem}>
                    <Ionicons name="time-outline" size={12} color={TACTICAL.textMuted} />
                    <Text style={s.wpMetaText}>{wp.eta}</Text>
                  </View>
                )}
              </View>
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
  errorText: { fontSize: 12, fontWeight: '700', color: TACTICAL.danger },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: TACTICAL.accent, borderRadius: TACTICAL.radius, padding: 14, marginBottom: 16 },
  addBtnText: { fontSize: 13, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1.5 },
  formCard: { backgroundColor: TACTICAL.panel, borderRadius: TACTICAL.radius, borderWidth: 1, borderColor: TACTICAL.amber, padding: 16, marginBottom: 16 },
  formTitle: { fontSize: 11, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 2, marginBottom: 12 },
  input: { backgroundColor: TACTICAL.bg, borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 10, padding: 12, color: TACTICAL.text, fontSize: 14, marginBottom: 10 },
  textArea: { minHeight: 60, paddingTop: 12 },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5, marginBottom: 8 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: TACTICAL.bg },
  typeChipText: { fontSize: 10, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.5 },
  row: { flexDirection: 'row', gap: 10 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: TACTICAL.accent, borderRadius: 10, padding: 14 },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1 },
  cancelBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: TACTICAL.textMuted },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  emptySubtitle: { fontSize: 12, color: TACTICAL.textMuted },
  wpCard: { backgroundColor: TACTICAL.panel, borderRadius: TACTICAL.radius, borderWidth: 1, borderColor: TACTICAL.border, padding: 14, marginBottom: 10 },
  wpCardWater: { borderColor: 'rgba(41,182,246,0.35)', borderLeftWidth: 3, borderLeftColor: '#29B6F6' },
  wpHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  wpOrderBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: TACTICAL.accent, alignItems: 'center', justifyContent: 'center' },
  wpOrderText: { fontSize: 12, fontWeight: '800', color: TACTICAL.text },
  wpTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  wpTypeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  primaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(41,182,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(41,182,246,0.3)',
  },
  primaryBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#29B6F6',
    letterSpacing: 1,
  },
  wpActions: { flexDirection: 'row', gap: 4 },
  wpActionBtn: { padding: 6 },
  wpName: { fontSize: 15, fontWeight: '700', color: TACTICAL.text, marginBottom: 4 },
  wpDesc: { fontSize: 13, color: TACTICAL.textMuted, lineHeight: 18, marginBottom: 6 },
  waterInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(41,182,246,0.08)',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(41,182,246,0.15)',
  },
  waterInfoText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#29B6F6',
    letterSpacing: 1,
    fontFamily: 'Courier',
  },
  wpMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  wpMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wpMetaText: { fontSize: 11, color: TACTICAL.textMuted, fontFamily: 'Courier' },

  // Water fields in form
  waterFieldsContainer: {
    backgroundColor: 'rgba(41,182,246,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(41,182,246,0.2)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  waterFieldsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  waterFieldsTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#29B6F6',
    letterSpacing: 1.5,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  toggleLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  toggleSub: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 2,
    lineHeight: 13,
  },
});




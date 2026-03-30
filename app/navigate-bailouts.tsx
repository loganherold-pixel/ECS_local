/**
 * Navigate Bailouts — Phase 2.6
 *
 * Manages bailout points (safe exits / fuel / hospitals / towns).
 * Supports:
 *   - List all bailout points (filter by type)
 *   - Add new bailout (manual lat/lng entry)
 *   - Edit notes/type/priority
 *   - Delete bailout
 *   - "Use for this Run" action (select multiple, attach to run)
 *   - Auto-suggest bailouts near a route
 *
 * Offline-first: all data stored locally.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../lib/theme';
import { useApp } from '../context/AppContext';
import {
  bailoutStore,
  BAILOUT_TYPES,
  getBailoutTypeMeta,
  type BailoutPoint,
  type BailoutType,
} from '../lib/bailoutStore';

import { runStore } from '../lib/runStore';
import { computeBounds } from '../lib/mapConfig';
import Toast from '../components/Toast';

const { width: SCREEN_W } = Dimensions.get('window');

export default function NavigateBailouts() {
  const router = useRouter();
  const { showToast } = useApp();
  const params = useLocalSearchParams<{ runId?: string }>();
  const runId = params.runId || '';
  const run = runId ? runStore.getById(runId) : null;

  const [bailouts, setBailouts] = useState<BailoutPoint[]>(() => bailoutStore.getAll());
  const [runBailoutIds, setRunBailoutIds] = useState<Set<string>>(() => {
    if (!runId) return new Set();
    return new Set(bailoutStore.getRunBailouts(runId).map(b => b.id));
  });
  const [filterType, setFilterType] = useState<BailoutType | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBailout, setEditingBailout] = useState<BailoutPoint | null>(null);

  // Add/Edit form state
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<BailoutType>('custom');
  const [formLat, setFormLat] = useState('');
  const [formLng, setFormLng] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPriority, setFormPriority] = useState('0');

  const filteredBailouts = useMemo(() => {
    if (filterType === 'all') return bailouts;
    return bailouts.filter(b => b.type === filterType);
  }, [bailouts, filterType]);

  const refreshBailouts = useCallback(() => {
    setBailouts(bailoutStore.getAll());
    if (runId) {
      setRunBailoutIds(new Set(bailoutStore.getRunBailouts(runId).map(b => b.id)));
    }
  }, [runId]);

  const handleAdd = useCallback(() => {
    setEditingBailout(null);
    setFormTitle('');
    setFormType('custom');
    setFormLat('');
    setFormLng('');
    setFormNotes('');
    setFormPriority('0');
    setShowAddModal(true);
  }, []);

  const handleEdit = useCallback((bp: BailoutPoint) => {
    setEditingBailout(bp);
    setFormTitle(bp.title);
    setFormType(bp.type);
    setFormLat(bp.lat.toString());
    setFormLng(bp.lng.toString());
    setFormNotes(bp.notes || '');
    setFormPriority(bp.priority.toString());
    setShowAddModal(true);
  }, []);

  const handleSave = useCallback(() => {
    const lat = parseFloat(formLat);
    const lng = parseFloat(formLng);
    if (!formTitle.trim()) {
      showToast('Title is required');
      return;
    }
    if (isNaN(lat) || isNaN(lng)) {
      showToast('Valid coordinates required');
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      showToast('Coordinates out of range');
      return;
    }

    if (editingBailout) {
      bailoutStore.update(editingBailout.id, {
        title: formTitle.trim(),
        type: formType,
        lat,
        lng,
        notes: formNotes.trim() || null,
        priority: parseInt(formPriority) || 0,
      });
      showToast('BAILOUT UPDATED');
    } else {
      bailoutStore.create({
        title: formTitle.trim(),
        type: formType,
        lat,
        lng,
        notes: formNotes.trim() || undefined,
        priority: parseInt(formPriority) || 0,
      });
      showToast('BAILOUT CREATED');
    }

    setShowAddModal(false);
    refreshBailouts();
  }, [formTitle, formType, formLat, formLng, formNotes, formPriority, editingBailout, showToast, refreshBailouts]);

  const handleDelete = useCallback((bp: BailoutPoint) => {
    const doDelete = () => {
      bailoutStore.delete(bp.id);
      showToast('BAILOUT DELETED');
      refreshBailouts();
    };
    if (Platform.OS === 'web') {
      if (confirm(`Delete "${bp.title}"?`)) doDelete();
    } else {
      Alert.alert('Delete Bailout', `Remove "${bp.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [showToast, refreshBailouts]);

  const handleToggleRunBailout = useCallback((bailoutId: string) => {
    if (!runId) return;
    if (runBailoutIds.has(bailoutId)) {
      bailoutStore.removeBailoutFromRun(runId, bailoutId);
    } else {
      bailoutStore.addBailoutToRun(runId, bailoutId);
    }
    refreshBailouts();
  }, [runId, runBailoutIds, refreshBailouts]);

  const handleAutoSuggest = useCallback(() => {
    if (!run || !runId) {
      showToast('No run selected for auto-suggest');
      return;
    }
    const bounds = computeBounds(run.points);
    if (!bounds) {
      showToast('Run has no points');
      return;
    }
    const suggested = bailoutStore.autoSuggest(bounds, 25);
    if (suggested.length === 0) {
      showToast('No bailouts found near this route');
      return;
    }
    bailoutStore.setRunBailouts(runId, suggested.map(s => s.id));
    showToast(`${suggested.length} BAILOUTS AUTO-SELECTED`);
    refreshBailouts();
  }, [run, runId, showToast, refreshBailouts]);

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TACTICAL.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>BAILOUT POINTS</Text>
        <Text style={styles.countBadge}>{bailouts.length}</Text>
      </View>

      {/* Run context banner */}
      {run && (
        <View style={styles.runBanner}>
          <Ionicons name="compass-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.runBannerText} numberOfLines={1}>
            Selecting for: {run.title}
          </Text>
          <TouchableOpacity onPress={handleAutoSuggest} style={styles.autoSuggestBtn}>
            <Ionicons name="sparkles-outline" size={12} color={TACTICAL.amber} />
            <Text style={styles.autoSuggestText}>AUTO</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
        <TouchableOpacity
          style={[styles.filterChip, filterType === 'all' && styles.filterChipActive]}
          onPress={() => setFilterType('all')}
        >
          <Text style={[styles.filterChipText, filterType === 'all' && styles.filterChipTextActive]}>ALL</Text>
        </TouchableOpacity>
        {BAILOUT_TYPES.map(bt => (
          <TouchableOpacity
            key={bt.key}
            style={[styles.filterChip, filterType === bt.key && styles.filterChipActive]}
            onPress={() => setFilterType(bt.key)}
          >
            <Ionicons name={bt.icon as any} size={11} color={filterType === bt.key ? '#0B0F12' : bt.color} />
            <Text style={[styles.filterChipText, filterType === bt.key && styles.filterChipTextActive]}>
              {bt.label.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Bailout list */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {filteredBailouts.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="flag-outline" size={36} color={TACTICAL.textMuted} />
            <Text style={styles.emptyTitle}>NO BAILOUT POINTS</Text>
            <Text style={styles.emptyBody}>
              Add safe exits, fuel stops, hospitals, and other bailout locations for your routes.
            </Text>
          </View>
        )}

        {filteredBailouts.map(bp => {
          const meta = getBailoutTypeMeta(bp.type);
          const isSelected = runBailoutIds.has(bp.id);

          return (
            <View key={bp.id} style={[styles.bailoutCard, isSelected && styles.bailoutCardSelected]}>
              <View style={styles.bailoutRow}>
                {runId && (
                  <TouchableOpacity
                    style={[styles.selectBtn, isSelected && styles.selectBtnActive]}
                    onPress={() => handleToggleRunBailout(bp.id)}
                  >
                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={20}
                      color={isSelected ? '#66BB6A' : TACTICAL.textMuted}
                    />
                  </TouchableOpacity>
                )}

                <View style={[styles.typeIcon, { backgroundColor: meta.color + '15' }]}>
                  <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                </View>

                <View style={styles.bailoutInfo}>
                  <Text style={styles.bailoutTitle} numberOfLines={1}>{bp.title}</Text>
                  <View style={styles.bailoutMeta}>
                    <Text style={[styles.bailoutType, { color: meta.color }]}>{meta.label}</Text>
                    <Text style={styles.bailoutCoords}>
                      {bp.lat.toFixed(5)}, {bp.lng.toFixed(5)}
                    </Text>
                  </View>
                  {bp.notes && (
                    <Text style={styles.bailoutNotes} numberOfLines={1}>{bp.notes}</Text>
                  )}
                </View>

                <View style={styles.bailoutActions}>
                  {bp.priority > 0 && (
                    <View style={styles.priorityBadge}>
                      <Text style={styles.priorityText}>P{bp.priority}</Text>
                    </View>
                  )}
                  <TouchableOpacity onPress={() => handleEdit(bp)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="pencil-outline" size={14} color={TACTICAL.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(bp)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={14} color={TACTICAL.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={22} color="#0B0F12" />
      </TouchableOpacity>

      {/* Add/Edit Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ScrollView>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingBailout ? 'EDIT BAILOUT' : 'ADD BAILOUT'}
                </Text>
                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                  <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.formSection}>
                <FormField label="TITLE" value={formTitle} onChangeText={setFormTitle} placeholder="e.g. Williams Gas Station" />

                {/* Type selector */}
                <Text style={styles.formLabel}>TYPE</Text>
                <View style={styles.typeGrid}>
                  {BAILOUT_TYPES.map(bt => (
                    <TouchableOpacity
                      key={bt.key}
                      style={[styles.typeOption, formType === bt.key && { borderColor: bt.color, backgroundColor: bt.color + '10' }]}
                      onPress={() => setFormType(bt.key)}
                    >
                      <Ionicons name={bt.icon as any} size={14} color={formType === bt.key ? bt.color : TACTICAL.textMuted} />
                      <Text style={[styles.typeOptionText, formType === bt.key && { color: bt.color }]}>
                        {bt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.coordRow}>
                  <View style={styles.coordField}>
                    <FormField label="LATITUDE" value={formLat} onChangeText={setFormLat} placeholder="35.12345" keyboardType="numeric" />
                  </View>
                  <View style={styles.coordField}>
                    <FormField label="LONGITUDE" value={formLng} onChangeText={setFormLng} placeholder="-111.67890" keyboardType="numeric" />
                  </View>
                </View>

                <FormField label="NOTES (OPTIONAL)" value={formNotes} onChangeText={setFormNotes} placeholder="Additional details..." multiline />
                <FormField label="PRIORITY (0-10)" value={formPriority} onChangeText={setFormPriority} placeholder="0" keyboardType="numeric" />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddModal(false)}>
                  <Text style={styles.cancelBtnText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
                  <Ionicons name="checkmark" size={16} color="#0B0F12" />
                  <Text style={styles.saveBtnText}>{editingBailout ? 'UPDATE' : 'CREATE'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Toast />
    </View>
  );
}

function FormField({ label, value, onChangeText, placeholder, keyboardType, multiline }: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'numeric' | 'default';
  multiline?: boolean;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        style={[styles.formInput, multiline && { height: 60, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={TACTICAL.textMuted + '60'}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TACTICAL.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 16 : 54,
    paddingHorizontal: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: TACTICAL.border,
    gap: 8,
  },
  backBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  topTitle: { ...TYPO.T2, color: TACTICAL.amber, flex: 1 },
  countBadge: {
    ...TYPO.K3, color: TACTICAL.textMuted, fontSize: 11,
    backgroundColor: 'rgba(62,79,60,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },

  // Run banner
  runBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: DENSITY.screenPad, paddingVertical: 8,
    backgroundColor: 'rgba(196,138,44,0.06)',
    borderBottomWidth: 1, borderBottomColor: TACTICAL.amber + '20',
  },
  runBannerText: { ...TYPO.B2, fontSize: 11, color: TACTICAL.text, flex: 1 },
  autoSuggestBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    borderWidth: 1, borderColor: TACTICAL.amber + '40',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  autoSuggestText: { ...TYPO.U2, color: TACTICAL.amber, fontSize: 8 },

  // Filter bar
  filterBar: { maxHeight: 44 },
  filterBarContent: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: DENSITY.screenPad, paddingVertical: 8,
  },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    borderWidth: 1, borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.05)',
  },
  filterChipActive: {
    backgroundColor: TACTICAL.amber,
    borderColor: TACTICAL.amber,
  },
  filterChipText: { ...TYPO.U2, fontSize: 8, color: TACTICAL.textMuted },
  filterChipTextActive: { color: '#0B0F12' },

  // List
  list: { flex: 1 },
  listContent: { padding: DENSITY.screenPad, gap: 8 },

  // Empty state
  emptyState: { alignItems: 'center', padding: 32, gap: 8 },
  emptyTitle: { ...TYPO.T2, color: TACTICAL.text },
  emptyBody: { ...TYPO.B2, textAlign: 'center', lineHeight: 18, fontSize: 11 },

  // Bailout card
  bailoutCard: {
    backgroundColor: TACTICAL.panel, borderRadius: 12,
    borderWidth: 1, borderColor: TACTICAL.border,
    padding: 12,
  },
  bailoutCardSelected: {
    borderColor: '#66BB6A40',
    backgroundColor: 'rgba(102,187,106,0.04)',
  },
  bailoutRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  selectBtn: { width: 28, alignItems: 'center' },
  selectBtnActive: {},
  typeIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  bailoutInfo: { flex: 1, gap: 2 },
  bailoutTitle: { ...TYPO.T3, color: TACTICAL.text, fontSize: 12 },
  bailoutMeta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  bailoutType: { ...TYPO.U2, fontSize: 8 },
  bailoutCoords: { ...TYPO.K3, fontSize: 9, color: TACTICAL.textMuted },
  bailoutNotes: { ...TYPO.B2, fontSize: 10, color: TACTICAL.textMuted },
  bailoutActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  priorityBadge: {
    backgroundColor: 'rgba(196,138,44,0.15)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
  },
  priorityText: { ...TYPO.U2, fontSize: 7, color: TACTICAL.amber },

  // FAB
  fab: {
    position: 'absolute', bottom: 90, right: 20,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContainer: {
    backgroundColor: TACTICAL.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%', borderTopWidth: 2, borderColor: TACTICAL.amber + '40',
    paddingBottom: Platform.OS === 'web' ? 20 : 40,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: DENSITY.modalPad, borderBottomWidth: 1, borderBottomColor: TACTICAL.border,
  },
  modalTitle: { ...TYPO.T2, color: TACTICAL.amber },

  formSection: { padding: DENSITY.modalPad, gap: 12 },
  formField: { gap: 4 },
  formLabel: { ...TYPO.T4, fontSize: 8, letterSpacing: 3 },
  formInput: {
    ...TYPO.B1, color: TACTICAL.text,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
  },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeOption: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: TACTICAL.border,
  },
  typeOptionText: { ...TYPO.U2, fontSize: 8, color: TACTICAL.textMuted },

  coordRow: { flexDirection: 'row', gap: 10 },
  coordField: { flex: 1 },

  modalActions: { flexDirection: 'row', gap: 10, padding: DENSITY.modalPad, paddingTop: 8 },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: 10,
    borderWidth: 1, borderColor: TACTICAL.border,
  },
  cancelBtnText: { ...TYPO.U2, color: TACTICAL.textMuted, fontSize: 9 },
  saveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: 10, backgroundColor: TACTICAL.amber,
  },
  saveBtnText: { ...TYPO.U1, color: '#0B0F12' },
});





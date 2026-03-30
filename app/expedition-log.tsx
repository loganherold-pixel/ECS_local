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
import { fieldLogStore } from '../lib/expeditionCommandStore';
import type { EcsFieldLog, EcsFieldLogType } from '../lib/expeditionTypes';
import { FIELD_LOG_TYPE_META } from '../lib/expeditionTypes';

const LOG_TYPES = Object.entries(FIELD_LOG_TYPE_META) as [EcsFieldLogType, typeof FIELD_LOG_TYPE_META['note']][];

export default function ExpeditionLogScreen() {
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const router = useRouter();
  const { user, isOnline } = useApp();
  const params = useLocalSearchParams<{ id?: string }>();
  const expeditionId = params.id || '';

  const [logs, setLogs] = useState<EcsFieldLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<EcsFieldLogType | null>(null);

  // Add modal
  const [addVisible, setAddVisible] = useState(false);
  const [logType, setLogType] = useState<EcsFieldLogType>('note');
  const [logTitle, setLogTitle] = useState('');
  const [logBody, setLogBody] = useState('');
  const [logMeta, setLogMeta] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!user || !expeditionId) return;
    if (mountedRef.current) setLoading(true);
    try {
      const data = await fieldLogStore.list(expeditionId, user.id);
      if (mountedRef.current) setLogs(data);
    } catch (err) {
      console.warn('[ExpeditionLog] fetchLogs error:', err);
    }
    if (mountedRef.current) setLoading(false);
  }, [user, expeditionId]);

  useFocusEffect(useCallback(() => { fetchLogs(); }, [fetchLogs]));

  const filtered = useMemo(() => {
    if (!filterType) return logs;
    return logs.filter(l => l.type === filterType);
  }, [logs, filterType]);

  const handleAddLog = async () => {
    if (!user || !expeditionId || saving) return;
    setSaving(true);
    try {
      let meta: Record<string, any> | undefined;
      if (logMeta.trim()) {
        // Parse simple key:value pairs for fuel/water
        if (logType === 'resource') {
          const val = parseFloat(logMeta);
          if (!isNaN(val)) meta = { quantity: val };
        }
      }

      const log = await fieldLogStore.create(user.id, {
        expedition_id: expeditionId,
        type: logType,
        title: logTitle.trim() || undefined,
        body: logBody.trim() || undefined,
        meta,
      });
      if (!mountedRef.current) return;
      if (log) setLogs(prev => [log, ...prev]);
      setLogTitle('');
      setLogBody('');
      setLogMeta('');
      setAddVisible(false);
    } catch (err) {
      console.warn('[ExpeditionLog] handleAddLog error:', err);
    }
    if (mountedRef.current) setSaving(false);
  };

  const handleDeleteLog = async (id: string) => {
    if (mountedRef.current) setLogs(prev => prev.filter(l => l.id !== id));
    try {
      await fieldLogStore.remove(id);
    } catch (err) {
      console.warn('[ExpeditionLog] handleDeleteLog error:', err);
    }
  };


  const openAddWithType = (type: EcsFieldLogType) => {
    setLogType(type);
    setLogTitle('');
    setLogBody('');
    setLogMeta('');
    setAddVisible(true);
  };

  if (!user) return null;

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, EcsFieldLog[]> = {};
    for (const log of filtered) {
      const date = new Date(log.occurred_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (!groups[date]) groups[date] = [];
      groups[date].push(log);
    }
    return groups;
  }, [filtered]);

  return (
    <TopoBackground>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={TACTICAL.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerBrand}>FIELD LOG</Text>
            <Text style={styles.headerCount}>{logs.length} ENTRIES</Text>
          </View>
          <View style={styles.headerActions}>
            <View style={[styles.syncDot, { backgroundColor: isOnline ? '#4CAF50' : '#E53935' }]} />
            <TouchableOpacity style={styles.addBtn} onPress={() => openAddWithType('note')} activeOpacity={0.7}>
              <Ionicons name="add" size={20} color={TACTICAL.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Add Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
          {LOG_TYPES.map(([type, meta]) => (
            <TouchableOpacity
              key={type}
              style={styles.quickBtn}
              onPress={() => openAddWithType(type)}
              activeOpacity={0.7}
            >
              <View style={[styles.quickIcon, { borderColor: `${meta.color}40` }]}>
                <Ionicons name={meta.icon as any} size={16} color={meta.color} />
              </View>
              <Text style={styles.quickLabel}>{meta.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Type Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, !filterType && styles.filterChipActive]}
            onPress={() => setFilterType(null)}
          >
            <Text style={[styles.filterChipText, !filterType && styles.filterChipTextActive]}>ALL</Text>
          </TouchableOpacity>
          {LOG_TYPES.map(([type, meta]) => (
            <TouchableOpacity
              key={type}
              style={[styles.filterChip, filterType === type && { borderColor: meta.color, backgroundColor: `${meta.color}15` }]}
              onPress={() => setFilterType(filterType === type ? null : type)}
            >
              <Text style={[styles.filterChipText, filterType === type && { color: meta.color }]}>{meta.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Log Feed */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={TACTICAL.accent} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="journal-outline" size={48} color={TACTICAL.textMuted} />
            <Text style={styles.emptyTitle}>NO LOG ENTRIES</Text>
            <Text style={styles.emptySub}>Tap a quick action above to add your first entry.</Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.logList} showsVerticalScrollIndicator={false}>
            {Object.entries(groupedByDate).map(([date, dateLogs]) => (
              <View key={date}>
                <View style={styles.dateHeader}>
                  <View style={styles.dateLine} />
                  <Text style={styles.dateText}>{date.toUpperCase()}</Text>
                  <View style={styles.dateLine} />
                </View>
                {dateLogs.map(log => {
                  const meta = FIELD_LOG_TYPE_META[log.type] || FIELD_LOG_TYPE_META.note;
                  const time = new Date(log.occurred_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <TouchableOpacity
                      key={log.id}
                      style={styles.logEntry}
                      onLongPress={() => handleDeleteLog(log.id)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.logTimeline}>
                        <View style={[styles.logDot, { backgroundColor: meta.color }]} />
                        <View style={styles.logLine} />
                      </View>
                      <View style={styles.logContent}>
                        <View style={styles.logTop}>
                          <View style={[styles.logTypeBadge, { borderColor: `${meta.color}40` }]}>
                            <Ionicons name={meta.icon as any} size={10} color={meta.color} />
                            <Text style={[styles.logTypeBadgeText, { color: meta.color }]}>{meta.label}</Text>
                          </View>
                          <Text style={styles.logTime}>{time}</Text>
                        </View>
                        {log.title && <Text style={styles.logTitle}>{log.title}</Text>}
                        {log.body && <Text style={styles.logBody}>{log.body}</Text>}
                        {log.meta && Object.keys(log.meta).length > 0 && (
                          <View style={styles.logMetaRow}>
                            {Object.entries(log.meta).map(([k, v]) => (
                              <Text key={k} style={styles.logMetaText}>{k}: {String(v)}</Text>
                            ))}
                          </View>
                        )}
                        {(log.lat || log.lng) && (
                          <Text style={styles.logCoords}>{log.lat?.toFixed(4)}, {log.lng?.toFixed(4)}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            <View style={{ height: 120 }} />
          </ScrollView>
        )}

        {/* Add Modal */}
        <Modal visible={addVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {FIELD_LOG_TYPE_META[logType]?.label || 'LOG'} ENTRY
                </Text>
                <TouchableOpacity onPress={() => setAddVisible(false)}>
                  <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Type selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {LOG_TYPES.map(([type, meta]) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.typeChip, logType === type && { borderColor: meta.color, backgroundColor: `${meta.color}15` }]}
                      onPress={() => setLogType(type)}
                    >
                      <Ionicons name={meta.icon as any} size={12} color={logType === type ? meta.color : TACTICAL.textMuted} />
                      <Text style={[styles.typeChipText, logType === type && { color: meta.color }]}>{meta.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <TextInput
                style={styles.modalInput}
                value={logTitle}
                onChangeText={setLogTitle}
                placeholder="Title (optional)"
                placeholderTextColor={TACTICAL.textMuted}
                autoFocus
              />
              <TextInput
                style={[styles.modalInput, { height: 100, textAlignVertical: 'top' }]}
                value={logBody}
                onChangeText={setLogBody}
                placeholder="Details, observations, notes..."
                placeholderTextColor={TACTICAL.textMuted}
                multiline
              />

              {(logType === 'resource') && (
                <TextInput
                  style={styles.modalInput}
                  value={logMeta}
                  onChangeText={setLogMeta}
                  placeholder="Quantity (e.g. gallons, liters)"
                  placeholderTextColor={TACTICAL.textMuted}
                  keyboardType="numeric"
                />
              )}

              <TouchableOpacity
                style={[styles.modalSaveBtn, saving && { opacity: 0.6 }]}
                onPress={handleAddLog}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? <ActivityIndicator size="small" color="#0B0F12" /> : <Ionicons name="save-outline" size={16} color="#0B0F12" />}
                <Text style={styles.modalSaveBtnText}>{saving ? 'SAVING...' : 'SAVE ENTRY'}</Text>
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
  headerCount: { fontSize: 14, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 0.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  syncDot: { width: 6, height: 6, borderRadius: 3 },
  addBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: TACTICAL.accent },

  // Quick Add
  quickRow: { paddingHorizontal: 16, gap: 10, marginBottom: 12 },
  quickBtn: { alignItems: 'center', gap: 4, width: 56 },
  quickIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1 },
  quickLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.5, textAlign: 'center' },

  // Filters
  filterRow: { paddingHorizontal: 16, gap: 6, marginBottom: 10 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: TACTICAL.panel },
  filterChipActive: { borderColor: TACTICAL.accent, backgroundColor: 'rgba(62, 79, 60, 0.25)' },
  filterChipText: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  filterChipTextActive: { color: TACTICAL.text },

  // Log List
  logList: { paddingHorizontal: 16 },
  dateHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  dateLine: { flex: 1, height: 1, backgroundColor: 'rgba(62, 79, 60, 0.2)' },
  dateText: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5 },

  logEntry: { flexDirection: 'row', marginBottom: 4 },
  logTimeline: { width: 24, alignItems: 'center' },
  logDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  logLine: { flex: 1, width: 1, backgroundColor: 'rgba(62, 79, 60, 0.2)', marginTop: 4 },
  logContent: {
    flex: 1, marginLeft: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.1)', borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.15)', marginBottom: 6,
  },
  logTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  logTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  logTypeBadgeText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  logTime: { fontSize: 10, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  logTitle: { fontSize: 13, fontWeight: '800', color: TACTICAL.text, marginBottom: 2 },
  logBody: { fontSize: 12, color: TACTICAL.textMuted, lineHeight: 17 },
  logMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  logMetaText: { fontSize: 10, color: TACTICAL.amber, fontFamily: 'Courier' },
  logCoords: { fontSize: 10, color: TACTICAL.textMuted, fontFamily: 'Courier', marginTop: 4 },

  emptyTitle: { fontSize: 14, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1 },
  emptySub: { fontSize: 12, color: TACTICAL.textMuted, textAlign: 'center' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: TACTICAL.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'web' ? 20 : 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 14, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.5 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: TACTICAL.border },
  typeChipText: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  modalInput: {
    backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: TACTICAL.border,
    borderRadius: 12, padding: 14, color: TACTICAL.text, fontSize: 14, marginBottom: 12,
  },
  modalSaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12, backgroundColor: TACTICAL.amber,
  },
  modalSaveBtnText: { fontSize: 12, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.2 },
});





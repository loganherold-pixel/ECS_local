import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import type { TripLog, LogType } from '../../lib/types';

const LOG_TYPES: { value: LogType; label: string; icon: string; color: string }[] = [
  { value: 'note', label: 'NOTE', icon: 'document-text-outline', color: '#5B8DEF' },
  { value: 'observation', label: 'OBSERVATION', icon: 'eye-outline', color: '#4CAF50' },
  { value: 'incident', label: 'INCIDENT', icon: 'alert-circle-outline', color: TACTICAL.danger },
  { value: 'weather', label: 'WEATHER', icon: 'cloud-outline', color: '#9B59B6' },
  { value: 'camp', label: 'CAMP', icon: 'bonfire-outline', color: TACTICAL.amber },
  { value: 'mechanical', label: 'MECHANICAL', icon: 'construct-outline', color: '#E67E22' },
];

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${h}:${m}`;
  } catch { return ts; }
}

interface Props {
  expeditionId: string;
  userId: string;
}

export default function FieldLogTab({ expeditionId, userId }: Props) {
  const [logs, setLogs] = useState<TripLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [logType, setLogType] = useState<LogType>('note');

  // Mounted ref to prevent setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchLogs = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }
    try {
      const { data, error: err } = await supabase
        .from('trip_logs')
        .select('*')
        .eq('expedition_id', expeditionId)
        .order('logged_at', { ascending: false });
      if (!mountedRef.current) return;
      if (err) {
        console.warn('[FieldLogTab] fetchLogs error:', err.message);
        setError('FAILED TO LOAD FIELD LOGS');
      } else {
        setLogs(data || []);
      }
    } catch (ex: any) {
      console.warn('[FieldLogTab] fetchLogs exception:', ex?.message || ex);
      if (mountedRef.current) setError('FAILED TO LOAD FIELD LOGS');
    }
    if (mountedRef.current) setLoading(false);
  }, [expeditionId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleCreate = async () => {
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('trip_logs').insert({
        expedition_id: expeditionId,
        owner_user_id: userId,
        title: title.trim() || null,
        body: body.trim(),
        log_type: logType,
        logged_at: new Date().toISOString(),
      });
      if (!mountedRef.current) return;
      if (err) {
        console.warn('[FieldLogTab] handleCreate error:', err.message);
        setError('FAILED TO CREATE LOG ENTRY');
      } else {
        setTitle(''); setBody(''); setLogType('note');
        setShowForm(false);
        await fetchLogs();
      }
    } catch (ex: any) {
      console.warn('[FieldLogTab] handleCreate exception:', ex?.message || ex);
      if (mountedRef.current) setError('FAILED TO CREATE LOG ENTRY');
    }
    if (mountedRef.current) setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const doDelete = async () => {
      try {
        const { error: err } = await supabase.from('trip_logs').delete().eq('id', id);
        if (!mountedRef.current) return;
        if (err) {
          console.warn('[FieldLogTab] handleDelete error:', err.message);
          setError('FAILED TO DELETE LOG ENTRY');
        } else {
          fetchLogs();
        }
      } catch (ex: any) {
        console.warn('[FieldLogTab] handleDelete exception:', ex?.message || ex);
        if (mountedRef.current) setError('FAILED TO DELETE LOG ENTRY');
      }
    };
    if (Platform.OS === 'web') {
      if (confirm('Delete this log entry?')) doDelete();
    } else {
      Alert.alert('Delete Log', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const getTypeConfig = (t: LogType) => LOG_TYPES.find(lt => lt.value === t) || LOG_TYPES[0];

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={TACTICAL.accent} />
        <Text style={s.loadingText}>LOADING FIELD LOGS...</Text>
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
        <TouchableOpacity style={s.addBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="add-circle-outline" size={18} color={TACTICAL.text} />
          <Text style={s.addBtnText}>NEW LOG ENTRY</Text>
        </TouchableOpacity>
      )}

      {/* Form */}
      {showForm && (
        <View style={s.formCard}>
          <Text style={s.formTitle}>NEW FIELD LOG</Text>
          <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Entry Title (optional)" placeholderTextColor={TACTICAL.textMuted} />
          <TextInput style={[s.input, s.textArea]} value={body} onChangeText={setBody} placeholder="Log entry... *" placeholderTextColor={TACTICAL.textMuted} multiline textAlignVertical="top" />

          <Text style={s.fieldLabel}>TYPE</Text>
          <View style={s.typeRow}>
            {LOG_TYPES.map(t => (
              <TouchableOpacity key={t.value} style={[s.typeChip, logType === t.value && { borderColor: t.color, backgroundColor: `${t.color}15` }]} onPress={() => setLogType(t.value)}>
                <Ionicons name={t.icon as any} size={14} color={logType === t.value ? t.color : TACTICAL.textMuted} />
                <Text style={[s.typeChipText, logType === t.value && { color: t.color }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.formActions}>
            <TouchableOpacity style={s.saveBtn} onPress={handleCreate} disabled={saving || !body.trim()}>
              {saving ? <ActivityIndicator size="small" color={TACTICAL.text} /> : <Ionicons name="checkmark" size={18} color={TACTICAL.text} />}
              <Text style={s.saveBtnText}>{saving ? 'SAVING...' : 'LOG ENTRY'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowForm(false); setTitle(''); setBody(''); }}>
              <Text style={s.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Log entries */}
      {logs.length === 0 && !showForm ? (
        <View style={s.empty}>
          <Ionicons name="journal-outline" size={40} color={TACTICAL.textMuted} />
          <Text style={s.emptyTitle}>NO FIELD LOGS</Text>
          <Text style={s.emptySubtitle}>Record observations, incidents, and notes</Text>
        </View>
      ) : (
        logs.map(log => {
          const cfg = getTypeConfig(log.log_type);
          return (
            <View key={log.id} style={s.logCard}>
              <View style={s.logHeader}>
                <View style={[s.logTypeBadge, { borderColor: cfg.color }]}>
                  <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
                  <Text style={[s.logTypeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
                <Text style={s.logTime}>{formatTimestamp(log.logged_at)}</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => handleDelete(log.id)} style={s.logDeleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={TACTICAL.danger} />
                </TouchableOpacity>
              </View>
              {log.title && <Text style={s.logTitle}>{log.title}</Text>}
              <Text style={s.logBody}>{log.body}</Text>
              {(log.latitude != null && log.longitude != null) && (
                <View style={s.logCoords}>
                  <Ionicons name="location-outline" size={12} color={TACTICAL.textMuted} />
                  <Text style={s.logCoordsText}>{log.latitude.toFixed(4)}, {log.longitude.toFixed(4)}</Text>
                </View>
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
  errorText: { fontSize: 12, fontWeight: '700', color: TACTICAL.danger },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: TACTICAL.accent, borderRadius: TACTICAL.radius, padding: 14, marginBottom: 16 },
  addBtnText: { fontSize: 13, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1.5 },
  formCard: { backgroundColor: TACTICAL.panel, borderRadius: TACTICAL.radius, borderWidth: 1, borderColor: TACTICAL.amber, padding: 16, marginBottom: 16 },
  formTitle: { fontSize: 11, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 2, marginBottom: 12 },
  input: { backgroundColor: TACTICAL.bg, borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 10, padding: 12, color: TACTICAL.text, fontSize: 14, marginBottom: 10 },
  textArea: { minHeight: 80, paddingTop: 12 },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5, marginBottom: 8 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: TACTICAL.bg },
  typeChipText: { fontSize: 10, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.5 },
  formActions: { flexDirection: 'row', gap: 10 },
  saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: TACTICAL.accent, borderRadius: 10, padding: 14 },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1 },
  cancelBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: TACTICAL.textMuted },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  emptySubtitle: { fontSize: 12, color: TACTICAL.textMuted },
  logCard: { backgroundColor: TACTICAL.panel, borderRadius: TACTICAL.radius, borderWidth: 1, borderColor: TACTICAL.border, padding: 14, marginBottom: 10 },
  logHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  logTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  logTypeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  logTime: { fontSize: 10, fontWeight: '600', color: TACTICAL.textMuted, fontFamily: 'Courier' },
  logDeleteBtn: { padding: 6 },
  logTitle: { fontSize: 15, fontWeight: '700', color: TACTICAL.text, marginBottom: 4 },
  logBody: { fontSize: 14, color: TACTICAL.text, lineHeight: 20, opacity: 0.9 },
  logCoords: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  logCoordsText: { fontSize: 11, color: TACTICAL.textMuted, fontFamily: 'Courier' },
});




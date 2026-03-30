import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import type { Expedition, ExpeditionStatus, Vehicle } from '../../lib/types';

const STATUS_CONFIG: Record<ExpeditionStatus, { label: string; color: string; icon: string }> = {
  planning: { label: 'PLANNING', color: '#5B8DEF', icon: 'document-text-outline' },
  active: { label: 'ACTIVE', color: '#4CAF50', icon: 'radio-outline' },
  completed: { label: 'COMPLETED', color: TACTICAL.amber, icon: 'checkmark-circle-outline' },
  aborted: { label: 'ABORTED', color: TACTICAL.danger, icon: 'close-circle-outline' },
};
const ALL_STATUSES: ExpeditionStatus[] = ['planning', 'active', 'completed', 'aborted'];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  try {
    const d = new Date(dateStr);
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  } catch { return dateStr; }
}

function getDurationDays(s: string | null, e: string | null): number | null {
  if (!s || !e) return null;
  try {
    const ms = new Date(e).getTime() - new Date(s).getTime();
    if (isNaN(ms)) return null;
    return Math.max(1, Math.ceil(ms / 86400000));
  } catch { return null; }
}

interface Props {
  expedition: Expedition;
  vehicles: Vehicle[];
  onRefresh: () => Promise<void>;
}

export default function OverviewTab({ expedition, vehicles, onRefresh }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [editTitle, setEditTitle] = useState(expedition.title);
  const [editStatus, setEditStatus] = useState<ExpeditionStatus>(expedition.status);
  const [editVehicleId, setEditVehicleId] = useState<string | null>(expedition.vehicle_id);
  const [editStartAt, setEditStartAt] = useState(expedition.start_at?.split('T')[0] || '');
  const [editEndAt, setEditEndAt] = useState(expedition.end_at?.split('T')[0] || '');
  const [editContact, setEditContact] = useState(expedition.primary_contact || '');
  const [editComms, setEditComms] = useState(expedition.comms_plan || '');
  const [editObjectives, setEditObjectives] = useState(expedition.objectives || '');
  const [editHazards, setEditHazards] = useState(expedition.hazards || '');

  const resetFields = () => {
    setEditTitle(expedition.title);
    setEditStatus(expedition.status);
    setEditVehicleId(expedition.vehicle_id);
    setEditStartAt(expedition.start_at?.split('T')[0] || '');
    setEditEndAt(expedition.end_at?.split('T')[0] || '');
    setEditContact(expedition.primary_contact || '');
    setEditComms(expedition.comms_plan || '');
    setEditObjectives(expedition.objectives || '');
    setEditHazards(expedition.hazards || '');
  };

  const handleSave = async () => {
    if (!editTitle.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updateData: any = {
        title: editTitle.trim(),
        status: editStatus,
        vehicle_id: editVehicleId,
        primary_contact: editContact.trim() || null,
        comms_plan: editComms.trim() || null,
        objectives: editObjectives.trim() || null,
        hazards: editHazards.trim() || null,
        start_at: editStartAt.trim() ? new Date(editStartAt.trim()).toISOString() : null,
        end_at: editEndAt.trim() ? new Date(editEndAt.trim()).toISOString() : null,
      };
      const { error: err } = await supabase.from('expeditions').update(updateData).eq('id', expedition.id);
      if (err) { setError('UPDATE FAILED. RETRY.'); setSaving(false); return; }
      setSuccess('MISSION PARAMETERS UPDATED');
      setEditing(false);
      await onRefresh();
      setTimeout(() => setSuccess(null), 3000);
    } catch { setError('UNEXPECTED ERROR'); }
    setSaving(false);
  };

  const duration = getDurationDays(expedition.start_at, expedition.end_at);
  const statusCfg = STATUS_CONFIG[expedition.status];

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

      {/* Title + Edit Toggle */}
      <View style={s.titleRow}>
        {editing ? (
          <TextInput style={s.titleInput} value={editTitle} onChangeText={setEditTitle} placeholder="Mission Title" placeholderTextColor={TACTICAL.textMuted} />
        ) : (
          <Text style={s.title}>{expedition.title}</Text>
        )}
        {!editing && (
          <TouchableOpacity style={s.editBtn} onPress={() => { resetFields(); setEditing(true); }}>
            <Ionicons name="create-outline" size={18} color={TACTICAL.amber} />
          </TouchableOpacity>
        )}
      </View>

      {/* Status Pill */}
      {!editing && (
        <View style={[s.statusPill, { borderColor: statusCfg.color }]}>
          <Ionicons name={statusCfg.icon as any} size={14} color={statusCfg.color} />
          <Text style={[s.statusPillText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>
      )}

      {/* Status selector (editing) */}
      {editing && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>STATUS</Text>
          <View style={s.statusGrid}>
            {ALL_STATUSES.map(st => {
              const cfg = STATUS_CONFIG[st];
              return (
                <TouchableOpacity key={st} style={[s.statusOption, editStatus === st && { borderColor: cfg.color, backgroundColor: `${cfg.color}15` }]} onPress={() => setEditStatus(st)}>
                  <Ionicons name={cfg.icon as any} size={14} color={editStatus === st ? cfg.color : TACTICAL.textMuted} />
                  <Text style={[s.statusOptionText, editStatus === st && { color: cfg.color }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Mission Intel */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>MISSION INTEL</Text>
        <View style={s.intelGrid}>
          <View style={s.intelCard}>
            <Ionicons name="calendar-outline" size={18} color={TACTICAL.textMuted} />
            <Text style={s.intelLabel}>START</Text>
            {editing ? (
              <TextInput style={s.intelInput} value={editStartAt} onChangeText={setEditStartAt} placeholder="YYYY-MM-DD" placeholderTextColor={TACTICAL.textMuted} />
            ) : (
              <Text style={s.intelValue}>{formatDate(expedition.start_at)}</Text>
            )}
          </View>
          <View style={s.intelCard}>
            <Ionicons name="flag-outline" size={18} color={TACTICAL.textMuted} />
            <Text style={s.intelLabel}>END</Text>
            {editing ? (
              <TextInput style={s.intelInput} value={editEndAt} onChangeText={setEditEndAt} placeholder="YYYY-MM-DD" placeholderTextColor={TACTICAL.textMuted} />
            ) : (
              <Text style={s.intelValue}>{formatDate(expedition.end_at)}</Text>
            )}
          </View>
          {duration !== null && (
            <View style={s.intelCard}>
              <Ionicons name="time-outline" size={18} color={TACTICAL.amber} />
              <Text style={s.intelLabel}>DURATION</Text>
              <Text style={[s.intelValue, { color: TACTICAL.amber, fontSize: 20 }]}>{duration}D</Text>
            </View>
          )}
          <View style={s.intelCard}>
            <Ionicons name="car-outline" size={18} color={TACTICAL.textMuted} />
            <Text style={s.intelLabel}>VEHICLE</Text>
            {editing ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={[s.miniChip, !editVehicleId && s.miniChipActive]} onPress={() => setEditVehicleId(null)}>
                    <Text style={[s.miniChipText, !editVehicleId && s.miniChipTextActive]}>NONE</Text>
                  </TouchableOpacity>
                  {vehicles.map(v => (
                    <TouchableOpacity key={v.id} style={[s.miniChip, editVehicleId === v.id && s.miniChipActive]} onPress={() => setEditVehicleId(v.id)}>
                      <Text style={[s.miniChipText, editVehicleId === v.id && s.miniChipTextActive]}>{v.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Text style={s.intelValue}>{expedition.vehicles?.name || '--'}</Text>
            )}
          </View>
        </View>
      </View>

      {/* Contact & Comms */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>CONTACT & COMMS</Text>
        {editing ? (
          <>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>PRIMARY CONTACT</Text>
              <TextInput style={s.fieldInput} value={editContact} onChangeText={setEditContact} placeholder="Name / Phone / Sat Number" placeholderTextColor={TACTICAL.textMuted} />
            </View>
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>COMMS PLAN</Text>
              <TextInput style={[s.fieldInput, s.textArea]} value={editComms} onChangeText={setEditComms} placeholder="Check-in schedule, frequencies..." placeholderTextColor={TACTICAL.textMuted} multiline textAlignVertical="top" />
            </View>
          </>
        ) : (
          <>
            <View style={s.detailRow}>
              <Ionicons name="call-outline" size={14} color={TACTICAL.textMuted} />
              <Text style={s.detailLabel}>CONTACT:</Text>
              <Text style={s.detailValue}>{expedition.primary_contact || '--'}</Text>
            </View>
            <View style={s.detailRow}>
              <Ionicons name="radio-outline" size={14} color={TACTICAL.textMuted} />
              <Text style={s.detailLabel}>COMMS:</Text>
              <Text style={s.detailValue}>{expedition.comms_plan || '--'}</Text>
            </View>
          </>
        )}
      </View>

      {/* Objectives */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>OBJECTIVES</Text>
        {editing ? (
          <TextInput style={[s.fieldInput, s.textArea]} value={editObjectives} onChangeText={setEditObjectives} placeholder="Mission objectives..." placeholderTextColor={TACTICAL.textMuted} multiline textAlignVertical="top" />
        ) : (
          <Text style={s.bodyText}>{expedition.objectives || 'No objectives defined.'}</Text>
        )}
      </View>

      {/* Hazards */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>KNOWN HAZARDS</Text>
        {editing ? (
          <TextInput style={[s.fieldInput, s.textArea]} value={editHazards} onChangeText={setEditHazards} placeholder="Terrain risks, weather..." placeholderTextColor={TACTICAL.textMuted} multiline textAlignVertical="top" />
        ) : (
          <Text style={expedition.hazards ? s.hazardText : s.bodyText}>{expedition.hazards || 'No hazards documented.'}</Text>
        )}
      </View>

      {/* Save / Cancel */}
      {editing && (
        <View style={s.editActions}>
          <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving || !editTitle.trim()}>
            {saving ? (
              <><ActivityIndicator size="small" color={TACTICAL.text} /><Text style={s.saveBtnText}>SAVING...</Text></>
            ) : (
              <><Ionicons name="checkmark-circle" size={18} color={TACTICAL.text} /><Text style={s.saveBtnText}>SAVE PARAMETERS</Text></>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={() => { setEditing(false); setError(null); }}>
            <Text style={s.cancelBtnText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Footer */}
      <View style={s.footer}>
        <Text style={s.footerText}>CREATED {formatDate(expedition.created_at)} {' // '} UPDATED {formatDate(expedition.updated_at)}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: 0 },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(62,107,62,0.15)', borderWidth: 1, borderColor: 'rgba(62,107,62,0.3)', borderRadius: 10, padding: 12, marginBottom: 14 },
  successText: { fontSize: 12, fontWeight: '700', color: TACTICAL.successText, letterSpacing: 0.5 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(192,57,43,0.15)', borderWidth: 1, borderColor: 'rgba(192,57,43,0.3)', borderRadius: 10, padding: 12, marginBottom: 14 },
  errorText: { fontSize: 12, fontWeight: '700', color: TACTICAL.danger, letterSpacing: 0.5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: TACTICAL.text, letterSpacing: 0.5, flex: 1 },
  titleInput: { fontSize: 20, fontWeight: '800', color: TACTICAL.text, borderBottomWidth: 2, borderBottomColor: TACTICAL.amber, paddingBottom: 8, flex: 1 },
  editBtn: { padding: 8, backgroundColor: 'rgba(196,138,44,0.12)', borderRadius: 10, marginLeft: 8 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 16 },
  statusPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  section: { marginBottom: 16, backgroundColor: TACTICAL.panel, borderRadius: TACTICAL.radius, borderWidth: 1, borderColor: TACTICAL.border, padding: 16 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 2, marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(196,138,44,0.2)' },
  intelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  intelCard: { flex: 1, minWidth: '45%', backgroundColor: TACTICAL.bg, borderRadius: 10, padding: 12, alignItems: 'center', gap: 4 },
  intelLabel: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  intelValue: { fontSize: 14, fontWeight: '700', color: TACTICAL.text, fontFamily: 'Courier', textAlign: 'center' },
  intelInput: { fontSize: 13, color: TACTICAL.text, borderBottomWidth: 1, borderBottomColor: TACTICAL.accent, paddingVertical: 4, textAlign: 'center', width: '100%' },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  detailLabel: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1, minWidth: 60 },
  detailValue: { flex: 1, fontSize: 13, color: TACTICAL.text, lineHeight: 18 },
  bodyText: { fontSize: 14, color: TACTICAL.textMuted, lineHeight: 20 },
  hazardText: { fontSize: 14, color: '#E8A87C', lineHeight: 20 },
  fieldGroup: { marginBottom: 12 },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5, marginBottom: 6 },
  fieldInput: { backgroundColor: TACTICAL.bg, borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 10, padding: 12, color: TACTICAL.text, fontSize: 14 },
  textArea: { minHeight: 70, paddingTop: 12 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: TACTICAL.bg },
  statusOptionText: { fontSize: 10, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  miniChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: TACTICAL.bg },
  miniChipActive: { borderColor: TACTICAL.accent, backgroundColor: 'rgba(62,79,60,0.25)' },
  miniChipText: { fontSize: 11, fontWeight: '600', color: TACTICAL.textMuted },
  miniChipTextActive: { color: TACTICAL.text },
  editActions: { gap: 10, marginTop: 8 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: TACTICAL.accent, borderRadius: TACTICAL.radius, padding: 16 },
  saveBtnText: { fontSize: 14, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1.5 },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  footer: { marginTop: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(62,79,60,0.2)', alignItems: 'center' },
  footerText: { fontSize: 10, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 1 },
});




/**
 * Add Maintenance Log Modal
 *
 * Full-featured form for logging maintenance events with:
 * - Event type picker (18 types with icons)
 * - Date, mileage, cost, shop name, parts, notes
 * - Auto-computed next service due dates
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, Platform, KeyboardAvoidingView,
} from 'react-native';
import ECSModal from '../ECSModal';

import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import {
  EVENT_TYPE_META,
  MAINTENANCE_EVENT_TYPES,
  type MaintenanceEventType,
  type MaintenanceLogInsert,
} from './MaintenanceTypes';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSave: (log: MaintenanceLogInsert) => void;
  vehicleId: string;
  userId: string;
}

export default function AddMaintenanceModal({ visible, onClose, onSave, vehicleId, userId }: Props) {
  const [eventType, setEventType] = useState<MaintenanceEventType>('oil_change');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0]);
  const [mileage, setMileage] = useState('');
  const [costStr, setCostStr] = useState('');
  const [shopName, setShopName] = useState('');
  const [partsUsed, setPartsUsed] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const meta = useMemo(() => EVENT_TYPE_META[eventType], [eventType]);

  const resetForm = useCallback(() => {
    setEventType('oil_change');
    setShowTypePicker(false);
    setDateStr(new Date().toISOString().split('T')[0]);
    setMileage('');
    setCostStr('');
    setShopName('');
    setPartsUsed('');
    setNotes('');
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    const mileageNum = mileage ? parseInt(mileage, 10) : null;
    const costCents = costStr ? Math.round(parseFloat(costStr) * 100) : 0;
    const intervalMiles = meta.defaultIntervalMiles;
    const intervalDays = meta.defaultIntervalDays;

    let nextDueMileage: number | null = null;
    let nextDueDate: string | null = null;

    if (mileageNum && intervalMiles) {
      nextDueMileage = mileageNum + intervalMiles;
    }
    if (intervalDays) {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + intervalDays);
      nextDueDate = d.toISOString();
    }

    const log: MaintenanceLogInsert = {
      vehicle_id: vehicleId,
      owner_user_id: userId,
      event_type: eventType,
      title: meta.label,
      description: notes || null,
      event_date: new Date(dateStr).toISOString(),
      mileage: mileageNum,
      cost_cents: costCents,
      shop_name: shopName || null,
      parts_used: partsUsed || null,
      next_due_mileage: nextDueMileage,
      next_due_date: nextDueDate,
      interval_miles: intervalMiles,
      interval_days: intervalDays,
    };

    onSave(log);
    resetForm();
    setSaving(false);
  }, [saving, eventType, dateStr, mileage, costStr, shopName, partsUsed, notes, meta, vehicleId, userId, onSave, resetForm]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  return (
    <ECSModal visible={visible} onClose={handleClose} tier="global">

      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.container}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Ionicons name="construct-outline" size={16} color={TACTICAL.amber} />
              <Text style={s.headerTitle}>LOG MAINTENANCE</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={s.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Event Type Selector */}
            <Text style={s.label}>SERVICE TYPE</Text>
            <TouchableOpacity
              style={s.typeSelector}
              onPress={() => setShowTypePicker(!showTypePicker)}
              activeOpacity={0.85}
            >
              <View style={[s.typeIcon, { backgroundColor: meta.color + '22' }]}>
                <Ionicons name={meta.icon as any} size={18} color={meta.color} />
              </View>
              <Text style={s.typeSelectorText}>{meta.label}</Text>
              <Ionicons
                name={showTypePicker ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={TACTICAL.textMuted}
              />
            </TouchableOpacity>

            {showTypePicker && (
              <View style={s.typePickerGrid}>
                {MAINTENANCE_EVENT_TYPES.map(type => {
                  const m = EVENT_TYPE_META[type];
                  const isSelected = type === eventType;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[s.typeOption, isSelected && s.typeOptionSelected]}
                      onPress={() => { setEventType(type); setShowTypePicker(false); }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name={m.icon as any} size={14} color={isSelected ? m.color : TACTICAL.textMuted} />
                      <Text style={[s.typeOptionText, isSelected && { color: m.color }]} numberOfLines={1}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Date */}
            <Text style={s.label}>DATE</Text>
            <TextInput
              style={s.input}
              value={dateStr}
              onChangeText={setDateStr}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={TACTICAL.textMuted + '66'}
              keyboardType="default"
            />

            {/* Mileage */}
            <Text style={s.label}>ODOMETER (MILES)</Text>
            <TextInput
              style={s.input}
              value={mileage}
              onChangeText={setMileage}
              placeholder="e.g. 45000"
              placeholderTextColor={TACTICAL.textMuted + '66'}
              keyboardType="numeric"
            />

            {/* Cost */}
            <Text style={s.label}>COST ($)</Text>
            <TextInput
              style={s.input}
              value={costStr}
              onChangeText={setCostStr}
              placeholder="0.00"
              placeholderTextColor={TACTICAL.textMuted + '66'}
              keyboardType="decimal-pad"
            />

            {/* Shop Name */}
            <Text style={s.label}>SHOP / LOCATION</Text>
            <TextInput
              style={s.input}
              value={shopName}
              onChangeText={setShopName}
              placeholder="Optional"
              placeholderTextColor={TACTICAL.textMuted + '66'}
            />

            {/* Parts Used */}
            <Text style={s.label}>PARTS USED</Text>
            <TextInput
              style={s.input}
              value={partsUsed}
              onChangeText={setPartsUsed}
              placeholder="e.g. Mobil 1 5W-30, K&N filter"
              placeholderTextColor={TACTICAL.textMuted + '66'}
            />

            {/* Notes */}
            <Text style={s.label}>NOTES</Text>
            <TextInput
              style={[s.input, s.inputMulti]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional details..."
              placeholderTextColor={TACTICAL.textMuted + '66'}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Next service info */}
            {(meta.defaultIntervalMiles || meta.defaultIntervalDays) && (
              <View style={s.nextServiceInfo}>
                <Ionicons name="time-outline" size={14} color={TACTICAL.amber} />
                <Text style={s.nextServiceText}>
                  Next service auto-set:
                  {meta.defaultIntervalMiles ? ` every ${meta.defaultIntervalMiles.toLocaleString()} mi` : ''}
                  {meta.defaultIntervalMiles && meta.defaultIntervalDays ? ' or' : ''}
                  {meta.defaultIntervalDays ? ` every ${Math.round(meta.defaultIntervalDays / 30)} months` : ''}
                </Text>
              </View>
            )}

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Footer */}
          <View style={s.footer}>
            <TouchableOpacity style={s.cancelBtn} onPress={handleClose} activeOpacity={0.85}>
              <Text style={s.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, saving && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark" size={16} color="#0B0F12" />
              <Text style={s.saveBtnText}>SAVE LOG</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ECSModal>

  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#0F1318',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.22)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 12, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.5 },
  closeBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  label: { fontSize: 9, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 1.8, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  inputMulti: { minHeight: 70, paddingTop: 10 },
  typeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.35)',
  },
  typeIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  typeSelectorText: { flex: 1, fontSize: 13, fontWeight: '700', color: TACTICAL.text },
  typePickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
    width: '48%',
  },
  typeOptionSelected: {
    borderColor: 'rgba(196, 138, 44, 0.5)',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  typeOptionText: { fontSize: 10, fontWeight: '700', color: TACTICAL.textMuted, flex: 1 },
  nextServiceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.18)',
  },
  nextServiceText: { fontSize: 10, color: TACTICAL.textMuted, flex: 1, lineHeight: 15 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.22)',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
  },
  cancelBtnText: { fontSize: 11, fontWeight: '900', color: TACTICAL.textMuted, letterSpacing: 1.2 },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  saveBtnText: { fontSize: 11, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.2 },
});




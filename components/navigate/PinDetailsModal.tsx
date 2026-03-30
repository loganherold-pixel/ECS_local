import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import {
  type PinType,
  type PinSeverity,
  type ECSPin,
  getPinTypeMeta,
  getWaypointTypes,
  getIncidentTypes,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
} from './PinTypes';

interface Props {
  visible?: boolean;
  onClose?: () => void;
  embedded?: boolean; // ✅ NEW
  onSave: (data: {
    type: PinType;
    title: string;
    notes: string;
    severity: PinSeverity | null;
  }) => void;
  onDelete?: () => void;
  onResolve?: () => void;
  editPin?: ECSPin | null;
  coordinates: { lat: number; lng: number } | null;
  activeExpeditionId?: string | null;
  activeExpeditionName?: string | null;
}

export default function PinDetailsModal({
  visible = false,
  onClose,
  embedded = false,
  onSave,
  onDelete,
  onResolve,
  editPin,
  coordinates,
  activeExpeditionId,
  activeExpeditionName,
}: Props) {

  // 🚨 DO NOT RENDER if not embedded + not visible
  if (!embedded && !visible) return null;

  const [selectedType, setSelectedType] = useState<PinType>('poi');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [severity, setSeverity] = useState<PinSeverity | null>(null);
  const [categoryTab, setCategoryTab] = useState<'waypoint' | 'incident'>('waypoint');

  useEffect(() => {
    if (visible || embedded) {
      if (editPin) {
        setSelectedType(editPin.type);
        setTitle(editPin.title ?? '');
        setNotes(editPin.notes ?? '');
        setSeverity(editPin.severity ?? null);
        setCategoryTab(editPin.category);
      } else {
        setSelectedType('poi');
        setTitle('');
        setNotes('');
        setSeverity(null);
        setCategoryTab('waypoint');
      }
    }
  }, [visible, embedded, editPin]);

  const handleSave = useCallback(() => {
    onSave({
      type: selectedType,
      title: title.trim() || getPinTypeMeta(selectedType).defaultTitle,
      notes: notes.trim(),
      severity,
    });
  }, [selectedType, title, notes, severity, onSave]);

  const currentMeta = getPinTypeMeta(selectedType);
  const isIncident = currentMeta.category === 'incident';
  const isEditing = !!editPin;

  const waypointTypes = getWaypointTypes();
  const incidentTypes = getIncidentTypes();
  const displayTypes = categoryTab === 'waypoint' ? waypointTypes : incidentTypes;

  const content = (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name={currentMeta.icon as any} size={16} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>{isEditing ? 'EDIT PIN' : 'DROP PIN'}</Text>
        </View>

        {onClose && (
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>

        {/* TYPE SELECT */}
        {!isEditing && (
          <View style={styles.typeChips}>
            {displayTypes.map((meta) => (
              <TouchableOpacity
                key={meta.type}
                style={[
                  styles.typeChip,
                  selectedType === meta.type && { borderColor: meta.color },
                ]}
                onPress={() => setSelectedType(meta.type)}
              >
                <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                <Text style={styles.typeChipText}>{meta.shortLabel}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* TITLE */}
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="TITLE"
          placeholderTextColor={TACTICAL.textMuted}
        />

        {/* NOTES */}
        <TextInput
          style={[styles.input, styles.multi]}
          value={notes}
          onChangeText={setNotes}
          placeholder="NOTES"
          placeholderTextColor={TACTICAL.textMuted}
          multiline
        />

        {/* SEVERITY */}
        {isIncident && (
          <View style={styles.severityRow}>
            {(['low', 'med', 'high'] as PinSeverity[]).map((sev) => (
              <TouchableOpacity
                key={sev}
                onPress={() => setSeverity(sev)}
                style={[
                  styles.severityChip,
                  severity === sev && { borderColor: SEVERITY_COLORS[sev] },
                ]}
              >
                <Text style={{ color: SEVERITY_COLORS[sev] }}>
                  {SEVERITY_LABELS[sev]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ACTIONS */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelText}>CANCEL</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveText}>
            {isEditing ? 'UPDATE' : 'DROP PIN'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ✅ Embedded = return raw content
  if (embedded) return content;

  // (Optional fallback wrapper if needed)
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {content}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerLeft: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  headerTitle: { color: TACTICAL.text, fontWeight: '700' },

  body: { maxHeight: 400 },

  input: {
    backgroundColor: '#111',
    color: '#fff',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },

  multi: { height: 80 },

  typeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },

  typeChip: {
    borderWidth: 1,
    borderColor: '#333',
    padding: 6,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
  },

  typeChipText: { color: '#ccc' },

  severityRow: { flexDirection: 'row', gap: 8 },

  severityChip: {
    borderWidth: 1,
    borderColor: '#333',
    padding: 6,
    borderRadius: 8,
  },

  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },

  cancelBtn: { padding: 10 },
  cancelText: { color: '#aaa' },

  saveBtn: {
    backgroundColor: TACTICAL.amber,
    padding: 10,
    borderRadius: 10,
  },

  saveText: { color: '#000', fontWeight: '700' },
});
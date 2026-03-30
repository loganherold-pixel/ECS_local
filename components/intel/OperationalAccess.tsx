/**
 * OperationalAccess — Section 2 of Intel Tab (Legacy)
 *
 * Manages operational access data:
 *   - Emergency contacts (editable)
 *   - Permit requirements (editable)
 *   - Gate codes (editable)
 *   - Land-use restrictions (editable)
 *   - Closures (editable)
 *
 * Radio Frequencies removed — now in Safety → Comms.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';

// ── Comms Field Types ────────────────────────────────────────
interface CommsField {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  icon: string;
  group: 'contacts' | 'access' | 'restrictions';
}

const DEFAULT_FIELDS: CommsField[] = [
  { id: 'contact1', label: 'Emergency Contact 1', value: '', placeholder: 'Name / Phone', icon: 'call-outline', group: 'contacts' },
  { id: 'contact2', label: 'Emergency Contact 2', value: '', placeholder: 'Name / Phone', icon: 'call-outline', group: 'contacts' },
  { id: 'satphone', label: 'Satellite Phone', value: '', placeholder: 'Sat phone number', icon: 'globe-outline', group: 'contacts' },
  { id: 'permit', label: 'Permit Number', value: '', placeholder: 'Permit ID / reference', icon: 'document-text-outline', group: 'access' },
  { id: 'gate_code', label: 'Gate Code', value: '', placeholder: 'Access code', icon: 'key-outline', group: 'access' },
  { id: 'land_use', label: 'Land Use Notes', value: '', placeholder: 'BLM, USFS, private, etc.', icon: 'earth-outline', group: 'restrictions' },
  { id: 'closures', label: 'Closure Notes', value: '', placeholder: 'Road/trail closures', icon: 'close-circle-outline', group: 'restrictions' },
  { id: 'special', label: 'Special Instructions', value: '', placeholder: 'Additional access notes', icon: 'information-circle-outline', group: 'restrictions' },
];

interface Props {
  onToast: (msg: string) => void;
}

export default function OperationalAccess({ onToast }: Props) {
  const [fields, setFields] = useState<CommsField[]>(DEFAULT_FIELDS);
  const [expandedGroup, setExpandedGroup] = useState<string | null>('contacts');

  const updateField = useCallback((id: string, value: string) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, value } : f));
  }, []);

  const groups = [
    { key: 'contacts', label: 'EMERGENCY CONTACTS', icon: 'call-outline' },
    { key: 'access', label: 'PERMITS & ACCESS', icon: 'key-outline' },
    { key: 'restrictions', label: 'RESTRICTIONS & CLOSURES', icon: 'close-circle-outline' },
  ];

  const handleSave = useCallback(() => {
    onToast('Operational data saved locally');
  }, [onToast]);

  return (
    <View style={styles.section}>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>OPERATIONAL ACCESS</Text>
        </View>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn} activeOpacity={0.7}>
          <Ionicons name="checkmark-circle-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.saveBtnText}>SAVE</Text>
        </TouchableOpacity>
      </View>

      {/* Editable Field Groups */}
      {groups.map(group => {
        const isExpanded = expandedGroup === group.key;
        const groupFields = fields.filter(f => f.group === group.key);
        const filledCount = groupFields.filter(f => f.value.trim()).length;

        return (
          <View key={group.key} style={styles.groupCard}>
            <TouchableOpacity
              style={styles.groupHeader}
              onPress={() => setExpandedGroup(isExpanded ? null : group.key)}
              activeOpacity={0.7}
            >
              <View style={styles.groupHeaderLeft}>
                <Ionicons name={group.icon as any} size={14} color={TACTICAL.amber} />
                <Text style={styles.groupTitle}>{group.label}</Text>
              </View>
              <View style={styles.groupHeaderRight}>
                {filledCount > 0 && (
                  <View style={styles.filledBadge}>
                    <Text style={styles.filledBadgeText}>{filledCount}</Text>
                  </View>
                )}
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={TACTICAL.textMuted}
                />
              </View>
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.groupContent}>
                {groupFields.map(field => (
                  <View key={field.id} style={styles.fieldRow}>
                    <View style={styles.fieldLabelRow}>
                      <Ionicons name={field.icon as any} size={11} color={TACTICAL.textMuted} />
                      <Text style={styles.fieldLabel}>{field.label}</Text>
                    </View>
                    <TextInput
                      style={styles.fieldInput}
                      value={field.value}
                      onChangeText={(v) => updateField(field.id, v)}
                      placeholder={field.placeholder}
                      placeholderTextColor="rgba(138,138,133,0.3)"
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TACTICAL.amber,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)',
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
  },
  saveBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },

  groupCard: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  groupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filledBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(196, 138, 44, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filledBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
  },
  groupContent: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.15)',
    padding: 12,
    gap: 10,
  },

  fieldRow: { gap: 4 },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  fieldInput: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.text,
  },
});




/**
 * EditCommsModal — Long-press editor for Emergency Comms Reference
 *
 * Allows users to:
 * - View all entries (default + custom) in a column
 * - Add new custom frequencies, signals, or emergency contacts
 * - Delete custom entries (swipe-to-delete style with trash icon)
 * - Default entries are shown but marked as locked/non-editable
 *
 * Uses useSheetLayout for responsive height + safe-area padding.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import ECSModal from '../ECSModal';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { commsStore, type CommsEntry } from '../../lib/commsStore';
import { useSheetLayout } from '../../lib/useSheetLayout';


export type CommsColumnType = 'frequencies' | 'signals' | 'contacts';

interface Props {
  visible: boolean;
  columnType: CommsColumnType;
  defaultEntries: { label: string; detail: string }[];
  customEntries: CommsEntry[];
  onClose: () => void;
  onDataChanged: () => void;
}

// Column-specific configuration
const COLUMN_CONFIG: Record<CommsColumnType, {
  title: string;
  icon: string;
  singularLabel: string;
  labelPlaceholder: string;
  detailPlaceholder: string;
  labelFieldName: string;
  detailFieldName: string;
}> = {
  frequencies: {
    title: 'FREQUENCIES',
    icon: 'radio-outline',
    singularLabel: 'FREQUENCY',
    labelPlaceholder: 'e.g. MURS Ch 1',
    detailPlaceholder: 'e.g. 151.820 MHz',
    labelFieldName: 'Frequency',
    detailFieldName: 'Detail',
  },
  signals: {
    title: 'SIGNALS',
    icon: 'flash-outline',
    singularLabel: 'SIGNAL',
    labelPlaceholder: 'e.g. Mirror Flash',
    detailPlaceholder: 'e.g. 3 flashes',
    labelFieldName: 'Signal',
    detailFieldName: 'Detail',
  },
  contacts: {
    title: 'EMERGENCY CONTACTS',
    icon: 'call-outline',
    singularLabel: 'CONTACT',
    labelPlaceholder: 'e.g. Park Ranger Station',
    detailPlaceholder: 'e.g. 555-123-4567',
    labelFieldName: 'Name',
    detailFieldName: 'Phone Number',
  },
};

export default function EditCommsModal({
  visible,
  columnType,
  defaultEntries,
  customEntries,
  onClose,
  onDataChanged,
}: Props) {
  // ── Resolve column config safely — prevents "Property 'config' doesn't exist" ──
  const config = COLUMN_CONFIG[columnType] ?? COLUMN_CONFIG.frequencies;

  // ── Safe sheet layout — ensures content is visible on all devices ──
  const { sheetMaxHeight, contentBottomPadding, safeBottom } = useSheetLayout({ maxFraction: 0.90 });

  const [newLabel, setNewLabel] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);


  const handleAdd = useCallback(() => {
    const label = newLabel.trim();
    const detail = newDetail.trim();
    if (!label) return;

    if (columnType === 'frequencies') {
      commsStore.addFrequency(label, detail || '—');
    } else if (columnType === 'signals') {
      commsStore.addSignal(label, detail || '—');
    } else {
      commsStore.addContact(label, detail || '—');
    }

    setNewLabel('');
    setNewDetail('');
    setShowAddForm(false);
    onDataChanged();
  }, [newLabel, newDetail, columnType, onDataChanged]);

  const handleDelete = useCallback((id: string) => {
    if (columnType === 'frequencies') {
      commsStore.removeFrequency(id);
    } else if (columnType === 'signals') {
      commsStore.removeSignal(id);
    } else {
      commsStore.removeContact(id);
    }
    onDataChanged();
  }, [columnType, onDataChanged]);

  const handleClose = useCallback(() => {
    setShowAddForm(false);
    setNewLabel('');
    setNewDetail('');
    onClose();
  }, [onClose]);

  // Use danger color accent for contacts, amber for others
  const isContacts = columnType === 'contacts';
  const accentColor = isContacts ? TACTICAL.danger : TACTICAL.amber;

  return (
    <ECSModal visible={visible} onClose={handleClose} tier="global">
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1} />
      </View>

      <KeyboardAvoidingView
        style={styles.panelWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <View style={[styles.panel, { maxHeight: sheetMaxHeight, paddingBottom: safeBottom }]}>

          {/* Drag Handle */}
          <View style={styles.dragHandle}>
            <View style={styles.dragBar} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name={config.icon as any} size={18} color={accentColor} />
              <View>
                <Text style={[styles.headerLabel, { color: accentColor }]}>
                  EDIT {config.title}
                </Text>
                <Text style={styles.headerSub}>Long-press opened editor</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Scrollable Content */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={true}
          >
            {/* Default Entries (Locked) */}
            <Text style={styles.groupLabel}>
              <Ionicons name="lock-closed-outline" size={10} color={TACTICAL.textMuted} />
              {'  '}DEFAULT (READ-ONLY)
            </Text>
            {defaultEntries.map((entry, i) => (
              <View key={`default-${i}`} style={[styles.entryRow, isContacts && styles.entryRowContact]}>
                <View style={[styles.entryDot, isContacts && { backgroundColor: TACTICAL.danger }]} />
                <View style={styles.entryTextBlock}>
                  <Text style={styles.entryLabel}>{entry.label}</Text>
                  <Text style={[styles.entryDetail, isContacts && styles.entryDetailContact]}>
                    {entry.detail}
                  </Text>
                </View>
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={10} color="rgba(138,138,133,0.4)" />
                </View>
              </View>
            ))}

            {/* Custom Entries (Editable) */}
            {customEntries.length > 0 && (
              <>
                <Text style={[styles.groupLabel, { marginTop: 16 }]}>
                  <Ionicons name="create-outline" size={10} color={accentColor} />
                  {'  '}CUSTOM
                </Text>
                {customEntries.map((entry) => (
                  <View
                    key={entry.id}
                    style={[
                      styles.entryRow,
                      styles.entryRowCustom,
                      isContacts && styles.entryRowCustomContact,
                    ]}
                  >
                    <View style={[styles.entryDot, { backgroundColor: accentColor }]} />
                    <View style={styles.entryTextBlock}>
                      <Text style={[styles.entryLabel, { color: TACTICAL.text }]}>{entry.label}</Text>
                      <Text style={[styles.entryDetail, isContacts && styles.entryDetailContact]}>
                        {entry.detail}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDelete(entry.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={14} color={TACTICAL.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            {/* Add Form */}
            {showAddForm ? (
              <View style={[styles.addForm, isContacts && styles.addFormContact]}>
                <Text style={[styles.addFormTitle, { color: accentColor }]}>
                  ADD {config.singularLabel}
                </Text>
                <View style={styles.inputRow}>
                  <Text style={styles.inputLabel}>{config.labelFieldName}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={config.labelPlaceholder}
                    placeholderTextColor="rgba(138,138,133,0.5)"
                    value={newLabel}
                    onChangeText={setNewLabel}
                    autoFocus
                    returnKeyType="next"
                  />
                </View>
                <View style={styles.inputRow}>
                  <Text style={styles.inputLabel}>{config.detailFieldName}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={config.detailPlaceholder}
                    placeholderTextColor="rgba(138,138,133,0.5)"
                    value={newDetail}
                    onChangeText={setNewDetail}
                    returnKeyType="done"
                    onSubmitEditing={handleAdd}
                    keyboardType={columnType === 'contacts' ? 'phone-pad' : 'default'}
                  />
                </View>
                <View style={styles.addFormActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => {
                      setShowAddForm(false);
                      setNewLabel('');
                      setNewDetail('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelBtnText}>CANCEL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.confirmBtn,
                      isContacts && styles.confirmBtnContact,
                      !newLabel.trim() && styles.confirmBtnDisabled,
                    ]}
                    onPress={handleAdd}
                    activeOpacity={0.7}
                    disabled={!newLabel.trim()}
                  >
                    <Ionicons
                      name="add-circle"
                      size={14}
                      color={newLabel.trim() ? '#0B0F12' : 'rgba(11,15,18,0.5)'}
                    />
                    <Text style={[styles.confirmBtnText, !newLabel.trim() && { opacity: 0.5 }]}>
                      ADD
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.addButton, isContacts && styles.addButtonContact]}
                onPress={() => setShowAddForm(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={16} color={accentColor} />
                <Text style={[styles.addButtonText, { color: accentColor }]}>
                  ADD {config.singularLabel}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </ECSModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  panelWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: TACTICAL.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    // maxHeight and paddingBottom are now set dynamically via useSheetLayout
  },
  dragHandle: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.2)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  headerSub: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Scroll
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    // paddingBottom is now set dynamically via useSheetLayout contentBottomPadding
  },

  // Group labels
  groupLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 8,
  },

  // Entry rows
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.15)',
  },
  entryRowContact: {
    borderColor: 'rgba(192,57,43,0.1)',
    backgroundColor: 'rgba(192,57,43,0.03)',
  },
  entryRowCustom: {
    borderColor: 'rgba(196,138,44,0.2)',
    backgroundColor: 'rgba(196,138,44,0.04)',
  },
  entryRowCustomContact: {
    borderColor: 'rgba(192,57,43,0.2)',
    backgroundColor: 'rgba(192,57,43,0.05)',
  },
  entryDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: TACTICAL.textMuted,
  },
  entryTextBlock: {
    flex: 1,
  },
  entryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(230,230,225,0.7)',
  },
  entryDetail: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  entryDetailContact: {
    fontFamily: 'Courier',
    fontWeight: '700',
    color: TACTICAL.danger,
    fontSize: 11,
  },
  lockBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(192,57,43,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.2)',
  },

  // Add button
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(196,138,44,0.3)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(196,138,44,0.04)',
  },
  addButtonContact: {
    borderColor: 'rgba(192,57,43,0.3)',
    backgroundColor: 'rgba(192,57,43,0.04)',
  },
  addButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },

  // Add form
  addForm: {
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(196,138,44,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
  },
  addFormContact: {
    backgroundColor: 'rgba(192,57,43,0.06)',
    borderColor: 'rgba(192,57,43,0.2)',
  },
  addFormTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
    marginBottom: 10,
  },
  inputRow: {
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.3)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.text,
  },
  addFormActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.2)',
  },
  cancelBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber,
  },
  confirmBtnContact: {
    backgroundColor: TACTICAL.danger,
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1,
  },
});




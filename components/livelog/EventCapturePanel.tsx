/**
 * EventCapturePanel — Event input panel for the Live Log
 *
 * Contains:
 * - Quick event type buttons (NOTE, RISK, MECH, MED, NAV, SUPPLY)
 * - Severity dropdown (LOW, MED, HIGH, CRITICAL)
 * - Single-line text input for details
 * - Add button (disabled when details empty or expedition closed)
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  ScrollView, ActivityIndicator, Modal,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  EVENT_TYPE_META,
  SEVERITY_META,
  type EventType,
  type EventSeverity,
} from '../../lib/expeditionEventStore';

// Quick-access event types for the capture panel
const QUICK_TYPES: EventType[] = ['NOTE', 'RISK', 'MECH', 'MED', 'NAV', 'SUPPLY'];
const SEVERITIES: EventSeverity[] = ['LOW', 'MED', 'HIGH', 'CRITICAL'];

interface Props {
  selectedEventType: EventType;
  selectedSeverity: EventSeverity;
  detailsText: string;
  isSaving: boolean;
  isDisabled: boolean; // true when expedition is CLOSED
  onTypeChange: (type: EventType) => void;
  onSeverityChange: (sev: EventSeverity) => void;
  onDetailsChange: (text: string) => void;
  onSubmit: () => void;
}

export default function EventCapturePanel({
  selectedEventType,
  selectedSeverity,
  detailsText,
  isSaving,
  isDisabled,
  onTypeChange,
  onSeverityChange,
  onDetailsChange,
  onSubmit,
}: Props) {
  const [sevDropdownOpen, setSevDropdownOpen] = useState(false);

  const canSubmit = detailsText.trim().length > 0 && !isDisabled && !isSaving;
  const activeMeta = EVENT_TYPE_META[selectedEventType];
  const activeSev = SEVERITY_META[selectedSeverity];

  return (
    <View style={styles.container}>
      {/* Section label */}
      <Text style={styles.sectionLabel}>LOG EVENT</Text>

      {/* Quick type buttons */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.typeRow}
      >
        {QUICK_TYPES.map((type) => {
          const meta = EVENT_TYPE_META[type];
          const isActive = selectedEventType === type;
          return (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeBtn,
                isActive && {
                  borderColor: meta.color,
                  backgroundColor: `${meta.color}12`,
                },
              ]}
              onPress={() => onTypeChange(type)}
              activeOpacity={0.7}
              disabled={isDisabled}
            >
              <Ionicons
                name={meta.icon}
                size={14}
                color={isActive ? meta.color : TACTICAL.textMuted}
              />
              <Text
                style={[
                  styles.typeBtnText,
                  isActive && { color: meta.color },
                ]}
              >
                {meta.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Input row: severity + details + add */}
      <View style={styles.inputRow}>
        {/* Severity button */}
        <TouchableOpacity
          style={[styles.sevBtn, { borderColor: `${activeSev.color}40` }]}
          onPress={() => setSevDropdownOpen(true)}
          activeOpacity={0.7}
          disabled={isDisabled}
        >
          <View style={[styles.sevDot, { backgroundColor: activeSev.color }]} />
          <Text style={[styles.sevBtnText, { color: activeSev.color }]}>
            {activeSev.label}
          </Text>
          <Ionicons name="chevron-down" size={10} color={activeSev.color} />
        </TouchableOpacity>

        {/* Details input */}
        <TextInput
          style={styles.input}
          value={detailsText}
          onChangeText={onDetailsChange}
          placeholder="Event details..."
          placeholderTextColor={TACTICAL.textMuted}
          editable={!isDisabled}
          returnKeyType="send"
          onSubmitEditing={() => canSubmit && onSubmit()}
        />

        {/* Add button */}
        <TouchableOpacity
          style={[
            styles.addBtn,
            canSubmit
              ? { backgroundColor: activeMeta.color }
              : { backgroundColor: 'rgba(138,138,133,0.15)' },
          ]}
          onPress={onSubmit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#0B0F12" />
          ) : (
            <Ionicons
              name="add"
              size={18}
              color={canSubmit ? '#0B0F12' : TACTICAL.textMuted}
            />
          )}
        </TouchableOpacity>
      </View>

      {/* Severity Dropdown Modal */}
      <Modal
        visible={sevDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSevDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.dropdownOverlay}
          activeOpacity={1}
          onPress={() => setSevDropdownOpen(false)}
        >
          <View style={styles.dropdownCard}>
            <Text style={styles.dropdownTitle}>SEVERITY</Text>
            {SEVERITIES.map((sev) => {
              const meta = SEVERITY_META[sev];
              const isActive = selectedSeverity === sev;
              return (
                <TouchableOpacity
                  key={sev}
                  style={[
                    styles.dropdownItem,
                    isActive && { backgroundColor: meta.bg, borderColor: `${meta.color}30` },
                  ]}
                  onPress={() => {
                    onSeverityChange(sev);
                    setSevDropdownOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.dropdownDot, { backgroundColor: meta.color }]} />
                  <Text
                    style={[
                      styles.dropdownItemText,
                      { color: isActive ? meta.color : TACTICAL.text },
                    ]}
                  >
                    {meta.label}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark" size={14} color={meta.color} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.15)',
  },

  sectionLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2.5,
    marginBottom: 8,
  },

  // Type buttons row
  typeRow: {
    gap: 6,
    paddingBottom: 8,
  },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  typeBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Severity button
  sevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  sevDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sevBtnText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  // Text input
  input: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 12,
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '500',
  },

  // Add button
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Dropdown overlay
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownCard: {
    width: 220,
    backgroundColor: TACTICAL.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 12,
    gap: 4,
  },
  dropdownTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2.5,
    marginBottom: 6,
    textAlign: 'center',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dropdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dropdownItemText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});




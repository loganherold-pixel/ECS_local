import React, { useState, useCallback, useRef, useEffect } from 'react';

import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  TextInput, ScrollView, Platform, ActivityIndicator, Switch,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import {
  EVENT_TYPE_META,
  ALL_EVENT_TYPES,
  EMPTY_COMPOSE_FORM,
  validateComposeForm,
  hasValidationErrors,
} from '../../lib/dispatchTypes';
import type {
  ComposeEventForm,
  DispatchEventType,
  DispatchPriority,
  ValidationErrors,
} from '../../lib/dispatchTypes';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (form: ComposeEventForm) => Promise<void>;
  isArchived: boolean;
  /** Whether the user is currently offline */
  isOffline?: boolean;
}

export default function ComposeEventModal({ visible, onClose, onSubmit, isArchived, isOffline }: Props) {
  const [form, setForm] = useState<ComposeEventForm>({ ...EMPTY_COMPOSE_FORM });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState(false);

  // Mounted ref to prevent setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const updateField = useCallback(<K extends keyof ComposeEventForm>(key: K, value: ComposeEventForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    // Clear error for this field
    if (errors[key as keyof ValidationErrors]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[key as keyof ValidationErrors];
        return next;
      });
    }
  }, [errors]);

  const handleSubmit = async () => {
    const validationErrors = validateComposeForm(form);
    if (hasValidationErrors(validationErrors)) {
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    try {
      await onSubmit(form);
      if (!mountedRef.current) return;
      // Reset form on success
      setForm({ ...EMPTY_COMPOSE_FORM });
      setErrors({});
    } catch (ex: any) {
      console.warn('[ComposeEventModal] handleSubmit exception:', ex?.message || ex);
    }
    if (mountedRef.current) setSaving(false);
  };

  const handleClose = () => {
    setForm({ ...EMPTY_COMPOSE_FORM });
    setErrors({});
    onClose();
  };



  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="create-outline" size={16} color={TACTICAL.amber} />
              <Text style={styles.headerTitle}>NEW DISPATCH</Text>
              {isOffline && (
                <View style={styles.offlineHeaderChip}>
                  <View style={styles.offlineHeaderDot} />
                  <Text style={styles.offlineHeaderText}>OFFLINE</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Offline Banner */}
          {isOffline && (
            <View style={styles.offlineBanner}>
              <Ionicons name="cloud-offline-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.offlineBannerText}>
                You're offline. This event will be queued and sent automatically when you reconnect.
              </Text>
            </View>
          )}

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Event Type Selector */}
            <Text style={styles.fieldLabel}>EVENT TYPE</Text>
            <View style={styles.typeGrid}>
              {ALL_EVENT_TYPES.map((type) => {
                const meta = EVENT_TYPE_META[type];
                const isSelected = form.event_type === type;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeChip,
                      isSelected && { borderColor: meta.color, backgroundColor: `${meta.color}12` },
                    ]}
                    onPress={() => updateField('event_type', type)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={meta.icon as any}
                      size={13}
                      color={isSelected ? meta.color : TACTICAL.textMuted}
                    />
                    <Text style={[
                      styles.typeChipText,
                      isSelected && { color: meta.color },
                    ]}>
                      {meta.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Priority Toggle */}
            <Text style={styles.fieldLabel}>PRIORITY</Text>
            <View style={styles.priorityRow}>
              <TouchableOpacity
                style={[
                  styles.priorityBtn,
                  form.priority === 'normal' && styles.priorityBtnActive,
                ]}
                onPress={() => updateField('priority', 'normal')}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.priorityBtnText,
                  form.priority === 'normal' && styles.priorityBtnTextActive,
                ]}>
                  NORMAL
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.priorityBtn,
                  styles.priorityCriticalBtn,
                  form.priority === 'critical' && styles.priorityCriticalBtnActive,
                ]}
                onPress={() => updateField('priority', 'critical')}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.priorityBtnText,
                  form.priority === 'critical' && styles.priorityCriticalBtnTextActive,
                ]}>
                  CRITICAL
                </Text>
              </TouchableOpacity>
            </View>

            {/* Headline */}
            <Text style={styles.fieldLabel}>HEADLINE *</Text>
            <TextInput
              style={[styles.input, errors.headline && styles.inputError]}
              value={form.headline}
              onChangeText={(v) => updateField('headline', v)}
              placeholder="Brief summary (max 80 chars)"
              placeholderTextColor={TACTICAL.textMuted}
              maxLength={80}
            />
            {errors.headline && <Text style={styles.errorText}>{errors.headline}</Text>}
            <Text style={styles.charCount}>{form.headline.length}/80</Text>

            {/* Detail */}
            <Text style={styles.fieldLabel}>DETAIL</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline, errors.detail && styles.inputError]}
              value={form.detail}
              onChangeText={(v) => updateField('detail', v)}
              placeholder="Additional details (optional, max 400 chars)"
              placeholderTextColor={TACTICAL.textMuted}
              multiline
              maxLength={400}
              textAlignVertical="top"
            />
            {errors.detail && <Text style={styles.errorText}>{errors.detail}</Text>}
            <Text style={styles.charCount}>{form.detail.length}/400</Text>

            {/* Location Toggle */}
            <View style={styles.locationToggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>LOCATION</Text>
                <Text style={styles.fieldHint}>Attach coordinates to this event</Text>
              </View>
              <Switch
                value={form.location_enabled}
                onValueChange={(v) => updateField('location_enabled', v)}
                trackColor={{ false: 'rgba(0,0,0,0.3)', true: `${TACTICAL.accent}80` }}
                thumbColor={form.location_enabled ? TACTICAL.amber : TACTICAL.textMuted}
              />
            </View>

            {/* Location Fields */}
            {form.location_enabled && (
              <View style={styles.locationFields}>
                <TextInput
                  style={[styles.input, { marginBottom: 8 }]}
                  value={form.location_label}
                  onChangeText={(v) => updateField('location_label', v)}
                  placeholder='Label (e.g. "Trailhead")'
                  placeholderTextColor={TACTICAL.textMuted}
                />
                <View style={styles.coordRow}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={[styles.input, errors.latitude && styles.inputError]}
                      value={form.latitude}
                      onChangeText={(v) => updateField('latitude', v)}
                      placeholder="Latitude"
                      placeholderTextColor={TACTICAL.textMuted}
                      keyboardType="numeric"
                    />
                    {errors.latitude && <Text style={styles.errorText}>{errors.latitude}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={[styles.input, errors.longitude && styles.inputError]}
                      value={form.longitude}
                      onChangeText={(v) => updateField('longitude', v)}
                      placeholder="Longitude"
                      placeholderTextColor={TACTICAL.textMuted}
                      keyboardType="numeric"
                    />
                    {errors.longitude && <Text style={styles.errorText}>{errors.longitude}</Text>}
                  </View>
                </View>
              </View>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                saving && { opacity: 0.6 },
                isOffline && styles.submitBtnOffline,
              ]}
              onPress={handleSubmit}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#0B0F12" />
              ) : isOffline ? (
                <Ionicons name="cloud-upload-outline" size={15} color="#0B0F12" />
              ) : (
                <Ionicons name="send-outline" size={15} color="#0B0F12" />
              )}
              <Text style={styles.submitBtnText}>
                {saving
                  ? (isOffline ? 'QUEUING...' : 'POSTING...')
                  : (isOffline ? 'QUEUE FOR LATER' : 'POST TO FEED')}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  offlineHeaderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(229, 57, 53, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.2)',
  },
  offlineHeaderDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E53935',
  },
  offlineHeaderText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#E53935',
    letterSpacing: 1,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
  },
  offlineBannerText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.amber,
    lineHeight: 15,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: Platform.OS === 'web' ? 24 : 44,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 8,
    marginTop: 4,
  },
  fieldHint: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 2,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  typeChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  priorityBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    alignItems: 'center',
  },
  priorityBtnActive: {
    borderColor: TACTICAL.accent,
    backgroundColor: `${TACTICAL.accent}20`,
  },
  priorityBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  priorityBtnTextActive: {
    color: TACTICAL.text,
  },
  priorityCriticalBtn: {},
  priorityCriticalBtnActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
  },
  priorityCriticalBtnTextActive: {
    color: TACTICAL.amber,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 10,
    padding: 12,
    color: TACTICAL.text,
    fontSize: 13,
    marginBottom: 4,
  },
  inputMultiline: {
    height: 80,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: TACTICAL.borderError,
  },
  errorText: {
    fontSize: 10,
    color: TACTICAL.danger,
    marginBottom: 2,
    marginLeft: 2,
  },
  charCount: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    textAlign: 'right',
    marginBottom: 10,
    fontFamily: 'Courier',
  },
  locationToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 6,
  },
  locationFields: {
    marginBottom: 14,
    paddingLeft: 4,
  },
  coordRow: {
    flexDirection: 'row',
    gap: 8,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
    marginTop: 8,
  },
  submitBtnOffline: {
    backgroundColor: '#B07A1C',
  },
  submitBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.5,
  },
});




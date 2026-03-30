/**
 * CreateCustomWidgetModal
 *
 * Full-screen modal for building a custom dashboard widget.
 * Steps: Name → Icon → Data Fields → Thresholds → Save
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import {
  customWidgetStore,
  ICON_OPTIONS,
  DATA_FIELD_GROUPS,
  AVAILABLE_DATA_FIELDS,
  type CustomWidgetDefinition,
  type ThresholdConfig,
} from '../../lib/customWidgetStore';

interface Props {
  visible: boolean;
  editWidget?: CustomWidgetDefinition | null;
  onSave: (widget: CustomWidgetDefinition) => void;
  onClose: () => void;
}

const SCREEN_H = Dimensions.get('window').height;

export default function CreateCustomWidgetModal({ visible, editWidget, onSave, onClose }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('analytics-outline');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [thresholdEnabled, setThresholdEnabled] = useState(false);
  const [thresholdField, setThresholdField] = useState('');
  const [greenAbove, setGreenAbove] = useState('80');
  const [amberAbove, setAmberAbove] = useState('40');
  const [activeSection, setActiveSection] = useState<'name' | 'icon' | 'fields' | 'thresholds'>('name');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Populate form when editing
  useEffect(() => {
    if (editWidget) {
      setName(editWidget.name);
      setDescription(editWidget.description);
      setIcon(editWidget.icon);
      setSelectedFields(editWidget.dataFields);
      setThresholdEnabled(editWidget.thresholds.enabled);
      setThresholdField(editWidget.thresholds.targetField);
      setGreenAbove(String(editWidget.thresholds.greenAbove));
      setAmberAbove(String(editWidget.thresholds.amberAbove));
    } else {
      resetForm();
    }
  }, [editWidget, visible]);

  // Animate
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 12, tension: 65, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  function resetForm() {
    setName('');
    setDescription('');
    setIcon('analytics-outline');
    setSelectedFields([]);
    setThresholdEnabled(false);
    setThresholdField('');
    setGreenAbove('80');
    setAmberAbove('40');
    setActiveSection('name');
    setErrors({});
  }

  function toggleField(fieldKey: string) {
    setSelectedFields(prev =>
      prev.includes(fieldKey)
        ? prev.filter(f => f !== fieldKey)
        : prev.length < 6 ? [...prev, fieldKey] : prev
    );
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Widget name is required';
    if (selectedFields.length === 0) newErrors.fields = 'Select at least one data field';
    if (thresholdEnabled && !thresholdField) newErrors.threshold = 'Select a threshold target field';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSave() {
    if (!validate()) return;

    const thresholds: ThresholdConfig = {
      enabled: thresholdEnabled,
      targetField: thresholdField,
      greenAbove: parseFloat(greenAbove) || 80,
      amberAbove: parseFloat(amberAbove) || 40,
    };

    if (editWidget) {
      const updated = customWidgetStore.update(editWidget.id, {
        name: name.trim(),
        icon,
        description: description.trim(),
        dataFields: selectedFields,
        thresholds,
      });
      if (updated) onSave(updated);
    } else {
      const created = customWidgetStore.create({
        name: name.trim(),
        icon,
        description: description.trim() || `Custom widget: ${name.trim()}`,
        dataFields: selectedFields,
        thresholds,
      });
      onSave(created);
    }

    resetForm();
  }

  // Get numeric fields for threshold target picker
  const numericFields = selectedFields
    .map(fk => AVAILABLE_DATA_FIELDS.find(f => f.field === fk))
    .filter(f => f && f.format !== 'text');

  if (!visible) return null;

  const sections = [
    { key: 'name' as const, label: 'NAME', icon: 'text-outline' },
    { key: 'icon' as const, label: 'ICON', icon: 'color-palette-outline' },
    { key: 'fields' as const, label: 'DATA', icon: 'list-outline' },
    { key: 'thresholds' as const, label: 'ALERTS', icon: 'color-filter-outline' },
  ];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      <Animated.View style={[styles.panel, { transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIconBox}>
            <Ionicons name="create-outline" size={18} color={TACTICAL.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>
              {editWidget ? 'EDIT CUSTOM WIDGET' : 'CREATE CUSTOM WIDGET'}
            </Text>
            <Text style={styles.headerSubtitle}>Define your own dashboard metric</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Section Tabs */}
        <View style={styles.sectionTabs}>
          {sections.map((sec, idx) => {
            const isActive = sec.key === activeSection;
            const hasError = (sec.key === 'name' && errors.name) ||
              (sec.key === 'fields' && errors.fields) ||
              (sec.key === 'thresholds' && errors.threshold);
            return (
              <TouchableOpacity
                key={sec.key}
                style={[styles.sectionTab, isActive && styles.sectionTabActive]}
                onPress={() => setActiveSection(sec.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={sec.icon as any}
                  size={12}
                  color={hasError ? TACTICAL.danger : isActive ? TACTICAL.amber : TACTICAL.textMuted}
                />
                <Text style={[
                  styles.sectionTabLabel,
                  isActive && styles.sectionTabLabelActive,
                  hasError ? { color: TACTICAL.danger } : null,
                ]}>
                  {sec.label}
                </Text>
                {isActive && <View style={styles.sectionIndicator} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── NAME SECTION ── */}
            {activeSection === 'name' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>WIDGET NAME</Text>
                <TextInput
                  style={[styles.input, errors.name ? styles.inputError : null]}
                  value={name}
                  onChangeText={(t) => { setName(t); setErrors(e => ({ ...e, name: '' })); }}
                  placeholder="e.g., Fuel Monitor, Water Tracker"
                  placeholderTextColor="rgba(138,138,133,0.5)"
                  maxLength={30}
                />
                {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
                <Text style={styles.charCount}>{name.length}/30</Text>

                <Text style={[styles.sectionTitle, { marginTop: 20 }]}>DESCRIPTION</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Brief description of what this widget tracks..."
                  placeholderTextColor="rgba(138,138,133,0.5)"
                  multiline
                  numberOfLines={3}
                  maxLength={100}
                />
                <Text style={styles.charCount}>{description.length}/100</Text>

                {/* Preview */}
                <View style={styles.previewBox}>
                  <Text style={styles.previewLabel}>PREVIEW</Text>
                  <View style={styles.previewCard}>
                    <View style={styles.previewHeader}>
                      <Ionicons name={icon as any} size={14} color={TACTICAL.amber} />
                      <Text style={styles.previewName}>{name || 'Widget Name'}</Text>
                    </View>
                    <Text style={styles.previewDesc}>
                      {description || 'Widget description will appear here'}
                    </Text>
                    {selectedFields.length > 0 && (
                      <View style={styles.previewFields}>
                        {selectedFields.slice(0, 3).map(fk => {
                          const fd = AVAILABLE_DATA_FIELDS.find(f => f.field === fk);
                          return (
                            <View key={fk} style={styles.previewFieldRow}>
                              <Text style={styles.previewFieldLabel}>{fd?.label || fk}</Text>
                              <Text style={styles.previewFieldValue}>--{fd?.unit ? ` ${fd.unit}` : ''}</Text>
                            </View>
                          );
                        })}
                        {selectedFields.length > 3 && (
                          <Text style={styles.previewMore}>+{selectedFields.length - 3} more</Text>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}

            {/* ── ICON SECTION ── */}
            {activeSection === 'icon' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>CHOOSE AN ICON</Text>
                <Text style={styles.sectionHint}>Select an icon that represents this widget</Text>
                <View style={styles.iconGrid}>
                  {ICON_OPTIONS.map(opt => {
                    const isSelected = icon === opt.name;
                    return (
                      <TouchableOpacity
                        key={opt.name}
                        style={[styles.iconCell, isSelected && styles.iconCellSelected]}
                        onPress={() => setIcon(opt.name)}
                        activeOpacity={0.6}
                      >
                        <Ionicons
                          name={opt.name as any}
                          size={22}
                          color={isSelected ? TACTICAL.amber : TACTICAL.textMuted}
                        />
                        <Text style={[
                          styles.iconLabel,
                          isSelected && { color: TACTICAL.amber },
                        ]} numberOfLines={1}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── DATA FIELDS SECTION ── */}
            {activeSection === 'fields' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>DATA FIELDS</Text>
                <Text style={styles.sectionHint}>
                  Select up to 6 data fields to display ({selectedFields.length}/6 selected)
                </Text>
                {errors.fields ? <Text style={styles.errorText}>{errors.fields}</Text> : null}

                {DATA_FIELD_GROUPS.map(group => (
                  <View key={group.source}>
                    <Text style={styles.fieldGroupLabel}>{group.label}</Text>
                    {group.fields.map(field => {
                      const isSelected = selectedFields.includes(field.field);
                      return (
                        <TouchableOpacity
                          key={field.field}
                          style={[styles.fieldRow, isSelected && styles.fieldRowSelected]}
                          onPress={() => { toggleField(field.field); setErrors(e => ({ ...e, fields: '' })); }}
                          activeOpacity={0.6}
                        >
                          <View style={[styles.fieldCheckbox, isSelected && styles.fieldCheckboxChecked]}>
                            {isSelected && (
                              <Ionicons name="checkmark" size={12} color={TACTICAL.bg} />
                            )}
                          </View>
                          <View style={styles.fieldInfo}>
                            <Text style={[styles.fieldName, isSelected && { color: TACTICAL.text }]}>
                              {field.label}
                            </Text>
                            <Text style={styles.fieldMeta}>
                              {field.source.toUpperCase()} {field.unit ? `· ${field.unit}` : ''}
                            </Text>
                          </View>
                          <View style={[styles.fieldFormatBadge, {
                            backgroundColor: field.format === 'text'
                              ? 'rgba(138,138,133,0.1)'
                              : 'rgba(62,79,60,0.15)',
                          }]}>
                            <Text style={[styles.fieldFormatText, {
                              color: field.format === 'text' ? TACTICAL.textMuted : TACTICAL.accent,
                            }]}>
                              {field.format.toUpperCase()}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}

            {/* ── THRESHOLDS SECTION ── */}
            {activeSection === 'thresholds' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>THRESHOLD COLORS</Text>
                <Text style={styles.sectionHint}>
                  Set color-coded alerts based on a numeric field value
                </Text>

                {/* Enable toggle */}
                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => setThresholdEnabled(!thresholdEnabled)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.toggle, thresholdEnabled && styles.toggleActive]}>
                    <View style={[styles.toggleDot, thresholdEnabled && styles.toggleDotActive]} />
                  </View>
                  <Text style={styles.toggleLabel}>Enable threshold colors</Text>
                </TouchableOpacity>

                {thresholdEnabled && (
                  <View style={styles.thresholdConfig}>
                    {/* Target field picker */}
                    <Text style={styles.thresholdSubtitle}>TARGET FIELD</Text>
                    {errors.threshold ? <Text style={styles.errorText}>{errors.threshold}</Text> : null}
                    {numericFields.length === 0 ? (
                      <Text style={styles.thresholdHint}>
                        Select numeric data fields in the DATA tab first
                      </Text>
                    ) : (
                      <View style={styles.thresholdFieldList}>
                        {numericFields.map(fd => {
                          if (!fd) return null;
                          const isTarget = thresholdField === fd.field;
                          return (
                            <TouchableOpacity
                              key={fd.field}
                              style={[styles.thresholdFieldBtn, isTarget && styles.thresholdFieldBtnActive]}
                              onPress={() => { setThresholdField(fd.field); setErrors(e => ({ ...e, threshold: '' })); }}
                              activeOpacity={0.7}
                            >
                              <Text style={[
                                styles.thresholdFieldBtnText,
                                isTarget && { color: TACTICAL.amber },
                              ]}>
                                {fd.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    {/* Color ranges */}
                    <Text style={[styles.thresholdSubtitle, { marginTop: 16 }]}>COLOR RANGES</Text>
                    <Text style={styles.thresholdHint}>
                      Values are evaluated top-down: green first, then amber, then red
                    </Text>

                    {/* Green */}
                    <View style={styles.colorRangeRow}>
                      <View style={[styles.colorDot, { backgroundColor: '#4CAF50' }]} />
                      <Text style={[styles.colorLabel, { color: '#4CAF50' }]}>GREEN</Text>
                      <Text style={styles.colorOp}>value &ge;</Text>
                      <TextInput
                        style={styles.colorInput}
                        value={greenAbove}
                        onChangeText={setGreenAbove}
                        keyboardType="numeric"
                        placeholderTextColor="rgba(138,138,133,0.5)"
                      />
                    </View>

                    {/* Amber */}
                    <View style={styles.colorRangeRow}>
                      <View style={[styles.colorDot, { backgroundColor: TACTICAL.amber }]} />
                      <Text style={[styles.colorLabel, { color: TACTICAL.amber }]}>AMBER</Text>
                      <Text style={styles.colorOp}>value &ge;</Text>
                      <TextInput
                        style={styles.colorInput}
                        value={amberAbove}
                        onChangeText={setAmberAbove}
                        keyboardType="numeric"
                        placeholderTextColor="rgba(138,138,133,0.5)"
                      />
                    </View>

                    {/* Red */}
                    <View style={styles.colorRangeRow}>
                      <View style={[styles.colorDot, { backgroundColor: TACTICAL.danger }]} />
                      <Text style={[styles.colorLabel, { color: TACTICAL.danger }]}>RED</Text>
                      <Text style={styles.colorOp}>below amber</Text>
                      <View style={styles.colorInputPlaceholder}>
                        <Text style={styles.colorInputPlaceholderText}>auto</Text>
                      </View>
                    </View>

                    {/* Visual preview */}
                    <View style={styles.thresholdPreview}>
                      <Text style={styles.thresholdPreviewTitle}>THRESHOLD PREVIEW</Text>
                      <View style={styles.thresholdBar}>
                        <View style={[styles.thresholdSegment, {
                          backgroundColor: 'rgba(192,57,43,0.3)',
                          flex: parseFloat(amberAbove) || 40,
                        }]}>
                          <Text style={[styles.thresholdSegLabel, { color: TACTICAL.danger }]}>RED</Text>
                        </View>
                        <View style={[styles.thresholdSegment, {
                          backgroundColor: 'rgba(196,138,44,0.3)',
                          flex: (parseFloat(greenAbove) || 80) - (parseFloat(amberAbove) || 40),
                        }]}>
                          <Text style={[styles.thresholdSegLabel, { color: TACTICAL.amber }]}>AMB</Text>
                        </View>
                        <View style={[styles.thresholdSegment, {
                          backgroundColor: 'rgba(76,175,80,0.3)',
                          flex: 100 - (parseFloat(greenAbove) || 80),
                        }]}>
                          <Text style={[styles.thresholdSegLabel, { color: '#4CAF50' }]}>GRN</Text>
                        </View>
                      </View>
                      <View style={styles.thresholdScale}>
                        <Text style={styles.thresholdScaleText}>0</Text>
                        <Text style={styles.thresholdScaleText}>{amberAbove}</Text>
                        <Text style={styles.thresholdScaleText}>{greenAbove}</Text>
                        <Text style={styles.thresholdScaleText}>100+</Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            )}

            <View style={{ height: 120 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Save Button */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, (!name.trim() || selectedFields.length === 0) && styles.saveBtnDisabled]}
            onPress={handleSave}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark-circle" size={16} color={TACTICAL.bg} />
            <Text style={styles.saveText}>{editWidget ? 'UPDATE WIDGET' : 'CREATE WIDGET'}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.88,
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: TACTICAL.border,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  headerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(196,138,44,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  headerSubtitle: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  closeBtn: { padding: 4 },

  // Section tabs
  sectionTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  sectionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.02)',
    position: 'relative',
  },
  sectionTabActive: {
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  sectionTabLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
  sectionTabLabelActive: {
    color: TACTICAL.amber,
  },
  sectionIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    borderRadius: 1,
    backgroundColor: TACTICAL.amber,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12 },

  // Section
  section: {},
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    marginBottom: 12,
    lineHeight: 16,
  },

  // Input
  input: {
    backgroundColor: TACTICAL.bg,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: TACTICAL.text,
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: TACTICAL.danger,
  },
  charCount: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  errorText: {
    fontSize: 10,
    color: TACTICAL.danger,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 4,
  },

  // Preview
  previewBox: {
    marginTop: 20,
    borderRadius: 12,
    backgroundColor: TACTICAL.bg,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 14,
  },
  previewLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 8,
  },
  previewCard: {
    borderRadius: 10,
    backgroundColor: TACTICAL.panel,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 12,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  previewName: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
  previewDesc: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginBottom: 6,
  },
  previewFields: {
    gap: 2,
  },
  previewFieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  previewFieldLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  previewFieldValue: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  previewMore: {
    fontSize: 8,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // Icon grid
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconCell: {
    width: 68,
    height: 68,
    borderRadius: 12,
    backgroundColor: TACTICAL.bg,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconCellSelected: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196,138,44,0.08)',
    borderWidth: 2,
  },
  iconLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // Field rows
  fieldGroupLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
    marginTop: 14,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,138,44,0.15)',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: TACTICAL.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 12,
    marginBottom: 6,
  },
  fieldRowSelected: {
    borderColor: TACTICAL.accent,
    backgroundColor: 'rgba(62,79,60,0.08)',
  },
  fieldCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: TACTICAL.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldCheckboxChecked: {
    backgroundColor: TACTICAL.accent,
    borderColor: TACTICAL.accent,
  },
  fieldInfo: { flex: 1 },
  fieldName: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    marginBottom: 1,
  },
  fieldMeta: {
    fontSize: 9,
    color: 'rgba(138,138,133,0.6)',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  fieldFormatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fieldFormatText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Threshold toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingVertical: 8,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleActive: {
    backgroundColor: 'rgba(62,79,60,0.4)',
  },
  toggleDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: TACTICAL.textMuted,
  },
  toggleDotActive: {
    backgroundColor: '#4CAF50',
    alignSelf: 'flex-end',
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
  },

  // Threshold config
  thresholdConfig: {},
  thresholdSubtitle: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  thresholdHint: {
    fontSize: 10,
    color: 'rgba(138,138,133,0.6)',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  thresholdFieldList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  thresholdFieldBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: TACTICAL.bg,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  thresholdFieldBtnActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  thresholdFieldBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },

  // Color ranges
  colorRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingVertical: 6,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  colorLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    width: 48,
  },
  colorOp: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    flex: 1,
  },
  colorInput: {
    width: 70,
    backgroundColor: TACTICAL.bg,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.text,
    textAlign: 'center',
  },
  colorInputPlaceholder: {
    width: 70,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  colorInputPlaceholderText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
  },

  // Threshold preview
  thresholdPreview: {
    marginTop: 16,
    backgroundColor: TACTICAL.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 12,
  },
  thresholdPreviewTitle: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 8,
  },
  thresholdBar: {
    flexDirection: 'row',
    height: 24,
    borderRadius: 6,
    overflow: 'hidden',
  },
  thresholdSegment: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thresholdSegLabel: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },
  thresholdScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  thresholdScaleText: {
    fontSize: 8,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveText: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.bg,
    letterSpacing: 1.5,
  },
});




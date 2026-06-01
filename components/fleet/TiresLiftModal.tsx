// ============================================================
// TIRES / LIFT CONFIGURATION MODAL
// ============================================================
// Vehicle-specific tire size and suspension lift/level editor.
// Opened from Fleet vehicle card → "TIRES / LIFT" button.
//
// Features:
//   - Tire size selector (29", 31", 33", 35", 37", 40")
//   - Suspension config (Stock, Leveled, 2"–6" Lift)
//   - Custom tire size input
//   - Persists to tiresLiftStore per vehicle
//   - Compact summary shown on Fleet card after save
//
// ECS tactical design: dark panels, gold accents, clean layout.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import TacticalPopupShell from '../TacticalPopupShell';
import { TACTICAL, GOLD_RAIL } from '../../lib/theme';
import {
  tiresLiftStore,
  TIRE_SIZE_OPTIONS,
  SUSPENSION_OPTIONS,
  DEFAULT_TIRES_LIFT,
  type TiresLiftConfig,
} from '../../lib/tiresLiftStore';
import type { Vehicle } from '../../lib/types';

interface Props {
  visible: boolean;
  vehicle: Vehicle | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}

export default function TiresLiftModal({ visible, vehicle, onClose, onSaved, showToast }: Props) {
  // ── Local state ─────────────────────────────────────────
  const [tireSizeInches, setTireSizeInches] = useState(0);
  const [suspensionLiftInches, setSuspensionLiftInches] = useState(0);
  const [isLeveled, setIsLeveled] = useState(false);
  const [customTireSize, setCustomTireSize] = useState('');
  const [showCustomTire, setShowCustomTire] = useState(false);

  // ── Load existing config when modal opens ───────────────
  useEffect(() => {
    if (visible && vehicle) {
      const existing = tiresLiftStore.get(vehicle.id);
      if (existing) {
        setTireSizeInches(existing.tireSizeInches);
        setSuspensionLiftInches(existing.suspensionLiftInches);
        setIsLeveled(existing.isLeveled);
        // Check if tire size is a custom value (not in presets)
        const isPreset = TIRE_SIZE_OPTIONS.some(o => o.value === existing.tireSizeInches);
        if (existing.tireSizeInches > 0 && !isPreset) {
          setShowCustomTire(true);
          setCustomTireSize(String(existing.tireSizeInches));
        } else {
          setShowCustomTire(false);
          setCustomTireSize('');
        }
      } else {
        // Reset to defaults
        setTireSizeInches(0);
        setSuspensionLiftInches(0);
        setIsLeveled(false);
        setShowCustomTire(false);
        setCustomTireSize('');
      }
    }
  }, [visible, vehicle]);

  // ── Handlers ────────────────────────────────────────────
  const handleSelectTireSize = useCallback((value: number) => {
    setTireSizeInches(value);
    setShowCustomTire(false);
    setCustomTireSize('');
  }, []);

  const handleCustomTireToggle = useCallback(() => {
    setShowCustomTire(true);
    setTireSizeInches(0);
  }, []);

  const handleCustomTireChange = useCallback((text: string) => {
    setCustomTireSize(text);
    const num = parseFloat(text);
    if (!isNaN(num) && num > 0 && num <= 60) {
      setTireSizeInches(num);
    }
  }, []);

  const handleSelectSuspension = useCallback((value: number, leveled?: boolean) => {
    setSuspensionLiftInches(value);
    setIsLeveled(!!leveled);
  }, []);

  const handleSave = useCallback(() => {
    if (!vehicle) return;

    const config: TiresLiftConfig = {
      tireSizeInches,
      suspensionLiftInches,
      isLeveled,
      updatedAt: new Date().toISOString(),
    };

    tiresLiftStore.set(vehicle.id, config);
    showToast('Tires / Lift saved');
    onSaved();
    onClose();
  }, [vehicle, tireSizeInches, suspensionLiftInches, isLeveled, showToast, onSaved, onClose]);

  const handleReset = useCallback(() => {
    if (!vehicle) return;
    tiresLiftStore.remove(vehicle.id);
    setTireSizeInches(0);
    setSuspensionLiftInches(0);
    setIsLeveled(false);
    setShowCustomTire(false);
    setCustomTireSize('');
    showToast('Tires / Lift reset to stock');
    onSaved();
  }, [vehicle, showToast, onSaved]);

  if (!vehicle) return null;

  // ── Derived state ───────────────────────────────────────
  const hasTires = tireSizeInches > 0;
  const hasLift = suspensionLiftInches > 0;
  const hasConfig = hasTires || hasLift || isLeveled;

  // Summary preview
  let previewText = 'Stock Configuration';
  if (hasTires || hasLift || isLeveled) {
    const parts: string[] = [];
    if (hasTires) parts.push(`${tireSizeInches}" Tires`);
    if (hasLift) parts.push(`${suspensionLiftInches}" Lift`);
    else if (isLeveled) parts.push('Leveled');
    previewText = parts.join('  /  ');
  }

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      icon="construct-outline"
      eyebrow="ECS VEHICLE SETUP"
      title="TIRES / LIFT"
      subtitle={vehicle.name}
      overlayClass="workflow"
      maxWidth={940}
      maxHeightFraction={0.9}
      minHeightFraction={0.76}
      scrollable={false}
      keyboardAware
      footer={
        <View style={s.footerRow}>
          <TouchableOpacity style={s.footerCancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={s.footerCancelText}>CANCEL</Text>
          </TouchableOpacity>
          {hasConfig ? (
            <TouchableOpacity style={s.footerResetBtn} onPress={handleReset} activeOpacity={0.7}>
              <Ionicons name="refresh-outline" size={14} color={TACTICAL.danger} />
              <Text style={s.footerResetText}>RESET</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={handleSave} style={s.footerSaveBtn} activeOpacity={0.8}>
            <Ionicons name="checkmark" size={16} color="#0B0F12" />
            <Text style={s.footerSaveText}>SAVE</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <KeyboardAvoidingView
        style={s.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Vehicle name bar */}
        <View style={s.vehicleBar}>
          <Ionicons name="car-sport-outline" size={14} color={TACTICAL.textMuted} />
          <Text style={s.vehicleBarText}>{vehicle.name}</Text>
          {hasConfig && (
            <TouchableOpacity onPress={handleReset} style={s.resetBtn} activeOpacity={0.7}>
              <Ionicons name="refresh-outline" size={12} color={TACTICAL.danger} />
              <Text style={s.resetBtnText}>RESET</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          style={s.scrollArea}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── TIRE SIZE SECTION ──────────────────────────── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="ellipse-outline" size={14} color={TACTICAL.amber} />
              <Text style={s.sectionTitle}>TIRE SIZE</Text>
            </View>
            <Text style={s.sectionDesc}>
              Select the overall tire diameter installed on your vehicle.
            </Text>

            <View style={s.optionsGrid}>
              {TIRE_SIZE_OPTIONS.map((opt) => {
                const isSelected = tireSizeInches === opt.value && !showCustomTire;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.optionBtn, isSelected && s.optionBtnSelected]}
                    onPress={() => handleSelectTireSize(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.optionBtnValue, isSelected && s.optionBtnValueSelected]}>
                      {opt.value}
                    </Text>
                    <Text style={[s.optionBtnUnit, isSelected && s.optionBtnUnitSelected]}>
                      INCH
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Custom option */}
              <TouchableOpacity
                style={[s.optionBtn, showCustomTire && s.optionBtnSelected]}
                onPress={handleCustomTireToggle}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="create-outline"
                  size={16}
                  color={showCustomTire ? '#0B0F12' : TACTICAL.textMuted}
                />
                <Text style={[s.optionBtnUnit, showCustomTire && s.optionBtnUnitSelected]}>
                  CUSTOM
                </Text>
              </TouchableOpacity>
            </View>

            {/* Custom tire size input */}
            {showCustomTire && (
              <View style={s.customInputRow}>
                <TextInput
                  style={s.customInput}
                  value={customTireSize}
                  onChangeText={handleCustomTireChange}
                  placeholder="e.g. 34"
                  placeholderTextColor="rgba(139, 148, 158, 0.5)"
                  keyboardType="numeric"
                  maxLength={4}
                />
                <Text style={s.customInputSuffix}>inches</Text>
              </View>
            )}
          </View>

          {/* ── SUSPENSION SECTION ─────────────────────────── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="resize-outline" size={14} color={TACTICAL.amber} />
              <Text style={s.sectionTitle}>SUSPENSION</Text>
            </View>
            <Text style={s.sectionDesc}>
              Select the suspension lift or leveling kit installed.
            </Text>

            <View style={s.suspensionList}>
              {SUSPENSION_OPTIONS.map((opt, idx) => {
                const isSelected = opt.isLeveled
                  ? (isLeveled && suspensionLiftInches === 0)
                  : (!opt.isLeveled && suspensionLiftInches === opt.value && !isLeveled);
                // Special case: stock = 0 lift + not leveled
                const isStock = opt.value === 0 && !opt.isLeveled;
                const isStockSelected = isStock && suspensionLiftInches === 0 && !isLeveled;
                const selected = opt.isLeveled ? isSelected : (isStock ? isStockSelected : isSelected);

                return (
                  <TouchableOpacity
                    key={`${opt.label}-${idx}`}
                    style={[s.suspensionRow, selected && s.suspensionRowSelected]}
                    onPress={() => handleSelectSuspension(opt.value, opt.isLeveled)}
                    activeOpacity={0.7}
                  >
                    <View style={s.suspensionRowLeft}>
                      <View style={[s.radioOuter, selected && s.radioOuterSelected]}>
                        {selected && <View style={s.radioInner} />}
                      </View>
                      <Text style={[s.suspensionLabel, selected && s.suspensionLabelSelected]}>
                        {opt.label}
                      </Text>
                    </View>
                    {opt.value > 0 && (
                      <Text style={[s.suspensionMeta, selected && s.suspensionMetaSelected]}>
                        +{opt.value}" clearance
                      </Text>
                    )}
                    {opt.isLeveled && (
                      <Text style={[s.suspensionMeta, selected && s.suspensionMetaSelected]}>
                        Front raised
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── PREVIEW SECTION ────────────────────────────── */}
          <View style={s.previewSection}>
            <View style={s.previewHeader}>
              <Ionicons name="eye-outline" size={12} color={TACTICAL.amber} />
              <Text style={s.previewLabel}>CONFIGURATION PREVIEW</Text>
            </View>
            <View style={s.previewCard}>
              <Text style={s.previewText}>{previewText}</Text>
              {hasTires && hasLift && (
                <Text style={s.previewDetail}>
                  Est. +{((Math.max(0, tireSizeInches - 29) / 2) + suspensionLiftInches).toFixed(1)}" ground clearance vs stock
                </Text>
              )}
            </View>
          </View>

          {/* ── INFO SECTION ───────────────────────────────── */}
          {/* ── INFO SECTION ───────────────────────────────── */}
          <View style={s.infoSection}>
            <Ionicons name="information-circle-outline" size={14} color={TACTICAL.textMuted} />
            <Text style={s.infoText}>
              Tire and suspension data is used by the ECS Discover compatibility engine to score trail compatibility, generate upgrade suggestions, and assess terrain capability for your vehicle.
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </TacticalPopupShell>
  );
}


// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TACTICAL.bg,
  },

  // Vehicle bar
  vehicleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: GOLD_RAIL.subsectionWidth,
    borderBottomColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(17, 20, 24, 0.95)',
  },
  vehicleBarText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.3)',
    backgroundColor: 'rgba(192, 57, 43, 0.06)',
  },
  resetBtnText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.danger,
    letterSpacing: 0.8,
  },

  // Scroll
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },

  // Section
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  sectionDesc: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    lineHeight: 16,
    marginBottom: 12,
    paddingLeft: 22,
  },

  // Tire size options grid
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionBtn: {
    width: '22%' as any,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(62, 79, 60, 0.4)',
    backgroundColor: 'rgba(62, 79, 60, 0.08)',
  },
  optionBtnSelected: {
    borderColor: TACTICAL.amber,
    backgroundColor: TACTICAL.amber,
  },
  optionBtnValue: {
    fontSize: 20,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: -0.5,
  },
  optionBtnValueSelected: {
    color: '#0B0F12',
  },
  optionBtnUnit: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  optionBtnUnitSelected: {
    color: 'rgba(11, 15, 18, 0.7)',
  },

  // Custom tire input
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  customInput: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 160, 23, 0.3)',
    backgroundColor: 'rgba(212, 160, 23, 0.04)',
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  customInputSuffix: {
    fontSize: 12,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // Suspension list
  suspensionList: {
    gap: 6,
  },
  suspensionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(62, 79, 60, 0.3)',
    backgroundColor: 'rgba(62, 79, 60, 0.06)',
  },
  suspensionRowSelected: {
    borderColor: 'rgba(212, 160, 23, 0.5)',
    backgroundColor: 'rgba(212, 160, 23, 0.08)',
  },
  suspensionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'rgba(139, 148, 158, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: TACTICAL.amber,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TACTICAL.amber,
  },
  suspensionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  suspensionLabelSelected: {
    color: TACTICAL.amber,
  },
  suspensionMeta: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  suspensionMetaSelected: {
    color: 'rgba(212, 160, 23, 0.7)',
  },

  // Preview
  previewSection: {
    marginBottom: 16,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  previewLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  previewCard: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.2)',
    backgroundColor: 'rgba(212, 160, 23, 0.04)',
    alignItems: 'center',
    gap: 6,
  },
  previewText: {
    fontSize: 16,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  previewDetail: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // Info
  infoSection: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(62, 79, 60, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.15)',
  },
  infoText: {
    flex: 1,
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 15,
    letterSpacing: 0.3,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(138, 148, 158, 0.28)',
    backgroundColor: 'rgba(138, 148, 158, 0.08)',
  },
  footerCancelText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  footerResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.28)',
    backgroundColor: 'rgba(192, 57, 43, 0.08)',
  },
  footerResetText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.danger,
    letterSpacing: 1,
  },
  footerSaveBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: TACTICAL.amber,
    borderRadius: 10,
  },
  footerSaveText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1,
  },
});




/**
 * VehicleSpecsSection — Vehicle Weight & Fuel Specifications
 *
 * Displays in the Vehicle Config summary view.
 * Allows user to enter:
 *   - Base Weight (lb) (required)
 *   - GVWR (lb) (required)
 *   - Fuel Tank Capacity (gal) (required)
 *   - Fuel Type (diesel/gas)
 *
 * Provides presets by vehicle type for quick population.
 *
 * WEIGHT SYSTEM (Single Source of Truth):
 * Uses computeFullBuildWeightBreakdown() with BuildWeightOverrides
 * to pass the form's in-progress values for real-time preview.
 * NO direct calls to computeBuildWeightFull(), computePayloadMargin(),
 * getPayloadMarginColor(), getPayloadMarginLabel(), or consumablesStore.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  vehicleSpecStore,
  VEHICLE_SPEC_PRESETS,
  getVehiclePresetFuelOptions,
  getVehiclePresetId,
  matchesVehicleSpecPreset,
  resolveVehicleSpecPreset,
  type VehicleSpecPreset,
  type FuelType,
} from '../../lib/vehicleSpecStore';
import {
  getHardwareAdditionsWeight,
  computeFullBuildWeightBreakdown,
} from '../../lib/weightEngine';


interface Props {
  vehicleId: string;
  vehicleType: string;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  selections: Record<string, string>;
}

export default function VehicleSpecsSection({
  vehicleId,
  vehicleType,
  vehicleMake,
  vehicleModel,
  selections,
}: Props) {
  // ── State ─────────────────────────────────────────────
  const [gvwr, setGvwr] = useState('');
  const [baseWeight, setBaseWeight] = useState('');
  const [fuelCapacity, setFuelCapacity] = useState('');
  const [fuelType, setFuelType] = useState<FuelType>('diesel');
  const [showPresets, setShowPresets] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [specSaved, setSpecSaved] = useState(false);

  const presets = useMemo(
    () => VEHICLE_SPEC_PRESETS[vehicleType] || [],
    [vehicleType]
  );

  const selectedPreset = useMemo(
    () => presets.find((preset) => getVehiclePresetId(preset) === selectedPresetId) || null,
    [presets, selectedPresetId]
  );

  const applyResolvedPreset = useCallback((preset: VehicleSpecPreset, nextFuelType?: FuelType | null) => {
    const resolvedSpec = resolveVehicleSpecPreset(preset, nextFuelType);
    setGvwr(String(resolvedSpec.gvwr_lb));
    setBaseWeight(String(resolvedSpec.base_weight_lb));
    setFuelCapacity(resolvedSpec.fuel_tank_capacity_gal > 0 ? String(resolvedSpec.fuel_tank_capacity_gal) : '');
    setFuelType(resolvedSpec.fuel_type);
    vehicleSpecStore.set(vehicleId, resolvedSpec);
    setSpecSaved(true);
    setTimeout(() => setSpecSaved(false), 1500);
  }, [vehicleId]);

  // ── Load existing specs ───────────────────────────────
  useEffect(() => {
    const existing = vehicleSpecStore.get(vehicleId);
    const matchedPreset = vehicleSpecStore.findPreset(vehicleType, vehicleMake, vehicleModel);
    const matchedExistingPreset = existing
      ? presets.find((preset) => matchesVehicleSpecPreset(preset, existing)) || null
      : null;

    if (existing) {
      setGvwr(existing.gvwr_lb > 0 ? String(existing.gvwr_lb) : '');
      setBaseWeight(existing.base_weight_lb > 0 ? String(existing.base_weight_lb) : '');
      setFuelCapacity(existing.fuel_tank_capacity_gal > 0 ? String(existing.fuel_tank_capacity_gal) : '');
      setFuelType(existing.fuel_type || 'diesel');
      setSelectedPresetId(matchedExistingPreset ? getVehiclePresetId(matchedExistingPreset) : null);
    } else {
      // Try auto-match preset
      if (matchedPreset) {
        const resolvedSpec = resolveVehicleSpecPreset(matchedPreset);
        setGvwr(String(resolvedSpec.gvwr_lb));
        setBaseWeight(String(resolvedSpec.base_weight_lb));
        setFuelCapacity(resolvedSpec.fuel_tank_capacity_gal > 0 ? String(resolvedSpec.fuel_tank_capacity_gal) : '');
        setFuelType(resolvedSpec.fuel_type || 'diesel');
        setSelectedPresetId(getVehiclePresetId(matchedPreset));
        vehicleSpecStore.set(vehicleId, resolvedSpec);
      }
    }
  }, [vehicleId, vehicleType, vehicleMake, vehicleModel, presets]);

  // ── Persist on change ─────────────────────────────────
  const saveSpecs = useCallback(() => {
    const gvwrNum = parseInt(gvwr, 10) || 0;
    const baseNum = parseInt(baseWeight, 10) || 0;
    const fuelNum = parseFloat(fuelCapacity) || 0;
    if (gvwrNum > 0 || baseNum > 0 || fuelNum > 0) {
      vehicleSpecStore.set(vehicleId, {
        gvwr_lb: gvwrNum,
        base_weight_lb: baseNum,
        fuel_tank_capacity_gal: fuelNum,
        fuel_type: fuelType,
      });
      setSpecSaved(true);
      setTimeout(() => setSpecSaved(false), 1500);
    }
  }, [vehicleId, gvwr, baseWeight, fuelCapacity, fuelType]);

  // ── Fuel type toggle (auto-save) ──────────────────────
  const toggleFuelType = useCallback(() => {
    const newType: FuelType = fuelType === 'diesel' ? 'gas' : 'diesel';
    setFuelType(newType);
    // Immediately persist the change
    const gvwrNum = parseInt(gvwr, 10) || 0;
    const baseNum = parseInt(baseWeight, 10) || 0;
    const fuelNum = parseFloat(fuelCapacity) || 0;
    if (gvwrNum > 0 || baseNum > 0 || fuelNum > 0) {
      vehicleSpecStore.set(vehicleId, {
        gvwr_lb: gvwrNum,
        base_weight_lb: baseNum,
        fuel_tank_capacity_gal: fuelNum,
        fuel_type: newType,
      });
      setSpecSaved(true);
      setTimeout(() => setSpecSaved(false), 1500);
    }
  }, [vehicleId, gvwr, baseWeight, fuelCapacity, fuelType]);

  const handleFuelTypeSelect = useCallback((nextFuelType: FuelType) => {
    if (selectedPreset) {
      applyResolvedPreset(selectedPreset, nextFuelType);
      return;
    }

    setFuelType(nextFuelType);
    const gvwrNum = parseInt(gvwr, 10) || 0;
    const baseNum = parseInt(baseWeight, 10) || 0;
    const fuelNum = parseFloat(fuelCapacity) || 0;
    if (gvwrNum > 0 || baseNum > 0 || fuelNum > 0) {
      vehicleSpecStore.set(vehicleId, {
        gvwr_lb: gvwrNum,
        base_weight_lb: baseNum,
        fuel_tank_capacity_gal: fuelNum,
        fuel_type: nextFuelType,
      });
      setSpecSaved(true);
      setTimeout(() => setSpecSaved(false), 1500);
    }
  }, [applyResolvedPreset, selectedPreset, vehicleId, gvwr, baseWeight, fuelCapacity]);

  // ── Computed values (SINGLE SOURCE OF TRUTH) ──────────
  const gvwrNum = parseInt(gvwr, 10) || 0;
  const baseNum = parseInt(baseWeight, 10) || 0;
  const fuelNum = parseFloat(fuelCapacity) || 0;

  const hardwareAdditions = useMemo(
    () => getHardwareAdditionsWeight(selections),
    [selections]
  );

  // Centralized breakdown with form overrides for real-time preview.
  // Passes the form's in-progress values so the preview updates
  // immediately as the user types, before saving to the store.
  const breakdown = useMemo(
    () => computeFullBuildWeightBreakdown(vehicleId, {
      base_weight_lb: baseNum,
      gvwr_lb: gvwrNum,
      fuel_tank_capacity_gal: fuelNum,
      fuel_type: fuelType,
      hardware_additions_lb: hardwareAdditions,
    }),
    [vehicleId, baseNum, gvwrNum, fuelNum, fuelType, hardwareAdditions]
  );

  // Destructure for template readability
  const {
    build_weight_lb: buildWeight,
    payload_margin_lb: payloadMargin,
    margin_color: marginColor,
    margin_label: marginLabel,
    fuel_weight_full_tank_lb: fullTankWeight,
    fuel_density_lb_per_gal: fuelDensity,
    has_specs: hasSpecs,
  } = breakdown;

  // Margin percentage for the progress bar
  const marginPct = hasSpecs && gvwrNum > 0
    ? Math.max(0, Math.min(100, (payloadMargin / gvwrNum) * 100))
    : 0;


  // ── Presets for current vehicle type ──────────────────
  const handlePresetSelect = (preset: VehicleSpecPreset) => {
    setSelectedPresetId(getVehiclePresetId(preset));
    applyResolvedPreset(preset);
    setShowPresets(false);
  };

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconWrap}>
          <Ionicons name="speedometer-outline" size={14} color={TACTICAL.amber} />
        </View>
        <Text style={styles.sectionTitle}>VEHICLE SPECS</Text>
        {specSaved && (
          <View style={styles.savedBadge}>
            <Ionicons name="checkmark-circle" size={10} color="#66BB6A" />
            <Text style={styles.savedText}>SAVED</Text>
          </View>
        )}
        {presets.length > 0 && (
          <TouchableOpacity
            style={styles.presetBtn}
            onPress={() => setShowPresets(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="list-outline" size={12} color={TACTICAL.amber} />
            <Text style={styles.presetBtnText}>PRESETS</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Row 1: Base Weight + GVWR */}
      <View style={styles.fieldsRow}>
        {/* Base/Curb Weight */}
        <View style={styles.fieldWrap}>
          <View style={styles.fieldLabelRow}>
            <Ionicons name="car-outline" size={10} color={TACTICAL.amber} />
            <Text style={styles.fieldLabel}>BASE WEIGHT</Text>
            <Text style={styles.fieldRequired}>*</Text>
          </View>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={baseWeight}
              onChangeText={setBaseWeight}
              onBlur={saveSpecs}
              placeholder="e.g. 5700"
              placeholderTextColor="rgba(138,138,133,0.3)"
              keyboardType="numeric"
              returnKeyType="next"
            />
            <Text style={styles.inputUnit}>lbs</Text>
          </View>
          <Text style={styles.fieldHint}>Curb / configured base weight</Text>
        </View>

        {/* GVWR */}
        <View style={styles.fieldWrap}>
          <View style={styles.fieldLabelRow}>
            <Ionicons name="shield-outline" size={10} color={TACTICAL.amber} />
            <Text style={styles.fieldLabel}>GVWR</Text>
            <Text style={styles.fieldRequired}>*</Text>
          </View>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={gvwr}
              onChangeText={setGvwr}
              onBlur={saveSpecs}
              placeholder="e.g. 7100"
              placeholderTextColor="rgba(138,138,133,0.3)"
              keyboardType="numeric"
              returnKeyType="next"
            />
            <Text style={styles.inputUnit}>lbs</Text>
          </View>
          <Text style={styles.fieldHint}>Gross Vehicle Weight Rating</Text>
        </View>
      </View>

      {/* Row 2: Fuel Tank Capacity + Fuel Type */}
      <View style={[styles.fieldsRow, { marginTop: 12 }]}>
        {/* Fuel Tank Capacity */}
        <View style={styles.fieldWrap}>
          <View style={styles.fieldLabelRow}>
            <Ionicons name="water-outline" size={10} color={TACTICAL.amber} />
            <Text style={styles.fieldLabel}>FUEL TANK</Text>
            <Text style={styles.fieldRequired}>*</Text>
          </View>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={fuelCapacity}
              onChangeText={setFuelCapacity}
              onBlur={saveSpecs}
              placeholder="e.g. 32"
              placeholderTextColor="rgba(138,138,133,0.3)"
              keyboardType="decimal-pad"
              returnKeyType="done"
            />
            <Text style={styles.inputUnit}>gal</Text>
          </View>
          <Text style={styles.fieldHint}>
            {fullTankWeight > 0
              ? `Full tank: ${fullTankWeight.toFixed(0)} lbs (${fuelType})`
              : 'Required for fuel % conversion'}
          </Text>
        </View>

        {/* Fuel Type */}
        <View style={styles.fieldWrap}>
          <View style={styles.fieldLabelRow}>
            <Ionicons name="flame-outline" size={10} color={TACTICAL.amber} />
            <Text style={styles.fieldLabel}>FUEL TYPE</Text>
          </View>
          <View style={styles.fuelTypeRow}>
            <TouchableOpacity
              style={[
                styles.fuelTypeBtn,
                fuelType === 'diesel' && styles.fuelTypeBtnActive,
              ]}
              onPress={() => {
                if (fuelType !== 'diesel') {
                  handleFuelTypeSelect('diesel');
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.fuelTypeBtnText,
                fuelType === 'diesel' && styles.fuelTypeBtnTextActive,
              ]}>DIESEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.fuelTypeBtn,
                fuelType === 'gas' && styles.fuelTypeBtnActive,
              ]}
              onPress={() => {
                if (fuelType !== 'gas') {
                  handleFuelTypeSelect('gas');
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.fuelTypeBtnText,
                fuelType === 'gas' && styles.fuelTypeBtnTextActive,
              ]}>GAS</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.fieldHint}>
            {fuelDensity} lbs/gal
          </Text>
        </View>
      </View>

      {/* Computed Weight Summary */}
      {(buildWeight > 0 || hardwareAdditions > 0) && (
        <View style={styles.computedSection}>
          {/* Hardware Additions */}
          {hardwareAdditions > 0 && (
            <View style={styles.computedRow}>
              <Text style={styles.computedLabel}>HARDWARE ADDITIONS</Text>
              <Text style={styles.computedValue}>+{hardwareAdditions.toLocaleString()} lbs</Text>
            </View>
          )}

          {/* Build Weight */}
          {buildWeight > 0 && (
            <View style={styles.computedRow}>
              <Text style={styles.computedLabel}>BUILD WEIGHT</Text>
              <Text style={[styles.computedValue, styles.computedValueBold]}>
                {buildWeight.toLocaleString()} lbs
              </Text>
            </View>
          )}

          {/* Fuel Weight (full tank) */}
          {fullTankWeight > 0 && (
            <View style={styles.computedRow}>
              <Text style={styles.computedLabel}>FUEL WEIGHT (FULL)</Text>
              <Text style={styles.computedValue}>{fullTankWeight.toFixed(0)} lbs</Text>
            </View>
          )}

          {/* Payload Margin */}
          {hasSpecs && (
            <>
              <View style={styles.divider} />
              <View style={styles.marginRow}>
                <View style={styles.marginLabelRow}>
                  <Text style={styles.computedLabel}>PAYLOAD MARGIN</Text>
                  {marginLabel && (
                    <View style={[styles.marginBadge, { backgroundColor: `${marginColor}15` }]}>
                      <Text style={[styles.marginBadgeText, { color: marginColor }]}>
                        {marginLabel}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.marginValue, { color: marginColor }]}>
                  {payloadMargin.toLocaleString()} lbs
                </Text>
              </View>

              {/* Margin Bar */}
              <View style={styles.marginBarOuter}>
                <View
                  style={[
                    styles.marginBarFill,
                    {
                      width: `${Math.min(100, Math.max(0, 100 - marginPct))}%`,
                      backgroundColor: marginColor,
                    },
                  ]}
                />
              </View>
              <View style={styles.marginBarLabels}>
                <Text style={styles.marginBarLabelText}>
                  {buildWeight.toLocaleString()} lbs used
                </Text>
                <Text style={styles.marginBarLabelText}>
                  {gvwrNum.toLocaleString()} lbs GVWR
                </Text>
              </View>
            </>
          )}
        </View>
      )}


      {/* No specs hint */}
      {!gvwrNum && !baseNum && (
        <View style={styles.hintBox}>
          <Ionicons name="information-circle-outline" size={12} color={TACTICAL.textMuted} />
          <Text style={styles.hintText}>
            Enter your vehicle's base weight, GVWR, and fuel tank capacity to compute payload margin and enable fuel-percent weight conversion.
            {presets.length > 0 ? ' Tap PRESETS for common values.' : ''}
          </Text>
        </View>
      )}

      {/* ── Presets Modal ──────────────────────────────── */}
      <Modal
        visible={showPresets}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPresets(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Ionicons name="list-outline" size={16} color={TACTICAL.amber} />
                <Text style={styles.modalTitle}>VEHICLE PRESETS</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowPresets(false)}
              >
                <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <Text style={styles.modalHint}>
              Select a preset to auto-fill specs. You can adjust values after.
            </Text>

            <ScrollView
              style={styles.modalScroll}
              showsVerticalScrollIndicator={false}
            >
              {presets.map((preset) => (
                <TouchableOpacity
                  key={getVehiclePresetId(preset)}
                  style={styles.presetRow}
                  onPress={() => handlePresetSelect(preset)}
                  activeOpacity={0.7}
                >
                  <View style={styles.presetInfo}>
                    <Text style={styles.presetName}>{preset.label}</Text>
                    <View style={styles.presetSpecsRow}>
                      <Text style={styles.presetSpec}>
                        GVWR: {preset.gvwr_lb.toLocaleString()}
                      </Text>
                      <View style={styles.presetSpecDot} />
                      <Text style={styles.presetSpec}>
                        Curb: {preset.base_weight_lb.toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.presetSpecsRow}>
                      <Text style={styles.presetSpec}>
                        Tank: {preset.fuel_tank_capacity_gal > 0 ? `${preset.fuel_tank_capacity_gal} gal` : 'N/A'}
                      </Text>
                      <View style={styles.presetSpecDot} />
                      <Text style={styles.presetSpec}>
                        {getVehiclePresetFuelOptions(preset).map((fuel) => fuel.toUpperCase()).join(' / ')}
                      </Text>
                      <View style={styles.presetSpecDot} />
                      <Text style={styles.presetPayloadInline}>
                        Payload: {(preset.gvwr_lb - preset.base_weight_lb).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
    flex: 1,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(102, 187, 106, 0.1)',
    borderRadius: 4,
  },
  savedText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#66BB6A',
    letterSpacing: 1,
  },
  presetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)',
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
  },
  presetBtnText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // Fields
  fieldsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldWrap: {
    flex: 1,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.2,
  },
  fieldRequired: {
    fontSize: 9,
    fontWeight: '800',
    color: '#EF5350',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Courier',
    color: TACTICAL.text,
  },
  inputUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    paddingRight: 10,
    letterSpacing: 0.5,
  },
  fieldHint: {
    fontSize: 8,
    fontWeight: '600',
    color: 'rgba(138,138,133,0.4)',
    marginTop: 3,
    letterSpacing: 0.3,
  },

  // Fuel Type Toggle
  fuelTypeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  fuelTypeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  fuelTypeBtnActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
  },
  fuelTypeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  fuelTypeBtnTextActive: {
    color: TACTICAL.amber,
  },

  // Computed Section
  computedSection: {
    marginTop: 12,
    backgroundColor: TACTICAL.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.3)',
    padding: 12,
  },
  computedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  computedLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  computedValue: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Courier',
    color: TACTICAL.text,
  },
  computedValueBold: {
    fontWeight: '900',
    color: TACTICAL.amber,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
    marginVertical: 8,
  },
  marginRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  marginLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  marginBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  marginBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },
  marginValue: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'Courier',
  },

  // Margin Bar
  marginBarOuter: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8,
  },
  marginBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  marginBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  marginBarLabelText: {
    fontSize: 7,
    fontWeight: '600',
    color: 'rgba(138,138,133,0.5)',
    letterSpacing: 0.3,
  },

  // Hint
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
    padding: 10,
    backgroundColor: 'rgba(62, 79, 60, 0.1)',
    borderRadius: 8,
  },
  hintText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 15,
    flex: 1,
  },

  // ── Presets Modal ─────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1A1F16',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.4)',
    borderBottomWidth: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(62, 79, 60, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDivider: {
    height: 1,
    backgroundColor: 'rgba(62, 79, 60, 0.3)',
    marginHorizontal: 20,
  },
  modalHint: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    paddingHorizontal: 20,
    paddingVertical: 10,
    lineHeight: 15,
  },
  modalScroll: {
    paddingHorizontal: 16,
  },

  // Preset Rows
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.12)',
  },
  presetInfo: {
    flex: 1,
    gap: 3,
  },
  presetName: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  presetSpecsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  presetSpec: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Courier',
    color: TACTICAL.textMuted,
  },
  presetSpecDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(138,138,133,0.3)',
  },
  presetPayloadInline: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Courier',
    color: TACTICAL.amber,
  },
});




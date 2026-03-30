/**
 * AddItemModal — Loadout 2.0 Add/Edit Item Form
 *
 * Two modes:
 *   1. Standard items: Name, Qty, Unit Weight, Unit (lb/kg), Notes, Critical
 *   2. Liquid items (water_storage): Liquid Name, Amount, Unit (gal/L), Liquid Type
 *
 * Liquid mode auto-computes weight from density constants.
 * Prevents saving liquid items with amount <= 0.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  LIQUID_CONTAINER_KEY,
  LIQUID_DENSITIES,
  computeLiquidWeight,
  computeItemTotal,
} from '../../lib/loadout2Types';
import type { LoadoutItem } from '../../lib/types';

// ── Props ───────────────────────────────────────────────────
export interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (item: AddItemPayload) => void;
  /** Container key this item belongs to */
  containerKey: string;
  /** Container label for display */
  containerLabel: string;
  /** Container accent color */
  containerColor: string;
  /** If editing, pass the existing item */
  editItem?: LoadoutItem | null;
  /** Whether save is in progress */
  saving?: boolean;
}

export interface AddItemPayload {
  name: string;
  quantity: number;
  weight_lbs: number | null;
  is_critical: boolean;
  notes: string | null;
  storage_location: string;
  /** Liquid metadata (encoded in notes for persistence) */
  _liquidMeta?: {
    type: 'water' | 'fuel' | 'other';
    amount: number;
    unit: 'gallons' | 'liters';
  };
}

type LiquidType = 'water' | 'fuel' | 'other';
type LiquidUnit = 'gallons' | 'liters';
type WeightUnit = 'lb' | 'kg';

export default function AddItemModal({
  visible,
  onClose,
  onSave,
  containerKey,
  containerLabel,
  containerColor,
  editItem,
  saving = false,
}: AddItemModalProps) {
  const isLiquidContainer = containerKey === LIQUID_CONTAINER_KEY;
  const isEditing = !!editItem;

  // ── Standard form state ───────────────────────────────────
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unitWeight, setUnitWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lb');
  const [notes, setNotes] = useState('');
  const [isCritical, setIsCritical] = useState(false);

  // ── Liquid form state ─────────────────────────────────────
  const [liquidName, setLiquidName] = useState('Water');
  const [liquidAmount, setLiquidAmount] = useState('');
  const [liquidUnit, setLiquidUnit] = useState<LiquidUnit>('gallons');
  const [liquidType, setLiquidType] = useState<LiquidType>('water');

  // ── Populate form when editing ────────────────────────────
  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setQty(String(editItem.quantity || 1));
      setUnitWeight(editItem.weight_lbs != null ? String(editItem.weight_lbs) : '');
      setNotes(editItem.notes || '');
      setIsCritical(editItem.is_critical);

      // Parse liquid metadata from notes
      if (isLiquidContainer && editItem.notes) {
        const match = editItem.notes.match(/\[LIQUID:(\w+):([\d.]+):(\w+)\]/);
        if (match) {
          setLiquidName(editItem.name);
          setLiquidType(match[1] as LiquidType);
          setLiquidAmount(match[2]);
          setLiquidUnit(match[3] as LiquidUnit);
        }
      }
    } else {
      // Reset form
      setName('');
      setQty('1');
      setUnitWeight('');
      setWeightUnit('lb');
      setNotes('');
      setIsCritical(false);
      setLiquidName('Water');
      setLiquidAmount('');
      setLiquidUnit('gallons');
      setLiquidType('water');
    }
  }, [editItem, visible, isLiquidContainer]);

  // ── Computed weights ──────────────────────────────────────
  const computedStandardTotal = useMemo(() => {
    const q = parseInt(qty) || 1;
    const w = parseFloat(unitWeight) || 0;
    if (weightUnit === 'kg') {
      return computeItemTotal(q, w * 2.20462); // convert kg to lb
    }
    return computeItemTotal(q, w);
  }, [qty, unitWeight, weightUnit]);

  const computedLiquidWeight = useMemo(() => {
    const amount = parseFloat(liquidAmount) || 0;
    if (amount <= 0) return 0;
    return computeLiquidWeight(amount, liquidUnit, liquidType);
  }, [liquidAmount, liquidUnit, liquidType]);

  // ── Validation ────────────────────────────────────────────
  const canSave = useMemo(() => {
    if (isLiquidContainer) {
      const amount = parseFloat(liquidAmount) || 0;
      return liquidName.trim().length > 0 && amount > 0;
    }
    return name.trim().length > 0;
  }, [isLiquidContainer, liquidName, liquidAmount, name]);

  // ── Save handler ──────────────────────────────────────────
  const handleSave = () => {
    if (!canSave || saving) return;

    if (isLiquidContainer) {
      const amount = parseFloat(liquidAmount) || 0;
      const weight = computeLiquidWeight(amount, liquidUnit, liquidType);
      const liquidMeta = `[LIQUID:${liquidType}:${amount}:${liquidUnit}]`;

      onSave({
        name: liquidName.trim(),
        quantity: 1,
        weight_lbs: weight,
        is_critical: isCritical,
        notes: liquidMeta,
        storage_location: containerKey,
        _liquidMeta: { type: liquidType, amount, unit: liquidUnit },
      });
    } else {
      const q = parseInt(qty) || 1;
      const w = parseFloat(unitWeight) || 0;
      const weightLbs = weightUnit === 'kg' ? w * 2.20462 : w;

      onSave({
        name: name.trim(),
        quantity: q,
        weight_lbs: weightLbs > 0 ? Math.round(weightLbs * 100) / 100 : null,
        is_critical: isCritical,
        notes: notes.trim() || null,
        storage_location: containerKey,
      });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          {/* ── Header ──────────────────────────────────────── */}
          <View style={[styles.header, { borderBottomColor: `${containerColor}30` }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.headerIcon, { backgroundColor: `${containerColor}18` }]}>
                <Ionicons
                  name={isLiquidContainer ? 'water' : 'add-circle-outline'}
                  size={16}
                  color={containerColor}
                />
              </View>
              <View>
                <Text style={styles.headerTitle}>
                  {isEditing ? 'EDIT ITEM' : isLiquidContainer ? 'ADD LIQUID' : 'ADD ITEM'}
                </Text>
                <Text style={[styles.headerSub, { color: containerColor }]}>{containerLabel}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {isLiquidContainer ? (
              /* ══════════════════════════════════════════════════
                 LIQUID FORM
                 ══════════════════════════════════════════════════ */
              <>
                {/* Liquid Name */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>LIQUID NAME</Text>
                  <TextInput
                    style={styles.input}
                    value={liquidName}
                    onChangeText={setLiquidName}
                    placeholder="Water"
                    placeholderTextColor={TACTICAL.textMuted}
                    autoFocus={!isEditing}
                  />
                </View>

                {/* Liquid Type Selector */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>LIQUID TYPE</Text>
                  <View style={styles.toggleRow}>
                    {(['water', 'fuel', 'other'] as LiquidType[]).map(t => {
                      const active = liquidType === t;
                      const icons: Record<LiquidType, string> = {
                        water: 'water-outline',
                        fuel: 'flame-outline',
                        other: 'flask-outline',
                      };
                      return (
                        <TouchableOpacity
                          key={t}
                          style={[styles.toggleBtn, active && { borderColor: containerColor, backgroundColor: `${containerColor}12` }]}
                          onPress={() => setLiquidType(t)}
                        >
                          <Ionicons name={icons[t] as any} size={14} color={active ? containerColor : TACTICAL.textMuted} />
                          <Text style={[styles.toggleText, active && { color: containerColor }]}>
                            {t.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Amount + Unit */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>AMOUNT</Text>
                  <View style={styles.amountRow}>
                    <TextInput
                      style={[styles.input, styles.amountInput]}
                      value={liquidAmount}
                      onChangeText={(v) => setLiquidAmount(v.replace(/[^0-9.]/g, ''))}
                      placeholder="0.0"
                      placeholderTextColor={TACTICAL.textMuted}
                      keyboardType="decimal-pad"
                    />
                    <View style={styles.unitToggle}>
                      <TouchableOpacity
                        style={[styles.unitBtn, liquidUnit === 'gallons' && styles.unitBtnActive]}
                        onPress={() => setLiquidUnit('gallons')}
                      >
                        <Text style={[styles.unitBtnText, liquidUnit === 'gallons' && styles.unitBtnTextActive]}>GAL</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.unitBtn, liquidUnit === 'liters' && styles.unitBtnActive]}
                        onPress={() => setLiquidUnit('liters')}
                      >
                        <Text style={[styles.unitBtnText, liquidUnit === 'liters' && styles.unitBtnTextActive]}>L</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Computed Weight Display */}
                <View style={styles.weightPreview}>
                  <Ionicons name="scale-outline" size={16} color={TACTICAL.amber} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.weightPreviewLabel}>COMPUTED WEIGHT</Text>
                    <Text style={styles.weightPreviewValue}>
                      {computedLiquidWeight > 0
                        ? `${computedLiquidWeight.toFixed(1)} lb`
                        : 'Enter amount above'}
                    </Text>
                  </View>
                  {computedLiquidWeight > 0 && (
                    <View style={styles.densityBadge}>
                      <Text style={styles.densityText}>
                        {LIQUID_DENSITIES[liquidType].lbPerGallon} lb/gal
                      </Text>
                    </View>
                  )}
                </View>

                {/* Validation Warning */}
                {liquidAmount !== '' && (parseFloat(liquidAmount) || 0) <= 0 && (
                  <View style={styles.validationWarn}>
                    <Ionicons name="warning-outline" size={14} color={TACTICAL.danger} />
                    <Text style={styles.validationText}>Amount must be greater than 0</Text>
                  </View>
                )}
              </>
            ) : (
              /* ══════════════════════════════════════════════════
                 STANDARD ITEM FORM
                 ══════════════════════════════════════════════════ */
              <>
                {/* Item Name */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>ITEM NAME</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Recovery Strap"
                    placeholderTextColor={TACTICAL.textMuted}
                    autoFocus={!isEditing}
                  />
                </View>

                {/* Qty + Unit Weight */}
                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>QUANTITY</Text>
                    <View style={styles.qtyRow}>
                      <TouchableOpacity
                        style={styles.qtyStepBtn}
                        onPress={() => setQty(String(Math.max(1, (parseInt(qty) || 1) - 1)))}
                      >
                        <Ionicons name="remove" size={16} color={TACTICAL.textMuted} />
                      </TouchableOpacity>
                      <TextInput
                        style={[styles.input, styles.qtyInput]}
                        value={qty}
                        onChangeText={(v) => setQty(v.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        textAlign="center"
                      />
                      <TouchableOpacity
                        style={styles.qtyStepBtn}
                        onPress={() => setQty(String((parseInt(qty) || 1) + 1))}
                      >
                        <Ionicons name="add" size={16} color={containerColor} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>UNIT WEIGHT</Text>
                    <View style={styles.amountRow}>
                      <TextInput
                        style={[styles.input, styles.amountInput, { fontFamily: 'Courier' }]}
                        value={unitWeight}
                        onChangeText={(v) => setUnitWeight(v.replace(/[^0-9.]/g, ''))}
                        placeholder="0.0"
                        placeholderTextColor={TACTICAL.textMuted}
                        keyboardType="decimal-pad"
                      />
                      <View style={styles.unitToggle}>
                        <TouchableOpacity
                          style={[styles.unitBtn, weightUnit === 'lb' && styles.unitBtnActive]}
                          onPress={() => setWeightUnit('lb')}
                        >
                          <Text style={[styles.unitBtnText, weightUnit === 'lb' && styles.unitBtnTextActive]}>LB</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.unitBtn, weightUnit === 'kg' && styles.unitBtnActive]}
                          onPress={() => setWeightUnit('kg')}
                        >
                          <Text style={[styles.unitBtnText, weightUnit === 'kg' && styles.unitBtnTextActive]}>KG</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Computed Total */}
                {computedStandardTotal > 0 && (
                  <View style={styles.weightPreview}>
                    <Ionicons name="scale-outline" size={16} color={TACTICAL.amber} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.weightPreviewLabel}>ITEM TOTAL WEIGHT</Text>
                      <Text style={styles.weightPreviewValue}>
                        {computedStandardTotal.toFixed(1)} lb
                        {(parseInt(qty) || 1) > 1 && ` (${parseInt(qty) || 1} x ${parseFloat(unitWeight) || 0} ${weightUnit})`}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Notes */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>NOTES (OPTIONAL)</Text>
                  <TextInput
                    style={[styles.input, { minHeight: 50 }]}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Additional details..."
                    placeholderTextColor={TACTICAL.textMuted}
                    multiline
                  />
                </View>
              </>
            )}

            {/* ── Critical Toggle (both modes) ───────────────── */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>CRITICAL ITEM</Text>
              <TouchableOpacity
                style={[styles.criticalToggle, isCritical && styles.criticalToggleActive]}
                onPress={() => setIsCritical(!isCritical)}
              >
                <Ionicons
                  name={isCritical ? 'alert-circle' : 'alert-circle-outline'}
                  size={18}
                  color={isCritical ? TACTICAL.danger : TACTICAL.textMuted}
                />
                <Text style={[styles.criticalToggleText, isCritical && { color: TACTICAL.danger }]}>
                  {isCritical ? 'YES — REQUIRED FOR MISSION' : 'NO'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── Save Button ────────────────────────────────── */}
            <TouchableOpacity
              style={[
                styles.saveBtn,
                { borderColor: `${containerColor}50` },
                !canSave && styles.saveBtnDisabled,
              ]}
              onPress={handleSave}
              disabled={!canSave || saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color={TACTICAL.text} />
              ) : (
                <>
                  <Ionicons
                    name={isEditing ? 'checkmark-circle-outline' : 'add-circle-outline'}
                    size={18}
                    color={canSave ? TACTICAL.text : TACTICAL.textMuted}
                  />
                  <Text style={[styles.saveBtnText, !canSave && { color: TACTICAL.textMuted }]}>
                    {isEditing ? 'SAVE CHANGES' : isLiquidContainer ? 'ADD LIQUID' : 'ADD TO CONTAINER'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    borderTopWidth: 2,
    borderColor: TACTICAL.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 2,
  },
  headerSub: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 1,
  },
  body: {
    padding: 18,
  },

  // ── Fields ────────────────────────────────────────────────
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  fieldHalf: {
    flex: 1,
  },
  input: {
    backgroundColor: TACTICAL.bg,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: TACTICAL.text,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Qty Row ───────────────────────────────────────────────
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qtyStepBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: TACTICAL.bg,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    flex: 1,
    fontFamily: 'Courier',
    fontWeight: '900',
    fontSize: 16,
  },

  // ── Amount Row ────────────────────────────────────────────
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountInput: {
    flex: 1,
  },

  // ── Unit Toggle ───────────────────────────────────────────
  unitToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  unitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: TACTICAL.bg,
  },
  unitBtnActive: {
    backgroundColor: 'rgba(196,138,44,0.15)',
  },
  unitBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  unitBtnTextActive: {
    color: TACTICAL.amber,
  },

  // ── Toggle Row (Liquid Type) ──────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.bg,
  },
  toggleText: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // ── Weight Preview ────────────────────────────────────────
  weightPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(196,138,44,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
  },
  weightPreviewLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  weightPreviewValue: {
    fontSize: 15,
    fontWeight: '900',
    color: TACTICAL.amber,
    fontFamily: 'Courier',
    marginTop: 1,
  },
  densityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: 'rgba(138,138,133,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.15)',
  },
  densityText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },

  // ── Validation Warning ────────────────────────────────────
  validationWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: `${TACTICAL.danger}10`,
    borderWidth: 1,
    borderColor: `${TACTICAL.danger}30`,
  },
  validationText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.danger,
  },

  // ── Critical Toggle ───────────────────────────────────────
  criticalToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: TACTICAL.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  criticalToggleActive: {
    borderColor: `${TACTICAL.danger}50`,
    backgroundColor: `${TACTICAL.danger}08`,
  },
  criticalToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // ── Save Button ───────────────────────────────────────────
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: TACTICAL.accent,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 2,
  },
});




import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ECSButton } from '../ECSButton';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  LIQUID_CONTAINER_KEY,
  LIQUID_DENSITIES,
  computeItemTotal,
  computeLiquidWeight,
} from '../../lib/loadout2Types';
import type { LoadoutItem, LoadoutItemCategory, WeightSource } from '../../lib/types';

export interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (item: AddItemPayload) => void;
  containerKey: string;
  containerLabel: string;
  containerColor: string;
  editItem?: LoadoutItem | null;
  saving?: boolean;
}

export interface AddItemPayload {
  name: string;
  quantity: number;
  weight_lbs: number | null;
  is_critical: boolean;
  notes: string | null;
  storage_location: string;
  category?: LoadoutItemCategory;
  weight_source?: WeightSource;
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

  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unitWeight, setUnitWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lb');
  const [notes, setNotes] = useState('');
  const [isCritical, setIsCritical] = useState(false);

  const [liquidName, setLiquidName] = useState('Water');
  const [liquidAmount, setLiquidAmount] = useState('');
  const [liquidUnit, setLiquidUnit] = useState<LiquidUnit>('gallons');
  const [liquidType, setLiquidType] = useState<LiquidType>('water');

  useEffect(() => {
    if (!visible) return;

    if (editItem) {
      setName(editItem.name);
      setQty(String(editItem.quantity || 1));
      setUnitWeight(editItem.weight_lbs != null ? String(editItem.weight_lbs) : '');
      setNotes(editItem.notes || '');
      setIsCritical(editItem.is_critical);

      if (isLiquidContainer && editItem.notes) {
        const match = editItem.notes.match(/\[LIQUID:(\w+):([\d.]+):(\w+)\]/);
        if (match) {
          setLiquidName(editItem.name);
          setLiquidType(match[1] as LiquidType);
          setLiquidAmount(match[2]);
          setLiquidUnit(match[3] as LiquidUnit);
          return;
        }
      }
      return;
    }

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
  }, [editItem, isLiquidContainer, visible]);

  const computedStandardTotal = useMemo(() => {
    const quantity = parseInt(qty, 10) || 1;
    const weight = parseFloat(unitWeight) || 0;
    const weightLbs = weightUnit === 'kg' ? weight * 2.20462 : weight;
    return computeItemTotal(quantity, weightLbs);
  }, [qty, unitWeight, weightUnit]);

  const computedLiquidWeight = useMemo(() => {
    const amount = parseFloat(liquidAmount) || 0;
    if (amount <= 0) return 0;
    return computeLiquidWeight(amount, liquidUnit, liquidType);
  }, [liquidAmount, liquidType, liquidUnit]);

  const canSave = useMemo(() => {
    if (isLiquidContainer) {
      const amount = parseFloat(liquidAmount) || 0;
      return liquidName.trim().length > 0 && amount > 0;
    }
    return name.trim().length > 0;
  }, [isLiquidContainer, liquidAmount, liquidName, name]);

  const handleSave = () => {
    if (!canSave || saving) return;

    if (isLiquidContainer) {
      const amount = parseFloat(liquidAmount) || 0;
      const liquidWeight = computeLiquidWeight(amount, liquidUnit, liquidType);
      const liquidMeta = `[LIQUID:${liquidType}:${amount}:${liquidUnit}]`;

      onSave({
        name: liquidName.trim(),
        quantity: 1,
        weight_lbs: liquidWeight,
        is_critical: isCritical,
        notes: liquidMeta,
        storage_location: containerKey,
        category: 'water',
        weight_source: 'estimate',
        _liquidMeta: { type: liquidType, amount, unit: liquidUnit },
      });
      return;
    }

    const quantity = parseInt(qty, 10) || 1;
    const weight = parseFloat(unitWeight) || 0;
    const weightLbs = weightUnit === 'kg' ? weight * 2.20462 : weight;

    onSave({
      name: name.trim(),
      quantity,
      weight_lbs: weightLbs > 0 ? Math.round(weightLbs * 100) / 100 : null,
      is_critical: isCritical,
      notes: notes.trim() || null,
      storage_location: containerKey,
      weight_source: weightLbs > 0 ? 'measured' : 'estimate',
    });
  };

  const actionLabel = isEditing
    ? 'Save Changes'
    : isLiquidContainer
      ? 'Add Liquid'
      : 'Add Item';

  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title={isEditing ? 'Edit Item' : isLiquidContainer ? 'Add Liquid' : 'Add Item'}
      subtitle={containerLabel}
      eyebrow={isLiquidContainer ? 'LIQUID CONTAINER' : 'LOADOUT ITEM'}
      icon={isLiquidContainer ? 'water-outline' : 'add-circle-outline'}
      overlayClass="workflow"
      stackBehavior="allow-stack"
      scrollable
      keyboardAware
      maxHeightFraction={0.98}
      bodyStyle={styles.shellBody}
      contentContainerStyle={styles.shellContent}
      footer={(
        <ECSOverlayFooter>
          <ECSButton
            label="Cancel"
            variant="secondary"
            size="large"
            onPress={onClose}
            grow
          />
          <ECSButton
            label={actionLabel}
            icon={isEditing ? 'checkmark-circle-outline' : 'add-circle-outline'}
            variant="primary"
            size="large"
            onPress={handleSave}
            disabled={!canSave}
            loading={saving}
            grow
          />
        </ECSOverlayFooter>
      )}
    >
      <View style={[styles.summaryCard, { borderColor: `${containerColor}28` }]}>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryIconWrap, { backgroundColor: `${containerColor}18` }]}>
            <Ionicons
              name={isLiquidContainer ? 'water-outline' : 'cube-outline'}
              size={16}
              color={containerColor}
            />
          </View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryTitle}>
              {isEditing ? 'Update the selected loadout entry.' : 'Stage gear inside this container.'}
            </Text>
            <Text style={[styles.summarySubtitle, { color: containerColor }]}>{containerLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        {isLiquidContainer ? (
          <>
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

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>LIQUID TYPE</Text>
              <View style={styles.toggleRow}>
                {(['water', 'fuel', 'other'] as LiquidType[]).map((type) => {
                  const active = liquidType === type;
                  const icons: Record<LiquidType, string> = {
                    water: 'water-outline',
                    fuel: 'flame-outline',
                    other: 'flask-outline',
                  };
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.toggleBtn,
                        active && { borderColor: containerColor, backgroundColor: `${containerColor}12` },
                      ]}
                      onPress={() => setLiquidType(type)}
                    >
                      <Ionicons
                        name={icons[type] as any}
                        size={14}
                        color={active ? containerColor : TACTICAL.textMuted}
                      />
                      <Text style={[styles.toggleText, active && { color: containerColor }]}>
                        {type.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>AMOUNT</Text>
              <View style={styles.amountRow}>
                <TextInput
                  style={[styles.input, styles.amountInput]}
                  value={liquidAmount}
                  onChangeText={(value) => setLiquidAmount(value.replace(/[^0-9.]/g, ''))}
                  placeholder="0.0"
                  placeholderTextColor={TACTICAL.textMuted}
                  keyboardType="decimal-pad"
                />
                <View style={styles.unitToggle}>
                  <TouchableOpacity
                    style={[styles.unitBtn, liquidUnit === 'gallons' && styles.unitBtnActive]}
                    onPress={() => setLiquidUnit('gallons')}
                  >
                    <Text style={[styles.unitBtnText, liquidUnit === 'gallons' && styles.unitBtnTextActive]}>
                      GAL
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.unitBtn, liquidUnit === 'liters' && styles.unitBtnActive]}
                    onPress={() => setLiquidUnit('liters')}
                  >
                    <Text style={[styles.unitBtnText, liquidUnit === 'liters' && styles.unitBtnTextActive]}>
                      L
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.weightPreview}>
              <Ionicons name="scale-outline" size={16} color={TACTICAL.amber} />
              <View style={styles.weightPreviewCopy}>
                <Text style={styles.weightPreviewLabel}>COMPUTED WEIGHT</Text>
                <Text style={styles.weightPreviewValue}>
                  {computedLiquidWeight > 0 ? `${computedLiquidWeight.toFixed(1)} lb` : 'Enter amount above'}
                </Text>
              </View>
              {computedLiquidWeight > 0 ? (
                <View style={styles.densityBadge}>
                  <Text style={styles.densityText}>{LIQUID_DENSITIES[liquidType].lbPerGallon} lb/gal</Text>
                </View>
              ) : null}
            </View>

            {liquidAmount !== '' && (parseFloat(liquidAmount) || 0) <= 0 ? (
              <View style={styles.validationWarn}>
                <Ionicons name="warning-outline" size={14} color={TACTICAL.danger} />
                <Text style={styles.validationText}>Amount must be greater than 0</Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
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

            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>QUANTITY</Text>
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={styles.qtyStepBtn}
                    onPress={() => setQty(String(Math.max(1, (parseInt(qty, 10) || 1) - 1)))}
                  >
                    <Ionicons name="remove" size={16} color={TACTICAL.textMuted} />
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.input, styles.qtyInput]}
                    value={qty}
                    onChangeText={(value) => setQty(value.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    textAlign="center"
                  />
                  <TouchableOpacity
                    style={styles.qtyStepBtn}
                    onPress={() => setQty(String((parseInt(qty, 10) || 1) + 1))}
                  >
                    <Ionicons name="add" size={16} color={containerColor} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>UNIT WEIGHT</Text>
                <View style={styles.amountRow}>
                  <TextInput
                    style={[styles.input, styles.amountInput, styles.monoInput]}
                    value={unitWeight}
                    onChangeText={(value) => setUnitWeight(value.replace(/[^0-9.]/g, ''))}
                    placeholder="0.0"
                    placeholderTextColor={TACTICAL.textMuted}
                    keyboardType="decimal-pad"
                  />
                  <View style={styles.unitToggle}>
                    <TouchableOpacity
                      style={[styles.unitBtn, weightUnit === 'lb' && styles.unitBtnActive]}
                      onPress={() => setWeightUnit('lb')}
                    >
                      <Text style={[styles.unitBtnText, weightUnit === 'lb' && styles.unitBtnTextActive]}>
                        LB
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.unitBtn, weightUnit === 'kg' && styles.unitBtnActive]}
                      onPress={() => setWeightUnit('kg')}
                    >
                      <Text style={[styles.unitBtnText, weightUnit === 'kg' && styles.unitBtnTextActive]}>
                        KG
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>

            {computedStandardTotal > 0 ? (
              <View style={styles.weightPreview}>
                <Ionicons name="scale-outline" size={16} color={TACTICAL.amber} />
                <View style={styles.weightPreviewCopy}>
                  <Text style={styles.weightPreviewLabel}>ITEM TOTAL WEIGHT</Text>
                  <Text style={styles.weightPreviewValue}>
                    {computedStandardTotal.toFixed(1)} lb
                    {(parseInt(qty, 10) || 1) > 1
                      ? ` (${parseInt(qty, 10) || 1} x ${parseFloat(unitWeight) || 0} ${weightUnit})`
                      : ''}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>NOTES (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Additional details..."
                placeholderTextColor={TACTICAL.textMuted}
                multiline
              />
            </View>
          </>
        )}

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
            <Text style={[styles.criticalToggleText, isCritical && styles.criticalToggleTextActive]}>
              {isCritical ? 'YES - REQUIRED FOR MISSION' : 'NO'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ECSModalShell>
  );
}

const styles = StyleSheet.create({
  shellBody: {
    flex: 1,
    minHeight: 0,
  },
  shellContent: {
    gap: 10,
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.4,
  },
  summarySubtitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 3,
  },
  body: {
    gap: 2,
  },
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
  monoInput: {
    fontFamily: 'Courier',
  },
  notesInput: {
    minHeight: 56,
    textAlignVertical: 'top',
  },
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
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountInput: {
    flex: 1,
  },
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
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  toggleText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.9,
  },
  weightPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(196,138,44,0.08)',
    marginBottom: 16,
  },
  weightPreviewCopy: {
    flex: 1,
  },
  weightPreviewLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  weightPreviewValue: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  densityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
  },
  densityText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.6,
  },
  validationWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -4,
    marginBottom: 16,
  },
  validationText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.danger,
  },
  criticalToggle: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.bg,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  criticalToggleActive: {
    borderColor: 'rgba(224,64,48,0.45)',
    backgroundColor: 'rgba(224,64,48,0.08)',
  },
  criticalToggleText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.7,
  },
  criticalToggleTextActive: {
    color: TACTICAL.danger,
  },
});

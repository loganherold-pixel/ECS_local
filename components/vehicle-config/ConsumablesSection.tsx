/**
 * ConsumablesSection — Fuel % + Water Gallons Input
 *
 * Placed in Vehicle Config under Vehicle Specs.
 * Single source of truth for dynamic consumable weight contributors.
 *
 * Inputs:
 *   - Fuel (%) slider or numeric input (0–100)
 *   - Water (gal) numeric input
 *
 * Persists immediately on change via consumablesStore.
 * Shows computed fuel weight, water weight, and total consumables weight.
 * Shows warning if fuel_tank_capacity_gal is not configured.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  consumablesStore,
  FUEL_DENSITY_LB_PER_GAL,
  WATER_DENSITY_LB_PER_GAL,
} from '../../lib/consumablesStore';
import { vehicleSpecStore } from '../../lib/vehicleSpecStore';

interface Props {
  vehicleId: string;
}

// Fuel % presets for quick selection
const FUEL_PRESETS = [
  { label: 'F', value: 100 },
  { label: '3/4', value: 75 },
  { label: '1/2', value: 50 },
  { label: '1/4', value: 25 },
  { label: 'E', value: 0 },
];

export default function ConsumablesSection({ vehicleId }: Props) {
  // ── State ─────────────────────────────────────────────
  const [fuelPercent, setFuelPercent] = useState(100);
  const [waterGal, setWaterGal] = useState('');
  const [waterGalNum, setWaterGalNum] = useState(0);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Spec data ─────────────────────────────────────────
  const spec = vehicleSpecStore.get(vehicleId);
  const hasTankCapacity = !!(spec && spec.fuel_tank_capacity_gal > 0);
  const fuelType = spec?.fuel_type || 'diesel';
  const tankGal = spec?.fuel_tank_capacity_gal || 0;

  // ── Load existing consumables ─────────────────────────
  useEffect(() => {
    const state = consumablesStore.get(vehicleId);
    setFuelPercent(state.fuel_percent_current);
    setWaterGalNum(state.water_gal_current);
    setWaterGal(state.water_gal_current > 0 ? String(state.water_gal_current) : '');
  }, [vehicleId]);

  // ── Subscribe to external changes ─────────────────────
  useEffect(() => {
    const unsub = consumablesStore.subscribe(() => {
      const state = consumablesStore.get(vehicleId);
      setFuelPercent(state.fuel_percent_current);
      setWaterGalNum(state.water_gal_current);
    });
    return unsub;
  }, [vehicleId]);

  // ── Flash saved indicator ─────────────────────────────
  const flashSaved = useCallback(() => {
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 1200);
  }, []);

  // ── Fuel percent change ───────────────────────────────
  const handleFuelPreset = useCallback((value: number) => {
    setFuelPercent(value);
    consumablesStore.setFuelPercent(vehicleId, value);
    flashSaved();
  }, [vehicleId, flashSaved]);

  const handleFuelInputChange = useCallback((text: string) => {
    const num = parseInt(text, 10);
    if (text === '') {
      setFuelPercent(0);
      return;
    }
    if (!isNaN(num)) {
      const clamped = Math.max(0, Math.min(100, num));
      setFuelPercent(clamped);
    }
  }, []);

  const handleFuelInputBlur = useCallback(() => {
    consumablesStore.setFuelPercent(vehicleId, fuelPercent);
    flashSaved();
  }, [vehicleId, fuelPercent, flashSaved]);

  // ── Water gal change ──────────────────────────────────
  const handleWaterChange = useCallback((text: string) => {
    setWaterGal(text);
    const num = parseFloat(text);
    if (!isNaN(num) && num >= 0) {
      setWaterGalNum(num);
    } else if (text === '') {
      setWaterGalNum(0);
    }
  }, []);

  const handleWaterBlur = useCallback(() => {
    const num = parseFloat(waterGal) || 0;
    const clamped = Math.max(0, num);
    setWaterGalNum(clamped);
    setWaterGal(clamped > 0 ? String(clamped) : '');
    consumablesStore.setWaterGal(vehicleId, clamped);
    flashSaved();
  }, [vehicleId, waterGal, flashSaved]);

  // ── Computed weights ──────────────────────────────────
  const fuelGalCurrent = hasTankCapacity ? tankGal * (fuelPercent / 100) : 0;
  const fuelWeightLb = hasTankCapacity
    ? fuelGalCurrent * FUEL_DENSITY_LB_PER_GAL[fuelType]
    : 0;
  const waterWeightLb = waterGalNum * WATER_DENSITY_LB_PER_GAL;
  const consumablesTotal = fuelWeightLb + waterWeightLb;

  // ── Fuel bar color ────────────────────────────────────
  const fuelBarColor = fuelPercent > 50 ? '#66BB6A'
    : fuelPercent > 25 ? TACTICAL.amber
    : fuelPercent > 10 ? '#FFB74D'
    : '#EF5350';

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconWrap}>
          <Ionicons name="beaker-outline" size={14} color="#4FC3F7" />
        </View>
        <Text style={styles.sectionTitle}>CONSUMABLES</Text>
        {saved && (
          <View style={styles.savedBadge}>
            <Ionicons name="checkmark-circle" size={10} color="#66BB6A" />
            <Text style={styles.savedText}>UPDATED</Text>
          </View>
        )}
        {consumablesTotal > 0 && (
          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeText}>
              {Math.round(consumablesTotal).toLocaleString()} lbs
            </Text>
          </View>
        )}
      </View>

      {/* ── Fuel Input ─────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <View style={styles.fieldLabelRow}>
          <Ionicons name="speedometer-outline" size={10} color={TACTICAL.amber} />
          <Text style={styles.fieldLabel}>FUEL LEVEL</Text>
          <Text style={[styles.fieldValue, { color: fuelBarColor }]}>
            {fuelPercent}%
          </Text>
        </View>

        {/* Fuel bar */}
        <View style={styles.fuelBarOuter}>
          <View
            style={[
              styles.fuelBarFill,
              { width: `${fuelPercent}%`, backgroundColor: fuelBarColor },
            ]}
          />
        </View>

        {/* Fuel presets */}
        <View style={styles.presetRow}>
          {FUEL_PRESETS.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[
                styles.presetBtn,
                fuelPercent === p.value && styles.presetBtnActive,
              ]}
              onPress={() => handleFuelPreset(p.value)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.presetBtnText,
                fuelPercent === p.value && styles.presetBtnTextActive,
              ]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Manual input */}
          <View style={styles.fuelInputWrap}>
            <TextInput
              style={styles.fuelInput}
              value={String(fuelPercent)}
              onChangeText={handleFuelInputChange}
              onBlur={handleFuelInputBlur}
              keyboardType="numeric"
              returnKeyType="done"
              maxLength={3}
              selectTextOnFocus
            />
            <Text style={styles.fuelInputUnit}>%</Text>
          </View>
        </View>

        {/* Fuel weight info */}
        {hasTankCapacity ? (
          <Text style={styles.fieldHint}>
            {fuelGalCurrent.toFixed(1)} gal / {tankGal} gal ({fuelType}) = {Math.round(fuelWeightLb).toLocaleString()} lbs
          </Text>
        ) : (
          <View style={styles.warningRow}>
            <Ionicons name="alert-circle-outline" size={10} color="#FFB74D" />
            <Text style={styles.warningText}>
              Set tank capacity in Vehicle Specs to calculate fuel weight.
            </Text>
          </View>
        )}
      </View>

      {/* ── Water Input ────────────────────────────────── */}
      <View style={[styles.fieldGroup, { marginTop: 12 }]}>
        <View style={styles.fieldLabelRow}>
          <Ionicons name="water-outline" size={10} color="#4FC3F7" />
          <Text style={styles.fieldLabel}>WATER ON BOARD</Text>
        </View>

        <View style={styles.waterInputRow}>
          <View style={styles.waterInputWrap}>
            <TextInput
              style={styles.waterInput}
              value={waterGal}
              onChangeText={handleWaterChange}
              onBlur={handleWaterBlur}
              placeholder="0"
              placeholderTextColor="rgba(138,138,133,0.3)"
              keyboardType="decimal-pad"
              returnKeyType="done"
            />
            <Text style={styles.waterInputUnit}>gal</Text>
          </View>

          {waterWeightLb > 0 && (
            <Text style={styles.waterWeightLabel}>
              = {Math.round(waterWeightLb).toLocaleString()} lbs
            </Text>
          )}
        </View>

        <Text style={styles.fieldHint}>
          Water: {WATER_DENSITY_LB_PER_GAL} lbs/gal
        </Text>
      </View>

      {/* ── Consumables Weight Summary ─────────────────── */}
      {consumablesTotal > 0 && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>FUEL</Text>
            <Text style={styles.summaryValue}>
              {hasTankCapacity ? `${Math.round(fuelWeightLb).toLocaleString()}` : '\u2014'}
            </Text>
            <Text style={styles.summaryUnit}>lbs</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>WATER</Text>
            <Text style={styles.summaryValue}>
              {waterWeightLb > 0 ? `${Math.round(waterWeightLb).toLocaleString()}` : '\u2014'}
            </Text>
            <Text style={styles.summaryUnit}>lbs</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>TOTAL</Text>
            <Text style={[styles.summaryValue, { color: '#4FC3F7' }]}>
              {Math.round(consumablesTotal).toLocaleString()}
            </Text>
            <Text style={styles.summaryUnit}>lbs</Text>
          </View>
        </View>
      )}
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
    backgroundColor: 'rgba(79, 195, 247, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4FC3F7',
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
  totalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(79, 195, 247, 0.1)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(79, 195, 247, 0.2)',
  },
  totalBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4FC3F7',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },

  // Field Group
  fieldGroup: {},
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.2,
    flex: 1,
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  fieldHint: {
    fontSize: 8,
    fontWeight: '600',
    color: 'rgba(138,138,133,0.4)',
    marginTop: 4,
    letterSpacing: 0.3,
  },

  // Fuel Bar
  fuelBarOuter: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  fuelBarFill: {
    height: '100%',
    borderRadius: 4,
  },

  // Presets
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  presetBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  presetBtnActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196, 138, 44, 0.15)',
  },
  presetBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  presetBtnTextActive: {
    color: TACTICAL.amber,
  },

  // Fuel manual input
  fuelInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    paddingHorizontal: 6,
    minWidth: 56,
  },
  fuelInput: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.text,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    minWidth: 28,
    textAlign: 'center',
  },
  fuelInputUnit: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // Warning
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 183, 77, 0.06)',
    borderRadius: 4,
  },
  warningText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#FFB74D',
    flex: 1,
    letterSpacing: 0.2,
  },

  // Water Input
  waterInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  waterInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    overflow: 'hidden',
    flex: 1,
    maxWidth: 160,
  },
  waterInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Courier',
    color: TACTICAL.text,
  },
  waterInputUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    paddingRight: 10,
    letterSpacing: 0.5,
  },
  waterWeightLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Courier',
    color: '#4FC3F7',
  },

  // Summary Row
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: TACTICAL.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.3)',
    padding: 10,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  summaryLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'Courier',
    color: TACTICAL.text,
  },
  summaryUnit: {
    fontSize: 7,
    fontWeight: '600',
    color: 'rgba(138,138,133,0.4)',
    letterSpacing: 0.5,
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
  },
});




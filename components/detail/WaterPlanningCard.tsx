import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Switch, ActivityIndicator, Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';

// ============================================================
// PROPS
// ============================================================
interface WaterPlanningCardProps {
  expeditionId: string;
  peopleCount: number;
  waterGalPerPersonPerDay: number;
  waterDailyUseOverride: boolean;
  waterDailyUseGal: number | null;
  onUpdated: () => void;
}

// ============================================================
// COMPONENT
// ============================================================
export default function WaterPlanningCard({
  expeditionId,
  peopleCount,
  waterGalPerPersonPerDay,
  waterDailyUseOverride,
  waterDailyUseGal,
  onUpdated,
}: WaterPlanningCardProps) {
  // ── Local state ──────────────────────────────────────────
  const [people, setPeople] = useState(peopleCount);
  const [galPerPerson, setGalPerPerson] = useState(waterGalPerPersonPerDay);
  const [galPerPersonInput, setGalPerPersonInput] = useState(String(waterGalPerPersonPerDay));
  const [override, setOverride] = useState(waterDailyUseOverride);
  const [manualDailyUse, setManualDailyUse] = useState(waterDailyUseGal ?? 2.0);
  const [manualDailyUseInput, setManualDailyUseInput] = useState(String(waterDailyUseGal ?? 2.0));
  const [dailyUseDisplay, setDailyUseDisplay] = useState(waterDailyUseGal ?? 2.0);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from props when parent refetches
  useEffect(() => {
    setPeople(peopleCount);
    setGalPerPerson(waterGalPerPersonPerDay);
    setGalPerPersonInput(String(waterGalPerPersonPerDay));
    setOverride(waterDailyUseOverride);
    setManualDailyUse(waterDailyUseGal ?? 2.0);
    setManualDailyUseInput(String(waterDailyUseGal ?? 2.0));
    setDailyUseDisplay(waterDailyUseGal ?? 2.0);
  }, [peopleCount, waterGalPerPersonPerDay, waterDailyUseOverride, waterDailyUseGal]);

  // ── Toast helper ─────────────────────────────────────────
  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, msg });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // ── Save to database ─────────────────────────────────────
  const saveField = useCallback(async (updates: Record<string, any>) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('expeditions')
        .update(updates)
        .eq('id', expeditionId);

      if (error) {
        showToast('error', 'UNABLE TO SAVE. TRY AGAIN.');
        setSaving(false);
        return false;
      }

      showToast('success', 'UPDATED');
      // Refetch expedition so UI reflects trigger-computed value
      await onUpdated();
      setSaving(false);
      return true;
    } catch {
      showToast('error', 'UNABLE TO SAVE. TRY AGAIN.');
      setSaving(false);
      return false;
    }
  }, [expeditionId, onUpdated, showToast]);

  // ── People count handlers ────────────────────────────────
  const handlePeopleChange = useCallback(async (delta: number) => {
    const next = Math.max(1, people + delta);
    setPeople(next);
    await saveField({ people_count: next });
  }, [people, saveField]);

  // ── Gal per person handlers ──────────────────────────────
  const handleGalPerPersonSubmit = useCallback(async () => {
    let val = parseFloat(galPerPersonInput);
    if (isNaN(val) || val < 0.5) val = 0.5;
    // Round to nearest 0.25
    val = Math.round(val * 4) / 4;
    setGalPerPerson(val);
    setGalPerPersonInput(String(val));
    await saveField({ water_gal_per_person_per_day: val });
  }, [galPerPersonInput, saveField]);

  const adjustGalPerPerson = useCallback(async (delta: number) => {
    let next = Math.max(0.5, galPerPerson + delta);
    next = Math.round(next * 4) / 4;
    setGalPerPerson(next);
    setGalPerPersonInput(String(next));
    await saveField({ water_gal_per_person_per_day: next });
  }, [galPerPerson, saveField]);

  // ── Override toggle ──────────────────────────────────────
  const handleOverrideToggle = useCallback(async (val: boolean) => {
    setOverride(val);
    await saveField({ water_daily_use_override: val });
  }, [saveField]);

  // ── Manual daily use handlers ────────────────────────────
  const handleManualDailyUseSubmit = useCallback(async () => {
    let val = parseFloat(manualDailyUseInput);
    if (isNaN(val) || val < 0.5) val = 0.5;
    val = Math.round(val * 4) / 4;
    setManualDailyUse(val);
    setManualDailyUseInput(String(val));
    await saveField({ water_daily_use_gal: val });
  }, [manualDailyUseInput, saveField]);

  const adjustManualDailyUse = useCallback(async (delta: number) => {
    let next = Math.max(0.5, manualDailyUse + delta);
    next = Math.round(next * 4) / 4;
    setManualDailyUse(next);
    setManualDailyUseInput(String(next));
    await saveField({ water_daily_use_gal: next });
  }, [manualDailyUse, saveField]);

  // ── High consumption warning ─────────────────────────────
  const showHighConsumptionWarning = people >= 4;

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.cardHeader}>
        <View style={s.headerLeft}>
          <Ionicons name="beaker-outline" size={16} color={TACTICAL.amber} />
          <View>
            <Text style={s.cardTitle}>WATER PLANNING</Text>
            <Text style={s.cardSubtitle}>Consumption model used for water projections</Text>
          </View>
        </View>
        {saving && (
          <ActivityIndicator size="small" color={TACTICAL.accent} />
        )}
      </View>

      {/* ── ROW 1: PEOPLE COUNT ────────────────────────────── */}
      <View style={s.row}>
        <View style={s.rowLabelCol}>
          <Text style={s.rowLabel}>PEOPLE COUNT</Text>
          <View style={s.rowLabelIcon}>
            <Ionicons name="people-outline" size={14} color={TACTICAL.textMuted} />
          </View>
        </View>
        <View style={s.stepperContainer}>
          <TouchableOpacity
            style={[s.stepperBtn, people <= 1 && s.stepperBtnDisabled]}
            onPress={() => handlePeopleChange(-1)}
            disabled={saving || people <= 1}
          >
            <Ionicons name="remove" size={20} color={people <= 1 ? TACTICAL.textMuted : TACTICAL.text} />
          </TouchableOpacity>
          <View style={s.stepperValueBox}>
            <Text style={s.stepperValue}>{people}</Text>
          </View>
          <TouchableOpacity
            style={s.stepperBtn}
            onPress={() => handlePeopleChange(1)}
            disabled={saving}
          >
            <Ionicons name="add" size={20} color={TACTICAL.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* High consumption warning */}
      {showHighConsumptionWarning && (
        <View style={s.warningBanner}>
          <Ionicons name="alert-circle-outline" size={14} color={TACTICAL.amber} />
          <Text style={s.warningText}>
            High consumption profile — verify resupply plan
          </Text>
        </View>
      )}

      {/* ── ROW 2: GAL / PERSON / DAY ─────────────────────── */}
      <View style={s.row}>
        <View style={s.rowLabelCol}>
          <Text style={s.rowLabel}>GAL / PERSON / DAY</Text>
          <View style={s.rowLabelIcon}>
            <Ionicons name="water-outline" size={14} color={TACTICAL.textMuted} />
          </View>
        </View>
        <View style={s.numericInputRow}>
          <TouchableOpacity
            style={[s.adjustBtn, galPerPerson <= 0.5 && s.stepperBtnDisabled]}
            onPress={() => adjustGalPerPerson(-0.25)}
            disabled={saving || galPerPerson <= 0.5}
          >
            <Ionicons name="remove" size={16} color={galPerPerson <= 0.5 ? TACTICAL.textMuted : TACTICAL.text} />
          </TouchableOpacity>
          <View style={s.numericInputWrap}>
            <TextInput
              style={s.numericInput}
              value={galPerPersonInput}
              onChangeText={setGalPerPersonInput}
              onBlur={handleGalPerPersonSubmit}
              onSubmitEditing={handleGalPerPersonSubmit}
              keyboardType="numeric"
              maxLength={5}
              selectTextOnFocus
              editable={!saving}
            />
            <Text style={s.numericUnit}>gal</Text>
          </View>
          <TouchableOpacity
            style={s.adjustBtn}
            onPress={() => adjustGalPerPerson(0.25)}
            disabled={saving}
          >
            <Ionicons name="add" size={16} color={TACTICAL.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── ROW 3: MANUAL OVERRIDE TOGGLE ─────────────────── */}
      <View style={s.row}>
        <View style={s.rowLabelCol}>
          <Text style={s.rowLabel}>MANUAL OVERRIDE DAILY USE</Text>
          <View style={s.rowLabelIcon}>
            <Ionicons name="construct-outline" size={14} color={TACTICAL.textMuted} />
          </View>
        </View>
        <Switch
          value={override}
          onValueChange={handleOverrideToggle}
          disabled={saving}
          trackColor={{ false: 'rgba(62,79,60,0.35)', true: 'rgba(62,79,60,0.7)' }}
          thumbColor={override ? TACTICAL.accent : TACTICAL.textMuted}
          ios_backgroundColor="rgba(62,79,60,0.25)"
        />
      </View>

      {/* ── ROW 4: DAILY WATER USE OUTPUT ─────────────────── */}
      <View style={s.outputSection}>
        <View style={s.outputHeader}>
          <Ionicons name="analytics-outline" size={14} color={TACTICAL.amber} />
          <Text style={s.outputLabel}>DAILY WATER USE (GAL/DAY)</Text>
        </View>

        {!override ? (
          /* Auto-calculated (read-only) */
          <View style={s.outputReadOnly}>
            <Text style={s.outputValue}>
              {dailyUseDisplay != null ? dailyUseDisplay : '--'}
            </Text>
            <Text style={s.outputUnit}>GAL/DAY</Text>
            <View style={s.outputHelperRow}>
              <Ionicons name="calculator-outline" size={11} color={TACTICAL.textMuted} />
              <Text style={s.outputHelper}>Auto-calculated from people count</Text>
            </View>
            <View style={s.outputBreakdown}>
              <Text style={s.breakdownText}>
                {people} {people === 1 ? 'person' : 'people'} x {galPerPerson} gal/person/day = {dailyUseDisplay ?? '--'} gal/day
              </Text>
            </View>
          </View>
        ) : (
          /* Manual override (editable) */
          <View style={s.outputEditable}>
            <View style={s.numericInputRow}>
              <TouchableOpacity
                style={[s.adjustBtn, manualDailyUse <= 0.5 && s.stepperBtnDisabled]}
                onPress={() => adjustManualDailyUse(-0.25)}
                disabled={saving || manualDailyUse <= 0.5}
              >
                <Ionicons name="remove" size={16} color={manualDailyUse <= 0.5 ? TACTICAL.textMuted : TACTICAL.text} />
              </TouchableOpacity>
              <View style={s.numericInputWrapLarge}>
                <TextInput
                  style={s.numericInputLarge}
                  value={manualDailyUseInput}
                  onChangeText={setManualDailyUseInput}
                  onBlur={handleManualDailyUseSubmit}
                  onSubmitEditing={handleManualDailyUseSubmit}
                  keyboardType="numeric"
                  maxLength={6}
                  selectTextOnFocus
                  editable={!saving}
                />
                <Text style={s.numericUnitLarge}>GAL/DAY</Text>
              </View>
              <TouchableOpacity
                style={s.adjustBtn}
                onPress={() => adjustManualDailyUse(0.25)}
                disabled={saving}
              >
                <Ionicons name="add" size={16} color={TACTICAL.text} />
              </TouchableOpacity>
            </View>
            <View style={s.outputHelperRow}>
              <Ionicons name="construct-outline" size={11} color={TACTICAL.amber} />
              <Text style={[s.outputHelper, { color: TACTICAL.amber }]}>
                Overrides automatic calculation
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Toast ───────────────────────────────────────────── */}
      {toast && (
        <View style={[
          s.toastBox,
          toast.type === 'success' ? s.toastSuccess : s.toastError,
        ]}>
          <Ionicons
            name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={14}
            color={toast.type === 'success' ? TACTICAL.successText : TACTICAL.danger}
          />
          <Text style={[
            s.toastText,
            { color: toast.type === 'success' ? TACTICAL.successText : TACTICAL.danger },
          ]}>
            {toast.msg}
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  card: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
    marginBottom: 16,
  },

  // Header
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.2)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  cardSubtitle: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    marginTop: 3,
    letterSpacing: 0.3,
  },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.15)',
  },
  rowLabelCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  rowLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  rowLabelIcon: {
    opacity: 0.6,
  },

  // Stepper (people count)
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
    backgroundColor: TACTICAL.bg,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(62,79,60,0.15)',
  },
  stepperBtnDisabled: {
    opacity: 0.35,
  },
  stepperValueBox: {
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(62,79,60,0.2)',
  },
  stepperValue: {
    fontSize: 22,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    letterSpacing: -0.5,
  },

  // Numeric input row (gal per person)
  numericInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adjustBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.15)',
  },
  numericInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    backgroundColor: TACTICAL.bg,
    paddingHorizontal: 8,
    height: 36,
    minWidth: 70,
  },
  numericInput: {
    fontSize: 16,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    textAlign: 'center',
    minWidth: 40,
    padding: 0,
  },
  numericUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    marginLeft: 4,
  },

  // Warning banner
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: -4,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(196,138,44,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
  },
  warningText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.amber,
    letterSpacing: 0.3,
    flex: 1,
    fontStyle: 'italic',
  },

  // Output section
  outputSection: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  outputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  outputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },

  // Read-only output
  outputReadOnly: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.2)',
  },
  outputValue: {
    fontSize: 36,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    letterSpacing: -1,
    lineHeight: 40,
  },
  outputUnit: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginTop: 2,
  },
  outputHelperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },
  outputHelper: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    fontStyle: 'italic',
  },
  outputBreakdown: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.15)',
  },
  breakdownText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    fontFamily: 'Courier',
    textAlign: 'center',
  },

  // Editable output
  outputEditable: {
    paddingVertical: 8,
    gap: 8,
  },
  numericInputWrapLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.accent,
    borderRadius: 10,
    backgroundColor: TACTICAL.bg,
    paddingHorizontal: 12,
    height: 50,
    flex: 1,
  },
  numericInputLarge: {
    fontSize: 26,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    textAlign: 'center',
    minWidth: 60,
    padding: 0,
  },
  numericUnitLarge: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginLeft: 8,
  },

  // Toast
  toastBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  toastSuccess: {
    backgroundColor: 'rgba(62,107,62,0.12)',
    borderColor: 'rgba(62,107,62,0.3)',
  },
  toastError: {
    backgroundColor: 'rgba(192,57,43,0.12)',
    borderColor: 'rgba(192,57,43,0.3)',
  },
  toastText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});




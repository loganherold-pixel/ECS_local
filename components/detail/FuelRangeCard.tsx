import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';

// ============================================================
// FUEL RANGE CALCULATIONS
// ============================================================

export function computeFuelRange(
  tankCapGal: number | null | undefined,
  avgMpg: number | null | undefined,
  fuelPct: number | null | undefined,
): number | null {
  if (!tankCapGal || !avgMpg || fuelPct == null) return null;
  if (tankCapGal <= 0 || avgMpg <= 0 || fuelPct < 0) return null;
  return Math.round(tankCapGal * avgMpg * (fuelPct / 100));
}

export function getFuelRangeColor(miles: number): string {
  if (miles > 250) return '#4CAF50';       // Green
  if (miles >= 100) return TACTICAL.amber;  // Amber
  return TACTICAL.danger;                   // Red
}

export function getFuelRangeStatus(miles: number): string {
  if (miles > 250) return 'NOMINAL';
  if (miles >= 100) return 'LOW';
  return 'CRITICAL';
}

export function getFuelRangeIcon(miles: number): string {
  if (miles > 250) return 'speedometer-outline';
  if (miles >= 100) return 'speedometer-outline';
  return 'warning-outline';
}

export function getFuelLevelColor(pct: number): string {
  if (pct > 50) return '#4CAF50';
  if (pct > 25) return TACTICAL.amber;
  return TACTICAL.danger;
}

// ============================================================
// FUEL RANGE CARD COMPONENT
// ============================================================

interface FuelRangeCardProps {
  vehicleId: string | null;
  tankCapGal: number | null;
  avgMpg: number | null;
  currentFuelPct: number | null;
  vehicleName: string | null;
  onFuelUpdated: () => void;
}

const FUEL_PRESETS = [10, 25, 50, 75, 100];

export default function FuelRangeCard({
  vehicleId,
  tankCapGal,
  avgMpg,
  currentFuelPct,
  vehicleName,
  onFuelUpdated,
}: FuelRangeCardProps) {
  const [showUpdate, setShowUpdate] = useState(false);
  const [fuelInput, setFuelInput] = useState(String(currentFuelPct ?? 100));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const fuelPct = currentFuelPct ?? 0;
  const fuelRange = computeFuelRange(tankCapGal, avgMpg, fuelPct);
  const hasVehicleData = tankCapGal && avgMpg;

  const handleSaveFuel = async (pct: number) => {
    if (!vehicleId) return;
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    setSaving(true);
    setSaveMsg(null);
    try {
      const { error } = await supabase
        .from('vehicles')
        .update({ current_fuel_percent: clamped })
        .eq('id', vehicleId);
      if (error) {
        setSaveMsg('UPDATE FAILED');
      } else {
        setSaveMsg(`FUEL UPDATED: ${clamped}%`);
        setFuelInput(String(clamped));
        onFuelUpdated();
        setTimeout(() => setSaveMsg(null), 2500);
      }
    } catch {
      setSaveMsg('UNEXPECTED ERROR');
    }
    setSaving(false);
  };

  const handleInputSubmit = () => {
    const val = parseFloat(fuelInput);
    if (!isNaN(val)) {
      handleSaveFuel(val);
    }
  };

  const adjustFuel = (delta: number) => {
    const current = parseFloat(fuelInput) || 0;
    const next = Math.max(0, Math.min(100, current + delta));
    setFuelInput(String(next));
    handleSaveFuel(next);
  };

  // No vehicle linked
  if (!vehicleId) {
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Ionicons name="speedometer-outline" size={16} color={TACTICAL.textMuted} />
          <Text style={s.cardTitle}>FUEL RANGE ESTIMATE</Text>
        </View>
        <View style={s.noDataBox}>
          <Ionicons name="car-outline" size={24} color={TACTICAL.textMuted} />
          <Text style={s.noDataText}>NO VEHICLE LINKED</Text>
          <Text style={s.noDataSub}>Assign a vehicle in Overview to enable fuel tracking</Text>
        </View>
      </View>
    );
  }

  // Vehicle linked but missing fuel data
  if (!hasVehicleData) {
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Ionicons name="speedometer-outline" size={16} color={TACTICAL.textMuted} />
          <Text style={s.cardTitle}>FUEL RANGE ESTIMATE</Text>
        </View>
        <View style={s.noDataBox}>
          <Ionicons name="flask-outline" size={24} color={TACTICAL.amber} />
          <Text style={[s.noDataText, { color: TACTICAL.amber }]}>VEHICLE DATA INCOMPLETE</Text>
          <Text style={s.noDataSub}>
            Set tank capacity ({tankCapGal ? 'OK' : 'MISSING'}) and avg MPG ({avgMpg ? 'OK' : 'MISSING'}) on your vehicle
          </Text>
        </View>
      </View>
    );
  }

  const rangeColor = fuelRange !== null ? getFuelRangeColor(fuelRange) : TACTICAL.textMuted;
  const rangeStatus = fuelRange !== null ? getFuelRangeStatus(fuelRange) : '--';
  const rangeIcon = fuelRange !== null ? getFuelRangeIcon(fuelRange) : 'speedometer-outline';
  const levelColor = getFuelLevelColor(fuelPct);
  const isEmergency = fuelRange !== null && fuelRange < 100;
  const gallonsRemaining = tankCapGal ? Math.round(tankCapGal * (fuelPct / 100) * 10) / 10 : 0;

  return (
    <View style={s.card}>
      {/* Emergency Warning */}
      {isEmergency && (
        <View style={s.emergencyBanner}>
          <Ionicons name="warning" size={14} color={TACTICAL.danger} />
          <Text style={s.emergencyText}>LOW FUEL WARNING</Text>
          <Ionicons name="warning" size={14} color={TACTICAL.danger} />
        </View>
      )}

      {/* Header */}
      <View style={s.cardHeader}>
        <Ionicons name={rangeIcon as any} size={16} color={rangeColor} />
        <Text style={s.cardTitle}>FUEL RANGE ESTIMATE</Text>
        <View style={[s.statusChip, { borderColor: rangeColor }]}>
          <Text style={[s.statusChipText, { color: rangeColor }]}>{rangeStatus}</Text>
        </View>
      </View>

      {/* Main Range Display */}
      <View style={s.rangeDisplay}>
        <Text style={[s.rangeValue, { color: rangeColor }]}>
          {fuelRange !== null ? fuelRange : '--'}
        </Text>
        <Text style={[s.rangeUnit, { color: rangeColor }]}>MILES</Text>
      </View>

      {/* Fuel Level Bar */}
      <View style={s.fuelBarSection}>
        <View style={s.fuelBarHeader}>
          <Text style={s.fuelBarLabel}>FUEL LEVEL</Text>
          <Text style={[s.fuelBarPct, { color: levelColor }]}>{Math.round(fuelPct)}%</Text>
        </View>
        <View style={s.fuelBarTrack}>
          <View style={[s.fuelBarFill, { width: `${Math.min(100, fuelPct)}%`, backgroundColor: levelColor }]} />
          {/* Tick marks */}
          <View style={[s.fuelBarTick, { left: '25%' }]} />
          <View style={[s.fuelBarTick, { left: '50%' }]} />
          <View style={[s.fuelBarTick, { left: '75%' }]} />
        </View>
        <View style={s.fuelBarMeta}>
          <Text style={s.fuelBarMetaText}>{gallonsRemaining} GAL REMAINING</Text>
          <Text style={s.fuelBarMetaText}>{tankCapGal} GAL TANK</Text>
        </View>
      </View>

      {/* Vehicle Info */}
      <View style={s.vehicleInfo}>
        <View style={s.vehicleInfoRow}>
          <Ionicons name="car-outline" size={12} color={TACTICAL.textMuted} />
          <Text style={s.vehicleInfoText}>{vehicleName || 'VEHICLE'}</Text>
        </View>
        <View style={s.vehicleInfoRow}>
          <Ionicons name="flask-outline" size={12} color={TACTICAL.textMuted} />
          <Text style={s.vehicleInfoText}>{tankCapGal} GAL @ {avgMpg} MPG</Text>
        </View>
      </View>

      {/* Update Fuel Button */}
      <TouchableOpacity
        style={s.updateToggle}
        onPress={() => setShowUpdate(!showUpdate)}
      >
        <Ionicons
          name={showUpdate ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={14}
          color={TACTICAL.amber}
        />
        <Text style={s.updateToggleText}>
          {showUpdate ? 'HIDE FUEL UPDATE' : 'UPDATE FUEL LEVEL'}
        </Text>
      </TouchableOpacity>

      {/* Manual Fuel Update Panel */}
      {showUpdate && (
        <View style={s.updatePanel}>
          {/* Preset Buttons */}
          <Text style={s.updateLabel}>QUICK SET</Text>
          <View style={s.presetRow}>
            {FUEL_PRESETS.map(pct => (
              <TouchableOpacity
                key={pct}
                style={[
                  s.presetBtn,
                  Math.round(fuelPct) === pct && { borderColor: TACTICAL.amber, backgroundColor: 'rgba(196,138,44,0.15)' },
                ]}
                onPress={() => handleSaveFuel(pct)}
                disabled={saving}
              >
                <Text style={[
                  s.presetBtnText,
                  Math.round(fuelPct) === pct && { color: TACTICAL.amber },
                ]}>
                  {pct}%
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Fine Adjustment */}
          <Text style={[s.updateLabel, { marginTop: 12 }]}>FINE ADJUST</Text>
          <View style={s.fineAdjustRow}>
            <TouchableOpacity
              style={s.adjustBtn}
              onPress={() => adjustFuel(-5)}
              disabled={saving}
            >
              <Ionicons name="remove" size={18} color={TACTICAL.text} />
              <Text style={s.adjustBtnLabel}>-5</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.adjustBtn}
              onPress={() => adjustFuel(-1)}
              disabled={saving}
            >
              <Ionicons name="remove" size={14} color={TACTICAL.textMuted} />
              <Text style={s.adjustBtnLabel}>-1</Text>
            </TouchableOpacity>

            <View style={s.fuelInputWrap}>
              <TextInput
                style={s.fuelInput}
                value={fuelInput}
                onChangeText={setFuelInput}
                onSubmitEditing={handleInputSubmit}
                keyboardType="numeric"
                maxLength={3}
                selectTextOnFocus
              />
              <Text style={s.fuelInputUnit}>%</Text>
            </View>

            <TouchableOpacity
              style={s.adjustBtn}
              onPress={() => adjustFuel(1)}
              disabled={saving}
            >
              <Ionicons name="add" size={14} color={TACTICAL.textMuted} />
              <Text style={s.adjustBtnLabel}>+1</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.adjustBtn}
              onPress={() => adjustFuel(5)}
              disabled={saving}
            >
              <Ionicons name="add" size={18} color={TACTICAL.text} />
              <Text style={s.adjustBtnLabel}>+5</Text>
            </TouchableOpacity>
          </View>

          {/* Submit custom value */}
          <TouchableOpacity
            style={s.submitBtn}
            onPress={handleInputSubmit}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={TACTICAL.text} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={16} color={TACTICAL.text} />
                <Text style={s.submitBtnText}>SET FUEL LEVEL</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Save message */}
          {saveMsg && (
            <View style={[s.saveMsgBox, saveMsg.includes('FAILED') || saveMsg.includes('ERROR') ? s.saveMsgError : s.saveMsgSuccess]}>
              <Ionicons
                name={saveMsg.includes('FAILED') || saveMsg.includes('ERROR') ? 'alert-circle' : 'checkmark-circle'}
                size={14}
                color={saveMsg.includes('FAILED') || saveMsg.includes('ERROR') ? TACTICAL.danger : TACTICAL.successText}
              />
              <Text style={[
                s.saveMsgText,
                { color: saveMsg.includes('FAILED') || saveMsg.includes('ERROR') ? TACTICAL.danger : TACTICAL.successText },
              ]}>
                {saveMsg}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
    marginBottom: 16,
  },
  emergencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: 'rgba(192,57,43,0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(192,57,43,0.3)',
  },
  emergencyText: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.danger,
    letterSpacing: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
    flex: 1,
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusChipText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  rangeDisplay: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rangeValue: {
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 52,
    fontFamily: 'Courier',
  },
  rangeUnit: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 4,
    marginTop: 2,
  },
  fuelBarSection: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  fuelBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  fuelBarLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  fuelBarPct: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  fuelBarTrack: {
    height: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 5,
    overflow: 'hidden',
    position: 'relative',
  },
  fuelBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  fuelBarTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  fuelBarMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  fuelBarMetaText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  vehicleInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.2)',
  },
  vehicleInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  vehicleInfoText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  updateToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  updateToggleText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  updatePanel: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.2)',
    paddingTop: 12,
  },
  updateLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.bg,
  },
  presetBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  fineAdjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adjustBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.bg,
  },
  adjustBtnLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  fuelInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 10,
    backgroundColor: TACTICAL.bg,
    height: 44,
    paddingHorizontal: 8,
  },
  fuelInput: {
    fontSize: 20,
    fontWeight: '900',
    color: TACTICAL.text,
    textAlign: 'center',
    fontFamily: 'Courier',
    minWidth: 50,
    padding: 0,
  },
  fuelInputUnit: {
    fontSize: 14,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    marginLeft: 2,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    backgroundColor: TACTICAL.accent,
    borderRadius: 10,
  },
  submitBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  saveMsgBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  saveMsgSuccess: {
    backgroundColor: 'rgba(62,107,62,0.12)',
    borderColor: 'rgba(62,107,62,0.3)',
  },
  saveMsgError: {
    backgroundColor: 'rgba(192,57,43,0.12)',
    borderColor: 'rgba(192,57,43,0.3)',
  },
  saveMsgText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  noDataBox: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 6,
  },
  noDataText: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  noDataSub: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});




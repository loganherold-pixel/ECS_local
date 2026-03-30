import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';

// ============================================================
// WATER CALCULATIONS (exported for metrics strip)
// ============================================================

export function computeWaterPercent(
  currentGal: number | null | undefined,
  capacityGal: number | null | undefined,
): number | null {
  if (currentGal == null || !capacityGal || capacityGal <= 0) return null;
  return Math.round((currentGal / capacityGal) * 100);
}

export function computeProjectedDays(
  currentGal: number | null | undefined,
  dailyUseGal: number | null | undefined,
): number | null {
  const daily = dailyUseGal ?? 2.0;
  if (currentGal == null || daily <= 0) return null;
  return Math.round((currentGal / daily) * 10) / 10;
}

export function getWaterColor(pct: number): string {
  if (pct >= 50) return '#4CAF50';       // Green
  if (pct >= 20) return TACTICAL.amber;  // Amber
  return TACTICAL.danger;                // Red
}

export function getWaterStatus(pct: number): string {
  if (pct >= 50) return 'NOMINAL';
  if (pct >= 20) return 'LOW';
  return 'CRITICAL';
}

export function getWaterIcon(pct: number): string {
  if (pct >= 50) return 'water-outline';
  if (pct >= 20) return 'water-outline';
  return 'warning-outline';
}

/** Format relative time from a timestamp */
function formatTimeAgo(timestamp: string | null | undefined): string {
  if (!timestamp) return 'NEVER';
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'JUST NOW';
  if (mins < 60) return `${mins}m AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h AGO`;
  const days = Math.floor(hrs / 24);
  return `${days}d AGO`;
}

// ============================================================
// COMPONENT PROPS
// ============================================================

interface WaterRemainingCardProps {
  vehicleId: string | null;
  waterCapacityGal: number | null;
  currentWaterGal: number | null;
  waterDailyUseGal: number | null;
  waterUpdatedAt: string | null;
  vehicleName: string | null;
  onWaterUpdated: () => void;
}

const WATER_PRESETS_PCT = [10, 25, 50, 75, 100];

export default function WaterRemainingCard({
  vehicleId,
  waterCapacityGal,
  currentWaterGal,
  waterDailyUseGal,
  waterUpdatedAt,
  vehicleName,
  onWaterUpdated,
}: WaterRemainingCardProps) {
  const [showUpdate, setShowUpdate] = useState(false);
  const [waterInput, setWaterInput] = useState(String(currentWaterGal ?? 0));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const dailyUse = waterDailyUseGal ?? 2.0;
  const waterGal = currentWaterGal ?? 0;
  const capacity = waterCapacityGal ?? 0;
  const hasCapacity = waterCapacityGal != null && waterCapacityGal > 0;

  const waterPct = useMemo(() => computeWaterPercent(waterGal, capacity), [waterGal, capacity]);
  const projectedDays = useMemo(() => computeProjectedDays(waterGal, dailyUse), [waterGal, dailyUse]);

  const handleSaveWater = async (gal: number) => {
    if (!vehicleId) return;
    const clamped = Math.max(0, Math.min(capacity, Math.round(gal * 10) / 10));
    setSaving(true);
    setSaveMsg(null);
    try {
      const { error } = await supabase
        .from('vehicles')
        .update({
          current_water_gal: clamped,
          water_updated_at: new Date().toISOString(),
        })
        .eq('id', vehicleId);
      if (error) {
        setSaveMsg('UPDATE FAILED');
      } else {
        setSaveMsg(`WATER UPDATED: ${clamped} GAL`);
        setWaterInput(String(clamped));
        onWaterUpdated();
        setTimeout(() => setSaveMsg(null), 2500);
      }
    } catch {
      setSaveMsg('UNEXPECTED ERROR');
    }
    setSaving(false);
  };

  const handleInputSubmit = () => {
    const val = parseFloat(waterInput);
    if (!isNaN(val)) {
      handleSaveWater(val);
    }
  };

  const adjustWater = (delta: number) => {
    const current = parseFloat(waterInput) || 0;
    const next = Math.max(0, Math.min(capacity, current + delta));
    setWaterInput(String(Math.round(next * 10) / 10));
    handleSaveWater(next);
  };

  const handlePresetPct = (pct: number) => {
    if (!hasCapacity) return;
    const gal = Math.round((pct / 100) * capacity * 10) / 10;
    handleSaveWater(gal);
  };

  // ── No vehicle linked ────────────────────────────────────
  if (!vehicleId) {
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Ionicons name="water-outline" size={16} color={TACTICAL.textMuted} />
          <Text style={s.cardTitle}>WATER REMAINING</Text>
        </View>
        <View style={s.noDataBox}>
          <Ionicons name="car-outline" size={24} color={TACTICAL.textMuted} />
          <Text style={s.noDataText}>NO VEHICLE LINKED</Text>
          <Text style={s.noDataSub}>Assign a vehicle in Overview to enable water tracking</Text>
        </View>
      </View>
    );
  }

  // ── Vehicle linked but no water capacity set ─────────────
  if (!hasCapacity) {
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Ionicons name="water-outline" size={16} color={TACTICAL.textMuted} />
          <Text style={s.cardTitle}>WATER REMAINING</Text>
        </View>
        <View style={[s.disabledOverlay]}>
          <Ionicons name="water-outline" size={28} color={TACTICAL.textMuted} />
          <Text style={[s.noDataText, { color: TACTICAL.amber }]}>WATER TANK NOT CONFIGURED</Text>
          <Text style={s.noDataSub}>Set water tank capacity in Vehicle Profile.</Text>
        </View>
      </View>
    );
  }

  // ── Full card ────────────────────────────────────────────
  const pct = waterPct ?? 0;
  const color = getWaterColor(pct);
  const status = getWaterStatus(pct);
  const icon = getWaterIcon(pct);
  const isCritical = pct < 20;
  const timeAgo = formatTimeAgo(waterUpdatedAt);

  return (
    <View style={s.card}>
      {/* Critical Warning Banner */}
      {isCritical && (
        <View style={s.criticalBanner}>
          <Ionicons name="warning" size={14} color={TACTICAL.danger} />
          <Text style={s.criticalText}>LOW WATER WARNING</Text>
          <Ionicons name="warning" size={14} color={TACTICAL.danger} />
        </View>
      )}

      {/* Header */}
      <View style={s.cardHeader}>
        <Ionicons name={icon as any} size={16} color={color} />
        <Text style={s.cardTitle}>WATER REMAINING</Text>
        <View style={[s.statusChip, { borderColor: color }]}>
          <Text style={[s.statusChipText, { color }]}>{status}</Text>
        </View>
      </View>

      {/* Main Display */}
      <View style={s.mainDisplay}>
        <View style={s.mainValueRow}>
          <Text style={[s.mainPct, { color }]}>{pct}%</Text>
          <View style={s.mainDivider} />
          <View style={s.mainGalCol}>
            <Text style={[s.mainGalValue, { color }]}>
              {waterGal}/{capacity}
            </Text>
            <Text style={s.mainGalUnit}>GAL</Text>
          </View>
        </View>
      </View>

      {/* Projected Days */}
      <View style={s.projectedRow}>
        <Ionicons name="calendar-outline" size={13} color={TACTICAL.textMuted} />
        <Text style={s.projectedLabel}>PROJECTED:</Text>
        <Text style={[s.projectedValue, { color }]}>
          {projectedDays !== null ? projectedDays : '--'} DAYS
        </Text>
        <Text style={s.projectedMeta}>@ {dailyUse} gal/day</Text>
      </View>

      {/* Water Level Bar */}
      <View style={s.barSection}>
        <View style={s.barHeader}>
          <Text style={s.barLabel}>WATER LEVEL</Text>
          <Text style={[s.barPctText, { color }]}>{pct}%</Text>
        </View>
        <View style={s.barTrack}>
          <View style={[s.barFill, { width: `${Math.min(100, pct)}%`, backgroundColor: color }]} />
          <View style={[s.barTick, { left: '25%' }]} />
          <View style={[s.barTick, { left: '50%' }]} />
          <View style={[s.barTick, { left: '75%' }]} />
        </View>
        <View style={s.barMeta}>
          <Text style={s.barMetaText}>{waterGal} GAL REMAINING</Text>
          <Text style={s.barMetaText}>{capacity} GAL CAPACITY</Text>
        </View>
      </View>

      {/* Vehicle Info + Updated Timestamp */}
      <View style={s.infoRow}>
        <View style={s.infoLeft}>
          <Ionicons name="car-outline" size={12} color={TACTICAL.textMuted} />
          <Text style={s.infoText}>{vehicleName || 'VEHICLE'}</Text>
        </View>
        <View style={s.infoRight}>
          <Ionicons name="time-outline" size={11} color={TACTICAL.textMuted} />
          <Text style={s.infoTimestamp}>UPDATED: {timeAgo}</Text>
        </View>
      </View>

      {/* Update Toggle */}
      <TouchableOpacity
        style={s.updateToggle}
        onPress={() => {
          setShowUpdate(!showUpdate);
          setWaterInput(String(waterGal));
        }}
      >
        <Ionicons
          name={showUpdate ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={14}
          color={TACTICAL.amber}
        />
        <Text style={s.updateToggleText}>
          {showUpdate ? 'HIDE WATER UPDATE' : 'UPDATE WATER LEVEL'}
        </Text>
      </TouchableOpacity>

      {/* Manual Water Update Panel */}
      {showUpdate && (
        <View style={s.updatePanel}>
          {/* Preset Buttons (by percentage of capacity) */}
          <Text style={s.updateLabel}>QUICK SET (% OF CAPACITY)</Text>
          <View style={s.presetRow}>
            {WATER_PRESETS_PCT.map(p => {
              const galForPct = Math.round((p / 100) * capacity * 10) / 10;
              const isSelected = Math.abs(waterGal - galForPct) < 0.2;
              return (
                <TouchableOpacity
                  key={p}
                  style={[
                    s.presetBtn,
                    isSelected && { borderColor: TACTICAL.amber, backgroundColor: 'rgba(196,138,44,0.15)' },
                  ]}
                  onPress={() => handlePresetPct(p)}
                  disabled={saving}
                >
                  <Text style={[
                    s.presetBtnText,
                    isSelected && { color: TACTICAL.amber },
                  ]}>
                    {p}%
                  </Text>
                  <Text style={s.presetBtnSub}>{galForPct}g</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Fine Adjustment */}
          <Text style={[s.updateLabel, { marginTop: 12 }]}>FINE ADJUST (GALLONS)</Text>
          <View style={s.fineAdjustRow}>
            <TouchableOpacity
              style={s.adjustBtn}
              onPress={() => adjustWater(-5)}
              disabled={saving}
            >
              <Ionicons name="remove" size={18} color={TACTICAL.text} />
              <Text style={s.adjustBtnLabel}>-5</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.adjustBtn}
              onPress={() => adjustWater(-1)}
              disabled={saving}
            >
              <Ionicons name="remove" size={14} color={TACTICAL.textMuted} />
              <Text style={s.adjustBtnLabel}>-1</Text>
            </TouchableOpacity>

            <View style={s.waterInputWrap}>
              <TextInput
                style={s.waterInput}
                value={waterInput}
                onChangeText={setWaterInput}
                onSubmitEditing={handleInputSubmit}
                keyboardType="numeric"
                maxLength={5}
                selectTextOnFocus
              />
              <Text style={s.waterInputUnit}>gal</Text>
            </View>

            <TouchableOpacity
              style={s.adjustBtn}
              onPress={() => adjustWater(1)}
              disabled={saving}
            >
              <Ionicons name="add" size={14} color={TACTICAL.textMuted} />
              <Text style={s.adjustBtnLabel}>+1</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.adjustBtn}
              onPress={() => adjustWater(5)}
              disabled={saving}
            >
              <Ionicons name="add" size={18} color={TACTICAL.text} />
              <Text style={s.adjustBtnLabel}>+5</Text>
            </TouchableOpacity>
          </View>

          {/* Submit */}
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
                <Text style={s.submitBtnText}>SET WATER LEVEL</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Save message */}
          {saveMsg && (
            <View style={[
              s.saveMsgBox,
              saveMsg.includes('FAILED') || saveMsg.includes('ERROR') ? s.saveMsgError : s.saveMsgSuccess,
            ]}>
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
  criticalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: 'rgba(192,57,43,0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(192,57,43,0.3)',
  },
  criticalText: {
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

  // Main display
  mainDisplay: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  mainValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  mainPct: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 46,
    fontFamily: 'Courier',
  },
  mainDivider: {
    width: 2,
    height: 36,
    backgroundColor: 'rgba(62,79,60,0.4)',
    borderRadius: 1,
  },
  mainGalCol: {
    alignItems: 'center',
  },
  mainGalValue: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: -0.5,
  },
  mainGalUnit: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginTop: 2,
  },

  // Projected days
  projectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  projectedLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  projectedValue: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    fontFamily: 'Courier',
  },
  projectedMeta: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    marginLeft: 'auto',
  },

  // Water level bar
  barSection: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  barLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  barPctText: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  barTrack: {
    height: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 5,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
  },
  barTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  barMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  barMetaText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // Vehicle info + timestamp
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.2)',
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  infoTimestamp: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // Update toggle
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

  // Update panel
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
    gap: 6,
  },
  presetBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
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
  presetBtnSub: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    marginTop: 2,
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
  waterInputWrap: {
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
  waterInput: {
    fontSize: 20,
    fontWeight: '900',
    color: TACTICAL.text,
    textAlign: 'center',
    fontFamily: 'Courier',
    minWidth: 50,
    padding: 0,
  },
  waterInputUnit: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    marginLeft: 4,
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

  // No data / disabled states
  noDataBox: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 6,
  },
  disabledOverlay: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 8,
    opacity: 0.85,
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




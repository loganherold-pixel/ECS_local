/**
 * VehicleSystemsPlanning — Fuel / Water / Solar planning inputs
 * for Expedition Wizard Step 1.
 *
 * Collapsible grouped card sections with live computed readouts.
 * ECS tactical dark theme with green/amber accents.
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';

// ── Types ────────────────────────────────────────────────────
export interface SystemsPlanningData {
  // Fuel
  fuelTankCapacity: string;   // gallons
  fuelMpg: string;
  fuelPlannedDistance: string; // miles
  // Water
  waterCarried: string;       // liters
  waterPeopleCount: string;
  waterTripDays: string;
  // Solar / Power
  solarWatts: string;
  batteryCapacity: string;    // Wh
  avgDailyUsage: string;      // Wh
}

export const defaultSystemsData: SystemsPlanningData = {
  fuelTankCapacity: '',
  fuelMpg: '',
  fuelPlannedDistance: '',
  waterCarried: '',
  waterPeopleCount: '',
  waterTripDays: '',
  solarWatts: '',
  batteryCapacity: '',
  avgDailyUsage: '',
};

interface Props {
  data: SystemsPlanningData;
  onChange: (data: SystemsPlanningData) => void;
  durationDays?: string; // from wizard step 3 if already set
}

// ── Section Wrapper ──────────────────────────────────────────
function Section({
  title, icon, color, expanded, onToggle, children, computedItems,
}: {
  title: string;
  icon: string;
  color: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  computedItems?: { label: string; value: string }[];
}) {
  return (
    <View style={[styles.section, { borderLeftColor: color }]}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={styles.sectionHeaderLeft}>
          <Ionicons name={icon as any} size={16} color={color} />
          <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={TACTICAL.textMuted}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.sectionBody}>
          {children}
          {computedItems && computedItems.length > 0 && (
            <View style={styles.computedRow}>
              {computedItems.map((item, i) => (
                <View key={i} style={styles.computedItem}>
                  <Text style={styles.computedLabel}>{item.label}</Text>
                  <Text style={styles.computedValue}>{item.value}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Collapsed summary */}
      {!expanded && computedItems && computedItems.some(c => c.value !== '--') && (
        <View style={styles.collapsedSummary}>
          {computedItems.map((item, i) => (
            <Text key={i} style={styles.collapsedText}>
              {item.label}: <Text style={styles.collapsedVal}>{item.value}</Text>
              {i < computedItems.length - 1 ? '  ·  ' : ''}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Field Row ────────────────────────────────────────────────
function FieldRow({
  label, value, onChangeText, placeholder, unit, keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  unit?: string;
  keyboardType?: 'numeric' | 'decimal-pad';
}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldInputWrap}>
        <TextInput
          style={styles.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={TACTICAL.textMuted}
          keyboardType={keyboardType || 'decimal-pad'}
          returnKeyType="done"
        />
        {unit && <Text style={styles.fieldUnit}>{unit}</Text>}
      </View>
    </View>
  );
}

// ── Main Component ───────────────────────────────────────────
export default function VehicleSystemsPlanning({ data, onChange, durationDays }: Props) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    fuel: false,
    water: false,
    power: false,
  });

  const toggle = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const update = (field: keyof SystemsPlanningData, value: string) => {
    // Allow only valid numeric input (digits and one decimal point)
    const cleaned = value.replace(/[^0-9.]/g, '');
    onChange({ ...data, [field]: cleaned });
  };

  // ── Fuel computed values ───────────────────────────────────
  const fuelComputed = useMemo(() => {
    const tank = parseFloat(data.fuelTankCapacity) || 0;
    const mpg = parseFloat(data.fuelMpg) || 0;
    const dist = parseFloat(data.fuelPlannedDistance) || 0;

    const estRange = tank > 0 && mpg > 0 ? Math.round(tank * mpg) : null;
    const fuelNeeded = dist > 0 && mpg > 0 ? Math.round((dist / mpg) * 10) / 10 : null;

    return [
      { label: 'EST. RANGE', value: estRange !== null ? `${estRange} mi` : '--' },
      { label: 'FUEL NEEDED', value: fuelNeeded !== null ? `${fuelNeeded} gal` : '--' },
    ];
  }, [data.fuelTankCapacity, data.fuelMpg, data.fuelPlannedDistance]);

  // ── Water computed values ──────────────────────────────────
  const waterComputed = useMemo(() => {
    const carried = parseFloat(data.waterCarried) || 0;
    const people = parseFloat(data.waterPeopleCount) || 0;
    const days = parseFloat(data.waterTripDays || durationDays || '') || 0;

    const dailyAllowance = people > 0 && days > 0
      ? Math.round((carried / (people * days)) * 10) / 10
      : null;
    const daysCovered = people > 0 && carried > 0
      ? Math.round((carried / (people * 3.5)) * 10) / 10  // 3.5L/person/day standard
      : null;

    return [
      { label: 'DAILY/PERSON', value: dailyAllowance !== null ? `${dailyAllowance} L` : '--' },
      { label: 'DAYS COVERED', value: daysCovered !== null ? `${daysCovered} days` : '--' },
    ];
  }, [data.waterCarried, data.waterPeopleCount, data.waterTripDays, durationDays]);

  // ── Power computed values ──────────────────────────────────
  const powerComputed = useMemo(() => {
    const solar = parseFloat(data.solarWatts) || 0;
    const battery = parseFloat(data.batteryCapacity) || 0;
    const usage = parseFloat(data.avgDailyUsage) || 0;

    // Estimate ~5 peak sun hours per day
    const solarDailyGain = solar > 0 ? Math.round(solar * 5) : null;
    const netBuffer = solarDailyGain !== null && usage > 0
      ? solarDailyGain - usage
      : null;

    return [
      { label: 'SOLAR GAIN', value: solarDailyGain !== null ? `${solarDailyGain} Wh/day` : '--' },
      { label: 'NET BUFFER', value: netBuffer !== null ? `${netBuffer > 0 ? '+' : ''}${netBuffer} Wh/day` : '--' },
    ];
  }, [data.solarWatts, data.batteryCapacity, data.avgDailyUsage]);

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.mainHeader}>
        <Ionicons name="speedometer-outline" size={16} color={TACTICAL.amber} />
        <Text style={styles.mainTitle}>VEHICLE SYSTEMS PLANNING</Text>
      </View>
      <Text style={styles.mainSub}>
        Configure fuel, water, and power estimates for mission telemetry.
      </Text>

      {/* Fuel Section */}
      <Section
        title="FUEL"
        icon="flame-outline"
        color="#E57373"
        expanded={expandedSections.fuel}
        onToggle={() => toggle('fuel')}
        computedItems={fuelComputed}
      >
        <FieldRow
          label="TANK CAPACITY"
          value={data.fuelTankCapacity}
          onChangeText={v => update('fuelTankCapacity', v)}
          placeholder="e.g. 24"
          unit="gal"
        />
        <FieldRow
          label="ESTIMATED MPG"
          value={data.fuelMpg}
          onChangeText={v => update('fuelMpg', v)}
          placeholder="e.g. 18"
          unit="mpg"
        />
        <FieldRow
          label="PLANNED DISTANCE"
          value={data.fuelPlannedDistance}
          onChangeText={v => update('fuelPlannedDistance', v)}
          placeholder="e.g. 350"
          unit="mi"
        />
      </Section>

      {/* Water Section */}
      <Section
        title="WATER"
        icon="water-outline"
        color="#4FC3F7"
        expanded={expandedSections.water}
        onToggle={() => toggle('water')}
        computedItems={waterComputed}
      >
        <FieldRow
          label="WATER CARRIED"
          value={data.waterCarried}
          onChangeText={v => update('waterCarried', v)}
          placeholder="e.g. 40"
          unit="L"
        />
        <FieldRow
          label="PEOPLE COUNT"
          value={data.waterPeopleCount}
          onChangeText={v => update('waterPeopleCount', v)}
          placeholder="e.g. 2"
        />
        <FieldRow
          label="TRIP DURATION"
          value={data.waterTripDays || durationDays || ''}
          onChangeText={v => update('waterTripDays', v)}
          placeholder="e.g. 5"
          unit="days"
        />
      </Section>

      {/* Solar / Power Section */}
      <Section
        title="SOLAR / POWER"
        icon="sunny-outline"
        color="#FFB74D"
        expanded={expandedSections.power}
        onToggle={() => toggle('power')}
        computedItems={powerComputed}
      >
        <FieldRow
          label="SOLAR WATTS"
          value={data.solarWatts}
          onChangeText={v => update('solarWatts', v)}
          placeholder="e.g. 200"
          unit="W"
        />
        <FieldRow
          label="BATTERY CAPACITY"
          value={data.batteryCapacity}
          onChangeText={v => update('batteryCapacity', v)}
          placeholder="e.g. 1200"
          unit="Wh"
        />
        <FieldRow
          label="AVG DAILY USAGE"
          value={data.avgDailyUsage}
          onChangeText={v => update('avgDailyUsage', v)}
          placeholder="e.g. 500"
          unit="Wh"
        />
      </Section>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    gap: 8,
    marginTop: 8,
  },
  mainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  mainTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  mainSub: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    marginBottom: 6,
    lineHeight: 16,
  },

  // Section
  section: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderLeftWidth: 3,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  sectionBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },

  // Collapsed summary
  collapsedSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 0,
  },
  collapsedText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  collapsedVal: {
    color: TACTICAL.text,
    fontWeight: '700',
    fontFamily: 'Courier',
  },

  // Field Row
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    flex: 1,
    minWidth: 90,
  },
  fieldInputWrap: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    paddingHorizontal: 10,
    height: 36,
  },
  fieldInput: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Courier',
    padding: 0,
  },
  fieldUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginLeft: 6,
  },

  // Computed readout
  computedRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.15)',
  },
  computedItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  computedLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  computedValue: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
});




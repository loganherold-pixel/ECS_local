/**
 * SystemsMiniModal — Zero-scroll modal for editing Vehicle Systems
 * Single-open accordion: Fuel / Water / Solar-Power
 * Compact stepper/inline controls, no help text visible (info icons only)
 * Fixed DONE button footer
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  useWindowDimensions,
} from 'react-native';
import ECSModal from '../ECSModal';

import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { SystemsPlanningData } from './VehicleSystemsPlanning';

interface Props {
  visible: boolean;
  onClose: () => void;
  data: SystemsPlanningData;
  onChange: (data: SystemsPlanningData) => void;
  durationDays?: string;
}

type SectionKey = 'fuel' | 'water' | 'power';

// ── Compact Stepper ──────────────────────────────────────────
function StepperField({
  label, value, onChangeText, unit, placeholder, compact,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  unit?: string;
  placeholder?: string;
  compact?: boolean;
}) {
  const numVal = parseFloat(value) || 0;
  const step = unit === 'gal' ? 1 : unit === 'mpg' ? 1 : unit === 'mi' ? 10 : unit === 'L' ? 5 : unit === 'W' ? 25 : unit === 'Wh' ? 50 : 1;

  const increment = () => onChangeText(String(Math.max(0, numVal + step)));
  const decrement = () => onChangeText(String(Math.max(0, numVal - step)));

  return (
    <View style={[s.stepperRow, compact && s.stepperRowCompact]}>
      <Text style={[s.stepperLabel, compact && s.stepperLabelCompact]}>{label}</Text>
      <View style={s.stepperControls}>
        <TouchableOpacity onPress={decrement} style={s.stepperBtn} activeOpacity={0.6}>
          <Ionicons name="remove" size={14} color={TACTICAL.text} />
        </TouchableOpacity>
        <TextInput
          style={[s.stepperInput, compact && s.stepperInputCompact]}
          value={value}
          onChangeText={(v) => onChangeText(v.replace(/[^0-9.]/g, ''))}
          placeholder={placeholder || '0'}
          placeholderTextColor={TACTICAL.textMuted}
          keyboardType="decimal-pad"
          returnKeyType="done"
        />
        {unit ? <Text style={s.stepperUnit}>{unit}</Text> : null}
        <TouchableOpacity onPress={increment} style={s.stepperBtn} activeOpacity={0.6}>
          <Ionicons name="add" size={14} color={TACTICAL.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main Modal ───────────────────────────────────────────────
export default function SystemsMiniModal({ visible, onClose, data, onChange, durationDays }: Props) {
  const { height } = useWindowDimensions();
  const compact = height < 700;
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);

  const toggle = (key: SectionKey) => {
    setOpenSection(prev => prev === key ? null : key);
  };

  const update = (field: keyof SystemsPlanningData, value: string) => {
    onChange({ ...data, [field]: value });
  };

  // Computed summaries
  const fuelRange = useMemo(() => {
    const tank = parseFloat(data.fuelTankCapacity) || 0;
    const mpg = parseFloat(data.fuelMpg) || 0;
    return tank > 0 && mpg > 0 ? `${Math.round(tank * mpg)} mi` : '--';
  }, [data.fuelTankCapacity, data.fuelMpg]);

  const waterDays = useMemo(() => {
    const carried = parseFloat(data.waterCarried) || 0;
    const people = parseFloat(data.waterPeopleCount) || 0;
    return carried > 0 && people > 0 ? `${(carried / (people * 3.5)).toFixed(1)} days` : '--';
  }, [data.waterCarried, data.waterPeopleCount]);

  const powerNet = useMemo(() => {
    const solar = parseFloat(data.solarWatts) || 0;
    const usage = parseFloat(data.avgDailyUsage) || 0;
    if (solar > 0 && usage > 0) {
      const net = (solar * 5) - usage;
      return `${net > 0 ? '+' : ''}${net} Wh/day`;
    }
    return '--';
  }, [data.solarWatts, data.avgDailyUsage]);

  const sections: { key: SectionKey; title: string; icon: string; color: string; summary: string }[] = [
    { key: 'fuel', title: 'FUEL', icon: 'flame-outline', color: '#E57373', summary: `Range: ${fuelRange}` },
    { key: 'water', title: 'WATER', icon: 'water-outline', color: '#4FC3F7', summary: `Coverage: ${waterDays}` },
    { key: 'power', title: 'SOLAR / POWER', icon: 'sunny-outline', color: '#FFB74D', summary: `Net: ${powerNet}` },
  ];

  return (
    <ECSModal visible={visible} onClose={onClose} tier="global">

      <View style={s.overlay}>
        <View style={[s.modal, compact && s.modalCompact]}>
          {/* Header */}
          <View style={s.modalHeader}>
            <View style={s.modalHeaderLeft}>
              <Ionicons name="speedometer-outline" size={16} color={TACTICAL.amber} />
              <Text style={s.modalTitle}>VEHICLE SYSTEMS</Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Accordion Sections */}
          <View style={s.accordionWrap}>
            {sections.map(sec => {
              const isOpen = openSection === sec.key;
              return (
                <View key={sec.key} style={[s.accSection, { borderLeftColor: sec.color }]}>
                  <TouchableOpacity
                    style={s.accHeader}
                    onPress={() => toggle(sec.key)}
                    activeOpacity={0.7}
                  >
                    <View style={s.accHeaderLeft}>
                      <Ionicons name={sec.icon as any} size={14} color={sec.color} />
                      <Text style={[s.accTitle, { color: sec.color }]}>{sec.title}</Text>
                    </View>
                    <View style={s.accHeaderRight}>
                      {!isOpen && (
                        <Text style={s.accSummary}>{sec.summary}</Text>
                      )}
                      <Ionicons
                        name={isOpen ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={TACTICAL.textMuted}
                      />
                    </View>
                  </TouchableOpacity>

                  {isOpen && sec.key === 'fuel' && (
                    <View style={[s.accBody, compact && s.accBodyCompact]}>
                      <StepperField
                        label="TANK" value={data.fuelTankCapacity}
                        onChangeText={v => update('fuelTankCapacity', v)}
                        unit="gal" placeholder="24" compact={compact}
                      />
                      <StepperField
                        label="MPG" value={data.fuelMpg}
                        onChangeText={v => update('fuelMpg', v)}
                        unit="mpg" placeholder="18" compact={compact}
                      />
                      <StepperField
                        label="DISTANCE" value={data.fuelPlannedDistance}
                        onChangeText={v => update('fuelPlannedDistance', v)}
                        unit="mi" placeholder="350" compact={compact}
                      />
                      <View style={s.accComputed}>
                        <Text style={s.accComputedLabel}>EST. RANGE</Text>
                        <Text style={s.accComputedValue}>{fuelRange}</Text>
                      </View>
                    </View>
                  )}

                  {isOpen && sec.key === 'water' && (
                    <View style={[s.accBody, compact && s.accBodyCompact]}>
                      <StepperField
                        label="CARRIED" value={data.waterCarried}
                        onChangeText={v => update('waterCarried', v)}
                        unit="L" placeholder="40" compact={compact}
                      />
                      <StepperField
                        label="PEOPLE" value={data.waterPeopleCount}
                        onChangeText={v => update('waterPeopleCount', v)}
                        placeholder="2" compact={compact}
                      />
                      <StepperField
                        label="DAYS" value={data.waterTripDays || durationDays || ''}
                        onChangeText={v => update('waterTripDays', v)}
                        unit="days" placeholder="5" compact={compact}
                      />
                      <View style={s.accComputed}>
                        <Text style={s.accComputedLabel}>DAYS COVERED</Text>
                        <Text style={s.accComputedValue}>{waterDays}</Text>
                      </View>
                    </View>
                  )}

                  {isOpen && sec.key === 'power' && (
                    <View style={[s.accBody, compact && s.accBodyCompact]}>
                      <StepperField
                        label="SOLAR" value={data.solarWatts}
                        onChangeText={v => update('solarWatts', v)}
                        unit="W" placeholder="200" compact={compact}
                      />
                      <StepperField
                        label="BATTERY" value={data.batteryCapacity}
                        onChangeText={v => update('batteryCapacity', v)}
                        unit="Wh" placeholder="1200" compact={compact}
                      />
                      <StepperField
                        label="DAILY USE" value={data.avgDailyUsage}
                        onChangeText={v => update('avgDailyUsage', v)}
                        unit="Wh" placeholder="500" compact={compact}
                      />
                      <View style={s.accComputed}>
                        <Text style={s.accComputedLabel}>NET BUFFER</Text>
                        <Text style={s.accComputedValue}>{powerNet}</Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Footer: DONE */}
          <TouchableOpacity style={s.doneBtn} onPress={onClose} activeOpacity={0.8}>
            <Ionicons name="checkmark-circle" size={16} color="#0B0F12" />
            <Text style={s.doneBtnText}>DONE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ECSModal>

  );
}

// ── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  modalCompact: {
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.2)',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  accordionWrap: {
    padding: 12,
    gap: 6,
  },
  accSection: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderLeftWidth: 3,
    overflow: 'hidden',
  },
  accHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  accHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  accHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accSummary: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    fontWeight: '600',
  },
  accBody: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
  },
  accBodyCompact: {
    gap: 4,
    paddingBottom: 8,
  },
  accComputed: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.15)',
    marginTop: 2,
  },
  accComputedLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  accComputedValue: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },

  // Stepper
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stepperRowCompact: {
    gap: 4,
  },
  stepperLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    minWidth: 60,
  },
  stepperLabelCompact: {
    minWidth: 50,
    fontSize: 8,
  },
  stepperControls: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(62, 79, 60, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.3)',
  },
  stepperInput: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    paddingHorizontal: 8,
    height: 30,
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Courier',
    textAlign: 'center',
  },
  stepperInputCompact: {
    height: 26,
    fontSize: 11,
  },
  stepperUnit: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    minWidth: 22,
  },

  // Done button
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 12,
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  doneBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.5,
  },
});




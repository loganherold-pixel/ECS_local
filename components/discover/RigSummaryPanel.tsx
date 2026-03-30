// ============================================================
// RIG SUMMARY PANEL — Vehicle Configuration Summary
// ============================================================
// Displays the user's vehicle configuration at the top of
// the Discover tab. Shows weight, fuel range, water capacity,
// and terrain profile. "Modify Rig" opens vehicle-config.
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS, TYPO, DENSITY } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import type { VehicleProfile } from '../../lib/rigCompatibilityEngine';

interface RigSummaryPanelProps {
  vehicleProfile: VehicleProfile | null;
  avgCompatibility: number | null;
  opportunityCount: number;
}

// ── Stat Cell ────────────────────────────────────────────────
function RigStat({
  icon,
  label,
  value,
  unit,
  accentColor,
}: {
  icon: string;
  label: string;
  value: string;
  unit?: string;
  accentColor?: string;
}) {
  const color = accentColor || TACTICAL.amber;
  return (
    <View style={s.rigStat}>
      <View style={[s.rigStatIconWrap, { backgroundColor: color + '14', borderColor: color + '30' }]}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>
      <Text style={s.rigStatLabel}>{label}</Text>
      <View style={s.rigStatValueRow}>
        <Text style={[s.rigStatValue, { color }]}>{value}</Text>
        {unit && <Text style={s.rigStatUnit}>{unit}</Text>}
      </View>
    </View>
  );
}

export default function RigSummaryPanel({
  vehicleProfile,
  avgCompatibility,
  opportunityCount,
}: RigSummaryPanelProps) {
  const router = useRouter();

  const handleModifyRig = () => {
    hapticMicro();
    if (vehicleProfile?.vehicleId) {
      router.push({
        pathname: '/(tabs)/vehicle-config',
        params: { vehicleId: vehicleProfile.vehicleId, referrer: 'discover' },
      } as any);
    } else {
      router.push('/(tabs)/vehicle-config' as any);
    }
  };

  // ── No Vehicle State ──────────────────────────────────────
  if (!vehicleProfile) {
    return (
      <View style={s.panel}>
        <View style={s.panelHeader}>
          <View style={s.panelHeaderLeft}>
            <View style={s.panelIconWrap}>
              <Ionicons name="car-sport-outline" size={16} color={TACTICAL.textMuted} />
            </View>
            <View>
              <Text style={s.panelLabel}>YOUR RIG</Text>
              <Text style={s.panelSubLabel}>No Vehicle Configured</Text>
            </View>
          </View>
        </View>

        <View style={s.emptyRigContent}>
          <View style={s.emptyRigIconRow}>
            <View style={s.emptyRigIcon}>
              <Ionicons name="construct-outline" size={28} color={TACTICAL.textMuted} />
            </View>
          </View>
          <Text style={s.emptyRigTitle}>CONFIGURE YOUR VEHICLE</Text>
          <Text style={s.emptyRigDesc}>
            Add your vehicle to see personalized expedition compatibility scores, fuel range analysis, and terrain matching.
          </Text>
          <TouchableOpacity style={s.addRigBtn} onPress={handleModifyRig} activeOpacity={0.8}>
            <Ionicons name="add-outline" size={14} color={ECS.bgPrimary} />
            <Text style={s.addRigBtnText}>ADD VEHICLE</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Vehicle Configured State ──────────────────────────────
  const fuelRange = vehicleProfile.fuel_range_miles > 0
    ? `${Math.round(vehicleProfile.fuel_range_miles)}`
    : '—';
  const waterCap = vehicleProfile.water_capacity_gal > 0
    ? `${vehicleProfile.water_capacity_gal}`
    : '—';
  const weight = vehicleProfile.gvwr_lb > 0
    ? `${vehicleProfile.gvwr_lb.toLocaleString()}`
    : '—';
  const payload = vehicleProfile.payload_capacity_lb > 0
    ? `${vehicleProfile.payload_capacity_lb.toLocaleString()}`
    : '—';

  // Derive terrain profile label from vehicle type
  const terrainLabel = (() => {
    switch (vehicleProfile.vehicleType) {
      case 'truck': return 'ALL-TERRAIN';
      case 'jeep': return 'ROCK / TRAIL';
      case 'suv_van': return 'MIXED TERRAIN';
      case 'car_crossover': return 'LIGHT TRAIL';
      default: return 'GENERAL';
    }
  })();

  return (
    <View style={s.panel}>
      {/* Panel Header */}
      <View style={s.panelHeader}>
        <View style={s.panelHeaderLeft}>
          <View style={[s.panelIconWrap, { backgroundColor: ECS.accentSoft, borderColor: TACTICAL.amber + '30' }]}>
            <Ionicons name="car-sport-outline" size={16} color={TACTICAL.amber} />
          </View>
          <View>
            <Text style={s.panelLabel}>YOUR RIG</Text>
            <Text style={s.vehicleName}>{vehicleProfile.vehicleName}</Text>
          </View>
        </View>
        <TouchableOpacity style={s.modifyBtn} onPress={handleModifyRig} activeOpacity={0.8}>
          <Ionicons name="settings-outline" size={11} color={TACTICAL.amber} />
          <Text style={s.modifyBtnText}>MODIFY RIG</Text>
        </TouchableOpacity>
      </View>

      {/* Gold divider */}
      <View style={s.goldDivider} />

      {/* Rig Stats Grid */}
      <View style={s.rigStatsGrid}>
        <RigStat icon="scale-outline" label="GVWR" value={weight} unit="LB" />
        <RigStat icon="flame-outline" label="FUEL RANGE" value={fuelRange} unit="MI" accentColor="#E67E22" />
        <RigStat icon="water-outline" label="WATER" value={waterCap} unit="GAL" accentColor="#5AC8FA" />
        <RigStat icon="trail-sign-outline" label="TERRAIN" value={terrainLabel} accentColor="#66BB6A" />
      </View>

      {/* Secondary Stats Row */}
      <View style={s.secondaryRow}>
        <View style={s.secondaryStat}>
          <Text style={s.secondaryLabel}>PAYLOAD</Text>
          <Text style={s.secondaryValue}>{payload} lb</Text>
        </View>
        <View style={s.secondaryDivider} />
        <View style={s.secondaryStat}>
          <Text style={s.secondaryLabel}>FUEL TANK</Text>
          <Text style={s.secondaryValue}>
            {vehicleProfile.fuel_tank_capacity_gal > 0
              ? `${vehicleProfile.fuel_tank_capacity_gal} gal`
              : '—'}
          </Text>
        </View>
        <View style={s.secondaryDivider} />
        <View style={s.secondaryStat}>
          <Text style={s.secondaryLabel}>AVG MPG</Text>
          <Text style={s.secondaryValue}>
            {vehicleProfile.avg_mpg > 0 ? `${vehicleProfile.avg_mpg}` : '—'}
          </Text>
        </View>
        <View style={s.secondaryDivider} />
        <View style={s.secondaryStat}>
          <Text style={s.secondaryLabel}>FUEL TYPE</Text>
          <Text style={s.secondaryValue}>{vehicleProfile.fuel_type.toUpperCase()}</Text>
        </View>
      </View>

      {/* Compatibility Summary */}
      {avgCompatibility != null && (
        <View style={s.compatSummary}>
          <Ionicons name="analytics-outline" size={11} color={TACTICAL.amber} />
          <Text style={s.compatSummaryText}>
            Avg. compatibility across {opportunityCount} routes: 
          </Text>
          <Text style={[s.compatSummaryScore, {
            color: avgCompatibility >= 70 ? '#66BB6A' : avgCompatibility >= 40 ? '#D4A017' : '#E04030',
          }]}>
            {avgCompatibility}%
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
  panel: {
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: ECS.stroke,
    marginBottom: 16,
    overflow: 'hidden',
  },

  // ── Header ────────────────────────────────────────────
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  panelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  panelIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(138,138,133,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2.5,
  },
  panelSubLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  vehicleName: {
    fontSize: 13,
    fontWeight: '700',
    color: ECS.text,
    letterSpacing: 0.5,
    marginTop: 1,
  },

  // ── Modify Button ─────────────────────────────────────
  modifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '0A',
  },
  modifyBtnText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },

  // ── Gold Divider ──────────────────────────────────────
  goldDivider: {
    height: GOLD_RAIL.subsectionWidth,
    backgroundColor: GOLD_RAIL.subsection,
    marginHorizontal: 14,
  },

  // ── Rig Stats Grid ────────────────────────────────────
  rigStatsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 6,
  },
  rigStat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    backgroundColor: ECS.bgElev,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    gap: 4,
  },
  rigStatIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rigStatLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    textAlign: 'center',
  },
  rigStatValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  rigStatValue: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.amber,
    textAlign: 'center',
  },
  rigStatUnit: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // ── Secondary Stats Row ───────────────────────────────
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.internal,
    marginHorizontal: 10,
  },
  secondaryStat: {
    alignItems: 'center',
    flex: 1,
  },
  secondaryLabel: {
    fontSize: 6,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  secondaryValue: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Courier',
    color: ECS.muted,
    marginTop: 2,
  },
  secondaryDivider: {
    width: 1,
    height: 20,
    backgroundColor: GOLD_RAIL.internal,
  },

  // ── Compatibility Summary ─────────────────────────────
  compatSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
    marginTop: 2,
  },
  compatSummaryText: {
    fontSize: 9,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },
  compatSummaryScore: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },

  // ── Empty State ───────────────────────────────────────
  emptyRigContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  emptyRigIconRow: {
    marginBottom: 14,
  },
  emptyRigIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: ECS.bgElev,
    borderWidth: 1,
    borderColor: ECS.stroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRigTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 3,
    marginBottom: 8,
  },
  emptyRigDesc: {
    fontSize: 11,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  addRigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TACTICAL.amber,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addRigBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: ECS.bgPrimary,
    letterSpacing: 2,
  },
});




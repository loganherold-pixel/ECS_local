/**
 * VehicleTwinScreen — ECS Vehicle Twin Command Console
 *
 * Mobile-optimized layout:
 *   HEADER  →  Back | VEHICLE TWIN + vehicle name | HUD (ROLL/PITCH/POWER)
 *   BLUEPRINT CANVAS  →  Vehicle body schematic (top half of screen)
 *   STABILITY STRIP  →  Immediately below vehicle (visible without scrolling)
 *   NEXT SEGMENT RISK →  Predictive terrain risk from active route
 *   STABILITY ASSIST  →  Actionable recommendations
 *   QUICK FIX PANEL  →  Load-balancing suggestions with preview simulation
 *   SYSTEM PANELS  →  Stacked vertically (Loadout | CG | Power)
 *
 * Connected to live ECS data sources:
 *   ROLL / PITCH  →  useAccelerometer (attitude monitor)
 *   AXLE LOAD     →  calculateCG + vehicleSpecStore (weight engine)
 *   LOADOUT       →  loadoutStore zone weights (drawer / container)
 *   POWER         →  usePowerTelemetry (battery, solar, output)
 *   ECOFLOW LIVE  →  useEcoFlowLive (edge function → EcoFlow IoT API)
 *   ROUTE         →  routeStore active route → terrainPredictionEngine
 *   GPS           →  useGPSLocation → terrain prediction position
 *
 * Power Insight (Autopilot Lite V1.2):
 *   Rolling 5-sample telemetry buffer → net power + endurance estimation.
 *   Net Power = solarWatts − outputWatts (green if charging, amber if draining).
 *   Endurance = estimated time until 20% reserve using rolling avg output watts
 *   and assumed 1024 Wh capacity (EcoFlow DELTA 2 default).
 *
 * Load imbalance visual highlighting (visual cues only):
 *   LEFT/RIGHT  →  amber glow on heavier side when >10% difference
 *   ROOF        →  amber glow when roof exceeds 15% of total zone load
 *   REAR AXLE   →  amber glow when rear exceeds front by >10%
 *
 * Quick Fix system (simulation only — no data mutations):
 *   Analyzes loadout items and generates up to 3 corrective suggestions.
 *   "Preview Impact" temporarily simulates zone weight changes.
 *   Updates CG marker, axle distribution, and stability margin in preview.
 *   "Reset Preview" restores actual state.
 */





import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
} from 'react-native';

import { useRouter } from 'expo-router';

import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { ECS, GOLD_RAIL, TYPO, DENSITY, ZONE_ACCENT_SOLID } from '../lib/theme';
import { analyzeTilt, type ContainerWeightMap, type TiltAnalysis } from '../lib/vehicleTiltEngine';

import { useVehicleTwinData } from '../lib/useVehicleTwinData';
import { useGPSLocation } from '../lib/useGPSLocation';
import { useEcoFlowLive } from '../lib/useEcoFlowLive';

import BlueprintCanvas, { type ImbalanceFlags } from '../components/vehicle-twin/BlueprintCanvas';
import { CONTAINER_ZONES } from '../components/vehicle-twin/SmartContainerZones';
import { StabilityStrip, computeStability } from '../components/vehicle-twin/StabilityStrip';
import StabilityAssistPanel from '../components/vehicle-twin/StabilityAssistPanel';
import QuickFixPanel from '../components/vehicle-twin/QuickFixPanel';
import NextSegmentRiskPanel from '../components/vehicle-twin/NextSegmentRiskPanel';
import EcoFlowPickerModal from '../components/vehicle-twin/EcoFlowPickerModal';

import { vehicleSetupStore } from '../lib/vehicleSetupStore';

import {
  generateQuickFixes,
  simulateSuggestion,
  hasImbalanceConditions,
  type QuickFixSuggestion,
  type SimulatedImpact,
  type ZoneWeights,
} from '../lib/quickFixEngine';


const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const IS_SMALL = SCREEN_W < 380;

/* ── Attitude motion constants ────────────────────────── */
const MAX_VISUAL_DEG = 5;
const SENSOR_CLAMP = 45;
const SCALE = MAX_VISUAL_DEG / SENSOR_CLAMP;
const ANIM_DURATION = 150;

function sensorToVisual(raw: number | null): number {
  if (raw == null || isNaN(raw)) return 0;
  const clamped = Math.max(-SENSOR_CLAMP, Math.min(SENSOR_CLAMP, raw));
  return clamped * SCALE;
}

/* ── CG fraction helpers ──────────────────────────────── */
const CG_MIN_FRAC = 0.15;
const CG_MAX_FRAC = 0.85;

function cgVerticalFraction(frontPct: number | null, rearPct: number | null): number | null {
  if (frontPct == null || rearPct == null) return null;
  if (frontPct === 0 && rearPct === 0) return null;
  const raw = rearPct / 100;
  return Math.max(CG_MIN_FRAC, Math.min(CG_MAX_FRAC, raw));
}

function cgHorizontalFraction(
  leftLbs: number | null,
  rightLbs: number | null,
): number | null {
  const left = leftLbs ?? 0;
  const right = rightLbs ?? 0;
  const total = left + right;
  if (total === 0) return null;
  const rightBias = right / total;
  return Math.max(0.25, Math.min(0.75, rightBias));
}

/* ── Format lbs helper ────────────────────────────────── */
function fmtLbs(val: number): string {
  if (val <= 0) return '--';
  return `${Math.round(val)} lbs`;
}

/* ── HUD Chip (compact header telemetry) ──────────────── */
function HudChip({
  label,
  value,
  isLive,
}: {
  label: string;
  value: string;
  isLive?: boolean;
}) {
  return (
    <View style={s.hudChip}>
      <View style={s.hudLabelRow}>
        <Text style={s.hudLabel}>{label}</Text>
        {isLive && <View style={s.hudLiveDot} />}
      </View>
      <Text
        style={[s.hudValue, isLive && value !== '--' && { color: ECS.accent }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/* ── Status badge ─────────────────────────────────────── */
function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.statusBadge, { borderColor: color }]}>
      <View style={[s.statusDot, { backgroundColor: color }]} />
      <Text style={[s.statusText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/* ── Compact info panel (stacked vertically on mobile) ── */
interface PanelRow {
  label: string;
  value: string;
  highlight?: boolean;
  valueColor?: string;
}

function CompactPanel({
  title,
  icon,
  rows,
  statusLabel,
  statusColor,
}: {
  title: string;
  icon: string;
  rows: PanelRow[];
  statusLabel?: string;
  statusColor?: string;
}) {
  return (
    <View style={s.compactPanel}>
      {/* Header row with status on right */}
      <View style={s.cpHeaderRow}>
        <View style={s.cpHeader}>
          <Ionicons name={icon as any} size={12} color={ECS.accent} />
          <Text style={s.cpTitle} numberOfLines={1}>{title}</Text>
        </View>
        {statusLabel && statusColor && (
          <StatusBadge label={statusLabel} color={statusColor} />
        )}
      </View>
      <View style={s.cpDivider} />
      {/* Data rows — horizontal on mobile for compact display */}
      <View style={s.cpDataRow}>
        {rows.map((r, i) => (
          <View key={i} style={[s.cpCell, i < rows.length - 1 && s.cpCellBorder]}>
            <Text style={s.cpRowLabel} numberOfLines={1}>{r.label}</Text>
            <Text
              style={[
                s.cpRowValue,
                r.highlight && r.value !== '--' && { color: ECS.accent },
                r.valueColor ? { color: r.valueColor } : undefined,
              ]}
              numberOfLines={1}
            >
              {r.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ── Main screen ──────────────────────────────────────── */
export default function VehicleTwinScreen() {
  const router = useRouter();
  const [activeZone, setActiveZone] = useState<string | null>(null);

  const twin = useVehicleTwinData();

  /* ── GPS position for terrain prediction ─────────────── */
  const gps = useGPSLocation({ enabled: true, highAccuracy: false });

  /* ── EcoFlow live telemetry ──────────────────────────── */
  const ecoflow = useEcoFlowLive();
  const [showEcoFlowPicker, setShowEcoFlowPicker] = useState(false);

  const handleEcoFlowDeviceSelected = useCallback((_deviceId: string) => {
    // Trigger the hook to re-read persisted selection and poll immediately
    ecoflow.refresh();
  }, [ecoflow.refresh]);

  const handleZonePress = useCallback((zoneId: string) => {
    setActiveZone((prev) => (prev === zoneId ? null : zoneId));
  }, []);

  const sensorLive = twin.sensorStatus === 'LIVE' || twin.sensorStatus === 'CALIBRATED';
  const powerLive = twin.hasPower || ecoflow.status === 'live';

  /* ── Effective power displays (EcoFlow overrides generic telemetry) ── */
  const ecoIsLive = ecoflow.status === 'live';
  const pwrBatteryDisplay = ecoIsLive && ecoflow.batteryPct != null
    ? `${Math.round(ecoflow.batteryPct)}%`
    : twin.batteryDisplay;
  const pwrSolarDisplay = ecoIsLive && ecoflow.solarWatts != null
    ? `${Math.round(ecoflow.solarWatts)} W`
    : twin.solarDisplay;
  const pwrOutputDisplay = ecoIsLive && ecoflow.outputWatts != null
    ? `${Math.round(ecoflow.outputWatts)} W`
    : twin.outputDisplay;
  const pwrInputDisplay = ecoIsLive && ecoflow.inputWatts != null
    ? `${Math.round(ecoflow.inputWatts)} W`
    : '--';


  /* ── Attitude-driven schematic animation ─────────────── */
  const animRoll = useRef(new Animated.Value(0)).current;
  const animPitch = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const targetRoll = sensorToVisual(twin.rollDeg);
    const targetPitch = sensorToVisual(twin.pitchDeg);

    Animated.parallel([
      Animated.timing(animRoll, {
        toValue: targetRoll,
        duration: ANIM_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(animPitch, {
        toValue: targetPitch,
        duration: ANIM_DURATION,
        useNativeDriver: true,
      }),
    ]).start();
  }, [twin.rollDeg, twin.pitchDeg]);

  const schematicTransform = {
    transform: [
      { perspective: 800 },
      {
        rotateX: animPitch.interpolate({
          inputRange: [-MAX_VISUAL_DEG, MAX_VISUAL_DEG],
          outputRange: [`-${MAX_VISUAL_DEG}deg`, `${MAX_VISUAL_DEG}deg`],
          extrapolate: 'clamp',
        }),
      },
      {
        rotateY: animRoll.interpolate({
          inputRange: [-MAX_VISUAL_DEG, MAX_VISUAL_DEG],
          outputRange: [`-${MAX_VISUAL_DEG}deg`, `${MAX_VISUAL_DEG}deg`],
          extrapolate: 'clamp',
        }),
      },
    ],
  };

  /* ── Current zone weights (from twin data) ───────────── */
  const currentZoneWeights: ZoneWeights = useMemo(() => ({
    leftDrawer: twin.leftDrawerLbs ?? 0,
    rightDrawer: twin.rightDrawerLbs ?? 0,
    rearContainer: twin.rearContainerLbs ?? 0,
    roof: twin.roofWeightLbs ?? 0,
    cab: twin.cabWeightLbs ?? 0,
    bed: twin.bedWeightLbs ?? 0,
  }), [
    twin.leftDrawerLbs, twin.rightDrawerLbs, twin.rearContainerLbs,
    twin.roofWeightLbs, twin.cabWeightLbs, twin.bedWeightLbs,
  ]);

  /* ── Quick Fix state ─────────────────────────────────── */
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [previewImpact, setPreviewImpact] = useState<SimulatedImpact | null>(null);
  const [previewSuggestion, setPreviewSuggestion] = useState<QuickFixSuggestion | null>(null);

  const vehicleId = vehicleSetupStore.getActiveVehicleId();

  const suggestions = useMemo(
    () => generateQuickFixes(
      vehicleId,
      currentZoneWeights,
      twin.frontAxleLbs,
      twin.rearAxleLbs,
    ),
    [vehicleId, currentZoneWeights, twin.frontAxleLbs, twin.rearAxleLbs],
  );

  const isOptimal = useMemo(
    () => !hasImbalanceConditions(currentZoneWeights, twin.frontAxleLbs, twin.rearAxleLbs),
    [currentZoneWeights, twin.frontAxleLbs, twin.rearAxleLbs],
  );

  const handlePreview = useCallback((sug: QuickFixSuggestion) => {
    const impact = simulateSuggestion(currentZoneWeights, sug);
    setActivePreviewId(sug.id);
    setPreviewImpact(impact);
    setPreviewSuggestion(sug);
  }, [currentZoneWeights]);

  const handleResetPreview = useCallback(() => {
    setActivePreviewId(null);
    setPreviewImpact(null);
    setPreviewSuggestion(null);
  }, []);

  /* ── Determine effective weights (actual or simulated) ── */
  const isSimulating = activePreviewId != null && previewImpact != null;
  const effectiveZoneWeights = isSimulating ? previewImpact.zoneWeights : currentZoneWeights;

  /* ── CG marker position (uses effective weights) ─────── */
  // When simulating, adjust front axle percent based on impact delta
  const effectiveFrontAxlePct = isSimulating && twin.frontAxlePercent != null
    ? twin.frontAxlePercent + previewImpact.frontAxleDelta
    : twin.frontAxlePercent;
  const effectiveRearAxlePct = effectiveFrontAxlePct != null
    ? 100 - effectiveFrontAxlePct
    : twin.rearAxlePercent;

  const cgVFrac = cgVerticalFraction(effectiveFrontAxlePct, effectiveRearAxlePct);

  // Lateral CG uses effective drawer weights
  const cgHFrac = cgHorizontalFraction(
    effectiveZoneWeights.leftDrawer || null,
    effectiveZoneWeights.rightDrawer || null,
  );

  /* ── Vehicle Stability computation (uses effective data) ── */
  const stability = computeStability(
    twin.rollDeg,
    twin.pitchDeg,
    effectiveFrontAxlePct,
    effectiveRearAxlePct,
  );

  /* ── CG panel data ──────────────────────────────────── */
  const rearBias =
    effectiveFrontAxlePct != null
      ? `${Math.abs(effectiveFrontAxlePct - 50).toFixed(1)}%`
      : '--';
  const rearBiasDir =
    effectiveFrontAxlePct != null
      ? effectiveFrontAxlePct > 50
        ? 'Front'
        : effectiveFrontAxlePct < 50
        ? 'Rear'
        : 'Balanced'
      : '--';
  const rightShift =
    effectiveZoneWeights.leftDrawer != null && effectiveZoneWeights.rightDrawer != null
      ? (() => {
          const total = effectiveZoneWeights.leftDrawer + effectiveZoneWeights.rightDrawer;
          if (total === 0) return '--';
          const bias = (effectiveZoneWeights.rightDrawer / total - 0.5) * 100;
          return `${Math.abs(bias).toFixed(1)}% ${bias > 0 ? 'R' : bias < 0 ? 'L' : ''}`;
        })()
      : '--';

  /* ── Load imbalance visual flags ──────────────────────── */
  const imbalanceFlags: ImbalanceFlags = useMemo(() => {
    const flags: ImbalanceFlags = {
      leftHeavy: false,
      rightHeavy: false,
      roofOverloaded: false,
      rearHeavy: false,
    };

    const zw = effectiveZoneWeights;

    // Left / Right drawer imbalance (>10% difference)
    const maxSide = Math.max(zw.leftDrawer, zw.rightDrawer);
    if (maxSide > 0) {
      const sideDiff = Math.abs(zw.leftDrawer - zw.rightDrawer) / maxSide;
      if (sideDiff > 0.10) {
        if (zw.leftDrawer > zw.rightDrawer) flags.leftHeavy = true;
        else flags.rightHeavy = true;
      }
    }

    // Roof overload (>15% of total zone load)
    const totalZoneLoad = zw.roof + zw.cab + zw.bed;
    if (totalZoneLoad > 0 && zw.roof > 0) {
      if (zw.roof / totalZoneLoad > 0.15) flags.roofOverloaded = true;
    }

    // Rear axle exceeds front by >10%
    const frontAxle = twin.frontAxleLbs ?? 0;
    const rearAxle = twin.rearAxleLbs ?? 0;
    if (isSimulating && previewImpact) {
      // In simulation, adjust based on delta
      const simFront = frontAxle + (previewImpact.frontAxleDelta / 100 * (frontAxle + rearAxle));
      const simRear = rearAxle - (previewImpact.frontAxleDelta / 100 * (frontAxle + rearAxle));
      if (simFront > 0 && simRear > 0 && simRear > simFront * 1.10) {
        flags.rearHeavy = true;
      }
    } else {
      if (frontAxle > 0 && rearAxle > 0 && rearAxle > frontAxle * 1.10) {
        flags.rearHeavy = true;
      }
    }

    return flags;
  }, [effectiveZoneWeights, twin.frontAxleLbs, twin.rearAxleLbs, isSimulating, previewImpact]);

  /* ── Blueprint weight displays (effective) ───────────── */
  const blueprintWeights = useMemo(() => {
    if (!isSimulating) {
      return {
        roofWeightDisplay: twin.roofWeightDisplay,
        cabWeightDisplay: twin.cabWeightDisplay,
        bedWeightDisplay: twin.bedWeightDisplay,
        frontAxleDisplay: twin.frontAxleDisplay,
        rearAxleDisplay: twin.rearAxleDisplay,
        frontAxleLbs: twin.frontAxleLbs,
        rearAxleLbs: twin.rearAxleLbs,
      };
    }

    // Simulated displays
    const simZw = previewImpact!.zoneWeights;
    const totalMass = twin.totalMassLbs ?? 0;
    const simFrontPct = effectiveFrontAxlePct ?? 50;
    const simRearPct = effectiveRearAxlePct ?? 50;
    const simFrontLbs = totalMass > 0 ? Math.round(totalMass * simFrontPct / 100) : twin.frontAxleLbs;
    const simRearLbs = totalMass > 0 ? Math.round(totalMass * simRearPct / 100) : twin.rearAxleLbs;

    return {
      roofWeightDisplay: fmtLbs(simZw.roof),
      cabWeightDisplay: fmtLbs(simZw.cab),
      bedWeightDisplay: fmtLbs(simZw.bed),
      frontAxleDisplay: simFrontLbs != null ? `${simFrontLbs} lbs` : twin.frontAxleDisplay,
      rearAxleDisplay: simRearLbs != null ? `${simRearLbs} lbs` : twin.rearAxleDisplay,
      frontAxleLbs: simFrontLbs,
      rearAxleLbs: simRearLbs,
    };
  }, [isSimulating, previewImpact, effectiveFrontAxlePct, effectiveRearAxlePct, twin]);

  /* ── Highlight zones involved in active preview ──────── */
  const previewActiveZone = useMemo(() => {
    if (!isSimulating || !previewSuggestion) return activeZone;
    // Map quick fix destination zones to new smart container zone IDs
    const zoneMap: Record<string, string> = {
      roof: 'roof_rack',
      cab: 'cab_storage',
      bed: 'bed_main',
      leftDrawer: 'bed_drawer_left',
      rightDrawer: 'bed_drawer_right',
      rearContainer: 'bed_main',
    };
    return zoneMap[previewSuggestion.toZone] ?? activeZone;
  }, [isSimulating, previewSuggestion, activeZone]);

  /* ── Zone weight map for smart container zones ───────── */
  const zoneWeightMap = useMemo(() => {
    const zw = effectiveZoneWeights;
    const sim = isSimulating;
    return {
      front_bumper: '--',
      roof_rack: sim ? fmtLbs(zw.roof) : twin.roofWeightDisplay,
      cab_storage: sim ? fmtLbs(zw.cab) : twin.cabWeightDisplay,
      rear_seat: '--',
      bed_drawer_left: sim ? fmtLbs(zw.leftDrawer) : twin.leftDrawerDisplay,
      bed_main: sim ? fmtLbs(zw.bed) : twin.bedWeightDisplay,
      bed_drawer_right: sim ? fmtLbs(zw.rightDrawer) : twin.rightDrawerDisplay,
    };
  }, [effectiveZoneWeights, isSimulating, twin]);

  /* ═══════════════════════════════════════════════════════════
     WEIGHT DISTRIBUTION TILT ENGINE
     ═══════════════════════════════════════════════════════════
     Maps effective zone weights → container IDs → tilt analysis.
     Drives the 3D tilt animation on the vehicle wireframe image.
     Updates in real-time when loadout items change or during
     Quick Fix preview simulations.
     ═══════════════════════════════════════════════════════════ */
  const tiltContainerWeights: ContainerWeightMap = useMemo(() => ({
    cab_storage: effectiveZoneWeights.cab,
    rear_seat: 0,
    roof_rack: effectiveZoneWeights.roof,
    bed_main: effectiveZoneWeights.bed + effectiveZoneWeights.rearContainer,
    bed_drawer_left: effectiveZoneWeights.leftDrawer,
    bed_drawer_right: effectiveZoneWeights.rightDrawer,
    front_bumper: 0,
  }), [effectiveZoneWeights]);

  const tiltAnalysis: TiltAnalysis = useMemo(
    () => analyzeTilt(tiltContainerWeights),
    [tiltContainerWeights],
  );

  /* ── Active zone detail info ─────────────────────────── */
  const activeZoneInfo = useMemo(() => {
    if (!activeZone) return null;
    const zone = CONTAINER_ZONES.find(z => z.id === activeZone);
    if (!zone) return null;
    const weight = zoneWeightMap[activeZone as keyof typeof zoneWeightMap] ?? '--';
    return { ...zone, weight };
  }, [activeZone, zoneWeightMap]);



  return (
    <View style={s.container}>
      {/* ── Header ────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color={ECS.accent} />
        </TouchableOpacity>

        <View style={s.headerCenter}>
          <Text style={s.headerTitle} numberOfLines={1}>VEHICLE TWIN</Text>
          {twin.vehicleName && (
            <Text style={s.headerSub} numberOfLines={1}>
              {twin.vehicleName.toUpperCase()}
            </Text>
          )}
        </View>

        {/* Compact HUD */}
        <View style={s.hudRow}>
          <HudChip label="ROLL" value={twin.rollDisplay} isLive={sensorLive} />
          <View style={s.hudSep} />
          <HudChip label="PITCH" value={twin.pitchDisplay} isLive={sensorLive} />
          <View style={s.hudSep} />
          <HudChip label="PWR" value={pwrBatteryDisplay} isLive={powerLive} />

        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Blueprint Canvas (centerpiece — top half) ── */}
        <BlueprintCanvas
          weights={blueprintWeights}
          activeZone={previewActiveZone}
          onZonePress={handleZonePress}
          cgVerticalFrac={cgVFrac}
          cgHorizontalFrac={cgHFrac}
          schematicTransform={schematicTransform}
          imbalance={imbalanceFlags}
          zoneWeightMap={zoneWeightMap}
          weightRollDeg={tiltAnalysis.degrees.rollDeg}
          weightPitchDeg={tiltAnalysis.degrees.pitchDeg}
        />


        {/* ── Active Zone Detail Panel ─────────────────── */}
        {activeZoneInfo && (
          <View style={s.zoneDetailPanel}>
            <View style={[s.zoneDetailAccent, { backgroundColor: activeZoneInfo.accentColor }]} />
            <View style={s.zoneDetailContent}>
              <View style={s.zoneDetailHeader}>
                <Ionicons name={activeZoneInfo.icon as any} size={14} color={activeZoneInfo.accentColor} />
                <Text style={[s.zoneDetailTitle, { color: activeZoneInfo.accentColor }]} numberOfLines={1}>
                  {activeZoneInfo.label.toUpperCase()}
                </Text>
                <TouchableOpacity onPress={() => setActiveZone(null)} activeOpacity={0.7}>
                  <Ionicons name="close-circle-outline" size={16} color={ECS.muted} />
                </TouchableOpacity>
              </View>
              <View style={s.zoneDetailDivider} />
              <View style={s.zoneDetailRow}>
                <View style={s.zoneDetailCell}>
                  <Text style={s.zoneDetailLabel}>WEIGHT</Text>
                  <Text style={[s.zoneDetailValue, { color: activeZoneInfo.weight !== '--' ? activeZoneInfo.accentColor : ECS.muted }]}>
                    {activeZoneInfo.weight}
                  </Text>
                </View>
                <View style={s.zoneDetailCellSep} />
                <View style={s.zoneDetailCell}>
                  <Text style={s.zoneDetailLabel}>CATEGORY</Text>
                  <Text style={s.zoneDetailValue}>
                    {activeZoneInfo.category.toUpperCase()}
                  </Text>
                </View>
                <View style={s.zoneDetailCellSep} />
                <View style={s.zoneDetailCell}>
                  <Text style={s.zoneDetailLabel}>STATUS</Text>
                  <Text style={[s.zoneDetailValue, { color: '#66BB6A' }]}>
                    {activeZoneInfo.weight !== '--' ? 'LOADED' : 'EMPTY'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[s.zoneManageBtn, { borderColor: activeZoneInfo.accentColor + '40' }]}
                activeOpacity={0.7}
                onPress={() => {
                  // Navigate to loadout manager filtered to this container
                  router.push('/(tabs)/loaditems' as any);
                }}
              >
                <Ionicons name="list-outline" size={11} color={activeZoneInfo.accentColor} />
                <Text style={[s.zoneManageBtnText, { color: activeZoneInfo.accentColor }]}>
                  MANAGE LOADOUT
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════
           WEIGHT DISTRIBUTION TILT INDICATOR
           ═══════════════════════════════════════════════════
           Displays stability score, roll/pitch from weight
           distribution, total load, and grade. Updates in
           real-time when loadout changes or during Quick Fix
           preview simulations.
           ═══════════════════════════════════════════════════ */}
        <View style={s.tiltPanel}>
          {/* Header */}
          <View style={s.tiltHeaderRow}>
            <View style={s.tiltHeaderLeft}>
              <Ionicons name="fitness-outline" size={12} color={ECS.accent} />
              <Text style={s.tiltTitle}>WEIGHT DISTRIBUTION</Text>
            </View>
            <StatusBadge
              label={tiltAnalysis.grade.grade}
              color={tiltAnalysis.grade.color}
            />
          </View>
          <View style={s.tiltDivider} />

          {/* Stability Score — large center display */}
          <View style={s.tiltScoreRow}>
            <View style={s.tiltScoreCenter}>
              <Text style={s.tiltScoreLabel}>STABILITY</Text>
              <Text style={[s.tiltScoreValue, { color: tiltAnalysis.grade.color }]}>
                {tiltAnalysis.score}
              </Text>
              <Text style={[s.tiltScoreDesc, { color: tiltAnalysis.grade.color }]}>
                {tiltAnalysis.grade.description}
              </Text>
            </View>
          </View>

          {/* Tilt data grid */}
          <View style={s.tiltDataGrid}>
            {/* Roll */}
            <View style={s.tiltDataCell}>
              <Text style={s.tiltDataLabel}>ROLL</Text>
              <Text style={[
                s.tiltDataValue,
                tiltAnalysis.degrees.rollDeg !== 0 && { color: ECS.accent },
              ]}>
                {tiltAnalysis.degrees.rollDeg > 0 ? '+' : ''}
                {tiltAnalysis.degrees.rollDeg.toFixed(1)}°
              </Text>
              <Text style={s.tiltDataHint}>
                {tiltAnalysis.tilt.rollNorm < -0.1 ? 'LEFT HEAVY' :
                 tiltAnalysis.tilt.rollNorm > 0.1 ? 'RIGHT HEAVY' : 'CENTERED'}
              </Text>
            </View>

            {/* Divider */}
            <View style={s.tiltDataDivider} />

            {/* Pitch */}
            <View style={s.tiltDataCell}>
              <Text style={s.tiltDataLabel}>PITCH</Text>
              <Text style={[
                s.tiltDataValue,
                tiltAnalysis.degrees.pitchDeg !== 0 && { color: ECS.accent },
              ]}>
                {tiltAnalysis.degrees.pitchDeg > 0 ? '+' : ''}
                {tiltAnalysis.degrees.pitchDeg.toFixed(1)}°
              </Text>
              <Text style={s.tiltDataHint}>
                {tiltAnalysis.tilt.pitchNorm < -0.1 ? 'FRONT HEAVY' :
                 tiltAnalysis.tilt.pitchNorm > 0.1 ? 'REAR HEAVY' : 'LEVEL'}
              </Text>
            </View>

            {/* Divider */}
            <View style={s.tiltDataDivider} />

            {/* Total Load */}
            <View style={s.tiltDataCell}>
              <Text style={s.tiltDataLabel}>TOTAL LOAD</Text>
              <Text style={[
                s.tiltDataValue,
                tiltAnalysis.tilt.totalWeight > 0 && { color: ECS.accent },
              ]}>
                {tiltAnalysis.tilt.totalWeight > 0
                  ? `${Math.round(tiltAnalysis.tilt.totalWeight)}`
                  : '--'}
              </Text>
              <Text style={s.tiltDataHint}>
                {tiltAnalysis.tilt.totalWeight > 0 ? 'LBS' : 'NO LOAD'}
              </Text>
            </View>
          </View>

          {/* Simulation indicator */}
          {isSimulating && (
            <View style={s.tiltSimBanner}>
              <Ionicons name="flask-outline" size={9} color="#D4901A" />
              <Text style={s.tiltSimText}>SIMULATED — Preview active</Text>
            </View>
          )}
        </View>


        {/* ── Stability Strip (immediately below vehicle) ── */}
        {stability && (
          <View style={s.stabilityWrap}>
            <StabilityStrip stability={stability} />
          </View>
        )}

        {/* ── Next Segment Risk (predictive terrain) ───── */}
        <View style={s.predictionWrap}>
          <NextSegmentRiskPanel
            stability={stability}
            currentLat={gps.position?.latitude ?? null}
            currentLon={gps.position?.longitude ?? null}
          />
        </View>

        {/* ── Stability Assist (actionable recommendations) ── */}
        <View style={s.assistWrap}>
          <StabilityAssistPanel stability={stability} twin={twin} />
        </View>


        {/* ── Quick Fix Recommendations ────────────────── */}
        <View style={s.quickFixWrap}>
          <QuickFixPanel
            suggestions={suggestions}
            isOptimal={isOptimal}
            activePreviewId={activePreviewId}
            previewImpact={previewImpact}
            onPreview={handlePreview}
            onResetPreview={handleResetPreview}
          />
        </View>

        {/* ── System Panels (stacked vertically on mobile) ── */}
        <View style={s.panelSectionRow}>
          <View style={s.panelSectionAccent} />
          <Text style={s.panelSectionLabel} numberOfLines={1}>SYSTEM PANELS</Text>
          <View style={s.panelSectionLine} />
        </View>

        <View style={s.panelStack}>
          <CompactPanel
            title="LOADOUT STATUS"
            icon="speedometer-outline"
            statusLabel={twin.hasVehicle ? (isSimulating ? 'SIMULATED' : 'ACTIVE') : 'NO VEHICLE'}
            statusColor={twin.hasVehicle ? (isSimulating ? '#D4901A' : '#66BB6A') : ECS.muted}
            rows={[
              {
                label: 'L Drawer',
                value: isSimulating ? fmtLbs(effectiveZoneWeights.leftDrawer) : twin.leftDrawerDisplay,
                highlight: true,
                valueColor: isSimulating ? '#D4901A' : undefined,
              },
              {
                label: 'R Drawer',
                value: isSimulating ? fmtLbs(effectiveZoneWeights.rightDrawer) : twin.rightDrawerDisplay,
                highlight: true,
                valueColor: isSimulating ? '#D4901A' : undefined,
              },
              {
                label: 'Rear',
                value: isSimulating ? fmtLbs(effectiveZoneWeights.rearContainer) : twin.rearContainerDisplay,
                highlight: true,
                valueColor: isSimulating ? '#D4901A' : undefined,
              },
            ]}
          />

          <CompactPanel
            title="CENTER OF GRAVITY"
            icon="locate-outline"
            statusLabel={twin.hasSpecs ? (isSimulating ? 'PREVIEW' : 'LINKED') : 'NO SPECS'}
            statusColor={twin.hasSpecs ? (isSimulating ? '#D4901A' : '#66BB6A') : ECS.muted}
            rows={[
              {
                label: 'Bias',
                value: rearBiasDir !== '--' ? `${rearBias} ${rearBiasDir}` : '--',
                valueColor: isSimulating ? '#D4901A' : undefined,
              },
              {
                label: 'Lateral',
                value: rightShift,
                valueColor: isSimulating ? '#D4901A' : undefined,
              },
              {
                label: 'Dist',
                value: effectiveFrontAxlePct != null && effectiveRearAxlePct != null
                  ? `${Math.round(effectiveFrontAxlePct)}/${Math.round(effectiveRearAxlePct)}`
                  : twin.distributionDisplay,
                highlight: true,
                valueColor: isSimulating ? '#D4901A' : undefined,
              },
            ]}
          />
          {/* ── POWER SYSTEM (EcoFlow-aware, V1.1) ────── */}
          <View style={s.compactPanel}>
            {/* Header row */}
            <View style={s.cpHeaderRow}>
              <View style={s.cpHeader}>
                <Ionicons name="battery-half-outline" size={12} color={ECS.accent} />
                <Text style={s.cpTitle} numberOfLines={1}>POWER SYSTEM</Text>
              </View>
              <StatusBadge
                label={
                  ecoIsLive ? 'ECOFLOW LIVE'
                    : ecoflow.status === 'degraded' ? 'DEGRADED'
                    : ecoflow.status === 'offline' ? 'OFFLINE'
                    : powerLive ? 'LIVE'
                    : 'STANDBY'
                }
                color={
                  ecoIsLive ? '#66BB6A'
                    : ecoflow.status === 'degraded' ? '#FF9500'
                    : ecoflow.status === 'offline' ? '#FF3B30'
                    : powerLive ? '#66BB6A'
                    : ECS.textMuted
                }
              />
            </View>
            <View style={s.cpDivider} />

            {/* EcoFlow device name + updated ago */}
            {ecoflow.selectedDeviceId ? (
              <View style={s.ecoDeviceRow}>
                <Ionicons name="flash" size={10} color={ecoIsLive ? '#66BB6A' : ecoflow.status === 'degraded' ? '#FF9500' : ECS.textMuted} />
                <Text style={[s.ecoDeviceName, { color: ecoIsLive ? ECS.text : ECS.textMuted }]} numberOfLines={1}>
                  {ecoflow.deviceName}
                </Text>
                {ecoflow.updatedAgoText ? (
                  <Text style={s.ecoTimestamp}>{ecoflow.updatedAgoText}</Text>
                ) : null}
              </View>
            ) : null}

            {/* Degraded warning banner */}
            {ecoflow.status === 'degraded' ? (
              <View style={s.ecoDegradedBanner}>
                <Ionicons name="warning-outline" size={10} color="#FF9500" />
                <Text style={s.ecoDegradedText}>Connection unstable</Text>
              </View>
            ) : null}

            {/* Telemetry grid */}
            {(ecoIsLive || ecoflow.status === 'degraded') ? (
              <View style={s.ecoTelemetryGrid}>
                <View style={s.ecoTelCell}>
                  <Text style={s.ecoTelLabel}>SOC</Text>
                  <Text style={[s.ecoTelValue, { color: (ecoflow.batteryPct ?? 0) >= 60 ? '#66BB6A' : (ecoflow.batteryPct ?? 0) >= 25 ? '#FFB300' : '#FF3B30' }]}>
                    {ecoflow.batteryPct != null ? `${ecoflow.batteryPct}%` : '\u2014'}
                  </Text>
                </View>
                <View style={s.ecoTelCell}>
                  <Text style={s.ecoTelLabel}>SOLAR</Text>
                  <Text style={[s.ecoTelValue, { color: (ecoflow.solarWatts ?? 0) > 0 ? '#FFB300' : ECS.textMuted }]}>
                    {ecoflow.solarWatts != null ? `${ecoflow.solarWatts}W` : '\u2014'}
                  </Text>
                </View>
                <View style={s.ecoTelCell}>
                  <Text style={s.ecoTelLabel}>DRAW</Text>
                  <Text style={[s.ecoTelValue, { color: (ecoflow.outputWatts ?? 0) > 0 ? ECS.accent : ECS.textMuted }]}>
                    {ecoflow.outputWatts != null ? `${ecoflow.outputWatts}W` : '\u2014'}
                  </Text>
                </View>
                {ecoIsLive && ecoflow.inputWatts != null ? (
                  <View style={s.ecoTelCell}>
                    <Text style={s.ecoTelLabel}>INPUT</Text>
                    <Text style={[s.ecoTelValue, { color: ecoflow.inputWatts > 0 ? '#4FC3F7' : ECS.textMuted }]}>
                      {`${ecoflow.inputWatts}W`}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={s.ecoTelemetryGrid}>
                <View style={s.ecoTelCell}>
                  <Text style={s.ecoTelLabel}>SOC</Text>
                  <Text style={[s.ecoTelValue, { color: ECS.textMuted }]}>{'\u2014'}</Text>
                </View>
                <View style={s.ecoTelCell}>
                  <Text style={s.ecoTelLabel}>SOLAR</Text>
                  <Text style={[s.ecoTelValue, { color: ECS.textMuted }]}>{'\u2014'}</Text>
                </View>
                <View style={s.ecoTelCell}>
                  <Text style={s.ecoTelLabel}>DRAW</Text>
                  <Text style={[s.ecoTelValue, { color: ECS.textMuted }]}>{'\u2014'}</Text>
                </View>
              </View>
            )}

            {/* ── POWER INSIGHT (Autopilot Lite V1.2) ──── */}
            {(ecoIsLive || ecoflow.status === 'degraded') && ecoflow.netWatts != null ? (
              <View style={s.insightSection}>
                {/* Section header */}
                <View style={s.insightHeaderRow}>
                  <Ionicons name="analytics-outline" size={9} color={ECS.accent} />
                  <Text style={s.insightHeaderText}>POWER INSIGHT</Text>
                  {ecoflow.sampleCount > 0 ? (
                    <Text style={s.insightSampleBadge}>
                      {ecoflow.sampleCount}/{5} samples
                    </Text>
                  ) : null}
                </View>

                {/* Insight data rows */}
                <View style={s.insightGrid}>
                  {/* Net Power */}
                  <View style={s.insightCell}>
                    <Text style={s.insightLabel}>NET POWER</Text>
                    <Text
                      style={[
                        s.insightValue,
                        {
                          color: ecoflow.netWatts >= 0 ? '#66BB6A' : '#FF9500',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {ecoflow.netWatts >= 0
                        ? `+${Math.round(ecoflow.netWatts)}W`
                        : `${Math.round(ecoflow.netWatts)}W`}
                    </Text>
                    <Text style={s.insightSubtext}>
                      {ecoflow.netWatts >= 0 ? 'charging' : 'draining'}
                    </Text>
                  </View>

                  {/* Divider */}
                  <View style={s.insightDivider} />

                  {/* Endurance */}
                  <View style={s.insightCell}>
                    <Text style={s.insightLabel}>ENDURANCE</Text>
                    <Text
                      style={[
                        s.insightValue,
                        {
                          color: ecoflow.enduranceText === 'Charging'
                            ? '#66BB6A'
                            : ecoflow.enduranceText === 'Below reserve'
                              ? '#FF3B30'
                              : ECS.text,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {ecoflow.enduranceText ?? '\u2014'}
                    </Text>
                    {ecoflow.enduranceText && ecoflow.enduranceText !== 'Charging' && ecoflow.enduranceText !== 'Below reserve' ? (
                      <Text style={s.insightSubtext}>until 20% reserve</Text>
                    ) : null}
                  </View>
                </View>

                {/* Avg output context (subtle) */}
                {ecoflow.avgOutputWatts != null && ecoflow.avgSolarWatts != null ? (
                  <View style={s.insightAvgRow}>
                    <Text style={s.insightAvgText}>
                      Avg draw: {Math.round(ecoflow.avgOutputWatts)}W
                    </Text>
                    <View style={s.insightAvgDot} />
                    <Text style={s.insightAvgText}>
                      Avg solar: {Math.round(ecoflow.avgSolarWatts)}W
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}


            {/* Error row */}
            {ecoflow.status === 'offline' && ecoflow.error ? (
              <View style={s.ecoErrorRow}>
                <Ionicons name="alert-circle-outline" size={10} color="#FF3B30" />
                <Text style={s.ecoErrorText} numberOfLines={1}>{ecoflow.error}</Text>
              </View>
            ) : null}

            {/* Connect / Reconnect / Change Device CTA */}
            {ecoflow.status === 'standby' ? (
              <TouchableOpacity style={s.ecoConnectBtn} onPress={() => setShowEcoFlowPicker(true)} activeOpacity={0.7}>
                <Ionicons name="flash-outline" size={12} color={ECS.accent} />
                <Text style={s.ecoConnectBtnText}>CONNECT ECOFLOW</Text>
              </TouchableOpacity>
            ) : ecoflow.status === 'offline' ? (
              <TouchableOpacity style={[s.ecoConnectBtn, { borderColor: '#FF3B3030' }]} onPress={() => ecoflow.reconnect()} activeOpacity={0.7}>
                <Ionicons name="refresh-outline" size={12} color="#FF3B30" />
                <Text style={[s.ecoConnectBtnText, { color: '#FF3B30' }]}>RECONNECT</Text>
              </TouchableOpacity>
            ) : (ecoIsLive || ecoflow.status === 'degraded') ? (
              <TouchableOpacity style={[s.ecoConnectBtn, { borderColor: ECS.textMuted + '20' }]} onPress={() => setShowEcoFlowPicker(true)} activeOpacity={0.7}>
                <Ionicons name="swap-horizontal-outline" size={12} color={ECS.textMuted} />
                <Text style={[s.ecoConnectBtnText, { color: ECS.textMuted }]}>CHANGE DEVICE</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>



        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── EcoFlow Device Picker Modal ───────────────── */}
      <EcoFlowPickerModal
        visible={showEcoFlowPicker}
        onClose={() => setShowEcoFlowPicker(false)}
        onDeviceSelected={handleEcoFlowDeviceSelected}
      />
    </View>
  );
}


/* ── Styles ────────────────────────────────────────────── */
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ECS.bgPrimary,
  },

  /* ── Header (compact for mobile) ─────────────────────── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: IS_SMALL ? 48 : 54,
    paddingBottom: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: GOLD_RAIL.major,
    gap: 4,
  },
  backBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
    gap: 1,
    minWidth: IS_SMALL ? 80 : 100,
  },
  headerTitle: {
    fontSize: IS_SMALL ? 10 : 12,
    fontWeight: '700',
    color: ECS.accent,
    letterSpacing: IS_SMALL ? 3 : 5,
  },
  headerSub: {
    fontSize: 7,
    fontWeight: '600',
    color: ECS.muted,
    letterSpacing: 2,
  },

  /* HUD chips in header */
  hudRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  hudChip: {
    alignItems: 'center',
    paddingHorizontal: IS_SMALL ? 3 : 4,
    gap: 1,
  },
  hudLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  hudLabel: {
    fontSize: 6,
    fontWeight: '600',
    letterSpacing: 2,
    color: ECS.muted,
  },
  hudLiveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#66BB6A',
  },
  hudValue: {
    fontSize: IS_SMALL ? 10 : 12,
    fontWeight: '700',
    fontFamily: 'Courier',
    letterSpacing: 1,
    color: ECS.text,
  },
  hudSep: {
    width: 1,
    height: 16,
    backgroundColor: GOLD_RAIL.subsection,
  },

  /* ── Scroll ──────────────────────────────────────────── */
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: IS_SMALL ? 10 : DENSITY.screenPad,
    paddingTop: 10,
  },

  /* ── Status badge ────────────────────────────────────── */
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  statusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  statusText: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  stabilityWrap: {
    marginBottom: 10,
  },

  /* ── Prediction panel wrapper ─────────────────────────── */
  predictionWrap: {
    marginBottom: 10,
  },



  /* ── Stability assist wrapper ────────────────────────── */
  assistWrap: {
    marginBottom: 12,
  },

  /* ── Quick Fix wrapper ───────────────────────────────── */
  quickFixWrap: {
    marginBottom: 12,
  },

  /* ── Panel section header ────────────────────────────── */
  panelSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  panelSectionAccent: {
    width: 3,
    height: 12,
    backgroundColor: ECS.accent,
    borderRadius: 1.5,
    opacity: 0.6,
  },
  panelSectionLabel: {
    ...TYPO.T4,
    color: ECS.muted,
    fontSize: 9,
    letterSpacing: 5,
  },
  panelSectionLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: GOLD_RAIL.subsection,
  },

  /* ── System panels — stacked vertically for mobile ───── */
  panelStack: {
    gap: 8,
  },

  /* ── Compact panel (full-width, horizontal data layout) ─ */
  compactPanel: {
    backgroundColor: ECS.bgPanel,
    borderWidth: 1,
    borderColor: ECS.stroke,
    borderRadius: ECS.radius,
    padding: 10,
  },
  cpHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  cpTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 3,
    color: ECS.accent,
    flex: 1,
  },
  cpDivider: {
    height: GOLD_RAIL.sectionWidth,
    backgroundColor: GOLD_RAIL.subsection,
    marginBottom: 8,
  },
  /* Data cells — laid out horizontally in a row */
  cpDataRow: {
    flexDirection: 'row',
  },
  cpCell: {
    flex: 1,
    paddingVertical: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  cpCellBorder: {
    borderRightWidth: GOLD_RAIL.subsectionWidth,
    borderRightColor: GOLD_RAIL.internal,
  },
  cpRowLabel: {
    fontSize: 7,
    fontWeight: '500',
    letterSpacing: 1,
    color: ECS.muted,
    marginBottom: 3,
  },
  cpRowValue: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Courier',
    letterSpacing: 1,
    color: ECS.text,
  },


  /* ── EcoFlow power panel additions ───────────────────── */
  ecoDeviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  ecoDeviceName: {
    fontSize: 10,
    fontWeight: '600',
    color: ECS.text,
    letterSpacing: 0.5,
    flex: 1,
  },
  ecoTimestamp: {
    fontSize: 8,
    fontWeight: '500',
    color: ECS.muted,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  ecoDegradedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginBottom: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,149,0,0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,149,0,0.2)',
  },
  ecoDegradedText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#FF9500',
    letterSpacing: 1,
  },
  ecoTelemetryGrid: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  ecoTelCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  ecoTelLabel: {
    fontSize: 7,
    fontWeight: '500',
    letterSpacing: 1,
    color: ECS.muted,
    marginBottom: 3,
  },
  ecoTelValue: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Courier',
    letterSpacing: 1,
    color: ECS.text,
  },
  ecoErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: GOLD_RAIL.internal,
  },
  ecoErrorText: {
    fontSize: 9,
    fontWeight: '500',
    color: '#FF3B30',
    flex: 1,
    letterSpacing: 0.3,
  },
  ecoConnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS.accent + '40',
    backgroundColor: ECS.accent + '08',
  },
  ecoConnectBtnText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: ECS.accent,
  },
  ecoChangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 6,
    paddingVertical: 4,
  },
  ecoChangeText: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 2,
    color: ECS.muted,
  },

  /* ── Power Insight (Autopilot Lite V1.2) ─────────────── */
  insightSection: {
    marginTop: 4,
    marginBottom: 6,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: GOLD_RAIL.internal,
  },
  insightHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  insightHeaderText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: ECS.accent,
    flex: 1,
  },
  insightSampleBadge: {
    fontSize: 7,
    fontWeight: '500',
    color: ECS.muted,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  insightGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  insightCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  insightDivider: {
    width: 0.5,
    height: 36,
    backgroundColor: GOLD_RAIL.internal,
    alignSelf: 'center',
  },
  insightLabel: {
    fontSize: 7,
    fontWeight: '500',
    letterSpacing: 1.5,
    color: ECS.muted,
    marginBottom: 3,
  },
  insightValue: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
    color: ECS.text,
  },
  insightSubtext: {
    fontSize: 7,
    fontWeight: '500',
    color: ECS.muted,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  insightAvgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 6,
    paddingTop: 5,
    borderTopWidth: 0.5,
    borderTopColor: GOLD_RAIL.internal,
  },
  insightAvgText: {
    fontSize: 7,
    fontWeight: '500',
    color: ECS.muted,
    fontFamily: 'Courier',
    letterSpacing: 0.3,
  },
  insightAvgDot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: ECS.muted,
    opacity: 0.5,
  },


  /* ── Active Zone Detail Panel ─────────────────────────── */
  zoneDetailPanel: {
    flexDirection: 'row',
    backgroundColor: ECS.bgPanel,
    borderWidth: 1,
    borderColor: ECS.stroke,
    borderRadius: ECS.radius,
    marginBottom: 10,
    overflow: 'hidden',
  },
  zoneDetailAccent: {
    width: 4,
  },
  zoneDetailContent: {
    flex: 1,
    padding: 10,
  },
  zoneDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  zoneDetailTitle: {
    flex: 1,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
  },
  zoneDetailDivider: {
    height: 0.5,
    backgroundColor: GOLD_RAIL.subsection,
    marginBottom: 8,
  },
  zoneDetailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  zoneDetailCell: {
    flex: 1,
    alignItems: 'center',
  },
  zoneDetailCellSep: {
    width: 0.5,
    height: 28,
    backgroundColor: GOLD_RAIL.internal,
    alignSelf: 'center',
  },
  zoneDetailLabel: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: ECS.muted,
    marginBottom: 3,
  },
  zoneDetailValue: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
    color: ECS.text,
  },
  zoneManageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(212,160,23,0.04)',
  },
  zoneManageBtnText: {
    fontSize: 9,
    fontWeight: '700',
  },

  /* ═══════════════════════════════════════════════════════════
     WEIGHT DISTRIBUTION TILT PANEL STYLES
     ═══════════════════════════════════════════════════════════ */
  tiltPanel: {
    backgroundColor: ECS.bgPanel,
    borderWidth: 1,
    borderColor: ECS.stroke,
    borderRadius: ECS.radius,
    padding: 10,
    marginBottom: 10,
  },
  tiltHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tiltHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  tiltTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 3,
    color: ECS.accent,
  },
  tiltDivider: {
    height: GOLD_RAIL.sectionWidth,
    backgroundColor: GOLD_RAIL.subsection,
    marginBottom: 8,
  },
  tiltScoreRow: {
    alignItems: 'center',
    marginBottom: 10,
  },
  tiltScoreCenter: {
    alignItems: 'center',
    gap: 2,
  },
  tiltScoreLabel: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 2.5,
    color: ECS.muted,
  },
  tiltScoreValue: {
    fontSize: 28,
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: 1,
  },
  tiltScoreDesc: {
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  tiltDataGrid: {
    flexDirection: 'row',
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: GOLD_RAIL.internal,
  },
  tiltDataCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  tiltDataDivider: {
    width: 0.5,
    height: 40,
    backgroundColor: GOLD_RAIL.internal,
    alignSelf: 'center',
  },
  tiltDataLabel: {
    fontSize: 7,
    fontWeight: '500',
    letterSpacing: 1.5,
    color: ECS.muted,
    marginBottom: 3,
  },
  tiltDataValue: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
    color: ECS.text,
  },
  tiltDataHint: {
    fontSize: 6,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: ECS.muted,
    marginTop: 2,
  },
  tiltSimBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(212,144,26,0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(212,144,26,0.20)',
  },
  tiltSimText: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: '#D4901A',
  },
});





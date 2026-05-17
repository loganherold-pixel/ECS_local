/**
 * BlueprintCanvas — ECS Vehicle Twin Blueprint (V6 — Stabilization Phase 2)
 * ──────────────────────────────────────────────────────────────
 * Renders the vehicle blueprint with interactive container zones
 * that align with the ECS gold wireframe truck image geometry.
 *
 * V6 STABILIZATION CHANGES:
 *   - Grid overlay opacity reduced to 0.15 (was 0.4)
 *   - Vehicle twin container uses maxWidth + responsive padding
 *   - Added container padding safeguards to prevent clipping
 *   - Aspect ratio preserved with responsive maxWidth
 *   - Better scaling on tablets and landscape mode
 *   - Canvas padding increased for breathing room
 *   - Vehicle silhouette is now a low-contrast background (via BlueprintVehicleLayer V9)
 *   - Container zones have higher contrast (via SmartContainerZones V2)
 *
 * Rendering stack (z-order):
 *   Layer 0  →  Vehicle silhouette (centered, 78% width, low opacity, TILTED)
 *   Layer 1  →  Blueprint grid overlay (very subtle)
 *   Layer 5  →  Smart container zones (clickable overlays, flat, high contrast)
 *   Layer 10 →  Center of gravity crosshair marker (flat)
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL, TYPO } from '../../lib/theme';
import { BlueprintGrid } from './BlueprintGrid';
import BlueprintVehicleLayer, { type VehicleType } from './BlueprintVehicleLayer';
import SmartContainerZones from './SmartContainerZones';

/* ── Clamp helper ─────────────────────────────────────────── */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/* ── Responsive fallback ──────────────────────────────────── */
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const IS_SMALL = SCREEN_W < 380;
const IS_TABLET = SCREEN_W >= 768;
const IS_LANDSCAPE = SCREEN_W > SCREEN_H;
const SIDE_PAD = IS_SMALL ? 24 : 32;
const FALLBACK_CANVAS_W = Math.min(SCREEN_W - SIDE_PAD, 420);

/* ── CG Marker constants ──────────────────────────────────── */
const CG_DOT = 12;
const CG_RING = 22;
const CG_ANIM_MS = 300;

/* ── Colors ───────────────────────────────────────────────── */
const G = {
  '04': 'rgba(212,160,23,0.04)',
  '08': 'rgba(212,160,23,0.08)',
  '12': 'rgba(212,160,23,0.12)',
  '18': 'rgba(212,160,23,0.18)',
  '25': 'rgba(212,160,23,0.25)',
  '35': 'rgba(212,160,23,0.35)',
};
const AMBER_WARN = '#D4901A';

/* ═══════════════════════════════════════════════════════════
   CG Crosshair Marker (animated, percentage-based)
   ═══════════════════════════════════════════════════════════ */
function CGMarker({
  verticalFrac,
  horizontalFrac,
  containerW,
  containerH,
}: {
  verticalFrac: number;
  horizontalFrac: number | null;
  containerW: number;
  containerH: number;
}) {
  const animTop = useRef(new Animated.Value(verticalFrac)).current;
  const animLeft = useRef(new Animated.Value(horizontalFrac ?? 0.5)).current;

  useEffect(() => {
    Animated.timing(animTop, {
      toValue: verticalFrac,
      duration: CG_ANIM_MS,
      useNativeDriver: false,
    }).start();
  }, [verticalFrac, animTop]);

  useEffect(() => {
    if (horizontalFrac != null) {
      Animated.timing(animLeft, {
        toValue: horizontalFrac,
        duration: CG_ANIM_MS,
        useNativeDriver: false,
      }).start();
    }
  }, [horizontalFrac, animLeft]);

  const cgAreaTop = containerH * 0.20;
  const cgAreaHeight = containerH * 0.68;

  const top = animTop.interpolate({
    inputRange: [0, 1],
    outputRange: [cgAreaTop - CG_RING / 2, cgAreaTop + cgAreaHeight - CG_RING / 2],
    extrapolate: 'clamp',
  });

  const cgAreaLeft = containerW * 0.20;
  const cgAreaWidth = containerW * 0.60;

  const left = horizontalFrac != null
    ? animLeft.interpolate({
        inputRange: [0, 1],
        outputRange: [cgAreaLeft - CG_RING / 2, cgAreaLeft + cgAreaWidth - CG_RING / 2],
        extrapolate: 'clamp',
      })
    : (containerW - CG_RING) / 2;

  return (
    <Animated.View style={[st.cgWrap, { top, left }]} pointerEvents="none">
      <View style={st.cgGlow} />
      <View style={st.cgRing} />
      <View style={st.cgCrossH} />
      <View style={st.cgCrossV} />
      <View style={st.cgDot} />
      <View style={st.cgLabelWrap}>
        <Text style={st.cgLabel}>CG</Text>
      </View>
    </Animated.View>
  );
}

/* ═══════════════════════════════════════════════════════════
   Axle Callout (scaled)
   ═══════════════════════════════════════════════════════════ */
function AxleCallout({
  label,
  value,
  highlighted,
  scale,
}: {
  label: string;
  value: string;
  position: 'front' | 'rear';
  highlighted?: boolean;
  scale: number;
}) {
  const dotClr = highlighted ? AMBER_WARN : G['25'];
  const labelFontSize = clamp(6 * scale, 5, 8);
  const valueFontSize = clamp(11 * scale, 9, 15);
  const whlSize = clamp(6 * scale, 5, 9);
  const barW = clamp(10 * scale, 8, 14);
  const boxMinW = clamp(90 * scale, 70, 140);
  const boxMaxW = clamp(140 * scale, 100, 200);
  const mv = clamp(3 * scale, 2, 5);

  return (
    <View style={[st.axleRow, { marginVertical: mv }]}>
      <View style={[st.axleDot, { backgroundColor: dotClr }]} />
      <View style={[st.axleLine, { backgroundColor: dotClr }]} />
      <View style={st.axleWheelGrp}>
        <View style={[st.axleWhl, { width: whlSize, height: whlSize, borderRadius: whlSize / 2 }, highlighted && st.axleWhlW]} />
        <View style={[st.axleBar, { width: barW }, highlighted && st.axleBarW]} />
        <View style={[st.axleWhl, { width: whlSize, height: whlSize, borderRadius: whlSize / 2 }, highlighted && st.axleWhlW]} />
      </View>
      <View style={[st.axleBox, { minWidth: boxMinW, maxWidth: boxMaxW }, highlighted && st.axleBoxW]}>
        <Text style={[st.axleLbl, { fontSize: labelFontSize }]} numberOfLines={1}>{label}</Text>
        <View style={st.axleDiv} />
        <Text style={[st.axleVal, { fontSize: valueFontSize }, highlighted && { color: AMBER_WARN }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <View style={st.axleWheelGrp}>
        <View style={[st.axleWhl, { width: whlSize, height: whlSize, borderRadius: whlSize / 2 }, highlighted && st.axleWhlW]} />
        <View style={[st.axleBar, { width: barW }, highlighted && st.axleBarW]} />
        <View style={[st.axleWhl, { width: whlSize, height: whlSize, borderRadius: whlSize / 2 }, highlighted && st.axleWhlW]} />
      </View>
      <View style={[st.axleLine, { backgroundColor: dotClr }]} />
      <View style={[st.axleDot, { backgroundColor: dotClr }]} />
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════════════════ */
interface TwinWeights {
  roofWeightDisplay: string;
  cabWeightDisplay: string;
  bedWeightDisplay: string;
  frontAxleDisplay: string;
  rearAxleDisplay: string;
  frontAxleLbs: number | null;
  rearAxleLbs: number | null;
}

export interface ImbalanceFlags {
  leftHeavy: boolean;
  rightHeavy: boolean;
  roofOverloaded: boolean;
  rearHeavy: boolean;
}

interface Props {
  weights: TwinWeights;
  activeZone: string | null;
  onZonePress: (id: string) => void;
  cgVerticalFrac: number | null;
  cgHorizontalFrac: number | null;
  schematicTransform: any;
  imbalance?: ImbalanceFlags;
  vehicleType?: VehicleType;
  /** Optional per-zone weight displays for smart container zones */
  zoneWeightMap?: Record<string, string>;
  /** Weight-based roll tilt in degrees (max ±3°). From vehicleTiltEngine. */
  weightRollDeg?: number;
  /** Weight-based pitch tilt in degrees (max ±2°). From vehicleTiltEngine. */
  weightPitchDeg?: number;
}

/* ═══════════════════════════════════════════════════════════
   BlueprintCanvas (main export)
   ═══════════════════════════════════════════════════════════ */
export function BlueprintCanvas({
  weights,
  activeZone,
  onZonePress,
  cgVerticalFrac,
  cgHorizontalFrac,
  schematicTransform,
  imbalance,
  vehicleType = 'truck',
  zoneWeightMap,
  weightRollDeg = 0,
  weightPitchDeg = 0,
}: Props) {
  /* ── Container measurement state ─────────────────────── */
  const [twinW, setTwinW] = useState(0);
  const [twinH, setTwinH] = useState(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setTwinW(width);
      setTwinH(height);
    }
  }, []);

  /* ── Vehicle twin container measurement ──────────────── */
  const [vehicleContainerW, setVehicleContainerW] = useState(0);
  const [vehicleContainerH, setVehicleContainerH] = useState(0);

  const handleVehicleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setVehicleContainerW(width);
      setVehicleContainerH(height);
    }
  }, []);

  /* ── Derive scale factor ─────────────────────────────── */
  const hasMeasured = twinW > 0 && twinH > 0;
  const base = hasMeasured ? Math.min(twinW, twinH) : 360;
  const scale = clamp(base / 360, 0.85, 1.35);

  /* ── Grid dimensions ─────────────────────────────────── */
  const gridW = hasMeasured ? Math.round(twinW - 16) : FALLBACK_CANVAS_W;
  const gridH = hasMeasured ? Math.round(twinH - 16) : 500;

  const ib = useMemo(() => imbalance ?? {
    leftHeavy: false,
    rightHeavy: false,
    roofOverloaded: false,
    rearHeavy: false,
  }, [imbalance]);

  /* ── Build zone weight map from twin weights ─────────── */
  const effectiveZoneWeights = useMemo(() => {
    if (zoneWeightMap) return zoneWeightMap;
    return {
      roof_rack: weights.roofWeightDisplay,
      cab_storage: weights.cabWeightDisplay,
      rear_seat: '--',
      bed_main: weights.bedWeightDisplay,
      bed_drawer_left: '--',
      bed_drawer_right: '--',
      front_bumper: '--',
    };
  }, [zoneWeightMap, weights]);

  /* ── Build imbalance zone list ───────────────────────── */
  const imbalanceZones = useMemo(() => {
    const zones: string[] = [];
    if (ib.roofOverloaded) zones.push('roof_rack');
    if (ib.rearHeavy) zones.push('bed_main');
    if (ib.leftHeavy) zones.push('bed_drawer_left');
    if (ib.rightHeavy) zones.push('bed_drawer_right');
    return zones;
  }, [ib]);

  /* ── Scaled typography ───────────────────────────────── */
  const dirFontSize = clamp(7 * scale, 6, 10);
  const dirMV = clamp(4 * scale, 2, 6);

  /* ── Responsive maxWidth for vehicle twin container ───── */
  const vehicleMaxW = IS_LANDSCAPE
    ? Math.min(SCREEN_W * 0.45, 380)
    : IS_TABLET
    ? Math.min(SCREEN_W * 0.55, 450)
    : Math.min(SCREEN_W - 40, 420);

  return (
    <View style={st.outer}>
      {/* Section label */}
      <View style={st.secRow}>
        <View style={st.secAccent} />
        <Text style={st.secLabel} numberOfLines={1}>VEHICLE BLUEPRINT</Text>
        <View style={st.secLine} />
      </View>

      {/* Measured container — captures actual available space */}
      <View style={st.measureWrap} onLayout={handleLayout}>
        {/* Canvas (animated with attitude tilt) */}
        <Animated.View style={[st.canvas, schematicTransform]}>

          {/* ── FRONT AXLE ──────────────────────────── */}
          <AxleCallout label="FRONT AXLE" value={weights.frontAxleDisplay} position="front" scale={scale} />

          {/* ── Direction: FRONT ─────────────────────── */}
          <View style={[st.dirRow, { marginVertical: dirMV }]}>
            <View style={st.dirLine} />
            <Ionicons name="caret-up-outline" size={clamp(7 * scale, 5, 10)} color={ECS.muted} />
            <Text style={[st.dirText, { fontSize: dirFontSize }]}>FRONT</Text>
            <Ionicons name="caret-up-outline" size={clamp(7 * scale, 5, 10)} color={ECS.muted} />
            <View style={st.dirLine} />
          </View>

          {/* ══════════════════════════════════════════
             VEHICLE TWIN CONTAINER — 9:16 aspect ratio
             V6: responsive maxWidth, padding safeguards
             ══════════════════════════════════════════ */}
          <View
            style={[st.vehicleTwinContainer, { maxWidth: vehicleMaxW }]}
            onLayout={handleVehicleLayout}
          >
            {/* ── Layer 0: Vehicle silhouette (centered, low opacity, TILTED) ── */}
            <BlueprintVehicleLayer
              vehicleType={vehicleType}
              imbalance={ib}
              weightRollDeg={weightRollDeg}
              weightPitchDeg={weightPitchDeg}
            />

            {/* ── Layer 1: Blueprint grid (very subtle background, flat) ── */}
            <View style={st.gridOverlay} pointerEvents="none">
              <BlueprintGrid
                width={vehicleContainerW > 0 ? vehicleContainerW : gridW}
                height={vehicleContainerH > 0 ? vehicleContainerH : gridH}
              />
            </View>

            {/* ── Layer 5: Smart Container Zones (clickable, FLAT, high contrast) ── */}
            <SmartContainerZones
              activeZone={activeZone}
              onZonePress={onZonePress}
              zoneWeights={effectiveZoneWeights}
              imbalanceZones={imbalanceZones}
            />

            {/* ── Layer 10: CG Marker overlay (FLAT) ─────────── */}
            {cgVerticalFrac != null && vehicleContainerW > 0 && vehicleContainerH > 0 && (
              <View style={st.cgOverlay} pointerEvents="none">
                <CGMarker
                  verticalFrac={cgVerticalFrac}
                  horizontalFrac={cgHorizontalFrac}
                  containerW={vehicleContainerW}
                  containerH={vehicleContainerH}
                />
              </View>
            )}
          </View>

          {/* ── Direction: REAR ──────────────────────── */}
          <View style={[st.dirRow, { marginVertical: dirMV }]}>
            <View style={st.dirLine} />
            <Ionicons name="caret-down-outline" size={clamp(7 * scale, 5, 10)} color={ECS.muted} />
            <Text style={[st.dirText, { fontSize: dirFontSize }]}>REAR</Text>
            <Ionicons name="caret-down-outline" size={clamp(7 * scale, 5, 10)} color={ECS.muted} />
            <View style={st.dirLine} />
          </View>

          {/* ── Layer 4: REAR AXLE ───────────────────── */}
          <AxleCallout
            label="REAR AXLE"
            value={weights.rearAxleDisplay}
            position="rear"
            highlighted={ib.rearHeavy}
            scale={scale}
          />

          {/* ── Imbalance legend ──────────────────────── */}
          {(ib.leftHeavy || ib.rightHeavy || ib.roofOverloaded || ib.rearHeavy) && (
            <View style={[st.legendRow, { marginTop: clamp(8 * scale, 4, 12) }]}>
              <View style={st.legendDot} />
              <Text style={[st.legendTxt, { fontSize: clamp(7 * scale, 5, 10) }]} numberOfLines={1}>LOAD IMBALANCE DETECTED</Text>
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════
   Styles (V6 — Stabilization Phase 2)
   ═══════════════════════════════════════════════════════════ */
const AMBER_BORDER = 'rgba(212,144,26,0.45)';

const st = StyleSheet.create({
  outer: { marginBottom: 10 },

  /* Section header */
  secRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  secAccent: { width: 3, height: 12, backgroundColor: ECS.accent, borderRadius: 1.5, opacity: 0.6 },
  secLabel: { ...TYPO.T4, color: ECS.muted, fontSize: 9, letterSpacing: 5 },
  secLine: { flex: 1, height: 0.5, backgroundColor: GOLD_RAIL.subsection },

  /* Measured container — fills available width, captures layout */
  measureWrap: {
    width: '100%',
  },

  /* Canvas — V12: overflow changed to 'visible' so the 25% enlarged
     truck image (via BlueprintVehicleLayer V12 negative-inset tiltLayer)
     is not clipped at the canvas edges. The gold wireframe's transparent
     margins absorb most of the overflow; the visible truck body stays
     within or very near the panel border. */
  canvas: {
    backgroundColor: ECS.bgPanel,
    borderWidth: 1,
    borderColor: ECS.stroke,
    borderRadius: 16,
    padding: IS_SMALL ? 8 : 10,
    alignItems: 'center',
    overflow: 'visible',
  },


  /* ── Vehicle Twin Container — 9:16 aspect ratio ── */
  /* V11: overflow changed to 'visible' so the 25% enlarged truck image
     is not clipped at the container edges. The gold wireframe stays
     fully visible while scaling beyond the original container bounds.
     The container zones and grid remain unaffected. */
  vehicleTwinContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 9 / 16,
    alignSelf: 'center',
    overflow: 'visible',
    borderRadius: 8,
    backgroundColor: 'transparent',
    padding: 1,
  },



  /* Grid overlay — V6: reduced opacity from 0.4 to 0.15 */
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
    opacity: 0.15,
  },

  /* Direction labels */
  dirRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    width: '100%', paddingHorizontal: 8,
  },
  dirText: { fontWeight: '700', letterSpacing: 4, color: ECS.muted },
  dirLine: { flex: 1, height: 0.5, backgroundColor: GOLD_RAIL.subsection },

  /* ── Axle callout ──────────────────────────────────────── */
  axleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    width: '100%', paddingHorizontal: 4, gap: 3,
  },
  axleDot: { width: 4, height: 4, borderRadius: 2 },
  axleLine: { flex: 1, height: 0.5 },
  axleWheelGrp: { flexDirection: 'row', alignItems: 'center' },
  axleWhl: {
    borderWidth: 1, borderColor: G['25'], backgroundColor: G['04'],
  },
  axleWhlW: { borderColor: AMBER_BORDER, backgroundColor: 'rgba(212,144,26,0.12)' },
  axleBar: { height: 2, backgroundColor: G['25'], borderRadius: 1 },
  axleBarW: { backgroundColor: AMBER_BORDER },
  axleBox: {
    alignItems: 'center', paddingVertical: 4, paddingHorizontal: 10,
    borderWidth: 1, borderColor: GOLD_RAIL.subsection, borderRadius: 6,
    backgroundColor: 'rgba(11,14,18,0.92)',
  },
  axleBoxW: {
    borderColor: AMBER_BORDER, backgroundColor: 'rgba(212,144,26,0.05)',
    shadowColor: AMBER_WARN, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 2,
  },
  axleLbl: { fontWeight: '700', letterSpacing: 2.5, color: ECS.muted, textAlign: 'center' },
  axleDiv: { width: 28, height: 0.5, backgroundColor: GOLD_RAIL.subsection, marginVertical: 2 },
  axleVal: { fontWeight: '800', fontFamily: 'Courier', letterSpacing: 1, color: ECS.accent, textAlign: 'center' },

  /* ── CG Marker ─────────────────────────────────────────── */
  cgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  cgWrap: {
    position: 'absolute', width: CG_RING, height: CG_RING,
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  cgGlow: {
    position: 'absolute', width: CG_RING + 6, height: CG_RING + 6,
    borderRadius: (CG_RING + 6) / 2, backgroundColor: 'rgba(212,160,23,0.06)',
    shadowColor: '#D4A017', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 3,
  },
  cgRing: {
    position: 'absolute', width: CG_RING, height: CG_RING,
    borderRadius: CG_RING / 2, borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.3)', backgroundColor: 'rgba(212,160,23,0.04)',
  },
  cgCrossH: { position: 'absolute', width: CG_RING - 4, height: 0.5, backgroundColor: 'rgba(212,160,23,0.4)' },
  cgCrossV: { position: 'absolute', height: CG_RING - 4, width: 0.5, backgroundColor: 'rgba(212,160,23,0.4)' },
  cgDot: {
    width: CG_DOT, height: CG_DOT, borderRadius: CG_DOT / 2,
    backgroundColor: ECS.accent, borderWidth: 1.5,
    borderColor: 'rgba(212,160,23,0.6)',
    shadowColor: '#D4A017', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55, shadowRadius: 8, elevation: 6,
  },
  cgLabelWrap: { position: 'absolute', right: -16, top: CG_RING / 2 - 5 },
  cgLabel: { fontSize: 6, fontWeight: '800', letterSpacing: 2, color: ECS.accent, opacity: 0.85 },

  /* ── Legend ─────────────────────────────────────────────── */
  legendRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 4, paddingHorizontal: 10,
  },
  legendDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: AMBER_WARN, opacity: 0.7 },
  legendTxt: { fontWeight: '700', letterSpacing: 3, color: AMBER_WARN, opacity: 0.6 },
});




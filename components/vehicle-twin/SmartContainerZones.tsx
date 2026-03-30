/**
 * SmartContainerZones — ECS Vehicle Twin Interactive Container Zones (V2 — Stabilization Phase 2)
 * ──────────────────────────────────────────────────────────────────
 * Renders 7 clickable container zones positioned using percentage-based
 * coordinates that align with the ECS gold wireframe truck image.
 *
 * V2 STABILIZATION CHANGES:
 *   - Increased contrast between zones and vehicle background
 *   - Added 1% visual spacing between adjacent zones (gap via position offsets)
 *   - Stronger selected state: brighter fill + thicker border + subtle glow
 *   - Adaptive font sizing based on screen width
 *   - Labels scale down on small screens before allowing overlap
 *   - Zone borders more visible against the low-opacity vehicle silhouette
 *   - Imbalance zones use a distinct amber border without blocking content
 *   - All zones remain fully selectable (zIndex 5, above vehicle at zIndex 0)
 *   - Responsive across phones, tablets, landscape, CarPlay, Android Auto
 *
 * Zones:
 *   1. Roof Rack       — roof section (top: 18%)
 *   2. Cab Storage     — front interior (top: 29%)
 *   3. Rear Seat       — rear cabin (top: 43%)
 *   4. Bed Drawer Left — left truck bed (top: 59%)
 *   5. Bed Main        — center truck bed (top: 59%)
 *   6. Bed Drawer Right— right truck bed (top: 59%)
 *   7. Front Bumper    — front equipment mount (top: 8%)
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, ZONE_ACCENT_SOLID } from '../../lib/theme';

/* ── Responsive scaling ────────────────────────────────── */
const { width: SCREEN_W } = Dimensions.get('window');
const IS_SMALL = SCREEN_W < 380;
const IS_TABLET = SCREEN_W >= 768;

/* Adaptive font sizes — scale down on small screens */
const FONT = {
  labelStd: IS_SMALL ? 7 : IS_TABLET ? 9 : 8,
  labelNarrow: IS_SMALL ? 5 : IS_TABLET ? 7 : 6,
  labelCompact: IS_SMALL ? 6 : IS_TABLET ? 8 : 7,
  weightStd: IS_SMALL ? 10 : IS_TABLET ? 14 : 12,
  weightNarrow: IS_SMALL ? 7 : IS_TABLET ? 9 : 8,
  weightCompact: IS_SMALL ? 8 : IS_TABLET ? 10 : 9,
  iconStd: IS_SMALL ? 10 : IS_TABLET ? 13 : 11,
  iconNarrow: IS_SMALL ? 8 : IS_TABLET ? 11 : 10,
  iconCompact: IS_SMALL ? 8 : IS_TABLET ? 10 : 9,
  imbalance: IS_SMALL ? 5 : 6,
};

/* ═══════════════════════════════════════════════════════════════
   Zone Definition Type
   ═══════════════════════════════════════════════════════════════ */
export interface ContainerZone {
  id: string;
  label: string;
  shortLabel: string;
  icon: string;
  /** Percentage-based position (0–100) relative to vehicle twin container */
  top: number;
  left: number;
  width: number;
  height: number;
  /** Accent color for zone */
  accentColor: string;
  /** Zone category for loadout mapping */
  category: 'roof' | 'cab' | 'bed' | 'drawer' | 'bumper';
}

/* ═══════════════════════════════════════════════════════════════
   ECS Container Zone Definitions (V2: 1% spacing between adjacent zones)
   ═══════════════════════════════════════════════════════════════
   Coordinates aligned with the vertical truck wireframe image:
     - Front of truck faces upward
     - 9:16 aspect ratio container
     - Percentages relative to container dimensions
     - Adjacent zones have 1% gap for visual separation
   ═══════════════════════════════════════════════════════════════ */
export const CONTAINER_ZONES: ContainerZone[] = [
  {
    id: 'front_bumper',
    label: 'Front Bumper',
    shortLabel: 'BUMPER',
    icon: 'shield-outline',
    top: 8,
    left: 32,
    width: 36,
    height: 7,
    accentColor: ZONE_ACCENT_SOLID.HITCH,
    category: 'bumper',
  },
  {
    id: 'roof_rack',
    label: 'Roof Rack',
    shortLabel: 'ROOF',
    icon: 'layers-outline',
    top: 17,
    left: 32,
    width: 36,
    height: 9,       // V2: reduced 1% for gap below
    accentColor: ZONE_ACCENT_SOLID.RACK,
    category: 'roof',
  },
  {
    id: 'cab_storage',
    label: 'Cab Storage',
    shortLabel: 'CAB',
    icon: 'navigate-outline',
    top: 28,          // V2: 1% gap after roof (was 28)
    left: 30,
    width: 40,
    height: 12,       // V2: reduced 1% for gap below
    accentColor: ZONE_ACCENT_SOLID.CAB,
    category: 'cab',
  },
  {
    id: 'rear_seat',
    label: 'Rear Seat Storage',
    shortLabel: 'REAR',
    icon: 'car-outline',
    top: 42,          // V2: 1% gap after cab (was 42)
    left: 30,
    width: 40,
    height: 11,       // V2: reduced 1% for gap below
    accentColor: ZONE_ACCENT_SOLID.CAB,
    category: 'cab',
  },
  {
    id: 'bed_drawer_left',
    label: 'Bed Drawer Left',
    shortLabel: 'L DWR',
    icon: 'file-tray-stacked-outline',
    top: 58,          // V2: 1% gap after rear seat
    left: 20,
    width: 11,        // V2: reduced 1% for gap to bed_main
    height: 25,       // V2: reduced 1% for bottom breathing room
    accentColor: ZONE_ACCENT_SOLID.DRAWER,
    category: 'drawer',
  },
  {
    id: 'bed_main',
    label: 'Bed Main',
    shortLabel: 'BED',
    icon: 'cube-outline',
    top: 58,
    left: 33,         // V2: 1% gap after left drawer (was 33)
    width: 34,
    height: 25,
    accentColor: ZONE_ACCENT_SOLID.BED,
    category: 'bed',
  },
  {
    id: 'bed_drawer_right',
    label: 'Bed Drawer Right',
    shortLabel: 'R DWR',
    icon: 'file-tray-stacked-outline',
    top: 58,
    left: 69,         // V2: 1% gap after bed_main (was 68)
    width: 11,
    height: 25,
    accentColor: ZONE_ACCENT_SOLID.DRAWER,
    category: 'drawer',
  },
];

/* ═══════════════════════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════════════════════ */
interface Props {
  activeZone: string | null;
  onZonePress: (zoneId: string) => void;
  /** Optional zone weight displays keyed by zone ID */
  zoneWeights?: Record<string, string>;
  /** Optional imbalance flags for visual warnings */
  imbalanceZones?: string[];
}

/* ═══════════════════════════════════════════════════════════════
   Individual Zone Button (V2: enhanced contrast + selection state)
   ═══════════════════════════════════════════════════════════════ */
function ZoneButton({
  zone,
  isActive,
  isImbalanced,
  weight,
  onPress,
}: {
  zone: ContainerZone;
  isActive: boolean;
  isImbalanced: boolean;
  weight?: string;
  onPress: () => void;
}) {
  const AMBER_WARN = '#D4901A';

  /* V2: Higher contrast colors for better visibility over low-opacity vehicle */
  const accent = isImbalanced
    ? AMBER_WARN
    : isActive
    ? zone.accentColor
    : 'rgba(255,190,60,0.55)';  // V2: was 0.35

  const bgColor = isImbalanced
    ? 'rgba(212,144,26,0.10)'
    : isActive
    ? `${zone.accentColor}20`   // V2: was 15
    : 'rgba(255,190,60,0.08)';  // V2: was 0.06

  const borderColor = isImbalanced
    ? 'rgba(212,144,26,0.55)'   // V2: was 0.50
    : isActive
    ? `${zone.accentColor}80`   // V2: was 60
    : 'rgba(255,190,60,0.35)';  // V2: was 0.25

  /* V2: Active zones get a subtle glow via shadow */
  const activeShadow = isActive ? {
    shadowColor: zone.accentColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  } : {};

  const isNarrow = zone.width <= 14;
  const isShort = zone.height <= 9;

  return (
    <TouchableOpacity
      style={[
        st.zoneBtn,
        {
          top: `${zone.top}%` as any,
          left: `${zone.left}%` as any,
          width: `${zone.width}%` as any,
          height: `${zone.height}%` as any,
          backgroundColor: bgColor,
          borderColor: borderColor,
          borderWidth: isActive ? 2 : isImbalanced ? 1.5 : 1,
        },
        activeShadow,
      ]}
      activeOpacity={0.55}
      onPress={onPress}
    >
      {/* Zone content — adapts to narrow/short zones */}
      {isNarrow ? (
        /* Vertical layout for narrow drawer zones */
        <View style={st.zoneContentVertical}>
          <Ionicons
            name={zone.icon as any}
            size={FONT.iconNarrow}
            color={accent}
          />
          <Text
            style={[st.zoneLabelVertical, { color: accent, fontSize: FONT.labelNarrow }]}
            numberOfLines={1}
          >
            {zone.shortLabel}
          </Text>
          {weight && weight !== '--' && (
            <Text
              style={[st.zoneWeightVertical, {
                color: isActive ? zone.accentColor : ECS.text,
                fontSize: FONT.weightNarrow,
              }]}
              numberOfLines={1}
            >
              {weight}
            </Text>
          )}
        </View>
      ) : isShort ? (
        /* Horizontal compact layout for short zones (bumper, roof) */
        <View style={st.zoneContentCompact}>
          <Ionicons
            name={zone.icon as any}
            size={FONT.iconCompact}
            color={accent}
          />
          <Text
            style={[st.zoneLabelCompact, { color: accent, fontSize: FONT.labelCompact }]}
            numberOfLines={1}
          >
            {zone.shortLabel}
          </Text>
          {weight && weight !== '--' && (
            <Text
              style={[st.zoneWeightCompact, {
                color: isActive ? zone.accentColor : ECS.text,
                fontSize: FONT.weightCompact,
              }]}
              numberOfLines={1}
            >
              {weight}
            </Text>
          )}
        </View>
      ) : (
        /* Standard layout for larger zones */
        <View style={st.zoneContentStandard}>
          <View style={st.zoneHeaderRow}>
            <Ionicons
              name={zone.icon as any}
              size={FONT.iconStd}
              color={accent}
            />
            <Text
              style={[st.zoneLabelStandard, { color: accent, fontSize: FONT.labelStd }]}
              numberOfLines={1}
            >
              {zone.shortLabel}
            </Text>
            {isActive && (
              <View style={[st.activePip, { backgroundColor: zone.accentColor }]} />
            )}
            {isImbalanced && !isActive && (
              <View style={[st.activePip, { backgroundColor: AMBER_WARN }]} />
            )}
          </View>
          {weight && weight !== '--' && (
            <Text
              style={[
                st.zoneWeightStandard,
                {
                  fontSize: FONT.weightStd,
                  color: isImbalanced
                    ? AMBER_WARN
                    : isActive
                    ? zone.accentColor
                    : ECS.text,
                },
              ]}
              numberOfLines={1}
            >
              {weight}
            </Text>
          )}
          {isImbalanced && (
            <Text style={[st.imbalanceHint, { fontSize: FONT.imbalance }]} numberOfLines={1}>IMBALANCE</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SmartContainerZones (main export)
   ═══════════════════════════════════════════════════════════════ */
export default function SmartContainerZones({
  activeZone,
  onZonePress,
  zoneWeights,
  imbalanceZones,
}: Props) {
  const imbalanceSet = new Set(imbalanceZones ?? []);

  return (
    <View style={st.zonesContainer} pointerEvents="box-none">
      {CONTAINER_ZONES.map((zone) => (
        <ZoneButton
          key={zone.id}
          zone={zone}
          isActive={activeZone === zone.id}
          isImbalanced={imbalanceSet.has(zone.id)}
          weight={zoneWeights?.[zone.id]}
          onPress={() => onZonePress(zone.id)}
        />
      ))}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Styles (V2: enhanced contrast and selection states)
   ═══════════════════════════════════════════════════════════════ */
const st = StyleSheet.create({
  /* Overlay container — fills the vehicle twin container */
  zonesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },

  /* Individual zone button — positioned via percentage inline styles */
  zoneBtn: {
    position: 'absolute',
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 3,
  },

  /* ── Standard layout (larger zones: cab, rear seat, bed main) ── */
  zoneContentStandard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  zoneHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  zoneLabelStandard: {
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  zoneWeightStandard: {
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  activePip: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginLeft: 2,
  },
  imbalanceHint: {
    fontWeight: '700',
    letterSpacing: 2,
    color: '#D4901A',
    opacity: 0.8,
    marginTop: 1,
  },

  /* ── Vertical layout (narrow drawer zones) ── */
  zoneContentVertical: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
  },
  zoneLabelVertical: {
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  zoneWeightVertical: {
    fontWeight: '700',
    fontFamily: 'Courier',
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  /* ── Compact layout (short zones: bumper, roof) ── */
  zoneContentCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  zoneLabelCompact: {
    fontWeight: '800',
    letterSpacing: 2,
  },
  zoneWeightCompact: {
    fontWeight: '700',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
});




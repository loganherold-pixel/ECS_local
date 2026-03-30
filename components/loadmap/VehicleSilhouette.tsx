/**
 * Vehicle Silhouette — ECS Vector + Zone Overlay System
 * ─────────────────────────────────────────────────────────
 * Renders the semi-realistic ECS vehicle silhouette with
 * interactive zone highlight overlays.
 *
 * Each zone is mapped to a rectangular region on the
 * silhouette. Tapping a zone opens the zone detail modal.
 *
 * Uses the modular ECS vector system:
 *   base vehicle + bed module + roof module + hitch module
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, getZoneAccentSolid } from '../../lib/theme';

import { VehicleCompositor } from '../ecs-vectors';
import { getVehicleBase } from '../ecs-vectors/bases';
import type { VehicleBaseType, BedModuleType, RoofModuleType, HitchModuleType } from '../ecs-vectors/spec';
import { getZoneRect, viewBoxToScreen } from './ZoneRegions';

// ── Zone info shape ─────────────────────────────────────
export interface SilhouetteZone {
  id: string;
  name: string;
  zone_type: string;
  slot_count: number;
  color: string | null;
  icon: string | null;
  items_count: number;
  packed_count: number;
}

interface Props {
  vehicleType: string;
  zones: SilhouetteZone[];
  onZonePress: (zoneId: string) => void;
  /** Wizard config for ECS module mapping */
  wizardConfig?: Record<string, string> | null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SILHOUETTE_WIDTH = Math.min(SCREEN_WIDTH - 32, 400);
// 1:1 aspect ratio to match the 1024×1024 viewBox — prevents skew/stretch.
// preserveAspectRatio="xMidYMid meet" on the SVG ensures uniform scaling.
const SILHOUETTE_HEIGHT = SILHOUETTE_WIDTH;


// ── Map wizard selections to ECS vector types ───────────
function mapToEcsBase(sel: Record<string, string>): VehicleBaseType {
  switch (sel.vehicle_type) {
    case 'truck': return 'fullsize_truck';
    case 'suv_van': return 'overland_van';
    case 'jeep': return 'suv_boxy';
    case 'car_crossover': return 'suv_boxy';
    default: return 'fullsize_truck';
  }
}


function mapToBedModule(sel: Record<string, string>): BedModuleType {
  if (sel.vehicle_type !== 'truck') return 'bed_open';
  switch (sel.truck_bed) {
    case 'rack': return 'bed_rack';
    case 'rsi_smart_cap':
    case 'alu_cab':
    case 'other_topper': return 'bed_shell';
    case 'cover':
    case 'open_bed':
    default: return 'bed_open';
  }
}

function mapToRoofModule(sel: Record<string, string>): RoofModuleType {
  const vt = sel.vehicle_type;
  if (vt === 'truck') {
    if (sel.truck_cab_rack === 'yes') {
      const setup = sel.truck_cab_rack_setup;
      if (setup === 'rtt' || setup === 'both') return 'roof_tent';
      return 'roof_rack';
    }
    if (sel.truck_bed === 'rack') {
      const setup = sel.truck_bed_rack_setup;
      if (setup === 'rtt' || setup === 'both') return 'roof_tent';
    }
    return 'roof_none';
  }
  if (vt === 'suv_van') {
    if (sel.suv_roof_rack === 'yes') {
      const setup = sel.suv_roof_rack_setup;
      if (setup === 'rtt' || setup === 'both') return 'roof_tent';
      return 'roof_rack';
    }
    return 'roof_none';
  }
  if (vt === 'car_crossover') {
    if (sel.car_roof_rack === 'yes') {
      const setup = sel.car_roof_rack_setup;
      if (setup === 'rtt' || setup === 'both') return 'roof_tent';
      return 'roof_rack';
    }
    return 'roof_none';
  }
  if (vt === 'jeep') {
    if (sel.jeep_rack === 'yes') {
      const setup = sel.jeep_rack_setup;
      if (setup === 'rtt' || setup === 'both') return 'roof_tent';
      return 'roof_rack';
    }
    const top = sel.jeep_top;
    if (top === 'hard_top') {
      const setup = sel.jeep_hardtop_setup;
      if (setup === 'rtt' || setup === 'both') return 'roof_tent';
    }
    return 'roof_none';
  }
  return 'roof_none';
}

function mapToHitchModule(sel: Record<string, string>): HitchModuleType {
  const hitchKey = sel.truck_hitch || sel.suv_hitch || sel.car_hitch || sel.jeep_hitch;
  if (!hitchKey || hitchKey === 'none') return 'hitch_none';
  if (hitchKey === 'tire_carrier') return 'hitch_tire';
  if (hitchKey === 'hitch_box') return 'hitch_box';
  return 'hitch_box';
}

// ── Fallback base type from vehicleType string ──────────
function fallbackBase(vehicleType: string): VehicleBaseType {
  switch (vehicleType) {
    case 'truck': return 'fullsize_truck';
    case 'suv_van': return 'suv_boxy';
    case 'jeep': return 'suv_boxy';
    case 'car_crossover': return 'suv_boxy';
    default: return 'fullsize_truck';
  }
}

export default function VehicleSilhouette({ vehicleType, zones, onZonePress, wizardConfig }: Props) {
  const [containerSize, setContainerSize] = useState({ w: SILHOUETTE_WIDTH, h: SILHOUETTE_HEIGHT });
  const [activeZone, setActiveZone] = useState<string | null>(null);

  // ── Derive ECS config ─────────────────────────────────
  const ecsConfig = useMemo(() => {
    if (wizardConfig && Object.keys(wizardConfig).length > 0) {
      return {
        base: mapToEcsBase(wizardConfig),
        bed: mapToBedModule(wizardConfig),
        roof: mapToRoofModule(wizardConfig),
        hitch: mapToHitchModule(wizardConfig),
      };
    }
    return {
      base: fallbackBase(vehicleType),
      bed: 'bed_open' as BedModuleType,
      roof: 'roof_none' as RoofModuleType,
      hitch: 'hitch_none' as HitchModuleType,
    };
  }, [wizardConfig, vehicleType]);

  // ── Get vehicle anchors for zone mapping ──────────────
  const vehicleDef = useMemo(() => getVehicleBase(ecsConfig.base), [ecsConfig.base]);
  const anchors = vehicleDef?.anchors ?? null;

  // ── Compute zone overlay rects ────────────────────────
  const zoneOverlays = useMemo(() => {
    if (!anchors) return [];

    return zones.map((zone) => {
      const rect = getZoneRect(zone.id, anchors);
      if (!rect) return null;

      const screenRect = viewBoxToScreen(
        rect,
        containerSize.w,
        containerSize.h,
        1024,
      );

      // Skip if too small to be useful
      if (screenRect.width < 12 || screenRect.height < 12) return null;

      const accentColor = getZoneAccentSolid(zone.id, zone.zone_type);
      const allPacked = zone.packed_count === zone.items_count && zone.items_count > 0;
      const fillPct = zone.slot_count > 0 ? (zone.items_count / zone.slot_count) : 0;

      return {
        zone,
        screenRect,
        accentColor,
        allPacked,
        fillPct,
      };
    }).filter(Boolean) as {
      zone: SilhouetteZone;
      screenRect: { left: number; top: number; width: number; height: number };
      accentColor: string;
      allPacked: boolean;
      fillPct: number;
    }[];
  }, [zones, anchors, containerSize]);

  // ── Totals ────────────────────────────────────────────
  const totalSlots = zones.reduce((s, z) => s + z.slot_count, 0);
  const totalItems = zones.reduce((s, z) => s + z.items_count, 0);
  const totalPacked = zones.reduce((s, z) => s + z.packed_count, 0);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setContainerSize({ w: width, h: height });
    }
  };

  const handleZoneTouch = (zoneId: string) => {
    setActiveZone(zoneId);
    onZonePress(zoneId);
    // Clear active highlight after a short delay
    setTimeout(() => setActiveZone(null), 600);
  };

  return (
    <View style={styles.wrapper}>
      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{zones.length}</Text>
          <Text style={styles.statLabel}>ZONES</Text>
        </View>
        <View style={styles.statDot} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalSlots}</Text>
          <Text style={styles.statLabel}>SLOTS</Text>
        </View>
        <View style={styles.statDot} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalItems}</Text>
          <Text style={styles.statLabel}>ITEMS</Text>
        </View>
        <View style={styles.statDot} />
        <View style={styles.statItem}>
          <Text style={[
            styles.statValue,
            { color: totalPacked === totalItems && totalItems > 0 ? '#66BB6A' : TACTICAL.textMuted },
          ]}>
            {totalPacked}
          </Text>
          <Text style={styles.statLabel}>PACKED</Text>
        </View>
      </View>

      {/* Silhouette container with zone overlays */}
      <View
        style={[styles.silhouetteContainer, { width: SILHOUETTE_WIDTH, height: SILHOUETTE_HEIGHT }]}
        onLayout={handleLayout}
      >
        {/* ECS Vehicle Silhouette (base layer) */}
        <View style={styles.svgLayer} pointerEvents="none">
          <VehicleCompositor
            base={ecsConfig.base}
            bed={ecsConfig.bed}
            roof={ecsConfig.roof}
            hitch={ecsConfig.hitch}
            width={containerSize.w}
            height={containerSize.h}
            fill="#D4AF37"
            cutoutFill={TACTICAL.bg}
            opacity={0.35}
          />
        </View>

        {/* Zone overlay layer */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {zoneOverlays.map(({ zone, screenRect, accentColor, allPacked, fillPct }) => {
            const isActive = activeZone === zone.id;
            const bgAlpha = isActive ? 0.45 : 0.22;
            const borderAlpha = isActive ? 0.9 : 0.55;
            const showLabel = screenRect.width > 40 && screenRect.height > 24;

            return (
              <TouchableOpacity
                key={zone.id}
                style={[
                  styles.zoneOverlay,
                  {
                    left: screenRect.left,
                    top: screenRect.top,
                    width: screenRect.width,
                    height: screenRect.height,
                    backgroundColor: hexToRgba(accentColor, bgAlpha),
                    borderColor: hexToRgba(accentColor, borderAlpha),
                    borderWidth: isActive ? 2 : 1,
                  },
                ]}
                activeOpacity={0.6}
                onPress={() => handleZoneTouch(zone.id)}
              >
                {showLabel && (
                  <View style={styles.zoneLabelWrap}>
                    <Text
                      style={[styles.zoneLabel, { color: accentColor }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      {zone.name}
                    </Text>
                    {zone.items_count > 0 && (
                      <View style={styles.zoneCountRow}>
                        <View style={[
                          styles.zoneCountDot,
                          { backgroundColor: allPacked ? '#66BB6A' : accentColor },
                        ]} />
                        <Text style={[
                          styles.zoneCountText,
                          allPacked && { color: '#66BB6A' },
                        ]}>
                          {zone.items_count}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Fill indicator bar at bottom */}
                {screenRect.height > 18 && (
                  <View style={styles.zoneFillBar}>
                    <View
                      style={[
                        styles.zoneFillBarInner,
                        {
                          width: `${Math.min(100, fillPct * 100)}%`,
                          backgroundColor: allPacked ? '#66BB6A' : accentColor,
                        },
                      ]}
                    />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Direction indicators */}
        <View style={[styles.directionIndicator, styles.directionFront]}>
          <Ionicons name="caret-back" size={8} color="rgba(212,175,55,0.3)" />
          <Text style={styles.directionText}>FRONT</Text>
        </View>
        <View style={[styles.directionIndicator, styles.directionRear]}>
          <Text style={styles.directionText}>REAR</Text>
          <Ionicons name="caret-forward" size={8} color="rgba(212,175,55,0.3)" />
        </View>
      </View>

      {/* Tap hint */}
      <Text style={styles.tapHint}>Tap a zone to view items</Text>

      {/* Zone legend */}
      <View style={styles.legendContainer}>
        {zones.map((zone) => {
          const accentColor = getZoneAccentSolid(zone.id, zone.zone_type);
          const allPacked = zone.packed_count === zone.items_count && zone.items_count > 0;
          const fillPct = zone.slot_count > 0 ? Math.round((zone.items_count / zone.slot_count) * 100) : 0;

          return (
            <TouchableOpacity
              key={zone.id}
              style={styles.legendItem}
              onPress={() => handleZoneTouch(zone.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.legendDot, { backgroundColor: accentColor }]} />
              <View style={styles.legendInfo}>
                <Text style={styles.legendName} numberOfLines={1}>{zone.name}</Text>
                <View style={styles.legendMeta}>
                  <Text style={styles.legendSlots}>{zone.slot_count} slots</Text>
                  {zone.items_count > 0 && (
                    <Text style={[
                      styles.legendItems,
                      allPacked && { color: '#66BB6A' },
                    ]}>
                      {zone.items_count} item{zone.items_count !== 1 ? 's' : ''}
                      {allPacked ? ' (packed)' : ''}
                    </Text>
                  )}
                </View>
              </View>
              <Text style={[styles.legendPct, { color: accentColor }]}>{fillPct}%</Text>
              <Ionicons name="chevron-forward" size={12} color="rgba(138,138,138,0.25)" />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Hex to RGBA helper ──────────────────────────────────
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return `rgba(138, 138, 133, ${alpha})`;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Styles ──────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    paddingVertical: 4,
    width: '100%',
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  statLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginTop: 1,
  },
  statDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(138,138,138,0.3)',
  },

  // Silhouette container
  silhouetteContainer: {
    position: 'relative',
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  svgLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Zone overlays
  zoneOverlay: {
    position: 'absolute',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  zoneLabelWrap: {
    alignItems: 'center',
    paddingHorizontal: 3,
    gap: 1,
  },
  zoneLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  zoneCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  zoneCountDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  zoneCountText: {
    fontSize: 8,
    fontWeight: '700',
    color: 'rgba(230,230,225,0.7)',
  },
  zoneFillBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  zoneFillBarInner: {
    height: '100%',
  },

  // Direction indicators
  directionIndicator: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  directionFront: {
    left: 4,
    top: 4,
  },
  directionRear: {
    right: 4,
    top: 4,
  },
  directionText: {
    fontSize: 7,
    fontWeight: '800',
    color: 'rgba(212,175,55,0.3)',
    letterSpacing: 1,
  },

  // Tap hint
  tapHint: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(138,138,138,0.45)',
    marginTop: 6,
    marginBottom: 8,
    letterSpacing: 0.5,
  },

  // Zone legend
  legendContainer: {
    width: '100%',
    gap: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.1)',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendInfo: {
    flex: 1,
    gap: 2,
  },
  legendName: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  legendMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendSlots: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },
  legendItems: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.amber,
  },
  legendPct: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Courier',
    minWidth: 32,
    textAlign: 'right',
  },
});




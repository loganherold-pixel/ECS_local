/**
 * ECS Vehicle Compositor
 * ─────────────────────────────────────────────────────────
 * Composes a complete vehicle silhouette by stacking:
 *   1. Base vehicle
 *   2. Bed module (truck only)
 *   3. Roof module
 *   4. Hitch module
 *
 * All modules render at absolute coordinates — no scaling
 * or repositioning needed. The compositor simply collects
 * all SVG shapes and passes them to the SvgRenderer.
 *
 * ASPECT RATIO FIX:
 *   The wrapper enforces a 1:1 aspect ratio container.
 *   The SVG uses preserveAspectRatio="xMidYMid meet" to
 *   prevent any stretching or skewing. The SVG fills ~80%
 *   of the container width, maintaining perfect proportions.
 *
 * Usage:
 *   <VehicleCompositor
 *     base="fullsize_truck"
 *     bed="bed_rack"
 *     roof="roof_tent"
 *     hitch="hitch_tire"
 *     width={320}
 *   />
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import SvgRenderer from './SvgRenderer';
import { FILL_PRIMARY, VIEWBOX } from './spec';
import type { SvgShape, VehicleBaseType, BedModuleType, RoofModuleType, HitchModuleType } from './spec';
import { getVehicleBase } from './bases';
import { getBedModulePaths, getRoofModulePaths, getHitchModulePaths } from './modules';

// ── Props ───────────────────────────────────────────────
interface VehicleCompositorProps {
  /** Base vehicle type */
  base: VehicleBaseType | string;
  /** Bed module (truck only) */
  bed?: BedModuleType | string;
  /** Roof module */
  roof?: RoofModuleType | string;
  /** Hitch module */
  hitch?: HitchModuleType | string;
  /** Rendered width — container will be this wide */
  width: number;
  /**
   * Rendered height — DEPRECATED for aspect-ratio mode.
   * When provided, the container uses this height instead of
   * enforcing 1:1 aspect ratio. The SVG still uses
   * preserveAspectRatio="xMidYMid meet" so content won't distort.
   */
  height?: number;
  /** Fill color override */
  fill?: string;
  /** Cutout/background color */
  cutoutFill?: string;
  /** Opacity */
  opacity?: number;
  /** Show vehicle name label */
  showLabel?: boolean;
  /** Label color */
  labelColor?: string;
}

export default function VehicleCompositor({
  base,
  bed,
  roof,
  hitch,
  width,
  height,
  fill = FILL_PRIMARY,
  cutoutFill = 'transparent',
  opacity = 1,
  showLabel = false,
  labelColor = '#8A8A85',
}: VehicleCompositorProps) {
  const vehicle = getVehicleBase(base);

  const composed = useMemo(() => {
    if (!vehicle) return null;

    const bodyShapes: SvgShape[] = [vehicle.body];
    const windowShapes: SvgShape[] = [...vehicle.windows];
    const moduleShapes: SvgShape[] = [];
    const wheels = vehicle.wheels;

    // Bed module
    if (bed && bed !== 'bed_open') {
      const bedMod = getBedModulePaths(vehicle.anchors, bed);
      if (bedMod && !bedMod.isEmpty) {
        moduleShapes.push(...bedMod.shapes);
      }
    }

    // Roof module
    if (roof && roof !== 'roof_none') {
      const roofMod = getRoofModulePaths(vehicle.anchors, roof);
      if (roofMod && !roofMod.isEmpty) {
        moduleShapes.push(...roofMod.shapes);
      }
    }

    // Hitch module
    if (hitch && hitch !== 'hitch_none') {
      const hitchMod = getHitchModulePaths(vehicle.anchors, hitch);
      if (hitchMod && !hitchMod.isEmpty) {
        moduleShapes.push(...hitchMod.shapes);
      }
    }

    return { bodyShapes, windowShapes, moduleShapes, wheels };
  }, [vehicle, bed, roof, hitch]);

  if (!vehicle || !composed) {
    return (
      <View style={[styles.fallback, { width, height: height ?? width }]}>
        <Text style={styles.fallbackText}>Unknown vehicle: {base}</Text>
      </View>
    );
  }

  // Compute container dimensions:
  // If height is explicitly provided, use it (for backward compat).
  // The SVG will still use preserveAspectRatio="xMidYMid meet"
  // to prevent distortion within whatever container size is given.
  const containerH = height ?? width;

  // SVG dimensions: fill the container. preserveAspectRatio
  // handles uniform scaling within these bounds.
  const svgW = width;
  const svgH = containerH;

  return (
    <View style={[styles.wrapper, { width, height: containerH }]}>
      <SvgRenderer
        width={svgW}
        height={svgH}
        fill={fill}
        cutoutFill={cutoutFill}
        bodyShapes={composed.bodyShapes}
        windowShapes={composed.windowShapes}
        wheels={composed.wheels}
        moduleShapes={composed.moduleShapes}
        opacity={opacity}
        viewBox={VIEWBOX}
      />
      {showLabel && (
        <Text style={[styles.label, { color: labelColor }]}>
          {vehicle.name}
          {bed && bed !== 'bed_open' ? ` + ${formatModuleName(bed)}` : ''}
          {roof && roof !== 'roof_none' ? ` + ${formatModuleName(roof)}` : ''}
          {hitch && hitch !== 'hitch_none' ? ` + ${formatModuleName(hitch)}` : ''}
        </Text>
      )}
    </View>
  );
}

// ── Module name formatter ───────────────────────────────
function formatModuleName(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Styles ──────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(138,138,138,0.2)',
    borderRadius: 8,
  },
  fallbackText: {
    fontSize: 11,
    color: '#8A8A85',
    letterSpacing: 0.5,
  },
  label: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});




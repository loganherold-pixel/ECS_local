/**
 * WeightOverlay — Weight distribution visualization
 *
 * Renders weight bars above mounting regions, CG marker below chassis,
 * and axle load percentage indicators.
 *
 * UPDATED: Aligned with rebuilt silhouette proportions.
 * No pulsing. No flashing. Engineering diagram recalculation feel.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getIntensityColor, getAxleLoadColor } from '../../lib/weightEngine';
import type { CGResult, WeightModule } from '../../lib/weightEngine';

interface Props {
  width: number;
  height: number;
  cgResult: CGResult;
}

// Silhouette geometry constants (must match VehicleSilhouette)
const GROUND_Y = 0.86;
const UNDERCARRIAGE_Y = 0.73;
const FRONT_AXLE_X = 0.19;
const REAR_AXLE_X = 0.79;
const WHEEL_CENTER_Y = 0.76;

const MAX_BAR_HEIGHT_PCT = 0.28;

export default function WeightOverlay({ width, height, cgResult }: Props) {
  const sx = (pct: number) => pct * width;
  const sy = (pct: number) => pct * height;

  if (cgResult.totalMass === 0) return null;

  const maxMass = Math.max(...cgResult.modules.map(m => m.mass), 1);
  const axleY = sy(GROUND_Y);

  return (
    <View style={[styles.container, { width, height }]} pointerEvents="none">
      {/* ── Weight Bars ──────────────────────────────────── */}
      {cgResult.modules.map((mod, idx) => {
        if (mod.mass <= 0) return null;
        const barHeight = (mod.mass / maxMass) * sy(MAX_BAR_HEIGHT_PCT);
        const barWidth = Math.max(sx(0.02), sx(0.035));
        const barLeft = sx(mod.x) - barWidth / 2;
        // Position bar above the module's z position
        const baseY = sy(UNDERCARRIAGE_Y);
        const barTop = baseY - barHeight - sy(mod.z * 0.35);

        return (
          <View
            key={`${mod.id}-${idx}`}
            style={[
              styles.weightBar,
              {
                left: Math.max(0, barLeft),
                top: Math.max(0, barTop),
                width: barWidth,
                height: barHeight,
                backgroundColor: getIntensityColor(mod.intensity),
              },
            ]}
          />
        );
      })}

      {/* ── CG Marker ────────────────────────────────────── */}
      <View
        style={[
          styles.cgMarker,
          {
            left: sx(cgResult.xCG) - 5,
            top: axleY + 2 + (cgResult.zCG * sy(0.04)),
          },
        ]}
      />
      {/* CG vertical reference line */}
      <View
        style={[
          styles.cgLine,
          {
            left: sx(cgResult.xCG),
            top: sy(UNDERCARRIAGE_Y) - sy(0.03),
            height: sy(0.06),
          },
        ]}
      />

      {/* ── Axle Load Indicators ─────────────────────────── */}
      {/* Front axle */}
      <View style={[styles.axleLabel, { left: sx(FRONT_AXLE_X) - 20, top: axleY + 8 }]}>
        <Text style={styles.axleLabelTitle}>FRONT</Text>
        <Text style={[styles.axlePercent, { color: getAxleLoadColor(cgResult.frontAxlePercent) }]}>
          {cgResult.frontAxlePercent}%
        </Text>
      </View>

      {/* Rear axle */}
      <View style={[styles.axleLabel, { left: sx(REAR_AXLE_X) - 20, top: axleY + 8 }]}>
        <Text style={styles.axleLabelTitle}>REAR</Text>
        <Text style={[styles.axlePercent, { color: getAxleLoadColor(cgResult.rearAxlePercent) }]}>
          {cgResult.rearAxlePercent}%
        </Text>
      </View>

      {/* ── CG Label ─────────────────────────────────────── */}
      <View style={[styles.cgLabel, { left: sx(cgResult.xCG) - 10, top: axleY + 12 }]}>
        <Text style={styles.cgLabelText}>CG</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  weightBar: {
    position: 'absolute',
    borderRadius: 1,
    opacity: 0.85,
  },
  cgMarker: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(212, 175, 55, 0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.5)',
  },
  cgLine: {
    position: 'absolute',
    width: 0,
    borderLeftWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.4)',
    borderStyle: 'dashed',
  },
  axleLabel: {
    position: 'absolute',
    alignItems: 'center',
    width: 40,
  },
  axleLabelTitle: {
    fontSize: 6,
    fontWeight: '800',
    color: 'rgba(138, 138, 138, 0.6)',
    letterSpacing: 1,
  },
  axlePercent: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  cgLabel: {
    position: 'absolute',
    alignItems: 'center',
    width: 20,
  },
  cgLabelText: {
    fontSize: 7,
    fontWeight: '900',
    color: 'rgba(212, 175, 55, 0.7)',
    letterSpacing: 1,
  },
});




/**
 * StabilityBand — Load balance indicator
 *
 * Thin band below silhouette showing CG position relative to axles.
 * Gold = balanced, Orange = moderate rear bias, Red = extreme rear bias.
 * No animation loops.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { CGResult } from '../../lib/weightEngine';

interface Props {
  width: number;
  cgResult: CGResult;
}

const BAND_HEIGHT = 6;
const FRONT_AXLE_X = 0.19;
const REAR_AXLE_X = 0.79;


export default function StabilityBand({ width, cgResult }: Props) {
  if (cgResult.totalMass === 0) return null;

  // Map CG position to band position
  const bandWidth = width - 32; // padding
  const cgNormalized = Math.max(0, Math.min(1,
    (cgResult.xCG - FRONT_AXLE_X) / (REAR_AXLE_X - FRONT_AXLE_X)
  ));
  const indicatorLeft = cgNormalized * bandWidth;

  // Color based on stability
  let bandColor = '#D4AF37'; // gold = balanced
  let indicatorColor = '#D4AF37';
  if (cgResult.stability === 'extreme_rear') {
    bandColor = '#C0392B';
    indicatorColor = '#C0392B';
  } else if (cgResult.stability === 'moderate_rear') {
    bandColor = '#FF9500';
    indicatorColor = '#FF9500';
  }

  // Gradient simulation: band color shifts toward rear
  const rearBias = cgResult.rearAxlePercent / 100;

  return (
    <View style={[styles.container, { width }]}>
      <Text style={styles.label}>LOAD BALANCE</Text>
      <View style={styles.bandRow}>
        <Text style={styles.axleMarker}>F</Text>
        <View style={[styles.band, { width: bandWidth }]}>
          {/* Band background */}
          <View style={styles.bandBg} />

          {/* Colored fill showing bias direction */}
          <View
            style={[
              styles.bandFill,
              {
                width: indicatorLeft + 4,
                backgroundColor: bandColor,
                opacity: 0.25,
              },
            ]}
          />

          {/* CG position indicator */}
          <View
            style={[
              styles.indicator,
              {
                left: Math.max(0, Math.min(bandWidth - 8, indicatorLeft - 4)),
                backgroundColor: indicatorColor,
              },
            ]}
          />

          {/* Center mark */}
          <View
            style={[
              styles.centerMark,
              { left: bandWidth / 2 - 0.5 },
            ]}
          />
        </View>
        <Text style={styles.axleMarker}>R</Text>
      </View>

      {/* Total weight */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL LOAD</Text>
        <Text style={[styles.totalValue, { color: indicatorColor }]}>
          {cgResult.totalMass.toLocaleString()} LBS
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  label: {
    fontSize: 7,
    fontWeight: '900',
    color: 'rgba(138, 138, 138, 0.5)',
    letterSpacing: 1.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  axleMarker: {
    fontSize: 7,
    fontWeight: '900',
    color: 'rgba(138, 138, 138, 0.4)',
    letterSpacing: 0.5,
    width: 10,
    textAlign: 'center',
  },
  band: {
    height: BAND_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
  },
  bandBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(138, 138, 138, 0.10)',
  },
  bandFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    width: 8,
    height: BAND_HEIGHT,
  },
  centerMark: {
    position: 'absolute',
    top: 0,
    width: 1,
    height: BAND_HEIGHT,
    backgroundColor: 'rgba(138, 138, 138, 0.25)',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 16,
  },
  totalLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: 'rgba(138, 138, 138, 0.4)',
    letterSpacing: 1.2,
  },
  totalValue: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
});




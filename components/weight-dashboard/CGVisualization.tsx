/**
 * CG Visualization — Center-of-Gravity on Vehicle Outline
 *
 * Renders a top-down vehicle silhouette with:
 *   - CG dot position (gold/amber)
 *   - Front/rear axle lines
 *   - Zone regions with weight-proportional fills
 *   - Axle load percentages
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TACTICAL } from '../../lib/theme';
import type { CGResult } from '../../lib/weightEngine';
import type { StabilityResult } from '../../lib/stabilityEngine';

interface Props {
  cgResult: CGResult;
  stability: StabilityResult;
  frontAxlePercent: number;
  rearAxlePercent: number;
  totalWeight: number;
}

const VEHICLE_WIDTH = 280;
const VEHICLE_HEIGHT = 120;
const FRONT_AXLE_X = 0.22;
const REAR_AXLE_X = 0.72;

export default function CGVisualization({
  cgResult,
  stability,
  frontAxlePercent,
  rearAxlePercent,
  totalWeight,
}: Props) {
  // CG position mapped to vehicle outline
  const cgDotX = cgResult.xCG * VEHICLE_WIDTH;
  const cgDotY = VEHICLE_HEIGHT / 2; // centered laterally
  const cgDotZ = cgResult.zCG; // vertical CG for display

  // Axle positions
  const frontAxleX = FRONT_AXLE_X * VEHICLE_WIDTH;
  const rearAxleX = REAR_AXLE_X * VEHICLE_WIDTH;

  // Stability color
  const stabilityColor = cgResult.stability === 'balanced'
    ? '#66BB6A'
    : cgResult.stability === 'moderate_rear'
      ? '#FF9800'
      : '#EF5350';

  const cgColor = stability.stabilityColor || TACTICAL.amber;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>CENTER OF GRAVITY</Text>
        <View style={[styles.stabilityBadge, { borderColor: stabilityColor + '60', backgroundColor: stabilityColor + '15' }]}>
          <View style={[styles.stabilityDot, { backgroundColor: stabilityColor }]} />
          <Text style={[styles.stabilityText, { color: stabilityColor }]}>
            {cgResult.stability === 'balanced' ? 'BALANCED' : cgResult.stability === 'moderate_rear' ? 'REAR BIAS' : 'EXTREME REAR'}
          </Text>
        </View>
      </View>

      {/* Vehicle Outline */}
      <View style={styles.vehicleContainer}>
        {/* Vehicle body outline */}
        <View style={styles.vehicleBody}>
          {/* Front section (cab) */}
          <View style={styles.cabSection}>
            <Text style={styles.sectionLabel}>CAB</Text>
          </View>

          {/* Mid section */}
          <View style={styles.midSection}>
            <Text style={styles.sectionLabel}>MID</Text>
          </View>

          {/* Rear section (bed) */}
          <View style={styles.rearSection}>
            <Text style={styles.sectionLabel}>REAR</Text>
          </View>

          {/* Front axle line */}
          <View style={[styles.axleLine, { left: `${FRONT_AXLE_X * 100}%` }]}>
            <View style={styles.axleWheel} />
            <View style={styles.axleDash} />
            <View style={styles.axleWheel} />
          </View>

          {/* Rear axle line */}
          <View style={[styles.axleLine, { left: `${REAR_AXLE_X * 100}%` }]}>
            <View style={styles.axleWheel} />
            <View style={styles.axleDash} />
            <View style={styles.axleWheel} />
          </View>

          {/* CG Dot */}
          <View
            style={[
              styles.cgDot,
              {
                left: `${cgResult.xCG * 100}%`,
                top: '50%',
                backgroundColor: cgColor,
                shadowColor: cgColor,
              },
            ]}
          >
            <View style={[styles.cgDotInner, { backgroundColor: cgColor }]} />
          </View>

          {/* CG Crosshair lines */}
          <View style={[styles.cgLineH, { top: '50%', left: `${(cgResult.xCG * 100) - 8}%`, width: '16%' }]} />
          <View style={[styles.cgLineV, { left: `${cgResult.xCG * 100}%`, top: '20%', height: '60%' }]} />
        </View>

        {/* Direction arrow */}
        <View style={styles.directionArrow}>
          <View style={styles.arrowLine} />
          <View style={styles.arrowHead} />
          <Text style={styles.arrowLabel}>FWD</Text>
        </View>
      </View>

      {/* Axle Load Bars */}
      <View style={styles.axleRow}>
        {/* Front Axle */}
        <View style={styles.axleCard}>
          <Text style={styles.axleLabel}>FRONT AXLE</Text>
          <View style={styles.axleBarContainer}>
            <View style={styles.axleBarTrack}>
              <View
                style={[
                  styles.axleBarFill,
                  {
                    width: `${Math.min(100, frontAxlePercent)}%`,
                    backgroundColor: frontAxlePercent > 65 ? '#FF9800' : '#66BB6A',
                  },
                ]}
              />
            </View>
            <Text style={[styles.axlePercent, { color: frontAxlePercent > 65 ? '#FF9800' : '#66BB6A' }]}>
              {frontAxlePercent}%
            </Text>
          </View>
          <Text style={styles.axleWeight}>
            {Math.round(totalWeight * frontAxlePercent / 100)} lbs
          </Text>
        </View>

        {/* Rear Axle */}
        <View style={styles.axleCard}>
          <Text style={styles.axleLabel}>REAR AXLE</Text>
          <View style={styles.axleBarContainer}>
            <View style={styles.axleBarTrack}>
              <View
                style={[
                  styles.axleBarFill,
                  {
                    width: `${Math.min(100, rearAxlePercent)}%`,
                    backgroundColor: rearAxlePercent > 65 ? '#FF9800' : rearAxlePercent > 75 ? '#EF5350' : '#66BB6A',
                  },
                ]}
              />
            </View>
            <Text style={[styles.axlePercent, { color: rearAxlePercent > 75 ? '#EF5350' : rearAxlePercent > 65 ? '#FF9800' : '#66BB6A' }]}>
              {rearAxlePercent}%
            </Text>
          </View>
          <Text style={styles.axleWeight}>
            {Math.round(totalWeight * rearAxlePercent / 100)} lbs
          </Text>
        </View>
      </View>

      {/* CG Coordinates */}
      <View style={styles.cgCoords}>
        <View style={styles.cgCoordItem}>
          <Text style={styles.cgCoordLabel}>CG-X</Text>
          <Text style={styles.cgCoordValue}>{(cgResult.xCG * 100).toFixed(1)}%</Text>
        </View>
        <View style={styles.cgCoordDivider} />
        <View style={styles.cgCoordItem}>
          <Text style={styles.cgCoordLabel}>CG-Z</Text>
          <Text style={styles.cgCoordValue}>{(cgResult.zCG * 100).toFixed(1)}%</Text>
        </View>
        <View style={styles.cgCoordDivider} />
        <View style={styles.cgCoordItem}>
          <Text style={styles.cgCoordLabel}>CG HEIGHT</Text>
          <Text style={styles.cgCoordValue}>{stability.cg.zCg.toFixed(1)}"</Text>
        </View>
        <View style={styles.cgCoordDivider} />
        <View style={styles.cgCoordItem}>
          <Text style={styles.cgCoordLabel}>LAT OFFSET</Text>
          <Text style={styles.cgCoordValue}>{stability.cg.yCg.toFixed(1)}"</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.2)',
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  stabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  stabilityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stabilityText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Vehicle outline
  vehicleContainer: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  vehicleBody: {
    width: '100%',
    height: 100,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(196, 138, 44, 0.3)',
    backgroundColor: 'rgba(196, 138, 44, 0.04)',
    flexDirection: 'row',
    position: 'relative',
    overflow: 'visible',
  },
  cabSection: {
    width: '35%',
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: 'rgba(196, 138, 44, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  midSection: {
    width: '25%',
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: 'rgba(196, 138, 44, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rearSection: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: 'rgba(196, 138, 44, 0.35)',
    letterSpacing: 2,
  },

  // Axle lines
  axleLine: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    width: 2,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  axleWheel: {
    width: 10,
    height: 6,
    borderRadius: 2,
    backgroundColor: 'rgba(138, 138, 133, 0.5)',
  },
  axleDash: {
    flex: 1,
    width: 1,
    backgroundColor: 'rgba(138, 138, 133, 0.25)',
  },

  // CG Dot
  cgDot: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
    marginTop: -8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
    opacity: 0.85,
  },
  cgDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cgLineH: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(196, 138, 44, 0.25)',
  },
  cgLineV: {
    position: 'absolute',
    width: 1,
    backgroundColor: 'rgba(196, 138, 44, 0.25)',
  },

  // Direction arrow
  directionArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  arrowLine: {
    width: 20,
    height: 1,
    backgroundColor: TACTICAL.textMuted,
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderLeftColor: TACTICAL.textMuted,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  arrowLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginLeft: 2,
  },

  // Axle loads
  axleRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  axleCard: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
  },
  axleLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  axleBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  axleBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
    overflow: 'hidden',
  },
  axleBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  axlePercent: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'Courier',
    minWidth: 36,
    textAlign: 'right',
  },
  axleWeight: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    marginTop: 4,
    fontFamily: 'Courier',
  },

  // CG Coordinates
  cgCoords: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.15)',
  },
  cgCoordItem: {
    flex: 1,
    alignItems: 'center',
  },
  cgCoordLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  cgCoordValue: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  cgCoordDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
  },
});




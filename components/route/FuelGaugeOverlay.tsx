/**
 * FuelGaugeOverlay — Visual fuel gauge for route map
 *
 * Renders a horizontal fuel gauge showing fuel level
 * at each point along the route. Color-coded zones
 * indicate fuel status (green → amber → red).
 * Fuel stop markers are shown where recommended.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import {
  type FuelRangeResult,
  generateFuelGaugePoints,
  getFuelColor,
} from '../../lib/fuelRangeEngine';

interface Props {
  result: FuelRangeResult;
  compact?: boolean;
}

export default function FuelGaugeOverlay({ result, compact = false }: Props) {
  const gaugePoints = useMemo(() => generateFuelGaugePoints(result), [result]);

  if (gaugePoints.length < 2) return null;

  const startFuel = gaugePoints[0].fuelPct;
  const endFuel = gaugePoints[gaugePoints.length - 1].fuelPct;
  const endColor = getFuelColor(endFuel);

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="speedometer-outline" size={12} color={TACTICAL.amber} />
          <Text style={styles.headerLabel}>FUEL GAUGE</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.headerValue, { color: getFuelColor(startFuel) }]}>
            {startFuel}%
          </Text>
          <Ionicons name="arrow-forward" size={10} color={TACTICAL.textMuted} />
          <Text style={[styles.headerValue, { color: endColor }]}>
            {endFuel}%
          </Text>
        </View>
      </View>

      {/* Gauge Bar */}
      <View style={styles.gaugeTrack}>
        {gaugePoints.map((point, i) => {
          if (i === 0) return null;
          const prev = gaugePoints[i - 1];
          const widthPct = point.distancePct - prev.distancePct;
          if (widthPct <= 0) return null;

          const avgFuel = (prev.fuelPct + point.fuelPct) / 2;
          const color = getFuelColor(avgFuel);

          return (
            <View
              key={i}
              style={[
                styles.gaugeSegment,
                {
                  width: `${widthPct}%`,
                  backgroundColor: color,
                  opacity: avgFuel <= 0 ? 0.3 : 0.85,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Distance markers */}
      {!compact && (
        <View style={styles.distanceMarkers}>
          <Text style={styles.distanceText}>0 mi</Text>
          <Text style={styles.distanceText}>
            {Math.round(result.totalDistanceMiles / 2)} mi
          </Text>
          <Text style={styles.distanceText}>
            {Math.round(result.totalDistanceMiles)} mi
          </Text>
        </View>
      )}

      {/* Fuel stop markers */}
      {result.fuelStops.length > 0 && (
        <View style={styles.fuelStopRow}>
          {result.fuelStops.map((stop, i) => {
            const leftPct = result.totalDistanceMiles > 0
              ? (stop.atDistanceMiles / result.totalDistanceMiles) * 100
              : 0;
            const stopColor = stop.urgency === 'critical' ? '#EF5350'
              : stop.urgency === 'recommended' ? '#FF9800'
              : TACTICAL.amber;

            return (
              <View
                key={i}
                style={[styles.fuelStopMarker, { left: `${Math.min(leftPct, 95)}%` }]}
              >
                <View style={[styles.fuelStopDot, { backgroundColor: stopColor }]} />
                {!compact && (
                  <Text style={[styles.fuelStopLabel, { color: stopColor }]}>
                    {stop.fuelPercent}%
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Effective MPG badge */}
      {!compact && (
        <View style={styles.mpgRow}>
          <View style={styles.mpgBadge}>
            <Text style={styles.mpgLabel}>EFF. MPG</Text>
            <Text style={styles.mpgValue}>{result.effectiveMpg}</Text>
          </View>
          {result.terrainPenaltyPercent > 0 && (
            <View style={styles.terrainBadge}>
              <Ionicons name="trending-up" size={10} color="#FF9800" />
              <Text style={styles.terrainText}>
                +{result.terrainPenaltyPercent}% TERRAIN
              </Text>
            </View>
          )}
          <View style={styles.mpgBadge}>
            <Text style={styles.mpgLabel}>RANGE</Text>
            <Text style={styles.mpgValue}>{result.maxRangeMiles} mi</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  containerCompact: {
    padding: 6,
    borderRadius: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerValue: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  gaugeTrack: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(62,79,60,0.2)',
  },
  gaugeSegment: {
    height: '100%',
  },
  distanceMarkers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  distanceText: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  fuelStopRow: {
    position: 'relative',
    height: 18,
    marginTop: 2,
  },
  fuelStopMarker: {
    position: 'absolute',
    alignItems: 'center',
    top: 0,
  },
  fuelStopDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.3)',
  },
  fuelStopLabel: {
    fontSize: 7,
    fontWeight: '700',
    fontFamily: 'Courier',
    marginTop: 1,
  },
  mpgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 6,
  },
  mpgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(62,79,60,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  mpgLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  mpgValue: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  terrainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,152,0,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,152,0,0.2)',
  },
  terrainText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#FF9800',
    letterSpacing: 1,
  },
});




/**
 * VehicleDisplayIndicators — Shared Status Indicators
 *
 * Always displayed at the top of the vehicle display interface.
 * Shows:
 *   - GPS signal strength
 *   - Connectivity status
 *   - Offline maps availability
 *   - Battery status
 *
 * Designed for driver-safe glanceability:
 *   - Small, subtle indicators
 *   - Color-coded status
 *   - No text labels (icon-only)
 */

import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  VehicleIndicators,
  VehicleDisplayMode,
} from '../../lib/vehicleDisplayTypes';

import {
  VEHICLE_DISPLAY_MODE_LABELS,
  VEHICLE_DISPLAY_MODE_COLORS,
} from '../../lib/vehicleDisplayTypes';

interface Props {
  indicators: VehicleIndicators;
  mode: VehicleDisplayMode;
}

function gpsIcon(signal: VehicleIndicators['gpsSignal']): { name: string; color: string } {
  switch (signal) {
    case 'strong':   return { name: 'navigate', color: '#4CAF50' };
    case 'moderate': return { name: 'navigate-outline', color: '#E0A030' };
    case 'weak':     return { name: 'navigate-outline', color: '#EF5350' };
    case 'none':
    default:         return { name: 'navigate-outline', color: '#555' };
  }
}

function connectivityIcon(status: VehicleIndicators['connectivity']): { name: string; color: string } {
  switch (status) {
    case 'online':  return { name: 'wifi', color: '#4CAF50' };
    case 'limited': return { name: 'wifi', color: '#E0A030' };
    case 'offline': return { name: 'wifi', color: '#EF5350' };
    case 'unknown':
    default:        return { name: 'wifi-outline', color: '#555' };
  }
}

function batteryIcon(percent: number | null, charging: boolean): { name: string; color: string } {
  if (percent === null) return { name: 'battery-dead-outline', color: '#555' };
  if (charging) return { name: 'battery-charging', color: '#4CAF50' };
  if (percent > 60) return { name: 'battery-full', color: '#4CAF50' };
  if (percent > 30) return { name: 'battery-half', color: '#E0A030' };
  return { name: 'battery-dead', color: '#EF5350' };
}

export default function VehicleDisplayIndicators({ indicators, mode }: Props) {
  const gps = gpsIcon(indicators.gpsSignal);
  const conn = connectivityIcon(indicators.connectivity);
  const batt = batteryIcon(indicators.batteryPercent, indicators.batteryCharging);
  const modeColor = VEHICLE_DISPLAY_MODE_COLORS[mode];

  return (
    <View style={styles.container}>
      {/* Mode badge */}
      <View style={[styles.modeBadge, { borderColor: modeColor }]}>
        <View style={[styles.modeDot, { backgroundColor: modeColor }]} />
        <Text style={[styles.modeLabel, { color: modeColor }]}>
          {VEHICLE_DISPLAY_MODE_LABELS[mode]}
        </Text>
      </View>

      <View style={styles.spacer} />

      {/* Indicator icons */}
      <View style={styles.indicators}>
        <View style={styles.indicatorItem}>
          <Ionicons name={gps.name as any} size={16} color={gps.color} />
        </View>

        <View style={styles.indicatorItem}>
          <Ionicons name={conn.name as any} size={16} color={conn.color} />
        </View>

        {indicators.offlineMaps && (
          <View style={styles.indicatorItem}>
            <Ionicons name="download-outline" size={16} color="#5AC8FA" />
          </View>
        )}

        <View style={styles.indicatorItem}>
          <Ionicons name={batt.name as any} size={16} color={batt.color} />
          {indicators.batteryPercent !== null && (
            <Text style={[styles.batteryText, { color: batt.color }]}>
              {indicators.batteryPercent}%
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  modeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  modeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
  },
  spacer: {
    flex: 1,
  },
  indicators: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  indicatorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  batteryText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Courier',
  },
});




import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  VehicleDisplayMode,
  VehicleIndicators,
  VehicleRouteSessionState,
} from '../../lib/vehicleDisplayTypes';
import {
  VEHICLE_DISPLAY_MODE_COLORS,
  VEHICLE_DISPLAY_MODE_SHORT_LABELS,
} from '../../lib/vehicleDisplayTypes';

interface Props {
  indicators: VehicleIndicators;
  mode: VehicleDisplayMode;
  routePhase: VehicleRouteSessionState;
  companionPlatform?: string | null;
  statusLabel?: string | null;
}

function gpsIcon(signal: VehicleIndicators['gpsSignal']): { name: string; color: string } {
  switch (signal) {
    case 'strong':
      return { name: 'navigate', color: '#4CAF50' };
    case 'moderate':
      return { name: 'navigate-outline', color: '#D4A017' };
    case 'weak':
      return { name: 'navigate-outline', color: '#EF5350' };
    default:
      return { name: 'navigate-outline', color: '#666' };
  }
}

function connectivityIcon(status: VehicleIndicators['connectivity']): { name: string; color: string } {
  switch (status) {
    case 'online':
      return { name: 'wifi', color: '#4CAF50' };
    case 'limited':
      return { name: 'wifi', color: '#D4A017' };
    case 'offline':
      return { name: 'cloud-offline-outline', color: '#EF5350' };
    default:
      return { name: 'wifi-outline', color: '#666' };
  }
}

function phasePresentation(routePhase: VehicleRouteSessionState): { label: string; color: string } {
  switch (routePhase) {
    case 'route_active':
      return { label: 'ACTIVE', color: '#4CAF50' };
    case 'route_selected':
      return { label: 'READY', color: '#5B8DEF' };
    case 'alerting_or_degraded':
      return { label: 'ALERT', color: '#EF5350' };
    case 'completed':
      return { label: 'DONE', color: '#8FA36B' };
    default:
      return { label: 'IDLE', color: '#8B949E' };
  }
}

export default function VehicleDisplayIndicators({
  indicators,
  mode,
  routePhase,
  companionPlatform,
  statusLabel,
}: Props) {
  const modeColor = VEHICLE_DISPLAY_MODE_COLORS[mode];
  const gps = gpsIcon(indicators.gpsSignal);
  const conn = connectivityIcon(indicators.connectivity);
  const phase = phasePresentation(routePhase);
  const companionLabel =
    companionPlatform === 'android_auto'
      ? 'AA'
      : companionPlatform === 'carplay'
        ? 'CP'
        : null;

  return (
    <View style={styles.container}>
      <View style={styles.leading}>
        <View style={[styles.modeBadge, { borderColor: `${modeColor}66` }]}>
          <View style={[styles.modeDot, { backgroundColor: modeColor }]} />
          <Text style={[styles.modeLabel, { color: modeColor }]}>
            {VEHICLE_DISPLAY_MODE_SHORT_LABELS[mode]}
          </Text>
        </View>

        <View style={[styles.phaseBadge, { borderColor: `${phase.color}55`, backgroundColor: `${phase.color}14` }]}>
          <Text style={[styles.phaseLabel, { color: phase.color }]}>{phase.label}</Text>
        </View>
      </View>

      <View style={styles.trailing}>
        {statusLabel ? <Text style={styles.statusLabel}>{statusLabel}</Text> : null}
        {companionLabel ? <Text style={styles.companionLabel}>{companionLabel}</Text> : null}

        <Ionicons name={gps.name as any} size={15} color={gps.color} />
        <Ionicons name={conn.name as any} size={15} color={conn.color} />

        {indicators.offlineMaps ? (
          <Ionicons name="download-outline" size={15} color="#5AC8FA" />
        ) : null}

        {indicators.batteryPercent != null ? (
          <View style={styles.batteryGroup}>
            <Ionicons
              name={indicators.batteryCharging ? 'battery-charging' : 'battery-half'}
              size={15}
              color={indicators.batteryCharging ? '#4CAF50' : '#8B949E'}
            />
            <Text style={styles.batteryText}>{Math.round(indicators.batteryPercent)}%</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0D1117',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  leading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    letterSpacing: 2,
  },
  phaseBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  phaseLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  companionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8B949E',
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#C7D1DB',
  },
  batteryGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  batteryText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8B949E',
  },
});

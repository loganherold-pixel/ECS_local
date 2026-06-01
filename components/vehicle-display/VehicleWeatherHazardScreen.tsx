import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import type { VehicleWeatherHazardData } from '../../lib/vehicleDisplayTypes';
import type { ECSAutomotiveSurfaceState } from '../../lib/automotive/automotiveSurfaceTypes';

interface Props {
  data: VehicleWeatherHazardData;
  automotive?: ECSAutomotiveSurfaceState | null;
}

function hazardColor(state: VehicleWeatherHazardData['hazardState']): string {
  switch (state) {
    case 'critical':
      return '#C0392B';
    case 'warning':
      return '#EF5350';
    case 'caution':
      return '#D4A017';
    default:
      return '#4CAF50';
  }
}

export default function VehicleWeatherHazardScreen({ data, automotive }: Props) {
  const weatherCommand =
    automotive?.primaryCommand?.role === 'route_warning'
      ? automotive.primaryCommand
      : automotive?.secondaryCommands.find((command) => command.role === 'route_warning') ?? null;
  const accent = hazardColor(data.hazardState);
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>WEATHER / ROUTE HAZARD</Text>
        <Text style={styles.heroValue}>{data.weatherSummary ?? 'Weather unavailable'}</Text>
        <Text style={styles.heroSub}>
          {weatherCommand?.summary ?? data.alertSummary ?? data.unavailableReason ?? 'Current conditions unavailable'}
        </Text>
      </View>

      <View style={styles.metrics}>
        <Metric label="Wind" value={data.windMph != null ? `${data.windMph} mph` : '--'} />
        <Metric label="Rain" value={data.precipitationChance != null ? `${data.precipitationChance}%` : '--'} />
        <Metric label="Temp" value={data.temperatureF != null ? `${data.temperatureF}°` : '--'} />
      </View>

      <View style={[styles.alertCard, { borderColor: `${accent}55`, backgroundColor: `${accent}14` }]}>
        <Text style={[styles.alertTitle, { color: accent }]}>ROUTE OUTLOOK</Text>
        <Text style={styles.alertBody}>
          {weatherCommand?.summary ?? data.routeHazard ?? (data.status === 'live' ? 'Conditions stable ahead' : 'No live weather route context')}
        </Text>
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E12',
    padding: 14,
    gap: 12,
  },
  hero: {
    backgroundColor: '#111418',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    color: '#8B949E',
    marginBottom: 8,
  },
  heroValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#E6EDF3',
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 14,
    color: '#B3BDC8',
    lineHeight: 20,
  },
  metrics: {
    flexDirection: 'row',
    gap: 10,
  },
  metric: {
    flex: 1,
    backgroundColor: '#111418',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8B949E',
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E6EDF3',
  },
  alertCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  alertTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 8,
  },
  alertBody: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E6EDF3',
    lineHeight: 24,
  },
});

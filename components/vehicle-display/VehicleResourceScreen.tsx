import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import type { VehicleResourceData } from '../../lib/vehicleDisplayTypes';
import type { ECSAutomotiveSurfaceState } from '../../lib/automotive/automotiveSurfaceTypes';

interface Props {
  data: VehicleResourceData;
  automotive?: ECSAutomotiveSurfaceState | null;
}

export default function VehicleResourceScreen({ data, automotive }: Props) {
  const resourceCommand =
    automotive?.primaryCommand?.role === 'resource_margin'
      ? automotive.primaryCommand
      : automotive?.secondaryCommands.find((command) => command.role === 'resource_margin') ?? null;
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>RESOURCE STATUS</Text>
        <Text style={styles.headerValue}>{resourceCommand?.summary ?? data.supportLabel}</Text>
      </View>

      <View style={styles.grid}>
        <Stat title="Fuel" value={data.fuelPercent != null ? `${data.fuelPercent}%` : '--'} />
        <Stat title="Range" value={data.fuelRangeMiles != null ? `${data.fuelRangeMiles} mi` : '--'} />
        <Stat title="Water" value={data.waterRemaining != null ? `${data.waterRemaining} ${data.waterUnit}` : '--'} />
        <Stat title="Battery" value={data.batteryPercent != null ? `${data.batteryPercent}%` : '--'} />
      </View>

      <View style={styles.powerStrip}>
        <PowerPill label="Input" value={data.powerInputWatts != null ? `+${data.powerInputWatts}W` : '--'} color="#4CAF50" />
        <PowerPill label="Output" value={data.powerOutputWatts != null ? `-${data.powerOutputWatts}W` : '--'} color="#EF5350" />
        {data.alternateFluidLabel && data.alternateFluidValue != null ? (
          <PowerPill
            label={data.alternateFluidLabel}
            value={`${data.alternateFluidValue}${data.alternateFluidUnit ? ` ${data.alternateFluidUnit}` : ''}`}
            color="#5AC8FA"
          />
        ) : null}
      </View>
    </View>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardValue}>{value}</Text>
    </View>
  );
}

function PowerPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.powerPill, { borderColor: `${color}55`, backgroundColor: `${color}14` }]}>
      <Text style={[styles.powerLabel, { color }]}>{label.toUpperCase()}</Text>
      <Text style={styles.powerValue}>{value}</Text>
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
  header: {
    backgroundColor: '#111418',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    color: '#8B949E',
    marginBottom: 6,
  },
  headerValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E6EDF3',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '48%',
    backgroundColor: '#111418',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8B949E',
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 26,
    fontWeight: '700',
    color: '#E6EDF3',
  },
  powerStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  powerPill: {
    flexGrow: 1,
    minWidth: '30%',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  powerLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 6,
  },
  powerValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E6EDF3',
  },
});

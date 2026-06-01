import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { VehicleNavigationData } from '../../lib/vehicleDisplayTypes';
import type { ECSAutomotiveSurfaceState } from '../../lib/automotive/automotiveSurfaceTypes';

interface Props {
  data: VehicleNavigationData;
  automotive?: ECSAutomotiveSurfaceState | null;
}

function chipColor(state: VehicleNavigationData['hazardState']): string {
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

export default function VehicleNavigationScreen({ data, automotive }: Props) {
  const primaryCommand = automotive?.primaryCommand ?? null;
  const secondaryCommands = automotive?.secondaryCommands ?? [];
  const accent =
    primaryCommand?.tone === 'critical'
      ? '#C0392B'
      : primaryCommand?.tone === 'warning'
        ? '#EF5350'
        : primaryCommand?.tone === 'watch'
          ? '#D4A017'
          : chipColor(data.hazardState);
  const inactive = data.routePhase === 'inactive';

  return (
    <View style={styles.container}>
      <View style={styles.mapShell}>
        <View style={styles.routeCanvas}>
          <View style={styles.gridLineTop} />
          <View style={styles.gridLineBottom} />
          <View style={styles.routeStroke} />
          <View style={styles.positionDot} />
        </View>

        {primaryCommand ? (
          <View style={[styles.hazardChip, { borderColor: `${accent}55`, backgroundColor: `${accent}18` }]}>
            <Ionicons
              name={
                primaryCommand.role === 'guidance_status'
                  ? 'locate-outline'
                  : primaryCommand.role === 'exit_relevance'
                    ? 'trail-sign-outline'
                    : primaryCommand.role === 'resource_margin'
                      ? 'speedometer-outline'
                      : 'warning-outline'
              }
              size={14}
              color={accent}
            />
            <Text style={[styles.hazardText, { color: accent }]} numberOfLines={1}>
              {primaryCommand.summary}
            </Text>
          </View>
        ) : data.hazardLabel ? (
          <View style={[styles.hazardChip, { borderColor: `${accent}55`, backgroundColor: `${accent}18` }]}>
            <Ionicons name="warning-outline" size={14} color={accent} />
            <Text style={[styles.hazardText, { color: accent }]} numberOfLines={1}>
              {data.hazardLabel}
            </Text>
          </View>
        ) : null}

        {secondaryCommands.length > 0 ? (
          <View style={[styles.secondaryRow, data.offRouteDetected ? styles.secondaryRowLower : null]}>
            {secondaryCommands.slice(0, 2).map((command) => (
              <View key={command.id} style={styles.secondaryChip}>
                <Text style={styles.secondaryText} numberOfLines={1}>
                  {command.summary}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {data.offRouteDetected ? (
          <View style={styles.offRouteChip}>
            <Ionicons name="git-compare-outline" size={14} color="#EF5350" />
            <Text style={styles.offRouteText}>
              OFF ROUTE{data.offRouteDistanceFt ? ` • ${Math.round(data.offRouteDistanceFt)} ft` : ''}
            </Text>
          </View>
        ) : null}

        <View style={styles.overlay}>
          <Text style={styles.status}>{data.statusLabel}</Text>
          <Text style={styles.routeName} numberOfLines={1}>
            {data.routeName ?? (inactive ? 'No route staged' : 'Route loaded')}
          </Text>
          <Text style={styles.maneuver} numberOfLines={2}>
            {data.nextManeuver ?? (inactive ? 'Select a route on phone to start guidance.' : 'Guidance ready')}
          </Text>
        </View>
      </View>

      <View style={styles.bottomBar}>
        <Metric label="Remaining" value={data.distanceRemainingMiles != null ? `${data.distanceRemainingMiles} mi` : '--'} />
        <Metric label="ETA" value={data.etaLabel ?? '--'} />
        <Metric label="Progress" value={data.progressPct != null ? `${data.progressPct}%` : '--'} />
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
  },
  mapShell: {
    flex: 1,
    margin: 14,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#0F141B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  routeCanvas: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#10161D',
  },
  gridLineTop: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: '28%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  gridLineBottom: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: '62%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  routeStroke: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    top: '24%',
    bottom: '16%',
    borderRadius: 120,
    borderWidth: 3,
    borderColor: 'rgba(91,141,239,0.7)',
    borderStyle: 'dashed',
  },
  positionDot: {
    position: 'absolute',
    bottom: '28%',
    left: '44%',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#D4A017',
    borderWidth: 3,
    borderColor: '#0B0E12',
  },
  hazardChip: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hazardText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  offRouteChip: {
    position: 'absolute',
    top: 62,
    left: 14,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(239,83,80,0.16)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.4)',
  },
  offRouteText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF5350',
    letterSpacing: 1,
  },
  secondaryRow: {
    position: 'absolute',
    top: 62,
    left: 14,
    right: 14,
    flexDirection: 'row',
    gap: 8,
  },
  secondaryRowLower: {
    top: 104,
  },
  secondaryChip: {
    flex: 1,
    backgroundColor: 'rgba(8,11,15,0.74)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  secondaryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#C7D1DB',
  },
  overlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: 'rgba(8,11,15,0.78)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  status: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    color: '#8B949E',
    marginBottom: 6,
  },
  routeName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#E6EDF3',
    marginBottom: 6,
  },
  maneuver: {
    fontSize: 16,
    color: '#C7D1DB',
    lineHeight: 22,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
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
});

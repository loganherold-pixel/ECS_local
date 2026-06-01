import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { WidgetCompactRow } from './WidgetChrome';
import { remotenessStore } from '../../lib/remotenessStore';
import type {
  ConnectivitySignal,
  InfrastructureProximity,
  ProximityEstimate,
  RemotenessDestination,
  RemotenessDestinationType,
  RemotenessIndexOutput,
} from '../../lib/remotenessTypes';
import {
  buildRemotenessDestinations,
  formatRemotenessDistance,
} from '../../lib/remotenessDestinations';
import { buildEnvironmentSnapshot } from '../../lib/environmentSnapshotService';

type RemotenessNavigationTargetType = 'town' | 'fuel' | 'paved_road';

function useRemotenessIndex() {
  const [, setRevision] = useState(0);

  useEffect(() => {
    const unsubscribe = remotenessStore.subscribe(() => {
      setRevision((current) => current + 1);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    remotenessStore.start();
    return () => {
      remotenessStore.stop();
    };
  }, []);

  return remotenessStore.getIndex();
}

function formatProximityDistance(distanceMiles: number | null): string {
  return formatRemotenessDistance(distanceMiles ?? undefined);
}

function estimateOverallConfidence(
  proximity: InfrastructureProximity,
): ProximityEstimate['confidence'] {
  const scores: Record<ProximityEstimate['confidence'], number> = {
    high: 3,
    medium: 2,
    low: 1,
    estimated: 0,
  };

  const samples = [
    proximity.nearestPavedRoad.confidence,
    proximity.nearestTown.confidence,
    proximity.nearestFuelStation.confidence,
  ];

  const average = samples.reduce((sum, sample) => sum + scores[sample], 0) / samples.length;
  if (average >= 2.5) return 'high';
  if (average >= 1.5) return 'medium';
  return 'low';
}

function getConfidenceColor(confidence: ProximityEstimate['confidence']): string {
  if (confidence === 'high') return '#66BB6A';
  if (confidence === 'medium') return '#FFB74D';
  return TACTICAL.textMuted;
}

function getConfidenceLabel(confidence: ProximityEstimate['confidence']): string {
  if (confidence === 'high') return 'High';
  if (confidence === 'medium') return 'Medium';
  return 'Low';
}

function getSignalBars(signal: ConnectivitySignal): number {
  switch (signal) {
    case 'strong':
      return 5;
    case 'moderate':
      return 4;
    case 'weak':
      return 3;
    case 'intermittent':
      return 2;
    case 'no_signal':
    case 'offline':
      return 1;
    case 'unknown':
    default:
      return 1;
  }
}

function getSignalColor(signal: ConnectivitySignal): string {
  switch (signal) {
    case 'strong':
      return '#6FCF6A';
    case 'moderate':
      return '#B9D86B';
    case 'weak':
      return '#F5C15A';
    case 'intermittent':
      return '#E67E22';
    case 'no_signal':
    case 'offline':
      return 'rgba(255,255,255,0.34)';
    case 'unknown':
    default:
      return 'rgba(255,255,255,0.42)';
  }
}

function SignalBars({
  signal,
}: {
  signal: ConnectivitySignal;
}) {
  const activeBars = getSignalBars(signal);
  const activeColor = getSignalColor(signal);
  const inactiveBarColor =
    signal === 'no_signal' || signal === 'offline'
      ? 'rgba(171, 177, 186, 0.46)'
      : 'rgba(255,255,255,0.12)';

  return (
    <View style={styles.signalCluster}>
      <Text style={styles.signalLabel}>Link</Text>
      <View style={styles.signalBarsRow}>
        {[0, 1, 2, 3, 4].map((barIndex) => {
          const isActive = activeBars > barIndex;
          return (
            <View
              key={barIndex}
              style={[
                styles.signalBar,
                { height: 6 + barIndex * 3 },
                isActive
                  ? [styles.signalBarActive, { backgroundColor: activeColor }]
                  : [styles.signalBarInactive, { backgroundColor: inactiveBarColor }],
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

function ProximityLine({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.proximityLine}>
      <Text style={styles.proximityLabel}>{label}</Text>
      <Text style={[styles.proximityValue, emphasize ? styles.proximityValueEmphasis : null]}>
        {value}
      </Text>
    </View>
  );
}

function RemotenessActionButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        disabled ? styles.actionButtonDisabled : null,
      ]}
    >
      <Ionicons
        name={icon}
        size={14}
        color={disabled ? TACTICAL.textMuted : TACTICAL.amber}
      />
      <Text style={[styles.actionButtonText, disabled ? styles.actionButtonTextDisabled : null]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function RemotenessWaitingState({
  compact = false,
  title = 'GPS required',
  subtitle = 'Remoteness becomes live as soon as ECS has a usable location fix.',
}: {
  compact?: boolean;
  title?: string;
  subtitle?: string;
}) {
  return (
    <View style={[styles.cardBody, compact ? styles.compactBody : null]}>
      <Text style={[styles.waitingTitle, compact ? styles.waitingTitleCompact : null]}>
        {title}
      </Text>
      <Text style={styles.waitingSubtitle}>
        {subtitle}
      </Text>
    </View>
  );
}

function buildRemotenessEnvironment(index: RemotenessIndexOutput | null) {
  return buildEnvironmentSnapshot({
    coordinate: index?.gpsLat != null && index?.gpsLon != null
      ? {
          latitude: index.gpsLat,
          longitude: index.gpsLon,
          source: 'gps',
          updatedAt: index.lastComputedAt,
        }
      : null,
    remoteness: index,
  });
}

function getProximityMetrics(index: RemotenessIndexOutput) {
  const destinations = buildRemotenessDestinations(index);
  const formatDestinationValue = (
    type: RemotenessDestinationType,
    destination: RemotenessDestination | null,
  ) => {
    if (!destination) return '--';
    if (type === 'road' || type === 'town') {
      const distanceLabel = formatRemotenessDistance(destination.distanceMiles);
      if (distanceLabel === 'Here') return 'Here';
      return distanceLabel;
    }
    if (type === 'fuel' && (!destination.label || destination.label === 'Nearest Fuel')) {
      return 'Nearest Fuel';
    }
    return destination.label;
  };

  return [
    { label: 'Road', value: formatDestinationValue('road', destinations.road) },
    { label: 'Town', value: formatDestinationValue('town', destinations.town) },
    { label: 'Fuel', value: formatDestinationValue('fuel', destinations.fuel) },
  ];
}

function getPrimaryDistanceMetrics(index: RemotenessIndexOutput) {
  const [road, town] = getProximityMetrics(index);
  return [road, town];
}

function renderProximityGrid(index: RemotenessIndexOutput, compact = false) {
  const rows = getPrimaryDistanceMetrics(index);

  return (
    <View style={[styles.distanceStack, compact ? styles.distanceStackCompact : null]}>
      {rows.map((row) => (
        <View key={row.label} style={styles.distanceLine}>
          <Text style={styles.distanceText} numberOfLines={1}>
            <Text style={styles.distanceLabel}>{row.label}: </Text>
            <Text style={styles.distanceValue}>{row.value}</Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

export function RemotenessIndexCompact() {
  const index = useRemotenessIndex();
  const environment = buildRemotenessEnvironment(index);

  if (!index || index.gpsLat == null || index.gpsLon == null) {
    return <WidgetCompactRow title="Remoteness" summary="GPS unavailable" tone="unavailable" />;
  }

  if (environment.remoteness.score == null) {
    return (
      <WidgetCompactRow
        title="Remoteness"
        summary="Unknown"
        tone="unavailable"
        status="Provider pending"
        statusTone="neutral"
      />
    );
  }

  const overallConfidence = estimateOverallConfidence(index.proximity);
  const metrics = getPrimaryDistanceMetrics(index);
  const compactSummary = `${environment.remoteness.label} | ${metrics[0].label}: ${metrics[0].value}`;

  return (
    <WidgetCompactRow
      title="Remoteness"
      summary={compactSummary}
      tone="neutral"
      status={getConfidenceLabel(overallConfidence)}
      statusTone="neutral"
    />
  );
}

export function RemotenessIndexCard() {
  const index = useRemotenessIndex();
  const environment = buildRemotenessEnvironment(index);

  if (!index || index.gpsLat == null || index.gpsLon == null) {
    return <RemotenessWaitingState />;
  }

  if (environment.remoteness.score == null) {
    return (
      <RemotenessWaitingState
        title="Remoteness unknown"
        subtitle="Service distance is unresolved. ECS will update when live or cached proximity data is available."
      />
    );
  }

  return (
    <View style={styles.cardBody}>
      <View style={styles.headerRow}>
        <View style={styles.heroContent}>
          <Text style={styles.heroKicker}>Remoteness</Text>
          <Text style={[styles.levelText, styles.levelTextCard, { color: index.levelColor }]}>
            {environment.remoteness.label.toUpperCase()}
          </Text>
        </View>
        <SignalBars signal={index.connectivity.signal} />
      </View>

      {renderProximityGrid(index)}
      <Text style={styles.sourceHint} numberOfLines={1}>
        {environment.remoteness.source === 'remoteness_provider' ? 'Services appear limited by available data' : 'Last known proximity'}
      </Text>
    </View>
  );
}

export function RemotenessIndexDetailView({
  onNavigateToTarget,
}: {
  onNavigateToTarget?: (target: RemotenessNavigationTargetType) => void;
}) {
  const index = useRemotenessIndex();
  const environment = buildRemotenessEnvironment(index);
  const overallConfidence = index ? estimateOverallConfidence(index.proximity) : 'low';
  const confidenceColor = getConfidenceColor(overallConfidence);
  const hasLocation = index?.gpsLat != null && index?.gpsLon != null;
  const destinations = buildRemotenessDestinations(index);
  const hasTownDestination = !!destinations.town;
  const hasFuelDestination = !!destinations.fuel;
  const hasRoadDestination = !!destinations.road;
  const dataSourceLabel = destinations.road?.source === 'cache' ||
    destinations.town?.source === 'cache' ||
    destinations.fuel?.source === 'cache'
    ? 'Last Known'
    : hasTownDestination || hasFuelDestination || hasRoadDestination
      ? 'Live'
      : 'Unavailable';

  if (!index || environment.remoteness.score == null) {
    return (
      <View style={styles.detailContainer}>
        <Text style={styles.detailEyebrow}>Cinematic Remoteness Tier</Text>
        <View style={styles.detailHero}>
          <Text style={styles.waitingTitle}>
            {index ? 'Remoteness unknown' : 'Remoteness engine standing by'}
          </Text>
          <Text style={styles.waitingSubtitle}>
            {index
              ? 'Nearest road, town, or fuel data is unresolved. ECS will not infer isolation from an empty provider result.'
              : 'ECS needs a valid GPS fix before it can score nearby infrastructure and bailout distance.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.detailContainer}>
      <Text style={styles.detailEyebrow}>Cinematic Remoteness Tier</Text>
      <View style={styles.detailHero}>
        <View style={styles.detailHeroTopRow}>
          <Text style={[styles.detailLevel, { color: index.levelColor }]}>
            {environment.remoteness.label.toUpperCase()}
          </Text>
          <View style={[styles.confidenceChip, { borderColor: `${confidenceColor}44`, backgroundColor: `${confidenceColor}16` }]}>
            <Text style={[styles.confidenceChipText, { color: confidenceColor }]}>
              {getConfidenceLabel(overallConfidence)} Confidence
            </Text>
          </View>
        </View>
        <Text style={styles.detailDescription}>{index.description}</Text>
        <Text style={styles.detailReason}>{index.reason}</Text>
      </View>

      <View style={styles.actionsGroup}>
        <RemotenessActionButton
          label="Navigate to Nearest Town"
          icon="business-outline"
          onPress={() => onNavigateToTarget?.('town')}
          disabled={!hasLocation || !onNavigateToTarget || !hasTownDestination}
        />
        <RemotenessActionButton
          label="Navigate to Nearest Fuel"
          icon="flame-outline"
          onPress={() => onNavigateToTarget?.('fuel')}
          disabled={!hasLocation || !onNavigateToTarget || !hasFuelDestination}
        />
        <RemotenessActionButton
          label="Navigate to Nearest Paved Road"
          icon="navigate-outline"
          onPress={() => onNavigateToTarget?.('paved_road')}
          disabled={!hasLocation || !onNavigateToTarget || !hasRoadDestination}
        />
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Infrastructure Proximity</Text>
        <ProximityLine
          label="Nearest Paved Road"
          value={destinations.road ? `${destinations.road.label} - ${formatRemotenessDistance(destinations.road.distanceMiles)}` : 'Unavailable'}
        />
        <ProximityLine
          label="Nearest Town"
          value={destinations.town ? `${destinations.town.label} - ${formatRemotenessDistance(destinations.town.distanceMiles)}` : 'Unavailable'}
        />
        <ProximityLine
          label="Nearest Fuel"
          value={destinations.fuel ? `${destinations.fuel.label} - ${formatRemotenessDistance(destinations.fuel.distanceMiles)}` : 'Unavailable'}
          emphasize
        />
        <ProximityLine label="Data Source" value={dataSourceLabel} />
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Current Interpretation</Text>
        <ProximityLine label="Confidence" value={getConfidenceLabel(overallConfidence)} />
        <ProximityLine
          label="Connectivity"
          value={
            index.connectivity.signal === 'no_signal' || index.connectivity.signal === 'offline'
              ? 'Coverage may be limited'
              : index.connectivity.signal.replace('_', ' ').toUpperCase()
          }
        />
        <ProximityLine
          label="Forecast Ahead"
          value={
            index.forecast.available
              ? index.forecast.isIncreasing
                ? 'Increasing'
                : 'Stable'
              : 'Unavailable'
          }
        />
      </View>

      {index.advisories.length > 0 ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Operational Advisories</Text>
          {index.advisories.slice(0, 3).map((advisory) => {
            const advisoryColor =
              advisory.severity === 'critical'
                ? TACTICAL.danger
                : advisory.severity === 'warning'
                  ? '#E67E22'
                  : advisory.severity === 'caution'
                    ? '#FFB300'
                    : '#5AC8FA';
            return (
              <View key={advisory.id} style={[styles.advisoryRow, { borderLeftColor: advisoryColor }]}>
                <Text style={[styles.advisoryText, { color: advisoryColor }]}>
                  {advisory.message}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {!hasLocation ? (
        <Text style={styles.unavailableText}>
          Live location is required before ECS can hand off a nearest safety route.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cardBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 2,
  },
  compactBody: {
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  heroContent: {
    flex: 1,
    gap: 2,
  },
  heroCompact: {
    flex: 1,
    gap: 1,
  },
  heroKicker: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  signalCluster: {
    alignItems: 'flex-end',
    gap: 4,
    minWidth: 52,
  },
  signalLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sourceHint: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },
  signalBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    minHeight: 16,
  },
  signalBar: {
    width: 5,
    borderRadius: 999,
  },
  signalBarActive: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  signalBarInactive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  confidenceChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  confidenceChipText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  levelText: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: 1.4,
  },
  levelTextCard: {
    fontSize: 14,
  },
  levelTextCompact: {
    fontSize: 11,
  },
  proximityGroup: {
    gap: 4,
  },
  proximityGroupCompact: {
    gap: 3,
  },
  proximityGrid: {
    gap: 5,
  },
  proximityGridCompact: {
    gap: 4,
  },
  proximityGridRow: {
    flexDirection: 'row',
    gap: 6,
  },
  distanceStack: {
    gap: 5,
  },
  distanceStackCompact: {
    gap: 4,
  },
  distanceLine: {
    minHeight: 18,
    justifyContent: 'center',
  },
  distanceText: {
    fontSize: 11,
    lineHeight: 15,
    color: TACTICAL.text,
  },
  distanceLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.4,
  },
  distanceValue: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'Courier',
    color: TACTICAL.text,
  },
  proximityTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  proximityTileCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  proximityTileLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  proximityTileValue: {
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.text,
    lineHeight: 12,
  },
  proximityTileValueCompact: {
    fontSize: 10,
  },
  proximityLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  proximityLabel: {
    flex: 1,
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  proximityValue: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'Courier',
    color: TACTICAL.text,
  },
  proximityValueEmphasis: {
    color: TACTICAL.amber,
  },
  waitingTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  waitingTitleCompact: {
    fontSize: 10,
  },
  waitingSubtitle: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  detailContainer: {
    gap: 12,
    paddingBottom: 8,
  },
  detailEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  detailHero: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(196,138,44,0.06)',
    padding: 14,
    gap: 8,
  },
  detailHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  detailLevel: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'Courier',
  },
  detailDescription: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
    lineHeight: 18,
  },
  detailReason: {
    fontSize: 11,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    lineHeight: 16,
  },
  actionsGroup: {
    gap: 8,
  },
  actionButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(11,15,18,0.72)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.4,
  },
  actionButtonTextDisabled: {
    color: TACTICAL.textMuted,
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  advisoryRow: {
    borderLeftWidth: 2,
    paddingLeft: 8,
  },
  advisoryText: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
  },
  unavailableText: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },
});

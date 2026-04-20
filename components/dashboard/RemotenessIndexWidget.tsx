import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { WidgetCompactRow } from './WidgetChrome';
import { remotenessStore } from '../../lib/remotenessStore';
import type {
  InfrastructureProximity,
  ProximityEstimate,
  RemotenessIndexOutput,
} from '../../lib/remotenessTypes';

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

function roundMiles(distanceMiles: number | null): string {
  if (distanceMiles == null || !Number.isFinite(distanceMiles)) return '--';
  return `${Math.max(0, Math.round(distanceMiles))} mi`;
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

function ProximityTile({
  label,
  value,
  emphasize = false,
  compact = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[styles.proximityTile, compact ? styles.proximityTileCompact : null]}>
      <Text style={styles.proximityTileLabel}>{label}</Text>
      <Text
        numberOfLines={1}
        style={[
          styles.proximityTileValue,
          compact ? styles.proximityTileValueCompact : null,
          emphasize ? styles.proximityValueEmphasis : null,
        ]}
      >
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

function RemotenessWaitingState({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.cardBody, compact ? styles.compactBody : null]}>
      <Text style={[styles.waitingTitle, compact ? styles.waitingTitleCompact : null]}>
        GPS required
      </Text>
      <Text style={styles.waitingSubtitle}>
        Remoteness becomes live as soon as ECS has a usable location fix.
      </Text>
    </View>
  );
}

function getProximityMetrics(index: RemotenessIndexOutput) {
  return [
    { label: 'Road', value: roundMiles(index.proximity.nearestPavedRoad.distanceMi) },
    { label: 'Town', value: roundMiles(index.proximity.nearestTown.distanceMi) },
    { label: 'Fuel', value: roundMiles(index.proximity.nearestFuelStation.distanceMi) },
  ];
}

function renderProximityRows(index: RemotenessIndexOutput, compact = false) {
  const rows = getProximityMetrics(index);

  return (
    <View style={[styles.proximityGroup, compact ? styles.proximityGroupCompact : null]}>
      {rows.map((row, rowIndex) => (
        <ProximityLine
          key={row.label}
          label={row.label}
          value={row.value}
          emphasize={rowIndex === 2 && row.value !== '--'}
        />
      ))}
    </View>
  );
}

function renderProximityGrid(index: RemotenessIndexOutput, compact = false) {
  const rows = getProximityMetrics(index);

  return (
    <View style={[styles.proximityGrid, compact ? styles.proximityGridCompact : null]}>
      <View style={styles.proximityGridRow}>
        <ProximityTile label={rows[0].label} value={rows[0].value} compact={compact} />
        <ProximityTile label={rows[1].label} value={rows[1].value} compact={compact} />
      </View>
      <View style={styles.proximityGridRow}>
        <ProximityTile
          label={rows[2].label}
          value={rows[2].value}
          emphasize={rows[2].value !== '--'}
          compact={compact}
        />
      </View>
    </View>
  );
}

export function RemotenessIndexCompact() {
  const index = useRemotenessIndex();

  if (!index || index.gpsLat == null || index.gpsLon == null) {
    return <WidgetCompactRow title="Isolation" summary="GPS unavailable" tone="unavailable" />;
  }

  const overallConfidence = estimateOverallConfidence(index.proximity);
  const metrics = getProximityMetrics(index);
  const compactSummary = `${index.level} | ${metrics[0].label} ${metrics[0].value} | ${metrics[2].label} ${metrics[2].value}`;

  return (
    <WidgetCompactRow
      title="Isolation"
      summary={compactSummary}
      tone="neutral"
      status={getConfidenceLabel(overallConfidence)}
      statusTone="neutral"
    />
  );
}

export function RemotenessIndexCard() {
  const index = useRemotenessIndex();

  if (!index || index.gpsLat == null || index.gpsLon == null) {
    return <RemotenessWaitingState />;
  }

  const overallConfidence = estimateOverallConfidence(index.proximity);
  const confidenceColor = getConfidenceColor(overallConfidence);

  return (
    <View style={styles.cardBody}>
      <View style={styles.headerRow}>
        <View style={styles.heroContent}>
          <Text style={styles.heroKicker}>Isolation</Text>
          <Text style={[styles.levelText, styles.levelTextCard, { color: index.levelColor }]}>
            {index.level.toUpperCase()}
          </Text>
        </View>
        <View style={[styles.confidenceChip, { borderColor: `${confidenceColor}44`, backgroundColor: `${confidenceColor}16` }]}>
          <Text style={[styles.confidenceChipText, { color: confidenceColor }]}>
            {getConfidenceLabel(overallConfidence)}
          </Text>
        </View>
      </View>

      {renderProximityGrid(index)}
    </View>
  );
}

export function RemotenessIndexDetailView({
  onNavigateToTarget,
}: {
  onNavigateToTarget?: (target: RemotenessNavigationTargetType) => void;
}) {
  const index = useRemotenessIndex();
  const overallConfidence = index ? estimateOverallConfidence(index.proximity) : 'low';
  const confidenceColor = getConfidenceColor(overallConfidence);
  const hasLocation = index?.gpsLat != null && index?.gpsLon != null;

  if (!index) {
    return (
      <View style={styles.detailContainer}>
        <Text style={styles.detailEyebrow}>Cinematic Remoteness Tier</Text>
        <View style={styles.detailHero}>
        <Text style={styles.waitingTitle}>Remoteness engine standing by</Text>
        <Text style={styles.waitingSubtitle}>
            ECS needs a valid GPS fix before it can score nearby infrastructure and bailout distance.
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
            {index.level.toUpperCase()}
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
          disabled={!hasLocation || !onNavigateToTarget}
        />
        <RemotenessActionButton
          label="Navigate to Nearest Fuel"
          icon="flame-outline"
          onPress={() => onNavigateToTarget?.('fuel')}
          disabled={!hasLocation || !onNavigateToTarget}
        />
        <RemotenessActionButton
          label="Navigate to Nearest Paved Road"
          icon="navigate-outline"
          onPress={() => onNavigateToTarget?.('paved_road')}
          disabled={!hasLocation || !onNavigateToTarget}
        />
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Infrastructure Proximity</Text>
        <ProximityLine label="Nearest Paved Road" value={roundMiles(index.proximity.nearestPavedRoad.distanceMi)} />
        <ProximityLine label="Nearest Town" value={roundMiles(index.proximity.nearestTown.distanceMi)} />
        <ProximityLine label="Nearest Fuel" value={roundMiles(index.proximity.nearestFuelStation.distanceMi)} emphasize />
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Current Interpretation</Text>
        <ProximityLine label="Confidence" value={getConfidenceLabel(overallConfidence)} />
        <ProximityLine
          label="Connectivity"
          value={index.connectivity.signal.replace('_', ' ').toUpperCase()}
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
    alignItems: 'flex-start',
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
  proximityTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 9,
    paddingVertical: 7,
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
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'Courier',
    color: TACTICAL.text,
  },
  proximityTileValueCompact: {
    fontSize: 11,
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

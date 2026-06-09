import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Header from '../components/Header';
import { SafeIcon as Ionicons } from '../components/SafeIcon';
import TopoBackground from '../components/TopoBackground';
import {
  offlineIncidentPacketStore,
  type OfflineIncidentPacket,
} from '../lib/offlineIncidentPacket';
import type { ActiveTripOperationalSummary } from '../lib/activeTripMode';
import {
  evaluateTerrainRiskForOfflineIncidentPacket,
  type TerrainRiskV1Category,
  type TerrainRiskV1Result,
} from '../lib/terrainRiskEngine';
import {
  evaluateCampViabilityForOfflineIncidentPacket,
  type CampViabilityV1Category,
  type CampViabilityV1Result,
} from '../lib/campViabilityEngine';
import { getShellBottomClearance } from '../lib/shellLayout';
import { ECS, TACTICAL } from '../lib/theme';

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCoordinate(coordinate: OfflineIncidentPacket['route']['trailheadCoordinate']): string {
  if (!coordinate) return 'Unknown';
  return `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}

function confidenceColor(category: OfflineIncidentPacket['confidence']['category']): string {
  switch (category) {
    case 'high_confidence':
      return '#66BB6A';
    case 'moderate_confidence':
      return TACTICAL.amber;
    case 'low_confidence':
      return '#FF8A65';
    case 'insufficient_data':
    default:
      return '#EF5350';
  }
}

function statusColor(status: ActiveTripOperationalSummary['status']): string {
  switch (status) {
    case 'selected':
    case 'available':
      return '#66BB6A';
    case 'ranked':
    case 'provider_pending':
      return TACTICAL.amber;
    case 'provider_unavailable':
    case 'no_results':
    case 'missing_anchor':
    case 'missing':
      return '#EF5350';
    case 'not_requested':
    case 'unknown':
    default:
      return TACTICAL.textMuted;
  }
}

function terrainRiskColor(category: TerrainRiskV1Category): string {
  switch (category) {
    case 'low':
      return '#66BB6A';
    case 'moderate':
      return TACTICAL.amber;
    case 'elevated':
      return '#FF8A65';
    case 'severe':
      return '#EF5350';
    case 'unknown':
    default:
      return TACTICAL.textMuted;
  }
}

function campViabilityColor(category: CampViabilityV1Category): string {
  switch (category) {
    case 'strong_candidate':
      return '#66BB6A';
    case 'reasonable_candidate':
      return TACTICAL.amber;
    case 'caution':
      return '#FF8A65';
    case 'poor_candidate':
      return '#EF5350';
    case 'unknown':
    default:
      return TACTICAL.textMuted;
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function StatusRow({ label, item }: { label: string; item: ActiveTripOperationalSummary }) {
  return (
    <View style={styles.statusRow}>
      <View style={styles.statusCopy}>
        <Text style={styles.statusLabel}>{label}</Text>
        <Text style={styles.statusSource} numberOfLines={1}>{item.source}</Text>
      </View>
      <Text style={[styles.statusValue, { color: statusColor(item.status) }]}>{item.label}</Text>
    </View>
  );
}

function TerrainRiskCard({ terrainRisk }: { terrainRisk: TerrainRiskV1Result }) {
  const color = terrainRiskColor(terrainRisk.category);
  const terrainReasons = [
    ...terrainRisk.missingDataReasons,
    ...terrainRisk.riskReasons,
  ].slice(0, 5);

  return (
    <View style={styles.sectionCard} testID="offline-incident-packet-terrain-risk">
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Terrain Risk</Text>
          <Text style={styles.sectionMeta}>LOCAL PACKET</Text>
        </View>
        <View style={[styles.confidenceBadge, { borderColor: color + '55' }]}>
          <Text style={[styles.confidenceText, { color }]}>
            {terrainRisk.label}
          </Text>
          <Text style={styles.confidenceScore}>
            {terrainRisk.score != null ? `${terrainRisk.score}` : '--'}
          </Text>
        </View>
      </View>
      <Text style={styles.recommendedAction}>
        Recommended Action: {terrainRisk.recommendedAction.label}
      </Text>
      {terrainReasons.length > 0 ? (
        <View style={styles.warningList}>
          {terrainReasons.map((reason) => (
            <Text
              key={`${reason.id}-${reason.label}`}
              style={reason.tone === 'positive' ? styles.mutedText : styles.warningText}
            >
              - {reason.label}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.mutedText}>No terrain risk drivers available in the local packet.</Text>
      )}
      <View style={styles.metricGrid}>
        <Metric label="Authority" value={terrainRisk.route.authorityLabel} />
        <Metric label="Geometry" value={terrainRisk.route.geometryStatus} />
        <Metric label="Weather" value={String(terrainRisk.weather.status).toUpperCase()} />
        <Metric label="Data" value={terrainRisk.dataConfidence.state.toUpperCase()} />
      </View>
    </View>
  );
}

function CampViabilityCard({ campViability }: { campViability: CampViabilityV1Result }) {
  const color = campViabilityColor(campViability.category);
  const campReasons = [
    ...campViability.missingDataReasons,
    ...campViability.cautionReasons,
    ...campViability.positiveReasons,
  ].slice(0, 5);

  return (
    <View style={styles.sectionCard} testID="offline-incident-packet-camp-viability">
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Camp Viability</Text>
          <Text style={styles.sectionMeta}>LOCAL PACKET</Text>
        </View>
        <View style={[styles.confidenceBadge, { borderColor: color + '55' }]}>
          <Text style={[styles.confidenceText, { color }]}>
            {campViability.label}
          </Text>
          <Text style={styles.confidenceScore}>
            {campViability.score != null ? `${campViability.score}` : '--'}
          </Text>
        </View>
      </View>
      <Text style={styles.recommendedAction}>
        Recommended Action: {campViability.recommendedAction.label}
      </Text>
      {campReasons.length > 0 ? (
        <View style={styles.warningList}>
          {campReasons.map((reason) => (
            <Text
              key={`${reason.id}-${reason.label}`}
              style={reason.tone === 'positive' ? styles.mutedText : styles.warningText}
            >
              - {reason.label}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.mutedText}>No camp viability drivers available in the local packet.</Text>
      )}
      <View style={styles.metricGrid}>
        <Metric label="Camp" value={campViability.camp.name ?? 'No camp selected'} />
        <Metric label="Source" value={campViability.camp.sourceStatus.toUpperCase()} />
        <Metric label="Legal" value={campViability.camp.legalStatus.toUpperCase()} />
        <Metric label="Data" value={campViability.dataConfidence.state.toUpperCase()} />
      </View>
    </View>
  );
}

function EmptyState({ message, onOpenActiveTrip }: { message: string | null; onOpenActiveTrip: () => void }) {
  return (
    <View style={styles.emptyCard}>
      <Ionicons name="document-text-outline" size={28} color={TACTICAL.textMuted} />
      <Text style={styles.emptyTitle}>No Offline Incident Packet</Text>
      <Text style={styles.emptyText}>
        {message ?? 'Start Active Trip Mode from a Trip Builder itinerary to create a local-only packet.'}
      </Text>
      <TouchableOpacity
        style={styles.primaryButton}
        activeOpacity={0.84}
        onPress={onOpenActiveTrip}
        accessibilityRole="button"
        accessibilityLabel="Open Active Trip"
      >
        <Text style={styles.primaryButtonText}>Open Active Trip</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function OfflineIncidentPacketScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomClearance = getShellBottomClearance(insets.bottom, 8);
  const [packet, setPacket] = useState<OfflineIncidentPacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    offlineIncidentPacketStore.waitForHydration()
      .then(() => {
        if (!mounted) return;
        setPacket(offlineIncidentPacketStore.getRecovered());
      })
      .catch(() => {
        if (!mounted) return;
        setMessage('Offline Incident Packet could not be loaded from local storage.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const warnings = useMemo(() => packet?.keyWarnings.slice(0, 5) ?? [], [packet]);
  const terrainRisk = useMemo(
    () => packet ? evaluateTerrainRiskForOfflineIncidentPacket(packet) : null,
    [packet],
  );
  const campViability = useMemo(
    () => packet ? evaluateCampViabilityForOfflineIncidentPacket(packet, terrainRisk) : null,
    [packet, terrainRisk],
  );

  const handleClearPacket = useCallback(async () => {
    offlineIncidentPacketStore.clear();
    await offlineIncidentPacketStore.flush();
    setPacket(null);
    setMessage('Offline Incident Packet cleared from this device. Active Trip, Fleet, route catalog, and telemetry metadata were not changed.');
  }, []);

  const handleOpenActiveTrip = useCallback(() => {
    router.push('/active-trip');
  }, [router]);

  if (loading) {
    return (
      <TopoBackground>
        <View style={[styles.safeContainer, { paddingBottom: bottomClearance }]}>
          <Header title="Explore" />
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={TACTICAL.amber} />
            <Text style={styles.loadingText}>Loading Offline Incident Packet...</Text>
          </View>
        </View>
      </TopoBackground>
    );
  }

  return (
    <TopoBackground>
      <View
        style={[styles.safeContainer, { paddingBottom: bottomClearance }]}
        testID="offline-incident-packet-screen"
      >
        <Header title="Explore" />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {!packet ? (
            <EmptyState message={message} onOpenActiveTrip={handleOpenActiveTrip} />
          ) : (
            <>
              <View style={styles.heroCard}>
                <View style={styles.heroIcon}>
                  <Ionicons name="document-text-outline" size={18} color={TACTICAL.amber} />
                </View>
                <View style={styles.heroCopy}>
                  <Text style={styles.eyebrow}>OFFLINE INCIDENT PACKET</Text>
                  <Text style={styles.heroTitle} numberOfLines={2}>{packet.route.name ?? 'Unnamed trip'}</Text>
                  <Text style={styles.heroText} numberOfLines={3}>
                    LOCAL ONLY. Not sent by ECS. Use as stale-aware trip context for offline review.
                  </Text>
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Confidence</Text>
                    <Text style={styles.sectionMeta}>LOCAL PACKET</Text>
                  </View>
                  <View style={[styles.confidenceBadge, { borderColor: confidenceColor(packet.confidence.category) + '55' }]}>
                    <Text style={[styles.confidenceText, { color: confidenceColor(packet.confidence.category) }]}>
                      {packet.confidence.label}
                    </Text>
                    <Text style={styles.confidenceScore}>{packet.confidence.score ?? '--'}</Text>
                  </View>
                </View>
                <Text style={styles.recommendedAction}>
                  Recommended Action: {packet.confidence.recommendedAction.label}
                </Text>
                {warnings.length > 0 ? (
                  <View style={styles.warningList}>
                    {warnings.map((warning) => (
                      <Text key={warning} style={styles.warningText}>- {warning}</Text>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.mutedText}>No extra warnings in the stored packet.</Text>
                )}
              </View>

              {terrainRisk ? <TerrainRiskCard terrainRisk={terrainRisk} /> : null}
              {campViability ? <CampViabilityCard campViability={campViability} /> : null}

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Packet</Text>
                  <Text style={styles.sectionMeta}>{packet.status.toUpperCase()}</Text>
                </View>
                <View style={styles.metricGrid}>
                  <Metric label="Created" value={formatDateTime(packet.packetCreatedAt)} />
                  <Metric label="Updated" value={formatDateTime(packet.packetUpdatedAt)} />
                  <Metric label="Freshness" value={packet.dataFreshness.state.toUpperCase()} />
                  <Metric label="Source" value={packet.externalSharing === 'disabled' ? 'Local only' : 'Unavailable'} />
                </View>
                <Text style={styles.packetCopy}>{packet.dataFreshness.label}</Text>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Route</Text>
                  <Text style={styles.sectionMeta}>{packet.route.authorityStatus}</Text>
                </View>
                <View style={styles.metricGrid}>
                  <Metric label="Authority" value={packet.route.authorityLabel} />
                  <Metric label="Geometry" value={packet.route.geometryStatus ?? 'unknown'} />
                  <Metric label="Trailhead" value={formatCoordinate(packet.route.trailheadCoordinate)} />
                  <Metric label="Last Location" value={packet.lastKnownLocation.label} />
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Vehicle</Text>
                  <Text style={styles.sectionMeta}>READ ONLY</Text>
                </View>
                <View style={styles.metricGrid}>
                  <Metric label="Vehicle" value={packet.vehicle.label} />
                  <Metric label="Type" value={packet.vehicle.vehicleType ?? 'Unknown'} />
                  <Metric label="Range" value={packet.vehicle.rangeMiles != null ? `${packet.vehicle.rangeMiles} mi` : 'Unknown'} />
                  <Metric label="Source" value={packet.vehicle.source ?? packet.vehicle.rangeSource ?? 'Unknown'} />
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Logistics</Text>
                  <Text style={styles.sectionMeta}>READ ONLY</Text>
                </View>
                <StatusRow label="Refuel" item={packet.logistics.refuel} />
                <StatusRow label="Resupply" item={packet.logistics.resupply} />
                <StatusRow label="Camp" item={packet.logistics.camp} />
                <StatusRow label="Bailout" item={packet.logistics.bailout} />
              </View>

              <TouchableOpacity
                style={styles.clearButton}
                activeOpacity={0.84}
                onPress={handleClearPacket}
                accessibilityRole="button"
                accessibilityLabel="Clear Offline Incident Packet"
                testID="offline-incident-packet-clear"
              >
                <Ionicons name="trash-outline" size={15} color="#081014" />
                <Text style={styles.clearButtonText}>Clear Packet</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </TopoBackground>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  scroll: { flex: 1 },
  content: {
    gap: 9,
    paddingBottom: 10,
  },
  loadingCard: {
    marginTop: 12,
    minHeight: 86,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  heroCard: {
    minHeight: 92,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '28',
    backgroundColor: ECS.bgPanel,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '32',
    backgroundColor: TACTICAL.amber + '10',
  },
  heroCopy: { flex: 1, minWidth: 0, gap: 3 },
  eyebrow: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  heroTitle: {
    color: TACTICAL.text,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '900',
  },
  heroText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    padding: 10,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  sectionMeta: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  confidenceBadge: {
    minWidth: 96,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  confidenceText: {
    fontSize: 9,
    fontWeight: '900',
  },
  confidenceScore: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
  },
  recommendedAction: {
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
  },
  warningList: { gap: 4 },
  warningText: {
    color: '#FFAB91',
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '800',
  },
  mutedText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
  },
  packetCopy: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricTile: {
    width: '48%',
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    padding: 8,
    justifyContent: 'center',
    gap: 3,
  },
  metricLabel: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  metricValue: {
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
  },
  statusRow: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statusCopy: { flex: 1, minWidth: 0 },
  statusLabel: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  statusSource: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '700',
  },
  statusValue: {
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'right',
  },
  clearButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  clearButtonText: {
    color: '#081014',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  emptyCard: {
    marginTop: 10,
    minHeight: 220,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyTitle: {
    color: TACTICAL.text,
    fontSize: 15,
    fontWeight: '900',
  },
  emptyText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '45',
    backgroundColor: TACTICAL.amber + '12',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

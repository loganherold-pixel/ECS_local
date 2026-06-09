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
  activeTripModeStore,
  type ActiveTripModeSnapshot,
  type ActiveTripOperationalSummary,
} from '../lib/activeTripMode';
import {
  evaluateTerrainRiskForActiveTrip,
  type TerrainRiskV1Category,
  type TerrainRiskV1Result,
} from '../lib/terrainRiskEngine';
import {
  evaluateCampViabilityForActiveTrip,
  type CampViabilityV1Category,
  type CampViabilityV1Result,
} from '../lib/campViabilityEngine';
import { recordBadgeIdentitySafeSignal } from '../lib/expedition/expeditionBadgeStore';
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

function formatCoordinate(coordinate: ActiveTripModeSnapshot['route']['trailheadCoordinate']): string {
  if (!coordinate) return 'Unknown';
  return `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}

function confidenceColor(category: ActiveTripModeSnapshot['routeConfidence']['category']): string {
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

function isUnavailableLike(value: unknown): boolean {
  const token = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return token === 'unknown' || token === 'unavailable' || token === 'stale' || token === 'partial';
}

function terrainHasUnavailableState(terrainRisk: TerrainRiskV1Result): boolean {
  return isUnavailableLike(terrainRisk.dataConfidence.state) ||
    isUnavailableLike(terrainRisk.weather.status) ||
    isUnavailableLike(terrainRisk.daylight.status) ||
    isUnavailableLike(terrainRisk.remoteness.status) ||
    isUnavailableLike(terrainRisk.elevation.status) ||
    terrainRisk.missingDataReasons.length > 0;
}

function campHasUnavailableState(campViability: CampViabilityV1Result): boolean {
  return isUnavailableLike(campViability.dataConfidence.state) ||
    isUnavailableLike(campViability.camp.sourceStatus) ||
    isUnavailableLike(campViability.camp.legalStatus) ||
    campViability.missingDataReasons.length > 0;
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
  const color = statusColor(item.status);
  return (
    <View style={styles.statusRow}>
      <View style={styles.statusCopy}>
        <Text style={styles.statusLabel}>{label}</Text>
        <Text style={styles.statusSource} numberOfLines={1}>{item.source}</Text>
      </View>
      <Text style={[styles.statusValue, { color }]}>{item.label}</Text>
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
    <View style={styles.sectionCard} testID="active-trip-terrain-risk">
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Terrain Risk</Text>
          <Text style={styles.sectionMeta}>Terrain Risk v1</Text>
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
        <Text style={styles.mutedText}>No terrain risk drivers available.</Text>
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
    <View style={styles.sectionCard} testID="active-trip-camp-viability">
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Camp Viability</Text>
          <Text style={styles.sectionMeta}>Camp Viability v1</Text>
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
        <Text style={styles.mutedText}>No camp viability drivers available.</Text>
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

function EmptyState({ message, onOpenTripBuilder }: { message: string | null; onOpenTripBuilder: () => void }) {
  return (
    <View style={styles.emptyCard} testID="active-trip-empty">
      <Ionicons name="navigate-circle-outline" size={28} color={TACTICAL.textMuted} />
      <Text style={styles.emptyTitle}>No Active Trip</Text>
      <Text style={styles.emptyText}>
        {message ?? 'Start from a Trip Builder itinerary to create a local Active Trip snapshot.'}
      </Text>
      <TouchableOpacity
        style={styles.primaryButton}
        activeOpacity={0.84}
        onPress={onOpenTripBuilder}
        accessibilityRole="button"
        accessibilityLabel="Open Trip Builder"
      >
        <Text style={styles.primaryButtonText}>Open Trip Builder</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ActiveTripScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomClearance = getShellBottomClearance(insets.bottom, 8);
  const [snapshot, setSnapshot] = useState<ActiveTripModeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    activeTripModeStore.waitForHydration()
      .then(() => {
        if (!mounted) return;
        setSnapshot(activeTripModeStore.getRecovered());
      })
      .catch(() => {
        if (!mounted) return;
        setMessage('Active Trip snapshot could not be loaded from local storage.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const warnings = useMemo(() => snapshot?.warnings.slice(0, 5) ?? [], [snapshot]);
  const terrainRisk = useMemo(
    () => snapshot ? evaluateTerrainRiskForActiveTrip(snapshot) : null,
    [snapshot],
  );
  const campViability = useMemo(
    () => snapshot ? evaluateCampViabilityForActiveTrip(snapshot, terrainRisk) : null,
    [snapshot, terrainRisk],
  );

  useEffect(() => {
    if (!snapshot || !terrainRisk) return;
    void recordBadgeIdentitySafeSignal({ signalId: 'terrain_risk_evaluated', source: 'active_trip_screen', sourceQuality: terrainRisk.dataConfidence.state, occurredAt: snapshot.updatedAt }).catch(() => null);
    if (terrainHasUnavailableState(terrainRisk)) {
      void recordBadgeIdentitySafeSignal({ signalId: 'unavailable_state_handled', source: 'active_trip_screen', sourceQuality: terrainRisk.dataConfidence.state, occurredAt: snapshot.updatedAt }).catch(() => null);
    }
  }, [snapshot, terrainRisk]);

  useEffect(() => {
    if (!snapshot || !campViability) return;
    void recordBadgeIdentitySafeSignal({ signalId: 'camp_viability_evaluated', source: 'active_trip_screen', sourceQuality: campViability.dataConfidence.state, occurredAt: snapshot.updatedAt }).catch(() => null);
    if (campHasUnavailableState(campViability)) {
      void recordBadgeIdentitySafeSignal({ signalId: 'unavailable_state_handled', source: 'active_trip_screen', sourceQuality: campViability.dataConfidence.state, occurredAt: snapshot.updatedAt }).catch(() => null);
    }
  }, [snapshot, campViability]);

  const handleStopTrip = useCallback(async () => {
    setStopping(true);
    try {
      activeTripModeStore.stop();
      await activeTripModeStore.flush();
      setSnapshot(null);
      setMessage('Active Trip stopped. Saved itineraries, Fleet data, route catalog, and telemetry state were not changed.');
    } finally {
      setStopping(false);
    }
  }, []);

  const handleOpenTripBuilder = useCallback(() => {
    router.push('/explore-trip-builder');
  }, [router]);

  const handleOpenIncidentPacket = useCallback(() => {
    router.push('/offline-incident-packet');
  }, [router]);

  if (loading) {
    return (
      <TopoBackground>
        <View style={[styles.safeContainer, { paddingBottom: bottomClearance }]}>
          <Header title="Explore" />
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={TACTICAL.amber} />
            <Text style={styles.loadingText}>Loading Active Trip snapshot...</Text>
          </View>
        </View>
      </TopoBackground>
    );
  }

  return (
    <TopoBackground>
      <View style={[styles.safeContainer, { paddingBottom: bottomClearance }]} testID="active-trip-screen">
        <Header title="Explore" />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {!snapshot ? (
            <EmptyState message={message} onOpenTripBuilder={handleOpenTripBuilder} />
          ) : (
            <>
              <View style={styles.heroCard}>
                <View style={styles.heroIcon}>
                  <Ionicons name="navigate-circle-outline" size={18} color={TACTICAL.amber} />
                </View>
                <View style={styles.heroCopy}>
                  <Text style={styles.eyebrow}>ACTIVE TRIP</Text>
                  <Text style={styles.heroTitle} numberOfLines={2}>{snapshot.route.name ?? 'Unnamed trip'}</Text>
                  <Text style={styles.heroText} numberOfLines={2}>
                    {snapshot.freshness.label}
                  </Text>
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Trip Confidence</Text>
                    <Text style={styles.sectionMeta}>Route Confidence Engine v1</Text>
                  </View>
                  <View style={[styles.confidenceBadge, { borderColor: confidenceColor(snapshot.routeConfidence.category) + '55' }]}>
                    <Text style={[styles.confidenceText, { color: confidenceColor(snapshot.routeConfidence.category) }]}>
                      {snapshot.routeConfidence.label}
                    </Text>
                    <Text style={styles.confidenceScore}>
                      {snapshot.routeConfidence.score != null ? `${snapshot.routeConfidence.score}` : '--'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.recommendedAction}>
                  Recommended Action: {snapshot.recommendedAction.label}
                </Text>
                {warnings.length > 0 ? (
                  <View style={styles.warningList}>
                    {warnings.map((warning) => (
                      <Text key={warning} style={styles.warningText}>- {warning}</Text>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.mutedText}>No extra warnings in the stored snapshot.</Text>
                )}
              </View>

              {terrainRisk ? <TerrainRiskCard terrainRisk={terrainRisk} /> : null}
              {campViability ? <CampViabilityCard campViability={campViability} /> : null}

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Snapshot</Text>
                  <Text style={styles.sectionMeta}>{snapshot.status.toUpperCase()}</Text>
                </View>
                <View style={styles.metricGrid}>
                  <Metric label="Started" value={formatDateTime(snapshot.startedAt)} />
                  <Metric label="Freshness" value={snapshot.freshness.state.toUpperCase()} />
                  <Metric label="Vehicle" value={snapshot.vehicle.label} />
                  <Metric label="Last Location" value={snapshot.lastLocation.label} />
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Route</Text>
                  <Text style={styles.sectionMeta}>{snapshot.route.authorityStatus}</Text>
                </View>
                <View style={styles.metricGrid}>
                  <Metric label="Authority" value={snapshot.route.authorityLabel} />
                  <Metric label="Geometry" value={snapshot.route.geometryStatus ?? 'unknown'} />
                  <Metric label="Trailhead" value={formatCoordinate(snapshot.route.trailheadCoordinate)} />
                  <Metric label="Distance" value={snapshot.route.distanceMiles != null ? `${snapshot.route.distanceMiles} mi` : 'Unknown'} />
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Logistics</Text>
                  <Text style={styles.sectionMeta}>READ ONLY</Text>
                </View>
                <StatusRow label="Refuel" item={snapshot.logistics.refuel} />
                <StatusRow label="Resupply" item={snapshot.logistics.resupply} />
                <StatusRow label="Camp" item={snapshot.logistics.camp} />
                <StatusRow label="Bailout" item={snapshot.logistics.bailout} />
              </View>

              <TouchableOpacity
                style={styles.secondaryButton}
                activeOpacity={0.84}
                onPress={handleOpenIncidentPacket}
                accessibilityRole="button"
                accessibilityLabel="Open Offline Incident Packet"
                testID="active-trip-open-incident-packet"
              >
                <Ionicons name="document-text-outline" size={15} color={TACTICAL.amber} />
                <Text style={styles.secondaryButtonText}>Offline Incident Packet</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.stopButton, stopping && styles.disabledButton]}
                activeOpacity={stopping ? 1 : 0.84}
                disabled={stopping}
                onPress={handleStopTrip}
                accessibilityRole="button"
                accessibilityLabel="Stop Active Trip"
                testID="active-trip-stop"
              >
                {stopping ? <ActivityIndicator size="small" color="#081014" /> : <Ionicons name="stop-circle-outline" size={15} color="#081014" />}
                <Text style={styles.stopButtonText}>{stopping ? 'Stopping' : 'Stop Active Trip'}</Text>
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
    minHeight: 82,
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
  stopButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  stopButtonText: {
    color: '#081014',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  disabledButton: { opacity: 0.58 },
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
  secondaryButton: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '45',
    backgroundColor: TACTICAL.amber + '10',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButtonText: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

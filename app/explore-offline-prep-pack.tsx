import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Header from '../components/Header';
import { SafeIcon as Ionicons } from '../components/SafeIcon';
import TopoBackground from '../components/TopoBackground';
import { ECS, TACTICAL } from '../lib/theme';
import { getShellBottomClearance } from '../lib/shellLayout';
import { hapticMicro } from '../lib/haptics';
import { loadOpportunitiesWithCompatibility } from '../lib/discoverEngine';
import { buildProfileFromSpecs } from '../lib/rigCompatibilityEngine';
import { extractExploreRouteCampMarkers } from '../lib/exploreRouteCampHandoff';
import {
  buildExploreRouteReadinessAssessment,
  getExploreRouteReadinessSummary,
} from '../lib/readiness/exploreRouteReadiness';
import {
  buildOfflinePrepPackManifest,
  clearOfflinePrepPackHandoff,
  loadOfflinePrepPackHandoff,
  type OfflinePrepPackInput,
  type OfflinePrepPackItem,
  type OfflinePrepPackManifest,
  type OfflinePrepPackStatus,
} from '../lib/offlinePrepPack';
import { loadExplorePlanningRouteContext } from '../lib/explore/explorePlanningRouteContextStore';
import type {
  CampCandidate,
  TripBuilderReadinessReference,
  TripBuilderRouteInput,
  TripBuilderVehicleProfile,
} from '../lib/tripBuilder';

function routeId(route: TripBuilderRouteInput): string {
  return String(route.id ?? route.name ?? route.title ?? 'selected-route');
}

function routeName(route: TripBuilderRouteInput): string {
  return String(route.name ?? route.title ?? route.id ?? 'Selected Route');
}

function formatMiles(value: unknown): string {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : null;
  return numeric == null ? 'Unknown' : `${numeric.toFixed(numeric >= 10 ? 0 : 1)} mi`;
}

function routeDistance(route: TripBuilderRouteInput): number | null {
  const value = route.distanceMiles ?? route.total_distance_miles ?? route.distance_mi;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function routeToCampCandidates(route: TripBuilderRouteInput | null): CampCandidate[] {
  try {
    return extractExploreRouteCampMarkers(route as any).map((marker) => ({
      id: marker.id,
      name: marker.title,
      location: { latitude: marker.latitude, longitude: marker.longitude },
      score: marker.score,
      legalConfidence: marker.confidence,
      accessConfidence: marker.confidence,
      source: marker.source ?? 'explore_route_camp_marker',
      notes: [marker.subtitle],
    }));
  } catch {
    return [];
  }
}

function buildReadinessReference(route: TripBuilderRouteInput | null): TripBuilderReadinessReference | null {
  if (!route) return null;
  try {
    const assessment = buildExploreRouteReadinessAssessment(route as any, { hasVehicle: false });
    const summary = getExploreRouteReadinessSummary(assessment, route as any, { hasVehicle: false });
    return {
      status: assessment.status,
      score: assessment.overallScore,
      summary,
      topConcern: summary.concern,
      source: 'explore_route_readiness',
      updatedAt: assessment.updatedAt,
    };
  } catch {
    return null;
  }
}

function buildVehicleProfile(): TripBuilderVehicleProfile | null {
  const profile = buildProfileFromSpecs();
  if (!profile) return null;
  return {
    id: profile.vehicleId,
    label: profile.vehicleName,
    vehicleType: profile.vehicleType,
    rangeMiles: profile.fuel_range_miles,
    tireSizeInches: profile.tireSizeInches,
    confidence: 'medium',
    source: 'fleet_profile',
  };
}

function statusColor(status: OfflinePrepPackStatus, availability?: string): string {
  if (status === 'ready' || availability === 'already_cached') return '#66BB6A';
  if (status === 'failed') return '#EF5350';
  if (status === 'unavailable') return TACTICAL.textMuted;
  if (status === 'downloading' || status === 'preparing') return '#64B5F6';
  return TACTICAL.amber;
}

function statusLabel(item: OfflinePrepPackItem): string {
  if (item.availability === 'already_cached') return 'Cached';
  if (item.availability === 'pending_download') return 'Download needed';
  if (item.status === 'ready') return 'Ready';
  if (item.status === 'failed') return 'Failed';
  if (item.status === 'unavailable') return 'Unavailable';
  if (item.status === 'downloading') return 'Downloading';
  if (item.status === 'preparing') return 'Preparing';
  return 'Not started';
}

function progressStatusLabel(status: OfflinePrepPackStatus): string {
  if (status === 'partially_ready') return 'PARTIAL';
  if (status === 'unavailable') return 'DATA UNAVAILABLE';
  return status.replace('_', ' ').toUpperCase();
}

function manifestStateCopy(status: OfflinePrepPackStatus): { title: string; message: string } {
  switch (status) {
    case 'ready':
      return {
        title: 'Offline pack ready',
        message: 'Available route essentials are ready for review.',
      };
    case 'partially_ready':
      return {
        title: 'Offline pack partially ready',
        message: 'Some route essentials are ready. Items without a known source are marked below.',
      };
    case 'failed':
      return {
        title: 'Offline pack needs review',
        message: 'One or more items could not be prepared. Review the item list and retry when the source is available.',
      };
    case 'unavailable':
      return {
        title: 'Offline pack unavailable',
        message: 'Route data or offline infrastructure is unavailable for this pack.',
      };
    default:
      return {
        title: 'Offline pack staged',
        message: 'Review the manifest before preparing. Downloads are marked ready only when confirmed by ECS infrastructure.',
      };
  }
}

function recommendationReason(input: OfflinePrepPackInput | null, manifest: OfflinePrepPackManifest | null): string {
  const route = input?.route;
  const smartWarning = input?.smartResupplyPlan?.warnings?.[0]?.message ?? input?.tripPlan?.smartResupplyPlan?.warnings?.[0]?.message;
  if (smartWarning) return smartWarning;
  if (input?.tripPlan?.primaryCampCandidate) return 'This trip includes camp planning. Save route line, camps, and fallback references before departure.';
  const remoteness = typeof route?.remotenessScore === 'number' ? route.remotenessScore : null;
  if (remoteness != null && remoteness >= 7) return 'Route remoteness is elevated. Save route geometry, exits, and support references before departure.';
  const distance = route ? routeDistance(route) : null;
  if (distance != null && distance >= 50) return 'Route length suggests saving offline route essentials before travel.';
  const offlineMap = manifest?.items.find((item) => item.type === 'offline_map');
  if (offlineMap?.status === 'unavailable') return 'Offline map download is not available yet. Route and export items can still be reviewed.';
  return 'Save route essentials for low-service travel.';
}

function RouteSelectionCard({
  route,
  selected,
  onPress,
}: {
  route: TripBuilderRouteInput;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.routeOption, selected && styles.routeOptionSelected]}
      activeOpacity={0.82}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${routeName(route)}`}
      testID={`offline-prep-route-option-${routeId(route)}`}
    >
      <View style={styles.routeOptionIcon}>
        <Ionicons name={selected ? 'checkmark-circle' : 'map-outline'} size={15} color={selected ? TACTICAL.amber : TACTICAL.textMuted} />
      </View>
      <View style={styles.routeOptionCopy}>
        <Text style={styles.routeOptionTitle} numberOfLines={1}>{routeName(route)}</Text>
        <Text style={styles.routeOptionMeta} numberOfLines={1}>
          {String(route.region ?? 'Unknown region')} | {formatMiles(routeDistance(route))}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function PrepItemRow({ item }: { item: OfflinePrepPackItem }) {
  const color = statusColor(item.status, item.availability);
  return (
    <View style={styles.itemRow} accessibilityLabel={`${item.label} ${statusLabel(item)}`} testID={`offline-prep-item-${item.type}`}>
      <View style={[styles.itemIcon, { borderColor: color + '55', backgroundColor: color + '12' }]}>
        <Ionicons name={item.status === 'ready' ? 'checkmark' : item.status === 'unavailable' ? 'remove' : 'download-outline'} size={13} color={color} />
      </View>
      <View style={styles.itemCopy}>
        <View style={styles.itemTitleRow}>
          <Text style={styles.itemTitle}>{item.label}</Text>
          <Text style={[styles.itemStatus, { color }]}>{statusLabel(item).toUpperCase()}</Text>
        </View>
        <Text style={styles.itemSummary}>{item.summary}</Text>
        <Text style={styles.itemMeta}>
          {item.source}
          {item.count != null ? ` | ${item.count} item${item.count === 1 ? '' : 's'}` : ''}
          {item.estimatedSizeMB != null ? ` | ${item.estimatedSizeMB} MB` : ''}
        </Text>
      </View>
    </View>
  );
}

export default function ExploreOfflinePrepPackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ routeId?: string }>();
  const insets = useSafeAreaInsets();
  const bottomClearance = getShellBottomClearance(insets.bottom, 8);
  const [routes, setRoutes] = useState<TripBuilderRouteInput[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [handoffInput, setHandoffInput] = useState<OfflinePrepPackInput | null>(null);
  const [manifest, setManifest] = useState<OfflinePrepPackManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [prepareAttempted, setPrepareAttempted] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const handoff = loadOfflinePrepPackHandoff();
      const exploreContext = loadExplorePlanningRouteContext();
      const suggestedRoutes = (exploreContext?.routes?.length
        ? exploreContext.routes
        : loadOpportunitiesWithCompatibility(null).opportunities
      ).slice(0, 8) as unknown as TripBuilderRouteInput[];
      const routeMap = new Map<string, TripBuilderRouteInput>();
      if (handoff?.input?.route) routeMap.set(routeId(handoff.input.route), handoff.input.route);
      suggestedRoutes.forEach((route) => routeMap.set(routeId(route), route));
      const nextRoutes = Array.from(routeMap.values());
      setRoutes(nextRoutes);
      setHandoffInput(handoff?.input ?? null);
      const requestedRouteId = params.routeId ? String(params.routeId) : null;
      setSelectedRouteId(requestedRouteId ?? (handoff?.input?.route ? routeId(handoff.input.route) : null));
      setError(null);
    } catch {
      setError('Offline Prep Pack could not load route options.');
    } finally {
      setLoading(false);
    }
  }, [params.routeId]);

  const selectedRoute = useMemo(
    () => routes.find((route) => routeId(route) === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );

  const selectedInput = useMemo<OfflinePrepPackInput | null>(() => {
    if (!selectedRoute) return null;
    if (handoffInput && routeId(handoffInput.route) === routeId(selectedRoute)) return handoffInput;
    return {
      route: selectedRoute,
      vehicleProfile: buildVehicleProfile(),
      readiness: buildReadinessReference(selectedRoute),
      campsiteCandidates: routeToCampCandidates(selectedRoute),
    };
  }, [handoffInput, selectedRoute]);

  useEffect(() => {
    if (!selectedInput) {
      setManifest(null);
      return;
    }
    try {
      setManifest(buildOfflinePrepPackManifest(selectedInput));
      setError(null);
      setPrepareAttempted(false);
      setActionMessage(null);
    } catch {
      setManifest(null);
      setError('Offline Prep Pack could not build a manifest from the selected route.');
    }
  }, [selectedInput]);

  const reason = useMemo(() => recommendationReason(selectedInput, manifest), [selectedInput, manifest]);
  const stateCopy = manifestStateCopy(manifest?.progress.status ?? 'not_started');
  const routeSummary = selectedRoute
    ? `${String(selectedRoute.region ?? 'Unknown region')} | ${formatMiles(routeDistance(selectedRoute))}`
    : 'No route selected';
  const gpxReady = manifest?.items.some((item) => item.type === 'gpx_export' && item.status === 'ready') ?? false;
  const tripSheetReady = manifest?.items.some((item) => item.type === 'trip_sheet' && item.status === 'ready') ?? false;

  const handleRouteSelect = (route: TripBuilderRouteInput) => {
    hapticMicro();
    setSelectedRouteId(routeId(route));
    setHandoffInput(null);
  };

  const handlePrepare = () => {
    hapticMicro();
    if (!manifest) {
      setError('Select a route before preparing an Offline Prep Pack.');
      return;
    }
    setPrepareAttempted(true);
    setError(null);
    setActionMessage(manifestStateCopy(manifest.progress.status).message);
  };

  const handleRetry = () => {
    if (!selectedInput) return;
    hapticMicro();
    setManifest(buildOfflinePrepPackManifest(selectedInput));
    setPrepareAttempted(false);
    setActionMessage('Offline Prep Pack manifest refreshed.');
  };

  const handleBackToSuggestedRoutes = () => {
    clearOfflinePrepPackHandoff();
    router.push('/discover');
  };

  const handleSecondaryAction = (label: string) => {
    hapticMicro();
    setActionMessage(`${label} is listed in the manifest. File/share support will use the existing export pipeline when connected.`);
  };

  return (
    <TopoBackground>
      <View style={[styles.safeContainer, { paddingBottom: bottomClearance }]}>
        <Header title="Explore" />
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          testID="offline-prep-pack-screen"
        >
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Ionicons name="download-outline" size={18} color={TACTICAL.amber} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>EXPLORE PLANNING</Text>
              <Text style={styles.heroTitle}>Offline Prep Pack</Text>
              <Text style={styles.heroText}>
                Save route essentials for low-service travel. Unavailable items stay clearly marked.
              </Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={TACTICAL.amber} />
              <Text style={styles.stateText}>Loading route options...</Text>
            </View>
          ) : routes.length === 0 ? (
            <View style={styles.stateCard} testID="offline-prep-empty-state">
              <Ionicons name="map-outline" size={20} color={TACTICAL.textMuted} />
              <Text style={styles.stateTitle}>No routes ready for offline prep</Text>
              <Text style={styles.stateText}>Open Suggested Routes, then select a route to prepare an Offline Prep Pack.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={handleBackToSuggestedRoutes} accessibilityRole="button">
                <Text style={styles.primaryButtonText}>Suggested Routes</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Selected Route</Text>
                  <Text style={styles.sectionMeta}>{selectedRoute ? 'READY' : 'SELECT'}</Text>
                </View>
                {selectedRoute ? (
                  <View style={styles.selectedRouteSummary} testID="offline-prep-selected-route">
                    <Text style={styles.selectedRouteTitle}>{routeName(selectedRoute)}</Text>
                    <Text style={styles.selectedRouteMeta}>{routeSummary}</Text>
                    <Text style={styles.reasonText}>{reason}</Text>
                  </View>
                ) : null}
                <View style={styles.routeList}>
                  {routes.slice(0, 6).map((route) => (
                    <RouteSelectionCard
                      key={routeId(route)}
                      route={route}
                      selected={routeId(route) === selectedRouteId}
                      onPress={() => handleRouteSelect(route)}
                    />
                  ))}
                </View>
              </View>

              {manifest ? (
                <View style={styles.sectionCard} testID="offline-prep-manifest">
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{stateCopy.title}</Text>
                    <Text style={[styles.sectionMeta, { color: statusColor(manifest.progress.status) }]}>
                      {progressStatusLabel(manifest.progress.status)}
                    </Text>
                  </View>
                  <Text style={styles.stateTextLeft}>{stateCopy.message}</Text>
                  <View style={styles.progressTrack} accessibilityLabel={`Offline Prep Pack ${manifest.progress.percent} percent ready`}>
                    <View style={[styles.progressFill, { width: `${manifest.progress.percent}%` }]} />
                  </View>
                  <Text style={styles.progressMeta}>
                    {manifest.progress.readyItems}/{manifest.progress.totalItems} ready | {manifest.progress.unavailableItems} unavailable | {manifest.progress.failedItems} need review
                  </Text>

                  <View style={styles.itemList}>
                    {manifest.items.map((item) => <PrepItemRow key={item.id} item={item} />)}
                  </View>

                  {manifest.errors.length > 0 ? (
                    <View style={styles.errorList} testID="offline-prep-unavailable-state">
                      <Text style={styles.resultTitle}>Unavailable Items</Text>
                      {manifest.errors.slice(0, 4).map((entry) => (
                        <Text key={entry.id} style={styles.errorText}>- {entry.message}</Text>
                      ))}
                      <TouchableOpacity
                        style={styles.retryButton}
                        activeOpacity={0.84}
                        onPress={handleRetry}
                        accessibilityRole="button"
                        accessibilityLabel="Retry Offline Prep Pack manifest"
                        testID="offline-prep-retry"
                      >
                        <Ionicons name="refresh-outline" size={13} color={TACTICAL.amber} />
                        <Text style={styles.retryButtonText}>Retry Manifest</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.primaryButton, !manifest && styles.primaryButtonDisabled]}
                    activeOpacity={manifest ? 0.84 : 1}
                    disabled={!manifest}
                    onPress={handlePrepare}
                    accessibilityRole="button"
                    accessibilityLabel="Prepare Offline Pack"
                    testID="offline-prep-prepare"
                  >
                    <Ionicons name="download-outline" size={14} color="#081014" />
                    <Text style={styles.primaryButtonText}>Prepare Offline Pack</Text>
                  </TouchableOpacity>

                  <View style={styles.secondaryActions}>
                    {gpxReady ? (
                      <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={() => handleSecondaryAction('GPX export')}
                        accessibilityRole="button"
                        accessibilityLabel="Export GPX"
                        testID="offline-prep-export-gpx"
                      >
                        <Text style={styles.secondaryButtonText}>Export GPX</Text>
                      </TouchableOpacity>
                    ) : null}
                    {tripSheetReady ? (
                      <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={() => handleSecondaryAction('Trip sheet')}
                        accessibilityRole="button"
                        accessibilityLabel="Save Trip Sheet"
                        testID="offline-prep-save-trip-sheet"
                      >
                        <Text style={styles.secondaryButtonText}>Save Trip Sheet</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {prepareAttempted || actionMessage ? (
                    <View style={styles.noticeCard} testID="offline-prep-prepare-result">
                      <Ionicons name={manifest.progress.status === 'failed' ? 'alert-circle-outline' : 'information-circle-outline'} size={13} color={statusColor(manifest.progress.status)} />
                      <Text style={styles.noticeText}>{actionMessage ?? stateCopy.message}</Text>
                    </View>
                  ) : null}
                </View>
              ) : error ? (
                <View style={styles.errorCard} testID="offline-prep-failed-state">
                  <Ionicons name="warning-outline" size={14} color="#EF5350" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </TopoBackground>
  );
}

const styles = StyleSheet.create({
  safeContainer: { flex: 1 },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 24, gap: 12 },
  heroCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '28',
    backgroundColor: ECS.bgPanel,
    padding: 14,
  },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '38',
    backgroundColor: TACTICAL.amber + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1 },
  eyebrow: { color: TACTICAL.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1.6 },
  heroTitle: { color: TACTICAL.text, fontSize: 22, lineHeight: 26, fontWeight: '900', marginTop: 2 },
  heroText: { color: TACTICAL.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 4 },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    padding: 12,
    gap: 10,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { flex: 1, color: TACTICAL.text, fontSize: 13, fontWeight: '900' },
  sectionMeta: { color: TACTICAL.amber, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  selectedRouteSummary: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: TACTICAL.amber + '09',
    padding: 10,
    gap: 4,
  },
  selectedRouteTitle: { color: TACTICAL.text, fontSize: 13, fontWeight: '900' },
  selectedRouteMeta: { color: TACTICAL.textMuted, fontSize: 10, fontWeight: '700' },
  reasonText: { color: TACTICAL.amber, fontSize: 10, lineHeight: 14, fontWeight: '800' },
  routeList: { gap: 7 },
  routeOption: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 9,
  },
  routeOptionSelected: { borderColor: TACTICAL.amber + '60', backgroundColor: TACTICAL.amber + '10' },
  routeOptionIcon: { width: 25, height: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)' },
  routeOptionCopy: { flex: 1 },
  routeOptionTitle: { color: TACTICAL.text, fontSize: 11, fontWeight: '900' },
  routeOptionMeta: { color: TACTICAL.textMuted, fontSize: 9, fontWeight: '700', marginTop: 2 },
  stateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    padding: 18,
  },
  stateTitle: { color: TACTICAL.text, fontSize: 14, fontWeight: '900' },
  stateText: { color: TACTICAL.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  stateTextLeft: { color: TACTICAL.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: TACTICAL.amber },
  progressMeta: { color: TACTICAL.textMuted, fontSize: 9, fontWeight: '800' },
  itemList: { gap: 8 },
  itemRow: {
    flexDirection: 'row',
    gap: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.16)',
    padding: 9,
  },
  itemIcon: { width: 26, height: 26, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1, gap: 3 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  itemTitle: { flex: 1, color: TACTICAL.text, fontSize: 11, fontWeight: '900' },
  itemStatus: { fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  itemSummary: { color: TACTICAL.textMuted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  itemMeta: { color: TACTICAL.textMuted, opacity: 0.78, fontSize: 8, fontWeight: '800' },
  primaryButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: '#081014', fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryButton: {
    minHeight: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '0D',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  secondaryButtonText: { color: TACTICAL.amber, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  noticeCard: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '26',
    backgroundColor: TACTICAL.amber + '08',
    padding: 10,
  },
  noticeText: { flex: 1, color: TACTICAL.textMuted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  errorList: { gap: 7, borderRadius: 12, borderWidth: 1, borderColor: '#EF535033', backgroundColor: '#EF53500D', padding: 10 },
  resultTitle: { color: TACTICAL.text, fontSize: 11, fontWeight: '900' },
  errorCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EF535033',
    backgroundColor: '#EF53500D',
    padding: 10,
  },
  errorText: { flex: 1, color: '#EF9A9A', fontSize: 10, lineHeight: 14, fontWeight: '800' },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
  },
  retryButtonText: { color: TACTICAL.amber, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
});

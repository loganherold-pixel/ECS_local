import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { fsGetInfo } from '../../lib/fsCompat';
import ExpeditionReplayDebriefPanel from './ExpeditionReplayDebriefPanel';
import ExpeditionNotableMomentsTimeline from './ExpeditionNotableMomentsTimeline';
import { TripLearningSummaryCard } from '../expedition/TripLearningSummaryCard';
import {
  BadgeGrid,
  BadgeUnlockSummary,
} from './ExpeditionBadgeVisuals';
import { ExpeditionBadgeCatalogView } from './ExpeditionBadgeCatalogView';
import {
  dismissInsight,
  downloadExpeditionReport,
  generateExpeditionReport,
  getBadgeProgress,
  getCompletedTrips,
  getBadgesForTrip,
  getCurrentPersonalRecords,
  getCurrentInsights,
  getMostRecentReports,
  getRecordsForTrip,
  getTripById,
  getUnlockedBadges,
  materializeCompletedGuidanceSummary,
  refreshExpeditionInsights,
  shareExpeditionReport,
  type ExpeditionBadge,
  type ExpeditionInsight,
  type ExpeditionReport,
  type ExpeditionReportExportStatus,
  type ExpeditionTripRecord,
  type ExpeditionTripSummary,
  type PersonalExpeditionRecord,
} from '../../lib/expedition';
import {
  buildExpeditionDebriefRecordFromTripRecord,
  isExpeditionReplayDebriefFeatureEnabled,
} from '../../lib/debrief/expeditionDebriefRecord';
import type { IncidentCoordinate } from '../../lib/types/incidentRecovery';
import { incrementECSPerformanceCounter } from '../../lib/performance/ecsPerformanceDiagnostics';

type ExpeditionTabProps = {
  hasActiveRoute: boolean;
  teamMemberCount: number;
  campCount: number;
  routeCompleted: boolean;
  routeLifecycleState?: string;
  expeditionId?: string;
  routeLabel?: string;
  completedExpeditionRecord?: unknown;
  ecsOnline?: boolean;
  gpsLocation?: IncidentCoordinate | null;
  gpsElevationFt?: number | null;
};

const ExpeditionRecapMap = React.lazy(() => import('./ExpeditionRecapMap'));

type ExpeditionHubStats = {
  totalExpeditions: number;
  totalMiles: number;
  highestElevationFt: number;
  totalHours: number;
};

type ArchiveLifetimeStats = {
  totalCompletedExpeditions: number;
  totalMiles: number;
  totalHours: number;
  highestElevationFt: number;
  totalBadgesEarned: number;
  totalNotableMoments: number;
};

type ArchiveRecordHighlight = {
  label: string;
  value: string;
  tripTitle: string;
};

type ReportFileInfo = {
  exists: boolean;
  size: number | null;
};

export default function ExpeditionTab({
  hasActiveRoute,
  teamMemberCount,
  campCount,
  routeCompleted,
  routeLifecycleState,
  expeditionId,
  routeLabel,
  completedExpeditionRecord,
  ecsOnline = true,
  gpsLocation,
  gpsElevationFt,
}: ExpeditionTabProps) {
  const [completedTrips, setCompletedTrips] = useState<ExpeditionTripSummary[]>([]);
  const [unlockedBadges, setUnlockedBadges] = useState<ExpeditionBadge[]>([]);
  const [badgeProgress, setBadgeProgress] = useState<ExpeditionBadge[]>([]);
  const [expeditionInsights, setExpeditionInsights] = useState<ExpeditionInsight[]>([]);
  const [personalRecords, setPersonalRecords] = useState<PersonalExpeditionRecord[]>([]);
  const [expeditionReports, setExpeditionReports] = useState<ExpeditionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<ExpeditionTripRecord | null>(null);
  const [selectedTripBadges, setSelectedTripBadges] = useState<ExpeditionBadge[]>([]);
  const [selectedTripRecords, setSelectedTripRecords] = useState<PersonalExpeditionRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showBadgeCatalogView, setShowBadgeCatalogView] = useState(false);
  const [showArchiveView, setShowArchiveView] = useState(false);
  const [showReportsView, setShowReportsView] = useState(false);
  const [newBadgeUnlocks, setNewBadgeUnlocks] = useState<ExpeditionBadge[]>([]);
  const materializedGuidanceSignaturesRef = useRef<Set<string>>(new Set());
  const completedTripsLoadFlightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const loadCompletedTrips = useCallback((): Promise<void> => {
    if (completedTripsLoadFlightRef.current) {
      incrementECSPerformanceCounter('dashboard_stable_grid', 'expedition_hub_hydration_join');
      return completedTripsLoadFlightRef.current;
    }

    setLoading(true);
    const flight = (async () => {
      const trips = await getCompletedTrips().catch(() => []);
      const [badges, progress, currentInsights, currentRecords, recentReports] = await Promise.all([
        getUnlockedBadges().catch(() => []),
        getBadgeProgress().catch(() => []),
        getCurrentInsights(3).catch(() => []),
        getCurrentPersonalRecords().catch(() => []),
        getMostRecentReports(5).catch(() => []),
      ]);
      const insights = trips.length > 0 && currentInsights.length === 0
        ? await refreshExpeditionInsights().catch(() => [])
        : currentInsights;
      if (!mountedRef.current) return;
      setCompletedTrips(trips);
      setUnlockedBadges(badges);
      setBadgeProgress(progress);
      setExpeditionInsights(insights.slice(0, 3));
      setPersonalRecords(currentRecords.slice(0, 4));
      setExpeditionReports(recentReports);
      setLoading(false);
    })().finally(() => {
      if (completedTripsLoadFlightRef.current === flight) {
        completedTripsLoadFlightRef.current = null;
      }
    });

    completedTripsLoadFlightRef.current = flight;
    return flight;
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadCompletedTrips();
    }, [loadCompletedTrips]),
  );

  useEffect(() => {
    const signature = completedGuidanceMaterializationSignature({
      completedExpeditionRecord,
      routeCompleted,
      routeLifecycleState,
      routeLabel,
    });
    if (!signature || materializedGuidanceSignaturesRef.current.has(signature)) return;

    materializedGuidanceSignaturesRef.current.add(signature);
    let isCurrent = true;

    void (async () => {
      try {
        const result = await materializeCompletedGuidanceSummary({
          completedExpeditionRecord,
          routeCompleted,
          routeLabel,
          gpsElevationFt,
        });
        if (!isCurrent) return;
        if (result.badges.length > 0) {
          setNewBadgeUnlocks(result.badges);
        }
        if (result.trip) {
          await loadCompletedTrips();
        }
      } catch {
        materializedGuidanceSignaturesRef.current.delete(signature);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [
    completedExpeditionRecord,
    gpsElevationFt,
    loadCompletedTrips,
    routeCompleted,
    routeLabel,
    routeLifecycleState,
  ]);

  const stats = useMemo(() => buildHubStats(completedTrips), [completedTrips]);
  const liveHubStats = useMemo(
    () => buildLiveHubStats({
      archivedStats: stats,
      campCount,
      completedExpeditionRecord,
      completedTrips,
      ecsOnline,
      expeditionId,
      gpsElevationFt,
      gpsLocation,
      hasActiveRoute,
      routeCompleted,
      routeLabel,
      routeLifecycleState,
      teamMemberCount,
    }),
    [
      campCount,
      completedExpeditionRecord,
      completedTrips,
      ecsOnline,
      expeditionId,
      gpsElevationFt,
      gpsLocation,
      hasActiveRoute,
      routeCompleted,
      routeLabel,
      routeLifecycleState,
      stats,
      teamMemberCount,
    ],
  );
  const recentTrips = useMemo(() => completedTrips.slice(0, 3), [completedTrips]);
  const hasCompletedTrips = completedTrips.length > 0;
  const hasUnlockedBadges = unlockedBadges.some((badge) => !!badge.unlockedAt);
  const hasReports = expeditionReports.length > 0;

  const openTripDetail = useCallback(async (tripId: string) => {
    setDetailLoading(true);
    try {
      const trip = await getTripById(tripId);
      const [badges, records] = await Promise.all([
        getBadgesForTrip(tripId).catch(() => []),
        getRecordsForTrip(tripId).catch(() => []),
      ]);
      setSelectedTrip(trip);
      setSelectedTripBadges(badges);
      setSelectedTripRecords(records);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleLongPressTrip = useCallback((_tripId: string) => {
    // TODO Expedition Hub: connect long-press actions to archive, rename, and sharing workflows.
  }, []);

  const handleDismissInsight = useCallback(async (insightId: string) => {
    setExpeditionInsights((current) => current.filter((insight) => insight.id !== insightId));
    await dismissInsight(insightId).catch(() => null);
  }, []);

  if (showArchiveView) {
    return (
      <ExpeditionArchiveView
        trips={completedTrips}
        badges={unlockedBadges}
        onBack={() => setShowArchiveView(false)}
        onOpenTrip={(tripId) => {
          setShowArchiveView(false);
          void openTripDetail(tripId);
        }}
      />
    );
  }

  if (showReportsView) {
    return (
      <ExpeditionReportsView
        reports={expeditionReports}
        onBack={() => setShowReportsView(false)}
      />
    );
  }

  if (showBadgeCatalogView) {
    return (
      <ExpeditionBadgeCatalogView
        badges={unlockedBadges}
        badgeProgress={badgeProgress}
        onBack={() => setShowBadgeCatalogView(false)}
      />
    );
  }

  if (selectedTrip) {
    return (
      <ExpeditionDetailView
        trip={selectedTrip}
        earnedBadges={selectedTripBadges}
        recordsSet={selectedTripRecords}
        onBack={() => {
          setSelectedTrip(null);
          setSelectedTripBadges([]);
          setSelectedTripRecords([]);
          void loadCompletedTrips();
        }}
      />
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.surface}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="map-outline" size={18} color={TACTICAL.amber} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Expedition Hub</Text>
            <Text style={styles.subtitle}>
              {liveHubStats.subtitle}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatTile label="Total Expeditions" value={`${liveHubStats.totalExpeditions} ${liveHubStats.totalExpeditions === 1 ? 'Expedition' : 'Expeditions'}`} />
          <StatTile label="Total Miles" value={formatWholeMiles(liveHubStats.totalMiles)} />
          <StatTile label="Highest Elevation" value={formatElevation(liveHubStats.highestElevationFt)} />
          <StatTile label="Hours Logged" value={formatHours(liveHubStats.totalHours)} />
        </View>

        {loading ? (
          <View style={styles.loadingPanel}>
            <ActivityIndicator size="small" color={TACTICAL.amber} />
            <Text style={styles.loadingText}>Loading expedition history...</Text>
          </View>
        ) : completedTrips.length === 0 ? (
          <EmptyHubState />
        ) : (
          <ExpeditionHubSection title="Recent Expeditions" count={completedTrips.length}>
            <View style={styles.tripList}>
              {recentTrips.map((trip) => (
                <ExpeditionTripCard
                  key={trip.id}
                  trip={trip}
                  onPress={() => openTripDetail(trip.id)}
                  onLongPress={() => handleLongPressTrip(trip.id)}
                />
              ))}
            </View>
          </ExpeditionHubSection>
        )}

        {newBadgeUnlocks.length > 0 ? (
          <View style={styles.badgeAchievementNotice}>
            <BadgeUnlockSummary
              badges={newBadgeUnlocks}
              onOpenCollection={() => setShowBadgeCatalogView(true)}
              limit={4}
              actionLabel="View Badges"
              showAction
            />
          </View>
        ) : hasUnlockedBadges ? (
          <BadgeUnlockSummary
            badges={unlockedBadges}
            onOpenCollection={() => setShowBadgeCatalogView(true)}
            limit={3}
            actionLabel="Earned Badges"
            showAction={false}
          />
        ) : null}

        <ExpeditionInsightsSection
          insights={expeditionInsights}
          onDismiss={handleDismissInsight}
        />

        <PersonalRecordsPreview records={personalRecords} />

        <View style={styles.hubActionRow}>
          {hasCompletedTrips ? (
            <HubActionCard
              icon="library-outline"
              label="Expedition Archive"
              onPress={() => setShowArchiveView(true)}
              accessibilityLabel="Open Expedition Archive"
            />
          ) : null}
          <HubActionCard
            icon="ribbon-outline"
            label="Badge Catalog"
            onPress={() => setShowBadgeCatalogView(true)}
            accessibilityLabel="Open Badge Catalog"
          />
          {hasReports ? (
            <HubActionCard
              icon="documents-outline"
              label="Expedition Reports"
              onPress={() => setShowReportsView(true)}
              accessibilityLabel="Open Expedition Reports"
            />
          ) : null}
        </View>

        {detailLoading ? (
          <View style={styles.detailLoadingOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color={TACTICAL.amber} />
          </View>
        ) : null}

        {/* TODO Expedition Hub: add recap map region once map recap rendering exists. */}
        {/* TODO Expedition Hub: add expanded expedition achievements once badge progress rings and artwork exist. */}
        {/* TODO Expedition Hub: add lessons learned once historical insight generation is grounded in saved trips. */}
        {/* TODO Expedition Insights: add insight detail view, personal record cards, seasonal trends, and terrain preference analysis. */}
        {/* TODO Expedition Hub: add expedition exports after export contracts are ready. */}
      </View>

    </ScrollView>
  );
}

function ExpeditionDetailView({
  trip,
  earnedBadges,
  recordsSet,
  onBack,
}: {
  trip: ExpeditionTripRecord;
  earnedBadges: ExpeditionBadge[];
  recordsSet: PersonalExpeditionRecord[];
  onBack: () => void;
}) {
  const [reportStatus, setReportStatus] = useState<ExpeditionReportExportStatus>('idle');
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const expeditionReplayDebriefEnabled = isExpeditionReplayDebriefFeatureEnabled();
  const replayDebriefRecord = useMemo(
    () => expeditionReplayDebriefEnabled ? buildExpeditionDebriefRecordFromTripRecord(trip) : null,
    [expeditionReplayDebriefEnabled, trip],
  );

  const handleExportReport = useCallback(async () => {
    if (reportStatus === 'generating') return;
    setReportStatus('generating');
    setReportMessage(null);
    try {
      const report = await generateExpeditionReport(trip.id);
      if (!report) {
        setReportStatus('failed');
        setReportMessage('Expedition report could not be generated.');
        return;
      }
      const shareResult = await shareExpeditionReport(report.id);
      setReportStatus('ready');
      setReportMessage(shareResult.message);
    } catch {
      setReportStatus('failed');
      setReportMessage('Expedition report export failed.');
    }
  }, [reportStatus, trip.id]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.surface}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Back to Expedition Hub"
        >
          <Ionicons name="chevron-back-outline" size={16} color={TACTICAL.amber} />
          <Text style={styles.backButtonText}>Expedition Hub</Text>
        </TouchableOpacity>

        <View style={styles.detailHeader}>
          <Text style={styles.detailTitle}>{trip.title}</Text>
          <Text style={styles.detailDate}>{formatCompletedDate(trip.completedAt)}</Text>
        </View>

        <View style={styles.reportActionPanel}>
          <TouchableOpacity
            style={[styles.reportActionButton, reportStatus === 'generating' && styles.reportActionButtonDisabled]}
            onPress={handleExportReport}
            activeOpacity={0.82}
            disabled={reportStatus === 'generating'}
            accessibilityRole="button"
            accessibilityLabel="Export Expedition Report"
          >
            {reportStatus === 'generating' ? (
              <ActivityIndicator size="small" color="#0B0F12" />
            ) : (
              <Ionicons name="document-text-outline" size={15} color="#0B0F12" />
            )}
            <Text style={styles.reportActionButtonText}>
              {reportStatus === 'generating' ? 'Generating Report' : 'Export Expedition Report'}
            </Text>
          </TouchableOpacity>
          {reportMessage ? (
            <Text style={[
              styles.reportStatusText,
              reportStatus === 'failed' && styles.reportStatusTextFailed,
            ]}>
              {reportMessage}
            </Text>
          ) : null}
        </View>

        <View style={styles.detailMetricGrid}>
          <DetailMetric label="Distance" value={formatDistance(trip.totalDistanceMiles)} />
          <DetailMetric label="Duration" value={formatDuration(trip.totalDurationSeconds)} />
          <DetailMetric label="Max Elevation" value={formatElevation(trip.maxElevationFt ?? 0)} />
          <DetailMetric label="Elevation Gain" value={formatNullableElevation(trip.totalElevationGainFt)} />
        </View>

        <React.Suspense fallback={null}>
          <ExpeditionRecapMap
            routeGeometry={trip.routeGeometry}
            routeBounds={trip.recap?.routeSummary.routeBounds ?? trip.routeBounds}
            startCoordinate={trip.startCoordinate}
            endCoordinate={trip.endCoordinate}
            recap={trip.recap}
            tripStartedAt={trip.startedAt}
          />
        </React.Suspense>

        <ExpeditionNotableMomentsTimeline
          recap={trip.recap}
          tripStartedAt={trip.startedAt}
        />

        <TripLearningSummaryCard trip={trip} />

        {expeditionReplayDebriefEnabled ? (
          <ExpeditionReplayDebriefPanel
            record={replayDebriefRecord}
            enabled={expeditionReplayDebriefEnabled}
          />
        ) : null}

        <ExpeditionTripBadgesEarned badges={earnedBadges} tripTitle={trip.title} />

        <ExpeditionTripPersonalRecords records={recordsSet} />

        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>Elevation Stats</Text>
          <View style={styles.elevationRow}>
            <Text style={styles.elevationLabel}>Minimum</Text>
            <Text style={styles.elevationValue}>{formatNullableElevation(trip.minElevationFt)}</Text>
          </View>
          <View style={styles.elevationRow}>
            <Text style={styles.elevationLabel}>Maximum</Text>
            <Text style={styles.elevationValue}>{formatNullableElevation(trip.maxElevationFt)}</Text>
          </View>
          <View style={styles.elevationRow}>
            <Text style={styles.elevationLabel}>Gain</Text>
            <Text style={styles.elevationValue}>{formatNullableElevation(trip.totalElevationGainFt)}</Text>
          </View>
        </View>

        {/* TODO Expedition Detail: link badge unlocks to map markers and route timeline locations. */}
        {/* TODO Expedition Detail: connect export-ready map snapshots and badge stamp artwork to report generation. */}
      </View>
    </ScrollView>
  );
}

function ExpeditionHubSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.hubSection}>
      <View style={styles.sectionHeaderCompact}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {count != null ? <Text style={styles.sectionCount}>{count}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function EmptyHubState() {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="flag-outline" size={25} color={TACTICAL.textMuted} />
      <Text style={styles.emptyTitle}>No completed expeditions yet.</Text>
      <Text style={styles.emptySubtext}>Your completed journeys will appear here.</Text>
    </View>
  );
}

function HubActionCard({
  icon,
  label,
  onPress,
  accessibilityLabel,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      style={styles.hubActionButton}
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={15} color={TACTICAL.amber} />
      <Text style={styles.hubActionButtonText} numberOfLines={1}>{label}</Text>
      <Ionicons name="chevron-forward-outline" size={14} color={TACTICAL.textMuted} />
    </TouchableOpacity>
  );
}

function ExpeditionArchiveView({
  trips,
  badges,
  onBack,
  onOpenTrip,
}: {
  trips: ExpeditionTripSummary[];
  badges: ExpeditionBadge[];
  onBack: () => void;
  onOpenTrip: (tripId: string) => void;
}) {
  const archiveTrips = useMemo(() => sortTripsChronologically(trips), [trips]);
  const stats = useMemo(() => buildArchiveLifetimeStats(trips, badges), [trips, badges]);
  const records = useMemo(() => buildArchiveRecordHighlights(trips), [trips]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.surface}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Back to Expedition Hub"
        >
          <Ionicons name="chevron-back-outline" size={16} color={TACTICAL.amber} />
          <Text style={styles.backButtonText}>Expedition Hub</Text>
        </TouchableOpacity>

        <View style={styles.detailHeader}>
          <Text style={styles.detailTitle}>Expedition Archive</Text>
          <Text style={styles.detailDate}>A chronological logbook of completed expeditions.</Text>
        </View>

        {archiveTrips.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="library-outline" size={25} color={TACTICAL.textMuted} />
            <Text style={styles.emptyTitle}>No completed expeditions yet.</Text>
            <Text style={styles.emptySubtext}>Completed journeys will build your expedition history here.</Text>
          </View>
        ) : (
          <>
            <View style={styles.archiveStatsGrid}>
              <ArchiveStatTile label="Total Completed Expeditions" value={`${stats.totalCompletedExpeditions}`} />
              <ArchiveStatTile label="Total Miles" value={formatDistance(stats.totalMiles)} />
              <ArchiveStatTile label="Total Hours" value={formatHours(stats.totalHours)} />
              <ArchiveStatTile label="Highest Elevation" value={formatElevation(stats.highestElevationFt)} />
              <ArchiveStatTile label="Total Badges Earned" value={`${stats.totalBadgesEarned}`} />
              <ArchiveStatTile label="Total Notable Moments" value={`${stats.totalNotableMoments}`} />
            </View>

            {records.length > 0 ? (
              <View style={styles.archiveSection}>
                <View style={styles.sectionHeaderCompact}>
                  <Text style={styles.sectionTitle}>Personal Records</Text>
                  <Text style={styles.sectionCount}>{records.length}</Text>
                </View>
                <View style={styles.archiveRecordList}>
                  {records.map((record) => (
                    <View key={record.label} style={styles.archiveRecordRow}>
                      <View style={styles.archiveRecordIcon}>
                        <Ionicons name="stats-chart-outline" size={13} color={TACTICAL.amber} />
                      </View>
                      <View style={styles.archiveRecordCopy}>
                        <Text style={styles.archiveRecordLabel}>{record.label}</Text>
                        <Text style={styles.archiveRecordTrip} numberOfLines={1}>{record.tripTitle}</Text>
                      </View>
                      <Text style={styles.archiveRecordValue}>{record.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.archiveSection}>
              <View style={styles.sectionHeaderCompact}>
                <Text style={styles.sectionTitle}>Storyline</Text>
                <Text style={styles.sectionCount}>{archiveTrips.length}</Text>
              </View>
              <View style={styles.archiveTimeline}>
                {archiveTrips.map((trip, index) => (
                  <ArchiveTripItem
                    key={trip.id}
                    trip={trip}
                    isLast={index === archiveTrips.length - 1}
                    onPress={() => onOpenTrip(trip.id)}
                  />
                ))}
              </View>
            </View>
          </>
        )}

        {/* TODO Expedition Archive: add regional map of all completed expeditions. */}
        {/* TODO Expedition Archive: add year/month filters and seasonal history. */}
        {/* TODO Expedition Archive: add exported archive report generation. */}
        {/* TODO Expedition Archive: add personal best comparisons and route replay. */}
      </View>
    </ScrollView>
  );
}

function ArchiveStatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.archiveStatTile}>
      <Text style={styles.archiveStatValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.archiveStatLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function ArchiveTripItem({
  trip,
  isLast,
  onPress,
}: {
  trip: ExpeditionTripSummary;
  isLast: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.archiveTripItem}
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={`Open archived expedition ${trip.title}`}
    >
      <View style={styles.archiveRail}>
        <View style={styles.archiveDot} />
        {!isLast ? <View style={styles.archiveLine} /> : null}
      </View>
      <View style={styles.archiveTripBody}>
        <View style={styles.archiveTripHeader}>
          <View style={styles.archiveTripTitleWrap}>
            <Text style={styles.archiveTripTitle} numberOfLines={1}>{trip.title}</Text>
            <Text style={styles.archiveTripDate}>{formatCompletedDate(trip.completedAt)}</Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={14} color={TACTICAL.textMuted} />
        </View>
        <View style={styles.archiveTripMetrics}>
          <MetricPill label="Distance" value={formatDistance(trip.totalDistanceMiles)} />
          <MetricPill label="Duration" value={formatDuration(trip.totalDurationSeconds)} />
          <MetricPill label="Max Elev." value={formatNullableElevation(trip.maxElevationFt)} />
        </View>
        <View style={styles.archiveTripMetaRow}>
          <Text style={styles.archiveTripMeta}>{trip.badgesUnlockedCount} badges earned</Text>
          <Text style={styles.archiveTripMeta}>{trip.notableMomentsCount} notable moments</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ExpeditionReportsView({
  reports,
  onBack,
}: {
  reports: ExpeditionReport[];
  onBack: () => void;
}) {
  const [fileInfoByReportId, setFileInfoByReportId] = useState<Record<string, ReportFileInfo>>({});
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadReportFileInfo() {
      const entries = await Promise.all(
        reports.map(async (report): Promise<[string, ReportFileInfo]> => {
          if (!report.localUri) return [report.id, { exists: false, size: null }];
          const info = await fsGetInfo(report.localUri).catch(() => ({ exists: false, isDirectory: false, size: 0 }));
          return [report.id, {
            exists: !!info.exists && !info.isDirectory,
            size: Number.isFinite(info.size) ? info.size : null,
          }];
        }),
      );
      if (!cancelled) setFileInfoByReportId(Object.fromEntries(entries));
    }
    void loadReportFileInfo();
    return () => {
      cancelled = true;
    };
  }, [reports]);

  const handleOpenReport = useCallback(async (report: ExpeditionReport) => {
    setShareMessage(null);
    if (!report.localUri) {
      setFileInfoByReportId((current) => ({
        ...current,
        [report.id]: { exists: false, size: null },
      }));
      setShareMessage('Report file unavailable.');
      return;
    }

    const info = await fsGetInfo(report.localUri).catch(() => ({ exists: false, isDirectory: false, size: 0 }));
    if (!info.exists || info.isDirectory) {
      setFileInfoByReportId((current) => ({
        ...current,
        [report.id]: { exists: false, size: null },
      }));
      setShareMessage('Report file unavailable.');
      return;
    }

    setFileInfoByReportId((current) => ({
      ...current,
      [report.id]: { exists: true, size: Number.isFinite(info.size) ? info.size : null },
    }));
    const result = await downloadExpeditionReport(report.id);
    setShareMessage(result.message);
  }, []);

  const handleLongPressReport = useCallback((_reportId: string) => {
    // TODO Expedition Reports Library: reserve long-press actions for rename, delete, regenerate, and batch workflows.
  }, []);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.surface}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Back to Expedition Hub"
        >
          <Ionicons name="chevron-back-outline" size={16} color={TACTICAL.amber} />
          <Text style={styles.backButtonText}>Expedition Hub</Text>
        </TouchableOpacity>

        <View style={styles.detailHeader}>
          <Text style={styles.detailTitle}>Expedition Reports</Text>
          <Text style={styles.detailDate}>{reports.length} generated</Text>
        </View>

        {reports.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="documents-outline" size={25} color={TACTICAL.textMuted} />
            <Text style={styles.emptyTitle}>No exported reports yet.</Text>
            <Text style={styles.emptySubtext}>Generate a report from an expedition detail screen.</Text>
          </View>
        ) : (
          <View style={styles.reportLibraryList}>
            {reports.map((report) => (
              <ReportLibraryItem
                key={report.id}
                report={report}
                fileInfo={fileInfoByReportId[report.id]}
                onPress={() => handleOpenReport(report)}
                onLongPress={() => handleLongPressReport(report.id)}
              />
            ))}
          </View>
        )}

        {shareMessage ? (
          <Text style={styles.reportLibraryMessage}>{shareMessage}</Text>
        ) : null}

        {/* TODO Expedition Reports Library: add cloud backup without blocking local report access. */}
        {/* TODO Expedition Reports Library: add report search, regeneration from library, batch export, and print-specific formatting. */}
      </View>
    </ScrollView>
  );
}

function ReportLibraryItem({
  report,
  fileInfo,
  onPress,
  onLongPress,
}: {
  report: ExpeditionReport;
  fileInfo?: ReportFileInfo;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const fileUnavailable = fileInfo ? !fileInfo.exists : !report.localUri;

  return (
    <TouchableOpacity
      style={styles.reportLibraryItem}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={`Download report ${report.title}`}
      accessibilityHint="Downloads the local expedition export when available."
    >
      <View style={styles.reportLibraryTop}>
        <View style={styles.reportLibraryIcon}>
          <Ionicons name="document-text-outline" size={15} color={TACTICAL.amber} />
        </View>
        <View style={styles.reportLibraryTitleWrap}>
          <Text style={styles.reportLibraryTitle} numberOfLines={1}>{report.title}</Text>
          <Text style={styles.reportLibraryDate}>{formatCompletedDate(report.generatedAt)}</Text>
        </View>
        <Ionicons name="download-outline" size={14} color={TACTICAL.textMuted} />
      </View>
      <View style={styles.reportLibraryMetaRow}>
        <MetricPill label="Format" value={formatReportFormat(report.exportFormat)} />
        <MetricPill label="Status" value={formatReportFileStatus(report, fileInfo)} />
        <MetricPill label="Size" value={formatFileSize(fileInfo?.size ?? null)} />
      </View>
      {fileUnavailable ? (
        <View style={styles.reportUnavailablePanel}>
          <Text style={styles.reportUnavailableTitle}>Report file unavailable.</Text>
          <Text style={styles.reportUnavailableSubtext}>
            You can regenerate this report from the expedition detail screen.
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function ExpeditionTripBadgesEarned({
  badges,
  tripTitle,
}: {
  badges: ExpeditionBadge[];
  tripTitle: string;
}) {
  return (
    <View style={styles.detailSection}>
      <Text style={styles.detailSectionTitle}>Badges Earned</Text>
      <BadgeGrid
        badges={badges}
        emptyTitle="No badges earned on this expedition."
        emptySubtext="Field honors earned on this expedition will appear here."
        relatedTripTitle={tripTitle}
      />
    </View>
  );
}

function ExpeditionTripPersonalRecords({ records }: { records: PersonalExpeditionRecord[] }) {
  if (records.length === 0) return null;

  return (
    <View style={styles.detailSection}>
      <Text style={styles.detailSectionTitle}>Personal Records</Text>
      <View style={styles.personalRecordList}>
        {records.map((record) => (
          <PersonalRecordRow key={record.id} record={record} showPrevious />
        ))}
      </View>
    </View>
  );
}

function PersonalRecordsPreview({ records }: { records: PersonalExpeditionRecord[] }) {
  if (records.length === 0) return null;

  return (
    <View style={styles.personalRecordsPreview}>
      <View style={styles.sectionHeaderCompact}>
        <Text style={styles.sectionTitle}>Personal Records</Text>
        <Text style={styles.sectionCount}>{records.length}</Text>
      </View>
      <View style={styles.personalRecordList}>
        {records.slice(0, 4).map((record) => (
          <PersonalRecordRow key={record.id} record={record} />
        ))}
      </View>
    </View>
  );
}

function PersonalRecordRow({
  record,
  showPrevious = false,
}: {
  record: PersonalExpeditionRecord;
  showPrevious?: boolean;
}) {
  return (
    <View style={styles.personalRecordRow}>
      <View style={styles.personalRecordIcon}>
        <Ionicons name="medal-outline" size={13} color={TACTICAL.amber} />
      </View>
      <View style={styles.personalRecordCopy}>
        <Text style={styles.personalRecordTitle} numberOfLines={1}>{record.title}</Text>
        {showPrevious && record.previousValue != null ? (
          <Text style={styles.personalRecordPrevious} numberOfLines={1}>
            Previous {formatPersonalRecordValue(record.previousValue, record.unit)}
          </Text>
        ) : (
          <Text style={styles.personalRecordPrevious} numberOfLines={1}>
            Set {formatCompletedDate(record.achievedAt)}
          </Text>
        )}
      </View>
      <Text style={styles.personalRecordValue}>{formatPersonalRecordValue(record.value, record.unit)}</Text>
    </View>
  );
}

function ExpeditionInsightsSection({
  insights,
  onDismiss,
}: {
  insights: ExpeditionInsight[];
  onDismiss: (insightId: string) => void;
}) {
  if (insights.length === 0) return null;

  return (
    <View style={styles.insightsSection}>
      <View style={styles.sectionHeaderCompact}>
        <Text style={styles.sectionTitle}>Expedition Insights</Text>
        <Text style={styles.sectionCount}>{insights.length}</Text>
      </View>
      <View style={styles.insightList}>
        {insights.slice(0, 3).map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            onDismiss={() => onDismiss(insight.id)}
          />
        ))}
      </View>
    </View>
  );
}

function InsightCard({
  insight,
  onDismiss,
}: {
  insight: ExpeditionInsight;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightIcon}>
        <Ionicons name={iconForInsightType(insight.type)} size={15} color={TACTICAL.amber} />
      </View>
      <View style={styles.insightCopy}>
        <Text style={styles.insightTitle} numberOfLines={1}>{insight.title}</Text>
        <Text style={styles.insightDescription} numberOfLines={2}>{insight.description}</Text>
      </View>
      <TouchableOpacity
        style={styles.insightDismissButton}
        onPress={onDismiss}
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel={`Dismiss ${insight.title}`}
      >
        <Ionicons name="close-outline" size={15} color={TACTICAL.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

function ExpeditionTripCard({
  trip,
  onPress,
  onLongPress,
}: {
  trip: ExpeditionTripSummary;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.tripCard}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={`Open ${trip.title}`}
    >
      <View style={styles.tripCardTop}>
        <View style={styles.tripIcon}>
          <Ionicons name="flag-outline" size={15} color={TACTICAL.amber} />
        </View>
        <View style={styles.tripTitleWrap}>
          <Text style={styles.tripTitle} numberOfLines={1}>{trip.title}</Text>
          <Text style={styles.tripDate}>{formatCompletedDate(trip.completedAt)}</Text>
        </View>
        <Ionicons name="chevron-forward-outline" size={15} color={TACTICAL.textMuted} />
      </View>
      <View style={styles.tripMetrics}>
        <MetricPill label="Distance" value={formatDistance(trip.totalDistanceMiles)} />
        <MetricPill label="Duration" value={formatDuration(trip.totalDurationSeconds)} />
        <MetricPill label="Max Elev." value={formatNullableElevation(trip.maxElevationFt)} />
      </View>
    </TouchableOpacity>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailMetric}>
      <Text style={styles.detailMetricValue}>{value}</Text>
      <Text style={styles.detailMetricLabel}>{label}</Text>
    </View>
  );
}

function iconForInsightType(type: ExpeditionInsight['type']): string {
  switch (type) {
    case 'distance_pattern':
      return 'git-branch-outline';
    case 'elevation_pattern':
    case 'personal_record':
      return 'trending-up-outline';
    case 'weather_pattern':
      return 'partly-sunny-outline';
    case 'time_of_day_pattern':
      return 'time-outline';
    case 'route_deviation_pattern':
      return 'swap-horizontal-outline';
    case 'recovery_usage':
      return 'construct-outline';
    case 'milestone_progress':
      return 'flag-outline';
    case 'expedition_frequency':
      return 'calendar-outline';
    case 'badge_progress':
      return 'ribbon-outline';
    default:
      return 'compass-outline';
  }
}

const METERS_PER_MILE = 1609.344;
const DEFAULT_HUB_SUBTITLE = 'Your completed expeditions, milestones, and field history.';

function readFiniteNumber(source: unknown, keys: string[]): number | null {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function readStringValue(source: unknown, keys: string[]): string | null {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function completedGuidanceMaterializationSignature({
  completedExpeditionRecord,
  routeCompleted,
  routeLifecycleState,
  routeLabel,
}: {
  completedExpeditionRecord?: unknown;
  routeCompleted: boolean;
  routeLifecycleState?: string;
  routeLabel?: string;
}): string | null {
  const completedState = readStringValue(completedExpeditionRecord, ['state', 'status', 'lifecycle']);
  const completedRouteVisible =
    routeCompleted ||
    routeLifecycleState === 'ended' ||
    routeLifecycleState === 'completed' ||
    completedState === 'complete' ||
    completedState === 'completed' ||
    completedState === 'arrived';
  if (!completedRouteVisible) return null;

  const id = readStringValue(completedExpeditionRecord, ['id', 'tripId', 'routeId', 'activeRouteId', 'guidanceSessionId']);
  if (!id) return null;
  const updatedAt =
    readStringValue(completedExpeditionRecord, ['completedAt', 'endedAt', 'updatedAt', 'lastUpdatedAt', 'timestamp']) ??
    'unknown';
  return [id, completedState ?? routeLifecycleState ?? 'completed', updatedAt, routeLabel ?? ''].join(':');
}

function buildLiveHubStats({
  archivedStats,
  campCount,
  completedExpeditionRecord,
  completedTrips,
  ecsOnline,
  expeditionId,
  gpsElevationFt,
  gpsLocation,
  hasActiveRoute,
  routeCompleted,
  routeLabel,
  routeLifecycleState,
  teamMemberCount,
}: {
  archivedStats: ExpeditionHubStats;
  campCount: number;
  completedExpeditionRecord?: unknown;
  completedTrips: ExpeditionTripSummary[];
  ecsOnline: boolean;
  expeditionId?: string;
  gpsElevationFt?: number | null;
  gpsLocation?: IncidentCoordinate | null;
  hasActiveRoute: boolean;
  routeCompleted: boolean;
  routeLabel?: string;
  routeLifecycleState?: string;
  teamMemberCount: number;
}): ExpeditionHubStats & { subtitle: string } {
  const completedRouteVisible =
    routeCompleted ||
    routeLifecycleState === 'ended' ||
    routeLifecycleState === 'completed' ||
    readStringValue(completedExpeditionRecord, ['state']) === 'complete';
  const routeVisible = hasActiveRoute || completedRouteVisible || Boolean(completedExpeditionRecord);
  const completedRecordId = readStringValue(completedExpeditionRecord, ['id']);
  const activeExpeditionId = completedRecordId ?? expeditionId ?? null;
  const archivedAlreadyHasRecord = Boolean(
    activeExpeditionId && completedTrips.some((trip) => trip.id === activeExpeditionId),
  );
  const shouldAddCompletedRecord = Boolean(completedExpeditionRecord && !archivedAlreadyHasRecord);
  const recordDistanceMeters = readFiniteNumber(completedExpeditionRecord, ['distance', 'distanceMeters', 'distance_meters']);
  const recordDistanceMiles =
    readFiniteNumber(completedExpeditionRecord, ['totalDistanceMiles', 'distanceMiles', 'completedMiles', 'totalDistance']) ??
    (recordDistanceMeters != null ? recordDistanceMeters / METERS_PER_MILE : 0);
  const recordDurationSeconds =
    readFiniteNumber(completedExpeditionRecord, ['totalDurationSeconds', 'durationSeconds', 'duration', 'durationSec', 'duration_seconds']) ?? 0;
  const liveElevationFt = readFiniteNumber(completedExpeditionRecord, ['maxElevationFt', 'highestElevationFt']) ??
    (typeof gpsElevationFt === 'number' && Number.isFinite(gpsElevationFt) ? gpsElevationFt : null);
  const nextExpeditionCount =
    archivedStats.totalExpeditions +
    (shouldAddCompletedRecord ? 1 : routeVisible && archivedStats.totalExpeditions === 0 ? 1 : 0);
  const routeName = routeLabel || readStringValue(completedExpeditionRecord, ['expeditionName', 'destination']) || 'Active route';
  const routeStateLabel = completedRouteVisible ? 'Arrived' : hasActiveRoute ? 'Active guidance' : null;
  const gpsLabel = gpsLocation ? 'GPS live' : 'GPS pending';
  const subtitle = routeStateLabel
    ? `${routeStateLabel}: ${routeName} • ${teamMemberCount} ${teamMemberCount === 1 ? 'team member' : 'team members'} • ${campCount} ${campCount === 1 ? 'camp' : 'camps'} • ${ecsOnline ? gpsLabel : 'Offline cache'}`
    : DEFAULT_HUB_SUBTITLE;

  return {
    totalExpeditions: nextExpeditionCount,
    totalMiles: archivedStats.totalMiles + (shouldAddCompletedRecord ? Math.max(0, recordDistanceMiles) : 0),
    highestElevationFt: Math.max(archivedStats.highestElevationFt, liveElevationFt ?? 0),
    totalHours: archivedStats.totalHours + (shouldAddCompletedRecord ? Math.max(0, recordDurationSeconds / 3600) : 0),
    subtitle,
  };
}

function buildHubStats(trips: ExpeditionTripSummary[]): ExpeditionHubStats {
  return trips.reduce<ExpeditionHubStats>(
    (stats, trip) => ({
      totalExpeditions: stats.totalExpeditions + 1,
      totalMiles: stats.totalMiles + (trip.totalDistanceMiles ?? 0),
      highestElevationFt: Math.max(stats.highestElevationFt, trip.maxElevationFt ?? 0),
      totalHours: stats.totalHours + ((trip.totalDurationSeconds ?? 0) / 3600),
    }),
    { totalExpeditions: 0, totalMiles: 0, highestElevationFt: 0, totalHours: 0 },
  );
}

function buildArchiveLifetimeStats(
  trips: ExpeditionTripSummary[],
  badges: ExpeditionBadge[],
): ArchiveLifetimeStats {
  return trips.reduce<ArchiveLifetimeStats>(
    (stats, trip) => ({
      totalCompletedExpeditions: stats.totalCompletedExpeditions + 1,
      totalMiles: stats.totalMiles + (trip.totalDistanceMiles ?? 0),
      totalHours: stats.totalHours + ((trip.totalDurationSeconds ?? 0) / 3600),
      highestElevationFt: Math.max(stats.highestElevationFt, trip.maxElevationFt ?? 0),
      totalBadgesEarned: stats.totalBadgesEarned,
      totalNotableMoments: stats.totalNotableMoments + trip.notableMomentsCount,
    }),
    {
      totalCompletedExpeditions: 0,
      totalMiles: 0,
      totalHours: 0,
      highestElevationFt: 0,
      totalBadgesEarned: badges.filter((badge) => !!badge.unlockedAt).length,
      totalNotableMoments: 0,
    },
  );
}

function buildArchiveRecordHighlights(trips: ExpeditionTripSummary[]): ArchiveRecordHighlight[] {
  const completedTrips = trips.filter((trip) => !!trip.completedAt);
  if (completedTrips.length === 0) return [];

  return [
    buildArchiveRecord(
      'Longest Expedition',
      completedTrips,
      (trip) => trip.totalDistanceMiles ?? 0,
      (trip) => formatDistance(trip.totalDistanceMiles),
    ),
    buildArchiveRecord(
      'Highest Route',
      completedTrips,
      (trip) => trip.maxElevationFt ?? 0,
      (trip) => formatNullableElevation(trip.maxElevationFt),
    ),
    buildArchiveRecord(
      'Longest Duration',
      completedTrips,
      (trip) => trip.totalDurationSeconds ?? 0,
      (trip) => formatDuration(trip.totalDurationSeconds),
    ),
    buildArchiveRecord(
      'Most Badges Earned on One Trip',
      completedTrips,
      (trip) => trip.badgesUnlockedCount,
      (trip) => `${trip.badgesUnlockedCount}`,
    ),
    buildArchiveRecord(
      'Most Notable Moments on One Trip',
      completedTrips,
      (trip) => trip.notableMomentsCount,
      (trip) => `${trip.notableMomentsCount}`,
    ),
  ].filter((record): record is ArchiveRecordHighlight => !!record);
}

function buildArchiveRecord(
  label: string,
  trips: ExpeditionTripSummary[],
  scoreForTrip: (trip: ExpeditionTripSummary) => number,
  valueForTrip: (trip: ExpeditionTripSummary) => string,
): ArchiveRecordHighlight | null {
  const bestTrip = trips.reduce((best, trip) => (scoreForTrip(trip) > scoreForTrip(best) ? trip : best), trips[0]);
  if (scoreForTrip(bestTrip) <= 0) return null;
  return {
    label,
    value: valueForTrip(bestTrip),
    tripTitle: bestTrip.title,
  };
}

function sortTripsChronologically(trips: ExpeditionTripSummary[]): ExpeditionTripSummary[] {
  return [...trips].sort((a, b) => timestampForTrip(a.completedAt) - timestampForTrip(b.completedAt));
}

function timestampForTrip(value: string | null): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function formatCompletedDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable';
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatWholeMiles(value: number): string {
  return `${Math.round(value).toLocaleString()} Miles`;
}

function formatDistance(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '0 mi';
  if (value < 10 && value > 0) return `${value.toFixed(1)} mi`;
  return `${Math.round(value).toLocaleString()} mi`;
}

function formatHours(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 hrs';
  if (value < 10) return `${Math.round(value * 10) / 10} hrs`;
  return `${Math.round(value).toLocaleString()} hrs`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '0 hrs';
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.max(1, Math.round(seconds / 60))} min`;
  return formatHours(hours);
}

function formatPersonalRecordValue(value: number, unit: PersonalExpeditionRecord['unit']): string {
  if (!Number.isFinite(value)) return '--';
  switch (unit) {
    case 'miles':
      return formatDistance(value);
    case 'seconds':
      return formatDuration(value);
    case 'feet':
      return formatElevation(value);
    case 'mph':
      return `${Math.round(value * 10) / 10} mph`;
    case 'minutes_after_midnight':
      return formatMinutesAfterMidnight(value);
    case 'count':
    default:
      return `${Math.round(value)}`;
  }
}

function formatMinutesAfterMidnight(value: number): string {
  if (!Number.isFinite(value)) return '--';
  const minutes = Math.max(0, Math.min(1439, Math.round(value)));
  const hours24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minute.toString().padStart(2, '0')} ${suffix}`;
}

function formatReportFormat(format: ExpeditionReport['exportFormat']): string {
  return format.toUpperCase();
}

function formatReportFileStatus(report: ExpeditionReport, fileInfo?: ReportFileInfo): string {
  if (!report.localUri) return 'Unavailable';
  if (!fileInfo) return 'Checking';
  return fileInfo.exists ? 'Ready' : 'Missing';
}

function formatFileSize(size: number | null): string {
  if (size == null || !Number.isFinite(size) || size <= 0) return '--';
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${Math.round(size / 104857.6) / 10} MB`;
}

function formatElevation(value: number): string {
  return `${Math.round(value || 0).toLocaleString()} ft`;
}

function formatNullableElevation(value: number | null): string {
  return value == null || !Number.isFinite(value) ? '0 ft' : formatElevation(value);
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  surface: {
    flex: 1,
    minHeight: 0,
    gap: 12,
    overflow: 'hidden',
    borderRadius: ECS_SURFACE.radius.primary,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 4,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subtitle: {
    marginTop: 3,
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 7,
  },
  badgeAchievementNotice: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(29,24,16,0.78)',
    overflow: 'hidden',
  },
  statTile: {
    flex: 1,
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.82)',
    paddingHorizontal: 7,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  statValue: {
    color: TACTICAL.amber,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  statLabel: {
    marginTop: 4,
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '800',
    lineHeight: 10,
  },
  sectionTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  sectionCount: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '900',
  },
  sectionHeaderCompact: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  hubSection: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 10,
    gap: 8,
  },
  insightsSection: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 10,
    gap: 8,
  },
  insightList: {
    gap: 7,
  },
  insightCard: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.78)',
    padding: 9,
  },
  insightIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
  },
  insightCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  insightTitle: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  insightDescription: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
  insightDismissButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personalRecordsPreview: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 10,
    gap: 8,
  },
  personalRecordList: {
    gap: 7,
  },
  personalRecordRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.72)',
    padding: 8,
  },
  personalRecordIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
  },
  personalRecordCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  personalRecordTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  personalRecordPrevious: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  personalRecordValue: {
    color: TACTICAL.amber,
    fontSize: 11,
    fontWeight: '900',
  },
  loadingPanel: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  emptyState: {
    minHeight: 170,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  emptyTitle: {
    color: TACTICAL.text,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptySubtext: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  tripList: {
    gap: 9,
  },
  tripCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(17,20,24,0.9)',
    padding: 10,
    gap: 10,
  },
  tripCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  tripIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
  },
  tripTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  tripTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  tripDate: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  tripMetrics: {
    flexDirection: 'row',
    gap: 7,
  },
  metricPill: {
    flex: 1,
    minHeight: 38,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(0,0,0,0.16)',
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  metricLabel: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '800',
  },
  metricValue: {
    marginTop: 2,
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  hubActionRow: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hubActionButton: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(17,20,24,0.82)',
    paddingHorizontal: 11,
  },
  hubActionButtonText: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  detailLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,14,18,0.28)',
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  backButtonText: {
    color: TACTICAL.amber,
    fontSize: 11,
    fontWeight: '900',
  },
  detailHeader: {
    gap: 3,
  },
  detailTitle: {
    color: TACTICAL.text,
    fontSize: 18,
    fontWeight: '900',
  },
  detailDate: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  reportActionPanel: {
    gap: 7,
  },
  reportActionButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber,
    paddingHorizontal: 12,
  },
  reportActionButtonDisabled: {
    opacity: 0.74,
  },
  reportActionButtonText: {
    color: '#0B0F12',
    fontSize: 10,
    fontWeight: '900',
  },
  reportStatusText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  reportStatusTextFailed: {
    color: TACTICAL.danger,
  },
  reportLibraryList: {
    gap: 9,
  },
  reportLibraryItem: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(17,20,24,0.86)',
    padding: 10,
    gap: 10,
  },
  reportLibraryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  reportLibraryIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
  },
  reportLibraryTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  reportLibraryTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  reportLibraryDate: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  reportLibraryMetaRow: {
    flexDirection: 'row',
    gap: 7,
  },
  reportLibraryMessage: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  reportUnavailablePanel: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 8,
    gap: 2,
  },
  reportUnavailableTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  reportUnavailableSubtext: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
  detailMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailMetric: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.84)',
    padding: 10,
    justifyContent: 'center',
  },
  detailMetricValue: {
    color: TACTICAL.amber,
    fontSize: 15,
    fontWeight: '900',
  },
  detailMetricLabel: {
    marginTop: 4,
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  detailSection: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(17,20,24,0.7)',
    padding: 10,
    gap: 8,
  },
  detailSectionTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  elevationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 8,
  },
  elevationLabel: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  elevationValue: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  archiveStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  archiveStatTile: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.82)',
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  archiveStatValue: {
    color: TACTICAL.amber,
    fontSize: 12,
    fontWeight: '900',
  },
  archiveStatLabel: {
    marginTop: 4,
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '800',
    lineHeight: 10,
  },
  archiveSection: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 10,
    gap: 8,
  },
  archiveRecordList: {
    gap: 7,
  },
  archiveRecordRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.72)',
    padding: 8,
  },
  archiveRecordIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
  },
  archiveRecordCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  archiveRecordLabel: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  archiveRecordTrip: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  archiveRecordValue: {
    color: TACTICAL.amber,
    fontSize: 11,
    fontWeight: '900',
  },
  archiveTimeline: {
    gap: 0,
  },
  archiveTripItem: {
    flexDirection: 'row',
    gap: 8,
  },
  archiveRail: {
    width: 16,
    alignItems: 'center',
  },
  archiveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: TACTICAL.amber,
    backgroundColor: ECS.accentSoft,
    marginTop: 12,
  },
  archiveLine: {
    flex: 1,
    width: 1,
    minHeight: 74,
    backgroundColor: GOLD_RAIL.internal,
  },
  archiveTripBody: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(17,20,24,0.82)',
    padding: 9,
    gap: 8,
    marginBottom: 8,
  },
  archiveTripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  archiveTripTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  archiveTripTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  archiveTripDate: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  archiveTripMetrics: {
    flexDirection: 'row',
    gap: 7,
  },
  archiveTripMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  archiveTripMeta: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
});

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import type { ConvoyMapVehicle, ConvoyRealtimeConnectionStatus } from '../../lib/convoy/convoyRealtimeService';
import {
  buildActiveConvoyPanelViewModel as buildSharedActiveConvoyPanelViewModel,
  fallbackVehiclesFromCommandData as fallbackVehiclesFromSharedCommandData,
  localVehicleFromRouteSession as localVehicleFromSharedRouteSession,
  localVehicleFromUserLocation as localVehicleFromSharedUserLocation,
  type DispatchConvoyUserLocation,
} from '../../lib/convoy/convoyMapOverlayModel';
import {
  convoyMembershipService,
  type ActiveConvoyContext,
} from '../../lib/convoy/convoyMembershipService';
import {
  getConvoyLocationSharingState,
  startConvoyLocationSharing,
  stopConvoyLocationSharing,
  type ConvoyLocationSharingState,
} from '../../lib/convoy/convoyLocationPublisher';
import {
  formatConvoyDistanceMiles,
  selectConvoyCommandPanelViewModel,
} from '../../lib/convoy/convoyCommandSelectors';
import type { ConvoyCommandPanelViewModel } from '../../lib/convoy/convoyCommandTypes';
import type {
  ConvoyRegroupPlannerResult,
  ConvoyRegroupProposal,
  ConvoyRegroupVehicleConstraints,
} from '../../lib/convoy/convoyRegroupPlanner';
import {
  createConvoyRegroupRallyDraft,
  readConvoyRegroupLocalContext,
  selectConvoyRegroupPlannerResult,
  type ConvoyRegroupRallyDraft,
} from '../../lib/convoy/convoyRegroupPlannerAdapter';
import type { DispatchEvent } from '../../lib/dispatchLiveEvents';
import { useConvoyCommandData } from '../dashboard/commandCenter/useConvoyCommandData';
import { navigateRouteSessionStore } from '../../lib/navigateRouteSessionStore';
import {
  refreshConvoyTrackingStaleness,
  stopConvoyLocationSubscription,
  subscribeToConvoyLocations,
  useConvoyTrackingStore,
} from '../../stores/convoyTrackingStore';
import ConvoyRegroupPlannerSheet from './ConvoyRegroupPlannerSheet';

type DispatchConvoyCommandPanelProps = {
  connectionLabel: string;
  teamStatusLabel: string;
  teamMemberCount: number;
  hasActiveTeam: boolean;
  userLocation?: DispatchConvoyUserLocation | null;
  emergencyEvents: DispatchEvent[];
  emergencyAlertActive?: boolean;
  emergencySubmitting: boolean;
  emergencyButtonLabel?: string;
  emergencyButtonTone?: string;
  onEmergencyPing: () => void;
  onOpenEmergencyEvent: (event: DispatchEvent) => void;
  presentation?: 'full' | 'feed' | 'signals' | 'summary';
  showEmergencyOverlay?: boolean;
  convoyLifecycleRevision?: number;
  regroupPlannerEnabled?: boolean;
  regroupPlannerOpenRequest?: number;
  positionSharingRolloutEnabled?: boolean;
  memberLocationPermissionAllowed?: boolean;
  regroupPlannerPermissionAllowed?: boolean;
  regroupPlannerPermissionReason?: string | null;
  canPreviewRegroupOnMap?: boolean;
  previewRegroupUnavailableReason?: string | null;
  canCreateRallyPing?: boolean;
  rallyPingUnavailableReason?: string | null;
  expeditionId?: string | null;
  vehicleConstraints?: ConvoyRegroupVehicleConstraints | null;
  onPreviewRegroupProposal?: (proposal: ConvoyRegroupProposal) => void;
  onCreateRegroupRallyDraft?: (draft: ConvoyRegroupRallyDraft) => void;
  onReturnToCommandBoard?: () => void;
  testID?: string;
};

const CONVOY_TRACKING_STALENESS_REFRESH_MS = 30_000;
let dispatchConvoySubscriptionOwnerSequence = 0;

function formatVehicleCount(count: number): string {
  if (count <= 0) return '0 VEHICLES';
  if (count === 1) return '1 VEHICLE';
  return `${count} VEHICLES`;
}

function formatUpdatedAt(value: string | number | Date | null): string {
  if (value == null) return 'No live timestamp';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return 'No live timestamp';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatEmergencyEventTime(event: DispatchEvent): string {
  const date = new Date(event.createdAt);
  if (!Number.isFinite(date.getTime())) return 'Time unavailable';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function getEmergencyLocationLabel(event: DispatchEvent): string {
  if (!event.location) return 'Coordinate unavailable';
  const accuracy = event.location.accuracyMeters;
  const accuracyLabel = typeof accuracy === 'number' && Number.isFinite(accuracy)
    ? ` +/- ${Math.round(accuracy)}m`
    : '';
  return `${event.location.latitude.toFixed(5)}, ${event.location.longitude.toFixed(5)}${accuracyLabel}`;
}

function useEmergencyPulse(active: boolean) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) {
      opacity.setValue(1);
      return undefined;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.38,
          duration: 760,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 760,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => {
      pulse.stop();
      opacity.setValue(1);
    };
  }, [active, opacity]);

  return opacity;
}

function formatTrackingStatus(state: ConvoyLocationSharingState | null): string {
  if (!state) return 'Tracking: disabled';
  switch (state.status) {
    case 'enabled':
      return 'Tracking: sharing live location';
    case 'starting':
      return 'Tracking: starting';
    case 'permission_denied':
      return 'Tracking: permission denied';
    case 'error':
      return 'Tracking: needs attention';
    case 'disabled':
    default:
      return 'Tracking: disabled';
  }
}

function isConvoyLifecycleStopMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const normalized = message.trim().toLowerCase();
  return normalized.includes('live sharing stopped') ||
    normalized.includes('location sharing stopped') ||
    normalized.includes('convoy is no longer active');
}

function useNavigateRouteSessionSnapshot() {
  return useSyncExternalStore(
    navigateRouteSessionStore.subscribe,
    navigateRouteSessionStore.getSnapshot,
    navigateRouteSessionStore.getSnapshot,
  );
}

export default function DispatchConvoyCommandPanel({
  connectionLabel,
  teamStatusLabel,
  teamMemberCount,
  hasActiveTeam,
  userLocation,
  emergencyEvents,
  emergencyAlertActive,
  emergencySubmitting,
  emergencyButtonLabel,
  emergencyButtonTone,
  onEmergencyPing,
  onOpenEmergencyEvent,
  presentation = 'full',
  showEmergencyOverlay,
  convoyLifecycleRevision = 0,
  regroupPlannerEnabled = false,
  regroupPlannerOpenRequest = 0,
  positionSharingRolloutEnabled = false,
  memberLocationPermissionAllowed = false,
  regroupPlannerPermissionAllowed = false,
  regroupPlannerPermissionReason,
  canPreviewRegroupOnMap = false,
  previewRegroupUnavailableReason,
  canCreateRallyPing = false,
  rallyPingUnavailableReason,
  expeditionId,
  vehicleConstraints,
  onPreviewRegroupProposal,
  onCreateRegroupRallyDraft,
  onReturnToCommandBoard,
  testID = 'dispatch-convoy-command-panel',
}: DispatchConvoyCommandPanelProps) {
  const { width: windowWidth } = useWindowDimensions();
  const commandData = useConvoyCommandData();
  const routeSession = useNavigateRouteSessionSnapshot();
  const trackingSnapshot = useConvoyTrackingStore();
  const [subscriptionOwnerId] = useState(() => {
    dispatchConvoySubscriptionOwnerSequence += 1;
    return `dispatch-convoy-command-panel:${dispatchConvoySubscriptionOwnerSequence}`;
  });
  const [activeContext, setActiveContext] = useState<ActiveConvoyContext | null>(null);
  const [sharingState, setSharingState] = useState<ConvoyLocationSharingState | null>(null);
  const [sharingBusy, setSharingBusy] = useState(false);
  const sharingBusyRef = useRef(false);
  const [trackingNote, setTrackingNote] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [regroupPlannerVisible, setRegroupPlannerVisible] = useState(false);
  const isCompact = windowWidth < 820;
  const viewModel = useMemo(
    () => selectConvoyCommandPanelViewModel({ commandData }),
    [commandData],
  );
  const fallbackMapMembers = useMemo(() => fallbackVehiclesFromSharedCommandData(commandData), [commandData]);
  const hasActiveConvoy = Boolean(activeContext?.convoyId);
  const liveMapMembers = useMemo(
    () => hasActiveConvoy &&
      positionSharingRolloutEnabled &&
      memberLocationPermissionAllowed &&
      trackingSnapshot.convoyId === activeContext?.convoyId
      ? trackingSnapshot.members
      : [],
    [
      activeContext?.convoyId,
      hasActiveConvoy,
      memberLocationPermissionAllowed,
      positionSharingRolloutEnabled,
      trackingSnapshot.convoyId,
      trackingSnapshot.members,
    ],
  );
  const routeSessionLocalMapMember = useMemo(
    () => localVehicleFromSharedRouteSession(routeSession, activeContext),
    [activeContext, routeSession],
  );
  const gpsLocalMapMember = useMemo(
    () => localVehicleFromSharedUserLocation(userLocation, activeContext),
    [activeContext, userLocation],
  );
  const localMapMember = routeSessionLocalMapMember ?? gpsLocalMapMember;
  const mapMembers = useMemo(
    () => !hasActiveConvoy
      ? localMapMember
        ? [localMapMember]
        : []
      : liveMapMembers.length > 0
        ? liveMapMembers
        : memberLocationPermissionAllowed && fallbackMapMembers.length > 0
          ? fallbackMapMembers
          : localMapMember
            ? [localMapMember]
            : [],
    [fallbackMapMembers, hasActiveConvoy, liveMapMembers, localMapMember, memberLocationPermissionAllowed],
  );
  const mapConnectionStatus: ConvoyRealtimeConnectionStatus =
    hasActiveConvoy &&
    positionSharingRolloutEnabled &&
    memberLocationPermissionAllowed &&
    trackingSnapshot.convoyId === activeContext?.convoyId
      ? trackingSnapshot.connectionStatus
      : hasActiveConvoy && fallbackMapMembers.length > 0
        ? 'disconnected'
        : 'idle';
  const activeConvoyRawMemberCount =
    hasActiveConvoy && trackingSnapshot.convoyId === activeContext?.convoyId
      ? trackingSnapshot.rawMembers.filter((member) => !member.revoked_at).length
      : 0;
  const regroupLocalContextRefreshKey = [
    convoyLifecycleRevision,
    routeSession.updatedAt ?? 'route-unset',
    trackingSnapshot.lastUpdated ?? 'tracking-unset',
  ].join(':');
  const regroupLocalContext = useMemo(() => {
    void regroupLocalContextRefreshKey;
    if (
      !regroupPlannerEnabled ||
      !positionSharingRolloutEnabled ||
      !regroupPlannerPermissionAllowed ||
      !routeSession.routeId
    ) {
      return null;
    }
    return readConvoyRegroupLocalContext({ routeId: routeSession.routeId });
  }, [
    positionSharingRolloutEnabled,
    regroupLocalContextRefreshKey,
    regroupPlannerEnabled,
    regroupPlannerPermissionAllowed,
    routeSession.routeId,
  ]);
  const regroupPlannerResult = useMemo(
    () => selectConvoyRegroupPlannerResult({
      enabled: regroupPlannerEnabled,
      positionSharingEnabled: positionSharingRolloutEnabled,
      memberLocationPermissionAllowed: regroupPlannerPermissionAllowed,
      activeConvoyId: activeContext?.convoyId,
      routeSession,
      trackingConnectionStatus: mapConnectionStatus,
      members: liveMapMembers,
      localContext: regroupLocalContext,
      expeditionId,
      vehicleConstraints,
    }),
    [
      activeContext?.convoyId,
      expeditionId,
      liveMapMembers,
      mapConnectionStatus,
      positionSharingRolloutEnabled,
      regroupLocalContext,
      regroupPlannerEnabled,
      regroupPlannerPermissionAllowed,
      routeSession,
      vehicleConstraints,
    ],
  );

  useEffect(() => {
    if (regroupPlannerEnabled && regroupPlannerOpenRequest > 0) {
      setRegroupPlannerVisible(true);
    }
  }, [regroupPlannerEnabled, regroupPlannerOpenRequest]);
  const panelViewModel = useMemo(
    () => buildSharedActiveConvoyPanelViewModel({
      baseViewModel: viewModel,
      activeContext,
      mapMembers,
      rawMemberCount: activeConvoyRawMemberCount,
      trackingLastUpdated: trackingSnapshot.lastUpdated,
      trackingConnectionStatus: mapConnectionStatus,
    }),
    [
      activeContext,
      activeConvoyRawMemberCount,
      mapConnectionStatus,
      mapMembers,
      trackingSnapshot.lastUpdated,
      viewModel,
    ],
  );
  const selectedMapMember = mapMembers.find((member) => member.memberId === selectedMemberId) ?? null;
  const widestGapLabel = formatConvoyDistanceMiles(panelViewModel.widestGapMiles) ?? '--';
  const hasConvoyData = panelViewModel.vehicleCount > 0 || panelViewModel.members.length > 0;
  const canShareLiveLocation = Boolean(
    positionSharingRolloutEnabled && activeContext?.convoyId && activeContext?.memberId,
  );
  const isSharingLiveLocation = Boolean(sharingState?.enabled);
  const truthLine = !positionSharingRolloutEnabled
    ? 'Live convoy location sharing is unavailable in this rollout.'
    : !memberLocationPermissionAllowed && hasActiveConvoy
      ? 'Active convoy roster available. Shared member locations are restricted.'
      : panelViewModel.isUsingLiveData && isSharingLiveLocation
        ? 'Live convoy location sharing is active.'
        : hasActiveConvoy
          ? isSharingLiveLocation
            ? 'Live sharing is on; waiting for fresh convoy reports.'
            : 'Tracking disabled. Active convoy roster is available.'
          : hasConvoyData
            ? 'Convoy roster/check-in state available; live tracking is not active.'
            : 'No active convoy. Live convoy tracking is not being simulated.';
  const primaryEmergencyEvent = emergencyEvents[0] ?? null;
  const isFeedPresentation = presentation === 'feed';
  const isSignalOnlyPresentation = presentation === 'signals';
  const isSummaryOnlyPresentation = presentation === 'summary';
  const summaryCompact = isCompact || isFeedPresentation || isSummaryOnlyPresentation;
  const shouldPulseEmergencyCount = emergencyAlertActive ?? emergencyEvents.length > 0;
  const emergencyPulseOpacity = useEmergencyPulse(shouldPulseEmergencyCount);
  const resolvedEmergencyButtonLabel = emergencyButtonLabel ?? (emergencySubmitting ? 'GETTING GPS' : 'PING GPS');
  const resolvedEmergencyButtonTone = emergencyButtonTone ?? TACTICAL.danger;
  const shouldShowIntegratedEmergencyFeed =
    !isSignalOnlyPresentation &&
    (!isSummaryOnlyPresentation || emergencyEvents.length > 0);
  const shouldShowEmergencyOverlay =
    showEmergencyOverlay ?? (!isFeedPresentation && !isSignalOnlyPresentation && !isSummaryOnlyPresentation);
  const visibleTrackingNote =
    trackingNote ??
    (!hasActiveConvoy ? sharingState?.lastStopReason : null) ??
    (hasActiveConvoy && isConvoyLifecycleStopMessage(sharingState?.lastError) ? null : sharingState?.lastError) ??
    (hasActiveConvoy && trackingSnapshot.convoyId === activeContext?.convoyId ? trackingSnapshot.error : null);
  const showCommandFooterFacts = !summaryCompact;
  const showSummaryConvoySignals = isSummaryOnlyPresentation && panelViewModel.isUsingLiveData && panelViewModel.members.length > 0;

  const refreshLiveSharingControls = useCallback(async () => {
    const [context, state] = await Promise.all([
      convoyMembershipService.getActiveConvoyContext(),
      getConvoyLocationSharingState(),
    ]);
    setActiveContext(context);
    setSharingState(state);
    return { context, state };
  }, []);

  useEffect(() => {
    let mounted = true;
    void navigateRouteSessionStore.hydrateFromPersistence();
    void (async () => {
      try {
        const [context, state] = await Promise.all([
          convoyMembershipService.getActiveConvoyContext(),
          getConvoyLocationSharingState(),
        ]);
        if (!mounted) return;
        setActiveContext(context);
        setSharingState(state);
      } catch {
        if (mounted) setTrackingNote('Live sharing state could not be refreshed.');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [convoyLifecycleRevision]);

  useEffect(() => {
    if (
      !activeContext?.convoyId ||
      !positionSharingRolloutEnabled ||
      !memberLocationPermissionAllowed
    ) {
      return undefined;
    }
    void subscribeToConvoyLocations(activeContext.convoyId, subscriptionOwnerId);
    return () => {
      stopConvoyLocationSubscription(subscriptionOwnerId);
    };
  }, [activeContext?.convoyId, memberLocationPermissionAllowed, positionSharingRolloutEnabled, subscriptionOwnerId]);

  useEffect(() => {
    if (!activeContext?.convoyId) return undefined;
    const timer = setInterval(() => {
      refreshConvoyTrackingStaleness();
    }, CONVOY_TRACKING_STALENESS_REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [activeContext?.convoyId]);

  async function handleStartLiveSharing() {
    if (sharingBusyRef.current) return;

    if (!positionSharingRolloutEnabled) {
      setTrackingNote('Live convoy location sharing is unavailable in this rollout.');
      return;
    }

    sharingBusyRef.current = true;
    setSharingBusy(true);
    setTrackingNote(null);

    try {
      const refreshed = activeContext?.convoyId && activeContext.memberId
        ? { context: activeContext, state: sharingState }
        : await refreshLiveSharingControls();
      const context = refreshed.context;

      if (!context?.convoyId || !context.memberId) {
        setTrackingNote('Create or join a convoy before starting live sharing.');
        return;
      }

      const result = await startConvoyLocationSharing({
        convoyId: context.convoyId,
        memberId: context.memberId,
      });
      const nextState = result.ok ? result.data : await getConvoyLocationSharingState();
      setActiveContext(context);
      setSharingState(nextState);
      setTrackingNote(result.ok ? null : result.error);
      if (result.ok && memberLocationPermissionAllowed) {
        void subscribeToConvoyLocations(context.convoyId, subscriptionOwnerId);
      }
    } catch (error) {
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : 'Live sharing could not be updated.';
      setTrackingNote(message);
      try {
        setSharingState(await getConvoyLocationSharingState());
      } catch {}
    } finally {
      sharingBusyRef.current = false;
      setSharingBusy(false);
    }
  }

  async function performStopLiveSharing() {
    if (sharingBusyRef.current) return;

    sharingBusyRef.current = true;
    setSharingBusy(true);
    setTrackingNote(null);

    try {
      const result = await stopConvoyLocationSharing('Live sharing stopped by user.');
      setSharingState(result.ok ? result.data : await getConvoyLocationSharingState());
      setTrackingNote(result.ok ? null : result.error);
    } catch (error) {
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : 'Live sharing could not be stopped.';
      setTrackingNote(message);
      try {
        setSharingState(await getConvoyLocationSharingState());
      } catch {}
    } finally {
      sharingBusyRef.current = false;
      setSharingBusy(false);
    }
  }

  function handleShareLiveLocationPress() {
    if (isSharingLiveLocation) {
      handleStopLiveSharing();
      return;
    }

    void handleStartLiveSharing();
  }

  function handleStopLiveSharing() {
    Alert.alert(
      'Stop live sharing?',
      'Your convoy location will stop updating for active convoy members.',
      [
        { text: 'Keep sharing', style: 'cancel' },
        {
          text: 'Stop sharing',
          style: 'destructive',
          onPress: () => {
            void performStopLiveSharing();
          },
        },
      ],
    );
  }

  function handlePreviewRegroupProposal() {
    const proposal = regroupPlannerResult.proposal;
    if (!proposal || !canPreviewRegroupOnMap || !onPreviewRegroupProposal) return;
    setRegroupPlannerVisible(false);
    onPreviewRegroupProposal(proposal);
  }

  function handleCreateRegroupRallyPing() {
    const proposal = regroupPlannerResult.proposal;
    if (!proposal || !canCreateRallyPing || !onCreateRegroupRallyDraft) return;
    setRegroupPlannerVisible(false);
    onCreateRegroupRallyDraft(createConvoyRegroupRallyDraft(proposal));
  }

  function handleReturnToCommandBoard() {
    setRegroupPlannerVisible(false);
    onReturnToCommandBoard?.();
  }

  return (
    <View
      testID={testID}
      style={[
        styles.shell,
        isFeedPresentation || isSignalOnlyPresentation || isSummaryOnlyPresentation ? styles.feedShell : null,
        isSummaryOnlyPresentation ? styles.summaryOnlyShell : null,
      ]}
    >
      {!isSummaryOnlyPresentation ? (
      <View style={[styles.panelStage, isFeedPresentation || isSignalOnlyPresentation ? styles.feedPanelStage : null]}>
        {hasActiveConvoy ? (
          <ConvoySignalSurface
            compact={isFeedPresentation || isSignalOnlyPresentation}
            panelViewModel={panelViewModel}
            members={liveMapMembers}
            connectionStatus={mapConnectionStatus}
            selectedMemberId={selectedMemberId}
            onSelectMemberId={setSelectedMemberId}
            emergencyEvents={emergencyEvents}
            onOpenEmergencyEvent={onOpenEmergencyEvent}
          />
        ) : (
          <InactiveConvoySurface
            compact={isFeedPresentation || isSignalOnlyPresentation}
            connectionLabel={connectionLabel}
            hasActiveTeam={hasActiveTeam}
            teamStatusLabel={teamStatusLabel}
          />
        )}
      </View>
      ) : null}

      {!isSignalOnlyPresentation ? (
      <View
        style={[
          styles.commandSummary,
          isFeedPresentation ? styles.feedCommandSummary : null,
          isSummaryOnlyPresentation ? styles.summaryCommandSummary : null,
        ]}
      >
        <View style={styles.legendHeaderRow}>
          <View style={styles.legendTitleBlock}>
            <Text style={[styles.eyebrow, summaryCompact ? styles.eyebrowCompact : null]}>DISPATCH CONVOY COMMAND</Text>
            <Text
              style={[styles.groupName, summaryCompact ? styles.groupNameCompact : null]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {panelViewModel.groupName}
            </Text>
          </View>
        </View>

        <Text
          style={[styles.truthLine, isCompact ? styles.truthLineCompact : null, isFeedPresentation ? styles.truthLineFeed : null]}
          numberOfLines={summaryCompact ? 1 : 2}
          adjustsFontSizeToFit={summaryCompact}
          minimumFontScale={0.7}
        >
          {truthLine}
        </Text>

        <View style={[styles.trackingRow, isFeedPresentation ? styles.trackingRowFeed : null]}>
          <View style={styles.trackingStatusBlock}>
            {isSharingLiveLocation && !isFeedPresentation ? (
              <View style={styles.liveSharingActivePill}>
                <View style={styles.liveSharingDot} />
                <Text style={styles.liveSharingActiveText}>Live Sharing Active</Text>
              </View>
            ) : null}
            <Text style={[styles.trackingStatus, isFeedPresentation ? styles.trackingStatusFeed : null]} numberOfLines={1}>
              {formatTrackingStatus(sharingState)}
              {selectedMapMember ? ` / selected ${selectedMapMember.callsign}` : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.trackingButton,
              isFeedPresentation ? styles.trackingButtonFeed : null,
              isSharingLiveLocation ? styles.trackingButtonStop : null,
              sharingBusy || (!isSharingLiveLocation && !positionSharingRolloutEnabled)
                ? styles.trackingButtonDisabled
                : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={isSharingLiveLocation ? 'Stop live convoy location sharing' : 'Start live convoy location sharing'}
            accessibilityHint={canShareLiveLocation
              ? undefined
              : positionSharingRolloutEnabled
                ? 'Refreshes convoy membership state before starting live sharing.'
                : 'Live convoy location sharing is unavailable in this rollout.'}
            accessibilityState={{ disabled: sharingBusy || (!isSharingLiveLocation && !positionSharingRolloutEnabled) }}
            activeOpacity={sharingBusy || (!isSharingLiveLocation && !positionSharingRolloutEnabled) ? 1 : 0.78}
            disabled={sharingBusy || (!isSharingLiveLocation && !positionSharingRolloutEnabled)}
            onPress={handleShareLiveLocationPress}
          >
            <Ionicons
              name={isSharingLiveLocation ? 'pause-circle-outline' : 'radio-outline'}
              size={14}
              color={isSharingLiveLocation ? TACTICAL.danger : TACTICAL.amber}
            />
            <Text
              style={[
                styles.trackingButtonText,
                isSharingLiveLocation ? styles.trackingButtonTextStop : null,
              ]}
              numberOfLines={1}
            >
              {sharingBusy
                ? 'Updating'
                : isFeedPresentation
                  ? isSharingLiveLocation ? 'Stop' : 'Share'
                  : isSharingLiveLocation ? 'Stop live sharing' : 'Start live sharing'}
            </Text>
          </TouchableOpacity>
        </View>
        {visibleTrackingNote ? (
          <Text style={styles.trackingNote} numberOfLines={2}>
            {visibleTrackingNote}
          </Text>
        ) : null}

        <View
          style={[
            styles.legendMetricGrid,
            summaryCompact ? styles.legendMetricGridCompact : null,
            isSummaryOnlyPresentation ? styles.summaryMetricGrid : null,
            showSummaryConvoySignals ? styles.summaryMetricGridWithSignals : null,
          ]}
        >
          <LegendMetric
            label={summaryCompact ? 'Veh' : 'Vehicles'}
            value={formatVehicleCount(panelViewModel.vehicleCount)}
            compact={summaryCompact}
            expanded={isSummaryOnlyPresentation}
          />
          <LegendMetric
            label={summaryCompact ? 'Rpt' : 'Reporting'}
            value={`${panelViewModel.reportingCount}/${Math.max(panelViewModel.vehicleCount, panelViewModel.members.length)}`}
            compact={summaryCompact}
            expanded={isSummaryOnlyPresentation}
          />
          <LegendMetric
            label={summaryCompact ? 'Gap' : 'Widest gap'}
            value={widestGapLabel}
            compact={summaryCompact}
            expanded={isSummaryOnlyPresentation}
          />
          <LegendMetric
            label="Rally"
            value={regroupPlannerEnabled
              ? getRegroupPlannerMetricValue(regroupPlannerResult)
              : panelViewModel.regroupSuggested ? 'Advised' : 'Standby'}
            compact={summaryCompact}
            expanded={isSummaryOnlyPresentation}
            caution={regroupPlannerEnabled
              ? regroupPlannerResult.posture === 'watch' || regroupPlannerResult.posture === 'dispersed'
              : panelViewModel.regroupSuggested}
          />
        </View>

        {regroupPlannerEnabled ? (
          <TouchableOpacity
            testID="dispatch-convoy-regroup-action"
            style={styles.regroupAction}
            accessibilityRole="button"
            accessibilityLabel={`Open Smart Rally. ${getRegroupPlannerActionCopy(regroupPlannerResult)}.`}
            accessibilityHint="Reviews a deterministic proposal without sending a message or changing guidance."
            activeOpacity={0.78}
            onPress={() => setRegroupPlannerVisible(true)}
          >
            <View style={styles.regroupActionIcon}>
              <Ionicons name="git-merge-outline" size={15} color={TACTICAL.amber} />
            </View>
            <View style={styles.regroupActionCopy}>
              <Text style={styles.regroupActionTitle}>SMART RALLY</Text>
              <Text style={styles.regroupActionSubtitle} numberOfLines={1}>
                {getRegroupPlannerActionCopy(regroupPlannerResult)}
              </Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={15} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        ) : null}

        {shouldShowIntegratedEmergencyFeed ? (
          <View
            style={[
              styles.emergencyInlineRail,
              isFeedPresentation || isSummaryOnlyPresentation ? styles.emergencyInlineRailCompact : null,
              primaryEmergencyEvent ? styles.emergencyInlineRailActive : null,
            ]}
          >
            <View style={styles.emergencyInlineHeader}>
              <View style={styles.emergencyInlineTitleGroup}>
                <Ionicons
                  name={primaryEmergencyEvent ? 'alert-circle-outline' : 'locate-outline'}
                  size={isFeedPresentation || isSummaryOnlyPresentation ? 12 : 14}
                  color={primaryEmergencyEvent ? TACTICAL.danger : TACTICAL.textMuted}
                />
                <Text style={styles.emergencyInlineTitle} numberOfLines={1}>Emergency Pings</Text>
              </View>
              <Animated.Text
                style={[
                  styles.emergencyInlineCount,
                  primaryEmergencyEvent ? styles.emergencyInlineCountActive : null,
                  primaryEmergencyEvent && shouldPulseEmergencyCount ? { opacity: emergencyPulseOpacity } : null,
                ]}
              >
                {emergencyEvents.length} active
              </Animated.Text>
            </View>
            {primaryEmergencyEvent ? (
              <TouchableOpacity
                style={[
                  styles.emergencyInlineEventRow,
                  isFeedPresentation || isSummaryOnlyPresentation ? styles.emergencyInlineEventRowCompact : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Open active GPS ping detail"
                accessibilityHint="Tap for ping detail and Navigate route handoff"
                activeOpacity={0.8}
                onPress={() => onOpenEmergencyEvent(primaryEmergencyEvent)}
              >
                <View style={styles.emergencyInlineCopy}>
                  <Text style={styles.emergencyInlineEventTitle} numberOfLines={1}>
                    Active GPS Ping
                  </Text>
                  <Text style={styles.emergencyInlineEventMeta} numberOfLines={1}>
                    {formatEmergencyEventTime(primaryEmergencyEvent)} / {getEmergencyLocationLabel(primaryEmergencyEvent)}
                  </Text>
                </View>
                <Text style={styles.emergencyInlineActionText} numberOfLines={1}>Open</Text>
                <Ionicons name="navigate-outline" size={14} color={TACTICAL.amber} />
              </TouchableOpacity>
            ) : (
              <Text style={styles.emergencyInlineEmptyText} numberOfLines={1}>
                No active GPS pings. Use PING GPS only for immediate convoy recovery targets.
              </Text>
            )}
          </View>
        ) : null}

        {!isFeedPresentation && (!isSummaryOnlyPresentation || showSummaryConvoySignals) ? (
          <View style={[styles.legendMemberStack, showSummaryConvoySignals ? styles.summaryMemberStack : null]}>
            <Text style={[styles.memberTitle, summaryCompact ? styles.memberTitleCompact : null]}>CONVOY SIGNALS</Text>
            {(panelViewModel.members.length > 0 ? panelViewModel.members.slice(0, isSummaryOnlyPresentation ? 2 : 4) : [
              { id: 'empty', displayName: 'No live convoy members', isReporting: false, isLostSignal: false, isStale: true },
            ]).map((member) => {
              const tone = member.isLostSignal ? TACTICAL.danger : member.isReporting ? TACTICAL.text : TACTICAL.amber;
              const selected = selectedMemberId === member.id;
              return (
                <TouchableOpacity
                  key={member.id}
                  style={[styles.memberRow, selected ? styles.memberRowSelected : null]}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${member.displayName}`}
                  activeOpacity={member.id === 'empty' ? 1 : 0.76}
                  disabled={member.id === 'empty'}
                  onPress={() => setSelectedMemberId(member.id)}
                >
                  <View style={[styles.memberDot, { backgroundColor: tone }]} />
                  <Text style={[styles.memberName, summaryCompact ? styles.memberNameCompact : null]} numberOfLines={1}>{member.displayName}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {showCommandFooterFacts ? (
          <View style={[styles.legendFactRow, isFeedPresentation ? styles.legendFactRowFeed : null]}>
            <LegendFact label="Team" value={hasActiveTeam ? `${teamMemberCount} member${teamMemberCount === 1 ? '' : 's'}` : 'Inactive'} />
            <LegendFact label="Link" value={`${connectionLabel} / ${teamStatusLabel}`} />
            <LegendFact label="Updated" value={formatUpdatedAt(panelViewModel.updatedAt)} />
          </View>
        ) : null}

        {shouldShowEmergencyOverlay ? (
          <View style={styles.legendEmergencyRow}>
            <Text style={[styles.emergencyText, isCompact ? styles.emergencyTextCompact : null]} numberOfLines={2}>
              GPS ping stays inside ECS team recovery. It does not contact emergency services.
            </Text>
            <TouchableOpacity
              style={[
                styles.emergencyButton,
                isCompact ? styles.emergencyButtonCompact : null,
                resolvedEmergencyButtonTone === TACTICAL.amber ? styles.emergencyButtonAmber : null,
                emergencySubmitting ? styles.emergencyButtonDisabled : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send emergency coordinate ping"
              accessibilityState={{ disabled: emergencySubmitting }}
              activeOpacity={emergencySubmitting ? 1 : 0.78}
              disabled={emergencySubmitting}
              onPress={onEmergencyPing}
            >
              <Ionicons name="locate-outline" size={isCompact ? 13 : 15} color={resolvedEmergencyButtonTone} />
              <Text
                style={[
                  styles.emergencyButtonText,
                  isCompact ? styles.emergencyButtonTextCompact : null,
                  { color: resolvedEmergencyButtonTone },
                ]}
                numberOfLines={1}
              >
                {resolvedEmergencyButtonLabel}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      ) : null}
      {regroupPlannerEnabled ? (
        <ConvoyRegroupPlannerSheet
          visible={regroupPlannerVisible}
          result={regroupPlannerResult}
          canPreviewMap={canPreviewRegroupOnMap}
          canCreateRallyPing={canCreateRallyPing}
          previewUnavailableReason={previewRegroupUnavailableReason}
          rallyUnavailableReason={rallyPingUnavailableReason ?? regroupPlannerPermissionReason}
          onClose={() => setRegroupPlannerVisible(false)}
          onPreviewMap={handlePreviewRegroupProposal}
          onCreateRallyPing={handleCreateRegroupRallyPing}
          onReturnToCommandBoard={onReturnToCommandBoard ? handleReturnToCommandBoard : undefined}
        />
      ) : null}
    </View>
  );
}

function getRegroupPlannerActionCopy(result: ConvoyRegroupPlannerResult): string {
  if (result.status === 'proposal') return 'Review proposal';
  if (result.status === 'not_needed') return 'Within thresholds';
  if (result.status === 'restricted') return 'Location restricted';
  if (result.status === 'unavailable') return 'Inputs unavailable';
  return 'Planner disabled';
}

function getRegroupPlannerMetricValue(result: ConvoyRegroupPlannerResult): string {
  if (result.status === 'proposal') return 'Proposal';
  if (result.status === 'not_needed') return 'Standby';
  if (result.status === 'restricted') return 'Restricted';
  return 'Unknown';
}

function InactiveConvoySurface({
  compact,
  connectionLabel,
  hasActiveTeam,
  teamStatusLabel,
}: {
  compact: boolean;
  connectionLabel: string;
  hasActiveTeam: boolean;
  teamStatusLabel: string;
}) {
  return (
    <View style={[styles.inactiveConvoySurface, compact ? styles.inactiveConvoySurfaceCompact : null]}>
      <View pointerEvents="none" style={styles.inactiveGridLayer}>
        {[0, 1, 2, 3].map((line) => (
          <View
            key={`inactive-h-${line}`}
            style={[styles.inactiveGridLine, styles.inactiveGridLineHorizontal, { top: `${22 + line * 18}%` }]}
          />
        ))}
        {[0, 1, 2, 3, 4].map((line) => (
          <View
            key={`inactive-v-${line}`}
            style={[styles.inactiveGridLine, styles.inactiveGridLineVertical, { left: `${14 + line * 18}%` }]}
          />
        ))}
        <View style={styles.inactiveScanRing} />
        <View style={styles.inactiveScanRingInner} />
        <View style={styles.inactiveContourLineA} />
        <View style={styles.inactiveContourLineB} />
      </View>

      <View style={[styles.inactiveConvoyContent, compact ? styles.inactiveConvoyContentCompact : null]}>
        <Text style={[styles.inactiveConvoyEyebrow, compact ? styles.inactiveConvoyEyebrowCompact : null]}>
          CONVOY TRACKING STANDBY
        </Text>
        <Text style={[styles.inactiveConvoyTitle, compact ? styles.inactiveConvoyTitleCompact : null]}>
          No Active Convoy
        </Text>
        <Text
          style={[styles.inactiveConvoyBody, compact ? styles.inactiveConvoyBodyCompact : null]}
          numberOfLines={compact ? 2 : 3}
        >
          Create or join a convoy to enable live member tracking. Dispatch, Share, Profile, and Convoy actions remain available.
        </Text>
        <View style={styles.inactiveConvoyMetaRow}>
          <View style={styles.inactiveConvoyMeta}>
            <Text style={styles.inactiveConvoyMetaLabel}>Team</Text>
            <Text style={styles.inactiveConvoyMetaValue} numberOfLines={1}>
              {hasActiveTeam ? teamStatusLabel : 'Inactive'}
            </Text>
          </View>
          <View style={styles.inactiveConvoyMeta}>
            <Text style={styles.inactiveConvoyMetaLabel}>Link</Text>
            <Text style={styles.inactiveConvoyMetaValue} numberOfLines={1}>
              {connectionLabel}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function ConvoySignalSurface({
  compact,
  panelViewModel,
  members,
  connectionStatus,
  selectedMemberId,
  onSelectMemberId,
  emergencyEvents,
  onOpenEmergencyEvent,
}: {
  compact: boolean;
  panelViewModel: ConvoyCommandPanelViewModel;
  members: ConvoyMapVehicle[];
  connectionStatus: ConvoyRealtimeConnectionStatus;
  selectedMemberId: string | null;
  onSelectMemberId: (memberId: string) => void;
  emergencyEvents: DispatchEvent[];
  onOpenEmergencyEvent: (event: DispatchEvent) => void;
}) {
  const primaryEmergencyEvent = emergencyEvents[0] ?? null;
  const visibleMembers = members.length > 0 ? members.slice(0, compact ? 4 : 6) : [];
  const activeCount = members.filter((member) => !member.isStale && member.movementStatus !== 'offline').length;
  const staleCount = members.filter((member) => member.isStale || member.movementStatus === 'offline').length;
  const assistCount = members.filter((member) => member.movementStatus === 'needs_assistance').length;
  const totalCount = Math.max(panelViewModel.vehicleCount, members.length);
  const missingReportCount = Math.max(0, totalCount - members.length);
  const reportWatchCount = staleCount + missingReportCount;
  const signalState = assistCount > 0
    ? {
        label: 'ASSISTANCE REQUIRED',
        detail: `${assistCount} member${assistCount === 1 ? '' : 's'} flagged for immediate review.`,
        icon: 'alert-circle-outline' as const,
        tone: TACTICAL.danger,
      }
    : connectionStatus !== 'connected'
      ? {
          label: 'LINK DEGRADED',
          detail: 'Showing the latest received reports while the convoy link reconnects.',
          icon: 'cloud-offline-outline' as const,
          tone: TACTICAL.amber,
        }
      : members.length === 0
        ? {
            label: 'AWAITING REPORTS',
            detail: 'No consenting live GPS reports have been received yet.',
            icon: 'radio-outline' as const,
            tone: TACTICAL.amber,
          }
      : reportWatchCount > 0
        ? {
            label: 'SIGNAL WATCH',
            detail: `${reportWatchCount} member${reportWatchCount === 1 ? '' : 's'} need a fresh GPS report.`,
            icon: 'time-outline' as const,
            tone: TACTICAL.amber,
          }
        : {
            label: 'FORMATION NOMINAL',
            detail: `${activeCount}/${totalCount} consenting member${totalCount === 1 ? '' : 's'} reporting live.`,
            icon: 'shield-checkmark-outline' as const,
            tone: '#49D17A',
          };

  return (
    <View style={[styles.signalSurface, compact ? styles.signalSurfaceCompact : null]}>
      <View style={styles.signalHeaderRow}>
        <View style={styles.signalTitleBlock}>
          <Text style={[styles.signalEyebrow, compact ? styles.signalEyebrowCompact : null]}>
            ACTIVE CONVOY
          </Text>
          <Text style={[styles.signalTitle, compact ? styles.signalTitleCompact : null]} numberOfLines={1}>
            {panelViewModel.groupName}
          </Text>
        </View>
        <View style={[styles.signalStatusPill, connectionStatus === 'connected' ? styles.signalStatusPillLive : null]}>
          <Text style={styles.signalStatusPillText} numberOfLines={1}>
            {connectionStatus === 'connected' ? 'LIVE' : connectionStatus.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={[styles.signalOperationalStrip, { borderLeftColor: signalState.tone }]}>
        <View
          style={[
            styles.signalOperationalIcon,
            { borderColor: `${signalState.tone}66`, backgroundColor: `${signalState.tone}14` },
          ]}
        >
          <Ionicons name={signalState.icon} size={compact ? 14 : 17} color={signalState.tone} />
        </View>
        <View style={styles.signalOperationalCopy}>
          <Text style={[styles.signalOperationalLabel, { color: signalState.tone }]} numberOfLines={1}>
            {signalState.label}
          </Text>
          <Text style={styles.signalOperationalDetail} numberOfLines={compact ? 1 : 2}>
            {signalState.detail}
          </Text>
        </View>
      </View>

      <View style={styles.signalMetricRow}>
        <SignalMetric label="Reporting" value={`${activeCount}/${totalCount}`} compact={compact} />
        <SignalMetric label="Stale" value={`${staleCount}`} compact={compact} caution={staleCount > 0} />
        <SignalMetric label="Assist" value={`${assistCount}`} compact={compact} caution={assistCount > 0} />
        <SignalMetric label="Gap" value={formatConvoyDistanceMiles(panelViewModel.widestGapMiles) ?? '--'} compact={compact} caution={panelViewModel.regroupSuggested} />
      </View>

      <View style={styles.signalRosterHeader}>
        <Text style={styles.signalRosterLabel}>ROSTER TELEMETRY</Text>
        <Text style={styles.signalRosterCount}>{visibleMembers.length} SHOWN</Text>
      </View>

      <View style={styles.signalMemberList}>
        {visibleMembers.length > 0 ? visibleMembers.map((member) => {
          const selected = selectedMemberId === member.memberId;
          const tone =
            member.movementStatus === 'needs_assistance'
              ? TACTICAL.danger
              : member.movementStatus === 'offline' || member.isStale
                ? TACTICAL.amber
                : TACTICAL.text;
          return (
            <TouchableOpacity
              key={member.memberId}
              style={[styles.signalMemberRow, selected ? styles.signalMemberRowSelected : null]}
              accessibilityRole="button"
              accessibilityLabel={`Select ${member.callsign}`}
              activeOpacity={0.76}
              onPress={() => onSelectMemberId(member.memberId)}
            >
              <View style={[styles.signalMemberDot, { backgroundColor: tone }]} />
              <View style={styles.signalMemberCopy}>
                <Text style={styles.signalMemberName} numberOfLines={1}>
                  {member.callsign}
                </Text>
                <Text style={styles.signalMemberRole} numberOfLines={1}>
                  {member.role.toUpperCase()}
                  {member.displayName && member.displayName !== member.callsign ? ` / ${member.displayName}` : ''}
                </Text>
              </View>
              <Text style={styles.signalMemberStatus} numberOfLines={1}>
                {member.isStale ? 'STALE' : member.movementStatus.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        }) : (
          <View style={styles.signalEmptyState}>
            <Text style={styles.signalEmptyTitle}>Waiting for shared GPS</Text>
            <Text style={styles.signalEmptyBody} numberOfLines={2}>
              Consenting members appear on Navigate during an active expedition.
            </Text>
          </View>
        )}
      </View>

      {primaryEmergencyEvent ? (
        <TouchableOpacity
          style={styles.signalEmergencyRow}
          accessibilityRole="button"
          accessibilityLabel="Open active GPS ping"
          activeOpacity={0.78}
          onPress={() => onOpenEmergencyEvent(primaryEmergencyEvent)}
        >
          <Ionicons name="alert-circle-outline" size={compact ? 13 : 15} color={TACTICAL.danger} />
          <View style={styles.signalEmergencyCopy}>
            <Text style={styles.signalEmergencyTitle} numberOfLines={1}>
              Active GPS Ping
            </Text>
            <Text style={styles.signalEmergencyMeta} numberOfLines={1}>
              {formatEmergencyEventTime(primaryEmergencyEvent)} / {getEmergencyLocationLabel(primaryEmergencyEvent)}
            </Text>
          </View>
          <Ionicons name="navigate-outline" size={compact ? 13 : 15} color={TACTICAL.amber} />
        </TouchableOpacity>
      ) : (
        <View style={styles.signalPrivacyRow}>
          <Ionicons name="lock-closed-outline" size={11} color={TACTICAL.textMuted} />
          <Text style={styles.signalFooterText} numberOfLines={1}>
            Roster reflects consent-based GPS reports only.
          </Text>
        </View>
      )}
    </View>
  );
}

function SignalMetric({
  label,
  value,
  compact,
  caution = false,
}: {
  label: string;
  value: string;
  compact: boolean;
  caution?: boolean;
}) {
  return (
    <View style={[styles.signalMetric, compact ? styles.signalMetricCompact : null]}>
      <Text style={styles.signalMetricLabel}>{label}</Text>
      <Text style={[styles.signalMetricValue, caution ? styles.signalMetricValueCaution : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function LegendMetric({
  label,
  value,
  compact,
  caution = false,
  expanded = false,
}: {
  label: string;
  value: string;
  compact: boolean;
  caution?: boolean;
  expanded?: boolean;
}) {
  return (
    <View style={[styles.legendMetric, compact ? styles.legendMetricCompact : null, expanded ? styles.legendMetricExpanded : null]}>
      <Text style={[styles.metricLabel, compact ? styles.metricLabelCompact : null]}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          compact ? styles.metricValueCompact : null,
          caution ? styles.metricValueCaution : null,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.74}
      >
        {value}
      </Text>
    </View>
  );
}

function LegendFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.legendFact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 0,
    gap: 10,
  },
  feedShell: {
    flex: 1,
    minHeight: 0,
    gap: 4,
  },
  summaryOnlyShell: {
    flex: 1,
    minHeight: 0,
  },
  panelStage: {
    width: '100%',
    alignSelf: 'center',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  feedPanelStage: {
    flex: 0,
    minHeight: 0,
  },
  inactiveConvoySurface: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.default,
    backgroundColor: ECS_SURFACE.background.primary,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  inactiveConvoySurfaceCompact: {
    minHeight: 150,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inactiveGridLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.86,
  },
  inactiveGridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(139,148,158,0.12)',
  },
  inactiveGridLineHorizontal: {
    left: 0,
    right: 0,
    height: 1,
  },
  inactiveGridLineVertical: {
    top: 0,
    bottom: 0,
    width: 1,
  },
  inactiveScanRing: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 220,
    height: 220,
    marginLeft: -110,
    marginTop: -110,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
  },
  inactiveScanRingInner: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 92,
    height: 92,
    marginLeft: -46,
    marginTop: -46,
    borderRadius: 46,
    borderWidth: 1,
    borderColor: 'rgba(139,148,158,0.18)',
  },
  inactiveContourLineA: {
    position: 'absolute',
    left: '-8%',
    top: '22%',
    width: '118%',
    height: 1,
    backgroundColor: 'rgba(196,138,44,0.14)',
    transform: [{ rotate: '-12deg' }],
  },
  inactiveContourLineB: {
    position: 'absolute',
    left: '-10%',
    bottom: '28%',
    width: '120%',
    height: 1,
    backgroundColor: 'rgba(139,148,158,0.14)',
    transform: [{ rotate: '10deg' }],
  },
  inactiveConvoyContent: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 8,
  },
  inactiveConvoyContentCompact: {
    maxWidth: 320,
    gap: 5,
  },
  inactiveConvoyEyebrow: {
    ...TYPO.U2,
    color: `${TACTICAL.amber}CC`,
    fontSize: 8,
    letterSpacing: 1,
    textAlign: 'center',
  },
  inactiveConvoyEyebrowCompact: {
    fontSize: 6.8,
    letterSpacing: 0.65,
  },
  inactiveConvoyTitle: {
    color: TACTICAL.text,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  inactiveConvoyTitleCompact: {
    fontSize: 16,
    lineHeight: 19,
  },
  inactiveConvoyBody: {
    color: TACTICAL.textMuted,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  inactiveConvoyBodyCompact: {
    fontSize: 8,
    lineHeight: 11,
  },
  inactiveConvoyMetaRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  inactiveConvoyMeta: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 7,
    backgroundColor: ECS_SURFACE.background.compact,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  inactiveConvoyMetaLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  inactiveConvoyMetaValue: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
    marginTop: 2,
  },
  signalSurface: {
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}38`,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.primary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    overflow: 'hidden',
  },
  signalSurfaceCompact: {
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 6,
  },
  signalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  signalTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  signalEyebrow: {
    ...TYPO.U2,
    color: `${TACTICAL.amber}CC`,
    fontSize: 8,
    letterSpacing: 0,
  },
  signalEyebrowCompact: {
    fontSize: 6.8,
    letterSpacing: 0,
  },
  signalTitle: {
    color: TACTICAL.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    marginTop: 2,
  },
  signalTitleCompact: {
    fontSize: 15,
    lineHeight: 18,
  },
  signalStatusPill: {
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.default,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.compact,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  signalStatusPillLive: {
    borderColor: 'rgba(73,209,122,0.52)',
    backgroundColor: 'rgba(73,209,122,0.09)',
  },
  signalStatusPillText: {
    color: TACTICAL.text,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0,
  },
  signalOperationalStrip: {
    minHeight: 44,
    borderLeftWidth: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(5,9,13,0.72)',
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signalOperationalIcon: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalOperationalCopy: {
    flex: 1,
    minWidth: 0,
  },
  signalOperationalLabel: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  signalOperationalDetail: {
    color: TACTICAL.textMuted,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  signalMetricRow: {
    flexDirection: 'row',
    gap: 0,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 6,
    backgroundColor: ECS_SURFACE.background.compact,
    overflow: 'hidden',
  },
  signalMetric: {
    flex: 1,
    minWidth: 0,
    borderRightWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  signalMetricCompact: {
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  signalMetricLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  signalMetricValue: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  signalMetricValueCaution: {
    color: TACTICAL.amber,
  },
  signalRosterHeader: {
    minHeight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  signalRosterLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0,
  },
  signalRosterCount: {
    color: `${TACTICAL.amber}CC`,
    fontSize: 7,
    fontWeight: '900',
  },
  signalMemberList: {
    gap: 5,
  },
  signalMemberRow: {
    minHeight: 28,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 7,
    backgroundColor: 'rgba(5,9,13,0.68)',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  signalMemberRowSelected: {
    borderColor: `${TACTICAL.amber}88`,
    backgroundColor: `${TACTICAL.amber}14`,
  },
  signalMemberDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  signalMemberName: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  signalMemberCopy: {
    flex: 1,
    minWidth: 0,
  },
  signalMemberRole: {
    color: TACTICAL.textMuted,
    fontSize: 6.5,
    lineHeight: 8,
    fontWeight: '800',
    marginTop: 1,
  },
  signalMemberStatus: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0,
  },
  signalEmptyState: {
    flex: 1,
    minHeight: 72,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 8,
    backgroundColor: 'rgba(5,9,13,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 4,
  },
  signalEmptyTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  signalEmptyBody: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  signalEmergencyRow: {
    minHeight: 36,
    borderWidth: 1,
    borderColor: `${TACTICAL.danger}66`,
    borderRadius: 8,
    backgroundColor: 'rgba(226,77,77,0.1)',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signalEmergencyCopy: {
    flex: 1,
    minWidth: 0,
  },
  signalEmergencyTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  signalEmergencyMeta: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '800',
    marginTop: 1,
  },
  signalFooterText: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  signalPrivacyRow: {
    minHeight: 22,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  commandSummary: {
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.24)',
    borderRadius: 10,
    backgroundColor: ECS_SURFACE.background.secondary,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 7,
  },
  feedCommandSummary: {
    marginTop: 0,
    paddingHorizontal: 7,
    paddingVertical: 6,
    gap: 4,
  },
  summaryCommandSummary: {
    flex: 1,
    minHeight: 0,
    borderColor: `${TACTICAL.amber}2E`,
    backgroundColor: `${TACTICAL.amber}12`,
    justifyContent: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 6,
    gap: 4,
  },
  legendHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  legendTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  legendMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  legendMetricGridCompact: {
    flexWrap: 'nowrap',
    gap: 4,
  },
  summaryMetricGrid: {
    flex: 1,
    minHeight: 0,
    alignItems: 'stretch',
    marginTop: 2,
  },
  summaryMetricGridWithSignals: {
    flex: 0,
    flexGrow: 0,
  },
  legendMetric: {
    flexGrow: 1,
    flexBasis: '44%',
    minHeight: 34,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.14)',
    borderRadius: 7,
    backgroundColor: ECS_SURFACE.background.compact,
    justifyContent: 'center',
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  legendMetricCompact: {
    flexBasis: 0,
    flexShrink: 1,
    minWidth: 0,
    minHeight: 24,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  legendMetricExpanded: {
    minHeight: 0,
  },
  regroupAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    borderRadius: 7,
    backgroundColor: ECS_SURFACE.background.selected,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  regroupActionIcon: {
    width: 30,
    height: 30,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ECS_SURFACE.background.compact,
  },
  regroupActionCopy: {
    flex: 1,
    minWidth: 0,
  },
  regroupActionTitle: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
  },
  regroupActionSubtitle: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  emergencyInlineRail: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,160,23,0.14)',
    paddingTop: 6,
    gap: 4,
  },
  emergencyInlineRailCompact: {
    paddingTop: 4,
    gap: 3,
  },
  emergencyInlineRailActive: {
    borderTopColor: `${TACTICAL.danger}52`,
  },
  emergencyInlineHeader: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  emergencyInlineTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    minWidth: 0,
  },
  emergencyInlineTitle: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
  emergencyInlineCount: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7,
    letterSpacing: 0.7,
    flexShrink: 0,
  },
  emergencyInlineCountActive: {
    color: TACTICAL.danger,
  },
  emergencyInlineEventRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 7,
    backgroundColor: `${TACTICAL.danger}0F`,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  emergencyInlineEventRowCompact: {
    minHeight: 30,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 5,
  },
  emergencyInlineCopy: {
    flex: 1,
    minWidth: 0,
  },
  emergencyInlineEventTitle: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
  },
  emergencyInlineEventMeta: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '700',
    marginTop: 1,
  },
  emergencyInlineActionText: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
  emergencyInlineEmptyText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
  },
  legendMemberStack: {
    gap: 4,
  },
  summaryMemberStack: {
    gap: 3,
    marginTop: 1,
  },
  legendFactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  legendFactRowFeed: {
    flexWrap: 'nowrap',
    gap: 4,
  },
  legendFact: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '46%',
    minWidth: 0,
    minHeight: 28,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,160,23,0.12)',
    paddingTop: 5,
  },
  legendEmergencyRow: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,160,23,0.16)',
    paddingTop: 7,
  },
  topIdentity: {
    position: 'absolute',
    left: '11.8%',
    top: '5.1%',
    width: '34.5%',
  },
  topIdentityCompact: {
    top: '5.6%',
    width: '30.5%',
  },
  eyebrow: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 8,
    letterSpacing: 0.9,
  },
  eyebrowCompact: {
    fontSize: 6.5,
    letterSpacing: 0.65,
  },
  groupName: {
    color: TACTICAL.text,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '900',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  groupNameCompact: {
    fontSize: 12,
    lineHeight: 14,
    marginTop: 1,
    letterSpacing: 0,
  },
  truthLine: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  truthLineCompact: {
    fontSize: 6.5,
    lineHeight: 8,
    marginTop: 1,
  },
  truthLineFeed: {
    marginTop: 0,
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  trackingRowFeed: {
    gap: 5,
  },
  trackingStatusBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  liveSharingActivePill: {
    alignSelf: 'flex-start',
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}66`,
    borderRadius: 999,
    backgroundColor: `${TACTICAL.amber}14`,
    paddingHorizontal: 8,
  },
  liveSharingDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: TACTICAL.amber,
  },
  liveSharingActiveText: {
    color: TACTICAL.amber,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  trackingStatus: {
    color: TACTICAL.text,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '800',
  },
  trackingStatusFeed: {
    fontSize: 7.5,
    lineHeight: 10,
  },
  trackingButton: {
    minHeight: 30,
    maxWidth: 172,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}66`,
    borderRadius: 999,
    backgroundColor: `${TACTICAL.amber}14`,
    paddingHorizontal: 10,
  },
  trackingButtonFeed: {
    minHeight: 24,
    maxWidth: 86,
    gap: 4,
    paddingHorizontal: 7,
  },
  trackingButtonStop: {
    borderColor: `${TACTICAL.danger}66`,
    backgroundColor: `${TACTICAL.danger}14`,
  },
  trackingButtonDisabled: {
    opacity: 0.54,
  },
  trackingButtonText: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.35,
  },
  trackingButtonTextStop: {
    color: TACTICAL.danger,
  },
  trackingNote: {
    color: TACTICAL.textMuted,
    fontSize: 8.5,
    lineHeight: 12,
    fontWeight: '700',
  },
  connectionBar: {
    position: 'absolute',
    left: '3.1%',
    right: '3.1%',
    top: '17.8%',
    minHeight: '3.6%',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  connectionBarCompact: {
    top: '21.4%',
    paddingHorizontal: 7,
  },
  connectionBarText: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 0.8,
  },
  connectionBarTextCompact: {
    fontSize: 6.5,
    letterSpacing: 0.55,
  },
  metricBlock: {
    position: 'absolute',
    minHeight: 44,
    justifyContent: 'center',
    gap: 4,
  },
  metricBlockCompact: {
    minHeight: 34,
    gap: 2,
  },
  vehicleMetric: {
    left: '4.3%',
    bottom: '6.4%',
    width: '21%',
    alignItems: 'flex-start',
  },
  reportingMetric: {
    left: '36.7%',
    bottom: '6.1%',
    width: '10.5%',
    alignItems: 'center',
  },
  gapMetric: {
    left: '49.5%',
    bottom: '6.1%',
    width: '10.5%',
    alignItems: 'center',
  },
  regroupMetric: {
    right: '4%',
    bottom: '6.5%',
    width: '22%',
    alignItems: 'flex-end',
  },
  metricLabel: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7.5,
    letterSpacing: 1,
  },
  metricLabelCompact: {
    fontSize: 6.25,
    letterSpacing: 0.75,
  },
  metricValue: {
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.35,
  },
  metricValueCompact: {
    fontSize: 10.5,
    lineHeight: 12,
    letterSpacing: 0.1,
  },
  metricValueCaution: {
    color: TACTICAL.amber,
  },
  memberStack: {
    position: 'absolute',
    left: '5.1%',
    top: '27%',
    width: '19%',
    gap: 5,
  },
  memberStackCompact: {
    top: '28.2%',
    gap: 3,
  },
  memberTitle: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7,
    letterSpacing: 0.8,
  },
  memberTitleCompact: {
    fontSize: 6,
    letterSpacing: 0.65,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 6,
    paddingVertical: 2,
  },
  memberRowSelected: {
    backgroundColor: 'rgba(212,160,23,0.12)',
  },
  memberDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  memberName: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '800',
  },
  memberNameCompact: {
    fontSize: 7.5,
  },
  emergencyPanel: {
    position: 'absolute',
    right: '4.6%',
    top: '27.2%',
    width: '24%',
    minHeight: '18%',
    justifyContent: 'space-between',
    gap: 8,
  },
  emergencyPanelCompact: {
    right: '4%',
    top: '28.4%',
    width: '23%',
    gap: 5,
  },
  emergencyCopy: {
    gap: 3,
  },
  emergencyEyebrow: {
    ...TYPO.U2,
    color: TACTICAL.danger,
    fontSize: 7.5,
    letterSpacing: 0.8,
  },
  emergencyEyebrowCompact: {
    fontSize: 6.5,
    letterSpacing: 0.55,
  },
  emergencyText: {
    color: TACTICAL.textMuted,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '700',
  },
  emergencyTextCompact: {
    fontSize: 6.75,
    lineHeight: 8.5,
  },
  emergencyButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: `${TACTICAL.danger}88`,
    borderRadius: 999,
    backgroundColor: `${TACTICAL.danger}18`,
    paddingHorizontal: 10,
  },
  emergencyButtonAmber: {
    borderColor: `${TACTICAL.amber}88`,
    backgroundColor: `${TACTICAL.amber}16`,
  },
  emergencyButtonCompact: {
    minHeight: 28,
    gap: 4,
    paddingHorizontal: 6,
  },
  emergencyButtonDisabled: {
    opacity: 0.58,
  },
  emergencyButtonText: {
    color: TACTICAL.danger,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  emergencyButtonTextCompact: {
    fontSize: 8.5,
    letterSpacing: 0.45,
  },
  dispatchFacts: {
    position: 'absolute',
    left: '36.5%',
    top: '26%',
    width: '27%',
    gap: 6,
  },
  dispatchFactsCompact: {
    top: '27.6%',
    gap: 4,
  },
  fact: {
    minHeight: 30,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.14)',
    backgroundColor: ECS_SURFACE.background.compact,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  factLabel: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7,
    letterSpacing: 0.7,
  },
  factValue: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
    marginTop: 2,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  emergencyFeed: {
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.22)',
    borderRadius: 10,
    backgroundColor: ECS_SURFACE.background.secondary,
    overflow: 'hidden',
  },
  emergencyFeedCompact: {
    borderRadius: 8,
  },
  emergencyFeedActive: {
    borderColor: `${TACTICAL.danger}88`,
    backgroundColor: `${TACTICAL.danger}0F`,
  },
  emergencyFeedHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,160,23,0.16)',
    paddingHorizontal: 11,
  },
  emergencyFeedHeaderCompact: {
    minHeight: 28,
    paddingHorizontal: 8,
  },
  emergencyFeedTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  emergencyFeedCount: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 0.8,
  },
  emergencyFeedCountActive: {
    color: TACTICAL.danger,
  },
  emergencyEventRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  emergencyEventRowCompact: {
    minHeight: 50,
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  emergencyEventRowActive: {
    backgroundColor: `${TACTICAL.danger}10`,
  },
  emergencyEventIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: `${TACTICAL.danger}66`,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${TACTICAL.danger}14`,
  },
  emergencyEventCopy: {
    flex: 1,
    minWidth: 0,
  },
  emergencyEventTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  emergencyEventMeta: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  emergencyEventActionText: {
    color: TACTICAL.amber,
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.45,
    marginTop: 3,
    textTransform: 'uppercase',
  },
  emptyEmergencyRow: {
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  emptyEmergencyText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
});

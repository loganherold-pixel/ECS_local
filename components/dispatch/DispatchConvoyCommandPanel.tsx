import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';

import { ConvoyCommandMap } from '../convoy/ConvoyCommandMap';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import type { ConvoyMapVehicle, ConvoyMovementStatus, ConvoyRealtimeConnectionStatus } from '../../lib/convoy/convoyRealtimeService';
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
import type { ConvoyCommandPanelViewModel, ConvoyMemberSummaryRole } from '../../lib/convoy/convoyCommandTypes';
import type { DispatchEvent } from '../../lib/dispatchLiveEvents';
import type { ConvoyCommandData, ConvoyMember } from '../../lib/navigation/convoyCommandData';
import { useConvoyCommandData } from '../dashboard/commandCenter/useConvoyCommandData';
import { navigateRouteSessionStore, type NavigateRouteSessionSnapshot } from '../../lib/navigateRouteSessionStore';
import {
  stopConvoyLocationSubscription,
  subscribeToConvoyLocations,
  useConvoyTrackingStore,
} from '../../stores/convoyTrackingStore';

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
  presentation?: 'full' | 'feed' | 'map' | 'summary';
  cameraResetKey?: string | number;
  showEmergencyOverlay?: boolean;
  convoyLifecycleRevision?: number;
  testID?: string;
};

type DispatchConvoyUserLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  headingDegrees?: number | null;
  speedMps?: number | null;
  timestamp?: string | number | null;
};

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

function distanceMilesBetweenConvoyVehicles(left: ConvoyMapVehicle, right: ConvoyMapVehicle): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLon = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function widestLiveVehicleGapMiles(members: ConvoyMapVehicle[]): number | null {
  if (members.length < 2) return null;
  let widest = 0;
  for (let leftIndex = 0; leftIndex < members.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
      widest = Math.max(widest, distanceMilesBetweenConvoyVehicles(members[leftIndex], members[rightIndex]));
    }
  }
  return widest;
}

function roleForActiveConvoySummary(role: ConvoyMapVehicle['role'], isCurrentUser: boolean): ConvoyMemberSummaryRole {
  if (isCurrentUser) return 'you';
  if (role === 'lead') return 'lead';
  if (role === 'sweep') return 'tail';
  return 'member';
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

function movementStatusFromCommandMember(member: ConvoyMember): ConvoyMovementStatus {
  switch (member.status) {
    case 'emergency':
      return 'needs_assistance';
    case 'delayed':
      return 'delayed';
    case 'offline':
      return 'offline';
    case 'stopped':
      return 'stopped';
    case 'checkedIn':
    case 'online':
      return 'moving';
    case 'unknown':
    default:
      return 'unknown';
  }
}

function roleFromCommandMember(member: ConvoyMember): ConvoyMapVehicle['role'] {
  if (member.role === 'lead' || member.role === 'sweep') return member.role;
  if (member.role === 'recovery' || member.role === 'medic') return 'support';
  return 'member';
}

function fallbackVehiclesFromCommandData(commandData: ConvoyCommandData): ConvoyMapVehicle[] {
  return commandData.members.flatMap((member) => {
    if (!member.coordinates) return [];
    const timestamp = (member.lastPingAt ?? member.lastCheckInAt ?? commandData.lastUpdatedAt ?? new Date()).toISOString();
    const isStale = member.status === 'offline' || member.status === 'unknown';
    return [{
      memberId: member.id,
      callsign: member.displayName,
      role: roleFromCommandMember(member),
      latitude: member.coordinates.latitude,
      longitude: member.coordinates.longitude,
      accuracyMeters: null,
      headingDegrees: null,
      speedMps: null,
      movementStatus: movementStatusFromCommandMember(member),
      capturedAt: timestamp,
      updatedAt: timestamp,
      isStale,
      staleness: isStale ? 'stale' : 'fresh',
      staleReason: isStale ? 'Using last known convoy assessment location.' : null,
    } satisfies ConvoyMapVehicle];
  });
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

function useNavigateRouteSessionSnapshot() {
  return useSyncExternalStore(
    navigateRouteSessionStore.subscribe,
    navigateRouteSessionStore.getSnapshot,
    navigateRouteSessionStore.getSnapshot,
  );
}

function localVehicleFromRouteSession(
  routeSession: NavigateRouteSessionSnapshot,
  activeContext: ActiveConvoyContext | null,
): ConvoyMapVehicle | null {
  const location = routeSession.currentLocation;
  if (!location) return null;
  const timestamp = routeSession.updatedAt ?? new Date().toISOString();
  return {
    memberId: activeContext?.memberId ?? 'local-user',
    callsign: activeContext?.callsign ?? 'YOU',
    role: activeContext?.role ?? 'member',
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyMeters: null,
    headingDegrees: routeSession.headingDeg,
    speedMps: null,
    movementStatus: routeSession.lifecycle === 'active' ? 'moving' : 'unknown',
    capturedAt: timestamp,
    updatedAt: timestamp,
    isStale: false,
    staleness: 'fresh',
    staleReason: null,
  };
}

function localVehicleFromUserLocation(
  location: DispatchConvoyUserLocation | null | undefined,
  activeContext: ActiveConvoyContext | null,
): ConvoyMapVehicle | null {
  if (!location) return null;
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  const timestamp = typeof location.timestamp === 'number'
    ? new Date(location.timestamp).toISOString()
    : typeof location.timestamp === 'string'
      ? location.timestamp
      : new Date().toISOString();
  return {
    memberId: activeContext?.memberId ?? 'local-user',
    callsign: activeContext?.callsign ?? 'YOU',
    role: activeContext?.role ?? 'member',
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyMeters: location.accuracyMeters ?? null,
    headingDegrees: location.headingDegrees ?? null,
    speedMps: location.speedMps ?? null,
    movementStatus: 'moving',
    capturedAt: timestamp,
    updatedAt: timestamp,
    isStale: false,
    staleness: 'fresh',
    staleReason: null,
  };
}

function buildActiveConvoyPanelViewModel(params: {
  baseViewModel: ConvoyCommandPanelViewModel;
  activeContext: ActiveConvoyContext | null;
  mapMembers: ConvoyMapVehicle[];
  rawMemberCount: number;
  trackingLastUpdated: string | null;
  trackingConnectionStatus: ConvoyRealtimeConnectionStatus;
}): ConvoyCommandPanelViewModel {
  if (!params.activeContext?.convoyId) return params.baseViewModel;

  const vehicleCount = Math.max(
    params.rawMemberCount,
    params.mapMembers.length,
    params.activeContext.memberId ? 1 : 0,
  );
  const reportingCount = params.mapMembers.filter((member) => (
    !member.isStale && member.movementStatus !== 'offline'
  )).length;
  const members = params.mapMembers.length > 0
    ? params.mapMembers.map((member) => ({
        id: member.memberId,
        displayName: member.callsign,
        role: roleForActiveConvoySummary(member.role, member.memberId === params.activeContext?.memberId),
        distanceFromUserMiles: null,
        lastSeenAt: member.updatedAt ?? member.capturedAt,
        isReporting: !member.isStale && member.movementStatus !== 'offline',
        isStale: member.isStale || member.movementStatus === 'offline',
        isLostSignal: member.movementStatus === 'offline',
      }))
    : [{
        id: params.activeContext.memberId,
        displayName: params.activeContext.callsign || 'YOU',
        role: roleForActiveConvoySummary(params.activeContext.role, true),
        distanceFromUserMiles: null,
        lastSeenAt: params.activeContext.storedAt,
        isReporting: false,
        isStale: true,
        isLostSignal: false,
      }];
  const widestGapMiles = widestLiveVehicleGapMiles(params.mapMembers);
  const hasLiveTracking = params.trackingConnectionStatus === 'connected' && params.mapMembers.length > 0;
  const hasStale = members.some((member) => member.isStale);

  return {
    ...params.baseViewModel,
    visualState: hasLiveTracking ? 'live' : hasStale ? 'partial' : 'estimated',
    statusLabel: hasLiveTracking ? 'LIVE' : hasStale ? 'PARTIAL' : 'ESTIMATED',
    groupName: params.baseViewModel.groupName === 'No Active Convoy' ? 'Active Convoy' : params.baseViewModel.groupName,
    vehicleCount,
    reportingCount,
    widestGapMiles,
    regroupSuggested: widestGapMiles != null && widestGapMiles > 1,
    lostUnitIndex: members.findIndex((member) => member.isLostSignal),
    cautionLevel: widestGapMiles != null && widestGapMiles > 1 ? 1 : 0,
    alertText: null,
    members,
    isUsingLiveData: hasLiveTracking,
    updatedAt: params.trackingLastUpdated ?? params.baseViewModel.updatedAt ?? params.activeContext.storedAt,
  };
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
  cameraResetKey,
  showEmergencyOverlay,
  convoyLifecycleRevision = 0,
  testID = 'dispatch-convoy-command-panel',
}: DispatchConvoyCommandPanelProps) {
  const { width: windowWidth } = useWindowDimensions();
  const commandData = useConvoyCommandData();
  const routeSession = useNavigateRouteSessionSnapshot();
  const trackingSnapshot = useConvoyTrackingStore();
  const [activeContext, setActiveContext] = useState<ActiveConvoyContext | null>(null);
  const [sharingState, setSharingState] = useState<ConvoyLocationSharingState | null>(null);
  const [sharingBusy, setSharingBusy] = useState(false);
  const sharingBusyRef = useRef(false);
  const [trackingNote, setTrackingNote] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const isCompact = windowWidth < 820;
  const viewModel = useMemo(
    () => selectConvoyCommandPanelViewModel({ commandData }),
    [commandData],
  );
  const fallbackMapMembers = useMemo(() => fallbackVehiclesFromCommandData(commandData), [commandData]);
  const hasActiveConvoy = Boolean(activeContext?.convoyId);
  const liveMapMembers = useMemo(
    () => hasActiveConvoy && trackingSnapshot.convoyId === activeContext?.convoyId
      ? trackingSnapshot.members
      : [],
    [activeContext?.convoyId, hasActiveConvoy, trackingSnapshot.convoyId, trackingSnapshot.members],
  );
  const routeSessionLocalMapMember = useMemo(
    () => localVehicleFromRouteSession(routeSession, activeContext),
    [activeContext, routeSession],
  );
  const gpsLocalMapMember = useMemo(
    () => localVehicleFromUserLocation(userLocation, activeContext),
    [activeContext, userLocation],
  );
  const localMapMember = routeSessionLocalMapMember ?? gpsLocalMapMember;
  const routeCoordinates = useMemo(
    () => hasActiveConvoy && routeSession.lifecycle !== 'inactive'
      ? routeSession.routePoints.map((point) => [point.lng, point.lat] as [number, number])
      : [],
    [hasActiveConvoy, routeSession.lifecycle, routeSession.routePoints],
  );
  const mapMembers = useMemo(
    () => !hasActiveConvoy
      ? localMapMember
        ? [localMapMember]
        : []
      : liveMapMembers.length > 0
        ? liveMapMembers
        : fallbackMapMembers.length > 0
          ? fallbackMapMembers
          : localMapMember
            ? [localMapMember]
            : [],
    [fallbackMapMembers, hasActiveConvoy, liveMapMembers, localMapMember],
  );
  const mapConnectionStatus: ConvoyRealtimeConnectionStatus =
    hasActiveConvoy && trackingSnapshot.convoyId === activeContext?.convoyId
      ? trackingSnapshot.connectionStatus
      : hasActiveConvoy && fallbackMapMembers.length > 0
        ? 'disconnected'
        : 'idle';
  const activeConvoyRawMemberCount =
    hasActiveConvoy && trackingSnapshot.convoyId === activeContext?.convoyId
      ? trackingSnapshot.rawMembers.filter((member) => !member.revoked_at).length
      : 0;
  const panelViewModel = useMemo(
    () => buildActiveConvoyPanelViewModel({
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
  const truthLine = panelViewModel.isUsingLiveData
    ? 'Live convoy telemetry is active.'
    : hasConvoyData
      ? hasActiveConvoy
        ? 'Active convoy roster available. Start live sharing to publish this vehicle.'
        : 'Convoy roster/check-in state available; live tracking is not active.'
      : 'No active convoy. Live convoy tracking is not being simulated.';
  const primaryEmergencyEvent = emergencyEvents[0] ?? null;
  const isFeedPresentation = presentation === 'feed';
  const isMapOnlyPresentation = presentation === 'map';
  const isSummaryOnlyPresentation = presentation === 'summary';
  const summaryCompact = isCompact || isFeedPresentation || isSummaryOnlyPresentation;
  const shouldPulseEmergencyCount = emergencyAlertActive ?? emergencyEvents.length > 0;
  const emergencyPulseOpacity = useEmergencyPulse(shouldPulseEmergencyCount);
  const resolvedEmergencyButtonLabel = emergencyButtonLabel ?? (emergencySubmitting ? 'GETTING GPS' : 'PING GPS');
  const resolvedEmergencyButtonTone = emergencyButtonTone ?? TACTICAL.danger;
  const shouldShowEmergencyFeed =
    !isMapOnlyPresentation &&
    (!isSummaryOnlyPresentation || emergencyEvents.length > 0) &&
    (!isFeedPresentation || emergencyEvents.length > 0);
  const shouldShowEmergencyOverlay =
    showEmergencyOverlay ?? (!isFeedPresentation && !isMapOnlyPresentation && !isSummaryOnlyPresentation);
  const canShareLiveLocation = Boolean(activeContext?.convoyId && activeContext?.memberId);
  const isSharingLiveLocation = Boolean(sharingState?.enabled);

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
    if (!activeContext?.convoyId) return undefined;
    void subscribeToConvoyLocations(activeContext.convoyId);
    return () => {
      stopConvoyLocationSubscription();
    };
  }, [activeContext?.convoyId]);

  async function handleStartLiveSharing() {
    if (sharingBusyRef.current) return;

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
      if (result.ok) void subscribeToConvoyLocations(context.convoyId);
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

  return (
    <View
      testID={testID}
      style={[
        styles.shell,
        isFeedPresentation || isMapOnlyPresentation || isSummaryOnlyPresentation ? styles.feedShell : null,
        isSummaryOnlyPresentation ? styles.summaryOnlyShell : null,
      ]}
    >
      {!isSummaryOnlyPresentation ? (
      <View style={[styles.panelStage, isFeedPresentation || isMapOnlyPresentation ? styles.feedPanelStage : null]}>
        {hasActiveConvoy ? (
          <ConvoyCommandMap
            members={mapMembers}
            currentUserMemberId={activeContext?.memberId ?? (localMapMember ? 'local-user' : null)}
            connectionStatus={mapConnectionStatus}
            selectedMemberId={selectedMemberId}
            onSelectMember={(member) => setSelectedMemberId(member.memberId)}
            routeCoordinates={routeCoordinates}
            cameraResetKey={cameraResetKey}
            followUserWhenEmpty={!hasActiveConvoy}
            showMapWhenEmpty
            showStatusSummary={false}
            compact={isFeedPresentation || isMapOnlyPresentation}
          />
        ) : (
          <InactiveConvoySurface
            compact={isFeedPresentation || isMapOnlyPresentation}
            connectionLabel={connectionLabel}
            hasActiveTeam={hasActiveTeam}
            teamStatusLabel={teamStatusLabel}
          />
        )}
      </View>
      ) : null}

      {!isMapOnlyPresentation ? (
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
              sharingBusy ? styles.trackingButtonDisabled : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={isSharingLiveLocation ? 'Stop live convoy location sharing' : 'Start live convoy location sharing'}
            accessibilityHint={canShareLiveLocation ? undefined : 'Refreshes convoy membership state before starting live sharing.'}
            accessibilityState={{ disabled: sharingBusy }}
            activeOpacity={sharingBusy ? 1 : 0.78}
            disabled={sharingBusy}
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
        {trackingNote || sharingState?.lastError ? (
          <Text style={styles.trackingNote} numberOfLines={2}>
            {trackingNote ?? sharingState?.lastStopReason ?? sharingState?.lastError}
          </Text>
        ) : null}

        <View style={[styles.legendMetricGrid, summaryCompact ? styles.legendMetricGridCompact : null]}>
          <LegendMetric label={summaryCompact ? 'Veh' : 'Vehicles'} value={formatVehicleCount(panelViewModel.vehicleCount)} compact={summaryCompact} />
          <LegendMetric
            label={summaryCompact ? 'Rpt' : 'Reporting'}
            value={`${panelViewModel.reportingCount}/${Math.max(panelViewModel.vehicleCount, panelViewModel.members.length)}`}
            compact={summaryCompact}
          />
          <LegendMetric label={summaryCompact ? 'Gap' : 'Widest gap'} value={widestGapLabel} compact={summaryCompact} />
          <LegendMetric
            label="Regroup"
            value={panelViewModel.regroupSuggested ? 'Advised' : 'Standby'}
            compact={summaryCompact}
            caution={panelViewModel.regroupSuggested}
          />
        </View>

        {!isFeedPresentation ? (
          <View style={styles.legendMemberStack}>
            <Text style={[styles.memberTitle, summaryCompact ? styles.memberTitleCompact : null]}>CONVOY SIGNALS</Text>
            {(panelViewModel.members.length > 0 ? panelViewModel.members.slice(0, isFeedPresentation ? 2 : 4) : [
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

        <View style={[styles.legendFactRow, isFeedPresentation ? styles.legendFactRowFeed : null]}>
          <LegendFact label="Team" value={hasActiveTeam ? `${teamMemberCount} member${teamMemberCount === 1 ? '' : 's'}` : 'Inactive'} />
          <LegendFact label="Link" value={`${connectionLabel} / ${teamStatusLabel}`} />
          <LegendFact label="Updated" value={formatUpdatedAt(panelViewModel.updatedAt)} />
        </View>

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

      {shouldShowEmergencyFeed ? (
      <View
        style={[
          styles.emergencyFeed,
          isFeedPresentation || isSummaryOnlyPresentation ? styles.emergencyFeedCompact : null,
          primaryEmergencyEvent ? styles.emergencyFeedActive : null,
        ]}
      >
        <View style={[styles.emergencyFeedHeader, isFeedPresentation || isSummaryOnlyPresentation ? styles.emergencyFeedHeaderCompact : null]}>
          <Text style={styles.emergencyFeedTitle}>Emergency Pings</Text>
          <Animated.Text
            style={[
              styles.emergencyFeedCount,
              primaryEmergencyEvent ? styles.emergencyFeedCountActive : null,
              primaryEmergencyEvent && shouldPulseEmergencyCount ? { opacity: emergencyPulseOpacity } : null,
            ]}
          >
            {emergencyEvents.length} active
          </Animated.Text>
        </View>
        {primaryEmergencyEvent ? (
          <TouchableOpacity
            style={[
              styles.emergencyEventRow,
              styles.emergencyEventRowActive,
              isFeedPresentation || isSummaryOnlyPresentation ? styles.emergencyEventRowCompact : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open active GPS ping tactical map"
            activeOpacity={0.8}
            onPress={() => onOpenEmergencyEvent(primaryEmergencyEvent)}
          >
            <View style={styles.emergencyEventIcon}>
              <Ionicons name="alert-circle-outline" size={15} color={TACTICAL.danger} />
            </View>
            <View style={styles.emergencyEventCopy}>
              <Text style={styles.emergencyEventTitle} numberOfLines={1}>
                Active GPS Ping
              </Text>
              <Text style={styles.emergencyEventMeta} numberOfLines={1}>
                {formatEmergencyEventTime(primaryEmergencyEvent)} / {getEmergencyLocationLabel(primaryEmergencyEvent)}
              </Text>
              <Text style={styles.emergencyEventActionText} numberOfLines={1}>
                Tap for tactical map and active guidance route
              </Text>
            </View>
            <Ionicons name="navigate-outline" size={16} color={TACTICAL.amber} />
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyEmergencyRow}>
            <Text style={styles.emptyEmergencyText}>
              No active emergency coordinate pings. Use PING GPS only when a convoy partner needs an immediate map target.
            </Text>
          </View>
        )}
      </View>
      ) : null}
    </View>
  );
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

function LegendMetric({
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
    <View style={[styles.legendMetric, compact ? styles.legendMetricCompact : null]}>
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
    aspectRatio: 1060 / 704,
    minHeight: 320,
    alignSelf: 'center',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'rgba(3,6,8,0.24)',
  },
  feedPanelStage: {
    flex: 1,
    minHeight: 210,
    aspectRatio: undefined,
  },
  inactiveConvoySurface: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(139,148,158,0.16)',
    backgroundColor: 'rgba(3,7,9,0.92)',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  inactiveConvoySurfaceCompact: {
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
    borderColor: 'rgba(139,148,158,0.16)',
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.24)',
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
  commandSummary: {
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.24)',
    borderRadius: 10,
    backgroundColor: 'rgba(5,8,10,0.72)',
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
    justifyContent: 'space-between',
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
  legendMetric: {
    flexGrow: 1,
    flexBasis: '44%',
    minHeight: 34,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.14)',
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.18)',
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
  legendMemberStack: {
    gap: 4,
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
    backgroundColor: 'rgba(0,0,0,0.18)',
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
    backgroundColor: 'rgba(5,8,10,0.66)',
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

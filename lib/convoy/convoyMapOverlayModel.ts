import type { ConvoyMapVehicle, ConvoyRealtimeConnectionStatus } from './convoyRealtimeService';
import {
  buildConvoyMarkerIdentities,
  type ConvoyMarkerIdentity,
} from './convoyMarkerIdentity';
import {
  buildConvoyParticipantsFromMapVehicles,
  formatConvoyParticipantLastUpdated,
  type ConvoyParticipant,
  type ConvoyParticipantSource,
} from './convoyParticipantModel';
import type { ActiveConvoyContext } from './convoyMembershipService';
import type { ConvoyCommandPanelViewModel, ConvoyMemberSummaryRole } from './convoyCommandTypes';
import type { ConvoyCommandData, ConvoyMember } from '../navigation/convoyCommandData';
import type { NavigateRouteSessionSnapshot } from '../navigateRouteSessionStore';

export type ConvoyMapOverlayMarker = {
  id: string;
  memberId: string;
  latitude: number;
  longitude: number;
  callsign: string;
  displayName: string;
  role: ConvoyMarkerIdentity['role'];
  roleLabel: string;
  status: ConvoyMarkerIdentity['status'];
  statusLabel: string;
  sourceLabel: string;
  observedAt: string | null;
  accuracyMeters: number | null;
  lastUpdatedLabel: string;
  ageLabel: string | null;
  staleReason: string | null;
  isCurrentUser: boolean;
  isEmergency: boolean;
  isStale: boolean;
  isOffline: boolean;
  isDelayed: boolean;
  selected?: boolean;
  headingDegrees: number | null;
  speedMps: number | null;
  shapeGlyph: string;
};

export type ConvoyOverlayModel = {
  markers: ConvoyMapOverlayMarker[];
  participants: ConvoyParticipant[];
  identities: ConvoyMarkerIdentity[];
};

export type DispatchConvoyUserLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  headingDegrees?: number | null;
  speedMps?: number | null;
  timestamp?: string | number | null;
};

function finiteCoordinate(latitude: unknown, longitude: unknown): latitude is number {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function isValidConvoyMapVehicle(member: ConvoyMapVehicle): boolean {
  return finiteCoordinate(member.latitude, member.longitude);
}

function participantSourceForConnection(connectionStatus: ConvoyRealtimeConnectionStatus): ConvoyParticipantSource {
  if (connectionStatus === 'connected') return 'live';
  if (connectionStatus === 'degraded' || connectionStatus === 'disconnected') return 'cached';
  return 'unknown';
}

export function buildConvoyMapOverlayModel(input: {
  members: ConvoyMapVehicle[];
  convoyId?: string | null;
  currentUserMemberId?: string | null;
  connectionStatus?: ConvoyRealtimeConnectionStatus;
  selectedMemberId?: string | null;
  includeCurrentUser?: boolean;
}): ConvoyOverlayModel {
  const includeCurrentUser = input.includeCurrentUser ?? true;
  const visibleMembers = input.members.filter((member) => (
    isValidConvoyMapVehicle(member) &&
    (includeCurrentUser || member.memberId !== input.currentUserMemberId)
  ));
  const identities = buildConvoyMarkerIdentities(visibleMembers, input.currentUserMemberId);
  const participants = buildConvoyParticipantsFromMapVehicles(visibleMembers, {
    convoyId: input.convoyId ?? undefined,
    source: participantSourceForConnection(input.connectionStatus ?? 'idle'),
  });
  const identityByMember = new Map(identities.map((identity) => [identity.memberId, identity]));
  const participantByMember = new Map(participants.map((participant) => [participant.participantId, participant]));

  const markers = visibleMembers.flatMap((member) => {
    const identity = identityByMember.get(member.memberId);
    const participant = participantByMember.get(member.memberId);
    if (!identity || !participant?.shouldRenderMarker) return [];
    return [{
      id: member.memberId,
      memberId: member.memberId,
      latitude: member.latitude,
      longitude: member.longitude,
      callsign: identity.callsign,
      displayName: participant.displayName,
      role: identity.role,
      roleLabel: participant.roleLabel,
      status: identity.status,
      statusLabel: identity.statusLabel,
      sourceLabel: participant.sourceLabel,
      observedAt: member.capturedAt ?? member.updatedAt ?? null,
      accuracyMeters: member.accuracyMeters,
      lastUpdatedLabel: formatConvoyParticipantLastUpdated(participant),
      ageLabel: identity.ageLabel,
      staleReason: member.staleReason,
      isCurrentUser: Boolean(identity.isCurrentUser),
      isEmergency: identity.status === 'needs_assistance',
      isStale: identity.status === 'stale',
      isOffline: identity.status === 'offline',
      isDelayed: identity.status === 'delayed',
      selected: member.memberId === input.selectedMemberId,
      headingDegrees: member.headingDegrees,
      speedMps: member.speedMps,
      shapeGlyph: identity.shapeGlyph,
    } satisfies ConvoyMapOverlayMarker];
  });

  return { markers, participants, identities };
}

export function roleForActiveConvoySummary(
  role: ConvoyMapVehicle['role'],
  isCurrentUser: boolean,
): ConvoyMemberSummaryRole {
  if (isCurrentUser) return 'you';
  if (role === 'lead') return 'lead';
  if (role === 'sweep') return 'tail';
  return 'member';
}

export function distanceMilesBetweenConvoyVehicles(left: ConvoyMapVehicle, right: ConvoyMapVehicle): number {
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

export function widestLiveVehicleGapMiles(members: ConvoyMapVehicle[]): number | null {
  if (members.length < 2) return null;
  let widest = 0;
  for (let leftIndex = 0; leftIndex < members.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
      widest = Math.max(widest, distanceMilesBetweenConvoyVehicles(members[leftIndex], members[rightIndex]));
    }
  }
  return widest;
}

function movementStatusFromCommandMember(member: ConvoyMember): ConvoyMapVehicle['movementStatus'] {
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

export function fallbackVehiclesFromCommandData(commandData: ConvoyCommandData): ConvoyMapVehicle[] {
  return commandData.members.flatMap((member) => {
    if (!member.coordinates) return [];
    const timestamp = (member.lastPingAt ?? member.lastCheckInAt ?? commandData.lastUpdatedAt ?? new Date()).toISOString();
    const isStale = member.status === 'offline' || member.status === 'unknown';
    const role = roleFromCommandMember(member);
    return [{
      memberId: member.id,
      callsign: member.displayName,
      displayName: member.displayName,
      expeditionBadgeTitle: null,
      role,
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

export function localVehicleFromRouteSession(
  routeSession: NavigateRouteSessionSnapshot,
  activeContext: ActiveConvoyContext | null,
): ConvoyMapVehicle | null {
  const location = routeSession.currentLocation;
  if (!location) return null;
  const timestamp = routeSession.updatedAt ?? new Date().toISOString();
  return {
    memberId: activeContext?.memberId ?? 'local-user',
    callsign: activeContext?.callsign ?? 'YOU',
    displayName: activeContext?.callsign ?? 'YOU',
    expeditionBadgeTitle: activeContext?.expeditionBadgeTitle ?? null,
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

export function localVehicleFromUserLocation(
  location: DispatchConvoyUserLocation | null | undefined,
  activeContext: ActiveConvoyContext | null,
): ConvoyMapVehicle | null {
  if (!location) return null;
  if (!finiteCoordinate(location.latitude, location.longitude)) return null;
  const timestamp = typeof location.timestamp === 'number'
    ? new Date(location.timestamp).toISOString()
    : typeof location.timestamp === 'string'
      ? location.timestamp
      : new Date().toISOString();
  return {
    memberId: activeContext?.memberId ?? 'local-user',
    callsign: activeContext?.callsign ?? 'YOU',
    displayName: activeContext?.callsign ?? 'YOU',
    expeditionBadgeTitle: activeContext?.expeditionBadgeTitle ?? null,
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

export function buildActiveConvoyPanelViewModel(params: {
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
  const hasLiveTracking = params.trackingConnectionStatus === 'connected' && reportingCount > 0;
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

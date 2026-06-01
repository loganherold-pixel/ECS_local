import type {
  ConvoyMemberSnapshot,
  ConvoySnapshot,
  ExpeditionDataPoint,
} from '../expedition/operationalAssessmentTypes';
import type { TeamMember, TeamStoreSnapshot } from '../teamStore';

export type ConvoyMode = 'planned' | 'checkIn' | 'live' | 'offline' | 'setupNeeded';

export type ConvoyCommandDataState =
  | 'live'
  | 'checkIn'
  | 'planned'
  | 'partial'
  | 'offline'
  | 'setupNeeded';

export type ConvoyMemberRole =
  | 'lead'
  | 'member'
  | 'sweep'
  | 'medic'
  | 'recovery'
  | 'unknown';

export type ConvoyMemberStatus =
  | 'online'
  | 'checkedIn'
  | 'delayed'
  | 'stopped'
  | 'offline'
  | 'emergency'
  | 'unknown';

export interface ConvoyCoordinate {
  latitude: number;
  longitude: number;
}

export interface ConvoyMember {
  id: string;
  displayName: string;
  role: ConvoyMemberRole;
  vehicleName: string;
  status: ConvoyMemberStatus;
  coordinates?: ConvoyCoordinate | null;
  lastPingAt?: Date | null;
  lastCheckInAt?: Date | null;
  spacingFromPrevious?: number | null;
  distanceFromRoute?: number | null;
  note?: string | null;
  isCurrentUser: boolean;
}

export interface ConvoyCommandData {
  mode: ConvoyMode;
  dataState: ConvoyCommandDataState;
  convoyName: string;
  convoySize: number;
  activeRouteId: string | null;
  rallyPoint: string | null;
  regroupDistance: string | null;
  channelLabel: string;
  members: ConvoyMember[];
  averageSpacing: string | null;
  delayedCount: number;
  offlineCount: number;
  emergencyCount: number;
  recommendationLabel: string;
  recommendationReason: string;
  missingInputs: string[];
  lastUpdatedAt: Date | null;
  confidenceLabel: string;
  sourceLabel: string;
  isOffline: boolean;
  usesLiveTracking: boolean;
}

export interface ConvoyCommandInput {
  teamSnapshot?: TeamStoreSnapshot | null;
  convoySnapshot?: ConvoySnapshot | null;
  activeRouteId?: string | null;
  activeRouteLabel?: string | null;
  activeExpeditionId?: string | null;
  isOffline?: boolean | null;
  connectivityStatus?: 'online' | 'offline' | 'reconnecting' | null;
  connectivityLevel?: 'no_service' | 'limited' | 'normal' | 'unknown' | null;
  liveSharingAvailable?: boolean | null;
  nowMs?: number;
}

function valueOf<T>(point: ExpeditionDataPoint<T> | null | undefined): T | null {
  return point?.value ?? null;
}

function dateFrom(value: unknown): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isFinite(date.getTime()) ? date : null;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function latestDate(dates: (Date | null | undefined)[]): Date | null {
  const validDates = dates.filter((date): date is Date => Boolean(date));
  if (validDates.length === 0) return null;
  return new Date(Math.max(...validDates.map((date) => date.getTime())));
}

function normalizeManualRole(role: ConvoyMemberSnapshot['role']): ConvoyMemberRole {
  if (role === 'lead' || role === 'sweep' || role === 'member') return role;
  if (role === 'support') return 'recovery';
  return 'unknown';
}

function normalizeTeamRole(member: TeamMember): ConvoyMemberRole {
  if (member.role === 'owner') return 'lead';
  return 'member';
}

function normalizeManualStatus(member: ConvoyMemberSnapshot): ConvoyMemberStatus {
  if (valueOf(member.needsAssistance) === true) return 'emergency';
  if (valueOf(member.missedCheckpoint) === true) return 'delayed';

  switch (valueOf(member.movementStatus)) {
    case 'needs_assistance':
      return 'emergency';
    case 'delayed':
      return 'delayed';
    case 'stopped':
      return 'stopped';
    case 'offline':
      return 'offline';
    case 'moving':
      return 'checkedIn';
    case 'unknown':
    default:
      return valueOf(member.lastCheckInAt) ? 'checkedIn' : 'unknown';
  }
}

function normalizeManualMember(member: ConvoyMemberSnapshot): ConvoyMember {
  const lastCheckInAt = dateFrom(valueOf(member.lastCheckInAt));
  const status = normalizeManualStatus(member);
  const locationLabel = valueOf(member.lastKnownLocationLabel);
  const location = valueOf(member.lastKnownLocation);
  const latitude = finite(location?.latitude);
  const longitude = finite(location?.longitude);
  const locationUpdatedAt = dateFrom(member.lastKnownLocation?.updatedAt);
  return {
    id: member.id,
    displayName: member.callsign || 'Convoy member',
    role: normalizeManualRole(member.role),
    vehicleName: member.callsign || 'Vehicle not assigned',
    status,
    coordinates:
      latitude != null && longitude != null
        ? {
            latitude,
            longitude,
          }
        : null,
    lastCheckInAt,
    lastPingAt: locationUpdatedAt,
    spacingFromPrevious: finite(valueOf(member.distanceBehindLeadMiles)),
    distanceFromRoute: null,
    note: hasText(locationLabel) ? `Last known: ${locationLabel}` : null,
    isCurrentUser: false,
  };
}

function normalizeTeamMember(member: TeamMember, index: number): ConvoyMember {
  const location = member.lastKnownLocation;
  return {
    id: member.id,
    displayName: member.role === 'owner' ? 'Convoy lead' : `Member ${index + 1}`,
    role: normalizeTeamRole(member),
    vehicleName: 'Vehicle not assigned',
    status: location ? 'checkedIn' : 'unknown',
    coordinates: location
      ? {
          latitude: location.lat,
          longitude: location.lng,
        }
      : null,
    lastPingAt: location ? dateFrom(location.updatedAt) : null,
    lastCheckInAt: null,
    spacingFromPrevious: null,
    distanceFromRoute: null,
    note: location ? 'Last known location only' : null,
    isCurrentUser: false,
  };
}

function statusRank(status: ConvoyMemberStatus): number {
  switch (status) {
    case 'emergency':
      return 5;
    case 'offline':
      return 4;
    case 'delayed':
      return 3;
    case 'stopped':
      return 2;
    case 'checkedIn':
    case 'online':
      return 1;
    case 'unknown':
    default:
      return 0;
  }
}

function mergeMembers(manualMembers: ConvoyMember[], teamMembers: ConvoyMember[]): ConvoyMember[] {
  if (manualMembers.length > 0) return manualMembers;
  return teamMembers;
}

function communicationsLabel(convoy: ConvoySnapshot | null): string {
  switch (valueOf(convoy?.communicationsStatus)) {
    case 'online':
      return 'Comms check-in current';
    case 'degraded':
      return 'Comms degraded';
    case 'offline':
      return 'Comms offline';
    case 'unknown':
    default:
      return 'Channel not set';
  }
}

function spacingLabel(convoy: ConvoySnapshot | null): string | null {
  const minutes = finite(valueOf(convoy?.convoySpacingMinutes));
  if (minutes != null) return `${Math.round(minutes)} min spacing`;
  const miles = finite(valueOf(convoy?.leadSweepSeparationMiles));
  if (miles != null) return `${miles.toFixed(miles < 10 ? 1 : 0)} mi lead/sweep`;
  return null;
}

function resolveDataState(params: {
  isOffline: boolean;
  hasLimitedConnectivity: boolean;
  hasPlan: boolean;
  hasPartialPlan: boolean;
  hasCheckIns: boolean;
  hasMembers: boolean;
  hasLiveSharing: boolean;
}): ConvoyCommandDataState {
  if (params.isOffline && (params.hasPlan || params.hasPartialPlan || params.hasMembers)) {
    return 'offline';
  }
  if (params.hasLimitedConnectivity && (params.hasCheckIns || params.hasMembers || params.hasPartialPlan)) {
    return 'partial';
  }
  if (params.hasLiveSharing && params.hasMembers && params.hasCheckIns) return 'live';
  if (params.hasCheckIns) return 'checkIn';
  if (params.hasPlan) return 'planned';
  if (params.hasPartialPlan || params.hasMembers) return 'partial';
  return 'setupNeeded';
}

function resolveCounts(
  members: ConvoyMember[],
  convoy: ConvoySnapshot | null,
): { delayedCount: number; offlineCount: number; emergencyCount: number } {
  const delayedLabels =
    (valueOf(convoy?.overdueMemberLabels) ?? []).length +
    (valueOf(convoy?.missedCheckpointMemberLabels) ?? []).length;
  const stoppedLabels = (valueOf(convoy?.stoppedUnexpectedlyLabels) ?? []).length;
  const assistanceLabels = (valueOf(convoy?.assistanceNeededMemberLabels) ?? []).length;
  const missingCount = finite(valueOf(convoy?.missingMemberCount)) ?? 0;

  return {
    delayedCount: Math.max(
      members.filter((member) => member.status === 'delayed' || member.status === 'stopped').length,
      delayedLabels + stoppedLabels,
    ),
    offlineCount: Math.max(members.filter((member) => member.status === 'offline').length, missingCount),
    emergencyCount: Math.max(members.filter((member) => member.status === 'emergency').length, assistanceLabels),
  };
}

function resolveRecommendation(params: {
  dataState: ConvoyCommandDataState;
  members: ConvoyMember[];
  emergencyCount: number;
  delayedCount: number;
  offlineCount: number;
  averageSpacing: string | null;
}): { recommendationLabel: string; recommendationReason: string } {
  if (params.dataState === 'setupNeeded') {
    return {
      recommendationLabel: 'SET CONVOY PLAN TO BEGIN',
      recommendationReason: 'Add convoy members, roles, rally point, or check-in details before ECS can coordinate the group.',
    };
  }

  if (params.dataState === 'live') {
    return {
      recommendationLabel: 'CONVOY STABLE',
      recommendationReason: 'Live convoy sharing is active. Continue monitoring spacing, sweep, and regroup points.',
    };
  }

  if (params.emergencyCount > 0) {
    return {
      recommendationLabel: 'MEMBER NEEDS ASSISTANCE',
      recommendationReason: 'One or more convoy members are marked as needing assistance. Treat this as the priority coordination item.',
    };
  }

  const sweep = params.members.find((member) => member.role === 'sweep');
  if (sweep?.status === 'offline' || sweep?.status === 'delayed' || sweep?.status === 'stopped') {
    return {
      recommendationLabel: 'REGROUP / CHECK SWEEP',
      recommendationReason: 'Sweep status is degraded. Use a rally point or check-in before continuing the convoy.',
    };
  }

  if (params.delayedCount > 0) {
    return {
      recommendationLabel: 'REGROUP RECOMMENDED',
      recommendationReason: 'A convoy member is delayed or stopped. Confirm comms and consider a controlled regroup.',
    };
  }

  if (params.offlineCount > 0) {
    return {
      recommendationLabel: 'CHECK COMMS CHANNEL',
      recommendationReason: 'At least one member is offline or unaccounted for in the latest convoy data.',
    };
  }

  if (params.dataState === 'offline') {
    return {
      recommendationLabel: 'OFFLINE - USE LAST CHECK-INS',
      recommendationReason: 'ECS is offline. Convoy status is based on saved plan or last known check-ins only.',
    };
  }

  if (params.dataState === 'checkIn') {
    return {
      recommendationLabel: 'CHECK-IN MODE - NO LIVE TRACKING',
      recommendationReason: 'Convoy coordination is based on manual or shared check-ins, not continuous live location sharing.',
    };
  }

  if (params.dataState === 'planned') {
    return {
      recommendationLabel: 'CONVOY PLAN READY',
      recommendationReason: params.averageSpacing
        ? `Planned convoy spacing is ${params.averageSpacing}. Confirm roles before departure.`
        : 'Convoy plan is staged. Confirm roles, comms, and rally point before departure.',
    };
  }

  return {
    recommendationLabel: 'CONVOY DATA PARTIAL',
    recommendationReason: 'Some convoy setup exists, but ECS needs more member or check-in details for stronger coordination.',
  };
}

function modeFromDataState(dataState: ConvoyCommandDataState): ConvoyMode {
  switch (dataState) {
    case 'live':
      return 'live';
    case 'checkIn':
      return 'checkIn';
    case 'planned':
    case 'partial':
      return 'planned';
    case 'offline':
      return 'offline';
    case 'setupNeeded':
    default:
      return 'setupNeeded';
  }
}

function missingInputs(params: {
  hasPlan: boolean;
  hasMembers: boolean;
  rallyPoint: string | null;
  channelLabel: string;
}): string[] {
  const missing: string[] = [];
  if (!params.hasPlan) missing.push('Convoy plan');
  if (!params.hasMembers) missing.push('Member roster');
  if (!params.rallyPoint) missing.push('Rally point');
  if (params.channelLabel === 'Channel not set') missing.push('Comms channel');
  return missing;
}

export function normalizeConvoyCommandData(
  input: ConvoyCommandInput = {},
): ConvoyCommandData {
  const teamSnapshot = input.teamSnapshot ?? null;
  const convoy = input.convoySnapshot ?? null;
  const manualMembers = (convoy?.members ?? []).map(normalizeManualMember);
  const teamMembers = (teamSnapshot?.members ?? []).map(normalizeTeamMember);
  const members = mergeMembers(manualMembers, teamMembers).sort(
    (left, right) => statusRank(right.status) - statusRank(left.status),
  );
  const teamCount = finite(valueOf(convoy?.teamMemberCount));
  const activeCount = finite(valueOf(convoy?.activeMemberCount));
  const convoySize = Math.max(
    Math.round(teamCount ?? 0),
    Math.round(activeCount ?? 0),
    members.length,
  );
  const rallyPoint = valueOf(convoy?.recommendedRegroupPoint);
  const channelLabel = communicationsLabel(convoy);
  const averageSpacing = spacingLabel(convoy);
  const hasMembers = members.length >= 2 || convoySize >= 2;
  const hasPlan = hasMembers || Boolean(teamSnapshot?.activeTeam && convoySize >= 2);
  const hasPartialPlan = Boolean(teamSnapshot?.activeTeam || rallyPoint || averageSpacing || convoy?.teamId);
  const hasCheckIns = Boolean(
    valueOf(convoy?.lastCheckInAt) ||
      manualMembers.some((member) => member.lastCheckInAt || member.status !== 'unknown') ||
      teamMembers.some((member) => member.lastPingAt),
  );
  const connectivityOffline =
    input.connectivityStatus === 'offline' ||
    input.connectivityLevel === 'no_service';
  const hasLimitedConnectivity =
    input.connectivityStatus === 'reconnecting' ||
    input.connectivityLevel === 'limited';
  const isOffline = Boolean(input.isOffline || connectivityOffline);
  const hasLiveSharing = Boolean(input.liveSharingAvailable);
  const dataState = resolveDataState({
    isOffline,
    hasLimitedConnectivity,
    hasPlan,
    hasPartialPlan,
    hasCheckIns,
    hasMembers,
    hasLiveSharing,
  });
  const counts = resolveCounts(members, convoy);
  const recommendation = resolveRecommendation({
    dataState,
    members,
    ...counts,
    averageSpacing,
  });
  const lastUpdatedAt = latestDate([
    dateFrom(valueOf(convoy?.lastCheckInAt)),
    dateFrom(teamSnapshot?.updatedAt),
    ...members.map((member) => member.lastCheckInAt ?? member.lastPingAt),
  ]);
  const missing = missingInputs({ hasPlan, hasMembers, rallyPoint: rallyPoint ?? null, channelLabel });

  return {
    mode: modeFromDataState(dataState),
    dataState,
    convoyName: teamSnapshot?.activeTeam?.name ?? (hasPlan ? 'Manual convoy plan' : 'Convoy not configured'),
    convoySize,
    activeRouteId: input.activeRouteId ?? null,
    rallyPoint: hasText(rallyPoint) ? rallyPoint : null,
    regroupDistance: averageSpacing,
    channelLabel,
    members,
    averageSpacing,
    ...counts,
    ...recommendation,
    missingInputs: missing,
    lastUpdatedAt,
    confidenceLabel:
      dataState === 'live'
        ? 'Live sharing confidence'
        : dataState === 'checkIn'
        ? 'Check-in confidence'
        : dataState === 'planned'
          ? 'Plan confidence'
          : dataState === 'offline'
            ? 'Offline confidence'
            : dataState === 'setupNeeded'
              ? 'Setup needed'
              : 'Partial confidence',
    sourceLabel:
      dataState === 'live'
        ? 'Live convoy sharing'
        : dataState === 'checkIn'
        ? 'Manual / shared check-ins'
        : dataState === 'planned'
          ? 'Manual convoy plan'
          : dataState === 'offline'
            ? 'Cached convoy state'
            : 'Convoy setup state',
    isOffline,
    usesLiveTracking: dataState === 'live' && hasLiveSharing,
  };
}

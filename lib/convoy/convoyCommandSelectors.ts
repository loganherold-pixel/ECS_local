import {
  normalizeConvoyCommandData,
  type ConvoyCommandData,
  type ConvoyCommandDataState,
  type ConvoyCommandInput,
  type ConvoyMember,
  type ConvoyMemberRole,
} from '../navigation/convoyCommandData';
import type {
  ConvoyCommandStatusLabel,
  ConvoyCommandVisualState,
  ConvoyCommandWidgetViewModel,
  ConvoyMemberSummary,
  ConvoyMemberSummaryRole,
} from './convoyCommandTypes';

export type ConvoyCommandWidgetSelectorInput = ConvoyCommandInput & {
  commandData?: ConvoyCommandData | null;
  staleAfterMinutes?: number | null;
  lostSignalAfterMinutes?: number | null;
  regroupGapMiles?: number | null;
};

const DEFAULT_STALE_AFTER_MINUTES = 15;
const DEFAULT_LOST_SIGNAL_AFTER_MINUTES = 45;
const DEFAULT_REGROUP_GAP_MILES = 5;

export const NO_ACTIVE_CONVOY_COMMAND_VIEW_MODEL: ConvoyCommandWidgetViewModel = {
  visualState: 'offline',
  statusLabel: 'OFFLINE',
  groupName: 'No Active Convoy',
  vehicleCount: 0,
  reportingCount: 0,
  widestGapMiles: null,
  regroupSuggested: false,
  lostUnitIndex: -1,
  cautionLevel: 0,
  alertText: null,
  members: [],
  isUsingLiveData: false,
  updatedAt: null,
};

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveFinite(value: unknown): number | null {
  const n = finite(value);
  return n != null && n >= 0 ? n : null;
}

function dateMs(value: string | number | Date | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function minutesSince(value: string | number | Date | null | undefined, nowMs: number): number | null {
  const ms = dateMs(value);
  if (ms == null) return null;
  return Math.max(0, (nowMs - ms) / 60000);
}

function clampCount(value: number): number {
  return Math.max(0, Math.round(value));
}

function clampLostUnitIndex(value: number): number {
  return Math.max(-1, Math.trunc(value));
}

function clampCautionLevel(value: number): 0 | 1 | 2 {
  if (value >= 2) return 2;
  if (value >= 1) return 1;
  return 0;
}

export function formatConvoyDistanceMiles(value: number | null | undefined): string | null {
  const miles = positiveFinite(value);
  if (miles == null) return null;
  if (miles < 0.1) return '<0.1 mi';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function roleForSummary(role: ConvoyMemberRole, isCurrentUser: boolean): ConvoyMemberSummaryRole | undefined {
  if (isCurrentUser) return 'you';
  if (role === 'lead') return 'lead';
  if (role === 'sweep') return 'tail';
  if (role === 'recovery') return 'scout';
  if (role === 'member' || role === 'medic') return 'member';
  return undefined;
}

function latestMemberTimestamp(member: ConvoyMember): Date | null {
  return member.lastPingAt ?? member.lastCheckInAt ?? null;
}

function isReportingStatus(member: ConvoyMember): boolean {
  return member.status === 'online' || member.status === 'checkedIn';
}

function isDegradedStatus(member: ConvoyMember): boolean {
  return member.status === 'delayed' || member.status === 'stopped' || member.status === 'unknown';
}

function isLostSignalStatus(member: ConvoyMember): boolean {
  return member.status === 'offline';
}

function memberSummary(
  member: ConvoyMember,
  nowMs: number,
  staleAfterMinutes: number,
  lostSignalAfterMinutes: number,
): ConvoyMemberSummary {
  const lastSeenAt = latestMemberTimestamp(member);
  const ageMinutes = minutesSince(lastSeenAt, nowMs);
  const isLostSignal = isLostSignalStatus(member) || (ageMinutes != null && ageMinutes >= lostSignalAfterMinutes);
  const isStale =
    isLostSignal ||
    isDegradedStatus(member) ||
    ageMinutes == null ||
    ageMinutes >= staleAfterMinutes;

  return {
    id: member.id,
    displayName: member.displayName,
    role: roleForSummary(member.role, member.isCurrentUser),
    distanceFromUserMiles: positiveFinite(member.spacingFromPrevious ?? member.distanceFromRoute),
    lastSeenAt,
    isReporting: isReportingStatus(member) && !isStale && !isLostSignal,
    isStale,
    isLostSignal,
  };
}

function resolveWidestGapMiles(members: ConvoyMember[]): number | null {
  const gaps = members
    .map((member) => positiveFinite(member.spacingFromPrevious))
    .filter((value): value is number => value != null);
  if (gaps.length === 0) return null;
  return Math.max(...gaps);
}

function hasActiveConvoy(data: ConvoyCommandData): boolean {
  return data.dataState !== 'setupNeeded' && (data.convoySize > 0 || data.members.length > 0);
}

function visualStateForData(params: {
  dataState: ConvoyCommandDataState;
  lostSignalCount: number;
  staleCount: number;
  emergencyCount: number;
  delayedCount: number;
  offlineCount: number;
  usesLiveTracking: boolean;
  isOffline: boolean;
}): ConvoyCommandVisualState {
  if (params.isOffline || params.dataState === 'offline') return 'offline';
  if (params.emergencyCount > 0 || params.lostSignalCount > 0) return 'alert';
  if (params.dataState === 'planned' || params.dataState === 'checkIn') return 'estimated';
  if (params.dataState === 'partial' || params.offlineCount > 0 || params.delayedCount > 0 || params.staleCount > 0) return 'partial';
  if (params.dataState === 'live' && params.usesLiveTracking) return 'live';
  return 'estimated';
}

function statusLabelForVisualState(visualState: ConvoyCommandVisualState): ConvoyCommandStatusLabel {
  switch (visualState) {
    case 'live':
      return 'LIVE';
    case 'estimated':
      return 'ESTIMATED';
    case 'partial':
      return 'PARTIAL';
    case 'alert':
      return 'ALERT';
    case 'offline':
    default:
      return 'OFFLINE';
  }
}

function formatAgeMinutes(lastSeenAt: string | number | Date | null | undefined, nowMs: number): string | null {
  const age = minutesSince(lastSeenAt, nowMs);
  if (age == null) return null;
  if (age < 1) return 'just now';
  const rounded = Math.round(age);
  return `${rounded} min ago`;
}

function alertTextForLostMember(member: ConvoyMemberSummary, nowMs: number): string {
  const ageLabel = formatAgeMinutes(member.lastSeenAt, nowMs);
  return `Signal lost: ${member.displayName}${ageLabel ? ` last seen ${ageLabel}` : ''}`;
}

function resolveCautionLevel(params: {
  visualState: ConvoyCommandVisualState;
  lostSignalCount: number;
  emergencyCount: number;
  staleCount: number;
  widestGapMiles: number | null;
  regroupGapMiles: number;
}): 0 | 1 | 2 {
  if (params.visualState === 'alert') {
    return clampCautionLevel(params.emergencyCount > 0 || params.lostSignalCount > 1 ? 2 : 1);
  }
  if (
    params.visualState === 'partial' ||
    params.visualState === 'estimated' ||
    params.staleCount > 0 ||
    (params.widestGapMiles != null && params.widestGapMiles > params.regroupGapMiles)
  ) {
    return 1;
  }
  return 0;
}

export function selectConvoyCommandWidgetViewModel(
  input: ConvoyCommandWidgetSelectorInput = {},
): ConvoyCommandWidgetViewModel {
  const nowMs = input.nowMs ?? Date.now();
  const staleAfterMinutes = positiveFinite(input.staleAfterMinutes) ?? DEFAULT_STALE_AFTER_MINUTES;
  const lostSignalAfterMinutes = positiveFinite(input.lostSignalAfterMinutes) ?? DEFAULT_LOST_SIGNAL_AFTER_MINUTES;
  const regroupGapMiles = positiveFinite(input.regroupGapMiles) ?? DEFAULT_REGROUP_GAP_MILES;
  const data = input.commandData ?? normalizeConvoyCommandData(input);

  if (!hasActiveConvoy(data)) {
    return { ...NO_ACTIVE_CONVOY_COMMAND_VIEW_MODEL };
  }

  const members = data.members.map((member) =>
    memberSummary(member, nowMs, staleAfterMinutes, lostSignalAfterMinutes),
  );
  const vehicleCount = clampCount(Math.max(data.convoySize, members.length));
  const reportingCount = clampCount(members.filter((member) => member.isReporting).length);
  const widestGapMiles = resolveWidestGapMiles(data.members);
  const lostUnitIndex = clampLostUnitIndex(members.findIndex((member) => member.isLostSignal));
  const lostSignalCount = members.filter((member) => member.isLostSignal).length;
  const staleCount = members.filter((member) => member.isStale && !member.isLostSignal).length;
  const visualState = visualStateForData({
    dataState: data.dataState,
    lostSignalCount,
    staleCount,
    emergencyCount: data.emergencyCount,
    delayedCount: data.delayedCount,
    offlineCount: data.offlineCount,
    usesLiveTracking: data.usesLiveTracking,
    isOffline: data.isOffline,
  });
  const regroupSuggested =
    data.recommendationLabel.includes('REGROUP') ||
    (widestGapMiles != null && widestGapMiles > regroupGapMiles);
  const cautionLevel = resolveCautionLevel({
    visualState,
    lostSignalCount,
    emergencyCount: data.emergencyCount,
    staleCount,
    widestGapMiles,
    regroupGapMiles,
  });
  const lostMember = lostUnitIndex >= 0 ? members[lostUnitIndex] : null;

  return {
    visualState,
    statusLabel: statusLabelForVisualState(visualState),
    groupName: data.convoyName || NO_ACTIVE_CONVOY_COMMAND_VIEW_MODEL.groupName,
    vehicleCount,
    reportingCount,
    widestGapMiles,
    regroupSuggested,
    lostUnitIndex,
    cautionLevel,
    alertText: visualState === 'alert' && lostMember ? alertTextForLostMember(lostMember, nowMs) : null,
    members,
    isUsingLiveData: visualState === 'live' && data.usesLiveTracking,
    updatedAt: data.lastUpdatedAt,
  };
}

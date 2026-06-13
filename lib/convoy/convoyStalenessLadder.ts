export type ConvoyStalenessStatus =
  | 'fresh'
  | 'delayed'
  | 'stale'
  | 'missing_check_in'
  | 'assistance_requested'
  | 'recovery_event_active'
  | 'unknown_no_permission'
  | 'unknown_no_data';

export type ConvoyStalenessGroup =
  | 'recovery_event_active'
  | 'assistance_requested'
  | 'missing_check_in'
  | 'stale'
  | 'delayed'
  | 'fresh'
  | 'unknown';

export const CONVOY_STALENESS_GROUP_ORDER: ConvoyStalenessGroup[] = [
  'recovery_event_active',
  'assistance_requested',
  'missing_check_in',
  'stale',
  'delayed',
  'fresh',
  'unknown',
];

export type StalenessPolicy = {
  delayedAfter: number;
  staleAfter: number;
  missingAfter: number;
};

export type ConvoyStalenessRosterMember = {
  memberId: string;
  displayName: string;
  role?: string | null;
};

export type ConvoyAcceptedCheckIn = {
  memberId: string;
  acceptedAt: string;
  source?: 'dispatch' | 'garmin_inreach' | string | null;
};

export type ConvoySharedCoordinate = {
  memberId: string;
  lat: number;
  lng: number;
  sharedAt: string;
  explicitlyShared: boolean;
  label?: string | null;
};

export type ConvoyStalenessEvent = {
  eventId: string;
  memberId: string;
  type: 'assist' | 'assistance_requested' | 'recovery' | 'recovery_event' | 'ping' | 'rally' | string;
  active: boolean;
  summary?: string | null;
  createdAt?: string | null;
};

export type ConvoyOfflineReplayState = {
  memberId: string;
  state: 'pending' | 'accepted' | 'failed' | 'unknown' | string;
  capturedAt?: string | null;
  visible?: boolean | null;
};

export type ConvoyChannelState = {
  memberId: string;
  state: 'connected' | 'degraded' | 'offline' | 'unknown' | string;
  observedAt?: string | null;
};

export type ConvoyStalenessPermissions = {
  canViewRoster: boolean;
  canViewStatus: boolean;
  canViewCheckInTimestamps: boolean;
  canViewSharedCoordinates: boolean;
  canViewOfflineReplayState?: boolean | null;
};

export type ConvoyGarminInReachInput = {
  enabled: boolean;
  connected: boolean;
  permitted: boolean;
  checkIns?: ConvoyAcceptedCheckIn[] | null;
  events?: ConvoyStalenessEvent[] | null;
};

export type ConvoyStalenessLadderInput = {
  now: string;
  policy?: StalenessPolicy | null;
  roster?: ConvoyStalenessRosterMember[] | null;
  permissions: ConvoyStalenessPermissions;
  lastAcceptedCheckIns?: ConvoyAcceptedCheckIn[] | null;
  sharedCoordinates?: ConvoySharedCoordinate[] | null;
  events?: ConvoyStalenessEvent[] | null;
  offlineReplay?: ConvoyOfflineReplayState[] | null;
  channelStates?: ConvoyChannelState[] | null;
  garminInReach?: ConvoyGarminInReachInput | null;
};

export type ConvoyStalenessCoordinateDisplay = {
  lat: number;
  lng: number;
  sharedAt: string;
  label: string | null;
};

export type ConvoyStalenessLadderRow = {
  memberId: string;
  displayName: string;
  role: string | null;
  status: ConvoyStalenessStatus;
  group: ConvoyStalenessGroup;
  lastCheckInAt: string | null;
  lastCheckInAgeMinutes: number | null;
  lastSharedCoordinate: ConvoyStalenessCoordinateDisplay | null;
  channelState: string | null;
  activeEventSummary: string | null;
  sourceNotes: string[];
  privacyNotes: string[];
};

export type ConvoyStalenessLadderGroup = {
  group: ConvoyStalenessGroup;
  label: string;
  rows: ConvoyStalenessLadderRow[];
};

export type ConvoyStalenessLadder = {
  generatedAt: string;
  readinessLabel: 'Current user-facing/internal beta extension';
  policy: StalenessPolicy | null;
  rows: ConvoyStalenessLadderRow[];
  groups: ConvoyStalenessLadderGroup[];
  sourceNotes: string[];
};

const GROUP_LABELS: Record<ConvoyStalenessGroup, string> = {
  recovery_event_active: 'Recovery event active',
  assistance_requested: 'Assistance requested',
  missing_check_in: 'Missing check-in',
  stale: 'Stale',
  delayed: 'Delayed',
  fresh: 'Fresh',
  unknown: 'Unknown',
};

function validPolicy(policy: StalenessPolicy | null | undefined): policy is StalenessPolicy {
  if (!policy) return false;
  const delayed = Number(policy.delayedAfter);
  const stale = Number(policy.staleAfter);
  const missing = Number(policy.missingAfter);
  return (
    Number.isFinite(delayed) &&
    Number.isFinite(stale) &&
    Number.isFinite(missing) &&
    delayed >= 0 &&
    stale > delayed &&
    missing > stale
  );
}

function minutesSince(timestamp: string | null | undefined, nowMs: number): number | null {
  const parsed = Date.parse(String(timestamp ?? ''));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((nowMs - parsed) / 60_000));
}

function latestByMember<T>(
  rows: readonly T[] | null | undefined,
  memberId: string,
  timestampOf: (row: T) => string | null | undefined,
  predicate: (row: T) => boolean = () => true,
): T | null {
  let latest: T | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  (rows ?? []).forEach((row) => {
    if (!predicate(row)) return;
    const rowMemberId = (row as { memberId?: string | null }).memberId;
    if (rowMemberId !== memberId) return;
    const parsed = Date.parse(String(timestampOf(row) ?? ''));
    if (!Number.isFinite(parsed)) return;
    if (parsed > latestMs) {
      latest = row;
      latestMs = parsed;
    }
  });
  return latest;
}

function groupForStatus(status: ConvoyStalenessStatus): ConvoyStalenessGroup {
  if (status === 'unknown_no_data' || status === 'unknown_no_permission') return 'unknown';
  return status;
}

function timeStatus(ageMinutes: number, policy: StalenessPolicy): ConvoyStalenessStatus {
  if (ageMinutes >= policy.missingAfter) return 'missing_check_in';
  if (ageMinutes >= policy.staleAfter) return 'stale';
  if (ageMinutes >= policy.delayedAfter) return 'delayed';
  return 'fresh';
}

function activeRecoveryEvent(events: readonly ConvoyStalenessEvent[] | null | undefined, memberId: string): ConvoyStalenessEvent | null {
  return latestByMember(
    events,
    memberId,
    (event) => event.createdAt,
    (event) => event.active && (event.type === 'recovery' || event.type === 'recovery_event'),
  );
}

function activeAssistanceEvent(events: readonly ConvoyStalenessEvent[] | null | undefined, memberId: string): ConvoyStalenessEvent | null {
  return latestByMember(
    events,
    memberId,
    (event) => event.createdAt,
    (event) => event.active && (event.type === 'assist' || event.type === 'assistance_requested'),
  );
}

function contextualEvents(events: readonly ConvoyStalenessEvent[] | null | undefined, memberId: string): ConvoyStalenessEvent[] {
  return (events ?? [])
    .filter((event) => event.memberId === memberId && event.active && (event.type === 'ping' || event.type === 'rally'))
    .slice()
    .sort((left, right) => Date.parse(String(right.createdAt ?? '')) - Date.parse(String(left.createdAt ?? '')));
}

function acceptedCheckIns(input: ConvoyStalenessLadderInput): ConvoyAcceptedCheckIn[] {
  const base = [...(input.lastAcceptedCheckIns ?? [])];
  const garmin = input.garminInReach;
  if (garmin?.enabled && garmin.connected && garmin.permitted) {
    base.push(...(garmin.checkIns ?? []));
  }
  return base;
}

function allEvents(input: ConvoyStalenessLadderInput): ConvoyStalenessEvent[] {
  const base = [...(input.events ?? [])];
  const garmin = input.garminInReach;
  if (garmin?.enabled && garmin.connected && garmin.permitted) {
    base.push(...(garmin.events ?? []));
  }
  return base;
}

function unknownRow(
  member: ConvoyStalenessRosterMember,
  status: Extract<ConvoyStalenessStatus, 'unknown_no_permission' | 'unknown_no_data'>,
  reason: string,
  channelState: ConvoyChannelState | null,
): ConvoyStalenessLadderRow {
  return {
    memberId: member.memberId,
    displayName: member.displayName,
    role: member.role ?? null,
    status,
    group: 'unknown',
    lastCheckInAt: null,
    lastCheckInAgeMinutes: null,
    lastSharedCoordinate: null,
    channelState: channelState?.state ?? null,
    activeEventSummary: null,
    sourceNotes: [],
    privacyNotes: [reason],
  };
}

function rowForMember(
  input: ConvoyStalenessLadderInput,
  member: ConvoyStalenessRosterMember,
  policy: StalenessPolicy | null,
  nowMs: number,
  checkIns: readonly ConvoyAcceptedCheckIn[],
  events: readonly ConvoyStalenessEvent[],
): ConvoyStalenessLadderRow {
  const channel = latestByMember(input.channelStates, member.memberId, (state) => state.observedAt);
  if (!input.permissions.canViewRoster || !input.permissions.canViewStatus) {
    return unknownRow(member, 'unknown_no_permission', 'unknown: no permission to view convoy status details.', channel);
  }
  if (!policy) {
    return unknownRow(member, 'unknown_no_data', 'unknown: missing expedition staleness policy.', channel);
  }

  const recovery = activeRecoveryEvent(events, member.memberId);
  const assist = activeAssistanceEvent(events, member.memberId);
  const latestCheckIn = latestByMember(checkIns, member.memberId, (checkIn) => checkIn.acceptedAt);
  const latestReplay = latestByMember(input.offlineReplay, member.memberId, (replay) => replay.capturedAt, (replay) => replay.state === 'pending' && replay.visible !== false);
  const sourceNotes: string[] = [];
  const privacyNotes: string[] = [];

  if (!latestCheckIn && !recovery && !assist) {
    if (input.garminInReach?.enabled && (!input.garminInReach.connected || !input.garminInReach.permitted)) {
      privacyNotes.push('unknown: Garmin/inReach check-in source is not enabled, connected, and permitted.');
    }
    privacyNotes.push('unknown: no accepted check-in source.');
    return unknownRow(member, 'unknown_no_data', privacyNotes.join(' '), channel);
  }

  if (latestReplay && input.permissions.canViewOfflineReplayState !== false) {
    sourceNotes.push('pending replay: offline item is visible but does not refresh status until accepted by source-of-truth.');
  }

  contextualEvents(events, member.memberId).forEach((event) => {
    sourceNotes.push(`${event.type} context: ${event.summary ?? 'event recorded'}.`);
  });

  const ageMinutes = minutesSince(latestCheckIn?.acceptedAt, nowMs);
  let status: ConvoyStalenessStatus = ageMinutes == null ? 'unknown_no_data' : timeStatus(ageMinutes, policy);
  let activeEventSummary: string | null = null;
  if (recovery) {
    status = 'recovery_event_active';
    activeEventSummary = recovery.summary ?? 'Recovery event active';
  } else if (assist) {
    status = 'assistance_requested';
    activeEventSummary = assist.summary ?? 'Assistance requested';
  }

  let coordinate: ConvoyStalenessCoordinateDisplay | null = null;
  const sharedCoordinate = latestByMember(
    input.sharedCoordinates,
    member.memberId,
    (item) => item.sharedAt,
    (item) => item.explicitlyShared === true,
  );
  if (sharedCoordinate) {
    if (input.permissions.canViewSharedCoordinates) {
      coordinate = {
        lat: sharedCoordinate.lat,
        lng: sharedCoordinate.lng,
        sharedAt: sharedCoordinate.sharedAt,
        label: sharedCoordinate.label ?? null,
      };
      sourceNotes.push('last shared coordinate is explicitly shared and permissioned.');
    } else {
      privacyNotes.push('last shared coordinate hidden: missing coordinate permission.');
    }
  }

  if (!input.permissions.canViewCheckInTimestamps) {
    privacyNotes.push('check-in timestamp hidden by permission.');
  }

  return {
    memberId: member.memberId,
    displayName: member.displayName,
    role: member.role ?? null,
    status,
    group: groupForStatus(status),
    lastCheckInAt: input.permissions.canViewCheckInTimestamps ? latestCheckIn?.acceptedAt ?? null : null,
    lastCheckInAgeMinutes: input.permissions.canViewCheckInTimestamps ? ageMinutes : null,
    lastSharedCoordinate: coordinate,
    channelState: channel?.state ?? null,
    activeEventSummary,
    sourceNotes,
    privacyNotes,
  };
}

function groupsFromRows(rows: ConvoyStalenessLadderRow[]): ConvoyStalenessLadderGroup[] {
  return CONVOY_STALENESS_GROUP_ORDER
    .map((group) => ({
      group,
      label: GROUP_LABELS[group],
      rows: rows.filter((row) => row.group === group),
    }))
    .filter((group) => group.rows.length > 0);
}

export function buildConvoyStalenessLadder(input: ConvoyStalenessLadderInput): ConvoyStalenessLadder {
  const nowMs = Date.parse(input.now);
  const generatedAt = Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : new Date().toISOString();
  const policy = validPolicy(input.policy) ? input.policy : null;
  const roster = input.roster?.length
    ? input.roster
    : [{
        memberId: 'unknown-roster',
        displayName: 'Unknown convoy member',
        role: null,
      }];
  const checkIns = acceptedCheckIns(input);
  const events = allEvents(input);
  const sourceNotes: string[] = [];
  if (!input.roster?.length) sourceNotes.push('unknown: no roster data.');
  if (!policy) sourceNotes.push('unknown: missing expedition staleness policy.');

  const rows = roster.map((member) => rowForMember(
    input,
    member,
    policy,
    Number.isFinite(nowMs) ? nowMs : Date.now(),
    checkIns,
    events,
  ));

  return {
    generatedAt,
    readinessLabel: 'Current user-facing/internal beta extension',
    policy,
    rows,
    groups: groupsFromRows(rows),
    sourceNotes,
  };
}

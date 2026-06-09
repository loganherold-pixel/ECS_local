export type ConvoyV15Role = 'leader' | 'member' | 'tail' | 'scout' | 'recovery' | 'medic';
export type ConvoyV15ParticipantStatus = 'live' | 'stale' | 'disconnected' | 'unknown' | 'mock_demo';
export type ConvoyV15SourceKind = 'live' | 'cached' | 'manual' | 'mock_demo' | 'unknown';

export interface ConvoyV15Coordinate {
  latitude: number;
  longitude: number;
}

export interface ConvoyV15ParticipantStatusInput {
  participantId?: unknown;
  activeParticipant?: boolean | null;
  sourceKind?: unknown;
  location?: Partial<ConvoyV15Coordinate> | null;
  updatedAt?: string | number | Date | null;
  movementStatus?: unknown;
  nowMs?: number;
}

export interface ConvoyV15ParticipantStatusResult {
  status: ConvoyV15ParticipantStatus;
  isProductionLive: boolean;
  reason: string;
  updatedAt: string | null;
  ageMs: number | null;
  sourceKind: ConvoyV15SourceKind;
}

export interface ConvoyV15ParticipantContractInput extends ConvoyV15ParticipantStatusInput {
  convoyId?: unknown;
  convoySource?: unknown;
  displayName?: unknown;
  vehicleId?: unknown;
  vehicleLabel?: unknown;
  role?: unknown;
  headingDegrees?: unknown;
  speedMps?: unknown;
}

export interface ConvoyV15ParticipantContract {
  convoy: {
    id: string | null;
    source: string;
  };
  participant: {
    id: string | null;
    active: boolean | null;
  };
  display: {
    name: string;
  };
  vehicle: {
    id: string | null;
    label: string | null;
  };
  role: ConvoyV15Role;
  roleSemantics: ConvoyV15RoleSemantics;
  location: ConvoyV15Coordinate | null;
  motion: {
    headingDegrees: number | null;
    speedMps: number | null;
  };
  freshness: {
    updatedAt: string | null;
    ageMs: number | null;
  };
  status: ConvoyV15ParticipantStatusResult;
  emergency: {
    needsAssistance: boolean;
    recoveryFlag: boolean;
  };
  privacyScope: typeof CONVOY_COMMAND_V15_PRIVACY_SCOPE.scope;
  inviteAuthority: {
    contract: string;
  };
  sourceKind: ConvoyV15SourceKind;
  badgeIdentity: {
    status: typeof CONVOY_COMMAND_V15_BADGE_IDENTITY_STATUS;
    title: null;
  };
}

export interface ConvoyV15RoleSemantics {
  role: ConvoyV15Role;
  label: string;
  copy: string;
}

export interface ConvoyV15InviteAuthorityInput {
  sourceKind?: unknown;
  inviteId?: unknown;
  convoyId?: unknown;
  inviteLinkBaseUrl?: unknown;
  revokedAt?: string | number | Date | null;
  expiresAt?: string | number | Date | null;
  nowMs?: number;
}

export const CONVOY_COMMAND_V15_LIVE_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;

export const CONVOY_COMMAND_V15_BADGE_IDENTITY_STATUS = 'deferred' as const;

export const CONVOY_COMMAND_V15_PRIVACY_SCOPE = {
  scope: 'active_convoy_members_only',
  locationPrecision: 'precise participant locations are scoped to the active convoy only.',
  joinAuthority: 'Join access is granted through active, unexpired convoy invite credentials.',
  retention: 'Last known locations remain convoy-scoped and must not be exposed globally.',
} as const;

export const CONVOY_COMMAND_V15_DEFERRED_ITEMS = [
  'badge_identity_title_display',
  'convoy_badge_unlocks',
  'public_convoy_presence',
  'community_convoy_publishing',
  'route_deviation_without_reliable_route_context',
  'professional_medic_or_recovery_certification_claims',
] as const;

export const CONVOY_COMMAND_V15_SOURCE_OF_TRUTH_CONTRACT = {
  convoy: 'Convoy id and source come from convoy membership or active convoy context.',
  participant: 'Participant id comes from active convoy membership, not global user enumeration.',
  display: 'Callsign/display name are sanitized operational labels.',
  vehicle: 'Vehicle id or label may be linked when available; it is optional.',
  role: 'Roles are functional convoy labels, normalized to leader/member/tail/scout/recovery/medic.',
  location: 'Coordinates are optional and only live when fresh, valid, and from an active participant.',
  motion: 'Heading and speed are optional motion hints from the current location sample.',
  freshness: 'Last updated timestamp and age determine live versus stale status.',
  status: 'Status is live, stale, disconnected, unknown, or mock_demo.',
  emergency: 'Needs-assistance/recovery flags are operational signals when already present.',
  privacyScope: CONVOY_COMMAND_V15_PRIVACY_SCOPE.scope,
  inviteAuthority: 'Production invites must be active, unexpired, unrevoked, and non-demo.',
  sourceKind: 'Source kind distinguishes live, cached, manual, mock/demo, and unknown data.',
  badgeIdentity: {
    status: CONVOY_COMMAND_V15_BADGE_IDENTITY_STATUS,
    convoyDisplayField: null,
  },
} as const;

function normalizedText(value: unknown): string {
  return String(value ?? '').trim();
}

function lowerText(value: unknown): string {
  return normalizedText(value).toLowerCase();
}

function safeString(value: unknown, fallback: string): string {
  const text = normalizedText(value).replace(/\s+/g, ' ');
  return text || fallback;
}

function optionalString(value: unknown): string | null {
  const text = normalizedText(value).replace(/\s+/g, ' ');
  return text || null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function validCoordinate(location: Partial<ConvoyV15Coordinate> | null | undefined): ConvoyV15Coordinate | null {
  const latitude = finiteNumber(location?.latitude);
  const longitude = finiteNumber(location?.longitude);
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function timestampMs(value: string | number | Date | null | undefined): number | null {
  if (value == null || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isMockDemoSource(value: unknown): boolean {
  const source = lowerText(value);
  return (
    source.includes('mock') ||
    source.includes('demo') ||
    source.includes('fixture') ||
    source.includes('test_only') ||
    source.includes('test-only')
  );
}

function normalizeSourceKind(sourceKind: unknown): ConvoyV15SourceKind {
  const source = lowerText(sourceKind);
  if (!source) return 'unknown';
  if (isMockDemoSource(source)) return 'mock_demo';
  if (source.includes('cache') || source.includes('cached') || source.includes('offline') || source.includes('local_pending')) {
    return 'cached';
  }
  if (source.includes('manual') || source.includes('check-in') || source.includes('checkin')) return 'manual';
  if (
    source.includes('live') ||
    source.includes('realtime') ||
    source.includes('supabase') ||
    source.includes('cloud')
  ) {
    return 'live';
  }
  return 'unknown';
}

export function normalizeConvoyV15Role(role: unknown): ConvoyV15Role {
  switch (lowerText(role)) {
    case 'lead':
    case 'leader':
      return 'leader';
    case 'sweep':
    case 'tail':
      return 'tail';
    case 'scout':
      return 'scout';
    case 'recovery':
    case 'recover':
      return 'recovery';
    case 'medic':
    case 'medical':
    case 'aid':
      return 'medic';
    case 'member':
    case 'support':
    case '':
      return 'member';
    default:
      return 'member';
  }
}

export function roleSemanticsForConvoyV15Role(role: unknown): ConvoyV15RoleSemantics {
  const normalized = normalizeConvoyV15Role(role);
  switch (normalized) {
    case 'leader':
      return {
        role: normalized,
        label: 'Leader',
        copy: 'Functional convoy lead label for coordination.',
      };
    case 'tail':
      return {
        role: normalized,
        label: 'Tail',
        copy: 'Functional convoy tail/sweep label for spacing and regroup coordination.',
      };
    case 'scout':
      return {
        role: normalized,
        label: 'Scout',
        copy: 'Functional convoy scout label for route awareness; not a verified credential.',
      };
    case 'recovery':
      return {
        role: normalized,
        label: 'Recovery',
        copy: 'Functional convoy recovery label; not a certification or verified professional capability.',
      };
    case 'medic':
      return {
        role: normalized,
        label: 'Medic',
        copy: 'Functional convoy medic label; not a certification or verified professional capability.',
      };
    case 'member':
    default:
      return {
        role: 'member',
        label: 'Member',
        copy: 'Functional convoy member label.',
      };
  }
}

export function normalizeConvoyV15ParticipantStatus(
  input: ConvoyV15ParticipantStatusInput,
): ConvoyV15ParticipantStatusResult {
  const nowMs = finiteNumber(input.nowMs) ?? Date.now();
  const sourceKind = normalizeSourceKind(input.sourceKind);
  const participantId = optionalString(input.participantId);
  const location = validCoordinate(input.location);
  const updatedMs = timestampMs(input.updatedAt);
  const updatedAt = updatedMs == null ? null : new Date(updatedMs).toISOString();
  const ageMs = updatedMs == null ? null : Math.max(0, nowMs - updatedMs);
  const movementStatus = lowerText(input.movementStatus);

  if (sourceKind === 'mock_demo') {
    return {
      status: 'mock_demo',
      isProductionLive: false,
      reason: 'Mock/demo convoy participant data is development-only and is not production live.',
      updatedAt,
      ageMs,
      sourceKind,
    };
  }

  if (input.activeParticipant === false || movementStatus === 'offline' || movementStatus === 'disconnected') {
    return {
      status: 'disconnected',
      isProductionLive: false,
      reason: 'Participant is known, but no current signal is available.',
      updatedAt,
      ageMs,
      sourceKind,
    };
  }

  if (!participantId && !location) {
    return {
      status: 'unknown',
      isProductionLive: false,
      reason: 'No usable convoy participant status is available.',
      updatedAt,
      ageMs,
      sourceKind,
    };
  }

  if (!location) {
    return {
      status: participantId ? 'disconnected' : 'unknown',
      isProductionLive: false,
      reason: participantId
        ? 'Participant is known, but no usable location signal is available.'
        : 'No usable convoy participant location is available.',
      updatedAt,
      ageMs,
      sourceKind,
    };
  }

  if (ageMs == null) {
    return {
      status: 'stale',
      isProductionLive: false,
      reason: 'last known location exists, but update time is unavailable.',
      updatedAt,
      ageMs,
      sourceKind,
    };
  }

  if (
    sourceKind === 'live' &&
    input.activeParticipant === true &&
    ageMs <= CONVOY_COMMAND_V15_LIVE_LOCATION_MAX_AGE_MS
  ) {
    return {
      status: 'live',
      isProductionLive: true,
      reason: 'Recent location update from an active convoy participant.',
      updatedAt,
      ageMs,
      sourceKind,
    };
  }

  return {
    status: 'stale',
    isProductionLive: false,
    reason:
      ageMs > CONVOY_COMMAND_V15_LIVE_LOCATION_MAX_AGE_MS
        ? 'last known location exists, but the update is older than the live threshold.'
        : 'last known location exists, but the source is not confirmed live active tracking.',
    updatedAt,
    ageMs,
    sourceKind,
  };
}

export function buildConvoyV15ParticipantContract(
  input: ConvoyV15ParticipantContractInput,
): ConvoyV15ParticipantContract {
  const role = normalizeConvoyV15Role(input.role);
  const status = normalizeConvoyV15ParticipantStatus(input);
  const movementStatus = lowerText(input.movementStatus);
  return {
    convoy: {
      id: optionalString(input.convoyId),
      source: safeString(input.convoySource, 'unknown'),
    },
    participant: {
      id: optionalString(input.participantId),
      active: typeof input.activeParticipant === 'boolean' ? input.activeParticipant : null,
    },
    display: {
      name: safeString(input.displayName, 'Convoy member'),
    },
    vehicle: {
      id: optionalString(input.vehicleId),
      label: optionalString(input.vehicleLabel),
    },
    role,
    roleSemantics: roleSemanticsForConvoyV15Role(role),
    location: validCoordinate(input.location),
    motion: {
      headingDegrees: finiteNumber(input.headingDegrees),
      speedMps: finiteNumber(input.speedMps),
    },
    freshness: {
      updatedAt: status.updatedAt,
      ageMs: status.ageMs,
    },
    status,
    emergency: {
      needsAssistance: movementStatus === 'needs_assistance',
      recoveryFlag: role === 'recovery' || movementStatus === 'needs_assistance',
    },
    privacyScope: CONVOY_COMMAND_V15_PRIVACY_SCOPE.scope,
    inviteAuthority: {
      contract: 'active_unexpired_unrevoked_non_demo_invite_required',
    },
    sourceKind: status.sourceKind,
    badgeIdentity: {
      status: CONVOY_COMMAND_V15_BADGE_IDENTITY_STATUS,
      title: null,
    },
  };
}

export function isProductionConvoyInviteAuthority(input: ConvoyV15InviteAuthorityInput): boolean {
  const nowMs = finiteNumber(input.nowMs) ?? Date.now();
  const source = lowerText(input.sourceKind);
  const baseUrl = lowerText(input.inviteLinkBaseUrl);
  const inviteId = optionalString(input.inviteId);
  const convoyId = optionalString(input.convoyId);
  const expiresMs = timestampMs(input.expiresAt);

  if (!inviteId || !convoyId) return false;
  if (isMockDemoSource(source) || isMockDemoSource(inviteId) || isMockDemoSource(convoyId)) return false;
  if (baseUrl.includes('ecs.local') || baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) return false;
  if (input.revokedAt != null && timestampMs(input.revokedAt) != null) return false;
  if (expiresMs == null || expiresMs <= nowMs) return false;

  return source.includes('supabase') || source.includes('cloud') || source.includes('edge') || source.includes('live');
}

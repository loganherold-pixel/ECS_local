import { ADMIN_ACCOUNT_EMAIL, normalizeSharedAccountEmail } from '../sharedAccountPolicy';

export type ConvoyQaIdentityPreflightStatus = 'ready' | 'blocked' | 'incomplete';

export type ConvoyQaIdentityPreflightCode =
  | 'distinct_identities_ready'
  | 'local_identity_ready_for_pairing'
  | 'missing_user_id'
  | 'unreadable_auth_state'
  | 'backend_mismatch'
  | 'same_user_id'
  | 'same_participant_id'
  | 'active_convoy_present'
  | 'live_sharing_active'
  | 'pending_invite_or_join_state';

export interface ConvoyQaIdentitySnapshot {
  deviceLabel: string;
  userId?: string | null;
  email?: string | null;
  displayName?: string | null;
  backendProjectLabel?: string | null;
  activeConvoyId?: string | null;
  participantId?: string | null;
  liveSharingActive?: boolean | null;
  pendingInviteOrJoinState?: boolean | null;
  authStateReadable?: boolean | null;
}

export interface ConvoyQaIdentityDiagnostic {
  deviceLabel: string;
  authPresent: 'yes' | 'no';
  userId: string;
  email: string;
  displayName: string;
  backendProjectLabel: string;
  activeConvoyId: string;
  participantId: string;
  liveSharingActive: 'yes' | 'no';
  currentConvoyBaselineState:
    | 'clean'
    | 'active_convoy_present'
    | 'live_sharing_active'
    | 'pending_invite_or_join_state';
  preflightResult: ConvoyQaIdentityPreflightStatus;
  preflightCode: ConvoyQaIdentityPreflightCode;
}

export interface ConvoyQaIdentityPreflightInput {
  leader: ConvoyQaIdentitySnapshot;
  member: ConvoyQaIdentitySnapshot;
}

export interface ConvoyQaIdentityPreflightResult {
  status: ConvoyQaIdentityPreflightStatus;
  code: ConvoyQaIdentityPreflightCode;
  validForTrueTwoDeviceQa: boolean;
  summary: string;
  requiredActions: string[];
  diagnostics: {
    leader: ConvoyQaIdentityDiagnostic;
    member: ConvoyQaIdentityDiagnostic;
  };
}

export const CONVOY_QA_IDENTITY_DIAGNOSTIC_CONTRACT = {
  scope: 'dev_test_manual_preflight_only',
  forbiddenActions: [
    'sign_in',
    'sign_out',
    'create_convoy',
    'join_convoy',
    'publish_location',
    'unlock_badge',
    'mutate_fleet',
    'mutate_active_trip',
    'mutate_packet',
    'touch_telemetry',
  ],
} as const;

export const CONVOY_QA_DEVICE_A_LEADER_EMAIL = ADMIN_ACCOUNT_EMAIL;
export const CONVOY_QA_DEVICE_A_LEADER_LABEL = 'QA Leader';

export function isConvoyQaDeviceALeaderIdentity(email: string | null | undefined): boolean {
  return normalizeSharedAccountEmail(email) === CONVOY_QA_DEVICE_A_LEADER_EMAIL;
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function sameNormalized(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function redactConvoyQaIdentifier(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) return 'unknown';
  if (normalized.length <= 4) return `${normalized}...`;
  if (normalized.length <= 8) return `${normalized.slice(0, 4)}...`;
  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

export function redactConvoyQaEmail(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) return 'unknown';
  const atIndex = normalized.indexOf('@');
  if (atIndex <= 0 || atIndex === normalized.length - 1) return redactConvoyQaIdentifier(normalized);
  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const visibleLocal = local.length <= 2 ? local : local.slice(0, 2);
  return `${visibleLocal}...@${domain}`;
}

export function getConvoyQaBackendProjectLabelFromUrl(url: string | null | undefined): string {
  const normalized = normalizeText(url);
  if (!normalized) return 'unknown';
  try {
    const host = new URL(normalized).hostname;
    const [projectRef] = host.split('.');
    return projectRef || 'unknown';
  } catch {
    return 'unknown';
  }
}

function getBaselineState(snapshot: ConvoyQaIdentitySnapshot): ConvoyQaIdentityDiagnostic['currentConvoyBaselineState'] {
  if (normalizeText(snapshot.activeConvoyId)) return 'active_convoy_present';
  if (snapshot.liveSharingActive) return 'live_sharing_active';
  if (snapshot.pendingInviteOrJoinState) return 'pending_invite_or_join_state';
  return 'clean';
}

function classifyLocalSnapshot(snapshot: ConvoyQaIdentitySnapshot): {
  status: ConvoyQaIdentityPreflightStatus;
  code: ConvoyQaIdentityPreflightCode;
} {
  if (snapshot.authStateReadable === false) return { status: 'incomplete', code: 'unreadable_auth_state' };
  if (!normalizeText(snapshot.userId)) return { status: 'incomplete', code: 'missing_user_id' };
  if (normalizeText(snapshot.activeConvoyId)) return { status: 'blocked', code: 'active_convoy_present' };
  if (snapshot.liveSharingActive) return { status: 'blocked', code: 'live_sharing_active' };
  if (snapshot.pendingInviteOrJoinState) return { status: 'blocked', code: 'pending_invite_or_join_state' };
  return { status: 'ready', code: 'local_identity_ready_for_pairing' };
}

export function buildConvoyQaIdentityDiagnostic(snapshot: ConvoyQaIdentitySnapshot): ConvoyQaIdentityDiagnostic {
  const local = classifyLocalSnapshot(snapshot);
  return {
    deviceLabel: normalizeText(snapshot.deviceLabel) || 'Unknown device',
    authPresent: normalizeText(snapshot.userId) ? 'yes' : 'no',
    userId: redactConvoyQaIdentifier(snapshot.userId),
    email: redactConvoyQaEmail(snapshot.email),
    displayName: normalizeText(snapshot.displayName) || 'unknown',
    backendProjectLabel: normalizeText(snapshot.backendProjectLabel) || 'unknown',
    activeConvoyId: redactConvoyQaIdentifier(snapshot.activeConvoyId),
    participantId: redactConvoyQaIdentifier(snapshot.participantId),
    liveSharingActive: snapshot.liveSharingActive ? 'yes' : 'no',
    currentConvoyBaselineState: getBaselineState(snapshot),
    preflightResult: local.status,
    preflightCode: local.code,
  };
}

export function buildLocalConvoyQaIdentityDiagnostic(snapshot: ConvoyQaIdentitySnapshot): ConvoyQaIdentityDiagnostic {
  return buildConvoyQaIdentityDiagnostic(snapshot);
}

function result(
  status: ConvoyQaIdentityPreflightStatus,
  code: ConvoyQaIdentityPreflightCode,
  summary: string,
  requiredActions: string[],
  input: ConvoyQaIdentityPreflightInput,
): ConvoyQaIdentityPreflightResult {
  return {
    status,
    code,
    validForTrueTwoDeviceQa: status === 'ready',
    summary,
    requiredActions,
    diagnostics: {
      leader: buildConvoyQaIdentityDiagnostic(input.leader),
      member: buildConvoyQaIdentityDiagnostic(input.member),
    },
  };
}

export function evaluateConvoyQaAccountSeparation(
  input: ConvoyQaIdentityPreflightInput,
): ConvoyQaIdentityPreflightResult {
  const leaderUserId = normalizeText(input.leader.userId);
  const memberUserId = normalizeText(input.member.userId);
  const leaderBackend = normalizeText(input.leader.backendProjectLabel);
  const memberBackend = normalizeText(input.member.backendProjectLabel);

  if (input.leader.authStateReadable === false || input.member.authStateReadable === false) {
    return result(
      'incomplete',
      'unreadable_auth_state',
      'Both devices must expose a non-secret authenticated identity diagnostic before Convoy QA can start.',
      [
        'Use a debuggable QA/dev-client build, the in-app QA identity diagnostic, or an approved non-secret identity diagnostic.',
        'Do not rely on run-as when the installed package is not debuggable.',
      ],
      input,
    );
  }

  if (!leaderUserId || !memberUserId) {
    return result(
      'incomplete',
      'missing_user_id',
      'Both devices must show an authenticated user id before Convoy QA can start.',
      [
        'Sign in Device A as the QA Leader account.',
        'Sign in Device B as the QA Member account.',
        'Re-run the redacted identity preflight before creating a convoy.',
      ],
      input,
    );
  }

  if (leaderBackend && memberBackend && leaderBackend !== memberBackend) {
    return result(
      'blocked',
      'backend_mismatch',
      'Device A and Device B are not pointed at the same backend/project.',
      [
        'Confirm both devices use the same ECS build and QA backend environment.',
        'Do not create or join a convoy until backend/project labels match.',
      ],
      input,
    );
  }

  if (sameNormalized(input.leader.userId, input.member.userId)) {
    return result(
      'blocked',
      'same_user_id',
      'Device A and Device B are using the same authenticated user id, which can collapse leader/member into one visible participant.',
      [
        'Keep Device A signed in as QA Leader.',
        'Sign Device B into a separate QA Member account.',
        'Verify the redacted user ids differ before generating or accepting an invite.',
      ],
      input,
    );
  }

  if (sameNormalized(input.leader.participantId, input.member.participantId)) {
    return result(
      'blocked',
      'same_participant_id',
      'Device A and Device B resolve to the same convoy participant id, so invite acceptance cannot validate two distinct participants.',
      [
        'End or leave any stale QA convoy on both devices.',
        'Clear local Convoy context after account switching.',
        'Rerun the preflight before starting live sharing.',
      ],
      input,
    );
  }

  if (normalizeText(input.leader.activeConvoyId) || normalizeText(input.member.activeConvoyId)) {
    return result(
      'blocked',
      'active_convoy_present',
      'A device still has an active convoy context, so the clean-baseline privacy run is not valid yet.',
      [
        'End or leave the active QA convoy.',
        'Revoke active QA invites if needed.',
        'Confirm both devices show no active convoy and no active members.',
      ],
      input,
    );
  }

  if (input.leader.liveSharingActive || input.member.liveSharingActive) {
    return result(
      'blocked',
      'live_sharing_active',
      'Live location sharing is already active, so the clean-baseline privacy run is not valid yet.',
      [
        'Stop live sharing on both devices.',
        'Confirm both devices show tracking disabled before creating a convoy.',
      ],
      input,
    );
  }

  if (input.leader.pendingInviteOrJoinState || input.member.pendingInviteOrJoinState) {
    return result(
      'blocked',
      'pending_invite_or_join_state',
      'A pending invite or join state exists, so the run cannot prove a clean create/join sequence.',
      [
        'Clear pending invite or join state through the intended UI.',
        'Confirm no pending invite/join state exists before creating a convoy.',
      ],
      input,
    );
  }

  return result(
    'ready',
    'distinct_identities_ready',
    'Device A and Device B have distinct authenticated identities and a clean Convoy baseline.',
    [
      'Proceed with Device A create convoy.',
      'Generate a fresh short-lived invite.',
      'Join from Device B and verify distinct participant rows before starting location sharing.',
    ],
    input,
  );
}

export function isConvoyQaIdentityDiagnosticAllowed({
  dev,
  nodeEnv,
}: {
  dev: boolean;
  nodeEnv?: string | null;
}): boolean {
  return dev || nodeEnv === 'test';
}

import type { ConvoyTrackingStoreState } from '../stores/convoyTrackingStore';
import {
  selectLostCommunicationsMemberHistory,
  type LostCommunicationsCreateInput,
} from './dispatchLostCommunicationsPlaybook';
import type {
  MissionCommand,
  MissionCommandActor,
  MissionCommandEvent,
} from './dispatchMissionCommandTypes';
import type { DispatchLinkedContext } from './dispatchTypes';

export interface LostCommunicationsRosterMember {
  id: string;
  label: string;
  roleId?: string | null;
}

export interface BuildLostCommunicationsRuntimeInput {
  expeditionId: string;
  actor: MissionCommandActor;
  member: LostCommunicationsRosterMember;
  members: readonly LostCommunicationsRosterMember[];
  soloMode: boolean;
  online: boolean;
  locationPermissionAllowed: boolean;
  positionSharingEnabled: boolean;
  convoy: ConvoyTrackingStoreState;
  commands: readonly MissionCommand[];
  events: readonly MissionCommandEvent[];
  routeContext?: DispatchLinkedContext | null;
  rallyOrBailoutContext?: DispatchLinkedContext | null;
  expeditionCommsPlan?: string | null;
  reviewMinutes?: number;
  now?: string | number | Date;
}

/**
 * Adapts current Dispatch runtime state into a privacy-minimized playbook snapshot.
 * It never reads stores directly and never manufactures a fallback position.
 */
export function buildLostCommunicationsRuntimeInput(
  input: BuildLostCommunicationsRuntimeInput,
): LostCommunicationsCreateInput {
  const rawMember = input.convoy.rawMembers.find((candidate) => (
    candidate.revoked_at == null &&
    (candidate.user_id === input.member.id || candidate.id === input.member.id)
  ));
  const location = rawMember
    ? input.convoy.rawLocations.find((candidate) => candidate.member_id === rawMember.id) ?? null
    : null;
  const normalizedMember = rawMember
    ? input.convoy.members.find((candidate) => candidate.memberId === rawMember.id) ?? null
    : null;
  const permittedPosition = input.locationPermissionAllowed && input.positionSharingEnabled && location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        capturedAt: location.captured_at,
        accuracyMeters: location.accuracy_meters ?? null,
        sourceLabel: 'ECS convoy member GPS sharing',
        offline: !input.online || input.convoy.connectionStatus !== 'connected',
      }
    : null;
  const knownMemberIds = new Set(input.members.map((member) => member.id));
  const leadMemberId = findAvailableRoleTarget(
    input.convoy,
    'lead',
    input.member.id,
    knownMemberIds,
  );
  const sweepMemberId = findAvailableRoleTarget(
    input.convoy,
    'sweep',
    input.member.id,
    knownMemberIds,
  );
  const history = selectLostCommunicationsMemberHistory({
    memberId: input.member.id,
    commands: [...input.commands],
    events: [...input.events],
  });

  return {
    expeditionId: input.expeditionId,
    actor: input.actor,
    member: {
      id: input.member.id,
      label: input.member.label,
      roleId: rawMember?.role ?? input.member.roleId ?? null,
      observedAt: normalizedMember?.updatedAt ?? normalizedMember?.capturedAt ?? null,
    },
    soloMode: input.soloMode,
    online: input.online,
    locationPermissionAllowed: input.locationPermissionAllowed,
    positionSharingEnabled: input.positionSharingEnabled,
    position: permittedPosition,
    ...history,
    routeContext: input.routeContext ?? null,
    leadMemberId,
    sweepMemberId,
    rallyOrBailoutContext: input.rallyOrBailoutContext ?? null,
    expeditionCommsPlan: input.expeditionCommsPlan ?? null,
    reviewMinutes: input.reviewMinutes,
    now: input.now,
  };
}

function findAvailableRoleTarget(
  convoy: ConvoyTrackingStoreState,
  role: 'lead' | 'sweep',
  excludedMemberId: string,
  knownMemberIds: ReadonlySet<string>,
): string | null {
  const member = convoy.rawMembers.find((candidate) => (
    candidate.role === role &&
    candidate.revoked_at == null &&
    candidate.user_id !== excludedMemberId &&
    !!candidate.user_id &&
    knownMemberIds.has(candidate.user_id)
  ));
  return member?.user_id ?? null;
}

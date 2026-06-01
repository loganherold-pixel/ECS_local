import {
  resolveCanonicalConnectivityState,
  type ConnectivitySyncReason,
  type ConnectivityStateInput,
} from './connectivityState';

export type Team = {
  id: string;
  name: string;
  ownerId: string;
};

export type TeamMember = {
  id: string;
  teamId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  lastKnownLocation?: {
    lat: number;
    lng: number;
    updatedAt: string;
  };
};

export type TeamStoreSnapshot = {
  activeTeam: Team | null;
  members: TeamMember[];
  updatedAt: string | null;
};

type TeamStoreListener = (snapshot: TeamStoreSnapshot) => void;

function createId(prefix: string): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c?.randomUUID) return `${prefix}-${c.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const listeners = new Set<TeamStoreListener>();
let snapshot: TeamStoreSnapshot = {
  activeTeam: null,
  members: [],
  updatedAt: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeTeam(rawTeam: unknown): Team | null {
  if (!isRecord(rawTeam)) {
    return null;
  }

  const id = cleanString(rawTeam.id);
  const name = cleanString(rawTeam.name);
  const ownerId = cleanString(rawTeam.ownerId);
  if (!id || !name || !ownerId) {
    return null;
  }

  return { id, name, ownerId };
}

function normalizeRole(value: unknown): TeamMember['role'] | null {
  return value === 'owner' || value === 'admin' || value === 'member' ? value : null;
}

function normalizeLocation(value: unknown): TeamMember['lastKnownLocation'] {
  if (!isRecord(value)) {
    return undefined;
  }

  const lat = Number(value.lat);
  const lng = Number(value.lng);
  const updatedAt = cleanString(value.updatedAt);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180 ||
    !updatedAt ||
    Number.isNaN(Date.parse(updatedAt))
  ) {
    return undefined;
  }

  return {
    lat,
    lng,
    updatedAt: new Date(Date.parse(updatedAt)).toISOString(),
  };
}

function normalizeMember(rawMember: unknown, activeTeamId: string): TeamMember | null {
  if (!isRecord(rawMember)) {
    return null;
  }

  const id = cleanString(rawMember.id);
  const teamId = cleanString(rawMember.teamId);
  const userId = cleanString(rawMember.userId);
  const role = normalizeRole(rawMember.role);
  if (!id || !teamId || teamId !== activeTeamId || !userId || !role) {
    return null;
  }

  return {
    id,
    teamId,
    userId,
    role,
    lastKnownLocation: normalizeLocation(rawMember.lastKnownLocation),
  };
}

function emit(): void {
  const current = teamStore.getSnapshot();
  listeners.forEach((listener) => {
    try {
      listener(current);
    } catch (error) {
      console.warn('[TEAM_STORE] listener_error', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export function getTeamStatusLabel(args: {
  isOnline: boolean;
  offlineMode: boolean;
  snapshot: TeamStoreSnapshot;
}): string {
  return getTeamSyncState(args).label;
}

export function getTeamSyncState(args: ConnectivityStateInput & {
  snapshot: TeamStoreSnapshot;
}): {
  label: string;
  reason: ConnectivitySyncReason;
  networkOnline: boolean;
  userForcedOfflineMode: boolean;
  effectiveOfflineMode: boolean;
  syncAvailable: boolean;
} {
  const connectivityState = resolveCanonicalConnectivityState(args);

  if (connectivityState.userForcedOfflineMode) {
    return {
      ...connectivityState,
      reason: 'forced_offline',
      label: 'Offline mode active',
    };
  }

  if (!connectivityState.networkOnline) {
    return {
      ...connectivityState,
      reason: 'network_offline',
      label: 'Team sync unavailable',
    };
  }

  if (!connectivityState.syncAvailable) {
    return {
      ...connectivityState,
      reason: 'sync_service_unavailable',
      label: 'Team sync unavailable',
    };
  }

  if (!args.snapshot.activeTeam) {
    return {
      ...connectivityState,
      reason: 'no_team',
      label: 'No active team',
    };
  }

  const memberCount = args.snapshot.members.length;
  return {
    ...connectivityState,
    reason: 'online_ready',
    label: `${args.snapshot.activeTeam.name} / ${memberCount} member${memberCount === 1 ? '' : 's'}`,
  };
}

export const teamStore = {
  getSnapshot(): TeamStoreSnapshot {
    return {
      activeTeam: snapshot.activeTeam ? { ...snapshot.activeTeam } : null,
      members: snapshot.members.map((member) => ({
        ...member,
        lastKnownLocation: member.lastKnownLocation ? { ...member.lastKnownLocation } : undefined,
      })),
      updatedAt: snapshot.updatedAt,
    };
  },

  subscribe(listener: TeamStoreListener): () => void {
    listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      listeners.delete(listener);
    };
  },

  replaceTeam(rawTeam: unknown, rawMembers: unknown[] = []): TeamStoreSnapshot {
    const team = normalizeTeam(rawTeam);
    if (!team) {
      snapshot = {
        activeTeam: null,
        members: [],
        updatedAt: new Date().toISOString(),
      };
      emit();
      return this.getSnapshot();
    }

    snapshot = {
      activeTeam: team,
      members: rawMembers
        .map((rawMember) => normalizeMember(rawMember, team.id))
        .filter((member): member is TeamMember => !!member),
      updatedAt: new Date().toISOString(),
    };
    emit();
    return this.getSnapshot();
  },

  createLocalTeam(params: {
    name: string;
    ownerId: string;
    ownerDisplayName?: string | null;
  }): TeamStoreSnapshot {
    const teamName = cleanString(params.name);
    const ownerId = cleanString(params.ownerId);
    if (!teamName || !ownerId) {
      return this.getSnapshot();
    }

    const team: Team = {
      id: createId('team'),
      name: teamName,
      ownerId,
    };
    snapshot = {
      activeTeam: team,
      members: [
        {
          id: createId('member'),
          teamId: team.id,
          userId: ownerId,
          role: 'owner',
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    emit();
    return this.getSnapshot();
  },

  clear(): void {
    snapshot = {
      activeTeam: null,
      members: [],
      updatedAt: new Date().toISOString(),
    };
    emit();
  },
};

import { getActiveVehicleContext } from './activeVehicleContext';
import {
  collectDispatchLinkedContextsFromStores,
  getDispatchContextActions,
  type DispatchContextAction,
} from './dispatchContextAdapter';
import {
  getInitialDispatchPingStatus,
  resolveDispatchSyncSnapshot,
  type DispatchSyncAdapterInput,
  type DispatchSyncSnapshot,
} from './dispatchSyncAdapter';
import { stageDispatchTimelineForExpeditionLog, type DispatchTimelineLogAdapterResult } from './dispatchTimelineLogAdapter';
import { dispatchPersistenceAdapter } from './dispatchPersistenceAdapter';
import type {
  DispatchAssignment,
  ExpeditionMemberEnriched,
  DispatchLinkedContext,
  DispatchPing,
  DispatchQueueItem,
  DispatchTeamMember,
  DispatchTimelineEvent,
} from './dispatchTypes';
import { dispatchStore } from './dispatchStore';
import { expeditionStateStore, type ExpeditionState } from './expeditionStateStore';
import { ecsPowerIntelligence } from './powerIntelligence';
import { resourceForecastEngine } from './resourceForecastEngine';
import { isDeployedEdgeFunction } from './supabase';

export type DispatchAdapterSource =
  | 'expeditionStateStore'
  | 'mock'
  | 'pinStore'
  | 'routeStore'
  | 'resourceForecastEngine'
  | 'vehicleStore'
  | 'powerIntelligence'
  | 'local';

export interface DispatchActiveExpeditionContext {
  id: string;
  title: string;
  status: 'standby' | 'active' | 'paused' | 'complete' | 'unknown';
  source: DispatchAdapterSource;
  vehicleId?: string | null;
  vehicleName?: string | null;
  startedAt?: string | null;
}

export interface DispatchTeamRosterLoadInput {
  currentUserId?: string | null;
  currentUserDisplayName?: string | null;
  allowMockFallback?: boolean;
}

export interface DispatchTeamRosterLoadResult {
  members: DispatchTeamMember[];
  source: DispatchAdapterSource | 'dispatchStore';
  error: string | null;
  usedFallback: boolean;
  isSoloMode: boolean;
}

export interface DispatchActiveExpeditionAdapter {
  getActiveExpedition(): DispatchActiveExpeditionContext;
  toLinkedContext(expedition: DispatchActiveExpeditionContext): DispatchLinkedContext;
}

export interface DispatchTeamRosterAdapter {
  listTeamMembers(expedition: DispatchActiveExpeditionContext): DispatchTeamMember[];
  loadTeamMembers(
    expedition: DispatchActiveExpeditionContext,
    input?: DispatchTeamRosterLoadInput,
  ): Promise<DispatchTeamRosterLoadResult>;
  listAssignments(expedition: DispatchActiveExpeditionContext): DispatchAssignment[];
}

export interface DispatchPingAdapter {
  listPings(expedition: DispatchActiveExpeditionContext): DispatchPing[];
  getInitialDeliveryStatus(snapshot: DispatchSyncSnapshot): DispatchPing['status'];
}

export interface DispatchQueueAdapter {
  listQueueItems(expedition: DispatchActiveExpeditionContext): DispatchQueueItem[];
}

export interface DispatchTimelineAdapter {
  listTimelineEvents(expedition: DispatchActiveExpeditionContext): DispatchTimelineEvent[];
  stageForExpeditionLog(event: DispatchTimelineEvent): DispatchTimelineLogAdapterResult;
}

export interface DispatchSyncStateAdapter {
  resolveSnapshot(input: DispatchSyncAdapterInput): DispatchSyncSnapshot;
}

export interface DispatchLinkedContextAdapter {
  listLinkedContexts(expedition: DispatchActiveExpeditionContext): DispatchLinkedContext[];
  getFallbackContext(expedition: DispatchActiveExpeditionContext): DispatchLinkedContext;
  listContextActions(context: DispatchLinkedContext): DispatchContextAction[];
}

export interface DispatchServiceAdapters {
  activeExpedition: DispatchActiveExpeditionAdapter;
  teamRoster: DispatchTeamRosterAdapter;
  pings: DispatchPingAdapter;
  queue: DispatchQueueAdapter;
  timeline: DispatchTimelineAdapter;
  sync: DispatchSyncStateAdapter;
  linkedContext: DispatchLinkedContextAdapter;
}

function expeditionStatusFromState(state: ExpeditionState): DispatchActiveExpeditionContext['status'] {
  return state;
}

function getActiveExpedition(): DispatchActiveExpeditionContext {
  try {
    const record = expeditionStateStore.getCurrentExpedition();
    if (record) {
      return {
        id: record.cloudSessionId ?? record.id,
        title: record.vehicleName ? `${record.vehicleName} Expedition` : 'Active Expedition',
        status: expeditionStatusFromState(record.state),
        source: 'expeditionStateStore',
        vehicleId: record.activeVehicleId,
        vehicleName: record.vehicleName,
        startedAt: record.startTime,
      };
    }
  } catch {
    // Safe adapter: keep Dispatch usable if expedition state hydration is incomplete.
  }

  return {
    id: 'local-expedition-channel',
    title: 'Expedition Channel',
    status: 'unknown',
    source: 'local',
    vehicleId: null,
    vehicleName: null,
    startedAt: null,
  };
}

function activeExpeditionToLinkedContext(expedition: DispatchActiveExpeditionContext): DispatchLinkedContext {
  return {
    id: `expedition-${expedition.id}`,
    type: 'expedition',
    title: expedition.title,
    subtitle: `${formatExpeditionStatus(expedition.status)} Expedition Channel`,
    metadata: {
      source: expedition.source,
      expeditionId: expedition.id,
      vehicleId: expedition.vehicleId ?? null,
      vehicleName: expedition.vehicleName ?? null,
      startedAt: expedition.startedAt ?? null,
    },
  };
}

function listTeamMembers(expedition: DispatchActiveExpeditionContext): DispatchTeamMember[] {
  void expedition;
  return [];
}

async function loadTeamMembers(
  expedition: DispatchActiveExpeditionContext,
  input: DispatchTeamRosterLoadInput = {},
): Promise<DispatchTeamRosterLoadResult> {
  if (isDeployedEdgeFunction('dispatch-feed')) {
    const { data, error } = await dispatchStore.listMembers(expedition.id);
    if (!error && data?.members) {
      const members = data.members.map((member) =>
        dispatchTeamMemberFromExpeditionMember(member, expedition, input.currentUserId),
      );
      if (members.length > 0) {
        return {
          members,
          source: 'dispatchStore',
          error: null,
          usedFallback: false,
          isSoloMode: members.length === 1,
        };
      }
    }
  }

  return {
    members: [],
    source: 'local',
    error: 'No expedition team roster is available for Dispatch.',
    usedFallback: false,
    isSoloMode: false,
  };
}

function dispatchTeamMemberFromExpeditionMember(
  member: ExpeditionMemberEnriched,
  expedition: DispatchActiveExpeditionContext,
  currentUserId?: string | null,
): DispatchTeamMember {
  const isCurrentUser = Boolean(currentUserId && member.user_id === currentUserId);
  const displayName = sanitizeRosterName(member.display_name) ?? getRoleBasedDisplayName(member.role, isCurrentUser);
  const lastSeenAt = member.left_at ?? member.joined_at ?? new Date().toISOString();

  return {
    id: member.user_id,
    displayName,
    callSign: getCallSign(displayName, member.role, isCurrentUser),
    role: member.role,
    status: member.left_at ? 'offline' : isCurrentUser ? 'connected' : 'needs_check_in',
    lastSeenAt,
    currentContext: activeExpeditionToLinkedContext(expedition),
    syncState: member.left_at ? 'queued' : isCurrentUser ? 'delivered' : 'sent',
    notes: isCurrentUser
      ? 'Current operator on Expedition Channel.'
      : 'Expedition member loaded from Dispatch membership.',
  };
}

function sanitizeRosterName(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getRoleBasedDisplayName(role: ExpeditionMemberEnriched['role'], isCurrentUser: boolean): string {
  if (isCurrentUser) return 'Current Operator';
  if (role === 'owner') return 'Expedition Lead';
  if (role === 'viewer') return 'Expedition Observer';
  return 'Expedition Member';
}

function getCallSign(
  displayName: string,
  role: ExpeditionMemberEnriched['role'],
  isCurrentUser: boolean,
): string {
  if (isCurrentUser) return 'Command';
  const firstToken = displayName.trim().split(/\s+/)[0];
  if (firstToken) return firstToken.slice(0, 14);
  if (role === 'owner') return 'Lead';
  if (role === 'viewer') return 'Observer';
  return 'Member';
}

function listAssignments(_expedition: DispatchActiveExpeditionContext): DispatchAssignment[] {
  return dispatchPersistenceAdapter.load(_expedition.id, getDispatchPersistenceDefaults()).assignments;
}

function listPings(_expedition: DispatchActiveExpeditionContext): DispatchPing[] {
  return dispatchPersistenceAdapter.load(_expedition.id, getDispatchPersistenceDefaults()).pings;
}

function listQueueItems(_expedition: DispatchActiveExpeditionContext): DispatchQueueItem[] {
  return dispatchPersistenceAdapter.load(_expedition.id, getDispatchPersistenceDefaults()).queueItems;
}

function listTimelineEvents(_expedition: DispatchActiveExpeditionContext): DispatchTimelineEvent[] {
  return dispatchPersistenceAdapter.load(_expedition.id, getDispatchPersistenceDefaults()).timelineEvents;
}

export function getDispatchPersistenceDefaults() {
  return {
    pings: [],
    queueItems: [],
    assignments: [],
    timelineEvents: [],
  };
}

function listLinkedContexts(expedition: DispatchActiveExpeditionContext): DispatchLinkedContext[] {
  const contexts: DispatchLinkedContext[] = [
    activeExpeditionToLinkedContext(expedition),
    ...collectDispatchLinkedContextsFromStores(),
  ];

  const resourceContext = buildResourceContext();
  if (resourceContext) contexts.push(resourceContext);

  const vehicleContext = buildVehicleContext(expedition);
  if (vehicleContext) contexts.push(vehicleContext);

  const powerContext = buildPowerContext();
  if (powerContext) contexts.push(powerContext);

  contexts.push({
    id: 'manual-dispatch-context',
    type: 'manual',
    title: 'Manual Dispatch Note',
    subtitle: 'Unlinked Expedition Channel context',
    metadata: { source: 'local' },
  });

  return dedupeContexts(contexts);
}

function getFallbackContext(expedition: DispatchActiveExpeditionContext): DispatchLinkedContext {
  return activeExpeditionToLinkedContext(expedition);
}

function buildResourceContext(): DispatchLinkedContext | null {
  try {
    const forecast = resourceForecastEngine.getCurrent();
    if (!forecast) return null;

    return {
      id: 'resource-live-forecast',
      type: 'resource',
      title: 'Resource Forecast',
      subtitle: `${forecast.sufficiencyLevel} / ${Math.round(forecast.routeMiles)} route mi`,
      metadata: {
        source: 'resourceForecastEngine',
        sufficiencyLevel: forecast.sufficiencyLevel,
        routeMiles: forecast.routeMiles,
        fuelStatus: forecast.fuel.status,
        waterStatus: forecast.water.status,
        powerStatus: forecast.power.status,
      },
    };
  } catch {
    return null;
  }
}

function buildVehicleContext(expedition: DispatchActiveExpeditionContext): DispatchLinkedContext | null {
  try {
    const vehicleContext = getActiveVehicleContext();
    const vehicle = vehicleContext.vehicle;
    if (!vehicleContext.hasVehicleContext && !expedition.vehicleName) return null;

    const labelParts = [
      vehicle?.make,
      vehicle?.model,
      vehicle?.year ? String(vehicle.year) : null,
    ].filter(Boolean);

    return {
      id: `vehicle-${vehicleContext.activeVehicleId ?? expedition.vehicleId ?? 'active'}`,
      type: 'vehicle',
      title: vehicle?.name ?? expedition.vehicleName ?? labelParts.join(' ') ?? 'Active Vehicle',
      subtitle: vehicleContext.zoneSummary || `${vehicleContext.loadoutItemCount} loadout items`,
      metadata: {
        source: 'vehicleStore',
        vehicleId: vehicleContext.activeVehicleId ?? expedition.vehicleId ?? null,
        loadoutItemCount: vehicleContext.loadoutItemCount,
        loadoutTotalWeightLbs: vehicleContext.loadoutTotalWeightLbs,
        resourceProfile: vehicleContext.resourceProfile,
      },
    };
  } catch {
    return null;
  }
}

function buildPowerContext(): DispatchLinkedContext | null {
  try {
    const snapshot = ecsPowerIntelligence.getSnapshot();
    if (!snapshot.available) return null;

    const batteryLabel =
      typeof snapshot.batteryPercent === 'number'
        ? `${Math.round(snapshot.batteryPercent)}%`
        : 'Battery unknown';

    return {
      id: 'power-live-intelligence',
      type: 'power',
      title: 'Power Intelligence',
      subtitle: `${batteryLabel} / ${snapshot.dataFreshness}`,
      metadata: {
        source: 'powerIntelligence',
        connectedDeviceCount: snapshot.connectedDeviceCount,
        reportingDeviceCount: snapshot.reportingDeviceCount,
        batteryPercent: snapshot.batteryPercent,
        dataFreshness: snapshot.dataFreshness,
        advisoryHeadline: snapshot.advisoryHeadline,
        sustainabilityRating: snapshot.sustainabilityRating,
      },
    };
  } catch {
    return null;
  }
}

function dedupeContexts(contexts: DispatchLinkedContext[]): DispatchLinkedContext[] {
  const seen = new Set<string>();
  const result: DispatchLinkedContext[] = [];

  for (const context of contexts) {
    const key = `${context.type}:${context.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(context);
  }

  return result;
}

function formatExpeditionStatus(status: DispatchActiveExpeditionContext['status']): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'complete':
      return 'Complete';
    case 'standby':
      return 'Standby';
    default:
      return 'Expedition';
  }
}

export function createDefaultDispatchAdapters(
  overrides: Partial<DispatchServiceAdapters> = {},
): DispatchServiceAdapters {
  const activeExpedition: DispatchActiveExpeditionAdapter = {
    getActiveExpedition,
    toLinkedContext: activeExpeditionToLinkedContext,
  };

  const adapters: DispatchServiceAdapters = {
    activeExpedition,
    teamRoster: {
      listTeamMembers,
      loadTeamMembers,
      listAssignments,
    },
    pings: {
      listPings,
      getInitialDeliveryStatus: getInitialDispatchPingStatus,
    },
    queue: {
      listQueueItems,
    },
    timeline: {
      listTimelineEvents,
      stageForExpeditionLog: stageDispatchTimelineForExpeditionLog,
    },
    sync: {
      resolveSnapshot: resolveDispatchSyncSnapshot,
    },
    linkedContext: {
      listLinkedContexts,
      getFallbackContext,
      listContextActions: getDispatchContextActions,
    },
  };

  return {
    ...adapters,
    ...overrides,
  };
}

export const defaultDispatchAdapters = createDefaultDispatchAdapters();

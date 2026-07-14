import { bailoutStore } from './bailoutStore';
import { dispatchEventStore } from './dispatchEventStore';
import { rememberDispatchAction } from './dispatchIntegrity';
import { dispatchNavigateContextAdapter } from './dispatchNavigateContextHandoff';
import type { DispatchPermissionSnapshot } from './dispatchPermissionAdapter';
import type {
  DispatchCoordinates,
  DispatchLinkedContext,
  DispatchLinkedContextType,
} from './dispatchTypes';
import { stageNavigationFlow } from './ecsNavigationFlow';
import { incidentRecoveryWorkflowStore } from './incidentRecoveryWorkflowStore';
import { pinStore } from './pinStore';
import { routeStore } from './routeStore';
import {
  normalizeDispatchReturnRoute,
  type OpenDispatchNavigateContextInput,
  type OpenDispatchNavigateContextResult,
} from './dispatchNavigateContextHandoff';
import {
  evaluateSourceTruthRef,
  sanitizeSourceTruthDisplayText,
  sanitizeSourceTruthRef,
  type SourceTruthAvailability,
  type SourceTruthConfidence,
  type SourceTruthCoverage,
  type SourceTruthFreshness,
  type SourceTruthPolicyKey,
  type SourceTruthRef,
} from './sourceTruth';
import { vehicleStore } from './vehicleStore';

export const MISSION_COMMAND_CONTEXT_SCHEMA_VERSION = 1 as const;

const SUPPORTED_CONTEXT_TYPES = new Set<DispatchLinkedContextType>([
  'expedition',
  'pin',
  'waypoint',
  'route_segment',
  'route',
  'camp',
  'rally',
  'bailout',
  'incident',
  'resource',
  'vehicle',
  'member',
  'power',
  'manual',
]);

const MAP_REQUIRED_TYPES = new Set<DispatchLinkedContextType>([
  'pin',
  'waypoint',
  'route_segment',
  'route',
  'camp',
  'rally',
  'bailout',
  'member',
]);

export type MissionCommandContextState =
  | 'ready'
  | 'stale'
  | 'restricted'
  | 'unavailable'
  | 'deleted'
  | 'invalid';

export type MissionCommandContextActionId =
  | 'inspect'
  | 'open_navigate'
  | 'open_vehicle'
  | 'open_camp'
  | 'open_incident'
  | 'return_to_command';

export type MissionCommandContextDestination =
  | 'command'
  | 'navigate'
  | 'fleet'
  | 'dispatch_incident';

export interface MissionCommandContextAction {
  id: MissionCommandContextActionId;
  label: string;
  destination: MissionCommandContextDestination;
}

export interface MissionCommandContextInspection {
  schemaVersion: 1;
  contextId: string;
  contextType: DispatchLinkedContextType;
  title: string;
  subtitle: string | null;
  state: MissionCommandContextState;
  stateLabel: string;
  sourceTruth: SourceTruthRef;
  sourceTruthPolicyKey: SourceTruthPolicyKey;
  freshness: SourceTruthFreshness;
  availability: SourceTruthAvailability;
  confidence: SourceTruthConfidence;
  coverage: SourceTruthCoverage;
  observedAt: string | null;
  ageMs: number | null;
  stale: boolean;
  hasLocation: boolean;
  warningCodes: string[];
  actions: MissionCommandContextAction[];
  primaryAction: MissionCommandContextAction;
  message: string;
}

export interface OpenMissionCommandContextInput {
  context: DispatchLinkedContext;
  commandId?: string | null;
  dispatchEventId?: string | null;
  sourceEntityId?: string | null;
  expeditionId?: string | null;
  permissions: DispatchPermissionSnapshot;
  currentMemberId?: string | null;
  returnRoute?: string | null;
  actionId?: MissionCommandContextActionId;
  rolloutEnabled?: boolean;
  mapContextEnabled?: boolean;
}

export type OpenMissionCommandContextStatus =
  | 'staged'
  | 'local_target'
  | 'inspected'
  | 'duplicate'
  | 'restricted'
  | 'permission_denied'
  | 'unavailable'
  | 'deleted'
  | 'invalid'
  | 'rollout_disabled'
  | 'error';

export interface OpenMissionCommandContextResult {
  status: OpenMissionCommandContextStatus;
  message: string;
  destination: MissionCommandContextDestination | null;
  route: '/navigate' | '/fleet' | null;
  targetId: string | null;
  inspection: MissionCommandContextInspection | null;
}

type LocalEntity = object | null;

export interface MissionCommandContextDependencies {
  getPinById?: (id: string) => LocalEntity;
  getRouteById?: (id: string) => LocalEntity;
  getActiveRoute?: () => LocalEntity;
  getBailoutById?: (id: string) => LocalEntity;
  getVehicleById?: (id: string) => LocalEntity;
  getDispatchEventById?: (id: string) => LocalEntity;
  getIncidentById?: (id: string) => LocalEntity;
  openNavigate?: (input: OpenDispatchNavigateContextInput) => Promise<OpenDispatchNavigateContextResult>;
  stageFlow?: typeof stageNavigationFlow;
  now?: () => number;
  recentActions?: Map<string, number>;
}

export interface MissionCommandContextAdapter {
  inspect: (
    context: DispatchLinkedContext,
    options?: Pick<OpenMissionCommandContextInput, 'permissions' | 'currentMemberId'>,
  ) => MissionCommandContextInspection;
  open: (input: OpenMissionCommandContextInput) => Promise<OpenMissionCommandContextResult>;
}

type ResolvedReference = {
  state: MissionCommandContextState;
  targetId: string | null;
  message: string | null;
};

const DEFAULT_DEPENDENCIES: Required<Omit<MissionCommandContextDependencies, 'recentActions'>> = {
  getPinById: pinStore.getById,
  getRouteById: routeStore.getById,
  getActiveRoute: routeStore.getActive,
  getBailoutById: bailoutStore.getById,
  getVehicleById: vehicleStore.getById,
  getDispatchEventById: (id) => dispatchEventStore.getSnapshot().find((event) => event.id === id) ?? null,
  getIncidentById: (id) => incidentRecoveryWorkflowStore.getSnapshot().find((incident) => incident.id === id) ?? null,
  openNavigate: (input) => dispatchNavigateContextAdapter.open(input),
  stageFlow: stageNavigationFlow,
  now: Date.now,
};

export function createMissionCommandContextAdapter(
  overrides: MissionCommandContextDependencies = {},
): MissionCommandContextAdapter {
  const dependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...overrides,
  };
  const recentActions = overrides.recentActions ?? new Map<string, number>();

  const inspect: MissionCommandContextAdapter['inspect'] = (context, options) => {
    const basic = validateBasicContext(context);
    if (!basic.ok) return invalidInspection(context, basic.message, dependencies.now());

    const permission = inspectPermission(context, options?.permissions, options?.currentMemberId);
    const source = evaluateContextSourceTruth(context, dependencies.now());
    const reference = resolveLocalReference(context, dependencies);
    const coordinate = normalizeCoordinates(context.coordinates);
    const hasResolvableMapReference = hasMapReference(context);
    const explicitUnavailable =
      context.sourceTruth?.origin === 'unavailable' ||
      context.sourceTruth?.availability === 'unavailable';

    let state: MissionCommandContextState = 'ready';
    let message: string | null = reference.message;
    if (!permission.allowed) {
      state = permission.restricted ? 'restricted' : 'unavailable';
      message = permission.message;
    } else if (reference.state === 'deleted') {
      state = 'deleted';
    } else if (reference.state === 'unavailable' || explicitUnavailable) {
      state = 'unavailable';
      message = message ?? `${basic.title} is unavailable.`;
    } else if (
      MAP_REQUIRED_TYPES.has(basic.contextType) &&
      !coordinate &&
      !hasResolvableMapReference
    ) {
      state = 'unavailable';
      message = `${basic.title} has no locally available map location.`;
    } else if (context.stale || source.freshness === 'stale' || source.freshness === 'expired') {
      state = 'stale';
      message = `${basic.title} is ${source.freshness}. Verify it before acting.`;
    }

    const actions = buildMissionCommandContextActions(context, {
      state,
      hasLocation: Boolean(coordinate || hasResolvableMapReference),
      incidentTargetId: reference.targetId,
    });
    const primaryAction = actions[0] ?? INSPECT_ACTION;

    return {
      schemaVersion: MISSION_COMMAND_CONTEXT_SCHEMA_VERSION,
      contextId: basic.contextId,
      contextType: basic.contextType,
      title: basic.title,
      subtitle: basic.subtitle,
      state,
      stateLabel: missionCommandContextStateLabel(state),
      sourceTruth: source.ref,
      sourceTruthPolicyKey: source.policyKey,
      freshness: source.freshness,
      availability: source.availability,
      confidence: source.confidence,
      coverage: source.coverage,
      observedAt: source.ref.observedAt ?? source.ref.fetchedAt ?? null,
      ageMs: source.ageMs,
      stale: state === 'stale',
      hasLocation: Boolean(coordinate || hasResolvableMapReference),
      warningCodes: uniqueStrings([
        ...source.warningCodes,
        state === 'deleted' ? 'mission_context_deleted' : null,
        state === 'restricted' ? 'mission_context_restricted' : null,
        state === 'unavailable' ? 'mission_context_unavailable' : null,
      ]),
      actions,
      primaryAction,
      message: message ?? contextReadyMessage(basic.title, primaryAction),
    };
  };

  return {
    inspect,
    async open(input) {
      if (input.rolloutEnabled === false) {
        return openResult('rollout_disabled', 'Mission Command context is not enabled.', null);
      }

      const viewPermission = input.permissions.can('view_dispatch');
      if (!viewPermission.allowed) {
        return openResult(
          'permission_denied',
          viewPermission.reason ?? input.permissions.disabledReason,
          null,
        );
      }

      const inspection = inspect(input.context, input);
      if (inspection.state === 'invalid') {
        return openResult('invalid', inspection.message, inspection);
      }
      if (inspection.state === 'restricted') {
        return openResult('restricted', inspection.message, inspection);
      }
      if (inspection.state === 'deleted') {
        return openResult('deleted', inspection.message, inspection);
      }
      if (inspection.state === 'unavailable' && inspection.actions.every((action) => action.id === 'inspect')) {
        return openResult('unavailable', inspection.message, inspection);
      }

      const action = input.actionId
        ? inspection.actions.find((candidate) => candidate.id === input.actionId)
        : inspection.primaryAction;
      if (!action) {
        return openResult('invalid', 'That linked-context action is not available.', inspection);
      }

      if (action.id === 'inspect') {
        return {
          ...openResult('inspected', inspection.message, inspection),
          destination: 'command',
        };
      }

      const actionKey = [
        'mission-command-context',
        input.expeditionId ?? 'local',
        input.commandId ?? input.dispatchEventId ?? input.sourceEntityId ?? 'source',
        inspection.contextId,
        action.id,
      ].join(':');
      if (!rememberDispatchAction({ idempotencyKey: actionKey, recentActions, now: dependencies.now() })) {
        return {
          ...openResult('duplicate', 'This linked context is already opening.', inspection),
          destination: action.destination,
        };
      }

      const returnRoute = normalizeDispatchReturnRoute(
        input.returnRoute ?? missionCommandReturnRoute(input.commandId),
      );

      try {
        if (action.id === 'open_vehicle') {
          const vehicleId = resolveVehicleId(input.context);
          if (!vehicleId || !dependencies.getVehicleById(vehicleId)) {
            recentActions.delete(actionKey);
            return openResult('deleted', 'The linked vehicle is no longer available.', inspection);
          }
          await dependencies.stageFlow({
            source: 'alert',
            target: 'fleet',
            intent: 'fleet_edit_vehicle',
            label: 'Mission Command Vehicle',
            message: `Opening ${inspection.title} in Fleet.`,
            context: {
              vehicleId,
              missionCommandId: safeId(input.commandId),
              linkedContextId: inspection.contextId,
              returnRoute,
            },
          });
          return {
            status: 'staged',
            message: `Opening ${inspection.title} in Fleet.`,
            destination: 'fleet',
            route: '/fleet',
            targetId: vehicleId,
            inspection,
          };
        }

        if (action.id === 'open_incident') {
          const incidentTarget = resolveIncidentTarget(input.context, dependencies);
          if (!incidentTarget) {
            recentActions.delete(actionKey);
            return openResult('deleted', 'The linked incident is no longer available.', inspection);
          }
          return {
            status: 'local_target',
            message: `Opening ${inspection.title} in Dispatch.`,
            destination: 'dispatch_incident',
            route: null,
            targetId: incidentTarget,
            inspection,
          };
        }

        if (action.id === 'return_to_command') {
          return {
            status: 'local_target',
            message: 'Returning to Mission Command.',
            destination: 'command',
            route: null,
            targetId: safeId(input.commandId),
            inspection,
          };
        }

        if (input.mapContextEnabled === false) {
          recentActions.delete(actionKey);
          return openResult('rollout_disabled', 'Map context integration is not enabled.', inspection);
        }

        const mapResult = await dependencies.openNavigate({
          context: normalizeContextForMapResolution(input.context),
          dispatchEventId: input.dispatchEventId ?? input.commandId,
          sourceEntityId: input.sourceEntityId ?? input.commandId,
          expeditionId: input.expeditionId,
          permissions: input.permissions,
          currentMemberId: input.currentMemberId,
          returnRoute,
          rolloutEnabled: true,
        });
        if (mapResult.status !== 'staged' && mapResult.status !== 'duplicate') {
          recentActions.delete(actionKey);
        }
        return {
          status: mapResult.status,
          message: mapResult.message,
          destination: action.destination,
          route: mapResult.status === 'staged' ? '/navigate' : null,
          targetId: inspection.contextId,
          inspection,
        };
      } catch (error) {
        recentActions.delete(actionKey);
        return openResult(
          'error',
          error instanceof Error ? error.message : 'Linked context could not be opened.',
          inspection,
        );
      }
    },
  };
}

export const missionCommandContextAdapter = createMissionCommandContextAdapter();

export function missionCommandReturnRoute(commandId?: string | null): string {
  const id = safeId(commandId);
  return id ? `/alert?missionCommandId=${encodeURIComponent(id)}` : '/alert';
}

export function getMissionCommandContextPrimaryActionLabel(
  context: DispatchLinkedContext,
): string {
  return buildMissionCommandContextActions(context, {
    state: context.restricted ? 'restricted' : context.stale ? 'stale' : 'ready',
    hasLocation: Boolean(normalizeCoordinates(context.coordinates) || hasMapReference(context)),
    incidentTargetId: context.type === 'incident' ? readIncidentReference(context) : null,
  })[0]?.label ?? INSPECT_ACTION.label;
}

export function missionCommandContextStateLabel(state: MissionCommandContextState): string {
  switch (state) {
    case 'ready': return 'Available';
    case 'stale': return 'Stale';
    case 'restricted': return 'Restricted';
    case 'unavailable': return 'Unavailable';
    case 'deleted': return 'Deleted';
    case 'invalid': return 'Invalid';
  }
}

const INSPECT_ACTION: MissionCommandContextAction = {
  id: 'inspect',
  label: 'Review Context',
  destination: 'command',
};

function buildMissionCommandContextActions(
  context: DispatchLinkedContext,
  input: {
    state: MissionCommandContextState;
    hasLocation: boolean;
    incidentTargetId: string | null;
  },
): MissionCommandContextAction[] {
  if (input.state === 'restricted' || input.state === 'invalid' || input.state === 'deleted') {
    return [];
  }
  if (input.state === 'unavailable') {
    return [INSPECT_ACTION];
  }
  if (context.type === 'vehicle') {
    return [{ id: 'open_vehicle', label: 'Open Vehicle', destination: 'fleet' }];
  }
  if (context.type === 'incident' && input.incidentTargetId) {
    return [
      { id: 'open_incident', label: 'Open Incident', destination: 'dispatch_incident' },
      ...(input.hasLocation
        ? [{ id: 'open_navigate', label: 'Open in Navigate', destination: 'navigate' } as const]
        : []),
    ];
  }
  if (context.type === 'camp' && input.hasLocation) {
    return [{ id: 'open_camp', label: 'Open Camp', destination: 'navigate' }];
  }
  if (input.hasLocation) {
    return [{ id: 'open_navigate', label: 'Open in Navigate', destination: 'navigate' }];
  }
  return [INSPECT_ACTION];
}

function validateBasicContext(context: DispatchLinkedContext | null | undefined):
  | { ok: true; contextId: string; contextType: DispatchLinkedContextType; title: string; subtitle: string | null }
  | { ok: false; message: string } {
  if (!context || typeof context !== 'object') return { ok: false, message: 'Linked context is invalid.' };
  const contextId = safeId(context.id);
  const title = safeLabel(context.title, 160);
  if (!contextId || !title || !SUPPORTED_CONTEXT_TYPES.has(context.type)) {
    return { ok: false, message: 'Linked context is invalid.' };
  }
  if (context.coordinates && !normalizeCoordinates(context.coordinates)) {
    return { ok: false, message: 'Linked context contains invalid coordinates.' };
  }
  return {
    ok: true,
    contextId,
    contextType: context.type,
    title,
    subtitle: safeLabel(context.subtitle, 220),
  };
}

function invalidInspection(
  context: DispatchLinkedContext | null | undefined,
  message: string,
  nowMs: number,
): MissionCommandContextInspection {
  const source = evaluateContextSourceTruth(context ?? invalidContext(), nowMs);
  return {
    schemaVersion: MISSION_COMMAND_CONTEXT_SCHEMA_VERSION,
    contextId: safeId(context?.id) ?? 'invalid-context',
    contextType: SUPPORTED_CONTEXT_TYPES.has(context?.type as DispatchLinkedContextType)
      ? context!.type
      : 'manual',
    title: safeLabel(context?.title, 160) ?? 'Invalid context',
    subtitle: null,
    state: 'invalid',
    stateLabel: 'Invalid',
    sourceTruth: source.ref,
    sourceTruthPolicyKey: source.policyKey,
    freshness: source.freshness,
    availability: source.availability,
    confidence: source.confidence,
    coverage: source.coverage,
    observedAt: source.ref.observedAt ?? null,
    ageMs: source.ageMs,
    stale: false,
    hasLocation: false,
    warningCodes: uniqueStrings([...source.warningCodes, 'mission_context_invalid']),
    actions: [],
    primaryAction: INSPECT_ACTION,
    message,
  };
}

function invalidContext(): DispatchLinkedContext {
  return { id: 'invalid-context', type: 'manual', title: 'Invalid context' };
}

function inspectPermission(
  context: DispatchLinkedContext,
  permissions?: DispatchPermissionSnapshot,
  currentMemberId?: string | null,
): { allowed: boolean; restricted: boolean; message: string | null } {
  if (
    context.restricted ||
    readBoolean(context.metadata?.restricted) ||
    readBoolean(context.metadata?.locationRestricted)
  ) {
    return { allowed: false, restricted: true, message: 'Linked context is restricted.' };
  }
  if (!permissions) return { allowed: true, restricted: false, message: null };
  const dispatch = permissions.can('view_dispatch');
  if (!dispatch.allowed) {
    return {
      allowed: false,
      restricted: false,
      message: dispatch.reason ?? permissions.disabledReason,
    };
  }
  if (requiresMemberLocationPermission(context, currentMemberId)) {
    const location = permissions.can('view_member_location');
    if (!location.allowed) {
      return {
        allowed: false,
        restricted: true,
        message: location.reason ?? 'Member location is restricted.',
      };
    }
  }
  return { allowed: true, restricted: false, message: null };
}

function resolveLocalReference(
  context: DispatchLinkedContext,
  dependencies: Required<Omit<MissionCommandContextDependencies, 'recentActions'>>,
): ResolvedReference {
  const metadata = context.metadata ?? {};
  const pinId = safeId(metadata.pinId);
  if (pinId && !dependencies.getPinById(pinId)) return deleted('pin', pinId);

  const bailoutId = safeId(metadata.bailoutId);
  if (bailoutId && !dependencies.getBailoutById(bailoutId)) return deleted('bailout point', bailoutId);

  if (context.type === 'route' || context.type === 'route_segment' || context.type === 'waypoint') {
    const routeId = resolveRouteId(context);
    if (routeId && !dependencies.getRouteById(routeId)) return deleted('route', routeId);
    if (!routeId && readBoolean(metadata.activeRoute) && !dependencies.getActiveRoute()) {
      return deleted('active route', null);
    }
  }

  if (context.type === 'vehicle') {
    const vehicleId = resolveVehicleId(context);
    if (!vehicleId || !dependencies.getVehicleById(vehicleId)) return deleted('vehicle', vehicleId);
    return { state: 'ready', targetId: vehicleId, message: null };
  }

  if (context.type === 'incident') {
    const eventId = safeId(metadata.dispatchEventId);
    if (eventId) {
      return dependencies.getDispatchEventById(eventId)
        ? { state: 'ready', targetId: eventId, message: null }
        : deleted('incident', eventId);
    }
    const incidentId = safeId(metadata.incidentId) ??
      (metadata.source === 'incidentRecoveryWorkflowStore' ? safeId(context.id) : null);
    if (incidentId && !dependencies.getIncidentById(incidentId)) return deleted('incident', incidentId);
    return { state: 'ready', targetId: null, message: null };
  }

  return { state: 'ready', targetId: null, message: null };
}

function deleted(label: string, targetId: string | null): ResolvedReference {
  return {
    state: 'deleted',
    targetId,
    message: `The linked ${label} is no longer available.`,
  };
}

function resolveIncidentTarget(
  context: DispatchLinkedContext,
  dependencies: Pick<
    Required<Omit<MissionCommandContextDependencies, 'recentActions'>>,
    'getDispatchEventById' | 'getIncidentById'
  >,
): string | null {
  const metadata = context.metadata ?? {};
  const eventId = safeId(metadata.dispatchEventId);
  if (eventId && dependencies.getDispatchEventById(eventId)) return eventId;
  return null;
}

function readIncidentReference(context: DispatchLinkedContext): string | null {
  const metadata = context.metadata ?? {};
  return safeId(metadata.dispatchEventId);
}

function resolveVehicleId(context: DispatchLinkedContext): string | null {
  return safeId(context.metadata?.vehicleId) ?? (context.type === 'vehicle' ? safeId(context.id) : null);
}

function resolveRouteId(context: DispatchLinkedContext): string | null {
  if (readBoolean(context.metadata?.activeRoute)) return null;
  const routeSegmentId = safeLabel(context.routeSegmentId, 160);
  return safeId(context.metadata?.routeId) ??
    (routeSegmentId?.includes(':') ? safeId(routeSegmentId.split(':', 1)[0]) : null) ??
    (context.type === 'route' ? safeId(context.id) : null);
}

function normalizeContextForMapResolution(context: DispatchLinkedContext): DispatchLinkedContext {
  if (context.type !== 'route') return context;
  if (safeId(context.metadata?.routeId) || readBoolean(context.metadata?.activeRoute)) return context;
  const routeId = safeId(context.id);
  return routeId
    ? { ...context, metadata: { ...(context.metadata ?? {}), routeId } }
    : context;
}

function hasMapReference(context: DispatchLinkedContext): boolean {
  const metadata = context.metadata ?? {};
  return Boolean(
    safeId(metadata.pinId) ||
    safeId(metadata.bailoutId) ||
    safeId(metadata.routeId) ||
    readBoolean(metadata.activeRoute) ||
    safeLabel(context.routeSegmentId, 160) ||
    (context.type === 'route' && safeId(context.id)),
  );
}

function requiresMemberLocationPermission(
  context: DispatchLinkedContext,
  currentMemberId?: string | null,
): boolean {
  const ownerMemberId = safeId(context.metadata?.locationOwnerMemberId);
  if (ownerMemberId && currentMemberId && ownerMemberId === currentMemberId) return false;
  return context.type === 'member' ||
    readBoolean(context.metadata?.requiresMemberLocationPermission) ||
    readBoolean(context.metadata?.locationRestricted);
}

function evaluateContextSourceTruth(context: DispatchLinkedContext, nowMs: number) {
  const policyKey = context.sourceTruthPolicyKey ?? inferPolicyKey(context.type);
  const fallbackOrigin = ['pin', 'rally', 'bailout', 'manual'].includes(context.type)
    ? 'manual' as const
    : 'inferred' as const;
  const ref = sanitizeSourceTruthRef(context.sourceTruth ?? {
    id: `mission-context-source-${safeId(context.id) ?? 'unknown'}`,
    origin: fallbackOrigin,
    role: 'primary',
    policyKey,
    authority: fallbackOrigin === 'manual' ? 'ECS User' : 'ECS',
    authorityKind: fallbackOrigin === 'manual' ? 'user' : 'ecs',
    observedAt: safeLabel(context.observedAt, 80),
    fetchedAt: null,
    expiresAt: null,
    confidence: fallbackOrigin === 'manual' ? 'medium' : 'unknown',
    coverage: context.coordinates ? 'complete' : 'unknown',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: [context.sourceTruth ? '' : 'missing_declared_source_truth'].filter(Boolean),
  });
  const evaluation = evaluateSourceTruthRef(ref, { policyKey, now: nowMs });
  return { ...evaluation, policyKey };
}

function inferPolicyKey(type: DispatchLinkedContextType): SourceTruthPolicyKey {
  switch (type) {
    case 'member': return 'convoy_member_location';
    case 'route':
    case 'route_segment':
    case 'waypoint': return 'offline_map_route_package';
    case 'camp': return 'camp_provider_availability';
    case 'incident': return 'condition_closure_advisory';
    case 'vehicle': return 'vehicle_profile';
    default: return 'manual_user_state';
  }
}

function normalizeCoordinates(value: DispatchCoordinates | undefined): DispatchCoordinates | null {
  if (!value) return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function contextReadyMessage(title: string, action: MissionCommandContextAction): string {
  if (action.id === 'inspect') return `${title} is available in the command details.`;
  return `${action.label}: ${title}.`;
}

function openResult(
  status: OpenMissionCommandContextStatus,
  message: string,
  inspection: MissionCommandContextInspection | null,
): OpenMissionCommandContextResult {
  return {
    status,
    message,
    destination: null,
    route: null,
    targetId: null,
    inspection,
  };
}

function safeId(value: unknown): string | null {
  const normalized = String(value ?? '').trim().slice(0, 160);
  if (!normalized || !/^[A-Za-z0-9._:-]+$/.test(normalized)) return null;
  return normalized;
}

function safeLabel(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const sanitized = sanitizeSourceTruthDisplayText(value);
  if (!sanitized) return null;
  const normalized = sanitized.trim().replace(/\s+/g, ' ').slice(0, maxLength);
  return normalized || null;
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

import { bailoutStore } from './bailoutStore';
import { stageNavigationFlow } from './ecsNavigationFlow';
import { rememberDispatchAction } from './dispatchIntegrity';
import type { DispatchEvent as DispatchLiveEvent } from './dispatchLiveEvents';
import {
  DISPATCH_LOCATION_RESTRICTED_COPY,
  type DispatchPermissionSnapshot,
} from './dispatchPermissionAdapter';
import type {
  DispatchCoordinates,
  DispatchLinkedContext,
  DispatchLinkedContextType,
} from './dispatchTypes';
import {
  clearNavigationHandoffPayload,
  saveNavigationHandoffPayload,
  type NavigationHandoffPayload,
} from './navigationHandoffStore';
import { pinStore } from './pinStore';
import { routeStore, type ImportedRoute } from './routeStore';
import { normalizeECSReturnRoute } from './routeManifest';
import {
  SOURCE_TRUTH_FRESHNESS_POLICIES,
  evaluateSourceTruthRef,
  sanitizeSourceTruthDisplayText,
  sanitizeSourceTruthRef,
  type SourceTruthAvailability,
  type SourceTruthConfidence,
  type SourceTruthCoverage,
  type SourceTruthFreshness,
  type SourceTruthOrigin,
  type SourceTruthPolicyKey,
  type SourceTruthRef,
} from './sourceTruth';
import { vehicleStore } from './vehicleStore';

const DEFAULT_RETURN_ROUTE = '/alert';
const DISPATCH_CONTEXT_PAYLOAD_VERSION = 1;
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
const LOCATION_REQUIRED_CONTEXT_TYPES = new Set<DispatchLinkedContextType>([
  'pin',
  'waypoint',
  'route_segment',
  'route',
  'camp',
  'rally',
  'bailout',
  'incident',
  'member',
]);

type DispatchContextStoreDependencies = {
  getPinById: typeof pinStore.getById;
  getRouteById: typeof routeStore.getById;
  getActiveRoute: typeof routeStore.getActive;
  getBailoutById: typeof bailoutStore.getById;
  getVehicleById: typeof vehicleStore.getById;
};

export interface DispatchNavigateContextTarget {
  version: 1;
  contextId: string;
  contextType: DispatchLinkedContextType;
  title: string;
  subtitle: string | null;
  dispatchEventId: string | null;
  sourceEntityId: string | null;
  expeditionId: string | null;
  routeSegmentId: string | null;
  returnRoute: string;
  coordinate: { lat: number; lng: number } | null;
  sourceTruth: SourceTruthRef;
  sourceTruthPolicyKey: SourceTruthPolicyKey;
  freshness: SourceTruthFreshness;
  availability: SourceTruthAvailability;
  confidence: SourceTruthConfidence;
  coverage: SourceTruthCoverage;
  ageMs: number | null;
  stale: boolean;
  warningCodes: string[];
  message: string;
}

export interface OpenDispatchNavigateContextInput {
  context: DispatchLinkedContext;
  dispatchEventId?: string | null;
  sourceEntityId?: string | null;
  expeditionId?: string | null;
  permissions: DispatchPermissionSnapshot;
  currentMemberId?: string | null;
  returnRoute?: string | null;
  rolloutEnabled?: boolean;
}

export type OpenDispatchNavigateContextStatus =
  | 'staged'
  | 'duplicate'
  | 'restricted'
  | 'permission_denied'
  | 'unavailable'
  | 'invalid'
  | 'rollout_disabled'
  | 'error';

export interface OpenDispatchNavigateContextResult {
  status: OpenDispatchNavigateContextStatus;
  message: string;
  target: DispatchNavigateContextTarget | null;
}

export interface DispatchNavigateContextAdapterDependencies
  extends Partial<DispatchContextStoreDependencies> {
  saveHandoff?: (payload: NavigationHandoffPayload) => Promise<void>;
  clearHandoff?: () => Promise<void>;
  stageFlow?: typeof stageNavigationFlow;
  now?: () => number;
  recentActions?: Map<string, number>;
}

export interface DispatchNavigateContextAdapter {
  open: (input: OpenDispatchNavigateContextInput) => Promise<OpenDispatchNavigateContextResult>;
}

type ContextResolution =
  | { ok: true; context: DispatchLinkedContext; coordinate: DispatchCoordinates | null }
  | { ok: false; status: 'invalid' | 'unavailable'; message: string };

const DEFAULT_DEPENDENCIES: DispatchContextStoreDependencies = {
  getPinById: pinStore.getById,
  getRouteById: routeStore.getById,
  getActiveRoute: routeStore.getActive,
  getBailoutById: bailoutStore.getById,
  getVehicleById: vehicleStore.getById,
};

export function createDispatchNavigateContextAdapter(
  overrides: DispatchNavigateContextAdapterDependencies = {},
): DispatchNavigateContextAdapter {
  const dependencies: DispatchContextStoreDependencies = {
    getPinById: overrides.getPinById ?? DEFAULT_DEPENDENCIES.getPinById,
    getRouteById: overrides.getRouteById ?? DEFAULT_DEPENDENCIES.getRouteById,
    getActiveRoute: overrides.getActiveRoute ?? DEFAULT_DEPENDENCIES.getActiveRoute,
    getBailoutById: overrides.getBailoutById ?? DEFAULT_DEPENDENCIES.getBailoutById,
    getVehicleById: overrides.getVehicleById ?? DEFAULT_DEPENDENCIES.getVehicleById,
  };
  const saveHandoff = overrides.saveHandoff ?? saveNavigationHandoffPayload;
  const clearHandoff = overrides.clearHandoff ?? clearNavigationHandoffPayload;
  const stageFlow = overrides.stageFlow ?? stageNavigationFlow;
  const now = overrides.now ?? Date.now;
  const recentActions = overrides.recentActions ?? new Map<string, number>();

  return {
    open: async (input) => {
      if (input.rolloutEnabled === false) {
        return result('rollout_disabled', 'Dispatch map context integration is paused.');
      }

      const viewPermission = input.permissions.can('view_dispatch');
      if (!viewPermission.allowed) {
        return result(
          'permission_denied',
          viewPermission.reason ?? input.permissions.disabledReason,
        );
      }

      if (requiresMemberLocationPermission(input.context, input.currentMemberId)) {
        const locationPermission = input.permissions.can('view_member_location');
        if (!locationPermission.allowed) {
          return result(
            'restricted',
            locationPermission.reason ?? DISPATCH_LOCATION_RESTRICTED_COPY,
          );
        }
      }

      if (input.context?.restricted === true || readBoolean(input.context?.metadata?.restricted)) {
        return result('restricted', DISPATCH_LOCATION_RESTRICTED_COPY);
      }

      const resolution = resolveDispatchLinkedContext(input.context, dependencies);
      if (!resolution.ok) {
        return result(resolution.status, resolution.message);
      }

      const target = createDispatchNavigateContextTarget({
        ...input,
        context: resolution.context,
        coordinate: resolution.coordinate,
        now: now(),
      });
      if (!target) {
        return result('invalid', 'Dispatch context is invalid.');
      }

      if (
        LOCATION_REQUIRED_CONTEXT_TYPES.has(target.contextType) &&
        (!target.coordinate || target.availability === 'unavailable')
      ) {
        return result(
          'unavailable',
          target.availability === 'unavailable'
            ? 'Dispatch context source is unavailable.'
            : 'Dispatch context has no usable map location.',
        );
      }

      const actionKey = [
        'dispatch-context',
        target.expeditionId ?? 'local',
        target.dispatchEventId ?? target.sourceEntityId ?? 'context',
        target.contextId,
      ].join(':');
      if (!rememberDispatchAction({ idempotencyKey: actionKey, recentActions, now: now() })) {
        return result('duplicate', 'Dispatch context is already opening.', target);
      }

      const payload = buildDispatchContextNavigationPayload(target, now());
      try {
        await saveHandoff(payload);
        await stageFlow({
          source: 'alert',
          target: 'navigate',
          intent: 'dispatch_context',
          label: 'Dispatch Context',
          message: target.message,
          context: {
            dispatchContextOnly: true,
            dispatchContextId: target.contextId,
            dispatchContextType: target.contextType,
            dispatchEventId: target.dispatchEventId,
            sourceEntityId: target.sourceEntityId,
            returnRoute: target.returnRoute,
          },
        });
        return result('staged', target.message, target);
      } catch (error) {
        recentActions.delete(actionKey);
        try {
          await clearHandoff();
        } catch {
          // The original staging error is the useful failure to report.
        }
        return result(
          'error',
          error instanceof Error ? error.message : 'Dispatch context could not be opened.',
        );
      }
    },
  };
}

export const dispatchNavigateContextAdapter = createDispatchNavigateContextAdapter();

export async function openDispatchContext(
  input: OpenDispatchNavigateContextInput,
): Promise<OpenDispatchNavigateContextResult> {
  return dispatchNavigateContextAdapter.open(input);
}

export function buildDispatchContextNavigationPayload(
  target: DispatchNavigateContextTarget,
  nowMs = Date.now(),
): NavigationHandoffPayload {
  const { coordinate: _coordinate, ageMs: _ageMs, ...serializableTarget } = target;
  void _coordinate;
  void _ageMs;

  return {
    id: `dispatch-context-${safeIdentifier(target.dispatchEventId ?? target.sourceEntityId ?? target.contextId)}`,
    source: 'dispatch',
    type: 'place',
    title: target.title,
    subtitle: target.subtitle,
    coordinate: target.coordinate,
    trailheadCoordinate: null,
    roadDestinationCoordinate: null,
    trailGeometry: [],
    trailLengthMiles: null,
    trailCategory: 'Dispatch Context',
    tripMode: null,
    routeSource: 'dispatch_context',
    requiresOnlineRouting: false,
    trailWaypoints: [],
    trailDecisionPoints: [],
    routeMetadata: {
      navigationMode: 'dispatch_context',
      dispatchContextOnly: true,
      dispatchContextTarget: serializableTarget,
    },
    landmarkMetadata: null,
    raw: null,
    createdAt: new Date(nowMs).toISOString(),
  };
}

export function isDispatchContextNavigationPayload(
  payload: NavigationHandoffPayload | null | undefined,
): boolean {
  const metadata = readRecord(payload?.routeMetadata);
  return (
    payload?.source === 'dispatch' &&
    payload.routeSource === 'dispatch_context' &&
    metadata?.dispatchContextOnly === true
  );
}

export function parseDispatchContextNavigationPayload(
  payload: NavigationHandoffPayload | null | undefined,
  nowMs = Date.now(),
): DispatchNavigateContextTarget | null {
  if (!payload || !isDispatchContextNavigationPayload(payload)) return null;
  const metadata = readRecord(payload.routeMetadata);
  const rawTarget = readRecord(metadata?.dispatchContextTarget);
  const contextType = readContextType(rawTarget?.contextType);
  const contextId = safeText(rawTarget?.contextId, 120);
  const title = safeText(rawTarget?.title ?? payload.title, 160);
  const rawSourceTruth = readRecord(rawTarget?.sourceTruth);
  if (!rawTarget || !contextType || !contextId || !title || !rawSourceTruth) return null;

  const sourceTruth = sanitizeSourceTruthRef(rawSourceTruth as unknown as SourceTruthRef);
  const policyKey = readPolicyKey(rawTarget.sourceTruthPolicyKey);
  const evaluation = evaluateSourceTruthRef(sourceTruth, { policyKey, now: nowMs });
  const explicitlyStale = rawTarget.stale === true;
  const freshness = explicitlyStale && evaluation.freshness !== 'unavailable'
    ? 'stale'
    : evaluation.freshness;
  const availability = explicitlyStale && evaluation.availability === 'usable'
    ? 'degraded'
    : evaluation.availability;
  const coordinate = normalizeNavigationCoordinate(payload.coordinate);
  const warningCodes = uniqueStrings([
    ...evaluation.warningCodes,
    ...(explicitlyStale ? ['dispatch_context_stale'] : []),
  ]);

  const target: DispatchNavigateContextTarget = {
    version: DISPATCH_CONTEXT_PAYLOAD_VERSION,
    contextId,
    contextType,
    title,
    subtitle: safeText(rawTarget.subtitle ?? payload.subtitle, 220),
    dispatchEventId: safeText(rawTarget.dispatchEventId, 120),
    sourceEntityId: safeText(rawTarget.sourceEntityId, 120),
    expeditionId: safeText(rawTarget.expeditionId, 120),
    routeSegmentId: safeText(rawTarget.routeSegmentId, 160),
    returnRoute: normalizeDispatchReturnRoute(rawTarget.returnRoute),
    coordinate,
    sourceTruth,
    sourceTruthPolicyKey: policyKey,
    freshness,
    availability,
    confidence: evaluation.confidence,
    coverage: evaluation.coverage,
    ageMs: evaluation.ageMs,
    stale: explicitlyStale || freshness === 'stale' || freshness === 'expired',
    warningCodes,
    message: '',
  };
  return { ...target, message: getDispatchContextTargetMessage(target) };
}

export function dispatchLinkedContextFromLiveEvent(
  event: DispatchLiveEvent,
): DispatchLinkedContext {
  const contextType = inferLiveEventContextType(event);
  const locationOwnerMemberId = event.createdBy?.userId ?? null;
  const observedAt = event.location?.timestamp ?? event.updatedAt ?? event.createdAt;
  const origin = inferLiveEventOrigin(event);
  const warningCodes = uniqueStrings([
    event.location?.source === 'last_known_gps' ? 'last_known_location' : null,
    event.syncState === 'queued' ? 'offline_sync_queued' : null,
    event.syncState === 'failed' ? 'offline_sync_failed' : null,
  ]);
  const routeReference = parseRouteSegmentReference(event.routeSegmentId);
  const sourceTruthPolicyKey = inferLiveEventPolicyKey(event, contextType);

  return {
    id: `dispatch-event-${event.id}`,
    type: contextType,
    title: safeText(event.title, 160) ?? 'Dispatch Context',
    subtitle: safeText(event.message, 220) ?? undefined,
    coordinates: event.location
      ? {
          latitude: event.location.latitude,
          longitude: event.location.longitude,
        }
      : undefined,
    routeSegmentId: event.routeSegmentId,
    observedAt,
    stale: event.location?.source === 'last_known_gps',
    sourceTruthPolicyKey,
    sourceTruth: {
      id: `dispatch-event-source-${event.id}`,
      origin,
      authority: 'ECS Dispatch',
      provider: safeText(event.source, 80),
      observedAt,
      fetchedAt: event.updatedAt ?? event.createdAt,
      expiresAt: null,
      confidence: origin === 'live' ? 'high' : origin === 'manual' || origin === 'cached' ? 'medium' : 'low',
      coverage: event.location ? 'complete' : 'partial',
      availability: 'usable',
      conflict: false,
      warningCodes,
    },
    metadata: {
      source: 'dispatchEventStore',
      dispatchEventId: event.id,
      routeId: routeReference?.routeId ?? null,
      segmentIndex: routeReference?.segmentIndex ?? null,
      locationOwnerMemberId,
      requiresMemberLocationPermission: event.source === 'team_member' && !!locationOwnerMemberId,
      locationSource: event.location?.source ?? null,
      eventType: event.type,
    },
  };
}

export function normalizeDispatchReturnRoute(value: unknown): string {
  const route = normalizeECSReturnRoute(value, DEFAULT_RETURN_ROUTE);
  const path = route.split('?', 1)[0];
  return path === '/alert' || path === '/expedition-dispatch' ? route : DEFAULT_RETURN_ROUTE;
}

function createDispatchNavigateContextTarget(
  input: OpenDispatchNavigateContextInput & {
    coordinate: DispatchCoordinates | null;
    now: number;
  },
): DispatchNavigateContextTarget | null {
  const contextType = readContextType(input.context.type);
  const contextId = safeText(input.context.id, 120);
  const title = safeText(input.context.title, 160);
  if (!contextType || !contextId || !title) return null;

  const sourceTruthPolicyKey = readPolicyKey(
    input.context.sourceTruthPolicyKey ?? inferContextPolicyKey(input.context),
  );
  const sourceTruth = getContextSourceTruth(input.context, sourceTruthPolicyKey);
  const evaluation = evaluateSourceTruthRef(sourceTruth, {
    policyKey: sourceTruthPolicyKey,
    now: input.now,
  });
  const metadata = readRecord(input.context.metadata);
  const explicitlyStale = input.context.stale === true || readBoolean(metadata?.stale);
  const freshness = explicitlyStale && evaluation.freshness !== 'unavailable'
    ? 'stale'
    : evaluation.freshness;
  const availability = explicitlyStale && evaluation.availability === 'usable'
    ? 'degraded'
    : evaluation.availability;
  const warningCodes = uniqueStrings([
    ...evaluation.warningCodes,
    ...(explicitlyStale ? ['dispatch_context_stale'] : []),
    ...(hasContextConflict(input.context) ? ['dispatch_context_conflict'] : []),
  ]);
  const target: DispatchNavigateContextTarget = {
    version: DISPATCH_CONTEXT_PAYLOAD_VERSION,
    contextId,
    contextType,
    title,
    subtitle: safeText(input.context.subtitle, 220),
    dispatchEventId: safeText(input.dispatchEventId ?? metadata?.dispatchEventId, 120),
    sourceEntityId: safeText(input.sourceEntityId, 120),
    expeditionId: safeText(input.expeditionId, 120),
    routeSegmentId: safeText(input.context.routeSegmentId, 160),
    returnRoute: normalizeDispatchReturnRoute(input.returnRoute),
    coordinate: normalizeNavigationCoordinate(input.coordinate),
    sourceTruth,
    sourceTruthPolicyKey,
    freshness,
    availability,
    confidence: evaluation.confidence,
    coverage: evaluation.coverage,
    ageMs: evaluation.ageMs,
    stale: explicitlyStale || freshness === 'stale' || freshness === 'expired',
    warningCodes,
    message: '',
  };
  return { ...target, message: getDispatchContextTargetMessage(target) };
}

function resolveDispatchLinkedContext(
  context: DispatchLinkedContext,
  dependencies: DispatchContextStoreDependencies,
): ContextResolution {
  const contextType = readContextType(context?.type);
  if (!context || !contextType || !safeText(context.id, 120) || !safeText(context.title, 160)) {
    return { ok: false, status: 'invalid', message: 'Dispatch context is invalid.' };
  }

  const metadata = readRecord(context.metadata);
  let coordinate = normalizeDispatchCoordinate(context.coordinates);
  const pinId = safeText(metadata?.pinId, 120);
  if (pinId) {
    const pin = dependencies.getPinById(pinId);
    if (!pin) return missingLocalTarget('pin');
    coordinate = normalizeDispatchCoordinate({ latitude: pin.lat, longitude: pin.lng });
  }

  const bailoutId = safeText(metadata?.bailoutId, 120);
  if (bailoutId) {
    const point = dependencies.getBailoutById(bailoutId);
    if (!point) return missingLocalTarget('bailout point');
    coordinate = normalizeDispatchCoordinate({ latitude: point.lat, longitude: point.lng });
  }

  const segmentReference = parseRouteSegmentReference(context.routeSegmentId);
  const routeId = safeText(metadata?.routeId, 120) ?? segmentReference?.routeId ?? null;
  if (routeId) {
    const route = dependencies.getRouteById(routeId);
    if (!route) return missingLocalTarget('route');
    const routeCoordinate = resolveRouteContextCoordinate(
      contextType,
      route,
      readInteger(metadata?.waypointIndex),
      readInteger(metadata?.segmentIndex) ?? segmentReference?.segmentIndex ?? null,
    );
    if (routeCoordinate) coordinate = routeCoordinate;
  } else if (contextType === 'route' && readBoolean(metadata?.activeRoute)) {
    const activeRoute = dependencies.getActiveRoute();
    if (!activeRoute) return missingLocalTarget('active route');
    coordinate = resolveRouteContextCoordinate('route', activeRoute, null, null);
  }

  const vehicleId = safeText(metadata?.vehicleId, 120);
  if (contextType === 'vehicle' && metadata?.source === 'vehicleStore' && vehicleId) {
    if (!dependencies.getVehicleById(vehicleId)) return missingLocalTarget('vehicle');
  }

  return { ok: true, context, coordinate };
}

function resolveRouteContextCoordinate(
  contextType: DispatchLinkedContextType,
  route: ImportedRoute,
  waypointIndex: number | null,
  segmentIndex: number | null,
): DispatchCoordinates | null {
  if (contextType === 'waypoint') {
    const waypoint = waypointIndex == null ? null : route.waypoints[waypointIndex];
    return waypoint
      ? normalizeDispatchCoordinate({ latitude: waypoint.lat, longitude: waypoint.lon })
      : null;
  }
  if (contextType === 'route_segment') {
    const point = segmentIndex == null ? null : route.segments[segmentIndex]?.points[0];
    return point
      ? normalizeDispatchCoordinate({ latitude: point.lat, longitude: point.lon })
      : null;
  }
  const waypoint = route.waypoints.find((candidate) => (
    Number.isFinite(candidate.lat) && Number.isFinite(candidate.lon)
  ));
  if (waypoint) {
    return normalizeDispatchCoordinate({ latitude: waypoint.lat, longitude: waypoint.lon });
  }
  const point = route.segments.flatMap((segment) => segment.points).find((candidate) => (
    Number.isFinite(candidate.lat) && Number.isFinite(candidate.lon)
  ));
  return point
    ? normalizeDispatchCoordinate({ latitude: point.lat, longitude: point.lon })
    : null;
}

function getContextSourceTruth(
  context: DispatchLinkedContext,
  policyKey: SourceTruthPolicyKey,
): SourceTruthRef {
  if (context.sourceTruth) {
    const sanitized = sanitizeSourceTruthRef(context.sourceTruth);
    if (hasContextConflict(context) && !sanitized.conflict) {
      return sanitizeSourceTruthRef({
        ...sanitized,
        conflict: true,
        warningCodes: [...sanitized.warningCodes, 'dispatch_context_conflict'],
      });
    }
    return sanitized;
  }

  const metadata = readRecord(context.metadata);
  const sourceLabel = safeText(metadata?.source, 80);
  const origin = inferContextOrigin(sourceLabel, context.type);
  const observedAt = safeText(
    context.observedAt ?? metadata?.observedAt ?? metadata?.updatedAt ?? metadata?.createdAt ?? metadata?.time,
    80,
  );
  return sanitizeSourceTruthRef({
    id: `dispatch-context-source-${context.id}`,
    origin,
    authority: 'ECS',
    provider: sourceLabel,
    observedAt,
    fetchedAt: safeText(metadata?.fetchedAt, 80),
    expiresAt: safeText(metadata?.expiresAt, 80),
    confidence: origin === 'live' ? 'high' : origin === 'manual' || origin === 'cached' ? 'medium' : 'low',
    coverage: context.coordinates ? 'complete' : 'unknown',
    availability: origin === 'unavailable' ? 'unavailable' : 'usable',
    conflict: hasContextConflict(context),
    warningCodes: uniqueStrings([
      context.stale ? 'dispatch_context_stale' : null,
      policyKey === 'manual_user_state' && origin === 'manual' ? 'manual_source' : null,
    ]),
  });
}

function getDispatchContextTargetMessage(target: DispatchNavigateContextTarget): string {
  if (!target.coordinate) {
    return `Opening ${target.title} in Navigate. No map location is attached.`;
  }
  if (target.availability === 'unavailable') {
    return `${target.title} is unavailable. Verify the source before acting.`;
  }
  if (target.stale) {
    return `Opening stale context for ${target.title}. Verify before acting.`;
  }
  if (target.sourceTruth.origin === 'cached') {
    return `Opening cached context for ${target.title}.`;
  }
  return `Opening ${target.title} in Navigate.`;
}

function requiresMemberLocationPermission(
  context: DispatchLinkedContext | null | undefined,
  currentMemberId?: string | null,
): boolean {
  if (!context) return false;
  const metadata = readRecord(context.metadata);
  const ownerMemberId = safeText(metadata?.locationOwnerMemberId, 120);
  const isOwnLocation = !!ownerMemberId && !!currentMemberId && ownerMemberId === currentMemberId;
  if (isOwnLocation) return false;
  return (
    context.type === 'member' ||
    readBoolean(metadata?.requiresMemberLocationPermission) ||
    readBoolean(metadata?.locationRestricted)
  );
}

function inferLiveEventContextType(event: DispatchLiveEvent): DispatchLinkedContextType {
  const text = `${event.title} ${event.message}`.toLowerCase();
  if (event.coordinationType === 'rally') return 'rally';
  if (event.routeSegmentId) return 'route_segment';
  if (event.type === 'route' && text.includes('rally')) return 'rally';
  if (event.type === 'route') return event.location ? 'route' : 'manual';
  if (event.type === 'vehicle') return 'vehicle';
  if (event.type === 'resources') return 'resource';
  if (event.type === 'team_ping' && event.location) return 'member';
  if ((event.type === 'recovery' || event.type === 'assistance') && event.location) return 'incident';
  if ((event.type === 'terrain' || event.type === 'weather') && event.location) return 'incident';
  return 'manual';
}

function inferLiveEventOrigin(event: DispatchLiveEvent): SourceTruthOrigin {
  if (event.location?.source === 'last_known_gps' || event.source === 'cache') return 'cached';
  if (event.coordinationType === 'rally') return 'manual';
  if (event.source === 'user_report') return 'manual';
  if (event.source === 'sync_state' || event.source === 'resource_store') return 'inferred';
  return 'live';
}

function inferLiveEventPolicyKey(
  event: DispatchLiveEvent,
  contextType: DispatchLinkedContextType,
): SourceTruthPolicyKey {
  if (contextType === 'member') return 'convoy_member_location';
  if (event.type === 'weather') return 'weather_observation';
  if (event.type === 'vehicle') return 'vehicle_telemetry';
  if (event.type === 'route' || contextType === 'route_segment') return 'condition_closure_advisory';
  if (contextType === 'incident') return 'condition_closure_advisory';
  if (contextType === 'manual') return 'manual_user_state';
  return inferPolicyKey(contextType);
}

function inferPolicyKey(type: DispatchLinkedContextType): SourceTruthPolicyKey {
  switch (type) {
    case 'member':
      return 'convoy_member_location';
    case 'route':
    case 'route_segment':
    case 'waypoint':
      return 'offline_map_route_package';
    case 'camp':
      return 'camp_provider_availability';
    case 'incident':
      return 'condition_closure_advisory';
    case 'vehicle':
      return 'vehicle_profile';
    case 'pin':
    case 'rally':
    case 'bailout':
    case 'resource':
    case 'power':
    case 'manual':
    case 'expedition':
    default:
      return 'manual_user_state';
  }
}

function inferContextPolicyKey(context: DispatchLinkedContext): SourceTruthPolicyKey {
  if (context.type === 'camp' && !context.sourceTruth) return 'manual_user_state';
  return inferPolicyKey(context.type);
}

function inferContextOrigin(
  source: string | null,
  type: DispatchLinkedContextType,
): SourceTruthOrigin {
  const normalized = String(source ?? '').trim().toLowerCase();
  if (normalized.includes('mock') || normalized.includes('demo') || normalized.includes('simulat')) return 'simulated';
  if (normalized.includes('cache') || normalized === 'routestore' || normalized.includes('last_known')) return 'cached';
  if (
    normalized === 'local' ||
    normalized === 'pinstore' ||
    normalized === 'bailoutstore' ||
    normalized === 'vehiclestore' ||
    normalized.includes('manual')
  ) return 'manual';
  if (
    normalized.includes('engine') ||
    normalized.includes('telemetry') ||
    normalized.includes('weather') ||
    normalized.includes('provider')
  ) return 'live';
  if (!normalized && type === 'manual') return 'manual';
  return 'inferred';
}

function hasContextConflict(context: DispatchLinkedContext): boolean {
  const metadata = readRecord(context.metadata);
  const conflictState = safeText(metadata?.conflictState, 40);
  return (
    context.sourceTruth?.conflict === true ||
    readBoolean(metadata?.conflict) ||
    (!!conflictState && conflictState !== 'none')
  );
}

function parseRouteSegmentReference(
  value: unknown,
): { routeId: string; segmentIndex: number } | null {
  const text = safeText(value, 200);
  if (!text) return null;
  const separator = text.lastIndexOf(':');
  if (separator <= 0) return null;
  const routeId = text.slice(0, separator).trim();
  const segmentIndex = Number(text.slice(separator + 1));
  return routeId && Number.isInteger(segmentIndex) && segmentIndex >= 0
    ? { routeId, segmentIndex }
    : null;
}

function normalizeDispatchCoordinate(value: unknown): DispatchCoordinates | null {
  const record = readRecord(value);
  if (!record) return null;
  const latitude = Number(record.latitude ?? record.lat);
  const longitude = Number(record.longitude ?? record.lng ?? record.lon);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) return null;
  return { latitude, longitude };
}

function normalizeNavigationCoordinate(value: unknown): { lat: number; lng: number } | null {
  const coordinate = normalizeDispatchCoordinate(value);
  return coordinate ? { lat: coordinate.latitude, lng: coordinate.longitude } : null;
}

function readContextType(value: unknown): DispatchLinkedContextType | null {
  const type = String(value ?? '') as DispatchLinkedContextType;
  return SUPPORTED_CONTEXT_TYPES.has(type) ? type : null;
}

function readPolicyKey(value: unknown): SourceTruthPolicyKey {
  const key = String(value ?? '') as SourceTruthPolicyKey;
  return Object.prototype.hasOwnProperty.call(SOURCE_TRUTH_FRESHNESS_POLICIES, key)
    ? key
    : 'default';
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readInteger(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function readBoolean(value: unknown): boolean {
  return value === true || String(value ?? '').trim().toLowerCase() === 'true';
}

function safeText(value: unknown, maxLength: number): string | null {
  return sanitizeSourceTruthDisplayText(value, maxLength);
}

function safeIdentifier(value: unknown): string {
  return String(value ?? 'context')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'context';
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)));
}

function missingLocalTarget(label: string): ContextResolution {
  return {
    ok: false,
    status: 'unavailable',
    message: `Dispatch ${label} is no longer available on this device.`,
  };
}

function result(
  status: OpenDispatchNavigateContextStatus,
  message: string,
  target: DispatchNavigateContextTarget | null = null,
): OpenDispatchNavigateContextResult {
  return { status, message, target };
}
